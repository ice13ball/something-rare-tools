// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A run that ends with pages it could not read, or records its source announced and did not deliver, is "finished" but never presents as
// complete: a notice that no cap can drop, and a RUN-INCOMPLETE row at the end of the fix list.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { gapText } from '../../src/core/collection/stop';
import { UI } from '../../src/core/i18n/ui';
import type { Lang } from '../../src/core/types';
import { dataciteMock, res, runnerDeps, virtualClock } from './helpers';

const LANGS: Lang[] = ['en', 'pl', 'de', 'fr'];

async function brokenBatchRun() {
  const clock = virtualClock();
  const text = Array.from({ length: 250 }, (_, i) => `10.5555/r${i}`).join('\n');
  let broken = true;
  const mock = dataciteMock({ total: 250, clock, override: (_n, u) => (broken && (u.searchParams.get('ids') ?? '').split(',').includes('10.5555/r5') ? res(503, '<html>busy</html>') : undefined) });
  const r = new CollectionRunner(runnerDeps(mock.net, clock));
  await r.start({ spec: { kind: 'dois', text }, lang: 'en', sample: false });
  await r.whenIdle();
  return { r, fix: () => (broken = false) };
}

describe('a run that finishes with pages it could not read does not present as complete', () => {
  it('names how many pages and records were not read and why, and ends the fix list with RUN-INCOMPLETE', async () => {
    const { r } = await brokenBatchRun();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.deferred).toBe(1);
    expect(p.resumable).toBe(true);
    const gap = p.notices.find((n) => n.code === 'unread-pages');
    expect(gap).toMatchObject({ params: { pages: 1, records: p.counts.states.throttled, reason: 'http-503' } });
    const lines = (await (await r.csvBlob()).text()).trimEnd().split('\n');
    expect(lines.filter((l) => l.includes('RUN-INCOMPLETE'))).toHaveLength(1);
    expect(lines[lines.length - 1]).toMatch(/^\(run\),,RUN-INCOMPLETE,info,.*NOT part of these results.*Resume the run\./);
  });

  it('says it in four languages, and a resumed run that reads the page drops the notice and the row', async () => {
    const { r, fix } = await brokenBatchRun();
    for (const lang of LANGS) {
      const text = gapText(r.progress().notices.find((n) => n.code === 'unread-pages')!, lang);
      expect(text, lang).not.toMatch(/\{\w+\}|http-503/);
      expect(text, lang).toMatch(/503|occup|busy|ausgelastet|zajęt|surcharg/i);
      expect(UI[lang]['collection.notice.unread-pages' as never]).toBeTruthy();
    }
    fix();
    await r.resume();
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.deferred).toBe(0);
    expect(p.notices.some((n) => n.code === 'unread-pages')).toBe(false);
    expect(await (await r.csvBlob()).text()).not.toContain('RUN-INCOMPLETE');
  });
});

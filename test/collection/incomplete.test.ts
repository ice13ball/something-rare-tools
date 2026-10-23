// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A run that ends with pages it could not read, or records its source announced and did not deliver, is "finished" but never presents as
// complete: a notice that no cap can drop, and a RUN-INCOMPLETE row at the end of the fix list.
import { describe, expect, it } from 'vitest';
import { CollectionRunner } from '../../src/core/collection/runner';
import { gapText } from '../../src/core/collection/stop';
import { UI, translate } from '../../src/core/i18n/ui';
import type { Lang } from '../../src/core/types';
import type { Net } from '../../src/core/collection/net';
import { MAX_NOTICES } from '../../src/core/collection/runner';
import { dataciteMock, json, res, runnerDeps, virtualClock } from './helpers';

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

const hit = (i: number) => ({ id: 1000 + i, doi: `10.5281/zenodo.${1000 + i}`, metadata: { title: `t${i}`, publication_date: '2020-01-01', license: { id: 'cc-by-4.0' }, resource_type: { type: 'dataset' } } });

async function zenodoRun(net: Net) {
  const r = new CollectionRunner(runnerDeps(net, virtualClock()));
  await r.start({ spec: { kind: 'zenodo', community: 'abc' }, lang: 'en', sample: false });
  await r.whenIdle();
  return r;
}

describe('a Zenodo slice that ends before its own total makes the run incomplete', () => {
  it('an empty page in the middle of a slice: a notice for the slice, a count of the missing records, and the RUN-INCOMPLETE row', async () => {
    const net = {
      async get(url: string) {
        const u = new URL(url);
        const size = Number(u.searchParams.get('size'));
        const page = Number(u.searchParams.get('page'));
        if (size === 1) return json({ hits: { hits: [hit(0)], total: 60 } });
        if (page === 2) return json({ hits: { hits: [], total: 60 } });
        const from = (page - 1) * size;
        const n = Math.max(0, Math.min(size, 60 - from));
        return json({ hits: { hits: Array.from({ length: n }, (_, k) => hit(from + k)), total: 60 } });
      },
      async csw() {
        throw new Error('no');
      },
    } as Net;
    const r = await zenodoRun(net);
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(25);
    expect(p.notices).toContainEqual({ code: 'zenodo-slice-short', params: { from: '…', to: '…', total: 60, seen: 25 } });
    expect(p.notices).toContainEqual({ code: 'records-missing', params: { missing: 35 } });
    const lines = (await (await r.csvBlob()).text()).trimEnd().split('\n');
    expect(lines[lines.length - 1]).toMatch(/^\(run\),,RUN-INCOMPLETE,info,.*NOT part of these results: 35\..*Run the review again later\./);
    for (const lang of LANGS) {
      for (const n of p.notices) expect(translate(lang, `collection.notice.${n.code}` as never, n.params), lang).not.toMatch(/\{\w+\}/);
    }
  });

  it('the end-of-run notice survives a notice list that is already full (many short slices)', async () => {
    const YEAR = 400;
    const net = {
      async get(url: string) {
        const u = new URL(url);
        const size = Number(u.searchParams.get('size'));
        const page = Number(u.searchParams.get('page'));
        const q = u.searchParams.get('q');
        const m = q ? /publication_date:\[(\d{4})-01-01 TO (\d{4})-12-31\]/.exec(q) : null;
        const total = !q ? 27 * YEAR : m && m[1] === m[2] && Number(m[1]) >= 2000 && Number(m[1]) <= 2026 ? YEAR : 0;
        if (size === 1) return json({ hits: { hits: total ? [hit(0)] : [], total } });
        // every year slice announces 400 records and delivers 25, then an empty page
        return json({ hits: { hits: page === 1 && total ? Array.from({ length: 25 }, (_, k) => hit(k)) : [], total } });
      },
      async csw() {
        throw new Error('no');
      },
    } as Net;
    const r = await zenodoRun(net);
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.notices.filter((n) => n.code === 'zenodo-slice-short').length).toBe(MAX_NOTICES - p.notices.filter((n) => n.code !== 'zenodo-slice-short' && n.code !== 'records-missing').length);
    expect(p.notices.find((n) => n.code === 'records-missing')).toMatchObject({ params: { missing: 27 * (YEAR - 25) } });
    expect(await (await r.csvBlob()).text()).toContain('RUN-INCOMPLETE');
  });
});

describe('counts in the notices never sit in front of a noun (no "1 pages")', () => {
  it('a single page, a single record: no number glued to a plural noun, in any language', () => {
    const notices = [
      { code: 'unread-pages', params: { pages: 1, records: 1, reason: 'http-503' } },
      { code: 'records-missing', params: { missing: 1 } },
      { code: 'zenodo-slice-short', params: { from: '2020-01-01', to: '2020-12-31', total: 1, seen: 0 } },
    ];
    for (const lang of LANGS) {
      for (const n of notices) expect(gapText(n, lang), `${lang} ${n.code}`).not.toMatch(/(^|\s)1 (pages?|records?|rekord\w*|stron\w*|Seiten?|Datens\w+|notices?|pages)\b/i);
      expect(translate(lang, 'collection.progress.deferred', { n: 1 }), lang).not.toMatch(/(^|\s)1 \p{L}/u);
    }
  });
});

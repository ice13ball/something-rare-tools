// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A record the rules cannot take is counted as not read; it does not end the run.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/collection/fixlist', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/collection/fixlist')>();
  return {
    ...orig,
    evaluateItem: (item: Parameters<typeof orig.evaluateItem>[0]) => {
      if (item.ref === 'DOI-BAD'.toLowerCase() || /r2$/.test(item.ref)) throw new TypeError('rules blew up on this record');
      return orig.evaluateItem(item);
    },
  };
});

import { CollectionRunner } from '../../src/core/collection/runner';
import { dataciteMock, runnerDeps, virtualClock } from './helpers';

describe('a record the rules cannot take', () => {
  it('is counted as "unsupported" with the reason check-failed, gets no finding, and the run finishes', async () => {
    const clock = virtualClock();
    const dc = dataciteMock({ total: 10 });
    const r = new CollectionRunner(runnerDeps(dc.net, clock));
    await r.start({ spec: { kind: 'datacite', by: 'client', id: 'some.client' }, lang: 'en', sample: false });
    await r.whenIdle();
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.records).toBe(10);
    expect(p.counts.states['unsupported-profile']).toBe(1);
    expect(p.counts.states.checked).toBe(9);
    expect(r.unread()).toEqual([{ ref: '10.5555/r2', state: 'unsupported-profile', reason: 'check-failed' }]);
    expect(p.stop).toBeUndefined();
  });
});

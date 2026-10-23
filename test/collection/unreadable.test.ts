// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// One record of a DataCite or Zenodo page that cannot be parsed is a record that was not read; the run goes on.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/metadata/datacite', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/metadata/datacite')>();
  return { ...orig, parseDataciteJson: (json: unknown, label: string) => (/r2$/.test(label) ? (() => { throw new TypeError('cannot parse'); })() : orig.parseDataciteJson(json, label)) };
});
vi.mock('../../src/core/metadata/zenodo', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/metadata/zenodo')>();
  return { ...orig, parseZenodoRecord: (json: unknown, label: string) => (/1002$/.test(label) ? (() => { throw new TypeError('cannot parse'); })() : orig.parseZenodoRecord(json, label)) };
});

import { CollectionRunner } from '../../src/core/collection/runner';
import type { Net } from '../../src/core/collection/net';
import { LANGS } from '../../src/core/types';
import { UI } from '../../src/core/i18n/ui';
import { dataciteMock, json, runnerDeps, virtualClock } from './helpers';

async function run(net: Net, spec: Parameters<CollectionRunner['start']>[0]['spec']) {
  const r = new CollectionRunner(runnerDeps(net, virtualClock()));
  await r.start({ spec, lang: 'en', sample: false });
  await r.whenIdle();
  return r;
}

describe('a record that cannot be parsed', () => {
  it('DataCite client list: counted as not read (unreadable-record), the other 9 are checked, the run finishes', async () => {
    const r = await run(dataciteMock({ total: 10 }).net, { kind: 'datacite', by: 'client', id: 'some.client' });
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(9);
    expect(p.counts.states['unsupported-profile']).toBe(1);
    expect(r.unread()).toEqual([{ ref: '10.5555/r2', state: 'unsupported-profile', reason: 'unreadable-record' }]);
  });

  it('DOI list: the DOI DataCite did answer is "not read", not "not in DataCite"', async () => {
    const r = await run(dataciteMock({ total: 10 }).net, { kind: 'dois', text: '10.5555/r1 10.5555/r2 10.5555/r3' });
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(2);
    expect(p.counts.states['unsupported-profile']).toBe(1);
    expect(p.counts.states['not-in-datacite']).toBe(0);
  });

  it('Zenodo: counted as not read, the other records of the page are checked', async () => {
    const hit = (i: number) => ({ id: 1000 + i, doi: `10.5281/zenodo.${1000 + i}`, metadata: { title: `t${i}`, publication_date: '2020-01-01', license: { id: 'cc-by-4.0' }, resource_type: { type: 'dataset' } } });
    const net = {
      async get(url: string) {
        const u = new URL(url);
        if (u.searchParams.get('size') === '1') return json({ hits: { hits: [hit(0)], total: 5 } });
        return json({ hits: { hits: [0, 1, 2, 3, 4].map(hit), total: 5 } });
      },
      async csw() {
        throw new Error('no');
      },
    } as Net;
    const r = await run(net, { kind: 'zenodo', community: 'abc' });
    const p = r.progress();
    expect(p.status).toBe('finished');
    expect(p.counts.states.checked).toBe(4);
    expect(p.counts.states['unsupported-profile']).toBe(1);
    expect(r.unread()[0]).toMatchObject({ reason: 'unreadable-record' });
  });

  it('the reason exists in four languages', () => {
    for (const lang of LANGS) expect(UI[lang]['collection.reason.unreadable-record' as never], lang).toBeTruthy();
  });
});

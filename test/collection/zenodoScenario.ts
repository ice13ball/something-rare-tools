// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// One mocked Zenodo community that needs every kind of split, and the numbers a run over it must give. The reference values in
// zenodoplan.test.ts were taken from the up-front planner (commit d453b59) on exactly this community.
import { createHash } from 'node:crypto';
import { CollectionRunner } from '../../src/core/collection/runner';
import type { Net } from '../../src/core/collection/net';
import { rec, runnerDeps, virtualClock, zenodoMock, type Rec } from './helpers';

/**
 * 2019: 10 400 records on March days 1-20 (a year AND a month above the window: months, then days) plus 40 dated "2019" and 15 dated "2019-03"
 * (partial dates: the year's and the month's remainder slices); 2020: 1 700; 2021: 300 (its last slice delivers 3 fewer than it announces:
 * see `shortened`); 1995: 5 (the slice before the first year).
 */
export function mixedCommunity(): Rec[] {
  const recs: Rec[] = [];
  let id = 1;
  for (let i = 0; i < 10_400; i++) recs.push(rec(id++, `2019-03-${String((i % 20) + 1).padStart(2, '0')}`, i % 10 === 0 ? null : 'cc-by-4.0'));
  for (let i = 0; i < 40; i++) recs.push({ ...rec(id++, '2019'), span: ['2019-01-01', '2019-12-31'] });
  for (let i = 0; i < 15; i++) recs.push({ ...rec(id++, '2019-03'), span: ['2019-03-01', '2019-03-31'] });
  for (let i = 0; i < 1700; i++) recs.push(rec(id++, `2020-0${(i % 9) + 1}-10`));
  for (let i = 0; i < 300; i++) recs.push(rec(id++, `2021-06-0${(i % 9) + 1}`));
  for (let i = 0; i < 5; i++) recs.push(rec(id++, '1995-01-01'));
  return recs;
}

/** 2021: 10 300 dated records over twelve months, 30 dated "2021" and 20 dated "2021-03" indexed as ranges that every query they touch matches (repeats); 2020: 100. */
export function touchingCommunity(): Rec[] {
  const recs: Rec[] = [];
  let n = 1;
  for (let i = 0; i < 10_300; i++) recs.push(rec(n++, `2021-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`));
  for (let i = 0; i < 30; i++) recs.push({ ...rec(n++, '2021'), span: ['2021-01-01', '2021-12-31'] });
  for (let i = 0; i < 20; i++) recs.push({ ...rec(n++, '2021-03'), span: ['2021-03-01', '2021-03-31'] });
  for (let i = 0; i < 100; i++) recs.push(rec(n++, '2020-02-02'));
  return recs;
}

/** The 2021 list ends 3 records early (records deleted between the count and the last page). */
export function shortened(net: Net): Net {
  return {
    ...net,
    get: async (url, accept) => {
      const out = await net.get(url, accept);
      const u = new URL(url);
      if (out.status !== 200 || u.searchParams.get('size') !== '25' || !(u.searchParams.get('q') ?? '').includes('2021-01-01 TO 2021-12-31') || u.searchParams.get('page') !== '12') return out;
      const body = JSON.parse(out.text) as { hits: { hits: unknown[] } };
      body.hits.hits = body.hits.hits.slice(0, -3);
      return { ...out, text: JSON.stringify(body) };
    },
  };
}

export interface Summary {
  status: string;
  records: number;
  states: unknown;
  rules: unknown;
  withFindings: number;
  duplicates: number;
  notices: string[];
  csvRows: number;
  csvSha: string;
}

export async function summarize(r: CollectionRunner): Promise<Summary> {
  const p = r.progress();
  const csv = await (await r.csvBlob()).text();
  return {
    status: p.status,
    records: p.counts.records,
    states: p.counts.states,
    rules: p.counts.rules,
    withFindings: p.counts.withFindings,
    duplicates: p.counts.duplicatesInBatch,
    notices: p.notices.map((n) => n.code).filter((c) => c !== 'split-by-date').sort(),
    csvRows: p.csv.rows,
    csvSha: createHash('sha256').update(csv).digest('hex').slice(0, 16),
  };
}

/** A whole uninterrupted run; `firstPage` = how many requests were made before the first page of records was asked for. */
export async function runCommunity(recs: Rec[], opts: { within: boolean; short: boolean }): Promise<{ summary: Summary; firstPage: number; requests: number }> {
  const clock = virtualClock();
  const z = zenodoMock(recs, clock, { within: opts.within });
  const inner = opts.short ? shortened(z.net) : z.net;
  let firstPage = 0;
  let n = 0;
  const net: Net = {
    ...inner,
    get: async (url, a) => {
      n += 1;
      if (!firstPage && new URL(url).searchParams.get('size') === '25') firstPage = n;
      return inner.get(url, a);
    },
  };
  const r = new CollectionRunner(runnerDeps(net, clock, { year: () => 2022 }));
  await r.start({ spec: { kind: 'zenodo', community: 'mixed' }, lang: 'en', sample: false });
  await r.whenIdle();
  return { summary: await summarize(r), firstPage, requests: n };
}

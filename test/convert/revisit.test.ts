// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A station visited on several dates in an ordinary (non-profile) sheet: a code reused on every visit is one sample per visit (CONV-ID-REVISIT), with the date in its ID in the shape of the
// profile levels; identical rows stay a real duplicate; every ID that did not collide is exactly as it was. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { visitLevel, visitQualifier } from '../../src/core/convert/ids';
import { policyOf } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const WIDE = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus'];
const LONG = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
const wide = (rows: Cell[][], header = WIDE, options = {}) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' } })], options });
const long = (rows: Cell[][], header = LONG) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, shape: 'long' })] });
const samples = (r: ReturnType<typeof convert>) => r.events.filter((e) => e.eventType === 'sample').map((e) => e.id);

describe('visitLevel and visitQualifier', () => {
  const k = (date: string, time = '', depth = '') => ({ date, time, depth });
  it('the fewest parts that tell the visits apart; one visit, or identical rows, is level 0', () => {
    expect(visitLevel([k('2020-01-01'), k('2020-02-01')], 3)).toBe(1);
    expect(visitLevel([k('2020-01-01', '08:00'), k('2020-01-01', '14:00')], 3)).toBe(2);
    expect(visitLevel([k('2020-01-01', '', '5'), k('2020-01-01', '', '10')], 3)).toBe(3);
    expect(visitLevel([k('2020-01-01', '', '5'), k('2020-01-01', '', '10')], 2)).toBe(0);
    expect(visitLevel([k('2020-01-01'), k('2020-01-01')], 3)).toBe(0);
    expect(visitLevel([k('2020-01-01')], 3)).toBe(0);
  });
  it('the qualifier is the date, then the time after a T, then the depth with m', () => {
    expect(visitQualifier(k('2020-01-01', '08:00', '5'), 1)).toBe('2020-01-01');
    expect(visitQualifier(k('2020-01-01', '08:00', '5'), 2)).toBe('2020-01-01T08:00');
    expect(visitQualifier(k('2020-01-01', '08:00', '5'), 3)).toBe('2020-01-01T08:00:5m');
    expect(visitQualifier(k('', '', ''), 3)).toBe('');
  });
});

describe('the same station on 3 dates with the same code', () => {
  const rows: Cell[][] = [['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', '2020-02-01', 1, 2, 5], ['S1', '1', '2020-03-01', 1, 2, 6]];

  it('wide: 3 distinct samples under the station, distinct IDs, no CONV-ID-DUPLICATE, said once', () => {
    const r = wide(rows);
    expect(samples(r)).toEqual(['S1:2020-01-01:1', 'S1:2020-02-01:1', 'S1:2020-03-01:1']);
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.parentId)).toEqual(['S1', 'S1', 'S1']);
    expect(r.occurrences.map((o) => o.id)).toEqual(['S1:2020-01-01:1:Calanus finmarchicus', 'S1:2020-02-01:1:Calanus finmarchicus', 'S1:2020-03-01:1:Calanus finmarchicus']);
    expect(find(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
    const v = find(r.findings, 'CONV-ID-REVISIT');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'warning', lines: [2, 3, 4], value: 'S1:2020-01-01:1', params: { count: 1, by: 'date' } });
    expect(policyOf(v[0])).toBe('accept');
  });

  it('with the station prefix the IDs are the same (the station is already in them)', () => {
    expect(samples(wide(rows, WIDE, { prefixStation: true }))).toEqual(['S1:2020-01-01:1', 'S1:2020-02-01:1', 'S1:2020-03-01:1']);
  });

  it('long: the rows of each visit are one sample each, not a conflict', () => {
    const r = long([
      ['S1', '1', '2020-01-01', 1, 2, 'Calanus finmarchicus', 4],
      ['S1', '1', '2020-01-01', 1, 2, 'Oithona similis', 2],
      ['S1', '1', '2020-02-01', 1, 2, 'Calanus finmarchicus', 5],
    ]);
    expect(samples(r)).toEqual(['S1:2020-01-01:1', 'S1:2020-02-01:1']);
    expect(r.occurrences.map((o) => o.id)).toEqual(['S1:2020-01-01:1:Calanus finmarchicus', 'S1:2020-01-01:1:Oithona similis', 'S1:2020-02-01:1:Calanus finmarchicus']);
    expect(find(r.findings, 'CONV-SAMPLE-CONFLICT')).toEqual([]);
    expect(find(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });

  it('the same date twice: a time of day tells the visits apart, then (wide) a depth', () => {
    const header = ['Station', 'Sample', 'Date', 'Time', 'Latitude', 'Longitude', 'Calanus finmarchicus'];
    const t = wide([['S1', '1', '2020-01-01', '08:00', 1, 2, 4], ['S1', '1', '2020-01-01', '14:00', 1, 2, 5]], header);
    expect(samples(t)).toEqual(['S1:2020-01-01T08:00:1', 'S1:2020-01-01T14:00:1']);
    expect(find(t.findings, 'CONV-ID-REVISIT')[0].params.by).toBe('date, time');
    const d = wide([['S1', '1', '2020-01-01', 1, 2, 4, 5], ['S1', '1', '2020-01-01', 1, 2, 5, 10]], ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Depth [m]']);
    expect(samples(d)).toEqual(['S1:2020-01-01:5m:1', 'S1:2020-01-01:10m:1']);
    expect(find(d.findings, 'CONV-ID-REVISIT')[0].params.by).toBe('date, time, depth');
  });
});

describe('what stays as it was', () => {
  it('the same station, same date, same code twice is still a real duplicate', () => {
    const r = wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', '2020-01-01', 1, 2, 5]]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    expect(samples(r)).toEqual(['1']);
  });

  it('two revisits plus an identical repeat of one of them: the repeat is still a duplicate', () => {
    const r = wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', '2020-02-01', 1, 2, 5], ['S1', '1', '2020-02-01', 1, 2, 6]]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')[0].value).toBe('S1:2020-02-01:1');
  });

  it('the same code at two stations is not a revisit: the duplicate stays, and the station prefix is the way out', () => {
    const rows: Cell[][] = [['S1', '1', '2020-01-01', 1, 2, 4], ['S2', '1', '2020-02-01', 3, 4, 5]];
    expect(find(wide(rows).blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
    expect(samples(wide(rows, WIDE, { prefixStation: true }))).toEqual(['S1:1', 'S2:1']);
  });

  it('IDs of a sheet that does not collide are exactly as before (pinned)', () => {
    const r = wide([['S1', 'a', '2020-01-01', 1, 2, 4], ['S1', 'b', '2020-02-01', 1, 2, 5], ['S2', 'a2', '2020-01-01', 3, 4, 6]]);
    expect(r.events.map((e) => e.id)).toEqual(['S1', 'S2', 'a', 'b', 'a2']);
    expect(r.occurrences.map((o) => o.id)).toEqual(['a:Calanus finmarchicus', 'b:Calanus finmarchicus', 'a2:Calanus finmarchicus']);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    const p = wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S2', '1', '2020-01-01', 3, 4, 6]], WIDE, { prefixStation: true });
    expect(p.events.map((e) => e.id)).toEqual(['S1', 'S2', 'S1:1', 'S2:1']);
    const l = long([['S1', 'x', '2020-01-01', 1, 2, 'Calanus finmarchicus', 4], ['S1', 'x', '2020-01-01', 1, 2, 'Oithona similis', 2]]);
    expect(l.events.map((e) => e.id)).toEqual(['S1', 'x']);
    expect(l.occurrences.map((o) => o.id)).toEqual(['x:Calanus finmarchicus', 'x:Oithona similis']);
  });

  it('a code that is used once keeps its plain ID next to a code that is revisited', () => {
    const r = wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', '2020-02-01', 1, 2, 5], ['S1', 'solo', '2020-02-01', 1, 2, 6]]);
    expect(samples(r)).toEqual(['S1:2020-01-01:1', 'S1:2020-02-01:1', 'solo']);
  });

  it('a long sheet whose rows of one sample differ in depth still conflicts (depth is never used to split a long sample)', () => {
    const r = long([['S1', '1', '2020-01-01', 1, 2, 'Calanus finmarchicus', 4, 5], ['S1', '1', '2020-01-01', 1, 2, 'Oithona similis', 2, 10]], [...LONG, 'Depth [m]']);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    expect(find(r.blocking, 'CONV-SAMPLE-CONFLICT')).toHaveLength(1);
  });
});

describe('a blank part is no visit of its own', () => {
  it('long: a sample whose second row has blank date and position (merged cells) is one sample and still conflicts', () => {
    const r = long([
      ['S', 'S-1', '2020-01-01', 54, 18, 'Calanus finmarchicus', 3],
      ['S', 'S-1', null, null, null, 'Oithona similis', 4],
    ]);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    expect(find(r.blocking, 'CONV-SAMPLE-CONFLICT').length).toBeGreaterThan(0);
    expect(samples(r)).toEqual(['S-1']);
  });

  it('wide: the same code twice, one row undated, is a duplicate and not two visits', () => {
    const r = wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', null, 1, 2, 5]]);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
  });

  it('a time that one row has and another lacks does not split either', () => {
    const header = ['Station', 'Sample', 'Date', 'Time', 'Latitude', 'Longitude', 'Calanus finmarchicus'];
    const r = wide([['S1', '1', '2020-01-01', '08:00', 1, 2, 4], ['S1', '1', '2020-01-01', null, 1, 2, 5]], header);
    expect(find(r.findings, 'CONV-ID-REVISIT')).toEqual([]);
    expect(find(r.blocking, 'CONV-ID-DUPLICATE')).toHaveLength(1);
  });
});

describe('a date range is a visit value, and a presence list goes through the same logic', () => {
  it('two different intervals of one code are two visits; the interval text is the key', () => {
    const r = wide([['S1', '1', '2020-01-01/2020-01-03', 1, 2, 4], ['S1', '1', '2020-02-01/2020-02-03', 1, 2, 5]]);
    expect(samples(r)).toEqual(['S1:2020-01-01/2020-01-03:1', 'S1:2020-02-01/2020-02-03:1']);
    expect(find(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });

  it('a long presence list with the same code on two dates gives two samples, not a conflict', () => {
    const r = convert({ sheets: [sheetInput(fileOf(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species'], [['S1', '1', '2020-01-01', 1, 2, 'Calanus finmarchicus'], ['S1', '1', '2020-02-01', 1, 2, 'Calanus finmarchicus']]), { shape: 'long', presenceOnly: true })] });
    expect(samples(r)).toEqual(['S1:2020-01-01:1', 'S1:2020-02-01:1']);
    expect(find(r.findings, 'CONV-SAMPLE-CONFLICT')).toEqual([]);
    expect(find(r.findings, 'CONV-ID-DUPLICATE')).toEqual([]);
  });
});

describe('CONV-ID-REVISIT texts', () => {
  it('four languages, the plural agrees, the parts are named in the language', () => {
    const f = find(wide([['S1', '1', '2020-01-01', 1, 2, 4], ['S1', '1', '2020-02-01', 1, 2, 5]]).findings, 'CONV-ID-REVISIT')[0];
    expect(renderConvertPlain(f, 'en')).toMatch(/^1 sample code is used for more than one visit.*holds the date\./);
    expect(renderConvertPlain(f, 'pl')).toMatch(/^1 kod próbki jest użyty.*zawiera: data\./);
    expect(renderConvertPlain(f, 'de')).toMatch(/^1 Probencode wird.*enthält: Datum\./);
    expect(renderConvertPlain(f, 'fr')).toMatch(/^1 code d'échantillon sert.*contient : date\./);
    for (const [n, pl] of [[2, /^2 kody próbek są użyte/], [5, /^5 kodów próbek jest użytych/], [22, /^22 kody próbek są użyte/]] as const) expect(renderConvertPlain({ ...f, params: { ...f.params, count: n } }, 'pl')).toMatch(pl);
  });
});

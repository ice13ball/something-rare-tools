// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The sample key a person picks and the eventIDs made of it (core/convert/sampleKey.ts), its preview (keyPreview.ts) and the way it is kept in the companion file (keySetting.ts, settings.ts).
// Synthetic sheets of the shapes the review found: b08 (a station, a time and a cast make a sample, many rows each) and n3 (a haul with size classes, a total repeated on them). Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { previewSampleKey } from '../../src/core/convert/keyPreview';
import { keyHashes, resolveKeyHashes } from '../../src/core/convert/keySetting';
import { judge } from '../../src/core/convert/policy';
import { MAX_EVENT_ID, derivedEventId, keyColumns, keyReader } from '../../src/core/convert/sampleKey';
import type { SampleKey } from '../../src/core/convert/sampleKey';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { parseFile } from '../../src/core/parse';
import { rawSheet } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const ids = (r: ReturnType<typeof convert>, rule: string) => r.findings.filter((f) => f.ruleId === rule);
const key = (...columns: number[]): SampleKey => ({ columns });
const sampleIds = (r: ReturnType<typeof convert>): string[] => r.events.filter((e) => e.eventType === 'sample').map((e) => e.id).sort();

/* ---- b08: a station, a time and a cast make one sample; many rows each ---- */
const B08_H = ['station', 'time', 'cast', 'lat', 'lon', 'Species', 'Count'];
const B08_EDIT: Record<string, ColumnRole> = { station: { kind: 'station' }, time: { kind: 'datetime' }, cast: { kind: 'ignore' }, lat: { kind: 'latitude' }, lon: { kind: 'longitude' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
const TAXA = ['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus acuspes', 'Acartia longiremis', 'Metridia longa'];
function b08Rows(): Cell[][] {
  const rows: Cell[][] = [];
  for (const st of ['P1', 'P2', 'P3']) for (const t of ['2012-03-05T00:00:00Z', '2012-03-06T06:30:00Z']) for (const cast of [1, 2]) for (let i = 0; i < TAXA.length; i++) rows.push([st, t, cast, 70 + st.length / 10, 20, TAXA[i], 3 + i + cast]);
  return rows;
}
const b08 = (rows: Cell[][], k?: SampleKey, extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput =>
  sheetInput(fileOf(B08_H, rows), { shape: 'long', quantity: { kind: 'count' }, edit: B08_EDIT, ...(k === undefined ? {} : { sampleKey: k }), device: { kind: 'known', key: 'multinet' }, ...extra });
const KEY3 = key(0, 1, 2);

/** A seeded shuffle, so a failing order can be run again. */
function shuffled<T>(a: readonly T[], seed: number): T[] {
  const out = [...a];
  let s = seed;
  const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('the eventID of a key made of columns', () => {
  it('different keys never give the same ID: separators, empty parts, spaces, case, Unicode forms', () => {
    const pairs: [string[], string[]][] = [
      [['a|b', 'c'], ['a', 'b|c']],
      [['a\\', '|b'], ['a', '\\|b']],
      [['', 'a'], ['a', '']],
      [['a', '', ''], ['', 'a', '']],
      [['A 1'], ['A  1']],
      [['A1'], ['a1']],
      [['a\tb'], ['a\\tb']],
      [['a\nb'], ['a\\nb']],
      [['a|', ''], ['a', '|']],
    ];
    for (const [a, b] of pairs) expect(derivedEventId(a), JSON.stringify([a, b])).not.toBe(derivedEventId(b));
    expect(derivedEventId(['S1', '', '3'])).toBe('S1||3');
  });

  it('is injective over the REAL reader: 40 000 random rows of awkward cells (accents in one piece and in two, 1 and 1.0, NA and dashes, pipes, backslashes, tabs, spaces), compared with an independent canonical form', () => {
    const NFC = (x: string): string => x.normalize('NFC');
    const fragments = ['a', 'b', 'x', 'Y', '|', '\\', 'é', 'é', 'Ö', 'Ö', ' ', '1', '0', '\t'];
    const blanks: (string | null)[] = [null, '', ' ', 'NA', 'nan', '-'];
    let g = 777;
    const gen = (n: number): number => ((g = (g * 1664525 + 1013904223) >>> 0) % n);
    const cell = (): string | number | null => {
      const k = gen(10);
      if (k === 0) return blanks[gen(blanks.length)];
      if (k === 1) return gen(40) + (gen(2) === 0 ? 0 : 0.5);
      if (k === 2) return `${gen(40)}${gen(2) === 0 ? '' : '.0'}`;
      return Array.from({ length: 1 + gen(4) }, () => fragments[gen(fragments.length)]).join('');
    };
    // the canonical form of a cell, written here from the rule (blank tokens, trimmed NFC text, a number as its number, a leading zero keeps the text) and not from the reader
    const canon = (c: string | number | null): string => {
      if (c === null) return '';
      if (typeof c === 'number') return `n${c}`;
      const t = c.trim();
      if (t === '' || ['NA', 'nan', '-'].includes(t)) return '';
      if (/^[-+]?0\d/.test(t)) return `t${NFC(t)}`;
      if (/^[-+]?\d+(\.\d+)?$/.test(t)) return `n${Number(t)}`;
      return `t${NFC(t)}`;
    };
    const sheet = rawSheet(['a', 'b', 'c'], [], 'S');
    const read = keyReader(key(0, 1, 2), { sheet, decimalComma: false, date1904: false, roleOf: () => 'ignore' });
    const byId = new Map<string, string>();
    const byCanon = new Map<string, string>();
    for (let i = 0; i < 40000; i++) {
      const cells = [cell(), cell(), cell()];
      const id = read({ line: i + 2, fieldCount: 3, cells }).id ?? '';
      expect(id).not.toMatch(/[\t\n\r]/);
      const c = JSON.stringify(cells.map(canon));
      // the same canonical row gives the same ID, and two canonical rows never share one
      expect(byCanon.get(c) ?? id, c).toBe(id);
      expect(byId.get(id) ?? c, id).toBe(c);
      byCanon.set(c, id);
      byId.set(id, c);
    }
    expect(byCanon.size).toBeGreaterThan(20000);
  });

  it('one reader of the cells: 1 and 1.0, an accent in one piece or two, blank tokens, a date serial and the same date as text, a 1904 workbook, a code with a leading zero', () => {
    const rows = [['1', 'S'], ['1.0', 'S'], ['é', 'S'], ['é', 'S'], ['NA', 'S'], ['-', 'S'], ['', 'S'], [45581, 'S'], ['2024-10-16', 'S'], ['007', 'S'], ['7', 'S']];
    const sheet = rawSheet(['d', 'k'], rows as Cell[][], 'S', [true, false]);
    const idOf = (role: string, i: number, date1904 = false): string | undefined => keyReader(key(0, 1), { sheet, decimalComma: false, date1904, roleOf: (c) => (c === 0 ? role : 'ignore') })(sheet.rows[i]).id;
    expect(idOf('ignore', 0)).toBe(idOf('ignore', 1));
    expect(idOf('ignore', 2)).toBe(idOf('ignore', 3));
    expect(idOf('ignore', 4)).toBe(idOf('ignore', 5));
    expect(idOf('ignore', 5)).toBe(idOf('ignore', 6));
    expect(idOf('ignore', 4)).toBe('|S');
    // the serial and the text are one date, and the serial is not published as the ID
    const asDate = idOf('date', 7)!;
    expect(asDate).toBe(idOf('date', 8));
    expect(asDate).not.toContain('45581');
    expect(asDate).toMatch(/^2024-10-1\d\|S$/);
    // 1904 workbooks count from another day zero
    expect(idOf('date', 7, true)).not.toBe(asDate);
    // "007" is a code, not the number 7
    expect(idOf('ignore', 9)).toBe('007|S');
    expect(idOf('ignore', 10)).toBe('7|S');
    // two long digit codes that a number could not tell apart stay two
    const longSheet = rawSheet(['k'], [['12345678901234567890'], ['12345678901234567891']], 'S');
    const longId = (i: number): string | undefined => keyReader(key(0), { sheet: longSheet, decimalComma: false, date1904: false, roleOf: () => 'ignore' })(longSheet.rows[i]).id;
    expect(longId(0)).toBe('12345678901234567890');
    expect(longId(0)).not.toBe(longId(1));
    expect(derivedEventId(['x'])).toBe('x');
    expect(keyColumns(key(3, 1))).toEqual([3, 1]);
    expect(keyColumns(undefined)).toEqual([]);
  });
});

describe('a picked key in the converter (the b08 shape)', () => {
  it('makes one sample per station, time and cast, with the rows of each; the IDs are the values joined', () => {
    const r = convert({ sheets: [b08(b08Rows(), KEY3)], options: {} });
    const samples = r.events.filter((e) => e.eventType === 'sample');
    expect(samples).toHaveLength(3 * 2 * 2);
    expect(samples.map((e) => e.id)).toContain('P1|2012-03-05T00:00:00Z|1');
    expect(r.occurrences).toHaveLength(b08Rows().length);
    expect(new Set(r.occurrences.map((o) => o.eventId)).size).toBe(12);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toEqual([]);
    expect(ids(r, 'CONV-SAMPLE-CONFLICT')).toEqual([]);
    expect(ids(r, 'CONV-SAMPLE-CODE-MISSING')).toEqual([]);
  });

  it('gives the same IDs whatever the order of the rows', () => {
    const base = convert({ sheets: [b08(b08Rows(), KEY3)], options: {} });
    const occ = (r: typeof base): string[] => r.occurrences.map((o) => `${o.eventId}#${o.id}#${o.scientificName}#${o.individualCount}`).sort();
    for (const seed of [1, 2, 3, 99]) {
      const r = convert({ sheets: [b08(shuffled(b08Rows(), seed), KEY3)], options: {} });
      expect(sampleIds(r), `seed ${seed}`).toEqual(sampleIds(base));
      expect(occ(r), `seed ${seed}`).toEqual(occ(base));
    }
  });

  it('the preview is the export after every change of the key and of the rows: samples, rows, rows per sample are compared with the written events and occurrences', () => {
    for (const k of [key(0), key(0, 1), KEY3, key(0, 1, 2, 5), key(2, 0)]) {
      for (const rows of [b08Rows(), shuffled(b08Rows(), 7), b08Rows().slice(0, 37)]) {
        const input = b08(rows, k);
        const p = previewSampleKey(input)!;
        const r = convert({ sheets: [input], options: {} });
        const samples = r.events.filter((e) => e.eventType === 'sample');
        const perEvent = new Map<string, number>();
        for (const o of r.occurrences) perEvent.set(o.eventId, (perEvent.get(o.eventId) ?? 0) + 1);
        const per = samples.map((e) => perEvent.get(e.id) ?? 0).sort((a, b) => a - b);
        const label = `${JSON.stringify(k.columns)} ${rows.length} rows`;
        expect(p, label).toEqual(r.keys![0]);
        expect(p.samples, label).toBe(samples.length);
        expect(p.rows, label).toBe(r.occurrences.length);
        expect(p.rowsPerSample.min, label).toBe(per[0]);
        expect(p.rowsPerSample.max, label).toBe(per[per.length - 1]);
        expect(p.rowsPerSample.median, label).toBe(per.length % 2 === 1 ? per[(per.length - 1) / 2] : (per[per.length / 2 - 1] + per[per.length / 2]) / 2);
      }
    }
  });

  it('the preview leaves out what the export leaves out: a summary row and a row with no key', () => {
    const rows = [...b08Rows(), ['Total', '2012-03-05T00:00:00Z', 1, 70, 20, 'Calanus finmarchicus', 99], [null, null, null, 70, 20, 'Calanus finmarchicus', 5]];
    const input = b08(rows, KEY3);
    const p = previewSampleKey(input)!;
    const r = convert({ sheets: [input], options: {} });
    expect(p.samples).toBe(12);
    expect(p.rows).toBe(r.occurrences.length);
    expect(p.blank).toBe(1);
    expect(ids(r, 'CONV-SAMPLE-CODE-MISSING')[0].params.count).toBe(1);
  });

  it('a key that is too coarse is caught by the checks that already exist: the rows of one "sample" differ in time', () => {
    const r = convert({ sheets: [b08(b08Rows(), key(0))], options: {} });
    const c = ids(r, 'CONV-SAMPLE-CONFLICT');
    expect(c.length).toBeGreaterThan(0);
    expect(String(c[0].params.what)).toContain('date');
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toContain('CONV-SAMPLE-CONFLICT');
    expect(previewSampleKey(b08(b08Rows(), key(0)))!.samples).toBe(3);
  });

  it('a key that is too fine is seen in the preview: one sample per row', () => {
    const rows = b08Rows();
    const p = previewSampleKey(b08(rows, key(0, 1, 2, 5)))!;
    expect(p.samples).toBe(rows.length);
    expect(p.rowsPerSample).toEqual({ min: 1, max: 1, median: 1 });
  });

  it('is inactive without a key: no key report, nothing about the roles changes, and the result is the one it always was', () => {
    const plain = convert({ sheets: [b08(b08Rows(), undefined, { edit: { ...B08_EDIT, station: { kind: 'sampleId' } } })], options: {} });
    expect('keys' in plain).toBe(false);
    expect(ids(plain, 'CONV-KEY-PICKED')).toEqual([]);
    expect(previewSampleKey(b08(b08Rows()))).toBeUndefined();
    // the same sheet with the same roles and an EMPTY key list is no key
    const empty = convert({ sheets: [b08(b08Rows(), key(), { edit: { ...B08_EDIT, station: { kind: 'sampleId' } } })], options: {} });
    expect(empty.events.map((e) => e.id)).toEqual(plain.events.map((e) => e.id));
    expect(empty.occurrences.map((o) => o.id)).toEqual(plain.occurrences.map((o) => o.id));
    expect(empty.findings.map((f) => f.ruleId)).toEqual(plain.findings.map((f) => f.ruleId));
    // without a key the `cast` column is still an ignored column; no role is changed by the existence of the feature
    expect(plain.ledger[0].columns.find((c) => c.header === 'cast')!.role).toBe('ignore');
  });

  it('the guesses about visits and the station prefix are not applied to a key; the key columns are columns the converter reads, and the key is said', () => {
    const r = convert({ sheets: [b08(b08Rows(), KEY3)], options: { prefixStation: true } });
    expect(sampleIds(r)).toContain('P2|2012-03-06T06:30:00Z|2');
    expect(ids(r, 'CONV-ID-REVISIT')).toEqual([]);
    const cast = r.ledger[0].columns.find((c) => c.header === 'cast')!;
    expect(cast.to).toBe('event');
    expect(cast.role).toBe('keyPart');
    expect(r.ledger[0].balanced).toBe(true);
    // a key column is not reported as an ignored column
    expect(ids(r, 'CONV-COLUMN-IGNORED').flatMap((f) => String(f.params.names ?? '').split(', '))).not.toContain('cast');
    const said = ids(r, 'CONV-KEY-PICKED');
    expect(said).toHaveLength(1);
    expect(said[0].params).toMatchObject({ samples: 12, rows: 60, columns: 'station, time, cast' });
    expect(said[0].params.fromFile).toBeUndefined();
    expect(judge(r.findings).showOnly.map((f) => f.ruleId)).toContain('CONV-KEY-PICKED');
  });

  it('a key read from a companion file is marked, and the message says where it came from', () => {
    const r = convert({ sheets: [b08(b08Rows(), KEY3, { sampleKeyFromFile: true })], options: {} });
    const said = ids(r, 'CONV-KEY-PICKED')[0];
    expect(said.params.fromFile).toBe('yes');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(said, lang)).toContain('station, time, cast');
    expect(renderConvertPlain(said, 'en')).toContain('companion file');
  });

  it('the rows of a key with replicates: a sample with two replicates is one sample in the key report, with the rows of both', () => {
    const h = ['Station', 'Rep', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity'];
    const rs: Cell[][] = [['A', 1, '2020-06-01', 49.4, 0.2, 'Solea solea', 3], ['A', 2, '2020-06-01', 49.4, 0.2, 'Solea solea', 4], ['B', 1, '2020-06-02', 49.5, 0.3, 'Solea solea', 2]];
    const r = convert({ sheets: [sheetInput(fileOf(h, rs), { shape: 'long', quantity: { kind: 'count' }, edit: { Station: { kind: 'ignore' }, Rep: { kind: 'replicate' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } }, sampleKey: key(0), device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(r.events.filter((e) => e.eventType === 'replicate')).toHaveLength(3);
    expect(r.keys![0].samples).toBe(2);
    expect(r.keys![0].rows).toBe(3);
    expect(r.keys![0].rowsPerSample).toEqual({ min: 1, max: 2, median: 1.5 });
  });
});

describe('a picked key in the converter (the n3 shape: a haul, size classes, a total repeated on them)', () => {
  const H = ['Station', 'Date', 'Haul', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity'];
  const EDIT: Record<string, ColumnRole> = { Station: { kind: 'station' }, Date: { kind: 'date' }, Haul: { kind: 'ignore' }, Species: { kind: 'taxon' }, Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true }, Quantity: { kind: 'quantity' } };
  /** The total of a group: 16 groups that add up to 824. It stands on every size-class row of the group. */
  const total = (dateIdx: number, haul: number, sp: string): number => 36 + 7 * haul + (sp === 'Solea solea' ? 0 : 3) + 7 * dateIdx;
  function rows(): Cell[][] {
    const out: Cell[][] = [];
    for (const st of ['N1', 'N2']) ['1995-05-01', '1996-05-01'].forEach((date, di) => { for (const haul of [1, 2]) for (const sp of ['Solea solea', 'Merlangius merlangus']) for (let c = 0; c < 3; c++) out.push([st, date, haul, 49.4, 0.2, sp, 8 + c, total(di, haul, sp)]); });
    return out;
  }
  const mk = (data: Cell[][], k?: SampleKey, extra: Partial<ConvertSheetInput> = {}) => convert({ sheets: [sheetInput(fileOf(H, data), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...(k === undefined ? {} : { sampleKey: k }), device: { kind: 'known', key: 'multinet' }, ...extra })], options: {} });
  const quantity = (r: ReturnType<typeof convert>): number => r.occurrences.reduce((n, o) => n + Number(o.quantityText ?? 0), 0);

  it('the repeated total of the size classes is found with the key alone (Haul has the role `ignore` in the mapping): 16 occurrences, sum 824, not 48', () => {
    const blocked = mk(rows(), KEY3);
    expect(ids(blocked, 'CONV-QUANTITY-REPEATED').length).toBeGreaterThan(0);
    const once = mk(rows(), KEY3, { totalOnce: true });
    expect(once.occurrences).toHaveLength(16);
    expect(quantity(once)).toBe(824);
    expect(ids(once, 'CONV-QUANTITY-REPEATED-ONCE')).toHaveLength(1);
    expect(once.events.filter((e) => e.eventType === 'sample')).toHaveLength(8);
    expect(once.ledger[0].rows).toMatchObject({ source: 48, written: 16, unexplained: 0 });
    expect(once.ledger[0].rows.skipped).toEqual([{ reason: 'repeat-total', count: 32 }]);
    expect(once.ledger[0].balanced).toBe(true);
    // the key column was given a role of its own, not `ignore`
    expect(once.ledger[0].columns.find((c) => c.header === 'Haul')!.role).toBe('keyPart');
    // the same file in another order: the same IDs, the same sum
    const again = mk(shuffled(rows(), 5), KEY3, { totalOnce: true });
    expect(sampleIds(again)).toEqual(sampleIds(once));
    expect(quantity(again)).toBe(824);
  });

  it('a key column that has a role of its own (the haul number read as a measured variable) is part of the grouping of the repeated totals too, not only the columns whose role says "sample"', () => {
    const edit = { ...EDIT, Haul: { kind: 'variable' as const, variable: 'haul number', unitSource: 'user' as const } };
    const once = convert({ sheets: [sheetInput(fileOf(H, rows()), { shape: 'long', quantity: { kind: 'count' }, edit, sampleKey: KEY3, totalOnce: true, device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(once.occurrences).toHaveLength(16);
    expect(quantity(once)).toBe(824);
    // the role is the one the person set; the key does not take it over
    expect(once.ledger[0].columns.find((c) => c.header === 'Haul')!.role).toBe('variable');
  });

  it('the preview of the key counts the rows of every haul as the export has them', () => {
    const input = sheetInput(fileOf(H, rows()), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, sampleKey: KEY3, totalOnce: true });
    const p = previewSampleKey(input)!;
    // the rows of a sample are the rows of the sheet that belong to it: the 6 size-class rows of a haul, 2 species x 3 classes, of which the export keeps one occurrence per species
    expect(p).toMatchObject({ samples: 8, rows: 48, rowsPerSample: { min: 6, max: 6, median: 6 } });
    const r = convert({ sheets: [input], options: {} });
    expect(p).toEqual(r.keys![0]);
    expect(r.occurrences).toHaveLength(16);
  });

  it('a key column with a different value on every row is no identifier of the row: one-row samples with equal counts are not copies', () => {
    const h = ['Code', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity'];
    const rs: Cell[][] = Array.from({ length: 30 }, (_, i) => [`k${i + 1}`, '2020-06-01', 49.4, 0.2, 'Solea solea', 5]);
    const mkc = (k?: SampleKey) => convert({ sheets: [sheetInput(fileOf(h, rs), { shape: 'long', quantity: { kind: 'count' }, edit: { Code: { kind: 'ignore' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } }, ...(k === undefined ? {} : { sampleKey: k }), device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(ids(mkc(key(0)), 'CONV-ROW-COPIES')).toEqual([]);
    expect(ids(mkc(key(0)), 'CONV-ROW-COPIES-SPECIMENS')).toEqual([]);
    expect(ids(mkc(key(0)), 'CONV-QUANTITY-SAME-IN-SAMPLE')).toEqual([]);
    // without a key the sheet is read as before (the identifier-like column is dropped from the comparison)
    expect(ids(mkc(), 'CONV-ROW-COPIES').length).toBeGreaterThan(0);
  });
});

describe('the key contract: a key column is a column that says which sample, whatever role it has', () => {
  const H = ['Station', 'Cast', 'Latitude', 'Longitude', 'Date', 'Species', 'Quantity'];
  const edit: Record<string, ColumnRole> = { Station: { kind: 'ignore' }, Cast: { kind: 'ignore' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } };
  const run = (rs: Cell[][], k: SampleKey, e: Record<string, ColumnRole> = edit) => convert({ sheets: [sheetInput(fileOf(H, rs), { shape: 'long', quantity: { kind: 'count' }, edit: e, sampleKey: k, device: { kind: 'known', key: 'multinet' } })], options: {} });

  it('a statistics row in a key column is not a sample (Total, Mean, SD)', () => {
    const rs: Cell[][] = [['A', 1, 49.4, 0.2, '2020-06-01', 'Solea solea', 3], ['A', 2, 49.4, 0.2, '2020-06-01', 'Solea solea', 4], ['B', 1, 49.5, 0.3, '2020-06-02', 'Solea solea', 6], ['Total', 1, null, null, null, 'Solea solea', 7], ['Mean', 2, null, null, null, 'Solea solea', 3.5]];
    const r = run(rs, key(0, 1));
    expect(r.occurrences).toHaveLength(3);
    expect(sampleIds(r)).toEqual(['A|1', 'A|2', 'B|1']);
    expect(ids(r, 'CONV-SUMMARY-ROW-SKIPPED')).toHaveLength(1);
  });

  it('a key of one column that is the station gets an ID of its own, so the obvious answer is not a duplicate-ID block', () => {
    const rs: Cell[][] = [['S1', 1, 49.4, 0.2, '2020-06-01', 'Solea solea', 3], ['S1', 1, 49.4, 0.2, '2020-06-01', 'Gadus morhua', 4], ['S2', 1, 49.5, 0.3, '2020-06-02', 'Solea solea', 6]];
    const r = run(rs, key(0), { ...edit, Station: { kind: 'station' } });
    expect(sampleIds(r)).toEqual(['S1|sample', 'S2|sample']);
    expect(r.events.filter((e) => e.eventType === 'station').map((e) => e.id).sort()).toEqual(['S1', 'S2']);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toEqual([]);
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).not.toContain('CONV-ID-DUPLICATE');
    // a key of one column that is NOT the station keeps the plain value
    const other = run(rs, key(4), { ...edit, Station: { kind: 'station' } });
    expect(sampleIds(other)).toEqual(['2020-06-01', '2020-06-02']);
  });

  it('a key of one column that is the cruise gets the same treatment', () => {
    const h = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Species', 'Quantity'];
    const rs: Cell[][] = [['C1', 'S1', 49.4, 0.2, '2020-06-01', 'Solea solea', 3], ['C1', 'S1', 49.4, 0.2, '2020-06-01', 'Gadus morhua', 4]];
    const r = convert({ sheets: [sheetInput(fileOf(h, rs), { shape: 'long', quantity: { kind: 'count' }, edit: { Cruise: { kind: 'cruise' }, Station: { kind: 'ignore' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } }, sampleKey: key(0), device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(sampleIds(r)).toEqual(['C1|sample']);
    expect(ids(r, 'CONV-ID-DUPLICATE')).toEqual([]);
  });

  it('1 and 1.0 are one sample and a date cell and the same date as text are one sample', () => {
    const rs: Cell[][] = [['A', 1, 49.4, 0.2, '2020-06-01', 'Solea solea', 3], ['A', '1.0', 49.4, 0.2, '2020-06-01', 'Gadus morhua', 4], ['A', 1, 49.4, 0.2, '2020-06-01', 'Merlangius merlangus', 5]];
    const r = run(rs, key(0, 1));
    expect(sampleIds(r)).toEqual(['A|1']);
    expect(r.occurrences).toHaveLength(3);
    // a date serial in a date-formatted column and the same day as text
    const file = fileOf(H, [['A', 1, 49.4, 0.2, 45581, 'Solea solea', 3], ['A', 1, 49.4, 0.2, '2024-10-16', 'Gadus morhua', 4]]);
    file.sheets[0].dateFormatted = [false, false, false, false, true, false, false];
    const d = convert({ sheets: [sheetInput(file, { shape: 'long', quantity: { kind: 'count' }, edit: { ...edit, Date: { kind: 'date' } }, sampleKey: key(0, 4), device: { kind: 'known', key: 'multinet' } })], options: {} });
    expect(d.keys![0].samples).toBe(1);
    expect(sampleIds(d)).toHaveLength(1);
    expect(sampleIds(d)[0]).toMatch(/^A\|2024-10-1\d$/);
  });

  it('two sheets that make the same ID are not merged and not renamed: the converter names both and blocks; different values collide nowhere', () => {
    const h = ['Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity'];
    const mkSheet = (name: string, st: string) => sheetInput(fileOf(h, [[st, '2020-06-01', 49.4, 0.2, 'Solea solea', 3], [st, '2020-06-01', 49.4, 0.2, 'Gadus morhua', 4]], name, { fileName: `${name}.csv` }), { shape: 'long', quantity: { kind: 'count' }, edit: { Station: { kind: 'ignore' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' } }, sampleKey: key(0, 1), device: { kind: 'known', key: 'multinet' } });
    const same = convert({ sheets: [mkSheet('One', 'A'), mkSheet('Two', 'A')], options: {} });
    const dup = ids(same, 'CONV-ID-DUPLICATE');
    expect(dup.length).toBeGreaterThan(0);
    expect(judge(same.findings).blocking.map((f) => f.ruleId)).toContain('CONV-ID-DUPLICATE');
    expect(same.keys!.map((k) => k.sheet)).toEqual(['One', 'Two']);
    const apart = convert({ sheets: [mkSheet('One', 'A'), mkSheet('Two', 'B')], options: {} });
    expect(ids(apart, 'CONV-ID-DUPLICATE')).toEqual([]);
    expect(sampleIds(apart)).toEqual(['A|2020-06-01', 'B|2020-06-01']);
  });
});

describe('the values of a key: blanks, length, replicates', () => {
  const H = ['Station', 'Cast', 'Date', 'Latitude', 'Longitude', 'Species', 'Quantity'];
  const run = (rows: Cell[][], k: SampleKey, e: Record<string, ColumnRole> = {}) =>
    convert({ sheets: [sheetInput(fileOf(H, rows), { shape: 'long', quantity: { kind: 'count' }, edit: { Station: { kind: 'ignore' }, Cast: { kind: 'ignore' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' }, ...e }, sampleKey: k, device: { kind: 'known', key: 'multinet' } })], options: {} });
  const row = (st: Cell, cast: Cell, sp = 'Solea solea', q = 3): Cell[] => [st, cast, '2020-06-01', 49.4, 0.2, sp, q];

  it('a blank part (an empty cell, NA, nan, a dash) is a must-accept warning with the count, never a silent merge', () => {
    const r = run([row('A', 1), row('A', null, 'Gadus morhua'), row('A', 'NA', 'Merlangius merlangus'), row('A', '-', 'Pollachius pollachius'), row('B', 2)], key(0, 1));
    const f = ids(r, 'CONV-KEY-PART-BLANK');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 3, columns: 'Station, Cast' });
    expect(judge(r.findings).acceptRules).toContain('CONV-KEY-PART-BLANK');
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).not.toContain('CONV-KEY-PART-BLANK');
    // the three blank rows are ONE sample (A|), not merged into A|1
    expect(sampleIds(r)).toEqual(['A|', 'A|1', 'B|2']);
    expect(r.keys![0].blankParts).toBe(3);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain('Station, Cast');
  });

  it('a row blank in every part has no sample: CONV-SAMPLE-CODE-MISSING, not a blank-part warning', () => {
    const r = run([row('A', 1), row(null, 'NA', 'Gadus morhua')], key(0, 1));
    expect(ids(r, 'CONV-KEY-PART-BLANK')).toEqual([]);
    expect(ids(r, 'CONV-SAMPLE-CODE-MISSING')[0].params.count).toBe(1);
    expect(r.keys![0].blank).toBe(1);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SAMPLE-CODE-MISSING');
  });

  it('an ID over 255 characters blocks, one of 255 does not', () => {
    const r = run([row('A', 1), row('x'.repeat(60001), 2)], key(0, 1));
    const f = ids(r, 'CONV-KEY-TOO-LONG');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 1, max: 255 });
    expect(String(f[0].value).length).toBeLessThan(100);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-KEY-TOO-LONG');
    expect(r.keys![0].tooLong).toBe(1);
    // exactly MAX_EVENT_ID characters: "<n x>|1"
    const exact = 'x'.repeat(MAX_EVENT_ID - 2);
    expect(run([row(exact, 1)], key(0, 1)).findings.some((x) => x.ruleId === 'CONV-KEY-TOO-LONG')).toBe(false);
    expect(run([row(`${exact}x`, 1)], key(0, 1)).findings.some((x) => x.ruleId === 'CONV-KEY-TOO-LONG')).toBe(true);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain('255');
  });

  it('a value with a tab or a line break gives an ID without them (they are written \\t and \\n)', () => {
    const r = run([row('A\tB', 1), row('C\nD', 2)], key(0, 1));
    const all = r.events.map((e) => e.id).join('');
    expect(all).not.toMatch(/[\t\n\r]/);
    expect(sampleIds(r)).toEqual(['A\\tB|1', 'C\\nD|2']);
  });
});

describe('a key is kept in the companion file as hashes, never as header text', () => {
  const H = ['Secret station name', 'Cast  number', 'cast_number', 'Date'];
  it('hashes survive case, spacing and underscores; an added column loses nothing; a changed key column loses the key; equal names are told apart', () => {
    const h = keyHashes(H, [0, 3])!;
    expect(h).toMatch(/^[0-9a-f+.]+(of[0-9a-f+.]*)*$/);
    expect(h).not.toMatch(/station|secret|date/i);
    expect(resolveKeyHashes(H, h)).toEqual([0, 3]);
    expect(resolveKeyHashes(['SECRET STATION NAME', 'x', 'y', 'DATE'], h)).toEqual([0, 3]);
    expect(resolveKeyHashes(['secret_station_name', 'x', 'y', 'date'], h)).toEqual([0, 3]);
    // an added column: the key is found at its new place
    expect(resolveKeyHashes(['New', ...H], h)).toEqual([1, 4]);
    // a key column renamed: the key is gone
    expect(resolveKeyHashes(['Station', 'Cast  number', 'cast_number', 'Date'], h)).toBeUndefined();
    // two columns that fold to one name: told apart by their rank; if their number changes, the key is not applied
    const two = keyHashes(H, [2])!;
    expect(two).toContain('.2of2');
    expect(resolveKeyHashes(H, two)).toEqual([2]);
    expect(resolveKeyHashes(['Secret station name', 'Cast  number', 'Date'], two)).toBeUndefined();
    expect(keyHashes(H, [9])).toBeUndefined();
    expect(keyHashes(H, [])).toBeUndefined();
    expect(resolveKeyHashes(H, 'zzzzzzzz')).toBeUndefined();
    expect(resolveKeyHashes(H, `${h}+${h}`)).toBeUndefined();
  });

  it('the sidecar line holds the sheet, the hashes and the number of rows; no header, no value; /check reads it as a sidecar and takes nothing from it', () => {
    const hashes = keyHashes(H, [0, 3])!;
    const text = writeConvertSidecar({ fullList: false, prefixStation: false, worms: false, nvs: false, sampleKey: [{ sheet: 'Sheet 1', hashes, rows: 1234 }] });
    expect(text).toContain(`sampleKey=Sheet 1:${hashes}:1234`);
    expect(text).not.toMatch(/secret|station name|cast|date/i);
    const parsed = parseFile('c.csv', new TextEncoder().encode(text));
    const settings = readConvertSettings(parsed)!;
    expect(settings.sampleKey).toEqual([{ sheet: 'Sheet 1', hashes, rows: 1234 }]);
    // an old sidecar (no key line) has no key and nothing else breaks
    const old = readConvertSettings(parseFile('o.csv', new TextEncoder().encode(writeConvertSidecar({ fullList: true, prefixStation: false, worms: false, nvs: false }))))!;
    expect(old.sampleKey).toBeUndefined();
    expect(old.fullList).toBe(true);
  });

  it('a hostile key line is ignored, not thrown on', () => {
    const lines = ['sampleKey=', 'sampleKey=x', 'sampleKey=S:zz:1', 'sampleKey=S:abcdef01:-1', `sampleKey=S:${'abcdef01+'.repeat(100)}abcdef01:1`, 'sampleKey=:abcdef01:1', 'sampleKey=S:abcdef01.9999999of2:1', 'sampleKey=__proto__:abcdef01:1'];
    const csv = ['original_column,output_column,unit,unit_source,p01', ...lines.map((l) => `(setting),${l},,,`)].join('\n') + '\n';
    const s = readConvertSettings(parseFile('h.csv', new TextEncoder().encode(csv)))!;
    expect((s.sampleKey ?? []).map((k) => k.sheet)).toEqual(['__proto__']);
    expect(Object.prototype.hasOwnProperty.call({}, 'abcdef01')).toBe(false);
  });
});

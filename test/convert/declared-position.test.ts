// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 3, Task 10: one position declared by the person for a sheet that has no position at all (never to fill gaps). Invented data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { parseTypedCoordinate } from '../../src/core/convert/quantity';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import { exportSheets, objects, readBack } from './exportHelpers';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';
import { joinInputs } from '../../src/core/convert/sampleJoin';
import { xlsxFile } from '../helpers/files';
import { descriptionInput, resultsInput } from './joinFixtures';

const LONG: Record<string, ColumnRole> = { Tank: { kind: 'sampleId' }, Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } };
const TANKS_H = ['Tank', 'Date', 'Taxon', 'Count'];
const TANKS_R: Cell[][] = [
  ['T1', '2023-04-05', 'Calanus finmarchicus', 3],
  ['T2', '2023-04-06', 'Oithona similis', 1],
];
const tanks = (declared?: ConvertSheetInput['declaredPosition'], extra: { header?: string[]; rows?: Cell[][]; edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput =>
  sheetInput(fileOf(extra.header ?? TANKS_H, extra.rows ?? TANKS_R, 'Tanks', { fileName: 'tanks.csv' }), {
    shape: 'long',
    quantity: { kind: 'count' },
    edit: { ...LONG, ...(extra.edit ?? {}) },
    ...(declared === undefined ? {} : { declaredPosition: declared }),
  });
const ids = <T extends { ruleId: string }>(fs: readonly T[], id: string): T[] => fs.filter((f) => f.ruleId === id);
const REMARK = 'Position declared for all samples of this sheet by the person converting the data; not stated per sample in the source';
const PARTIAL = 'Position derived in part from a position declared by the person converting the data';

describe('parseTypedCoordinate', () => {
  it('reads a sign, digits and one point or comma, and writes the text with a point', () => {
    expect(parseTypedCoordinate('-54,125')).toEqual({ ok: true, value: -54.125, text: '-54.125' });
    expect(parseTypedCoordinate('10.125')).toEqual({ ok: true, value: 10.125, text: '10.125' });
    expect(parseTypedCoordinate('0')).toEqual({ ok: true, value: 0, text: '0' });
    expect(parseTypedCoordinate(' 54.10 ')).toEqual({ ok: true, value: 54.1, text: '54.10' });
  });
  it('refuses more than one separator and anything that is not a number', () => {
    for (const bad of ['1.2.3', '1,2,3', '', 'abc', '54 N', '--1', '1e3']) expect(parseTypedCoordinate(bad).ok, bad).toBe(false);
  });
});

describe('a declared position', () => {
  it('is written on every sample with its uncertainty and the remark, and replaces CONV-POSITION-NONE', () => {
    const r = convert({ sheets: [tanks({ lat: '54.1', lon: '10.9', uncertaintyM: '500' })] });
    const samples = r.events.filter((e) => e.eventType === 'sample');
    expect(samples).toHaveLength(2);
    for (const e of samples) {
      expect(e.lat).toBe(54.1);
      expect(e.lon).toBe(10.9);
      expect(e.latText).toBe('54.1');
      expect(e.lonText).toBe('10.9');
      expect(e.coordinateUncertaintyInMeters).toBe(500);
      expect(e.georeferenceRemarks).toBe(REMARK);
    }
    const d = ids(r.findings, 'CONV-POSITION-DECLARED');
    expect(d).toHaveLength(1);
    expect(d[0].params).toMatchObject({ lat: '54.1', lon: '10.9', uncertainty: '500', count: 2 });
    expect(renderConvertPlain(d[0], 'en')).toContain('declared');
    expect(ids(r.findings, 'CONV-POSITION-NONE')).toEqual([]);
    expect(ids(r.findings, 'CONV-POSITION-DECLARED-INVALID')).toEqual([]);
  });

  it('reaches event.txt with decimalLatitude, the uncertainty and georeferenceRemarks', async () => {
    const e = await exportSheets([tanks({ lat: '-54,125', lon: '10.125', uncertaintyM: '500' })]);
    expect(e.files.length).toBeGreaterThan(0);
    const b = await readBack(e.zip);
    const rows = objects(b.tables['event.txt']);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.decimalLatitude).toBe('-54.125');
      expect(row.decimalLongitude).toBe('10.125');
      expect(row.coordinateUncertaintyInMeters).toBe('500');
      expect(row.georeferenceRemarks).toBe(REMARK);
    }
    expect(b.tables['event.txt'].header.indexOf('georeferenceRemarks')).toBe(b.tables['event.txt'].header.indexOf('coordinateUncertaintyInMeters') + 1);
  });

  it('is said as coming from the companion file, and a station made of declared samples carries the remark', () => {
    const rows: Cell[][] = TANKS_R.map((x) => [...x, 'S1']);
    const sin = { ...tanks({ lat: '54.1', lon: '10.9', uncertaintyM: '500' }, { header: [...TANKS_H, 'Station'], rows, edit: { Station: { kind: 'station' } } }), declaredPositionFromFile: true };
    const r = convert({ sheets: [sin] });
    const d = ids(r.findings, 'CONV-POSITION-DECLARED');
    expect(d[0].params.fromFile).toBe('yes');
    expect(renderConvertPlain(d[0], 'en')).toContain('companion file');
    const st = r.events.find((x) => x.eventType === 'station');
    expect(st?.lat).toBe(54.1);
    expect(st?.georeferenceRemarks).toBe(PARTIAL);
  });

  it('marks a station shared with a sheet of real positions as derived in part from the declaration', () => {
    const a = { ...tanks({ lat: '54.1', lon: '10.9', uncertaintyM: '500' }, { header: [...TANKS_H, 'Station'], rows: TANKS_R.map((x) => [...x, 'S1']), edit: { Station: { kind: 'station' } } }) };
    const b = sheetInput(fileOf(['Tank', 'Date', 'Station', 'Latitude', 'Longitude', 'Taxon', 'Count'], [['T9', '2023-04-07', 'S1', 55, 11, 'Oithona similis', 2]], 'Real', { fileName: 'real.csv' }), {
      shape: 'long',
      quantity: { kind: 'count' },
      edit: { ...LONG, Station: { kind: 'station' } },
    });
    const r = convert({ sheets: [a, b] });
    const st = r.events.find((x) => x.eventType === 'station');
    expect(st?.georeferenceRemarks).toBe(PARTIAL);
    expect(r.events.filter((x) => x.eventType === 'sample' && x.source?.file === 'real.csv').every((x) => x.georeferenceRemarks === undefined)).toBe(true);
    expect(ids(r.findings, 'CONV-POSITION-DECLARED')[0].params.count).toBe(2);
  });

  it('refuses a declaration on a profile sheet, also one that came from a companion file', () => {
    for (const fromFile of [false, true]) {
      const sin = sheetInput(fileOf(['Cast', 'Date', 'Depth [m]'], [['C1', '2023-04-05', 5]], 'CTD', { fileName: 'ctd.csv' }), {
        profile: { depthIds: true },
        declaredPosition: { lat: '54.1', lon: '10.9', uncertaintyM: '500' },
        ...(fromFile ? { declaredPositionFromFile: true } : {}),
      });
      const r = convert({ sheets: [sin] });
      const f = ids(r.findings, 'CONV-POSITION-DECLARED-INVALID');
      expect(f.map((x) => x.params.reason), String(fromFile)).toEqual(['profile']);
      expect(renderConvertPlain(f[0], 'en')).toContain('profile sheet');
      expect(ids(r.findings, 'CONV-POSITION-DECLARED')).toEqual([]);
      expect(r.events.every((x) => x.georeferenceRemarks === undefined)).toBe(true);
    }
  });

  it('accepts 0 / 0 / 10', () => {
    const r = convert({ sheets: [tanks({ lat: '0', lon: '0', uncertaintyM: '10' })] });
    expect(ids(r.findings, 'CONV-POSITION-DECLARED')).toHaveLength(1);
    expect(ids(r.findings, 'CONV-POSITION-DECLARED-INVALID')).toEqual([]);
    expect(r.events.filter((x) => x.eventType === 'sample').every((x) => x.lat === 0 && x.lon === 0 && x.coordinateUncertaintyInMeters === 10)).toBe(true);
  });

  it('is refused, with its own message and nothing applied, when a value is out of range or refused', () => {
    const cases: [ConvertSheetInput['declaredPosition'], string][] = [
      [{ lat: '95', lon: '10.9', uncertaintyM: '500' }, 'latitude'],
      [{ lat: '91', lon: '10.9', uncertaintyM: '500' }, 'latitude'],
      [{ lat: '54.1', lon: '181', uncertaintyM: '500' }, 'longitude'],
      [{ lat: '54.1', lon: '10.9', uncertaintyM: '1.500' }, 'uncertainty'],
      [{ lat: '54.1', lon: '10.9', uncertaintyM: '' }, 'uncertainty'],
      [{ lat: '54.1', lon: '10.9', uncertaintyM: '0' }, 'uncertainty'],
      [{ lat: 'north', lon: '10.9', uncertaintyM: '500' }, 'latitude'],
    ];
    for (const [decl, reason] of cases) {
      const r = convert({ sheets: [tanks(decl)] });
      const f = ids(r.findings, 'CONV-POSITION-DECLARED-INVALID');
      expect(f.map((x) => x.params.reason), JSON.stringify(decl)).toEqual([reason]);
      expect(renderConvertPlain(f[0], 'en').length).toBeGreaterThan(20);
      expect(ids(r.findings, 'CONV-POSITION-NONE'), JSON.stringify(decl)).toEqual([]);
      expect(ids(r.findings, 'CONV-POSITION-DECLARED')).toEqual([]);
      expect(r.events.filter((x) => x.eventType === 'sample').every((x) => x.lat === undefined && x.georeferenceRemarks === undefined)).toBe(true);
      expect(r.ok).toBe(false);
    }
  });

  it('is refused when the sheet has a position column, and the positions stay as written', () => {
    const rows: Cell[][] = TANKS_R.map((x, i) => [...x, 55 + i, 2.5]);
    const r = convert({ sheets: [tanks({ lat: '54.1', lon: '10.9', uncertaintyM: '500' }, { header: [...TANKS_H, 'Latitude', 'Longitude'], rows })] });
    const f = ids(r.findings, 'CONV-POSITION-DECLARED-INVALID');
    expect(f).toHaveLength(1);
    expect(f[0].params.reason).toBe('position-role');
    expect(ids(r.findings, 'CONV-POSITION-DECLARED')).toEqual([]);
    expect(ids(r.findings, 'CONV-POSITION-NONE')).toEqual([]);
    const lats = r.events.filter((x) => x.eventType === 'sample').map((x) => x.lat);
    expect(lats).toEqual([55, 56]);
    expect(r.events.every((x) => x.georeferenceRemarks === undefined)).toBe(true);
  });

  it('is refused for a position column that is blank in every row (it never fills gaps)', () => {
    const rows: Cell[][] = TANKS_R.map((x) => [...x, null, null]);
    const r = convert({ sheets: [tanks({ lat: '54.1', lon: '10.9', uncertaintyM: '500' }, { header: [...TANKS_H, 'Latitude', 'Longitude'], rows })] });
    expect(ids(r.findings, 'CONV-POSITION-DECLARED-INVALID').map((x) => x.params.reason)).toEqual(['position-role']);
    expect(ids(r.findings, 'CONV-POSITION-NONE')).toEqual([]);
  });

  it('changes nothing for a sheet without a declaration: the Event table keeps its columns', async () => {
    const e = await exportSheets([tanks(undefined, { header: [...TANKS_H, 'Latitude', 'Longitude'], rows: TANKS_R.map((x) => [...x, 55.5, 2.5]) })]);
    const b = await readBack(e.zip);
    expect(b.tables['event.txt'].header).not.toContain('georeferenceRemarks');
    expect(b.tables['event.txt'].header).not.toContain('coordinateUncertaintyInMeters');
  });
});

describe('a declared position on a sheet whose joined description sheet gives the positions (final review M1)', () => {
  const file = xlsxFile('book.xlsx', {
    Fish: [['Sample', 'Taxon', 'Count'], ['T1', 'Gadus morhua', 2], ['T2', 'Gadus morhua', 4]],
    Samples: [['Sample', 'Date', 'Latitude', 'Longitude'], ['T1', '2021-05-03', 61.1, 4.2], ['T2', '2021-05-04', 61.3, 4.6]],
  });
  const run = () => {
    const out = joinInputs([resultsInput(file, 'Fish', { declaredPosition: { lat: '54.1', lon: '10.9', uncertaintyM: '500' } }), descriptionInput(file, 'Samples')], [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []);
    return convert({ sheets: out.sheets });
  };

  it('is refused with the reason that the positions come from the joined sheet, not that "the sheet" has a position column', () => {
    const r = run();
    const f = ids(r.findings, 'CONV-POSITION-DECLARED-INVALID');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ reason: 'position-joined', description: 'Samples' });
    expect(f[0].sheet).toBe('Fish');
    const en = renderConvertPlain(f[0], 'en');
    expect(en).toContain('the positions come from the joined sheet "Samples"');
    expect(en).not.toContain('already has a latitude');
    for (const lang of ['pl', 'de', 'fr'] as const) {
      const text = renderConvertPlain(f[0], lang);
      expect(text).toContain('Samples');
      expect(text).not.toMatch(/\{|\}/);
    }
    // nothing is applied: the events carry the lent positions only
    expect(ids(r.findings, 'CONV-POSITION-DECLARED')).toEqual([]);
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.lat)).toEqual([61.1, 61.3]);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The converter's reader of a LONG environmental sheet (one row per measured parameter): core/convert/pivot.ts. Synthetic sheets only; the stations are invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { MAX_PAIRS, pivotConvertFile } from '../../src/core/convert/pivot';
import { BLOCK_CONV_RULES, judge } from '../../src/core/convert/policy';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
const longRows = (): Cell[][] => [
  ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', '8.10'],
  ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 34.2],
  ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Temperature', 'degC', 7.9],
  ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Salinity', 'PSU', 34.4],
];
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);
const pivoted = (header: string[], rows: Cell[][], opts: { decimalComma?: boolean } = {}) => {
  const raw = fileOf(header, rows, 'S', opts);
  const file = pivotConvertFile(raw);
  return { raw, file, sheet: file.sheets[0] };
};
const run = (header: string[], rows: Cell[][]) => {
  const { file } = pivoted(header, rows);
  return convert({ sheets: [sheetInput(file, { profile: { depthIds: true } })] });
};

describe('a long environmental sheet is read as one row per sample', () => {
  it('Parameter / Unit / Value: one column per (parameter, unit), the original cells, the original lines', () => {
    const { sheet } = pivoted(H, longRows());
    expect(sheet.header).toEqual(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Temperature [degC]', 'Salinity [PSU]']);
    expect(sheet.rows.map((r) => r.cells)).toEqual([
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, '8.10', 34.2],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 7.9, 34.4],
    ]);
    expect(sheet.rows.map((r) => r.line)).toEqual([2, 4]);
    expect(sheet.pivot?.cellLines[4]).toEqual([4, 5]);
    expect(sheet.pivot).toMatchObject({ rowsIn: 4, samples: 2 });
  });

  it('is the case in Polish, German and French spellings of the headers, with the unit column optional', () => {
    for (const [p, u, v] of [['parametr', 'jednostka', 'wartość'], ['Parameter', 'Einheit', 'Wert'], ['Paramètre', 'Unité', 'Valeur']]) {
      const { sheet } = pivoted(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', p, u, v], longRows());
      expect(sheet.header.slice(5), p).toEqual(['Temperature [degC]', 'Salinity [PSU]']);
    }
    const { sheet } = pivoted(['Station', 'Depth_m', 'Parameter', 'Value'], [['ZL1', 5, 'Temperature', 8.1], ['ZL1', 5, 'Salinity', 34.2]]);
    expect(sheet.header).toEqual(['Station', 'Depth_m', 'Temperature', 'Salinity']);
  });

  it('converts: the pivoted columns are measured variables of a profile level, no long block', () => {
    const r = run(H, longRows());
    expect(ids(r)).toContain('CONV-LONG-READ');
    expect(ids(r)).not.toContain('CONV-LONG-UNSUPPORTED');
    expect(ids(r)).not.toContain('CONV-LONG-DUPLICATE');
    expect(r.measurements.length).toBeGreaterThanOrEqual(4);
    expect(r.stats.levels).toBe(2);
  });

  it('a single-sample long sheet becomes one row', () => {
    const { sheet } = pivoted(H, longRows().slice(0, 2));
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.header.slice(5)).toEqual(['Temperature [degC]', 'Salinity [PSU]']);
  });

  it('a row whose key is entirely empty is its own group', () => {
    const { sheet } = pivoted(['Parameter', 'Unit', 'Value'], [['Temperature', 'degC', 8.1], ['Salinity', 'PSU', 34.2], ['Temperature', 'degC', 7.9]]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.pivot?.duplicates).toEqual([]);
  });

  it('two units of one parameter are two columns', () => {
    const { sheet } = pivoted(['Station', 'Parameter', 'Unit', 'Value'], [['ZL1', 'Oxygen', 'ml/l', 6.1], ['ZL1', 'Oxygen', 'umol/l', 270], ['ZL1', 'Salinity', 'PSU', 34]]);
    expect(sheet.header).toEqual(['Station', 'Oxygen [ml/l]', 'Oxygen [umol/l]', 'Salinity [PSU]']);
    expect(sheet.rows).toHaveLength(1);
  });

  it('exact digits: the cell is the original cell (a decimal comma is left to the converter, as everywhere)', () => {
    const { sheet } = pivoted(['Station', 'Parameter', 'Value'], [['ZL1', 'Temperature', '8,10'], ['ZL1', 'Salinity', '34,200']], { decimalComma: true });
    expect(sheet.rows[0].cells).toEqual(['ZL1', '8,10', '34,200']);
  });

  it('a header that collides with another header gets " (2)", and it is said', () => {
    const { sheet } = pivoted(['Station', 'Parameter', 'Value'], [['ZL1', 'Station', 1], ['ZL1', 'Temperature', 8.1]]);
    expect(sheet.header).toEqual(['Station', 'Station (2)', 'Temperature']);
    expect(sheet.pivot?.renamed).toEqual(['Station (2)']);
    const r = convert({ sheets: [sheetInput(pivotConvertFile(fileOf(['Station', 'Parameter', 'Value'], [['ZL1', 'Station', 1], ['ZL1', 'Temperature', 8.1]])), { profile: { depthIds: true } })] });
    expect(ids(r)).toContain('CONV-LONG-RENAMED');
    // the same parameter written with different case and the same unit text is two parameters, with unique headers
    const b = pivoted(['Station', 'Parameter', 'Value'], [['ZL1', 'Temp', 1], ['ZL1', 'temp', 2]]);
    expect(new Set(b.sheet.header.map((h) => h.toLowerCase())).size).toBe(b.sheet.header.length);
  });
});

describe('what is NOT a long environmental sheet stays as it is (the regression cases of the abandoned attempt)', () => {
  const same = (header: string[], rows: Cell[][]) => {
    const raw = fileOf(header, rows);
    expect(pivotConvertFile(raw)).toBe(raw);
  };
  it('a long biology sheet is never pivoted: Taxon + Analysis + Count; Taxon, Quantity, Unit, Value; scientificName, parameter, unit, value', () => {
    same(['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Analysis', 'Count'], [['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 'net', 4], ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 'net', 9]]);
    same(['Taxon', 'Quantity', 'Unit', 'Value'], [['Calanus finmarchicus', 4, 'ind', 4], ['Oithona similis', 9, 'ind', 9]]);
    same(['scientificName', 'parameter', 'unit', 'value'], [['Calanus finmarchicus', 'abundance', 'ind/m3', 4], ['Oithona similis', 'biomass', 'mg/m3', 9]]);
  });
  it('a Polish and an English bio sheet with a Parameter / Result column next to a taxon column are not pivoted', () => {
    same(['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Parameter', 'Result'], [['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4, 'temperature', 8.1], ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 9, 'salinity', 34]]);
    same(['Stacja', 'Data', 'Szerokość', 'Długość', 'Takson', 'Liczba osobników', 'Parametr', 'Wartość'], [['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4, 'temperatura', 8.1], ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 9, 'zasolenie', 34]]);
  });
  it('a wide sheet with Analysis = CTD stays wide', () => {
    same(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Analysis', 'Temperature'], [['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CTD', 8.1], ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CTD', 8.4]]);
  });
  it('a wide sheet with Parameter / Value columns next to a measured variable stays wide', () => {
    same(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Salinity', 'Value'], [['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CTD', 34.1, 'good'], ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CTD', 34.3, 'good']]);
    same(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Variable', 'Temperature', 'Result'], [['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CR1', 8.1, 'ok'], ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CR1', 8.4, 'ok']]);
  });
});

describe('distinct samples are never merged (the key is every other column)', () => {
  it('water depth, sediment_depth, Cast and Replicate each keep samples apart', () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Water depth', 'sediment_depth', 'Cast', 'Replicate', 'Parameter', 'Unit', 'Value'];
    const rows: Cell[][] = [];
    for (const [wd, sd, cast, rep] of [[50, 0, 1, 'a'], [60, 0, 1, 'a'], [50, 5, 1, 'a'], [50, 0, 2, 'a'], [50, 0, 1, 'b']] as [number, number, number, string][]) {
      rows.push(['ZL1', '2023-06-14', 55.5, 2.5, wd, sd, cast, rep, 'Temperature', 'degC', 8], ['ZL1', '2023-06-14', 55.5, 2.5, wd, sd, cast, rep, 'Salinity', 'PSU', 34]);
    }
    const { sheet } = pivoted(header, rows);
    expect(sheet.rows).toHaveLength(5);
    expect(sheet.pivot?.duplicates).toEqual([]);
  });
});

describe('quality flags', () => {
  it('a flag-like PARAMETER (Temp_QC) is not a measurement: its rows are skipped, with one note', () => {
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temp', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temp_QC', '', 1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Sal', 'PSU', 34],
    ];
    const { sheet } = pivoted(H, rows);
    expect(sheet.header.slice(5)).toEqual(['Temp [degC]', 'Sal [PSU]']);
    expect(sheet.pivot).toMatchObject({ flagParameters: ['Temp_QC'], flagRows: 1 });
    const r = run(H, rows);
    expect(r.findings.filter((f) => f.ruleId === 'CONV-LONG-FLAG-PARAMETERS')).toHaveLength(1);
    expect(r.findings.find((f) => f.ruleId === 'CONV-LONG-FLAG-PARAMETERS')?.params).toMatchObject({ count: 1, names: 'Temp_QC', rows: 1 });
  });
  it('a flag COLUMN is not part of the key (it would split a sample) and is said', () => {
    const header = ['Station', 'Depth_m', 'Parameter', 'Value', 'Value_QC'];
    const { sheet } = pivoted(header, [['ZL1', 5, 'Temperature', 8.1, 1], ['ZL1', 5, 'Salinity', 34, 2]]);
    expect(sheet.header).toEqual(['Station', 'Depth_m', 'Temperature', 'Salinity']);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.pivot?.flagColumns).toEqual(['Value_QC']);
  });
});

describe('what the reader cannot read blocks, never falls back to a wide sheet', () => {
  it('the same sample, parameter and unit twice blocks, whatever the values ("<0.1" then 0.5), and cites the original lines', () => {
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Nitrate', 'umol/l', '<0.1'],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Silicate', 'umol/l', 2],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Nitrate', 'umol/l', 0.5],
      ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'Nitrate', 'umol/l', 0.3],
    ];
    const r = run(H, rows);
    const d = r.findings.filter((f) => f.ruleId === 'CONV-LONG-DUPLICATE');
    expect(d).toHaveLength(1);
    expect(d[0].lines).toEqual([2, 4]);
    expect(d[0].field).toBe('Nitrate [umol/l]');
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toContain('CONV-LONG-DUPLICATE');
    expect(r.ok).toBe(false);
    // equal values too
    const same = run(H, [rows[0], rows[0], rows[1]]);
    expect(ids(same)).toContain('CONV-LONG-DUPLICATE');
  });

  it('a duplicate is per sample and per parameter and unit: another unit, another sample or another cast is not one', () => {
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Nitrate', 'umol/l', 1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Nitrate', 'mg/l', 2],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Nitrate', 'umol/l', 3],
    ];
    expect(ids(run(H, rows))).not.toContain('CONV-LONG-DUPLICATE');
  });

  it('a value with no parameter name blocks (CONV-LONG-NO-PARAMETER); a row with neither is nothing', () => {
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, '', 'degC', 7.7],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, '', '', null],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 34],
    ];
    const r = run(H, rows);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-LONG-NO-PARAMETER');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
    expect(r.ok).toBe(false);
  });

  const blocked = (header: string[], rows: Cell[][]) => {
    const raw = fileOf(header, rows);
    expect(pivotConvertFile(raw)).toBe(raw);
    return convert({ sheets: [sheetInput(raw, { profile: { positionStation: true } })] });
  };
  it('fewer than two distinct parameters: CONV-LONG-UNSUPPORTED with its own sentence', () => {
    const r = blocked(H, [['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 8.1], ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Temperature', 'degC', 7.9]]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-LONG-UNSUPPORTED');
    expect(f?.params).toMatchObject({ reason: 'one-parameter', count: 1 });
    for (const lang of LANGS) expect(renderConvertPlain(f!, lang), lang).toMatch(lang === 'en' ? /fewer than two different values/ : lang === 'pl' ? /mniej niż dwie różne wartości/ : lang === 'de' ? /weniger als zwei verschiedene Werte/ : /moins de deux valeurs différentes/);
    expect(r.ok).toBe(false);
  });
  it(`more than ${MAX_PAIRS} (parameter, unit) pairs: CONV-LONG-UNSUPPORTED with its own sentence; exactly ${MAX_PAIRS} is read`, () => {
    const many = (n: number): Cell[][] => Array.from({ length: n }, (_, i) => ['ZL1', '2023-06-14', 55.5, 2.5, 5, `P${i}`, 'x', i]);
    const r = blocked(H, many(MAX_PAIRS + 1));
    const f = r.findings.find((x) => x.ruleId === 'CONV-LONG-UNSUPPORTED');
    expect(f?.params).toMatchObject({ reason: 'too-many', count: MAX_PAIRS + 1 });
    for (const lang of LANGS) expect(renderConvertPlain(f!, lang), lang).toContain(String(MAX_PAIRS + 1));
    expect(renderConvertPlain(f!, 'en')).toContain('more than 200');
    const ok = pivoted(H, many(MAX_PAIRS));
    expect(ok.sheet.pivot?.pivoted).toHaveLength(MAX_PAIRS);
  });
  it('rows x distinct parameters cannot explode: 10 000 rows with 5 000 distinct parameters is a block, decided at once', () => {
    const rows: Cell[][] = Array.from({ length: 10_000 }, (_, i) => [`ZL${i % 50}`, '2023-06-14', 55.5, 2.5, 5, `P${i % 5000}`, 'x', i + 0.5]);
    const t0 = performance.now();
    const r = blocked(H, rows);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.findings.find((x) => x.ruleId === 'CONV-LONG-UNSUPPORTED')?.params.reason).toBe('too-many');
  });
  it('the pairs count units: 201 pairs of 2 parameters blocks too', () => {
    const rows: Cell[][] = Array.from({ length: MAX_PAIRS + 1 }, (_, i) => ['ZL1', '2023-06-14', 55.5, 2.5, 5, i % 2 === 0 ? 'A' : 'B', `u${i}`, i]);
    expect(blocked(H, rows).findings.find((x) => x.ruleId === 'CONV-LONG-UNSUPPORTED')?.params.reason).toBe('too-many');
  });
});

describe('line numbers', () => {
  it('a finding on a pivoted cell cites the ORIGINAL line, and the field is the full pivoted header', () => {
    const rows: Cell[][] = [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Temperature', 'degC', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'Salinity', 'PSU', 34],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Temperature', 'degC', 'abc'],
      ['ZL1', '2023-06-14', 55.5, 2.5, 10, 'Salinity', 'PSU', 'oops'],
    ];
    const r = run(H, rows);
    const f = r.findings.filter((x) => x.ruleId === 'ROW-NON-NUMERIC');
    expect(f.map((x) => [x.field, x.lines])).toEqual(expect.arrayContaining([['Temperature [degC]', [4]], ['Salinity [PSU]', [5]]]));
  });
});

describe('CONV-NO-OCCURRENCES is not said while the kind of number is still undeclared', () => {
  const bio = fileOf(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count'], [['ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4], ['ZL2', 'ZL2-a', '2023-06-15', 55.6, 2.6, 'Oithona similis', 9]]);
  it('a sheet with a taxon and a count column and no declared kind: the quantity block says what to do, not "environmental data alone"', () => {
    const r = convert({ sheets: [sheetInput(bio)], approvedSplits: {} });
    expect(ids(r)).toContain('CONV-QUANTITY-UNDECLARED');
    expect(ids(r)).not.toContain('CONV-NO-OCCURRENCES');
    expect(r.ok).toBe(false);
    // once declared, the records exist and nothing of this is said
    expect(ids(convert({ sheets: [sheetInput(bio, { quantity: { kind: 'count' } })], approvedSplits: {} }))).not.toContain('CONV-NO-OCCURRENCES');
  });
  it('a genuinely environment-only upload still gets it', () => {
    const env = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Temperature'], [['ZL1', '2023-06-14', 55.5, 2.5, 5, 8.1], ['ZL2', '2023-06-15', 55.6, 2.6, 5, 8.4]]);
    expect(ids(convert({ sheets: [sheetInput(env, { profile: { positionStation: true } })] }))).toContain('CONV-NO-OCCURRENCES');
    expect(ids(convert({ sheets: [sheetInput(env)] }))).toContain('CONV-NO-OCCURRENCES');
  });
});

describe('texts', () => {
  it('the new rules are registered, in four languages; the blocking ones block', () => {
    expect(BLOCK_CONV_RULES).toEqual(expect.arrayContaining(['CONV-LONG-DUPLICATE', 'CONV-LONG-NO-PARAMETER']));
    const params = { parameterColumn: 'parametr', valueColumn: 'wartość', rows: 40, samples: 2, columns: 3, count: 2, names: 'A, B' };
    for (const id of ['CONV-LONG-READ', 'CONV-LONG-FLAG-COLUMNS', 'CONV-LONG-FLAG-PARAMETERS', 'CONV-LONG-RENAMED', 'CONV-LONG-DUPLICATE', 'CONV-LONG-NO-PARAMETER']) {
      const f = makeConvertFinding(id, { file: 'a.csv', sheet: 'S', field: 'TEMP [degC]', lines: [3, 9], params: { ...params, columns: id === 'CONV-LONG-FLAG-COLUMNS' ? 'X_QC' : 3 } });
      for (const lang of LANGS) expect(renderConvertPlain(f, lang), `${id} ${lang}`).not.toMatch(/\{/);
    }
    const one = makeConvertFinding('CONV-LONG-READ', { file: 'a.csv', sheet: 'S', params: { ...params, samples: 1 } });
    expect(renderConvertPlain(one, 'pl')).toContain('1 próbkę');
    expect(renderConvertPlain({ ...one, params: { ...one.params, samples: 3 } }, 'pl')).toContain('3 próbki');
    expect(renderConvertPlain({ ...one, params: { ...one.params, samples: 5 } }, 'pl')).toContain('5 próbek');
  });
});

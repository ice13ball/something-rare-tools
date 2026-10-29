// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A transposed sheet in the converter (CONV-SHEET-TRANSPOSED): species or variables in rows, samples in columns. Detected with /check's reading plus a species-in-rows test, blocked,
// never run on a normal wide species sheet, a long sheet, a profile sheet or a pivot; "read as a normal table" lifts it. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { transposedSheetReason } from '../../src/core/convert/transposed';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { parseFile } from '../../src/core/parse';
import { proposeLayout } from '../../src/core/recognize/layout';
import type { Finding } from '../../src/core/types';
import { L1_HEADER, L1_ROWS, W1_HEADER, W1_ROWS, fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

/** Species in rows: the first column holds the names, the other headers are sample codes. */
const TAXA_HEADER = ['Species', 'A1', 'A2', 'A3', 'B1'];
const TAXA_ROWS: Cell[][] = [
  ['Calanus finmarchicus', 10, 4, 0, 7],
  ['Oithona similis', 5, 8, 2, 1],
  ['Pseudocalanus sp.', 3, 0, 9, 4],
  ['Calanus cf. glacialis', 1, 2, 0, 0],
];
/** Variables in rows: /check's own case. */
const VARS_HEADER = ['Variable', 'S1', 'S2', 'S3'];
const VARS_ROWS: Cell[][] = [
  ['Latitude', 55.1, 55.2, 55.3],
  ['Longitude', 2.1, 2.2, 2.3],
  ['Depth', 10, 20, 30],
  ['Temperature', 11.2, 10.9, 10.1],
];

describe('transposedSheetReason', () => {
  it('species in rows is transposed-taxa, variables in rows is transposed (as /check says)', () => {
    const taxa = fileOf(TAXA_HEADER, TAXA_ROWS);
    expect(transposedSheetReason(taxa.sheets[0], taxa)).toBe('transposed-taxa');
    const vars = fileOf(VARS_HEADER, VARS_ROWS);
    expect(transposedSheetReason(vars.sheets[0], vars)).toBe('transposed');
    expect(proposeLayout(vars).unsupportedReasons?.[0].code).toBe('transposed');
  });

  it('a species table with a total column and presence marks is still read as species in rows', () => {
    const f = fileOf(['Taxon', 'A1', 'A2', 'A3', 'Total'], [['Calanus finmarchicus', '+', 'x', 3, 4], ['Oithona similis', 5, '+', 2, 7], ['Pseudocalanus sp.', 1, 2, 3, 6]]);
    expect(transposedSheetReason(f.sheets[0], f)).toBe('transposed-taxa');
  });

  it('a normal wide species sheet (species are the headers) is NOT transposed', () => {
    const f = fileOf(W1_HEADER, W1_ROWS);
    expect(transposedSheetReason(f.sheets[0], f)).toBeUndefined();
    // without any position or date column either: only a sample code and species headers
    const bare = fileOf(['Sample', 'Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.'], [['A1', 10, 5, 3], ['A2', 4, 8, 0], ['A3', 0, 2, 9], ['B1', 7, 1, 4]]);
    expect(transposedSheetReason(bare.sheets[0], bare)).toBeUndefined();
    // the same with no header over the sample column
    const unnamed = fileOf(['', 'Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.'], [['A1', 10, 5, 3], ['A2', 4, 8, 0], ['A3', 0, 2, 9]]);
    expect(transposedSheetReason(unnamed.sheets[0], unnamed)).toBeUndefined();
  });

  it('a long sheet, with the species in its first column, is NOT transposed', () => {
    const f = fileOf(['Species', 'Sample', 'Count', 'Station'], [['Calanus finmarchicus', 'A1', 4, 'S1'], ['Oithona similis', 'A1', 5, 'S1'], ['Calanus finmarchicus', 'A2', 7, 'S2'], ['Oithona similis', 'A2', 1, 'S2']]);
    expect(transposedSheetReason(f.sheets[0], f)).toBeUndefined();
    const l1 = fileOf(L1_HEADER, L1_ROWS);
    expect(transposedSheetReason(l1.sheets[0], l1)).toBeUndefined();
  });

  it('a table of place names against months, or of two species rows only, is not flagged', () => {
    const few = fileOf(TAXA_HEADER, TAXA_ROWS.slice(0, 2));
    expect(transposedSheetReason(few.sheets[0], few)).toBeUndefined();
    const text = fileOf(['Species', 'A1', 'A2', 'A3'], [['Calanus finmarchicus', 'many', 'few', 'none'], ['Oithona similis', 'few', 'few', 'none'], ['Pseudocalanus sp.', 'none', 'many', 'few']]);
    expect(transposedSheetReason(text.sheets[0], text)).toBeUndefined();
  });

  it('a pivot of a long sheet is never tested', () => {
    const f = fileOf(TAXA_HEADER, TAXA_ROWS);
    const sheet = { ...f.sheets[0], pivot: {} as never };
    expect(transposedSheetReason(sheet, f)).toBeUndefined();
  });
});

describe('convert: CONV-SHEET-TRANSPOSED', () => {
  const run = (header: string[], rows: Cell[][], extra: Parameters<typeof sheetInput>[1] = {}) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, ...extra })] });

  it('a transposed species table is not read and blocks, with the reason', () => {
    const r = run(TAXA_HEADER, TAXA_ROWS);
    const m = find(r.blocking, 'CONV-SHEET-TRANSPOSED');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ severity: 'error', sheet: 'S', params: { reason: 'transposed-taxa' } });
    expect(r.events).toEqual([]);
    expect(r.occurrences).toEqual([]);
  });

  it('variables in rows blocks with the /check reason', () => {
    const r = run(VARS_HEADER, VARS_ROWS);
    expect(find(r.blocking, 'CONV-SHEET-TRANSPOSED')[0].params.reason).toBe('transposed');
  });

  it('"read as a normal table" reads the sheet as it stands, without the block', () => {
    const r = run(TAXA_HEADER, TAXA_ROWS, { readAsTable: true });
    expect(find(r.findings, 'CONV-SHEET-TRANSPOSED')).toEqual([]);
  });

  it('a normal wide sheet, a long sheet and a profile sheet are unchanged', () => {
    const wide = convert({ sheets: [sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: { kind: 'count' } })] });
    expect(find(wide.findings, 'CONV-SHEET-TRANSPOSED')).toEqual([]);
    expect(wide.occurrences.length).toBeGreaterThan(0);
    const long = convert({ sheets: [sheetInput(fileOf(L1_HEADER, L1_ROWS), { quantity: { kind: 'count' } })] });
    expect(find(long.findings, 'CONV-SHEET-TRANSPOSED')).toEqual([]);
    expect(long.occurrences).toHaveLength(3);
    const ctd = fileOf(['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'], [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11.2], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 10.9]]);
    const profile = convert({ sheets: [sheetInput(ctd, { profile: { depthIds: true } })] });
    expect(find(profile.findings, 'CONV-SHEET-TRANSPOSED')).toEqual([]);
  });

  it('a sheet marked as a profile file is not tested even if its rows look like species', () => {
    const r = run(TAXA_HEADER, TAXA_ROWS, { profile: {} });
    expect(find(r.findings, 'CONV-SHEET-TRANSPOSED')).toEqual([]);
  });

  it('the message names the reason in four languages and says how to fix it', () => {
    const f = run(TAXA_HEADER, TAXA_ROWS).blocking.find((x) => x.ruleId === 'CONV-SHEET-TRANSPOSED')!;
    expect(renderConvertPlain(f, 'en')).toMatch(/species in rows, samples in columns/);
    expect(renderConvertPlain(f, 'en')).toMatch(/Transpose the table/);
    expect(renderConvertPlain(f, 'pl')).toMatch(/gatunki w wierszach, próbki w kolumnach/);
    expect(renderConvertPlain(f, 'de')).toMatch(/Arten in Zeilen, Proben in Spalten/);
    expect(renderConvertPlain(f, 'fr')).toMatch(/espèces en lignes, échantillons en colonnes/);
    expect(renderConvertTechnical(f)).toMatch(/species in rows/);
    const v = run(VARS_HEADER, VARS_ROWS).blocking.find((x) => x.ruleId === 'CONV-SHEET-TRANSPOSED')!;
    expect(renderConvertPlain(v, 'pl')).toMatch(/zmienne w wierszach/);
  });
});

describe('a long species sheet is never transposed, whatever its other headers are', () => {
  const NAMES = ['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.', 'Calanus cf. glacialis'];
  const cases: string[][] = [
    ['Species', 'Nr der Probe', 'Anzahl'],
    ['Taxon', 'Haul', 'Count'],
    ['Species', 'Transect', 'Count'],
    ['Taxon', 'Year', 'Count'],
    ['Species', 'Replicate', 'Count'],
    ['Species', 'Frame', 'Count'],
    ['Species', 'Quadrat', 'Count'],
    ['Species', 'Grab', 'Count'],
    ['scientificName', 'individualCount', 'organismQuantity'],
    ['Species', 'AphiaID', 'Count'],
    ['Species', 'Abundance', 'Biomass [g]'],
    ['Gatunek', 'Liczebność', 'Biomasa'],
    ['Art', 'Anzahl', 'Biomasse'],
    ['Species', 'Length [mm]', 'Weight [mg]'],
  ];
  it.each(cases)('%s | %s | %s', (a, b, c) => {
    // numeric codes in the second column, numbers in the third: the cells look like a transposed table by their numbers alone
    const rows: Cell[][] = NAMES.map((n, i) => [n, 100 + i, 3 + i]);
    const f = fileOf([a, b, c], rows);
    const input = sheetInput(f, { quantity: { kind: 'count' }, shape: 'long' });
    expect(find(convert({ sheets: [input] }).findings, 'CONV-SHEET-TRANSPOSED'), `${a} | ${b} | ${c}`).toEqual([]);
    // the page's own test (the worker passes the proposals) agrees
    expect(transposedSheetReason(f.sheets[0], f, input.mapping.columns)).toBeUndefined();
  });

  it('the transposed species table is still found when the converter\'s reading is passed in', () => {
    const f = fileOf(TAXA_HEADER, TAXA_ROWS);
    expect(transposedSheetReason(f.sheets[0], f, sheetInput(f).mapping.columns)).toBe('transposed-taxa');
  });
});

describe('sample columns named like "Sample 1"', () => {
  it.each([['Sample 1', 'Sample 2', 'Sample 3'], ['Site 1', 'Site 2', 'Site 3'], ['2020-01', '2020-02', '2020-03']])('%s is a transposed species table', (a, b, c) => {
    const f = fileOf(['Species', a, b, c], TAXA_ROWS.map((r) => r.slice(0, 4)));
    expect(transposedSheetReason(f.sheets[0], f)).toBe('transposed-taxa');
  });
});

describe('the companion file keeps the tick', () => {
  it('transposedAsTable=<sheet> is written, read back and ignored when unknown', () => {
    const csv = writeConvertSidecar({ transposedAsTable: ['Data', 'Other'] });
    expect(csv).toContain('transposedAsTable=Data');
    const parsed = parseFile('side.csv', new TextEncoder().encode(csv));
    expect(readConvertSettings(parsed)?.transposedAsTable).toEqual(['Data', 'Other']);
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(writeConvertSidecar({ fullList: true }))))?.transposedAsTable).toBeUndefined();
  });
});

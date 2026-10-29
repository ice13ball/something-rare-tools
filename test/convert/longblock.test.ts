// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// CONV-LONG-UNSUPPORTED (a long environmental sheet is blocked, never misread), the IO PAN spellings of oxygen saturation, and the Polish number agreement of ROW-RAGGED.
// Synthetic sheets only; the stations are invented.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { lookupOf, readWormsRecord } from '../../src/core/convert/worms';
import type { WormsRecord } from '../../src/core/convert/worms';
import { createConvertHandler } from '../../src/worker/convert.handler';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { csvOf } from '../app/convertHelpers';
import { RECORDED, wormsRecord } from '../helpers/wormsFixtures';
import { exportSheet } from './exportHelpers';
import { BLOCK_CONV_RULES, judge } from '../../src/core/convert/policy';
import { VARIABLE_CONCEPTS } from '../../src/core/convert/vocab';
import { renderPlain } from '../../src/core/report';
import { makeFinding } from '../../src/core/rules/registry';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, fileOf, mappingOf, sheetInput } from './helpers';
import type { Cell } from './helpers';
import type { ColumnRole } from '../../src/core/types';

const longRows = (): Cell[][] => [
  ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'temperature', 'degC', 8.1],
  ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'salinity', 'psu', 34.2],
];
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

describe('CONV-LONG-UNSUPPORTED: a long environmental sheet is blocked', () => {
  const heads: [string, string[]][] = [
    ['parameter, unit, value', ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'parameter', 'unit', 'value']],
    ['Parameter, Unit, Value', ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value']],
    ['parametr, jednostka, wartość', ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'parametr', 'jednostka', 'wartość']],
    ['Parameter, Einheit, Wert', ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Einheit', 'Wert']],
  ];
  for (const [label, header] of heads) {
    it(`blocks ${label} and writes nothing`, () => {
      const file = fileOf(header, longRows());
      const r = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })] });
      const f = r.findings.filter((x) => x.ruleId === 'CONV-LONG-UNSUPPORTED');
      expect(f).toHaveLength(1);
      expect(f[0].sheet).toBe('S');
      expect(f[0].params).toEqual({ parameterColumn: header[5], valueColumn: header[7] });
      expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-LONG-UNSUPPORTED');
      expect(r.ok).toBe(false);
      expect(r.events).toEqual([]);
      expect(r.occurrences).toEqual([]);
      expect(r.measurements).toEqual([]);
      expect(r.stats.samples).toBe(0);
    });
  }

  it('is blocked as a profile sheet too, and writes nothing', () => {
    const file = fileOf(heads[1][1], longRows());
    const r = convert({ sheets: [sheetInput(file, { profile: { positionStation: true } })] });
    expect(ids(r)).toContain('CONV-LONG-UNSUPPORTED');
    expect(r.events).toEqual([]);
    expect(r.measurements).toEqual([]);
  });

  it('is raised per sheet that is converted: a sheet left out ("Convert this sheet" unticked) raises nothing', () => {
    expect(ids(convert({ sheets: [] }))).not.toContain('CONV-LONG-UNSUPPORTED');
  });

  it('is a registered blocking rule, in four languages, that names both columns and says what to do', () => {
    expect(BLOCK_CONV_RULES).toContain('CONV-LONG-UNSUPPORTED');
    const f = makeConvertFinding('CONV-LONG-UNSUPPORTED', { file: 'a.csv', sheet: 'S', params: { parameterColumn: 'parametr', valueColumn: 'wartość' } });
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      const t = renderConvertPlain(f, lang);
      expect(t, lang).toContain('parametr');
      expect(t, lang).toContain('wartość');
      expect(t, lang).toContain('[°C]');
      expect(t, lang).not.toMatch(/\{\w+\}/);
    }
    expect(renderConvertPlain(f, 'pl')).toContain('Arkusz „S”');
    expect(renderConvertPlain(f, 'de')).toContain('Das Blatt „S“');
    expect(renderConvertPlain(f, 'fr')).toContain('La feuille « S »');
  });

  it('does not fire on a wide sheet with an "Analysis" column', () => {
    const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Analysis', 'Temperature'], [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CTD', 8.1],
      ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CTD', 8.4],
    ]);
    const s = sheetInput(file, { profile: { positionStation: true } });
    expect(s.mapping.columns.find((c) => c.header === 'Temperature')!.role).toMatchObject({ kind: 'variable', variable: 'temperature' });
    expect(ids(convert({ sheets: [s] }))).not.toContain('CONV-LONG-UNSUPPORTED');
  });

  it('does not fire on a wide sheet whose Variable / Result columns hold something else (a measured variable sits next to them)', () => {
    const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Variable', 'Temperature', 'Result'], [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CR1', 8.1, 'ok'],
      ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CR1', 8.4, 'ok'],
    ]);
    expect(ids(convert({ sheets: [sheetInput(file, { profile: { positionStation: true } })] }))).not.toContain('CONV-LONG-UNSUPPORTED');
    const file2 = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Salinity', 'Value'], [
      ['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CTD', 34.1, 'good'],
      ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CTD', 34.3, 'good'],
    ]);
    expect(ids(convert({ sheets: [sheetInput(file2, { profile: { positionStation: true } })] }))).not.toContain('CONV-LONG-UNSUPPORTED');
  });

  it('goes away on the page when the user gives the parameter or the value column another role (ignore)', () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const asProposed = convert({ sheets: [sheetInput(fileOf(header, longRows()))] });
    expect(ids(asProposed)).toContain('CONV-LONG-UNSUPPORTED');
    const edits: Record<string, ColumnRole>[] = [{ Value: { kind: 'ignore' as const } }, { Parameter: { kind: 'sampleId' as const } }, { Value: { kind: 'ignore' as const }, Parameter: { kind: 'ignore' as const } }];
    for (const edit of edits) {
      expect(ids(convert({ sheets: [sheetInput(fileOf(header, longRows()), { edit })] })), JSON.stringify(edit)).not.toContain('CONV-LONG-UNSUPPORTED');
    }
  });

  it('a value column the page sent as "ignore" because its taxon candidate is unconfirmed still counts as the proposal (unconfirmedTaxa); a plain "ignore" is the user\'s edit', () => {
    const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'];
    const edit = { Value: { kind: 'ignore' as const } };
    expect(ids(convert({ sheets: [sheetInput(fileOf(header, longRows()), { edit, unconfirmedTaxa: [7] })] }))).toContain('CONV-LONG-UNSUPPORTED');
    expect(ids(convert({ sheets: [sheetInput(fileOf(header, longRows()), { edit })] }))).not.toContain('CONV-LONG-UNSUPPORTED');
  });

  it('tells a long biology sheet with an unrecognised taxon column what to mark instead, in four languages', () => {
    const f = makeConvertFinding('CONV-LONG-UNSUPPORTED', { file: 'a.csv', sheet: 'S', params: { parameterColumn: 'Parameter', valueColumn: 'Value' } });
    expect(renderConvertPlain(f, 'en')).toContain('mark the taxon column and the count');
    expect(renderConvertPlain(f, 'pl')).toContain('zaznacz powyżej kolumnę taksonu');
    expect(renderConvertPlain(f, 'de')).toContain('Taxon- und die Anzahlspalte');
    expect(renderConvertPlain(f, 'fr')).toContain('la colonne du taxon');
  });

  it('does not fire on a taxon sheet that also has a Parameter and a Result column', () => {
    const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Parameter', 'Result'], [
      ['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4, 'temperature', 8.1],
      ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 9, 'temperature', 8.1],
    ]);
    const s = sheetInput(file, { quantity: { kind: 'count' } });
    expect(s.shape).toBe('long');
    expect(ids(convert({ sheets: [s] }))).not.toContain('CONV-LONG-UNSUPPORTED');
  });
});

/* The converted output of long biology sheets is the output of origin/main: the snapshot was generated at origin/main (2b2d854) by running this file there with LB_WRITE set (the archives and the worker part included). */
const SNAP = new URL('./longblock.snap.json', import.meta.url);
const bioCases = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const taxonCount = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count'], [
    ['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4],
    ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 9],
    ['ZL2', '2023-06-15', 55.6, 2.6, 'Calanus finmarchicus', 1],
  ]);
  out['taxon-count'] = convert({ sheets: [sheetInput(taxonCount, { quantity: { kind: 'count' } })], approvedSplits: {} });
  const sciParam = fileOf(['scientificName', 'parameter', 'unit', 'value'], [
    ['Calanus finmarchicus', 'abundance', 'ind/m3', 4],
    ['Oithona similis', 'abundance', 'ind/m3', 9],
  ]);
  out['scientificName-parameter-unit-value'] = convert({ sheets: [sheetInput(sciParam, { quantity: { kind: 'density', unit: '#/m3' } })], approvedSplits: {} });
  out['mapping-scientificName-parameter-unit-value'] = mappingOf(sciParam).columns.map((c) => [c.header, c.role]);
  out['L1'] = convert({ sheets: [sheetInput(fileOf(L1_HEADER, L1_ROWS.map((r) => [...r])))], approvedSplits: {} });
  out['L2'] = convert({ sheets: [sheetInput(fileOf(L2_HEADER, L2_ROWS.map((r) => [...r])), { quantity: { kind: 'count' } })], approvedSplits: {} });
  out['W1'] = convert({ sheets: [sheetInput(fileOf(W1_HEADER, W1_ROWS.map((r) => [...r])), { quantity: W1_QUANTITY })], options: { fullList: true }, approvedSplits: {} });
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
};

/* The ARCHIVES (every file of the zip as text, and the zip's own hash) of long biology sheets, WoRMS off and on (the test stub, no network), and what the worker makes of each dropped file
 * (its sheets, mappings and suggestions): both generated at origin/main (2b2d854) and compared here byte for byte. */
const BIO_SHEETS: Record<string, { header: string[]; rows: Cell[][]; edit?: Record<string, ColumnRole> }> = {
  english: {
    header: ['Cruise', 'Station', 'Sample code', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Taxon', 'AphiaID', 'Count'],
    rows: [
      ['ZC1', 'ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 5, 'Calanus finmarchicus', 104464, 4],
      ['ZC1', 'ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 5, 'Oithona similis', 106656, 9],
      ['ZC1', 'ZL2', 'ZL2-a', '2023-06-15', 55.6, 2.6, 10, 'Calanus finmarchicus', 104464, 1],
    ],
  },
  polish: {
    header: ['Rejs', 'Stacja', 'Kod próby', 'Data', 'Szerokość', 'Długość', 'Głębokość [m]', 'Takson', 'AphiaID', 'Liczba osobników'],
    rows: [
      ['ZR1', 'ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 5, 'Calanus finmarchicus', 104464, 4],
      ['ZR1', 'ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 5, 'Oithona similis', 106656, 9],
      ['ZR1', 'ZL2', 'ZL2-a', '2023-06-15', 55.6, 2.6, 10, 'Calanus finmarchicus', 104464, 1],
    ],
  },
  'taxon-analysis-count': {
    header: ['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Analysis', 'Count'],
    rows: [['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 'net', 4], ['ZL1', '2023-06-14', 55.5, 2.5, 'Oithona similis', 'net', 9]],
  },
  'taxon-quantity-unit-value': {
    header: ['Taxon', 'Quantity', 'Unit', 'Value'],
    rows: [['Calanus finmarchicus', 4, 'ind', 4], ['Oithona similis', 9, 'ind', 9]],
  },
  'scientificName-parameter-unit-value': {
    header: ['scientificName', 'parameter', 'unit', 'value'],
    rows: [['Calanus finmarchicus', 'abundance', 'ind/m3', 4], ['Oithona similis', 'abundance', 'ind/m3', 9]],
  },
  'taxon-with-parameter-result': {
    header: ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Parameter', 'Result'],
    rows: [['ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4, 'temperature', 8.1], ['ZL1', 'ZL1-a', '2023-06-14', 55.5, 2.5, 'Oithona similis', 9, 'temperature', 8.1]],
  },
  'wide-analysis-ctd': {
    header: ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Analysis', 'Temperature'],
    rows: [['ZL1', '2023-06-14', 55.5, 2.5, 5, 'CTD', 8.1], ['ZL2', '2023-06-15', 55.6, 2.6, 5, 'CTD', 8.4]],
  },
};
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const wormsStub = () => {
  const rec = (name: string): WormsRecord[] => (RECORDED[name] as unknown[]).map((r) => readWormsRecord(r) as WormsRecord);
  return lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Oithona similis': [readWormsRecord(wormsRecord({ AphiaID: 106656, scientificname: 'Oithona similis' })) as WormsRecord] }, {});
};
async function archiveCases(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(BIO_SHEETS)) {
    for (const worms of [false, true]) {
      const r = await exportSheet(s.header, s.rows.map((x) => [...x]), { quantity: { kind: 'count' }, ...(worms ? { worms: wormsStub() } : {}) });
      out[`${name}${worms ? '+worms' : ''}`] = {
        blocking: judge(r.findings).blocking.map((f) => f.ruleId),
        findings: r.findings,
        files: Object.fromEntries(r.files.map((f) => [f.name, new TextDecoder().decode(f.data)])),
        zip: sha256(r.zip),
      };
    }
  }
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}
/** What the worker makes of each dropped file: its sheets, mappings and suggestions, as the page gets them. */
function workerCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(BIO_SHEETS)) {
    const h = createConvertHandler();
    const res = h.handle({ type: 'parse', files: [{ name: `${name}.csv`, bytes: new TextEncoder().encode(csvOf(s.header, s.rows)), source: 'dropped' }] }) as ConvertParseResult;
    const f = res.files[0];
    out[name] = { sheets: f.sheets, mappings: f.mappings, shapes: f.suggestedShapes, profiles: f.suggestedProfiles, hasPivots: 'pivots' in f };
  }
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

describe('long biology sheets keep the output of origin/main', () => {
  const now = bioCases();
  it('no CONV-LONG-UNSUPPORTED on any of them', () => {
    for (const [k, v] of Object.entries(now)) expect(JSON.stringify(v), k).not.toContain('CONV-LONG-UNSUPPORTED');
  });
  it('identical to the snapshot generated at origin/main: the conversions, the archives (WoRMS off and on) and what the worker reads of each file', async () => {
    const snapshot = { ...now, archives: await archiveCases(), worker: workerCases() };
    if (process.env.LB_WRITE) {
      writeFileSync(process.env.LB_WRITE, JSON.stringify(snapshot, null, 1));
      return;
    }
    expect(snapshot).toEqual(JSON.parse(readFileSync(SNAP, 'utf8')));
  });
  it('the Polish and the English bio sheets really produce an archive (they are not blocked), so that the snapshot compares something', async () => {
    const a = (await archiveCases()) as Record<string, { blocking: string[]; files: Record<string, string> }>;
    for (const k of ['english', 'polish', 'english+worms', 'polish+worms']) {
      expect(a[k].blocking, k).toEqual([]);
      expect(Object.keys(a[k].files), k).toContain('occurrence.txt');
    }
  });
  it('the taxon + count sheet really is long', () => {
    const s = sheetInput(fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count'], [['ZL1', '2023-06-14', 55.5, 2.5, 'Calanus finmarchicus', 4]]));
    expect(s.shape).toBe('long');
  });
});

describe('oxygen saturation in the IO PAN underscore style', () => {
  const spellings = ['O2_sat_%', 'O2_sat', 'O2sat_%', 'O2_saturation_%', 'Oxygen_saturation_%', 'O2_sat_pct'];
  const file = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'O2 [%]', ...spellings], [
    ['ZL1', '2023-06-14', 55.5, 2.5, 5, 95, 96, 97, 98, 99, 100, 101],
    ['ZL2', '2023-06-15', 55.6, 2.6, 5, 90, 91, 92, 93, 94, 95, 96],
  ]);
  const m = mappingOf(file);
  const roleOf = (h: string) => m.columns.find((c) => c.header === h)!.role;
  it('every spelling is a variable "oxygen saturation", never a taxon candidate, like "O2 [%]"', () => {
    expect(roleOf('O2 [%]')).toMatchObject({ kind: 'variable', variable: 'oxygen saturation', unit: '%' });
    for (const h of spellings) {
      expect(roleOf(h), h).toMatchObject({ kind: 'variable', variable: 'oxygen saturation' });
      if (h !== 'O2_sat') expect(roleOf(h), h).toMatchObject({ unit: '%' });
    }
    expect(m.columns.filter((c) => c.role.kind === 'taxon')).toEqual([]);
  });
  it('is offered the saturation concept only, no water-concentration concept', () => {
    expect(VARIABLE_CONCEPTS['oxygen saturation'].map((c) => c.kind)).toEqual(['generic']);
  });
  it('a sheet with them converts with no CONV-NO-TAXON and no CONV-LONG-UNSUPPORTED', () => {
    const r = convert({ sheets: [sheetInput(file, { profile: { positionStation: true } })] });
    expect(ids(r)).not.toContain('CONV-LONG-UNSUPPORTED');
    expect(ids(r)).not.toContain('CONV-NO-TAXON');
  });
});

describe('ROW-RAGGED: number agreement', () => {
  const text = (lines: number[], lang: 'pl' | 'en' | 'de' | 'fr') => renderPlain(makeFinding('ROW-RAGGED', { file: 'a.csv', sheet: 'S', lines, params: { expected: 8, found: 9 } }), lang);
  it('Polish: one, few, many', () => {
    expect(text([3], 'pl')).toMatch(/^Wiersz 3 ma inną liczbę wartości niż nagłówek \(oczekiwano 8, jest 9\)/);
    expect(text([3], 'pl')).toContain('popraw ten wiersz w pliku źródłowym, narzędzie go nie zmieniło');
    expect(text([3, 5], 'pl')).toContain('popraw te wiersze w pliku źródłowym, narzędzie ich nie zmieniło');
    expect(text([3, 5], 'pl')).toMatch(/^Wiersze 3, 5 mają inną liczbę/);
    expect(text([3, 5, 7, 9], 'pl')).toMatch(/^Wiersze 3, 5, 7, 9 mają /);
    expect(text([3, 5, 7, 9, 11], 'pl')).toMatch(/^Wiersze 3, 5, 7, 9, 11 mają /);
    expect(text([3, 5], 'pl')).toContain('np. 9 w pierwszym z nich');
  });
  it('en, de, fr: singular and plural', () => {
    expect(text([3], 'en')).toMatch(/^Line 3 has a different number of values than the header \(expected 8, found 9\)\. .* fix this line .* did not change it\.$/);
    expect(text([3, 5], 'en')).toMatch(/^Lines 3, 5 have a different number/);
    expect(text([3], 'de')).toMatch(/^Die Zeile 3 hat eine andere Anzahl/);
    expect(text([3, 5], 'de')).toMatch(/^Die Zeilen 3, 5 haben eine andere Anzahl/);
    expect(text([3], 'fr')).toMatch(/^La ligne 3 a un nombre de valeurs différent de l'en-tête \(8 attendues, 9 trouvées\)/);
    expect(text([3, 5], 'fr')).toMatch(/^Les lignes 3, 5 ont un nombre/);
    expect(text([3], 'fr')).toContain('corrigez-la');
    expect(text([3, 5], 'fr')).toContain('ne les a pas modifiées');
  });
});

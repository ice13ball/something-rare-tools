// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Presence-only species lists: the user ticks "This is a list of species found" for a sheet; a long sheet writes one occurrence per taxon row, a wide sheet reads marks; a number above 1 is
// never guessed; an absence needs the full-species-list tick; nothing changes without the tick. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { presenceMark } from '../../src/core/convert/presence';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { toDataset } from '../../src/core/convert/model';
import { buildTables } from '../../src/core/convert/dwca';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { parseFile } from '../../src/core/parse';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const LIST_H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species'];
const LIST_ROWS: Cell[][] = [
  ['S1', 'a', '2020-01-01', 1, 2, 'Calanus finmarchicus'],
  ['S1', 'a', '2020-01-01', 1, 2, 'Oithona similis'],
  ['S2', 'b', '2020-01-02', 3, 4, 'Calanus finmarchicus'],
];
const long = (rows: Cell[][], presenceOnly: boolean, options = {}, header = LIST_H) => convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', ...(presenceOnly ? { presenceOnly: true } : {}) })], options });

const WIDE_H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus sp.'];
// the columns hold marks, which the proposer does not take for species by itself (the user gives them the role in the role table)
const SPECIES = { kind: 'taxon' as const, header: true };
const wide = (rows: Cell[][], presenceOnly: boolean, options = {}) => convert({ sheets: [sheetInput(fileOf(WIDE_H, rows), { shape: 'wide', edit: { 'Calanus finmarchicus': SPECIES, 'Oithona similis': SPECIES, 'Pseudocalanus sp.': SPECIES }, ...(presenceOnly ? { presenceOnly: true } : {}) })], options });
const byId = (r: ReturnType<typeof convert>) => r.occurrences.map((o) => `${o.id}=${o.occurrenceStatus}`);

describe('presenceMark', () => {
  it('marks in four languages, empty, absence, and what is not guessed', () => {
    for (const m of ['x', 'X', '+', '*', '✓', '✔', '1', 1, 'yes', 'tak', 'ja', 'oui', 'present', 'obecny', 'vorhanden', 'présent', ' Tak ']) expect(presenceMark(m, false).kind, String(m)).toBe('present');
    for (const m of ['0', 0, '-', '–', 'absent', 'nieobecny', 'abwesend', 'nie', 'nein', 'non']) expect(presenceMark(m, false).kind, String(m)).toBe('absent');
    for (const m of [null, '', '  ', 'NA', 'n/a']) expect(presenceMark(m, false).kind, String(m)).toBe('blank');
    for (const m of [2, '5', 1.5, -1, 'many', 'rzadki', '3 osobniki']) expect(presenceMark(m, false).kind, String(m)).toBe('unknown');
  });
});

describe('long presence list', () => {
  it('without the tick it still blocks with the offer, and writes nothing', () => {
    const r = long(LIST_ROWS, false);
    expect(find(r.blocking, 'CONV-SPECIES-LIST-NO-COUNTS')).toHaveLength(1);
    expect(r.occurrences).toEqual([]);
  });

  it('with the tick: one occurrence per taxon row, present, no organismQuantity and no organismQuantityType', () => {
    const r = long(LIST_ROWS, true);
    expect(r.blocking.filter((f) => ['CONV-SPECIES-LIST-NO-COUNTS', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-TAXON', 'CONV-NO-OCCURRENCES'].includes(f.ruleId))).toEqual([]);
    expect(byId(r)).toEqual(['a:Calanus finmarchicus=present', 'a:Oithona similis=present', 'b:Calanus finmarchicus=present']);
    for (const o of r.occurrences) {
      expect(o.organismQuantity).toBeUndefined();
      expect(o.organismQuantityType).toBeUndefined();
      expect(o.individualCount).toBeUndefined();
    }
    expect(r.measurements).toEqual([]);
    // the written occurrence.txt row has the status and an empty quantity
    const table = buildTables(toDataset(r, EMPTY_METADATA, { fullList: false, prefixStation: false, worms: false, nvs: false })).occurrence;
    const head = table.columns.map((c) => c.header);
    const status = head.indexOf('occurrenceStatus');
    expect(status).toBeGreaterThanOrEqual(0);
    expect(table.rows).toHaveLength(3);
    expect(table.rows.every((row) => row[status] === 'present')).toBe(true);
    // a column no row fills is not written at all
    expect(head).not.toContain('organismQuantity');
    expect(head).not.toContain('organismQuantityType');
  });

  it('a row with no taxon writes nothing', () => {
    const r = long([...LIST_ROWS, ['S3', 'c', '2020-01-03', 5, 6, null]], true);
    expect(r.occurrences).toHaveLength(3);
  });

  it('the page text of the offer names the tick', () => {
    const f = long(LIST_ROWS, false).blocking.find((x) => x.ruleId === 'CONV-SPECIES-LIST-NO-COUNTS')!;
    expect(renderConvertPlain(f, 'en')).toMatch(/tick "This is a list of species found/);
    expect(renderConvertPlain(f, 'pl')).toMatch(/To jest lista znalezionych gatunków/);
    expect(renderConvertPlain(f, 'de')).toMatch(/Dies ist eine Liste gefundener Arten/);
    expect(renderConvertPlain(f, 'fr')).toMatch(/C'est une liste d'espèces trouvées/);
  });
});

describe('wide presence list', () => {
  const rows: Cell[][] = [
    ['S1', 'a', '2020-01-01', 1, 2, 'x', '+', null],
    ['S2', 'b', '2020-01-02', 3, 4, '✓', 1, 'tak'],
    ['S3', 'c', '2020-01-03', 5, 6, 'yes', null, 'oui'],
  ];

  it('a mark is present, an empty cell writes nothing, no quantity is asked', () => {
    const r = wide(rows, true);
    expect(r.blocking.filter((f) => f.ruleId === 'CONV-QUANTITY-UNDECLARED' || f.ruleId === 'CONV-PRESENCE-VALUE')).toEqual([]);
    expect(byId(r)).toEqual([
      'a:Calanus finmarchicus=present', 'a:Oithona similis=present',
      'b:Calanus finmarchicus=present', 'b:Oithona similis=present', 'b:Pseudocalanus sp.=present',
      'c:Calanus finmarchicus=present', 'c:Pseudocalanus sp.=present',
    ]);
    expect(r.occurrences.every((o) => o.organismQuantity === undefined && o.organismQuantityType === undefined)).toBe(true);
  });

  it('0, - and absent write nothing without the full-species-list tick, and an absence with it', () => {
    const z: Cell[][] = [['S1', 'a', '2020-01-01', 1, 2, 'x', '0', '-'], ['S2', 'b', '2020-01-02', 3, 4, 'absent', '+', null]];
    expect(byId(wide(z, true))).toEqual(['a:Calanus finmarchicus=present', 'b:Oithona similis=present']);
    expect(find(wide(z, true).findings, 'CONV-ZERO-SKIPPED')[0].params.count).toBe(3);
    expect(byId(wide(z, true, { fullList: true }))).toEqual([
      'a:Calanus finmarchicus=present', 'a:Oithona similis=absent', 'a:Pseudocalanus sp.=absent',
      'b:Calanus finmarchicus=absent', 'b:Oithona similis=present',
    ]);
  });

  it('a number above 1 or a text is not guessed: it is named with its column and value, and blocks', () => {
    const r = wide([['S1', 'a', '2020-01-01', 1, 2, 5, 'x', 'many'], ['S2', 'b', '2020-01-02', 3, 4, 2, null, null]], true);
    const bad = find(r.blocking, 'CONV-PRESENCE-VALUE');
    expect(bad.map((b) => [b.field, b.value, b.lines])).toEqual([
      ['Calanus finmarchicus', '5, 2', [2, 3]],
      ['Pseudocalanus sp.', 'many', [2]],
    ]);
    // the cells that are marks are still written
    expect(byId(r)).toEqual(['a:Oithona similis=present']);
    const text = renderConvertPlain(bad[0], 'en');
    expect(text).toMatch(/Column "Calanus finmarchicus" holds 5, 2 in lines 2–3/);
    expect(renderConvertPlain(bad[0], 'pl')).toMatch(/Kolumna „Calanus finmarchicus” ma 5, 2 w wierszach 2–3/);
    expect(renderConvertPlain(bad[0], 'de')).toMatch(/Die Spalte „Calanus finmarchicus“ enthält 5, 2 in den Zeilen 2–3/);
    expect(renderConvertPlain(bad[0], 'fr')).toMatch(/La colonne « Calanus finmarchicus » contient 5, 2 aux lignes 2–3/);
  });

  it('without the tick the same sheet is unchanged: a quantity must be declared', () => {
    const r = wide(rows, false);
    expect(find(r.blocking, 'CONV-QUANTITY-UNDECLARED')).toHaveLength(1);
    expect(find(r.findings, 'CONV-PRESENCE-VALUE')).toEqual([]);
  });

  it('the tick does not reach a sheet with counts that is not ticked (the tick is per sheet)', () => {
    const counts: Cell[][] = [['S1', 'a', '2020-01-01', 1, 2, 4, 5, 6]];
    const r = convert({ sheets: [sheetInput(fileOf(WIDE_H, counts), { quantity: { kind: 'count' } })] });
    expect(r.occurrences.map((o) => o.organismQuantity)).toEqual([4, 5, 6]);
  });
});

describe('interplay with the environment-only rule', () => {
  it('a sheet of measured variables and no taxon is still CONV-ENV-ONLY-SHEET, ticked or not', () => {
    const f = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Temperature [°C]', 'Salinity [PSU]'], [['S1', '2020-01-01', 1, 2, 11.2, 34.1]]);
    for (const tick of [false, true]) {
      const r = convert({ sheets: [sheetInput(f, { ...(tick ? { presenceOnly: true } : {}) })] });
      expect(find(r.blocking, 'CONV-ENV-ONLY-SHEET')).toHaveLength(1);
    }
  });
});

describe('the companion file keeps the tick', () => {
  it('presenceOnly=<sheet> is written and read back; an old file has none', () => {
    const csv = writeConvertSidecar({ presenceOnly: ['List', 'Other'] });
    expect(csv).toContain('presenceOnly=List');
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(csv)))?.presenceOnly).toEqual(['List', 'Other']);
    expect(readConvertSettings(parseFile('side.csv', new TextEncoder().encode(writeConvertSidecar({ fullList: true }))))?.presenceOnly).toBeUndefined();
  });
});

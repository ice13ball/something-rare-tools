// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Defects found by a local run of real reference files before /convert is made public. Every file, value and name below is INVENTED; only the SHAPE of the
// real files is mimicked (a PANGAEA table, an environmental sheet with units in the headers, a data-dictionary sheet, ...).
import { describe, expect, it } from 'vitest';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { candidatesOf, initialChoices, requestOf, sheetKey, type ConvertState } from '../../src/app/convertModel';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { csvOf } from '../app/convertHelpers';
import { dictionaryReason } from '../../src/core/convert/dictionary';
import { readFileSync } from 'node:fs';
import { fileOf, type Cell } from './helpers';
import { renderPlain, renderTechnical, valuesAreTimes } from '../../src/core/report';
import { makeFinding } from '../../src/core/rules/registry';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { suggestConvertProfile } from '../../src/core/convert/recognize';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Parses one file in a fresh engine and returns what the page would hold at the start (every proposal, nothing confirmed). */
async function open(name: string, text: string) {
  const engine = createDirectConvertEngine();
  const parsed: ConvertParseResult = await engine.parse([{ name, bytes: enc(text), source: 'dropped' }]);
  const state: ConvertState = { parsed, mappings: {}, choices: initialChoices(parsed), options: {}, approved: {}, confirmed: {} };
  const run = async (quantity: { kind: 'count' } | undefined = { kind: 'count' }) => {
    for (const c of candidatesOf(parsed, state.mappings, state.choices)) state.confirmed[c.key] = true;
    const req = requestOf(state);
    const withQ = { ...req, sheets: req.sheets.map((s) => ({ ...s, ...(quantity ? { quantity } : {}) })) };
    return engine.convert(withQ);
  };
  return { engine, parsed, state, run };
}

describe('item 1: a table whose station names read like column names is not "transposed"', () => {
  const stations = ['stn A', 'stn B', 'Stn. N', 'stn A', 'stn B', 'Stn. N'];
  it('a PANGAEA table: the converter reads it as one wide table, as /check does (no IN-LAYOUT-UNSUPPORTED)', async () => {
    const header = ['Station', 'Sample ID', 'Date/Time', 'Latitude', 'Longitude', 'Depth water [m]', 'Calanus finmarchicus [#/m**3]'];
    const rows = stations.map((c, i) => [c, `S${i + 1}`, `2099-01-0${i + 1}T10:00`, 70 + i / 10, 10 + i / 10, 10 * (i + 1), i + 1]);
    const text = [
      '/* DATA DESCRIPTION:',
      'Citation:\tDoe, Jane (2099): Invented table. PANGAEA, https://doi.org/10.1594/PANGAEA.000000',
      'Parameter(s):\tStation label (Station)',
      '\tSample ID (Sample ID)',
      '\tDate/Time of event (Date/Time)',
      '\tLatitude of event (Latitude)',
      '\tLongitude of event (Longitude)',
      '\tDEPTH, water [m] (Depth water) * GEOCODE',
      '\tCalanus finmarchicus [#/m**3] (Calanus finmarchicus) * PI: Doe, Jane',
      'Size:\t6 data points',
      '',
      '*/',
      header.join('\t'),
      ...rows.map((r) => r.join('\t')),
    ].join('\n') + '\n';
    const { run } = await open('invented.tab', text);
    const v = await run();
    expect(v.stats.samples).toBe(6);
    expect(v.findings.map((f) => f.ruleId)).not.toContain('IN-LAYOUT-UNSUPPORTED');
  });

  it('the same station names in a plain CSV', async () => {
    const csv = csvOf(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], stations.map((c, i) => [c, `S${i}`, 70 + i / 10, 10 + i / 10, `2099-01-0${i + 1}`, i + 1]));
    const { run } = await open('codes.csv', csv);
    expect((await run()).findings.map((f) => f.ruleId)).not.toContain('IN-LAYOUT-UNSUPPORTED');
  });
});

/** The proposal of one extra numeric column on a wide sheet with a station, a position and a date. */
function proposalOf(header: string, values: Cell[] = [1.5, 2.5, 3.5]) {
  const f = fileOf(['Station', 'Latitude', 'Longitude', 'Date', header], values.map((v, i) => [`S${i}`, 55 + i, 3 + i, `2099-01-0${i + 1}`, v]));
  const p = proposeConvertColumns(f.sheets[0], { decimalComma: false, date1904: false }).find((q) => q.header === header)!;
  return p;
}

describe('item 2: the NAME part of a header decides between a species and a measured variable, never the unit alone', () => {
  const stayTaxon = [
    'Acartia sp. [ind/m3]',
    'Mytilus edulis [ind/m2]',
    'Calanus finmarchicus [mg C/m3]',
    'Acartia [g/m2]',
    'ACARTIA SP. [ind/m3]',
    'MYTILUS EDULIS [ind/m2]',
    'Acartia sp. 1 [ind/m3]',
    'Nematoda sp. 2 [ind/m2]',
    'Acartia/Centropages [ind/m3]',
    'Pseudocalanus/Paracalanus [ind/m3]',
    'Morphotype 3 [ind/m2]',
    'C. finmarchicus c2 [#/m**3] (including Calanus glacialis)',
    'Calanus finmarchicus',
    // modifiers after the genus: stage codes, size and range classes, underscores and hyphens in the name; any unit
    'Oithona similis C1-C3 [ind/m3]',
    'Pseudocalanus spp. C1-C3',
    'Mytilus edulis 0-1 cm [ind/m2]',
    'Cerastoderma glaucum >5mm [ind/m2]',
    'Copepoda <200 µm [ind/m3]',
    'Gymnodinium spp. 20-40 µm [cells/L]',
    'Calanus finmarchicus CIV-CVI [mg C/m3]',
    'Macoma_balthica [g/m2]',
    'Pseudo-nitzschia spp. [µg C/L]',
    // a biomass or a rate of a species is still a species
    'Calanus finmarchicus [mmol C/m3]',
    'Gadus morhua [kg/h]',
    'Acartia tonsa [µmol O2/h]',
  ];
  it.each(stayTaxon)('%s stays a taxon candidate', (h) => {
    const p = proposalOf(h);
    expect(p.role).toEqual({ kind: 'taxon', header: true });
    expect(p.confidence).toBe('low');
  });

  const becomeVariable = ['PN [µmol/l]', 'PP [µmol/l]', 'GPP C [mg/m**2/day]', 'Ntot [%]', 'd15N [‰]', 'δ13C [‰]', 'C/N [molar]', 'N:P', 'Chl a [µg/l]', 'POC [µg/l]', 'Corg [%]', 'Dw (µmol m-2h-1)'];
  it.each(becomeVariable)('%s is a measured variable, never a taxon candidate', (h) => {
    const p = proposalOf(h);
    expect(p.role.kind, `${p.reasonCode}: ${p.reason}`).toBe('variable');
  });

  it('a wide bio sheet with taxa and abundance units is unchanged: every taxon column is a candidate, the measured ones are variables', () => {
    const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus [ind/m3]', 'Oithona similis [mg C/m3]', 'Acartia sp. [ind/m3]', 'PN [µmol/l]'];
    const f = fileOf(header, [['A', 55, 3, '2099-01-01', 4, 1.5, 2, 3.5], ['B', 56, 4, '2099-01-02', 1, 2.5, 0, 4.5]]);
    const cols = proposeConvertColumns(f.sheets[0], { decimalComma: false, date1904: false });
    expect(cols.filter((c) => c.role.kind === 'taxon').map((c) => c.header)).toEqual(['Calanus finmarchicus [ind/m3]', 'Oithona similis [mg C/m3]', 'Acartia sp. [ind/m3]']);
    expect(cols.find((c) => c.header === 'PN [µmol/l]')!.role.kind).toBe('variable');
  });

  it('a sheet of measured variables with unknown names is not a "biology sheet" for the profile suggestion any more', () => {
    const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'PN [µmol/l]', 'PP [µmol/l]', 'd15N [‰]'];
    const f = fileOf(header, [['A', 55, 3, '2099-01-01', 5, 1, 2, 3], ['B', 56, 4, '2099-01-02', 10, 2, 3, 4]]);
    const cols = proposeConvertColumns(f.sheets[0], { decimalComma: false, date1904: false });
    expect(cols.some((c) => c.role.kind === 'taxon')).toBe(false);
    expect(suggestConvertProfile(cols)).toBe(true);
  });
});

describe('item 7: sample descriptors are never a taxon', () => {
  it.each(['Replicate', 'Rep', 'Cast', 'Bottle', 'Niskin', 'Run', 'Haul', 'Tow', 'Subsample', 'Core', 'Section', 'Slice', 'Frame', 'Replicate no', 'Bottle no.'])('%s', (h) => {
    const p = proposalOf(h, [1, 2, 1]);
    // a sample code where the shared rules already read it as one (bottle, core), a replicate / sub-sample column where the name says so (replicate, rep, subsample, core, frame), otherwise ignored with its reason; never a taxon, never a variable
    expect(['ignore', 'sampleId', 'replicate']).toContain(p.role.kind);
    if (p.role.kind === 'ignore') expect(p.reasonCode).toBe('sample-descriptor');
  });
  it('the shared proposer keeps a station or sample number that it already recognises', () => {
    const f = fileOf(['Sample no', 'Latitude', 'Longitude', 'Date', 'Salinity'], [['S1', 55, 3, '2099-01-01', 34], ['S2', 56, 4, '2099-01-02', 35]]);
    const cols = proposeConvertColumns(f.sheets[0], { decimalComma: false, date1904: false });
    expect(cols.find((c) => c.header === 'Sample no')!.role.kind).toBe('sampleId');
  });
  it('a long environmental sheet with a Replicate column is still read as long: the replicate stays in the key and tells the samples apart', async () => {
    const rows: Cell[][] = [];
    for (const rep of [1, 2]) for (const [par, val] of [['PN', 3], ['PP', 4]] as const) rows.push(['A', 55, 3, '2099-01-01', rep, par, val + rep]);
    const csv = csvOf(['Station', 'Latitude', 'Longitude', 'Date', 'Replicate', 'Parameter', 'Value'], rows);
    const { parsed } = await open('long.csv', csv);
    const note = parsed.files[0].pivots?.['long.csv'];
    expect(note).toBeDefined();
    const sheet = parsed.files[0].sheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.header).toContain('Replicate');
  });
});

describe('item 2, end to end: a wide sheet whose taxa carry stages, size classes and biomass units writes every confirmed taxon', () => {
  it('eight taxon columns, eight occurrences', async () => {
    const taxa = ['Oithona similis C1-C3 [ind/m3]', 'Pseudocalanus spp. C1-C3 [ind/m3]', 'Mytilus edulis 0-1 cm [ind/m2]', 'Cerastoderma glaucum >5mm [ind/m2]', 'Copepoda <200 µm [ind/m3]', 'Gymnodinium spp. 20-40 µm [cells/L]', 'Calanus finmarchicus CIV-CVI [mg C/m3]', 'Macoma_balthica [g/m2]'];
    const csv = csvOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', ...taxa], [['S1', 'A', 55, 3, '2099-01-01', ...taxa.map((_, i) => i + 1)]]);
    const { run, parsed } = await open('stages.csv', csv);
    expect(candidatesOf(parsed, {}, undefined).map((c) => c.header)).toHaveLength(8);
    const v = await run();
    expect(v.stats.occurrences).toBe(8);
  });
});

describe('item 3: a species list with no quantity column says plainly what the converter needs', () => {
  it('a plain species list is CONV-SPECIES-LIST-NO-COUNTS (not CONV-NO-TAXON: the taxon column is set), with its text in all four languages', async () => {
    const csv = csvOf(['scientificName', 'decimalLatitude', 'decimalLongitude', 'eventDate'], [['Calanus finmarchicus', 55, 3, '2099-01-01'], ['Oithona similis', 56, 4, '2099-01-02']]);
    const v = await (await open('species-list.csv', csv)).run(undefined);
    expect(v.findings.some((x) => x.ruleId === 'CONV-NO-TAXON')).toBe(false);
    const f = v.findings.find((x) => x.ruleId === 'CONV-SPECIES-LIST-NO-COUNTS')!;
    expect(f.params).toEqual({});
    const words: Record<string, RegExp> = { en: /counts, density or biomass/, pl: /liczebnością, zagęszczeniem albo biomasą/, de: /Anzahlen, Dichte oder Biomasse/, fr: /effectifs, de densité ou de biomasse/ };
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).toMatch(words[lang]);
    expect(renderConvertTechnical(f)).toContain('presence-only');
  });
});

describe('item 4: the advice for a time-of-day column is about the time format', () => {
  const finding = (value: string) => makeFinding('ROW-DATE-UNPARSEABLE', { file: 't.csv', sheet: 't', field: 'Time', value, lines: [2, 3] });
  it('ranges of times are told apart from dates by their values', () => {
    expect(valuesAreTimes('10:00-12:00, 14:30-15:00')).toBe(true);
    expect(valuesAreTimes('14h30')).toBe(true);
    expect(valuesAreTimes('1430-1500')).toBe(false); // a bare 4-digit range may be years: the finding does not know the role
    expect(valuesAreTimes('10:00')).toBe(true);
    expect(valuesAreTimes('2020-13-45')).toBe(false);
    expect(valuesAreTimes('1999-2005')).toBe(false);
    for (const v of ['2019-2020', '12.05-14.05', '12.05']) expect(valuesAreTimes(v), v).toBe(false);
    expect(valuesAreTimes('31.02.2020, 10:00-12:00')).toBe(false);
    expect(valuesAreTimes('')).toBe(false);
  });
  it('a time column: HH:MM, one time, UTC or a stated zone, in every language; a date column keeps the date advice', () => {
    const t = finding('10:00-12:00, 14:30-15:00');
    expect(t.ruleId).toBe('ROW-DATE-UNPARSEABLE');
    expect(renderPlain(t, 'en')).toMatch(/HH:MM.*UTC or with the time zone stated/);
    expect(renderPlain(t, 'pl')).toMatch(/GG:MM.*UTC/);
    expect(renderPlain(t, 'de')).toMatch(/HH:MM.*UTC/);
    expect(renderPlain(t, 'fr')).toMatch(/HH:MM.*UTC/);
    for (const lang of LANGS) expect(renderPlain(t, lang), lang).not.toMatch(/YYYY|RRRR|JJJJ|AAAA/);
    expect(renderTechnical(t)).toContain('time of day not parseable');
    const d = finding('2020-13-45');
    expect(renderPlain(d, 'en')).toContain('Write dates as YYYY-MM-DD');
    expect(renderTechnical(d)).toContain('date not parseable');
  });
  it('a date column that fails with a year range or a day.month keeps the date wording', () => {
    for (const v of ['2019-2020', '12.05-14.05', '12.05']) expect(renderPlain(finding(v), 'en'), v).toContain('Write dates as YYYY-MM-DD');
  });
  it('the finding itself is the same as before: no new param, the rule id is kept', () => {
    expect(finding('10:00-12:00').params).toEqual({});
  });
});

describe('item 5: a data-dictionary sheet starts unticked, with a note', () => {
  const ctx = { decimalComma: false, date1904: false };
  const reason = (header: string[], rows: Cell[][], name = 'S') => {
    const f = fileOf(header, rows, name);
    return dictionaryReason(f.sheets[0], proposeConvertColumns(f.sheets[0], ctx));
  };
  it('by the name of the sheet', () => {
    expect(reason(['A', 'B'], [['x', 'y']], 'metadata.csv')).toBe('name');
    expect(reason(['A', 'B'], [['x', 'y']], 'seawater.csv')).toBeUndefined();
    for (const n of ['Metadata', 'README', 'Info', 'Description', 'Data dictionary', 'Legend', 'Notes', 'Opis']) expect(reason(['A', 'B'], [['x', 'y']], n), n).toBe('name');
    expect(reason(['A', 'B'], [['x', 'y']], 'Seawater')).toBeUndefined();
    expect(reason(['A', 'B'], [['x', 'y']], 'Measured_variables')).toBeUndefined();
  });
  it('by its headers: a column that names a column next to one that explains it, with mostly text under them', () => {
    expect(reason(['column_name', 'description'], [['Depth_m', 'depth in metres'], ['TEMP_C', 'temperature']])).toBe('columns');
    expect(reason(['Variable', 'Unit', 'Explanation'], [['PN', 'umol/l', 'particulate nitrogen'], ['Sal', 'psu', 'practical salinity']])).toBe('columns');
    // numbers under the headers: a table of measurements, not a glossary
    expect(reason(['name', 'comment', 'value'], [['a', 'x', 1], ['b', 'y', 2], ['c', 'z', 3]])).toBeUndefined();
  });
  it('a sheet with a position is data, whatever its name', () => {
    expect(reason(['Station', 'Latitude', 'Longitude', 'Date', 'PN [µmol/l]'], [['A', 55, 3, '2099-01-01', 1], ['B', 56, 4, '2099-01-02', 2]], 'Info')).toBeUndefined();
  });
  it('the worker reports it and the page starts the sheet unticked; the data sheet next to it stays ticked and converts', async () => {
    const engine = createDirectConvertEngine();
    const parsed = await engine.parse([
      { name: 'glossary.csv', bytes: enc(readFileSync('test/fixtures/convert-env/f11-docs-sheet.csv', 'utf8')), source: 'dropped' },
      { name: 'data.csv', bytes: enc(csvOf(['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A', 55, 3, '2099-01-01', 4]])), source: 'dropped' },
    ]);
    const [g, d] = parsed.files;
    expect(g.dictionarySheets).toEqual({ 'glossary.csv': 'columns' });
    expect(d.dictionarySheets).toBeUndefined();
    const choices = initialChoices(parsed);
    expect(choices[sheetKey(g.fileId, 'glossary.csv')].use).toBe(false);
    expect(choices[sheetKey(d.fileId, 'data.csv')].use).toBe(true);
    // the glossary is not in the request: nothing is read from it
    const state: ConvertState = { parsed, mappings: {}, choices, options: {}, approved: {}, confirmed: {} };
    expect(requestOf(state).sheets.map((x) => x.fileId)).toEqual([d.fileId]);
  });
});

describe('item 6: a column with data that is left out is said', () => {
  const notExported = (v: { findings: { ruleId: string; params: Record<string, unknown> }[] }) => v.findings.find((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED');
  it('an empty-header column that holds data is named by its letter; an empty one is not', async () => {
    const withData = csvOf(['Station', 'Latitude', 'Longitude', 'Date', '', 'Calanus finmarchicus'], [['A', 55, 3, '2099-01-01', 'note', 4], ['B', 56, 4, '2099-01-02', '', 5]]);
    const f = notExported(await (await open('gap.csv', withData)).run());
    expect(f?.params).toMatchObject({ count: 1, columns: '[E]' });
    const withoutData = csvOf(['Station', 'Latitude', 'Longitude', 'Date', '', 'Calanus finmarchicus'], [['A', 55, 3, '2099-01-01', '', 4], ['B', 56, 4, '2099-01-02', '', 5]]);
    expect(notExported(await (await open('gap2.csv', withoutData)).run())).toBeUndefined();
  });
  it('a second quantity column next to a count is named; the count is read', async () => {
    const csv = csvOf(['eventID', 'scientificName', 'individualCount', 'Biomass [g]', 'decimalLatitude', 'decimalLongitude', 'eventDate'], [['E1', 'Calanus finmarchicus', 4, 0.5, 55, 3, '2099-01-01'], ['E1', 'Oithona similis', 2, 0.1, 55, 3, '2099-01-01']]);
    const v = await (await open('two-q.csv', csv)).run();
    expect(notExported(v)?.params).toMatchObject({ count: 1, columns: 'Biomass [g]' });
    expect(v.stats.occurrences).toBe(2);
  });
  it('an ignored column the user wants out, such as a plain remark, is not said', async () => {
    const csv = csvOf(['scientificName', 'individualCount', 'Remarks', 'decimalLatitude', 'decimalLongitude', 'eventDate'], [['Calanus finmarchicus', 4, 'ok', 55, 3, '2099-01-01']]);
    expect(notExported(await (await open('remarks.csv', csv)).run())).toBeUndefined();
  });
});

export { candidatesOf, sheetKey };
export type { Cell };

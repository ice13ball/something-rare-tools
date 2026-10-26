// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 7, the real public PANGAEA files: what an unedited PANGAEA export of a Multinet count table and of a CTD table needs from the converter. Every value, name
// and position below is INVENTED; only the STRUCTURE of the two files is mimicked (the header block with its Parameter(s) list, abbreviated table headers, a depth
// top / bottom / water triple, event labels with a -N cast suffix). No third-party data is in this repository.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { stripHeaderUnit, taxonColumnNames } from '../../src/core/convert/headers';
import { judge } from '../../src/core/convert/policy';
import { licenceDiffersFindings } from '../../src/core/convert/validate';
import { licenceSourceOf } from '../../src/core/convert/prefill';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { STATION_FAR_KM, castBase } from '../../src/core/convert/build';
import { splitTaxon } from '../../src/core/convert/taxon';
import { classifyMatches, entryOf, lookupOf } from '../../src/core/convert/worms';
import { suggestType, suggestUnit } from '../../src/core/convert/nerc';
import { parsePangaeaText } from '../../src/core/parse/pangaea';
import { readConvertFile } from '../../src/core/convert/read';
import { parsePangaeaParameter, readPangaeaParameters } from '../../src/core/convert/pangaeaHeader';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole, ParsedFile, SheetMapping } from '../../src/core/types';
import { LANGS } from '../../src/core/types';
import { textFile } from '../helpers/files';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { proposeConvertMapping, suggestConvertShape } from '../../src/core/convert/recognize';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';
import { exportSheet, objects, readBack } from './exportHelpers';

/* ---- a synthetic PANGAEA text file ---- */

interface Param {
  /** The line of the Parameter(s) block: `Long name [unit] (Short) * ... * COMMENT: ...`. */
  line: string;
  /** The header of the column in the table. */
  header: string;
}

const pangaea = (params: Param[], rows: Cell[][], opts: { license?: string; citationTitle?: string } = {}): string => {
  const title = opts.citationTitle ?? 'Invented net counts during cruise XX1 to an invented sea in 2099 [dataset]';
  const lines = [
    '/* DATA DESCRIPTION:',
    `Citation:\tDoe, Jane; Roe, Richard (2099): ${title}. PANGAEA, https://doi.org/10.1594/PANGAEA.000000, `,
    'Coverage:\tSOUTH-BOUND LATITUDE: 70.000000 * WEST-BOUND LONGITUDE: 10.000000 * NORTH-BOUND LATITUDE: 71.000000 * EAST-BOUND LONGITUDE: 11.000000',
    '\tDATE/TIME START: 2099-01-01T01:00:00 * DATE/TIME END: 2099-01-02T04:50:00',
    `Parameter(s):\t${params[0].line}`,
    ...params.slice(1).map((p) => `\t${p.line}`),
    `License:\t${opts.license ?? 'Creative Commons Attribution 3.0 Unported (CC-BY-3.0) (URI: https://creativecommons.org/licenses/by/3.0/)'}`,
    'Size:\t10 data points',
    '',
    '*/',
    params.map((p) => p.header).join('\t'),
    ...rows.map((r) => r.map((c) => (c === null ? '' : String(c))).join('\t')),
  ];
  return lines.join('\n') + '\n';
};

const PI = 'PI: Doe, Jane (jane@example.org)';
const NET_PARAMS: Param[] = [
  { line: 'Event label (Event)', header: 'Event' },
  { line: 'Date/Time of event (Date/Time)', header: 'Date/Time' },
  { line: 'Latitude of event (Latitude)', header: 'Latitude' },
  { line: 'Longitude of event (Longitude)', header: 'Longitude' },
  { line: `Sample code/label (Sample label) * ${PI} * COMMENT: Net number`, header: 'Sample label (Net number)' },
  { line: 'DEPTH, water [m] (Depth water) * GEOCODE', header: 'Depth water [m]' },
  { line: `Depth, top/min [m] (Depth top) * ${PI}`, header: 'Depth top [m]' },
  { line: `Depth, bottom/max [m] (Depth bot) * ${PI}`, header: 'Depth bot [m]' },
  { line: `Ctenophora [#/m**3] (Ctenophora) * ${PI} * METHOD/DEVICE: Counting`, header: 'Ctenophora [#/m**3]' },
  { line: `Acartia sp., c1 [#/m**3] (Acartia sp. c1) * ${PI} * METHOD/DEVICE: Counting`, header: 'Acartia sp. c1 [#/m**3]' },
  // two genera share the abbreviation "S. polaris c3"
  { line: `Scaphocalanus polaris, c3 [#/m**3] (S. polaris c3) * ${PI}`, header: 'S. polaris c3 [#/m**3]' },
  { line: `Spinocalanus polaris, c3 [#/m**3] (S. polaris c3) * ${PI}`, header: 'S. polaris c3 [#/m**3]' },
  // the same long name twice: told apart by the parameter comment
  { line: `Calanus finmarchicus, c2 [#/m**3] (C. finmarchicus c2) * ${PI} * COMMENT: including Calanus glacialis`, header: 'C. finmarchicus c2 [#/m**3] (including Calanus glacialis)' },
  { line: `Calanus finmarchicus, c2 [#/m**3] (C. finmarchicus c2) * ${PI}`, header: 'C. finmarchicus c2 [#/m**3]' },
  { line: `Cirripedia, cypris, nauplii [#/m**3] (Cirripedia cypris naup) * ${PI} * COMMENT: 1`, header: 'Cirripedia cypris naup [#/m**3] (1)' },
  { line: `Cirripedia, cypris, nauplii [#/m**3] (Cirripedia cypris naup) * ${PI} * COMMENT: 2`, header: 'Cirripedia cypris naup [#/m**3] (2)' },
];
const NET_ROWS: Cell[][] = [
  ['XX1/006-6', '2099-01-01T11:05', 71, 10.5, 2, 4000, 0, 25, 1.5, 2, 3, 4, 5, 6, 7, 8],
  ['XX1/006-6', '2099-01-01T11:05', 71, 10.5, 3, 4000, 25, 100, 0.5, 1, 1, 1, 1, 1, 1, 1],
];
const NET_TEXT = pangaea(NET_PARAMS, NET_ROWS);

const parsedNet = (): ParsedFile => readConvertFile(parsePangaeaText(NET_TEXT, 'net.tab'), NET_TEXT);
const QUANTITY = { kind: 'density' as const, unit: '#/m3' };
const netSheet = (extra: Partial<ConvertSheetInput> & { edit?: Record<string, ColumnRole> } = {}): ConvertSheetInput => {
  const file = parsedNet();
  const m = proposeConvertMapping(file.sheets[0], { decimalComma: false, date1904: false });
  const shape = suggestConvertShape(m.columns) ?? 'wide';
  return { file, sheet: file.sheets[0].name, mapping: m, shape, quantity: QUANTITY, ...extra };
};
const approveAll = (sheets: ConvertSheetInput[], extra: object = {}) => {
  const first = convert({ sheets, options: {}, ...extra });
  const approved = Object.fromEntries(first.splits.filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed]));
  return convert({ sheets, options: {}, approvedSplits: approved, ...extra });
};
const ruleIds = (r: { findings: { ruleId: string }[] }): string[] => r.findings.map((f) => f.ruleId);

/* ---- 0. the Parameter(s) block, read by the converter (the shared parser is unchanged) ---- */

describe('the Parameter(s) block of a PANGAEA file', () => {
  it('one line: long name, unit, abbreviation and comment', () => {
    expect(parsePangaeaParameter('Calanus finmarchicus, c2 [#/m**3] (C. finmarchicus c2) * PI: X * METHOD/DEVICE: Counting * COMMENT: including Calanus glacialis')).toEqual({
      name: 'Calanus finmarchicus, c2',
      unit: '#/m**3',
      short: 'C. finmarchicus c2',
      comment: 'including Calanus glacialis',
    });
    expect(parsePangaeaParameter('Salinity (Sal) * PI: X')).toEqual({ name: 'Salinity', short: 'Sal' });
    expect(parsePangaeaParameter('Event label (Event)')).toEqual({ name: 'Event label', short: 'Event' });
  });

  it('the whole block in column order, one parameter per column; none for text with no such block; the shared parser keeps only name and unit for /check', () => {
    const p = readPangaeaParameters(NET_TEXT)!;
    expect(p).toHaveLength(NET_PARAMS.length);
    expect(p[10]).toMatchObject({ name: 'Scaphocalanus polaris, c3', short: 'S. polaris c3', unit: '#/m**3' });
    expect(readPangaeaParameters('a,b\n1,2\n')).toBeUndefined();
    const shared = parsePangaeaText(NET_TEXT, 'net.tab');
    expect(shared.embeddedMetadata?.parameters?.[10]).toEqual({ name: 'Scaphocalanus polaris, c3', unit: '#/m**3' });
    expect(shared.pangaeaParameters).toBeUndefined();
  });
});

/* ---- 1. unit text never in the name; PANGAEA long names; distinct duplicates ---- */

describe('the name of a taxon column', () => {
  it('a unit in brackets is never part of the name: "Ctenophora [#/m**3]" is "Ctenophora", and a remark after the unit is taken off the name too', () => {
    expect(stripHeaderUnit('Ctenophora [#/m**3]')).toEqual({ name: 'Ctenophora', unit: '#/m**3' });
    expect(stripHeaderUnit('C. finmarchicus c2 [#/m**3] (including Calanus glacialis)')).toEqual({ name: 'C. finmarchicus c2', unit: '#/m**3', remark: 'including Calanus glacialis' });
    expect(stripHeaderUnit('Oithona similis')).toEqual({ name: 'Oithona similis' });
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Ctenophora [#/m**3]', 'Oithona similis, c2 [ind m-3]'];
    const file = fileOf(header, [['A', 55, 2, '2023-06-14', 4, 5]]);
    const r = approveAll([sheetInput(file, { quantity: QUANTITY })]);
    expect(r.occurrences.map((o) => [o.id, o.scientificName, o.verbatimIdentification, o.lifeStage])).toEqual([
      ['A:Ctenophora', 'Ctenophora', 'Ctenophora', undefined],
      ['A:Oithona similis, c2', 'Oithona similis', 'Oithona similis, c2', 'C2'],
    ]);
    // no split is flagged "digits" for a unit, so every split without a real doubt can be approved together
    expect(r.splits.filter((s) => s.doubt !== undefined)).toEqual([]);
  });

  it('for a PANGAEA file the long name of the Parameter(s) block is the taxon text, so two genera that share an abbreviation stay two names', () => {
    const file = parsedNet();
    const cols = [8, 9, 10, 11, 12, 13, 14, 15].map((index) => ({ index, header: file.sheets[0].header[index] }));
    const names = taxonColumnNames(file, file.sheets[0], cols);
    expect([...names.values()].map((n) => n.verbatim)).toEqual([
      'Ctenophora',
      'Acartia sp., c1',
      'Scaphocalanus polaris, c3',
      'Spinocalanus polaris, c3',
      'Calanus finmarchicus, c2',
      'Calanus finmarchicus, c2',
      'Cirripedia, cypris, nauplii',
      'Cirripedia, cypris, nauplii',
    ]);
    expect(names.get(10)?.abbreviation).toBe('S. polaris c3');
    expect(names.get(11)?.abbreviation).toBe('S. polaris c3');
  });

  it('the occurrenceID is built from the long name; columns that share a long name are told apart by the parameter comment, never merged and never summed', () => {
    const r = approveAll([netSheet()]);
    const first = r.occurrences.filter((o) => o.eventId === '2');
    const ids = first.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      '2:Ctenophora',
      '2:Acartia sp., c1',
      '2:Scaphocalanus polaris, c3',
      '2:Spinocalanus polaris, c3',
      '2:Calanus finmarchicus, c2 (including Calanus glacialis)',
      '2:Calanus finmarchicus, c2 (C. finmarchicus c2 [#/m**3])',
      '2:Cirripedia, cypris, nauplii (1)',
      '2:Cirripedia, cypris, nauplii (2)',
    ]);
    // the two columns of one name are two occurrences with their own values; the comment of the parameter is kept with the record
    const c2 = r.occurrences.filter((o) => o.eventId === '2' && o.scientificName === 'Calanus finmarchicus');
    expect(c2.map((o) => [o.quantityText, o.occurrenceRemarks])).toEqual([['5', 'including Calanus glacialis'], ['6', undefined]]);
    expect(c2.every((o) => o.lifeStage === 'C2')).toBe(true);
    const cir = r.occurrences.filter((o) => o.eventId === '2' && o.scientificName === 'Cirripedia');
    expect(cir.map((o) => [o.lifeStage, o.occurrenceRemarks])).toEqual([['cypris, nauplius', '1'], ['cypris, nauplius', '2']]);
    expect(ruleIds(r)).toContain('CONV-TAXON-SAME-EVENT');
    expect(ruleIds(r)).not.toContain('CONV-ID-DUPLICATE');
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toEqual([]);
  });

  it('when the Parameter(s) list does not stand for the table (another number of columns), the header text is used and nothing is invented', () => {
    const file = parsedNet();
    const cut: ParsedFile = { ...file, pangaeaParameters: file.pangaeaParameters!.slice(0, 5) };
    const names = taxonColumnNames(cut, cut.sheets[0], [{ index: 10, header: cut.sheets[0].header[10] }]);
    expect(names.get(10)?.verbatim).toBe('S. polaris c3');
    // a CSV with the very same header twice keeps the same ID twice, which blocks (CONV-ID-DUPLICATE asks the user to rename one)
    const twice = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis', 'Oithona similis'], [['A', 55, 2, '2023-06-14', 4, 5]]);
    const r = approveAll([sheetInput(twice, { quantity: QUANTITY })]);
    expect(ruleIds(r)).toContain('CONV-ID-DUPLICATE');
  });
});

/* ---- 2. depth ranges ---- */

describe('a depth range is not collapsed to a point', () => {
  const rolesOf = (header: string[]): Record<string, ColumnRole> => {
    const sheet = fileOf(header, [Array(header.length).fill(1)]).sheets[0];
    return Object.fromEntries(proposeConvertColumns(sheet, { decimalComma: false, date1904: false }).map((p) => [p.header, p.role]));
  };

  it('Depth bot, Depth bottom and Depth, bottom are the maximum bound; Depth top the minimum', () => {
    for (const bottom of ['Depth bot [m]', 'Depth bottom [m]', 'Depth, bottom [m]', 'Depth, bottom/max [m]']) {
      const r = rolesOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Depth top [m]', bottom, 'Ctenophora [#/m**3]']);
      expect(r['Depth top [m]']).toMatchObject({ kind: 'depth', bound: 'min' });
      expect(r[bottom], bottom).toMatchObject({ kind: 'depth', bound: 'max' });
    }
  });

  it('with a top and a bottom bound, a mid-depth or GEOCODE column ("Depth water") does not win as the plain depth: it is ignored, with its reason', () => {
    const sheet = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Depth water [m]', 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'], [['A', 55, 2, '2023-06-14', 12.5, 0, 25, 3]]).sheets[0];
    const p = proposeConvertColumns(sheet, { decimalComma: false, date1904: false });
    const water = p.find((x) => x.header === 'Depth water [m]')!;
    expect(water.role).toEqual({ kind: 'ignore' });
    expect(water.reasonCode).toBe('depth-range-used');
    // only one bound: the plain depth stays what it was
    const one = proposeConvertColumns(fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Depth water [m]', 'Depth top [m]', 'Ctenophora'], [['A', 55, 2, '2023-06-14', 12.5, 0, 3]]).sheets[0], { decimalComma: false, date1904: false });
    expect(one.find((x) => x.header === 'Depth water [m]')!.role.kind).toBe('depth');
  });

  it('a 0 to 25 m haul gives minimumDepthInMeters 0 and maximumDepthInMeters 25 (not 12.5 twice), on the sample and the PANGAEA file as it is', async () => {
    const x = await exportSheet(
      ['Sample', 'Latitude', 'Longitude', 'Date', 'Depth water [m]', 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'],
      [['A', 55, 2, '2023-06-14', 4000, 0, 25, 3]],
      { quantity: { kind: 'density', unit: '#/m3' } },
    );
    const ev = objects((await readBack(x.zip)).tables['event.txt']).find((e) => e.eventType === 'sample')!;
    expect([ev.minimumDepthInMeters, ev.maximumDepthInMeters]).toEqual(['0', '25']);
    const r = approveAll([netSheet()]);
    const s = r.events.filter((e) => e.eventType === 'sample').map((e) => [e.depthMin, e.depthMax]);
    expect(s).toEqual([[0, 25], [25, 100]]);
  });
});

/* ---- 3. PANGAEA header metadata and UTC ---- */

describe('the header of a PANGAEA file feeds the description of the dataset, and its time is UTC', () => {
  const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text), source: 'dropped' as const });

  it('title (without the [dataset] marker), authors, citation and licence are prefilled with the file as the source; CC-BY-3.0 is the "other" case', async () => {
    const r = await createDirectConvertEngine().parse([file('net.tab', NET_TEXT)]);
    const info = r.prefillInfo!;
    expect(info.files).toEqual([{ fileName: 'net.tab', kind: 'PANGAEA' }]);
    expect(info.fields.title.map((c) => [c.value, c.sources])).toEqual([['Invented net counts during cruise XX1 to an invented sea in 2099', [{ file: 'net.tab', field: 'title' }]]]);
    expect(r.prefill.title).toBe('Invented net counts during cruise XX1 to an invented sea in 2099');
    expect(r.prefill.creators).toBe('Doe, Jane\nRoe, Richard');
    expect(r.prefill.citation).toContain('PANGAEA');
    expect(info.licence).toMatchObject({ kind: 'other', ids: ['CC-BY-3.0'] });
    expect(r.prefill.licence).toBeUndefined();
    // the coverage is shown for information
    expect(info.coverage[0]).toMatchObject({ file: 'net.tab', bbox: { west: 10, east: 11, south: 70, north: 71 } });
    // the sheet is still a data table
    expect(r.files.map((f) => f.fileName)).toEqual(['net.tab']);
    // choosing another licence than the file states is CONV-LICENCE-DIFFERS; choosing the same one is not
    const src = licenceSourceOf(info);
    expect(licenceDiffersFindings('CC-BY-4.0', src).map((f) => f.ruleId)).toEqual(['CONV-LICENCE-DIFFERS']);
    expect(licenceDiffersFindings('CC-BY-3.0' as never, src)).toEqual([]);
  });

  it('a file that is not PANGAEA adds no record to the description; a metadata file dropped with it still does', async () => {
    const csv = 'Sample,Latitude,Longitude,Date,Calanus finmarchicus\nA,55,2,2023-06-14,4\n';
    const r = await createDirectConvertEngine().parse([file('w.csv', csv)]);
    expect(r.prefillInfo).toBeNull();
  });

  it('the Date/Time of a PANGAEA file is UTC (wiki.pangaea.de/wiki/Data_submission): eventDate carries its Z and there is no ROW-TZ-UNKNOWN; a CSV with the same header is not assumed UTC', () => {
    const r = approveAll([netSheet()]);
    expect(ruleIds(r)).not.toContain('ROW-TZ-UNKNOWN');
    const samples = r.events.filter((e) => e.eventType === 'sample');
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((e) => e.eventDate === '2099-01-01T11:05Z')).toBe(true);
    const csv = fileOf(['Sample', 'Latitude', 'Longitude', 'Date/Time', 'Ctenophora'], [['A', 55, 2, '2023-06-14T11:05', 4]]);
    const c = approveAll([sheetInput(csv, { quantity: QUANTITY })]);
    expect(ruleIds(c)).toContain('ROW-TZ-UNKNOWN');
  });
});

/* ---- 4. WoRMS: an exact answer under another name ---- */

describe('WoRMS: an exact match under another name is a choice', () => {
  const record = (name: string, over: Record<string, unknown> = {}) => ({
    AphiaID: 1001,
    scientificname: name,
    authority: 'X',
    status: 'accepted',
    unacceptreason: null,
    rank: 'Species',
    valid_AphiaID: 1001,
    valid_name: name,
    isMarine: 1,
    isBrackish: 0,
    isFreshwater: 0,
    isTerrestrial: 0,
    match_type: 'exact',
    url: null,
    ...over,
  });
  const rec = (name: string, over: Record<string, unknown> = {}) => [record(name, over)] as never;

  it('the same name (any case and spacing) is automatic; another name under match_type exact needs a choice', () => {
    expect(classifyMatches(rec('Calanus finmarchicus'), 'Calanus finmarchicus').kind).toBe('auto');
    expect(classifyMatches(rec('Calanus finmarchicus'), 'calanus  finmarchicus').kind).toBe('auto');
    expect(classifyMatches(rec('Bivalvia'), 'Bivalvia, veliger')).toMatchObject({ kind: 'choose', why: 'other-name' });
    // without the name sent nothing changes (the old call)
    expect(classifyMatches(rec('Bivalvia')).kind).toBe('auto');
  });

  it('it is undecided until chosen, and a chosen record whose name differs is written under its own name (the page says so)', () => {
    expect(entryOf(rec('Bivalvia'), undefined, 'Bivalvia veliger')).toEqual({ state: 'undecided' });
    expect(entryOf(rec('Bivalvia'), 1001, 'Bivalvia veliger')).toEqual({ state: 'id', aphiaId: 1001, notMarine: false, scientificName: 'Bivalvia' });
    expect(entryOf(rec('Bivalvia'), 'none', 'Bivalvia veliger')).toEqual({ state: 'none', reason: 'user' });
    const l = lookupOf({ 'Bivalvia veliger': rec('Bivalvia'), Bivalvia: rec('Bivalvia') }, {});
    expect(l['Bivalvia veliger']).toEqual({ state: 'undecided' });
    expect(l.Bivalvia).toMatchObject({ state: 'id' });
  });
});

/* ---- 5. stage words ---- */

describe('stage words', () => {
  const stage = (t: string) => splitTaxon(t).lifeStage;
  it('the zooplankton stage words are read, plurals as the singular value', () => {
    const table: [string, string][] = [
      ['Bivalvia, veliger', 'veliger'],
      ['Bivalvia veligers', 'veliger'],
      ['Calanus, copepodites', 'copepodite'],
      ['Euphausiacea, calyptopis', 'calyptopis'],
      ['Euphausiacea calyptopes', 'calyptopis'],
      ['Euphausiacea, furcilia', 'furcilia'],
      ['Decapoda, zoea', 'zoea'],
      ['Decapoda zoeae', 'zoea'],
      ['Decapoda, megalopa', 'megalopa'],
      ['Cirripedia, cypris', 'cypris'],
      ['Cirripedia, cyprids', 'cypris'],
      ['Cirripedia, metanauplii', 'metanauplius'],
      ['Copepoda, nauplii', 'nauplius'],
      ['Copepoda, eggs', 'egg'],
      ['Copepoda, egg', 'egg'],
      ['Asteroida, juveniles', 'juvenile'],
      ['Asteroida, juv', 'juvenile'],
      ['Oikopleura, adults', 'adult'],
      ['Pilidium, larvae', 'larva'],
    ];
    for (const [text, expected] of table) expect(stage(text), text).toBe(expected);
  });

  it('a range of copepodite stages and several stages in one name are kept whole', () => {
    expect(splitTaxon('Microcalanus pygmaeus, c1-c5')).toMatchObject({ scientificName: 'Microcalanus pygmaeus', lifeStage: 'C1-C5' });
    expect(splitTaxon('Spinocalanus spp., C1–C5')).toMatchObject({ scientificName: 'Spinocalanus', identificationQualifier: 'spp.', lifeStage: 'C1-C5' });
    expect(splitTaxon('Calanus, CI-CV')).toMatchObject({ lifeStage: 'C1-C5' });
    expect(splitTaxon('Cirripedia, cypris, nauplii')).toMatchObject({ scientificName: 'Cirripedia', lifeStage: 'cypris, nauplius' });
    // a wrong range is not read
    expect(splitTaxon('Calanus, c5-c1').lifeStage).toBeUndefined();
  });

  it('"indeterminata" and "indet." are an identification qualifier', () => {
    expect(splitTaxon('Copepoda indeterminata')).toMatchObject({ scientificName: 'Copepoda', identificationQualifier: 'indet.' });
    expect(splitTaxon('Harpacticoida indet.')).toMatchObject({ scientificName: 'Harpacticoida', identificationQualifier: 'indet.' });
    expect(splitTaxon('Copepoda, indeterminata')).toMatchObject({ scientificName: 'Copepoda', identificationQualifier: 'indet.' });
    expect(splitTaxon('Oithona similis, c2')).toEqual({ verbatimIdentification: 'Oithona similis, c2', scientificName: 'Oithona similis', lifeStage: 'C2' });
  });
});

/* ---- 6. the stations of a net sheet and a CTD sheet ---- */

describe('a cast number at the end of a station label', () => {
  const BIO_H = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'];
  const bio = (rows: Cell[][]) => sheetInput(fileOf(BIO_H, rows, 'BIO', { fileName: 'net.csv' }), { quantity: QUANTITY, device: { kind: 'known', key: 'multinet' } });
  const CTD_H = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Temperature [°C]'];
  const ctd = (rows: Cell[][], ignoreCast: boolean, extra: Partial<ConvertSheetInput> = {}) =>
    sheetInput(fileOf(CTD_H, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true, ...(ignoreCast ? { ignoreCast: true } : {}) }, ...extra });
  const NET = [['XX1/006-6', 'n1', '2099-01-01', 71, 10.5, 0, 25, 3], ['XX1/007-5', 'n2', '2099-01-02', 71.2, 10.7, 0, 25, 2]] as Cell[][];
  const CTD = [
    ['XX1/006-1', '2099-01-01', 71.001, 10.501, 2, -1.6],
    ['XX1/006-1', '2099-01-01', 71.001, 10.501, 4, -1.5],
    ['XX1/006-2', '2099-01-01', 71.002, 10.502, 2, -1.6],
    ['XX1/007-1', '2099-01-02', 71.2, 10.7, 2, -1.4],
  ] as Cell[][];
  const run = (sheets: ConvertSheetInput[]) => approveAll(sheets);

  it('castBase cuts only a final hyphen and digits', () => {
    expect(castBase('PS27/006-6')).toBe('PS27/006');
    expect(castBase(' PS27/006-12 ')).toBe('PS27/006');
    expect(castBase('PS27/006')).toBe('PS27/006');
    expect(castBase('A-B')).toBe('A-B');
    expect(castBase('A-2-B')).toBe('A-2-B');
  });

  it('without the tick only identical labels match: no station of the CTD sheet matches (the raw state of the real files)', () => {
    const r = run([bio(NET), ctd(CTD, false)]);
    expect(r.profile?.stationsMatched).toBe(0);
    const u = r.findings.find((f) => f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED')!;
    expect(u.params.count).toBe(3);
    expect(r.events.filter((e) => e.eventType === 'station').map((e) => e.id).sort()).toEqual(['XX1/006-1', 'XX1/006-2', 'XX1/006-6', 'XX1/007-1', 'XX1/007-5']);
  });

  it('with the tick the casts of one station match its biology station and sit under it; their own IDs keep the cast, so two casts stay apart', () => {
    const r = run([bio(NET), ctd(CTD, true)]);
    expect(r.profile?.stationsMatched).toBe(3);
    expect(r.findings.some((f) => f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED')).toBe(false);
    expect(r.events.filter((e) => e.eventType === 'station').map((e) => e.id).sort()).toEqual(['XX1/006-6', 'XX1/007-5']);
    const levels = r.events.filter((e) => e.eventType === 'profile level');
    expect(levels.map((e) => [e.id, e.parentId])).toEqual([
      ['XX1/006-1:2m', 'XX1/006-6'],
      ['XX1/006-1:4m', 'XX1/006-6'],
      ['XX1/006-2:2m', 'XX1/006-6'],
      ['XX1/007-1:2m', 'XX1/007-5'],
    ]);
    expect(judge(r.findings).blocking).toEqual([]);
  });

  it('a base that two biology stations share is not matched (never guessed); a station of another base is not matched either', () => {
    const twoNets = [...NET, ['XX1/006-7', 'n3', '2099-01-01', 71.001, 10.5, 25, 50, 1]] as Cell[][];
    const r = run([bio(twoNets), ctd(CTD, true)]);
    const u = r.findings.find((f) => f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED')!;
    expect(String(u.params.names).split(', ').sort()).toEqual(['XX1/006-1', 'XX1/006-2']);
    const other = run([bio(NET), ctd([['XX1/099-1', '2099-01-01', 71, 10.5, 2, -1.6]], true)]);
    expect(other.profile?.stationsMatched).toBe(0);
  });

  it('a station matched farther than the limit from its biology station is said, naming both, to accept; a near one and an unpositioned one are not', () => {
    expect(STATION_FAR_KM).toBe(10);
    const far = run([bio(NET), ctd([['XX1/006-1', '2099-01-01', 71.5, 10.5, 2, -1.6], ['XX1/007-1', '2099-01-02', 71.2005, 10.7, 2, -1.4]], true)]);
    const f = far.findings.filter((x) => x.ruleId === 'CONV-PROFILE-STATION-FAR');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 1, limit: 10 });
    expect(String(f[0].params.names)).toMatch(/^XX1\/006-1 <-> XX1\/006-6 \(\d+ km\)$/);
    expect(judge(far.findings).acceptRules).toContain('CONV-PROFILE-STATION-FAR');
    expect(judge(far.findings).blocking).toEqual([]);
    for (const lang of LANGS) {
      const t = renderConvertPlain(f[0], lang);
      expect(t, lang).toContain('XX1/006-1');
      expect(t, lang).toContain('10 km');
      expect(t).not.toMatch(/[{}]/);
    }
    // an exact match is checked too (the tick is not what makes the check)
    const exact = run([bio([['XX1/006-1', 'n1', '2099-01-01', 71, 10.5, 0, 25, 3]]), ctd([['XX1/006-1', '2099-01-01', 71.5, 10.5, 2, -1.6]], false)]);
    expect(exact.findings.some((x) => x.ruleId === 'CONV-PROFILE-STATION-FAR')).toBe(true);
    // the biology station's own samples without a position give nothing to compare with
    const nopos = run([sheetInput(fileOf(['Station', 'Sample', 'Date', 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'], [['XX1/006-6', 'n1', '2099-01-01', 0, 25, 3]], 'B', { fileName: 'b.csv' }), { quantity: QUANTITY }), ctd(CTD, true)]);
    expect(nopos.findings.some((x) => x.ruleId === 'CONV-PROFILE-STATION-FAR')).toBe(false);
  });

  it('the tick is kept in the companion file by sheet name, and only pre-ticks the box', () => {
    const text = writeConvertSidecar({ profileSheets: ['CTD'], profileIgnoreCast: ['CTD'] });
    expect(text).toContain('(setting),profileIgnoreCast=CTD');
    const s = readConvertSettings(textFile('c.sidecar.csv', text))!;
    expect(s.profileIgnoreCast).toEqual(['CTD']);
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ profileSheets: ['CTD'] })))!.profileIgnoreCast).toBeUndefined();
  });
});

/* ---- 7. level IDs ---- */

describe('depth-made level IDs carry their unit', () => {
  it('a depth ID is <station>:<depth>m, so it never equals a numeric sample code of a station-prefixed sample ("2")', () => {
    const bio = sheetInput(fileOf(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'], [['S1', '2', '2099-01-01', 71, 10.5, 0, 25, 3]], 'B', { fileName: 'b.csv' }), { quantity: QUANTITY });
    const ctd = sheetInput(fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Temperature [°C]'], [['S1', '2099-01-01', 71, 10.5, 2, -1.6], ['S1', '2099-01-01', 71, 10.5, 2.5, -1.5]], 'C', { fileName: 'c.csv' }), { profile: { depthIds: true } });
    const r = convert({ sheets: [bio, ctd], options: { prefixStation: true }, approvedSplits: {} });
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.id)).toEqual(['S1:2']);
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['S1:2m', 'S1:2.5m']);
    expect(ruleIds(r)).not.toContain('CONV-ID-DUPLICATE');
  });

  it('a pressure ID keeps its dbar, and 5 m and 5 dbar are still two levels', () => {
    const ctd = sheetInput(fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Pressure [dbar]'], [['S1', '2099-01-01', 71, 10.5, 5, 5], ['S1', '2099-01-01', 71, 10.5, null, 5]], 'C', { fileName: 'c.csv' }), { profile: { depthIds: true } });
    const r = convert({ sheets: [ctd], options: {}, approvedSplits: {} });
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['S1:5m', 'S1:5dbar']);
  });
});

/* ---- 8. header recognition ---- */

describe('headers the overlay did not know', () => {
  const roleOf = (header: string[], name: string): ColumnRole => {
    const sheet = fileOf(header, [header.map(() => 1)]).sheets[0];
    return proposeConvertColumns(sheet, { decimalComma: false, date1904: false }).find((p) => p.header === name)!.role;
  };
  const BASE = ['Station', 'Date', 'Latitude', 'Longitude'];

  it('"Volume filtered (m3)" and "Volume (m3)" are the sampling effort, with the unit read from the brackets', () => {
    expect(roleOf([...BASE, 'Volume filtered (m3)', 'Calanus finmarchicus'], 'Volume filtered (m3)')).toEqual({ kind: 'effort', unit: 'm3' });
    expect(roleOf([...BASE, 'Volume (m3)', 'Calanus finmarchicus'], 'Volume (m3)')).toEqual({ kind: 'effort', unit: 'm3' });
    expect(roleOf([...BASE, 'Volume filtered [m3]', 'Calanus finmarchicus'], 'Volume filtered [m3]').kind).toBe('effort');
    // a bracket text is not a way into a taxon, a quantity or a stage
    expect(roleOf([...BASE, 'Species (all)', 'Calanus finmarchicus'], 'Species (all)')).not.toEqual({ kind: 'taxon' });
  });

  it('"Sample label (Multinet number)" and "Sample code/label" are the sample code', () => {
    expect(roleOf([...BASE, 'Sample label (Multinet number)', 'Calanus finmarchicus'], 'Sample label (Multinet number)')).toEqual({ kind: 'sampleId' });
    expect(roleOf([...BASE, 'Sample code/label', 'Calanus finmarchicus'], 'Sample code/label')).toEqual({ kind: 'sampleId' });
    expect(roleOf([...BASE, 'Sample label', 'Calanus finmarchicus'], 'Sample label')).toEqual({ kind: 'sampleId' });
  });

  it('Cond, Tpot, Sigma-theta and Temperature, water, potential are measured variables, never taxa; potential temperature is not plain temperature', () => {
    const header = [...BASE, 'Depth [m]', 'Temp [°C]', 'Cond [mS/cm]', 'Sal', 'Tpot [°C]', 'Sigma-theta [kg/m**3]'];
    expect(roleOf(header, 'Cond [mS/cm]')).toMatchObject({ kind: 'variable', variable: 'conductivity', unit: 'mS/cm' });
    expect(roleOf(header, 'Tpot [°C]')).toMatchObject({ kind: 'variable', variable: 'potential temperature' });
    expect(roleOf(header, 'Sigma-theta [kg/m**3]')).toMatchObject({ kind: 'variable', variable: 'sigma-theta', unit: 'kg/m**3' });
    expect(roleOf(header, 'Temp [°C]')).toMatchObject({ kind: 'variable', variable: 'temperature' });
    expect(roleOf([...BASE, 'Depth [m]', 'Temperature, water, potential [°C]'], 'Temperature, water, potential [°C]')).toMatchObject({ kind: 'variable', variable: 'potential temperature' });
    // none of them is a taxon candidate
    for (const h of ['Cond [mS/cm]', 'Tpot [°C]', 'Sigma-theta [kg/m**3]']) expect(roleOf(header, h)).not.toMatchObject({ kind: 'taxon' });
  });

  it('their concepts: conductivity, potential temperature and sigma-theta are offered (they name a method), never proposed; the units MSCM and UKMC are proposed', () => {
    const cond = suggestType('conductivity', 'mS/cm');
    expect(cond.proposed).toBeUndefined();
    expect(cond.offered.map((t) => t.code)).toEqual(['CNDCST01']);
    const pot = suggestType('potential temperature', '°C');
    expect(pot.proposed).toBeUndefined();
    expect(pot.offered.map((t) => t.code)).toEqual(['POTMCV01']);
    // plain temperature is TEMPPR01, and potential temperature is not offered TEMPPR01
    expect(suggestType('temperature', '°C').proposed?.code).toBe('TEMPPR01');
    expect(pot.offered.map((t) => t.code)).not.toContain('TEMPPR01');
    expect(suggestType('sigma-theta', 'kg/m**3').offered.map((t) => t.code)).toEqual(['SIGTEQ01']);
    expect(suggestUnit('mS/cm')?.code).toBe('MSCM');
    expect(suggestUnit('kg/m**3')?.code).toBe('UKMC');
    expect(suggestUnit('kg/m3')?.code).toBe('UKMC');
    expect(suggestType('Cond', 'mS/cm').offered.map((t) => t.code)).toEqual(['CNDCST01']);
  });
});

/* ---- 9. NA cells ---- */

describe('NA cells of a count column', () => {
  it('an NA cell makes no record, and an info line says how many (a blank cell is not counted)', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
    const rows: Cell[][] = [['A', 55, 2, '2023-06-14', 'NA', 4], ['B', 55, 2, '2023-06-14', 3, 'NA'], ['C', 55, 2, '2023-06-14', null, 'NA']];
    const r = approveAll([sheetInput(fileOf(header, rows), { quantity: { kind: 'count' } })]);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-NA-SKIPPED');
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(3);
    expect(f[0].severity).toBe('info');
    expect(judge(r.findings).showOnly.map((x) => x.ruleId)).toContain('CONV-NA-SKIPPED');
    expect(r.occurrences).toHaveLength(2);
    for (const lang of LANGS) expect(renderConvertPlain(f[0], lang), lang).toMatch(/NA/);
    const none = approveAll([sheetInput(fileOf(header, [['A', 55, 2, '2023-06-14', null, 4]]), { quantity: { kind: 'count' } })]);
    expect(none.findings.some((x) => x.ruleId === 'CONV-NA-SKIPPED')).toBe(false);
  });
});

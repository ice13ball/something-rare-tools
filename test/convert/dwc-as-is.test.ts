// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { xlsxFile } from '../helpers/files';
import { levelOf, proposeDwcAsIs } from '../../src/core/convert/dwcAsIs';
import { packDwcAsIs } from '../../src/core/convert/dwcAsIsTables';
import { asIsChecks } from '../../src/core/convert/dwcAsIsChecks';
import { asIsArchiveFiles } from '../../src/core/convert/dwcAsIsArchive';
import { CONVERT_RULES } from '../../src/core/rules/convert';
import { writeTsv } from '../../src/core/convert/dwca';
import type { Cell } from '../helpers/files';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';

// invented data throughout
const EVENT: Cell[][] = [
  ['eventID', 'parentEventID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'stationID'],
  ['CR1', null, '2020-05-01', 55.1, 10.2, 'S-A'],
  ['CR1-ST1', 'CR1', '2020-05-01', 55.1, 10.2, 'S-1'],
  ['CR1-ST2', 'CR1', '2020-05-02', 55.2, 10.3, 'S-2'],
];
const OCC: Cell[][] = [
  ['occurrenceID', 'eventID', 'scientificName', 'basisOfRecord', 'occurrenceStatus', 'replicate'],
  ['occ-1', 'CR1-ST1', 'Mytilus edulis', 'HumanObservation', 'present', 1],
  ['occ-2', 'CR1-ST1', 'Arenicola marina', 'HumanObservation', 'present', 2],
  ['occ-3', 'CR1-ST2', 'Mytilus edulis', 'HumanObservation', 'present', 1],
];
const EMOF: Cell[][] = [
  ['occurrenceID', 'eventID', 'scientificName', 'measurementType', 'measurementValue', 'measurementUnit'],
  ['occ-1', 'CR1-ST1', 'Mytilus edulis', 'length', 12.5, 'mm'],
  ['occ-2', 'CR1-ST1', 'Arenicola marina', 'length', 40, 'mm'],
  ['occ-3', 'CR1-ST2', 'Mytilus edulis', null, 7, 'mm'],
  ['occ-3', 'CR1-ST2', 'Mytilus edulis', 'weight', null, 'g'],
];
const META = { ...EMPTY_METADATA, title: 'Invented' };
const book = (sheets: Record<string, Cell[][]>) => xlsxFile('dwc.xlsx', sheets);
const all = (over: Partial<Record<'Event' | 'Occurrence' | 'eMoF', Cell[][]>> = {}) => book({ Event: EVENT, Occurrence: OCC, eMoF: EMOF, ...over } as Record<string, Cell[][]>);

describe('as-is recognition', () => {
  it('reads an Event / Occurrence / eMoF workbook, with non-term columns tolerated', () => {
    const f = all();
    expect(f.sheets.map(levelOf)).toEqual(['event', 'occurrence', 'emof']);
    expect(proposeDwcAsIs([f])).toEqual({ event: { file: 0, sheet: 'Event' }, occurrence: { file: 0, sheet: 'Occurrence' }, emof: { file: 0, sheet: 'eMoF' } });
  });
  it('accepts dwc: prefixes and case, and several files', () => {
    const a = book({ Events: [['DWC:eventID', 'dwc:EventDate'], ['E1', '2020-01-01']] });
    const b = book({ Occ: [['occurrenceID', 'EVENTID', 'http://rs.tdwg.org/dwc/terms/scientificName'], ['o1', 'E1', 'X y']] });
    expect(proposeDwcAsIs([a, b])).toEqual({ event: { file: 0, sheet: 'Events' }, occurrence: { file: 1, sheet: 'Occ' } });
  });
  it('is not proposed for a plain data sheet, or when most headers are not terms', () => {
    expect(proposeDwcAsIs([book({ S: [['Station', 'Date', 'Species', 'Count'], ['A', '2020-01-01', 'Mytilus edulis', 3]] })])).toBeNull();
    const weak = book({ Event: [['eventID', 'eventDate', 'a', 'b', 'c', 'd'], ['E1', '2020-01-01', 1, 2, 3, 4]], Occurrence: OCC });
    expect(proposeDwcAsIs([weak])).toBeNull();
  });
  it('is not proposed with two event sheets', () => {
    expect(proposeDwcAsIs([all({}), all({})])).toBeNull();
  });
});

describe('as-is packing', () => {
  const f = all();
  const p = proposeDwcAsIs([f])!;
  const r = packDwcAsIs([f], p);

  it('keeps the file own ids and column names and order', () => {
    expect(r.tables.event.columns.map((c) => c.header)).toEqual(['eventID', 'parentEventID', 'eventDate', 'decimalLatitude', 'decimalLongitude']);
    expect(r.tables.event.rows.map((x) => x[0])).toEqual(['CR1', 'CR1-ST1', 'CR1-ST2']);
    expect(r.tables.occurrence.rows.map((x) => x[0])).toEqual(['occ-1', 'occ-2', 'occ-3']);
    expect(r.tables.occurrence.columns.map((c) => c.header)).toEqual(['occurrenceID', 'eventID', 'scientificName', 'basisOfRecord', 'occurrenceStatus']);
  });
  it('lists non-term columns once per sheet and drops the redundant scientificName of eMoF', () => {
    const ids = r.findings.map((x) => x.ruleId);
    expect(ids.filter((i) => i === 'CONV-ASIS-COLUMNS-NOT-TERM')).toHaveLength(2);
    expect(r.findings.find((x) => x.ruleId === 'CONV-ASIS-COLUMNS-NOT-TERM' && x.sheet === 'Event')?.params.columns).toBe('stationID');
    expect(ids).toContain('CONV-ASIS-EMOF-REDUNDANT');
    expect(r.tables.emof!.columns.map((c) => c.header)).toEqual(['occurrenceID', 'eventID', 'measurementType', 'measurementValue', 'measurementUnit']);
  });
  it('does not write an eMoF row with a value and no type or a type and no value, and lists the lines', () => {
    expect(r.tables.emof!.rows).toHaveLength(2);
    const x = r.findings.find((y) => y.ruleId === 'CONV-ASIS-EMOF-ROWS-NOT-WRITTEN')!;
    expect(x.lines).toEqual([4, 5]);
  });
  it('accounts for every row: 0 lost', () => {
    for (const a of r.accounts) expect(a.lost).toBe(0);
    const em = r.accounts.find((a) => a.level === 'emof')!;
    expect(em.rows).toBe(4);
    expect(em.written + em.notWritten.length).toBe(4);
  });
  it('writes the tables as tab-separated text', () => {
    expect(writeTsv(r.tables.event).split('\n')[1]).toBe('CR1\t\t2020-05-01\t55.1\t10.2');
  });
});

describe('as-is integrity', () => {
  const run = (over: Record<string, Cell[][]>) => {
    const f = all(over);
    return packDwcAsIs([f], proposeDwcAsIs([f])!);
  };
  const policy = (id: string) => CONVERT_RULES.find((x) => x.id === id)?.exportPolicy;
  it('duplicate eventID blocks, with the line', () => {
    const r = run({ Event: [...EVENT, ['CR1-ST2', 'CR1', '2020-05-03', 55.3, 10.4, 'S-3']] });
    const x = r.findings.find((y) => y.ruleId === 'CONV-ASIS-EVENT-ID-DUPLICATE')!;
    expect(x.lines).toEqual([5]);
    expect(policy(x.ruleId)).toBe('block');
  });
  it('duplicate occurrenceID blocks', () => {
    const r = run({ Occurrence: [...OCC, ['occ-1', 'CR1-ST2', 'Mytilus edulis', 'HumanObservation', 'present', 3]] });
    expect(r.findings.find((y) => y.ruleId === 'CONV-ASIS-OCC-ID-DUPLICATE')?.lines).toEqual([5]);
  });
  it('an occurrence whose eventID is not in Event blocks', () => {
    const r = run({ Occurrence: [...OCC, ['occ-9', 'ST-NOPE', 'Mytilus edulis', 'HumanObservation', 'present', 3]] });
    expect(r.findings.find((y) => y.ruleId === 'CONV-ASIS-OCC-ORPHAN')?.lines).toEqual([5]);
  });
  it('an eMoF row with an unknown occurrenceID or eventID is an error with line numbers', () => {
    const r = run({ eMoF: [...EMOF.slice(0, 3), ['occ-77', 'CR1-ST1', 'x', 'length', 3, 'mm'], ['occ-1', 'ST-NOPE', 'x', 'length', 3, 'mm']] });
    const o = r.findings.filter((y) => y.ruleId === 'CONV-EMOF-ORPHAN');
    expect(o.map((y) => [y.params.kind, y.lines])).toEqual([['event', [5]], ['occurrence', [4]]]);
  });
  it('an eMoF sheet without an eventID takes the eventID of the occurrence it names', () => {
    const noEv = EMOF.map((row) => row.filter((_, i) => i !== 1));
    const r = run({ eMoF: noEv });
    expect(r.tables.emof!.columns[0].header).toBe('eventID');
    expect(r.tables.emof!.rows.map((x) => x[0])).toEqual(['CR1-ST1', 'CR1-ST1']);
  });
  it('a term of another level is reported, not moved', () => {
    const r = run({ Event: EVENT.map((row, i) => [...row, i === 0 ? 'scientificName' : 'X y']) });
    expect(r.tables.event.columns.map((c) => c.header)).not.toContain('scientificName');
    expect(r.findings.find((y) => y.ruleId === 'CONV-ASIS-COLUMNS-OTHER-LEVEL')?.params.columns).toBe('scientificName');
  });
  it('the Darwin Core checks still run on the result', () => {
    const f = all({ Occurrence: OCC.map((row, i) => (i === 0 ? row : row.map((c, j) => (j === 4 ? 'maybe' : c)))) });
    const r = packDwcAsIs([f], proposeDwcAsIs([f])!);
    const ids = asIsChecks(r, META).map((x) => x.ruleId);
    expect(ids.some((i) => i.startsWith('DWC-'))).toBe(true);
    expect(ids).not.toContain('CONV-BASIS-UNSET');
  });
});

describe('as-is archive', () => {
  it('has meta.xml, eml.xml and the three tables, ids unchanged', () => {
    const f = all();
    const r = packDwcAsIs([f], proposeDwcAsIs([f])!);
    const files = asIsArchiveFiles(r, { ...EMPTY_METADATA, title: 'Invented', licence: 'CC-BY-4.0', basisOfRecord: 'HumanObservation' }, '2026-11-26');
    expect(files.map((x) => x.name)).toEqual(['meta.xml', 'eml.xml', 'event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
    const occ = new TextDecoder().decode(files[3].data);
    expect(occ.split('\n')[1].startsWith('occ-1\tCR1-ST1\tMytilus edulis')).toBe(true);
  });
});

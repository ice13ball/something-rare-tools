// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sheet in the eMoF long shape (eventID, occurrenceID, scientificName, measurementType, measurementValue, measurementUnit ...) is read as measurements. All values are invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { proposeConvertMapping, suggestConvertShape } from '../../src/core/convert/recognize';
import type { RawSheet } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import type { Cell } from './helpers';

const OCC: Cell[][] = [
  ['eventID', 'occurrenceID', 'scientificName', 'individualCount', 'eventDate', 'decimalLatitude', 'decimalLongitude'],
  ['E1', 'E1-o1', 'Gadus morhua', 3, '2022-03-01', 60.1, 4.2],
  ['E1', 'E1-o2', 'Pollachius virens', 1, '2022-03-01', 60.1, 4.2],
  ['E2', 'E2-o1', 'Gadus morhua', 2, '2022-03-02', 60.3, 4.4],
];
const EM_HEADER: Cell[] = ['eventID', 'replicate', 'occurrenceID', 'scientificName', 'measurementValue', 'measurementType', 'measurementUnit', 'measurementUnitID'];
const UXMM = 'http://vocab.nerc.ac.uk/collection/P06/current/UXMM/';
const EM: Cell[][] = [
  EM_HEADER,
  ['E1', 1, 'E1-o1', 'Gadus morhua', 310, 'body length', 'mm', UXMM],
  ['E1', 1, 'E1-o2', 'Pollachius virens', 400, 'body length', 'mm', null],
  ['E1', 1, null, null, 12.5, 'water temperature', 'degC', null],
  ['E2', 1, 'E2-o1', 'Gadus morhua', null, 'body length', 'mm', null],
];

const mappingFor = (s: RawSheet) => proposeConvertMapping(s, { decimalComma: false, date1904: false });

function run(sheets: Record<string, Cell[][]>) {
  const f = xlsxFile('book.xlsx', sheets as never);
  const inputs: ConvertSheetInput[] = f.sheets.map((s) => {
    const mapping = mappingFor(s);
    return { file: { ...f, sheets: [s] }, sheet: s.name, mapping, shape: suggestConvertShape(mapping.columns) ?? 'long' };
  });
  return convert({ sheets: inputs });
}

describe('eMoF roles are proposed from the exact Darwin Core header', () => {
  const kinds = (header: Cell[]) => {
    const f = xlsxFile('b.xlsx', { emof: [header, header.map(() => 'x')] as never });
    return mappingFor(f.sheets[0]).columns.map((c) => c.role.kind);
  };
  it('names the eMoF columns, whatever the case or the prefix', () => {
    expect(kinds(['measurementValue', 'measurementType', 'measurementUnit', 'measurementTypeID', 'measurementUnitID', 'measurementValueID', 'measurementAccuracy', 'measurementMethod', 'measurementRemarks'])).toEqual([
      'measurementValue', 'measurementType', 'measurementUnit', 'measurementTypeId', 'measurementUnitId', 'measurementValueId', 'measurementAccuracy', 'measurementMethod', 'measurementRemarks',
    ]);
    expect(kinds(['MEASUREMENTVALUE', 'dwc:measurementType', 'http://rs.tdwg.org/dwc/terms/measurementUnit'])).toEqual(['measurementValue', 'measurementType', 'measurementUnit']);
  });
  it('does not guess from a header that is only close to the term, or from the values', () => {
    expect(kinds(['value', 'type', 'unit'])).not.toContain('measurementValue');
    expect(kinds(['Measurement value', 'Measurement type'])).not.toContain('measurementValue');
  });
  it('leaves a sheet with no measurementValue column as it was', () => {
    expect(kinds(['eventID', 'scientificName', 'measurementType', 'measurementUnit'])).not.toContain('measurementType');
  });
});

describe('an eMoF sheet next to an occurrence sheet', () => {
  const r = run({ occurrence: OCC, emof: EM });
  it('makes no occurrence of its own', () => {
    expect(r.occurrences.map((o) => o.id).sort()).toEqual(['E1-o1', 'E1-o2', 'E2-o1']);
  });
  it('writes one measurement per row with a value, as the cells say', () => {
    const m = r.measurements.filter((x) => x.measurementType === 'body length' || x.measurementType === 'water temperature');
    expect(m).toHaveLength(3);
    expect(m.find((x) => x.target.id === 'E1-o1')).toMatchObject({ target: { kind: 'occurrence', id: 'E1-o1' }, measurementType: 'body length', measurementValue: '310', measurementUnit: 'mm', measurementUnitId: UXMM });
    expect(m.find((x) => x.target.id === 'E1-o2')).toMatchObject({ target: { kind: 'occurrence' }, measurementValue: '400' });
    expect(m.find((x) => x.measurementType === 'water temperature')).toMatchObject({ target: { kind: 'event', id: 'E1' }, measurementValue: '12.5', measurementUnit: 'degC' });
  });
  it('writes no variable named after the column', () => {
    expect(r.measurements.some((x) => x.measurementType === 'measurementValue')).toBe(false);
  });
  it('says the row without a value was not written, with a reason', () => {
    const sheet = r.ledger.find((l) => l.sheet === 'emof')!;
    expect(sheet.rows.source).toBe(4);
    expect(sheet.rows.written).toBe(3);
    expect(sheet.lines.some((l) => l.line === 5 && l.fate === 'nothing-to-record')).toBe(true);
    expect(sheet.rows.unexplained).toBe(0);
  });
});

describe('what an eMoF row may name', () => {
  it('keeps the vocabulary IDs of the file and writes accuracy, method and remarks', () => {
    const rows: Cell[][] = [
      ['eventID', 'occurrenceID', 'measurementType', 'measurementTypeID', 'measurementValue', 'measurementValueID', 'measurementUnit', 'measurementUnitID', 'measurementAccuracy', 'measurementMethod', 'measurementRemarks'],
      ['E1', 'E1-o1', 'body length', 'http://vocab.nerc.ac.uk/collection/P01/current/OBSINDLX/', 310, 'urn:x:1', 'mm', UXMM, '0.5', 'ruler', 'fresh'],
    ];
    const r = run({ occurrence: OCC, emof: rows });
    expect(r.measurements.find((x) => x.measurementType === 'body length')).toMatchObject({
      measurementTypeId: 'http://vocab.nerc.ac.uk/collection/P01/current/OBSINDLX/', measurementValueId: 'urn:x:1', measurementUnitId: UXMM, measurementAccuracy: '0.5', measurementMethod: 'ruler', measurementRemarks: 'fresh',
    });
  });
  it('lists a value with no type and blocks until it is decided', () => {
    const r = run({ occurrence: OCC, emof: [EM_HEADER, ['E1', 1, 'E1-o1', 'Gadus morhua', 5, null, 'mm', null]] });
    expect(r.ledger.find((l) => l.sheet === 'emof')!.lines.some((l) => l.fate === 'empty-parameter')).toBe(true);
    expect(r.measurements.length).toBe(0);
    expect(r.blocking.length).toBeGreaterThan(0);
  });
  it('lists a row that names an occurrence the file does not have, and does not move it to the event', () => {
    const r = run({ occurrence: OCC, emof: [EM_HEADER, ['E1', 1, 'E1-zzz', 'Gadus morhua', 5, 'body length', 'mm', null]] });
    expect(r.ledger.find((l) => l.sheet === 'emof')!.lines.some((l) => l.fate === 'measurement-no-target')).toBe(true);
    expect(r.measurements.length).toBe(0);
  });
  it('attaches a row with a taxon and no occurrenceID to the one occurrence of that taxon in the event, else lists it', () => {
    const hdr: Cell[] = ['eventID', 'scientificName', 'measurementType', 'measurementValue'];
    const r = run({ occurrence: OCC, emof: [hdr, ['E1', 'Gadus morhua', 'body length', 301], ['E3', 'Gadus morhua', 'body length', 7]] });
    expect(r.measurements.filter((x) => x.measurementType === 'body length')).toMatchObject([{ target: { kind: 'occurrence', id: 'E1-o1' } }]);
    expect(r.ledger.find((l) => l.sheet === 'emof')!.lines.some((l) => l.fate === 'measurement-no-target')).toBe(true);
  });
});

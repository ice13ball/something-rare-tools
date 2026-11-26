// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { inflateRawSync } from 'node:zlib';
import { openZip } from '../../src/core/parse/zip';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import type { DwcAsIsBody } from '../../src/worker/convert.protocol';

// invented data throughout
type Cell = string | number | null;
const xlsx = (sheets: Record<string, Cell[][]>): Uint8Array => {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const EVENT: Cell[][] = [['eventID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'stationID'], ['E1', '2020-05-01', 55.1, 10.2, 'S1'], ['E2', '2020-05-02', 55.2, 10.3, 'S2']];
const OCC: Cell[][] = [['occurrenceID', 'eventID', 'scientificName', 'basisOfRecord', 'occurrenceStatus'], ['o1', 'E1', 'Mytilus edulis', 'HumanObservation', 'present'], ['o2', 'E2', 'Arenicola marina', 'HumanObservation', 'present']];
const EMOF: Cell[][] = [['occurrenceID', 'measurementType', 'measurementValue', 'measurementUnit'], ['o1', 'length', 12, 'mm'], ['o2', 'length', null, 'mm']];
const dwc = (over: Record<string, Cell[][]> = {}) => xlsx({ Event: EVENT, Occurrence: OCC, eMoF: EMOF, ...over });
const body = (extra: Partial<DwcAsIsBody> = {}): DwcAsIsBody => ({ metadata: { ...EMPTY_METADATA, title: 'Invented', abstract: 'An invented test set.', creators: 'Ada Test', contactName: 'Ada Test', contactEmail: 'ada@example.org', institutionCode: 'TST', licence: 'CC-BY-4.0' }, accepted: [], generated: '2026-11-26T00:00:00Z', ...extra });

describe('as-is in the worker', () => {
  it('proposes only for a Darwin Core drop, and leaves the parse result of any other file as it was', async () => {
    const e = createDirectConvertEngine();
    const plain = await e.parse([{ name: 'p.xlsx', bytes: xlsx({ S: [['Station', 'Species', 'Count'], ['A', 'Mytilus edulis', 3]] }), source: 'dropped' }]);
    expect('dwcAsIs' in plain).toBe(false);
    const p = await e.parse([{ name: 'd.xlsx', bytes: dwc(), source: 'dropped' }]);
    expect(p.dwcAsIs).toEqual({ event: { file: 'd.xlsx', sheet: 'Event' }, occurrence: { file: 'd.xlsx', sheet: 'Occurrence' }, emof: { file: 'd.xlsx', sheet: 'eMoF' } });
  });
  it('refuses a view of files that are not Darwin Core', async () => {
    const e = createDirectConvertEngine();
    await e.parse([{ name: 'p.xlsx', bytes: xlsx({ S: [['Station', 'Species'], ['A', 'x']] }), source: 'dropped' }]);
    await expect(e.dwcView(body())).rejects.toThrow(/not Darwin Core/);
  });
  it('shows 0 lost, lists the half-empty eMoF row, and asks for its acceptance before export', async () => {
    const e = createDirectConvertEngine();
    await e.parse([{ name: 'd.xlsx', bytes: dwc(), source: 'dropped' }]);
    const v = await e.dwcView(body());
    expect(v.lost).toBe(0);
    expect(v.counts).toEqual({ events: 2, occurrences: 2, measurements: 1 });
    expect(v.findings.map((f) => f.ruleId)).toContain('CONV-ASIS-EMOF-ROWS-NOT-WRITTEN');
    await expect(e.dwcExport(body())).rejects.toThrow(/not accepted/);
  });
  it('exports the own IDs unchanged, and lists the unwritten row and columns', async () => {
    const e = createDirectConvertEngine();
    await e.parse([{ name: 'd.xlsx', bytes: dwc(), source: 'dropped' }]);
    const out = await e.dwcExport(body({ accepted: ['CONV-ASIS-EMOF-ROWS-NOT-WRITTEN', 'DWC-RECOMMENDED'] }));
    const zip = openZip(out.bytes);
    expect(zip.entries.map((x) => x.name).sort()).toEqual(['eml.xml', 'event.txt', 'extendedmeasurementorfact.txt', 'meta.xml', 'occurrence.txt']);
    const txt = async (n: string): Promise<string> => new TextDecoder().decode(await zip.read(zip.find(n)!, async (d) => new Uint8Array(inflateRawSync(d))));
    const ev = (await txt('event.txt')).split('\n');
    expect(ev[1].split('\t')[ev[0].split('\t').indexOf('eventID')]).toBe('E1');
    expect(await txt('occurrence.txt')).toContain('o2');
    expect(out.counts).toEqual({ events: 2, occurrences: 2, measurements: 1 });
    const nw = await e.dwcNotWritten(body());
    const text = await nw.blob.text();
    expect(text).toContain('not a Darwin Core term');
    expect(text).toContain('measurementValue is empty');
    expect(text).toContain('stationID');
  });
  it('blocks the export on a duplicate eventID and an orphan occurrence', async () => {
    const e = createDirectConvertEngine();
    await e.parse([{ name: 'd.xlsx', bytes: dwc({ Event: [...EVENT, ['E1', '2020-05-03', 55.3, 10.4, 'S3']], Occurrence: [...OCC, ['o3', 'NOPE', 'Mytilus edulis', 'HumanObservation', 'present']] }), source: 'dropped' }]);
    const v = await e.dwcView(body());
    expect(v.ok).toBe(false);
    expect(v.findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(['CONV-ASIS-EVENT-ID-DUPLICATE', 'CONV-ASIS-OCC-ORPHAN']));
    await expect(e.dwcExport(body({ accepted: ['CONV-ASIS-EMOF-ROWS-NOT-WRITTEN', 'DWC-RECOMMENDED'] }))).rejects.toThrow(/block/);
  });
});

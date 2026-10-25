// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The synthetic sheets W1, W2, L1 and L2 through the whole export, and the archive read back with the repository's own readers (zip reader, DwC-A reader):
// every table is checked for counts, IDs and parent links, absences without eMoF, life stage and sex, and units with their P06 ids. Every value is invented.
import { describe, expect, it } from 'vitest';
import { archiveFiles, buildTables, slugOf } from '../../src/core/convert/dwca';
import { P01, P06 } from '../../src/core/convert/vocab';
import { judge } from '../../src/core/convert/policy';
import { parseXml } from '../../src/core/metadata/xml';
import { exportSheet, objects, readBack } from './exportHelpers';
import type { ReadBack } from './exportHelpers';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, W2_HEADER, W2_QUANTITY, W2_ROWS } from './helpers';
import type { Cell } from './helpers';

const FIELD_TERMS = (meta: string, rowType: string): string[] => {
  const doc = parseXml(meta, 'meta.xml');
  const el = [...doc.getElementsByTagName('core'), ...doc.getElementsByTagName('extension')].find((e) => e.getAttribute('rowType') === rowType)!;
  const fields = [...el.getElementsByTagName('field')].map((f) => ({ index: Number(f.getAttribute('index')), term: f.getAttribute('term') as string }));
  return fields.sort((a, b) => a.index - b.index).map((f) => f.term);
};
const local = (uri: string): string => uri.slice(uri.lastIndexOf('/') + 1);
const ROW = { event: 'http://rs.tdwg.org/dwc/terms/Event', occurrence: 'http://rs.tdwg.org/dwc/terms/Occurrence', emof: 'http://rs.iobis.org/obis/terms/ExtendedMeasurementOrFact' };

/** What every archive of the converter must satisfy, whatever the sheet: the structure BioCheck needs (stage 0 spike, Item 2) and consistent tables. */
function expectSoundArchive(b: ReadBack): void {
  expect(b.names).toEqual(expect.arrayContaining(['meta.xml', 'eml.xml', 'event.txt', 'occurrence.txt']));
  const ev = objects(b.tables['event.txt']);
  const occ = objects(b.tables['occurrence.txt']);
  const emofTable = b.tables['extendedmeasurementorfact.txt'];
  const emof = emofTable ? objects(emofTable) : [];
  // meta.xml names exactly the columns of each file, in order, and the links
  expect(FIELD_TERMS(b.meta, ROW.event).map(local)).toEqual(b.tables['event.txt'].header);
  expect(FIELD_TERMS(b.meta, ROW.occurrence).map(local)).toEqual(b.tables['occurrence.txt'].header);
  if (emofTable) expect(FIELD_TERMS(b.meta, ROW.emof).map(local)).toEqual(emofTable.header.filter((h) => h !== 'eventID'));
  // BioCheck: eventID AND parentEventID exist; datasetName and institutionCode exist and are filled; every ID is unique and every link resolves
  for (const h of ['eventID', 'parentEventID', 'eventType', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'datasetName', 'institutionCode']) expect(b.tables['event.txt'].header, h).toContain(h);
  expect(new Set(ev.map((e) => e.eventID)).size).toBe(ev.length);
  for (const e of ev) {
    expect(e.datasetName, e.eventID).not.toBe('');
    expect(e.institutionCode, e.eventID).not.toBe('');
    if (e.parentEventID !== '') expect(ev.some((p) => p.eventID === e.parentEventID), `parent of ${e.eventID}`).toBe(true);
    if (e.decimalLatitude !== '') expect(e.geodeticDatum).toBe('EPSG:4326');
  }
  expect(new Set(occ.map((o) => o.occurrenceID)).size).toBe(occ.length);
  const evIds = new Set(ev.map((e) => e.eventID));
  for (const o of occ) {
    expect(evIds.has(o.eventID), `event of ${o.occurrenceID}`).toBe(true);
    expect(['present', 'absent']).toContain(o.occurrenceStatus);
    expect(o.basisOfRecord).toBe('HumanObservation');
  }
  // eMoF: its eventID is the event of its occurrence; every measurement has a type and a value
  const occEvent = new Map(occ.map((o) => [o.occurrenceID, o.eventID]));
  for (const m of emof) {
    expect(evIds.has(m.eventID)).toBe(true);
    if (m.occurrenceID !== '') expect(occEvent.get(m.occurrenceID), m.occurrenceID).toBe(m.eventID);
    expect(m.measurementType).not.toBe('');
    expect(m.measurementValue).not.toBe('');
  }
  // text files: UTF-8 (decoded fatally in readBack), one trailing newline, no carriage return, no quote enclosure
  for (const t of Object.values(b.tables)) expect(t.header.length).toBeGreaterThan(0);
  for (const [name, text] of Object.entries(b.text)) if (name.endsWith('.txt')) expect(text, name).not.toMatch(/\r|^"|\t"|"\t/m);
  // the repository's DwC-A reader reads the same archive: an Event core with the columns of meta.xml and one row per event
  expect(b.core.dwca).toEqual({ core: 'Event', partial: false });
  expect(b.core.sheets[0].header).toEqual(b.tables['event.txt'].header);
  expect(b.core.sheets[0].rows).toHaveLength(ev.length);
  expect(b.core.findings.find((f) => f.ruleId === 'IN-DWCA-EVENT-CORE')?.params.occurrences).toBe(occ.length);
}

describe('W1: wide counts, a full species list, effort as a column', () => {
  it('writes the Event core, the Occurrence extension and the eMoF extension, and the archive reads back', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    expect(judge(e.findings).blocking).toEqual([]);
    expect(e.zip.length).toBeGreaterThan(0);
    const b = await readBack(e.zip);
    expectSoundArchive(b);
    const ev = objects(b.tables['event.txt']);
    expect(ev.map((x) => x.eventType)).toEqual(['cruise', 'station', 'station', 'sample', 'sample', 'sample']);
    expect(ev.map((x) => x.eventID)).toEqual(['CR1', 'CR1:S1', 'CR1:S2', 'S1-a', 'S1-b', 'S2-a']);
    // parent links: cruise -> none, station -> cruise, sample -> its station
    expect(ev.map((x) => x.parentEventID)).toEqual(['', 'CR1', 'CR1', 'CR1:S1', 'CR1:S1', 'CR1:S2']);
    // the sample size: the source text, with its unit; positions and depths as written
    const s = ev.find((x) => x.eventID === 'S1-a')!;
    expect(s).toMatchObject({ decimalLatitude: '55.5', decimalLongitude: '2.5', minimumDepthInMeters: '0', maximumDepthInMeters: '25', sampleSizeValue: '12.3', sampleSizeUnit: 'm3', eventDate: '2023-06-14' });
    // the cruise is derived: its date span, position, depth range and an uncertainty, and the page said so
    const cruise = ev[0];
    expect(cruise).toMatchObject({ eventDate: '2023-06-14/2023-06-16', minimumDepthInMeters: '0', maximumDepthInMeters: '50' });
    expect(Number(cruise.coordinateUncertaintyInMeters)).toBeGreaterThan(0);
    // occurrences: 3 samples x 3 taxa minus the empty cell and the NA = 7, one of them an absence with a count of zero and no organismQuantity
    const occ = objects(b.tables['occurrence.txt']);
    expect(occ).toHaveLength(7);
    const absent = occ.filter((o) => o.occurrenceStatus === 'absent');
    expect(absent).toHaveLength(1);
    expect(absent[0]).toMatchObject({ scientificName: 'Pseudocalanus', verbatimIdentification: 'Pseudocalanus sp.', identificationQualifier: 'sp.', individualCount: '0', organismQuantity: '', organismQuantityType: '' });
    const present = occ.filter((o) => o.occurrenceStatus === 'present');
    for (const o of present) expect(o).toMatchObject({ organismQuantityType: 'individuals', organismQuantity: o.individualCount });
    expect(occ.find((o) => o.occurrenceID === 'S1-a:Calanus finmarchicus')).toMatchObject({ eventID: 'S1-a', individualCount: '10' });
    // eMoF: a count (no unit) for each present occurrence, the volume (m3, MCUB) for each sample, nothing for the absence
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    expect(emof.filter((m) => m.measurementTypeID === P01.count.uri)).toHaveLength(6);
    for (const m of emof.filter((x) => x.measurementTypeID === P01.count.uri)) expect(m).toMatchObject({ measurementUnit: '', measurementUnitID: '', measurementValueID: '' });
    const vol = emof.filter((m) => m.measurementTypeID === P01.volumeSampled.uri);
    expect(vol.map((m) => m.eventID).sort()).toEqual(['S1-a', 'S1-b', 'S2-a']);
    expect(vol.every((m) => m.occurrenceID === '' && m.measurementUnit === 'm3' && m.measurementUnitID === P06.m3.uri)).toBe(true);
    expect(vol.map((m) => m.measurementValue)).toEqual(['12.3', '12.1', '13']);
    expect(emof.some((m) => m.occurrenceID === absent[0].occurrenceID)).toBe(false);
    expect(emof).toHaveLength(9);
  });

  it('without the full-list tick the zero is not written at all (no absence, no eMoF), and the count of skipped cells is information', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: false });
    const b = await readBack(e.zip);
    expect(objects(b.tables['occurrence.txt']).filter((o) => o.occurrenceStatus === 'absent')).toEqual([]);
    expect(objects(b.tables['occurrence.txt'])).toHaveLength(6);
    expect(e.findings.find((f) => f.ruleId === 'CONV-ZERO-SKIPPED')?.severity).toBe('info');
  });
});

describe('W2: wide density with life stages, sp. and cf.', () => {
  it('life stage, qualifier and verbatim identification are separate columns; the unit is the one typed, with its P06 id; the values are the cells as written', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true });
    expect(judge(e.findings).blocking).toEqual([]);
    const b = await readBack(e.zip);
    expectSoundArchive(b);
    const occ = objects(b.tables['occurrence.txt']);
    expect(occ).toHaveLength(8);
    const stage = occ.find((o) => o.verbatimIdentification === 'Calanus finmarchicus c2')!;
    expect(stage).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C2', identificationQualifier: '' });
    expect(occ.find((o) => o.verbatimIdentification === 'Augaptilus glacialis, c2')).toMatchObject({ scientificName: 'Augaptilus glacialis', lifeStage: 'C2' });
    const cf = occ.filter((o) => o.verbatimIdentification === 'Calanus cf. glacialis');
    expect(cf.every((o) => o.scientificName === 'Calanus glacialis' && o.identificationQualifier === 'cf.')).toBe(true);
    expect(occ.filter((o) => o.verbatimIdentification === 'Pseudocalanus sp.').every((o) => o.scientificName === 'Pseudocalanus' && o.identificationQualifier === 'sp.')).toBe(true);
    // a density is not a count: no individualCount column at all
    expect(b.tables['occurrence.txt'].header).not.toContain('individualCount');
    // the cf. glacialis zero of the second sample is an absence and has no measurement
    const absent = occ.filter((o) => o.occurrenceStatus === 'absent');
    expect(absent.map((o) => o.occurrenceID)).toEqual(['T2-1:Calanus cf. glacialis']);
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    expect(emof.some((m) => m.occurrenceID === 'T2-1:Calanus cf. glacialis')).toBe(false);
    const dens = emof.filter((m) => m.measurementTypeID === P01.densityVolume.uri);
    expect(dens).toHaveLength(7);
    expect(dens.every((m) => m.measurementUnit === '#/m3' && m.measurementUnitID === P06.perM3.uri)).toBe(true);
    expect(dens.find((m) => m.occurrenceID === 'T1-1:Calanus finmarchicus c2')?.measurementValue).toBe('12.5');
    expect(dens.find((m) => m.occurrenceID === 'T2-1:Pseudocalanus sp.')?.measurementValue).toBe('38.5');
    const vol = emof.filter((m) => m.measurementTypeID === P01.volumeSampled.uri);
    expect(vol.map((m) => [m.eventID, m.measurementValue, m.measurementUnitID])).toEqual([['T1-1', '25', P06.m3.uri], ['T2-1', '24', P06.m3.uri]]);
  });

  it('a biomass per area of the bed uses its own concept; a unit with no verified P06 id is written without one and the warning says so', async () => {
    const rows: Cell[][] = [['A1', 55.5, 2.5, '2023-06-14', 4, 2]];
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Abra alba', 'Nucula nitidosa'];
    const bed = await exportSheet(header, rows, { quantity: { kind: 'biomass', unit: 'g/m2', basis: 'wet', medium: 'bed' } });
    const emof = objects((await readBack(bed.zip)).tables['extendedmeasurementorfact.txt']);
    expect(emof.map((m) => m.measurementTypeID)).toEqual([P01.wetPerAreaBed.uri, P01.wetPerAreaBed.uri]);
    expect(emof.every((m) => m.measurementUnitID === P06.gPerM2.uri)).toBe(true);
    const odd = await exportSheet(header, rows, { quantity: { kind: 'density', unit: 'ind per tow', per: 'volume' } });
    const m = objects((await readBack(odd.zip)).tables['extendedmeasurementorfact.txt']);
    expect(m.every((x) => x.measurementUnit === 'ind per tow' && x.measurementUnitID === '')).toBe(true);
    expect(odd.findings.some((f) => f.ruleId === 'CONV-UNIT-NO-P06')).toBe(true);
  });

  it('a density per area of the water column has no verified concept: the declared meaning is the measurementType, the id stays empty, and the warning (to be accepted) says so', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Abra alba'], [['A1', 55.5, 2.5, '2023-06-14', 4]], { quantity: { kind: 'density', unit: '#/m2', medium: 'water' } });
    expect(e.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')?.severity).toBe('warning');
    expect(judge(e.findings).blocking).toEqual([]);
    const m = objects((await readBack(e.zip)).tables['extendedmeasurementorfact.txt']);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ measurementType: 'Density per area of the water column', measurementTypeID: '', measurementValue: '4' });
  });
});

describe('L1: long, with the user\'s occurrenceID', () => {
  it('the occurrenceIDs are the user\'s, the events are the samples (no cruise or station), and the DwC depth columns are the range', async () => {
    const e = await exportSheet(L1_HEADER, L1_ROWS, { quantity: { kind: 'count' } });
    expect(judge(e.findings).blocking).toEqual([]);
    const b = await readBack(e.zip);
    expectSoundArchive(b);
    expect(objects(b.tables['occurrence.txt']).map((o) => [o.occurrenceID, o.eventID, o.scientificName, o.individualCount])).toEqual([
      ['occ-001', 'E1', 'Calanus finmarchicus', '5'],
      ['occ-002', 'E1', 'Oithona similis', '11'],
      ['occ-003', 'E2', 'Calanus finmarchicus', '2'],
    ]);
    const ev = objects(b.tables['event.txt']);
    expect(ev.map((x) => [x.eventID, x.eventType, x.parentEventID])).toEqual([['E1', 'sample', ''], ['E2', 'sample', '']]);
    expect(ev[0]).toMatchObject({ decimalLatitude: '54.1', decimalLongitude: '7.9', minimumDepthInMeters: '0', maximumDepthInMeters: '10' });
    // no effort declared: no sample size columns and no volume measurement
    expect(b.tables['event.txt'].header).not.toContain('sampleSizeValue');
  });
});

describe('L2: long without an occurrenceID, with a life stage column', () => {
  it('the occurrenceID is built from the sample code, the taxon and the stage; the stage is its own column', async () => {
    const e = await exportSheet(L2_HEADER, L2_ROWS, { quantity: { kind: 'count' }, edit: { Stage: { kind: 'lifeStage' } } });
    expect(judge(e.findings).blocking).toEqual([]);
    const b = await readBack(e.zip);
    expectSoundArchive(b);
    const occ = objects(b.tables['occurrence.txt']);
    expect(occ.map((o) => [o.occurrenceID, o.lifeStage, o.individualCount])).toEqual([
      ['A1:Calanus finmarchicus:C2', 'C2', '4'],
      ['A1:Calanus finmarchicus:C3', 'C3', '6'],
      ['A1:Oithona similis', '', '9'],
      ['B1:Calanus finmarchicus:C2', 'C2', '1'],
    ]);
    const ev = objects(b.tables['event.txt']);
    expect(ev.filter((x) => x.eventType === 'sample').map((x) => x.eventID)).toEqual(['A1', 'B1']);
    // a sample with three rows is one event
    expect(ev.filter((x) => x.eventID === 'A1')).toHaveLength(1);
  });
});

describe('sex, text cells and decimal commas', () => {
  it('a sex marker after the stage becomes the sex column (female / male); a text cell is a presence record with the text in occurrenceRemarks and no measurement', async () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus C5 f', 'Calanus finmarchicus C5 m', 'Oithona similis'];
    const e = await exportSheet(header, [['A1', 55.5, 2.5, '2023-06-14', 3, 2, '+']], { quantity: { kind: 'count' } });
    const occ = objects((await readBack(e.zip)).tables['occurrence.txt']);
    expect(occ.find((o) => o.verbatimIdentification.endsWith(' f'))).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C5', sex: 'female' });
    expect(occ.find((o) => o.verbatimIdentification.endsWith(' m'))).toMatchObject({ sex: 'male' });
    expect(occ.find((o) => o.scientificName === 'Oithona similis')).toMatchObject({ occurrenceStatus: 'present', occurrenceRemarks: '+', individualCount: '', organismQuantity: '' });
    expect(e.findings.find((f) => f.ruleId === 'CONV-TEXT-IN-TAXON-CELL')?.severity).toBe('warning');
    const emof = objects((await readBack(e.zip)).tables['extendedmeasurementorfact.txt']);
    expect(emof.some((m) => m.occurrenceID === 'A1:Oithona similis')).toBe(false);
  });

  it('numbers are written from the source text with the decimal point: "55,50" is 55.50, a depth "0,50" is 0.50, a density "12,50" is 12.50, the sample size "12,30" is 12.30', async () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Depth top [m]', 'Depth bottom [m]', 'Volume filtered [m3]', 'Calanus finmarchicus', 'Oithona similis'];
    const rows: Cell[][] = [['A1', '55,50', '2,250', '2023-06-14', '0,50', '10,00', '12,30', '12,50', '0,10']];
    const e = await exportSheet(header, rows, { quantity: { kind: 'density', unit: '#/m3', effort: { source: 'column' } }, decimalComma: true });
    expect(judge(e.findings).blocking).toEqual([]);
    const b = await readBack(e.zip);
    const sample = objects(b.tables['event.txt']).find((x) => x.eventID === 'A1')!;
    expect(sample).toMatchObject({ decimalLatitude: '55.50', decimalLongitude: '2.250', minimumDepthInMeters: '0.50', maximumDepthInMeters: '10.00', sampleSizeValue: '12.30' });
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    expect(emof.filter((m) => m.occurrenceID !== '').map((m) => m.measurementValue)).toEqual(['12.50', '0.10']);
    expect(emof.find((m) => m.occurrenceID === '')?.measurementValue).toBe('12.30');
    expect(Object.values(b.text).join('\n')).not.toMatch(/\d,\d/);
  });

  it('nothing is rescaled: a unit the user typed (L, ind/L) is written as typed, and an effort in litres is not turned into m3', async () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'];
    const e = await exportSheet(header, [['A1', 55.5, 2.5, '2023-06-14', 3]], { quantity: { kind: 'density', unit: 'ind/L', per: 'volume', effort: { source: 'constant', value: '50', unit: 'L' } } });
    const b = await readBack(e.zip);
    expect(objects(b.tables['event.txt']).find((x) => x.eventID === 'A1')).toMatchObject({ sampleSizeValue: '50', sampleSizeUnit: 'L' });
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    expect(emof.map((m) => [m.measurementValue, m.measurementUnit, m.measurementUnitID])).toEqual([['50', 'L', ''], ['3', 'ind/L', '']]);
  });
});

describe('the archive is deterministic and its names are safe', () => {
  it('the same input gives the same bytes, and the files are the ones meta.xml names', async () => {
    const a = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true });
    const b = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true });
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
    expect(a.files.map((f) => f.name)).toEqual(['meta.xml', 'eml.xml', 'event.txt', 'occurrence.txt', 'extendedmeasurementorfact.txt']);
  });

  it('the file name is the dataset name as a slug; the dataset name defaults to the title', () => {
    expect(slugOf('Calanus of the Bay, 2023 (invented)')).toBe('calanus-of-the-bay-2023-invented');
    expect(slugOf('Zooplankton Łódź – ZOO/2023')).toBe('zooplankton-odz-zoo-2023');
    expect(slugOf('   ')).toBe('dwca');
    expect(slugOf('a'.repeat(100)).length).toBe(60);
  });

  it('the tables carry no empty optional column and always the ones BioCheck needs', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Abra alba'], [['A1', 55.5, 2.5, '2023-06-14', 4]], { quantity: { kind: 'count' } });
    const t = buildTables(e.dataset);
    expect(t.event.columns.map((c) => c.header)).toEqual(['eventID', 'parentEventID', 'eventType', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'geodeticDatum', 'datasetName', 'institutionCode']);
    expect(archiveFiles(e.dataset, e.eml).map((f) => f.name)).toContain('extendedmeasurementorfact.txt');
  });

  it('a tab or a line break inside a value is refused by the writer, never replaced', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Abra alba'], [['A1', 55.5, 2.5, '2023-06-14', 4]], { quantity: { kind: 'count' } });
    const bad = { ...e.dataset, events: e.dataset.events.map((x) => ({ ...x, locality: 'a\tb' })) };
    expect(() => archiveFiles(bad, e.eml)).toThrow(/tab or a line break/);
  });
});

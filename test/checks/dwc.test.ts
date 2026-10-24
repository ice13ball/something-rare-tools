// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Darwin Core structure, vocabularies, identifiers, invisible characters, rows without a position and the depth bounds of
// Darwin Core input, end to end (text -> parse -> dataset -> checks). Invented stations, names and values only.
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { buildDatasets } from '../../src/core/dataset';
import { parseDwca } from '../../src/core/parse';
import { dwcTableOf } from '../../src/core/checks/dwc';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { Finding, MetadataRecord, ParsedFile } from '../../src/core/types';
import { makeZip, metaXml, nodeInflate } from '../helpers/zipfile';
import { textFile, xlsxFile } from '../helpers/files';

const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);
const BOM = String.fromCharCode(0xfeff);

const check = (file: ParsedFile, today = '2026-10-24', metadata: MetadataRecord[] = []): Finding[] => {
  const layout = proposeLayout(file);
  const built = buildDatasets(file, layout, proposeMappings(file, layout), metadata, 'ds');
  return runChecks({ datasets: built.datasets, records: [], parseFindings: [...file.findings, ...built.findings] }, { today }).findings;
};
const run = (name: string, text: string, today?: string): Finding[] => check(textFile(name, text), today);
const only = (fs: Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);
const ids = (fs: Finding[]): string[] => [...new Set(fs.map((f) => f.ruleId))];
const DWC_IDS = (fs: Finding[]): string[] => ids(fs).filter((i) => i.startsWith('DWC-'));

/** An Occurrence-core Darwin Core table: all required terms present and filled. */
const OCC_HEADER = 'occurrenceID,eventDate,decimalLatitude,decimalLongitude,scientificName,scientificNameID,occurrenceStatus,basisOfRecord,minimumDepthInMeters,maximumDepthInMeters';
const occ = (id: string, over: Partial<Record<string, string>> = {}): string => {
  const v = { occurrenceID: id, eventDate: '2020-05-01', decimalLatitude: '60.5', decimalLongitude: '5.25', scientificName: 'Abra alba', scientificNameID: 'urn:lsid:marinespecies.org:taxname:141433', occurrenceStatus: 'present', basisOfRecord: 'HumanObservation', minimumDepthInMeters: '1', maximumDepthInMeters: '5', ...over };
  return [v.occurrenceID, v.eventDate, v.decimalLatitude, v.decimalLongitude, v.scientificName, v.scientificNameID, v.occurrenceStatus, v.basisOfRecord, v.minimumDepthInMeters, v.maximumDepthInMeters].join(',');
};
const table = (...rows: string[]): string => [OCC_HEADER, ...rows].join('\n') + '\n';

describe('what is Darwin Core input', () => {
  it('a clean Occurrence table gives no Darwin Core finding at all', () => {
    expect(DWC_IDS(run('occ.csv', table(occ('o1'), occ('o2'), occ('o3'))))).toEqual([]);
  });

  it('a CTD sheet with columns literally named depth, date, station is not Darwin Core, however many such words it has', () => {
    const f = run('ctd.csv', 'station,date,latitude,longitude,depth,temperature,salinity,eventid,year\nS1,2020-05-01,60.5,5.25,10,7.1,34.2,e1,2020\nS2,2020-05-02,60.6,5.26,20,6.9,34.4,e2,2020\n');
    expect(DWC_IDS(f)).toEqual([]);
    expect(ids(f)).not.toContain('ROW-INVISIBLE-CHAR');
  });

  it('two Darwin Core terms are not enough, three are, and a table with no record-kind term (a measurement sheet in Darwin Core dress) is not', () => {
    const file = (header: string[]) => textFile('x.csv', `${header.join(',')}\n${header.map(() => '1').join(',')}\n`);
    expect(dwcTableOf(file(['eventDate', 'decimalLatitude', 'temperature']), file(['eventDate', 'decimalLatitude', 'temperature']).sheets[0])).toBeUndefined();
    const three = file(['eventDate', 'decimalLatitude', 'decimalLongitude']);
    expect(dwcTableOf(three, three.sheets[0])).toBeUndefined(); // three terms, none says "occurrence or event"
    const withKind = file(['occurrenceID', 'eventDate', 'decimalLatitude']);
    expect(dwcTableOf(withKind, withKind.sheets[0])).toEqual({ core: 'Occurrence', archive: false });
    const event = file(['eventID', 'parentEventID', 'eventDate']);
    expect(dwcTableOf(event, event.sheets[0])).toEqual({ core: 'Event', archive: false });
  });

  it('the same data as a plain sheet gives nothing, the Darwin Core header gives the findings', () => {
    const body = 'o1,,60.5,5.25,,,,,,\no2,,60.6,5.26,,,,,,\n';
    const dwc = run('dwc.csv', `${OCC_HEADER}\n${body}`);
    expect(DWC_IDS(dwc)).toContain('DWC-TERM-EMPTY');
    const plain = run('plain.csv', `id,date,latitude,longitude,species,species_id,status,basis,depth_min,depth_max\n${body}`);
    expect(DWC_IDS(plain)).toEqual([]);
    expect(ids(plain)).not.toContain('ROW-INVISIBLE-CHAR');
  });

  it('a Darwin Core Archive is Darwin Core input whatever its header names', async () => {
    const zip = makeZip([
      { name: 'meta.xml', data: metaXml({ fields: { 1: 'locality', 2: 'decimalLatitude' } }) },
      { name: 'occurrence.txt', data: 'id\tlocality\tdecimalLatitude\n1\tBay\t60.5\n' },
    ]);
    const f = await parseDwca('a.zip', zip, nodeInflate);
    expect(f.dwca).toEqual({ core: 'Occurrence', partial: false });
    expect(DWC_IDS(check(f))).toContain('DWC-TERM-MISSING');
  });
});

describe('Darwin Core detection is case-sensitive; event-side tables; flattened sheets; workbooks', () => {
  it('a plain biology export with ScientificName, Kingdom, LifeStage, Count in other spelling is not Darwin Core; the exact spelling is', () => {
    const plain = run('bio.csv', 'Station,Date,Latitude,Longitude,Depth,ScientificName,Kingdom,LifeStage,Count\nS1,2020-05-01,60.5,5.25,10,Abra alba,Animalia,adult,3\nS2,2020-05-02,60.6,5.26,20,Mya arenaria,Animalia,adult,1\n');
    expect(DWC_IDS(plain)).toEqual([]);
    const lower = run('bio.csv', 'station,date,latitude,longitude,depth,scientificname,kingdom,lifestage,count\nS1,2020-05-01,60.5,5.25,10,Abra alba,Animalia,adult,3\nS2,2020-05-02,60.6,5.26,20,Mya arenaria,Animalia,adult,1\n');
    expect(DWC_IDS(lower)).toEqual([]);
    const exact = run('bio.csv', 'station,eventDate,decimalLatitude,decimalLongitude,depth,scientificName,kingdom,lifeStage,count\nS1,2020-05-01,60.5,5.25,10,Abra alba,Animalia,adult,3\nS2,2020-05-02,60.6,5.26,20,Mya arenaria,Animalia,adult,1\n');
    expect(DWC_IDS(exact)).toContain('DWC-TERM-MISSING');
  });

  it('an occurrence table that carries eventIDs is not told to add eventDate or a position (they live in the event table); without eventIDs it is', () => {
    const occ2 = (idCol: string, rows: string[]) => `${['occurrenceID', idCol, 'scientificName', 'occurrenceStatus', 'basisOfRecord'].filter(Boolean).join(',')}\n${rows.join('\n')}\n`;
    const withEvent = run('occurrence.csv', occ2('eventID', ['o1,e1,Abra alba,present,HumanObservation', 'o2,e1,Mya arenaria,present,HumanObservation']));
    expect(only(withEvent, 'DWC-TERM-MISSING')).toEqual([]);
    expect(only(withEvent, 'DWC-RECOMMENDED').map((x) => x.params.terms)).toEqual(['scientificNameID']);
    const without = run('occurrence.csv', occ2('', ['o1,Abra alba,present,HumanObservation', 'o2,Mya arenaria,present,HumanObservation']));
    expect(only(without, 'DWC-TERM-MISSING')[0].params.terms).toBe('eventDate, decimalLatitude, decimalLongitude');
  });

  const EV = 'eventID,eventDate,decimalLatitude,decimalLongitude,parentEventID,temperature';
  it('a flattened sheet repeats its eventID per depth level: no error; one eventID used for different events is one', () => {
    const flat = run('flat.csv', [EV, 'e1,2020-05-01,60.5,5.25,,7.1', 'e1,2020-05-01,60.5,5.25,,6.9', 'e2,2020-05-02,60.6,5.26,,7.0'].join('\n') + '\n');
    expect(only(flat, 'DWC-EVENTID-DUPLICATE')).toEqual([]);
    const clash = only(run('flat.csv', [EV, 'e1,2020-05-01,60.5,5.25,,7.1', 'e1,2020-05-09,60.5,5.25,,6.9', 'e1,2020-05-01,61.5,5.25,,6.8', 'e2,2020-05-02,60.6,5.26,,7.0'].join('\n') + '\n'), 'DWC-EVENTID-DUPLICATE');
    expect(clash).toHaveLength(1);
    expect(clash[0]).toMatchObject({ lines: [2, 3, 4], value: 'e1', params: { count: 1 } });
  });

  it('the disagreement is judged on values: 60.5 and 60.50, and one date written two ways, agree', () => {
    const same = run('flat.csv', [EV, 'e1,2020-05-01,60.5,5.25,,7.1', 'e1,2020-05-01,60.50,5.250,,6.9', 'e1,01.05.2020,60.5,5.25,,6.8'].join('\n') + '\n');
    expect(only(same, 'DWC-EVENTID-DUPLICATE')).toEqual([]);
    const diff = run('flat.csv', [EV, 'e1,2020-05-01,60.5,5.25,,7.1', 'e1,2020-05-01,60.51,5.25,,6.9'].join('\n') + '\n');
    expect(only(diff, 'DWC-EVENTID-DUPLICATE')).toHaveLength(1);
  });

  it('inside a Darwin Core Archive Event core a repeated eventID stays strict, even when the rows agree', async () => {
    const meta = metaXml({ rowType: 'http://rs.tdwg.org/dwc/terms/Event', location: 'event.txt', fields: { 0: 'eventID', 1: 'eventDate', 2: 'decimalLatitude', 3: 'decimalLongitude' } });
    const data = ['eventID\teventDate\tdecimalLatitude\tdecimalLongitude', 'a\t2020-05-01\t60.5\t5.25', 'a\t2020-05-01\t60.5\t5.25', 'b\t2020-05-02\t60.6\t5.26'].join('\n') + '\n';
    const f = check(await parseDwca('e.zip', makeZip([{ name: 'meta.xml', data: meta }, { name: 'event.txt', data }]), nodeInflate));
    expect(only(f, 'DWC-EVENTID-DUPLICATE').map((x) => x.lines)).toEqual([[2, 3]]);
  });

  it('a three-sheet OBIS workbook (event, occurrence, emof): every sheet is judged, not only the one built as data', () => {
    const file = xlsxFile('obis.xlsx', {
      event: [['eventID', 'parentEventID', 'eventDate', 'decimalLatitude', 'decimalLongitude'], ['e1', null, '2020-05-01', 60.5, 5.25], ['e1', null, '2020-05-02', 60.6, 5.26], ['e2', 'zz', '2020-05-03', 60.7, 5.27]],
      occurrence: [['occurrenceID', 'eventID', 'scientificName', 'occurrenceStatus', 'basisOfRecord'], ['o1', 'e1', 'Abra alba', 'present', 'Seen'], ['o1', 'e1', 'Mya arenaria', 'present', 'HumanObservation']],
      emof: [['eventID', 'measurementType', 'measurementValue', 'measurementUnit'], ['e1', 'temperature', 7.1, 'C'], ['e2', 'temperature', 7.2, 'C']],
    });
    const f = check(file);
    const bySheet = (id: string) => only(f, id).map((x) => x.sheet);
    expect(bySheet('DWC-EVENTID-DUPLICATE')).toEqual(['event']);
    expect(bySheet('DWC-PARENT-DANGLING')).toEqual(['event']);
    expect(bySheet('DWC-OCCURRENCEID-DUPLICATE')).toEqual(['occurrence']);
    expect(bySheet('DWC-VOCAB-VALUE')).toEqual(['occurrence']);
    expect(ids(f).filter((i) => i === 'DWC-TERM-MISSING')).toEqual([]);
  });
});

describe('DWC-TERM-MISSING, DWC-TERM-EMPTY, DWC-RECOMMENDED', () => {
  it('names every required term that has no column; scientificNameID and the depths are only recommended', () => {
    const f = run('occ.csv', 'occurrenceID,eventDate,decimalLatitude,decimalLongitude,scientificName\no1,2020-05-01,60.5,5.25,Abra alba\n');
    const miss = only(f, 'DWC-TERM-MISSING');
    expect(miss).toHaveLength(1);
    expect(miss[0]).toMatchObject({ severity: 'error', params: { core: 'Occurrence', terms: 'occurrenceStatus, basisOfRecord' } });
    const rec = only(f, 'DWC-RECOMMENDED');
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ severity: 'warning', params: { terms: 'scientificNameID, minimumDepthInMeters, maximumDepthInMeters' } });
  });

  it('an Event core needs eventID, eventDate and the position, not the taxon terms', () => {
    const f = run('event.csv', 'eventID,parentEventID,eventDate,decimalLatitude,decimalLongitude\ne1,,2020-05-01,60.5,5.25\n');
    expect(only(f, 'DWC-TERM-MISSING')).toEqual([]);
    expect(only(f, 'DWC-RECOMMENDED')[0].params).toMatchObject({ core: 'Event', terms: 'minimumDepthInMeters, maximumDepthInMeters' });
    const noDate = run('event.csv', 'eventID,parentEventID,decimalLatitude,decimalLongitude\ne1,,60.5,5.25\n');
    expect(only(noDate, 'DWC-TERM-MISSING')[0].params).toMatchObject({ core: 'Event', terms: 'eventDate' });
  });

  it('reports an empty cell of a required column once per column with its lines; a recommended column is judged only when empty in every row', () => {
    const f = run('occ.csv', table(occ('o1'), occ('o2', { scientificName: '', basisOfRecord: '' }), occ('o3', { scientificName: '  ', minimumDepthInMeters: '' })));
    const empty = only(f, 'DWC-TERM-EMPTY');
    expect(empty.map((x) => [x.field, x.lines, x.params.count]).sort()).toEqual([['basisOfRecord', [3], 1], ['scientificName', [3, 4], 2]]);
    expect(only(f, 'DWC-RECOMMENDED')).toEqual([]);
    const all = run('occ.csv', table(occ('o1', { scientificNameID: '' }), occ('o2', { scientificNameID: '' })));
    expect(only(all, 'DWC-RECOMMENDED')[0].params.terms).toBe('scientificNameID');
  });

  it('a blank position or date is left to ROW-NO-COORD and ROW-DATE-MISSING; a column empty in every row is reported by the term rule', () => {
    const some = run('occ.csv', table(occ('o1'), occ('o2', { decimalLatitude: '', eventDate: '' })));
    expect(only(some, 'DWC-TERM-EMPTY')).toEqual([]);
    expect(only(some, 'ROW-NO-COORD')).toHaveLength(1);
    expect(only(some, 'ROW-DATE-MISSING')).toHaveLength(1);
    const none = run('occ.csv', table(occ('o1', { decimalLatitude: '' }), occ('o2', { decimalLatitude: '' })));
    expect(only(none, 'DWC-TERM-EMPTY').map((x) => x.field)).toEqual(['decimalLatitude']);
    expect(only(none, 'ROW-NO-COORD')).toEqual([]);
  });

  it('an eventDate column empty in every row is reported here, unless META-NO-DATES already says that no date exists anywhere', () => {
    const empty = textFile('occ.csv', table(occ('o1', { eventDate: '' }), occ('o2', { eventDate: '' })));
    const bare = check(empty);
    expect(only(bare, 'DWC-TERM-EMPTY')).toEqual([]);
    expect(only(bare, 'META-NO-DATES')).toHaveLength(1);
    const meta: MetadataRecord = { source: 'iso19139', label: 'rec', licences: [], restrictionCodes: [], distributionLinks: [], temporalExtent: { start: '2019-01-01', end: '2019-12-31' } };
    const withExtent = check(empty, '2026-10-24', [meta]);
    expect(only(withExtent, 'META-NO-DATES')).toEqual([]);
    expect(only(withExtent, 'DWC-TERM-EMPTY').map((x) => x.field)).toEqual(['eventDate']);
  });

  it('a Darwin Core Archive core id column stands for the record identifier', async () => {
    const meta = metaXml({ fields: { 1: 'eventDate', 2: 'decimalLatitude', 3: 'decimalLongitude', 4: 'scientificName', 5: 'occurrenceStatus', 6: 'basisOfRecord' } });
    const zip = makeZip([{ name: 'meta.xml', data: meta }, { name: 'occurrence.txt', data: 'id\tx\n1\t2020-05-01\t60.5\t5.25\tAbra alba\tpresent\tHumanObservation\n2\t2020-05-02\t60.6\t5.26\tAbra alba\tpresent\tHumanObservation\n' }]);
    const f = check(await parseDwca('a.zip', zip, nodeInflate));
    expect(only(f, 'DWC-TERM-MISSING')).toEqual([]);
  });
});

describe('DWC-VOCAB-VALUE', () => {
  it('accepts every value of both lists in any case, and the case variants of obis-qc (lower-cased comparison)', () => {
    const basis = ['PreservedSpecimen', 'FossilSpecimen', 'LivingSpecimen', 'HumanObservation', 'MachineObservation', 'MaterialSample', 'Occurrence', 'MaterialCitation', 'humanobservation', 'HUMANOBSERVATION'];
    const status = ['absent', 'present', 'notDetected', 'detected', 'Present', 'NOTDETECTED', ' detected '];
    const rows = basis.map((b, i) => occ(`o${i}`, { basisOfRecord: b, occurrenceStatus: status[i % status.length] }));
    expect(only(run('occ.csv', table(...rows)), 'DWC-VOCAB-VALUE')).toEqual([]);
  });

  it('reports each bad value once, with all its rows', () => {
    const f = only(run('occ.csv', table(occ('o1', { basisOfRecord: 'Observation' }), occ('o2', { basisOfRecord: 'Human observation', occurrenceStatus: 'seen' }), occ('o3', { basisOfRecord: 'Observation' }), occ('o4'))), 'DWC-VOCAB-VALUE');
    expect(f.map((x) => [x.field, x.value, x.lines]).sort()).toEqual([
      ['basisOfRecord', 'Human observation', [3]],
      ['basisOfRecord', 'Observation', [2, 4]],
      ['occurrenceStatus', 'seen', [3]],
    ]);
    expect(f[0].severity).toBe('warning');
    expect(f.find((x) => x.field === 'occurrenceStatus')!.params.allowed).toBe('absent, present, notDetected, detected');
  });

  it('the many-values case is bounded: ten findings and one for the rest', () => {
    const rows = Array.from({ length: 25 }, (_, i) => occ(`o${i}`, { basisOfRecord: `Bad${i}` }));
    const f = only(run('occ.csv', table(...rows)), 'DWC-VOCAB-VALUE');
    expect(f).toHaveLength(11);
    expect(f[f.length - 1].value).toBe('…+15');
    expect(f[f.length - 1].lines).toHaveLength(15);
  });

  it('is not run on a sheet that is not Darwin Core', () => {
    expect(ids(run('x.csv', 'station,basisOfRecord,temperature\nS1,anything,7.1\nS2,else,7.2\n'))).not.toContain('DWC-VOCAB-VALUE');
  });
});

describe('eventID, parentEventID, occurrenceID', () => {
  const EVENT = 'eventID,parentEventID,eventDate,decimalLatitude,decimalLongitude,minimumDepthInMeters,maximumDepthInMeters';
  const ev = (...rows: string[]): string => [EVENT, ...rows].join('\n') + '\n';

  it('a well-formed hierarchy gives nothing', () => {
    const f = run('event.csv', ev('cruise,,2020-05-01/2020-05-09,,,,', 'st1,cruise,2020-05-01,60.5,5.25,1,5', 'st2,cruise,2020-05-02,60.6,5.26,1,5', 's1,st1,2020-05-01,60.5,5.25,1,5'));
    expect(DWC_IDS(f)).toEqual([]);
  });

  it('flags a repeated eventID with every row that has it, in an Event core only', () => {
    const f = only(run('event.csv', ev('a,,2020-05-01,60.5,5.25,1,5', 'b,,2020-05-02,60.6,5.26,1,5', 'a,,2020-05-03,60.7,5.27,1,5')), 'DWC-EVENTID-DUPLICATE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: [2, 4], value: 'a', params: { count: 1 } });
    // an Occurrence table repeats its eventID by design
    const occRows = 'occurrenceID,eventID,eventDate,decimalLatitude,decimalLongitude,scientificName,occurrenceStatus,basisOfRecord\no1,e1,2020-05-01,60.5,5.25,Abra alba,present,HumanObservation\no2,e1,2020-05-01,60.5,5.25,Mya arenaria,present,HumanObservation\n';
    expect(only(run('occ.csv', occRows), 'DWC-EVENTID-DUPLICATE')).toEqual([]);
  });

  it('flags a parentEventID with no eventID, with its rows', () => {
    const f = only(run('event.csv', ev('a,,2020-05-01,60.5,5.25,1,5', 'b,zz,2020-05-02,60.6,5.26,1,5', 'c,zz,2020-05-02,60.6,5.26,1,5', 'd,yy,2020-05-02,60.6,5.26,1,5')), 'DWC-PARENT-DANGLING');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: [3, 4, 5], value: 'zz', params: { count: 2 } });
  });

  it('flags a loop, a self-parent and a longer loop; descendants of a loop are not on it', () => {
    const f = only(run('event.csv', ev('a,b,2020-05-01,60.5,5.25,1,5', 'b,c,2020-05-01,60.5,5.25,1,5', 'c,a,2020-05-01,60.5,5.25,1,5', 'x,x,2020-05-01,60.5,5.25,1,5', 'd,c,2020-05-01,60.5,5.25,1,5', 'ok,,2020-05-01,60.5,5.25,1,5')), 'DWC-PARENT-LOOP');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: [2, 3, 4, 5], params: { count: 4 } });
  });

  it('flags a repeated occurrenceID in an Occurrence table, not an eventID repeat', () => {
    const f = only(run('occ.csv', table(occ('o1'), occ('o2'), occ('o1'), occ('o2'), occ('o3'))), 'DWC-OCCURRENCEID-DUPLICATE');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: [2, 3, 4, 5], params: { count: 2 } });
  });

  it('a parent that may be in the rows a capped archive did not read is not called missing', async () => {
    const meta = metaXml({ rowType: 'http://rs.tdwg.org/dwc/terms/Event', location: 'event.txt', fields: { 0: 'eventID', 1: 'parentEventID', 2: 'eventDate', 3: 'decimalLatitude', 4: 'decimalLongitude' } });
    const data = ['eventID\tparentEventID\teventDate\tdecimalLatitude\tdecimalLongitude', 'a\t\t2020-05-01\t60.5\t5.25', 'b\ta\t2020-05-02\t60.6\t5.26', 'c\tb\t2020-05-03\t60.7\t5.27'].join('\n') + '\n';
    const zip = makeZip([{ name: 'meta.xml', data: meta }, { name: 'event.txt', data }]);
    const part = await parseDwca('e.zip', zip, nodeInflate, { maxRows: 2 });
    expect(part.dwca).toEqual({ core: 'Event', partial: true });
    expect(DWC_IDS(check(part))).not.toContain('DWC-PARENT-DANGLING');
    const whole = await parseDwca('e.zip', zip, nodeInflate);
    expect(whole.dwca).toEqual({ core: 'Event', partial: false });
    expect(DWC_IDS(check(whole))).not.toContain('DWC-PARENT-DANGLING');
  });

  it('200 000 events: a long chain, a wide fan and a loop are found in linear time', () => {
    const n = 200_000;
    const lines: string[] = [EVENT];
    for (let i = 0; i < n; i++) lines.push(`e${i},${i === 0 ? 'e' + (n - 1) : 'e' + (i - 1)},2020-05-01,60.5,5.25,1,5`); // one loop through the whole chain
    const t0 = performance.now();
    const f = run('event.csv', lines.join('\n') + '\n');
    const ms = performance.now() - t0;
    expect(only(f, 'DWC-PARENT-LOOP')[0].params.count).toBe(n);
    expect(ms).toBeLessThan(15_000);
  }, 120_000);
});

describe('size', () => {
  it('200 000 Occurrence rows with repeated identifiers and a name with a hidden character are checked in one pass', () => {
    const n = 200_000;
    const rows: string[] = [OCC_HEADER];
    for (let i = 0; i < n; i++) rows.push(occ(`o${i % (n / 2)}`, i % 1000 === 0 ? { scientificName: `Abra${NBSP}alba` } : {}));
    const t0 = performance.now();
    const f = run('occ.csv', rows.join('\n') + '\n');
    const ms = performance.now() - t0;
    expect(only(f, 'DWC-OCCURRENCEID-DUPLICATE')[0].params.count).toBe(n / 2);
    expect(only(f, 'ROW-INVISIBLE-CHAR')[0].lines).toHaveLength(200);
    expect(ms).toBeLessThan(20_000);
  }, 120_000);
});

describe('ROW-INVISIBLE-CHAR', () => {
  it('finds a no-break space and a zero-width space inside a name, shows them, and counts the rows', () => {
    const f = only(run('occ.csv', table(occ('o1', { scientificName: `Abra${NBSP}alba` }), occ('o2'), occ('o3', { scientificName: `Mya${ZWSP} arenaria` }))), 'ROW-INVISIBLE-CHAR');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', field: 'scientificName', lines: [2, 4], value: 'Abra⟨U+00A0⟩alba' });
    expect(f[0].params.chars).toBe('U+00A0 no-break space, U+200B zero-width space');
  });

  it('is silent for the ends of a value (OBIS trims them) and for ordinary spaces', () => {
    const f = run('occ.csv', table(occ('o1', { scientificName: `${NBSP}Abra alba${NBSP}` }), occ('o2', { scientificName: 'Mya   arenaria' })));
    expect(only(f, 'ROW-INVISIBLE-CHAR')).toEqual([]);
  });

  it('does not flag a byte-order mark at the start of the file: the parser removes it', () => {
    const f = run('occ.csv', BOM + table(occ('o1'), occ('o2')));
    expect(only(f, 'ROW-INVISIBLE-CHAR')).toEqual([]);
    expect(DWC_IDS(f)).toEqual([]);
  });

  it('checks a station column on a plain sheet too, but no other column of it', () => {
    const f = only(run('s.csv', `station,date,latitude,longitude,comment\nST${NBSP}1,2020-05-01,60.5,5.25,a${NBSP}b\nST1,2020-05-02,60.5,5.25,c\n`), 'ROW-INVISIBLE-CHAR');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'station', lines: [2] });
  });

  it('names and identifiers of a Darwin Core table are checked, free text is not', () => {
    const f = run('occ.csv', 'occurrenceID,eventDate,decimalLatitude,decimalLongitude,scientificName,occurrenceStatus,basisOfRecord,eventRemarks,locationID\n' + `o${NBSP}1,2020-05-01,60.5,5.25,Abra alba,present,HumanObservation,a${NBSP}b,L${ZWSP}1\n`);
    expect(only(f, 'ROW-INVISIBLE-CHAR').map((x) => x.field).sort()).toEqual(['locationID', 'occurrenceID']);
  });
});

describe('ROW-NO-COORD', () => {
  const sheet = (...rows: string[]): string => ['station,date,latitude,longitude,temperature', ...rows].join('\n') + '\n';

  it('flags a row with a blank latitude or longitude when other rows have a position, with lines and count', () => {
    const f = only(run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,2020-05-02,,5.25,7.2', 'S3,2020-05-03,60.5,,7.3', 'S4,2020-05-04,,,7.4')), 'ROW-NO-COORD');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', lines: [3, 4, 5], params: { count: 3 } });
  });

  it('a line that holds only a label (an event name or heading, one filled cell) is not a record without a position; two filled cells are', () => {
    const f = only(run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'Chesapeake Bay to Middle Atlantic,,,,', 'S2,,,,7.2', 'S3,2020-05-03,60.7,5.27,7.3')), 'ROW-NO-COORD');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4]);
  });

  const blocks = (...rows: string[]): string => ['Station,Date,Latitude,Longitude,Depth,Temperature,Salinity', ...rows].join('\n') + '\n';

  it('a position written once per station block, continuation rows blank in station, date and position, is not missing positions', () => {
    const f = run('blocks.csv', blocks('S1,2020-05-01,60.5,5.25,5,7.1,34.2', ',,,,10,6.9,34.3', ',,,,20,6.5,34.4', 'S2,2020-05-02,60.6,5.26,5,7.0,34.1', ',,,,10,6.8,34.2'));
    expect(only(f, 'ROW-NO-COORD')).toEqual([]);
  });

  it('a position written once per station, the station name repeated on every row, is not missing positions; another station without any is', () => {
    const f = only(run('blocks.csv', blocks('S1,2020-05-01,60.5,5.25,5,7.1,34.2', 'S1,2020-05-01,,,10,6.9,34.3', 'S1,2020-05-01,,,20,6.5,34.4', 'S2,2020-05-02,60.6,5.26,5,7.0,34.1', 'S3,2020-05-03,,,5,7.0,34.1')), 'ROW-NO-COORD');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([6]);
  });

  it('a timestamp on every row does not make a continuation row a missing position; a whole block without a position is still reported', () => {
    const ok = run('ctd.csv', blocks('K1,2020-05-01T10:00,76.5,15.2,5,7.1,34.2', ',2020-05-01T10:00,,,10,6.9,34.3', ',2020-05-01T10:01,,,20,6.5,34.4', 'K2,2020-05-02T08:00,76.6,15.3,5,7.0,34.1', ',2020-05-02T08:01,,,10,6.8,34.2'));
    expect(only(ok, 'ROW-NO-COORD')).toEqual([]);
    const lost = only(run('ctd.csv', blocks('K1,2020-05-01T10:00,76.5,15.2,5,7.1,34.2', 'K9,2020-05-02T08:00,,,5,7.0,34.1', 'K9,2020-05-02T08:01,,,10,6.8,34.2')), 'ROW-NO-COORD');
    expect(lost.map((x) => x.lines)).toEqual([[3, 4]]);
  });

  it('with a cruise column the same station name in another cruise does not vouch for a row', () => {
    const f = only(run('c.csv', 'Cruise,Station,Date,Latitude,Longitude,Depth\nA,K1,2020-05-01,76.5,15.2,5\nA,K1,2020-05-01,,,10\nB,K1,2021-06-01,,,5\n'), 'ROW-NO-COORD');
    expect(f.map((x) => x.lines)).toEqual([[4]]);
  });

  it('without a station column the date is the key in the same way', () => {
    const f = run('d.csv', 'Date,Latitude,Longitude,Depth,Temperature\n2020-05-01,60.5,5.25,5,7.1\n2020-05-01,,,10,6.9\n,,,20,6.5\n2020-05-09,,,5,7.0\n');
    expect(only(f, 'ROW-NO-COORD').map((x) => x.lines)).toEqual([[5]]);
  });

  it('a continuation row that does not follow a positioned row of its block is reported (a blank-key row after a stray row), and a half position never is a block', () => {
    const f = only(run('blocks.csv', blocks('S1,2020-05-01,60.5,5.25,5,7.1,34.2', 'S2,2020-05-02,,,5,7.0,34.1', ',,,,10,6.8,34.2', 'S1,2020-05-03,60.5,,5,7.0,34.1')), 'ROW-NO-COORD');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3, 4, 5]);
  });

  it('is not reported when the other coordinate holds an NA variant: ROW-NA-VARIANT says it', () => {
    const f = run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,2020-05-02,,NANA,7.2'));
    expect(only(f, 'ROW-NO-COORD')).toEqual([]);
    expect(only(f, 'ROW-NA-VARIANT').length).toBeGreaterThan(0);
  });

  it('says nothing when no row has a position (a sheet without coordinates)', () => {
    expect(only(run('s.csv', sheet('S1,2020-05-01,,,7.1', 'S2,2020-05-02,,,7.2')), 'ROW-NO-COORD')).toEqual([]);
  });

  it('does not flag blank trailing rows, summary rows or text in a coordinate cell', () => {
    const f = run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,2020-05-02,60.6,5.26,7.2', ',,,,', 'Total,,,,14.3', 'Mean,,,,7.15', 'S5,2020-05-05,n/a,5.25,7.3'));
    expect(only(f, 'ROW-NO-COORD')).toEqual([]);
    expect(only(f, 'ROW-NON-NUMERIC').length + only(f, 'ROW-NA-VARIANT').length).toBeGreaterThan(0); // the text cell is reported by its own rule
  });

  it('in an event hierarchy a parent without a position, and a child that inherits its parent position, are not missing one', () => {
    const f = run('event.csv', ['eventID,parentEventID,eventDate,decimalLatitude,decimalLongitude,minimumDepthInMeters,maximumDepthInMeters', 'cruise,,2020-05-01/2020-05-09,,,,', 'st1,cruise,2020-05-01,60.5,5.25,1,5', 'st2,cruise,2020-05-02,60.6,5.26,1,5', 's1,st1,2020-05-01,,,1,5', 'lost,,2020-05-03,,,1,5'].join('\n') + '\n');
    const nc = only(f, 'ROW-NO-COORD');
    expect(nc).toHaveLength(1);
    expect(nc[0].lines).toEqual([6]); // only the leaf with neither its own position nor an ancestor's
  });

  it('a (0, 0) row is not also a missing position', () => {
    const f = run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,2020-05-02,0,0,7.2'));
    expect(only(f, 'ROW-NO-COORD')).toEqual([]);
  });
});

describe('overlaps of the new rules with the old ones', () => {
  const sheet = (...rows: string[]): string => ['station,date,latitude,longitude,temperature', ...rows].join('\n') + '\n';

  it('(0, 0) is ROW-ZERO-COORD only: not ROW-LAT-EQ-LON, not a station spread, not a ship speed or a bbox point', () => {
    const f = run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S1,2020-05-02,0,0,7.2', 'S1,2020-05-03,60.5,5.25,7.3', 'S2,2020-05-04,12.5,12.5,7.4'));
    expect(only(f, 'ROW-ZERO-COORD').map((x) => x.lines)).toEqual([[3]]);
    expect(only(f, 'ROW-LAT-EQ-LON').map((x) => x.lines)).toEqual([[5]]); // 12.5, 12.5 is still lat = lon
    expect(ids(f)).not.toContain('ROW-STATION-SPREAD');
    expect(ids(f)).not.toContain('ROW-STATION-SPREAD-FAR');
    expect(ids(f)).not.toContain('ROW-STATION-MOVED');
  });

  it('a date far in the future is ROW-DATE-FUTURE only, not also ROW-YEAR-OUTLIER', () => {
    const f = run('cruise_2020.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,2099-05-02,60.6,5.26,7.2', 'S3,2019-05-03,60.7,5.27,7.3'));
    expect(only(f, 'ROW-DATE-FUTURE').map((x) => x.lines)).toEqual([[3]]);
    expect(only(f, 'ROW-YEAR-OUTLIER').map((x) => x.lines)).toEqual([[4]]); // the past year is still outside the declared 2020
  });

  it('an unreadable date is ROW-DATE-UNPARSEABLE only', () => {
    const f = run('s.csv', sheet('S1,2020-05-01,60.5,5.25,7.1', 'S2,someday,60.6,5.26,7.2'));
    expect(ids(f)).toContain('ROW-DATE-UNPARSEABLE');
    expect(ids(f)).not.toContain('ROW-DATE-FUTURE');
  });
});

describe('depth bounds of Darwin Core input', () => {
  it('reads minimum and maximum from their own columns: min > max is reported, with the first pair as the value', () => {
    const f = only(run('occ.csv', table(occ('o1', { minimumDepthInMeters: '10', maximumDepthInMeters: '5' }), occ('o2'), occ('o3', { minimumDepthInMeters: '20', maximumDepthInMeters: '20.5' }), occ('o4', { minimumDepthInMeters: '7', maximumDepthInMeters: '7' }))), 'ROW-DEPTH-MIN-MAX');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', lines: [2], value: '10 > 5' });
  });

  it('a blank bound is not a swap, and a missing maximum column is not either', () => {
    expect(only(run('occ.csv', table(occ('o1', { minimumDepthInMeters: '10', maximumDepthInMeters: '' }))), 'ROW-DEPTH-MIN-MAX')).toEqual([]);
    expect(only(run('occ.csv', 'occurrenceID,eventDate,decimalLatitude,decimalLongitude,scientificName,minimumDepthInMeters\no1,2020-05-01,60.5,5.25,Abra alba,10\n'), 'ROW-DEPTH-MIN-MAX')).toEqual([]);
  });

  it('the bounds of obis-qc: -100000 and 11000 are inside, one step beyond is out, on each column', () => {
    const f = only(run('occ.csv', table(occ('o1', { minimumDepthInMeters: '-100000', maximumDepthInMeters: '11000' }), occ('o2', { minimumDepthInMeters: '-100000.5', maximumDepthInMeters: '11000.5' }), occ('o3', { minimumDepthInMeters: '11500', maximumDepthInMeters: '12000' }))), 'ROW-DEPTH-RANGE');
    expect(f.map((x) => [x.field, x.lines]).sort()).toEqual([['maximumDepthInMeters', [3, 4]], ['minimumDepthInMeters', [3, 4]]]);
    expect(f[0].severity).toBe('warning');
  });

  it('text in the maximum column (not the one the depth slot reads) is still reported as non-numeric', () => {
    const f = only(run('occ.csv', table(occ('o1', { maximumDepthInMeters: 'about 5' }), occ('o2'))), 'ROW-NON-NUMERIC');
    expect(f.map((x) => [x.field, x.lines])).toEqual([['maximumDepthInMeters', [2]]]);
  });
});

describe('the spread of one station beyond 1000 km (a warning)', () => {
  it('ChEssBase-like: one station name at two places far apart is the warning, 10 to 1000 km the note', () => {
    const f = run('s.csv', 'station,date,latitude,longitude\nAxial,2020-05-01,45.9,-130.0\nAxial,2020-05-02,45.9,-129.99\nAxial,2020-05-03,-41.0,-129.56\nBay,2020-05-01,50.0,10.0\nBay,2020-05-02,51.5,10.0\n');
    expect(only(f, 'ROW-STATION-SPREAD-FAR').map((x) => [x.severity, x.value])).toEqual([['warning', 'Axial']]);
    expect(only(f, 'ROW-STATION-SPREAD').map((x) => [x.severity, x.value])).toEqual([['info', 'Bay']]);
  });
});

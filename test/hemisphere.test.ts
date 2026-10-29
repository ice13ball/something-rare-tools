// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Hemisphere letters kept in a column of their own (an unsigned latitude with "N/S" beside it): pairing them, in /check and in the converter.
// Every value and column name below is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/core/dataset';
import { convert } from '../src/core/convert/build';
import { proposeConvertColumns } from '../src/core/convert/recognize';
import { readConvertFile } from '../src/core/convert/read';
import { parseFile } from '../src/core/parse';
import { proposeColumns } from '../src/core/recognize/columns';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import type { ColumnProposal, Finding } from '../src/core/types';
import { hemisphereLetter, pairHemisphere, parseCoordinate } from '../src/core/values/coords';
import { judge } from '../src/core/convert/policy';
import { exportSheet, objects, readBack } from './convert/exportHelpers';
import { rawSheet, textFile } from './helpers/files';

const CTX = { decimalComma: false, date1904: false };

/** The dataset of a CSV text, the roles as /check proposes them. */
function check(csv: string) {
  const file = textFile('sio.csv', csv);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  const { dataset, findings } = buildDataset(file, layout, mappings, [], 'd');
  return { dataset, findings, mappings };
}
/** The same, with the hemisphere roles the user chose (the proposer pairs only unsigned coordinates). */
function checkForced(csv: string, hemi: Record<string, 'latitude' | 'longitude'>) {
  const file = textFile('sio.csv', csv);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  mappings[0].columns = mappings[0].columns.map((c) => (hemi[c.header] ? { ...c, role: { kind: 'hemisphere' as const, axis: hemi[c.header] } } : c));
  return buildDataset(file, layout, mappings, [], 'd');
}
const rule = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const roleOf = (mappings: ReturnType<typeof check>['mappings'], header: string) => mappings[0].columns.find((c) => c.header === header)!.role;

describe('pairHemisphere (one cell)', () => {
  it('S and W negate, N and E keep the value, words and any case are read', () => {
    expect(pairHemisphere(32.7, 'S', 'lat').cell).toBe(-32.7);
    expect(pairHemisphere(32.7, 'N', 'lat').cell).toBe(32.7);
    expect(pairHemisphere(117.3, 'W', 'lon').cell).toBe(-117.3);
    expect(pairHemisphere(117.3, 'E', 'lon').cell).toBe(117.3);
    expect(pairHemisphere('32.7', ' South ', 'lat').cell).toBe('-32.7');
    expect(pairHemisphere('117.3', 'west', 'lon').cell).toBe('-117.3');
    expect(pairHemisphere('117.3', 'EAST', 'lon').cell).toBe('117.3');
    expect(pairHemisphere('32.7', 's.', 'lat').cell).toBe('-32.7');
    expect(pairHemisphere('+32.7', 'S', 'lat').cell).toBe('-32.7');
  });
  it('a value that is negative, a letter of the other axis, or a letter against the value is a conflict and the cell stays as written', () => {
    expect(pairHemisphere(-32.7, 'S', 'lat')).toEqual({ cell: -32.7, issue: 'conflict' });
    expect(pairHemisphere('-32.7', 'N', 'lat')).toEqual({ cell: '-32.7', issue: 'conflict' });
    expect(pairHemisphere('32.7', 'E', 'lat')).toEqual({ cell: '32.7', issue: 'conflict' });
    expect(pairHemisphere('117.3', 'N', 'lon')).toEqual({ cell: '117.3', issue: 'conflict' });
    expect(pairHemisphere('32.7 N', 'S', 'lat').issue).toBe('conflict');
    expect(pairHemisphere('32.7 S', 'S', 'lat')).toEqual({ cell: '32.7 S' }); // the same letter twice: nothing to say
  });
  it('an empty or unknown letter is missing', () => {
    expect(pairHemisphere('32.7', null, 'lat')).toEqual({ cell: '32.7', issue: 'missing' });
    expect(pairHemisphere('32.7', '', 'lat').issue).toBe('missing');
    expect(pairHemisphere('32.7', 'x', 'lat').issue).toBe('missing');
    expect(pairHemisphere('32.7', 5, 'lat').issue).toBe('missing');
  });
  it('degrees and minutes are negated through the same cell', () => {
    const p = pairHemisphere("32° 30.0'", 'S', 'lat');
    expect(parseCoordinate(p.cell, 'lat', false)).toMatchObject({ value: -32.5, form: 'dm' });
    expect(parseCoordinate(pairHemisphere('117 15 0', 'W', 'lon').cell, 'lon', false)).toMatchObject({ value: -117.25, form: 'dms' });
    expect(hemisphereLetter('N')).toBe('N');
    expect(hemisphereLetter('nord')).toBeUndefined();
  });
});

const CSV = [
  'Station,Begin Latitude,Beg Lat Dir,Begin Longitude,Lon Dir,End Latitude,End Lat Dir,End Longitude,End Lon Dir',
  'A,32.7,N,117.3,W,32.8,N,117.4,W',
  'B,33.5,S,18.25,E,33.6,S,18.3,E',
  'C,10.0,south,20.0,west,10.1,south,20.1,west',
].join('\n');

describe('/check: proposals', () => {
  it('Begin / End pairs: the begin letters sign the begin position; the end letters stay ignored with the end position', () => {
    const { mappings } = check(CSV);
    expect(roleOf(mappings, 'Begin Latitude')).toEqual({ kind: 'latitude' });
    expect(roleOf(mappings, 'Begin Longitude')).toEqual({ kind: 'longitude' });
    expect(roleOf(mappings, 'Beg Lat Dir')).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    expect(roleOf(mappings, 'Lon Dir')).toEqual({ kind: 'hemisphere', axis: 'longitude' });
    expect(roleOf(mappings, 'End Latitude')).toEqual({ kind: 'ignore' });
    expect(roleOf(mappings, 'End Lat Dir')).toEqual({ kind: 'ignore' });
    expect(roleOf(mappings, 'End Lon Dir')).toEqual({ kind: 'ignore' });
  });
  it('the proposal is low confidence and says what it does', () => {
    const header = ['Begin Latitude', 'Beg Lat Dir'];
    const ps = proposeColumns(rawSheet(header, [[32.7, 'S'], [33.5, 'N']]), CTX);
    const p = ps[1] as ColumnProposal;
    expect(p.role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    expect(p.confidence).toBe('low');
    expect(p.reasonCode).toBe('hemisphere-pair');
    expect(p.reason).toBe('hemisphere letter for Begin Latitude: S and W make the value negative');
  });
  it('the axis comes from the header, or from the values when the header does not say', () => {
    const ps = proposeColumns(rawSheet(['Latitude', 'Longitude', 'Hemisphere'], [[32.7, 117.3, 'E'], [33.5, 18.25, 'W']]), CTX);
    expect(ps[2].role).toEqual({ kind: 'hemisphere', axis: 'longitude' });
  });
  it('a letters column that names no mapped coordinate stays ignored with today\'s reason', () => {
    const ps = proposeColumns(rawSheet(['Lon Dir', 'Depth'], [['E', 10], ['W', 15]]), CTX);
    expect(ps[0].role).toEqual({ kind: 'ignore' });
    expect(ps[0].reasonCode).toBe('hemisphere');
  });
  it('a coordinate that carries its own signs is not paired (the letters would only contradict it)', () => {
    const ps = proposeColumns(rawSheet(['Latitude', 'Lat NS', 'Longitude'], [[-32.7, 'S', 117.3], [-33.5, 'S', 18.25], [40, 'N', 1.5]]), CTX);
    expect(ps[1].role).toEqual({ kind: 'ignore' });
    expect(ps[1].reasonCode).toBe('hemisphere-signed');
  });
  it('a header that read as a coordinate with numeric values stays a coordinate', () => {
    const ps = proposeColumns(rawSheet(['Latitude N/S', 'Longitude'], [[32.7, 117.3], [33.5, 18.25]]), CTX);
    expect(ps[0].role).toEqual({ kind: 'latitude' });
  });
  it('two positions and a letter column that cannot be told apart: not paired, and it says so', () => {
    const ps = proposeColumns(rawSheet(['Begin Latitude', 'Depth', 'End Latitude', 'Depth 2', 'Lat Dir'], [[32.7, 1, 32.8, 2, 'S'], [33.5, 3, 33.6, 4, 'N']]), CTX);
    expect(ps[4].role).toEqual({ kind: 'ignore' });
    expect(ps[4].reasonCode).toBe('hemisphere-ambiguous');
    expect(ps[4].reasonParams).toEqual({ name: 'Begin Latitude' });
  });
  it('...unless the other position has a hemisphere column of its own', () => {
    const ps = proposeColumns(rawSheet(['Begin Latitude', 'Depth', 'End Latitude', 'End Lat Dir', 'Depth 2', 'Lat Dir'], [[32.7, 1, 32.8, 'S', 2, 'S'], [33.5, 3, 33.6, 'N', 4, 'N']]), CTX);
    expect(ps[5].role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    expect(ps[3].role).toEqual({ kind: 'ignore' });
  });
});

describe('/check: applying the pairing', () => {
  it('N/S/E/W and the words give the signed decimals; the decimals are kept', () => {
    const { dataset, findings } = check(CSV);
    expect(dataset.rows.map((r) => [r.lat, r.lon])).toEqual([[32.7, -117.3], [-33.5, 18.25], [-10, -20]]);
    expect(dataset.rows[1]).toMatchObject({ latDecimals: 1, lonDecimals: 2 });
    expect(rule(findings, 'ROW-HEMISPHERE-CONFLICT')).toEqual([]);
    expect(rule(findings, 'ROW-HEMISPHERE-MISSING')).toEqual([]);
  });
  it('a value that is already negative with S is one conflict finding with its lines, and it is not negated twice', () => {
    const { dataset, findings } = checkForced(['Latitude,Lat Dir,Longitude,Lon Dir', '-32.7,S,117.3,E', '33.5,S,18.25,E', '-5.5,N,7.0,E'].join('\n'), { 'Lat Dir': 'latitude', 'Lon Dir': 'longitude' });
    expect(dataset.rows.map((r) => r.lat)).toEqual([-32.7, -33.5, -5.5]);
    const f = rule(findings, 'ROW-HEMISPHERE-CONFLICT');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'Latitude', lines: [2, 4], severity: 'warning', params: { hemisphere: 'Lat Dir' } });
  });
  it('a filled value with an empty or unknown letter is one missing finding; the value stays as written', () => {
    const { dataset, findings } = check(['Latitude,Lat Dir,Longitude,Lon Dir', '32.7,,117.3,E', '33.5,x,18.25,E', '1.5,N,7.0,E', '2.5,S,8.0,E', '3.5,N,9.0,E'].join('\n'));
    expect(dataset.rows.map((r) => r.lat)).toEqual([32.7, 33.5, 1.5, -2.5, 3.5]);
    const f = rule(findings, 'ROW-HEMISPHERE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'Latitude', lines: [2, 3], severity: 'warning' });
  });
  it('a letter of the other axis is part of the conflict finding', () => {
    // the header says latitude, one row holds an E: the user's choice stands and that row is reported
    const { dataset, findings } = checkForced(['Latitude,Lat Dir,Longitude', '32.7,E,117.3', '33.5,S,18.25'].join('\n'), { 'Lat Dir': 'latitude' });
    expect(dataset.rows.map((r) => r.lat)).toEqual([32.7, -33.5]);
    expect(rule(findings, 'ROW-HEMISPHERE-CONFLICT')[0]).toMatchObject({ lines: [2] });
  });
  it('degrees and minutes with a hemisphere column', () => {
    const { dataset, findings } = check(['Latitude,Lat Dir,Longitude,Lon Dir', "32° 30.0',S,117° 15.0',W", "12° 0.0',N,7° 30.0',E"].join('\n'));
    expect(dataset.rows.map((r) => [r.lat, r.lon])).toEqual([[-32.5, -117.25], [12, 7.5]]);
    expect(rule(findings, 'ROW-DM-COORDS')).toHaveLength(2);
  });
  it('a sheet without hemisphere columns is read exactly as before', () => {
    const { dataset } = check(['Latitude,Longitude', '-32.7,117.3', '33.5,-18.25'].join('\n'));
    expect(dataset.rows.map((r) => [r.lat, r.lon])).toEqual([[-32.7, 117.3], [33.5, -18.25]]);
  });
});

describe('/convert: the archive carries the signed decimals', () => {
  it('a hemisphere column the user maps is read by the converter, and written as signed decimals with the written digits', async () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'Latitude', 'Lat Dir', 'Longitude', 'Lon Dir', 'eventDate'];
    const rows = [
      ['o1', 'E1', 'Calanus finmarchicus', 5, 54.1, 'S', 7.9, 'W', '2022-05-05'],
      ['o2', 'E2', 'Calanus finmarchicus', 2, 54.35, 'N', 8.15, 'E', '2022-05-06'],
    ];
    const out = await exportSheet(header, rows, {
      quantity: { kind: 'count' },
      edit: { 'Lat Dir': { kind: 'hemisphere', axis: 'latitude' }, 'Lon Dir': { kind: 'hemisphere', axis: 'longitude' } },
    });
    const events = out.dataset.events.filter((e) => e.position !== undefined).map((e) => [e.position!.lat, e.position!.lon, e.position!.latText, e.position!.lonText]);
    expect(events).toEqual([[-54.1, -7.9, undefined, undefined], [54.35, 8.15, '54.35', '8.15']]);
    expect(out.findings.filter((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    // the written archive: the Event table holds signed decimals
    const back = await readBack(out.zip);
    const pos = objects(back.tables['event.txt']).filter((e) => e.decimalLatitude !== '').map((e) => [e.decimalLatitude, e.decimalLongitude]);
    expect(pos).toEqual([['-54.1', '-7.9'], ['54.35', '8.15']]);
  });
});

describe('/convert: the two findings are accepted by the user, not blocking', () => {
  it('a conflicting value and a missing letter reach the acceptance list', async () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'Latitude', 'Lat Dir', 'Longitude', 'eventDate'];
    const rows = [
      ['o1', 'E1', 'Calanus finmarchicus', 5, -54.1, 'S', 7.9, '2022-05-05'],
      ['o2', 'E2', 'Calanus finmarchicus', 2, 54.35, '', 8.15, '2022-05-06'],
    ];
    const out = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { 'Lat Dir': { kind: 'hemisphere', axis: 'latitude' } } });
    const ids = out.findings.map((f) => f.ruleId);
    expect(ids).toContain('ROW-HEMISPHERE-CONFLICT');
    expect(ids).toContain('ROW-HEMISPHERE-MISSING');
    const j = judge(out.findings);
    expect(j.acceptRules).toEqual(expect.arrayContaining(['ROW-HEMISPHERE-CONFLICT', 'ROW-HEMISPHERE-MISSING']));
    expect(j.blocking.filter((f) => f.ruleId.startsWith('ROW-HEMISPHERE'))).toEqual([]);
  });
});

describe('review round 1: the guard, own letters, position-station, stale pairing, one letter column, recognised letters', () => {
  const ps = (header: string[], rows: (string | number | null)[][]) => proposeColumns(rawSheet(header, rows), CTX);

  it('placeholders for a missing value and one odd negative do not switch the pairing off; the per-cell finding reports the odd one', () => {
    const rows: (string | number | null)[][] = [[32.7, 'S'], ['-33', 'S'], [40, 'S'], ['NA', 'S'], ['n.d.', 'S'], ['unknown', 'S'], ['-', 'S'], [null, 'S']];
    expect(ps(['Latitude', 'Lat Dir'], rows)[1].role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    const { dataset, findings } = check(['Latitude,Lat Dir,Longitude', '32.7,S,1.5', '-33,S,1.5', '40,S,1.5', 'NA,S,1.5'].join('\n'));
    expect(dataset.rows.map((r) => r.lat)).toEqual([-32.7, -33, -40, undefined]);
    expect(rule(findings, 'ROW-HEMISPHERE-CONFLICT')[0]).toMatchObject({ field: 'Latitude', lines: [3] });
  });
  it('a column that really carries signs or letters (most filled values) is not paired, and the reason says so', () => {
    const signed = ps(['Latitude', 'Lat Dir'], [[-32.7, 'S'], [-33, 'S'], [40, 'N'], ['NA', 'N']]);
    expect(signed[1].role).toEqual({ kind: 'ignore' });
    expect(signed[1].reasonCode).toBe('hemisphere-signed');
    expect(signed[1].reason).toBe('Latitude already carries signs or letters: the letter column is not applied');
    const lettered = ps(['Latitude', 'Lat Dir'], [["32° 45' N", 'N'], ["33° 10' S", 'S'], [40, 'N']]);
    expect(lettered[1].reasonCode).toBe('hemisphere-signed');
  });
  it('a degrees-minutes cell with its own letter keeps its value: an agreeing letter changes nothing, a disagreeing one is a conflict', () => {
    expect(parseCoordinate(pairHemisphere("32°45'N", 'N', 'lat').cell, 'lat', false)).toMatchObject({ value: 32.75 });
    expect(pairHemisphere("32°45'N", 'N', 'lat')).toEqual({ cell: "32°45'N" });
    expect(parseCoordinate(pairHemisphere("32° 45' S", 'S', 'lat').cell, 'lat', false)).toMatchObject({ value: -32.75 });
    expect(pairHemisphere("32° 45' S", 'N', 'lat')).toEqual({ cell: "32° 45' S", issue: 'conflict' });
    expect(pairHemisphere('12°3\'4"S', 'S', 'lat')).toEqual({ cell: '12°3\'4"S' });
    expect(pairHemisphere('12°3\'4"S', 'N', 'lat').issue).toBe('conflict');
    expect(pairHemisphere('S 12° 3\' 4"', 'N', 'lat').issue).toBe('conflict');
    const { dataset, findings } = checkForced(['Latitude,Lat Dir,Longitude', "32°45'N,N,1.5", "32° 45' S,S,1.5", "32° 45' S,N,1.5"].join('\n'), { 'Lat Dir': 'latitude' });
    expect(dataset.rows.map((r) => r.lat)).toEqual([32.75, -32.75, -32.75]);
    expect(rule(findings, 'ROW-NON-NUMERIC')).toEqual([]);
    expect(rule(findings, 'ROW-HEMISPHERE-CONFLICT')[0]).toMatchObject({ lines: [4] });
  });
  it('the converter position-station is built from the signed values: north and south of one position are two stations', () => {
    const text = 'Date,Latitude,Lat Dir,Longitude,Lon Dir,Depth_m,TEMP_C\n2020-05-01,70.1,N,20.2,E,5,4.1\n2020-05-01,70.1,S,20.2,E,5,3.9\n2020-05-01,70.1,S,20.2,W,5,3.5\n';
    const file = readConvertFile(parseFile('ps.csv', new TextEncoder().encode(text)));
    const columns = proposeConvertColumns(file.sheets[0], CTX).map((p) => ({
      index: p.index,
      header: p.header,
      role: p.header === 'Lat Dir' ? ({ kind: 'hemisphere', axis: 'latitude' } as const) : p.header === 'Lon Dir' ? ({ kind: 'hemisphere', axis: 'longitude' } as const) : p.role,
    }));
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping: { sheet: file.sheets[0].name, columns }, shape: 'wide', profile: { depthIds: true, positionStation: true } }] });
    expect(r.events.filter((e) => e.eventType === 'station').map((e) => e.id)).toEqual(['70.1_20.2', '-70.1_20.2', '-70.1_-20.2']);
    expect(r.findings.filter((f) => f.ruleId === 'CONV-ID-DUPLICATE')).toEqual([]);
  });
  it('a remapped coordinate leaves no stale pairing: Beg Lat Dir does not sign End Latitude, and one finding names it', () => {
    const csv = ['Begin Latitude,Beg Lat Dir,End Latitude,Longitude', '32.7,S,33.7,1.5', '10.5,N,11.5,1.5'].join('\n');
    const file = textFile('sio.csv', csv);
    const layout = proposeLayout(file);
    const mappings = proposeMappings(file, layout);
    expect(mappings[0].columns.find((c) => c.header === 'Beg Lat Dir')!.role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    mappings[0].columns = mappings[0].columns.map((c) => (c.header === 'Begin Latitude' ? { ...c, role: { kind: 'ignore' as const } } : c.header === 'End Latitude' ? { ...c, role: { kind: 'latitude' as const } } : c));
    const { dataset, findings } = buildDataset(file, layout, mappings, [], 'd');
    expect(dataset.rows.map((r) => r.lat)).toEqual([33.7, 11.5]);
    const f = rule(findings, 'ROW-HEMISPHERE-UNPAIRED');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'End Latitude', severity: 'warning', params: { hemisphere: 'Beg Lat Dir' } });
    // and an agreeing pair raises nothing
    expect(rule(check(CSV).findings, 'ROW-HEMISPHERE-UNPAIRED')).toEqual([]);
  });
  it('at most one letter column per mapped coordinate; the other is ambiguous', () => {
    const p = ps(['Latitude', 'Lat Dir', 'Lat NS'], [[32.7, 'S', 'S'], [33.5, 'N', 'N']]);
    expect(p[1].role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
    expect(p[2].role).toEqual({ kind: 'ignore' });
    expect(p[2].reasonCode).toBe('hemisphere-ambiguous');
  });
  it('no proposal unless most filled values are recognised letters or words (Süd, Ost are not)', () => {
    const de = ps(['Latitude', 'Lat Dir'], [[32.7, 'Süd'], [33.5, 'Nord']]);
    expect(de[1].role).toEqual({ kind: 'ignore' });
    expect(de[1].reasonCode).toBe('hemisphere');
    const words = ps(['Latitude', 'Lat Dir'], [[32.7, 'South'], [33.5, 'north'], [34, null]]);
    expect(words[1].role).toEqual({ kind: 'hemisphere', axis: 'latitude' });
  });
});

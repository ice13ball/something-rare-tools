// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 6: separate environmental and CTD profile files. A biology sheet and profile sheets through the core, the checks of the output tables, the writers and the
// repository's own readers. Synthetic data only: every position, date, depth and value below is invented.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { archiveFiles } from '../../src/core/convert/dwca';
import { toDataset } from '../../src/core/convert/model';
import { judge } from '../../src/core/convert/policy';
import { suggestConvertProfile } from '../../src/core/convert/recognize';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { validateTables } from '../../src/core/convert/validate';
import { PRESSURE, PRESSURE_VERIFIED_CODES, P01, P06 } from '../../src/core/convert/vocab';
import { buildZip } from '../../src/core/convert/zip';
import { PROFILE_VARIANTS, makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { textFile } from '../helpers/files';
import { META, TODAY, exportSheets, nodeDeflate, objects, readBack } from './exportHelpers';
import { W1_HEADER, W1_QUANTITY, W1_ROWS, fileOf, mappingOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

/* ---- the synthetic data of C1 ---- */

const BIO = (): ConvertSheetInput => sheetInput(fileOf(W1_HEADER, W1_ROWS, 'BIO', { fileName: 'bio.csv' }), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } });

const CTD_H = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]', 'Salinity [PSU]'];
/** S1 and S2 are stations of the biology sheet; S9 is not. */
const CTD_ROWS: Cell[][] = [
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 0, 11.2, 34.1],
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 10, 10.9, 34.2],
  ['CR1', 'S1', 55.51, 2.51, '2023-06-14', 25, 10.1, 34.4],
  ['CR1', 'S2', 55.91, 3.11, '2023-06-16', 0, 10.8, 34.2],
  ['CR1', 'S2', 55.91, 3.11, '2023-06-16', 10, 10.6, 34.3],
  ['CR1', 'S9', 56.2, 3.4, '2023-06-17', 0, 12, 34],
  ['CR1', 'S9', 56.2, 3.4, '2023-06-17', 10, 11.5, 34.1],
];
const CTD = (extra: Partial<ConvertSheetInput> = {}, rows: Cell[][] = CTD_ROWS, header: string[] = CTD_H): ConvertSheetInput =>
  sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true }, ...extra });

/** Pressure only (no depth column): S2 matches, S8 does not. */
const CTDP_H = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Pressure [dbar]', 'Temperature [°C]'];
const CTDP_ROWS: Cell[][] = [
  ['CR1', 'S2', 55.91, 3.11, '2023-06-16', 5, 10.7],
  ['CR1', 'S2', 55.91, 3.11, '2023-06-16', 15, 10.4],
  ['CR1', 'S8', 56.1, 3.3, '2023-06-17', 5, 11.9],
  ['CR1', 'S8', 56.1, 3.3, '2023-06-17', 15, 11.3],
];
const CTDP = (extra: Partial<ConvertSheetInput> = {}): ConvertSheetInput => sheetInput(fileOf(CTDP_H, CTDP_ROWS, 'CTDP', { fileName: 'ctdp.csv' }), { profile: { depthIds: true }, ...extra });

const run = (sheets: ConvertSheetInput[], o: { flatten?: { station?: boolean; cruise?: boolean } } = {}) => {
  const splits = Object.fromEntries(
    convert({ sheets, options: {} })
      .splits.filter((s) => s.needsDecision)
      .map((s) => [s.verbatim, s.proposed]),
  );
  return convert({ sheets, options: { ...(o.flatten ? { flatten: o.flatten } : {}) }, approvedSplits: splits });
};
const ids = (r: ReturnType<typeof run>, type: string): string[] => r.events.filter((e) => e.eventType === type).map((e) => e.id);
const rules = (r: { findings: { ruleId: string }[] }): string[] => r.findings.map((f) => f.ruleId);

/* ---- C1 ---- */

describe('C1: a biology sheet and CTD sheets, with matched and unmatched stations and a pressure-only cast', () => {
  it('every row is its own level event under its station, with min = max depth, and nothing blocks', async () => {
    const x = await exportSheets([BIO(), CTD(), CTDP()]);
    expect(judge(x.findings).blocking).toEqual([]);
    const b = await readBack(x.zip);
    const ev = objects(b.tables['event.txt']);
    const levels = ev.filter((e) => e.eventType === 'profile level');
    expect(levels.map((e) => e.eventID)).toEqual(['CR1:S1:0', 'CR1:S1:10', 'CR1:S1:25', 'CR1:S2:0', 'CR1:S2:10', 'CR1:S9:0', 'CR1:S9:10', 'CR1:S2:5dbar', 'CR1:S2:15dbar', 'CR1:S8:5dbar', 'CR1:S8:15dbar']);
    expect(levels.map((e) => e.parentEventID)).toEqual(['CR1:S1', 'CR1:S1', 'CR1:S1', 'CR1:S2', 'CR1:S2', 'CR1:S9', 'CR1:S9', 'CR1:S2', 'CR1:S2', 'CR1:S8', 'CR1:S8']);
    // the depth sheet: min = max = the row's depth, as written; the pressure-only sheet: no depth at all
    const byId = new Map(ev.map((e) => [e.eventID, e]));
    for (const id of ['CR1:S1:0', 'CR1:S1:10', 'CR1:S1:25', 'CR1:S2:0', 'CR1:S2:10', 'CR1:S9:0', 'CR1:S9:10']) {
      const e = byId.get(id)!;
      expect(e.minimumDepthInMeters, id).toBe(id.split(':')[2]);
      expect(e.maximumDepthInMeters, id).toBe(id.split(':')[2]);
    }
    for (const id of ['CR1:S2:5dbar', 'CR1:S2:15dbar', 'CR1:S8:5dbar', 'CR1:S8:15dbar']) {
      expect(byId.get(id)!.minimumDepthInMeters, id).toBe('');
      expect(byId.get(id)!.maximumDepthInMeters, id).toBe('');
    }
    // the matched stations are the biology stations; the two unmatched ones are stations of their own, under the same cruise
    expect(ev.filter((e) => e.eventType === 'station').map((e) => [e.eventID, e.parentEventID])).toEqual([['CR1:S1', 'CR1'], ['CR1:S2', 'CR1'], ['CR1:S9', 'CR1'], ['CR1:S8', 'CR1']]);
    expect(x.result.profile).toMatchObject({ sheets: 2, levels: 11, stationsMatched: 2, stationsUnmatched: 2 });
    expect(x.result.profile.unmatched).toEqual(['CR1:S9', 'CR1:S8']);
    expect(x.result.stats.levels).toBe(11);
    expect(x.result.tree.levels).toBe(11);
    // the repository's own reader sees the same Event core
    expect(b.core.sheets[0].rows.length).toBe(ev.length);
  });

  it('the unmatched stations are named by CONV-PROFILE-STATION-UNMATCHED (a warning to accept), one finding per sheet', () => {
    const r = run([BIO(), CTD(), CTDP()]);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-PROFILE-STATION-UNMATCHED');
    expect(f.map((x) => [x.sheet, x.params])).toEqual([['CTD', { count: 1, names: 'CR1:S9' }], ['CTDP', { count: 1, names: 'CR1:S8' }]]);
    expect(f[0].severity).toBe('warning');
    expect(judge(r.findings).acceptRules).toContain('CONV-PROFILE-STATION-UNMATCHED');
    expect(judge(r.findings).blocking).toEqual([]);
    expect(renderConvertPlain(f[0], 'en')).toContain('CR1:S9');
    expect(renderConvertPlain(f[0], 'pl')).toContain('CR1:S9');
  });

  it('the pressure-only sheet writes the pressure with PRESPR01 and UPDB; a sheet with both depth and pressure uses the depth and writes the pressure too', async () => {
    const x = await exportSheets([BIO(), CTDP()]);
    const b = await readBack(x.zip);
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    const p = emof.filter((m) => m.measurementTypeID === PRESSURE.type.uri);
    expect(p.map((m) => [m.eventID, m.measurementValue, m.measurementUnit, m.measurementUnitID])).toEqual([
      ['CR1:S2:5dbar', '5', 'dbar', PRESSURE.unit.uri],
      ['CR1:S2:15dbar', '15', 'dbar', PRESSURE.unit.uri],
      ['CR1:S8:5dbar', '5', 'dbar', PRESSURE.unit.uri],
      ['CR1:S8:15dbar', '15', 'dbar', PRESSURE.unit.uri],
    ]);
    expect(p[0].measurementType).toBe(PRESSURE.type.label);
    // both columns: the depth is the level's depth and the pressure is an eMoF row as well
    const both = await exportSheets([BIO(), CTD({}, CTD_ROWS.map((r, i) => [...r, i + 0.5]), [...CTD_H, 'Pressure [dbar]'])]);
    const bb = await readBack(both.zip);
    const lv = objects(bb.tables['event.txt']).find((e) => e.eventID === 'CR1:S1:10')!;
    expect([lv.minimumDepthInMeters, lv.maximumDepthInMeters]).toEqual(['10', '10']);
    const pm = objects(bb.tables['extendedmeasurementorfact.txt']).filter((m) => m.eventID === 'CR1:S1:10');
    expect(pm.map((m) => m.measurementTypeID)).toEqual(expect.arrayContaining([PRESSURE.type.uri]));
    expect(pm.find((m) => m.measurementTypeID === PRESSURE.type.uri)!.measurementValue).toBe('1.5');
  });

  it('a pressure unit that is not decibars gets no unit identifier and a warning; a pressure with no unit is written with none, with a warning that names the column', () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Pressure [bar]'];
    const rows: Cell[][] = [['CR1', 'S2', 55.9, 3.1, '2023-06-16', 5, 0.5], ['CR1', 'S2', 55.9, 3.1, '2023-06-16', 15, 1.5]];
    const r = run([BIO(), sheetInput(fileOf(header, rows, 'P', { fileName: 'p.csv' }), { profile: { depthIds: true } })]);
    const m = r.measurements.filter((x) => x.role === 'pressure');
    expect(m.map((x) => [x.measurementUnit, x.measurementUnitId, x.measurementTypeId])).toEqual([['bar', undefined, PRESSURE.type.uri], ['bar', undefined, PRESSURE.type.uri]]);
    expect(r.findings.find((f) => f.ruleId === 'CONV-UNIT-NO-P06' && f.params.unit === 'bar')).toBeDefined();
    expect(rules(r)).not.toContain('CONV-PROFILE-PRESSURE-NO-UNIT');
    const none = run([BIO(), sheetInput(fileOf(['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Pressure'], rows, 'P', { fileName: 'p.csv' }), { profile: { depthIds: true } })]);
    const pn = none.measurements.filter((x) => x.role === 'pressure');
    expect(pn.map((x) => [x.measurementUnit, x.measurementUnitId])).toEqual([[undefined, undefined], [undefined, undefined]]);
    const f = none.findings.find((x) => x.ruleId === 'CONV-PROFILE-PRESSURE-NO-UNIT')!;
    expect(f.params).toEqual({ column: 'Pressure' });
    expect(f.severity).toBe('warning');
    expect(judge(none.findings).acceptRules).toContain('CONV-PROFILE-PRESSURE-NO-UNIT');
    for (const lang of LANGS) expect(renderConvertPlain(f, lang)).toContain('Pressure');
  });
});

/* ---- the event type, the hierarchy and the extent of a station ---- */

describe('the event tree with profile levels', () => {
  it('eventType is the text "profile level", and the levels are leaves under their station (no cast level between them)', () => {
    const r = run([BIO(), CTD()]);
    expect(ids(r, 'profile level')).toEqual(['CR1:S1:0', 'CR1:S1:10', 'CR1:S1:25', 'CR1:S2:0', 'CR1:S2:10', 'CR1:S9:0', 'CR1:S9:10']);
    const kinds = new Set(r.events.map((e) => e.eventType));
    expect([...kinds].sort()).toEqual(['cruise', 'profile level', 'sample', 'station']);
    const level = r.events.find((e) => e.id === 'CR1:S1:10')!;
    expect(level.parentId).toBe('CR1:S1');
    // no event has a level as its parent
    const levelIds = new Set(ids(r, 'profile level'));
    expect(r.events.some((e) => e.parentId !== undefined && levelIds.has(e.parentId))).toBe(false);
  });

  it("the station's date, position, uncertainty and depth range include its levels (they are children)", () => {
    // a level on the 13th, deeper than the net samples, 0.2 degrees north of them
    const rows: Cell[][] = [['CR1', 'S1', 55.7, 2.5, '2023-06-13', 120, 9, 34.5]];
    const withLevels = run([BIO(), CTD({}, rows)]);
    const without = run([BIO()]);
    const s = withLevels.events.find((e) => e.id === 'CR1:S1')!;
    const s0 = without.events.find((e) => e.id === 'CR1:S1')!;
    expect(s0.eventDate).toBe('2023-06-14');
    expect(s.eventDate).toBe('2023-06-13/2023-06-14');
    expect([s0.depthMin, s0.depthMax]).toEqual([0, 50]);
    expect([s.depthMin, s.depthMax]).toEqual([0, 120]);
    expect(s.lat).toBeGreaterThan(s0.lat!);
    expect(s.coordinateUncertaintyInMeters!).toBeGreaterThan(s0.coordinateUncertaintyInMeters ?? 0);
    expect(s.derived).toEqual({ date: true, position: true, depth: true });
    // and the cruise above it covers the level too
    const cruise = withLevels.events.find((e) => e.id === 'CR1')!;
    expect(cruise.eventDate).toBe('2023-06-13/2023-06-16');
    expect(cruise.depthMax).toBe(120);
  });

  it('an unmatched station is derived from its levels alone', () => {
    const r = run([BIO(), CTD()]);
    const s9 = r.events.find((e) => e.id === 'CR1:S9')!;
    expect([s9.eventDate, s9.lat, s9.lon, s9.depthMin, s9.depthMax]).toEqual(['2023-06-17', 56.2, 3.4, 0, 10]);
    expect(s9.derived).toEqual({ date: true, position: true, depth: true });
  });

  it('with the station level flattened the levels sit under the cruise and carry the station code as locality', () => {
    const r = run([BIO(), CTD()], { flatten: { station: true } });
    const level = r.events.find((e) => e.id === 'CR1:S1:10')!;
    expect(level.parentId).toBe('CR1');
    expect(level.locality).toBe('S1');
    expect(r.events.some((e) => e.eventType === 'station')).toBe(false);
  });
});

/* ---- station matching ---- */

describe('station matching is exact', () => {
  it('matches the trimmed station text, and nothing else: another case, spelling or leading zero is a different station', () => {
    const rows: Cell[][] = [['CR1', ' S1 ', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 's1', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 'S01', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 'S 1', 55.5, 2.5, '2023-06-14', 0, 11]];
    const r = run([BIO(), CTD({}, rows, ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'])]);
    expect(r.profile.stationsMatched).toBe(1);
    expect(r.profile.unmatched).toEqual(['CR1:s1', 'CR1:S01', 'CR1:S 1']);
    expect(ids(r, 'station').sort()).toEqual(['CR1:S 1', 'CR1:S01', 'CR1:S1', 'CR1:S2', 'CR1:s1']);
  });

  it('the cruise counts when there is one: a profile sheet without the cruise does not match a biology station of a cruise, and the cruise field of the sheet makes it match', () => {
    const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['S1', 55.5, 2.5, '2023-06-14', 0, 11]];
    const noCruise = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } })]);
    expect(noCruise.profile.unmatched).toEqual(['S1']);
    expect(noCruise.events.find((e) => e.id === 'S1:0')!.parentId).toBe('S1');
    const withCruise = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true }, cruise: 'CR1' })]);
    expect(withCruise.profile).toMatchObject({ stationsMatched: 1, stationsUnmatched: 0 });
    expect(withCruise.findings.some((f) => f.ruleId === 'CONV-PROFILE-STATION-UNMATCHED')).toBe(false);
  });

  it('a profile row with no station is blocked, never placed somewhere', () => {
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', null, 55.5, 2.5, '2023-06-14', 5, 11]];
    const r = run([BIO(), CTD({}, rows, ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'])]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-PROFILE-NO-STATION')!;
    expect(f.lines).toEqual([3]);
    expect(f.severity).toBe('error');
    expect(ids(r, 'profile level')).toEqual(['CR1:S1:0']);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-PROFILE-NO-STATION');
  });
});

/* ---- level IDs (Q1b) ---- */

describe('level IDs', () => {
  const noDepthIds = (rows: Cell[][] = CTD_ROWS, header: string[] = CTD_H): ConvertSheetInput => sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: {} });

  it('without the approval and without a code column every row blocks with CONV-SAMPLE-CODE-MISSING, in the profile text, and no level is made', () => {
    const r = run([BIO(), noDepthIds()]);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-SAMPLE-CODE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 7, profile: 'yes', column: 'none' });
    expect(f[0].lines).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(ids(r, 'profile level')).toEqual([]);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-SAMPLE-CODE-MISSING');
    expect(renderConvertPlain(f[0], 'en')).toContain('approval');
    expect(renderConvertPlain(f[0], 'en')).not.toContain('proposed codes');
    expect(renderConvertTechnical(f[0])).toContain('never derived from the order of the rows');
  });

  it('with the approval the ID is the station eventID, a colon and the depth as written', () => {
    const r = run([BIO(), CTD()]);
    expect(ids(r, 'profile level')).toEqual(['CR1:S1:0', 'CR1:S1:10', 'CR1:S1:25', 'CR1:S2:0', 'CR1:S2:10', 'CR1:S9:0', 'CR1:S9:10']);
    expect(r.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CODE-MISSING')).toBe(false);
    // as written: a decimal comma and a trailing zero are kept
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const text = run([BIO(), sheetInput(fileOf(header, [['CR1', 'S1', '55,5', '2,5', '2023-06-14', '10,50', '11,1'], ['CR1', 'S1', '55,5', '2,5', '2023-06-14', '12', '11']], 'CTD', { fileName: 'ctd.csv', decimalComma: true }), { profile: { depthIds: true } })]);
    expect(ids(text, 'profile level')).toEqual(['CR1:S1:10.50', 'CR1:S1:12']);
  });

  it('with a code column the ID is the station eventID, a colon and the code, whether or not the approval is ticked', () => {
    const header = ['Cruise', 'Station', 'Bottle', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 'B1', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 'S1', 'B2', 55.5, 2.5, '2023-06-14', 10, 10.5], ['CR1', 'S2', 'B1', 55.9, 3.1, '2023-06-16', 0, 11]];
    for (const profile of [{}, { depthIds: true }]) {
      const r = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile, edit: { Bottle: { kind: 'sampleId' } } })]);
      expect(ids(r, 'profile level')).toEqual(['CR1:S1:B1', 'CR1:S1:B2', 'CR1:S2:B1']);
      expect(r.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CODE-MISSING' || f.ruleId === 'CONV-ID-DUPLICATE')).toBe(false);
    }
  });

  it('a row without a code in a code column is blocked in the profile text, and a row without a readable depth is blocked under the approval', () => {
    const header = ['Cruise', 'Station', 'Bottle', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 'B1', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 'S1', null, 55.5, 2.5, '2023-06-14', 10, 10.5]];
    const r = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: {}, edit: { Bottle: { kind: 'sampleId' } } })]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-SAMPLE-CODE-MISSING')!;
    expect(f.lines).toEqual([3]);
    expect(f.params).toMatchObject({ profile: 'yes', column: 'Bottle' });
    const na: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 11], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 'NA', 10.5], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', null, 10.4]];
    const r2 = run([BIO(), CTD({}, na, ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'])]);
    expect(ids(r2, 'profile level')).toEqual(['CR1:S1:0']);
    expect(r2.findings.find((x) => x.ruleId === 'CONV-SAMPLE-CODE-MISSING')!.lines).toEqual([3, 4]);
  });

  it('an ID is never made from the order of the rows: the same rows in the reverse order give the same set of IDs', () => {
    const forward = run([BIO(), CTD()]);
    const backward = run([BIO(), CTD({}, [...CTD_ROWS].reverse())]);
    expect(new Set(ids(backward, 'profile level'))).toEqual(new Set(ids(forward, 'profile level')));
  });

  it('repeated casts at one station and depth make a duplicate ID (CONV-ID-DUPLICATE, in input terms), and a code column that tells the casts apart fixes it', async () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 11], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 20, 10.5], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 11.2], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 20, 10.6]];
    const dup = run([BIO(), CTD({}, rows, header)]);
    const f = dup.findings.filter((x) => x.ruleId === 'CONV-ID-DUPLICATE' && x.params.kind === 'level');
    expect(f.map((x) => [x.value, x.lines])).toEqual([['CR1:S1:10', [2, 4]], ['CR1:S1:20', [3, 5]]]);
    expect(judge(dup.findings).blocking.map((x) => x.ruleId)).toContain('CONV-ID-DUPLICATE');
    expect(renderConvertPlain(f[0], 'en')).toContain('cast');
    expect(renderConvertPlain(f[0], 'en')).toContain('sample code');
    expect(renderConvertPlain(f[0], 'en')).not.toContain('station prefix');
    // the first row of each pair is kept, the repeated one is not made: no event with the same ID twice
    expect(new Set(ids(dup, 'profile level')).size).toBe(ids(dup, 'profile level').length);
    // fixed with a column that makes the code unique within the station
    const fixedHeader = [...header, 'Cast-bottle'];
    const fixedRows = rows.map((r, i) => [...r, `${i < 2 ? 'c1' : 'c2'}-${r[5]}`]);
    const fixed = await exportSheets([BIO(), sheetInput(fileOf(fixedHeader, fixedRows, 'CTD', { fileName: 'ctd.csv' }), { profile: {}, edit: { 'Cast-bottle': { kind: 'sampleId' } } })]);
    expect(judge(fixed.findings).blocking).toEqual([]);
    expect(ids(fixed.result as never, 'profile level')).toEqual(['CR1:S1:c1-10', 'CR1:S1:c1-20', 'CR1:S1:c2-10', 'CR1:S1:c2-20']);
  });

  it('a level ID that equals the ID of a sample is a duplicate too (the station prefix of the samples is on)', () => {
    // with the station prefix the sample S1-a is CR1:S1:S1-a; a profile code "S1-a" at station S1 makes the same ID
    const header = ['Cruise', 'Station', 'Code', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 'S1-a', 55.5, 2.5, '2023-06-14', 0, 11]];
    const r = convert({ sheets: [BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: {}, edit: { Code: { kind: 'sampleId' } } })], options: { prefixStation: true }, approvedSplits: Object.fromEntries(run([BIO()]).splits.filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed])) });
    const places = r.findings.filter((x) => x.ruleId === 'CONV-ID-DUPLICATE' && x.params.kind === 'level-other').map((x) => [x.file, x.value, x.params.used]);
    expect(places).toEqual([['bio.csv', 'CR1:S1:S1-a', 'sample'], ['ctd.csv', 'CR1:S1:S1-a', 'code']]);
    // the text of a collision with a sample is not the "two profile rows" text, and does not offer the station prefix
    const f = r.findings.find((x) => x.file === 'ctd.csv' && x.ruleId === 'CONV-ID-DUPLICATE')!;
    expect(renderConvertPlain(f, 'en')).not.toContain('Two rows of one station');
    expect(renderConvertPlain(f, 'en')).not.toContain('prefix');
    expect(ids(r, 'profile level')).toEqual([]);
  });
});

/* ---- inheritance of position and date ---- */

describe('position and date of a level', () => {
  const NO_POS_H = ['Cruise', 'Station', 'Depth [m]', 'Temperature [°C]'];

  it("a level with no position or date of its own is written without them and inherits them from its station; nothing blocks, as BioCheck judges the leaves after inheritance", async () => {
    const rows: Cell[][] = [['CR1', 'S1', 0, 11], ['CR1', 'S1', 10, 10.5], ['CR1', 'S2', 0, 10.8]];
    const x = await exportSheets([BIO(), CTD({}, rows, NO_POS_H)]);
    expect(judge(x.findings).blocking).toEqual([]);
    const b = await readBack(x.zip);
    const ev = objects(b.tables['event.txt']);
    const lv = ev.find((e) => e.eventID === 'CR1:S1:10')!;
    expect([lv.eventDate, lv.decimalLatitude, lv.decimalLongitude]).toEqual(['', '', '']);
    const st = ev.find((e) => e.eventID === 'CR1:S1')!;
    expect(st.eventDate).toBe('2023-06-14');
    expect(st.decimalLatitude).not.toBe('');
    // the station's depth range now includes the levels' depths (0 to 50 from the samples already)
    expect([st.minimumDepthInMeters, st.maximumDepthInMeters]).toEqual(['0', '50']);
  });

  it('a level of an unmatched station with no date or position of its own has nothing to inherit: CONV-PROFILE-LEVEL-INCOMPLETE blocks, in the sheet\'s terms', () => {
    const rows: Cell[][] = [['CR1', 'S9', 0, 11], ['CR1', 'S9', 10, 10.5], ['CR1', 'S1', 0, 11]];
    const r = run([BIO(), CTD({}, rows, NO_POS_H)]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')!;
    expect(f.lines).toEqual([2, 3]);
    expect(f.params).toMatchObject({ count: 2, what: 'date and position' });
    expect(f.severity).toBe('error');
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-PROFILE-LEVEL-INCOMPLETE');
    expect(renderConvertPlain(f, 'en')).toContain('date or position');
    // a level that has its own date but no position says only the position
    const dated = run([BIO(), CTD({}, [['CR1', 'S9', '2023-06-17', 0, 11]], ['Cruise', 'Station', 'Date', 'Depth [m]', 'Temperature [°C]'])]);
    expect(dated.findings.find((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')!.params.what).toBe('position');
    // a matched station gives its levels the date and the position of its samples: nothing is said
    const matched = run([BIO(), CTD({}, [['CR1', 'S1', 0, 11]], NO_POS_H)]);
    expect(matched.findings.some((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')).toBe(false);
  });

  it("the sheet's own date, time and position go to the level event", () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Time [UTC]', 'Depth [m]', 'Temperature [°C]'];
    const rows: Cell[][] = [['CR1', 'S1', 55.52, 2.52, '2023-06-14', '08:30', 0, 11], ['CR1', 'S1', 55.53, 2.53, '2023-06-14', '08:35', 10, 10.5]];
    const r = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } })]);
    const a = r.events.find((e) => e.id === 'CR1:S1:0')!;
    const c = r.events.find((e) => e.id === 'CR1:S1:10')!;
    expect([a.eventDate, a.lat, a.lon]).toEqual(['2023-06-14T08:30Z', 55.52, 2.52]);
    expect([c.eventDate, c.lat, c.lon]).toEqual(['2023-06-14T08:35Z', 55.53, 2.53]);
  });

  it('the depth rules of the output apply to the levels: a level with a depth deeper than the bounds of ROW-DEPTH-MIN-MAX cannot exist, and a bad depth is reported', () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth top [m]', 'Depth bottom [m]', 'Temperature [°C]'];
    // bounds the wrong way round: min greater than max
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 30, 10, 11]];
    const r = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true }, edit: { 'Depth top [m]': { kind: 'depth', positive: 'down', unit: 'm', bound: 'min' }, 'Depth bottom [m]': { kind: 'depth', positive: 'down', unit: 'm', bound: 'max' } } })]);
    const ds = toDataset(r, META, { fullList: false, prefixStation: false, worms: false, nvs: false });
    const f = validateTables(ds, r.findings, { today: TODAY });
    expect(f.map((x) => x.ruleId)).toContain('ROW-DEPTH-MIN-MAX');
    // text where a depth is expected is reported like any number cell
    const text = run([BIO(), CTD({}, [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 'deep', 11, 34]], CTD_H)]);
    expect(rules(text)).toContain('ROW-NON-NUMERIC');
  });
});

/* ---- eMoF on level events only ---- */

describe('measurements', () => {
  it('the variables and the pressure of a profile row are eMoF rows of its level event, and never of a sample', async () => {
    const x = await exportSheets([BIO(), CTD({}, CTD_ROWS.map((r, i) => [...r, i + 1]), [...CTD_H, 'Pressure [dbar]'])]);
    const levelIds = new Set(ids(x.result, 'profile level'));
    const sampleIds = new Set(ids(x.result, 'sample'));
    const mine = x.result.measurements.filter((m) => m.role === 'variable' || m.role === 'pressure');
    expect(mine.length).toBe(7 * 3);
    for (const m of mine) {
      expect(m.target.kind).toBe('event');
      expect(levelIds.has(m.target.id), m.target.id).toBe(true);
      expect(sampleIds.has(m.target.id)).toBe(false);
    }
    // read back: the eMoF rows that are not a sample's (no instrument, no effort) all name a level event, and each level has its three
    const b = await readBack(x.zip);
    const emof = objects(b.tables['extendedmeasurementorfact.txt']);
    for (const id of levelIds) expect(emof.filter((m) => m.eventID === id).length, id).toBe(3);
    for (const m of emof.filter((e) => e.eventID.startsWith('CR1:S') && e.eventID.split(':').length === 3)) expect(m.occurrenceID).toBe('');
    // no measurement of a biology sample is a variable of the profile sheet
    expect(emof.filter((m) => sampleIds.has(m.eventID) && /temperature|salinity/i.test(m.measurementType))).toEqual([]);
  });

  it('the NERC decisions of stage 5 apply to a profile sheet unchanged: a confirmed concept and unit are written, the others raise the same warnings', () => {
    const mapping = mappingOf(fileOf(CTD_H, CTD_ROWS, 'CTD', { fileName: 'ctd.csv' }));
    const temp = mapping.columns.find((c) => c.header === 'Temperature [°C]')!.index;
    const nerc = { [String(temp)]: { type: { id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', source: 'suggested' as const, deprecated: false }, unit: { id: 'http://vocab.nerc.ac.uk/collection/P06/current/UPAA/', source: 'suggested' as const, deprecated: false } } };
    const r = run([BIO(), CTD({ nerc })]);
    const t = r.measurements.filter((m) => m.role === 'variable' && m.measurementType === 'Temperature of the water body');
    expect(t.every((m) => m.measurementTypeId === 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/' && m.measurementUnitId === 'http://vocab.nerc.ac.uk/collection/P06/current/UPAA/')).toBe(true);
    expect(t).toHaveLength(7);
    const unknown = r.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN' && f.sheet === 'CTD')!;
    expect(unknown.params.what).toBe('salinity');
  });
});

/* ---- nothing is dropped silently ---- */

describe('columns of a profile sheet', () => {
  it('a taxon, quantity or second pressure column of a profile sheet is named by CONV-COLUMN-NOT-EXPORTED, and raises no species finding', () => {
    const header = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Pressure [dbar]', 'Pressure, 2 [dbar]', 'Temperature [°C]', 'Calanus finmarchicus'];
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 0.5, 0.6, 11, 4], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 10.4, 10.5, 10.5, 2]];
    const r = run([BIO(), sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true }, edit: { 'Calanus finmarchicus': { kind: 'taxon', header: true }, 'Pressure, 2 [dbar]': { kind: 'pressure', unit: 'dbar' } } })]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED' && x.sheet === 'CTD')!;
    expect(f.params.columns).toBe('Pressure, 2 [dbar], Calanus finmarchicus');
    for (const id of ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-SPLIT-UNDECIDED', 'CONV-DEVICE-MISSING']) expect(rules(r).filter((x) => x === id).length, id).toBeLessThanOrEqual(0);
    // only the first pressure column is written
    expect(r.measurements.filter((m) => m.role === 'pressure').map((m) => m.measurementValue)).toEqual(['0.5', '10.4']);
    // a pressure column of a BIOLOGY sheet is still not written, and still said
    const bioHeader = [...W1_HEADER, 'Pressure [dbar]'];
    const bio = sheetInput(fileOf(bioHeader, W1_ROWS.map((x) => [...x, 5]), 'BIO', { fileName: 'bio.csv' }), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } });
    const rb = run([bio]);
    expect(rb.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED')!.params.columns).toBe('Pressure [dbar]');
    expect(rb.measurements.some((m) => m.role === 'pressure')).toBe(false);
  });

  it('a profile sheet with an unreadable text cell in a variable reports it like any number cell, and writes nothing for it', () => {
    const rows: Cell[][] = [['CR1', 'S1', 55.5, 2.5, '2023-06-14', 0, 'n/a-ish', 34], ['CR1', 'S1', 55.5, 2.5, '2023-06-14', 10, 10.5, 'NA']];
    const r = run([BIO(), CTD({}, rows)]);
    expect(rules(r)).toContain('ROW-NON-NUMERIC');
    expect(r.measurements.filter((m) => m.role === 'variable').map((m) => [m.target.id, m.measurementType])).toEqual([['CR1:S1:0', 'salinity'], ['CR1:S1:10', 'temperature']]);
  });
});

/* ---- the suggestion ---- */

describe('the profile suggestion (low confidence, never applied)', () => {
  const sug = (header: string[], rows: Cell[][]): boolean => suggestConvertProfile(mappingOf(fileOf(header, rows)).columns);
  it('a sheet with a station, a depth or a pressure and measured variables, and no taxon or quantity column, is suggested', () => {
    expect(sug(CTD_H, CTD_ROWS)).toBe(true);
    expect(sug(CTDP_H, CTDP_ROWS)).toBe(true);
  });
  it('a biology sheet, or a sheet without a station or without a variable, is not', () => {
    expect(sug(W1_HEADER, W1_ROWS)).toBe(false);
    expect(sug(['Depth [m]', 'Temperature [°C]'], [[1, 2]])).toBe(false);
    expect(sug(['Station', 'Depth [m]'], [['S1', 2]])).toBe(false);
    expect(sug(['Station', 'Temperature [°C]'], [['S1', 2]])).toBe(false);
    // an unknown numeric column is a possible species: a CTD sheet with one is not suggested (it costs one tick)
    expect(sug([...CTD_H, 'Fluorescence mystery'], CTD_ROWS.map((r) => [...r, 3]))).toBe(false);
  });
  it('the converter never sets the mark itself: a sheet is a profile sheet only when its input says so', () => {
    const r = run([sheetInput(fileOf(CTD_H, CTD_ROWS, 'CTD', { fileName: 'ctd.csv' }))]);
    expect(r.profile.sheets).toBe(0);
    expect(r.events.some((e) => e.eventType === 'profile level')).toBe(false);
  });
});

/* ---- verified concepts ---- */

describe('PRESPR01 and UPDB', () => {
  const doc = readFileSync(join(__dirname, '..', '..', 'docs', 'research', 'qc-sources.md'), 'utf8');
  const section = doc.slice(doc.indexOf('Converter (/convert) — stage 6 verification'));

  it('are the list the research section opened, in the URI form BioCheck joins on, and not the deprecated or species-specific ones', () => {
    expect(section.length).toBeGreaterThan(500);
    expect([...PRESSURE_VERIFIED_CODES]).toEqual(['P01/PRESPR01', 'P06/UPDB']);
    for (const c of PRESSURE_VERIFIED_CODES) expect(section, c).toContain(c.split('/')[1]);
    expect(PRESSURE.type.uri).toBe('http://vocab.nerc.ac.uk/collection/P01/current/PRESPR01/');
    expect(PRESSURE.unit.uri).toBe('http://vocab.nerc.ac.uk/collection/P06/current/UPDB/');
    expect(section).toContain(PRESSURE.type.label);
    // they are no part of the stage 0 or stage 5 lists, which stay exactly as they were
    expect(Object.values(P01).map((t) => t.code)).not.toContain('PRESPR01');
    expect(Object.values(P06).map((t) => t.code)).not.toContain('UPDB');
  });
});

/* ---- the profile texts ---- */

describe('the profile texts of two rules', () => {
  it('exist in four languages, stay short, and leave no placeholder behind', () => {
    for (const [id, v] of Object.entries(PROFILE_VARIANTS)) {
      for (const lang of LANGS) {
        expect(v.plain[lang].length, `${id} ${lang}`).toBeLessThanOrEqual(520);
        expect(v.plain[lang].length, `${id} ${lang}`).toBeGreaterThan(40);
      }
    }
    const missing = makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: 'f.csv', sheet: 'S', lines: [2, 3], params: { count: 2, column: 'none', profile: 'yes' } });
    const dup = makeConvertFinding('CONV-ID-DUPLICATE', { file: 'f.csv', sheet: 'S', value: 'CR1:S1:10', lines: [2, 4], params: { kind: 'level', count: 1, hint: 'x', used: 'depth, pressure' } });
    for (const f of [missing, dup]) {
      for (const lang of LANGS) expect(renderConvertPlain(f, lang), `${f.ruleId} ${lang}`).not.toMatch(/\{[A-Za-z_+]/);
      expect(renderConvertTechnical(f)).not.toMatch(/\{[A-Za-z_]/);
    }
    // the generic text is unchanged for a biology sample
    const generic = makeConvertFinding('CONV-SAMPLE-CODE-MISSING', { file: 'f.csv', sheet: 'S', lines: [2, 3], params: { count: 2, column: 'none' } });
    expect(renderConvertPlain(generic, 'en')).toContain('proposed codes');
    const genericDup = makeConvertFinding('CONV-ID-DUPLICATE', { file: 'f.csv', sheet: 'S', value: 'x', lines: [2], params: { kind: 'event', count: 1, hint: 'h' } });
    expect(renderConvertPlain(genericDup, 'en')).toContain('station prefix');
    // the Polish plural of the new rules agrees with the number
    const one = makeConvertFinding('CONV-PROFILE-NO-STATION', { sheet: 'S', lines: [2], params: { count: 1, column: 'none' } });
    const few = makeConvertFinding('CONV-PROFILE-NO-STATION', { sheet: 'S', lines: [2, 3], params: { count: 2, column: 'none' } });
    const many = makeConvertFinding('CONV-PROFILE-NO-STATION', { sheet: 'S', lines: [2, 3, 4, 5, 6], params: { count: 5, column: 'none' } });
    expect(renderConvertPlain(one, 'pl')).toContain('1 wiersz profilu nie ma');
    expect(renderConvertPlain(few, 'pl')).toContain('2 wiersze profilu nie mają');
    expect(renderConvertPlain(many, 'pl')).toContain('5 wierszy profilu nie ma');
  });
});

/* ---- the companion file ---- */

describe('the companion file keeps the profile mark and the approval as settings, read back as pre-ticks', () => {
  it('writes one (setting) row per sheet and reads them back; nothing else is read from them', () => {
    const text = writeConvertSidecar({ profileSheets: ['CTD', 'Bottle data'], profileDepthIds: ['CTD'] });
    expect(text).toContain('(setting),profile=CTD');
    expect(text).toContain('(setting),profile=Bottle data');
    expect(text).toContain('(setting),profileDepthIds=CTD');
    const s = readConvertSettings(textFile('c.sidecar.csv', text))!;
    expect(s).toMatchObject({ fullList: false, prefixStation: false, worms: false, nvs: false, profileSheets: ['CTD', 'Bottle data'], profileDepthIds: ['CTD'] });
  });

  it('a file without them reads exactly as before (the fields are absent, not empty)', () => {
    const s = readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ fullList: true })))!;
    expect(s).toEqual({ fullList: true, prefixStation: false, worms: false, nvs: false });
    expect(Object.keys(s)).not.toContain('profileSheets');
  });

  it('keeps a bounded number of short names, ignores an empty or overlong one, and tolerates a name with a comma, a quote and an equals sign', () => {
    const names = Array.from({ length: 300 }, (_, i) => `S${i}`);
    const s = readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ profileSheets: [...names, 'x'.repeat(300), ''] })))!;
    expect(s.profileSheets).toHaveLength(100);
    expect(s.profileSheets![0]).toBe('S0');
    const odd = readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ profileSheets: ['a, "b"=c'] })))!;
    expect(odd.profileSheets).toEqual(['a, "b"=c']);
  });

  it('is only a pre-tick: the core never reads it, so the conversion of the same sheets is the same with or without it', () => {
    const s = readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ profileSheets: ['CTD'], profileDepthIds: ['CTD'] })))!;
    expect(s.profileSheets).toEqual(['CTD']);
    const plain = run([BIO(), sheetInput(fileOf(CTD_H, CTD_ROWS, 'CTD', { fileName: 'ctd.csv' }))]);
    expect(plain.events.some((e) => e.eventType === 'profile level')).toBe(false);
  });
});

/* ---- performance ---- */

describe('a long profile file', () => {
  it('50 000 rows (50 stations of 1000 levels) convert, validate and write in a few seconds, and the summaries stay small', async () => {
    const stations = 50;
    const levels = 1000;
    const bioH = ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bottom [m]', 'Volume filtered [m3]', 'Calanus finmarchicus'];
    const bioRows: Cell[][] = [];
    const ctdRows: Cell[][] = [];
    for (let s = 1; s <= stations; s++) {
      bioRows.push(['CR1', `S${s}`, `S${s}-a`, '2023-06-14', 55 + s / 100, 2 + s / 100, 0, 50, 12, s]);
      for (let d = 1; d <= levels; d++) ctdRows.push(['CR1', `S${s}`, 55 + s / 100, 2 + s / 100, '2023-06-14', d, 10 + d / 1000, 34 + d / 5000, d + 0.4]);
    }
    const bio = sheetInput(fileOf(bioH, bioRows, 'BIO', { fileName: 'bio.csv' }), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } });
    const ctd = sheetInput(fileOf([...CTD_H, 'Pressure [dbar]'], ctdRows, 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } });
    const t0 = Date.now();
    const r = convert({ sheets: [bio, ctd], options: {}, approvedSplits: {} });
    const t1 = Date.now();
    expect(r.events.length).toBe(1 + stations + stations + stations * levels);
    expect(r.tree.levels).toBe(50000);
    expect(r.measurements.length).toBe(stations * levels * 3 + stations * 3);
    expect(r.profile.stationsMatched).toBe(50);
    expect(r.profile.stationsUnmatched).toBe(0);
    const ds = toDataset(r, META, { fullList: false, prefixStation: false, worms: false, nvs: false });
    const found = validateTables(ds, r.findings, { today: TODAY });
    const t2 = Date.now();
    expect(judge([...r.findings, ...found]).blocking).toEqual([]);
    const zip = await buildZip(archiveFiles(ds, '<eml/>'), nodeDeflate);
    const t3 = Date.now();
    expect(zip.length).toBeGreaterThan(100000);
    // a generous bound: the point is "no O(n^2)", which would take minutes at this size (measured: well under 2 s each on the development machine)
    expect(t1 - t0, 'convert').toBeLessThan(10000);
    expect(t2 - t1, 'validate').toBeLessThan(15000);
    expect(t3 - t2, 'archive').toBeLessThan(15000);
    // the station derives from its 1000 levels without sorting them again and again: its extent is the extent of the levels
    const s1 = r.events.find((e) => e.id === 'CR1:S1')!;
    expect([s1.depthMin, s1.depthMax]).toEqual([0, 1000]);
  }, 120000);
});

/* ---- review fixes: the formats of the IDs, a row with only a pressure, a flattened station, normalised numbers, texts by kind ---- */

describe('depth and pressure IDs', () => {
  const H = ['Cruise', 'Station', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Pressure [dbar]', 'Temperature [°C]'];
  const sheet = (rows: Cell[][], extra: Partial<ConvertSheetInput> = {}, header = H, dc = false): ConvertSheetInput =>
    sheetInput(fileOf(header, rows, 'CTD', { fileName: 'ctd.csv', decimalComma: dc }), { profile: { depthIds: true }, ...extra });
  const base = (depth: Cell, pressure: Cell, station = 'S2'): Cell[] => ['CR1', station, 55.9, 3.1, '2023-06-16', depth, pressure, 11];

  it('a depth ID is <station>:<depth>, a pressure ID is <station>:<pressure>dbar: 5 m and 5 dbar at one station are two levels, not a collision', () => {
    const r = run([BIO(), sheet([base(5, null)]), sheetInput(fileOf(CTDP_H, [CTDP_ROWS[0]], 'P', { fileName: 'p.csv' }), { profile: { depthIds: true } })]);
    expect(ids(r, 'profile level')).toEqual(['CR1:S2:5', 'CR1:S2:5dbar']);
    expect(rules(r)).not.toContain('CONV-ID-DUPLICATE');
  });

  it('per row: the depth when it reads as a number, otherwise the pressure (with dbar), and the pressure is an eMoF row either way', () => {
    const r = run([BIO(), sheet([base(0, 0.2), base(null, 10.1), base('NA', 20.3), base(30, 'x')])]);
    expect(ids(r, 'profile level')).toEqual(['CR1:S2:0', 'CR1:S2:10.1dbar', 'CR1:S2:20.3dbar', 'CR1:S2:30']);
    const lvl = r.events.find((e) => e.id === 'CR1:S2:10.1dbar')!;
    expect([lvl.depthMin, lvl.depthMax]).toEqual([undefined, undefined]);
    expect(r.measurements.filter((m) => m.role === 'pressure').map((m) => [m.target.id, m.measurementValue])).toEqual([['CR1:S2:0', '0.2'], ['CR1:S2:10.1dbar', '10.1'], ['CR1:S2:20.3dbar', '20.3']]);
    expect(rules(r)).not.toContain('CONV-SAMPLE-CODE-MISSING');
  });

  it('a row with neither a readable depth nor a readable pressure is blocked, and a pressure that is not in decibars gives no ID', () => {
    const none = run([BIO(), sheet([base(0, 0.2), base(null, null), base('NA', 'x')])]);
    const f = none.findings.find((x) => x.ruleId === 'CONV-SAMPLE-CODE-MISSING')!;
    expect(f.lines).toEqual([3, 4]);
    expect(f.params.profile).toBe('yes');
    expect(ids(none, 'profile level')).toEqual(['CR1:S2:0']);
    const bar = run([BIO(), sheet([base(null, 0.5)], {}, H.map((h) => (h === 'Pressure [dbar]' ? 'Pressure [bar]' : h)))]);
    expect(ids(bar, 'profile level')).toEqual([]);
    expect(rules(bar)).toContain('CONV-SAMPLE-CODE-MISSING');
    expect(renderConvertPlain(f, 'en')).toContain('pressure in decibars');
  });

  it('the same number written another way is the same depth: 10 and 10.0, a number cell and a text cell, are caught as repeated casts; the ID text turns a decimal comma into a point', () => {
    const dup = run([BIO(), sheet([base(10, null), base('10.0', null), base(10, null, 'S1')])]);
    const f = dup.findings.filter((x) => x.ruleId === 'CONV-ID-DUPLICATE');
    expect(f.map((x) => [x.value, x.lines, x.params.kind, x.params.used])).toEqual([['CR1:S2:10', [2, 3], 'level', 'depth']]);
    expect(ids(dup, 'profile level')).toEqual(['CR1:S2:10', 'CR1:S1:10']);
    const comma = run([BIO(), sheet([['CR1', 'S2', '55,9', '3,1', '2023-06-16', '10,5', null, '11,0'], ['CR1', 'S2', '55,9', '3,1', '2023-06-16', '10,50', null, '11,1']], {}, H, true)]);
    expect(rules(comma)).toContain('CONV-ID-DUPLICATE');
    expect(ids(comma, 'profile level')).toEqual(['CR1:S2:10.5']);
    const num = run([BIO(), sheet([base(10.5, null), base(12.25, null)])]);
    expect(ids(num, 'profile level')).toEqual(['CR1:S2:10.5', 'CR1:S2:12.25']);
  });

  it('a code equal to a depth ID is still a collision, and the text names both sources', () => {
    const header = ['Cruise', 'Station', 'Code', 'Latitude', 'Longitude', 'Date', 'Depth [m]', 'Temperature [°C]'];
    const s1 = sheetInput(fileOf(header, [['CR1', 'S2', '10', 55.9, 3.1, '2023-06-16', 3, 11]], 'A', { fileName: 'a.csv' }), { profile: {}, edit: { Code: { kind: 'sampleId' } } });
    const s2 = sheetInput(fileOf(CTD_H, [['CR1', 'S2', 55.9, 3.1, '2023-06-16', 10, 11, 34]], 'B', { fileName: 'b.csv' }), { profile: { depthIds: true } });
    const r = run([BIO(), s1, s2]);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-ID-DUPLICATE');
    expect(f.map((x) => [x.file, x.params.kind, x.params.used])).toEqual([['a.csv', 'level', 'code'], ['b.csv', 'level', 'depth']]);
    expect(renderConvertPlain(f[0], 'en')).toContain('made of: code');
    expect(renderConvertPlain(f[1], 'pl')).toContain('głębokość');
    // one sheet that holds both rows names both in line order
    const mixed = run([BIO(), sheetInput(fileOf(['Cruise', 'Station', 'Code', 'Depth [m]', 'Temperature [°C]', 'Latitude', 'Longitude', 'Date'], [['CR1', 'S2', '10', 4, 11, 55.9, 3.1, '2023-06-16']], 'C', { fileName: 'c.csv' }), { profile: {}, edit: { Code: { kind: 'sampleId' } } })]);
    expect(rules(mixed)).not.toContain('CONV-ID-DUPLICATE');
  });

  it('a level ID equal to the ID of a station is said in the profile text, without the station prefix advice', () => {
    const header = ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Depth top [m]', 'Depth bottom [m]', 'Volume filtered [m3]', 'Calanus finmarchicus'];
    const bio = sheetInput(fileOf(header, [['CR1', 'A:5', 'k1', '2023-06-14', 55.5, 2.5, 0, 50, 12, 4]], 'BIO', { fileName: 'bio.csv' }), { quantity: W1_QUANTITY, device: { kind: 'known', key: 'multinet' } });
    const ctd = sheetInput(fileOf(CTD_H, [['CR1', 'A', 55.5, 2.5, '2023-06-14', 5, 11, 34]], 'CTD', { fileName: 'ctd.csv' }), { profile: { depthIds: true } });
    const r = run([bio, ctd]);
    const f = r.findings.filter((x) => x.ruleId === 'CONV-ID-DUPLICATE');
    expect(f.map((x) => [x.value, x.params.kind, x.params.used])).toEqual([['CR1:A:5', 'level-other', 'depth, station']]);
    for (const lang of LANGS) expect(renderConvertPlain(f[0], lang)).not.toMatch(/prefix|prefiks|Präfix|préfixe|poprzedz/i);
    expect(renderConvertTechnical(f[0])).not.toContain('prefix the station');
  });
});

describe('a flattened station level', () => {
  const NO_POS_H = ['Cruise', 'Station', 'Depth [m]', 'Temperature [°C]'];
  it('a level without its own date or position is blocked, not given the cruise midpoint and range; with its own it is fine; kept stations still lend theirs', () => {
    const rows: Cell[][] = [['CR1', 'S1', 0, 11], ['CR1', 'S1', 10, 10.5]];
    const flat = run([BIO(), CTD({}, rows, NO_POS_H)], { flatten: { station: true } });
    const f = flat.findings.find((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')!;
    expect(f.lines).toEqual([2, 3]);
    expect(f.params.what).toBe('date and position');
    expect(judge(flat.findings).blocking.map((x) => x.ruleId)).toContain('CONV-PROFILE-LEVEL-INCOMPLETE');
    expect(renderConvertTechnical(f)).toContain('flattened');
    // the same rows with the station kept inherit from the matched station
    const kept = run([BIO(), CTD({}, rows, NO_POS_H)]);
    expect(kept.findings.some((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')).toBe(false);
    // levels with their own position and date are fine either way
    const own = run([BIO(), CTD()], { flatten: { station: true } });
    expect(own.findings.some((x) => x.ruleId === 'CONV-PROFILE-LEVEL-INCOMPLETE')).toBe(false);
  });
});

describe('texts of the review fixes', () => {
  it('a long list of unmatched stations shows the first twenty and the count of the rest; the finding keeps the whole list', () => {
    const names = Array.from({ length: 45 }, (_, i) => `CR1:X${i + 1}`);
    const f = makeConvertFinding('CONV-PROFILE-STATION-UNMATCHED', { file: 'f.csv', sheet: 'S', value: names[0], params: { count: names.length, names: names.join(', ') } });
    expect(f.params.names).toBe(names.join(', '));
    for (const lang of LANGS) {
      const text = renderConvertPlain(f, lang);
      expect(text).toContain('CR1:X20');
      expect(text).not.toContain('CR1:X21');
      expect(text).toContain('(+25)');
    }
    const few = makeConvertFinding('CONV-PROFILE-STATION-UNMATCHED', { file: 'f.csv', sheet: 'S', value: 'a', params: { count: 3, names: 'a, b, c' } });
    expect(renderConvertPlain(few, 'en')).toContain('a, b, c');
    expect(renderConvertPlain(few, 'en')).not.toContain('(+');
  });

  it('Polish CONV-PROFILE-LEVEL-INCOMPLETE agrees with its words ("jej", never "ich" after a singular)', () => {
    for (const what of ['date', 'position', 'date and position']) {
      const f = makeConvertFinding('CONV-PROFILE-LEVEL-INCOMPLETE', { sheet: 'S', lines: [2, 3], params: { count: 2, what } });
      const t = renderConvertPlain(f, 'pl');
      expect(t).toContain('a stacja też jej nie ma');
      expect(t).not.toContain(' ich ');
    }
  });
});

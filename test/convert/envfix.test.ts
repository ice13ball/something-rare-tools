// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The defects a local run of /convert found on a private environmental data set, each reproduced on an INVENTED file of test/fixtures/convert-env (same patterns, invented values):
// parse-level findings, an environmental-only upload, sediment and porewater depth, a declared P01 code, quality columns, revisited stations, roles that an environmental sheet gets
// wrong, a sheet with no station column, oxygen saturation, and the small ones. Nothing here reads a real file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput, ProfileDeclaration } from '../../src/core/convert/build';
import { buildTables, writeMetaXml } from '../../src/core/convert/dwca';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { toDataset } from '../../src/core/convert/model';
import { dimensionlessUnitFor, readDecision, suggestType, suggestUnit, unitContradictsConcept, verifiedConcept } from '../../src/core/convert/nerc';
import type { NercDecisions } from '../../src/core/convert/nerc';
import { judge, policyOf } from '../../src/core/convert/policy';
import { isQualityHeader, proposeConvertColumns, suggestConvertProfile } from '../../src/core/convert/recognize';
import { isPlainDepthName, isSeafloorName, isSiteDepthName, seafloorMetres, seafloorUnitOf } from '../../src/core/convert/seafloor';
import { validateTables } from '../../src/core/convert/validate';
import { VARIABLE_CONCEPTS } from '../../src/core/convert/vocab';
import { makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import type { ColumnProposal, ColumnRole, Finding, SheetMapping } from '../../src/core/types';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { rawSheet } from '../helpers/files';

const DIR = join(__dirname, '..', 'fixtures', 'convert-env');
const bytes = (name: string): Uint8Array => new Uint8Array(readFileSync(join(DIR, name)));

/** A fixture through the converter's own reading and column proposals (the worker's `parse`), and its first sheet as a conversion input. */
async function load(name: string): Promise<{ parsed: ConvertParseResult; mapping: SheetMapping; proposals: ColumnProposal[]; input: (extra?: Partial<ConvertSheetInput>, edit?: Record<string, ColumnRole>) => ConvertSheetInput }> {
  const eng = createDirectConvertEngine();
  const parsed = await eng.parse([{ name, bytes: bytes(name) }] as never);
  expect(parsed.problems).toEqual([]);
  const f = parsed.files[0];
  const mapping = f.mappings[0];
  // the worker keeps the parsed file; the tests read it again through the same core function the worker uses
  return {
    parsed,
    mapping,
    proposals: f.proposals[mapping.sheet],
    input: (extra = {}, edit = {}) => ({
      file: parseAgain(name),
      sheet: mapping.sheet,
      mapping: { ...mapping, columns: mapping.columns.map((c) => (edit[c.header] ? { ...c, role: edit[c.header] } : c)) },
      shape: f.suggestedShapes[mapping.sheet] ?? 'wide',
      ...extra,
    }),
  };
}

import { readConvertFile } from '../../src/core/convert/read';
import { parseFile } from '../../src/core/parse';
const parseAgain = (name: string) => readConvertFile(parseFile(name, bytes(name)));

const rulesOf = (r: { findings: Finding[] }): string[] => r.findings.map((f) => f.ruleId);
const roleOf = (ps: ColumnProposal[], header: string): ColumnRole => ps.find((p) => p.header === header)!.role;
const reasonOf = (ps: ColumnProposal[], header: string): string | undefined => ps.find((p) => p.header === header)!.reasonCode;
const PROFILE: ProfileDeclaration = { depthIds: true };

describe('1. parse-level findings reach /convert (f1: a ragged row)', () => {
  it('the ragged row blocks the sheet, names its line, and is not converted', async () => {
    const f1 = await load('f1-ragged-row.csv');
    const r = convert({ sheets: [f1.input({ profile: PROFILE })] });
    const rag = r.findings.find((f) => f.ruleId === 'ROW-RAGGED')!;
    expect(rag).toBeTruthy();
    expect(rag.lines).toEqual([5]);
    expect(rag.sheet).toBe('f1-ragged-row.csv');
    expect(policyOf(rag)).toBe('block');
    expect(judge(r.findings).blocking.map((f) => f.ruleId)).toContain('ROW-RAGGED');
    expect(r.ok).toBe(false);
    // the misaligned row (its values shifted one column) is not written: 4 of the 5 rows are levels, and none of them holds the shifted 58
    expect(r.events.filter((e) => e.eventType === 'profile level')).toHaveLength(4);
    expect(r.measurements.map((m) => m.measurementValue)).not.toContain('58');
    expect(r.measurements.map((m) => m.source.line)).not.toContain(5);
  });

  it('is said on a biology sheet too, with the rows left out', () => {
    const header = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'];
    const text = `${header.join(',')}\nS1,S1-a,55.5,2.5,2023-06-14,3\nS1,S1-b,55.5,2.5,2023-06-14,3,9\n`;
    const file = readConvertFile(parseFile('bio.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', quantity: { kind: 'count' } }] });
    expect(rulesOf(r)).toContain('ROW-RAGGED');
    expect(r.ok).toBe(false);
    expect(r.occurrences.map((o) => o.source.line)).toEqual([2]);
  });

  it('other parse findings are shown (a decimal comma is information, never a block), once per file', async () => {
    const f8 = await load('f8-decimal-comma.csv');
    const r = convert({ sheets: [f8.input({ profile: PROFILE })] });
    const inF = r.findings.filter((f) => f.ruleId.startsWith('IN-'));
    expect(inF.map((f) => f.ruleId)).toEqual(['IN-DECIMAL-COMMA']);
    expect(policyOf(inF[0])).toBe('show');
  });

  it('a clean file raises nothing at parse level', async () => {
    const f10 = await load('f10-env-only-small.csv');
    expect(rulesOf(convert({ sheets: [f10.input({ profile: PROFILE })] })).filter((id) => id.startsWith('IN-') || id === 'ROW-RAGGED')).toEqual([]);
  });
});

describe('2. an environmental-only upload (f10, f11)', () => {
  it('ends on CONV-NO-OCCURRENCES, not on missing Darwin Core terms', async () => {
    const f10 = await load('f10-env-only-small.csv');
    const r = convert({ sheets: [f10.input({ profile: PROFILE })] });
    const dataset = toDataset(r, EMPTY_METADATA, { fullList: false, prefixStation: false, worms: false, nvs: false });
    const findings = [...r.findings, ...validateTables(dataset, r.findings)];
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain('CONV-NO-OCCURRENCES');
    expect(ids).not.toContain('DWC-TERM-MISSING');
    expect(policyOf(findings.find((f) => f.ruleId === 'CONV-NO-OCCURRENCES')!)).toBe('block');
    expect(r.ok).toBe(false);
  });

  it('the same without the profile mark: the sheet has no taxon, and it is the same message that stands', async () => {
    const f10 = await load('f10-env-only-small.csv');
    const r = convert({ sheets: [f10.input()] });
    const ids = rulesOf(r);
    expect(ids).toContain('CONV-NO-OCCURRENCES');
    expect(ids).toContain('CONV-NO-TAXON');
  });

  it('is said in four languages, names OBIS and tells what to add, and cites the OBIS manual', () => {
    const f = makeConvertFinding('CONV-NO-OCCURRENCES', { file: 'a.csv', sheet: 'a' });
    const t = Object.fromEntries(LANGS.map((l) => [l, renderConvertPlain(f, l)]));
    expect(t.en).toContain('OBIS');
    expect(t.en).toContain('Environmental data alone is not an OBIS dataset');
    expect(t.pl).toMatch(/OBIS publikuje rekordy gatunków/);
    expect(t.de).toMatch(/OBIS veröffentlicht Artnachweise/);
    expect(t.fr).toMatch(/OBIS publie des enregistrements d'espèces/);
    for (const l of LANGS) expect(t[l]).not.toMatch(/eventDate|decimalLatitude/);
    expect(renderConvertTechnical(f)).toContain('0 occurrence');
  });

  it('a profile sheet that gives no level says that nothing was read (f11: a description of columns)', async () => {
    const f11 = await load('f11-docs-sheet.csv');
    const r = convert({ sheets: [f11.input({ profile: PROFILE })] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-PROFILE-NOTHING-READ')!;
    expect(f).toBeTruthy();
    expect(f.params.rows).toBe(2);
    expect(policyOf(f)).toBe('block');
    expect(renderConvertPlain(f, 'en')).toContain('Nothing was read from sheet');
    for (const l of LANGS) expect(renderConvertPlain(f, l)).toContain('f11-docs-sheet.csv');
    expect(rulesOf(r)).toContain('CONV-NO-OCCURRENCES');
  });

  it('a sheet name that is not in the file is still skipped quietly (no occurrence message for nothing)', () => {
    expect(convert({ sheets: [] }).findings).toEqual([]);
  });
});

describe('3. depth of the sediment and of the porewater (f3)', () => {
  it('the converter recognises Depth_cm of a porewater sheet, the site depth, and nothing else as a depth below the seafloor', async () => {
    const f3 = await load('f3-porewater-cm.csv');
    expect(roleOf(f3.proposals, 'Depth_cm')).toEqual({ kind: 'depthBelowSeafloor', unit: 'cm' });
    expect(reasonOf(f3.proposals, 'Depth_cm')).toBe('seafloor-depth-cm');
    // the water depth of the site is the plain depth (metres), and no longer a species candidate
    expect(roleOf(f3.proposals, 'Site_depth_m')).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    expect(f3.proposals.some((p) => p.role.kind === 'taxon')).toBe(false);
    expect(f3.parsed.files[0].suggestedProfiles['f3-porewater-cm.csv']).toBe(true);
  });

  it('writes the depth below the seafloor as a negative distance in metres, from the TEXT (no float), and the site depth as the depth', async () => {
    const f3 = await load('f3-porewater-cm.csv');
    const r = convert({ sheets: [f3.input({ profile: PROFILE })] });
    expect(r.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId)).toEqual(['CONV-NO-OCCURRENCES']);
    const ds = toDataset(r, EMPTY_METADATA, { fullList: false, prefixStation: false, worms: false, nvs: false });
    const t = buildTables(ds);
    const h = t.event.columns.map((c) => c.header);
    const lv = t.event.rows.filter((row) => row[h.indexOf('eventType')] === 'profile level');
    expect(lv.map((row) => row[h.indexOf('minimumDistanceAboveSurfaceInMeters')])).toEqual(['-0.005', '-0.015', '-0.025', '-0.005', '-0.015']);
    expect(lv.map((row) => row[h.indexOf('maximumDistanceAboveSurfaceInMeters')])).toEqual(['-0.005', '-0.015', '-0.025', '-0.005', '-0.015']);
    expect(lv.map((row) => row[h.indexOf('minimumDepthInMeters')])).toEqual(['45', '45', '45', '60', '60']);
    expect(lv.map((row) => row[h.indexOf('maximumDepthInMeters')])).toEqual(['45', '45', '45', '60', '60']);
    // the level IDs carry the unit of the sediment depth, so they never equal a plain depth or a numeric sample code
    expect(lv.map((row) => row[h.indexOf('eventID')])).toEqual(['ZP1:0.5cmbsf', 'ZP1:1.5cmbsf', 'ZP1:2.5cmbsf', 'ZP2:0.5cmbsf', 'ZP2:1.5cmbsf']);
    // the parent station has a depth (derived from its levels) and no distance
    const st = t.event.rows.filter((row) => row[h.indexOf('eventType')] === 'station');
    expect(st.map((row) => row[h.indexOf('minimumDistanceAboveSurfaceInMeters')])).toEqual(['', '']);
    expect(ds.measurements).toHaveLength(15);
  });

  it('meta.xml maps the two columns to the Darwin Core terms of those names', async () => {
    const f3 = await load('f3-porewater-cm.csv');
    const r = convert({ sheets: [f3.input({ profile: PROFILE })] });
    const ds = toDataset(r, EMPTY_METADATA, { fullList: false, prefixStation: false, worms: false, nvs: false });
    const meta = writeMetaXml(buildTables(ds));
    expect(meta).toContain('term="http://rs.tdwg.org/dwc/terms/minimumDistanceAboveSurfaceInMeters"');
    expect(meta).toContain('term="http://rs.tdwg.org/dwc/terms/maximumDistanceAboveSurfaceInMeters"');
    expect(meta).toContain('term="http://rs.tdwg.org/dwc/terms/minimumDepthInMeters"');
  });

  it('the cm to m step is an exact decimal shift of the text: every digit kept, no rounding, no float', () => {
    const cm = (t: string) => seafloorMetres(t, 'cm');
    expect(cm('0.5')).toEqual({ ok: true, text: '-0.005' });
    expect(cm('12.30')).toEqual({ ok: true, text: '-0.1230' });
    expect(cm('150')).toEqual({ ok: true, text: '-1.50' });
    expect(cm('1')).toEqual({ ok: true, text: '-0.01' });
    expect(cm('100')).toEqual({ ok: true, text: '-1.00' });
    expect(cm('7.123456789')).toEqual({ ok: true, text: '-0.07123456789' });
    expect(cm('0.1')).toEqual({ ok: true, text: '-0.001' });
    expect(cm('0.3')).toEqual({ ok: true, text: '-0.003' }); // 0.3 / 100 in a float is 0.003 but 0.07 * 100 style sums are not exact: never computed
    expect(cm('+5')).toEqual({ ok: true, text: '-0.05' });
    expect(cm('0')).toEqual({ ok: true, text: '0' });
    expect(cm('0.00')).toEqual({ ok: true, text: '0' });
    expect(cm('.5')).toEqual({ ok: true, text: '-0.005' });
    expect(cm('5.')).toEqual({ ok: true, text: '-0.05' });
    expect(seafloorMetres('2.5', 'm')).toEqual({ ok: true, text: '-2.5' });
    expect(seafloorMetres('0', 'm')).toEqual({ ok: true, text: '0' });
    // a negative depth below the seafloor, and a number with no exact plain text, are refused (not guessed)
    expect(cm('-3')).toEqual({ ok: false, reason: 'negative' });
    expect(cm('1e-2')).toEqual({ ok: false, reason: 'notation' });
    expect(seafloorMetres(undefined, 'cm')).toEqual({ ok: false, reason: 'notation' });
    // for a thousand random plain numbers: shifting the text is the same as exact decimal division by 100 (checked with BigInt)
    let seed = 12345;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 1000; i++) {
      const whole = Math.floor(rnd() * 1000);
      const frac = Array.from({ length: Math.floor(rnd() * 6) }, () => Math.floor(rnd() * 10)).join('');
      const text = frac === '' ? String(whole) : `${whole}.${frac}`;
      const out = cm(text);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      const digits = BigInt(`${whole}${frac}`);
      const back = out.text === '0' ? 0n : BigInt(out.text.replace('-', '').replace('.', ''));
      // text -> same digits, decimal point two places further left, and a minus sign
      expect(back === digits || digits === 0n, `${text} -> ${out.text}`).toBe(true);
      if (digits !== 0n) {
        expect(out.text.startsWith('-')).toBe(true);
        const placesBefore = frac.length;
        const placesAfter = (out.text.split('.')[1] ?? '').length;
        expect(placesAfter, `${text} -> ${out.text}`).toBe(placesBefore + 2);
      }
    }
  });

  it('a column whose numbers are negative below the seafloor counts upwards: the sign is kept, the proposal says so, and the user can change the direction', async () => {
    const text = 'Site_ID,Date,Latitude,Longitude,Site_depth_m,Pore_water_Depth[cm],Cl_mg_l\nZN1,2020-05-01,70.1,20.2,45,0,10100\nZN1,2020-05-01,70.1,20.2,45,-0.5,10200\nZN1,2020-05-01,70.1,20.2,45,-12.30,10300\n';
    const file = readConvertFile(parseFile('zn.csv', new TextEncoder().encode(text)));
    const props = proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false });
    const p = props.find((x) => x.header === 'Pore_water_Depth[cm]')!;
    expect(p.role).toEqual({ kind: 'depthBelowSeafloor', unit: 'cm', positive: 'up' });
    expect(p.reasonCode).toBe('seafloor-depth-negative');
    expect(p.confidence).toBe('low');
    const mapping = { sheet: file.sheets[0].name, columns: props.map((q) => ({ index: q.index, header: q.header, role: q.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: PROFILE }] });
    expect(r.findings.some((f) => f.ruleId === 'CONV-SEAFLOOR-VALUE')).toBe(false);
    const lv = r.events.filter((e) => e.eventType === 'profile level');
    expect(lv.map((e) => e.distanceText)).toEqual(['0', '-0.005', '-0.1230']);
    // the level IDs say "above the seafloor" (asf): a negative number written as it is, never mistaken for a depth below
    expect(lv.map((e) => e.id)).toEqual(['ZN1:0cmasf', 'ZN1:-0.5cmasf', 'ZN1:-12.30cmasf']);
    // the same sheet read as counted downwards: the negative numbers are refused, said once, naming the lines
    const down = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping: { ...mapping, columns: mapping.columns.map((c) => (c.header === 'Pore_water_Depth[cm]' ? { ...c, role: { kind: 'depthBelowSeafloor', unit: 'cm' } as ColumnRole } : c)) }, shape: 'wide', profile: PROFILE }] });
    expect(down.findings.find((f) => f.ruleId === 'CONV-SEAFLOOR-VALUE')!.lines).toEqual([3, 4]);
    // one negative number is the sheet's statement of its direction (a few rows above the seafloor are positive then); with no negative number the usual direction stands (the user decides)
    expect(proposeConvertColumns(rawSheet(['Site', 'Pore_water_Depth[cm]'], [['A', -1], ['A', 2]]), { decimalComma: false, date1904: false })[1].role).toEqual({ kind: 'depthBelowSeafloor', unit: 'cm', positive: 'up' });
    expect(proposeConvertColumns(rawSheet(['Site', 'Pore_water_Depth[cm]'], [['A', 0], ['A', 3]]), { decimalComma: false, date1904: false })[1].role).toEqual({ kind: 'depthBelowSeafloor', unit: 'cm' });
    expect(proposeConvertColumns(rawSheet(['Site', 'Pore_water_Depth[cm]'], [['A', 0], ['A', 0]]), { decimalComma: false, date1904: false })[1].role).toEqual({ kind: 'depthBelowSeafloor', unit: 'cm' });
    // the exact shift is the same upwards
    expect(seafloorMetres('-0.5', 'cm', 'up')).toEqual({ ok: true, text: '-0.005' });
    expect(seafloorMetres('2', 'm', 'up')).toEqual({ ok: true, text: '2' });
    expect(seafloorMetres('-2.50', 'm', 'up')).toEqual({ ok: true, text: '-2.50' });
    expect(seafloorMetres('0', 'cm', 'up')).toEqual({ ok: true, text: '0' });
    expect(seafloorMetres('-1', 'cm', 'down')).toEqual({ ok: false, reason: 'negative' });
  });

  it('the sheet name counts as context: a plain Depth in cm on a sheet named Porewater is a depth below the seafloor', () => {
    const sheet = rawSheet(['Station', 'Depth (cm)', 'Cl'], [['A', 5, 100]], 'Porewater');
    expect(proposeConvertColumns(sheet, { decimalComma: false, date1904: false })[1].role.kind).toBe('depthBelowSeafloor');
    expect(proposeConvertColumns({ ...sheet, name: 'CTD' }, { decimalComma: false, date1904: false })[1].role.kind).toBe('depth');
  });

  it('metres are only given their sign; any other unit, and no unit, block the column and write nothing from it', async () => {
    const f3 = await load('f3-porewater-cm.csv');
    const m = (unit: string | undefined): ColumnRole => ({ kind: 'depthBelowSeafloor', ...(unit === undefined ? {} : { unit }) });
    const m1 = convert({ sheets: [f3.input({ profile: PROFILE }, { Depth_cm: m('m') })] });
    expect(m1.events.filter((e) => e.eventType === 'profile level').map((e) => e.distanceText)).toEqual(['-0.5', '-1.5', '-2.5', '-0.5', '-1.5']);
    for (const unit of ['mm', 'ft', 'cmbsf', undefined]) {
      const r = convert({ sheets: [f3.input({ profile: PROFILE }, { Depth_cm: m(unit) })] });
      const f = r.findings.find((x) => x.ruleId === 'CONV-SEAFLOOR-UNIT')!;
      expect(f, String(unit)).toBeTruthy();
      expect(policyOf(f)).toBe('block');
      expect(r.events.every((e) => e.distanceText === undefined)).toBe(true);
    }
    expect(renderConvertPlain(convert({ sheets: [f3.input({ profile: PROFILE }, { Depth_cm: m(undefined) })] }).findings.find((x) => x.ruleId === 'CONV-SEAFLOOR-UNIT')!, 'pl')).toContain('brak');
    expect(seafloorUnitOf('CM')).toBe('cm');
    expect(seafloorUnitOf('Metres')).toBe('m');
    expect(seafloorUnitOf('mm')).toBeUndefined();
  });

  it('a depth below the seafloor with no site depth is an accepted warning, and a negative number is refused', async () => {
    const header = ['Site_ID', 'Date', 'Latitude', 'Longitude', 'Depth_cm', 'Cl_mg_l'];
    const rows = ['ZQ1,2020-05-01,70.1,20.2,0.5,10100', 'ZQ1,2020-05-01,70.1,20.2,-1.5,10200', 'ZQ1,2020-05-01,70.1,20.2,1e-2,10300'];
    const file = readConvertFile(parseFile('nosite.csv', new TextEncoder().encode(`${header.join(',')}\n${rows.join('\n')}\n`)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping: { ...mapping, columns: mapping.columns.map((c) => (c.header === 'Depth_cm' ? { ...c, role: { kind: 'depthBelowSeafloor', unit: 'cm' } as ColumnRole } : c)) }, shape: 'wide', profile: PROFILE }] });
    const site = r.findings.find((f) => f.ruleId === 'CONV-SEAFLOOR-NO-SITE-DEPTH')!;
    expect(site.lines).toEqual([2]);
    expect(policyOf(site)).toBe('accept');
    const vals = r.findings.filter((f) => f.ruleId === 'CONV-SEAFLOOR-VALUE');
    expect(vals.map((f) => [f.params.reason, f.lines])).toEqual([['negative', [3]], ['notation', [4]]]);
    expect(vals.every((f) => policyOf(f) === 'block')).toBe(true);
    for (const l of LANGS) for (const f of [site, ...vals]) expect(renderConvertPlain(f, l)).not.toMatch(/\{|\}/);
  });

  it('recognition is conservative: never a plain "Depth", and a metre or a unit-less depth stays a depth', () => {
    for (const h of ['Pore_water_Depth[cm]', 'Pore water depth (cm)', 'depth below seafloor', 'Depth below the seafloor [cm]', 'sediment depth', 'Sediment_depth_cm', 'głębokość w osadzie', 'Głębokość w osadzie [cm]', 'Sedimenttiefe', 'Tiefe im Sediment', 'profondeur dans le sédiment', 'Depth cmbsf', 'core depth']) {
      const name = h.replace(/\s*[[(][^\])]*[\])]$/, '').replace(/_cm$/, '');
      expect(isSeafloorName(name), h).toBe(true);
    }
    for (const h of ['Depth', 'depth', 'Depth_cm', 'Depth [m]', 'Tiefe', 'Głębokość', 'profondeur', 'Water depth', 'Site depth', 'Depth of the site', 'bottom depth']) expect(isSeafloorName(h), h).toBe(false);
    expect(isPlainDepthName('Depth')).toBe(true);
    for (const h of ['Site_depth', 'Depth of the site', 'water depth', 'bottom depth', 'station depth', 'Głębokość stanowiska', 'Wassertiefe', 'profondeur du site']) expect(isSiteDepthName(h), h).toBe(true);
    for (const h of ['Depth', 'depth of sample', 'Pore water depth', 'Water depth sample']) expect(isSiteDepthName(h), h).toBe(false);
    const props = (header: string[], rows: (string | number)[][]) => proposeConvertColumns(rawSheet(header, rows), { decimalComma: false, date1904: false });
    // the usual abbreviation of centimetres below the seafloor, in brackets
    expect(props(['Station', 'Depth (cmbsf)'], [['A', 5]]).find((p) => p.header === 'Depth (cmbsf)')!.role.kind).toBe('depthBelowSeafloor');
    // a plain Depth in cm on a sheet that does NOT say sediment or porewater: still a depth in cm (and CONV-DEPTH-UNIT blocks it)
    const plain = props(['Station', 'Depth_cm', 'Temp_C'], [['A', 5, 4.1]]);
    expect(plain.find((p) => p.header === 'Depth_cm')!.role).toMatchObject({ kind: 'depth', unit: 'cm' });
    // the same column on a sheet that says porewater in a header or in a cell
    expect(props(['Station', 'Pore water type', 'Depth_cm'], [['A', 'x', 5]]).find((p) => p.header === 'Depth_cm')!.role.kind).toBe('depthBelowSeafloor');
    expect(props(['Station', 'Kind', 'Depth_cm'], [['A', 'sediment', 5]]).find((p) => p.header === 'Depth_cm')!.role.kind).toBe('depthBelowSeafloor');
    // never from a plain Depth in metres, even on a sediment sheet
    expect(props(['Station', 'Kind', 'Depth [m]'], [['A', 'sediment', 5]]).find((p) => p.header === 'Depth [m]')!.role.kind).toBe('depth');
    // a site depth with no depth below the seafloor on the sheet is not written (and not a species)
    const noSf = props(['Station', 'Site_depth_m', 'Temp_C'], [['A', 40, 4.1]]);
    expect(noSf.find((p) => p.header === 'Site_depth_m')!.role.kind).toBe('ignore');
    expect(noSf.find((p) => p.header === 'Site_depth_m')!.reasonCode).toBe('site-depth-ignored');
  });

  it('CONV-DEPTH-UNIT no longer tells the user to remove a unit; it points to the new meaning, in every language', async () => {
    const f = makeConvertFinding('CONV-DEPTH-UNIT', { file: 'a.csv', sheet: 'a', field: 'Depth_cm', params: { unit: 'cm' } });
    for (const l of LANGS) {
      const t = renderConvertPlain(f, l);
      expect(t, l).not.toMatch(/remove the unit|usuń jednostk|entfernen Sie die Einheit|retirez l'unité/i);
      expect(t.length).toBeLessThanOrEqual(400);
    }
    expect(renderConvertPlain(f, 'en')).toContain('Depth below seafloor');
    expect(renderConvertPlain(f, 'pl')).toContain('Głębokość w osadzie');
    expect(renderConvertPlain(f, 'de')).toContain('Tiefe unter dem Meeresboden');
    expect(renderConvertPlain(f, 'fr')).toContain('Profondeur sous le fond');
    expect(renderConvertTechnical(f)).not.toMatch(/remove/);
  });
});

describe('5. a P01 code declared in the header (f2)', () => {
  it('a verified code is proposed first; an unverified well-formed one is offered as declared; a malformed one stays a variable', async () => {
    const f2 = await load('f2-declared-p01.csv');
    expect(roleOf(f2.proposals, 'TEMPP901<Float32>')).toMatchObject({ kind: 'variable', p01: 'TEMPP901' });
    // TEMPP901 is verified (a method concept): proposed first, ahead of the generic one
    const t = suggestType('temperature', '°C', 'TEMPP901');
    expect(t.proposed?.code).toBe('TEMPP901');
    expect(t.offered.map((x) => x.code)).toEqual(['TEMPPR01', 'TEMPST01']);
    const s = suggestType('salinity', undefined, 'PSALMV01');
    expect(s.proposed?.code).toBe('PSALMV01');
    expect(suggestType('POC', 'µmol/L', 'CORGCAP1').proposed?.code).toBe('CORGCAP1');
    // an unverified code: never proposed, only listed as declared
    expect(roleOf(f2.proposals, 'SDN:P01::ABCD1234<Float32>')).toMatchObject({ kind: 'variable', p01: 'ABCD1234' });
    expect(reasonOf(f2.proposals, 'SDN:P01::ABCD1234<Float32>')).toBe('p01-declared-unverified');
    const u = suggestType('SDN:P01::ABCD1234', undefined, 'ABCD1234');
    expect(u.proposed).toBeUndefined();
    expect(u.declared?.code).toBe('ABCD1234');
    expect(u.declared?.uri).toBe('http://vocab.nerc.ac.uk/collection/P01/current/ABCD1234/');
    // not 8 characters of [A-Z0-9]: not declared at all
    for (const bad of ['D13CMOP11', 'abcd1234', 'ABC123', 'ABCD-234']) expect(suggestType('x', undefined, bad).declared, bad).toBeUndefined();
    expect(verifiedConcept('TEMPP901')?.code).toBe('TEMPP901');
    expect(verifiedConcept('ABCD1234')).toBeUndefined();
  });

  it('a 9-character declared code stays a variable with a note, and is not a taxon candidate', () => {
    const ps = proposeConvertColumns(rawSheet(['Station', 'Latitude', 'Longitude', 'SDN:P01::D13CMOP11<Float32>', 'SDN:P01::ABCD1234<Float32>', 'Calanus'], [['A', 70.1, 20.2, 0.5, 0.7, 3]]), { decimalComma: false, date1904: false });
    const p = ps.find((x) => x.header.startsWith('SDN:P01::D13CMOP11'))!;
    expect(p.role.kind).toBe('variable');
    expect(p.reasonCode).toBe('p01-malformed');
    expect(ps.filter((x) => x.role.kind === 'taxon' && x.role.header === true && x.confidence === 'low').map((x) => x.header)).toEqual(['Calanus']);
  });

  it('a declared code is written only after the user confirmed it, and only the code of that very header (the worker checks it)', async () => {
    const f2 = await load('f2-declared-p01.csv');
    const col = f2.mapping.columns.find((c) => c.header === 'SDN:P01::ABCD1234<Float32>')!;
    const pick = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/ABCD1234/', source: 'declared', deprecated: false };
    const run = (nerc?: NercDecisions) => convert({ sheets: [f2.input({ profile: { depthIds: true, positionStation: true }, ...(nerc ? { nerc } : {}) })] });
    const rows = (r: ReturnType<typeof run>) => r.measurements.filter((m) => m.source.column === col.header);
    // not confirmed: no identifier
    expect(rows(run()).every((m) => m.measurementTypeId === undefined)).toBe(true);
    // confirmed, and the header declares exactly that code: written
    const ok = rows(run({ [String(col.index)]: { type: pick } } as NercDecisions));
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every((m) => m.measurementTypeId === pick.id)).toBe(true);
    // confirmed for ANOTHER code than the header declares, or for a column that declares none: dropped
    const other = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/WXYZ9999/', source: 'declared', deprecated: false };
    expect(rows(run({ [String(col.index)]: { type: other } } as NercDecisions)).every((m) => m.measurementTypeId === undefined)).toBe(true);
    const tempCol = f2.mapping.columns.find((c) => c.header === 'TEMPP901<Float32>')!;
    expect(readDecision({ [String(tempCol.index)]: { type: { ...pick, id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPP901/' } } } as NercDecisions, tempCol.index)).toEqual({});
    expect(readDecision({ '1': { type: pick } } as NercDecisions, 1, 'ABCD1234').type?.source).toBe('declared');
    expect(readDecision({ '1': { type: pick } } as NercDecisions, 1, undefined)).toEqual({});
    expect(readDecision({ '1': { type: { ...pick, deprecated: true } } } as NercDecisions, 1, 'ABCD1234')).toEqual({});
    // a declared pick cannot stand for a unit
    expect(readDecision({ '1': { unit: { id: 'http://vocab.nerc.ac.uk/collection/P06/current/UPAA/', source: 'declared', deprecated: false } } } as NercDecisions, 1, 'UPAA')).toEqual({});
  });
});

describe('6. quality columns (f9)', () => {
  it('_quality, Q_<name>, QV:ODV and _QC / QF_ / _flag are ignored with a reason, never a measurement or a taxon', async () => {
    const f9 = await load('f9-flags.csv');
    for (const h of ['TEMP_flag', 'S_QC', 'QF_Nitrate', 'Q_Silicate', 'Chl_a_ug_l_quality', 'Sal QV:ODV:SDN']) {
      expect(roleOf(f9.proposals, h), h).toEqual({ kind: 'ignore' });
      expect(f9.proposals.find((p) => p.header === h)!.reasonCode, h).toBeTruthy();
    }
    expect(reasonOf(f9.proposals, 'Q_Silicate')).toBe('quality-column');
    expect(f9.proposals.some((p) => p.role.kind === 'taxon')).toBe(false);
    const r = convert({ sheets: [f9.input({ profile: PROFILE })] });
    expect(r.measurements.map((m) => m.source.column).filter((c, i, a) => a.indexOf(c) === i)).toEqual(['TEMP_C', 'S', 'Nitrate_umol_L', 'Silicate_umol_L', 'Chl_a_ug_l']);
    expect(f9.parsed.files[0].suggestedProfiles['f9-flags.csv']).toBe(true);
  });

  it('only whole name parts count: a lone Q (a discharge), quality as a measured word, and a DwC term are not flags', () => {
    for (const h of ['Q', 'Q [m3/s]', 'Quantity', 'Qualifier', 'identificationQualifier', 'Equality', 'Flagellates', 'Flag']) expect(isQualityHeader(h), h).toBe(false);
    for (const h of ['Q_Silicate', 'QF_Nitrate', 'QC salinity', 'Temp_QC', 'Sal_flag', 'O2 quality', 'O2_quality', 'Sal QV:ODV:SDN', 'qv:odv:temperature']) expect(isQualityHeader(h), h).toBe(true);
  });
});

describe('7. revisited stations (f5)', () => {
  it('the depth-made level ID includes the date when a station was visited on more than one date', async () => {
    const f5 = await load('f5-revisits.csv');
    const r = convert({ sheets: [f5.input({ profile: PROFILE })] });
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['ZR1:2020-05-01:5m', 'ZR1:2020-05-01:10m', 'ZR1:2021-07-01:5m', 'ZR1:2021-07-01:10m', 'ZR2:5m']);
    // no duplicate: the same depth of two visits is two levels
    expect(rulesOf(r)).not.toContain('CONV-ID-DUPLICATE');
    // ZR2 was visited once: its ID has no date
    expect(r.events.find((e) => e.id === 'ZR2:5m')).toBeTruthy();
  });

  it('the date comes from the data, never from the order of the rows', async () => {
    const f5 = await load('f5-revisits.csv');
    const reordered = ['Site_ID,Date,Latitude,Longitude,Depth_m,TEMP_C,S', 'ZR1,2021-07-01,70.1,20.2,10,5.2,32.9', 'ZR2,2020-05-02,70.3,20.4,5,4.4,33.0', 'ZR1,2020-05-01,70.1,20.2,5,4.1,33.1', 'ZR1,2021-07-01,70.1,20.2,5,6.1,32.1', 'ZR1,2020-05-01,70.1,20.2,10,3.9,33.4'].join('\n') + '\n';
    const file = readConvertFile(parseFile('f5-revisits.csv', new TextEncoder().encode(reordered)));
    const r = convert({ sheets: [{ ...f5.input({ profile: PROFILE }), file }] });
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id).sort()).toEqual(['ZR1:2020-05-01:10m', 'ZR1:2020-05-01:5m', 'ZR1:2021-07-01:10m', 'ZR1:2021-07-01:5m', 'ZR2:5m']);
  });

  it('a row with no date at a station that has several dates has no ID (it is not guessed)', () => {
    const text = 'Site_ID,Date,Latitude,Longitude,Depth_m,TEMP_C\nA,2020-05-01,70.1,20.2,5,4.1\nA,2021-07-01,70.1,20.2,5,6.1\nA,,70.1,20.2,10,5.0\n';
    const file = readConvertFile(parseFile('nodate.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: PROFILE }] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-SAMPLE-CODE-MISSING')!;
    expect(f.lines).toEqual([4]);
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['A:2020-05-01:5m', 'A:2021-07-01:5m']);
  });

  it('pressure-made IDs take the date too (dbar)', () => {
    const text = 'Station,Date,Latitude,Longitude,Pressure [dbar],Temperature [°C]\nA,2020-05-01,70.1,20.2,5,4.1\nA,2021-07-01,70.1,20.2,5,6.1\n';
    const file = readConvertFile(parseFile('p.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: PROFILE }] });
    expect(r.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['A:2020-05-01:5dbar', 'A:2021-07-01:5dbar']);
  });
});

describe('8. false roles on an environmental sheet (f6)', () => {
  it('density in kg m-3 is a measured variable (seawater density), area is not a sample size, site depth is no species', async () => {
    const f6 = await load('f6-env-roles.csv');
    expect(roleOf(f6.proposals, 'Density (kg m-3)')).toMatchObject({ kind: 'variable', variable: 'density', unit: 'kg m-3' });
    expect(reasonOf(f6.proposals, 'Density (kg m-3)')).toBe('seawater-density');
    expect(roleOf(f6.proposals, 'Area')).toEqual({ kind: 'ignore' });
    expect(reasonOf(f6.proposals, 'Area')).toBe('area-not-effort');
    expect(f6.proposals.some((p) => p.role.kind === 'taxon' || p.role.kind === 'quantity' || p.role.kind === 'effort')).toBe(false);
    expect(f6.parsed.files[0].suggestedProfiles['f6-env-roles.csv']).toBe(true);
    // density has verified concepts, offered and never proposed (they name a computation); the unit has one (UKMC)
    const s = suggestType('density', 'kg m-3');
    expect(s.proposed).toBeUndefined();
    expect(s.offered.map((t) => t.code)).toEqual(['INDENS01', 'SIGTEQ01']);
    expect(suggestUnit('kg m-3')?.code).toBe('UKMC');
  });

  it('"Area" stays a sampled area on a biology sheet, and "sampled area" / "swept area" always do', () => {
    const bio = proposeConvertColumns(rawSheet(['Station', 'Sample', 'Latitude', 'Longitude', 'Area', 'Calanus finmarchicus'], [['A', 'A1', 70, 20, 0.5, 3]]), { decimalComma: false, date1904: false });
    expect(bio.find((p) => p.header === 'Area')!.role.kind).toBe('effort');
    for (const h of ['Area sampled [m2]', 'Sampled area', 'Swept area [km2]']) {
      const env = proposeConvertColumns(rawSheet(['Station', 'Latitude', 'Longitude', 'Depth [m]', 'T [°C]', 'S', h], [['A', 70, 20, 5, 4, 33, 2]]), { decimalComma: false, date1904: false });
      expect(env.find((p) => p.header === h)!.role.kind, h).toBe('effort');
    }
    // a biology density is still an abundance
    const dens = proposeConvertColumns(rawSheet(['Station', 'Sample', 'Latitude', 'Longitude', 'Density [ind/m3]', 'Calanus finmarchicus'], [['A', 'A1', 70, 20, 5, 3]]), { decimalComma: false, date1904: false });
    expect(dens.find((p) => p.header === 'Density [ind/m3]')!.role.kind).toBe('quantity');
  });

  it('profile is suggested for a sheet with a station, a depth and at least two measured variables and no taxa', () => {
    const v = (variable: string): { role: ColumnRole; confidence: 'high' | 'low' } => ({ role: { kind: 'variable', variable }, confidence: 'high' });
    const cols = [{ role: { kind: 'station' } as ColumnRole, confidence: 'high' as const }, { role: { kind: 'depth', positive: 'down' } as ColumnRole, confidence: 'high' as const }];
    expect(suggestConvertProfile([...cols, v('temperature'), v('salinity')])).toBe(true);
    expect(suggestConvertProfile([...cols, v('temperature')])).toBe(true);
    expect(suggestConvertProfile([cols[0], v('temperature'), v('salinity')])).toBe(false);
    // a few unknown numeric columns do not make a CTD file a species table; many do
    const cand = { role: { kind: 'taxon', header: true } as ColumnRole, confidence: 'low' as const };
    expect(suggestConvertProfile([...cols, v('temperature'), v('salinity'), v('oxygen'), cand])).toBe(true);
    expect(suggestConvertProfile([...cols, v('temperature'), v('salinity'), cand, cand, cand])).toBe(false);
    expect(suggestConvertProfile([...cols, v('temperature'), cand])).toBe(false);
    // a named taxon, a quantity, an occurrenceID: a biology sheet
    expect(suggestConvertProfile([...cols, v('temperature'), v('salinity'), { role: { kind: 'taxon' } as ColumnRole, confidence: 'high' }])).toBe(false);
    expect(suggestConvertProfile([...cols, v('temperature'), v('salinity'), { role: { kind: 'quantity' } as ColumnRole, confidence: 'high' }])).toBe(false);
  });
});

describe('9. a sheet with no station column: each distinct position is a station (user-ticked, never automatic)', () => {
  it('without the tick the rows are blocked; with it the station is <cruise>:<lat>_<lon> as written', async () => {
    const f2 = await load('f2-declared-p01.csv');
    const without = convert({ sheets: [f2.input({ profile: PROFILE })] });
    expect(rulesOf(without)).toContain('CONV-PROFILE-NO-STATION');
    expect(without.events).toEqual([]);
    const withTick = convert({ sheets: [f2.input({ profile: { depthIds: true, positionStation: true }, cruise: 'CR9' })] });
    expect(rulesOf(withTick)).not.toContain('CONV-PROFILE-NO-STATION');
    expect(withTick.events.filter((e) => e.eventType === 'station').map((e) => e.id)).toEqual(['CR9:70.1_20.2', 'CR9:70.3_20.4']);
    expect(withTick.events.filter((e) => e.eventType === 'profile level').map((e) => e.id)).toEqual(['CR9:70.1_20.2:5m', 'CR9:70.1_20.2:10m', 'CR9:70.3_20.4:5m']);
    const info = withTick.findings.find((f) => f.ruleId === 'CONV-STATION-FROM-POSITION')!;
    expect(info.params.count).toBe(2);
    expect(policyOf(info)).toBe('show');
    // no cruise: the station text alone
    const noCruise = convert({ sheets: [f2.input({ profile: { depthIds: true, positionStation: true } })] });
    expect(noCruise.events.filter((e) => e.eventType === 'station').map((e) => e.id)).toEqual(['70.1_20.2', '70.3_20.4']);
  });

  it('the tick is ignored when the sheet has a station column, and the numbers are the ones written (a decimal comma becomes a point)', async () => {
    const f10 = await load('f10-env-only-small.csv');
    const r = convert({ sheets: [f10.input({ profile: { depthIds: true, positionStation: true } })] });
    expect(r.events.filter((e) => e.eventType === 'station').map((e) => e.id)).toEqual(['ZE1', 'ZE2']);
    const text = 'Datum;Breite;Laenge;Tiefe [m];Temperatur [°C];Salzgehalt\n01.05.2020;70,10;20,2;5;4,1;33,1\n01.05.2020;70,10;20,2;10;3,9;33,4\n';
    const file = readConvertFile(parseFile('dc.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: true, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r2 = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: { depthIds: true, positionStation: true } }] });
    expect(r2.events.filter((e) => e.eventType === 'station').map((e) => e.id)).toEqual(['70.10_20.2']);
  });

  it('a row with no readable position has no station', () => {
    const text = 'Date,Latitude,Longitude,Depth_m,TEMP_C\n2020-05-01,70.1,20.2,5,4.1\n2020-05-01,,,10,3.9\n';
    const file = readConvertFile(parseFile('np.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: { depthIds: true, positionStation: true } }] });
    expect(r.findings.find((f) => f.ruleId === 'CONV-PROFILE-NO-STATION')!.lines).toEqual([3]);
  });
});

describe('10. oxygen saturation [%] (f7) and the small ones', () => {
  it('oxygen in per cent is saturation, a variable of its own: the verified saturation concept only, never a concentration', async () => {
    const f7 = await load('f7-oxygen-carbonate.csv');
    for (const h of ['O2 [%]', 'Oxygen saturation [%]']) {
      expect(roleOf(f7.proposals, h), h).toMatchObject({ kind: 'variable', variable: 'oxygen saturation', unit: '%' });
    }
    const s = suggestType('oxygen saturation', '%');
    expect(s.proposed?.code).toBe('OXYSZZ01');
    expect(s.offered).toEqual([]);
    expect(suggestUnit('%')?.code).toBe('UPCT');
    expect(VARIABLE_CONCEPTS['oxygen saturation'].map((c) => c.kind)).toEqual(['generic']);
  });

  it('the unit-mismatch warning fires when a concentration concept is chosen for a percentage', async () => {
    const f7 = await load('f7-oxygen-carbonate.csv');
    const col = f7.mapping.columns.find((c) => c.header === 'O2 [%]')!;
    const pick = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/DOXYZZXX/', source: 'suggested', deprecated: false };
    const r = convert({ sheets: [f7.input({ profile: PROFILE, nerc: { [String(col.index)]: { type: pick } } as NercDecisions })] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-NERC-UNIT-MISMATCH')!;
    expect(f).toBeTruthy();
    expect(f.params.unit).toBe('%');
    expect(unitContradictsConcept('Concentration of oxygen per unit volume of the water body', '%')).toBe(true);
    expect(unitContradictsConcept('Saturation of oxygen in the water body', '%')).toBe(false);
    // the saturation concept with a percentage: fine
    const ok = convert({ sheets: [f7.input({ profile: PROFILE, nerc: { [String(col.index)]: { type: { id: 'http://vocab.nerc.ac.uk/collection/P01/current/OXYSZZ01/', source: 'suggested', deprecated: false } } } as NercDecisions })] });
    expect(ok.findings.some((x) => x.ruleId === 'CONV-NERC-UNIT-MISMATCH')).toBe(false);
  });

  it('O2_ml_l is a variable (oxygen, mL/L), and mL/L is never offered the per-mass concept', async () => {
    const f7 = await load('f7-oxygen-carbonate.csv');
    expect(roleOf(f7.proposals, 'O2_ml_l')).toMatchObject({ kind: 'variable', variable: 'oxygen', unit: 'mL/L' });
    expect(f7.proposals.some((p) => p.role.kind === 'taxon')).toBe(false);
    for (const unit of ['mL/L', 'ml/l', 'mL L-1']) {
      const s = suggestType('oxygen', unit);
      expect(s.proposed, unit).toBeUndefined();
      expect(s.offered.map((t) => t.code), unit).toEqual(['DOXYZZXX']);
    }
  });

  it('DOC and the major ions have verified concepts, offered and never proposed (their matrix is the user\'s to say)', () => {
    for (const [v, unit, codes] of [
      ['DOC', 'mg/L', ['DOCGZZ01']],
      ['DOC', 'µmol/kg', ['CORGZZKG']],
      ['chloride', 'mg/L', ['CLXXWBUP']],
      ['sodium', 'mg/L', ['RWS00021']],
      ['potassium', 'mg/L', ['RWS00022']],
      ['calcium', 'mg/L', ['RWS00023']],
      ['calcium', 'mg/kg', ['NEWCXX09']],
      ['magnesium', 'mg/L', ['RWS00024']],
      ['sulphate', 'mg/L', ['S04DISP1', 'SPHTMAXX']],
    ] as const) {
      const s = suggestType(v, unit);
      expect(s.proposed, `${v} ${unit}`).toBeUndefined();
      expect(s.offered.map((t) => t.code).sort(), `${v} ${unit}`).toEqual([...codes].sort());
    }
    // dissolved inorganic nitrogen: no generic concept exists in P01
    expect(suggestType('DIN', 'µmol/L')).toEqual({ offered: [] });
  });

  it('a confirmed practical salinity or pH with no unit is proposed "Dimensionless" (P06 UUUU), and written with it only then', async () => {
    expect(dimensionlessUnitFor('http://vocab.nerc.ac.uk/collection/P01/current/PSLTZZ01/')?.code).toBe('UUUU');
    expect(dimensionlessUnitFor('http://vocab.nerc.ac.uk/collection/P01/current/PHXXZZXX/')?.code).toBe('UUUU');
    expect(dimensionlessUnitFor('http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/')).toBeUndefined();
    expect(dimensionlessUnitFor(undefined)).toBeUndefined();
    const f10 = await load('f10-env-only-small.csv');
    const col = f10.mapping.columns.find((c) => c.header === 'S')!;
    const typePick = { id: 'http://vocab.nerc.ac.uk/collection/P01/current/PSLTZZ01/', source: 'suggested', deprecated: false };
    const unitPick = { id: 'http://vocab.nerc.ac.uk/collection/P06/current/UUUU/', source: 'suggested', deprecated: false };
    const rowsOf = (nerc: NercDecisions) => convert({ sheets: [f10.input({ profile: PROFILE, nerc })] }).measurements.filter((m) => m.source.column === 'S');
    const both = rowsOf({ [String(col.index)]: { type: typePick, unit: unitPick } } as NercDecisions);
    expect(both.every((m) => m.measurementUnitId === unitPick.id && m.measurementUnit === 'Dimensionless')).toBe(true);
    // the unit without the confirmed type: dropped; for another type: dropped
    expect(rowsOf({ [String(col.index)]: { unit: unitPick } } as NercDecisions).every((m) => m.measurementUnitId === undefined)).toBe(true);
    expect(rowsOf({ [String(col.index)]: { type: { ...typePick, id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/' }, unit: unitPick } } as NercDecisions).every((m) => m.measurementUnitId === undefined)).toBe(true);
  });

  it('German sample-code headers are read as the sample code, whole headers only', () => {
    for (const h of ['Nr. der Probe', 'Probennummer', 'Proben-Nr.', 'Probe Nr.', 'Proben-ID']) {
      const ps = proposeConvertColumns(rawSheet(['Station', h, 'Datum', 'Breite', 'Länge', 'Calanus'], [['A', 'P1', '2020-05-01', 70.1, 20.2, 3]]), { decimalComma: false, date1904: false });
      expect(ps.find((p) => p.header === h)!.role.kind, h).toBe('sampleId');
    }
    for (const h of ['Probenahme', 'Probenvolumen', 'Nr. der Station']) {
      const ps = proposeConvertColumns(rawSheet(['Station', h, 'Datum', 'Breite', 'Länge', 'Calanus'], [['A', 'P1', '2020-05-01', 70.1, 20.2, 3]]), { decimalComma: false, date1904: false });
      expect(ps.find((p) => p.header === h)!.role.kind, h).not.toBe('sampleId');
    }
  });

  it('a second pressure column is reported as not exported, in words that say why', async () => {
    const text = 'Station,Date,Latitude,Longitude,Pressure [dbar],Pressure 2 [dbar],Temperature [°C]\nA,2020-05-01,70.1,20.2,5,5.1,4.1\n';
    const file = readConvertFile(parseFile('p2.csv', new TextEncoder().encode(text)));
    const mapping = { sheet: file.sheets[0].name, columns: proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false }).map((p) => ({ index: p.index, header: p.header, role: p.role })) };
    const r = convert({ sheets: [{ file, sheet: file.sheets[0].name, mapping, shape: 'wide', profile: PROFILE }] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED')!;
    expect(f.params.columns).toBe('Pressure 2 [dbar]');
    expect(renderConvertPlain(f, 'en')).toContain('Pressure 2 [dbar]');
  });
});

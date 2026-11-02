// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A depth in another unit than metres never reaches minimumDepthInMeters unconverted: a unit with an exact factor is converted and kept in verbatimDepth
// (CONV-DEPTH-CONVERTED, accepted by the user), any other unit blocks (CONV-DEPTH-UNIT). Every value is invented.
import { describe, expect, it } from 'vitest';
import { convertDepthText, depthSuffixUnit, depthUnitFactor, isMetreUnit } from '../../src/core/recognize/depthUnit';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { unitFromHeader } from '../../src/core/recognize/columns';
import { judge, policyOf } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Lang } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { exportSheet, objects, readBack } from './exportHelpers';
import type { Cell } from './helpers';

const Q = { kind: 'count' as const };
const ROWS = (depths: Cell[][]): Cell[][] => depths.map((d, i) => ['S1', `s${i + 1}`, '2023-06-14', 55.5, 2.5, ...d, 'Calanus finmarchicus', 4 + i]);
const header = (...depth: string[]): string[] => ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', ...depth, 'Species', 'Count'];
const roleOf = (h: string[], name: string) => {
  const sheet = rawSheet(h, ROWS(h.length === 8 ? [[10]] : [[10, 20]]));
  return proposeConvertColumns(sheet, { decimalComma: false, date1904: false }).find((p) => p.header === name)!;
};

describe('the unit of a depth header', () => {
  it('keeps the unit written as a suffix, in brackets or as a word', () => {
    for (const [h, unit] of [['Depth_fm', 'Depth_fm'], ['depth_ft', 'depth_ft'], ['Depth fathoms', 'Depth fathoms'], ['Depth feet', 'Depth feet'], ['Depth_km', 'Depth_km'], ['Depth (ft)', 'Depth (ft)'], ['Depth [km]', 'Depth [km]']] as const) {
      void unit;
      const p = roleOf(header(h), h);
      expect(p.role.kind === 'depth' || p.role.kind === 'depthBelowSeafloor', h).toBe(true);
      expect(p.role.kind === 'depth' ? p.role.unit : 'x', h).toBeDefined();
    }
    expect(unitFromHeader('Depth (ft)').unit).toBeUndefined();
    expect(depthSuffixUnit('Depth (ft)')).toBe('ft');
    expect(depthSuffixUnit('Depth_fm')).toBe('fm');
    expect(depthSuffixUnit('Depth_min_fm')).toBe('fm');
    expect(depthSuffixUnit('min_depth_km')).toBe('km');
  });

  it('metres stay metres with no unit problem; qualifiers are not units', () => {
    for (const h of ['Depth', 'depth_mean', 'Depth_min', 'depth_from', 'Depth_flag', 'Depth_qc', 'Depth_to', 'depth_sd', 'Depth_id', 'Depth at 10 km', 'Depth in situ']) {
      expect(depthSuffixUnit(h), h).toBeUndefined();
    }
    for (const h of ['Depth (m)', 'depth_m', 'Depth [m]']) expect(depthSuffixUnit(h), h).toBe(h.includes('[') ? 'm' : h.includes('(') ? 'm' : 'm');
    expect(depthUnitFactor('m')).toBeUndefined();
    expect(depthUnitFactor('dbar')).toBeUndefined();
    const p = roleOf(header('Depth [m]'), 'Depth [m]');
    expect(p.role).toMatchObject({ kind: 'depth', unit: 'm' });
  });

  it('reads the unit in every form a header writes it, and a conflicting pair as a blocking unit', () => {
    const converted = ['Depth, ft', 'Depth (fth)', 'Depth (fms)', 'Depth (ftm)', 'Depth (ft.)', 'Depth-ft', 'Depth/ft', 'Depth.ft', 'ft_depth', 'fm_depth', 'Depth_fm_max', 'Sounding (fm)', 'Sounding_fm', 'Fathoms', 'MaxDepth_ft', 'Depth feet', 'Depth [km]'];
    for (const h of converted) expect(depthUnitFactor(depthSuffixUnit(h)), h).toBeDefined();
    const midName = ['Depth 30 ft', 'Depth_100_ft', 'Depth_fm_bin', 'Depth_ft_corrected', 'Depth_fm_est', 'Depth_ft_1', 'Depth ft sonar', 'Depth (ft) sonar', 'Depth [ft] sonar', 'Depth (m or ft)', 'Depth_km_offshore', 'depth_cm_bsf', 'Bathy (fathoms) raw'];
    for (const h of midName) {
      const u = depthSuffixUnit(h);
      expect(u, h).toBeDefined();
      expect(depthUnitFactor(u) === undefined && !isMetreUnit(u!), h).toBe(true);
    }
    expect(depthSuffixUnit('depth_cm_bsf')).toBe('cm bsf');
    expect(depthSuffixUnit('Depth_cm<Float32>')).toBe('cm');
    expect(depthSuffixUnit('"Depth_ft<Float32>"')).toBe('ft');
    for (const h of ['Depth_fm_mean', 'depth_ft_avg', 'Depth_fathom_range', 'depthFt', 'Tiefe (Faden)', 'Sounding_fm_mean']) expect(depthUnitFactor(depthSuffixUnit(h)), h).toBeDefined();
    expect(depthSuffixUnit('Depth_m_corrected')).toBe('m');
    for (const h of ['Depth 5 m', 'Depth_2_m']) expect(depthSuffixUnit(h), h).toBe('m');
    const blocking = ['Depth (f)', 'Depth (yd)', 'Depth (yards)', 'Depth (mi)', 'Depth (dm)', 'Depth_in', 'depth_yards', 'Depth_cm', 'Depth (cm)', 'depth_m_ft', 'Depth_ft_m'];
    for (const h of blocking) {
      const u = depthSuffixUnit(h);
      expect(u, h).toBeDefined();
      expect(depthUnitFactor(u) === undefined && !isMetreUnit(u!), h).toBe(true);
    }
  });

  it('converts the digits exactly', () => {
    expect(convertDepthText('31.5', depthUnitFactor('fm')!)).toBe('57.6072');
    expect(convertDepthText('100', depthUnitFactor('ft')!)).toBe('30.48');
    expect(convertDepthText('1.25', depthUnitFactor('km')!)).toBe('1250');
    expect(convertDepthText('0', depthUnitFactor('fm')!)).toBe('0');
    expect(convertDepthText('-2', depthUnitFactor('ft')!)).toBe('-0.6096');
    expect(convertDepthText('.5', depthUnitFactor('fm')!)).toBe('0.9144');
    expect(convertDepthText('1e2', depthUnitFactor('fm')!)).toBeUndefined();
  });
});

describe('a depth in another unit through the export', () => {
  const cases: [string, number, string, string][] = [
    ['Depth_fm', 31.5, '57.6072', '31.5 fm'],
    ['Depth_ft', 100, '30.48', '100 ft'],
    ['Depth [km]', 1.2, '1200', '1.2 km'],
    ['Depth fathoms', 10, '18.288', '10 fathoms'],
    ['Depth feet', 10, '3.048', '10 feet'],
  ];
  for (const [h, v, metres, verbatim] of cases) {
    it(`${h}: converted, kept in verbatimDepth, said once and accepted`, async () => {
      const e = await exportSheet(header(h), ROWS([[v]]), { quantity: Q });
      const f = e.findings.filter((x) => x.ruleId === 'CONV-DEPTH-CONVERTED');
      expect(f).toHaveLength(1);
      expect(f[0].params.example).toMatch(new RegExp(`^${v} (fm|ft|km) = ${metres} m$`));
      expect(policyOf(f[0])).toBe('accept');
      expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-UNIT')).toBe(false);
      expect(judge(e.findings).blocking).toEqual([]);
      // not written until the user has accepted the conversion
      const ev = e.dataset.events.find((x) => x.type === 'sample')!;
      expect(ev.depth).toMatchObject({ minText: metres, maxText: metres, verbatim });
    });
  }

  it('writes minimumDepthInMeters, maximumDepthInMeters and verbatimDepth to event.txt and meta.xml', async () => {
    const e = await exportSheet(header('Depth_fm'), ROWS([[31.5], [10]]), { quantity: Q });
    expect(e.files).not.toHaveLength(0);
    const b = await readBack(e.zip);
    const rows = objects(b.tables['event.txt']).filter((r) => r.eventType === 'sample');
    expect(rows.map((r) => [r.minimumDepthInMeters, r.maximumDepthInMeters, r.verbatimDepth])).toEqual([
      ['57.6072', '57.6072', '31.5 fm'],
      ['18.288', '18.288', '10 fm'],
    ]);
    expect(b.meta).toContain('http://rs.tdwg.org/dwc/terms/verbatimDepth');
    expect(b.tables['event.txt'].header).toContain('verbatimDepth');
  });

  it('a pair of min and max columns converts both ends and keeps both in verbatimDepth', async () => {
    const e = await exportSheet(header('Depth_min_fm', 'Depth_max_fm'), ROWS([[10, 20]]), { quantity: Q });
    const f = e.findings.filter((x) => x.ruleId === 'CONV-DEPTH-CONVERTED');
    expect(f.map((x) => x.field).sort()).toEqual(['Depth_max_fm', 'Depth_min_fm']);
    const ev = e.dataset.events.find((x) => x.type === 'sample')!;
    expect(ev.depth).toMatchObject({ minText: '18.288', maxText: '36.576', verbatim: '10 fm - 20 fm' });
  });

  it('a station derived from converted samples keeps the original of the extremes', async () => {
    const e = await exportSheet(header('Depth_ft'), ROWS([[10], [100]]), { quantity: Q });
    const station = e.dataset.events.find((x) => x.type === 'station');
    expect(station?.depth).toMatchObject({ min: 3.048, max: 30.48, verbatim: '10 ft - 100 ft' });
  });

  it('metres: no finding, no verbatimDepth column', async () => {
    for (const h of ['Depth', 'Depth [m]', 'depth_m']) {
      const e = await exportSheet(header(h), ROWS([[31.5]]), { quantity: Q });
      expect(e.findings.filter((x) => x.ruleId.startsWith('CONV-DEPTH')), h).toEqual([]);
      const b = await readBack(e.zip);
      expect(b.tables['event.txt'].header, h).not.toContain('verbatimDepth');
    }
  });

  it('an unconverted unit still blocks, and never reaches the archive', async () => {
    const e = await exportSheet(header('Depth_dm'), ROWS([[31.5]]), { quantity: Q });
    const f = e.findings.find((x) => x.ruleId === 'CONV-DEPTH-UNIT');
    expect(f).toBeDefined();
    expect(policyOf(f!)).toBe('block');
    expect(e.files).toEqual([]);
    const ambiguous = await exportSheet(header('Depth_f'), ROWS([[31.5]]), { quantity: Q });
    expect(ambiguous.findings.some((x) => x.ruleId === 'CONV-DEPTH-UNIT')).toBe(true);
    expect(ambiguous.files).toEqual([]);
  });

  it('a pressure column is not a depth and is not converted', async () => {
    const e = await exportSheet(header('Pressure_dbar'), ROWS([[31.5]]), { quantity: Q });
    expect(e.findings.filter((x) => x.ruleId.startsWith('CONV-DEPTH'))).toEqual([]);
  });

  it('a depth role picked by hand reads the unit from the header at the build level', async () => {
    for (const [h, v, metres] of [['Sounding (fm)', 31.5, '57.6072'], ['Sounding_fm', 31.5, '57.6072'], ['MaxDepth_ft', 100, '30.48'], ['Fathoms', 10, '18.288']] as [string, number, string][]) {
      const e = await exportSheet(header(h), ROWS([[v]]), { quantity: Q, edit: { [h]: { kind: 'depth', positive: 'down' } } });
      expect(e.dataset.events.find((x) => x.type === 'sample')!.depth, h).toMatchObject({ minText: metres });
      expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-CONVERTED'), h).toBe(true);
    }
    const blocked = await exportSheet(header('Depth_in'), ROWS([[31.5]]), { quantity: Q, edit: { Depth_in: { kind: 'depth', positive: 'down' } } });
    expect(blocked.findings.some((x) => x.ruleId === 'CONV-DEPTH-UNIT')).toBe(true);
  });

  it('a centimetre depth blocks with the sediment advice instead of being converted', async () => {
    const e = await exportSheet(header('Depth (cm)'), ROWS([[250]]), { quantity: Q });
    expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-UNIT' && x.params.unit === 'cm')).toBe(true);
    expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-CONVERTED')).toBe(false);
    expect(e.files).toEqual([]);
  });

  it('writes the example as written (sign turned for an upward depth), keeps the cell text, and a parent is written like its child', async () => {
    const up = await exportSheet(header('Depth_fm'), ROWS([[-10]]), { quantity: Q, edit: { Depth_fm: { kind: 'depth', positive: 'up', unit: 'fm' } } });
    expect(up.findings.find((x) => x.ruleId === 'CONV-DEPTH-CONVERTED')!.params.example).toBe('-10 fm = 18.288 m');
    const sci = await exportSheet(header('Depth_ft'), ROWS([['1e2']]), { quantity: Q });
    expect(sci.dataset.events.find((x) => x.type === 'sample')!.depth!.verbatim).toBe('1e2 ft');
    const two = await exportSheet(header('Depth_ft'), ROWS([[100], [100]]), { quantity: Q });
    const station = two.dataset.events.find((x) => x.type === 'station')!;
    expect(station.depth).toMatchObject({ minText: '30.48', maxText: '30.48' });
    const none = await exportSheet(header('Depth_ft'), ROWS([[null]]), { quantity: Q });
    expect(none.findings.some((x) => x.ruleId === 'CONV-DEPTH-CONVERTED')).toBe(false);
  });

  it('the depth below the seafloor in cm keeps its own role', () => {
    const sheet = rawSheet(['Station', 'Depth (cm)', 'Cl'], [['A', 5, 100]], 'Porewater');
    expect(proposeConvertColumns(sheet, { decimalComma: false, date1904: false })[1].role).toMatchObject({ kind: 'depthBelowSeafloor', unit: 'cm' });
  });

  it('the finding is worded in four languages', async () => {
    const e = await exportSheet(header('Depth_fm'), ROWS([[31.5]]), { quantity: Q });
    const f = e.findings.find((x) => x.ruleId === 'CONV-DEPTH-CONVERTED')!;
    for (const lang of ['pl', 'en', 'de', 'fr'] as Lang[]) {
      const t = renderConvertPlain(f, lang);
      expect(t, lang).toContain('Depth_fm');
      expect(t, lang).toContain('1.8288');
      expect(t, lang).toContain('31.5 fm = 57.6072 m');
      expect(t, lang).not.toContain('fathoms');
      expect(t, lang).not.toMatch(/\{[a-z+]/);
    }
  });

  it('a centimetre depth below the seafloor is read as the seafloor case, with its unit', () => {
    for (const h of ['depth_cm_bsf', 'Depth (cm) below seafloor']) {
      const sheet = rawSheet(['Station', h, 'Cl'], [['A', 5, 100]]);
      expect(proposeConvertColumns(sheet, { decimalComma: false, date1904: false })[1].role, h).toMatchObject({ kind: 'depthBelowSeafloor', unit: 'cm' });
    }
  });

  it('a converted unit on a sediment header blocks instead of converting as a water depth', async () => {
    const e = await exportSheet(header('sediment depth km'), ROWS([[10]]), { quantity: Q, edit: { 'sediment depth km': { kind: 'depth', positive: 'down' } } });
    expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-UNIT')).toBe(true);
    expect(e.findings.some((x) => x.ruleId === 'CONV-DEPTH-CONVERTED')).toBe(false);
  });
});

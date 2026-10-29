// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ODV / OPeNDAP type suffix of a header ('Activity<String>', 'Temperature_[deg._C]<Float32>') is no part of the name: the converter decides kind, unit and
// vocabulary hints on the name without it, as /check does. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { nameKind, namePart } from '../../src/core/convert/measured';
import { fileOf, mappingOf, sheetInput, type Cell } from './helpers';

const ids = (r: { findings: { ruleId: string }[] }): string[] => r.findings.map((f) => f.ruleId);
const STACKED = ['CONV-NO-TAXON', 'CONV-QUANTITY-UNDECLARED', 'CONV-NO-OCCURRENCES'];

const HEADER = ['Station', 'Date', 'Latitude', 'Longitude', 'SDN:P01::PRESPR01<Float32>', 'Sample_ID<String>', 'Salinity<Float32>', 'Temperature_[deg._C]<Float32>', 'Activity<String>'];
const ROWS: Cell[][] = [['E1', '2099-01-01', 55, 3, 5, 'a1', 33.1, 4.5, 9], ['E1', '2099-01-01', 55, 3, 10, 'a2', 33.4, 4.2, 8], ['E1', '2099-01-01', 55, 3, 15, 'a3', 33.5, 4.0, 9]];
const PLAIN = ['Station', 'Date', 'Latitude', 'Longitude', 'SDN:P01::PRESPR01', 'Sample_ID', 'Salinity', 'Temperature_[deg._C]', 'Activity'];

describe('type suffix in the converter', () => {
  it('namePart and nameKind ignore the suffix', () => {
    expect(namePart('Activity<String>')).toBe('Activity');
    expect(namePart('"Activity<String>"')).toBe('Activity');
    expect(nameKind('Activity<String>')).toBe('variable');
    expect(nameKind('Sample_ID<String>')).toBe(nameKind('Sample_ID'));
  });

  it('the synthetic ODV sheet: every column as without the suffix, Activity a variable', () => {
    const withSuffix = mappingOf(fileOf(HEADER, ROWS)).columns;
    const plain = mappingOf(fileOf(PLAIN, ROWS)).columns;
    expect(withSuffix.map((c) => c.role)).toEqual(plain.map((c) => c.role));
    const byHeader = Object.fromEntries(withSuffix.map((c) => [c.header, c.role]));
    expect(byHeader['Activity<String>'].kind).toBe('variable');
    expect(byHeader['Salinity<Float32>'].kind).toBe('variable');
    const t = byHeader['Temperature_[deg._C]<Float32>'];
    expect(t.kind).toBe('variable');
    expect(t.kind === 'variable' ? t.unit : undefined).toMatch(/deg|°/i);
    const p = byHeader['SDN:P01::PRESPR01<Float32>'];
    const p0 = Object.fromEntries(plain.map((c) => [c.header, c.role]))['SDN:P01::PRESPR01'];
    expect(p.kind).toBe(p0.kind);
    expect(p).toEqual(p0);
  });

  it('one blocker CONV-ENV-ONLY-SHEET, none of the stacked three', () => {
    const r = convert({ sheets: [sheetInput(fileOf(HEADER, ROWS))] });
    expect(ids(r).filter((id) => id === 'CONV-ENV-ONLY-SHEET')).toHaveLength(1);
    for (const id of STACKED) expect(ids(r), id).not.toContain(id);
    expect(r.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId)).toEqual(['CONV-ENV-ONLY-SHEET']);
  });

  const BASE = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]'];
  const HEADERS = ['Salinity', 'Temperature [degC]', 'Temperature_[deg._C]', 'Activity', 'Fluorescence [mg/m3]', 'Sample_ID', 'Oxygen [umol/kg]', 'Chlorophyll a [ug/l]', 'pH', 'Calanus finmarchicus', 'Calanus finmarchicus [ind/m3]', 'Oithona similis C1-C3', 'Notes', 'Cruise', 'Bottle', 'SDN:P01::TEMPPR01', 'SDN:P01::PRESPR01', 'Nitrate [umol/l]'];
  const roleOf = (name: string) => mappingOf(fileOf([...BASE, name], [['E1', '2099-01-01', 55, 3, 5, 9], ['E1', '2099-01-01', 55, 3, 10, 8]])).columns[BASE.length].role;
  it.each(['<Float32>', '<String>', '<Int32>', '<Double>'])('parity: kind and unit with %s equal those without', (suffix) => {
    for (const h of HEADERS) {
      expect(roleOf(h + suffix), h).toEqual(roleOf(h));
      expect(roleOf(`"${h}${suffix}"`), `"${h}"`).toEqual(roleOf(h));
      expect(nameKind(h + suffix), h).toBe(nameKind(h));
    }
  });

  it('a species sheet with a suffixed species header stays a taxon candidate', () => {
    expect(nameKind('Calanus finmarchicus<Float32>')).toBe('taxon');
    const wide = fileOf(['Sample', 'Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus<Float32>'], [['A', 'S', 55, 3, '2099-01-01', 4]]);
    expect(mappingOf(wide).columns[5].role.kind).toBe('taxon');
    const r = convert({ sheets: [sheetInput(wide)] });
    expect(ids(r)).not.toContain('CONV-ENV-ONLY-SHEET');
    expect(ids(r)).toContain('CONV-QUANTITY-UNDECLARED');
  });
});

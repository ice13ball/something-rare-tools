// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The quantity declaration (plan 2.11): what is blocking, what concepts it gives, and that only the spike's verified NERC URIs are used.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { parseEffortUnit, parseRateUnit, resolveQuantity } from '../../src/core/convert/quantity';
import type { QuantityDeclaration } from '../../src/core/convert/quantity';
import { P01, P06, VERIFIED_CODES } from '../../src/core/convert/vocab';
import type { Finding } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const find = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const HEADER = ['Sample', 'Station', 'Calanus finmarchicus', 'Oithona similis'];
const run = (rows: Cell[][], quantity?: QuantityDeclaration | undefined, fullList = false) => convert({ sheets: [sheetInput(fileOf(HEADER, rows), { quantity })], options: { fullList } });

describe('blocking', () => {
  it('no declaration: CONV-QUANTITY-UNDECLARED blocks and the records are still built for the preview', () => {
    const r = run([['A', 'S', 3, 4]]);
    const f = find(r.blocking, 'CONV-QUANTITY-UNDECLARED');
    expect(f).toHaveLength(1);
    expect(f[0].params.missing).toBe('kind');
    expect(r.ok).toBe(false);
    expect(r.occurrences).toHaveLength(2);
    expect(r.measurements).toEqual([]);
    expect(r.occurrences[0].individualCount).toBeUndefined();
  });

  it('an incomplete declaration blocks and names what is missing', () => {
    const missing = (q: Parameters<typeof run>[1]) => find(run([['A', 'S', 3, 4]], q).blocking, 'CONV-QUANTITY-UNDECLARED')[0]?.params.missing;
    expect(missing({})).toBe('kind');
    expect(missing({ kind: 'density' })).toBe('unit');
    expect(missing({ kind: 'biomass', unit: 'g/m3' })).toBe('basis');
    expect(missing({ kind: 'biomass', basis: 'wet' })).toBe('unit');
    expect(missing({ kind: 'density', unit: 'ind per sieve' })).toBe('per volume or per area');
    expect(missing({ kind: 'count', effort: { source: 'constant', unit: 'm3' } })).toBe('effort value');
    expect(missing({ kind: 'count', effort: { source: 'constant', value: 5 } })).toBe('effort unit');
    expect(missing({ kind: 'count', effort: { source: 'constant', value: 5, unit: 'bucket' } })).toBe('effort volume or area');
    expect(missing({ kind: 'count', effort: { source: 'column' } })).toBe('effort unit, effort column');
    expect(missing({ kind: 'count' })).toBeUndefined();
  });

  it('a non-integer count blocks with CONV-COUNT-NOT-INTEGER; the cell is not converted; a density may have decimals', () => {
    const r = run([['A', 'S', 2.5, 4], ['B', 'S', 3, 4]], { kind: 'count' });
    const f = find(r.blocking, 'CONV-COUNT-NOT-INTEGER');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: 'Calanus finmarchicus', lines: [2], value: '2.5', params: { count: 1 } });
    expect(r.occurrences.map((o) => o.id)).toEqual(['A:Oithona similis', 'B:Calanus finmarchicus', 'B:Oithona similis']);
    expect(find(run([['A', 'S', 2.5, 4]], { kind: 'density', unit: '#/m3' }).findings, 'CONV-COUNT-NOT-INTEGER')).toEqual([]);
    // 12.0 in a text cell is whole
    expect(find(run([['A', 'S', '12.0', 4]], { kind: 'count' }).findings, 'CONV-COUNT-NOT-INTEGER')).toEqual([]);
  });

  it('a negative value blocks with CONV-NEGATIVE-QUANTITY, for every kind; the cell is not converted', () => {
    for (const q of [{ kind: 'count' as const }, { kind: 'density' as const, unit: '#/m3' }, { kind: 'biomass' as const, unit: 'g/m3', basis: 'dry' as const }]) {
      const r = run([['A', 'S', -1, 4]], q, true);
      const f = find(r.blocking, 'CONV-NEGATIVE-QUANTITY');
      expect(f, q.kind).toHaveLength(1);
      expect(f[0]).toMatchObject({ field: 'Calanus finmarchicus', lines: [2], value: '-1' });
      expect(r.occurrences.map((o) => o.scientificName)).toEqual(['Oithona similis']);
    }
  });

  it('a negative or zero effort blocks', () => {
    const header = [...HEADER, 'Volume filtered [m3]'];
    const mk = (v: Cell) => convert({ sheets: [sheetInput(fileOf(header, [['A', 'S', 3, 4, v]]), { quantity: { kind: 'count', effort: { source: 'column' } } })] });
    expect(find(mk(-2).blocking, 'CONV-NEGATIVE-QUANTITY')[0].field).toBe('Volume filtered [m3]');
    expect(find(mk(0).blocking, 'CONV-EFFORT-INVALID')).toHaveLength(1);
    expect(find(mk('n/a').blocking, 'CONV-EFFORT-INVALID')).toHaveLength(1);
    expect(find(mk(null).blocking, 'CONV-EFFORT-INVALID')).toHaveLength(1);
    expect(mk(2.5).blocking).toEqual([]);
  });

  it('no taxon column blocks', () => {
    const f = fileOf(['Sample', 'Station'], [['A', 'S']]);
    expect(find(convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] }).blocking, 'CONV-NO-TAXON')).toHaveLength(1);
  });

  it('a depth in another unit blocks (nothing is rescaled)', () => {
    const f = fileOf(['Sample', 'Station', 'Depth [cm]', 'Calanus finmarchicus'], [['A', 'S', 500, 3]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    expect(find(r.blocking, 'CONV-DEPTH-UNIT')[0]).toMatchObject({ field: 'Depth [cm]', params: { unit: 'cm' } });
  });
});

describe('concepts', () => {
  it('density: per volume is SDBIOL01 with UPMM, per area of the bed SDBIOL02 with UPMS', () => {
    const v = resolveQuantity({ kind: 'density', unit: 'ind m-3' });
    expect(v).toMatchObject({ ok: true, quantity: { type: P01.densityVolume, unitId: P06.perM3 } });
    const a = resolveQuantity({ kind: 'density', unit: '#/m2', medium: 'bed' });
    expect(a).toMatchObject({ ok: true, quantity: { type: P01.densityAreaBed, unitId: P06.perM2 } });
  });

  it('biomass: the six SDBIOL concepts by basis and dimension, with the P06 unit', () => {
    const t = (basis: 'wet' | 'dry' | 'afdw', unit: string) => (resolveQuantity({ kind: 'biomass', basis, unit, medium: 'bed' }) as { ok: true; quantity: { type?: { code: string }; unitId?: { code: string } } }).quantity;
    expect([t('wet', 'g/m3').type?.code, t('wet', 'g/m2').type?.code]).toEqual(['SDBIOL04', 'SDBIOL05']);
    expect([t('dry', 'g/m3').type?.code, t('dry', 'mg/m2').type?.code]).toEqual(['SDBIOL09', 'SDBIOL08']);
    expect([t('afdw', 'mg/m3').type?.code, t('afdw', 'g/m2').type?.code]).toEqual(['SDBIOL07', 'SDBIOL03']);
    expect([t('wet', 'g/m3').unitId?.code, t('wet', 'g/m2').unitId?.code, t('wet', 'mg/m3').unitId?.code, t('wet', 'mg/m2').unitId?.code]).toEqual(['UGMC', 'UGMS', 'UMMC', 'UMMS']);
  });

  it('a count always uses OCOUNT01 and never a unit id (P06/UCNT is not a count unit)', () => {
    const q = resolveQuantity({ kind: 'count', unit: 'counts' });
    expect(q).toMatchObject({ ok: true, quantity: { type: P01.count } });
    expect((q as { quantity: { unitId?: unknown } }).quantity.unitId).toBeUndefined();
    expect(VERIFIED_CODES).not.toContain('P06/UCNT');
  });

  it('effort: VOLWBSMP with MCUB for a volume in m3, AREABEDS with UMSQ for an area in m2', () => {
    const v = resolveQuantity({ kind: 'count', effort: { source: 'constant', value: '12,5', unit: 'm³' } }, { decimalComma: true });
    expect(v).toMatchObject({ ok: true, quantity: { effort: { type: P01.volumeSampled, unitId: P06.m3, dimension: 'volume', constant: { value: 12.5, text: '12.5' } } } });
    const a = resolveQuantity({ kind: 'count', effort: { source: 'constant', value: 0.1, unit: 'm2' } });
    expect(a).toMatchObject({ ok: true, quantity: { effort: { type: P01.areaSampled, unitId: P06.m2, dimension: 'area' } } });
  });

  it('a unit with no verified P06 is kept as declared, with no id, and an accepted warning; no unit is ever converted', () => {
    const r = convert({ sheets: [sheetInput(fileOf(HEADER, [['A', 'S', 3, 4]]), { quantity: { kind: 'density', unit: 'ind/L' } })] });
    // ind/L is not a verified unit: per volume cannot be read from it, so the declaration asks for it
    expect(find(r.blocking, 'CONV-QUANTITY-UNDECLARED')[0].params.missing).toBe('per volume or per area');
    const ok = convert({ sheets: [sheetInput(fileOf(HEADER, [['A', 'S', 3, 4]]), { quantity: { kind: 'density', unit: 'ind/L', per: 'volume' } })] });
    expect(ok.blocking).toEqual([]);
    expect(find(ok.findings, 'CONV-UNIT-NO-P06')[0]).toMatchObject({ severity: 'warning', params: { unit: 'ind/L' } });
    expect(ok.measurements[0]).toMatchObject({ measurementUnit: 'ind/L', measurementTypeId: P01.densityVolume.uri, measurementValue: '3' });
    expect(ok.measurements[0].measurementUnitId).toBeUndefined();
  });

  it('a density per area of the water column has no verified concept: the id stays empty with an accepted warning', () => {
    const r = convert({ sheets: [sheetInput(fileOf(HEADER, [['A', 'S', 3, 4]]), { quantity: { kind: 'density', unit: '#/m2', medium: 'water' } })] });
    expect(r.blocking).toEqual([]);
    expect(find(r.findings, 'CONV-NERC-UNKNOWN')).toHaveLength(1);
    expect(r.measurements[0].measurementTypeId).toBeUndefined();
    expect(r.measurements[0].measurementType).toBe('');
  });

  it('a unit that disagrees with the kind (grams for a density) is not read as a unit of that kind', () => {
    expect(resolveQuantity({ kind: 'density', unit: 'g/m3' })).toEqual({ ok: false, missing: ['per volume or per area'] });
    expect(parseRateUnit('individuals per cubic metre')).toMatchObject({ numerator: 'count', per: 'volume' });
    expect(parseRateUnit('Ind. m^-2')).toMatchObject({ numerator: 'count', per: 'area' });
    expect(parseRateUnit('mg/m³')).toMatchObject({ numerator: 'mg', per: 'volume' });
    expect(parseRateUnit('ind/sieve')).toBeUndefined();
    expect(parseEffortUnit('L')).toEqual({ dimension: 'volume' });
    expect(parseEffortUnit('ha')).toEqual({ dimension: 'area' });
  });
});

describe('only the NERC concepts the spike verified are written', () => {
  const doc = readFileSync(join(__dirname, '..', '..', 'docs', 'research', 'qc-sources.md'), 'utf8');
  const spike = doc.slice(doc.indexOf('Converter (/convert) — stage 0 spike'));

  it('every code in vocab.ts appears in the spike section of docs/research/qc-sources.md, with the URI form BioCheck joins on', () => {
    for (const t of [...Object.values(P01), ...Object.values(P06)]) {
      expect(spike, t.code).toContain(t.code);
      expect(t.uri).toMatch(/^http:\/\/vocab\.nerc\.ac\.uk\/collection\/P0[16]\/current\/[A-Z0-9]+\/$/);
    }
  });

  it('the list is exactly the one of the task: OCOUNT01, SDBIOL01-05 and 07-09, VOLWBSMP, AREABEDS and eight P06 units', () => {
    expect([...VERIFIED_CODES]).toEqual(
      ['P01/AREABEDS', 'P01/OCOUNT01', 'P01/SDBIOL01', 'P01/SDBIOL02', 'P01/SDBIOL03', 'P01/SDBIOL04', 'P01/SDBIOL05', 'P01/SDBIOL07', 'P01/SDBIOL08', 'P01/SDBIOL09', 'P01/VOLWBSMP', 'P06/MCUB', 'P06/UGMC', 'P06/UGMS', 'P06/UMMC', 'P06/UMMS', 'P06/UMSQ', 'P06/UPMM', 'P06/UPMS'].sort(),
    );
  });

  it('SDBIOL10 (deprecated) and Q01 are never written', () => {
    for (const code of VERIFIED_CODES) expect(code).not.toMatch(/SDBIOL10|Q01|UCNT/);
  });
});

describe('per area needs an explicit medium (no default)', () => {
  it('density or biomass per area without the choice is undeclared, naming "medium"; per volume needs none', () => {
    expect(resolveQuantity({ kind: 'density', unit: '#/m2' })).toEqual({ ok: false, missing: ['medium'] });
    expect(resolveQuantity({ kind: 'biomass', unit: 'g/m2', basis: 'dry' })).toEqual({ ok: false, missing: ['medium'] });
    expect(resolveQuantity({ kind: 'density', unit: 'ind/sieve', per: 'area' })).toEqual({ ok: false, missing: ['medium'] });
    expect(resolveQuantity({ kind: 'density', unit: '#/m3' })).toMatchObject({ ok: true });
    const r = run([['A', 'S', 3, 4]], { kind: 'density', unit: '#/m2' });
    expect(find(r.blocking, 'CONV-QUANTITY-UNDECLARED')[0].params.missing).toBe('medium');
    expect(r.measurements).toEqual([]);
  });

  it('the bed has its concept; the water column keeps CONV-NERC-UNKNOWN', () => {
    expect(resolveQuantity({ kind: 'density', unit: '#/m2', medium: 'bed' })).toMatchObject({ ok: true, quantity: { type: P01.densityAreaBed } });
    const w = resolveQuantity({ kind: 'density', unit: '#/m2', medium: 'water' });
    expect(w).toMatchObject({ ok: true, quantity: { noTypeFor: expect.stringContaining('water column') } });
  });
});

describe('a typed sample size (M3)', () => {
  const header = ['Sample', 'Station', 'Calanus finmarchicus'];
  const run2 = (value: string, decimalComma: boolean) =>
    convert({ sheets: [sheetInput(fileOf(header, [['A', 'S', 3]], 'S', { decimalComma }), { quantity: { kind: 'count', effort: { source: 'constant', value, unit: 'm3' } } })] });

  it('is read with the decimal setting of the sheet and written with a dot', () => {
    const r = run2('12,5', true);
    expect(r.blocking).toEqual([]);
    expect(r.events.find((e) => e.id === 'A')).toMatchObject({ sampleSizeValue: '12.5', sampleSizeUnit: 'm3' });
    expect(r.measurements.find((m) => m.role === 'effort')?.measurementValue).toBe('12.5');
    const dot = run2('12.5', false);
    expect(dot.events.find((e) => e.id === 'A')?.sampleSizeValue).toBe('12.5');
  });

  it('a non-number, a zero, a negative or a comma on a dot sheet is CONV-EFFORT-INVALID and no effort is written', () => {
    for (const [v, comma] of [['abc', false], ['0', false], ['-3', false], ['12,5', false], ['12.5', true], ['1,2,3', true]] as const) {
      const r = run2(v, comma);
      const f = find(r.blocking, 'CONV-EFFORT-INVALID');
      expect(f, `${v} ${comma}`).toHaveLength(1);
      expect(f[0].value).toBe(v);
      expect(r.measurements.filter((m) => m.role === 'effort')).toEqual([]);
      expect(find(r.findings, 'CONV-QUANTITY-UNDECLARED')).toEqual([]);
    }
    // nothing typed is still "missing", not "invalid"
    expect(find(run2('', false).blocking, 'CONV-QUANTITY-UNDECLARED')[0].params.missing).toBe('effort value');
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A biomass / weight column whose header holds no unit: the unit is left empty (never guessed) and every such value is said (CONV-BIOMASS-UNIT-UNCLEAR, variant none). Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { exportAllowed, judge } from '../../src/core/convert/policy';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const rows = (n: number): Cell[][] => Array.from({ length: n }, (_, i) => [`s${i + 1}`, '2020-06-01', 49.4, 0.2, i % 2 === 0 ? 'Solea solea' : 'Merlangius merlangus', 3 + i, 10.5 + i]);
const run = (weight: string, edit: Record<string, ColumnRole> = {}) =>
  convert({ sheets: [sheetInput(fileOf(['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', weight], rows(6)), { shape: 'long', quantity: { kind: 'count' }, edit: { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, [weight]: { kind: 'biomass', basis: 'wet' }, ...edit } })] });
const none = (r: ReturnType<typeof run>) => r.findings.filter((f) => f.ruleId === 'CONV-BIOMASS-UNIT-UNCLEAR');

describe('a weight column with no unit in its header', () => {
  for (const header of ['Biomass', 'Wet weight', 'Weight']) {
    it(`"${header}" writes an empty unit and says so, naming the column and the number of values`, () => {
      const r = run(header);
      const f = none(r);
      expect(f).toHaveLength(1);
      expect(f[0].field).toBe(header);
      expect(f[0].params).toMatchObject({ count: 6, none: 'yes' });
      expect(f[0].lines).toHaveLength(6);
      expect(r.measurements.filter((m) => m.role === 'biomass').every((m) => m.measurementUnit === undefined)).toBe(true);
      // it must be accepted before the export
      expect(judge(r.findings).acceptRules).toContain('CONV-BIOMASS-UNIT-UNCLEAR');
      expect(exportAllowed(r.findings, [])).toBe(false);
      for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain(header);
    });
  }

  it('a unit in the header, in brackets or as a word of the name, says nothing', () => {
    expect(none(run('Biomass [g]'))).toHaveLength(0);
    expect(none(run('weight_kg_total'))).toHaveLength(0);
  });

  it('a name whose unit is not understood in full keeps its own wording (not the none variant)', () => {
    const f = none(run('weight_kg_total_fresh_rest'));
    for (const x of f) expect(x.params.none).toBeUndefined();
  });
});

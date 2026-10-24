// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { oxygenRangeSkipped } from '../../src/core/checks/chemistry';
import { runChecks } from '../../src/core/checks/run';
import { translate } from '../../src/core/i18n/ui';
import { LANGS } from '../../src/core/types';
import { makeCDataset, type VarSpec } from './c.helpers';

const ds = (unit: string | undefined, xs: string[]) => {
  const vars: VarSpec[] = [{ key: 'x', header: 'x', canonical: 'oxygen', ...(unit ? { unit } : {}) }];
  return makeCDataset({ id: 'a', vars }, xs.map((x) => ({ v: { x } })));
};

describe('oxygen in a unit CHEM-RANGE does not use: said, not silently skipped', () => {
  it('per-volume units with values are named in the report; per-kilogram, no unit and empty columns are not', () => {
    for (const unit of ['µmol/L', 'mL/L', 'mg/L']) {
      expect(oxygenRangeSkipped(ds(unit, ['900', '300'])), unit).toBe(true);
      expect(runChecks({ datasets: [ds(unit, ['900'])], records: [], parseFindings: [] }, { land: null }).notChecked).toContain('notChecked.oxygenUnit');
    }
    expect(oxygenRangeSkipped(ds('µmol/kg', ['900']))).toBe(false);
    expect(oxygenRangeSkipped(ds(undefined, ['900']))).toBe(false);
    expect(oxygenRangeSkipped(ds('mL/L', []))).toBe(false);
    expect(runChecks({ datasets: [ds('µmol/kg', ['900'])], records: [], parseFindings: [] }, { land: null }).notChecked).not.toContain('notChecked.oxygenUnit');
  });

  it('the note exists in every language and never converts (no density is guessed)', () => {
    const texts = LANGS.map((l) => translate(l, 'notChecked.oxygenUnit'));
    expect(new Set(texts).size).toBe(LANGS.length);
  });
});

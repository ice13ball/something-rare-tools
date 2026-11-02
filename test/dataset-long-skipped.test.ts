// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A long sheet in which another row has the same key and parameter with a different value: only the first is kept, and that is now said (ROW-LONG-VALUE-SKIPPED). Every row is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/core/dataset';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import { renderPlain } from '../src/core/report';
import { LANGS } from '../src/core/types';
import { textFile } from './helpers/files';

/** 2 stations x 3 parameters x 3 levels of the column `level` = 18 source values. */
const sheet = (level: string, dup = false): string => {
  const lines = [`Station,Latitude,Longitude,Date,${level},Parameter,Value`];
  for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) for (const l of [1, 2, 3]) lines.push(`${s},49.4,0.2,2020-06-01,${l},${p},${dup ? 7 : l + s.length + p.length}`);
  return lines.join('\n');
};
const build = (text: string) => {
  const file = textFile('long.csv', text);
  const layout = proposeLayout(file);
  return buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
};

describe('ROW-LONG-VALUE-SKIPPED', () => {
  for (const level of ['Pressure [dbar]', 'Replicate', 'Cast', 'Layer', 'Size class', 'Time point', 'Bottom depth [cm]']) {
    it(`${level}: 18 source values, 6 kept, 12 said`, () => {
      const { dataset, findings } = build(sheet(level));
      // (a level column that is a key, like a depth, would keep all 18; these are not part of the row's identity)
      const kept = dataset.rows.flatMap((r) => Object.values(r.values)).length;
      const f = findings.filter((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED');
      if (kept === 18) {
        expect(f).toHaveLength(0);
        return;
      }
      expect(kept).toBe(6);
      expect(f).toHaveLength(1);
      expect(f[0].params.count).toBe(12);
      expect(f[0].lines).toHaveLength(12);
      expect(['Corg', 'Ntot', 'Ptot']).toContain(f[0].field);
      for (const lang of LANGS) {
        const text = renderPlain(f[0], lang);
        expect(text).toContain('12');
        expect(text).not.toMatch(/[{}]/);
      }
    });
  }

  it('Pressure and Replicate really are the cases (the findings fire)', () => {
    for (const level of ['Pressure [dbar]', 'Replicate']) {
      const { findings } = build(sheet(level));
      expect(findings.some((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED'), level).toBe(true);
    }
  });

  it('exact duplicates (the same value again) do not fire', () => {
    const { findings } = build(sheet('Replicate', true));
    expect(findings.filter((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
  });

  it('the kept value and the row counts are as before: the first one stays', () => {
    const { dataset } = build(sheet('Replicate'));
    expect(dataset.rows).toHaveLength(2);
    expect(Object.values(dataset.rows[0].values).map((v) => v.raw)).toEqual(['7', '7', '7']);
  });
});

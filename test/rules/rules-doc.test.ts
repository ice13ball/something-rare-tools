// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// docs/rules.md is generated. To regenerate after editing a rule:
//   UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rulesDoc } from '../../scripts/rules-doc';
import { RULES } from '../../src/core/rules/registry';

const DOC = join(__dirname, '..', '..', 'docs', 'rules.md');

describe('docs/rules.md', () => {
  it('is up to date with the registry', () => {
    if (process.env.UPDATE_RULES_DOC === '1') writeFileSync(DOC, rulesDoc());
    expect(readFileSync(DOC, 'utf8')).toBe(rulesDoc());
  });

  it('lists every rule with its severity, category, threshold values with units and citation urls', () => {
    const doc = rulesDoc();
    for (const r of RULES) {
      const row = doc.split('\n').find((l) => l.startsWith(`| ${r.id} |`));
      expect(row, r.id).toBeDefined();
      expect(row).toContain(`| ${r.severity} |`);
      expect(row).toContain(`| ${r.category} |`);
      for (const t of r.thresholds ?? []) {
        expect(row, `${r.id} ${t.name}`).toContain(`${t.name} = ${t.value} ${t.unit}`);
        expect(row).toContain(t.citation.url);
      }
      for (const c of r.citations ?? []) expect(row).toContain(c.url);
    }
  });

  it('is a well-formed table: every data row has the same number of cells', () => {
    const rows = rulesDoc().split('\n').filter((l) => l.startsWith('| '));
    const cells = (l: string): number => l.split(/(?<!\\)\|/).length;
    expect(rows.length).toBe(RULES.length + 1); // header + rules (the separator starts with |---)
    for (const l of rows) expect(cells(l)).toBe(cells(rows[0]));
  });
});

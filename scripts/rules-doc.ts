// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { RULES } from '../src/core/rules/registry';
import type { Citation, RuleDef } from '../src/core/types';

/**
 * Markdown table of every rule: id, severity, category, thresholds (value + unit) and citations.
 * docs/rules.md must equal this output; test/rules/rules-doc.test.ts compares them and, with
 * UPDATE_RULES_DOC=1, rewrites the file.
 */
const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const link = (c: Citation): string => `[${esc(c.label)}](${c.url})${c.locator ? `, ${esc(c.locator)}` : ''}`;

function thresholdCell(r: RuleDef): string {
  if (!r.thresholds?.length) return '—';
  return r.thresholds.map((t) => `${esc(t.name)} = ${t.value} ${esc(t.unit)}`).join('<br>');
}

function citationCell(r: RuleDef): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...(r.thresholds ?? []).map((t) => t.citation), ...(r.citations ?? [])]) {
    const text = link(c);
    if (!seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out.length ? out.join('<br>') : '—';
}

export function rulesDoc(): string {
  const lines = [
    '# Rules',
    '',
    'Generated from `src/core/rules/` by `scripts/rules-doc.ts` — do not edit by hand.',
    'Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts`.',
    'Every number a rule compares against is listed here with its source (`docs/research/qc-sources.md`).',
    'Each row ends with an invisible anchor named after the rule id: the ⓘ explanations link to `docs/rules.md#<RULE-ID>`.',
    '',
    '| id | severity | category | thresholds | citations |',
    '|---|---|---|---|---|',
    ...RULES.map((r) => `| ${r.id} | ${r.severity} | ${r.category} | ${thresholdCell(r)} | ${citationCell(r)}<a id="${r.id}"></a> |`),
    '',
  ];
  return lines.join('\n');
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, RuleDef } from '../types';
import { CHEMISTRY_RULES } from './chemistry';
import { CROSSFILE_RULES } from './crossfile';
import { INPUT_RULES } from './input';
import { LICENCE_RULES } from './licence';
import { METADATA_RULES } from './metadata';
import { ROW_RULES } from './rows';
import { GENERIC_PARAMS } from './spec';
import type { RuleSpec } from './spec';

export { GENERIC_PARAMS };
export type { RuleSpec };

const SPECS: readonly RuleSpec[] = [
  ...INPUT_RULES,
  ...LICENCE_RULES,
  ...METADATA_RULES,
  ...ROW_RULES,
  ...CROSSFILE_RULES,
  ...CHEMISTRY_RULES,
];

/** All rules, in category-file order. */
export const RULES: readonly RuleDef[] = SPECS.map(({ params: _params, ...def }) => def);

/** Declared template params per rule id (the generic fields file/sheet/lines/field/value are always available). */
export const RULE_PARAMS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  SPECS.map((s) => [s.id, s.params]),
);

const BY_ID: ReadonlyMap<string, RuleDef> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): RuleDef {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`Unknown rule id: ${id}`);
  return rule;
}

/**
 * The cited number a rule compares against. Checks MUST call this instead of typing a number.
 * Throws on an unknown rule or threshold name, so a typo cannot silently become a fallback.
 */
export function threshold(ruleId: string, name: string): number {
  const t = getRule(ruleId).thresholds?.find((x) => x.name === name);
  if (!t) throw new Error(`Rule ${ruleId} has no threshold "${name}"`);
  return t.value;
}

/** Creates a Finding with the severity of its rule; lines are sorted and de-duplicated. */
export function makeFinding(
  ruleId: string,
  f: Omit<Finding, 'ruleId' | 'severity' | 'params'> & { params?: Finding['params'] },
): Finding {
  const rule = getRule(ruleId);
  const finding: Finding = { ...f, ruleId, severity: rule.severity, params: { ...(f.params ?? {}) } };
  if (f.lines) finding.lines = [...new Set(f.lines)].sort((a, b) => a - b);
  return finding;
}

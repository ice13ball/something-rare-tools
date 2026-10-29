// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, RuleDef } from '../types';
import { CONVERT_RULES } from './convert';
import { CHECK_RULES, CHECK_RULE_PARAMS, GENERIC_PARAMS, makeFindingOf, thresholdOf } from './registryCheck';
import type { RuleSpec } from './registryCheck';

/*
 * The FULL public registry: every rule of the tool, the converter's included, in category-file order. docs/rules.md, the tests and the converter's overall checks read it.
 * The pages and workers that never raise a converter rule (/check, /licence, /collection) import registryCheck.ts instead, so the converter's texts (about half of all rule text) are
 * not in their bundle.
 */
export { GENERIC_PARAMS };
export type { RuleSpec };

/** All rules, in category-file order. */
export const RULES: readonly RuleDef[] = [...CHECK_RULES, ...CONVERT_RULES.map(({ params: _params, ...def }) => def)];

/** Declared template params per rule id (the generic fields file/sheet/lines/field/value are always available). */
export const RULE_PARAMS: Readonly<Record<string, readonly string[]>> = {
  ...CHECK_RULE_PARAMS,
  ...Object.fromEntries(CONVERT_RULES.map((s) => [s.id, s.params])),
};

const BY_ID: ReadonlyMap<string, RuleDef> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): RuleDef {
  const rule = BY_ID.get(id);
  if (!rule) throw new Error(`Unknown rule id: ${id}`);
  return rule;
}

/** The cited number a rule compares against. Throws on an unknown rule or threshold name, so a typo cannot silently become a fallback. */
export function threshold(ruleId: string, name: string): number {
  return thresholdOf(getRule(ruleId), name);
}

/** Creates a Finding with the severity of its rule; lines are sorted and de-duplicated. */
export function makeFinding(
  ruleId: string,
  f: Omit<Finding, 'ruleId' | 'severity' | 'params'> & { params?: Finding['params'] },
): Finding {
  return makeFindingOf(getRule(ruleId), ruleId, f);
}

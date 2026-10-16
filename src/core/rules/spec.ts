// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDef } from '../types';

/**
 * A rule as written in the category files: a RuleDef plus the names of the `params` the checks
 * pass for it. The registry strips `params` from the public RULES list and exposes it as RULE_PARAMS,
 * so the param contract of each rule is machine-checked (technical template must use every one).
 */
export interface RuleSpec extends RuleDef {
  params: readonly string[];
}

/**
 * Placeholders every template may use without declaring them. They are filled from the Finding itself
 * (`lines` rendered as compact ranges, e.g. "17–21, 263–268"). Any other placeholder must be a declared
 * param, or `threshold.<name>` (filled from the rule's own thresholds, never from the caller).
 */
export const GENERIC_PARAMS = ['file', 'sheet', 'lines', 'field', 'value'] as const;

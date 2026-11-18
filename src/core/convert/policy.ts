// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ExportPolicy, Finding } from '../types';
import { RULES } from '../rules/registry';

/*
 * What a finding does to the export (plan 3.4). Severity alone is not the policy: ROW-DATE-UNPARSEABLE is a warning on /check and blocks here (T7),
 * ROW-NON-NUMERIC is a warning that the user may accept, and a check about a ship's speed never stops an export. The policy is the `exportPolicy` field of each rule definition (src/core/rules/*.ts), the comments of the old lists moved there.
 *
 *   block   the export is impossible until the cause is removed
 *   accept  a warning the user accepts, once per rule and per run, before the export button works (nothing is stored)
 *   show    shown, never blocks and never needs an answer
 *
 * A registered rule's policy follows the rule, not the severity a finding carries.
 * An id that is in no registry (a test's invented id) is `block` when its severity is error (a rule nobody has judged must not let a bad archive through) and `show` otherwise.
 * ROW-NO-COORD (policy block) is raised by the Event checks only for an event whose own position is blank AND that has no ancestor with a position (the dataset
 * builder lets a child inherit a parent's position), so every ROW-NO-COORD finding of this tool is "an event with no positioned ancestor".
 */

export type Policy = ExportPolicy;

const POLICY_BY_ID: ReadonlyMap<string, Policy> = new Map(RULES.map((r) => [r.id, r.exportPolicy]));

/** The policy of one finding: the field of its rule; an id no registry knows is `block` for an error and `show` otherwise. */
export function policyOf(f: Pick<Finding, 'ruleId' | 'severity'>): Policy {
  return POLICY_BY_ID.get(f.ruleId) ?? (f.severity === 'error' ? 'block' : 'show');
}

/** The ids of the rules with this policy, in registry order. */
export function rulesWithPolicy(p: Policy): string[] {
  return RULES.filter((r) => r.exportPolicy === p).map((r) => r.id);
}

export interface Judged {
  blocking: Finding[];
  /** The findings that need an acceptance, and the distinct rule ids of them in order of first appearance: one tick per rule. */
  toAccept: Finding[];
  acceptRules: string[];
  showOnly: Finding[];
}

/** Sorts findings by policy. */
export function judge(findings: readonly Finding[]): Judged {
  const out: Judged = { blocking: [], toAccept: [], acceptRules: [], showOnly: [] };
  for (const f of findings) {
    const p = policyOf(f);
    if (p === 'block') out.blocking.push(f);
    else if (p === 'accept') {
      out.toAccept.push(f);
      if (!out.acceptRules.includes(f.ruleId)) out.acceptRules.push(f.ruleId);
    } else out.showOnly.push(f);
  }
  return out;
}

/** True when nothing blocks and every rule that needs an acceptance is in `accepted`. */
export function exportAllowed(findings: readonly Finding[], accepted: readonly string[]): boolean {
  const j = judge(findings);
  return j.blocking.length === 0 && j.acceptRules.every((r) => accepted.includes(r));
}

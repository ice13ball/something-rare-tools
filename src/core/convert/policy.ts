// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding } from '../types';

/*
 * What a finding does to the export (plan 3.4). Severity alone is not the policy: ROW-DATE-UNPARSEABLE is a warning on /check and blocks here (T7),
 * ROW-NON-NUMERIC is a warning that the user may accept, and a check about a ship's speed never stops an export. The policy is these lists, by rule id.
 *
 *   block   the export is impossible until the cause is removed
 *   accept  a warning the user accepts, once per rule and per run, before the export button works (nothing is stored)
 *   show    shown, never blocks and never needs an answer
 *
 * A rule that is on no list is `block` when its severity is error (a rule nobody has judged must not let a bad archive through) and `show` otherwise.
 * ROW-NO-COORD is raised by the Event checks only for an event whose own position is blank AND that has no ancestor with a position (the dataset
 * builder lets a child inherit a parent's position), so every ROW-NO-COORD finding of this tool is "an event with no positioned ancestor".
 */

/** Blocking: findings of the OUTPUT tables (Event through buildDatasets + runChecks, Occurrence through checkRawTable). */
export const BLOCK_OUTPUT_RULES: readonly string[] = [
  'DWC-TERM-MISSING',
  'DWC-TERM-EMPTY',
  'DWC-EVENTID-DUPLICATE',
  'DWC-PARENT-DANGLING',
  'DWC-PARENT-LOOP',
  'DWC-OCCURRENCEID-DUPLICATE',
  'DWC-VOCAB-VALUE',
  'ROW-ZERO-COORD',
  'ROW-LAT-RANGE',
  'ROW-LON-RANGE',
  'ROW-DEPTH-MIN-MAX',
  'ROW-DATE-UNPARSEABLE',
  'ROW-NO-COORD',
];

/** Blocking: findings of the INPUT, for a sheet chosen for conversion. */
export const BLOCK_INPUT_RULES: readonly string[] = ['IN-LAYOUT-UNSUPPORTED', 'IN-FILE-UNREADABLE', 'ROW-RAGGED'];

/** Blocking: the converter's own rules. (CONV-WORMS-UNDECIDED is raised from stage 4 on, after a WoRMS lookup.) */
export const BLOCK_CONV_RULES: readonly string[] = [
  'CONV-COLUMN-UNNAMED',
  'CONV-LONG-UNSUPPORTED',
  'CONV-QUANTITY-UNDECLARED',
  'CONV-COUNT-NOT-INTEGER',
  'CONV-NEGATIVE-QUANTITY',
  'CONV-SAMPLE-CODE-MISSING',
  'CONV-PROFILE-NO-STATION',
  'CONV-PROFILE-LEVEL-INCOMPLETE',
  'CONV-ID-DUPLICATE',
  'CONV-TAB-IN-VALUE',
  'CONV-EMOF-ORPHAN',
  'CONV-EMOF-EVENT-MISMATCH',
  'CONV-EMOF-VALUE-EMPTY',
  'CONV-EMOF-TYPE-EMPTY',
  'CONV-BASIS-UNSET',
  'CONV-LICENCE-UNSET',
  'CONV-EML-MISSING',
  'CONV-SPLIT-UNDECIDED',
  'CONV-MESH-INVALID',
  'CONV-WORMS-UNDECIDED',
  'CONV-NO-OCCURRENCES',
  'CONV-PROFILE-NOTHING-READ',
  'CONV-SEAFLOOR-UNIT',
  'CONV-SEAFLOOR-VALUE',
];

/** Warnings the user must accept (per rule, per run) before exporting. */
export const ACCEPT_RULES: readonly string[] = [
  // the header had fewer names than the rows have values: the tool cannot know where names are missing, so values may sit under another column's name (/check: a warning)
  'IN-HEADER-SHORT',
  'ROW-NON-NUMERIC',
  'ROW-INVISIBLE-CHAR',
  'ROW-DATE-FUTURE',
  'ROW-DEPTH-RANGE',
  // a coordinate and its hemisphere letter disagree or the letter is missing: the value is written as it stands, the user has seen it
  'ROW-HEMISPHERE-CONFLICT',
  'ROW-HEMISPHERE-MISSING',
  'DWC-RECOMMENDED',
  'CONV-TEXT-IN-TAXON-CELL',
  'CONV-TAXON-SAME-EVENT',
  'CONV-WORMS-NO-MATCH',
  'CONV-WORMS-NOT-MARINE',
  'CONV-NERC-UNKNOWN',
  'CONV-NERC-UNIT-MISMATCH',
  'CONV-UNIT-NO-P06',
  'CONV-COLUMN-NOT-EXPORTED',
  'CONV-NAMEID-MISSING',
  'CONV-NAMEID-APHIA-LIKE',
  'CONV-NAMEID-INCOMPLETE',
  'CONV-NAMEID-CONFLICT',
  'CONV-DEVICE-MISSING',
  'CONV-PROFILE-STATION-UNMATCHED',
  'CONV-PROFILE-STATION-FAR',
  'CONV-PROFILE-PRESSURE-NO-UNIT',
  'CONV-LICENCE-DIFFERS',
  'CONV-NO-SAMPLING-DESCRIPTOR',
  'CONV-SEAFLOOR-NO-SITE-DEPTH',
];

/** Never blocks, never asks: shown only. Prefixes of rule ids. */
export const SHOW_ONLY_PREFIXES: readonly string[] = ['CHEM-', 'ROW-SHIP-SPEED', 'ROW-ON-LAND', 'ROW-STATION-', 'XF-', 'META-', 'LIC-'];

/** Rules the plan lists but a later stage raises: in the lists above so the policy is complete, not yet in the registry. Each is registered with its stage. (The WoRMS rules came with stage 4, the profile rules with stage 6: none is left.) */
export const LATER_STAGE_RULES: readonly string[] = [];

export type Policy = 'block' | 'accept' | 'show';

const BLOCK = new Set<string>([...BLOCK_OUTPUT_RULES, ...BLOCK_INPUT_RULES, ...BLOCK_CONV_RULES]);
const ACCEPT = new Set<string>(ACCEPT_RULES);

/** The policy of one finding. */
export function policyOf(f: Pick<Finding, 'ruleId' | 'severity'>): Policy {
  if (SHOW_ONLY_PREFIXES.some((p) => f.ruleId.startsWith(p))) return 'show';
  if (BLOCK.has(f.ruleId)) return 'block';
  if (ACCEPT.has(f.ruleId)) return 'accept';
  return f.severity === 'error' ? 'block' : 'show';
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

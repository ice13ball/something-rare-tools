// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/**
 * The full English description of one rule, written by hand and checked against the code that raises the rule.
 * Plain prose: no `{placeholders}`, no markdown headings. test/rules/rule-docs.test.ts guards the shape.
 */
export interface RuleDoc {
  /** What the rule checks and why it matters. Its first sentence is the title of the rule in the printable references. */
  checks: string;
  /** Exactly when it fires: conditions, thresholds with their source, exceptions. */
  fires: string;
  /** One short invented input that triggers it. Never real data. */
  example: string;
  /** What the person can do, including the declaration, answer or companion-file key that settles it and, where the rule reaches /convert, its export policy (block, accept or show). */
  action: string;
}

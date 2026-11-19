// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { DOCS as chemistry } from './chemistry';
import { DOCS as convert } from './convert';
import { DOCS as crossfile } from './crossfile';
import { DOCS as dwc } from './dwc';
import { DOCS as input } from './input';
import { DOCS as licence } from './licence';
import { DOCS as metadata } from './metadata';
import { DOCS as rows } from './rows';
import type { RuleDoc } from './types';

export type { RuleDoc } from './types';

/** Every rule description, all families together. */
export const RULE_DOCS: Readonly<Record<string, RuleDoc>> = {
  ...input, ...chemistry, ...crossfile, ...rows, ...dwc, ...metadata, ...licence, ...convert,
};

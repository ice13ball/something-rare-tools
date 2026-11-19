// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { DOCS as partA } from './convert-a';
import { DOCS as partB } from './convert-b';
import type { RuleDoc } from './types';

/** Descriptions of the converter rules (src/core/rules/convert.ts), written in two parts in registry order. */
export const DOCS: Readonly<Record<string, RuleDoc>> = { ...partA, ...partB };

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { SHIP_SPEED_MIN_SEPARATION_KM } from '../core/checks/constants';
import { getRule } from '../core/rules/registry';
import type { Lang } from '../core/types';
import { withUnit, type TipValues } from './tips';

/*
 * The tip values that come from the rule definitions. Loaded on demand (tips.tsx: `lazy`), because the definitions are all four languages of
 * every rule: a page whose tips do not print a threshold must not carry them.
 */

export function thresholdOf(ruleId: string, name: string) {
  const th = getRule(ruleId).thresholds?.find((x) => x.name === name);
  if (!th) throw new Error(`Rule ${ruleId} has no threshold "${name}"`);
  return th;
}

/** "40 knots": value and unit of a rule's threshold. */
const thresholdText = (ruleId: string, name: string) => (lang: Lang) => {
  const th = thresholdOf(ruleId, name);
  return withUnit(th.value, th.unit, lang);
};

/** The short name of a threshold's source, linked: "Met Office marine-qc" (the citation label up to its first comma or bracket). */
export const shortSource = (label: string): string => label.split(/[,(]/)[0].trim();
const thresholdSource = (ruleId: string, name: string) => () => {
  const c = thresholdOf(ruleId, name).citation;
  return c.url.startsWith('https://') ? (
    <a href={c.url} target="_blank" rel="noopener noreferrer">
      {shortSource(c.label)}
    </a>
  ) : (
    shortSource(c.label)
  );
};

/** The ship-speed tip (the one-cruise checkbox): both cited limits and the stated minimum separation. */
export const SHIP_SPEED_VALUES: TipValues = {
  extreme: thresholdText('ROW-SHIP-SPEED', 'speed.extreme'),
  extremeSrc: thresholdSource('ROW-SHIP-SPEED', 'speed.extreme'),
  unusual: thresholdText('ROW-SHIP-SPEED-UNUSUAL', 'speed.unusual'),
  unusualSrc: thresholdSource('ROW-SHIP-SPEED-UNUSUAL', 'speed.unusual'),
  minSeparation: (lang: Lang) => withUnit(SHIP_SPEED_MIN_SEPARATION_KM, 'km', lang),
};

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { foldDiacritics, headerKey } from '../recognize/vocab';

/*
 * Depth below the seafloor of a sediment or porewater sample (the converter role "depth below seafloor").
 *
 * Where it goes. Darwin Core: minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters are "distance from a reference surface in the vertical direction, in meters. Use
 * positive values for locations above the surface, negative values for locations below. If depth measures are given, the reference surface is the location given by the depth" (dwc.tdwg.org/terms,
 * read 2026-10-26; its own example is a 1.5 m sediment core under 20 m of water: minimumDepthInMeters 20, maximumDepthInMeters 20, maximumDistanceAboveSurfaceInMeters -1.5). The OBIS Manual,
 * "Darwin Core" (manual.obis.org/darwin_core.html): "If a depth is given (i.e. value >0), the reference surface is the location of the depth. This can be especially useful for sediment cores
 * taken from the sea bottom ... In these cases the minimumDistanceAboveSurfaceInMeters / maximumDistanceAboveSurfaceInMeters would be a negative value." So the water depth of the site is the
 * plain depth (minimum/maximumDepthInMeters) and the depth in the sediment is a NEGATIVE distance in metres.
 *
 * The one unit conversion. A depth below the seafloor in centimetres is written in metres by moving the decimal point two places, done ON THE TEXT of the cell: no float, no rounding, every digit
 * kept ("0.5" cm is "-0.005", "12.30" cm is "-0.1230"). A depth in metres is only given its sign. This is the only unit conversion the converter makes anywhere; any other unit is refused
 * (CONV-SEAFLOOR-UNIT) and the depth column of a plain depth is never rescaled (CONV-DEPTH-UNIT).
 *
 * A single column is one depth of the sample: minimum = maximum. (The two Darwin Core terms are "lesser" and "greater" distance, and the example above lists the top as the minimum, so a pair
 * of top and bottom columns would have to settle an inconsistency of the standard; that is not read here.)
 */

export type SeafloorUnit = 'cm' | 'm';

/** The unit text of a column as cm or m, or undefined (no unit, mm, ft, a word that is none of them). */
export function seafloorUnitOf(unit: string | undefined): SeafloorUnit | undefined {
  if (unit === undefined) return undefined;
  const k = unit.trim().toLowerCase().replace(/\./g, '');
  if (k === 'cm' || k === 'centimetre' || k === 'centimetres' || k === 'centimeter' || k === 'centimeters') return 'cm';
  if (k === 'm' || k === 'metre' || k === 'metres' || k === 'meter' || k === 'meters') return 'm';
  return undefined;
}

export type SeafloorText = { ok: true; text: string } | { ok: false; reason: 'negative' | 'notation' };

/**
 * `plain` is the number as the exported numbers are written (sourceNumberText: a plain decimal, a decimal comma already a point), or undefined when the cell has no exact plain text
 * (an exponent, degrees, a flipped sign). Returns the negative distance in metres as text.
 */
export function seafloorMetres(plain: string | undefined, unit: SeafloorUnit): SeafloorText {
  if (plain === undefined || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(plain)) return { ok: false, reason: 'notation' };
  if (plain.startsWith('-') && !/^-0*\.?0*$/.test(plain)) return { ok: false, reason: 'negative' };
  const [intRaw, frac = ''] = plain.replace(/^[+-]/, '').split('.');
  const digits = `${intRaw}${frac}`;
  const shift = unit === 'cm' ? -2 : 0;
  const pointAt = intRaw.length + shift;
  let whole: string;
  let fraction: string;
  if (pointAt <= 0) {
    whole = '0';
    fraction = `${'0'.repeat(-pointAt)}${digits}`;
  } else if (pointAt >= digits.length) {
    whole = `${digits}${'0'.repeat(pointAt - digits.length)}`;
    fraction = '';
  } else {
    whole = digits.slice(0, pointAt);
    fraction = digits.slice(pointAt);
  }
  whole = whole.replace(/^0+(?=\d)/, '') || '0';
  const tidy = fraction === '' ? whole : `${whole}.${fraction}`;
  // zero has no sign
  return { ok: true, text: /^0*\.?0*$/.test(tidy) ? '0' : `-${tidy}` };
}

/* ---------- recognition (conservative, converter only) ---------- */

/** Whole-name phrases (folded: lower case, no diacritics, punctuation as one space; a unit in brackets already cut off) that name the depth in the sediment. */
const SEAFLOOR_NAME = [
  /\bbelow (?:the )?(?:sea ?floor|seabed|sea bed|sea bottom)\b/,
  /\b(?:cm|m)?bsf\b/,
  /^(?:sediment|core|sediment core|section) depth$/,
  /^depth (?:in|within|of) (?:the )?(?:sediment|core|sediment core)$/,
  /^(?:pore ?water|porewater|pore water) depth$/,
  /^depth (?:of )?(?:pore ?water|porewater)(?: sample)?$/,
  // Polish, German, French
  /^glebokosc (?:w|pod) (?:osadzie|osadzie dennym|rdzeniu|dnem)$/,
  /^glebokosc (?:osadu|rdzenia)$/,
  /^(?:sedimenttiefe|kerntiefe|tiefe im sediment|tiefe im kern|tiefe unter dem meeresboden)$/,
  /^profondeur (?:dans le |dans |du )?(?:sediment|carotte)$/,
];

/** The converter's name test for a header WITHOUT its unit. */
export function isSeafloorName(name: string): boolean {
  const k = headerKey(foldDiacritics(name));
  return SEAFLOOR_NAME.some((r) => r.test(k));
}

/** A plain "Depth" with a centimetre unit, the one shape that needs the sheet to say it is about sediment or porewater. */
export const isPlainDepthName = (name: string): boolean => /^(?:depth|tiefe|profondeur|glebokosc)$/.test(headerKey(foldDiacritics(name)));

/** A header that says the sheet is about pore water, sediment or a core (the converter's overlay looks at every header and at the text cells for it). */
export const SEDIMENT_CONTEXT = /\b(?:pore ?water|porewater|sediments?|sediment core|core|cores)\b/i;

/** The water depth of the SITE (not the depth of a measurement): `Site_depth_m`, `Depth of the site (m)`, `water depth`, `bottom depth`, the station depth. */
const SITE_DEPTH_NAME = [
  /^(?:site|station|sampling site|sampling station|bottom|water|seabed|sea floor|seafloor|total water|local water) depth$/,
  /^depth (?:of|at) (?:the )?(?:site|station|sampling site|sampling station|bottom|seabed|seafloor|sea floor)$/,
  /^(?:site|station) depth m$/,
  /^(?:bottom|water) depth m$/,
  /^glebokosc (?:stanowiska|stacji|dna|wody)$/,
  /^(?:wassertiefe|stationstiefe|bodentiefe)$/,
  /^profondeur (?:du site|de la station|de l eau|du fond)$/,
];

/** True for a header that names the water depth of the site. `name` is the header without its unit. */
export function isSiteDepthName(name: string): boolean {
  const k = headerKey(foldDiacritics(name));
  return SITE_DEPTH_NAME.some((r) => r.test(k));
}

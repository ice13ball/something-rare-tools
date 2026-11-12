// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { foldUnit } from './vocab';
import { isPlainCountUnit } from './columnValues';
import { nameKind } from './measured';
import { isBlankCell, stripTypeSuffix, unitFromHeader } from '../recognize/columns';
import type { ColumnProposal, RawSheet } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * A column named like a total on a long sheet, and a mass unit written in a column name. Kept apart from recognize.ts, which holds no sample-column names of its own
 * (test/convert/recognize.test.ts): the sample columns are named here by role kind, never by header.
 */

const MASS_UNITS = new Set(['kg', 'g', 'mg']);
// mass units a biomass NAME may carry that the P06 table does not know: written whole, with no id, and said
const OTHER_MASS = new Set(['ug', 'µg', 'lb', 'lbs', 'oz', 'gc', 'mgc', 'kgc']);
const isMassWord = (w: string): boolean => MASS_UNITS.has(w) || OTHER_MASS.has(w);
export const massUnitOf = (unit: string | undefined): string | undefined => (unit !== undefined && MASS_UNITS.has(unit.trim().toLowerCase()) ? unit.trim().toLowerCase() : undefined);
/** A unit text whose numerator is a mass: 'kg', 'g/m2', 'mg m-3', 'kg/km2'. */
export const isMassUnitText = (unit: string | undefined): boolean => unit !== undefined && /^(kg|g|mg)(?:$|[\s/])/i.test(unit.trim());

// what may follow a mass unit in a biomass column NAME without being part of the unit: a kind of mass or a word that says what the number is of
const AFTER_UNIT = new Set(['total', 'wet', 'dry', 'ww', 'dw', 'afdw', 'weight', 'wt', 'mass', 'biomass', 'catch', 'tow', 'haul', 'sample', 'taxon', 'species', 'fresh']);
const DENOMINATOR = /^(m2|m3|km2|km3|cm2|cm3|ha|l|ml|m-2|m-3|km-2|m\^2|m\^3|m²|m³|km²)$/i;

/**
 * The unit written in the NAME of a biomass column that has no bracket: the mass unit and, when it is followed by one, its per-area / per-volume part, WHOLE ('biomass_kg_km2' is
 * 'kg/km2', 'wet_weight_mg_m3' is 'mg/m3', 'weight_kg_total' is 'kg'). Only a unit read in full is returned; when a mass unit is there but what follows it is not understood
 * (or two different mass units are), `unclear` holds the words and no unit is returned: a partial unit ('kg' for 'kg per km2') would change the meaning of the number.
 */
export function biomassNameUnit(header: string): { unit?: string; unclear?: string } {
  const tokens = stripTypeSuffix(header)
    .split(/[\s_]+/)
    .filter((t) => t !== '');
  // a word with its own per-area part ('g/m2', 'kg/km2') or a bare mass word
  const split = (t: string): { mass: string; den?: string } | undefined => {
    const lower = t.toLowerCase();
    // kg, g and mg are written in lower case; any other mass unit as the header wrote it (gC stays gC)
    const as = (w: string, original: string): string => (MASS_UNITS.has(w) ? w : original);
    if (isMassWord(lower)) return { mass: as(lower, t) };
    const m = /^([^/]+)\/(.+)$/.exec(t);
    return m !== null && isMassWord(m[1].toLowerCase()) ? { mass: as(m[1].toLowerCase(), m[1]), den: m[2].toLowerCase() } : undefined;
  };
  const at = tokens.findIndex((t) => split(t) !== undefined);
  if (at < 0) return {};
  const first = split(tokens[at]) as { mass: string; den?: string };
  const mass = first.mass;
  if (tokens.some((t, i) => i !== at && split(t) !== undefined && split(t)?.mass !== mass)) return { unclear: tokens.join(' ') };
  const rest = tokens.slice(at + 1).map((t) => t.toLowerCase());
  let denominator = first.den;
  if (denominator !== undefined && !DENOMINATOR.test(denominator)) return { unclear: tokens.slice(at).join(' ') };
  if (denominator === undefined) {
    if (rest[0] === 'per') rest.shift();
    if (rest[0] !== undefined && DENOMINATOR.test(rest[0])) denominator = rest.shift();
    else if (rest[0] === 'm' && /^[23]$/.test(rest[1] ?? '')) {
      denominator = `m${rest[1]}`;
      rest.splice(0, 2);
    }
  }
  const unknown = rest.filter((t) => !AFTER_UNIT.has(t) && !/^\d+$/.test(t));
  if (unknown.length > 0) return { unclear: tokens.slice(at).join(' ') };
  const den = denominator?.replace('^', '').replace('²', '2').replace('³', '3').replace(/^(m|km)-(\d)$/, '$1$2');
  return { unit: den === undefined ? mass : `${mass}/${den}` };
}

/** A mass unit written as a word of the NAME: the whole unit, or undefined (none, or not understood). */
export const massUnitInName = (header: string): string | undefined => biomassNameUnit(header).unit;

/** Words of a header that say a SIZE or a place, not a count: a column named so is not the quantity of a row ('Total length', 'Total depth'). */
const SIZE_WORDS = new Set(['length', 'len', 'width', 'height', 'depth', 'diameter', 'size', 'thickness', 'temperature', 'salinity', 'volume', 'area', 'distance', 'age', 'duration', 'time']);
export function isSizeLikeHeader(header: string): boolean {
  return stripTypeSuffix(header)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => SIZE_WORDS.has(w));
}

/** The columns that make a row part of a sample: where and when it was taken. */
export const SAMPLE_KEY_KINDS = new Set(['sampleId', 'station', 'cruise', 'date', 'datetime', 'datePart', 'time', 'depth', 'replicate']);

/**
 * Does a numeric column repeat one value on all the rows of a sample (an all-taxa total) or differ between them? Rows are grouped by the columns that carry a sample role in `base`.
 * 'constant' when at least half of the samples of more than one row hold one value; 'varies' otherwise; 'unknown' without a sample column, a sample of more than one row, or a number.
 */
export function valuesRepeatWithinSample(sheet: RawSheet, base: readonly ColumnProposal[], index: number, decimalComma: boolean): 'constant' | 'varies' | 'unknown' {
  return withinSample(sheet, base, index, decimalComma).verdict;
}

/**
 * How distinct the values of a column are INSIDE the samples that have more than one row: the mean over those samples of (different values / rows). A length of each organism is nearly
 * always different (L1, L2 ... of a copepod stage: close to 1); a Secchi depth written twice for two casts under one code has 2 values on 8 rows (0.25). `undefined` when no sample has two rows.
 */
export function distinctnessWithinSamples(sheet: RawSheet, base: readonly ColumnProposal[], index: number, decimalComma: boolean): number | undefined {
  return withinSample(sheet, base, index, decimalComma).distinct;
}

/**
 * Does the header name the size of an organism, by a POSITIVE list: a bare `length`, `width`, `height`, `size` or `diameter`; one of them behind an organism qualifier (total, fork, standard,
 * body, shell, carapace, prosome, mean); or TL, FL, SL, L1 ... L10. And its unit is a length (µm, mm, cm, m) or it has none. `Sieve size`, `Filter pore size`, `Beam width`, `Layer thickness`, `Particle
 * size`, `Rainfall`, `Transparency`, `Bag length`, `Frame size` are none of these: a size of the gear or of the surroundings is not matched by any list of words that would have to name it first.
 */
const SIZE_NOUNS = new Set(['length', 'width', 'height', 'size', 'diameter']);
const ORGANISM_QUALIFIERS = new Set(['total', 'fork', 'standard', 'body', 'shell', 'carapace', 'prosome', 'mean']);
export function isOrganismSizeHeader(header: string): boolean {
  const hu = unitFromHeader(header);
  const unit = foldUnit(hu.unit ?? hu.unitText ?? '');
  if (unit !== '' && !/^(?:um|mm|cm|m)$/.test(unit)) return false;
  const name = hu.name.trim();
  if (/^(?:TL|FL|SL|L\d+)$/i.test(name)) return true;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
  if (words.length === 1) return SIZE_NOUNS.has(words[0]);
  return words.some((w, i) => SIZE_NOUNS.has(w) && i > 0 && ORGANISM_QUALIFIERS.has(words[i - 1]));
}

function withinSample(sheet: RawSheet, base: readonly ColumnProposal[], index: number, decimalComma: boolean): { verdict: 'constant' | 'varies' | 'unknown'; distinct?: number } {
  const key = base.filter((q) => SAMPLE_KEY_KINDS.has(q.role.kind) && q.index !== index).map((q) => q.index);
  // a column that is still ignored (a tow or haul number the converter has no role for) separates the samples too, unless it only describes the taxon (a species code, a common name):
  // a column that is a function of the taxon column is not a sample column
  const taxon = base.find((q) => q.role.kind === 'taxon' && q.role.header !== true)?.index;
  if (taxon !== undefined) {
    for (const q of base) {
      if ((q.role.kind !== 'ignore' && q.role.kind !== 'variable') || q.index === index || key.includes(q.index)) continue;
      // a column with a unit is a measurement ('L1 (µm)', 'Area net (m2)'), not a tow or haul number: it does not separate samples
      // (a count unit or a name of a descriptor of the sample - Tow, Haul, Cast - still separates samples)
      if (q.role.kind === 'variable' && q.role.unit !== undefined && !isPlainCountUnit(foldUnit(q.role.unit)) && nameKind(q.header, true) !== 'descriptor') continue;
      const values = sheet.rows.map((r) => r.cells[q.index] ?? null).filter((c) => !isBlankCell(c));
      // a tow or haul number may be a number: an ignored column of few distinct values (not a per-row measurement) separates samples
      if (values.length === 0 || new Set(values.map((c) => String(c).trim())).size * 2 > values.length) continue;
      const byTaxon = new Map<string, Set<string>>();
      for (const r of sheet.rows) {
        const t = String(r.cells[taxon] ?? '').trim();
        const v = String(r.cells[q.index] ?? '').trim();
        const set = byTaxon.get(t);
        if (set === undefined) byTaxon.set(t, new Set([v]));
        else set.add(v);
      }
      if ([...byTaxon.values()].every((set) => set.size === 1)) continue;
      key.push(q.index);
    }
  }
  if (key.length === 0) return { verdict: 'unknown' };
  const groups = new Map<string, { first: number; same: boolean; n: number; values: Set<number> }>();
  for (const r of sheet.rows) {
    const cell = r.cells[index] ?? null;
    const p = parseNumber(cell, decimalComma);
    if (p.status !== 'ok') continue;
    const k = key.map((i) => String(r.cells[i] ?? '').trim()).join('\u0001');
    const g = groups.get(k);
    if (g === undefined) groups.set(k, { first: p.value, same: true, n: 1, values: new Set([p.value]) });
    else {
      g.n++;
      g.values.add(p.value);
      if (p.value !== g.first) g.same = false;
    }
  }
  const multi = [...groups.values()].filter((g) => g.n > 1);
  if (multi.length === 0) return { verdict: 'unknown' };
  const distinct = multi.reduce((a, g) => a + g.values.size / g.n, 0) / multi.length;
  return { verdict: multi.filter((g) => g.same).length * 2 >= multi.length ? 'constant' : 'varies', distinct };
}

/** A header that says total or sum as one of its words ('Total', 'Razem', 'weight_kg_total'). */
export function isTotalHeader(header: string): boolean {
  return stripTypeSuffix(header)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => ['total', 'suma', 'razem', 'gesamt', 'summe', 'somme', 'sum'].includes(w));
}

/**
 * Words of a header that name how, where or with what a sample was taken, or the surroundings it was taken in (a mesh, a net, a core, a tow, a wire, a transect, ice, waves, rain, the water
 * above the bottom ...). A size, a length or a value in millimetres with one of them is a property of the sampling or of the place, never the size of an organism: it is not moved to
 * the occurrences and it is no species column.
 */
const SAMPLING_WORDS = new Set([
  'mesh', 'net', 'nets', 'core', 'cores', 'tow', 'trawl', 'wire', 'transect', 'secchi', 'sediment', 'grain', 'ice', 'wave', 'waves', 'mouth', 'above', 'below', 'bottom', 'depth', 'water', 'air', 'wind',
  'sea', 'surface', 'haul', 'cast', 'station', 'site', 'gear', 'ship', 'vessel', 'dredge', 'grab', 'quadrat', 'plot', 'rain', 'snow', 'swell', 'tide', 'current', 'flow', 'speed', 'warp', 'door', 'doors',
]);
export function isSamplingOrEnvironmentHeader(header: string): boolean {
  const words = stripTypeSuffix(header)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
  return words.some((w) => SAMPLING_WORDS.has(w) || w.startsWith('precip'));
}

/**
 * Is the column an ATTRIBUTE of the taxon (a species code, a serial number, a trophic level)? It must be a function of the taxon column (every taxon that is listed more than once has ONE value in it,
 * at least two values overall) and not constant inside the samples (a value of the sample that happens to follow the taxa is not an attribute of the taxon), and then
 *   - the name says code, id, tsn, key, serial or trophic, or
 *   - at least half of the taxa are listed more than once (and at least three of them are) and the column has no unit.
 * A column with a unit or a size word is never one: a length, a cover or a content that happens to be the same for the repeated taxa is a measurement, and its conflict must stay visible.
 */
const ATTRIBUTE_WORDS = new Set(['code', 'id', 'tsn', 'key', 'serial', 'trophic']);
export function isTaxonAttribute(sheet: RawSheet, taxonIndex: number, index: number, header: string, sampleVerdict: 'constant' | 'varies' | 'unknown'): boolean {
  if (sampleVerdict === 'constant') return false;
  const hu = unitFromHeader(header);
  if (hu.unit !== undefined || hu.unitText !== undefined || isSizeLikeHeader(header) || isOrganismSizeHeader(header)) return false;
  const named = stripTypeSuffix(hu.name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => ATTRIBUTE_WORDS.has(w));
  const byTaxon = new Map<string, { values: Set<string>; n: number }>();
  const all = new Set<string>();
  for (const r of sheet.rows) {
    const t = String(r.cells[taxonIndex] ?? '').trim();
    const c = r.cells[index] ?? null;
    if (t === '' || isBlankCell(c)) continue;
    const v = String(c).trim();
    all.add(v);
    const e = byTaxon.get(t);
    if (e === undefined) byTaxon.set(t, { values: new Set([v]), n: 1 });
    else {
      e.values.add(v);
      e.n++;
    }
  }
  const repeated = [...byTaxon.values()].filter((e) => e.n > 1);
  if (!(all.size >= 2 && repeated.length > 0 && [...byTaxon.values()].every((e) => e.values.size === 1))) return false;
  return named || (repeated.length >= 3 && repeated.length * 2 >= byTaxon.size);
}

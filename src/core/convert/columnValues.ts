// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RawCell, RawSheet } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * What the VALUES of a column say about its role, for the converter's overlay (convert/recognize.ts). A name can be anything ("Scientific name", "SpName", "SampleYear"); the cells
 * are what decide, and a rule that rests on a header string alone is tuned to the files it was written from. Every test here reads at most the first 500 rows.
 */

const MAX_ROWS = 500;
const blank = (c: RawCell): boolean => c === null || (typeof c === 'string' && c.trim() === '');
const cellsOf = (sheet: RawSheet, index: number): RawCell[] => sheet.rows.slice(0, MAX_ROWS).map((r) => r.cells[index] ?? null).filter((c) => !blank(c));
/** Is the column filled on EVERY row (of the first 500)? A column with blanks is not "one value on every row" and not "every cell a year": its blanks are rows the rule did not see. */
const filledEverywhere = (sheet: RawSheet, index: number): boolean => cellsOf(sheet, index).length === Math.min(sheet.rows.length, MAX_ROWS);

/**
 * A Latin binomial at the start of a cell: a genus (capital, 3+ letters, an optional subgenus in brackets), then an epithet of 3+ lower-case letters, or "sp." / "spp." / "indet.", with an
 * optional "cf." / "aff." between them. What follows (an authority, a year) is not looked at: "Gadus morhua Linnaeus, 1758".
 */
const BINOMIAL = /^[A-Z][a-z]{2,}(?:\s+\([A-Z][a-z]+\))?\s+(?:(?:cf|aff)\.\s+)?(?:([a-z]{3,})|sp{1,2}\.|indet\.)(?![A-Za-z])/;
/**
 * The endings a Latin epithet takes (-us, -um, -is, -ii, -ae, -ensis, -ica, -ata, ...). Two ordinary English words are not told apart from an epithet by their shape alone ("Muddy sand", "Surface water",
 * "Baltic sea"), so a cell counts only when its epithet ends like one; an ending in -a needs 5 letters ("sea", "area" and "data" do not count), one in -i 4 ("scotti", "tokarevi").
 */
const EPITHET_END = /(?:us|um|is|ii|ae|ei|ensis|icus|ica|ata|atus|alis|ilis|osa|osus|ella|ellus|inus|ina|ana|anus|oides|ides|eri|ori|oni|ani|ens|ans|orum|arum|ceps|ops|pes|[a-z]{3}i|[a-z]{4}a)$/;

function isBinomialCell(c: RawCell): boolean {
  if (typeof c !== 'string') return false;
  const m = BINOMIAL.exec(c.trim());
  if (m === null) return false;
  return m[1] === undefined || EPITHET_END.test(m[1]);
}

/**
 * A column of Latin binomials: at least 80 % of its filled cells (and at least 3 of them, two of them different) start with a genus and an epithet written like one. A column of places,
 * methods or notes ("Weddell Sea shelf", "Muddy sand") fails the epithet test and the share. Returns the share of the cells that qualify (0 for a column that does not).
 */
export function latinNameShare(sheet: RawSheet, index: number): number {
  const cells = cellsOf(sheet, index);
  if (cells.length < 3) return 0;
  const hits = cells.filter(isBinomialCell);
  const distinct = new Set(hits.map((c) => String(c).trim().toLowerCase()));
  const share = hits.length / cells.length;
  return share >= 0.8 && distinct.size >= 3 ? share : 0;
}

/** Every filled cell is a whole number from 1800 to 2100 within a span of 120 years, and there are at least 3 of them: a column of years. A column of counts rarely stays inside that band. */
export function holdsYears(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  const cells = cellsOf(sheet, index);
  if (cells.length < 3 || !filledEverywhere(sheet, index)) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of cells) {
    const p = parseNumber(c, decimalComma);
    if (p.status !== 'ok' || !Number.isInteger(p.value) || p.value < 1800 || p.value > 2100) return false;
    lo = Math.min(lo, p.value);
    hi = Math.max(hi, p.value);
  }
  return hi - lo <= 120;
}

/** Every filled cell (at least 3) is a whole year from 1800 to 2100. Blanks are allowed: a Year next to a Date is a year wherever it is filled. */
export function holdsOnlyYears(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  const cells = cellsOf(sheet, index);
  if (cells.length < 3) return false;
  return cells.every((c) => {
    const p = parseNumber(c, decimalComma);
    return p.status === 'ok' && Number.isInteger(p.value) && p.value >= 1800 && p.value <= 2100;
  });
}

/**
 * Every filled cell (at least 3) is a whole number of 6 or more digits, and the values are all different: a running number or an identifier, not a count or a density, which repeat. Two rows may
 * share a value only when they are rows of one sample (`sampleCols`: the columns that tell the samples apart): then each sample holds one value and no value stands under two samples (a sample
 * number written on every taxon row of the sample).
 */
export function holdsRunningNumbers(sheet: RawSheet, index: number, decimalComma: boolean, sampleCols: readonly number[] = []): boolean {
  const rows = sheet.rows.slice(0, MAX_ROWS);
  const filled = rows.filter((r) => !blank(r.cells[index] ?? null));
  if (filled.length < 3) return false;
  const values: number[] = [];
  for (const r of filled) {
    const p = parseNumber(r.cells[index] as RawCell, decimalComma);
    if (p.status !== 'ok' || !Number.isInteger(p.value) || p.value < 100000) return false;
    values.push(p.value);
  }
  if (new Set(values).size === values.length) return true;
  if (sampleCols.length === 0) return false;
  const sampleOf = (r: (typeof rows)[number]): string => sampleCols.map((c) => String(r.cells[c] ?? '').trim()).join('\u0000');
  const valueOfSample = new Map<string, number>();
  const sampleOfValue = new Map<number, string>();
  for (const [i, r] of filled.entries()) {
    const k = sampleOf(r);
    if ((valueOfSample.get(k) ?? values[i]) !== values[i] || (sampleOfValue.get(values[i]) ?? k) !== k) return false;
    valueOfSample.set(k, values[i]);
    sampleOfValue.set(values[i], k);
  }
  return valueOfSample.size >= 3;
}

/**
 * One value, not a whole number, on at least 3 rows (a core diameter of 6.35 on every row): a property of the sampling that is the same for the whole sheet, not the count or the density of a
 * species, whose values vary. A constant whole number (all 0, all 1) is a legitimate species column and does not count.
 */
export function holdsOneFractionalValue(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  const cells = cellsOf(sheet, index);
  if (cells.length < 3 || !filledEverywhere(sheet, index)) return false;
  const first = parseNumber(cells[0], decimalComma);
  if (first.status !== 'ok' || Number.isInteger(first.value)) return false;
  return cells.every((c) => {
    const p = parseNumber(c, decimalComma);
    return p.status === 'ok' && p.value === first.value;
  });
}

/**
 * A unit that measures a length, an area, a volume, a duration, a speed or a temperature: no species is counted or weighed in it, so a column with this unit is the size of the sample, the sampling
 * effort or an environmental variable, never a species. (A mass, an amount of substance and every "per" unit are not listed: a species may carry a biomass or a concentration.) `folded` is foldUnit's output.
 */
const GEOMETRY_UNIT = /^(?:[mcdnµu]?m|km|in|ft|yd|nmi|m(?:\*\*|\^)?[23]|[cdk]m(?:\*\*|\^)?[23]|ha|l|ml|dl|cl|dm3|s|sec|min|h|hr|hrs|d|day|days|hour|hours|minutes?|seconds?|years?|yr|knots?|kt|m\/s|°c|°f|degc|degreesc|degreescelsius)$/;
export function isGeometryUnit(folded: string): boolean {
  return GEOMETRY_UNIT.test(folded.replace(/[\s_]/g, ''));
}

/** A WoRMS AphiaID: a positive whole number without leading zeros, in every filled cell (and in at least one). */
export function holdsAphiaIds(sheet: RawSheet, index: number): boolean {
  const cells = cellsOf(sheet, index);
  return cells.length > 0 && cells.every((c) => /^[1-9]\d{0,8}$/.test(String(c).trim()));
}

/** A unit that counts individuals and nothing else ("#", "n", "ind", "individuals", "count"): the unit of the count of a row. `folded` is foldUnit's output. */
export const isPlainCountUnit = (folded: string): boolean => /^(?:#|n|no|ind|inds|indiv|individuals?|count|counts|specimens?)$/.test(folded);

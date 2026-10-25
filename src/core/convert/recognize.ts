// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { dwcTermOf, proposeColumns, toMapping, unitFromHeader } from '../recognize/columns';
import type { ProposeContext } from '../recognize/columns';
import { foldDiacritics, headerKey, isCanonicalKey } from '../recognize/vocab';
import type { ColumnProposal, ColumnRole, RawSheet, SheetMapping } from '../types';
import { parseNumber } from '../values/numbers';

/*
 * The converter's column recognition: an OVERLAY on the shared proposeColumns, so coordinates, dates, depth, station, cruise and sample names
 * (Polish, German and French included) come from recognize/columns.ts and are not repeated here. The overlay adds only what /check does not
 * know, the converter-only roles (types.ts ConverterRole):
 *
 *   Darwin Core terms   occurrenceID -> occurrenceId, eventID -> sampleId, scientificName -> taxon, individualCount / organismQuantity ->
 *                       quantity, organismQuantityType -> quantityType, minimum/maximumDepthInMeters -> depth bounds, lifeStage, identificationQualifier
 *   the converter's own names (PL / EN / DE / FR)   taxon, quantity, effort and depth-bound names
 *   wide sheets         a numeric column the shared proposer calls a variable but that is not a canonical measured variable becomes a
 *                       LOW-confidence `taxon` with header:true (its HEADER is the taxon): a candidate, to be confirmed in bulk.
 *                       Canonical variables (temperature, salinity, ...) stay variables; they become eMoF later.
 *
 * ⚠️ /check never calls this module and never proposes these roles; recognize/columns.ts is untouched (test/convert/check-unchanged.test.ts).
 */

export type ConvertShape = 'wide' | 'long';

const TAXON_NAME = /^(species|taxon|taxa|gatunek|takson|art|espece)( name| nom| name)?$/;
// the unambiguous quantity words may carry a tail ("abundance ind"); the short ones only stand alone
const QUANTITY_STANDALONE = /^(count|counts|anzahl|nombre|comptage)$/;
const QUANTITY_WORD = /^(abundance|abundanz|abondance|density|densite|dichte|zageszczenie|liczebnosc|biomass|biomasa|biomasse)( .*)?$/;
const EFFORT_VOLUME = /^(volume filtered|volume sampled|sampled volume|volume|objetosc|objetosc przefiltrowana|volumen|volumen filtriert|volume filtre|volume echantillonne)$/;
const EFFORT_AREA = /^(area|area sampled|sampled area|powierzchnia|flache|surface|surface echantillonnee)$/;

// a summary column is never proposed as a species: its header (after the key folding: case, diacritics, punctuation) STARTS with one of these words,
// or holds total / suma / razem / gesamt as a separate word ("Total copepods", "Abundance, total", "Razem Copepoda"). "Totalia sp." is a genus and stays.
const SUMMARY_FIRST = new Set(['total', 'suma', 'razem', 'summe', 'gesamt', 'somme', 'sum']);
const SUMMARY_ANYWHERE = new Set(['total', 'suma', 'razem', 'gesamt']);
function isSummaryHeader(rawName: string): boolean {
  const name = rawName.trim();
  if (/^[σΣ]/.test(name)) return true;
  const words = headerKey(name).split(' ').filter((w) => w !== '');
  return words.length > 0 && (SUMMARY_FIRST.has(words[0]) || words.some((w) => SUMMARY_ANYWHERE.has(w)));
}
// "Stage" and its translations: the life stage of the record (a long sheet)
const STAGE_NAME = /^(stage|life stage|lifestage|stadium|stadium rozwojowe|entwicklungsstadium|stade|stade de developpement)$/;

const DEPTH_WORDS = /^(depth|tiefe|profondeur|glebokosc)(?: (.*))?$/;
const BOUND_MIN = new Set(['top', 'min', 'minimum', 'from', 'von', 'od', 'de', 'upper', 'start', 'ab']);
// 'a' is the French "à" after foldDiacritics
const BOUND_MAX = new Set(['bottom', 'max', 'maximum', 'to', 'bis', 'do', 'a', 'lower', 'end']);

/** 'min' / 'max' when the tail of a depth name ("top/min", "bottom/max", "od", "von", "à") says which end of a range it is. */
function depthBoundOfName(key: string): 'min' | 'max' | undefined {
  const m = DEPTH_WORDS.exec(key);
  if (!m || m[2] === undefined) return undefined;
  const tokens = m[2].split(' ').filter((t) => t !== '');
  const mins = tokens.filter((t) => BOUND_MIN.has(t)).length;
  const maxs = tokens.filter((t) => BOUND_MAX.has(t)).length;
  if (mins > 0 && maxs === 0) return 'min';
  if (maxs > 0 && mins === 0) return 'max';
  return undefined;
}

// "present" marks in a species column of a wide sheet: + x *
const PRESENCE_MARK = /^(\+|x|\*)$/i;

/** The sampled cells of a column are only numbers and presence marks, with at least one mark: a species column the shared proposer took for text. */
function holdsPresenceMarks(sheet: RawSheet, index: number, decimalComma: boolean): boolean {
  let marks = 0;
  for (const row of sheet.rows.slice(0, 200)) {
    const c = row.cells[index] ?? null;
    if (c === null || String(c).trim() === '') continue;
    if (typeof c === 'string' && PRESENCE_MARK.test(c.trim())) {
      marks++;
      continue;
    }
    // NA and its variants are "no record", as everywhere: they do not rule the column out
    const st = parseNumber(c, decimalComma).status;
    if (st !== 'ok' && st !== 'missing' && st !== 'na-variant') return false;
  }
  return marks > 0;
}

type Claim = { role: ColumnRole; confidence: 'high' | 'low'; reason: string };

/** The Darwin Core terms the converter reads, by lower-cased term. */
function dwcClaim(term: string): Claim | undefined {
  switch (term) {
    case 'occurrenceid':
      return { role: { kind: 'occurrenceId' }, confidence: 'high', reason: 'Darwin Core occurrenceID (used as given)' };
    case 'eventid':
      return { role: { kind: 'sampleId' }, confidence: 'high', reason: 'Darwin Core eventID is the sample code' };
    case 'scientificname':
      return { role: { kind: 'taxon' }, confidence: 'high', reason: 'Darwin Core scientificName' };
    case 'individualcount':
      return { role: { kind: 'quantity' }, confidence: 'high', reason: 'Darwin Core individualCount (a count)' };
    case 'organismquantity':
      return { role: { kind: 'quantity' }, confidence: 'high', reason: 'Darwin Core organismQuantity' };
    case 'organismquantitytype':
      return { role: { kind: 'quantityType' }, confidence: 'high', reason: 'Darwin Core organismQuantityType' };
    case 'lifestage':
      return { role: { kind: 'lifeStage' }, confidence: 'high', reason: 'Darwin Core lifeStage' };
    case 'identificationqualifier':
      return { role: { kind: 'qualifier' }, confidence: 'high', reason: 'Darwin Core identificationQualifier' };
    default:
      return undefined;
  }
}

/** The converter's own names (taxon, quantity, effort) in PL / EN / DE / FR; `key` is a headerKey. */
function nameClaim(key: string, unit: string | undefined): Claim | undefined {
  if (STAGE_NAME.test(key)) return { role: { kind: 'lifeStage' }, confidence: 'high', reason: 'name says life stage' };
  if (TAXON_NAME.test(key)) return { role: { kind: 'taxon' }, confidence: 'high', reason: 'name says taxon or species' };
  if (QUANTITY_STANDALONE.test(key)) return { role: { kind: 'quantity' }, confidence: 'high', reason: 'name says count' };
  const q = QUANTITY_WORD.exec(key);
  if (q) return { role: { kind: 'quantity' }, confidence: q[2] === undefined ? 'high' : 'low', reason: 'name says abundance, density or biomass' };
  const effort = (reason: string): Claim => ({ role: unit === undefined ? { kind: 'effort' } : { kind: 'effort', unit }, confidence: 'high', reason });
  if (EFFORT_VOLUME.test(key)) return effort('name says sampled (filtered) volume: the sampling effort');
  if (EFFORT_AREA.test(key)) return effort('name says sampled area: the sampling effort');
  return undefined;
}

/**
 * Column proposals for /convert: the shared proposals, with the converter's roles laid over them. Pure; the input proposals are not mutated.
 */
export function proposeConvertColumns(sheet: RawSheet, ctx: ProposeContext): ColumnProposal[] {
  const base = proposeColumns(sheet, ctx).map((p) => ({ ...p }));
  const claims = new Map<number, Claim>();
  const bounds = new Map<number, 'min' | 'max'>();
  let dwcEventId = -1;

  for (const p of base) {
    const hu = unitFromHeader(p.header);
    const key = headerKey(hu.name);
    const term = dwcTermOf(p.header);
    const dwc = term === undefined ? undefined : dwcClaim(term);
    if (dwc) {
      claims.set(p.index, dwc);
      if (term === 'eventid') dwcEventId = p.index;
      continue;
    }
    if (term === 'minimumdepthinmeters') bounds.set(p.index, 'min');
    else if (term === 'maximumdepthinmeters') bounds.set(p.index, 'max');
    else {
      const bound = depthBoundOfName(foldDiacritics(key));
      if (bound !== undefined) bounds.set(p.index, bound);
      else {
        const named = nameClaim(foldDiacritics(key), hu.unit);
        if (named) claims.set(p.index, named);
      }
    }
  }

  // depth: the winner of the shared slot says which direction the sheet counts
  const sharedDepth = base.find((p) => p.role.kind === 'depth' && p.role.bound === undefined)?.role;
  const sheetPositive = sharedDepth && sharedDepth.kind === 'depth' ? sharedDepth.positive : 'unknown';

  const hasLongTaxon = [...claims.values()].some((c) => c.role.kind === 'taxon');
  const seenQuantity = new Set<number>();
  for (const p of base) {
    const claim = claims.get(p.index);
    const bound = bounds.get(p.index);
    if (bound !== undefined) {
      const hu = unitFromHeader(p.header);
      const dwcDepth = dwcTermOf(p.header) === 'minimumdepthinmeters' || dwcTermOf(p.header) === 'maximumdepthinmeters';
      const was = p.role.kind === 'depth' ? p.role : undefined;
      const unit = dwcDepth ? 'm' : (was?.unit ?? hu.unit);
      p.role = { kind: 'depth', positive: dwcDepth ? 'down' : (was?.positive ?? sheetPositive), ...(unit === undefined ? {} : { unit }), bound };
      p.confidence = 'high';
      p.reason = `${dwcDepth ? 'Darwin Core ' : 'name says '}${bound === 'min' ? 'minimum (top) depth' : 'maximum (bottom) depth'} of a depth range`;
      continue;
    }
    if (claim) {
      if (claim.role.kind === 'quantity') {
        // one quantity column is read; a second one (individualCount next to organismQuantity) is left out
        if (seenQuantity.size > 0) {
          p.role = { kind: 'ignore' };
          p.confidence = 'low';
          p.reason = 'another quantity column is used';
          continue;
        }
        seenQuantity.add(p.index);
      }
      p.role = claim.role;
      p.confidence = claim.confidence;
      p.reason = claim.reason;
      continue;
    }
    // another sample-code column next to a Darwin Core eventID: the eventID is the code
    if (dwcEventId >= 0 && p.role.kind === 'sampleId' && p.index !== dwcEventId) {
      p.role = { kind: 'ignore' };
      p.confidence = 'low';
      p.reason = 'the Darwin Core eventID column is used as the sample code';
      continue;
    }
    // wide sheet: a column of presence marks (+, x) next to counts is a species column too; the shared proposer read it as text
    const headerName = unitFromHeader(p.header).name.trim();
    const summaryHeader = isSummaryHeader(headerName);
    if (!summaryHeader && !hasLongTaxon && p.role.kind === 'ignore' && /^text column/.test(p.reason) && holdsPresenceMarks(sheet, p.index, ctx.decimalComma)) {
      p.role = { kind: 'taxon', header: true };
      p.confidence = 'low';
      p.reason = 'cells are presence marks (+, x) and numbers: its header may be a taxon (confirm all taxon columns at once)';
      continue;
    }
    // wide sheet: a numeric column named like nothing we know is a taxon candidate; confirmed in bulk
    if (!summaryHeader && !hasLongTaxon && p.role.kind === 'variable' && !isCanonicalKey(p.role.variable) && p.role.p01 === undefined) {
      p.role = { kind: 'taxon', header: true };
      p.confidence = 'low';
      p.reason = 'numeric column with an unrecognised name: its header may be a taxon (confirm all taxon columns at once)';
    }
  }
  return base;
}

/** The proposals as a mapping, as the converter reads it. */
export function proposeConvertMapping(sheet: RawSheet, ctx: ProposeContext): SheetMapping {
  return toMapping(sheet, proposeConvertColumns(sheet, ctx));
}

/** A taxon column without `header` means a long sheet; taxon columns with `header: true` mean a wide one; neither: undefined (the user picks). */
export function suggestConvertShape(columns: readonly { role: ColumnRole }[]): ConvertShape | undefined {
  if (columns.some((c) => c.role.kind === 'taxon' && c.role.header !== true)) return 'long';
  if (columns.some((c) => c.role.kind === 'taxon' && c.role.header === true)) return 'wide';
  return undefined;
}

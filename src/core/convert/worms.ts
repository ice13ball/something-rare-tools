// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The pure half of the WoRMS opt-in (stage 4): batches, the shape of a WoRMS answer, what a name's answer means, and the entry the conversion takes.
 * No I/O here. The one module that talks to the network is src/app/optins/worms.ts (main thread only; the worker never fetches).
 *
 * What the service answers (checked against the real service 25.10.2026; hand-written fixtures in test/helpers/wormsFixtures.ts): AphiaRecordsByMatchNames returns an ARRAY with one array per name sent, in the
 * order sent. An empty inner array is "no match". When NOTHING in the batch matches, the whole answer is HTTP 204 with an empty body.
 * At most WORMS_BATCH_MAX names per call (docs/research/qc-sources.md: 51 gives HTTP 400).
 *
 * Which result is automatic: exactly one result and its match_type is `exact`. Everything else (phonetic, near_1..3, exact_genus, exact_subgenus, several
 * results for one name) is shown and the user chooses one result or "no ID": nothing fuzzy is ever accepted by the tool.
 *
 * Which LSID is written: that of the matched record itself, urn:lsid:marinespecies.org:taxname:<AphiaID>, even when that record is an unaccepted name.
 * OBIS Manual, "Darwin Core" page, section "Taxonomy and identification" (https://manual.obis.org/darwin_core.html, read 2026-10-25): "The LSID used for
 * scientificNameID should correspond to the name provided to the scientificName field, even if it is not the currently accepted scientific name. OBIS will
 * use this identifier to pull the taxonomic information from the World Register of Marine Species (WoRMS) into OBIS and attach it to your dataset. This
 * information includes: ... The accepted name in case of invalid names or synonyms". So the valid_AphiaID is never written.
 *
 * Which scientificName is written (stage 5, part A1). An exact match, a synonym included, keeps scientificName as written: "scientificName should always contain the
 * originally recorded full scientific name, even if the name is currently a synonym" (Darwin Core page, same section). A result the USER CHOSE among non-exact ones
 * (near, phonetic, genus, several results) writes the chosen record's own `scientificname`, because the LSID has to "correspond to the name provided to the
 * scientificName field" (so "Calnaus finmarchicus" must not travel with the LSID of Calanus finmarchicus) and "Match Taxonomic Names" (manual.obis.org/name_matching.html,
 * read 2026-10-25) says of a name that is changed to the matched one: "verbatimIdentification must be populated with the scientific name as it was originally
 * documented"; the Darwin Core page adds that verbatimIdentification records the identification "as it appeared in the original record, unaltered, with ...
 * misspellings". verbatimIdentification keeps the sheet's text; the occurrenceID is built from the sheet's text and never changes.
 */

/** The most names one AphiaRecordsByMatchNames call takes (51 names answer HTTP 400). */
export const WORMS_BATCH_MAX = 50;

/** The identifier of a WoRMS taxon (OBIS Manual, "Match Taxonomic Names": "The WoRMS LSID is used for DwC:scientificNameID"). */
export const wormsLsid = (aphiaId: number): string => `urn:lsid:marinespecies.org:taxname:${aphiaId}`;

/** The fields of a WoRMS record this tool reads (the answer has more; they are never kept). 0 / 1 / null as WoRMS sends them. */
export interface WormsRecord {
  AphiaID: number;
  scientificname: string;
  authority: string | null;
  status: string;
  unacceptreason: string | null;
  rank: string | null;
  valid_AphiaID: number | null;
  valid_name: string | null;
  isMarine: number | null;
  isBrackish: number | null;
  isFreshwater: number | null;
  isTerrestrial: number | null;
  match_type: string;
  url: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const flag = (v: unknown): number | null => (v === 0 || v === 1 ? v : null);

/**
 * One record of an answer, or undefined when it is not shaped like a WoRMS record: an AphiaID that is not a positive whole number would end up in an
 * identifier of the archive, so it is refused here. Only the fields above are copied.
 */
export function readWormsRecord(x: unknown): WormsRecord | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const r = x as Record<string, unknown>;
  const id = r.AphiaID;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return undefined;
  if (typeof r.scientificname !== 'string' || typeof r.match_type !== 'string' || typeof r.status !== 'string') return undefined;
  const valid = r.valid_AphiaID;
  return {
    AphiaID: id,
    scientificname: r.scientificname,
    authority: str(r.authority),
    status: r.status,
    unacceptreason: str(r.unacceptreason),
    rank: str(r.rank),
    valid_AphiaID: typeof valid === 'number' && Number.isSafeInteger(valid) && valid >= 1 ? valid : null,
    valid_name: str(r.valid_name),
    isMarine: flag(r.isMarine),
    isBrackish: flag(r.isBrackish),
    isFreshwater: flag(r.isFreshwater),
    isTerrestrial: flag(r.isTerrestrial),
    match_type: r.match_type,
    url: str(r.url),
  };
}

/**
 * The answer of one call for `count` names sent: one list of records per name, or undefined when the body is not that shape. `body` is the parsed
 * JSON; `noContent` is HTTP 204 (nothing in the batch matched: every name has an empty list).
 */
export function readWormsAnswer(body: unknown, count: number, noContent = false): WormsRecord[][] | undefined {
  if (noContent) return Array.from({ length: count }, () => []);
  if (!Array.isArray(body) || body.length !== count) return undefined;
  const out: WormsRecord[][] = [];
  for (const item of body) {
    // an unmatched name is an empty array (some deployments answer null for it)
    if (item === null) {
      out.push([]);
      continue;
    }
    if (!Array.isArray(item)) return undefined;
    const records: WormsRecord[] = [];
    for (const raw of item) {
      const r = readWormsRecord(raw);
      if (!r) return undefined;
      records.push(r);
    }
    out.push(records);
  }
  return out;
}

/** The names cut into batches of at most WORMS_BATCH_MAX, in order. */
export function wormsBatches(names: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < names.length; i += WORMS_BATCH_MAX) out.push(names.slice(i, i + WORMS_BATCH_MAX));
  return out;
}

/* ---------- what an answer means ---------- */

/** Why a name needs the user's choice. */
export type ChooseWhy = 'ambiguous' | 'not-exact' | 'genus-only' | 'not-valid-record';

export type MatchClass =
  | { kind: 'none' }
  | { kind: 'auto'; record: WormsRecord }
  | { kind: 'choose'; why: ChooseWhy; candidates: WormsRecord[] };

/** A record whose AphiaID is no longer a usable identifier: the answer says it was deleted or quarantined. */
const unusable = (r: WormsRecord): boolean => r.status === 'deleted' || r.status === 'quarantined';

/**
 * What the records of ONE name mean. Automatic only for exactly one record whose match_type is exactly `exact` (and that is not a deleted or quarantined
 * record, which the user must look at). No record: none. Everything else: the user chooses, and nothing is pre-selected.
 */
export function classifyMatches(records: readonly WormsRecord[]): MatchClass {
  if (records.length === 0) return { kind: 'none' };
  const candidates = [...records];
  if (records.length > 1) return { kind: 'choose', why: 'ambiguous', candidates };
  const r = records[0];
  if (r.match_type === 'exact') return unusable(r) ? { kind: 'choose', why: 'not-valid-record', candidates } : { kind: 'auto', record: r };
  return { kind: 'choose', why: r.match_type === 'exact_genus' ? 'genus-only' : 'not-exact', candidates };
}

/** Freshwater or terrestrial only: neither marine nor brackish is set, and at least one of the other two is. A record with no habitat flag is "unknown", not "not marine". */
export function isNotMarine(r: WormsRecord): boolean {
  const marine = r.isMarine === 1 || r.isBrackish === 1;
  const other = r.isFreshwater === 1 || r.isTerrestrial === 1;
  return !marine && other;
}

/** True for an unaccepted record that names its valid name (the page shows "unaccepted → valid name X"). */
export const isUnaccepted = (r: WormsRecord): boolean => r.status === 'unaccepted' && r.valid_name !== null && r.valid_name !== '' && r.valid_AphiaID !== r.AphiaID;

/* ---------- the entry the conversion takes ---------- */

/**
 * What the conversion knows about one name after the lookup (the key of a WormsLookup is the scientificName as it stands after the approved splits).
 *   id         a confirmed AphiaID: written as urn:lsid:marinespecies.org:taxname:<id>; notMarine = only freshwater or terrestrial;
 *              scientificName = the chosen record's name, set ONLY when the user chose a result whose match_type is not exact (it replaces scientificName)
 *   none       no ID is written: the service found nothing (`no-match`), or the user chose "no ID" (`user`)
 *   undecided  the user has to choose first: blocks the export (CONV-WORMS-UNDECIDED)
 */
export type WormsEntry = { state: 'id'; aphiaId: number; notMarine: boolean; scientificName?: string } | { state: 'none'; reason: 'no-match' | 'user' } | { state: 'undecided' };
export type WormsLookup = Readonly<Record<string, WormsEntry>>;

/** The user's choice for a name: an AphiaID among the candidates, or 'none' for "no ID". Absent = not chosen. */
export type WormsChoice = number | 'none';

/**
 * The entry for one name from its records and the user's choice. An automatic name keeps its ID unless the user chose "no ID" for it; a name that needs a
 * choice has one only for a record that was offered, otherwise it is undecided.
 */
export function entryOf(records: readonly WormsRecord[], choice?: WormsChoice): WormsEntry {
  const m = classifyMatches(records);
  if (m.kind === 'none') return { state: 'none', reason: 'no-match' };
  if (m.kind === 'auto') return choice === 'none' ? { state: 'none', reason: 'user' } : { state: 'id', aphiaId: m.record.AphiaID, notMarine: isNotMarine(m.record) };
  if (choice === 'none') return { state: 'none', reason: 'user' };
  const picked = typeof choice === 'number' ? m.candidates.find((c) => c.AphiaID === choice) : undefined;
  if (!picked) return { state: 'undecided' };
  return { state: 'id', aphiaId: picked.AphiaID, notMarine: isNotMarine(picked), ...(writesOwnName(picked) ? { scientificName: picked.scientificname.trim() } : {}) };
}

/** The name a chosen record is written under, when that is not the sheet's: only a record that is not an exact match of the name sent (and that has a name to write). */
export const writesOwnName = (r: WormsRecord): boolean => r.match_type !== 'exact' && r.scientificname.trim() !== '';

/**
 * A scientificName that came with a WoRMS entry is text that will be written into a tab-separated file: it must be a non-empty line of text. The worker applies this to
 * what the page sends (it does not trust the page): an entry that fails is treated as undecided.
 */
export const isWritableName = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v === v.trim() && v.length <= 300 && !/[\t\r\n\u0000-\u001f]/.test(v);

/** The lookup the conversion takes: an entry per name that has a result; `choices` are the user's decisions by name. */
export function lookupOf(results: Readonly<Record<string, readonly WormsRecord[]>>, choices: Readonly<Record<string, WormsChoice>>): Record<string, WormsEntry> {
  const out: Record<string, WormsEntry> = Object.create(null) as Record<string, WormsEntry>;
  for (const name of Object.keys(results)) out[name] = entryOf(results[name], Object.prototype.hasOwnProperty.call(choices, name) ? choices[name] : undefined);
  return out;
}

/** An entry of a lookup, by own property only (a taxon name such as "constructor" must not read the prototype). */
export const wormsEntry = (lookup: WormsLookup | undefined, name: string): WormsEntry | undefined =>
  lookup !== undefined && Object.prototype.hasOwnProperty.call(lookup, name) ? lookup[name] : undefined;

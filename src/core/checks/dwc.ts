// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { dwcTermOf } from '../recognize/columns';
import { parseDate } from '../values/dates';
import { makeFinding } from '../rules/registryCheck';
import type { Finding, ParsedFile, RawCell, RawSheet } from '../types';
import { pushAll } from '../util/arrays';

/*
 * Checks of one raw table that need its cells, not the parsed rows: the Darwin Core structure (required and recommended terms,
 * identifiers, controlled vocabularies) and invisible characters inside names and identifiers. The dataset builder calls
 * checkRawTable() for every table it reads, so the findings travel with the other builder findings.
 *
 * What counts as Darwin Core input (dwcTableOf): a Darwin Core Archive (the file says so itself), or a table whose header names at
 * least DWC_MIN_TERMS different terms from DWC_NAMES, spelled exactly as Darwin Core spells them (case counts), AND at least one record-kind term. DWC_TERMS holds only terms
 * that are not ordinary words: "depth", "date", "station", "year", "locality", "id" and the like do not count, so a CTD or chemistry
 * sheet is never Darwin Core, however its columns are named. Everything below that needs Darwin Core runs only on such a table.
 *
 * Linear in the number of rows: every check is one pass over the rows with Maps and Sets; the parentEventID loop search visits each
 * event once (checked at 200 000 rows, the Darwin Core Archive limit).
 */

/* ---------- what is Darwin Core input ---------- */

/** Terms that are not ordinary words, in the spelling Darwin Core gives them: the evidence that a header is Darwin Core. */
const DWC_NAMES = [
  'occurrenceID', 'eventID', 'parentEventID', 'scientificName', 'scientificNameID', 'taxonID', 'taxonRank', 'kingdom',
  'basisOfRecord', 'occurrenceStatus', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'minimumDepthInMeters',
  'maximumDepthInMeters', 'coordinateUncertaintyInMeters', 'geodeticDatum', 'individualCount', 'organismQuantity',
  'organismQuantityType', 'sampleSizeValue', 'sampleSizeUnit', 'samplingProtocol', 'locationID', 'datasetID', 'datasetName',
  'institutionCode', 'collectionCode', 'catalogNumber', 'recordedBy', 'identificationQualifier', 'verbatimLocality',
  'verbatimEventDate', 'vernacularName', 'countryCode', 'stateProvince', 'waterBody', 'footprintWKT', 'eventRemarks',
  'occurrenceRemarks', 'identificationRemarks', 'acceptedNameUsage', 'originalNameUsage', 'nameAccordingTo',
  'materialSampleID', 'organismID', 'preparations', 'lifeStage', 'recordNumber', 'fieldNumber',
] as const;
/** The same, lower case (the column lookup of the structure checks ignores case once the table is Darwin Core). */
const DWC_TERMS = new Set<string>(DWC_NAMES.map((n) => n.toLowerCase()));
/** Detection is case-sensitive: a plain biology export with "ScientificName", "Kingdom" and "LifeStage" columns is not Darwin Core, "scientificName" is. */
const DWC_EXACT = new Set<string>(DWC_NAMES);
/** Terms that say the table holds biological records or events (a measurement sheet in Darwin Core dress is not checked). */
const DWC_KIND_EXACT = new Set<string>(['occurrenceID', 'eventID', 'parentEventID', 'scientificName', 'scientificNameID', 'taxonID', 'basisOfRecord', 'occurrenceStatus']);
/** A header as the term it names, case kept: the dwc: prefix, the namespace URI and a trailing <Type> removed. */
const bareTerm = (h: string): string => h.trim().replace(/<[A-Za-z0-9]+>$/, '').replace(/^https?:\/\/rs\.tdwg\.org\/dwc\/(?:terms|iri)\/(?:[a-z]+\/)?/i, '').replace(/^dwc:/i, '');
/** Distinct DWC_TERMS a header must name. */
export const DWC_MIN_TERMS = 3;
/** The occurrence-side terms: a table with one of them is an Occurrence table, even with an eventID column. */
const OCCURRENCE_TERMS = ['occurrenceid', 'scientificname', 'basisofrecord', 'occurrencestatus'];

export interface DwcTable {
  /** Occurrence: one row per occurrence (an eventID may repeat); Event: one row per event (an eventID is a key). */
  core: 'Occurrence' | 'Event';
  /** The file is a Darwin Core Archive: its core `id` column may stand for the record identifier. */
  archive: boolean;
}

/** First column of the sheet for each Darwin Core term (lower case), 'id' (the archive's core id) under that name only for an archive. */
function termColumns(sheet: RawSheet): Map<string, number> {
  const out = new Map<string, number>();
  sheet.header.forEach((h, i) => {
    const t = dwcTermOf(h);
    if (t !== undefined && !out.has(t)) out.set(t, i);
  });
  return out;
}

/** The Darwin Core reading of a table, or undefined when it is not Darwin Core input. */
export function dwcTableOf(file: ParsedFile, sheet: RawSheet): DwcTable | undefined {
  const terms = termColumns(sheet);
  if (file.dwca) return { core: file.dwca.core, archive: true };
  const exact = new Set(sheet.header.map(bareTerm).filter((t) => DWC_EXACT.has(t)));
  const distinct = exact.size;
  const kind = [...exact].some((t) => DWC_KIND_EXACT.has(t));
  if (distinct < DWC_MIN_TERMS || !kind) return undefined;
  const occurrence = OCCURRENCE_TERMS.some((t) => terms.has(t));
  return { core: !occurrence && (terms.has('eventid') || terms.has('parenteventid')) ? 'Event' : 'Occurrence', archive: false };
}

/* ---------- reading cells ---------- */

const text = (c: RawCell | undefined): string => (c === null || c === undefined ? '' : String(c).trim());

/** Rows by column: the trimmed text of one column, with the physical line, blank cells as ''. */
function column(sheet: RawSheet, index: number): { line: number; v: string }[] {
  return sheet.rows.map((r) => ({ line: r.line, v: text(r.cells[index]) }));
}

/* ---------- required and recommended terms, identifiers ---------- */

/** What OBIS requires of an Occurrence core and of an Event core (obistools check_fields, OBIS Manual): [term as written, lower case]. */
const REQUIRED_COMMON: [string, string][] = [['eventDate', 'eventdate'], ['decimalLatitude', 'decimallatitude'], ['decimalLongitude', 'decimallongitude']];
const REQUIRED_OCCURRENCE: [string, string][] = [['scientificName', 'scientificname'], ['occurrenceStatus', 'occurrencestatus'], ['basisOfRecord', 'basisofrecord']];
const RECOMMENDED_DEPTH: [string, string][] = [['minimumDepthInMeters', 'minimumdepthinmeters'], ['maximumDepthInMeters', 'maximumdepthinmeters']];

/** Cap on the distinct vocabulary values reported one by one; the rest share one finding. */
const MAX_VALUE_FINDINGS = 10;

/** `terms` is the header index of each Darwin Core term of the sheet, with the archive's `id` column kept apart. */
function structure(file: ParsedFile, sheet: RawSheet, t: DwcTable, terms: Map<string, number>, noDateSaid: boolean, out: Finding[]): void {
  const idCol = t.archive ? sheet.header.findIndex((h) => h.trim().toLowerCase() === 'id') : -1;
  const rows = sheet.rows.length;
  const empty = (index: number): boolean => sheet.rows.every((r) => text(r.cells[index]) === '');

  // the record identifier: occurrenceID or eventID, in an archive also its core id column
  const recordId = t.core === 'Event' ? ['eventid'] : ['occurrenceid', 'eventid'];
  const idIndex = recordId.map((k) => terms.get(k)).find((i) => i !== undefined) ?? (idCol >= 0 ? idCol : undefined);

  const missing: string[] = [];
  if (idIndex === undefined) missing.push(t.core === 'Event' ? 'eventID' : 'occurrenceID or eventID');
  // an occurrence table that carries eventIDs is the occurrence side of an event table pair: date, position and depth live in the event table
  const eventIdCol = terms.get('eventid');
  const eventSide = t.core === 'Occurrence' && eventIdCol !== undefined && !empty(eventIdCol);
  const required = [...(eventSide ? [] : REQUIRED_COMMON), ...(t.core === 'Occurrence' ? REQUIRED_OCCURRENCE : [])];
  for (const [name, key] of required) if (!terms.has(key)) missing.push(name);
  if (missing.length > 0) out.push(makeFinding('DWC-TERM-MISSING', { file: file.fileName, sheet: sheet.name, params: { core: t.core, terms: missing.join(', ') } }));

  // required columns that are there but not filled: a blank cell is an error, except where another rule owns it
  const emptyCheck = (index: number | undefined, onlyWhenAllEmpty: boolean, skip = false): void => {
    if (index === undefined || rows === 0 || skip) return;
    const blank = column(sheet, index).filter((c) => c.v === '').map((c) => c.line);
    if (blank.length === 0 || (onlyWhenAllEmpty && blank.length < rows)) return;
    out.push(makeFinding('DWC-TERM-EMPTY', { file: file.fileName, sheet: sheet.name, lines: blank, field: sheet.header[index], params: { count: blank.length } }));
  };
  emptyCheck(idIndex, false);
  // a position blank in some rows is ROW-NO-COORD; a date blank in some rows is ROW-DATE-MISSING, and none at all in the data or the
  // metadata is META-NO-DATES (noDateSaid): only what those leave unsaid is reported here, a column empty in every row
  if (!eventSide) {
    emptyCheck(terms.get('eventdate'), true, noDateSaid);
    for (const [, key] of REQUIRED_COMMON.slice(1)) emptyCheck(terms.get(key), true);
  }
  if (t.core === 'Occurrence') for (const [, key] of REQUIRED_OCCURRENCE) emptyCheck(terms.get(key), false);

  // recommended: the column is missing, or empty in every row
  const recommended = [...(t.core === 'Occurrence' ? [['scientificNameID', 'scientificnameid'] as [string, string]] : []), ...(eventSide ? [] : RECOMMENDED_DEPTH)];
  const lacking = recommended.filter(([, key]) => {
    const i = terms.get(key);
    return i === undefined || (rows > 0 && empty(i));
  });
  if (lacking.length > 0) out.push(makeFinding('DWC-RECOMMENDED', { file: file.fileName, sheet: sheet.name, params: { core: t.core, terms: lacking.map(([n]) => n).join(', ') } }));
}

/* ---------- controlled vocabularies ---------- */

/** The eight identifiers of the GBIF basis-of-record vocabulary (basis_of_record_2022-02-02.xml), the list obis-qc reads. */
export const BASIS_OF_RECORD = ['PreservedSpecimen', 'FossilSpecimen', 'LivingSpecimen', 'HumanObservation', 'MachineObservation', 'MaterialSample', 'Occurrence', 'MaterialCitation'] as const;
/** What obis-qc accepts as occurrenceStatus (absence.py): absent and notDetected, present and detected. */
export const OCCURRENCE_STATUS = ['absent', 'present', 'notDetected', 'detected'] as const;

/** One finding per distinct value outside the list (compared in lower case, ends trimmed, like obis-qc), with its rows. */
function vocabulary(file: ParsedFile, sheet: RawSheet, index: number, allowed: readonly string[], out: Finding[]): void {
  const ok = new Set(allowed.map((a) => a.toLowerCase()));
  const bad = new Map<string, number[]>();
  for (const c of column(sheet, index)) {
    if (c.v === '' || ok.has(c.v.toLowerCase())) continue;
    const list = bad.get(c.v);
    if (list) list.push(c.line);
    else bad.set(c.v, [c.line]);
  }
  const field = sheet.header[index];
  const base = { file: file.fileName, sheet: sheet.name, field, params: { allowed: allowed.join(', ') } };
  const entries = [...bad.entries()];
  for (const [value, lines] of entries.slice(0, MAX_VALUE_FINDINGS)) out.push(makeFinding('DWC-VOCAB-VALUE', { ...base, value, lines }));
  const rest = entries.slice(MAX_VALUE_FINDINGS);
  if (rest.length > 0) out.push(makeFinding('DWC-VOCAB-VALUE', { ...base, value: `…+${rest.length}`, lines: rest.flatMap(([, lines]) => lines) }));
}

/* ---------- eventID, parentEventID, occurrenceID ---------- */

/**
 * Rows of every id that appears more than once, and how many ids repeat; undefined when none does. With `disagreeing`, only an id whose
 * rows differ in their `sig` counts: a flattened table repeats its eventID on every depth level, which is not an error.
 */
function repeated(ids: { line: number; v: string; sig?: string }[], disagreeing = false): { lines: number[]; example: string; count: number } | undefined {
  const seen = new Map<string, number[]>();
  const sigs = new Map<string, Set<string>>();
  for (const { line, v, sig } of ids) {
    if (v === '') continue;
    const list = seen.get(v);
    if (list) list.push(line);
    else seen.set(v, [line]);
    if (disagreeing) {
      const set = sigs.get(v);
      if (set) set.add(sig ?? '');
      else sigs.set(v, new Set([sig ?? '']));
    }
  }
  // only the ids whose rows say different things stay (one identifier used for different events)
  if (disagreeing) for (const [v, set] of sigs) if (set.size < 2) seen.delete(v);
  let count = 0;
  let example: string | undefined;
  let first = Infinity;
  const lines: number[] = [];
  for (const [v, ls] of seen) {
    if (ls.length < 2) continue;
    count++;
    pushAll(lines, ls);
    if (ls[0] < first) {
      first = ls[0];
      example = v;
    }
  }
  return count === 0 || example === undefined ? undefined : { lines, example, count };
}

/** Event ids on a loop of the eventID -> parentEventID chain: each id is visited once, so this is linear. */
function loopIds(parentOf: Map<string, string>): Set<string> {
  const state = new Map<string, 1 | 2>(); // 1 = on the path being walked, 2 = settled
  const onLoop = new Set<string>();
  for (const start of parentOf.keys()) {
    if (state.has(start)) continue;
    const path: string[] = [];
    let at: string | undefined = start;
    while (at !== undefined && !state.has(at)) {
      state.set(at, 1);
      path.push(at);
      at = parentOf.get(at);
    }
    if (at !== undefined && state.get(at) === 1) for (let i = path.indexOf(at); i < path.length; i++) onLoop.add(path[i]);
    for (const p of path) state.set(p, 2);
  }
  return onLoop;
}

/** A date by its parsed value (an interval by both ends), a coordinate as a number (60.5 and 60.50 agree), anything unreadable as its text. */
function signature(term: string, cell: RawCell | undefined): string {
  const t = text(cell);
  if (t === '') return '';
  if (term === 'eventdate') {
    const d = parseDate(t, { date1904: false, dateFormatted: false });
    return 'error' in d ? t : `${d.iso}/${d.end?.iso ?? ''}`;
  }
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : t;
}

function identifiers(file: ParsedFile, sheet: RawSheet, t: DwcTable, terms: Map<string, number>, out: Finding[]): void {
  const idCol = t.archive ? sheet.header.findIndex((h) => h.trim().toLowerCase() === 'id') : -1;
  const base = { file: file.fileName, sheet: sheet.name };
  if (t.core === 'Occurrence') {
    const i = terms.get('occurrenceid') ?? (terms.has('eventid') ? undefined : idCol >= 0 ? idCol : undefined);
    if (i === undefined) return;
    const dup = repeated(column(sheet, i));
    if (dup) out.push(makeFinding('DWC-OCCURRENCEID-DUPLICATE', { ...base, lines: dup.lines, field: sheet.header[i], value: dup.example, params: { count: dup.count } }));
    return;
  }
  // an Event core: eventID is the key; a parentEventID must name an eventID of the table, and the chain must end
  const e = terms.get('eventid') ?? (idCol >= 0 ? idCol : undefined);
  if (e === undefined) return;
  const events = column(sheet, e);
  // a Darwin Core Archive Event core is strict (one row per event). Elsewhere (a flattened sheet repeats the eventID per depth level)
  // a repeat is an error only when the rows disagree on the date or the position: one identifier used for different events
  let sigged = events;
  if (!t.archive) {
    const cols = ['eventdate', 'decimallatitude', 'decimallongitude'].map((k) => ({ k, i: terms.get(k) })).filter((c): c is { k: string; i: number } => c.i !== undefined);
    sigged = events.map((x, k) => ({ ...x, sig: cols.map((c) => signature(c.k, sheet.rows[k].cells[c.i])).join('|') }));
  }
  const dup = repeated(sigged, !t.archive);
  if (dup) out.push(makeFinding('DWC-EVENTID-DUPLICATE', { ...base, lines: dup.lines, field: sheet.header[e], value: dup.example, params: { count: dup.count } }));
  const p = terms.get('parenteventid');
  if (p === undefined || file.dwca?.partial) return; // the parents may be in the rows that were not read
  const parents = column(sheet, p);
  const known = new Set(events.filter((x) => x.v !== '').map((x) => x.v));
  const dangling: number[] = [];
  const missingIds = new Set<string>();
  let example: string | undefined;
  parents.forEach((x) => {
    if (x.v === '' || known.has(x.v)) return;
    dangling.push(x.line);
    missingIds.add(x.v);
    example ??= x.v;
  });
  if (dangling.length > 0 && example !== undefined) {
    out.push(makeFinding('DWC-PARENT-DANGLING', { ...base, lines: dangling, field: sheet.header[p], value: example, params: { count: missingIds.size } }));
  }
  const parentOf = new Map<string, string>();
  events.forEach((x, k) => {
    if (x.v !== '' && !parentOf.has(x.v) && parents[k].v !== '') parentOf.set(x.v, parents[k].v);
  });
  const loops = loopIds(parentOf);
  if (loops.size > 0) {
    const rows = events.filter((x) => loops.has(x.v));
    out.push(makeFinding('DWC-PARENT-LOOP', { ...base, lines: rows.map((x) => x.line), field: sheet.header[p], value: rows[0].v, params: { count: rows.length } }));
  }
}

/* ---------- invisible characters ---------- */

/*
 * Characters that look like a space, or like nothing, and are not an ordinary space: the no-break space (U+00A0) and the other Unicode
 * spaces (U+1680, U+2000..U+200A, U+202F, U+205F, U+3000), the zero-width characters (U+200B zero-width space, U+200C, U+200D,
 * U+2060, U+FEFF), tab, line breaks inside a cell and the line and paragraph separators. The OBIS Manual names the no-break space,
 * tabs, line breaks within a cell and U+200B; the other zero-width characters and spaces are the same problem. The ends of a value are
 * trimmed first, as OBIS (and this tool) do, so only a character INSIDE a value counts (and a zero-width one at the end, which
 * trimming leaves alone).
 */
const INVISIBLE = /[\t\n\r\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]/g;
const NAMES: Record<string, string> = {
  '\t': 'tab', '\n': 'line break', '\r': 'line break', '\u00A0': 'no-break space', '\u1680': 'ogham space', '\u202F': 'narrow no-break space',
  '\u205F': 'medium mathematical space', '\u3000': 'ideographic space', '\u200B': 'zero-width space', '\u200C': 'zero-width non-joiner',
  '\u200D': 'zero-width joiner', '\u2060': 'word joiner', '\uFEFF': 'zero-width no-break space', '\u2028': 'line separator', '\u2029': 'paragraph separator',
};
const codePoint = (ch: string): string => `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
const nameOf = (ch: string): string => NAMES[ch] ?? 'space character';
/** The value with each invisible character written as ⟨U+00A0⟩, cut to a readable length. */
function revealed(v: string): string {
  const r = v.replace(INVISIBLE, (ch) => `⟨${codePoint(ch)}⟩`);
  return r.length > 60 ? `${r.slice(0, 57)}…` : r;
}

function invisible(file: ParsedFile, sheet: RawSheet, index: number, out: Finding[]): void {
  const lines: number[] = [];
  const seen = new Set<string>();
  let example: string | undefined;
  for (const r of sheet.rows) {
    const c = r.cells[index];
    if (typeof c !== 'string') continue;
    const v = c.trim();
    const hits = v.match(INVISIBLE);
    if (!hits) continue;
    lines.push(r.line);
    for (const h of hits) seen.add(h);
    example ??= v;
  }
  if (lines.length === 0 || example === undefined) return;
  const chars = [...seen].sort().map((ch) => `${codePoint(ch)} ${nameOf(ch)}`).join(', ');
  out.push(makeFinding('ROW-INVISIBLE-CHAR', { file: file.fileName, sheet: sheet.name, lines, field: sheet.header[index], value: revealed(example), params: { chars } }));
}

/** Darwin Core columns whose values are names, identifiers or vocabulary terms: matched exactly by OBIS, so an invisible character breaks them. */
const DWC_MATCHED = new Set([
  'scientificname', 'acceptednameusage', 'originalnameusage', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'specificepithet',
  'infraspecificepithet', 'basisofrecord', 'occurrencestatus',
]);
/** Identifier columns: the Darwin Core terms ending in ID that are in DWC_TERMS, the parent-name identifiers, and the number-like identifiers. */
const DWC_ID_EXTRA = new Set(['acceptednameusageid', 'parentnameusageid', 'originalnameusageid', 'catalognumber', 'recordnumber', 'fieldnumber']);
const isIdTerm = (t: string): boolean => (DWC_TERMS.has(t) && t.endsWith('id')) || DWC_ID_EXTRA.has(t);

/* ---------- public ---------- */

/**
 * The raw-table checks of one sheet. `idColumns` are the columns the user's mapping reads as station, cruise or sample identifier (any
 * sheet): their values are matched by the station checks, so an invisible character inside one is reported. On Darwin Core input the
 * structure, the vocabularies and the name, identifier and vocabulary columns are checked as well. `noDateSaid`: META-NO-DATES is going
 * to report that no date exists anywhere, so a column eventDate empty in every row is not reported a second time.
 */
export function checkRawTable(file: ParsedFile, sheet: RawSheet, idColumns: readonly number[], ctx: { noDateSaid?: boolean } = {}): Finding[] {
  const out: Finding[] = [];
  const dwc = dwcTableOf(file, sheet);
  const invisibleCols = new Set<number>(idColumns);
  if (dwc) {
    const terms = termColumns(sheet);
    structure(file, sheet, dwc, terms, ctx.noDateSaid === true, out);
    for (const [key, allowed] of [['basisofrecord', BASIS_OF_RECORD], ['occurrencestatus', OCCURRENCE_STATUS]] as const) {
      const i = terms.get(key);
      if (i !== undefined) vocabulary(file, sheet, i, allowed, out);
    }
    identifiers(file, sheet, dwc, terms, out);
    for (const [term, i] of terms) if (DWC_MATCHED.has(term) || isIdTerm(term)) invisibleCols.add(i);
    if (dwc.archive) sheet.header.forEach((h, i) => h.trim().toLowerCase() === 'id' && invisibleCols.add(i));
  }
  for (const i of [...invisibleCols].sort((a, b) => a - b)) invisible(file, sheet, i, out);
  return out;
}

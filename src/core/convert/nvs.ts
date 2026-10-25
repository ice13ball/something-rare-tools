// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { P01_URI, P06_URI, conceptUri } from './nerc';

/*
 * The pure half of the NVS opt-in (stage 5): the search word, the SPARQL query built from it, the shape of the answer, and what a concept result is. No I/O: the one
 * module that talks to the network is src/app/optins/nvs.ts (main thread only; the worker never fetches).
 *
 * What the service is (checked 2026-10-25, docs/research/qc-sources.md, "Converter (/convert) - stage 5 verification"): the NERC Vocabulary Server of the British
 * Oceanographic Data Centre at the National Oceanography Centre. GET https://vocab.nerc.ac.uk/sparql/sparql?query=... with `Accept: application/sparql-results+json` answers
 * JSON with access-control-allow-origin `*` and needs no preflight (Accept is a safelisted header); WITHOUT that header it answers XML. A concept page
 * (.../collection/P01/current/<CODE>/?_profile=nvs&_mediatype=application/ld+json) is also open to a plain GET, and answers a preflight with 405: plain GETs only.
 *
 * What is sent: the typed search word, inside the query, and nothing else. What is never sent: the data, the values, the column header, the file name, the other words of
 * the page. The query text is built here from fixed text and the ESCAPED word only.
 */

export type NvsCollection = 'P01' | 'P06';

/** At most this many results are asked for (and read): a small list the user can look through. */
export const NVS_LIMIT = 20;
/** The typed search is cut to this many characters and this many words. */
export const NVS_MAX_CHARS = 80;
export const NVS_MAX_WORDS = 4;

/**
 * The typed text as the words that are searched: control characters and line breaks become spaces, runs of spaces become one, the ends are trimmed, and it is cut to
 * NVS_MAX_CHARS characters and NVS_MAX_WORDS words. Empty after that: nothing is searched (the button stays inactive, no request is made).
 */
export function searchWords(typed: string): string[] {
  const clean = typed
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NVS_MAX_CHARS)
    .trim();
  return clean === '' ? [] : clean.split(' ').slice(0, NVS_MAX_WORDS);
}

/**
 * One word as the body of a SPARQL string literal in double quotes (STRING_LITERAL2): a backslash, a double quote, a line break, a carriage return, a tab and every other
 * control character cannot stand raw, so they are written as escapes; a single quote, braces, angle brackets and anything else are plain characters inside this literal.
 *
 * SPARQL turns a \uXXXX escape into its character BEFORE it parses the string (SPARQL 1.1, 19.2): a doubled backslash followed by u would meet that rule as "\" then "\u...".
 * So a backslash that is followed by u or U is written as the escaped backslash and the letter as its own \u escape: the literal then says exactly the typed text.
 */
export function sparqlLiteralBody(word: string): string {
  let out = '';
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const code = c.codePointAt(0) as number;
    if (c === '\\') {
      out += '\\\\';
      const next = chars[i + 1];
      if (next === 'u' || next === 'U') {
        out += `\\u00${next === 'u' ? '75' : '55'}`;
        i++;
      }
    } else if (c === '"') out += '\\"';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c === '\b') out += '\\b';
    else if (c === '\f') out += '\\f';
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += c;
  }
  return out;
}

const lit = (word: string): string => `"${sparqlLiteralBody(word.toLowerCase())}"`;

/**
 * The query for the typed words, restricted to ONE collection (P01 for a measured variable, P06 for a unit): the concepts of that collection's current list (the versioned
 * /<CODE>/<n>/ addresses the endpoint also returns are excluded by the pattern), with the preferred label and the `owl:deprecated` flag. A single word may stand in the label or
 * in the code; several words must all stand in the label (case-insensitive). A small LIMIT. Returns undefined when there is nothing to search.
 */
export function nvsQuery(typed: string, collection: NvsCollection): string | undefined {
  const words = searchWords(typed);
  if (words.length === 0) return undefined;
  const inLabel = (w: string): string => `CONTAINS(LCASE(STR(?l)), ${lit(w)})`;
  const filter = words.length === 1 ? `${inLabel(words[0])} || CONTAINS(LCASE(STR(?c)), ${lit(words[0])})` : words.map(inLabel).join(' && ');
  return [
    'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
    'PREFIX owl: <http://www.w3.org/2002/07/owl#>',
    'SELECT ?c ?l ?d WHERE {',
    '  ?c skos:prefLabel ?l .',
    '  OPTIONAL { ?c owl:deprecated ?d }',
    `  FILTER(REGEX(STR(?c), "^http://vocab[.]nerc[.]ac[.]uk/collection/${collection}/current/[^/]+/$"))`,
    `  FILTER(${filter})`,
    '}',
    // the shortest labels first: a short label is the closer match to the words typed (alphabetical order would fill the small list with long, unrelated labels)
    `ORDER BY STRLEN(STR(?l)) ?l LIMIT ${NVS_LIMIT}`,
  ].join('\n');
}

/* ---------- what an answer holds ---------- */

/**
 * One concept of a search. `deprecated` is true for anything the service did not say is current (owl:deprecated "true", or no flag at all): such a concept is shown and
 * can never be chosen ("You should not use any deprecated concepts for any measurement ID", OBIS Manual, "Vocabulary").
 */
export interface NvsConcept {
  collection: NvsCollection;
  code: string;
  uri: string;
  label: string;
  deprecated: boolean;
}

const MAX_LABEL = 400;
// eslint-disable-next-line no-control-regex
const cleanLabel = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

function conceptOf(collection: NvsCollection, uri: string, label: unknown, deprecated: unknown): NvsConcept | undefined {
  if (!(collection === 'P01' ? P01_URI : P06_URI).test(uri)) return undefined;
  if (typeof label !== 'string' || cleanLabel(label) === '') return undefined;
  const code = uri.split('/')[6];
  return { collection, code, uri, label: cleanLabel(label), deprecated: !(deprecated === 'false' || deprecated === false) };
}

/**
 * The concepts of a SPARQL JSON answer (application/sparql-results+json) to nvsQuery, or undefined when the body is not that shape. Only the three fields the query asks
 * for are read. A binding whose address is not a P01 / P06 concept address of the collection asked for, or that has no label, is left out; an address is listed once.
 */
export function readSparqlAnswer(body: unknown, collection: NvsCollection): NvsConcept[] | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const results = (body as { results?: unknown }).results;
  if (typeof results !== 'object' || results === null) return undefined;
  const bindings = (results as { bindings?: unknown }).bindings;
  if (!Array.isArray(bindings)) return undefined;
  const out: NvsConcept[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    if (typeof b !== 'object' || b === null) return undefined;
    const r = b as Record<string, unknown>;
    const c = r.c as { value?: unknown } | undefined;
    const l = r.l as { value?: unknown } | undefined;
    const d = r.d as { value?: unknown } | undefined;
    if (typeof c?.value !== 'string') continue;
    const concept = conceptOf(collection, c.value, l?.value, d?.value);
    if (!concept || seen.has(concept.uri)) continue;
    seen.add(concept.uri);
    out.push(concept);
    if (out.length >= NVS_LIMIT) break;
  }
  return out;
}

/* ---------- the fallback: one concept by its code ---------- */

/** The code of a typed text when it is exactly one concept code of the collection (upper-case letters and digits: eight for P01, four for P06), else undefined. */
export function typedCode(typed: string, collection: NvsCollection): string | undefined {
  const t = typed.trim().toUpperCase();
  return conceptUri(collection, t) === undefined ? undefined : t;
}

/**
 * The concept of a concept page's JSON-LD (the nvs profile), for the address asked for: the node whose @id is that address, with its skos:prefLabel and owl:deprecated.
 * Undefined when the body has no such node.
 */
export function readConceptJsonLd(body: unknown, uri: string, collection: NvsCollection): NvsConcept | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const root = body as Record<string, unknown>;
  const nodes: unknown[] = Array.isArray(root['@graph']) ? (root['@graph'] as unknown[]) : [root];
  const value = (v: unknown): unknown => (Array.isArray(v) ? value(v.find((x) => typeof x === 'object' && x !== null && (x as { '@language'?: string })['@language'] === 'en') ?? v[0]) : typeof v === 'object' && v !== null ? (v as { '@value'?: unknown })['@value'] : v);
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const r = n as Record<string, unknown>;
    if (r['@id'] !== uri) continue;
    return conceptOf(collection, uri, value(r['skos:prefLabel']), value(r['owl:deprecated']));
  }
  return undefined;
}

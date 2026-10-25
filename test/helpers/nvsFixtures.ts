// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// HAND-WRITTEN fixtures in the shape of the NERC Vocabulary Server (NVS), reduced to the fields src/core/convert/nvs.ts reads: for SPARQL (application/sparql-results+json)
// the three bindings of the query, ?c (the concept address), ?l (the preferred label) and ?d (owl:deprecated as the string "true" or "false"); for a concept page (JSON-LD,
// ?_profile=nvs) the node's @id, skos:prefLabel and owl:deprecated. The shape and the cases were checked against the real service on 2026-10-25
// (docs/research/qc-sources.md, stage 5 verification); test/convert/nvs.live.test.ts (NVS_LIVE=1) is the check against it. No definition, link, mapping, version, author or
// date of an NVS record is kept: the codes and labels of the real concepts are identifiers the converter itself lists (src/core/convert/vocab.ts); the others are INVENTED.
// The default suite makes no network call: `fetch` is replaced by the mock below.
import { vi } from 'vitest';

export interface FixtureConcept {
  collection: 'P01' | 'P06';
  code: string;
  label: string;
  /** "true" | "false"; undefined = the concept carries no flag. */
  deprecated?: string;
}

export const CATALOGUE: FixtureConcept[] = [
  { collection: 'P01', code: 'TEMPPR01', label: 'Temperature of the water body', deprecated: 'false' },
  { collection: 'P01', code: 'PSLTZZ01', label: 'Practical salinity of the water body', deprecated: 'false' },
  { collection: 'P01', code: 'CPHLZZXX', label: 'Concentration of chlorophyll-a {chl-a CAS 479-61-8} per unit volume of the water body [particulate >unknown phase]', deprecated: 'false' },
  { collection: 'P01', code: 'ZZTESTC1', label: 'Invented current concept of the water body for the tests', deprecated: 'false' },
  { collection: 'P01', code: 'ZZTESTD1', label: 'Invented deprecated concept of the water body for the tests', deprecated: 'true' },
  { collection: 'P01', code: 'ZZTESTN1', label: 'Invented concept of the water body with no deprecation flag', },
  { collection: 'P06', code: 'UPAA', label: 'Degrees Celsius', deprecated: 'false' },
  { collection: 'P06', code: 'UPOX', label: 'Micromoles per litre', deprecated: 'false' },
  { collection: 'P06', code: 'ZZZD', label: 'Invented deprecated unit for the tests', deprecated: 'true' },
];

export const conceptAddress = (c: { collection: string; code: string }): string => `http://vocab.nerc.ac.uk/collection/${c.collection}/current/${c.code}/`;

/**
 * The string literals of a SPARQL text, decoded the way a SPARQL parser does: \uXXXX escapes are replaced first (SPARQL 1.1, 19.2), then each double-quoted literal is read with
 * its ECHAR escapes. A raw line break or an unterminated literal is a syntax error (throws), as it is for the service. `skeleton` is the text with every literal replaced by S.
 */
export function parseSparqlLiterals(query: string): { literals: string[]; skeleton: string } {
  // ONE left-to-right pass: a character produced by an escape is not scanned again
  const pre = query.replace(/\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})/g, (_m, h4: string | undefined, h8: string | undefined) => String.fromCodePoint(parseInt((h4 ?? h8) as string, 16)));
  const literals: string[] = [];
  let skeleton = '';
  for (let i = 0; i < pre.length; i++) {
    const c = pre[i];
    if (c === '<' && /^<[^<>"{}|^`\\\s]*>/.test(pre.slice(i))) {
      const iri = /^<[^<>"{}|^`\\\s]*>/.exec(pre.slice(i)) as RegExpExecArray;
      skeleton += iri[0];
      i += iri[0].length - 1;
      continue;
    }
    if (c !== '"') {
      skeleton += c;
      continue;
    }
    let lit = '';
    i++;
    for (;; i++) {
      if (i >= pre.length) throw new Error('unterminated literal');
      const d = pre[i];
      if (d === '"') break;
      if (d === '\n' || d === '\r') throw new Error('line break in a literal');
      if (d === '\\') {
        const e = pre[++i];
        const map: Record<string, string> = { t: '\t', b: '\b', n: '\n', r: '\r', f: '\f', '"': '"', "'": "'", '\\': '\\' };
        if (!(e in map)) throw new Error(`bad escape \\${e}`);
        lit += map[e];
      } else lit += d;
    }
    literals.push(lit);
    skeleton += 'S';
  }
  return { literals, skeleton };
}

export interface NvsCall {
  url: string;
  /** The decoded SPARQL query, or undefined for a concept page. */
  query: string | undefined;
  init: RequestInit | undefined;
}

export interface NvsMockOptions {
  /** Rejects the call with this error (a network or CORS failure) from the Nth call on (1-based); `onlySparql` limits it to SPARQL calls. */
  failFrom?: number;
  onlySparql?: boolean;
  failWith?: Error;
  /** Answers this HTTP status (no body) from the Nth call on. */
  statusFrom?: number;
  status?: number;
  /** Answers a SPARQL body that is not a result set. */
  malformed?: boolean;
  /** Called with each call before it answers; may return a promise (to hold a call open for an abort test). */
  onCall?: (call: NvsCall, n: number) => Promise<void> | void;
  /** Extra concepts the "service" holds. */
  extra?: FixtureConcept[];
}

/** A fetch replacement that answers like NVS and the calls it saw. Install it with vi.stubGlobal('fetch', mock.fetch). */
export function nvsMock(opts: NvsMockOptions = {}) {
  const calls: NvsCall[] = [];
  const all = [...CATALOGUE, ...(opts.extra ?? [])];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const u = new URL(url);
    const sparql = u.pathname === '/sparql/sparql';
    const query = sparql ? (u.searchParams.get('query') ?? '') : undefined;
    const call: NvsCall = { url, query, init };
    calls.push(call);
    const n = calls.length;
    if (opts.onCall) await opts.onCall(call, n);
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (opts.failFrom !== undefined && n >= opts.failFrom && (!opts.onlySparql || sparql)) throw opts.failWith ?? new TypeError('Failed to fetch');
    if (opts.statusFrom !== undefined && n >= opts.statusFrom) return new Response('error', { status: opts.status ?? 500 });
    if (sparql) {
      if (opts.malformed) return new Response(JSON.stringify({ not: 'a result set' }), { status: 200 });
      const { literals } = parseSparqlLiterals(query as string); // a syntax error the service would answer with HTTP 400
      const coll = /collection\/(P0[16])\/current/.exec(literals[0])?.[1] as 'P01' | 'P06';
      const words = literals.slice(1);
      const single = /FILTER\(CONTAINS\(LCASE\(STR\(\?l\)\), S\) \|\| CONTAINS\(LCASE\(STR\(\?c\)\), S\)\)/.test(query as string);
      const hits = all
        .filter((c) => c.collection === coll)
        .filter((c) => (single ? c.label.toLowerCase().includes(words[0]) || conceptAddress(c).toLowerCase().includes(words[0]) : words.every((w) => c.label.toLowerCase().includes(w))))
        .sort((a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label))
        .slice(0, 20);
      const bindings = hits.map((c) => ({
        c: { type: 'uri', value: conceptAddress(c) },
        l: { type: 'literal', 'xml:lang': 'en', value: c.label },
        ...(c.deprecated === undefined ? {} : { d: { type: 'literal', value: c.deprecated } }),
      }));
      return new Response(JSON.stringify({ head: { vars: ['c', 'l', 'd'] }, results: { bindings } }), { status: 200, headers: { 'content-type': 'application/sparql-results+json; charset=utf-8' } });
    }
    const m = /^\/collection\/(P0[16])\/current\/([A-Z0-9]+)\/$/.exec(u.pathname);
    const hit = m ? all.find((c) => c.collection === m[1] && c.code === m[2]) : undefined;
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(
      JSON.stringify({ '@id': conceptAddress(hit), '@type': 'skos:Concept', 'skos:prefLabel': { '@language': 'en', '@value': hit.label }, ...(hit.deprecated === undefined ? {} : { 'owl:deprecated': hit.deprecated }) }),
      { status: 200, headers: { 'content-type': 'application/ld+json' } },
    );
  });
  return { fetch: fetchImpl, calls };
}

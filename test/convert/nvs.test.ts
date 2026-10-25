// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 5, B3: the NVS opt-in, below the page. The typed word is the only thing sent and it cannot change the query (SPARQL injection); the request options are the ones
// the owner approved (credentials omitted, no referrer, redirect refused, no retry, an abort that aborts, sequential); an answer is read strictly (only P01 / P06 concept
// addresses of the asked collection, a concept not stated current is flagged deprecated); the fallback by code only for a typed code. fetch is a mock: no network call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NVS_SPARQL_ENDPOINT, nvsConceptUrl, nvsSearchUrl, searchNvs } from '../../src/app/optins/nvs';
import { NVS_LIMIT, NVS_MAX_CHARS, NVS_MAX_WORDS, nvsQuery, readConceptJsonLd, readSparqlAnswer, searchWords, sparqlLiteralBody, typedCode } from '../../src/core/convert/nvs';
import { conceptAddress, nvsMock, parseSparqlLiterals } from '../helpers/nvsFixtures';

afterEach(() => vi.unstubAllGlobals());
const signal = (): AbortSignal => new AbortController().signal;

describe('the typed word', () => {
  it('is cut into at most four words, line breaks and control characters are spaces, and nothing typed means nothing to search', () => {
    expect(searchWords('  chlorophyll   a \n water\t body  ')).toEqual(['chlorophyll', 'a', 'water', 'body']);
    expect(searchWords('a b c d e f')).toEqual(['a', 'b', 'c', 'd']);
    expect(searchWords('x'.repeat(200))[0].length).toBe(NVS_MAX_CHARS);
    expect(NVS_MAX_WORDS).toBe(4);
    expect(searchWords('')).toEqual([]);
    expect(searchWords(' \n\t\u0000  ')).toEqual([]);
    expect(nvsQuery('   ', 'P01')).toBeUndefined();
    expect(nvsSearchUrl('', 'P06')).toBeUndefined();
  });
});

/** The hostile texts: a quote, a backslash, braces, a comment, a line break, a UNION, an IRI, a unicode escape that would be a quote, a control character. */
const HOSTILE = [
  '"',
  '""',
  '\\',
  '\\\\',
  '\\"',
  'a" ) } UNION { ?s ?p ?o } #',
  '"; DROP ALL; "',
  '} { ?s ?p ?o }',
  'x\n} # comment\n{ ?s ?p ?o',
  'x\r\n"y',
  "it's",
  '<http://evil.example/>',
  '\\u0022 ) } UNION { ?s ?p ?o } #',
  '\\\\u0022',
  '\\\\\\u0022',
  '\\U00000022',
  'a\\u000Ab',
  '\\u',
  'tab\there',
  'nul\u0000x',
  '  line separator',
  '${process.exit()}',
  '{ } { ?x',
  '`; ` ',
];

describe('SPARQL injection: the escaped word cannot leave its string literal', () => {
  /** What the query looks like with every string literal replaced by S, for a harmless word: the skeleton every query must have. */
  const skeletonOf = (word: string, collection: 'P01' | 'P06' = 'P01'): string => parseSparqlLiterals(nvsQuery(word, collection) as string).skeleton;

  it('the skeleton of the query is the same for every word of one kind: the text outside the literals is fixed', () => {
    const single = skeletonOf('temperature');
    const multi = skeletonOf('water temperature');
    expect(single).not.toBe(multi); // one word may match the code as well; several words must all match the label
    for (const h of HOSTILE) {
      const words = searchWords(h);
      if (words.length === 0) continue;
      const q = nvsQuery(h, 'P01') as string;
      const { skeleton, literals } = parseSparqlLiterals(q); // throws on a raw line break or an unterminated literal
      expect(skeleton, JSON.stringify(h)).toBe(words.length === 1 ? single : skeletonOf(words.map(() => 'w').join(' ')));
      // the literals are the fixed pattern, then exactly the typed words (lower case): decoded, they say what was typed
      expect(literals[0]).toBe('^http://vocab[.]nerc[.]ac[.]uk/collection/P01/current/[^/]+/$');
      const typedLiterals = words.length === 1 ? [literals[1], literals[2]] : literals.slice(1);
      for (const l of typedLiterals) expect(words.map((w) => w.toLowerCase()), JSON.stringify(h)).toContain(l);
    }
  });

  it('a quote, a backslash, a brace and a line break are escapes inside the literal, and the decoded literal is the typed text', () => {
    expect(sparqlLiteralBody('a"b')).toBe('a\\"b');
    expect(sparqlLiteralBody('a\\b')).toBe('a\\\\b');
    expect(sparqlLiteralBody('a\nb\rc\td')).toBe('a\\nb\\rc\\td');
    expect(sparqlLiteralBody("it's {x} <y>")).toBe("it's {x} <y>");
    expect(sparqlLiteralBody('\u0000')).toBe('\\u0000');
    expect(sparqlLiteralBody('\\u0022')).toBe('\\\\\\u0075' + '0022'); // the u of a backslash-u is its own escape: SPARQL decodes \uXXXX before parsing
    expect(sparqlLiteralBody('\\U00000022')).toBe('\\\\\\u0055' + '00000022');
    for (const h of HOSTILE) {
      const body = sparqlLiteralBody(h);
      const { literals, skeleton } = parseSparqlLiterals(`"${body}"`);
      expect(skeleton, JSON.stringify(h)).toBe('S');
      expect(literals, JSON.stringify(h)).toEqual([h]);
    }
  });

  it('the query is limited to the one collection, with a small LIMIT, and asks for the code, the label and the deprecated flag', () => {
    const p01 = nvsQuery('salinity', 'P01') as string;
    const p06 = nvsQuery('celsius', 'P06') as string;
    expect(p01).toContain('collection/P01/current/');
    expect(p01).not.toContain('collection/P06');
    expect(p06).toContain('collection/P06/current/');
    expect(p06).not.toContain('collection/P01');
    for (const q of [p01, p06]) {
      expect(q).toContain(`LIMIT ${NVS_LIMIT}`);
      expect(q).toContain('SELECT ?c ?l ?d');
      expect(q).toContain('OPTIONAL { ?c owl:deprecated ?d }');
      expect(q).not.toMatch(/\bUNION\b|\bSERVICE\b|\bINSERT\b|\bDELETE\b|\bGRAPH\b/);
    }
    expect(NVS_LIMIT).toBe(20);
    // the typed text appears nowhere but in its literals: a quote in it does not add a literal
    const q = nvsQuery('"} UNION {', 'P01') as string;
    expect(parseSparqlLiterals(q).literals.length).toBe(1 + 2 + 0 - 0 + (searchWords('"} UNION {').length > 1 ? 1 : 0));
  });

  it('the URL carries the query percent-encoded and nothing else', () => {
    const url = nvsSearchUrl('temperature', 'P01') as string;
    expect(url.startsWith(`${NVS_SPARQL_ENDPOINT}?query=`)).toBe(true);
    expect(new URL(url).searchParams.get('query')).toBe(nvsQuery('temperature', 'P01'));
    expect([...new URL(url).searchParams.keys()]).toEqual(['query']);
    expect(new URL(url).hash).toBe('');
  });
});

describe('reading an answer', () => {
  const b = (c: unknown, l: unknown, d?: unknown) => ({ c, l, ...(d === undefined ? {} : { d }) });
  const uri = (code: string, coll = 'P01') => ({ type: 'uri', value: `http://vocab.nerc.ac.uk/collection/${coll}/current/${code}/` });
  const lit = (value: unknown, extra: object = {}) => ({ type: 'literal', value, ...extra });

  it('a current concept, a deprecated one and one with no flag: only "false" is current; the other two are flagged and can never be chosen', () => {
    const r = readSparqlAnswer({ results: { bindings: [b(uri('TEMPPR01'), lit('Temperature of the water body'), lit('false')), b(uri('ZZTESTD1'), lit('Invented'), lit('true')), b(uri('ZZTESTN1'), lit('Invented, no flag'))] } }, 'P01') as NonNullable<ReturnType<typeof readSparqlAnswer>>;
    expect(r.map((c) => [c.code, c.deprecated])).toEqual([['TEMPPR01', false], ['ZZTESTD1', true], ['ZZTESTN1', true]]);
    expect(r[0]).toEqual({ collection: 'P01', code: 'TEMPPR01', uri: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', label: 'Temperature of the water body', deprecated: false });
  });

  it('leaves out an address that is not a concept of the asked collection (another collection, a versioned address, a foreign host, a bad code), a missing or empty label, and a repeat', () => {
    const bindings = [
      b(uri('TEMPPR01', 'P06'), lit('wrong collection'), lit('false')),
      b(uri('TEMPPR01/1'), lit('versioned'), lit('false')),
      b({ type: 'uri', value: 'http://evil.example/collection/P01/current/TEMPPR01/' }, lit('foreign'), lit('false')),
      b({ type: 'uri', value: 'https://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/' }, lit('https'), lit('false')),
      b(uri('temppr01'), lit('lower case'), lit('false')),
      b(uri('SHORT'), lit('short code'), lit('false')),
      b(uri('TEMPPR01'), lit('   '), lit('false')),
      b(uri('TEMPPR01'), undefined, lit('false')),
      b(uri('PSLTZZ01'), lit('Practical salinity of the water body'), lit('false')),
      b(uri('PSLTZZ01'), lit('Practical salinity of the water body'), lit('false')),
      b({ type: 'literal', value: 5 }, lit('number'), lit('false')),
      b({ nothing: true }, lit('no value'), lit('false')),
    ];
    const r = readSparqlAnswer({ results: { bindings } }, 'P01') as NonNullable<ReturnType<typeof readSparqlAnswer>>;
    expect(r.map((c) => c.code)).toEqual(['PSLTZZ01']);
    // the same bindings for the other collection
    expect((readSparqlAnswer({ results: { bindings: [b(uri('UPAA', 'P06'), lit('Degrees Celsius'), lit('false'))] } }, 'P06') as unknown[]).length).toBe(1);
    expect((readSparqlAnswer({ results: { bindings: [b(uri('UPAA', 'P06'), lit('Degrees Celsius'), lit('false'))] } }, 'P01') as unknown[]).length).toBe(0);
  });

  it('a label is one clean line of text of bounded length; the answer holds at most NVS_LIMIT concepts', () => {
    const r = readSparqlAnswer({ results: { bindings: [b(uri('TEMPPR01'), lit(`a\n\tb\u0000${'x'.repeat(1000)}`), lit('false'))] } }, 'P01') as NonNullable<ReturnType<typeof readSparqlAnswer>>;
    expect(r[0].label.length).toBeLessThanOrEqual(400);
    expect(r[0].label).not.toMatch(/[\u0000-\u001f]/);
    const many = Array.from({ length: 50 }, (_x, i) => b(uri(`ZZTEST${String(i).padStart(2, '0')}`), lit(`concept ${i}`), lit('false')));
    expect((readSparqlAnswer({ results: { bindings: many } }, 'P01') as unknown[]).length).toBe(NVS_LIMIT);
  });

  it('a body that is not a result set is undefined (a format failure), and so is a binding that is not an object', () => {
    for (const body of [null, undefined, 'x', 5, [], {}, { results: null }, { results: {} }, { results: { bindings: 'x' } }, { results: { bindings: [null] } }, { results: { bindings: ['x'] } }]) expect(readSparqlAnswer(body, 'P01'), JSON.stringify(body)).toBeUndefined();
    expect(readSparqlAnswer({ results: { bindings: [] } }, 'P01')).toEqual([]);
  });

  it('a concept page (JSON-LD) is read for its own address: label in the English language, owl:deprecated as a string or a boolean', () => {
    const uri = 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/';
    const node = { '@id': uri, 'skos:prefLabel': { '@language': 'en', '@value': 'Temperature of the water body' }, 'owl:deprecated': 'false' };
    expect(readConceptJsonLd(node, uri, 'P01')).toMatchObject({ code: 'TEMPPR01', label: 'Temperature of the water body', deprecated: false });
    expect(readConceptJsonLd({ ...node, 'owl:deprecated': false }, uri, 'P01')?.deprecated).toBe(false);
    expect(readConceptJsonLd({ ...node, 'owl:deprecated': 'true' }, uri, 'P01')?.deprecated).toBe(true);
    expect(readConceptJsonLd({ ...node, 'owl:deprecated': undefined }, uri, 'P01')?.deprecated).toBe(true);
    expect(readConceptJsonLd({ '@graph': [{ '@id': 'other' }, node] }, uri, 'P01')?.code).toBe('TEMPPR01');
    expect(readConceptJsonLd({ ...node, '@id': 'http://vocab.nerc.ac.uk/collection/P01/current/PSLTZZ01/' }, uri, 'P01')).toBeUndefined();
    expect(readConceptJsonLd(null, uri, 'P01')).toBeUndefined();
    expect(readConceptJsonLd(node, 'http://evil.example/', 'P01')).toBeUndefined();
  });
});

describe('typed code and the concept page address', () => {
  it('a typed text is a code only when it is exactly eight (P01) or four (P06) letters and digits; the address is built from nothing else', () => {
    expect(typedCode('TEMPPR01', 'P01')).toBe('TEMPPR01');
    expect(typedCode('UPAA', 'P06')).toBe('UPAA');
    // exactly as typed, upper case only: a word of the right length is not a code ("invented" has eight letters, "temp" and "upaa" have four)
    for (const t of ['temppr01', ' temppr01 ', ' TEMPPR01', 'TEMPPR01 ', 'Temppr01', 'invented', 'temperature', 'TEMPPR0', 'TEMPPR011', 'TEMP PR01', 'TEMPPR01/', '../TEMPPR01', 'TEMPPR01?x=1', '']) expect(typedCode(t, 'P01'), JSON.stringify(t)).toBeUndefined();
    for (const t of ['upaa', 'temp', 'Upaa', ' UPAA', 'UPAA ']) expect(typedCode(t, 'P06'), JSON.stringify(t)).toBeUndefined();
    expect(typedCode('INVENTED', 'P01')).toBe('INVENTED'); // eight capitals have the shape of a code: that is a code as typed
    expect(typedCode('UPAA', 'P01')).toBeUndefined();
    expect(nvsConceptUrl('TEMPPR01', 'P01')).toBe('https://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/?_profile=nvs&_mediatype=application/ld+json');
    expect(nvsConceptUrl('../x', 'P01')).toBeUndefined();
    expect(nvsConceptUrl('UPAA', 'P01')).toBeUndefined();
  });
});

describe('a text that cannot be encoded never locks the search', () => {
  it('the cut is by code points: 79 letters and an emoji keep the emoji whole, and the request can be built', () => {
    const typed = `${'a'.repeat(79)}😀`;
    const words = searchWords(typed);
    expect(words.join('')).toBe(typed);
    expect(() => encodeURIComponent(nvsQuery(typed, 'P01') as string)).not.toThrow();
    expect(() => encodeURIComponent(nvsQuery(`${'a'.repeat(80)}😀`, 'P01') as string)).not.toThrow();
    expect(searchWords(`${'a'.repeat(80)}😀`).join('')).toBe('a'.repeat(80));
    expect([...searchWords('😀'.repeat(100)).join('')].length).toBe(NVS_MAX_CHARS);
  });

  it('a lone surrogate typed by the user is a space; searchNvs resolves with an answer, never an exception, whatever the text', async () => {
    expect(searchWords('a\ud83dz')).toEqual(['a', 'z']);
    expect(searchWords('\ude00')).toEqual([]);
    const m = nvsMock();
    vi.stubGlobal('fetch', m.fetch);
    for (const t of ['\ud83d', `${'a'.repeat(79)}😀`, 'x\ude00y', '😀']) {
      const run = await searchNvs(t, 'P01', { signal: signal() });
      expect(run.failure, JSON.stringify(t)).toBeUndefined();
    }
    // a fetch that throws synchronously, and one that rejects with something odd: still an answer
    vi.stubGlobal('fetch', () => { throw new Error('boom'); });
    const run = await searchNvs('temperature', 'P01', { signal: signal() });
    expect(run.failure).toBeTruthy();
    expect(run.aborted).toBe(false);
  });
});

describe('the request', () => {
  it('one plain GET to the SPARQL endpoint: credentials omitted, no referrer, redirect refused, no cache, the only header is Accept; nothing but the escaped word in it', async () => {
    const m = nvsMock();
    vi.stubGlobal('fetch', m.fetch);
    const run = await searchNvs('temperature', 'P01', { signal: signal() });
    expect(run.failure).toBeUndefined();
    expect(run.via).toBe('search');
    expect(m.calls.length).toBe(1);
    const init = m.calls[0].init as RequestInit;
    expect(init).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ Accept: 'application/sparql-results+json' });
    expect(init.body).toBeUndefined();
    expect(m.calls[0].url.startsWith(`${NVS_SPARQL_ENDPOINT}?query=`)).toBe(true);
    expect(m.calls[0].query).toBe(nvsQuery('temperature', 'P01'));
    // the concepts found, with their deprecated flags
    expect(run.concepts.map((c) => c.code)).toEqual(['TEMPPR01']);
    expect((await searchNvs('invented deprecated', 'P01', { signal: signal() })).concepts.map((c) => [c.code, c.deprecated])).toEqual([['ZZTESTD1', true]]);
  });

  it('hostile text goes out as an escaped word and nothing else: the mock service, which parses the query as SPARQL does, sees only the typed words as literals', async () => {
    const m = nvsMock();
    vi.stubGlobal('fetch', m.fetch);
    for (const h of HOSTILE) {
      m.calls.length = 0;
      const run = await searchNvs(h, 'P01', { signal: signal() });
      if (searchWords(h).length === 0) {
        expect(m.calls.length, JSON.stringify(h)).toBe(0);
        continue;
      }
      expect(m.calls.length, JSON.stringify(h)).toBe(1);
      expect(run.failure, JSON.stringify(h)).toBeUndefined();
      expect(run.concepts, JSON.stringify(h)).toEqual([]);
    }
  });

  it('nothing typed: no request at all', async () => {
    const m = nvsMock();
    vi.stubGlobal('fetch', m.fetch);
    for (const t of ['', '   ', '\n\t']) {
      const run = await searchNvs(t, 'P06', { signal: signal() });
      expect(run).toEqual({ concepts: [], via: 'search', aborted: false });
    }
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it('a search of P06 asks for units only, and a result of the other collection is not accepted', async () => {
    const m = nvsMock();
    vi.stubGlobal('fetch', m.fetch);
    const run = await searchNvs('celsius', 'P06', { signal: signal() });
    expect(run.concepts.map((c) => c.uri)).toEqual([conceptAddress({ collection: 'P06', code: 'UPAA' })]);
    expect(m.calls[0].query).toContain('collection/P06/current/');
  });

  it('a failed search is NOT retried by itself: one call for a word, and the failure is reported (network, HTTP, format)', async () => {
    for (const [opts, kind] of [[{ failFrom: 1 }, 'network'], [{ statusFrom: 1, status: 503 }, 'http'], [{ malformed: true }, 'format']] as const) {
      const m = nvsMock(opts);
      vi.stubGlobal('fetch', m.fetch);
      const run = await searchNvs('temperature', 'P01', { signal: signal() });
      expect(run.failure?.kind, kind).toBe(kind);
      if (kind === 'http') expect(run.failure).toEqual({ kind: 'http', status: 503 });
      expect(run.concepts).toEqual([]);
      expect(m.calls.length, kind).toBe(1);
    }
  });

  it('Abort really aborts: the signal reaches fetch, the run says aborted, no fallback is tried and nothing is kept', async () => {
    const ac = new AbortController();
    const m = nvsMock({ onCall: () => new Promise<void>((resolve) => setTimeout(resolve, 20)) });
    vi.stubGlobal('fetch', m.fetch);
    const pending = searchNvs('TEMPPR01', 'P01', { signal: ac.signal });
    ac.abort();
    const run = await pending;
    expect(run.aborted).toBe(true);
    expect(run.concepts).toEqual([]);
    expect(run.failure).toBeUndefined();
    expect(m.calls.length).toBe(1); // a typed code, but the abort stops the fallback too
    expect((m.calls[0].init as RequestInit).signal).toBe(ac.signal);
    // aborted before the call: no call
    const m2 = nvsMock();
    vi.stubGlobal('fetch', m2.fetch);
    const done = new AbortController();
    done.abort();
    expect((await searchNvs('temperature', 'P01', { signal: done.signal })).aborted).toBe(true);
    expect(m2.fetch).not.toHaveBeenCalled();
  });

  it('the fallback: when the search fails and the text is exactly a code, the concept page of that code is asked for once, with no header at all', async () => {
    const m = nvsMock({ failFrom: 1, onlySparql: true });
    vi.stubGlobal('fetch', m.fetch);
    const run = await searchNvs('TEMPPR01', 'P01', { signal: signal() });
    expect(run.via).toBe('code');
    expect(run.failure).toBeUndefined();
    expect(run.concepts.map((c) => [c.code, c.deprecated, c.label])).toEqual([['TEMPPR01', false, 'Temperature of the water body']]);
    expect(m.calls.length).toBe(2);
    expect(m.calls[1].url).toBe('https://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/?_profile=nvs&_mediatype=application/ld+json');
    expect(m.calls[1].query).toBeUndefined();
    const init = m.calls[1].init as RequestInit;
    expect(init.headers).toBeUndefined(); // a plain GET: the concept page answers a preflight with 405
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
  });

  it('the fallback is for a typed code only: a word that is not a code gets no second request, and a code that fails twice reports the failure', async () => {
    const m = nvsMock({ failFrom: 1, onlySparql: true });
    vi.stubGlobal('fetch', m.fetch);
    const word = await searchNvs('temperature', 'P01', { signal: signal() });
    expect(word.failure?.kind).toBe('network');
    expect(m.calls.length).toBe(1);
    const m2 = nvsMock({ failFrom: 1 });
    vi.stubGlobal('fetch', m2.fetch);
    const code = await searchNvs('TEMPPR01', 'P01', { signal: signal() });
    expect(code.failure?.kind).toBe('network');
    expect(code.concepts).toEqual([]);
    expect(m2.calls.length).toBe(2);
    // a code the service does not know: HTTP 404 from the concept page
    const m3 = nvsMock({ failFrom: 1, onlySparql: true });
    vi.stubGlobal('fetch', m3.fetch);
    expect((await searchNvs('ZZZZZZZZ', 'P01', { signal: signal() })).failure).toEqual({ kind: 'http', status: 404 });
  });

  it('a word is never taken for a code: "invented", "temp" and "upaa" get no second request when the search fails, in either collection', async () => {
    for (const [text, coll] of [['invented', 'P01'], ['temp', 'P06'], ['upaa', 'P06'], ['temppr01', 'P01'], [' TEMPPR01', 'P01']] as const) {
      const m = nvsMock({ failFrom: 1 });
      vi.stubGlobal('fetch', m.fetch);
      const run = await searchNvs(text, coll, { signal: signal() });
      expect(run.failure?.kind, text).toBe('network');
      expect(m.calls.length, text).toBe(1);
    }
    const m = nvsMock({ failFrom: 1, onlySparql: true });
    vi.stubGlobal('fetch', m.fetch);
    expect((await searchNvs('UPAA', 'P06', { signal: signal() })).concepts.map((c) => c.code)).toEqual(['UPAA']);
    expect(m.calls.length).toBe(2);
  });

  it('a deprecated concept found by code is returned flagged, never as a normal one', async () => {
    const m = nvsMock({ failFrom: 1, onlySparql: true });
    vi.stubGlobal('fetch', m.fetch);
    expect((await searchNvs('ZZTESTD1', 'P01', { signal: signal() })).concepts[0]).toMatchObject({ code: 'ZZTESTD1', deprecated: true });
  });
});

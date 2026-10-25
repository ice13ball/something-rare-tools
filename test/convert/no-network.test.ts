// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 3 reads metadata from DROPPED files only (plan section 5, Q4): no link, no DOI, no network. Stage 4 adds ONE network module, the WoRMS opt-in
// src/app/optins/worms.ts, on the main thread (plan section 1). The behavioural proof is the spy test of the page flow (test/app/convertFlow.test.tsx,
// test/app/convertWorms.test.tsx); this is the structural one: following every import from the two entry points of /convert (the page and the worker),
// that module is the ONLY one that calls fetch, nothing else is a network or link-fetching module, and the worker cannot reach it at all.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const ENTRIES = ['src/app/entries/convert.tsx', 'src/worker/convert.worker.ts'];
/** The one module of /convert allowed to call fetch (stage 4, the WoRMS opt-in). Nothing else, and never the worker. */
const NETWORK_MODULE = 'src/app/optins/worms.ts';

/** A call or reference to fetch: `fetch(`, `fetch (`, and `globalThis.fetch`, `window.fetch`, `self.fetch`, `x["fetch"]`, `.fetch` with any whitespace. */
const FETCH_CALL = /(?<![\w$])fetch\s*\(|\.\s*fetch(?![\w$])|\[\s*['"`]fetch['"`]\s*\]/;

const SPECIFIER = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g;

function resolveFile(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined; // a package: not ours
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && /\.(tsx?|css)$/.test(c)) return c;
  return undefined;
}

/** Every project module reachable from the entries by import, export-from, dynamic import and `new URL(..., import.meta.url)` (the worker). */
function reachable(entries: readonly string[] = ENTRIES): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = entries.map((e) => join(ROOT, e));
  while (queue.length > 0) {
    const f = queue.pop() as string;
    if (seen.has(f) || !/\.tsx?$/.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    seen.set(f, src);
    for (const m of src.matchAll(SPECIFIER)) {
      const next = resolveFile(f, m[1] ?? m[2] ?? m[3] ?? m[4]);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe('no link-fetching code is reachable from /convert', () => {
  const modules = reachable();
  const rel = (f: string): string => f.slice(ROOT.length + 1);

  it('the walk finds the converter and the shared metadata readers it reuses (so the test is not vacuous)', () => {
    const names = [...modules.keys()].map(rel);
    expect(names.length).toBeGreaterThan(60);
    for (const must of ['src/app/pages/ConvertPage.tsx', 'src/worker/convert.handler.ts', 'src/core/convert/prefill.ts', 'src/core/licence/analyse.ts', 'src/core/licence/attribution.ts', 'src/core/metadata/datacite.ts', 'src/core/parse/index.ts']) {
      expect(names, must).toContain(must);
    }
  });

  it('no module of core/sources/, of the server or of the fetcher is reachable', () => {
    const bad = [...modules.keys()].map(rel).filter((f) => /^src\/core\/sources\//.test(f) || /^src\/server\//.test(f) || /fetcher|loadInput|mapFetcher/.test(f));
    expect(bad).toEqual([]);
  });

  const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /** The problems of one module's code, comments removed: the scan applied to every reachable module, and (below) to a doctored copy of one. */
  function problemsOf(file: string, src: string, mayFetch: boolean): string[] {
    const hits: string[] = [];
    const code = stripComments(src);
    if (/\/api\/fetch/.test(code)) hits.push(`${file}: /api/fetch`);
    for (const word of ['XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) if (code.includes(word)) hits.push(`${file}: ${word}`);
    if (!mayFetch && FETCH_CALL.test(code)) hits.push(`${file}: fetch`);
    return hits;
  }

  it('no reachable module mentions /api/fetch, or calls XMLHttpRequest, sendBeacon, WebSocket or EventSource, and exactly one module calls fetch: the WoRMS opt-in (the analytics script tag is the only other outside address, and only after consent)', () => {
    const hits: string[] = [];
    for (const [f, src] of modules) hits.push(...problemsOf(rel(f), src, rel(f) === NETWORK_MODULE));
    expect(hits).toEqual([]);
    // not vacuous: the allowed module is reachable (from the page), it does call fetch, and it is the only module that does
    const callers = [...modules].filter(([, src]) => FETCH_CALL.test(stripComments(src))).map(([f]) => rel(f));
    expect(callers).toEqual([NETWORK_MODULE]);
  });

  it('the guard still catches another module that fetches: the allowance is for exactly one file, not for a kind of code', () => {
    const page = readFileSync(join(ROOT, 'src/app/pages/ConvertPage.tsx'), 'utf8');
    for (const added of ["void fetch('https://example.org/x');", "void globalThis.fetch('/x');", "navigator.sendBeacon('/x');", 'new XMLHttpRequest();', "void window['fetch']('/x');", "void fetch\n('/x');"]) {
      expect(problemsOf('src/app/pages/ConvertPage.tsx', `${page}\n${added}`, false), added).not.toEqual([]);
    }
    expect(problemsOf('src/app/pages/ConvertPage.tsx', page, false)).toEqual([]);
    // the network module itself: fetch is allowed, anything else of that kind is not
    const worms = readFileSync(join(ROOT, NETWORK_MODULE), 'utf8');
    expect(problemsOf(NETWORK_MODULE, worms, true)).toEqual([]);
    expect(problemsOf(NETWORK_MODULE, `${worms}\nnavigator.sendBeacon('/x');`, true)).not.toEqual([]);
    expect(problemsOf(NETWORK_MODULE, `${worms}\nnew WebSocket('wss://x');`, true)).not.toEqual([]);
    // and the same file under any other name is not allowed to fetch
    expect(problemsOf('src/app/optins/other.ts', worms, false)).not.toEqual([]);
  });

  it('the worker never fetches: the network module is not reachable from the worker entry, and nothing in src/worker or src/core imports from src/app/optins', () => {
    const fromWorker = [...reachable(['src/worker/convert.worker.ts']).keys()].map(rel);
    expect(fromWorker.length).toBeGreaterThan(40);
    expect(fromWorker).not.toContain(NETWORK_MODULE);
    expect(fromWorker.filter((f) => /^src\/app\/optins\//.test(f))).toEqual([]);
    const bad: string[] = [];
    for (const [f, src] of modules) if (/^src\/(worker|core)\//.test(rel(f)) && /from\s*['"][^'"]*\/optins\//.test(src)) bad.push(rel(f));
    expect(bad).toEqual([]);
  });

  it('the fetch guard itself catches the spellings a quick grep misses', () => {
    for (const sample of ['fetch(u)', 'fetch (u)', 'await fetch\n(u)', 'globalThis.fetch(u)', 'window . fetch', 'self.fetch', 'const f = globalThis["fetch"]', 'x.fetch.bind(y)', "window['fetch']"]) expect(FETCH_CALL.test(sample), sample).toBe(true);
    for (const sample of ['prefetch()', 'const fetched = 1', 'refetchAll()', 'fetchpart']) expect(FETCH_CALL.test(sample), sample).toBe(false);
  });

  it('the page offers no link field (withLink={false}), and the prefill module takes records, not addresses', () => {
    const page = readFileSync(join(ROOT, 'src/app/pages/ConvertPage.tsx'), 'utf8');
    expect(page).toContain('withLink={false}');
    const prefill = readFileSync(join(ROOT, 'src/core/convert/prefill.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(prefill).not.toMatch(/https?:\/\//);
    expect(prefill).not.toMatch(/\bfetch\b|\bURL\(/);
  });
});

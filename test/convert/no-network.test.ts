// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 3 reads metadata from DROPPED files only (plan section 5, Q4): no link, no DOI, no network. The behavioural proof is the spy test of the page flow
// (test/app/convertFlow.test.tsx, test/app/convertMetadata.test.tsx); this is the structural one: following every import from the two entry points of /convert
// (the page and the worker), no module that fetches links or records is reachable.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const ENTRIES = ['src/app/entries/convert.tsx', 'src/worker/convert.worker.ts'];

const SPECIFIER = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g;

function resolveFile(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined; // a package: not ours
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && /\.(tsx?|css)$/.test(c)) return c;
  return undefined;
}

/** Every project module reachable from the entries by import, export-from, dynamic import and `new URL(..., import.meta.url)` (the worker). */
function reachable(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = ENTRIES.map((e) => join(ROOT, e));
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

  it('no reachable module mentions /api/fetch, or calls fetch, XMLHttpRequest, sendBeacon, WebSocket or EventSource (the analytics script tag is the only outside address, and only after consent)', () => {
    const hits: string[] = [];
    for (const [f, src] of modules) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\/api\/fetch/.test(code)) hits.push(`${rel(f)}: /api/fetch`);
      for (const word of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource']) if (code.includes(word)) hits.push(`${rel(f)}: ${word}`);
    }
    expect(hits).toEqual([]);
  });

  it('the page offers no link field (withLink={false}), and the prefill module takes records, not addresses', () => {
    const page = readFileSync(join(ROOT, 'src/app/pages/ConvertPage.tsx'), 'utf8');
    expect(page).toContain('withLink={false}');
    const prefill = readFileSync(join(ROOT, 'src/core/convert/prefill.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(prefill).not.toMatch(/https?:\/\//);
    expect(prefill).not.toMatch(/\bfetch\b|\bURL\(/);
  });
});

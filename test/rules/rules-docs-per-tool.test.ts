// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// docs/rules/{check,licence,collection,convert}.md are generated. To regenerate after editing a rule or a tool's code paths:
//   UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNTIME_BUILT, TOOLS, docFile, membership, perToolDocs, type Tool } from '../../scripts/rules-docs-per-tool';
import { RULES } from '../../src/core/rules/registry';

const ROOT = join(__dirname, '..', '..');
const ids = new Set(RULES.map((r) => r.id));
const generated = perToolDocs();
const onDisk = (tool: Tool): string => readFileSync(join(ROOT, docFile(tool)), 'utf8');
/** The rule ids a file documents: its `## ID` headings. */
const namedIn = (text: string): string[] => [...text.matchAll(/^## (\S+?)(?: — .*)?$/gm)].map((m) => m[1]);

describe('docs/rules/<tool>.md', () => {
  it.each(TOOLS)('%s is up to date with the registry and the code paths', (tool) => {
    if (process.env.UPDATE_RULES_DOC === '1') {
      mkdirSync(dirname(join(ROOT, docFile(tool))), { recursive: true });
      writeFileSync(join(ROOT, docFile(tool)), generated[tool]);
    }
    expect(onDisk(tool)).toBe(generated[tool]);
  });

  it('every registry rule is in at least one tool file', () => {
    const placed = new Set(TOOLS.flatMap((t) => namedIn(onDisk(t))));
    expect(RULES.filter((r) => !placed.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  it.each(TOOLS)('%s names only ids the registry has, each once', (tool) => {
    const named = namedIn(onDisk(tool));
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
    expect(new Set(named).size).toBe(named.length);
    expect(named.length).toBeGreaterThan(0);
  });

  it.each(TOOLS)('%s lists exactly the rules its code paths raise', (tool) => {
    expect(namedIn(onDisk(tool)).sort()).toEqual([...membership()[tool].ids].sort());
  });

  it('ids built at run time exist in the registry', () => {
    for (const list of Object.values(RUNTIME_BUILT)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });

  it.each(TOOLS)('%s has no raw placeholder token and no unfilled template', (tool) => {
    const text = onDisk(tool);
    expect(text).not.toMatch(/\{\+?[A-Za-z_]/);
    expect(text).not.toMatch(/\$\{/);
  });

  it('shows the converter export policy in convert.md only', () => {
    expect(onDisk('convert')).toMatch(/Export policy: (block|accept|show)/);
    for (const t of ['check', 'licence', 'collection'] as const) expect(onDisk(t)).not.toContain('Export policy');
  });

  it('every threshold and citation of a listed rule is printed with its url', () => {
    for (const tool of TOOLS) {
      const text = onDisk(tool);
      for (const id of namedIn(text)) {
        const r = RULES.find((x) => x.id === id)!;
        const section = text.split('\n## ').find((p) => p.startsWith(`${id}\n`) || p.startsWith(`${id} — `))!;
        for (const t of r.thresholds ?? []) {
          expect(section, `${id} ${t.name}`).toContain(`${t.name} = ${t.value}`);
          expect(section).toContain(t.citation.url);
        }
        for (const c of r.citations ?? []) expect(section).toContain(c.url);
      }
    }
  });
}, 60000);

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const LINE1 = 'SPDX-License-Identifier: AGPL-3.0-or-later';
const LINE2 = 'Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com';
const SKIP = new Set(['node_modules', 'dist', 'dist-server', 'coverage', '.git', 'docs', 'fixtures']);
const SRC_EXT = /\.(ts|tsx|js|mjs|css|html)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SRC_EXT.test(name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);

describe('SPDX header', () => {
  it('scans a non-trivial set of files (an empty glob must not pass)', () => {
    expect(files.length).toBeGreaterThan(5);
    const rel = files.map((f) => relative(ROOT, f));
    for (const must of ['config/hosts.ts', 'src/core/types.ts', 'index.html', 'check/index.html', 'privacy/index.html', 'vite.config.ts', 'vitest.config.ts']) {
      expect(rel).toContain(must);
    }
  });

  for (const f of files) {
    it(`${relative(ROOT, f)} starts with the two licence lines`, () => {
      const lines = readFileSync(f, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
      let [a, b] = lines;
      if (f.endsWith('.html')) {
        // HTML: the header is a comment at the very top
        const text = readFileSync(f, 'utf8');
        expect(text.startsWith('<!--')).toBe(true);
        const comment = text.slice(0, text.indexOf('-->'));
        expect(comment).toContain(LINE1);
        expect(comment).toContain(LINE2);
        return;
      }
      if (f.endsWith('.css')) {
        a = lines[0].replace(/^\/\*\s*/, '');
        expect(a).toContain(LINE1);
        expect(lines.slice(0, 4).join(' ')).toContain(LINE2);
        return;
      }
      expect(a).toBe('// ' + LINE1);
      expect(b).toBe('// ' + LINE2);
    });
  }
});

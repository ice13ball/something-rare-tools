// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsp } from '../config/hosts';

const ROOT = join(__dirname, '..');
const css = readFileSync(join(ROOT, 'src', 'app', 'styles.css'), 'utf8');

describe('self-hosted fonts', () => {
  it('every @font-face file exists under public/fonts, is woff2 and has font-display: swap', () => {
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(8);
    for (const f of faces) {
      const url = /url\('(\/fonts\/[^']+\.woff2)'\)/.exec(f)?.[1];
      expect(url, f).toBeTruthy();
      const file = join(ROOT, 'public', url!);
      expect(existsSync(file), url).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(5000);
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), url).toBe('wOF2');
      expect(f).toContain('font-display: swap');
    }
  });

  it('no external host in the stylesheet and font-src stays on this origin (default-src \'self\', no font-src override)', () => {
    expect(css).not.toMatch(/url\(\s*['"]?https?:/);
    const csp = buildCsp();
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/font-src/);
    expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('the licence texts are shipped next to the fonts and named in NOTICE with source and version', () => {
    for (const f of ['OFL-Barlow.txt', 'OFL-JetBrainsMono.txt']) expect(readFileSync(join(ROOT, 'public', 'fonts', f), 'utf8')).toContain('SIL Open Font License');
    const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
    for (const s of ['Barlow', 'JetBrains Mono', 'SIL Open Font License', '@fontsource/barlow', '5.3.0']) expect(notice).toContain(s);
  });

  it('every HTML entry preloads only the one regular latin file, favicon is the atlas one', () => {
    for (const p of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      const html = readFileSync(join(ROOT, p), 'utf8');
      expect(html.match(/rel="preload"/g)?.length, p).toBe(1);
      expect(html, p).toContain('href="/fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin');
      expect(html, p).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    }
    expect(readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8')).toContain('#22d3ee');
  });

  it('page titles end with "— Abyssal Claims" in every static page and og:title', () => {
    for (const p of ['index.html', 'check/index.html', 'licence/index.html', 'collection/index.html', 'privacy/index.html']) {
      const html = readFileSync(join(ROOT, p), 'utf8');
      expect(/<title>[^<]+ — Abyssal Claims<\/title>/.test(html), p).toBe(true);
      expect(/og:title" content="[^"]+ — Abyssal Claims"/.test(html), p).toBe(true);
      expect(html).not.toContain('Abyssal Claims Tools</title>');
    }
  });
});

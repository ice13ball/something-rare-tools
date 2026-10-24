// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { SITE } from '../config/site.js';

/*
 * The 404 page: the site's own look (the built stylesheet is linked, so the colours and fonts are the site's), in four languages.
 * The server picks the language (?lang=, then Accept-Language, then English) and renders all four blocks, three of them `hidden`.
 * /not-found.js (a static file: the CSP allows no inline script) then shows the visitor's stored choice (localStorage `lang`)
 * when the address names no language. Without JavaScript the server's choice stays. The strings are here, not in ui.ts, because
 * the server build does not compile src/.
 */
export const NOT_FOUND_LANGS = ['pl', 'en', 'de', 'fr'] as const;
export type NotFoundLang = (typeof NOT_FOUND_LANGS)[number];

interface Texts {
  title: string;
  message: string;
  goTo: string;
  tools: string;
  toolsHome: string;
  nav: [string, string, string];
  privacy: string;
  source: string;
}

const TEXTS: Record<NotFoundLang, Texts> = {
  pl: { title: 'Nie znaleziono strony', message: 'Nie znaleziono strony', goTo: 'Przejdź do', tools: 'Narzędzia', toolsHome: 'Narzędzia', nav: ['Sprawdzanie danych', 'Sprawdzanie licencji', 'Przegląd kolekcji'], privacy: 'Prywatność', source: 'Kod źródłowy (AGPL-3.0-or-later)' },
  en: { title: 'Page not found', message: 'Page not found', goTo: 'Go to', tools: 'Tools', toolsHome: 'Tools', nav: ['Data check', 'Licence check', 'Collection review'], privacy: 'Privacy', source: 'Source code (AGPL-3.0-or-later)' },
  de: { title: 'Seite nicht gefunden', message: 'Seite nicht gefunden', goTo: 'Weiter zu', tools: 'Werkzeuge', toolsHome: 'Werkzeuge', nav: ['Datenprüfung', 'Lizenzprüfung', 'Sammlungsprüfung'], privacy: 'Datenschutz', source: 'Quellcode (AGPL-3.0-or-later)' },
  fr: { title: 'Page introuvable', message: 'Page introuvable', goTo: 'Aller vers', tools: 'Outils', toolsHome: 'Outils', nav: ['Vérification des données', 'Vérification de licence', 'Revue de collection'], privacy: 'Confidentialité', source: 'Code source (AGPL-3.0-or-later)' },
};

const isLang = (v: unknown): v is NotFoundLang => typeof v === 'string' && (NOT_FOUND_LANGS as readonly string[]).includes(v);

/** ?lang= (a supported value), else the best supported Accept-Language entry, else English. */
export function pickLang(queryLang: unknown, acceptLanguage: string | undefined): NotFoundLang {
  if (isLang(queryLang)) return queryLang;
  const ranked: { lang: NotFoundLang; q: number; i: number }[] = [];
  (acceptLanguage ?? '')
    .slice(0, 500)
    .split(',')
    .forEach((entry, i) => {
      const [tag, ...params] = entry.trim().split(';');
      const primary = (tag ?? '').trim().toLowerCase().split('-')[0];
      if (!isLang(primary)) return;
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      if (Number.isFinite(q) && q > 0) ranked.push({ lang: primary, q, i });
    });
  ranked.sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked[0]?.lang ?? 'en';
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The atlas address with ?lang= (any existing query or hash kept). */
function atlasHref(lang: NotFoundLang): string {
  const u = new URL(SITE.atlasUrl);
  u.searchParams.set('lang', lang);
  return u.toString();
}

function block(lang: NotFoundLang, visible: boolean): string {
  const t = TEXTS[lang];
  const atlas = esc(atlasHref(lang));
  return `    <div class="nf" lang="${lang}" data-title="${esc(t.title)} — ${esc(SITE.brand)}"${visible ? '' : ' hidden'}>
      <header class="site-header">
        <a class="brand" href="/">${esc(SITE.brand)} <span class="brand-part">${esc(t.tools)}</span></a>
        <nav aria-label="Main"><a href="/check">${esc(t.nav[0])}</a> <a href="/licence">${esc(t.nav[1])}</a> <a href="/collection">${esc(t.nav[2])}</a> <a class="nav-external" href="${atlas}">Atlas</a></nav>
      </header>
      <main class="container">
        <h1>404</h1>
        <p class="lead">${esc(t.message)}</p>
        <p>${esc(t.goTo)}: <a href="/">${esc(t.toolsHome)}</a> · <a href="${atlas}">Atlas</a></p>
      </main>
      <footer class="site-footer"><a href="${atlas}">Atlas</a> <a href="/privacy">${esc(t.privacy)}</a> <a href="${esc(SITE.sourceUrl)}">${esc(t.source)}</a> <a href="${esc(SITE.attributionUrl)}">${esc(SITE.attribution)}</a></footer>
    </div>
`;
}

const BASE_STYLE =
  'body{margin:0;background:#0a0e14;color:#e6edf7;font-family:Barlow,system-ui,sans-serif}a{color:#22d3ee}.nf{min-height:100vh;display:flex;flex-direction:column}.nf[hidden]{display:none}';

/** `stylesheets`: the hrefs of the built CSS (read from the built home page); none in a bare test directory. */
export function renderNotFound(lang: NotFoundLang, stylesheets: readonly string[]): string {
  const links = stylesheets.map((h) => `    <link rel="stylesheet" crossorigin href="${esc(h)}" />\n`).join('');
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(TEXTS[lang].title)} — ${esc(SITE.brand)}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preload" href="/fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin />
    <style>${BASE_STYLE}</style>
${links}    <script src="/not-found.js" defer></script>
  </head>
  <body>
${NOT_FOUND_LANGS.map((l) => block(l, l === lang)).join('')}  </body>
</html>
`;
}

/** The built stylesheets named by a built page: only same-origin /assets/*.css, nothing else is ever copied into the 404. */
export function stylesheetsOf(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel="stylesheet"/i.test(m[0])) continue;
    const href = /href="(\/assets\/[A-Za-z0-9._-]+\.css)"/.exec(m[0])?.[1];
    if (href && !out.includes(href)) out.push(href);
  }
  return out;
}

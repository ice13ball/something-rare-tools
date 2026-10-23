// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RequestHandler } from 'express';
import { buildCsp } from '../config/hosts.js';

/** Headers set on EVERY response (pages, 404, /api, errors) before any route runs. */
export function securityHeaders(opts: { noindex: boolean }): RequestHandler {
  const csp = buildCsp();
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    // The fetch proxy answers with third-party data: never indexed, whatever the site flag says.
    if (opts.noindex || req.path === '/api' || req.path.startsWith('/api/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  };
}

/** The meta tag the Vite build injects while the site is noindex (config/site.ts, vite.config.ts). */
const ROBOTS_META = /[ \t]*<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*\/?>[ \t]*\r?\n?/gi;

/** Served HTML must agree with the header: when noindex is off, any meta tag left in the build goes. */
export function prepareHtml(html: string, noindex: boolean): string {
  return noindex ? html : html.replace(ROBOTS_META, '');
}

const PAGE_404 = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>404</title>
    <style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#14202b}a{color:#0b5c8a}p{margin:.4rem 0}</style>
  </head>
  <body>
    <h1>404</h1>
    <p lang="en">Page not found</p>
    <p lang="pl">Nie znaleziono strony</p>
    <p lang="de">Seite nicht gefunden</p>
    <p lang="fr">Page introuvable</p>
    <p><a href="/">/</a></p>
    <p><a href="https://github.com/ice13ball/something-rare-tools">Source code (AGPL-3.0-or-later)</a></p>
  </body>
</html>
`;

export const NOT_FOUND_PAGE = PAGE_404;

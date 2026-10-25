// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RequestHandler } from 'express';
import { buildCsp } from '../config/hosts.js';

/**
 * Pages that are served but not announced: always noindex (header and meta), whatever the site flag says. They are in no sitemap, menu,
 * index card, footer or robots.txt (a Disallow line would reveal them).
 */
export const HIDDEN_PATHS: readonly string[] = ['/convert'];

/**
 * Hosts a page may reach beyond the global policy, by page path (host names, no scheme). They go into that page's response only,
 * never into DATA_HOSTS (which also feeds the fetch proxy), and never routed through the server proxy. Stage 4 of /convert: the WoRMS lookup (the opt-in of
 * src/app/optins/worms.ts, off by default, sent only when the user presses its button). Stage 5 adds the NVS host for its own opt-in.
 */
export const PAGE_CONNECT_HOSTS: Readonly<Record<string, readonly string[]>> = { '/convert': ['www.marinespecies.org'] };

/**
 * Pages whose connect-src leaves out the data hosts and the map hosts: they take no links and show no map. The converter reads dropped files only
 * (plan Q4), so it keeps 'self' and the analytics hosts the global policy allows after consent, plus what PAGE_CONNECT_HOSTS adds (the lookups of
 * stages 4 and 5).
 */
export const PAGES_WITHOUT_DATA_HOSTS: readonly string[] = ['/convert'];

const withoutSlash = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Headers set on EVERY response (pages, 404, /api, errors) before any route runs. */
export function securityHeaders(opts: { noindex: boolean; pageConnect?: Readonly<Record<string, readonly string[]>> }): RequestHandler {
  const csp = buildCsp();
  const connect = opts.pageConnect ?? PAGE_CONNECT_HOSTS;
  const paths = [...new Set([...Object.keys(connect), ...PAGES_WITHOUT_DATA_HOSTS])];
  const pageCsp = new Map(paths.map((path) => [path, buildCsp(connect[path] ?? [], { data: !PAGES_WITHOUT_DATA_HOSTS.includes(path) })]));
  return (req, res, next) => {
    // The slash variant of a page answers 301 to the page itself: it carries the page's own policy and robots header.
    const page = withoutSlash(req.path);
    res.setHeader('Content-Security-Policy', pageCsp.get(page) ?? csp);
    // The fetch proxy answers with third-party data: never indexed, whatever the site flag says.
    if (opts.noindex || req.path === '/api' || req.path.startsWith('/api/') || HIDDEN_PATHS.includes(page)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  };
}

/** The meta tag the Vite build injects while the site is noindex (config/site.ts, vite.config.ts). */
const ROBOTS_META = /[ \t]*<meta\s+name="robots"\s+content="noindex,\s*nofollow"\s*\/?>[ \t]*\r?\n?/gi;

/**
 * Served HTML must agree with the header: when noindex is off, any meta tag left in the build goes.
 * A hidden page (HIDDEN_PATHS) is served with `true`, so that its own tag stays whatever the site flag says.
 */
export function prepareHtml(html: string, noindex: boolean): string {
  return noindex ? html : html.replace(ROBOTS_META, '');
}

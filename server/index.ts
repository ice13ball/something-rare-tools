// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from 'express';
import { isCatalogueUrl } from '../config/catalogues.js';
import { DATA_HOSTS } from '../config/hosts.js';
import { SITE } from '../config/site.js';
import { buildCswUpstream, createHostPacer, CSW_MAX_BYTES, CSW_TIMEOUT_MS, parseCswBody, type HostPacerOptions } from './csw.js';
import { isArchiveUrl, proxyFetch, ProxyError, type ProxyDeps, type Upstream } from './fetchProxy.js';
import { prepareHtml, securityHeaders } from './headers.js';
import { NOT_FOUND_LANGS, pickLang, renderNotFound, stylesheetsOf } from './notFound.js';
import { ARCHIVE_BUDGET_CODE, ARCHIVE_BUSY_CODE, ARCHIVE_DAILY_BYTES, ARCHIVE_DAILY_REQUESTS, ARCHIVE_MAX_CONCURRENT, clientIp, createConcurrencyGate, createDailyBudget, createRateLimiter, type DailyBudgetOptions, type RateLimitOptions } from './rateLimit.js';

export interface AppOptions {
  distDir: string;
  /** Resolves a host name to its addresses. Default: dns.lookup({ all: true }). */
  resolver?: (host: string) => Promise<string[]>;
  /** Transport to the origin server. Default: node:https pinned to the checked addresses. */
  upstream?: Upstream;
  /** Defaults to SITE.noindex. */
  noindex?: boolean;
  /** Extra connect-src hosts per page path (default: PAGE_CONNECT_HOSTS of headers.ts). For tests of the per-path policy. */
  pageConnect?: Readonly<Record<string, readonly string[]>>;
  /** One JSON line per proxied request. Default: stdout. */
  log?: (line: string) => void;
  maxBytes?: number;
  timeoutMs?: number;
  rateLimit?: RateLimitOptions;
  /** Per-IP limit of /api/csw (default 20 a minute; the page itself asks at most once in 3.2 s, so a normal run stays under it). */
  cswRateLimit?: RateLimitOptions;
  /** Per-IP daily budget of /api/csw: requests and bytes (defaults in rateLimit.ts). */
  cswDailyBudget?: DailyBudgetOptions;
  /** Per-IP daily budget of the archive route of /api/fetch (IPT /archive.do): requests and bytes (defaults in rateLimit.ts). */
  archiveDailyBudget?: DailyBudgetOptions;
  /** Turns at a catalogue host (default: at least 1 s apart, 20 may wait). */
  cswPacing?: HostPacerOptions;
  cswMaxBytes?: number;
  cswTimeoutMs?: number;
}

const MAX_URL_LENGTH = 2048;
const MAX_ACCEPT_LENGTH = 200;
const MAX_UPSTREAM_TYPE_LENGTH = 100;

/** The upstream Content-Type as a plain label for the client: printable ASCII only, at most 100 characters, else none. */
function sanitiseUpstreamType(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const clean = v.replace(/[^\x20-\x7e]/g, '').trim().slice(0, MAX_UPSTREAM_TYPE_LENGTH).trim();
  return clean === '' ? undefined : clean;
}

function readRequired(dir: string, rel: string): Buffer {
  const file = join(dir, rel);
  if (!existsSync(file)) throw new Error(`distDir is missing ${rel} (looked in ${dir})`);
  return readFileSync(file);
}

function readOptional(dir: string, rel: string): Buffer | undefined {
  const file = join(dir, rel);
  return existsSync(file) ? readFileSync(file) : undefined;
}

function parseBody(body: unknown): { url: string; accept?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ProxyError(400, 'bad_body');
  const { url, accept } = body as Record<string, unknown>;
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) throw new ProxyError(400, 'bad_url');
  if (accept !== undefined) {
    // Printable ASCII only: the value becomes a header, so no CR/LF can ever get through.
    if (typeof accept !== 'string' || accept.length > MAX_ACCEPT_LENGTH || !/^[\x20-\x7e]*$/.test(accept)) {
      throw new ProxyError(400, 'bad_accept');
    }
  }
  return { url, accept: accept === undefined || accept === '' ? undefined : accept };
}

/** Host name for the log: only an allowlisted one, never anything the caller could have made up. */
function logHost(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  try {
    const h = new URL(rawUrl).hostname.toLowerCase();
    return DATA_HOSTS.includes(h) ? h : null;
  } catch {
    return null;
  }
}

function sendProxyError(res: Response, e: ProxyError): void {
  if (res.headersSent || res.destroyed) return;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Fetch-Proxy-Error', e.code);
  res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.code });
}

/** The canonical pages; <lastmod> is the build date (mtime of dist/index.html, read once at startup). */
function buildSitemap(built: Date): string {
  const lastmod = built.toISOString().slice(0, 10);
  const urls = ['/', '/check', '/licence', '/collection', '/privacy']
    .map((p) => `  <url>\n    <loc>${SITE.origin}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>\n`;
}

/** Waits for the response to drain or close, and removes both listeners again (one wait per full buffer, so they must not pile up). */
function drainOrClose(res: Response): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
  });
}

export function createApp(opts: AppOptions): Express {
  const noindex = opts.noindex ?? SITE.noindex;
  const log = opts.log ?? ((line: string) => void process.stdout.write(line + '\n'));
  const dist = opts.distDir;

  // Pages and small static files are read once, at startup: nothing the request controls ever reaches the filesystem.
  const pages = {
    home: Buffer.from(prepareHtml(readRequired(dist, 'index.html').toString('utf8'), noindex)),
    check: Buffer.from(prepareHtml(readRequired(dist, join('check', 'index.html')).toString('utf8'), noindex)),
    licence: Buffer.from(prepareHtml(readRequired(dist, join('licence', 'index.html')).toString('utf8'), noindex)),
    collection: Buffer.from(prepareHtml(readRequired(dist, join('collection', 'index.html')).toString('utf8'), noindex)),
    privacy: Buffer.from(prepareHtml(readRequired(dist, join('privacy', 'index.html')).toString('utf8'), noindex)),
    // Hidden page: its robots meta stays whatever the site flag says (headers.ts HIDDEN_PATHS), so it is prepared with `true`.
    convert: Buffer.from(prepareHtml(readRequired(dist, join('convert', 'index.html')).toString('utf8'), true)),
  };
  const consentJs = readOptional(dist, 'consent-default.js');
  const notFoundJs = readOptional(dist, 'not-found.js');
  const favicon = readOptional(dist, 'favicon.svg');
  // The 404 page wears the site's built stylesheet; one rendering per language, made once.
  const sheets = stylesheetsOf(pages.home.toString('utf8'));
  const notFoundPages = Object.fromEntries(NOT_FOUND_LANGS.map((l) => [l, renderNotFound(l, sheets)]));
  const ogImage = readOptional(dist, 'og.png');
  const sitemap = Buffer.from(buildSitemap(statSync(join(dist, 'index.html')).mtime));

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  // `trust proxy` is intentionally left unset: only the rate limiter reads X-Forwarded-For, by design.

  app.use(securityHeaders({ noindex, pageConnect: opts.pageConnect }));

  const sendHtml = (page: Buffer) => (_req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(page);
  };
  const pageOf: Record<string, Buffer> = { '/': pages.home, '/check': pages.check, '/licence': pages.licence, '/collection': pages.collection, '/privacy': pages.privacy, '/convert': pages.convert };
  for (const path of Object.keys(pageOf)) app.get(path, sendHtml(pageOf[path]));
  // One canonical URL per page: the slash variants answer 301 to the slash-less one (fixed targets, nothing from the request).
  for (const path of ['/check', '/licence', '/collection', '/privacy', '/convert']) app.get(path + '/', (_req, res) => void res.redirect(301, path));

  app.get('/robots.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(`User-agent: *\nAllow: /\nSitemap: ${SITE.origin}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(sitemap);
  });
  if (consentJs) {
    app.get('/consent-default.js', (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(consentJs);
    });
  }
  if (notFoundJs) {
    app.get('/not-found.js', (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(notFoundJs);
    });
  }
  // Self-hosted fonts (SIL OFL, see NOTICE): a fixed directory, no index, no redirects, no dotfiles.
  app.use('/fonts', express.static(join(dist, 'fonts'), { index: false, redirect: false, dotfiles: 'ignore', etag: false, maxAge: '30d' }));
  if (ogImage) {
    app.get('/og.png', (_req, res) => {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.end(ogImage);
    });
  }
  if (favicon) {
    app.get('/favicon.svg', (_req, res) => {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(favicon);
    });
  }

  // Hashed build output only; no directory index, no redirects, no dotfiles; misses fall through to the 404 page.
  app.use(
    '/assets',
    express.static(join(dist, 'assets'), { index: false, redirect: false, dotfiles: 'ignore', etag: false, immutable: true, maxAge: '1y' }),
  );

  const proxyDeps = (signal: AbortSignal): ProxyDeps => ({
    resolver: opts.resolver,
    upstream: opts.upstream,
    maxBytes: opts.maxBytes,
    timeoutMs: opts.timeoutMs,
    signal,
  });

  const archiveGate = createConcurrencyGate(ARCHIVE_MAX_CONCURRENT);
  const archiveBudget = createDailyBudget({ requests: ARCHIVE_DAILY_REQUESTS, bytes: ARCHIVE_DAILY_BYTES, code: ARCHIVE_BUDGET_CODE, ...opts.archiveDailyBudget });
  app.post('/api/fetch', createRateLimiter(opts.rateLimit), express.json({ limit: '2kb' }), async (req: Request, res: Response) => {
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) clientGone.abort();
    });
    const host = logHost((req.body as { url?: unknown } | undefined)?.url);
    let status = 500;
    let bytes = 0;
    let archive = false;
    let release: (() => void) | undefined;
    try {
      const { url, accept } = parseBody(req.body);
      archive = isArchiveUrl(url);
      if (archive) {
        // At most two archives in flight per IP; the budget's bytes are charged chunk by chunk below, so parallel requests cannot outrun it.
        release = archiveGate.acquire(req);
        if (!release) {
          status = 429;
          res.setHeader('Retry-After', '30');
          throw new ProxyError(429, ARCHIVE_BUSY_CODE);
        }
        if (!archiveBudget.check(req, res)) {
          status = 429;
          return;
        }
      }
      const upstream = await proxyFetch(url, accept, proxyDeps(clientGone.signal));
      const it = upstream.body[Symbol.asyncIterator]();
      // Nothing is sent before the first chunk is in: a refusal or a timeout up to here is still a proper status.
      let next: IteratorResult<Uint8Array>;
      try {
        next = await it.next();
      } catch (e) {
        upstream.abort();
        throw e;
      }
      status = upstream.status;
      res.status(upstream.status);
      // The body is third-party data and is never served as a page: whatever the origin says, it leaves as an opaque
      // download. The origin's type travels in a side header (the client reads that one, never Content-Type).
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment');
      const upstreamType = sanitiseUpstreamType(upstream.contentType);
      if (upstreamType !== undefined) res.setHeader('X-Upstream-Content-Type', upstreamType);
      res.setHeader('Cache-Control', 'no-store');
      try {
        while (!next.done) {
          bytes += next.value.byteLength;
          if (archive) archiveBudget.addBytes(req, next.value.byteLength);
          if (!res.write(next.value)) {
            await drainOrClose(res);
            if (res.destroyed) throw new ProxyError(499, 'client_closed');
          }
          next = await it.next();
        }
        res.end();
      } catch {
        // Headers are out: all that is left is to cut the connection so no one mistakes a truncated body for a whole one.
        upstream.abort();
        res.destroy();
      }
    } catch (e) {
      const err = e instanceof ProxyError ? e : new ProxyError(500, 'internal');
      status = err.status;
      sendProxyError(res, err);
    } finally {
      release?.();
      log(JSON.stringify({ host, status, bytes }));
    }
  });
  app.all('/api/fetch', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
  });

  // Collection review: CSW catalogues, by id. Its own per-IP limit (20 a minute) and daily budget, and its own per-host pacing.
  const cswPacer = createHostPacer(opts.cswPacing);
  const cswBudget = createDailyBudget(opts.cswDailyBudget);
  app.post('/api/csw', createRateLimiter({ limit: 20, ...opts.cswRateLimit }), cswBudget.admit, express.json({ limit: '1kb' }), async (req: Request, res: Response) => {
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) clientGone.abort();
    });
    let host: string | null = null;
    let status = 500;
    let bytes = 0;
    try {
      const parsed = parseCswBody(req.body);
      host = parsed.catalogue.host;
      const target = buildCswUpstream(parsed);
      try {
        await cswPacer.acquire(host, clientIp(req), clientGone.signal);
      } catch (e) {
        const wait = (e as { retryAfterSec?: number }).retryAfterSec;
        if (wait !== undefined) res.setHeader('Retry-After', String(wait));
        throw e;
      }
      if (clientGone.signal.aborted) throw new ProxyError(499, 'client_closed');
      const upstream = await proxyFetch(target.url, 'application/xml', {
        ...proxyDeps(clientGone.signal),
        allowUrl: isCatalogueUrl,
        maxRedirects: 0,
        maxBytes: opts.cswMaxBytes ?? CSW_MAX_BYTES,
        timeoutMs: opts.cswTimeoutMs ?? CSW_TIMEOUT_MS,
        ...(target.post ? { post: target.post } : {}),
      });
      const it = upstream.body[Symbol.asyncIterator]();
      let next: IteratorResult<Uint8Array>;
      try {
        next = await it.next();
      } catch (e) {
        upstream.abort();
        throw e;
      }
      status = upstream.status;
      res.status(upstream.status);
      // Opaque download, like /api/fetch: the catalogue's XML is never served as a page. Retry-After only as plain seconds.
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Cache-Control', 'no-store');
      if (upstream.retryAfter !== undefined && /^\d{1,5}$/.test(upstream.retryAfter.trim())) res.setHeader('Retry-After', upstream.retryAfter.trim());
      try {
        while (!next.done) {
          bytes += next.value.byteLength;
          cswBudget.addBytes(req, next.value.byteLength);
          if (!res.write(next.value)) {
            await drainOrClose(res);
            if (res.destroyed) throw new ProxyError(499, 'client_closed');
          }
          next = await it.next();
        }
        res.end();
      } catch {
        upstream.abort();
        res.destroy();
      }
    } catch (e) {
      const err = e instanceof ProxyError ? e : new ProxyError(500, 'internal');
      status = err.status;
      sendProxyError(res, err);
    } finally {
      log(JSON.stringify({ host, status, bytes }));
    }
  });
  app.all('/api/csw', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
  });

  app.use((req, res) => {
    const lang = pickLang(req.query.lang, req.headers['accept-language']);
    res.status(404);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Language');
    res.end(notFoundPages[lang]);
  });

  const onError: ErrorRequestHandler = (err: { status?: number; type?: string }, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const tooLarge = err.type === 'entity.too.large' || err.status === 413;
    const status = tooLarge ? 413 : err.status && err.status >= 400 && err.status < 500 ? 400 : 500;
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ error: tooLarge ? 'body_too_large' : status === 400 ? 'bad_request' : 'internal' });
  };
  app.use(onError);

  return app;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  // Compiled location: dist-server/server/index.js -> ../../dist
  const distDir = fileURLToPath(new URL('../../dist', import.meta.url));
  const port = Number(process.env.PORT) || 8080;
  createApp({ distDir }).listen(port, () => {
    process.stdout.write(JSON.stringify({ listening: port }) + '\n');
  });
}

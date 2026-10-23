// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Request, RequestHandler, Response } from 'express';

const MAX_KEY_LENGTH = 100;

/**
 * Client key: the LAST comma-separated X-Forwarded-For entry (trimmed), else the socket address.
 * Cloud Run's front end appends the connecting client's address to whatever the client sent, so
 * the earlier entries are client-controlled and only the last one can key a rate limit.
 * The proxy setting of Express is deliberately NOT used — nothing else may depend on forwarded headers.
 */
export function clientIp(req: Pick<Request, 'headers' | 'socket'>): string {
  const raw = req.headers['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw.join(',') : raw;
  const last = header?.split(',').pop()?.trim();
  const key = last || req.socket.remoteAddress || 'unknown';
  return key.slice(0, MAX_KEY_LENGTH);
}

export interface RateLimitOptions {
  /** Requests per window. 30/min is an operational choice, not a QC threshold. */
  limit?: number;
  windowMs?: number;
  now?: () => number;
  /** Upper bound on tracked clients (memory guard against rotating keys). */
  maxKeys?: number;
}

/** In-memory fixed window per client key. 429 + Retry-After once the window's budget is spent. */
export function createRateLimiter(opts: RateLimitOptions = {}): RequestHandler & { size(): number } {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = now();

  function sweep(t: number): void {
    for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
    lastSweep = t;
  }

  const handler: RequestHandler = (req, res, next) => {
    const t = now();
    if (t - lastSweep >= windowMs) sweep(t);
    const key = clientIp(req);
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      windows.delete(key);
      windows.set(key, w);
      // Still over budget after dropping expired windows: evict the oldest entries.
      while (windows.size > maxKeys) {
        const oldest = windows.keys().next().value;
        if (oldest === undefined) break;
        windows.delete(oldest);
      }
    }
    w.count += 1;
    if (w.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
  return Object.assign(handler, { size: () => windows.size });
}

export interface DailyBudgetOptions {
  /** Requests per window and client. */
  requests?: number;
  /** Response bytes per window and client. Counted as they are sent, so the request that crosses the line is still served whole. */
  bytes?: number;
  windowMs?: number;
  now?: () => number;
  maxKeys?: number;
  /** The X-Fetch-Proxy-Error code and JSON error of the 429. Default csw_daily_budget. */
  code?: string;
}

/**
 * What /api/fetch lets one connection take as Darwin Core Archives (IPT /archive.do downloads) in a day. Archives are the only
 * route where one request can cost 100 MB of egress and 90 s of a 40-slot instance, so they get their own budget on top of the
 * per-minute limit. 200 archives covers screening a few hundred datasets in a sitting (most OBIS/GBIF archives are a few MB); 2 GB
 * is 20 archives at the 100 MB cap, which is the real brake on bandwidth. The request that crosses the byte line is still served.
 * In memory per instance (max 2 instances), so the effective ceiling is at most twice that.
 */
export const ARCHIVE_DAILY_REQUESTS = 200;
export const ARCHIVE_DAILY_BYTES = 2 * 1024 * 1024 * 1024;
export const ARCHIVE_BUDGET_CODE = 'archive_daily_budget';

/** What /api/csw lets one connection take from the catalogues in a day: about 10 full runs of the 7 193-record catalogue by count, 4 by size. */
export const CSW_DAILY_REQUESTS = 3000;
export const CSW_DAILY_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Fixed 24-hour window per client key (the same key as the per-minute limiter), counting requests AND bytes. In memory, so per server
 * instance: a restart or a second Cloud Run instance gives a fresh budget. Over budget: 429 + Retry-After (seconds until the window
 * resets) + X-Fetch-Proxy-Error: csw_daily_budget, which the page turns into a stopped, resumable run.
 */
export function createDailyBudget(opts: DailyBudgetOptions = {}): { admit: RequestHandler; check(req: Pick<Request, 'headers' | 'socket'>, res: Pick<Response, 'setHeader' | 'status'> & { json(b: unknown): unknown }): boolean; addBytes(req: Pick<Request, 'headers' | 'socket'>, n: number): void; size(): number } {
  const maxRequests = opts.requests ?? CSW_DAILY_REQUESTS;
  const maxBytes = opts.bytes ?? CSW_DAILY_BYTES;
  const windowMs = opts.windowMs ?? 24 * 60 * 60_000;
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const code = opts.code ?? 'csw_daily_budget';
  const windows = new Map<string, { start: number; requests: number; bytes: number }>();

  const windowOf = (key: string, t: number): { start: number; requests: number; bytes: number } => {
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, requests: 0, bytes: 0 };
      windows.delete(key);
      windows.set(key, w);
      if (windows.size > maxKeys) {
        for (const [k, o] of windows) if (t - o.start >= windowMs) windows.delete(k);
        while (windows.size > maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest === undefined) break;
          windows.delete(oldest);
        }
      }
    }
    return w;
  };

  /** Counts one request; false (after answering 429) when the window's budget is spent. */
  const check = (req: Pick<Request, 'headers' | 'socket'>, res: Pick<Response, 'setHeader' | 'status'> & { json(b: unknown): unknown }): boolean => {
    const t = now();
    const w = windowOf(clientIp(req), t);
    if (w.requests >= maxRequests || w.bytes >= maxBytes) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((w.start + windowMs - t) / 1000))));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Fetch-Proxy-Error', code);
      res.status(429).json({ error: code });
      return false;
    }
    w.requests += 1;
    return true;
  };
  const admit: RequestHandler = (req, res, next) => {
    if (check(req, res)) next();
  };
  return { admit, check, addBytes: (req, n) => void (windowOf(clientIp(req), now()).bytes += n), size: () => windows.size };
}

/** Archive downloads running at once for one client: each can hold a slot for 90 s and carry 100 MB, so two is a person using the page, three is a script. */
export const ARCHIVE_MAX_CONCURRENT = 2;
export const ARCHIVE_BUSY_CODE = 'archive_busy';

/** Per-client cap on requests in flight. `acquire` returns the release function (safe to call twice), or undefined when the client is at the cap. */
export function createConcurrencyGate(max: number): { acquire(req: Pick<Request, 'headers' | 'socket'>): (() => void) | undefined; inFlight(req: Pick<Request, 'headers' | 'socket'>): number } {
  const active = new Map<string, number>();
  return {
    acquire(req) {
      const key = clientIp(req);
      const n = active.get(key) ?? 0;
      if (n >= max) return undefined;
      active.set(key, n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const m = (active.get(key) ?? 1) - 1;
        if (m <= 0) active.delete(key);
        else active.set(key, m);
      };
    },
    inFlight: (req) => active.get(clientIp(req)) ?? 0,
  };
}

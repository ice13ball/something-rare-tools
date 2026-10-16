// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from '../../server/rateLimit.js';

function fakeReq(xff?: string | string[], remote = '127.0.0.1'): Request {
  return { headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } } as unknown as Request;
}

function fakeRes() {
  const r = { code: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const res = {
    status(c: number) {
      r.code = c;
      return res;
    },
    setHeader(k: string, v: string) {
      r.headers[k] = v;
      return res;
    },
    json(b: unknown) {
      r.body = b;
      return res;
    },
  } as unknown as Response;
  return { res, r };
}

describe('clientIp', () => {
  it('last comma-separated X-Forwarded-For entry, trimmed (the one Cloud Run appends)', () => {
    expect(clientIp(fakeReq(' 1.2.3.4 , 5.6.7.8 '))).toBe('5.6.7.8');
    expect(clientIp(fakeReq('1.2.3.4'))).toBe('1.2.3.4');
  });
  it('falls back to the socket address when the header is missing or empty', () => {
    expect(clientIp(fakeReq(undefined, '10.1.1.1'))).toBe('10.1.1.1');
    expect(clientIp(fakeReq('', '10.1.1.1'))).toBe('10.1.1.1');
    expect(clientIp(fakeReq('2.2.2.2 , ', '10.1.1.1'))).toBe('10.1.1.1');
  });
  it('handles a repeated header (array) by joining it and taking the last entry', () => {
    expect(clientIp(fakeReq(['3.3.3.3, 4.4.4.4', '5.5.5.5']))).toBe('5.5.5.5');
  });
  it('caps an absurdly long key', () => {
    expect(clientIp(fakeReq('a'.repeat(5000))).length).toBeLessThanOrEqual(100);
  });
});

describe('createRateLimiter', () => {
  it('fixed window: 30 pass, the 31st gets 429 with Retry-After, the next window resets', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ limit: 30, windowMs: 60_000, now: () => now });
    const hit = () => {
      const { res, r } = fakeRes();
      let nexted = false;
      limiter(fakeReq('1.1.1.1'), res, () => (nexted = true));
      return { nexted, r };
    };
    for (let i = 0; i < 30; i++) expect(hit().nexted).toBe(true);
    now += 20_000;
    const blocked = hit();
    expect(blocked.nexted).toBe(false);
    expect(blocked.r.code).toBe(429);
    expect(blocked.r.headers['Retry-After']).toBe('40');
    now += 40_000;
    expect(hit().nexted).toBe(true);
  });
  it('does not grow without bound under many distinct clients', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 30, windowMs: 60_000, now: () => now, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) limiter(fakeReq(`ip-${i}`), fakeRes().res, () => {});
    const sizeProbe = (limiter as unknown as { size: () => number }).size();
    expect(sizeProbe).toBeLessThanOrEqual(100);
  });
});

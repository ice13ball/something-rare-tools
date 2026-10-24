// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it, vi } from 'vitest';
import {
  FetchBlockedError,
  HostNotAllowedError,
  ProxyFetchError,
  browserFetcher,
  serverFetcher,
} from '../../src/core/sources/fetcher';

type FetchFn = typeof fetch;
const reply = (body: string, init: ResponseInit = {}, url = ''): Response => {
  const r = new Response(body, init);
  if (url) Object.defineProperty(r, 'url', { value: url });
  return r;
};
const asFetch = (fn: ReturnType<typeof vi.fn>): FetchFn => fn as unknown as FetchFn;

describe('browserFetcher', () => {
  it('refuses a host outside the allowlist before any network call', async () => {
    const fn = vi.fn();
    const f = browserFetcher(asFetch(fn));
    await expect(f.get('https://example.com/a.csv')).rejects.toMatchObject({ name: 'HostNotAllowedError', host: 'example.com' });
    await expect(f.get('http://zenodo.org/api/records/1')).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('fetches with no credentials, redirects followed, CORS mode; returns bytes, type and final url', async () => {
    const fn = vi.fn(async () =>
      reply('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }, 'https://zenodo.org/api/records/1'),
    );
    const f = browserFetcher(asFetch(fn));
    const r = await f.get('https://zenodo.org/api/records/1', 'application/json');
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://zenodo.org/api/records/1');
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'follow', mode: 'cors' });
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
    expect(r.status).toBe(200);
    expect(r.contentType).toBe('application/json');
    expect(r.finalUrl).toBe('https://zenodo.org/api/records/1');
    expect(new TextDecoder().decode(r.bytes)).toBe('{"a":1}');
  });

  it('returns a non-2xx status instead of throwing', async () => {
    const f = browserFetcher(asFetch(vi.fn(async () => reply('no', { status: 403 }, 'https://geonetwork.iopan.pl/x'))));
    const r = await f.get('https://geonetwork.iopan.pl/x');
    expect(r.status).toBe(403);
  });

  it('a TypeError (CORS, CSP, network) becomes FetchBlockedError with the host only', async () => {
    const f = browserFetcher(
      asFetch(
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      ),
    );
    const err = await f.get('https://opendap.iopan.pl/opendap/data/csv/P/a.csv?secret=1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchBlockedError);
    expect((err as FetchBlockedError).host).toBe('opendap.iopan.pl');
    expect((err as Error).message).not.toContain('secret');
  });

  it('other errors (abort) are not disguised as a blocked fetch', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const f = browserFetcher(
      asFetch(
        vi.fn(async () => {
          throw abort;
        }),
      ),
    );
    await expect(f.get('https://zenodo.org/api/records/1')).rejects.toBe(abort);
  });

  it('refuses a followed redirect that ended on a host outside the allowlist', async () => {
    const f = browserFetcher(asFetch(vi.fn(async () => reply('x', { status: 200 }, 'https://evil.example.net/a'))));
    await expect(f.get('https://geo.iopan.pl/10.1/x')).rejects.toMatchObject({ name: 'HostNotAllowedError', host: 'evil.example.net' });
  });

  it('accepts a redirect between two allowlisted hosts', async () => {
    const f = browserFetcher(asFetch(vi.fn(async () => reply('x', { status: 200 }, 'https://doi.pangaea.de/10.1594/PANGAEA.1?format=textfile'))));
    const r = await f.get('https://geo.iopan.pl/10.1594/PANGAEA.1');
    expect(r.finalUrl).toBe('https://doi.pangaea.de/10.1594/PANGAEA.1?format=textfile');
  });
});

describe('serverFetcher: upstream content type', () => {
  it('reads the type from X-Upstream-Content-Type, never from the proxy response Content-Type', async () => {
    const fn = vi.fn(async () => reply('x', { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
    const r = await serverFetcher('/api/fetch', asFetch(fn)).get('https://zenodo.org/api/records/1');
    expect(r.contentType).toBeUndefined();
    const fn2 = vi.fn(async () => reply('x', { status: 200, headers: { 'content-type': 'text/html', 'x-upstream-content-type': 'application/json' } }));
    const r2 = await serverFetcher('/api/fetch', asFetch(fn2)).get('https://zenodo.org/api/records/1');
    expect(r2.contentType).toBe('application/json');
  });
});

describe('serverFetcher', () => {
  it('POSTs {url, accept} as JSON to the endpoint, never the URL in the query string', async () => {
    const fn = vi.fn(async () => reply('abc', { status: 200, headers: { 'content-type': 'application/octet-stream', 'x-upstream-content-type': 'text/csv' } }));
    const f = serverFetcher('/api/fetch', asFetch(fn));
    const r = await f.get('https://opendap.iopan.pl/opendap/data/csv/P/a.csv', 'text/csv');
    const [endpoint, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('/api/fetch');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://opendap.iopan.pl/opendap/data/csv/P/a.csv', accept: 'text/csv' });
    expect(init.credentials).toBe('omit');
    expect(r.status).toBe(200);
    expect(r.contentType).toBe('text/csv');
    expect(r.finalUrl).toBe('https://opendap.iopan.pl/opendap/data/csv/P/a.csv');
    expect(new TextDecoder().decode(r.bytes)).toBe('abc');
  });

  it('omits accept when none is given', async () => {
    const fn = vi.fn(async () => reply('', { status: 200 }));
    await serverFetcher('/api/fetch', asFetch(fn)).get('https://zenodo.org/api/records/1');
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://zenodo.org/api/records/1' });
  });

  it('X-Fetch-Proxy-Error: host_not_allowed -> HostNotAllowedError', async () => {
    const fn = vi.fn(async () => reply('{"error":"host_not_allowed"}', { status: 403, headers: { 'X-Fetch-Proxy-Error': 'host_not_allowed' } }));
    const err = await serverFetcher('/api/fetch', asFetch(fn))
      .get('https://zenodo.org/api/records/1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HostNotAllowedError);
  });

  it('other proxy errors -> ProxyFetchError(code, status)', async () => {
    const fn = vi.fn(async () => reply('{"error":"rate_limited"}', { status: 429, headers: { 'X-Fetch-Proxy-Error': 'rate_limited' } }));
    const err = await serverFetcher('/api/fetch', asFetch(fn))
      .get('https://zenodo.org/api/records/1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProxyFetchError);
    expect(err).toMatchObject({ code: 'rate_limited', status: 429, host: 'zenodo.org' });
  });

  it('an upstream status without the proxy header passes through as a status (a 403 from GeoNetwork is not a proxy error)', async () => {
    const fn = vi.fn(async () => reply('forbidden', { status: 403 }));
    const r = await serverFetcher('/api/fetch', asFetch(fn)).get('https://geonetwork.iopan.pl/x');
    expect(r.status).toBe(403);
  });

  it('refuses a non-allowlisted host without calling the server', async () => {
    const fn = vi.fn();
    await expect(serverFetcher('/api/fetch', asFetch(fn)).get('https://example.com/a.csv')).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('an unreachable proxy (TypeError) is a blocked fetch for that host', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(serverFetcher('/api/fetch', asFetch(fn)).get('https://zenodo.org/api/records/1')).rejects.toBeInstanceOf(FetchBlockedError);
  });
});

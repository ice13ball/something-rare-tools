// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Server mode and the Dataverse hosts: only the listed installations, GET only, https only, the existing protections unchanged.
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DATAVERSE_HOSTS, LINKED_FILE_MAX_BYTES } from '../../config/dataverse.js';
import { buildCsp, DATA_HOSTS } from '../../config/hosts.js';
import { MAX_BYTES, type UpstreamRequest, type UpstreamResponse } from '../../server/fetchProxy.js';
import { createApp } from '../../server/index.js';
import { FetchBlockedError, ProxyFetchError, fetchErrorFinding } from '../../src/core/sources/fetcher';

const DIST = join(__dirname, '..', 'fixtures', 'dist');

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield new TextEncoder().encode(p);
}
const resp = (status: number, body = '', headers: Record<string, string> = {}): UpstreamResponse => ({ status, headers, body: chunks(body), destroy() {} });

function make(upstream: (req: UpstreamRequest) => Promise<UpstreamResponse>) {
  return createApp({ distDir: DIST, resolver: async () => ['193.0.6.139'], upstream, log: () => undefined });
}
const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  request(app).post('/api/fetch').set('X-Forwarded-For', '9.9.9.9').set('Content-Type', 'application/json').buffer(true).send(JSON.stringify(body));

describe('Dataverse hosts on the proxy', () => {
  it('both installations are in the allowlist and in the CSP; the proxy limit is the one the loader checks first', () => {
    for (const h of DATAVERSE_HOSTS) {
      expect(DATA_HOSTS).toContain(h);
      expect(buildCsp()).toContain(`https://${h}`);
    }
    expect(DATAVERSE_HOSTS).toEqual(['repod.icm.edu.pl', 'danebadawcze.uw.edu.pl']);
    expect(LINKED_FILE_MAX_BYTES).toBe(MAX_BYTES);
  });

  it('proxies the three calls with a plain GET, the query kept, no cookie forwarded', async () => {
    const seen: UpstreamRequest[] = [];
    const app = make(async (req) => {
      seen.push(req);
      return resp(200, '{"status":"OK"}', { 'content-type': 'application/json', 'set-cookie': 'JSESSIONID=1' });
    });
    const urls = [
      'https://repod.icm.edu.pl/api/datasets/:persistentId/versions/:latest-published?persistentId=doi:10.18150/C45FCC',
      'https://repod.icm.edu.pl/api/access/datafile/108821?format=original',
      'https://danebadawcze.uw.edu.pl/api/access/datafile/1557',
    ];
    for (const url of urls) {
      const res = await post(app, { url, accept: 'application/json' });
      expect(res.status, url).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(seen.map((r) => r.method ?? 'GET')).toEqual(['GET', 'GET', 'GET']);
    expect(seen.map((r) => r.url.host + r.url.pathname + r.url.search)).toEqual(urls.map((u) => u.replace('https://', '')));
    for (const r of seen) expect(Object.keys(r.headers).map((k) => k.toLowerCase())).not.toContain('cookie');
  });

  it('is no open relay: another Dataverse, a look-alike host, http, a port and credentials are refused before any upstream call', async () => {
    let calls = 0;
    const app = make(async () => (calls++, resp(200)));
    for (const url of [
      'https://dataverse.no/api/datasets/:persistentId/versions/:latest-published?persistentId=doi:10.18710/X',
      'https://dataverse.harvard.edu/api/access/datafile/1',
      'https://rds.icm.edu.pl/api/access/datafile/1',
      'https://repod.icm.edu.pl.evil.example/api/access/datafile/1',
      'https://evil.example/repod.icm.edu.pl',
      'https://user:pw@repod.icm.edu.pl/api/access/datafile/1',
      'https://repod.icm.edu.pl:8443/api/access/datafile/1',
    ]) {
      expect((await post(app, { url })).status, url).toBe(403);
    }
    expect((await post(app, { url: 'http://repod.icm.edu.pl/api/access/datafile/1' })).status).toBe(400);
    expect(calls).toBe(0);
  });

  it('a download that redirects to a host that is not listed (what dataverse.no does, to its storage host) is refused, not followed', async () => {
    const app = make(async () => resp(303, '', { location: 'https://storage.example.org/bucket/file?sig=1' }));
    const res = await post(app, { url: 'https://repod.icm.edu.pl/api/access/datafile/1' });
    expect(res.status).toBe(403);
    expect(res.headers['x-fetch-proxy-error']).toBe('host_not_allowed');
  });

  it('an anonymous download of a restricted file (401, 403, 404) passes through as the status it is', async () => {
    for (const status of [401, 403, 404]) {
      const res = await post(make(async () => resp(status, '{"status":"ERROR"}', { 'content-type': 'application/json' })), { url: 'https://repod.icm.edu.pl/api/access/datafile/1' });
      expect(res.status).toBe(status);
      expect(res.headers['x-fetch-proxy-error']).toBeUndefined();
    }
  });

  it('a file above the limit is refused by the proxy (413 too_large); fetchErrorFinding keeps it an ordinary proxy error (the Dataverse loader says "too large" itself)', async () => {
    const app = make(async () => resp(200, '', { 'content-length': String(MAX_BYTES + 1) }));
    const res = await post(app, { url: 'https://repod.icm.edu.pl/api/access/datafile/1' });
    expect(res.status).toBe(413);
    expect(res.headers['x-fetch-proxy-error']).toBe('too_large');
    expect(fetchErrorFinding(new ProxyFetchError('too_large', 413, 'repod.icm.edu.pl'), 'big.csv')!.ruleId).toBe('IN-RECORD-INACCESSIBLE');
    expect(fetchErrorFinding(new FetchBlockedError('repod.icm.edu.pl'), 'x')!.ruleId).toBe('IN-FETCH-BLOCKED');
  });
});

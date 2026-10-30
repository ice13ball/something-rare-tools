// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../config/hosts.js';
import { createApp } from '../../server/index.js';

const FIXTURE = join(__dirname, '..', 'fixtures', 'dist');
const JS = 'export const x = ' + JSON.stringify(Array.from({ length: 400 }, (_, i) => 'value number ' + i)) + ';\n';
const CSS = Array.from({ length: 400 }, (_, i) => `.rule-${i} { color: #${(i * 4321).toString(16).padStart(6, '0').slice(0, 6)}; margin: ${i}px; }`).join('\n');

function dist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-compress-'));
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, 'assets', 'big.js'), JS);
  writeFileSync(join(dir, 'assets', 'big.css'), CSS);
  writeFileSync(join(dir, 'assets', 'pic.png'), Buffer.alloc(4000, 7));
  writeFileSync(join(dir, 'assets', 'tiny.js'), 'a=1;');
  return dir;
}

const DIST = dist();
const app = createApp({
  distDir: DIST,
  resolver: async () => ['193.0.6.139'],
  upstream: async () => ({ status: 200, headers: { 'content-type': 'text/csv' }, body: (async function* () { yield new TextEncoder().encode('a,b\n'.repeat(2000)); })(), destroy() {} }),
  log: () => {},
});

interface Raw { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

/** One request over a real socket with exactly the headers given (a client library would add its own Accept-Encoding and decode the body). */
function send(method: string, path: string, headers: Record<string, string> = {}, payload?: string): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        const parts: Buffer[] = [];
        res.on('data', (c: Buffer) => parts.push(c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts) });
        });
      });
      req.on('error', (e) => {
        server.close();
        reject(e);
      });
      req.end(payload);
    });
  });
}

const raw = (path: string, enc?: string, extra: Record<string, string> = {}, method = 'GET') => send(method, path, { ...(enc !== undefined ? { 'Accept-Encoding': enc } : {}), ...extra });

describe('HTTP compression of text responses', () => {
  it('gzip: a big script is gzip-encoded, smaller, intact, with Vary: Accept-Encoding and its own headers', async () => {
    const res = await raw('/assets/big.js', 'gzip');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.body.length).toBeLessThan(JS.length / 2);
    expect(gunzipSync(res.body).toString('utf8')).toBe(JS);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-security-policy']).toBe(buildCsp());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('brotli is preferred when the client offers it, for scripts and styles', async () => {
    for (const [path, text] of [['/assets/big.js', JS], ['/assets/big.css', CSS]] as const) {
      const res = await raw(path, 'br, gzip');
      expect(res.headers['content-encoding'], path).toBe('br');
      expect(brotliDecompressSync(res.body).toString('utf8'), path).toBe(text);
    }
  });

  it('pages (html) are compressed too, and keep their cache and security headers', async () => {
    const big = await raw('/check', 'gzip');
    // the fixture page is tiny: under the threshold it stays plain, which is what the threshold is for
    expect(big.headers['content-encoding']).toBeUndefined();
    expect(big.headers['cache-control']).toBe('no-cache');
    expect(big.headers['content-security-policy']).toBe(buildCsp());
  });

  it('nothing is compressed without Accept-Encoding, or with identity', async () => {
    for (const enc of [undefined, 'identity']) {
      const res = await raw('/assets/big.js', enc);
      expect(res.headers['content-encoding']).toBeUndefined();
      expect(res.body.toString('utf8')).toBe(JS);
      expect(res.headers['vary']).toMatch(/Accept-Encoding/i);
    }
  });

  it('images and tiny files are not compressed', async () => {
    expect((await raw('/assets/pic.png', 'gzip, br')).headers['content-encoding']).toBeUndefined();
    expect((await raw('/assets/tiny.js', 'gzip, br')).headers['content-encoding']).toBeUndefined();
  });

  it('/api/* is never compressed: the streamed proxy body arrives as it came', async () => {
    const res = await send('POST', '/api/fetch', { 'Accept-Encoding': 'gzip, br', 'Content-Type': 'application/json', 'X-Forwarded-For': '9.9.9.9' }, JSON.stringify({ url: 'https://zenodo.org/' }));
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(String(res.headers['vary'] ?? '')).not.toMatch(/Accept-Encoding/i);
    expect(res.body.toString('utf8')).toBe('a,b\n'.repeat(2000));
    const csw = await raw('/api/csw', 'gzip');
    expect(csw.headers['content-encoding']).toBeUndefined();
  });

  it('HEAD is answered with the headers of the plain file and no body (compression leaves HEAD alone)', async () => {
    const res = await raw('/assets/big.css', 'gzip', {}, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['content-length']).toBe(String(CSS.length));
    expect(res.body.length).toBe(0);
  });

  it('a Range request is answered as before: 206, the exact bytes, not compressed', async () => {
    const res = await raw('/assets/big.js', 'gzip, br', { Range: 'bytes=0-9' });
    expect(res.status).toBe(206);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString('utf8')).toBe(JS.slice(0, 10));
  });
});

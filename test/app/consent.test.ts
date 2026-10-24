// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// One consent for the atlas and the tools: the ac_consent cookie, migration, host-only cookie off the shared domain, and nothing
// from Google before Accept (script injection and fetch spies).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieDomainFor, denyConsent, getStoredConsent, grantConsent, initConsent, track } from '../../src/app/analytics';

const win = window as unknown as { dataLayer: unknown[]; gtag?: unknown };

function clearAll(): void {
  localStorage.clear();
  for (const part of document.cookie.split(';')) {
    const n = part.split('=')[0]!.trim();
    if (n) document.cookie = `${n}=; Path=/; Max-Age=0`;
  }
  win.dataLayer = [];
  delete win.gtag;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
}

let injected: string[];
let fetched: unknown[];
const realAppend = document.head.appendChild.bind(document.head);

beforeEach(() => {
  clearAll();
  injected = [];
  fetched = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) injected.push(node.src);
    return realAppend(node);
  });
  vi.stubGlobal('fetch', (...a: unknown[]) => {
    fetched.push(a);
    return Promise.reject(new Error('no network in tests'));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the cookie domain', () => {
  it('is something-rare.com for the site and its subdomains, host-only everywhere else', () => {
    expect(cookieDomainFor('something-rare.com')).toBe('something-rare.com');
    expect(cookieDomainFor('tools.something-rare.com')).toBe('something-rare.com');
    expect(cookieDomainFor('TOOLS.Something-Rare.com')).toBe('something-rare.com');
    for (const h of ['localhost', '127.0.0.1', 'tools-abc123-ew.a.run.app', 'evilsomething-rare.com', 'something-rare.com.evil.example', 'test']) {
      expect(cookieDomainFor(h), h).toBeUndefined();
    }
  });
});

describe('the shared cookie', () => {
  it('Accept writes ac_consent=granted (host-only here: localhost), decline writes denied', () => {
    expect(getStoredConsent()).toBeNull();
    grantConsent();
    expect(document.cookie).toContain('ac_consent=granted');
    expect(getStoredConsent()).toBe('granted');
    denyConsent();
    expect(document.cookie).toContain('ac_consent=denied');
    expect(document.cookie).not.toContain('ac_consent=granted');
    expect(getStoredConsent()).toBe('denied');
  });

  it('the cookie wins over a stale localStorage key', () => {
    document.cookie = 'ac_consent=denied; Path=/';
    localStorage.setItem('consent', 'granted');
    expect(getStoredConsent()).toBe('denied');
  });

  it('migrates the old localStorage decision into the cookie once and deletes the key', () => {
    localStorage.setItem('consent', 'granted');
    expect(getStoredConsent()).toBe('granted');
    expect(document.cookie).toContain('ac_consent=granted');
    expect(localStorage.getItem('consent')).toBeNull();
    expect(getStoredConsent()).toBe('granted');
  });

  it('with cookies disabled the old key is NOT deleted (it stays the only record), and the decision still holds for the page', () => {
    localStorage.setItem('consent', 'denied');
    const set = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => undefined);
    expect(getStoredConsent()).toBe('denied');
    expect(localStorage.getItem('consent')).toBe('denied');
    set.mockRestore();
    grantConsent(); // a working write resets the in-memory fallback for the next test
  });

  it('a legacy value that is neither granted nor denied is ignored', () => {
    localStorage.setItem('consent', 'nonsense');
    expect(getStoredConsent()).toBeNull();
    expect(document.cookie).not.toContain('ac_consent');
  });

  it('an unknown cookie value is no decision', () => {
    document.cookie = 'ac_consent=maybe; Path=/';
    expect(getStoredConsent()).toBeNull();
  });

  it('writes the attributes the contract names (Path, Max-Age 180 days, SameSite=Lax)', () => {
    const set = vi.spyOn(document, 'cookie', 'set');
    grantConsent();
    const line = String(set.mock.calls[0]![0]);
    expect(line).toMatch(/^ac_consent=granted; Path=\/; Max-Age=15552000; SameSite=Lax/);
    expect(line).not.toContain('Domain='); // localhost: host-only
    expect(line).not.toContain('Secure'); // http://localhost: Secure is added on https only
  });
});

describe('nothing from Google before Accept', () => {
  it('page load with no decision: no script, no gtag config, no request', () => {
    expect(initConsent()).toBeNull();
    expect(injected).toEqual([]);
    expect(fetched).toEqual([]);
    expect(win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)).some((e) => e[0] === 'config')).toBe(false);
    track('check_started', { input_type: 'file', mode: 'browser' });
    expect(injected).toEqual([]);
  });

  it('a stored denied never loads it, on any number of loads', () => {
    document.cookie = 'ac_consent=denied; Path=/';
    for (let i = 0; i < 3; i++) expect(initConsent()).toBe('denied');
    expect(injected).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it('a stored granted loads gtag.js on page load, once', () => {
    document.cookie = 'ac_consent=granted; Path=/';
    expect(initConsent()).toBe('granted');
    expect(injected).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-S5HR4WT0ZG']);
  });

  it('a migrated legacy granted also loads it', () => {
    localStorage.setItem('consent', 'granted');
    expect(initConsent()).toBe('granted');
    expect(injected.length).toBe(1);
  });

  it('Accept loads it, and a later load after Decline does not', () => {
    grantConsent();
    expect(injected.length).toBe(1);
    denyConsent();
    const entries = win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>));
    expect(entries.filter((e) => e[0] === 'consent' && (e[2] as { analytics_storage?: string }).analytics_storage === 'denied').length).toBe(1);
    injected = [];
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    expect(initConsent()).toBe('denied');
    expect(injected).toEqual([]);
  });

  it('Decline after Accept sets ga-disable-<id>, so gtag.js sends no further hit; Accept clears it', () => {
    const id = 'ga-disable-G-S5HR4WT0ZG';
    const w = window as unknown as Record<string, unknown>;
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    grantConsent();
    expect(w[id]).toBe(false);
    denyConsent();
    expect(w[id]).toBe(true);
    // the flag is set before the consent update, so nothing can slip out between the two
    const entries = win.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>));
    expect(entries.some((e) => e[0] === 'consent' && (e[2] as { analytics_storage?: string }).analytics_storage === 'denied')).toBe(true);
    track('check_started', { input_type: 'file', mode: 'browser' });
    expect(beacon).not.toHaveBeenCalled();
    expect(fetched).toEqual([]);
    grantConsent();
    expect(w[id]).toBe(false);
  });

  it('Decline after Accept stops events and removes the Google cookies', () => {
    grantConsent();
    document.cookie = '_ga=GA1.2.1; Path=/';
    document.cookie = '_ga_S5HR4WT0ZG=GS1; Path=/';
    document.cookie = 'unrelated=1; Path=/';
    denyConsent();
    expect(document.cookie).not.toContain('_ga');
    expect(document.cookie).toContain('unrelated=1');
    win.dataLayer = [];
    track('check_started', { input_type: 'file', mode: 'browser' });
    expect(win.dataLayer).toEqual([]);
  });
});

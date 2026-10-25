// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { SITE } from '../../config/site';
import type { DownloadMode } from './types';

/*
 * Consent Mode v2 + GA4, loaded only after the visitor accepts. Pattern from the atlas (not imported).
 * The defaults (all denied) are set by /consent-default.js before anything else runs.
 * ⛔ Events carry only enums and counts: never file names, DOIs, URLs or values. The types below admit
 * nothing else and track() additionally drops anything that is not an allowed enum string or a number.
 */
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** The pre-ecosystem key: its value is moved into the shared cookie once, then the key is deleted. */
const LEGACY_KEY = 'consent';
const COOKIE = SITE.consentCookie;
const SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${SITE.gaId}`;

export type ConsentState = 'granted' | 'denied';
export type InputType = 'file' | 'zenodo' | 'geonetwork' | 'doi' | 'pangaea' | 'mixed';
export type TrackEvent = 'check_started' | 'check_finished' | 'convert_started' | 'convert_blocked' | 'convert_exported';
/** What a converter export reports about the sheets: wide, long or a mix. Never a name. */
export type ConvertShapeParam = 'wide' | 'long' | 'mixed';
/** Whether a CTD / profile file went into the archive (a later stage; `none` until then). */
export type ConvertProfileParam = 'none' | 'ctd';
export interface TrackParams {
  input_type: InputType;
  mode: DownloadMode;
  n_errors?: number;
  n_warnings?: number;
  n_info?: number;
  /** convert_exported: the shape of the converted sheets and the profile flag */
  shape?: ConvertShapeParam;
  profile?: ConvertProfileParam;
  /** convert_exported: how many events, occurrences and measurement rows the archive has */
  n_events?: number;
  n_occurrences?: number;
  n_measurements?: number;
}

const INPUT_TYPES: readonly string[] = ['file', 'zenodo', 'geonetwork', 'doi', 'pangaea', 'mixed'];
const MODES: readonly string[] = ['browser', 'server'];
const EVENTS: readonly string[] = ['check_started', 'check_finished', 'convert_started', 'convert_blocked', 'convert_exported'];
const SHAPES: readonly string[] = ['wide', 'long', 'mixed'];
const PROFILES: readonly string[] = ['none', 'ctd'];
const COUNT_KEYS = ['n_errors', 'n_warnings', 'n_info', 'n_events', 'n_occurrences', 'n_measurements'] as const;

const isState = (v: unknown): v is ConsentState => v === 'granted' || v === 'denied';

/** something-rare.com and its subdomains share the cookie; any other host (localhost, a preview on *.run.app, a test) gets a host-only one. */
export function cookieDomainFor(hostname: string): string | undefined {
  const h = hostname.toLowerCase();
  return h === COOKIE.domain || h.endsWith('.' + COOKIE.domain) ? COOKIE.domain : undefined;
}

function cookieAttributes(maxAge: number): string {
  const domain = cookieDomainFor(location.hostname);
  return `; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${domain ? '; Domain=' + domain : ''}`;
}

function readCookie(): ConsentState | null {
  try {
    for (const part of document.cookie.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === COOKIE.name) {
        const v = part.slice(i + 1).trim();
        return isState(v) ? v : null;
      }
    }
  } catch {
    /* cookies unavailable */
  }
  return null;
}

/** When cookies are blocked the decision still lasts for this page. */
let remembered: ConsentState | null = null;

function writeCookie(v: ConsentState): void {
  try {
    document.cookie = `${COOKIE.name}=${v}${cookieAttributes(COOKIE.maxAge)}`;
  } catch {
    /* cookies unavailable */
  }
  remembered = readCookie() === v ? null : v; // memory only when the browser refused the cookie
}

/** The decision, cookie first. Without a cookie, the old localStorage key is migrated into it and deleted. */
export function getStoredConsent(): ConsentState | null {
  const c = readCookie();
  if (c) return c;
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
  if (isState(legacy)) {
    writeCookie(legacy);
    // The old key goes only once the cookie really holds the decision; if cookies are blocked it stays as the only record.
    if (readCookie() === legacy) {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* nothing more to do */
      }
    }
    return legacy;
  }
  return remembered;
}

const store = writeCookie;

/** On Decline: the Google cookies of an earlier Accept go too (expired on this host and on the shared domain). */
function clearGoogleCookies(): void {
  try {
    const names = document.cookie
      .split(';')
      .map((p) => p.split('=')[0]!.trim())
      .filter((n) => n === '_ga' || n === '_gid' || n.startsWith('_ga_') || n.startsWith('_gat'));
    // gtag.js sets _ga on the registrable parent domain, which is not always something-rare.com (a *.run.app preview): try every
    // parent suffix of the host. Expiring a cookie that does not exist is harmless.
    const labels = location.hostname.split('.');
    const domains = labels.length > 1 ? labels.map((_, i) => labels.slice(i).join('.')).slice(0, -1) : [];
    for (const n of names) {
      document.cookie = `${n}=; Path=/; Max-Age=0`;
      for (const d of domains) document.cookie = `${n}=; Path=/; Max-Age=0; Domain=${d}`;
    }
  } catch {
    /* cookies unavailable */
  }
}

/** gtag.js needs real Arguments objects in dataLayer, so this is a function and not an arrow. */
function ensureGtag(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(): void {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  }
  return window.gtag;
}

function loadGtagScript(): void {
  const s = document.createElement('script');
  s.async = true;
  s.src = SCRIPT_SRC;
  document.head.appendChild(s);
}

function activate(): void {
  const gtag = ensureGtag();
  gtag('consent', 'update', { analytics_storage: 'granted' });
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return; // already loaded and configured on this page
  loadGtagScript();
  gtag('js', new Date());
  // page_location is explicit so that nothing but origin + path can ever be reported.
  gtag('config', SITE.gaId, { page_location: location.origin + location.pathname, send_page_view: true });
}

/** Call once on page load: re-activates analytics for a visitor who already accepted. */
export function initConsent(): ConsentState | null {
  const stored = getStoredConsent();
  if (stored === 'granted') activate();
  return stored;
}

/** gtag.js honours window['ga-disable-<id>'] = true by sending nothing at all, which consent mode alone does not guarantee. */
const disableKey = `ga-disable-${SITE.gaId}`;
const setDisabled = (v: boolean): void => void ((window as unknown as Record<string, unknown>)[disableKey] = v);

export function grantConsent(): void {
  store('granted');
  setDisabled(false);
  activate();
}

export function denyConsent(): void {
  store('denied');
  setDisabled(true);
  ensureGtag()('consent', 'update', { analytics_storage: 'denied' });
  clearGoogleCookies();
}

/** No-op without stored consent. Sends only allowed enum strings and finite counts. */
export function track(event: TrackEvent, params: TrackParams): void {
  if (getStoredConsent() !== 'granted') return;
  if (!EVENTS.includes(event)) return;
  const p = params as unknown as Record<string, unknown>;
  const clean: Record<string, string | number> = {};
  if (typeof p.input_type === 'string' && INPUT_TYPES.includes(p.input_type)) clean.input_type = p.input_type;
  if (typeof p.mode === 'string' && MODES.includes(p.mode)) clean.mode = p.mode;
  if (typeof p.shape === 'string' && SHAPES.includes(p.shape)) clean.shape = p.shape;
  if (typeof p.profile === 'string' && PROFILES.includes(p.profile)) clean.profile = p.profile;
  for (const k of COUNT_KEYS) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.max(0, Math.round(v));
  }
  ensureGtag()('event', event, clean);
}

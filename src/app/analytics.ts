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

const CONSENT_KEY = 'consent';
const SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${SITE.gaId}`;

export type ConsentState = 'granted' | 'denied';
export type InputType = 'file' | 'zenodo' | 'geonetwork' | 'doi' | 'pangaea' | 'mixed';
export type TrackEvent = 'check_started' | 'check_finished';
export interface TrackParams {
  input_type: InputType;
  mode: DownloadMode;
  n_errors?: number;
  n_warnings?: number;
  n_info?: number;
}

const INPUT_TYPES: readonly string[] = ['file', 'zenodo', 'geonetwork', 'doi', 'pangaea', 'mixed'];
const MODES: readonly string[] = ['browser', 'server'];
const EVENTS: readonly string[] = ['check_started', 'check_finished'];
const COUNT_KEYS = ['n_errors', 'n_warnings', 'n_info'] as const;

export function getStoredConsent(): ConsentState | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === 'granted' || v === 'denied') return v;
  } catch {
    /* storage unavailable: no decision */
  }
  return null;
}

function store(v: ConsentState): void {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* the decision then lasts for this page only */
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

export function grantConsent(): void {
  store('granted');
  activate();
}

export function denyConsent(): void {
  store('denied');
  ensureGtag()('consent', 'update', { analytics_storage: 'denied' });
}

/** No-op without stored consent. Sends only allowed enum strings and finite counts. */
export function track(event: TrackEvent, params: TrackParams): void {
  if (getStoredConsent() !== 'granted') return;
  if (!EVENTS.includes(event)) return;
  const p = params as unknown as Record<string, unknown>;
  const clean: Record<string, string | number> = {};
  if (typeof p.input_type === 'string' && INPUT_TYPES.includes(p.input_type)) clean.input_type = p.input_type;
  if (typeof p.mode === 'string' && MODES.includes(p.mode)) clean.mode = p.mode;
  for (const k of COUNT_KEYS) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.max(0, Math.round(v));
  }
  ensureGtag()('event', event, clean);
}

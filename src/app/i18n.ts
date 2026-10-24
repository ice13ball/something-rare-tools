// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { useSyncExternalStore } from 'react';
import { translate, type UiKey } from '../core/i18n/ui';
import { LANGS, type Lang } from '../core/types';

/*
 * Language state for the whole page. Order: ?lang= on arrival (from the atlas) -> localStorage 'lang' -> navigator.languages -> 'en'.
 * The one write to the address is removing that single ?lang= parameter on arrival (history.replaceState); nothing else in the
 * query or the hash is touched, and the language is never put into the URL by this page.
 */
const STORAGE_KEY = 'lang';

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Pure: the stored language if valid, else the first browser language we support, else 'en'. */
export function detectLang(stored: string | null, browserLanguages: readonly string[]): Lang {
  if (isLang(stored)) return stored;
  for (const tag of browserLanguages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLang(primary)) return primary;
  }
  return 'en';
}

/** Pure: the language named by a `lang` query parameter if it is one of ours (the last one wins if repeated), else null. */
export function langFromSearch(search: string): Lang | null {
  const values = new URLSearchParams(search).getAll('lang');
  const v = values.length > 0 ? values[values.length - 1] : null;
  return isLang(v) ? v : null;
}

function nameOf(part: string): string {
  const raw = part.split('=')[0]!.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Pure: the query string without any `lang` parameter, every other parameter kept as written ('' or '?a=b'). */
export function searchWithoutLang(search: string): string {
  const keep = search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part !== '' && nameOf(part) !== 'lang');
  return keep.length > 0 ? '?' + keep.join('&') : '';
}

/**
 * Takes ?lang= from the address, stores it where the choice is stored, and removes only that parameter (other parameters and the
 * hash stay). An unknown value is ignored and left in place. Runs before the first render, so there is no flash of another language.
 */
function takeLangFromUrl(): void {
  if (typeof location === 'undefined') return;
  const lang = langFromSearch(location.search);
  if (!lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode: the language then only applies to this page (detectLang reads the stored value, so remember it here) */
    arrived = lang;
  }
  try {
    history.replaceState(history.state, '', location.pathname + searchWithoutLang(location.search) + location.hash);
  } catch {
    /* no history API: the address stays as it was */
  }
}

let arrived: Lang | null = null;

function readStored(): string | null {
  if (arrived) return arrived;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages && navigator.languages.length > 0 ? navigator.languages : navigator.language ? [navigator.language] : [];
}

let current: Lang = 'en';
let initialised = false;
const listeners = new Set<() => void>();

function apply(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

/** Detects the language and sets <html lang>. Safe to call again (re-detects). */
export function initLang(): Lang {
  initialised = true;
  takeLangFromUrl();
  apply(detectLang(readStored(), browserLanguages()));
  return current;
}

/** The atlas address with the current language appended as ?lang= (any query or hash the address already has is kept). */
export function atlasHref(base: string, lang: Lang): string {
  const u = new URL(base);
  u.searchParams.set('lang', lang);
  return u.toString();
}

export function getLang(): Lang {
  if (!initialised) initLang();
  return current;
}

export function setLang(lang: Lang): void {
  initialised = true;
  arrived = null;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode: the choice just lasts for this page */
  }
  apply(lang);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Subscribes the component to language changes. */
export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'en' as Lang);
  return { lang, setLang };
}

/** Translates in the current language. Components call useLang() so they re-render when it changes. */
export function t(key: UiKey, params?: Record<string, string | number>): string {
  return translate(getLang(), key, params);
}

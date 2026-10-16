// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { useSyncExternalStore } from 'react';
import { translate, type UiKey } from '../core/i18n/ui';
import { LANGS, type Lang } from '../core/types';

/*
 * Language state for the whole page. Order: localStorage 'lang' -> navigator.languages -> 'en'.
 * ⛔ Never writes to location or history: the language is not in the URL.
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

function readStored(): string | null {
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
  apply(detectLang(readStored(), browserLanguages()));
  return current;
}

export function getLang(): Lang {
  if (!initialised) initLang();
  return current;
}

export function setLang(lang: Lang): void {
  initialised = true;
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

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { NOT_CHECKED } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { UI, translate } from '../../src/core/i18n/ui';

const FORBIDDEN = /ready to publish|gotowe do publikacji|bereit zur Veröffentlichung|prêt à publier/i;
const params = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('UI strings', () => {
  const en = Object.keys(UI.en).sort();

  it('has the same key set in all four languages', () => {
    expect(en.length).toBeGreaterThan(40);
    for (const lang of LANGS) expect(Object.keys(UI[lang]).sort()).toEqual(en);
  });

  it('has no empty strings', () => {
    for (const lang of LANGS) for (const [k, v] of Object.entries(UI[lang])) expect(v.trim(), lang + ':' + k).not.toBe('');
  });

  it('never says the data is ready to publish, in any language', () => {
    for (const lang of LANGS) for (const [k, v] of Object.entries(UI[lang])) expect(v, lang + ':' + k).not.toMatch(FORBIDDEN);
  });

  it('uses the same {param} placeholders in every language', () => {
    for (const k of en) for (const lang of LANGS) expect(params(UI[lang][k as keyof typeof UI.en]), lang + ':' + k).toEqual(params(UI.en[k as keyof typeof UI.en]));
  });

  it('has a string for every not-checked key of the report model', () => {
    for (const key of NOT_CHECKED) for (const lang of LANGS) expect(UI[lang][key as keyof typeof UI.en], key).toBeTruthy();
  });

  it('keeps the brand name and the mandated sentences', () => {
    expect(UI.en.brand).toBe('Abyssal Claims Tools');
    expect(UI.en['report.noProblems']).toBe('No problems found in the checked categories.');
    expect(UI.en['nav.atlas']).toBe('Abyssal Claims — deep-sea atlas');
  });

  it('translate fills params and falls back to English, then to the key', () => {
    expect(translate('de', 'report.summary', { errors: 2, warnings: 3, notes: 4 })).toContain('2');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });
});

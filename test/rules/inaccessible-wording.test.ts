// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// IN-RECORD-INACCESSIBLE says "private or unpublished" only where the status can mean that (403, 404).
import { describe, expect, it } from 'vitest';
import { renderPlain, renderTechnical } from '../../src/core/report';
import { getRule, makeFinding } from '../../src/core/rules/registry';
import { LANGS } from '../../src/core/types';

const text = (status: number, lang: 'en' | 'pl' | 'de' | 'fr' = 'en'): string => renderPlain(makeFinding('IN-RECORD-INACCESSIBLE', { file: 'rec', params: { status, host: 'gn.example.org' } }), lang);
const PRIVATE: Record<string, RegExp> = { en: /private or unpublished/, pl: /prywatny lub niepublikowany/, de: /privat oder unveröffentlicht/, fr: /privée ou non publiée/ };

describe('IN-RECORD-INACCESSIBLE wording by status class', () => {
  it('403 and 404: may be private or unpublished', () => {
    for (const lang of LANGS) for (const s of [403, 404]) expect(text(s, lang), `${lang} ${s}`).toMatch(PRIVATE[lang]);
  });
  it('5xx: the server returned an error, try again later, and no claim that the record is private', () => {
    for (const lang of LANGS) for (const s of [500, 502, 503, 599]) {
      const t = text(s, lang);
      expect(t, `${lang} ${s}`).not.toMatch(PRIVATE[lang]);
      expect(t).toContain(String(s));
      expect(t).toContain('gn.example.org');
    }
    expect(text(500)).toBe('The server gn.example.org returned an error (500), so the record could not be opened. This is usually a temporary fault on the server\'s side: try again later, or download its files or metadata and drop them here.');
    expect(text(503, 'pl')).toContain('Serwer gn.example.org zwrócił błąd (503)');
  });
  it('any other status: neutral, no guess', () => {
    for (const lang of LANGS) for (const s of [400, 401, 410, 429, 301]) expect(text(s, lang), `${lang} ${s}`).not.toMatch(PRIVATE[lang]);
    expect(text(401)).toBe('The record on gn.example.org could not be opened (error 401). Try again later, or download its files or metadata and drop them here.');
  });
  it('rule id, severity and technical line are unchanged; every variant has four languages and fills its placeholders', () => {
    const rule = getRule('IN-RECORD-INACCESSIBLE');
    expect(rule.severity).toBe('error');
    for (const variant of [rule.plain, rule.plainByStatus!.server, rule.plainByStatus!.other]) for (const lang of LANGS) {
      expect(variant[lang].length).toBeGreaterThan(20);
      expect(variant[lang].length).toBeLessThanOrEqual(330);
      expect(variant[lang].match(/\{(\w+)\}/g)!.sort()).toEqual(['{host}', '{status}']);
    }
    expect(renderTechnical(makeFinding('IN-RECORD-INACCESSIBLE', { file: 'rec', params: { status: 503, host: 'h' } }))).toBe('rec: HTTP 503 from h; record metadata not readable, continuing with what the other sources provided.');
  });
});

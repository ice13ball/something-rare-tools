// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The Polish name of the data checker is "Weryfikator danych" (Michał, 2026-11-06: "sprawdzarka danych" "zdecydowanie nie brzmi dobrze po polsku").
// No Polish text names the tool "sprawdzarka" or "Sprawdzanie danych"; the verb buttons ("Sprawdź", "Potwierdź i sprawdź") stay.
import { describe, expect, it } from 'vitest';
import { UI } from '../../src/core/i18n/ui';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { RULES } from '../../src/core/rules';
import { CONVERT_RULES } from '../../src/core/rules/convert';

const polishTexts = (): string[] => {
  const out: string[] = [...Object.values(UI.pl), ...Object.values(TIP_TEXTS.pl)];
  const rules = [...(Array.isArray(RULES) ? RULES : Object.values(RULES)), ...CONVERT_RULES] as unknown[];
  for (const r of rules) {
    const spec = r as { plain?: Record<string, unknown>; technical?: unknown };
    if (spec.plain?.pl !== undefined) out.push(JSON.stringify(spec.plain.pl));
  }
  expect(out.length).toBeGreaterThan(Object.keys(UI.pl).length + rules.length / 2);
  return out;
};

describe('Polish name of the data checker', () => {
  it('no Polish text says "sprawdzarka" in any form', () => {
    expect(polishTexts().filter((t) => /sprawdzark/i.test(t))).toEqual([]);
  });
  it('no Polish text names the tool "Sprawdzanie danych"', () => {
    expect(polishTexts().filter((t) => /sprawdzani\w*\s+danych\b/i.test(t) && !/do sprawdzania danych morskich/.test(t))).toEqual([]);
  });
  it('the menu, the card and the page heading say "Weryfikator danych"', () => {
    expect(UI.pl['nav.check']).toBe('Weryfikator danych');
    expect(UI.pl['index.card.title']).toBe('Weryfikator danych');
    expect(UI.pl['check.title']).toBe('Weryfikator danych');
    expect(UI.pl['check.docTitle']).toMatch(/^Weryfikator danych morskich: współrzędne, daty, jednostki, licencja/);
  });
  it('other languages keep their names', () => {
    expect(UI.en['check.title']).not.toMatch(/Weryfikator/);
    expect(UI.de['check.title']).not.toMatch(/Weryfikator/);
    expect(UI.fr['check.title']).not.toMatch(/Weryfikator/);
  });
});

describe('Polish name on the server-rendered 404 page', () => {
  it('the 404 navigation names the data checker "Weryfikator danych"', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../../server/notFound.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Sprawdzanie danych|sprawdzark/i);
    expect(src).toMatch(/nav: \['Weryfikator danych'/);
  });
});

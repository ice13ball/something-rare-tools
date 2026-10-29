// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Verbs and adjectives that depend on a counted number agree with it (1, 2, 5, 12, 22), in the /check, /convert and page texts.
import { describe, expect, it } from 'vitest';
import { translate } from '../../src/core/i18n/ui';
import { renderPlain } from '../../src/core/report';
import { makeFinding } from '../../src/core/rules/registry';
import { makeConvertFinding, renderConvertPlain } from '../../src/core/rules/convert';

const NUMBERS = [1, 2, 5, 12, 22] as const;
const pl = (id: string, count: number, params: Record<string, string | number> = {}): string =>
  renderPlain(makeFinding(id, { file: 'f.csv', lines: [3], params: { count, ...params } }), 'pl');

describe('Polish agreement of the verb with the counted noun', () => {
  it('CONV-COLUMN-NOT-EXPORTED: nie trafi 1 kolumna, nie trafią 2 kolumny, nie trafi 5 kolumn', () => {
    const text = (n: number) =>
      renderConvertPlain(makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { file: 'f.csv', sheet: 'S', params: { count: n, columns: 'a' } }), 'pl').split(':')[0];
    expect(NUMBERS.map(text)).toEqual(['Do archiwum nie trafi 1 kolumna', 'Do archiwum nie trafią 2 kolumny', 'Do archiwum nie trafi 5 kolumn', 'Do archiwum nie trafi 12 kolumn', 'Do archiwum nie trafią 22 kolumny']);
  });

  it('ROW-DATE-MISSING: 1 wiersz nie ma, 2 wiersze nie mają, 5 wierszy nie ma', () => {
    const head = (n: number) => /^(\d+ \S+ \([^)]*\) nie \S+) daty/.exec(pl('ROW-DATE-MISSING', n, { percent: 5 }))![1];
    expect(NUMBERS.map(head)).toEqual(['1 wiersz (5 %) nie ma', '2 wiersze (5 %) nie mają', '5 wierszy (5 %) nie ma', '12 wierszy (5 %) nie ma', '22 wiersze (5 %) nie mają']);
  });

  it('META-DATE-OUTSIDE-EXTENT and META-POINT-OUTSIDE-BBOX', () => {
    const date = (n: number) => /^(\d+ \S+ \S+) (datę|poza)/.exec(pl('META-DATE-OUTSIDE-EXTENT', n, { start: 'a', end: 'b' }))![1];
    expect(NUMBERS.map(date)).toEqual(['1 wiersz ma', '2 wiersze mają', '5 wierszy ma', '12 wierszy ma', '22 wiersze mają']);
    const box = (n: number) => /^(\d+ \S+ \S+) poza/.exec(pl('META-POINT-OUTSIDE-BBOX', n, { west: 1, east: 2, south: 3, north: 4 }))![1];
    expect(NUMBERS.map(box)).toEqual(['1 wiersz leży', '2 wiersze leżą', '5 wierszy leży', '12 wierszy leży', '22 wiersze leżą']);
  });

  it('META-EMPTY-LINK: jest 1 odnośnik, są 2 odnośniki, jest 5 odnośników', () => {
    const head = (n: number) => /^W metadanych (.+?) do pobrania/.exec(pl('META-EMPTY-LINK', n))![1];
    expect(NUMBERS.map(head)).toEqual(['jest 1 odnośnik', 'są 2 odnośniki', 'jest 5 odnośników', 'jest 12 odnośników', 'są 22 odnośniki']);
  });

  it('CHEM-RANGE: 1 wartość wykracza, 2 wartości wykraczają', () => {
    const head = (n: number) => /^(\d+ \S+) x (\S+) poza/.exec(pl('CHEM-RANGE', n, { variable: 'x', min: 0, max: 1, unit: 'u' }));
    expect(NUMBERS.map((n) => head(n)?.[2])).toEqual(['wykracza', 'wykraczają', 'wykracza', 'wykracza', 'wykraczają']);
  });

  it('XF-DUPLICATE-SAMPLES: 1 tę samą próbkę ... nie jest liczona; 2 te same próbki ... nie są liczone', () => {
    const text = (n: number) => pl('XF-DUPLICATE-SAMPLES', n, { fileA: 'a', fileB: 'b' });
    expect(text(1)).toBe('Pliki a i b zawierają 1 tę samą próbkę. Upewnij się, że nie jest liczona dwa razy.');
    expect(text(2)).toBe('Pliki a i b zawierają 2 te same próbki. Upewnij się, że nie są liczone dwa razy.');
    expect(text(5)).toContain('5 tych samych próbek');
    expect(text(22)).toContain('22 te same próbki');
  });

  it('IN-DWCA-EVENT-CORE: ma 1 wiersz, 2 wiersze, 5 wierszy', () => {
    const head = (n: number) => /ma (\d+ \S+)\./.exec(renderPlain(makeFinding('IN-DWCA-EVENT-CORE', { file: 'f.zip', params: { occurrences: n } }), 'pl'))![1];
    expect(NUMBERS.map(head)).toEqual(['1 wiersz', '2 wiersze', '5 wierszy', '12 wierszy', '22 wiersze']);
  });

  it('page texts: map.skipped, downloads.rows, time.days, csv.rows', () => {
    const skipped = (n: number) => /^\d+ \S+ z niemożliwą pozycją \(szerokość poza ±90°\) (.+?) na mapie\.$/.exec(translate('pl', 'map.skipped', { count: n }))![1];
    expect(NUMBERS.map(skipped)).toEqual(['nie jest pokazany', 'nie są pokazane', 'nie jest pokazanych', 'nie jest pokazanych', 'nie są pokazane']);
    expect(NUMBERS.map((n) => translate('pl', 'downloads.rows', { rows: n }))).toEqual(['1 wiersz', '2 wiersze', '5 wierszy', '12 wierszy', '22 wiersze']);
    expect(NUMBERS.map((n) => translate('pl', 'collection.time.days', { n }))).toEqual(['1 dzień', '2 dni', '5 dni', '12 dni', '22 dni']);
    expect(NUMBERS.map((n) => translate('pl', 'collection.progress.met', { n }))).toEqual(['Dotąd napotkano 1 rekord.', 'Dotąd napotkano 2 rekordy.', 'Dotąd napotkano 5 rekordów.', 'Dotąd napotkano 12 rekordów.', 'Dotąd napotkano 22 rekordy.']);
  });
});

describe('the other languages agree in number too', () => {
  it('English, German, French: one row has / two rows have', () => {
    const find = (lang: 'en' | 'de' | 'fr', n: number) => renderPlain(makeFinding('META-POINT-OUTSIDE-BBOX', { file: 'f.csv', lines: [3], params: { count: n, west: 1, east: 2, south: 3, north: 4 } }), lang).split(' ').slice(0, 4).join(' ');
    expect([find('en', 1), find('en', 2)]).toEqual(['1 row lies outside', '2 rows lie outside']);
    expect([find('de', 1), find('de', 2)]).toEqual(['1 Zeile liegt außerhalb', '2 Zeilen liegen außerhalb']);
    expect([find('fr', 1), find('fr', 2)]).toEqual(['1 ligne se trouve', '2 lignes se trouvent']);
    expect(translate('en', 'map.skipped', { count: 1 })).toContain('1 row with a position that cannot exist (latitude beyond ±90°) is not shown');
    expect(translate('fr', 'map.skipped', { count: 1 })).toBe("1 ligne avec une position impossible (latitude au-delà de ±90°) n'est pas affichée sur la carte.");
    expect(translate('en', 'collection.time.days', { n: 1 })).toBe('1 day');
  });
});

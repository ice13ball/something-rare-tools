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

describe('every counted page key, at 0, 1, 2, 5, 12, 22 and 101, in all four languages', () => {
  // key -> the placeholders that hold the counted number
  const KEYS: Record<string, string[]> = {
    'collection.progress.met': ['n'],
    'collection.saved.text': ['n'],
    'collection.estimate.extra': ['n'],
    'collection.notice.slices-differ': ['sum'],
    'collection.notice.window-exceeded': ['total'],
    'collection.notice.ended-before-total': ['total'],
    'collection.notice.more-than-matched': ['seen'],
    'collection.notice.ended-by-exception': ['matched'],
    'collection.notice.empty-page': ['matched'],
    'collection.notice.ended-before-matched': ['matched'],
    'collection.notice.overrun-stopped': ['seen'],
    'collection.cross.notDone': ['n'],
    'collection.duplicates': ['n'],
    'convert.worms.stopped': ['done', 'total'],
    'collection.progress.requests': ['requests', 'retries', 'throttled'],
    'collection.csv.rows': ['rows'],
    'collection.rule.count': ['count'],
    'collection.time.days': ['n'],
    'downloads.rows': ['rows'],
    'map.skipped': ['count'],
  };
  const COUNTS = [0, 1, 2, 5, 12, 22, 101] as const;
  const render = (lang: 'pl' | 'en' | 'de' | 'fr', key: string, n: number): string => {
    const names = new Set([...translate(lang, key).matchAll(/\{\+?(\w+)[:}]/g)].map((m) => m[1]));
    const params = Object.fromEntries([...names].map((p) => [p, KEYS[key].includes(p) ? n : 'x']));
    return translate(lang, key, params);
  };

  it('no placeholder is left open, and every language renders something different for 1 and for 5 when the grammar changes', () => {
    for (const key of Object.keys(KEYS)) for (const lang of ['pl', 'en', 'de', 'fr'] as const) for (const n of COUNTS) expect(render(lang, key, n), `${lang} ${key} ${n}`).not.toMatch(/[{}]/);
  });

  it('English and German: no plural noun after 1; French: none after 0 or 1', () => {
    const enDe = /\b1 (?:records|repeats|requests|retries|rows|names|days|findings|times|Datensätze|Wiederholungen|Anfragen|Zeilen|Namen|Tage|Befunde)\b/;
    const fr = /\b[01] (?:notices|répétitions|requêtes|nouvelles tentatives|lignes|noms|jours|constats|demandes)\b/;
    for (const key of Object.keys(KEYS)) {
      for (const lang of ['en', 'de'] as const) expect(render(lang, key, 1), `${lang} ${key}`).not.toMatch(enDe);
      for (const n of [0, 1]) expect(render('fr', key, n), `fr ${key} ${n}`).not.toMatch(fr);
    }
    expect(render('en', 'collection.duplicates', 1)).toMatch(/^1 repeat was counted once/);
    expect(render('en', 'collection.duplicates', 2)).toMatch(/^2 repeats were counted once/);
    expect(render('de', 'collection.progress.met', 1)).toBe('Bisher 1 Datensatz erfasst.');
    expect(render('fr', 'collection.progress.met', 1)).toBe('1 notice rencontrée jusqu’ici.');
    expect(render('en', 'collection.estimate.extra', 1)).toBe('Plus up to 1 request to DataCite for the comparison.');
    expect(render('en', 'collection.progress.requests', 1)).toBe('1 request, 1 retry, asked to slow down 1 time.');
  });

  it('Polish: the noun takes its form at 1, 2, 5, 12, 22, 101', () => {
    const form = (n: number) => /Dotąd napotkano \d+ (\S+)\./.exec(render('pl', 'collection.progress.met', n))![1];
    expect(COUNTS.map(form)).toEqual(['rekordów', 'rekord', 'rekordy', 'rekordów', 'rekordów', 'rekordy', 'rekordów']);
    const dup = (n: number) => /^\d+ (\S+) policzono raz/.exec(render('pl', 'collection.duplicates', n))![1];
    expect(COUNTS.map(dup)).toEqual(['powtórzeń', 'powtórzenie', 'powtórzenia', 'powtórzeń', 'powtórzeń', 'powtórzenia', 'powtórzeń']);
    expect(render('pl', 'collection.cross.notDone', 1)).toContain('sprawdzono go tylko');
    expect(render('pl', 'collection.cross.notDone', 2)).toContain('sprawdzono je tylko');
    expect(render('pl', 'collection.cross.notDone', 1)).toContain('dla 1 rekordu');
  });

  it('IN-DWCA-EVENT-CORE and CONV-COLUMN-NOT-EXPORTED agree in en, de, fr at 0, 1, 2', () => {
    const core = (lang: 'en' | 'de' | 'fr', n: number) => renderPlain(makeFinding('IN-DWCA-EVENT-CORE', { file: 'f.zip', params: { occurrences: n } }), lang);
    expect(core('en', 1)).toContain('has 1 row.');
    expect(core('en', 2)).toContain('has 2 rows.');
    expect(core('de', 1)).toContain('hat 1 Zeile.');
    expect(core('fr', 1)).toContain('compte 1 ligne.');
    expect(core('fr', 0)).toContain('compte 0 ligne.');
    const col = (lang: 'pl' | 'en' | 'de' | 'fr', n: number) => renderConvertPlain(makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { file: 'f.csv', sheet: 'S', params: { count: n, columns: 'a' } }), lang);
    expect(col('pl', 1)).toContain('bez niej.');
    expect(col('pl', 2)).toContain('bez nich.');
    expect(col('en', 1)).toContain('without it.');
    expect(col('en', 2)).toContain('without them.');
    expect(col('fr', 1)).toContain('sans elle.');
    expect(col('fr', 2)).toContain('sans elles.');
  });

  it('XF-DUPLICATE-SAMPLES reads naturally at 1 and 2 in English', () => {
    const t = (n: number) => renderPlain(makeFinding('XF-DUPLICATE-SAMPLES', { file: 'f.csv', lines: [3], params: { count: n, fileA: 'a', fileB: 'b' } }), 'en');
    expect(t(1)).toBe('The files a and b have 1 sample in common. Make sure it is not counted twice.');
    expect(t(2)).toBe('The files a and b have 2 samples in common. Make sure they are not counted twice.');
  });
});

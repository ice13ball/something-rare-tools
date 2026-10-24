// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic headers and values only (no third-party data).
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { headerKey } from '../../src/core/recognize/vocab';
import type { ColumnProposal } from '../../src/core/types';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;
const run = (header: string[], rows: Cell[][]): ColumnProposal[] => proposeColumns(rawSheet(header, rows, 'S'), CTX);
const kind = (p: ColumnProposal[], h: string): string => p.find((x) => x.header === h)!.role.kind;
const conf = (p: ColumnProposal[], h: string): string => p.find((x) => x.header === h)!.confidence;

/** One column per header with a value that suits its role, enough rows for a stable guess. */
const VALUE: Record<string, Cell> = { lat: 54.5, lon: 18.5, date: '2020-05-12', time: '10:30', depth: 12, text: 'ABC-1' };
function single(header: string, value: Cell): string {
  const p = run([header, 'dummy'], [[value, 1], [value, 2]]);
  return p[0].role.kind;
}

describe('headerKey', () => {
  it('turns letters that do not decompose into their ASCII form', () => {
    expect(headerKey('Długość geograficzna')).toBe('dlugosc geograficzna');
    expect(headerKey('Głębokość [m]')).toBe('glebokosc m');
    expect(headerKey('Größe')).toBe('grosse');
    expect(headerKey('Länge')).toBe('lange');
    expect(headerKey('échantillon')).toBe('echantillon');
  });
});

describe('Polish names', () => {
  const cases: [string, string, Cell][] = [
    ['Szerokość geograficzna [°N]', 'latitude', VALUE.lat],
    ['Szerokosc geograficzna', 'latitude', VALUE.lat],
    ['Szer. geogr.', 'latitude', VALUE.lat],
    ['Szerokość geograficzna N', 'latitude', VALUE.lat],
    ['Długość geogr. [°E]', 'longitude', VALUE.lon],
    ['Dlugosc geograficzna', 'longitude', VALUE.lon],
    ['Dł. geogr.', 'longitude', VALUE.lon],
    ['Długość geograficzna wschodnia', 'longitude', VALUE.lon],
    ['Data poboru', 'date', VALUE.date],
    ['Data pomiaru', 'date', VALUE.date],
    ['Data', 'date', VALUE.date],
    ['Data i godzina', 'datetime', '2020-05-12 10:30'],
    ['Godzina (UTC)', 'time', VALUE.time],
    ['Godzina', 'time', VALUE.time],
    ['Czas', 'time', VALUE.time],
    ['Głębokość [m]', 'depth', VALUE.depth],
    ['Glebokosc', 'depth', VALUE.depth],
    ['Głębokość pobrania', 'depth', VALUE.depth],
    ['Ciśnienie [dbar]', 'pressure', VALUE.depth],
    ['Cisnienie', 'pressure', VALUE.depth],
    ['Stacja', 'station', VALUE.text],
    ['Nr stacji', 'station', VALUE.text],
    ['Rejs', 'cruise', VALUE.text],
    ['Numer rejsu', 'cruise', VALUE.text],
    ['Nr próbki', 'sampleId', VALUE.text],
    ['Próbka', 'sampleId', VALUE.text],
    ['Kod rdzenia', 'sampleId', VALUE.text],
    ['Numer rdzenia', 'sampleId', VALUE.text],
  ];
  it.each(cases)('%s -> %s', (h, k, v) => expect(single(h, v)).toBe(k));
});

describe('German names', () => {
  const cases: [string, string, Cell][] = [
    ['Breitengrad', 'latitude', VALUE.lat],
    ['Geographische Breite', 'latitude', VALUE.lat],
    ['Breite [°N]', 'latitude', VALUE.lat],
    ['Breite N', 'latitude', VALUE.lat],
    ['Längengrad', 'longitude', VALUE.lon],
    ['Laengengrad', 'longitude', VALUE.lon],
    ['Länge [°O]', 'longitude', VALUE.lon],
    ['Länge O', 'longitude', VALUE.lon],
    ['Datum', 'date', VALUE.date],
    ['Messdatum', 'date', VALUE.date],
    ['Datum und Uhrzeit', 'datetime', '2020-05-12 10:30'],
    ['Uhrzeit', 'time', VALUE.time],
    ['Uhrzeit (UTC)', 'time', VALUE.time],
    ['Zeit', 'time', VALUE.time],
    ['Tiefe [m]', 'depth', VALUE.depth],
    ['Wassertiefe', 'depth', VALUE.depth],
    ['Druck [dbar]', 'pressure', VALUE.depth],
    ['Station', 'station', VALUE.text],
    ['Stationsnummer', 'station', VALUE.text],
    ['Fahrt', 'cruise', VALUE.text],
    ['Reise', 'cruise', VALUE.text],
    ['Fahrtnummer', 'cruise', VALUE.text],
    ['Probennummer', 'sampleId', VALUE.text],
    ['Probe Nr.', 'sampleId', VALUE.text],
    ['Kern ID', 'sampleId', VALUE.text],
  ];
  it.each(cases)('%s -> %s', (h, k, v) => expect(single(h, v)).toBe(k));
});

describe('French names', () => {
  const cases: [string, string, Cell][] = [
    ['Latitude', 'latitude', VALUE.lat],
    ['Longitude [°E]', 'longitude', VALUE.lon],
    ['Date', 'date', VALUE.date],
    ['Date de prélèvement', 'date', VALUE.date],
    ['Date et heure', 'datetime', '2020-05-12 10:30'],
    ['Heure', 'time', VALUE.time],
    ['Heure (UTC)', 'time', VALUE.time],
    ['Profondeur [m]', 'depth', VALUE.depth],
    ['Pression [dbar]', 'pressure', VALUE.depth],
    ['Station', 'station', VALUE.text],
    ['Numéro de station', 'station', VALUE.text],
    ['Campagne', 'cruise', VALUE.text],
    ['Croisière', 'cruise', VALUE.text],
    ['Échantillon', 'sampleId', VALUE.text],
    ['Numéro d’échantillon', 'sampleId', VALUE.text],
    ['Carotte', 'sampleId', VALUE.text],
  ];
  it.each(cases)('%s -> %s', (h, k, v) => expect(single(h, v)).toBe(k));
});

describe('a full sheet in each language: every column proposed, positions and dates read', () => {
  it('Polish', () => {
    const p = run(['Stacja', 'Data', 'Szerokość geograficzna', 'Długość geograficzna', 'Głębokość [m]', 'Temperatura [°C]'], [
      ['ST1', '2020-05-12', 54.5, 18.5, 5, 7.1],
      ['ST1', '2020-05-12', 54.5, 18.5, 10, 6.8],
    ]);
    expect(p.map((x) => x.role.kind)).toEqual(['station', 'date', 'latitude', 'longitude', 'depth', 'variable']);
    const d = p[4].role;
    expect(d).toMatchObject({ kind: 'depth', positive: 'down', unit: 'm' }); // "głębokość" states the direction
    expect(p[4].confidence).toBe('high');
  });
  it('German', () => {
    const p = run(['Station', 'Datum', 'Breitengrad', 'Längengrad', 'Tiefe [m]', 'Druck [dbar]'], [['A', '2020-05-12', 54.5, 18.5, 5, 5], ['A', '2020-05-12', 54.5, 18.5, 10, 10]]);
    expect(p.map((x) => x.role.kind)).toEqual(['station', 'date', 'latitude', 'longitude', 'depth', 'pressure']);
    expect(p[4].role).toMatchObject({ positive: 'down' });
  });
  it('French', () => {
    const p = run(['Station', 'Date', 'Latitude', 'Longitude', 'Profondeur [m]', 'Pression [dbar]'], [['A', '2020-05-12', 54.5, 18.5, 5, 5], ['A', '2020-05-12', 54.5, 18.5, 10, 10]]);
    expect(p.map((x) => x.role.kind)).toEqual(['station', 'date', 'latitude', 'longitude', 'depth', 'pressure']);
    expect(p[4].role).toMatchObject({ positive: 'down' });
  });
});

describe('the bare width / length trap', () => {
  const geo = [54.5, 18.5];
  it('"długość [mm]" next to proper coordinates is never a longitude', () => {
    const p = run(['Szerokość geograficzna', 'Długość geograficzna', 'długość [mm]'], [[geo[0], geo[1], 12], [geo[0], geo[1], 15]]);
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'longitude', 'variable']);
  });
  it('a bare word with a unit that is not degrees is never a coordinate, whatever the values', () => {
    for (const h of ['długość [mm]', 'długość [cm]', 'długość [µm]', 'długość [m]', 'szerokość [mm]', 'Länge [mm]', 'Breite [cm]', 'Länge [m]']) {
      const lon = h.startsWith('d') || h.startsWith('L');
      const p = run([h, lon ? 'Szerokość geograficzna' : 'Długość geograficzna'], [[20, 10], [30, 11]]);
      expect(p[0].role.kind, h).toBe('variable');
    }
  });
  it('Länge + Breite with body-size values and no coordinates elsewhere are variables', () => {
    const p = run(['Länge', 'Breite', 'Gewicht'], [[120, 40, 3], [250, 80, 9], [300, 95, 12]]);
    expect(p.map((x) => x.role.kind)).toEqual(['variable', 'variable', 'variable']);
  });
  it('a fish sheet: długość / szerokość / masa stay variables', () => {
    const p = run(['Długość', 'Szerokość', 'Masa'], [[210, 45, 130], [305, 60, 400], [180, 40, 90]]);
    expect(p.map((x) => x.role.kind)).toEqual(['variable', 'variable', 'variable']);
  });
  it('a fish sheet with a hemisphere-free pair that does NOT fit the range is not a position either', () => {
    const p = run(['Station', 'Długość', 'Szerokość'], [['A', 250, 20], ['B', 190, 30]]);
    expect(p.map((x) => x.role.kind)).toEqual(['station', 'variable', 'variable']);
  });
  it('a lone bare word is not a coordinate even when its values fit (no partner)', () => {
    expect(run(['Szerokość', 'Masa'], [[54.5, 3], [54.6, 4]])[0].role.kind).toBe('variable');
    expect(run(['Länge', 'Gewicht'], [[18.5, 3], [18.6, 4]])[0].role.kind).toBe('variable');
  });
  it('a bare pair that fits the range AND has its partner is proposed, with low confidence', () => {
    const p = run(['Szerokość', 'Długość', 'Głębokość'], [[54.5, 18.5, 5], [54.6, 18.7, 10]]);
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'longitude', 'depth']);
    expect(conf(p, 'Szerokość')).toBe('low');
    expect(conf(p, 'Długość')).toBe('low');
    const g = run(['Breite', 'Länge'], [[54.5, 18.5], [54.6, 18.7]]);
    expect(g.map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
    expect(g[0].confidence).toBe('low');
  });
  it('a bare word with a partner that is a proper coordinate column is proposed when values fit', () => {
    const p = run(['Szerokość', 'Longitude'], [[54.5, 18.5], [54.6, 18.7]]);
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
    expect(conf(p, 'Szerokość')).toBe('low');
  });
  it('one value outside the range rules a bare word out', () => {
    const p = run(['Szerokość', 'Długość'], [[54.5, 18.5], [154.5, 18.7]]);
    expect(p.map((x) => x.role.kind)).toEqual(['variable', 'variable']);
  });
  it('a bare word backed by degrees or a hemisphere letter is a normal coordinate', () => {
    for (const [h, k] of [['Szerokość [°N]', 'latitude'], ['Długość [°E]', 'longitude'], ['Breite [°]', 'latitude'], ['Länge [Grad]', 'longitude'], ['Szer. N', 'latitude'], ['Dł. E', 'longitude']] as const) {
      expect(single(h, 500), h).toBe(k);
      expect(conf(run([h, 'x'], [[500, 1]]), h), h).toBe('high');
    }
  });
  it('safe names are coordinates without a partner and whatever the unit text', () => {
    for (const [h, k] of [['długość geograficzna', 'longitude'], ['dł. geogr.', 'longitude'], ['Längengrad', 'longitude'], ['Breitengrad', 'latitude'], ['szerokość geograficzna', 'latitude'], ['Longitude', 'longitude']] as const) {
      expect(single(h, 20), h).toBe(k);
    }
  });
  it('a measurement of something is not a bare coordinate word', () => {
    expect(run(['długość ciała', 'szerokość', 'Długość geograficzna'], [[20, 30, 18.5], [22, 31, 18.6]])[0].role.kind).toBe('variable');
    expect(run(['Körperlänge', 'Schalenbreite'], [[20, 30], [22, 31]]).map((x) => x.role.kind)).toEqual(['variable', 'variable']);
    expect(run(['longueur', 'largeur'], [[20, 30], [22, 31]]).map((x) => x.role.kind)).toEqual(['variable', 'variable']);
  });
});

describe('ambiguous words: whole names, values must agree', () => {
  it('"czas" with durations is not the time of day; with times of day it is', () => {
    expect(single('Czas', 45)).toBe('variable');
    expect(single('Czas', '45 min')).not.toBe('time');
    expect(single('Czas', '10:30')).toBe('time');
    expect(single('Zeit', 120)).toBe('variable');
    expect(single('Zeit', '14:05')).toBe('time');
    expect(single('Temps', 30)).toBe('variable');
    expect(single('Temps', '09:15')).toBe('time');
  });
  it('names that only start like a time or date word are not read: czas trwania, czasowy, Dauer, dataset, data source, dane', () => {
    for (const h of ['Czas trwania', 'czasowy', 'Dauer', 'Zeitraum', 'Zeitschritt', 'dataset', 'data source', 'Data source', 'dane', 'Datenquelle', 'datacja', 'godzinowa', 'Uhrzeitfehler', 'temps de séjour', 'Datumsformat']) {
      const k = single(h, 'abc');
      expect(['date', 'time', 'datetime'], h).not.toContain(k);
      const t = single(h, '10:30');
      expect(['date', 'time', 'datetime'], h).not.toContain(t);
    }
  });
  it('bare "data" needs date values: numeric or text data are not a date', () => {
    expect(single('Data', 5.2)).toBe('variable');
    expect(single('Data', 'ok')).not.toBe('date');
    expect(single('data', '12.05.2020')).toBe('date');
    expect(single('Data', '2020-05-12')).toBe('date');
  });
  it('"Datum" that is a plain number (a geodetic datum code) is not a date', () => {
    expect(single('Datum', 84)).toBe('variable');
    expect(single('Datum', '12.05.2020')).toBe('date');
  });
  it('German "Probe" is a low-confidence sample id (it can be a test); "Probennummer" is a sample id', () => {
    const p = run(['Probe', 'Temperatur'], [['P-1', 4.5], ['P-2', 4.6]]);
    expect(p[0].role.kind).toBe('sampleId');
    expect(p[0].confidence).toBe('low');
    const q = run(['Probennummer', 'Temperatur'], [['P-1', 4.5], ['P-2', 4.6]]);
    expect(q[0].confidence).toBe('high');
    expect(single('Probenahme', 'x')).not.toBe('sampleId');
    expect(single('Probenart', 'x')).not.toBe('sampleId');
  });
  it('French "station" is a station; "campagne" / "croisière" are cruises; "essai" is nothing', () => {
    expect(single('station', 'A1')).toBe('station');
    expect(single('campagne', 'C1')).toBe('cruise');
    expect(single('croisière', 'C1')).toBe('cruise');
    expect(single('Essai', 'E1')).not.toBe('sampleId');
  });
  it('depth words that are not the depth of the sample: bottom, site, Secchi, maximum', () => {
    for (const h of ['Głębokość dna', 'Głębokość stacji', 'Głębokość Secchi', 'Bodentiefe', 'Sichttiefe', 'Tiefe gesamt', 'Profondeur du fond', 'Profondeur Secchi', 'Profondeur maximale']) {
      expect(single(h, 12), h).not.toBe('depth');
    }
  });
});

describe('depth from / to', () => {
  const rows: Cell[][] = [[1, 5, 54.5, 18.5], [5, 10, 54.5, 18.5]];
  it.each([
    [['Głębokość od [m]', 'Głębokość do [m]'], 'od', 'do'],
    [['Tiefe von [m]', 'Tiefe bis [m]'], 'von', 'bis'],
    [['Profondeur de [m]', 'Profondeur à [m]'], 'de', 'à'],
  ])('%j: both are depth names, the start of the range wins the slot, the end gets an honest note', (hs) => {
    const p = run([...hs, 'Latitude', 'Longitude'], rows);
    expect(p[0].role.kind).toBe('depth');
    expect(p[1].role.kind).toBe('ignore');
    expect(p[1].confidence).toBe('low');
    expect(p[1].reason).toContain(`another column ("${hs[0]}") is used for depth`);
    expect(p[1].reason).toContain('other end of a depth range');
  });
  it('the start of the range wins even when the end stands to its left', () => {
    const p = run(['Głębokość do [m]', 'Głębokość od [m]'], rows);
    expect(p[1].role.kind).toBe('depth');
    expect(p[0].role.kind).toBe('ignore');
    expect(p[0].reason).toContain('other end of a depth range');
  });
  it('a plain depth column beats the bounds', () => {
    const p = run(['Głębokość od', 'Głębokość [m]', 'Głębokość do'], [[1, 3, 5], [5, 8, 10]]);
    expect(p.map((x) => x.role.kind)).toEqual(['ignore', 'depth', 'ignore']);
  });
});

describe('English headers keep their roles', () => {
  it('data / datum words are not touched in English sheets, long and width stay what they were', () => {
    expect(single('Data', 3)).toBe('variable');
    expect(single('length', 20)).toBe('variable');
    expect(single('width', 20)).toBe('variable');
    expect(single('Latitude', 54.5)).toBe('latitude');
    expect(single('Bottom depth', 20)).not.toBe('depth');
  });
});

describe('review round 1', () => {
  const body: Cell[][] = [[54.5, 18.5, 20, 10], [54.6, 18.7, 70, 35], [54.4, 18.4, 33, 22]];
  const noReason = (p: ColumnProposal[], h: string): void => {
    expect(p.find((x) => x.header === h)!.reason, h).not.toMatch(/another column/);
  };

  it('a bare word next to a real coordinate pair is a plain variable, never ignored (English and PL/DE pairs)', () => {
    for (const hs of [
      ['Latitude', 'Longitude', 'Długość', 'Szerokość'],
      ['Szerokość geograficzna', 'Długość geograficzna', 'Długość', 'Szerokość'],
      ['Breite [°N]', 'Länge [°E]', 'Länge', 'Breite'],
      ['Breitengrad', 'Längengrad', 'Länge', 'Breite'],
    ]) {
      const p = run(hs, body);
      expect(p.map((x) => x.role.kind), hs.join()).toEqual(['latitude', 'longitude', 'variable', 'variable']);
      noReason(p, hs[2]);
      noReason(p, hs[3]);
    }
  });

  it('noun-first partial and atmospheric pressure are not sea pressure, like English on main', () => {
    for (const h of ['Pression partielle CO2', 'pression partielle de CO2', 'ciśnienie parcjalne CO2', 'Partialdruck CO2', 'Luftdruck [hPa]', 'Ciśnienie atmosferyczne [hPa]', 'pression atmosphérique [hPa]', 'Atmospheric pressure [hPa]', 'Partial pressure CO2']) {
      expect(single(h, 1013), h).toBe('variable');
    }
    for (const h of ['Pression [dbar]', 'Ciśnienie', 'Druck', 'Pressure']) expect(single(h, 12), h).toBe('pressure');
  });

  it('"Datum" with text (a geodetic datum) is not a date; with dates it is, at high confidence', () => {
    expect(single('Datum', 'WGS84')).not.toBe('date');
    expect(single('Datum', 'ETRS89')).not.toBe('date');
    const p = run(['Datum', 'x'], [['2020-05-12', 1], ['2020-05-13', 2]]);
    expect(p[0].role.kind).toBe('date');
    expect(p[0].confidence).toBe('high');
  });

  it('body-size pairs of integers with no coordinates elsewhere stay variables; a decimal pair is a low-confidence position', () => {
    const ints: Cell[][] = [['Pomatoschistus', 45, 12, 3], ['Gobius', 70, 35, 9], ['Zosterisessor', 20, 10, 2]];
    for (const [a, b] of [['Długość', 'Szerokość'], ['Länge', 'Breite'], ['dł.', 'szer.']]) {
      expect(run(['Gatunek', a, b, 'Masa'], ints).map((x) => x.role.kind), a).toEqual(['ignore', 'variable', 'variable', 'variable']);
    }
    const dec = run(['Szerokość', 'Długość'], [[54.37, 18.62], [54.41, 18.7]]);
    expect(dec.map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
    expect(dec[0].confidence).toBe('low');
    // one integer-only column is enough to keep the pair out
    expect(run(['Szerokość', 'Długość'], [[54.37, 18], [54.41, 19]]).map((x) => x.role.kind)).toEqual(['variable', 'variable']);
  });

  it('the decimal guard does not touch bare words backed by degrees or a hemisphere letter', () => {
    for (const [h, k] of [['Szerokość [°N]', 'latitude'], ['Länge [°E]', 'longitude'], ['Breite N', 'latitude'], ['Länge O', 'longitude']] as const) {
      const p = run([h, 'x'], [[54, 1], [55, 2]]);
      expect(p[0].role.kind, h).toBe(k);
      expect(p[0].confidence, h).toBe('high');
    }
  });

  it('"Probe ID" / "Probe" / probe_id are low confidence; unambiguous German forms stay high', () => {
    for (const h of ['Probe ID', 'probe_id', 'Probe-ID', 'Probe']) {
      const p = run([h, 'T'], [['P-1', 4.5], ['P-2', 4.6]]);
      expect(p[0].role.kind, h).toBe('sampleId');
      expect(p[0].confidence, h).toBe('low');
    }
    for (const h of ['Probennummer', 'Proben-ID', 'Probe Nr.', 'Probenbezeichnung']) {
      const p = run([h, 'T'], [['P-1', 4.5], ['P-2', 4.6]]);
      expect(p[0].role.kind, h).toBe('sampleId');
      expect(p[0].confidence, h).toBe('high');
    }
  });

  it('the unit is read from before the from/to word: "Tiefe [m] von", and "Głębokość próbki od" keeps the range note', () => {
    const p = run(['Tiefe [m] von', 'Tiefe [m] bis'], [[1, 5], [5, 10]]);
    expect(p[0].role).toMatchObject({ kind: 'depth', unit: 'm', positive: 'down' });
    expect(p[1].reason).toContain('other end of a depth range');
    const q = run(['Głębokość próbki od', 'Głębokość próbki do'], [[1, 5], [5, 10]]);
    expect(q[0].role.kind).toBe('depth');
    expect(q[1].reason).toContain('other end of a depth range');
    expect(run(['Głębokość (m) od', 'x'], [[1, 5], [5, 10]])[0].role).toMatchObject({ kind: 'depth', unit: 'm' });
  });

  it('the real PL/DE/FR coordinate headers stay safe', () => {
    for (const [h, k] of [['Szer. geogr. [°N]', 'latitude'], ['Dł. geogr. [°E]', 'longitude'], ['Länge [°O]', 'longitude'], ['Breite N', 'latitude'], ['latitude nord', 'latitude'], ['Länge O', 'longitude']] as const) {
      expect(single(h, 20), h).toBe(k);
    }
    expect(single('Länge 0', 20)).toBe('variable');
  });
});

describe('review round 2', () => {
  it('pressure in PL/DE/FR is sea pressure only for the bare noun, a water or instrument qualifier, or a sea-pressure unit', () => {
    for (const h of [
      'Ciśnienie powietrza [hPa]', 'Ciśnienie barometryczne', 'Pression barométrique', 'Ciśnienie pary wodnej', 'Pression de vapeur',
      'Ciśnienie na poziomie morza [hPa]', 'Pression au niveau de la mer', "Pression de l'air [hPa]", 'Druck (Luft) [hPa]',
      'Ciśnienie CO2 [µatm]', 'Druck CO2', 'Ciśnienie [hPa]', 'Druck [mbar]', 'Pression [atm]', 'Ciśnienie [mmHg]', 'Druck [Torr]', 'Wasserdruck [hPa]',
      'Pression partielle CO2', 'ciśnienie parcjalne CO2', 'Partialdruck CO2', 'Luftdruck', 'Ciśnienie atmosferyczne',
    ]) expect(single(h, 1013), h).toBe('variable');
    for (const h of ['Ciśnienie [dbar]', 'Ciśnienie', 'Druck [dbar]', 'Wasserdruck', 'Pression (dbar)', 'Ciśnienie hydrostatyczne', 'Druck CTD', 'Pression', 'Druck', 'Pression hydrostatique', "Pression de l'eau", 'Ciśnienie wody', 'Ciśnienie [bar]']) {
      expect(single(h, 12), h).toBe('pressure');
    }
  });

  it('English pressure names are exactly as on main', () => {
    for (const h of ['Pressure [dbar]', 'PRES', 'Sea pressure', 'CTD pressure', 'Pressure', 'Press', 'Prs']) {
      expect(single(h, 12), h).toBe(h.toLowerCase().includes('pressure') && /^(sea|ctd)/i.test(h) ? 'variable' : 'pressure');
    }
    for (const h of ['Air pressure', 'Atmospheric pressure [hPa]', 'Partial pressure CO2']) expect(single(h, 1013), h).toBe('variable');
  });

  it('"DL" (a detection limit) is not a longitude, "dł." still is', () => {
    const p = run(['Latitude', 'DL'], [[54.37, 0.12], [54.41, 0.31]]);
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'variable']);
    const q = run(['Szerokość', 'Dł.'], [[54.37, 18.62], [54.41, 18.7]]);
    expect(q.map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
    expect(single('dl', 12.5)).toBe('variable');
  });
});

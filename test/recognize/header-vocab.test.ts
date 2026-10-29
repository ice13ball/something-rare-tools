// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Header words for /check: start and end of a tow, hemisphere letters, identifiers and abundance. The headers are those of a museum
// export (SIO Benthic Invertebrate Collection); every value here is invented.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;

/** Proposals for a sheet of the given columns (header -> values); the number of rows is that of the longest column. */
function propose(cols: Record<string, Cell[]>) {
  const header = Object.keys(cols);
  const n = Math.max(...Object.values(cols).map((v) => v.length));
  const rows = Array.from({ length: n }, (_, i) => header.map((h) => cols[h][i] ?? null));
  return proposeColumns(rawSheet(header, rows), CTX);
}
const roleOf = (cols: Record<string, Cell[]>, header: string) => propose(cols).find((p) => p.header === header)!;
const LAT = [32.7, 32.8, 33.1];
const LON = [-117.3, -117.2, -118.0];

describe('start and end of a tow', () => {
  it('the start latitude / longitude are the coordinates, in every spelling', () => {
    for (const [h, kind] of [
      ['Begin Latitude', 'latitude'], ['Begin Longitude', 'longitude'], ['Beg Lat', 'latitude'], ['Start_Lat', 'latitude'], ['Starting Longitude', 'longitude'],
      ['Initial Lat', 'latitude'], ['From Longitude', 'longitude'], ['Lat start', 'latitude'], ['Latitude (start)', 'latitude'], ['Longitude [start]', 'longitude'],
      ['BeginLat', 'latitude'], ['Start-Lon', 'longitude'], ['Szerokość początkowa'.replace('Szerokość', 'Szerokość geogr.'), 'latitude'],
      ['Pocz. długość geogr.', 'longitude'], ['Anfang Breitengrad', 'latitude'], ['Längengrad Start', 'longitude'], ['Latitude début', 'latitude'], ['Longitude Beginn', 'longitude'],
    ] as const) {
      const p = roleOf({ [h]: kind === 'latitude' ? LAT : LON, Other: [1.5, 2.5, 3.5] }, h);
      expect(p.role.kind, h).toBe(kind);
      expect(p.confidence, h).toBe('high');
    }
  });

  it('the end position is ignored with a reason when the start is there', () => {
    for (const [begin, end] of [['Begin Latitude', 'End Latitude'], ['Start Lat', 'Stop Lat'], ['Lat Start', 'Lat End'], ['Latitude (start)', 'Latitude (end)'], ['Beg Lat', 'Final Lat'], ['Lat From', 'Lat To'], ['Anfang Breitengrad', 'Ende Breitengrad'], ['Latitude début', 'Latitude fin']]) {
      const cols = { [end]: LAT, [begin]: LAT.map((x) => x + 0.1), Z: [1, 2, 3] };
      const e = roleOf(cols, end);
      expect(e.role.kind, end).toBe('ignore');
      expect(e.reasonCode, end).toBe('end-position');
      expect(roleOf(cols, begin).role.kind, begin).toBe('latitude');
    }
    const cols = { 'Begin Longitude': LON, 'End Longitude': LON, 'Begin Latitude': LAT, 'End Latitude': LAT };
    const p = propose(cols).map((x) => x.role.kind);
    expect(p).toEqual(['longitude', 'ignore', 'latitude', 'ignore']);
  });

  it('a sheet with ONLY end coordinates uses them, at low confidence and with a reason', () => {
    const p = propose({ 'End Latitude': LAT, 'End Longitude': LON });
    expect(p.map((x) => x.role.kind)).toEqual(['latitude', 'longitude']);
    for (const x of p) {
      expect(x.confidence).toBe('low');
      expect(x.reasonCode).toBe('end-position-only');
    }
  });

  it('words that are not a coordinate bound stay as they were', () => {
    expect(roleOf({ 'Begin Depth': [1, 2, 3], 'End Depth': [1, 2, 3] }, 'End Depth').role.kind).toBe('ignore');
    expect(roleOf({ 'Begin Depth': [1, 2, 3], 'End Depth': [2, 3, 4] }, 'Begin Depth').role.kind).toBe('depth');
    expect(roleOf({ 'Start date': ['2020-01-01', '2020-01-02'] }, 'Start date').role.kind).toBe('date');
    expect(roleOf({ Latitude: LAT, Longitude: LON }, 'Latitude').role.kind).toBe('latitude');
  });
});

describe('hemisphere columns', () => {
  it('"Lon Dir" and its relatives are never a coordinate (ignored, or paired as the hemisphere of one)', () => {
    for (const [h, v] of [['Lon Dir', ['E', 'W', 'W']], ['Lat Dir', ['N', 'S', 'N']], ['Beg Lat Dir', ['N', 'N', 'N']], ['End Lon Dir', ['W', 'W', 'W']], ['Longitude Direction', ['W', 'E', 'W']], ['Latitude hemisphere', ['north', 'south', 'north']], ['Lat NS', ['N', 'S', 'N']], ['Lon EW', ['E', 'W', 'E']], ['Hemisphere', ['N', 'S', 'N']], ['Längengrad Richtung'.replace('Richtung', 'Dir'), ['O', 'W', 'W']]] as const) {
      const p = roleOf({ [h]: [...v], Latitude: LAT, Longitude: LON }, h);
      expect(['ignore', 'hemisphere'], h).toContain(p.role.kind);
      expect(['hemisphere', 'hemisphere-pair', 'hemisphere-ambiguous'], h).toContain(p.reasonCode);
    }
  });

  it('values that are only hemisphere letters or words are not a coordinate, whatever the header says', () => {
    for (const v of [['N', 'S', 'n'], ['E', 'W'], ['north', 'South', ' N '], ['N', null, 'E', 'w'], ['N.', 'S.']]) {
      const p = roleOf({ Latitude: [...v], Longitude: LON }, 'Latitude');
      expect(p.role.kind).toBe('ignore');
      expect(p.reasonCode).toBe('hemisphere');
    }
    // a latitude with a letter among the numbers is still one
    expect(roleOf({ Latitude: [32.7, 'N', 33.1], Longitude: LON }, 'Latitude').role.kind).toBe('latitude');
  });

  it('a bare "Direction" is not a hemisphere (a wind direction is a number)', () => {
    expect(roleOf({ Direction: [10, 200, 350] }, 'Direction').reasonCode).not.toBe('hemisphere');
  });
});

describe('identifiers are not measurements', () => {
  const ID = [101, 102, 103];
  it('numeric columns named like an identifier are ignored', () => {
    for (const h of ['Catalog ID', 'Catalog #', 'Collection ID', 'Photo', 'Accession No.', 'Acc #', 'Voucher', 'GenBank', 'Genback No', 'Gen Bank #', 'Loan No', 'Gift', 'Image', 'Barcode', 'UUID', 'GUID', 'Record Number', 'Specimen No', 'Ref No', 'Catalogue Nr', '#', 'No.']) {
      const p = roleOf({ [h]: ID, Latitude: LAT }, h);
      expect(p.role.kind, h).toBe('ignore');
      expect(p.reasonCode, h).toBe('identifier');
    }
  });
  it('existing rules keep the names they have: station, sample, cruise', () => {
    expect(roleOf({ 'Station #': ID }, 'Station #').role.kind).toBe('station');
    expect(roleOf({ 'Sample ID': ID }, 'Sample ID').role.kind).toBe('sampleId');
    expect(roleOf({ 'Cruise ID': ID }, 'Cruise ID').role.kind).toBe('cruise');
  });
  it('real variables that contain such a word stay variables', () => {
    for (const h of ['Number of species', 'Ref temperature', 'Reference temperature', 'Temperature', 'Record temperature', 'Photo period']) {
      const p = roleOf({ [h]: [4.5, 5.5, 6.5] }, h);
      expect(p.role.kind, h).toBe('variable');
    }
  });
  it('a plain Depth or Temp column that happens to increase is not an identifier', () => {
    expect(roleOf({ Depth: [1, 2, 3, 4] }, 'Depth').role.kind).toBe('depth');
    expect(roleOf({ Temp: [1, 2, 3, 4] }, 'Temp').role.kind).toBe('variable');
  });
});

describe('abundance is not an environmental measurement', () => {
  const ABUNDANCE = ['Count', 'Counts', 'Abundance', 'Individuals', 'No. of specimens', 'Number of individuals', 'Liczba osobników', 'Anzahl', 'Abondance', "Nombre d'individus"];
  it('/check ignores them, with the abundance reason', () => {
    for (const h of ABUNDANCE) {
      const p = roleOf({ [h]: [1, 12, 3] }, h);
      expect(p.role.kind, h).toBe('ignore');
      expect(p.reasonCode, h).toBe('abundance');
    }
    // "many" and "fragment" among the numbers, as a museum writes them
    expect(roleOf({ Count: [1, 12, 'many', 'fragment'] }, 'Count').role.kind).toBe('ignore');
  });
  it('the converter still reads the names it read before as a quantity, and every other one exactly as before (no /check ignore)', () => {
    for (const h of ['Count', 'Counts', 'Abundance', 'Anzahl', 'Abondance', 'Liczba osobników', "Nombre d'individus"]) {
      const sheet = rawSheet(['Species', h], [['Alpha beta', 1], ['Gamma delta', 12]]);
      const q = proposeConvertColumns(sheet, CTX).find((p) => p.header === h)!;
      expect(q.role.kind, h).toBe('quantity');
    }
    for (const h of ['Individuals', 'No. of specimens', 'Number of individuals']) {
      const sheet = rawSheet(['Station', h], [['S1', 1], ['S2', 12]]);
      const q = proposeConvertColumns(sheet, CTX).find((p) => p.header === h)!;
      expect(q.reasonCode, h).not.toBe('abundance');
      expect(q.role.kind, h).not.toBe('ignore');
    }
  });
});

describe('the museum sheet (invented values, real column names)', () => {
  const cols: Record<string, Cell[]> = {
    'Catalog ID': [1001, 1002, 1003],
    'Catalog #': [2001, 2002, 2003],
    'Station #': [11, 12, 13],
    'Collection ID': [31, 32, 33],
    'Collection Date': ['2001-05-02', '2001-05-03', '2001-05-04'],
    'Collection Time': ['10:00', '11:30', '12:15'],
    'Begin Latitude': LAT,
    'Beg Lat Dir': ['N', 'N', 'N'],
    'Begin Longitude': LON,
    'Lon Dir': ['W', 'W', 'W'],
    'End Latitude': LAT.map((x) => x + 0.05),
    'End Longitude': LON.map((x) => x + 0.05),
    'End Lon Dir': ['W', 'W', 'W'],
    'Begin Depth': [100, 200, 300],
    'End Depth': [110, 210, 310],
    Count: [1, 12, 'many'],
    Photo: [5, 6, 7],
  };
  it('has the roles the acceptance criteria ask for', () => {
    const kinds = Object.fromEntries(propose(cols).map((p) => [p.header, p.role.kind]));
    expect(kinds).toMatchObject({
      'Catalog ID': 'ignore', 'Catalog #': 'ignore', 'Station #': 'station', 'Collection ID': 'ignore', 'Collection Date': 'date', 'Collection Time': 'time',
      'Begin Latitude': 'latitude', 'Beg Lat Dir': 'hemisphere', 'Begin Longitude': 'longitude', 'Lon Dir': 'ignore', // LON is signed here, so its letter column would only contradict it 'End Latitude': 'ignore', 'End Longitude': 'ignore',
      'End Lon Dir': 'ignore', 'Begin Depth': 'depth', 'End Depth': 'ignore', Count: 'ignore', Photo: 'ignore',
    });
  });
});

describe('review round: the values decide, not the header alone', () => {
  const LATV = [32.7, 32.8, 33.1];
  const LONV = [-117.3, -117.2, -118.0];
  it('a hemisphere-named header that holds NUMBERS stays a coordinate, high confidence, as before', () => {
    for (const [h, kind] of [
      ['Latitude N/S', 'latitude'], ['Longitude E/W', 'longitude'], ['Lat NS', 'latitude'], ['Lon EW', 'longitude'], ['Latitude hemisphere', 'latitude'],
      ['Lat dir', 'latitude'], ['Lon dir', 'longitude'], ['Long dir', 'longitude'], ['Lat Direction', 'latitude'],
    ] as const) {
      const p = roleOf({ [h]: kind === 'latitude' ? LATV : LONV, Other: [1.5, 2.5, 3.5] }, h);
      expect(p.role.kind, h).toBe(kind);
      expect(p.confidence, h).toBe('high');
    }
  });
  it('the same headers holding letters are hemispheres', () => {
    for (const h of ['Latitude N/S', 'Longitude E/W', 'Lat NS', 'Lon EW', 'Latitude hemisphere', 'Lat dir', 'Lon dir', 'Long dir']) {
      const p = roleOf({ [h]: ['N', 'S', 'E'], Other: [1.5, 2.5, 3.5] }, h);
      expect(p.reasonCode, h).toBe('hemisphere');
    }
  });
  it('a bare N:S or NS holding numbers is what it was (a variable), never a hemisphere', () => {
    for (const h of ['N:S', 'NS', 'N/S', 'EW', 'E/W']) {
      const p = roleOf({ [h]: [1.5, 2.5, 3.5] }, h);
      expect(p.role.kind, h).toBe('variable');
      expect(p.reasonCode, h).not.toBe('hemisphere');
    }
  });
});

describe('review round: "NO" is nitric oxide', () => {
  it('NO, NO [ppb], NO3 and NOx are variables; No., No, Nr. and Sample No are not', () => {
    for (const h of ['NO', 'NO [ppb]', 'NO3', 'NOx']) expect(roleOf({ [h]: [1.5, 2.5, 3.5] }, h).role.kind, h).toBe('variable');
    for (const h of ['No.', 'No', 'Nr.', 'Nr']) expect(roleOf({ [h]: [1, 2, 3] }, h).reasonCode, h).toBe('identifier');
    expect(roleOf({ 'Sample No': [1, 2, 3] }, 'Sample No').role.kind).toBe('sampleId');
  });
});

describe('review round: an abundance with a unit is a density or another measurement', () => {
  it('stays a variable', () => {
    for (const h of ['Abundance [ind/m2]', 'Abundance (cells/L)', 'Abundance [#/m3]', 'Abundance (%)', 'Individuals [ind/m2]', 'Count [cells/mL]', 'Counts [cps]']) {
      const p = roleOf({ [h]: [1.5, 12.5, 3.5] }, h);
      expect(p.role.kind, h).toBe('variable');
    }
  });
  it('a plain count unit leaves it an abundance', () => {
    for (const h of ['Count [n]', 'Abundance [ind]', 'Individuals [individuals]']) expect(roleOf({ [h]: [1, 12, 3] }, h).reasonCode, h).toBe('abundance');
  });
});

describe('review round: an end position ranks below every other reading of a position', () => {
  it('a P01 latitude code and a degrees-minutes column beat an end coordinate', () => {
    const p = propose({ 'End Latitude': LAT, ALATZZ01: LAT, Other: [1.5, 2.5, 3.5] });
    expect(p.find((x) => x.header === 'ALATZZ01')!.role.kind).toBe('latitude');
    expect(p.find((x) => x.header === 'End Latitude')!.role.kind).toBe('ignore');
    const q = propose({ 'End Latitude': LAT, Position: ['32°42.5′N', '32°43.5′N', '33°06.0′N'] });
    expect(q.find((x) => x.header === 'Position')!.role.kind).toBe('latitude');
    expect(q.find((x) => x.header === 'End Latitude')!.role.kind).toBe('ignore');
  });
  it('the reason names the column that is used', () => {
    const p = propose({ Latitude: LAT, 'End Latitude': LAT });
    expect(p[1].reasonCode).toBe('end-position');
    expect(p[1].reasonParams).toEqual({ name: 'Latitude' });
  });
});

describe('review round: Polish, German and French plain forms', () => {
  it('start and end words after a bare width / length word, when the values fit the axis', () => {
    for (const [h, kind] of [
      ['Szerokość początkowa', 'latitude'], ['Długość początkowa', 'longitude'], ['Breite Anfang', 'latitude'], ['Länge Anfang', 'longitude'],
      ['Szer. pocz.', 'latitude'], ['Dł. pocz.', 'longitude'], ['Latitude de début', 'latitude'],
    ] as const) {
      const p = roleOf({ [h]: kind === 'latitude' ? LAT : LON, Other: [1.5, 2.5, 3.5] }, h);
      expect(p.role.kind, h).toBe(kind);
    }
    for (const [begin, end] of [['Szerokość początkowa', 'Szerokość końcowa'], ['Długość początkowa', 'Długość końcowa'], ['Breite Anfang', 'Breite Ende'], ['Länge Anfang', 'Länge Ende'], ['Latitude de début', 'Latitude de fin']]) {
      const lon = /Dług|Länge/.test(begin);
      const v = lon ? LON : LAT;
      const p = propose({ [begin]: v, [end]: v });
      expect(p[0].role.kind, begin).toBe(lon ? 'longitude' : 'latitude');
      expect(p[1].reasonCode, end).toBe('end-position');
    }
    const only = roleOf({ 'Latitude de fin': LAT, Other: [1.5, 2.5, 3.5] }, 'Latitude de fin');
    expect(only.reasonCode).toBe('end-position-only');
  });
  it('a body length is no coordinate: whole numbers under a bare word with an end word stay a variable', () => {
    expect(roleOf({ 'Länge Ende': [120, 150, 90] }, 'Länge Ende').role.kind).toBe('variable');
  });
});

describe('the converter overlay reads the same words', () => {
  const sheet = rawSheet(
    ['Species', 'Count', 'Begin Latitude', 'End Latitude', 'Begin Longitude', 'End Longitude', 'Lon Dir', 'Catalog ID', 'Photo', 'NO'],
    [['Alpha beta', 1, 32.7, 32.8, -117.3, -117.2, 'W', 1001, 5, 1.5], ['Gamma delta', 12, 32.9, 33.0, -117.5, -117.4, 'W', 1002, 6, 2.5]],
  );
  const roles = (): Record<string, string> => Object.fromEntries(proposeConvertColumns(sheet, CTX).map((p) => [p.header, p.role.kind]));
  it('start coordinates are coordinates, end coordinates are ignored', () => {
    expect(roles()).toMatchObject({ 'Begin Latitude': 'latitude', 'Begin Longitude': 'longitude', 'End Latitude': 'ignore', 'End Longitude': 'ignore' });
  });
  it('hemisphere letters (by values) and identifiers are ignored; the abundance stays a quantity', () => {
    expect(roles()).toMatchObject({ 'Lon Dir': 'ignore', 'Catalog ID': 'ignore', Photo: 'ignore', Count: 'quantity', Species: 'taxon' });
  });
  it('a header that says Dir but holds numbers keeps its old reading; NO is no identifier', () => {
    const s = rawSheet(['Species', 'Lon dir', 'NO'], [['Alpha beta', -117.3, 1.5], ['Gamma delta', -117.2, 2.5]]);
    const r = Object.fromEntries(proposeConvertColumns(s, CTX).map((p) => [p.header, p.role.kind]));
    expect(r['Lon dir']).toBe('longitude');
    expect(r.NO).not.toBe('ignore');
  });
});

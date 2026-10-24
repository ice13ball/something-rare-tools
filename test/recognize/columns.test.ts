// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { proposeColumns, stripTypeSuffix, unitFromHeader } from '../../src/core/recognize/columns';
import { P01_HINTS, UNIT_VOCAB, normaliseUnit, unitDimension } from '../../src/core/recognize/vocab';
import type { ColumnProposal, ColumnRole } from '../../src/core/types';
import { dateCell, fixtureFile, rawSheet, textFile, xlsxFile } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
const props = (header: string[], rows: (string | number | null)[][], dateFormatted?: boolean[]): ColumnProposal[] =>
  proposeColumns(rawSheet(header, rows, 'S', dateFormatted), CTX);
const kinds = (p: ColumnProposal[]): string[] => p.map((x) => x.role.kind);
const variable = (r: ColumnRole) => {
  if (r.kind !== 'variable') throw new Error(`expected variable, got ${r.kind}`);
  return r;
};

describe('stripTypeSuffix', () => {
  it('removes the OPeNDAP type suffix and quotes, nothing else', () => {
    expect(stripTypeSuffix('Latitude<Float32>')).toBe('Latitude');
    expect(stripTypeSuffix('"Latitude<Float32>"')).toBe('Latitude');
    expect(stripTypeSuffix('Station name<String>')).toBe('Station name');
    expect(stripTypeSuffix('DIC [µmol/kg]<Float32>')).toBe('DIC [µmol/kg]');
    expect(stripTypeSuffix('a < b')).toBe('a < b');
  });
});

describe('unitFromHeader', () => {
  const cases: [string, string, string | undefined][] = [
    ['DIC_umol_kg', 'DIC', 'µmol/kg'],
    ['DIC (µmol L-1)', 'DIC', 'µmol/L'],
    ['DIC (umol L-1)', 'DIC', 'µmol/L'],
    ['DIC [µmol/kg]', 'DIC', 'µmol/kg'],
    ['AT [micromol/kg]', 'AT', 'µmol/kg'],
    ['DOC_mg_l', 'DOC', 'mg/L'],
    ['DOC_umol_l', 'DOC', 'µmol/L'],
    ['Na_mmol_L', 'Na', 'mmol/L'],
    ['O2_umol_l', 'O2', 'µmol/L'],
    ['NO3-[micro_mol_L-1]<Float32>', 'NO3-', 'µmol/L'],
    ['Sr2+[mili_gram_L-1]<Float32>', 'Sr2+', 'mg/L'],
    ['Cl-_mg_l', 'Cl-', 'mg/L'],
    ['DIC umol/kg', 'DIC', 'µmol/kg'],
    ['Depth_m', 'Depth', 'm'],
    ['Depth[m]<Float32>', 'Depth', 'm'],
    ['Depth (cm)', 'Depth', 'cm'],
    ['Core_Depth[cm]<Float32>', 'Core_Depth', 'cm'],
    ['Pressure_(db)<Float32>', 'Pressure', 'dbar'],
    ['Temperature_[deg._C]<Float32>', 'Temperature', '°C'],
    ['T (°C)', 'T', '°C'],
    ['TEMP_C', 'TEMP', '°C'],
    ['temp_degC', 'temp', '°C'],
    ['T_degC', 'T', '°C'],
    ['Sal_psu', 'Sal', 'PSU'],
    ['Width_cm', 'Width', 'cm'],
    ['Temperature [C]', 'Temperature', '°C'],
    ['Chl a [µg/l]', 'Chl a', 'µg/L'],
    ['Density (kg m-3)', 'Density', 'kg m-3'],
    ['GPP C [mg/m**2/day]', 'GPP C', 'mg/m**2/day'],
    ['Elevation [m a.s.l.]', 'Elevation', 'm a.s.l.'],
    ['Sample ID (ID given by the provider ...)', 'Sample ID', undefined],
    ['[HPO4]2- [µmol/l] (Soluble reactive phosphorus c...)', '[HPO4]2-', 'µmol/L'],
    ['[NO3]- + [NO2]-', '[NO3]- + [NO2]-', undefined],
    ['[NH4]+ [µmol/l]', '[NH4]+', 'µmol/L'],
    ['pH (at 25ºC)', 'pH (at 25ºC)', undefined],
    ['Salinity', 'Salinity', undefined],
    ['Station_ID', 'Station_ID', undefined],
    ['NH4umoll_L', 'NH4umoll_L', undefined],
  ];
  for (const [header, name, unit] of cases) {
    it(`${header} -> ${name} / ${unit ?? 'no unit'}`, () => {
      const r = unitFromHeader(header);
      expect(r.name).toBe(name);
      expect(r.unit).toBe(unit);
    });
  }

  it('keeps the unit text as written when it is not in the vocabulary, and the text of a time zone marker', () => {
    expect(unitFromHeader('Time [UTC]')).toMatchObject({ name: 'Time', unit: 'UTC', unitText: 'UTC' });
    expect(unitFromHeader('Foo [furlongs]').unit).toBe('furlongs');
  });
});

describe('UNIT_VOCAB', () => {
  it('carries the P06 code and concept URL of every entry', () => {
    for (const u of UNIT_VOCAB) expect(u.url).toBe(`https://vocab.nerc.ac.uk/collection/P06/current/${u.p06}/`);
    const by = Object.fromEntries(UNIT_VOCAB.map((u) => [u.label, u.p06]));
    expect(by).toMatchObject({ 'µmol/L': 'UPOX', 'µmol/kg': 'KGUM', 'mg/L': 'UMGL', '°C': 'UPAA', dbar: 'UPDB', m: 'ULAA', dimensionless: 'UUUU', PSU: 'PSUX', 'pH units': 'UUPH', 'nmol/L': 'UPNM' });
  });
  it('normalises notations and derives dimensions', () => {
    expect(normaliseUnit('umol/l')).toBe('µmol/L');
    expect(normaliseUnit('µmol kg-1')).toBe('µmol/kg');
    expect(normaliseUnit('mol/L')).toBe('mol/L');
    expect(normaliseUnit('furlong')).toBeUndefined();
    expect(unitDimension('µmol/L')).toBe('amount/volume');
    expect(unitDimension('µmol/kg')).toBe('amount/mass');
    expect(unitDimension('mg/L')).toBe('mass/volume');
    expect(unitDimension('mmol/L')).toBe('amount/volume');
    expect(unitDimension('°C')).toBe('temperature');
  });
  it('every P01 hint has its concept URL and only units that exist in the table', () => {
    const labels = new Set(UNIT_VOCAB.map((u) => u.label));
    for (const [code, h] of Object.entries(P01_HINTS)) {
      expect(h.url).toBe(`https://vocab.nerc.ac.uk/collection/P01/current/${code}/`);
      if (h.unit !== undefined) expect(labels.has(h.unit)).toBe(true);
    }
  });
});

describe('proposeColumns: names', () => {
  it('OPeNDAP header: role latitude, cleanHeader without the suffix, header untouched', () => {
    const p = props(['"Latitude<Float32>"', 'Longitude<Float32>'], [['77.1', '16.5']]);
    expect(p[0]).toMatchObject({ index: 0, header: '"Latitude<Float32>"', cleanHeader: 'Latitude', role: { kind: 'latitude' }, confidence: 'high' });
    expect(p[1].role.kind).toBe('longitude');
  });

  it('DIC_umol_kg and DIC (µmol L-1) are DIC with the unit from the header', () => {
    const p = props(['DIC_umol_kg', 'DIC (µmol L-1)'], [['2100', '2000']]);
    expect(variable(p[0].role)).toMatchObject({ variable: 'DIC', unit: 'µmol/kg', unitSource: 'header' });
    expect(variable(p[1].role)).toMatchObject({ variable: 'DIC', unit: 'µmol/L', unitSource: 'header' });
  });

  it('unit spellings: µ vs u, L-1, /L, _l, kg-1, /kg', () => {
    const p = props(['a_umol_l', 'b (µmol L-1)', 'c [umol/L]', 'd_mg_l', 'e [µmol kg-1]', 'f_umol_kg', 'g_mmol_L'], [['1', '1', '1', '1', '1', '1', '1']]);
    expect(p.map((x) => variable(x.role).unit)).toEqual(['µmol/L', 'µmol/L', 'µmol/L', 'mg/L', 'µmol/kg', 'µmol/kg', 'mmol/L']);
  });

  it('an unknown unit is kept as written and a missing one stays undefined', () => {
    const p = props(['GPP C [mg/m**2/day]', 'Salinity', 'Foo'], [['5', '33', '1']]);
    expect(variable(p[0].role).unit).toBe('mg/m**2/day');
    expect(variable(p[1].role)).toMatchObject({ variable: 'salinity' });
    expect(variable(p[1].role).unit).toBeUndefined();
    expect(variable(p[2].role)).toMatchObject({ variable: 'Foo' });
    expect(p[2].confidence).toBe('low');
  });

  it('assigns only one latitude and one longitude, preferring the exact name', () => {
    const p = props(['Lat_start', 'Latitude', 'lat_dec', 'Lon_start', 'Long', 'Longitude'], [['1', '2', '3', '4', '5', '6']]);
    expect(p.filter((x) => x.role.kind === 'latitude').map((x) => x.header)).toEqual(['Latitude']);
    expect(p.filter((x) => x.role.kind === 'longitude').map((x) => x.header)).toEqual(['Long']);
    expect(p[0].role.kind).toBe('ignore');
  });

  it('lat / Lat / LAT / lat_dec / Latitude [degrees_north] are all latitude', () => {
    for (const h of ['lat', 'Lat', 'LAT', 'lat_dec', 'Latitude [degrees_north]', 'Latitud', 'Latitute']) {
      expect(props([h], [['70.1']])[0].role.kind).toBe('latitude');
    }
    for (const h of ['lon', 'Long', 'LON', 'lon_dec', 'Longitude [degrees_east]', 'Longitud']) {
      expect(props([h], [['10.1']])[0].role.kind).toBe('longitude');
    }
  });

  it('a column named lon whose values look like latitudes is still longitude (recognition does not fix data)', () => {
    const p = props(['lat', 'lon'], [['76.9', '76.9'], ['76.9', '76.9']]);
    expect(kinds(p)).toEqual(['latitude', 'longitude']);
  });

  it('station, cruise, sample / core identifiers', () => {
    for (const h of ['Station', 'Station_ID', 'Site', 'Site_ID', 'St.', 'Event', 'Label', 'Station name']) {
      expect(props([h], [['ST1']])[0].role.kind, h).toBe('station');
    }
    for (const h of ['Cruise', 'Cruise-ID', 'Expedition', 'Campaign']) expect(props([h], [['A1']])[0].role.kind, h).toBe('cruise');
    for (const h of ['core_ID', 'Sample', 'Sample ID', 'Core', 'Sample_ID']) expect(props([h], [['c1']])[0].role.kind, h).toBe('sampleId');
  });

  it('prefers Station over Event when both are present, and keeps one station column', () => {
    const p = props(['Event', 'Station'], [['E1', 'S1']]);
    expect(kinds(p)).toEqual(['ignore', 'station']);
  });

  it('depth: header unit and sign convention come from the header and the values', () => {
    const p = props(['Depth_m', 'Depth water [m]', 'Depth [cm]'], [['1', '2', '3']]);
    expect(p[0].role).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    // only one depth column is used
    expect(p[1].role.kind).toBe('ignore');
    expect(props(['Depth [cm]'], [['0.5'], ['1.5']])[0].role).toEqual({ kind: 'depth', positive: 'down', unit: 'cm' });
  });

  it('negative depth values mean positive up; elevation is positive up; no values is unknown; no unit stays no unit', () => {
    expect(props(['Depth'], [['-5'], ['-15']])[0].role).toEqual({ kind: 'depth', positive: 'up' });
    expect(props(['Elevation [m a.s.l.]'], [['120']])[0].role).toEqual({ kind: 'depth', positive: 'up', unit: 'm a.s.l.' });
    expect(props(['Depth'], [[null]])[0].role).toEqual({ kind: 'depth', positive: 'unknown' });
  });

  it('a site (bottom) depth is not the sample depth', () => {
    const p = props(['Water_site_depth_m', 'Depth of the station (m)', 'Depth_m', 'Bottom depth [m]'], [['124', '124', '2.5', '90']]);
    expect(kinds(p)).toEqual(['variable', 'variable', 'depth', 'variable']);
    expect(variable(p[0].role)).toMatchObject({ variable: 'Water_site_depth', unit: 'm' });
  });

  it('depth beats elevation when both exist', () => {
    const p = props(['Elevation [m a.s.l.]', 'Depth water [m]'], [['', '5']]);
    expect(kinds(p)).toEqual(['ignore', 'depth']);
  });

  it('pressure has its own role, with the unit from the header', () => {
    const p = props(['Pressure [dbar]', 'Pressure_(db)', 'Pressure'], [['5', '5.1', '5.2']]);
    expect(p[0].role).toEqual({ kind: 'pressure', unit: 'dbar' });
    expect(p[1].role).toEqual({ kind: 'pressure', unit: 'dbar' });
    expect(p[2].role).toEqual({ kind: 'pressure' });
  });

  it('Date and Time columns are separate roles; Date/Time is one datetime column', () => {
    expect(kinds(props(['Date', 'Time [UTC]'], [['2021-07-25', '10:07']]))).toEqual(['date', 'time']);
    expect(kinds(props(['Date/Time'], [['2021-07-25']]))).toEqual(['datetime']);
    expect(kinds(props(['Date', 'Time'], [['2021-07-25T10:07:00Z', '10:07']]))).toEqual(['datetime', 'time']);
  });

  it('canonical variables: ions, nutrients, carbonate system', () => {
    const names = ['Cl-_mg_l', 'Na+', 'NH4+', 'HPO4-[micro_mol_L-1]', 'SiO2[micro_mol_L-1]', 'NO3-_plus_NO2-[micro_mol_L-1]', 'PO₄³⁻(µmol L-1)', 'NO₃⁻ (µmol L-1)', 'AT [micromol/kg]', 'S', 'T (°C)', 'O2 (µmol L-1)', 'pH (at 25ºC)', 'Si (µmol L-1)'];
    const p = props(names, [names.map(() => '1')]);
    expect(p.map((x) => variable(x.role).variable)).toEqual(['chloride', 'sodium', 'ammonium', 'phosphate', 'silicate', 'nitrate+nitrite', 'phosphate', 'nitrate', 'TA', 'salinity', 'temperature', 'oxygen', 'pH', 'silicate']);
    expect(variable(p[12].role).unit).toBeUndefined(); // "at 25ºC" is a remark, not a unit
  });

  it('PANGAEA headers: quality flags and text columns are ignored, descriptors dropped', () => {
    const header = ['Sample ID (ID given by the provider ...)', 'Date/Time', 'DOC [µmol/l]', 'QF DOC', 'Analyt method (Method used for the DOC ...)', 'PI (Name of the person in charge ...)'];
    const p = props(header, [['M1', '2017-04-15', '118.00', '2', 'Method X', 'Somebody']]);
    expect(kinds(p)).toEqual(['sampleId', 'datetime', 'variable', 'ignore', 'ignore', 'ignore']);
    expect(variable(p[2].role)).toMatchObject({ variable: 'DOC', unit: 'µmol/L' });
  });
});

describe('proposeColumns: values', () => {
  it('a text column named Longitude with degrees + decimal minutes is longitude', () => {
    const f = textFile('dm.csv', "Site,Longitude,Latitude\nST1,12° 34.567',54° 21.500'\nST2,12° 36.250',54° 01.500'\n");
    const p = proposeColumns(f.sheets[0], CTX);
    expect(kinds(p)).toEqual(['station', 'longitude', 'latitude']);
  });

  it('an unnamed degrees-and-minutes column is recognised from its hemisphere letters, with low confidence', () => {
    const p = props(['x', 'y'], [["12°34.567'E", "54°21.500'N"], ["12°36.250'E", "54°01.500'N"]]);
    expect(kinds(p)).toEqual(['longitude', 'latitude']);
    expect(p[0].confidence).toBe('low');
  });

  it('a mostly non-numeric text column is ignored; a numeric column with a few stray tokens is a variable', () => {
    const rows: (string | number | null)[][] = [];
    for (let i = 0; i < 20; i++) rows.push([`comment ${i}`, i === 5 ? '/..4' : String(i), 'ok']);
    const p = props(['Remarks', 'NH4_umol_l', 'Method'], rows);
    expect(kinds(p)).toEqual(['ignore', 'variable', 'ignore']);
  });

  it('a column of all empty cells is ignored', () => {
    expect(props(['Event 2'], [[''], [null]])[0].role.kind).toBe('ignore');
  });

  it('date-formatted xlsx numbers are a date whatever the header says; plain numbers are not', () => {
    const f = xlsxFile('d.xlsx', { S: [['when', 'n'], [dateCell(44402), 5], [dateCell(44403), 6]] });
    const p = proposeColumns(f.sheets[0], CTX);
    expect(p[0].role.kind).toBe('date');
    expect(p[1].role.kind).toBe('variable');
  });

  it('a column of ISO dates under an unknown name is a date, low confidence', () => {
    const p = props(['sampled'], [['2021-07-25'], ['2021-07-26']]);
    expect(p[0].role.kind).toBe('date');
    expect(p[0].confidence).toBe('low');
  });

  it('long format: the parameter, unit and value columns are marked as read through the layout', () => {
    const sheet = rawSheet(['sample', 'parameter', 'unit', 'value'], [['a', 'DIC', 'umol', '1'], ['a', 'TA', 'umol', '2']]);
    const p = proposeColumns(sheet, { ...CTX, long: { parameterCol: 1, unitCol: 2, valueCol: 3 } });
    expect(kinds(p)).toEqual(['sampleId', 'ignore', 'ignore', 'ignore']);
  });

  it('a decimal-comma sheet is numeric with decimalComma', () => {
    const sheet = rawSheet(['DIC_umol_kg'], [['2100,5'], ['2101,5']]);
    expect(proposeColumns(sheet, { decimalComma: true, date1904: false })[0].role.kind).toBe('variable');
  });
});

describe('proposeColumns: NERC P01 codes', () => {
  it('a header that is only a P01 code with a type suffix is recognised; units only where the P01 concept fixes one', () => {
    const f = fixtureFile('layout-opendap-p01.csv');
    const p = proposeColumns(f.sheets[0], { decimalComma: f.decimalComma, date1904: f.date1904 });
    expect(p[2].role.kind).toBe('datetime');
    expect(p[3].role).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    expect(p[4].role).toEqual({ kind: 'variable', variable: 'DIC', unit: 'µmol/kg', unitSource: 'p01', p01: 'TCO2KG02' });
    expect(p[5].role).toEqual({ kind: 'variable', variable: 'temperature', unit: '°C', unitSource: 'p01', p01: 'TEMPPR01' });
    expect(p[6].role).toEqual({ kind: 'variable', variable: 'salinity', unit: 'dimensionless', unitSource: 'p01', p01: 'PSALST01' });
    // an 8-character upper-case code that is not in the table: a variable of that name, no unit, no claim
    expect(p[7].role).toEqual({ kind: 'variable', variable: 'XYZW9999' });
    expect(p[7].confidence).toBe('low');
  });

  it('P01 latitude / longitude / depth / pressure codes', () => {
    const p = props(['ALATZZ01', 'ALONZZ01', 'ADEPZZ01', 'SDN:P01::PRESPR01'], [['70', '10', '5', '5.1']]);
    expect(p[0].role.kind).toBe('latitude');
    expect(p[1].role.kind).toBe('longitude');
    expect(p[2].role).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    expect(p[3].role).toEqual({ kind: 'pressure', unit: 'dbar' });
  });

  it('a header unit wins over the P01 unit', () => {
    const p = props(['SDN:P01::TCO2KG02 [mmol/kg]'], [['2']]);
    expect(variable(p[0].role).unitSource).toBe('header');
  });

  it('the 9-character look-alike SDN:P01::D13CMOP11 is not a P01 code and claims none', () => {
    const p = props(['SDN:P01::D13CMOP11'], [['-22.3']]);
    expect(p[0].role).toEqual({ kind: 'variable', variable: 'SDN:P01::D13CMOP11' });
  });
});

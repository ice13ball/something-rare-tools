// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Review round 1 of the units row: first data rows made of text that look like units must stay data; the word list is tested directly, not through the numeric check that masked it. Every value is invented.
import { describe, expect, it, vi } from 'vitest';
import { VALUE_SHAPE_MAX, foldUnitsRow, valueShaped } from '../../src/core/parse/shared';
import { unitCellKind } from '../../src/core/parse/unitWords';
import { textFile, xlsxFile } from '../helpers/files';

// cells that are labels, codes, missing-value tokens or schema words: never a unit
const NOT_UNITS = [
  'S1', 'G1', 'Stn1', 'H', 'M', 'L', 'NS', 'PM', 'N/D', 'n/d', 'n/m', 'nm', 'ns', 'nd', 'n.a.', 'NA', 'NaN', 'null', 'none', '-', '--', '1', '1 to 20', 'Sample 1', 'Core 1', 'Day 3', '0 m', '10 cm',
  'Core sample', 'Volume', 'Sample', 'Core', 'Area', 'Cell count', 'Area count', 'day', 'month', 'year', 'Gobiidae', 'Gadus morhua',
];
// cells that are units, as the real files write them
const UNITS = [
  'm', 'cm', 'mm', 'km', 'g', 'mg', 'kg', 'ml', 'mL', 'degC', 'degF', 'PSU', 'psu', 'count', 'Count', 'individuals', 'centimeters', 'centimeters^2', 'microns', 'feet', 'cm', 'celsius', 'fahrenheit',
  'degrees_north', 'degrees_east', 'cubic metres', 'cubic metres (m^3)', 'number/net', 'number per cubic metres (n/1000 m^3)', 'nanomoles per liter (nmol/L)', 'larvae per milliliter',
  'eggs per milliliter', 'n/m²', 'm s-1', 'ind/km2', 'umol/kg', 'mg/L', 'fish per tow', 'parts per million (ppm)',
];

describe('unitCellKind, tested directly', () => {
  it.each(NOT_UNITS)('%s is not a unit', (cell) => expect(unitCellKind(cell)).toBeUndefined());
  it.each(UNITS)('%s is a unit', (cell) => expect(unitCellKind(cell)).toBe('unit'));
  it('UTC is the zone label, unitless / text / code / integer are neutral', () => {
    expect(unitCellKind('UTC')).toBe('utc');
    for (const c of ['unitless', 'text', 'code', 'integer', 'ddd.d']) expect(unitCellKind(c), c).toBe('neutral');
  });
});

// first rows of invented text sheets: none of them is a units row, none loses its row
const TEXT_SHEETS: [string, string][] = [
  ["r1a_S1_ND", "station,temp,sal,oxy\nS1,N/D,N/D,N/D\nS2,4.5,35.1,210\nS3,5.5,35.2,220\nS4,6.5,35.3,230\n"],
  ["r1b_S1_nm", "station,lat,lon,temp,sal\nS1,nm,nm,nm,nm\nS2,54.1,7.9,4.5,35.1\nS3,54.2,7.8,5.5,35.2\nS4,54.3,7.7,6.5,35.3\n"],
  ["r1c_blank_id_ns", "station,temp,sal,oxy\n,ns,ns,ns\n2,4.5,35.1,210\n3,5.5,35.2,220\n4,6.5,35.3,230\n"],
  ["r1d_numbered_id_nm", "id,temp,sal,oxy\n1,nm,nm,nm\n2,4.5,35.1,210\n3,5.5,35.2,220\n"],
  ["r2a_HML_species", "Gadus morhua,Clupea harengus,Sprattus sprattus\nH,M,L\n2,3,1\n4,5,0\n1,1,2\n"],
  ["r2b_station_numbered_HML", "Station,Gadus morhua,Clupea harengus\nM,H,L\n2,3,1\n3,5,0\n4,1,2\n"],
  ["r2c_grabs_row2", "Taxon,Stn1,Stn1,Stn1,Stn2,Stn2\n,G1,G2,G3,G1,G2\nGadus morhua,1,0,3,4,2\nClupea harengus,5,1,0,2,2\nSprattus sprattus,2,2,2,0,1\n"],
  ["r2d_S1S2S3_row2", "Taxon,St,St,St\n,S1,S2,S3\nGadus morhua,1,0,3\nClupea harengus,5,1,0\nSprattus sprattus,2,2,2\n"],
  ["r2e_sample_labels", "Taxon,Reef A,Reef B,Reef C\n,Sample 1,Sample 2,Sample 3\nGadus morhua,1,0,3\nClupea harengus,5,1,0\n"],
  ["r2f_depth_labels", "Taxon,Station A,Station A,Station A\n,0 m,5 m,10 m\nGadus morhua,1,0,3\nClupea harengus,5,1,0\nSprattus sprattus,2,2,2\n"],
  ["r2g_core_labels", "Taxon,A,B,C\n,Core 1,Core 2,Core 3\nGadus morhua,1,0,3\nClupea harengus,5,1,0\n"],
  ["r3a_schema_text_integer", "species,code,n,mass,len\ntext,code,integer,g,cm\nGadus morhua,G1,4,12.5,30\nClupea harengus,C1,5,13.5,31\n"],
  ["r3b_schema_only_types", "name,age,n\ntext,integer,integer\nBob,3,4\nTim,5,6\n"],
  ["r3c_type_row_first_data", "name,kind,n,m\ntext,code,,\nGadus,x,1,2\nClupea,y,3,4\n"],
  ["r4a_method_over_text", "method,gear,depth,count\ncore,tow,,\ncore,tow,5,3\ngrab,net,6,4\ncore,net,7,5\n"],
  ["r4b_method_some_numeric", "method,gear,vol,n\ncore,tow,volume,count\ncore,tow,3.5,5\ngrab,net,4.5,6\ncore,net,5.5,7\n"],
  ["r4c_method_row_over_numbers", "site,method,replicate,count,area\nA,core,1,3,0.5\nA,core,2,4,0.5\n"],
  ["r4d_all_labels", "method,replicate,count,area\nCore,Sample,Count,Area\n1,1,3,0.5\n2,1,4,0.5\n3,2,5,0.5\n"],
  ["r4e_generic_header_real_names", "Column1,Column2,Column3,Column4\nSample,Core,Count,Volume\n1,1,3,0.5\n2,1,4,0.5\n3,2,5,0.5\n"],
  ["r4f_datesplit", "Date,Date,Date,lat,lon,count\nday,month,year,degree,degree,number\n12,3,2001,54.1,7.9,5\n13,3,2001,54.2,7.8,6\n14,3,2001,54.3,7.7,7\n"],
  ["r4g_fish_per_tow", "station,catch,effort\nS1,fish per tow,one per tow\n1,3,5\n2,4,6\n3,5,7\n"],
  ["r4h_cell_count", "sample,cells,area,day\nCell count,Cell count,Area count,Day 1\n1,3,5,1\n2,4,6,2\n3,5,7,3\n"],
  ["r4i_method_named_in_sample", "Sample,Depth,T,S\nCore sample,5 m,,\n1,5,4.5,35\n2,6,4.6,35\n3,7,4.7,35\n"]
];
// r3a is the one exception: g and cm are units, text / code / integer stand beside them
describe('a first data row made of text stays data', () => {
  it.each(TEXT_SHEETS.filter(([n]) => !n.startsWith('r3a')))('%s', (name, text) => {
    const f = textFile(`${name}.csv`, text);
    expect(f.sheets[0].unitsRowLine, name).toBeUndefined();
    expect(f.findings.map((x) => x.ruleId), name).not.toContain('IN-HEADER-UNITS-READ');
    expect(f.sheets[0].rows.length, name).toBe(text.trim().split('\n').length - 1);
  });
  it('S1 over numbers is data, not a unit', () => {
    const f = textFile('s1.csv', 'a,b,c\nS1,G1,H\n1,2,3\n4,5,6\n');
    expect(f.sheets[0].rows).toHaveLength(3);
    expect(f.sheets[0].header).toEqual(['a', 'b', 'c']);
  });
  it('a schema row with two real units folds those and leaves the type words alone', () => {
    const f = textFile('r3a.csv', TEXT_SHEETS.find(([n]) => n.startsWith('r3a'))![1]);
    expect(f.sheets[0].header).toEqual(['species', 'code', 'n', 'mass [g]', 'len [cm]']);
  });
});

describe('a header that names a unit in any form: a disagreeing cell means no fold, an agreeing one keeps the header', () => {
  const UNIT_ROW = (last: string, third = 'm') => `,UTC,degrees_north,degrees_east,${third},${last}`;
  const sheet = (cols: [string, string], rowUnits: [string, string]) =>
    textFile('d.csv', [`station,time,latitude,longitude,${cols[0]},${cols[1]}`, `,UTC,degrees_north,degrees_east,${rowUnits[0]},${rowUnits[1]}`, 'S1,2001-03-04T05:00:00Z,54.5,7.5,5,4.5', 'S2,2001-03-04T05:00:00Z,54.5,7.5,15,5.5', 'S3,2001-03-04T05:00:00Z,54.5,7.5,25,6.5'].join('\n')).sheets[0];
  void UNIT_ROW;
  it.each([
    ['depth_ft over m', ['depth_ft', 'temp'], ['m', 'degC']],
    ['depth_m over feet', ['depth_m', 'temp'], ['feet', 'degC']],
    ['temp_c over degF', ['depth', 'temp_c'], ['m', 'degF']],
    ['Temp [deg C] (CTD) over fahrenheit', ['depth', 'Temp [deg C] (CTD)'], ['m', 'fahrenheit']],
    ['Tiefe [m] von over ft', ['Tiefe [m] von', 'temp'], ['ft', 'degC']],
    ['depth [m] over ft', ['depth [m]', 'temp'], ['ft', 'degC']],
  ] as [string, [string, string], [string, string]][])('%s: nothing is folded', (_n, cols, units) => {
    const s = sheet(cols, units);
    expect(s.unitsRowLine).toBeUndefined();
    expect(s.header.slice(4)).toEqual(cols);
    expect(s.rows).toHaveLength(4);
  });

  it.each([
    ['depth_ft over feet', ['depth_ft', 'temp'], ['feet', 'degC'], ['depth_ft', 'temp [degC]']],
    ['depth_m over m', ['depth_m', 'temp'], ['m', 'degC'], ['depth_m', 'temp [degC]']],
    ['Temp [deg C] (CTD) over degC: no second bracket', ['depth', 'Temp [deg C] (CTD)'], ['m', 'degC'], ['depth [m]', 'Temp [deg C] (CTD)']],
    ['Tiefe [m] von over m', ['Tiefe [m] von', 'temp'], ['m', 'degC'], ['Tiefe [m] von', 'temp [degC]']],
  ] as [string, [string, string], [string, string], [string, string]][])('%s: the header keeps its own unit', (_n, cols, units, expected) => {
    const s = sheet(cols, units);
    expect(s.unitsRowLine).toBe(2);
    expect(s.header.slice(4)).toEqual(expected);
  });

  it('degF is a unit', () => expect(unitCellKind('degF')).toBe('unit'));
});

describe('units and statistic labels in either order', () => {
  const body = ['S1,4.5,0.2,12.5,1.1', 'S2,4.7,0.3,13.5,1.4', 'S3,5.1,0.1,11.5,0.9'];
  const WANT = ['Sample', 'T mean [degC]', 'T st.dev. [degC]', 'OM mean [%]', 'OM st.dev. [%]'];
  it('csv: header, units, statistics', () => {
    const f = textFile('o1.csv', ['Sample,T,T,OM,OM', ',degC,degC,%,%', ',mean,st.dev.,mean,st.dev.', ...body].join('\n'));
    expect(f.sheets[0].header).toEqual(WANT);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([4, 5, 6]);
    expect(f.sheets[0].unitsRowLine).toBe(2);
    expect(f.sheets[0].subHeaderLine).toBe(3);
  });
  it('csv: header, statistics, units', () => {
    const f = textFile('o2.csv', ['Sample,T,T,OM,OM', ',mean,st.dev.,mean,st.dev.', ',degC,degC,%,%', ...body].join('\n'));
    expect(f.sheets[0].header).toEqual(['Sample', 'T mean', 'T st.dev.', 'OM mean', 'OM st.dev.'].map((h, i) => (i === 0 ? h : `${h} [${i < 3 ? 'degC' : '%'}]`)));
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([4, 5, 6]);
  });
  it('xlsx: header, units, statistics', () => {
    const f = xlsxFile('o1.xlsx', { S: [['Sample', 'T', 'T', 'OM', 'OM'], [null, 'degC', 'degC', '%', '%'], [null, 'mean', 'st.dev.', 'mean', 'st.dev.'], ['S1', 4.5, 0.2, 12.5, 1.1], ['S2', 4.7, 0.3, 13.5, 1.4], ['S3', 5.1, 0.1, 11.5, 0.9]] });
    expect(f.sheets[0].header).toEqual(WANT);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([4, 5, 6]);
  });
  it('xlsx: header, statistics, units', () => {
    const f = xlsxFile('o2.xlsx', { S: [['Sample', 'T', 'T', 'OM', 'OM'], [null, 'mean', 'st.dev.', 'mean', 'st.dev.'], [null, 'degC', 'degC', '%', '%'], ['S1', 4.5, 0.2, 12.5, 1.1], ['S2', 4.7, 0.3, 13.5, 1.4], ['S3', 5.1, 0.1, 11.5, 0.9]] });
    expect(f.sheets[0].header.map((h) => h.replace(/ \[[^\]]*\]$/, ''))).toEqual(['Sample', 'T mean', 'T st.dev.', 'OM mean', 'OM st.dev.']);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([4, 5, 6]);
  });
});

describe('time of day under UTC, in csv and in xlsx', () => {
  it('csv: 00:30 under UTC folds', () => {
    const f = textFile('t.csv', ['station,date,time,latitude,longitude', ',,UTC,degrees_north,degrees_east', 'S1,2001-03-04,00:30,54.5,7.5', 'S2,2001-03-04,01:30,54.6,7.6', 'S3,2001-03-04,02:30,54.7,7.7'].join('\n'));
    expect(f.sheets[0].header[2]).toBe('time [UTC]');
  });
  it('xlsx: hh:mm cells under UTC fold too', () => {
    const tm = (v: number) => ({ t: 'n' as const, v, z: 'hh:mm' });
    const f = xlsxFile('t.xlsx', { S: [['station', 'time', 'latitude', 'longitude'], [null, 'UTC', 'degrees_north', 'degrees_east'], ['S1', tm(0.02), 54.5, 7.5], ['S2', tm(0.06), 54.6, 7.6]] });
    expect(f.sheets[0].header[1]).toBe('time [UTC]');
  });
});

describe('values that are not plain numbers: a size class under a unit', () => {
  const t = (cell: string) => ['id,size,sieve,count,depth', 'unitless,centimeters,microns,individuals,m', `A,${cell},>250 um,4,5.0`, 'B,1-2,>250 um,6,6.0', 'C,2-3,<5 um,3,7.0'].join('\n');
  it('the BCO-DMO shape: ranges and "> 300 um" under units fold', () => {
    const s = textFile('b.csv', t('0-1')).sheets[0];
    expect(s.header).toEqual(['id', 'size [centimeters]', 'sieve [microns]', 'count [individuals]', 'depth [m]']);
    expect(s.rows).toHaveLength(3);
  });
  it('a word, a code or a number glued to letters under a unit is not a value, so the row is not folded', () => {
    for (const cell of ['high', '1A', 'M']) {
      const rows = ['id,size,count,depth', 'unitless,centimeters,individuals,m', `A,${cell},4,5.0`, 'B,low,6,6.0', 'C,mid,3,7.0'].join('\n');
      expect(textFile('w.csv', rows).sheets[0].unitsRowLine, cell).toBeUndefined();
    }
  });
  it('less than half of the unit columns holding plain numbers is not a units row', () => {
    const rows = ['a,b,c,d,e', 'cm,mm,kg,m,g', '1-2,3-4,5-6,7,8', '2-3,4-5,6-7,8,9', '3-4,5-6,7-8,9,1'].join('\n');
    expect(textFile('r.csv', rows).sheets[0].unitsRowLine).toBeUndefined();
  });
});

describe('a hostile cell costs a length test, not a regex run', () => {
  it('200,000 digits (alone, or with a line break and a letter after them) are not a value, and no pattern is run', () => {
    const exec = vi.spyOn(RegExp.prototype, 'exec');
    const before = exec.mock.calls.length;
    for (const cell of ['1'.repeat(200_000), `${'1'.repeat(200_000)}\nx`, '1'.repeat(VALUE_SHAPE_MAX + 1)]) expect(valueShaped(cell, false)).toBe(false);
    expect(exec.mock.calls.length - before).toBe(0);
    exec.mockRestore();
  });
  it('a line break in a short cell is refused too; the ordinary shapes still pass', () => {
    expect(valueShaped('12\nx', false)).toBe(false);
    for (const cell of ['<5', '>250 um', '0-1', '12.5 cm', '~3']) expect(valueShaped(cell, false), cell).toBe(true);
    expect(valueShaped('1,5', true)).toBe(true);
    expect(valueShaped('1A', false)).toBe(false);
  });
  it('a unit cell of 200,000 characters is refused by the length cap before any pattern', () => {
    expect(unitCellKind('m'.repeat(200_000))).toBeUndefined();
    expect(unitCellKind(`${'a '.repeat(100_000)}per m`)).toBeUndefined();
  });
});

describe('a hostile cell under a unit column never reaches a date or number parser', () => {
  const rows = (cell: string) => [
    { line: 2, cells: ['UTC', 'degrees_north', 'degrees_east'] as (string | null)[], fieldCount: 3 },
    { line: 3, cells: [cell, '54.5', '7.5'], fieldCount: 3 },
    { line: 4, cells: ['2001-03-04T05:00:00Z', '54.6', '7.6'], fieldCount: 3 },
  ];
  // a 200,000-character cell costs fewer pattern calls than a one-letter cell, which does go through the parsers: counted, not timed
  const calls = (cell: string, header: string[]): number => {
    const ex = vi.spyOn(RegExp.prototype, 'exec');
    const te = vi.spyOn(RegExp.prototype, 'test');
    foldUnitsRow(header, rows(cell), false);
    const n = ex.mock.calls.length + te.mock.calls.length;
    ex.mockRestore();
    te.mockRestore();
    return n;
  };
  it('under UTC', () => {
    expect(calls('x'.repeat(200_000), ['time', 'latitude', 'longitude'])).toBeLessThan(calls('x', ['time', 'latitude', 'longitude']));
    expect(calls(`${'1'.repeat(200_000)}\nx`, ['time', 'latitude', 'longitude'])).toBeLessThan(calls('x', ['time', 'latitude', 'longitude']));
  });
  it('under a number unit', () => {
    const r = (cell: string) => [{ line: 2, cells: ['m', 'degrees_north'] as (string | null)[], fieldCount: 2 }, { line: 3, cells: [cell, '5'], fieldCount: 2 }, { line: 4, cells: ['6', '7'], fieldCount: 2 }];
    const ex = vi.spyOn(RegExp.prototype, 'exec');
    const te = vi.spyOn(RegExp.prototype, 'test');
    const count = (cell: string): number => {
      ex.mockClear();
      te.mockClear();
      foldUnitsRow(['depth', 'lat'], r(cell), false);
      return ex.mock.calls.length + te.mock.calls.length;
    };
    expect(count('9'.repeat(200_000))).toBeLessThan(count('x'));
    ex.mockRestore();
    te.mockRestore();
  });
});

describe('litre after a division', () => {
  it('fmol/L and mg/L are units, L alone is not', () => {
    for (const c of ['fmol/L', 'mg/L', 'nanomoles per liter (nmol/L)', 'mol/L']) expect(unitCellKind(c), c).toBe('unit');
    expect(unitCellKind('L')).toBeUndefined();
  });
});

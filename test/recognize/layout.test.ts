// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { proposeLayout, proposeMappings, splitLayout } from '../../src/core/recognize/layout';
import { fixtureFile, textFile, xlsxFile } from '../helpers/files';

describe('proposeLayout: wide', () => {
  it('a CSV with coordinates and variables as columns is one wide table', () => {
    const f = fixtureFile('layout-wide.csv');
    expect(proposeLayout(f)).toEqual({ tables: [{ sheet: f.sheets[0].name }], joins: [] });
  });

  it('every sheet of a workbook with coordinates on each sheet is its own table, no join', () => {
    const f = xlsxFile('w.xlsx', {
      Water: [['Station', 'Latitude', 'Longitude', 'DIC (µmol L-1)'], ['ST1', 70, 10, 2100], ['ST2', 71, 11, 2110]],
      Pore: [['Station', 'Latitude', 'Longitude', 'Depth (cm)', 'DIC (µmol L-1)'], ['ST1', 70, 10, 1, 2400], ['ST2', 71, 11, 2, 2500]],
    });
    const l = proposeLayout(f);
    expect(l.tables.map((t) => t.sheet)).toEqual(['Water', 'Pore']);
    expect(l.joins).toEqual([]);
    expect(l.unsupported).toBeUndefined();
  });

  it('a legend sheet (names and descriptions only) is left out of the plan', () => {
    const f = xlsxFile('l.xlsx', {
      Legend: [['column_name', 'description'], ['latitude', 'Latitude in decimal degrees'], ['depth', 'Depth in cm'], ['value', 'The measured value']],
      Data: [['Station', 'Latitude', 'Longitude', 'DIC_umol_kg'], ['ST1', 70, 10, 2100], ['ST2', 71, 11, 2110]],
    });
    const l = proposeLayout(f);
    expect(l.tables.map((t) => t.sheet)).toEqual(['Data']);
    expect(l.unsupported).toBeUndefined();
  });
});

describe('proposeLayout: long', () => {
  it('a sheet with a parameter column, a unit column and a numeric value column is long', () => {
    const f = fixtureFile('layout-long.csv');
    expect(proposeLayout(f)).toEqual({ tables: [{ sheet: f.sheets[0].name, long: { parameterCol: 2, unitCol: 3, valueCol: 4 } }], joins: [] });
  });

  it('a long table without a unit column', () => {
    const f = textFile('l.csv', 'core,parameter,value\nc1,DIC,2100\nc1,TA,2300\nc2,DIC,2101\nc2,TA,2301\n');
    expect(proposeLayout(f).tables[0].long).toEqual({ parameterCol: 1, valueCol: 2 });
  });

  it('a parameter column whose values never repeat is not a long table', () => {
    const f = textFile('w.csv', 'station,latitude,longitude,parameter,value\nST1,70,10,p1,1\nST2,71,11,p2,2\nST3,72,12,p3,3\n');
    expect(proposeLayout(f).tables[0].long).toBeUndefined();
  });
});

describe('proposeLayout: join', () => {
  const cores = [['core_ID', 'longitude', 'latitude', 'gear'], ['core_A', 15.7, 76.9, 'long'], ['core_B', 15.9, 76.98, 'long'], ['core_C', 16.5, 76.99, 'short']];

  it('coordinates in one sheet, measurements in another, joined on the shared id', () => {
    const f = xlsxFile('j.xlsx', {
      measurements: [['id', 'depth', 'Na_mg_l'], ['core_A', 1, 100], ['core_A', 2, 101], ['core_B', 1, 110]],
      cores: [['id', 'lat', 'lon'], ['core_A', 76.9, 15.7], ['core_B', 76.98, 15.9]],
    });
    const l = proposeLayout(f);
    expect(l.tables).toEqual([{ sheet: 'measurements' }]);
    expect(l.joins).toEqual([{ left: 'measurements', right: 'cores', leftKey: 0, rightKey: 0 }]);
  });

  it('long measurements joined to a core table, with an ignored legend sheet', () => {
    const f = xlsxFile('j.xlsx', {
      legend: [['column_name', 'description'], ['core_ID', 'unique core ID'], ['parameter', 'what was measured']],
      core_info: cores,
      results: [['core_ID', 'depth', 'parameter', 'unit', 'value'], ['core_A', -5, 'Cx', '%', 1.5], ['core_A', -5, 'Nx', '%', 0.2], ['core_B', -5, 'Cx', '%', 1.1], ['core_B', -5, 'Nx', '%', 0.1]],
    });
    const l = proposeLayout(f);
    expect(l.tables).toEqual([{ sheet: 'results', long: { parameterCol: 2, unitCol: 3, valueCol: 4 } }]);
    expect(l.joins).toEqual([{ left: 'results', right: 'core_info', leftKey: 0, rightKey: 0 }]);
    expect(l.unsupported).toBeUndefined();
  });

  it('joins on a value subset when the headers differ, but only through an identifier column', () => {
    const f = xlsxFile('j.xlsx', {
      stations: [['Station', 'Latitude', 'Longitude'], ['ST1', 70, 10], ['ST2', 71, 11], ['ST3', 72, 12]],
      data: [['Site', 'DIC_umol_kg'], ['ST1', 2100], ['ST3', 2110]],
    });
    expect(proposeLayout(f).joins).toEqual([{ left: 'data', right: 'stations', leftKey: 0, rightKey: 0 }]);
  });

  it('no join when the measurement ids are not all in the coordinate sheet', () => {
    const f = xlsxFile('j.xlsx', {
      stations: [['id', 'Latitude', 'Longitude'], ['ST1', 70, 10], ['ST2', 71, 11]],
      data: [['id', 'DIC_umol_kg'], ['ST1', 2100], ['ST9', 2110]],
    });
    const l = proposeLayout(f);
    expect(l.joins).toEqual([]);
    expect(l.tables.map((t) => t.sheet).sort()).toEqual(['data', 'stations']);
  });

  it('a numeric measurement column is never taken for the key', () => {
    const f = xlsxFile('j.xlsx', {
      stations: [['id', 'Latitude', 'Longitude'], [1, 70, 10], [2, 71, 11]],
      data: [['Depth', 'DIC_umol_kg'], [1, 2100], [2, 2110]],
    });
    expect(proposeLayout(f).joins).toEqual([]);
  });
});

describe('proposeLayout: unsupported', () => {
  it('a transposed sheet (variables in rows, samples in columns)', () => {
    const f = textFile('t.csv', 'parameter,ST1,ST2,ST3\nLatitude,70.1,71.2,72.3\nLongitude,10.1,11.2,12.3\nDepth,5,5,5\nDIC,2100,2110,2120\n');
    const l = proposeLayout(f);
    expect(l.unsupported).toMatch(/transposed/);
    expect(l.tables).toEqual([]);
  });

  it('a header that spans several rows (units on the second row)', () => {
    const f = textFile('h.csv', 'Station,Latitude,Longitude,DIC,TA\n,degrees_north,degrees_east,umol/kg,umol/kg\nST1,70,10,2100,2300\nST2,71,11,2110,2310\n');
    expect(proposeLayout(f).unsupported).toMatch(/header spans several rows/);
  });

  it('a header that is mostly empty cells (merged group headers)', () => {
    const f = textFile('h.csv', 'Nutrients,,,,Carbonate\nStation,Latitude,Longitude,NO3,DIC\nST1,70,10,1,2100\n');
    expect(proposeLayout(f).unsupported).toMatch(/header spans several rows/);
  });

  it('a file with no table, a sheet with no rows, and a sheet that is only notes', () => {
    expect(proposeLayout(textFile('e.csv', 'a,b\n')).unsupported).toMatch(/no data rows/);
    const f = xlsxFile('n.xlsx', { notes: [['topic', 'text'], ['method', 'filtered'], ['units', 'see header']] });
    expect(proposeLayout(f).unsupported).toMatch(/no sheet with coordinates or measurements/);
  });

  it('a readable sheet next to an unreadable one is kept and the unreadable one is named', () => {
    const f = xlsxFile('m.xlsx', {
      good: [['Station', 'Latitude', 'Longitude', 'DIC_umol_kg'], ['ST1', 70, 10, 2100], ['ST2', 71, 11, 2110]],
      flipped: [['parameter', 'ST1', 'ST2', 'ST3'], ['Latitude', 70, 71, 72], ['Longitude', 10, 11, 12], ['DIC', 1, 2, 3]],
    });
    const l = proposeLayout(f);
    expect(l.tables.map((t) => t.sheet)).toEqual(['good']);
    expect(l.unsupported).toMatch(/sheet "flipped": data is transposed/);
  });
});

describe('proposeMappings and splitLayout', () => {
  it('maps every sheet the plan reads, with long columns consumed by the layout', () => {
    const f = xlsxFile('j.xlsx', {
      legend: [['column_name', 'description'], ['core_ID', 'id']],
      core_info: [['core_ID', 'longitude', 'latitude'], ['core_A', 15.7, 76.9], ['core_B', 15.9, 76.98]],
      results: [['core_ID', 'depth', 'parameter', 'unit', 'value'], ['core_A', -5, 'Cx', '%', 1.5], ['core_A', -5, 'Nx', '%', 0.2], ['core_B', -5, 'Cx', '%', 1.1], ['core_B', -5, 'Nx', '%', 0.1]],
    });
    const l = proposeLayout(f);
    const m = proposeMappings(f, l);
    expect(m.map((x) => x.sheet)).toEqual(['results', 'core_info']);
    expect(m[0].columns.map((c) => c.role.kind)).toEqual(['sampleId', 'depth', 'ignore', 'ignore', 'ignore']);
    expect(m[1].columns.map((c) => c.role.kind)).toEqual(['sampleId', 'longitude', 'latitude']);
  });

  it('independent tables split into separate groups, a join stays with its measurement table', () => {
    const l = { tables: [{ sheet: 'a' }, { sheet: 'b' }], joins: [{ left: 'b', right: 'c', leftKey: 0, rightKey: 0 }] };
    expect(splitLayout(l)).toEqual([
      { tables: [{ sheet: 'a' }], joins: [] },
      { tables: [{ sheet: 'b' }], joins: l.joins },
    ]);
  });
});

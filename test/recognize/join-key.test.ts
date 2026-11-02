// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The key of a join must identify ONE row of the right sheet; a key that does not borrows nothing. Every row is invented.
import { describe, expect, it } from 'vitest';
import { buildDatasets } from '../../src/core/dataset';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { describeLayout, setJoinKey } from '../../src/app/layoutModel';
import { renderPlain } from '../../src/core/report';
import { checkMetadataVsData } from '../../src/core/checks/metadata';
import { LANGS } from '../../src/core/types';
import { translate } from '../../src/core/i18n/ui';
import { xlsxFile } from '../helpers/files';

const STATION = [
  ['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'],
  ['C1', 'S1', '2020-06-01', 70.1, 15.2],
  ['C1', 'S2', '2020-06-02', 60.2, 5.4],
  ['C1', 'S3', '2020-06-03', 50.3, -5.6],
];
const TWO_CRUISES = [
  ['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'],
  ['C1', 'S1', '2020-06-01', 70.1, 15.2],
  ['C1', 'S2', '2020-06-02', 60.2, 5.4],
  ['C2', 'S1', '2021-06-01', 40.1, 1.2],
  ['C2', 'S2', '2021-06-02', 30.2, 2.4],
];
const DATA = [
  ['Cruise', 'Station', 'Temperature [degC]', 'Salinity'],
  ['C1', 'S1', 4.5, 35.1],
  ['C1', 'S2', 5.5, 35.2],
  ['C1', 'S3', 6.5, 35.3],
];

function run(sheets: Record<string, (string | number)[][]>) {
  const file = xlsxFile('book.xlsx', sheets);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  const { datasets, findings } = buildDatasets(file, layout, mappings, [], 'ds1');
  return { file, layout, datasets, findings };
}

describe('a join key identifies one row of the right sheet', () => {
  it('the unique column is the key, not the first of two columns of the same score: Station, not Cruise (three positions, bbox 50.3-70.1)', () => {
    const { layout, datasets, findings } = run({ Station: STATION, Data: DATA });
    expect(layout.joins).toEqual([{ left: 'Data', right: 'Station', leftKey: 1, rightKey: 1 }]);
    const rows = datasets[0].rows;
    expect(rows.map((r) => [r.lat, r.lon])).toEqual([[70.1, 15.2], [60.2, 5.4], [50.3, -5.6]]);
    const lats = rows.map((r) => r.lat!);
    expect([Math.min(...lats), Math.max(...lats)]).toEqual([50.3, 70.1]);
    expect(findings.filter((f) => f.ruleId === 'ROW-JOIN-AMBIGUOUS')).toEqual([]);
  });

  it('the sentence on the page names every column of the composite key, in four languages', () => {
    const { file, layout } = run({ Station: TWO_CRUISES, Data: [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C2', 'S1', 5.5]] });
    const sheets = file.sheets.map((s) => ({ name: s.name, header: s.header })) as never;
    const line = describeLayout(layout, sheets)[0];
    expect(line.key).toBe('layout.joinMany');
    expect(line.params.leftKey).toBe('Cruise + Station');
    for (const lang of LANGS) expect(translate(lang, line.key, line.params)).toContain('Cruise + Station');
  });

  it('a unique Station key is unchanged', () => {
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S2', '2020-06-02', 60.2, 5.4], ['S3', '2020-06-03', 50.3, -5.6]];
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5], ['S2', 5.5], ['S3', 6.5]];
    const { layout, datasets } = run({ Station: station, Data: data });
    expect(layout.joins).toEqual([{ left: 'Data', right: 'Station', leftKey: 0, rightKey: 0 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 60.2, 50.3]);
  });

  it('prefers the unique column among candidates of the same score, whatever the order of the columns', () => {
    const station = [['Cruise', 'Station', 'Latitude', 'Longitude', 'Date'], ['C1', 'S1', 70.1, 15.2, '2020-06-01'], ['C1', 'S2', 60.2, 5.4, '2020-06-02']];
    const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5]];
    // Cruise is not unique on the right, Station is: Station alone is the key
    expect(run({ Station: station, Data: data }).layout.joins).toEqual([{ left: 'Data', right: 'Station', leftKey: 1, rightKey: 1 }]);
    // only Station is shared by name
    const data2 = [['Station', 'Temperature [degC]'], ['S1', 4.5], ['S2', 5.5]];
    expect(run({ Station: station, Data: data2 }).layout.joins).toEqual([{ left: 'Data', right: 'Station', leftKey: 0, rightKey: 1 }]);
  });

  it('two stations of the same name in two cruises resolve by the composite', () => {
    const station = [['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'], ['C1', 'S1', '2020-06-01', 70.1, 15.2], ['C1', 'S2', '2020-06-02', 60.2, 5.4], ['C2', 'S1', '2021-06-01', 40.1, 1.2], ['C2', 'S2', '2021-06-02', 30.2, 2.4]];
    const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C2', 'S1', 5.5], ['C2', 'S2', 6.5], ['C1', 'S2', 7.5]];
    const { datasets } = run({ Station: station, Data: data });
    expect(datasets[0].rows.map((r) => [r.lat, r.lon])).toEqual([[70.1, 15.2], [40.1, 1.2], [30.2, 2.4], [60.2, 5.4]]);
  });

  it('an ambiguous key reports and borrows nothing', () => {
    // one column shared, repeated on the right with different positions
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S1', '2020-07-01', 60.2, 5.4], ['S2', '2020-06-02', 50.3, -5.6]];
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5], ['S2', 5.5]];
    const { datasets, findings } = run({ Station: station, Data: data });
    const rows = datasets[0].rows;
    expect(rows[0].lat).toBeUndefined();
    expect(rows[0].datetime).toBeUndefined();
    expect(rows[1].lat).toBe(50.3);
    const f = findings.filter((x) => x.ruleId === 'ROW-JOIN-AMBIGUOUS');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ sheet: 'Data', field: 'Station', lines: [2], value: 'S1', params: { right: 'Station' } });
    for (const lang of LANGS) {
      const text = renderPlain(f[0], lang);
      expect(text).toContain('Station');
      expect(text).toContain('S1');
    }
  });

  it('a station listed twice with two positions makes only its own rows ambiguous, not every row of the cruise', () => {
    const station = [
      ['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'],
      ['C1', 'S1', '2020-06-01', 70.1, 15.2],
      ['C1', 'S1', '2020-06-01', 70.9, 15.9],
      ['C1', 'S2', '2020-06-02', 60.2, 5.4],
      ['C2', 'S1', '2021-06-01', 40.1, 1.2],
    ];
    const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5], ['C2', 'S1', 6.5]];
    const { layout, datasets, findings } = run({ Station: station, Data: data });
    expect(layout.joins[0].extraKeys).toEqual([{ leftKey: 1, rightKey: 1 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([undefined, 60.2, 40.1]);
    const f = findings.filter((x) => x.ruleId === 'ROW-JOIN-AMBIGUOUS');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2]);
    expect(f[0].field).toBe('Cruise + Station');
  });

  it('rows that truly repeat identically are fine', () => {
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S1', '2020-06-01', 70.1, 15.2], ['S2', '2020-06-02', 50.3, -5.6]];
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5], ['S2', 5.5]];
    const { datasets, findings } = run({ Station: station, Data: data });
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 50.3]);
    expect(findings.filter((f) => f.ruleId === 'ROW-JOIN-AMBIGUOUS')).toEqual([]);
  });

  it('a join on a unique key with a different header (the existing rule) is unchanged', () => {
    const cores = [['core', 'Latitude', 'Longitude', 'Date'], ['A', 70.1, 15.2, '2020-06-01'], ['B', 60.2, 5.4, '2020-06-02']];
    const meas = [['Sample', 'Temperature [degC]'], ['A', 4.5], ['B', 5.5]];
    const { layout, datasets } = run({ cores, meas });
    expect(layout.joins).toEqual([{ left: 'meas', right: 'cores', leftKey: 0, rightKey: 0 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 60.2]);
  });

  it('picking one key column by hand replaces the composite key', () => {
    const { layout } = run({ Station: TWO_CRUISES, Data: [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C2', 'S1', 5.5]] });
    expect(layout.joins[0].extraKeys).toBeDefined();
    const next = setJoinKey(layout, 0, 'left', 1);
    expect(next.joins[0].extraKeys).toBeUndefined();
    expect(next.joins[0].leftKey).toBe(1);
  });
});

describe('which key (M1/M2): uniqueness first, then the composite, then the header', () => {
  it('Cruise,Stn against Cruise,Station takes Station (unique), not Cruise (equal header, repeated)', () => {
    const station = [['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'], ['C1', 'S1', '2020-06-01', 70.1, 15.2], ['C1', 'S2', '2020-06-02', 60.2, 5.4], ['C1', 'S3', '2020-06-03', 50.3, -5.6]];
    const data = [['Cruise', 'Stn', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5], ['C1', 'S3', 6.5]];
    const { layout, datasets } = run({ Station: station, Data: data });
    expect(layout.joins).toEqual([{ left: 'Data', right: 'Station', leftKey: 1, rightKey: 1 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 60.2, 50.3]);
  });

  it('Cruise,Stn against Cruise,Station with the station repeated in two cruises: the composite resolves (C1,S2) to 60.2', () => {
    const data = [['Cruise', 'Stn', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5], ['C2', 'S1', 6.5], ['C2', 'S2', 7.5]];
    const { layout, datasets } = run({ Station: TWO_CRUISES, Data: data });
    expect(layout.joins[0].extraKeys).toEqual([{ leftKey: 1, rightKey: 1 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 60.2, 40.1, 30.2]);
  });

  it('Sample against Sample ID', () => {
    const cores = [['Sample ID', 'Latitude', 'Longitude', 'Date'], ['A', 70.1, 15.2, '2020-06-01'], ['B', 60.2, 5.4, '2020-06-02']];
    const meas = [['Sample', 'Temperature [degC]'], ['A', 4.5], ['B', 5.5]];
    const { layout, datasets } = run({ cores, meas });
    expect(layout.joins).toEqual([{ left: 'meas', right: 'cores', leftKey: 0, rightKey: 0 }]);
    expect(datasets[0].rows.map((r) => r.lat)).toEqual([70.1, 60.2]);
  });

  it('with three sheets, Stations wins over Cruises', () => {
    const cruises = [['Cruise', 'Latitude', 'Longitude', 'Date'], ['C1', 70.0, 15.0, '2020-06-01'], ['C2', 40.0, 1.0, '2021-06-01']];
    const stations = [['Station', 'Cruise', 'Latitude', 'Longitude', 'Date'], ['S1', 'C1', 70.1, 15.2, '2020-06-01'], ['S2', 'C1', 60.2, 5.4, '2020-06-02'], ['S3', 'C2', 40.1, 1.2, '2021-06-01']];
    const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5], ['C2', 'S3', 6.5]];
    const { layout, datasets } = run({ Cruises: cruises, Stations: stations, Data: data });
    expect(layout.joins[0].right).toBe('Stations');
    expect(datasets.flatMap((d) => d.rows).filter((r) => r.sheet === 'Data').map((r) => r.lat)).toEqual([70.1, 60.2, 40.1]);
  });
});

describe('the lookup (M3, M4 and the LOW items)', () => {
  it('rows that differ only in depth lend position and date, and no depth', () => {
    const station = [['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]'], ['S1', '2020-06-01', 70.1, 15.2, 10], ['S1', '2020-06-01', 70.1, 15.2, 20], ['S2', '2020-06-02', 50.3, -5.6, 30]];
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5], ['S2', 5.5]];
    const { datasets, findings } = run({ Station: station, Data: data });
    expect(datasets[0].rows.map((r) => [r.lat, r.depth])).toEqual([[70.1, undefined], [50.3, 30]]);
    expect(findings.filter((f) => f.ruleId === 'ROW-JOIN-AMBIGUOUS')).toEqual([]);
  });

  it('after an ambiguous join META-NO-DATES names the sheet and the cause', () => {
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S1', '2020-07-01', 60.2, 5.4]];
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5]];
    const { datasets } = run({ Station: station, Data: data });
    const f = checkMetadataVsData(datasets[0]).filter((x) => x.ruleId === 'META-NO-DATES');
    expect(f).toHaveLength(1);
    for (const lang of LANGS) expect(renderPlain(f[0], lang)).toContain('Station');
    expect(renderPlain(f[0], 'en')).toMatch(/join/i);
  });

  it('the messages have no plural token left over, and a composite key example reads "C1 + S1"', () => {
    const station = [['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'], ['C1', 'S1', '2020-06-01', 70.1, 15.2], ['C1', 'S1', '2020-06-01', 70.9, 15.9], ['C1', 'S2', '2020-06-02', 60.2, 5.4], ['C2', 'S1', '2021-06-01', 40.1, 1.2]];
    const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S1', 4.5], ['C1', 'S2', 5.5]];
    const { findings } = run({ Station: station, Data: data });
    const f = findings.filter((x) => x.ruleId === 'ROW-JOIN-AMBIGUOUS');
    expect(f).toHaveLength(1);
    expect(f[0].value).toBe('C1 + S1');
    for (const lang of LANGS) {
      const text = renderPlain(f[0], lang);
      expect(text).not.toMatch(/[{}]|\["/);
      expect(text).toContain('C1 + S1');
    }
  });

  it('a blank key on a row that has a single value is said too', () => {
    const data = [['Station', 'Temperature [degC]'], ['S1', 4.5], [null, 5.5]];
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S2', '2020-06-02', 50.3, -5.6]];
    const { findings } = run({ Station: station, Data: data as never });
    expect(findings.filter((x) => x.ruleId === 'ROW-JOIN-KEY-BLANK')).toHaveLength(1);
  });

  it('a blank part of the key on a row with no position of its own is said', () => {
    const data = [['Station', 'Temperature [degC]', 'Salinity'], ['S1', 4.5, 35], [null, 5.5, 35.1]];
    const station = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2020-06-01', 70.1, 15.2], ['S2', '2020-06-02', 50.3, -5.6]];
    const { findings } = run({ Station: station, Data: data as never });
    const f = findings.filter((x) => x.ruleId === 'ROW-JOIN-KEY-BLANK');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
  });
});

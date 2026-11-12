// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// /check joins a data sheet to a Stations sheet whose station names repeat across cruises, with a Cruises sheet beside it: the pair (cruise, station) decides the position
// in every sheet order and row order, and a key that is not unique is named (ROW-JOIN-AMBIGUOUS) instead of the first row being taken. Every value is invented.
import { describe, expect, it } from 'vitest';
import { buildDatasets } from '../../src/core/dataset';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { xlsxFile } from '../helpers/files';

type Sheets = Record<string, (string | number)[][]>;

function run(sheets: Sheets) {
  const file = xlsxFile('book.xlsx', sheets);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  const { datasets, findings } = buildDatasets(file, layout, mappings, [], 'd');
  const ds = (datasets as any[]).find((d) => String(d.label).endsWith('(Data)'));
  const rows = (ds.rows as any[]).map((r) => [r.lat ?? null, r.lon ?? null, r.datetime?.iso ?? null]);
  const ids = (findings as any[]).map((f) => f.ruleId as string);
  return { rows, ids };
}

const stations = (c2First: boolean) => {
  const a = ['C1', 'S1', '2020-06-01', 50.3, -5.6];
  const b = ['C1', 'S2', '2020-06-02', 60.2, 5.4];
  const c = ['C2', 'S2', '2021-06-02', 70.1, 15.2];
  return [['Cruise', 'Station', 'Date', 'Latitude', 'Longitude'], ...(c2First ? [c, a, b] : [a, b, c])];
};
const cruises = [['Cruise', 'Year'], ['C1', 2020], ['C2', 2021]];
const data = [['Cruise', 'Station', 'Temperature [degC]'], ['C1', 'S2', 5.5], ['C2', 'S2', 6.5]];
const stationOnly = [['Station', 'Temperature [degC]'], ['S2', 5.5]];

describe('/check join against stations that repeat across cruises', () => {
  const orders: [string, (c2First: boolean) => Sheets][] = [
    ['Cruises, Stations, Data', (f) => ({ Cruises: cruises, Stations: stations(f), Data: data })],
    ['Data, Stations, Cruises', (f) => ({ Data: data, Stations: stations(f), Cruises: cruises })],
    ['Stations, Cruises, Data', (f) => ({ Stations: stations(f), Cruises: cruises, Data: data })],
  ];
  for (const [name, make] of orders) {
    for (const c2First of [false, true]) {
      it(`(C1,S2) gets 60.2 and (C2,S2) gets 70.1 with the sheets in the order ${name}, ${c2First ? 'C2 first' : 'C1 first'} in Stations`, () => {
        const { rows } = run(make(c2First));
        expect(rows).toEqual([[60.2, 5.4, '2020-06-02'], [70.1, 15.2, '2021-06-02']]);
      });
    }
  }

  it('names the cruise key that matches several station rows with different positions, once, in every sheet order', () => {
    for (const [name, make] of orders) {
      for (const c2First of [false, true]) {
        const { ids } = run(make(c2First));
        expect(ids.filter((id) => id === 'ROW-JOIN-AMBIGUOUS'), `${name}, ${c2First ? 'C2 first' : 'C1 first'}`).toHaveLength(1);
      }
    }
  });

  it('gives no position, and says why, to a data sheet that has only the station name', () => {
    const { rows, ids } = run({ Stations: stations(false), Data: stationOnly });
    expect(rows[0][0]).toBeNull();
    expect(ids).toContain('ROW-JOIN-AMBIGUOUS');
  });
});

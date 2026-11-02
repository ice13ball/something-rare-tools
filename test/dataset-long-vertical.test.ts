// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A long sheet (parameter + value columns) whose levels are given by a depth that is not the depth slot: two levels of one core are two rows; no value is dropped (dataset.ts buildLong). Every row is invented.
import { describe, expect, it } from 'vitest';
import { readLongSheet } from '../src/core/convert/pivot';
import { buildDataset } from '../src/core/dataset';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import { textFile } from './helpers/files';

const csv = (depthHeader: string): string =>
  [`Station,Latitude,Longitude,Date,${depthHeader},Parameter,Value`, 'S1,49.4,0.2,2020-06-01,1.5,Corg,3.1', 'S1,49.4,0.2,2020-06-01,1.1,Corg,2.7', 'S1,49.4,0.2,2020-06-01,0.7,Corg,2.2', 'S2,49.5,0.3,2020-06-02,1.5,Corg,1.9'].join('\n');

describe('no measurement of a long sheet is lost to a vertical coordinate that is not the depth slot', () => {
  for (const h of ['Depth sed [m]', 'Sediment depth [m]', 'Depth sediment [m]', 'Depth core [m]', 'Depth ice/snow [m]', 'Depth soil [m]', 'Depth water [m]']) {
    it(h, () => {
      const file = textFile('long.csv', csv(h));
      const layout = proposeLayout(file);
      const { dataset } = buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
      const values = dataset.rows.flatMap((r) => Object.values(r.values)).length;
      expect(values, `${h}: all four source values are kept`).toBe(4);
      expect(dataset.rows).toHaveLength(4);
    });

    it(`${h} on /convert: the pivoted sheet keeps one row per level`, () => {
      // two parameters (a long sheet of one parameter is not read at all, CONV-LONG-UNSUPPORTED)
      const lines = csv(h).split('\n');
      const two = [...lines, ...lines.slice(1).map((l) => l.replace('Corg', 'Ntot'))].join('\n');
      const file = textFile('long.csv', two);
      const v = readLongSheet(file, file.sheets[0]);
      expect(v.kind).toBe('pivot');
      if (v.kind === 'pivot') expect(v.sheet.rows).toHaveLength(4);
    });
  }

  it('a depth bottom beside a depth top keeps both levels apart', () => {
    const text = ['Station,Latitude,Longitude,Date,Depth top [m],Depth bot [m],Parameter,Value', 'S1,49.4,0.2,2020-06-01,0,1,Corg,3.1', 'S1,49.4,0.2,2020-06-01,0,2,Corg,2.7'].join('\n');
    const file = textFile('long.csv', text);
    const layout = proposeLayout(file);
    const { dataset } = buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
    expect(dataset.rows.flatMap((r) => Object.values(r.values))).toHaveLength(2);
  });
});

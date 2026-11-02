// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A depth top / bottom beside a sediment depth is the same axis; the sediment words read the same on both tools; metres above sea level are metres. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { proposeColumns } from '../../src/core/recognize/columns';
import { rawSheet } from '../helpers/files';
import { fileOf, sheetInput } from '../convert/helpers';
import type { Cell } from '../convert/helpers';

const CTX = { decimalComma: false, date1904: false };
const sheet = (depthHeaders: string[], vals: number[][]) => rawSheet(['Latitude', 'Longitude', 'Date', ...depthHeaders, 'Calanus [#/m**2]'], vals.map((v, i) => [49.4, -11.1, '1993-10-26', ...v, i + 1]));
const by = (props: { header: string }[], h: string) => props.find((p) => p.header === h) as ReturnType<typeof proposeColumns>[number];

describe('a depth top / bottom beside a sediment depth', () => {
  const shape = sheet(['Depth sed [m]', 'Depth top [m]', 'Depth bot [m]'], [[0.005, 0, 0.01], [0.015, 0.01, 0.02], [0.025, 0.02, 0.03]]);

  it('/check: none of the three takes the depth slot', () => {
    const p = proposeColumns(shape, CTX);
    for (const h of ['Depth sed [m]', 'Depth top [m]', 'Depth bot [m]']) expect(by(p, h).role.kind, h).toBe('variable');
    expect(by(p, 'Depth top [m]').reasonCode).toBe('sediment-axis');
  });

  it('/convert: all three are depths below the seafloor', () => {
    const p = proposeConvertColumns(shape, CTX);
    for (const h of ['Depth sed [m]', 'Depth top [m]', 'Depth bot [m]']) expect(by(p, h).role.kind, h).toBe('depthBelowSeafloor');
  });

  it('end to end: no minimum or maximum depth in metres reaches the events', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Depth sed [m]', 'Depth top [m]', 'Depth bot [m]', 'Species', 'Count'];
    const body: Cell[][] = [['S1', 49.4, -11.1, '1993-10-26', 0.005, 0, 0.01, 'Calanus finmarchicus', 3], ['S2', 49.4, -11.1, '1993-10-26', 0.015, 0.01, 0.02, 'Calanus finmarchicus', 2]];
    const r = convert({ sheets: [sheetInput(fileOf(header, body), { shape: 'long', quantity: { kind: 'count' } })] });
    for (const e of r.events) {
      expect(e.depthMin).toBeUndefined();
      expect(e.depthMax).toBeUndefined();
    }
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.distanceText)).toEqual(['-0.005', '-0.015']);
  });

  it('a depth top / bottom without a sediment depth is a water depth range, as before', () => {
    const p = proposeColumns(sheet(['Depth top [m]', 'Depth bot [m]'], [[0, 10], [10, 20], [20, 30]]), CTX);
    expect(by(p, 'Depth top [m]').role.kind).toBe('depth');
  });
});

describe('the sediment words read the same on both tools', () => {
  for (const h of ['Depth sediment [m]', 'Depth sed top [m]', 'Depth core [m]', 'Sediment depth [m]']) {
    it(h, () => {
      const s = sheet([h], [[0.5], [1.5], [2.5]]);
      expect(by(proposeColumns(s, CTX), h).role.kind).toBe('variable');
      expect(by(proposeConvertColumns(s, CTX), h).role.kind).toBe('depthBelowSeafloor');
    });
  }
});

describe('metres above sea level', () => {
  it('Elevation [m a.s.l.] is metres: a negative value is a depth, and nothing blocks on its unit', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Elevation [m a.s.l.]', 'Species', 'Count'];
    const body: Cell[][] = [['S1', 49.4, -11.1, '1993-10-26', -208, 'Calanus finmarchicus', 3], ['S2', 49.4, -11.1, '1993-10-26', -210, 'Calanus finmarchicus', 2]];
    const r = convert({ sheets: [sheetInput(fileOf(header, body), { shape: 'long', quantity: { kind: 'count' } })] });
    expect(r.findings.filter((f) => f.ruleId === 'CONV-DEPTH-UNIT')).toEqual([]);
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.depthMin)).toEqual([208, 210]);
  });
});

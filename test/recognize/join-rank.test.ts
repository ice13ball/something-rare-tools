// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// rankJoinKeys: the ranking of join keys behind /check's findJoin, which can also measure how much of the left sheet the right one covers. Every sheet is invented.
import { describe, expect, it } from 'vitest';
import { rankJoinKeys, type KeySide } from '../../src/core/recognize/layout';
import type { RawCell, RawSheet } from '../../src/core/types';

type Col = [header: string, kind: string];

function side(cols: Col[], rows: RawCell[][]): KeySide {
  const sheet: RawSheet = {
    name: 'S',
    header: cols.map((c) => c[0]),
    headerLine: 1,
    rows: rows.map((cells, i) => ({ line: i + 2, cells, fieldCount: cells.length })),
  };
  return { sheet, columns: cols.map(([header, kind], index) => ({ index, header, role: { kind } })) };
}

describe('rankJoinKeys: coverage', () => {
  const left = side([['Sample', 'sampleId']], [['X01'], ['X02'], ['X04']]);
  const right = side([['Sample', 'sampleId']], [['X01'], ['X02'], ['X03']]);

  it("'all' drops a key whose left values are not all on the right", () => {
    expect(rankJoinKeys(left, [right], { coverage: 'all' })).toBeUndefined();
  });

  it("'measure' keeps it and says how many left values the right sheet has", () => {
    expect(rankJoinKeys(left, [right], { coverage: 'measure' })).toMatchObject({ right: 0, leftKey: 0, rightKey: 0, covered: 2, total: 3, unique: true });
  });

  it("'all' on a full cover reports covered === total", () => {
    const full = side([['Sample', 'sampleId']], [['X01'], ['X02'], ['X04'], ['X05']]);
    expect(rankJoinKeys(left, [full], { coverage: 'all' })).toMatchObject({ covered: 3, total: 3 });
  });

  it("'measure' ranks coverage before the strength of the key", () => {
    const l = side([['Sample', 'sampleId']], [['X01'], ['X02'], ['X03']]);
    const r = side(
      [['Code', 'sampleId'], ['Sample', 'ignore']],
      [['X01', 'X01'], ['X02', 'X02'], ['X09', 'X03']],
    );
    // Code (a strong kind, unique) covers 2/3; Sample (weak, same header) covers 3/3
    expect(rankJoinKeys(l, [r], { coverage: 'measure' })).toMatchObject({ leftKey: 0, rightKey: 1, covered: 3, total: 3 });
    // two right sheets: the better covered one is returned by its index
    const worse = side([['Sample', 'sampleId']], [['X01'], ['X02']]);
    expect(rankJoinKeys(l, [worse, r], { coverage: 'measure' })).toMatchObject({ right: 1, covered: 3 });
  });
});

describe('rankJoinKeys: composite keys', () => {
  const rightCols: Col[] = [['Cruise', 'cruise'], ['Station', 'station']];

  it('a station repeated across cruises is keyed by Cruise + Station', () => {
    const left = side(rightCols, [['C1', 'ST-1'], ['C2', 'ST-1']]);
    const right = side(rightCols, [['C1', 'ST-1'], ['C1', 'ST-2'], ['C2', 'ST-1']]);
    const j = rankJoinKeys(left, [right], { coverage: 'all' });
    expect(j?.extraKeys).toHaveLength(1);
    expect(j).toMatchObject({ unique: true, covered: 2, total: 2 });
  });

  it("'measure' counts distinct left tuples that the right sheet has", () => {
    const left = side(rightCols, [['C1', 'ST-1'], ['C2', 'ST-1'], ['C3', 'ST-1']]);
    const right = side(rightCols, [['C1', 'ST-1'], ['C2', 'ST-1']]);
    const j = rankJoinKeys(left, [right], { coverage: 'measure' });
    expect(j?.extraKeys).toHaveLength(1);
    expect(j).toMatchObject({ unique: true, covered: 2, total: 3 });
    expect(rankJoinKeys(left, [right], { coverage: 'all' })?.extraKeys).toBeUndefined();
  });
});

describe("rankJoinKeys: kinds 'any' (a picked key part of any kind)", () => {
  const left = side([['Station', 'station'], ['Date', 'keyPart']], [['ST-1', '2020-06-01'], ['ST-1', '2020-06-02']]);
  const dated = side([['Station', 'station'], ['Date', 'date']], [['ST-1', '2020-06-01'], ['ST-1', '2020-06-02'], ['ST-2', '2020-06-01']]);

  it("pairs Date with Date by header under 'any', not under the default kinds", () => {
    const any = rankJoinKeys(left, [dated], { coverage: 'measure', kinds: 'any' });
    expect(any).toMatchObject({ unique: true, covered: 2, total: 2 });
    expect(any?.extraKeys).toEqual([{ leftKey: 1, rightKey: 1 }]);
    const dflt = rankJoinKeys(left, [dated], { coverage: 'measure' });
    expect(dflt?.extraKeys).toBeUndefined();
    expect(dflt?.unique).toBe(false);
  });

  it('a right date under another header never pairs with the left Date', () => {
    const other = side([['Station', 'station'], ['Sampling day', 'date']], [['ST-1', '2020-06-01'], ['ST-1', '2020-06-02'], ['ST-2', '2020-06-01']]);
    const j = rankJoinKeys(left, [other], { coverage: 'measure', kinds: 'any' });
    expect(j?.extraKeys).toBeUndefined();
    expect(j?.leftKey).toBe(0);
  });
});

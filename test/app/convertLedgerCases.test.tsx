// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// The sentence "Every row is accounted for" must not be on the page when a row or a number has gone without a reason. One test for each way it was false (fix round 1 of the ledger),
// each reading the ledger and the rendered panel. Every value is invented.
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ConvertLedger } from '../../src/app/components/ConvertLedger';
import { convert } from '../../src/core/convert/build';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { UI } from '../../src/core/i18n/ui';
import type { ColumnRole } from '../../src/core/types';
import { fileOf, sheetInput } from '../convert/helpers';
import type { Cell } from '../convert/helpers';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

const T = UI.en;
const SENTENCE = T['convert.ledger.balanced'];
const panel = (l: SheetLedger[], blocked = false): string => {
  const { container } = render(<ConvertLedger ledger={l} blocked={blocked} />);
  return container.textContent ?? '';
};
const base = ['Sample', 'Date', 'Latitude', 'Longitude'];
const fr = (s: string): Cell[] => [s, '2020-06-01', 49.4, 0.2];
const reasonOf = (l: SheetLedger, line: number): string | undefined => l.lines.find((x) => x.line === line)?.fate;

describe('1. a long environmental sheet read as one row per sample: every line of the long file has a fate', () => {
  const header = [...base, 'Parameter', 'Value', 'Unit'];
  const rows: Cell[][] = [
    [...fr('A'), 'Temperature', 10, 'C'], // line 2
    [...fr('A'), 'Salinity', 34, 'PSU'], // 3
    [...fr('A'), null, 777, null], // 4: a value, no parameter name
    [...fr('A'), 'Temperature', 555, 'C'], // 5: the parameter twice in one sample
    [...fr('A'), 'Temperature_QC', 1, null], // 6: a quality flag
    [...fr('B'), 'Temperature', 12, 'C'], // 7
    [...fr('B'), 'Salinity', 35, 'PSU'], // 8
  ];
  const run = (): SheetLedger => {
    const piv = pivotConvertFile(fileOf(header, rows, 'Long'), {});
    expect(piv.sheets[0].pivot).toBeDefined();
    return convert({ sheets: [sheetInput(piv, { shape: 'wide', edit: { Sample: { kind: 'sampleId' } } })], options: {} }).ledger[0];
  };

  it('the value with no parameter, the repeated value and the flag row have a reason each, by line of the long file', () => {
    const l = run();
    expect(l.rows).toMatchObject({ source: 7, written: 4, unexplained: 0 });
    expect(reasonOf(l, 4)).toBe('empty-parameter');
    expect(reasonOf(l, 5)).toBe('repeated-parameter');
    expect(reasonOf(l, 6)).toBe('quality-flag');
    expect(l.lines.map((x) => x.line)).toEqual([4, 5, 6]);
    expect(l.notUnderstood).toBe(2);
    expect(l.pivotRowsIn).toBe(7);
    expect(l.pivotSamples).toBe(2);
  });

  it('the sentence is not on the page, and the panel says that values were not understood', () => {
    const text = panel([run()]);
    expect(text).not.toContain(SENTENCE);
    expect(text).toContain('2 rows hold a value the converter did not understand');
    expect(text).toContain('rows with a value but no parameter name: 1');
    expect(text).toContain('rows that repeat a parameter in the same sample');
  });
});

describe('2. a long row with a number and no taxon is never "nothing to record"', () => {
  const header = [...base, 'Species', 'Count', 'Temperature [C]'];
  const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
  const rows: Cell[][] = [[...fr('a'), 'Solea solea', 3, 12], [...fr('b'), null, null, 22]];
  const run = (): SheetLedger => convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} }).ledger[0];

  it('has its own reason, value-no-taxon, and the number is in the column with that reason', () => {
    const l = run();
    expect(reasonOf(l, 3)).toBe('value-no-taxon');
    expect(l.rows.skipped.map((s) => s.reason)).not.toContain('nothing-to-record');
    expect(l.notUnderstood).toBe(1);
    expect(l.columns.find((c) => c.header === 'Temperature [C]')!.skipped).toContainEqual({ reason: 'value-no-taxon', count: 1, sum: 22 });
  });

  it('the sentence is not on the page', () => {
    const text = panel([run()]);
    expect(text).not.toContain(SENTENCE);
    expect(text).toContain('rows with a number but no taxon');
  });

  it('a row with nothing in it is still "nothing to record"', () => {
    const l = convert({ sheets: [sheetInput(fileOf(header, [...rows, ['c', null, null, null, null, null, null]]), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} }).ledger[0];
    expect(reasonOf(l, 4)).toBe('nothing-to-record');
  });
});

describe('3. presence cells that say nd, NA, n/a or -- have a reason; none is called a fault of the converter', () => {
  it('on a wide presence sheet every such cell is accounted for and the panel does not call it a fault', () => {
    const rows: Cell[][] = [[...fr('a'), 'x', 'nd'], [...fr('b'), 'NA', 'n/a'], [...fr('c'), '--', 'x'], [...fr('d'), '-', 'ND']];
    const r = convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus', 'Oithona similis'], rows), { shape: 'wide', presenceOnly: true })], options: {} });
    const l = r.ledger[0];
    expect(l.cells!.unexplained).toBe(0);
    expect(l.rows.unexplained).toBe(0);
    expect(l.balanced).toBe(true);
    const lost = l.cells!.skipped.reduce((n, s) => n + s.count, 0);
    expect(l.cells!.written + lost).toBe(l.cells!.source);
    expect(l.cells!.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(['na-cell']));
    const text = panel([l]);
    expect(text).not.toContain('fault of the converter');
    expect(text).not.toContain('do not publish');
  });

  it('a long presence list: an absence mark and an NA have a reason, with no cell column to put it in', () => {
    const rows: Cell[][] = [[...fr('a'), 'Solea solea', 'x'], [...fr('b'), 'Gadus morhua', 'NA'], [...fr('c'), 'Gadus morhua', 0]];
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Present'], rows), { shape: 'long', presenceOnly: true, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' } } })], options: {} }).ledger[0];
    expect(l.rows.unexplained).toBe(0);
    expect(l.balanced).toBe(true);
  });
});

describe('4. the reasons of a row are the reasons of its cells, and a line that wrote an event is written', () => {
  const sheet = (rows: Cell[][]): SheetLedger => convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus', 'Oithona similis'], rows), { shape: 'wide', quantity: { kind: 'count' } })], options: {} }).ledger[0];

  it('empty cells are not "NA cells", and a zero beside a blank is a zero', () => {
    const l = sheet([[...fr('a'), null, null], [...fr('b'), null, 0], [...fr('c'), 2, 1]]);
    expect(JSON.stringify(l.rows.skipped) + JSON.stringify(l.cells!.skipped)).not.toContain('na-cell');
    expect(l.cells!.skipped).toEqual([{ reason: 'zero', count: 1 }]);
    expect(l.cells).toMatchObject({ source: 3, written: 2, unexplained: 0 });
  });

  it('[0, -5] is a zero and a negative, each counted as itself, and the line says how many cells it lost', () => {
    const l = sheet([[...fr('a'), 0, -5], [...fr('b'), 2, 1]]);
    expect(l.cells!.skipped).toEqual([{ reason: 'zero', count: 1 }, { reason: 'negative', count: 1 }]);
    expect(l.rows.skipped.map((s) => s.reason)).not.toContain('zero');
    expect(l.lines.find((x) => x.line === 2)).toMatchObject({ fate: 'written', cells: { written: 0, lost: 2 }, chain: expect.arrayContaining(['zero', 'negative']) });
  });

  it('three rows that each have an event and a measurement are three written rows, and the panel says what two of them wrote', () => {
    const header = [...base, 'Calanus finmarchicus', 'Temperature [C]'];
    const rows: Cell[][] = [[...fr('a'), 3, 11], [...fr('b'), 0, 12], [...fr('c'), null, 13]];
    const l = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, 'Temperature [C]': { kind: 'variable', variable: 'Temperature', unit: 'C' } } })], options: {} }).ledger[0];
    expect(l.rows).toMatchObject({ source: 3, written: 3, writtenNoOccurrence: 2, unexplained: 0 });
    expect(l.lines.filter((x) => x.wrote !== undefined && !x.wrote.includes('occurrence')).map((x) => x.line)).toEqual([3, 4]);
    const text = panel([l]);
    expect(text).toContain('2 rows wrote an event or a measurement and no occurrence');
    expect(text).not.toContain('3 rows: 1 with a record');
  });
});

describe('5. a column of text is not a numeric column', () => {
  it('an ignored Notes column does not stop the sentence, and is not called numeric', () => {
    const header = [...base, 'Calanus finmarchicus', 'Notes'];
    const l = convert({ sheets: [sheetInput(fileOf(header, [[...fr('a'), 3, 'rough sea'], [...fr('b'), 4, 'calm']]), { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Notes: { kind: 'ignore' } } })], options: {} }).ledger[0];
    const notes = l.columns.find((c) => c.header === 'Notes')!;
    expect(notes).toMatchObject({ to: 'not-written', numbers: 0, nonNumbers: 2 });
    const text = panel([l]);
    expect(text).toContain(SENTENCE);
    expect(text).not.toMatch(/numeric column/i);
    expect(text).toContain('Columns that are not written at all');
  });

  it('a numeric column that is not written still stops it', () => {
    const header = [...base, 'Calanus finmarchicus', 'Gear no'];
    const l = convert({ sheets: [sheetInput(fileOf(header, [[...fr('a'), 3, 7], [...fr('b'), 4, 8]]), { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, 'Gear no': { kind: 'ignore' } } })], options: {} }).ledger[0];
    const text = panel([l]);
    expect(text).not.toContain(SENTENCE);
    expect(text).toContain('1 numeric column is not written at all');
  });

  it('marks written on a presence sheet are not "not read"', () => {
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus'], [[...fr('a'), 'x'], [...fr('b'), 'x']]), { shape: 'wide', presenceOnly: true })], options: {} }).ledger[0];
    const c = l.columns.find((x) => x.header === 'Calanus finmarchicus')!;
    expect(c).toMatchObject({ written: 2, writtenWithoutValue: 2, nonNumbers: 0 });
    const text = panel([l]);
    expect(text).not.toContain('are not read');
    expect(text).toContain('2 written as a mark');
  });
});

describe('6. while the export is stopped the panel says what would be written, and the columns too', () => {
  const l = (): SheetLedger => convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus'], [[...fr('a'), 3], [...fr('b'), 4]]), { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' } } })], options: {} }).ledger[0];

  it('blocked: "Would be written", never "Written:"', () => {
    const text = panel([l()], true);
    expect(text).toContain('Would be written: 2');
    expect(text).not.toMatch(/Written: \d/);
    expect(text).toContain('2 cells in the taxon columns: 2 would be written');
  });

  it('not blocked: "Written:"', () => {
    const text = panel([l()], false);
    expect(text).toMatch(/Written: 2/);
    expect(text).not.toContain('Would be written');
  });
});

describe('long lists of columns are cut at 50, with a way to see them all', () => {
  it('shows 50 and a button for the rest', () => {
    const header = [...base, ...Array.from({ length: 80 }, (_, i) => `Taxon genus${i}`)];
    const rows: Cell[][] = [[...fr('a'), ...Array.from({ length: 80 }, (_, i) => i + 1)]];
    const l = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'wide', quantity: { kind: 'count' } })], options: {} }).ledger[0];
    const { container } = render(<ConvertLedger ledger={[l]} />);
    expect(container.querySelectorAll('li').length).toBeLessThanOrEqual(52);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Show all 80')!;
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(80);
  });
});

describe('round 2: what the panel says', () => {
  const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Parameter', 'Value', 'Unit'];
  const longRows = (params: [string, number, string | null][]): Cell[][] => ['S1', 'S2'].flatMap((st) => params.map(([p, v, u]): Cell[] => [st, '2020-06-01', 49.4, 0.2, p, v, u]));
  const pivoted = (rows: Cell[][], edit: Record<string, ColumnRole> = {}) => convert({ sheets: [sheetInput(pivotConvertFile(fileOf(H, rows, 'Long'), {}), { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, ...edit } })], options: {} });

  it('a pivot with Parameter = Depth: no fault, no "do not publish"', () => {
    const text = panel(pivoted(longRows([['Temperature', 11, 'C'], ['Depth', 5, 'm'], ['Salinity', 34, 'PSU']])).ledger);
    expect(text).not.toContain('fault of the converter');
    expect(text).not.toContain('do not publish');
    expect(text).toContain(SENTENCE);
  });

  it('a pivot of species: the lines written are the occurrences, never "0 with a record"', () => {
    const r = pivoted(longRows([['Calanus finmarchicus', 4, null], ['Oithona similis', 7, null]]), { 'Calanus finmarchicus': { kind: 'taxon', header: true }, 'Oithona similis': { kind: 'taxon', header: true } });
    expect(r.occurrences).toHaveLength(4);
    const text = panel(r.ledger);
    expect(text).toContain('In the sheet, 4 rows: 4 with a record');
    expect(text).not.toMatch(/: 0 with a record/);
    expect(text).not.toContain('fault of the converter');
  });

  it('a taxon with a weight and no quantity column: the page says there is no quantity column, not that there is no taxon', () => {
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Weight [g]'], [[...fr('a'), 'Solea solea', 2.5]]), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' } } })], options: {} }).ledger;
    const text = panel(l);
    expect(text).toContain('no quantity column');
    expect(text).not.toContain('no taxon');
    expect(text).not.toContain(SENTENCE);
  });

  it('a row with only a position: it is named, and the sentence is not said', () => {
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Count'], [[...fr('a'), 'Solea solea', 3], [null, null, 49.4, 0.2, null, null]]), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } } })], options: {} }).ledger;
    const text = panel(l);
    expect(text).toContain('rows with a number but no taxon');
    expect(text).not.toContain(SENTENCE);
    expect(text).not.toContain('rows with nothing to record');
  });

  it('wide rows that wrote only an event: the count is shown while the export is stopped too, as "would"', () => {
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Calanus finmarchicus'], [[...fr('a'), 3], [...fr('b'), 0]]), { shape: 'wide', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' } } })], options: {} }).ledger;
    expect(panel(l, false)).toContain('1 row wrote an event or a measurement and no occurrence');
    cleanup();
    expect(panel(l, true)).toContain('1 row would write an event or a measurement and no occurrence');
  });
});

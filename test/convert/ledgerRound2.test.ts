// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ledger, fix round 2: a pivoted long sheet whatever its columns are read as (with a fuzz), a long line is written only with its occurrence, a taxon with a weight and no quantity column,
// a row that holds a position, and the physical line of every fate. Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { LEDGER_REASONS, NOT_UNDERSTOOD } from '../../src/core/convert/ledger';
import type { SheetLedger } from '../../src/core/convert/ledger';
import { pivotConvertFile } from '../../src/core/convert/pivot';
import { readConvertFile } from '../../src/core/convert/read';
import type { ColumnRole } from '../../src/core/types';
import { textFile } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const base = ['Sample', 'Date', 'Latitude', 'Longitude'];
const fr = (s: string): Cell[] => [s, '2020-06-01', 49.4, 0.2];
const fateOf = (l: SheetLedger, line: number): string | undefined => l.lines.find((x) => x.line === line)?.fate;

/** What must hold for the ledger of every sheet: the lines add up, each once, and nothing is without a fate. */
function expectLinesAgree(l: SheetLedger, physical: ReadonlySet<number>, sourceRows: number): void {
  expect(l.rows.source).toBe(sourceRows);
  const counted = l.rows.written + l.rows.skipped.reduce((n, s) => n + s.count, 0) + l.rows.unexplained;
  expect(counted).toBe(sourceRows);
  expect(l.rows.unexplained).toBe(0);
  expect(l.lines.filter((x) => x.fate === 'unexplained')).toEqual([]);
  const seen = l.lines.map((x) => x.line);
  expect(new Set(seen).size).toBe(seen.length);
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  for (const x of seen) expect(physical.has(x)).toBe(true);
  expect(l.lines.length).toBe(sourceRows - l.rows.written);
  for (const x of l.lines) expect(x.fate === 'written' || (LEDGER_REASONS as readonly string[]).includes(x.fate)).toBe(true);
  expect(l.balanced).toBe(true);
}

describe('round 2, item 1: a pivoted long sheet, whatever its columns are read as', () => {
  const H = ['Station', 'Date', 'Latitude', 'Longitude', 'Parameter', 'Value', 'Unit'];
  const longRows = (params: [string, number | string | null, string | null][]): Cell[][] => ['S1', 'S2'].flatMap((st) => params.map(([p, v, u]): Cell[] => [st, '2020-06-01', 49.4, 0.2, p, v, u]));
  const physical = (n: number): Set<number> => new Set(Array.from({ length: n }, (_, i) => i + 2));
  const run = (rows: Cell[][], edit?: Record<string, ColumnRole>) => {
    const piv = pivotConvertFile(fileOf(H, rows, 'Long'), {});
    expect(piv.sheets[0].pivot).toBeDefined();
    const r = convert({ sheets: [sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' }, ...(edit ?? {}) } })], options: {} });
    return { r, l: r.ledger[0], n: rows.length };
  };

  it('Parameter = Depth (a column read for the events, on default mappings): no line is unexplained', () => {
    const { l, n } = run(longRows([['Temperature', 11, 'C'], ['Depth', 5, 'm'], ['Salinity', 34, 'PSU']]));
    expectLinesAgree(l, physical(n), n);
    expect(l.kind).toBe('wide');
  });

  it('species as parameters: the occurrences written are the lines written, and a lost cell does not list a line twice', () => {
    const rows = longRows([['Calanus finmarchicus', 4, null], ['Oithona similis', 0, null], ['Temperature', 11, 'C']]);
    const { r, l, n } = run(rows, { 'Calanus finmarchicus': { kind: 'taxon', header: true }, 'Oithona similis': { kind: 'taxon', header: true } });
    expect(r.occurrences.length).toBeGreaterThan(0);
    expectLinesAgree(l, physical(n), n);
    expect(l.rows.written).toBe(r.occurrences.length + r.measurements.filter((m) => m.role === 'variable').length);
    expect(fateOf(l, 3)).toBe('zero');
    expect(fateOf(l, 6)).toBe('zero');
  });

  it('an ignored column and an effort column are "column not read", not a fault', () => {
    const rows = longRows([['Temperature', 11, 'C'], ['Gear no', 7, null], ['Volume', 12.5, 'm3']]);
    const { l, n } = run(rows, { 'Gear no': { kind: 'ignore' }, 'Volume [m3]': { kind: 'ignore' } });
    expectLinesAgree(l, physical(n), n);
    expect(fateOf(l, 3)).toBe('column-not-read');
    expect(fateOf(l, 4)).toBe('column-not-read');
  });

  it('a pivot whose events are settled afterwards (Month and Day with no Year as parameters) stays accounted for', () => {
    const rows = longRows([['Month', 6, null], ['Day', 14, null], ['Temperature', 11, 'C']]);
    const { l, n } = run(rows, { 'Month': { kind: 'datePart', part: 'month' }, 'Day': { kind: 'datePart', part: 'day' } });
    expectLinesAgree(l, physical(n), n);
    expect(fateOf(l, 2)).toBe('column-not-read');
  });

  it('pivot fuzz: random parameters, values, blanks, repeats, flags, ragged lines and random roles; every line of the long file has one fate', () => {
    let seed = 20261103;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const HD = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
    const params = ['Temperature', 'Salinity', 'Depth', 'Calanus finmarchicus', 'Oithona similis', 'Notes', 'Volume', 'Temperature_QC', 'Oxygen', '', ''];
    const values: Cell[] = [null, '', 0, -3, 7.5, 12, 12, 'x', 'NA', '5 g', 1, 1];
    const roles: (ColumnRole | undefined)[] = [undefined, undefined, { kind: 'ignore' }, { kind: 'taxon', header: true }, { kind: 'depth', positive: 'down' }, { kind: 'effort' }, { kind: 'variable', variable: 'v' }];
    let pivots = 0;
    let profiles = 0;
    let bad = 0;
    for (let i = 0; i < 400; i++) {
      const n = 3 + Math.floor(rnd() * 14);
      const profile = rnd() < 0.3;
      // (a profile reads its levels from the Depth parameter: no depth key column there)
      const lines: string[] = [(profile ? HD.filter((h) => h !== 'Depth [m]') : HD).join(',')];
      for (let k = 0; k < n; k++) {
        const f = [pick(['S1', 'S1', 'S2', '']), '2020-06-01', '49.4', '0.2', ...(profile ? [] : [pick(['1', '2', ''])]), pick(params), String(pick(values) ?? ''), pick(['C', 'm', '', 'PSU'])];
        lines.push((rnd() < 0.08 ? [...f, '99'] : f).join(','));
      }
      const file = readConvertFile(textFile('long.csv', lines.join('\n') + '\n'));
      const piv = pivotConvertFile(file, {});
      const sheet = piv.sheets[0];
      if (sheet.pivot === undefined) continue;
      pivots++;
      const physicalLines = new Set(file.sheets[0].rows.map((r) => r.line));
      const edit: Record<string, ColumnRole> = {};
      for (const h of sheet.header.slice(sheet.header.length - sheet.pivot.pivoted.length)) {
        const role = pick(roles);
        if (role !== undefined) edit[h] = role;
      }
      if (!profile && rnd() < 0.5) edit['Station'] = { kind: 'sampleId' };
      const r = convert({ sheets: [sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, presenceOnly: !profile && rnd() < 0.2, ...(profile ? { profile: { depthIds: rnd() < 0.7 } } : {}), edit })], options: { fullList: rnd() < 0.3 } });
      if (profile) profiles++;
      for (const l of r.ledger) {
        try {
          expectLinesAgree(l, physicalLines, file.sheets[0].rows.length);
        } catch (e) {
          bad++;
          if (bad === 1) throw new Error(`run ${i}: ${(e as Error).message}\n${lines.join('\n')}\nroles ${JSON.stringify(edit)}\n${JSON.stringify(l.rows)} ${JSON.stringify(l.lines)}`);
        }
      }
    }
    expect(pivots).toBeGreaterThan(150);
    expect(profiles).toBeGreaterThan(40);
    expect(bad).toBe(0);
  }, 120_000);
});

describe('round 3: a pivoted sheet read as a profile, and a value the event did not take', () => {
  const HP = ['Station', 'Date', 'Depth [m]', 'Parameter', 'Value', 'Unit'];
  const S1: Cell[][] = [['S1', '2020-06-01', 1, 'Temperature', 11, 'C'], ['S1', '2020-06-01', 1, 'Salinity', 34, 'PSU'], ['S2', '2020-06-01', 2, 'Temperature', 12, 'C'], ['S2', '2020-06-01', 2, 'Salinity', 35, 'PSU']];
  const pivoted = (rows: Cell[][], header = HP, extra: Record<string, unknown> = {}, edit: Record<string, ColumnRole> = {}) => {
    const piv = pivotConvertFile(fileOf(header, rows, 'Long'), {});
    expect(piv.sheets[0].pivot).toBeDefined();
    return convert({ sheets: [sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, ...extra, edit })], options: {} });
  };
  const physical = (n: number): Set<number> => new Set(Array.from({ length: n }, (_, i) => i + 2));

  it('a profile sheet with Parameter = Depth: every line has a fate (the level opened its event)', () => {
    const rows: Cell[][] = [['S1', '2020-06-01', 'Temperature', 11, 'C'], ['S1', '2020-06-01', 'Depth', 1, 'm'], ['S2', '2020-06-01', 'Temperature', 12, 'C'], ['S2', '2020-06-01', 'Depth', 2, 'm']];
    const r = pivoted(rows, ['Station', 'Date', 'Parameter', 'Value', 'Unit'], { profile: { depthIds: true } });
    expectLinesAgree(r.ledger[0], physical(4), 4);
    expect(r.ledger[0].kind).toBe('profile');
  });

  it('Depth = deep: the line is not written, because no event has a depth; the other lines are', () => {
    const rows: Cell[][] = [['S1', '2020-06-01', null, 'Temperature', 11, 'C'], ['S1', '2020-06-01', null, 'Depth', 'deep', 'm'], ['S2', '2020-06-01', null, 'Temperature', 12, 'C'], ['S2', '2020-06-01', null, 'Depth', 5, 'm']];
    const r = pivoted(rows, HP, {}, { Station: { kind: 'sampleId' }, 'Depth [m]': { kind: 'ignore' } });
    const l = r.ledger[0];
    expectLinesAgree(l, physical(4), 4);
    expect(l.lines.map((x) => [x.line, x.fate])).toEqual([[3, 'not-in-event']]);
    expect(r.events.filter((e) => e.eventType === 'sample').map((e) => e.depthMin)).toEqual([undefined, 5]);
  });

  it('Latitude = 999 is kept: the event carries 999 as written, so the line is written (a coordinate out of range is for the output check to say)', () => {
    const rows: Cell[][] = [['S1', '2020-06-01', 1, 'Latitude', 999, 'deg'], ['S1', '2020-06-01', 1, 'Longitude', 0.2, 'deg'], ['S2', '2020-06-01', 2, 'Latitude', 49.4, 'deg'], ['S2', '2020-06-01', 2, 'Longitude', 0.3, 'deg']];
    const r = pivoted(rows, HP, {}, { Station: { kind: 'sampleId' } });
    expectLinesAgree(r.ledger[0], physical(4), 4);
    expect(r.events.find((e) => e.id === 'S1')!.lat).toBe(999);
    expect(r.ledger[0].lines).toEqual([]);
  });
});

describe('round 2, item 2: a long line with a taxon is written only with its occurrence', () => {
  const header = [...base, 'Species', 'Count', 'Weight [g]'];
  const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' } };
  const rows: Cell[][] = [
    [...fr('a'), 'Solea solea', 3, 1.5],
    [...fr('b'), 'Gadus morhua', 0, 2.5], // first of its sample, zero beside a weight
    [...fr('c'), 'Gadus morhua', -2, null], // first of its sample, negative
    [...fr('d'), 'Gadus morhua', 2.5, null], // first of its sample, not a whole number
    [...fr('e'), 'Gadus morhua', 0, null], // first of its sample, zero
    [...fr('f'), 'Merlangius merlangus', 4, null],
  ];
  const run = (rs: Cell[][]) => convert({ sheets: [sheetInput(fileOf(header, rs), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} });

  it('says the occurrences, in any order of the same rows', () => {
    const results = [rows, [...rows].reverse(), [rows[3], rows[0], rows[5], rows[1], rows[4], rows[2]]].map(run);
    for (const r of results) {
      expect(r.occurrences).toHaveLength(2);
      expect(r.ledger[0].rows.written).toBe(2);
      expect(r.ledger[0].balanced).toBe(true);
    }
  });

  it('a first row of a sample that is a zero, negative, not whole or zero-with-biomass has the reason as its fate and says it opened an event', () => {
    const l = run(rows).ledger[0];
    expect(l.lines.map((x) => [x.line, x.fate])).toEqual([[3, 'zero-with-biomass'], [4, 'negative'], [5, 'not-integer'], [6, 'zero']]);
    for (const x of l.lines) {
      expect(x.fate).toBe(x.chain![0]);
      expect(x.wrote).toContain('event');
    }
    expect(l.rows.writtenNoOccurrence).toBeUndefined();
  });
});

describe('round 2, item 3: a taxon with a weight and no quantity column', () => {
  it('has its own reason, not "no taxon"', () => {
    const l = convert({ sheets: [sheetInput(fileOf([...base, 'Species', 'Weight [g]'], [[...fr('a'), 'Solea solea', 2.5], [...fr('b'), 'Gadus morhua', 3.5]]), { shape: 'long', quantity: { kind: 'count' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, 'Weight [g]': { kind: 'biomass', basis: 'wet' } } })], options: {} }).ledger[0];
    expect(l.lines.map((x) => x.fate)).toEqual(['taxon-no-quantity', 'taxon-no-quantity']);
    expect(l.notUnderstood).toBe(2);
    expect(NOT_UNDERSTOOD).toContain('taxon-no-quantity');
  });
});

describe('round 2, item 4: a row that holds a position or a depth is not "nothing to record"', () => {
  const header = [...base, 'Depth [m]', 'Species', 'Count'];
  const edit: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
  const run = (rows: Cell[][]) => convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit })], options: {} }).ledger[0];

  it('only a latitude and a longitude', () => {
    const l = run([[...fr('a'), null, 'Solea solea', 3], [null, null, 49.4, 0.2, null, null, null]]);
    expect(fateOf(l, 3)).toBe('position-no-taxon');
    expect(l.notUnderstood).toBe(1);
  });

  it('only a depth', () => {
    const l = run([[...fr('a'), null, 'Solea solea', 3], [null, null, null, null, 25, null, null]]);
    expect(fateOf(l, 3)).toBe('position-no-taxon');
  });

  it('a row with only a sample name, or date parts, is not "nothing to record" either: the sample would vanish', () => {
    const l = run([[...fr('a'), null, 'Solea solea', 3], ['s2', null, null, null, null, null, null], [null, '2020-06-02', null, null, null, null, null]]);
    expect(fateOf(l, 3)).toBe('sample-no-taxon');
    expect(fateOf(l, 4)).toBe('sample-no-taxon');
    expect(l.notUnderstood).toBe(2);
  });

  it('a row with nothing in a column that is read stays "nothing to record"', () => {
    const l = run([[...fr('a'), null, 'Solea solea', 3], [null, null, null, null, null, null, null]]);
    expect(fateOf(l, 3)).toBe('nothing-to-record');
    expect(l.notUnderstood).toBe(0);
  });

  it('a row with only year, month and day columns (s2, 2020, 6, 2) keeps its place', () => {
    const header = ['Sample', 'Year', 'Month', 'Day', 'Species', 'Count'];
    const dp: Record<string, ColumnRole> = { Sample: { kind: 'sampleId' }, Year: { kind: 'datePart', part: 'year' }, Month: { kind: 'datePart', part: 'month' }, Day: { kind: 'datePart', part: 'day' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' } };
    const l = convert({ sheets: [sheetInput(fileOf(header, [['a', 2020, 6, 1, 'Solea solea', 3], ['s2', 2020, 6, 2, null, null]]), { shape: 'long', quantity: { kind: 'count' }, edit: dp })], options: {} }).ledger[0];
    expect(fateOf(l, 3)).toBe('sample-no-taxon');
  });
});

describe('round 2, Task 8: every fate has the physical line of the file as it was loaded', () => {
  it('blank lines and a footer between the rows: the line numbers are the file\'s', () => {
    const text = 'Sample,Date,Latitude,Longitude,Calanus finmarchicus\n\na,2020-06-01,49.4,0.2,3\n\nb,2020-06-01,49.4,0.2,0\nTotal,,,,3\n';
    const file = readConvertFile(textFile('foot.csv', text));
    const physicalLines = text.split('\n').map((t, i) => [i + 1, t] as const);
    const l = convert({ sheets: [sheetInput(file, { shape: 'wide', quantity: { kind: 'count' } })], options: {} }).ledger[0];
    for (const x of l.lines) expect(physicalLines.find(([n]) => n === x.line)?.[1]).toMatch(/^(b|Total),/);
    expect(l.lines.map((x) => x.line)).toEqual([5, 6]);
    expect(l.inputIndex).toBe(0);
  });

  it('a pivot keeps the lines of the long file, and the sheet it came from can be found: inputIndex, file and sheet name', () => {
    const text = 'Station,Date,Latitude,Longitude,Parameter,Value,Unit\n\nS1,2020-06-01,49.4,0.2,Temperature,11,C\nS1,2020-06-01,49.4,0.2,Salinity,34,PSU\n\nS1,2020-06-01,49.4,0.2,Temperature,555,C\nS2,2020-06-01,49.4,0.2,Temperature,12,C\nS2,2020-06-01,49.4,0.2,Salinity,35,PSU\n';
    const file = readConvertFile(textFile('long.csv', text));
    const piv = pivotConvertFile(file, {});
    const r = convert({ sheets: [sheetInput(file, { shape: 'wide', edit: { Station: { kind: 'sampleId' } } }), sheetInput(piv, { shape: 'wide', quantity: { kind: 'count' }, edit: { Station: { kind: 'sampleId' } } })], options: {} });
    const l = r.ledger.find((x) => x.pivotRowsIn !== undefined)!;
    expect(l.inputIndex).toBe(1);
    expect(l.file).toBe('long.csv');
    expect(l.lines.map((x) => [x.line, x.fate])).toEqual([[6, 'repeated-parameter']]);
    expect(text.split('\n')[5]).toContain('555');
    // the original rows are those of the file before the pivot: the line is found there
    expect(file.sheets[0].rows.find((x) => x.line === 6)?.cells[5]).toBe('555');
  });
});

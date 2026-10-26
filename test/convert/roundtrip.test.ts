// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The sample code proposal must not damage data on the way back: convert(original sheet + the codes applied in memory) must equal
// convert(the downloaded CSV, parsed again), for events, occurrences, measurements and findings. Only the new code column may differ.
import { describe, expect, it } from 'vitest';
import { convert, listSplits } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { proposeSampleCodes } from '../../src/core/convert/ids';
import { readConvertFile } from '../../src/core/convert/read';
import { proposeConvertMapping, suggestConvertShape } from '../../src/core/convert/recognize';
import type { QuantityDeclaration } from '../../src/core/convert/quantity';
import type { ColumnRole, ParsedFile, SheetMapping } from '../../src/core/types';
import { isTimeOnlyFormat } from '../../src/core/parse/xlsx';
import { dateCell, textFile, xlsxFile } from '../helpers/files';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_ROWS, W2_HEADER, W2_ROWS, type Cell } from './helpers';

interface Case {
  name: string;
  header: string[];
  rows: Cell[][];
  quantity: QuantityDeclaration;
  edit?: Record<string, ColumnRole>;
}

const without = (header: string[], rows: Cell[][], drop: string): { header: string[]; rows: Cell[][] } => {
  const i = header.indexOf(drop);
  return { header: header.filter((_, k) => k !== i), rows: rows.map((r) => r.filter((_, k) => k !== i)) };
};

const CASES: Case[] = [
  { name: 'W1', ...without(W1_HEADER, W1_ROWS, 'Sample'), quantity: { kind: 'count', effort: { source: 'column' } } },
  { name: 'W2', ...without(W2_HEADER, W2_ROWS, 'Sample'), quantity: { kind: 'density', unit: '#/m3', effort: { source: 'column' } } },
  { name: 'L1', ...without(L1_HEADER, L1_ROWS, 'eventID'), quantity: { kind: 'count' } },
  { name: 'L2', ...without(L2_HEADER, L2_ROWS, 'Sample'), quantity: { kind: 'count' }, edit: { Stage: { kind: 'lifeStage' } } },
];

/** The CSV text of a sheet: comma-delimited with dots, or semicolon-delimited with decimal commas. */
function csvText(header: string[], rows: Cell[][], decimalComma: boolean): string {
  const cell = (c: Cell): string => (c === null ? '' : typeof c === 'number' ? (decimalComma ? String(c).replace('.', ',') : String(c)) : /[;",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const d = decimalComma ? ';' : ',';
  return [header, ...rows].map((r) => r.map(cell).join(d)).join('\n') + '\n';
}

function withCodes(file: ParsedFile, codes: string[], header: string): ParsedFile {
  const s = file.sheets[0];
  return {
    ...file,
    sheets: [{ ...s, header: [...s.header, header], rows: s.rows.map((r, i) => ({ ...r, cells: [...r.cells, codes[i]], fieldCount: r.fieldCount + 1 })) }],
  };
}

function input(file: ParsedFile, mapping: SheetMapping, c: Case): ConvertSheetInput {
  return { file, sheet: file.sheets[0].name, mapping, shape: suggestConvertShape(mapping.columns) ?? 'wide', quantity: c.quantity };
}

function roundTrip(original: ParsedFile, c: Case): { a: ReturnType<typeof convert>; b: ReturnType<typeof convert>; csv: string } {
  const ctx = { decimalComma: original.decimalComma, date1904: original.date1904 };
  const base = proposeConvertMapping(original.sheets[0], ctx);
  const mapping0: SheetMapping = { ...base, columns: base.columns.map((m) => (c.edit?.[m.header] ? { ...m, role: c.edit[m.header] } : m)) };
  const p = proposeSampleCodes(original, original.sheets[0], mapping0);
  expect(p).toBeDefined();
  const width = original.sheets[0].header.length;
  const mapping1: SheetMapping = { ...mapping0, columns: [...mapping0.columns, { index: width, header: p!.header, role: { kind: 'sampleId' } }] };
  const inMemory = withCodes(original, p!.codes, p!.header);
  // the converter's reading path: the formula guard of the proposal CSV comes off every text cell and header
  const reparsed = readConvertFile(textFile(original.fileName, p!.csv));
  const approve = (f: ParsedFile) => Object.fromEntries(listSplits({ sheets: [input(f, mapping1, c)] }).filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed]));
  const run = (f: ParsedFile) => convert({ sheets: [input(f, mapping1, c)], options: { fullList: true }, approvedSplits: approve(f) });
  return { a: run(inMemory), b: run(reparsed), csv: p!.csv };
}

const same = (x: ReturnType<typeof convert>, y: ReturnType<typeof convert>): void => {
  expect(y.events).toEqual(x.events);
  expect(y.occurrences).toEqual(x.occurrences);
  expect(y.measurements).toEqual(x.measurements);
  // the findings the PARSER raised about the input file (IN-*: a 1904 workbook, a guessed encoding) describe that file, not the data: the re-read CSV is another file
  const dataFindings = (r: ReturnType<typeof convert>) => r.findings.filter((f) => !f.ruleId.startsWith('IN-'));
  expect(dataFindings(y)).toEqual(dataFindings(x));
  expect(y.tree).toEqual(x.tree);
};

describe('CSV sources', () => {
  for (const decimalComma of [false, true]) {
    for (const c of CASES) {
      it(`${c.name}, ${decimalComma ? 'decimal comma (;)' : 'comma'}: the downloaded CSV is read back as the sheet was`, () => {
        const original = textFile('src.csv', csvText(c.header, c.rows, decimalComma));
        expect(original.decimalComma).toBe(decimalComma);
        const { a, b, csv } = roundTrip(original, c);
        expect(a.events.length).toBeGreaterThan(0);
        expect(a.occurrences.length).toBeGreaterThan(0);
        same(a, b);
        // the file keeps its delimiter and its decimal marks
        expect(csv.split('\n')[0].includes(decimalComma ? ';' : ',')).toBe(true);
        expect(textFile('back.csv', csv).decimalComma).toBe(decimalComma);
      });
    }
  }

  it('presence marks and negative values come back as they were (no apostrophe is added to + or -)', () => {
    const c: Case = { name: 'marks', header: ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'], rows: [['S', 55, 3, '2020-01-01', '+', 4], ['S', 55, 3, '2020-01-02', 'x', 5], ['S', 56, 3, '2020-01-03', 3, -2]], quantity: { kind: 'count' } };
    const original = textFile('marks.csv', csvText(c.header, c.rows, false));
    const { a, b, csv } = roundTrip(original, c);
    expect(csv).toContain(',+,');
    expect(csv).not.toContain("'+");
    expect(csv).not.toContain("'-");
    same(a, b);
    expect(a.occurrences.some((o) => o.occurrenceRemarks === '+')).toBe(true);
    expect(a.findings.some((f) => f.ruleId === 'CONV-NEGATIVE-QUANTITY')).toBe(true);
  });
});

describe('formula-looking text round-trips (the peer repro: a Uwagi column)', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis', 'Uwagi'];
  const rows: Cell[][] = [
    ['S1', '-54.60', '-5.30', '2020-01-01', '@notatka', 4, '@notatka'],
    ['S1', '-54.60', '-5.30', '2020-01-02', '=SUM(A1:A2)', '+', '=SUM(A1:A2)'],
    ['=ST', '-5.30', '-10', '2020-01-03', '-ok', '-10', '-ok'],
    ['@st', '-54.60', '-5.30', '2020-01-04', 3, '+', ' =lead'],
    ['S5', '-54.60', '-5.30', '2020-01-05', '＝full', '\t=tab', "'already"],
  ];
  const taxon: ColumnRole = { kind: 'taxon', header: true };
  const c: Case = { name: 'uwagi', header, rows, quantity: { kind: 'count' }, edit: { 'Calanus finmarchicus': taxon, 'Oithona similis': taxon } };
  const original = (): ParsedFile => textFile('uwagi.csv', csvText(header, rows, false));
  const codesOf = (file: ParsedFile) => proposeSampleCodes(file, file.sheets[0], proposeConvertMapping(file.sheets[0], { decimalComma: false, date1904: false }))!;

  it('convert(original + codes in memory) deep-equals convert(re-uploaded): events, occurrences with their occurrenceRemarks, measurements, findings', () => {
    const { a, b, csv } = roundTrip(original(), c);
    same(a, b);
    // the cells of the sheet are written guarded, and the guard is what is taken off
    for (const guarded of ["'@notatka", "'=SUM(A1:A2)", "'-ok", "'＝full", "' =lead"]) expect(csv, guarded).toContain(guarded);
    // the remarks really carry the text, and the negatives keep their figures
    const remarks = a.occurrences.map((o) => o.occurrenceRemarks).filter((r): r is string => r !== undefined);
    expect(remarks).toEqual(expect.arrayContaining(['@notatka', '=SUM(A1:A2)', '-ok', '+', '＝full']));
    expect(b.occurrences.map((o) => o.occurrenceRemarks)).toEqual(a.occurrences.map((o) => o.occurrenceRemarks));
    expect(a.findings.some((f) => f.ruleId === 'CONV-NEGATIVE-QUANTITY')).toBe(true);
    expect(csv).toContain('-54.60');
    expect(csv).toContain('-5.30');
    expect(csv).not.toContain("'-54.60");
    expect(csv).not.toContain("'-10");
    // a bare + stays a bare +
    expect(csv).toContain(',+,');
    expect(csv).not.toContain("'+,");
  });

  it('every cell and every header of the sheet comes back as it was, the Uwagi column included (not only what the converter reads)', () => {
    const file = original();
    const p = codesOf(file);
    const back = readConvertFile(textFile('back.csv', p.csv)).sheets[0];
    const before = withCodes(file, p.codes, p.header).sheets[0];
    expect(back.header).toEqual(before.header);
    expect(back.rows.map((r) => r.cells)).toEqual(before.rows.map((r) => r.cells));
  });

  it("without the converter's reading path the apostrophe stays (the bug this fixes), and the checker's reader is not changed", () => {
    const file = original();
    const p = codesOf(file);
    const plain = textFile('plain.csv', p.csv).sheets[0];
    expect(plain.rows[0].cells[6]).toBe("'@notatka");
    expect(plain.rows[1].cells[6]).toBe("'=SUM(A1:A2)");
    expect(readConvertFile(textFile('plain.csv', p.csv)).sheets[0].rows[0].cells[6]).toBe('@notatka');
  });

  it('a text that already starts with an apostrophe and a formula character survives (the reversible guard adds one more)', () => {
    const file = textFile('apos.csv', "Station,Uwagi\nS,'=x\nT,''@y\n");
    const p = proposeSampleCodes(file, file.sheets[0], { sheet: 'apos.csv', columns: [{ index: 0, header: 'Station', role: { kind: 'station' } }] })!;
    expect(p.csv).toContain("S,''=x");
    const back = readConvertFile(textFile('apos2.csv', p.csv)).sheets[0];
    expect(back.rows.map((r) => r.cells[1])).toEqual(["'=x", "''@y"]);
  });
});

// the workbook's sheet is named like the file, as a CSV's sheet is: the only name a re-read CSV can have
describe('presence marks with spaces (round 4)', () => {
  it('"+ ", " +" and " x" are written as they were, with no apostrophe, and read back the same', () => {
    const c: Case = {
      name: 'spaced marks',
      header: ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'],
      rows: [['S', 55, 3, '2020-01-01', '+ ', 4], ['S', 55, 3, '2020-01-02', ' +', 5], ['S', 56, 3, '2020-01-03', ' x', 2]],
      quantity: { kind: 'count' },
    };
    const original = textFile('spaced.csv', csvText(c.header, c.rows, false));
    const { a, b, csv } = roundTrip(original, c);
    same(a, b);
    for (const cell of ['+ ', ' +', ' x']) expect(csv).toContain(`,${cell},`);
    expect(csv).not.toContain("'");
    expect(a.occurrences.filter((o) => o.occurrenceRemarks === '+' || o.occurrenceRemarks === 'x')).toHaveLength(3);
    // a real formula next to them is still guarded
    const f = textFile('f.csv', 'Station,Species\n=1+1,\n');
    expect(proposeSampleCodes(f, f.sheets[0], { sheet: 'f.csv', columns: [{ index: 0, header: 'Station', role: { kind: 'station' } }] })!.csv).toContain("'=1+1");
  });
});

describe('xlsx sources', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
  const rows = (): (string | number | null | ReturnType<typeof dateCell>)[][] => [
    ['S1', 55.5, 2.5, dateCell(45000), 10, 4.5],
    ['S1', 55.5, 2.5, { t: 'n', v: 45000.5, z: 'yyyy-mm-dd hh:mm' }, 7, 3],
    ['S2', 55.9, 3.1, dateCell(45002), 0, 2],
  ];
  const c: Case = { name: 'xlsx', header, rows: [], quantity: { kind: 'density', unit: '#/m3' } };

  for (const date1904 of [false, true]) {
    it(`numbers are written with a dot and date or date-time cells as ISO text, never as serials (${date1904 ? '1904' : '1900'} date system)`, () => {
      const original = xlsxFile('src.xlsx', { 'src.xlsx': [header, ...rows()] }, date1904 ? { Workbook: { WBProps: { date1904: true } } } : undefined);
      expect(original.date1904).toBe(date1904);
      expect(original.sheets[0].dateFormatted?.[3]).toBe(true);
      const { a, b, csv } = roundTrip(original, c);
      same(a, b);
      const lines = csv.trim().split('\n').map((l) => l.split(','));
      expect(lines[1][3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lines[2][3]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(lines.slice(1).map((l) => l[1])).toEqual(['55.5', '55.5', '55.9']);
      expect(csv).not.toContain('45000');
      expect(a.events.find((e) => e.eventType === 'sample' && e.eventDate?.includes('T'))).toBeDefined();
    });
  }
});

describe('xlsx time-only cells (round 3)', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Time', 'Calanus finmarchicus', 'Oithona similis'];
  const timeCell = (v: number, z: string) => ({ t: 'n', v, z }) as const;
  const rows = () => [
    ['S1', 55.5, 2.5, dateCell(45000), timeCell(0.5, 'hh:mm'), 10, 4],
    ['S1', 55.5, 2.5, dateCell(45000), timeCell(0.5 + 30 / 86400, 'h:mm:ss'), 7, 3],
    ['S2', 55.9, 3.1, dateCell(45002), timeCell(0.25, '[h]:mm'), 0, 2],
  ];
  const c: Case = { name: 'xlsx time', header, rows: [], quantity: { kind: 'density', unit: '#/m3' } };

  for (const date1904 of [false, true]) {
    it(`a Date column and a Time column come back with the same eventDate (${date1904 ? '1904' : '1900'} date system): time of day as HH:MM or HH:MM:SS, no 1899 or 1904 date, no unparseable-date finding`, () => {
      const original = xlsxFile('src.xlsx', { 'src.xlsx': [header, ...rows()] }, date1904 ? { Workbook: { WBProps: { date1904: true } } } : undefined);
      expect(original.sheets[0].timeFormatted?.[4]).toBe(true);
      expect(original.sheets[0].timeFormatted?.[3]).toBe(false);
      const { a, b, csv } = roundTrip(original, c);
      same(a, b);
      const lines = csv.trim().split('\n').map((l) => l.split(','));
      expect(lines.slice(1).map((l) => l[4])).toEqual(['12:00', '12:00:30', '06:00']);
      expect(csv).not.toMatch(/1899|1904-01-01/);
      // the time reached the event date, and nothing was reported as unparseable
      expect(a.events.filter((e) => e.eventType === 'sample').map((e) => (e.eventDate ?? '').slice(10))).toEqual(['T12:00', 'T12:00:30', 'T06:00']);
      expect(a.events.filter((e) => e.eventType === 'sample').every((e) => /T\d{2}:\d{2}/.test(e.eventDate ?? ''))).toBe(true);
      expect(a.findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    });

    it(`a [h]:mm duration over 24 h has no time of day: it is written as the number and read the same way before and after (${date1904 ? '1904' : '1900'})`, () => {
      const dur = [
        ['S1', 55.5, 2.5, dateCell(45000), timeCell(0.25, '[h]:mm'), 10, 4],
        ['S2', 55.9, 3.1, dateCell(45002), timeCell(1.5, '[h]:mm'), 7, 3],
      ];
      const original = xlsxFile('src.xlsx', { 'src.xlsx': [header, ...dur] }, date1904 ? { Workbook: { WBProps: { date1904: true } } } : undefined);
      const { a, b, csv } = roundTrip(original, c);
      same(a, b);
      expect(csv.trim().split('\n').map((l) => l.split(',')[4]).slice(1)).toEqual(['06:00', '1.5']);
      const bad = a.findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE');
      expect(bad).toHaveLength(1);
      expect(bad[0].value).toBe('1.5');
    });
  }

  it('the number format decides, not the value: 0.5 in a date format is a date, 0.5 in a time format is a time', () => {
    for (const [date1904, day] of [[false, '1899-12-30'], [true, '1904-01-01']] as const) {
      const wb = xlsxFile('src.xlsx', { 'src.xlsx': [['Station', 'Date', 'Time'], ['S1', dateCell(0.5), timeCell(0.5, 'hh:mm')]] }, date1904 ? { Workbook: { WBProps: { date1904: true } } } : undefined);
      const p = proposeSampleCodes(wb, wb.sheets[0], { sheet: 'src.xlsx', columns: [] })!;
      expect(p.csv.split('\n')[1]).toBe(`S1,${day}T12:00,12:00,sample-1`);
    }
  });
});

describe('isTimeOnlyFormat', () => {
  it.each(['hh:mm', 'h:mm', '[h]:mm', '[hh]:mm:ss', 'h:mm:ss', 'h:mm AM/PM', 'mm:ss', 'mm:ss.0', '[$-409]h:mm:ss AM/PM', 'hh:mm "UTC"'])('%s is a time of day', (z) => expect(isTimeOnlyFormat(z)).toBe(true));
  it.each(['mmm h:mm', 'mmmm h:mm', 'mmmmm h:mm', 'ddd h:mm', 'dddd h:mm', 'aaa h:mm', 'aaaa h:mm', 'gg h:mm', 'e h:mm', 'ggge h:mm'])('%s is a date-time, not time-only (month names, weekday and era tokens are date parts)', (z) => expect(isTimeOnlyFormat(z)).toBe(false));
  it.each(['yyyy-mm-dd', 'yyyy-mm-dd hh:mm', 'dd/mm/yyyy', 'd-mmm-yy', 'mmm', 'yyyy', 'dd.mm.yyyy h:mm'])('%s is not time-only', (z) => expect(isTimeOnlyFormat(z)).toBe(false));
});

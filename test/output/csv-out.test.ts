// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { guardText, toCleanCsv, valueText } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { Variable } from '../../src/core/types';
import { textFile } from '../helpers/files';
import { dataset, day, ok, row, text } from './ds';

/** CSV text back to a header + rows, through the project's own parser. */
function parse(csv: string): { header: string[]; rows: string[][] } {
  const sheet = textFile('out.csv', csv).sheets[0];
  return { header: sheet.header, rows: sheet.rows.map((r) => r.cells.map((c) => String(c ?? ''))) };
}
const v = (key: string, extra: Partial<Variable> = {}): Variable => ({ key, header: key, ...extra });

describe('numbers are never altered', () => {
  it('a negative number is exported unchanged, a decimal comma only loses its comma (only when the source file was decimal-comma)', () => {
    const ds = dataset(
      [row(2, { values: { a: ok('-5.2', 2, -5.2, 1), b: ok('3,14', 2, 3.14, 2), c: ok('1,50', 2, 1.5, 2), d: ok('+5.20', 2, 5.2, 2), e: ok('1.5e-3', 2, 0.0015, 4) } })],
      ['a', 'b', 'c', 'd', 'e'].map((k) => v(k)),
      { decimalComma: true },
    );
    const { rows } = parse(toCleanCsv(ds).csv);
    expect(rows[0].slice(-5)).toEqual(['-5.2', '3.14', '1.50', '+5.20', '1.5e-3']);
  });

  it('without decimalComma on the dataset the text is never converted', () => {
    expect(valueText('3,14')).toBe('3,14');
    expect(valueText('3,14', false)).toBe('3,14');
    expect(valueText('3,14', true)).toBe('3.14');
    const ds = dataset([row(2, { values: { b: text('3,14', 2) } })], [v('b')]);
    expect(parse(toCleanCsv(ds).csv).rows[0].slice(-1)).toEqual(['3,14']);
  });

  it('xlsx numbers are written with String(raw): no toFixed, no precision, no locale', () => {
    expect(valueText(0.30000000000000004)).toBe('0.30000000000000004');
    expect(valueText(1e-7)).toBe('1e-7');
    expect(valueText(12.5)).toBe('12.5');
    expect(valueText(-0.1)).toBe('-0.1');
    expect(valueText(123456789.123456789)).toBe(String(123456789.123456789));
  });

  it('keeps trailing zeros and leading zeros of the original text', () => {
    expect(valueText('2110.50')).toBe('2110.50');
    expect(valueText('007.5')).toBe('007.5');
    expect(valueText(' 5.0 ')).toBe('5.0');
  });

  it('a mixed thousands notation is text, not a number: it is not rewritten', () => {
    expect(valueText('1,234.5')).toBe('1,234.5');
  });
});

describe('formula guard is for text cells only', () => {
  it('guards = + @ - tab and CR starts of text', () => {
    expect(valueText('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(valueText('-abc')).toBe("'-abc");
    expect(valueText('+48 600')).toBe("'+48 600");
    expect(valueText('@cmd')).toBe("'@cmd");
    expect(valueText('\tx')).toBe("'\tx");
    expect(valueText('\rx')).toBe("'\rx");
  });

  it('guards a formula that follows leading spaces or tabs, and the full-width = + - @', () => {
    expect(valueText(' =SUM(A1)')).toBe("' =SUM(A1)");
    expect(valueText('   -abc')).toBe("'   -abc");
    expect(valueText(' \t+48 600')).toBe("' \t+48 600");
    expect(valueText('\t @cmd')).toBe("'\t @cmd");
    expect(valueText('＝1+1')).toBe("'＝1+1");
    expect(valueText('＋48 600')).toBe("'＋48 600");
    expect(valueText('－abc')).toBe("'－abc");
    expect(valueText('＠cmd')).toBe("'＠cmd");
    expect(valueText('  ＝SUM(A1)')).toBe("'  ＝SUM(A1)");
  });

  it('does not touch text where the formula character is not the first non-blank one', () => {
    expect(valueText(' abc =1')).toBe(' abc =1');
    expect(valueText('a ＝ b')).toBe('a ＝ b');
    expect(valueText('x－y')).toBe('x－y');
    expect(valueText(' 5 - 3 ok')).toBe(' 5 - 3 ok');
  });

  it('the guard also covers headers and the sidecar through the same function', () => {
    expect(guardText(' =HYPERLINK("x")')).toBe("' =HYPERLINK(\"x\")");
    expect(guardText('＝cmd')).toBe("'＝cmd");
    expect(guardText('plain')).toBe('plain');
  });

  it('leaves numbers, missing tokens and ordinary text alone', () => {
    expect(valueText('-5.2')).toBe('-5.2');
    expect(valueText('+5.2')).toBe('+5.2');
    expect(valueText('-')).toBe('-');
    expect(valueText('NA')).toBe('NA');
    expect(valueText('')).toBe('');
    expect(valueText(null)).toBe('');
    expect(valueText('abc-def')).toBe('abc-def');
  });

  it('guards text in station / cruise / sample_id and RFC 4180 quotes the result', () => {
    const ds = dataset([row(2, { station: '=1+1', cruise: 'C,"1"', sampleId: '-x', values: { a: text('=HYPERLINK("x")', 2) } })], [v('a')]);
    const { csv } = toCleanCsv(ds);
    const { header, rows } = parse(csv);
    expect(header.slice(0, 3)).toEqual(['station', 'cruise', 'sample_id']);
    expect(rows[0].slice(0, 3)).toEqual(["'=1+1", 'C,"1"', "'-x"]);
    expect(rows[0][rows[0].length - 1]).toBe(`'=HYPERLINK("x")`);
    expect(csv).toContain('"C,""1"""');
  });
});

describe('header and column rules', () => {
  it('fixed columns, then variables as `name [unit]`; no unit, no brackets', () => {
    const ds = dataset(
      [row(2, { station: 'ST1', lat: 76.5, lon: 15.1, latDecimals: 1, lonDecimals: 1, depth: 2.5, datetime: day('2021-07-25'), values: { DIC_umol_kg: ok('2110.5', 2, 2110.5, 1), Mystery: ok('7', 2, 7) } })],
      [v('DIC_umol_kg', { header: 'DIC_umol_kg', unit: 'µmol/kg', unitSource: 'header', p01: 'TCO2KG02' }), v('Mystery')],
    );
    const { csv, sidecar } = toCleanCsv(ds);
    const { header, rows } = parse(csv);
    expect(header).toEqual(['station', 'date [ISO 8601]', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth', 'DIC [µmol/kg]', 'Mystery']);
    expect(rows[0]).toEqual(['ST1', '2021-07-25', '76.5', '15.1', '2.5', '2110.5', '7']);
    const sc = parse(sidecar);
    expect(sc.header).toEqual(['original_column', 'output_column', 'unit', 'unit_source', 'p01']);
    expect(sc.rows.find((r) => r[1] === 'DIC [µmol/kg]')).toEqual(['DIC_umol_kg', 'DIC [µmol/kg]', 'µmol/kg', 'header', 'TCO2KG02']);
    expect(sc.rows.find((r) => r[1] === 'Mystery')).toEqual(['Mystery', 'Mystery', '', '', '']);
  });

  it('station / cruise / sample_id appear only when the dataset has them', () => {
    const { header } = parse(toCleanCsv(dataset([row(2, { cruise: 'C19' })])).csv);
    expect(header).toEqual(['cruise', 'date [ISO 8601]', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth']);
  });

  it('duplicate output names get a numeric suffix', () => {
    const ds = dataset(
      [row(2, { values: { 'A#1': ok('1', 2, 1), 'A#2': ok('2', 2, 2), s: ok('3', 2, 3) } })],
      [v('A#1', { header: 'DIC' }), v('A#2', { header: 'DIC' }), v('s', { header: 'date', unit: 'ISO 8601' })],
    );
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.slice(-3)).toEqual(['DIC', 'DIC_2', 'date_2 [ISO 8601]']);
    expect(rows[0].slice(-3)).toEqual(['1', '2', '3']);
  });

  it('keeps a source depth in cm and does not convert it', () => {
    const ds = dataset([row(2, { depth: 250 })], [], {
      mappings: [{ sheet: 'a.csv', columns: [{ index: 0, header: 'Depth_cm', role: { kind: 'depth', positive: 'down', unit: 'cm' } }] }],
    });
    const { csv, sidecar } = toCleanCsv(ds);
    const { header, rows } = parse(csv);
    expect(header[header.length - 1]).toBe('depth [cm]');
    expect(rows[0][rows[0].length - 1]).toBe('250');
    expect(parse(sidecar).rows.find((r) => r[1] === 'depth [cm]')).toEqual(['Depth_cm', 'depth [cm]', 'cm', 'header', '']);
  });

  it('a depth with no stated unit gets no unit (never invented) and a sidecar note', () => {
    const { csv, sidecar } = toCleanCsv(dataset([row(2, { depth: 5 })]));
    expect(parse(csv).header).toContain('depth');
    expect(parse(sidecar).rows).toContainEqual(['(note)', 'depth unit not stated in the source; the column has no unit', '', '', '']);
  });

  it('writes a depth at its reported precision (2.50 stays 2.50)', () => {
    const { csv } = toCleanCsv(dataset([row(2, { depth: 2.5, depthDecimals: 2 })]));
    const { rows } = parse(csv);
    expect(rows[0][rows[0].length - 1]).toBe('2.50');
  });
});

describe('dates', () => {
  const dates = (ds: ReturnType<typeof dataset>) => parse(toCleanCsv(ds).csv).rows.map((r) => r[0]);
  const notes = (ds: ReturnType<typeof dataset>) => parse(toCleanCsv(ds).sidecar).rows.filter((r) => r[0] === '(note)').map((r) => r[1]);

  it('utc keeps / gets the trailing Z; the year-only date stays a year', () => {
    const ds = dataset([
      row(2, { datetime: { iso: '2021-07-25T10:30', year: 2021, precision: 'minute', tz: 'utc' } }),
      row(3, { datetime: { iso: '2021-07-25T10:30:00Z', year: 2021, precision: 'second', tz: 'utc' } }),
      row(4, { datetime: { iso: '2021', year: 2021, precision: 'year', tz: 'unknown' } }),
      row(5, { datetime: { iso: '2021-07-25T10:30+02:00', year: 2021, precision: 'minute', tz: 'offset' } }),
    ]);
    expect(dates(ds)).toEqual(['2021-07-25T10:30Z', '2021-07-25T10:30:00Z', '2021', '2021-07-25T10:30+02:00']);
    expect(notes(ds)).toEqual([]);
  });

  it('unknown time zone: no Z and ONE sidecar note, however many rows', () => {
    const t = { iso: '2021-07-25T10:30', year: 2021, precision: 'minute' as const, tz: 'unknown' as const };
    const ds = dataset([row(2, { datetime: t }), row(3, { datetime: t }), row(4, { datetime: day('2021-07-26') })]);
    expect(dates(ds)).toEqual(['2021-07-25T10:30', '2021-07-25T10:30', '2021-07-26']);
    expect(notes(ds)).toEqual(['time zone unknown']);
  });

  it('a date-only dataset has no time-zone note', () => {
    expect(notes(dataset([row(2, { datetime: day('2021-07-26') })]))).toEqual([]);
  });

  it('a date that could not be parsed is counted in a note, not invented', () => {
    const ds = dataset([row(2, { dateRaw: 'sometime' }), row(3, { datetime: day('2021-07-26'), dateRaw: '2021-07-26' })]);
    expect(dates(ds)).toEqual(['', '2021-07-26']);
    expect(notes(ds)).toEqual(['1 row(s) have a date that could not be parsed; the date cell is empty']);
  });
});

describe('coordinates', () => {
  it('decimal degrees keep their written digits', () => {
    const ds = dataset([row(2, { lat: 76.5, lon: -15.10, latDecimals: 1, lonDecimals: 2 }), row(3, { lat: -0.04, lon: 0, latDecimals: 2, lonDecimals: 0 })]);
    const { rows } = parse(toCleanCsv(ds).csv);
    expect(rows.map((r) => [r[1], r[2]])).toEqual([['76.5', '-15.10'], ['-0.04', '0']]);
    expect(parse(toCleanCsv(ds).sidecar).rows.filter((r) => r[0] === '(note)')).toEqual([]);
    expect(parse(toCleanCsv(ds).sidecar).rows.filter((r) => /rounded/.test(r[1]))).toEqual([]);
  });

  it('degrees+minutes values are written rounded to the parser-counted precision, with a note', () => {
    const lat = 16 + 27.92 / 60; // 16°27.92'
    const ds = dataset([row(2, { lat, lon: 5, latDecimals: 3, lonDecimals: 0 })]);
    const { csv, sidecar } = toCleanCsv(ds);
    expect(parse(csv).rows[0].slice(1, 3)).toEqual(['16.465', '5']);
    expect(parse(sidecar).rows.map((r) => r[1])).toContain(
      'coordinates parsed from degrees and minutes/seconds are written as decimal degrees rounded to the precision of the source text',
    );
  });

  it('a rounded -0 loses its sign', () => {
    const ds = dataset([row(2, { lat: -0.0004, lon: 0, latDecimals: 2, lonDecimals: 0 })]);
    expect(parse(toCleanCsv(ds).csv).rows[0][1]).toBe('0.00');
  });
});

describe('end to end through the dataset builder', () => {
  it('a decimal-comma semicolon file comes out with dots and the same digits', () => {
    const file = textFile('dc.csv', 'Station;Latitude;Longitude;Date;Depth [m];DIC [umol/kg]\nST1;76,50;15,10;2021-07-25;2,50;2110,50\nST2;76,60;15,20;2021-07-26;5;-3,5\n');
    const layout = proposeLayout(file);
    const { dataset: ds } = buildDataset(file, layout, proposeMappings(file, layout), [], 'ds1');
    const { rows, header } = parse(toCleanCsv(ds).csv);
    expect(header).toEqual(['station', 'date [ISO 8601]', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth [m]', 'DIC [µmol/kg]']);
    expect(rows[0]).toEqual(['ST1', '2021-07-25', '76.50', '15.10', '2.50', '2110.50']);
    expect(rows[1].slice(-1)).toEqual(['-3.5']);
  });
});

describe('a dot-decimal file with comma text', () => {
  it("a ';'-delimited dot-decimal file keeps '1,234' as text, quoted, never '1.234'", () => {
    const file = textFile('dot.csv', 'Station;Latitude;Longitude;Date;DIC [umol/kg]\nST1;76.5;15.1;2021-07-25;1,234\nST2;76.6;15.2;2021-07-26;2110.5\n');
    expect(file.decimalComma).toBe(false);
    const layout = proposeLayout(file);
    const { dataset: ds } = buildDataset(file, layout, proposeMappings(file, layout), [], 'ds1');
    expect(ds.decimalComma).toBe(false);
    const { csv } = toCleanCsv(ds);
    expect(csv.split('\n')[1]).toBe('ST1,2021-07-25,76.5,15.1,,"1,234"');
    expect(parse(csv).rows[0].slice(-1)).toEqual(['1,234']);
  });
  it('the dataset carries the decimalComma of its source file', () => {
    const file = textFile('dc.csv', 'Station;Latitude;Longitude;Date;DIC [umol/kg]\nST1;76,5;15,1;2021-07-25;2110,5\n');
    const layout = proposeLayout(file);
    const { dataset: ds } = buildDataset(file, layout, proposeMappings(file, layout), [], 'ds1');
    expect(ds.decimalComma).toBe(true);
  });
});

describe('sidecar formula guard', () => {
  it('guards source headers that look like formulas in the sidecar too', () => {
    const ds = dataset([row(2, { values: { x: ok('1', 2, 1) } })], [v('x', { header: '=HYPERLINK("http://x")' })]);
    const { sidecar } = toCleanCsv(ds);
    expect(sidecar).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(sidecar).toContain(`'=HYPERLINK`);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parseCsvText } from '../../src/core/parse/csv';
import { parseFile } from '../../src/core/parse';

const enc = (s: string) => new TextEncoder().encode(s);
const ragged = (f: ReturnType<typeof parseCsvText>) => f.findings.filter((x) => x.ruleId === 'ROW-RAGGED');

describe('parseCsvText', () => {
  it('parses a plain comma file with physical line numbers', () => {
    const f = parseCsvText('a,b,c\n1,2,3\n4,5,6\n', 'x.csv');
    expect(f.kind).toBe('csv');
    expect(f.decimalComma).toBe(false);
    expect(f.encoding).toBe('utf-8');
    expect(f.sheets).toHaveLength(1);
    const s = f.sheets[0];
    expect(s.name).toBe('x.csv');
    expect(s.header).toEqual(['a', 'b', 'c']);
    expect(s.headerLine).toBe(1);
    expect(s.rows).toEqual([
      { line: 2, cells: ['1', '2', '3'], fieldCount: 3 },
      { line: 3, cells: ['4', '5', '6'], fieldCount: 3 },
    ]);
    expect(f.findings).toEqual([]);
  });

  it('detects semicolon + decimal comma and keeps numbers as text', () => {
    const f = parseCsvText('lat;temp;sal\n70,5;3,14;34,9\n71,5;2,71;35,1\n', 'dc.csv');
    expect(f.decimalComma).toBe(true);
    expect(f.sheets[0].header).toEqual(['lat', 'temp', 'sal']);
    expect(f.sheets[0].rows[0].cells).toEqual(['70,5', '3,14', '34,9']);
    expect(f.findings.map((x) => x.ruleId)).toEqual(['IN-DECIMAL-COMMA']);
  });

  it('does not report a decimal comma for a comma-delimited file', () => {
    const f = parseCsvText('a,b\n"1,5","2,5"\n"3,5","4,5"\n', 'q.csv');
    expect(f.decimalComma).toBe(false);
    expect(f.sheets[0].rows[0].cells).toEqual(['1,5', '2,5']);
  });

  it('does not call a semicolon file decimal-comma when its decimals use points', () => {
    const f = parseCsvText('a;b\n1.5;2.5\n3.5;4.5\n', 'p.csv');
    expect(f.decimalComma).toBe(false);
  });

  it('is not fooled by decimal commas in a semicolon file when picking the delimiter', () => {
    const f = parseCsvText('a;b;c\n1,5;2,5;3\n4,5;5,5;6\n', 'd.csv');
    expect(f.sheets[0].header).toEqual(['a', 'b', 'c']);
  });

  it('detects tab-delimited files and keeps commas inside values', () => {
    const f = parseCsvText('a\tb\n1,5\tx, y\n', 't.tsv');
    expect(f.sheets[0].header).toEqual(['a', 'b']);
    expect(f.sheets[0].rows[0].cells).toEqual(['1,5', 'x, y']);
  });

  it('treats a comma inside quotes as part of one field', () => {
    const f = parseCsvText('name,n\n"a,b",1\n"c ""q"" d",2\n', 'q.csv');
    expect(f.sheets[0].rows[0].cells).toEqual(['a,b', '1']);
    expect(f.sheets[0].rows[1].cells).toEqual(['c "q" d', '2']);
    expect(ragged(f)).toEqual([]);
  });

  it('assigns a quoted multi-line record to the line where it starts', () => {
    const f = parseCsvText('a,b\n"x\ny\nz",1\n2,3\n', 'm.csv');
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([2, 5]);
    expect(f.sheets[0].rows[0].cells[0]).toBe('x\ny\nz');
  });

  it('reports one ragged row (29 fields vs 28) with its physical line, never realigned', () => {
    const header = Array.from({ length: 28 }, (_, i) => 'c' + i).join(',');
    const ok = Array.from({ length: 28 }, (_, i) => String(i)).join(',');
    const bad = Array.from({ length: 29 }, (_, i) => String(i)).join(',');
    // header = line 1; line 3 is blank; the bad row is physical line 6 (CRLF file)
    const text = [header, ok, '', ok, ok, bad, ok].join('\r\n') + '\r\n';
    const f = parseCsvText(text, 'r.csv');
    const r = ragged(f);
    expect(r).toHaveLength(1);
    expect(r[0].lines).toEqual([6]);
    expect(r[0].params).toEqual({ expected: 28, found: 29 });
    expect(r[0].severity).toBe('error');
    const row = f.sheets[0].rows.find((x) => x.line === 6)!;
    expect(row.cells).toHaveLength(29);
    expect(row.fieldCount).toBe(29);
    expect(f.sheets[0].rows.map((x) => x.line)).toEqual([2, 4, 5, 6, 7]);
  });

  it('lists every ragged line in one finding; found comes from the first', () => {
    const f = parseCsvText('a,b,c\n1,2\n1,2,3\n1,2,3,4\n', 'r.csv');
    const r = ragged(f);
    expect(r).toHaveLength(1);
    expect(r[0].lines).toEqual([2, 4]);
    expect(r[0].params).toEqual({ expected: 3, found: 2 });
  });

  it('counts lone CR as a line break and skips blank lines without calling them ragged', () => {
    const f = parseCsvText('a,b\r1,2\r\r3,4', 'cr.csv');
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([2, 4]);
    expect(ragged(f)).toEqual([]);
  });

  it('takes the first non-empty line as the header even after blank lines', () => {
    const f = parseCsvText('\n\na,b\n1,2\n', 'h.csv');
    expect(f.sheets[0].headerLine).toBe(3);
    expect(f.sheets[0].rows[0].line).toBe(4);
  });

  it('drops an empty trailing cell only when every line has it', () => {
    const all = parseCsvText('a,b,\n1,2,\n3,4,\n', 'tr.csv');
    expect(all.sheets[0].header).toEqual(['a', 'b']);
    expect(all.sheets[0].rows[0].cells).toEqual(['1', '2']);
    expect(ragged(all)).toEqual([]);
    const some = parseCsvText('a,b,\n1,2,\n3,4\n', 'tr2.csv');
    expect(some.sheets[0].header).toEqual(['a', 'b', '']);
    expect(ragged(some)[0].lines).toEqual([3]);
  });

  it('keeps an OPeNDAP header verbatim, minus the CSV quotes', () => {
    const f = parseCsvText('"Latitude<Float32>","Station<String>"\n70.5,ST1\n', 'op.csv');
    expect(f.sheets[0].header).toEqual(['Latitude<Float32>', 'Station<String>']);
  });

  it('strips a BOM from the first header cell', () => {
    const f = parseCsvText('\uFEFFlat,lon\n1,2\n', 'bom.csv');
    expect(f.sheets[0].header[0]).toBe('lat');
    expect(f.encoding).toBe('utf-8-bom');
  });

  it('returns no sheet for an empty file', () => {
    expect(parseCsvText('', 'e.csv').sheets).toEqual([]);
    expect(parseCsvText('\n \n', 'e.csv').sheets).toEqual([]);
  });

  it('reads an unterminated quote to the end of the file instead of throwing', () => {
    const f = parseCsvText('a,b\n1,"oops\n2,3\n', 'u.csv');
    expect(f.sheets[0].rows).toHaveLength(1);
    expect(f.sheets[0].rows[0].line).toBe(2);
  });
});

describe('parseFile on CSV bytes', () => {
  it('strips a UTF-8 BOM', () => {
    const f = parseFile('b.csv', new Uint8Array([0xef, 0xbb, 0xbf, ...enc('lat,lon\n1,2\n')]));
    expect(f.encoding).toBe('utf-8-bom');
    expect(f.sheets[0].header).toEqual(['lat', 'lon']);
    expect(f.findings).toEqual([]);
  });

  it('decodes Windows-1250 and emits IN-ENCODING-FALLBACK with the encoding name', () => {
    // 'Zażółć' in windows-1250: Z a 0xBF 0xF3 0xB3 0xE6 ; plus 0x8C (Ś) so it is windows-1250, not iso-8859-2
    const bytes = new Uint8Array([...enc('name,v\n'), 0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6, 0x8c, ...enc(',1\n')]);
    const f = parseFile('w.csv', bytes);
    expect(f.encoding).toBe('windows-1250');
    expect(f.sheets[0].rows[0].cells[0]).toBe('ZażółćŚ');
    const e = f.findings.filter((x) => x.ruleId === 'IN-ENCODING-FALLBACK');
    expect(e).toHaveLength(1);
    expect(e[0].params).toEqual({ encoding: 'windows-1250' });
  });
});

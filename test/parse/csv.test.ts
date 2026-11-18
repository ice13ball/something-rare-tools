// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { parseCsvText } from '../../src/core/parse/csv';
import { parseFile } from '../../src/core/parse';
import { renderPlain } from '../../src/core/report';

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

  describe('IN-DECIMAL-AMBIGUOUS (a comma that may be a thousands separator)', () => {
    const amb = (text: string) => parseCsvText(text, 'a.csv').findings.filter((x) => x.ruleId === 'IN-DECIMAL-AMBIGUOUS');

    it('asks once per column whose every comma value has three decimals, and still reads them as decimals', () => {
      const f = parseCsvText('Station;Depth [m];Chlorophyll\nA;1,250;12,500\nB;2,000;3,750\n', 'a.csv');
      const a = f.findings.filter((x) => x.ruleId === 'IN-DECIMAL-AMBIGUOUS');
      expect(a).toHaveLength(2);
      expect(a[0].params).toMatchObject({ column: 'Depth [m]', index: 1, count: 2, asDecimal: '1.25', asThousands: '1250' });
      expect(a[0].value).toBe('1,250');
      expect(a[0].lines).toEqual([2, 3]);
      expect(a[1].params).toMatchObject({ column: 'Chlorophyll', index: 2, count: 2 });
      expect(f.sheets[0].rows[0].cells).toEqual(['A', '1,250', '12,500']);
    });

    it('asks about a negative value together with a positive one', () => {
      expect(amb('Station;Depth\nA;-1,250\nB;2,500\n')).toHaveLength(1);
    });

    it.each([
      ['1,250 with 1,25', 'S;D;T\nA;1,250;1,5\nB;1,25;2,5\n'],
      ['one decimal', 'S;D;T\nA;12,5;1,5\nB;13,5;2,5\n'],
      ['four decimals', 'S;D;T\nA;1,2500;1,5\nB;1,2500;2,5\n'],
      ['leading zero', 'S;D;T\nA;0,125;1,5\nB;0,250;2,5\n'],
      ['four integer digits', 'S;D;T\nA;1234,567;1,5\nB;1234,567;2,5\n'],
    ])('does not ask: %s', (_n, text) => {
      expect(amb(text)).toEqual([]);
    });

    it('does not ask for a column that has one settling value among three-digit ones', () => {
      expect(amb('S;D;T\nA;1,250;1,5\nB;2,500;2,5\nC;3,75;2,5\n')).toEqual([]);
    });

    it('does not ask when a cell in the column is written with point thousands and a decimal comma (1.250,5)', () => {
      expect(amb('S;D;T\nA;1,250;1,5\nB;1.250,5;2,5\nC;2,500;2,5\n').filter((x) => x.params?.column === 'D')).toEqual([]);
    });

    it('still asks when a cell in the column is written with comma groups (1,250,000), and says so', () => {
      const a = amb('S;D;T\nA;1,250;1,5\nB;1,250,000;2,5\nC;2,500;2,5\n').filter((x) => x.params?.column === 'D');
      expect(a).toHaveLength(1);
      expect(a[0].params).toMatchObject({ thousandsSeen: '1,250,000', count: 2, asDecimal: '1.25', asThousands: '1250' });
      expect(renderPlain(a[0], 'pl')).toContain('1,250,000');
      expect(renderPlain(a[0], 'en')).toContain('1,250,000');
      expect(amb('S;D\nA;1,250\nB;2,500\n')[0].params).not.toHaveProperty('thousandsSeen');
    });

    it('judges the whole column: a settling value past row 50 settles it, and a long column of three-digit values is asked once', () => {
      const rows = (n: number, last?: string) => Array.from({ length: n }, (_, i) => `R${i};${1 + (i % 9)},${String(250 + i).padStart(3, '0')}`).concat(last ? [`Z;${last}`] : []);
      const withT = (rs: string[]) => 'S;D\n' + rs.join('\n') + '\n';
      expect(amb(withT(rows(61, '1,5'))).filter((x) => x.params?.column === 'D')).toEqual([]);
      const long = amb(withT(rows(61)));
      expect(long).toHaveLength(1);
      expect(long[0].params?.count).toBe(61);
    });

    it('names the same cells in count and lines', () => {
      const a = amb('S;D\nA;1,250\nB;2,500\nC;3,750\n');
      expect(a[0].params?.count).toBe(3);
      expect(a[0].lines).toEqual([2, 3, 4]);
    });

    it('renders the Polish text with the right plural for 1, 3 and 5 cells', () => {
      const text = (n: number) => renderPlain(amb(['S;D', ...Array.from({ length: n }, (_, i) => `R${i};${i + 1},250`)].join('\n') + '\n')[0], 'pl');
      expect(text(1)).toContain('(1 komórka)');
      expect(text(3)).toContain('(3 komórki)');
      expect(text(5)).toContain('(5 komórek)');
    });

    it('does not ask in a comma-delimited file with quoted values', () => {
      expect(amb('a,b\n"1,250","2,500"\n"3,750","4,500"\n')).toEqual([]);
    });

    it('does not ask when the decimal cells are mostly written with a point', () => {
      const f = parseCsvText('S;D;T\nA;1,250;1.5\nB;2,500;2.5\nC;3,500;3.5\n', 'a.csv');
      expect(f.decimalComma).toBe(false);
      expect(f.findings).toEqual([]);
    });
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

  it('decodes Windows-1250 and, when the code pages read it differently, emits IN-ENCODING-AMBIGUOUS with the encoding used', () => {
    // 'Zażółć' in windows-1250: Z a 0xBF 0xF3 0xB3 0xE6 ; plus 0x8C (Ś) so it is windows-1250, not iso-8859-2
    const bytes = new Uint8Array([...enc('name,v\n'), 0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6, 0x8c, ...enc(',1\n')]);
    const f = parseFile('w.csv', bytes);
    expect(f.encoding).toBe('windows-1250');
    expect(f.sheets[0].rows[0].cells[0]).toBe('ZażółćŚ');
    expect(f.findings.filter((x) => x.ruleId === 'IN-ENCODING-FALLBACK')).toHaveLength(0);
    const e = f.findings.filter((x) => x.ruleId === 'IN-ENCODING-AMBIGUOUS');
    expect(e).toHaveLength(1);
    expect(e[0].params).toMatchObject({ encoding: 'windows-1250', count: 3 });
  });

  it('emits only IN-ENCODING-FALLBACK when windows-1250, ISO-8859-2 and windows-1252 read the bytes alike', () => {
    // Müller;Café;Bóbr in windows-1252 (ü é ó = 0xFC 0xE9 0xF3 are the same letters in all three)
    const bytes = new Uint8Array([...enc('a;b;c\nM'), 0xfc, ...enc('ller;Caf'), 0xe9, ...enc(';B'), 0xf3, ...enc('br\n')]);
    const f = parseFile('m.csv', bytes);
    expect(f.sheets[0].rows[0].cells).toEqual(['Müller', 'Café', 'Bóbr']);
    expect(f.findings.map((x) => x.ruleId)).toEqual(['IN-ENCODING-FALLBACK']);
  });

  it('windows-1252 bytes of Krøyer;Sèvre are reported as two readings and read as before', () => {
    const bytes = new Uint8Array([...enc('a;b\nKr'), 0xf8, ...enc('yer;S'), 0xe8, ...enc('vre\n')]);
    const f = parseFile('k.csv', bytes);
    expect(f.encoding).toBe('iso-8859-2');
    expect(f.sheets[0].rows[0].cells).toEqual(['Krřyer', 'Sčvre']);
    expect(f.findings.map((x) => x.ruleId)).toEqual(['IN-ENCODING-AMBIGUOUS']);
    expect(f.findings[0].params).toEqual({
      encoding: 'iso-8859-2',
      readings: 'windows-1250, ISO-8859-2: Krřyer, Sčvre; windows-1252: Krøyer, Sèvre',
      count: 2,
    });
  });

  it('a code page the person names is used and nothing is reported', () => {
    const bytes = new Uint8Array([...enc('a;b\nKr'), 0xf8, ...enc('yer;S'), 0xe8, ...enc('vre\n')]);
    const f = parseFile('k.csv', bytes, { encoding: 'windows-1252' });
    expect(f.encoding).toBe('windows-1252');
    expect(f.sheets[0].rows[0].cells).toEqual(['Krøyer', 'Sèvre']);
    expect(f.findings).toEqual([]);
  });

  it('reads UTF-16 files (BOM or not) as text with no finding', () => {
    const le = (s: string, bom: boolean) => {
      const o: number[] = bom ? [0xff, 0xfe] : [];
      for (const ch of s) o.push(ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8);
      return new Uint8Array(o);
    };
    const be = (s: string) => {
      const o: number[] = [0xfe, 0xff];
      for (const ch of s) o.push(ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 0xff);
      return new Uint8Array(o);
    };
    const src = 'Station\tDepth\r\nA\t5';
    for (const [bytes, name] of [[le(src, true), 'utf-16le'], [le(src, false), 'utf-16le'], [be(src), 'utf-16be']] as const) {
      const f = parseFile('u.txt', bytes);
      expect(f.sheets[0].header).toEqual(['Station', 'Depth']);
      expect(f.encoding).toBe(name);
      expect(f.findings.filter((x) => x.ruleId.startsWith('IN-ENCODING'))).toEqual([]);
    }
  });
});

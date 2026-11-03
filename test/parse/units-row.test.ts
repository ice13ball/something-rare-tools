// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A second header row of units (ERDDAP, BCO-DMO) under the header is part of the header, not data. Every value here is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { readConvertFile } from '../../src/core/convert/read';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { buildDataset } from '../../src/core/dataset';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeLayout } from '../../src/core/recognize/layout';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { sheetInput } from '../convert/helpers';
import { createConvertHandler } from '../../src/worker/convert.handler';
import { foldUnitsRow } from '../../src/core/parse/shared';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import { textFile, xlsxFile } from '../helpers/files';

const ERDDAP = [
  'year,time,station,latitude,longitude,depth',
  ',UTC,,degrees_north,degrees_east,m',
  '2001,2001-03-04T05:00:00Z,S1,10.5,20.25,5.0',
  '2001,2001-03-04T06:00:00Z,S1,10.5,20.25,15.0',
  '2001,2001-03-05T06:00:00Z,S2,11.5,21.25,25.0',
].join('\n');

const ids = (f: { findings: { ruleId: string }[] }) => f.findings.map((x) => x.ruleId);

describe('foldUnitsRow in a csv', () => {
  it('a sparse units row names the units in the header; the first data row is the next line', () => {
    const f = textFile('a.csv', ERDDAP);
    const s = f.sheets[0];
    expect(s.header).toEqual(['year', 'time [UTC]', 'station', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth [m]']);
    expect(s.rows.map((r) => r.line)).toEqual([3, 4, 5]);
    expect(s.rows[0].cells[0]).toBe('2001');
    expect(s.subHeaderLine).toBe(2);
    expect(s.unitsRowLine).toBe(2);
    expect(s.headerLine).toBe(1);
    expect(ids(f).filter((x) => x === 'IN-HEADER-UNITS-READ')).toHaveLength(1);
    const fin = f.findings.find((x) => x.ruleId === 'IN-HEADER-UNITS-READ')!;
    expect(fin.lines).toEqual([2]);
    expect(fin.params.count).toBe(4);
  });

  it('a dense units row, every column with a unit, is the same', () => {
    const t = ['a,b,c', 'm,degC,PSU', '1,4.5,35', '2,5.5,36', '3,6.5,34'].join('\n');
    const f = textFile('d.csv', t);
    expect(f.sheets[0].header).toEqual(['a [m]', 'b [degC]', 'c [PSU]']);
    expect(f.sheets[0].rows).toHaveLength(3);
    expect(ids(f)).toEqual(['IN-HEADER-UNITS-READ']);
  });

  it('line numbers stay the file lines when blank lines sit between the header and the units row', () => {
    const t = ['a,b,c', '', 'm,degC,PSU', '', '1,4.5,35', '2,5.5,36', '3,6.5,34'].join('\n');
    const s = textFile('b.csv', t).sheets[0];
    expect(s.rows.map((r) => r.line)).toEqual([5, 6, 7]);
    expect(s.unitsRowLine).toBe(3);
  });

  it('unitless, text, code and a number format beside two real units add nothing to the header', () => {
    const t = ['Station,Site,yrday,latitude,longitude', 'unitless,text,ddd.d,degrees_north,degrees_east', 'S1,Reef,17.5,10.5,20.5', 'S2,Bay,18.5,11.5,21.5'].join('\n');
    const s = textFile('n.csv', t).sheets[0];
    expect(s.header).toEqual(['Station', 'Site', 'yrday', 'latitude [degrees_north]', 'longitude [degrees_east]']);
    expect(s.rows).toHaveLength(2);
  });

  it('BCO-DMO phrases are units when numbers sit below', () => {
    const t = ['vol,count,size,depth', 'cubic metres,individuals,centimeters,feet', '30.5,4,6.3,10', '31.5,5,6.4,12'].join('\n');
    expect(textFile('p.csv', t).sheets[0].header).toEqual(['vol [cubic metres]', 'count [individuals]', 'size [centimeters]', 'depth [feet]']);
  });

  it('a semicolon file with decimal commas under a units row folds, and the commas are still read as decimals', () => {
    const t = ['a;b;c', 'm;degC;PSU', '1,5;4,5;35,1', '2,5;5,5;36,2', '3,5;6,5;34,3'].join('\n');
    const f = textFile('c.csv', t);
    expect(f.decimalComma).toBe(true);
    expect(f.sheets[0].header).toEqual(['a [m]', 'b [degC]', 'c [PSU]']);
    expect(f.sheets[0].rows).toHaveLength(3);
    expect(ids(f)).toEqual(['IN-DECIMAL-COMMA', 'IN-HEADER-UNITS-READ']);
  });

  it('a tab file (PANGAEA .tab, no data description) folds like a csv', () => {
    const t = ['a\tb\tc', 'm\tdegC\tPSU', '1\t4.5\t35', '2\t5.5\t36', '3\t6.5\t34'].join('\n');
    const f = textFile('t.tab', t);
    expect(f.sheets[0].header).toEqual(['a [m]', 'b [degC]', 'c [PSU]']);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([3, 4, 5]);
  });

  it('the same row in a PANGAEA textfile (with its description block) folds with physical lines', () => {
    const t = ['/* DATA DESCRIPTION:', 'Citation:\tNobody (2001)', '*/', 'a\tb\tc', 'm\tdegC\tPSU', '1\t4.5\t35', '2\t5.5\t36', '3\t6.5\t34'].join('\n');
    const f = textFile('p.tab', t);
    expect(f.sheets[0].header).toEqual(['a [m]', 'b [degC]', 'c [PSU]']);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([6, 7, 8]);
    expect(f.sheets[0].headerLine).toBe(4);
  });

  it('a file without a units row is read exactly as before', () => {
    const t = ['a,b,c', '1,4.5,35', '2,5.5,36'].join('\n');
    const s = textFile('x.csv', t).sheets[0];
    expect(s.header).toEqual(['a', 'b', 'c']);
    expect(s.rows).toHaveLength(2);
    expect(s.unitsRowLine).toBeUndefined();
    expect(s.subHeaderLine).toBeUndefined();
  });
});

describe('a row that stays data', () => {
  const nofold = (t: string, name = 'n.csv') => {
    const f = textFile(name, t);
    expect(f.sheets[0].unitsRowLine).toBeUndefined();
    expect(ids(f)).not.toContain('IN-HEADER-UNITS-READ');
    return f;
  };

  it('a filled cell that is not a unit (a station, a taxon)', () => {
    nofold(['lat,lon,site,depth', 'degrees_north,degrees_east,S1,m', '10.5,20.5,x,5', '11.5,21.5,y,6'].join('\n'));
    nofold(['a,b,c', 'm,degC,Gobiidae', '1,4.5,35', '2,5.5,36'].join('\n'));
  });

  it('fewer than two units', () => {
    nofold(['a,b,c', 'm,,', '1,4.5,35', '2,5.5,36'].join('\n'));
    nofold(['a,b,c', 'unitless,text,m', '1,x,35', '2,y,36'].join('\n'));
  });

  it('unit cells over values that are not numbers: a first data row of codes m, g, cm', () => {
    const f = nofold(['a,b,c', 'm,g,cm', 'x,y,z', 'p,q,r', 'k,l,n'].join('\n'));
    expect(f.sheets[0].rows).toHaveLength(4);
  });

  it('one unit column over text is enough to leave the row as data', () => {
    nofold(['a,b,c', 'm,degC,PSU', '1,4.5,high', '2,5.5,low', '3,6.5,mid'].join('\n'));
  });

  it('a UTC cell over values that are not dates', () => {
    nofold(['a,time,c', 'm,UTC,degC', '1,noon,4.5', '2,dusk,5.5'].join('\n'));
  });

  it('a row of numbers is data', () => {
    nofold(['a,b,c', '1,2,3', '4,5,6'].join('\n'));
  });

  it('a lone 1 or - is not read as a unit (the list is not widened)', () => {
    nofold(['a,b,c,d', 'm,degC,1,-', '1,4.5,2,3', '2,5.5,3,4'].join('\n'));
  });

  it('a units row with no data under it stays as it is', () => {
    nofold(['a,b,c', 'm,degC,PSU'].join('\n'));
  });
});

describe('a header that has a unit already', () => {
  it('keeps its own when the cell agrees; the other columns get theirs', () => {
    const t = ['depth [m],temp,sal', 'm,degC,PSU', '1,4.5,35', '2,5.5,36'].join('\n');
    expect(textFile('h.csv', t).sheets[0].header).toEqual(['depth [m]', 'temp [degC]', 'sal [PSU]']);
  });

  it('a cell that disagrees gives no fold at all', () => {
    const t = ['depth [m],temp,sal', 'ft,degC,PSU', '1,4.5,35', '2,5.5,36'].join('\n');
    const s = textFile('h.csv', t).sheets[0];
    expect(s.header).toEqual(['depth [m]', 'temp', 'sal']);
    expect(s.rows).toHaveLength(3);
  });

  it('a round bracket that is a comment is not a unit', () => {
    const t = ['depth (below sea),temp,sal', 'm,degC,PSU', '1,4.5,35', '2,5.5,36'].join('\n');
    expect(textFile('h.csv', t).sheets[0].header).toEqual(['depth (below sea) [m]', 'temp [degC]', 'sal [PSU]']);
  });
});

describe('an xlsx', () => {
  it('folds the same row, with Excel row numbers', () => {
    const f = xlsxFile('u.xlsx', { S: [['year', 'time', 'latitude', 'longitude'], [null, 'UTC', 'degrees_north', 'degrees_east'], [2001, '2001-03-04T05:00:00Z', 10.5, 20.25], [2001, '2001-03-04T06:00:00Z', 11.5, 21.25]] });
    const s = f.sheets[0];
    expect(s.header).toEqual(['year', 'time [UTC]', 'latitude [degrees_north]', 'longitude [degrees_east]']);
    expect(s.rows.map((r) => r.line)).toEqual([3, 4]);
    expect(s.unitsRowLine).toBe(2);
    expect(f.findings.filter((x) => x.ruleId === 'IN-HEADER-UNITS-READ')).toHaveLength(1);
    expect(f.findings.find((x) => x.ruleId === 'IN-HEADER-UNITS-READ')?.sheet).toBe('S');
  });

  it('a time column of Excel dates under UTC counts as dates', () => {
    const d = (v: number) => ({ t: 'n' as const, v, z: 'yyyy-mm-dd hh:mm' });
    const f = xlsxFile('u.xlsx', { S: [['time', 'latitude', 'longitude'], ['UTC', 'degrees_north', 'degrees_east'], [d(37638.35), 10.5, 20.25], [d(37639.35), 11.5, 21.25]] });
    expect(f.sheets[0].header).toEqual(['time [UTC]', 'latitude [degrees_north]', 'longitude [degrees_east]']);
    expect(f.sheets[0].dateFormatted).toEqual([true, false, false]);
  });

  it('text codes over text stay data', () => {
    const f = xlsxFile('u.xlsx', { S: [['a', 'b', 'c'], ['m', 'g', 'cm'], ['x', 'y', 'z'], ['p', 'q', 'r']] });
    expect(f.sheets[0].rows).toHaveLength(3);
  });
});

describe('foldUnitsRow on its own', () => {
  const rows = (cells: (string | number | null)[][]) => cells.map((c, i) => ({ line: i + 2, cells: c, fieldCount: c.length }));
  it('returns the fold shape of the statistic sub-header', () => {
    const r = foldUnitsRow(['a', 'b'], rows([['m', 'degC'], [1, 2], [3, 4]]), false);
    expect(r?.header).toEqual(['a [m]', 'b [degC]']);
    expect(r?.line).toBe(2);
    expect(r?.rows.map((x) => x.line)).toEqual([3, 4]);
  });
  it('a header that is empty above a unit gives no fold', () => {
    expect(foldUnitsRow(['a', ''], rows([['m', 'degC'], [1, 2], [3, 4]]), false)).toBeUndefined();
  });
  it('decimal commas are numbers only when the caller says so', () => {
    const r = rows([['m', 'degC'], ['1,5', '2,5'], ['3,5', '4,5']]);
    expect(foldUnitsRow(['a', 'b'], r, false)).toBeUndefined();
    expect(foldUnitsRow(['a', 'b'], r, true)).toBeDefined();
  });
});

describe('IN-HEADER-UNITS-READ', () => {
  it('has a text in all four languages with its plural filled', () => {
    const f = textFile('a.csv', ERDDAP).findings.find((x) => x.ruleId === 'IN-HEADER-UNITS-READ')!;
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t, lang).toContain('2');
      expect(t, lang).toContain('4');
    }
  });
});

describe('/check and /convert read the folded file the same way', () => {
  // the same data with the units row deleted by hand and the units written into the header
  const BY_HAND = [
    'year,time [UTC],station,latitude [degrees_north],longitude [degrees_east],depth [m],temp [degree_C]',
    '2001,2001-03-04T05:00:00Z,S1,10.5,20.25,5.0,4.5',
    '2001,2001-03-04T06:00:00Z,S1,10.5,20.25,15.0,4.1',
    '2001,2001-03-05T06:00:00Z,S2,11.5,21.25,25.0,3.9',
  ].join('\n');
  const WITH_ROW = [
    'year,time,station,latitude,longitude,depth,temp',
    ',UTC,,degrees_north,degrees_east,m,degree_C',
    ...BY_HAND.split('\n').slice(1),
  ].join('\n');

  it('/check: the roles are position, time and depth, and no row finding names the units', () => {
    const f = textFile('e.csv', WITH_ROW);
    const plan = proposeLayout(f);
    expect(plan.unsupportedReasons).toBeUndefined();
    const roles = Object.fromEntries(proposeColumns(f.sheets[0], { decimalComma: false, date1904: false }).map((p) => [p.header, p.role.kind]));
    expect(roles).toMatchObject({ 'time [UTC]': 'datetime', 'latitude [degrees_north]': 'latitude', 'longitude [degrees_east]': 'longitude', 'depth [m]': 'depth' });
    const { dataset, findings } = buildDataset(f, plan, [], [], 'e');
    expect(findings).toEqual([]);
    expect(dataset.rows.map((r) => [r.line, r.lat, r.lon, r.depth, r.datetime?.tz])).toEqual([[3, 10.5, 20.25, 5, 'utc'], [4, 10.5, 20.25, 15, 'utc'], [5, 11.5, 21.25, 25, 'utc']]);
  });

  it('/check: the rows and findings equal those of the file with the units row deleted by hand (the lines differ by the one row)', () => {
    const a = buildDataset(textFile('e.csv', WITH_ROW), proposeLayout(textFile('e.csv', WITH_ROW)), [], [], 'e');
    const b = buildDataset(textFile('e.csv', BY_HAND), proposeLayout(textFile('e.csv', BY_HAND)), [], [], 'e');
    const strip = (rows: typeof a.dataset.rows) => JSON.parse(JSON.stringify(rows).replace(/"line":\d+/g, '"line":0')) as unknown;
    expect(strip(a.dataset.rows)).toEqual(strip(b.dataset.rows));
    expect(a.dataset.rows.map((r) => r.line)).toEqual(b.dataset.rows.map((r) => r.line + 1));
    expect(a.findings).toEqual(b.findings);
  });

  it('/convert: the mapping of the folded file equals the mapping of the file with the units row deleted by hand', () => {
    const ctx = { decimalComma: false, date1904: false };
    const a = proposeConvertMapping(readConvertFile(textFile('e.csv', WITH_ROW)).sheets[0], ctx);
    const b = proposeConvertMapping(readConvertFile(textFile('e.csv', BY_HAND)).sheets[0], ctx);
    expect(a.columns.map((c) => [c.header, c.role])).toEqual(b.columns.map((c) => [c.header, c.role]));
  });
});

describe('/convert names a units row it could not fold', () => {
  // four units, a word under one of them: three columns hold plain numbers, so it is a units row that is not folded
  const WORD_UNDER = ['station,temp,sal,oxy,depth', 'unitless,degC,PSU,umol/kg,m', 'S1,4.5,high,210,5.0', 'S2,5.5,low,220,6.0', 'S3,6.5,mid,230,7.0'].join('\n');

  it('is not folded', () => {
    expect(textFile('s.csv', WORD_UNDER).sheets[0].header).toEqual(['station', 'temp', 'sal', 'oxy', 'depth']);
  });

  it('the sheet is not read and the finding says "looks like units", with the way out, in all four languages', () => {
    const file = readConvertFile(textFile('s.csv', WORD_UNDER));
    const r = convert({ sheets: [sheetInput(file)], options: {} } as never);
    expect(r.findings.map((f) => f.ruleId)).toContain('CONV-SHEET-UNITS-ROW');
    expect(r.findings.map((f) => f.ruleId)).not.toContain('CONV-TEXT-IN-TAXON-CELL');
    const f = r.findings.find((x) => x.ruleId === 'CONV-SHEET-UNITS-ROW')!;
    expect(f.lines).toEqual([2]);
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).not.toMatch(/[{}]/);
    expect(renderConvertPlain(f, 'en')).toContain('looks like units');
    expect(renderConvertPlain(f, 'en')).toContain('Read as a normal table');
  });

  it('the tick "read as a normal table" reads the sheet as it stands', () => {
    const file = readConvertFile(textFile('s.csv', WORD_UNDER));
    const r = convert({ sheets: [sheetInput(file, { readAsTable: true })], options: {} } as never);
    expect(r.findings.map((f) => f.ruleId)).not.toContain('CONV-SHEET-UNITS-ROW');
  });

  it('a first data row of codes over names is not that', () => {
    const file = readConvertFile(textFile('s.csv', ['station,size,count', 'm,g,cm', 'x,y,z', 'p,q,r'].join('\n')));
    const r = convert({ sheets: [sheetInput(file)], options: {} } as never);
    expect(r.findings.map((f) => f.ruleId)).not.toContain('CONV-SHEET-UNITS-ROW');
  });

  it('a sheet of text codes with N/D beside numbers is read, not refused', () => {
    const t = ['station,temp,sal,oxy', 'S1,N/D,N/D,N/D', 'S2,4.5,35.1,210', 'S3,5.5,35.2,220', 'S4,6.5,35.3,230'].join('\n');
    const f = textFile('s.csv', t);
    expect(proposeLayout(f).unsupportedReasons).toBeUndefined();
    const r = convert({ sheets: [sheetInput(readConvertFile(f))], options: {} } as never);
    expect(r.findings.map((x) => x.ruleId)).not.toContain('CONV-SHEET-UNITS-ROW');
  });
});

describe('/check and /convert agree on a units row that is not folded', () => {
  const T = ['station,temp,sal,oxy,depth', 'unitless,degC,PSU,umol/kg,m', 'S1,4.5,high,210,5.0', 'S2,5.5,low,220,6.0', 'S3,6.5,mid,230,7.0'].join('\n');
  it('/check refuses it as a header over several rows', () => {
    expect(proposeLayout(textFile('s.csv', T)).unsupportedReasons?.map((r) => r.code)).toEqual(['header-units']);
  });
  it('a file that is folded is refused by neither', () => {
    const f = textFile('e.csv', ERDDAP);
    expect(proposeLayout(f).unsupportedReasons).toBeUndefined();
    const r = convert({ sheets: [sheetInput(readConvertFile(f))], options: {} } as never);
    expect(r.findings.map((x) => x.ruleId)).not.toContain('CONV-SHEET-UNITS-ROW');
  });
});

describe('the words of a units row, as declared', () => {
  it('integer stands in the row like text; "<thing> per <unit>" and numbers inside a phrase are units', () => {
    const t = ['cruise,n,abund,conc', 'text,integer,number per cubic metres (n/1000 m^3),larvae per milliliter', 'A,1,13.5,4210', 'B,2,14.5,4390'].join('\n');
    expect(textFile('w.csv', t).sheets[0].header).toEqual(['cruise', 'n', 'abund [number per cubic metres (n/1000 m^3)]', 'conc [larvae per milliliter]']);
  });
  it('a lone 1 or -, a range such as 1 to 20 and an unknown word are not units, so nothing is folded', () => {
    for (const cell of ['1', '-', '1 to 20', 'Gobiidae']) {
      const t = ['a,b,c', `m,degC,${cell}`, '1,4.5,3', '2,5.5,4'].join('\n');
      expect(textFile('w.csv', t).sheets[0].unitsRowLine, cell).toBeUndefined();
    }
  });
  it('/convert and /check both name a row with an unknown word among its units', () => {
    const t = ['a,b,c,d', 'm,degC,1 to 20,PSU', '1,4.5,3,35', '2,5.5,4,36', '3,6.5,5,34'].join('\n');
    const f = textFile('w.csv', t);
    expect(proposeLayout(f).unsupportedReasons?.map((r) => r.code)).toEqual(['header-units']);
    const r = convert({ sheets: [sheetInput(readConvertFile(f))], options: {} } as never);
    expect(r.findings.map((x) => x.ruleId)).toContain('CONV-SHEET-UNITS-ROW');
  });
});

describe('the page offers the tick for a units row it could not fold', () => {
  const WORD_UNDER = ['station,temp,sal,oxy,depth', 'unitless,degC,PSU,umol/kg,m', 'S1,4.5,high,210,5.0', 'S2,5.5,low,220,6.0', 'S3,6.5,mid,230,7.0'].join('\n');
  it('the worker lists the sheet as header-units (the tick of CONV-SHEET-TRANSPOSED), and not a folded or an ordinary sheet', () => {
    const h = createConvertHandler();
    const parse = (name: string, text: string) => h.handle({ type: 'parse', files: [{ name, bytes: new TextEncoder().encode(text), source: 'dropped' }] }) as { files: { transposedSheets?: Record<string, string> }[] };
    expect(parse('s.csv', WORD_UNDER).files[0].transposedSheets).toEqual({ 's.csv': 'header-units' });
    expect(parse('e.csv', ERDDAP).files[0].transposedSheets).toBeUndefined();
    expect(parse('o.csv', 'a,b,c\n1,2,3\n4,5,6\n').files[0].transposedSheets).toBeUndefined();
  });
});

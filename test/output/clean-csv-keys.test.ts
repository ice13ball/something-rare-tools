// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The clean CSV keeps the columns that tell rows apart (a replicate, a cast, a layer, a pressure), carries their cells as the file wrote them, and names every source column it leaves out.
// Every file here is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { foldUnitsRow } from '../../src/core/parse/shared';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import type { ColumnRole, SheetMapping } from '../../src/core/types';
import { textFile } from '../helpers/files';

function build(text: string, edit?: (m: SheetMapping[]) => void) {
  const file = textFile('s.csv', text);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  edit?.(mappings);
  return buildDataset(file, layout, mappings, [], 'd').dataset;
}
/** CSV text back to a header + rows, through the project's own parser. */
function parse(csv: string): { header: string[]; rows: string[][] } {
  const sheet = textFile('out.csv', csv).sheets[0];
  return { header: sheet.header, rows: sheet.rows.map((r) => r.cells.map((c) => String(c ?? ''))) };
}
const notes = (sidecar: string): string[] => parse(sidecar).rows.filter((r) => r[0] === '(note)').map((r) => r[1]);
const left = (sidecar: string): string[] => notes(sidecar).filter((n) => n.startsWith('source columns that are not in this file'));

const FIXED = ['station', 'date [ISO 8601]', 'latitude [degrees_north]', 'longitude [degrees_east]', 'depth'];

/** A long sheet of `stations` stations and three parameters, one row each; `cols(station index, parameter)` gives the cells between Date and Parameter. */
function manyLong(head: string, cols: (s: number, p: string) => string, stations = 4): string {
  const lines = [`Station,Latitude,Longitude,Date,${head}${head ? ',' : ''}Parameter,Value`];
  for (let s = 1; s <= stations; s++) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`S${s},49.4,0.2,2020-06-01,${cols(s, p)}${head ? ',' : ''}${p},${s}.${p.length}0`);
  return lines.join('\n');
}

function longSheet(level: string, levels: string[], unit?: string): string {
  const lines = [`Station,Latitude,Longitude,Date,${level},Parameter,${unit ? 'Unit,' : ''}Value`];
  for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot']) levels.forEach((l, i) => lines.push(`${s},49.4,0.2,2020-06-01,${l},${p},${unit ? `${unit},` : ''}${i + 1}.${p === 'Corg' ? '1' : '5'}0`));
  return lines.join('\n');
}

describe('a long sheet: the column that tells rows apart is written', () => {
  it('Replicate: a column after the position and before the variables; every row differs by key plus that column; cells as written', () => {
    const ds = build(longSheet('Replicate', ['R1', 'R2', 'R3']));
    expect(ds.extraKeyColumns?.map((c) => c.header)).toEqual(['Replicate']);
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.slice(0, 6)).toEqual([...FIXED, 'Replicate']);
    expect(header.slice(6)).toEqual(['Corg', 'Ntot']);
    expect(rows).toHaveLength(6);
    const keys = rows.map((r) => `${r[0]}|${r[5]}`);
    expect(new Set(keys).size).toBe(6);
    expect(rows[0]).toEqual(['S1', '2020-06-01', '49.4', '0.2', '', 'R1', '1.10', '1.50']);
    expect(rows[2].slice(5)).toEqual(['R3', '3.10', '3.50']);
  });

  it('Pressure [dbar] as a replicate-like level: a pressure column in dbar, cells unchanged (10.50 stays 10.50)', () => {
    const ds = build(longSheet('Pressure [dbar]', ['10.50', '20.00', '30.10']));
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.slice(0, 6)).toEqual([...FIXED, 'Pressure [dbar]']);
    expect(rows.map((r) => r[5])).toEqual(['10.50', '20.00', '30.10', '10.50', '20.00', '30.10']);
    expect(header.filter((h) => /pressure/i.test(h))).toHaveLength(1);
  });

  it('a pressure that is constant per row of the output but not part of the key is carried too', () => {
    // one pressure per station, three parameters: no collision, so the key is not extended; the pressure still belongs to the row
    const ds = build(manyLong('Pressure [dbar]', (s) => `${s}0.50`));
    expect(ds.extraKeyColumns?.map((c) => c.header)).toEqual(['Pressure [dbar]']);
    const out = toCleanCsv(ds);
    const { header, rows } = parse(out.csv);
    expect(header.slice(0, 6)).toEqual([...FIXED, 'Pressure [dbar]']);
    expect(rows.map((r) => r[5])).toEqual(['10.50', '20.50', '30.50', '40.50']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a pressure that differs inside one output row and did not join the key is not written (every cell would be empty), and the note names it, as before', () => {
    const ds = build(manyLong('Pressure [dbar]', (s, p) => `${s}${['Corg', 'Ntot', 'Ptot'].indexOf(p)}.50`));
    const out = toCleanCsv(ds);
    expect(ds.extraKeyColumns).toBeUndefined();
    expect(parse(out.csv).header.some((h) => /pressure/i.test(h))).toBe(false);
    expect(left(out.sidecar)).toEqual(['source columns that are not in this file: Pressure [dbar]']);
    expect(notes(out.sidecar)).toContain('source columns that differ within a row, left empty there: Pressure [dbar] (4 rows)');
  });

  it('rows stay aligned with their cell after a give-way, a blank value and a skipped row', () => {
    const t = [
      'Station,Latitude,Longitude,Date,Replicate,Parameter,Value',
      'S1,49.4,0.2,2020-06-01,R1,Corg,NA', // gives way to the next value of the same replicate
      'S1,49.4,0.2,2020-06-01,R1,Corg,1.10',
      'S1,49.4,0.2,2020-06-01,R2,Corg,',
      'S1,49.4,0.2,2020-06-01,R2,,9.99', // no parameter: not a row
      'S1,49.4,0.2,2020-06-01,R3,Corg,3.30',
      'S1,49.4,0.2,2020-06-01,R2,Corg,2.20', // a second value of R2 after a blank one
      'S1,49.4,0.2,2020-06-01,R1,Corg,1.10', // the same value again: adds nothing
      'S1,49.4,0.2,2020-06-01,R3,Corg,3.30',
      'S1,49.4,0.2,2020-06-01,R1,Ntot,5.50',
      'S1,49.4,0.2,2020-06-01,R2,Ntot,6.60',
    ].join('\n');
    const ds = build(t);
    expect(ds.extraKeyColumns?.map((c) => c.header)).toEqual(['Replicate']);
    const { header, rows } = parse(toCleanCsv(ds).csv);
    const at = (r: string) => rows.find((x) => x[5] === r)!;
    expect(header.slice(5)).toEqual(['Replicate', 'Corg', 'Ntot']);
    expect(rows).toHaveLength(3);
    expect(at('R1').slice(6)).toEqual(['1.10', '5.50']);
    expect(at('R2').slice(6)).toEqual(['2.20', '6.60']);
    expect(at('R3').slice(6)).toEqual(['3.30', '']);
  });

  it('a blank pressure on the first row of a group takes the first one written below it', () => {
    const t = manyLong('Pressure [dbar]', (s, p) => (p === 'Corg' ? '' : `${s}0.50`));
    const { rows } = parse(toCleanCsv(build(t)).csv);
    expect(rows.map((r) => r[5])).toEqual(['10.50', '20.50', '30.50', '40.50']);
  });
});

describe('a wide sheet: the pressure is written', () => {
  const wide = ['Station,Latitude,Longitude,Date,Depth [m],Pressure [dbar],Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,10.50,11.2', 'S1,49.4,0.2,2020-06-01,10,20.00,10.4', 'S2,49.5,0.3,2020-06-01,5,10.50,11.0'].join('\n');

  it('Pressure [dbar] comes after the depth and before the variables, cells unchanged', () => {
    const ds = build(wide);
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header).toEqual([...FIXED.slice(0, 4), 'depth [m]', 'Pressure [dbar]', 'Temp [°C]']);
    expect(rows.map((r) => r[5])).toEqual(['10.50', '20.00', '10.50']);
    expect(rows[1]).toEqual(['S1', '2020-06-01', '49.4', '0.2', '10', '20.00', '10.4']);
  });

  it('a pressure already mapped as a variable is written once, as that variable', () => {
    const ds = build(wide, (ms) => {
      for (const c of ms[0].columns) if (c.header === 'Pressure [dbar]') c.role = { kind: 'variable', variable: 'Pressure', unit: 'dbar' } as ColumnRole;
    });
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(ds.extraKeyColumns).toBeUndefined();
    expect(header.filter((h) => /pressure/i.test(h))).toEqual(['Pressure [dbar]']);
    expect(rows[0].at(-2)).toBe('10.50');
    expect(left(toCleanCsv(ds).sidecar)).toEqual([]);
  });

  it('a header that collides with a column already in the CSV is renamed, never merged or dropped', () => {
    const t = ['Station,Latitude,Longitude,Date,Pressure [dbar],Pressure [dbar],Temp [°C]', 'S1,49.4,0.2,2020-06-01,10.50,11.50,11.2'].join('\n');
    const ds = build(t, (ms) => {
      ms[0].columns[5].role = { kind: 'variable', variable: 'Pressure', unit: 'dbar' } as ColumnRole;
      ms[0].columns[4].role = { kind: 'pressure', unit: 'dbar' };
    });
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.filter((h) => /pressure/i.test(h))).toEqual(['Pressure [dbar]', 'Pressure_2 [dbar]']);
    expect(rows[0].slice(5)).toEqual(['10.50', '11.50', '11.2']);
  });

  it('two pressure columns that repeat one header stay two columns with their own cells', () => {
    const t = ['Station,Latitude,Longitude,Date,Pressure [dbar],Pressure [dbar],Temp [°C]', 'S1,49.4,0.2,2020-06-01,10.50,11.50,11.2'].join('\n');
    const ds = build(t, (ms) => {
      for (const i of [4, 5]) ms[0].columns[i].role = { kind: 'pressure', unit: 'dbar' };
    });
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.slice(5)).toEqual(['Pressure [dbar]', 'Pressure_2 [dbar]', 'Temp [°C]']);
    expect(rows[0].slice(5)).toEqual(['10.50', '11.50', '11.2']);
  });

  it('a decimal-comma file loses only the comma of its pressure, as every measurement does', () => {
    const t = ['Station;Latitude;Longitude;Date;Pressure [dbar];Temp [°C]', 'S1;49,4;0,2;2020-06-01;10,50;11,2'].join('\n');
    const ds = build(t);
    expect(parse(toCleanCsv(ds).csv).rows[0].slice(5)).toEqual(['10.50', '11.2']);
  });
});

describe('a sheet with no extended key and no pressure is written as before', () => {
  it('the clean CSV is byte-identical to the fixed columns and variables, in a long and in a wide sheet', () => {
    const wide = ['Station,Latitude,Longitude,Date,Depth [m],Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,11.20', 'S2,49.5,0.3,2020-06-02,10,10.40'].join('\n');
    expect(toCleanCsv(build(wide)).csv).toBe(['station,date [ISO 8601],latitude [degrees_north],longitude [degrees_east],depth [m],Temp [°C]', 'S1,2020-06-01,49.4,0.2,5,11.20', 'S2,2020-06-02,49.5,0.3,10,10.40', ''].join('\n'));
    const long = manyLong('', () => '', 2);
    expect(toCleanCsv(build(long)).csv).toBe(
      ['station,date [ISO 8601],latitude [degrees_north],longitude [degrees_east],depth,Corg,Ntot,Ptot', 'S1,2020-06-01,49.4,0.2,,1.40,1.40,1.40', 'S2,2020-06-01,49.4,0.2,,2.40,2.40,2.40', ''].join('\n'),
    );
  });

  it('and its sidecar has no note when no source column is left out', () => {
    const wide = ['Station,Latitude,Longitude,Date,Temp [°C]', 'S1,49.4,0.2,2020-06-01,11.20'].join('\n');
    expect(notes(toCleanCsv(build(wide)).sidecar)).toEqual([]);
  });
});

describe('every source column the clean CSV does not contain is named', () => {
  it('a long list of descriptive columns is written whole, in file order, after the variables, and nothing is named', () => {
    const extra = Array.from({ length: 60 }, (_, i) => `Note ${i + 1}`);
    const t = [`Station,Latitude,Longitude,Date,${extra.join(',')},Temp [°C]`, `S1,49.4,0.2,2020-06-01,${extra.map((_, i) => `n${i}`).join(',')},11.2`].join('\n');
    const out = toCleanCsv(build(t));
    const { header, rows } = parse(out.csv);
    expect(header.slice(-61)).toEqual(['Temp [°C]', ...extra]);
    expect(rows[0].slice(-60)).toEqual(extra.map((_, i) => `n${i}`));
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a long list the person set to ignore is named whole, in file order, and names nothing that is written', () => {
    const extra = Array.from({ length: 60 }, (_, i) => `Sal ${i + 1}`);
    const t = [`Station,Latitude,Longitude,Date,${extra.join(',')},Temp [°C]`, `S1,49.4,0.2,2020-06-01,${extra.map((_, i) => `${i}.5`).join(',')},11.2`].join('\n');
    const ds = build(t, (m) => { for (const c of m[0].columns) if (extra.includes(c.header)) c.role = { kind: 'ignore' }; });
    const out = toCleanCsv(ds);
    const names = left(out.sidecar);
    expect(names).toHaveLength(1);
    const list = names[0].slice(names[0].indexOf(': ') + 2).split(' | ');
    expect(list).toEqual(extra);
    expect(parse(out.csv).header).not.toContain('Sal 1');
    for (const written of ['Station', 'Latitude', 'Longitude', 'Date', 'Temp [°C]']) expect(list).not.toContain(written);
  });

  it('a descriptive column of a long sheet is written once per output row; the parameter, unit and value columns are carried and not named', () => {
    const lines = ['Station,Latitude,Longitude,Date,Comment,Parameter,Unit,Value'];
    for (let s = 1; s <= 4; s++) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`S${s},49.4,0.2,2020-06-01,ok${s},${p},mg/l,${s}.5`);
    const out = toCleanCsv(build(lines.join('\n')));
    const { header, rows } = parse(out.csv);
    expect(header[header.length - 1]).toBe('Comment');
    expect(rows.map((r) => r[r.length - 1])).toEqual(['ok1', 'ok2', 'ok3', 'ok4']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a pressure the sheet cannot carry is named, the comment beside it is written', () => {
    const ds = build(manyLong('Pressure [dbar],Comment', (s, p) => `${s}${['Corg', 'Ntot', 'Ptot'].indexOf(p)}.50,ok`));
    const out = toCleanCsv(ds);
    expect(parse(out.csv).header.slice(-1)).toEqual(['Comment']);
    expect(parse(out.csv).header.some((h) => /pressure/i.test(h))).toBe(false);
    expect(left(out.sidecar)).toEqual(['source columns that are not in this file: Pressure [dbar]']);
  });

  it('the sidecar lists a written extra column with its original name and unit', () => {
    const out = toCleanCsv(build(longSheet('Pressure [dbar]', ['10.50', '20.00'])));
    const row = parse(out.sidecar).rows.find((r) => r[0] === 'Pressure [dbar]')!;
    expect(row.slice(0, 4)).toEqual(['Pressure [dbar]', 'Pressure [dbar]', 'dbar', 'header']);
  });
});

describe('IN-HEADER-UNITS-READ names an example from the file and never says 0 columns', () => {
  it('a,b,c over h,s,m names "a [h]", in all four languages, and never a latitude', () => {
    const f = textFile('u.csv', ['a,b,c', 'h,s,m', '1,2,3', '4,5,6', '7,8,9'].join('\n'));
    const fin = f.findings.find((x) => x.ruleId === 'IN-HEADER-UNITS-READ')!;
    expect(fin.params).toEqual({ count: 3, example: 'a [h]' });
    for (const lang of LANGS) {
      const t = renderPlain(fin, lang);
      expect(t, lang).toContain('a [h]');
      expect(t, lang).not.toContain('latitude');
      expect(t, lang).not.toMatch(/[{}]/);
    }
  });

  it('units already in every name: the row is not data, and that is said in its own text in all four languages, never as "0 columns"', () => {
    const f = textFile('u.csv', ['a [h],b [s],c [m]', 'h,s,m', '1,2,3', '4,5,6', '7,8,9'].join('\n'));
    expect(f.sheets[0].header).toEqual(['a [h]', 'b [s]', 'c [m]']);
    expect(f.sheets[0].rows).toHaveLength(3);
    expect(f.findings.filter((x) => x.ruleId === 'IN-HEADER-UNITS-READ')).toEqual([]);
    const named = f.findings.filter((x) => x.ruleId === 'IN-HEADER-UNITS-NAMED');
    expect(named).toHaveLength(1);
    expect(named[0].lines).toEqual([2]);
    for (const lang of LANGS) {
      const t = renderPlain(named[0], lang);
      expect(t, lang).toContain('2');
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t, lang).not.toMatch(/\b0\b/);
    }
  });

  it('foldUnitsRow carries the example only when a name changed', () => {
    const r = (cells: string[], line: number) => ({ line, cells, fieldCount: cells.length });
    const rows = [r(['h', 's'], 2), r(['1', '2'], 3), r(['3', '4'], 4)];
    expect(foldUnitsRow(['a', 'b'], rows, false)?.example).toBe('a [h]');
    expect(foldUnitsRow(['a [h]', 'b [s]'], rows, false)?.example).toBeUndefined();
    expect(foldUnitsRow(['a [h]', 'b [s]'], rows, false)?.count).toBe(0);
  });
});

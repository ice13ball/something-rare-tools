// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A source column nothing else carries (a fjord, a water type, a gear) is written by the clean CSV after the variables, as the file has it. Only trailing columns may differ from the CSV before this existed.
// Every file here is invented.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripTrailingColumns } from '../../scripts/csv-strip';
import { buildDataset, buildDatasets } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { parseFile } from '../../src/core/parse';
import { UI } from '../../src/core/i18n/ui';
import { readMappingFile } from '../../src/core/parse/mappingFile';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { Dataset, ParsedFile, SheetMapping } from '../../src/core/types';
import { dateCell, textFile, xlsxFile } from '../helpers/files';

const build = (file: ParsedFile, edit?: (m: SheetMapping[]) => void): Dataset => {
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  edit?.(mappings);
  return buildDataset(file, layout, mappings, [], 'd').dataset;
};
const buildAll = (file: ParsedFile): Dataset[] => {
  const layout = proposeLayout(file);
  return buildDatasets(file, layout, proposeMappings(file, layout), [], 'd').datasets;
};
const parse = (csv: string): { header: string[]; rows: string[][] } => {
  const sheet = textFile('out.csv', csv).sheets[0];
  return { header: sheet.header, rows: sheet.rows.map((r) => r.cells.map((c) => String(c ?? ''))) };
};
const notes = (sidecar: string): string[] => parse(sidecar).rows.filter((r) => r[0] === '(note)').map((r) => r[1]);
const text = (t: string, name = 's.csv') => textFile(name, t);
const without = (ds: Dataset): Dataset => ({ ...ds, descriptiveColumns: undefined });

/** The invariant: the CSV without its trailing descriptive columns is the CSV the dataset gave before they existed. */
function expectOnlyTrailing(ds: Dataset): void {
  const k = ds.descriptiveColumns?.length ?? 0;
  expect(stripTrailingColumns(toCleanCsv(ds).csv, k)).toBe(toCleanCsv(without(ds)).csv);
}

describe('a descriptive column is written after the variables, as the file has it', () => {
  it('wide: Fjord, Type_of_water and Area, in file order, with their cells; nothing is named', () => {
    const t = ['Station,Fjord,Latitude,Longitude,Date,Type_of_water,Temp [°C],Area', 'S1,Nordfjord,49.4,0.2,2020-06-01,brackish,11.2,A1', 'S2,Sunnfjord,49.5,0.3,2020-06-02,marine,10.4,B2'].join('\n');
    const ds = build(text(t));
    const out = toCleanCsv(ds);
    const { header, rows } = parse(out.csv);
    expect(header.slice(-4)).toEqual(['Temp [°C]', 'Fjord', 'Type_of_water', 'Area']);
    expect(rows.map((r) => r.slice(-3))).toEqual([['Nordfjord', 'brackish', 'A1'], ['Sunnfjord', 'marine', 'B2']]);
    expect(notes(out.sidecar).filter((n) => n.includes('not in this file'))).toEqual([]);
    expectOnlyTrailing(ds);
    // the sidecar maps each new column like the others
    const side = parse(out.sidecar).rows.filter((r) => r[0] !== '(note)');
    expect(side.find((r) => r[0] === 'Fjord')?.slice(0, 2)).toEqual(['Fjord', 'Fjord']);
  });

  it('a collision gets a suffix, caseless, as the key columns do', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],date [ISO 8601],DATE [iso 8601]', 'S1,49.4,0.2,2020-06-01,11.2,a,b'].join('\n');
    const h = parse(toCleanCsv(build(text(t))).csv).header;
    expect(h.slice(-2)).toEqual(['date [ISO 8601]_2', 'DATE [iso 8601]_3']);
    expect(new Set(h.map((x) => x.toLowerCase())).size).toBe(h.length);
  });

  it('a column already written in another form is not written again: fixed columns, variables, extra key columns, date parts, a merged time', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Depth [m],Temp [°C],Fjord', 'S1,49.4,0.2,2020-06-01,10:30,5,11.2,Nord', 'S2,49.5,0.3,2020-06-02,11:45,6,10.4,Sund'].join('\n');
    const ds = build(text(t));
    const { header } = parse(toCleanCsv(ds).csv);
    expect(ds.descriptiveColumns?.map((d) => d.header)).toEqual(['Fjord']);
    expect(header.filter((h) => /station|time|temp|latitude/i.test(h))).toEqual(['station', 'latitude [degrees_north]', 'Temp [°C]']);
    const long = ['Station,Latitude,Longitude,Date,Replicate,Parameter,Unit,Value,Fjord'];
    for (const s of ['S1', 'S2']) for (const [k, r] of ['R1', 'R2'].entries()) for (const p of ['Corg', 'Ntot']) long.push(`${s},49.4,0.2,2020-06-01,${r},${p},mg/l,1.${k + 5},Nord`);
    const dl = build(text(long.join('\n')));
    expect(dl.descriptiveColumns?.map((d) => d.header)).toEqual(['Fjord']);
    const h = parse(toCleanCsv(dl).csv).header;
    expect(h.filter((x) => /replicate|parameter|unit|value/i.test(x))).toEqual(['Replicate']);
    expectOnlyTrailing(dl);
  });

  it('an empty column is neither written nor named; a sheet without a descriptive column is unchanged', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],Notes', 'S1,49.4,0.2,2020-06-01,11.2,', 'S2,49.5,0.3,2020-06-02,10.4,  '].join('\n');
    const ds = build(text(t));
    const out = toCleanCsv(ds);
    expect(ds.descriptiveColumns).toBeUndefined();
    expect(parse(out.csv).header).not.toContain('Notes');
    expect(notes(out.sidecar)).toEqual([]);
    expect(out.csv).toBe(toCleanCsv(without(ds)).csv);
  });

  it('a column the person set to ignore (the proposal gave it a role) stays out and stays named', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],Salinity,Fjord', 'S1,49.4,0.2,2020-06-01,11.2,34.1,Nord'].join('\n');
    const ds = build(text(t), (m) => { for (const c of m[0].columns) if (c.header === 'Salinity') c.role = { kind: 'ignore' }; });
    const out = toCleanCsv(ds);
    expect(parse(out.csv).header.slice(-2)).toEqual(['Temp [°C]', 'Fjord']);
    expect(notes(out.sidecar)).toEqual(['source columns that are not in this file: Salinity']);
  });

  it('a partly read column stays a note only', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C]', 'S1,49.4,0.2,2020-06-01,11.2', 'S2,49.5,0.3,spring,10.4', 'S3,49.6,0.4,2020-06-03,10.1'].join('\n');
    const ds = build(text(t));
    expect(ds.descriptiveColumns).toBeUndefined();
    expect(notes(toCleanCsv(ds).sidecar)).toContain('source columns only partly in this file: Date (2 of 3 cells)');
  });
});

describe('headers that are hard to write', () => {
  it('a comma, a pipe, a formula start and __proto__ are written safely', () => {
    const heads = ['Area, km2', 'a|b', '=cmd', '__proto__'];
    const t = [`Station,Latitude,Longitude,Date,Temp [°C],${heads.map((h) => (h.includes(',') ? `"${h}"` : h)).join(',')}`, 'S1,49.4,0.2,2020-06-01,11.2,x,y,z,w'].join('\n');
    const ds = build(text(t));
    expect(ds.descriptiveColumns?.map((d) => d.header)).toEqual(heads);
    const out = toCleanCsv(ds);
    const { header, rows } = parse(out.csv);
    expect(header.slice(-4)).toEqual(['Area, km2', 'a|b', "'=cmd", '__proto__']);
    expect(rows[0].slice(-4)).toEqual(['x', 'y', 'z', 'w']);
    expect(parse(out.sidecar).rows.some((r) => r[0] === '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a cell that starts a formula is guarded', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],Comment', 'S1,49.4,0.2,2020-06-01,11.2,=1+1'].join('\n');
    expect(parse(toCleanCsv(build(text(t))).csv).rows[0].slice(-1)).toEqual(["'=1+1"]);
  });
});

describe('a long sheet: the cell its source rows agree on', () => {
  const lines = (comment: (s: number, p: string) => string): string => {
    const l = ['Station,Latitude,Longitude,Date,Parameter,Value,Fjord,Notes'];
    for (let s = 1; s <= 4; s++) for (const p of ['Corg', 'Ntot', 'Ptot']) l.push(`S${s},49.4,0.2,2020-06-0${s},${p},${s}.5,Fjord${s},${comment(s, p)}`);
    return l.join('\n');
  };

  it('Fjord agrees on every row, Notes differs for three stations: empty there, counted per column', () => {
    const ds = build(text(lines((s, p) => (s <= 3 ? `${p}-${s}` : 'same'))));
    const out = toCleanCsv(ds);
    const { header, rows } = parse(out.csv);
    expect(header.slice(-2)).toEqual(['Fjord', 'Notes']);
    expect(rows.map((r) => r.slice(-2))).toEqual([['Fjord1', ''], ['Fjord2', ''], ['Fjord3', ''], ['Fjord4', 'same']]);
    expect(notes(out.sidecar)).toContain('source columns that differ within a row, left empty there: Notes (3 rows)');
    expectOnlyTrailing(ds);
  });

  it('a blank cell among agreeing cells does not disagree; two numbers written differently that are one number agree', () => {
    const l = ['Station,Latitude,Longitude,Date,Parameter,Value,Fjord'];
    for (const s of ['S1', 'S2', 'S3']) l.push(`${s},49.4,0.2,2020-06-01,Corg,1.5,`, `${s},49.4,0.2,2020-06-01,Ntot,1.6,Nord`, `${s},49.4,0.2,2020-06-01,Ptot,1.7, Nord `);
    const out = toCleanCsv(build(text(l.join('\n'))));
    expect(parse(out.csv).rows.map((r) => r[r.length - 1])).toEqual(['Nord', 'Nord', 'Nord']);
    expect(notes(out.sidecar).filter((n) => n.includes('differ within'))).toEqual([]);
  });
});

describe('a lookup sheet lends its descriptive columns', () => {
  const run = (sites: (string | number)[][], data: (string | number)[][]) => buildAll(xlsxFile('book.xlsx', { Sites: sites, Data: data }))[0];

  it('written beside the data row, a collision suffixed; an ambiguous key leaves the cell empty, counted', () => {
    const sites = [['Station', 'Latitude', 'Longitude', 'Fjord', 'Region'], ['S1', 70.1, 15.2, 'Nord', 'n'], ['S2', 60.2, 5.4, 'Sund', 's'], ['S3', 50.3, -5.6, 'Ytre', 'o'], ['S3', 50.9, -5.9, 'Indre', 'i']];
    const data = [['Station', 'Date', 'Temperature [degC]', 'Fjord'], ['S1', '2020-06-01', 4.5, 'own1'], ['S2', '2020-06-02', 5.5, 'own2'], ['S3', '2020-06-03', 6.5, 'own3']];
    const ds = run(sites, data);
    const out = toCleanCsv(ds);
    const { header, rows } = parse(out.csv);
    expect(header.slice(-3)).toEqual(['Fjord', 'Fjord_2', 'Region']);
    expect(rows.map((r) => r.slice(-3))).toEqual([['own1', 'Nord', 'n'], ['own2', 'Sund', 's'], ['own3', '', '']]);
    expect(notes(out.sidecar)).toContain('source columns of a joined sheet whose key is ambiguous, left empty there: Fjord (1 row) | Region (1 row)');
    expectOnlyTrailing(ds);
  });
});

describe('Excel cells are written by the rules of the key columns', () => {
  it('a date-formatted descriptive column is written as the date and time it is; a General number stays a number', () => {
    const rows: (string | number | object)[][] = [['Station', 'Latitude', 'Longitude', 'Date', 'Temp [°C]', 'Sampled', 'Count']];
    rows.push(['S1', 49.4, 0.2, dateCell(43983), 11.2, { t: 'n', v: 43983.5, z: 'yyyy-mm-dd hh:mm:ss' }, 7], ['S2', 49.5, 0.3, dateCell(43984), 10.4, { t: 'n', v: 43984.25 + 0.25 / 86400, z: 'yyyy-mm-dd hh:mm:ss.000' }, 8]);
    const ds = build(xlsxFile('x.xlsx', { S: rows as never }));
    const { header, rows: out } = parse(toCleanCsv(ds).csv);
    expect(header.slice(-2)).toEqual(['Sampled', 'Count']);
    expect(out.map((r) => r.slice(-2))).toEqual([['2020-06-01T12:00', '7'], ['2020-06-02T06:00:00.250', '8']]);
    expectOnlyTrailing(ds);
  });
});

describe('several sheets and an unreadable layout', () => {
  it('two sheets with the same descriptive header share one column; each fills its own rows', () => {
    const mk = (extra: string, n: number) => [['Station', 'Latitude', 'Longitude', 'Date', 'Temp [°C]', 'Fjord'], ...Array.from({ length: n }, (_, i) => [`${extra}${i}`, 49.4, 0.2 + i / 10, '2020-06-01', 10 + i, `${extra}-fjord`])];
    const file = xlsxFile('two.xlsx', { A: mk('A', 2), B: mk('B', 3) });
    const ds = build(file);
    const { header, rows } = parse(toCleanCsv(ds).csv);
    expect(header.filter((h) => h === 'Fjord')).toHaveLength(1);
    expect(rows.map((r) => r[r.length - 1])).toEqual(['A-fjord', 'A-fjord', 'B-fjord', 'B-fjord', 'B-fjord']);
    expectOnlyTrailing(ds);
  });

  it('a transposed sheet is not built, so nothing is written and nothing breaks', () => {
    const file = xlsxFile('t.xlsx', { S: [['Parameter', 'S1', 'S2', 'S3'], ['Latitude', 49.4, 49.5, 49.6], ['Longitude', 0.2, 0.3, 0.4], ['Temp [°C]', 11, 12, 13], ['Fjord', 'a', 'b', 'c']] as never });
    for (const ds of buildAll(file)) expect(ds.descriptiveColumns).toBeUndefined();
  });

  it('a units row folded into the header is not written as data', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp,Fjord', ',degrees_north,degrees_east,,degC,', 'S1,49.4,0.2,2020-06-01,11.2,Nord', 'S2,49.5,0.3,2020-06-02,10.4,Sund'].join('\n');
    const ds = build(text(t));
    const { rows } = parse(toCleanCsv(ds).csv);
    expect(rows.map((r) => r[r.length - 1])).toEqual(['Nord', 'Sund']);
    expectOnlyTrailing(ds);
  });
});

describe('the sidecar still reads back', () => {
  it('the (setting) row of a sidecar with descriptive columns is read, and the new rows are ignored', () => {
    const t = ['Station,Latitude,Longitude,Date,Temp [°C],Fjord', 'S1,49.4,0.2,2020-06-01,11.2,Nord'].join('\n');
    const side = toCleanCsv(build(text(t)), { singleCruise: true }).sidecar;
    expect(readMappingFile(textFile('map.csv', side))).toEqual({ singleCruise: true });
  });
});

describe('every fixture file of the repository: only trailing columns differ', () => {
  const dir = join(__dirname, '..', 'fixtures');
  for (const name of readdirSync(dir).filter((n) => /^layout-.*\.csv$/.test(n))) {
    it(name, () => {
      const file = parseFile(name, new Uint8Array(readFileSync(join(dir, name))));
      for (const ds of buildAll(file)) expectOnlyTrailing(ds);
    });
  }
});

describe('the texts that speak of ignored columns are true again, in four languages', () => {
  it('the clean CSV tip says that a column nothing else carries is written, and that a column the person ignored is named', () => {
    const t = (lang: 'en' | 'pl' | 'de' | 'fr') => UI[lang]['tip.cleanCsv.logic'];
    expect(t('en')).toContain('(a fjord, a water type, a sampling gear) is written after the variables');
    expect(t('pl')).toContain('(fiord, typ wody, narzędzie próbkowania), jest zapisywana po zmiennych');
    expect(t('de')).toContain('(ein Fjord, eine Wasserart, ein Probenahmegerät), nach den Variablen');
    expect(t('fr')).toContain("(un fjord, un type d'eau, un engin d'échantillonnage) est écrite après les variables");
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      expect(t(lang), lang).not.toMatch(/any other ignored column is not written|każda inna pomijana kolumna nie trafia|jede andere ignorierte Spalte wird nicht geschrieben|toute autre colonne ignorée n'est pas écrite/);
      expect(UI[lang]['tip.role.ignore'], lang).not.toMatch(/nor of the clean CSV|ani w czystym CSV|nicht in die bereinigte CSV|ni dans le CSV nettoyé/);
    }
  });
});

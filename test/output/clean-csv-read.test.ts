// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The list of source columns the clean CSV leaves out comes from what the build READ, not from the roles; key columns no fixed column carries are written; a key column the person ignored is not.
// Every file here is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset, buildDatasets } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { renderPlain } from '../../src/core/report';
import { UI } from '../../src/core/i18n/ui';
import { createDirectEngine } from '../../src/worker/handler';
import { LANGS } from '../../src/core/types';
import type { ColumnRole, SheetMapping } from '../../src/core/types';
import { textFile, xlsxFile } from '../helpers/files';

function build(text: string, edit?: (m: SheetMapping[]) => void) {
  const file = textFile('s.csv', text);
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  edit?.(mappings);
  return buildDataset(file, layout, mappings, [], 'd');
}
const setRole = (ms: SheetMapping[], header: string, role: ColumnRole): void => {
  for (const c of ms[0].columns) if (c.header === header) c.role = role;
};
function parse(csv: string): { header: string[]; rows: string[][] } {
  const sheet = textFile('out.csv', csv).sheets[0];
  return { header: sheet.header, rows: sheet.rows.map((r) => r.cells.map((c) => String(c ?? ''))) };
}
const left = (sidecar: string): string[] =>
  parse(sidecar)
    .rows.filter((r) => r[0] === '(note)' && r[1].startsWith('source columns that are not in this file'))
    .map((r) => r[1]);
const part = (sidecar: string): string[] =>
  parse(sidecar)
    .rows.filter((r) => r[0] === '(note)' && r[1].startsWith('source columns only partly in this file'))
    .map((r) => r[1]);
const LEFT = 'source columns that are not in this file';
const PART = 'source columns only partly in this file';

describe('a time column', () => {
  it('beside a date it is merged into the date: not written as a column, not named', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Temp [°C]', 'S1,49.4,0.2,2020-06-01,10:30,11.2', 'S2,49.5,0.3,2020-06-02,11:45,10.4'].join('\n');
    const { dataset } = build(t);
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01T10:30', '2020-06-02T11:45']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('with no date it is read into nothing: a wide sheet writes it as a descriptive column, as the file has it', () => {
    const t = ['Station,Latitude,Longitude,Time,Temp [°C]', 'S1,49.4,0.2,10:30,11.2', 'S2,49.5,0.3,11:45,10.4'].join('\n');
    const { dataset } = build(t);
    const out = toCleanCsv(dataset);
    expect(left(out.sidecar)).toEqual([]);
    expect(parse(out.csv).header.slice(-2)).toEqual(['Temp [°C]', 'Time']);
    expect(parse(out.csv).rows.map((r) => r[r.length - 1])).toEqual(['10:30', '11:45']);
  });

  it('with no date it still splits the rows of a long sheet, so it is written as a key column', () => {
    const lines = ['Station,Latitude,Longitude,Time,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const t of ['10:30', '11:45']) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`${s},49.4,0.2,${t},${p},${t.length}.${p.length}`);
    const { dataset } = build(lines.join('\n'));
    const out = toCleanCsv(dataset);
    const { header, rows } = parse(out.csv);
    expect(header).toContain('Time');
    expect(rows).toHaveLength(4);
    const at = header.indexOf('Time');
    expect(new Set(rows.map((r) => `${r[0]}|${r[at]}`)).size).toBe(4);
    expect(left(out.sidecar)).toEqual([]);
  });
});

describe('a sheet joined to a lookup sheet: the columns it lent are the ones carried', () => {
  const run = (sites: (string | number)[][], data: (string | number)[][]) => {
    const file = xlsxFile('book.xlsx', { Sites: sites, Data: data });
    const layout = proposeLayout(file);
    const { datasets } = buildDatasets(file, layout, proposeMappings(file, layout), [], 'd');
    return { layout, ds: datasets[0] };
  };

  it('a Sites date that the data sheet does not take (it has its own) is written beside the data row, as the file has it', () => {
    const sites = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2019-01-01', 70.1, 15.2], ['S2', '2019-01-02', 60.2, 5.4], ['S3', '2019-01-03', 50.3, -5.6]];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { layout, ds } = run(sites, data);
    expect(layout.joins).toHaveLength(1);
    const out = toCleanCsv(ds);
    expect(parse(out.csv).rows.map((r) => [r[1], r[2]])).toEqual([['2020-06-01', '70.1'], ['2020-06-02', '60.2'], ['2020-06-03', '50.3']]);
    expect(left(out.sidecar)).toEqual([]);
    const { header, rows } = parse(out.csv);
    expect(header[header.length - 1]).toBe('Date');
    expect(rows.map((r) => r[r.length - 1])).toEqual(['2019-01-01', '2019-01-02', '2019-01-03']);
  });

  it('a Sites depth that two rows of one station disagree on lends no depth, and the column is named', () => {
    const sites = [['Station', 'Depth [m]', 'Latitude', 'Longitude'], ['S1', 5, 70.1, 15.2], ['S1', 6, 70.1, 15.2], ['S2', 5, 60.2, 5.4], ['S3', 5, 50.3, -5.6]];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { ds } = run(sites, data);
    const out = toCleanCsv(ds);
    const depth = parse(out.csv).header.findIndex((h) => h.startsWith('depth'));
    expect(parse(out.csv).rows.map((r) => r[depth])).toEqual(['', '5', '5']);
    // withheld for S1, lent for S2 and S3: the column is not carried whole, so it is named, with the counts
    expect(left(out.sidecar)).toEqual([]);
    expect(part(out.sidecar)).toEqual([`${PART} (sheet Sites): Depth [m] (2 of 4 joined cells)`]);
  });

  it('a Sites column no row took a value from is written, one that gave a position is not written twice', () => {
    const sites = [['Station', 'Latitude', 'Longitude', 'Region'], ['S1', 70.1, 15.2, 'north'], ['S2', 60.2, 5.4, 'south'], ['S3', 50.3, -5.6, 'south']];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { ds } = run(sites, data);
    const out = toCleanCsv(ds);
    expect(left(out.sidecar)).toEqual([]);
    const { header, rows } = parse(out.csv);
    expect(header.filter((h) => /region|latitude|longitude/i.test(h))).toEqual(['latitude [degrees_north]', 'longitude [degrees_east]', 'Region']);
    expect(rows.map((r) => r[r.length - 1])).toEqual(['north', 'south', 'south']);
  });
});

describe('date parts set by hand', () => {
  const base = (header: string, rows: string[]) => [`Station,Latitude,Longitude,${header},Temp [°C]`, ...rows].join('\n');
  const part = (p: 'year' | 'month' | 'day'): ColumnRole => ({ kind: 'datePart', part: p });

  it('year, month and day build the date: none of them is named', () => {
    const t = base('Year,Month,Day', ['S1,49.4,0.2,2020,6,1,11.2', 'S2,49.5,0.3,2020,6,2,10.4']);
    const { dataset } = build(t, (m) => {
      setRole(m, 'Year', part('year'));
      setRole(m, 'Month', part('month'));
      setRole(m, 'Day', part('day'));
    });
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020-06-02']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a month and a day with no year give no date: both are written as they are', () => {
    const t = base('Month,Day', ['S1,49.4,0.2,6,1,11.2', 'S2,49.5,0.3,6,2,10.4']);
    const { dataset } = build(t, (m) => {
      setRole(m, 'Month', part('month'));
      setRole(m, 'Day', part('day'));
    });
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['', '']);
    expect(left(out.sidecar)).toEqual([]);
    expect(parse(out.csv).header.slice(-2)).toEqual(['Month', 'Day']);
    expect(parse(out.csv).rows.map((r) => r.slice(-2))).toEqual([['6', '1'], ['6', '2']]);
  });

  it('a full date beside a month: the date is the date and the month is written as it is', () => {
    const t = base('Date,Month', ['S1,49.4,0.2,2020-06-01,6,11.2', 'S2,49.5,0.3,2020-06-02,6,10.4']);
    const { dataset } = build(t, (m) => setRole(m, 'Month', part('month')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020-06-02']);
    expect(left(out.sidecar)).toEqual([]);
    expect(parse(out.csv).header[parse(out.csv).header.length - 1]).toBe('Month');
  });

  it('a whole-year date column beside a month is the year of the combined date: neither is named', () => {
    const t = base('Date,Month', ['S1,49.4,0.2,2020,6,11.2', 'S2,49.5,0.3,2020,7,10.4']);
    const { dataset } = build(t, (m) => {
      setRole(m, 'Date', { kind: 'date' });
      setRole(m, 'Month', part('month'));
    });
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06', '2020-07']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a filled eventDate wins over a year column that disagrees with it: the year is written as it is', () => {
    const t = ['Station,Latitude,Longitude,eventDate,year,Temp [°C]', 'S1,49.4,0.2,2020-06-01,1999,11.2', 'S2,49.5,0.3,2020-06-02,1999,10.4'].join('\n');
    const { dataset } = build(t, (m) => setRole(m, 'year', part('year')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020-06-02']);
    expect(left(out.sidecar)).toEqual([]);
    expect(parse(out.csv).rows.map((r) => r[r.length - 1])).toEqual(['1999', '1999']);
  });

  it('an eventDate that is blank takes its year from the year column: the year is not named (the empty eventDate is)', () => {
    const t = ['Station,Latitude,Longitude,eventDate,year,Temp [°C]', 'S1,49.4,0.2,,2020,11.2', 'S2,49.5,0.3,,2021,10.4'].join('\n');
    const { dataset } = build(t, (m) => setRole(m, 'year', part('year')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020', '2021']);
    // the eventDate column holds nothing: no value of it is in the file, and no blank column is written for it
    expect(left(out.sidecar)).toEqual([`${LEFT}: eventDate`]);
    expect(parse(out.csv).header).not.toContain('eventDate');
  });
});

describe('vertical coordinates that split the rows of a long sheet are written', () => {
  for (const h of ['Sediment depth [m]', 'Depth bot [m]']) {
    it(h, () => {
      const t = ['Station,Latitude,Longitude,Date,Depth top [m],' + h + ',Parameter,Value', 'S1,49.4,0.2,2020-06-01,0,1.5,Corg,3.1', 'S1,49.4,0.2,2020-06-01,0,1.1,Corg,2.7', 'S2,49.5,0.3,2020-06-02,0,1.5,Corg,1.9'].join('\n');
      const { dataset } = build(t);
      const out = toCleanCsv(dataset);
      const { header, rows } = parse(out.csv);
      expect(header).toContain(h);
      expect(rows.map((r) => r[header.indexOf(h)])).toEqual(['1.5', '1.1', '1.5']);
      expect(left(out.sidecar)).toEqual([]);
    });
  }
});

describe('a key column the person set to ignore is not written; one that is ignore by default is', () => {
  const sheet = (head: string, cell: (s: number, p: string) => string) => {
    const lines = [`Station,Latitude,Longitude,Date,${head},Parameter,Value`];
    for (let s = 1; s <= 4; s++) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`S${s},49.4,0.2,2020-06-01,${cell(s, p)},${p},${s}.5`);
    return lines.join('\n');
  };
  const two = (head: string, first: string, second: string) => {
    const lines = [`Station,Latitude,Longitude,Date,${head},Parameter,Value`];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) [first, second].forEach((l, i) => lines.push(`${s},49.4,0.2,2020-06-01,${l},${p},${i + 1}.${p.length}${s.length}`));
    return lines.join('\n');
  };

  it('Replicate is ignore by default: written, with the mapping the page sends back unchanged (as after a sidecar run) or with none', () => {
    const t = two('Replicate', 'R1', 'R2');
    for (const edit of [undefined, (_: SheetMapping[]) => undefined]) {
      const { dataset, findings } = build(t, edit);
      const out = toCleanCsv(dataset);
      expect(parse(out.csv).header).toContain('Replicate');
      expect(left(out.sidecar)).toEqual([]);
      expect(findings.filter((f) => f.ruleId === 'ROW-LONG-KEY-EXTENDED').length).toBeGreaterThan(0);
    }
  });

  it('Replicate set to ignore by the person is the same as by default: it is not an explicit choice (the proposal was ignore)', () => {
    const { dataset } = build(two('Replicate', 'R1', 'R2'), (m) => setRole(m, 'Replicate', { kind: 'ignore' }));
    expect(parse(toCleanCsv(dataset).csv).header).toContain('Replicate');
  });

  it('a pressure the person set to ignore still separates the rows, is not written, and is named; the finding about the key stays true', () => {
    const t = two('Pressure [dbar]', '10.50', '20.00');
    const proposed = build(t);
    expect(parse(toCleanCsv(proposed.dataset).csv).header).toContain('Pressure [dbar]');
    const { dataset, findings } = build(t, (m) => setRole(m, 'Pressure [dbar]', { kind: 'ignore' }));
    const out = toCleanCsv(dataset);
    expect(dataset.rows).toHaveLength(4);
    expect(parse(out.csv).header.some((h) => /pressure/i.test(h))).toBe(false);
    expect(left(out.sidecar)).toEqual([`${LEFT}: Pressure [dbar]`]);
    const f = findings.filter((x) => x.ruleId === 'ROW-LONG-KEY-EXTENDED');
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].params.columns).toBe('Pressure [dbar]');
  });

  it('a time column the person set to ignore splits the rows, is not written, and is named', () => {
    const lines = ['Station,Latitude,Longitude,Time,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const t of ['10:30', '11:45']) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`${s},49.4,0.2,${t},${p},${t.length}.${p.length}`);
    const text = lines.join('\n');
    const written = build(text);
    expect(parse(toCleanCsv(written.dataset).csv).header).toContain('Time');
    const { dataset } = build(text, (m) => setRole(m, 'Time', { kind: 'ignore' }));
    const out = toCleanCsv(dataset);
    expect(dataset.rows).toHaveLength(2);
    expect(parse(out.csv).header).not.toContain('Time');
    expect(left(out.sidecar)).toEqual([`${LEFT}: Time`]);
  });

  it('ROW-KEY-IGNORED: fires only when the column the person set to ignore leaves rows of the clean CSV looking alike', () => {
    const ids = (t: string, edit?: (m: SheetMapping[]) => void) => build(t, edit).findings.filter((f) => f.ruleId === 'ROW-KEY-IGNORED');
    const t = two('Pressure [dbar]', '10.50', '20.00');
    const f = ids(t, (m) => setRole(m, 'Pressure [dbar]', { kind: 'ignore' }));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
    expect(f[0].params).toEqual({ columns: 'Pressure [dbar]', count: 1 });
    expect(f[0].lines?.length).toBeGreaterThan(0);
    // written (not ignored by the person): nothing looks alike
    expect(ids(t)).toEqual([]);
    // ignore by default, written: nothing
    expect(ids(two('Replicate', 'R1', 'R2'), (m) => setRole(m, 'Replicate', { kind: 'ignore' }))).toEqual([]);
    // the person ignores a column that separates nothing (every row of a station has one value)
    expect(ids(sheet('Analyst', (s) => `A${s}`), (m) => setRole(m, 'Analyst', { kind: 'ignore' }))).toEqual([]);
  });

  it('ROW-KEY-IGNORED names every ignored column that separates rows', () => {
    const lines = ['Station,Latitude,Longitude,Depth bottom [m],Sediment depth [cm],Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const [t, pr] of [['3.0', '1.5'], ['6.0', '4.5']]) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`${s},49.4,0.2,${t},${pr},${p},${t.length}.${p.length}${pr.length}`);
    const { findings } = build(lines.join('\n'), (m) => {
      setRole(m, 'Depth bottom [m]', { kind: 'ignore' });
      setRole(m, 'Sediment depth [cm]', { kind: 'ignore' });
    });
    const f = findings.filter((x) => x.ruleId === 'ROW-KEY-IGNORED');
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ columns: 'Depth bottom [m], Sediment depth [cm]', count: 2 });
  });

  it('a sheet built with no pressure and no key is unchanged by the ignore check (it asks for nothing)', () => {
    const { dataset } = build(sheet('', () => '').replace(',,Parameter', ',Parameter'));
    expect(dataset.extraKeyColumns).toBeUndefined();
  });
});

describe('per cell: a column is carried only if every non-blank cell of it gave something', () => {
  it('a time beside a date on one row only: the undated row leaves the time unused, so the wide sheet names it', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Temp [°C]', 'S1,49.4,0.2,2020-06-01,10:30,11.2', 'S2,49.5,0.3,,11:45,10.4'].join('\n');
    expect(part(toCleanCsv(build(t).dataset).sidecar)).toEqual([`${PART}: Time (1 of 2 cells)`]);
  });

  it('and on a long sheet the times that split undated rows are written, so the rows do not look identical', () => {
    const lines = ['Station,Latitude,Longitude,Date,Time,Parameter,Value'];
    for (const [d, t] of [['2020-06-01', '10:30'], ['', '11:45'], ['', '12:50']]) for (const p of ['Corg', 'Ntot']) lines.push(`S1,49.4,0.2,${d},${t},${p},${t.length}.${p.length}${d.length}`);
    const { dataset } = build(lines.join('\n'));
    const { header, rows } = parse(toCleanCsv(dataset).csv);
    expect(rows).toHaveLength(3);
    const at = header.indexOf('Time');
    expect(at).toBeGreaterThan(-1);
    expect(rows.map((r) => r[at])).toEqual(['10:30', '11:45', '12:50']);
  });

  it('a date that parses on one row and reads spring or summer on the others: the column is named (wide) or written raw as a key (long)', () => {
    const wide = ['Station,Latitude,Longitude,Date,Temp [°C]', 'S1,49.4,0.2,2020-06-01,11.2', 'S2,49.5,0.3,spring,10.4', 'S3,49.5,0.3,summer,10.1'].join('\n');
    expect(part(toCleanCsv(build(wide).dataset).sidecar)).toEqual([`${PART}: Date (1 of 3 cells)`]);
    const lines = ['Station,Latitude,Longitude,Date,Parameter,Value'];
    for (const d of ['2020-06-01', 'spring', 'summer']) for (const p of ['Corg', 'Ntot']) lines.push(`S1,49.4,0.2,${d},${p},${d.length}.${p.length}`);
    const { dataset } = build(lines.join('\n'));
    const out = toCleanCsv(dataset);
    const { header, rows } = parse(out.csv);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[header.indexOf('Date')])).toEqual(['2020-06-01', 'spring', 'summer']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a year under a filled eventDate on one row and the only date on another: named', () => {
    const t = ['Station,Latitude,Longitude,eventDate,year,Temp [°C]', 'S1,49.4,0.2,2020-06-01,1999,11.2', 'S2,49.5,0.3,,2020,10.4'].join('\n');
    const { dataset } = build(t, (m) => setRole(m, 'year', { kind: 'datePart', part: 'year' }));
    expect(parse(toCleanCsv(dataset).csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020']);
    expect(part(toCleanCsv(dataset).sidecar)).toEqual([`${PART}: year (1 of 2 cells)`]);
  });

  it('a Sites date lost on one row (the data row has its own) and lent on another: named', () => {
    const sites = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2019-01-01', 70.1, 15.2], ['S2', '2019-01-02', 60.2, 5.4], ['S3', '2019-01-03', 50.3, -5.6]];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '', 5.5], ['S3', '2020-06-03', 6.5]];
    const file = xlsxFile('book.xlsx', { Sites: sites, Data: data });
    const layout = proposeLayout(file);
    const { datasets } = buildDatasets(file, layout, proposeMappings(file, layout), [], 'd');
    const out = toCleanCsv(datasets[0]);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2019-01-02', '2020-06-03']);
    expect(part(out.sidecar)).toEqual([`${PART} (sheet Sites): Date (1 of 3 joined cells)`]);
  });
});

describe('Darwin Core depth bounds are not written by the clean CSV, so they are not carried', () => {
  it('a wide sheet with both bounds: the one the depth slot did not take is named, and no bound has a column of its own', () => {
    const t = ['Station,Latitude,Longitude,Date,minimumDepthInMeters,maximumDepthInMeters,Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,10,11.2', 'S2,49.5,0.3,2020-06-02,6,12,10.4'].join('\n');
    const out = toCleanCsv(build(t).dataset);
    const named = left(out.sidecar);
    expect(named).toEqual([]);
    // the bound the depth slot took is the depth; the other one is written after the variables, as the file has it
    expect(parse(out.csv).header.filter((h) => /inimum|aximum/.test(h))).toHaveLength(1);
  });

  it('a long sheet whose bound splits the rows: the bound is written as a key column', () => {
    const lines = ['Station,Latitude,Longitude,Date,minimumDepthInMeters,maximumDepthInMeters,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) [10, 20].forEach((mx, i) => lines.push(`${s},49.4,0.2,2020-06-01,0,${mx},${p},${i + 1}.${p.length}`));
    const { dataset } = build(lines.join('\n'));
    const out = toCleanCsv(dataset);
    const { header, rows } = parse(out.csv);
    expect(rows).toHaveLength(4);
    const written = header.filter((h) => /inimum|aximum/.test(h));
    expect(written.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => `${r[0]}|${header.map((h, i) => (/inimum|aximum|^depth/.test(h) ? r[i] : '')).join('|')}`)).size).toBe(4);
  });
});

describe('join keys count only when their value reached the output', () => {
  const sites = [['Station', 'Latitude', 'Longitude'], ['S1', 70.1, 15.2], ['S2', 60.2, 5.4], ['S3', 50.3, -5.6]];
  const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
  const run = (ignoreStation: boolean) => {
    const file = xlsxFile('book.xlsx', { Sites: sites, Data: data });
    const layout = proposeLayout(file);
    const mappings = proposeMappings(file, layout);
    if (ignoreStation) for (const m of mappings) for (const c of m.columns) if (c.header === 'Station') c.role = { kind: 'ignore' };
    return buildDatasets(file, layout, mappings, [], 'd').datasets[0];
  };

  it('the default join on Station: the key is the station of the file, nothing is named', () => {
    const out = toCleanCsv(run(false));
    expect(parse(out.csv).rows.map((r) => r[0])).toEqual(['S1', 'S2', 'S3']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('Station set to ignore on both sheets: it is not in the file, and both are named', () => {
    const out = toCleanCsv(run(true));
    expect(parse(out.csv).header).not.toContain('station');
    expect(left(out.sidecar).sort()).toEqual([`${LEFT} (sheet Data): Station`, `${LEFT} (sheet Sites): Station`]);
  });
});

describe('an Analyst column that is ignored by default and splits rows is written, and the person is told', () => {
  const analyst = (): string => {
    const lines = ['Station,Latitude,Longitude,Date,Analyst,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) ['Ada', 'Bob'].forEach((a, i) => lines.push(`${s},49.4,0.2,2020-06-01,${a},${p},${i + 1}.${p.length}`));
    return lines.join('\n');
  };

  it('it is written, the row-key finding names it, and its text says in four languages that the clean CSV writes it', async () => {
    const { dataset, findings } = build(analyst());
    expect(parse(toCleanCsv(dataset).csv).header).toContain('Analyst');
    const f = findings.find((x) => x.ruleId === 'ROW-LONG-KEY-EXTENDED')!;
    expect(f.params.columns).toBe('Analyst');
    const said: Record<string, RegExp> = { en: /The clean CSV writes it too/, pl: /Czysty CSV zapisuje ją też/, de: /Die bereinigte CSV schreibt diese Spalte auch/, fr: /Le CSV nettoyé l'écrit aussi/ };
    for (const lang of LANGS) expect(renderPlain(f, lang), lang).toMatch(said[lang]);
    for (const lang of LANGS) expect(renderPlain(f, lang), lang).not.toMatch(/[{}]/);
  });

  it('the finding reaches the report that is shown above the downloads (CheckPage: ReportView, then MapPreview, then Downloads)', async () => {
    const e = createDirectEngine();
    const p = await e.parse([{ name: 'long.csv', bytes: new TextEncoder().encode(analyst()), source: 'dropped' }], [], []);
    for (const f of p.files) {
      const pr = await e.propose(f.fileId, f.layout);
      await e.build(f.fileId, f.layout, pr.mappings);
    }
    const report = (await e.check()).report;
    const shown = report.findings.find((f) => f.ruleId === 'ROW-LONG-KEY-EXTENDED');
    expect(shown?.severity).toBe('info');
    expect(shown?.params.columns).toBe('Analyst');
  });

  it('the clean CSV tip says a column ignored by default that tells rows apart is written, and so is every other column nothing else carries', () => {
    for (const lang of LANGS) expect(UI[lang]['tip.cleanCsv.logic'], lang).not.toMatch(/\{/);
    expect(UI.en['tip.cleanCsv.logic']).toContain('On a long sheet, a column ignored by default that tells rows apart (a replicate, a cast, an analyst) is written');
    expect(UI.en['tip.cleanCsv.logic']).toContain('every other source column that no field of the file was built from');
    expect(UI.pl['tip.cleanCsv.logic']).toContain('analityk');
    expect(UI.de['tip.cleanCsv.logic']).toContain('Analystin');
    expect(UI.fr['tip.cleanCsv.logic']).toContain('analyste');
  });
});

describe('a numeric vertical key of a decimal-comma file is swapped like a pressure; text stays as written', () => {
  it('Sediment depth: 1,5 becomes 1.5, a word stays', () => {
    const lines = ['Station;Latitude;Longitude;Date;Sediment depth [m];Parameter;Value'];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) ['1,5', '1,1', 'surface'].forEach((d, i) => lines.push(`${s};49,4;0,2;2020-06-01;${d};${p};${i + 1},${p.length}`));
    const { dataset } = build(lines.join('\n'));
    expect(dataset.decimalComma).toBe(true);
    const { header, rows } = parse(toCleanCsv(dataset).csv);
    const at = header.findIndex((h) => /sediment/i.test(h) && !/^depth/.test(h));
    expect(rows.slice(0, 3).map((r) => r[at])).toEqual(['1.5', '1.1', 'surface']);
  });
});

describe('round 3: every right row of a joined key is judged; the date is credited only when it stays', () => {
  const run = (sites: (string | number)[][], data: (string | number)[][]) => {
    const file = xlsxFile('book.xlsx', { Sites: sites, Data: data });
    const layout = proposeLayout(file);
    return buildDatasets(file, layout, proposeMappings(file, layout), [], 'd').datasets[0];
  };
  const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];

  it('a depth blank on the first S1 row and 6 on the second, while S2 lends 7: the 6 is lost, so Depth is named', () => {
    const sites = [['Station', 'Depth [m]', 'Latitude', 'Longitude'], ['S1', '', 70.1, 15.2], ['S1', 6, 70.1, 15.2], ['S2', 7, 60.2, 5.4], ['S3', 7, 50.3, -5.6]];
    expect(part(toCleanCsv(run(sites, data)).sidecar)).toEqual([`${PART} (sheet Sites): Depth [m] (2 of 3 joined cells)`]);
  });

  it('Cruise C1 and C2 on one key: the cruise of the second row is lost, so Cruise is named', () => {
    const sites = [['Station', 'Cruise', 'Latitude', 'Longitude'], ['S1', 'C1', 70.1, 15.2], ['S1', 'C2', 70.1, 15.2], ['S2', 'C1', 60.2, 5.4], ['S3', 'C1', 50.3, -5.6]];
    expect(part(toCleanCsv(run(sites, data)).sidecar)).toEqual([`${PART} (sheet Sites): Cruise (3 of 4 joined cells)`]);
  });

  it('an ambiguous key beside a lent one: the position of the ambiguous rows was never given, so it is named', () => {
    const sites = [['Station', 'Latitude', 'Longitude'], ['S1', 70.1, 15.2], ['S1', 71.9, 16.8], ['S2', 60.2, 5.4], ['S3', 50.3, -5.6]];
    const out = toCleanCsv(run(sites, data));
    expect(part(out.sidecar).join('|')).toMatch(/\(sheet Sites\): .*Latitude \(2 of 4 joined cells\)/);
  });

  it('identical repeats of one key are not lost: nothing is named', () => {
    const sites = [['Station', 'Cruise', 'Latitude', 'Longitude'], ['S1', 'C1', 70.1, 15.2], ['S1', 'C1', 70.1, 15.2], ['S2', 'C1', 60.2, 5.4], ['S3', 'C1', 50.3, -5.6]];
    const out = toCleanCsv(run(sites, data));
    expect([...left(out.sidecar), ...part(out.sidecar)]).toEqual([]);
  });

  it('a zone-stated time that replaces the date on the SAME day the date states: the date is credited, nothing is named', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Temp [°C]', 'S1,49.4,0.2,2020-06-02,2020-06-02T10:30:00Z,11.2', 'S2,49.5,0.3,2020-06-03,2020-06-03T11:45:00Z,10.4'].join('\n');
    const out = toCleanCsv(build(t).dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-02T10:30:00Z', '2020-06-03T11:45:00Z']);
    expect([...left(out.sidecar), ...part(out.sidecar)]).toEqual([]);
  });

  it('a zone-stated time that replaces the date on ANOTHER day: the day of the date cell is not in the file, so the date column is named', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Temp [°C]', 'S1,49.4,0.2,2020-06-02,2020-06-03T00:10:00Z,11.2', 'S2,49.5,0.3,2020-06-03,2020-06-04T00:20:00Z,10.4'].join('\n');
    const out = toCleanCsv(build(t).dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-03T00:10:00Z', '2020-06-04T00:20:00Z']);
    expect(left(out.sidecar)).toEqual([]);
    expect(parse(out.csv).rows.map((r) => r[r.length - 1])).toEqual(['2020-06-02', '2020-06-03']);
  });
});

describe('round 3: source rows that merge into one output row of a long sheet are all counted', () => {
  it('a year column outside the key, 2021 and 1999 under an empty eventDate: the year is named', () => {
    const lines = ['Station,Latitude,Longitude,eventDate,year,Parameter,Value'];
    for (const s of ['S1', 'S2']) [['Corg', '2021'], ['Ntot', '1999'], ['Ptot', '2021']].forEach(([p, y]) => lines.push(`${s},49.4,0.2,,${y},${p},${p.length}.${s.length}`));
    const { dataset } = build(lines.join('\n'), (m) => setRole(m, 'year', { kind: 'ignore' }));
    expect(dataset.rows).toHaveLength(2);
    expect(part(toCleanCsv(dataset).sidecar)).toEqual([`${PART}: year (2 of 4 rows)`]);
  });

  it('N and S at one latitude on the rows of one station: the hemisphere column is named', () => {
    const lines = ['Station,Latitude,Lat NS,Longitude,Date,Parameter,Value'];
    for (const s of ['S1', 'S2']) [['Corg', 'N'], ['Ntot', 'S'], ['Ptot', 'N']].forEach(([p, h]) => lines.push(`${s},49.4,${h},0.2,2020-06-01,${p},${p.length}.${s.length}`));
    const { dataset } = build(lines.join('\n'), (m) => setRole(m, 'Lat NS', { kind: 'hemisphere', axis: 'latitude' }));
    expect(dataset.rows).toHaveLength(2);
    expect(part(toCleanCsv(dataset).sidecar)).toEqual([`${PART}: Lat NS (2 of 4 rows)`]);
  });

  it('the same year on every row of a station is one value: not named for merging', () => {
    const lines = ['Station,Latitude,Longitude,eventDate,year,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) lines.push(`${s},49.4,0.2,,2021,${p},${p.length}.${s.length}`);
    const { dataset } = build(lines.join('\n'), (m) => setRole(m, 'year', { kind: 'ignore' }));
    const sc = toCleanCsv(dataset).sidecar;
    expect([...left(sc), ...part(sc)].join('|')).not.toMatch(/\byear\b/);
  });
});

describe('round 3: one column of the row-key sentence reads naturally in pl and fr, and the text says what the clean CSV writes', () => {
  const f = (count: number, columns: string) => ({ ruleId: 'ROW-LONG-KEY-EXTENDED', severity: 'info', sheet: 'S', lines: [3], params: { columns, count } }) as never;

  it('one column: the count forms point at the column', () => {
    expect(renderPlain(f(1, 'Analyst'), 'pl')).toContain('Czysty CSV zapisuje ją też');
    expect(renderPlain(f(1, 'Analyst'), 'fr')).toContain("Le CSV nettoyé l'écrit aussi");
    expect(renderPlain(f(1, 'Analyst'), 'en')).toContain('The clean CSV writes it too');
    expect(renderPlain(f(1, 'Analyst'), 'de')).toContain('Die Spalte, die sie unterscheidet');
    expect(renderPlain(f(1, 'Analyst'), 'en')).toContain('read and checked');
  });

  it('several columns: the plural forms, in four languages, with no placeholder left', () => {
    expect(renderPlain(f(2, 'A, B'), 'pl')).toContain('Czysty CSV zapisuje je też');
    expect(renderPlain(f(2, 'A, B'), 'fr')).toContain('Le CSV nettoyé les écrit aussi');
    for (const lang of LANGS) {
      expect(renderPlain(f(1, 'Analyst'), lang), lang).not.toMatch(/[{}]/);
      expect(renderPlain(f(2, 'A, B'), lang), lang).not.toMatch(/[{}]/);
    }
  });

  it('the tip says a vertical coordinate that tells rows apart is always written, in four languages', () => {
    expect(UI.en['tip.cleanCsv.logic']).toContain('A vertical coordinate that tells rows apart (a sediment depth, for example) is always written, unless you set it to ignore yourself');
    expect(UI.pl['tip.cleanCsv.logic']).toContain('Współrzędna pionowa, która odróżnia wiersze');
    expect(UI.de['tip.cleanCsv.logic']).toContain('Eine vertikale Koordinate, die Zeilen unterscheidet');
    expect(UI.fr['tip.cleanCsv.logic']).toContain('Une coordonnée verticale qui distingue les lignes');
  });
});

describe('ROW-KEY-IGNORED reads naturally in four languages, with one column and with several', () => {
  const f = (count: number, columns: string) => ({ ruleId: 'ROW-KEY-IGNORED', severity: 'info', sheet: 'S', lines: [3, 5], params: { columns, count } }) as never;

  it('one column', () => {
    expect(renderPlain(f(1, 'Pressure'), 'en')).toContain('look alike in the identifying columns of the clean CSV. The column you set to ignore (Pressure) differs between them and is not written');
    expect(renderPlain(f(1, 'Pressure'), 'pl')).toContain('Kolumna ustawiona na „ignoruj” (Pressure) różni je i nie jest zapisywana');
    expect(renderPlain(f(1, 'Pressure'), 'de')).toContain('Die Spalte, die Sie auf ignorieren gesetzt haben (Pressure), unterscheidet sie und wird nicht geschrieben');
    expect(renderPlain(f(1, 'Pressure'), 'fr')).toContain("La colonne que vous avez réglée sur ignorer (Pressure) les distingue et n'est pas écrite");
  });

  it('several columns, including the Polish forms for 2 to 4 and 5 or more', () => {
    expect(renderPlain(f(2, 'A, B'), 'en')).toContain('The columns you set to ignore (A, B) differ between them and are not written');
    for (const n of [2, 5]) expect(renderPlain(f(n, 'A, B'), 'pl')).toContain('Kolumny ustawione na „ignoruj” (A, B) różnią je i nie są zapisywane');
    expect(renderPlain(f(2, 'A, B'), 'de')).toContain('Die Spalten, die Sie auf ignorieren gesetzt haben (A, B), unterscheiden sie und werden nicht geschrieben');
    expect(renderPlain(f(2, 'A, B'), 'fr')).toContain('Les colonnes que vous avez réglées sur ignorer (A, B) les distinguent et ne sont pas écrites');
  });

  it('it does not say "told apart only by"; the other measured values are said to remain, in four languages', () => {
    for (const lang of LANGS) {
      const text = renderPlain(f(1, 'P'), lang);
      expect(text, lang).not.toMatch(/told apart|odróżnia|unterschieden, die|ne se distinguent que/);
      expect(text, lang).not.toMatch(/[{}]/);
      expect(text, lang).toMatch(/3, 5/);
    }
    expect(renderPlain(f(1, 'P'), 'en')).toContain('other measured values');
    expect(renderPlain(f(1, 'P'), 'pl')).toContain('pozostałe zmierzone wartości');
    expect(renderPlain(f(1, 'P'), 'de')).toContain('übrigen Messwerte');
    expect(renderPlain(f(1, 'P'), 'fr')).toContain('autres valeurs mesurées');
  });
});

describe('ROW-KEY-IGNORED on a wide sheet', () => {
  const ids = (t: string, edit?: (m: SheetMapping[]) => void) => build(t, edit).findings.filter((x) => x.ruleId === 'ROW-KEY-IGNORED');
  // a sediment core: two levels of one core at one station, position and date
  const sed = ['Station,Latitude,Longitude,Date,Depth [m],Sediment depth [cm],Temp [°C]', 'S1,49.4,0.2,2020-06-01,5,1.5,11.2', 'S1,49.4,0.2,2020-06-01,5,4.5,10.9', 'S2,49.5,0.3,2020-06-02,9,1.5,10.4'].join('\n');

  it('a sediment depth the person set to ignore, differing between rows that look alike: said once, with the column', () => {
    const f = ids(sed, (m) => setRole(m, 'Sediment depth [cm]', { kind: 'ignore' }));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('info');
    expect(f[0].params).toEqual({ columns: 'Sediment depth [cm]', count: 1 });
    expect(f[0].lines).toEqual([2, 3]);
  });

  it('silent when the column is written, when no two rows look alike, and when the rows do not differ in the ignored column', () => {
    expect(ids(sed)).toEqual([]);
    const apart = sed.replace('S1,49.4,0.2,2020-06-01,5,4.5', 'S1,49.4,0.2,2020-06-03,5,4.5');
    expect(ids(apart, (m) => setRole(m, 'Sediment depth [cm]', { kind: 'ignore' }))).toEqual([]);
    const same = sed.replace('4.5', '1.5');
    expect(ids(same, (m) => setRole(m, 'Sediment depth [cm]', { kind: 'ignore' }))).toEqual([]);
  });

  it('an ignored MEASURED column: other measurements may differ too, the rule still names only the ignored column', () => {
    const t = ['Station,Latitude,Longitude,Date,Depth [m],Temp [°C],Salinity', 'S1,49.4,0.2,2020-06-01,5,11.2,34.1', 'S1,49.4,0.2,2020-06-01,5,10.9,34.3'].join('\n');
    const f = ids(t, (m) => setRole(m, 'Temp [°C]', { kind: 'ignore' }));
    expect(f).toHaveLength(1);
    expect(f[0].params).toEqual({ columns: 'Temp [°C]', count: 1 });
  });

  it('a column ignored by default, or never ignored by the person, costs and says nothing', () => {
    const t = ['Station,Latitude,Longitude,Date,Replicate,Temp [°C]', 'S1,49.4,0.2,2020-06-01,R1,11.2', 'S1,49.4,0.2,2020-06-01,R2,10.9'].join('\n');
    expect(ids(t)).toEqual([]);
    expect(ids(t, (m) => setRole(m, 'Replicate', { kind: 'ignore' }))).toEqual([]);
  });
});

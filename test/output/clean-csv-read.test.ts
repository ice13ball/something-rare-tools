// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The list of source columns the clean CSV leaves out comes from what the build READ, not from the roles; key columns no fixed column carries are written; a key column the person ignored is not.
// Every file here is invented.
import { describe, expect, it } from 'vitest';
import { buildDataset, buildDatasets } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
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
const LEFT = 'source columns that are not in this file';

describe('a time column', () => {
  it('beside a date it is merged into the date: not written as a column, not named', () => {
    const t = ['Station,Latitude,Longitude,Date,Time,Temp [°C]', 'S1,49.4,0.2,2020-06-01,10:30,11.2', 'S2,49.5,0.3,2020-06-02,11:45,10.4'].join('\n');
    const { dataset } = build(t);
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01T10:30', '2020-06-02T11:45']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('with no date it is read into nothing: a wide sheet names it', () => {
    const t = ['Station,Latitude,Longitude,Time,Temp [°C]', 'S1,49.4,0.2,10:30,11.2', 'S2,49.5,0.3,11:45,10.4'].join('\n');
    const { dataset } = build(t);
    expect(left(toCleanCsv(dataset).sidecar)).toEqual([`${LEFT}: Time`]);
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

  it('a Sites date that the data sheet does not take (it has its own) is named, with the sheet', () => {
    const sites = [['Station', 'Date', 'Latitude', 'Longitude'], ['S1', '2019-01-01', 70.1, 15.2], ['S2', '2019-01-02', 60.2, 5.4], ['S3', '2019-01-03', 50.3, -5.6]];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { layout, ds } = run(sites, data);
    expect(layout.joins).toHaveLength(1);
    const out = toCleanCsv(ds);
    expect(parse(out.csv).rows.map((r) => [r[1], r[2]])).toEqual([['2020-06-01', '70.1'], ['2020-06-02', '60.2'], ['2020-06-03', '50.3']]);
    expect(left(out.sidecar)).toEqual([`${LEFT} (sheet Sites): Date`]);
  });

  it('a Sites depth that two rows of one station disagree on lends no depth, and the column is named', () => {
    const sites = [['Station', 'Depth [m]', 'Latitude', 'Longitude'], ['S1', 5, 70.1, 15.2], ['S1', 6, 70.1, 15.2], ['S2', 5, 60.2, 5.4], ['S3', 5, 50.3, -5.6]];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { ds } = run(sites, data);
    const out = toCleanCsv(ds);
    const depth = parse(out.csv).header.findIndex((h) => h.startsWith('depth'));
    expect(parse(out.csv).rows.map((r) => r[depth])).toEqual(['', '5', '5']);
    expect(left(out.sidecar)).toEqual([]);
  });

  it('a Sites column no row took a value from is named, one that gave a position is not', () => {
    const sites = [['Station', 'Latitude', 'Longitude', 'Region'], ['S1', 70.1, 15.2, 'north'], ['S2', 60.2, 5.4, 'south'], ['S3', 50.3, -5.6, 'south']];
    const data = [['Station', 'Date', 'Temperature [degC]'], ['S1', '2020-06-01', 4.5], ['S2', '2020-06-02', 5.5], ['S3', '2020-06-03', 6.5]];
    const { ds } = run(sites, data);
    expect(left(toCleanCsv(ds).sidecar)).toEqual([`${LEFT} (sheet Sites): Region`]);
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

  it('a month and a day with no year give no date: both are named', () => {
    const t = base('Month,Day', ['S1,49.4,0.2,6,1,11.2', 'S2,49.5,0.3,6,2,10.4']);
    const { dataset } = build(t, (m) => {
      setRole(m, 'Month', part('month'));
      setRole(m, 'Day', part('day'));
    });
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['', '']);
    expect(left(out.sidecar)).toEqual([`${LEFT}: Month | Day`]);
  });

  it('a full date beside a month: the date is the date and the month is named', () => {
    const t = base('Date,Month', ['S1,49.4,0.2,2020-06-01,6,11.2', 'S2,49.5,0.3,2020-06-02,6,10.4']);
    const { dataset } = build(t, (m) => setRole(m, 'Month', part('month')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020-06-02']);
    expect(left(out.sidecar)).toEqual([`${LEFT}: Month`]);
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

  it('a filled eventDate wins over a year column that disagrees with it: the year is named', () => {
    const t = ['Station,Latitude,Longitude,eventDate,year,Temp [°C]', 'S1,49.4,0.2,2020-06-01,1999,11.2', 'S2,49.5,0.3,2020-06-02,1999,10.4'].join('\n');
    const { dataset } = build(t, (m) => setRole(m, 'year', part('year')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020-06-01', '2020-06-02']);
    expect(left(out.sidecar)).toEqual([`${LEFT}: year`]);
  });

  it('an eventDate that is blank takes its year from the year column: the year is not named (the empty eventDate is)', () => {
    const t = ['Station,Latitude,Longitude,eventDate,year,Temp [°C]', 'S1,49.4,0.2,,2020,11.2', 'S2,49.5,0.3,,2021,10.4'].join('\n');
    const { dataset } = build(t, (m) => setRole(m, 'year', part('year')));
    const out = toCleanCsv(dataset);
    expect(parse(out.csv).rows.map((r) => r[1])).toEqual(['2020', '2021']);
    // the eventDate column holds nothing: no value of it is in the file
    expect(left(out.sidecar)).toEqual([`${LEFT}: eventDate`]);
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

  it('a sheet built with no pressure and no key is unchanged by the ignore check (it asks for nothing)', () => {
    const { dataset } = build(sheet('', () => '').replace(',,Parameter', ',Parameter'));
    expect(dataset.extraKeyColumns).toBeUndefined();
  });
});

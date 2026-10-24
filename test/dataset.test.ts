// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildDataset, buildDatasets } from '../src/core/dataset';
import { proposeColumns, toMapping } from '../src/core/recognize/columns';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import type { Finding, MetadataRecord, ParsedFile } from '../src/core/types';
import { renderPlain } from '../src/core/report';
import { LANGS } from '../src/core/types';
import { dateCell, fixtureFile, textFile, xlsxFile } from './helpers/files';

function build(file: ParsedFile, metadata: MetadataRecord[] = []) {
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  return buildDataset(file, layout, mappings, metadata, 'ds1');
}
const byRule = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

describe('buildDataset: wide', () => {
  const f = fixtureFile('layout-wide.csv');
  const { dataset, findings } = build(f);

  it('one row per line with position, date, depth and identifiers; id and label as given', () => {
    expect(dataset.id).toBe('ds1');
    expect(dataset.label).toBe('layout-wide.csv');
    expect(dataset.file).toBe('layout-wide.csv');
    expect(dataset.rows.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    expect(dataset.rows[0]).toMatchObject({ file: 'layout-wide.csv', station: 'ST1', lat: 76.5, lon: 15.1, latDecimals: 1, lonDecimals: 1, depth: 2.5, dateRaw: '2021-07-25' });
    expect(dataset.rows[0].datetime).toMatchObject({ iso: '2021-07-25T10:07Z', tz: 'utc', precision: 'minute' });
    expect(dataset.depthPositive).toBe('unknown');
  });

  it('variables carry canonical key, unit and where the unit came from', () => {
    expect(dataset.variables.map((v) => [v.key, v.canonical, v.unit, v.unitSource])).toEqual([
      ['DIC_umol_kg', 'DIC', 'µmol/kg', 'header'],
      ['DOC_mg_l', 'DOC', 'mg/L', 'header'],
      ['NH4_umol_L', 'ammonium', 'µmol/L', 'header'],
    ]);
  });

  it('numeric cells keep their own line, raw text and decimals; missing is not a finding', () => {
    expect(dataset.rows[0].values.DIC_umol_kg).toEqual({ raw: '2110.5', line: 2, value: 2110.5, decimals: 1, status: 'ok' });
    expect(dataset.rows[1].values.DOC_mg_l).toEqual({ raw: 'NA', line: 3, status: 'missing' });
    expect(dataset.rows[2].values.DIC_umol_kg).toMatchObject({ value: 2100, decimals: 0 });
  });

  it('a non-numeric token and an NA variant are reported once per column with the lines and tokens', () => {
    expect(byRule(findings, 'ROW-NON-NUMERIC')).toEqual([
      expect.objectContaining({ file: 'layout-wide.csv', field: 'NH4_umol_L', lines: [3], value: '/..4', severity: 'warning' }),
    ]);
    expect(dataset.rows[1].values.NH4_umol_L).toMatchObject({ status: 'non-numeric', line: 3 });
    expect(byRule(findings, 'ROW-NA-VARIANT')).toEqual([expect.objectContaining({ field: 'DOC_mg_l', lines: [5], value: 'NANA' })]);
    expect(dataset.rows[3].values.DOC_mg_l.status).toBe('na-variant');
  });

  it('a time column marked [UTC] makes the time UTC: no time zone finding', () => {
    expect(byRule(findings, 'ROW-TZ-UNKNOWN')).toEqual([]);
  });

  it('keeps mappings and layout on the dataset', () => {
    expect(dataset.layout.tables).toEqual([{ sheet: 'layout-wide.csv' }]);
    expect(dataset.mappings).toHaveLength(1);
    expect(dataset.mappings[0].columns[1].role.kind).toBe('latitude');
  });
});

describe('buildDataset: dates and positions', () => {
  it('time without a UTC marker raises ROW-TZ-UNKNOWN once per column; a date alone does not', () => {
    const f = textFile('t.csv', 'Station,Lat,Lon,Date,Time,DIC_umol_kg\nST1,70,10,2021-07-25,10:07,2100\nST2,71,11,2021-07-26,11:30,2110\n');
    const fs = build(f).findings;
    expect(byRule(fs, 'ROW-TZ-UNKNOWN')).toEqual([expect.objectContaining({ field: 'Time', severity: 'info' })]);
    const g = textFile('t.csv', 'Station,Lat,Lon,Date,DIC_umol_kg\nST1,70,10,2021-07-25,2100\n');
    expect(byRule(build(g).findings, 'ROW-TZ-UNKNOWN')).toEqual([]);
  });

  it('YY-MM-DD dates are read as 20YY and reported once, with an example', () => {
    const f = textFile('y.csv', 'Site_ID,Latitude,Longitude,Date,Na_mg_l\nS1,70,10,21-07-25,100\nS2,71,11,21-08-24,110\n');
    const { dataset, findings } = build(f);
    expect(dataset.rows[0].datetime).toMatchObject({ iso: '2021-07-25', ambiguity: 'yy-mm-dd' });
    expect(byRule(findings, 'ROW-DATE-YYMMDD')).toEqual([expect.objectContaining({ field: 'Date', value: '21-07-25', params: { interpreted: '2021-07-25' } })]);
  });

  it('the YY-MM-DD message states the century it chose, in every language', () => {
    const f = textFile('y.csv', 'Site_ID,Latitude,Longitude,Date,Na_mg_l\nS1,70,10,99-07-25,100\nS2,71,11,98-08-24,110\n');
    const [finding] = byRule(build(f).findings, 'ROW-DATE-YYMMDD');
    expect(finding.params).toEqual({ interpreted: '1999-07-25' });
    for (const lang of LANGS) {
      const text = renderPlain(finding, lang);
      expect(text, lang).toContain('99-07-25');
      expect(text, lang).toContain('1999-07-25');
      expect(text, lang).not.toContain('{');
    }
  });

  it('an unparseable date is reported with its lines and left undefined (dateRaw kept)', () => {
    const f = textFile('d.csv', 'Station,Lat,Lon,Date,DIC_umol_kg\nST1,70,10,2021-07-25,2100\nST2,71,11,03/04/2021,2110\nST3,72,12,soon,2120\n');
    const { dataset, findings } = build(f);
    expect(byRule(findings, 'ROW-DATE-UNPARSEABLE')).toEqual([expect.objectContaining({ field: 'Date', lines: [3, 4], value: '03/04/2021, soon' })]);
    expect(dataset.rows[1].datetime).toBeUndefined();
    expect(dataset.rows[1].dateRaw).toBe('03/04/2021');
  });

  describe('day/month order is decided once per date column', () => {
    const csv = (dates: string[]) => textFile('o.csv', 'Station,Lat,Lon,Date,DIC_umol_kg\n' + dates.map((d, i) => `ST${i},70,10,${d},2100`).join('\n') + '\n');
    const isos = (ds: ReturnType<typeof build>['dataset']) => ds.rows.map((r) => r.datetime?.iso);

    it('one unambiguous DD/MM cell makes the whole column day-first', () => {
      const { dataset, findings } = build(csv(['25/07/2021', '03/04/2021', '10/11/2021']));
      expect(isos(dataset)).toEqual(['2021-07-25', '2021-04-03', '2021-11-10']);
      expect(byRule(findings, 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    });
    it('one unambiguous MM/DD cell makes the whole column month-first', () => {
      const { dataset, findings } = build(csv(['07/25/2021', '03/04/2021']));
      expect(isos(dataset)).toEqual(['2021-07-25', '2021-03-04']);
      expect(byRule(findings, 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    });
    it('both kinds in one column: ambiguous and conflicting cells are unparseable and listed', () => {
      const { dataset, findings } = build(csv(['25/07/2021', '07/25/2021', '03/04/2021', '2021-08-01']));
      expect(isos(dataset)).toEqual([undefined, undefined, undefined, '2021-08-01']);
      expect(byRule(findings, 'ROW-DATE-UNPARSEABLE')).toEqual([
        expect.objectContaining({ field: 'Date', lines: [2, 3, 4], value: '25/07/2021, 07/25/2021, 03/04/2021' }),
      ]);
    });
    it('no unambiguous cell: ambiguous cells stay unparseable', () => {
      const { dataset, findings } = build(csv(['03/04/2021', '05/06/2021']));
      expect(isos(dataset)).toEqual([undefined, undefined]);
      expect(byRule(findings, 'ROW-DATE-UNPARSEABLE')).toEqual([expect.objectContaining({ lines: [2, 3] })]);
    });
  });

  it('missing dates and NA tokens in the date column are not findings', () => {
    const f = textFile('d.csv', 'Station,Lat,Lon,Date,DIC_umol_kg\nST1,70,10,2021-07-25,2100\nST2,71,11,,2110\nST3,72,12,NA,2120\n');
    const { dataset, findings } = build(f);
    expect(findings).toEqual([]);
    expect(dataset.rows[1].datetime).toBeUndefined();
  });

  it('degrees + decimal minutes text become decimal degrees, reported once per column', () => {
    const f = textFile('dm.csv', "Site,Longitude,Latitude,DIC_umol_kg\nST1,12° 34.567',54° 01.500',2100\nST2,12° 36.250',54° 02.250',2110\n");
    const { dataset, findings } = build(f);
    expect(dataset.rows[0].lon).toBeCloseTo(12.576117, 6);
    expect(dataset.rows[0].lat).toBeCloseTo(54.025, 6);
    expect(byRule(findings, 'ROW-DM-COORDS').map((x) => [x.field, x.value])).toEqual([['Latitude', "54° 01.500'"], ['Longitude', "12° 34.567'"]]);
    expect(byRule(findings, 'ROW-DM-COORDS')[0].severity).toBe('info');
  });

  it('a 0-360 longitude is shifted and reported with its lines', () => {
    const f = textFile('l.csv', 'Station,Lat,Lon,DIC_umol_kg\nST1,70,350.5,2100\nST2,71,11,2110\nST3,72,359,2120\n');
    const { dataset, findings } = build(f);
    expect(dataset.rows[0].lon).toBeCloseTo(-9.5, 6);
    expect(byRule(findings, 'ROW-LON-360')).toEqual([expect.objectContaining({ field: 'Lon', lines: [2, 4], severity: 'info' })]);
  });

  it('recognition does not fix data: an out-of-range latitude and lat == lon keep their numbers', () => {
    const f = textFile('r.csv', 'Station,Lat,Lon,DIC_umol_kg\nST1,91,10,2100\nST2,76.9,76.9,2110\n');
    const { dataset } = build(f);
    expect(dataset.rows[0].lat).toBe(91);
    expect(dataset.rows[1].lat).toBe(76.9);
    expect(dataset.rows[1].lon).toBe(76.9);
  });

  it('unreadable coordinate text is reported as non-numeric on that column, the row stays', () => {
    const f = textFile('r.csv', 'Station,Lat,Lon,DIC_umol_kg\nST1,north,10,2100\nST2,71,11,2110\n');
    const { dataset, findings } = build(f);
    expect(dataset.rows[0].lat).toBeUndefined();
    expect(dataset.rows[0].lon).toBe(10);
    expect(byRule(findings, 'ROW-NON-NUMERIC')).toEqual([expect.objectContaining({ field: 'Lat', lines: [2], value: 'north' })]);
  });

  it('decimal-comma files: values and coordinates parse with the comma', () => {
    const f = textFile('c.csv', 'Station;Lat;Lon;DIC_umol_kg\nST1;70,5;10,25;2100,5\nST2;71,5;11,25;2110,5\n');
    const { dataset } = build(f);
    expect(dataset.rows[0]).toMatchObject({ lat: 70.5, lon: 10.25 });
    expect(dataset.rows[0].values.DIC_umol_kg).toMatchObject({ value: 2100.5, decimals: 1 });
  });
});

describe('buildDataset: depth sign', () => {
  it('negative depth values or elevation mean positive up; depth with no negatives is positive down; no depth is unknown', () => {
    const up = textFile('u.csv', 'Station,Lat,Lon,Depth [cm],DIC_umol_kg\nST1,70,10,-2.5,2100\nST1,70,10,-8.5,2110\n');
    expect(build(up).dataset.depthPositive).toBe('up');
    expect(build(up).dataset.rows[0].depth).toBe(-2.5); // the sign is never flipped
    const down = textFile('d.csv', 'Station,Lat,Lon,Depth below surface [cm],DIC_umol_kg\nST1,70,10,2.5,2100\n');
    expect(build(down).dataset.depthPositive).toBe('down');
    const elev = textFile('e.csv', 'Station,Lat,Lon,Elevation [m a.s.l.],DIC_umol_kg\nST1,70,10,120,2100\n');
    expect(build(elev).dataset.depthPositive).toBe('up');
    const none = textFile('n.csv', 'Station,Lat,Lon,DIC_umol_kg\nST1,70,10,2100\n');
    expect(build(none).dataset.depthPositive).toBe('unknown');
  });
});

describe('buildDataset: names from user data never reach Object.prototype', () => {
  it('a wide column headed __proto__ becomes a normal variable with values', () => {
    const f = textFile('p.csv', 'Station,Latitude,Longitude,Date,__proto__\nST1,70,10,2021-07-25,5.5\nST2,71,11,2021-07-26,6.5\n');
    const { dataset } = build(f);
    expect(dataset.variables.map((v) => v.key)).toContain('__proto__');
    for (const [i, expected] of [5.5, 6.5].entries()) {
      const row = dataset.rows[i];
      expect(Object.hasOwn(row.values, '__proto__')).toBe(true);
      expect(row.values['__proto__']).toMatchObject({ status: 'ok', value: expected });
      expect(Object.getPrototypeOf(row.values)).toBeNull();
    }
  });

  it('a long-format parameter named constructor becomes a normal variable with values', () => {
    const f = textFile('l.csv', 'sample,depth,parameter,unit,value\ncore_A,-5,constructor,%,1.54\ncore_A,-5,toString,%,0.21\ncore_A,-15,constructor,%,1.41\n');
    const layout = proposeLayout(f);
    expect(layout.tables[0].long).toBeDefined();
    const { dataset } = buildDataset(f, layout, proposeMappings(f, layout), [], 'ds1');
    expect(dataset.variables.map((v) => v.key).sort()).toEqual(['constructor', 'toString']);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0].values['constructor']).toMatchObject({ status: 'ok', value: 1.54 });
    expect(dataset.rows[0].values['toString']).toMatchObject({ status: 'ok', value: 0.21 });
    // a parameter missing from a row is absent, not an inherited function
    expect(dataset.rows[1].values['toString']).toBeUndefined();
    expect(Object.getPrototypeOf(dataset.rows[1].values)).toBeNull();
  });
});

describe('buildDataset: long', () => {
  const f = fixtureFile('layout-long.csv');
  const { dataset, findings } = build(f);

  it('one row per sample key (sample, depth), the row line is its first measurement line', () => {
    expect(dataset.rows.map((r) => [r.sampleId, r.depth, r.line])).toEqual([
      ['core_A', -5, 2],
      ['core_A', -15, 4],
      ['core_B', -5, 6],
    ]);
    expect(dataset.depthPositive).toBe('up');
  });

  it('variables come from the parameter values, with units from the unit column', () => {
    expect(dataset.variables).toEqual([
      { key: 'Cx', header: 'Cx', unit: '%', unitSource: 'header' },
      { key: 'Nx', header: 'Nx', unit: '%', unitSource: 'header' },
    ]);
  });

  it('each numeric cell keeps its own source line', () => {
    expect(dataset.rows[0].values.Cx).toMatchObject({ line: 2, value: 1.54 });
    expect(dataset.rows[0].values.Nx).toMatchObject({ line: 3, value: 0.21 });
    expect(dataset.rows[1].values.Cx.line).toBe(4);
    expect(dataset.rows[1].values.Nx.line).toBe(5);
  });

  it('proposals made without the layout (the long columns not marked) build the same dataset', () => {
    const layout = proposeLayout(f);
    const plain = f.sheets.map((s) => toMapping(s, proposeColumns(s, { decimalComma: f.decimalComma, date1904: f.date1904 })));
    const r = buildDataset(f, layout, plain, [], 'ds1');
    expect(r.dataset.rows.map((x) => Object.keys(x.values))).toEqual(dataset.rows.map((x) => Object.keys(x.values)));
    expect(r.dataset.variables).toEqual(dataset.variables);
  });

  it('a duplicate (sample, parameter) keeps the first value, nothing is averaged, nothing new is reported', () => {
    expect(dataset.rows[2].values.Cx).toMatchObject({ value: 1.1, line: 6 });
    expect(findings.map((x) => x.ruleId)).toEqual(['ROW-NON-NUMERIC']);
  });

  it('a non-numeric value is reported against its parameter, with its line', () => {
    expect(dataset.rows[2].values.Nx.status).toBe('non-numeric');
    expect(findings[0]).toMatchObject({ field: 'Nx', lines: [7], value: 'abc' });
  });

  it('one parameter with two units becomes two variables', () => {
    const g = textFile('l.csv', 'core,parameter,unit,value\nc1,DIC,umol/kg,2100\nc1,DIC,umol/l,2150\nc2,DIC,umol/kg,2101\nc2,TA,umol/kg,2301\n');
    const { dataset: d } = build(g);
    expect(d.variables.map((v) => [v.key, v.unit])).toEqual([['DIC [µmol/kg]', 'µmol/kg'], ['DIC [µmol/L]', 'µmol/L'], ['TA', 'µmol/kg']]);
  });

  it('a long table without a unit column has variables without units', () => {
    const g = textFile('l.csv', 'core,parameter,value\nc1,DIC,2100\nc1,TA,2300\nc2,DIC,2101\nc2,TA,2301\n');
    const { dataset: d } = build(g);
    expect(d.variables.map((v) => [v.key, v.unit, v.canonical])).toEqual([['DIC', undefined, 'DIC'], ['TA', undefined, 'TA']]);
  });
});

describe('buildDataset: join', () => {
  const f = xlsxFile('j.xlsx', {
    cores: [['id', 'lat', 'lon', 'Date'], ['core_A', 76.9, 15.7, dateCell(44402)], ['core_B', 76.98, 15.9, dateCell(44403)], ['core_C', 77, 16, dateCell(44404)]],
    measurements: [['id', 'depth', 'Na_mg_l'], ['core_A', 1, 100], ['core_A', 2, 101], ['core_B', 1, 110], ['core_B', 2, 'x']],
  });
  const { dataset, findings } = build(f);

  it('position and date come from the coordinate sheet, the row line stays the measurement row', () => {
    const m = f.sheets.find((s) => s.name === 'measurements')!;
    expect(dataset.rows.map((r) => [r.line, r.sheet, r.sampleId, r.lat, r.lon, r.datetime?.iso, r.depth])).toEqual([
      [m.rows[0].line, 'measurements', 'core_A', 76.9, 15.7, '2021-07-25', 1],
      [m.rows[1].line, 'measurements', 'core_A', 76.9, 15.7, '2021-07-25', 2],
      [m.rows[2].line, 'measurements', 'core_B', 76.98, 15.9, '2021-07-26', 1],
      [m.rows[3].line, 'measurements', 'core_B', 76.98, 15.9, '2021-07-26', 2],
    ]);
    expect(dataset.rows[0].values.Na_mg_l.line).toBe(m.rows[0].line);
  });

  it('with no station column the core id names the site', () => {
    expect(dataset.rows.map((r) => r.station)).toEqual(['core_A', 'core_A', 'core_B', 'core_B']);
  });

  it('findings about measurement values name the measurement sheet', () => {
    expect(byRule(findings, 'ROW-NON-NUMERIC')).toEqual([expect.objectContaining({ sheet: 'measurements', field: 'Na_mg_l', value: 'x' })]);
  });

  it('a key missing from the coordinate sheet leaves the position undefined', () => {
    const g = xlsxFile('j.xlsx', {
      cores: [['id', 'lat', 'lon'], ['core_A', 76.9, 15.7], ['core_B', 76.98, 15.9]],
      measurements: [['id', 'Na_mg_l'], ['core_A', 100], ['core_B', 110]],
    });
    const layout = { tables: [{ sheet: 'measurements' }], joins: [{ left: 'measurements', right: 'cores', leftKey: 0, rightKey: 0 }] };
    const g2 = { ...g, sheets: g.sheets.map((s) => (s.name === 'measurements' ? { ...s, rows: [...s.rows, { line: 9, cells: ['core_Z', 5], fieldCount: 2 }] } : s)) };
    const r = buildDataset(g2, layout, proposeMappings(g2, layout), [], 'x');
    expect(r.dataset.rows[2]).toMatchObject({ line: 9, sampleId: 'core_Z', station: 'core_Z' });
    expect(r.dataset.rows[2].lat).toBeUndefined();
    expect(r.dataset.rows[2].lon).toBeUndefined();
  });
});

describe('buildDataset: several tables, units from metadata, unsupported layouts', () => {
  const f = xlsxFile('w.xlsx', {
    Water: [['Station', 'Latitude', 'Longitude', 'Depth (m)', 'DIC (µmol L-1)'], ['ST1', 70, 10, 5, 2100], ['ST2', 71, 11, 10, 2110]],
    Pore: [['Station', 'Latitude', 'Longitude', 'Depth (cm)', 'DIC (µmol L-1)'], ['ST1', 70, 10, 1, 2400], ['ST2', 71, 11, 2, 2500]],
  });

  it('buildDatasets makes one dataset per independent table, so depth units and variables never mix', () => {
    const layout = proposeLayout(f);
    const r = buildDatasets(f, layout, proposeMappings(f, layout), [], 'ds');
    expect(r.datasets.map((d) => [d.id, d.label, d.rows.length])).toEqual([
      ['ds:Water', 'w.xlsx (Water)', 2],
      ['ds:Pore', 'w.xlsx (Pore)', 2],
    ]);
    expect(r.datasets[1].mappings[0].columns[3].role).toEqual({ kind: 'depth', positive: 'unknown', unit: 'cm' });
  });

  it('buildDataset over several tables namespaces the variable keys by sheet', () => {
    const layout = proposeLayout(f);
    const { dataset } = buildDataset(f, layout, proposeMappings(f, layout), [], 'ds');
    expect(dataset.rows).toHaveLength(4);
    expect(dataset.variables.map((v) => v.key)).toEqual(['Water!DIC (µmol L-1)', 'Pore!DIC (µmol L-1)']);
    expect(dataset.label).toBe('w.xlsx (Water, Pore)');
  });

  it('a missing unit is filled from the metadata parameter list, marked as metadata', () => {
    const g = textFile('m.csv', 'Station,Lat,Lon,Temp,Sal\nST1,70,10,4.5,34.9\n');
    const md: MetadataRecord = { source: 'pangaea', label: 'p', licences: [], restrictionCodes: [], distributionLinks: [], parameters: [{ name: 'Temp', unit: '°C' }] };
    const { dataset } = build(g, [md]);
    expect(dataset.variables.find((v) => v.key === 'Temp')).toMatchObject({ unit: '°C', unitSource: 'metadata' });
    expect(dataset.variables.find((v) => v.key === 'Sal')?.unit).toBeUndefined();
    expect(dataset.metadata).toEqual([md]);
  });

  it('an unsupported layout raises IN-LAYOUT-UNSUPPORTED with the reason and builds no rows', () => {
    const t = textFile('t.csv', 'parameter,ST1,ST2,ST3\nLatitude,70.1,71.2,72.3\nLongitude,10.1,11.2,12.3\nDepth,5,5,5\nDIC,2100,2110,2120\n');
    const layout = proposeLayout(t);
    const r = buildDataset(t, layout, [], [], 'x');
    expect(r.dataset.rows).toEqual([]);
    expect(r.findings).toEqual([expect.objectContaining({ ruleId: 'IN-LAYOUT-UNSUPPORTED', severity: 'error', file: 't.csv', params: { reason: expect.stringContaining('transposed'), reasons: expect.stringContaining('transposed') } })]);
  });

  it('a missing mapping falls back to the proposals', () => {
    const g = fixtureFile('layout-wide.csv');
    const { dataset } = buildDataset(g, proposeLayout(g), [], [], 'x');
    expect(dataset.rows[0].lat).toBe(76.5);
  });
});

describe('buildDataset: performance', () => {
  it('a 70,000-row PANGAEA-shaped table builds in under 3 seconds', () => {
    const header = ['Location (Name of the place of ...)', 'Sample ID (ID given by the provider ...)', 'Date/Time', 'Latitude', 'Longitude', 'Elevation [m a.s.l.]', 'Depth water [m]', 'Temp [°C]', 'Sal', 'DOC [µmol/l]', 'Analyt method (Method used for the DOC ...)', 'QF DOC', 'DIC [µmol/kg]', 'POC [µmol/l]', 'Comment (Free text ...)'];
    const lines = ['/* DATA DESCRIPTION:', 'Citation:\tInvented (2099): synthetic. PANGAEA', '*/', header.join('\t')];
    for (let i = 0; i < 70_000; i++) {
      lines.push(['Estuary A', `S${i % 500}`, `2017-04-${String(1 + (i % 28)).padStart(2, '0')}`, (26 + (i % 50) / 100).toFixed(6), (119 + (i % 70) / 100).toFixed(6), '', (i % 40).toFixed(1), '19.40', '0.1', '118.00', 'Method X', '2', '2100.5', '9.0', ''].join('\t'));
    }
    const f = textFile('p.tab', lines.join('\n'));
    expect(f.kind).toBe('pangaea');
    const t0 = performance.now();
    const layout = proposeLayout(f);
    const { dataset } = buildDataset(f, layout, proposeMappings(f, layout), [], 'p');
    const ms = performance.now() - t0;
    expect(dataset.rows).toHaveLength(70_000);
    expect(dataset.variables.map((v) => v.canonical)).toEqual(['temperature', 'salinity', 'DOC', 'DIC', 'POC']);
    expect(ms).toBeLessThan(3000);
  });
});

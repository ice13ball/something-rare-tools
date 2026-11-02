// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The review of the role, header and date rules: every input that was wrong is a test here. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { buildDataset } from '../../src/core/dataset';
import { parseFile } from '../../src/core/parse';
import { runChecks } from '../../src/core/checks/run';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeLayout } from '../../src/core/recognize/layout';
import { renderPlain } from '../../src/core/report';
import { parseDate } from '../../src/core/values/dates';
import { makeDataset } from '../helpers/build';
import { rawSheet, xlsxFile } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const CTX = { decimalComma: false, date1904: false };
const rolesOf = (header: string[], rows: Cell[][], dateFormatted?: boolean[]) => Object.fromEntries(proposeConvertColumns(rawSheet(header, rows.map((r) => [...r]), 'S', dateFormatted), CTX).map((p) => [p.header, p]));
const N = (n: number, make: (i: number) => Cell[]): Cell[][] => Array.from({ length: n }, (_, i) => make(i));
const NAMES = ['Gadus morhua', 'Acartia sp.', 'Oithona similis', 'Calanus cf. glacialis'];
const WIDE_HEAD = ['Sample', 'Date', 'Latitude', 'Longitude', 'Depth', 'LEAD', 'Calanus finmarchicus', 'Oithona similis', 'Acartia tonsa'];
const wideRows = (lead: (i: number) => Cell): Cell[][] => N(6, (i) => [`s${i}`, '2023-06-14', 55 + i / 10, 2.5, 10, lead(i), 3 + i, 2, 1 + (i % 3)]);
const wide = (lead: string, mk: (i: number) => Cell) => rolesOf(WIDE_HEAD.map((h) => (h === 'LEAD' ? lead : h)), wideRows(mk));

describe('HIGH 1: one Latin text column does not turn a wide sheet into a long one', () => {
  it.each(['Dominant species', 'Notes', 'Host', 'Prey'])('%s beside species columns', (lead) => {
    const r = wide(lead, (i) => NAMES[i % 4]);
    expect(r[lead].role.kind).toBe('ignore');
    for (const h of ['Calanus finmarchicus', 'Oithona similis', 'Acartia tonsa']) expect(r[h].role, h).toEqual({ kind: 'taxon', header: true });
  });

  it('the wide sheet gives its 18 occurrences', () => {
    const header = WIDE_HEAD.map((h) => (h === 'LEAD' ? 'Dominant species' : h));
    const file = fileOf(header, wideRows((i) => NAMES[i % 4]));
    const r = convert({ sheets: [sheetInput(file, { shape: 'wide', quantity: { kind: 'count' } })], options: {}, confirmedTaxa: undefined } as never);
    expect(r.occurrences.length).toBe(18);
  });

  it.each(['Mare nostrum', 'Green algae', 'Fish larvae', 'Visual census', 'Image analysis', 'Hard substratum', 'Benthic fauna', 'Anna maria'])('the words "%s" are not a taxon column', (phrase) => {
    const other = ['Rocky shore', 'Sandy bottom', 'Open water'];
    const r = wide('Remark', (i) => (i % 2 === 0 ? phrase : `${phrase} ${other[i % 3]}`));
    expect(r.Remark.role.kind).toBe('ignore');
    const long = rolesOf(['Station', 'Method', 'Count'], N(6, (i) => ['S1', [phrase, 'Mare nostrum', 'Green algae', 'Fish larvae', 'Visual census', 'Hard substratum'][i], i + 1]));
    // beside a count a column of such words can pass for names; it is only ever offered at low confidence
    if (long.Method.role.kind === 'taxon') expect(long.Method.confidence).toBe('low');
  });

  it('a Darwin Core term is never claimed from its cells', () => {
    const r = rolesOf(['eventID', 'samplingProtocol', 'individualCount'], N(6, (i) => [`e${i}`, ['Mare nostrum', 'Green algae', 'Fish larvae', 'Visual census', 'Image analysis', 'Hard substratum'][i], i + 1]));
    expect(r.samplingProtocol.role.kind).not.toBe('taxon');
  });
});

describe('HIGH 2: a male column (m) stays a species column', () => {
  it.each(['Calanus finmarchicus (m)', 'Calanus finmarchicus (M)', 'Calanus C5 (m)', 'Calanus_m', 'Calanus finmarchicus [m]'])('%s', (h) => {
    const r = rolesOf(['Station', h, 'Oithona similis'], N(4, (i) => ['S1', i + 1, 2]));
    expect(r[h].role, h).toEqual({ kind: 'taxon', header: true });
  });
  it('a length in square brackets on a name that is no taxon is still a measurement', () => {
    const r = rolesOf(['Station', 'Calanus', 'Fork length [mm]'], N(4, (i) => ['S1', i + 1, 100 + i]));
    expect(r['Fork length [mm]'].role).toMatchObject({ kind: 'variable', unit: 'mm' });
  });
});

describe('HIGH 3: a species column is not dropped by its values', () => {
  const sparse = (v: Cell) => N(15, (i) => ['S1', i < 3 ? v : null, i]);
  it('one fractional value on a few rows and blank elsewhere', () => {
    expect(rolesOf(['Station', 'Oithona similis [ind/m3]', 'x'], sparse(1.25))['Oithona similis [ind/m3]'].role).toEqual({ kind: 'taxon', header: true });
  });
  it('0.5 on every row of a column with an abundance unit, or a genus name', () => {
    const rows = N(12, (i) => ['S1', 0.5, i]);
    expect(rolesOf(['Station', 'Oithona similis [ind/m3]', 'x'], rows)['Oithona similis [ind/m3]'].role).toEqual({ kind: 'taxon', header: true });
    expect(rolesOf(['Station', 'Oithona', 'x'], rows).Oithona.role).toEqual({ kind: 'taxon', header: true });
  });
  it('counts of 1900, 1950, 2000 in a species column', () => {
    expect(rolesOf(['Station', 'Calanus [ind/m3]', 'x'], [['S1', 1900, 1], ['S1', 1950, 2], ['S1', 2000, 3]])['Calanus [ind/m3]'].role).toEqual({ kind: 'taxon', header: true });
    expect(rolesOf(['Station', 'Calanus', 'x'], [['S1', 1900, 1], ['S1', 1950, 2], ['S1', 2000, 3]]).Calanus.role).toEqual({ kind: 'taxon', header: true });
  });
  it('years with blanks are not a column of years; a full column of years named Year still is', () => {
    expect(rolesOf(['Station', 'Year', 'x'], N(5, (i) => ['S1', i < 4 ? 2000 + i : null, i])).Year.role.kind).not.toBe('ignore');
    expect(rolesOf(['Station', 'Year', 'x'], N(5, (i) => ['S1', 2000 + i, i])).Year.reasonCode).toBe('year-values');
  });
});

describe('HIGH 4: the comment of a PANGAEA header still reaches the depth, seafloor and statistic tests', () => {
  it('Depth [m] (top) and (bottom) are the two ends of a depth range', () => {
    const r = rolesOf(['Sample', 'Depth [m] (top)', 'Depth [m] (bottom)', 'Calanus'], N(4, (i) => [`s${i}`, 10 * i, 10 * i + 10, 2]));
    expect(r['Depth [m] (top)'].role).toMatchObject({ kind: 'depth', bound: 'min' });
    expect(r['Depth [m] (bottom)'].role).toMatchObject({ kind: 'depth', bound: 'max' });
    const file = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Depth [m] (top)', 'Depth [m] (bottom)', 'Calanus finmarchicus'], N(2, (i) => [`s${i}`, 55, 2, '2023-06-14', 10 * i, 10 * i + 10, 3]));
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const e = c.events.find((x) => x.eventType === 'sample' && x.code === 's1')!;
    expect([e.depthMin, e.depthMax]).toEqual([10, 20]);
  });
  it('Depth [m] (below seafloor) is a depth below the seafloor, not the water depth', () => {
    const r = rolesOf(['Sample', 'Depth [m] (below seafloor)', 'Calanus'], N(4, (i) => [`s${i}`, i, 2]));
    expect(r['Depth [m] (below seafloor)'].role.kind).toBe('depthBelowSeafloor');
  });
  it('a statistic in the comment is not the variable: (std dev) drops temperature', () => {
    for (const convertRoles of [false, true]) {
      const ps = (convertRoles ? proposeConvertColumns : proposeColumns)(rawSheet(['Sample', 'Temp [deg C] (std dev)', 'Temp [deg C]'], N(4, (i) => [`s${i}`, 0.2, 4 + i])), CTX);
      const sd = ps.find((p) => p.header === 'Temp [deg C] (std dev)')!;
      expect(sd.role.kind === 'variable' && sd.role.variable, String(convertRoles)).not.toBe('temperature');
      expect(ps.find((p) => p.header === 'Temp [deg C]')!.role).toMatchObject({ kind: 'variable', variable: 'temperature' });
    }
  });
  it('(CTD) and (bottle) give two different measurement types', () => {
    const file = fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temp [deg C] (CTD)', 'Temp [deg C] (bottle)'], [['s1', 55, 2, '2023-06-14', 3, 4.1, 4.3]]);
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const types = c.measurements.filter((m) => m.role === 'variable').map((m) => m.measurementType);
    expect(new Set(types).size).toBe(2);
    expect(types.join('|')).toContain('CTD');
    expect(types.join('|')).toContain('bottle');
  });
});

describe('LENGTH: a length that differs within a sample belongs to the occurrence, as a biomass does', () => {
  const head = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];
  const rows = (len: (i: number) => Cell): Cell[][] => N(6, (i) => ['S1', i < 3 ? 's1' : 's2', '2023-06-14', 55, 2, NAMES[i % 3], i + 1, len(i)]);
  it.each([['Mean Length (µm)', 'µm'], ['Total length [mm]', 'mm'], ['Total length', undefined]])('%s varies: written on the occurrences, no sample conflict', (h, unit) => {
    const file = fileOf([...head, h], rows((i) => 100 + 7 * i));
    const props = proposeConvertColumns(file.sheets[0], CTX);
    const p = props.find((x) => x.header === h)!;
    expect(p.role).toMatchObject({ kind: 'variable', perOccurrence: true });
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT')).toBe(false);
    const on = c.measurements.filter((m) => m.role === 'variable');
    expect(on).toHaveLength(6);
    expect(on.every((m) => m.target.kind === 'occurrence')).toBe(true);
    expect(on[0].measurementUnit ?? 'none', JSON.stringify(p.role)).toBe(unit ?? 'none');
  });
  it('size-class columns with a unit (L1 (µm), L2 (µm)) do not split the samples: all of them are measurements of each occurrence, and the sheet converts', () => {
    const head2 = ['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'L1 (µm)', 'L2 (µm)', 'Mean Length (µm)'];
    const rows2 = N(8, (i) => ['S1', i < 4 ? 's1' : 's2', '2023-06-14', 55, 2, ['Calanus finmarchicus', 'Oithona similis', 'Acartia sp.', 'Pseudocalanus sp.'][i % 4], i + 1, 100 + 11 * i, 200 + 13 * i, 150 + 5 * i]);
    const file = fileOf(head2, rows2);
    const props = proposeConvertColumns(file.sheets[0], CTX);
    for (const h of ['L1 (µm)', 'L2 (µm)', 'Mean Length (µm)']) expect(props.find((x) => x.header === h)!.role, h).toMatchObject({ kind: 'variable', perOccurrence: true });
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    expect(c.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT')).toBe(false);
    expect(c.measurements.filter((m) => m.role === 'variable' && m.target.kind === 'occurrence')).toHaveLength(24);
  });
  it('the same value on all the rows of a sample is a variable of the sample event', () => {
    const file = fileOf([...head, 'Total length [mm]'], rows((i) => (i < 3 ? 120 : 130)));
    const p = proposeConvertColumns(file.sheets[0], CTX).find((x) => x.header === 'Total length [mm]')!;
    expect(p.role.kind === 'variable' && p.role.perOccurrence).toBeFalsy();
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const on = c.measurements.filter((m) => m.role === 'variable');
    expect(on).toHaveLength(2);
    expect(on.every((m) => m.target.kind === 'event')).toBe(true);
  });
  it('a conflict, when it still happens, names the column', () => {
    const file = fileOf([...head, 'Temp [deg C]'], rows((i) => 4 + i));
    const c = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' } })], options: {} });
    const f = c.findings.find((x) => x.ruleId === 'CONV-SAMPLE-CONFLICT');
    expect(String(f?.params.what)).toContain('Temp [deg C]');
  });
});

describe('MEDIUM 5: a numeric year is a year of observation', () => {
  const col = { date1904: false, dateFormatted: false, datumColumn: true, currentYear: 2026 };
  it.each([1215, 1101, 1604, 3004, '1215'])('%s is reported', (v) => {
    expect('error' in parseDate(v, col)).toBe(true);
  });
  it.each([1700, 1986, 2026, 2027, '2000'])('%s is read', (v) => {
    expect('error' in parseDate(v, col)).toBe(false);
  });
});

describe('MEDIUM 6: a lookup sheet is a lookup beside data of the SAME file', () => {
  const cell = (n: number, line: number) => ({ raw: String(n), line, value: n, status: 'ok' as const });
  const sheetDs = (file: string, sheet: string, rows: Parameters<typeof makeDataset>[0], vars: Parameters<typeof makeDataset>[1] = []) => {
    const ds = makeDataset(rows, vars, { file, label: `${file} (${sheet})`, id: `${file}:${sheet}` });
    for (const r of ds.rows) r.sheet = sheet;
    return ds;
  };
  const data = sheetDs('a.xlsx', 'Counts', Array.from({ length: 4 }, (_, i) => ({ lat: 50, lon: 5, datetime: '2020-01-01', values: { C: cell(i + 1, i + 2) } })));
  it('a separate one-row file beside another file raises its findings', () => {
    const other = sheetDs('b.csv', 'b', [{ values: { Area: cell(0.1, 2) } }] as never);
    const ids = runChecks({ datasets: [data, other], records: [], parseFindings: [] }, { today: '2099-01-01' }).findings.filter((f) => f.file === 'b.csv').map((f) => f.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['META-NO-DATES', 'META-NO-POSITIONS']));
  });
  it('a one-row Temperature, Salinity sheet is data', () => {
    const t = sheetDs('a.xlsx', 'CTD', [{ values: { T: cell(4, 2), S: cell(35, 2) } }] as never, [{ key: 'T', canonical: 'temperature' }, { key: 'S', canonical: 'salinity' }]);
    const ids = runChecks({ datasets: [data, t], records: [], parseFindings: [] }, { today: '2099-01-01' }).findings.filter((f) => f.sheet === 'CTD').map((f) => f.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['META-NO-DATES', 'META-NO-POSITIONS']));
  });
  it('the one-row Gear sheet of the same file still raises nothing', () => {
    const gear = sheetDs('a.xlsx', 'Gear', [{ values: { Area: cell(0.1, 2) } }] as never);
    expect(runChecks({ datasets: [data, gear], records: [], parseFindings: [] }, { today: '2099-01-01' }).findings.some((f) => f.sheet === 'Gear')).toBe(false);
  });
});

describe('MEDIUM 7: one finding per rule lists the sheets', () => {
  it('five sheets without a position are one finding that names them', () => {
    const cell = (n: number, line: number) => ({ raw: String(n), line, value: n, status: 'ok' as const });
    const dss = ['S1', 'S2', 'S3', 'S4', 'S5'].map((s) => {
      const ds = makeDataset(Array.from({ length: 3 }, (_, i) => ({ datetime: '2020-01-01', values: { C: cell(i + 1, i + 2) } })), [], { file: 'book.xlsx', label: `book.xlsx (${s})`, id: s });
      for (const r of ds.rows) r.sheet = s;
      return ds;
    });
    const report = runChecks({ datasets: dss, records: [], parseFindings: [] }, { today: '2099-01-01' });
    const f = report.findings.filter((x) => x.ruleId === 'META-NO-POSITIONS');
    expect(f).toHaveLength(1);
    expect(f[0].sheet).toBe('S1, S2, S3, S4, S5');
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderPlain(f[0], lang), lang).toContain('S3');
  });
});

describe('MEDIUM 8: a time with a zone is the instant of the event', () => {
  const text = (rows: string[]) => `Station,Date,Time,Temp\n${rows.join('\n')}\n`;
  it('a UTC Time on another day than the local Date wins; no unreadable date', () => {
    const file = parseFile('t.csv', new TextEncoder().encode(text(['S1,2011-10-05,2011-10-06T00:30:00Z,4.1', 'S1,2011-10-05,2011-10-05T20:00:00Z,4.2'])));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(dataset.rows.map((r) => r.datetime?.iso)).toEqual(['2011-10-06T00:30:00Z', '2011-10-05T20:00:00Z']);
    expect(findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE' || f.ruleId === 'ROW-TIME-OTHER-DAY')).toEqual([]);
  });
  it('a local datetime column and a UTC time column: the UTC instant wins and rows across midnight are not flagged', () => {
    const t = 'Station,time_local,time,Temp\nS1,2011-10-05 20:00,2011-10-06T00:00:00Z,4.1\nS1,2011-10-05 21:00,2011-10-06T01:00:00Z,4.2\nS1,2011-10-05 22:00,2011-10-06T02:00:00Z,4.3\n';
    const file = parseFile('t.csv', new TextEncoder().encode(t));
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(findings.some((f) => f.ruleId === 'ROW-TIME-OTHER-DAY' || f.ruleId === 'ROW-DATE-UNPARSEABLE')).toBe(false);
    expect(dataset.rows[0].datetime?.iso).toBe('2011-10-06T00:00:00Z');
  });
  it('without a zone another day is named as that, in four languages', () => {
    const file = parseFile('t.csv', new TextEncoder().encode(text(['S1,2011-10-05,2011-10-09T20:00,4.1'])));
    const { findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    const f = findings.find((x) => x.ruleId === 'ROW-TIME-OTHER-DAY')!;
    expect(f).toBeDefined();
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderPlain(f, lang)).not.toMatch(/[{}]/);
  });
});

describe('MEDIUM 9: NA among the major ions is sodium', () => {
  const ions = (h: string[]) => rolesOf(['Station', ...h], N(4, (i) => ['S1', ...h.map((_, k) => i + k)]));
  it.each([[['CA', 'MG', 'NA', 'K', 'CL'], 'NA'], [['ca', 'mg', 'na', 'k', 'cl'], 'na']])('%s', (h, na) => {
    expect(ions(h)[na as string].role).toMatchObject({ kind: 'variable', variable: 'sodium' });
  });
  it('alone it is still "not available"', () => {
    expect(rolesOf(['Station', 'NA', 'x'], N(4, (i) => ['S1', i, i])).NA.role).not.toMatchObject({ variable: 'sodium' });
    expect(rolesOf(['Station', 'NA', 'K'], N(4, (i) => ['S1', i, i])).NA.role).not.toMatchObject({ variable: 'sodium' });
  });
});

describe('MEDIUM 10: the count of a long sheet is not a descriptor', () => {
  it('Hauls [#] and Replicates [n] are not the quantity; Ind [#] is', () => {
    const r = rolesOf(['Station', 'Hauls [#]', 'Replicates [n]', 'Scientific name', 'Ind [#]'], N(5, (i) => ['S1', 2, 3, [...NAMES, 'Calanus finmarchicus'][i], i + 1]));
    expect(r['Ind [#]'].role).toEqual({ kind: 'quantity' });
    expect(r['Hauls [#]'].role.kind).not.toBe('quantity');
    expect(r['Replicates [n]'].role.kind).not.toBe('quantity');
  });
});

describe('MEDIUM 11: an Excel Time formatted as a date and time', () => {
  it('/check reads it as the date and time when no date column exists', () => {
    const r = Object.fromEntries(proposeColumns(rawSheet(['Station', 'Time', 'x'], N(3, (i) => ['S1', 37638.35 + i, i]), 'S', [false, true, false]), CTX).map((p) => [p.header, p]));
    expect(r.Time.role).toEqual({ kind: 'datetime' });
  });
  it('beside a Date column its time of day is read; another day is reported', () => {
    const file = xlsxFile('x.xlsx', {
      S: [['Station', 'Date', 'Time', 'Temp'], ['S1', '2003-01-17', { t: 'n', v: 37638.35, z: 'yyyy-mm-dd hh:mm' }, 4.1], ['S1', '2003-01-17', { t: 'n', v: 37640.35, z: 'yyyy-mm-dd hh:mm' }, 4.2]],
    });
    const { dataset, findings } = buildDataset(file, proposeLayout(file), [], [], 'x');
    expect(dataset.rows[0].datetime?.iso.startsWith('2003-01-17T08:24')).toBe(true);
    expect(findings.filter((f) => f.ruleId === 'ROW-DATE-UNPARSEABLE')).toEqual([]);
    expect(findings.filter((f) => f.ruleId === 'ROW-TIME-OTHER-DAY')).toHaveLength(1);
  });
});

describe('LOW', () => {
  it('z, T, S, O, N, P over a row of units is a units row, not footnote marks', () => {
    const t = 'z,T,S,O,N,P,Q\nm,degC,PSU,umol/l,umol/l,umol/l,umol/l\n1,4,35,200,5,1,2\n2,5,35,210,6,1,2\n3,6,35,220,7,1,2\n';
    const file = parseFile('u.csv', new TextEncoder().encode(t));
    expect(proposeLayout(file).unsupportedReasons?.map((r) => r.code)).toEqual(['header-units']);
  });

  it('a Time column of dates alone is the date of the row', () => {
    const r = Object.fromEntries(proposeColumns(rawSheet(['Station', 'Time', 'x'], N(4, (i) => ['S1', `2011-10-0${i + 1}`, i])), CTX).map((p) => [p.header, p]));
    expect(r.Time.role).toEqual({ kind: 'date' });
  });
});

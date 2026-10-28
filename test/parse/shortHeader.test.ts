// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A header with fewer names than the data rows have fields (IN-HEADER-SHORT). Every file here is invented; the column names follow the style of a museum
// cruise export, the values are made up.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { policyOf } from '../../src/core/convert/policy';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { readConvertFile } from '../../src/core/convert/read';
import { buildDatasets } from '../../src/core/dataset';
import { parseCsvText } from '../../src/core/parse/csv';
import { SHORT_HEADER_MIN_ROWS, SHORT_HEADER_SHARE } from '../../src/core/parse/shared';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { formatLines, renderPlain, renderTechnical } from '../../src/core/report';
import type { ColumnRole, Finding, ParsedFile } from '../../src/core/types';
import { LANGS } from '../../src/core/types';
import { createDirectEngine } from '../../src/worker/handler';

const NAMES = ['Station', 'Date', 'Beg Lat Dir', 'Beg Lon Dir', 'Depth', 'Temp', 'Remarks', 'Photo'];
const H = NAMES.length;
const row = (i: number, extra: string[]): string => [`ZS${(i % 9) + 1}`, `2021-07-${String((i % 28) + 1).padStart(2, '0')}`, i % 2 ? 'S' : 'N', i % 3 ? 'W' : 'E', String((i % 40) + 1), (4 + (i % 100) / 10).toFixed(1), 'r', ...extra].join(',');
/** `n` data rows with `extra` trailing invented fields; rows at the indexes of `odd` get `oddExtra` fields instead. */
function table(n: number, extra: number, odd: number[] = [], oddExtra = extra + 1): string {
  const lines = [NAMES.join(',')];
  for (let i = 0; i < n; i++) lines.push(row(i, Array.from({ length: odd.includes(i) ? oddExtra : extra }, (_, k) => (k === 0 ? `-${(i % 80) + 1}.25` : `${i % 2 ? 'Yes' : 'No'}`))));
  return lines.join('\n') + '\n';
}
const ids = (f: ParsedFile): string[] => f.findings.map((x) => x.ruleId);
// A row has 7 fixed fields; with H = 8 names it needs 3 extras to have 10 fields, which is a header short by 2.
const FIELDS = 7;
const EXTRA_FOR_SHORT_BY_2 = H + 2 - FIELDS;

describe('IN-HEADER-SHORT: detection', () => {
  it('1,000 rows with 2 extra fields: one finding, no ROW-RAGGED, two unnamed columns, values reachable', () => {
    const f = parseCsvText(table(1000, EXTRA_FOR_SHORT_BY_2), 'm.csv');
    expect(ids(f)).toEqual(['IN-HEADER-SHORT']);
    const s = f.sheets[0];
    expect(s.header).toHaveLength(H + 2);
    expect(s.header.slice(-2)).toEqual([`Column ${H + 1}`, `Column ${H + 2}`]);
    expect(s.unnamedFrom).toBe(H);
    expect(s.rows[0].cells).toHaveLength(H + 2);
    const x = f.findings[0];
    expect(x.severity).toBe('warning');
    expect(x.sheet).toBe('m.csv');
    expect(x.params).toMatchObject({ header: H, count: 1000, rows: 1000, width: H + 2, extra: 2 });
  });

  it('3 rows with 3 extra more are still ragged, with exactly their own lines (relative to the new width)', () => {
    const odd = [10, 500, 999];
    const f = parseCsvText(table(1000, EXTRA_FOR_SHORT_BY_2, odd, EXTRA_FOR_SHORT_BY_2 + 3), 'm.csv');
    expect(ids(f)).toEqual(['IN-HEADER-SHORT', 'ROW-RAGGED']);
    const rag = f.findings[1];
    expect(rag.lines).toEqual(odd.map((i) => i + 2));
    expect(rag.params).toMatchObject({ expected: H + 2, found: H + 5 });
    expect(f.findings[0].params).toMatchObject({ count: 997, rows: 1000 });
  });

  it('the threshold is 95 %: 94 % at the modal count is no detection, 96 % is', () => {
    expect(SHORT_HEADER_SHARE).toBe(0.95);
    const oddOf = (k: number) => Array.from({ length: k }, (_, i) => i);
    const at94 = parseCsvText(table(100, EXTRA_FOR_SHORT_BY_2, oddOf(6)), 'a.csv');
    expect(ids(at94)).toEqual(['ROW-RAGGED']);
    expect(at94.sheets[0].header).toHaveLength(H);
    expect(at94.sheets[0].unnamedFrom).toBeUndefined();
    const at96 = parseCsvText(table(100, EXTRA_FOR_SHORT_BY_2, oddOf(4)), 'b.csv');
    expect(ids(at96)).toEqual(['IN-HEADER-SHORT', 'ROW-RAGGED']);
    const at95 = parseCsvText(table(100, EXTRA_FOR_SHORT_BY_2, oddOf(5)), 'c.csv');
    expect(ids(at95)).toEqual(['IN-HEADER-SHORT', 'ROW-RAGGED']);
  });

  it('a mode no longer than the header changes nothing (rows with fewer or as many fields as the header)', () => {
    const same = parseCsvText(table(50, H - FIELDS), 'same.csv');
    expect(ids(same)).toEqual([]);
    const shorter = parseCsvText(table(50, H - FIELDS - 1), 'shorter.csv');
    expect(ids(shorter)).toEqual(['ROW-RAGGED']);
    expect(shorter.sheets[0].header).toHaveLength(H);
    expect(shorter.findings[0].lines).toHaveLength(50);
  });

  it('fewer than 3 data rows: no detection', () => {
    expect(SHORT_HEADER_MIN_ROWS).toBe(3);
    const two = parseCsvText(table(2, EXTRA_FOR_SHORT_BY_2), 'two.csv');
    expect(ids(two)).toEqual(['ROW-RAGGED']);
    expect(two.sheets[0].header).toHaveLength(H);
    const three = parseCsvText(table(3, EXTRA_FOR_SHORT_BY_2), 'three.csv');
    expect(ids(three)).toEqual(['IN-HEADER-SHORT']);
  });

  it('a tab-separated file takes the same path', () => {
    const tsv = table(20, EXTRA_FOR_SHORT_BY_2).replace(/,/g, '\t');
    expect(ids(parseCsvText(tsv, 't.tsv'))).toEqual(['IN-HEADER-SHORT']);
  });

  it('200,000 rows run in reasonable time', () => {
    const t0 = Date.now();
    const f = parseCsvText(table(200_000, EXTRA_FOR_SHORT_BY_2), 'big.csv');
    expect(ids(f)).toEqual(['IN-HEADER-SHORT']);
    expect(f.sheets[0].rows).toHaveLength(200_000);
    expect(Date.now() - t0).toBeLessThan(20_000);
  }, 60_000);
});

describe('IN-HEADER-SHORT: the finding text', () => {
  const finding = (extra: number): Finding => parseCsvText(table(30, H + extra - FIELDS), 'm.csv').findings[0];
  it('says in every language how many names are missing, without claiming where', () => {
    const f = finding(2);
    expect(renderPlain(f, 'en')).toContain(`The header has ${H} names, but 30 of 30 rows have ${H + 2} values, so 2 names are missing.`);
    expect(renderPlain(f, 'en')).toContain(`Column ${H + 1}…${H + 2}`);
    expect(renderPlain(f, 'pl')).toContain(`Nagłówek ma ${H} nazw, ale 30 z 30 wierszy ma ${H + 2} wartości, więc brakuje 2 nazw.`);
    expect(renderPlain(f, 'pl')).toContain(`Kolumna ${H + 1}…${H + 2}`);
    expect(renderPlain(f, 'de')).toContain(`daher fehlen 2 Namen`);
    expect(renderPlain(f, 'fr')).toContain(`donc 2 noms manquent`);
    for (const lang of LANGS) expect(renderPlain(f, lang)).not.toMatch(/\{|\+/);
    expect(renderTechnical(f)).toContain(`${H} names`);
  });
  it('agrees in number for one missing name', () => {
    const f = finding(1);
    expect(renderPlain(f, 'en')).toContain('so 1 name is missing');
    expect(renderPlain(f, 'en')).toContain(`as Column ${H + 1}.`);
    expect(renderPlain(f, 'pl')).toContain('brakuje 1 nazwy');
    expect(renderPlain(f, 'de')).toContain('daher fehlt 1 Name');
    expect(renderPlain(f, 'fr')).toContain('donc 1 nom manque');
  });
  it('Polish uses the few form for 3 missing names', () => {
    expect(renderPlain(finding(3), 'pl')).toContain('brakuje 3 nazw.');
    expect(formatLines(finding(3).lines)).toBe('');
  });
});

describe('IN-HEADER-SHORT: /check', () => {
  it('proposes the new columns like any column, and names missing in the middle can be fixed by mapping', async () => {
    // Invented: the names "Remarks" and "Photo" are the last two of the header, but the rows are remarks, latitude, longitude, flag: two names are missing BEFORE "Photo".
    const header = ['Station', 'Date', 'Depth', 'Temp', 'Remarks', 'Photo'];
    const lines = [header.join(',')];
    for (let i = 0; i < 40; i++) lines.push([`ZS${(i % 4) + 1}`, `2021-07-${String((i % 28) + 1).padStart(2, '0')}`, String(i + 1), (4 + i / 10).toFixed(1), `note ${i}`, (-30.5 + i / 100).toFixed(2), (-70.25 - i / 100).toFixed(2), i % 2 ? 'Yes' : 'No'].join(','));
    const text = lines.join('\n') + '\n';
    const engine = createDirectEngine({ land: async () => undefined as never });
    const parsed = await engine.parse([{ name: 'mid.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }], [], []);
    const f = parsed.files[0];
    expect(f.sheets[0].header).toEqual([...header, 'Column 7', 'Column 8']);
    expect(f.sheets[0].unnamedFrom).toBe(6);
    expect(parsed.files[0].layout.tables.length).toBeGreaterThan(0);
    const proposals = f.proposals['mid.csv'];
    expect(proposals.map((p) => p.header)).toEqual([...header, 'Column 7', 'Column 8']);
    expect(f.samples['mid.csv'][6][0]).toBe('-70.25');
    expect(f.samples['mid.csv'][7][0]).toBe('No');

    // the user's fix: "Photo" holds the latitudes, "Column 7" the longitudes
    const file = (await import('../../src/core/parse')).parseFile('mid.csv', new TextEncoder().encode(text));
    const layout = proposeLayout(file);
    const mappings = proposeMappings(file, layout);
    const edit = (h: string, role: ColumnRole) => (mappings[0].columns.find((c) => c.header === h)!.role = role);
    edit('Photo', { kind: 'latitude' });
    edit('Column 7', { kind: 'longitude' });
    edit('Remarks', { kind: 'ignore' });
    edit('Column 8', { kind: 'ignore' });
    const { datasets } = buildDatasets(file, layout, mappings, [], 'd1');
    const r = datasets[0].rows;
    expect(r).toHaveLength(40);
    expect(r[0].lat).toBe(-30.5);
    expect(r[0].lon).toBe(-70.25);
    expect(r[39].lat).toBe(-30.11);
    expect(r[39].lon).toBe(-70.64);
  });
});

describe('IN-HEADER-SHORT: /convert', () => {
  const header = ['Station', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'TEMP_C'];
  const make = (extraRows: string[] = []): string => {
    const lines = [header.join(',')];
    for (let i = 0; i < 30; i++) lines.push(['ZE1', '2020-05-01', '70.1', '20.2', String(i + 1), (4 + i / 10).toFixed(1), (35 + i / 10).toFixed(1), i % 2 ? 'Yes' : 'No'].join(','));
    return [...lines, ...extraRows].join('\n') + '\n';
  };
  const input = (text: string) => {
    const file = readConvertFile(parseCsvText(text, 'env.csv'));
    const props = proposeConvertColumns(file.sheets[0], { decimalComma: false, date1904: false });
    return { file, props, mapping: { sheet: 'env.csv', columns: props.map((p) => ({ index: p.index, header: p.header, role: p.role as ColumnRole })) } };
  };

  it('sees the extended sheet, proposes the new columns, converts, and the finding is shown, never a block', () => {
    const { file, props, mapping } = input(make());
    expect(file.sheets[0].header.slice(-2)).toEqual(['Column 7', 'Column 8']);
    expect(props.map((p) => p.header).slice(-2)).toEqual(['Column 7', 'Column 8']);
    // the new column 7 holds salinity-like numbers: give it a role like any column
    const sal = mapping.columns.find((c) => c.header === 'Column 7')!;
    sal.role = { kind: 'variable', variable: 'Salinity', unit: 'PSU' };
    const r = convert({ sheets: [{ file, sheet: 'env.csv', mapping, shape: 'wide', profile: { depthIds: true } }] });
    const short = r.findings.filter((f) => f.ruleId === 'IN-HEADER-SHORT');
    expect(short).toHaveLength(1);
    expect(policyOf(short[0])).toBe('show');
    expect(r.findings.map((f) => f.ruleId)).not.toContain('ROW-RAGGED');
    expect(r.findings.filter((f) => f.severity === 'error' && f.ruleId.startsWith('IN-'))).toEqual([]);
    expect(r.measurements.some((m) => m.measurementValue === '35.0')).toBe(true);
  });

  it('a truly ragged row still blocks, with its own line', () => {
    const { file, mapping } = input(make(['ZE1,2020-05-01,70.1,20.2,31,4.0,35.0,No,extra,more']));
    const r = convert({ sheets: [{ file, sheet: 'env.csv', mapping, shape: 'wide', profile: { depthIds: true } }] });
    const rag = r.findings.find((f) => f.ruleId === 'ROW-RAGGED')!;
    expect(rag.lines).toEqual([32]);
    expect(r.ok).toBe(false);
  });
});

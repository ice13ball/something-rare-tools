// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// CONV-ROLE-UNCONFIRMED: a taxon, quantity, date, latitude or longitude the converter proposed and the file does not state by name is listed once, to be accepted. Nothing is re-roled, the proposals do not
// change, the tick is an acknowledgement and nothing more. Every value is invented.
import { describe, expect, it } from 'vitest';
import { listedColumns, printOf, tickHolds } from '../../src/app/convertModel';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { proposeConvertColumns, proposeConvertMapping } from '../../src/core/convert/recognize';
import { keyHashes } from '../../src/core/convert/keySetting';
import { ROLE_LABELS, roleWord } from '../../src/core/i18n/roleLabels';
import { UI } from '../../src/core/i18n/ui';
import { unconfirmedRoles } from '../../src/core/convert/roleUnconfirmed';
import { withStated } from '../../src/core/convert/stated';
import { renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import type { ColumnRole } from '../../src/core/types';
import { createConvertHandler } from '../../src/worker/convert.handler';
import type { Cell } from './helpers';
import { CTX, L1_HEADER, L1_ROWS, W1_HEADER, W1_ROWS, W1_QUANTITY, fileOf, mappingOf, sheetInput } from './helpers';

const RULE = 'CONV-ROLE-UNCONFIRMED';
// Species is stated by name; the date, the position and the count are proposed from their cells and names the file does not state as a term or an entry
const HEADER = ['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'Abundance (ind)'];
const ROWS: Cell[][] = [
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Solea solea', 4],
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Gadus morhua', 2],
  ['B', 'B1', '2020-05-02', 54.2, 7.3, 'Solea solea', 9],
];
const file = () => fileOf(HEADER, ROWS, 'S', { fileName: 'catch.csv' });
const run = (edit: Record<string, ColumnRole> = {}) => convert({ sheets: [sheetInput(file(), { quantity: { kind: 'count' }, edit })], approvedSplits: {} });
const listed = (r: ReturnType<typeof run>) => r.findings.filter((f) => f.ruleId === RULE);
const names = (f: { params: Record<string, string | number> }) => String(f.params.columns).split('\u001e').map((i) => i.split('\u001f')[0]);

describe('what is listed', () => {
  it('names each column, its proposed role and a few cells, in one finding per sheet that asks for a tick and blocks nothing', () => {
    const r = run();
    const f = listed(r);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', file: 'catch.csv', sheet: 'S', params: { count: 4, keys: [2, 3, 4, 6].map((i, k) => `${keyHashes(HEADER, [i])}:${['date', 'latitude', 'longitude', 'quantity'][k]}`).join(',') } });
    expect(names(f[0])).toEqual(['Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Abundance (ind)']);
    expect(String(f[0].params.columns)).toContain('2020-05-01\u001f2020-05-02');
    expect(String(f[0].params.columns)).toContain('54.1\u001f54.2');
    const j = judge(r.findings);
    expect(j.acceptRules).toContain(RULE);
    expect(j.blocking.map((x) => x.ruleId)).not.toContain(RULE);
    expect(judge(f).blocking).toEqual([]);
    for (const lang of LANGS) {
      const text = renderConvertPlain(f[0], lang);
      expect(text, lang).toContain('"Abundance (ind)"');
      expect(text, lang).toContain('2020-05-01');
      expect(text, lang).not.toMatch(/\{|\}|\u001e|\u001f/);
    }
    expect(renderConvertPlain(f[0], 'en')).toContain('"Date of sampling" (Date: 2020-05-01 | 2020-05-02)');
    expect(renderConvertPlain(f[0], 'pl')).toContain('"Abundance (ind)" (Ilość: 4 | 2 | 9)');
    expect(renderConvertPlain(f[0], 'de')).toContain('"Latitude_dd" (Breitengrad: 54.1');
    expect(renderConvertTechnical(f[0])).toContain('"Longitude_dd" (Longitude: 7.2');
  });

  it('the count forms agree in four languages for one column and for many', () => {
    const one = { ...listed(run())[0], params: { count: 1, columns: 'Data\u001fdate\u001f2020-05-01', keys: '2:date' } };
    expect(renderConvertPlain(one, 'en')).toContain('1 column has a role');
    expect(renderConvertPlain(one, 'pl')).toContain('1 kolumna ma rolę');
    expect(renderConvertPlain(one, 'de')).toContain('1 Spalte hat');
    expect(renderConvertPlain(one, 'fr')).toContain('1 colonne a un rôle');
    const two = { ...one, params: { ...one.params, count: 2 } };
    expect(renderConvertPlain(two, 'pl')).toContain('2 kolumny mają');
    const five = { ...one, params: { ...one.params, count: 5 } };
    expect(renderConvertPlain(five, 'pl')).toContain('5 kolumn ma');
    expect(renderConvertPlain(five, 'en')).toContain('5 columns have');
    expect(renderConvertPlain(five, 'fr')).toContain('5 colonnes ont');
  });

  it('a long list shows the first six and counts the rest; the finding keeps all of them', () => {
    const many = Array.from({ length: 9 }, (_, i) => `C${i}\u001fdate\u001f2020-01-0${i + 1}`).join('\u001e');
    const f = { ...listed(run())[0], params: { count: 9, columns: many, keys: '' } };
    const text = renderConvertPlain(f, 'en');
    expect(text).toContain('"C5"');
    expect(text).not.toContain('"C6"');
    expect(text).toContain('… (+3)');
  });

  it('a column named by an exact term or entry is stated and not listed (well-named sheets ask nothing)', () => {
    const w1 = convert({ sheets: [sheetInput(fileOf(W1_HEADER, W1_ROWS), { quantity: W1_QUANTITY })], approvedSplits: {} });
    expect(w1.findings.filter((f) => f.ruleId === RULE)).toEqual([]);
    const l1 = convert({ sheets: [sheetInput(fileOf(L1_HEADER, L1_ROWS), { quantity: { kind: 'count' } })], approvedSplits: {} });
    expect(l1.findings.filter((f) => f.ruleId === RULE)).toEqual([]);
    // a Date column the proposer reads as a datetime is the same family, so the name states it
    const dt = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], [
      ['A', '2020-05-01T10:00:00', 54.1, 7.2, 'Solea solea', 4],
      ['B', '2020-05-02T11:30:00', 54.2, 7.3, 'Gadus morhua', 2],
    ]);
    expect(convert({ sheets: [sheetInput(dt, { quantity: { kind: 'count' } })], approvedSplits: {} }).findings.filter((f) => f.ruleId === RULE)).toEqual([]);
  });

  it('a column the person set by hand is not listed, whatever role they chose; the others still are', () => {
    const r = run({ 'Date of sampling': { kind: 'ignore' }, Latitude_dd: { kind: 'variable', variable: 'y' } });
    expect(names(listed(r)[0])).toEqual(['Longitude_dd', 'Abundance (ind)']);
    // all answered: nothing to say
    expect(listed(run({ 'Date of sampling': { kind: 'datetime' }, Latitude_dd: { kind: 'ignore' }, Longitude_dd: { kind: 'ignore' }, 'Abundance (ind)': { kind: 'variable', variable: 'n' } }))).toEqual([]);
    // a column the person touched (the page sends its index in `handSet`) is theirs even when the role they chose is the very one proposed
    const f2 = file();
    const touched = convert({ sheets: [sheetInput(f2, { quantity: { kind: 'count' }, handSet: [3] })], approvedSplits: {} });
    expect(names(listed(touched)[0])).toEqual(['Date of sampling', 'Longitude_dd', 'Abundance (ind)']);
    expect(names(listed(run())[0])).toContain('Latitude_dd');
  });

  it('a role other than the five is not listed even when it is only proposed', () => {
    const f = fileOf(['Station', 'Start latitude', 'Species', 'Count', 'Depth m', 'Temperature [°C]'], [
      ['A', 54.1, 'Solea solea', 4, 12, 11.2],
      ['B', 54.3, 'Gadus morhua', 2, 15, 11.4],
    ]);
    const cols = unconfirmedRoles(f, f.sheets[0], mappingOf(f));
    expect(cols.map((c) => `${c.header}:${c.role}`)).toEqual(['Start latitude:latitude']);
  });

  it('the wide sheet\'s taxon headers (a species name over the numbers) are not listed: they have the page\'s own confirmation', () => {
    const f = fileOf(['Station', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis'], [
      ['A', '2020-05-01', 54.1, 7.2, 10, 5],
      ['B', '2020-05-02', 54.2, 7.3, 7, 3],
    ]);
    expect(unconfirmedRoles(f, f.sheets[0], mappingOf(f))).toEqual([]);
  });
});

describe('the role words are the column table\'s own', () => {
  const ROLES: [string, string][] = [['taxon', 'role.taxon'], ['quantity', 'role.quantity'], ['date', 'role.date'], ['datetime', 'role.datetime'], ['latitude', 'role.latitude'], ['longitude', 'role.longitude']];
  it.each(ROLES)('%s is named as the table names it, in four languages', (role, key) => {
    const base = listed(run())[0];
    const f = { ...base, params: { count: 1, columns: `Col\u001f${role}\u001fx`, keys: 'h:date' } };
    for (const lang of LANGS) {
      const table = (UI[lang] as Record<string, string>)[key];
      expect(table, `${lang} ${key}`).toBe((ROLE_LABELS[lang] as Record<string, string>)[role]);
      // the finding is inside brackets itself: the label without its own bracketed explanation
      const label = roleWord(lang, role);
      expect(table.startsWith(label), `${lang} ${key}`).toBe(true);
      expect(label, `${lang} ${key}`).not.toMatch(/[()]/);
      expect(renderConvertPlain(f, lang), lang).toContain(`"Col" (${label}${lang === 'fr' ? '\u00a0' : ''}: x)`);
    }
  });

  it('a density is not called a count, and a datetime is "Date and time", with the label of the table', () => {
    const f = fileOf(['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'densite_ind_1000m2'], [
      ['A', 'A1', '2020-05-01T10:00', 54.1, 7.2, 'Solea solea', 4.5],
      ['A', 'A1', '2020-05-01T10:00', 54.1, 7.2, 'Gadus morhua', 2.25],
      ['B', 'B1', '2020-05-02T11:00', 54.2, 7.3, 'Solea solea', 9.75],
    ]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })], approvedSplits: {} });
    const found = r.findings.find((x) => x.ruleId === RULE)!;
    expect(String(found.params.columns)).toContain('Date of sampling\u001fdatetime');
    expect(renderConvertPlain(found, 'de')).toContain('(Datum und Uhrzeit: 2020-05-01T10:00');
    expect(renderConvertPlain(found, 'de')).toContain('"densite_ind_1000m2" (Menge: 4.5');
    expect(renderConvertPlain(found, 'de')).not.toContain('Anzahl');
    expect(renderConvertPlain(found, 'fr')).toContain('(Quantité\u00a0: 4.5');
    expect(renderConvertPlain(found, 'fr')).not.toContain('effectif');
    // the set the tick stands for keeps `date` for both
    expect(String(found.params.keys)).toContain(':date');
  });
});

describe('the proposals and the mapping do not change', () => {
  it('withStated keeps every role and every other field of every proposal; the mapping the worker hands to the page is the proposer\'s', () => {
    for (const [header, rows] of [[HEADER, ROWS], [W1_HEADER, W1_ROWS], [L1_HEADER, L1_ROWS]] as [string[], Cell[][]][]) {
      const f = fileOf(header, rows);
      const proposals = proposeConvertColumns(f.sheets[0], CTX);
      const marked = withStated(f.sheets[0], proposals, { decimalComma: false });
      expect(marked.map((p) => p.role)).toEqual(proposals.map((p) => p.role));
      expect(marked.map((p) => ({ ...p, stated: undefined }))).toEqual(proposals.map((p) => ({ ...p, stated: undefined })));
    }
    // the worker's parse result: roles and order as proposeConvertMapping gives them, with the rule in the code or not
    const text = [HEADER, ...ROWS].map((r) => r.join(',')).join('\n') + '\n';
    const parsed = createConvertHandler().handle({ type: 'parse', files: [{ name: 'catch.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }] } as never) as { files: { mappings: { columns: unknown[] }[]; proposals: Record<string, { role: unknown }[]> }[] };
    const pf = file();
    expect(parsed.files[0].mappings[0].columns).toEqual(proposeConvertMapping(pf.sheets[0], CTX).columns);
    expect(Object.values(parsed.files[0].proposals)[0].map((p) => p.role)).toEqual(proposeConvertColumns(pf.sheets[0], CTX).map((p) => p.role));
  });

  it('converting does not write into the mapping it was given, and the same mapping gives the same tables with or without the finding', () => {
    const input = sheetInput(file(), { quantity: { kind: 'count' } });
    const before = JSON.stringify(input.mapping);
    const r = convert({ sheets: [input], approvedSplits: {} });
    expect(JSON.stringify(input.mapping)).toBe(before);
    expect(listed(r)).toHaveLength(1);
    // the tables are those of the same sheet read under stated names: the finding adds a line and changes no row
    const stated = fileOf(['Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'], ROWS, 'S', { fileName: 'catch.csv' });
    const s = convert({ sheets: [sheetInput(stated, { quantity: { kind: 'count' } })], approvedSplits: {} });
    expect(s.findings.filter((f) => f.ruleId === RULE)).toEqual([]);
    expect(JSON.stringify(r.occurrences)).toBe(JSON.stringify(s.occurrences));
    expect(JSON.stringify(r.events)).toBe(JSON.stringify(s.events));
  });
});

describe('the tick is an acknowledgement and nothing more', () => {
  const text = [HEADER, ...ROWS].map((r) => r.join(',')).join('\n') + '\n';
  const exportWith = async (accepted: string[]) => {
    const h = createConvertHandler();
    const parsed = h.handle({ type: 'parse', files: [{ name: 'catch.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }] } as never) as never as { files: { fileId: string; mappings: { sheet: string; columns: unknown[] }[] }[] };
    return { h, parsed };
  };

  it('the export is refused while it is not accepted, and the archive with it holds no word of it', async () => {
    const { h, parsed } = await exportWith([]);
    expect(parsed.files).toHaveLength(1);
    const { requestOf, initialChoices, sheetKey, EMPTY_QUANTITY } = await import('../../src/app/convertModel');
    const { EMPTY_METADATA } = await import('../../src/core/convert/metadata');
    const choices = initialChoices(parsed as never);
    const key = sheetKey(parsed.files[0].fileId, 'catch.csv');
    choices[key] = { ...choices[key], use: true, shape: 'long', quantity: { ...EMPTY_QUANTITY, kind: 'count' } };
    const mappings = { [parsed.files[0].fileId]: parsed.files[0].mappings };
    const body = requestOf({ parsed: parsed as never, mappings: mappings as never, choices, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, metadata: EMPTY_METADATA });
    const meta = { ...EMPTY_METADATA, title: 'Invented counts', abstract: 'Invented values for a test.', creators: 'Ada Example', contactName: 'Ada Example', contactEmail: 'ada@example.org', institutionCode: 'INVENTED', licence: 'CC-BY-4.0' as const, basisOfRecord: 'HumanObservation' as const };
    const view = h.handle({ type: 'convert', body } as never) as { findings: { ruleId: string }[] };
    expect(view.findings.map((f) => f.ruleId)).toContain(RULE);
    const others = [...new Set(view.findings.map((f) => f.ruleId))].filter((id) => id !== RULE);
    await expect(Promise.resolve(h.handle({ type: 'export', export: { body, metadata: meta, accepted: others, generated: '2026-11-06T00:00:00Z' } } as never))).rejects.toThrow(/Export refused.*CONV-ROLE-UNCONFIRMED.*Nothing was written/);
    const ok = (await h.handle({ type: 'export', export: { body, metadata: meta, accepted: [...others, RULE], generated: '2026-11-06T00:00:00Z' } } as never)) as { bytes: Uint8Array };
    const { openZip } = await import('../../src/core/parse/zip');
    const { nodeInflate } = await import('../helpers/zipfile');
    const zip = openZip(ok.bytes);
    const all = (await Promise.all(zip.entries.map(async (e) => new TextDecoder().decode(await zip.read(e, nodeInflate))))).join('\n');
    expect(all.length).toBeGreaterThan(100);
    expect(all).not.toMatch(/confirm|unconfirmed|acknowledg|accepted by|ROLE-UNCONFIRMED/i);
    // the roles were not changed by the tick: the quantity is the count, the taxon the species, the date the date
    expect(all).toContain('Solea solea');
    expect(all).toContain('2020-05-01');
  });
});

describe('a tick lasts while the findings stay the same, and is for a set of columns', () => {
  const f = (keys: string, file = 'catch.csv', sheet = 'S') => ({ ruleId: RULE, severity: 'warning' as const, file, sheet, params: { count: 1, columns: 'x', keys } });
  it('the same set holds, a smaller one holds, a larger one or another sheet reopens it', () => {
    const now = [f('h1:date,h4:taxon,h5:quantity')];
    const ticked = printOf(RULE, now);
    expect(tickHolds(RULE, ticked, printOf(RULE, now), now)).toBe(true);
    // a column answered by hand leaves the list: still accepted
    const fewer = [f('h4:taxon,h5:quantity')];
    expect(tickHolds(RULE, ticked, printOf(RULE, fewer), fewer)).toBe(true);
    // and answered again with the proposed role: back on the list, the set is not larger than the ticked one
    expect(tickHolds(RULE, ticked, printOf(RULE, now), now)).toBe(true);
    // a column that was not on the list: reopens
    const more = [f('h1:date,h4:taxon,h5:quantity,h2:latitude')];
    expect(tickHolds(RULE, ticked, printOf(RULE, more), more)).toBe(false);
    // the same column index in another sheet or file is another column
    expect(tickHolds(RULE, ticked, printOf(RULE, [f('h1:date', 'catch.csv', 'T')]), [f('h1:date', 'catch.csv', 'T')])).toBe(false);
    expect(tickHolds(RULE, ticked, printOf(RULE, [f('h1:date', 'other.csv')]), [f('h1:date', 'other.csv')])).toBe(false);
    // a column listed under another proposed role is another question
    expect(tickHolds(RULE, ticked, printOf(RULE, [f('h1:datetime')]), [f('h1:datetime')])).toBe(false);
    // a different column at the same position (another header) is another column: the key is the header's hash, not the place
    const other = [f(`${keyHashes(['Lat start'], [0])}:latitude`)];
    const ticked2 = printOf(RULE, other);
    const moved = [f(`${keyHashes(['Other column'], [0])}:latitude`)];
    expect(tickHolds(RULE, ticked2, printOf(RULE, moved), moved)).toBe(false);
    // two equal headers are told apart by which of them it is
    expect(keyHashes(['x', 'x'], [0])).not.toBe(keyHashes(['x', 'x'], [1]));
    // no tick, a broken tick
    expect(tickHolds(RULE, undefined, printOf(RULE, now), now)).toBe(false);
    expect(tickHolds(RULE, 'not json', printOf(RULE, now), now)).toBe(false);
    expect(listedColumns(more)).toHaveLength(4);
  });

  it('every other rule keeps its tick for the same findings only', () => {
    const a = [{ ruleId: 'CONV-KEY-PART-BLANK', severity: 'warning' as const, file: 'a', sheet: 'S', params: { count: 2 } }];
    const b = [{ ...a[0], params: { count: 1 } }];
    expect(tickHolds('CONV-KEY-PART-BLANK', printOf('CONV-KEY-PART-BLANK', a), printOf('CONV-KEY-PART-BLANK', a), a)).toBe(true);
    expect(tickHolds('CONV-KEY-PART-BLANK', printOf('CONV-KEY-PART-BLANK', a), printOf('CONV-KEY-PART-BLANK', b), b)).toBe(false);
  });
});

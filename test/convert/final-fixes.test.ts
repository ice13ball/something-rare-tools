// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Final review fixes: the advice of CONV-ID-DUPLICATE under a picked key (M2), a key column keeps its role's question (L1), the answers read from a companion file say so (L6),
// the preview of a key with two dropped files of one name (L7). Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { previewSampleKey } from '../../src/core/convert/keyPreview';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const ids = (r: ReturnType<typeof convert>, rule: string) => r.findings.filter((f) => f.ruleId === rule);

describe('M2: CONV-ID-DUPLICATE under a picked key', () => {
  const H = ['Stn', 'Day', 'Net', 'Lat', 'Lon', 'Calanus finmarchicus', 'Oithona similis'];
  const ROWS: Cell[][] = [
    ['ST1', '2024-05-01', 'N1', 54.1, 18.1, 3, 0],
    ['ST1', '2024-05-01', 'N1', 54.1, 18.1, 2, 1],
    ['ST2', '2024-05-02', 'N1', 54.2, 18.2, 4, 4],
  ];
  const wide = () =>
    sheetInput(fileOf(H, ROWS), {
      shape: 'wide',
      quantity: { kind: 'count' },
      edit: { Net: { kind: 'ignore' }, 'Calanus finmarchicus': { kind: 'taxon', header: true }, 'Oithona similis': { kind: 'taxon', header: true } },
      sampleKey: { columns: [0, 1, 2] },
      device: { kind: 'known', key: 'multinet' },
    } as never);

  it('D: rows the key puts in one sample are told so, with the remedy that works, in four languages; the station prefix is not offered', () => {
    const r = convert({ sheets: [wide()], options: { prefixStation: true } as never, approvedSplits: {} } as never);
    const dup = ids(r, 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'event');
    expect(dup.length).toBeGreaterThan(0);
    expect(dup[0].params.keySame).toBe('yes');
    expect(dup[0].params.keyPrefix).toBeUndefined();
    const text = Object.fromEntries(LANGS.map((l) => [l, renderConvertPlain(dup[0], l)]));
    expect(text.en).toContain('The key you picked gives these rows the same sample');
    expect(text.en).toContain('add a column that tells these rows apart to the key');
    expect(text.en).toContain('"Ask again"');
    for (const l of LANGS) {
      expect(text[l], l).not.toMatch(/station prefix|préfixe de station|Stationspräfix|przedrostek|poprzedzanie kodem stacji/i);
      expect(text[l], l).not.toMatch(/[{}]/);
    }
    expect(text.pl).toContain('Zapytaj ponownie');
    expect(text.de).toContain('Erneut fragen');
    expect(text.fr).toContain('Demander à nouveau');
  });

  it('a duplicate that is not made by a key still gets the old advice', () => {
    const noKey = sheetInput(fileOf(['Sample', 'Lat', 'Lon', 'Calanus finmarchicus'], [['A', 54, 18, 1], ['A', 54, 18, 2]]), {
      shape: 'wide',
      quantity: { kind: 'count' },
      edit: { 'Calanus finmarchicus': { kind: 'taxon', header: true } },
    } as never);
    const dup = ids(convert({ sheets: [noKey], options: {} as never, approvedSplits: {} } as never), 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'event');
    expect(dup.length).toBeGreaterThan(0);
    expect(dup[0].params.keySame).toBeUndefined();
    expect(renderConvertPlain(dup[0], 'en')).toContain('tick the station prefix');
  });

  it('two sheets with the same name in front of the IDs: say to give one sheet another name, not to tick the station prefix', () => {
    const sheet = (fileName: string) => {
      const s = sheetInput(fileOf(['Stn', 'Day', 'Lat', 'Lon', 'Calanus finmarchicus'], [['ST1', '2024-05-01', 54, 18, 1]], 'Sheet1', { fileName }), {
        shape: 'wide',
        quantity: { kind: 'count' },
        edit: { 'Calanus finmarchicus': { kind: 'taxon', header: true } },
        sampleKey: { columns: [0, 1], prefix: 'Same' },
        device: { kind: 'known', key: 'multinet' },
      } as never);
      return s;
    };
    const dup = ids(convert({ sheets: [sheet('a.csv'), sheet('b.csv')], options: {} as never, approvedSplits: {} } as never), 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'event');
    expect(dup.length).toBeGreaterThan(0);
    expect(dup[0].params.keyPrefix).toBe('Same');
    expect(dup[0].params.keySame).toBeUndefined();
    for (const l of LANGS) expect(renderConvertPlain(dup[0], l), l).toContain('Same');
    expect(renderConvertPlain(dup[0], 'en')).toContain('give one of them another name');
    expect(renderConvertPlain(dup[0], 'en')).not.toContain('station prefix');
  });

  it('E: the occurrence-kind text under a key adds the same remedy, in four languages', () => {
    const rows: Cell[][] = [
      ['ST1', '2024-05-01', 'N1', 54.1, 18.1, 'Calanus finmarchicus', 3],
      ['ST1', '2024-05-01', 'N1', 54.1, 18.1, 'Calanus finmarchicus', 5],
      ['ST1', '2024-05-01', 'N2', 54.1, 18.1, 'Calanus finmarchicus', 2],
    ];
    const sin = sheetInput(fileOf(['Stn', 'Day', 'Net', 'Lat', 'Lon', 'Species', 'Count'], rows), {
      shape: 'long',
      quantity: { kind: 'count' },
      edit: { Net: { kind: 'ignore' }, Stn: { kind: 'station' }, Day: { kind: 'date' } },
      sampleKey: { columns: [0, 1] },
      device: { kind: 'known', key: 'multinet' },
    } as never);
    const dup = ids(convert({ sheets: [sin], options: {} as never, approvedSplits: {} } as never), 'CONV-ID-DUPLICATE').filter((f) => f.params.kind === 'occurrence');
    expect(dup).toHaveLength(1);
    expect(dup[0].params.keyAdvice).toBe('yes');
    expect(renderConvertPlain(dup[0], 'en')).toContain('add a column that tells them apart to the key, or use "Ask again"');
    for (const l of LANGS) expect(renderConvertPlain(dup[0], l), l).not.toMatch(/[{}]/);
    // without a key the sentence is not there
    const plain = sheetInput(fileOf(['Stn', 'Day', 'Net', 'Lat', 'Lon', 'Species', 'Count'], rows), { shape: 'long', quantity: { kind: 'count' }, edit: { Net: { kind: 'ignore' }, Stn: { kind: 'station' }, Day: { kind: 'date' } } } as never);
    for (const f of ids(convert({ sheets: [plain], options: {} as never, approvedSplits: {} } as never), 'CONV-ID-DUPLICATE')) expect(f.params.keyAdvice).toBeUndefined();
  });
});

describe('L1: a key column keeps its own role question; a keyPart column is not listed', () => {
  const HEADER = ['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'Abundance (ind)'];
  const ROWS: Cell[][] = [
    ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Solea solea', 4],
    ['B', 'B1', '2020-05-02', 54.2, 7.3, 'Solea solea', 9],
  ];
  const run = (edit: Record<string, ColumnRole>) =>
    convert({ sheets: [sheetInput(fileOf(HEADER, ROWS, 'S', { fileName: 'catch.csv' }), { quantity: { kind: 'count' }, edit, sampleKey: { columns: [0, 2] } } as never)], approvedSplits: {} });
  const listedNames = (r: ReturnType<typeof run>): string[] => {
    const f = r.findings.find((x) => x.ruleId === 'CONV-ROLE-UNCONFIRMED');
    return f === undefined ? [] : String(f.params.columns).split('\u001e').map((i) => i.split('\u001f')[0]);
  };
  it('a date column in the key is still asked about as a date', () => expect(listedNames(run({}))).toContain('Date of sampling'));
  it('a column the key made a keyPart (it was set to ignore) is not listed', () => expect(listedNames(run({ 'Date of sampling': { kind: 'ignore' } }))).not.toContain('Date of sampling'));
});

describe('L6: an answer read from a companion file says so', () => {
  const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Count', 'Note'];
  const rows: Cell[][] = [['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['a', '2020-06-01', 49.4, 0.2, 'Solea solea', 3, 'x'], ['b', '2020-06-01', 49.4, 0.2, 'Gadus morhua', 2, 'y']];
  const copies = (extra: Record<string, unknown>) =>
    sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, device: { kind: 'known', key: 'multinet' }, edit: { Sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Count: { kind: 'quantity' }, Note: { kind: 'ignore' } }, ...extra } as never);
  it('exact copies dropped: from the page nothing is said, from a file the sentence is added', () => {
    const page = ids(convert({ sheets: [copies({ dropCopies: true })], options: {} }), 'CONV-ROW-COPIES-DROPPED');
    const file = ids(convert({ sheets: [copies({ dropCopiesCount: 1, dropCopiesFromFile: true })], options: {} }), 'CONV-ROW-COPIES-DROPPED');
    // the page's own answer is kept with its count too: it is not "from the companion file"
    const pageCounted = ids(convert({ sheets: [copies({ dropCopiesCount: 1 })], options: {} }), 'CONV-ROW-COPIES-DROPPED');
    expect(pageCounted[0].params.fromFile).toBeUndefined();
    expect(page).toHaveLength(1);
    expect(file).toHaveLength(1);
    expect(page[0].params.fromFile).toBeUndefined();
    expect(file[0].params.fromFile).toBe('yes');
    for (const l of LANGS) {
      expect(renderConvertPlain(file[0], l), l).toMatch(/companion|towarzysz|Begleit|accompagnement/);
      expect(renderConvertPlain(page[0], l), l).not.toMatch(/companion|towarzysz|Begleit|accompagnement/);
    }
  });
  it('a total taken once: the same', () => {
    const H = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Size', 'Quantity', 'Weight'];
    const EDIT: Record<string, ColumnRole> = { sample: { kind: 'sampleId' }, Species: { kind: 'taxon' }, Quantity: { kind: 'quantity' }, Weight: { kind: 'biomass', basis: 'wet' }, Size: { kind: 'variable', variable: 'body length', unit: 'cm', unitSource: 'user', perOccurrence: true } };
    const data: Cell[][] = [];
    for (let s = 1; s <= 10; s++) for (let t = 0; t < 2; t++) for (let c = 0; c < 3; c++) data.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, ['Solea solea', 'Merlangius merlangus'][t], 8 + c, 20 + 7 * s + 3 * t, s <= 2 && t === 0 ? 50 + c : 100 + s * 3 + t]);
    const mk = (extra: Record<string, unknown>) => sheetInput(fileOf(H, data, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...extra } as never);
    const page = ids(convert({ sheets: [mk({ totalOnce: true })], options: {} }), 'CONV-QUANTITY-REPEATED-ONCE');
    const file = ids(convert({ sheets: [mk({ totalOnceCount: 18, totalOnceFromFile: true })], options: {} }), 'CONV-QUANTITY-REPEATED-ONCE');
    const pageCounted = ids(convert({ sheets: [mk({ totalOnceCount: 18 })], options: {} }), 'CONV-QUANTITY-REPEATED-ONCE');
    expect(pageCounted[0].params.fromFile).toBeUndefined();
    expect(page).toHaveLength(1);
    expect(file).toHaveLength(1);
    expect(page[0].params.fromFile).toBeUndefined();
    expect(file[0].params.fromFile).toBe('yes');
    for (const l of LANGS) expect(renderConvertPlain(file[0], l), l).toMatch(/companion|towarzysz|Begleit|accompagnement/);
  });
  it('the rules carry the sentence in four languages for both findings', () => {
    for (const ruleId of ['CONV-ROW-COPIES-DROPPED', 'CONV-QUANTITY-REPEATED-ONCE']) {
      for (const l of LANGS) {
        const f = { ruleId, severity: 'warning', file: 'f.csv', sheet: 'S', lines: [2], params: { count: 1, columns: 'Total', differs: 'x', groups: 1, lost: 'x', withCopies: 1, withoutCopies: 1, fromFile: 'yes' } } as never;
        const without = { ruleId, severity: 'warning', file: 'f.csv', sheet: 'S', lines: [2], params: { count: 1, columns: 'Total', differs: 'x', groups: 1, lost: 'x', withCopies: 1, withoutCopies: 1 } } as never;
        expect(renderConvertPlain(f, l), `${ruleId} ${l}`).toMatch(/companion|towarzysz|Begleit|accompagnement/);
        expect(renderConvertPlain(without, l), `${ruleId} ${l}`).not.toMatch(/companion|towarzysz|Begleit|accompagnement/);
      }
    }
  });
});

describe('L7: the preview of a key finds its own sheet when two dropped files share a name', () => {
  const H = ['Stn', 'Lat', 'Lon', 'Calanus finmarchicus'];
  const one = (rows: Cell[][], key: number[]) =>
    sheetInput(fileOf(H, rows, 'S', { fileName: 'same.csv' }), { shape: 'wide', quantity: { kind: 'count' }, edit: { 'Calanus finmarchicus': { kind: 'taxon', header: true } }, sampleKey: { columns: key }, device: { kind: 'known', key: 'multinet' } } as never);
  it('the second file is previewed as itself, the first is left as it was', () => {
    const a = one([['A', 54, 18, 1], ['B', 54, 18, 2]], [0]);
    const b = one([['X', 55, 19, 1], ['Y', 55, 19, 2], ['Z', 55, 19, 3]], [0]);
    expect(previewSampleKey(a, { sheets: [a, b] })).toMatchObject({ samples: 2, rows: 2 });
    expect(previewSampleKey(b, { sheets: [a, b] })).toMatchObject({ samples: 3, rows: 3 });
    expect(previewSampleKey(b, { sheets: [b, a] })).toMatchObject({ samples: 3, rows: 3 });
    // the other file keeps its own rows in the run: the same values in both give the same sample IDs, and the counts say what the export would count for this file
    const c = one([['A', 54, 18, 1], ['B', 54, 18, 2]], [0]);
    const d = one([['A', 54, 18, 1], ['B', 54, 18, 2], ['C', 54, 18, 3]], [0]);
    const exported = convert({ sheets: [c, d], options: {} }).keys!;
    expect(previewSampleKey(c, { sheets: [c, d] })).toEqual(exported[0]);
    expect(previewSampleKey(d, { sheets: [c, d] })).toEqual(exported[1]);
    expect(exported[0]).not.toEqual(exported[1]);
  });
});

describe('L6 through the page model: only a file answer is marked', () => {
  it('requestOf sends the count of a page answer without the mark and the count of a companion file with it;', async () => {
    const { requestOf, initialChoices, sheetKey, EMPTY_QUANTITY } = await import('../../src/app/convertModel');
    const { EMPTY_METADATA } = await import('../../src/core/convert/metadata');
    const { createConvertHandler } = await import('../../src/worker/convert.handler');
    const h = createConvertHandler();
    const text = 'Sample,Date,Latitude,Longitude,Species,Count\na,2020-06-01,49.4,0.2,Solea solea,3\n';
    const parsed = h.handle({ type: 'parse', files: [{ name: 'catch.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }] } as never) as never as { files: { fileId: string; mappings: { sheet: string }[] }[] };
    const choices = initialChoices(parsed as never);
    const key = sheetKey(parsed.files[0].fileId, 'catch.csv');
    const body = (extra: Record<string, unknown>) => {
      const c = { ...choices, [key]: { ...choices[key], use: true, shape: 'long', quantity: { ...EMPTY_QUANTITY, kind: 'count' }, ...extra } };
      return requestOf({ parsed: parsed as never, mappings: { [parsed.files[0].fileId]: parsed.files[0].mappings } as never, choices: c as never, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, metadata: EMPTY_METADATA }).sheets[0] as unknown as Record<string, unknown>;
    };
    const page = body({ dropCopiesAnswer: 4, totalOnceAnswer: 5 });
    expect(page).toMatchObject({ dropCopiesCount: 4, totalOnceCount: 5 });
    expect(page.dropCopiesFromFile).toBeUndefined();
    expect(page.totalOnceFromFile).toBeUndefined();
    const file = body({ dropCopiesFile: 4, totalOnceFile: 5 });
    expect(file).toMatchObject({ dropCopiesCount: 4, totalOnceCount: 5, dropCopiesFromFile: true, totalOnceFromFile: true });
    // an answer given on the page after the file's wins and is not marked
    const both = body({ dropCopiesFile: 4, dropCopiesAnswer: 4 });
    expect(both.dropCopiesFromFile).toBeUndefined();
    // and through the worker: the finding of a file answer says so, the page's own does not
    const text2 = 'Sample,Date,Latitude,Longitude,Species,Count,Note\na,2020-06-01,49.4,0.2,Solea solea,3,x\na,2020-06-01,49.4,0.2,Solea solea,3,x\nb,2020-06-01,49.4,0.2,Gadus morhua,2,y\n';
    const h2 = createConvertHandler();
    const parsed2 = h2.handle({ type: 'parse', files: [{ name: 'copies.csv', bytes: new TextEncoder().encode(text2), source: 'dropped' }] } as never) as never as { files: { fileId: string; mappings: { sheet: string; columns: { header: string; role: unknown }[] }[] }[] };
    const choices2 = initialChoices(parsed2 as never);
    const key2 = sheetKey(parsed2.files[0].fileId, 'copies.csv');
    const run = (extra: Record<string, unknown>) => {
      const c = { ...choices2, [key2]: { ...choices2[key2], use: true, shape: 'long', quantity: { ...EMPTY_QUANTITY, kind: 'count' }, ...extra } };
      const m = parsed2.files[0].mappings.map((x) => ({ ...x, columns: x.columns.map((col) => (col.header === 'Note' ? { ...col, role: { kind: 'ignore' } } : col)) }));
      const b = requestOf({ parsed: parsed2 as never, mappings: { [parsed2.files[0].fileId]: m } as never, choices: c as never, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, metadata: EMPTY_METADATA });
      return (h2.handle({ type: 'convert', body: b } as never) as { findings: { ruleId: string; params: Record<string, unknown> }[] }).findings.filter((f) => f.ruleId === 'CONV-ROW-COPIES-DROPPED');
    };
    expect(run({ dropCopiesAnswer: 1 })[0]?.params.fromFile).toBeUndefined();
    expect(run({ dropCopiesAnswer: 1 })).toHaveLength(1);
    expect(run({ dropCopiesFile: 1 })[0]?.params.fromFile).toBe('yes');
  });
});

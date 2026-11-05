// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Task 5, fix round 3: which saved key of a companion file belongs to which sheet of a drop. The name first; a renamed table file only when exactly one saved key fits it and no other file fits that key too; a
// workbook entry and a table-file entry never match by columns alone; saving back writes only what was applied. Invented headers and names.
import { describe, expect, it } from 'vitest';
import { initialChoices, sampleKeySettingsOf } from '../../src/app/convertModel';
import { keyHashes } from '../../src/core/convert/keySetting';

const H = ['Station', 'Cast', 'Date', 'Latitude'];
const sheetOf = (name: string, rows = 3) => ({ name, header: H, rowCount: rows });
const fileOf = (id: string, name: string, kind: string, sheet = name, rows = 3) => ({ fileId: id, fileName: name, kind, sheets: [sheetOf(sheet, rows)], suggestedShapes: {}, suggestedProfiles: {} });
const entry = (sheet: string, cols: number[], prefix: string, rows = 3) => ({ sheet, hashes: keyHashes(H, cols)!, rows, prefix });
const parsedOf = (files: ReturnType<typeof fileOf>[], sampleKey: ReturnType<typeof entry>[]) => ({ files, problems: [], metadataFiles: [], archiveFiles: [], notRead: [], mappingFiles: ['c.csv'], settings: { sampleKey } }) as never;
type Pick = { sampleKey?: number[]; sampleKeyPrefix?: string; sampleKeyFromFile?: boolean; sampleKeyAmbiguous?: boolean };
const picks = (p: never): Record<string, Pick> => Object.fromEntries(Object.entries(initialChoices(p) as Record<string, Pick>).map(([k, c]) => [k.split('\u0000')[1], c]));

const A = entry('A.csv', [0, 1], 'A');
const B = entry('B.csv', [0, 2], 'B');

describe('which saved key belongs to which file', () => {
  it('the name first: a file called as an entry gets that entry, whatever else is saved', () => {
    const c = picks(parsedOf([fileOf('f1', 'A.csv', 'csv'), fileOf('f2', 'B.csv', 'csv')], [A, B]));
    expect(c['A.csv']).toMatchObject({ sampleKey: [0, 1], sampleKeyPrefix: 'A', sampleKeyFromFile: true });
    expect(c['B.csv']).toMatchObject({ sampleKey: [0, 2], sampleKeyPrefix: 'B' });
  });

  it('a file called as an entry but with another number of rows gets nothing, and no other entry stands in for it', () => {
    const c = picks(parsedOf([fileOf('f1', 'A.csv', 'csv', 'A.csv', 4)], [A, B]));
    expect(c['A.csv'].sampleKey).toBeUndefined();
    expect(c['A.csv'].sampleKeyAmbiguous).toBeUndefined();
  });

  it('a single renamed file with one saved key that fits gets that key and its name', () => {
    const c = picks(parsedOf([fileOf('f1', 'A_final.csv', 'csv')], [A]));
    expect(c['A_final.csv']).toMatchObject({ sampleKey: [0, 1], sampleKeyPrefix: 'A', sampleKeyFromFile: true });
  });

  it('P-FW 1: a renamed B2 alone, with the keys of A and B saved, gets neither: two keys fit, so the question is open and says why', () => {
    const c = picks(parsedOf([fileOf('f2', 'B2.csv', 'csv')], [A, B]));
    expect(c['B2.csv'].sampleKey).toBeUndefined();
    expect(c['B2.csv'].sampleKeyPrefix).toBeUndefined();
    expect(c['B2.csv'].sampleKeyAmbiguous).toBe(true);
  });

  it('P-FW 2: A2 and B2 together get neither (each of them fits both keys)', () => {
    const c = picks(parsedOf([fileOf('f1', 'A2.csv', 'csv'), fileOf('f2', 'B2.csv', 'csv')], [A, B]));
    for (const n of ['A2.csv', 'B2.csv']) expect(c[n]).toMatchObject({ sampleKeyAmbiguous: true });
    for (const n of ['A2.csv', 'B2.csv']) expect(c[n].sampleKey).toBeUndefined();
  });

  it('one saved key and two renamed files that both fit it: neither gets it', () => {
    const c = picks(parsedOf([fileOf('f1', 'A2.csv', 'csv'), fileOf('f2', 'A3.csv', 'csv')], [A]));
    for (const n of ['A2.csv', 'A3.csv']) expect(c[n]).toMatchObject({ sampleKeyAmbiguous: true });
    for (const n of ['A2.csv', 'A3.csv']) expect(c[n].sampleKey).toBeUndefined();
  });

  it('one saved key, one file renamed and another file called as an entry elsewhere: the renamed file still gets its key', () => {
    const c = picks(parsedOf([fileOf('f1', 'A2.csv', 'csv'), fileOf('f2', 'B.csv', 'csv')], [A, B]));
    expect(c['A2.csv']).toMatchObject({ sampleKey: [0, 1], sampleKeyPrefix: 'A' });
    expect(c['B.csv']).toMatchObject({ sampleKey: [0, 2], sampleKeyPrefix: 'B' });
  });

  it('a workbook entry is not applied to a table file, and a table-file entry is not applied to a workbook sheet, by columns alone', () => {
    const wb = entry('Sheet 1', [0, 1], 'Sheet 1');
    expect(picks(parsedOf([fileOf('f3', 'other.csv', 'csv')], [wb]))['other.csv'].sampleKey).toBeUndefined();
    expect(picks(parsedOf([fileOf('f4', 'book.xlsx', 'xlsx', 'Sheet 7')], [A]))['Sheet 7'].sampleKey).toBeUndefined();
    // a workbook sheet is known by its name
    expect(picks(parsedOf([fileOf('f5', 'book.xlsx', 'xlsx', 'Sheet 1')], [wb]))['Sheet 1']).toMatchObject({ sampleKey: [0, 1], sampleKeyPrefix: 'Sheet 1' });
  });

  it('saving back writes only what was applied: nothing for the open questions, and never one file\'s answer under another file\'s name', () => {
    const p = parsedOf([fileOf('f1', 'A2.csv', 'csv'), fileOf('f2', 'B2.csv', 'csv')], [A, B]);
    expect(sampleKeySettingsOf(p, initialChoices(p))).toEqual([]);
    // the person picks for B2; A2 stays open; the file keeps B2's own key and name only
    const choices = initialChoices(p) as Record<string, Pick & { use: boolean; profile: boolean }>;
    const b2 = Object.keys(choices).find((k) => k.endsWith('B2.csv'))!;
    choices[b2] = { ...choices[b2], sampleKey: [0, 2], sampleKeyPrefix: 'Second' };
    expect(sampleKeySettingsOf(p, choices as never)).toEqual([{ sheet: 'B2.csv', hashes: keyHashes(H, [0, 2])!, rows: 3, prefix: 'Second' }]);
  });
});

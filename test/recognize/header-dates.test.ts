// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Date-of-collection header words (English, Polish, German, French). Every header and value is synthetic.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { parseDate } from '../../src/core/values/dates';
import { rawSheet } from '../helpers/files';

const CTX = { decimalComma: false, date1904: false };
type Cell = string | number | null;

function propose(cols: Record<string, Cell[]>) {
  const header = Object.keys(cols);
  const n = Math.max(...Object.values(cols).map((v) => v.length));
  const rows = Array.from({ length: n }, (_, i) => header.map((h) => cols[h][i] ?? null));
  return proposeColumns(rawSheet(header, rows), CTX);
}
const of = (cols: Record<string, Cell[]>, header: string) => propose(cols).find((p) => p.header === header)!;
describe('date of collection', () => {
  it.each([
    'Date of collection', 'Collection date', 'Sampling date', 'Date of sampling', 'Date sampled', 'Sample date', 'Date collected', 'Collected',
    'Data poboru', 'Data pobrania', 'Probenahmedatum', 'Datum der Probenahme', 'Date de prélèvement', "Date d'échantillonnage",
  ])('%s is the date of the event', (h) => {
    const p = of({ [h]: ['06.12.2010', '07.12.2010', '08.12.2010'], X: [1, 2, 3] }, h);
    expect(p.role.kind, h).toBe('date');
  });

  it('a date column of a sheet with a Date and a Date of collection: the plain Date wins', () => {
    const cols = { 'Date of collection': ['06.12.2010', '07.12.2010'], Date: ['2011-01-01', '2011-01-02'] };
    expect(of(cols, 'Date').role.kind).toBe('date');
    expect(of(cols, 'Date of collection').role.kind).toBe('ignore');
  });

  it('"Collected" with values that are not dates is no date', () => {
    expect(of({ Collected: ['yes', 'no', 'yes'], X: [1, 2, 3] }, 'Collected').role.kind).not.toBe('date');
  });
});

describe('text dates written DD.MM.YYYY', () => {
  it('06.12.2010 is 6 December 2010', () => {
    const d = parseDate('06.12.2010', { date1904: false, dateFormatted: false });
    expect('error' in d ? d.error : d.iso).toBe('2010-12-06');
  });
});

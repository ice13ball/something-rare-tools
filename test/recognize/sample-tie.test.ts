// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Sample-named columns that tie for the sample code: none is proposed, on both tools; every other name keeps the first-column rule. All values are invented.
import { describe, expect, it } from 'vitest';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { rawSheet } from '../helpers/files';
import { exportSheet } from '../convert/exportHelpers';
import type { Cell } from '../convert/helpers';

const CTX = { decimalComma: false, date1904: false };
const TAXA = ['Abra alba', 'Nucula nitidosa'];
/** A long sheet: the given code columns first (each with its own values), then position, species and count. */
function sheetOf(codes: string[]) {
  const header = [...codes, 'Latitude', 'Longitude', 'Species', 'Count'];
  const rows: Cell[][] = Array.from({ length: 8 }, (_, i) => [...codes.map((_c, k) => `C${k}-${Math.floor(i / (2 + k))}`), 54.1 + Math.floor(i / 2) / 10, 7.2, TAXA[i % 2], 3 + i]);
  return { header, rows };
}
const check = (codes: string[]) => {
  const { header, rows } = sheetOf(codes);
  return Object.fromEntries(proposeColumns(rawSheet(header, rows), CTX).map((p) => [p.header, p]));
};
const convert = (codes: string[]) => {
  const { header, rows } = sheetOf(codes);
  return Object.fromEntries(proposeConvertColumns(rawSheet(header, rows), CTX).map((p) => [p.header, p]));
};
const codeKinds = (r: Record<string, { role: { kind: string } }>) => Object.keys(r).filter((h) => r[h].role.kind === 'sampleId');

describe('sample-named columns that tie', () => {
  it('Sample + Sample ID: none on /check and on /convert, each with the reason', () => {
    for (const r of [check(['Sample', 'Sample ID']), convert(['Sample', 'Sample ID'])]) {
      expect(codeKinds(r)).toEqual([]);
      expect(r.Sample.reasonCode).toBe('sample-ambiguous');
      expect(r['Sample ID'].reasonCode).toBe('sample-ambiguous');
    }
  });
  it('Sample + Sample ID blocks the export on the missing sample code', async () => {
    const { header, rows } = sheetOf(['Sample', 'Sample ID']);
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, fullList: true });
    expect([...e.result.blocking, ...e.findings].map((f) => f.ruleId)).toContain('CONV-SAMPLE-CODE-MISSING');
  });
  it('three tied columns: none, the reason counts three; a lower-tier column beside the tie says it ties', () => {
    const r = check(['Sample', 'Sample ID', 'Sample No']);
    expect(codeKinds(r)).toEqual([]);
    for (const h of ['Sample', 'Sample ID', 'Sample No']) expect(r[h].reasonCode, h).toBe('sample-ambiguous-few');
    expect(convert(['Sample', 'Sample ID', 'Sample No'])['Sample No'].role.kind).toBe('ignore');
    const w = check(['Sample', 'Sample ID', 'SampleNo']);
    expect(codeKinds(w)).toEqual([]);
    expect(w.Sample.reasonCode).toBe('sample-ambiguous');
    expect(w.SampleNo.reasonCode).toBe('sample-ambiguous-other');
  });
  it('the other tier-1 names keep the first-column rule, as on production', () => {
    for (const mk of [check, convert]) {
      expect(codeKinds(mk(['Sample', 'Specimen']))).toEqual(['Sample']);
      expect(codeKinds(mk(['ID', 'Sample']))).toEqual(['ID']);
      expect(codeKinds(mk(['Sample', 'Core']))).toEqual(['Sample']);
    }
    expect(codeKinds(check(['Rdzeń', 'Próbka']))).toEqual(['Rdzeń']);
    expect(codeKinds(check(['Kern', 'Probennummer']))).toEqual(['Kern']);
  });
  it('Sample + Specimen exports without the missing-code block', async () => {
    const { header, rows } = sheetOf(['Sample', 'Specimen']);
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, fullList: true });
    expect([...e.result.blocking, ...e.findings].map((f) => f.ruleId)).not.toContain('CONV-SAMPLE-CODE-MISSING');
  });
  it('eventID is outside the tie: it is the sample code beside SampleNo, in either order', () => {
    expect(codeKinds(check(['eventID', 'SampleNo']))).toEqual(['eventID']);
    expect(codeKinds(check(['SampleNo', 'eventID']))).toEqual(['eventID']);
    expect(check(['SampleNo', 'eventID']).SampleNo.reasonCode).toBe('other-sample');
  });
});

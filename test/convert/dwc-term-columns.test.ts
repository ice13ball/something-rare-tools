// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { exportSheet, objects, readBack } from './exportHelpers';
import { L1_HEADER, L1_ROWS, W1_HEADER, W1_QUANTITY, W1_ROWS, fileOf } from './helpers';
import type { Cell } from './helpers';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { DWC_TERM_LIST } from '../../src/core/convert/dwcTermList';
import { CLOSED_TERMS, dwcTermUri, openTermOf } from '../../src/core/convert/dwcTermColumns';
import type { ColumnRole } from '../../src/core/types';
import { termOf } from '../../src/core/convert/dwcTerms';
import { ROLE_TERMS } from '../../src/app/roleTerms';

// invented data throughout
const withCols = (extra: string[], vals: Cell[][]): { header: string[]; rows: Cell[][] } => ({
  header: [...W1_HEADER, ...extra],
  rows: W1_ROWS.map((r, i) => [...r, ...vals[i]]),
});
const run = async (extra: string[], vals: Cell[][]) => {
  const { header, rows } = withCols(extra, vals);
  return exportSheet(header, rows, { quantity: W1_QUANTITY });
};
const roleOf = (extra: string): ColumnRole => {
  const { header, rows } = withCols([extra], [['v'], ['v'], ['v']]);
  const f = fileOf(header, rows);
  return proposeConvertMapping(f.sheets[0], { decimalComma: false, date1904: false }).columns.at(-1)!.role;
};

describe('term list and closed terms', () => {
  it('every listed name passes termOf', () => {
    for (const t of DWC_TERM_LIST) expect(termOf(t.name), t.name).toBeDefined();
    expect(DWC_TERM_LIST.length).toBeGreaterThan(40);
  });
  it('every non-eMoF term of ROLE_TERMS is closed', () => {
    const own = Object.values(ROLE_TERMS).filter((r) => r.emof !== true).flatMap((r) => r.terms);
    expect(own.length).toBeGreaterThan(10);
    for (const t of own) {
      const info = termOf(t);
      if (info && info.level !== 'emof') expect(CLOSED_TERMS.has(info.name), t).toBe(true);
    }
  });
});

describe('proposal', () => {
  it('gives an open term header the role, with prefix and case variants', () => {
    // a plain word such as Habitat stays with the older rules (stated.ts: a term only beside two other exact terms)
    expect(roleOf('habitat').kind).toBe('ignore');
    for (const h of ['dwc:habitat', 'DWC:Habitat']) {
      expect(roleOf(h), h).toEqual({ kind: 'dwcTerm', term: 'habitat' });
    }
  });
  it('keeps the old role of a closed term header', () => {
    expect(roleOf('dwc:decimalLatitude')).not.toEqual(expect.objectContaining({ kind: 'dwcTerm' }));
  });
  it('is never made from values', () => {
    expect(roleOf('Notes')).not.toEqual(expect.objectContaining({ kind: 'dwcTerm' }));
  });
});

describe('export', () => {
  it('writes an occurrence-level term on each occurrence of the row, with the meta.xml field', async () => {
    const e = await run(['recordedBy'], [['Ada'], ['Bob'], [null]]);
    expect(e.files.length).toBeGreaterThan(0);
    const rb = await readBack(e.zip);
    const occ = objects(rb.tables['occurrence.txt']);
    expect(occ.every((o) => 'recordedBy' in o)).toBe(true);
    expect(occ.map((o) => o.recordedBy).filter(Boolean).length).toBeGreaterThan(0);
    expect(rb.meta).toContain(dwcTermUri('recordedBy'));
    expect(e.findings.filter((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED' && String(f.field) === 'recordedBy')).toEqual([]);
  });
  it('writes an event-level term in the Event table when the rows of an event agree', async () => {
    const e = await run(['dwc:habitat'], [['sand'], ['sand'], ['mud']]);
    const rb = await readBack(e.zip);
    const ev = objects(rb.tables['event.txt']);
    expect(ev.map((x) => x.habitat).sort()).toEqual(expect.arrayContaining(['mud', 'sand']));
    expect(e.findings.some((f) => f.ruleId === 'CONV-DWC-TERM-PER-ROW')).toBe(false);
  });
  it('moves the term to the occurrences when the rows of one event differ', async () => {
    // the long sheet L1: two rows are the one event E1
    const rows = L1_ROWS.map((r, i) => [...r, ['sand', 'mud', 'mud'][i]]);
    const e = await exportSheet([...L1_HEADER, 'dwc:habitat'], rows, { quantity: { kind: 'count' } });
    const rb = await readBack(e.zip);
    expect(rb.tables['occurrence.txt'].header).toContain('habitat');
    expect(rb.tables['event.txt'].header).not.toContain('habitat');
    const f = e.findings.find((x) => x.ruleId === 'CONV-DWC-TERM-PER-ROW');
    expect(f?.severity).toBe('info');
  });
  it('joins remarks to the generated text and counts a replaced value', async () => {
    const e = await run(['occurrenceStatus', 'occurrenceRemarks'], [['absent', 'r1'], [null, 'r2'], [null, null]]);
    const rb = await readBack(e.zip);
    const occ = objects(rb.tables['occurrence.txt']);
    expect(occ.some((o) => o.occurrenceStatus === 'absent')).toBe(true);
    expect(occ.some((o) => (o.occurrenceRemarks ?? '').includes('; r1') || (o.occurrenceRemarks ?? '') === 'r1')).toBe(true);
    expect(e.findings.some((f) => f.ruleId === 'CONV-DWC-TERM-REPLACES')).toBe(true);
  });
  it('writes a non-standard basisOfRecord as given and warns', async () => {
    const e = await run(['basisOfRecord'], [['observed'], ['HUMANOBSERVATION'], [null]]);
    const w = e.findings.find((f) => f.ruleId === 'CONV-DWC-TERM-VOCAB');
    expect(w?.severity).toBe('warning');
    expect(String(w?.value)).toContain('observed');
    expect(String(w?.value)).not.toContain('HUMANOBSERVATION');
  });
  it('writes only the first of two columns of one term and says so', async () => {
    const e = await run(['dwc:habitat', 'DWC:Habitat'], [['a', 'b'], ['a', 'b'], ['a', 'b']]);
    expect(e.findings.some((f) => f.ruleId === 'CONV-DWC-TERM-TWICE')).toBe(true);
    const rb = await readBack(e.zip);
    const all = Object.values(rb.tables).flatMap((t) => objects(t)).map((o) => o.habitat).filter(Boolean);
    expect(all).not.toContain('b');
  });
  it('leaves a file with no Darwin Core headers byte-identical', async () => {
    const a = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY });
    const b = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY });
    expect(a.dataset.dwcTerms).toBeUndefined();
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
    expect(a.findings.filter((f) => f.ruleId.startsWith('CONV-DWC-TERM'))).toEqual([]);
  });
  it('the ledger has no unexplained cell and the term column is not listed as not exported', async () => {
    const e = await run(['dwc:habitat', 'recordedBy'], [['sand', 'Ada'], ['sand', null], ['mud', 'Bob']]);
    for (const l of e.result.ledger) {
      expect(l.balanced).toBe(true);
      expect(l.rows.unexplained).toBe(0);
      expect(l.cells?.unexplained ?? 0).toBe(0);
      expect(l.columns.filter((c) => (c.header === 'dwc:habitat' || c.header === 'recordedBy') && c.to === 'not-written')).toEqual([]);
    }
    const ne = e.findings.find((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED');
    expect(`${ne?.value ?? ''} ${ne?.field ?? ''}`).not.toMatch(/habitat|recordedBy/);
  });
});

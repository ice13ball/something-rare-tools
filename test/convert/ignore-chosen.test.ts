// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Who chose an ignore (round 4, spec section 7): a column the person set to ignore is named by CONV-COLUMN-IGNORED (shown); a column the converter proposed as ignore and the person did not touch is
// named by CONV-COLUMN-IGNORED-PROPOSED (accepted once). The worker tells the converter which columns are the person's (`ignoreChosen`), from its own proposals and never from a flag of the page.
// Every value is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertRequestBody } from '../../src/worker/convert.protocol';
import type { InputFile } from '../../src/worker/protocol';
import { fileOf, sheetInput, type Cell } from './helpers';
import { csvOf } from '../app/convertHelpers';

const HEADER = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Notes', 'Cast'];
const ROWS: Cell[][] = [
  ['a', '2020-01-01', 55.5, 2.5, 'Calanus finmarchicus', 4, 1.5, 1],
  ['b', '2020-01-02', 56.5, 3.5, 'Oithona similis', 6, 2.5, 2],
  ['c', '2020-01-03', 57.5, 4.5, 'Pseudocalanus sp.', 8, 3.5, 3],
];
const ignore = { kind: 'ignore' } as const;
const named = (findings: readonly { ruleId: string; params: Record<string, unknown> }[], id: string): string[] => findings.filter((f) => f.ruleId === id).map((f) => String(f.params.columns));

describe('the core: who set the ignore', () => {
  const run = (extra: { ignoreChosen?: number[] }) => {
    const sin = sheetInput(fileOf(HEADER, ROWS), { quantity: { kind: 'count' }, edit: { Notes: ignore, Cast: ignore }, ...extra });
    return convert({ sheets: [sin], approvedSplits: {} }).findings;
  };

  it('the column the person set is CONV-COLUMN-IGNORED, the one the converter proposed is CONV-COLUMN-IGNORED-PROPOSED', () => {
    const f = run({ ignoreChosen: [6] });
    expect(named(f, 'CONV-COLUMN-IGNORED')).toEqual(['Notes']);
    expect(named(f, 'CONV-COLUMN-IGNORED-PROPOSED')).toEqual(['Cast']);
  });

  it('with no list every ignore is the converter\'s: only the PROPOSED finding, with both columns', () => {
    const f = run({});
    expect(named(f, 'CONV-COLUMN-IGNORED')).toEqual([]);
    expect(named(f, 'CONV-COLUMN-IGNORED-PROPOSED')).toEqual(['Notes, Cast']);
  });

  it('the proposed one needs an acceptance and the person\'s one does not', () => {
    const f = run({ ignoreChosen: [6] });
    expect(judge(f).acceptRules).toContain('CONV-COLUMN-IGNORED-PROPOSED');
    expect(judge(f).acceptRules).not.toContain('CONV-COLUMN-IGNORED');
    expect(judge(run({ ignoreChosen: [6, 7] })).acceptRules).not.toContain('CONV-COLUMN-IGNORED-PROPOSED');
  });

  it('an empty-header column holding data: the person\'s own ignore leaves CONV-COLUMN-NOT-EXPORTED for CONV-COLUMN-IGNORED, the proposed one stays in CONV-COLUMN-NOT-EXPORTED', () => {
    const header = [...HEADER.slice(0, 6), ''];
    const rows = ROWS.map((r) => [...r.slice(0, 6), 'x']);
    const go = (extra: { ignoreChosen?: number[] }) => convert({ sheets: [sheetInput(fileOf(header, rows), { quantity: { kind: 'count' }, ...extra })], approvedSplits: {} }).findings;
    const mine = go({ ignoreChosen: [6] });
    expect(named(mine, 'CONV-COLUMN-IGNORED')).toEqual(['[G]']);
    expect(named(mine, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    const proposed = go({});
    expect(named(proposed, 'CONV-COLUMN-IGNORED')).toEqual([]);
    expect(named(proposed, 'CONV-COLUMN-NOT-EXPORTED')).toEqual(['[G]']);
  });
});

describe('a second quantity column', () => {
  const header = ['Sample', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Biomass [g]'];
  const rows: Cell[][] = ROWS.map((r) => [...r.slice(0, 6), 2.5]);
  const go = (extra: { ignoreChosen?: number[] }) => convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' }, edit: { 'Biomass [g]': ignore }, ...extra })], approvedSplits: {} }).findings;

  it('set to ignore by the person it is named by CONV-COLUMN-IGNORED and needs no acceptance; proposed it stays in CONV-COLUMN-NOT-EXPORTED', () => {
    const mine = go({ ignoreChosen: [6] });
    expect(named(mine, 'CONV-COLUMN-IGNORED')).toEqual(['Biomass [g]']);
    expect(named(mine, 'CONV-COLUMN-NOT-EXPORTED')).toEqual([]);
    const proposed = go({});
    expect(named(proposed, 'CONV-COLUMN-IGNORED')).toEqual([]);
    expect(named(proposed, 'CONV-COLUMN-NOT-EXPORTED')).toEqual(['Biomass [g]']);
  });
});

describe('a column named by a more specific finding is named once', () => {
  it('a year beside the date is in CONV-COLUMN-YEAR-IGNORED and not again in CONV-COLUMN-IGNORED-PROPOSED', () => {
    const header = ['Sample', 'Year', 'Date', 'Latitude', 'Longitude', 'Taxon', 'Count', 'Cast'];
    const rows: Cell[][] = ROWS.map((r, i) => [r[0], 2020, `2020-0${i + 1}-01`, r[2], r[3], r[4], r[5], i + 1]);
    const f = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' } })], approvedSplits: {} }).findings;
    expect(named(f, 'CONV-COLUMN-YEAR-IGNORED')).toEqual(['Year']);
    expect(named(f, 'CONV-COLUMN-IGNORED-PROPOSED').join(',')).not.toContain('Year');
  });
});

describe('the worker: ignoreChosen comes from its own proposals', () => {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const file = (name: string, text: string): InputFile => ({ name, bytes: enc(text), source: 'dropped' });
  const CSV = csvOf(HEADER, ROWS);

  async function convertWith(setIgnore: string[], more: Partial<ConvertRequestBody['sheets'][0]> = {}, withCompanion = false) {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('counts.csv', CSV), ...(withCompanion ? [file('run.sidecar.csv', writeConvertSidecar({ fullList: false }))] : [])]);
    const f = p.files[0];
    const proposed = (h: string) => f.proposals[f.sheets[0].name].find((x) => x.header === h)?.role.kind;
    const mapping = { ...f.mappings[0], columns: f.mappings[0].columns.map((c) => (setIgnore.includes(c.header) ? { ...c, role: ignore } : c)) };
    const v = await e.convert({ sheets: [{ fileId: f.fileId, sheet: f.sheets[0].name, mapping, shape: 'long', quantity: { kind: 'count' }, ...more }], options: {}, approvedSplits: {} });
    return { v, proposed };
  }

  it('keeps the proposed ignore of Cast and sets Notes (proposed another role) to ignore: Notes is the person\'s, Cast the proposal', async () => {
    const { v, proposed } = await convertWith(['Notes', 'Cast']);
    expect(proposed('Notes')).not.toBe('ignore');
    expect(proposed('Cast')).toBe('ignore');
    expect(named(v.findings, 'CONV-COLUMN-IGNORED')).toEqual(['Notes']);
    expect(named(v.findings, 'CONV-COLUMN-IGNORED-PROPOSED')).toEqual(['Cast']);
  });

  it('a page flag cannot make a proposed ignore the person\'s: a request with Cast alone set keeps it the proposal', async () => {
    const { v } = await convertWith(['Cast'], { handSet: [7], ignoreChosen: [7] } as never);
    expect(named(v.findings, 'CONV-COLUMN-IGNORED')).toEqual([]);
    expect(named(v.findings, 'CONV-COLUMN-IGNORED-PROPOSED')).toEqual(['Cast']);
  });

  it('the same request in a drop that also holds a companion file gives the same answer (a companion keeps no column roles, so the person\'s ignore still differs from the proposal)', async () => {
    const { v } = await convertWith(['Notes', 'Cast'], {}, true);
    expect(named(v.findings, 'CONV-COLUMN-IGNORED')).toEqual(['Notes']);
    expect(named(v.findings, 'CONV-COLUMN-IGNORED-PROPOSED')).toEqual(['Cast']);
  });

  it('a taxon candidate the page sent as ignore because it was never confirmed is the proposal, not the person\'s', async () => {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('counts.csv', CSV)]);
    const f = p.files[0];
    const mapping = { ...f.mappings[0], columns: f.mappings[0].columns.map((c) => (c.header === 'Cast' ? { ...c, role: ignore } : c)) };
    const v = await e.convert({ sheets: [{ fileId: f.fileId, sheet: f.sheets[0].name, mapping, shape: 'long', quantity: { kind: 'count' }, unconfirmedTaxa: [7] }], options: {}, approvedSplits: {} });
    expect(named(v.findings, 'CONV-COLUMN-IGNORED')).toEqual([]);
  });
});

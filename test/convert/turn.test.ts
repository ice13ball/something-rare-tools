// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// "The samples are the columns" (core/convert/turn.ts): the person declares which column names the rows and which columns are not samples; the sheet is turned before the roles are proposed, every
// finding points back at the source, a turned description sheet is shown and not joined. Invented sheets only (Taxa, Samples).
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertSheetInput } from '../../src/core/convert/build';
import { notUsedLedger } from '../../src/core/convert/ledger';
import { notWrittenRows } from '../../src/core/convert/notWritten';
import { ownRecordsEligible } from '../../src/core/convert/ownRecords';
import { joinInputs, proposeSampleJoins } from '../../src/core/convert/sampleJoin';
import type { SampleJoinRequestCore } from '../../src/core/convert/sampleJoin';
import { TURNED_LINE_BASE, turnConvertFile, turnSheet } from '../../src/core/convert/turn';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { Finding, ParsedFile } from '../../src/core/types';
import { xlsxFile } from '../helpers/files';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const TAXA_HEADER = ['Taxon', 'S1', 'S2', 'Total'];
const TAXA_ROWS = (): Cell[][] => [
  ['Calanus finmarchicus', 4, 0, 4],
  ['Oithona similis', 1, 2, 3],
];
const SAMPLES_HEADER = ['Sample', 'Date', 'Latitude', 'Longitude'];
const SAMPLES_ROWS = (): Cell[][] => [
  ['S1', '2023-04-05', 55.1, 2.1],
  ['S2', '2023-04-06', 55.2, 2.2],
];
const DECL = { nameColumn: 0, notSamples: [3] };
const rules = (fs: readonly Finding[], id: string): Finding[] => fs.filter((f) => f.ruleId === id);

/** Taxa (turned) and Samples as inputs [Taxa, Samples]. */
function book(taxaRows: Cell[][] = TAXA_ROWS(), samplesRows: Cell[][] = SAMPLES_ROWS(), taxaHeader: Cell[] = TAXA_HEADER, decl = DECL): { file: ParsedFile; inputs: ConvertSheetInput[] } {
  const raw = xlsxFile('book.xlsx', { Taxa: [taxaHeader, ...taxaRows], Samples: [SAMPLES_HEADER, ...samplesRows] });
  const file = turnConvertFile(raw, { Taxa: decl });
  const of = (name: string): ParsedFile => ({ ...file, sheets: file.sheets.filter((s) => s.name === name) });
  return { file, inputs: [sheetInput(of('Taxa'), { shape: 'wide', quantity: { kind: 'count' } }), sheetInput(of('Samples'))] };
}
const JOIN: SampleJoinRequestCore = { results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] };
const joined = (inputs: ConvertSheetInput[]) => {
  const out = joinInputs(inputs, [JOIN], []);
  return { out, result: convert({ sheets: out.sheets }) };
};

describe('turnSheet', () => {
  it('makes one row per sample and one column per named row, cells as written', () => {
    const raw = fileOf(TAXA_HEADER, TAXA_ROWS(), 'Taxa').sheets[0];
    const t = turnSheet(raw, DECL);
    expect(t.header).toEqual(['Sample', 'Calanus finmarchicus', 'Oithona similis']);
    expect(t.rows.map((r) => r.cells)).toEqual([['S1', 4, 1], ['S2', 0, 2]]);
    expect(t.turn?.labelColumns).toContain(3);
    expect(t.turn?.sampleColumn[t.rows[0].line]).toBe(1);
    expect(t.rows[0].line).toBe(TURNED_LINE_BASE + 1);
    expect(t.turn?.nameLine).toEqual({ 1: 2, 2: 3 });
    expect(t.turn?.source).toBe(raw);
  });

  it('with headerDates the header gives the sample code and the date, as written', () => {
    const raw = fileOf(['Taxon', '2023-04-05', '2023-04-06'], [['Calanus finmarchicus', 4, 0], ['Oithona similis', 1, 2]], 'Taxa').sheets[0];
    const t = turnSheet(raw, { nameColumn: 0, notSamples: [], headerDates: true });
    expect(t.header).toEqual(['Sample', 'Date', 'Calanus finmarchicus', 'Oithona similis']);
    expect(t.rows.map((r) => r.cells)).toEqual([['2023-04-05', '2023-04-05', 4, 1], ['2023-04-06', '2023-04-06', 0, 2]]);
    expect(t.turn?.nameLine).toEqual({ 2: 2, 3: 3 });
  });

  it('never renames a row name: a repeated name, or one equal to a column the turn adds, is not turned and is listed', () => {
    const raw = fileOf(['Taxon', 'S1'], [['Calanus', 1], ['calanus ', 2], ['Sample', 3], ['Oithona', 4]], 'Taxa').sheets[0];
    const t = turnSheet(raw, { nameColumn: 0, notSamples: [] });
    expect(t.header).toEqual(['Sample', 'Oithona']);
    expect(t.turn?.repeatedNames).toEqual([{ name: 'Calanus', lines: [2, 3] }, { name: 'Sample', lines: [4] }]);
  });
});

describe('a turned sheet is converted', () => {
  it('writes the events and occurrences of the spec and balances the ledger in the lines of the source', () => {
    const { inputs } = book();
    const { out, result } = joined(inputs);
    expect(out.sheets).toHaveLength(1);
    const ev = (id: string) => result.events.find((e) => e.id === id);
    expect([ev('S1')?.eventDate, ev('S1')?.lat, ev('S2')?.eventDate, ev('S2')?.lat]).toEqual(['2023-04-05', 55.1, '2023-04-06', 55.2]);
    expect(result.occurrences.map((o) => o.quantityText)).toEqual(['4', '1', '2']);
    expect(rules(result.findings, 'CONV-SHEET-TURNED')).toHaveLength(1);
    expect(rules(result.findings, 'CONV-SHEET-TURNED')[0].params).toMatchObject({ rows: 2, samples: 2 });
    expect(result.blocking).toEqual([]);
    const ledger = result.ledger.find((l) => l.sheet === 'Taxa')!;
    expect(ledger.rows.source).toBe(2);
    expect(ledger.rows.unexplained).toBe(0);
    expect(ledger.balanced).toBe(true);
    // the Total cells are listed, not written
    expect(ledger.lines.filter((l) => (l.lostCells ?? []).some((c) => c.reason === 'turned-label' && c.index === 3)).map((l) => l.line)).toEqual([2, 3]);
  });

  it('without a join: the same sheet alone reads the roles on the turned columns', () => {
    const { inputs } = book();
    const r = convert({ sheets: [inputs[0]] });
    expect(r.occurrences).toHaveLength(3);
    expect(r.ledger[0].rows.source).toBe(2);
  });

  it('a bad count is named at the line of its row name and the column of its sample (Review Focus 4)', () => {
    const { inputs } = book([['Calanus finmarchicus', 4, 0, 4], ['Oithona similis', 1, 2.5, 3]]);
    const { result } = joined(inputs);
    const f = rules(result.findings, 'CONV-COUNT-NOT-INTEGER');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
    expect(f[0].params.turnedColumn).toBe('C');
  });

  it('two bad cells of one taxon row name every sample column (F4)', () => {
    const { inputs } = book([['Calanus finmarchicus', 4, 0, 4], ['Oithona similis', 1.5, 2.5, 3]]);
    const { result } = joined(inputs);
    const f = rules(result.findings, 'CONV-COUNT-NOT-INTEGER');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3]);
    expect(f[0].params.turnedColumn).toBe('B, C');
  });

  it('two columns with the same header are not turned and block; a blank header with values the same', () => {
    const rep = book(TAXA_ROWS(), SAMPLES_ROWS(), ['Taxon', 'S1', 'S1 ', 'Total']);
    const r1 = convert({ sheets: [rep.inputs[0]] });
    expect(rules(r1.findings, 'CONV-TURN-HEADER-REPEATED')).toHaveLength(1);
    expect(rules(r1.findings, 'CONV-TURN-HEADER-REPEATED')[0].lines).toEqual([1]);
    expect(r1.ok).toBe(false);
    const blank = book(TAXA_ROWS(), SAMPLES_ROWS(), ['Taxon', 'S1', '', 'Total']);
    const r2 = convert({ sheets: [blank.inputs[0]] });
    expect(rules(r2.findings, 'CONV-TURN-HEADER-BLANK')).toHaveLength(1);
    expect(r2.ok).toBe(false);
  });

  it('a row with values and no name makes no column; it is asked about, and leaving it out lists it and lifts the block', () => {
    const rows: Cell[][] = [...TAXA_ROWS(), [null, 7, 8, 15]];
    const { inputs } = book(rows);
    const r = convert({ sheets: [inputs[0]] });
    expect(rules(r.findings, 'CONV-TURN-NAME-BLANK')).toHaveLength(1);
    expect(rules(r.findings, 'CONV-TURN-NAME-BLANK')[0].lines).toEqual([4]);
    const asked = rules(r.findings, 'CONV-ROW-NOT-UNDERSTOOD');
    expect(asked).toHaveLength(1);
    expect(asked[0].params.reason).toBe('turn-no-name');
    expect(r.ledger[0].lines.find((l) => l.line === 4)?.fate).toBe('turn-no-name');
    const left = convert({ sheets: [{ ...inputs[0], leaveOut: ['turn-no-name'] }] });
    expect(rules(left.findings, 'CONV-TURN-NAME-BLANK')).toEqual([]);
    expect(rules(left.findings, 'CONV-ROW-NOT-UNDERSTOOD')).toEqual([]);
    expect(rules(left.findings, 'CONV-ROW-LEFT-OUT')).toHaveLength(1);
  });

  it('an undated sample on a turned sheet has the turned text, names its column, and cannot be left out (F17)', () => {
    const { inputs } = book(TAXA_ROWS(), [['S1', '2023-04-05', 55.1, 2.1], ['S2', null, 55.2, 2.2]]);
    const { result } = joined(inputs);
    const f = rules(result.findings, 'CONV-EVENT-DATE-MISSING');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ turned: 'yes', turnedColumn: 'C' });
    expect(f[0].lines).toEqual([1]);
    expect(renderConvertPlain(f[0], 'en')).not.toMatch(/leave/i);
    const again = joined(inputs.map((i) => ({ ...i, leaveOut: [{ reason: 'no-event-date', count: 1 }] })));
    expect(rules(again.result.findings, 'CONV-EVENT-DATE-MISSING')).toHaveLength(1);
    expect(again.result.events.some((e) => e.id === 'S2')).toBe(true);
    expect(again.result.leftOut).toEqual([]);
  });

  it('a repeated row name blocks, names the source rows, and the rows can be left out and listed', () => {
    const { inputs } = book([['Calanus finmarchicus', 4, 0, 4], ['Calanus finmarchicus', 1, 2, 3], ['Oithona similis', 1, 1, 2]]);
    const r = convert({ sheets: [inputs[0]] });
    const f = rules(r.findings, 'CONV-TURN-NAME-REPEATED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2, 3]);
    expect(f[0].params).toMatchObject({ name: 'Calanus finmarchicus', count: 2 });
    expect(r.ok).toBe(false);
    expect(r.occurrences.every((o) => !/\(2\)/.test(o.scientificName ?? ''))).toBe(true);
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) expect(renderConvertPlain(f[0], lang)).toContain('Calanus finmarchicus');
    expect(r.ledger[0].lines.filter((l) => l.fate === 'turn-name-repeated').map((l) => l.line)).toEqual([2, 3]);
    const left = convert({ sheets: [{ ...inputs[0], leaveOut: ['turn-name-repeated'] }] });
    expect(rules(left.findings, 'CONV-TURN-NAME-REPEATED')).toEqual([]);
    expect(rules(left.findings, 'CONV-ROW-LEFT-OUT')).toHaveLength(1);
  });

  it('a turned sheet that is not used counts source rows, not samples', () => {
    const { file } = book();
    const l = notUsedLedger('book.xlsx', file.sheets.find((s) => s.name === 'Taxa')!);
    expect(l.rows.source).toBe(2);
  });

  it('the join findings of a turned results sheet name the header line and the sample column (NO-MATCH, CONFLICT)', () => {
    const nomatch = book(TAXA_ROWS(), [['X1', '2023-04-05', 55.1, 2.1]]);
    const r = joined(nomatch.inputs).result;
    const nm = rules(r.findings, 'CONV-JOIN-NO-MATCH');
    expect(nm).toHaveLength(1);
    expect(nm[0].lines?.every((l) => l < TURNED_LINE_BASE)).toBe(true);
    expect(nm[0].params.turnedColumn).toBe('B, C');
    const conflict = book([...TAXA_ROWS(), ['Date', '2023-04-07', '2023-04-06', null]]);
    const c = joined(conflict.inputs).result;
    const cf = rules(c.findings, 'CONV-JOIN-CONFLICT');
    expect(cf).toHaveLength(1);
    expect(cf[0].lines?.every((l) => l < TURNED_LINE_BASE)).toBe(true);
    expect(cf[0].params.turnedColumn).toBe('B');
  });

  it('a value that lost a join conflict is listed at its source line and column', () => {
    const { inputs } = book([...TAXA_ROWS(), ['Date', '2023-04-07', '2023-04-06', null]]);
    const out = joinInputs(inputs, [{ ...JOIN, conflicts: [{ group: 'date', take: 'description', count: 1, exceptions: [] }] }], []);
    const r = convert({ sheets: out.sheets });
    const taxa = r.ledger.find((l) => l.sheet === 'Taxa')!;
    expect(taxa.lines.every((l) => l.line < TURNED_LINE_BASE)).toBe(true);
    const lost = taxa.lines.find((l) => (l.lostCells ?? []).some((c) => c.reason === 'join-not-chosen'));
    expect(lost?.line).toBe(4);
    expect(lost?.lostCells?.find((c) => c.reason === 'join-not-chosen')?.index).toBe(1);
    const listed = [...notWrittenRows(r.ledger, out.sheets, r.leftOut)].find((x) => x.line === 4 && x.kind === 'lost-cells');
    expect(listed?.detail).toContain('join-not-chosen');
    expect(listed?.cells[0]).toBe('Date');
  });

  it('own records are not offered for a turned sheet', () => {
    const { file } = book();
    const turned = file.sheets.find((s) => s.name === 'Taxa')!;
    const sin = { shape: 'long' as const, mapping: { columns: [{ index: 0, header: 'Taxon', role: { kind: 'taxon' } }] } } as never;
    expect(ownRecordsEligible(sin, {})).toBe(true);
    expect(ownRecordsEligible(sin, turned)).toBe(false);
  });
});

describe('a turned description sheet is shown and not joined (B2, F5)', () => {
  // the variables are in the rows of the description: Variable | S1 | S2
  const desc = () => {
    const raw = xlsxFile('book.xlsx', {
      Counts: [['Sample', 'Taxon', 'Count'], ['S1', 'Calanus finmarchicus', 4], ['S2', 'Oithona similis', 2]],
      Samples: [['Variable', 'S1', 'S2'], ['Date', '2023-04-05', '2023-04-06'], ['Latitude', 55.1, 55.2], ['Longitude', 2.1, 2.2]],
    });
    const file = turnConvertFile(raw, { Samples: { nameColumn: 0, notSamples: [] } });
    const of = (name: string): ParsedFile => ({ ...file, sheets: file.sheets.filter((s) => s.name === name) });
    const results = sheetInput(of('Counts'), { shape: 'long', quantity: { kind: 'count' }, edit: { Taxon: { kind: 'taxon' }, Count: { kind: 'quantity' } } } as never);
    return [results, sheetInput(of('Samples'))];
  };

  it('is proposed long, with the turned wording', () => {
    const inputs = desc();
    const [p] = proposeSampleJoins(inputs, []);
    expect(p?.long).toBe(true);
    const out = joinInputs(inputs, [], []);
    const f = rules(out.findings, 'CONV-JOIN-DESCRIPTION-LONG');
    expect(f).toHaveLength(1);
    expect(f[0].params.turned).toBe('yes');
    expect(renderConvertPlain(f[0], 'en')).toMatch(/turned/);
  });

  it('a join declared on it with no proposal is dropped, and the proposal shows as long', () => {
    const inputs = desc();
    const out = joinInputs(inputs, [JOIN], []);
    expect(out.sheets).toHaveLength(2);
    expect(rules(out.findings, 'CONV-JOIN-DESCRIPTION-LONG')).toHaveLength(1);
    expect(rules(out.findings, 'CONV-JOIN-PROPOSED')).toEqual([]);
  });
});

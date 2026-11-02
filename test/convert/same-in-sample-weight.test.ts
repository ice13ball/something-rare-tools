// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A weight (or a density of 1) repeated on stage rows with their own counts; identical rows with a count of 1; the draft sentence. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge } from '../../src/core/convert/policy';
import { UI } from '../../src/core/i18n/ui';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import type { ColumnRole } from '../../src/core/types';
import type { Cell } from './helpers';
import { fileOf, sheetInput } from './helpers';

const HEADER = ['sample', 'Date', 'Latitude', 'Longitude', 'Species', 'Stage', 'Quantity', 'Weight', 'record'];
const EDIT: Record<string, ColumnRole> = {
  sample: { kind: 'sampleId' },
  Species: { kind: 'taxon' },
  Stage: { kind: 'ignore' },
  Quantity: { kind: 'quantity' },
  Weight: { kind: 'biomass', basis: 'wet' },
  record: { kind: 'occurrenceId' },
};
const run = (rows: Cell[][], quantity: { kind: 'count' } | { kind: 'density'; unit: string } = { kind: 'count' }) => convert({ sheets: [sheetInput(fileOf(HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity, edit: EDIT })] });
const ids = (r: ReturnType<typeof run>, rule: string) => r.findings.filter((f) => f.ruleId === rule);
const stages = (samples: number, qty: (s: number, c: number) => number, weight: (s: number) => number): Cell[][] => {
  const rows: Cell[][] = [];
  for (let s = 1; s <= samples; s++) for (let c = 0; c < 3; c++) rows.push([`s${s}`, '2020-06-01', 49.4, 0.2, 'Solea solea', `stage${c}`, qty(s, c), weight(s), `r${rows.length}`]);
  return rows;
};

describe('a weight repeated across stage rows that have their own counts', () => {
  it('is never silent: a must-accept warning with both weight sums, and the counts are untouched', () => {
    const r = run(stages(2, (s, c) => 4 + c * 3 + s, (s) => 100 + s));
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ column: 'Weight', weight: 'yes', groups: 2, records: 6, written: 3 * 101 + 3 * 102, asTotal: 203 });
    expect(judge(r.findings).acceptRules).toContain('CONV-QUANTITY-SAME-IN-SAMPLE');
    for (const lang of LANGS) expect(renderConvertPlain(f[0], lang)).toContain('Weight');
  });

  it('the quantity and the weight both repeat: one warning that gives the sums of both', () => {
    const r = run(stages(1, () => 12, () => 250));
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ alsoColumn: 'Weight', alsoWritten: 750, alsoAsTotal: 250, written: 36, asTotal: 12 });
    for (const lang of LANGS) expect(renderConvertPlain(f[0], lang)).toContain('750');
  });

  it('a density of 1 repeated across stages is not excluded like a count of 1', () => {
    const r = run(stages(1, () => 1, (s) => 100 + s), { kind: 'density', unit: '#/m3' });
    expect(ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')).toHaveLength(1);
    // a count of 1 is a specimen
    expect(ids(run(stages(1, () => 1, (s) => 100 + s)), 'CONV-QUANTITY-SAME-IN-SAMPLE').filter((f) => f.params.weight !== 'yes')).toHaveLength(0);
  });

  it('the sums in the messages are rounded', () => {
    const r = run(stages(2, (s, c) => 4 + c * 3 + s, (s) => 24.1237 + s / 3));
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')[0];
    expect(String(f.params.written).length).toBeLessThanOrEqual(10);
    expect(renderConvertPlain(f, 'en')).not.toMatch(/\d\.\d{4,}/);
  });
});

describe('identical rows with a count of 1', () => {
  const rows = (): Cell[][] => {
    const out: Cell[][] = [];
    for (let s = 1; s <= 6; s++) for (const c of [0, 1]) out.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, 'Solea solea', 'L', 1, 10 + s, `r${out.length}`]);
    return out;
  };

  it('one warning with both sums that does not block, and the identifier advice names both readings', () => {
    const r = run(rows());
    const f = ids(r, 'CONV-ROW-COPIES-SPECIMENS');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ count: 6, withCopies: 12, withoutCopies: 6 });
    expect(ids(r, 'CONV-ROW-COPIES')).toHaveLength(0);
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).not.toContain('CONV-ROW-COPIES-SPECIMENS');
    expect(judge(r.findings).acceptRules).toContain('CONV-ROW-COPIES-SPECIMENS');
  });

  it('without an occurrenceID the duplicate-identifier text does not simply say to tell them apart', () => {
    const noId = rows().map((x) => x.slice(0, 8));
    const header = HEADER.slice(0, 8);
    const r = convert({ sheets: [sheetInput(fileOf(header, noId), { shape: 'long', quantity: { kind: 'count' }, edit: { ...EDIT, record: undefined as never } })] });
    const f = r.findings.find((x) => x.ruleId === 'CONV-ID-DUPLICATE');
    expect(f).toBeDefined();
    expect(renderConvertPlain(f!, 'en')).toMatch(/remove the copies/i);
  });
});

describe('the texts', () => {
  it('the polish button and rule plurals', () => {
    expect(UI.pl['convert.finding.dropCopies']).toContain('{+count:');
  });

  it('the draft sentence is said once, in four languages, and asks for the OBIS node', () => {
    for (const lang of LANGS) {
      const text = UI[lang]['convert.status.text'];
      expect(text, lang).toMatch(/OBIS/);
      expect(text.match(/OBIS/g), lang).toHaveLength(1);
    }
    expect(UI.en['convert.status.text']).not.toMatch(/before you publish.*before you publish/);
    expect(UI.en['convert.status.text']).not.toMatch(/This archive/);
  });
});

describe('the sums in the messages are the sums of the archive (after the choices, without rows that are never written)', () => {
  const written = (r: ReturnType<typeof run>): number => r.occurrences.reduce((n, o) => n + (o.individualCount ?? 0), 0);
  const writtenWeight = (r: ReturnType<typeof run>): number => r.measurements.filter((m) => m.role === 'biomass').reduce((n, m) => n + Number(m.measurementValue), 0);
  const withFlags = (rows: Cell[][], flags: { totalOnce?: boolean; dropCopies?: boolean }) =>
    convert({ sheets: [sheetInput(fileOf(HEADER, rows, 'S', { fileName: 'catch.csv' }), { shape: 'long', quantity: { kind: 'count' }, edit: EDIT, ...flags })] });

  it('specimen copies with "drop the copies": the sums are those of the archive', () => {
    const rows: Cell[][] = [];
    for (let s = 1; s <= 6; s++) for (let c = 0; c < 2; c++) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, 'Solea solea', 'L', 1, 5, `r${rows.length}`]);
    for (let s = 1; s <= 3; s++) for (let c = 0; c < 2; c++) rows.push([`c${s}`, '2020-06-01', 48.4 + s / 100, 0.2, 'Solea solea', 'L', 4, 9, `r${rows.length}`]);
    const r = withFlags(rows, { dropCopies: true });
    const f = ids(r, 'CONV-ROW-COPIES-SPECIMENS');
    expect(f).toHaveLength(1);
    expect(f[0].params.withCopies).toBe(written(r));
    expect(f[0].params.withoutCopies).toBe(written(r) - Number(f[0].params.count));
    expect(written(r)).toBe(6 * 2 + 3 * 4);
  });

  it('a repeated total taken once together with dropped copies: the specimen sums are those of the archive', () => {
    const rows: Cell[][] = [];
    for (let s = 1; s <= 8; s++) for (let c = 0; c < 3; c++) rows.push([`t${s}`, '2020-06-01', 49.4 + s / 100, 0.2, 'Solea solea', `size${c}`, 30 + s, 100 + s, `r${rows.length}`]);
    for (let s = 1; s <= 4; s++) for (let c = 0; c < 2; c++) rows.push([`p${s}`, '2020-06-01', 47.4 + s / 100, 0.2, 'Solea solea', 'L', 1, 5, `r${rows.length}`]);
    for (let s = 1; s <= 2; s++) for (let c = 0; c < 2; c++) rows.push([`q${s}`, '2020-06-01', 46.4 + s / 100, 0.2, 'Solea solea', 'L', 6, 9, `r${rows.length}`]);
    const r = withFlags(rows, { totalOnce: true, dropCopies: true });
    const f = ids(r, 'CONV-ROW-COPIES-SPECIMENS');
    expect(f).toHaveLength(1);
    expect(f[0].params.withCopies).toBe(written(r));
    expect(written(r)).toBe(Array.from({ length: 8 }, (_, i) => 31 + i).reduce((n, v) => n + v, 0) + 4 * 2 + 2 * 6);
  });

  it('a weight on a row whose count is zero (never written) is not in the weight sum', () => {
    const rows: Cell[][] = [];
    for (let s = 1; s <= 2; s++) for (const c of [5, 0, 7]) rows.push([`s${s}`, '2020-06-01', 49.4 + s / 100, 0.2, 'Solea solea', `stage${c}`, c, 100, `r${rows.length}`]);
    const r = run(rows);
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE');
    expect(f).toHaveLength(1);
    expect(f[0].params).toMatchObject({ column: 'Weight', weight: 'yes' });
    expect(f[0].params.written).toBe(writtenWeight(r));
    expect(f[0].params.written).toBe(400);
    expect(f[0].params.records).toBe(4);
  });

  it('the count sums stay exact, and the text does not say "above 1" (a density of 1 is covered)', () => {
    const r = run(stages(2, () => 12, () => 250));
    const f = ids(r, 'CONV-QUANTITY-SAME-IN-SAMPLE')[0];
    expect(f.params.written).toBe(written(r));
    for (const lang of LANGS) expect(renderConvertPlain(f, lang)).not.toMatch(/above 1|powyżej 1|über 1|supérieure à 1/);
  });
});

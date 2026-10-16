// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildReport, formatLines, renderPlain, renderTechnical } from '../src/core/report';
import { makeFinding } from '../src/core/rules/registry';
import type { Lang } from '../src/core/types';

describe('formatLines', () => {
  it('writes compact ranges with an en dash', () => {
    expect(formatLines([17, 18, 19, 20, 21, 263, 264, 265, 266, 267, 268])).toBe('17–21, 263–268');
  });
  it('handles singles, unsorted and duplicated input, and empty input', () => {
    expect(formatLines([5])).toBe('5');
    expect(formatLines([9, 3, 4, 3, 7])).toBe('3–4, 7, 9');
    expect(formatLines([])).toBe('');
    expect(formatLines(undefined)).toBe('');
  });
});

describe('buildReport', () => {
  const err = makeFinding('ROW-RAGGED', { file: 'b.csv', lines: [4], params: { expected: 3, found: 4 } });
  const warn = makeFinding('ROW-NON-NUMERIC', { file: 'a.csv', lines: [8], field: 'DIC', value: 'abc' });
  const info = makeFinding('IN-DATE1904', { file: 'a.xlsx' });

  it('counts findings per severity', () => {
    const r = buildReport([info, warn, err, makeFinding('ROW-RAGGED', { file: 'c.csv', lines: [2] })]);
    expect(r.counts).toEqual({ error: 2, warning: 1, info: 1 });
    expect(r.findings).toHaveLength(4);
  });

  it('has zero counts for an empty list', () => {
    expect(buildReport([])).toMatchObject({ findings: [], counts: { error: 0, warning: 0, info: 0 } });
  });

  it('sorts error, warning, info; then file; then first line', () => {
    const e1 = makeFinding('ROW-RAGGED', { file: 'b.csv', lines: [30] });
    const e2 = makeFinding('ROW-RAGGED', { file: 'b.csv', lines: [4] });
    const e3 = makeFinding('ROW-RAGGED', { file: 'a.csv', lines: [99] });
    const r = buildReport([info, warn, e1, e2, e3]);
    expect(r.findings.map((f) => `${f.severity}:${f.file}:${f.lines?.[0] ?? '-'}`)).toEqual([
      'error:a.csv:99',
      'error:b.csv:4',
      'error:b.csv:30',
      'warning:a.csv:8',
      'info:a.xlsx:-',
    ]);
  });

  it('puts findings without file or line after those with them within a severity', () => {
    const noFile = makeFinding('LIC-MISSING', {});
    const withFile = makeFinding('META-NO-DATES', { file: 'z.xml' });
    const r = buildReport([noFile, withFile]);
    expect(r.findings.map((f) => f.ruleId)).toEqual(['META-NO-DATES', 'LIC-MISSING']);
  });

  it('merges identical findings (same rule, file, sheet, field, value, lines)', () => {
    const a = makeFinding('ROW-NON-NUMERIC', { file: 'a.csv', sheet: 'S', lines: [8, 9], field: 'DIC', value: 'abc', datasetIds: ['d1'] });
    const b = makeFinding('ROW-NON-NUMERIC', { file: 'a.csv', sheet: 'S', lines: [9, 8], field: 'DIC', value: 'abc', datasetIds: ['d2'] });
    const c = makeFinding('ROW-NON-NUMERIC', { file: 'a.csv', sheet: 'S', lines: [8, 9], field: 'DIC', value: 'xyz' });
    const r = buildReport([a, b, c]);
    expect(r.findings).toHaveLength(2);
    const merged = r.findings.find((f) => f.value === 'abc');
    expect(merged?.datasetIds).toEqual(['d1', 'd2']);
    expect(r.counts.warning).toBe(2);
  });

  it('does not mutate its input', () => {
    const input = [info, warn, err];
    const copy = [...input];
    buildReport(input);
    expect(input).toEqual(copy);
  });

  it('lists what the tool does not check, as ui message keys', () => {
    expect(buildReport([]).notChecked).toEqual([
      'notChecked.scientificValidity',
      'notChecked.calibration',
      'notChecked.taxonomy',
      'notChecked.pdfContent',
      'notChecked.unlistedVariables',
    ]);
  });
});

describe('renderPlain', () => {
  const f = makeFinding('ROW-RAGGED', { file: 'a.csv', lines: [17, 18, 19, 263], params: { expected: 28, found: 29 } });

  it('replaces generic fields and params in each language', () => {
    for (const lang of ['pl', 'en', 'de', 'fr'] as Lang[]) {
      const t = renderPlain(f, lang);
      expect(t, lang).toContain('17–19, 263');
      expect(t, lang).toContain('28');
      expect(t, lang).toContain('29');
      expect(t, lang).not.toMatch(/[{}]/);
    }
  });

  it('falls back to English for an unknown language', () => {
    expect(renderPlain(f, 'xx' as Lang)).toBe(renderPlain(f, 'en'));
  });

  it('keeps Polish diacritics', () => {
    expect(renderPlain(makeFinding('LIC-MISSING', {}), 'pl')).toMatch(/licencji/);
    expect(renderPlain(makeFinding('ROW-NON-NUMERIC', { lines: [1], field: 'x', value: 'y' }), 'pl')).toMatch(/[ąęłó]/);
  });

  it('fills threshold placeholders from the rule, never from the caller', () => {
    const t = renderPlain(makeFinding('ROW-LAT-RANGE', { lines: [4], field: 'Lat', value: '91' }), 'en');
    expect(t).toContain('-90');
    expect(t).toContain('90');
  });

  it('leaves a missing param visible instead of hiding it', () => {
    const t = renderPlain(makeFinding('ROW-RAGGED', { lines: [3], params: { expected: 4 } }), 'en');
    expect(t).toContain('{found}');
  });

  it('numbers in params are written as is', () => {
    const t = renderPlain(makeFinding('ROW-DATE-MISSING', { file: 'a.csv', params: { count: 2, percent: 2.5 } }), 'en');
    expect(t).toContain('2');
    expect(t).toContain('2.5');
  });
});

describe('renderTechnical', () => {
  it('renders file, lines, field and value with the rule thresholds', () => {
    const f = makeFinding('ROW-LAT-RANGE', { file: 'a.csv', lines: [4, 5, 9], field: 'Lat', value: '91' });
    const t = renderTechnical(f);
    expect(t).toContain("a.csv:4–5, 9");
    expect(t).toContain('field Lat');
    expect(t).toContain("value '91'");
    expect(t).toContain('-90..90');
  });

  it('is English and independent of the plain text', () => {
    const f = makeFinding('CHEM-RANGE', {
      file: 'a.csv',
      lines: [7],
      field: 'S',
      value: '50',
      params: { variable: 'salinity', min: 2, max: 41, unit: 'psu', count: 1 },
    });
    const t = renderTechnical(f);
    expect(t).toContain('salinity');
    expect(t).toContain('2..41 psu');
  });

  it('works for a finding without file and lines', () => {
    const t = renderTechnical(makeFinding('LIC-MISSING', { file: 'rec' }));
    expect(t).toContain('rec');
    expect(t).not.toMatch(/undefined|NaN/);
  });

  it('throws for a finding whose rule id is unknown', () => {
    expect(() => renderTechnical({ ruleId: 'NOPE', severity: 'info', params: {} })).toThrow(/NOPE/);
  });
});

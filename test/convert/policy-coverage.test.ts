// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COVERED_BY, LISTED_BY, REASON_KIND, SUPERSEDES } from '../../src/core/convert/notWritten';
import type { ExportPolicy } from '../../src/core/types';
import { RULES } from '../../src/core/rules/registry';

/*
 * Round 4 (spec section 7): an outcome that follows from a tool default or a reader decision needs an acceptance (`accept`); only an outcome of the person's own explicit answer is shown without one.
 * This test finds the rules raised where the tool left something out (the ledger's leave-out maps), where it used a default, or where a reader decided, and fails for one of them that is `show`
 * unless it is named below with the reason. It reads the sources, so a new rule at such a place cannot pass unnoticed.
 */

const ROOT = join(__dirname, '..', '..');
const src = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const tsFiles = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

/** Where the extra files raise a finding: `c.add('ID'`, `makeFinding('ID'` or `makeFinding(cond ? 'ID' : 'ID'` (a quoted id straight after the call, or in its first argument's ternary). */
const EMISSION = /(?:\bc\.add|\bmakeFinding)\(\s*(?:[^'()]*\?\s*)?'((?:IN|ROW)-[A-Z0-9-]+)'(?:\s*:\s*'((?:IN|ROW)-[A-Z0-9-]+)')?/g;

/**
 * The ids a reader names, from exactly these places: every quoted `IN-`/`ROW-` id in src/core/parse and src/core/values; the `c.add('ID'` calls of the metadata parser in src/core/dataset.ts; and every
 * emission site (`c.add('ID'` or `makeFinding('ID'`) in src/core/dataset.ts (all of it, not only the metadata parser), src/core/checks/rows.ts, src/core/convert/pivot.ts and src/core/convert/dateOrder.ts.
 * Nothing else is scanned: a reader decision raised from any other file is not seen by this test.
 */
export function readerIds(): Set<string> {
  const out = new Set<string>();
  for (const f of [...tsFiles('src/core/parse'), ...tsFiles('src/core/values')]) for (const m of src(f).matchAll(/'((?:IN|ROW)-[A-Z0-9-]+)'/g)) out.add(m[1]);
  const text = src('src/core/dataset.ts');
  const from = text.indexOf('export function metaParser');
  expect(from, 'metaParser must still be in src/core/dataset.ts').toBeGreaterThanOrEqual(0);
  const rest = text.slice(from + 1);
  const next = rest.search(/\n(?:export )?function /);
  const body = next < 0 ? rest : rest.slice(0, next);
  for (const m of body.matchAll(/c\.add\('([A-Z0-9-]+)'/g)) out.add(m[1]);
  for (const f of ['src/core/dataset.ts', 'src/core/checks/rows.ts', 'src/core/convert/pivot.ts', 'src/core/convert/dateOrder.ts']) for (const m of src(f).matchAll(EMISSION)) for (const id of [m[1], m[2]]) if (id !== undefined) out.add(id);
  return out;
}

/** The ids the ledger's three maps name (a rule raised where rows or cells are left out). */
export function leaveOutIds(): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(COVERED_BY)) for (const id of list ?? []) out.add(id);
  for (const id of Object.values(SUPERSEDES)) out.add(id);
  for (const list of Object.values(LISTED_BY)) for (const id of list ?? []) out.add(id);
  return out;
}

/** Rules raised where the converter used a default (a choice the person did not make). One reason each. */
const DEFAULT: Record<string, string> = {
  'CONV-BIOMASS-KIND-UNSET': 'a biomass column whose kind of mass nobody named is written with the default kind',
  'CONV-BIOMASS-UNIT-UNCLEAR': 'a biomass unit the converter could not read is written with the default unit',
  'CONV-DEPTH-CONVERTED': 'a depth the converter converted to metres by its default',
  'CONV-ID-REVISIT': 'an identifier the converter built by its default rule for a station visited again',
  'CONV-QUANTITY-BLANK-KEPT': 'blank quantities kept as records by the default',
  'CONV-LONG-KEY-VARIES': 'rows the converter splits into separate samples by default',
  'CONV-SEAFLOOR-SIGNS': 'cells read against a direction the converter took from the majority of signs',
};

/** A rule that stays `show` although it sits at one of those places. Every entry says why (a: nothing is lost, b: the outcome follows from the person's own answer, c: the reader changed no value). */
const EXEMPT: Record<string, string> = {
  'CONV-NA-SKIPPED': '(a) a cell that says NA holds no value; nothing is lost',
  'ROW-NA-VARIANT': '(a) an NA variant holds no value',
  'CONV-COLUMN-IGNORED': '(b) after round 4 it names only the columns the person set to ignore',
  'CONV-LONG-DROPPED': '(b) it lists only columns the person marked',
  'CONV-SHEET-TURNED': '(b) the person declared that the samples are the columns',
  'CONV-JOIN-CONFLICT-CHOSEN': '(b) the person chose which value of the two sheets is written',
  'CONV-SUMMARY-ROW-SKIPPED': '(b) the person answered "leave them out (summary rows)" or "keep"; the question that blocks is CONV-SUMMARY-ROW-UNDECIDED',
  'CONV-COUNT-TEXT-DECIDED': '(b) the person answered what a text in a count column means (absence, leave out or present); the question that blocks is CONV-TEXT-IN-TAXON-CELL',
  'CONV-MISSING-CODE-DECLARED': '(b) the person answered "treat as missing" for the column; the question that blocks is ROW-MISSING-CODE',
  'IN-DATE1904': '(c) the workbook states its own date system; the reader only follows it',
  'IN-HEADER-UNITS-READ': '(c) a row of units under the header; a row with a number is never folded (parse/shared.ts foldUnitsRow)',
  'IN-PERCENT-READ': "(c) the cell's own number format",
  'IN-COLUMN-NO-HEADER': "(c) the cell's column; its fate on /convert is the role's own finding (CONV-COLUMN-NOT-EXPORTED / -IGNORED)",
  'IN-HEADER-UNITS-NAMED': '(c) the same fold, the units are named in the header',
  'ROW-LON-360': '(c) a longitude written 0-360 is the same place, no value is lost',
  'ROW-DM-COORDS': '(c) degrees and minutes are read as written',
  'IN-PANGAEA-EVENT-USED': '(c) the file states its own events',
  'ROW-TZ-UNKNOWN': 'nothing is read or borrowed',
  'IN-PANGAEA-EVENT-NOT-USED': 'nothing is read or borrowed',
  'IN-PANGAEA-EVENT-UNMATCHED': 'nothing is read or borrowed',
  'IN-DWCA-PARTIAL': 'raised only by parseDwca; the convert worker reads files with parseFile',
  'IN-DWCA-VERSION': 'raised only by parseDwca; the convert worker reads files with parseFile',
  'IN-DWCA-EVENT-CORE': 'raised only by parseDwca; the convert worker reads files with parseFile',
  // seen since the scan reads src/core/dataset.ts, checks/rows.ts, convert/pivot.ts and convert/dateOrder.ts whole (round 4 final review, I2); a check of the data as written, no value is changed
  'ROW-DATE-MISSING': '(c) a check: rows without a date are reported, nothing is filled in',
  'ROW-HEADER-CODE-SHAPE': '(c) a check of the header as written; no value is changed',
  'ROW-ON-LAND': '(c) a check of the coordinates as written; no value is changed',
  'ROW-ON-LAND-NEAR': '(c) a check of the coordinates as written; no value is changed',
  'ROW-STATION-SPREAD': '(c) a check of the coordinates as written; no value is changed',
  'ROW-UNIT-MISSING': '(c) a check: a header with no unit is reported, no unit is assumed',
  'ROW-YEAR-DATE-MISMATCH': '(c) a check of two columns as written; no value is changed',
  'ROW-YEAR-OUTLIER': '(c) a check of the years as written; no value is changed',
  'ROW-KEY-IGNORED': '(b) it names only columns the person set to ignore',
};

/** A rule that is `show` now and has a task that changes it. */
const PENDING: Record<string, string> = {};

/** The ids the test looks at, with where each came from. */
export function judged(): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of leaveOutIds()) m.set(id, 'leave-out');
  for (const id of readerIds()) if (!m.has(id)) m.set(id, 'reader');
  for (const id of Object.keys(DEFAULT)) if (!m.has(id)) m.set(id, 'default');
  return m;
}

const policy = new Map<string, ExportPolicy>(RULES.map((r) => [r.id, r.exportPolicy]));

/** The judged rules that are show-only and neither exempt nor pending, under a given policy table and a given set of leave-out ids. */
function offenders(table: ReadonlyMap<string, ExportPolicy>, extraLeaveOut: readonly string[] = []): string[] {
  const ids = new Set([...judged().keys(), ...extraLeaveOut]);
  return [...ids].filter((id) => table.get(id) === 'show' && !(id in EXEMPT) && !(id in PENDING)).sort();
}

describe('export policy coverage: a tool default or a reader decision is accepted, not only shown', () => {
  it('LISTED_BY has a key for exactly the listed reasons', () => {
    const listed = Object.entries(REASON_KIND).filter(([, k]) => k === 'listed').map(([r]) => r).sort();
    expect(Object.keys(LISTED_BY).sort()).toEqual(listed);
  });

  it('enumerates real emission sites (not an empty set)', () => {
    const j = judged();
    expect(leaveOutIds().size).toBeGreaterThan(30);
    expect(readerIds().size).toBeGreaterThan(15);
    for (const id of ['CONV-ZERO-SKIPPED', 'CONV-SAMPLE-CODE-MISSING', 'ROW-DATE-YYMMDD', 'IN-DECIMAL-COMMA', 'IN-ENCODING-FALLBACK', 'CONV-SEAFLOOR-SIGNS']) expect(j.has(id), id).toBe(true);
  });

  it('no rule raised at a leave-out, a default or a reader decision is show-only', () => {
    expect(offenders(policy)).toEqual([]);
  });

  it('every exemption and pending entry is a judged rule that is show (no stale entry)', () => {
    const j = judged();
    for (const id of [...Object.keys(EXEMPT), ...Object.keys(PENDING)]) {
      expect(j.has(id), `${id} is not at a leave-out, a default or a reader decision`).toBe(true);
      expect(policy.get(id), `${id} is registered`).toBeDefined();
      expect(policy.get(id), `${id} must be show to be exempt`).toBe('show');
    }
  });

  it('a deliberately show-only leave-out rule makes the check fail (not vacuous)', () => {
    // a fixture rule raised at a leave-out (a listed reason of a test's own) that is show-only, and a real leave-out rule turned to show
    const table = new Map<string, ExportPolicy>(policy);
    table.set('CONV-SAMPLE-CODE-MISSING', 'show');
    table.set('FIXTURE-LEAVE-OUT', 'show');
    expect(offenders(table, ['FIXTURE-LEAVE-OUT'])).toEqual(['CONV-SAMPLE-CODE-MISSING', 'FIXTURE-LEAVE-OUT']);
    // a fixture that is accept passes
    table.set('FIXTURE-LEAVE-OUT', 'accept');
    expect(offenders(table, ['FIXTURE-LEAVE-OUT'])).toEqual(['CONV-SAMPLE-CODE-MISSING']);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Specs } from '../dataset';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, RawSheet } from '../types';
import type { DeclaredOrder } from '../values/dates';
import { columnOrder, declaredOrderStatus, declaredYYOrderStatus, detectDayMonthOrder, isAmbiguousDayMonth, isAmbiguousTwoDigit, parseDate, twoDigitReadings } from '../values/dates';
import type { TwoDigitOrder } from '../values/dates';
import type { ConvertSheetInput } from './build';

/*
 * The day/month order of a date column. 5/4/2023 is 5 April or 4 May and no cell of the value decides it: it is never guessed. Until the person declares the order of the column
 * (ConvertSheetInput.dayMonthOrder, by column index), the cells that no other cell of the column decides block with a clear choice (CONV-DATE-ORDER-UNDECLARED) instead of being
 * called unreadable; once declared, every reader of a date in the converter takes the order from `columnOrder` (values/dates.ts), so the date written, the date inside an ID and the
 * date compared in a join cannot disagree. A NN-NN-NN date (two-digit year) is asked the same way when two or more of year-month-day, day-month-year and month-day-year fit every cell of the column and
 * no cell rules one out (CONV-DATE-ORDER-UNDECLARED, variant two-digit-year); the answer `ymd` exists only for such a column. A declaration only decides cells that no date decides: against a column whose own dates say otherwise it is said and not used.
 */

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SLASH = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;
const MAX_TOKENS = 5; // the distinct values ROW-DATE-UNPARSEABLE lists (as the collector does)

interface Ambiguous {
  line: number;
  text: string;
}

export interface DateOrderRead {
  /** The findings of the sheet's date columns, in column order. */
  findings: Finding[];
  /** Takes the findings the collector made and removes the cells CONV-DATE-ORDER-UNDECLARED names from ROW-DATE-UNPARSEABLE (recomputing its count and value, dropping it when none is left), and the ROW-DATE-YY-AMBIGUOUS of a column it asks about. */
  trim: (collected: Finding[]) => Finding[];
}

/** Does keyPart read this column as a date? (the same test as sampleKey.ts keyPart) */
function readAsDate(sin: ConvertSheetInput, sheet: RawSheet, index: number): boolean {
  const kind = sin.mapping.columns.find((c) => c.index === index)?.role.kind ?? 'ignore';
  const formatted = sheet.dateFormatted?.[index] === true;
  return kind === 'date' || kind === 'datetime' || (formatted && sheet.timeFormatted?.[index] !== true);
}

/** The words of the two readings of an ambiguous cell: `5/4/2023` is "5 April" (day first) or "4 May" (month first), and the same days as ISO dates. */
function readings(text: string): { first: string; second: string; isoFirst: string; isoSecond: string } {
  const m = SLASH.exec(text.trim());
  if (!m) return { first: text, second: text, isoFirst: text, isoSecond: text };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const two = (n: number): string => String(n).padStart(2, '0');
  return { first: `${a} ${MONTH[b - 1]}`, second: `${b} ${MONTH[a - 1]}`, isoFirst: `${m[3]}-${two(b)}-${two(a)}`, isoSecond: `${m[3]}-${two(a)}-${two(b)}` };
}

/** The dates of one NN-NN-NN example in each reading, as "2005-06-21 (ymd); 2021-06-05 (dmy)": only readings that give a date the earlier ones did not. */
function shownReadings(text: string, readings: readonly TwoDigitOrder[]): { shown: string; isoFirst: string; isoSecond: string } {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const o of readings) {
    const d = parseDate(text, { date1904: false, dateFormatted: false, yyOrder: o });
    if ('error' in d) continue;
    const iso = d.iso.slice(0, 10);
    if (seen.has(iso)) continue;
    seen.add(iso);
    parts.push(`${iso} (${o})`);
  }
  const isos = [...seen];
  return { shown: parts.join('; '), isoFirst: isos[0] ?? text, isoSecond: isos[1] ?? text };
}

/**
 * The findings about the day/month order of one sheet: per date, datetime or time column (and per picked date key part), once. A column lent by a description sheet through a join is the
 * description's own column: its finding names the description's file, sheet and column (`params.index` is that column's own index), so the answer is given on the description.
 */
export function dateOrderRead(sin: ConvertSheetInput, sheet: RawSheet, specs: Specs, base: { file: string; sheet: string }): DateOrderRead {
  const info = sin.sampleJoin;
  const columns = new Map<number, string>();
  if (specs.when !== undefined) columns.set(specs.when.index, specs.when.header);
  if (specs.time !== undefined) columns.set(specs.time.index, specs.time.header);
  for (const i of sin.sampleKey?.columns ?? []) if (!columns.has(i) && readAsDate(sin, sheet, i)) columns.set(i, sheet.header[i] ?? '');
  const findings: Finding[] = [];
  // field header (in this sheet) -> the lines of its ambiguous cells that CONV-DATE-ORDER-UNDECLARED now names
  const named = new Map<string, Set<number>>();
  type Where = { file: string; sheet: string; field: string; index: number };
  // one column: the finding its cells and its declaration call for (UNDECLARED, CONTRADICTED or DECLARED), asked of the sheet the cells are in
  const judgeColumn = (of: RawSheet, index: number, declared: DeclaredOrder | undefined, fromFile: boolean, declaredYY: TwoDigitOrder | undefined, fromYYFile: boolean, where: Where): Ambiguous[] | undefined => {
    const column = of.rows.map((r) => r.cells[index] ?? null);
    // the slash dates and the NN-NN-NN dates of a column are judged each on its own: a slash date rules out no reading of 05-06-21
    const slashCells: Ambiguous[] = [];
    for (const r of of.rows) {
      const c = r.cells[index] ?? null;
      if (isAmbiguousDayMonth(c)) slashCells.push({ line: r.line, text: String(c).trim() });
    }
    const slashInPlay = detectDayMonthOrder(column) !== 'unknown' || slashCells.length > 0;
    const yyReadings = twoDigitReadings(column);
    const yyCells: Ambiguous[] = [];
    if (yyReadings.length > 1) {
      for (const r of of.rows) {
        const c = r.cells[index] ?? null;
        if (isAmbiguousTwoDigit(c, yyReadings)) yyCells.push({ line: r.line, text: String(c).trim() });
      }
    }
    const asked: Ambiguous[] = [];
    const said = (rule: 'CONV-DATE-ORDER-DECLARED' | 'CONV-DATE-ORDER-CONTRADICTED', params: Record<string, string | number>): void => {
      findings.push(makeConvertFinding(rule, { file: where.file, sheet: where.sheet, field: where.field, params: { ...params, index: where.index } }));
    };
    // the slash dates are answered by `declared` (dmy | mdy, round 3) and judged by the slash dates only
    if (slashInPlay) {
      if (declared === undefined) {
        if (detectDayMonthOrder(column) === 'unknown' && slashCells.length > 0) {
          const examples = [...new Set(slashCells.map((x) => x.text))].slice(0, 2);
          findings.push(makeConvertFinding('CONV-DATE-ORDER-UNDECLARED', { file: where.file, sheet: where.sheet, field: where.field, value: examples[0], params: { count: slashCells.length, examples: examples.join(', '), index: where.index, ...readings(examples[0]) } }));
          asked.push(...slashCells);
        }
      } else {
        const status = declaredOrderStatus(of, index, declared);
        if (status === 'contradicted') said('CONV-DATE-ORDER-CONTRADICTED', { declared, detected: columnOrder(of, index) });
        else if (status === 'applied') said('CONV-DATE-ORDER-DECLARED', { order: declared, ...(fromFile ? { fromFile: 'yes' } : {}) });
      }
    }
    // the NN-NN-NN dates are answered by `declaredYY` (ymd | dmy | mdy) and judged by the NN-NN-NN cells only
    if (yyReadings.length > 0) {
      if (declaredYY !== undefined) {
        const status = declaredYYOrderStatus(of, index, declaredYY);
        if (status === 'contradicted') said('CONV-DATE-ORDER-CONTRADICTED', { variant: 'two-digit-year', declared: declaredYY, detected: yyReadings.join(', ') });
        else if (status === 'applied') said('CONV-DATE-ORDER-DECLARED', { variant: 'two-digit-year', order: declaredYY, ...(fromYYFile ? { fromFile: 'yes' } : {}) });
      }
      const answered = declaredYY !== undefined && yyReadings.length > 1 && yyReadings.includes(declaredYY);
      if (yyCells.length > 0 && !answered && declaredYY === undefined) {
        const examples = [...new Set(yyCells.map((x) => x.text))].slice(0, 2);
        const { shown, isoFirst, isoSecond } = shownReadings(examples[0], yyReadings);
        findings.push(
          makeConvertFinding('CONV-DATE-ORDER-UNDECLARED', {
            file: where.file,
            sheet: where.sheet,
            field: where.field,
            value: examples[0],
            params: { variant: 'two-digit-year', count: yyCells.length, examples: examples.join(', '), index: where.index, readings: yyReadings.join(','), answers: yyReadings.join(', '), shown, isoFirst, isoSecond },
          }),
        );
        asked.push(...yyCells);
      }
    }
    return asked.length > 0 ? asked : undefined;
  };
  for (const [index, header] of [...columns].sort((x, y) => x[0] - y[0])) {
    const entry = info?.columns[index];
    if (entry?.side === 'description') {
      // a lent column is the description's own: it is judged below, on the description sheet; here only its unreadable lines are taken out of ROW-DATE-UNPARSEABLE
      // (when the description's own cells leave the order open)
      const own = info!.description.sheet;
      const mine = own.rows.map((r) => r.cells[entry.index] ?? null);
      const yy = twoDigitReadings(mine);
      const slashOpen = sin.dayMonthOrder?.[index] === undefined && detectDayMonthOrder(mine) === 'unknown';
      const givenYY = sin.yyOrder?.[index];
      const yyOpen = yy.length > 1 && !(givenYY !== undefined && yy.includes(givenYY));
      if (slashOpen || yyOpen) {
        const lines = sheet.rows.filter((r) => (slashOpen && isAmbiguousDayMonth(r.cells[index] ?? null)) || (yyOpen && isAmbiguousTwoDigit(r.cells[index] ?? null, yy))).map((r) => r.line);
        if (lines.length > 0) named.set(header, new Set(lines));
      }
      continue;
    }
    const cells = judgeColumn(sheet, index, sin.dayMonthOrder?.[index], sin.dayMonthOrderFromFile?.includes(index) === true, sin.yyOrder?.[index], sin.yyOrderFromFile?.includes(index) === true, { ...base, field: header, index });
    if (cells !== undefined) named.set(header, new Set(cells.map((x) => x.line)));
  }
  // the description's own date, datetime and time columns (lent as the date, compared with the results' own, or part of the join key): asked about and said on the description sheet,
  // with their own index, whatever the merged sheet carries
  if (info !== undefined) {
    const rw = info.results.width;
    const own = info.description.sheet;
    for (const c of [...info.description.mapping.columns].sort((x, y) => x.index - y.index)) {
      if (c.role.kind !== 'date' && c.role.kind !== 'datetime' && c.role.kind !== 'time') continue;
      judgeColumn(own, c.index, sin.dayMonthOrder?.[rw + c.index], sin.dayMonthOrderFromFile?.includes(rw + c.index) === true, sin.yyOrder?.[rw + c.index], sin.yyOrderFromFile?.includes(rw + c.index) === true, { file: info.description.file.fileName, sheet: own.name, field: own.header[c.index] ?? c.header, index: c.index });
    }
  }
  const trim = (collected: Finding[]): Finding[] => {
    if (named.size === 0) return collected;
    const byLine = new Map(sheet.rows.map((r) => [r.line, r] as const));
    const indexOf = new Map([...columns].map(([i, h]) => [h, i] as const));
    return collected.flatMap((f) => {
      // the question is asked: the warning that says the same of the same cells is not said twice
      if (f.ruleId === 'ROW-DATE-YY-AMBIGUOUS' && f.sheet === sheet.name && f.field !== undefined && named.has(f.field)) return [];
      const drop = f.ruleId === 'ROW-DATE-UNPARSEABLE' && f.sheet === sheet.name && f.field !== undefined ? named.get(f.field) : undefined;
      if (drop === undefined || f.lines === undefined) return [f];
      const left = f.lines.filter((l) => !drop.has(l));
      if (left.length === f.lines.length) return [f];
      if (left.length === 0) return [];
      const col = indexOf.get(f.field as string);
      const values: string[] = [];
      for (const l of left) {
        const c = col === undefined ? undefined : byLine.get(l)?.cells[col];
        const t = c === null || c === undefined ? undefined : String(c).trim();
        if (t !== undefined && t !== '' && !values.includes(t) && values.length < MAX_TOKENS) values.push(t);
      }
      const { value: _old, ...rest } = f;
      return [{ ...rest, lines: left, ...(values.length > 0 ? { value: values.join(', ') } : {}), params: { ...f.params, count: left.length } }];
    });
  };
  return { findings, trim };
}

const ORDER_RULES = new Set(['CONV-DATE-ORDER-UNDECLARED', 'CONV-DATE-ORDER-CONTRADICTED', 'CONV-DATE-ORDER-DECLARED']);

/** One finding per rule, file, sheet and column: a description lent to several results sheets is asked about once. */
export function onceDateOrder(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (!ORDER_RULES.has(f.ruleId)) return true;
    const key = `${f.ruleId}\u0000${f.file ?? ''}\u0000${f.sheet ?? ''}\u0000${String(f.params.index)}\u0000${String(f.params.variant ?? '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

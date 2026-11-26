// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sheet in the eMoF long shape (a measurementValue column the author named with the exact Darwin Core term) is read as measurements, one per row with a value.
// It never makes an occurrence or an event: a row attaches to what the biology sheets wrote, or is listed with a reason.
import { parseNumber } from '../values/numbers';
import { makeConvertFinding } from '../rules/convert';
import { valueText } from '../output/csv';
import { isBlankCell } from '../recognize/columns';
import type { Finding, RawCell, RawRow, RawSheet } from '../types';
import type { ConvertSheetInput } from './build';
import { FateLog, buildSheetLedger } from './ledger';
import type { SheetLedger } from './ledger';
import type { MofIntent, OccRec } from './model';
import type { SampleSite } from './events';

const hasValueColumn = (sin: ConvertSheetInput): boolean => sin.mapping.columns.some((c) => c.role.kind === 'measurementValue');
const BIOLOGY_OWN = new Set(['date', 'datetime', 'latitude', 'longitude', 'quantity']);

/**
 * A sheet with its own taxon AND its own date, position or quantity next to the measurement columns is the usual flat OBIS shape: one row = one occurrence with its measurement. It stays in the
 * biology pass (its occurrences are written as for any sheet) and each row's measurement is attached to that row's occurrence. A sheet with measurement columns and none of those is an eMoF table.
 */
export const isFlatSheet = (sin: ConvertSheetInput): boolean =>
  hasValueColumn(sin) && sin.mapping.columns.some((c) => c.role.kind === 'taxon') && sin.mapping.columns.some((c) => BIOLOGY_OWN.has(c.role.kind));

export const isEmofSheet = (sin: ConvertSheetInput): boolean => hasValueColumn(sin) && !isFlatSheet(sin);

export interface EmofContext {
  ledger: SheetLedger[];
  inputIndexOf: (sin: ConvertSheetInput) => number;
  findings: Finding[];
  measurements: MofIntent[];
  occurrences: readonly OccRec[];
  samples: ReadonlyMap<string, { site: SampleSite }>;
}

type Field = 'type' | 'value' | 'unit' | 'typeId' | 'unitId' | 'valueId' | 'accuracy' | 'method' | 'remarks' | 'event' | 'occurrence' | 'taxon';
const FIELD_OF: Record<string, Field> = {
  measurementType: 'type', measurementValue: 'value', measurementUnit: 'unit', measurementTypeId: 'typeId', measurementUnitId: 'unitId', measurementValueId: 'valueId',
  measurementAccuracy: 'accuracy', measurementMethod: 'method', measurementRemarks: 'remarks', sampleId: 'event', occurrenceId: 'occurrence', taxon: 'taxon',
};

const key = (s: string): string => s.trim().toLowerCase();

export function readEmofSheets(sheets: readonly ConvertSheetInput[], ctx: EmofContext): void {
  const occById = new Map<string, OccRec>();
  for (const o of ctx.occurrences) occById.set(o.id, o);
  const siteOf = new Map<string, SampleSite>();
  for (const [k, a] of ctx.samples) {
    for (const t of [k, a.site.id, a.site.code]) if (!siteOf.has(t)) siteOf.set(t, a.site);
  }
  for (const sin of sheets) readOne(sin, ctx, occById, siteOf);
}

interface Tools {
  sheet: RawSheet;
  at: Partial<Record<Field, number>>;
  cell: (row: RawRow, f: Field) => string | undefined;
  valueCell: (row: RawRow) => string | undefined;
  intent: (row: RawRow, target: MofIntent['target'], type: string, value: string) => MofIntent;
}

function toolsOf(sin: ConvertSheetInput): Tools | undefined {
  const file = sin.file;
  const sheet: RawSheet | undefined = file.sheets.find((x) => x.name === sin.sheet);
  if (!sheet) return undefined;
  const dc = file.decimalComma;
  const at: Partial<Record<Field, number>> = {};
  for (const c of sin.mapping.columns) {
    const f = FIELD_OF[c.role.kind];
    if (f !== undefined && at[f] === undefined) at[f] = c.index;
  }
  const cell = (row: RawRow, f: Field): string | undefined => {
    const i = at[f];
    if (i === undefined) return undefined;
    const raw: RawCell | undefined = row.cells[i];
    const t = raw === null || raw === undefined ? '' : valueText(raw, f === 'value' ? dc : false).trim();
    return t === '' ? undefined : t;
  };
  const valueCell = (row: RawRow): string | undefined => {
    const i = at.value;
    const raw = i === undefined ? undefined : row.cells[i];
    if (raw === null || raw === undefined) return undefined;
    if (parseNumber(raw, dc).status === 'missing') return undefined;
    return cell(row, 'value');
  };
  const intent = (row: RawRow, target: MofIntent['target'], type: string, value: string): MofIntent => {
    const unit = cell(row, 'unit');
    const optional = (f: Field, name: string): Record<string, string> => {
      const v = cell(row, f);
      return v === undefined ? {} : { [name]: v };
    };
    return {
      target,
      role: 'variable',
      measurementType: type,
      measurementValue: value,
      ...(unit === undefined ? {} : { measurementUnit: unit }),
      ...optional('typeId', 'measurementTypeId'),
      ...optional('unitId', 'measurementUnitId'),
      ...optional('valueId', 'measurementValueId'),
      ...optional('accuracy', 'measurementAccuracy'),
      ...optional('method', 'measurementMethod'),
      ...optional('remarks', 'measurementRemarks'),
      source: { file: file.fileName, sheet: sheet.name, line: row.line },
    };
  };
  return { sheet, at, cell, valueCell, intent };
}

/**
 * The measurements of a flat sheet (its own taxon, date or position next to the measurement columns): one per row with a value and a type, attached to the occurrence that row wrote.
 * A row with a value and no type is the finding CONV-EMOF-TYPE-EMPTY; a row that wrote no occurrence is said by the sheet's own ledger and gets no measurement. `fate` is the sheet's FateLog.
 */
export function flatMeasurements(sin: ConvertSheetInput, occurrences: readonly OccRec[], fate: FateLog, findings: Finding[]): MofIntent[] {
  const t = toolsOf(sin);
  if (t === undefined || t.at.value === undefined) return [];
  const ownAt = new Map<number, OccRec>();
  for (const o of occurrences) if (!ownAt.has(o.source.line)) ownAt.set(o.source.line, o);
  const out: MofIntent[] = [];
  const noType: number[] = [];
  for (const row of t.sheet.rows) {
    const value = t.valueCell(row);
    if (value === undefined) continue;
    const type = t.cell(row, 'type');
    if (type === undefined) {
      noType.push(row.line);
      continue;
    }
    const own = ownAt.get(row.line);
    if (own === undefined) continue;
    const m = t.intent(row, { kind: 'occurrence', id: own.id }, type, value);
    fate.from(m, t.at.value);
    out.push(m);
  }
  if (noType.length > 0) findings.push(makeConvertFinding('CONV-EMOF-TYPE-EMPTY', { file: sin.file.fileName, sheet: sin.sheet, lines: noType, params: { count: noType.length } }));
  return out;
}

function readOne(sin: ConvertSheetInput, ctx: EmofContext, occById: ReadonlyMap<string, OccRec>, siteOf: ReadonlyMap<string, SampleSite>): void {
  const tools = toolsOf(sin);
  if (tools === undefined) return;
  const { sheet, at, cell, valueCell } = tools;
  const file = sin.file;
  const fate = new FateLog(sheet.rows.length);
  const written: MofIntent[] = [];
  const occurrenceList = [...occById.values()];

  for (const row of sheet.rows) {
    const value = valueCell(row);
    if (value === undefined) {
      fate.row(row.line, 'nothing-to-record');
      continue;
    }
    const type = cell(row, 'type');
    if (type === undefined) {
      fate.row(row.line, 'empty-parameter');
      continue;
    }
    const occId = cell(row, 'occurrence');
    const taxon = cell(row, 'taxon');
    const ev = cell(row, 'event');
    let target: MofIntent['target'] | undefined;
    if (occId !== undefined) {
      if (occById.has(occId)) target = { kind: 'occurrence', id: occId };
    } else if (taxon !== undefined) {
      const site = ev === undefined ? undefined : siteOf.get(ev);
      if (site !== undefined) {
        const hits = occurrenceList.filter((o) => o.eventId === site.id && (key(o.scientificName) === key(taxon) || key(o.verbatimIdentification) === key(taxon)));
        if (hits.length === 1) target = { kind: 'occurrence', id: hits[0]!.id };
      }
    } else if (ev !== undefined) {
      const site = siteOf.get(ev);
      if (site !== undefined) target = { kind: 'event', id: site.id };
    }
    if (target === undefined) {
      fate.row(row.line, 'measurement-no-target');
      continue;
    }
    const intent = tools.intent(row, target, type, value);
    fate.from(intent, at.value!);
    written.push(intent);
  }
  ctx.measurements.push(...written);
  const read = (['type', 'unit', 'typeId', 'unitId', 'valueId', 'accuracy', 'method', 'remarks', 'event', 'occurrence', 'taxon'] as const).flatMap((f) => (at[f] === undefined ? [] : [at[f]!]));
  // a column with a meaning of its own (date, count, position ...) that an eMoF table does not carry is said, never dropped in silence
  const readSet = new Set([...read, at.value!]);
  const holdsData = (i: number): boolean => sheet.rows.some((r) => !isBlankCell(r.cells[i] ?? null));
  const left = sin.mapping.columns.filter((c) => c.role.kind !== 'ignore' && !readSet.has(c.index) && holdsData(c.index)).map((c) => c.header.trim());
  if (left.length > 0) ctx.findings.push(makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { file: file.fileName, sheet: sheet.name, params: { count: left.length, columns: left.join(', ') } }));
  ctx.ledger.push(
    buildSheetLedger({
      file: file.fileName,
      sheet,
      kind: 'long',
      inputIndex: ctx.inputIndexOf(sin),
      mapping: sin.mapping,
      decimalComma: file.decimalComma,
      fate,
      eventColumns: read,
      taxonColumns: [],
      occurrenceColumns: [],
      measurementColumns: [at.value!],
      hasTaxa: false,
      occurrences: [],
      measurements: written,
    }),
  );
}

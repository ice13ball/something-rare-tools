// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sheet in the eMoF long shape (a measurementValue column the author named with the exact Darwin Core term) is read as measurements, one per row with a value.
// It never makes an occurrence or an event: a row attaches to what the biology sheets wrote, or is listed with a reason.
import { parseNumber } from '../values/numbers';
import { valueText } from '../output/csv';
import type { Finding, RawCell, RawRow, RawSheet } from '../types';
import type { ConvertSheetInput } from './build';
import { FateLog, buildSheetLedger } from './ledger';
import type { SheetLedger } from './ledger';
import type { MofIntent, OccRec } from './model';
import type { SampleSite } from './events';

export const isEmofSheet = (sin: ConvertSheetInput): boolean => sin.mapping.columns.some((c) => c.role.kind === 'measurementValue');

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

function readOne(sin: ConvertSheetInput, ctx: EmofContext, occById: ReadonlyMap<string, OccRec>, siteOf: ReadonlyMap<string, SampleSite>): void {
  const file = sin.file;
  const sheet: RawSheet | undefined = file.sheets.find((x) => x.name === sin.sheet);
  if (!sheet) return;
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
    const unit = cell(row, 'unit');
    const optional = (f: Field, name: string): Record<string, string> => {
      const v = cell(row, f);
      return v === undefined ? {} : { [name]: v };
    };
    const intent: MofIntent = {
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
    fate.from(intent, at.value!);
    written.push(intent);
  }
  ctx.measurements.push(...written);
  const read = (['type', 'unit', 'typeId', 'unitId', 'valueId', 'accuracy', 'method', 'remarks', 'event', 'occurrence', 'taxon'] as const).flatMap((f) => (at[f] === undefined ? [] : [at[f]!]));
  ctx.ledger.push(
    buildSheetLedger({
      file: file.fileName,
      sheet,
      kind: 'long',
      inputIndex: ctx.inputIndexOf(sin),
      mapping: sin.mapping,
      decimalComma: dc,
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

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { checkRawTable } from '../checks/dwc';
import { runChecks } from '../checks/run';
import { buildDatasets } from '../dataset';
import { proposeLayout, proposeMappings } from '../recognize/layout';
import { makeConvertFinding } from '../rules/convert';
import type { Finding, ParsedFile, RawSheet } from '../types';
import { buildTables } from './dwca';
import type { ArchiveTables, Table } from './dwca';
import { hasTabOrNewline, shownText } from './ids';
import { missingFields } from './metadata';
import type { DatasetMetadata } from './metadata';
import type { ConvertedDataset } from './model';

/*
 * Validation of what is about to be written (plan 1 "Same rules" and 3.4). The OUTPUT tables, rendered as the files they will be, go through the
 * same checks /check runs on a Darwin Core Archive:
 *
 *   Event table       a synthetic ParsedFile with `dwca: { core: 'Event' }`, through proposeLayout / proposeMappings / buildDatasets / runChecks: the
 *                     KONTROLE-OBIS checks (checkRawTable inside buildDatasets) plus the row checks (ROW-ZERO-COORD, ROW-DEPTH-MIN-MAX, ROW-NO-COORD,
 *                     ROW-DATE-FUTURE, ...)
 *   Occurrence table  checkRawTable with `dwca: { core: 'Occurrence' }` (its eventID column marks it as the occurrence side: no date or position demanded)
 *   eMoF + cross      CONV-EMOF-ORPHAN, CONV-EMOF-EVENT-MISMATCH, CONV-EMOF-VALUE-EMPTY, CONV-EMOF-TYPE-EMPTY
 *   the description   CONV-EML-MISSING, CONV-LICENCE-UNSET, CONV-BASIS-UNSET (metadataFindings: pure and cheap, so the page can run it on every keystroke)
 *
 * What each finding does to the export is policy.ts. Findings of the tables name event.txt / occurrence.txt and their line numbers (line 1 is the header).
 */

const FIRST_DATA_LINE = 2;

function sheetOf(t: Table): RawSheet {
  return { name: t.name, header: t.columns.map((c) => c.header), headerLine: 1, rows: t.rows.map((cells, i) => ({ line: i + FIRST_DATA_LINE, cells, fieldCount: cells.length })) };
}

function fileOf(t: Table, core: 'Event' | 'Occurrence'): ParsedFile {
  return { fileName: t.name, kind: 'csv', sheets: [sheetOf(t)], date1904: false, decimalComma: false, encoding: 'utf-8', findings: [], dwca: { core, partial: false } };
}

export interface ValidateOptions {
  /** Today as a UTC calendar day (YYYY-MM-DD) for ROW-DATE-FUTURE; absent: the clock, read once by runChecks. */
  today?: string;
}

/** The description of the dataset: what is missing (CONV-EML-MISSING), no licence, no basisOfRecord. */
export function metadataFindings(m: DatasetMetadata): Finding[] {
  const out: Finding[] = [];
  const fields = missingFields(m);
  if (fields.length > 0) out.push(makeConvertFinding('CONV-EML-MISSING', { file: 'eml.xml', params: { fields: fields.join(', ') } }));
  if (m.licence === '') out.push(makeConvertFinding('CONV-LICENCE-UNSET', { file: 'eml.xml' }));
  if (m.basisOfRecord === '') out.push(makeConvertFinding('CONV-BASIS-UNSET', { file: 'occurrence.txt' }));
  return out;
}

/**
 * CONV-LICENCE-DIFFERS: the licence chosen differs from what the dropped metadata files state (`source`, core/convert/prefill.ts licenceSourceOf: every
 * recognised id, in every case). It fires when the chosen licence is not among the recognised ids, and also, when the files DISAGREE with each other, whenever
 * the choice differs from what at least one file says (choosing one of two contradicting licences still departs from the other file). An archive must not
 * carry a licence different from its source without the user acknowledging it. Nothing when no file states a recognised licence, or when no licence is
 * chosen (CONV-LICENCE-UNSET says that).
 */
export function licenceDiffersFindings(chosen: string, source: { ids: readonly string[]; disagree: boolean }): Finding[] {
  if (chosen === '' || source.ids.length === 0) return [];
  if (source.ids.includes(chosen) && !(source.disagree && source.ids.some((id) => id !== chosen))) return [];
  return [makeConvertFinding('CONV-LICENCE-DIFFERS', { file: 'eml.xml', params: { chosen, source: source.ids.join(', ') } })];
}

/** The Event table through the Event checks of /check. */
function eventFindings(t: Table, opts: ValidateOptions): Finding[] {
  const file = fileOf(t, 'Event');
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  const built = buildDatasets(file, layout, mappings, [], 'event');
  const report = runChecks({ datasets: built.datasets, records: [], parseFindings: built.findings }, { ...(opts.today === undefined ? {} : { today: opts.today }) });
  // sampleSizeValue is a number whose unit stands in the next column, sampleSizeUnit: it is not a measured variable with a missing unit
  return report.findings.flatMap((f) => {
    if (f.ruleId !== 'ROW-UNIT-MISSING' || typeof f.params.headers !== 'string') return [f];
    const rest = f.params.headers.split(', ').filter((h) => h !== 'sampleSizeValue');
    return rest.length === 0 ? [] : [{ ...f, params: { ...f.params, headers: rest.join(', ') } }];
  });
}

/** The eMoF checks (orphan, event mismatch, empty value, empty type): the eMoF table against the Event and Occurrence tables. */
function emofFindings(ds: ConvertedDataset, t: Table): Finding[] {
  const out: Finding[] = [];
  const events = new Set(ds.events.map((e) => e.id));
  const occurrences = new Map(ds.occurrences.map((o) => [o.id, o.eventId]));
  const col = (h: string): number => t.columns.findIndex((c) => c.header === h);
  const iEvent = col('eventID');
  const iOcc = col('occurrenceID');
  const iType = col('measurementType');
  const iValue = col('measurementValue');
  const orphanEvent: { line: number; id: string }[] = [];
  const orphanOcc: { line: number; id: string }[] = [];
  const mismatch: { line: number; id: string }[] = [];
  const noType: number[] = [];
  const noValue: number[] = [];
  t.rows.forEach((row, i) => {
    const line = i + FIRST_DATA_LINE;
    const eventId = row[iEvent];
    const occId = row[iOcc];
    if (!events.has(eventId)) orphanEvent.push({ line, id: eventId });
    if (occId !== '') {
      const owner = occurrences.get(occId);
      if (owner === undefined) orphanOcc.push({ line, id: occId });
      else if (owner !== eventId) mismatch.push({ line, id: occId });
    }
    if (row[iType].trim() === '') noType.push(line);
    if (row[iValue].trim() === '') noValue.push(line);
  });
  const base = { file: t.name, sheet: t.name };
  if (orphanEvent.length > 0) out.push(makeConvertFinding('CONV-EMOF-ORPHAN', { ...base, value: orphanEvent[0].id, lines: orphanEvent.map((x) => x.line), params: { kind: 'event', count: orphanEvent.length } }));
  if (orphanOcc.length > 0) out.push(makeConvertFinding('CONV-EMOF-ORPHAN', { ...base, value: orphanOcc[0].id, lines: orphanOcc.map((x) => x.line), params: { kind: 'occurrence', count: orphanOcc.length } }));
  if (mismatch.length > 0) out.push(makeConvertFinding('CONV-EMOF-EVENT-MISMATCH', { ...base, value: mismatch[0].id, lines: mismatch.map((x) => x.line), params: { count: mismatch.length } }));
  if (noValue.length > 0) out.push(makeConvertFinding('CONV-EMOF-VALUE-EMPTY', { ...base, lines: noValue, params: { count: noValue.length } }));
  if (noType.length > 0) out.push(makeConvertFinding('CONV-EMOF-TYPE-EMPTY', { ...base, lines: noType, params: { count: noType.length } }));
  return out;
}

/**
 * A tab or line break in a cell of the OUTPUT tables, for a case the input checks did not see (a unit typed on the page, say). Where the sheet's
 * own CONV-TAB-IN-VALUE already stands, this is not repeated: the same cause would be reported twice.
 */
function tabFindings(tables: ArchiveTables): Finding[] {
  const out: Finding[] = [];
  for (const t of [tables.event, tables.occurrence, ...(tables.emof ? [tables.emof] : [])]) {
    t.columns.forEach((c, k) => {
      const lines: number[] = [];
      let example: string | undefined;
      t.rows.forEach((row, i) => {
        if (!hasTabOrNewline(row[k])) return;
        lines.push(i + FIRST_DATA_LINE);
        example ??= shownText(row[k]);
      });
      if (lines.length > 0) out.push(makeConvertFinding('CONV-TAB-IN-VALUE', { file: t.name, sheet: t.name, field: c.header, lines, value: example ?? '', params: { count: lines.length } }));
    });
  }
  return out;
}

/**
 * The findings of the output tables and of the cross-table checks, WITHOUT the description of the dataset (metadataFindings). `stage1` are the findings
 * the conversion already raised: a tab in a sheet value is reported there, in the sheet's terms. basisOfRecord, when not chosen, is replaced by a
 * placeholder for these checks only (CONV-BASIS-UNSET blocks anyway), so the same missing choice is not reported a second time as an empty column.
 */
export function validateTables(ds: ConvertedDataset, stage1: readonly Finding[] = [], opts: ValidateOptions = {}): Finding[] {
  if (ds.events.length === 0) return [];
  const judged: ConvertedDataset = ds.metadata.basisOfRecord === '' ? { ...ds, occurrences: ds.occurrences.map((o) => ({ ...o, basisOfRecord: 'HumanObservation' })) } : ds;
  const tables = buildTables(judged);
  const out: Finding[] = [];
  out.push(...eventFindings(tables.event, opts));
  // the Occurrence table's own recommended-term finding is only the empty scientificNameID column, which CONV-NAMEID-MISSING says in the converter's words
  out.push(...checkRawTable(fileOf(tables.occurrence, 'Occurrence'), sheetOf(tables.occurrence), []).filter((f) => !(f.ruleId === 'DWC-RECOMMENDED' && f.params.terms === 'scientificNameID')));
  const noId = judged.occurrences.filter((o) => o.identification.scientificNameId === undefined).length;
  if (noId > 0) out.push(makeConvertFinding('CONV-NAMEID-MISSING', { file: tables.occurrence.name, sheet: tables.occurrence.name, params: { count: noId } }));
  if (tables.emof) out.push(...emofFindings(judged, tables.emof));
  if (!stage1.some((f) => f.ruleId === 'CONV-TAB-IN-VALUE')) out.push(...tabFindings(tables));
  return out;
}

/** Everything: the tables and the description. This is what the export checks before it writes anything. */
export function validateDataset(ds: ConvertedDataset, stage1: readonly Finding[] = [], opts: ValidateOptions = {}): Finding[] {
  return [...validateTables(ds, stage1, opts), ...metadataFindings(ds.metadata)];
}

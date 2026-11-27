// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ColumnProposal, Finding, RawCell, RawSheet } from '../types';
import { excelSerialToDate } from '../values/dates';
import { makeConvertFinding } from '../rules/convert';
import { isCanonicalKey } from '../recognize/vocab';
import { looksLikeDwcTerm } from '../recognize/columns';
import { termOf } from './dwcTerms';
import { DWC_TERM_LIST } from './dwcTermList';
import type { ConvertInput, ConvertSheetInput } from './build';
import type { ConvertResult, EventRec, OccRec } from './model';
import type { Column } from './dwca';

/*
 * A column whose header IS a Darwin Core term (any case, with or without the dwc: or URI prefix) is written to the archive under that term, as the author typed it
 * (role `dwcTerm`). Only the header decides: no cell is read to guess a term, and /check never proposes the role. The terms the converter already writes from a role of its own
 * (CLOSED_TERMS: eventID, eventDate, the coordinates, scientificName, the counts ...) keep that role; every other term of the event, occurrence and record level is open.
 *
 * Where it goes: an occurrence-level term to the Occurrence table, one value per occurrence from the source row (a wide row's occurrences all get the row's value); an event- or
 * record-level term to the Event table, from the rows of the event, unless the rows of one event carry different values: then every cell is written on its own occurrence
 * (CONV-DWC-TERM-PER-ROW). The cell of the author wins over a value the converter makes itself (CONV-DWC-TERM-REPLACES); a remarks term is joined to the converter's text instead.
 * Not handled (the column is then listed by CONV-COLUMN-NOT-EXPORTED, never dropped silently): a profile, a turned or a pivoted sheet, and a sheet joined to a description sheet.
 */

/** The terms a role of the converter writes (roleTerms.ts ROLE_TERMS, without the eMoF roles) and the four it writes without a role: they keep their role. */
export const CLOSED_TERMS: ReadonlySet<string> = new Set([
  'eventID', 'parentEventID', 'eventDate', 'decimalLatitude', 'decimalLongitude', 'minimumDepthInMeters', 'maximumDepthInMeters', 'minimumDistanceAboveSurfaceInMeters',
  'maximumDistanceAboveSurfaceInMeters', 'scientificName', 'individualCount', 'organismQuantity', 'organismQuantityType', 'sampleSizeValue', 'sampleSizeUnit', 'occurrenceID',
  'lifeStage', 'identificationQualifier', 'scientificNameID', 'eventType', 'verbatimIdentification', 'datasetName', 'institutionCode',
]);

const DCTERMS: ReadonlySet<string> = new Set(['type', 'modified', 'language', 'license', 'rightsHolder', 'accessRights', 'bibliographicCitation', 'references']);
const REMARKS: ReadonlySet<string> = new Set(['eventRemarks', 'georeferenceRemarks', 'occurrenceRemarks']);
const BASIS_VOCAB: ReadonlySet<string> = new Set(['preservedspecimen', 'fossilspecimen', 'livingspecimen', 'materialsample', 'materialentity', 'materialcitation', 'humanobservation', 'machineobservation', 'occurrence', 'event', 'taxon']);

/** The open term a header names, or undefined (not a term, an eMoF term or a closed one). */
export function openTermOf(header: string): { name: string; level: 'event' | 'occurrence' | 'record' } | undefined {
  const t = termOf(header);
  if (t === undefined || t.level === 'emof' || CLOSED_TERMS.has(t.name)) return undefined;
  return { name: t.name, level: t.level };
}
export const isOpenTerm = (name: string): boolean => openTermOf(name) !== undefined;

/** The URI a term is written under in meta.xml. */
export const dwcTermUri = (term: string): string => (DCTERMS.has(term) ? 'http://purl.org/dc/terms/' : 'http://rs.tdwg.org/dwc/terms/') + term;

/** The terms the page may offer for a column: the listed GBIF and OBIS terms that are open (the optional terms are taken from an exact header only). */
export const openPickList = (): string[] => DWC_TERM_LIST.filter((t) => isOpenTerm(t.name)).map((t) => t.name);

/**
 * The role of a column named with an open term (in place, like applyEmofRoles): only a column that is ignore, or a measured variable no vocabulary knows, is changed; any role a
 * header already has stays. `setReason` writes the reason code; the term is set after it (it clears the parameters).
 */
export function proposeDwcTermRoles(base: ColumnProposal[], setReason: (p: ColumnProposal) => void): void {
  const header = base.map((q) => q.header);
  for (const q of base) {
    const t = openTermOf(q.header);
    if (t === undefined) continue;
    const r = q.role;
    const free = r.kind === 'ignore' || (r.kind === 'variable' && !isCanonicalKey(r.variable) && r.p01 === undefined && r.unit === undefined);
    // a column another rule already named (a veto, a stated Darwin Core meaning) keeps that; a plain word such as Habitat or Type is a term only as the older rules decide, so only a header that looks like a term is ours
    if (!free || q.vetoed !== undefined || q.stated === true || !looksLikeDwcTerm(q.header, header)) continue;
    q.role = { kind: 'dwcTerm', term: t.name };
    q.confidence = 'high';
    delete q.vetoed;
    setReason(q);
    q.reasonParams = { term: t.name };
  }
}

export interface TermColumn {
  index: number;
  header: string;
  term: string;
  level: 'event' | 'occurrence' | 'record';
}

function sheetOf(sin: ConvertSheetInput): RawSheet | undefined {
  return sin.file.sheets.find((s) => s.name === sin.sheet);
}

/** The columns of a sheet that are written under their own term: not on a profile, turned, pivoted or joined sheet; of a term written twice only the first column. */
export function termColumnsOf(sin: ConvertSheetInput): { columns: TermColumn[]; twice: { term: string; kept: string; dropped: string }[] } {
  const none = { columns: [], twice: [] };
  const sheet = sheetOf(sin);
  if (sheet === undefined || sin.profile !== undefined || sin.sampleJoin !== undefined || sheet.pivot !== undefined || sheet.turn !== undefined) return none;
  const columns: TermColumn[] = [];
  const twice: { term: string; kept: string; dropped: string }[] = [];
  for (const c of [...sin.mapping.columns].sort((a, b) => a.index - b.index)) {
    if (c.role.kind !== 'dwcTerm') continue;
    const t = openTermOf(c.role.term);
    if (t === undefined) continue;
    const first = columns.find((x) => x.term === t.name);
    if (first !== undefined) twice.push({ term: t.name, kept: first.header, dropped: c.header });
    else columns.push({ index: c.index, header: c.header, term: t.name, level: t.level });
  }
  return { columns, twice };
}

/** The columns of a sheet the conversion reads for this (build.ts readColumns). */
export const termColumnIndexes = (sin: ConvertSheetInput): number[] => termColumnsOf(sin).columns.map((c) => c.index);

/** What the post-pass hands the export: the columns and, by eventID or occurrenceID, the value of each term. */
export interface DwcTermData {
  columns: { term: string; header: string; table: 'event' | 'occurrence' }[];
  event: Record<string, Record<string, string>>;
  occurrence: Record<string, Record<string, string>>;
}

function cellText(cell: RawCell | undefined, sheet: RawSheet, index: number, date1904: boolean): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell.trim();
  if (sheet.dateFormatted?.[index] === true || sheet.timeAll?.[index] === true) {
    try {
      const iso = excelSerialToDate(cell, date1904).iso;
      return sheet.timeAll?.[index] === true ? (iso.split('T')[1] ?? iso) : iso;
    } catch {
      return String(cell);
    }
  }
  return String(cell);
}

/** The generated value of a term the exporter writes itself, per table: a user's cell replaces it (the remarks terms are joined to it instead). */
function generated(table: 'event' | 'occurrence', term: string, o: OccRec, e: EventRec | undefined, value: string): boolean {
  if (table === 'occurrence') {
    if (term === 'occurrenceStatus') return o.occurrenceStatus !== value;
    if (term === 'basisOfRecord') return true; // the metadata value is not known here: every cell replaces it
    if (term === 'sex') return o.sex !== undefined && o.sex !== value;
    return false;
  }
  if (e === undefined) return false;
  if (term === 'locality') return e.locality !== undefined;
  if (term === 'geodeticDatum') return e.lat !== undefined && value !== 'EPSG:4326';
  if (term === 'coordinateUncertaintyInMeters') return e.coordinateUncertaintyInMeters !== undefined;
  if (term === 'verbatimDepth') return e.depthVerbatim !== undefined;
  return false;
}

/**
 * The post-pass of convert(): reads the term columns from the source rows of the occurrences (the line each occurrence came from), places each term and says what the author should
 * know. Returns nothing for an input with no term column, so such a file is converted exactly as before.
 */
export function applyDwcTerms(input: ConvertInput, result: ConvertResult): ConvertResult {
  type Src = { sin: ConvertSheetInput; sheet: RawSheet; cols: TermColumn[] };
  const sources: Src[] = [];
  const findings: Finding[] = [];
  for (const sin of input.sheets) {
    const { columns, twice } = termColumnsOf(sin);
    const sheet = sheetOf(sin);
    if (sheet === undefined) continue;
    for (const d of twice) findings.push(makeConvertFinding('CONV-DWC-TERM-TWICE', { file: sin.file.fileName, sheet: sin.sheet, field: d.dropped, value: d.term, params: { columns: `${d.kept}, ${d.dropped}`, term: d.term } }));
    if (columns.length > 0) sources.push({ sin, sheet, cols: columns });
  }
  if (sources.length === 0) return result;
  const eventOf = new Map(result.events.map((e) => [e.id, e]));
  const levelOf = new Map<string, 'event' | 'occurrence' | 'record'>();
  const headerOf = new Map<string, { header: string; file: string; sheet: string }>();
  // the user's value of each term on each occurrence
  const perOcc = new Map<string, Record<string, string>>();
  const rowsByLine = new Map<RawSheet, Map<number, RawSheet['rows'][number]>>();
  const occsOf = new Map<string, OccRec[]>();
  for (const o of result.occurrences) occsOf.set(o.eventId, [...(occsOf.get(o.eventId) ?? []), o]);
  const vocab = new Map<string, { file: string; sheet: string; header: string; lines: number[]; values: string[] }>();
  for (const o of result.occurrences) {
    const src = sources.find((s) => s.sin.file.fileName === o.source.file && s.sin.sheet === o.source.sheet);
    if (src === undefined) continue;
    let lines = rowsByLine.get(src.sheet);
    if (lines === undefined) rowsByLine.set(src.sheet, (lines = new Map(src.sheet.rows.map((r) => [r.line, r]))));
    const row = lines.get(o.source.line);
    if (row === undefined) continue;
    for (const c of src.cols) {
      const v = cellText(row.cells[c.index], src.sheet, c.index, src.sin.file.date1904);
      if (v === '') continue;
      levelOf.set(c.term, c.level);
      if (!headerOf.has(c.term)) headerOf.set(c.term, { header: c.header, file: o.source.file, sheet: o.source.sheet });
      const own = perOcc.get(o.id) ?? {};
      own[c.term] = v;
      perOcc.set(o.id, own);
      const bad = c.term === 'occurrenceStatus' ? !['present', 'absent'].includes(v.toLowerCase()) : c.term === 'basisOfRecord' ? !BASIS_VOCAB.has(v.toLowerCase()) : false;
      if (bad) {
        const k = `${o.source.file}\u0000${o.source.sheet}\u0000${c.term}`;
        const g = vocab.get(k) ?? { file: o.source.file, sheet: o.source.sheet, header: c.header, lines: [], values: [] };
        g.lines.push(o.source.line);
        if (!g.values.includes(v)) g.values.push(v);
        vocab.set(k, g);
      }
    }
  }
  // placement: an event- or record-level term goes to the Event table unless the rows of one event disagree
  const conflicting = new Map<string, Set<string>>();
  const byEvent = new Map<string, Map<string, string>>();
  for (const o of result.occurrences) {
    const own = perOcc.get(o.id);
    if (own === undefined) continue;
    for (const [term, v] of Object.entries(own)) {
      if (levelOf.get(term) === 'occurrence') continue;
      const m = byEvent.get(o.eventId) ?? new Map<string, string>();
      const seen = m.get(term);
      if (seen !== undefined && seen !== v) conflicting.set(term, (conflicting.get(term) ?? new Set()).add(o.eventId));
      else m.set(term, v);
      byEvent.set(o.eventId, m);
    }
  }
  const tableOf = (term: string): 'event' | 'occurrence' => (levelOf.get(term) === 'occurrence' || term === 'basisOfRecord' || conflicting.has(term) ? 'occurrence' : 'event');
  const data: DwcTermData = { columns: [], event: {}, occurrence: {} };
  const replaced = new Map<string, number>();
  const count = (term: string): void => void replaced.set(term, (replaced.get(term) ?? 0) + 1);
  for (const [term, h] of headerOf) data.columns.push({ term, header: h.header, table: tableOf(term) });
  for (const [eventId, m] of byEvent) {
    for (const [term, v] of m) if (tableOf(term) === 'event') {
      (data.event[eventId] ??= {})[term] = v;
      if (!REMARKS.has(term) && (occsOf.get(eventId) ?? []).some((o) => generated('event', term, o, eventOf.get(eventId), v))) count(term);
    }
  }
  for (const o of result.occurrences) {
    for (const [term, v] of Object.entries(perOcc.get(o.id) ?? {})) if (tableOf(term) === 'occurrence') {
      (data.occurrence[o.id] ??= {})[term] = v;
      if (!REMARKS.has(term) && generated('occurrence', term, o, eventOf.get(o.eventId), v)) count(term);
    }
  }
  for (const [term, events] of conflicting) {
    const h = headerOf.get(term);
    findings.push(makeConvertFinding('CONV-DWC-TERM-PER-ROW', { file: h?.file, sheet: h?.sheet, field: h?.header, value: term, params: { columns: h?.header ?? term, count: events.size } }));
  }
  for (const [term, n] of replaced) {
    const h = headerOf.get(term);
    findings.push(makeConvertFinding('CONV-DWC-TERM-REPLACES', { file: h?.file, sheet: h?.sheet, field: h?.header, value: term, params: { columns: h?.header ?? term, count: n } }));
  }
  for (const g of vocab.values()) {
    findings.push(makeConvertFinding('CONV-DWC-TERM-VOCAB', { file: g.file, sheet: g.sheet, lines: g.lines, field: g.header, value: g.values.slice(0, 5).join(', '), params: { columns: g.header, count: g.lines.length } }));
  }
  return { ...result, findings: [...result.findings, ...findings], dwcTerms: data };
}

interface SpecColumn {
  col: Column;
  always: boolean;
}

/** The columns of one table of the archive with the term columns of the author put in (export, dwca.ts buildTables). Without data the table is exactly what the exporter made. */
export function withTermColumns(spec: SpecColumn[], rows: string[][], ids: string[], table: 'event' | 'occurrence', data: DwcTermData | undefined): { spec: SpecColumn[]; rows: string[][] } {
  const mine = data?.columns.filter((c) => c.table === table) ?? [];
  if (data === undefined || mine.length === 0) return { spec, rows };
  const values = table === 'event' ? data.event : data.occurrence;
  const outSpec = [...spec];
  const outRows = rows.map((r) => [...r]);
  for (const c of mine) {
    let at = outSpec.findIndex((s) => s.col.header === c.term);
    if (at < 0) {
      outSpec.push({ col: { header: c.term, uri: dwcTermUri(c.term) }, always: false });
      at = outSpec.length - 1;
      for (const r of outRows) r.push('');
    }
    outRows.forEach((r, i) => {
      const v = values[ids[i] ?? '']?.[c.term];
      if (v === undefined || v === '') return;
      r[at] = REMARKS.has(c.term) && r[at] !== '' ? `${r[at]}; ${v}` : v;
    });
  }
  return { spec: outSpec, rows: outRows };
}

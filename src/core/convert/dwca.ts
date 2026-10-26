// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { coordinateText } from '../output/csv';
import { escapeXml } from '../output/draft';
import { datasetNameOf } from './metadata';
import type { ConvertedDataset, ModelEvent } from './model';
import { DERIVED_DECIMALS } from './events';
import { hasTabOrNewline } from './ids';

/*
 * The tables of the Darwin Core Archive and their writers: event.txt (Event core), occurrence.txt (Occurrence extension) and
 * extendedmeasurementorfact.txt (the OBIS eMoF extension), as UTF-8 tab-separated text with `\n` line ends, one header line and no
 * enclosure, and meta.xml that says so. The structure follows the archive that was built in the stage 0 spike and passed BioCheck
 * (docs/research/qc-sources.md, Item 6 and "Live BioCheck run"): the Event core's id and its eventID are column 0, the Occurrence
 * extension's coreid is its eventID column, and the eMoF coreid is its first column (eventID); metadata="eml.xml" is set because BioCheck's
 * reader finds the EML through it.
 *
 * Values are WRITTEN FROM THEIR SOURCE TEXT: a coordinate with the decimals of the source, a depth with its own decimals, a sample size as
 * typed or read, a quantity as the cell said it (decimal comma turned into a point). Nothing is rounded or rescaled. A tab or line break in a
 * value would break the file: it is refused (an Error), never replaced; validate.ts blocks before that point (CONV-TAB-IN-VALUE).
 */

export const DWC = 'http://rs.tdwg.org/dwc/terms/';
export const OBIS = 'http://rs.iobis.org/obis/terms/';

export const EVENT_ROW_TYPE = `${DWC}Event`;
export const OCCURRENCE_ROW_TYPE = `${DWC}Occurrence`;
export const EMOF_ROW_TYPE = `${OBIS}ExtendedMeasurementOrFact`;

export const EVENT_FILE = 'event.txt';
export const OCCURRENCE_FILE = 'occurrence.txt';
export const EMOF_FILE = 'extendedmeasurementorfact.txt';

/** A column: the header is the term's local name, `uri` its full URI. */
export interface Column {
  header: string;
  uri: string;
}

export interface Table {
  /** The file name inside the archive. */
  name: string;
  columns: Column[];
  rows: string[][];
}

export interface ArchiveTables {
  event: Table;
  occurrence: Table;
  /** Absent when there is no measurement at all. */
  emof?: Table;
}

const dwc = (header: string): Column => ({ header, uri: DWC + header });
const obis = (header: string): Column => ({ header, uri: OBIS + header });

/** Event columns in file order; `always` columns are written even when empty (BioCheck needs them to exist, and an empty one is then reported). */
const EVENT_COLUMNS: { col: Column; always: boolean }[] = [
  { col: dwc('eventID'), always: true },
  { col: dwc('parentEventID'), always: true },
  { col: dwc('eventType'), always: true },
  { col: dwc('eventDate'), always: true },
  { col: dwc('decimalLatitude'), always: true },
  { col: dwc('decimalLongitude'), always: true },
  { col: dwc('geodeticDatum'), always: false },
  { col: dwc('coordinateUncertaintyInMeters'), always: false },
  { col: dwc('minimumDepthInMeters'), always: false },
  { col: dwc('maximumDepthInMeters'), always: false },
  { col: dwc('minimumDistanceAboveSurfaceInMeters'), always: false },
  { col: dwc('maximumDistanceAboveSurfaceInMeters'), always: false },
  { col: dwc('sampleSizeValue'), always: false },
  { col: dwc('sampleSizeUnit'), always: false },
  { col: dwc('locality'), always: false },
  { col: dwc('datasetName'), always: true },
  { col: dwc('institutionCode'), always: true },
];

const OCCURRENCE_COLUMNS: { col: Column; always: boolean }[] = [
  { col: dwc('occurrenceID'), always: true },
  { col: dwc('eventID'), always: true },
  { col: dwc('basisOfRecord'), always: true },
  { col: dwc('occurrenceStatus'), always: true },
  { col: dwc('scientificName'), always: true },
  { col: dwc('scientificNameID'), always: false },
  { col: dwc('verbatimIdentification'), always: true },
  { col: dwc('identificationQualifier'), always: false },
  { col: dwc('lifeStage'), always: false },
  { col: dwc('sex'), always: false },
  { col: dwc('individualCount'), always: false },
  { col: dwc('organismQuantity'), always: false },
  { col: dwc('organismQuantityType'), always: false },
  { col: dwc('occurrenceRemarks'), always: false },
];

/** The eMoF extension: eventID is the coreid (the extension has no eventID property), measurementTypeID / ValueID / UnitID live in the OBIS namespace. */
const EMOF_COLUMNS: Column[] = [
  dwc('eventID'),
  dwc('occurrenceID'),
  dwc('measurementType'),
  obis('measurementTypeID'),
  dwc('measurementValue'),
  obis('measurementValueID'),
  dwc('measurementUnit'),
  obis('measurementUnitID'),
];

/** Keeps the columns that are always written and those with at least one non-empty cell. */
function prune(spec: { col: Column; always: boolean }[], rows: string[][]): { columns: Column[]; rows: string[][] } {
  const keep = spec.map((s, i) => s.always || rows.some((r) => r[i] !== ''));
  return { columns: spec.filter((_, i) => keep[i]).map((s) => s.col), rows: rows.map((r) => r.filter((_, i) => keep[i])) };
}

const num = (n: number | undefined): string => (n === undefined ? '' : String(n));

/** A derived coordinate: at most DERIVED_DECIMALS decimals, trailing zeros (and a bare point) dropped. */
function derivedText(v: number): string {
  const s = coordinateText(v, DERIVED_DECIMALS);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

const coordText = (v: number, decimals: number | undefined, text: string | undefined, derived: boolean | undefined): string => (text !== undefined ? text : derived === true ? derivedText(v) : coordinateText(v, decimals));

function depthText(v: number | undefined, decimals: number | undefined, text?: string): string {
  if (v === undefined) return '';
  if (text !== undefined) return text;
  return decimals === undefined ? String(v) : v.toFixed(decimals);
}

function eventRow(e: ModelEvent, datasetName: string, institutionCode: string): string[] {
  const p = e.position;
  return [
    e.id,
    e.parentId ?? '',
    e.type,
    e.date ?? '',
    p ? coordText(p.lat, p.latDecimals, p.latText, p.derived) : '',
    p ? coordText(p.lon, p.lonDecimals, p.lonText, p.derived) : '',
    p ? 'EPSG:4326' : '',
    p ? num(p.uncertaintyM) : '',
    depthText(e.depth?.min, e.depth?.decimals, e.depth?.minText),
    depthText(e.depth?.max, e.depth?.decimals, e.depth?.maxText),
    e.distance ?? '',
    e.distance ?? '',
    e.effort?.value ?? '',
    e.effort?.unit ?? '',
    e.locality ?? '',
    datasetName,
    institutionCode,
  ];
}

/**
 * The three tables of a dataset, in the order the file lists its rows: events as the conversion built them (cruise, stations, samples), occurrences and
 * measurements in the order of the sheet. Columns that no row fills (and that BioCheck does not need) are left out; geodeticDatum EPSG:4326 is written
 * for an event that has a position.
 */
export function buildTables(ds: ConvertedDataset): ArchiveTables {
  const name = datasetNameOf(ds.metadata);
  const code = ds.metadata.institutionCode.trim();
  const ev = prune(EVENT_COLUMNS, ds.events.map((e) => eventRow(e, name, code)));
  const occ = prune(
    OCCURRENCE_COLUMNS,
    ds.occurrences.map((o) => [
      o.id,
      o.eventId,
      o.basisOfRecord,
      o.status,
      o.identification.scientificName,
      o.identification.scientificNameId ?? '',
      o.identification.verbatim,
      o.identification.qualifier ?? '',
      o.identification.lifeStage ?? '',
      o.identification.sex ?? '',
      num(o.quantity?.individualCount),
      num(o.quantity?.organismQuantity),
      o.quantity?.organismQuantityType ?? '',
      o.remarks ?? '',
    ]),
  );
  const tables: ArchiveTables = { event: { name: EVENT_FILE, ...ev }, occurrence: { name: OCCURRENCE_FILE, ...occ } };
  if (ds.measurements.length > 0) {
    tables.emof = {
      name: EMOF_FILE,
      columns: EMOF_COLUMNS,
      rows: ds.measurements.map((m) => [m.eventId, m.occurrenceId ?? '', m.type, m.typeId ?? '', m.value, m.valueId ?? '', m.unit ?? '', m.unitId ?? '']),
    };
  }
  return tables;
}

/** The text of a table: the header line and one line per row, tab-separated, `\n` after each line, no enclosure. Throws on a tab or line break inside a value. */
export function writeTsv(t: Table): string {
  const out: string[] = [t.columns.map((c) => c.header).join('\t')];
  t.rows.forEach((row, i) => {
    for (let k = 0; k < row.length; k++) {
      if (hasTabOrNewline(row[k])) throw new Error(`${t.name}, row ${i + 1}, column ${t.columns[k]?.header ?? k}: a value holds a tab or a line break, which would break the file`);
    }
    out.push(row.join('\t'));
  });
  return out.join('\n') + '\n';
}

const field = (index: number, uri: string): string => `    <field index="${index}" term="${escapeXml(uri)}"/>`;

function tableXml(tag: 'core' | 'extension', rowType: string, t: Table, linkIndex: number, linkTag: 'id' | 'coreid', skipField?: (c: Column) => boolean): string {
  return [
    `  <${tag} encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="1" rowType="${escapeXml(rowType)}">`,
    `    <files><location>${escapeXml(t.name)}</location></files>`,
    `    <${linkTag} index="${linkIndex}"/>`,
    ...t.columns.flatMap((c, i) => (skipField?.(c) ? [] : [field(i, c.uri)])),
    `  </${tag}>`,
  ].join('\n');
}

/**
 * meta.xml: Event core (id = eventID, column 0), Occurrence extension (coreid = its eventID column), eMoF extension (coreid = its first column, the
 * eventID, which is not a field of that extension). `metadata="eml.xml"` names the EML.
 */
export function writeMetaXml(tables: ArchiveTables): string {
  const eventIdAt = (t: Table): number => t.columns.findIndex((c) => c.header === 'eventID');
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml">',
    tableXml('core', EVENT_ROW_TYPE, tables.event, eventIdAt(tables.event), 'id'),
    tableXml('extension', OCCURRENCE_ROW_TYPE, tables.occurrence, eventIdAt(tables.occurrence), 'coreid'),
    ...(tables.emof ? [tableXml('extension', EMOF_ROW_TYPE, tables.emof, eventIdAt(tables.emof), 'coreid', (c) => c.header === 'eventID')] : []),
    '</archive>',
  ];
  return parts.join('\n') + '\n';
}

/** "Calanus of the Bay, 2023" -> "calanus-of-the-bay-2023": ASCII letters and digits, single hyphens, at most 60 characters, "dwca" when nothing is left. */
export function slugOf(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s === '' ? 'dwca' : s;
}

export const archiveFileName = (ds: Pick<ConvertedDataset, 'metadata'>): string => `${slugOf(datasetNameOf(ds.metadata))}.zip`;

export interface ArchiveFile {
  name: string;
  data: Uint8Array;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Every file of the archive: meta.xml, eml.xml, event.txt, occurrence.txt and, when there are measurements, extendedmeasurementorfact.txt. */
export function archiveFiles(ds: ConvertedDataset, emlXml: string): ArchiveFile[] {
  const tables = buildTables(ds);
  return [
    { name: 'meta.xml', data: utf8(writeMetaXml(tables)) },
    { name: 'eml.xml', data: utf8(emlXml) },
    { name: tables.event.name, data: utf8(writeTsv(tables.event)) },
    { name: tables.occurrence.name, data: utf8(writeTsv(tables.occurrence)) },
    ...(tables.emof ? [{ name: tables.emof.name, data: utf8(writeTsv(tables.emof)) }] : []),
  ];
}

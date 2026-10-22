// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
export type Severity = 'error' | 'warning' | 'info';
export type Lang = 'pl' | 'en' | 'de' | 'fr';
export const LANGS: readonly Lang[] = ['pl', 'en', 'de', 'fr'];

/* ---------- raw input ---------- */
export type RawCell = string | number | null;          // number only for xlsx numeric cells
export interface RawRow { line: number; cells: RawCell[]; fieldCount: number }
export interface RawSheet {
  name: string;                 // sheet name; for CSV/PANGAEA the file name
  header: string[];             // original header text, OPeNDAP suffixes kept
  headerLine: number;           // 1-based physical line/row of the header
  rows: RawRow[];               // data rows only, physical line numbers
  dateFormatted?: boolean[];    // xlsx: column is date-formatted in the majority of its cells
}
export interface ParsedFile {
  fileName: string;
  kind: 'csv' | 'xlsx' | 'pangaea' | 'metadata' | 'pdf' | 'unknown';
  sheets: RawSheet[];
  date1904: boolean;
  decimalComma: boolean;
  encoding: string;             // 'utf-8' | 'utf-8-bom' | 'windows-1250' | 'iso-8859-2'
  embeddedMetadata?: MetadataRecord;   // PANGAEA header, or the record itself for kind 'metadata'
  findings: Finding[];          // parse-level findings (ragged rows, encoding fallback, …)
}

/* ---------- metadata ---------- */
export type MetadataSource = 'iso19139' | 'datacite' | 'zenodo' | 'pangaea';
export interface LicenceStatement {
  source: MetadataSource;
  field: string;                // 'useLimitation' | 'otherConstraints' | 'rightsList[0]' | 'license.id' | 'License'
  text?: string;
  uri?: string;
  /** The AGREED SPDX id, e.g. 'CC-BY-4.0'. Set only when the statement is unambiguous (see `conflict`). */
  spdx?: string;
  textSpdx?: string;            // what the text alone names
  uriSpdx?: string;             // what the URI alone names
  /** Why `spdx` is not set: 'text-uri' = the statement has a URI and text and URI classify differently; 'restricted' = the text names a licence and something is left over that contains a restriction marker (conditions); 'extra-text' = the text names a licence and something else is left over (fail-closed, see readText); 'readings' = no link, but the text gives more than one reading of itself. */
  conflict?: 'text-uri' | 'restricted' | 'extra-text' | 'readings';
  /** What the text says besides the licence name and neutral wording (set with conflict 'restricted' / 'extra-text'). */
  leftover?: string;
  /** The licences the text itself reads as, when it reads as more than one (several ids, a versionless family, "—" = a name no id exists for). */
  readings?: string[];
}
/** A statement classified: one SPDX id, or unrecognised (check manually). */
export type LicenceClass = { kind: 'spdx'; id: string } | { kind: 'unrecognised' };
export interface MetadataRecord {
  source: MetadataSource;
  label: string;                // shown as the "file" of metadata findings
  title?: string;
  abstract?: string;
  version?: string;
  licences: LicenceStatement[];
  restrictionCodes: { kind: 'access' | 'use' | 'other'; code: string }[];
  temporalExtent?: { start?: string; end?: string };   // ISO 8601 dates
  bbox?: { west: number; east: number; south: number; north: number };
  distributionLinks: { url: string; name?: string; protocol?: string }[];  // url may be ''
  files?: { key: string; url: string; size?: number; mimetype?: string }[];
  resourceType?: string;
  doi?: string;
  landingUrl?: string;
  /** Zenodo: id of the concept record (the DOI that stands for all versions), to tell that a concept DOI and a version DOI are one deposit. */
  conceptId?: string;
  /** DataCite relatedIdentifiers of type DOI with relation IsVersionOf / HasVersion, lower-case DOIs: links the records of a concept DOI and its version DOIs. */
  versionDois?: string[];
  isoProfile?: '19139' | '19115-3';   // source 'iso19139' covers both ISO profiles; this says which one was read
  creators?: string[];          // for the attribution line, in source order
  publicationYear?: number;
  publisher?: string;
  parameters?: { name: string; unit?: string }[];      // PANGAEA parameter list
}

/* ---------- mapping and layout ---------- */
export type ColumnRole =
  | { kind: 'latitude' } | { kind: 'longitude' }
  | { kind: 'datetime' } | { kind: 'date' } | { kind: 'time' }
  | { kind: 'depth'; positive: 'down' | 'up' | 'unknown'; unit?: string }
  | { kind: 'pressure'; unit?: string }
  | { kind: 'station' } | { kind: 'cruise' } | { kind: 'sampleId' }
  | { kind: 'variable'; variable: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
  | { kind: 'ignore' };
export interface ColumnProposal { index: number; header: string; cleanHeader: string; role: ColumnRole; confidence: 'high' | 'low'; reason: string }
export interface SheetMapping { sheet: string; columns: { index: number; header: string; role: ColumnRole }[] }
export interface TablePlan { sheet: string; long?: { parameterCol: number; unitCol?: number; valueCol: number } }
export interface LayoutPlan {
  tables: TablePlan[];
  joins: { left: string; right: string; leftKey: number; rightKey: number }[];   // sheet names + column indices
  unsupported?: string;         // plain description of a layout the tool cannot handle
}

/* ---------- dataset ---------- */
export interface ParsedDate {
  iso: string;                  // '2021-07-25' | '2021-07-25T10:30' | '2021-07-25T10:30:00Z'
  year: number;
  precision: 'year' | 'month' | 'day' | 'minute' | 'second';
  tz: 'utc' | 'offset' | 'unknown';
  ambiguity?: 'yy-mm-dd';
}
export interface NumericCell { raw: RawCell; line: number; value?: number; decimals?: number; status: 'ok' | 'missing' | 'non-numeric' | 'na-variant' }
export interface Variable { key: string; header: string; canonical?: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
export interface DataRow {
  file: string; sheet: string; line: number;            // line of the row that carries the position
  lat?: number; lon?: number; latDecimals?: number; lonDecimals?: number;
  datetime?: ParsedDate; dateRaw?: RawCell;
  depth?: number; depthDecimals?: number; station?: string; cruise?: string; sampleId?: string;
  values: Record<string, NumericCell>;                   // key = Variable.key
}
export interface Dataset {
  id: string; label: string; file: string;
  rows: DataRow[]; variables: Variable[];
  mappings: SheetMapping[]; layout: LayoutPlan;
  metadata: MetadataRecord[];
  depthPositive: 'down' | 'up' | 'unknown';
  /** The source file wrote decimals with a comma. Only then may the clean CSV swap the comma for a dot. */
  decimalComma?: boolean;
}

/* ---------- findings and rules ---------- */
export interface Finding {
  ruleId: string;
  severity: Severity;           // copied from the rule by makeFinding()
  file?: string; sheet?: string;
  lines?: number[];             // sorted, unique, physical lines
  field?: string; value?: string;
  params: Record<string, string | number>;
  datasetIds?: string[];
}
export interface Citation { label: string; url: string; locator?: string }
export interface Threshold { name: string; value: number; unit: string; citation: Citation }
export interface RuleDef {
  id: string;
  category: 'input' | 'A' | 'B' | 'C';
  severity: Severity;
  plain: Record<Lang, string>;   // template with {param} placeholders
  /** Wordings for other classes of the `status` param (IN-RECORD-INACCESSIBLE): `plain` stays the 403/404 one. */
  plainByStatus?: { server: Record<Lang, string>; other: Record<Lang, string> };
  technical: string;             // English, template with {param}
  thresholds?: Threshold[];
  citations?: Citation[];
}

/* ---------- session and report ---------- */
export interface LoadedRecord {
  label: string;
  kind: 'zenodo' | 'geonetwork' | 'datacite' | 'pangaea' | 'dropped';
  metadata: MetadataRecord[];
  files: { name: string; url?: string; bytes?: Uint8Array }[];
  findings: Finding[];
}
export interface CheckSession { datasets: Dataset[]; records: LoadedRecord[]; parseFindings: Finding[] }
export interface Report {
  findings: Finding[];
  counts: Record<Severity, number>;
  notChecked: string[];          // ui message keys
}

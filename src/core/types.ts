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
  unnamedFrom?: number;         // CSV: the header had too few names (IN-HEADER-SHORT); columns from this index on were added by the tool as `Column N`
  dateFormatted?: boolean[];    // xlsx: column is date-formatted in the majority of its cells
  timeFormatted?: boolean[];    // xlsx: the date formats of the column are time-only (hh:mm, [h]:mm); only present when some column is
  /** Set only by the converter's long-sheet reader (core/convert/pivot.ts): this sheet is a PIVOT of a long environmental sheet, with where each cell came from. Never set for /check. */
  pivot?: PivotInfo;
}
/** What the converter's reader of a long environmental sheet (one row per measured parameter) did: the facts the converter turns into findings and the page into a note. */
export interface PivotInfo {
  parameterColumn: string;
  valueColumn: string;
  unitColumn?: string;
  /** The columns that were made of parameters, by index in the pivoted header. */
  pivoted: { index: number; parameter: string; unit?: string }[];
  /** Original rows read, and pivoted rows (samples) made of them. */
  rowsIn: number;
  samples: number;
  /** Per pivoted row (by its `line`, the first original line of its group): the ORIGINAL line of each pivoted column's cell, by index in `pivoted`. */
  cellLines: Record<number, number[]>;
  /** Pivoted headers that got " (2)" because they collided with another header. */
  renamed: string[];
  /** Quality-flag columns of the long sheet (not part of the key, not written). */
  flagColumns: string[];
  /** Parameters that are quality flags (their rows were skipped), and how many rows. */
  flagParameters: string[];
  flagRows: number;
  /** A group that has the same parameter and unit twice: the header of the pivoted column, a label of the group and the original lines of the repeated rows. */
  duplicates: { header: string; lines: number[] }[];
  /** Original lines that have a value but no parameter name (nothing can be named for them). */
  unnamed: number[];
  /** The key columns that are not position / identity columns (station, cruise, sample, time, depth, position): the user may mark each as describing the measurement, not the sample. */
  keyOptions: { header: string; describes: boolean }[];
  /** Columns the user marked as describing the measurement: removed from the key, their values not written. */
  dropped: string[];
  /** Key columns that differ between rows sharing every position / identity column, and how many such samples there are. */
  varying: string[];
  varyingSamples: number;
}
/** One parameter of a PANGAEA header block (the converter's reading, core/convert/pangaeaHeader.ts). */
export interface PangaeaParameter {
  name: string;
  unit?: string;
  /** The abbreviation the table header uses. */
  short?: string;
  comment?: string;
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
  /** Set only by the converter's reading path (core/convert/read.ts), never by the shared parsers: the parameters of a PANGAEA header block with their abbreviations and comments. */
  pangaeaParameters?: PangaeaParameter[];
  /** Set by the Darwin Core Archive reader: the file is a DwC-A (the one sure sign of Darwin Core input) and what its core is. */
  dwca?: { core: 'Occurrence' | 'Event'; /** the core was cut at the row limit: references to rows that were not read cannot be judged */ partial: boolean };
}

/* ---------- metadata ---------- */
export type MetadataSource = 'iso19139' | 'datacite' | 'zenodo' | 'pangaea' | 'dataverse';
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
  /** The string of the statement the `leftover` is quoted from (the shown text, or the identifier / Zenodo title when only that one leaves something). */
  leftoverFrom?: string;
  /** The DataCite rightsIdentifier of an entry that is not a recognised licence and differs from `text`: part of what the entry says. */
  identifier?: string;
  /** Leftover of another string of the statement (identifier, Zenodo title), next to the shown text's own `leftover`. */
  otherLeftover?: string;
  /** The licences the text itself reads as, when it reads as more than one (several ids, a versionless family, "—" = a name no id exists for). */
  readings?: string[];
  /** Set with `spdx` when the SPDX id itself, whole and in any case, was given as the text or as the identifier ("agpl-3.0-or-later"): a program can read it. */
  idExact?: true;
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
  /** Dataverse: files under restricted access or an embargo; the licence the record states does not open them. */
  heldBackFiles?: string[];
  resourceType?: string;
  doi?: string;
  landingUrl?: string;
  /** Zenodo: id of the concept record (the DOI that stands for all versions), to tell that a concept DOI and a version DOI are one deposit. */
  conceptId?: string;
  /** DataCite relatedIdentifiers of type DOI with relation IsVersionOf / HasVersion, lower-case DOIs: links the records of a concept DOI and its version DOIs. */
  versionDois?: string[];
  isoProfile?: '19139' | '19115-3';   // source 'iso19139' covers both ISO profiles; this says which one was read
  creators?: string[];          // for the attribution line, in source order
  organisations?: string[];     // the creators the source marks as organisations (DataCite nameType Organizational, Zenodo person_or_org.type organizational)
  /** Contact persons the record names (ISO pointOfContact, DataCite / Zenodo contributor of type ContactPerson), in source order: the person's name (an organisation's when no person is named) and the e-mail address when the record has one. Read for the /convert form only; no /check rule looks at it. */
  contacts?: { name?: string; email?: string; /** the file names this contact by an organisation (ISO organisationName without an individualName, DataCite nameType Organizational, Zenodo organizational) */ organisation?: true }[];
  /** ISO: the authors the file names only by organisation (an organisationName and no individualName). Read for the /convert form only, beside `organisations` (which /check reads and which ISO never fills). */
  organisationParties?: string[];
  publicationYear?: number;
  publisher?: string;
  parameters?: { name: string; unit?: string }[];      // PANGAEA parameter list
}

/* ---------- mapping and layout ---------- */
export type ColumnRole =
  | { kind: 'latitude' } | { kind: 'longitude' }
  /** A column of hemisphere letters (N/S, E/W or the words) for the mapped latitude or longitude column: S and W make that column's value negative. */
  | { kind: 'hemisphere'; axis: 'latitude' | 'longitude' }
  | { kind: 'datetime' } | { kind: 'date' } | { kind: 'time' }
  | { kind: 'depth'; positive: 'down' | 'up' | 'unknown'; unit?: string; /** Converter only: which end of a depth range this column is. /check never sets it. */ bound?: 'min' | 'max' }
  | { kind: 'pressure'; unit?: string }
  | { kind: 'station' } | { kind: 'cruise' } | { kind: 'sampleId' }
  | { kind: 'variable'; variable: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
  | { kind: 'ignore' }
  | ConverterRole;
/**
 * Roles that exist only on /convert (src/core/convert). /check never proposes them (recognize/columns.ts does not know them) and every
 * /check reader treats them as a column it does not read: dataset.ts specsOf skips them, the clean CSV and the sidecar write nothing for them.
 * `taxon` with `header: true` is a wide-sheet column whose HEADER is the taxon and whose cells are the quantities.
 */
export type ConverterRole =
  | { kind: 'taxon'; header?: boolean }
  | { kind: 'quantity' } | { kind: 'quantityType' }
  | { kind: 'effort'; unit?: string }
  | { kind: 'occurrenceId' } | { kind: 'lifeStage' } | { kind: 'qualifier' }
  /** The scientificNameID of a long sheet's taxon; `aphia: true` = the cells are WoRMS AphiaIDs (written as the urn:lsid), otherwise written as given. */
  | { kind: 'taxonId'; aphia?: boolean }
  /**
   * Depth BELOW THE SEAFLOOR of a sediment or porewater sample, in the unit of `unit` (cm or m). Written as a negative minimum/maximumDistanceAboveSurfaceInMeters (an exact
   * decimal shift of the text, core/convert/seafloor.ts); the site's water depth is the plain depth column and goes to minimum/maximumDepthInMeters.
   */
  | { kind: 'depthBelowSeafloor'; unit?: string; /** 'down' (the default): positive numbers are depths below the seafloor. 'up': positive numbers go up, so a NEGATIVE number is below the seafloor and the sign is kept. */ positive?: 'down' | 'up' };
export type ConverterRoleKind = ConverterRole['kind'];
export interface ColumnProposal {
  index: number; header: string; cleanHeader: string; role: ColumnRole; confidence: 'high' | 'low';
  /** The English wording of why (technical line, tests). */
  reason: string;
  /**
   * Stable code of the reason, so the page can say it in the reader's language: a code of recognize/reasons.ts (shared proposer,
   * `check.reason.<code>`) or of the converter overlay (convert/recognize.ts OVERLAY_REASONS, `convert.reason.<code>`; it replaces the shared one).
   */
  reasonCode?: string;
  /** The values the translation of a shared-proposer code puts in its {placeholders} (a column name, a term, a code). */
  reasonParams?: Record<string, string>;
  /** Shared-proposer codes written before / after the main reason, joined with "; " (an empty column; a depth direction that is not stated). */
  reasonLead?: string;
  reasonNotes?: string[];
}
export interface SheetMapping { sheet: string; columns: { index: number; header: string; role: ColumnRole }[] }
export interface TablePlan { sheet: string; long?: { parameterCol: number; unitCol?: number; valueCol: number } }
export interface LayoutPlan {
  tables: TablePlan[];
  joins: { left: string; right: string; leftKey: number; rightKey: number }[];   // sheet names + column indices
  unsupported?: string;         // plain English description of a layout the tool cannot handle (technical line, tests)
  /** The same reasons as language-neutral codes; every language renders from these (recognize/layoutReasons.ts). */
  unsupportedReasons?: { code: 'transposed' | 'header-empty' | 'header-units' | 'no-table' | 'no-rows' | 'no-data-sheet'; sheet?: string }[];
}

/* ---------- dataset ---------- */
export interface ParsedDate {
  iso: string;                  // '2021-07-25' | '2021-07-25T10:30' | '2021-07-25T10:30:00Z'
  year: number;
  precision: 'year' | 'month' | 'day' | 'minute' | 'second';
  tz: 'utc' | 'offset' | 'unknown';
  ambiguity?: 'yy-mm-dd';
  /** Darwin Core eventDate interval 'start/end': the end, parsed on its own. `iso` and `precision` above stay the START (every existing reader keeps working). */
  end?: ParsedDate;
}
export interface NumericCell { raw: RawCell; line: number; value?: number; decimals?: number; status: 'ok' | 'missing' | 'non-numeric' | 'na-variant' }
export interface Variable { key: string; header: string; canonical?: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
export interface DataRow {
  file: string; sheet: string; line: number;            // line of the row that carries the position
  lat?: number; lon?: number; latDecimals?: number; lonDecimals?: number;
  datetime?: ParsedDate; dateRaw?: RawCell;
  depth?: number; depthDecimals?: number; station?: string; cruise?: string; sampleId?: string;
  /** Darwin Core minimumDepthInMeters / maximumDepthInMeters of the row, read from their own columns (`depth` keeps only one of them). */
  depthMin?: number; depthMax?: number;
  /** The latitude and/or longitude CELL is blank (not text, not a number) on a row that holds something else; set only where a position column exists. */
  posBlank?: 'lat' | 'lon' | 'both';
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
  /** LIC-MISSING of a catalogue record whose DataCite comparison could not be made (param dataciteCompared = 'no'): the same finding, with a note. */
  plainDataciteNotCompared?: Record<Lang, string>;
  /** META-NO-EXTENT in Collection review (param scope = 'collection'): the same finding without a reference to the /check table, which Collection review does not have. */
  plainCollection?: Record<Lang, string>;
  /** Appended to LIC-EXTRA-TEXT / LIC-ADDED-CONDITIONS when param otherRest is set: another string of the statement (identifier, Zenodo title) leaves something too. */
  plainOtherRest?: Record<Lang, string>;
  /** Sentences appended, in order, when the finding has the named param (set and non-empty). */
  plainIf?: readonly { param: string; plain: Record<Lang, string> }[];
  technical: string;             // English, template with {param}
  thresholds?: Threshold[];
  citations?: Citation[];
}

/* ---------- session and report ---------- */
export interface LoadedRecord {
  label: string;
  kind: 'zenodo' | 'geonetwork' | 'datacite' | 'pangaea' | 'dataverse' | 'gbif' | 'obis' | 'dropped';
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

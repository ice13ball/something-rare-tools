// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Dataverse dataset version (GET /api/datasets/:persistentId/versions/:latest-published): metadata blocks, licence and file list.
import { dataverseName } from '../../../config/dataverse';
import type { LicenceStatement, MetadataRecord } from '../types';
import { buildStatement } from './licence';
import { stripTags } from './xml';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** In which form a data file is read. 'original' / 'tab' only exist for a table Dataverse converted when it was ingested. */
export type DataverseForm = 'as-uploaded' | 'original' | 'tab';

export interface DataverseFile {
  id: string;
  /** The name the file is read under: its extension picks the parser (the original's, e.g. .xlsx, or the converted .tab). */
  name: string;
  url: string;
  /** Bytes of what is downloaded (the original's size when the original is read), when the server says. */
  size?: number;
  mimetype?: string;
  form: DataverseForm;
  /** Access is restricted (`restricted: true`) or under an embargo that has not ended. */
  heldBack: boolean;
  /** The ingested table's original format label ("MS Excel (XLSX)", "SPSS"), when there is one. */
  originalFormat?: string;
  /** The converted .tab name, for a file read in its original form. */
  tabName?: string;
}

export interface DataverseRead {
  record: MetadataRecord;
  files: DataverseFile[];
  /** "2.0": the version that was read. */
  versionLabel?: string;
  versionState?: string;
}

const MIME_EXTENSION: Record<string, string> = {
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/tsv': 'tsv',
  'text/comma-separated-values': 'csv',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
};
/** What the tool can parse (src/core/sources/common.ts DATA_EXTENSIONS, repeated here to keep this file free of source handlers). */
const READABLE = ['csv', 'tsv', 'txt', 'tab', 'xlsx', 'xls', 'ods'];

const extOf = (name: string): string => /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

export function dataverseFileUrl(host: string, id: string, original: boolean): string {
  return `https://${host}/api/access/datafile/${encodeURIComponent(id)}${original ? '?format=original' : ''}`;
}

/** The value of a compound field's sub-field: { typeName: { value } }. */
const sub = (o: Obj, key: string): string | undefined => (isObj(o[key]) ? str((o[key] as Obj).value) : undefined);

function fieldValue(fields: unknown[], typeName: string): unknown {
  for (const f of fields) if (isObj(f) && f.typeName === typeName) return f.value;
  return undefined;
}

function compound(fields: unknown[], typeName: string): Obj[] {
  const v = fieldValue(fields, typeName);
  return Array.isArray(v) ? v.filter(isObj) : [];
}

/** YYYY, YYYY-MM or YYYY-MM-DD (optionally with a time): anything else ("spring 1999", "c. 1850") is not an ISO date and is left out. */
function isoDate(v: string | undefined): string | undefined {
  const m = /^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?:T[\d:.]+Z?)?$/.exec((v ?? '').trim());
  return m?.[1];
}

function periodOf(fields: unknown[], typeName: string, startKey: string, endKey: string): { start?: string; end?: string } | undefined {
  let start: string | undefined;
  let end: string | undefined;
  for (const o of compound(fields, typeName)) {
    const s = isoDate(sub(o, startKey));
    const e = isoDate(sub(o, endKey));
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
  }
  return start || end ? { ...(start ? { start } : {}), ...(end ? { end } : {}) } : undefined;
}

type Box = { west: number; east: number; south: number; north: number };

function boxOf(o: Obj): Box | undefined {
  let west = num(sub(o, 'westLongitude'));
  let east = num(sub(o, 'eastLongitude'));
  let south = num(sub(o, 'southLatitude'));
  let north = num(sub(o, 'northLatitude'));
  // RepOD's own form: one field of "lon lat" lines (a closed ring or two corners), as in WKT.
  const ring = sub(o, 'geographicCoordinates');
  if (ring && [west, east, south, north].every((x) => x === undefined)) {
    const pts = ring
      .split(/\r?\n/)
      .map((l) => l.trim().split(/[\s,;]+/).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (pts.length < 2) return undefined;
    west = Math.min(...pts.map((p) => p[0]!));
    east = Math.max(...pts.map((p) => p[0]!));
    south = Math.min(...pts.map((p) => p[1]!));
    north = Math.max(...pts.map((p) => p[1]!));
  }
  if (west === undefined || east === undefined || south === undefined || north === undefined) return undefined;
  // A box that is not on the globe, or one that crosses the antimeridian (west > east), is not turned into a wrong box.
  if (west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) return undefined;
  return { west, east, south, north };
}

function bboxOf(fields: unknown[]): Box | undefined {
  const boxes = compound(fields, 'geographicBoundingBox').map(boxOf).filter((b): b is Box => !!b);
  if (boxes.length === 0) return undefined;
  return {
    west: Math.min(...boxes.map((b) => b.west)),
    east: Math.max(...boxes.map((b) => b.east)),
    south: Math.min(...boxes.map((b) => b.south)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
}

/** A version-level licence: { name, uri } (Dataverse 5.10+), or a bare name. "NONE" means custom terms follow in termsOfUse. */
function versionLicence(data: Obj): LicenceStatement | undefined {
  const l = data.license;
  if (isObj(l)) return buildStatement({ source: 'dataverse', field: 'license', text: str(l.name), uri: str(l.uri) });
  const name = str(l);
  if (name && name.toUpperCase() !== 'NONE') return buildStatement({ source: 'dataverse', field: 'license', text: name });
  return undefined;
}

/** Older installations state the licence per file. Distinct ones are repeated entries (a deposit may license data and documents differently). */
function fileLicences(entries: Obj[]): LicenceStatement[] {
  const seen = new Set<string>();
  const out: LicenceStatement[] = [];
  for (const f of entries) {
    // "All rights reserved" is a statement about the licence (the opposite of an open one), never "no statement".
    const reserved = str(f.termsOfUseType)?.toUpperCase() === 'ALL_RIGHTS_RESERVED';
    const name = str(f.licenseName) ?? (reserved ? 'All rights reserved' : undefined);
    const uri = str(f.licenseUrl);
    if (!name && !uri) continue;
    const key = `${name ?? ''}|${uri ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = buildStatement({ source: 'dataverse', field: `files.license[${out.length}]`, text: name, uri });
    if (s) out.push(s);
  }
  return out;
}

function embargoed(f: Obj, df: Obj, now: number): boolean {
  const e = isObj(f.embargo) ? f.embargo : isObj(df.embargo) ? df.embargo : undefined;
  const until = e ? Date.parse(str(e.dateAvailable) ?? '') : NaN;
  return Number.isFinite(until) && until > now;
}

function fileOf(host: string, f: Obj, now: number): DataverseFile | undefined {
  const df = isObj(f.dataFile) ? f.dataFile : {};
  const id = str(df.id);
  const stored = str(df.filename) ?? str(f.label);
  if (!id || !stored) return undefined;
  const heldBack = f.restricted === true || embargoed(f, df, now);
  const originalMime = str(df.originalFileFormat);
  const base = (n: string): string => n.replace(/\.[^./]+$/, '');
  const mimetype = str(df.contentType);
  if (originalMime && extOf(stored) === 'tab') {
    // Dataverse converted an uploaded table to .tab. The original is what the author uploaded; read it when the tool can, else the .tab.
    const originalName = str(df.originalFileName);
    const ext = MIME_EXTENSION[originalMime.toLowerCase()] ?? extOf(originalName ?? '');
    const label = str(df.originalFormatLabel);
    if (ext && READABLE.includes(ext)) {
      const name = originalName && extOf(originalName) === ext ? originalName : `${base(stored)}.${ext}`;
      const size = num(df.originalFileSize) ?? num(df.filesize);
      return { id, name, url: dataverseFileUrl(host, id, true), ...(size !== undefined ? { size } : {}), mimetype: originalMime, form: 'original', heldBack, ...(label ? { originalFormat: label } : {}), tabName: stored };
    }
    const size = num(df.filesize);
    return { id, name: stored, url: dataverseFileUrl(host, id, false), ...(size !== undefined ? { size } : {}), ...(mimetype ? { mimetype } : {}), form: 'tab', heldBack, ...(label ? { originalFormat: label } : {}) };
  }
  const size = num(df.filesize);
  return { id, name: stored, url: dataverseFileUrl(host, id, false), ...(size !== undefined ? { size } : {}), ...(mimetype ? { mimetype } : {}), form: 'as-uploaded', heldBack };
}

/** "doi:10.18150/C45FCC" -> "10.18150/C45FCC"; other kinds of persistent id (hdl:, perma:) have no DOI. */
export const doiOfPersistentId = (pid: string): string | undefined => /^doi:(10\.\d{4,9}\/\S+)$/i.exec(pid.trim())?.[1];

/**
 * `json` is the answer of the :latest-published endpoint ({ status: 'OK', data: <version> }); undefined when it is not one.
 * `now` is a parameter for the embargo test only.
 */
export function parseDataverseVersion(json: unknown, label: string, ctx: { host: string; pid: string }, now: number = Date.now()): DataverseRead | undefined {
  if (!isObj(json) || json.status === 'ERROR' || !isObj(json.data)) return undefined;
  const data = json.data;
  const blocks = isObj(data.metadataBlocks) ? data.metadataBlocks : {};
  const citation = isObj(blocks.citation) && Array.isArray(blocks.citation.fields) ? blocks.citation.fields : [];
  const geo = isObj(blocks.geospatial) && Array.isArray(blocks.geospatial.fields) ? blocks.geospatial.fields : [];

  const rec: MetadataRecord = {
    source: 'dataverse',
    label,
    licences: [],
    restrictionCodes: [],
    distributionLinks: [],
    files: [],
  };
  rec.title = str(fieldValue(citation, 'title'));
  const desc = compound(citation, 'dsDescription').map((d) => sub(d, 'dsDescriptionValue')).find((x): x is string => !!x);
  if (desc) rec.abstract = stripTags(desc) || undefined;

  const vn = num(data.versionNumber);
  const vm = num(data.versionMinorNumber) ?? 0;
  const versionLabel = vn !== undefined ? `${vn}.${vm}` : undefined;
  if (versionLabel) rec.version = versionLabel;

  const creators = compound(citation, 'author').map((a) => sub(a, 'authorName')).filter((n): n is string => !!n);
  if (creators.length > 0) rec.creators = creators;
  rec.publisher = dataverseName(ctx.host) ?? ctx.host;
  const year = /^\s*(\d{4})/.exec(str(data.releaseTime) ?? '');
  if (year) rec.publicationYear = Number(year[1]);
  rec.doi = doiOfPersistentId(ctx.pid) ?? doiOfPersistentId(str(data.datasetPersistentId) ?? '');
  rec.landingUrl = `https://${ctx.host}/dataset.xhtml?persistentId=${ctx.pid}`;

  // The time the data cover wins over the time they were collected; neither is the date of deposit or publication.
  const period = periodOf(citation, 'timePeriodCovered', 'timePeriodCoveredStart', 'timePeriodCoveredEnd') ?? periodOf(citation, 'dateOfCollection', 'dateOfCollectionStart', 'dateOfCollectionEnd');
  if (period) rec.temporalExtent = period;
  const bbox = bboxOf(geo);
  if (bbox) rec.bbox = bbox;

  const rawFiles = (Array.isArray(data.files) ? data.files : []).filter(isObj);
  const own = versionLicence(data);
  if (own) rec.licences.push(own);
  // Custom terms: the text of termsOfUse is a statement of its own; the classifier reads it fail-closed (unrecognised unless it names a licence cleanly).
  const terms = str(data.termsOfUse) ? stripTags(String(data.termsOfUse)) : undefined;
  if (terms) {
    const s = buildStatement({ source: 'dataverse', field: 'termsOfUse', text: terms });
    if (s) rec.licences.push(s);
  }
  if (rec.licences.length === 0) rec.licences.push(...fileLicences(rawFiles));

  const files: DataverseFile[] = [];
  const names = new Set<string>();
  for (const f of rawFiles) {
    const file = fileOf(ctx.host, f, now);
    if (!file) continue;
    if (names.has(file.name)) file.name = file.name.replace(/(\.[^./]+)?$/, `-${file.id}$1`);
    names.add(file.name);
    files.push(file);
  }
  const heldBack = files.filter((f) => f.heldBack).map((f) => f.name);
  if (heldBack.length > 0) rec.heldBackFiles = heldBack;
  rec.files = files.map((f) => ({ key: f.name, url: f.url, ...(f.size !== undefined ? { size: f.size } : {}), ...(f.mimetype ? { mimetype: f.mimetype } : {}) }));
  return { record: rec, files, ...(versionLabel ? { versionLabel } : {}), ...(str(data.versionState) ? { versionState: str(data.versionState) } : {}) };
}

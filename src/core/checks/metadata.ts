// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { makeFinding } from '../rules/registryCheck';
import { CANONICAL_VARIABLES, foldDiacritics, headerKey } from '../recognize/vocab';
import type { DataRow, Dataset, Finding, MetadataRecord, MetadataSource } from '../types';

/** Which record answers for extents when several give one: ISO first, then DataCite, then PANGAEA; never a union. */
const EXTENT_ORDER: readonly MetadataSource[] = ['iso19139', 'datacite', 'pangaea', 'zenodo', 'dataverse'];

function pick<T>(records: MetadataRecord[], get: (r: MetadataRecord) => T | undefined): T | undefined {
  for (const source of EXTENT_ORDER) {
    for (const r of records) {
      if (r.source !== source) continue;
      const v = get(r);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

/** Decimal places in the plain string form of a number (handles exponent notation). */
function decimalsOf(v: number): number {
  const s = String(Math.abs(v));
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(s);
  if (!m) return 0;
  return Math.max(0, (m[2]?.length ?? 0) - Number(m[3] ?? 0));
}
const halfUnit = (decimals: number): number => 0.5 * 10 ** -decimals;

/** Compares two ISO dates at the coarser of the two precisions (day at most). <0, 0, >0. */
function compareIso(a: string, b: string): number {
  const n = Math.min(a.length, b.length, 10);
  const x = a.slice(0, n);
  const y = b.slice(0, n);
  return x < y ? -1 : x > y ? 1 : 0;
}

function dateOutsideExtent(ds: Dataset): Finding[] {
  const ext = pick(ds.metadata, (r) => (r.temporalExtent && (r.temporalExtent.start || r.temporalExtent.end) ? r.temporalExtent : undefined));
  if (!ext) return [];
  const bad = ds.rows.filter((r) => {
    const iso = r.datetime?.iso;
    if (!iso) return false;
    return (!!ext.start && compareIso(iso, ext.start) < 0) || (!!ext.end && compareIso(iso, ext.end) > 0);
  });
  if (bad.length === 0) return [];
  return [
    makeFinding('META-DATE-OUTSIDE-EXTENT', {
      file: ds.file,
      lines: bad.map((r) => r.line),
      value: bad[0].datetime!.iso,
      params: { start: ext.start?.slice(0, 10) ?? '…', end: ext.end?.slice(0, 10) ?? '…', count: bad.length },
    }),
  ];
}

function pointOutsideBbox(ds: Dataset): Finding[] {
  const bbox = pick(ds.metadata, (r) => r.bbox);
  if (!bbox) return [];
  const inside = (row: DataRow & { lat: number; lon: number }): boolean => {
    const tLat = halfUnit(row.latDecimals ?? decimalsOf(row.lat));
    const tLon = halfUnit(row.lonDecimals ?? decimalsOf(row.lon));
    const latOk = row.lat >= bbox.south - tLat - halfUnit(decimalsOf(bbox.south)) && row.lat <= bbox.north + tLat + halfUnit(decimalsOf(bbox.north));
    const w = bbox.west - tLon - halfUnit(decimalsOf(bbox.west));
    const e = bbox.east + tLon + halfUnit(decimalsOf(bbox.east));
    // west > east: the box crosses the antimeridian.
    const lonOk = bbox.west <= bbox.east ? row.lon >= w && row.lon <= e : row.lon >= w || row.lon <= e;
    return latOk && lonOk;
  };
  // (0, 0) is a defect of its own (ROW-ZERO-COORD) and is not reported a second time as a point outside the box
  const bad = ds.rows.filter((r): r is DataRow & { lat: number; lon: number } => r.lat !== undefined && r.lon !== undefined && !(r.lat === 0 && r.lon === 0) && !inside(r as DataRow & { lat: number; lon: number }));
  if (bad.length === 0) return [];
  return [
    makeFinding('META-POINT-OUTSIDE-BBOX', {
      file: ds.file,
      lines: bad.map((r) => r.line),
      value: `${bad[0].lat}, ${bad[0].lon}`,
      params: { west: bbox.west, east: bbox.east, south: bbox.south, north: bbox.north, count: bad.length },
    }),
  ];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word-boundary match of a term (no letter or digit on either side, so 'DOC' is not found in 'doctor' and
 * 'salinity' not in 'hypersalinity'). Short acronyms (up to 4 characters, e.g. DIC, POC, DIN, pH) are matched
 * case-sensitively, because their lower-case forms are ordinary words; longer terms ignore case.
 */
function termRegex(term: string): RegExp {
  // Acronyms (DIC, POC, pH, SiO2) keep their case; every other term ignores it ('Tlen' opens a Polish sentence).
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, term.length <= 4 && term !== term.toLowerCase() ? '' : 'i');
}
/** Canonical variables that also satisfy a canonical found in the abstract. */
const COVERED_BY: Record<string, readonly string[]> = {
  nitrate: ['nitrate+nitrite'],
  nitrite: ['nitrate+nitrite'],
};

/**
 * After a term, these words (optionally behind a one-letter suffix such as the "-a" of "chlorophyll-a") make it a
 * modifier of an instrument, process or feature rather than a reported quantity: "chlorophyll-a fluorescence profile",
 * "chlorophyll-a maximum", "oxygen evolution", "oxygen sensor". Such a mention does not promise a column.
 */
const MODIFIED_BY = /^(?:-?[a-z](?![a-z]))?[\s-]+(?:fluorescence|fluorometer|fluorimeter|evolution|maximum|sensors?|probes?|optodes?|electrodes?|analy[sz]ers?)\b/i;

/**
 * Polish and French put the modifier BEFORE the term: "czujnik tlenu", "fluorescencja chlorofilu", "capteur d'oxygène",
 * "fluorescence de la chlorophylle". The last words before a match (folded text) decide, like MODIFIED_BY does after it.
 */
const MODIFIER_BEFORE = new RegExp(
  '(?:(?:czujnik\\w*|sond\\w*|fluorescencj\\w*|ewolucj\\w*|analizator\\w*|elektrod\\w*|optod\\w*|capteurs?|analyseurs?)' +
    "|(?:fluorescence|electrodes?|optodes?|evolution|analyseurs?)(?=[\\s'’]+(?:de|du|des|d)\\b))" +
    "(?:[\\s'’-]+(?:de|du|des|la|le|l|d|do|dla)(?![A-Za-z0-9]))*[\\s'’-]*$",
  'i',
);

/** Whole-word match, blind to diacritics: the term and the text are both folded ('zasolenie' = 'zasolenie', 'température' = 'temperature'). */
function mentions(abstractText: string, term: string): boolean {
  const abstract = foldDiacritics(abstractText);
  const re = new RegExp(termRegex(foldDiacritics(term)).source, termRegex(foldDiacritics(term)).flags + 'g');
  for (const m of abstract.matchAll(re)) {
    const before = abstract.slice(Math.max(0, m.index - 40), m.index);
    if (!MODIFIED_BY.test(abstract.slice(m.index + m[0].length, m.index + m[0].length + 40)) && !MODIFIER_BEFORE.test(before)) return true;
  }
  return false;
}

const DATA_FILE = /\.(csv|tsv|tab|txt|xlsx?|nc|json)$/i;

/** Distinct data files a record set points to (download links and Zenodo files). */
function dataFileCount(records: MetadataRecord[]): number {
  const names = new Set<string>();
  for (const r of records) {
    for (const l of r.distributionLinks) if (l.url && DATA_FILE.test(l.url.split(/[?#]/)[0])) names.add(l.url.split(/[?#]/)[0]);
    for (const f of r.files ?? []) if (DATA_FILE.test(f.key)) names.add(f.key);
  }
  return names.size;
}

function variableMissing(ds: Dataset): Finding[] {
  // No variable recognised at all: the tool does not understand this table, so "no column for X" would be a guess.
  if (!ds.variables.some((v) => v.canonical)) return [];
  // The abstract describes the whole record. This check sees one table, so it is only sound when the table is the
  // whole record: not one sheet of a workbook (label differs from file), not one of several data files.
  if (ds.label !== ds.file || dataFileCount(ds.metadata) > 1) return [];
  const abstract = ds.metadata.map((r) => r.abstract ?? '').filter(Boolean).join('\n');
  if (!abstract) return [];
  const have = new Set(ds.variables.map((v) => v.canonical).filter((c): c is string => !!c));
  const headers = ds.variables.map((v) => headerKey(v.header));
  const out: Finding[] = [];
  for (const cv of CANONICAL_VARIABLES) {
    if (have.has(cv.key) || (COVERED_BY[cv.key] ?? []).some((k) => have.has(k))) continue;
    const terms = Object.values(cv.abstractTerms).flat().filter((t, i, a) => t && a.indexOf(t) === i);
    const found = terms.filter((t) => mentions(abstract, t)).sort((a, b) => b.length - a.length);
    if (found.length === 0) continue;
    // A header that contains any of the terms (e.g. "Dissolved Silica (umol/L)") is a column for it.
    if (terms.some((t) => headers.some((h) => h.includes(headerKey(t))))) continue;
    out.push(makeFinding('META-VARIABLE-MISSING', { file: ds.file, field: 'abstract', value: found[0], params: { term: found[0] } }));
  }
  return out;
}

function noDates(ds: Dataset): Finding[] {
  if (ds.rows.length === 0 || ds.layout.unsupported) return [];
  // A raw date cell that did not parse still means the table has a date column (ROW-DATE-UNPARSEABLE reports it).
  const rowDate = ds.rows.some((r) => r.datetime !== undefined || (r.dateRaw !== undefined && r.dateRaw !== null && String(r.dateRaw).trim() !== ''));
  // DataCite 'Collected' dates are parsed into temporalExtent; publication/issued dates are never kept.
  const metaDate = ds.metadata.some((r) => r.temporalExtent && (r.temporalExtent.start || r.temporalExtent.end));
  return rowDate || metaDate ? [] : [makeFinding('META-NO-DATES', { file: ds.file })];
}

/**
 * META-NO-POSITIONS, the twin of META-NO-DATES (same scoping: a table with rows and a supported layout). It fires only when nothing
 * anywhere is a position: no latitude / longitude column is mapped (a column whose cells are blank or unreadable is still a column,
 * ROW-NO-COORD / ROW-NON-NUMERIC / DWC-TERM-EMPTY say so), no row has a position, and no record has a bounding box (a point is a
 * degenerate box). A position in the metadata only is left to the data-against-metadata rules.
 */
function noPositions(ds: Dataset): Finding[] {
  if (ds.rows.length === 0 || ds.layout.unsupported) return [];
  const mapped = ds.mappings.some((m) => m.columns.some((c) => c.role.kind === 'latitude' || c.role.kind === 'longitude'));
  const rowPos = ds.rows.some((r) => r.lat !== undefined || r.lon !== undefined || r.posBlank !== undefined);
  const metaPos = ds.metadata.some((r) => r.bbox !== undefined);
  return mapped || rowPos || metaPos ? [] : [makeFinding('META-NO-POSITIONS', { file: ds.file })];
}

/** Category A — metadata extents, abstract and dates compared with the data (Task 7). */
export function checkMetadataVsData(ds: Dataset): Finding[] {
  return [...noDates(ds), ...noPositions(ds), ...dateOutsideExtent(ds), ...pointOutsideBbox(ds), ...variableMissing(ds)];
}

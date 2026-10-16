// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Finding, LicenceStatement, MetadataRecord, ParsedFile, RawRow } from '../types';
import { toSpdx } from '../metadata/licence';
import type { DecodedText } from '../values/encoding';
import { encodingFinding, raggedFinding, splitPhysicalLines } from './shared';

const KEY_LINE = /^([A-Za-z][A-Za-z() \/]*):\t(.*)$/;

/** Header block entries: key -> value lines (first line after the key, then TAB continuation lines). */
function readBlock(lines: readonly string[]): Map<string, string[]> {
  const entries = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of lines) {
    if (line.startsWith('\t')) {
      current?.push(line.replace(/^\t+/, ''));
      continue;
    }
    const m = KEY_LINE.exec(line);
    if (m) {
      current = entries.get(m[1]) ?? [];
      entries.set(m[1], current);
      current.push(m[2]);
    }
  }
  return entries;
}

/** "Authors (2099): Title. PANGAEA, https://doi.org/…" -> title and DOI. */
function fromCitation(citation: string): { title?: string; doi?: string } {
  const c = citation.replace(/\s+/g, ' ').trim();
  const t = /\((?:\d{4}[a-z]?|n\.d\.)\):\s*(.+?)(?:\.?\s+PANGAEA\b|$)/.exec(c);
  const d = /doi\.org\/(10\.\d+\/[^\s,;]+)/.exec(c);
  return { title: t?.[1]?.trim() || undefined, doi: d?.[1]?.replace(/[.)]+$/, '') };
}

/** "Long name [unit] (Short) * PI: …" -> long name and unit. Units come from the bracket only. */
function parseParameter(line: string): { name: string; unit?: string } {
  const head = line.split(' * ')[0].trim();
  const m = /^(.*?)(?:\s*\[([^\]]*)\])?(?:\s*\(([^()]*)\))?$/.exec(head);
  const name = (m?.[1] ?? head).trim() || head;
  const unit = m?.[2]?.trim();
  return unit ? { name, unit } : { name };
}

function coverageOf(lines: readonly string[]): Pick<MetadataRecord, 'bbox' | 'temporalExtent'> {
  const kv = new Map<string, string>();
  for (const seg of lines.join(' * ').split(' * ')) {
    const m = /^([A-Z][A-Z0-9\/ -]*):\s*(.+)$/.exec(seg.trim());
    if (m && !kv.has(m[1])) kv.set(m[1], m[2].trim());
  }
  const num = (k: string): number | undefined => {
    const raw = kv.get(k);
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const out: Pick<MetadataRecord, 'bbox' | 'temporalExtent'> = {};
  const south = num('SOUTH-BOUND LATITUDE');
  const north = num('NORTH-BOUND LATITUDE');
  const west = num('WEST-BOUND LONGITUDE');
  const east = num('EAST-BOUND LONGITUDE');
  const lat = num('LATITUDE');
  const lon = num('LONGITUDE');
  if (south !== undefined && north !== undefined && west !== undefined && east !== undefined) out.bbox = { west, east, south, north };
  else if (lat !== undefined && lon !== undefined) out.bbox = { west: lon, east: lon, south: lat, north: lat };
  const day = (k: string) => /^\d{4}-\d{2}-\d{2}/.exec(kv.get(k) ?? '')?.[0];
  const start = day('DATE/TIME START');
  const end = day('DATE/TIME END');
  if (start || end) out.temporalExtent = { start, end };
  return out;
}

function licenceOf(lines: readonly string[]): LicenceStatement | undefined {
  const text = lines.join(' ').trim();
  if (!text) return undefined;
  const uri = /\(URI:\s*([^)\s]+)\)/.exec(text)?.[1];
  const l: LicenceStatement = { source: 'pangaea', field: 'License', text };
  if (uri) l.uri = uri;
  const spdx = toSpdx(text, uri);
  if (spdx) l.spdx = spdx;
  return l;
}

function metadataOf(block: Map<string, string[]>, fileName: string): MetadataRecord {
  const rec: MetadataRecord = { source: 'pangaea', label: fileName, licences: [], restrictionCodes: [], distributionLinks: [] };
  const cit = block.get('Citation');
  if (cit) {
    const { title, doi } = fromCitation(cit.join(' '));
    if (title) rec.title = title;
    if (doi) rec.doi = doi;
  }
  const abs = block.get('Abstract')?.join(' ').trim();
  if (abs) rec.abstract = abs;
  const lic = licenceOf(block.get('License') ?? []);
  if (lic) rec.licences.push(lic);
  Object.assign(rec, coverageOf(block.get('Coverage') ?? []));
  const params = (block.get('Parameter(s)') ?? []).filter((l) => l.trim() !== '').map(parseParameter);
  if (params.length > 0) rec.parameters = params;
  return rec;
}

/**
 * Parses a PANGAEA textfile: the "/* DATA DESCRIPTION: … *\/" block becomes embeddedMetadata, the first line
 * after it is the table header, and every later line is a data row. Line numbers are physical file lines, the
 * header block included. Parameter(s) lines are listed in column order so they match the table header by position.
 */
export function parsePangaeaText(text: string, fileName: string, decoded?: Pick<DecodedText, 'encoding' | 'fallback'>): ParsedFile {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = splitPhysicalLines(text);
  const findings: Finding[] = [];
  const enc = decoded ? encodingFinding(fileName, decoded) : undefined;
  if (enc) findings.push(enc);

  const end = lines.findIndex((l, i) => i > 0 && l.trim().endsWith('*/'));
  const blockLines = lines.slice(1, end < 0 ? lines.length : end);
  const file: ParsedFile = {
    fileName,
    kind: 'pangaea',
    sheets: [],
    date1904: false,
    decimalComma: false,
    encoding: decoded?.encoding ?? 'utf-8',
    embeddedMetadata: metadataOf(readBlock(blockLines), fileName),
    findings,
  };
  if (end < 0) return file;

  const isBlank = (l: string) => !l.includes('\t') && l.trim() === '';
  let h = end + 1;
  while (h < lines.length && isBlank(lines[h])) h++;
  if (h >= lines.length) return file;

  const header = lines[h].split('\t');
  const rows: RawRow[] = [];
  for (let i = h + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    const cells = lines[i].split('\t');
    rows.push({ line: i + 1, cells, fieldCount: cells.length });
  }
  file.sheets.push({ name: fileName, header, headerLine: h + 1, rows });
  const rag = raggedFinding(fileName, fileName, header.length, rows);
  if (rag) findings.push(rag);
  return file;
}

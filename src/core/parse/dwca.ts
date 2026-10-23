// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Darwin Core Archive (DwC-A, the zip OBIS and GBIF IPTs publish) -> a ParsedFile whose sheet is the CORE table,
// read exactly as if the user had dropped that table. meta.xml is authoritative for the columns: the header is the
// term local names it lists, never the file's own header row (which is skipped as `ignoreHeaderLines`).
// Never throws: every refusal is a parse-level Finding, so the page cannot be broken by a hostile archive.
import type { Finding, ParsedFile, RawRow } from '../types';
import { makeFinding } from '../rules/registry';
import { decodeText } from '../values/encoding';
import { elementChildren, parseXml } from '../metadata/xml';
import { tokenizeCsv } from './csv';
import { encodingFinding, raggedFinding } from './shared';
import { openZip, ZipError, ZIP_LIMITS, type Inflate, type ZipArchive, type ZipLimits } from './zip';

/** Core rows read at most. /check had no row limit before; 200 000 rows of a wide occurrence table is a few hundred MB in the worker. */
export const DWCA_MAX_ROWS = 200_000;
/** meta.xml and eml.xml are small by nature; anything bigger is not read. */
const MAX_XML_BYTES = 5 * 1024 * 1024;

export interface DwcaOptions {
  limits?: ZipLimits;
  maxRows?: number;
}

interface TableSpec {
  rowType: string;
  /** local name of the rowType, e.g. Occurrence */
  type: string;
  location: string | undefined;
  locations: number;
  delimiter: string;
  lineTerminator: string;
  enclosure: string;
  ignoreHeaderLines: number;
  encoding: string;
  idIndex: number | undefined;
  fields: { index: number; term: string }[];
}

class DwcaError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message);
  }
}

const localName = (uri: string): string => uri.replace(/[#/]+$/, '').split(/[/#:]/).pop() ?? uri;

function unescape(v: string | null, dflt: string): string {
  if (v === null) return dflt;
  return v.replace(/\\(t|n|r|\\)/g, (_m, c: string) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[c] ?? c);
}

const byLocal = (el: Element, name: string): Element[] => elementChildren(el).filter((c) => c.localName === name);

function tableSpec(el: Element, isCore: boolean): TableSpec {
  const rowType = el.getAttribute('rowType') ?? '';
  const locs = byLocal(el, 'files').flatMap((f) => byLocal(f, 'location')).map((l) => (l.textContent ?? '').trim()).filter((l) => l !== '');
  const idEl = byLocal(el, isCore ? 'id' : 'coreid')[0];
  const idRaw = idEl?.getAttribute('index');
  const fields = byLocal(el, 'field').flatMap((f) => {
    const index = f.getAttribute('index');
    const term = f.getAttribute('term');
    return index !== null && /^\d+$/.test(index) && term ? [{ index: Number(index), term }] : [];
  });
  const ign = el.getAttribute('ignoreHeaderLines');
  return {
    rowType,
    type: localName(rowType),
    location: locs[0],
    locations: locs.length,
    delimiter: unescape(el.getAttribute('fieldsTerminatedBy'), ','),
    lineTerminator: unescape(el.getAttribute('linesTerminatedBy'), '\n'),
    enclosure: unescape(el.getAttribute('fieldsEnclosedBy'), '"'),
    ignoreHeaderLines: ign !== null && /^\d+$/.test(ign) ? Number(ign) : 0,
    encoding: (el.getAttribute('encoding') ?? 'UTF-8').trim(),
    idIndex: idRaw !== null && idRaw !== undefined && /^\d+$/.test(idRaw) ? Number(idRaw) : undefined,
    fields,
  };
}

/** Header of the core sheet: the term local names at their indexes, 'id' for the id column, colN for gaps, unique. */
function headerOf(spec: TableSpec): string[] {
  const names = new Map<number, string>();
  if (spec.idIndex !== undefined) names.set(spec.idIndex, 'id');
  for (const f of spec.fields) names.set(f.index, localName(f.term));
  const width = Math.max(-1, ...names.keys()) + 1;
  const seen = new Set<string>();
  const header: string[] = [];
  for (let i = 0; i < width; i++) {
    let n = names.get(i) ?? `col${i}`;
    for (let k = 2; seen.has(n.toLowerCase()); k++) n = `${names.get(i) ?? `col${i}`}_${k}`;
    seen.add(n.toLowerCase());
    header.push(n);
  }
  return header;
}

const isByteText = (enc: string): boolean => !/^(?:utf-?16|ucs-?2|utf-?32)/i.test(enc);

/** Byte offset just after the `n`-th line terminator, or bytes.length when there are fewer lines. */
function offsetAfterLines(bytes: Uint8Array, term: number, n: number): number {
  let seen = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === term && ++seen === n) return i + 1;
  }
  return bytes.length;
}

function countLines(bytes: Uint8Array, term: number): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === term) n++;
  if (bytes.length > 0 && bytes[bytes.length - 1] !== term) n++;
  return n;
}

async function readXml(zip: ZipArchive, name: string, inflate: Inflate): Promise<Document> {
  const entry = zip.find(name);
  if (!entry) throw new DwcaError('DWCA-META-INVALID', `${name} is missing`);
  if (entry.size > MAX_XML_BYTES) throw new DwcaError('DWCA-META-INVALID', `${name} is larger than ${MAX_XML_BYTES} bytes`);
  const text = new TextDecoder('utf-8').decode(await zip.read(entry, inflate)).replace(/^﻿/, '');
  // no DTD: a DwC-A never needs one, and an internal entity table is how XML bombs are made
  if (/<!(?:DOCTYPE|ENTITY)/i.test(text)) throw new DwcaError('DWCA-META-INVALID', `${name} has a DTD`);
  try {
    return parseXml(text, name);
  } catch {
    throw new DwcaError('DWCA-META-INVALID', `${name} is not well-formed XML`);
  }
}

interface Eml {
  title?: string;
  version?: string;
}

/** Title and version/date of the dataset from eml.xml; a missing or unreadable eml.xml is not an error. */
async function readEml(zip: ZipArchive, name: string, inflate: Inflate): Promise<Eml> {
  try {
    const doc = await readXml(zip, name, inflate);
    const root = doc.documentElement;
    const dataset = elementChildren(root).find((c) => c.localName === 'dataset');
    const text = (n: string): string | undefined => {
      const t = dataset ? byLocal(dataset, n)[0]?.textContent?.replace(/\s+/g, ' ').trim() : undefined;
      return t || undefined;
    };
    const pkg = root.getAttribute('packageId')?.trim();
    const v = pkg?.includes('/') ? pkg.slice(pkg.lastIndexOf('/') + 1) : undefined;
    const pub = text('pubDate');
    const parts = [v ? (/^\d/.test(v) ? `v${v}` : v) : undefined, pub ? `published ${pub}` : undefined].filter((x): x is string => !!x);
    return { title: text('title'), version: parts.length > 0 ? parts.join(', ') : undefined };
  } catch {
    return {};
  }
}

const unreadable = (fileName: string, reason: string): ParsedFile => failed(fileName, [makeFinding('IN-DWCA-UNREADABLE', { file: fileName, params: { reason } })]);

const failed = (fileName: string, findings: Finding[]): ParsedFile => ({ fileName, kind: 'unknown', sheets: [], date1904: false, decimalComma: false, encoding: 'utf-8', findings });

/** Rows of an extension file, for information only; undefined when it cannot be read within the limits. */
async function countRows(zip: ZipArchive, spec: TableSpec, inflate: Inflate): Promise<number | undefined> {
  const entry = spec.location ? zip.find(spec.location) : undefined;
  if (!entry || !isByteText(spec.encoding)) return undefined;
  try {
    const bytes = await zip.read(entry, inflate);
    return Math.max(0, countLines(bytes, spec.lineTerminator.endsWith('\r') ? 13 : 10) - spec.ignoreHeaderLines);
  } catch {
    return undefined;
  }
}

/** Reads a Darwin Core Archive. `inflate` is injected (DecompressionStream in the browser, zlib in tests). */
export async function parseDwca(fileName: string, bytes: Uint8Array, inflate: Inflate, opts: DwcaOptions = {}): Promise<ParsedFile> {
  try {
    return await read(fileName, bytes, inflate, opts);
  } catch (e) {
    if (e instanceof ZipError) return unreadable(fileName, e.code);
    if (e instanceof DwcaError) return unreadable(fileName, e.reason);
    return unreadable(fileName, 'DWCA-UNREADABLE');
  }
}

async function read(fileName: string, bytes: Uint8Array, inflate: Inflate, opts: DwcaOptions): Promise<ParsedFile> {
  const maxRows = opts.maxRows ?? DWCA_MAX_ROWS;
  const zip = openZip(bytes, opts.limits ?? ZIP_LIMITS);
  if (!zip.find('meta.xml')) return failed(fileName, [makeFinding('IN-DWCA-NOT-ARCHIVE', { file: fileName })]);

  const meta = await readXml(zip, 'meta.xml', inflate);
  const root = meta.documentElement;
  if (root.localName !== 'archive') throw new DwcaError('DWCA-META-INVALID', 'meta.xml has no archive element');
  const coreEl = byLocal(root, 'core')[0];
  if (!coreEl) throw new DwcaError('DWCA-META-INVALID', 'meta.xml has no core');
  const core = tableSpec(coreEl, true);
  if (core.type !== 'Occurrence' && core.type !== 'Event') {
    return failed(fileName, [makeFinding('IN-DWCA-UNSUPPORTED-CORE', { file: fileName, params: { core: core.type || core.rowType || 'unknown' } })]);
  }
  if (!core.location || core.locations !== 1) throw new DwcaError('DWCA-META-INVALID', 'the core must name exactly one file');
  if (core.fields.length === 0) throw new DwcaError('DWCA-META-INVALID', 'the core lists no fields');
  const entry = zip.find(core.location);
  if (!entry) throw new DwcaError('DWCA-CORE-MISSING', `${core.location} is not in the archive`);

  const emlName = root.getAttribute('metadata')?.trim() || 'eml.xml';
  const eml = await readEml(zip, emlName, inflate);

  const findings: Finding[] = [];
  findings.push(
    makeFinding('IN-DWCA-VERSION', {
      file: fileName,
      params: { title: (eml.title ?? fileName).slice(0, 100), version: eml.version ?? 'n/a', core: core.type },
    }),
  );
  if (core.type === 'Event') {
    const ext = byLocal(root, 'extension').map((x) => tableSpec(x, false)).find((x) => x.type === 'Occurrence');
    const n = ext ? await countRows(zip, ext, inflate) : undefined;
    if (n !== undefined) findings.push(makeFinding('IN-DWCA-EVENT-CORE', { file: fileName, params: { occurrences: n } }));
  }

  // The core file: a physical line is a row; the cap cuts the text, and so the work, before it is decoded.
  const data = await zip.read(entry, inflate);
  const byteText = isByteText(core.encoding);
  const termByte = core.lineTerminator.endsWith('\r') ? 13 : 10;
  let body = data;
  let total: number | undefined;
  if (byteText) {
    total = Math.max(0, countLines(data, termByte) - core.ignoreHeaderLines);
    if (total > maxRows) body = data.subarray(0, offsetAfterLines(data, termByte, core.ignoreHeaderLines + maxRows));
  }

  let text: string;
  let encoding: string;
  if (/^(?:utf-?8|ascii|us-ascii)$/i.test(core.encoding)) {
    const d = decodeText(body);
    text = d.text;
    encoding = d.encoding;
    const f = encodingFinding(fileName, d);
    if (f) findings.push(f);
  } else {
    try {
      text = new TextDecoder(core.encoding).decode(body);
    } catch {
      throw new DwcaError('DWCA-META-INVALID', `unknown encoding ${core.encoding}`);
    }
    encoding = core.encoding.toLowerCase();
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delim = core.delimiter;
  if (delim.length !== 1) throw new DwcaError('DWCA-META-INVALID', 'fieldsTerminatedBy must be one character');
  if (core.enclosure.length > 1) throw new DwcaError('DWCA-META-INVALID', 'fieldsEnclosedBy must be one character');
  const records = tokenizeCsv(text, delim, Infinity, core.enclosure);

  const header = headerOf(core);
  const dataRecords = records.filter((r) => r.line > core.ignoreHeaderLines && !r.blank);
  if (total === undefined) total = dataRecords.length;
  const rows: RawRow[] = dataRecords.slice(0, maxRows).map((r) => ({ line: r.line, cells: r.fields, fieldCount: r.fields.length }));
  if (total > rows.length) findings.push(makeFinding('IN-DWCA-PARTIAL', { file: fileName, params: { read: rows.length, total } }));

  const sheet = { name: core.location, header, headerLine: core.ignoreHeaderLines, rows };
  const rag = raggedFinding(fileName, sheet.name, header.length, rows);
  if (rag) findings.push(rag);
  return { fileName, kind: 'csv', sheets: [sheet], date1904: false, decimalComma: false, encoding, findings };
}

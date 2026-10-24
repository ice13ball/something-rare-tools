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
/** A core table is at most this many columns wide, indexed fields, default-value fields and the highest field index together: a hostile meta.xml cannot widen every row. */
export const DWCA_MAX_COLUMNS = 1000;
/** Default-value fields (`<field default=…/>` without an index) a core may have; each is copied into every row. */
export const DWCA_MAX_DEFAULTS = 200;
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
  /** <field default="…" term="…"/> without an index: the same value in every row */
  defaults: { term: string; value: string }[];
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
  const defaults = byLocal(el, 'field').flatMap((f) => {
    const term = f.getAttribute('term');
    const value = f.getAttribute('default');
    return f.getAttribute('index') === null && term && value !== null ? [{ term, value }] : [];
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
    defaults,
  };
}

/** Header of the core sheet: the term local names at their indexes, 'id' for the id column, colN for gaps, unique. */
function headerOf(spec: TableSpec): string[] {
  const names = new Map<number, string>();
  if (spec.idIndex !== undefined) names.set(spec.idIndex, 'id');
  let width = 0;
  for (const f of spec.fields) names.set(f.index, localName(f.term));
  for (const k of names.keys()) if (k >= width) width = k + 1;
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

/** The names of the default-value columns, appended after the indexed ones, unique within the whole header. */
function defaultNames(spec: TableSpec, indexed: readonly string[]): string[] {
  const seen = new Set(indexed.map((n) => n.toLowerCase()));
  const next = new Map<string, number>(); // one running suffix per base name: linear however many repeat
  return spec.defaults.map((d) => {
    const base = localName(d.term);
    const key = base.toLowerCase();
    let n = base;
    let k = next.get(key) ?? 2;
    while (seen.has(n.toLowerCase())) n = `${base}_${k++}`;
    next.set(key, k);
    seen.add(n.toLowerCase());
    return n;
  });
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

/** Lines from `from` on that hold anything but white space: what a capped read left unread (blank lines are not rows). */
function countNonBlankLines(bytes: Uint8Array, from: number, term: number): number {
  let n = 0;
  let blank = true;
  for (let i = from; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === term) {
      if (!blank) n++;
      blank = true;
    } else if (b !== 13 && b !== 10 && b !== 32 && b !== 9) {
      blank = false;
    }
  }
  if (!blank) n++;
  return n;
}

function countLines(bytes: Uint8Array, term: number): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === term) n++;
  if (bytes.length > 0 && bytes[bytes.length - 1] !== term) n++;
  return n;
}

/** Where the archive's files live: the root, or the single top-level folder a zip of a folder has (found by its meta.xml). */
function archiveRoot(zip: ZipArchive): string | undefined {
  if (zip.find('meta.xml')) return '';
  const inFolder = zip.entries.filter((e) => e.safe && /^[^/]+\/meta\.xml$/.test(e.name));
  return inFolder.length === 1 ? inFolder[0]!.name.slice(0, -'meta.xml'.length) : undefined;
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
async function countRows(zip: ZipArchive, spec: TableSpec, inflate: Inflate, base: string): Promise<number | undefined> {
  const entry = spec.location ? zip.find(base + spec.location) : undefined;
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
  // Named .zip but not a zip at all (an HTML error page, a text file): not an archive, said as such rather than as a damaged zip.
  if (!(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) return failed(fileName, [makeFinding('IN-DWCA-NOT-ARCHIVE', { file: fileName })]);
  const zip = openZip(bytes, opts.limits ?? ZIP_LIMITS);
  const base0 = archiveRoot(zip);
  if (base0 === undefined) return failed(fileName, [makeFinding('IN-DWCA-NOT-ARCHIVE', { file: fileName })]);
  const base: string = base0;

  const meta = await readXml(zip, base + 'meta.xml', inflate);
  const root = meta.documentElement;
  if (root.localName !== 'archive') throw new DwcaError('DWCA-META-INVALID', 'meta.xml has no archive element');
  const coreEl = byLocal(root, 'core')[0];
  if (!coreEl) throw new DwcaError('DWCA-META-INVALID', 'meta.xml has no core');
  const core = tableSpec(coreEl, true);
  if (core.type !== 'Occurrence' && core.type !== 'Event') {
    return failed(fileName, [makeFinding('IN-DWCA-UNSUPPORTED-CORE', { file: fileName, params: { core: core.type || core.rowType || 'unknown' } })]);
  }
  if (!core.location || core.locations !== 1) throw new DwcaError('DWCA-META-INVALID', 'the core must name exactly one file');
  // Bounds first, before any header or row is built: the counts come from a stranger's meta.xml.
  let maxIndex = core.idIndex ?? -1;
  for (const f of core.fields) if (f.index > maxIndex) maxIndex = f.index;
  if (core.defaults.length > DWCA_MAX_DEFAULTS || core.fields.length > DWCA_MAX_COLUMNS || maxIndex + 1 + core.defaults.length > DWCA_MAX_COLUMNS) {
    throw new DwcaError('DWCA-META-INVALID', `the core is wider than ${DWCA_MAX_COLUMNS} columns or has more than ${DWCA_MAX_DEFAULTS} default values`);
  }
  if (core.fields.length === 0) throw new DwcaError('DWCA-META-INVALID', 'the core lists no fields');
  const entry = zip.find(base + core.location);
  if (!entry) throw new DwcaError('DWCA-CORE-MISSING', `${core.location} is not in the archive`);

  const emlName = root.getAttribute('metadata')?.trim() || 'eml.xml';
  const eml = await readEml(zip, base + emlName, inflate);

  const findings: Finding[] = [];
  findings.push(
    makeFinding('IN-DWCA-VERSION', {
      file: fileName,
      params: { title: (eml.title ?? fileName).slice(0, 100), version: eml.version ?? 'n/a', core: core.type },
    }),
  );
  if (core.type === 'Event') {
    const ext = byLocal(root, 'extension').map((x) => tableSpec(x, false)).find((x) => x.type === 'Occurrence');
    const n = ext ? await countRows(zip, ext, inflate, base) : undefined;
    if (n !== undefined) findings.push(makeFinding('IN-DWCA-EVENT-CORE', { file: fileName, params: { occurrences: n } }));
  }

  // The core file: the cap cuts the text, and so the work, before it is decoded. The cut is made after `maxRows` physical lines
  // (a line is a row unless it is blank or inside a quoted field); what the cut left unread is counted below.
  const data = await zip.read(entry, inflate);
  const byteText = isByteText(core.encoding);
  const termByte = core.lineTerminator.endsWith('\r') ? 13 : 10;
  const delim = core.delimiter;
  if (delim.length !== 1) throw new DwcaError('DWCA-META-INVALID', 'fieldsTerminatedBy must be one character');
  if (core.enclosure.length > 1) throw new DwcaError('DWCA-META-INVALID', 'fieldsEnclosedBy must be one character');

  let encoding = core.encoding.toLowerCase();
  let encodingNote: Finding | undefined;
  /** Decodes and tokenises the first `cut` bytes of the core file. */
  const tokenise = (cut: number): { dataRecords: ReturnType<typeof tokenizeCsv> } => {
    const body = data.subarray(0, cut);
    let text: string;
    if (/^(?:utf-?8|ascii|us-ascii)$/i.test(core.encoding)) {
      const d = decodeText(body);
      text = d.text;
      encoding = d.encoding;
      encodingNote = encodingFinding(fileName, d);
    } else {
      try {
        text = new TextDecoder(core.encoding).decode(body);
      } catch {
        throw new DwcaError('DWCA-META-INVALID', `unknown encoding ${core.encoding}`);
      }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { dataRecords: tokenizeCsv(text, delim, Infinity, core.enclosure).filter((r) => r.line > core.ignoreHeaderLines && !r.blank) };
  };

  let cutAt = data.length;
  let dataRecords: ReturnType<typeof tokenizeCsv>;
  if (byteText && countLines(data, termByte) - core.ignoreHeaderLines > maxRows) {
    // Cut after `maxRows` physical lines; blank lines and quoted line breaks make that fewer than `maxRows` rows, so the cut is
    // moved on by the shortfall until the rows are there (or the file ends).
    let lines = core.ignoreHeaderLines + maxRows;
    for (let round = 0; ; round++) {
      cutAt = offsetAfterLines(data, termByte, lines);
      dataRecords = tokenise(cutAt).dataRecords;
      const short = maxRows - dataRecords.length;
      if (short <= 0 || cutAt >= data.length || round >= 8) break;
      lines += short;
    }
  } else {
    dataRecords = tokenise(data.length).dataRecords;
  }
  if (encodingNote) findings.push(encodingNote);

  const indexed = headerOf(core);
  // Rows of the table = non-blank records. Taken from what was tokenised, never from the line count alone (a file whose
  // line endings differ from meta.xml's, blank lines and quoted line breaks all make the two differ); plus what the cut left unread.
  const unread = cutAt < data.length ? countNonBlankLines(data, cutAt, termByte) : 0;
  const total = dataRecords.length + unread;
  const kept = dataRecords.slice(0, maxRows);
  const defaults = core.defaults.map((d) => d.value);
  const header = [...indexed, ...defaultNames(core, indexed)];
  const rows: RawRow[] = kept.map((r) => ({
    line: r.line,
    // defaults sit after the indexed columns: extra trailing fields of a row (an unmapped column, a trailing tab) are cut first
    cells: defaults.length === 0 ? r.fields : [...r.fields.slice(0, indexed.length), ...Array<string>(Math.max(0, indexed.length - r.fields.length)).fill(''), ...defaults],
    fieldCount: r.fields.length,
  }));
  if (total > rows.length) findings.push(makeFinding('IN-DWCA-PARTIAL', { file: fileName, params: { read: rows.length, total } }));

  const sheet = { name: core.location, header, headerLine: core.ignoreHeaderLines, rows };
  const rag = raggedFinding(fileName, sheet.name, indexed.length, rows);
  if (rag) findings.push(rag);
  return { fileName, kind: 'csv', sheets: [sheet], date1904: false, decimalComma: false, encoding, findings, dwca: { core: core.type, partial: total > rows.length } };
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { MetadataRecord, ParsedFile } from '../types';
import { parseDataciteJson, parseDataciteXml } from '../metadata/datacite';
import { parseIsoRecord } from '../metadata/iso19115-3';
import { parseZenodoRecord } from '../metadata/zenodo';
import { decodeText } from '../values/encoding';
import { parseCsvText } from './csv';
import { parseDwca, type DwcaOptions } from './dwca';
import { parsePangaeaText } from './pangaea';
import { ParseError, encodingFinding } from './shared';
import { parseXlsx } from './xlsx';
import { looksLikeWorkbook, openZip, ZipError, type Inflate, type ZipLimits } from './zip';

export { ParseError } from './shared';
export { parseCsvText } from './csv';
export { parseXlsx } from './xlsx';
export { parsePangaeaText } from './pangaea';
export { parseDwca, DWCA_MAX_ROWS } from './dwca';
export { ZipError, openZip, ZIP_LIMITS } from './zip';
export type { Inflate } from './zip';

const startsWith = (b: Uint8Array, magic: readonly number[]) => magic.every((m, i) => b[i] === m);
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // xlsx
const CFB = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function metadataFile(fileName: string, bytesText: ReturnType<typeof decodeText>, record: () => MetadataRecord): ParsedFile {
  let rec: MetadataRecord;
  try {
    rec = record();
  } catch (e) {
    if (e instanceof ParseError) throw e;
    const msg = e instanceof Error ? e.message.replace(`${fileName}: `, '') : 'unknown error';
    throw new ParseError(fileName, `could not be read as a metadata record (${msg})`);
  }
  const f = encodingFinding(fileName, bytesText);
  return {
    fileName,
    kind: 'metadata',
    sheets: [],
    date1904: false,
    decimalComma: false,
    encoding: bytesText.encoding,
    embeddedMetadata: rec,
    findings: f ? [f] : [],
  };
}

/**
 * Parses any supported upload. Dispatch: magic bytes first (PK -> xlsx, D0CF11E0 -> legacy xls via SheetJS,
 * %PDF -> pdf with no sheets), then a content sniff (PANGAEA header block, ISO 19139 / DataCite XML, DataCite or
 * Zenodo JSON), else CSV. The extension is not consulted: a renamed file is read for what it is.
 *
 * Never returns a half-parsed result for an unreadable file: it throws ParseError (plain English message that
 * names the file) for a corrupt workbook, malformed XML/JSON, or JSON that is neither a DataCite nor a Zenodo
 * record. Oddities inside a readable file are Findings on the result, not errors.
 */
/** Only the zip structure is checked before SheetJS reads a workbook: no size or ratio limit applies to a workbook here. */
const WORKBOOK_ZIP: ZipLimits = { maxArchiveBytes: Infinity, maxTotalBytes: Infinity, maxEntryBytes: Infinity, maxEntries: 100_000, maxRatio: Infinity, ratioFloorBytes: Infinity };

export function parseFile(fileName: string, bytes: Uint8Array): ParsedFile {
  if (startsWith(bytes, ZIP)) {
    // SheetJS never returns on some damaged zips (a local header without a central directory): read the directory first
    try {
      openZip(bytes, WORKBOOK_ZIP);
    } catch (e) {
      if (e instanceof ZipError) throw new ParseError(fileName, 'is a damaged workbook: its zip structure cannot be read');
      throw e;
    }
    return parseXlsx(bytes, fileName);
  }
  if (startsWith(bytes, CFB)) return parseXlsx(bytes, fileName);
  if (startsWith(bytes, PDF)) {
    return { fileName, kind: 'pdf', sheets: [], date1904: false, decimalComma: false, encoding: 'utf-8', findings: [] };
  }

  const decoded = decodeText(bytes);
  const head = decoded.text.replace(/^﻿/, '').trimStart();

  if (head.startsWith('/* DATA DESCRIPTION:')) return parsePangaeaText(decoded.text, fileName, decoded);

  if (head.startsWith('<?xml') || head.startsWith('<gmd:') || /^<(?:[\w.-]+:)?(?:MD_Metadata|resource)[\s>]/.test(head)) {
    const isIso = /<(?:[\w.-]+:)?MD_Metadata[\s>]/.test(head);
    return metadataFile(fileName, decoded, () => (isIso ? parseIsoRecord(head, fileName) : parseDataciteXml(head, fileName)));
  }

  if (head.startsWith('{')) {
    return metadataFile(fileName, decoded, () => {
      let json: unknown;
      try {
        json = JSON.parse(head);
      } catch {
        throw new ParseError(fileName, 'looks like JSON but is not valid JSON');
      }
      if (isObj(json)) {
        const data = json.data;
        const attrs = json.attributes;
        if ((isObj(data) && isObj(data.attributes)) || (isObj(attrs) && 'doi' in attrs) || (typeof json.doi === 'string' && Array.isArray(json.titles))) {
          return parseDataciteJson(json, fileName);
        }
        if (isObj(json.metadata) && json.files !== undefined) return parseZenodoRecord(json, fileName);
      }
      throw new ParseError(fileName, 'is JSON, but not a DataCite or Zenodo record');
    });
  }

  return parseCsvText(decoded.text, fileName, decoded);
}

/**
 * A file named .zip that is not an Excel workbook: a Darwin Core Archive, or something that is not one (even an HTML error page saved as .zip: parseDwca says so). parseFile cannot read
 * it (inflating is asynchronous), so the caller sends it to parseFileAsync. The NAME decides too: only a ".zip" goes
 * here. A file named .xlsx (or anything else) whose zip cannot be opened stays on the workbook path, so a corrupt
 * workbook is still reported as a corrupt workbook, not as an unreadable archive.
 */
export const isArchiveZip = (bytes: Uint8Array, fileName: string): boolean =>
  /\.zip$/i.test(fileName.trim()) && !(startsWith(bytes, ZIP) && looksLikeWorkbook(bytes));

/**
 * parseFile for every upload, including archives. A zip that is not a workbook is read as a Darwin Core Archive
 * (never throws: a refusal is a parse-level finding); everything else goes through parseFile unchanged.
 */
export async function parseFileAsync(fileName: string, bytes: Uint8Array, inflate: Inflate, opts?: DwcaOptions): Promise<ParsedFile> {
  return isArchiveZip(bytes, fileName) ? parseDwca(fileName, bytes, inflate, opts) : parseFile(fileName, bytes);
}

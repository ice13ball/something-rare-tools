// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Helpers of the stage 2 tests: a synthetic sheet through the whole export, and the archive read back with the repository's own readers. Every value is invented.
import { convert, listSplits } from '../../src/core/convert/build';
import type { ConvertInput, SamplingDevice } from '../../src/core/convert/build';
import { archiveFiles } from '../../src/core/convert/dwca';
import type { ArchiveFile } from '../../src/core/convert/dwca';
import { buildEml } from '../../src/core/convert/eml';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import type { DatasetMetadata } from '../../src/core/convert/metadata';
import { toDataset } from '../../src/core/convert/model';
import type { ConvertResult, ConvertedDataset } from '../../src/core/convert';
import { judge } from '../../src/core/convert/policy';
import type { QuantityDeclaration } from '../../src/core/convert/quantity';
import { validateDataset } from '../../src/core/convert/validate';
import { buildZip } from '../../src/core/convert/zip';
import { parseDwca } from '../../src/core/parse/dwca';
import { openZip } from '../../src/core/parse/zip';
import type { Finding, ColumnRole } from '../../src/core/types';
import { nodeInflate } from '../helpers/zipfile';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';
import { deflateRawSync } from 'node:zlib';

export const META: DatasetMetadata = {
  ...EMPTY_METADATA,
  title: 'Synthetic zooplankton counts of an invented bay (invented values)',
  abstract: 'SYNTHETIC test dataset. Positions, dates and counts are invented.',
  creators: 'Ada Example\nSample, Bob',
  contactName: 'Ada Example',
  contactEmail: 'ada@example.org',
  institutionCode: 'INVENTED',
  licence: 'CC-BY-4.0',
  basisOfRecord: 'HumanObservation',
};

export const GENERATED = '2026-10-25T12:00:00Z';
export const TODAY = '2026-10-25';

/** Node's raw deflate, the same format CompressionStream('deflate-raw') writes. */
export const nodeDeflate = async (d: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateRawSync(d));

export interface Exported {
  result: ConvertResult;
  dataset: ConvertedDataset;
  /** Every finding of the conversion, the tables and the description. */
  findings: Finding[];
  files: ArchiveFile[];
  eml: string;
  zip: Uint8Array;
}

export interface ExportOptions {
  quantity: QuantityDeclaration;
  meta?: Partial<DatasetMetadata>;
  fullList?: boolean;
  prefixStation?: boolean;
  edit?: Record<string, ColumnRole>;
  decimalComma?: boolean;
  /** Approve every split as proposed (the page's "approve all"). Default true. */
  approve?: boolean;
  deflate?: boolean;
  device?: SamplingDevice;
  meshUm?: string;
  /** The shape the user chose; default: the one the column roles suggest. */
  shape?: 'wide' | 'long';
}

/** A sheet through convert, validation and the writers, as the export does it. */
export async function exportSheet(header: string[], rows: Cell[][], o: ExportOptions): Promise<Exported> {
  const file = fileOf(header, rows, 'S', o.decimalComma ? { decimalComma: true } : {});
  const sheet = sheetInput(file, { quantity: o.quantity, ...(o.edit ? { edit: o.edit } : {}), ...(o.shape ? { shape: o.shape } : {}), ...(o.device ? { device: o.device } : {}), ...(o.meshUm === undefined ? {} : { meshUm: o.meshUm }) });
  const approvedSplits = o.approve === false ? {} : Object.fromEntries(listSplits({ sheets: [sheet] }).filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed]));
  const input: ConvertInput = { sheets: [sheet], options: { fullList: o.fullList === true, prefixStation: o.prefixStation === true }, approvedSplits };
  const result = convert(input);
  const meta: DatasetMetadata = { ...META, ...(o.meta ?? {}) };
  const dataset = toDataset(result, meta, { fullList: o.fullList === true, prefixStation: o.prefixStation === true });
  const findings = [...result.findings, ...validateDataset(dataset, result.findings, { today: TODAY })];
  const eml = meta.licence === '' ? '' : buildEml(dataset, { generated: GENERATED });
  const files = judge(findings).blocking.length === 0 ? archiveFiles(dataset, eml) : [];
  const zip = files.length === 0 ? new Uint8Array() : await buildZip(files, o.deflate === false ? undefined : nodeDeflate);
  return { result, dataset, findings, files, eml, zip };
}

export interface ReadBack {
  names: string[];
  text: Record<string, string>;
  meta: string;
  /** Each table as header + rows (tab-split), by file name. */
  tables: Record<string, { header: string[]; rows: string[][] }>;
  /** The repository's DwC-A reader on the same bytes: the Event core. */
  core: Awaited<ReturnType<typeof parseDwca>>;
}

export async function readBack(zip: Uint8Array): Promise<ReadBack> {
  const z = openZip(zip);
  const text: Record<string, string> = {};
  for (const e of z.entries) text[e.name] = new TextDecoder('utf-8', { fatal: true }).decode(await z.read(e, nodeInflate));
  const tables: ReadBack['tables'] = {};
  for (const [name, t] of Object.entries(text)) {
    if (!name.endsWith('.txt')) continue;
    const lines = t.split('\n');
    if (lines.pop() !== '') throw new Error(`${name} does not end with a newline`);
    const [head, ...rest] = lines.map((l) => l.split('\t'));
    tables[name] = { header: head, rows: rest };
  }
  return { names: z.entries.map((e) => e.name), text, meta: text['meta.xml'] ?? '', tables, core: await parseDwca('archive.zip', zip, nodeInflate) };
}

/** Rows of a table as objects keyed by header. */
export const objects = (t: { header: string[]; rows: string[][] }): Record<string, string>[] => t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i]])));

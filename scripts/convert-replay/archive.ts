// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The worker's archive path for one conversion, run on a fixed description and a fixed `generated` stamp: toDataset -> validateDataset -> buildEml -> archiveFiles -> buildZip
 * (src/worker/convert.handler.ts exportArchive). The zip writer is deterministic (fixed DOS date, src/core/convert/zip.ts) and Node's raw deflate is, so the zip bytes themselves are
 * recorded as a hash, and every file of the archive as text for the first-difference report. The description is invented; nothing here reads the clock.
 */
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import type { ConvertInput } from '../../src/core/convert/build';
import type { ConvertResult } from '../../src/core/convert/model';
import { toDataset } from '../../src/core/convert/model';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import type { DatasetMetadata } from '../../src/core/convert/metadata';
import { validateDataset } from '../../src/core/convert/validate';
import { judge } from '../../src/core/convert/policy';
import { buildEml } from '../../src/core/convert/eml';
import { archiveFileName, archiveFiles } from '../../src/core/convert/dwca';
import { buildZip } from '../../src/core/convert/zip';

export const REPLAY_META: DatasetMetadata = {
  ...EMPTY_METADATA,
  title: 'Replay gate dataset (invented values)',
  abstract: 'SYNTHETIC. Written by the capture-and-replay gate; every value is invented.',
  creators: 'Ada Example\nSample, Bob',
  contactName: 'Ada Example',
  contactEmail: 'ada@example.org',
  institutionCode: 'INVENTED',
  licence: 'CC-BY-4.0',
  basisOfRecord: 'HumanObservation',
};
export const REPLAY_GENERATED = '2026-10-25T12:00:00Z';
export const REPLAY_TODAY = '2026-10-25';

/** Text of a file up to this size is kept for the difference report; a bigger one is kept as a hash and a length only. */
const KEEP_TEXT_BYTES = 200_000;

export interface ArchiveRecord {
  /** 'written': the files and the zip; 'refused': the export would have refused (the blocking rule ids); 'error': it threw. */
  outcome: 'written' | 'refused' | 'error';
  detail?: string;
  fileName?: string;
  files?: { name: string; bytes: number; sha256: string; text?: string }[];
  zip?: { bytes: number; sha256: string };
  validationFindings?: string[];
}

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

export async function archiveOf(input: ConvertInput, result: ConvertResult): Promise<ArchiveRecord> {
  try {
    const dataset = toDataset(result, REPLAY_META, {
      fullList: input.options?.fullList === true,
      prefixStation: input.options?.prefixStation === true,
      worms: input.worms !== undefined,
      nvs: false,
    });
    const findings = [...result.findings, ...validateDataset(dataset, result.findings, { today: REPLAY_TODAY })];
    const j = judge(findings);
    const validationFindings = findings.map((f) => f.ruleId);
    if (j.blocking.length > 0) return { outcome: 'refused', detail: [...new Set(j.blocking.map((f) => f.ruleId))].join(','), validationFindings };
    if (dataset.events.length === 0 || dataset.occurrences.length === 0) return { outcome: 'refused', detail: 'nothing to write', validationFindings };
    const eml = buildEml(dataset, { generated: REPLAY_GENERATED });
    const files = archiveFiles(dataset, eml);
    const zip = await buildZip(files, async (d) => new Uint8Array(deflateRawSync(d)));
    return {
      outcome: 'written',
      fileName: archiveFileName(dataset),
      files: files.map((f) => ({ name: f.name, bytes: f.data.length, sha256: sha(f.data), ...(f.data.length <= KEEP_TEXT_BYTES ? { text: new TextDecoder().decode(f.data) } : {}) })),
      zip: { bytes: zip.length, sha256: sha(zip) },
      validationFindings,
    };
  } catch (e) {
    return { outcome: 'error', detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

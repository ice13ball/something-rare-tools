// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The check pipeline the app runs, driven by a golden-set input description (nothing specific lives in this file).
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildDatasets } from '../../src/core/dataset';
import { parseFile, ParseError } from '../../src/core/parse';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { fetchFile, FileFetchError, loadRecord, resolveInput, type ResolvedInput } from '../../src/core/sources';
import type { CheckSession, Dataset, Finding, LoadedRecord, MetadataRecord, ParsedFile } from '../../src/core/types';
import { createLocalFetcher, decode, hasUrlMapping, mappedFile } from './localFetcher';

export interface GoldenInput {
  id: string;
  record?: { kind: string; id: string };
  urlFiles?: Record<string, string>;
  dropped?: string[];
}
export interface InputResult {
  datasets: Dataset[];
  records: LoadedRecord[];
  parseFindings: Finding[];
  /** Files of a record that the golden set does not hold (404 without a urlFiles mapping), or that could not be read. */
  skipped: { file: string; reason: string }[];
}

function resolveRecord(r: NonNullable<GoldenInput['record']>): ResolvedInput {
  if (r.kind === 'doi') return { kind: 'doi', doi: r.id };
  if (r.kind === 'zenodo') return { kind: 'zenodo', id: r.id };
  return resolveInput(r.id);
}

function build(
  file: ParsedFile,
  metadata: MetadataRecord[],
  id: string,
  out: { datasets: Dataset[]; parseFindings: Finding[] },
): void {
  out.parseFindings.push(...file.findings);
  if (file.kind === 'pdf' || file.kind === 'unknown' || file.sheets.length === 0) return;
  const layout = proposeLayout(file);
  const mappings = proposeMappings(file, layout);
  const own = file.embeddedMetadata ? [...metadata, file.embeddedMetadata] : metadata;
  const built = buildDatasets(file, layout, mappings, own, id);
  out.datasets.push(...built.datasets);
  out.parseFindings.push(...built.findings);
}

/**
 * A urlFiles key that matches none of the record's file URLs (the key names the local file rather than the URL) is paired
 * with the record's only unmatched file, when both are unique. Several unmatched files stay unmatched (they are skipped).
 */
function pairLoneFile(rec: LoadedRecord, urlFiles: Record<string, string>, inputId: string): void {
  const urls = rec.files.map((f) => f.url).filter((u): u is string => !!u);
  const unmatchedFiles = urls.filter((u) => !hasUrlMapping(u, urlFiles));
  const unmatchedKeys = Object.keys(urlFiles).filter((k) => !urls.some((u) => hasUrlMapping(u, { [k]: '' })));
  if (unmatchedFiles.length === 1 && unmatchedKeys.length === 1) {
    urlFiles[decode(unmatchedFiles[0])] = urlFiles[unmatchedKeys[0]];
    console.log(`[golden] ${inputId}: urlFiles key matches no record URL; paired with the record's only unmatched file`);
  }
}

const cache = new Map<string, Promise<InputResult>>();

/** Runs one input through source handlers, parsing, layout, mapping and dataset building. Memoised per (goldenDir, input id). */
export function runInput(input: GoldenInput, goldenDir: string): Promise<InputResult> {
  const key = `${goldenDir}|${input.id}`;
  let p = cache.get(key);
  if (!p) {
    p = runInputUncached(input, goldenDir);
    cache.set(key, p);
  }
  return p;
}

async function runInputUncached(input: GoldenInput, goldenDir: string): Promise<InputResult> {
  const urlFiles: Record<string, string> = { ...(input.urlFiles ?? {}) };   // copy: the pairing fallback below adds to it
  const out = { datasets: [] as Dataset[], parseFindings: [] as Finding[] };
  const records: LoadedRecord[] = [];
  const skipped: InputResult['skipped'] = [];
  let seq = 0;
  const nextId = () => `${input.id}#${++seq}`;

  // 1. Dropped files first: metadata files become a "dropped" record, data files wait for their metadata.
  const droppedData: ParsedFile[] = [];
  const droppedMeta: MetadataRecord[] = [];
  const droppedFiles: LoadedRecord['files'] = [];
  for (const rel of input.dropped ?? []) {
    const name = basename(rel);
    const raw = readFileSync(join(goldenDir, rel));
    const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    droppedFiles.push({ name, bytes });
    let parsed: ParsedFile;
    try {
      parsed = parseFile(name, bytes);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      skipped.push({ file: name, reason: `unreadable (${e.message})` });
      continue;
    }
    if (parsed.kind === 'metadata') {
      out.parseFindings.push(...parsed.findings);
      if (parsed.embeddedMetadata) droppedMeta.push(parsed.embeddedMetadata);
    } else droppedData.push(parsed);
  }

  // 2. The record, if any: metadata and files through the real handlers over the local fetcher.
  let recordMeta: MetadataRecord[] = [];
  if (input.record) {
    const fetcher = createLocalFetcher(goldenDir, urlFiles);
    const rec = await loadRecord(resolveRecord(input.record), fetcher);
    records.push(rec);
    recordMeta = rec.metadata;
    pairLoneFile(rec, urlFiles, input.id);
    for (const f of rec.files) {
      let bytes: Uint8Array;
      try {
        bytes = await fetchFile(f, fetcher);
      } catch (e) {
        if (e instanceof FileFetchError && e.status === 404 && !(f.url && hasUrlMapping(f.url, urlFiles))) {
          skipped.push({ file: f.name, reason: 'not in the golden set (404)' });
          continue;
        }
        skipped.push({ file: f.name, reason: `fetch failed (${e instanceof Error ? e.message : String(e)})` });
        continue;
      }
      // A file answered from a local file is parsed (and reported) under the local file's name: that is what expected.json names.
      const local = f.url ? mappedFile(f.url, urlFiles) : undefined;
      const name = local ? basename(local) : f.name;
      let parsed: ParsedFile;
      try {
        parsed = parseFile(name, bytes);
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        skipped.push({ file: f.name, reason: `unreadable (${e.message})` });
        continue;
      }
      if (parsed.kind === 'metadata') {
        out.parseFindings.push(...parsed.findings);
        if (parsed.embeddedMetadata) recordMeta = [...recordMeta, parsed.embeddedMetadata];
        continue;
      }
      build(parsed, recordMeta, nextId(), out);
    }
  }

  // 3. Dropped data datasets: dropped metadata, plus the record's when there is one.
  if ((input.dropped ?? []).length > 0) {
    records.push({ label: 'dropped files', kind: 'dropped', metadata: droppedMeta, files: droppedFiles, findings: [] });
    for (const parsed of droppedData) build(parsed, [...droppedMeta, ...recordMeta], nextId(), out);
  }

  if (skipped.length > 0) {
    console.log(`[golden] ${input.id}: skipped ${skipped.length} file(s): ${skipped.map((s) => `${s.file} -- ${s.reason}`).join('; ')}`);
  }
  return { datasets: out.datasets, records, parseFindings: out.parseFindings, skipped };
}

/** Several inputs as ONE session (cross-file checks see all their datasets). */
export async function runSession(inputs: GoldenInput[], goldenDir: string): Promise<CheckSession> {
  const parts = await Promise.all(inputs.map((i) => runInput(i, goldenDir)));
  return {
    datasets: parts.flatMap((p) => p.datasets),
    records: parts.flatMap((p) => p.records),
    parseFindings: parts.flatMap((p) => p.parseFindings),
  };
}

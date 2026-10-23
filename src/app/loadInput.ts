// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Step 3 of the flow: dropped files -> bytes (File.arrayBuffer, they never leave the browser), a link -> record ->
// files, one status line per file. Download problems the user can act on become findings (host only) and the
// loading goes on with the rest. Parsing is NOT done here: the worker does it.
import { makeFinding } from '../core/rules/registry';
import { LINKED_FILE_MAX_BYTES } from '../../config/dataverse';
import { fetchErrorFinding, FileFetchError, ProxyFetchError, type Fetcher } from '../core/sources/fetcher';
import { fetchFile, loadRecord, resolveInput } from '../core/sources';
import type { Finding, LoadedRecord } from '../core/types';
import type { InputFile } from '../worker/protocol';
import type { CheckInput, DownloadMode } from './types';

export type LoadState = 'waiting' | 'reading' | 'downloading' | 'done' | 'failed';
export interface LoadLine {
  id: string;
  kind: 'record' | 'file';
  name: string;
  state: LoadState;
}

export interface LoadedInput {
  files: InputFile[];
  /** Records from the link, with the file list but no bytes. */
  records: LoadedRecord[];
  /** Download problems (IN-FETCH-BLOCKED, IN-HOST-NOT-ALLOWED, IN-RECORD-INACCESSIBLE). */
  findings: Finding[];
}

/** The pasted text is not a Zenodo / GeoNetwork / PANGAEA / Dataverse reference or a DOI. */
export class UnknownLinkError extends Error {
  constructor() {
    super('Unknown link');
    this.name = 'UnknownLinkError';
  }
}

export interface LoadDeps {
  fetcher: (mode: DownloadMode) => Fetcher;
  onProgress: (lines: LoadLine[]) => void;
}

export async function loadInputs(input: CheckInput, deps: LoadDeps): Promise<LoadedInput> {
  const lines: LoadLine[] = [];
  const out: LoadedInput = { files: [], records: [], findings: [] };
  const set = (id: string, state: LoadState): void => {
    const l = lines.find((x) => x.id === id);
    if (l) l.state = state;
    deps.onProgress(lines.map((x) => ({ ...x })));
  };
  const add = (line: LoadLine): void => {
    lines.push(line);
    deps.onProgress(lines.map((x) => ({ ...x })));
  };

  const link = input.link?.trim() ?? '';
  const resolved = link === '' ? undefined : resolveInput(link);
  if (resolved && resolved.kind === 'unknown') throw new UnknownLinkError();

  input.files.forEach((f, i) => add({ id: `d${i}`, kind: 'file', name: f.name, state: 'waiting' }));
  for (let i = 0; i < input.files.length; i++) {
    const f = input.files[i];
    set(`d${i}`, 'reading');
    out.files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), source: 'dropped' });
    set(`d${i}`, 'done');
  }

  if (!resolved) return out;
  const fetcher = deps.fetcher(input.mode);

  add({ id: 'record', kind: 'record', name: '', state: 'downloading' });
  let record: LoadedRecord;
  try {
    record = await loadRecord(resolved, fetcher);
  } catch (e) {
    const finding = fetchErrorFinding(e, 'record');
    if (!finding) throw e;
    out.findings.push(finding);
    set('record', 'failed');
    return out;
  }
  set('record', 'done');
  out.records.push({ ...record, files: record.files.map((f) => ({ name: f.name, ...(f.url ? { url: f.url } : {}) })) });

  const downloadable = record.files.filter((f) => f.url);
  downloadable.forEach((f, i) => add({ id: `r${i}`, kind: 'file', name: f.name, state: 'waiting' }));
  for (let i = 0; i < downloadable.length; i++) {
    const f = downloadable[i];
    set(`r${i}`, 'downloading');
    try {
      out.files.push({ name: f.name, bytes: await fetchFile(f, fetcher), source: 'record' });
      set(`r${i}`, 'done');
    } catch (e) {
      // A Dataverse file the server refuses to an anonymous client (401, 403) is held back by the source, not a failed record.
      const heldBack = record.kind === 'dataverse' && e instanceof FileFetchError && (e.status === 401 || e.status === 403);
      // A Dataverse file above the proxy's per-download limit (its own 413) whose size the API did not give: said as what it is.
      const tooLarge = record.kind === 'dataverse' && e instanceof ProxyFetchError && e.code === 'too_large';
      const finding = heldBack
        ? makeFinding('IN-FILE-HELD-BACK', { file: f.name, params: { host: e.host } })
        : tooLarge
          ? makeFinding('IN-FILE-TOO-LARGE', { file: f.name, params: { mb: Math.round(LINKED_FILE_MAX_BYTES / 1024 / 1024) } })
          : fetchErrorFinding(e, f.name);
      if (!finding) throw e;
      out.findings.push(finding);
      set(`r${i}`, 'failed');
    }
  }
  return out;
}

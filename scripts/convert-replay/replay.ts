// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The replay half of the capture-and-replay gate: read a recording made on a BASE commit, run convert() of the checkout on every recorded input, and name each call whose result,
 * pass count, exception or archive differs, with the path to the first differing field. Also: compare two recordings (the determinism check), and the coverage report.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convert, passCounter } from '../../src/core/convert/build';
import type { ConvertInput, ConvertSheetInput } from '../../src/core/convert/build';
import { archiveOf } from './archive';
import type { ArchiveRecord } from './archive';
import { decode, encode, firstDifference, withoutIdentity } from './codec';
import type { Enc } from './codec';

export interface CallRecord {
  version: number;
  id: string;
  testFile: string;
  testName: string;
  index: number;
  passes: number;
  input: Enc;
  result?: Enc;
  threw?: Enc;
  notes: { inputFunctions: number; inputClassInstances: string[]; resultFunctions: number; resultClassInstances: string[] };
}

export interface Mismatch {
  id: string;
  where: string;
  path: string;
  recorded: string;
  now: string;
  /** The same value once shared objects are written in full: the difference is in which objects are shared, not in a value. */
  identityOnly?: boolean;
}

/**
 * Some tests change convert() around the call: a vi.mock of a module it uses (a rule switched off, a stubbed lookup). That state is not in the recorded input, so such a call cannot be replayed in
 * a clean process. The recording step therefore replays its own recording once on the commit it was made on (`markAmbient`): every call that does not come back identical depends on its test's
 * environment and is listed here, with the first differing field. Replay against a base recording skips these and says how many (a known gap: they are guarded by their own tests only).
 */
export const AMBIENT_FILE = 'ambient.json';

export function readAmbient(dir: string): Record<string, string> {
  const p = join(resolve(dir), AMBIENT_FILE);
  if (!existsSync(p)) throw new Error(`${resolve(dir)} has no ${AMBIENT_FILE}: the recording was not marked. Record with \`npm run convert:record\` (it marks), not with the raw vitest record command.`);
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
}

/** The committed list of test files whose calls may be skipped, and exactly how many calls each. A change here is a decision made in review, never an accident of a recording. */
export const AMBIENT_ALLOW_FILE = resolve(process.cwd(), 'scripts/convert-replay/ambient-allow.json');

/** Problems of a recording's skip list against the committed one: any test file or count that differs. Empty means the skip list is exactly the expected one. */
export function checkAmbientAllowed(dir: string, ambient: Record<string, string> = readAmbient(dir)): string[] {
  const allowed = JSON.parse(readFileSync(AMBIENT_ALLOW_FILE, 'utf8')) as Record<string, number>;
  const found: Record<string, string[]> = {};
  for (const id of Object.keys(ambient)) (found[readCall(dir, id).testFile] ??= []).push(id);
  const problems: string[] = [];
  for (const f of new Set([...Object.keys(found), ...Object.keys(allowed)])) {
    const n = found[f]?.length ?? 0;
    const want = allowed[f] ?? 0;
    if (n !== want) problems.push(`${f}: ${n} skipped call(s), ${want} allowed in ${AMBIENT_ALLOW_FILE}${found[f] ? ` (${found[f].join(', ')})` : ''}`);
  }
  return problems;
}

export function callIds(dir: string): string[] {
  return readdirSync(resolve(dir))
    .filter((n) => n.endsWith('.json') && !n.endsWith('.archive.json') && n !== AMBIENT_FILE)
    .map((n) => n.slice(0, -'.json'.length))
    .sort();
}

export const readCall = (dir: string, id: string): CallRecord => JSON.parse(readFileSync(join(resolve(dir), `${id}.json`), 'utf8')) as CallRecord;

export function readArchive(dir: string, id: string): ArchiveRecord | undefined {
  const p = join(resolve(dir), `${id}.archive.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { archive: ArchiveRecord }).archive : undefined;
}

function compareEnc(id: string, where: string, recorded: Enc | undefined, now: Enc | undefined): Mismatch | undefined {
  const d = firstDifference(recorded, now);
  if (d === undefined) return undefined;
  const mismatch: Mismatch = { id, where, path: `${where}${d.path === '(root)' ? '' : d.path}`, recorded: d.recorded, now: d.now };
  if (recorded !== undefined && now !== undefined && firstDifference(withoutIdentity(recorded), withoutIdentity(now)) === undefined) mismatch.identityOnly = true;
  return mismatch;
}

/** One recorded call run again on this checkout. Returns its first difference, or undefined. `unreplayable` is set for an input that held a function. */
export async function replayCall(dir: string, id: string): Promise<{ mismatch?: Mismatch; unreplayable?: boolean; archiveChecked: boolean }> {
  const rec = readCall(dir, id);
  if (rec.notes.inputFunctions > 0) return { unreplayable: true, archiveChecked: false };
  const input = decode(rec.input) as ConvertInput;
  const before = passCounter.count;
  let result: unknown;
  let threw: unknown;
  let didThrow = false;
  try {
    result = convert(input);
  } catch (e) {
    didThrow = true;
    threw = e;
  }
  const passes = passCounter.count - before;
  if (didThrow !== (rec.threw !== undefined)) {
    return { mismatch: { id, where: 'outcome', path: 'outcome', recorded: rec.threw !== undefined ? 'threw' : 'returned', now: didThrow ? 'threw' : 'returned' }, archiveChecked: false };
  }
  const m = didThrow ? compareEnc(id, 'threw', rec.threw, encode(threw)) : compareEnc(id, 'result', rec.result, encode(result));
  if (m) return { mismatch: m, archiveChecked: false };
  if (passes !== rec.passes) return { mismatch: { id, where: 'passes', path: 'passes', recorded: String(rec.passes), now: String(passes) }, archiveChecked: false };
  const recordedArchive = readArchive(dir, id);
  if (recordedArchive === undefined) return { archiveChecked: false };
  const fresh = decode(rec.input) as ConvertInput;
  const archive = await archiveOf(fresh, convert(fresh));
  const a = firstDifference(recordedArchive as unknown as Enc, archive as unknown as Enc);
  if (a) return { mismatch: { id, where: 'archive', path: `archive${a.path === '(root)' ? '' : a.path}`, recorded: a.recorded, now: a.now }, archiveChecked: true };
  return { archiveChecked: true };
}

/** The recording step: replay the recording on the commit it was made on and write the calls that differ to ambient.json. Returns them. */
export async function markAmbient(dir: string): Promise<{ calls: number; ambient: Mismatch[] }> {
  const ids = callIds(dir);
  const found: Mismatch[] = [];
  for (const id of ids) {
    const r = await replayCall(dir, id);
    if (r.mismatch) found.push(r.mismatch);
    else if (r.unreplayable) found.push({ id, where: 'input', path: 'input holds a function', recorded: '', now: '' });
  }
  writeFileSync(join(resolve(dir), AMBIENT_FILE), `${JSON.stringify(Object.fromEntries(found.map((m) => [m.id, m.path])), null, 1)}\n`);
  return { calls: ids.length, ambient: found };
}

export interface ReplayReport {
  calls: number;
  replayed: number;
  unreplayable: string[];
  /** Calls the recording step found to depend on a test's own mocks (not replayed). */
  ambient: string[];
  archivesChecked: number;
  mismatches: Mismatch[];
}

export async function replayDir(dir: string): Promise<ReplayReport> {
  const ids = callIds(dir);
  const ambient = readAmbient(dir);
  const report: ReplayReport = { calls: ids.length, replayed: 0, unreplayable: [], ambient: [], archivesChecked: 0, mismatches: [] };
  for (const id of ids) {
    if (id in ambient) {
      report.ambient.push(id);
      continue;
    }
    const r = await replayCall(dir, id);
    if (r.unreplayable) report.unreplayable.push(id);
    else report.replayed++;
    if (r.archiveChecked) report.archivesChecked++;
    if (r.mismatch) report.mismatches.push(r.mismatch);
  }
  return report;
}

/** Two recordings against each other (the determinism check: the same commit recorded twice must give the same files). */
export function compareDirs(a: string, b: string): { calls: number; mismatches: Mismatch[] } {
  const ia = callIds(a);
  const ib = callIds(b);
  const out: Mismatch[] = [];
  const setB = new Set(ib);
  const setA = new Set(ia);
  for (const id of ia) if (!setB.has(id)) out.push({ id, where: 'file', path: 'missing in second', recorded: 'present', now: 'absent' });
  for (const id of ib) if (!setA.has(id)) out.push({ id, where: 'file', path: 'missing in first', recorded: 'absent', now: 'present' });
  for (const id of ia) {
    if (!setB.has(id)) continue;
    const x = readCall(a, id);
    const y = readCall(b, id);
    const d = firstDifference(x as unknown as Enc, y as unknown as Enc);
    if (d) out.push({ id, where: 'record', path: d.path, recorded: d.recorded, now: d.now });
    const ax = readArchive(a, id);
    const ay = readArchive(b, id);
    const da = firstDifference(ax as unknown as Enc | undefined, ay as unknown as Enc | undefined);
    if (da) out.push({ id, where: 'archive', path: `archive${da.path === '(root)' ? '' : da.path}`, recorded: da.recorded, now: da.now });
  }
  return { calls: ia.length, mismatches: out };
}

/* ---------- coverage ---------- */

const SHEET_KEYS_COMPANION = /(FromFile|File)$/;

export interface Coverage {
  calls: number;
  threw: number;
  ok: number;
  blocked: number;
  pass2: number;
  pass3: number;
  pass4plus: number;
  joins: number;
  turns: number;
  pivots: number;
  leaveOutsDeclared: number;
  leftOutInResult: number;
  profileSheets: number;
  withWorms: number;
  withApprovedSplits: number;
  archives: Record<string, number>;
  testFiles: number;
  inputFunctions: number;
  classInstances: string[];
  /** Companion-file keys of a sheet input (`...FromFile`, `...File`) and nested `fromFile: true`, by the number of calls whose inputs held them. */
  companionKeys: Record<string, number>;
  /** Every key of a sheet input seen in any call, by the number of calls. */
  sheetKeys: Record<string, number>;
  optionKeys: Record<string, number>;
  topKeys: Record<string, number>;
}

const bump = (m: Record<string, number>, k: string): void => void (m[k] = (m[k] ?? 0) + 1);

export function coverageOf(dir: string): Coverage {
  const c: Coverage = { calls: 0, threw: 0, ok: 0, blocked: 0, pass2: 0, pass3: 0, pass4plus: 0, joins: 0, turns: 0, pivots: 0, leaveOutsDeclared: 0, leftOutInResult: 0, profileSheets: 0, withWorms: 0, withApprovedSplits: 0, archives: {}, testFiles: 0, inputFunctions: 0, classInstances: [], companionKeys: {}, sheetKeys: {}, optionKeys: {}, topKeys: {} };
  const files = new Set<string>();
  for (const id of callIds(dir)) {
    const rec = readCall(dir, id);
    c.calls++;
    files.add(rec.testFile);
    if (rec.notes.inputFunctions > 0) c.inputFunctions++;
    c.classInstances.push(...rec.notes.inputClassInstances, ...rec.notes.resultClassInstances);
    if (rec.threw !== undefined) c.threw++;
    else {
      const ok = (decode(rec.result as Enc) as { ok: boolean; leftOut: string[] }).ok;
      if (ok) c.ok++;
      else c.blocked++;
      if ((decode(rec.result as Enc) as { leftOut: string[] }).leftOut.length > 0) c.leftOutInResult++;
    }
    if (rec.passes >= 2) c.pass2++;
    if (rec.passes >= 3) c.pass3++;
    if (rec.passes >= 4) c.pass4plus++;
    const arch = readArchive(dir, id);
    if (arch) bump(c.archives, arch.outcome);
    if (rec.notes.inputFunctions > 0) continue;
    const input = decode(rec.input) as ConvertInput;
    for (const k of Object.keys(input)) bump(c.topKeys, k);
    for (const k of Object.keys(input.options ?? {})) bump(c.optionKeys, k);
    if (input.worms !== undefined) c.withWorms++;
    if (input.approvedSplits !== undefined && Object.keys(input.approvedSplits).length > 0) c.withApprovedSplits++;
    let join = false;
    let turn = false;
    let pivot = false;
    let leave = false;
    let profile = false;
    const seen = new Set<string>();
    const companion = new Set<string>();
    for (const sin of input.sheets as readonly ConvertSheetInput[]) {
      for (const k of Object.keys(sin)) {
        seen.add(k);
        if (SHEET_KEYS_COMPANION.test(k)) companion.add(k);
      }
      const nested = (v: unknown): void => {
        if (v === null || typeof v !== 'object') return;
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if (k === 'fromFile' && x === true) companion.add('(nested) fromFile');
          else nested(x);
        }
      };
      for (const k of ['countTexts', 'countTextColumns', 'summaryRows', 'declaredPosition', 'sampleKey', 'sampleJoin'] as const) nested((sin as unknown as Record<string, unknown>)[k]);
      if (sin.sampleJoin !== undefined) join = true;
      if (sin.profile !== undefined) profile = true;
      if ((sin.leaveOut?.length ?? 0) > 0 || (sin.leaveOutFile?.length ?? 0) > 0 || sin.summaryRows?.answer === 'leave-out') leave = true;
      const sheet = sin.file.sheets.find((s) => s.name === sin.sheet);
      if (sheet?.turn !== undefined) turn = true;
      if (sheet?.pivot !== undefined) pivot = true;
    }
    if (join) c.joins++;
    if (turn) c.turns++;
    if (pivot) c.pivots++;
    if (leave) c.leaveOutsDeclared++;
    if (profile) c.profileSheets++;
    for (const k of seen) bump(c.sheetKeys, k);
    for (const k of companion) bump(c.companionKeys, k);
  }
  c.testFiles = files.size;
  return c;
}

export function formatCoverage(c: Coverage): string {
  const sorted = (m: Record<string, number>): string =>
    Object.entries(m)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k} (${n})`)
      .join(', ') || '(none)';
  return [
    `calls recorded: ${c.calls} from ${c.testFiles} test files (${c.ok} ok, ${c.blocked} blocked, ${c.threw} threw)`,
    `ran pass 2: ${c.pass2}; pass 3: ${c.pass3}; pass 4 or more: ${c.pass4plus}`,
    `inputs with a sample join: ${c.joins}; a turned sheet: ${c.turns}; a pivoted sheet: ${c.pivots}; a profile sheet: ${c.profileSheets}`,
    `inputs that declare a leave-out: ${c.leaveOutsDeclared}; results with rows left out: ${c.leftOutInResult}`,
    `inputs with a WoRMS lookup: ${c.withWorms}; with approved splits: ${c.withApprovedSplits}`,
    `archives recorded (outcome): ${sorted(c.archives)}`,
    `inputs holding a function (cannot be replayed): ${c.inputFunctions}; class instances seen: ${[...new Set(c.classInstances)].join(', ') || '(none)'}`,
    `companion-file keys that appeared in an input: ${sorted(c.companionKeys)}`,
    `sheet-input keys seen: ${sorted(c.sheetKeys)}`,
    `option keys seen: ${sorted(c.optionKeys)}`,
  ].join('\n');
}

export function formatMismatches(list: readonly Mismatch[], limit = 40): string {
  const lines = list.slice(0, limit).map((m) => `  ${m.id}\n    ${m.path}${m.identityOnly ? '  [identity only: the same values, shared differently]' : ''}\n    recorded: ${m.recorded}\n    now:      ${m.now}`);
  if (list.length > limit) lines.push(`  ... and ${list.length - limit} more`);
  return lines.join('\n');
}

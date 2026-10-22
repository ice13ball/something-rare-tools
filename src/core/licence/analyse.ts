// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ONE place that compares what the metadata sources of a dataset say about its licence. Pure, no I/O.
// /check maps the result to findings (checks/licence.ts); the licence page renders it directly.
import { classifyStatement, isOpenLicence, isRestrictiveCode, openLicenceNamed, spdxFromUri, spdxInfo, type SpdxInfo } from '../metadata/licence';
import type { LicenceClass, LicenceStatement, MetadataRecord, MetadataSource } from '../types';

/** Statements about the metadata record itself (ISO `metadataConstraints`), not the data. */
export const isResourceLevel = (s: LicenceStatement): boolean => !s.field.startsWith('metadataConstraints/');

/** stated = at least one statement about the data; missing = the record was read and states none; unreadable = could not be read. */
export type SourceState = 'stated' | 'missing' | 'unreadable';

export interface AnalysedStatement {
  statement: LicenceStatement;
  classification: LicenceClass;
  /** Official name and canonical URL of the recognised id, for the attribution line. */
  info?: SpdxInfo;
  /** Open Definition sense (isOpenLicence); false when unrecognised. */
  open: boolean;
  /**
   * A program could read it: a licence URI naming the id, the bare id as text, or an id with no free text at all.
   * Prose that merely contains an id ("CC-BY 4.0") is not machine-readable.
   */
  machineReadable: boolean;
  /**
   * Set when the statement is "unrecognised — check manually": text and URI differ ('text-uri'), something besides the licence name is
   * left in the text and it contains a restriction marker ('restricted') or not ('extra-text'), or there is no link and the text gives
   * more than one reading of itself ('readings').
   */
  conflict?: { kind: 'text-uri' | 'restricted' | 'extra-text' | 'readings'; text: string; uri: string; textLicence: string; uriLicence: string; /** What the text says besides the licence name ('restricted' / 'extra-text'). */ rest: string };
}

export interface AnalysedSource {
  source: MetadataSource;
  label: string;
  /** Source group id: sources of one deposit share it (see depositGroups). */
  group: string;
  state: SourceState;
  /** Resource-level statements only. */
  statements: AnalysedStatement[];
  record?: MetadataRecord;
}

export interface SourceGroup {
  id: string;
  sources: AnalysedSource[];
  state: SourceState;
  /** Recognised SPDX ids stated by the group (union over its sources). */
  licences: string[];
}

export type Contradiction =
  /** Two sources whose sets of recognised licences are disjoint. `sameGroup` = e.g. Zenodo against its own DataCite record. */
  | { kind: 'mismatch'; sourceA: AnalysedSource; sourceB: AnalysedSource; licenceA: string; licenceB: string; sameGroup: boolean }
  /** The statement has a URI and text and URI classify differently (incl. a URI no SPDX id exists for). */
  | { kind: 'text-uri'; source: AnalysedSource; statement: AnalysedStatement }
  /** The text names a licence but adds or negates conditions ("CC BY 4.0, but not for commercial use"), with or without a URI. */
  | { kind: 'added-conditions'; source: AnalysedSource; statement: AnalysedStatement }
  /** The text names a licence and says something else that is no condition word ("CC BY 4.0, please contact the PI"): check by hand whether it changes the licence. */
  | { kind: 'extra-text'; source: AnalysedSource; statement: AnalysedStatement }
  /** No link, and the statement reads as more than one licence (text against identifier, "CC BY 4.0 (CC BY-NC)", a recognised name next to an unrecognised one). */
  | { kind: 'ambiguous'; source: AnalysedSource; statement: AnalysedStatement }
  | { kind: 'restriction-code'; codes: string[]; licence: string }
  | { kind: 'datacite-empty'; licence: string };

export interface LicenceAnalysis {
  sources: AnalysedSource[];
  groups: SourceGroup[];
  /** Groups with at least one statement (recognised or not). */
  statedGroups: number;
  /** N for "no contradiction among N sources": groups with at least one RECOGNISED licence (agreement inside a group confirms nothing). */
  recognisedGroups: number;
  /** 'single-source' = nothing to compare (fewer than 2 groups state a licence we recognise). */
  comparison: 'compared' | 'single-source';
  contradictions: Contradiction[];
  /** No source states a licence and none was unreadable: the licence is missing. */
  missing: boolean;
  /** At least one source could not be read; absence of a licence then says nothing. */
  hasUnreadable: boolean;
  /**
   * At least two compared groups are DataCite records of Zenodo DOIs that no Zenodo record and no IsVersionOf / HasVersion link tie
   * together (the Zenodo record could not be read): a concept DOI and a version DOI of one deposit look like two sources.
   * "No contradiction among N sources" is then not honest without a caveat.
   */
  maybeSameDeposit: boolean;
  /** Statements exist but none is machine-readable and none is flagged as a conflict: the licence is free text only. */
  freeText?: { statement: AnalysedStatement; source: AnalysedSource; versionMissing: boolean; hint: string };
}

export interface AnalyseOptions {
  /** Sources known to have failed to load; each appears as an 'unreadable' source unless a record of the same source is present. */
  unreadable?: readonly MetadataSource[];
  /**
   * Reads that failed, each identified by its reference (what the user pasted, or the DOI looked up). Every one is an 'unreadable'
   * source of its own and is NEVER hidden because another record of the same source type was read: Zenodo record A read without a
   * licence next to Zenodo record B answering 429 is not "no source states a licence".
   */
  failures?: readonly { source: MetadataSource; ref: string }[];
  /** Some record could not be read but which source is not known: only suppresses `missing`. */
  inaccessible?: boolean;
}

const zenodoId = (text: string): string | undefined => /10\.5281\/zenodo\.(\d+)/i.exec(text)?.[1] ?? /zenodo\.org\/(?:api\/)?records?\/(\d+)/i.exec(text)?.[1];
const pangaeaId = (text: string): string | undefined => /10\.1594\/pangaea\.(\d+)/i.exec(text)?.[1];

/**
 * The identities of the deposit a record describes. Records that share one are the same deposit: a Zenodo record, the
 * DataCite record of its DOI (a concept DOI and a version DOI of one deposit included: the concept's landing page is a
 * version of the deposit), a PANGAEA record and the DataCite record of its DOI. A GeoNetwork record is its own deposit
 * even when it carries a DOI: the catalogue and the DOI registry are written separately. Everything else is its own.
 */
export function depositKeys(rec: MetadataRecord): string[] {
  const doi = (rec.doi ?? '').trim().toLowerCase();
  const landing = rec.landingUrl ?? '';
  const keys: string[] = [];
  if (rec.source === 'iso19139') return [`iso:${landing || rec.label}`];
  if (doi) keys.push(`doi:${doi}`);
  if (rec.source === 'zenodo' || rec.source === 'datacite') {
    // A DataCite record of a Zenodo DOI that names the concept / version DOIs of its deposit (IsVersionOf, HasVersion) joins them.
    const linked = zenodoId(doi) ? (rec.versionDois ?? []).map(zenodoId) : [];
    const z = new Set([zenodoId(doi), zenodoId(landing), rec.conceptId, ...linked].filter((x): x is string => !!x));
    for (const id of z) keys.push(`zenodo:${id}`);
  }
  if (rec.source === 'pangaea' || rec.source === 'datacite') {
    const p = new Set([pangaeaId(doi), pangaeaId(landing)].filter((x): x is string => !!x));
    for (const id of p) keys.push(`pangaea:${id}`);
  }
  if (keys.length === 0) keys.push(`${rec.source}:${rec.label}`);
  return keys;
}

/** Two records describe the same deposit when they share an identity key. */
export const sameDeposit = (a: MetadataRecord, b: MetadataRecord): boolean => {
  const kb = depositKeys(b);
  return depositKeys(a).some((k) => kb.includes(k));
};

/** Group id per record: records sharing a deposit key (directly or through a third record) get the same id. */
export function depositGroups(records: readonly MetadataRecord[]): string[] {
  const keys = records.map(depositKeys);
  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  keys.forEach((ks, i) => {
    for (const k of ks) {
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i);
      else parent[find(i)] = find(o);
    }
  });
  const priority = (k: string): number => (k.startsWith('zenodo:') ? 0 : k.startsWith('pangaea:') ? 1 : k.startsWith('doi:') ? 2 : 3);
  return records.map((_, i) => {
    const root = find(i);
    const first = keys.findIndex((_k, j) => find(j) === root);
    return [...keys[first]].sort((x, y) => priority(x) - priority(y))[0];
  });
}

/** What a statement shows in a finding or a table: the id when recognised, else its text, else its URI. */
export const shownOf = (a: AnalysedStatement): string => (a.classification.kind === 'spdx' ? a.classification.id : (a.statement.text ?? a.statement.uri ?? ''));

function analyseStatement(s: LicenceStatement): AnalysedStatement {
  const classification = classifyStatement(s);
  const id = classification.kind === 'spdx' ? classification.id : undefined;
  // Hand-built statements may carry only `spdx`; the URI reading is recomputed then.
  const uriId = s.uriSpdx ?? (s.uri ? spdxFromUri(s.uri) : undefined);
  const machineReadable = !!id && ((!s.text && !s.uri) || (!!s.uri && uriId === id) || s.text?.trim().toLowerCase() === id.toLowerCase());
  const out: AnalysedStatement = { statement: s, classification, open: isOpenLicence(id), machineReadable };
  const info = spdxInfo(id);
  if (info) out.info = info;
  if (s.conflict) {
    out.conflict = {
      kind: s.conflict,
      text: s.text ?? '',
      uri: s.uri ?? '',
      textLicence: s.textSpdx ?? (s.conflict === 'restricted' || s.conflict === 'extra-text' ? (s.text ?? '—') : s.readings && s.readings.length > 0 ? s.readings.join(' / ') : '—'),
      uriLicence: uriId ?? '—',
      rest: s.leftover ?? '',
    };
  }
  return out;
}

/** MD_RestrictionCode `license` is the normal ISO way to say "a licence applies", so it cannot contradict a CC licence. */
const isConflictingCode = (code: string): boolean => code !== 'license' && isRestrictiveCode(code);

/** Entries the publisher repeated on purpose (DataCite rightsList, Zenodo rights): several of them are dual licensing. */
const isRepeatedEntry = (s: LicenceStatement): boolean => /^(?:rightsList|rights)\[\d+\]$/.test(s.field);

/** Different licences in one source outside repeated entries (two ISO fields, two otherConstraints): they contradict each other. */
const ownLicences = (src: AnalysedSource): string[] => [
  ...new Set(src.statements.filter((a) => !isRepeatedEntry(a.statement)).flatMap((a) => (a.classification.kind === 'spdx' ? [a.classification.id] : []))),
];

const recognised = (src: AnalysedSource): string[] => [
  ...new Set(src.statements.flatMap((a) => (a.classification.kind === 'spdx' ? [a.classification.id] : []))),
];

export function analyseLicences(records: readonly MetadataRecord[], opts: AnalyseOptions = {}): LicenceAnalysis {
  const groupIds = depositGroups(records);
  const sources: AnalysedSource[] = records.map((record, i) => {
    const statements = record.licences.filter(isResourceLevel).map(analyseStatement);
    return { source: record.source, label: record.label, group: groupIds[i], state: statements.length > 0 ? 'stated' : 'missing', statements, record };
  });
  for (const source of opts.unreadable ?? []) {
    if (sources.some((s) => s.source === source)) continue;
    sources.push({ source, label: source, group: `unreadable:${source}`, state: 'unreadable', statements: [] });
  }

  for (const f of opts.failures ?? []) {
    if (sources.some((s) => s.state === 'unreadable' && s.source === f.source && s.label === f.ref)) continue;
    sources.push({ source: f.source, label: f.ref, group: `unreadable:${f.source}:${f.ref}`, state: 'unreadable', statements: [] });
  }

  const groups: SourceGroup[] = [];
  for (const src of sources) {
    let g = groups.find((x) => x.id === src.group);
    if (!g) groups.push((g = { id: src.group, sources: [], state: 'unreadable', licences: [] }));
    g.sources.push(src);
  }
  for (const g of groups) {
    g.state = g.sources.some((s) => s.state === 'stated') ? 'stated' : g.sources.some((s) => s.state === 'missing') ? 'missing' : 'unreadable';
    g.licences = [...new Set(g.sources.flatMap(recognised))];
  }
  const statedGroups = groups.filter((g) => g.state === 'stated').length;
  const recognisedGroups = groups.filter((g) => g.licences.length > 0).length;
  const statements = sources.flatMap((s) => s.statements);
  const hasUnreadable = !!opts.inaccessible || sources.some((s) => s.state === 'unreadable');

  const contradictions: Contradiction[] = [];

  // A statement that contradicts itself is reported where it is.
  for (const source of sources) {
    for (const statement of source.statements) if (statement.conflict) contradictions.push({ kind: { restricted: 'added-conditions', 'extra-text': 'extra-text', readings: 'ambiguous', 'text-uri': 'text-uri' }[statement.conflict.kind] as 'added-conditions' | 'extra-text' | 'ambiguous' | 'text-uri', source, statement });
  }

  // Restriction codes against an open licence: a recognised open id, or a statement that names an open family without being
  // recognised (versionless "CC BY", "CC BY 4.0, commercial use requires permission"). NC / ND never count. The statement keeps its class.
  const codes = [...new Set(records.flatMap((r) => r.restrictionCodes.map((c) => c.code)).filter(isConflictingCode))];
  const openStated = statements.find((a) => a.open);
  const openNamed = openStated ? shownOf(openStated) : statements.map((a) => openLicenceNamed(a.statement)).find((x) => !!x);
  if (codes.length > 0 && openNamed) contradictions.push({ kind: 'restriction-code', codes, licence: openNamed });

  // DataCite read but silent while another source states a licence, or while the main record could not be read (then licence = '—').
  const empty = sources.find((s) => s.source === 'datacite' && s.state === 'missing');
  if (empty && (statements.length > 0 || hasUnreadable)) contradictions.push({ kind: 'datacite-empty', licence: statements.length > 0 ? shownOf(statements[0]) : '—' });

  // Dual licensing is only what the publisher repeated on purpose (rightsList / rights entries). Different licences in different
  // fields of one source are a contradiction inside it, as they always were.
  for (const src of sources) {
    const own = ownLicences(src);
    if (own.length > 1) contradictions.push({ kind: 'mismatch', sourceA: src, sourceB: src, licenceA: own[0], licenceB: own[1], sameGroup: true });
  }

  // Mismatch = two sources whose recognised sets are disjoint.
  const seen = new Set<string>();
  const comparable = sources.filter((s) => recognised(s).length > 0);
  for (let i = 0; i < comparable.length; i++) {
    for (let j = i + 1; j < comparable.length; j++) {
      const a = comparable[i];
      const b = comparable[j];
      const la = recognised(a);
      const lb = recognised(b);
      if (la.some((x) => lb.includes(x))) continue;
      const key = [a.group, b.group].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      contradictions.push({ kind: 'mismatch', sourceA: a, sourceB: b, licenceA: la[0], licenceB: lb[0], sameGroup: a.group === b.group });
    }
  }

  const result: LicenceAnalysis = {
    sources,
    groups,
    statedGroups,
    recognisedGroups,
    comparison: recognisedGroups >= 2 ? 'compared' : 'single-source',
    contradictions,
    maybeSameDeposit:
      groups.filter(
        (g) => g.licences.length > 0 && g.sources.every((s) => s.source === 'datacite' && !!s.record && !!zenodoId(s.record.doi ?? '')),
      ).length >= 2,
    missing: statements.length === 0 && !hasUnreadable,
    hasUnreadable,
  };

  if (statements.length > 0 && !statements.some((a) => a.machineReadable) && !statements.some((a) => a.conflict)) {
    const source = sources.find((s) => s.statements.some((a) => a.statement.text)) ?? sources.find((s) => s.statements.length > 0)!;
    const first = source.statements.find((a) => a.statement.text) ?? source.statements[0];
    const text = first.statement.text ?? shownOf(first);
    // The hint is the publisher's OWN licence when we recognised it; an example is offered only when nothing was recognised.
    const own = statements.find((a) => a.classification.kind === 'spdx');
    result.freeText = {
      statement: first,
      source,
      versionMissing: !/\d(\.\d)?/.test(text),
      hint: own && own.classification.kind === 'spdx' ? own.classification.id : 'CC BY 4.0',
    };
  }
  return result;
}

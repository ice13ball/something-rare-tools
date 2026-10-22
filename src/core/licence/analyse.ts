// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The ONE place that compares what the metadata sources of a dataset say about its licence. Pure, no I/O.
// /check maps the result to findings (checks/licence.ts); the licence page renders it directly.
import { classifyStatement, isOpenLicence, isRestrictiveCode, spdxFromUri, spdxInfo, type SpdxInfo } from '../metadata/licence';
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
  /** Set when the statement is "unrecognised — check manually": text and URI differ ('text-uri') or the text adds conditions ('restricted'). */
  conflict?: { kind: 'text-uri' | 'restricted'; text: string; uri: string; textLicence: string; uriLicence: string };
}

export interface AnalysedSource {
  source: MetadataSource;
  label: string;
  /** Source group id: sources of one deposit share it (see groupOf). */
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
  | { kind: 'restriction-code'; codes: string[]; licence: string }
  | { kind: 'datacite-empty'; licence: string };

export interface LicenceAnalysis {
  sources: AnalysedSource[];
  groups: SourceGroup[];
  /** N for "no contradiction among N sources": groups that state a licence (agreement inside a group confirms nothing). */
  statedGroups: number;
  /** 'single-source' = nothing to compare (0 or 1 group states a licence). */
  comparison: 'compared' | 'single-source';
  contradictions: Contradiction[];
  /** No source states a licence and none was unreadable: the licence is missing. */
  missing: boolean;
  /** At least one source could not be read; absence of a licence then says nothing. */
  hasUnreadable: boolean;
  /** Statements exist but none is machine-readable and none is flagged as a conflict: the licence is free text only. */
  freeText?: { statement: AnalysedStatement; source: AnalysedSource; versionMissing: boolean; hint: string };
}

export interface AnalyseOptions {
  /** Sources known to have failed to load; each appears as an 'unreadable' source unless a record of it is present. */
  unreadable?: readonly MetadataSource[];
  /** Some record could not be read but which source is not known: only suppresses `missing`. */
  inaccessible?: boolean;
}

/**
 * Source group of a record. One deposit is one source: a Zenodo record and the DataCite record of its DOI are written by
 * the same repository database, so their agreement confirms nothing. The same holds for PANGAEA and the DataCite
 * record of a PANGAEA DOI. Everything else is its own group.
 */
export function groupOf(rec: MetadataRecord): string {
  const doi = (rec.doi ?? '').toLowerCase();
  let host = '';
  try {
    host = rec.landingUrl ? new URL(rec.landingUrl).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  if (rec.source === 'zenodo') return 'zenodo';
  if (rec.source === 'pangaea') return 'pangaea';
  if (rec.source === 'datacite') {
    if (/^10\.5281\/zenodo\./.test(doi) || host === 'zenodo.org' || host === 'www.zenodo.org') return 'zenodo';
    if (/^10\.1594\/pangaea\./.test(doi) || host === 'doi.pangaea.de') return 'pangaea';
    return 'datacite';
  }
  return rec.source;
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
      textLicence: s.textSpdx ?? (s.conflict === 'restricted' ? (s.text ?? '—') : '—'),
      uriLicence: uriId ?? '—',
    };
  }
  return out;
}

/** MD_RestrictionCode `license` is the normal ISO way to say "a licence applies", so it cannot contradict a CC licence. */
const isConflictingCode = (code: string): boolean => code !== 'license' && isRestrictiveCode(code);

const recognised = (src: AnalysedSource): string[] => [
  ...new Set(src.statements.flatMap((a) => (a.classification.kind === 'spdx' ? [a.classification.id] : []))),
];

export function analyseLicences(records: readonly MetadataRecord[], opts: AnalyseOptions = {}): LicenceAnalysis {
  const sources: AnalysedSource[] = records.map((record) => {
    const statements = record.licences.filter(isResourceLevel).map(analyseStatement);
    return { source: record.source, label: record.label, group: groupOf(record), state: statements.length > 0 ? 'stated' : 'missing', statements, record };
  });
  for (const source of opts.unreadable ?? []) {
    if (sources.some((s) => s.source === source)) continue;
    sources.push({ source, label: source, group: source === 'datacite' ? 'datacite' : source, state: 'unreadable', statements: [] });
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
  const statements = sources.flatMap((s) => s.statements);
  const hasUnreadable = !!opts.inaccessible || sources.some((s) => s.state === 'unreadable');

  const contradictions: Contradiction[] = [];

  // A statement that contradicts itself is reported where it is.
  for (const source of sources) {
    for (const statement of source.statements) if (statement.conflict) contradictions.push({ kind: statement.conflict.kind === 'restricted' ? 'added-conditions' : 'text-uri', source, statement });
  }

  // Restriction codes against an open licence. Only a recognised, open licence can be contradicted.
  const codes = [...new Set(records.flatMap((r) => r.restrictionCodes.map((c) => c.code)).filter(isConflictingCode))];
  const open = statements.find((a) => a.open);
  if (codes.length > 0 && open) contradictions.push({ kind: 'restriction-code', codes, licence: shownOf(open) });

  // DataCite read but silent while another source states a licence.
  const empty = sources.find((s) => s.source === 'datacite' && s.state === 'missing');
  if (empty && statements.length > 0) contradictions.push({ kind: 'datacite-empty', licence: shownOf(statements[0]) });

  // Mismatch = two sources whose recognised sets are disjoint. Several entries of ONE source are dual licensing, never a mismatch.
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
    comparison: statedGroups >= 2 ? 'compared' : 'single-source',
    contradictions,
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

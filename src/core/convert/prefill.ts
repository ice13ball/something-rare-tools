// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { analyseLicences, shownOf } from '../licence/analyse';
import type { AnalysedStatement } from '../licence/analyse';
import { buildAttribution } from '../licence/attribution';
import type { MetadataRecord, MetadataSource } from '../types';
import { isLicence } from './metadata';
import type { DatasetMetadata, LicenceId } from './metadata';

/*
 * Stage 3: what the metadata files dropped WITH the data say about the dataset description. Pure, no I/O, no network: the records are the ones the shared
 * parsers (core/metadata/*, reached through parseFile) already read, and the licence is judged by the shared `analyseLicences()` (core/licence/analyse.ts),
 * the same function /check and /licence use. Nothing is parsed here a second time.
 *
 * Nothing is chosen silently:
 *   - a field every file agrees on (or only one file has) is prefilled and keeps its source (file and field);
 *   - files that disagree on a field give NO prefill: the page lists what each says and the user picks one (a candidate per distinct value);
 *   - a field no file has is shown as missing;
 *   - the licence is prefilled only in the "taken" case: one recognised id, no contradiction, one of CC0-1.0, CC-BY-4.0, CC-BY-NC-4.0 (what OBIS accepts).
 *     Any other licence (CC-BY-3.0, CC-BY-SA-4.0, free text), none, or a contradiction leaves the choice to the user, with a note that says why. A
 *     version is never mapped to another (3.0 never becomes 4.0).
 */

/** The description fields a metadata file can fill. `contact` is a name and an e-mail address that belong together. */
export type PrefillKey = 'title' | 'abstract' | 'creators' | 'contact' | 'citation';
export const PREFILL_KEYS: readonly PrefillKey[] = ['title', 'abstract', 'creators', 'contact', 'citation'];

/** Where a value comes from: the dropped file and the field of its format. */
export interface SourceRef {
  file: string;
  field: string;
}

/** One distinct value of a field, with every file that says it. For `contact`, `value` is the name and `email` the address ('' = none in that file). */
export interface Candidate {
  value: string;
  email?: string;
  sources: SourceRef[];
}

export interface LicenceSaid {
  file: string;
  field: string;
  /** What the statement says: the recognised id, else its text, else its link (cut at 160 characters). */
  says: string;
}

/**
 * The licence cases. taken: prefilled. other: one licence that OBIS does not accept (or only free text); `says` holds what the files say.
 * contradictory: the files contradict each other or give several licences. missing: no file states a licence.
 */
export type LicenceCase =
  | { kind: 'taken'; id: LicenceId; sources: SourceRef[] }
  | { kind: 'other'; said: string; says: LicenceSaid[] }
  | { kind: 'contradictory'; says: LicenceSaid[] }
  | { kind: 'missing' };

/** Where and when the metadata say the data were collected: shown for information only, the EML coverage is computed from the data. */
export interface CoverageSaid {
  file: string;
  start?: string;
  end?: string;
  bbox?: { west: number; east: number; south: number; north: number };
}

export interface MetadataFileInfo {
  fileName: string;
  /** DataCite, Zenodo, ISO 19139, ISO 19115-3 (proper names, never translated). */
  kind: string;
}

export interface ConvertPrefill {
  files: MetadataFileInfo[];
  /** Per field: 0 candidates = no file has it; 1 = taken; more = the files disagree, the user chooses. */
  fields: Record<PrefillKey, Candidate[]>;
  licence: LicenceCase;
  coverage: CoverageSaid[];
  /** At least one creator is marked as an organisation by its file: it is written as a person's name, which the user may want to edit. */
  organisationsInCreators: boolean;
}

/** The format of a record, as a proper name. */
export function metadataKindName(rec: Pick<MetadataRecord, 'source' | 'isoProfile'>): string {
  switch (rec.source) {
    case 'iso19139':
      return rec.isoProfile === '19115-3' ? 'ISO 19115-3' : 'ISO 19139';
    case 'datacite':
      return 'DataCite';
    case 'zenodo':
      return 'Zenodo';
    case 'pangaea':
      return 'PANGAEA';
    case 'dataverse':
      return 'Dataverse';
  }
}

/** The field of each format a value is read from (technical names, shown as code and never translated). */
const FIELD: Record<MetadataSource, Record<PrefillKey, string>> = {
  datacite: { title: 'titles', abstract: 'descriptions', creators: 'creators', contact: 'contributors (ContactPerson)', citation: 'creators, titles, publisher, identifier' },
  zenodo: { title: 'metadata.title', abstract: 'metadata.description', creators: 'metadata.creators', contact: 'metadata.contributors (ContactPerson)', citation: 'metadata.creators, title, publisher, doi' },
  iso19139: { title: 'citation/title', abstract: 'abstract', creators: 'citedResponsibleParty (author)', contact: 'pointOfContact', citation: 'citation: parties, title, date, identifier' },
  pangaea: { title: 'title', abstract: 'abstract', creators: 'authors', contact: 'contact', citation: 'authors, title, year, doi' },
  dataverse: { title: 'title', abstract: 'description', creators: 'authors', contact: 'contact', citation: 'authors, title, year, doi' },
};

const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const tidy = (s: string): string => s.replace(/\r\n?/g, '\n').trim();
const shorten = (s: string): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > 160 ? `${one.slice(0, 157)}...` : one;
};

/** Adds one value to the candidates: files that say the same thing (ignoring case and spacing) share one candidate and both stay listed as its sources. */
function add(list: Candidate[], value: string, src: SourceRef): void {
  const v = tidy(value);
  if (v === '') return;
  const same = list.find((c) => norm(c.value) === norm(v));
  if (same) {
    if (!same.sources.some((s) => s.file === src.file && s.field === src.field)) same.sources.push(src);
  } else list.push({ value: v, sources: [src] });
}

function addContact(list: Candidate[], name: string, email: string, src: SourceRef): void {
  const n = tidy(name);
  const e = email.trim();
  if (n === '' && e === '') return;
  const same = list.find((c) => (n !== '' ? norm(c.value) === norm(n) : norm(c.email ?? '') === norm(e)) && ((c.email ?? '') === '' || e === '' || norm(c.email ?? '') === norm(e)));
  if (same) {
    if ((same.email ?? '') === '' && e !== '') same.email = e;
    if (same.value === '' && n !== '') same.value = n;
    if (!same.sources.some((s) => s.file === src.file && s.field === src.field)) same.sources.push(src);
  } else list.push({ value: n, email: e, sources: [src] });
}

/** The citation a record alone gives: buildAttribution of that record, WITHOUT its licence sentence (the licence is the EML intellectualRights, chosen on the form). */
function citationOfRecord(rec: MetadataRecord): string {
  const a = analyseLicences([rec]);
  return buildAttribution({ ...a, contradictions: [], sources: a.sources.map((s) => ({ ...s, statements: [] })) }).text;
}

const said = (file: string, a: AnalysedStatement): LicenceSaid => ({ file, field: a.statement.field, says: shorten(shownOf(a)) || '—' });

/** The licence case of the records, by `analyseLicences()`; the rules are in the header of this file. */
export function licenceCaseOf(records: readonly MetadataRecord[]): LicenceCase {
  const analysis = analyseLicences(records);
  const all = analysis.sources.flatMap((s) => s.statements.map((a) => ({ file: s.label, a })));
  const says = all.map(({ file, a }) => said(file, a));
  if (analysis.contradictions.length > 0) {
    // a restriction code that contradicts an open licence is part of what the files say
    const codes = analysis.contradictions.flatMap((c) => (c.kind === 'restriction-code' ? c.codes : []));
    const rec = records.find((r) => r.restrictionCodes.length > 0);
    return { kind: 'contradictory', says: [...says, ...(codes.length > 0 && rec ? [{ file: rec.label, field: 'restrictionCode', says: codes.join(', ') }] : [])] };
  }
  if (all.length === 0) return { kind: 'missing' };
  const ids = [...new Set(all.flatMap(({ a }) => (a.classification.kind === 'spdx' ? [a.classification.id] : [])))];
  const unrecognised = all.some(({ a }) => a.classification.kind !== 'spdx');
  if (ids.length === 1 && !unrecognised) {
    const id = ids[0];
    if (isLicence(id)) return { kind: 'taken', id, sources: all.map(({ file, a }) => ({ file, field: a.statement.field })) };
    return { kind: 'other', said: id, says };
  }
  if (ids.length === 0) return { kind: 'other', said: shorten(shownOf(all[0].a)) || '—', says };
  return { kind: 'contradictory', says };
}

/** What the metadata records say, as the page shows it. Undefined when there are no records. */
export function buildPrefill(records: readonly MetadataRecord[]): ConvertPrefill | undefined {
  if (records.length === 0) return undefined;
  const fields: Record<PrefillKey, Candidate[]> = { title: [], abstract: [], creators: [], contact: [], citation: [] };
  for (const r of records) {
    const f = (k: PrefillKey): SourceRef => ({ file: r.label, field: FIELD[r.source][k] });
    if (r.title) add(fields.title, r.title, f('title'));
    if (r.abstract) add(fields.abstract, r.abstract, f('abstract'));
    if (r.creators && r.creators.length > 0) add(fields.creators, r.creators.map((c) => c.trim()).filter((c) => c !== '').join('\n'), f('creators'));
    for (const c of r.contacts ?? []) addContact(fields.contact, c.name ?? '', c.email ?? '', f('contact'));
    const cit = citationOfRecord(r);
    if (cit !== '') add(fields.citation, cit, f('citation'));
  }
  const coverage: CoverageSaid[] = records.flatMap((r) => {
    const start = r.temporalExtent?.start;
    const end = r.temporalExtent?.end;
    if (!start && !end && !r.bbox) return [];
    return [{ file: r.label, ...(start ? { start } : {}), ...(end ? { end } : {}), ...(r.bbox ? { bbox: r.bbox } : {}) }];
  });
  return {
    files: records.map((r) => ({ fileName: r.label, kind: metadataKindName(r) })),
    fields,
    licence: licenceCaseOf(records),
    coverage,
    organisationsInCreators: records.some((r) => (r.organisations?.length ?? 0) > 0),
  };
}

/** The values to put into EMPTY form fields: a field with exactly one distinct value, and the licence in the "taken" case. Never a choice between files. */
export function prefillValues(p: ConvertPrefill | undefined): Partial<DatasetMetadata> {
  if (!p) return {};
  const out: Partial<DatasetMetadata> = {};
  const one = (k: PrefillKey): Candidate | undefined => (p.fields[k].length === 1 ? p.fields[k][0] : undefined);
  const title = one('title');
  if (title) out.title = title.value;
  const abstract = one('abstract');
  if (abstract) out.abstract = abstract.value;
  const creators = one('creators');
  if (creators) out.creators = creators.value;
  const contact = one('contact');
  if (contact) {
    if (contact.value !== '') out.contactName = contact.value;
    if ((contact.email ?? '') !== '') out.contactEmail = contact.email;
  }
  const citation = one('citation');
  if (citation) out.citation = citation.value;
  if (p.licence.kind === 'taken') out.licence = p.licence.id;
  return out;
}

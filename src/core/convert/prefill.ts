// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { DOMParser } from '@xmldom/xmldom';
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
 * The licence cases, derived strictly from `analyseLicences()` (the comparison /check and the licence page use):
 *   contradictory  the analysis reports contradictions; `says` lists every statement, with its file and field
 *   taken          no contradiction and exactly one recognised id, one of CC0-1.0, CC-BY-4.0, CC-BY-NC-4.0: prefilled
 *   other          no contradiction and either one recognised id OBIS does not accept, several recognised ids (dual licensing), or only free text
 *   missing        no source states a licence
 * `also` lists the statements that are no recognised licence (an access note, a use limitation), as a neutral note: they are never a conflict.
 */
export type LicenceCase =
  | { kind: 'taken'; id: LicenceId; sources: SourceRef[]; also: LicenceSaid[] }
  | { kind: 'other'; said: string; ids: string[]; says: LicenceSaid[]; also: LicenceSaid[] }
  | { kind: 'contradictory'; ids: string[]; says: LicenceSaid[] }
  | { kind: 'missing' };

/** The recognised licence ids the metadata state (taken or other); [] otherwise. What a different chosen licence is compared with (CONV-LICENCE-DIFFERS). */
export function recognisedLicenceIds(p: Pick<ConvertPrefill, 'licence'> | null | undefined): string[] {
  const l = p?.licence;
  return l?.kind === 'taken' ? [l.id] : l?.kind === 'other' || l?.kind === 'contradictory' ? l.ids : [];
}

/**
 * What CONV-LICENCE-DIFFERS compares the chosen licence with: every recognised id of the metadata, in every case (taken, other, contradictory), and whether the
 * files disagree (contradictory with more than one id): then even choosing one of the ids differs from what another file says.
 */
export interface LicenceSource {
  ids: string[];
  disagree: boolean;
}
export function licenceSourceOf(p: Pick<ConvertPrefill, 'licence'> | null | undefined): LicenceSource {
  const ids = recognisedLicenceIds(p);
  return { ids, disagree: p?.licence.kind === 'contradictory' && ids.length > 1 };
}

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
  /** Files that list SEVERAL contacts: a list to pick one from, not a disagreement between files. */
  contactLists: { file: string; field: string; items: { name: string; email: string }[] }[];
  /** The contacts of the files that name exactly one: differing ones are values of different files, a real disagreement. */
  contactSingles: Candidate[];
  /** Creator and contact names the files themselves mark as organisations (DataCite nameType Organizational, an ISO organisationName without an individualName, Zenodo organizational). */
  organisations: string[];
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

/** HTML named entities, all of them: the HTML entity table of the XML library the metadata readers already use (no DOM needed, so it runs in the worker). */
const NAMED = new Map<string, string | undefined>();
function namedEntity(name: string): string | undefined {
  if (NAMED.has(name)) return NAMED.get(name);
  let out: string | undefined;
  try {
    const doc = new DOMParser({ onError: () => undefined }).parseFromString(`<!DOCTYPE html><html><body><p>&${name};</p></body></html>`, 'text/html');
    const t = doc.getElementsByTagName('p')[0]?.textContent ?? '';
    out = t !== '' && t !== `&${name};` ? t : undefined;
  } catch {
    out = undefined;
  }
  NAMED.set(name, out);
  return out;
}

/**
 * The text of a value as the form takes it: HTML entities decoded (once: "&amp;lt;" becomes "&lt;"), non-breaking and odd spaces made plain, blanks within a line
 * collapsed, lines trimmed, runs of blank lines cut to one. Done here and not in the shared parsers, because /check reads those unchanged. Values of different
 * files are compared after this, so a Zenodo record and its own DataCite record do not disagree over an entity or a space.
 */
export function cleanText(s: string): string {
  const decoded = s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) return namedEntity(name) ?? m;
    const code = dec !== undefined ? Number(dec) : parseInt(hex as string, 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
  return decoded
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f\u2009\u200a\t]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const norm = (s: string): string => cleanText(s).normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
const tidy = cleanText;
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
  // contradictory exactly when the shared analysis says so, never otherwise
  if (analysis.contradictions.length > 0) {
    // a restriction code that contradicts an open licence is part of what the files say
    const codes = analysis.contradictions.flatMap((c) => (c.kind === 'restriction-code' ? c.codes : []));
    const rec = records.find((r) => r.restrictionCodes.length > 0);
    const allIds = [...new Set(all.flatMap(({ a }) => (a.classification.kind === 'spdx' ? [a.classification.id] : [])))];
    return { kind: 'contradictory', ids: allIds, says: [...says, ...(codes.length > 0 && rec ? [{ file: rec.label, field: 'restrictionCode', says: codes.join(', ') }] : [])] };
  }
  if (all.length === 0) return { kind: 'missing' };
  const licences = all.filter(({ a }) => a.classification.kind === 'spdx');
  const others = all.filter(({ a }) => a.classification.kind !== 'spdx').map(({ file, a }) => said(file, a));
  const ids = [...new Set(licences.flatMap(({ a }) => (a.classification.kind === 'spdx' ? [a.classification.id] : [])))];
  if (ids.length === 1 && isLicence(ids[0])) return { kind: 'taken', id: ids[0], sources: licences.map(({ file, a }) => ({ file, field: a.statement.field })), also: others };
  if (ids.length === 0) return { kind: 'other', said: shorten(shownOf(all[0].a)) || '—', ids: [], says, also: [] };
  return { kind: 'other', said: ids.join(', '), ids, says: licences.map(({ file, a }) => said(file, a)), also: others };
}

/**
 * The record of a PANGAEA file's own header, as the description of the dataset takes it. PANGAEA's citation marks its title with " [dataset]" (the type of the record), which is not
 * part of the title that the DataCite record of the same dataset gives; it is cut here (and not in the shared parser, which /check reads unchanged), so that the two do not disagree.
 */
export function pangaeaHeaderRecord(rec: MetadataRecord): MetadataRecord {
  return rec.title === undefined ? rec : { ...rec, title: rec.title.replace(/\s*\[dataset(?: publication series)?\]\s*$/i, '').trim() };
}

/** What the metadata records say, as the page shows it. Undefined when there are no records. */
export function buildPrefill(records: readonly MetadataRecord[]): ConvertPrefill | undefined {
  if (records.length === 0) return undefined;
  const fields: Record<PrefillKey, Candidate[]> = { title: [], abstract: [], creators: [], contact: [], citation: [] };
  const contactSingles: Candidate[] = [];
  const contactLists: ConvertPrefill['contactLists'] = [];
  const organisations = new Set<string>();
  for (const r of records) {
    const f = (k: PrefillKey): SourceRef => ({ file: r.label, field: FIELD[r.source][k] });
    if (r.title) add(fields.title, r.title, f('title'));
    if (r.abstract) add(fields.abstract, r.abstract, f('abstract'));
    if (r.creators && r.creators.length > 0) add(fields.creators, r.creators.map((c) => c.trim()).filter((c) => c !== '').join('\n'), f('creators'));
    const own = (r.contacts ?? []).filter((c) => (c.name ?? '') !== '' || (c.email ?? '') !== '');
    for (const c of own) addContact(fields.contact, c.name ?? '', c.email ?? '', f('contact'));
    if (own.length === 1) addContact(contactSingles, own[0].name ?? '', own[0].email ?? '', f('contact'));
    else if (own.length > 1) contactLists.push({ file: r.label, field: f('contact').field, items: own.map((c) => ({ name: cleanText(c.name ?? ''), email: (c.email ?? '').trim() })) });
    for (const n of [...(r.organisations ?? []), ...(r.organisationParties ?? []), ...own.flatMap((c) => (c.organisation === true && c.name ? [c.name] : []))]) if (cleanText(n) !== '') organisations.add(cleanText(n));
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
    contactLists,
    contactSingles,
    organisations: [...organisations],
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
  if (p.organisations.length > 0) out.organisations = p.organisations.join('\n');
  return out;
}

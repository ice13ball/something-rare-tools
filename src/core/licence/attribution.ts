// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The attribution line a user can paste. ENGLISH ONLY in every UI language (it is copy, not interface). Pure, no I/O.
// Missing parts are left out, never invented. The licence is named only when it is unambiguous.
import type { LicenceAnalysis } from './analyse';
import type { MetadataRecord } from '../types';

/** Why the licence part is left out. */
export type LicenceOmitted = 'none' | 'several' | 'contradiction' | 'unrecognised';

export interface Attribution {
  /** The text to paste; '' when the sources hold nothing to cite. */
  text: string;
  /** Set when the licence part is left out. */
  omitted?: LicenceOmitted;
}

const first = <T>(records: readonly MetadataRecord[], pick: (r: MetadataRecord) => T | undefined): T | undefined => {
  for (const r of records) {
    const v = pick(r);
    if (v !== undefined) return v;
  }
  return undefined;
};

const end = (s: string): string => (/[.!?]$/.test(s) ? s : s + '.');

export function buildAttribution(a: LicenceAnalysis): Attribution {
  // DataCite is the citation record of a DOI; the others fill what it lacks.
  const records = a.sources
    .flatMap((s) => (s.record ? [s.record] : []))
    .sort((x, y) => Number(y.source === 'datacite') - Number(x.source === 'datacite'));
  const creators = first(records, (r) => (r.creators && r.creators.length > 0 ? r.creators : undefined));
  const year = first(records, (r) => r.publicationYear);
  const title = first(records, (r) => (r.title?.trim() ? r.title.trim() : undefined));
  const publisher = first(records, (r) => (r.publisher?.trim() ? r.publisher.trim() : undefined));
  const doi = first(records, (r) => (r.doi?.trim() ? r.doi.trim() : undefined));

  const statements = a.sources.flatMap((s) => s.statements);
  const ids = [...new Set(statements.flatMap((s) => (s.classification.kind === 'spdx' ? [s.classification.id] : [])))];
  let omitted: LicenceOmitted | undefined;
  // DataCite saying nothing is not a contrary statement: the licence another record of the deposit states is still the licence.
  if (a.contradictions.some((c) => c.kind !== 'datacite-empty')) omitted = 'contradiction';
  else if (ids.length === 0) omitted = 'none';
  else if (ids.length > 1) omitted = 'several';
  else if (statements.some((s) => s.classification.kind !== 'spdx')) omitted = 'unrecognised';
  const info = omitted ? undefined : statements.find((s) => s.info)?.info;
  if (!omitted && !info) omitted = 'none';

  const parts: string[] = [];
  const who = creators?.map((c) => c.trim()).filter((c) => c !== '').join('; ');
  if (who && year !== undefined) parts.push(`${who} (${year}).`);
  else if (who) parts.push(end(who));
  else if (year !== undefined) parts.push(`(${year}).`);
  if (title) parts.push(end(title));
  if (publisher) parts.push(end(publisher));
  if (doi) parts.push(`https://doi.org/${doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '')}`);
  if (parts.length === 0) return { text: '', ...(omitted ? { omitted } : {}) };
  if (info) parts.push(`Licence: ${info.name} (${info.url}).`);
  return { text: parts.join(' '), ...(omitted ? { omitted } : {}) };
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { hasTabOrNewline } from './ids';

/*
 * The dataset description the user types on /convert (a minimal form) and what the writers take from it: eml.xml (eml.ts) and the datasetName
 * and institutionCode columns of event.txt (dwca.ts). Nothing here is read from anywhere else in this stage; stage 3 will fill the same shape
 * from dropped metadata files (`ConvertParseResult.prefill`), which is why the form is a plain record of strings: `applyPrefill` puts a value
 * only into an EMPTY field, so what the user typed is never overwritten.
 *
 * ⛔ No licence and no basisOfRecord are ever defaulted: the rights holder decides the licence (the page says so), and what was collected decides
 * the basis of record. A missing choice blocks (CONV-LICENCE-UNSET, CONV-BASIS-UNSET).
 */

/** The form of the description: EML 2.2.0 with the GBIF Metadata Profile 1.3 (what the IPT 3.3.7 writes; docs/research/qc-sources.md, Item 3). */
export const EML_VERSION = '2.2.0';
export const GBIF_PROFILE_VERSION = '1.3';

/** The three licences the IPT supports for a dataset and the OBIS Manual names (CC0 preferred, CC-BY accepted, CC-BY-NC the least preferred). */
export const LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-NC-4.0'] as const;
export type LicenceId = (typeof LICENCES)[number];

/**
 * basisOfRecord values BioCheck accepts (its error list, docs/research/qc-sources.md Item 2): the Darwin Core vocabulary without MaterialCitation.
 * The three that fit a plankton or benthos count come first.
 */
export const BASES_OF_RECORD = ['HumanObservation', 'PreservedSpecimen', 'MaterialSample', 'MachineObservation', 'LivingSpecimen', 'FossilSpecimen', 'Occurrence'] as const;
export type BasisOfRecord = (typeof BASES_OF_RECORD)[number];

/** What the form holds. Empty string = not filled in (and for the two choices: not chosen). */
export interface DatasetMetadata {
  title: string;
  abstract: string;
  /** One creator per line: "Given Family" or "Family, Given". */
  creators: string;
  contactName: string;
  contactEmail: string;
  institutionCode: string;
  /** Empty = the title is used. */
  datasetName: string;
  licence: '' | LicenceId;
  basisOfRecord: '' | BasisOfRecord;
  /** Optional: how the data were collected (EML methods). */
  methods: string;
}

export const EMPTY_METADATA: DatasetMetadata = {
  title: '',
  abstract: '',
  creators: '',
  contactName: '',
  contactEmail: '',
  institutionCode: '',
  datasetName: '',
  licence: '',
  basisOfRecord: '',
  methods: '',
};

export const isLicence = (v: unknown): v is LicenceId => typeof v === 'string' && (LICENCES as readonly string[]).includes(v);
export const isBasis = (v: unknown): v is BasisOfRecord => typeof v === 'string' && (BASES_OF_RECORD as readonly string[]).includes(v);

/**
 * Puts the values of `prefill` into the EMPTY fields of `form` and leaves every other field as it is. A prefilled licence or basis is accepted only
 * when it is one of the allowed values. The seam for stage 3: metadata read from dropped files arrives here, and the user still sees and may edit it.
 */
export function applyPrefill(form: DatasetMetadata, prefill: Partial<DatasetMetadata> | undefined): DatasetMetadata {
  if (!prefill) return form;
  const out: DatasetMetadata = { ...form };
  for (const k of Object.keys(EMPTY_METADATA) as (keyof DatasetMetadata)[]) {
    const v = prefill[k];
    if (typeof v !== 'string' || v.trim() === '' || form[k].trim() !== '') continue;
    if (k === 'licence') {
      if (isLicence(v)) out.licence = v;
    } else if (k === 'basisOfRecord') {
      if (isBasis(v)) out.basisOfRecord = v;
    } else out[k] = v;
  }
  return out;
}

/** The dataset name: the typed one, or the title when none was typed. Trimmed; '' when neither exists. */
export const datasetNameOf = (m: DatasetMetadata): string => (m.datasetName.trim() !== '' ? m.datasetName : m.title).trim();

/** The creators typed one per line, trimmed, empty lines dropped. */
export const creatorLines = (m: Pick<DatasetMetadata, 'creators'>): string[] =>
  m.creators
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/**
 * What the description lacks, as the codes CONV-EML-MISSING carries (title, abstract, creator, contact name, contact email, institution code,
 * dataset name). `institution code` and `dataset name` also count as unusable when they hold a tab or a line break: they are written into every row
 * of the tab-separated event.txt.
 */
export function missingFields(m: DatasetMetadata): string[] {
  const out: string[] = [];
  if (m.title.trim() === '') out.push('title');
  if (m.abstract.trim() === '') out.push('abstract');
  if (creatorLines(m).length === 0) out.push('creator');
  if (m.contactName.trim() === '') out.push('contact name');
  if (!EMAIL.test(m.contactEmail.trim())) out.push('contact email');
  const code = m.institutionCode.trim();
  if (code === '' || hasTabOrNewline(code)) out.push('institution code');
  const name = datasetNameOf(m);
  if (name === '' || hasTabOrNewline(name)) out.push('dataset name');
  return out;
}

/**
 * Lowercase words that belong to a family name when they stand just before its last word and the name has no comma ("Ludwig van Beethoven" -> family
 * name "van Beethoven", "Maria de la Cruz" -> "de la Cruz"). Matched in lowercase only: "Jan Van Berg" keeps "Berg", because a capital letter says
 * nothing about a particle. The first word is always a given name.
 */
export const NAME_PARTICLES = ['de', 'la', 'del', 'della', 'di', 'da', 'du', 'des', 'van', 'von', 'der', 'den', 'ten', 'ter', 'le', 'dos', 'das'] as const;
const PARTICLES = new Set<string>(NAME_PARTICLES);

/**
 * "Given Family" / "Family, Given" -> the two EML name parts. With a comma the name is taken as written (before the comma: family name). Without one the
 * last word is the family name, with the lowercase particles (NAME_PARTICLES) right before it. A single word is the family name.
 */
export function splitPersonName(line: string): { givenName?: string; surName: string } {
  const t = line.trim().replace(/\s+/g, ' ');
  const comma = t.indexOf(',');
  if (comma > 0) {
    const sur = t.slice(0, comma).trim();
    const given = t.slice(comma + 1).trim();
    return given === '' ? { surName: sur } : { givenName: given, surName: sur };
  }
  const words = t.split(' ');
  if (words.length === 1) return { surName: t };
  let from = words.length - 1;
  while (from > 1 && PARTICLES.has(words[from - 1])) from--;
  return { givenName: words.slice(0, from).join(' '), surName: words.slice(from).join(' ') };
}

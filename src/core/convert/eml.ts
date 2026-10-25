// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { escapeXml } from '../output/draft';
import { slugOf } from './dwca';
import type { DatasetMetadata, LicenceId } from './metadata';
import { EML_VERSION, GBIF_PROFILE_VERSION, creatorLines, datasetNameOf, partyOf } from './metadata';
import type { ConvertedDataset } from './model';

/*
 * eml.xml: EML 2.2.0 with the GBIF Metadata Profile 1.3, the form the IPT 3.3.7 writes (docs/research/qc-sources.md, Item 3: the IPT's template root is
 * `<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0" ... xsi:schemaLocation="... https://rs.gbif.org/schema/eml-gbif-profile/1.3/eml.xsd">`,
 * and the synthetic archive written in that shape validated against the 1.3 schema and was read by BioCheck).
 *
 * Elements, in the order the schema requires: title, creator, metadataProvider, pubDate, language, abstract, keywordSet, intellectualRights, coverage
 * (geographic bounding box of the event positions, the temporal range of the event dates, the taxa of the occurrences), contact, methods (only when typed),
 * and additionalMetadata/metadata/gbif (dateStamp, hierarchyLevel, citation).
 *
 * The licence is machine-readable through a `ulink` inside `intellectualRights/para`, as the IPT writes it (LICENCE_TEXT below). Nothing is defaulted:
 * the licence comes from the user's explicit choice.
 */

export const EML_NAMESPACE = `https://eml.ecoinformatics.org/eml-${EML_VERSION}`;
export const EML_SCHEMA_LOCATION = `https://rs.gbif.org/schema/eml-gbif-profile/${GBIF_PROFILE_VERSION}/eml.xsd`;

/**
 * The licence sentences with their ulink. SOURCES, opened 2026-10-25:
 *  - the URLs: gbif/ipt tag ipt-3.3.7, src/main/java/org/gbif/ipt/config/Constants.java lines 141-146, GBIF_SUPPORTED_LICENSES (the http and https
 *    forms of `creativecommons.org/publicdomain/zero/1.0/legalcode`, `.../licenses/by/4.0/legalcode`, `.../licenses/by-nc/4.0/legalcode`); the codes
 *    CC0-1.0, CC-BY-4.0 and CC-BY-NC-4.0 are GBIF_SUPPORTED_LICENSES_CODES (lines 153-157). The http form is written, as the IPT writes it.
 *  - the sentences and titles: the same tag, src/main/resources/org/gbif/metadata/eml/licenses.properties lines 8-10 (license.name.*) and 20-22
 *    (license.text.*), which are what the IPT writes into intellectualRights; the IPT user manual applying-license.adoc (lines 48, 56, 64) shows the
 *    same three as `<ulink url="..."><citetitle>...</citetitle></ulink>` inside `<intellectualRights><para>`.
 */
export const LICENCE_ULINK: Record<LicenceId, { url: string; title: string; before: string; after: string }> = {
  'CC0-1.0': {
    url: 'http://creativecommons.org/publicdomain/zero/1.0/legalcode',
    title: 'Public Domain (CC0 1.0)',
    before: 'To the extent possible under law, the publisher has waived all rights to these data and has dedicated them to the ',
    after: '. Users may copy, modify, distribute and use the work, including for commercial purposes, without restriction.',
  },
  'CC-BY-4.0': {
    url: 'http://creativecommons.org/licenses/by/4.0/legalcode',
    title: 'Creative Commons Attribution (CC-BY 4.0) License',
    before: 'This work is licensed under a ',
    after: '.',
  },
  'CC-BY-NC-4.0': {
    url: 'http://creativecommons.org/licenses/by-nc/4.0/legalcode',
    title: 'Creative Commons Attribution Non Commercial (CC-BY-NC 4.0) License',
    before: 'This work is licensed under a ',
    after: '.',
  },
};

export interface EmlOptions {
  /** UTC timestamp of the export (`2026-10-25T12:00:00Z`): pubDate is its date, dateStamp the whole value. The core reads no clock; the caller passes it. */
  generated: string;
}

/* ---------- coverage ---------- */

export interface Coverage {
  bbox?: { west: number; east: number; north: number; south: number };
  dates?: { begin: string; end: string };
  taxa: string[];
}

/** The date a partial ISO date stands for at its start (2023 -> 2023-01-01, 2023-06 -> 2023-06-01) or end (2023 -> 2023-12-31, 2023-06 -> 2023-06-30). */
function fullDate(d: string, end: boolean): string | undefined {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(d);
  if (!m) return undefined;
  const y = m[1];
  const mo = m[2] ?? (end ? '12' : '01');
  const day = m[3] ?? (end ? String(new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate()).padStart(2, '0') : '01');
  return `${y}-${mo}-${day}`;
}

/** The dates an eventDate covers: `a/b` is both ends, anything else one date. */
function datesOf(eventDate: string): { begin?: string; end?: string } {
  const [a, b] = eventDate.split('/');
  const begin = fullDate(a, false);
  const end = fullDate(b ?? a, true);
  return { ...(begin === undefined ? {} : { begin }), ...(end === undefined ? {} : { end }) };
}

/** The longitudes' smallest bounding arc: the plain min/max, or, across the antimeridian, west > east. */
function lonBounds(lons: number[]): { west: number; east: number } {
  const sorted = [...lons].sort((a, b) => a - b);
  let gap = 0;
  let at = 0;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > gap) {
      gap = g;
      at = i;
    }
  }
  const wrapGap = sorted[0] + 360 - sorted[sorted.length - 1];
  // the biggest empty stretch decides: when it lies between the last and the first longitude the plain range is the smallest arc
  if (wrapGap >= gap) return { west: sorted[0], east: sorted[sorted.length - 1] };
  return { west: sorted[at], east: sorted[at - 1] };
}

/** Bounding box, date range and distinct scientific names of a dataset. */
export function coverageOf(ds: Pick<ConvertedDataset, 'events' | 'occurrences'>): Coverage {
  const lats: number[] = [];
  const lons: number[] = [];
  let begin: string | undefined;
  let end: string | undefined;
  for (const e of ds.events) {
    if (e.position) {
      lats.push(e.position.lat);
      lons.push(e.position.lon);
    }
    if (e.date !== undefined) {
      const d = datesOf(e.date);
      if (d.begin !== undefined && (begin === undefined || d.begin < begin)) begin = d.begin;
      if (d.end !== undefined && (end === undefined || d.end > end)) end = d.end;
    }
  }
  const out: Coverage = { taxa: [...new Set(ds.occurrences.map((o) => o.identification.scientificName))].sort() };
  if (lats.length > 0) out.bbox = { ...lonBounds(lons), north: Math.max(...lats), south: Math.min(...lats) };
  if (begin !== undefined && end !== undefined) out.dates = { begin, end };
  return out;
}

/* ---------- the document ---------- */

const MAX_TAXA = 200;
const para = (text: string, pad: string): string =>
  text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => `${pad}<para>${escapeXml(p)}</para>`)
    .join('\n');

const bound = (n: number): string => String(Math.round(n * 1e6) / 1e6);

function personXml(tag: string, line: string, email: string | undefined, pad: string, organisations: string): string {
  const n = partyOf(line, organisations);
  return [
    `${pad}<${tag}>`,
    n.kind === 'organisation'
      ? `${pad}  <organizationName>${escapeXml(n.name)}</organizationName>`
      : `${pad}  <individualName>${n.givenName === undefined ? '' : `<givenName>${escapeXml(n.givenName)}</givenName>`}<surName>${escapeXml(n.surName)}</surName></individualName>`,
    ...(email === undefined ? [] : [`${pad}  <electronicMailAddress>${escapeXml(email)}</electronicMailAddress>`]),
    `${pad}</${tag}>`,
  ].join('\n');
}

/**
 * The citation written into additionalMetadata/gbif/citation: the typed (or prefilled) one on one line, else "Family, G.; Family2, H. (2026). Title. Dataset."
 * built from the creators, the title and the year of the export.
 */
function citationOf(m: DatasetMetadata, year: string): string {
  if (m.citation.trim() !== '') return m.citation.trim().replace(/\s+/g, ' ');
  const names = creatorLines(m).map((l) => {
    const n = partyOf(l, m.organisations);
    if (n.kind === 'organisation') return n.name;
    return n.givenName === undefined ? n.surName : `${n.surName}, ${n.givenName}`;
  });
  return `${names.join('; ')} (${year}). ${m.title.trim()}. Dataset.`;
}

/*
 * A DOI is 10.<registrant>/<suffix>; the suffix may hold any printable character (DOI Handbook 2.2: "<>;()/:" among them; Crossref's pattern
 * 10.\d{4,9}/[-._;()/:A-Z0-9]+ covers most, and real suffixes such as 10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O do use < > ( ) ; :).
 * A citation is a sentence, so a DOI ends at a space or a quote, and trailing punctuation or an unbalanced closing bracket of the sentence is not part of it.
 * It is taken only from an address of doi.org or dx.doi.org, from "doi:", or from a bare 10.x/y string that is not inside another address (a path of some
 * other site that happens to contain 10.1234/x is not a DOI).
 */
const DOI_BODY = String.raw`10\.\d{4,9}\/[^\s"']+`;
const DOI_AFTER_RESOLVER = new RegExp(String.raw`(?:^|[^\w./-])(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)(${DOI_BODY})`, 'i');
const DOI_BARE = new RegExp(String.raw`(?<![\w./:@=?&#%-])(${DOI_BODY})`, 'i');
/** Takes the trailing punctuation of the sentence off, and an unbalanced closing bracket (a DOI in "(…)" or "<…>" does not own the bracket). */
function trimDoi(doi: string): string {
  let d = doi;
  for (;;) {
    const before = d;
    d = d.replace(/[.,;:!?'"]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['<', '>'], ['{', '}']] as const) {
      while (d.endsWith(close) && d.split(close).length > d.split(open).length) d = d.slice(0, -1);
    }
    if (d === before) return d;
  }
}

/**
 * The DOI the metadata carries, or undefined. The description of the dataset has no DOI field: the DOI is in the citation (typed, or prefilled from a
 * dropped metadata file: buildAttribution writes `https://doi.org/<doi>`), so that is where it is read.
 */
export function doiOfCitation(citation: string): string | undefined {
  const m = DOI_AFTER_RESOLVER.exec(citation) ?? DOI_BARE.exec(citation);
  if (!m) return undefined;
  const d = trimDoi(m[1]);
  return /^10\.\d{4,9}\/\S/.test(d) ? d : undefined;
}

/**
 * The identifier of additionalMetadata/gbif/citation. GBIF/IPT convention (checked against EML served by IPT installations on 2026-10-25, e.g.
 * https://ipt.biodiversidad.co/sibm/eml.do?r=coleccionanelidosmhnmc: `<citation identifier="https://doi.org/10.15472/ssc1ui">`): the DOI as a
 * https://doi.org/ address when the dataset has one. Without a DOI the slug stays, as before.
 */
export function citationIdentifier(m: Pick<DatasetMetadata, 'citation'>, slug: string): string {
  const doi = doiOfCitation(m.citation);
  return doi === undefined ? slug : `https://doi.org/${doi}`;
}

/**
 * The EML of a dataset. Throws when the licence is not chosen: nothing is defaulted (validate.ts blocks before this is called).
 */
export function buildEml(ds: Pick<ConvertedDataset, 'events' | 'occurrences' | 'metadata'>, opts: EmlOptions): string {
  const m = ds.metadata;
  if (m.licence === '') throw new Error('No licence is chosen: the EML intellectualRights element is never defaulted.');
  const lic = LICENCE_ULINK[m.licence];
  const pubDate = opts.generated.slice(0, 10);
  const cov = coverageOf(ds);
  const contactLine = m.contactName.trim();
  const email = m.contactEmail.trim();
  const slug = slugOf(datasetNameOf(m));
  const creators = creatorLines(m);
  const coverage: string[] = [];
  if (cov.bbox) {
    coverage.push(
      '      <geographicCoverage>',
      '        <geographicDescription>Bounding box of the positions of the sampling events in this dataset</geographicDescription>',
      '        <boundingCoordinates>',
      `          <westBoundingCoordinate>${bound(cov.bbox.west)}</westBoundingCoordinate>`,
      `          <eastBoundingCoordinate>${bound(cov.bbox.east)}</eastBoundingCoordinate>`,
      `          <northBoundingCoordinate>${bound(cov.bbox.north)}</northBoundingCoordinate>`,
      `          <southBoundingCoordinate>${bound(cov.bbox.south)}</southBoundingCoordinate>`,
      '        </boundingCoordinates>',
      '      </geographicCoverage>',
    );
  }
  if (cov.dates) {
    coverage.push(
      '      <temporalCoverage>',
      '        <rangeOfDates>',
      `          <beginDate><calendarDate>${cov.dates.begin}</calendarDate></beginDate>`,
      `          <endDate><calendarDate>${cov.dates.end}</calendarDate></endDate>`,
      '        </rangeOfDates>',
      '      </temporalCoverage>',
    );
  }
  if (cov.taxa.length > 0) {
    coverage.push(
      '      <taxonomicCoverage>',
      `        <generalTaxonomicCoverage>${escapeXml(`${cov.taxa.length} distinct scientific names in the occurrence table${cov.taxa.length > MAX_TAXA ? `; the first ${MAX_TAXA} are listed` : ''}`)}</generalTaxonomicCoverage>`,
      ...cov.taxa.slice(0, MAX_TAXA).flatMap((t) => ['        <taxonomicClassification>', `          <taxonRankValue>${escapeXml(t)}</taxonRankValue>`, '        </taxonomicClassification>']),
      '      </taxonomicCoverage>',
    );
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<eml:eml xmlns:eml="${EML_NAMESPACE}"`,
    '         xmlns:dc="http://purl.org/dc/terms/"',
    '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    `         xsi:schemaLocation="${EML_NAMESPACE} ${EML_SCHEMA_LOCATION}"`,
    `         packageId="${escapeXml(slug)}/v1.0" system="http://gbif.org" scope="system" xml:lang="en">`,
    '  <dataset>',
    `    <title xml:lang="en">${escapeXml(m.title.trim())}</title>`,
    ...creators.map((c) => personXml('creator', c, undefined, '    ', m.organisations)),
    personXml('metadataProvider', contactLine, email, '    ', m.organisations),
    `    <pubDate>${pubDate}</pubDate>`,
    '    <language>en</language>',
    '    <abstract>',
    para(m.abstract, '      '),
    '    </abstract>',
    '    <keywordSet>',
    '      <keyword>Occurrence</keyword>',
    '      <keyword>Samplingevent</keyword>',
    '      <keywordThesaurus>GBIF Dataset Type Vocabulary: http://rs.gbif.org/vocabulary/gbif/dataset_type_2015-07-10.xml</keywordThesaurus>',
    '    </keywordSet>',
    '    <intellectualRights>',
    `      <para>${escapeXml(lic.before)}<ulink url="${escapeXml(lic.url)}"><citetitle>${escapeXml(lic.title)}</citetitle></ulink>${escapeXml(lic.after)}</para>`,
    '    </intellectualRights>',
    ...(coverage.length > 0 ? ['    <coverage>', ...coverage, '    </coverage>'] : []),
    personXml('contact', contactLine, email, '    ', m.organisations),
    ...(m.methods.trim() === '' ? [] : ['    <methods>', '      <methodStep>', '        <description>', para(m.methods, '          '), '        </description>', '      </methodStep>', '    </methods>']),
    '  </dataset>',
    '  <additionalMetadata>',
    '    <metadata>',
    '      <gbif>',
    `        <dateStamp>${escapeXml(opts.generated)}</dateStamp>`,
    '        <hierarchyLevel>dataset</hierarchyLevel>',
    `        <citation identifier="${escapeXml(citationIdentifier(m, slug))}">${escapeXml(citationOf(m, pubDate.slice(0, 4)))}</citation>`,
    '      </gbif>',
    '    </metadata>',
    '  </additionalMetadata>',
    '</eml:eml>',
  ];
  return lines.join('\n') + '\n';
}

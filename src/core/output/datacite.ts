// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// DataCite kernel-4.5 XML draft writer. Elements the data cannot supply (DOI, creators, publisher) are XML comments.
import { commentText, decimalText, escapeXml, p01Url, spdxName, type MetadataDraft } from './draft';

export interface DataciteOptions {
  /** Year written as publicationYear; defaults to the current UTC year. */
  year?: number;
  /** Only when a DOI is already known; otherwise the identifier is left out (DataCite assigns it at publication). */
  doi?: string;
}

export function draftToDataciteXml(d: MetadataDraft, opts: DataciteOptions = {}): string {
  const year = opts.year ?? new Date().getUTCFullYear();
  const o: string[] = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push(
    '<resource xmlns="http://datacite.org/schema/kernel-4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://datacite.org/schema/kernel-4 http://schema.datacite.org/meta/kernel-4.5/metadata.xsd">',
  );
  if (opts.doi) o.push(`  <identifier identifierType="DOI">${escapeXml(opts.doi)}</identifier>`);
  else o.push(`  <!-- ${commentText('identifier: the DOI is assigned at publication; add <identifier identifierType="DOI"> then')} -->`);
  o.push(`  <!-- ${commentText('creators: required by DataCite, not known from the data')} -->`);
  if (d.title) o.push(`  <titles><title>${escapeXml(d.title)}</title></titles>`);
  else o.push(`  <!-- ${commentText('titles: required by DataCite, add a title')} -->`);
  o.push(`  <!-- ${commentText('publisher: required by DataCite, add the publisher')} -->`);
  o.push(`  <publicationYear>${year}</publicationYear>`);
  o.push('  <resourceType resourceTypeGeneral="Dataset">Dataset</resourceType>');

  if (d.variables.length > 0) {
    o.push('  <subjects>');
    for (const v of d.variables) {
      const url = v.p01 ? p01Url(v.p01) : undefined;
      const scheme = url ? ` subjectScheme="NERC P01" schemeURI="http://vocab.nerc.ac.uk/collection/P01/current/" valueURI="${escapeXml(url)}"` : '';
      o.push(`    <subject${scheme}>${escapeXml(v.name)}</subject>`);
    }
    o.push('  </subjects>');
  }

  if (d.temporalExtent) {
    o.push('  <dates>');
    o.push(`    <date dateType="Collected">${escapeXml(d.temporalExtent.start)}/${escapeXml(d.temporalExtent.end)}</date>`);
    o.push('  </dates>');
  }

  if (d.licence) {
    o.push('  <rightsList>');
    o.push(
      `    <rights rightsURI="${escapeXml(d.licence.uri)}" rightsIdentifier="${escapeXml(d.licence.spdx.toLowerCase())}" ` +
        `rightsIdentifierScheme="SPDX" schemeURI="https://spdx.org/licenses/">${escapeXml(spdxName(d.licence.spdx))}</rights>`,
    );
    o.push('  </rightsList>');
  }

  if (d.abstract) {
    o.push('  <descriptions>');
    o.push(`    <description descriptionType="Abstract">${escapeXml(d.abstract)}</description>`);
    o.push('  </descriptions>');
  }

  if (d.bbox) {
    o.push('  <geoLocations>');
    o.push('    <geoLocation>');
    o.push('      <geoLocationBox>');
    o.push(`        <westBoundLongitude>${decimalText(d.bbox.west)}</westBoundLongitude>`);
    o.push(`        <eastBoundLongitude>${decimalText(d.bbox.east)}</eastBoundLongitude>`);
    o.push(`        <southBoundLatitude>${decimalText(d.bbox.south)}</southBoundLatitude>`);
    o.push(`        <northBoundLatitude>${decimalText(d.bbox.north)}</northBoundLatitude>`);
    o.push('      </geoLocationBox>');
    o.push('    </geoLocation>');
    o.push('  </geoLocations>');
  }
  o.push('</resource>');
  return o.join('\n') + '\n';
}

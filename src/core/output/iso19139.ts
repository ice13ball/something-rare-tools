// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ISO 19139 (GeoNetwork) draft writer. A DRAFT: mandatory elements the data cannot supply (contact, citation date,
// language, topic category) are marked missing with gco:nilReason or left out, for the editor to complete.
import { decimalText, escapeXml, spdxName, variableLabel, type MetadataDraft } from './draft';

export interface IsoOptions {
  /** Date written as gmd:dateStamp; defaults to today (UTC). */
  now?: Date;
}

const CODELIST = 'http://standards.iso.org/iso/19139/resources/gmxCodelists.xml';

const cs = (s: string): string => `<gco:CharacterString>${escapeXml(s)}</gco:CharacterString>`;
const dec = (n: number): string => `<gco:Decimal>${decimalText(n)}</gco:Decimal>`;

/**
 * Where the variables go: MD_CoverageDescription (contentInfo) needs sensor/attribute descriptions that the data
 * cannot supply and is heavy to edit, so the variables are listed as ONE gmd:descriptiveKeywords block of type "theme",
 * one gmd:keyword per variable, written `name [unit]` (plus the NERC P01 code when known).
 */
export function draftToIso19139(d: MetadataDraft, opts: IsoOptions = {}): string {
  const now = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const o: string[] = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push(
    '<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" ' +
      'xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:gmx="http://www.isotc211.org/2005/gmx" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  );
  o.push('  <gmd:contact gco:nilReason="missing"/>');
  o.push(`  <gmd:dateStamp><gco:Date>${now}</gco:Date></gmd:dateStamp>`);
  o.push('  <gmd:identificationInfo>');
  o.push('    <gmd:MD_DataIdentification>');
  o.push('      <gmd:citation>');
  o.push('        <gmd:CI_Citation>');
  o.push(d.title ? `          <gmd:title>${cs(d.title)}</gmd:title>` : '          <gmd:title gco:nilReason="missing"/>');
  o.push('          <gmd:date gco:nilReason="missing"/>');
  o.push('        </gmd:CI_Citation>');
  o.push('      </gmd:citation>');
  o.push(d.abstract ? `      <gmd:abstract>${cs(d.abstract)}</gmd:abstract>` : '      <gmd:abstract gco:nilReason="missing"/>');

  if (d.variables.length > 0) {
    o.push('      <gmd:descriptiveKeywords>');
    o.push('        <gmd:MD_Keywords>');
    for (const v of d.variables) o.push(`          <gmd:keyword>${cs(variableLabel(v))}</gmd:keyword>`);
    o.push('          <gmd:type>');
    o.push(`            <gmd:MD_KeywordTypeCode codeList="${CODELIST}#MD_KeywordTypeCode" codeListValue="theme">theme</gmd:MD_KeywordTypeCode>`);
    o.push('          </gmd:type>');
    o.push('        </gmd:MD_Keywords>');
    o.push('      </gmd:descriptiveKeywords>');
  }

  if (d.licence) {
    o.push('      <gmd:resourceConstraints>');
    o.push('        <gmd:MD_LegalConstraints>');
    o.push('          <gmd:useConstraints>');
    o.push(`            <gmd:MD_RestrictionCode codeList="${CODELIST}#MD_RestrictionCode" codeListValue="otherRestrictions">otherRestrictions</gmd:MD_RestrictionCode>`);
    o.push('          </gmd:useConstraints>');
    o.push('          <gmd:otherConstraints>');
    o.push(`            <gmx:Anchor xlink:href="${escapeXml(d.licence.uri)}">${escapeXml(spdxName(d.licence.spdx))}</gmx:Anchor>`);
    o.push('          </gmd:otherConstraints>');
    o.push('        </gmd:MD_LegalConstraints>');
    o.push('      </gmd:resourceConstraints>');
  }

  if (d.bbox || d.temporalExtent) {
    o.push('      <gmd:extent>');
    o.push('        <gmd:EX_Extent>');
    if (d.bbox) {
      o.push('          <gmd:geographicElement>');
      o.push('            <gmd:EX_GeographicBoundingBox>');
      o.push(`              <gmd:westBoundLongitude>${dec(d.bbox.west)}</gmd:westBoundLongitude>`);
      o.push(`              <gmd:eastBoundLongitude>${dec(d.bbox.east)}</gmd:eastBoundLongitude>`);
      o.push(`              <gmd:southBoundLatitude>${dec(d.bbox.south)}</gmd:southBoundLatitude>`);
      o.push(`              <gmd:northBoundLatitude>${dec(d.bbox.north)}</gmd:northBoundLatitude>`);
      o.push('            </gmd:EX_GeographicBoundingBox>');
      o.push('          </gmd:geographicElement>');
    }
    if (d.temporalExtent) {
      o.push('          <gmd:temporalElement>');
      o.push('            <gmd:EX_TemporalExtent>');
      o.push('              <gmd:extent>');
      o.push('                <gml:TimePeriod gml:id="extent-1">');
      o.push(`                  <gml:beginPosition>${escapeXml(d.temporalExtent.start)}</gml:beginPosition>`);
      o.push(`                  <gml:endPosition>${escapeXml(d.temporalExtent.end)}</gml:endPosition>`);
      o.push('                </gml:TimePeriod>');
      o.push('              </gmd:extent>');
      o.push('            </gmd:EX_TemporalExtent>');
      o.push('          </gmd:temporalElement>');
    }
    o.push('        </gmd:EX_Extent>');
    o.push('      </gmd:extent>');
  }

  o.push('    </gmd:MD_DataIdentification>');
  o.push('  </gmd:identificationInfo>');
  o.push('</gmd:MD_Metadata>');
  return o.join('\n') + '\n';
}

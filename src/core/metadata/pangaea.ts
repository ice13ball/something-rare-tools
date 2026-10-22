// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// PANGAEA's own metadata XML (https://doi.pangaea.de/<DOI>?format=metainfo_xml, namespace http://www.pangaea.de/MetaData).
// Read by the licence page; /check keeps reading the licence from the textfile header (src/core/parse/pangaea.ts).
import type { LicenceStatement, MetadataRecord } from '../types';
import { child, children, descendants, parseXml, text } from './xml';
import { buildStatement } from './licence';

export const PANGAEA_NS = 'http://www.pangaea.de/MetaData';

/**
 * Parses the metadata XML of one PANGAEA dataset. Each `md:license` becomes a statement of source 'pangaea', field 'license':
 * the name is the shown text, the label ("CC-BY-3.0") a second reading of the same text, the URI the link — so the usual
 * text-against-link logic applies. Citation parts (authors, year, title, DOI) are kept for the attribution line.
 * Throws when the document is not PANGAEA metadata.
 */
export function parsePangaeaMetainfo(xml: string, label: string): MetadataRecord {
  const doc = parseXml(xml, label);
  const root = doc.documentElement;
  if (!root || root.localName !== 'MetaData' || root.namespaceURI !== PANGAEA_NS) throw new Error(`${label}: not PANGAEA metadata (no md:MetaData)`);
  const rec: MetadataRecord = { source: 'pangaea', label, licences: [], restrictionCodes: [], distributionLinks: [], publisher: 'PANGAEA' };

  const cit = child(root, PANGAEA_NS, 'citation');
  if (cit) {
    const title = text(child(cit, PANGAEA_NS, 'title'));
    if (title) rec.title = title;
    const year = /^\d{4}/.exec(text(child(cit, PANGAEA_NS, 'year')) ?? '');
    if (year) rec.publicationYear = Number(year[0]);
    const creators = children(cit, PANGAEA_NS, 'author')
      .map((a) => {
        const last = text(child(a, PANGAEA_NS, 'lastName'));
        const first = text(child(a, PANGAEA_NS, 'firstName'));
        return last && first ? `${last}, ${first}` : (last ?? first);
      })
      .filter((n): n is string => !!n);
    if (creators.length > 0) rec.creators = creators;
    const doi = /10\.\d{4,9}\/[^\s"<>]+/.exec(text(child(cit, PANGAEA_NS, 'URI')) ?? '')?.[0];
    if (doi) {
      rec.doi = doi;
      rec.landingUrl = `https://doi.pangaea.de/${doi}`;
    }
  }
  const abstract = text(child(root, PANGAEA_NS, 'abstract'));
  if (abstract) rec.abstract = abstract;

  for (const lic of descendants(root, PANGAEA_NS, 'license')) {
    const name = text(child(lic, PANGAEA_NS, 'name'));
    const id = text(child(lic, PANGAEA_NS, 'label'));
    const s: LicenceStatement | undefined = buildStatement({
      source: 'pangaea',
      field: 'license',
      text: name ?? id,
      also: [id],
      uri: text(child(lic, PANGAEA_NS, 'URI')),
    });
    if (s) rec.licences.push(s);
  }
  return rec;
}

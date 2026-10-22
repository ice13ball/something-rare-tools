// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ISO 19139 (GeoNetwork) parser. Matches namespaceURI + localName, never prefixes.
import type { LicenceStatement, MetadataRecord } from '../types';
import { buildStatement } from './licence';
import { NS, attr, child, children, descendants, elementChildren, num, parseXml, path, text } from './xml';

/** Text of a gco:CharacterString or gmx:Anchor (with xlink:href) wrapped by `el`. */
function textAndUri(el: Element | undefined): { text?: string; uri?: string } {
  if (!el) return {};
  const anchor = child(el, NS.gmx, 'Anchor');
  if (anchor) return { text: text(anchor), uri: attr(anchor, NS.xlink, 'href') };
  return { text: text(child(el, NS.gco, 'CharacterString')) };
}

function stmt(field: string, el: Element | undefined): LicenceStatement | undefined {
  const { text: t, uri } = textAndUri(el);
  return buildStatement({ source: 'iso19139', field, text: t, uri });
}

function findMetadata(doc: Document): Element | undefined {
  const root = doc.documentElement;
  if (root.localName === 'MD_Metadata' && root.namespaceURI === NS.gmd) return root;
  return descendants(root, NS.gmd, 'MD_Metadata')[0];
}

/** `ns`: where EX_* elements live (gmd in 19139, gex in 19115-3); `gcoNs`: the gco namespace of the Decimal wrappers. */
export function parseBbox(ident: Element, ns: string | readonly string[] = NS.gmd, gcoNs: string | readonly string[] = NS.gco): MetadataRecord['bbox'] {
  for (const box of descendants(ident, ns, 'EX_GeographicBoundingBox')) {
    const dec = (name: string) => {
      const e = child(box, ns, name);
      return e ? num(text(child(e, gcoNs, 'Decimal'))) : undefined;
    };
    const west = dec('westBoundLongitude');
    const east = dec('eastBoundLongitude');
    const south = dec('southBoundLatitude');
    const north = dec('northBoundLatitude');
    if (west !== undefined && east !== undefined && south !== undefined && north !== undefined) {
      return { west, east, south, north };
    }
  }
  return undefined;
}

function position(period: Element, name: string): string | undefined {
  const el = child(period, NS.gml, name);
  if (!el) return undefined;
  const ind = attr(el, null, 'indeterminatePosition');
  if (ind) return undefined; // now / after / before / unknown: no date to compare
  return text(el);
}

export function parseTemporal(ident: Element, ns: string | readonly string[] = NS.gmd): MetadataRecord['temporalExtent'] {
  const starts: string[] = [];
  const ends: string[] = [];
  let open = false;
  for (const ext of descendants(ident, ns, 'EX_TemporalExtent')) {
    for (const period of descendants(ext, NS.gml, 'TimePeriod')) {
      const b = position(period, 'beginPosition');
      const e = position(period, 'endPosition');
      if (b) starts.push(b);
      if (e) ends.push(e);
      else open = true;
    }
    for (const inst of descendants(ext, NS.gml, 'TimeInstant')) {
      const p = text(child(inst, NS.gml, 'timePosition'));
      if (p) { starts.push(p); ends.push(p); }
    }
  }
  if (starts.length === 0 && ends.length === 0) return undefined;
  starts.sort();
  ends.sort();
  return { start: starts[0], end: open ? undefined : ends[ends.length - 1] };
}

function pushConstraintText(rec: MetadataRecord, constraints: Element, prefix: string): void {
  for (const name of ['useLimitation', 'otherConstraints']) {
    for (const el of children(constraints, NS.gmd, name)) {
      const s = stmt(prefix + name, el);
      if (s) rec.licences.push(s);
    }
  }
}

const AUTHOR_ROLES = ['author', 'originator'];
const codeOf = (el: Element | undefined): string | undefined => (el ? (attr(el.firstChild ? (elementChildren(el)[0] ?? el) : el, null, 'codeListValue') ?? text(el)) : undefined);

/** Authors, publisher and publication year of a CI_Citation (for the attribution line). */
function attribution(cit: Element | undefined, rec: MetadataRecord): void {
  if (!cit) return;
  const creators: string[] = [];
  for (const party of children(cit, NS.gmd, 'citedResponsibleParty')) {
    for (const p of children(party, NS.gmd, 'CI_ResponsibleParty')) {
      const role = codeOf(child(p, NS.gmd, 'role'));
      const name = textAndUri(child(p, NS.gmd, 'individualName')).text ?? textAndUri(child(p, NS.gmd, 'organisationName')).text;
      if (!name) continue;
      if (role && AUTHOR_ROLES.includes(role)) creators.push(name);
      else if (role === 'publisher' && !rec.publisher) rec.publisher = textAndUri(child(p, NS.gmd, 'organisationName')).text ?? name;
    }
  }
  if (creators.length > 0) rec.creators = creators;
  for (const d of children(cit, NS.gmd, 'date')) {
    for (const ci of children(d, NS.gmd, 'CI_Date')) {
      if (codeOf(child(ci, NS.gmd, 'dateType')) !== 'publication') continue;
      const v = text(child(child(ci, NS.gmd, 'date') ?? ci, NS.gco, 'Date')) ?? text(child(child(ci, NS.gmd, 'date') ?? ci, NS.gco, 'DateTime'));
      const y = /^\d{4}/.exec(v ?? '');
      if (y) rec.publicationYear = Number(y[0]);
    }
  }
}

/** `xml`: the record's text, or its document when the caller has parsed it already (the collection run parses a record once). */
export function parseIso19139(xml: string | Document, label: string): MetadataRecord {
  const doc = typeof xml === 'string' ? parseXml(xml, label) : xml;
  const md = findMetadata(doc);
  if (!md) throw new Error(`${label}: not an ISO 19139 record (no gmd:MD_Metadata)`);

  const rec: MetadataRecord = { source: 'iso19139', label, licences: [], restrictionCodes: [], distributionLinks: [], isoProfile: '19139' };

  const ident = child(md, NS.gmd, 'identificationInfo');
  const idEl = ident ? (child(ident, NS.gmd, 'MD_DataIdentification') ?? elementChildren(ident)[0]) : undefined;

  if (idEl) {
    const cit = path(idEl, NS.gmd, 'citation', 'CI_Citation');
    rec.title = textAndUri(child(cit ?? idEl, NS.gmd, 'title')).text;
    rec.version = textAndUri(child(cit ?? idEl, NS.gmd, 'edition')).text;
    rec.abstract = textAndUri(child(idEl, NS.gmd, 'abstract')).text;
    attribution(cit, rec);

    for (const rc of children(idEl, NS.gmd, 'resourceConstraints')) {
      for (const c of elementChildren(rc)) {
        pushConstraintText(rec, c, '');
        for (const holder of elementChildren(c)) {
          for (const code of children(holder, NS.gmd, 'MD_RestrictionCode')) {
            const v = attr(code, null, 'codeListValue') ?? text(code);
            if (!v) continue;
            const kind = holder.localName === 'accessConstraints' ? 'access' : holder.localName === 'useConstraints' ? 'use' : 'other';
            rec.restrictionCodes.push({ kind, code: v });
          }
        }
      }
    }

    rec.bbox = parseBbox(idEl);
    rec.temporalExtent = parseTemporal(idEl);
  }

  // Constraints that describe the METADATA, not the data: kept apart by the field name.
  for (const mc of children(md, NS.gmd, 'metadataConstraints')) {
    for (const c of elementChildren(mc)) pushConstraintText(rec, c, 'metadataConstraints/');
  }

  for (const online of descendants(md, NS.gmd, 'onLine')) {
    for (const res of children(online, NS.gmd, 'CI_OnlineResource')) {
      const link: { url: string; name?: string; protocol?: string } = {
        url: text(path(res, NS.gmd, 'linkage')) ?? '',
      };
      const name = textAndUri(child(res, NS.gmd, 'name')).text;
      if (name) link.name = name;
      const pe = child(res, NS.gmd, 'protocol');
      const protocol = pe ? (textAndUri(pe).text ?? text(child(pe, NS.gmx, 'MimeFileType'))) : undefined;
      if (protocol) link.protocol = protocol;
      rec.distributionLinks.push(link);
    }
  }

  return rec;
}

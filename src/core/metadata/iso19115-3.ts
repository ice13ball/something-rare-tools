// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ISO 19115-3 (mdb:MD_Metadata) parser and the one entry point for ISO records of either profile.
// Same MetadataRecord as ISO 19139 (source 'iso19139', isoProfile tells them apart). Matches namespaceURI + localName.
import type { LicenceStatement, MetadataRecord } from '../types';
import { parseBbox, parseIso19139, parseTemporal } from './iso19139';
import { buildStatement } from './licence';
import { NS, NS3, attr, child, children, descendants, elementChildren, parseXml, text } from './xml';

/** Text of a gco:CharacterString or gcx:Anchor (with xlink:href) wrapped by `el`. */
function textAndUri(el: Element | undefined): { text?: string; uri?: string } {
  if (!el) return {};
  const anchor = child(el, NS3.gcx, 'Anchor');
  if (anchor) return { text: text(anchor), uri: attr(anchor, NS.xlink, 'href') };
  return { text: text(child(el, NS3.gco, 'CharacterString')) };
}

const codeOf = (el: Element | undefined): string | undefined => {
  const inner = el ? elementChildren(el)[0] : undefined;
  return inner ? (attr(inner, null, 'codeListValue') ?? text(inner)) : undefined;
};

function stmt(field: string, el: Element | undefined): LicenceStatement | undefined {
  const { text: t, uri } = textAndUri(el);
  return buildStatement({ source: 'iso19139', field, text: t, uri });
}

function findMetadata(doc: Document): Element | undefined {
  const root = doc.documentElement;
  if (root.localName === 'MD_Metadata' && (NS3.mdb as readonly string[]).includes(root.namespaceURI ?? '')) return root;
  return descendants(root, NS3.mdb, 'MD_Metadata')[0];
}

/** mco:MD_LegalConstraints / MD_Constraints: useLimitation, otherConstraints, a cited licence (mco:reference) and the codes. */
function pushConstraints(rec: MetadataRecord, constraints: Element, prefix: string): void {
  for (const name of ['useLimitation', 'otherConstraints']) {
    for (const el of children(constraints, NS3.mco, name)) {
      const s = stmt(prefix + name, el);
      if (s) rec.licences.push(s);
    }
  }
  // mco:reference: a CI_Citation of the licence — its title is the text, its online resource the link.
  for (const ref of children(constraints, NS3.mco, 'reference')) {
    for (const cit of children(ref, NS3.cit, 'CI_Citation')) {
      const title = textAndUri(child(cit, NS3.cit, 'title')).text;
      const link = descendants(cit, NS3.cit, 'linkage')[0];
      const uri = link ? (textAndUri(link).text ?? text(link)) : undefined;
      const s = buildStatement({ source: 'iso19139', field: `${prefix}reference`, text: title, uri });
      if (s) rec.licences.push(s);
    }
  }
}

function pushCodes(rec: MetadataRecord, constraints: Element): void {
  for (const holder of elementChildren(constraints)) {
    for (const code of children(holder, NS3.mco, 'MD_RestrictionCode')) {
      const v = attr(code, null, 'codeListValue') ?? text(code);
      if (!v) continue;
      const kind = holder.localName === 'accessConstraints' ? 'access' : holder.localName === 'useConstraints' ? 'use' : 'other';
      rec.restrictionCodes.push({ kind, code: v });
    }
  }
}

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i;
const AUTHOR_ROLES = ['author', 'originator'];

/** The names of a CI_Responsibility's parties: individuals when listed, else the organisation. */
function partyNames(resp: Element): string[] {
  const names: string[] = [];
  for (const party of children(resp, NS3.cit, 'party')) {
    const individuals = descendants(party, NS3.cit, 'CI_Individual').map((i) => textAndUri(child(i, NS3.cit, 'name')).text);
    const org = children(party, NS3.cit, 'CI_Organisation').map((o) => textAndUri(child(o, NS3.cit, 'name')).text);
    names.push(...(individuals.some(Boolean) ? individuals : org).filter((n): n is string => !!n));
  }
  return names;
}

export function parseIso19115_3(xml: string, label: string): MetadataRecord {
  const doc = parseXml(xml, label);
  const md = findMetadata(doc);
  if (!md) throw new Error(`${label}: not an ISO 19115-3 record (no mdb:MD_Metadata)`);

  const rec: MetadataRecord = { source: 'iso19139', label, licences: [], restrictionCodes: [], distributionLinks: [], isoProfile: '19115-3' };

  const ident = child(md, NS3.mdb, 'identificationInfo');
  const idEl = ident ? (child(ident, NS3.mri, 'MD_DataIdentification') ?? elementChildren(ident)[0]) : undefined;

  if (idEl) {
    const citWrap = child(idEl, NS3.mri, 'citation');
    const c = citWrap ? child(citWrap, NS3.cit, 'CI_Citation') : undefined;
    rec.title = textAndUri(c ? child(c, NS3.cit, 'title') : undefined).text;
    rec.version = textAndUri(c ? child(c, NS3.cit, 'edition') : undefined).text;
    rec.abstract = textAndUri(child(idEl, NS3.mri, 'abstract')).text;

    if (c) {
      for (const id of children(c, NS3.cit, 'identifier')) {
        const code = textAndUri(descendants(id, NS3.mcc, 'code')[0]).text;
        const m = code ? DOI.exec(code) : null;
        if (m) {
          rec.doi = m[1];
          break;
        }
      }
      const creators: string[] = [];
      const responsibilities = [...children(c, NS3.cit, 'citedResponsibleParty'), ...children(idEl, NS3.mri, 'pointOfContact')].flatMap((h) =>
        h.localName === 'CI_Responsibility' ? [h] : children(h, NS3.cit, 'CI_Responsibility'),
      );
      for (const resp of responsibilities) {
        const role = codeOf(child(resp, NS3.cit, 'role'));
        if (role && AUTHOR_ROLES.includes(role)) creators.push(...partyNames(resp));
        else if (role === 'publisher' && !rec.publisher) rec.publisher = partyNames(resp)[0];
      }
      if (creators.length > 0) rec.creators = [...new Set(creators)];
      for (const d of children(c, NS3.cit, 'date')) {
        for (const ci of children(d, NS3.cit, 'CI_Date')) {
          if (codeOf(child(ci, NS3.cit, 'dateType')) !== 'publication') continue;
          const inner = child(ci, NS3.cit, 'date');
          const v = text(inner ? (child(inner, NS3.gco, 'Date') ?? child(inner, NS3.gco, 'DateTime')) : undefined);
          const y = /^\d{4}/.exec(v ?? '');
          if (y) rec.publicationYear = Number(y[0]);
        }
      }
    }

    for (const rc of children(idEl, NS3.mri, 'resourceConstraints')) {
      for (const cons of elementChildren(rc)) {
        pushConstraints(rec, cons, '');
        pushCodes(rec, cons);
      }
    }

    rec.bbox = parseBbox(idEl, NS3.gex, NS3.gco);
    rec.temporalExtent = parseTemporal(idEl, NS3.gex);
  }

  // Constraints that describe the METADATA, not the data: kept apart by the field name.
  for (const mc of children(md, NS3.mdb, 'metadataConstraints')) {
    for (const cons of elementChildren(mc)) pushConstraints(rec, cons, 'metadataConstraints/');
  }

  for (const online of descendants(md, NS3.mrd, 'onLine')) {
    for (const res of children(online, NS3.cit, 'CI_OnlineResource')) {
      const link: { url: string; name?: string; protocol?: string } = { url: textAndUri(child(res, NS3.cit, 'linkage')).text ?? text(child(res, NS3.cit, 'linkage')) ?? '' };
      const name = textAndUri(child(res, NS3.cit, 'name')).text;
      if (name) link.name = name;
      const protocol = textAndUri(child(res, NS3.cit, 'protocol')).text;
      if (protocol) link.protocol = protocol;
      rec.distributionLinks.push(link);
    }
  }
  return rec;
}

/** An ISO record of either profile: 19115-3 when it carries the mdb namespace, else 19139. */
export function parseIsoRecord(xml: string, label: string): MetadataRecord {
  return /standards\.iso\.org\/iso\/19115\/-3\/mdb\//.test(xml) ? parseIso19115_3(xml, label) : parseIso19139(xml, label);
}

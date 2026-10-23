// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// DataCite parsers: REST JSON (`data.attributes`, `attributes` or bare attributes) and kernel-3/4 XML.
import type { LicenceStatement, MetadataRecord } from '../types';
import { buildStatement } from './licence';
import { attr, child, children, descendants, num, parseXml, text } from './xml';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};

interface Rights { rights?: string; uri?: string; identifier?: string }

/** relatedIdentifiers of type DOI that say "version of / has version": the DOIs of the other versions (or of the concept) of this deposit. */
const VERSION_RELATIONS = /^(?:IsVersionOf|HasVersion)$/i;
function versionDoisOf(items: { id?: string; type?: string; relation?: string }[]): string[] | undefined {
  const dois = items
    .filter((r) => r.id && /^doi$/i.test(r.type ?? '') && VERSION_RELATIONS.test(r.relation ?? ''))
    .map((r) => r.id!.trim().toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, ''));
  const unique = [...new Set(dois)];
  return unique.length > 0 ? unique : undefined;
}

function licenceOf(index: number, r: Rights): LicenceStatement | undefined {
  // The rights text is shown; the identifier ("cc-by-4.0") is read as text too, so the two cannot disagree unnoticed.
  return buildStatement({ source: 'datacite', field: `rightsList[${index}]`, text: r.rights ?? r.identifier, also: [r.identifier], identifier: r.identifier, uri: r.uri });
}

const yearOf = (v: unknown): number | undefined => {
  const m = /^\s*(\d{4})/.exec(String(v ?? ''));
  return m ? Number(m[1]) : undefined;
};

interface Box { west?: number; east?: number; south?: number; north?: number }
interface Point { lon?: number; lat?: number }

/**
 * Union of every complete box and point. A single box is returned as is (it may legitimately cross the
 * antimeridian, west > east); several shapes are merged with plain min/max. Incomplete shapes are ignored.
 */
function bboxOf(boxes: Box[], points: Point[]): MetadataRecord['bbox'] {
  const shapes: { west: number; east: number; south: number; north: number }[] = [];
  for (const b of boxes) {
    if (b.west !== undefined && b.east !== undefined && b.south !== undefined && b.north !== undefined) {
      shapes.push({ west: b.west, east: b.east, south: b.south, north: b.north });
    }
  }
  for (const p of points) {
    if (p.lon !== undefined && p.lat !== undefined) shapes.push({ west: p.lon, east: p.lon, south: p.lat, north: p.lat });
  }
  if (shapes.length === 0) return undefined;
  if (shapes.length === 1) return shapes[0];
  return {
    west: Math.min(...shapes.map((s) => s.west)),
    east: Math.max(...shapes.map((s) => s.east)),
    south: Math.min(...shapes.map((s) => s.south)),
    north: Math.max(...shapes.map((s) => s.north)),
  };
}

/** A Collected date: an interval "a/b" ("a/" is open-ended) or a single date. Original strings are kept. */
function collectedExtent(dates: { date?: string; type?: string }[]): MetadataRecord['temporalExtent'] {
  const d = dates.find((x) => x.type === 'Collected' && x.date);
  if (!d?.date) return undefined;
  const [a, b] = d.date.split('/');
  const start = a?.trim() || undefined;
  if (d.date.includes('/')) return { start, end: b?.trim() || undefined };
  return { start, end: start };
}

export function parseDataciteJson(json: unknown, label: string): MetadataRecord {
  const rec: MetadataRecord = { source: 'datacite', label, licences: [], restrictionCodes: [], distributionLinks: [] };
  let a: Obj = isObj(json) ? json : {};
  if (isObj(a.data) && isObj(a.data.attributes)) a = a.data.attributes;
  else if (isObj(a.attributes)) a = a.attributes;

  const titles = Array.isArray(a.titles) ? a.titles.filter(isObj) : [];
  rec.title = str((titles.find((t) => !t.titleType) ?? titles[0])?.title);

  const descs = Array.isArray(a.descriptions) ? a.descriptions.filter(isObj) : [];
  rec.abstract = str((descs.find((d) => d.descriptionType === 'Abstract') ?? (descs.length === 1 ? descs[0] : undefined))?.description);

  rec.version = str(a.version);
  rec.doi = str(a.doi);
  rec.landingUrl = str(a.url);
  const creators = (Array.isArray(a.creators) ? a.creators : []).filter(isObj).map((c) => str(c.name) ?? str([str(c.familyName), str(c.givenName)].filter(Boolean).join(', '))).filter((n): n is string => !!n);
  if (creators.length > 0) rec.creators = creators;
  const orgs = (Array.isArray(a.creators) ? a.creators : []).filter(isObj).filter((c) => /^organi[sz]ation/i.test(str(c.nameType) ?? '')).map((c) => str(c.name)).filter((n): n is string => !!n);
  if (orgs.length > 0) rec.organisations = orgs;
  rec.publicationYear = yearOf(a.publicationYear);
  rec.publisher = isObj(a.publisher) ? str(a.publisher.name) : str(a.publisher);
  if (isObj(a.types)) rec.resourceType = str(a.types.resourceTypeGeneral) ?? str(a.types.resourceType);

  const related = versionDoisOf((Array.isArray(a.relatedIdentifiers) ? a.relatedIdentifiers : []).filter(isObj).map((r) => ({ id: str(r.relatedIdentifier), type: str(r.relatedIdentifierType), relation: str(r.relationType) })));
  if (related) rec.versionDois = related;

  (Array.isArray(a.rightsList) ? a.rightsList : []).forEach((r, i) => {
    if (!isObj(r)) return;
    const l = licenceOf(i, { rights: str(r.rights), uri: str(r.rightsUri), identifier: str(r.rightsIdentifier) });
    if (l) rec.licences.push(l);
  });

  const dates = (Array.isArray(a.dates) ? a.dates : []).filter(isObj).map((d) => ({ date: str(d.date), type: str(d.dateType) }));
  rec.temporalExtent = collectedExtent(dates);

  const boxes: Box[] = [];
  const points: Point[] = [];
  for (const g of Array.isArray(a.geoLocations) ? a.geoLocations : []) {
    if (!isObj(g)) continue;
    const b = g.geoLocationBox;
    if (isObj(b)) boxes.push({ west: num(b.westBoundLongitude), east: num(b.eastBoundLongitude), south: num(b.southBoundLatitude), north: num(b.northBoundLatitude) });
    const p = g.geoLocationPoint;
    if (isObj(p)) points.push({ lon: num(p.pointLongitude), lat: num(p.pointLatitude) });
  }
  rec.bbox = bboxOf(boxes, points);
  return rec;
}

const DC_NS = /^http:\/\/datacite\.org\/schema\/kernel-\d/;

export function parseDataciteXml(xml: string, label: string): MetadataRecord {
  const doc = parseXml(xml, label);
  const root = doc.documentElement;
  const ns = root.namespaceURI ?? '';
  if (root.localName !== 'resource' || !DC_NS.test(ns)) throw new Error(`${label}: not a DataCite record (no kernel resource element)`);

  const rec: MetadataRecord = { source: 'datacite', label, licences: [], restrictionCodes: [], distributionLinks: [] };
  const one = (el: Element | undefined, name: string) => (el ? child(el, ns, name) : undefined);

  rec.doi = text(children(root, ns, 'identifier').find((i) => i.getAttribute('identifierType')?.toUpperCase() === 'DOI'));
  const titles = children(one(root, 'titles') ?? root, ns, 'title');
  rec.title = text(titles.find((t) => !t.getAttribute('titleType')) ?? titles[0]);
  const descs = children(one(root, 'descriptions') ?? root, ns, 'description');
  rec.abstract = text(descs.find((d) => d.getAttribute('descriptionType') === 'Abstract') ?? (descs.length === 1 ? descs[0] : undefined));
  rec.version = text(one(root, 'version'));
  const creators = children(one(root, 'creators') ?? root, ns, 'creator').map((c) => text(child(c, ns, 'creatorName'))).filter((n): n is string => !!n);
  if (creators.length > 0) rec.creators = creators;
  const orgs = children(one(root, 'creators') ?? root, ns, 'creator').flatMap((c) => { const n = child(c, ns, 'creatorName'); return n && /^organi[sz]ation/i.test(n.getAttribute('nameType') ?? '') ? [text(n)] : []; }).filter((n): n is string => !!n);
  if (orgs.length > 0) rec.organisations = orgs;
  rec.publicationYear = yearOf(text(one(root, 'publicationYear')));
  rec.publisher = text(one(root, 'publisher'));
  const rt = one(root, 'resourceType');
  rec.resourceType = attr(rt, null, 'resourceTypeGeneral') ?? text(rt);

  const relatedXml = versionDoisOf(
    children(one(root, 'relatedIdentifiers') ?? root, ns, 'relatedIdentifier').map((r) => ({ id: text(r), type: attr(r, null, 'relatedIdentifierType'), relation: attr(r, null, 'relationType') })),
  );
  if (relatedXml) rec.versionDois = relatedXml;

  children(one(root, 'rightsList') ?? root, ns, 'rights').forEach((r, i) => {
    const l = licenceOf(i, { rights: text(r), uri: attr(r, null, 'rightsURI'), identifier: attr(r, null, 'rightsIdentifier') });
    if (l) rec.licences.push(l);
  });

  rec.temporalExtent = collectedExtent(
    children(one(root, 'dates') ?? root, ns, 'date').map((d) => ({ date: text(d), type: attr(d, null, 'dateType') })),
  );

  const boxes: Box[] = [];
  const points: Point[] = [];
  for (const g of descendants(root, ns, 'geoLocation')) {
    for (const b of children(g, ns, 'geoLocationBox')) {
      const v = (n: string) => num(text(child(b, ns, n)));
      boxes.push({ west: v('westBoundLongitude'), east: v('eastBoundLongitude'), south: v('southBoundLatitude'), north: v('northBoundLatitude') });
    }
    for (const p of children(g, ns, 'geoLocationPoint')) {
      points.push({ lon: num(text(child(p, ns, 'pointLongitude'))), lat: num(text(child(p, ns, 'pointLatitude'))) });
    }
  }
  rec.bbox = bboxOf(boxes, points);
  return rec;
}

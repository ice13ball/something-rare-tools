// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Zenodo record parser: legacy (files[] with key/links.self) and InvenioRDM (files.entries keyed by filename).
import type { LicenceStatement, MetadataRecord } from '../types';
import { boxOfPoints, COVERAGE_DATE_TYPES, extentOfDate, unionBoxes, unionExtents, type Bbox } from './extent';
import { buildStatement } from './licence';
import { num, stripTags } from './xml';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};
const size = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The CORS-safe form (see docs/research/infra.md): never go through doi.org or the html page. */
export function zenodoFileUrl(recordId: string, key: string): string {
  return `https://zenodo.org/api/records/${encodeURIComponent(recordId)}/files/${encodeURIComponent(key)}/content`;
}

function licence(field: string, id: string | undefined, uri?: string, title?: string): LicenceStatement | undefined {
  return buildStatement({ source: 'zenodo', field, text: id ?? title, also: [title], uri });
}

function localised(v: unknown): string | undefined {
  if (isObj(v)) return str(v.en) ?? str(Object.values(v)[0]);
  return str(v);
}

type Pos = { lon?: number; lat?: number };

/** Every [lon, lat(, alt)] position of a GeoJSON coordinates value, whatever the nesting (Point, LineString, Polygon, Multi*). */
function positions(c: unknown): Pos[] {
  if (!Array.isArray(c)) return [];
  if (c.length >= 2 && c.every((x) => typeof x === 'number' || typeof x === 'string')) return [{ lon: num(c[0]), lat: num(c[1]) }];
  return c.flatMap(positions);
}

function geometryPositions(g: unknown): Pos[] {
  if (!isObj(g)) return [];
  if (Array.isArray(g.geometries)) return g.geometries.flatMap(geometryPositions);
  return positions(g.coordinates);
}

/**
 * Where the DATA are, from `metadata.locations` only: legacy list [{ lat, lon, place }] or InvenioRDM
 * { features: [{ geometry, place }] }. A place name alone, or the repository's address, is not a location.
 * Each feature is one shape; shapes are merged by unionBoxes. Off-the-globe shapes are ignored.
 */
function bboxOfLocations(locations: unknown): Bbox | undefined {
  const items: unknown[] = Array.isArray(locations) ? locations : isObj(locations) && Array.isArray(locations.features) ? locations.features : [];
  const boxes: Bbox[] = [];
  for (const it of items) {
    if (!isObj(it)) continue;
    const pts = isObj(it.geometry) ? geometryPositions(it.geometry) : [{ lon: num(it.lon), lat: num(it.lat) }];
    const b = boxOfPoints(pts);
    if (b) boxes.push(b);
  }
  return unionBoxes(boxes);
}

/** Only "collected" dates: legacy { start, end, type: "collected" } and RDM { date: "a/b", type: { id: "collected" } }. Publication, creation, issued, valid ... never. */
function extentOfDates(dates: unknown): MetadataRecord['temporalExtent'] {
  if (!Array.isArray(dates)) return undefined;
  const found = dates.filter(isObj).filter((d) => {
    const t = isObj(d.type) ? str(d.type.id) ?? localised(d.type.title) : str(d.type);
    return COVERAGE_DATE_TYPES.test(t ?? '');
  });
  return unionExtents(found.map((d) => extentOfDate({ date: str(d.date), start: str(d.start), end: str(d.end) })));
}

export function parseZenodoRecord(json: unknown, label: string): MetadataRecord {
  const rec: MetadataRecord = {
    source: 'zenodo',
    label,
    licences: [],
    restrictionCodes: [],
    distributionLinks: [],
    files: [],
  };
  if (!isObj(json)) return rec;
  const md = isObj(json.metadata) ? json.metadata : {};
  const id = str(json.id) ?? str(json.recid);
  const links = isObj(json.links) ? json.links : {};

  rec.title = str(md.title) ?? str(json.title);
  const desc = str(md.description);
  if (desc) rec.abstract = stripTags(desc) || undefined;
  rec.version = str(md.version);
  const creators = (Array.isArray(md.creators) ? md.creators : [])
    .filter(isObj)
    .map((c) => str(c.name) ?? (isObj(c.person_or_org) ? str(c.person_or_org.name) : undefined))
    .filter((n): n is string => !!n);
  if (creators.length > 0) rec.creators = creators;
  const orgs = (Array.isArray(md.creators) ? md.creators : []).filter(isObj).filter((c) => isObj(c.person_or_org) && /^organi[sz]ation/i.test(str(c.person_or_org.type) ?? '')).map((c) => str((c.person_or_org as Record<string, unknown>).name)).filter((n): n is string => !!n);
  if (orgs.length > 0) rec.organisations = orgs;
  // contact persons: the legacy list { name, type: "ContactPerson" } and the InvenioRDM { person_or_org: { name }, role: { id: "contactperson" } }
  const contactsZ = (Array.isArray(md.contributors) ? md.contributors : [])
    .filter(isObj)
    .filter((c) => /^contactperson$/i.test(isObj(c.role) ? (str(c.role.id) ?? '') : (str(c.type) ?? '')))
    .map((c) => ({ name: str(c.name) ?? (isObj(c.person_or_org) ? str(c.person_or_org.name) : undefined), org: isObj(c.person_or_org) && /^organi[sz]ation/i.test(str(c.person_or_org.type) ?? '') }))
    .filter((c): c is { name: string; org: boolean } => !!c.name);
  if (contactsZ.length > 0) rec.contacts = contactsZ.map((c) => ({ name: c.name, ...(c.org ? { organisation: true as const } : {}) }));
  const year = /^\s*(\d{4})/.exec(str(md.publication_date) ?? '');
  if (year) rec.publicationYear = Number(year[1]);
  const publisher = str(md.publisher);
  if (publisher) rec.publisher = publisher;
  const pids = isObj(json.pids) && isObj(json.pids.doi) ? json.pids.doi : {};
  rec.doi = str(json.doi) ?? str(md.doi) ?? str(pids.identifier);
  rec.landingUrl = str(links.self_html) ?? (id ? `https://zenodo.org/records/${id}` : undefined);

  const concept = str(json.conceptrecid) ?? str(md.conceptrecid);
  if (concept) rec.conceptId = concept;

  const rt = md.resource_type;
  if (isObj(rt)) rec.resourceType = str(rt.id) ?? str(rt.type);

  if (isObj(md.license)) {
    const l = licence('license.id', str(md.license.id), str(md.license.link), localised(md.license.title));
    if (l) rec.licences.push(l);
  }
  (Array.isArray(md.rights) ? md.rights : []).forEach((r, i) => {
    if (!isObj(r)) return;
    const l = licence(`rights[${i}]`, str(r.id), str(r.link), localised(r.title));
    if (l) rec.licences.push(l);
  });

  const bbox = bboxOfLocations(md.locations);
  if (bbox) rec.bbox = bbox;
  const temporal = extentOfDates(md.dates);
  if (temporal) rec.temporalExtent = temporal;

  const raw = json.files;
  const entries: Obj[] = Array.isArray(raw)
    ? raw.filter(isObj)
    : isObj(raw) && isObj(raw.entries)
      ? Object.entries(raw.entries).flatMap(([k, v]) => (isObj(v) ? [{ key: k, ...v }] : []))
      : [];
  for (const e of entries) {
    const key = str(e.key) ?? str(e.filename);
    if (!key) continue;
    const f: NonNullable<MetadataRecord['files']>[number] = {
      key,
      url: id ? zenodoFileUrl(id, key) : str(isObj(e.links) ? (e.links.content ?? e.links.self) : undefined) ?? '',
    };
    const sz = size(e.size);
    if (sz !== undefined) f.size = sz;
    const mt = str(e.mimetype);
    if (mt) f.mimetype = mt;
    rec.files!.push(f);
  }
  return rec;
}

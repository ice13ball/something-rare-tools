// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Zenodo record parser: legacy (files[] with key/links.self) and InvenioRDM (files.entries keyed by filename).
import type { LicenceStatement, MetadataRecord } from '../types';
import { toSpdx } from './licence';
import { stripTags } from './xml';

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
  if (!id && !uri && !title) return undefined;
  const s: LicenceStatement = { source: 'zenodo', field };
  const t = id ?? title;
  if (t) s.text = t;
  if (uri) s.uri = uri;
  const spdx = toSpdx(id, uri) ?? toSpdx(title);
  if (spdx) s.spdx = spdx;
  return s;
}

function localised(v: unknown): string | undefined {
  if (isObj(v)) return str(v.en) ?? str(Object.values(v)[0]);
  return str(v);
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
  const pids = isObj(json.pids) && isObj(json.pids.doi) ? json.pids.doi : {};
  rec.doi = str(json.doi) ?? str(md.doi) ?? str(pids.identifier);
  rec.landingUrl = str(links.self_html) ?? (id ? `https://zenodo.org/records/${id}` : undefined);

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

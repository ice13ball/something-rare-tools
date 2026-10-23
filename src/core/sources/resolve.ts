// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Turns whatever the user pasted into a typed record reference. Pure string work, no network.
/** A GBIF dataset: by its DOI (10.15468/…) or by its registry key (the UUID of gbif.org/dataset/{key}). */
export type GbifRef = { doi: string } | { key: string };

export type ResolvedInput =
  | { kind: 'zenodo'; id: string }
  | { kind: 'geonetwork'; host: string; uuid: string }
  | { kind: 'doi'; doi: string }
  | { kind: 'pangaea'; id: string }
  | { kind: 'gbif'; ref: GbifRef }
  | { kind: 'obis'; uuid: string }
  | { kind: 'unknown' };

export const DEFAULT_GEONETWORK_HOST = 'geonetwork.iopan.pl';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ONLY = new RegExp(`^${UUID}$`, 'i');
const UUID_IN = new RegExp(UUID, 'i');
const DOI_ONLY = /^10\.\d{4,9}\/\S+$/;
const GBIF_DOI = /^10\.15468\//i;
const PANGAEA_PATH = /^\/10\.1594\/PANGAEA\.(\d+)\/?$/i;

/** Quotes, angle brackets, brackets and sentence punctuation around a pasted value. */
function clean(text: string): string {
  let s = text.trim().replace(/^[<("'\[]+/, '');
  for (;;) {
    const before = s;
    s = s.replace(/[.,;:!?>"']+$/, '');
    if (s.endsWith(')') && !s.includes('(')) s = s.slice(0, -1);
    if (s.endsWith(']') && !s.includes('[')) s = s.slice(0, -1);
    s = s.trim();
    if (s === before) return s;
  }
}

function asDoi(s: string): string | undefined {
  const t = s.replace(/^doi:\s*/i, '').trim();
  return DOI_ONLY.test(t) ? t : undefined;
}

/** A DOI: the GBIF prefix goes to the GBIF registry directly, every other one through DataCite. */
function doiInput(doi: string): ResolvedInput {
  return GBIF_DOI.test(doi) ? { kind: 'gbif', ref: { doi } } : { kind: 'doi', doi };
}

export function resolveInput(text: string): ResolvedInput {
  const s = clean(text);
  if (s === '') return { kind: 'unknown' };
  if (/^\d+$/.test(s)) return { kind: 'zenodo', id: s };
  if (UUID_ONLY.test(s)) return { kind: 'geonetwork', host: DEFAULT_GEONETWORK_HOST, uuid: s.toLowerCase() };
  const bare = asDoi(s);
  if (bare) return doiInput(bare);

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { kind: 'unknown' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { kind: 'unknown' };
  const host = u.hostname.toLowerCase();
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // malformed escape: match on the raw path
  }

  if (host === 'doi.org' || host === 'dx.doi.org' || host === 'www.doi.org') {
    const doi = asDoi(path.replace(/^\//, ''));
    return doi ? doiInput(doi) : { kind: 'unknown' };
  }
  if (host === 'zenodo.org' || host === 'www.zenodo.org') {
    const rec = /^\/(?:api\/)?records?\/(\d+)(?:\/|$)/.exec(path);
    if (rec) return { kind: 'zenodo', id: rec[1]! };
    const doi = /^\/doi\/(.+?)\/?$/.exec(path);
    const d = doi ? asDoi(doi[1]!) : undefined;
    return d ? { kind: 'doi', doi: d } : { kind: 'unknown' };
  }
  if (host === 'gbif.org' || host === 'www.gbif.org') {
    const m = new RegExp(`^/(?:[a-z]{2}/)?dataset/(${UUID})(?:/|$)`, 'i').exec(path);
    return m ? { kind: 'gbif', ref: { key: m[1]!.toLowerCase() } } : { kind: 'unknown' };
  }
  if (host === 'obis.org' || host === 'www.obis.org') {
    const m = new RegExp(`^/dataset/(${UUID})(?:/|$)`, 'i').exec(path);
    return m ? { kind: 'obis', uuid: m[1]!.toLowerCase() } : { kind: 'unknown' };
  }
  if (host === 'doi.pangaea.de') {
    const m = PANGAEA_PATH.exec(path);
    return m ? { kind: 'pangaea', id: m[1]! } : { kind: 'unknown' };
  }
  // GeoNetwork: a UUID in the path or in the hash route of a catalogue URL.
  if (/(^|\/)geonetwork(\/|$)|\/srv\//i.test(path)) {
    const m = UUID_IN.exec(path) ?? UUID_IN.exec(u.hash);
    if (m) return { kind: 'geonetwork', host, uuid: m[0].toLowerCase() };
  }
  return { kind: 'unknown' };
}

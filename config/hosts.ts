// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { DATAVERSE_HOSTS } from './dataverse.js';
import { IPT_HOSTS, REGISTRY_HOSTS } from './ipt.js';

/**
 * One host allowlist for both download modes: the CSP connect-src (browser mode)
 * and the fetch proxy (server mode). Exact host names only, never wildcards.
 */
export const DATA_HOSTS: readonly string[] = [
  'opendap.iopan.pl',
  'geo.iopan.pl',
  'geonetwork.iopan.pl',
  'zenodo.org',
  'doi.pangaea.de',
  'api.datacite.org',
  // doi.org and data.crosscite.org are NOT here (24.10.2026): no code fetches them. A pasted doi.org link is turned into a DOI and looked up at
  // api.datacite.org; a doi.org distribution link of a record is never downloaded (sources/geonetwork.ts dataLink).
  // Dataverse installations read through their API (config/dataverse.ts)
  ...DATAVERSE_HOSTS,
  // GBIF and OBIS registries, then the static list of servers their archives may come from (config/ipt.ts)
  ...REGISTRY_HOSTS,
  ...IPT_HOSTS,
];

export const GA_HOSTS: readonly string[] = [
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
  'analytics.google.com',
  'region1.analytics.google.com',
  'stats.g.doubleclick.net',
];

export const MAP_HOSTS: readonly string[] = [
  'basemaps.cartocdn.com', // style.json
  'tiles.basemaps.cartocdn.com', // tiles.json, glyphs, sprite
  'tiles-a.basemaps.cartocdn.com', // vector tiles
  'tiles-b.basemaps.cartocdn.com',
  'tiles-c.basemaps.cartocdn.com',
  'tiles-d.basemaps.cartocdn.com',
];

/** CARTO's privacy notice, linked from the privacy page next to the map preview. */
export const MAP_PRIVACY_URL = 'https://carto.com/privacy/';

/** https only, exact (case-insensitive) host match, no credentials in the URL. */
export function isAllowedHost(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username !== '' || u.password !== '') return false;
  return DATA_HOSTS.includes(u.hostname.toLowerCase());
}

const https = (hosts: readonly string[]): string => hosts.map((h) => 'https://' + h).join(' ');

/**
 * The Content-Security-Policy. `extraConnect` (host names, no scheme) are added to connect-src for ONE page only: a default call
 * returns today's policy byte for byte. Never put such a host into DATA_HOSTS, which also feeds the fetch proxy.
 */
export function buildCsp(extraConnect: readonly string[] = []): string {
  const extra = extraConnect.length > 0 ? ' ' + https(extraConnect) : '';
  return [
    "default-src 'self'",
    `connect-src 'self' ${https(DATA_HOSTS)} ${https(GA_HOSTS)} ${https(MAP_HOSTS)}${extra}`,
    "worker-src 'self' blob:",
    `img-src 'self' data: blob: ${https(MAP_HOSTS)} ${https(GA_HOSTS)}`,
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

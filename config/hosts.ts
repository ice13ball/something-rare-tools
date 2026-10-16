// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
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
  'data.crosscite.org',
  'doi.org',
];

export const GA_HOSTS: readonly string[] = [
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
  'analytics.google.com',
  'stats.g.doubleclick.net',
];

export const MAP_HOSTS: readonly string[] = [
  'basemaps.cartocdn.com',
  'tiles.basemaps.cartocdn.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
];

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

export function buildCsp(): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${https(DATA_HOSTS)} ${https(GA_HOSTS)} ${https(MAP_HOSTS)}`,
    "worker-src 'self' blob:",
    `img-src 'self' data: blob: ${https(MAP_HOSTS)} ${https(GA_HOSTS)}`,
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/**
 * The only servers a GBIF or OBIS dataset archive (Darwin Core Archive, .zip) may be downloaded from.
 * A STATIC list (decision of 23.10.2026): the archive URL comes from a registry (api.gbif.org, api.obis.org), but its
 * host is never taken from there on trust, so /api/fetch does not become an open relay. A host that is not here yet
 * gets a finding that names it; adding one is a deliberate change of this file (and a new privacy-page line, which
 * is rendered from this list).
 *
 * Verified LIVE on 23.10.2026: a GET over https of a real archive.do (or static .zip) of each host below answered
 * 200 with a zip ("PK\x03\x04"), from a normal client with the proxy's User-Agent. Chosen from the 20 largest hosts of
 * the OBIS registry (api.obis.org/v3/dataset, 7000 datasets): the 17 below hold 6258 of them (89.4 %).
 * Dropped, and why:
 *   www.dassh.ac.uk        (217 datasets) the IPT answers, but every archive.do and resource page of the registry is HTTP 404
 *   www.godac.jamstec.go.jp (98)          no connection within 25 s over https, from here
 *   gp.sea.gov.ua          (7)            plain http on port 8082, no TLS (a non-default port is never allowed)
 * CORS (checked with an Origin header): only ipt.biodiversity.aq sends Access-Control-Allow-Origin (*); the other 16 do
 * not, so in browser mode the download fails and the page offers server mode (IN-FETCH-BLOCKED). All 17 are still in
 * the CSP connect-src, which is what lets the one with CORS work in browser mode.
 * Registries still give some of these as http:// (ipt.obis.org 273, ipt.env.duke.edu 7 of its datasets): they are
 * upgraded to https:// (all listed hosts answer there).
 */
export const IPT_HOSTS: readonly string[] = [
  'ipt.vliz.be',
  'www.marine.csiro.au',
  'hosted-datasets.gbif.org',
  'ipt-obis.gbif.us',
  'ipt.iobis.org',
  'ipt.env.duke.edu',
  'ipt.obis.org',
  'members.oceantrack.org',
  'ipt.inbo.be',
  'nzobisipt.niwa.co.nz',
  'ipt.biodiversity.aq',
  'ipt.sibbr.gov.br',
  'ipt.biodiversidad.co',
  'ipt.medobis.eu',
  'geo.abds.is',
  'data.aad.gov.au',
  'datasets.obis.org',
];

/** The registries the archive URL is looked up in. */
export const REGISTRY_HOSTS: readonly string[] = ['api.gbif.org', 'api.obis.org'];

/** Largest archive the proxy passes on: the DwC-A reader's own cap (ZIP_LIMITS.maxArchiveBytes), 100 MB. */
export const IPT_MAX_BYTES = 100 * 1024 * 1024;
/**
 * How long the proxy waits for a whole archive (headers and body). IPTs are slow: the biggest archive of the OBIS
 * registry is 100 MB and a human saw one IPT stall twice, so 20 s (the limit for a JSON API) is far too short. 90 s is
 * about 9 Mbit/s for a full 100 MB archive and still ends in a clear timeout message.
 */
export const IPT_TIMEOUT_MS = 90_000;

/** Exact host match, case-insensitive. */
export function isIptHost(host: string): boolean {
  return IPT_HOSTS.includes(host.toLowerCase());
}

/**
 * A Darwin Core Archive download: https, a host of the static IPT list, no port, and a path ending in `/archive.do` (any query).
 * That is the only shape the archive limits (100 MB, 90 s) and the daily archive budget apply to: another page of an IPT, or a
 * static .zip, is not an IPT export and keeps the ordinary limits.
 */
export function isArchiveUrl(raw: string | URL): boolean {
  let u: URL;
  try {
    u = typeof raw === 'string' ? new URL(raw) : raw;
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.port === '' && isIptHost(u.hostname) && /\/archive\.do$/i.test(u.pathname);
}
/**
 * The https URL an archive may be fetched from, or undefined when its host is not on the list (or it carries
 * credentials or a port). http:// on a listed host on the default port is upgraded to https://.
 */
export function iptArchiveUrl(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
  if (u.username !== '' || u.password !== '') return undefined;
  if (!isIptHost(u.hostname)) return undefined;
  if (u.port !== '') return undefined; // the proxy connects to the default port only; WHATWG URL drops an explicit default one
  u.protocol = 'https:';
  return u.href;
}

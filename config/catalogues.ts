// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/**
 * CSW catalogues the collection review may read (server mode: POST /api/csw). The list is closed: the server builds every request
 * from an entry here plus three numbers, so no address, header or XML of the visitor's ever reaches a catalogue. Addresses only.
 * Every endpoint was checked with GetCapabilities on 22.10.2026; the Institute of Oceanology's GeoNetwork (geonetwork.iopan.pl)
 * answered "500 / Site Maintenance" that day and is not listed until its CSW address can be verified.
 */
export type CswSchema = 'iso19139' | 'iso19115-3';

export interface Catalogue {
  /** Stable id the page sends (never part of a URL). */
  id: string;
  /** Shown to the visitor: the catalogue's address, nothing else. */
  label: string;
  host: string;
  cswUrl: string;
  /** How the server asks for records. Every catalogue below answers both; the choice exercises both paths. */
  method: 'GET' | 'POST';
  schemas: readonly CswSchema[];
}

export const CATALOGUES: readonly Catalogue[] = [
  {
    id: 'emodnet',
    label: 'emodnet.ec.europa.eu/geonetwork',
    host: 'emodnet.ec.europa.eu',
    cswUrl: 'https://emodnet.ec.europa.eu/geonetwork/srv/eng/csw',
    method: 'GET',
    schemas: ['iso19139', 'iso19115-3'],
  },
  {
    id: 'marine-ie',
    label: 'data.marine.ie/geonetwork',
    host: 'data.marine.ie',
    cswUrl: 'https://data.marine.ie/geonetwork/srv/eng/csw',
    method: 'POST',
    schemas: ['iso19139', 'iso19115-3'],
  },
];

/** Hosts of the catalogue list: what /api/csw may contact (separate from DATA_HOSTS, which govern /api/fetch and the CSP). */
export const CSW_HOSTS: readonly string[] = CATALOGUES.map((c) => c.host);

export function catalogueById(id: string): Catalogue | undefined {
  return CATALOGUES.find((c) => c.id === id);
}

/** https only, exact host of a listed catalogue, no credentials. */
export function isCatalogueUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.username === '' && u.password === '' && CSW_HOSTS.includes(u.hostname.toLowerCase());
}

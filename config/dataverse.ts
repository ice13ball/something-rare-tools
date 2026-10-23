// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/**
 * Dataverse installations the tool reads datasets from, by their native API (no registry, no search): a STATIC list, like
 * config/ipt.ts. The host of a record is never taken from a DOI registry on trust, so /api/fetch does not become an open relay;
 * a Dataverse host that is not here is reported by name (IN-HOST-NOT-ALLOWED) and the user can download and drop the files.
 *
 * Verified LIVE on 23.10.2026, from a normal client with Origin: https://tools.something-rare.com and the proxy's User-Agent
 * (GET only, https, no redirect on any of the three calls below):
 *   repod.icm.edu.pl (RepOD, ICM University of Warsaw; Dataverse 4/5 on GlassFish)
 *     GET /api/datasets/:persistentId/versions/:latest-published?persistentId=doi:...  200, Access-Control-Allow-Origin: *
 *       (the version document carries the metadata blocks AND the file list: one request for both)
 *     GET /api/access/datafile/{id}                    200, Access-Control-Allow-Origin: *   (the converted .tab of an ingested table)
 *     GET /api/access/datafile/{id}?format=original    200, Access-Control-Allow-Origin: *   (what the author uploaded: xlsx, csv)
 *     The persistent id is CASE-SENSITIVE (doi:10.18150/C45FCC is found, doi:10.18150/c45fcc is a 404), and some ids are lower case
 *     (10.18150/repod.0451825): the id is taken exactly from the DataCite landing page or from the pasted link.
 *   danebadawcze.uw.edu.pl (Dane Badawcze UW, University of Warsaw): the same three calls, 200, Access-Control-Allow-Origin: *.
 *   NOT listed: dataverse.no (DataverseNO). Metadata and file list answer with CORS, but every download is a 303 to a presigned URL
 *     on a separate storage host (uit-dataverseno-prod01.s3-oslo.educloud.no, which does send CORS). Reading it would need that second
 *     host on the allowlist: a decision for the owner, not a side effect of this list.
 *   NOT listed: rds.icm.edu.pl (Repozytorium Danych Spolecznych, DOI prefix 10.60894): its datasets are also served by repod.icm.edu.pl,
 *     where their files answer 404 ("harvested file that cannot be accessed in this Dataverse"); not tested further.
 * Restricted files answer 404 for an anonymous client on RepOD (the file list says `restricted: true` first); 401 and 403 are treated the same.
 */
export interface DataverseInstallation {
  host: string;
  /** Shown to the visitor and used as the publisher of the record. */
  name: string;
}

export const DATAVERSE_INSTALLATIONS: readonly DataverseInstallation[] = [
  { host: 'repod.icm.edu.pl', name: 'RepOD' },
  { host: 'danebadawcze.uw.edu.pl', name: 'Dane Badawcze UW' },
];

export const DATAVERSE_HOSTS: readonly string[] = DATAVERSE_INSTALLATIONS.map((i) => i.host);

export function dataverseName(host: string): string | undefined {
  const h = host.toLowerCase();
  return DATAVERSE_INSTALLATIONS.find((i) => i.host === h)?.name;
}

export const isDataverseHost = (host: string): boolean => dataverseName(host) !== undefined;

/**
 * The largest file read from a link, in bytes. The same figure as the fetch proxy's per-download limit (server/fetchProxy.ts MAX_BYTES,
 * checked by a test): a file known to be larger is reported (IN-FILE-TOO-LARGE) before anything is downloaded, in both modes.
 */
export const LINKED_FILE_MAX_BYTES = 30 * 1024 * 1024;

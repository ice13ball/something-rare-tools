// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// HAND-WRITTEN fixtures in the shape of the WoRMS REST service, GET AphiaRecordsByMatchNames, with the values reduced to what src/core/convert/worms.ts reads
// (AphiaID, scientificname, status, unacceptreason, rank, valid_AphiaID, valid_name, isMarine, isBrackish, isFreshwater, isTerrestrial, match_type). No
// authority, citation, URL, LSID, date or other descriptive content of WoRMS is kept: the taxon names and their AphiaIDs are identifiers, and the shape and the
// cases (exact, near_1, phonetic, unaccepted, two records for one name, an empty array, HTTP 204) were checked against the real service on 2026-10-25;
// test/convert/worms.live.test.ts (WORMS_LIVE=1) is the check against it. The default suite makes no network call: `fetch` is replaced by the mock below, which
// answers the way the real API does: an array with one array per name sent, in order; an empty array for a name with no match; HTTP 204 with an empty body when
// nothing in the batch matches; HTTP 400 for more than 50 names.
import { vi } from 'vitest';

/** The records of each name that is looked up (an empty list for a name without a match), as WoRMS sends them, reduced. */
export const RECORDED: Record<string, unknown[]> = {
  "Calanus finmarchicus": [
    {"AphiaID": 104464, "scientificname": "Calanus finmarchicus", "status": "accepted", "unacceptreason": null, "rank": "Species", "valid_AphiaID": 104464, "valid_name": "Calanus finmarchicus", "isMarine": 1, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 0, "match_type": "exact"},
  ],
  "Calanus finmarchicu": [
    {"AphiaID": 104464, "scientificname": "Calanus finmarchicus", "status": "accepted", "unacceptreason": null, "rank": "Species", "valid_AphiaID": 104464, "valid_name": "Calanus finmarchicus", "isMarine": 1, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 0, "match_type": "near_1"},
  ],
  "Sagitta elegans": [
    {"AphiaID": 105450, "scientificname": "Sagitta elegans", "status": "unaccepted", "unacceptreason": "Synonym", "rank": "Species", "valid_AphiaID": 105440, "valid_name": "Parasagitta elegans", "isMarine": 1, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 0, "match_type": "exact"},
  ],
  "Xyzzyqq nonsensus": [
  ],
  "Oithona": [
    {"AphiaID": 106485, "scientificname": "Oithona", "status": "accepted", "unacceptreason": null, "rank": "Genus", "valid_AphiaID": 106485, "valid_name": "Oithona", "isMarine": 1, "isBrackish": 1, "isFreshwater": 1, "isTerrestrial": 0, "match_type": "exact"},
    {"AphiaID": 534090, "scientificname": "Oithona", "status": "unaccepted", "unacceptreason": "Invalid", "rank": "Genus", "valid_AphiaID": 138007, "valid_name": "Fiona", "isMarine": null, "isBrackish": null, "isFreshwater": null, "isTerrestrial": null, "match_type": "exact"},
  ],
  "Pseudocalanus": [
    {"AphiaID": 104165, "scientificname": "Pseudocalanus", "status": "accepted", "unacceptreason": null, "rank": "Genus", "valid_AphiaID": 104165, "valid_name": "Pseudocalanus", "isMarine": 1, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 0, "match_type": "exact"},
  ],
  "Calanus glacialis xx": [
  ],
  "Oithona similus": [
    {"AphiaID": 106656, "scientificname": "Oithona similis", "status": "accepted", "unacceptreason": null, "rank": "Species", "valid_AphiaID": 106656, "valid_name": "Oithona similis", "isMarine": 1, "isBrackish": 1, "isFreshwater": 1, "isTerrestrial": 0, "match_type": "phonetic"},
  ],
  "Daphnia magna": [
    {"AphiaID": 148372, "scientificname": "Daphnia magna", "status": "accepted", "unacceptreason": null, "rank": "Species", "valid_AphiaID": 148372, "valid_name": "Daphnia magna", "isMarine": 0, "isBrackish": 1, "isFreshwater": 1, "isTerrestrial": 0, "match_type": "exact"},
  ],
  "Homo sapiens": [
    {"AphiaID": 1455977, "scientificname": "Homo sapiens", "status": "accepted", "unacceptreason": null, "rank": "Species", "valid_AphiaID": 1455977, "valid_name": "Homo sapiens", "isMarine": 0, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 1, "match_type": "exact"},
  ],
  "Aurelia": [
    {"AphiaID": 135263, "scientificname": "Aurelia", "status": "accepted", "unacceptreason": null, "rank": "Genus", "valid_AphiaID": 135263, "valid_name": "Aurelia", "isMarine": 1, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 0, "match_type": "exact"},
    {"AphiaID": 1077913, "scientificname": "Aurelia", "status": "unaccepted", "unacceptreason": null, "rank": "Genus", "valid_AphiaID": 1076067, "valid_name": "Grindelia", "isMarine": 0, "isBrackish": 0, "isFreshwater": 0, "isTerrestrial": 1, "match_type": "exact"},
  ],
};

export interface WormsCall {
  url: string;
  /** The names in the request, decoded. */
  names: string[];
  init: RequestInit | undefined;
}

export interface WormsMockOptions {
  /** Extra answers by name (records as WoRMS sends them), added to the reduced ones above. */
  extra?: Record<string, unknown[]>;
  /** Rejects the call with this error (a network or CORS failure) from the Nth call on (1-based). */
  failFrom?: number;
  failWith?: Error;
  /** Answers this HTTP status (no body) from the Nth call on. */
  statusFrom?: number;
  status?: number;
  /** Answers a body that is not an array of arrays. */
  malformed?: boolean;
  /** Called with each call before it answers; may return a promise (to hold a call open for an abort test). */
  onCall?: (call: WormsCall, n: number) => Promise<void> | void;
}

/** A fetch replacement and the calls it saw. Install it with vi.stubGlobal('fetch', mock.fetch). */
export function wormsMock(opts: WormsMockOptions = {}) {
  const calls: WormsCall[] = [];
  const answers: Record<string, unknown[]> = { ...RECORDED, ...(opts.extra ?? {}) };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const u = new URL(url);
    const names = u.search
      .slice(1)
      .split('&')
      .filter((p) => p.startsWith('scientificnames[]='))
      .map((p) => decodeURIComponent(p.slice('scientificnames[]='.length)));
    const call: WormsCall = { url, names, init };
    calls.push(call);
    const n = calls.length;
    if (opts.onCall) await opts.onCall(call, n);
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (opts.failFrom !== undefined && n >= opts.failFrom) throw opts.failWith ?? new TypeError('Failed to fetch');
    if (opts.statusFrom !== undefined && n >= opts.statusFrom) return new Response('error', { status: opts.status ?? 500 });
    if (names.length > 50) return new Response(JSON.stringify('scientificnames must not exceed 50 element(s).'), { status: 400 });
    if (opts.malformed) return new Response(JSON.stringify({ not: 'an array' }), { status: 200 });
    const body = names.map((name) => (Object.prototype.hasOwnProperty.call(answers, name) ? answers[name] : []));
    if (body.every((b) => b.length === 0)) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { fetch: fetchImpl, calls };
}

/** A made-up record in the same reduced shape, for the cases the fixtures above do not cover (an invented name, so no real record is copied). */
export function wormsRecord(over: Record<string, unknown>): Record<string, unknown> {
  return {
    AphiaID: 900001,
    scientificname: 'Invented example',
    status: 'accepted',
    unacceptreason: null,
    rank: 'Species',
    valid_AphiaID: 900001,
    valid_name: 'Invented example',
    isMarine: 1,
    isBrackish: 0,
    isFreshwater: 0,
    isTerrestrial: 0,
    match_type: 'exact',
    ...over,
  };
}

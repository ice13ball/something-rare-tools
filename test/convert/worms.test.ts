// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The WoRMS opt-in, stage 4: the pure core (what an answer means, batches, entries), the one network module with a mocked fetch (exact URLs, order, progress,
// abort, failures) and the conversion with the entries (which LSID, what is never replaced, what blocks, what is only warned). Answers are the recorded ones
// (hand-written, reduced fixtures: test/helpers/wormsFixtures.ts); no network call is made.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { classifyMatches, entryOf, isNotMarine, lookupOf, readWormsAnswer, readWormsRecord, wormsBatches, wormsLsid, WORMS_BATCH_MAX } from '../../src/core/convert/worms';
import type { WormsRecord } from '../../src/core/convert/worms';
import { judge } from '../../src/core/convert/policy';
import { lookupWormsNames, wormsRequestUrl, WORMS_ENDPOINT } from '../../src/app/optins/worms';
import { RECORDED, wormsMock, wormsRecord } from '../helpers/wormsFixtures';
import { exportSheet } from './exportHelpers';
import { W1_HEADER, W1_QUANTITY, W1_ROWS, fileOf, sheetInput } from './helpers';

const rec = (name: string): WormsRecord[] => (RECORDED[name] as unknown[]).map((r) => readWormsRecord(r) as WormsRecord);
const one = (over: Record<string, unknown>): WormsRecord => readWormsRecord(wormsRecord(over)) as WormsRecord;

afterEach(() => vi.unstubAllGlobals());

describe('what an answer means', () => {
  it('batches are at most 50 names, in order, and 51 names make 50 + 1', () => {
    expect(WORMS_BATCH_MAX).toBe(50);
    const names = Array.from({ length: 121 }, (_, i) => `n${i}`);
    const b = wormsBatches(names);
    expect(b.map((x) => x.length)).toEqual([50, 50, 21]);
    expect(b.flat()).toEqual(names);
    expect(wormsBatches(names.slice(0, 51)).map((x) => x.length)).toEqual([50, 1]);
    expect(wormsBatches([])).toEqual([]);
  });

  it('the LSID is urn:lsid:marinespecies.org:taxname:<AphiaID>', () => {
    expect(wormsLsid(104464)).toBe('urn:lsid:marinespecies.org:taxname:104464');
  });

  it('exactly one result whose match_type is exact is automatic (Calanus finmarchicus)', () => {
    const m = classifyMatches(rec('Calanus finmarchicus'));
    expect(m.kind).toBe('auto');
    expect(entryOf(rec('Calanus finmarchicus'))).toEqual({ state: 'id', aphiaId: 104464, notMarine: false });
  });

  it('a near match ("Calanus finmarchicu" is near_1) is never automatic: undecided until the user chooses', () => {
    const r = rec('Calanus finmarchicu');
    expect(r.length).toBe(1);
    expect(r[0].match_type).toBe('near_1');
    expect(classifyMatches(r)).toMatchObject({ kind: 'choose', why: 'not-exact' });
    expect(entryOf(r)).toEqual({ state: 'undecided' });
    expect(entryOf(r, 104464)).toEqual({ state: 'id', aphiaId: 104464, notMarine: false });
    expect(entryOf(r, 'none')).toEqual({ state: 'none', reason: 'user' });
    // a choice that was not offered is no choice
    expect(entryOf(r, 999)).toEqual({ state: 'undecided' });
  });

  it('a phonetic match is never automatic either', () => {
    const r = rec('Oithona similus');
    expect(r[0].match_type).toBe('phonetic');
    expect(entryOf(r)).toEqual({ state: 'undecided' });
  });

  it('several results (a homonym: Oithona has two exact results) are never automatic, even when each is exact', () => {
    const r = rec('Oithona');
    expect(r.length).toBe(2);
    expect(r.every((x) => x.match_type === 'exact')).toBe(true);
    expect(classifyMatches(r)).toMatchObject({ kind: 'choose', why: 'ambiguous' });
    expect(entryOf(r)).toEqual({ state: 'undecided' });
    expect(entryOf(r, 106485)).toMatchObject({ state: 'id', aphiaId: 106485 });
    expect(entryOf(rec('Aurelia'))).toEqual({ state: 'undecided' });
  });

  it('genus-only matches are never automatic', () => {
    expect(classifyMatches([one({ match_type: 'exact_genus' })])).toMatchObject({ kind: 'choose', why: 'genus-only' });
    expect(entryOf([one({ match_type: 'exact_subgenus' })])).toEqual({ state: 'undecided' });
  });

  it('a deleted or quarantined record, even as the single exact result, is not automatic', () => {
    expect(entryOf([one({ status: 'deleted' })])).toEqual({ state: 'undecided' });
    expect(entryOf([one({ status: 'quarantined' })])).toEqual({ state: 'undecided' });
  });

  it('an unaccepted name keeps its OWN AphiaID (OBIS resolves it to the accepted name): Sagitta elegans is 105450, not the valid 105440', () => {
    const r = rec('Sagitta elegans');
    expect(r[0].status).toBe('unaccepted');
    expect(r[0].valid_name).toBe('Parasagitta elegans');
    expect(r[0].valid_AphiaID).toBe(105440);
    expect(entryOf(r)).toEqual({ state: 'id', aphiaId: 105450, notMarine: false });
  });

  it('no match: an empty list, an automatic "none"; the user cannot be asked anything', () => {
    expect(rec('Xyzzyqq nonsensus')).toEqual([]);
    expect(classifyMatches([])).toEqual({ kind: 'none' });
    expect(entryOf([])).toEqual({ state: 'none', reason: 'no-match' });
  });

  it('only freshwater or terrestrial is "not marine"; brackish counts as brackish; no flag at all is unknown, not "not marine"', () => {
    expect(isNotMarine(rec('Homo sapiens')[0])).toBe(true);
    expect(isNotMarine(rec('Daphnia magna')[0])).toBe(false); // freshwater and brackish
    expect(isNotMarine(rec('Calanus finmarchicus')[0])).toBe(false);
    expect(isNotMarine(one({ isMarine: null, isBrackish: null, isFreshwater: null, isTerrestrial: null }))).toBe(false);
    expect(entryOf(rec('Homo sapiens'))).toEqual({ state: 'id', aphiaId: 1455977, notMarine: true });
  });

  it('an answer is read strictly: 204 is every name empty, the length must match, an AphiaID must be a positive whole number', () => {
    expect(readWormsAnswer(null, 3, true)).toEqual([[], [], []]);
    expect(readWormsAnswer([[], []], 3)).toBeUndefined();
    expect(readWormsAnswer({ a: 1 }, 1)).toBeUndefined();
    expect(readWormsAnswer([null], 1)).toEqual([[]]);
    for (const bad of ['104464; x', -1, 0, 1.5, null, 'x']) expect(readWormsAnswer([[wormsRecord({ AphiaID: bad })]], 1), String(bad)).toBeUndefined();
    expect(readWormsAnswer([[wormsRecord({ match_type: 3 })]], 1)).toBeUndefined();
    const ok = readWormsAnswer([[wormsRecord({})]], 1);
    expect(ok?.[0][0].AphiaID).toBe(900001);
    // only the fields this tool reads are kept
    expect(Object.keys(ok?.[0][0] ?? {}).sort()).toEqual(['AphiaID', 'authority', 'isBrackish', 'isFreshwater', 'isMarine', 'isTerrestrial', 'match_type', 'rank', 'scientificname', 'status', 'unacceptreason', 'url', 'valid_AphiaID', 'valid_name']);
  });

  it('lookupOf builds an entry per name that has a result, with the user\'s choices', () => {
    const l = lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Calanus finmarchicu': rec('Calanus finmarchicu'), Oithona: rec('Oithona') }, { Oithona: 'none' });
    expect(l['Calanus finmarchicus']).toMatchObject({ state: 'id' });
    expect(l['Calanus finmarchicu']).toEqual({ state: 'undecided' });
    expect(l.Oithona).toEqual({ state: 'none', reason: 'user' });
  });
});

describe('the network module, with a mocked fetch', () => {
  const NAMES = ['Calanus finmarchicus', 'Calanus finmarchicu', 'Sagitta elegans', 'Xyzzyqq nonsensus', 'Oithona', 'Pseudocalanus'];

  it('builds exactly GET <endpoint>?scientificnames[]=…&marine_only=false, names percent-encoded', () => {
    expect(WORMS_ENDPOINT).toBe('https://www.marinespecies.org/rest/AphiaRecordsByMatchNames');
    expect(wormsRequestUrl(['Calanus finmarchicus'])).toBe('https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=Calanus%20finmarchicus&marine_only=false');
    expect(wormsRequestUrl(['A b', 'C&d=e', 'Ö'])).toBe('https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=A%20b&scientificnames[]=C%26d%3De&scientificnames[]=%C3%96&marine_only=false');
  });

  it('one batch of names: one request, the names and nothing else in it, the options of a request without cookies, Referer or cache', async () => {
    const mock = wormsMock();
    vi.stubGlobal('fetch', mock.fetch);
    const run = await lookupWormsNames(NAMES, { signal: new AbortController().signal });
    expect(mock.calls.length).toBe(1);
    expect(mock.calls[0].url).toBe(`${WORMS_ENDPOINT}?${NAMES.map((n) => `scientificnames[]=${encodeURIComponent(n)}`).join('&')}&marine_only=false`);
    expect(mock.calls[0].init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' });
    expect(mock.calls[0].init?.body).toBeUndefined();
    expect(Object.keys(mock.calls[0].init ?? {}).includes('headers')).toBe(false);
    expect(run.aborted).toBe(false);
    expect(run.failure).toBeUndefined();
    expect(Object.keys(run.results)).toEqual(NAMES);
    expect(run.results['Sagitta elegans'][0].AphiaID).toBe(105450);
    expect(run.results['Xyzzyqq nonsensus']).toEqual([]);
  });

  it('121 names go in three requests of 50, 50 and 21 names, one after the other, with progress after each', async () => {
    const names = Array.from({ length: 121 }, (_, i) => `Invented name ${i}`);
    let running = 0;
    let maxRunning = 0;
    const mock = wormsMock({
      onCall: async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
      },
    });
    vi.stubGlobal('fetch', mock.fetch);
    const progress: [number, number][] = [];
    const run = await lookupWormsNames(names, { signal: new AbortController().signal, onProgress: (d, t) => progress.push([d, t]) });
    expect(mock.calls.map((c) => c.names.length)).toEqual([50, 50, 21]);
    expect(mock.calls.flatMap((c) => c.names)).toEqual(names);
    expect(maxRunning).toBe(1);
    expect(progress).toEqual([[50, 121], [100, 121], [121, 121]]);
    expect(Object.keys(run.results).length).toBe(121);
    // every one of them is "no match": the whole batch answers 204, which reads as an empty list per name
    expect(Object.values(run.results).every((r) => r.length === 0)).toBe(true);
  });

  it('what is sent is the names and nothing else: no URL carries anything but the endpoint, scientificnames[] and marine_only', async () => {
    const mock = wormsMock();
    vi.stubGlobal('fetch', mock.fetch);
    await lookupWormsNames(['Calanus finmarchicus', 'Oithona'], { signal: new AbortController().signal });
    const u = new URL(mock.calls[0].url);
    expect(u.origin + u.pathname).toBe(WORMS_ENDPOINT);
    expect([...u.searchParams.keys()].sort()).toEqual(['marine_only', 'scientificnames[]', 'scientificnames[]']);
    expect(u.hash).toBe('');
  });

  it('Abort really aborts: the signal reaches fetch, the later batches are never sent, and only the completed batch is kept', async () => {
    const names = Array.from({ length: 120 }, (_, i) => `Invented name ${i}`);
    const ac = new AbortController();
    let signalSeen: AbortSignal | undefined;
    const mock = wormsMock({
      extra: Object.fromEntries(names.map((n) => [n, [wormsRecord({ AphiaID: 900002 })]])),
      onCall: (call, n) => {
        signalSeen = call.init?.signal as AbortSignal;
        if (n === 2) ac.abort(); // the user presses Abort while the second call is in flight
      },
    });
    vi.stubGlobal('fetch', mock.fetch);
    const run = await lookupWormsNames(names, { signal: ac.signal });
    expect(signalSeen).toBe(ac.signal);
    expect(run.aborted).toBe(true);
    expect(run.failure).toBeUndefined();
    expect(mock.calls.length).toBe(2); // a third call was never made
    expect(Object.keys(run.results)).toEqual(names.slice(0, 50)); // only the batch that completed
  });

  it('an already aborted signal sends nothing', async () => {
    const mock = wormsMock();
    vi.stubGlobal('fetch', mock.fetch);
    const ac = new AbortController();
    ac.abort();
    const run = await lookupWormsNames(['Oithona'], { signal: ac.signal });
    expect(mock.calls.length).toBe(0);
    expect(run).toEqual({ results: {}, aborted: true });
  });

  it('a network or CORS failure (fetch rejects) is a network failure; completed batches stay, the failed one adds nothing', async () => {
    const names = Array.from({ length: 60 }, (_, i) => `Invented name ${i}`);
    vi.stubGlobal('fetch', wormsMock({ failFrom: 2 }).fetch);
    const run = await lookupWormsNames(names, { signal: new AbortController().signal });
    expect(run.failure).toEqual({ kind: 'network' });
    expect(run.aborted).toBe(false);
    expect(Object.keys(run.results)).toEqual(names.slice(0, 50));
  });

  it('HTTP 4xx and 5xx are http failures with the status, and add nothing', async () => {
    for (const status of [400, 404, 429, 500, 503]) {
      vi.stubGlobal('fetch', wormsMock({ statusFrom: 1, status }).fetch);
      const run = await lookupWormsNames(['Oithona'], { signal: new AbortController().signal });
      expect(run.failure, String(status)).toEqual({ kind: 'http', status });
      expect(run.results).toEqual({});
    }
  });

  it('an answer that is not the documented shape is a format failure, and a 200 that is not JSON too', async () => {
    vi.stubGlobal('fetch', wormsMock({ malformed: true }).fetch);
    expect((await lookupWormsNames(['Oithona'], { signal: new AbortController().signal })).failure).toEqual({ kind: 'format' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect((await lookupWormsNames(['Oithona'], { signal: new AbortController().signal })).failure).toEqual({ kind: 'format' });
  });

  it('the service answers 400 for 51 names (as recorded): the module never sends more than 50, so it does not happen', async () => {
    const mock = wormsMock();
    vi.stubGlobal('fetch', mock.fetch);
    const names = Array.from({ length: 51 }, (_, i) => `Invented name ${i}`);
    const run = await lookupWormsNames(names, { signal: new AbortController().signal });
    expect(run.failure).toBeUndefined();
    expect(Math.max(...mock.calls.map((c) => c.names.length))).toBe(50);
  });
});

describe('the conversion with the entries of a lookup', () => {
  const W1 = { quantity: W1_QUANTITY };
  const entries = () =>
    lookupOf(
      {
        'Calanus finmarchicus': rec('Calanus finmarchicus'),
        'Oithona similis': [one({ AphiaID: 106656, scientificname: 'Oithona similis' })],
        Pseudocalanus: rec('Pseudocalanus'),
      },
      {},
    );
  const run = (worms?: ReturnType<typeof entries>) => exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true, ...(worms ? { worms } : {}) });

  it('lists the names a lookup would send: the distinct scientificName values after the approved splits, nothing else', async () => {
    const r = await run();
    // "Pseudocalanus sp." was approved as "Pseudocalanus" + qualifier sp.: the name is without it
    expect(r.result.nameLookup.names).toEqual(['Calanus finmarchicus', 'Oithona similis', 'Pseudocalanus']);
    expect(r.result.nameLookup.withSheetId).toBe(0);
  });

  it('a split that is not approved yet is not final: its name is not listed', async () => {
    const r = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, approve: false });
    expect(r.result.nameLookup.names).toEqual(['Calanus finmarchicus', 'Oithona similis']);
  });

  it('no lookup: nothing is written and nothing is raised', async () => {
    const r = await run();
    expect(r.result.occurrences.every((o) => o.scientificNameId === undefined)).toBe(true);
    expect(r.findings.some((f) => f.ruleId.startsWith('CONV-WORMS'))).toBe(false);
  });

  it('with confirmed entries: every occurrence of the name gets urn:lsid:marinespecies.org:taxname:<AphiaID>; scientificName is never replaced; the names no longer count as missing', async () => {
    const before = await run();
    const r = await run(entries());
    const byName = (n: string) => r.result.occurrences.filter((o) => o.scientificName === n);
    expect(byName('Calanus finmarchicus').length).toBeGreaterThan(0);
    for (const o of byName('Calanus finmarchicus')) expect(o.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:104464');
    for (const o of byName('Oithona similis')) expect(o.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:106656');
    // the names and the verbatim texts are exactly what they were
    expect(r.result.occurrences.map((o) => [o.scientificName, o.verbatimIdentification, o.identificationQualifier])).toEqual(before.result.occurrences.map((o) => [o.scientificName, o.verbatimIdentification, o.identificationQualifier]));
    // Pseudocalanus came back with one exact genus record (104165): it is the single exact result, so it is automatic as well
    for (const o of byName('Pseudocalanus')) expect(o.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:104165');
    expect(r.findings.some((f) => f.ruleId === 'CONV-NAMEID-MISSING')).toBe(false);
    expect(before.findings.some((f) => f.ruleId === 'CONV-NAMEID-MISSING')).toBe(true);
    // the file carries them
    const occ = r.files.find((f) => f.name === 'occurrence.txt');
    expect(new TextDecoder().decode(occ?.data)).toContain('\turn:lsid:marinespecies.org:taxname:104464\t');
  });

  it('an unaccepted name is written with its own AphiaID, not the valid one', async () => {
    const worms = lookupOf({ 'Calanus finmarchicus': rec('Sagitta elegans') }, {});
    const r = await run(worms);
    for (const o of r.result.occurrences.filter((x) => x.scientificName === 'Calanus finmarchicus')) expect(o.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:105450');
  });

  it('an undecided name blocks the export (CONV-WORMS-UNDECIDED) and gets no ID; choosing clears it', async () => {
    const pending = lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicu') }, {});
    const r = await run(pending);
    const f = r.findings.find((x) => x.ruleId === 'CONV-WORMS-UNDECIDED');
    expect(f?.severity).toBe('error');
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).toContain('CONV-WORMS-UNDECIDED');
    expect(r.files).toEqual([]);
    for (const o of r.result.occurrences.filter((x) => x.scientificName === 'Calanus finmarchicus')) expect(o.scientificNameId).toBeUndefined();
    const chosen = await run(lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicu') }, { 'Calanus finmarchicus': 104464 }));
    expect(chosen.findings.some((x) => x.ruleId === 'CONV-WORMS-UNDECIDED')).toBe(false);
    const none = await run(lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicu') }, { 'Calanus finmarchicus': 'none' }));
    expect(none.findings.some((x) => x.ruleId === 'CONV-WORMS-UNDECIDED')).toBe(false);
  });

  it('no match: an empty ID and the accept warning CONV-WORMS-NO-MATCH; a user "no ID" is not that warning', async () => {
    const r = await run(lookupOf({ 'Calanus finmarchicus': [] }, {}));
    const f = r.findings.find((x) => x.ruleId === 'CONV-WORMS-NO-MATCH');
    expect(f?.severity).toBe('warning');
    expect(f?.params.names).toBe('Calanus finmarchicus');
    expect(judge(r.findings).acceptRules).toContain('CONV-WORMS-NO-MATCH');
    for (const o of r.result.occurrences.filter((x) => x.scientificName === 'Calanus finmarchicus')) expect(o.scientificNameId).toBeUndefined();
    const user = await run(lookupOf({ 'Calanus finmarchicus': rec('Oithona') }, { 'Calanus finmarchicus': 'none' }));
    expect(user.findings.some((x) => x.ruleId === 'CONV-WORMS-NO-MATCH')).toBe(false);
  });

  it('freshwater or terrestrial only: the ID is written and CONV-WORMS-NOT-MARINE is raised, to accept', async () => {
    const r = await run(lookupOf({ 'Calanus finmarchicus': rec('Homo sapiens') }, {}));
    expect(r.findings.find((x) => x.ruleId === 'CONV-WORMS-NOT-MARINE')?.severity).toBe('warning');
    expect(judge(r.findings).acceptRules).toContain('CONV-WORMS-NOT-MARINE');
    expect(r.result.occurrences.find((o) => o.scientificName === 'Calanus finmarchicus')?.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:1455977');
  });

  it('a name whose ID comes from the sheet is never listed and never overwritten', () => {
    const header = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'scientificName', 'AphiaID', 'Count'];
    const file = fileOf(header, [['S1', 'a', 55, 3, '2020-01-01', 'Calanus finmarchicus', 104464, 4], ['S1', 'b', 55, 3, '2020-01-01', 'Oithona similis', null, 2]], 'S');
    const sheet = sheetInput(file, { quantity: { kind: 'count' }, shape: 'long' });
    const worms = lookupOf({ 'Calanus finmarchicus': rec('Pseudocalanus'), 'Oithona similis': [one({ AphiaID: 106656 })] }, {});
    const r = convert({ sheets: [sheet], worms });
    expect(r.nameLookup).toEqual({ names: ['Oithona similis'], withSheetId: 1, applied: 1 });
    expect(r.occurrences.find((o) => o.scientificName === 'Calanus finmarchicus')?.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:104464');
    expect(r.occurrences.find((o) => o.scientificName === 'Oithona similis')?.scientificNameId).toBe('urn:lsid:marinespecies.org:taxname:106656');
  });

  it('a name like "constructor" or "__proto__" reads no prototype property', async () => {
    const file = fileOf(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'scientificName', 'Count'], [['S1', 'a', 55, 3, '2020-01-01', 'constructor', 4], ['S1', 'b', 55, 3, '2020-01-01', '__proto__', 2]], 'S');
    const r = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, shape: 'long' })], worms: lookupOf({ Other: rec('Oithona') }, {}) });
    expect(r.nameLookup.names).toEqual(['constructor', '__proto__']);
    expect(r.occurrences.every((o) => o.scientificNameId === undefined)).toBe(true);
    expect(r.findings.some((f) => f.ruleId.startsWith('CONV-WORMS'))).toBe(false);
  });
});

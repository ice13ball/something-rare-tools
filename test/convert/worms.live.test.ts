// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// OPTIONAL live check of the real WoRMS service, skipped unless WORMS_LIVE=1 (the default suite makes no network call):
//   WORMS_LIVE=1 npx vitest run test/convert/worms.live.test.ts
// It sends only taxon names, like the page does, and checks that the answers still have the shape the recorded fixtures have.
import { describe, expect, it } from 'vitest';
import { lookupWormsNames } from '../../src/app/optins/worms';
import { classifyMatches, entryOf } from '../../src/core/convert/worms';

describe.skipIf(process.env.WORMS_LIVE !== '1')('the live WoRMS service (WORMS_LIVE=1)', () => {
  it('answers the recorded cases the way the fixtures say: exact, near, unaccepted, homonym, nothing', async () => {
    const names = ['Calanus finmarchicus', 'Calanus finmarchicu', 'Sagitta elegans', 'Oithona', 'Xyzzyqq nonsensus'];
    const run = await lookupWormsNames(names, { signal: new AbortController().signal });
    expect(run.failure).toBeUndefined();
    expect(Object.keys(run.results)).toEqual(names);
    expect(entryOf(run.results['Calanus finmarchicus'])).toMatchObject({ state: 'id', aphiaId: 104464 });
    expect(classifyMatches(run.results['Calanus finmarchicu']).kind).toBe('choose');
    expect(run.results['Sagitta elegans'][0].status).toBe('unaccepted');
    expect(classifyMatches(run.results.Oithona)).toMatchObject({ kind: 'choose', why: 'ambiguous' });
    expect(run.results['Xyzzyqq nonsensus']).toEqual([]);
  }, 30_000);

  it('a batch of names that match nothing is HTTP 204 and reads as empty lists', async () => {
    const run = await lookupWormsNames(['Xyzzyqq nonsensus', 'Qwertyu asdfghj'], { signal: new AbortController().signal });
    expect(run.failure).toBeUndefined();
    expect(Object.values(run.results)).toEqual([[], []]);
  }, 30_000);
});

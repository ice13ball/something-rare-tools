// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 5, part A, from the stage 4 acceptance. A1: a result the USER CHOSE among non-exact ones writes the chosen record's own name into scientificName (the OBIS
// Manual: the LSID corresponds to the name in scientificName; verbatimIdentification keeps the sheet's spelling); exact matches keep the name as written; the
// occurrenceID never changes. A2: two names of one sample that resolve to the same taxon are one warning (CONV-TAXON-SAME-EVENT), judged after the lookup.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { judge, policyOf } from '../../src/core/convert/policy';
import { entryOf, isWritableName, lookupOf, readWormsRecord, writesOwnName } from '../../src/core/convert/worms';
import type { WormsLookup, WormsRecord } from '../../src/core/convert/worms';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { RECORDED } from '../helpers/wormsFixtures';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const rec = (name: string): WormsRecord[] => (RECORDED[name] as unknown[]).map((r) => readWormsRecord(r) as WormsRecord);
const record = (over: Record<string, unknown>): WormsRecord =>
  readWormsRecord({ AphiaID: 104464, scientificname: 'Calanus finmarchicus', status: 'accepted', rank: 'Species', valid_AphiaID: 104464, valid_name: 'Calanus finmarchicus', isMarine: 1, match_type: 'exact', ...over }) as WormsRecord;
const LSID = (id: number): string => `urn:lsid:marinespecies.org:taxname:${id}`;

const HEADER = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'scientificName', 'Count'];
const row = (sample: string, name: string, count: Cell = 4): Cell[] => ['S1', sample, 55, 3, '2020-01-01', name, count];
const run = (rows: Cell[][], worms?: WormsLookup) => convert({ sheets: [sheetInput(fileOf(HEADER, rows, 'S'), { quantity: { kind: 'count' }, shape: 'long' })], ...(worms ? { worms } : {}) });
const NEAR = record({ match_type: 'near_1' });

describe('A1: the name written after a choice', () => {
  it('the repro: "Calnaus finmarchicus" with the near result chosen is written as Calanus finmarchicus, with the LSID of that record, and the sheet spelling stays in verbatimIdentification', () => {
    const before = run([row('a', 'Calnaus finmarchicus')]);
    const worms = lookupOf({ 'Calnaus finmarchicus': [NEAR] }, { 'Calnaus finmarchicus': 104464 });
    const after = run([row('a', 'Calnaus finmarchicus')], worms);
    const o = after.occurrences[0];
    expect(o.scientificName).toBe('Calanus finmarchicus');
    expect(o.scientificNameId).toBe(LSID(104464));
    expect(o.verbatimIdentification).toBe('Calnaus finmarchicus');
    // the occurrenceID comes from the sheet's text, with or without the lookup
    expect(o.id).toBe(before.occurrences[0].id);
    expect(o.id).toContain('Calnaus finmarchicus');
    expect(after.nameLookup.applied).toBe(1);
    expect(judge(after.findings).blocking).toEqual([]);
  });

  it('a name the user did not choose for is undecided, blocks, and keeps the sheet spelling with no ID', () => {
    const r = run([row('a', 'Calnaus finmarchicus')], lookupOf({ 'Calnaus finmarchicus': [NEAR] }, {}));
    expect(r.occurrences[0].scientificName).toBe('Calnaus finmarchicus');
    expect(r.occurrences[0].scientificNameId).toBeUndefined();
    expect(r.blocking.map((f) => f.ruleId)).toContain('CONV-WORMS-UNDECIDED');
  });

  it('"no ID" for a near result keeps the sheet spelling and writes no ID', () => {
    const r = run([row('a', 'Calnaus finmarchicus')], lookupOf({ 'Calnaus finmarchicus': [NEAR] }, { 'Calnaus finmarchicus': 'none' }));
    expect(r.occurrences[0].scientificName).toBe('Calnaus finmarchicus');
    expect(r.occurrences[0].scientificNameId).toBeUndefined();
  });

  it('an exact match keeps scientificName as written: an unaccepted synonym stays the synonym (OBIS: the LSID of the name as written)', () => {
    const r = run([row('a', 'Sagitta elegans')], lookupOf({ 'Sagitta elegans': rec('Sagitta elegans') }, {}));
    expect(r.occurrences[0].scientificName).toBe('Sagitta elegans');
    expect(r.occurrences[0].scientificNameId).toBe(LSID(105450));
  });

  it('a case variant that WoRMS matches exactly is not rewritten either (exact keeps the sheet text)', () => {
    const r = run([row('a', 'calanus finmarchicus')], lookupOf({ 'calanus finmarchicus': [record({ match_type: 'exact' })] }, {}));
    expect(r.occurrences[0].scientificName).toBe('calanus finmarchicus');
    expect(r.occurrences[0].scientificNameId).toBe(LSID(104464));
  });

  it('a phonetic result and a genus-only result, once chosen, write the chosen record name', () => {
    const phon = lookupOf({ 'Oithona similus': rec('Oithona similus') }, { 'Oithona similus': 106656 });
    expect(run([row('a', 'Oithona similus')], phon).occurrences[0].scientificName).toBe('Oithona similis');
    const genus = record({ AphiaID: 106485, scientificname: 'Oithona', rank: 'Genus', match_type: 'exact_genus' });
    const r = run([row('a', 'Oithona nana')], lookupOf({ 'Oithona nana': [genus] }, { 'Oithona nana': 106485 }));
    expect(r.occurrences[0].scientificName).toBe('Oithona');
    expect(r.occurrences[0].verbatimIdentification).toBe('Oithona nana');
  });

  it('several results: the chosen one decides; an exact one keeps the sheet name, a non-exact one writes its own', () => {
    const exact = record({ AphiaID: 1, scientificname: 'Aurelia' });
    const near = record({ AphiaID: 2, scientificname: 'Aurelias', match_type: 'near_1' });
    const worms = (choice: number) => lookupOf({ Aurelia: [exact, near] }, { Aurelia: choice });
    expect(run([row('a', 'Aurelia')], worms(1)).occurrences[0].scientificName).toBe('Aurelia');
    const r = run([row('a', 'Aurelia')], worms(2));
    expect(r.occurrences[0].scientificName).toBe('Aurelias');
    expect(r.occurrences[0].scientificNameId).toBe(LSID(2));
  });

  it('the entry carries the name only for a chosen non-exact record', () => {
    expect(entryOf(rec('Calanus finmarchicus'))).toEqual({ state: 'id', aphiaId: 104464, notMarine: false });
    expect(entryOf([NEAR], 104464)).toMatchObject({ scientificName: 'Calanus finmarchicus' });
    expect(entryOf(rec('Aurelia'), 135263)).not.toHaveProperty('scientificName');
    expect(writesOwnName(NEAR)).toBe(true);
    expect(writesOwnName(record({}))).toBe(false);
  });

  it('the worker side does not trust the page: an entry whose own name is not one line of text is undecided and writes nothing', () => {
    for (const bad of ['Calanus\tfinmarchicus', 'Calanus\nfinmarchicus', '', '  ', ' padded ', 'x'.repeat(301), 'a\u0000b', 42 as unknown as string]) {
      const worms: WormsLookup = { 'Calnaus finmarchicus': { state: 'id', aphiaId: 104464, notMarine: false, scientificName: bad } };
      const r = run([row('a', 'Calnaus finmarchicus')], worms);
      expect(r.occurrences[0].scientificName, String(bad)).toBe('Calnaus finmarchicus');
      expect(r.occurrences[0].scientificNameId, String(bad)).toBeUndefined();
      expect(r.blocking.map((f) => f.ruleId), String(bad)).toContain('CONV-WORMS-UNDECIDED');
    }
    expect(isWritableName('Calanus finmarchicus')).toBe(true);
    expect(isWritableName('Calanus finmarchicus Linnaeus, 1767')).toBe(true);
  });

  it('every occurrence of the name is rewritten, in every sample, and a name that is not looked up is untouched', () => {
    const worms = lookupOf({ 'Calnaus finmarchicus': [NEAR] }, { 'Calnaus finmarchicus': 104464 });
    const r = run([row('a', 'Calnaus finmarchicus'), row('b', 'Calnaus finmarchicus', 2), row('c', 'Oithona similis')], worms);
    expect(r.occurrences.map((o) => o.scientificName)).toEqual(['Calanus finmarchicus', 'Calanus finmarchicus', 'Oithona similis']);
    expect(r.occurrences.map((o) => o.verbatimIdentification)).toEqual(['Calnaus finmarchicus', 'Calnaus finmarchicus', 'Oithona similis']);
  });
});

describe('A2: two names of one sample that resolve to the same taxon (decision: CONV-TAXON-SAME-EVENT is judged after the lookup and also groups by scientificNameID)', () => {
  const worms = () => lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Calnaus finmarchicus': [NEAR] }, { 'Calnaus finmarchicus': 104464 });

  it('the repro: "Calanus finmarchicus" and the resolved typo in one sample give one accept warning that names both, and nothing is summed', () => {
    const r = run([row('a', 'Calanus finmarchicus', 10), row('a', 'Calnaus finmarchicus', 3)], worms());
    const f = r.findings.filter((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT');
    expect(f.length).toBe(1);
    expect(f[0].params.count).toBe(2);
    expect(f[0].params.names).toBe('Calanus finmarchicus, Calnaus finmarchicus');
    expect(f[0].value).toBe('Calanus finmarchicus');
    expect(policyOf(f[0])).toBe('accept');
    expect(judge(r.findings).blocking).toEqual([]);
    for (const lang of LANGS) {
      const text = renderConvertPlain(f[0], lang);
      expect(text, lang).toContain('Calnaus finmarchicus');
      expect(text, lang).toContain('Calanus finmarchicus');
    }
    // two records, two occurrenceIDs, the counts as written
    expect(r.occurrences.map((o) => o.individualCount)).toEqual([10, 3]);
    expect(new Set(r.occurrences.map((o) => o.id)).size).toBe(2);
  });

  it('before the choice (or with no lookup) the two spellings are two taxa: no warning', () => {
    const undecided = lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Calnaus finmarchicus': [NEAR] }, {});
    expect(run([row('a', 'Calanus finmarchicus'), row('a', 'Calnaus finmarchicus')], undecided).findings.some((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT')).toBe(false);
    expect(run([row('a', 'Calanus finmarchicus'), row('a', 'Calnaus finmarchicus')]).findings.some((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT')).toBe(false);
  });

  it('two exact spellings that WoRMS gives one AphiaID (a case variant) are caught by the ID, though their names differ', () => {
    const w = lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'calanus finmarchicus': [record({})] }, {});
    const r = run([row('a', 'Calanus finmarchicus'), row('a', 'calanus finmarchicus')], w);
    const f = r.findings.find((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT');
    expect(f?.params.names).toBe('Calanus finmarchicus, calanus finmarchicus');
  });

  it('the same two names in different samples are not a duplicate; a different stage in one sample is not either', () => {
    expect(run([row('a', 'Calanus finmarchicus'), row('b', 'Calnaus finmarchicus')], worms()).findings.some((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT')).toBe(false);
    const w = lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Calnaus finmarchicus': [NEAR] }, { 'Calnaus finmarchicus': 104464 });
    const r = run([row('a', 'Calanus finmarchicus, c2'), row('a', 'Calnaus finmarchicus, c3')], w);
    expect(r.findings.some((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT')).toBe(false);
  });

  it('the same name twice in a sample is CONV-ID-DUPLICATE (the occurrenceIDs repeat), not this rule', () => {
    const w = run([row('a', 'Oithona similis'), row('a', 'Oithona similis', 2)]);
    expect(w.findings.some((x) => x.ruleId === 'CONV-ID-DUPLICATE')).toBe(true);
    expect(w.findings.some((x) => x.ruleId === 'CONV-TAXON-SAME-EVENT')).toBe(false);
  });
});

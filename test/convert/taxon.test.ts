// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { distinctSplits, nameDoubt, splitChanged, splitTaxon } from '../../src/core/convert/taxon';
import { fileOf, sheetInput } from './helpers';

describe('splitTaxon', () => {
  it('leaves a plain name alone, and keeps the exact text', () => {
    expect(splitTaxon('Calanus finmarchicus')).toEqual({ verbatimIdentification: 'Calanus finmarchicus', scientificName: 'Calanus finmarchicus' });
    expect(splitChanged(splitTaxon('Calanus finmarchicus'))).toBe(false);
  });

  it('takes sp., spp., cf., aff. and ? out of the name into the qualifier', () => {
    expect(splitTaxon('Pseudocalanus sp.')).toMatchObject({ scientificName: 'Pseudocalanus', identificationQualifier: 'sp.' });
    expect(splitTaxon('Pseudocalanus sp')).toMatchObject({ scientificName: 'Pseudocalanus', identificationQualifier: 'sp.' });
    expect(splitTaxon('Metridia spp.')).toMatchObject({ scientificName: 'Metridia', identificationQualifier: 'spp.' });
    expect(splitTaxon('Calanus cf. glacialis')).toMatchObject({ scientificName: 'Calanus glacialis', identificationQualifier: 'cf.' });
    expect(splitTaxon('cf. Calanus glacialis')).toMatchObject({ scientificName: 'Calanus glacialis', identificationQualifier: 'cf.' });
    expect(splitTaxon('Oithona aff. atlantica')).toMatchObject({ scientificName: 'Oithona atlantica', identificationQualifier: 'aff.' });
    expect(splitTaxon('Calanus glacialis?')).toMatchObject({ scientificName: 'Calanus glacialis', identificationQualifier: '?' });
    expect(splitTaxon('Calanus ? glacialis')).toMatchObject({ scientificName: 'Calanus glacialis', identificationQualifier: '?' });
    expect(splitTaxon('Pseudocalanus sp.').verbatimIdentification).toBe('Pseudocalanus sp.');
  });

  it('reads the fixed stage tokens c1-c6 / CI-CVI, nauplius, juv, larva, adult', () => {
    expect(splitTaxon('Calanus finmarchicus c2')).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C2' });
    expect(splitTaxon('Calanus finmarchicus C6')).toMatchObject({ lifeStage: 'C6' });
    expect(splitTaxon('Oithona similis CIV')).toMatchObject({ scientificName: 'Oithona similis', lifeStage: 'C4' });
    expect(splitTaxon('Oithona similis CVI')).toMatchObject({ lifeStage: 'C6' });
    expect(splitTaxon('Oithona similis (CIII)')).toMatchObject({ lifeStage: 'C3' });
    expect(splitTaxon('Calanus nauplius')).toMatchObject({ scientificName: 'Calanus', lifeStage: 'nauplius' });
    expect(splitTaxon('Calanus juv')).toMatchObject({ lifeStage: 'juvenile' });
    expect(splitTaxon('Polychaeta larva')).toMatchObject({ scientificName: 'Polychaeta', lifeStage: 'larva' });
    expect(splitTaxon('Calanus hyperboreus adult')).toMatchObject({ scientificName: 'Calanus hyperboreus', lifeStage: 'adult' });
  });

  it('reads a stage after a comma, and f / m (sex) ONLY as a suffix after a comma', () => {
    expect(splitTaxon('Augaptilus glacialis, c2')).toEqual({ verbatimIdentification: 'Augaptilus glacialis, c2', scientificName: 'Augaptilus glacialis', lifeStage: 'C2' });
    expect(splitTaxon('Metridia longa, f')).toEqual({ verbatimIdentification: 'Metridia longa, f', scientificName: 'Metridia longa', sex: 'female' });
    expect(splitTaxon('Metridia longa, m')).toMatchObject({ sex: 'male' });
    expect(splitTaxon('Metridia longa, f').lifeStage).toBeUndefined();
    expect(splitChanged(splitTaxon('Metridia longa, f'))).toBe(true);
    expect(splitTaxon('Metridia longa, c6')).toMatchObject({ lifeStage: 'C6' });
    // a bare f or m, or one without the comma, is part of the name
    expect(splitTaxon('Metridia longa f')).toEqual({ verbatimIdentification: 'Metridia longa f', scientificName: 'Metridia longa f' });
    expect(splitTaxon('Species m')).toMatchObject({ scientificName: 'Species m' });
    expect(splitTaxon('Species m').lifeStage).toBeUndefined();
  });

  it('combines a qualifier and a stage, and does not split a name with a comma that is not a stage', () => {
    expect(splitTaxon('Pseudocalanus sp., c2')).toMatchObject({ scientificName: 'Pseudocalanus', identificationQualifier: 'sp.', lifeStage: 'C2' });
    expect(splitTaxon('Calanus finmarchicus (Gunnerus, 1770)')).toMatchObject({ scientificName: 'Calanus finmarchicus (Gunnerus, 1770)' });
    expect(splitChanged(splitTaxon('Calanus finmarchicus (Gunnerus, 1770)'))).toBe(false);
  });

  it('never leaves an empty name: a header that is only a qualifier or a stage is not split', () => {
    expect(splitTaxon('sp.')).toEqual({ verbatimIdentification: 'sp.', scientificName: 'sp.' });
    expect(splitTaxon('c2').scientificName).toBe('c2');
  });

  it('trims the ends of the verbatim text only', () => {
    expect(splitTaxon('  Calanus  finmarchicus ').verbatimIdentification).toBe('Calanus  finmarchicus');
  });
});

describe('distinctSplits', () => {
  it('lists each distinct text once with its use count, and only the changed ones need a decision', () => {
    const list = distinctSplits(['Calanus finmarchicus c2', 'Calanus finmarchicus', 'Calanus finmarchicus c2', 'Pseudocalanus sp.']);
    expect(list.map((s) => [s.verbatim, s.uses, s.needsDecision, s.approved])).toEqual([
      ['Calanus finmarchicus c2', 2, true, false],
      ['Calanus finmarchicus', 1, false, false],
      ['Pseudocalanus sp.', 1, true, false],
    ]);
  });

  it('an approved split is used instead of the proposal, and its verbatim text is always the key', () => {
    const list = distinctSplits(['Pseudocalanus sp.'], { 'Pseudocalanus sp.': { verbatimIdentification: 'something else', scientificName: 'Pseudocalanus', identificationQualifier: 'spp.' } });
    expect(list[0].approved).toBe(true);
    expect(list[0].split).toEqual({ verbatimIdentification: 'Pseudocalanus sp.', scientificName: 'Pseudocalanus', identificationQualifier: 'spp.' });
    expect(list[0].proposed.identificationQualifier).toBe('sp.');
  });
});

describe('a leftover that is not a plausible Latin name is put to the user (M5)', () => {
  it('reads a bare f / m as the sex only straight after a stage or a "?"', () => {
    expect(splitTaxon('Calanus finmarchicus C5 f')).toEqual({ verbatimIdentification: 'Calanus finmarchicus C5 f', scientificName: 'Calanus finmarchicus', lifeStage: 'C5', sex: 'female' });
    expect(splitTaxon('Acartia ? f')).toEqual({ verbatimIdentification: 'Acartia ? f', scientificName: 'Acartia', identificationQualifier: '?', sex: 'female' });
    expect(splitTaxon('Acartia longiremis ? m')).toMatchObject({ scientificName: 'Acartia longiremis', identificationQualifier: '?', sex: 'male' });
  });

  const doubt = (t: string) => distinctSplits([t])[0];
  it.each([
    ['Metridia longa f', 'single-letter'],
    ['Calanus hyperboreus CVI-CV', 'stage-range'],
    ['Microcalanus pusillus/pygmaeus', 'slash'],
    ['Oithona sp. 1', 'digits'],
    ['Calanus finmarchicus (Gunnerus, 1770)', 'digits'],
    ['Alpha beta gamma delta', 'long'],
  ] as const)('%s needs a decision: %s', (text, reason) => {
    const e = doubt(text);
    expect(e.needsDecision).toBe(true);
    expect(e.doubt).toBe(reason);
    expect(e.approved).toBe(false);
  });

  it('a plain Latin name, a genus with a qualifier or a stage has no doubt about the name', () => {
    for (const t of ['Calanus finmarchicus', 'Calanus finmarchicus c2', 'Pseudocalanus sp.', 'Calanus cf. glacialis', 'Acartia ? f', 'Augaptilus glacialis, c2']) expect(doubt(t).doubt, t).toBeUndefined();
    expect(doubt('Calanus finmarchicus').needsDecision).toBe(false);
  });

  it('nameDoubt names the reason in a fixed order', () => {
    expect(nameDoubt('A b')).toBe('single-letter');
    expect(nameDoubt('Calanus')).toBeUndefined();
    expect(nameDoubt('Mytilus x edulis')).toBe('single-letter');
  });

  it('an edited approval is used as given by convert, doubt or not', () => {
    const f = fileOf(['Sample', 'Station', 'Microcalanus pusillus/pygmaeus'], [['a', 'S', 3]]);
    const s = [sheetInput(f, { quantity: { kind: 'count' } })];
    expect(convert({ sheets: s }).blocking.map((x) => x.ruleId)).toEqual(['CONV-SPLIT-UNDECIDED']);
    const r = convert({ sheets: s, approvedSplits: { 'Microcalanus pusillus/pygmaeus': { verbatimIdentification: 'x', scientificName: 'Microcalanus', identificationQualifier: 'sp.' } } });
    expect(r.blocking).toEqual([]);
    expect(r.occurrences[0]).toMatchObject({ scientificName: 'Microcalanus', identificationQualifier: 'sp.', verbatimIdentification: 'Microcalanus pusillus/pygmaeus' });
  });
});

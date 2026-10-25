// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 4, review fixes: a name with a taxon ID from the sheet on ANY row is never sent and gets no WoRMS ID (and the sheet's incomplete or conflicting IDs are
// said); an AphiaID that is not a positive whole number writes nothing; the DOI of the citation is read strictly; lists of names are whole in the finding;
// the sampling-descriptor warning only when there is an eMoF; copy that says what is sent is true.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { doiOfCitation } from '../../src/core/convert/eml';
import { judge, policyOf } from '../../src/core/convert/policy';
import { lookupOf, readWormsRecord } from '../../src/core/convert/worms';
import type { WormsLookup, WormsRecord } from '../../src/core/convert/worms';
import { CONVERT_RULES, makeConvertFinding, renderConvertPlain, renderConvertTechnical } from '../../src/core/rules/convert';
import { UI } from '../../src/core/i18n/ui';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { LANGS } from '../../src/core/types';
import { RECORDED } from '../helpers/wormsFixtures';
import { exportSheet } from './exportHelpers';
import { fileOf, sheetInput, W1_HEADER, W1_ROWS } from './helpers';
import type { Cell } from './helpers';

const rec = (name: string): WormsRecord[] => (RECORDED[name] as unknown[]).map((r) => readWormsRecord(r) as WormsRecord);
const HEADER = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'scientificName', 'AphiaID', 'Count'];
const row = (sample: string, name: string, id: Cell): Cell[] => ['S1', sample, 55, 3, '2020-01-01', name, id, 4];
const LSID = (id: number): string => `urn:lsid:marinespecies.org:taxname:${id}`;
const run = (rows: Cell[][], worms?: WormsLookup) => convert({ sheets: [sheetInput(fileOf(HEADER, rows, 'S'), { quantity: { kind: 'count' }, shape: 'long' })], ...(worms ? { worms } : {}) });
const idsOf = (r: ReturnType<typeof run>, name: string): (string | undefined)[] => r.occurrences.filter((o) => o.scientificName === name).map((o) => o.scientificNameId);

describe('a name with a sheet ID on any row', () => {
  const worms = () => lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus'), 'Oithona similis': [readWormsRecord({ AphiaID: 106656, scientificname: 'Oithona similis', status: 'accepted', match_type: 'exact', isMarine: 1 }) as WormsRecord] }, {});

  it('the repro: an ID on one row and none on the other: the name is not sent, the empty row gets no WoRMS ID, the sheet ID is kept, and the gap is a warning to accept', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111), row('b', 'Calanus finmarchicus', null), row('c', 'Oithona similis', null)], worms());
    expect(r.nameLookup.names).toEqual(['Oithona similis']);
    expect(r.nameLookup.withSheetId).toBe(1);
    expect(idsOf(r, 'Calanus finmarchicus')).toEqual([LSID(111), undefined]);
    expect(idsOf(r, 'Oithona similis')).toEqual([LSID(106656)]);
    expect(r.nameLookup.applied).toBe(1);
    const f = r.findings.find((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE');
    expect(f?.severity).toBe('warning');
    expect(f?.params).toEqual({ count: 1, names: 'Calanus finmarchicus' });
    expect(policyOf(f!)).toBe('accept');
    expect(judge(r.findings).blocking).toEqual([]);
  });

  it('without a lookup the gap is said as well', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111), row('b', 'Calanus finmarchicus', null)]);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(true);
    expect(r.nameLookup.names).toEqual([]);
  });

  it('variant: an ID on every row: not sent, no gap, nothing to say', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111), row('b', 'Calanus finmarchicus', 111)], worms());
    expect(r.nameLookup).toEqual({ names: [], withSheetId: 1, applied: 0 });
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE' || x.ruleId === 'CONV-NAMEID-CONFLICT')).toBe(false);
    expect(idsOf(r, 'Calanus finmarchicus')).toEqual([LSID(111), LSID(111)]);
  });

  it('variant: no ID on any row: the name is sent and every row gets the WoRMS ID', () => {
    const r = run([row('a', 'Calanus finmarchicus', null), row('b', 'Calanus finmarchicus', null)], worms());
    expect(r.nameLookup.names).toEqual(['Calanus finmarchicus']);
    expect(idsOf(r, 'Calanus finmarchicus')).toEqual([LSID(104464), LSID(104464)]);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(false);
  });

  it('two different IDs for one name in the sheet: each row keeps its ID, the name is not sent, and CONV-NAMEID-CONFLICT (a warning to accept: two taxa can share a name) says so', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111), row('b', 'Calanus finmarchicus', 222)], worms());
    expect(r.nameLookup.names).toEqual([]);
    expect(idsOf(r, 'Calanus finmarchicus')).toEqual([LSID(111), LSID(222)]);
    const f = r.findings.find((x) => x.ruleId === 'CONV-NAMEID-CONFLICT');
    expect(f?.severity).toBe('warning');
    expect(policyOf(f!)).toBe('accept');
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(false);
    for (const lang of LANGS) expect(renderConvertPlain(f!, lang)).toContain('Calanus finmarchicus');
  });

  it('the archive of the repro has one ID per name, never two', async () => {
    const header = W1_HEADER;
    const out = await exportSheet(header, W1_ROWS, { quantity: { kind: 'count' }, worms: lookupOf({ 'Calanus finmarchicus': rec('Calanus finmarchicus') }, {}) });
    const ids = out.result.occurrences.filter((o) => o.scientificName === 'Calanus finmarchicus').map((o) => o.scientificNameId);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('an AphiaID that is not a positive whole number writes nothing', () => {
  for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
    it(`${String(bad)}: no ID is written and the name is undecided (blocks)`, () => {
      const r = run([row('a', 'Calanus finmarchicus', null)], { 'Calanus finmarchicus': { state: 'id', aphiaId: bad, notMarine: false } });
      expect(idsOf(r, 'Calanus finmarchicus')).toEqual([undefined]);
      expect(r.findings.find((x) => x.ruleId === 'CONV-WORMS-UNDECIDED')?.severity).toBe('error');
      expect(r.nameLookup.applied).toBe(0);
    });
  }
  it('a valid one is written and counted', () => {
    const r = run([row('a', 'Calanus finmarchicus', null), row('b', 'Calanus finmarchicus', null)], { 'Calanus finmarchicus': { state: 'id', aphiaId: 104464, notMarine: false } });
    expect(r.nameLookup.applied).toBe(2);
  });
});

describe('lists of names are whole in the finding and short in the text', () => {
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
  const names = GREEK.map((g) => `Taxon ${g}`);
  it('the finding keeps all names (so an acceptance stands for the whole set); the plain text shows six and an ellipsis; the technical text shows all', () => {
    const rows = names.map((n, i) => row(`s${i}`, n, null));
    const r = run(rows, Object.fromEntries(names.map((n) => [n, { state: 'none', reason: 'no-match' }])) as WormsLookup);
    const f = r.findings.find((x) => x.ruleId === 'CONV-WORMS-NO-MATCH')!;
    expect(f.params.names).toBe(names.join(', '));
    for (const lang of LANGS) {
      const text = renderConvertPlain(f, lang);
      expect(text).toContain(names.slice(0, 6).join(', ') + ', …');
      expect(text).not.toContain('Taxon eta');
    }
    expect(renderConvertTechnical(f)).toContain('Taxon theta');
  });

  it('two sets that differ only in the 7th name or later are different findings (the fingerprint of the tick sees it)', () => {
    const a = makeConvertFinding('CONV-WORMS-NO-MATCH', { value: 'Taxon alpha', params: { count: 7, names: [...names.slice(0, 6), 'Taxon eta'].join(', ') } });
    const b = makeConvertFinding('CONV-WORMS-NO-MATCH', { value: 'Taxon alpha', params: { count: 7, names: [...names.slice(0, 6), 'Taxon theta'].join(', ') } });
    expect(JSON.stringify(a.params)).not.toBe(JSON.stringify(b.params));
    expect(renderConvertPlain(a, 'en')).toBe(renderConvertPlain(b, 'en'));
  });

  it('the same holds for the unexported columns and the same taxon in one sample', () => {
    const cols = Array.from({ length: 8 }, (_, i) => `col${i}`);
    const f = makeConvertFinding('CONV-COLUMN-NOT-EXPORTED', { params: { count: 8, columns: cols.join(', ') } });
    expect(renderConvertPlain(f, 'en')).toContain('col5, …');
    expect(renderConvertPlain(f, 'en')).not.toContain('col6');
  });
});

describe('the sampling-descriptor warning needs an eMoF, as BioCheck does', () => {
  it('a full list with only zeros writes no eMoF and no warning; the same sheet with a count writes one and warns', async () => {
    const header = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'];
    const zeros = await exportSheet(header, [['S1', 'a', 55, 3, '2020-01-01', 0]], { quantity: { kind: 'count' }, fullList: true });
    expect(zeros.result.measurements.length).toBe(0);
    expect(zeros.findings.some((f) => f.ruleId === 'CONV-NO-SAMPLING-DESCRIPTOR')).toBe(false);
    const counts = await exportSheet(header, [['S1', 'a', 55, 3, '2020-01-01', 4]], { quantity: { kind: 'count' } });
    expect(counts.findings.some((f) => f.ruleId === 'CONV-NO-SAMPLING-DESCRIPTOR')).toBe(true);
    expect(CONVERT_RULES.find((r) => r.id === 'CONV-NO-SAMPLING-DESCRIPTOR')?.technical).toContain('only when the archive has an eMoF');
  });
});

describe('the DOI of the citation', () => {
  it('is taken from doi.org and dx.doi.org addresses, doi:, or a bare string that is not part of another address', () => {
    expect(doiOfCitation('A (2020). T. https://doi.org/10.1594/PANGAEA.839758')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('A (2020). T. http://dx.doi.org/10.1594/PANGAEA.839758')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('A (2020). T. doi: 10.1594/PANGAEA.839758')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('Cited as 10.5281/zenodo.123456.')).toBe('10.5281/zenodo.123456');
    expect(doiOfCitation('Cited as (10.5281/zenodo.123456)')).toBe('10.5281/zenodo.123456');
  });
  it('keeps the characters a DOI may hold: < > ( ) ; : /', () => {
    expect(doiOfCitation('Smith (1998). https://doi.org/10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O.')).toBe('10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O');
    expect(doiOfCitation('Smith. https://doi.org/10.1000/a/b;c:d_e')).toBe('10.1000/a/b;c:d_e');
  });
  it('trims the punctuation of the sentence and a bracket that is not the DOI\'s own', () => {
    expect(doiOfCitation('See (https://doi.org/10.1594/PANGAEA.839758).')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('See <https://doi.org/10.1594/PANGAEA.839758>, then')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('https://doi.org/10.1594/PANGAEA.839758;')).toBe('10.1594/PANGAEA.839758');
  });
  it('is not taken from inside another address', () => {
    expect(doiOfCitation('Data at https://example.org/files/10.1234/abc.csv')).toBeUndefined();
    expect(doiOfCitation('Data at https://example.org/get?doi=10.1234/abc')).toBeUndefined();
    expect(doiOfCitation('mail ada@10.1234/abc')).toBeUndefined();
    // a DOI after a resolver address wins over a bare one earlier in the text of another address
    expect(doiOfCitation('See https://example.org/10.1111/zzz and https://doi.org/10.1594/PANGAEA.839758')).toBe('10.1594/PANGAEA.839758');
  });
});

describe('the copy says what is sent', () => {
  it('no text of /convert claims that nothing is sent anywhere without naming the WoRMS lookup', () => {
    const claim = /Nothing is sent anywhere|nothing is sent anywhere|Nic nie jest nigdzie wysyłane|nic nie jest nigdzie wysyłane|Nichts wird irgendwohin gesendet|nichts wird irgendwohin gesendet|Rien n'est envoyé nulle part|rien n'est envoyé nulle part/;
    for (const lang of LANGS) {
      const all: Record<string, string> = { ...UI[lang], ...TIP_TEXTS[lang] };
      for (const [k, text] of Object.entries(all)) {
        if (!/convert|tip\.role/.test(k) || !claim.test(text)) continue;
        expect(text, `${lang} ${k}`).toMatch(/WoRMS/);
      }
    }
  });

  it('the status text and the intro tip of every language name the WoRMS lookup as the one exception, and the NERC lookup stays planned', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['convert.status.text'], lang).toMatch(/WoRMS/);
      expect(UI[lang]['convert.status.text'], lang).not.toMatch(/planned|geplant|prévu|planowan/);
      const intro = (TIP_TEXTS[lang] as Record<string, string>)['tip.convertIntro.logic'];
      expect(intro, lang).toMatch(/WoRMS/);
      expect(intro, lang).toMatch(/NERC/);
    }
    expect(UI.en['convert.status.text']).toContain('nothing is sent anywhere except the taxon names you choose to look up in WoRMS, and only after you press that button');
  });

  it('the Polish summary takes the plural of its counts', () => {
    const t = (n: number) => UI.pl['convert.worms.summary'].replace(/\{\+(\w+):([^}]*)\}/g, (_m, name: string, forms: string) => {
      const count = { exact: n, choose: n, none: n }[name] ?? 0;
      const f = forms.split('|');
      const i = count === 1 ? 0 : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 1 : 2;
      return f[i];
    });
    expect(t(1)).toContain('dokładne dopasowanie przyjęte');
    expect(t(2)).toContain('dokładne dopasowania przyjęte');
    expect(t(5)).toContain('dokładnych dopasowań przyjętych');
  });
});

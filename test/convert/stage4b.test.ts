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
import { UI, translate } from '../../src/core/i18n/ui';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { LANGS } from '../../src/core/types';
import { RECORDED } from '../helpers/wormsFixtures';
import { exportSheet } from './exportHelpers';
import { fileOf, sheetInput, W1_HEADER, W1_ROWS } from './helpers';
import type { Cell } from './helpers';

const rec = (name: string): WormsRecord[] => (RECORDED[name] as unknown[]).map((r) => readWormsRecord(r) as WormsRecord);
const HEADER = ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'scientificName', 'AphiaID', 'Count'];
const row = (sample: string, name: string, id: Cell, count: Cell = 4): Cell[] => ['S1', sample, 55, 3, '2020-01-01', name, id, count];
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

  it('a sheet ID on a row with a count of zero counts too (the row is left out unless the list is declared full): the name is not sent and the other row gets no WoRMS ID', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111, 0), row('b', 'Calanus finmarchicus', null, 5)], worms());
    expect(r.occurrences.length).toBe(1); // the zero row was skipped
    expect(r.nameLookup.names).toEqual([]);
    expect(r.nameLookup.withSheetId).toBe(1);
    expect(idsOf(r, 'Calanus finmarchicus')).toEqual([undefined]);
    expect(r.nameLookup.applied).toBe(0);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(true);
    // and with the list declared full the zero row is written, with its ID, and the result is the same
    const full = convert({ sheets: [sheetInput(fileOf(HEADER, [row('a', 'Calanus finmarchicus', 111, 0), row('b', 'Calanus finmarchicus', null, 5)], 'S'), { quantity: { kind: 'count' }, shape: 'long' })], options: { fullList: true }, worms: worms() });
    expect(full.nameLookup.names).toEqual([]);
    expect(idsOf(full, 'Calanus finmarchicus')).toEqual([LSID(111), undefined]);
  });

  it('a conflict is seen across skipped rows too', () => {
    const r = run([row('a', 'Calanus finmarchicus', 111, 0), row('b', 'Calanus finmarchicus', 222, 5)]);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-CONFLICT')).toBe(true);
  });

  it('a sheet ID on a row whose split is not approved yet keeps the plain name from being sent ("Calanus finmarchicus CV" has the ID; the proposed split names it Calanus finmarchicus)', () => {
    const rows = [row('a', 'Calanus finmarchicus CV', 111), row('b', 'Calanus finmarchicus', null), row('c', 'Oithona similis', null)];
    const undecided = run(rows, worms());
    expect(undecided.findings.some((x) => x.ruleId === 'CONV-SPLIT-UNDECIDED')).toBe(true);
    expect(undecided.nameLookup.names).toEqual(['Oithona similis']);
    expect(idsOf(undecided, 'Calanus finmarchicus')).toEqual([LSID(111), undefined]); // the plain row gets nothing from WoRMS
    // once the split is approved the answer is the same: the name has a sheet ID on one row
    const approved = convert({
      sheets: [sheetInput(fileOf(HEADER, rows, 'S'), { quantity: { kind: 'count' }, shape: 'long' })],
      approvedSplits: { 'Calanus finmarchicus CV': { verbatimIdentification: 'Calanus finmarchicus CV', scientificName: 'Calanus finmarchicus', lifeStage: 'C5' } },
      worms: worms(),
    });
    expect(approved.nameLookup.names).toEqual(['Oithona similis']);
    expect(idsOf(approved, 'Calanus finmarchicus')).toEqual([LSID(111), undefined]);
  });

  it('an approved split with an EDITED name: the row is written under the edited name with its sheet ID, and that name is not sent for its other rows', () => {
    const rows = [row('a', 'Calanus finmarchicus CV', 111), row('b', 'Calanus finmarchicus s.l.', null), row('c', 'Oithona similis', null)];
    const r = convert({
      sheets: [sheetInput(fileOf(HEADER, rows, 'S'), { quantity: { kind: 'count' }, shape: 'long' })],
      approvedSplits: { 'Calanus finmarchicus CV': { verbatimIdentification: 'Calanus finmarchicus CV', scientificName: 'Calanus finmarchicus s.l.', lifeStage: 'C5' } },
      worms: lookupOf({ 'Calanus finmarchicus s.l.': rec('Calanus finmarchicus'), 'Calanus finmarchicus': rec('Calanus finmarchicus') }, {}),
    });
    expect(r.nameLookup.names).toEqual(['Oithona similis']);
    expect(idsOf(r, 'Calanus finmarchicus s.l.')).toEqual([LSID(111), undefined]);
    expect(r.nameLookup.withSheetId).toBe(1);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(true);
    // two different IDs under the proposed name and the edited one are one conflict
    const two = convert({
      sheets: [sheetInput(fileOf(HEADER, [row('a', 'Calanus finmarchicus CV', 111), row('b', 'Calanus finmarchicus s.l.', 222)], 'S'), { quantity: { kind: 'count' }, shape: 'long' })],
      approvedSplits: { 'Calanus finmarchicus CV': { verbatimIdentification: 'Calanus finmarchicus CV', scientificName: 'Calanus finmarchicus s.l.', lifeStage: 'C5' } },
    });
    expect(two.findings.some((x) => x.ruleId === 'CONV-NAMEID-CONFLICT')).toBe(true);
  });

  it('an approved, EDITED split does not keep the plain proposed name out of the lookup: its sheet ID belongs to the edited name only', () => {
    const rows = [row('a', 'Calanus finmarchicus CV', 111), row('b', 'Calanus finmarchicus', null)];
    const r = convert({
      sheets: [sheetInput(fileOf(HEADER, rows, 'S'), { quantity: { kind: 'count' }, shape: 'long' })],
      approvedSplits: { 'Calanus finmarchicus CV': { verbatimIdentification: 'Calanus finmarchicus CV', scientificName: 'Calanus finmarchicus s.l.', lifeStage: 'C5' } },
    });
    expect(r.nameLookup.names).toEqual(['Calanus finmarchicus']);
    expect(r.findings.some((x) => x.ruleId === 'CONV-NAMEID-CONFLICT' || x.ruleId === 'CONV-NAMEID-INCOMPLETE')).toBe(false);
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
  it('accepts http and https, with or without www. and dx.', () => {
    for (const prefix of ['https://doi.org/', 'http://doi.org/', 'https://www.doi.org/', 'http://www.doi.org/', 'https://dx.doi.org/', 'http://dx.doi.org/']) expect(doiOfCitation(`A (2020). T. ${prefix}10.1594/PANGAEA.839758`), prefix).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('A (2020). T. https://www.example.org/10.1594/PANGAEA.839758')).toBeUndefined();
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
  /*
   * Any claim that nothing leaves the browser or nothing is sent, in the four languages. A string of /convert that makes one must name BOTH opt-ins, WoRMS and NVS
   * (it is then about the exceptions) unless it is exempted BY KEY below. The patterns are loose on purpose: a new sentence of the same kind is caught.
   */
  const CLAIMS: Record<(typeof LANGS)[number], RegExp[]> = {
    en: [/\bnothing\b[^.;]{0,50}\b(sent|send|uploaded|transmitted|leaves? your|leaving your)\b/i, /\bnever\b[^.;]{0,40}\b(sends?|sent|leaves?|uploads?|transmits?)\b/i, /\bno (request|data|network)\b/i, /\bnot (sent|uploaded|transmitted)\b/i, /\bleaves? your (browser|computer)\b/i],
    pl: [/\bnic\b[^.;]{0,50}(wysyłan|wysyła|przesyłan|opuszcza|opuszczać)/i, /\bnigdy\b[^.;]{0,40}(wysyła|wysyłan|opuszcza|przesyła)/i, /nigdzie[^.;]{0,30}wysy|wysyła[^.;]{0,30}nigdzie/i, /żadn[eay][^.;]{0,15}(żądani|danych)|nie jest (wysyłan|przesyłan)|nie opuszcza/i],
    de: [/\bnichts\b[^.;]{0,50}(gesendet|sendet|hochgeladen|übertragen|verlässt|verlassen)/i, /\bnie(mals)?\b[^.;]{0,40}(sendet|gesendet|verlässt|hochgeladen|überträgt)/i, /(irgend|nirgend)wohin[^.;]{0,30}(gesendet|sendet)|sendet[^.;]{0,30}(irgend|nirgend)wohin/i, /keine (Anfrage|Daten)|nicht (gesendet|hochgeladen|übertragen)/i],
    fr: [/\brien\b[^.;]{0,50}(envoy|téléversé|transmis|quitt\w*\s+(votre|le|l'))/i, /\bjamais\b[^.;]{0,40}(envoie|envoy|quitte|téléverse|transmet)/i, /nulle part/i, /aucune (requête|donnée)|n'est pas (envoy|téléversé|transmis)/i],
  };
  /** Said about the FORM FIELDS (typed text and e-mail addresses: true, they are never sent), or about the lookup itself (the section of the opt-in and its tips). */
  const EXEMPT_KEYS = new Set([
    'convert.meta.intro', // typed text of the description form
    'tip.convertMetaContact.logic', // the e-mail address of the contact
    'tip.convertMetaFiles.logic', // no link or DOI of a metadata file is followed (no request for a record)
    'tip.convertArchiveDesc.logic', // an eml.xml / meta.xml dropped with the data is only listed
  ]);
  const EXEMPT_PREFIXES = ['convert.worms.', 'tip.convertWorms', 'convert.nvs.', 'tip.convertNvs'];
  const claimsNothingSent = (lang: (typeof LANGS)[number], text: string): boolean => CLAIMS[lang].some((p) => p.test(text));

  it('the patterns catch the claims they are meant to, in every language (so a rewrite of convert.meta.intro to say nothing leaves the browser fails the test below)', () => {
    const sentences: Record<(typeof LANGS)[number], string[]> = {
      en: ['Nothing ever leaves your browser; nothing is sent to any server.', 'Nothing is sent anywhere.', 'This page never sends it anywhere.', 'No request is sent.', 'Your data is not uploaded.'],
      pl: ['Nic nigdy nie opuszcza Twojej przeglądarki; nic nie jest wysyłane na żaden serwer.', 'Nic nie jest nigdzie wysyłane.', 'Ta strona nigdy go nigdzie nie wysyła.', 'Nie jest wysyłane żadne żądanie.'],
      de: ['Nichts verlässt jemals Ihren Browser; nichts wird an einen Server gesendet.', 'Nichts wird irgendwohin gesendet.', 'Diese Seite sendet sie nirgendwohin.', 'Es wird keine Anfrage gesendet.'],
      fr: ["Rien ne quitte jamais votre navigateur ; rien n'est envoyé à un serveur.", "Rien n'est envoyé nulle part.", "Cette page ne l'envoie nulle part.", "Aucune requête n'est envoyée."],
    };
    for (const lang of LANGS) for (const t of sentences[lang]) expect(claimsNothingSent(lang, t), `${lang}: ${t}`).toBe(true);
    for (const lang of LANGS) for (const t of ['Your files stay in your browser.', 'Pliki zostają w Twojej przeglądarce.', 'Ihre Dateien bleiben in Ihrem Browser.', 'Vos fichiers restent dans votre navigateur.']) expect(claimsNothingSent(lang, t), t).toBe(false);
  });

  it('every text of /convert that says nothing leaves the browser or nothing is sent names both WoRMS and NVS, unless it is exempted by key (the form fields, the two lookup sections)', () => {
    const seen: string[] = [];
    for (const lang of LANGS) {
      const all: Record<string, string> = { ...UI[lang], ...TIP_TEXTS[lang] };
      for (const [k, text] of Object.entries(all)) {
        if (!/convert|tip\.role/.test(k) || !claimsNothingSent(lang, text)) continue;
        if (EXEMPT_KEYS.has(k) || EXEMPT_PREFIXES.some((p) => k.startsWith(p))) continue;
        seen.push(`${lang} ${k}`);
        expect(text, `${lang} ${k}`).toMatch(/WoRMS/);
        expect(text, `${lang} ${k}`).toMatch(/NVS/);
      }
    }
    // not vacuous: the status text and the intro tip make such a claim, and name both
    expect(seen).toContain('en convert.status.text');
    expect(seen).toContain('pl tip.convertIntro.logic');
  });

  it('the exempt keys are the ones that are true: typed text and e-mail addresses are never sent, and a file description is only listed', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['convert.meta.intro']).not.toMatch(/WoRMS/);
      expect(claimsNothingSent(lang, UI[lang]['convert.meta.intro'])).toBe(true); // it is a claim: that is why it is exempted by key, on purpose
    }
    // a mutated meta.intro that claims more than the form fields (everything stays in the browser) is not what the exemption covers: it must be rewritten, not exempted
    expect(UI.en['convert.meta.intro']).toContain('Nothing you type is stored or sent anywhere');
    expect(UI.en['convert.meta.intro']).not.toMatch(/Nothing ever leaves your browser/);
  });

  it('the status text and the intro tip of every language name both lookups as the exceptions (WoRMS and NVS), and neither is called planned any more', () => {
    for (const lang of LANGS) {
      expect(UI[lang]['convert.status.text'], lang).toMatch(/WoRMS/);
      expect(UI[lang]['convert.status.text'], lang).toMatch(/NVS/);
      expect(UI[lang]['convert.status.text'], lang).not.toMatch(/planned|geplant|prévu|planowan/);
      const intro = (TIP_TEXTS[lang] as Record<string, string>)['tip.convertIntro.logic'];
      expect(intro, lang).toMatch(/WoRMS/);
      expect(intro, lang).toMatch(/NVS/);
      expect(intro, lang).toMatch(/NERC/);
      expect(intro, lang).not.toMatch(/planned|geplant|prévu|planowan/);
    }
    expect(UI.en['convert.status.text']).toContain("nothing is sent anywhere except what you choose to look up, and only after you press that lookup's button: taxon names in WoRMS, and the search words you type for NVS");
  });

  it('a mutated sentence that claims nothing is sent without naming both lookups is caught: WoRMS alone is not enough any more', () => {
    const only = 'Nothing is stored, and nothing is sent anywhere except the taxon names you choose to look up in WoRMS, and only after you press that button.';
    expect(claimsNothingSent('en', only)).toBe(true);
    expect(/NVS/.test(only)).toBe(false); // the guard above requires NVS as well: this sentence would fail it
    const both = 'Nothing is sent anywhere except taxon names in WoRMS and the search words you type for NVS.';
    expect(claimsNothingSent('en', both) && /WoRMS/.test(both) && /NVS/.test(both)).toBe(true);
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

describe('the summary of the results takes the plural of its counts', () => {
  it('French and German: "1 exacts" never appears, and each number has its right form', () => {
    expect(translate('fr', 'convert.worms.summary', { exact: 1, choose: 1, none: 1 })).toBe('Résultats : 1 correspondance exacte retenue automatiquement, 1 nom à choisir par vous, 1 nom sans correspondance.');
    expect(translate('fr', 'convert.worms.summary', { exact: 3, choose: 2, none: 0 })).toBe('Résultats : 3 correspondances exactes retenues automatiquement, 2 noms à choisir par vous, 0 nom sans correspondance.');
    expect(translate('fr', 'convert.worms.summary', { exact: 1, choose: 1, none: 1 })).not.toMatch(/exacts/);
    expect(translate('de', 'convert.worms.summary', { exact: 1, choose: 1, none: 1 })).toBe('Ergebnisse: 1 exakter Treffer automatisch übernommen, 1 Name zur Auswahl durch Sie, 1 Name ohne Treffer.');
    expect(translate('de', 'convert.worms.summary', { exact: 3, choose: 2, none: 5 })).toBe('Ergebnisse: 3 exakte Treffer automatisch übernommen, 2 Namen zur Auswahl durch Sie, 5 Namen ohne Treffer.');
    expect(translate('pl', 'convert.worms.summary', { exact: 2, choose: 5, none: 1 })).toContain('2 dokładne dopasowania przyjęte');
  });
});

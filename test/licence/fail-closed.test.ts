// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The licence classifier is FAIL-CLOSED: a text that names a licence is that licence only when nothing but the licence name and
// recognised neutral wording is left. Anything else is "unrecognised — check manually" and the leftover is shown.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildStatement, classifyStatement } from '../../src/core/metadata/licence';
import { renderPlain } from '../../src/core/report';
import { RULES } from '../../src/core/rules/registry';
import { LANGS, type MetadataRecord } from '../../src/core/types';

const BY = 'https://creativecommons.org/licenses/by/4.0/';
const st = (text: string, uri?: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!;
const idOf = (text: string, uri?: string): string | undefined => {
  const c = classifyStatement(st(text, uri));
  return c.kind === 'spdx' ? c.id : undefined;
};
const rec = (text: string, uri?: string): MetadataRecord => ({ source: 'datacite', label: 'rec', licences: [st(text, uri)], restrictionCodes: [], distributionLinks: [] });
const licFindings = (text: string, uri?: string) => checkLicence([rec(text, uri)], { label: 'rec', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'));

/** [text, what must be left over (a part of it)] */
const LEAKS: [string, string][] = [
  ['CC BY 4.0, commercial use allowed on request', 'on request'],
  ['CC BY 4.0, użycie komercyjne dozwolone po uzgodnieniu z autorem', 'po uzgodnieniu z autorem'],
  ['CC BY 4.0 NC', 'NC'],
  ['CC BY 4.0. Please contact the PI before publication.', 'Please contact the PI before publication'],
  ['CC BY 4.0, commercial use permitted with prior written agreement', 'prior written agreement'],
  ['CC BY 4.0, commercial use permitted after registration', 'after registration'],
  ['CC BY 4.0, commercial use permitted subject to a fee', 'subject to a fee'],
  ['CC BY 4.0, commercial use permitted for project partners', 'project partners'],
  ['CC BY 4.0, commercial use permitted from 2027', 'permitted from'],
  ['CC BY 4.0, even commercially upon request', 'upon request'],
  ['CC BY 4.0, including commercial use against payment', 'against payment'],
  ['CC BY 4.0, kommerzielle Nutzung erlaubt nach Rücksprache', 'nach Rücksprache'],
  ['CC BY 4.0, auch kommerziell gegen Gebühr', 'gegen Gebühr'],
  ['CC BY 4.0, utilisation commerciale autorisée sur demande', 'sur demande'],
  ['CC BY 4.0, y compris commerciale moyennant redevance', 'moyennant redevance'],
  ['CC BY 4.0, nawet komercyjnie za opłatą', 'za opłatą'],
  ['CC BY 4.0, No limitations for registered users', 'registered users'],
  ['CC BY 4.0, but please cite and pay a fee', 'pay a fee'],
  ['CC BY 4.0, no rights reserved for NC use', 'rights reserved for NC'],
  ['CC BY 4.0, NC', 'NC'],
  ['CC BY 4.0 + ND', 'ND'],
  // extra text that is no condition word
  ['CC BY 4.0, data from the 2019 cruise', 'cruise'],
  ['CC BY 4.0 (Ocean Data Limited)', 'Ocean Data Limited'],
];

describe('every confirmed leak is unrecognised, with the leftover shown', () => {
  it.each(LEAKS)('"%s"', (text, left) => {
    for (const uri of [undefined, BY]) {
      const s = st(text, uri);
      expect(idOf(text, uri), text).toBeUndefined();
      expect(s.spdx, text).toBeUndefined();
      expect(['restricted', 'extra-text']).toContain(s.conflict);
      expect(s.leftover, text).toContain(left);
    }
    const f = licFindings(text);
    const rules = f.map((x) => x.ruleId);
    expect(rules.some((r) => r === 'LIC-ADDED-CONDITIONS' || r === 'LIC-EXTRA-TEXT'), text).toBe(true);
    expect(f.find((x) => x.ruleId === 'LIC-ADDED-CONDITIONS' || x.ruleId === 'LIC-EXTRA-TEXT')!.params?.rest, text).toContain(left);
  });

  it('a marker in the leftover is ADDED-CONDITIONS, other text is EXTRA-TEXT', () => {
    expect(licFindings('CC BY 4.0, commercial use allowed on request').map((f) => f.ruleId)).toEqual(['LIC-ADDED-CONDITIONS']);
    expect(licFindings('CC BY 4.0 NC').map((f) => f.ruleId)).toEqual(['LIC-ADDED-CONDITIONS']);
    expect(licFindings('CC BY 4.0. Please contact the PI before publication.').map((f) => f.ruleId)).toEqual(['LIC-EXTRA-TEXT']);
  });

  it('nc / nd / sa as tokens of their own are conditions in any case; inside the licence name they are the licence', () => {
    for (const t of ['CC BY 4.0 nc', 'CC BY 4.0 Nd', 'CC BY 4.0, SA', 'CC BY 3.0 NC']) expect(st(t).conflict, t).toBe('restricted');
    expect(idOf('CC BY-NC-SA 4.0')).toBe('CC-BY-NC-SA-4.0');
    expect(idOf('CC BY-ND 4.0')).toBe('CC-BY-ND-4.0');
  });

  it('the leftover is shown by the page and by /check in all four languages, without "OK / allowed / valid"', () => {
    for (const text of ['CC BY 4.0. Please contact the PI before publication.', 'CC BY 4.0, commercial use allowed on request']) {
      const a = analyseLicences([rec(text)]);
      expect(a.contradictions).toHaveLength(1);
      const [f] = licFindings(text);
      for (const lang of LANGS) {
        const out = renderPlain(f, lang);
        expect(out, lang).toMatch(/PI before publication|on request/);
      }
    }
    const extra = RULES.find((r) => r.id === 'LIC-EXTRA-TEXT')!;
    expect(extra.plain.en).toContain('{rest}');
    expect((extra.citations ?? []).length).toBeGreaterThan(0);
    for (const lang of LANGS) expect(extra.plain[lang]).not.toMatch(/\b(OK|allowed|valid|green|erlaubt|gültig|autorisé|dozwolon|zgodn)\b/i);
  });
});

describe('the leftover is shown as written, filler words inside it included', () => {
  it.each([
    ['Use under CC BY 4.0, cite the dataset.', 'cite the dataset'],
    ['CC BY 4.0, but not for commercial use', 'but not for commercial use'],
    ['Data under CC BY 4.0, on request of the author CC BY 4.0', 'on request of the author'],
  ])('"%s" -> «%s»', (text, left) => {
    expect(st(text).leftover).toBe(left);
  });
});

describe('neutral wording stays the proper id with no ADDED / EXTRA finding', () => {
  const STAY: [string, string][] = [
    ['CC BY 4.0. You are free to share and adapt the material for any purpose, even commercially.', 'CC-BY-4.0'],
    ['CC BY 4.0 — Nutzung für beliebige Zwecke, sogar kommerziell.', 'CC-BY-4.0'],
    ['CC BY 4.0 : pour toute utilisation, y compris commerciale.', 'CC-BY-4.0'],
    ['CC BY 4.0 – w dowolnym celu, nawet komercyjnym.', 'CC-BY-4.0'],
    ['CC BY 4.0, for any purpose, even commercially', 'CC-BY-4.0'],
    ['CC BY 4.0, some rights reserved', 'CC-BY-4.0'],
    ['CC BY 4.0 — no additional restrictions', 'CC-BY-4.0'],
    ['CC BY 4.0 without restrictions', 'CC-BY-4.0'],
    ['CC BY 4.0 (commercial use permitted)', 'CC-BY-4.0'],
    ['CC BY 4.0, no limitations.', 'CC-BY-4.0'],
    ['CC BY 4.0, but please cite.', 'CC-BY-4.0'],
    ['© Ocean Data Limited, CC BY 4.0', 'CC-BY-4.0'],
    ['(c) 2024 Ocean Data Limited; CC BY 4.0', 'CC-BY-4.0'],
    ['Copyright 2024 Example Institute. Licensed under CC BY 4.0.', 'CC-BY-4.0'],
    ['CC BY 4.0 2024-10-12', 'CC-BY-4.0'],
    ['This dataset is licensed under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/).', 'CC-BY-4.0'],
    ['Dieser Datensatz ist unter CC BY 4.0 lizenziert (https://doi.org/10.1234/abc).', 'CC-BY-4.0'],
    ['Ce jeu de données est publié sous licence CC BY 4.0, voir https://creativecommons.org/licenses/by/4.0/', 'CC-BY-4.0'],
    ['Ten zbiór danych jest udostępniony na licencji CC BY 4.0', 'CC-BY-4.0'],
    ['Data are available under CC0 1.0.', 'CC0-1.0'],
    ['Namensnennung - Nicht kommerziell 4.0 International', 'CC-BY-NC-4.0'],
    ['Uznanie autorstwa – Bez utworów zależnych 4.0 Międzynarodowe', 'CC-BY-ND-4.0'],
    ["Attribution - Pas d'Utilisation Commerciale 4.0 International", 'CC-BY-NC-4.0'],
    ['Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International', 'CC-BY-NC-SA-4.0'],
    ['CC BY 3.0 Germany', 'CC-BY-3.0-DE'],
    ['The MIT License (MIT)', 'MIT'],
    ['Norwegian Licence for Open Government Data (NLOD) 2.0', 'NLOD-2.0'],
    ['CC0 1.0 Universal (CC0 1.0) Public Domain Dedication', 'CC0-1.0'],
  ];
  it.each(STAY)('"%s" -> %s', (text, id) => {
    for (const uri of [undefined, ...(id === 'CC-BY-4.0' ? [BY] : [])]) {
      const s = st(text, uri);
      expect(s.conflict, text).toBeUndefined();
      expect(idOf(text, uri), text).toBe(id);
    }
    expect(licFindings(text).map((f) => f.ruleId), text).not.toContain('LIC-ADDED-CONDITIONS');
    expect(licFindings(text).map((f) => f.ruleId), text).not.toContain('LIC-EXTRA-TEXT');
  });

  it('a copyright fragment that carries a restriction is not swallowed as a holder name', () => {
    expect(st('© Ocean Data Limited, no commercial use. CC BY 4.0').conflict).toBe('restricted');
    expect(st('© Ocean Data Limited all rights reserved, CC BY 4.0').conflict).toBe('restricted');
  });
});

describe('precedence', () => {
  it('readings that differ win over the leftover (AMBIGUOUS / TEXT-URI); with agreeing readings the leftover decides', () => {
    expect(st('CC BY 4.0 (CC BY-NC), on request').conflict).toBe('readings');
    expect(st('CC BY-NC 4.0, on request', BY).conflict).toBe('text-uri');
    expect(st('CC BY 4.0, on request', BY).conflict).toBe('extra-text');
    expect(st('CC BY 4.0, but not for commercial use', BY).conflict).toBe('restricted');
  });
  it('a text that names no licence is unrecognised as before and gets no leftover', () => {
    const s = st('Open Access');
    expect(s.conflict).toBeUndefined();
    expect(s.leftover).toBeUndefined();
    expect(st('Open Access', BY).spdx).toBe('CC-BY-4.0');
  });
});

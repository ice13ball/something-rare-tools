// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// L4 and L5 of the 18.11 audit: correct wordings are recognised, and the fix hint never invents a licence. Invented records only.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { fixListRow } from '../../src/core/collection/fixlist';
import { buildStatement, classifyStatement, familyNamed, isAllRightsReserved, toSpdx } from '../../src/core/metadata/licence';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { renderPlain, renderTechnical } from '../../src/core/report';
import { LANGS, type Finding, type Lang } from '../../src/core/types';

const BY = 'https://creativecommons.org/licenses/by/4.0/';
const NC = 'https://creativecommons.org/licenses/by-nc/4.0/';

const dc = (rights: { rights?: string; rightsUri?: string; rightsIdentifier?: string }[]) =>
  parseDataciteJson({ data: { attributes: { doi: '10.0000/invented.1', rightsList: rights } } }, 'dc');
const run = (rights: { rights?: string; rightsUri?: string; rightsIdentifier?: string }[]): Finding[] =>
  checkLicence([dc(rights)], { label: 'dc', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'));
const ids = (rights: { rights?: string; rightsUri?: string; rightsIdentifier?: string }[]): string[] => run(rights).map((f) => f.ruleId);
const cls = (text?: string, uri?: string) => classifyStatement(buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!);

describe('L4: correct wordings next to the right link are not flagged', () => {
  it.each([
    ['This work is licensed under a Creative Commons Attribution 4.0 International License.', BY],
    ['This content is licensed under a Creative Commons Attribution 4.0 International License.', BY],
    ['This dataset is licensed under a Creative Commons Attribution 4.0 International License.', BY],
    ['This data is licensed under a Creative Commons Attribution 4.0 International License.', BY],
    ['This work is licensed under the Creative Commons Attribution 4.0 International License', BY],
    ['CC BY version 4.0', BY],
    ['CC-BY v4.0', BY],
    ['CC BY 4.0 DEED', BY],
    ['CC BY–NC 4.0', NC],
    ['CC BY‑NC 4.0', NC],
  ])('"%s" with its link raises nothing', (text, uri) => {
    expect(ids([{ rights: text, rightsUri: uri }])).toEqual([]);
  });

  it.each([
    ['This work is licensed under a Creative Commons Attribution 4.0 International License.', 'CC-BY-4.0'],
    ['CC BY version 4.0', 'CC-BY-4.0'],
    ['CC-BY v4.0', 'CC-BY-4.0'],
    ['CC BY 4.0 DEED', 'CC-BY-4.0'],
    ['CC BY–NC 4.0', 'CC-BY-NC-4.0'],
    ['ODbL 1.0', 'ODbL-1.0'],
    ['Open Data Commons Open Database License (ODbL) v1.0', 'ODbL-1.0'],
    ['ODbL v1.0', 'ODbL-1.0'],
  ])('"%s" alone is recognised as %s', (text, id) => {
    expect(toSpdx(text, undefined)).toBe(id);
    expect(ids([{ rights: text }])).not.toContain('LIC-EXTRA-TEXT');
  });

  it('the ODbL wordings with the ODbL link are recognised too', () => {
    const uri = 'https://opendatacommons.org/licenses/odbl/1-0/';
    expect(ids([{ rights: 'ODbL 1.0', rightsUri: uri }])).toEqual([]);
    expect(ids([{ rights: 'Open Data Commons Open Database License (ODbL) v1.0', rightsUri: uri }])).toEqual([]);
  });
});

describe('L4: recognising a wording more loosely never turns it into a different licence', () => {
  it('"CC BY-SA version 4.0" is BY-SA, not BY', () => {
    expect(toSpdx('CC BY-SA version 4.0', undefined)).toBe('CC-BY-SA-4.0');
    expect(toSpdx('This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License.', undefined)).toBe('CC-BY-SA-4.0');
  });
  it('ODbL and ODC-By stay different', () => {
    expect(toSpdx('ODbL 1.0', undefined)).toBe('ODbL-1.0');
    expect(toSpdx('ODC-By 1.0', undefined)).toBe('ODC-By-1.0');
    expect(toSpdx('Open Data Commons Attribution License v1.0', undefined)).toBe('ODC-By-1.0');
  });
  it('a correct sentence next to the wrong link is still a conflict', () => {
    expect(ids([{ rights: 'This work is licensed under a Creative Commons Attribution 4.0 International License.', rightsUri: NC }])).toContain('LIC-TEXT-URI-CONFLICT');
    expect(ids([{ rights: 'CC BY version 4.0', rightsUri: NC }])).toContain('LIC-TEXT-URI-CONFLICT');
  });
  it('real extra content still flags', () => {
    expect(ids([{ rights: 'This work is licensed under a Creative Commons Attribution 4.0 International License. Contact the PI before use.', rightsUri: BY }])).not.toEqual([]);
    expect(ids([{ rights: 'CC BY 4.0, but not for commercial use', rightsUri: BY }])).not.toEqual([]);
  });
  it('ODbL 1.1 is not read as 1.0', () => {
    expect(toSpdx('ODbL 1.1', undefined)).not.toBe('ODbL-1.0');
    expect(toSpdx('ODbL v1.10', undefined)).not.toBe('ODbL-1.0');
  });
  it('a work-in-progress or non-commercial remark next to CC BY 4.0 still flags', () => {
    expect(ids([{ rights: 'CC BY 4.0 work in progress, not for commercial use', rightsUri: BY }])).not.toEqual([]);
  });
  it('a dash between names does not merge two licences', () => {
    expect(cls('CC BY–ND 4.0').kind).toBe('spdx');
    expect(toSpdx('CC BY–ND 4.0', undefined)).toBe('CC-BY-ND-4.0');
  });
});

const hintOf = (f: Finding) => String(f.params.hint ?? '');
const freeText = (rights: string): Finding => {
  const f = run([{ rights }]).find((x) => x.ruleId === 'LIC-FREE-TEXT');
  expect(f, `LIC-FREE-TEXT for "${rights}"`).toBeDefined();
  return f!;
};

describe('L5: the fix hint never invents a licence', () => {
  it.each(['Some rights reserved by the institute', 'Open data', 'See the project website', 'Free to use'])('"%s" gets no licence id as a hint', (text) => {
    const f = freeText(text);
    expect(hintOf(f)).toBe('');
    for (const lang of LANGS) expect(renderPlain(f, lang)).not.toMatch(/CC BY 4\.0/);
  });

  it('a recognised but incomplete licence names its own family, never another licence', () => {
    const f = freeText('CC BY-NC');
    expect(hintOf(f)).not.toBe('CC-BY-4.0');
    expect(hintOf(f)).not.toMatch(/^CC-BY-4/);
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t).not.toMatch(/CC BY 4\.0/);
      expect(t).toMatch(/CC BY-NC/);
    }
  });

  it('"CC BY-SA" without a version never suggests CC BY', () => {
    const f = freeText('CC BY-SA');
    for (const lang of LANGS) expect(renderPlain(f, lang)).not.toMatch(/CC BY 4\.0|CC-BY-4/);
  });

  it('LIC-MISSING does not name a licence as an example either', () => {
    const f = checkLicence([parseDataciteJson({ data: { attributes: { doi: '10.0000/invented.3' } } }, 'dc')], { label: 'dc', inaccessible: false }).find((x) => x.ruleId === 'LIC-MISSING')!;
    for (const lang of LANGS) expect(renderPlain(f, lang)).not.toMatch(/CC BY 4\.0/);
  });

  it('/collection: suggested_fix is empty for an unrecognised free text and never an id the record does not state', () => {
    for (const text of ['Some rights reserved by the institute', 'All rights reserved', 'Open Access', 'CC BY-NC', 'CC BY-SA']) {
      const row = fixListRow('rec-1', freeText(text), 'en', 'doi-list');
      expect(row, text).not.toMatch(/CC[ -]BY[ -]4/i);
      expect(row, text).not.toMatch(/CC-BY-4\.0/);
    }
    // the suggested_fix column (6th) is empty for an unrecognised text
    const cols = fixListRow('rec-1', freeText('Some rights reserved by the institute'), 'en', 'doi-list');
    expect(cols).toMatch(/,,[^,]*$/);
  });
});

describe('Decision 2: "All rights reserved" and a bare "Open Access" have their own sentences', () => {
  const sentences = (rights: string): Record<Lang, string> => {
    const f = freeText(rights);
    return Object.fromEntries(LANGS.map((l) => [l, renderPlain(f, l)])) as Record<Lang, string>;
  };
  const generic = sentences('Some rights reserved by the institute');

  it('both stay warnings of LIC-FREE-TEXT', () => {
    expect(freeText('All rights reserved').severity).toBe('warning');
    expect(freeText('Open Access').severity).toBe('warning');
    expect(freeText('All rights reserved.').ruleId).toBe('LIC-FREE-TEXT');
    expect(freeText('open access').ruleId).toBe('LIC-FREE-TEXT');
  });

  it('All rights reserved: a deliberate choice, no reuse without permission, no licence id', () => {
    const s = sentences('All rights reserved');
    for (const lang of LANGS) {
      expect(s[lang]).not.toBe(generic[lang]);
      expect(s[lang]).not.toMatch(/CC BY 4\.0/);
    }
    expect(s.en).toMatch(/deliberate/i);
    expect(s.en).toMatch(/permission/i);
    expect(s.en).not.toMatch(/cannot read|programs/i);
  });

  it('Open Access: how the data is reached, not under which terms; asks for the licence', () => {
    const s = sentences('Open Access');
    for (const lang of LANGS) {
      expect(s[lang]).not.toBe(generic[lang]);
      expect(s[lang]).not.toMatch(/CC BY 4\.0/);
    }
    expect(s.en).toMatch(/how the data can be reached/i);
    expect(s.en).toMatch(/licence/i);
  });

  it.each(['All rights reserved', 'ALL RIGHTS RESERVED.', 'all rights reserved', 'Alle Rechte vorbehalten', 'Tous droits réservés', 'Wszelkie prawa zastrzeżone', 'Open Access', 'open access', 'Open-Access', 'OpenAccess'])(
    '"%s" gets its own sentence',
    (text) => {
      const s = sentences(text);
      expect(s.en).not.toBe(generic.en);
    },
  );

  it('a longer text that merely contains the words is not one of the two', () => {
    const s = sentences('Open Access to be decided with the data steward');
    const other = sentences('Some rights reserved by the institute');
    expect(s.en).toContain('Open Access to be decided with the data steward');
    expect(s.en.replace('Open Access to be decided with the data steward', '')).toBe(other.en.replace('Some rights reserved by the institute', ''));
  });

  it('All rights reserved next to a real licence keeps the existing behaviour (no free-text finding)', () => {
    const r = run([{ rights: 'All rights reserved' }, { rights: 'Creative Commons Attribution 4.0 International', rightsUri: BY }]);
    expect(r.map((f) => f.ruleId)).not.toContain('LIC-FREE-TEXT');
  });
});

describe('T3 fix round: the quoted text, its kind and its hint come from the same entry', () => {
  const order1 = [{ rights: 'All rights reserved' }, { rights: 'CC BY 4.0' }];
  const order2 = [{ rights: 'CC BY 4.0' }, { rights: 'All rights reserved' }];

  it.each([
    ['ARR first', order1],
    ['ARR second', order2],
  ])('%s: quote, kind and hint belong together', (_n, rights) => {
    const f = freeText2(rights);
    const quoted = String(f.params.text);
    if (f.params.kind === 'id') {
      expect(quoted).toMatch(/CC BY 4\.0/);
      expect(f.params.hint).toBe('CC-BY-4.0');
    } else {
      expect(quoted).toBe('All rights reserved');
      expect(f.params.kind).toBe('arr');
      expect(hintOf(f)).toBe('');
      expect(renderPlain(f, 'en')).not.toMatch(/CC-BY-4\.0/);
    }
  });

  it('the result does not depend on the order of the entries, and the CSV row agrees with the sentence', () => {
    const a = freeText2(order1);
    const b = freeText2(order2);
    expect(a.params).toEqual(b.params);
    for (const f of [a, b]) {
      const row = fixListRow('rec-1', f, 'en', 'doi-list');
      if (f.params.kind === 'id') expect(row).toContain('CC-BY-4.0');
      else expect(row).not.toContain('CC-BY-4.0');
      // the quoted text in the sentence is the entry the hint was read from
      const t = renderPlain(f, 'en');
      if (f.params.kind === 'id') expect(t).toContain('"CC BY 4.0"');
      else expect(t).toContain('"All rights reserved"');
    }
  });
});

function freeText2(rights: { rights?: string; rightsUri?: string }[]): Finding {
  const f = run(rights).find((x) => x.ruleId === 'LIC-FREE-TEXT');
  expect(f).toBeDefined();
  return f!;
}

describe('T3 fix round: "All rights reserved" in its usual wordings', () => {
  it.each([
    '© 2021 Institute. All rights reserved.',
    'Copyright Institute, all rights reserved',
    'Copyright 2021 Institute. All rights reserved.',
    '(c) 2021 The Institute, All Rights Reserved',
    '© Institute — All rights reserved',
    'Copyright (c) 2020-2021 Institute of Things. All rights reserved',
    '© 2021 Institut. Alle Rechte vorbehalten.',
    'Copyright 2021 Institut, alle Rechte vorbehalten',
    '© 2021 Institut. Tous droits réservés.',
    'Copyright Institut, tous droits réservés',
    '© 2021 Instytut. Wszelkie prawa zastrzeżone.',
    'Copyright Instytut, wszelkie prawa zastrzeżone',
    'Copyright 2021 Instytut. Wszystkie prawa zastrzeżone',
  ])('"%s" is read as All rights reserved', (text) => {
    expect(isAllRightsReserved(text)).toBe(true);
    const f = freeText2([{ rights: text }]);
    expect(f.params.kind).toBe('arr');
    expect(renderPlain(f, 'en')).toMatch(/deliberate/i);
  });

  it.each([
    'Some rights reserved',
    'All rights reserved, except for research use',
    'All rights reserved. Contact the PI for licensing: CC BY 4.0 for teaching',
    '© 2021 Institute. Data may be reused with permission',
    '© 2021 Institute',
    'Copyright Institute',
  ])('"%s" is not read as All rights reserved', (text) => {
    expect(isAllRightsReserved(text)).toBe(false);
  });
});

describe('T3 fix round: the technical line', () => {
  it.each(['All rights reserved', 'Open Access', 'Some rights reserved by the institute'])('"%s": no empty "Identifier read from the text: ."', (text) => {
    const t = renderTechnical(freeText2([{ rights: text }]));
    expect(t).not.toMatch(/read from the text:\s*\./);
    expect(t).not.toMatch(/Identifier read/);
  });
  it('an id is called an identifier, a versionless result a family', () => {
    expect(renderTechnical(freeText2([{ rights: 'CC BY-NC' }]))).toMatch(/Family read from the text \(no version\): CC BY-NC\./);
    expect(renderTechnical(freeText2([{ rights: 'CC BY 4.0' }]))).toMatch(/Identifier read from the text: CC-BY-4\.0\./);
  });
});

describe('T3 fix round: underscores between licence name parts', () => {
  it.each([
    ['CC_BY_NC_4.0', 'CC-BY-NC-4.0'],
    ['CC_BY_SA_4.0', 'CC-BY-SA-4.0'],
    ['CC_BY_ND_4.0', 'CC-BY-ND-4.0'],
    ['CC_BY_NC_SA_4.0', 'CC-BY-NC-SA-4.0'],
    ['CC_BY_NC_ND_4.0', 'CC-BY-NC-ND-4.0'],
    ['cc_by_nc_4.0', 'CC-BY-NC-4.0'],
    ['CC-BY_NC-4.0', 'CC-BY-NC-4.0'],
    ['CC_BY_4.0', 'CC-BY-4.0'],
  ])('"%s" is %s', (text, id) => {
    expect(toSpdx(text, undefined)).toBe(id);
  });
  it.each(['CC_BY_NC', 'CC_BY_SA', 'CC_BY_ND', 'CC_BY_NC_SA', 'CC_BY_NC_ND', 'cc_by_nc'])('"%s" (no version) never reads as a plain CC BY', (text) => {
    expect(familyNamed(text)).not.toBe('CC BY');
    const f = freeText2([{ rights: text }]);
    expect(f.params.hint).not.toBe('CC BY');
    expect(String(f.params.hint)).not.toBe('CC-BY-4.0');
  });
  it('"CC_BY_NC_4.0" next to the NC link raises nothing ambiguous', () => {
    expect(ids([{ rights: 'CC_BY_NC_4.0', rightsUri: NC }])).not.toContain('LIC-AMBIGUOUS');
  });
});

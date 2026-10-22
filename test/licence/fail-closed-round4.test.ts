// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Round 4 of the fail-closed licence classifier (points 1-6): a link must not win over a text that names no licence; the copyright
// notice, dates, "see ..." references, foreign links/DOIs and symbols are leftover, never silently neutral.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { buildStatement, classifyStatement } from '../../src/core/metadata/licence';
import { renderPlain } from '../../src/core/report';
import { RULES } from '../../src/core/rules/registry';
import { LANGS, type MetadataRecord } from '../../src/core/types';
import { BY, FLAGS, STAYS } from './round4-cases';

const st = (text: string, uri?: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text, uri })!;
const rec = (text: string, uri?: string): MetadataRecord => ({ source: 'datacite', label: 'rec', licences: [st(text, uri)], restrictionCodes: [], distributionLinks: [] });
const licFindings = (text: string, uri?: string) => checkLicence([rec(text, uri)], { label: 'rec', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'));
const RULE_OF = { 'text-uri': 'LIC-TEXT-URI-CONFLICT', restricted: 'LIC-ADDED-CONDITIONS', 'extra-text': 'LIC-EXTRA-TEXT' } as const;

describe('round 4: every case is unrecognised and carries the finding with the leftover shown', () => {
  it.each(FLAGS)('point %i: "%s" (%s) -> %s', (_point, text, uri, conflict, left) => {
    const s = st(text, uri);
    expect(classifyStatement(s), text).toEqual({ kind: 'unrecognised' });
    expect(s.spdx, text).toBeUndefined();
    // ADDED-CONDITIONS (a restriction marker in the leftover) and EXTRA-TEXT (anything else) differ only by that marker
    expect(s.conflict, text).toBe(conflict);
    if (conflict !== 'text-uri') expect(s.leftover, text).toContain(left);
    const found = licFindings(text, uri);
    expect(found.map((f) => f.ruleId), text).toEqual([RULE_OF[conflict]]);
    if (conflict !== 'text-uri') expect(found[0].params?.rest, text).toContain(left);
  });

  it('the finding for a text that names no licence says so in all four languages, without "OK / allowed / valid"', () => {
    const [f] = licFindings('Free for scientific use', BY);
    expect(f.ruleId).toBe('LIC-TEXT-URI-CONFLICT');
    const rule = RULES.find((r) => r.id === 'LIC-TEXT-URI-CONFLICT')!;
    for (const lang of LANGS) {
      expect(renderPlain(f, lang), lang).toContain('Free for scientific use');
      expect(rule.plain[lang], lang).not.toMatch(/\b(OK|allowed|valid|erlaubt|gültig|autorisé|dozwolon|zgodn)\b/i);
    }
    expect(rule.plain.en).toContain('does not name this licence and says something else');
  });
});

describe('round 4: what must stay the proper id', () => {
  it.each(STAYS)('point %i: "%s" (%s) -> %s', (_point, text, uri, expected) => {
    const s = st(text, uri);
    if (expected.endsWith(':family')) {
      // versionless "CC-BY" against a by/4.0 link: handled by the family comparison, as before this round
      expect(s.conflict, text).toBeUndefined();
      expect(s.spdx, text).toBe('CC-BY-4.0');
      return;
    }
    expect(s.conflict, text).toBeUndefined();
    expect(s.leftover, text).toBeUndefined();
    expect(classifyStatement(s), text).toEqual({ kind: 'spdx', id: expected });
    // (LIC-FREE-TEXT for a text without a link is another matter)
    for (const r of ['LIC-ADDED-CONDITIONS', 'LIC-EXTRA-TEXT', 'LIC-TEXT-URI-CONFLICT', 'LIC-AMBIGUOUS']) expect(licFindings(text, uri).map((f) => f.ruleId), text).not.toContain(r);
  });

  it('a versionless family that disagrees with the link is still a text-link conflict (SEANOE style)', () => {
    expect(st('CC-BY-NC-ND', 'https://creativecommons.org/licenses/by-nc-nd/4.0/').spdx).toBe('CC-BY-NC-ND-4.0');
    expect(st('CC-BY-NC-ND', BY).conflict).toBe('text-uri');
    expect(st('CC-BY', 'https://creativecommons.org/licenses/by-nc-nd/4.0/').conflict).toBe('text-uri');
  });

  it('a licence link in the text counts as a name: a different licence than the link is a conflict', () => {
    expect(st('https://creativecommons.org/licenses/by/4.0/', BY).spdx).toBe('CC-BY-4.0');
    expect(st('https://creativecommons.org/licenses/by-nc/4.0/', BY).spdx).toBeUndefined();
  });

  it('years are neutral inside a copyright notice only', () => {
    expect(st('© 2020 Ocean Data Ltd, CC BY 4.0').spdx).toBe('CC-BY-4.0');
    expect(st('CC BY 4.0, 2020').spdx).toBeUndefined();
    // a restriction marker in a notice keeps the notice out of the neutral part
    expect(st('© Ocean Data Limited all rights reserved, CC BY 4.0').conflict).toBe('restricted');
  });

  it('an eu-repo value that is not open access is not neutral', () => {
    expect(st('info:eu-repo/semantics/embargoedAccess', BY).conflict).toBe('text-uri');
    expect(st('info:eu-repo/semantics/closedAccess', BY).conflict).toBe('text-uri');
  });
});

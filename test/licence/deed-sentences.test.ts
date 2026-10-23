// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The Creative Commons deed's own sentences ("... but not in any way that suggests the licensor endorses you", "You may not apply legal
// terms ...", "No warranties are given") restate the licence: they are not conditions added to it. A statement whose only restriction
// markers are those sentences is LIC-EXTRA-TEXT ("check manually"), never LIC-ADDED-CONDITIONS, never a recognised id. The sentences are
// the public text of the CC 4.0 deed (creativecommons.org/licenses/by/4.0/deed.{en,pl,de,fr}), which is itself CC-licensed.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { buildStatement, classifyStatement } from '../../src/core/metadata/licence';
import type { MetadataRecord } from '../../src/core/types';

const st = (text: string, uri?: string) => buildStatement({ source: 'iso19139', field: 'useLimitation', text, uri })!;
const rec = (text: string): MetadataRecord => ({ source: 'iso19139', label: 'rec', licences: [st(text)], restrictionCodes: [], distributionLinks: [] });
const lic = (text: string) => checkLicence([rec(text)], { label: 'rec', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'));
const rules = (text: string): string[] => lic(text).map((f) => f.ruleId);
const idOf = (text: string): string | undefined => {
  const c = classifyStatement(st(text));
  return c.kind === 'spdx' ? c.id : undefined;
};

// the paragraph a catalogue (data.marine.ie) puts into useLimitation; every sentence after the first two is the CC 4.0 deed text
const MARINE =
  'A Creative Commons (CC) license is one of several public copyright licenses that enable the free distribution of an otherwise copyrighted work. ' +
  'A CC license is used when an author wants to give people the right to share, use, and build upon a work that they have created. ' +
  'Under Creative Commons CC BY 4.0 the following is granted: Rights Share — copy and redistribute the material in any medium or format; ' +
  'Adapt — remix, transform, and build upon the material for any purpose, even commercially. The licensor cannot revoke these freedoms as long as you follow the license terms. ' +
  'Requirements  Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. ' +
  'You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.  ' +
  'No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.';

describe('D1: CC deed sentences are not added conditions', () => {
  it('the Marine Institute paragraph: LIC-EXTRA-TEXT, check manually, no SPDX id; the leftover is still shown', () => {
    const f = lic(MARINE);
    expect(f.map((x) => x.ruleId)).toEqual(['LIC-EXTRA-TEXT']);
    expect(String(f[0].params.rest)).toContain('suggests the licensor endorses you or your use');
    expect(String(f[0].params.rest)).toContain('legally restrict others');
    expect(idOf(MARINE)).toBeUndefined(); // never a false standard id: the statement stays unrecognised
  });

  it.each([
    'CC BY 4.0, but not in any way that suggests the licensor endorses you or your use.',
    'CC BY 4.0. You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.',
    'CC BY 4.0. No warranties are given.',
    'CC BY 4.0. The license may not give you all of the permissions necessary for your intended use.',
    'CC BY 4.0; You do not have to comply with the license for elements of the material in the public domain or where your use is permitted by an applicable exception or limitation.',
    // pl, de, fr: the official deed wording
    'CC BY 4.0. Możesz to zrobić w dowolny, rozsądny sposób, o ile nie sugeruje to udzielania prze licencjodawcę poparcia dla Ciebie lub sposobu, w jaki wykorzystujesz ten utwór.',
    'CC BY 4.0. Nie możesz korzystać ze środków prawnych lub technologicznych, które ograniczają innych w korzystaniu z utworu na warunkach określonych w licencji.',
    'CC BY 4.0. Licencjodawca nie daje żadnych gwarancji.',
    'CC BY 4.0. Licencja może nie zapewniać wszystkich niezbędnych zgód dla niektórych użyć utworu.',
    'CC BY 4.0. Diese Angaben dürfen in jeder angemessenen Art und Weise gemacht werden, allerdings nicht so, dass der Eindruck entsteht, der Lizenzgeber unterstütze gerade Sie oder Ihre Nutzung besonders.',
    'CC BY 4.0. Sie dürfen keine zusätzlichen Klauseln oder technische Verfahren einsetzen, die anderen rechtlich irgendetwas untersagen, was die Lizenz erlaubt.',
    'CC BY 4.0. Es werden keine Garantien gegeben und auch keine Gewähr geleistet.',
    'CC BY 4.0. Die Lizenz verschafft Ihnen möglicherweise nicht alle Erlaubnisse, die Sie für die jeweilige Nutzung brauchen.',
    "CC BY 4.0. Vous devez indiquer ces informations par tous les moyens raisonnables, sans toutefois suggérer que l'Offrant vous soutient ou soutient la façon dont vous avez utilisé son Oeuvre.",
    "CC BY 4.0. Vous n'êtes pas autorisé à appliquer des conditions légales ou des mesures techniques qui restreindraient légalement autrui à utiliser l'Oeuvre dans les conditions décrites par la licence.",
    "CC BY 4.0. Aucune garantie n'est donnée.",
    'CC BY 4.0. Il se peut que la licence ne vous donne pas toutes les permissions nécessaires pour votre utilisation.',
  ])('%s', (text) => {
    expect(rules(text)).toEqual(['LIC-EXTRA-TEXT']);
    expect(idOf(text)).toBeUndefined();
  });

  it('a deed sentence next to a REAL added condition stays LIC-ADDED-CONDITIONS', () => {
    for (const text of [
      `${MARINE} Not for commercial use.`,
      'CC BY 4.0, but not in any way that suggests the licensor endorses you or your use. Only for research.',
      'CC BY 4.0. No warranties are given, but only for non-commercial use.',
      'CC BY 4.0. No warranties are given. Reuse requires written permission.',
      'CC BY 4.0 NC. No warranties are given.',
      'CC BY 4.0. Licencjodawca nie daje żadnych gwarancji. Tylko do użytku niekomercyjnego.',
    ]) {
      expect(rules(text), text).toEqual(['LIC-ADDED-CONDITIONS']);
      expect(idOf(text), text).toBeUndefined();
    }
  });

  it('a deed sentence that goes on is not the deed sentence: "No warranties are given for commercial reuse" keeps its markers', () => {
    expect(rules('CC BY 4.0. No warranties are given for commercial reuse.')).toEqual(['LIC-ADDED-CONDITIONS']);
    expect(rules('CC BY 4.0, but not in any way that suggests the licensor endorses you or your use of the data in publications without asking us.')).toEqual(['LIC-ADDED-CONDITIONS']);
  });

  it('does not touch what had no deed sentence: the same findings as before', () => {
    expect(rules('CC BY 4.0, but not for commercial use')).toEqual(['LIC-ADDED-CONDITIONS']);
    expect(rules('CC BY 4.0. Please contact the PI before publication.')).toEqual(['LIC-EXTRA-TEXT']);
    expect(idOf('CC BY 4.0')).toBe('CC-BY-4.0');
  });
});

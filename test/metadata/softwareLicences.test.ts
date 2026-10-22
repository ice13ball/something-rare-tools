// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { buildStatement, classifyStatement, isOpenLicence, KNOWN_LICENCES, spdxInfo, toSpdx } from '../../src/core/metadata/licence';

const IDS = [
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
];

describe('software licences', () => {
  it('all sixteen are in the list with the SPDX name and a canonical URL', () => {
    for (const id of IDS) {
      expect(KNOWN_LICENCES.some((l) => l.id === id), id).toBe(true);
      expect(spdxInfo(id)?.url, id).toMatch(/^https:\/\//);
    }
    expect(spdxInfo('MIT')?.name).toBe('MIT License');
    expect(spdxInfo('GPL-3.0-or-later')?.name).toBe('GNU General Public License v3.0 or later');
    expect(isOpenLicence('MIT')).toBe(true);
  });

  it('exact ids are read from text', () => {
    for (const id of IDS) expect(toSpdx(id), id).toBe(id);
  });

  it.each([
    ['MIT License', 'MIT'],
    ['The MIT License (MIT)', 'MIT'],
    ['MIT licence', 'MIT'],
    ['Apache License 2.0', 'Apache-2.0'],
    ['Apache License, Version 2.0', 'Apache-2.0'],
    ['Apache-2.0', 'Apache-2.0'],
    ['BSD 2-Clause "Simplified" License', 'BSD-2-Clause'],
    ['BSD 3-Clause "New" or "Revised" License', 'BSD-3-Clause'],
    ['ISC License', 'ISC'],
    ['Mozilla Public License 2.0', 'MPL-2.0'],
    ['Mozilla Public License, version 2.0', 'MPL-2.0'],
    ['GNU General Public License v2.0 only', 'GPL-2.0-only'],
    ['GNU General Public License v3.0 or later', 'GPL-3.0-or-later'],
    ['GNU Lesser General Public License v2.1 only', 'LGPL-2.1-only'],
    ['GNU Lesser General Public License v3.0 or later', 'LGPL-3.0-or-later'],
    ['GNU Affero General Public License v3.0 only', 'AGPL-3.0-only'],
    ['GNU Affero General Public License v3.0 or later', 'AGPL-3.0-or-later'],
  ])('official name "%s" is %s, and adds no conditions', (text, id) => {
    const s = buildStatement({ source: 'datacite', field: 'x', text })!;
    expect(s.conflict, text).toBeUndefined();
    expect(classifyStatement(s)).toEqual({ kind: 'spdx', id });
  });

  it.each([
    ['https://opensource.org/licenses/MIT', 'MIT'],
    ['https://opensource.org/license/mit/', 'MIT'],
    ['https://opensource.org/licenses/Apache-2.0', 'Apache-2.0'],
    ['http://www.apache.org/licenses/LICENSE-2.0', 'Apache-2.0'],
    ['https://www.apache.org/licenses/LICENSE-2.0.html', 'Apache-2.0'],
    ['https://opensource.org/licenses/BSD-2-Clause', 'BSD-2-Clause'],
    ['https://opensource.org/licenses/BSD-3-Clause', 'BSD-3-Clause'],
    ['https://opensource.org/licenses/ISC', 'ISC'],
    ['https://opensource.org/licenses/MPL-2.0', 'MPL-2.0'],
    ['https://www.mozilla.org/MPL/2.0/', 'MPL-2.0'],
  ])('URI %s is %s', (uri, id) => {
    expect(toSpdx(undefined, uri)).toBe(id);
  });

  it('a GNU URL fits "only" and "or later" alike, so it names no single id; a text naming one of them agrees with it', () => {
    for (const uri of ['https://www.gnu.org/licenses/gpl-3.0.html', 'https://www.gnu.org/licenses/gpl-3.0-standalone.html', 'https://opensource.org/licenses/GPL-3.0']) {
      expect(toSpdx(undefined, uri), uri).toBeUndefined();
      expect(buildStatement({ source: 'datacite', field: 'x', uri })!.conflict).toBeUndefined();
      expect(toSpdx('GPL-3.0-or-later', uri), uri).toBe('GPL-3.0-or-later');
      expect(toSpdx('GNU General Public License v3.0 only', uri), uri).toBe('GPL-3.0-only');
    }
    expect(toSpdx('AGPL-3.0-only', 'https://www.gnu.org/licenses/agpl-3.0.html')).toBe('AGPL-3.0-only');
    expect(toSpdx('LGPL-2.1-or-later', 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html')).toBe('LGPL-2.1-or-later');
  });

  it('text and URI naming different software licences conflict; a GPL text against another GPL page conflicts too', () => {
    expect(buildStatement({ source: 'datacite', field: 'x', text: 'MIT License', uri: 'https://www.apache.org/licenses/LICENSE-2.0' })!.conflict).toBe('text-uri');
    expect(buildStatement({ source: 'datacite', field: 'x', text: 'GPL-2.0-only', uri: 'https://www.gnu.org/licenses/gpl-3.0.html' })!.conflict).toBe('text-uri');
    expect(buildStatement({ source: 'datacite', field: 'x', text: 'MIT License', uri: 'https://creativecommons.org/licenses/by/4.0/' })!.conflict).toBe('text-uri');
  });

  it('stays unrecognised: versionless GPL, a variant, the institute, other-licence ids', () => {
    for (const text of ['GPL', 'GNU General Public License', 'GPLv3', 'GPL-3.0', 'BSD-3-Clause-Clear', 'BSD licence', 'Massachusetts Institute of Technology (MIT)', '© MIT 2020', 'Admit it', 'MIT-0']) {
      expect(toSpdx(text), text).toBeUndefined();
    }
  });

  it('adding a condition to a software licence is still flagged', () => {
    expect(buildStatement({ source: 'datacite', field: 'x', text: 'MIT License, but not for commercial use' })!.conflict).toBe('restricted');
  });
});

describe('affirmative prose is not "added conditions"; negative prose still is', () => {
  const by = (text: string) => buildStatement({ source: 'iso19139', field: 'otherConstraints', text, uri: 'https://creativecommons.org/licenses/by/4.0/' })!;
  const named = (text: string) => buildStatement({ source: 'iso19139', field: 'otherConstraints', text })!;

  it.each([
    'CC BY 4.0. You are free to share and adapt the material for any purpose, even commercially.',
    'CC BY 4.0 — Nutzung für beliebige Zwecke, auch kommerziell.',
    'CC BY 4.0 : réutilisation à toutes fins, y compris commerciales.',
    'CC BY 4.0 – wykorzystanie w dowolnym celu, także komercyjnym.',
    'CC BY 4.0 (commercial use permitted)',
  ])('"%s" is CC-BY-4.0 with and without the link', (text) => {
    for (const s of [by(text), named(text)]) {
      expect(s.conflict, text).toBeUndefined();
      expect(classifyStatement(s)).toEqual({ kind: 'spdx', id: 'CC-BY-4.0' });
    }
  });

  it.each([
    'CC BY 4.0, but not for commercial use',
    'CC BY 4.0, commercial use prohibited',
    'CC BY 4.0, no commercial use',
    'CC BY 4.0, nur für nichtkommerzielle Zwecke',
    'CC BY 4.0, ohne Genehmigung keine Weitergabe',
    'CC BY 4.0, wymaga zgody autora',
    'CC BY 4.0 uniquement pour la recherche',
  ])('"%s" stays flagged', (text) => {
    expect(named(text).conflict, text).toBe('restricted');
  });
});

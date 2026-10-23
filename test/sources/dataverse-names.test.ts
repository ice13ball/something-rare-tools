// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Every licence name + link pair RepOD's file records carry (all 4557 published datasets, 23.10.2026): what the classifier makes of each.
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataverseVersion } from '../../src/core/metadata/dataverse';

const PAIRS: [string, string, string | null][] = [
  ['CC0 Creative Commons Zero 1.0 Waiver', 'https://creativecommons.org/publicdomain/zero/1.0/legalcode', 'CC0-1.0'],
  ['CC BY Creative Commons Attribution License 4.0', 'https://creativecommons.org/licenses/by/4.0/legalcode', 'CC-BY-4.0'],
  ['CC BY-SA Creative Commons Attribution - ShareAlike License 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/legalcode', 'CC-BY-SA-4.0'],
  ['CC BY-NC Creative Commons Attribution - NonCommercial License 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/legalcode', 'CC-BY-NC-4.0'],
  ['CC BY-NC-SA Creative Commons Attribution - NonCommercial - ShareAlike License 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode', 'CC-BY-NC-SA-4.0'],
  ['Open Data Commons Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1.0/index.html', null],
  ['MIT License', 'https://opensource.org/licenses/mit-license.php', null],
  // links the classifier does not read as an exact form, names that do not decide: unrecognised (fail-closed), never guessed
  ['GNU General Public License 3.0', 'https://www.gnu.org/licenses/gpl-3.0.en.html', null],
  ['CreativeML Open RAIL-M', 'https://huggingface.co/spaces/CompVis/stable-diffusion-license', null],
];

const doc = (file: Record<string, unknown>) => ({
  status: 'OK',
  data: { versionNumber: 1, versionMinorNumber: 0, versionState: 'RELEASED', metadataBlocks: { citation: { fields: [] } }, files: [{ label: 'a.csv', restricted: false, dataFile: { id: 1, filename: 'a.csv', filesize: 10 }, ...file }] },
});

describe('RepOD licence names', () => {
  for (const [name, uri, id] of PAIRS) {
    it(`${name}: ${id ?? 'unrecognised'}`, () => {
      const rec = parseDataverseVersion(doc({ termsOfUseType: 'LICENSE_BASED', licenseName: name, licenseUrl: uri }), 'x', { host: 'repod.icm.edu.pl', pid: 'doi:10.18150/X' })!.record;
      const c = analyseLicences([rec]).sources[0]!.statements[0]!.classification;
      expect(c.kind === 'spdx' ? c.id : null).toBe(id);
    });
  }

  it('"All rights reserved" is a statement (unrecognised), not an absent one; RESTRICTED is no licence statement', () => {
    const reserved = parseDataverseVersion(doc({ termsOfUseType: 'ALL_RIGHTS_RESERVED' }), 'x', { host: 'repod.icm.edu.pl', pid: 'doi:10.18150/X' })!.record;
    expect(reserved.licences).toHaveLength(1);
    expect(reserved.licences[0]!.text).toBe('All rights reserved');
    const a = analyseLicences([reserved]);
    expect(a.sources[0]!.statements[0]!.classification.kind).toBe('unrecognised');
    expect(a.missing).toBe(false);
    const restricted = parseDataverseVersion(doc({ termsOfUseType: 'RESTRICTED', restricted: true }), 'x', { host: 'repod.icm.edu.pl', pid: 'doi:10.18150/X' })!.record;
    expect(restricted.licences).toEqual([]);
  });
});

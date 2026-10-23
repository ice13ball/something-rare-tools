// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Every licence of Zenodo's own vocabulary that the classifier knows, written the way Zenodo writes it into DataCite (rights = title,
// rightsUri = url, rightsIdentifier = id in lower case, scheme SPDX) and into its own record, must be recognised as that licence:
// no LIC-* finding on /check and /collection (checkLicence), the same class on /licence (analyseLicences), machine-readable.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { parseDataciteJson } from '../../src/core/metadata/datacite';
import { KNOWN_LICENCES } from '../../src/core/metadata/licence';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { ZENODO_LICENCES } from '../../src/core/metadata/zenodo-licences';

const datacite = (z: { id: string; title: string; url: string }) =>
  parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.1', rightsList: [{ rights: z.title, rightsUri: z.url, rightsIdentifier: z.id.toLowerCase(), rightsIdentifierScheme: 'SPDX' }] } } }, 'dc');
const zenodoRecord = (z: { id: string; title: string; url: string }) =>
  parseZenodoRecord({ id: 1, metadata: { title: 't', license: { id: z.id.toLowerCase(), title: { en: z.title }, link: z.url } } }, 'zen');

describe('Zenodo licence vocabulary (generated table)', () => {
  it('holds only ids the classifier knows, once each', () => {
    const known = new Set(KNOWN_LICENCES.map((k) => k.id));
    expect(ZENODO_LICENCES.length).toBeGreaterThan(40);
    for (const z of ZENODO_LICENCES) expect(known.has(z.id), z.id).toBe(true);
    expect(new Set(ZENODO_LICENCES.map((z) => z.id)).size).toBe(ZENODO_LICENCES.length);
  });

  describe.each(ZENODO_LICENCES.map((z) => [z.id, z] as const))('%s', (_id, z) => {
    it('DataCite rights as Zenodo writes them: recognised, no LIC-* finding, same class on /licence', () => {
      const rec = datacite(z);
      expect(rec.licences).toHaveLength(1);
      expect(rec.licences[0].conflict, JSON.stringify(rec.licences[0])).toBeUndefined();
      expect(rec.licences[0].spdx).toBe(z.id);
      expect(checkLicence([rec], { label: 'x', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'))).toEqual([]);
      const a = analyseLicences([rec]);
      expect(a.sources[0].statements[0].classification).toEqual({ kind: 'spdx', id: z.id });
      expect(a.sources[0].statements[0].machineReadable).toBe(true);
      expect(a.contradictions).toEqual([]);
      expect(a.freeText).toBeUndefined();
    });
    it('Zenodo record as Zenodo writes it: recognised, no LIC-* finding', () => {
      const rec = zenodoRecord(z);
      expect(checkLicence([rec], { label: 'x', inaccessible: false }).filter((f) => f.ruleId.startsWith('LIC-'))).toEqual([]);
      expect(analyseLicences([rec]).sources[0].statements[0].classification).toEqual({ kind: 'spdx', id: z.id });
    });
  });
});

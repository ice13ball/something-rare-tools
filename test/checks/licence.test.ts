// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import type { Finding, MetadataRecord } from '../../src/core/types';
import { makeLicence, makeRecord } from '../helpers/build';

const ctx = { label: 'rec-1', inaccessible: false };
const run = (records: MetadataRecord[], inaccessible = false): Finding[] => checkLicence(records, { label: 'rec-1', inaccessible });
const ids = (f: Finding[]) => f.map((x) => x.ruleId);
const lic = (f: Finding[]) => f.filter((x) => x.ruleId.startsWith('LIC-'));
const withVersionAndExtent = { version: '1.0', temporalExtent: { start: '2020-01-01', end: '2020-02-01' } };

describe('checkLicence', () => {
  it('reports LIC-MISSING (error) once when nothing is stated in a record that was read', () => {
    const f = run([makeRecord('datacite')]);
    expect(f.filter((x) => x.ruleId === 'LIC-MISSING')).toHaveLength(1);
    expect(f.find((x) => x.ruleId === 'LIC-MISSING')).toMatchObject({ severity: 'error', file: 'rec-1' });
    expect(ids(lic(f))).toEqual(['LIC-MISSING']);
  });

  it('reports LIC-MISSING with no records at all and no META noise', () => {
    expect(ids(run([]))).toEqual(['LIC-MISSING']);
  });

  it('ignores metadataConstraints statements for the data licence', () => {
    const rec = makeRecord('iso19139', { licences: [makeLicence('iso19139', { field: 'metadataConstraints/useLimitation', text: 'CC BY 4.0', spdx: 'CC-BY-4.0' })] });
    expect(ids(lic(run([rec])))).toEqual(['LIC-MISSING']);
  });

  it('LIC-FREE-TEXT once per record, with the first text and versionMissing', () => {
    const recs = [
      makeRecord('iso19139', { licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'CC BY' })] }),
      makeRecord('datacite', { licences: [makeLicence('datacite', { field: 'rightsList[0]', text: 'CC-BY' })] }),
    ];
    const f = lic(run(recs));
    expect(ids(f)).toEqual(['LIC-FREE-TEXT']);
    expect(f[0]).toMatchObject({ severity: 'warning', file: 'rec-1', field: 'otherConstraints', params: { text: 'CC BY', versionMissing: 'yes' } });
  });

  it('versionMissing is "no" when a version number is present', () => {
    const rec = makeRecord('iso19139', { licences: [makeLicence('iso19139', { text: 'Use under CC-BY 4.0 terms' })] });
    expect(lic(run([rec]))[0].params).toMatchObject({ versionMissing: 'no' });
  });

  it('no LIC-FREE-TEXT when another source carries an spdx', () => {
    const recs = [
      makeRecord('iso19139', { licences: [makeLicence('iso19139', { text: 'CC BY 4.0', uri: 'https://creativecommons.org/licenses/by/4.0/', spdx: 'CC-BY-4.0' })] }),
      makeRecord('datacite', { licences: [makeLicence('datacite', { field: 'rightsList[0]', text: 'CC BY' })] }),
    ];
    expect(lic(run(recs))).toEqual([]);
  });

  it('prose with a version but no URI ("CC-BY 4.0") is still free text; versionMissing "no"', () => {
    const rec = makeRecord('iso19139', { licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'CC-BY 4.0', spdx: 'CC-BY-4.0' })] });
    const f = lic(run([rec]));
    expect(ids(f)).toEqual(['LIC-FREE-TEXT']);
    expect(f[0].params).toEqual({ text: 'CC-BY 4.0', versionMissing: 'no', hint: 'CC-BY-4.0' });
  });

  it('copyright next to an UNRECOGNISED "CC-BY" text gives only LIC-FREE-TEXT: no open licence is established to contradict', () => {
    const rec = makeRecord('iso19139', {
      licences: [makeLicence('iso19139', { field: 'otherConstraints', text: 'CC-BY' })],
      restrictionCodes: [{ kind: 'access', code: 'copyright' }, { kind: 'use', code: 'copyright' }, { kind: 'other', code: 'otherRestrictions' }],
    });
    const f = lic(run([rec]));
    expect(ids(f)).toEqual(['LIC-FREE-TEXT']);
  });

  it('the code "license" next to a CC licence is normal and does not conflict; otherRestrictions neither', () => {
    const rec = makeRecord('iso19139', {
      licences: [makeLicence('iso19139', { text: 'CC BY 4.0', uri: 'https://creativecommons.org/licenses/by/4.0/', spdx: 'CC-BY-4.0' })],
      restrictionCodes: [{ kind: 'use', code: 'license' }, { kind: 'other', code: 'otherRestrictions' }],
    });
    expect(lic(run([rec]))).toEqual([]);
  });

  it('a restrictive code with an spdx open licence conflicts; with no open licence it does not', () => {
    const open = makeRecord('iso19139', {
      licences: [makeLicence('iso19139', { spdx: 'ODbL-1.0', text: 'ODbL' })],
      restrictionCodes: [{ kind: 'use', code: 'patent' }, { kind: 'access', code: 'copyright' }],
    });
    expect(lic(run([open])).find((x) => x.ruleId === 'LIC-RESTRICTION-CONFLICT')?.params).toEqual({ codes: 'patent, copyright', licence: 'ODbL-1.0' });
    const closed = makeRecord('iso19139', {
      licences: [makeLicence('iso19139', { text: 'All rights reserved' })],
      restrictionCodes: [{ kind: 'use', code: 'copyright' }],
    });
    expect(ids(lic(run([closed])))).toEqual(['LIC-FREE-TEXT']);
  });

  it('LIC-DATACITE-EMPTY when DataCite has no licence but ISO states one', () => {
    const recs = [
      makeRecord('iso19139', { licences: [makeLicence('iso19139', { text: 'CC BY' })] }),
      makeRecord('datacite'),
    ];
    const f = lic(run(recs));
    expect(ids(f).sort()).toEqual(['LIC-DATACITE-EMPTY', 'LIC-FREE-TEXT']);
    expect(f.find((x) => x.ruleId === 'LIC-DATACITE-EMPTY')).toMatchObject({ severity: 'warning', params: { licence: 'CC BY' } });
  });

  it('no LIC-DATACITE-EMPTY when nobody states a licence (only LIC-MISSING)', () => {
    expect(ids(lic(run([makeRecord('datacite'), makeRecord('iso19139')])))).toEqual(['LIC-MISSING']);
  });

  it('Zenodo cc-by-4.0 + DataCite cc-by-4.0 gives no LIC-*', () => {
    const recs = [
      makeRecord('zenodo', { licences: [makeLicence('zenodo', { field: 'license.id', text: 'cc-by-4.0', spdx: 'CC-BY-4.0' })] }),
      makeRecord('datacite', { licences: [makeLicence('datacite', { field: 'rightsList[0]', text: 'Creative Commons Attribution 4.0 International', uri: 'https://creativecommons.org/licenses/by/4.0/legalcode', spdx: 'CC-BY-4.0' })] }),
    ];
    expect(lic(run(recs))).toEqual([]);
  });

  it('LIC-MISMATCH for two different spdx ids, once', () => {
    const recs = [
      makeRecord('zenodo', { licences: [makeLicence('zenodo', { spdx: 'CC-BY-4.0', text: 'cc-by-4.0' })] }),
      makeRecord('datacite', { licences: [makeLicence('datacite', { spdx: 'CC-BY-SA-4.0', text: 'cc-by-sa-4.0' })] }),
    ];
    const f = lic(run(recs));
    expect(ids(f)).toEqual(['LIC-MISMATCH']);
    expect(f[0].params).toEqual({ licenceA: 'CC-BY-4.0', licenceB: 'CC-BY-SA-4.0' });
  });

  it('CC-BY-4.0 in DataCite vs "CC BY" free text is not a mismatch', () => {
    const recs = [
      makeRecord('datacite', { licences: [makeLicence('datacite', { spdx: 'CC-BY-4.0' })] }),
      makeRecord('iso19139', { licences: [makeLicence('iso19139', { text: 'CC BY' })] }),
    ];
    expect(ids(lic(run(recs)))).toEqual([]);
  });

  it('META-EMPTY-LINK counts links with an empty url', () => {
    const rec = makeRecord('iso19139', {
      ...withVersionAndExtent,
      licences: [makeLicence('iso19139', { spdx: 'CC-BY-4.0' })],
      distributionLinks: [{ url: '' }, { url: 'https://example.org/a' }, { url: '' }],
    });
    const f = run([rec]);
    expect(ids(f)).toEqual(['META-EMPTY-LINK']);
    expect(f[0]).toMatchObject({ severity: 'warning', file: 'rec-1', params: { count: 2 } });
  });

  it('META-NO-VERSION and META-NO-EXTENT (info) when no record has them; either record suffices', () => {
    const base = { licences: [makeLicence('iso19139', { spdx: 'CC-BY-4.0' })] };
    const f = run([makeRecord('iso19139', base)]);
    expect(ids(f).sort()).toEqual(['META-NO-EXTENT', 'META-NO-VERSION']);
    expect(f.every((x) => x.severity === 'info')).toBe(true);
    const ok = run([makeRecord('iso19139', base), makeRecord('zenodo', { version: 'v2' }), makeRecord('datacite', { bbox: { west: 0, east: 1, south: 0, north: 1 }, licences: [makeLicence('datacite', { spdx: 'CC-BY-4.0' })] })]);
    expect(ids(ok)).toEqual([]);
    const onlyBbox = run([makeRecord('iso19139', { ...base, version: '1', bbox: { west: 0, east: 1, south: 0, north: 1 } })]);
    expect(ids(onlyBbox)).toEqual([]);
  });

  it('uses ctx.label as the file of every finding', () => {
    const f = checkLicence([makeRecord('datacite')], { ...ctx, label: 'my-record' });
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.file === 'my-record')).toBe(true);
  });
});

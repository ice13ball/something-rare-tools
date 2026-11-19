// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// L3 of the 18.11 audit: the access state of a Zenodo record (legacy access_right / InvenioRDM access) and of a PANGAEA dataset is said on /licence,
// like the held-back files of Dataverse. Invented records shaped like the API responses; no live calls.
import { describe, expect, it } from 'vitest';
import { accessFinding, checkLicence } from '../../src/core/checks/licence';
import { parsePangaeaMetainfo } from '../../src/core/metadata/pangaea';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { renderPlain } from '../../src/core/report';
import type { MetadataRecord } from '../../src/core/types';

const RULE = 'LIC-ACCESS-HELD-BACK';
const NOW = Date.parse('2026-11-19T12:00:00Z');
const legacy = (md: Record<string, unknown>): unknown => ({
  id: 2000001,
  doi: '10.0000/zenodo.2000001',
  links: { self_html: 'https://zenodo.org/records/2000001' },
  metadata: { title: 'Invented', access_right: 'open', license: { id: 'cc-by-4.0' }, ...md },
  files: [{ key: 'a.csv', size: 10, links: { self: 'https://zenodo.org/api/records/2000001/files/a.csv/content' } }],
});
const rdm = (access: Record<string, unknown>): unknown => ({
  id: '2000002',
  pids: { doi: { identifier: '10.0000/zenodo.2000002' } },
  metadata: { title: 'Invented RDM', rights: [{ id: 'cc-by-4.0', title: { en: 'Creative Commons Attribution 4.0 International' } }] },
  access: { record: 'public', files: 'public', ...access },
  files: { enabled: true, entries: { 'a.csv': { key: 'a.csv', size: 10 } } },
});
const found = (r: MetadataRecord) => checkLicence([r], { label: 'x', inaccessible: false }).filter((f) => f.ruleId === RULE);

describe('Zenodo access state', () => {
  it('legacy embargoed with a future date names the date', () => {
    const r = parseZenodoRecord(legacy({ access_right: 'embargoed', embargo_date: '2099-01-31' }), 'z', NOW);
    const f = found(r);
    expect(f).toHaveLength(1);
    expect(f[0]!.params).toMatchObject({ kind: 'embargoed', until: '2099-01-31' });
    expect(renderPlain(f[0]!, 'en')).toContain('2099-01-31');
  });
  it('an embargo date in the past is open (Zenodo lifts it): nothing said', () => {
    expect(found(parseZenodoRecord(legacy({ access_right: 'embargoed', embargo_date: '2020-01-31' }), 'z', NOW))).toEqual([]);
  });
  it('legacy embargoed without a date is still embargoed, no date', () => {
    const f = found(parseZenodoRecord(legacy({ access_right: 'embargoed' }), 'z', NOW));
    expect(f).toHaveLength(1);
    expect(f[0]!.params.kind).toBe('embargoed');
    expect(f[0]!.params.until).toBeUndefined();
  });
  it('legacy restricted and closed', () => {
    expect(found(parseZenodoRecord(legacy({ access_right: 'restricted' }), 'z', NOW))[0]!.params.kind).toBe('restricted');
    expect(found(parseZenodoRecord(legacy({ access_right: 'closed' }), 'z', NOW))[0]!.params.kind).toBe('closed');
  });
  it('InvenioRDM: active embargo, restricted files, restricted record', () => {
    expect(found(parseZenodoRecord(rdm({ files: 'restricted', embargo: { active: true, until: '2099-06-01', reason: null } }), 'z', NOW))[0]!.params).toMatchObject({ kind: 'embargoed', until: '2099-06-01' });
    expect(found(parseZenodoRecord(rdm({ files: 'restricted' }), 'z', NOW))[0]!.params.kind).toBe('restricted');
    expect(found(parseZenodoRecord(rdm({ record: 'restricted', files: 'restricted' }), 'z', NOW))[0]!.params.kind).toBe('restricted');
  });
  it('InvenioRDM: a lifted or past embargo, and a public record, say nothing', () => {
    expect(found(parseZenodoRecord(rdm({ embargo: { active: false, until: '2020-01-01' } }), 'z', NOW))).toEqual([]);
    expect(found(parseZenodoRecord(rdm({ files: 'restricted', embargo: { active: true, until: '2020-01-01' } }), 'z', NOW))).toEqual([]);
    expect(found(parseZenodoRecord(rdm({}), 'z', NOW))).toEqual([]);
  });
  it('open access gives nothing, and a record with no access field gives nothing', () => {
    expect(found(parseZenodoRecord(legacy({}), 'z', NOW))).toEqual([]);
    expect(found(parseZenodoRecord({ id: 1, metadata: { title: 't' } }, 'z', NOW))).toEqual([]);
  });
  it('the texts exist in all four languages and say what the licence does not do', () => {
    const f = found(parseZenodoRecord(legacy({ access_right: 'closed' }), 'z', NOW))[0]!;
    for (const l of ['en', 'pl', 'de', 'fr'] as const) expect(renderPlain(f, l)).not.toMatch(/\{|undefined/);
  });
});

describe('unreadable embargo date', () => {
  it('is an embargo without a date, in both shapes', () => {
    const l = found(parseZenodoRecord(legacy({ access_right: 'embargoed', embargo_date: 'until publication' }), 'z', NOW));
    expect(l).toHaveLength(1);
    expect(l[0]!.params).toMatchObject({ kind: 'embargoed' });
    expect(l[0]!.params.until).toBeUndefined();
    const r = found(parseZenodoRecord(rdm({ embargo: { active: true, until: 'soon' } }), 'z', NOW));
    expect(r).toHaveLength(1);
    expect(r[0]!.params.until).toBeUndefined();
  });
});

describe('PANGAEA access state (technicalInfo loginOption)', () => {
  const wrap = (inner: string): string => `<md:MetaData xmlns:md="http://www.pangaea.de/MetaData">${inner}</md:MetaData>`;
  const lic = (label: string, name: string, uri: string): string => `<md:license id="l1"><md:label>${label}</md:label><md:name>${name}</md:name><md:URI>${uri}</md:URI></md:license>`;
  const tech = (login: string | undefined): string => `<md:technicalInfo><md:entry key="status" value="published"/>${login === undefined ? '' : `<md:entry key="loginOption" value="${login}"/>`}</md:technicalInfo>`;
  const CCBY = lic('CC-BY-4.0', 'Creative Commons Attribution 4.0 International', 'https://creativecommons.org/licenses/by/4.0/');
  const UNKNOWN = lic('UNKNOWN', 'Licensing unknown: Please contact principal investigator/authors to gain access and request licensing terms', '');
  const all = (r: MetadataRecord) => checkLicence([r], { label: 'x', inaccessible: false });
  it('signup required is a login, even with a clean CC BY licence', () => {
    const f = found(parsePangaeaMetainfo(wrap(CCBY + tech('signup required')), 'p'));
    expect(f).toHaveLength(1);
    expect(f[0]!.params.kind).toBe('login');
  });
  it('access rights needed is restricted, and with an unknown licence it is the only finding about the access', () => {
    const r = parsePangaeaMetainfo(wrap(UNKNOWN + tech('access rights needed')), 'p');
    const f = found(r);
    expect(f).toHaveLength(1);
    expect(f[0]!.params.kind).toBe('restricted');
    // the licence text of such a record only repeats the access ("gain access"): no second finding says it
    expect(all(r).filter((x) => x.ruleId.startsWith('LIC-')).map((x) => x.ruleId)).toEqual([RULE]);
  });
  it('unrestricted or no loginOption says nothing', () => {
    expect(found(parsePangaeaMetainfo(wrap(CCBY + tech('unrestricted')), 'p'))).toEqual([]);
    expect(found(parsePangaeaMetainfo(wrap(CCBY + tech(undefined)), 'p'))).toEqual([]);
  });
  it('licence wording never decides the access', () => {
    expect(found(parsePangaeaMetainfo(wrap(lic('CC-BY-4.0', 'CC BY 4.0; login required, access is restricted', '') + tech('unrestricted')), 'p'))).toEqual([]);
  });
});

describe('accessFinding', () => {
  it('says it once for one record of the same state and not twice for the same record twice', () => {
    const r = parseZenodoRecord(legacy({ access_right: 'restricted' }), 'z', NOW);
    expect(accessFinding([r, r], 'dataset')).toBeDefined();
    expect(checkLicence([r, r], { label: 'x', inaccessible: false }).filter((f) => f.ruleId === RULE)).toHaveLength(1);
  });
});

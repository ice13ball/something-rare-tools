// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Two LOW findings of the 22.10 review: (5) a failed read is always visible as its own unreadable source, (6) a Zenodo concept DOI and
// a version DOI are one deposit even when the Zenodo record cannot be read, or the headline says it could not tell.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { LicencePage } from '../../src/app/pages/LicencePage';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildStatement } from '../../src/core/metadata/licence';
import { parseDataciteJson, parseDataciteXml } from '../../src/core/metadata/datacite';
import type { Fetcher } from '../../src/core/sources/fetcher';
import { MapFetcher } from '../sources/mapFetcher';
import { DC, ZEN, dataciteJson, zenodoJson } from '../helpers/licenceFixtures';
import { makeRecord } from '../helpers/build';
import { UI } from '../../src/core/i18n/ui';

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function run(fetcher: Fetcher, refs: string[], lang: 'en' | 'pl' | 'de' | 'fr' = 'en'): Promise<string> {
  setLang(lang);
  render(<LicencePage fetcherFor={() => fetcher} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: refs.join('\n') } });
  fireEvent.click(screen.getByRole('button', { name: /Compare licences|Porównaj licencje|Lizenzen vergleichen|Comparer les licences/ }));
  return (await waitFor(() => screen.getByTestId('licence-result'))).textContent ?? '';
}

const BY = { rightsIdentifier: 'cc-by-4.0' };
const lic = (text: string) => buildStatement({ source: 'datacite', field: 'rightsList[0]', text })!;

describe('point 5 - a failed read is never hidden behind another record of the same type', () => {
  it('analysis: Zenodo A read without a licence + Zenodo B failed = an unreadable source of its own, not "missing"', () => {
    const a = analyseLicences([makeRecord('zenodo', { label: 'Zenodo 100' })], { failures: [{ source: 'zenodo', ref: '200' }] });
    const failed = a.sources.filter((s) => s.state === 'unreadable');
    expect(failed.map((s) => [s.source, s.label])).toEqual([['zenodo', '200']]);
    expect(a.hasUnreadable).toBe(true);
    expect(a.missing).toBe(false);
  });
  it('two failed reads of the same source type are two unreadable sources', () => {
    const a = analyseLicences([], { failures: [{ source: 'datacite', ref: '10.1/a' }, { source: 'datacite', ref: '10.1/b' }, { source: 'datacite', ref: '10.1/a' }] });
    expect(a.sources.map((s) => s.label)).toEqual(['10.1/a', '10.1/b']);
  });
  it('the old `unreadable` option still skips a source of which a record is present', () => {
    const a = analyseLicences([makeRecord('datacite')], { unreadable: ['datacite'] });
    expect(a.sources).toHaveLength(1);
  });
  it('page: record A without a licence, record B answering 429 -> B is listed with its reference and the reason', async () => {
    const f = new MapFetcher({
      [ZEN + '100']: zenodoJson('100', { doi: '10.5281/zenodo.100', title: 'A' }),
      [DC + '10.5281/zenodo.100']: dataciteJson({ doi: '10.5281/zenodo.100' }, []),
      [ZEN + '200']: { status: 429 },
    });
    const text = await run(f, ['100', '200']);
    expect(text).toContain('could not read');
    expect(text).toContain('200');
    expect(text).toMatch(/busy|too many|rate/i);
    expect(text).toContain('At least one source could not be read');
  });
});

const related = (doi: string, type: 'IsVersionOf' | 'HasVersion') => ({ relatedIdentifier: doi, relatedIdentifierType: 'DOI', relationType: type });
const dcWithRelations = (doi: string, rel: ReturnType<typeof related>[]) => ({
  body: JSON.stringify({ data: { attributes: { doi, titles: [{ title: 'T' }], rightsList: [BY], relatedIdentifiers: rel } } }),
});

describe('point 6 - concept DOI and version DOI of one Zenodo deposit', () => {
  it('the DataCite parser keeps IsVersionOf / HasVersion DOIs, in JSON and in XML', () => {
    const j = parseDataciteJson({ data: { attributes: { doi: '10.5281/zenodo.101', relatedIdentifiers: [related('10.5281/zenodo.100', 'IsVersionOf'), { ...related('10.1/x', 'IsVersionOf'), relatedIdentifierType: 'URL' }, { ...related('10.5281/zenodo.55', 'IsPartOf' as never) }] } } }, 'l');
    expect(j.versionDois).toEqual(['10.5281/zenodo.100']);
    const xml = `<resource xmlns="http://datacite.org/schema/kernel-4"><identifier identifierType="DOI">10.5281/zenodo.100</identifier><relatedIdentifiers><relatedIdentifier relatedIdentifierType="DOI" relationType="HasVersion">10.5281/ZENODO.101</relatedIdentifier></relatedIdentifiers></resource>`;
    expect(parseDataciteXml(xml, 'l').versionDois).toEqual(['10.5281/zenodo.101']);
  });
  it('linked through the relations: one deposit group, no "two sources"', () => {
    const concept = makeRecord('datacite', { label: 'DataCite 10.5281/zenodo.100', doi: '10.5281/zenodo.100', versionDois: ['10.5281/zenodo.101'], licences: [lic('CC BY 4.0')] });
    const version = makeRecord('datacite', { label: 'DataCite 10.5281/zenodo.101', doi: '10.5281/zenodo.101', versionDois: ['10.5281/zenodo.100'], licences: [lic('CC BY 4.0')] });
    const a = analyseLicences([concept, version]);
    expect(a.groups).toHaveLength(1);
    expect(a.recognisedGroups).toBe(1);
    expect(a.maybeSameDeposit).toBe(false);
    // one-way links are enough
    expect(analyseLicences([{ ...concept, versionDois: undefined }, version]).groups).toHaveLength(1);
  });
  it('two version records of one concept join through the concept', () => {
    const v = (n: number) => makeRecord('datacite', { doi: `10.5281/zenodo.${n}`, label: `v${n}`, versionDois: ['10.5281/zenodo.100'], licences: [lic('CC BY 4.0')] });
    expect(analyseLicences([v(101), v(102)]).groups).toHaveLength(1);
  });
  it('NOT linked (no relation, Zenodo record unread): the analysis says it cannot tell', () => {
    const r = (n: number) => makeRecord('datacite', { doi: `10.5281/zenodo.${n}`, label: `d${n}`, licences: [lic('CC BY 4.0')] });
    const a = analyseLicences([r(100), r(200)]);
    expect(a.groups).toHaveLength(2);
    expect(a.maybeSameDeposit).toBe(true);
    // different DOI registrants are independent sources
    const other = makeRecord('datacite', { doi: '10.1594/pangaea.1', label: 'p', licences: [lic('CC BY 4.0')] });
    expect(analyseLicences([r(100), other]).maybeSameDeposit).toBe(false);
  });
  it('page, Zenodo records unreadable, relations present: one deposit, a single source', async () => {
    const f = new MapFetcher({
      [ZEN + '100']: { status: 429 },
      [ZEN + '101']: { status: 429 },
      [DC + '10.5281/zenodo.100']: dcWithRelations('10.5281/zenodo.100', [related('10.5281/zenodo.101', 'HasVersion')]),
      [DC + '10.5281/zenodo.101']: dcWithRelations('10.5281/zenodo.101', [related('10.5281/zenodo.100', 'IsVersionOf')]),
    });
    const text = await run(f, ['10.5281/zenodo.100', '10.5281/zenodo.101']);
    expect(text).toContain('Single source — nothing to compare');
    expect(text).not.toContain('No contradiction among 2');
  });
  it('page, relations missing: the headline carries the caveat in all four languages', async () => {
    for (const lang of ['en', 'pl', 'de', 'fr'] as const) {
      cleanup();
      const f = new MapFetcher({
        [ZEN + '100']: { status: 429 },
        [ZEN + '101']: { status: 429 },
        [DC + '10.5281/zenodo.100']: dataciteJson({ doi: '10.5281/zenodo.100' }, [BY]),
        [DC + '10.5281/zenodo.101']: dataciteJson({ doi: '10.5281/zenodo.101' }, [BY]),
      });
      const text = await run(f, ['10.5281/zenodo.100', '10.5281/zenodo.101'], lang);
      const want = UI[lang]['licence.summary.noneMaybeSame'].replace('{n}', '2');
      expect(text, lang).toContain(want);
    }
  });
});

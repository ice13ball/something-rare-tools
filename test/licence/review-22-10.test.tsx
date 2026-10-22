// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// Second 22.10 review of the licence module: one test per reviewer case (points 1-11). The overriding principle: when in doubt the
// result is "unrecognised — check manually", never a standard licence.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLang, setLang } from '../../src/app/i18n';
import { ReportView } from '../../src/app/components/ReportView';
import { LicencePage } from '../../src/app/pages/LicencePage';
import { buildReport } from '../../src/core/report';
import { RULES, RULE_PARAMS } from '../../src/core/rules/registry';
import { UI } from '../../src/core/i18n/ui';
import { renderPlain } from '../../src/core/report';
import { FetchTimeoutError, browserFetcher, fetchErrorFinding, type Fetcher } from '../../src/core/sources/fetcher';
import { MapFetcher } from '../sources/mapFetcher';
import { caseB, dataciteJson, DC } from '../helpers/licenceFixtures';
import { checkLicence } from '../../src/core/checks/licence';
import { runChecks } from '../../src/core/checks/run';
import { makeFinding } from '../../src/core/rules/registry';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildStatement, classifyStatement } from '../../src/core/metadata/licence';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';
import { LANGS, type Finding, type LicenceStatement, type MetadataRecord, type MetadataSource } from '../../src/core/types';
import { makeRecord } from '../helpers/build';

const BY = 'https://creativecommons.org/licenses/by/4.0/';

/** One statement the way the parsers build it. */
const st = (text?: string, uri?: string, also?: string[], source: MetadataSource = 'datacite', field = 'rightsList[0]'): LicenceStatement =>
  buildStatement({ source, field, text, uri, also })!;
const klass = (s: LicenceStatement): string => {
  const c = classifyStatement(s);
  return c.kind === 'spdx' ? c.id : s.conflict ? `unrecognised (${s.conflict})` : 'unrecognised';
};
const rec = (source: MetadataSource, entries: [string | undefined, string | undefined, string?][], extra: Partial<MetadataRecord> = {}): MetadataRecord =>
  makeRecord(source, {
    licences: entries.map(([text, uri, field], i) => buildStatement({ source, field: field ?? (source === 'iso19139' ? 'otherConstraints' : `rightsList[${i}]`), text, uri })!),
    ...extra,
  });
const lic = (f: Finding[]): string[] => f.filter((x) => x.ruleId.startsWith('LIC-')).map((x) => x.ruleId);
const check = (records: MetadataRecord[], extra: { inaccessible?: boolean } = {}): string[] => lic(checkLicence(records, { label: 'rec', inaccessible: false, ...extra }));

describe('review 1 — restrictions are never let through', () => {
  it.each([
    'CC BY 4.0 for noncommercial purposes',
    'CC BY 4.0; commercial use requires written permission',
    'CC BY 4.0, keine kommerzielle Nutzung',
    'CC BY 4.0, do celów niekomercyjnych',
    'CC BY 4.0 – użycie komercyjne niedozwolone',
    'CC BY 4.0, utilisation commerciale soumise à autorisation',
    'CC BY 4.0, commercial use requires permission',
    'CC BY 4.0 with the consent of the author',
    'CC BY 4.0, Genehmigung erforderlich',
    'CC BY 4.0 for academic use',
    'CC BY 4.0, za zgodą autora',
  ])('"%s" is ADDED-CONDITIONS, never CC-BY-4.0', (text) => {
    for (const s of [st(text), st(text, BY)]) {
      expect(klass(s), text).toBe('unrecognised (restricted)');
    }
    expect(check([rec('datacite', [[text, undefined]])])).toContain('LIC-ADDED-CONDITIONS');
  });

  it.each([
    'CC BY 4.0. You are free to share and adapt the material for any purpose, even commercially.',
    'CC BY 4.0 — Nutzung für beliebige Zwecke, sogar kommerziell.',
    'CC BY 4.0 : pour toute utilisation, y compris commerciale.',
    'CC BY 4.0 – w dowolnym celu, nawet komercyjnym.',
    'CC BY 4.0 (commercial use permitted)',
    'CC BY 4.0 (commercial use allowed)',
    'CC BY 4.0, commercial use is permitted',
  ])('the affirmative deed wording "%s" stays CC-BY-4.0', (text) => {
    for (const s of [st(text), st(text, BY)]) expect(klass(s), text).toBe('CC-BY-4.0');
  });
});

describe('review 4 — a family or a second reading never disappears behind a standard licence', () => {
  it('"Creative Commons Attribution 4.0 (CC BY-NC)" is not CC-BY-4.0', () => {
    expect(klass(st('Creative Commons Attribution 4.0 (CC BY-NC)'))).toBe('unrecognised (readings)');
    expect(klass(st('Creative Commons Attribution 4.0 (CC BY-NC)', BY))).toBe('unrecognised (text-uri)');
  });
  it('rights text against identifier with no link: a conflict that does not talk about a link, no free-text hint', () => {
    const s = st('Creative Commons Attribution 4.0 International', undefined, ['cc-by-nc-4.0']);
    expect(klass(s)).toBe('unrecognised (readings)');
    expect(s.readings).toEqual(['CC-BY-4.0', 'CC-BY-NC-4.0']);
    const f = checkLicence([makeRecord('datacite', { licences: [s] })], { label: 'rec', inaccessible: false });
    expect(lic(f)).toEqual(['LIC-AMBIGUOUS']);
    expect(f.find((x) => x.ruleId === 'LIC-AMBIGUOUS')!.params).toMatchObject({ readings: 'CC-BY-4.0 / CC-BY-NC-4.0' });
  });
  it('the family is compared with the link even when the text names a version', () => {
    expect(klass(st('CC BY 4.0 (CC BY-SA)', 'https://creativecommons.org/licenses/by-sa/4.0/'))).toBe('unrecognised (text-uri)');
  });
});

describe('review 5 — "OR" is not a country; two licences in one text are not one', () => {
  it('"CC BY 3.0 OR CC BY-SA 3.0" is not CC-BY-SA-3.0', () => {
    const s = st('CC BY 3.0 OR CC BY-SA 3.0');
    expect(s.spdx).toBeUndefined();
    expect(klass(s)).toBe('unrecognised (readings)');
    expect(s.readings).toEqual(['CC-BY-3.0', 'CC-BY-SA-3.0']);
  });
  it('lower-case "or" and "CC BY 4.0 OR CC BY-SA 4.0" likewise', () => {
    expect(st('CC BY 3.0 or CC BY-SA 3.0').spdx).toBeUndefined();
    expect(st('CC BY 4.0 OR CC BY-SA 4.0').spdx).toBeUndefined();
  });
  it('an unrecognised licence name next to a recognised one, no link: unrecognised', () => {
    expect(st('CC BY 4.0 and Open Government Licence - Canada').spdx).toBeUndefined();
    expect(st('CC BY 3.0 PL and CC BY 4.0').spdx).toBeUndefined();
  });
});

describe('review 8 — ports in text', () => {
  it.each([
    ['CC BY 3.0 Germany', 'CC-BY-3.0-DE'],
    ['CC BY 3.0 (IGO)', 'CC-BY-3.0-IGO'],
    ['cc by-sa 3.0 de', 'CC-BY-SA-3.0-DE'],
    ['Creative Commons Attribution 3.0 Germany', 'CC-BY-3.0-DE'],
    ['Creative Commons Attribution-NonCommercial 3.0 IGO', 'CC-BY-NC-3.0-IGO'],
  ])('"%s" -> %s', (text, id) => {
    expect(klass(st(text))).toBe(id);
  });
  it.each(['Creative Commons Attribution 3.0 Poland', 'CC BY 3.0 Poland', 'CC BY 3.0 PL'])('"%s" has no SPDX port: unrecognised, never CC-BY-3.0', (text) => {
    expect(klass(st(text))).toBe('unrecognised');
    expect(check([rec('datacite', [[text, undefined]])])).not.toContain('LIC-ADDED-CONDITIONS');
  });
  it('words that look like a port stay what they were', () => {
    expect(klass(st('CC-BY-3.0 at Zenodo'))).toBe('CC-BY-3.0');
    expect(klass(st('Creative Commons Attribution 3.0 Unported'))).toBe('CC-BY-3.0');
    expect(klass(st('CC BY 4.0 DE'))).toBe('CC-BY-4.0');
  });
});

describe('review 9 — ordinary texts are not "added conditions"', () => {
  it.each([
    ['Namensnennung - Nicht kommerziell 4.0 International', 'CC-BY-NC-4.0'],
    ['Creative Commons Namensnennung - Nicht-kommerziell - Keine Bearbeitungen 4.0 International', 'CC-BY-NC-ND-4.0'],
    ['Namensnennung - Weitergabe unter gleichen Bedingungen 4.0 International', 'CC-BY-SA-4.0'],
    ['Namensnennung 4.0 International', 'CC-BY-4.0'],
    ["Attribution - Pas d'Utilisation Commerciale 4.0 International", 'CC-BY-NC-4.0'],
    ['Attribution - Pas de Modification 4.0 International', 'CC-BY-ND-4.0'],
    ['Attribution - Partage dans les Mêmes Conditions 4.0 International', 'CC-BY-SA-4.0'],
    ['Attribution 4.0 International', 'CC-BY-4.0'],
    ['Uznanie autorstwa 4.0 Międzynarodowe', 'CC-BY-4.0'],
    ['Uznanie autorstwa-Użycie niekomercyjne 4.0 Międzynarodowe', 'CC-BY-NC-4.0'],
    ['Uznanie autorstwa – Bez utworów zależnych 4.0 Międzynarodowe', 'CC-BY-ND-4.0'],
    ['Uznanie autorstwa-Na tych samych warunkach 4.0 Międzynarodowe', 'CC-BY-SA-4.0'],
    ['Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International', 'CC-BY-NC-SA-4.0'],
    ['Creative Commons Attribution-NoDerivatives 4.0 International', 'CC-BY-ND-4.0'],
  ])('"%s" -> %s, clean', (text, id) => {
    const s = st(text);
    expect(klass(s), text).toBe(id);
    expect(s.conflict).toBeUndefined();
  });
  it.each([
    'CC BY 4.0, some rights reserved',
    'CC BY 4.0 — no additional restrictions',
    'CC BY 4.0 without restrictions',
    'CC BY 4.0 without restriction',
    'CC BY 4.0, no limitations',
    'CC BY 4.0, but please cite the dataset',
    '© Ocean Data Limited, CC BY 4.0',
    'CC BY 4.0 © 2025 Ocean Data Limited',
  ])('"%s" is CC-BY-4.0', (text) => {
    expect(klass(st(text)), text).toBe('CC-BY-4.0');
  });
  it('"limited to" and an unqualified "all rights reserved" still count as conditions', () => {
    expect(klass(st('CC BY 4.0, use limited to the project partners'))).toBe('unrecognised (restricted)');
    expect(klass(st('CC BY 4.0. All rights reserved.'))).toBe('unrecognised (restricted)');
  });
  it('a restriction written with the official element words outside a licence name is still caught', () => {
    expect(klass(st('CC BY 4.0, nicht kommerziell'))).toBe('unrecognised (restricted)');
    expect(klass(st('CC BY 4.0, pas d\'utilisation commerciale'))).toBe('unrecognised (restricted)');
  });
});

describe('review 2 — only explicitly repeated entries are dual licensing', () => {
  const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
  it('DataCite rightsList entries and Zenodo rights[] entries are dual licensing', () => {
    expect(analyseLicences([rec('datacite', [['CC BY 4.0', BY], ['CC0 1.0', CC0]])]).contradictions).toEqual([]);
    const z = makeRecord('zenodo', {
      licences: [
        buildStatement({ source: 'zenodo', field: 'rights[0]', text: 'cc-by-4.0' })!,
        buildStatement({ source: 'zenodo', field: 'rights[1]', text: 'cc-zero' })!,
      ],
    });
    expect(analyseLicences([z]).contradictions).toEqual([]);
  });
  it('two different licences in two ISO fields are LIC-MISMATCH, in the analysis and in /check', () => {
    const iso = rec('iso19139', [['CC BY 4.0', BY, 'otherConstraints'], ['CC0 1.0', CC0, 'useLimitation']]);
    expect(analyseLicences([iso]).contradictions).toMatchObject([{ kind: 'mismatch', licenceA: 'CC-BY-4.0', licenceB: 'CC0-1.0' }]);
    expect(check([iso])).toContain('LIC-MISMATCH');
  });
  it('two otherConstraints in one record likewise', () => {
    const iso = rec('iso19139', [['CC BY 4.0', BY, 'otherConstraints'], ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'otherConstraints']]);
    expect(check([iso])).toContain('LIC-MISMATCH');
  });
  it('the same licence in two fields is no mismatch', () => {
    const iso = rec('iso19139', [['CC BY 4.0', BY, 'otherConstraints'], ['CC BY 4.0', BY, 'useLimitation']]);
    expect(check([iso])).not.toContain('LIC-MISMATCH');
  });
});

describe('review 3 — "no contradiction among N" counts only sources with a recognised licence', () => {
  it('a recognised source next to an unrecognised one is not "compared"', () => {
    const a = analyseLicences([rec('iso19139', [['CC BY 4.0', BY]]), rec('datacite', [['Open Access', undefined]])]);
    expect(a.statedGroups).toBe(2);
    expect(a.recognisedGroups).toBe(1);
    expect(a.comparison).toBe('single-source');
  });
  it('only unrecognised statements: nothing is compared', () => {
    const a = analyseLicences([rec('iso19139', [['Open Access', undefined]]), rec('datacite', [['Free to use', undefined]])]);
    expect(a.statedGroups).toBe(2);
    expect(a.recognisedGroups).toBe(0);
    expect(a.comparison).toBe('single-source');
  });
  it('two recognised sources that agree are compared, N = 2', () => {
    const a = analyseLicences([rec('iso19139', [['CC BY 4.0', BY]]), rec('datacite', [['CC BY 4.0', BY]])]);
    expect(a.recognisedGroups).toBe(2);
    expect(a.comparison).toBe('compared');
  });
});

describe('review 7 — sources are grouped by deposit, not by source type', () => {
  const dc = (doi: string, text = 'CC BY 4.0', uri = BY): MetadataRecord => rec('datacite', [[text, uri]], { doi, label: `DataCite ${doi}` });
  it('two DataCite DOIs of different repositories are two groups', () => {
    const a = analyseLicences([dc('10.17882/1'), dc('10.5285/2')]);
    expect(a.groups).toHaveLength(2);
    expect(a.groups.every((g) => g.sources.length === 1)).toBe(true);
    expect(a.comparison).toBe('compared');
  });
  it('two such DOIs with different licences are a mismatch BETWEEN groups, not within one deposit', () => {
    const a = analyseLicences([dc('10.17882/1'), dc('10.5285/2', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/')]);
    expect(a.contradictions).toMatchObject([{ kind: 'mismatch', sameGroup: false }]);
  });
  it('two GeoNetwork catalogues and two Zenodo deposits are two groups each', () => {
    const iso = (label: string) => rec('iso19139', [['CC BY 4.0', BY]], { label });
    expect(analyseLicences([iso('GeoNetwork A'), iso('GeoNetwork B')]).groups).toHaveLength(2);
    const z = (n: number) => rec('zenodo', [['cc-by-4.0', undefined]], { doi: `10.5281/zenodo.${n}`, label: `Zenodo ${n}`, landingUrl: `https://zenodo.org/records/${n}` });
    expect(analyseLicences([z(1), z(2)]).groups).toHaveLength(2);
  });
  it('a Zenodo record, the DataCite record of its version DOI and of its concept DOI are one group', () => {
    const z = rec('zenodo', [['cc-by-4.0', undefined]], { doi: '10.5281/zenodo.101', label: 'Zenodo 101', landingUrl: 'https://zenodo.org/records/101' });
    const version = dc('10.5281/zenodo.101');
    const concept = rec('datacite', [['CC BY 4.0', BY]], { doi: '10.5281/zenodo.100', label: 'DataCite concept', landingUrl: 'https://zenodo.org/records/101' });
    const a = analyseLicences([z, version, concept]);
    expect(a.groups).toHaveLength(1);
    expect(a.groups[0].sources).toHaveLength(3);
    expect(a.comparison).toBe('single-source');
  });
  it('the Zenodo parser keeps the concept record id', () => {
    expect(parseZenodoRecord({ id: 9, conceptrecid: '7', metadata: {} }, 'Zenodo 9').conceptId).toBe('7');
  });
  it('a Zenodo version record that names its concept record joins the DataCite record of the concept DOI (landing page = the concept itself)', () => {
    const z = rec('zenodo', [['cc-by-4.0', undefined]], { doi: '10.5281/zenodo.19475182', label: 'Zenodo 19475182', landingUrl: 'https://zenodo.org/records/19475182', conceptId: '3633185' });
    const concept = rec('datacite', [['CC BY 4.0', BY]], { doi: '10.5281/zenodo.3633185', label: 'DataCite concept', landingUrl: 'https://zenodo.org/records/3633185' });
    const other = rec('zenodo', [['cc-by-4.0', undefined]], { doi: '10.5281/zenodo.5', label: 'Zenodo 5', landingUrl: 'https://zenodo.org/records/5', conceptId: '4' });
    expect(analyseLicences([z, concept]).groups).toHaveLength(1);
    expect(analyseLicences([z, concept, other]).groups).toHaveLength(2);
  });
  it('a PANGAEA record and the DataCite record of its DOI are one group; a catalogue with the same DOI is not merged into it', () => {
    const p = rec('pangaea', [['CC BY 4.0', BY, 'license']], { doi: '10.1594/PANGAEA.9', label: 'PANGAEA 9' });
    const d = dc('10.1594/PANGAEA.9');
    const iso = rec('iso19139', [['CC BY 4.0', BY]], { doi: '10.1594/PANGAEA.9', label: 'GeoNetwork X' });
    const a = analyseLicences([p, d, iso]);
    expect(a.groups.map((g) => g.sources.length).sort()).toEqual([1, 2]);
  });
});

describe('review 6 — /check does not claim "no licence" for a record it could not read', () => {
  const session = (kind: 'datacite' | 'geonetwork', findings: Finding[], metadata: MetadataRecord[] = []) => ({
    datasets: [],
    parseFindings: [],
    records: [{ label: 'rec', kind, metadata, files: [], findings }],
  });
  it.each([
    ['IN-FETCH-BLOCKED', { host: 'geonetwork.example.org' }],
    ['IN-HOST-NOT-ALLOWED', { host: 'evil.example.org' }],
    ['IN-RECORD-INACCESSIBLE', { host: 'geonetwork.example.org', status: 403 }],
  ])('%s on the record: its own finding stays, LIC-MISSING does not appear', (ruleId, params) => {
    const f = runChecks(session('geonetwork', [makeFinding(ruleId, { file: 'rec', params })])).findings;
    expect(f.map((x) => x.ruleId)).toContain(ruleId);
    expect(f.map((x) => x.ruleId)).not.toContain('LIC-MISSING');
  });
  it('a failure of a DATA FILE (another file name) does not hide a missing licence of a record that was read', () => {
    const read = makeRecord('datacite', { label: 'rec' });
    const f = runChecks(session('datacite', [makeFinding('IN-FETCH-BLOCKED', { file: 'data.csv', params: { host: 'x.org' } })], [read])).findings;
    expect(f.map((x) => x.ruleId)).toContain('LIC-MISSING');
  });
  it('a record that was read and states no licence still gets LIC-MISSING', () => {
    expect(runChecks(session('datacite', [], [makeRecord('datacite', { label: 'rec' })])).findings.map((x) => x.ruleId)).toContain('LIC-MISSING');
  });
});

/* ---------- the pages ---------- */

beforeEach(() => {
  localStorage.clear();
  initLang();
  setLang('en');
});
afterEach(cleanup);

async function runPage(fetcher: Fetcher, refs: string[]): Promise<HTMLElement> {
  render(<LicencePage fetcherFor={() => fetcher} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: refs.join('\n') } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare licences' }));
  return waitFor(() => screen.getByTestId('licence-result'));
}
const cite = (doi: string, url: string) => ({ doi, title: `Dataset ${doi}`, creators: ['Smith, A'], year: 2024, publisher: 'Repo', url });

describe('review 3 (page) — the headline never says "no contradiction" without two recognised sources', () => {
  it('one recognised source and one unrecognised: "Only one source gives a licence this tool recognises"', async () => {
    const a = cite('10.0000/a', 'https://repo-a.example.org/a');
    const b = cite('10.0000/b', 'https://repo-b.example.org/b');
    const f = new MapFetcher({
      [DC + a.doi]: dataciteJson(a, [{ rights: 'CC BY 4.0', rightsUri: BY }]),
      [DC + b.doi]: dataciteJson(b, [{ rights: 'Open Access' }]),
    });
    const text = (await runPage(f, [a.doi, b.doi])).textContent ?? '';
    expect(text).toContain('Only one source gives a licence this tool recognises; the other statements could not be compared');
    expect(text).not.toContain('No contradiction');
  });
  it('only unrecognised statements: they could not be compared', async () => {
    const a = cite('10.0000/a', 'https://repo-a.example.org/a');
    const f = new MapFetcher({ [DC + a.doi]: dataciteJson(a, [{ rights: 'Open Access' }]) });
    const text = (await runPage(f, [a.doi])).textContent ?? '';
    expect(text).toContain('none could be read as a licence this tool recognises — nothing was compared');
    expect(text).not.toContain('No contradiction');
  });
});

describe('review 7 (page) — two DataCite DOIs of different repositories are not "one deposit"', () => {
  it('two groups, no "one deposit" sentence, "No contradiction among 2 sources"', async () => {
    const a = cite('10.17882/1', 'https://repo-a.example.org/a');
    const b = cite('10.5285/2', 'https://repo-b.example.org/b');
    const f = new MapFetcher({
      [DC + a.doi]: dataciteJson(a, [{ rights: 'CC BY 4.0', rightsUri: BY }]),
      [DC + b.doi]: dataciteJson(b, [{ rights: 'CC BY 4.0', rightsUri: BY }]),
    });
    const result = await runPage(f, [a.doi, b.doi]);
    expect(result.querySelectorAll('.licence-group')).toHaveLength(2);
    const text = result.textContent ?? '';
    expect(text).not.toContain('written by the same repository');
    expect(text).toContain('No contradiction among 2 sources');
  });
});

describe('review 10 — /check shows what it showed before; /licence shows the citations', () => {
  const ruleParams = (id: string) => Object.fromEntries((RULE_PARAMS[id] ?? []).map((p) => [p, 'x']));
  const finding = (id: string) => makeFinding(id, { file: 'rec', params: ruleParams(id) });
  it.each(['LIC-MISSING', 'LIC-FREE-TEXT', 'LIC-MISMATCH', 'LIC-DATACITE-EMPTY', 'LIC-TEXT-URI-CONFLICT', 'LIC-ADDED-CONDITIONS', 'LIC-AMBIGUOUS', 'LIC-RESTRICTION-CONFLICT'])(
    '/check renders no citation links under %s',
    (id) => {
      const { container } = render(<ReportView report={buildReport([finding(id)])} />);
      expect(container.querySelector('ul.sources')).toBeNull();
      expect(container.querySelector('a[href^="https://"]')).toBeNull();
    },
  );
  it('other rules keep their citations in /check', () => {
    const withCitations = RULES.find((r) => !r.id.startsWith('LIC-') && (r.citations?.length ?? 0) > 0)!;
    const { container } = render(<ReportView report={buildReport([finding(withCitations.id)])} />);
    expect(container.querySelector('ul.sources a')).toBeTruthy();
  });
  it('the licence page lists the sources of a contradiction', async () => {
    const { refs, fetcher } = caseB();
    const result = await runPage(fetcher, refs);
    const links = result.querySelectorAll('li[data-kind="text-uri"] ul.sources a');
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('review 11 — a hanging host ends, and the reasons say what happened', () => {
  it('browser mode gives up on a host that never answers, with a timeout error that names the host', async () => {
    const hang: typeof fetch = () => new Promise<Response>(() => undefined);
    const err = await browserFetcher(hang, 40).get('https://api.datacite.org/dois/10.1/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchTimeoutError);
    expect((err as FetchTimeoutError).host).toBe('api.datacite.org');
    const f = fetchErrorFinding(err, 'DataCite 10.1/x')!;
    expect(f.ruleId).toBe('IN-FETCH-TIMEOUT');
    for (const lang of LANGS) {
      const text = renderPlain(f, lang);
      expect(text, lang).toContain('api.datacite.org');
      expect(text, lang).not.toMatch(/[{}]/);
    }
    expect(renderPlain(f, 'en')).not.toBe(renderPlain(f, 'pl'));
  });
  it('a request that answers is unchanged: the response comes back, the timer does not fire later', async () => {
    let seen: RequestInit | undefined;
    const ok: typeof fetch = async (_u, init) => {
      seen = init;
      return new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const r = await browserFetcher(ok, 20).get('https://api.datacite.org/dois/10.1/x', 'application/json');
    expect(r.status).toBe(200);
    expect(new TextDecoder().decode(r.bytes)).toBe('{"a":1}');
    expect(seen).toMatchObject({ credentials: 'omit', redirect: 'follow', mode: 'cors' });
    await new Promise((res) => setTimeout(res, 60));
  });
  it('a fetch error that is not a timeout still reads as blocked', async () => {
    const blocked: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    const err = await browserFetcher(blocked, 40).get('https://api.datacite.org/dois/10.1/x').catch((e: unknown) => e);
    expect(fetchErrorFinding(err, 'x')!.ruleId).toBe('IN-FETCH-BLOCKED');
  });

  const cite1 = { doi: '10.0000/a', title: 'A', creators: ['S, A'], year: 2024, publisher: 'R', url: 'https://repo-a.example.org/a' };
  it('429 is "too many requests", never "private or unpublished"', async () => {
    const f = new MapFetcher({ [DC + cite1.doi]: { status: 429 } });
    const text = (await runPage(f, [cite1.doi])).textContent ?? '';
    expect(text).toContain('too many requests were made');
    expect(text).not.toContain('private or unpublished');
  });
  it('a DOI DataCite does not know says so, not "private or unpublished"', async () => {
    const text = (await runPage(new MapFetcher({}), ['10.5555/not-at-datacite'])).textContent ?? '';
    expect(text).toContain('DataCite has no record of this DOI');
    expect(text).not.toContain('private or unpublished');
  });
  it('a refused record (403) keeps the old explanation', async () => {
    const f = new MapFetcher({ [DC + cite1.doi]: { status: 403 } });
    expect((await runPage(f, [cite1.doi])).textContent ?? '').toContain('private or unpublished');
  });
  it('a timeout is reported on the page, with the switch to server mode', async () => {
    const f = new MapFetcher({ [DC + cite1.doi]: new FetchTimeoutError('api.datacite.org') });
    const result = await runPage(f, [cite1.doi]);
    expect(result.textContent ?? '').toContain('api.datacite.org did not answer in time');
    expect(screen.getByRole('button', { name: /server mode/i })).toBeTruthy();
  });
  it('the three new reasons exist in all four languages and take the host', () => {
    for (const lang of LANGS) for (const k of ['licence.reason.timeout', 'licence.reason.rateLimit', 'licence.reason.notDatacite'] as const) expect(UI[lang][k], `${lang} ${k}`).toContain('{host}');
  });
});

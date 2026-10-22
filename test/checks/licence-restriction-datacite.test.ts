// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Hotfix: restriction-code conflict next to an unrecognised-but-open statement; DataCite empty while the main record is unreadable. Synthetic data only.
import { describe, expect, it } from 'vitest';
import { checkLicence } from '../../src/core/checks/licence';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildStatement } from '../../src/core/metadata/licence';
import type { Finding, MetadataRecord, MetadataSource } from '../../src/core/types';
import { makeRecord } from '../helpers/build';

const run = (records: MetadataRecord[], o: { inaccessible?: boolean; unreadable?: MetadataSource[] } = {}): Finding[] =>
  checkLicence(records, { label: 'rec-1', inaccessible: o.inaccessible ?? false, unreadable: o.unreadable });
const ids = (f: Finding[]) => f.map((x) => x.ruleId).filter((x) => x.startsWith('LIC-') || x.startsWith('IN-'));
const iso = (text: string, code: string, uri?: string) =>
  makeRecord('iso19139', { licences: [buildStatement({ source: 'iso19139', field: 'otherConstraints', text, uri })!], restrictionCodes: [{ kind: 'use', code }] });
const conflict = (f: Finding[]) => f.find((x) => x.ruleId === 'LIC-RESTRICTION-CONFLICT');

describe('LIC-RESTRICTION-CONFLICT with an open family that is not a recognised id', () => {
  it.each([
    ['CC BY', 'copyright', 'CC BY'],
    ['CC BY-SA', 'restricted', 'CC BY-SA'],
    ['CC0', 'copyright', 'CC0-1.0'],
    ['CC BY 4.0, commercial use requires permission', 'copyright', 'CC-BY-4.0'],
  ])('"%s" + %s fires, licence shown = %s', (text, code, shown) => {
    const f = run([iso(text, code)]);
    expect(conflict(f)).toMatchObject({ severity: 'warning', params: { codes: code, licence: shown } });
  });

  it.each(['CC BY-NC', 'CC BY-NC-ND 4.0', 'CC BY-ND', 'CC BY-NC-SA'])('"%s" + copyright does not fire', (text) => {
    expect(conflict(run([iso(text, 'copyright')]))).toBeUndefined();
  });

  it('a link to an NC licence next to an open-looking text does not fire', () => {
    expect(conflict(run([iso('CC BY', 'copyright', 'https://creativecommons.org/licenses/by-nc/4.0/')]))).toBeUndefined();
  });

  it('the code `license` alone, or otherRestrictions, never fires', () => {
    expect(conflict(run([iso('CC BY', 'license')]))).toBeUndefined();
    expect(conflict(run([iso('CC BY', 'otherRestrictions')]))).toBeUndefined();
  });

  it('the classification does not change: versionless "CC BY" stays unrecognised, no standard id comes back', () => {
    const a = analyseLicences([iso('CC BY', 'copyright')]);
    expect(a.sources[0].statements[0].classification).toEqual({ kind: 'unrecognised' });
    expect(a.sources[0].statements[0].open).toBe(false);
    expect(a.sources[0].statements[0].statement.spdx).toBeUndefined();
  });

  it('"CC BY 4.0, commercial use requires permission": still unrecognised with LIC-ADDED-CONDITIONS, plus the conflict', () => {
    const rec = iso('CC BY 4.0, commercial use requires permission', 'copyright');
    expect(analyseLicences([rec]).sources[0].statements[0].classification).toEqual({ kind: 'unrecognised' });
    expect(ids(run([rec]))).toEqual(expect.arrayContaining(['LIC-ADDED-CONDITIONS', 'LIC-RESTRICTION-CONFLICT']));
  });

  it('a recognised open id still fires with the id', () => {
    expect(conflict(run([iso('CC BY 4.0', 'copyright')]))?.params.licence).toBe('CC-BY-4.0');
  });
});

describe('LIC-DATACITE-EMPTY next to an unreadable record', () => {
  const emptyDc = makeRecord('datacite');
  it('unreadable GeoNetwork + readable empty DataCite: DATACITE-EMPTY (warning) with "—", no LIC-MISSING, inaccessible kept by the caller', () => {
    const f = run([emptyDc], { inaccessible: true, unreadable: ['iso19139'] });
    expect(ids(f)).toEqual(['LIC-DATACITE-EMPTY']);
    expect(f.find((x) => x.ruleId === 'LIC-DATACITE-EMPTY')).toMatchObject({ severity: 'warning', params: { licence: '—' } });
  });

  it('readable empty DataCite alone, nothing unreadable: LIC-MISSING as before', () => {
    expect(ids(run([emptyDc]))).toEqual(['LIC-MISSING']);
  });

  it('another record states CC BY 4.0 + empty DataCite: DATACITE-EMPTY with that licence, as before', () => {
    const f = run([iso('CC BY 4.0', 'otherRestrictions'), emptyDc]);
    expect(f.find((x) => x.ruleId === 'LIC-DATACITE-EMPTY')?.params).toEqual({ licence: 'CC-BY-4.0' });
    expect(ids(f)).not.toContain('LIC-MISSING');
  });

  it('inaccessible with no known source also reports it, never LIC-MISSING', () => {
    expect(ids(run([emptyDc], { inaccessible: true }))).toEqual(['LIC-DATACITE-EMPTY']);
  });
});

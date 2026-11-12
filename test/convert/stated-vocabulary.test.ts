// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The narrow widening of the stated vocabulary (round 2, task 4): the whole names of a position in German and Polish, the scientific name, and `Date (UTC)` are stated; the bare words and the authors'
// compounds stay listed; `stated` only marks, so the proposals are the same objects before and after. Every value is invented.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { statedInfo, withStated } from '../../src/core/convert/stated';
import type { Cell } from './helpers';
import { CTX, fileOf } from './helpers';

const LATIN = ['Solea solea', 'Merlangius merlangus', 'Calanus finmarchicus', 'Oithona similis', 'Gadus morhua', 'Solea solea'];
const DATES = ['2014-05-01', '2014-05-02', '2014-05-03', '2014-05-04', '2014-05-05', '2014-05-06'];
const LAT = [50.1, 50.2, 50.3, 50.4, 50.5, 50.6];
const LON = [2.1, 2.2, 2.3, 2.4, 2.5, 2.6];
const COUNT = [1, 2, 3, 1, 4, 2];

/** The column under test first, then the columns that make the sheet what it is. */
function probe(header: string, cells: readonly Cell[], extra: [string, readonly Cell[]][]) {
  const headers = [header, ...extra.map((e) => e[0])];
  const rows = cells.map((c, i) => [c, ...extra.map((e) => e[1][i] ?? null)]);
  const sheet = fileOf(headers, rows).sheets[0];
  const proposals = proposeConvertColumns(sheet, CTX);
  const info = statedInfo(sheet, proposals, { decimalComma: false, pangaea: false });
  return { sheet, proposals, p: proposals[0], i: info[0] };
}
const withLon = (h: string) => probe(h, LAT, [['Längengrad', LON], ['Date', DATES]]);
const withLat = (h: string) => probe(h, LON, [['Breitengrad', LAT], ['Date', DATES]]);
const asDate = (h: string) => probe(h, DATES, [['Latitude', LAT], ['Longitude', LON]]);
const asTaxon = (h: string) => probe(h, LATIN, [['Count', COUNT], ['Latitude', LAT], ['Longitude', LON], ['Date', DATES]]);

describe('stated vocabulary: the names that are added', () => {
  it.each([
    ['Breitengrad', 'latitude'],
    ['Szerokość geograficzna', 'latitude'],
    ['szerokosc geograficzna [°]', 'latitude'],
  ])('%s is a stated latitude', (h, kind) => {
    const { p, i } = withLon(h);
    expect(p.role.kind).toBe(kind);
    expect(i).toMatchObject({ stated: true, basis: 'vocabulary', nameStates: 'latitude', role: { kind } });
  });

  it.each([
    ['Längengrad', 'longitude'],
    ['Laengengrad', 'longitude'],
    ['Długość geograficzna', 'longitude'],
  ])('%s is a stated longitude', (h, kind) => {
    const { p, i } = withLat(h);
    expect(p.role.kind).toBe(kind);
    expect(i).toMatchObject({ stated: true, basis: 'vocabulary', nameStates: 'longitude', role: { kind } });
  });

  it.each(['Scientific name', 'Nom scientifique', 'Wissenschaftlicher Name', 'Nazwa naukowa'])('%s is a stated taxon where the proposal is a taxon', (h) => {
    const { p, i } = asTaxon(h);
    expect(p.role.kind).toBe('taxon');
    expect(i).toMatchObject({ stated: true, basis: 'vocabulary', nameStates: 'taxon', role: { kind: 'taxon' } });
  });

  it('a scientific name the proposer ignores (no counts beside it) is still not stated: the name marks, it never gives a role', () => {
    const { p, i } = probe('Scientific name', LATIN, [['Station', ['a', 'b', 'c', 'd', 'e', 'f']]]);
    expect(p.role.kind).toBe('ignore');
    expect(i.stated).toBe(false);
  });

  it('a scientific name beside the exact term scientificName is not a second stated taxon', () => {
    const { sheet, proposals } = probe('Scientific name', LATIN, [['scientificName', LATIN], ['Count', COUNT]]);
    const info = statedInfo(sheet, proposals, { decimalComma: false, pangaea: false });
    expect(info[0].stated).toBe(false);
    expect(info[1].stated).toBe(true);
  });

  it.each(['Date (UTC)', 'Date [UTC]', 'date(utc)'])('%s is a stated date', (h) => {
    const { p, i } = asDate(h);
    expect(p.role.kind).toBe('date');
    expect(i).toMatchObject({ stated: true, nameStates: 'date', role: { kind: 'date' } });
  });

  it('Date (UTC) over cells that are not dates is vetoed, as a plain Date is', () => {
    const { i } = probe('Date (UTC)', ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'], [['Latitude', LAT], ['Longitude', LON]]);
    expect(i.stated).toBe(false);
  });

  it.each(['SampleID', 'Sample ID', 'sample_id'])('%s: whatever the proposer does with the name, the stated layer follows it and adds no role', (h) => {
    const ids = ['A1', 'A1', 'A2', 'A2', 'B1', 'B1'];
    const { p, i } = probe(h, ids, [['Species', LATIN], ['Count', COUNT], ['Latitude', LAT], ['Longitude', LON], ['Date', DATES]]);
    if (h === 'SampleID') {
      // the key of "SampleID" is "sampleid" (a capital is not a space), which no sample-code pattern holds: the proposer reads a text column and ignores it, so there is nothing to mark
      expect(p.role.kind).toBe('ignore');
      expect(p.reasonCode).toBe('text-column');
      expect(i.stated).toBe(false);
    } else {
      expect(p.role.kind).toBe('sampleId');
      expect(i).toMatchObject({ stated: true, role: { kind: 'sampleId' } });
    }
  });
});

describe('stated vocabulary: the names that stay listed', () => {
  it.each([
    ['Data', DATES, 'date'],
    ['Datum', DATES, 'date'],
    ['DateCollected', DATES, 'date'],
    ['Date (GMT)', DATES, 'date'],
    ['Datum (UTC)', DATES, 'date'],
    ['Data (UTC)', DATES, 'date'],
  ])('%s is not stated', (h, cells, kind) => {
    const { p, i } = probe(h, cells, [['Latitude', LAT], ['Longitude', LON]]);
    expect(p.role.kind).toBe(kind);
    expect(i.stated).toBe(false);
  });

  it.each(['Breite', 'Szerokość', 'Latitude_dd', 'LatStart', 'Latitude (UTC)'])('%s is not a stated latitude', (h) => {
    expect(withLon(h).i.stated).toBe(false);
  });

  it.each(['Länge', 'Długość', 'Longitude_dd', 'LonStart'])('%s is not a stated longitude', (h) => {
    expect(withLat(h).i.stated).toBe(false);
  });
});

describe('stated vocabulary: only a mark, never a role', () => {
  const sheet = fileOf(
    ['Breitengrad', 'Längengrad', 'Scientific name', 'Date (UTC)', 'SampleID', 'Count', 'Data', 'Breite', 'Latitude_dd'],
    LATIN.map((t, i): Cell[] => [LAT[i], LON[i], t, DATES[i], `X${i % 2}`, COUNT[i], DATES[i], LAT[i], LAT[i]]),
  ).sheets[0];

  it('withStated returns the proposals unchanged but for the mark: the very role objects, in the same order', () => {
    const proposals = proposeConvertColumns(sheet, CTX);
    const marked = withStated(sheet, proposals, { decimalComma: false, pangaea: false });
    expect(marked).toHaveLength(proposals.length);
    marked.forEach((m, k) => {
      const { stated, ...rest } = m;
      expect(rest).toEqual(proposals[k]);
      expect(m.role).toBe(proposals[k].role);
      void stated;
    });
  });

  it('the proposals do not depend on the stated layer: the same call twice gives the same roles, and the stated layer leaves its input untouched', () => {
    const a = proposeConvertColumns(sheet, CTX);
    const snapshot = JSON.stringify(a);
    withStated(sheet, a, { decimalComma: false, pangaea: false });
    expect(JSON.stringify(a)).toBe(snapshot);
    expect(JSON.stringify(proposeConvertColumns(sheet, CTX))).toBe(snapshot);
  });
});

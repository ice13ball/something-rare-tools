// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { resolveInput } from '../../src/core/sources/resolve';

const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('resolveInput — Zenodo', () => {
  it.each([
    ['https://zenodo.org/records/12345', '12345'],
    ['https://zenodo.org/record/12345', '12345'],
    ['https://zenodo.org/records/12345?preview=1#files', '12345'],
    ['https://zenodo.org/api/records/12345', '12345'],
    ['12345', '12345'],
    ['  12345  ', '12345'],
  ])('%s -> zenodo %s', (input, id) => {
    expect(resolveInput(input)).toEqual({ kind: 'zenodo', id });
  });
});

describe('resolveInput — DOI', () => {
  it.each([
    ['10.48457/example-2024-001', '10.48457/example-2024-001'],
    ['doi:10.48457/example-2024-001', '10.48457/example-2024-001'],
    ['DOI: 10.48457/EXAMPLE.2025.001', '10.48457/EXAMPLE.2025.001'],
    ['https://doi.org/10.48457/example-2024-001', '10.48457/example-2024-001'],
    ['http://dx.doi.org/10.48457/example-2024-001', '10.48457/example-2024-001'],
    ['<https://doi.org/10.48457/example-2024-001>', '10.48457/example-2024-001'],
    ['https://doi.org/10.48457/example-2024-001.', '10.48457/example-2024-001'],
    ['(10.48457/example-2024-001),', '10.48457/example-2024-001'],
    ['https://doi.org/10.5281/zenodo.12345', '10.5281/zenodo.12345'],
  ])('%s -> doi %s', (input, doi) => {
    expect(resolveInput(input)).toEqual({ kind: 'doi', doi });
  });

  it('a Zenodo DOI (bare or as a zenodo.org/doi/ link) goes through DataCite, never straight to the record', () => {
    expect(resolveInput('10.5281/zenodo.12345')).toEqual({ kind: 'doi', doi: '10.5281/zenodo.12345' });
    expect(resolveInput('https://zenodo.org/doi/10.5281/zenodo.12345')).toEqual({ kind: 'doi', doi: '10.5281/zenodo.12345' });
  });

  it('keeps the original case of the DOI', () => {
    expect(resolveInput('10.1594/PANGAEA.964012x')).toEqual({ kind: 'doi', doi: '10.1594/PANGAEA.964012x' });
  });
});

describe('resolveInput — PANGAEA', () => {
  it.each([
    ['https://doi.pangaea.de/10.1594/PANGAEA.964012', '964012'],
    ['http://doi.pangaea.de/10.1594/pangaea.964012', '964012'],
    ['https://doi.pangaea.de/10.1594/PANGAEA.964012?format=textfile', '964012'],
  ])('%s -> pangaea %s', (input, id) => {
    expect(resolveInput(input)).toEqual({ kind: 'pangaea', id });
  });

  it('a PANGAEA DOI via doi.org is a plain DOI (DataCite routes it)', () => {
    expect(resolveInput('https://doi.org/10.1594/PANGAEA.964012')).toEqual({ kind: 'doi', doi: '10.1594/PANGAEA.964012' });
  });
});

describe('resolveInput — GeoNetwork', () => {
  it.each([
    [UUID],
    [UUID.toUpperCase()],
    [`https://geonetwork.iopan.pl/geonetwork/srv/eng/catalog.search#/metadata/${UUID}`],
    [`https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}`],
    [`https://geonetwork.iopan.pl/geonetwork/srv/api/records/${UUID}/formatters/xml`],
    [`https://geonetwork.iopan.pl/geonetwork/srv/resources/records/${UUID}`],
  ])('%s -> geonetwork on geonetwork.iopan.pl', (input) => {
    expect(resolveInput(input)).toEqual({ kind: 'geonetwork', host: 'geonetwork.iopan.pl', uuid: UUID });
  });

  it('keeps a foreign host so loadRecord can report it (host only)', () => {
    expect(resolveInput(`https://catalog.example.org/geonetwork/srv/api/records/${UUID}`)).toEqual({
      kind: 'geonetwork',
      host: 'catalog.example.org',
      uuid: UUID,
    });
  });
});

describe('resolveInput — unknown', () => {
  it.each([[''], ['   '], ['hello world'], ['https://example.com/data.csv'], ['https://example.com/page?id=' + UUID], ['ftp://zenodo.org/records/1']])(
    '%j -> unknown',
    (input) => {
      expect(resolveInput(input)).toEqual({ kind: 'unknown' });
    },
  );
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZenodoRecord } from '../../src/core/metadata/zenodo';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', n), 'utf-8')) as unknown;

describe('parseZenodoRecord — legacy files[] shape', () => {
  it('a record with only a PDF has one pdf file and CORS-safe content URL', () => {
    const rec = parseZenodoRecord(fx('zenodo-pdf-only.json'), 'zen-pdf');
    expect(rec.source).toBe('zenodo');
    expect(rec.label).toBe('zen-pdf');
    expect(rec.files).toEqual([
      {
        key: 'Synthetic report.pdf',
        url: 'https://zenodo.org/api/records/1000001/files/Synthetic%20report.pdf/content',
        size: 123456,
      },
    ]);
    expect(rec.files![0].key.endsWith('.pdf')).toBe(true);
  });

  it('reads licence, resource type, version, doi, title, plain-text abstract, landing url', () => {
    const rec = parseZenodoRecord(fx('zenodo-pdf-only.json'), 'x');
    expect(rec.licences).toEqual([{ source: 'zenodo', field: 'license.id', text: 'cc-by-4.0', textSpdx: 'CC-BY-4.0', spdx: 'CC-BY-4.0' }]);
    expect(rec.resourceType).toBe('publication');
    expect(rec.version).toBe('v2');
    expect(rec.doi).toBe('10.0000/zenodo.1000001');
    expect(rec.title).toBe('Synthetic report on porewater');
    expect(rec.abstract).toBe('Invented description of a report.');
    expect(rec.landingUrl).toBe('https://zenodo.org/records/1000001');
    expect(rec.distributionLinks).toEqual([]);
  });

  it('a record with an xlsx file keeps the key and encodes the URL', () => {
    const rec = parseZenodoRecord(fx('zenodo-xlsx.json'), 'zen-xlsx');
    expect(rec.files).toHaveLength(1);
    expect(rec.files![0].key).toBe('Synthetic database (updated 01.01.2024).xlsx');
    expect(rec.files![0].url).toBe('https://zenodo.org/api/records/1000002/files/Synthetic%20database%20(updated%2001.01.2024).xlsx/content');
    expect(rec.files![0].mimetype).toBeUndefined();
    expect(rec.licences[0].spdx).toBe('CC-BY-NC-4.0');
    expect(rec.resourceType).toBe('dataset');
  });
});

describe('parseZenodoRecord — InvenioRDM shape', () => {
  const rec = parseZenodoRecord(fx('zenodo-rdm-entries.json'), 'zen-rdm');

  it('reads files.entries keyed by filename, with mimetype and escaped URL', () => {
    expect(rec.files).toEqual([
      { key: 'stations.csv', url: 'https://zenodo.org/api/records/1000003/files/stations.csv/content', size: 2048, mimetype: 'text/csv' },
      {
        key: 'notes & data.xlsx',
        url: 'https://zenodo.org/api/records/1000003/files/notes%20%26%20data.xlsx/content',
        size: 4096,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);
  });

  it('reads rights[], resource_type.id, pids doi', () => {
    expect(rec.licences).toEqual([
      {
        source: 'zenodo',
        field: 'rights[0]',
        text: 'cc-by-sa-4.0',
        uri: 'https://creativecommons.org/licenses/by-sa/4.0/legalcode',
        textSpdx: 'CC-BY-SA-4.0',
        uriSpdx: 'CC-BY-SA-4.0',
        spdx: 'CC-BY-SA-4.0',
      },
    ]);
    expect(rec.resourceType).toBe('dataset');
    expect(rec.doi).toBe('10.0000/zenodo.1000003');
    expect(rec.landingUrl).toBe('https://zenodo.org/records/1000003');
  });
});

describe('parseZenodoRecord — degenerate input', () => {
  it('returns an empty record, not an exception, for a record without files or licence', () => {
    const rec = parseZenodoRecord({ id: 5, metadata: { title: 'T' } }, 'x');
    expect(rec.licences).toEqual([]);
    expect(rec.files).toEqual([]);
    expect(parseZenodoRecord(null, 'x').files).toEqual([]);
  });
});

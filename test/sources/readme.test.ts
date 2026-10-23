// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// README files of a linked record are a description of the deposit, never data: not read, no finding (Michal, 24.10.2026).
import { describe, expect, it } from 'vitest';
import { isReadme, isDataFile } from '../../src/core/sources/common';
import { dataverseVersionUrl, loadDataverse, loadZenodo } from '../../src/core/sources';
import { DC, dataciteJson, ZEN } from '../helpers/licenceFixtures';
import { fixture, MapFetcher } from './mapFetcher';

describe('isReadme', () => {
  it('README in its usual spellings, and nothing that only starts with "read"', () => {
    for (const n of ['README.txt', 'readme.txt', 'ReadMe.md', 'Readme.txt', 'README', '00_README_v2.txt', 'data/read_me.txt', 'Read me.txt', 'README_EN.txt', 'readme-1.2.txt']) expect(isReadme(n), n).toBe(true);
    for (const n of ['readings.csv', 'readmeasurements.csv', 'thread_me.csv', 'bottle.csv', 'spread_meta.txt', 'read_metadata.csv', 'Data_and_README.xlsx', 'README_and_data.xlsx', 'Dataset_ReadMe.xlsx', 'Readme-Daten-und-Messwerte.xlsx']) expect(isReadme(n), n).toBe(false);
  });
  it('a README with a table extension is still not a data file', () => {
    expect(isDataFile('README.txt')).toBe(false);
    expect(isDataFile('readme.csv')).toBe(false);
    expect(isDataFile('ctd.txt')).toBe(true);
  });
});

describe('linked records', () => {
  it('Zenodo: README.txt is not downloaded, the table is', async () => {
    const files = ['README.txt', 'ctd.csv'].map((key) => ({ key, size: 10, links: { self: `https://zenodo.org/api/records/7/files/${key}/content` } }));
    const f = new MapFetcher({
      [ZEN + '7']: { body: JSON.stringify({ id: 7, doi: '10.5281/zenodo.7', metadata: { title: 'Z' }, files }) },
      [DC + '10.5281/zenodo.7']: dataciteJson({ doi: '10.5281/zenodo.7', title: 'Z' }, []),
    });
    const out = await loadZenodo('7', f);
    expect(out.files.map((x) => x.name)).toEqual(['ctd.csv']);
    expect(out.findings).toEqual([]);
  });

  it('Dataverse: README.txt is neither read nor listed as "not read"', async () => {
    const host = 'repod.icm.edu.pl';
    const pid = 'doi:10.18150/ABC123';
    const doc = JSON.parse(fixture('dataverse-version-synthetic.json'));
    const readme = JSON.parse(JSON.stringify(doc.data.files[1]));
    readme.label = 'README.txt';
    readme.dataFile.filename = 'README.txt';
    readme.dataFile.id = '9200';
    const zip = JSON.parse(JSON.stringify(readme));
    zip.label = zip.dataFile.filename = 'raw.zip';
    zip.dataFile.id = '9201';
    doc.data.files.push(readme, zip);
    const out = await loadDataverse(host, pid, new MapFetcher({ [dataverseVersionUrl(host, pid)]: { body: JSON.stringify(doc) }, [DC + '10.18150/ABC123']: dataciteJson({ doi: '10.18150/ABC123', title: 'D' }, []) }));
    expect(out.files.map((x) => x.name)).not.toContain('README.txt');
    expect(out.findings.find((x) => x.ruleId === 'IN-FILES-NOT-READ')?.params.files).toBe('raw.zip');
    expect(out.findings.some((x) => x.file === 'README.txt')).toBe(false);
  });

  it('Dataverse: only a README is "no data file", not a README read as a table', async () => {
    const host = 'repod.icm.edu.pl';
    const pid = 'doi:10.18150/ABC123';
    const doc = JSON.parse(fixture('dataverse-version-synthetic.json'));
    const one = doc.data.files[1];
    one.label = one.dataFile.filename = 'Readme.txt';
    doc.data.files = [one];
    const out = await loadDataverse(host, pid, new MapFetcher({ [dataverseVersionUrl(host, pid)]: { body: JSON.stringify(doc) }, [DC + '10.18150/ABC123']: dataciteJson({ doi: '10.18150/ABC123', title: 'D' }, []) }));
    expect(out.files).toEqual([]);
    expect(out.findings.map((x) => x.ruleId)).toContain('IN-NO-DATA-FILE');
  });
});

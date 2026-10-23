// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
// /check with a Dataverse dataset: the files are downloaded in the form the loader chose; a refused download is "held back", not a failed record.
import { describe, expect, it } from 'vitest';
import { loadInputs } from '../../src/app/loadInput';
import { runChecks } from '../../src/core/checks/run';
import { ProxyFetchError, type Fetcher } from '../../src/core/sources/fetcher';
import { fixture } from '../sources/mapFetcher';

const HOST = 'repod.icm.edu.pl';
const LINK = `https://${HOST}/dataset.xhtml?persistentId=doi:10.18150/ABC123`;
const VERSION = `https://${HOST}/api/datasets/:persistentId/versions/:latest-published?persistentId=doi:10.18150/ABC123`;
const enc = (s: string) => new TextEncoder().encode(s);

function fetcher(files: Record<string, number>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      if (url === VERSION) return { status: 200, bytes: enc(fixture('dataverse-version-synthetic.json')), finalUrl: url };
      if (url.startsWith('https://api.datacite.org/')) return { status: 404, bytes: new Uint8Array(), finalUrl: url };
      const status = files[url] ?? 404;
      return { status, bytes: status === 200 ? enc('Station,Lat,Lon\nS1,76.5,15.1\n') : enc('{"status":"ERROR"}'), finalUrl: url };
    },
  };
}

const all = (mode: Record<string, number> = {}) => ({
  [`https://${HOST}/api/access/datafile/9001?format=original`]: 200,
  [`https://${HOST}/api/access/datafile/9002`]: 200,
  [`https://${HOST}/api/access/datafile/9003`]: 200,
  ...mode,
});

describe('loadInputs with a Dataverse link', () => {
  it('a proxy 413 (too_large) on a download whose size the API did not give is IN-FILE-TOO-LARGE, not "could not be opened"', async () => {
    const f = fetcher(all());
    const inner = f.get.bind(f);
    f.get = async (url, accept) => {
      if (url.endsWith('/datafile/9002')) throw new ProxyFetchError('too_large', 413, HOST);
      return inner(url, accept);
    };
    const out = await loadInputs({ files: [], link: LINK, mode: 'server' }, { fetcher: () => f, onProgress: () => undefined });
    expect(out.findings.map((x) => [x.ruleId, x.file, x.params.mb])).toEqual([['IN-FILE-TOO-LARGE', 'bottle.csv', 30]]);
    expect(out.files.map((x) => x.name)).toEqual(['ctd_stations.xlsx', 'survey_spss.tab']);
  });

  it('downloads each readable file in the form chosen, skips the restricted, the oversized and the non-data ones, and names the version', async () => {
    const f = fetcher(all());
    const out = await loadInputs({ files: [], link: LINK, mode: 'browser' }, { fetcher: () => f, onProgress: () => undefined });
    expect(out.files.map((x) => x.name)).toEqual(['ctd_stations.xlsx', 'bottle.csv', 'survey_spss.tab']);
    expect(f.calls.filter((u) => u.includes('/api/access/'))).toEqual([
      `https://${HOST}/api/access/datafile/9001?format=original`,
      `https://${HOST}/api/access/datafile/9002`,
      `https://${HOST}/api/access/datafile/9003`,
    ]);
    const rec = out.records[0]!;
    expect(rec.kind).toBe('dataverse');
    expect(rec.findings.map((x) => [x.ruleId, x.file])).toEqual([
      ['IN-FILE-HELD-BACK', 'restricted_run.tab'],
      ['IN-FILE-TOO-LARGE', 'huge.csv'],
      ['IN-DATAVERSE-FILES', 'RepOD 10.18150/ABC123'],
    ]);
    expect(out.findings).toEqual([]);
  });

  it('a file the server refuses to an anonymous client (401, 403) is held back, named; 404 stays "could not be opened"; the others are still read', async () => {
    const f = fetcher(all({ [`https://${HOST}/api/access/datafile/9001?format=original`]: 403, [`https://${HOST}/api/access/datafile/9002`]: 401, [`https://${HOST}/api/access/datafile/9003`]: 404 }));
    const out = await loadInputs({ files: [], link: LINK, mode: 'server' }, { fetcher: () => f, onProgress: () => undefined });
    expect(out.files).toEqual([]);
    expect(out.findings.map((x) => [x.ruleId, x.file])).toEqual([
      ['IN-FILE-HELD-BACK', 'ctd_stations.xlsx'],
      ['IN-FILE-HELD-BACK', 'bottle.csv'],
      ['IN-RECORD-INACCESSIBLE', 'survey_spss.tab'],
    ]);
    expect(out.findings[0]!.severity).toBe('warning');
  });

  it('the report carries the held-back files and the version as findings: nothing read is never a clean pass', async () => {
    const f = fetcher({});
    const out = await loadInputs({ files: [], link: LINK, mode: 'browser' }, { fetcher: () => f, onProgress: () => undefined });
    const report = runChecks({ datasets: [], records: out.records, parseFindings: out.findings });
    const ids = report.findings.map((x) => x.ruleId);
    expect(ids).toContain('IN-FILE-HELD-BACK');
    expect(ids).toContain('IN-DATAVERSE-FILES');
    expect(ids.filter((x) => x === 'IN-RECORD-INACCESSIBLE').length).toBe(3);
    expect(report.counts.warning).toBeGreaterThan(0);
  });
});

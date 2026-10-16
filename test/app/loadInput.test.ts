// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadInputs, UnknownLinkError, type LoadLine } from '../../src/app/loadInput';
import { FetchBlockedError, type Fetcher } from '../../src/core/sources/fetcher';
import { fixture } from '../sources/mapFetcher';

const csvBytes = new TextEncoder().encode('Station,Lat,Lon\nST1,76.5,15.1\n');
const fileOf = (name: string, text = 'a,b\n1,2\n') => new File([text], name, { type: 'text/csv' });

function zenodoFetcher(fileBehaviour: (url: string) => Error | undefined): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      if (url === 'https://zenodo.org/api/records/2000001') return { status: 200, bytes: new TextEncoder().encode(fixture('sources-zenodo-csv.json')), finalUrl: url };
      const err = fileBehaviour(url);
      if (err) throw err;
      return { status: 200, bytes: csvBytes, finalUrl: url };
    },
  };
}

describe('loadInputs', () => {
  it('reads dropped files into bytes without any network access', async () => {
    const fetcher = zenodoFetcher(() => undefined);
    const lines: LoadLine[][] = [];
    const out = await loadInputs({ files: [fileOf('one.csv', 'x,y\n1,2\n')], mode: 'browser' }, { fetcher: () => fetcher, onProgress: (l) => lines.push(l) });
    expect(out.files).toHaveLength(1);
    expect(out.files[0]).toMatchObject({ name: 'one.csv', source: 'dropped' });
    expect(new TextDecoder().decode(out.files[0].bytes)).toBe('x,y\n1,2\n');
    expect(fetcher.calls).toEqual([]);
    expect(lines.at(-1)?.[0].state).toBe('done');
  });

  it('refuses a link that is not a known record, before any download', async () => {
    const fetcher = zenodoFetcher(() => undefined);
    await expect(loadInputs({ files: [], link: 'https://example.com/some/page', mode: 'browser' }, { fetcher: () => fetcher, onProgress: () => {} })).rejects.toBeInstanceOf(UnknownLinkError);
    expect(fetcher.calls).toEqual([]);
  });

  it('loads a Zenodo record and downloads its data files, with a status line per file', async () => {
    const fetcher = zenodoFetcher(() => undefined);
    const seen: string[] = [];
    const out = await loadInputs(
      { files: [], link: 'https://zenodo.org/records/2000001', mode: 'server' },
      { fetcher: (mode) => { seen.push(mode); return fetcher; }, onProgress: (l) => void l },
    );
    expect(seen).toEqual(['server']);
    expect(out.records).toHaveLength(1);
    expect(out.records[0].files.every((f) => f.bytes === undefined)).toBe(true);
    expect(out.files.map((f) => f.name).sort()).toEqual(['table A.csv', 'table B.xlsx']);
    expect(out.files.every((f) => f.source === 'record')).toBe(true);
    expect(out.findings).toEqual([]);
  });

  it('turns a blocked download into an IN-FETCH-BLOCKED finding with the host and keeps going', async () => {
    const fetcher = zenodoFetcher((url) => (url.includes('table%20A') || url.includes('table A') ? new FetchBlockedError('zenodo.org') : undefined));
    const last: LoadLine[][] = [];
    const out = await loadInputs({ files: [fileOf('mine.csv')], link: '2000001', mode: 'browser' }, { fetcher: () => fetcher, onProgress: (l) => last.push(l) });
    const blocked = out.findings.filter((f) => f.ruleId === 'IN-FETCH-BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].params.host).toBe('zenodo.org');
    expect(blocked[0].file).toBe('table A.csv');
    expect(out.files.map((f) => f.name)).toContain('mine.csv');
    expect(out.files.map((f) => f.name)).toContain('table B.xlsx');
    const final = last.at(-1)!;
    expect(final.find((l) => l.name === 'table A.csv')?.state).toBe('failed');
    expect(final.find((l) => l.name === 'table B.xlsx')?.state).toBe('done');
  });

  it('rethrows an error that is not a download problem', async () => {
    const fetcher = zenodoFetcher(() => new Error('boom'));
    await expect(loadInputs({ files: [], link: '2000001', mode: 'browser' }, { fetcher: () => fetcher, onProgress: () => {} })).rejects.toThrow('boom');
  });
});

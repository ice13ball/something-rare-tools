// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The companion file (plan 8): `(setting),fullList=yes` and `(setting),stationPrefix=yes`, and that /check ignores them.
import { describe, expect, it } from 'vitest';
import { keyHashes } from '../../src/core/convert/keySetting';
import { savedJoinTake, readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { readMappingFile } from '../../src/core/parse/mappingFile';
import { createDirectEngine } from '../../src/worker/handler';
import type { InputFile } from '../../src/worker/protocol';
import { textFile } from '../helpers/files';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dropped = (name: string, text: string): InputFile => ({ name, bytes: enc(text), source: 'dropped' });
const DATA = 'Station,Latitude,Longitude,Date,Temperature [degC]\nS1,55.5,2.5,2021-07-01,7.5\nS2,55.6,2.6,2021-07-02,7.4\n';

describe('the sample join in the companion file', () => {
  const resultsHashes = keyHashes(['Sample', 'Taxon', 'Count'], [0]) as string;
  const descriptionHashes = keyHashes(['Sample', 'Station', 'Date'], [0]) as string;
  const join = (extra: Record<string, unknown> = {}) => ({
    results: ['book.xlsx', 'Counts'] as [string, string],
    description: ['book.xlsx', 'Samples'] as [string, string],
    resultsRows: 3,
    descriptionRows: 3,
    resultsHashes,
    descriptionHashes,
    conflicts: [{ group: 'date', take: 'description' as const, count: 1 }],
    ...extra,
  });

  it('round trips a join, a conflict answered mixed, the results-only count and a declined pair', () => {
    const settings = {
      sampleJoin: [join({ resultsOnly: 2, conflicts: [{ group: 'date', take: 'description', count: 1 }, { group: 'depth', take: 'mixed', count: 4 }] })],
      sampleJoinNo: [{ results: ['book.xlsx', 'Counts'] as [string, string], description: ['other.csv', 'Stations'] as [string, string] }],
    };
    const back = readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar(settings)));
    expect(back?.sampleJoin).toEqual(settings.sampleJoin);
    expect(back?.sampleJoinNo).toEqual(settings.sampleJoinNo);
    expect(back?.sampleJoin?.[0].conflicts[1].take).toBe('mixed');
  });

  it('a sheet name with a colon, a quote or a comma survives, and the file holds no data value', () => {
    const j = join({ results: ['a:b.xlsx', 'Counts: 2021, "raw"'], description: ['a:b.xlsx', 'Samples:1'] });
    const text = writeConvertSidecar({ sampleJoin: [j] });
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.sampleJoin).toEqual([j]);
    expect(text).not.toMatch(/X0\d|ST-\d|2021-05/);
  });

  it('a file or sheet name that contains :[ does not break the conflict line', () => {
    const j = join({ results: ['a:[b.xlsx', 'Counts:[1'], description: ['a:[b.xlsx', 'Samples'], conflicts: [{ group: 'date', take: 'results', count: 3 }] });
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ sampleJoin: [j] })))?.sampleJoin).toEqual([j]);
  });

  it('a line with a bad shape is ignored, and so is a conflict line of a join that is not in the file', () => {
    const odd = writeConvertSidecar({ sampleJoin: [join()] }) + '(setting),sampleJoin=nonsense,,,\n(setting),sampleJoinConflict=description:1:date:[],,,\n(setting),sampleJoinResultsOnly=x:[],,,\n(setting),sampleJoinNo=[1],,,\n';
    const back = readConvertSettings(textFile('c.sidecar.csv', odd));
    expect(back?.sampleJoin).toHaveLength(1);
    expect(back?.sampleJoin?.[0].conflicts).toEqual([{ group: 'date', take: 'description', count: 1 }]);
    expect(back?.sampleJoinNo).toBeUndefined();
  });

  it('a group answered with exceptions, with pairs or without a bulk side is saved as mixed: those hold values', () => {
    expect(savedJoinTake({ take: 'description', exceptions: [] })).toBe('description');
    expect(savedJoinTake({ take: 'results', exceptions: [{ entry: 'abc', take: 'description' }] })).toBe('mixed');
    expect(savedJoinTake({ take: 'results', exceptions: [], pairs: [{ pair: ['a', 'b'], take: 'description' }] })).toBe('mixed');
    expect(savedJoinTake({ exceptions: [{ entry: 'abc', take: 'description' }] })).toBe('mixed');
  });

  it('/check reads a file with join lines as a sidecar and nothing more', () => {
    expect(readMappingFile(textFile('c.sidecar.csv', writeConvertSidecar({ sampleJoin: [join()] })))).toEqual({ singleCruise: false });
  });
});

describe('the converter sidecar', () => {
  it('writes only the ticked settings, in the sidecar format of /check, and reads them back', () => {
    expect(writeConvertSidecar({})).toBe('original_column,output_column,unit,unit_source,p01\n');
    expect(writeConvertSidecar({ fullList: true })).toBe('original_column,output_column,unit,unit_source,p01\n(setting),fullList=yes,,,\n');
    const both = writeConvertSidecar({ fullList: true, prefixStation: true });
    expect(both).toContain('(setting),fullList=yes,,,');
    expect(both).toContain('(setting),stationPrefix=yes,,,');
    expect(readConvertSettings(textFile('c.sidecar.csv', both))).toEqual({ fullList: true, prefixStation: true, worms: false, nvs: false });
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({})))).toEqual({ fullList: false, prefixStation: false, worms: false, nvs: false });
  });

  it('nvs=yes is written only when the box was ticked, read back as a PRE-TICK, and the file holds no word, code, label or identifier', () => {
    expect(writeConvertSidecar({ nvs: true })).toBe('original_column,output_column,unit,unit_source,p01\n(setting),nvs=yes,,,\n');
    expect(writeConvertSidecar({ fullList: true })).not.toContain('nvs');
    expect(writeConvertSidecar({})).not.toContain('nvs');
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ nvs: true })))).toEqual({ fullList: false, prefixStation: false, worms: false, nvs: true });
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ fullList: true, prefixStation: true, worms: true, nvs: true })))).toEqual({ fullList: true, prefixStation: true, worms: true, nvs: true });
    const text = writeConvertSidecar({ fullList: true, worms: true, nvs: true });
    expect(text.trim().split('\n').length).toBe(4);
    expect(text).not.toMatch(/TEMPPR01|vocab\.nerc|temperature|urn:lsid/);
    // /check reads the file as a sidecar and nothing more
    expect(readMappingFile(textFile('c.sidecar.csv', writeConvertSidecar({ nvs: true })))).toEqual({ singleCruise: false });
  });

  it('an unknown setting or value is ignored; a file with another header is not a sidecar', () => {
    const odd = writeConvertSidecar({}) + '(setting),somethingElse=yes,,,\n(setting),fullList=maybe,,,\n';
    expect(readConvertSettings(textFile('odd.csv', odd))).toEqual({ fullList: false, prefixStation: false, worms: false, nvs: false });
    expect(readConvertSettings(textFile('data.csv', DATA))).toBeUndefined();
  });

  it('/check reads a /convert sidecar as a sidecar: singleCruise stays false, the setting rows change nothing', () => {
    const f = textFile('c.sidecar.csv', writeConvertSidecar({ fullList: true, prefixStation: true }));
    expect(readMappingFile(f)).toEqual({ singleCruise: false });
    // and singleCruise alone is still read from the same file when it is there
    expect(readMappingFile(textFile('x.csv', writeConvertSidecar({ fullList: true }) + '(setting),singleCruise=yes,,,\n'))).toEqual({ singleCruise: true });
  });

  it('dropped on /check with data: singleCruise=false, the sidecar is a mapping file and is NOT read as data', async () => {
    const e = createDirectEngine();
    const r = await e.parse([dropped('cruise.csv', DATA), dropped('cruise.convert-sidecar.csv', writeConvertSidecar({ fullList: true, prefixStation: true }))], [], []);
    expect(r.singleCruise).toBe(false);
    expect(r.mappingFiles).toEqual(['cruise.convert-sidecar.csv']);
    expect(r.files.map((f) => f.fileName)).toEqual(['cruise.csv']);
    expect(r.notRead).toEqual([]);
    expect(r.problems).toEqual([]);
  });

  it('written next to a /check sidecar that declares one cruise, /check still reads the cruise and nothing else', async () => {
    const both = writeConvertSidecar({ fullList: true }) + '(setting),singleCruise=yes,,,\n';
    const r = await createDirectEngine().parse([dropped('cruise.csv', DATA), dropped('both.csv', both)], [], []);
    expect(r.singleCruise).toBe(true);
    expect(r.files).toHaveLength(1);
  });
});

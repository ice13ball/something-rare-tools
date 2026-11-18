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

describe('the day/month order in the companion file (round 3, Task 8)', () => {
  const hash = keyHashes(['Sample', 'Date'], [1]) as string;

  it('round trips the order of a column by sheet, header hash and rows, and holds no header text', () => {
    const settings = { dayMonthOrder: [{ sheet: 'Counts', order: 'dmy' as const, hash, rows: 3 }, { sheet: 'a:b.csv', order: 'mdy' as const, hash, rows: 12 }] };
    const text = writeConvertSidecar(settings);
    expect(text).toContain(`dayMonthOrder=dmy:Counts:${hash}:3`);
    expect(text).not.toMatch(/Date/);
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.dayMonthOrder).toEqual(settings.dayMonthOrder);
  });

  it('a malformed line, an unknown order and a repeated column are not kept', () => {
    const lines = [`dayMonthOrder=xyz:Counts:${hash}:3`, 'dayMonthOrder=dmy:Counts:nothex:3', `dayMonthOrder=dmy:Counts:${hash}:3`, `dayMonthOrder=mdy:Counts:${hash}:3`];
    const text = ['original_column,output_column,unit,unit_source,p01', ...lines.map((l) => `(setting),${l},,,`)].join('\n') + '\n';
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.dayMonthOrder).toEqual([{ sheet: 'Counts', order: 'dmy', hash, rows: 3 }]);
  });
});

describe('the decimal reading in the companion file (round 4, Task 4)', () => {
  const hash = keyHashes(['Sample', 'Depth [m]'], [1]) as string;

  it('round trips the reading of a column by sheet, header hash and rows, and holds no header text and no number', () => {
    const settings = { decimalReading: [{ sheet: 'Depth', reading: 'thousands' as const, hash, rows: 3 }, { sheet: 'a:b.csv', reading: 'decimal' as const, hash, rows: 12 }] };
    const text = writeConvertSidecar(settings);
    expect(text).toContain(`decimalReading=thousands:Depth:${hash}:3`);
    expect(text).not.toMatch(/Depth \[m\]/);
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.decimalReading).toEqual(settings.decimalReading);
  });

  it('a malformed line, an unknown reading and a repeated column are not kept', () => {
    const lines = [`decimalReading=xyz:Depth:${hash}:3`, 'decimalReading=thousands:Depth:nothex:3', `decimalReading=thousands:Depth:${hash}:x`, `decimalReading=thousands:Depth:${hash}:3`, `decimalReading=decimal:Depth:${hash}:3`];
    const text = ['original_column,output_column,unit,unit_source,p01', ...lines.map((l) => `(setting),${l},,,`)].join('\n') + '\n';
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.decimalReading).toEqual([{ sheet: 'Depth', reading: 'thousands', hash, rows: 3 }]);
  });

  it('is not written for a reading that is no answer', () => {
    const text = writeConvertSidecar({ decimalReading: [{ sheet: 'Depth', reading: 'sideways' as never, hash, rows: 3 }] });
    expect(text).not.toContain('decimalReading=');
  });
});

describe('the declared position in the companion file (round 3, Task 11)', () => {
  const one = { sheet: 'Tanks', lat: '-54,125', lon: '10.9', uncertaintyM: '500', rows: 12 };

  it('round-trips a negative decimal-comma latitude, whose field is quoted', () => {
    const text = writeConvertSidecar({ declaredPosition: [one] });
    expect(text).toContain('"declaredPosition=-54,125:10.9:500:12:Tanks"');
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.declaredPosition).toEqual([one]);
  });

  it('keeps a colon in a sheet name, one line per sheet, and skips what it cannot read back', () => {
    const odd = { sheet: 'A:B', lat: '1', lon: '2', uncertaintyM: '3', rows: 7 };
    const text = writeConvertSidecar({ declaredPosition: [odd, { ...odd, lat: '9' }, { sheet: 'X', lat: '1:2', lon: '2', uncertaintyM: '3', rows: 1 }, { sheet: 'Y', lat: '', lon: '2', uncertaintyM: '3', rows: 1 }] });
    const read = readConvertSettings(textFile('c.sidecar.csv', text))?.declaredPosition;
    expect(read).toEqual([odd]);
  });

  it('a line without the number of rows of its sheet is not read (the position holds only for the sheet it was typed for)', () => {
    const text = ['original_column,output_column,unit,unit_source,p01', '(setting),declaredPosition=54.1:10.9:500:Tanks,,,'].join('\n') + '\n';
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.declaredPosition ?? []).toEqual([]);
  });

  it('is ignored by /check as every other setting', () => {
    const text = writeConvertSidecar({ declaredPosition: [one] });
    expect(readMappingFile(textFile('c.sidecar.csv', text))).toBeDefined();
  });
});

describe('the declared date in the companion file (round 3, Task 17)', () => {
  const one = { sheet: 'Tanks', value: '2021-05', rows: 12 };

  it('round-trips a month and an interval, one line per sheet, sheet last', () => {
    const interval = { sheet: 'A:B', value: '2020-01-01/2021-12-31', rows: 7 };
    const text = writeConvertSidecar({ declaredDate: [one, interval] });
    expect(text).toContain('declaredDate=2021-05:12:Tanks');
    expect(text).toContain('declaredDate=2020-01-01/2021-12-31:7:A:B');
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.declaredDate).toEqual([one, interval]);
  });

  it('skips what it cannot read back: text that is no date shape, a repeated sheet, a missing row count', () => {
    const text = writeConvertSidecar({ declaredDate: [one, { ...one, value: '2020' }, { sheet: 'X', value: 'May 2021', rows: 1 }, { sheet: 'Y', value: '2021:05', rows: 1 }, { sheet: '', value: '2021', rows: 1 }] });
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.declaredDate).toEqual([one]);
    const old = ['original_column,output_column,unit,unit_source,p01', '(setting),declaredDate=2021-05:Tanks,,,', '(setting),declaredDate=soon:3:Tanks,,,'].join('\n') + '\n';
    expect(readConvertSettings(textFile('c.sidecar.csv', old))?.declaredDate ?? []).toEqual([]);
  });

  it('is ignored by /check as every other setting', () => {
    expect(readMappingFile(textFile('c.sidecar.csv', writeConvertSidecar({ declaredDate: [one] })))).toBeDefined();
  });
});

describe('"each row is its own record" in the companion file (round 3, Task 13)', () => {
  it('round-trips the tick with the rows it was given for, and the kept copies with their count; the file holds no value', () => {
    const settings = { ownRecords: [{ sheet: 'Fish', rows: 3 }, { sheet: 'a:b.csv', rows: 12 }], keepCopiesRows: [{ sheet: 'Fish', count: 1 }] };
    const text = writeConvertSidecar(settings);
    expect(text).toContain('ownRecords=3:Fish');
    expect(text).toContain('keepCopiesRows=1:Fish');
    const read = readConvertSettings(textFile('c.sidecar.csv', text));
    expect(read?.ownRecords).toEqual(settings.ownRecords);
    expect(read?.keepCopiesRows).toEqual(settings.keepCopiesRows);
  });

  it('a line with no number, a repeated sheet and a fractional count are not kept; /check ignores the lines', () => {
    const lines = ['ownRecords=Fish', 'ownRecords=x:Fish', 'ownRecords=3:Fish', 'ownRecords=4:Fish', 'keepCopiesRows=1.5:Fish', 'keepCopiesRows=2:Fish'];
    const text = ['original_column,output_column,unit,unit_source,p01', ...lines.map((l) => `(setting),${l},,,`)].join('\n') + '\n';
    const read = readConvertSettings(textFile('c.sidecar.csv', text));
    expect(read?.ownRecords).toEqual([{ sheet: 'Fish', rows: 3 }]);
    expect(read?.keepCopiesRows).toEqual([{ sheet: 'Fish', count: 2 }]);
    expect(readMappingFile(textFile('c.sidecar.csv', text))).toBeDefined();
  });
});

describe('the turn in the companion file', () => {
  const nameHash = keyHashes(['Taxon', 'S1', 'S2', 'Total'], [0]) as string;
  const notSampleHashes = keyHashes(['Taxon', 'S1', 'S2', 'Total'], [3]) as string;
  const roundTrip = (turned: NonNullable<ReturnType<typeof readConvertSettings>>['turned']) => {
    const text = writeConvertSidecar({ turned });
    return { text, read: readConvertSettings(textFile('run.sidecar.csv', text) as never) };
  };

  it('round trips a turn with its hashes and rows, with and without the header dates and with no column that is not a sample', () => {
    const { text, read } = roundTrip([
      { sheet: 'Taxa', nameHash, notSampleHashes, rows: 2 },
      { sheet: 'Fish: 2023', nameHash, notSampleHashes: '', rows: 7, headerDates: true },
    ]);
    expect(text).toContain(`turned=Taxa:${nameHash}:2:${notSampleHashes}`);
    expect(read?.turned).toEqual([
      { sheet: 'Taxa', nameHash, notSampleHashes, rows: 2 },
      { sheet: 'Fish: 2023', nameHash, notSampleHashes: '', rows: 7, headerDates: true },
    ]);
  });

  it('holds no header text, and a malformed line reads as nothing', () => {
    const { text } = roundTrip([{ sheet: 'Taxa', nameHash, notSampleHashes, rows: 2 }]);
    expect(text).not.toContain('Taxon');
    const bad = `${text}(setting),turned=Taxa:nothash:2:\n(setting),turned=Taxa:${nameHash}:x:\n`;
    expect(readConvertSettings(textFile('run.sidecar.csv', bad) as never)?.turned).toHaveLength(1);
    expect(writeConvertSidecar({ turned: [{ sheet: 'Taxa', nameHash: 'Taxon', notSampleHashes: '', rows: 2 }] })).not.toContain('turned=');
  });
});

describe('the encoding pick in the companion file (round 4, Task 6)', () => {
  it('round trips the code page by the hash of the file bytes and holds nothing else', () => {
    const settings = { encoding: [{ encoding: 'windows-1252' as const, hash: '0a1b2c3d' }, { encoding: 'iso-8859-2' as const, hash: 'deadbeef' }] };
    const text = writeConvertSidecar(settings);
    expect(text).toContain('encoding=windows-1252:0a1b2c3d');
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.encoding).toEqual(settings.encoding);
  });

  it('a malformed line, an unknown code page, a bad hash and a repeated hash are not kept; a pick that is no answer is not written', () => {
    const lines = ['encoding=utf-8:0a1b2c3d', 'encoding=windows-1252:nothex', 'encoding=windows-1252:0a1b2c3', 'encoding=windows-1252:0a1b2c3d', 'encoding=iso-8859-2:0a1b2c3d'];
    const text = ['original_column,output_column,unit,unit_source,p01', ...lines.map((l) => `(setting),${l},,,`)].join('\n') + '\n';
    expect(readConvertSettings(textFile('c.sidecar.csv', text))?.encoding).toEqual([{ encoding: 'windows-1252', hash: '0a1b2c3d' }]);
    expect(writeConvertSidecar({ encoding: [{ encoding: 'utf-8' as never, hash: '0a1b2c3d' }, { encoding: 'windows-1252', hash: 'xyz' }] })).not.toContain('encoding=');
  });
});

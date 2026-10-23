// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Darwin Core Archives built in the test from synthetic files: no real third-party data.
import { describe, expect, it } from 'vitest';
import { isArchiveZip, parseDwca, parseFileAsync } from '../../src/core/parse';
import type { ParsedFile } from '../../src/core/types';
import { emlXml, makeZip, metaXml, nodeInflate, type TestEntry } from '../helpers/zipfile';
import { createDirectEngine } from '../../src/worker/handler';
import * as XLSX from 'xlsx';

const FIELDS = { 1: 'occurrenceID', 2: 'locality', 3: 'decimalLatitude', 4: 'decimalLongitude', 5: 'eventDate', 6: 'minimumDepthInMeters' };
const HEADER = 'id\toccurrenceID\tlocality\tdecimalLatitude\tdecimalLongitude\teventDate\tminimumDepthInMeters';
const ROWS = ['1\to1\tBay A\t61.25\t4.5\t2008-05-01\t10', '2\to2\tBay A\t61.26\t4.51\t2008-05-02\t15', '3\to3\tBay B\t61.30\t4.6\t2009-07-21\t20'];
const EML = emlXml('Synthetic Bay Survey', 'abc-123/v1.4', '2025-09-17');

const dwca = (core: string, extra: TestEntry[] = [], meta = metaXml({ fields: FIELDS }), eml: string | null = EML): Uint8Array =>
  makeZip([{ name: 'meta.xml', data: meta }, ...(eml === null ? [] : [{ name: 'eml.xml', data: eml }]), { name: 'occurrence.txt', data: core }, ...extra]);
const read = (zip: Uint8Array, maxRows?: number): Promise<ParsedFile> => parseDwca('survey.zip', zip, nodeInflate, maxRows === undefined ? {} : { maxRows });
const ids = (f: ParsedFile) => f.findings.map((x) => x.ruleId);
const one = (f: ParsedFile, id: string) => f.findings.find((x) => x.ruleId === id);

describe('Darwin Core Archive, Occurrence core', () => {
  it('reads the core with a header row: header from meta.xml, header line skipped, physical line numbers kept', async () => {
    const f = await read(dwca([HEADER, ...ROWS].join('\n') + '\n'));
    expect(f.kind).toBe('csv');
    expect(f.sheets).toHaveLength(1);
    const s = f.sheets[0];
    expect(s.name).toBe('occurrence.txt');
    expect(s.header).toEqual(['id', 'occurrenceID', 'locality', 'decimalLatitude', 'decimalLongitude', 'eventDate', 'minimumDepthInMeters']);
    expect(s.rows.map((r) => r.line)).toEqual([2, 3, 4]);
    expect(s.rows[1].cells).toEqual(['2', 'o2', 'Bay A', '61.26', '4.51', '2008-05-02', '15']);
  });

  it('meta.xml wins over the file: a different header row in the file is ignored, not used', async () => {
    const f = await read(dwca(['a\tb\tc\td\te\tf\tg', ...ROWS].join('\n')));
    expect(f.sheets[0].header[3]).toBe('decimalLatitude');
    expect(f.sheets[0].rows).toHaveLength(3);
  });

  it('reads a core with no header row (ignoreHeaderLines=0): the first line is data, line 1', async () => {
    const meta = metaXml({ fields: FIELDS, coreAttrs: 'encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="0"' });
    const f = await read(dwca(ROWS.join('\n') + '\n', [], meta));
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([1, 2, 3]);
    expect(f.sheets[0].rows[0].cells[2]).toBe('Bay A');
  });

  it('counts physical lines across blank lines and CRLF', async () => {
    const f = await read(dwca([HEADER, ROWS[0], '', ROWS[1], '', '', ROWS[2]].join('\r\n') + '\r\n', [], metaXml({ fields: FIELDS, coreAttrs: 'encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\r\\n" fieldsEnclosedBy="" ignoreHeaderLines="1"' })));
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([2, 4, 7]);
  });

  it('does not take a stray quote for an enclosure when fieldsEnclosedBy is empty, and honours a real one', async () => {
    const plain = await read(dwca([HEADER, '1\to1\t"Bay A\t61.25\t4.5\t2008-05-01\t10', ROWS[1]].join('\n')));
    expect(plain.sheets[0].rows).toHaveLength(2);
    expect(plain.sheets[0].rows[0].cells[2]).toBe('"Bay A');
    const meta = metaXml({ fields: FIELDS, coreAttrs: 'encoding="UTF-8" fieldsTerminatedBy="," linesTerminatedBy="\\n" fieldsEnclosedBy="&quot;" ignoreHeaderLines="1"' });
    const csv = ['h', '1,o1,"Bay, A\nline two",61.25,4.5,2008-05-01,10', '2,o2,B,61.3,4.6,2009-01-01,20'].join('\n');
    const q = await read(dwca(csv, [], meta));
    expect(q.sheets[0].rows.map((r) => r.line)).toEqual([2, 4]);
    expect(q.sheets[0].rows[0].cells[2]).toBe('Bay, A\nline two');
  });

  it('names an unlisted column colN and numbers a repeated term', async () => {
    const meta = metaXml({ fields: { 1: 'occurrenceID', 3: 'decimalLatitude', 4: 'http://purl.org/dc/terms/locality', 5: 'locality' } });
    const f = await read(dwca('x\n1\t2\t3\t4\t5\t6\n', [], meta));
    expect(f.sheets[0].header).toEqual(['id', 'occurrenceID', 'col2', 'decimalLatitude', 'locality', 'locality_2']);
  });

  it('reads a non-UTF-8 core by the encoding meta.xml declares', async () => {
    const meta = metaXml({ fields: FIELDS, coreAttrs: 'encoding="ISO-8859-1" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="1"' });
    const bytes = new Uint8Array([...new TextEncoder().encode(HEADER + '\n1\to1\tBa'), 0xef, ...new TextEncoder().encode(' A\t61.25\t4.5\t2008-05-01\t10\n')]);
    const f = await read(dwca(bytes as unknown as string, [], meta));
    expect(f.sheets[0].rows[0].cells[2]).toBe('Baï A');
  });

  it('says which version and date it read (eml.xml packageId and pubDate), and the dataset title', async () => {
    const f = await read(dwca([HEADER, ...ROWS].join('\n')));
    const v = one(f, 'IN-DWCA-VERSION')!;
    expect(v.severity).toBe('info');
    expect(v.file).toBe('survey.zip');
    expect(v.params).toEqual({ title: 'Synthetic Bay Survey', version: 'v1.4, published 2025-09-17', core: 'Occurrence' });
  });

  it('without eml.xml, or with an unreadable one, the version is n/a and the core is still read', async () => {
    const none = await read(dwca([HEADER, ...ROWS].join('\n'), [], metaXml({ fields: FIELDS }), null));
    expect(one(none, 'IN-DWCA-VERSION')!.params).toMatchObject({ title: 'survey.zip', version: 'n/a' });
    const broken = await read(dwca([HEADER, ...ROWS].join('\n'), [], metaXml({ fields: FIELDS }), '<eml'));
    expect(one(broken, 'IN-DWCA-VERSION')!.params.version).toBe('n/a');
    expect(broken.sheets[0].rows).toHaveLength(3);
  });
});

describe('Darwin Core Archive, Event core', () => {
  const eventMeta = (ext = true) =>
    metaXml({
      rowType: 'http://rs.tdwg.org/dwc/terms/Event',
      location: 'event.txt',
      fields: { 1: 'eventID', 2: 'locality', 3: 'decimalLatitude', 4: 'decimalLongitude', 5: 'eventDate' },
      extensions: ext
        ? '<extension encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="1" rowType="http://rs.tdwg.org/dwc/terms/Occurrence"><files><location>occurrence.txt</location></files><coreid index="0"/><field index="1" term="http://rs.tdwg.org/dwc/terms/scientificName"/></extension>'
        : '',
    });
  const events = 'id\teventID\tlocality\tdecimalLatitude\tdecimalLongitude\teventDate\n1\te1\tBay A\t61.25\t4.5\t2008-05-01\n2\te2\tBay B\t61.3\t4.6\t2009-07-21\n';
  const occ = 'id\tscientificName\n1\tA a\n1\tB b\n2\tC c\n';
  const zip = (m = eventMeta()) => makeZip([{ name: 'meta.xml', data: m }, { name: 'eml.xml', data: EML }, { name: 'event.txt', data: events }, { name: 'occurrence.txt', data: occ }]);

  it('checks the event table, and says how many occurrence rows there are and that positions are the events', async () => {
    const f = await read(zip());
    expect(f.sheets).toHaveLength(1);
    expect(f.sheets[0].name).toBe('event.txt');
    expect(f.sheets[0].header).toContain('eventID');
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([2, 3]);
    const e = one(f, 'IN-DWCA-EVENT-CORE')!;
    expect(e.severity).toBe('info');
    expect(e.params).toEqual({ occurrences: 3 });
    expect(one(f, 'IN-DWCA-VERSION')!.params.core).toBe('Event');
  });

  it('an Event core without an Occurrence extension is still checked, with no occurrence note', async () => {
    const f = await read(zip(eventMeta(false)));
    expect(f.sheets[0].rows).toHaveLength(2);
    expect(ids(f)).not.toContain('IN-DWCA-EVENT-CORE');
  });
});

describe('Darwin Core Archive, refusals are findings and never a silent pass', () => {
  it('any other core (Taxon) is not supported: an error finding, no sheets', async () => {
    const meta = metaXml({ rowType: 'http://rs.tdwg.org/dwc/terms/Taxon', fields: { 1: 'scientificName' } });
    const f = await read(dwca('id\tscientificName\n1\tA a\n', [], meta));
    expect(f.sheets).toEqual([]);
    expect(ids(f)).toEqual(['IN-DWCA-UNSUPPORTED-CORE']);
    expect(f.findings[0].severity).toBe('error');
    expect(f.findings[0].params).toEqual({ core: 'Taxon' });
  });

  it('a zip that is not a DwC-A (no meta.xml) says so', async () => {
    const f = await read(makeZip([{ name: 'readme.txt', data: 'hello' }]));
    expect(f.sheets).toEqual([]);
    expect(ids(f)).toEqual(['IN-DWCA-NOT-ARCHIVE']);
  });

  it('a meta.xml hidden under a path trick does not count as meta.xml', async () => {
    for (const name of ['../meta.xml', '/meta.xml', 'sub/../meta.xml']) {
      const f = await read(makeZip([{ name, data: metaXml({ fields: FIELDS }) }, { name: 'occurrence.txt', data: HEADER }]));
      expect(ids(f)).toEqual(['IN-DWCA-NOT-ARCHIVE']);
    }
  });

  it('a core location that climbs out of the archive is never read', async () => {
    const f = await read(makeZip([{ name: 'meta.xml', data: metaXml({ fields: FIELDS, location: '../occurrence.txt' }) }, { name: '../occurrence.txt', data: HEADER }]));
    expect(ids(f)).toEqual(['IN-DWCA-UNREADABLE']);
    expect(f.findings[0].params.reason).toBe('DWCA-CORE-MISSING');
  });

  it('a malformed meta.xml, one with a DTD (entity bomb) or without a core is unreadable, with a code', async () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "xxxxxxxxxx"><!ENTITY y "&x;&x;&x;&x;&x;&x;&x;&x;">]><archive><core rowType="x"/></archive>';
    for (const meta of ['<archive', bomb, '<archive xmlns="http://rs.tdwg.org/dwc/text/"/>', '<other/>']) {
      const f = await read(dwca(HEADER, [], meta));
      expect(ids(f), meta).toEqual(['IN-DWCA-UNREADABLE']);
      expect(f.findings[0].params.reason).toBe('DWCA-META-INVALID');
      expect(f.sheets).toEqual([]);
    }
  });

  it('an encrypted entry, ZIP64, an unsupported method and a bomb-like entry are refused with their code', async () => {
    const reason = async (zip: Uint8Array) => {
      const f = await read(zip);
      expect(ids(f)).toEqual(['IN-DWCA-UNREADABLE']);
      expect(f.sheets).toEqual([]);
      return f.findings[0].params.reason;
    };
    expect(await reason(makeZip([{ name: 'meta.xml', data: metaXml({ fields: FIELDS }), flags: 1 }]))).toBe('ZIP-ENCRYPTED');
    expect(await reason(makeZip([{ name: 'meta.xml', data: '<x/>' }], { zip64Locator: true }))).toBe('ZIP-ZIP64');
    expect(await reason(makeZip([{ name: 'meta.xml', data: '<x/>', method: 14 }]))).toBe('ZIP-METHOD');
    expect(await reason(makeZip([{ name: 'meta.xml', data: metaXml({ fields: FIELDS }) }, { name: 'occurrence.txt', data: new Uint8Array(20 * 1024 * 1024) }]))).toBe('ZIP-BOMB');
    // a core that claims 10 bytes and inflates to megabytes
    const liar = makeZip([{ name: 'meta.xml', data: metaXml({ fields: FIELDS }) }, { name: 'occurrence.txt', data: new Uint8Array(3 * 1024 * 1024).fill(0x61), size: 10 }]);
    expect(await reason(liar)).toBe('ZIP-BOMB');
  });

  it('garbage and truncated zips become findings, not exceptions', async () => {
    const good = dwca([HEADER, ...ROWS].join('\n'));
    for (const bytes of [good.subarray(0, 40), good.subarray(0, good.length - 10), new Uint8Array([0x50, 0x4b, 3, 4, ...new Array(50).fill(7)])]) {
      const f = await read(bytes);
      expect(ids(f)).toEqual(['IN-DWCA-UNREADABLE']);
    }
  });
});

describe('Darwin Core Archive, sample cap', () => {
  const many = (n: number) => [HEADER, ...Array.from({ length: n }, (_, i) => `${i + 1}\to${i}\tBay\t61.${i % 90}\t4.5\t2008-05-01\t10`)].join('\n') + '\n';

  it('above the cap reads only the first rows, keeps their physical lines and says N of M, as a warning', async () => {
    const f = await read(dwca(many(12)), 5);
    expect(f.sheets[0].rows).toHaveLength(5);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6]);
    expect(f.sheets[0].rows[4].cells[1]).toBe('o4');
    const p = one(f, 'IN-DWCA-PARTIAL')!;
    expect(p.severity).toBe('warning');
    expect(p.params).toEqual({ read: 5, total: 12 });
  });

  it('exactly at the cap is a full read, with no partial finding', async () => {
    const f = await read(dwca(many(5)), 5);
    expect(f.sheets[0].rows).toHaveLength(5);
    expect(ids(f)).not.toContain('IN-DWCA-PARTIAL');
  });

  it('the cap works for a core without header lines too', async () => {
    const meta = metaXml({ fields: FIELDS, coreAttrs: 'encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="0"' });
    const f = await read(dwca(many(12).split('\n').slice(1).join('\n'), [], meta), 4);
    expect(f.sheets[0].rows.map((r) => r.line)).toEqual([1, 2, 3, 4]);
    expect(one(f, 'IN-DWCA-PARTIAL')!.params).toEqual({ read: 4, total: 12 });
  });
});

describe('dispatch and the worker', () => {
  it('isArchiveZip: a DwC-A and any non-workbook zip yes, an xlsx and non-zip bytes no', () => {
    expect(isArchiveZip(dwca(HEADER), 'survey.zip')).toBe(true);
    expect(isArchiveZip(dwca(HEADER), 'SURVEY.ZIP')).toBe(true);
    expect(isArchiveZip(makeZip([{ name: 'readme.txt', data: 'hi' }]), 'x.zip')).toBe(true);
    expect(isArchiveZip(new TextEncoder().encode('a,b\n1,2\n'), 'x.zip')).toBe(false);
  });

  it('an xlsx still goes through the workbook parser', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['station', 'lat'], ['A', 1]]), 'S');
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    expect(isArchiveZip(bytes, 'w.xlsx')).toBe(false);
    const f = await parseFileAsync('w.xlsx', bytes, nodeInflate);
    expect(f.kind).toBe('xlsx');
      });

  it('a file NAMED .xlsx whose zip is corrupt keeps the workbook error path, not IN-DWCA-UNREADABLE; the same bytes named .zip are an archive refusal', async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array<number>(100).fill(0x41)]); // zip magic, no central directory
    expect(isArchiveZip(corrupt, 'book.xlsx')).toBe(false);
    expect(isArchiveZip(dwca(HEADER), 'book.xlsx')).toBe(false); // a readable non-workbook zip under an .xlsx name is still the workbook path
    await expect(parseFileAsync('book.xlsx', corrupt, nodeInflate)).rejects.toThrow(/book\.xlsx/);
    const engine = createDirectEngine({ inflate: nodeInflate });
    const parsed = await engine.parse([{ name: 'book.xlsx', bytes: corrupt, source: 'dropped' }], [], []);
    expect(parsed.files).toEqual([]);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0].fileName).toBe('book.xlsx');
    const asZip = await parseFileAsync('book.zip', corrupt, nodeInflate);
    expect(ids(asZip)).toContain('IN-DWCA-UNREADABLE');
  });

  it('end to end: the engine checks the core, a bad latitude points at its physical line, the version and PARTIAL travel with the report', async () => {
    const rows = ['1\to1\tBay A\t61.25\t4.5\t2008-05-01\t10', '2\to2\tBay A\t95.5\t4.51\t2008-05-02\t15', '3\to3\tBay B\t61.30\t4.6\t2009-07-21\t20'];
    const engine = createDirectEngine({ inflate: nodeInflate });
    const parsed = await engine.parse([{ name: 'survey.zip', bytes: dwca([HEADER, ...rows].join('\n') + '\n'), source: 'dropped' }], [], []);
    expect(parsed.problems).toEqual([]);
    expect(parsed.files).toHaveLength(1);
    const f = parsed.files[0];
    await engine.build(f.fileId, f.layout, f.mappings);
    const { report } = await engine.check();
    expect(report.findings.filter((x) => x.ruleId === 'ROW-LAT-RANGE').flatMap((x) => x.lines ?? [])).toEqual([3]);
    expect(report.findings.map((x) => x.ruleId)).toContain('IN-DWCA-VERSION');
    expect(report.findings.map((x) => x.ruleId)).not.toContain('IN-DWCA-PARTIAL');
  });

  it('end to end: a refused archive reaches the report as an error, never as "no problems"', async () => {
    const engine = createDirectEngine({ inflate: nodeInflate });
    const parsed = await engine.parse([{ name: 'taxa.zip', bytes: makeZip([{ name: 'meta.xml', data: metaXml({ rowType: 'http://rs.tdwg.org/dwc/terms/Taxon', fields: { 1: 'scientificName' } }) }, { name: 'occurrence.txt', data: 'x' }]), source: 'dropped' }], [], []);
    expect(parsed.files).toEqual([]);
    expect(parsed.notRead.map((n) => n.fileName)).toEqual(['taxa.zip']);
    const { report } = await engine.check();
    expect(report.findings.map((x) => [x.ruleId, x.severity])).toEqual([['IN-DWCA-UNSUPPORTED-CORE', 'error']]);
  });
});

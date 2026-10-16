// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePangaeaText } from '../../src/core/parse/pangaea';
import { parseFile } from '../../src/core/parse';

const bytes = readFileSync(new URL('../fixtures/pangaea-synthetic.tab', import.meta.url));
const text = bytes.toString('utf-8');

describe('parsePangaeaText', () => {
  const f = parsePangaeaText(text, 'syn.tab');
  const md = f.embeddedMetadata!;

  it('reads the table header and physical line numbers (header block counted)', () => {
    expect(f.kind).toBe('pangaea');
    const s = f.sheets[0];
    expect(s.header).toEqual(['Event', 'Date/Time', 'Latitude', 'Longitude', 'Temp [°C]', 'Sal']);
    expect(s.headerLine).toBe(20);
    expect(s.rows.map((r) => r.line)).toEqual([21, 22, 24, 25]);
    expect(s.rows[0].cells).toEqual(['ST1', '2099-01-02T00:00', '70.1', '10.1', '4.5', '34.9']);
    expect(s.rows[1].cells[5]).toBe('');
    expect(f.decimalComma).toBe(false);
  });

  it('flags the row with an extra field as ragged, never realigned', () => {
    const r = f.findings.filter((x) => x.ruleId === 'ROW-RAGGED');
    expect(r).toHaveLength(1);
    expect(r[0].lines).toEqual([25]);
    expect(r[0].params).toEqual({ expected: 6, found: 7 });
    expect(f.sheets[0].rows[3].cells).toHaveLength(7);
  });

  it('reads the licence with URI and SPDX id', () => {
    expect(md.source).toBe('pangaea');
    expect(md.licences).toHaveLength(1);
    expect(md.licences[0]).toMatchObject({
      source: 'pangaea',
      field: 'License',
      uri: 'https://creativecommons.org/licenses/by/4.0/',
      spdx: 'CC-BY-4.0',
    });
    expect(md.licences[0].text).toContain('Creative Commons Attribution 4.0 International');
  });

  it('reads the bounding box from the bounds, ignoring median and event positions', () => {
    expect(md.bbox).toEqual({ south: 70, west: 10, north: 71, east: 10.5 });
  });

  it('reads the temporal extent from the continuation line', () => {
    expect(md.temporalExtent).toEqual({ start: '2099-01-02', end: '2099-03-04' });
  });

  it('matches parameters to columns by position: long name and unit', () => {
    expect(md.parameters).toEqual([
      { name: 'Event' },
      { name: 'DATE/TIME' },
      { name: 'LATITUDE' },
      { name: 'LONGITUDE' },
      { name: 'Temperature, water', unit: '°C' },
      { name: 'Salinity' },
    ]);
    expect(md.parameters).toHaveLength(f.sheets[0].header.length);
  });

  it('takes the title from the citation and the DOI from its link', () => {
    expect(md.title).toBe('Synthetic fjord CTD profiles');
    expect(md.doi).toBe('10.1594/PANGAEA.000000');
    expect(md.abstract).toBe('Invented abstract of a synthetic data set.');
    expect(md.label).toBe('syn.tab');
  });

  it('turns a single LATITUDE/LONGITUDE coverage into a degenerate bbox', () => {
    const t = text
      .split('\n')
      .map((l) => (l.startsWith('Coverage:') ? 'Coverage:\tLATITUDE: 12.5 * LONGITUDE: -33.25' : l))
      .join('\n');
    expect(parsePangaeaText(t, 's.tab').embeddedMetadata!.bbox).toEqual({ south: 12.5, north: 12.5, west: -33.25, east: -33.25 });
  });

  it('survives a file with no header block terminator', () => {
    const f2 = parsePangaeaText('/* DATA DESCRIPTION:\nCitation:\tx\n', 'bad.tab');
    expect(f2.sheets).toEqual([]);
  });
});

describe('parseFile dispatch for PANGAEA', () => {
  it('recognises the header block and decodes the unit symbol', () => {
    const f = parseFile('whatever.txt', new Uint8Array(bytes));
    expect(f.kind).toBe('pangaea');
    expect(f.encoding).toBe('utf-8');
    expect(f.sheets[0].header[4]).toBe('Temp [°C]');
  });
});

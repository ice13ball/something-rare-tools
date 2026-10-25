// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The review and BioCheck fixes of stage 2: scientificNameID, columns that are not written, the sampling device and mesh size, numbers from the source text,
// the line breaks that break a tab-separated file, the ZIP caps, and the findings the output checks must not raise by mistake. Every value is invented.
import { describe, expect, it } from 'vitest';
import { sourceNumberText } from '../../src/core/convert/build';
import { hasTabOrNewline, shownText } from '../../src/core/convert/ids';
import { judge } from '../../src/core/convert/policy';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { DEVICES, P01, P06 } from '../../src/core/convert/vocab';
import { ZipWriteError, buildZip } from '../../src/core/convert/zip';
import { openZip } from '../../src/core/parse/zip';
import { rawSheet } from '../helpers/files';
import { nodeInflate } from '../helpers/zipfile';
import { exportSheet, nodeDeflate, objects, readBack } from './exportHelpers';
import { CTX, W1_HEADER, W1_QUANTITY, W1_ROWS, W2_HEADER, W2_QUANTITY, W2_ROWS } from './helpers';
import type { Cell } from './helpers';

const LSID = 'urn:lsid:marinespecies.org:taxname:';
const longHeader = (idHeader: string): string[] => ['Sample', 'Species', idHeader, 'Count', 'Latitude', 'Longitude', 'Date'];
const longRows: Cell[][] = [
  ['A1', 'Calanus finmarchicus', 104464, 4, 55.5, 2.5, '2023-06-14'],
  ['A1', 'Oithona similis', 106656, 9, 55.5, 2.5, '2023-06-14'],
];

describe('scientificNameID', () => {
  for (const h of ['AphiaID', 'aphia_id', 'Aphia ID']) {
    it(`a column headed exactly "${h}" with whole numbers becomes the taxon ID and is written as the urn:lsid`, async () => {
      const p = proposeConvertColumns(rawSheet(longHeader(h), longRows.map((r) => [...r])), CTX).find((x) => x.header === h)!;
      expect(p.role).toEqual({ kind: 'taxonId', aphia: true });
      expect(p.reasonCode).toBe('name-aphiaid');
      const e = await exportSheet(longHeader(h), longRows, { quantity: { kind: 'count' } });
      const occ = objects((await readBack(e.zip)).tables['occurrence.txt']);
      expect(occ.map((o) => o.scientificNameID)).toEqual([`${LSID}104464`, `${LSID}106656`]);
      expect(e.findings.some((f) => f.ruleId === 'CONV-NAMEID-MISSING')).toBe(false);
      expect(e.findings.some((f) => f.ruleId === 'DWC-RECOMMENDED' && String(f.params.terms).includes('scientificNameID'))).toBe(false);
    });
  }

  it('nothing else is read as an AphiaID: another header, another case, a column with a cell that is not a whole number', () => {
    for (const h of ['WoRMS ID', 'aphiaid', 'AphiaId', 'APHIAID', 'Aphia_ID', 'Taxon ID']) {
      const p = proposeConvertColumns(rawSheet(longHeader(h), longRows.map((r) => [...r])), CTX).find((x) => x.header === h)!;
      expect(p.role.kind, h).not.toBe('taxonId');
    }
    const bad = longRows.map((r, i) => (i === 1 ? [r[0], r[1], '106656a', ...r.slice(3)] : [...r]));
    expect(proposeConvertColumns(rawSheet(longHeader('AphiaID'), bad), CTX).find((x) => x.header === 'AphiaID')!.role.kind).not.toBe('taxonId');
    const neg = longRows.map((r, i) => (i === 1 ? [r[0], r[1], 0, ...r.slice(3)] : [...r]));
    expect(proposeConvertColumns(rawSheet(longHeader('AphiaID'), neg), CTX).find((x) => x.header === 'AphiaID')!.role.kind).not.toBe('taxonId');
  });

  it('the Darwin Core term scientificNameID is the taxon ID and is written as given, whatever it holds', async () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'scientificNameID', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const rows: Cell[][] = [['o1', 'E1', 'Calanus finmarchicus', 'urn:lsid:marinespecies.org:taxname:104464', 5, 54.1, 7.9, '2022-05-05'], ['o2', 'E1', 'Oithona similis', 'my-own-id-7', 11, 54.1, 7.9, '2022-05-05']];
    expect(proposeConvertColumns(rawSheet(header, rows.map((r) => [...r])), CTX).find((x) => x.header === 'scientificNameID')).toMatchObject({ role: { kind: 'taxonId' }, reasonCode: 'dwc-scientificnameid' });
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' } });
    expect(objects((await readBack(e.zip)).tables['occurrence.txt']).map((o) => o.scientificNameID)).toEqual(['urn:lsid:marinespecies.org:taxname:104464', 'my-own-id-7']);
  });

  it('without IDs every occurrence is counted by CONV-NAMEID-MISSING (a warning to accept), and the DwC-RECOMMENDED finding it replaces is gone; with some missing, those are counted', async () => {
    const none = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    const f = none.findings.find((x) => x.ruleId === 'CONV-NAMEID-MISSING')!;
    expect(f).toMatchObject({ severity: 'warning', params: { count: 7 } });
    expect(none.findings.some((x) => x.ruleId === 'DWC-RECOMMENDED' && String(x.params.terms).includes('scientificNameID'))).toBe(false);
    expect(judge(none.findings).acceptRules).toContain('CONV-NAMEID-MISSING');
    const some = await exportSheet(longHeader('AphiaID'), [...longRows, ['A2', 'Temora longicornis', null, 2, 55.6, 2.6, '2023-06-15']], { quantity: { kind: 'count' }, edit: { AphiaID: { kind: 'taxonId', aphia: true } } });
    expect(some.findings.find((x) => x.ruleId === 'CONV-NAMEID-MISSING')?.params.count).toBe(1);
  });

  it('a taxon ID column of a wide sheet has no taxon to belong to: it is named in the warning that it is not written', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'AphiaID', 'Calanus finmarchicus'], [['A1', 55.5, 2.5, '2023-06-14', 104464, 4]], { quantity: { kind: 'count' }, edit: { AphiaID: { kind: 'taxonId', aphia: true } } });
    expect(e.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED')).toMatchObject({ severity: 'warning', params: { columns: 'AphiaID' } });
    expect(e.files.map((f) => new TextDecoder().decode(f.data)).join('')).not.toContain('104464');
  });
});

describe('columns that are not written must be accepted', () => {
  it('a pressure column is on the accept list, with its header named; a measured variable is not (stage 5 writes it as an eMoF row)', async () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Pressure [dbar]', 'Temperature [°C]'];
    const e = await exportSheet(header, [['A1', 55.5, 2.5, '2023-06-14', 4, 5.1, 7.1]], { quantity: { kind: 'count' } });
    const f = e.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED')!;
    expect(f.params.columns).toBe('Pressure [dbar]');
    expect(judge(e.findings).acceptRules).toContain('CONV-COLUMN-NOT-EXPORTED');
    expect(judge(e.findings).blocking).toEqual([]);
    expect(e.result.measurements.some((m) => m.role === 'variable' && m.measurementType === 'temperature')).toBe(true);
  });
});

describe('the sampling device and the mesh size', () => {
  it('a verified device is an eMoF row on each sample: NMSPINST, the device as the value, and its L22 address as the valueID; no CONV-DEVICE-MISSING', async () => {
    const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, fullList: true, device: { kind: 'known', key: 'bongo' } });
    expect(e.findings.some((f) => f.ruleId === 'CONV-DEVICE-MISSING')).toBe(false);
    const emof = objects((await readBack(e.zip)).tables['extendedmeasurementorfact.txt']);
    const dev = emof.filter((m) => m.measurementTypeID === P01.instrument.uri);
    expect(dev.map((m) => [m.eventID, m.occurrenceID, m.measurementType, m.measurementValue, m.measurementValueID, m.measurementUnit])).toEqual([
      ['T1-1', '', 'Name of sampling instrument', 'Bongo net', 'http://vocab.nerc.ac.uk/collection/L22/current/NETT0176/', ''],
      ['T2-1', '', 'Name of sampling instrument', 'Bongo net', 'http://vocab.nerc.ac.uk/collection/L22/current/NETT0176/', ''],
    ]);
  });

  it('every device of the spike has the code the spike gives', () => {
    expect(Object.entries(DEVICES).map(([k, d]) => [k, d.uri.split('/').slice(4, 7).join('/')])).toEqual([
      ['bongo', 'L22/current/NETT0176'], ['wp2', 'L22/current/TOOL0979'], ['wp2Unesco', 'L22/current/NETT0168'], ['multinet', 'L22/current/NETT0187'], ['vanVeen', 'L22/current/TOOL0653'], ['boxCorer', 'L22/current/TOOL1177'],
      ['planktonNets', 'L05/current/22'], ['benthosSamplers', 'L05/current/24'], ['sedimentGrabs', 'L05/current/50'], ['sedimentCorers', 'L05/current/51'],
    ]);
    expect(P01.instrument.code).toBe('NMSPINST');
    expect(P01.meshSize.code).toBe('MSHSIZE1');
    expect(P06.um.code).toBe('UMIC');
  });

  it('a device the user types is written as the value without a valueID; no device at all is an accepted warning that names BioCheck and writes no row', async () => {
    const other = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, device: { kind: 'other', text: 'Invented mini-net' } });
    const dev = objects((await readBack(other.zip)).tables['extendedmeasurementorfact.txt']).filter((m) => m.measurementTypeID === P01.instrument.uri);
    expect(dev.map((m) => [m.measurementValue, m.measurementValueID])).toEqual([['Invented mini-net', ''], ['Invented mini-net', '']]);
    const none = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY });
    const f = none.findings.find((x) => x.ruleId === 'CONV-DEVICE-MISSING')!;
    expect(f.severity).toBe('warning');
    expect(judge(none.findings).acceptRules).toContain('CONV-DEVICE-MISSING');
    expect(objects((await readBack(none.zip)).tables['extendedmeasurementorfact.txt']).some((m) => m.measurementTypeID === P01.instrument.uri)).toBe(false);
    const empty = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, device: { kind: 'other', text: '  ' } });
    expect(empty.findings.some((x) => x.ruleId === 'CONV-DEVICE-MISSING')).toBe(true);
  });

  it('the mesh size is MSHSIZE1 in um (UMIC) on every sample, as typed with a point; a bad value blocks and says why', async () => {
    const ok = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, device: { kind: 'known', key: 'wp2' }, meshUm: '0,200' });
    const mesh = objects((await readBack(ok.zip)).tables['extendedmeasurementorfact.txt']).filter((m) => m.measurementTypeID === P01.meshSize.uri);
    expect(mesh.map((m) => [m.eventID, m.measurementType, m.measurementValue, m.measurementUnit, m.measurementUnitID])).toEqual([
      ['T1-1', 'Mesh size of sample collector', '0.200', 'um', 'http://vocab.nerc.ac.uk/collection/P06/current/UMIC/'],
      ['T2-1', 'Mesh size of sample collector', '0.200', 'um', 'http://vocab.nerc.ac.uk/collection/P06/current/UMIC/'],
    ]);
    for (const bad of ['abc', '-5', '0', '1,234', '1.2.3']) {
      const e = await exportSheet(W2_HEADER, W2_ROWS, { quantity: W2_QUANTITY, meshUm: bad });
      expect(judge(e.findings).blocking.map((f) => f.ruleId), bad).toContain('CONV-MESH-INVALID');
      expect(e.files, bad).toEqual([]);
    }
  });
});

describe('numbers are copied from the source text', () => {
  it('sourceNumberText: a plain decimal cell, with only the decimal comma turned into a point; anything else is undefined', () => {
    expect(sourceNumberText('55.50', false, 55.5)).toBe('55.50');
    expect(sourceNumberText('55,50', true, 55.5)).toBe('55.50');
    expect(sourceNumberText(' 100 ', false, 100)).toBe('100');
    // minimal tidying: a leading plus, leading zeros before the integer part, a missing integer part, a bare trailing point; every decimal digit stays
    expect(sourceNumberText('+5.5', false, 5.5)).toBe('5.5');
    expect(sourceNumberText('007.5', false, 7.5)).toBe('7.5');
    expect(sourceNumberText('0.5', false, 0.5)).toBe('0.5');
    expect(sourceNumberText('00.50', false, 0.5)).toBe('0.50');
    expect(sourceNumberText('000', false, 0)).toBe('0');
    expect(sourceNumberText('.5', false, 0.5)).toBe('0.5');
    expect(sourceNumberText('5.', false, 5)).toBe('5');
    expect(sourceNumberText('-007,50', true, -7.5)).toBe('-7.50');
    expect(sourceNumberText('-0.0', false, 0)).toBe('0.0');
    expect(sourceNumberText('54.10', false, 54.1)).toBe('54.10');
    expect(sourceNumberText(100, false, 100)).toBe('100');
    expect(sourceNumberText('55,50', false, 55.5)).toBeUndefined();
    expect(sourceNumberText('1e3', false, 1000)).toBeUndefined();
    expect(sourceNumberText('-10', false, 10)).toBeUndefined(); // a sign that was flipped is not the source
    expect(sourceNumberText('55°30′N', false, 55.5)).toBeUndefined(); // degrees and minutes: written as decimal degrees
    expect(sourceNumberText(null, false, 1)).toBeUndefined();
    expect(sourceNumberText('7', false, undefined)).toBeUndefined();
  });

  it('positions and depths of a sample come out as the cells said them (100 stays 100, 2.250 stays 2.250, 0 stays 0, 10.00 stays 10.00)', async () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Depth top [m]', 'Depth bottom [m]', 'Calanus finmarchicus'];
    const e = await exportSheet(header, [['A1', '55.50', '100', '2023-06-14', '0', '10.00', 4], ['A2', '+55.5', '2.250', '2023-06-15', '5', '10.0', 4]], { quantity: { kind: 'count' } });
    const ev = objects((await readBack(e.zip)).tables['event.txt']);
    expect(ev.find((x) => x.eventID === 'A1')).toMatchObject({ decimalLatitude: '55.50', decimalLongitude: '100', minimumDepthInMeters: '0', maximumDepthInMeters: '10.00' });
    expect(ev.find((x) => x.eventID === 'A2')).toMatchObject({ decimalLatitude: '55.5', decimalLongitude: '2.250', minimumDepthInMeters: '5', maximumDepthInMeters: '10.0' });
  });

  it('a count is written as a whole number: a cell 5.0 is written 5', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A1', 55.5, 2.5, '2023-06-14', '5.0']], { quantity: { kind: 'count' } });
    const occ = objects((await readBack(e.zip)).tables['occurrence.txt'])[0];
    expect(occ).toMatchObject({ individualCount: '5', organismQuantity: '5' });
  });

  it('a position worked out from the samples has at most six decimals and no trailing zeros; its uncertainty is whole metres', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    const ev = objects((await readBack(e.zip)).tables['event.txt']);
    expect(ev[0]).toMatchObject({ eventID: 'CR1', decimalLatitude: '55.7', decimalLongitude: '2.8' });
    expect(ev[0].coordinateUncertaintyInMeters).toMatch(/^\d+$/);
    const t = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A1', '55.123456', '2.1', '2023-06-14', 1], ['A2', '55.5', '2.2', '2023-06-15', 1]], { quantity: { kind: 'count' } });
    // no station or cruise: no derived event; the midpoint case is covered by W1; a derived value with many digits is cut
    expect(t.dataset.events.every((x) => x.position?.derived !== true)).toBe(true);
    const s = await exportSheet(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['S', 'A1', '55.123456', '2.1', '2023-06-14', 1], ['S', 'A2', '55.2', '2.3333333', '2023-06-14', 1]], { quantity: { kind: 'count' } });
    const st = objects((await readBack(s.zip)).tables['event.txt']).find((x) => x.eventType === 'station')!;
    expect(st.decimalLatitude).toMatch(/^55\.1\d{0,5}[1-9]$/);
    expect(st.decimalLatitude.split('.')[1].length).toBeLessThanOrEqual(6);
    expect(st.decimalLongitude).not.toMatch(/0$/);
  });
});

describe('every line break that breaks a tab-separated file', () => {
  const BREAKS = ['\t', '\r', '\n', '\v', '\f', '\u0085', ' ', ' '];
  it('is found by hasTabOrNewline and shown as a space', () => {
    for (const ch of BREAKS) {
      expect(hasTabOrNewline(`a${ch}b`), JSON.stringify(ch)).toBe(true);
      expect(shownText(`a${ch}b`)).toBe('a b');
    }
    expect(hasTabOrNewline('a b c')).toBe(false);
  });
  for (const ch of BREAKS.slice(3)) {
    it(`a sample code with ${JSON.stringify(ch)} blocks with CONV-TAB-IN-VALUE and nothing is written`, async () => {
      const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [[`A${ch}1`, 55.5, 2.5, '2023-06-14', 4]], { quantity: { kind: 'count' } });
      expect(judge(e.findings).blocking.map((f) => f.ruleId)).toContain('CONV-TAB-IN-VALUE');
      expect(e.files).toEqual([]);
    });
  }
  it('also in a typed device name or unit, which only the output tables see', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['A1', 55.5, 2.5, '2023-06-14', 4]], { quantity: { kind: 'count' }, device: { kind: 'other', text: 'net one' } });
    expect(judge(e.findings).blocking.map((f) => f.ruleId)).toContain('CONV-TAB-IN-VALUE');
  });
});

describe('the ZIP writer caps and fallbacks', () => {
  it('an archive above the reader\'s 100 MB cap is refused with a message that says what to do, and nothing is built', async () => {
    const big = new Uint8Array(101 * 1024 * 1024);
    const err = await buildZip([{ name: 'big.bin', data: big }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZipWriteError);
    expect((err as ZipWriteError).code).toBe('ZIP-TOO-LARGE');
    expect((err as Error).message).toMatch(/100 MB/);
    expect((err as Error).message).toMatch(/several parts/);
  });

  it('a deflate that throws or rejects falls back to STORE for that entry, and the archive reads back', async () => {
    const data = new TextEncoder().encode('abc\n'.repeat(1000));
    for (const bad of [async () => { throw new Error('stream failed'); }, () => { throw new Error('sync failure'); }]) {
      const z = openZip(await buildZip([{ name: 'a.txt', data }, { name: 'b.txt', data }], bad as never));
      expect(z.entries.every((e) => e.method === 0)).toBe(true);
      expect(Buffer.from(await z.read(z.find('a.txt')!, nodeInflate)).equals(Buffer.from(data))).toBe(true);
    }
    let n = 0;
    const flaky = async (d: Uint8Array): Promise<Uint8Array> => (n++ === 0 ? Promise.reject(new Error('once')) : nodeDeflate(d));
    const z = openZip(await buildZip([{ name: 'a.txt', data }, { name: 'b.txt', data }], flaky));
    expect([z.find('a.txt')!.method, z.find('b.txt')!.method]).toEqual([0, 8]);
  });
});

describe('what the output checks must not raise by mistake', () => {
  it('sampleSizeValue is not a measured variable without a unit: its unit is the next column', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    expect(e.findings.filter((f) => f.ruleId === 'ROW-UNIT-MISSING' && String(f.params.headers).includes('sampleSizeValue'))).toEqual([]);
  });
});

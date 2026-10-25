// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// No confirmed column is dropped silently: every column with a role other than ignore that the conversion does not read, in the sheet's shape and
// configuration, is named in CONV-COLUMN-NOT-EXPORTED. The oracle is the archive itself: a role is "read" exactly when giving the column that role changes the
// tables that are written, and a column that changes nothing must be named. Iterating every role kind on both shapes means a role added later cannot be
// dropped silently. Every value is invented.
import { describe, expect, it } from 'vitest';
import { buildTables } from '../../src/core/convert/dwca';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import type { QuantityDeclaration } from '../../src/core/convert/quantity';
import type { ColumnRole } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { CTX } from './helpers';
import type { Cell } from './helpers';
import { exportSheet, objects, readBack } from './exportHelpers';

type Shape = 'wide' | 'long';

const BASE: Record<Shape, { header: string[]; rows: Cell[][] }> = {
  wide: {
    header: ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis', 'X'],
    rows: [['S1', 'a', 55.5, 2.5, '2020-01-01', 4, 5, 0], ['S2', 'b', 56.5, 3.5, '2020-01-02', 6, 7, 0]],
  },
  long: {
    header: ['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Species', 'Count', 'X'],
    rows: [['S1', 'a', 55.5, 2.5, '2020-01-01', 'Calanus finmarchicus', 4, 0], ['S2', 'b', 56.5, 3.5, '2020-01-02', 'Oithona similis', 6, 0]],
  },
};

/** Every role kind the converter knows, with two distinct values that make sense for it. */
const ROLES: { name: string; role: ColumnRole; values: [Cell, Cell] }[] = [
  { name: 'latitude', role: { kind: 'latitude' }, values: ['11.1', '12.2'] },
  { name: 'longitude', role: { kind: 'longitude' }, values: ['21.1', '22.2'] },
  { name: 'datetime', role: { kind: 'datetime' }, values: ['2021-01-01T10:00', '2021-01-02T10:00'] },
  { name: 'date', role: { kind: 'date' }, values: ['2021-03-01', '2021-03-02'] },
  { name: 'time', role: { kind: 'time' }, values: ['10:00', '11:00'] },
  { name: 'depth', role: { kind: 'depth', positive: 'down' }, values: ['5', '6'] },
  { name: 'depth min bound', role: { kind: 'depth', positive: 'down', bound: 'min' }, values: ['5', '6'] },
  { name: 'depth max bound', role: { kind: 'depth', positive: 'down', bound: 'max' }, values: ['15', '16'] },
  { name: 'pressure', role: { kind: 'pressure' }, values: ['5', '6'] },
  { name: 'station', role: { kind: 'station' }, values: ['XS1', 'XS2'] },
  { name: 'cruise', role: { kind: 'cruise' }, values: ['C1', 'C2'] },
  { name: 'sampleId', role: { kind: 'sampleId' }, values: ['X1', 'X2'] },
  { name: 'variable', role: { kind: 'variable', variable: 'temperature', unit: 'degC' }, values: ['1.5', '2.5'] },
  { name: 'taxon (cells)', role: { kind: 'taxon' }, values: ['Abra alba', 'Nucula nitidosa'] },
  { name: 'taxon (header)', role: { kind: 'taxon', header: true }, values: [3, 4] },
  { name: 'quantity', role: { kind: 'quantity' }, values: [7, 8] },
  { name: 'quantityType', role: { kind: 'quantityType' }, values: ['individuals', 'individuals'] },
  { name: 'effort', role: { kind: 'effort', unit: 'm3' }, values: [12, 13] },
  { name: 'occurrenceId', role: { kind: 'occurrenceId' }, values: ['o1', 'o2'] },
  { name: 'lifeStage', role: { kind: 'lifeStage' }, values: ['C2', 'C3'] },
  { name: 'qualifier', role: { kind: 'qualifier' }, values: ['cf.', 'sp.'] },
  { name: 'taxonId', role: { kind: 'taxonId' }, values: ['id1', 'id2'] },
  { name: 'taxonId (AphiaID)', role: { kind: 'taxonId', aphia: true }, values: [111, 222] },
];

const QUANTITIES: { name: string; q: QuantityDeclaration }[] = [
  { name: 'count, no sample size', q: { kind: 'count' } },
  { name: 'count, sample size from a column', q: { kind: 'count', effort: { source: 'column', unit: 'm3', dimension: 'volume' } } },
  { name: 'count, sample size typed', q: { kind: 'count', effort: { source: 'constant', value: '10', unit: 'm3' } } },
];

const withX = (shape: Shape, values: [Cell, Cell]): { header: string[]; rows: Cell[][] } => ({ header: BASE[shape].header, rows: BASE[shape].rows.map((r, i) => [...r.slice(0, -1), values[i]]) });
const written = async (shape: Shape, role: ColumnRole, values: [Cell, Cell], q: QuantityDeclaration): Promise<{ tables: string; named: string[] }> => {
  const { header, rows } = withX(shape, values);
  const e = await exportSheet(header, rows, { quantity: q, fullList: true, edit: { X: role }, shape });
  const f = e.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED');
  return { tables: JSON.stringify(buildTables(e.dataset)), named: f ? String(f.params.columns).split(', ') : [] };
};

describe('every role on both shapes: written, or named in CONV-COLUMN-NOT-EXPORTED', () => {
  for (const shape of ['wide', 'long'] as const) {
    for (const quantity of QUANTITIES) {
      it(`${shape}, ${quantity.name}`, async () => {
        const ignored = await written(shape, { kind: 'ignore' }, [0, 0], quantity.q);
        expect(ignored.named, 'an ignored column is never named').toEqual([]);
        const read: string[] = [];
        const silent: string[] = [];
        for (const r of ROLES) {
          const w = await written(shape, r.role, r.values, quantity.q);
          const changesTheArchive = w.tables !== ignored.tables;
          const named = w.named.includes('X');
          if (changesTheArchive) read.push(r.name);
          if (changesTheArchive && named) silent.push(`${r.name}: written AND named`);
          if (!changesTheArchive && !named) silent.push(`${r.name}: dropped silently`);
        }
        expect(silent).toEqual([]);
        // the oracle is not vacuous: the roles every sheet reads do change the archive
        expect(read).toEqual(expect.arrayContaining(['depth', 'cruise', 'time']));
      });
    }
  }

  it('the known outcomes: what a wide sheet does not read, what a long sheet does not read, and the sample size column only when it is set to a column', async () => {
    const named = async (shape: Shape, name: string, q: QuantityDeclaration): Promise<boolean> => {
      const r = ROLES.find((x) => x.name === name)!;
      return (await written(shape, r.role, r.values, q)).named.includes('X');
    };
    for (const n of ['lifeStage', 'qualifier', 'quantityType', 'occurrenceId', 'quantity', 'taxon (cells)', 'taxonId', 'taxonId (AphiaID)']) expect(await named('wide', n, { kind: 'count' }), `wide ${n}`).toBe(true);
    for (const n of ['lifeStage', 'qualifier', 'occurrenceId', 'taxonId', 'taxonId (AphiaID)']) expect(await named('long', n, { kind: 'count' }), `long ${n}`).toBe(false);
    expect(await named('long', 'quantityType', { kind: 'count' })).toBe(true);
    expect(await named('long', 'taxon (header)', { kind: 'count' })).toBe(true);
    for (const shape of ['wide', 'long'] as const) {
      expect(await named(shape, 'effort', { kind: 'count' }), `${shape} effort, none`).toBe(true);
      expect(await named(shape, 'effort', { kind: 'count', effort: { source: 'constant', value: '10', unit: 'm3' } }), `${shape} effort, typed`).toBe(true);
      expect(await named(shape, 'effort', { kind: 'count', effort: { source: 'column', unit: 'm3', dimension: 'volume' } }), `${shape} effort, column`).toBe(false);
      for (const n of ['variable', 'pressure', 'latitude', 'longitude', 'date', 'station', 'cruise', 'sampleId']) expect(await named(shape, n, { kind: 'count' }), `${shape} ${n}`).toBe(n === 'variable' || n === 'pressure' || ['latitude', 'longitude', 'date', 'station', 'sampleId'].includes(n));
    }
  });
});

describe('a wide sheet with a Darwin Core occurrenceID column', () => {
  const header = ['Station', 'Sample', 'occurrenceID', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis'];
  const rows: Cell[][] = [['S1', 'a', 'occ-1', 55.5, 2.5, '2020-01-01', 4, 5], ['S2', 'b', 'occ-2', 56.5, 3.5, '2020-01-02', 6, 7]];

  it('keeps the Sample column as the sample code and gives occurrenceID the occurrenceId role', () => {
    const p = proposeConvertColumns(rawSheet(header, rows.map((r) => [...r])), CTX);
    expect(p.find((x) => x.header === 'Sample')?.role).toEqual({ kind: 'sampleId' });
    expect(p.find((x) => x.header === 'occurrenceID')?.role).toEqual({ kind: 'occurrenceId' });
    expect(p.find((x) => x.header === 'occurrenceID')?.reasonCode).toBe('dwc-occurrenceid');
    expect(p.find((x) => x.header === 'Calanus finmarchicus')?.role).toEqual({ kind: 'taxon', header: true });
  });

  it('the events are the samples, the occurrenceIDs are built per taxon cell, and occurrenceID is reported as not written', async () => {
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' } });
    const b = await readBack(e.zip);
    expect(objects(b.tables['event.txt']).filter((x) => x.eventType === 'sample').map((x) => x.eventID)).toEqual(['a', 'b']);
    expect(objects(b.tables['occurrence.txt']).map((o) => o.occurrenceID)).toEqual(['a:Calanus finmarchicus', 'a:Oithona similis', 'b:Calanus finmarchicus', 'b:Oithona similis']);
    expect(e.findings.find((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED')).toMatchObject({ severity: 'warning', params: { columns: 'occurrenceID' } });
    expect(Object.values(b.text).join('')).not.toContain('occ-1');
  });

  it('a long sheet keeps the old behaviour: the user\'s occurrenceID is used as given (the shared proposer is not asked differently)', () => {
    const long = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'decimalLatitude', 'decimalLongitude', 'eventDate'];
    const p = proposeConvertColumns(rawSheet(long, [['o1', 'E1', 'Calanus finmarchicus', 5, 54.1, 7.9, '2022-05-05']]), CTX);
    expect(p.find((x) => x.header === 'occurrenceID')?.role).toEqual({ kind: 'occurrenceId' });
    expect(p.find((x) => x.header === 'eventID')?.role).toEqual({ kind: 'sampleId' });
  });
});

describe('a taxon ID chosen by hand on bare whole numbers', () => {
  const header = ['Sample', 'Species', 'WoRMS ID', 'Count', 'Latitude', 'Longitude', 'Date'];
  const rows: Cell[][] = [['A1', 'Calanus finmarchicus', 104464, 4, 55.5, 2.5, '2023-06-14'], ['A1', 'Oithona similis', 106656, 9, 55.5, 2.5, '2023-06-14']];

  it('is written as given and raises an accept warning that says to rename the header to AphiaID', async () => {
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { 'WoRMS ID': { kind: 'taxonId' } } });
    const f = e.findings.find((x) => x.ruleId === 'CONV-NAMEID-APHIA-LIKE')!;
    expect(f).toMatchObject({ severity: 'warning', params: { column: 'WoRMS ID' } });
    expect(objects((await readBack(e.zip)).tables['occurrence.txt']).map((o) => o.scientificNameID)).toEqual(['104464', '106656']);
  });

  it('no warning for an AphiaID header (written as the urn:lsid), for the DwC term with text values, or for numbers that are not all whole and positive', async () => {
    const aphia = await exportSheet(['Sample', 'Species', 'AphiaID', 'Count', 'Latitude', 'Longitude', 'Date'], rows, { quantity: { kind: 'count' } });
    expect(aphia.findings.some((x) => x.ruleId === 'CONV-NAMEID-APHIA-LIKE')).toBe(false);
    const text = await exportSheet(header, rows.map((r, i) => [r[0], r[1], `id-${i}`, ...r.slice(3)]), { quantity: { kind: 'count' }, edit: { 'WoRMS ID': { kind: 'taxonId' } } });
    expect(text.findings.some((x) => x.ruleId === 'CONV-NAMEID-APHIA-LIKE')).toBe(false);
    const mixed = await exportSheet(header, rows.map((r, i) => [r[0], r[1], i === 0 ? 104464 : '10.5', ...r.slice(3)]), { quantity: { kind: 'count' }, edit: { 'WoRMS ID': { kind: 'taxonId' } } });
    expect(mixed.findings.some((x) => x.ruleId === 'CONV-NAMEID-APHIA-LIKE')).toBe(false);
  });
});

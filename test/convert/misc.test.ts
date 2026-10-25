// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { describe, expect, it } from 'vitest';
import { convert, listSplits } from '../../src/core/convert/build';
import { fileOf, sheetInput } from './helpers';

const HEADER = ['Cruise', 'Station', 'Sample', 'Date', 'Latitude', 'Longitude', 'Calanus finmarchicus', 'Oithona similis'];

describe('reading cells', () => {
  it('a decimal-comma sheet: values are read with the comma and written with a dot, as the clean CSV does', () => {
    const f = fileOf(HEADER, [['C', 'S', 'a', '2020-01-01', '55,5', '2,5', '12,5', '3']], 'S', { decimalComma: true });
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'density', unit: '#/m3' } })] });
    expect(r.blocking).toEqual([]);
    expect(r.measurements.find((m) => m.target.id === 'a:Calanus finmarchicus')!.measurementValue).toBe('12.5');
    expect(r.events.find((e) => e.id === 'a')).toMatchObject({ lat: 55.5, lon: 2.5 });
  });

  it('a depth that is positive upwards is written positive down; a unit-less depth is metres', () => {
    const f = fileOf(['Sample', 'Station', 'Elevation [m]', 'Calanus finmarchicus'], [['a', 'S', -25, 3]]);
    const input = sheetInput(f, { quantity: { kind: 'count' }, edit: { 'Elevation [m]': { kind: 'depth', positive: 'up', unit: 'm' } } });
    const r = convert({ sheets: [input] });
    expect(r.blocking).toEqual([]);
    const e = r.events.find((x) => x.id === 'a')!;
    expect([e.depthMin, e.depthMax]).toEqual([25, 25]);
  });

  it('a non-numeric depth cell is reported with the /check finding and leaves the sample without a depth', () => {
    const f = fileOf(['Sample', 'Station', 'Depth top [m]', 'Depth bottom [m]', 'Calanus finmarchicus'], [['a', 'S', 'deep', 20, 3]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    expect(r.findings.some((x) => x.ruleId === 'ROW-NON-NUMERIC' && x.field === 'Depth top [m]')).toBe(true);
    const e = r.events.find((x) => x.id === 'a')!;
    expect([e.depthMin, e.depthMax]).toEqual([undefined, 20]);
  });

  it('reads the date and position with the same parser as /check (an unparseable date is the /check finding)', () => {
    const f = fileOf(HEADER, [['C', 'S', 'a', 'not a date', 55.5, 2.5, 3, 4]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })] });
    expect(r.findings.map((x) => x.ruleId)).toContain('ROW-DATE-UNPARSEABLE');
    expect(r.events.find((e) => e.id === 'a')!.eventDate).toBeUndefined();
  });
});

describe('the whole archive', () => {
  it('lists the distinct taxon names of all sheets once, first-seen order, with their use counts', () => {
    const a = sheetInput(fileOf(HEADER, [['C', 'S', 'a', '2020-01-01', 1, 2, 3, 4]]), { quantity: { kind: 'count' } });
    const b = sheetInput(fileOf(['Sample', 'Species', 'Count'], [['b1', 'Calanus finmarchicus', 3], ['b1', 'Calanus finmarchicus', 3], ['b2', 'Pseudocalanus sp.', 3]]), { quantity: { kind: 'count' } });
    expect(listSplits({ sheets: [a, b] }).map((s) => [s.verbatim, s.uses])).toEqual([['Calanus finmarchicus', 3], ['Oithona similis', 1], ['Pseudocalanus sp.', 1]]);
  });

  it('flattening through convert() keeps every eventID and every occurrenceID', () => {
    const f = fileOf(HEADER, [['C', 'S1', 'a', '2020-01-01', 1, 2, 3, 4], ['C', 'S2', 'b', '2020-01-02', 2, 3, 5, 6]]);
    const full = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })], options: { prefixStation: true } });
    const flat = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count' } })], options: { prefixStation: true, flatten: { station: true, cruise: true } } });
    expect(flat.occurrences.map((o) => o.id)).toEqual(full.occurrences.map((o) => o.id));
    expect(flat.events.map((e) => e.id)).toEqual(['C:S1:a', 'C:S2:b']);
    expect(flat.cruiseText).toEqual(['C']);
    expect(flat.events.every((e) => e.parentId === undefined)).toBe(true);
    expect(flat.events[0].locality).toBe('S1');
  });

  it('a sheet name that is not in the file is skipped, not a crash', () => {
    const f = fileOf(HEADER, [['C', 'S1', 'a', '2020-01-01', 1, 2, 3, 4]]);
    const r = convert({ sheets: [{ ...sheetInput(f, { quantity: { kind: 'count' } }), sheet: 'missing' }] });
    expect(r.events).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('long sheets: rows of one sample that disagree on the effort block as a conflict', () => {
    const f = fileOf(['Sample', 'Species', 'Count', 'Volume [m3]'], [['a', 'Calanus finmarchicus', 3, 10], ['a', 'Oithona similis', 4, 11]]);
    const r = convert({ sheets: [sheetInput(f, { quantity: { kind: 'count', effort: { source: 'column' } } })] });
    expect(r.blocking.map((x) => x.ruleId)).toEqual(['CONV-SAMPLE-CONFLICT']);
  });

  it('is pure: the input sheets are not mutated', () => {
    const f = fileOf(HEADER, [['C', 'S1', 'a', '2020-01-01', 1, 2, 3, 4]]);
    const input = sheetInput(f, { quantity: { kind: 'count' } });
    const before = JSON.stringify([f, input]);
    convert({ sheets: [input], options: { fullList: true, prefixStation: true } });
    expect(JSON.stringify([f, input])).toBe(before);
  });
});

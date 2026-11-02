// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// PANGAEA's vertical geocodes (recognize/geocodes.ts): a depth in a sediment core, soil or ice is never the depth of the water. Every row is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { proposeConvertColumns } from '../../src/core/convert/recognize';
import { PANGAEA_GEOCODES, geocodeOfKey } from '../../src/core/recognize/geocodes';
import { proposeColumns } from '../../src/core/recognize/columns';
import { headerKey } from '../../src/core/recognize/vocab';
import { rawSheet } from '../helpers/files';
import { fileOf, sheetInput } from '../convert/helpers';
import type { Cell } from '../convert/helpers';

const CTX = { decimalComma: false, date1904: false };
const sheetWith = (depthHeader: string, values: number[]) =>
  rawSheet(
    ['Latitude', 'Longitude', 'Date', depthHeader, 'Calanus [#/m**2]'],
    values.map((v, i) => [49.4, -11.1, '1993-10-26', v, i + 1]),
  );
const roleOf = (props: ReturnType<typeof proposeColumns>, header: string) => props.find((p) => p.header === header)!;

describe('the table of PANGAEA geocodes', () => {
  it('names the z geocodes of the Geocode page, with their effect', () => {
    const effect = (name: string) => PANGAEA_GEOCODES.find((g) => g.name === name)?.effect;
    expect(effect('DEPTH, water')).toBe('water-depth');
    expect(effect('DEPTH, sediment/rock')).toBe('sediment-depth');
    expect(effect('DEPTH, soil')).toBe('not-water-depth');
    expect(effect('DEPTH, ice/snow')).toBe('not-water-depth');
    expect(effect('ELEVATION')).toBe('elevation');
    expect(effect('ALTITUDE')).toBe('elevation');
    expect(PANGAEA_GEOCODES.length).toBe(13);
  });

  it('is matched by the full name and by the table-header abbreviation, exactly', () => {
    for (const h of ['Depth sed', 'DEPTH, sediment/rock', 'depth sed']) expect(geocodeOfKey(headerKey(h))?.effect, h).toBe('sediment-depth');
    expect(geocodeOfKey(headerKey('Depth water'))?.effect).toBe('water-depth');
    expect(geocodeOfKey(headerKey('Depth ice/snow'))?.effect).toBe('not-water-depth');
    // a name that only contains one is not one
    expect(geocodeOfKey(headerKey('Depth of sedimentation'))).toBeUndefined();
    expect(geocodeOfKey(headerKey('Depth sed top'))).toBeUndefined();
  });
});

describe('/check: a sediment depth is not the water depth', () => {
  it('Depth sed [m] is a measured value with its reason, not a depth slot', () => {
    const p = roleOf(proposeColumns(sheetWith('Depth sed [m]', [0.00125, 0.0035, 0.0075]), CTX), 'Depth sed [m]');
    expect(p.role.kind).toBe('variable');
    expect(p.reasonCode).toBe('geocode-sediment');
    const long = roleOf(proposeColumns(sheetWith('DEPTH, sediment/rock [m]', [0.5, 1.5, 2.5]), CTX), 'DEPTH, sediment/rock [m]');
    expect(long.role.kind).toBe('variable');
  });

  it('Depth ice/snow [m] and Depth soil [m] are not water depths either', () => {
    const ice = roleOf(proposeColumns(sheetWith('Depth ice/snow [m]', [0.1, 0.2, 0.3]), CTX), 'Depth ice/snow [m]');
    expect(ice.role.kind).toBe('variable');
    expect(ice.reasonCode).toBe('geocode-ice');
    const soil = roleOf(proposeColumns(sheetWith('Depth soil [m]', [0.1, 0.2, 0.3]), CTX), 'Depth soil [m]');
    expect(soil.role.kind).toBe('variable');
    expect(soil.reasonCode).toBe('geocode-soil');
  });

  it('Depth water [m] is the depth, and Elevation keeps its sign logic (positive up)', () => {
    expect(roleOf(proposeColumns(sheetWith('Depth water [m]', [5, 10, 20]), CTX), 'Depth water [m]').role).toMatchObject({ kind: 'depth', positive: 'down' });
    const el = roleOf(proposeColumns(sheetWith('Elevation [m a.s.l.]', [-208, -210, -215]), CTX), 'Elevation [m a.s.l.]');
    expect(el.role).toMatchObject({ kind: 'depth', positive: 'up' });
  });
});

describe('/convert: a sediment depth never reaches minimumDepthInMeters', () => {
  it('Depth sed [m] is the depth below the seafloor, written as a negative distance', () => {
    const p = roleOf(proposeConvertColumns(sheetWith('Depth sed [m]', [0.00125, 0.0035, 0.0075]), CTX), 'Depth sed [m]');
    expect(p.role.kind).toBe('depthBelowSeafloor');
  });

  it('end to end: the archive of a sediment sheet has the distance and no water depth from that column', () => {
    const rows: Cell[][] = [
      ['S1', 49.4, -11.1, '1993-10-26', 0.00125, 'Calanus finmarchicus', 3],
      ['S2', 49.4, -11.1, '1993-10-26', 0.0035, 'Calanus finmarchicus', 2],
    ];
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Depth sed [m]', 'Species', 'Count'];
    const r = convert({ sheets: [sheetInput(fileOf(header, rows), { shape: 'long', quantity: { kind: 'count' } })] });
    const events = r.events.filter((e) => e.eventType === 'sample');
    expect(events.map((e) => e.distanceText)).toEqual(['-0.00125', '-0.0035']);
    for (const e of r.events) {
      expect(e.depthMin).toBeUndefined();
      expect(e.depthMax).toBeUndefined();
    }
  });
});

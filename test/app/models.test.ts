// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { changeRole, mappingWith, roleUnit, setPositive, setUnit, setVariableName } from '../../src/app/mappingModel';
import { describeLayout, setJoinKey, setLongColumn } from '../../src/app/layoutModel';
import { SEVERITY_COLORS, boundsOf, displayLon, popupContent, prepareMapData } from '../../src/app/mapModel';
import { downloadText, fileBase, safeFileName } from '../../src/app/download';
import { draftSections } from '../../src/app/draftModel';
import type { ColumnRole, LayoutPlan, SheetMapping } from '../../src/core/types';
import type { SheetSummary } from '../../src/worker/protocol';

describe('mappingModel', () => {
  const proposal: ColumnRole = { kind: 'variable', variable: 'DIC', unit: 'µmol/kg', unitSource: 'header' };

  it('switching away from the proposed role and back restores the proposal, including its unit', () => {
    const away = changeRole(proposal, proposal, 'ignore', 'DIC');
    expect(away).toEqual({ kind: 'ignore' });
    expect(changeRole(away, proposal, 'variable', 'DIC')).toEqual(proposal);
  });

  it('never invents a unit: a fresh variable role has none, a fresh depth role has unknown direction', () => {
    expect(changeRole({ kind: 'ignore' }, { kind: 'ignore' }, 'variable', 'Chl a')).toEqual({ kind: 'variable', variable: 'Chl a' });
    expect(changeRole({ kind: 'ignore' }, { kind: 'ignore' }, 'depth', 'z')).toEqual({ kind: 'depth', positive: 'unknown' });
    expect(changeRole({ kind: 'ignore' }, { kind: 'ignore' }, 'latitude', 'y')).toEqual({ kind: 'latitude' });
  });

  it('a typed unit is marked as the user\'s; clearing it removes it', () => {
    const typed = setUnit({ kind: 'variable', variable: 'x' }, ' mg/L ');
    expect(typed).toEqual({ kind: 'variable', variable: 'x', unit: 'mg/L', unitSource: 'user' });
    expect(setUnit(typed, '  ')).toEqual({ kind: 'variable', variable: 'x' });
    expect(setUnit({ kind: 'depth', positive: 'down' }, 'm')).toEqual({ kind: 'depth', positive: 'down', unit: 'm' });
    expect(setUnit({ kind: 'latitude' }, 'deg')).toEqual({ kind: 'latitude' });
    expect(roleUnit(typed)).toBe('mg/L');
    expect(roleUnit({ kind: 'station' })).toBeUndefined();
  });

  it('sets the variable name and depth direction; ignores other roles', () => {
    expect(setVariableName({ kind: 'variable', variable: 'a', unit: 'm' }, 'DIC')).toEqual({ kind: 'variable', variable: 'DIC', unit: 'm' });
    expect(setPositive({ kind: 'depth', positive: 'unknown' }, 'up')).toEqual({ kind: 'depth', positive: 'up' });
    expect(setPositive({ kind: 'station' }, 'up')).toEqual({ kind: 'station' });
  });

  it('replaces one column of a mapping without touching the others', () => {
    const m: SheetMapping = { sheet: 's', columns: [{ index: 0, header: 'a', role: { kind: 'ignore' } }, { index: 1, header: 'b', role: { kind: 'ignore' } }] };
    const next = mappingWith(m, 1, { kind: 'latitude' });
    expect(next.columns[1].role).toEqual({ kind: 'latitude' });
    expect(next.columns[0]).toBe(m.columns[0]);
    expect(m.columns[1].role).toEqual({ kind: 'ignore' });
  });
});

describe('layoutModel', () => {
  const sheets: SheetSummary[] = [
    { name: 'cores', header: ['id', 'lat', 'lon'], rowCount: 3 },
    { name: 'meas', header: ['id', 'depth', 'Na'], rowCount: 9 },
  ];
  const join: LayoutPlan = { tables: [{ sheet: 'meas' }], joins: [{ left: 'meas', right: 'cores', leftKey: 0, rightKey: 0 }] };

  it('describes a join in terms of sheet and column names', () => {
    const d = describeLayout(join, sheets);
    expect(d).toHaveLength(1);
    expect(d[0].key).toBe('layout.join');
    expect(d[0].params).toEqual({ left: 'meas', right: 'cores', leftKey: 'id', rightKey: 'id' });
  });

  it('describes one wide table, and a long table with and without a unit column', () => {
    expect(describeLayout({ tables: [{ sheet: 'cores' }], joins: [] }, sheets)[0].key).toBe('layout.one');
    const long: LayoutPlan = { tables: [{ sheet: 'meas', long: { parameterCol: 1, valueCol: 2, unitCol: 0 } }], joins: [] };
    expect(describeLayout(long, sheets)[0]).toMatchObject({ key: 'layout.long', params: { sheet: 'meas', param: 'depth', value: 'Na', unit: 'id' } });
    const noUnit: LayoutPlan = { tables: [{ sheet: 'meas', long: { parameterCol: 1, valueCol: 2 } }], joins: [] };
    expect(describeLayout(noUnit, sheets)[0].key).toBe('layout.longNoUnit');
  });

  it('changes a join key and a long column without mutating the plan', () => {
    const next = setJoinKey(join, 0, 'left', 2);
    expect(next.joins[0].leftKey).toBe(2);
    expect(join.joins[0].leftKey).toBe(0);
    const long: LayoutPlan = { tables: [{ sheet: 'meas', long: { parameterCol: 1, valueCol: 2, unitCol: 0 } }], joins: [] };
    expect(setLongColumn(long, 0, 'unitCol', undefined).tables[0].long).toEqual({ parameterCol: 1, valueCol: 2 });
    expect(setLongColumn(long, 0, 'valueCol', 0).tables[0].long).toEqual({ parameterCol: 1, valueCol: 0, unitCol: 0 });
    expect(long.tables[0].long?.valueCol).toBe(2);
  });
});

describe('mapModel', () => {
  it('uses the four severity colours', () => {
    expect(SEVERITY_COLORS).toEqual({ error: '#ef4444', warning: '#f59e0b', info: '#38bdf8', none: '#22c55e' });
  });

  it('displayLon wraps 0-360 longitudes and leaves exactly 180 alone', () => {
    expect(displayLon(350)).toBe(-10);
    expect(displayLon(180)).toBe(180);
    expect(displayLon(-190)).toBe(170);
    expect(Number.isNaN(displayLon(NaN))).toBe(true);
  });

  it('fits bounds, and across the antimeridian chooses the short way round', () => {
    expect(boundsOf([[10, 50], [20, 60]])).toEqual({ west: 10, east: 20, south: 50, north: 60 });
    const b = boundsOf([[170, 0], [-170, 10]])!;
    expect(b.west).toBe(170);
    expect(b.east).toBe(190);
    expect(boundsOf([])).toBeNull();
  });

  it('prepareMapData wraps longitudes, drops impossible positions and counts them', () => {
    const geo = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [350, 10] }, properties: { file: 'a.csv', line: 2, worstSeverity: 'none' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [15, 95] }, properties: { file: 'a.csv', line: 3, worstSeverity: 'error' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [15, 60] }, properties: { file: 'a.csv', line: 4, worstSeverity: 'warning' } },
      ],
    });
    const d = prepareMapData(geo);
    expect(d.collection.features).toHaveLength(2);
    expect(d.collection.features[0].geometry.coordinates).toEqual([-10, 10]);
    expect(d.skipped).toBe(1);
    expect(d.bounds).toEqual({ west: -10, east: 15, south: 10, north: 60 });
  });

  it('builds the popup with textContent only, so data cannot inject markup', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const el = popupContent(
      document,
      { file: evil, line: 7, station: evil, date: '2021-07-25' },
      { file: evil, line: 7, station: evil, values: [{ name: evil, unit: 'µmol/kg', raw: '<b>1</b>' }] },
      (k) => k,
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain(evil);
    expect(el.textContent).toContain('2021-07-25');
    expect(el.textContent).toContain('<b>1</b>');
  });

  it('shows a loading line until the row detail arrives', () => {
    const el = popupContent(document, { file: 'a.csv', line: 2 }, null, (k) => k);
    expect(el.textContent).toContain('map.popup.loading');
  });
});

describe('download helpers', () => {
  it('derives a safe file name from a dataset label', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('cruise 2021: ST1/ST2?.csv')).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(safeFileName('')).toBe('dataset');
    expect(safeFileName('a'.repeat(300)).length).toBeLessThanOrEqual(80);
    expect(fileBase('layout-wide.csv')).toBe('layout-wide');
    expect(fileBase('book.xlsx (Sheet 1)')).toBe('book_Sheet_1');
    expect(fileBase('Zażółć gęślą.csv')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('creates a blob URL, clicks a download link and revokes the URL afterwards', () => {
    const calls: string[] = [];
    const click = vi.fn();
    let revoked: string | undefined;
    let scheduled: (() => void) | undefined;
    const doc = {
      createElement: () => ({ href: '', download: '', rel: '', click, remove: () => calls.push('remove') }),
      body: { appendChild: () => calls.push('append') },
    } as unknown as Document;
    downloadText('a,b\n1,2\n', 'x.csv', 'text/csv', {
      doc,
      urls: { createObjectURL: () => 'blob:abc', revokeObjectURL: (u: string) => (revoked = u) },
      schedule: (fn) => (scheduled = fn),
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoked).toBeUndefined();
    scheduled?.();
    expect(revoked).toBe('blob:abc');
  });
});

describe('draftSections', () => {
  it('lists extent, bbox, licence and variables under the GeoNetwork section names of the language', () => {
    const s = draftSections(
      {
        temporalExtent: { start: '2021-07-25', end: '2021-07-26' },
        bbox: { west: 15.1, east: 16.2, south: 76.5, north: 76.9 },
        licence: { spdx: 'CC-BY-4.0', uri: 'https://creativecommons.org/licenses/by/4.0/' },
        variables: [{ name: 'DIC', unit: 'µmol/kg' }, { name: 'DOC' }],
        title: 'T',
      },
      'en',
    );
    expect(s.map((x) => x.id)).toEqual(['temporalExtent', 'bbox', 'licence', 'variables']);
    expect(s[0].heading).toBe('Temporal extent');
    expect(s[1].fields.map((f) => f.value)).toEqual(['15.1', '16.2', '76.5', '76.9']);
    expect(s[3].fields[0].copy).toBe('DIC [µmol/kg]\nDOC');
    expect(draftSections({ variables: [] }, 'en')).toEqual([]);
  });
});

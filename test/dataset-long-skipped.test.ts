// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A long sheet in which another row has the same key and parameter with a different value: only the first is kept, and that is now said (ROW-LONG-VALUE-SKIPPED). Every row is invented.
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDataset } from '../src/core/dataset';
import { proposeLayout, proposeMappings } from '../src/core/recognize/layout';
import { renderPlain } from '../src/core/report';
import { LANGS } from '../src/core/types';
import { parseFile } from '../src/core/parse';
import { textFile } from './helpers/files';

/** 2 stations x 3 parameters x 3 levels of the column `level` = 18 source values. */
const sheet = (level: string, dup = false): string => {
  const lines = [`Station,Latitude,Longitude,Date,${level},Parameter,Value`];
  for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) for (const l of [1, 2, 3]) lines.push(`${s},49.4,0.2,2020-06-01,${l},${p},${dup ? 7 : l + s.length + p.length}`);
  return lines.join('\n');
};
const build = (text: string) => {
  const file = textFile('long.csv', text);
  const layout = proposeLayout(file);
  return buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
};

describe('ROW-LONG-VALUE-SKIPPED', () => {
  // nothing but the value tells the rows apart: the first one stays and the rest are said
  const bare = (dup = false): string => {
    const lines = ['Station,Latitude,Longitude,Date,Parameter,Value'];
    for (const s of ['S1', 'S2']) for (const p of ['Corg', 'Ntot', 'Ptot']) for (const l of [1, 2, 3]) lines.push(`${s},49.4,0.2,2020-06-01,${p},${dup ? 7 : l + s.length + p.length}`);
    return lines.join('\n');
  };

  it('18 source values, 6 kept, 12 said', () => {
    const { dataset, findings } = build(bare());
    expect(dataset.rows.flatMap((r) => Object.values(r.values))).toHaveLength(6);
    const f = findings.filter((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED');
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(12);
    expect(f[0].lines).toHaveLength(12);
    expect(['Corg', 'Ntot', 'Ptot']).toContain(f[0].field);
    for (const lang of LANGS) {
      const text = renderPlain(f[0], lang);
      expect(text).toContain('12');
      expect(text).not.toMatch(/[{}]/);
    }
  });

  it('a level column now keeps all 18 values and says nothing skipped (ROW-LONG-KEY-EXTENDED instead)', () => {
    for (const level of ['Pressure [dbar]', 'Replicate']) {
      const { dataset, findings } = build(sheet(level));
      expect(dataset.rows.flatMap((r) => Object.values(r.values))).toHaveLength(18);
      expect(findings.some((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED'), level).toBe(false);
    }
  });

  it('exact duplicates (the same value again) do not fire', () => {
    const { findings } = build(bare(true));
    expect(findings.filter((x) => x.ruleId === 'ROW-LONG-VALUE-SKIPPED')).toEqual([]);
  });

  it('the kept value and the row counts are as before: the first one stays', () => {
    const { dataset } = build(bare());
    expect(dataset.rows).toHaveLength(2);
    expect(Object.values(dataset.rows[0].values).map((v) => v.raw)).toEqual(['7', '7', '7']);
  });
});

describe('ROW-LONG-NO-PARAMETER and ROW-LONG-PARAMETER-MERGED (round 4 K1)', () => {
  const H = 'Station,Lat,Lon,Date,Parameter,Unit,Value';
  it('a row with a value and no parameter name is reported with its line; a row with neither is not', () => {
    const { findings } = build([H, 'A,54.5,18.5,2021-06-01,Nitrate,umol/l,1.1', 'A,54.5,18.5,2021-06-01,Nitrate,umol/l,1.2', 'A,54.5,18.5,2021-06-01,,umol/l,9.9', 'B,54.5,18.5,2021-06-02,,,'].join('\n'));
    const f = findings.filter((x) => x.ruleId === 'ROW-LONG-NO-PARAMETER');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([4]);
    expect(f[0].params).toMatchObject({ count: 1, column: 'Parameter' });
    for (const lang of LANGS) expect(renderPlain(f[0], lang)).not.toMatch(/[{}]/);
  });
  it('no blank parameter, no finding', () => {
    const { findings } = build([H, 'A,54.5,18.5,2021-06-01,Nitrate,umol/l,1.1'].join('\n'));
    expect(findings.some((x) => x.ruleId === 'ROW-LONG-NO-PARAMETER' || x.ruleId === 'ROW-LONG-PARAMETER-MERGED')).toBe(false);
  });

  const book = (rows: unknown[][], merges: XLSX.Range[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows as never);
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const file = parseFile('m.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    const layout = proposeLayout(file);
    return buildDataset(file, layout, proposeMappings(file, layout), [], 'd');
  };
  const hdr = ['Station', 'Lat', 'Lon', 'Date', 'Parameter', 'Unit', 'Value'];
  const rows = [hdr, ['A', 54.5, 18.5, '2021-06-01', 'Nitrate', 'umol/l', 1.1], ['B', 54.5, 18.6, '2021-06-01', null, 'umol/l', 1.2], ['C', 54.5, 18.7, '2021-06-01', null, 'umol/l', 1.3], ['D', 54.5, 18.8, '2021-06-01', 'Silicate', 'umol/l', 2.1]];
  it('a parameter cell merged over rows 2-4 applies to all three rows, with a note naming lines 3 and 4', () => {
    const { dataset, findings } = book(rows, [{ s: { r: 1, c: 4 }, e: { r: 3, c: 4 } }]);
    expect(dataset.rows.flatMap((r) => Object.values(r.values))).toHaveLength(4);
    const f = findings.filter((x) => x.ruleId === 'ROW-LONG-PARAMETER-MERGED');
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([3, 4]);
    expect(f[0].params).toMatchObject({ count: 2, column: 'Parameter' });
    expect(findings.some((x) => x.ruleId === 'ROW-LONG-NO-PARAMETER')).toBe(false);
    for (const lang of LANGS) expect(renderPlain(f[0], lang)).not.toMatch(/[{}]/);
  });
  it('a merge in another column changes nothing: the blank parameters stay blank and are reported', () => {
    const more = [...rows, ['E', 54.5, 18.9, '2021-06-01', 'Nitrate', 'umol/l', 1.4], ['F', 54.5, 19, '2021-06-01', 'Silicate', 'umol/l', 2.2]];
    const { findings } = book(more, [{ s: { r: 1, c: 5 }, e: { r: 3, c: 5 } }]);
    expect(findings.some((x) => x.ruleId === 'ROW-LONG-PARAMETER-MERGED')).toBe(false);
    expect(findings.find((x) => x.ruleId === 'ROW-LONG-NO-PARAMETER')?.lines).toEqual([3, 4]);
  });
  it('a horizontal merge or one that starts on the header row fills nothing', () => {
    const a = book(rows, [{ s: { r: 1, c: 4 }, e: { r: 1, c: 5 } }]);
    expect(a.findings.some((x) => x.ruleId === 'ROW-LONG-PARAMETER-MERGED')).toBe(false);
    const b = book(rows, [{ s: { r: 0, c: 4 }, e: { r: 3, c: 4 } }]);
    expect(b.findings.some((x) => x.ruleId === 'ROW-LONG-PARAMETER-MERGED')).toBe(false);
  });
  it('a blank value inside the merge is not filled (nothing is invented where there is no measurement)', () => {
    const r2 = [hdr, ['A', 54.5, 18.5, '2021-06-01', 'Nitrate', 'umol/l', 1.1], ['B', 54.5, 18.6, '2021-06-01', null, 'umol/l', null], ['C', 54.5, 18.7, '2021-06-01', null, 'umol/l', 1.3], ['D', 54.5, 18.8, '2021-06-01', 'Silicate', 'umol/l', 2.1]];
    const { findings } = book(r2, [{ s: { r: 1, c: 4 }, e: { r: 3, c: 4 } }]);
    expect(findings.find((x) => x.ruleId === 'ROW-LONG-PARAMETER-MERGED')?.lines).toEqual([4]);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Defects found by a local run of real reference files before /convert is made public. Every file, value and name below is INVENTED; only the SHAPE of the
// real files is mimicked (a PANGAEA table, an environmental sheet with units in the headers, a data-dictionary sheet, ...).
import { describe, expect, it } from 'vitest';
import { createDirectConvertEngine } from '../../src/worker/convert.handler';
import { candidatesOf, initialChoices, requestOf, sheetKey, type ConvertState } from '../../src/app/convertModel';
import type { ConvertParseResult } from '../../src/worker/convert.protocol';
import { csvOf } from '../app/convertHelpers';
import type { Cell } from './helpers';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Parses one file in a fresh engine and returns what the page would hold at the start (every proposal, nothing confirmed). */
async function open(name: string, text: string) {
  const engine = createDirectConvertEngine();
  const parsed: ConvertParseResult = await engine.parse([{ name, bytes: enc(text), source: 'dropped' }]);
  const state: ConvertState = { parsed, mappings: {}, choices: initialChoices(parsed), options: {}, approved: {}, confirmed: {} };
  const run = async (quantity: { kind: 'count' } | undefined = { kind: 'count' }) => {
    for (const c of candidatesOf(parsed, state.mappings, state.choices)) state.confirmed[c.key] = true;
    const req = requestOf(state);
    const withQ = { ...req, sheets: req.sheets.map((s) => ({ ...s, ...(quantity ? { quantity } : {}) })) };
    return engine.convert(withQ);
  };
  return { engine, parsed, state, run };
}

describe('item 1: a table whose station names read like column names is not "transposed"', () => {
  const stations = ['stn A', 'stn B', 'Stn. N', 'stn A', 'stn B', 'Stn. N'];
  it('a PANGAEA table: the converter reads it as one wide table, as /check does (no IN-LAYOUT-UNSUPPORTED)', async () => {
    const header = ['Station', 'Sample ID', 'Date/Time', 'Latitude', 'Longitude', 'Depth water [m]', 'Calanus finmarchicus [#/m**3]'];
    const rows = stations.map((c, i) => [c, `S${i + 1}`, `2099-01-0${i + 1}T10:00`, 70 + i / 10, 10 + i / 10, 10 * (i + 1), i + 1]);
    const text = [
      '/* DATA DESCRIPTION:',
      'Citation:\tDoe, Jane (2099): Invented table. PANGAEA, https://doi.org/10.1594/PANGAEA.000000',
      'Parameter(s):\tStation label (Station)',
      '\tSample ID (Sample ID)',
      '\tDate/Time of event (Date/Time)',
      '\tLatitude of event (Latitude)',
      '\tLongitude of event (Longitude)',
      '\tDEPTH, water [m] (Depth water) * GEOCODE',
      '\tCalanus finmarchicus [#/m**3] (Calanus finmarchicus) * PI: Doe, Jane',
      'Size:\t6 data points',
      '',
      '*/',
      header.join('\t'),
      ...rows.map((r) => r.join('\t')),
    ].join('\n') + '\n';
    const { run } = await open('invented.tab', text);
    const v = await run();
    expect(v.stats.samples).toBe(6);
    expect(v.findings.map((f) => f.ruleId)).not.toContain('IN-LAYOUT-UNSUPPORTED');
  });

  it('the same station names in a plain CSV', async () => {
    const csv = csvOf(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], stations.map((c, i) => [c, `S${i}`, 70 + i / 10, 10 + i / 10, `2099-01-0${i + 1}`, i + 1]));
    const { run } = await open('codes.csv', csv);
    expect((await run()).findings.map((f) => f.ruleId)).not.toContain('IN-LAYOUT-UNSUPPORTED');
  });
});

export { candidatesOf, sheetKey };
export type { Cell };

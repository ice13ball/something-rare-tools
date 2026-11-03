// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// /convert is on hold and does not move: an Excel date-time with a fraction of a second is read to the whole second exactly as before, so eventDates, event IDs and occurrence IDs are what a file of
// whole seconds gives. /check keeps the millisecond; that option is set only by /check's builders. Every file here is invented.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import type { ConvertResult } from '../../src/core/convert/model';
import { xlsxFile } from '../helpers/files';
import { sheetInput } from './helpers';

const T = 43983; // 2020-06-01
const at = (secs: number) => T + secs / 86400;
const dt = (serial: number, z: string) => ({ t: 'n' as const, v: serial, z });
const HEADER = ['Sample ID', 'Station', 'Date', 'Latitude', 'Longitude', 'Species', 'Count'];

function run(secs: number[], z: string): ConvertResult {
  const rows = secs.flatMap((s, i) => ['Asterias rubens', 'Ophiura ophiura'].map((sp, k) => [`P${i < 2 ? 1 : i}`, 'A', dt(at(s), z), 55.5, 2.5, sp, i + k + 1]));
  const file = xlsxFile('f.xlsx', { S: [HEADER, ...rows] as never });
  return convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, shape: 'long' })] });
}
const view = (r: ConvertResult) => ({
  dates: r.events.map((e) => e.eventDate),
  events: r.events.map((e) => e.id),
  occurrences: r.occurrences.map((o) => o.id),
  revisit: r.findings.filter((f) => f.ruleId === 'CONV-ID-REVISIT').length,
});

describe('/convert reads an Excel fraction of a second to the whole second, as before', () => {
  for (const z of ['yyyy-mm-dd hh:mm:ss.000', 'yyyy-mm-dd hh:mm:ss']) {
    it(`samples at .250 and .750 (${z}) give the eventDates and IDs of the same file rounded to the second`, () => {
      const got = view(run([43200.25, 43200.75], z));
      const rounded = view(run([43200, 43201], 'yyyy-mm-dd hh:mm:ss'));
      expect(got).toEqual(rounded);
      expect(got.dates.some((d) => d?.includes('.'))).toBe(false);
    });

    it(`one sample at .100 and .300 (${z}) stays one event, with the IDs of the whole-second file`, () => {
      const rows = [43200.1, 43200.3].flatMap((s, i) => ['Asterias rubens', 'Ophiura ophiura'].map((sp, k) => ['P1', 'A', dt(at(s), z), 55.5, 2.5, sp, i + k + 1]));
      const file = xlsxFile('f.xlsx', { S: [HEADER, ...rows] as never });
      const got = convert({ sheets: [sheetInput(file, { quantity: { kind: 'count' }, shape: 'long' })] });
      const whole = [43200, 43200].flatMap((s, i) => ['Asterias rubens', 'Ophiura ophiura'].map((sp, k) => ['P1', 'A', dt(at(s), 'yyyy-mm-dd hh:mm:ss'), 55.5, 2.5, sp, i + k + 1]));
      const base = convert({ sheets: [sheetInput(xlsxFile('f.xlsx', { S: [HEADER, ...whole] as never }), { quantity: { kind: 'count' }, shape: 'long' })] });
      expect(view(got)).toEqual(view(base));
      expect(view(got).revisit).toBe(0);
    });
  }
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The rule changes nothing it does not say: the same conversion with the rule switched OFF (the listing returns nothing) gives the same tables, events, ledger and archive bytes as with it ON,
// apart from the one finding. Every value is invented.
import { describe, expect, it, vi } from 'vitest';

const off = vi.hoisted(() => ({ on: false }));
vi.mock('../../src/core/convert/roleUnconfirmed', async (orig) => {
  const real = await orig<typeof import('../../src/core/convert/roleUnconfirmed')>();
  return { ...real, unconfirmedRoles: (...a: Parameters<typeof real.unconfirmedRoles>) => (off.on ? [] : real.unconfirmedRoles(...a)) };
});

import { convert } from '../../src/core/convert/build';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { createConvertHandler } from '../../src/worker/convert.handler';
import { requestOf, initialChoices, sheetKey, EMPTY_QUANTITY } from '../../src/app/convertModel';
import { CTX, fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const HEADER = ['Station', 'Sample', 'Date of sampling', 'Latitude_dd', 'Longitude_dd', 'Species', 'Abundance (ind)'];
const ROWS: Cell[][] = [
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Solea solea', 4],
  ['A', 'A1', '2020-05-01', 54.1, 7.2, 'Gadus morhua', 2],
  ['B', 'B1', '2020-05-02', 54.2, 7.3, 'Solea solea', 9],
];
const RULE = 'CONV-ROLE-UNCONFIRMED';
const text = [HEADER, ...ROWS].map((r) => r.join(',')).join('\n') + '\n';

describe('the rule switched off and on', () => {
  it('the conversion is the same apart from the one finding, and the mapping is the proposer\'s raw output either way', () => {
    const run = (on: boolean) => {
      off.on = !on;
      const f = fileOf(HEADER, ROWS, 'S', { fileName: 'catch.csv' });
      const input = sheetInput(f, { quantity: { kind: 'count' } });
      const before = JSON.stringify(input.mapping);
      const r = convert({ sheets: [input], approvedSplits: {} });
      expect(JSON.stringify(input.mapping)).toBe(before);
      expect(input.mapping.columns).toEqual(proposeConvertMapping(f.sheets[0], CTX).columns);
      return r;
    };
    const withRule = run(true);
    const without = run(false);
    expect(withRule.findings.filter((f) => f.ruleId === RULE)).toHaveLength(1);
    expect(without.findings.filter((f) => f.ruleId === RULE)).toHaveLength(0);
    const strip = (r: ReturnType<typeof run>) => JSON.stringify({ ...r, findings: r.findings.filter((f) => f.ruleId !== RULE) });
    expect(strip(withRule)).toBe(strip(without));
    off.on = false;
  });

  it('the archive bytes are identical with and without the rule', async () => {
    const exportBytes = async (on: boolean): Promise<Uint8Array> => {
      off.on = !on;
      const h = createConvertHandler();
      const parsed = h.handle({ type: 'parse', files: [{ name: 'catch.csv', bytes: new TextEncoder().encode(text), source: 'dropped' }] } as never) as never as { files: { fileId: string; mappings: { sheet: string; columns: unknown[] }[] }[] };
      const choices = initialChoices(parsed as never);
      const key = sheetKey(parsed.files[0].fileId, 'catch.csv');
      choices[key] = { ...choices[key], use: true, shape: 'long', quantity: { ...EMPTY_QUANTITY, kind: 'count' } };
      const body = requestOf({ parsed: parsed as never, mappings: { [parsed.files[0].fileId]: parsed.files[0].mappings } as never, choices, options: { fullList: false, prefixStation: false, flatten: { station: false, cruise: false } }, approved: {}, confirmed: {}, metadata: EMPTY_METADATA });
      const meta = { ...EMPTY_METADATA, title: 'Invented counts', abstract: 'Invented values for a test.', creators: 'Ada Example', contactName: 'Ada Example', contactEmail: 'ada@example.org', institutionCode: 'INVENTED', licence: 'CC-BY-4.0' as const, basisOfRecord: 'HumanObservation' as const };
      const view = h.handle({ type: 'convert', body } as never) as { findings: { ruleId: string }[] };
      // the finding is there with the rule on and absent with it off
      expect(view.findings.some((f) => f.ruleId === RULE), `finding present: ${on}`).toBe(on);
      const accepted = [...new Set(view.findings.map((f) => f.ruleId))];
      const ex = (await h.handle({ type: 'export', export: { body, metadata: meta, accepted, generated: '2026-11-06T00:00:00Z' } } as never)) as { bytes: Uint8Array };
      return ex.bytes;
    };
    const a = await exportBytes(true);
    const b = await exportBytes(false);
    off.on = false;
    expect(a.length).toBeGreaterThan(500);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

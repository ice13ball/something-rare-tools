// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The declaration "all measurements come from one cruise of one ship": it travels with a run (the check request), is written
// into the sidecar (the companion mapping file) and read back from it, and is nowhere else.
import { describe, expect, it } from 'vitest';
import { createDirectEngine } from '../../src/worker/handler';
import type { Engine, InputFile } from '../../src/worker/protocol';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dropped = (name: string, text: string): InputFile => ({ name, bytes: enc(text), source: 'dropped' });

/** A 10 knot track, one cast every 6 hours; cast 8 is at latitude 58 instead of 78. */
function trackCsv(): string {
  const lines = ['Station,Latitude,Longitude,Date,Temperature [degC]'];
  for (let i = 0; i < 12; i++) {
    const t = new Date(Date.UTC(2021, 6, 1) + i * 6 * 3_600_000).toISOString().slice(0, 16);
    lines.push(`S${i},${i === 8 ? '58.00' : (70 + i).toFixed(2)},15.50,${t},4.2`);
  }
  return lines.join('\n') + '\n';
}

async function run(e: Engine, files: InputFile[], singleCruise?: boolean) {
  const p = await e.parse(files, [], []);
  for (const f of p.files) {
    const pr = await e.propose(f.fileId, f.layout);
    await e.build(f.fileId, f.layout, pr.mappings);
  }
  const res = await e.check(singleCruise === undefined ? undefined : { singleCruise });
  return { p, res };
}

const speed = (r: { report: { findings: { ruleId: string }[] } }) => r.report.findings.filter((f) => f.ruleId.startsWith('ROW-SHIP-SPEED'));

describe('one cruise of one ship: the declaration', () => {
  it('without it the rule does not run and the report says so; with it the 58 instead of 78 is a warning', async () => {
    const e = createDirectEngine();
    const off = await run(e, [dropped('cruise.csv', trackCsv())]);
    expect(off.p.singleCruise).toBe(false);
    expect(speed(off.res)).toEqual([]);
    expect(off.res.report.notChecked).toContain('notChecked.shipSpeed');
    const on = await run(createDirectEngine(), [dropped('cruise.csv', trackCsv())], true);
    expect(speed(on.res).map((f) => f.ruleId)).toEqual(['ROW-SHIP-SPEED']);
    expect(on.res.report.notChecked).not.toContain('notChecked.shipSpeed');
  });

  it('is written to the sidecar only when declared, and a sidecar dropped with new files restores it', async () => {
    const e1 = createDirectEngine();
    const { p } = await run(e1, [dropped('cruise.csv', trackCsv())], true);
    const id = (await e1.check({ singleCruise: true })).datasets[0].id;
    const sidecar = await e1.export('sidecar', [id]);
    expect(sidecar).toContain('(setting),singleCruise=yes,,,');
    expect(p.files).toHaveLength(1);

    // a new session: the sidecar is read as a mapping file, not as a data table, and the tick starts from it
    const e2 = createDirectEngine();
    const again = await e2.parse([dropped('cruise.csv', trackCsv()), dropped('cruise.sidecar.csv', sidecar)], [], []);
    expect(again.singleCruise).toBe(true);
    expect(again.mappingFiles).toEqual(['cruise.sidecar.csv']);
    expect(again.files.map((f) => f.fileName)).toEqual(['cruise.csv']);

    // the same files without the sidecar: unticked. Nothing was remembered, in this engine or the one before.
    expect((await e2.parse([dropped('cruise.csv', trackCsv())], [], [])).singleCruise).toBe(false);
    expect((await createDirectEngine().parse([dropped('cruise.csv', trackCsv())], [], [])).singleCruise).toBe(false);

    // and a run that is not declared writes no setting, even in a session that was declared before
    const e3 = createDirectEngine();
    await run(e3, [dropped('cruise.csv', trackCsv())], true);
    const p3 = await e3.parse([dropped('cruise.csv', trackCsv())], [], []);
    const pr = await e3.propose(p3.files[0].fileId, p3.files[0].layout);
    await e3.build(p3.files[0].fileId, p3.files[0].layout, pr.mappings);
    const res3 = await e3.check();
    expect(await e3.export('sidecar', [res3.datasets[0].id])).not.toContain('(setting)');
  });

  it('a sidecar from before the setting existed, or with a setting the tool does not know, is read without the declaration and breaks nothing', async () => {
    const old = 'original_column,output_column,unit,unit_source,p01\nStation,station,,,\nLatitude,latitude [degrees_north],degrees_north,output-convention,\n(note),depth unit not stated in the source; the column has no unit,,,\n';
    const e = createDirectEngine();
    const r = await e.parse([dropped('cruise.csv', trackCsv()), dropped('old.sidecar.csv', old)], [], []);
    expect(r.singleCruise).toBe(false);
    expect(r.mappingFiles).toEqual(['old.sidecar.csv']);
    expect(r.files).toHaveLength(1);
    const odd = old + '(setting),somethingElse=yes,,,\n(setting),singleCruise=maybe,,,\n';
    expect((await createDirectEngine().parse([dropped('cruise.csv', trackCsv()), dropped('odd.sidecar.csv', odd)], [], [])).singleCruise).toBe(false);
  });

  it('a data table that only resembles a sidecar (other header) is still a data table', async () => {
    const csv = 'original_column,value\nA,1\nB,2\n';
    const r = await createDirectEngine().parse([dropped('x.csv', csv)], [], []);
    expect(r.mappingFiles).toEqual([]);
    expect(r.files).toHaveLength(1);
  });

  it('all files of the cruise are one track: CTD and nutrients in two files, the bad cast reported in each', async () => {
    const e = createDirectEngine();
    const { res } = await run(e, [dropped('ctd.csv', trackCsv()), dropped('nutrients.csv', trackCsv())], true);
    const f = speed(res);
    expect(f.map((x) => x.ruleId)).toEqual(['ROW-SHIP-SPEED', 'ROW-SHIP-SPEED']);
    expect(res.report.findings.filter((x) => x.ruleId === 'ROW-SHIP-SPEED').map((x) => x.file).sort()).toEqual(['ctd.csv', 'nutrients.csv']);
  });
});

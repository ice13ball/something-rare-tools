// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The convert worker: its handler (parse, convert, proposeCodes), the page-side client over a fake worker, and that /check's worker files are the
// ones of production.
import { describe, expect, it } from 'vitest';
import { writeConvertSidecar } from '../../src/core/convert/settings';
import { createConvertWorkerClient, type ConvertWorkerLike } from '../../src/worker/convert.client';
import { EMPTY_METADATA } from '../../src/core/convert/metadata';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertRequestBody, ConvertWireRequest } from '../../src/worker/convert.protocol';
import type { InputFile } from '../../src/worker/protocol';
import { RESULTS_CSV, SAMPLES_CSV } from '../convert/joinFixtures';
import { COLLISION_CSV, L1_CSV, NO_CODE_CSV, SIDECAR_CSV, W1_CSV, csvOf } from './convertHelpers';
import { keyHashes } from '../../src/core/convert/keySetting';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const file = (name: string, text: string): InputFile => ({ name, bytes: enc(text), source: 'dropped' });

describe('parse', () => {
  it('reads a table with the converter overlay: sheets, mappings, proposals, samples, a suggested shape and a layout of one table per sheet', async () => {
    const e = createDirectConvertEngine();
    const r = await e.parse([file('w1.csv', W1_CSV)]);
    expect(r.problems).toEqual([]);
    expect(r.files).toHaveLength(1);
    const f = r.files[0];
    expect(f.fileId).toBe('c1');
    expect(f.layout.joins).toEqual([]);
    expect(f.layout.tables.map((t) => t.sheet)).toEqual([f.sheets[0].name]);
    const sheet = f.sheets[0].name;
    expect(f.suggestedShapes[sheet]).toBe('wide');
    expect(f.mappings[0].columns.find((c) => c.header === 'Calanus finmarchicus')?.role).toEqual({ kind: 'taxon', header: true });
    expect(f.proposals[sheet].find((p) => p.header === 'Calanus finmarchicus')?.confidence).toBe('low');
    expect(f.samples[sheet][9]).toEqual(['10', '7', 'NA']);
    expect((await e.parse([file('l1.csv', L1_CSV)])).files[0].suggestedShapes['l1.csv']).toBe('long');
  });

  it('a companion file of the drop is not a table: its settings come back, nothing is remembered between drops', async () => {
    const e = createDirectConvertEngine();
    const r = await e.parse([file('w1.csv', W1_CSV), file('run.sidecar.csv', SIDECAR_CSV)]);
    expect(r.mappingFiles).toEqual(['run.sidecar.csv']);
    expect(r.settings).toEqual({ fullList: true, prefixStation: true, worms: false, nvs: false });
    expect(r.files.map((f) => f.fileName)).toEqual(['w1.csv']);
    expect((await e.parse([file('w1.csv', W1_CSV)])).settings).toEqual({ fullList: false, prefixStation: false, worms: false, nvs: false });
  });

  it('reports a file that holds no table without throwing', async () => {
    const r = await createDirectConvertEngine().parse([file('notes.pdf', '%PDF-1.4 not a table')]);
    expect(r.files).toEqual([]);
    expect(r.notRead).toEqual([{ fileName: 'notes.pdf', kind: 'pdf' }]);
  });
});

describe('convert', () => {
  const body = (fileId: string, sheet: string, mapping: ConvertRequestBody['sheets'][0]['mapping'], extra: Partial<ConvertRequestBody['sheets'][0]> = {}): ConvertRequestBody => ({
    sheets: [{ fileId, sheet, mapping, shape: 'wide', ...extra }],
    options: {},
    approvedSplits: {},
  });

  it('gives a light view: findings, counts, the tree summary, the splits and a few example events, never the records', async () => {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('w1.csv', W1_CSV)]);
    const f = p.files[0];
    const v = await e.convert(body(f.fileId, f.sheets[0].name, f.mappings[0], { quantity: { kind: 'count', effort: { source: 'column' } } }));
    expect(v.ok).toBe(false);
    expect(v.findings.map((x) => x.ruleId)).toContain('CONV-SPLIT-UNDECIDED');
    expect(v.splits.filter((s) => s.needsDecision).map((s) => s.verbatim)).toEqual(['Pseudocalanus sp.']);
    expect(v.tree).toMatchObject({ cruises: 1, stations: 2, samples: 3 });
    expect(v.examples.cruise.map((x) => x.id)).toEqual(['CR1']);
    expect(v.examples.sample.map((x) => x.id)).toEqual(['S1-a', 'S1-b', 'S2-a']);
    expect(JSON.stringify(v)).not.toContain('S1-a:Calanus');
  });

  it('the companion file of the drop pre-ticks the NVS option; nothing is remembered between drops', async () => {
    const e = createDirectConvertEngine();
    const r = await e.parse([file('w1.csv', W1_CSV), file('run.sidecar.csv', writeConvertSidecar({ nvs: true }))]);
    expect(r.settings.nvs).toBe(true);
    expect((await e.parse([file('w1.csv', W1_CSV)])).settings.nvs).toBe(false);
  });

  it('the worker checks the NERC picks of the request itself: a valid one is written, a deprecated, foreign or malformed one is not, and the view counts only what was written', async () => {
    const e = createDirectConvertEngine();
    const csv = 'Sample,Latitude,Longitude,Date,Calanus finmarchicus,Temperature [°C]\nA1,55.5,2.5,2023-06-14,4,7.1\n';
    const p = await e.parse([file('t.csv', csv)]);
    const f = p.files[0];
    const col = f.mappings[0].columns.findIndex((c) => c.header === 'Temperature [°C]');
    const run = (pick: unknown) => e.convert(body(f.fileId, f.sheets[0].name, f.mappings[0], { quantity: { kind: 'count' }, nerc: { [col]: { type: pick } } as never }));
    const good = await run({ id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', source: 'suggested', deprecated: false });
    expect(good.stats.nerc).toEqual({ columns: 1, typeIds: 1, unitIds: 0, nvsIds: 0 });
    expect(good.findings.some((x) => x.ruleId === 'CONV-NERC-UNKNOWN')).toBe(false);
    for (const bad of [{ id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', source: 'nvs', deprecated: true }, { id: 'Temperature of the water body', source: 'nvs', deprecated: false }, { id: 'http://evil.example/x/', source: 'nvs', deprecated: false }, 'x', null]) {
      const v = await run(bad);
      expect(v.stats.nerc.typeIds, JSON.stringify(bad)).toBe(0);
      expect(v.findings.some((x) => x.ruleId === 'CONV-NERC-UNKNOWN'), JSON.stringify(bad)).toBe(true);
    }
  });

  it('a sheet that is left out is not converted at all; an unknown file id is an error, not a crash', async () => {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('w1.csv', W1_CSV)]);
    expect((await e.convert({ sheets: [], options: {}, approvedSplits: {} })).tree.events).toBe(0);
    await expect(e.convert(body('c99', 'x', p.files[0].mappings[0]))).rejects.toThrow(/Unknown file id/);
  });

  it('names the sheets that lack sample codes and the collision of codes, for the page to offer its steps', async () => {
    const e = createDirectConvertEngine();
    const a = await e.parse([file('no-code.csv', NO_CODE_CSV)]);
    const va = await e.convert(body(a.files[0].fileId, a.files[0].sheets[0].name, a.files[0].mappings[0], { quantity: { kind: 'count' } }));
    expect(va.codesMissing).toEqual([{ fileId: 'c1', sheet: a.files[0].sheets[0].name }]);
    const b = await e.parse([file('collision.csv', COLLISION_CSV)]);
    const vb = await e.convert(body(b.files[0].fileId, b.files[0].sheets[0].name, b.files[0].mappings[0], { quantity: { kind: 'count' } }));
    expect(vb.codeCollision).toBe(true);
    const on = await e.convert({ ...body(b.files[0].fileId, b.files[0].sheets[0].name, b.files[0].mappings[0], { quantity: { kind: 'count' } }), options: { prefixStation: true } });
    expect(on.codeCollision).toBe(false);
    expect(on.ok).toBe(true);
  });
});

describe('proposeCodes', () => {
  it('returns the user sheet with the new code column, or nothing when the sheet has a code column', async () => {
    const e = createDirectConvertEngine();
    const a = await e.parse([file('no-code.csv', NO_CODE_CSV)]);
    const p = await e.proposeCodes(a.files[0].fileId, a.files[0].sheets[0].name, a.files[0].mappings[0]);
    expect(p?.header).toBe('sample_code');
    expect(p?.rows).toBe(3);
    expect(p?.csv.split('\n')[1].endsWith(',S1-1')).toBe(true);
    const b = await e.parse([file('w1.csv', W1_CSV)]);
    expect(await e.proposeCodes(b.files[0].fileId, b.files[0].sheets[0].name, b.files[0].mappings[0])).toBeNull();
  });
});

describe('the worker client', () => {
  /** A fake worker that answers from a real handler, like the browser's would. */
  function fake(): ConvertWorkerLike & { posted: ConvertWireRequest[]; transfers: Transferable[][]; crash(): void } {
    const h = createConvertHandler();
    const w: ConvertWorkerLike & { posted: ConvertWireRequest[]; transfers: Transferable[][]; crash(): void } = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      posted: [],
      transfers: [],
      postMessage(msg, transfer) {
        w.posted.push(msg);
        w.transfers.push(transfer ?? []);
        queueMicrotask(() => {
          try {
            w.onmessage?.({ data: { id: msg.id, ok: true, result: h.handle(msg.req) } } as MessageEvent);
          } catch (e) {
            w.onmessage?.({ data: { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) } } as MessageEvent);
          }
        });
      },
      terminate() {},
      crash() {
        w.onerror?.({ preventDefault() {} } as ErrorEvent);
      },
    };
    return w;
  }

  it('creates the worker on first use, moves the file bytes instead of copying them, and turns answers into promises', async () => {
    let created = 0;
    let w!: ReturnType<typeof fake>;
    const engine = createConvertWorkerClient(() => {
      created++;
      return (w = fake());
    });
    expect(created).toBe(0);
    const r = await engine.parse([file('w1.csv', W1_CSV)]);
    expect(created).toBe(1);
    expect(r.files[0].fileName).toBe('w1.csv');
    expect(w.transfers[0]).toHaveLength(1);
    await expect(engine.convert({ sheets: [{ fileId: 'zz', sheet: 'x', mapping: { sheet: 'x', columns: [] }, shape: 'wide' }], options: {}, approvedSplits: {} })).rejects.toThrow(/Unknown file id/);
  });

  it('a crashed worker rejects what was waiting and the next request starts a fresh one', async () => {
    const workers: ReturnType<typeof fake>[] = [];
    const engine = createConvertWorkerClient(() => {
      const w = fake();
      w.postMessage = () => undefined; // never answers
      workers.push(w);
      return w;
    });
    const pending = engine.parse([file('w1.csv', W1_CSV)]);
    workers[0].crash();
    await expect(pending).rejects.toThrow(/converter worker failed/);
    void engine.reset();
    expect(workers).toHaveLength(2);
  });
});

describe('sample join', () => {
  const R = { fileId: 'c1', sheet: 'results.csv' };
  const D = { fileId: 'c2', sheet: 'samples.csv' };
  const KEYS = [{ results: 0, description: 0 }];

  /** Two files dropped, a request with the results sheet first (or the description first with `swap`). */
  async function twins(resultsCsv = RESULTS_CSV, samplesCsv = SAMPLES_CSV, swap = false) {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('results.csv', resultsCsv), file('samples.csv', samplesCsv)]);
    const [rf, sf] = p.files;
    const results = { fileId: rf.fileId, sheet: 'results.csv', mapping: rf.mappings[0], shape: 'long' as const, quantity: { kind: 'count' as const } };
    const samples = { fileId: sf.fileId, sheet: 'samples.csv', mapping: sf.mappings[0], shape: 'wide' as const };
    const body = (extra: Partial<ConvertRequestBody> = {}): ConvertRequestBody => ({ sheets: swap ? [samples, results] : [results, samples], options: {}, approvedSplits: {}, ...extra });
    return { e, body, p };
  }
  const confirmed = (extra: Record<string, unknown> = {}) => ({ results: R, description: D, keys: KEYS, conflicts: [], ...extra });
  const ids = (v: { findings: { ruleId: string }[] }, rule: string): number => v.findings.filter((f) => f.ruleId === rule).length;

  it('without a confirmation the sheets convert as before, with one CONV-JOIN-PROPOSED more: the same as when the pair is declined', async () => {
    const { e, body } = await twins();
    const open = await e.convert(body());
    expect(ids(open, 'CONV-JOIN-PROPOSED')).toBe(1);
    expect(ids(open, 'CONV-ID-DUPLICATE')).toBeGreaterThan(0);
    expect(open.sampleJoin.proposals).toEqual([{ results: R, description: D, keys: KEYS, covered: 2, samples: 2 }]);
    const declined = await e.convert(body({ sampleJoinNo: [{ results: R, description: D }] }));
    expect(ids(declined, 'CONV-JOIN-PROPOSED')).toBe(0);
    expect(declined.sampleJoin).toEqual({ proposals: [], conflicts: [], resultsSheets: [{ fileId: 'c1', sheet: 'results.csv' }] });
    expect(open.findings.filter((f) => f.ruleId !== 'CONV-JOIN-PROPOSED')).toEqual(declined.findings);
    expect(open.ledger).toEqual(declined.ledger);
    expect(open.notWritten).toEqual(declined.notWritten);
  });

  it('a confirmed join over two files merges the sheets: no duplicate sample, the description sheet is not listed as not used, no proposal is left', async () => {
    const { e, body } = await twins();
    const v = await e.convert(body({ sampleJoin: [confirmed()] }));
    expect(ids(v, 'CONV-ID-DUPLICATE')).toBe(0);
    expect(ids(v, 'CONV-JOIN-PROPOSED')).toBe(0);
    expect(v.ledger.some((l) => l.file === 'samples.csv' && l.kind === 'not-used')).toBe(false);
    expect(v.ledger.filter((l) => l.file === 'samples.csv').map((l) => l.kind)).toEqual(['description']);
    expect(v.sampleJoin).toEqual({ proposals: [], conflicts: [], resultsSheets: [] });
    expect(v.tree.samples).toBe(3);
  });

  it('the page may send the sheets in any order: the join is by file and sheet, not by position', async () => {
    const { e, body } = await twins(RESULTS_CSV, SAMPLES_CSV, true);
    const v = await e.convert(body({ sampleJoin: [confirmed()] }));
    expect(ids(v, 'CONV-ID-DUPLICATE')).toBe(0);
    expect(v.tree.samples).toBe(3);
  });

  it('a join that cannot be applied (the description sheet absent, a key index out of range) is dropped without a throw and its proposal is back', async () => {
    const { e, body } = await twins();
    const alone = { ...body(), sheets: body().sheets.slice(0, 1) };
    const gone = await e.convert({ ...alone, sampleJoin: [confirmed()] });
    expect(gone.sampleJoin.proposals).toEqual([]);
    const bad = await e.convert(body({ sampleJoin: [confirmed({ keys: [{ results: 99, description: 0 }] })] }));
    expect(ids(bad, 'CONV-ID-DUPLICATE')).toBeGreaterThan(0);
    expect(bad.sampleJoin.proposals).toHaveLength(1);
    expect(ids(bad, 'CONV-JOIN-PROPOSED')).toBe(1);
    const unknown = await e.convert(body({ sampleJoin: [confirmed({ description: { fileId: 'c9', sheet: 'nope' } })] }));
    expect(unknown.sampleJoin.proposals).toHaveLength(1);
  });

  it('results samples without a description: the answer with its number removes CONV-JOIN-NO-DESCRIPTION and the export is refused by the rules a lone sample without a date gets', async () => {
    const results = RESULTS_CSV + 'X04,Calanus finmarchicus,5\n';
    const { e, body } = await twins(results);
    const open = await e.convert(body({ sampleJoin: [confirmed()] }));
    expect(ids(open, 'CONV-JOIN-NO-DESCRIPTION')).toBe(1);
    const answered = await e.convert(body({ sampleJoin: [confirmed({ resultsOnly: 1 })] }));
    expect(ids(answered, 'CONV-JOIN-NO-DESCRIPTION')).toBe(0);
    const refusal = async (engine: typeof e, b: ConvertRequestBody): Promise<string[]> => {
      const err = await engine.export({ body: b, metadata: { ...EMPTY_METADATA }, accepted: [], generated: '2026-11-12T00:00:00Z' }).then(() => '', (x: Error) => x.message);
      return (/\(([^)]*)\)/.exec(err)?.[1] ?? err).split(', ').sort();
    };
    const lone = await twinsOne('Sample,Taxon,Count\nX04,Calanus finmarchicus,5\n');
    const joined = await refusal(e, body({ sampleJoin: [confirmed({ resultsOnly: 1 })] }));
    expect(joined.length).toBeGreaterThan(0);
    expect(joined).toEqual(await refusal(lone.e, lone.body));
  });

  async function twinsOne(csv: string) {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('results.csv', csv)]);
    const f = p.files[0];
    const body: ConvertRequestBody = { sheets: [{ fileId: f.fileId, sheet: 'results.csv', mapping: f.mappings[0], shape: 'long', quantity: { kind: 'count' } }], options: {}, approvedSplits: {} };
    return { e, body };
  }

  it('previewKey finds the results sheet through the merge, whatever its place in the request', async () => {
    const { e, body } = await twins(RESULTS_CSV, SAMPLES_CSV, true);
    const b = body({ sampleJoin: [confirmed()] });
    const r = await e.previewKey(b, 'c1', 'results.csv', [0]);
    expect(r).not.toBeNull();
    expect(r?.sheet).toBe('results.csv');
    // the description sheet was merged away: it has no preview of its own
    expect(await e.previewKey(b, 'c2', 'samples.csv', [0])).toBeNull();
  });

  it('a group of differing values is on the view, open or answered, with the results sheet it belongs to; the entries are capped at 500 and count is the true number of samples', async () => {
    const n = 520;
    const rows = Array.from({ length: n }, (_, i) => `S${i},2021-05-04,Calanus finmarchicus,1`).join('\n');
    const des = Array.from({ length: n }, (_, i) => `S${i},ST-1,2021-05-03`).join('\n');
    const { e, body } = await twins(`Sample,Date,Taxon,Count\n${rows}\n`, `Sample,Station,Date\n${des}\n`);
    const v = await e.convert(body({ sampleJoin: [confirmed()] }));
    expect(v.sampleJoin.conflicts).toHaveLength(1);
    const g = v.sampleJoin.conflicts[0];
    expect(g.results).toEqual(R);
    expect(g.count).toBe(n);
    expect(g.entries).toHaveLength(500);
    expect(ids(v, 'CONV-JOIN-CONFLICT')).toBe(1);
    expect(v.ok).toBe(false);
    const answered = await e.convert(body({ sampleJoin: [confirmed({ conflicts: [{ group: g.group, take: 'description', count: n, exceptions: [] }] })] }));
    // the group stays on the view (the page shows what it answered); the blocking finding is gone and the view never carries the answer back
    expect(answered.sampleJoin.conflicts.map((c) => c.group)).toEqual([g.group]);
    expect('answer' in answered.sampleJoin.conflicts[0]).toBe(false);
    expect(ids(answered, 'CONV-JOIN-CONFLICT')).toBe(0);
  });

  it('decisionsOf writes nothing of the join to the archive description', async () => {
    const { e, body } = await twins();
    const v = await e.convert(body({ sampleJoin: [confirmed()] }));
    expect(JSON.stringify(v)).not.toContain('sampleJoin=');
  });
});

describe('the day/month order of the request (round 3, Task 8)', () => {
  const CSV = 'Sample,Date,Latitude,Longitude,Calanus finmarchicus\nk1,5/4/2023,55,3,4\nk2,6/7/2023,56,3,5\n';
  async function run(extra: Record<string, unknown>) {
    const e = createDirectConvertEngine();
    const p = await e.parse([file('hauls.csv', CSV)]);
    const f = p.files[0];
    const date = f.mappings[0].columns.find((c) => c.header === 'Date')!.index;
    const sheet = { fileId: f.fileId, sheet: 'hauls.csv', mapping: f.mappings[0], shape: 'wide' as const, quantity: { kind: 'count' as const }, ...extra };
    const v = await e.convert({ sheets: [sheet as ConvertRequestBody['sheets'][number]], options: {}, approvedSplits: {} });
    return { date, v, rule: (id: string) => v.findings.filter((x) => x.ruleId === id) };
  }

  it('without an order the column is asked about', async () => {
    const { rule, date } = await run({});
    expect(rule('CONV-DATE-ORDER-UNDECLARED')[0]?.params.index).toBe(date);
    expect(rule('CONV-DATE-ORDER-DECLARED')).toHaveLength(0);
  });

  it('a whole-number key within the sheet and a dmy / mdy value is used; fromFile is said', async () => {
    const probe = await run({});
    const { rule } = await run({ dayMonthOrder: { [probe.date]: 'dmy' }, dayMonthOrderFromFile: [probe.date] });
    expect(rule('CONV-DATE-ORDER-UNDECLARED')).toHaveLength(0);
    expect(rule('CONV-DATE-ORDER-DECLARED')[0]?.params).toMatchObject({ order: 'dmy', fromFile: 'yes' });
    const own = await run({ dayMonthOrder: { [probe.date]: 'mdy' } });
    expect(own.rule('CONV-DATE-ORDER-DECLARED')[0]?.params.fromFile).toBeUndefined();
  });

  it('a key "x" or 99, a value that is no order, and a fromFile index without a kept order are dropped', async () => {
    const probe = await run({});
    for (const extra of [
      { dayMonthOrder: { x: 'dmy', 99: 'dmy', [probe.date]: 'sideways' } },
      { dayMonthOrder: { '1.5': 'dmy', '-1': 'mdy' } },
      { dayMonthOrderFromFile: [probe.date] },
      { dayMonthOrder: { 99: 'dmy' }, dayMonthOrderFromFile: [probe.date, 99] },
    ]) {
      const { rule } = await run(extra);
      expect(rule('CONV-DATE-ORDER-UNDECLARED')).toHaveLength(1);
      expect(rule('CONV-DATE-ORDER-DECLARED')).toHaveLength(0);
    }
  });
});

describe('turnChoice: the samples are the columns', () => {
  const TAXA_HEADER = ['Taxon', 'S1', 'S2', 'Total'];
  const TAXA = csvOf(TAXA_HEADER, [['Calanus finmarchicus', 4, 0, 4], ['Oithona similis', 1, 2, 3]]);
  const open = async () => {
    const e = createDirectConvertEngine();
    const r = await e.parse([file('Taxa.csv', TAXA)]);
    return { e, f: r.files[0] };
  };

  it('turns the sheet before the roles are proposed: the samples become the rows, the taxa the headers, and the source sheet is not sent', async () => {
    const { e, f } = await open();
    const sheet = f.sheets[0].name;
    expect(f.turned).toBeUndefined();
    const t = await e.turnChoice(f.fileId, sheet, { nameColumn: 0, notSamples: [3] });
    expect(t.sheets[0].header).toEqual(['Sample', 'Calanus finmarchicus', 'Oithona similis']);
    expect(t.sheets[0].rowCount).toBe(2);
    expect(t.turned).toEqual({ [sheet]: { nameColumn: 0, notSamples: [3] } });
    expect(t.turnSource).toEqual({ [sheet]: { header: TAXA_HEADER, rows: 2 } });
    expect(t.proposals[sheet].find((p) => p.header === 'Sample')?.role.kind).toBe('sampleId');
    expect(t.mappings[0].columns.find((c) => c.header === 'Calanus finmarchicus')?.role).toEqual({ kind: 'taxon', header: true });
    // F13: the sheet the person dropped is in the worker only; the summary does not carry it twice
    const text = JSON.stringify(t);
    expect(text).not.toContain('"source"');
    // the source header is there once (turnSource), not once more in the sheets, the mappings or the samples
    expect(text.match(/"Total"/g)).toHaveLength(1);
    expect(Object.keys(t.turned?.[sheet] ?? {}).sort()).toEqual(['nameColumn', 'notSamples']);
  });

  it('turn null takes the declaration back: the original columns again', async () => {
    const { e, f } = await open();
    const sheet = f.sheets[0].name;
    await e.turnChoice(f.fileId, sheet, { nameColumn: 0, notSamples: [3] });
    const back = await e.turnChoice(f.fileId, sheet, null);
    expect(back.sheets[0].header).toEqual(TAXA_HEADER);
    expect(back.turned).toBeUndefined();
    expect(back.turnSource).toBeUndefined();
  });

  it('an index outside the sheet, a fraction or a name column that is also not a sample is ignored: the summary is unchanged', async () => {
    const { e, f } = await open();
    const sheet = f.sheets[0].name;
    const before = JSON.stringify(await e.turnChoice(f.fileId, sheet, null));
    for (const bad of [{ nameColumn: 9, notSamples: [] }, { nameColumn: 0, notSamples: [9] }, { nameColumn: 0.5, notSamples: [] }, { nameColumn: 0, notSamples: [0] }, { nameColumn: -1, notSamples: [] }]) {
      expect(JSON.stringify(await e.turnChoice(f.fileId, sheet, bad))).toBe(before);
    }
  });

  it('a long environmental sheet read through its pivot is never turned', async () => {
    const e = createDirectConvertEngine();
    const long = csvOf(['Station', 'Bottle', 'Date', 'Latitude', 'Longitude', 'Depth_m', 'Parameter', 'Unit', 'Value'], [
      ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Temperature', 'degC', 4.1],
      ['ZL1', 'B1', '2020-05-01', 70.1, 20.2, 5, 'Salinity', 'PSU', 33.1],
      ['ZL1', 'B2', '2020-05-01', 70.1, 20.2, 10, 'Temperature', 'degC', 3.9],
      ['ZL1', 'B2', '2020-05-01', 70.1, 20.2, 10, 'Salinity', 'PSU', 33.4],
    ]);
    const f = (await e.parse([file('piv.csv', long)])).files[0];
    expect(f.pivots).toBeDefined();
    const before = JSON.stringify(f);
    const t = await e.turnChoice(f.fileId, f.sheets[0].name, { nameColumn: 0, notSamples: [] });
    expect(JSON.stringify(t)).toBe(before);
  });

  it('a companion file turns a sheet of the same shape and says so (fromFile); other rows, or a column that is not found, turn nothing', async () => {
    const hashes = (cols: number[]) => keyHashes(TAXA_HEADER, cols) as string;
    const sidecar = (rows: number, name = hashes([0])) => writeConvertSidecar({ turned: [{ sheet: 'Taxa.csv', nameHash: name, notSampleHashes: hashes([3]), rows, headerDates: true }] });
    const e = createDirectConvertEngine();
    const same = (await e.parse([file('Taxa.csv', TAXA), file('run.sidecar.csv', sidecar(2))])).files[0];
    expect(same.sheets[0].header).toEqual(['Sample', 'Date', 'Calanus finmarchicus', 'Oithona similis']);
    expect(same.turned).toEqual({ 'Taxa.csv': { nameColumn: 0, notSamples: [3], headerDates: true, fromFile: true } });
    // a third taxon row: the answer was given for another sheet
    const more = csvOf(TAXA_HEADER, [['Calanus finmarchicus', 4, 0, 4], ['Oithona similis', 1, 2, 3], ['Pseudocalanus sp.', 3, 0, 3]]);
    expect((await e.parse([file('Taxa.csv', more), file('run.sidecar.csv', sidecar(2))])).files[0].sheets[0].header).toEqual(TAXA_HEADER);
    // the name column is no longer found
    expect((await e.parse([file('Taxa.csv', TAXA), file('run.sidecar.csv', sidecar(2, keyHashes(['Other'], [0]) as string))])).files[0].sheets[0].header).toEqual(TAXA_HEADER);
    // the person changes it: it is theirs now, not the file's
    const f = same;
    const changed = await e.turnChoice(f.fileId, 'Taxa.csv', { nameColumn: 0, notSamples: [] });
    expect(changed.turned?.['Taxa.csv']).toEqual({ nameColumn: 0, notSamples: [] });
  });

  it('a turned description sheet is shown for a join and never joinable: the proposal says it was turned', async () => {
    const e = createDirectConvertEngine();
    const env = csvOf(['Variable', 'X01', 'X02', 'X03'], [['Station', 'ST-1', 'ST-2', 'ST-3'], ['Date', '2021-05-03', '2021-05-04', '2021-05-05'], ['Latitude', 61.1, 61.3, 61.5], ['Longitude', 4.2, 4.6, 4.9]]);
    const p = await e.parse([file('results.csv', RESULTS_CSV), file('env.csv', env)]);
    const [rf, ef] = p.files;
    const t = await e.turnChoice(ef.fileId, 'env.csv', { nameColumn: 0, notSamples: [] });
    expect(t.sheets[0].header).toEqual(['Sample', 'Station', 'Date', 'Latitude', 'Longitude']);
    const v = await e.convert({
      sheets: [
        { fileId: rf.fileId, sheet: 'results.csv', mapping: rf.mappings[0], shape: 'long', quantity: { kind: 'count' } },
        { fileId: t.fileId, sheet: 'env.csv', mapping: t.mappings[0], shape: 'wide' },
      ],
      options: {},
      approvedSplits: {},
    });
    expect(v.sampleJoin.proposals.map((x) => ({ long: x.long, turned: x.turned }))).toEqual([{ long: true, turned: true }]);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The convert worker: its handler (parse, convert, proposeCodes), the page-side client over a fake worker, and that /check's worker files are the
// ones of production.
import { describe, expect, it } from 'vitest';
import { createConvertWorkerClient, type ConvertWorkerLike } from '../../src/worker/convert.client';
import { createConvertHandler, createDirectConvertEngine } from '../../src/worker/convert.handler';
import type { ConvertRequestBody, ConvertWireRequest } from '../../src/worker/convert.protocol';
import type { InputFile } from '../../src/worker/protocol';
import { COLLISION_CSV, L1_CSV, NO_CODE_CSV, SIDECAR_CSV, W1_CSV } from './convertHelpers';

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
    expect(r.settings).toEqual({ fullList: true, prefixStation: true });
    expect(r.files.map((f) => f.fileName)).toEqual(['w1.csv']);
    expect((await e.parse([file('w1.csv', W1_CSV)])).settings).toEqual({ fullList: false, prefixStation: false });
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

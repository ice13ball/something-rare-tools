// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDirectEngine } from '../../src/worker/handler';
import { createWorkerClient, type WorkerLike } from '../../src/worker/client';
import { createHandler } from '../../src/worker/handler';
import { MAX_SAMPLES, type InputFile, type WireRequest } from '../../src/worker/protocol';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', name)));
const dropped = (name: string, bytes: Uint8Array = fixture(name)): InputFile => ({ name, bytes, source: 'dropped' });
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('worker handler', () => {
  it('parses a wide CSV into an id, a light summary, a layout, proposals and at most 5 samples per column', async () => {
    const e = createDirectEngine();
    const r = await e.parse([dropped('layout-wide.csv')], [], []);
    expect(r.problems).toEqual([]);
    expect(r.files).toHaveLength(1);
    const f = r.files[0];
    expect(f.fileId).toBeTruthy();
    expect(f.fileName).toBe('layout-wide.csv');
    expect(f.sheets[0].header).toContain('Station_ID');
    expect(f.layout.unsupported).toBeUndefined();
    expect(f.layout.tables).toHaveLength(1);
    const sheet = f.sheets[0].name;
    expect(f.proposals[sheet].some((p) => p.role.kind === 'latitude')).toBe(true);
    expect(f.mappings[0].sheet).toBe(sheet);
    for (const col of f.samples[sheet]) expect(col.length).toBeLessThanOrEqual(MAX_SAMPLES);
    // the summary carries no rows
    expect(JSON.stringify(f).length).toBeLessThan(20000);
  });

  it('keeps only 5 samples for a 70k-row file', async () => {
    const lines = ['Station,Lat,Lon,Date,DIC_umol_kg'];
    for (let i = 0; i < 70000; i++) lines.push(`ST${i % 50},76.5,15.1,2021-07-25,${2100 + (i % 7)}`);
    const e = createDirectEngine();
    const r = await e.parse([dropped('big.csv', enc(lines.join('\n')))], [], []);
    const f = r.files[0];
    expect(f.sheets[0].rowCount).toBe(70000);
    for (const col of f.samples[f.sheets[0].name]) expect(col.length).toBe(MAX_SAMPLES);
  });

  it('reports an unreadable file as a problem instead of throwing', async () => {
    const e = createDirectEngine();
    const r = await e.parse([dropped('bad.json', enc('{"nothing": 1}'))], [], []);
    expect(r.files).toEqual([]);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].fileName).toBe('bad.json');
    expect(r.problems[0].message).toMatch(/JSON/);
  });

  it('lists a PDF as not read', async () => {
    const e = createDirectEngine();
    const r = await e.parse([dropped('paper.pdf', enc('%PDF-1.4 fake'))], [], []);
    expect(r.notRead).toEqual([{ fileName: 'paper.pdf', kind: 'pdf' }]);
    expect(r.files).toEqual([]);
  });

  it('builds, checks and exports: clean CSV, sidecar, GeoJSON, draft, ISO and DataCite', async () => {
    const e = createDirectEngine();
    const { files } = await e.parse([dropped('layout-wide.csv')], [], []);
    const f = files[0];
    const built = await e.build(f.fileId, f.layout, f.mappings);
    expect(built.datasets).toHaveLength(1);
    const ds = built.datasets[0];
    expect(ds.rowCount).toBeGreaterThan(0);
    expect(ds.pointCount).toBe(ds.rowCount);
    const { report, datasets } = await e.check();
    expect(datasets[0].id).toBe(ds.id);
    expect(report.counts.error + report.counts.warning + report.counts.info).toBe(report.findings.length);
    // the fixture has an NA variant and a non-numeric cell: they must reach the report
    expect(report.findings.some((x) => x.ruleId === 'ROW-NA-VARIANT' || x.ruleId === 'ROW-NON-NUMERIC')).toBe(true);

    const csv = await e.export('cleanCsv', [ds.id]);
    expect(csv.split('\n')[0]).toMatch(/station/i);
    expect(await e.export('sidecar', [ds.id])).toContain('original_column');
    const geo = JSON.parse(await e.export('geojson', [ds.id]));
    expect(geo.features.length).toBe(ds.pointCount);
    expect(['error', 'warning', 'info', 'none']).toContain(geo.features[0].properties.worstSeverity);
    const draft = await e.draft([ds.id]);
    expect(draft.bbox).toBeTruthy();
    expect(await e.export('iso19139', [ds.id])).toContain('MD_Metadata');
    expect(await e.export('datacite', [ds.id])).toContain('<resource');
  });

  it('returns the values of a row by file and line', async () => {
    const e = createDirectEngine();
    const { files } = await e.parse([dropped('layout-wide.csv')], [], []);
    await e.build(files[0].fileId, files[0].layout, files[0].mappings);
    await e.check();
    const row = await e.row('layout-wide.csv', 2);
    expect(row?.station).toBe('ST1');
    expect(row?.values.some((v) => v.name.includes('DIC') && v.raw === '2110.5')).toBe(true);
    expect(await e.row('layout-wide.csv', 9999)).toBeNull();
    expect(await e.row('other.csv', 2)).toBeNull();
  });

  it('attaches dropped metadata files to dropped data files, so a licence in the metadata is seen', async () => {
    const e = createDirectEngine();
    const meta = fixture('iso-clean-anchor.xml');
    const r = await e.parse([dropped('layout-wide.csv'), dropped('iso-clean-anchor.xml', meta)], [], []);
    expect(r.metadataFiles).toEqual(['iso-clean-anchor.xml']);
    expect(r.files).toHaveLength(1);
    await e.build(r.files[0].fileId, r.files[0].layout, r.files[0].mappings);
    const { report } = await e.check();
    // a dropped record exists, so the licence rules ran on it (no LIC-MISSING for a clean anchor)
    expect(report.findings.some((x) => x.ruleId === 'LIC-MISSING')).toBe(false);
  });

  it('includes findings the page collected while loading (fetch problems) in the report', async () => {
    const e = createDirectEngine();
    await e.parse([], [], [{ ruleId: 'IN-FETCH-BLOCKED', severity: 'warning', file: 'x.csv', params: { host: 'opendap.iopan.pl' } }]);
    const { report } = await e.check();
    expect(report.findings.map((f) => f.ruleId)).toContain('IN-FETCH-BLOCKED');
  });

  it('proposes again for a changed layout', async () => {
    const e = createDirectEngine();
    const { files } = await e.parse([dropped('layout-long.csv')], [], []);
    const f = files[0];
    expect(f.layout.tables[0].long).toBeTruthy();
    const p = await e.propose(f.fileId, f.layout);
    expect(p.mappings[0].sheet).toBe(f.layout.tables[0].sheet);
  });

  it('rejects unknown file ids with a plain error', () => {
    const h = createHandler();
    expect(() => h.handle({ type: 'build', fileId: 'nope', layout: { tables: [], joins: [] }, mappings: [] })).toThrow(/unknown file/i);
  });
});

/** A WorkerLike that runs the handler on a microtask, like postMessage does asynchronously. */
function fakeWorker(handler = createHandler(), silent = false): WorkerLike & { sent: WireRequest[]; crash(msg: string): void } {
  const w: WorkerLike & { sent: WireRequest[]; crash(msg: string): void } = {
    sent: [],
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(msg: WireRequest) {
      w.sent.push(msg);
      if (silent) return;
      queueMicrotask(() => {
        try {
          w.onmessage?.({ data: { id: msg.id, ok: true, result: handler.handle(msg.req) } } as MessageEvent);
        } catch (err) {
          w.onmessage?.({ data: { id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } } as MessageEvent);
        }
      });
    },
    terminate() {},
    crash(message: string) {
      w.onerror?.({ message, preventDefault() {} } as unknown as ErrorEvent);
    },
  };
  return w;
}

describe('worker client', () => {
  it('creates the worker lazily on the first request and correlates responses by id', async () => {
    let created = 0;
    const client = createWorkerClient(() => {
      created++;
      return fakeWorker();
    });
    expect(created).toBe(0);
    const [a, b] = await Promise.all([client.parse([dropped('layout-wide.csv')], [], []), client.parse([], [], [])]);
    expect(created).toBe(1);
    expect(a.files).toHaveLength(1);
    expect(b.files).toHaveLength(0);
  });

  it('transfers the file bytes (buffers listed as transferable)', async () => {
    const posted: { msg: unknown; transfer?: Transferable[] }[] = [];
    const w = fakeWorker();
    const orig = w.postMessage.bind(w);
    w.postMessage = (msg: WireRequest, transfer?: Transferable[]) => {
      posted.push({ msg, transfer });
      orig(msg);
    };
    const client = createWorkerClient(() => w);
    const bytes = enc('a,b\n1,2\n');
    await client.parse([dropped('t.csv', bytes)], [], []);
    expect(posted[0].transfer?.length).toBe(1);
  });

  it('turns an error inside the handler into a rejected promise with a plain message', async () => {
    const client = createWorkerClient(() => fakeWorker());
    await expect(client.build('nope', { tables: [], joins: [] }, [])).rejects.toThrow(/unknown file/i);
  });

  it('rejects every pending request when the worker itself crashes', async () => {
    const w = fakeWorker(createHandler(), true);
    const client = createWorkerClient(() => w);
    const p = client.check();
    await Promise.resolve();
    w.crash('Script error');
    await expect(p).rejects.toThrow(/worker/i);
  });

  it('rejects with a plain message when the worker cannot be created', async () => {
    const client = createWorkerClient(() => {
      throw new Error('no workers here');
    });
    await expect(client.check()).rejects.toThrow(/worker/i);
  });
});

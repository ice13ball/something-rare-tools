// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * The serialiser of the capture-and-replay gate (docs/superpowers/specs/2026-11-19-convert-restructuring-design.md section 2): a JSON form of any value a ConvertInput
 * or ConvertResult holds, deterministic and lossless enough to run convert() again on it.
 *
 * Rules (the failure modes this exists to avoid):
 *   - ORDER IS DATA. Arrays are written in order and never sorted. A Map, a Set and an object keep their insertion order (Map and Set iteration order is insertion order in JS and
 *     is behaviour wherever the code iterates them), so a change that only reorders them shows as a difference. Nothing is sorted by key.
 *   - What JSON would lose is tagged, not dropped: undefined (a key set to undefined is not an absent key), NaN, Infinity, -0, bigint, Date, RegExp, typed arrays, Map, Set,
 *     sparse array holes, functions and Errors. An object that has a key starting with "$" is written as an entry list, so no input can imitate a tag.
 *   - Identity is data: an object reachable twice (a ParsedFile shared by two sheets, an occurrence held by a Map) is written once with an id and referred to by that id after,
 *     because the converter keys Maps by object identity (design 3.5). `identity: false` writes every reference in full, to tell an identity-only difference from a value one.
 *   - No clock, no randomness: nothing here reads either.
 */

export type Enc = null | boolean | number | string | Enc[] | { [k: string]: Enc };

export interface EncodeOptions {
  /** Write shared objects as $id / $ref (default true). */
  identity?: boolean;
}

/** Counters the coverage report and the checks of the recorder read. */
export interface EncodeNotes {
  functions: number;
  classInstances: string[];
  symbolKeys: number;
}

const isObjectLike = (v: unknown): v is object => typeof v === 'object' && v !== null;

/** Objects that are reached more than once, found in the traversal order the encoder uses. */
function sharedObjects(root: unknown): Set<object> {
  const seen = new Set<object>();
  const shared = new Set<object>();
  const walk = (v: unknown): void => {
    if (!isObjectLike(v)) return;
    if (seen.has(v)) {
      shared.add(v);
      return;
    }
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) if (i in v) walk(v[i]);
    } else if (v instanceof Map) {
      for (const [k, x] of v) {
        walk(k);
        walk(x);
      }
    } else if (v instanceof Set) {
      for (const x of v) walk(x);
    } else if (ArrayBuffer.isView(v) || v instanceof Date || v instanceof RegExp) {
      // leaves
    } else if (v instanceof Error) {
      // leaves
    } else {
      for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k]);
    }
  };
  walk(root);
  return shared;
}

export function encode(root: unknown, opts: EncodeOptions = {}, notes?: EncodeNotes): Enc {
  const identity = opts.identity !== false;
  const shared = identity ? sharedObjects(root) : new Set<object>();
  const ids = new Map<object, number>();
  let nextId = 0;
  const onPath = new Set<object>();

  const enc = (v: unknown): Enc => {
    if (v === null) return null;
    switch (typeof v) {
      case 'boolean':
      case 'string':
        return v;
      case 'number':
        if (Number.isNaN(v)) return { $n: 'NaN' };
        if (v === Infinity) return { $n: 'Infinity' };
        if (v === -Infinity) return { $n: '-Infinity' };
        if (Object.is(v, -0)) return { $n: '-0' };
        return v;
      case 'undefined':
        return { $u: 1 };
      case 'bigint':
        return { $big: v.toString() };
      case 'function':
        if (notes) notes.functions++;
        return { $fn: v.name };
      case 'symbol':
        return { $sym: v.toString() };
    }
    const o = v as object;
    if (identity && ids.has(o)) return { $ref: ids.get(o) as number };
    if (!identity && onPath.has(o)) throw new Error('encode: a cycle needs identity: true');
    let id: number | undefined;
    if (shared.has(o)) {
      id = nextId++;
      ids.set(o, id);
    }
    onPath.add(o);
    const body = encBody(o);
    onPath.delete(o);
    return id === undefined ? body : { $id: id, v: body };
  };

  const encBody = (o: object): Enc => {
    if (Array.isArray(o)) {
      const out: Enc[] = [];
      for (let i = 0; i < o.length; i++) out.push(i in o ? enc(o[i]) : { $hole: 1 });
      return out;
    }
    if (o instanceof Map) return { $map: [...o].map(([k, x]) => [enc(k), enc(x)] as Enc) };
    if (o instanceof Set) return { $set: [...o].map((x) => enc(x)) };
    if (o instanceof Date) return { $date: Number.isNaN(o.getTime()) ? 'invalid' : o.toISOString() };
    if (o instanceof RegExp) return { $re: o.source, flags: o.flags };
    if (o instanceof Error) return { $err: o.name, message: o.message };
    if (ArrayBuffer.isView(o)) {
      const bytes = Buffer.from(o.buffer, o.byteOffset, o.byteLength);
      return { $bytes: o.constructor.name, b64: bytes.toString('base64') };
    }
    const proto = Object.getPrototypeOf(o);
    const plain = proto === Object.prototype || proto === null;
    if (!plain && notes) notes.classInstances.push(o.constructor?.name ?? '?');
    if (notes) notes.symbolKeys += Object.getOwnPropertySymbols(o).length;
    const keys = Object.keys(o);
    const rec = o as Record<string, unknown>;
    if (keys.some((k) => k.startsWith('$'))) return { $obj: keys.map((k) => [k, enc(rec[k])] as Enc) };
    const out: { [k: string]: Enc } = {};
    for (const k of keys) out[k] = enc(rec[k]);
    return out;
  };

  return enc(root);
}

/** The inverse, for replay: the value an input was. A function comes back as a stub that throws when called; a class instance comes back as a plain object (the recorder reports both). */
export function decode(root: Enc): unknown {
  const table = new Map<number, unknown>();

  const dec = (x: Enc, id?: number): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) {
      const out: unknown[] = [];
      if (id !== undefined) table.set(id, out);
      x.forEach((e, i) => {
        if (isTag(e, '$hole')) out.length = i + 1;
        else out[i] = dec(e);
      });
      return out;
    }
    const o = x as { [k: string]: Enc };
    if ('$id' in o && 'v' in o && Object.keys(o).length === 2) return dec(o.v, o.$id as number);
    if ('$ref' in o) {
      if (!table.has(o.$ref as number)) throw new Error(`decode: reference ${String(o.$ref)} before its definition`);
      return table.get(o.$ref as number);
    }
    if ('$n' in o) return { NaN, Infinity, '-Infinity': -Infinity, '-0': -0 }[o.$n as string];
    if ('$u' in o) return undefined;
    if ('$big' in o) return BigInt(o.$big as string);
    if ('$sym' in o) return Symbol(o.$sym as string);
    if ('$fn' in o) {
      const name = o.$fn as string;
      const stub = (): never => {
        throw new Error(`replay: the recorded input held a function (${name}); it cannot be replayed`);
      };
      if (id !== undefined) table.set(id, stub);
      return stub;
    }
    if ('$date' in o) return withId(new Date(o.$date === 'invalid' ? NaN : (o.$date as string)), id);
    if ('$re' in o) return withId(new RegExp(o.$re as string, o.flags as string), id);
    if ('$err' in o) return withId(Object.assign(new Error(o.message as string), { name: o.$err as string }), id);
    if ('$bytes' in o) {
      const buf = Buffer.from(o.b64 as string, 'base64');
      const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const kind = o.$bytes as string;
      const ctor = (globalThis as unknown as Record<string, new (b: ArrayBuffer) => ArrayBufferView>)[kind];
      return withId(ctor ? new ctor(copy) : new Uint8Array(copy), id);
    }
    if ('$map' in o) {
      const m = new Map<unknown, unknown>();
      if (id !== undefined) table.set(id, m);
      for (const pair of o.$map as Enc[][]) m.set(dec(pair[0]), dec(pair[1]));
      return m;
    }
    if ('$set' in o) {
      const s = new Set<unknown>();
      if (id !== undefined) table.set(id, s);
      for (const e of o.$set as Enc[]) s.add(dec(e));
      return s;
    }
    const out: Record<string, unknown> = {};
    if (id !== undefined) table.set(id, out);
    if ('$obj' in o) {
      for (const pair of o.$obj as Enc[][]) out[pair[0] as string] = dec(pair[1]);
    } else {
      for (const k of Object.keys(o)) out[k] = dec(o[k]);
    }
    return out;
  };

  const withId = <T>(v: T, id: number | undefined): T => {
    if (id !== undefined) table.set(id, v);
    return v;
  };
  const isTag = (e: Enc, tag: string): boolean => e !== null && typeof e === 'object' && !Array.isArray(e) && tag in e;

  return dec(root);
}

/** Identity-free form of an encoded value: decode and encode again without ids. */
export const withoutIdentity = (e: Enc): Enc => encode(decode(e), { identity: false });

export interface Difference {
  /** `result.findings[3].ruleId`-style path to the first differing field. */
  path: string;
  recorded: string;
  now: string;
}

const show = (e: Enc | undefined): string => {
  const s = e === undefined ? '(absent)' : JSON.stringify(e);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

/** The first difference of two encoded values, walking arrays by index and objects by the recorded key order; undefined when equal. */
export function firstDifference(a: Enc | undefined, b: Enc | undefined, path = ''): Difference | undefined {
  if (a === b) return undefined;
  const here = path === '' ? '(root)' : path;
  if (a === undefined || b === undefined || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { path: here, recorded: show(a), now: show(b) };
  }
  if (Array.isArray(a) !== Array.isArray(b)) return { path: here, recorded: show(a), now: show(b) };
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const d = firstDifference(a[i], b[i], `${path}[${i}]`);
        if (d) return d;
      }
      return { path: `${here}.length`, recorded: String(a.length), now: String(b.length) };
    }
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return undefined;
  }
  const ao = a as { [k: string]: Enc };
  const bo = b as { [k: string]: Enc };
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  for (const k of ak) {
    if (!(k in bo)) return { path: `${path}.${k}`, recorded: show(ao[k]), now: '(absent)' };
    const d = firstDifference(ao[k], bo[k], `${path}.${k}`);
    if (d) return d;
  }
  for (const k of bk) if (!(k in ao)) return { path: `${path}.${k}`, recorded: '(absent)', now: show(bo[k]) };
  // same keys and values; a different key ORDER is a difference too (insertion order is behaviour)
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return { path: `${here} (key order)`, recorded: ak.slice(0, 8).join(','), now: bk.slice(0, 8).join(',') };
  }
  return undefined;
}

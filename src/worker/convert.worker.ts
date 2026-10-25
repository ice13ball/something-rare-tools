// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Worker entry of /convert: reading files and converting run here, so the page never freezes. Moves messages only. No network, no storage.
import { handle } from './convert.handler';
import type { ConvertWireRequest } from './convert.protocol';
import type { WireResponse } from './protocol';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<ConvertWireRequest>) => void) | null; postMessage(msg: WireResponse): void };

const fail = (id: number, err: unknown): void => ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });

ctx.onmessage = (e: MessageEvent<ConvertWireRequest>) => {
  const { id, req } = e.data;
  try {
    Promise.resolve(handle(req)).then((result) => ctx.postMessage({ id, ok: true, result }), (err: unknown) => fail(id, err));
  } catch (err) {
    fail(id, err);
  }
};

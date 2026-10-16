// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Worker entry: parse, build and check run here so the page never freezes on a big file. Moves messages only.
import { handle } from './handler';
import type { WireRequest, WireResponse } from './protocol';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<WireRequest>) => void) | null; postMessage(msg: WireResponse): void };

ctx.onmessage = (e: MessageEvent<WireRequest>) => {
  const { id, req } = e.data;
  try {
    ctx.postMessage({ id, ok: true, result: handle(req) });
  } catch (err) {
    // A plain message, never a stack: the page shows it as text.
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

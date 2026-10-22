// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Messages between the page and the collection worker (separate from the check worker). Plain structured-clonable data only.
import type { Estimate, Progress, RunSettings, Sample, SourceSpec, UnreadSample } from '../core/collection/types';

export interface FileHandleLike {
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
}

/** request type -> { request fields, result } */
export interface CollectionProtocol {
  estimate: { req: { spec: SourceSpec; sample: boolean }; res: Estimate };
  start: { req: { settings: RunSettings }; res: null };
  resume: { req: Record<never, never>; res: null };
  pause: { req: Record<never, never>; res: null };
  stop: { req: Record<never, never>; res: null };
  discard: { req: Record<never, never>; res: null };
  saved: { req: Record<never, never>; res: Progress | null };
  progress: { req: Record<never, never>; res: Progress };
  samples: { req: { ruleId: string; offset: number; limit: number }; res: Sample[] };
  unread: { req: Record<never, never>; res: UnreadSample[] };
  download: { req: Record<never, never>; res: { blob: Blob; fileName: string } };
  saveTo: { req: { handle: FileHandleLike }; res: null };
}

export type CollectionRequestType = keyof CollectionProtocol;
export type CollectionRequest = { [K in CollectionRequestType]: { type: K } & CollectionProtocol[K]['req'] }[CollectionRequestType];
export type CollectionResultOf<K extends CollectionRequestType> = CollectionProtocol[K]['res'];

export interface CollectionWireRequest {
  id: number;
  req: CollectionRequest;
}
/** Answers carry the id of their request; `event` messages are pushed by the worker while a run goes on. */
export type CollectionWireResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { event: 'progress'; progress: Progress };

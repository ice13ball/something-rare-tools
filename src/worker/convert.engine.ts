// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { ConvertEngine, ConvertRequest, ConvertRequestType, ConvertResultOf } from './convert.protocol';

/** The typed ConvertEngine over any transport that can send one request and resolve its result. */
export function makeConvertEngine(send: <K extends ConvertRequestType>(req: Extract<ConvertRequest, { type: K }>) => Promise<ConvertResultOf<K>>): ConvertEngine {
  return {
    reset: () => send({ type: 'reset' }).then(() => undefined),
    parse: (files) => send({ type: 'parse', files }),
    convert: (body) => send({ type: 'convert', body }),
    proposeCodes: (fileId, sheet, mapping) => send({ type: 'proposeCodes', fileId, sheet, mapping }),
    export: (body) => send({ type: 'export', export: body }),
  };
}

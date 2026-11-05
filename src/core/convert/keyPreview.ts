// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { convert } from './build';
import type { ConvertInput, ConvertSheetInput } from './build';
import type { SheetKeyReport } from './sampleKey';

/**
 * What a picked sample key makes of one sheet: how many samples and how many rows in each. This is not a second reading of the key: it runs the converter and reports what the converter made
 * (ConvertResult.keys), so the preview of the page and the export cannot count differently (rows the export leaves out - summary rows, rows with no key - are left out here too).
 * `others` are the other sheets of the same request, so that the numbers are those of the real run; the key of THIS sheet is the one of `input`. undefined when the sheet carries no key.
 */
export function previewSampleKey(input: ConvertSheetInput, others: Partial<ConvertInput> = {}): SheetKeyReport | undefined {
  if (input.sampleKey === undefined) return undefined;
  const r = convert({ options: {}, ...others, sheets: [...(others.sheets ?? []), input] });
  return r.keys?.find((k) => k.sheet === input.sheet && k.file === input.file.fileName);
}

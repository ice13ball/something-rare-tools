// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { convert } from './build';
import type { ConvertInput, ConvertSheetInput } from './build';
import type { SheetKeyReport } from './sampleKey';

/**
 * What a picked sample key makes of one sheet: how many samples and how many rows in each. This is not a second reading of the key: it runs the converter and reports what the converter made
 * (ConvertResult.keys), so the preview of the page and the export cannot count differently (rows the export leaves out - summary rows, rows with no key - are left out here too).
 * `others.sheets` are the sheets of the whole request IN THEIR ORDER; the sheet of `input` (same parsed file object and sheet name, so two dropped files of the same name are not mixed up) is replaced there by `input`, so the run is the export's run with this key
 * in place; when it is not among them it is added last. undefined when the sheet carries no key.
 */
export function previewSampleKey(input: ConvertSheetInput, others: Partial<ConvertInput> = {}): SheetKeyReport | undefined {
  if (input.sampleKey === undefined) return undefined;
  const same = (s: ConvertSheetInput): boolean => s.sheet === input.sheet && s.file === input.file;
  const given = others.sheets ?? [];
  const sheets = given.some(same) ? given.map((s) => (same(s) ? input : s)) : [...given, input];
  const r = convert({ options: {}, ...others, sheets });
  // a report carries the file NAME only: among the reports of that name and sheet (in the order of the sheets) it is the one of the sheet's own place
  const mine = sheets.filter((s) => s.sampleKey !== undefined && s.sheet === input.sheet && s.file.fileName === input.file.fileName);
  const at = mine.findIndex((s) => s === input || same(s));
  return r.keys?.filter((k) => k.sheet === input.sheet && k.file === input.file.fileName)[Math.max(0, at)];
}

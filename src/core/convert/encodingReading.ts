// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { makeConvertFinding } from '../rules/convert';
import type { LegacyEncoding } from '../values/encoding';
import type { Finding, ParsedFile } from '../types';

/*
 * The PERSON's answer to IN-ENCODING-AMBIGUOUS: which of the 8-bit readings of the file is the right one. Nothing here guesses: the worker reads the bytes again with the code page the person
 * named (parseFile with `encoding`), which gives the text the whole conversion then sees; this only says so in the findings (CONV-ENCODING-DECLARED, info) so that the answer is visible, can be
 * taken back ("Ask again") and travels in the companion file under the hash of the file's bytes. Other files are not touched.
 */

/** The file as read with the person's code page: its findings say who chose (`fromFile` = the companion file). */
export function declareEncoding(file: ParsedFile, encoding: LegacyEncoding, fromFile: boolean): ParsedFile {
  const finding: Finding = makeConvertFinding('CONV-ENCODING-DECLARED', {
    file: file.fileName,
    params: { encoding, ...(fromFile ? { fromFile: 'yes' } : {}) },
  });
  return { ...file, findings: [...file.findings.filter((f) => f.ruleId !== 'IN-ENCODING-AMBIGUOUS' && f.ruleId !== 'CONV-ENCODING-DECLARED'), finding] };
}

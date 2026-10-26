// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { PangaeaParameter } from '../types';

/*
 * The Parameter(s) block of a PANGAEA text file, read for the CONVERTER (the shared parser, src/core/parse/pangaea.ts, keeps only the long name and the unit of each parameter
 * for /check and is not changed): the long name, the unit, the abbreviation that the table header uses, and the parameter comment, in column order.
 *
 *   Parameter(s):  Event label (Event)
 *                  Calanus finmarchicus, c2 [#/m**3] (C. finmarchicus c2) * PI: ... * METHOD/DEVICE: Counting * COMMENT: including Calanus glacialis
 *
 * The table header of that column is `C. finmarchicus c2 [#/m**3] (including Calanus glacialis)`: the abbreviation, the unit, and the comment in round brackets.
 */

/** The attribute parts of a parameter line start with a key in capitals and a colon ("PI:", "METHOD/DEVICE:", "COMMENT:", "FORMAT:") or are the bare word GEOCODE. */
const ATTRIBUTE_START = / \* (?=(?:[A-Z][A-Z/]+:|GEOCODE\b))/;

/** The text of a head that ends with a round bracket: the part before the bracket and the text inside it, brackets within it balanced ("Temp (ITS-90)"). */
function lastBracket(head: string): { before: string; inside: string } | undefined {
  if (!head.endsWith(')')) return undefined;
  let depth = 0;
  for (let i = head.length - 1; i >= 0; i--) {
    if (head[i] === ')') depth++;
    else if (head[i] === '(') {
      depth--;
      if (depth === 0) return { before: head.slice(0, i), inside: head.slice(i + 1, -1) };
    }
  }
  return undefined;
}

/**
 * "Long name [unit] (Short) * PI: ... * COMMENT: ..." -> its parts. The attributes are cut at the next attribute key, not at every " * ", so a comment that holds " * " is whole; the
 * abbreviation may hold round brackets of its own.
 */
export function parsePangaeaParameter(line: string): PangaeaParameter {
  const parts = line.split(ATTRIBUTE_START);
  const head = parts[0].trim();
  const br = lastBracket(head);
  const beforeShort = (br?.before ?? head).trimEnd();
  const short = br?.inside.trim();
  const m = /^(.*?)(?:\s*\[([^\]]*)\])?$/.exec(beforeShort);
  const name = (m?.[1] ?? beforeShort).trim() || beforeShort;
  const unit = m?.[2]?.trim();
  const comment = parts
    .slice(1)
    .map((p) => /^COMMENT:\s*(.*)$/s.exec(p.trim())?.[1]?.trim())
    .find((c) => c !== undefined && c !== '');
  return { name, ...(unit ? { unit } : {}), ...(short ? { short } : {}), ...(comment ? { comment } : {}) };
}

/** The parameters of the header block of a PANGAEA text, in column order; undefined when the text has no such block. */
export function readPangaeaParameters(text: string): PangaeaParameter[] | undefined {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  if (!/^\/\*\s*DATA DESCRIPTION/.test(lines[0] ?? '')) return undefined;
  const end = lines.findIndex((l, i) => i > 0 && l.trim().endsWith('*/'));
  const block = lines.slice(1, end < 0 ? lines.length : end);
  const out: string[] = [];
  let inside = false;
  for (const line of block) {
    if (/^Parameter\(s\):\t/.test(line)) {
      inside = true;
      out.push(line.replace(/^Parameter\(s\):\t/, ''));
    } else if (inside && line.startsWith('\t')) out.push(line.replace(/^\t+/, ''));
    else inside = false;
  }
  const params = out.filter((l) => l.trim() !== '').map(parsePangaeaParameter);
  return params.length > 0 ? params : undefined;
}

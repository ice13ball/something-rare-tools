// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
export type LegacyEncoding = 'windows-1250' | 'iso-8859-2' | 'windows-1252';
/** The 8-bit readings compared when a file is not UTF-8, in the order they are listed to the person. */
export const LEGACY_ENCODINGS: readonly LegacyEncoding[] = ['windows-1250', 'iso-8859-2', 'windows-1252'];

export type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | LegacyEncoding;

/** One way the non-UTF-8 bytes read: the code pages that read them to the same text, and the few words where the readings differ. */
export interface EncodingReading {
  encodings: LegacyEncoding[];
  words: string;
}

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  /** true when the bytes were not valid UTF-8 and a legacy code page was guessed */
  fallback: boolean;
  /** set only when the bytes read differently in two or more of the 8-bit code pages; the first reading is the one used as `text` */
  readings?: readonly EncodingReading[];
}

// Code points that are letters in windows-1250 (Š š Ś ś Ź ź) but C1 control characters in ISO-8859-2.
// Their presence is the evidence that the file is windows-1250.
const WIN1250_ONLY = new Set([0x8a, 0x9a, 0x8c, 0x9c, 0x8f, 0x9f]);

function strictUtf8(bytes: Uint8Array): string | null {
  try {
    // ignoreBOM: true keeps a BOM in the output; the caller strips it explicitly so the result is predictable.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

const WORD_CUT = /[\s;,\t]/;
const MAX_WORD = 30;
const MAX_WORDS = 3;

/** UTF-16 BOM, or ASCII-looking text with a NUL in every second byte (a file saved as UTF-16 without BOM). */
function utf16Kind(bytes: Uint8Array): 'le' | 'be' | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'be';
  const n = Math.min(bytes.length, 1024) & ~1;
  if (bytes.length % 2 !== 0 || bytes.length < 4) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) evenNul++;
      else oddNul++;
    }
  }
  const half = n / 2;
  // little-endian ASCII is `41 00`: NULs at odd offsets, none at even ones; big-endian is the mirror image
  if (evenNul === 0 && oddNul * 2 >= half) return 'le';
  if (oddNul === 0 && evenNul * 2 >= half) return 'be';
  return null;
}

function strictUtf16(bytes: Uint8Array, kind: 'le' | 'be'): string | null {
  let b = bytes;
  if (kind === 'be') {
    b = new Uint8Array(bytes.length);
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      b[i] = bytes[i + 1];
      b[i + 1] = bytes[i];
    }
  }
  try {
    // the default (ignoreBOM false) removes a leading BOM
    return new TextDecoder('utf-16le', { fatal: true }).decode(b);
  } catch {
    return null;
  }
}

/** Up to three words, cut at the character positions where the readings differ, taken from `pick` of `texts` (all of one length). */
function differingWords(texts: readonly string[], pick: number): string {
  const ref = texts[0];
  const ranges: [number, number][] = [];
  let next = 0; // the first position after the whole word the last range came from
  for (let i = 0; i < ref.length && ranges.length < MAX_WORDS; i++) {
    if (i < next || texts.every((t) => t[i] === ref[i])) continue;
    next = i + 1;
    while (next < ref.length && !WORD_CUT.test(ref[next])) next++;
    let a = i;
    while (a > 0 && i - a < MAX_WORD && !WORD_CUT.test(ref[a - 1])) a--;
    let b = i + 1;
    while (b < ref.length && b - a < MAX_WORD && !WORD_CUT.test(ref[b])) b++;
    ranges.push([a, b]);
  }
  return ranges.map(([a, b]) => texts[pick].slice(a, b)).join(', ');
}

/**
 * Decodes a text file. UTF-16 first (a BOM, or the NUL of every second byte in the first 1024 bytes), then strict UTF-8
 * (a BOM is removed and reported as 'utf-8-bom'). `forced` is the code page the person named for a non-UTF-8 file.
 * On invalid UTF-8, the text is windows-1250 when any of 0x8A/0x9A/0x8C/0x9C/0x8F/0x9F is present, else iso-8859-2
 * (a heuristic, hence `fallback: true`); the bytes are also read as windows-1250, iso-8859-2 and windows-1252, and
 * `readings` lists them, code pages that read alike as one, when there are two or more.
 */
export function decodeText(bytes: Uint8Array, forced?: LegacyEncoding): DecodedText {
  const u16 = utf16Kind(bytes);
  if (u16) {
    const t = strictUtf16(bytes, u16);
    if (t !== null) return { text: t, encoding: u16 === 'le' ? 'utf-16le' : 'utf-16be', fallback: false };
  }
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom) {
    const t = strictUtf8(bytes.subarray(3));
    if (t !== null) return { text: t, encoding: 'utf-8-bom', fallback: false };
  } else {
    const t = strictUtf8(bytes);
    if (t !== null) return { text: t, encoding: 'utf-8', fallback: false };
  }
  const body = hasBom ? bytes.subarray(3) : bytes;
  if (forced) return { text: new TextDecoder(forced).decode(body), encoding: forced, fallback: false };
  let win = false;
  for (const b of body) {
    if (WIN1250_ONLY.has(b)) {
      win = true;
      break;
    }
  }
  const encoding: LegacyEncoding = win ? 'windows-1250' : 'iso-8859-2';
  const pickText = new TextDecoder(encoding).decode(body);
  const groups: { encodings: LegacyEncoding[]; text: string }[] = [];
  for (const enc of LEGACY_ENCODINGS) {
    const text = enc === encoding ? pickText : new TextDecoder(enc).decode(body);
    const g = groups.find((x) => x.text === text);
    if (g) g.encodings.push(enc);
    else groups.push({ encodings: [enc], text });
  }
  const result: DecodedText = { text: pickText, encoding, fallback: true };
  if (groups.length >= 2) {
    groups.sort((a, b) => Number(b.encodings.includes(encoding)) - Number(a.encodings.includes(encoding)));
    const texts = groups.map((g) => g.text);
    result.readings = groups.map((g, i) => ({ encodings: g.encodings, words: differingWords(texts, i) }));
  }
  return result;
}

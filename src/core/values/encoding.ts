// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
export type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'windows-1250' | 'iso-8859-2';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  /** true when the bytes were not valid UTF-8 and a legacy code page was guessed */
  fallback: boolean;
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

/**
 * Decodes a text file. Strict UTF-8 first (a BOM is removed and reported as 'utf-8-bom').
 * On invalid UTF-8, picks windows-1250 when any of 0x8A/0x9A/0x8C/0x9C/0x8F/0x9F is present,
 * else iso-8859-2. The choice is a heuristic, hence `fallback: true`.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom) {
    const t = strictUtf8(bytes.subarray(3));
    if (t !== null) return { text: t, encoding: 'utf-8-bom', fallback: false };
  } else {
    const t = strictUtf8(bytes);
    if (t !== null) return { text: t, encoding: 'utf-8', fallback: false };
  }
  const body = hasBom ? bytes.subarray(3) : bytes;
  let win = false;
  for (const b of body) {
    if (WIN1250_ONLY.has(b)) {
      win = true;
      break;
    }
  }
  const encoding: TextEncodingName = win ? 'windows-1250' : 'iso-8859-2';
  return { text: new TextDecoder(encoding).decode(body), encoding, fallback: true };
}

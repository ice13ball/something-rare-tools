// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * The shape of the NERC codes a header can name, in one place: the P01 reading of recognition (vocab.ts), the converter's declared codes (convert/nerc.ts), the metadata draft and the
 * header check (ROW-HEADER-CODE-SHAPE in /check, CONV-NERC-CODE-MALFORMED in /convert) all use these, so they cannot disagree.
 */

/**
 * The body of a P01 code: eight upper-case letters and digits. Read on the vocabulary itself on 2026-10-29: all 50 613 concepts of the current P01 list have exactly this shape, and 66
 * of them begin with a digit, so a first letter is NOT required.
 */
export const P01_CODE_BODY = '[A-Z0-9]{8}';
export const P01_CODE_SHAPE = new RegExp(`^${P01_CODE_BODY}$`);

/**
 * The length of a code of each NERC collection a header can name with the explicit prefix `SDN:<collection>::<code>`. Only the collections whose codes all have one length are
 * listed: P01 (eight, e.g. TEMPPR01; all 50 613 codes of the current list) and P06 (four, e.g. UPAA; all 411 codes), both read on 2026-10-29. P02 is NOT here: its codes are mostly
 * four characters but 18 of the current list have five, so a length would flag real codes.
 */
export const VOCAB_CODE_LENGTH: Readonly<Record<'P01' | 'P06', number>> = { P01: 8, P06: 4 };

/** A code a header names with an explicit `SDN:<collection>::` prefix, of a shape that collection does not have. */
export interface BadHeaderCode {
  collection: 'P01' | 'P06';
  code: string;
  length: number;
}

// the code is the run of letters and digits right after the prefix (optional white space allowed); whatever follows it ("_QC", "<Float32>", " [unit]", "|", a full stop...) is not part of it.
// A prefix with no code after it ("SDN:P01::") is skipped: there is no code to be of the wrong shape.
const HEADER_CODE = /SDN:(P01|P06)::\s*([A-Za-z0-9]*)/g;

/**
 * The codes of a header that carry the explicit prefix `SDN:P01::` or `SDN:P06::` and do not have the shape of the collection (exactly 8, resp. 4, upper-case letters and digits).
 * Only the prefixed form counts: a bare word that merely looks like a code (TEMPERATURE) says nothing, and is never read here.
 */
export function badHeaderCodes(header: string): BadHeaderCode[] {
  const out: BadHeaderCode[] = [];
  for (const m of header.matchAll(HEADER_CODE)) {
    const collection = m[1] as 'P01' | 'P06';
    const length = VOCAB_CODE_LENGTH[collection];
    if (m[2] === '') continue;
    if (!new RegExp(`^[A-Z0-9]{${length}}$`).test(m[2])) out.push({ collection, code: m[2], length });
  }
  return out;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// unguardText is the exact inverse of the formula guard of the converter's code-proposal CSV, and guardText (which /check uses) is unchanged.
import { describe, expect, it } from 'vitest';
import { guardText, guardTextReversible, unguardText } from '../../src/core/output/csv';

/** Every string up to `len` over an alphabet of the characters the guard looks at, and a few ordinary ones. */
function* strings(alphabet: readonly string[], len: number): Generator<string> {
  yield '';
  let layer: string[] = [''];
  for (let n = 1; n <= len; n++) {
    const next: string[] = [];
    for (const prefix of layer) for (const ch of alphabet) next.push(prefix + ch);
    for (const s of next) yield s;
    layer = next;
  }
}

const ALPHABET = ["'", '=', '+', '-', '@', '＝', '＋', '－', '＠', ' ', '\t', '\r', '\n', 'a', '1', '"'] as const;

describe('unguardText is the exact inverse of the reversible guard', () => {
  it('unguardText(guardTextReversible(x)) === x for every string up to four characters over the guard alphabet (leading spaces, tabs, full-width forms, apostrophes)', () => {
    let n = 0;
    for (const x of strings(ALPHABET, 4)) {
      expect(unguardText(guardTextReversible(x)), JSON.stringify(x)).toBe(x);
      n++;
    }
    expect(n).toBeGreaterThan(60000);
  });

  it('and for longer random strings from the same alphabet (a seeded generator, so a failure repeats)', () => {
    let seed = 20261025;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 20000; i++) {
      const len = 1 + Math.floor(rnd() * 14);
      let x = '';
      for (let k = 0; k < len; k++) x += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
      expect(unguardText(guardTextReversible(x)), JSON.stringify(x)).toBe(x);
    }
  });

  it('the guard adds exactly one apostrophe, and only where the repository guard does (plus the apostrophe-then-formula case)', () => {
    for (const x of ['@a', '=SUM(A1)', '-ok', '+x', ' =HYPERLINK("x")', '\t=1', '\r2', '＝cmd', '＋1', '－1', '＠a']) {
      expect(guardTextReversible(x), x).toBe(guardText(x));
      expect(guardText(x), x).toBe(`'${x}`);
    }
    for (const x of ['plain', '1.5', '', 'a=b', "it's", "'quoted'", 'x@y']) {
      expect(guardTextReversible(x), x).toBe(x);
      expect(unguardText(x), x).toBe(x);
    }
    // the one text the repository guard cannot tell apart from a guarded one gets a second apostrophe
    expect(guardText("'=x")).toBe("'=x");
    expect(guardTextReversible("'=x")).toBe("''=x");
    expect(unguardText("''=x")).toBe("'=x");
  });

  it('a leading apostrophe before a formula character is the spreadsheet text escape: it is read as the text without it; any other apostrophe stays', () => {
    expect(unguardText("'=SUM(A1:A2)")).toBe('=SUM(A1:A2)');
    expect(unguardText("'@notatka")).toBe('@notatka');
    expect(unguardText("'-ok")).toBe('-ok');
    expect(unguardText("' =lead")).toBe(' =lead');
    expect(unguardText("'＝full")).toBe('＝full');
    expect(unguardText("'\tx")).toBe('\tx');
    expect(unguardText("'ordinary")).toBe("'ordinary");
    expect(unguardText("'")).toBe("'");
    expect(unguardText('')).toBe('');
    expect(unguardText('no apostrophe')).toBe('no apostrophe');
  });
});

describe('guardText itself is what /check always used', () => {
  it('writes an apostrophe before = + - @ (full-width forms, after spaces or tabs, tab, CR) and nothing else', () => {
    expect(guardText('=1')).toBe("'=1");
    expect(guardText('  -1')).toBe("'  -1");
    expect(guardText('\t1')).toBe("'\t1");
    expect(guardText('\r1')).toBe("'\r1");
    expect(guardText('＠x')).toBe("'＠x");
    expect(guardText('plain')).toBe('plain');
    expect(guardText('')).toBe('');
    expect(guardText("'=x")).toBe("'=x");
  });
});

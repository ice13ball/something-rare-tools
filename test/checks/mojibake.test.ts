// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// ROW-TEXT-MOJIBAKE: text that was encoded twice (U+00C3 or U+00C2 followed by U+0080-U+00BF). Every value is invented; the double-encoded forms are built from code points so that this file stays clean text.
import { describe, expect, it } from 'vitest';
import { checkRawTable } from '../../src/core/checks/dwc';
import { runChecks } from '../../src/core/checks/run';
import { buildDatasets } from '../../src/core/dataset';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import { renderPlain } from '../../src/core/report';
import { LANGS } from '../../src/core/types';
import type { Finding, ParsedFile } from '../../src/core/types';
import { parseFile } from '../../src/core/parse';
import { getRule } from '../../src/core/rules/registry';
import { textFile, xlsxFile } from '../helpers/files';

const A_TILDE = String.fromCharCode(0xc3);
const A_CIRC = String.fromCharCode(0xc2);
const cp = (...codes: number[]): string => String.fromCharCode(...codes);
const e_acute = `${A_TILDE}${cp(0xa9)}`; // the double-encoded e with acute: "Ã©"
const degree = `${A_CIRC}${cp(0xb0)}`; // the double-encoded degree sign: "Â°"

const check = (file: ParsedFile): Finding[] => {
  const layout = proposeLayout(file);
  const built = buildDatasets(file, layout, proposeMappings(file, layout), [], 'ds');
  return runChecks({ datasets: built.datasets, records: [], parseFindings: [...file.findings, ...built.findings] }, { today: '2026-10-24' }).findings;
};
const moji = (fs: Finding[]): Finding[] => fs.filter((f) => f.ruleId === 'ROW-TEXT-MOJIBAKE');
const sheet = (cells: string[], head = 'Station,Latitude,Longitude,Date,Note,Temp [°C]'): Finding[] =>
  moji(check(textFile('s.csv', [head, ...cells.map((c, i) => `S${i},49.4,0.2,2020-06-0${(i % 9) + 1},${c.includes(',') ? `"${c}"` : c},11.2`)].join('\n'))));

describe('ROW-TEXT-MOJIBAKE fires on double-encoded pairs', () => {
  it('a degree sign and an accented name', () => {
    const f = sheet([`7${degree}S`, `(Lim${e_acute}, 1921)`, 'fine']);
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([2, 3]);
    expect(f[0].field).toBe('Note');
    expect(f[0].params).toEqual({ count: 2, columns: '"Note"' });
    expect(f[0].value).toBe(`7${degree}S`);
    expect(f[0].severity).toBe('warning');
  });

  it('a header with a double-encoded unit is found, on the header line', () => {
    const f = moji(check(textFile('s.csv', [`Station,Latitude,Longitude,Date,Temp [${degree}C]`, 'S1,49.4,0.2,2020-06-01,11.2'].join('\n'))));
    expect(f).toHaveLength(1);
    expect(f[0].lines).toEqual([1]);
  });

  it('several columns are one finding that lists them (at most ten, then a count)', () => {
    const head = ['Station', 'Latitude', 'Longitude', 'Date', ...Array.from({ length: 14 }, (_, i) => `Note${i}`)];
    const row = ['S1', '49.4', '0.2', '2020-06-01', ...Array.from({ length: 14 }, () => `Lim${e_acute}`)];
    const f = moji(check(textFile('s.csv', [head.join(','), row.join(',')].join('\n'))));
    expect(f).toHaveLength(1);
    expect(f[0].params.count).toBe(14);
    expect(String(f[0].params.columns)).toMatch(/…\+4$/);
  });

  it('an xlsx text cell too', () => {
    const f = moji(check(xlsxFile('b.xlsx', { S: [['Station', 'Latitude', 'Longitude', 'Date', 'Note'], ['S1', 49.4, 0.2, '2020-06-01', `7${degree}S`]] })));
    expect(f).toHaveLength(1);
  });

  it('nothing is rewritten: the clean text keeps the very characters that were in the cell', async () => {
    const file = textFile('s.csv', ['Station,Latitude,Longitude,Date,Note', `S1,49.4,0.2,2020-06-01,7${degree}S`].join('\n'));
    const before = JSON.stringify(file.sheets[0].rows);
    checkRawTable(file, file.sheets[0], []);
    expect(JSON.stringify(file.sheets[0].rows)).toBe(before);
    expect(file.sheets[0].rows[0].cells[4]).toBe(`7${degree}S`);
  });
});

describe('a fallback decode is not read', () => {
  it('a UTF-8 file with one stray byte is decoded as a single-byte encoding, and the pair that makes is not in the file: silent', () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Station,Latitude,Longitude,Date,Note\nS1,49.4,0.2,2020-06-01,7\u00B0S\nS2,49.5,0.3,2020-06-02,'), 0xff, 10]);
    const file = parseFile('s.csv', bytes);
    expect(['windows-1250', 'iso-8859-2']).toContain(file.encoding);
    expect(moji(check(file))).toEqual([]);
  });

  it('the same file as clean UTF-8 with a double-encoded cell does fire', () => {
    const file = parseFile('s.csv', new TextEncoder().encode(['Station,Latitude,Longitude,Date,Note', `S1,49.4,0.2,2020-06-01,7${degree}S`].join('\n')));
    expect(file.encoding).toMatch(/^utf-8/);
    expect(moji(check(file))).toHaveLength(1);
  });

  it('the count is of the pair only: the text says "with this pattern", not a total', () => {
    const f = sheet([`7${degree}S`])[0];
    expect(renderPlain(f, 'en')).toContain('cells with this pattern');
    expect(renderPlain(f, 'en')).not.toContain('in all');
    expect(getRule('ROW-TEXT-MOJIBAKE').technical).toContain('not matched');
  });
});

describe('real text never fires', () => {
  it('Nordic, German, Portuguese, Greek and Cyrillic names, a lone A-tilde, a lone A-circumflex at the end', () => {
    const real = ['Århus', 'Müller', 'Ålesund', 'São Paulo', 'François', 'Gdańsk', `${A_TILDE}ngulo`, `${A_TILDE}`, `Latitude${A_CIRC}`, `x ${A_TILDE} y`, 'Αθήνα', 'Москва', '7°S', 'café', 'plain'];
    expect(sheet(real)).toEqual([]);
  });

  it('numbers and empty cells', () => {
    expect(sheet(['', '12.5', '0'])).toEqual([]);
  });
});

describe('text and languages', () => {
  it('four languages, no placeholder left, nothing is deleted or advised to be', () => {
    const f = sheet([`7${degree}S`])[0];
    for (const lang of LANGS) {
      const t = renderPlain(f, lang);
      expect(t, lang).not.toMatch(/[{}]/);
      expect(t, lang).toContain('UTF-8');
      expect(t, lang).not.toMatch(/delete|remove|usuń|lösch|entfern|supprim/i);
    }
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// OFFLINE corpus: the licence prose of ISO 19139 records from five public GeoNetwork catalogues (Sextant, EMODnet, Marine Institute
// Ireland, BGS, ICES; 22.10.2026), fed through the shared classifier. It pins what must NOT go wrong (a statement that is no licence
// must not become one, a plain CC name must be read) and, with ISO_PROSE_OUT=<file>, writes the per-statement result for a human to judge
// the filler list. It does not grow the filler list and does not pin how many statements fall to "check manually".
// ⛔ No IO PAN record in the fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyseLicences } from '../../src/core/licence/analyse';
import { buildStatement } from '../../src/core/metadata/licence';
import type { MetadataRecord } from '../../src/core/types';

interface Line {
  catalogue: string;
  record: string;
  field: string;
  text: string;
  uri?: string;
}

const NOT_IOPAN = /iopan|institute of oceanology|polish academy/i;
const raw = readFileSync(join(__dirname, '..', 'fixtures', 'iso-prose-corpus.txt'), 'utf8').split('\n').filter((l) => l.trim() !== '');

/** Lines that carry a statement: `[catalogue record] field [gmx:Anchor xlink:href=URI] :: text`. Restriction-code lines are not statements. */
const STATEMENT = /^\[(\S+) (.+?)\] (\w+)(?: gmx:Anchor xlink:href=(\S+))? :: ?(.*)$/;
const CODE = /^\[(\S+) (.+?)\] (\w+) MD_RestrictionCode codeListValue=(.*)$/;

const lines: Line[] = [];
const codes: string[] = [];
for (const l of raw) {
  const m = STATEMENT.exec(l);
  if (m) {
    const uri = m[4] && m[4] !== 'None' ? m[4] : undefined;
    lines.push({ catalogue: m[1], record: m[2], field: m[3], text: m[5].trim(), uri });
  } else if (CODE.test(l)) codes.push(l);
  else throw new Error(`corpus line not understood: ${l.slice(0, 80)}`);
}

interface Result {
  line: Line;
  verdict: string;
  group: string;
  leftover: string;
}

function classify(line: Line): Result | undefined {
  const s = buildStatement({ source: 'iso19139', field: line.field, text: line.text || undefined, uri: line.uri });
  if (!s) return undefined; // nothing in it (an empty element)
  const rec: MetadataRecord = { source: 'iso19139', label: line.record, licences: [s], restrictionCodes: [], distributionLinks: [] };
  const a = analyseLicences([rec]).sources[0].statements[0];
  if (a.classification.kind === 'spdx') return { line, verdict: a.classification.id, group: 'recognised', leftover: '' };
  const c = a.conflict;
  const group = c ? c.kind : 'no-licence-named';
  return { line, verdict: 'check manually', group, leftover: c ? (c.rest || c.textLicence || '') : line.text };
}

const results = lines.map(classify).filter((r): r is Result => r !== undefined);
const find = (frag: string): Result => {
  const r = results.find((x) => (x.line.text + ' ' + (x.line.uri ?? '')).includes(frag));
  if (!r) throw new Error(`no statement with ${frag}`);
  return r;
};

describe('ISO licence prose from public catalogues (offline)', () => {
  it('holds the statements of five catalogues, none from IO PAN', () => {
    expect(new Set(lines.map((l) => l.catalogue))).toEqual(new Set(['sextant', 'emodnet', 'marineie', 'bgs', 'ices']));
    expect(lines.length).toBeGreaterThan(60);
    expect(results.length).toBeGreaterThan(50);
    for (const l of raw) expect(l).not.toMatch(NOT_IOPAN);
  });

  it('reads the plain licence names and links', () => {
    expect(find('CC BY. Licence Creative Commons Attribution 4.0 International').verdict).toBe('CC-BY-4.0');
    expect(find('ODC-ODbL').verdict).toBe('ODbL-1.0');
    expect(find('CC-BY 4.0').verdict).toBe('CC-BY-4.0');
    expect(find('CC BY-SA 4.0').verdict).toBe('CC-BY-SA-4.0');
    expect(find('Creative Commons CC-BY 4.0').verdict).toBe('CC-BY-4.0');
  });

  it('never turns a statement that is no licence into one (fail closed)', () => {
    for (const frag of ['Not for navigation', 'free of charge', 'Conditions inconnues', "Accès limité à l'Ifremer", 'Data use only after permission', 'Restricted; available upon request', 'Reference citation is required']) {
      expect(find(frag).verdict, frag).toBe('check manually');
    }
    // a statement that names a licence AND adds conditions is not the standard licence
    expect(find('Permission is granted to use these data').verdict).toBe('check manually');
    // a long prose that merely mentions "Creative Commons CC BY 4.0" in a sentence about licences
    expect(find('A Creative Commons (CC) license is one of several').verdict).toBe('check manually');
  });

  it('every recognised statement names a licence the text or link actually contains', () => {
    for (const r of results.filter((x) => x.group === 'recognised')) {
      const hay = `${r.line.text} ${r.line.uri ?? ''}`.toLowerCase();
      const key = r.verdict.toLowerCase().replace(/-\d.*$/, '').replace(/-/g, '');
      expect(hay.replace(/[\s-]/g, ''), `${r.line.record}: ${r.verdict}`).toContain(key.slice(0, 4));
    }
  });

  it.runIf(!!process.env.ISO_PROSE_OUT)('writes the per-statement result (ISO_PROSE_OUT=<file>)', () => {
    const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    const clip = (s: string, n: number): string => esc(s.length > n ? `${s.slice(0, n - 1)}…` : s);
    const manual = results.filter((r) => r.group !== 'recognised');
    const byGroup = new Map<string, number>();
    for (const r of manual) byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + 1);
    const out: string[] = [
      '# ISO licence prose through the shared classifier (offline corpus)',
      '',
      `Source: ${raw.length} lines from 5 public GeoNetwork catalogues (/tmp/stage2/licence_corpus.txt, fixture test/fixtures/iso-prose-corpus.txt). No IO PAN text.`,
      '',
      '## Summary',
      '',
      `- Lines: ${raw.length}; restriction-code lines (not licence statements, not classified): ${codes.length}; statement lines: ${lines.length}`,
      `- Statements with content (an empty element builds no statement): ${results.length}`,
      `- Recognised as one SPDX licence: ${results.length - manual.length}`,
      `- Fall to "check manually": ${manual.length}`,
      '',
      'Reasons for "check manually":',
      '',
      ...[...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `- ${g}: ${n}`),
      '',
      '## Per statement',
      '',
      '| catalogue | field | text | link | result | group | leftover |',
      '|---|---|---|---|---|---|---|',
      ...results.map((r) => `| ${r.line.catalogue} | ${r.line.field} | ${clip(r.line.text, 110)} | ${r.line.uri ? clip(r.line.uri, 60) : ''} | ${r.verdict} | ${r.group} | ${clip(r.leftover, 90)} |`),
      '',
    ];
    writeFileSync(process.env.ISO_PROSE_OUT!, out.join('\n'));
  });
});

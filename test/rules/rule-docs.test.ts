// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The hand-written description of every rule (src/core/rules/docs/<family>.ts) is complete, names only rules the registry has, and keeps its shape.
import { describe, expect, it } from 'vitest';
import { RULES } from '../../src/core/rules/registry';
import { RULE_DOCS } from '../../src/core/rules/docs';
import { DOCS as dwc } from '../../src/core/rules/docs/dwc';
import { DOCS as licence } from '../../src/core/rules/docs/licence';
import { DOCS as metadata } from '../../src/core/rules/docs/metadata';
import { DOCS as input } from '../../src/core/rules/docs/input';
import { DOCS as chemistry } from '../../src/core/rules/docs/chemistry';
import { DOCS as crossfile } from '../../src/core/rules/docs/crossfile';
import { DOCS as rows } from '../../src/core/rules/docs/rows';
import { DOCS as convert } from '../../src/core/rules/docs/convert';
import type { RuleDoc } from '../../src/core/rules/docs/types';

/** Families whose descriptions are not written yet. Each family task removes its family from this list. */
export const PENDING_FAMILIES: readonly string[] = ['convert'];

/** The docs file of each family and the registry ids it must cover (a family is its own docs file; ids are assigned by prefix of the rule file). */
const FILES: Record<string, Readonly<Record<string, RuleDoc>>> = { input, chemistry, crossfile, rows, dwc, metadata, licence, convert };
const FAMILY_OF = (id: string): string => {
  if (id.startsWith('DWC-')) return 'dwc';
  if (id.startsWith('META-')) return 'metadata';
  if (id.startsWith('LIC-')) return 'licence';
  if (id.startsWith('CONV-')) return 'convert';
  if (id.startsWith('IN-')) return 'input';
  if (id.startsWith('CHEM-')) return 'chemistry';
  if (id.startsWith('XF-')) return 'crossfile';
  if (id.startsWith('ROW-')) return 'rows';
  return 'unknown';
};

/** Tokens that must never appear in an example: real data of the golden set or of a real user's file. */
const FORBIDDEN = ['IO PAN', 'iopan', '10.48457'];
const FIELDS = ['checks', 'fires', 'example', 'action'] as const;
const ids = new Set(RULES.map((r) => r.id));

describe('rule descriptions', () => {
  it('every family is known', () => {
    expect(RULES.filter((r) => FAMILY_OF(r.id) === 'unknown').map((r) => r.id)).toEqual([]);
  });

  it('every rule of a finished family has a description', () => {
    const missing = RULES.filter((r) => !PENDING_FAMILIES.includes(FAMILY_OF(r.id)) && !RULE_DOCS[r.id]).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('a pending family only lists families that exist', () => {
    for (const f of PENDING_FAMILIES) expect(Object.keys(FILES), f).toContain(f);
  });

  it('no description names an id the registry lacks, and each sits in its own family file', () => {
    for (const [family, docs] of Object.entries(FILES)) {
      for (const id of Object.keys(docs)) {
        expect(ids.has(id), `${family}: ${id} is not in the registry`).toBe(true);
        expect(FAMILY_OF(id), `${id} is in the ${family} file`).toBe(family);
      }
    }
  });

  it('no id is described twice', () => {
    const all = Object.values(FILES).flatMap((d) => Object.keys(d));
    expect(all.length).toBe(new Set(all).size);
  });

  it('every field is present, non-empty, at most 900 characters, without braces', () => {
    for (const [id, doc] of Object.entries(RULE_DOCS)) {
      expect(Object.keys(doc).sort(), id).toEqual([...FIELDS].sort());
      for (const f of FIELDS) {
        const text = doc[f];
        expect(typeof text, `${id}.${f}`).toBe('string');
        expect(text.trim().length, `${id}.${f} is empty`).toBeGreaterThan(0);
        expect(text.length, `${id}.${f} is longer than 900`).toBeLessThanOrEqual(900);
        expect(/[{}]/.test(text), `${id}.${f} has a brace`).toBe(false);
        expect(/^\s*#/m.test(text), `${id}.${f} has a heading`).toBe(false);
      }
    }
  });

  it('no example holds a real-data marker', () => {
    for (const [id, doc] of Object.entries(RULE_DOCS)) {
      for (const token of FORBIDDEN) expect(doc.example.toLowerCase(), `${id} example`).not.toContain(token.toLowerCase());
    }
  });

  it('a title can be cut from every description (its first sentence is not the whole field)', () => {
    for (const [id, doc] of Object.entries(RULE_DOCS)) expect(doc.checks.trim(), id).toMatch(/[.!?]/);
  });
});

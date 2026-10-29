// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The export policy matrix (plan 3.4): what blocks, what the user accepts, what is only shown.
import { describe, expect, it } from 'vitest';
import { ACCEPT_RULES, BLOCK_CONV_RULES, BLOCK_INPUT_RULES, BLOCK_OUTPUT_RULES, LATER_STAGE_RULES, SHOW_ONLY_PREFIXES, exportAllowed, judge, policyOf } from '../../src/core/convert/policy';
import { validateDataset } from '../../src/core/convert/validate';
import { CONVERT_RULE_DEFS } from '../../src/core/rules/convert';
import { RULES } from '../../src/core/rules/registry';
import type { Finding, Severity } from '../../src/core/types';
import { exportSheet, META } from './exportHelpers';
import { W1_HEADER, W1_QUANTITY, W1_ROWS } from './helpers';
import { toDataset } from '../../src/core/convert/model';

const f = (ruleId: string, severity: Severity = 'warning'): Finding => ({ ruleId, severity, params: {} });

describe('the 3.4 lists, exactly', () => {
  it('blocking, from the output tables', () => {
    expect([...BLOCK_OUTPUT_RULES]).toEqual(['DWC-TERM-MISSING', 'DWC-TERM-EMPTY', 'DWC-EVENTID-DUPLICATE', 'DWC-PARENT-DANGLING', 'DWC-PARENT-LOOP', 'DWC-OCCURRENCEID-DUPLICATE', 'DWC-VOCAB-VALUE', 'ROW-ZERO-COORD', 'ROW-LAT-RANGE', 'ROW-LON-RANGE', 'ROW-DEPTH-MIN-MAX', 'ROW-DATE-UNPARSEABLE', 'ROW-NO-COORD']);
    expect([...BLOCK_INPUT_RULES]).toEqual(['IN-LAYOUT-UNSUPPORTED', 'IN-FILE-UNREADABLE', 'ROW-RAGGED']);
  });
  it('blocking CONV rules', () => {
    expect([...BLOCK_CONV_RULES].sort()).toEqual(
      ['CONV-COLUMN-UNNAMED', 'CONV-LONG-UNSUPPORTED', 'CONV-SHEET-TRANSPOSED', 'CONV-PRESENCE-VALUE', 'CONV-REPLICATE-MISSING', 'CONV-LONG-DUPLICATE', 'CONV-LONG-NO-PARAMETER', 'CONV-QUANTITY-UNDECLARED', 'CONV-COUNT-NOT-INTEGER', 'CONV-NEGATIVE-QUANTITY', 'CONV-SAMPLE-CODE-MISSING', 'CONV-PROFILE-NO-STATION', 'CONV-PROFILE-LEVEL-INCOMPLETE', 'CONV-ID-DUPLICATE', 'CONV-TAB-IN-VALUE', 'CONV-EMOF-ORPHAN', 'CONV-EMOF-EVENT-MISMATCH', 'CONV-EMOF-VALUE-EMPTY', 'CONV-EMOF-TYPE-EMPTY', 'CONV-BASIS-UNSET', 'CONV-LICENCE-UNSET', 'CONV-EML-MISSING', 'CONV-SPLIT-UNDECIDED', 'CONV-MESH-INVALID', 'CONV-WORMS-UNDECIDED', 'CONV-NO-OCCURRENCES', 'CONV-PROFILE-NOTHING-READ', 'CONV-SEAFLOOR-UNIT', 'CONV-SEAFLOOR-VALUE'].sort(),
    );
  });
  it('to accept, per rule and per run', () => {
    expect([...ACCEPT_RULES]).toEqual(['IN-HEADER-SHORT', 'ROW-NON-NUMERIC', 'ROW-INVISIBLE-CHAR', 'ROW-DATE-FUTURE', 'ROW-DEPTH-RANGE', 'ROW-HEMISPHERE-CONFLICT', 'ROW-HEMISPHERE-MISSING', 'ROW-HEMISPHERE-UNPAIRED', 'DWC-RECOMMENDED', 'CONV-TEXT-IN-TAXON-CELL', 'CONV-TAXON-SAME-EVENT', 'CONV-WORMS-NO-MATCH', 'CONV-WORMS-NOT-MARINE', 'CONV-NERC-UNKNOWN', 'CONV-NERC-UNIT-MISMATCH', 'CONV-NERC-CODE-MALFORMED', 'CONV-UNIT-NO-P06', 'CONV-COLUMN-NOT-EXPORTED', 'CONV-SUMMARY-ROW-KEPT', 'CONV-ID-REVISIT', 'CONV-NAMEID-MISSING', 'CONV-NAMEID-APHIA-LIKE', 'CONV-NAMEID-INCOMPLETE', 'CONV-NAMEID-CONFLICT', 'CONV-DEVICE-MISSING', 'CONV-PROFILE-STATION-UNMATCHED', 'CONV-PROFILE-STATION-FAR', 'CONV-PROFILE-PRESSURE-NO-UNIT', 'CONV-LICENCE-DIFFERS', 'CONV-NO-SAMPLING-DESCRIPTOR', 'CONV-SEAFLOOR-NO-SITE-DEPTH']);
  });
  it('shown only', () => {
    expect([...SHOW_ONLY_PREFIXES]).toEqual(['CHEM-', 'ROW-SHIP-SPEED', 'ROW-ON-LAND', 'ROW-STATION-', 'XF-', 'META-', 'LIC-']);
  });
});

describe('the matrix over every rule of /check and of the converter', () => {
  const all = [...RULES, ...CONVERT_RULE_DEFS];
  const policyOfRule = (id: string, sev: Severity) => policyOf(f(id, sev));

  it('every listed rule behaves as listed, whatever severity it is raised with (a warning that blocks, an error that is only accepted, ...)', () => {
    for (const id of [...BLOCK_OUTPUT_RULES, ...BLOCK_INPUT_RULES, ...BLOCK_CONV_RULES]) for (const s of ['error', 'warning', 'info'] as const) expect(policyOfRule(id, s), `${id} ${s}`).toBe('block');
    for (const id of ACCEPT_RULES) for (const s of ['error', 'warning', 'info'] as const) expect(policyOfRule(id, s), `${id} ${s}`).toBe('accept');
    for (const p of SHOW_ONLY_PREFIXES) for (const s of ['error', 'warning', 'info'] as const) expect(policyOfRule(`${p}X`, s), `${p} ${s}`).toBe('show');
  });

  it('every rule that exists is placed: listed rules in their list, the rest by severity (error blocks, anything else is shown); no id is on two lists', () => {
    const lists = [BLOCK_OUTPUT_RULES, BLOCK_INPUT_RULES, BLOCK_CONV_RULES, ACCEPT_RULES];
    const all2 = lists.flat();
    expect(new Set(all2).size).toBe(all2.length);
    for (const r of all) {
      const p = policyOfRule(r.id, r.severity);
      if (SHOW_ONLY_PREFIXES.some((x) => r.id.startsWith(x))) expect(p, r.id).toBe('show');
      else if (all2.includes(r.id)) expect(p, r.id).toBe(BLOCK_CONV_RULES.includes(r.id) || BLOCK_OUTPUT_RULES.includes(r.id) || BLOCK_INPUT_RULES.includes(r.id) ? 'block' : 'accept');
      else expect(p, r.id).toBe(r.severity === 'error' ? 'block' : 'show');
    }
    // the rules of the lists that exist today are registered; the others are the later stages' and nothing else
    const known = new Set(all.map((r) => r.id));
    expect(all2.filter((id) => !known.has(id)).sort()).toEqual([...LATER_STAGE_RULES].sort());
  });

  it('the matrix, printed as the plan has it', () => {
    const rows = all.map((r) => `${r.id} ${r.severity} -> ${policyOfRule(r.id, r.severity)}`);
    expect(rows.filter((x) => x.endsWith('block')).length).toBeGreaterThan(30);
    expect(rows).toContain('ROW-DATE-UNPARSEABLE warning -> block');
    expect(rows).toContain('ROW-NON-NUMERIC warning -> accept');
    expect(rows).toContain('ROW-SHIP-SPEED warning -> show');
    expect(rows.filter((x) => x.startsWith('META-')).every((x) => x.endsWith('show'))).toBe(true);
    expect(rows).toContain('CONV-ZERO-SKIPPED info -> show');
    expect(rows).toContain('CONV-COLUMN-NOT-EXPORTED warning -> accept');
    expect(rows).toContain('CONV-NAMEID-MISSING warning -> accept');
    expect(rows).toContain('CONV-DEVICE-MISSING warning -> accept');
  });
});

describe('judge and the export gate', () => {
  it('splits by policy; one acceptance per rule however many findings it has', () => {
    const j = judge([f('ROW-NON-NUMERIC'), f('ROW-NON-NUMERIC'), f('DWC-RECOMMENDED'), f('CONV-ID-DUPLICATE', 'error'), f('CHEM-RANGE'), f('ROW-DATE-UNPARSEABLE')]);
    expect(j.blocking.map((x) => x.ruleId)).toEqual(['CONV-ID-DUPLICATE', 'ROW-DATE-UNPARSEABLE']);
    expect(j.acceptRules).toEqual(['ROW-NON-NUMERIC', 'DWC-RECOMMENDED']);
    expect(j.showOnly.map((x) => x.ruleId)).toEqual(['CHEM-RANGE']);
  });
  it('is open only when nothing blocks and every rule to accept is accepted', () => {
    const fs = [f('ROW-NON-NUMERIC'), f('CHEM-RANGE')];
    expect(exportAllowed(fs, [])).toBe(false);
    expect(exportAllowed(fs, ['ROW-NON-NUMERIC'])).toBe(true);
    expect(exportAllowed([...fs, f('DWC-TERM-EMPTY', 'error')], ['ROW-NON-NUMERIC', 'DWC-TERM-EMPTY'])).toBe(false);
    expect(exportAllowed([], [])).toBe(true);
  });
});

describe('on real conversions', () => {
  it('W1 blocks on nothing and needs two acceptances: no scientificNameID (it replaces the DwC-RECOMMENDED finding) and no sampling device', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    const j = judge(e.findings);
    expect(j.blocking).toEqual([]);
    expect([...j.acceptRules].sort()).toEqual(['CONV-DEVICE-MISSING', 'CONV-NAMEID-MISSING']);
    expect(e.findings.some((f) => f.ruleId === 'DWC-RECOMMENDED')).toBe(false);
  });

  it('a sheet with no position or date is blocked by the Event checks; the description and the choices block by their own rules', async () => {
    const e = await exportSheet(['Sample', 'Abra alba'], [['A1', 4]], { quantity: { kind: 'count' }, meta: { title: '', abstract: '', creators: '', contactEmail: 'nope', institutionCode: '', licence: '', basisOfRecord: '' } });
    const ids = judge(e.findings).blocking.map((x) => x.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['DWC-TERM-EMPTY', 'CONV-EML-MISSING', 'CONV-LICENCE-UNSET', 'CONV-BASIS-UNSET']));
    expect(e.files).toEqual([]);
    const missing = e.findings.find((x) => x.ruleId === 'CONV-EML-MISSING')!;
    expect(String(missing.params.fields).split(', ')).toEqual(['title', 'abstract', 'creator', 'contact email', 'institution code', 'dataset name']);
    // basisOfRecord unset is reported once, not also as an empty column
    expect(e.findings.filter((x) => x.ruleId === 'DWC-TERM-EMPTY' && x.field === 'basisOfRecord')).toEqual([]);
  });

  it('eMoF cross-table checks: orphan event, orphan occurrence, mismatch, empty value, empty type', async () => {
    const e = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, fullList: true });
    const ds = e.dataset;
    const m = ds.measurements;
    const bad = {
      ...ds,
      measurements: [
        { ...m[0], eventId: 'NOPE' },
        { ...m[1], occurrenceId: 'NOPE' },
        { ...m[1], eventId: 'S2-a' },
        { ...m[2], value: ' ' },
        { ...m[2], type: '' },
      ],
    };
    const ids = validateDataset(bad, [], { today: '2026-10-25' }).map((x) => x.ruleId);
    for (const id of ['CONV-EMOF-ORPHAN', 'CONV-EMOF-EVENT-MISMATCH', 'CONV-EMOF-VALUE-EMPTY', 'CONV-EMOF-TYPE-EMPTY']) expect(ids, id).toContain(id);
    expect(ids.filter((x) => x === 'CONV-EMOF-ORPHAN')).toHaveLength(2);
    const done = toDataset({ events: [], occurrences: [], measurements: [] }, META, { fullList: false, prefixStation: false, worms: false, nvs: false });
    expect(validateDataset(done).map((x) => x.ruleId)).toEqual([]);
  });
});

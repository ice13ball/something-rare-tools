// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 4, the parts besides the lookup: the "no sampling descriptor" warning and BioCheck's BODCeffort list, the DOI in the EML citation, the companion file
// round trip of worms=yes, and the policy of the new rules.
import { describe, expect, it } from 'vitest';
import { citationIdentifier, doiOfCitation } from '../../src/core/convert/eml';
import { judge, policyOf } from '../../src/core/convert/policy';
import { readConvertSettings, writeConvertSidecar } from '../../src/core/convert/settings';
import { BIOCHECK_EFFORT_CODES, P01, isEffortTypeId } from '../../src/core/convert/vocab';
import { CONVERT_RULES, renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { exportSheet } from './exportHelpers';
import { textFile } from '../helpers/files';
import { W1_HEADER, W1_QUANTITY, W1_ROWS } from './helpers';

describe('CONV-NO-SAMPLING-DESCRIPTOR (BioCheck: "No sampling descriptors/effort present")', () => {
  it('the BODCeffort list holds the three concepts this converter writes for sample size and mesh size, and it has the 29 codes of data/BODCeffort', () => {
    for (const t of [P01.volumeSampled, P01.areaSampled, P01.meshSize]) expect(BIOCHECK_EFFORT_CODES, t.code).toContain(t.code);
    expect(BIOCHECK_EFFORT_CODES.length).toBe(29);
    expect(new Set(BIOCHECK_EFFORT_CODES).size).toBe(29);
    expect(isEffortTypeId(P01.volumeSampled.uri)).toBe(true);
    expect(isEffortTypeId(P01.count.uri)).toBe(false);
    expect(isEffortTypeId(P01.densityVolume.uri)).toBe(false);
  });

  it('is raised when no eMoF row is a descriptor (counts only), and is an accept warning', async () => {
    const r = await exportSheet(W1_HEADER, W1_ROWS, { quantity: { kind: 'count' } });
    const f = r.findings.find((x) => x.ruleId === 'CONV-NO-SAMPLING-DESCRIPTOR');
    expect(f?.severity).toBe('warning');
    expect(policyOf(f!)).toBe('accept');
    expect(judge(r.findings).acceptRules).toContain('CONV-NO-SAMPLING-DESCRIPTOR');
    expect(judge(r.findings).blocking.map((x) => x.ruleId)).not.toContain('CONV-NO-SAMPLING-DESCRIPTOR');
  });

  it('is not raised when a sample size is written (a volume column), nor when only a mesh size is given', async () => {
    const withEffort = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY });
    expect(withEffort.findings.some((x) => x.ruleId === 'CONV-NO-SAMPLING-DESCRIPTOR')).toBe(false);
    const mesh = await exportSheet(W1_HEADER, W1_ROWS, { quantity: { kind: 'count' }, meshUm: '200' });
    expect(mesh.findings.some((x) => x.ruleId === 'CONV-NO-SAMPLING-DESCRIPTOR')).toBe(false);
  });

  it('reads in all four languages and cites the BioCheck source', () => {
    const rule = CONVERT_RULES.find((r) => r.id === 'CONV-NO-SAMPLING-DESCRIPTOR');
    expect(rule?.citations?.[0].url).toContain('EMODnetBiocheck');
    const f = { ruleId: 'CONV-NO-SAMPLING-DESCRIPTOR', severity: 'warning' as const, params: {} };
    for (const lang of LANGS) expect(renderConvertPlain(f, lang)).toContain('No sampling descriptors/effort present');
  });
});

describe('the EML citation identifier', () => {
  it('reads a DOI in any of its three spellings and leaves a trailing full stop to the sentence', () => {
    expect(doiOfCitation('Example, A (2020). Title. https://doi.org/10.1594/PANGAEA.839758')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('Example (2020). Title. doi:10.1594/PANGAEA.839758.')).toBe('10.1594/PANGAEA.839758');
    expect(doiOfCitation('Example (2020). Title. 10.5281/zenodo.123456')).toBe('10.5281/zenodo.123456');
    expect(doiOfCitation('Example (2020). Title. (https://dx.doi.org/10.5281/zenodo.123456)')).toBe('10.5281/zenodo.123456');
    expect(doiOfCitation('Example (2020). Version 10.2 of the Title, 2020.')).toBeUndefined();
    expect(doiOfCitation('')).toBeUndefined();
  });

  it('the identifier is the https://doi.org/ address when the citation carries a DOI (the IPT form), else the slug', () => {
    expect(citationIdentifier({ citation: 'A (2020). T. https://doi.org/10.1594/PANGAEA.839758' }, 'my-slug')).toBe('https://doi.org/10.1594/PANGAEA.839758');
    expect(citationIdentifier({ citation: 'A (2020). T. 10.1594/PANGAEA.839758' }, 'my-slug')).toBe('https://doi.org/10.1594/PANGAEA.839758');
    expect(citationIdentifier({ citation: 'A (2020). T.' }, 'my-slug')).toBe('my-slug');
    expect(citationIdentifier({ citation: '' }, 'my-slug')).toBe('my-slug');
  });

  it('is written to additionalMetadata/gbif/citation, escaped, and the slug stays without a DOI', async () => {
    const withDoi = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY, meta: { citation: 'Example, A (2020). Title. https://doi.org/10.1594/PANGAEA.839758' } });
    expect(withDoi.eml).toContain('<citation identifier="https://doi.org/10.1594/PANGAEA.839758">Example, A (2020). Title. https://doi.org/10.1594/PANGAEA.839758</citation>');
    const without = await exportSheet(W1_HEADER, W1_ROWS, { quantity: W1_QUANTITY });
    expect(without.eml).toMatch(/<citation identifier="[a-z0-9-]+">/);
    expect(without.eml).not.toContain('doi.org');
  });
});

describe('the companion file', () => {
  it('writes worms=yes only when the box was ticked, and reads it back as a setting (a pre-tick)', () => {
    expect(writeConvertSidecar({ worms: true })).toContain('(setting),worms=yes');
    expect(writeConvertSidecar({ fullList: true })).not.toContain('worms');
    expect(writeConvertSidecar({})).not.toContain('worms');
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ worms: true })))).toEqual({ fullList: false, prefixStation: false, worms: true });
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ fullList: true, prefixStation: true, worms: true })))).toEqual({ fullList: true, prefixStation: true, worms: true });
    expect(readConvertSettings(textFile('c.sidecar.csv', writeConvertSidecar({ fullList: true })))?.worms).toBe(false);
  });

  it('holds no name: the file of a ticked run is the header and the setting rows only', () => {
    const text = writeConvertSidecar({ fullList: true, worms: true });
    expect(text.trim().split('\n').length).toBe(3);
    expect(text).not.toMatch(/Calanus|urn:lsid|AphiaID/);
  });
});

describe('the policy of the stage 4 rules', () => {
  const f = (ruleId: string) => ({ ruleId, severity: 'warning' as const });
  it('CONV-WORMS-UNDECIDED blocks; NO-MATCH and NOT-MARINE are accepted per run', () => {
    expect(policyOf({ ruleId: 'CONV-WORMS-UNDECIDED', severity: 'error' })).toBe('block');
    expect(policyOf(f('CONV-WORMS-NO-MATCH'))).toBe('accept');
    expect(policyOf(f('CONV-WORMS-NOT-MARINE'))).toBe('accept');
  });
});

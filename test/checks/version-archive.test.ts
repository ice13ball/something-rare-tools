// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A record whose data came as a Darwin Core Archive with a version in eml.xml states a version: no META-NO-VERSION next to
// IN-DWCA-VERSION (the two said opposite things on the same report).
import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/core/checks/run';
import { makeFinding } from '../../src/core/rules/registry';
import type { LoadedRecord, MetadataRecord } from '../../src/core/types';

const dc: MetadataRecord = { source: 'datacite', label: 'DataCite 10.0000/invented', licences: [], restrictionCodes: [], distributionLinks: [] };
const record = (files: string[]): LoadedRecord => ({ label: '10.0000/invented', kind: 'datacite', metadata: [dc], files: files.map((name) => ({ name })), findings: [] });
const version = (file: string, v: string) => makeFinding('IN-DWCA-VERSION', { file, params: { title: 't', version: v, core: 'Occurrence' } });
const ids = (r: ReturnType<typeof runChecks>) => r.findings.map((f) => f.ruleId);

describe('META-NO-VERSION and an archive version', () => {
  it('is not reported when the record’s archive states a version', () => {
    expect(ids(runChecks({ datasets: [], records: [record(['a.zip'])], parseFindings: [version('a.zip', 'v1.0, published 2025-09-17')] }))).not.toContain('META-NO-VERSION');
  });
  it('is still reported when the archive states none, or the versioned archive belongs to another record', () => {
    expect(ids(runChecks({ datasets: [], records: [record(['a.zip'])], parseFindings: [version('a.zip', 'n/a')] }))).toContain('META-NO-VERSION');
    expect(ids(runChecks({ datasets: [], records: [record(['b.zip'])], parseFindings: [version('a.zip', 'v2')] }))).toContain('META-NO-VERSION');
  });
});

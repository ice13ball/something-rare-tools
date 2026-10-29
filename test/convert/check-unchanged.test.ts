// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Adding the converter must not change /check: it never proposes the converter roles, the new role kinds are inert in every /check reader,
// and the proposals over the fixtures are byte-for-byte what they were at fb314bb (the golden diff proves the same over the private golden set).
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDataset, specsOf } from '../../src/core/dataset';
import { toCleanCsv } from '../../src/core/output/csv';
import { proposeColumns } from '../../src/core/recognize/columns';
import { proposeLayout, proposeMappings } from '../../src/core/recognize/layout';
import type { ColumnRole, ParsedFile, SheetMapping } from '../../src/core/types';
import { ROLE_FEEDS } from '../../src/app/tips';
import { ROLE_KINDS } from '../../src/app/mappingModel';
import { join } from 'node:path';
import { fixtureFile, rawSheet } from '../helpers/files';

const CONVERTER_KINDS = ['taxon', 'quantity', 'quantityType', 'effort', 'occurrenceId', 'lifeStage', 'qualifier', 'taxonId'];
const FIXTURE_DIR = join(__dirname, '..', 'fixtures');
const dataFixtures = readdirSync(FIXTURE_DIR).filter((f) => /\.(csv|tab|txt)$/.test(f)).sort();

const sheetsOf = (): { name: string; file: ParsedFile }[] => dataFixtures.map((name) => ({ name, file: fixtureFile(name) })).filter((x) => x.file.sheets.length > 0);

/** Every proposal over every fixture sheet, in the same deterministic order. */
function allProposals(): unknown[] {
  const out: unknown[] = [];
  for (const { name, file } of sheetsOf()) {
    for (const sheet of file.sheets) out.push([name, sheet.name, proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904 })]);
    out.push([name, 'layout', proposeLayout(file)]);
  }
  return out;
}

describe('/check never proposes the converter roles', () => {
  it('over every fixture, proposeColumns yields none of the new kinds and no depth bound', () => {
    expect(sheetsOf().length).toBeGreaterThan(5);
    for (const { name, file } of sheetsOf()) {
      for (const sheet of file.sheets) {
        for (const p of proposeColumns(sheet, { decimalComma: file.decimalComma, date1904: file.date1904 })) {
          expect(CONVERTER_KINDS, `${name}: ${p.header}`).not.toContain(p.role.kind);
          if (p.role.kind === 'depth') expect('bound' in p.role, `${name}: ${p.header}`).toBe(false);
        }
      }
    }
  });

  it('also for headers made of the converter names and DwC terms (the shared proposer does not know them)', () => {
    const header = ['occurrenceID', 'eventID', 'scientificName', 'individualCount', 'organismQuantity', 'organismQuantityType', 'minimumDepthInMeters', 'maximumDepthInMeters', 'lifeStage', 'identificationQualifier', 'Species', 'Taxon', 'Count', 'Abundance', 'Density', 'Biomass', 'Volume filtered [m3]', 'Depth top', 'Depth bottom', 'Gatunek', 'Art', 'Espèce'];
    const p = proposeColumns(rawSheet(header, [header.map((_, i) => (i % 2 === 0 ? 'x' : 3))]), { decimalComma: false, date1904: false });
    for (const x of p) {
      expect(CONVERTER_KINDS, x.header).not.toContain(x.role.kind);
      if (x.role.kind === 'depth') expect('bound' in x.role, x.header).toBe(false);
    }
  });

  it('the proposals over the fixtures are exactly those of the commit in production (fb314bb)', () => {
    // the reason codes are new fields of the proposals (reasonCode, reasonParams, reasonLead, reasonNotes); everything else is as in production
    const withoutCodes = JSON.stringify(allProposals(), (k, v) => (k === 'reasonCode' || k === 'reasonParams' || k === 'reasonLead' || k === 'reasonNotes' ? undefined : v));
    const digest = createHash('sha256').update(withoutCodes).digest('hex');
    expect(digest).toBe('fd8ef9b2d239860d0e2ea4ad6022093fcd44e39275fdcc3d8ea795519a9ff80a');
  });
});

describe('the new role kinds are inert in /check', () => {
  const converterRoles: ColumnRole[] = [
    { kind: 'taxon' },
    { kind: 'taxon', header: true },
    { kind: 'quantity' },
    { kind: 'quantityType' },
    { kind: 'effort', unit: 'm3' },
    { kind: 'occurrenceId' },
    { kind: 'lifeStage' },
    { kind: 'qualifier' },
    { kind: 'taxonId', aphia: true },
    { kind: 'depth', positive: 'down', bound: 'max' },
  ];

  it('specsOf skips taxon, quantity and effort columns (and the rest): they never become variables, so no ROW-UNIT-MISSING', () => {
    const m: SheetMapping = { sheet: 'S', columns: converterRoles.slice(0, 8).map((role, index) => ({ index, header: `c${index}`, role })) };
    const s = specsOf(m);
    expect(s.vars).toEqual([]);
    expect(Object.keys(s).sort()).toEqual(['vars']);
  });

  it('a depth with a bound is still the depth slot of /check (first wins), as before', () => {
    const s = specsOf({ sheet: 'S', columns: [{ index: 0, header: 'd', role: { kind: 'depth', positive: 'down', bound: 'max' } }] });
    expect(s.depth).toMatchObject({ index: 0, positive: 'down' });
  });

  it('buildDataset with such a mapping builds no variables and raises no unit finding; the clean CSV and sidecar write nothing for them', () => {
    const file: ParsedFile = {
      fileName: 'x.csv',
      kind: 'csv',
      sheets: [rawSheet(['Station', 'Latitude', 'Longitude', 'Date', 'Calanus', 'Count', 'Vol'], [['S1', 55.5, 2.5, '2020-01-01', 4, 3, 12.5], ['S2', 55.6, 2.6, '2020-01-02', 5, 1, 13]], 'S')],
      date1904: false,
      decimalComma: false,
      encoding: 'utf-8',
      findings: [],
    };
    const layout = proposeLayout(file);
    const base = proposeMappings(file, layout)[0];
    const roleFor = (h: string): ColumnRole => (h === 'Calanus' ? { kind: 'taxon', header: true } : h === 'Count' ? { kind: 'quantity' } : h === 'Vol' ? { kind: 'effort', unit: 'm3' } : (base.columns.find((c) => c.header === h)!.role));
    const mapping: SheetMapping = { sheet: 'S', columns: base.columns.map((c) => ({ ...c, role: roleFor(c.header) })) };
    const { dataset, findings } = buildDataset(file, layout, [mapping], [], 'ds');
    expect(dataset.variables).toEqual([]);
    expect(findings.filter((f) => f.ruleId === 'ROW-UNIT-MISSING')).toEqual([]);
    const out = toCleanCsv(dataset);
    expect(out.csv.split('\n')[0]).not.toMatch(/Calanus|Count|Vol/);
    expect(out.sidecar).not.toMatch(/Calanus|Count|Vol/);
  });

  it('the role dropdown of /check lists the same kinds as before, none of the new ones, and no tip lists them', () => {
    // 'hemisphere' is a /check role too (a column of N/S/E/W letters that signs the coordinate); it is not a converter-only kind
    expect([...ROLE_KINDS]).toEqual(['ignore', 'latitude', 'longitude', 'hemisphere', 'datetime', 'date', 'time', 'depth', 'pressure', 'station', 'cruise', 'sampleId', 'variable']);
    for (const k of CONVERTER_KINDS) {
      expect(ROLE_KINDS as readonly string[]).not.toContain(k);
      expect(Object.keys(ROLE_FEEDS)).not.toContain(k);
    }
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// A sum or total column is proposed as "ignore" on /convert (converting it would count the same individuals twice), has its reason in four languages and
// an ⓘ, and never reaches the archive unless the user chooses a meaning for it.
import { describe, expect, it } from 'vitest';
import { proposeConvertColumns, OVERLAY_REASONS } from '../../src/core/convert/recognize';
import { UI } from '../../src/core/i18n/ui';
import { TIPS } from '../../src/app/tips';
import { LANGS } from '../../src/core/types';
import { rawSheet } from '../helpers/files';
import { CTX } from './helpers';
import { exportSheet } from './exportHelpers';

const SUMMARY_HEADERS = ['Suma', 'Total', 'Razem', 'Summe', 'Gesamt', 'Somme', 'Sum', 'Σ', 'Total copepods', 'Razem Copepoda', 'suma'];

const proposals = (extra: string) => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Oithona similis', extra];
  return proposeConvertColumns(rawSheet(header, [['S1', 55, 3, '2020-01-01', 4, 6, 10], ['S2', 56, 3, '2020-01-02', 2, 1, 3]]), CTX);
};

describe('sum and total columns default to ignore', () => {
  for (const h of SUMMARY_HEADERS) {
    it(`"${h}" is proposed as ignore, at low confidence, with the converter's reason`, () => {
      const p = proposals(h).find((x) => x.header === h)!;
      expect(p.role).toEqual({ kind: 'ignore' });
      expect(p.confidence).toBe('low');
      expect(p.reasonCode).toBe('summary-total');
      expect(p.reason).toBe(OVERLAY_REASONS['summary-total']);
    });
  }

  it('the species columns next to it are still taxon candidates, and a non-summary numeric column is still one too', () => {
    const p = proposals('Suma');
    expect(p.find((x) => x.header === 'Calanus finmarchicus')?.role).toEqual({ kind: 'taxon', header: true });
    expect(proposals('Temora longicornis').find((x) => x.header === 'Temora longicornis')?.role).toEqual({ kind: 'taxon', header: true });
  });

  it('a name that merely contains letters of a summary word is not one ("Totalia sp." is a genus, "Summa" is not in the list)', () => {
    expect(proposals('Totalia sp.').find((x) => x.header === 'Totalia sp.')?.role).toEqual({ kind: 'taxon', header: true });
    expect(proposals('Summa').find((x) => x.header === 'Summa')?.reasonCode).not.toBe('summary-total');
  });

  it('a column the shared proposer reads as a standard measured variable keeps its proposal (the rule only moves a variable it would call unknown)', () => {
    const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temperature [°C]'];
    const p = proposeConvertColumns(rawSheet(header, [['S1', 55, 3, '2020-01-01', 4, 7.1], ['S2', 56, 3, '2020-01-02', 2, 7.4]]), CTX).find((x) => x.header === 'Temperature [°C]')!;
    expect(p.role.kind).toBe('variable');
    expect(p.reasonCode).not.toBe('summary-total');
  });

  it('has its reason in all four languages (never English in pl, de or fr) and an ⓘ that exists in all four', () => {
    const key = 'convert.reason.summary-total' as const;
    expect(UI.en[key]).toBe(OVERLAY_REASONS['summary-total']);
    expect(UI.en[key]).toContain('count the same individuals twice');
    for (const lang of ['pl', 'de', 'fr'] as const) expect(UI[lang][key], lang).not.toBe(UI.en[key]);
    expect(TIPS.convertSummaryColumn.label).toBe('convert.summary.column');
    for (const lang of LANGS) for (const k of ['tip.convertSummaryColumn.does', 'tip.convertSummaryColumn.logic'] as const) expect(UI[lang][k].length, `${lang} ${k}`).toBeGreaterThan(40);
  });
});

describe('it never reaches the archive unless the user chooses a meaning for it', () => {
  const header = ['Station', 'Latitude', 'Longitude', 'Date', 'Sample', 'Calanus finmarchicus', 'Oithona similis', 'Suma'];
  const rows = [
    ['S1', 55.5, 2.5, '2023-06-14', 'S1-a', 10, 5, 15],
    ['S2', 55.9, 3.1, '2023-06-16', 'S2-a', 7, 4, 11],
  ];

  it('with the proposed role (ignore): not in the occurrences, the measurements or any file of the archive', async () => {
    const e = await exportSheet(header, rows, { quantity: { kind: 'count' } });
    expect(e.result.occurrences.map((o) => o.verbatimIdentification).sort()).toEqual(['Calanus finmarchicus', 'Calanus finmarchicus', 'Oithona similis', 'Oithona similis']);
    expect(e.result.occurrences.some((o) => o.verbatimIdentification === 'Suma')).toBe(false);
    expect(e.dataset.measurements.some((m) => /suma/i.test(m.type) || m.value === '15' || m.value === '11')).toBe(false);
    for (const f of e.files) expect(new TextDecoder().decode(f.data), f.name).not.toMatch(/Suma/);
    // the six occurrences' counts are all there, so nothing was counted twice
    expect(e.result.occurrences.map((o) => o.individualCount).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(26);
  });

  it('with a meaning the user chose by hand it is their decision: as a species column it is converted; as a measured variable the page says it is not written', async () => {
    const taxon = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { Suma: { kind: 'taxon', header: true } } });
    expect(taxon.result.occurrences.some((o) => o.verbatimIdentification === 'Suma')).toBe(true);
    const variable = await exportSheet(header, rows, { quantity: { kind: 'count' }, edit: { Suma: { kind: 'variable', variable: 'suma', unit: 'ind' } } });
    expect(variable.result.occurrences.some((o) => o.verbatimIdentification === 'Suma')).toBe(false);
    const said = variable.findings.find((f) => f.ruleId === 'CONV-COLUMN-NOT-EXPORTED');
    expect(said).toMatchObject({ severity: 'warning', params: { count: 1, columns: 'Suma' } });
    for (const f of variable.files) expect(new TextDecoder().decode(f.data), f.name).not.toMatch(/Suma/);
  });
});

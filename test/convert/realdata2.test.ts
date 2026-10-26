// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 7, review round on the real PANGAEA files: round brackets, a stage in a remark, a remark after a comma, a careful reading of the Parameter(s) block, a lone depth bound and
// the label written as measurementType. Every value is INVENTED; no third-party data is in this repository.
import { describe, expect, it } from 'vitest';
import { convert } from '../../src/core/convert/build';
import { pangaeaNamesUsed, stripHeaderUnit, taxonColumnNames } from '../../src/core/convert/headers';
import { TIP_TEXTS } from '../../src/core/i18n/tips-text';
import { UI } from '../../src/core/i18n/ui';
import { measurementTypeText } from '../../src/core/convert/nerc';
import { parsePangaeaParameter } from '../../src/core/convert/pangaeaHeader';
import { judge } from '../../src/core/convert/policy';
import { proposeConvertMapping } from '../../src/core/convert/recognize';
import { readConvertFile } from '../../src/core/convert/read';
import { distinctSplits, splitTaxon } from '../../src/core/convert/taxon';
import { parsePangaeaText } from '../../src/core/parse/pangaea';
import { renderConvertPlain } from '../../src/core/rules/convert';
import type { ParsedFile } from '../../src/core/types';
import { LANGS } from '../../src/core/types';
import { fileOf, sheetInput } from './helpers';
import type { Cell } from './helpers';

const QUANTITY = { kind: 'density' as const, unit: '#/m3' };
const PI = 'PI: Doe, Jane (jane@example.org)';
const ruleIds = (r: { findings: { ruleId: string }[] }): string[] => r.findings.map((f) => f.ruleId);
const approveAll = (sheets: Parameters<typeof convert>[0]['sheets']) => {
  const first = convert({ sheets, options: {} });
  return convert({ sheets, options: {}, approvedSplits: Object.fromEntries(first.splits.filter((s) => s.needsDecision).map((s) => [s.verbatim, s.proposed])) });
};

interface Param {
  line: string;
  header: string;
}
const pangaea = (params: Param[], rows: Cell[][]): string =>
  [
    '/* DATA DESCRIPTION:',
    'Citation:\tDoe, Jane (2099): Invented counts [dataset]. PANGAEA, https://doi.org/10.1594/PANGAEA.000000, ',
    `Parameter(s):\t${params[0].line}`,
    ...params.slice(1).map((p) => `\t${p.line}`),
    'License:\tCreative Commons Attribution 3.0 Unported (CC-BY-3.0) (URI: https://creativecommons.org/licenses/by/3.0/)',
    '',
    '*/',
    params.map((p) => p.header).join('\t'),
    ...rows.map((r) => r.map((c) => (c === null ? '' : String(c))).join('\t')),
  ].join('\n') + '\n';
const HEAD: Param[] = [
  { line: 'Event label (Event)', header: 'Event' },
  { line: 'Date/Time of event (Date/Time)', header: 'Date/Time' },
  { line: 'Latitude of event (Latitude)', header: 'Latitude' },
  { line: 'Longitude of event (Longitude)', header: 'Longitude' },
];
const read = (text: string): ParsedFile => readConvertFile(parsePangaeaText(text, 'n.tab'), text);

describe('round brackets in a header', () => {
  it('a round-bracket unit is stripped like a square one; a subgenus is kept', () => {
    expect(stripHeaderUnit('Oithona similis (ind/m3)')).toEqual({ name: 'Oithona similis', unit: 'ind/m3' });
    expect(stripHeaderUnit('Oithona similis (#/m**3)')).toEqual({ name: 'Oithona similis', unit: '#/m**3' });
    expect(stripHeaderUnit('Calanus finmarchicus (mg m-3)')).toEqual({ name: 'Calanus finmarchicus', unit: 'mg m-3' });
    expect(stripHeaderUnit('Sagitta (Parasagitta) elegans')).toEqual({ name: 'Sagitta (Parasagitta) elegans' });
    expect(stripHeaderUnit('Calanus (Calanus) finmarchicus [#/m3]')).toEqual({ name: 'Calanus (Calanus) finmarchicus', unit: '#/m3' });
    expect(stripHeaderUnit('Sagitta elegans (Parasagitta)')).toEqual({ name: 'Sagitta elegans (Parasagitta)' });
    expect(stripHeaderUnit('Calanus finmarchicus (c5)')).toEqual({ name: 'Calanus finmarchicus (c5)' });
  });

  it('a column with a round-bracket unit and one with a subgenus convert under the right names', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis (ind/m3)', 'Sagitta (Parasagitta) elegans (ind/m3)'];
    const r = approveAll([sheetInput(fileOf(header, [['A', 55, 2, '2023-06-14', 4, 5]]), { quantity: QUANTITY })]);
    expect(r.occurrences.map((o) => [o.scientificName, o.id])).toEqual([
      ['Oithona similis', 'A:Oithona similis'],
      ['Sagitta (Parasagitta) elegans', 'A:Sagitta (Parasagitta) elegans'],
    ]);
  });

  it('a stage in the remark after the unit is the stage of that column: two columns of one taxon (c4, c5) are two names, with their own lifeStage, and no remark', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus [#/m**3] (c4)', 'Calanus finmarchicus [#/m**3] (c5)'];
    const sheet = () => sheetInput(fileOf(header, [['A', 55, 2, '2023-06-14', 4, 5]]), { quantity: QUANTITY });
    const first = convert({ sheets: [sheet()], options: {} });
    expect(first.splits.map((s) => s.verbatim)).toEqual(['Calanus finmarchicus, c4', 'Calanus finmarchicus, c5']);
    expect(first.splits.every((s) => s.needsDecision)).toBe(true);
    const r = approveAll([sheet()]);
    expect(r.occurrences.map((o) => [o.id, o.lifeStage, o.occurrenceRemarks])).toEqual([
      ['A:Calanus finmarchicus, c4', 'C4', undefined],
      ['A:Calanus finmarchicus, c5', 'C5', undefined],
    ]);
    expect(ruleIds(r)).not.toContain('CONV-TAXON-SAME-EVENT');
  });

  it('the same for a PANGAEA parameter whose comment is a stage', () => {
    const text = pangaea(
      [
        ...HEAD,
        { line: `Calanus finmarchicus [#/m**3] (C. fin) * ${PI} * COMMENT: c4`, header: 'C. fin [#/m**3] (c4)' },
        { line: `Calanus finmarchicus [#/m**3] (C. fin) * ${PI} * COMMENT: c5`, header: 'C. fin [#/m**3] (c5)' },
      ],
      [['E1', '2099-01-01T11:05', 71, 10.5, 3, 4]],
    );
    const file = read(text);
    const names = taxonColumnNames(file, file.sheets[0], [4, 5].map((i) => ({ index: i, header: file.sheets[0].header[i] })));
    expect([...names.values()].map((n) => [n.verbatim, n.remark])).toEqual([
      ['Calanus finmarchicus, c4', undefined],
      ['Calanus finmarchicus, c5', undefined],
    ]);
  });
});

describe('a remark after a comma', () => {
  it('"Foraminifera, planktic": a comma remark that is no stage, qualifier or sex needs a decision, with its reason; the exact text stays in verbatimIdentification', () => {
    const e = distinctSplits(['Foraminifera, planktic', 'Oithona similis, c2', 'Calanus, f']);
    expect(e.map((x) => [x.verbatim, x.needsDecision, x.doubt])).toEqual([
      ['Foraminifera, planktic', true, 'remark'],
      ['Oithona similis, c2', true, undefined],
      ['Calanus, f', true, undefined],
    ]);
    const sheet = sheetInput(fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Foraminifera, planktic'], [['A', 55, 2, '2023-06-14', 4]]), { quantity: QUANTITY });
    expect(ruleIds(convert({ sheets: [sheet], options: {} }))).toContain('CONV-SPLIT-UNDECIDED');
    const done = convert({ sheets: [sheet], options: {}, approvedSplits: { 'Foraminifera, planktic': { verbatimIdentification: 'Foraminifera, planktic', scientificName: 'Foraminifera' } } });
    expect(ruleIds(done)).not.toContain('CONV-SPLIT-UNDECIDED');
    expect(done.occurrences.map((o) => [o.scientificName, o.verbatimIdentification])).toEqual([['Foraminifera', 'Foraminifera, planktic']]);
    for (const lang of LANGS) expect(UI[lang]['convert.doubt.remark']).toMatch(/\S/);
  });

  it('a range written with spaces splits like the one without', () => {
    expect(splitTaxon('Calanus finmarchicus c1 - c5')).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C1-C5' });
    expect(splitTaxon('Calanus finmarchicus, c1 – c5')).toMatchObject({ scientificName: 'Calanus finmarchicus', lifeStage: 'C1-C5' });
    expect(splitTaxon('Calanus finmarchicus c1 - c5').verbatimIdentification).toBe('Calanus finmarchicus c1 - c5');
  });
});

describe('the Parameter(s) block, read with care', () => {
  it('a comment that holds " * " is whole, and an abbreviation with brackets of its own is read', () => {
    expect(parsePangaeaParameter('Temperature, water [°C] (Temp (ITS-90)) * PI: X * METHOD/DEVICE: CTD * COMMENT: ITS-90 * scale of 1990 * checked')).toEqual({
      name: 'Temperature, water',
      unit: '°C',
      short: 'Temp (ITS-90)',
      comment: 'ITS-90 * scale of 1990 * checked',
    });
    expect(parsePangaeaParameter('Depth, water [m] (Depth water) * GEOCODE')).toEqual({ name: 'Depth, water', unit: 'm', short: 'Depth water' });
    expect(parsePangaeaParameter('Salinity (Sal) * PI: X * COMMENT: PSU * GEOCODE')).toEqual({ name: 'Salinity', short: 'Sal', comment: 'PSU' });
  });

  it('a nested abbreviation still matches its column, and the long names are used', () => {
    const text = pangaea([...HEAD, { line: `Calanus finmarchicus, c2 [#/m**3] (C. fin (c2)) * ${PI}`, header: 'C. fin (c2) [#/m**3]' }], [['E1', '2099-01-01T11:05', 71, 10.5, 3]]);
    const file = read(text);
    expect(pangaeaNamesUsed(file, file.sheets[0])).toBe(true);
    expect(taxonColumnNames(file, file.sheets[0], [{ index: 4, header: file.sheets[0].header[4] }]).get(4)?.verbatim).toBe('Calanus finmarchicus, c2');
  });

  it('when the list cannot be matched the abbreviations are used and an info line says so; when it matches there is none', () => {
    const text = pangaea([...HEAD, { line: `Acartia sp., c1 [#/m**3] (Acartia c1) * ${PI}`, header: 'Acartia c1 [#/m**3]' }], [['E1', '2099-01-01T11:05', 71, 10.5, 3]]);
    const file = read(text);
    const cut: ParsedFile = { ...file, pangaeaParameters: file.pangaeaParameters!.slice(0, 3) };
    const sheet = (f: ParsedFile) => ({ file: f, sheet: f.sheets[0].name, mapping: proposeConvertMapping(f.sheets[0], { decimalComma: false, date1904: false }), shape: 'wide' as const, quantity: QUANTITY });
    const bad = convert({ sheets: [sheet(cut)], options: {} });
    const f = bad.findings.find((x) => x.ruleId === 'CONV-PANGAEA-NAMES-FALLBACK')!;
    expect(f.severity).toBe('info');
    expect(judge(bad.findings).showOnly.map((x) => x.ruleId)).toContain('CONV-PANGAEA-NAMES-FALLBACK');
    for (const lang of LANGS) expect(renderConvertPlain(f, lang), lang).not.toMatch(/[{}]/);
    expect(bad.splits.map((s) => s.verbatim)).toContain('Acartia c1');
    expect(convert({ sheets: [sheet(file)], options: {} }).findings.some((x) => x.ruleId === 'CONV-PANGAEA-NAMES-FALLBACK')).toBe(false);
    // a CSV never raises it
    const csv = sheetInput(fileOf(['Sample', 'Latitude', 'Longitude', 'Date', 'Oithona similis'], [['A', 55, 2, '2023-06-14', 4]]), { quantity: QUANTITY });
    expect(convert({ sheets: [csv], options: {} }).findings.some((x) => x.ruleId === 'CONV-PANGAEA-NAMES-FALLBACK')).toBe(false);
  });
});

describe('a sheet with only one depth bound', () => {
  const eventOf = (header: string[], row: Cell[]) => approveAll([sheetInput(fileOf(header, [row]), { quantity: QUANTITY })]).events.find((e) => e.eventType === 'sample')!;
  it('only a bottom gives the maximum, only a top gives the minimum; the other end is never made up; one plain depth is both', () => {
    const base = ['Sample', 'Latitude', 'Longitude', 'Date'];
    const bot = eventOf([...base, 'Depth bot [m]', 'Ctenophora'], ['A', 55, 2, '2023-06-14', 25, 3]);
    expect([bot.depthMin, bot.depthMax]).toEqual([undefined, 25]);
    const top = eventOf([...base, 'Depth top [m]', 'Ctenophora'], ['A', 55, 2, '2023-06-14', 5, 3]);
    expect([top.depthMin, top.depthMax]).toEqual([5, undefined]);
    const one = eventOf([...base, 'Depth [m]', 'Ctenophora'], ['A', 55, 2, '2023-06-14', 7, 3]);
    expect([one.depthMin, one.depthMax]).toEqual([7, 7]);
    const both = eventOf([...base, 'Depth top [m]', 'Depth bot [m]', 'Ctenophora'], ['A', 55, 2, '2023-06-14', 0, 25, 3]);
    expect([both.depthMin, both.depthMax]).toEqual([0, 25]);
    for (const lang of LANGS) expect(TIP_TEXTS[lang]['tip.convertDepthBound.logic'], lang).toMatch(/\S/);
    expect(TIP_TEXTS.en['tip.convertDepthBound.logic']).toContain('only a minimum depth');
  });
});

describe('a label written as measurementType', () => {
  it('a line or paragraph separator or a NEL in an NVS label is not written; the variable name stands', () => {
    const pick = (label: string) => ({ id: 'http://vocab.nerc.ac.uk/collection/P01/current/ZZTESTC1/', source: 'nvs' as const, deprecated: false as const, label });
    for (const bad of ['two lines', 'two\u0085lines', 'a b', 'tab\there', 'vt\u000bx', 'ff\u000cx', 'del\u007fx', 'c1\u0090x']) {
      expect(measurementTypeText(pick(bad), 'chlorophyll'), JSON.stringify(bad)).toBe('chlorophyll');
    }
    expect(measurementTypeText(pick('An invented label'), 'chlorophyll')).toBe('An invented label');
  });
});

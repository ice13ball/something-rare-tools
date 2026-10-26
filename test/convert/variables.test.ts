// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Stage 5, Part B1 and B2: the measured-variable columns of a converted sheet become eMoF rows on the SAMPLE event, and a NERC identifier is written only for what the
// user confirmed for that column. Synthetic data only.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preferredLabel } from '../../src/app/convertModel';
import { judge, policyOf } from '../../src/core/convert/policy';
import { P01_URI, P06_URI, conceptUri, measurementTypeText, readDecision, readPick, suggestType, suggestUnit, suggestedPick } from '../../src/core/convert/nerc';
import type { NercDecisions } from '../../src/core/convert/nerc';
import { P06, VARIABLE_CONCEPTS, VARIABLE_UNITS, VARIABLE_VERIFIED_CODES, foldUnit, nercUri, unitConcept } from '../../src/core/convert/vocab';
import { renderConvertPlain } from '../../src/core/rules/convert';
import { LANGS } from '../../src/core/types';
import { exportSheet, objects, readBack } from './exportHelpers';
import type { ExportOptions } from './exportHelpers';
import { W1_HEADER, W1_ROWS } from './helpers';
import type { Cell } from './helpers';

const HEADER = [...W1_HEADER, 'Temperature [°C]', 'Salinity [PSU]', 'Oxygen [µmol/L]'];
const ROWS: Cell[][] = [
  [...W1_ROWS[0], 7.25, 34.8, 310],
  [...W1_ROWS[1], '6.9', 'NA', 'low'],
  [...W1_ROWS[2], null, 35.1, 295.5],
];
const ix = (name: string): number => HEADER.indexOf(name);
const uri = (c: 'P01' | 'P06', code: string): string => nercUri(c, code);
const pick = (c: 'P01' | 'P06', code: string, source: 'suggested' | 'nvs' = 'suggested') => ({ id: uri(c, code), source, deprecated: false as const });

const TEMP_LABEL = 'Temperature of the water body';
const OXY_LABEL = 'Concentration of oxygen {O2 CAS 7782-44-7} per unit volume of the water body [dissolved plus reactive particulate phase]';
const CHL_LABEL = 'Concentration of chlorophyll-a {chl-a CAS 479-61-8} per unit volume of the water body [particulate >unknown phase]';

const run = (nerc?: NercDecisions, extra: Partial<ExportOptions> = {}) => exportSheet(HEADER, ROWS, { quantity: { kind: 'count' }, fullList: true, device: { kind: 'known', key: 'bongo' }, ...(nerc ? { nerc } : {}), ...extra });
const emof = async (e: Awaited<ReturnType<typeof run>>) => objects((await readBack(e.zip)).tables['extendedmeasurementorfact.txt']);

describe('B1: a variable column is one eMoF row per sample event', () => {
  it('writes the variable name, the value as in the source, the unit as given, on the sample event with no occurrenceID; no ID without a confirmation', async () => {
    const e = await run();
    const rows = (await emof(e)).filter((m) => ['temperature', 'salinity', 'oxygen'].includes(m.measurementType));
    expect(rows.map((m) => [m.eventID, m.occurrenceID, m.measurementType, m.measurementValue, m.measurementUnit, m.measurementTypeID, m.measurementUnitID])).toEqual([
      ['S1-a', '', 'temperature', '7.25', '°C', '', ''],
      ['S1-a', '', 'salinity', '34.8', 'PSU', '', ''],
      ['S1-a', '', 'oxygen', '310', 'µmol/L', '', ''],
      ['S1-b', '', 'temperature', '6.9', '°C', '', ''],
      ['S2-a', '', 'salinity', '35.1', 'PSU', '', ''],
      ['S2-a', '', 'oxygen', '295.5', 'µmol/L', '', ''],
    ]);
    // the event of every row is a sample event of the archive
    const events = new Set(objects((await readBack(e.zip)).tables['event.txt']).filter((x) => x.eventType === 'sample').map((x) => x.eventID));
    for (const m of rows) expect(events.has(m.eventID)).toBe(true);
  });

  it('a text cell ("low"), an empty cell and an NA write no row; the text is reported as ROW-NON-NUMERIC (a warning to accept) and the NA is not a measurement', async () => {
    const e = await run();
    const rows = (await emof(e)).filter((m) => m.measurementType === 'oxygen');
    expect(rows.map((m) => m.eventID)).toEqual(['S1-a', 'S2-a']);
    const f = e.findings.filter((x) => x.ruleId === 'ROW-NON-NUMERIC' && x.field === 'Oxygen [µmol/L]');
    expect(f.length).toBe(1);
    expect(f[0].value).toBe('low');
    expect(policyOf(f[0])).toBe('accept');
    expect(e.findings.some((x) => x.ruleId === 'ROW-NON-NUMERIC' && x.field === 'Salinity [PSU]')).toBe(false);
  });

  it('a variable written this way is no longer in CONV-COLUMN-NOT-EXPORTED; a pressure column still is', async () => {
    const withPressure = await exportSheet([...HEADER, 'Pressure [dbar]'], ROWS.map((r, i) => [...r, 5 + i]), { quantity: { kind: 'count' }, fullList: true, device: { kind: 'known', key: 'bongo' } });
    const f = withPressure.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED');
    expect(f?.params.columns).toContain('Pressure [dbar]');
    expect(f?.params.columns).not.toMatch(/Temperature|Salinity|Oxygen/);
    expect(withPressure.result.measurements.filter((m) => m.role === 'variable').length).toBe(6);
    const without = await run();
    expect(String(without.findings.find((x) => x.ruleId === 'CONV-COLUMN-NOT-EXPORTED')?.params.columns ?? '')).not.toMatch(/Temperature|Salinity|Oxygen/); // (the volume column is named: no sample size was declared)
  });

  it('is written from the source text: a decimal comma becomes a point, nothing is rounded or converted, and the unit is the column\'s own (the one the mapping table shows and the user can edit)', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temperature [degC]'], [['A', '55,5', '2,5', '2023-06-14', '4', '7,250']], { quantity: { kind: 'count' }, decimalComma: true });
    const m = e.result.measurements.find((x) => x.role === 'variable');
    expect(m).toMatchObject({ measurementType: 'temperature', measurementValue: '7.250', measurementUnit: '°C' });
    // a decimal comma in a file that is not decimal-comma is text, not a number: no row, and it is said
    const dot = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'Temperature [degC]'], [['A', 55.5, 2.5, '2023-06-14', 4, '7,250']], { quantity: { kind: 'count' } });
    expect(dot.result.measurements.some((x) => x.role === 'variable')).toBe(false);
    expect(dot.findings.some((f) => f.ruleId === 'ROW-NON-NUMERIC' && f.field === 'Temperature [degC]')).toBe(true);
  });

  it('a long sheet repeats the sample on every row: the same value is one row, another value is a blocking conflict', () => {
    const header = ['Sample', 'Latitude', 'Longitude', 'Date', 'Species', 'Count', 'Temperature [°C]'];
    const same = [['A', 55, 2, '2023-06-14', 'Calanus finmarchicus', 4, 7.1], ['A', 55, 2, '2023-06-14', 'Oithona similis', 9, 7.1]];
    const other = [['A', 55, 2, '2023-06-14', 'Calanus finmarchicus', 4, 7.1], ['A', 55, 2, '2023-06-14', 'Oithona similis', 9, 7.2]];
    return Promise.all([
      exportSheet(header, same, { quantity: { kind: 'count' }, shape: 'long' }),
      exportSheet(header, other, { quantity: { kind: 'count' }, shape: 'long' }),
    ]).then(([a, b]) => {
      expect(a.result.measurements.filter((m) => m.role === 'variable').length).toBe(1);
      expect(a.findings.some((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT')).toBe(false);
      const c = b.findings.find((f) => f.ruleId === 'CONV-SAMPLE-CONFLICT');
      expect(c?.params.what).toContain('measured value');
      expect(policyOf(c!)).toBe('block');
    });
  });

  it('a tab or a line break in a variable name or unit blocks (the file is tab-separated)', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'X'], [['A', 55, 2, '2023-06-14', 4, 1]], { quantity: { kind: 'count' }, edit: { X: { kind: 'variable', variable: 'a\tb', unit: 'x\ny' } } });
    expect(e.findings.some((f) => f.ruleId === 'CONV-TAB-IN-VALUE')).toBe(true);
    expect(judge(e.findings).blocking.map((f) => f.ruleId)).toContain('CONV-TAB-IN-VALUE');
  });
});

describe('B2: an identifier is written only for what the user confirmed, per column', () => {
  it('with nothing confirmed: no ID anywhere, CONV-NERC-UNKNOWN names the variables and CONV-UNIT-NO-P06 each unit; both are accept warnings, neither blocks', async () => {
    const e = await run();
    const unknown = e.findings.filter((f) => f.ruleId === 'CONV-NERC-UNKNOWN');
    expect(unknown.length).toBe(1);
    expect(unknown[0].params.what).toBe('temperature, salinity, oxygen');
    const units = e.findings.filter((f) => f.ruleId === 'CONV-UNIT-NO-P06').map((f) => f.params.unit);
    expect(units).toEqual(['°C', 'PSU', 'µmol/L']);
    for (const f of [...unknown, ...e.findings.filter((x) => x.ruleId === 'CONV-UNIT-NO-P06')]) expect(policyOf(f)).toBe('accept');
    expect(judge(e.findings).blocking).toEqual([]);
    for (const m of e.result.measurements.filter((x) => x.role === 'variable')) {
      expect(m.measurementTypeId).toBeUndefined();
      expect(m.measurementUnitId).toBeUndefined();
    }
    // the names are the user's own text (often English words): each stands in the quotation marks of the language, so that they read as names
    const marks = { en: ['"', '"'], pl: ['„', '”'], de: ['„', '“'], fr: ['« ', ' »'] } as const;
    for (const lang of LANGS) {
      const [o, c] = marks[lang];
      expect(renderConvertPlain(unknown[0], lang), lang).toContain(`${o}temperature${c}, ${o}salinity${c}, ${o}oxygen${c}`);
    }
    // the quantity of a sheet is put into the language instead (no quotes, no English)
    const quantity = { ruleId: 'CONV-NERC-UNKNOWN', severity: 'warning' as const, params: { what: 'density per area of the water column' } };
    expect(renderConvertPlain(quantity, 'pl')).toContain('zagęszczenia na powierzchnię słupa wody');
    expect(renderConvertPlain(quantity, 'pl')).not.toMatch(/density|water column/);
  });

  it('a confirmed type and unit are written for THAT column only; the others stay without an ID and keep their warning', async () => {
    const nerc: NercDecisions = { [String(ix('Temperature [°C]'))]: { type: pick('P01', 'TEMPPR01'), unit: pick('P06', 'UPAA') } };
    const e = await run(nerc);
    const rows = (await emof(e)).filter((m) => ['temperature', TEMP_LABEL, 'salinity', 'oxygen'].includes(m.measurementType));
    expect(rows.length).toBe(6);
    for (const m of rows) {
      if (m.measurementTypeID === uri('P01', 'TEMPPR01')) expect([m.measurementType, m.measurementUnitID]).toEqual([TEMP_LABEL, uri('P06', 'UPAA')]);
      else expect([m.measurementTypeID, m.measurementUnitID]).toEqual(['', '']); // an unconfirmed column keeps the variable name
    }
    expect(rows.filter((m) => m.measurementType === 'temperature')).toEqual([]);
    expect(e.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')?.params.what).toBe('salinity, oxygen');
    expect(e.findings.filter((f) => f.ruleId === 'CONV-UNIT-NO-P06').map((f) => f.params.unit)).toEqual(['PSU', 'µmol/L']);
    expect(e.result.stats.nerc).toEqual({ columns: 3, typeIds: 1, unitIds: 1, nvsIds: 0 });
  });

  it('confirming every column removes both warnings, and the measurementType is the English label of the confirmed concept (not the variable name)', async () => {
    const nerc: NercDecisions = {
      [String(ix('Temperature [°C]'))]: { type: pick('P01', 'TEMPPR01'), unit: pick('P06', 'UPAA') },
      [String(ix('Salinity [PSU]'))]: { type: pick('P01', 'PSLTZZ01'), unit: pick('P06', 'PSUX') },
      [String(ix('Oxygen [µmol/L]'))]: { type: pick('P01', 'DOXYZZXX'), unit: pick('P06', 'UPOX', 'nvs') },
    };
    const e = await run(nerc);
    expect(e.findings.some((f) => f.ruleId === 'CONV-NERC-UNKNOWN' || f.ruleId === 'CONV-UNIT-NO-P06')).toBe(false);
    const rows = await emof(e);
    expect(rows.filter((m) => m.measurementTypeID === uri('P01', 'DOXYZZXX')).map((m) => m.measurementType)).toEqual([OXY_LABEL, OXY_LABEL]);
    expect(rows.filter((m) => m.measurementTypeID === uri('P01', 'TEMPPR01')).every((m) => m.measurementType === TEMP_LABEL)).toBe(true);
    expect(rows.filter((m) => m.measurementTypeID === uri('P01', 'PSLTZZ01')).every((m) => m.measurementType === 'Practical salinity of the water body')).toBe(true);
    expect(rows.some((m) => ['temperature', 'salinity', 'oxygen'].includes(m.measurementType))).toBe(false);
    expect(e.result.stats.nerc).toEqual({ columns: 3, typeIds: 3, unitIds: 3, nvsIds: 1 });
  });

  it('the worker believes no pick it cannot check: a label, another collection, a deprecated or unflagged concept, an unverified "suggested" one, or a wrong-shaped code writes nothing', async () => {
    const t = String(ix('Temperature [°C]'));
    const bad: unknown[] = [
      { id: 'Temperature of the water body', source: 'suggested', deprecated: false },
      { id: uri('P06', 'UPAA'), source: 'suggested', deprecated: false }, // a unit as a type
      { id: 'http://vocab.nerc.ac.uk/collection/L22/current/NETT0176/', source: 'nvs', deprecated: false },
      { id: 'https://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/', source: 'nvs', deprecated: false }, // https: not the form written
      { id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01', source: 'nvs', deprecated: false }, // no trailing slash
      { id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/1/', source: 'nvs', deprecated: false },
      { id: 'http://vocab.nerc.ac.uk/collection/P01/current/temppr01/', source: 'nvs', deprecated: false },
      { id: 'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/\tx', source: 'nvs', deprecated: false },
      { id: 'http://evil.example/collection/P01/current/TEMPPR01/', source: 'nvs', deprecated: false },
      { id: uri('P01', 'TEMPPR01'), source: 'nvs', deprecated: true },
      { id: uri('P01', 'TEMPPR01'), source: 'nvs' }, // no flag: not said to be current
      { id: uri('P01', 'TEMPPR01'), source: 'nvs', deprecated: 'false' },
      { id: uri('P01', 'ABCDEFGH'), source: 'suggested', deprecated: false }, // not on the converter's verified list
      { id: uri('P01', 'TEMPPR01'), source: 'guess', deprecated: false },
      { id: 42, source: 'nvs', deprecated: false },
      null,
      'http://vocab.nerc.ac.uk/collection/P01/current/TEMPPR01/',
    ];
    for (const b of bad) {
      const e = await run({ [t]: { type: b } as never });
      expect(e.result.measurements.filter((m) => m.role === 'variable' && m.measurementType === 'temperature').every((m) => m.measurementTypeId === undefined), JSON.stringify(b)).toBe(true);
      expect(e.findings.find((f) => f.ruleId === 'CONV-NERC-UNKNOWN')?.params.what, JSON.stringify(b)).toContain('temperature');
    }
    // a type pick given as a unit, and the reverse
    const e = await run({ [t]: { unit: pick('P01', 'TEMPPR01') as never, type: pick('P06', 'UPAA') as never } });
    for (const m of e.result.measurements.filter((x) => x.role === 'variable')) expect([m.measurementTypeId, m.measurementUnitId]).toEqual([undefined, undefined]);
    // a decision of the page for a prototype key, a non-variable column or a missing column is nothing
    const odd = await run({ constructor: { type: pick('P01', 'TEMPPR01') }, __proto__: { type: pick('P01', 'TEMPPR01') }, [String(ix('Latitude'))]: { type: pick('P01', 'TEMPPR01') }, 99: { type: pick('P01', 'TEMPPR01') } } as unknown as NercDecisions);
    expect(odd.result.stats.nerc.typeIds).toBe(0);
  });

  it('a non-verified NVS pick with the right form IS written once confirmed (a real concept the user searched for), and the unit pick counts only for a column that has a unit text', async () => {
    const e = await exportSheet(['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'X'], [['A', 55, 2, '2023-06-14', 4, 1.5]], {
      quantity: { kind: 'count' },
      edit: { X: { kind: 'variable', variable: 'chlorophyll' } }, // no unit text
      nerc: { 5: { type: pick('P01', 'CPHLZZXX', 'nvs'), unit: pick('P06', 'UGPL', 'nvs') } },
    });
    const m = e.result.measurements.find((x) => x.role === 'variable');
    // CPHLZZXX is on the verified list, so its label is the list's, whatever the pick says
    expect(m).toMatchObject({ measurementType: CHL_LABEL, measurementTypeId: uri('P01', 'CPHLZZXX') });
    expect(m?.measurementUnitId).toBeUndefined();
    expect(m?.measurementUnit).toBeUndefined();
    // a variable with no unit is not a CONV-UNIT-NO-P06 (there is no unit to identify)
    expect(e.findings.some((f) => f.ruleId === 'CONV-UNIT-NO-P06')).toBe(false);
    expect(e.result.stats.nerc).toEqual({ columns: 1, typeIds: 1, unitIds: 0, nvsIds: 1 });
  });

  it('the pick helpers: readPick / readDecision / conceptUri accept exactly the forms the converter writes', () => {
    expect(P01_URI.test(uri('P01', 'TEMPPR01'))).toBe(true);
    expect(P06_URI.test(uri('P06', 'UPAA'))).toBe(true);
    expect(P01_URI.test(uri('P06', 'UPAA'))).toBe(false);
    expect(conceptUri('P01', 'TEMPPR01')).toBe(uri('P01', 'TEMPPR01'));
    expect(conceptUri('P01', 'TEMPPR0')).toBeUndefined();
    expect(conceptUri('P01', 'temppr01')).toBeUndefined();
    expect(conceptUri('P06', 'UPAA/../')).toBeUndefined();
    expect(readPick('P01', suggestedPick(VARIABLE_CONCEPTS.temperature[0].term))).toEqual({ id: uri('P01', 'TEMPPR01'), source: 'suggested', deprecated: false });
    expect(readDecision(undefined, 3)).toEqual({});
    expect(readDecision({ 3: { type: pick('P01', 'TEMPPR01'), unit: pick('P06', 'UPAA') } }, 3)).toEqual({ type: pick('P01', 'TEMPPR01'), unit: pick('P06', 'UPAA') });
    expect(readDecision({ 3: { type: pick('P01', 'TEMPPR01') } }, 4)).toEqual({});
  });
});

describe('Q5: what is proposed, what is only offered', () => {
  const T12 = ['PHOSKGD5', 'TCO2KG02', 'ALKYPOTK', 'CORGCAP1', 'PCO2EG01', 'NTOTCAP1', 'D15NEAM1', 'SLCAKGD5', 'PHXXSP02', 'TEMPST01', 'PSALST01', 'PSALMV01', 'TEMPP901', 'TCO2ZZXX', 'ALKYZZXX', 'CPHLZZXX'];

  it('a method-specific concept is never proposed, whatever the unit: it is only offered', () => {
    const units = [undefined, 'µmol/L', 'µmol/kg', 'mg/L', '°C', 'PSU', 'µatm', '‰', 'dimensionless', 'm', 'mL/L', 'something else'];
    for (const [variable, list] of Object.entries(VARIABLE_CONCEPTS)) {
      for (const unit of units) {
        const s = suggestType(variable, unit);
        if (s.proposed) expect(T12, `${variable} ${unit}`).not.toContain(s.proposed.code);
        if (s.proposed) expect(list.find((c) => c.term.code === s.proposed!.code)?.kind).toBe('generic');
      }
    }
    for (const code of T12) {
      const owner = Object.entries(VARIABLE_CONCEPTS).find(([, l]) => l.some((c) => c.term.code === code));
      expect(owner, code).toBeTruthy();
      expect(owner![1].find((c) => c.term.code === code)!.kind, code).toBe('method');
    }
    expect(suggestType('DIC', 'µmol/kg')).toMatchObject({ offered: [{ code: 'TCO2KG02' }] });
    expect(suggestType('DIC', 'µmol/kg').proposed).toBeUndefined();
    expect(suggestType('pCO2', 'µatm').proposed).toBeUndefined();
    expect(suggestType('pCO2', 'µatm').offered.map((t) => t.code)).toEqual(['PCO2EG01']);
  });

  it('oxygen is picked by the unit dimension (DOXYZZXX per volume, DOXMZZXX per mass); with another unit or none nothing is proposed and both are offered', () => {
    expect(suggestType('oxygen', 'µmol/L').proposed?.code).toBe('DOXYZZXX');
    expect(suggestType('oxygen', 'umol l-1').proposed?.code).toBe('DOXYZZXX');
    expect(suggestType('oxygen', 'mg/L').proposed?.code).toBe('DOXYZZXX');
    expect(suggestType('oxygen', 'µmol/kg').proposed?.code).toBe('DOXMZZXX');
    expect(suggestType('oxygen', 'µmol kg-1').proposed?.code).toBe('DOXMZZXX');
    expect(suggestType('oxygen', 'µmol/kg').offered).toEqual([]); // the per-volume concept would describe another quantity
    for (const unit of ['saturation', undefined]) {
      const s = suggestType('oxygen', unit);
      expect(s.proposed, String(unit)).toBeUndefined();
      expect(s.offered.map((t) => t.code).sort(), String(unit)).toEqual(['DOXMZZXX', 'DOXYZZXX']);
    }
    // millilitres per litre is per unit volume: the per-mass concept would describe another quantity (nothing is proposed: no verified alias for the unit)
    for (const unit of ['mL/L', 'ml/l']) {
      const s = suggestType('oxygen', unit);
      expect(s.proposed, unit).toBeUndefined();
      expect(s.offered.map((t) => t.code), unit).toEqual(['DOXYZZXX']);
    }
    // oxygen in per cent is SATURATION: the saturation concept (opened 2026-10-26) is proposed, and no concentration concept is offered
    for (const [v, unit] of [['oxygen', '%'], ['tlen', '%'], ['oxygen saturation', '%']] as const) {
      const s = suggestType(v, unit);
      expect(s.proposed?.code, v).toBe('OXYSZZ01');
      expect(s.offered, v).toEqual([]);
    }
  });

  it('generic concepts are proposed (temperature, salinity, pH, nutrients per volume); a nutrient per mass has no verified generic: nothing is proposed', () => {
    expect(suggestType('temperature', '°C').proposed?.code).toBe('TEMPPR01');
    expect(suggestType('temperature', undefined).proposed?.code).toBe('TEMPPR01');
    expect(suggestType('salinity', 'PSU').proposed?.code).toBe('PSLTZZ01');
    expect(suggestType('pH', undefined).proposed?.code).toBe('PHXXZZXX');
    expect(suggestType('nitrate', 'µmol/L').proposed?.code).toBe('NTRAZZXX');
    expect(suggestType('nitrate', 'µmol/kg').proposed).toBeUndefined();
    expect(suggestType('phosphate', 'µmol/kg').proposed).toBeUndefined();
    expect(suggestType('phosphate', 'µmol/kg').offered.map((t) => t.code)).toEqual(['PHOSKGD5']);
    expect(suggestType('phosphate', 'µmol/L').proposed?.code).toBe('PHOSZZXX');
    expect(suggestType('phosphate', 'µmol/L').offered).toEqual([]);
    // a variable the vocabulary does not know: nothing proposed, nothing offered
    expect(suggestType('chlorophyll fluorescence', 'µg/L')).toEqual({ offered: [] });
    expect(suggestType('constructor', 'µg/L')).toEqual({ offered: [] });
    expect(suggestType('__proto__', undefined)).toEqual({ offered: [] });
  });

  it('units: the verified P06 concept for the spellings that mean exactly it, and none for an ambiguous one', () => {
    const code = (u: string): string | undefined => suggestUnit(u)?.code;
    expect([code('µmol/L'), code('umol/l'), code('µmol L-1'), code('μmol/l'), code('micromol/L')]).toEqual(['UPOX', 'UPOX', 'UPOX', 'UPOX', 'UPOX']);
    expect([code('µmol/kg'), code('umol kg-1')]).toEqual(['KGUM', 'KGUM']);
    expect([code('mg/L'), code('mg l-1'), code('°C'), code('degC'), code('deg C'), code('Celsius')]).toEqual(['UMGL', 'UMGL', 'UPAA', 'UPAA', 'UPAA', 'UPAA']);
    expect([code('PSU'), code('pH units'), code('µatm'), code('uatm'), code('‰'), code('m'), code('dimensionless')]).toEqual(['PSUX', 'UUPH', 'UATM', 'UATM', 'UPPT', 'ULAA', 'UUUU']);
    // "ppt" can be parts per trillion, a bare "c" is not necessarily Celsius, "mL/L" has no verified concept: no suggestion
    for (const u of ['ppt', 'c', 'C', 'mL/L', 'ml l-1', '', 'umol', 'PSU units', 'mg/m2']) expect(suggestUnit(u), u).toBeUndefined();
    expect(suggestUnit(undefined)).toBeUndefined();
    expect(unitConcept('µmol/kg')?.per).toBe('mass');
    expect(unitConcept('mg/m3')?.term).toBe(P06.mgPerM3);
    expect(foldUnit('µmol L^-1')).toBe('umol/l');
  });

  it('every verified code is the one the research section lists (the page for it was opened, owl:deprecated false), and none is a deprecated or species-specific code', () => {
    const doc = readFileSync(join(__dirname, '..', '..', 'docs', 'research', 'qc-sources.md'), 'utf8');
    const section = doc.slice(doc.indexOf('Converter (/convert) — stage 5 verification'));
    expect(section.length).toBeGreaterThan(500);
    for (const c of VARIABLE_VERIFIED_CODES) expect(section, c).toContain(c.split('/')[1]);
    expect(VARIABLE_VERIFIED_CODES.length).toBe(new Set(VARIABLE_VERIFIED_CODES).size);
    expect(VARIABLE_VERIFIED_CODES).toEqual(
      [
        'P01/AMONZZXX', 'P01/ALKYPOTK', 'P01/ALKYZZXX', 'P01/CNDCST01', 'P01/CORGCAP1', 'P01/CPHLZZXX', 'P01/D15NEAM1', 'P01/DOXMZZXX', 'P01/DOXYZZXX', 'P01/NTOTCAP1', 'P01/NTRAZZXX', 'P01/NTRIZZXX', 'P01/NTRZZZXX', 'P01/PCO2EG01',
        'P01/PHOSKGD5', 'P01/PHOSZZXX', 'P01/PHXXSP02', 'P01/PHXXZZXX', 'P01/PSALMV01', 'P01/PSALST01', 'P01/POTMCV01', 'P01/PSLTZZ01', 'P01/SIGTEQ01', 'P01/SLCAKGD5', 'P01/SLCAZZXX', 'P01/TCO2KG02', 'P01/TCO2ZZXX', 'P01/TEMPP901', 'P01/TEMPPR01', 'P01/TEMPST01',
        'P01/CLXXWBUP', 'P01/CORGZZKG', 'P01/DOCGZZ01', 'P01/INDENS01', 'P01/NEWCXX08', 'P01/NEWCXX09', 'P01/OXYSZZ01', 'P01/RWS00021', 'P01/RWS00022', 'P01/RWS00023', 'P01/RWS00024', 'P01/S04DISP1', 'P01/SPHTMAXX', 'P06/UPCT',
        'P06/KGUM', 'P06/MMPL', 'P06/MSCM', 'P06/PSUX', 'P06/UATM', 'P06/UGMC', 'P06/UGPL', 'P06/ULAA', 'P06/UMGL', 'P06/UMMC', 'P06/UKMC', 'P06/UPAA', 'P06/UPNM', 'P06/UPOX', 'P06/UPPT', 'P06/UUPH', 'P06/UUUU',
      ].sort(),
    );
    for (const c of VARIABLE_VERIFIED_CODES) expect(c).not.toMatch(/SDBIOL10|^Q01\/|UCNT/); // (SIGTEQ01 merely ends in Q01: only the collection Q01 is meant)
    for (const u of VARIABLE_UNITS) expect(u.term.uri).toMatch(/^http:\/\/vocab\.nerc\.ac\.uk\/collection\/P06\/current\/[A-Z0-9]{4}\/$/);
  });

  it('every proposal of the page is a pick the worker accepts, and a deprecated flag set by the page is refused', () => {
    for (const list of Object.values(VARIABLE_CONCEPTS)) for (const c of list) expect(readPick('P01', suggestedPick(c.term)), c.term.code).toBeTruthy();
    for (const u of VARIABLE_UNITS) expect(readPick('P06', suggestedPick(u.term)), u.term.code).toBeTruthy();
    expect(readPick('P01', { ...suggestedPick(VARIABLE_CONCEPTS.temperature[0].term), deprecated: true })).toBeUndefined();
  });
});

describe('T11: /check\'s vocabulary is untouched', () => {
  it('src/core/recognize/vocab.ts (UNIT_VOCAB, P01_HINTS, the canonical variables) is byte-for-byte the one of production (96994b5)', () => {
    const sha = createHash('sha256').update(readFileSync(join(__dirname, '..', '..', 'src', 'core', 'recognize', 'vocab.ts'))).digest('hex');
    expect(sha).toBe('47c5f0cde262778fb624703489a688645f30702b6725e459fc846089f62a6f1d');
  });
});

describe('measurementType of a variable row: the English label of a confirmed concept, the variable name otherwise', () => {
  const X_HEADER = ['Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus', 'X [umol/l]'];
  const X_ROWS: Cell[][] = [['A', 55, 2, '2023-06-14', 4, 1.5]];
  const runX = (nerc?: NercDecisions) => exportSheet(X_HEADER, X_ROWS, { quantity: { kind: 'count' }, edit: { 'X [umol/l]': { kind: 'variable', variable: 'chlorophyll' } }, ...(nerc ? { nerc } : {}) });
  const typeOf = (e: Awaited<ReturnType<typeof runX>>) => e.result.measurements.find((x) => x.role === 'variable')?.measurementType;

  it('a concept from the NVS search writes the label the search returned; an unconfirmed column keeps its name', async () => {
    expect(typeOf(await runX())).toBe('chlorophyll');
    expect(typeOf(await runX({ 5: { type: { ...pick('P01', 'ZZTESTC1', 'nvs'), label: 'An invented test concept' } } }))).toBe('An invented test concept');
  });

  it('an NVS pick with no label, with an unusable one (tab, line break, empty, very long), or a unit-only pick keeps the variable name', async () => {
    for (const label of [undefined, '', '   ', 'two\twords', 'two\nlines', 'x'.repeat(501)]) {
      expect(typeOf(await runX({ 5: { type: { ...pick('P01', 'ZZTESTC1', 'nvs'), ...(label === undefined ? {} : { label }) } } })), JSON.stringify(label)).toBe('chlorophyll');
    }
    expect(typeOf(await runX({ 5: { unit: pick('P06', 'UPOX') } }))).toBe('chlorophyll');
  });

  it('a verified code always carries the verified label, whatever the pick says', () => {
    expect(measurementTypeText({ ...pick('P01', 'TEMPPR01', 'nvs'), label: 'Something else' }, 'temperature')).toBe(TEMP_LABEL);
    expect(measurementTypeText(undefined, 'temperature')).toBe('temperature');
    expect(measurementTypeText({ ...pick('P01', 'ZZTESTC1', 'nvs'), label: '  Padded label ' }, 'x')).toBe('Padded label');
  });

  it('the page sends the concept\'s preferred label, not the "CODE: label" text of its lists', () => {
    expect(preferredLabel({ id: uri('P01', 'ZZTESTC1'), label: 'ZZTESTC1: An invented test concept' })).toBe('An invented test concept');
    expect(preferredLabel({ id: uri('P01', 'ZZTESTC1'), label: 'An invented test concept' })).toBe('An invented test concept');
    expect(preferredLabel({ id: uri('P01', 'ZZTESTC1'), label: 'ZZTESTC1: ' })).toBe('');
  });

  it('the label and the measurementTypeID are written together in the archive', async () => {
    const e = await runX({ 5: { type: { ...pick('P01', 'ZZTESTC1', 'nvs'), label: 'An invented test concept' } } });
    const rows = (await emof(e)).filter((m) => m.measurementTypeID === uri('P01', 'ZZTESTC1'));
    expect(rows.map((m) => m.measurementType)).toEqual(['An invented test concept']);
  });
});

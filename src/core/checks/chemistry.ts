// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { unitDimension } from '../recognize/vocab';
import { getRule, makeFinding, threshold } from '../rules/registry';
import type { DataRow, Dataset, Finding, NumericCell, Variable } from '../types';
import { cellDecimals, equalWithin } from './crossfile';

/*
 * Category C — chemistry checks on one dataset. Every number compared against comes from the rules
 * (threshold()); "consistent" is derived from the precision the values were reported with, never from a constant.
 */

const okCell = (row: DataRow, key: string): NumericCell | undefined => {
  const c = row.values[key];
  return c !== undefined && c.status === 'ok' && c.value !== undefined ? c : undefined;
};
const rawText = (c: NumericCell): string => String(c.raw ?? c.value).trim();
const where = (ds: Dataset) => ({ file: ds.file, ...(ds.label !== ds.file && ds.rows[0] ? { sheet: ds.rows[0].sheet } : {}) });
const hasThreshold = (ruleId: string, name: string): boolean => getRule(ruleId).thresholds?.some((t) => t.name === name) ?? false;

/* ---------- CHEM-UNIT-PAIR ---------- */

/** Element whose molar mass converts a canonical variable between mass and amount (names: threshold molarMass.<symbol>). */
const ELEMENT_OF: Readonly<Record<string, string>> = {
  DOC: 'C',
  POC: 'C',
  DIC: 'C',
  nitrate: 'N',
  nitrite: 'N',
  'nitrate+nitrite': 'N',
  ammonium: 'N',
  DIN: 'N',
  DON: 'N',
  PON: 'N',
  TN: 'N',
  TDN: 'N',
  phosphate: 'P',
  DOP: 'P',
  TDP: 'P',
  silicate: 'Si',
};

/** SI prefix factors of the units in question (a conversion between spellings of a unit, not a QC threshold). */
const PREFIX: Readonly<Record<string, number>> = { '': 1, k: 1e3, m: 1e-3, µ: 1e-6, n: 1e-9, p: 1e-12 };
const CONCENTRATION = /^([kmµnp]?)(g|mol)\/L$/;

/** 'mg/L' -> grams (or moles) per litre factor; undefined for anything that is not a plain per-litre concentration. */
function perLitre(unit: string | undefined, base: 'g' | 'mol'): number | undefined {
  const m = unit === undefined ? null : CONCENTRATION.exec(unit);
  return m && m[2] === base ? PREFIX[m[1]] : undefined;
}

const variablesOf = (ds: Dataset, canonical: string, dimension: string): Variable[] =>
  ds.variables.filter((v) => v.canonical === canonical && unitDimension(v.unit) === dimension);

interface UnitPair {
  canonical: string;
  mass: Variable;
  amount: Variable;
}

/** Variables of one canonical quantity given as mass/volume AND as amount/volume. */
function massAmountPairs(ds: Dataset): UnitPair[] {
  const canonicals = [...new Set(ds.variables.map((v) => v.canonical).filter((c): c is string => c !== undefined))];
  return canonicals.flatMap((canonical) =>
    variablesOf(ds, canonical, 'mass/volume').flatMap((mass) => variablesOf(ds, canonical, 'amount/volume').map((amount) => ({ canonical, mass, amount }))),
  );
}

const molarMassName = (canonical: string): string | undefined => {
  const el = ELEMENT_OF[canonical];
  return el !== undefined && hasThreshold('CHEM-UNIT-PAIR', `molarMass.${el}`) ? `molarMass.${el}` : undefined;
};

/** Mass/amount pairs the check cannot convert because the rule cites no molar mass for their element (ions such as Na, Cl). */
export function unitPairsWithoutMolarMass(ds: Dataset): { variable: string; unitA: string; unitB: string }[] {
  return massAmountPairs(ds)
    .filter((p) => molarMassName(p.canonical) === undefined)
    .map((p) => ({ variable: p.canonical, unitA: p.mass.unit!, unitB: p.amount.unit! }));
}

function checkUnitPairs(ds: Dataset): Finding[] {
  const out: Finding[] = [];
  for (const { canonical, mass, amount } of massAmountPairs(ds)) {
    const name = molarMassName(canonical);
    const massScale = perLitre(mass.unit, 'g');
    const amountScale = perLitre(amount.unit, 'mol');
    if (name === undefined || massScale === undefined || amountScale === undefined) continue;
    const molarMass = threshold('CHEM-UNIT-PAIR', name);
    const lines: number[] = [];
    let example: string | undefined;
    for (const row of ds.rows) {
      const m = okCell(row, mass.key);
      const a = okCell(row, amount.key);
      if (!m || !a) continue;
      // expected amount in the amount column's unit, and the uncertainty of both reported precisions carried over to it
      const toAmount = massScale / molarMass / amountScale;
      const expected = m.value! * toAmount;
      const uncertainty = 0.5 * 10 ** -cellDecimals(m) * toAmount + 0.5 * 10 ** -cellDecimals(a);
      if (Math.abs(expected - a.value!) <= uncertainty) continue;
      lines.push(m.line, a.line);
      example ??= `${rawText(m)} ${mass.unit} vs ${rawText(a)} ${amount.unit}`;
    }
    if (example === undefined) continue;
    out.push(
      makeFinding('CHEM-UNIT-PAIR', {
        ...where(ds),
        field: `${mass.header} / ${amount.header}`,
        lines,
        value: example,
        params: { variable: canonical, unitA: mass.unit!, unitB: amount.unit! },
        datasetIds: [ds.id],
      }),
    );
  }
  return out;
}

/* ---------- CHEM-DIC-GT-TA ---------- */

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function checkDicTa(ds: Dataset): Finding[] {
  const out: Finding[] = [];
  const dics = ds.variables.filter((v) => v.canonical === 'DIC' && v.unit !== undefined);
  const tas = ds.variables.filter((v) => v.canonical === 'TA' && v.unit !== undefined);
  for (const dic of dics) {
    for (const ta of tas) {
      if (dic.unit !== ta.unit) continue;
      const groups = new Map<string, { total: number; count: number; lines: number[]; diffs: number[] }>();
      for (const row of ds.rows) {
        const d = okCell(row, dic.key);
        const t = okCell(row, ta.key);
        if (!d || !t) continue;
        const group = row.cruise ?? ds.label;
        let g = groups.get(group);
        if (!g) groups.set(group, (g = { total: 0, count: 0, lines: [], diffs: [] }));
        g.total += 1;
        g.diffs.push(t.value! - d.value!);
        // DIC above TA by more than the two values' rounding can explain
        if (d.value! > t.value! && !equalWithin(d.value!, cellDecimals(d), t.value!, cellDecimals(t))) {
          g.count += 1;
          g.lines.push(d.line, t.line);
        }
      }
      for (const [group, g] of groups) {
        if (g.count === 0) continue;
        out.push(
          makeFinding('CHEM-DIC-GT-TA', {
            ...where(ds),
            field: `${dic.header} > ${ta.header}`,
            lines: g.lines,
            value: group,
            params: { group, count: g.count, total: g.total, medianDiff: Math.round(median(g.diffs)) },
            datasetIds: [ds.id],
          }),
        );
      }
    }
  }
  return out;
}

/* ---------- CHEM-RANGE ---------- */

/** Units under which a value is compared with the cited range ('dimensionless' = salinity / pH have none). */
interface Quantity {
  name: string;                                   // threshold prefix: '<name>.min' / '<name>.max'
  applies: (v: Variable) => boolean;
}
const NO_UNIT = (allowed: readonly string[]) => (u: string | undefined): boolean => u === undefined || allowed.includes(u);
const salinityUnit = NO_UNIT(['PSU', 'dimensionless']);
const pHUnit = NO_UNIT(['pH units', 'dimensionless']);

const QUANTITIES: readonly Quantity[] = [
  { name: 'temperature', applies: (v) => v.canonical === 'temperature' && v.unit === '°C' },
  { name: 'salinity', applies: (v) => v.canonical === 'salinity' && salinityUnit(v.unit) },
  { name: 'pressure', applies: (v) => v.canonical === undefined && v.unit === 'dbar' },
  { name: 'oxygen', applies: (v) => v.canonical === 'oxygen' && v.unit === 'µmol/kg' },
  { name: 'pH', applies: (v) => v.canonical === 'pH' && pHUnit(v.unit) },
];

const thresholdUnit = (name: string): string => getRule('CHEM-RANGE').thresholds?.find((t) => t.name.startsWith(`${name}.`))?.unit ?? '';

function checkRange(ds: Dataset): Finding[] {
  const out: Finding[] = [];
  for (const q of QUANTITIES) {
    const min = hasThreshold('CHEM-RANGE', `${q.name}.min`) ? threshold('CHEM-RANGE', `${q.name}.min`) : undefined;
    const max = hasThreshold('CHEM-RANGE', `${q.name}.max`) ? threshold('CHEM-RANGE', `${q.name}.max`) : undefined;
    if (min === undefined && max === undefined) continue;
    for (const v of ds.variables.filter(q.applies)) {
      const lines: number[] = [];
      let example: string | undefined;
      let count = 0;
      for (const row of ds.rows) {
        const c = okCell(row, v.key);
        if (!c) continue;
        if ((min !== undefined && c.value! < min) || (max !== undefined && c.value! > max)) {
          count += 1;
          lines.push(c.line);
          example ??= rawText(c);
        }
      }
      if (count === 0) continue;
      out.push(
        makeFinding('CHEM-RANGE', {
          ...where(ds),
          field: v.header,
          lines,
          value: example,
          params: { variable: q.name, min: min ?? '∞', max: max ?? '∞', unit: thresholdUnit(q.name), count },
          datasetIds: [ds.id],
        }),
      );
    }
  }
  return out;
}

/* ---------- entry point ---------- */

/** Chemistry checks for one dataset. */
export function checkChemistry(ds: Dataset): Finding[] {
  return [...checkUnitPairs(ds), ...checkDicTa(ds), ...checkRange(ds)];
}

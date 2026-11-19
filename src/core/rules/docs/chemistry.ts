// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Chemistry rules. Each text was checked against src/core/checks/chemistry.ts, the only place that raises these ids. They look at the values of
 * one table and run in /check and /collection, and in /convert on the tables the converter builds (there with the missing-value codes read as values,
 * because the converter has already dealt with them). In every tool they are only shown: they never stop an export.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'CHEM-UNIT-PAIR': {
    checks:
      'The same chemical quantity is given twice, once as mass per volume and once as amount per volume, and the two columns do not agree after conversion. One of the columns, or one of its unit labels, is wrong, and a reader who trusts the wrong one is off by a factor of the molar mass.',
    fires:
      'When one table has two columns of the same recognised variable, one with a unit of mass per litre (for example mg/L) and one with a unit of amount per litre (for example µmol/L). The mass column is converted with the molar mass of the element the variable is reported as, and the rule fires when a row differs from the other column by more than the rounding of the two reported values can explain. One finding per pair of columns, listing every disagreeing row. The elements and molar masses are carbon 12.011, nitrogen 14.007, phosphorus 30.974 and silicon 28.085 g/mol (CIAAW atomic weights). Covered: DOC, POC, DIC (carbon); nitrate, nitrite, nitrate+nitrite, ammonium, DIN, DON, PON, TN, TDN (nitrogen); phosphate, DOP, TDP (phosphorus); silicate (silicon). The mass is taken as the element (nitrate as N). Others are not judged; missing values are skipped.',
    example:
      'A nitrate column in mg/L reads 0.62 and a nitrate column in µmol/L on the same row reads 8.1; 0.62 mg/L of nitrogen is about 44.3 µmol/L, so the row disagrees.',
    action:
      'Decide which column is right, correct the wrong values or the wrong unit label, or delete the duplicate column. Nothing in your file is changed by the tool. In /convert this finding is only shown and never stops the export.',
  },
  'CHEM-DIC-GT-TA': {
    checks:
      'Dissolved inorganic carbon is larger than total alkalinity. In sea water alkalinity is normally the larger of the two, so a reversed pair usually means swapped columns, a wrong unit on one of them, or a mislabelled variable.',
    fires:
      'When one table has a DIC column and a TA column with the same unit, and in at least one row DIC is larger than TA by more than the rounding of the two reported values can explain. Rows are grouped by cruise when the table has a cruise column, otherwise the whole table is one group; there is one finding per DIC and TA column pair and group that has at least one such row. The finding gives how many of the rows with both values are affected and the median of TA minus DIC over the group, rounded to a whole number. Rows with a missing or non-numeric value are skipped. Columns with different units are not compared. Sources: Dickson, Sabine and Christian (2007) guide to best practices for ocean CO2 measurements, and TEOS-10 for the seawater background.',
    example:
      'A group of 60 rows has DIC 2310 and TA 2285 in µmol/kg on 5 of the rows, and TA above DIC on the other 55; the group is reported with 5 of 60 rows.',
    action:
      'Check that the DIC and TA columns are not swapped, that both carry the same unit, and that the flagged rows are not typing errors. If the sample is not from sea water, the pattern can be genuine; the finding then stays as a note. In /convert this finding is only shown and never stops the export.',
  },
  'CHEM-RANGE': {
    checks:
      'Values of temperature, salinity, pressure, oxygen or pH lie outside the range used by the quality control of open-ocean profiling programmes. Such values are often unit mistakes, swapped columns or leftover codes, and they would distort any analysis that uses the file.',
    fires:
      'When a column that is recognised as one of the five quantities (pressure also by the unit dbar on a column with no named variable), with a unit the range was written for, holds at least one value outside the range. One finding per column, with the count and the first offending value. Ranges: temperature -2.5 to 40 °C and salinity 2 to 41 (Argo CTD range test); pressure of at least -5 dbar, with no upper bound (Argo); oxygen -5 to 600 µmol/kg (Argo dissolved oxygen); pH 6.5 to 9 (GTSPP). The unit must match: temperature in °C, pressure in dbar, oxygen in µmol/kg, salinity in PSU or with no unit, pH in pH units or with no unit. Oxygen per volume (mL/L, mg/L, µmol/L) is not compared (it needs the water density) and the report says so. The values -99, -999 and -9999 are left to ROW-MISSING-CODE, unless the converter has already treated them as values.',
    example:
      'A salinity column holds 35.1, 34.9 and 350.0; the last value is reported as outside 2 to 41.',
    action:
      'Check the flagged values and the unit of the column; a value that is 10 or 100 times too large is often a decimal slip. If the sample is from fresh or brackish water (salinity) or a closed system, the value can be genuine: keep it and say so in the description of the data. In /convert this finding is only shown and never stops the export.',
  },
};

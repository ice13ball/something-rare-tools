// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE, th } from './citations';
import type { RuleSpec } from './spec';

/*
 * Chemistry rules (category 'C'), emitted by checkChemistry() (Task 9).
 * Declared params per rule:
 *   CHEM-UNIT-PAIR   variable, unitA, unitB    canonical variable (e.g. "DOC") and the two unit labels;
 *                                              lines = rows that disagree; value = one example, e.g. "1.47 mg/L vs 41.7 µmol/L"
 *   CHEM-DIC-GT-TA   group, count, total, medianDiff   group = cruise (or dataset label); count = rows with DIC > TA;
 *                                              total = rows with both; medianDiff = median of TA minus DIC (a negative number)
 *   CHEM-RANGE       variable, min, max, unit, count   the cited range of the variable, taken from the rule thresholds
 *                                              (threshold(...) — never typed in a check); where the source gives one bound only
 *                                              (pressure: lower) pass the open side as the infinity sign "∞"; count = values outside;
 *                                              field = column; lines = rows; value = one example
 * Thresholds: ONLY the numbers in docs/research/qc-sources.md, section "Decisions".
 * Names: '<quantity>.min' / '<quantity>.max' for CHEM-RANGE; 'molarMass.<element symbol>' for CHEM-UNIT-PAIR.
 */
export const CHEMISTRY_RULES: readonly RuleSpec[] = [
  {
    id: 'CHEM-UNIT-PAIR',
    category: 'C',
    severity: 'warning',
    params: ['variable', 'unitA', 'unitB'],
    thresholds: [
      th('molarMass.C', 12.011, 'g/mol', CITE.ciaawAtomicWeight('6 C', 'carbon', '12.011 ± 0.002')),
      th('molarMass.N', 14.007, 'g/mol', CITE.ciaawAtomicWeight('7 N', 'nitrogen', '14.007 ± 0.001')),
      th('molarMass.P', 30.974, 'g/mol', CITE.ciaawAtomicWeight('15 P', 'phosphorus', '30.974 ± 0.001')),
      th('molarMass.Si', 28.085, 'g/mol', CITE.ciaawAtomicWeight('14 Si', 'silicon', '28.085 ± 0.001')),
    ],
    plain: {
      pl: `{variable} jest podane w dwóch jednostkach ({unitA} i {unitB}), ale po przeliczeniu obie kolumny się nie zgadzają. Jedna z nich jest błędna.`,
      en: `{variable} is given in two units ({unitA} and {unitB}), but after conversion the two columns do not agree. One of them is wrong.`,
      de: `{variable} ist in zwei Einheiten angegeben ({unitA} und {unitB}), aber nach der Umrechnung stimmen beide Spalten nicht überein. Eine davon ist falsch.`,
      fr: `{variable} est donné dans deux unités ({unitA} et {unitB}), mais après conversion les deux colonnes ne concordent pas. L'une d'elles est fausse.`,
    },
    technical: `{file}:{lines} {variable}: {unitA} vs {unitB} inconsistent after conversion with molar masses C {threshold.molarMass.C}, N {threshold.molarMass.N}, P {threshold.molarMass.P}, Si {threshold.molarMass.Si} g/mol (e.g. {value}).`,
  },
  {
    id: 'CHEM-DIC-GT-TA',
    category: 'C',
    severity: 'warning',
    params: ['group', 'count', 'total', 'medianDiff'],
    citations: [CITE.teos10StandardSeawater, CITE.dicksonDic, CITE.dicksonTa],
    plain: {
      pl: `W grupie {group} w {count} z {total} wierszy węgiel nieorganiczny (DIC) przewyższa zasadowość (TA), co w wodzie morskiej jest niezwykłe. Sprawdź kolumny i jednostki.`,
      en: `In {group}, {count} of {total} rows have more dissolved inorganic carbon (DIC) than alkalinity (TA), which is unusual in sea water. Check the columns and units.`,
      de: `In {group} haben {count} von {total} Zeilen mehr gelösten anorganischen Kohlenstoff (DIC) als Alkalinität (TA), was im Meerwasser ungewöhnlich ist. Prüfen Sie Spalten und Einheiten.`,
      fr: `Dans {group}, {count} lignes sur {total} ont plus de carbone inorganique dissous (DIC) que d'alcalinité (TA), ce qui est inhabituel en eau de mer. Vérifiez les colonnes et les unités.`,
    },
    technical: `{file}:{lines} {group}: DIC > TA in {count} of {total} rows (median TA-DIC {medianDiff}).`,
  },
  {
    id: 'CHEM-RANGE',
    category: 'C',
    severity: 'warning',
    params: ['variable', 'min', 'max', 'unit', 'count'],
    thresholds: [
      th('temperature.min', -2.5, '°C', CITE.argoCtdRange),
      th('temperature.max', 40, '°C', CITE.argoCtdRange),
      th('salinity.min', 2, 'psu', CITE.argoCtdRange),
      th('salinity.max', 41, 'psu', CITE.argoCtdRange),
      th('pressure.min', -5, 'dbar', CITE.argoCtdRange),
      th('oxygen.min', -5, 'µmol/kg', CITE.argoDoxyRange),
      th('oxygen.max', 600, 'µmol/kg', CITE.argoDoxyRange),
      th('pH.min', 6.5, 'pH units', CITE.gtsppPh),
      th('pH.max', 9, 'pH units', CITE.gtsppPh),
    ],
    plain: {
      pl: `{count} wartości {variable} wykracza poza zakres otwartego oceanu {min} – {max} {unit}, stosowany w kontroli jakości Argo. Sprawdź wartości i jednostkę; jeśli próbka pochodzi z wody słodkiej lub słonawej, potwierdź to.`,
      en: `{count} values of {variable} lie outside the open-ocean range of {min} to {max} {unit} used by Argo quality control. Check the values and the unit; if the sample is from fresh or brackish water, confirm that.`,
      de: `{count} Werte von {variable} liegen außerhalb des Offenmeer-Bereichs von {min} bis {max} {unit}, der in der Argo-Qualitätskontrolle verwendet wird. Prüfen Sie Werte und Einheit; stammt die Probe aus Süß- oder Brackwasser, bestätigen Sie das.`,
      fr: `{count} valeurs de {variable} sont en dehors de la plage de haute mer de {min} à {max} {unit} utilisée par le contrôle qualité d'Argo. Vérifiez les valeurs et l'unité ; si l'échantillon provient d'eau douce ou saumâtre, confirmez-le.`,
    },
    technical: `{file}:{lines} field {field} {variable}: {count} value(s) outside {min}..{max} {unit} (e.g. '{value}'); global range test of the cited QC manuals.`,
  },
];

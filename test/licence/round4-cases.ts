// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure data: the round-4 cases of the fail-closed licence classifier (read by fail-closed-round4.test.ts).
export const BY = 'https://creativecommons.org/licenses/by/4.0/';

export type Finding = 'text-uri' | 'restricted' | 'extra-text';
/** [point, text, uri, expected conflict, a part of the leftover that must be shown ('' = none to check)] */
export type FlagCase = [point: number, text: string, uri: string | undefined, conflict: Finding, left: string];
/** [point, text, uri, id] */
export type StayCase = [point: number, text: string, uri: string | undefined, id: string];

const NO_NAME_WITH_LINK = ['Please contact the PI before publication', 'Free for scientific use', 'Registration required before download', 'Use for teaching'];
const COPYRIGHT_LEAKS: [string, string][] = [
  ['CC BY 4.0 © Ocean Corp — reuse requires a paid subscription', 'reuse requires a paid subscription'],
  ['CC BY 4.0. Copyright: users must pay a fee', 'users must pay a fee'],
  ['CC BY 4.0. Copyright notice: data may be reused for teaching purposes', 'teaching purposes'],
  ['CC BY 4.0 (c) Ocean Corp: internal use', 'internal use'],
  ['CC BY 4.0, © Ocean Corp who must be contacted before reuse', 'who must be contacted before reuse'],
  ['CC BY 4.0 © 2020 Ocean Corp - fee required for redistribution', 'fee required for redistribution'],
  ['CC BY 4.0 Copyright Ocean Corp 2020 sales licence required', 'sales licence required'],
];
const DATE_TEXTS = ['Data available 2027.', '(data available 2027-12-31)', 'data released 01.01.2028', 'Daten verfügbar 2027.', 'Données disponibles 2027.', 'Dane dostępne 2027.'];
const DATE_LEFT: Record<string, string> = {
  'Data available 2027.': '2027',
  '(data available 2027-12-31)': '2027-12-31',
  'data released 01.01.2028': '01.01.2028',
  'Daten verfügbar 2027.': '2027',
  'Données disponibles 2027.': '2027',
  'Dane dostępne 2027.': '2027',
};
const SEE: [string, string][] = [
  ['CC BY 4.0. See terms of use.', 'See terms of use'],
  ['CC BY 4.0, see the terms of the dataset', 'see the terms of the dataset'],
  ['CC BY 4.0 (see the licence)', 'see the licence'],
  ['CC BY 4.0, see https://example.org/data-policy', 'https://example.org/data-policy'],
  ['CC BY 4.0, siehe https://example.org/data-policy', 'https://example.org/data-policy'],
  ['CC BY 4.0, zob. https://example.org/data-policy', 'https://example.org/data-policy'],
  ['CC BY 4.0; commercial use is permitted; see the terms of use', 'see the terms of use'],
  ['CC BY 4.0, some rights reserved, see terms', 'see terms'],
];
const REFS: [string, string, Finding][] = [
  ['CC BY 4.0, https://example.org/terms?use=noncommercial', 'https://example.org/terms?use=noncommercial', 'restricted'],
  ['CC BY 4.0, see doi:10.1234/terms-noncommercial', 'doi:10.1234/terms-noncommercial', 'restricted'],
  ['CC BY 4.0, 10.1234/noncommercial-only', '10.1234/noncommercial-only', 'restricted'],
  ['CC BY 4.0 https://doi.org/10.1234/x', 'https://doi.org/10.1234/x', 'extra-text'],
];

export const FLAGS: FlagCase[] = [
  ...NO_NAME_WITH_LINK.map((t): FlagCase => [1, t, BY, 'text-uri', '']),
  ...COPYRIGHT_LEAKS.flatMap(([t, l]): FlagCase[] => [[2, t, undefined, 'extra-text', l], [2, t, BY, 'extra-text', l]]),
  ...DATE_TEXTS.map((t): FlagCase => [3, t, BY, 'text-uri', '']),
  ...DATE_TEXTS.flatMap((t): FlagCase[] => [[3, `CC BY 4.0, ${t}`, undefined, 'extra-text', DATE_LEFT[t]], [3, `CC BY 4.0, ${t}`, BY, 'extra-text', DATE_LEFT[t]]]),
  [3, 'CC BY 4.0 2027', undefined, 'extra-text', '2027'],
  [3, 'CC BY 4.0 2027', BY, 'extra-text', '2027'],
  ...SEE.flatMap(([t, l]): FlagCase[] => [[4, t, undefined, 'extra-text', l], [4, t, BY, 'extra-text', l]]),
  ...REFS.flatMap(([t, l, k]): FlagCase[] => [[5, t, undefined, k, l], [5, t, BY, k, l]]),
  [6, 'CC BY 4.0 🚫💰', undefined, 'extra-text', '🚫💰'],
  [6, 'CC BY 4.0 🚫💰', BY, 'extra-text', '🚫💰'],
];

export const STAYS: StayCase[] = [
  // point 1: a text that names no licence may be empty or neutral next to a licence link; a family without version is handled by the family comparison
  [1, 'Open Access', BY, 'CC-BY-4.0'],
  [1, 'open access', BY, 'CC-BY-4.0'],
  [1, 'OPEN ACCESS', BY, 'CC-BY-4.0'],
  [1, 'info:eu-repo/semantics/openAccess', BY, 'CC-BY-4.0'],
  [1, 'http://purl.org/coar/access_right/c_abf2', BY, 'CC-BY-4.0'],
  [1, 'CC-BY', BY, 'CC-BY-4.0:family'],
  // point 2
  [2, '© Ocean Data Limited, CC BY 4.0', undefined, 'CC-BY-4.0'],
  [2, 'Copyright 2024 Example Institute. Licensed under CC BY 4.0.', undefined, 'CC-BY-4.0'],
  [2, '© 2021 Instytut Przykładowy sp. z o.o., CC BY 4.0', undefined, 'CC-BY-4.0'],
  [2, '(c) 2019 Beispiel GmbH; CC BY 4.0', undefined, 'CC-BY-4.0'],
  [2, '© Ocean Data Limited, CC BY 4.0', BY, 'CC-BY-4.0'],
  [2, '© 2020-2023 Ocean Data Ltd. CC BY 4.0', BY, 'CC-BY-4.0'],
  // point 4
  [4, 'This dataset is licensed under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/).', undefined, 'CC-BY-4.0'],
  [4, 'This dataset is licensed under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/).', BY, 'CC-BY-4.0'],
  // point 5: a licence link in the text is stripped
  [5, 'CC BY 4.0, https://creativecommons.org/licenses/by/4.0/legalcode', BY, 'CC-BY-4.0'],
];

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Pure data: round-5 cases (copyright holder boundary, licence-link tails) read by fail-closed-round5.test.ts.
import { BY } from './round4-cases';

export const CC = 'https://creativecommons.org/licenses/';
/** [text, a part of the leftover that must be shown] */
export type Flag = [text: string, uri: string | undefined, left: string];

/** © notices whose holder name is cut at a boundary word or is too long: [notice, leftover] */
const NOTICE_LEFT: [string, string][] = [
  ['© Ocean Corp Internal Use', 'Internal Use'],
  ['© Ocean Corp Fee Required', 'Fee Required'],
  ['© Ocean Corp 2020 Registration Required', 'Registration Required'],
  ['© Ocean Corp Paid Licence Required', 'Paid Licence Required'],
  ['© Ocean Corp Members', 'Members'],
  ['© Ocean Corp Partners Program', 'Partners Program'],
  ['© Ocean Corp Until 2027', 'Until 2027'],
  ['© Ocean Corp Internal', 'Internal'],
  ['© Meeresinstitut Kostenpflichtig', 'Kostenpflichtig'],
  ['© GEOMAR Lizenzgebühr Erforderlich', 'Lizenzgebühr Erforderlich'],
  ['© Ocean GmbH Nutzung Gebührenpflichtig', 'Nutzung Gebührenpflichtig'],
  ['© Ocean Corp Ltd. fee applies', 'fee applies'],
  ['© Alpha Beta Gamma Delta Epsilon', 'Alpha Beta Gamma Delta Epsilon'],
  ['© Meeresforschung Institut Kiel Abteilung Daten', 'Meeresforschung Institut Kiel Abteilung Daten'],
];
const NOTICE_WITH_NAME = ['CC BY 4.0 © Ocean Corp Partners Program', 'CC BY 4.0 © Ocean Corp Internal'];

export const NOTICE_FLAGS: Flag[] = [
  // alone with a by/4.0 link: the text names no licence and says something else
  ...NOTICE_LEFT.map(([t, l]): Flag => [t, BY, l]),
  // with the licence name in the text, appended and prepended, no link
  ...NOTICE_LEFT.flatMap(([t, l]): Flag[] => [[`CC BY 4.0 ${t}`, undefined, l], [`${t}. CC BY 4.0`, undefined, l]]),
  // and with the name and the link
  ...NOTICE_LEFT.map(([t, l]): Flag => [`CC BY 4.0, ${t}`, BY, l]),
  ...NOTICE_WITH_NAME.flatMap((t): Flag[] => [[t, undefined, t.includes('Partners') ? 'Partners Program' : 'Internal'], [t, BY, t.includes('Partners') ? 'Partners Program' : 'Internal']]),
];

export const NOTICE_STAYS: string[] = [
  '© IFREMER SEANOE',
  '© The Authors',
  '(c) 2019-2021 Ocean Data Ltd.',
  '© Ocean Data Limited',
  '© 2021 Instytut Przykładowy sp. z o.o.',
  '(c) 2019 Beispiel GmbH',
].flatMap((n) => [`CC BY 4.0, ${n}`, `${n}, CC BY 4.0`, `${n}; CC BY 4.0`]);

const TAIL_TEXTS = [`${CC}by/4.0/?noncommercial`, `${CC}by/4.0/#except-commercial`, `${CC}by/4.0/legalcode-modified-nc`];
export const LINK_FLAGS: Flag[] = [
  // a link whose tail we cannot read names nothing: next to a by/4.0 link the text conflicts with it
  ...TAIL_TEXTS.map((t): Flag => [t, BY, '']),
  // and with the name in the text the tail is leftover, shown
  ...TAIL_TEXTS.flatMap((t): Flag[] => [[`CC BY 4.0 ${t}`, undefined, t], [`CC BY 4.0 ${t}`, BY, t]]),
  [`CC BY 4.0 ${CC}by/4.0/?nc=1`, undefined, `${CC}by/4.0/?nc=1`],
  [`CC BY 4.0 ${CC}by/4.0/?nc=1`, BY, `${CC}by/4.0/?nc=1`],
  [`CC BY 4.0 ${CC}by/4.0/?ref=chooser-v1&nc=1`, undefined, 'ref=chooser-v1&nc=1'],
  [`CC BY 4.0 ${CC}by/4.0/?ref=chooser-v2`, BY, 'chooser-v2'],
  // glued to the link by , ( ): the link is read up to there, the rest is text
  [`${CC}by/4.0/,non-commercial`, undefined, 'non-commercial'],
  [`${CC}by/4.0/,non-commercial`, BY, 'non-commercial'],
  [`${CC}by/4.0/(NC)`, undefined, 'NC'],
  [`${CC}by/4.0/(NC)`, BY, 'NC'],
];

/** URI fields that are not a recognised licence link. */
export const URI_FLAGS: string[] = [`${CC}by/4.0/?nc=1`, `${CC}by/4.0/#nc`, `${CC}by/4.0/legalcode-modified-nc`, `${CC}by/4.0/?ref=chooser-v2`, `${CC}by/4.0/?ref=chooser-v1&nc=1`, `${CC}by/4.0/legalcode/extra`];

/** [uri, id] — links that stay recognised (as the URI field and as a link in the text). */
export const URI_STAYS: [string, string][] = [
  [`${CC}by/4.0`, 'CC-BY-4.0'],
  [`${CC}by/4.0/`, 'CC-BY-4.0'],
  [`${CC}by/4.0/legalcode`, 'CC-BY-4.0'],
  [`${CC}by/4.0/legalcode.pl`, 'CC-BY-4.0'],
  [`${CC}by/4.0/deed.en`, 'CC-BY-4.0'],
  [`${CC}by/4.0/deed.zh-hans`, 'CC-BY-4.0'],
  [`${CC}by/4.0/deed.en_GB`, 'CC-BY-4.0'],
  [`${CC}by/3.0/de/`, 'CC-BY-3.0-DE'],
  [`${CC}by/3.0/de/legalcode`, 'CC-BY-3.0-DE'],
  [`${CC}by/4.0/?ref=chooser-v1`, 'CC-BY-4.0'],
  [`${CC}by/4.0/legalcode.pl?ref=chooser-v1`, 'CC-BY-4.0'],
  ['http://creativecommons.org/licenses/by/4.0/', 'CC-BY-4.0'],
  ['https://www.creativecommons.org/licenses/by/4.0/', 'CC-BY-4.0'],
  ['http://www.creativecommons.org/licenses/by/4.0/legalcode', 'CC-BY-4.0'],
  ['https://creativecommons.org/publicdomain/zero/1.0/legalcode', 'CC0-1.0'],
  ['https://creativecommons.org/publicdomain/zero/1.0/', 'CC0-1.0'],
];

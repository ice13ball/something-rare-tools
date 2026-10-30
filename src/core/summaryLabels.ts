// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * The words that label a summary or statistics line at the bottom of a sheet. ONE definition for /check (dataset.ts: a row without a position that is only
 * such a label is not a record without one) and for the converter (convert/ids.ts: such a row is not a sample).
 * /check keeps reading exactly the English words it always read (SUMMARY_LABEL_EN); the converter adds the short statistics codes and the words of the other
 * three languages (STATISTIC_LABEL). A label is the WHOLE cell, in any case, with an optional closing colon or full stop.
 */

const EN = 'totals?|grand total|sub-?total|sum|mean|average|avg|median|min(?:imum)?|max(?:imum)?|st(?:an)?d(?:ard)?\\.? ?dev(?:iation)?|stdev|sd|count';
const MORE = [
  'se|sem|cv|n',
  // short forms of the standard deviation ("st.dev.", "st dev", "std"): only in the converter's list, /check keeps reading exactly the English words it always read
  'st\\.? ?dev\\.?|std\\.?',
  // pl
  'średnia|mediana|odchylenie(?: \\(?standardowe\\)?)?|odch\\.? ?st(?:and)?\\.?|maksimum|maks\\.?|liczba|suma',
  // de
  'mittelwert|durchschnitt|standardabweichung|anzahl|summe',
  // fr
  'moyenne|médiane|écart[- ]?type|nombre|somme',
].join('|');

/** The English labels: what /check has always read as a summary line. */
export const SUMMARY_LABEL_EN = new RegExp(`^(?:${EN})[:.]?$`, 'i');
/** Every statistics label the converter knows (a superset of the English ones). */
export const STATISTIC_LABEL = new RegExp(`^(?:${EN}|${MORE})[:.]?$`, 'i');
/** The short statistics labels that are also ordinary codes (a compass point, a sample "n", a station "Max"): on their own they are asked about, never skipped silently (convert/ids.ts scanStatisticRows). */
export const AMBIGUOUS_STATISTIC = /^(?:n|se|sem|cv|min|max|count|maks\.?)[:.]?$/i;

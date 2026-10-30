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

/*
 * The statistics words that are unambiguous INSIDE a column header ("OM mean (%)", "Macrofauna.biomass mean/st.dev. (gDW m-2)"): a mean, an average, a median
 * and a spread. The short codes that are also ordinary letters or words (n, se, cv, min, max, count, sum) are left out: they are statistics only as a whole cell
 * (AMBIGUOUS_STATISTIC) and could be part of a name in a header. The words of the other three languages are the ones STATISTIC_LABEL has.
 */
const HEADER_CENTRAL = 'mean|average|avg|median|srednia|mediana|mittelwert|durchschnitt|moyenne|mediane';
const HEADER_SPREAD = 'sd|std|stdev|st\\.? ?dev\\.?|standard deviation|odchylenie standardowe|odch\\.? ?st(?:and)?\\.?|standardabweichung|ecart[- ]?type';
const tokenOf = (words: string): RegExp => new RegExp(`(?:^|[\\s/.,;:_|+-])(?:${words})(?=$|[\\s/.,;:_|+-])`, 'i');
const CENTRAL_TOKEN = tokenOf(HEADER_CENTRAL);
const SPREAD_TOKEN = tokenOf(HEADER_SPREAD);
// the words are written without diacritics (srednia, mediane, ecart-type): the header is folded the same way before it is read
const plain = (name: string): string => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/\u0141/g, 'L');

/** A header (name part) with a central statistic as a token of its own: mean, average, median (and the Polish, German, French words). */
export function hasCentralStatisticToken(name: string): boolean {
  return CENTRAL_TOKEN.test(plain(name));
}
/**
 * A binomial name before the statistic word: a capitalised genus and a lowercase epithet ("Calanus hyperboreus mean"), or an abbreviated genus ("C. hyperboreus mean"), where
 * the epithet is not a quantity word ("Zooplankton biomass mean" is a variable). Used to keep a species mean a taxon candidate whatever its unit.
 */
const QUANTITY_WORD = /^(?:mean|average|avg|median|srednia|mediana|mittelwert|durchschnitt|moyenne|mediane|biomasa|biomasse|biomass|abundance|density|weight|mass|concentration|carbon|production|content|volume|cover|count|counts|rate)$/i;
export function hasBinomialBeforeStatistic(name: string): boolean {
  const m = /^\s*([A-Z][a-z]{2,}|[A-Z]\.)\s+([a-z]{3,})\b/.exec(plain(name));
  return m !== null && !QUANTITY_WORD.test(m[2]);
}
/** A header (name part) with a spread as a token of its own: SD, st.dev., std, standard deviation (and the Polish, German, French words). */
export function hasSpreadToken(name: string): boolean {
  return SPREAD_TOKEN.test(plain(name));
}
/** True when a header carries any statistic word as a token of its own: the column holds a summary of something. */
export function hasStatisticToken(name: string): boolean {
  return hasCentralStatisticToken(name) || hasSpreadToken(name);
}

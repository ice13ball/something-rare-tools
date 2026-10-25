// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Every reason the shared column proposer (columns.ts) can give, by stable code. The English text is the technical wording
 * (the proposal's `reason`: technical line, tests); the page shows `check.reason.<code>` of the reader's language, with the
 * same {placeholders} filled from `reasonParams`. The converter overlay has its own table (convert/recognize.ts OVERLAY_REASONS,
 * `convert.reason.<code>`); a code of that table overrides these, so the two never share a code.
 */
export const CHECK_REASONS = {
  // names
  'name-latitude': 'name says latitude',
  'name-longitude': 'name says longitude',
  'name-latitude-marked': 'name says latitude (a degree unit or hemisphere letter backs it)',
  'name-longitude-marked': 'name says longitude (a degree unit or hemisphere letter backs it)',
  'name-datetime': 'name says date and time',
  'name-date': 'name says date',
  'name-time': 'name says time of day',
  'name-elevation': 'name says elevation (positive up)',
  'name-depth': 'name says depth',
  'name-depth-start': 'name says depth ({name}: start of a depth range)',
  'name-depth-end': 'name says depth ({name}: end of a depth range)',
  'name-cruise': 'name says cruise or expedition',
  'name-station': 'name says station, site or event',
  'name-sample': 'name says sample or core identifier',
  'name-sample-probe': 'name says sample ("Probe" can also be a test or an instrument)',
  'name-pressure': 'name says pressure',
  'name-variable': 'name matches {variable}',
  // Darwin Core and NERC P01 (the P01 label is English only: it follows the code in the English reason and is left out of the translations)
  'dwc-eventdate': 'Darwin Core eventDate (where eventDate is empty, year/month/day are used)',
  'dwc-depth-metres': 'Darwin Core: depth below the surface in metres (positive down)',
  'dwc-term': 'Darwin Core {term}',
  'dwc-bookkeeping': 'Darwin Core {term}: identifier, count or bookkeeping, not a measured variable',
  p01: 'NERC P01 {code}',
  // from the values
  'excel-date': 'date-formatted Excel column',
  'values-degmin': 'values are degrees and minutes with hemisphere letters',
  'values-iso-dates': 'values are ISO dates',
  'numeric-unrecognised': 'numeric column with an unrecognised name',
  'text-column': 'text column (comments, methods, flags, references or empty)',
  'bare-latitude': '"{name}" can also be a width or a length; the values fit latitude and a longitude column is present',
  'bare-longitude': '"{name}" can also be a width or a length; the values fit longitude and a latitude column is present',
  // structure
  'no-header': 'column without a header',
  'long-format': 'long format: this column is read through the layout (parameter, unit or value)',
  'quality-flag': 'quality flag column',
  // another column won the slot ({name} is that column)
  'other-latitude': 'another column ("{name}") is used for latitude',
  'other-longitude': 'another column ("{name}") is used for longitude',
  'other-date': 'another column ("{name}") is used for the date',
  'other-time': 'another column ("{name}") is used for time',
  'other-depth': 'another column ("{name}") is used for depth',
  'other-station': 'another column ("{name}") is used for station',
  'other-cruise': 'another column ("{name}") is used for cruise',
  'other-sample': 'another column ("{name}") is used for sampleId',
  // a lead or a note joined to the main reason with "; "
  'lead-empty': 'column is empty',
  'note-negative-up': 'negative values: depth is positive up',
  'note-depth-not-stated': 'the header does not say whether depth is counted down or up',
  'note-depth-range-unread': 'this one is the other end of a depth range and is not read (one depth column per sheet)',
} as const;
export type ReasonCode = keyof typeof CHECK_REASONS;
export type ReasonParams = Record<string, string>;

/** A reason with its code: `reason` is the English text, the rest lets the page say it in the reader's language. */
export interface Why {
  reason: string;
  code: ReasonCode;
  params?: ReasonParams;
}

/** The English text of a reason code, placeholders filled. */
export function reasonEnglish(code: ReasonCode, params?: ReasonParams): string {
  return CHECK_REASONS[code].replace(/\{(\w+)\}/g, (_, k: string) => params?.[k] ?? `{${k}}`);
}

/** A NERC P01 code in a header: the English reason adds the English label of the concept (`NERC P01 CODE: label`), the translations name the code only. */
export function p01Why(code: string, meaning: string): Why {
  return { reason: `${reasonEnglish('p01', { code })}: ${meaning}`, code: 'p01', params: { code } };
}

export function why(code: ReasonCode, params?: ReasonParams): Why {
  return params === undefined ? { reason: reasonEnglish(code), code } : { reason: reasonEnglish(code, params), code, params };
}

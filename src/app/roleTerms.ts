// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RoleChoice } from './mappingModel';
import { t } from './i18n';
import type { UiKey } from '../core/i18n/ui';

/*
 * The Darwin Core terms each /convert role writes, as the exporter writes them (src/core/convert/dwca.ts: EVENT_COLUMNS, OCCURRENCE_COLUMNS, EMOF_COLUMNS). One map for the
 * role dropdown and the tip of the roles list, so that the two cannot disagree. Term names are not translated. `emof`: the terms are columns of the measurement table
 * (eMoF), not of Event or Occurrence. A role with no terms writes no column of its own: it only steers how the other columns are read (ignore, hemisphere, pressure,
 * a bound or sign of a depth is read by the depth roles). The test checks that every term is a real Darwin Core / OBIS term.
 */
export interface RoleTerms {
  readonly terms: readonly string[];
  readonly emof?: true;
}

const none: RoleTerms = { terms: [] };
const own = (...terms: string[]): RoleTerms => ({ terms });
const emof = (...terms: string[]): RoleTerms => ({ terms, emof: true });

export const ROLE_TERMS: Readonly<Record<string, RoleTerms>> = {
  ignore: none,
  sampleId: own('eventID'),
  station: own('eventID', 'parentEventID'),
  cruise: own('eventID', 'parentEventID'),
  date: own('eventDate'),
  dateYear: own('eventDate'),
  dateMonth: own('eventDate'),
  dateDay: own('eventDate'),
  datetime: own('eventDate'),
  time: own('eventDate'),
  latitude: own('decimalLatitude'),
  longitude: own('decimalLongitude'),
  hemisphere: none,
  depth: own('minimumDepthInMeters', 'maximumDepthInMeters'),
  depthBelowSeafloor: own('minimumDistanceAboveSurfaceInMeters', 'maximumDistanceAboveSurfaceInMeters'),
  measurementValue: emof('measurementValue'),
  measurementType: emof('measurementType'),
  measurementUnit: emof('measurementUnit'),
  measurementTypeId: emof('measurementTypeID'),
  measurementUnitId: emof('measurementUnitID'),
  measurementValueId: emof('measurementValueID'),
  measurementAccuracy: emof('measurementAccuracy'),
  measurementMethod: emof('measurementMethod'),
  measurementRemarks: emof('measurementRemarks'),
  pressure: none,
  taxon: own('scientificName'),
  taxonHeader: own('scientificName'),
  quantity: own('individualCount', 'organismQuantity'),
  quantityType: own('organismQuantityType'),
  effort: own('sampleSizeValue', 'sampleSizeUnit'),
  occurrenceId: own('occurrenceID'),
  lifeStage: own('lifeStage'),
  replicate: own('eventID', 'parentEventID'),
  biomass: emof('measurementType', 'measurementValue'),
  biomassWet: emof('measurementType', 'measurementValue'),
  biomassDry: emof('measurementType', 'measurementValue'),
  biomassAfdw: emof('measurementType', 'measurementValue'),
  qualifier: own('identificationQualifier'),
  taxonId: own('scientificNameID'),
  variable: emof('measurementType', 'measurementValue', 'measurementUnit'),
};

/** "eMoF measurementType / measurementValue", "eventDate", or '' for a role that writes no column. */
export function roleTermsText(choice: RoleChoice): string {
  const r = ROLE_TERMS[choice];
  if (r === undefined || r.terms.length === 0) return '';
  return `${r.emof ? 'eMoF ' : ''}${r.terms.join(' / ')}`;
}

/** The text of a dropdown entry and of its line in the tip: the label, then the terms it writes. A label that already names its terms (the eMoF roles) stays as it is. */
export function roleOptionText(choice: RoleChoice): string {
  const label = t(`role.${choice}` as UiKey);
  const r = ROLE_TERMS[choice];
  const text = roleTermsText(choice);
  if (text === '' || r.terms.every((term) => label.includes(term))) return label;
  return `${label} — ${text}`;
}

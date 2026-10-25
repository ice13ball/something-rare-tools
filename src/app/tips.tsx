// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { CATALOGUES } from '../../config/catalogues';
import { DATAVERSE_INSTALLATIONS, LINKED_FILE_MAX_BYTES } from '../../config/dataverse';
import { DATA_HOSTS } from '../../config/hosts';
import { IPT_MAX_BYTES } from '../../config/ipt';
import type { UiKey } from '../core/i18n/ui';
import type { Lang } from '../core/types';
import { t } from './i18n';
import { DERIVED_DECIMALS } from '../core/convert/events';
import { BASES_OF_RECORD, EML_VERSION, GBIF_PROFILE_VERSION, LICENCES } from '../core/convert/metadata';
import { P01, P06 } from '../core/convert/vocab';
import { NAME_PARTICLES, ORGANISATION_WORDS } from '../core/convert/metadata';
import { QUALIFIER_TOKENS, STAGE_TOKENS } from '../core/convert/taxon';
import { CONVERT_ROLE_CHOICES, ROLE_KINDS, roleChoiceLabelKey, roleLabelKey, type RoleKind } from './mappingModel';
import { ACCEPTED_EXTENSIONS } from './types';

/*
 * The registry of ⓘ explanations. A tip is `tip.<id>.does` ("what it does") + `tip.<id>.logic` ("the logic") in src/core/i18n/ui.ts.
 * ⛔ A number, a unit or a source in a tip is never typed into those texts: the text holds a {placeholder} and the entry below fills it
 * from the rule definition (`getRule(...).thresholds`), a constant of src/core/checks, or a config file. test/app/infotip-sources.test.ts
 * fails when a tip text carries a digit of its own or when a rendered number differs from the rule.
 * Every new tool and every new user decision ships with its entry (CONTRIBUTING.md, "Explanations").
 */

export type TipValues = Record<string, (lang: Lang) => React.ReactNode>;

export interface TipDef {
  /** The visible label of what the icon explains; the accessible name is "Explanation: <label>". */
  label: UiKey;
  /** What the {placeholders} of the logic text are filled with. */
  values?: TipValues;
  /** The rule whose details the "Rule details" link opens (docs/rules.md). */
  rule?: string;
  /** Every rule whose threshold or source the tip prints: checked to exist, and its numbers to appear. */
  backedBy?: readonly string[];
  /**
   * Values that need the rule definitions (thresholds, citations): loaded from ./tipRules when the tip is first opened, so that a page
   * whose tips need no rule data does not carry it (the index page, for one).
   */
  lazy?: () => Promise<TipValues>;
}

/* ---------- value sources ---------- */

const UNITS: Record<string, Record<Lang, string>> = {
  // Polish genitive plural: right for every number the rules use (5 and more); revisit if a threshold below 5 appears
  knots: { pl: 'węzłów', en: 'knots', de: 'Knoten', fr: 'nœuds' },
  km: { pl: 'km', en: 'km', de: 'km', fr: 'km' },
  m: { pl: 'm', en: 'm', de: 'm', fr: 'm' },
  MB: { pl: 'MB', en: 'MB', de: 'MB', fr: 'Mo' },
};

export const formatNumber = (n: number, lang: Lang): string => new Intl.NumberFormat(lang).format(n);
export const withUnit = (n: number, unit: string, lang: Lang): string => `${formatNumber(n, lang)} ${UNITS[unit]?.[lang] ?? unit}`;

/** The Dataverse installations the tool reads, as "RepOD (repod.icm.edu.pl)": from config/dataverse.ts. */
const dataverseList = (): string => DATAVERSE_INSTALLATIONS.map((i) => `${i.name} (${i.host})`).join(', ');
/** The GeoNetwork hosts a link may point at in /check: the allowlisted hosts that are GeoNetwork catalogues (config/hosts.ts). */
const geonetworkList = (): string => DATA_HOSTS.filter((h) => h.startsWith('geonetwork.')).join(', ');

const megabytes = (bytes: number) => (lang: Lang) => withUnit(Math.round(bytes / 1024 / 1024), 'MB', lang);

/* ---------- which rules a column role feeds ---------- */

/**
 * The rules that read a column of each role, checked against the code (file:line as of the commit that wrote this):
 *   latitude / longitude  rows.ts positionRules 61-95 (range, zero, equal), noCoord 467, onLand 317, stationMoved 244 (spread, with a station);
 *                         dataset.ts 247 (degrees+minutes), 163-164 (non-numeric cell, via reportBadNumber in the coordinate reader);
 *                         speed.ts (ship speed); crossfile.ts 499 (position swap) and 548 (position conflict), both with a station
 *   date / datetime       one slot in dataset.ts specsOf (`when`): dataset.ts 304 (unparseable), rows.ts dateMissing 351, yearOutlier 401,
 *                         dateFuture 568; speed.ts; crossfile.ts 278 (date conflict, with a station)
 *   time                  dataset.ts 311 and 319 only, and only beside a date column (it is combined with it)
 *   depth                 rows.ts depthSign 442, depthRules 515; crossfile.ts 92 (duplicate samples match on depth)
 *   station               dwc.ts 345 (invisible character); rows.ts stationMoved 244, noCoord 467; crossfile.ts 90-97 (duplicate samples), 278, 307 (alias), 366-548
 *   cruise                dwc.ts 345 (invisible character); speed.ts (groups by cruise), rows.ts noCoord 470, chemistry.ts 140
 *   sampleId              dwc.ts 345 (invisible character in an id column, via dataset.ts 649); it stands in for the station ONLY when sheets are
 *                         joined: dataset.ts withLookup returns before the stand-in line (454) without a join, so a single table gives no station
 *   pressure              dropped by specsOf (dataset.ts default branch): no rule and no output reads it
 *   variable              rows.ts unitMissing 435; dataset.ts 164 (non-numeric); chemistry.ts; crossfile.ts 233 (unit conflict);
 *                         metadata.ts 136 (variable named in the abstract)
 * test/app/infotip-sources.test.tsx checks that every id exists in the registry; the lists themselves are checked by reading, as above.
 */
const WHEN_RULES = ['ROW-DATE-UNPARSEABLE', 'ROW-DATE-MISSING', 'ROW-YEAR-OUTLIER', 'ROW-DATE-FUTURE', 'ROW-SHIP-SPEED', 'XF-DATE-CONFLICT'] as const;
export const ROLE_FEEDS: Record<RoleKind, readonly string[]> = {
  ignore: [],
  latitude: ['ROW-LAT-RANGE', 'ROW-LAT-EQ-LON', 'ROW-ZERO-COORD', 'ROW-NO-COORD', 'ROW-NON-NUMERIC', 'ROW-DM-COORDS', 'ROW-ON-LAND', 'ROW-STATION-SPREAD', 'ROW-SHIP-SPEED', 'XF-POSITION-CONFLICT', 'XF-POSITION-SWAP'],
  longitude: ['ROW-LON-RANGE', 'ROW-LAT-EQ-LON', 'ROW-ZERO-COORD', 'ROW-NO-COORD', 'ROW-NON-NUMERIC', 'ROW-DM-COORDS', 'ROW-ON-LAND', 'ROW-STATION-SPREAD', 'ROW-SHIP-SPEED', 'XF-POSITION-CONFLICT', 'XF-POSITION-SWAP'],
  datetime: WHEN_RULES,
  date: WHEN_RULES,
  time: ['ROW-DATE-UNPARSEABLE', 'ROW-TZ-UNKNOWN'],
  depth: ['ROW-DEPTH-SIGN', 'ROW-DEPTH-RANGE', 'XF-DUPLICATE-SAMPLES'],
  pressure: [],
  station: ['ROW-INVISIBLE-CHAR', 'ROW-STATION-MOVED', 'ROW-STATION-SPREAD', 'ROW-NO-COORD', 'XF-STATION-ALIAS', 'XF-DUPLICATE-SAMPLES', 'XF-DATE-CONFLICT', 'XF-POSITION-CONFLICT', 'XF-POSITION-SWAP'],
  cruise: ['ROW-INVISIBLE-CHAR', 'ROW-SHIP-SPEED', 'ROW-NO-COORD', 'CHEM-DIC-GT-TA'],
  sampleId: ['ROW-INVISIBLE-CHAR'],
  variable: ['ROW-UNIT-MISSING', 'ROW-NON-NUMERIC', 'CHEM-RANGE', 'CHEM-UNIT-PAIR', 'CHEM-DIC-GT-TA', 'XF-UNIT-CONFLICT', 'META-VARIABLE-MISSING'],
};

const rolesList = (): React.ReactNode => (
  <span className="infotip-list" role="list">
    {ROLE_KINDS.map((k) => (
      <span key={k} className="infotip-item" role="listitem">
        <strong>{t(roleLabelKey(k))}</strong> — {t(`tip.role.${k}` as UiKey)}
        {ROLE_FEEDS[k].length > 0 && (
          <>
            {' '}
            <span className="infotip-rules">
              {t('tip.roles.feeds')}: {ROLE_FEEDS[k].join(', ')}
            </span>
          </>
        )}
      </span>
    ))}
  </span>
);

/** The column meanings of /convert: the shared ones with their /check sentence, the converter's own with theirs. No rule feeds: no /check rule reads a converter role. */
const convertRolesList = (): React.ReactNode => (
  <span className="infotip-list" role="list">
    {CONVERT_ROLE_CHOICES.map((k) => (
      <span key={k} className="infotip-item" role="listitem">
        <strong>{t(roleChoiceLabelKey(k))}</strong> — {t(`tip.role.${k}` as UiKey)}
      </span>
    ))}
  </span>
);

const codes = (...terms: { code: string }[]): (() => string) => () => terms.map((x) => x.code).join(', ');

/* ---------- the registry ---------- */

const SHIP_RULES = ['ROW-SHIP-SPEED', 'ROW-SHIP-SPEED-UNUSUAL'] as const;

const DEFS = {
  // /check — input
  dropZone: { label: 'input.drop', values: { formats: () => ACCEPTED_EXTENSIONS.join(' ') } },
  linkField: {
    label: 'input.link.label',
    values: {
      dataverse: dataverseList,
      geonetwork: geonetworkList,
      maxFile: megabytes(LINKED_FILE_MAX_BYTES),
      maxArchive: megabytes(IPT_MAX_BYTES),
    },
  },
  downloadMode: { label: 'mode.legend', values: { maxFile: megabytes(LINKED_FILE_MAX_BYTES), maxArchive: megabytes(IPT_MAX_BYTES) } },
  // /check — confirm step
  layout: { label: 'layout.title', rule: 'IN-LAYOUT-UNSUPPORTED' },
  roles: { label: 'mapping.role', values: { roles: rolesList } },
  encoding: { label: 'tip.encoding.label', rule: 'IN-ENCODING-FALLBACK' },
  singleCruise: {
    label: 'confirm.singleCruise',
    rule: 'ROW-SHIP-SPEED',
    backedBy: SHIP_RULES,
    lazy: () => import('./tipRules').then((m) => m.SHIP_SPEED_VALUES),
  },
  // /check — report
  severities: { label: 'report.title' },
  notChecked: { label: 'notChecked.title' },
  mapLegend: { label: 'map.legend' },
  // /check — downloads
  cleanCsv: { label: 'downloads.cleanCsv' },
  sidecar: { label: 'downloads.sidecar' },
  iso19139: { label: 'downloads.iso' },
  datacite: { label: 'downloads.datacite' },
  draft: { label: 'downloads.draft' },
  geojson: { label: 'downloads.geojson' },
  // /licence
  licenceInput: { label: 'licence.input.label', values: { dataverse: dataverseList } },
  licenceOneDeposit: { label: 'licence.summary.title' },
  licenceSpdx: { label: 'licence.sources.title' },
  licenceDatacite: { label: 'licence.summary.dataciteSilent' },
  licenceAttribution: { label: 'licence.attr.title' },
  // /collection
  collectionKind: { label: 'collection.kind.legend' },
  collectionDois: { label: 'collection.dois.label' },
  collectionDatacite: { label: 'collection.dc.by' },
  collectionZenodo: { label: 'collection.zen.label' },
  collectionCsw: { label: 'collection.csw.label', values: { catalogues: () => CATALOGUES.map((c) => c.host).join(', ') } },
  collectionCross: { label: 'collection.csw.cross' },
  collectionRun: { label: 'collection.estimate.title' },
  // the index page: one per tool
  indexCheck: { label: 'index.card.title' },
  indexLicence: { label: 'index.licence.title' },
  indexCollection: { label: 'index.collection.title' },
  // /convert (hidden until its reveal)
  convertIntro: { label: 'convert.title' },
  convertRoles: { label: 'mapping.role', values: { roles: convertRolesList } },
  convertSheetUse: { label: 'convert.sheet.use' },
  convertShape: { label: 'convert.sheet.shape' },
  convertQuantityKind: { label: 'convert.quantity.kind', values: { countConcept: codes(P01.count) } },
  convertQuantityUnit: { label: 'convert.quantity.unit', values: { units: codes(P06.perM3, P06.perM2, P06.gPerM3, P06.gPerM2, P06.mgPerM3, P06.mgPerM2) } },
  convertQuantityBasis: {
    label: 'convert.quantity.basis',
    values: { concepts: codes(P01.wetPerVolume, P01.wetPerAreaBed, P01.dryPerVolume, P01.dryPerAreaBed, P01.afdwPerVolume, P01.afdwPerAreaBed) },
  },
  convertQuantityPer: { label: 'convert.quantity.per', values: { volumeConcept: codes(P01.densityVolume), areaConcept: codes(P01.densityAreaBed) } },
  convertQuantityMedium: { label: 'convert.quantity.medium' },
  convertEffort: { label: 'convert.effort.title', values: { volumeConcept: codes(P01.volumeSampled), areaConcept: codes(P01.areaSampled) } },
  convertCruise: { label: 'convert.cruise.label' },
  convertFullList: { label: 'convert.fullList' },
  convertStationPrefix: { label: 'convert.prefix' },
  convertFlattenStation: { label: 'convert.flatten.station' },
  convertFlattenCruise: { label: 'convert.flatten.cruise' },
  convertSplits: { label: 'convert.splits.title', values: { qualifiers: () => QUALIFIER_TOKENS.join(' '), stages: () => STAGE_TOKENS.join(', ') } },
  convertTaxa: { label: 'convert.taxa.label' },
  convertDepthBound: { label: 'mapping.bound' },
  convertEffortValue: { label: 'convert.effort.value' },
  convertEffortUnit: { label: 'convert.effort.unit', values: { units: codes(P06.m3, P06.m2) } },
  convertEffortDimension: { label: 'convert.effort.dimension', values: { volumeConcept: codes(P01.volumeSampled), areaConcept: codes(P01.areaSampled) } },
  convertCodes: { label: 'convert.codes.title' },
  convertTree: { label: 'convert.tree.title' },
  convertSummaryColumn: { label: 'convert.summary.column' },
  convertMetaTitle: { label: 'convert.meta.f.title' },
  convertMetaAbstract: { label: 'convert.meta.f.abstract' },
  convertMetaCreators: { label: 'convert.meta.f.creators', values: { particles: () => NAME_PARTICLES.join(', '), organisationWords: () => ORGANISATION_WORDS.join(', ') } },
  convertMetaContact: { label: 'convert.meta.f.contactName' },
  convertMetaInstitution: { label: 'convert.meta.f.institution' },
  convertMetaDatasetName: { label: 'convert.meta.f.datasetName' },
  convertMetaMethods: { label: 'convert.meta.f.methods' },
  convertLicence: { label: 'convert.meta.f.licence', values: { licences: () => LICENCES.join(', ') } },
  convertMetaFiles: { label: 'convert.metafiles.title' },
  convertMetaSource: { label: 'convert.meta.src.label' },
  convertMetaChoice: { label: 'convert.meta.src.choose.label' },
  convertMetaList: { label: 'convert.meta.src.list.label' },
  convertArchiveDesc: { label: 'convert.archdesc.title' },
  convertMetaCitation: { label: 'convert.meta.f.citation' },
  convertMetaCoverage: { label: 'convert.meta.cov.title' },
  convertLicenceTaken: { label: 'convert.licence.note.label', values: { licences: () => LICENCES.join(', ') } },
  convertLicenceOther: { label: 'convert.licence.note.label', values: { licences: () => LICENCES.join(', ') } },
  convertLicenceContradictory: { label: 'convert.licence.note.label', values: { licences: () => LICENCES.join(', ') } },
  convertLicenceMissing: { label: 'convert.licence.note.label', values: { licences: () => LICENCES.join(', ') } },
  convertBasis: { label: 'convert.meta.f.basis', values: { bases: () => BASES_OF_RECORD.join(', ') } },
  convertAccept: { label: 'convert.accept.title' },
  convertExport: { label: 'convert.export.title', values: { eml: () => `${EML_VERSION}, GBIF Metadata Profile ${GBIF_PROFILE_VERSION}`, derived: () => String(DERIVED_DECIMALS) } },
  convertCompanion: { label: 'convert.companion.button' },
  convertDevice: { label: 'convert.device.label', values: { instrument: codes(P01.instrument) } },
  convertMesh: { label: 'convert.mesh.label', values: { meshConcept: codes(P01.meshSize), unit: codes(P06.um) } },
} satisfies Record<string, TipDef>;

export type TipId = keyof typeof DEFS;
export const TIPS: Record<TipId, TipDef> = DEFS;
export const TIP_IDS = Object.keys(DEFS) as TipId[];

/**
 * Replaces {name} in a tip text with the value of that name; a name with no value stays as written (a test makes that a failure), or shows
 * an ellipsis while the values of a lazy tip are still being loaded.
 */
export function fillValues(text: string, values: TipValues, lang: Lang, pending = false): React.ReactNode[] {
  return text.split(/\{(\w+)\}/).map((part, i) => {
    if (i % 2 === 0) return part;
    const v = values[part];
    return <React.Fragment key={i}>{v ? v(lang) : pending ? '…' : `{${part}}`}</React.Fragment>;
  });
}

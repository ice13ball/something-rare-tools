// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import React from 'react';
import { CATALOGUES } from '../../config/catalogues';
import { DATAVERSE_INSTALLATIONS, LINKED_FILE_MAX_BYTES } from '../../config/dataverse';
import { DATA_HOSTS } from '../../config/hosts';
import { IPT_MAX_BYTES } from '../../config/ipt';
import { SHIP_SPEED_MIN_SEPARATION_KM } from '../core/checks/constants';
import type { UiKey } from '../core/i18n/ui';
import { getRule } from '../core/rules/registry';
import type { Lang } from '../core/types';
import { t } from './i18n';
import { ROLE_KINDS, roleLabelKey, type RoleKind } from './mappingModel';
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
const withUnit = (n: number, unit: string, lang: Lang): string => `${formatNumber(n, lang)} ${UNITS[unit]?.[lang] ?? unit}`;

function thresholdOf(ruleId: string, name: string) {
  const th = getRule(ruleId).thresholds?.find((x) => x.name === name);
  if (!th) throw new Error(`Rule ${ruleId} has no threshold "${name}"`);
  return th;
}

/** "40 knots": value and unit of a rule's threshold. */
const thresholdText = (ruleId: string, name: string) => (lang: Lang) => {
  const th = thresholdOf(ruleId, name);
  return withUnit(th.value, th.unit, lang);
};

/** The short name of a threshold's source, linked: "Met Office marine-qc" (the citation label up to its first comma or bracket). */
export const shortSource = (label: string): string => label.split(/[,(]/)[0].trim();
const thresholdSource = (ruleId: string, name: string) => () => {
  const c = thresholdOf(ruleId, name).citation;
  return c.url.startsWith('https://') ? (
    <a href={c.url} target="_blank" rel="noopener noreferrer">
      {shortSource(c.label)}
    </a>
  ) : (
    shortSource(c.label)
  );
};

/** The Dataverse installations the tool reads, as "RepOD (repod.icm.edu.pl)": from config/dataverse.ts. */
const dataverseList = (): string => DATAVERSE_INSTALLATIONS.map((i) => `${i.name} (${i.host})`).join(', ');
/** The GeoNetwork hosts a link may point at in /check: the allowlisted hosts that are GeoNetwork catalogues (config/hosts.ts). */
const geonetworkList = (): string => DATA_HOSTS.filter((h) => h.startsWith('geonetwork.')).join(', ');

const megabytes = (bytes: number) => (lang: Lang) => withUnit(Math.round(bytes / 1024 / 1024), 'MB', lang);

/* ---------- which rules a column role feeds ---------- */

/**
 * The rules that read a column of each role. A hand-kept list: test/app/infotip-sources.test.ts checks that every id exists, and that
 * a role listed for a rule is really one the rule's own text names.
 */
export const ROLE_FEEDS: Record<RoleKind, readonly string[]> = {
  ignore: [],
  latitude: ['ROW-LAT-RANGE', 'ROW-ON-LAND', 'ROW-ZERO-COORD', 'ROW-NO-COORD', 'ROW-STATION-SPREAD', 'ROW-SHIP-SPEED'],
  longitude: ['ROW-LON-RANGE', 'ROW-ON-LAND', 'ROW-ZERO-COORD', 'ROW-NO-COORD', 'ROW-STATION-SPREAD', 'ROW-SHIP-SPEED'],
  datetime: ['ROW-DATE-UNPARSEABLE', 'ROW-DATE-FUTURE', 'ROW-SHIP-SPEED', 'XF-DATE-CONFLICT'],
  date: ['ROW-DATE-UNPARSEABLE', 'ROW-DATE-MISSING', 'ROW-YEAR-OUTLIER', 'ROW-SHIP-SPEED'],
  time: ['ROW-TZ-UNKNOWN', 'ROW-SHIP-SPEED'],
  depth: ['ROW-DEPTH-SIGN', 'ROW-DEPTH-RANGE', 'ROW-DEPTH-MIN-MAX'],
  pressure: ['CHEM-RANGE'],
  station: ['ROW-STATION-MOVED', 'ROW-STATION-SPREAD', 'XF-STATION-ALIAS'],
  cruise: ['ROW-SHIP-SPEED'],
  sampleId: ['XF-DUPLICATE-SAMPLES'],
  variable: ['ROW-UNIT-MISSING', 'ROW-NON-NUMERIC', 'CHEM-RANGE', 'CHEM-UNIT-PAIR', 'XF-UNIT-CONFLICT', 'META-VARIABLE-MISSING'],
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
  downloadMode: { label: 'mode.legend', values: { maxFile: megabytes(LINKED_FILE_MAX_BYTES) } },
  // /check — confirm step
  layout: { label: 'layout.title', rule: 'IN-LAYOUT-UNSUPPORTED' },
  roles: { label: 'mapping.role', values: { roles: rolesList } },
  encoding: { label: 'tip.encoding.label', rule: 'IN-ENCODING-FALLBACK' },
  singleCruise: {
    label: 'confirm.singleCruise',
    rule: 'ROW-SHIP-SPEED',
    backedBy: SHIP_RULES,
    values: {
      extreme: thresholdText('ROW-SHIP-SPEED', 'speed.extreme'),
      extremeSrc: thresholdSource('ROW-SHIP-SPEED', 'speed.extreme'),
      unusual: thresholdText('ROW-SHIP-SPEED-UNUSUAL', 'speed.unusual'),
      unusualSrc: thresholdSource('ROW-SHIP-SPEED-UNUSUAL', 'speed.unusual'),
      minSeparation: (lang: Lang) => withUnit(SHIP_SPEED_MIN_SEPARATION_KM, 'km', lang),
    },
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
} satisfies Record<string, TipDef>;

export type TipId = keyof typeof DEFS;
export const TIPS: Record<TipId, TipDef> = DEFS;
export const TIP_IDS = Object.keys(DEFS) as TipId[];

/** Replaces {name} in a tip text with the value of that name; a name with no value stays as written (a test makes that a failure). */
export function fillValues(text: string, values: TipValues, lang: Lang): React.ReactNode[] {
  return text.split(/\{(\w+)\}/).map((part, i) => {
    if (i % 2 === 0) return part;
    const v = values[part];
    return <React.Fragment key={i}>{v ? v(lang) : `{${part}}`}</React.Fragment>;
  });
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Citation, Threshold } from '../types';

/**
 * Sources of every number and scientific basis used by the rules. All copied from
 * docs/research/qc-sources.md (section "Decisions" fixes which numbers are used).
 */
const ARGO_CTD = {
  label: 'Argo Quality Control Manual for CTD and Trajectory Data, v3.9 (20 Feb 2025)',
  url: 'https://archimer.ifremer.fr/doc/00228/33951/32470.pdf',
};
const ARGO_DOXY = {
  label: 'Argo Quality Control Manual for Dissolved Oxygen Concentration, v2.2 (15 Oct 2025)',
  url: 'https://archimer.ifremer.fr/doc/00354/46542/123086.pdf',
};
const GTSPP = {
  label: 'GTSPP Real-Time Quality Control Manual, IOC Manuals and Guides 22, rev. 1 (2010)',
  url: 'https://cdn.ioos.noaa.gov/media/2017/12/mg22rev1.pdf',
};
const CIAAW = {
  label: 'CIAAW, Abridged Standard Atomic Weights (2024)',
  url: 'https://ciaaw.org/abridged-atomic-weights.htm',
};
const TEOS10 = {
  label: 'TEOS-10 Manual, IOC Manuals and Guides 56',
  url: 'https://www.teos-10.org/pubs/TEOS-10_Manual.pdf',
};
const DICKSON_2007 = {
  label: 'Dickson, Sabine & Christian (2007), Guide to Best Practices for Ocean CO2 Measurements, PICES Special Publication 3',
  url: 'https://www.ncei.noaa.gov/access/ocean-carbon-acidification-data-system/oceans/Handbook_2007/Guide_all_in_one.pdf',
};
const GLODAP_2023 = {
  label: 'Lauvset et al. (2024), GLODAPv2.2023, Earth System Science Data 16, 2047',
  url: 'https://essd.copernicus.org/articles/16/2047/2024/',
};
const UNESCO_TP44 = {
  label: 'Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44 (GitHub-hosted copy)',
  url: 'https://raw.github.com/ocefpaf/python-seawater/master/docs/UNESCO-TechPaper44_eo.pdf',
};
const MS_DATE_SYSTEMS = {
  label: 'Microsoft Support, Date systems in Excel',
  url: 'https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487',
};
const DATACITE_DATE = {
  label: 'DataCite Metadata Schema 4.6, property Date',
  url: 'https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/date/',
};
const W3C_DATETIME = {
  label: 'W3C Note, Date and Time Formats (profile of ISO 8601)',
  url: 'https://www.w3.org/TR/NOTE-datetime',
};

const cite = (base: { label: string; url: string }, locator: string): Citation => ({ ...base, locator });
const th = (name: string, value: number, unit: string, citation: Citation): Threshold => ({ name, value, unit, citation });

export const CITE = {
  // position test: Argo Test 3 "Impossible location test"
  argoLocation: cite(ARGO_CTD, 'section 2.1.2, Test 3 "Impossible location test", p.11'),
  gtsppLocation: cite(GTSPP, 'Annex B, Test 1.3 "Impossible Location", PDF p.44'),
  // global range tests
  argoCtdRange: cite(ARGO_CTD, 'section 2.1.2, Test 6 "Global range test", p.12'),
  argoDoxyRange: cite(ARGO_DOXY, 'section 2.2.1, Test 6 "Global range test", p.9'),
  gtsppPh: cite(GTSPP, 'Annex B, Table 2.1 "Global Impossible Parameter Values" (row pH, unit listed as none), PDF p.64'),
  // molar masses
  ciaawAtomicWeight: (symbol: string, name: string, weight: string): Citation =>
    cite(CIAAW, `table, "${symbol} ${name} ${weight}"`),
  // carbonate system and unit conversion (no numeric threshold)
  teos10StandardSeawater: cite(TEOS10, 'Appendix A.4, printed pp.80-81 (Standard Seawater: TA 2300 and DIC 2080 µmol/kg at SP = 35)'),
  dicksonDic: cite(DICKSON_2007, 'SOP 2 section 1, PDF p.39 (oceanic DIC 1800–2300 µmol/kg)'),
  dicksonTa: cite(DICKSON_2007, 'SOP 3a section 1, PDF p.53 (oceanic TA 2000–2500 µmol/kg)'),
  glodapUnitConversion: cite(GLODAP_2023, 'section 3.1 (per-litre to per-kilogram conversion with seawater density)'),
  unescoDensity: cite(UNESCO_TP44, 'PDF p.23, check values of seawater density'),
  // dates
  excelDateSystems: cite(MS_DATE_SYSTEMS, '1900 and 1904 date systems; "The difference between the two date systems is 1,462 days."'),
  dataciteDate: cite(DATACITE_DATE, 'section 8 Date, allowed formats'),
  w3cDatetime: cite(W3C_DATETIME, 'Formats: complete date YYYY-MM-DD'),
};

export { th };

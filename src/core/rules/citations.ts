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

const MARINE_QC = {
  label: 'Met Office marine-qc (marine_qc) documentation, "Track check"',
  url: 'https://marine-qc.readthedocs.io/en/latest/track_check.html',
};
const MEDATLAS = {
  label: 'MEDATLAS Protocol, Part I: exchange format and quality checks for observed profiles, v3 (SISMER/IFREMER, Dec 2001)',
  url: 'https://nodc.ogs.it/repository/documents/guidelines/medman_v3.pdf',
};
const WOD18 = {
  label: 'World Ocean Database 2018 User\'s Manual (prerelease, v0.10; Garcia et al.)',
  url: 'https://www.ncei.noaa.gov/data/oceans/woa/WOD/DOC/WOD18-UsersManual_final.pdf',
};

const INSPIRE_TG = {
  label: 'INSPIRE Technical Guidelines for metadata based on ISO 19139, v2.2.1 (published 2025-01-31)',
  url: 'https://inspire-mif.github.io/technical-guidelines/metadata/metadata-iso19139/metadata-iso19139.html',
};
const GOFAIR_R11 = {
  label: 'GO FAIR, FAIR Principle R1.1',
  url: 'https://www.go-fair.org/fair-principles/r1-1-metadata-released-clear-accessible-data-usage-license/',
};
const DATACITE_RIGHTS = {
  label: 'DataCite Metadata Schema 4.6, 16. Rights',
  url: 'https://datacite-metadata-schema.readthedocs.io/en/4.6/properties/rights/',
};
const OPENAIRE_RIGHTS = {
  label: 'OpenAIRE Guidelines for Data Archives, 16. Rights (MA)',
  url: 'https://guidelines.openaire.eu/en/latest/data/field_rights.html',
};
const SPDX_HANDLING = { label: 'SPDX, Handling license info', url: 'https://spdx.dev/learn/handling-license-info/' };
const CC_FAQ = { label: 'Creative Commons FAQ', url: 'https://creativecommons.org/faq/' };
const CC_ATTRIBUTION = {
  label: 'Creative Commons wiki, Best practices for attribution',
  url: 'https://wiki.creativecommons.org/wiki/Best_practices_for_attribution',
};
const ISO_CODELISTS = {
  label: 'ISO/TS 19139 code lists (gmxCodelists.xml), MD_RestrictionCode',
  url: 'https://standards.iso.org/iso/19139/resources/gmxCodelists.xml',
};

const cite = (base: { label: string; url: string }, locator: string): Citation => ({ ...base, locator });
const th = (name: string, value: number, unit: string, citation: Citation): Threshold => ({ name, value, unit, citation });

export const CITE = {
  // position test: Argo Test 3 "Impossible location test"
  argoLocation: cite(ARGO_CTD, 'section 2.1.2, Test 3 "Impossible location test", p.11'),
  // ROW-ON-LAND: the published test, and the land map it uses here (verified 2026-10-23 in the opened PDF)
  argoLand: cite(ARGO_CTD, 'section 2.1.2, Test 4 "Position on land test", p.11'),
  naturalEarthLand: { label: 'Natural Earth 1:10m physical vectors: land, minor islands, lakes, v5.1.2 (public domain)', url: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/', locator: 'layers ne_10m_land, ne_10m_minor_islands, ne_10m_lakes; rasterised by scripts/land-mask.py' },
  gtsppLocation: cite(GTSPP, 'Annex B, Test 1.3 "Impossible Location", PDF p.44'),
  // ROW-SHIP-SPEED*: the two numbers (read in the opened documents, 24.10.2026) and the sources that name date or position as the possible error
  marineQcExtremeSpeed: cite(MARINE_QC, 'section "Extreme speed check": "If the speed estimated from the locations at t-1 and t exceeds 40 knots, set the extreme speed check flag to fail." (the check itself compares one pair; both-sides logic: sections "Speed check" and "The combined track check")'),
  medatlasShipVelocity: cite(MEDATLAS, 'section 4.4.4 "Check the ship velocity", PDF p.29: "If the ship velocity > maximum velocity of the ship (default is 15 knots) between two consecutive profiles, find the erroneous data (date or location)"'),
  gtsppImpossibleSpeed: cite(GTSPP, 'Annex B, Test 1.5 "Impossible Speed", PDF p.53 (per-platform maximum speed; the operator decides whether position or date/time is wrong)'),
  wodSpeedCheck: cite(WOD18, 'section 4 "Speed check", printed p.31: "If the speed between adjoining casts is unrealistic, the date/time may be in error, the position may be wrong, or the cast may not belong to this cruise/platform."'),
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
  // licence rules (quotes verified against the fetched pages, 22.10.2026)
  inspireValues: cite(INSPIRE_TG, 'section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "The element must have values."'),
  inspireNoConditions: cite(INSPIRE_TG, 'section 2.3.7 (quoting Regulation 1205/2008 Part B 8.1): "If no conditions apply to the access and use of the resource, ‘no conditions apply’ shall be used."'),
  inspireLink: cite(INSPIRE_TG, 'TG Recommendation C.10, section 2.3.7: "For detailed information about the licensing of the resource it is recommended to provide a link to a license type (e.g. http://creativecommons.org/licenses/by/3.0 ), a website or to a document containing the necessary information."'),
  inspireOtherRestrictions: cite(INSPIRE_TG, 'TG Requirement C.18, section 2.3.7: "In both cases this element shall contain a gmd:MD_RestrictionCode element with code list value "otherRestrictions"."'),
  inspireOtherConstraints: cite(INSPIRE_TG, 'TG Requirement C.18, section 2.3.7: "Additionally at least one instance of gmd:otherConstraints shall be given describing the actual conditions."'),
  isoRestricted: cite(ISO_CODELISTS, 'MD_RestrictionCode "restricted": "withheld from general circulation or disclosure"'),
  fairLicence: cite(GOFAIR_R11, 'heading "Interpretation of R1.1": "Digital resources and their metadata must always, without exception, include a license that describes under which conditions the resource can be used, even if that is “unconditional”."'),
  fairFindable: cite(GOFAIR_R11, 'heading "Interpretation of R1.1": "Note also that a license that cannot be found by an agent, is effectively the same as no license at all."'),
  fairDifferent: cite(GOFAIR_R11, 'heading "Interpretation of R1.1": "Furthermore, the license may be different for a data resource and the metadata that describes it"'),
  dataciteTitle: cite(DATACITE_RIGHTS, '16. Rights, allowed values, examples, other constraints: "Use the complete title of a license and include version information if applicable."'),
  dataciteIdentifier: cite(DATACITE_RIGHTS, '16.b rightsIdentifier: "A short, standardized version of the license name."'),
  dataciteUri: cite(DATACITE_RIGHTS, '16.a rightsURI: "The URI of the license."'),
  dataciteRepeat: cite(DATACITE_RIGHTS, '16. Rights, definition: "The property may be repeated to record complex rights characteristics."'),
  openaireRecommends: cite(OPENAIRE_RIGHTS, '16. Rights (MA), note: "In particular OpenAIRE also recommends including license information if available."'),
  openaireMandatory: cite(OPENAIRE_RIGHTS, '16. Rights (MA), note: "Mandatory when applicable property in OpenAIRE instead of optional in DataCite."'),
  spdxList: cite(SPDX_HANDLING, '"SPDX License List" paragraph: "The SPDX License List includes a standardized short identifier, the full name, the license text, and a canonical permanent URL for each license and exception."'),
  ccDualLicensing: cite(CC_FAQ, 'separate agreements: "You may offer the licensed material under other licenses in addition to the CC license (a practice commonly referred to as “dual licensing”)."'),
  ccDualChoice: cite(CC_FAQ, 'separate agreements: "A reuser may then choose which set of terms to comply with."'),
  ccModified: cite(CC_FAQ, 'Alterations and additions to the license, "Can I change the license terms or conditions?": "if you change the terms and conditions of any Creative Commons license, you must no longer call, label, or describe the license as a “Creative Commons” or “CC” license"'),
  ccCopyright: cite(CC_FAQ, 'How do CC licenses operate?: "CC licenses are operative only when applied to material in which a copyright exists, and even then only when a particular use would otherwise not be permitted by copyright."'),
  ccNameAndLink: cite(CC_ATTRIBUTION, 'section on licence attribution: "We recommend that you name and provide a link to the license, e.g., CC BY 4.0 ( http://creativecommons.org/licenses/by/4.0 ) for a work licensed under CC BY 4.0."'),
};

export { th };

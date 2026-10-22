// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Licence normalisation. Pure functions, no I/O. The ONLY place that turns licence text or a URI into an SPDX id
// and the ONLY definition of "open" (isOpenLicence). The cross-source analysis lives in ../licence/analyse.ts.
import type { LicenceClass, LicenceStatement, MetadataSource } from '../types';
import { SPDX_ENTRIES, SPDX_LIST_VERSION } from './spdx-data';

export { SPDX_LIST_VERSION };

/** ISO 19115 MD_RestrictionCode values that signal a restriction on the data. */
export const RESTRICTIVE_CODES = [
  'copyright',
  'patent',
  'patentPending',
  'trademark',
  'license',
  'intellectualPropertyRights',
  'restricted',
  'otherRestrictions',
] as const;

/** `otherRestrictions` is the ISO way to say "see otherConstraints", so on its own it says nothing. */
export const NEUTRAL_CODES: readonly string[] = ['otherRestrictions'];

export function isRestrictiveCode(code: string): boolean {
  return (RESTRICTIVE_CODES as readonly string[]).includes(code) && !NEUTRAL_CODES.includes(code);
}

/* ---------- the identifiers we can classify ---------- */

export interface SpdxInfo {
  id: string;
  /** Official SPDX name, e.g. "Creative Commons Attribution 4.0 International". */
  name: string;
  /** Canonical URL from the SPDX list, for the attribution line. */
  url: string;
}

const INFO = new Map<string, SpdxInfo>(SPDX_ENTRIES.map((e) => [e.id, e]));

/** Name and canonical URL of an id the tool can classify; undefined for any other id. */
export function spdxInfo(id: string | undefined): SpdxInfo | undefined {
  return id ? INFO.get(id) : undefined;
}

/** Every id the tool can classify, with its official name and URL. */
export const KNOWN_LICENCES: readonly SpdxInfo[] = SPDX_ENTRIES;

/**
 * Open in the Open Definition sense: reuse and redistribution allowed without NC/ND restrictions.
 * Every classifiable id is open except Creative Commons NonCommercial and NoDerivatives. Unknown ids are not open.
 * (Software licences count as open too: this only decides whether restriction codes next to the licence are a contradiction.)
 */
export function isOpenLicence(spdx?: string): boolean {
  return !!spdx && INFO.has(spdx) && !/^CC-BY-(NC|ND)(-|$)/.test(spdx);
}

/* ---------- URI -> id ---------- */

/** `oneOf`: a URI that fits several SPDX ids (GPL-3.0-only and -or-later share one URL); a text naming one of them agrees with it. */
type Read = { id?: string; unmapped?: boolean; family?: string; oneOf?: string[] };

/** SPDX ids exist only for these ports; the suffix of a ported id is the upper-case country (or IGO) code. */
const PORTS = [...new Set(SPDX_ENTRIES.map((e) => /^CC-.*-\d\.\d-([A-Z]+)$/.exec(e.id)?.[1]).filter((p): p is string => !!p))];

const known = (id: string): Read => (INFO.has(id) ? { id } : { unmapped: true });

/** BY, NC, SA, ND in SPDX order (NC before ND/SA); "by-nd-nc" of the 1.0 URLs becomes BY-NC-ND. */
function ccVariant(raw: string): string {
  const parts = raw.toUpperCase().split(/[\s_-]+/).filter(Boolean);
  const ordered = ['NC', 'ND', 'SA'].filter((p) => parts.includes(p));
  return ['BY', ...ordered].join('-');
}

function ccId(variant: string, version: string, port?: string): Read {
  // 4.0 has no ports: a trailing language segment there is a deed language.
  const p = version === '4.0' ? undefined : port;
  return known(`CC-${ccVariant(variant)}-${version}${p ? `-${p.toUpperCase()}` : ''}`);
}

const GNU_VARIANTS = (base: string): string[] => [`${base}-only`, `${base}-or-later`];

/** Software licences by their canonical pages (opensource.org, apache.org, mozilla.org, gnu.org). `u` is lower-case. */
function readSoftwareUri(u: string): Read | undefined {
  const osi = /opensource\.org\/licen[sc]es?\/(mit|apache-2\.0|bsd-2-clause|bsd-3-clause|isc|mpl-2\.0|l?gpl-[23]\.[01]|agpl-3\.0)(?![a-z0-9.-])/.exec(u);
  const gnu = /gnu\.org\/licenses\/(?:old-licenses\/)?(l?gpl-[23]\.[01]|agpl-3\.0|agpl)(?:\.[a-z]{2})?(?:-standalone)?(?:\.(?:html|txt))?(?![a-z0-9.-])/.exec(u);
  const key = osi?.[1] ?? gnu?.[1];
  if (key) {
    if (/gpl/.test(key)) {
      const base = (key === 'agpl' ? 'agpl-3.0' : key).toUpperCase();
      return { unmapped: true, oneOf: GNU_VARIANTS(base).filter((id) => INFO.has(id)) };
    }
    return known({ mit: 'MIT', 'apache-2.0': 'Apache-2.0', 'bsd-2-clause': 'BSD-2-Clause', 'bsd-3-clause': 'BSD-3-Clause', isc: 'ISC', 'mpl-2.0': 'MPL-2.0' }[key]!);
  }
  if (/apache\.org\/licenses\/license-2\.0/.test(u)) return { id: 'Apache-2.0' };
  if (/mozilla\.org\/mpl\/2\.0/.test(u)) return { id: 'MPL-2.0' };
  if (/(opensource\.org\/licen[sc]es?\/|gnu\.org\/licenses\/|apache\.org\/licenses\/|mozilla\.org\/mpl\/)/.test(u)) return { unmapped: true };
  return undefined;
}

function readUri(uri: string): Read {
  const u = uri.trim().toLowerCase();
  // https://creativecommons.org/licenses/by-nc-sa/4.0/{legalcode,deed.pl,pl/} — host, scheme, www, trailing parts are irrelevant.
  // A bare 2-4 letter segment after the version is a PORT (jurisdiction); "deed.pl" / "legalcode.de" are deed languages.
  const cc = /creativecommons\.org\/licen[sc]es\/(by(?:-(?:nc|sa|nd))*)\/(\d\.\d)(?![\d])(?:\/([a-z]{2,4})(?=[/?#]|$))?/.exec(u);
  if (cc) return ccId(cc[1], cc[2], cc[3] && cc[3] !== 'deed' ? cc[3] : undefined);
  if (/creativecommons\.org\/licen[sc]es\//.test(u)) return { unmapped: true };
  if (/creativecommons\.org\/publicdomain\/zero\/1\.0(?![\d])/.test(u)) return { id: 'CC0-1.0' };
  if (/creativecommons\.org\/publicdomain\//.test(u)) return { unmapped: true };
  const odc = /opendatacommons\.org\/licenses\/(odbl|pddl|by)\/(\d)[-.](\d)/.exec(u);
  if (odc) return known(`${{ odbl: 'ODbL', pddl: 'PDDL', by: 'ODC-By' }[odc[1] as 'odbl']}-${odc[2]}.${odc[3]}`);
  if (/opendatacommons\.org\/licenses\//.test(u)) return { unmapped: true };
  const ogl = /nationalarchives\.gov\.uk\/doc\/open-government-licen[cs]e\/version\/(\d)/.exec(u);
  if (ogl) return known(`OGL-UK-${ogl[1]}.0`);
  if (/nationalarchives\.gov\.uk\/doc\/open-government-licen[cs]e/.test(u)) return { unmapped: true };
  const dl = /govdata\.de\/dl-de\/(by|zero)-(\d)-(\d)/.exec(u);
  if (dl) return known(`DL-DE-${dl[1].toUpperCase()}-${dl[2]}.${dl[3]}`);
  if (/govdata\.de\/dl-de\//.test(u)) return { unmapped: true };
  const soft = readSoftwareUri(u);
  if (soft) return soft;
  const nlod = /data\.norge\.no\/nlod\/(?:[a-z]{2}\/)?(\d)\.(\d)/.exec(u);
  if (nlod) return known(`NLOD-${nlod[1]}.${nlod[2]}`);
  if (/data\.norge\.no\/nlod/.test(u)) return { unmapped: true };
  return {};
}

/** The id a licence URI names, or undefined (unknown URI, a port or version SPDX has no id for). */
export function spdxFromUri(uri: string): string | undefined {
  return readUri(uri).id;
}

/* ---------- text -> id ---------- */

const PORT_NAMES: Record<string, string> = {
  germany: 'DE',
  austria: 'AT',
  australia: 'AU',
  netherlands: 'NL',
  'united states': 'US',
  igo: 'IGO',
  france: 'FR',
  'england and wales': 'UK',
  japan: 'JP',
};
const PORT_NAME_RE = Object.keys(PORT_NAMES)
  .map((n) => n.replace(/ /g, '\\s+'))
  .join('|');

/** ISO 3166-1 alpha-2 codes (plus UK): a capitalised two-letter token after a version is read as a port only if it is one of them ("OR" is not). */
const ISO_CODES = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW UK EU`.split(/\s+/),
);

/** Words that may follow a version of a CC name and are not a jurisdiction. Any other capitalised word is taken for a port without an SPDX id. */
const NOT_A_PORT = new Set([
  'international', 'unported', 'generic', 'universal', 'license', 'licence', 'licensed', 'licenced', 'deed', 'legal', 'legalcode', 'code',
  'attribution', 'public', 'and', 'or', 'with', 'for', 'to', 'at', 'by', 'under', 'the', 'a', 'in', 'of', 'on', 'see', 'version', 'only',
]);

/* The elements of the official CC names in en / de / fr / pl. Inside a licence name they are the licence, not conditions added to it. */
const ELEM_NC = "non[\\s-]?commercial|nicht[\\s-]?kommerziell|pas\\s+d['’]utilisation\\s+commerciale|użycie\\s+niekomercyjne";
const ELEM_ND = 'no[\\s-]?derivatives?|no[\\s-]?derivs|keine\\s+bearbeitungen|pas\\s+de\\s+modifications?|bez\\s+utworów\\s+zależnych';
const ELEM_SA = 'share[\\s-]?alike|weitergabe\\s+unter\\s+gleichen\\s+bedingungen|partage\\s+dans\\s+les\\s+mêmes\\s+conditions|na\\s+tych\\s+samych\\s+warunkach';
const ELEMS = `(?:${ELEM_NC}|${ELEM_ND}|${ELEM_SA})`;
const ELEM_SEP = '[\\s,–—-]+';
const NAME_START = '(attribution|namensnennung|uznanie\\s+autorstwa)';

interface Pattern {
  re: RegExp;
  /** undefined = the match is not a licence name after all. */
  read: (m: RegExpExecArray) => (Read & { span?: [number, number] }) | undefined;
}

/**
 * What a port token after the version means. A capitalised ISO code, a country name or "(IGO)" is a port (an SPDX id exists only for some);
 * a lower-case code only where SPDX has the port and it ends the phrase ("cc by-sa 3.0 de") or follows a dash ("cc-by-3.0-de"):
 * "CC-BY-3.0 at Zenodo" is not Austria. 4.0 has no ports. Any other capitalised word after a version below 4.0 may be a jurisdiction
 * ("3.0 Poland"): the licence is then unrecognised, never the generic one.
 */
function readPort(version: string, sep: string, code: string | undefined, fallback: string | undefined, after: string): { port?: string; ignored: boolean; unmapped: boolean } {
  if (version === '4.0') return { ignored: !!code, unmapped: false };
  if (code) {
    const lower = code.toLowerCase().replace(/\s+/g, ' ');
    const named = PORT_NAMES[lower];
    if (named) return { port: named, ignored: false, unmapped: false };
    // "NC", "ND", "SA" after a version are licence elements (Saudi Arabia, New Caledonia are not what is meant): conditions, never a port.
    if (/^(?:nc|nd|sa)$/i.test(code)) return { ignored: true, unmapped: false };
    const up = code.toUpperCase();
    if (code === up) return ISO_CODES.has(up) || up === 'IGO' ? { port: up, ignored: false, unmapped: false } : { ignored: true, unmapped: false };
    const endsPhrase = !/^\s*[\p{L}\p{N}]/u.test(after);
    if (PORTS.includes(up) && (/[-/]/.test(sep) || endsPhrase)) return { port: up, ignored: false, unmapped: false };
    return { ignored: true, unmapped: false };
  }
  if (fallback && /^\p{Lu}/u.test(fallback) && !NOT_A_PORT.has(fallback.toLowerCase())) return { ignored: true, unmapped: true };
  return { ignored: false, unmapped: false };
}

const elementsOf = (chain: string): string[] =>
  (chain.match(new RegExp(ELEMS, 'giu')) ?? []).map((p) => (new RegExp(`^(?:${ELEM_NC})$`, 'iu').test(p) ? 'NC' : new RegExp(`^(?:${ELEM_SA})$`, 'iu').test(p) ? 'SA' : 'ND'));

/**
 * The official SPDX names of the non-Creative-Commons licences ("Open Data Commons Open Database License v1.0", "Norwegian Licence for
 * Open Government Data (NLOD) 2.0"): a text that is the official name is the licence, not the licence plus extra words.
 */
const OFFICIAL_NAMES = SPDX_ENTRIES.filter((e) => (!e.id.startsWith('CC-') && !e.name.includes('"')) || e.id === 'CC0-1.0').map((e) => ({
  id: e.id,
  src: e.name
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
    .replace(/&/g, '(?:&|and)')
    .replace(/[–—]/g, '[–—-]'),
}));

const PATTERNS: Pattern[] = [
  {
    re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...OFFICIAL_NAMES].sort((a, b) => b.src.length - a.src.length).map((n) => n.src).join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
    read: (m) => {
      const hit = OFFICIAL_NAMES.find((n) => new RegExp(`^${n.src}$`, 'iu').test(m[0]));
      return hit ? known(hit.id) : undefined;
    },
  },
  {
    // "CC BY 4.0", "cc-by-4.0", "CC BY-NC-SA 3.0 DE", "CC-BY-3.0-IGO", "CC BY 3.0 Germany", "CC BY 3.0 (IGO)". A version is mandatory for an id.
    re: new RegExp(
      `((?<![a-z0-9])cc[\\s_-]*(by(?:[\\s_-]*(?:nc|sa|nd))*)[\\s_-]*(\\d\\.\\d)(?![\\d]))(?:([\\s_/(-]*)(${PORT_NAME_RE}|[a-z]{2})(?![a-z0-9])|\\s+(\\p{L}[\\p{L}'’-]*))?`,
      'giu',
    ),
    read: (m) => {
      const [whole, core, variant, version, sep = '', code, fallback] = m;
      const p = readPort(version, sep, code, fallback, m.input.slice(m.index + whole.length));
      const coreEnd = m.index + core.length;
      if (p.unmapped) return { unmapped: true, span: [m.index, coreEnd] };
      // An ignored port token stays outside the masked span.
      return { ...ccId(variant, version, p.port), span: [m.index, p.port ? coreEnd + sep.length + code.length : coreEnd] };
    },
  },
  {
    // "CC BY" / "CC-BY-NC" without a version: not an id, but its family is compared with the URI.
    re: /(?<![a-z0-9])cc[\s_-]*(by(?:[\s_-]*(?:nc|sa|nd))*)(?![\s_-]*(?:\d|nc\b|sa\b|nd\b))(?![a-z0-9])/gi,
    read: (m) => ({ family: ccVariant(m[1]) }),
  },
  {
    // "Creative Commons Attribution Non Commercial Share Alike 4.0 International", "... 3.0 Germany", "Namensnennung - Nicht kommerziell 4.0 International",
    // "Attribution - Pas d'Utilisation Commerciale 4.0 International", "Uznanie autorstwa 4.0 Międzynarodowe". Without "Creative Commons" a bare
    // "Attribution 4.0" is read only as a CC deed title: with an element or "International".
    re: new RegExp(
      `((creative\\s+commons\\s+)?${NAME_START}((?:${ELEM_SEP}${ELEMS})*)[\\s,–—-]*(\\d\\.\\d)(?![\\d]))(?:[\\s(]+(${PORT_NAME_RE})(?![\\p{L}\\p{N}])|\\s+(\\p{L}[\\p{L}'’-]*))?`,
      'giu',
    ),
    read: (m) => {
      const [whole, core, prefix, , chain, version, portName, fallback] = m;
      const elements = elementsOf(chain);
      const coreEnd = m.index + core.length;
      if (!prefix && elements.length === 0 && !/^\s*(?:international|internationale|międzynarodow|unported)/iu.test(m.input.slice(coreEnd))) return undefined;
      const p = readPort(version, '', portName, fallback, m.input.slice(m.index + whole.length));
      if (p.unmapped) return { unmapped: true, span: [m.index, coreEnd] };
      return { ...ccId(['BY', ...elements].join('-'), version, p.port), span: [m.index, portName && p.port ? m.index + whole.length : coreEnd] };
    },
  },
  {
    // "Creative Commons Attribution-ShareAlike" without a version: a family, compared like "CC BY-SA".
    re: new RegExp(`creative\\s+commons\\s+${NAME_START}((?:${ELEM_SEP}${ELEMS})*)(?![\\s,–—-]*(?:\\d|${ELEMS}))`, 'giu'),
    read: (m) => ({ family: ccVariant(['BY', ...elementsOf(m[2])].join('-')) }),
  },
  { re: /(?<![a-z0-9])cc[\s_-]*(?:0|zero)(?![a-z0-9])(?:[\s_-]*(?:v|version\s*)?1\.0(?![\d]))?|creative\s+commons\s+zero(?:[\s_-]*(?:v|version\s*)?1\.0(?![\d]))?(?:\s+universal)?/gi, read: () => ({ id: 'CC0-1.0' }) },
  { re: /(?<![a-z0-9])(?:odc[\s-]*)?odbl(?![a-z0-9])|open\s+database\s+licen[cs]e/gi, read: () => ({ id: 'ODbL-1.0' }) },
  { re: /(?<![a-z0-9])odc[\s-]*by(?![a-z0-9])|open\s+data\s+commons\s+attribution/gi, read: () => ({ id: 'ODC-By-1.0' }) },
  { re: /(?<![a-z0-9])pddl(?![a-z0-9])|public\s+domain\s+dedication\s+(?:and|&)\s+licen[cs]e/gi, read: () => ({ id: 'PDDL-1.0' }) },
  {
    re: /(?<![a-z0-9])ogl[\s-]*uk[\s-]*v?(\d)(?:\.0)?(?![\d])|open\s+government\s+licen[cs]e(?:\s*\(ogl\))?[\s,-]*(?:uk\s*)?v(?:ersion)?\s*(\d)(?:\.0)?(?![\d])|(?<![a-z0-9])ogl[\s-]*v(\d)(?:\.0)?(?![\d])/gi,
    read: (m) => known(`OGL-UK-${m[1] ?? m[2] ?? m[3]}.0`),
  },
  {
    re: /(?<![a-z0-9])dl[\s-]*de[\s/_-]*(by|zero)[\s/_-]*(\d)[.-](\d)|datenlizenz\s+deutschland\W+(namensnennung|zero)\W+(?:version\s*)?(\d)[.,](\d)|data\s+licen[cs]e\s+germany\W+(attribution|zero)\W+(?:version\s*)?(\d)\.(\d)/gi,
    read: (m) => {
      const kind = (m[1] ?? m[4] ?? m[7]).toLowerCase();
      return known(`DL-DE-${kind === 'zero' ? 'ZERO' : 'BY'}-${m[2] ?? m[5] ?? m[8]}.${m[3] ?? m[6] ?? m[9]}`);
    },
  },
  // Software licences: exact ids and official names. Versionless "GPL" and a bare "MIT" inside prose (the institute) are not read.
  { re: /^\s*mit\s*$|(?<![\p{L}\p{N}])mit[\s-]+licen[cs]e/giu, read: () => known('MIT') },
  { re: /(?<![a-z0-9])apache[\s-]*(?:licen[cs]e[\s,-]*)?(?:version\s*|v)?2(?:\.0)?(?![\d.])/gi, read: () => known('Apache-2.0') },
  { re: /(?<![a-z0-9])bsd[\s-]*([23])[\s-]*clause(?![\s-]*(?:clear|lbnl|attribution|patent|[a-z]))(?:\s*[“"‘']new[”"’']\s*or\s*[“"‘']revised[”"’']|\s*[“"‘']simplified[”"’'])?(?:\s+licen[cs]e)?/gi, read: (m) => known(`BSD-${m[1]}-Clause`) },
  { re: /^\s*isc\s*$|(?<![a-z0-9])isc[\s-]+licen[cs]e/gi, read: () => known('ISC') },
  { re: /(?<![a-z0-9])mpl[\s-]*2\.0|mozilla\s+public\s+licen[cs]e,?\s*(?:version\s*|v)?2\.0/gi, read: () => known('MPL-2.0') },
  {
    // "GPL-3.0-or-later", "LGPL-2.1-only", "GNU General Public License v3.0 only", "GNU Lesser General Public License, version 2.1 or later"
    re: /(?<![a-z0-9])(a|l)?gpl-(\d\.\d)-(only|or-later)(?![a-z0-9])|gnu\s+(lesser\s+|affero\s+)?general\s+public\s+licen[cs]e,?\s+(?:version\s*|v)(\d\.\d)\s+(only|or\s+later)/gi,
    read: (m) => {
      const kind = (m[1] ?? m[4]?.trim()[0] ?? '').toUpperCase();
      return known(`${kind === 'A' ? 'A' : kind === 'L' ? 'L' : ''}GPL-${m[2] ?? m[5]}-${(m[3] ?? m[6]).toLowerCase().replace(/\s+/, '-')}`);
    },
  },
  { re: /(?<![a-z0-9])nlod[\s)-]*(?:v|version\s*)?(\d)\.(\d)/gi, read: (m) => known(`NLOD-${m[1]}.${m[2]}`) },
];

/**
 * Words that add conditions or take something away. Found in what is LEFT OVER of a statement once the licence name and the
 * neutral wording are removed, they say that the leftover is a condition ("CC BY 4.0, but not for commercial use") and not
 * just extra text. This list no longer decides whether a statement is let through (readText does, fail-closed); it only
 * explains the leftover (LIC-ADDED-CONDITIONS against LIC-EXTRA-TEXT). Exact words and word-start stems, pl/en/de/fr.
 */
const MARKER_WORDS = [
  'no', 'not', 'non', 'but', 'only', 'except', 'unless', 'without', 'nie', 'bez', 'ale', 'poza', 'tylko', 'nur', 'aber', 'nicht',
  'ohne', 'mais', 'pas', 'sans', 'sauf', 'außer', 'ausser',
];
const MARKER_STEMS = [
  'excluding', 'exception', 'prohibit', 'forbidden', 'restrict', 'apart from', 'other than', 'limited\\s+(?:to|use|access|distribution|re-?use|availability)',
  'rights reserved', 'embargo', 'moratorium', 'confidential', 'proprietary', 'permission', 'consent', 'approv', 'research', 'academic',
  'oprócz', 'wyjątk', 'wyłącznie', 'jedynie', 'zakaz', 'zabronion', 'ograniczon', 'zastrzeżon', 'zgod(?:a|y|ą|zie|ę)(?![\\p{L}])',
  'ausgenommen', 'ausschließlich', 'ausschliesslich', 'verbot', 'untersag', 'nichtkommerz', 'vorbehalten', 'kein', 'genehmig', 'erlaubnis',
  'excepté', 'uniquement', 'seulement', 'exclusivement', 'interdit', 'interdiction', 'réservé', 'autorisation',
];
const MARKERS = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:${MARKER_WORDS.join('|')})(?![\\p{L}\\p{N}])|(?:${MARKER_STEMS.join('|')}))`, 'iu');
/** Anything about commercial use, in any word ("noncommercial", "kommerziell", "niekomercyjne", "commerciale"). */
const COMMERCIAL = /commerc|kommerz|komercyj/iu;
/** "nc", "nd", "sa" (any case) as a token of their own outside the licence name are conditions ("CC BY 4.0 NC", "CC BY 4.0 + ND"). */
const CC_ELEMENT_TOKEN = /(?<![\p{L}\p{N}])(?:nc|nd|sa)(?![\p{L}\p{N}])/iu;
const hasMarker = (s: string): boolean => MARKERS.test(s) || COMMERCIAL.test(s) || CC_ELEMENT_TOKEN.test(s);

/**
 * Neutral wording that may close a sentence or clause ("CC BY 4.0, some rights reserved", "(commercial use permitted)", the CC deed
 * sentences). It is removed ONLY when it is followed by . ; , ) a dash or the end of the text: with anything after it inside the
 * same clause ("commercial use allowed on request") it stays and so becomes part of the leftover.
 */
const L0 = '(?<![\\p{L}\\p{N}])';
const CLOSES = '(?=\\s*(?:[.;,)–—]|$))';
const AFFIRMATIVE_CLOSING: RegExp[] = [
  `(?:some|no)\\s+rights\\s+reserved`,
  `no\\s+(?:additional|further)\\s+restrictions?`,
  `without\\s+(?:any\\s+)?restrictions?`,
  `no\\s+limitations?`,
  `but\\s+please\\s+cite`,
  // The CC deed's own sentence and the plain "permitted" variants, en / de / fr / pl.
  `(?:you\\s+are\\s+free\\s+to\\s+share\\s+and\\s+adapt\\s+the\\s+material\\s+)?(?:for\\s+any\\s+purpose,?\\s+)?(?:even|also)\\s+commercially`,
  `including\\s+(?:commercially|commercial\\s+(?:use|purposes?))`,
  `commercial\\s+(?:use|re-?use|exploitation)\\s+(?:is\\s+|are\\s+)?(?:permitted|allowed)`,
  `(?:nutzung\\s+)?(?:für\\s+beliebige\\s+zwecke,?\\s+)?(?:sogar|auch|selbst)\\s+kommerziell`,
  `kommerzielle\\s+nutzung\\s+(?:ist\\s+)?(?:erlaubt|gestattet|zulässig)`,
  `(?:(?:pour\\s+toute\\s+utilisation|réutilisation\\s+à\\s+toutes\\s+fins),?\\s+)?y\\s+compris\\s+(?:à\\s+des\\s+fins\\s+)?commerciale?s?`,
  `utilisation\\s+commerciale\\s+(?:est\\s+)?(?:autorisée|permise)`,
  `(?:(?:wykorzystanie\\s+)?w\\s+dowolnym\\s+celu,?\\s+)?(?:nawet|także|również)\\s+komercyjn\\p{L}*`,
  `użycie\\s+komercyjne\\s+(?:jest\\s+)?dozwolone`,
].map((src) => new RegExp(`${L0}(?:${src})${CLOSES}`, 'giu'));

/** Filler words of a licence statement (en / de / fr / pl). Everything else that is left is shown to the user. */
const FILLER = new Set(
  `licensed licenced use under the a an terms of this these dataset datasets data is are available distributed released published made international internationale unported międzynarodowe międzynarodowa międzynarodowy licence license see at and with
   lizenziert unter der die das dieser datensatz daten ist sind verfügbar veröffentlicht lizenz siehe dem den
   sous licence la le les de des du ce ces jeu données est sont disponible disponibles publié publiée publiés publiées distribué distribuée distribués distribuées voir
   na licencji licencja licencją ten te zbiór zbioru dane danych jest są dostępny dostępne udostępniony udostępnione opublikowany zob zobacz`.split(/\s+/),
);

/** A copyright notice "© / (c) / Copyright [year] holder": own sentence or fragment. */
const COPYRIGHT_START = /^[^\p{L}\p{N}©]*(?:©|copyright(?![\p{L}\p{N}]))/iu;
/** Years and publication dates (neutral). */
const DATES = [
  /(?<![\p{L}\p{N}])\d{1,2}[-/.]\d{1,2}[-/.](?:1[5-9]|20)\d{2}(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])(?:1[5-9]|20)\d{2}(?:[-/.]\d{1,2}){0,2}(?:\s*[-–]\s*(?:1[5-9]|20)\d{2})?(?![\p{L}\p{N}])/gu,
];
const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const blank = (s: string, re: RegExp): string => s.replace(re, (m) => ' '.repeat(m.length));

/**
 * What a statement says besides the licence name. `masked` is the text with the recognised licence names, URLs and DOIs blanked
 * (same length as `raw`). Removes only what is neutral — the deed wording when it closes a clause, years and dates, copyright
 * notices, a short list of filler words, punctuation — and returns the rest as the user wrote it ('' = nothing left), plus
 * whether that rest contains a restriction marker.
 */
function leftoverOf(raw: string, masked: string): { text: string; marker: boolean } {
  let m = masked.replace(/\(c\)/gi, '©  ');
  m = blank(m, /creative\s+commons/giu);
  for (const re of AFFIRMATIVE_CLOSING) m = blank(m, re);
  for (const re of DATES) m = blank(m, re);
  const shown: string[] = [];
  const kept: string[] = [];
  // Fragments split on . ; , ( ) and line breaks ("." only at the end of a word: "4.0" and "Inc." inside a name do not split).
  for (const frag of m.matchAll(/(?:[^;,()\n.]|\.(?!\s|$))+/gu)) {
    const tokens = [...frag[0].matchAll(TOKEN)];
    const content = tokens.filter((t) => !FILLER.has(t[0].toLowerCase()));
    if (content.length === 0) continue;
    let withoutFiller = frag[0];
    for (const t of tokens) if (FILLER.has(t[0].toLowerCase())) withoutFiller = withoutFiller.slice(0, t.index) + ' '.repeat(t[0].length) + withoutFiller.slice(t.index! + t[0].length);
    if (COPYRIGHT_START.test(withoutFiller) && !hasMarker(withoutFiller)) continue;
    const a = frag.index! + content[0].index!;
    const b = frag.index! + content[content.length - 1].index! + content[content.length - 1][0].length;
    shown.push(raw.slice(a, b).replace(/\s+/g, ' ').trim());
    kept.push(content.map((t) => t[0]).join(' '));
  }
  return { text: shown.join('; '), marker: hasMarker(kept.join(' ')) };
}

/** A licence name no pattern above reads (GNU GPL without a version, OGL of another country): next to a recognised one the text is ambiguous. */
const UNREAD_NAME = /open\s+government\s+licen[cs]e|(?<![a-z0-9])(?:a|l)?gpl(?![a-z0-9])|gnu\s+(?:lesser\s+|affero\s+)?general\s+public|apache\s+licen[cs]e|mozilla\s+public|(?<![a-z0-9])bsd(?![a-z0-9])|(?<![a-z0-9])eupl(?![a-z0-9])|cecill/iu;
const UNREAD_NAME_ALL = new RegExp(UNREAD_NAME.source, 'giu');

interface TextRead {
  ids: string[];
  families: string[];
  unmapped: boolean;
  /** A licence name this tool can turn into an id or a family was found. */
  recognised: boolean;
  /**
   * Named text: what is left after the licence name and the neutral wording are removed ('' = nothing). Unnamed text: ''.
   */
  leftover: string;
  /** The leftover contains a restriction marker (named text), or the whole text does (unnamed text). */
  restricted: boolean;
  /** Licence names found at all (recognised or not). */
  any: boolean;
}

/** Words that belong to the name of a licence already recognised: its short form in brackets, the rest of an official title. Blanked only next to THAT licence. */
const NAME_WORDS: { re: RegExp; idPrefix: string }[] = [
  { re: /\(\s*mit\s*\)/giu, idPrefix: 'MIT' },
  { re: /\(\s*isc\s*\)/giu, idPrefix: 'ISC' },
  { re: /\(\s*odbl(?:[\s-]*v?1(?:\.0)?)?\s*\)/giu, idPrefix: 'ODbL' },
  { re: /\(\s*(?:odc[\s-]*)?by(?:[\s-]*v?1(?:\.0)?)?\s*\)/giu, idPrefix: 'ODC-By' },
  { re: /\(\s*pddl(?:[\s-]*v?1(?:\.0)?)?\s*\)/giu, idPrefix: 'PDDL' },
  { re: /\(\s*nlod(?:[\s-]*v?\d(?:\.0)?)?\s*\)/giu, idPrefix: 'NLOD' },
  { re: /\(\s*ogl(?:[\s-]*(?:uk[\s-]*)?v?\d(?:\.0)?)?\s*\)/giu, idPrefix: 'OGL' },
  { re: /\(\s*mpl(?:[\s-]*v?2(?:\.0)?)?\s*\)/giu, idPrefix: 'MPL' },
  { re: /\(\s*(?:apache|asl)(?:[\s-]*v?2(?:\.0)?)?\s*\)/giu, idPrefix: 'Apache' },
  { re: /public\s+domain\s+dedication|universal/giu, idPrefix: 'CC0-' },
];

function readText(raw: string): TextRead {
  const out: TextRead = { ids: [], families: [], unmapped: false, recognised: false, leftover: '', restricted: false, any: false };
  // URLs, DOIs and "URI:" are blanked (same length, so positions stay aligned with `raw`).
  let text = blank(raw, /https?:\/\/\S+/gi);
  text = blank(text, /(?<![\p{L}\p{N}])doi:\s*10\.\S+/giu);
  text = blank(text, /(?<![\p{L}\p{N}])10\.\d{4,9}\/\S+/gu);
  text = blank(text, /\bURI:/gi);
  const spans: [number, number][] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const r = p.read(m as RegExpExecArray);
      if (!r) continue;
      out.any = true;
      if (r.id && !out.ids.includes(r.id)) out.ids.push(r.id);
      if (r.family && !out.families.includes(r.family)) out.families.push(r.family);
      if (r.unmapped) out.unmapped = true;
      spans.push(r.span ?? [m.index!, m.index! + m[0].length]);
    }
  }
  out.recognised = out.ids.length > 0 || out.families.length > 0;
  // Mask the licence names (with the official wording of their elements); what is left is the rest of the sentence.
  const chars = text.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) chars[i] = ' ';
  let rest = chars.join('');
  if (UNREAD_NAME.test(rest)) {
    out.any = true;
    out.unmapped = true;
    rest = blank(rest, UNREAD_NAME_ALL);
  }
  if (out.any) {
    for (const n of NAME_WORDS) if (out.ids.some((id) => id.startsWith(n.idPrefix))) rest = blank(rest, n.re);
    const left = leftoverOf(raw, rest);
    out.leftover = left.text;
    out.restricted = left.marker;
  } else {
    // No licence name: the text is unrecognised anyway; only its restrictions matter (a URI must not win over them).
    let stripped = rest;
    for (const re of AFFIRMATIVE_CLOSING) stripped = blank(stripped, re);
    out.restricted = MARKERS.test(stripped) || COMMERCIAL.test(stripped);
  }
  return out;
}

/* ---------- a statement ---------- */

export interface StatementParts {
  source: MetadataSource;
  field: string;
  /** The text shown to the user (first of the classified strings). */
  text?: string;
  /** Further strings that say the same thing in other words (DataCite identifier next to the rights text). */
  also?: (string | undefined)[];
  uri?: string;
}

/** The family ("BY-NC") of an id, to compare it with a versionless "CC BY-NC". */
const familyOf = (id: string): string | undefined => /^CC-(BY(?:-NC|-SA|-ND)*)-\d/.exec(id)?.[1];

/**
 * Builds a statement and decides what it says. The text and the URI are each read ON THEIR OWN; the agreed `spdx`
 * is set only when they do not contradict each other and the text adds no conditions. The URI never silently wins:
 * a text that names a different licence, or carries "but not for commercial use", makes the statement unrecognised
 * (`conflict`). A text that names no licence at all ("Open Access") but is harmless leaves the URI's reading.
 * A text that gives more than one reading of itself ("CC BY 4.0 (CC BY-NC)", rights text and identifier that differ,
 * a recognised name next to one that is not) is never one licence: `conflict: 'readings'` when there is no link to blame.
 */
export function buildStatement(p: StatementParts): LicenceStatement | undefined {
  const texts = [...new Set([p.text, ...(p.also ?? [])].map((t) => t?.trim()).filter((t): t is string => !!t))];
  const uri = p.uri?.trim() || undefined;
  if (texts.length === 0 && !uri) return undefined;
  const s: LicenceStatement = { source: p.source, field: p.field };
  if (texts.length > 0) s.text = p.text?.trim() || texts[0];
  if (uri) s.uri = uri;

  const reads = texts.map(readText);
  const ids = [...new Set(reads.flatMap((r) => r.ids))];
  const families = [...new Set(reads.flatMap((r) => r.families))];
  const unmappedText = reads.some((r) => r.unmapped);
  // The text(s) read as more than one licence: several ids, an id and a different versionless family, two families,
  // or a recognised name next to one that is not.
  const clash =
    ids.length > 1 ||
    (ids.length === 1 && families.some((f) => f !== familyOf(ids[0]))) ||
    families.length > 1 ||
    (unmappedText && (ids.length > 0 || families.length > 0));
  const textId = ids.length === 1 && !clash ? ids[0] : undefined;
  const u = uri ? readUri(uri) : {};
  if (textId) s.textSpdx = textId;
  if (u.id) s.uriSpdx = u.id;
  if (clash) s.readings = [...ids, ...families.map((f) => `CC ${f}`), ...(unmappedText ? ['—'] : [])];

  const named = reads.some((r) => r.any);
  // Fail-closed: a text that names a recognised licence and says anything else is not that licence as written. A name this tool
  // cannot turn into an id is unrecognised anyway; there only a restriction marker in the rest changes the verdict.
  const flagged = reads.filter((r) => r.leftover && (r.recognised || r.restricted));
  const conditionsUnnamed = reads.some((r) => !r.any && r.restricted);
  const textVsUri =
    !!uri &&
    (clash || // the text itself offers or implies several licences
      (!!textId && !!u.id && textId !== u.id) ||
      (!!textId && !!u.unmapped && !u.oneOf?.includes(textId)) ||
      (unmappedText && !!u.id) ||
      (!!u.id && families.some((f) => f !== familyOf(u.id!))) || // always: a versionless family against the link
      // the text names no licence but restricts, and the URI names one
      (conditionsUnnamed && !named && !!u.id));
  // Precedence: when the readings THEMSELVES differ (text against link, or the text against itself) that is the finding
  // (LIC-TEXT-URI-CONFLICT / LIC-AMBIGUOUS). Only when the readings agree and something is left over does the leftover decide:
  // a restriction marker in it -> LIC-ADDED-CONDITIONS, anything else -> LIC-EXTRA-TEXT.
  if (textVsUri) s.conflict = 'text-uri';
  else if (clash) s.conflict = 'readings';
  else if (flagged.length > 0) {
    s.conflict = flagged.some((r) => r.restricted) ? 'restricted' : 'extra-text';
    s.leftover = [...new Set(flagged.map((r) => r.leftover))].join('; ');
  } else {
    const agreed = textId ?? u.id;
    if (agreed) s.spdx = agreed;
  }
  return s;
}

/** What a statement says once text and URI are weighed. Hand-built statements (only `spdx` set) are honoured. */
export function classifyStatement(s: LicenceStatement): LicenceClass {
  if (s.conflict || !s.spdx) return { kind: 'unrecognised' };
  return { kind: 'spdx', id: s.spdx };
}

/**
 * The agreed SPDX id of a text and/or URI, or undefined when neither is recognised or they disagree.
 * Versionless text ("CC BY") is deliberately NOT normalised: it is not machine-readable.
 */
export function toSpdx(text?: string, uri?: string): string | undefined {
  return buildStatement({ source: 'datacite', field: '', text, uri })?.spdx;
}

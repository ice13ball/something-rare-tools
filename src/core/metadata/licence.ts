// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Licence normalisation. Pure functions, no I/O. The ONLY place that turns licence text or a URI into an SPDX id
// and the ONLY definition of "open" (isOpenLicence). The cross-source analysis lives in ../licence/analyse.ts.
import type { LicenceClass, LicenceStatement, MetadataSource } from '../types';
import { EU_LICENCE_AUTHORITY } from './eu-licence-authority';
import { SPDX_ENTRIES, SPDX_LIST_VERSION } from './spdx-data';
import { ZENODO_LICENCES } from './zenodo-licences';

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
type Read = { id?: string; unmapped?: boolean; /** a clean CC0 / Public Domain Mark link: the only link next to which "Public Domain" wording is neutral */ pd?: boolean; family?: string; oneOf?: string[]; /** a licence link with a tail we cannot read (query, fragment, unknown path): not a recognised licence */ dirty?: boolean };

/**
 * What may follow the version of a licence link: an optional port segment, "legalcode" / "deed" with an optional language tag
 * (en, pl, zh-hans, en_GB), an optional "/". Anything else (a query, a fragment, "legalcode-modified-nc") makes the link unreadable.
 * ONE exception: the Creative Commons licence chooser appends exactly "?ref=chooser-v1" to the links it generates; that is neutral.
 */
// The language tag of a deed is [a-z]{2,3}([-_][a-z]{2}|[-_][a-z]{4})? and nothing else; a tag that reads as a licence element
// ("deed.nc", "deed.en-nc", "deed.en-sa") or a script we do not know is not a language: the link stays unreadable. (Link is lower-case here.)
const LANG = '\\.(?!n[cd](?![a-z]))[a-z]{2,3}(?:[-_](?:(?!(?:nc|nd|sa|by)(?![a-z]))[a-z]{2}|hans|hant|latn|cyrl|arab))?';
const CHOOSER = '(?:\\?ref=chooser-v1)?';
/** Below 4.0 a port (jurisdiction) segment may follow the version; from 4.0 on there are no ports and no other segment. */
const CC_TAIL = new RegExp(`^(?:/(?!deed(?![a-z]))([a-z]{2,4}))?(?:/(?:legalcode|deed)(?:${LANG})?)?/?${CHOOSER}$`);
const CC_TAIL_NOPORT = new RegExp(`^(?:/(?:legalcode|deed)(?:${LANG})?)?/?${CHOOSER}$`);
const ZERO_TAIL = new RegExp(`^(?:/(?:legalcode|deed)(?:${LANG})?)?/?${CHOOSER}$`);
/** Other licence families: the page itself, optionally ".html" / ".txt" and a closing "/". */
const OTHER_TAIL = /^(?:\.(?:html?|txt))?\/?$/;
const DIRTY: Read = { unmapped: true, dirty: true };
/** The tail of `u` after the match `m` is clean for `re`, else the unreadable-link result. */
const tailed = (u: string, m: RegExpExecArray, re: RegExp, ok: Read): Read => (re.test(u.slice(m.index + m[0].length)) ? ok : DIRTY);

/** SPDX ids exist only for these ports; the suffix of a ported id is the upper-case country (or IGO) code. */
const PORTS = [...new Set(SPDX_ENTRIES.map((e) => /^CC-.*-\d\.\d-([A-Z]+)$/.exec(e.id)?.[1]).filter((p): p is string => !!p))];

const LOWER_IDS: ReadonlyMap<string, string> = new Map(SPDX_ENTRIES.map((e) => [e.id.toLowerCase(), e.id]));

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
  if (key && !OTHER_TAIL.test(u.slice((osi ?? gnu)!.index + (osi ?? gnu)![0].length))) return DIRTY;
  if (key) {
    if (/gpl/.test(key)) {
      const base = (key === 'agpl' ? 'agpl-3.0' : key).toUpperCase();
      return { unmapped: true, oneOf: GNU_VARIANTS(base).filter((id) => INFO.has(id)) };
    }
    return known({ mit: 'MIT', 'apache-2.0': 'Apache-2.0', 'bsd-2-clause': 'BSD-2-Clause', 'bsd-3-clause': 'BSD-3-Clause', isc: 'ISC', 'mpl-2.0': 'MPL-2.0' }[key]!);
  }
  const apache = /apache\.org\/licenses\/license-2\.0/.exec(u);
  if (apache) return tailed(u, apache, OTHER_TAIL, { id: 'Apache-2.0' });
  const mpl = /mozilla\.org\/mpl\/2\.0/.exec(u);
  if (mpl) return tailed(u, mpl, OTHER_TAIL, { id: 'MPL-2.0' });
  if (/(opensource\.org\/licen[sc]es?\/|gnu\.org\/licenses\/|apache\.org\/licenses\/|mozilla\.org\/mpl\/)/.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  return undefined;
}

/* ---------- exact names: Zenodo's own licence titles and URLs, the SPDX ids ---------- */

/**
 * A whole string compared as a licence name: Unicode-compatible form, one space between words, no trailing punctuation, lower case.
 * Used ONLY for an exact match of the whole text; it never reads a name inside longer text.
 */
const nameKey = (s: string): string => s.normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/u, '').trim().toLowerCase();

/**
 * A Zenodo title that lacks the version its id carries ("Norwegian Licence for Open Government Data" for NLOD-1.0) names the family, not
 * that version: it is not an exact name (the link and the identifier still resolve it).
 */
export const versionless = (z: { id: string; title: string }): boolean => {
  // The version is the LAST number of the id, before only letters ("-only", "-or-later", a port): CC0-1.0 is 1.0, not 0.
  const v = /(\d+(?:\.\d+)*)(?:-[a-z]+)*$/i.exec(z.id)?.[1];
  return !!v && !new RegExp(`(?<![\\d.])${v.replace(/\./g, '\\.')}(?![\\d])`).test(z.title);
};

/** The family of an id without its version ("NLOD" for NLOD-1.0): what a versionless title of it names. */
const familyOfTitle = (z: { id: string }): string => z.id.replace(/-?\d+(?:\.\d+)*(?:-[a-z]+)*$/i, '');

/** Every SPDX id the tool knows, and the title Zenodo gives each of them (its rights text in DataCite), by exact whole string. */
const EXACT_NAMES: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const e of SPDX_ENTRIES) m.set(nameKey(e.id), e.id);
  for (const z of ZENODO_LICENCES) if (INFO.has(z.id) && !versionless(z)) m.set(nameKey(z.title), z.id);
  return m;
})();

/** Zenodo titles that name a licence family without its version: they name a licence (so they do not read as "no licence named") but give no id. */
const VERSIONLESS_TITLES: ReadonlyMap<string, string> = new Map(ZENODO_LICENCES.filter((z) => INFO.has(z.id) && versionless(z)).map((z) => [nameKey(z.title), familyOfTitle(z)]));

/** The licence an exact whole-string name (an SPDX id in any case, or Zenodo's title for one) stands for. */
export function exactLicenceName(text: string): string | undefined {
  return EXACT_NAMES.get(nameKey(text));
}

/**
 * Zenodo's licence URLs that name exactly ONE known id. A URL shared by several ids (the GNU pages serve -only and -or-later alike) is
 * left out: it cannot decide alone, the text or the identifier has to say which. Compared as the whole link, lower case.
 */
const EXACT_URLS: ReadonlyMap<string, string> = (() => {
  const byUrl = new Map<string, Set<string>>();
  for (const z of ZENODO_LICENCES) if (INFO.has(z.id)) byUrl.set(z.url.trim().toLowerCase(), (byUrl.get(z.url.trim().toLowerCase()) ?? new Set()).add(z.id));
  return new Map([...byUrl].filter(([, ids]) => ids.size === 1).map(([url, ids]) => [url, [...ids][0]]));
})();

function readUri(uri: string): Read {
  const u = uri.trim().toLowerCase();
  // https://creativecommons.org/licenses/by-nc-sa/4.0/{legalcode,deed.pl,pl/} — host, scheme, www, trailing parts are irrelevant.
  // A bare 2-4 letter segment after the version is a PORT (jurisdiction); "deed.pl" / "legalcode.de" are deed languages.
  const cc = /creativecommons\.org\/licen[sc]es\/(by(?:-(?:nc|sa|nd))*)\/(\d\.\d)(?![\d])/.exec(u);
  if (cc) {
    const tail = u.slice(cc.index + cc[0].length);
    if (parseFloat(cc[2]) >= 4) return CC_TAIL_NOPORT.test(tail) ? ccId(cc[1], cc[2]) : DIRTY;
    const t = CC_TAIL.exec(tail);
    return t ? ccId(cc[1], cc[2], t[1] && t[1] !== 'deed' ? t[1] : undefined) : DIRTY;
  }
  if (/creativecommons\.org\/licen[sc]es\//.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  const zero = /creativecommons\.org\/publicdomain\/zero\/1\.0(?![\d])/.exec(u);
  if (zero) return tailed(u, zero, ZERO_TAIL, { id: 'CC0-1.0', pd: true });
  const mark = /creativecommons\.org\/publicdomain\/mark\/1\.0(?![\d])/.exec(u);
  if (mark && ZERO_TAIL.test(u.slice(mark.index + mark[0].length))) return { unmapped: true, pd: true };
  if (/creativecommons\.org\/publicdomain\//.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  const odc = /opendatacommons\.org\/licenses\/(odbl|pddl|by)\/(\d)[-.](\d)/.exec(u);
  if (odc) return tailed(u, odc, OTHER_TAIL, known(`${{ odbl: 'ODbL', pddl: 'PDDL', by: 'ODC-By' }[odc[1] as 'odbl']}-${odc[2]}.${odc[3]}`));
  if (/opendatacommons\.org\/licenses\//.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  const ogl = /nationalarchives\.gov\.uk\/doc\/open-government-licen[cs]e\/version\/(\d)/.exec(u);
  if (ogl) return tailed(u, ogl, OTHER_TAIL, known(`OGL-UK-${ogl[1]}.0`));
  if (/nationalarchives\.gov\.uk\/doc\/open-government-licen[cs]e/.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  const dl = /govdata\.de\/dl-de\/(by|zero)-(\d)-(\d)/.exec(u);
  if (dl) return tailed(u, dl, OTHER_TAIL, known(`DL-DE-${dl[1].toUpperCase()}-${dl[2]}.${dl[3]}`));
  if (/govdata\.de\/dl-de\//.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  const soft = readSoftwareUri(u);
  if (soft) return soft;
  const nlod = /data\.norge\.no\/nlod\/(?:[a-z]{2}\/)?(\d)\.(\d)/.exec(u);
  if (nlod) return tailed(u, nlod, OTHER_TAIL, known(`NLOD-${nlod[1]}.${nlod[2]}`));
  if (/data\.norge\.no\/nlod/.test(u)) return /[?#]/.test(u) ? DIRTY : { unmapped: true };
  // spdx.org/licenses/<id>[.html|.json|.txt] and the EU Publications Office licence authority: exact forms, known ids only.
  const spdxPage = /^https?:\/\/(?:www\.)?spdx\.org\/licenses\/([^/?#]+?)(?:\.(?:html|json|txt))?\/?$/.exec(u);
  if (spdxPage) return LOWER_IDS.has(spdxPage[1]) ? { id: LOWER_IDS.get(spdxPage[1])! } : {};
  // The authority's codes are upper case and exact: "cc_by_4_0" and "__proto__" are not codes.
  const eu = /^https?:\/\/publications\.europa\.eu\/resource\/authority\/licence\/([A-Z0-9_]+)\/?$/i.exec(uri.trim());
  const euCode = eu?.[1];
  const euId = euCode && Object.hasOwn(EU_LICENCE_AUTHORITY, euCode) ? EU_LICENCE_AUTHORITY[euCode] : undefined;
  if (euId && INFO.has(euId)) return { id: euId };
  // Open Definition's own pages for the data licences it lists.
  const od = /^https?:\/\/(?:www\.)?opendefinition\.org\/licenses\/(cc-zero|odc-odbl|odc-by|odc-pddl)\/?$/.exec(u);
  if (od) return known({ 'cc-zero': 'CC0-1.0', 'odc-odbl': 'ODbL-1.0', 'odc-by': 'ODC-By-1.0', 'odc-pddl': 'PDDL-1.0' }[od[1]]!);
  // Last: a link no reader above knows, but which is exactly the one Zenodo lists for one known licence.
  const exact = EXACT_URLS.get(u);
  return exact ? { id: exact } : {};
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

/**
 * The Creative Commons 4.0 deed's own sentences that LOOK like restrictions ("but not in any way that suggests the licensor endorses
 * you", "You may not apply legal terms...", "No warranties are given") but restate the licence itself. Wording copied from
 * creativecommons.org/licenses/by/4.0/deed.{en,pl,de,fr} (read 23.10.2026). A statement whose only restriction markers sit in these
 * sentences is extra text (LIC-EXTRA-TEXT), not added conditions (LIC-ADDED-CONDITIONS). Used ONLY to decide that marker: the leftover
 * is still shown whole and still keeps the statement from being recognised as a licence id. Like the other neutral wording, a sentence
 * counts only when it closes its clause (. ; , ) a dash or the end): one that goes on ("No warranties are given for commercial reuse") stays.
 */
const DEED_SENTENCES: string[] = [
  // en
  `but not in any way that suggests the licensor endorses you or your use`,
  `you may not apply legal terms or technological measures that legally restrict others from doing anything the license permits`,
  `you do not have to comply with the license for elements of the material in the public domain or where your use is permitted by an applicable exception or limitation`,
  `no warranties are given`,
  `the license may not give you all of the permissions necessary for your intended use`,
  // pl
  `o ile nie sugeruje to udzielania prze licencjodawcę poparcia dla Ciebie lub sposobu, w jaki wykorzystujesz ten utwór`,
  `nie możesz korzystać ze środków prawnych lub technologicznych, które ograniczają innych w korzystaniu z utworu na warunkach określonych w licencji`,
  `warunki licencyjne nie muszą być przestrzegane w odniesieniu do tych fragmentów licencjonowanych treści, które znajdują się w domenie publicznej, lub w przypadku sposobów korzystania dozwolonych przez odpowiednie wyjątki lub ograniczenia prawa autorskiego`,
  `licencjodawca nie daje żadnych gwarancji`,
  `licencja może nie zapewniać wszystkich niezbędnych zgód dla niektórych użyć utworu`,
  // de
  `allerdings nicht so, dass der Eindruck entsteht, der Lizenzgeber unterstütze gerade Sie oder Ihre Nutzung besonders`,
  `sie dürfen keine zusätzlichen Klauseln oder technische Verfahren einsetzen, die anderen rechtlich irgendetwas untersagen, was die Lizenz erlaubt`,
  `sie müssen sich nicht an diese Lizenz halten hinsichtlich solcher Teile des Materials, die gemeinfrei sind, oder soweit Ihre Nutzungshandlungen durch Ausnahmen und Schranken des Urheberrechts gedeckt sind`,
  `es werden keine Garantien gegeben und auch keine Gewähr geleistet`,
  `die Lizenz verschafft Ihnen möglicherweise nicht alle Erlaubnisse, die Sie für die jeweilige Nutzung brauchen`,
  // fr
  `sans toutefois suggérer que l'Offrant vous soutient ou soutient la façon dont vous avez utilisé son Oeuvre`,
  `vous n'êtes pas autorisé à appliquer des conditions légales ou des mesures techniques qui restreindraient légalement autrui à utiliser l'Oeuvre dans les conditions décrites par la licence`,
  `vous n'êtes pas dans l'obligation de respecter la licence pour les éléments ou matériel appartenant au domaine public ou dans le cas où l'utilisation que vous souhaitez faire est couverte par une exception`,
  `aucune garantie n'est donnée`,
  `il se peut que la licence ne vous donne pas toutes les permissions nécessaires pour votre utilisation`,
];
const DEED_CLOSING: RegExp[] = DEED_SENTENCES.map((sentence) => {
  const src = sentence
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]").replace(/licen[cs]e/giu, 'licen[cs]e').replace(/Oeuvre/g, '(?:oe|œ)uvre'))
    .join('\\s+');
  return new RegExp(`${L0}(?:${src})${CLOSES}`, 'giu');
});

/** Filler words of a licence statement (en / de / fr / pl). Everything else that is left is shown to the user. */
const FILLER = new Set(
  `licensed licenced use under the a an of this these dataset datasets data is are available distributed released published made international internationale unported międzynarodowe międzynarodowa międzynarodowy licence license at and with
   lizenziert unter der die das dieser datensatz daten ist sind verfügbar veröffentlicht lizenz dem den
   sous licence la le les de des du ce ces jeu données est sont disponible disponibles publié publiée publiés publiées distribué distribuée distribués distribuées
   na licencji licencja licencją ten te zbiór zbioru dane danych jest są dostępny dostępne udostępniony udostępnione opublikowany`.split(/\s+/),
);

/**
 * A copyright notice "© / (c) / Copyright [year] holder". Only a year and a holder name in capitalised words (optionally closed by
 * Ltd / GmbH / S.A. / sp. z o.o. / Inc / AG / SAS / B.V.) are neutral; the notice ends at the first other word or mark ("Copyright:",
 * "© Ocean Corp — reuse requires a fee", "© Ocean Corp who must be asked"), and what follows is the leftover. Years and dates are
 * neutral ONLY here: anywhere else a date may be an embargo.
 */
const COPYRIGHT_START = /©|(?<![\p{L}\p{N}])copyright(?![\p{L}\p{N}])/giu;
const COPYRIGHT_PIECES: RegExp[] = [
  /(?:1[5-9]|20)\d{2}(?:[ \t]*[-–][ \t]*(?:1[5-9]|20)\d{2})?(?![\p{L}\p{N}])/yu, // year or range
  /©/yu,
  /&(?![\p{L}\p{N}])/yu,
  /\p{Lu}\.(?=\s)/yu, // initial
  /(?:Co|Ltd|Inc)\.|S\.A\.S?\.|B\.V\.|sp\.[ \t]*z[ \t]*o\.o\./yu, // company form with its dots: ends the name
  /\p{Lu}[\p{L}\p{N}'’&-]*(?![\p{L}\p{N}])/yu, // capitalised word (Ltd, GmbH, AG, SAS, Inc ...)
];
/** The holder name is at most this many capitalised words (company forms and the year do not count). */
const HOLDER_MAX_WORDS = 4;
const COMPANY_FORMS = new Set(['ltd', 'limited', 'gmbh', 'ag', 'sas', 'inc', 'corp', 'co', 'llc', 'plc', 'sa', 'bv']);
/**
 * Words that END a copyright notice (en / de / fr / pl): "© Ocean Corp Internal Use", "© GEOMAR Lizenzgebühr Erforderlich". They only
 * delimit the notice (what follows is leftover, even if it is otherwise neutral filler such as "Use"); they are not a general condition marker.
 */
const BOUNDARY_WORDS = new Set(
  `use fee fees required registration members partners program programme internal until only paid licence license nutzung erforderlich utilisation payant redevance użytek registrierung zustimmung kosten licensed usage interne`.split(' '),
);
const BOUNDARY_PREFIXES = ['gebühr', 'lizenz', 'mitglied', 'réservé', 'opłat', 'płatn', 'wymagan', 'członk', 'subscri', 'charge', 'użytk', 'wewnętrzn'];
const isBoundary = (word: string): boolean => {
  const w = word.toLowerCase();
  return BOUNDARY_WORDS.has(w) || BOUNDARY_PREFIXES.some((p) => w.startsWith(p)) || w.includes('pflichtig') || w.includes('bedingung');
};
const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|\p{S}+/gu;

/** Blanks the neutral part of every copyright notice (same length); `forced` = start offsets of the boundary words that end a notice. */
function blankCopyright(m: string): { text: string; forced: Set<number> } {
  let out = m;
  let from = 0;
  const forced = new Set<number>();
  for (const start of m.matchAll(COPYRIGHT_START)) {
    if (start.index! < from) continue;
    let pos = start.index! + start[0].length;
    let words = 0;
    let tooLong = false;
    let boundary: number | undefined;
    for (;;) {
      while (/[ \t\u00a0]/.test(m[pos] ?? '')) pos++;
      let hit: RegExpExecArray | null = null;
      let idx = -1;
      for (const [i, re] of COPYRIGHT_PIECES.entries()) {
        re.lastIndex = pos;
        hit = re.exec(m);
        if (hit) {
          idx = i;
          break;
        }
      }
      if (!hit) break;
      if (idx === 5 || idx === 3) {
        // a capitalised word or an initial: a boundary word ends the notice; a name of more than four words is not swallowed
        if (idx === 5 && isBoundary(hit[0])) {
          boundary = pos;
          break;
        }
        if (!(idx === 5 && COMPANY_FORMS.has(hit[0].toLowerCase()))) words++;
        if (words > HOLDER_MAX_WORDS) {
          tooLong = true;
          break;
        }
      }
      pos += hit[0].length;
      if (idx === 4) break;
    }
    if (tooLong) continue;
    if (boundary !== undefined) forced.add(boundary);
    const seg = m.slice(start.index!, pos);
    if (hasMarker(seg)) continue;
    out = out.slice(0, start.index!) + ' '.repeat(seg.length) + out.slice(pos);
    from = pos;
  }
  return { text: out, forced };
}

const blank = (s: string, re: RegExp): string => s.replace(re, (m) => ' '.repeat(m.length));

/**
 * What a statement says besides the licence name. `masked` is the text with the recognised licence names, URLs and DOIs blanked
 * (same length as `raw`). Removes only what is neutral — the deed wording when it closes a clause, years and dates, copyright
 * notices, a short list of filler words, punctuation — and returns the rest as the user wrote it ('' = nothing left), plus
 * whether that rest contains a restriction marker.
 */
function leftoverOf(raw: string, masked: string, foreign: { pos: number; text: string }[]): { text: string; marker: boolean } {
  let m = masked.replace(/\(c\)/gi, '©  ');
  m = blank(m, /creative\s+commons/giu);
  for (const re of AFFIRMATIVE_CLOSING) m = blank(m, re);
  const cr = blankCopyright(m);
  m = cr.text;
  // For the MARKER decision only: the same text with the CC deed's own sentences blanked (same length, so the fragments below line up).
  let markable = m;
  for (const re of DEED_CLOSING) markable = blank(markable, re);
  const shown: { pos: number; text: string }[] = [];
  const keptForMarker: string[] = [];
  // Fragments split on . ; , ( ) and line breaks ("." only at the end of a word: "4.0" and "Inc." inside a name do not split).
  for (const frag of m.matchAll(/(?:[^;,()\n.]|\.(?!\s|$))+/gu)) {
    const tokens = [...frag[0].matchAll(TOKEN)];
    const content = tokens.filter((t) => !FILLER.has(t[0].toLowerCase()) || cr.forced.has(frag.index! + t.index!));
    if (content.length === 0) continue;
    const a = frag.index! + content[0].index!;
    let b = frag.index! + content[content.length - 1].index! + content[content.length - 1][0].length;
    // Filler words right after the last content word belong to what is shown ("but not for commercial use"), unless a licence name etc. sits between.
    for (const t of tokens.filter((t) => t.index! + frag.index! >= b)) {
      const end = frag.index! + t.index! + t[0].length;
      if (raw.slice(b, end) !== m.slice(b, end)) break;
      b = end;
    }
    shown.push({ pos: a, text: raw.slice(a, b).replace(/\s+/g, ' ').trim() });
    const here = markable.slice(frag.index!, frag.index! + frag[0].length);
    keptForMarker.push([...here.matchAll(TOKEN)].filter((t) => !FILLER.has(t[0].toLowerCase()) || cr.forced.has(frag.index! + t.index!)).map((t) => t[0]).join(' '));
  }
  // A link or DOI that is not a recognised licence URL says something we cannot read: leftover as written.
  for (const f of foreign) {
    shown.push(f);
    keptForMarker.push(f.text);
  }
  shown.sort((x, y) => x.pos - y.pos);
  return { text: shown.map((x) => x.text).join('; '), marker: hasMarker(keptForMarker.join(' ')) };
}

/** A licence name no pattern above reads (GNU GPL without a version, OGL of another country): next to a recognised one the text is ambiguous. */
const UNREAD_NAME = /open\s+government\s+licen[cs]e|(?<![a-z0-9])(?:a|l)?gpl(?![a-z0-9])|gnu\s+(?:lesser\s+|affero\s+)?general\s+public|apache\s+licen[cs]e|mozilla\s+public|(?<![a-z0-9])bsd(?![a-z0-9])|(?<![a-z0-9])eupl(?![a-z0-9])|cecill/iu;
const UNREAD_NAME_ALL = new RegExp(UNREAD_NAME.source, 'giu');

interface TextRead {
  ids: string[];
  families: string[];
  /** The whole text is a Zenodo title that names a licence family without its version ("NLOD"): any id or link outside that family is a conflict. */
  titleFamily?: string;
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
  /** Unnamed text only: empty or one of the neutral access statements ("Open Access", info:eu-repo/semantics/openAccess); says nothing else. */
  neutral: boolean;
  /** Unnamed text only: the whole text is "Public Domain" wording; neutral only next to a CC0 / Public Domain Mark link. */
  pd: boolean;
}

/** Public-domain wording (en / fr / de / pl). */
const PD_WORDS = '(?:public\\s+domain(?:\\s+dedication)?|domaine\\s+public|gemeinfrei|domena\\s+publiczna)';
const PD_WHOLE = new RegExp(`^${PD_WORDS}[\\s.,;:!]*$`, 'iu');
const PD_IN_TEXT = new RegExp(`(?<![\\p{L}\\p{N}])${PD_WORDS}(?![\\p{L}\\p{N}])`, 'giu');

/** What a text that names no licence may say next to a licence link: only that the data is open access (any case), as an eu-repo / COAR value or word. */
const NEUTRAL_UNNAMED: RegExp[] = [
  /^open[\s-]*access\.?$/iu,
  /^info:eu-repo\/semantics\/openaccess$/iu,
  /^https?:\/\/purl\.org\/coar\/access_right\/c_abf2\/?$/iu,
  /^https?:\/\/purl\.org\/eprint\/accessrights\/openaccess\/?$/iu,
];
const isNeutralUnnamed = (raw: string): boolean => {
  const items = raw.trim().split(/\s*[;,|]\s*/u).filter(Boolean);
  return items.every((i) => NEUTRAL_UNNAMED.some((re) => re.test(i.replace(/\s+/g, ' '))));
};

/** A link or DOI inside a text. Only a link the URI recogniser reads as a licence may be stripped; anything else is leftover. */
/** A link ends at whitespace or , ( ) ; — what is glued to it with those is the rest of the text. */
const REFERENCE = /https?:\/\/[^\s,();]+|(?<![\p{L}\p{N}])doi:\s*10\.[^\s,();]+|(?<![\p{L}\p{N}])10\.\d{4,9}\/[^\s,();]+/giu;

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
  const out: TextRead = { ids: [], families: [], unmapped: false, recognised: false, leftover: '', restricted: false, any: false, neutral: false, pd: false };
  // The whole text is exactly a licence name (an SPDX id, or the title Zenodo gives a licence): that name, fully consumed, nothing left over.
  const exact = exactLicenceName(raw);
  if (exact) return { ...out, ids: [exact], recognised: true, any: true };
  const family = VERSIONLESS_TITLES.get(nameKey(raw));
  if (family) return { ...out, any: true, titleFamily: family };
  let pdLink = false;
  // Links and DOIs are blanked (same length, so positions stay aligned with `raw`). A licence link is a licence name like any other;
  // every other link or DOI is kept aside and shown as leftover.
  let text = raw;
  const foreign: { pos: number; text: string }[] = [];
  const spans: [number, number][] = [];
  for (const ref of raw.matchAll(REFERENCE)) {
    const shown = ref[0].replace(/[.,;:)\]"'”’]+$/u, '');
    const r = /^https?:/i.test(shown) ? readUri(shown) : {};
    text = text.slice(0, ref.index!) + ' '.repeat(ref[0].length) + text.slice(ref.index! + ref[0].length);
    if (!r.dirty && (r.id || r.unmapped || r.oneOf)) {
      out.any = true;
      if (r.pd) pdLink = true;
      if (r.id && !out.ids.includes(r.id)) out.ids.push(r.id);
      if (r.unmapped) out.unmapped = true;
    } else foreign.push({ pos: ref.index!, text: shown });
  }
  text = blank(text, /\bURI:/gi);
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
    if (pdLink) rest = blank(rest, PD_IN_TEXT);
    for (const n of NAME_WORDS) if (out.ids.some((id) => id.startsWith(n.idPrefix))) rest = blank(rest, n.re);
    const left = leftoverOf(raw, rest, foreign);
    out.leftover = left.text;
    out.restricted = left.marker;
  } else {
    // No licence name: the text is unrecognised anyway; only its restrictions matter (a URI must not win over them).
    let stripped = rest;
    for (const re of AFFIRMATIVE_CLOSING) stripped = blank(stripped, re);
    out.restricted = MARKERS.test(stripped) || COMMERCIAL.test(stripped);
    out.neutral = isNeutralUnnamed(raw);
    out.pd = PD_WHOLE.test(raw.trim());
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
  /** The DataCite rightsIdentifier, when it is its own field: kept on the statement when the statement is not a recognised licence. */
  identifier?: string;
  uri?: string;
}

/** The family ("BY-NC") of an id, to compare it with a versionless "CC BY-NC". */
const familyOf = (id: string): string | undefined => /^CC-(BY(?:-NC|-SA|-ND)*)-\d/.exec(id)?.[1];

/**
 * Builds a statement and decides what it says. The text and the URI are each read ON THEIR OWN; the agreed `spdx`
 * is set only when they do not contradict each other and the text adds no conditions. The URI never silently wins:
 * a text that names a different licence, or carries "but not for commercial use", makes the statement unrecognised
 * (`conflict`). A text that names no licence at all leaves the URI's reading only when it is empty or plain "Open Access" (or an eu-repo access value).
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
  const u = uri ? readUri(uri) : {};
  // A string that names no licence and is not neutral ("All rights reserved", "Free for scientific use") cannot sit next to another string of the
  // same statement that supplies a licence (the identifier, the title): the statement is then two statements. This holds with or without a link.
  // Neutral: empty / "Open Access" wording, and "Public Domain" wording next to a CC0 link or id.
  const says = (r: TextRead): boolean => !r.any && !r.neutral && !(r.pd && (u.pd || ids.includes('CC0-1.0')));
  const fams = reads.flatMap((r) => (r.titleFamily ? [r.titleFamily] : []));
  const inFamily = (id: string): boolean => fams.every((f) => id.startsWith(`${f}-`));
  const famMismatch =
    fams.length > 0 &&
    (ids.some((i) => !inFamily(i)) ||
      (!!u.id && !inFamily(u.id)) ||
      (!!(u.unmapped || u.oneOf) && !u.id && !fams.every((f) => uri!.toLowerCase().includes(f.toLowerCase()))));
  const mixed = (reads.length > 1 && reads.some(says) && reads.some((r) => r.ids.length > 0 || r.families.length > 0)) || famMismatch;
  const clash =
    mixed ||
    ids.length > 1 ||
    (ids.length === 1 && families.some((f) => f !== familyOf(ids[0]))) ||
    families.length > 1 ||
    (unmappedText && (ids.length > 0 || families.length > 0));
  const textId = ids.length === 1 && !clash ? ids[0] : undefined;
  if (textId) s.textSpdx = textId;
  if (u.id) s.uriSpdx = u.id;
  if (clash) s.readings = [...ids, ...families.map((f) => `CC ${f}`), ...(unmappedText || mixed ? ['—'] : [])];

  const named = reads.some((r) => r.any);
  // Fail-closed: a text that names a recognised licence and says anything else is not that licence as written. A name this tool
  // cannot turn into an id is unrecognised anyway; there only a restriction marker in the rest changes the verdict.
  const flagged = reads.filter((r) => r.leftover && (r.recognised || r.restricted));
  // A text that names no licence cannot vouch for the link: next to a licence link it may be empty or plain "Open Access" and nothing else
  // ("Free for scientific use", "Please contact the PI" are statements about the data, not the licence).
  const unnamedSays = reads.some((r) => !r.any && !r.neutral && !(r.pd && u.pd));
  const licenceUri = !!(u.id || u.unmapped || u.oneOf);
  const textVsUri =
    !!uri &&
    (clash || // the text itself offers or implies several licences
      (!!textId && !!u.id && textId !== u.id) ||
      (!!textId && !!u.unmapped && !u.oneOf?.includes(textId)) ||
      (unmappedText && !!u.id) ||
      (!!u.id && families.some((f) => f !== familyOf(u.id!))) || // always: a versionless family against the link
      // the text names no licence, says something besides "Open Access", and the URI names one
      (unnamedSays && licenceUri) ||
      // every string is an exact licence name and the link is no licence link and no access value: it says something else about the data
      ((p.source === 'datacite' || p.source === 'zenodo') && !licenceUri && !isNeutralUnnamed(uri) && ids.length === 1 && reads.every((r, i) => r.neutral || !!exactLicenceName(texts[i]))));
  // Precedence: when the readings THEMSELVES differ (text against link, or the text against itself) that is the finding
  // (LIC-TEXT-URI-CONFLICT / LIC-AMBIGUOUS). Only when the readings agree and something is left over does the leftover decide:
  // a restriction marker in it -> LIC-ADDED-CONDITIONS, anything else -> LIC-EXTRA-TEXT.
  if (textVsUri) s.conflict = 'text-uri';
  else if (clash) s.conflict = 'readings';
  else if (flagged.length > 0) {
    s.conflict = flagged.some((r) => r.restricted) ? 'restricted' : 'extra-text';
    // The quote is text that is in the record: the leftover of the shown text as it is. The leftover of another string of the statement (the
    // identifier, the Zenodo title) is never glued to it: alone it is quoted from that string (`leftoverFrom`), next to the shown text's
    // it goes into `otherLeftover`.
    const own = flagged.includes(reads[0]) ? reads[0] : undefined;
    const others = reads.flatMap((r, i) => (i > 0 && flagged.includes(r) ? [{ from: texts[i], rest: r.leftover }] : []));
    if (own) {
      s.leftover = own.leftover;
      s.leftoverFrom = texts[0];
      if (others.length > 0) s.otherLeftover = [...new Set(others.map((o) => o.rest))].join('; ');
    } else {
      s.leftover = others[0].rest;
      s.leftoverFrom = others[0].from;
    }
  } else {
    const agreed = textId ?? u.id;
    if (agreed) {
      s.spdx = agreed;
      // The id itself as the text or as the identifier (Zenodo's rightsIdentifier): machine-readable whatever the free text beside it says.
      // Recorded only where it adds something: a link naming the id, or the id as the shown text, already make the statement readable.
      // And only when every OTHER string of the statement is an exact licence name or neutral.
      if (
        u.id !== agreed &&
        nameKey(s.text ?? '') !== nameKey(agreed) &&
        texts.some((t) => nameKey(t) === nameKey(agreed)) &&
        reads.every((r, i) => r.neutral || (r.pd && agreed === 'CC0-1.0') || !!exactLicenceName(texts[i]))
      )
        s.idExact = true;
    }
  }
  const identifier = p.identifier?.trim();
  if (identifier && !s.spdx && identifier !== s.text) s.identifier = identifier;
  return s;
}

/** The people and body a record names: its creators (some of them organisations) and its publisher. */
export interface RecordParties {
  creators?: readonly string[];
  /** Creators the source marks as organisations. */
  organisations?: readonly string[];
  publisher?: string;
}

const partyTokens = (s: string): string[] =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

/** Words that make a name without a comma an organisation, not a person: it must then match as a whole name. */
const ORG_WORDS = new Set(
  'of for and the und et department dept institute institut university universität universidad centre center group consortium laboratory lab inc ltd gmbh corp co llc foundation association society team project network company ministry agency council committee school college hospital clinic museum library'.split(' '),
);
const ORG_CONNECTORS = new Set(['of', 'for', 'and', 'the', 'und', 'et']);
const isOrganisation = (c: string, who: RecordParties): boolean => {
  if (who.organisations?.includes(c)) return true;
  const t = partyTokens(c);
  if (c.includes(',')) return t.some((w) => ORG_WORDS.has(w) && !ORG_CONNECTORS.has(w));
  return t.length >= 4 || t.some((w) => ORG_WORDS.has(w));
};

/** Particles of surnames: never enough to identify a person on their own. */
const NAME_PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'da', 'di', 'del', 'la', 'le', 'du', 'dos', 'das', 'ten', 'ter', 'bin', 'ibn', 'al', 'el']);

/**
 * `words` (one name of a holder entry) is the person `c`: every word is a word of the creator, a single letter counting as an initial of one,
 * and one whole word matches ("Krašovec N." is "Krašovec, Nina"); or it is "Given Middle… Surname" with the given name first and the
 * whole surname last ("Kevin Thorsen Baird" is "Baird, Kevin"). Anything before, after or outside that is nobody ("Krašovec N. Internal").
 */
function isPerson(words: string[], c: string): boolean {
  const have = partyTokens(c);
  // The first initial must be one of the creator's; a further one is a middle initial and says nothing.
  const initials = words.filter((w) => w.length === 1);
  const wholes = words.filter((w) => w.length > 1);
  const comma0 = c.indexOf(',');
  const surnames = partyTokens(comma0 >= 0 ? c.slice(0, comma0) : c.trim().split(/\s+/).slice(1).join(' ') || c).filter((w) => !NAME_PARTICLES.has(w));
  if (wholes.length > 0 && wholes.every((w) => have.includes(w)) && wholes.some((w) => surnames.includes(w)) && initials.every((w, i) => i > 0 || have.some((h) => h.startsWith(w)))) return true;
  const comma = c.indexOf(',');
  const given = partyTokens(comma >= 0 ? c.slice(comma + 1) : (c.trim().split(/\s+/)[0] ?? ''));
  const surname = partyTokens(comma >= 0 ? c.slice(0, comma) : c.trim().split(/\s+/).slice(1).join(' '));
  if (given.length === 0 || surname.length === 0 || words.length <= surname.length + 1) return false;
  if (words.slice(words.length - surname.length).join(' ') !== surname.join(' ')) return false;
  const first = words[0];
  return first.length === 1 ? given[0].startsWith(first) : given.includes(first);
}

/** One name of a holder entry is a party of the record. Organisations and the publisher match as a whole name; people as above. */
function isParty(name: string, who: RecordParties): boolean {
  const words = partyTokens(name);
  if (words.length === 0) return false;
  const whole = words.join(' ');
  if (who.publisher && partyTokens(who.publisher).join(' ') === whole) return true;
  return (who.creators ?? []).some((c) => (isOrganisation(c, who) ? partyTokens(c).join(' ') === whole : isPerson(words, c)));
}

const HONORIFIC = /(?<![\p{L}\p{N}])(?:dr|prof|professor|ph\.?\s?d|m\.?\s?d|mr|mrs|ms|mx|dipl|ing|msc|mgr|hab)(?![\p{L}\p{N}])\.?/giu;
/** "The authors" in the languages of the corpus: the record's creators, when it has any. Whole entry only. */
const AUTHOR_WORDS = new Set(
  [
    'the author', 'the authors', 'author', 'authors', 'author s', 'authors s', 'the author s',
    'autor', 'autora', 'autores', 'o autor', 'a autora', 'os autores', 'as autoras', 'el autor', 'los autores', 'las autoras',
    'autorzy', 'autori', 'gli autori', 'l autore', 'autore', 'autoren', 'die autoren', 'der autor', 'die autorin', 'auteur', 'auteurs', 'les auteurs', 'l auteur',
  ],
);

/**
 * The text of a holder entry ("© 2026 Nina Krašovec", "Krašovec, N.; Marsetič, A.", "Dr. Jan Berg (ORCID: …)", "The Authors", "CERN") when EVERY name in it
 * is a creator or the publisher of the same record; false for anything else (fail-closed: names only, no list of conditions). ©, "(c)", "Copyright" and
 * years are the notice itself; honorifics, an ORCID / handle in brackets and "et al." (only when the other names match) are dropped from names.
 */
function isHolderOfRecord(text: string, who: RecordParties): boolean {
  const base = text
    .replace(/\(\s*(?:[^()]*orcid[^()]*|[^\s()]*\d[^\s()]*)\)/giu, ' ')
    .replace(/©|\(c\)|(?<![\p{L}\p{N}])copyright(?![\p{L}\p{N}])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:1[5-9]|20)\d{2}(?:\s*[-–]\s*(?:1[5-9]|20)\d{2})?(?![\p{L}\p{N}])/gu, ' ');
  // Only letters, digits, spaces and the punctuation of names: a symbol (an emoji, "$", "+") may carry a condition.
  if (/[^\p{L}\p{M}\p{N}\s.,;&'’()-]/u.test(base)) return false;
  // The whole entry is one party (an organisation's name may contain "and" / a comma).
  const whole = partyTokens(base.replace(HONORIFIC, ' ')).join(' ');
  if (whole && ((who.publisher && partyTokens(who.publisher).join(' ') === whole) || (who.creators ?? []).some((c) => isOrganisation(c, who) && partyTokens(c).join(' ') === whole))) return true;
  const etAl = /(?<![\p{L}\p{N}])et\s+al\b\.?/iu.test(base);
  const stripped = base.replace(/(?<![\p{L}\p{N}])et\s+al\b\.?/giu, ' ');
  if (!etAl && (who.creators?.length ?? 0) > 0 && AUTHOR_WORDS.has(partyTokens(stripped).join(' '))) return true;
  const pieces = stripped
    .split(/[,;&]|(?<![\p{L}\p{N}])(?:and|und|et|y|e)(?![\p{L}\p{N}])/giu)
    .map((n) => n.trim())
    .filter(Boolean);
  // "Surname, I." is one name: a piece of initials only belongs to the piece before it.
  const names: string[] = [];
  for (const piece of pieces) {
    const t = partyTokens(piece);
    if (names.length > 0 && t.length > 0 && t.every((w) => w.length === 1)) names[names.length - 1] += ` ${piece}`;
    else names.push(piece);
  }
  const clean = names.map((n) => n.replace(HONORIFIC, ' ').trim()).filter((n) => partyTokens(n).length > 0);
  // "Surname, Given" arrives as two pieces: two consecutive pieces together may be one person.
  for (let i = 0; i < clean.length; ) {
    if (i + 1 < clean.length && isParty(`${clean[i]} ${clean[i + 1]}`, who)) i += 2;
    else if (isParty(clean[i], who)) i += 1;
    else return false;
  }
  return clean.length > 0;
}
const IN_COPYRIGHT_LINK = /rightsstatements\.org\/vocab\/inc\/1\.0/i;

/**
 * A repeated rights entry that says nothing the licence check needs to look at: empty, an access value ("Open Access", eu-repo / COAR
 * openAccess, as text, link or identifier) or a copyright holder entry whose names are all creators / the publisher of the same record
 * (with or without the "In Copyright" link, as Zenodo writes it) and whose identifier, if any, is "InC" or an access value. Anything else in an
 * entry that names no recognised licence is something the licence should be checked against (fail-closed). A record with no creators and no
 * publisher has no neutral holder entry.
 */
export function isNeutralEntry(text?: string, uri?: string, who: RecordParties = {}, identifier?: string): boolean {
  const t = text?.trim();
  const l = uri?.trim();
  const i = identifier?.trim();
  if (i && nameKey(i) !== 'inc' && !isNeutralUnnamed(i)) return false;
  const holder = !!t && isHolderOfRecord(t, who);
  const textNeutral = !t || isNeutralUnnamed(t) || holder;
  const uriNeutral = !l || isNeutralUnnamed(l) || (IN_COPYRIGHT_LINK.test(l) && holder);
  return textNeutral && uriNeutral;
}

/**
 * The OPEN licence a statement names, even when the statement as a whole is not classified (versionless "CC BY", or a recognised
 * licence plus leftover text): the id when the statement is recognised, else the ids / versionless families its text names, as
 * written ("CC BY", "CC BY-SA"). undefined when it names none, or names any NC / ND / not-open licence (text or link).
 * Never changes the classification; it only answers "does this statement name an open family?" (restriction-code conflicts).
 */
export function openLicenceNamed(s: LicenceStatement): string | undefined {
  if (s.spdx) return isOpenLicence(s.spdx) ? s.spdx : undefined;
  const reads = s.text ? [readText(s.text)] : [];
  const ids = [...new Set(reads.flatMap((r) => r.ids))];
  const families = [...new Set(reads.flatMap((r) => r.families))];
  const uriId = s.uri ? readUri(s.uri).id : undefined;
  const names = [...ids, ...families.map((f) => `CC ${f}`)];
  if (names.length === 0 && uriId) names.push(uriId);
  if (names.length === 0) return undefined;
  if (ids.some((i) => !isOpenLicence(i)) || families.some((f) => /(?:^|-)(?:NC|ND)(?:-|$)/.test(f))) return undefined;
  if (uriId && !isOpenLicence(uriId)) return undefined;
  return names.join(' / ');
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

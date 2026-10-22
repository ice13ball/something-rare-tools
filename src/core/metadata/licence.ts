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
 */
export function isOpenLicence(spdx?: string): boolean {
  return !!spdx && INFO.has(spdx) && !/^CC-BY-(NC|ND)(-|$)/.test(spdx);
}

/* ---------- URI -> id ---------- */

type Read = { id?: string; unmapped?: boolean; family?: string };

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

const NC_ND_SA = '(?:non[\\s-]?commercial|share[\\s-]?alike|no[\\s-]?derivatives?|no[\\s-]?derivs)';
const PORT_CODES = PORTS.map((p) => p.toLowerCase()).join('|');

interface Pattern {
  re: RegExp;
  read: (m: RegExpExecArray) => Read & { span?: [number, number] };
}

const PATTERNS: Pattern[] = [
  {
    // "CC BY 4.0", "cc-by-4.0", "CC BY-NC-SA 3.0 DE", "CC-BY-3.0-IGO". A version is mandatory for an id.
    re: new RegExp(`(?<![a-z0-9])cc[\\s_-]*(by(?:[\\s_-]*(?:nc|sa|nd))*)[\\s_-]*(\\d\\.\\d)(?![\\d])(?:([\\s_/-]*)(${PORT_CODES})(?![a-z0-9]))?`, 'gi'),
    read: (m) => {
      // A port after a space must be written in capitals ("CC BY 3.0 DE"), or "CC-BY-3.0 at Zenodo" would read as Austria.
      const sep = m[3] ?? '';
      const port = m[4] && m[2] !== '4.0' && (/[-/]/.test(sep) || m[4] === m[4].toUpperCase()) ? m[4] : undefined;
      // An ignored port token stays outside the masked span.
      const tail = m[4] && !port ? sep.length + m[4].length : 0;
      return { ...ccId(m[1], m[2], port), span: [m.index, m.index + m[0].length - tail] };
    },
  },
  {
    // "CC BY" / "CC-BY-NC" without a version: not an id, but its family is compared with the URI.
    re: /(?<![a-z0-9])cc[\s_-]*(by(?:[\s_-]*(?:nc|sa|nd))*)(?![\s_-]*(?:\d|nc\b|sa\b|nd\b))(?![a-z0-9])/gi,
    read: (m) => ({ family: ccVariant(m[1]) }),
  },
  {
    // "Creative Commons Attribution Non Commercial Share Alike 4.0 International", "... 3.0 Germany", "... 3.0 IGO"
    re: new RegExp(`creative\\s+commons\\s+attribution((?:[\\s-]+${NC_ND_SA})*)[\\s-]*(\\d\\.\\d)(?![\\d])(?:\\s+(germany|austria|australia|netherlands|united\\s+states|igo|france|england\\s+and\\s+wales|japan))?`, 'gi'),
    read: (m) => {
      const parts = (m[1].match(/non[\s-]?commercial|share[\s-]?alike|no[\s-]?deriv\w*/gi) ?? []).map((p) => (/^non/i.test(p) ? 'NC' : /^share/i.test(p) ? 'SA' : 'ND'));
      const port = m[3] ? PORT_NAMES[m[3].toLowerCase().replace(/\s+/g, ' ')] : undefined;
      return ccId(['BY', ...parts].join('-'), m[2], port);
    },
  },
  { re: /(?<![a-z0-9])cc[\s_-]*(?:0|zero)(?![a-z0-9])|creative\s+commons\s+zero/gi, read: () => ({ id: 'CC0-1.0' }) },
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
  { re: /(?<![a-z0-9])nlod[\s)-]*(?:v|version\s*)?(\d)\.(\d)/gi, read: (m) => known(`NLOD-${m[1]}.${m[2]}`) },
];

/**
 * Words that add conditions or take something away. Found OUTSIDE the licence name they mean the text is not just
 * the licence ("CC BY 4.0, but not for commercial use"). Exact words and word-start stems, pl/en/de/fr.
 * Deliberately generous: a false hit only sends the statement to "check manually".
 */
const MARKER_WORDS = [
  'no', 'not', 'non', 'but', 'only', 'except', 'unless', 'without', 'nie', 'bez', 'ale', 'poza', 'tylko', 'nur', 'aber', 'nicht',
  'ohne', 'mais', 'pas', 'sans', 'sauf', 'fins', 'außer', 'ausser',
];
const MARKER_STEMS = [
  'excluding', 'exception', 'prohibit', 'forbidden', 'restrict', 'permission', 'apart from', 'other than', 'limited', 'purpose',
  'commercial', 'rights reserved', 'embargo', 'moratorium', 'confidential', 'proprietary',
  'oprócz', 'wyjątk', 'wyłącznie', 'jedynie', 'zakaz', 'zabronion', 'komercyjn', 'ograniczon', 'zastrzeżon', 'zgod', 'cel(?:ów|u|e|em)(?![\\p{L}])',
  'ausgenommen', 'ausschließlich', 'ausschliesslich', 'verbot', 'untersag', 'kommerz', 'nichtkommerz', 'zweck', 'genehmigung', 'erlaubnis', 'vorbehalten',
  'excepté', 'uniquement', 'seulement', 'exclusivement', 'interdit', 'interdiction', 'autorisation', 'réservé',
];
const MARKERS = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:${MARKER_WORDS.join('|')})(?![\\p{L}\\p{N}])|(?:${MARKER_STEMS.join('|')}))`, 'iu');

interface TextRead {
  ids: string[];
  families: string[];
  unmapped: boolean;
  /** The text carries something besides the licence name. */
  restricted: boolean;
  /** Licence names found at all (recognised or not). */
  any: boolean;
}

function readText(raw: string): TextRead {
  const out: TextRead = { ids: [], families: [], unmapped: false, restricted: false, any: false };
  const text = raw.replace(/https?:\/\/\S+/gi, ' ').replace(/\bURI:/gi, ' ');
  const spans: [number, number][] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const r = p.read(m as RegExpExecArray);
      out.any = true;
      if (r.id && !out.ids.includes(r.id)) out.ids.push(r.id);
      if (r.family && !out.families.includes(r.family)) out.families.push(r.family);
      if (r.unmapped) out.unmapped = true;
      spans.push(r.span ?? [m.index!, m.index! + m[0].length]);
    }
  }
  // Mask the licence names; what is left is the rest of the sentence.
  const chars = text.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) chars[i] = ' ';
  out.restricted = MARKERS.test(chars.join('').replace(/\bno rights reserved\b/gi, ' '));
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
  // One string naming several different licences ("CC BY 4.0 or CC BY-SA 4.0") cannot give one id.
  const multi = reads.some((r) => r.ids.length > 1);
  const textId = ids.length === 1 && !multi ? ids[0] : undefined;
  const u = uri ? readUri(uri) : {};
  if (textId) s.textSpdx = textId;
  if (u.id) s.uriSpdx = u.id;

  const restricted = reads.some((r) => r.restricted) && (reads.some((r) => r.any) || !!u.id);
  const textVsUri =
    (ids.length > 1 && !multi) || // identifier and rights text disagree with each other
    (multi && !!u.id) || // the text offers several licences, the URI names one
    (!!textId && !!u.id && textId !== u.id) ||
    (!!textId && !!u.unmapped) ||
    (reads.some((r) => r.unmapped) && !!u.id) ||
    (!textId && !!u.id && families.some((f) => f !== familyOf(u.id!)));
  if (restricted) s.conflict = 'restricted';
  else if (textVsUri) s.conflict = 'text-uri';
  else {
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

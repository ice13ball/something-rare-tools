// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Licence normalisation. Pure functions, no I/O.

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

const CC_VARIANTS = new Set(['BY', 'BY-SA', 'BY-NC', 'BY-NC-SA', 'BY-ND', 'BY-NC-ND']);
const OPEN_SPDX = /^(CC-BY(-SA)?-\d\.\d|CC0-1\.0|ODbL-1\.0|PDDL-1\.0|ODC-By-1\.0)$/;

function cc(variant: string, version: string): string | undefined {
  const v = variant.toUpperCase();
  return CC_VARIANTS.has(v) ? `CC-${v}-${version}` : undefined;
}

function fromUri(uri: string): string | undefined {
  const u = uri.trim().toLowerCase();
  // https://creativecommons.org/licenses/by-nc-sa/4.0/{legalcode,deed.pl,pl/} — host, scheme, www, trailing parts are irrelevant
  const m = /creativecommons\.org\/licen[sc]es\/(by(?:-(?:nc|sa|nd))*)\/(\d\.\d)(?![\d])/.exec(u);
  if (m) return cc(m[1], m[2]);
  if (/creativecommons\.org\/publicdomain\/zero\/1\.0(?![\d])/.test(u)) return 'CC0-1.0';
  if (/opendatacommons\.org\/licenses\/odbl\/1[-.]0(?![\d])/.test(u)) return 'ODbL-1.0';
  if (/opendatacommons\.org\/licenses\/pddl\/1[-.]0(?![\d])/.test(u)) return 'PDDL-1.0';
  if (/opendatacommons\.org\/licenses\/by\/1[-.]0(?![\d])/.test(u)) return 'ODC-By-1.0';
  return undefined;
}

function fromText(text: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  // "CC BY 4.0", "cc-by-4.0", "CC BY-NC-SA 4.0", "...(CC-BY-4.0)". A version is mandatory.
  const m = /(?<![a-z0-9])cc[\s_-]*(by(?:[\s_-]*(?:nc|sa|nd))*)[\s_-]*(\d\.\d)(?![\d])/.exec(t);
  if (m) return cc(m[1].replace(/[\s_]+/g, '-'), m[2]);
  // Spelled-out names: "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International"
  const n = /creative\s+commons\s+attribution((?:[\s-]+(?:noncommercial|sharealike|share\s+alike|noderivatives|noderivs|no\s+derivatives))*)[\s-]*(\d\.\d)(?![\d])/.exec(t);
  if (n) {
    const parts: string[] = (n[1].match(/noncommercial|share\s*alike|no\s*derivatives|noderivs|noderivatives/g) ?? []).map((p) =>
      p.startsWith('non') ? 'NC' : p.startsWith('share') ? 'SA' : 'ND',
    );
    const ordered = ['NC', 'SA', 'ND'].filter((p) => parts.includes(p));
    return cc(['BY', ...ordered].join('-'), n[2]);
  }
  if (/(?<![a-z0-9])cc[\s_-]*(0|zero)(?![a-z0-9])/.test(t)) return 'CC0-1.0';
  if (/(?<![a-z0-9])odbl(?![a-z0-9])/.test(t) || /(?<![a-z0-9])odc-odbl(?![a-z0-9])/.test(t)) return 'ODbL-1.0';
  return undefined;
}

/**
 * Normalise a licence statement to an SPDX id. A recognised URI wins over text.
 * Versionless text ("CC BY") is deliberately NOT normalised: it is not machine-readable.
 */
export function toSpdx(text?: string, uri?: string): string | undefined {
  if (uri) {
    const s = fromUri(uri);
    if (s) return s;
  }
  if (text) return fromText(text);
  return undefined;
}

/**
 * Open in the Open Definition sense: reuse and redistribution allowed without NC/ND restrictions.
 * (CC-BY, CC-BY-SA, CC0, ODbL, PDDL, ODC-By.)
 */
export function isOpenLicence(spdx?: string): boolean {
  return !!spdx && OPEN_SPDX.test(spdx);
}

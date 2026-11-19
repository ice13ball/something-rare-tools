// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Does a free text in a field of its own (ISO otherConstraints / useLimitation, Dataverse termsOfUse) narrow the licence next to it?
// Content patterns, not generic markers: an attribution request, "cite as", a disclaimer of warranty or the licence name repeated
// say nothing about who may use the data, and a false warning is as bad as the false OK it replaces. Pure, no I/O.

/** What the restriction takes away from the licence. */
export type NarrowingKind = 'access' | 'non-commercial' | 'no-derivatives' | 'no-redistribution' | 'on-request' | 'contact-first';

/** Up to `n` characters inside one clause that contain no negation (a negated "restricted to" is the opposite of a restriction). */
const T = (n: number): string => `(?:(?!\\b(?:not|no|never|without)\\b)[^.;]){0,${n}}`;
/** Up to `n` characters inside one clause. */
const C = (n: number): string => `[^.;]{0,${n}}`;

const GROUP = '(?:member|partner|user|staff|consortium|participant|project|registered|authori[sz]ed|internal|employee|colleague|collaborator)s?';
const PERMISSION = '(?:permission|consent|approval|authori[sz]ation|agreement)';

const PATTERNS: readonly { kind: NarrowingKind; re: RegExp }[] = [
  // access limited to a group or closed
  { kind: 'access', re: new RegExp(`\\b(?:access|use|usage|available|availability|distribution|reuse|re-use|data|dataset)\\b${T(30)}\\b(?:restricted|limited)\\s+to\\b`, 'i') },
  { kind: 'access', re: /\brestricted\s+(?:access|use|data|dataset|distribution)\b/i },
  { kind: 'access', re: /^\W*restricted\W*$/i },
  { kind: 'access', re: /\b(?:internal|in-house|private)\s+use\s+only\b|\bfor\s+internal\s+use\b/i },
  { kind: 'access', re: new RegExp(`\\b(?:available|accessible|access|open|restricted)\\b${T(30)}\\b(?:to|for)\\b${T(40)}\\b${GROUP}\\b${C(20)}\\bonly\\b`, 'i') },
  { kind: 'access', re: /\b(?:confidential|embargo(?:ed)?|classified)\b/i },
  { kind: 'access', re: /\bnot\s+(?:publicly|openly|freely|generally|currently)\s+(?:available|accessible)\b|\bclosed\s+access\b|\bnon-?public\b/i },
  { kind: 'access', re: /\b(?:zugang|zugriff|nutzung)\b[^.;]{0,30}\b(?:nur|beschr[äa]nkt|begrenzt|eingeschr[äa]nkt)|\bvertraulich\b/i },
  { kind: 'access', re: /\bacc[eè]s\b[^.;]{0,20}\b(?:r[ée]serv|limit|restreint)/i },
  { kind: 'access', re: /\bdost[eę]p\b[^.;]{0,30}(?:ograniczon|tylko|wy[łl][ąa]cznie)|\bpoufn/i },
  // non-commercial
  { kind: 'non-commercial', re: /\bnon[-\s]?commerci|\bnicht[-\s]?kommerziell|\bkeine\s+kommerzielle|\bniekomercyjn/i },
  { kind: 'non-commercial', re: /\bno\s+commercial\b/i },
  { kind: 'non-commercial', re: /\bnot\s+(?:to\s+be\s+)?(?:(?:used?|sold|exploited|distributed)\s+)?(?:for|in)\s+(?:any\s+)?commercial\b/i },
  { kind: 'non-commercial', re: /\bcommercial\s+(?:use|reuse|exploitation|purposes?|applications?)\s+(?:is\s+|are\s+)?(?:prohibited|forbidden|not\s+(?:permitted|allowed)|restricted)\b/i },
  { kind: 'non-commercial', re: /\bcommercial\s+(?:use|reuse|exploitation)\s+(?:requires?|needs?)\b/i },
  { kind: 'non-commercial', re: /\b(?:prohibit|forbid)\w*\b[^.;]{0,30}\bcommercial/i },
  { kind: 'non-commercial', re: /\b(?:research|academic|educational|scientific|teaching)\s+(?:use|purposes?|uses)?\s*only\b/i },
  // no derivatives / no redistribution
  { kind: 'no-derivatives', re: /\bno[-\s]?derivat/i },
  { kind: 'no-derivatives', re: /\b(?:may|must|can|should|shall)\s+not\s+(?:be\s+)?(?:modified|altered|changed|adapted)\b|\bnot\s+to\s+be\s+(?:modified|altered|changed|adapted)\b/i },
  { kind: 'no-redistribution', re: /\b(?:do\s+not|don't|must\s+not|may\s+not|cannot|not\s+to\s+be)\s+(?:be\s+)?(?:re-?distribut|re-?shar|re-?publish|pass\s+on)/i },
  { kind: 'no-redistribution', re: /\bre-?distribution\s+(?:is\s+|are\s+)?(?:not\s+(?:permitted|allowed)|prohibited|forbidden)\b|\bnot\s+for\s+re-?distribution\b|\bno\s+re-?distribution\b|\bkeine\s+weitergabe\b/i },
  // on request only
  { kind: 'on-request', re: /^\W*(?:the\s+)?(?:(?:raw|full|complete|original|underlying|these|this|research)\s+)*(?:data|dataset|datasets|files?)\b[^.;]{0,30}\b(?:available|provided|accessible|obtainable|shared)\b[^.;]{0,20}\b(?:on|upon|by)\s+(?:request|demand)\b/i },
  { kind: 'on-request', re: /\baccess\b[^.;]{0,40}\b(?:on|upon|by)\s+(?:request|demand)\b/i },
  { kind: 'on-request', re: /\b(?:daten|datensatz|zugang|zugriff)\b[^.;]{0,40}\b(?:auf|nach)\s+(?:anfrage|anforderung)\b/i },
  { kind: 'on-request', re: /\b(?:donn[ée]es|acc[eè]s)\b[^.;]{0,40}\bsur\s+demande\b/i },
  { kind: 'on-request', re: /\b(?:dane|dost[eę]p)\b[^.;]{0,40}\bna\s+(?:[żz]yczenie|pro[śs]b[ęe]|zapytanie|wniosek)/i },
  // contact or ask first
  { kind: 'contact-first', re: new RegExp(`\\b(?:contact|ask|inform|notify|consult)\\b${C(50)}\\b(?:before|prior\\s+to)\\b${C(20)}\\b(?:us(?:ing|e|age)|reus(?:e|ing)|download|publish|access)`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\b(?:prior|advance)\\s+(?:written\\s+|explicit\\s+|express\\s+)?${PERMISSION}\\b${C(30)}\\b(?:required|needed|necessary|mandatory)\\b`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\b${PERMISSION}\\b${C(25)}\\b(?:must|has\\s+to|needs?\\s+to|should|shall)\\s+be\\s+(?:obtained|sought|requested|granted|given)`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\brequires?\\b${C(20)}\\b${PERMISSION}\\b`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\b(?:ask|request|seek|obtain|get)\\b${C(20)}\\b${PERMISSION}\\b`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\b${PERMISSION}\\s+(?:is\\s+|are\\s+)?(?:required|needed|necessary)\\b`, 'i') },
  { kind: 'contact-first', re: new RegExp(`\\bnot\\b(?![^.;]{0,50}\\b(?:restricted|limited|required|needed|necessary)\\b)${C(50)}\\bwithout\\b${C(30)}${PERMISSION}\\b`, 'i') },
];

/** "No permission is required", "without permission", "permission is not needed": the opposite of a request for permission. */
const PERMISSION_NOT_NEEDED = new RegExp(`\\b(?:no|without)\\b${C(30)}\\b${PERMISSION}\\b|\\b${PERMISSION}\\s+(?:is\\s+|are\\s+)?not\\s+(?:required|needed|necessary)\\b`, 'i');
/** Commercial and non-commercial use alike: nothing is taken away. */
const BOTH_USES = /\bcommercial\s*(?:and|or|&|\/|,)\s*non|\bnon[-\s]?commercial\s*(?:and|or|&|\/|,)\s*commercial|\bboth\b|\bnot\s+(?:restricted|limited)\s+to\s+non/i;

/** Clauses of one text: sentences, semicolon parts and lines (a full stop inside a DOI or an abbreviation does not split). */
const clauses = (text: string): string[] => text.split(/(?<=[.!?;])\s+|\n+/).map((c) => c.trim()).filter((c) => c !== '');

/** The first way the text narrows a licence, or undefined when it does not (attribution, citation, disclaimer, the licence repeated, neutral). */
export function narrowingOf(text: string | undefined): NarrowingKind | undefined {
  if (!text) return undefined;
  for (const clause of clauses(text)) {
    for (const { kind, re } of PATTERNS) {
      if (!re.test(clause)) continue;
      if (kind === 'contact-first' && PERMISSION_NOT_NEEDED.test(clause) && !/\bnot\b[^.;]{0,50}\bwithout\b/i.test(clause)) continue;
      if (kind === 'non-commercial' && BOTH_USES.test(clause)) continue;
      return kind;
    }
  }
  return undefined;
}

/** Does the restriction say more than the licence itself (a NonCommercial text next to a -NC licence repeats it)? */
export function narrowsLicence(kind: NarrowingKind, licenceId: string): boolean {
  if (kind === 'non-commercial' && /(?:^|-)NC(?:-|$)/.test(licenceId)) return false;
  if (kind === 'no-derivatives' && /(?:^|-)ND(?:-|$)/.test(licenceId)) return false;
  return true;
}

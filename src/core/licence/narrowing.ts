// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Does a free text in a field of its own (ISO otherConstraints / useLimitation, Dataverse termsOfUse) narrow the licence next to it?
// Content patterns, not generic markers: an attribution request, "cite as", a disclaimer of warranty or the licence name repeated
// say nothing about who may use the data, and a false warning is as bad as the false OK it replaces. When unsure the matcher stays
// silent. Pure, no I/O.
//
// How a clause is read: (1) a clause that only makes an attribution condition ("without acknowledging the source", "ohne Quellenangabe")
// is skipped, and a positive attribution condition ("with attribution", "mit Quellenangabe") is cut out first; (2) the patterns below
// are tried, one list per language; (3) a match does not count when it is negated: a negator in the matched words themselves ("not
// restricted", "nicht beschränkt", "non restreint", "nie jest ograniczony") or in the two words before it ("no embargo", "not confidential").

/** What the restriction takes away from the licence. */
export type NarrowingKind = 'access' | 'non-commercial' | 'no-derivatives' | 'no-redistribution' | 'on-request' | 'contact-first';

/** Up to `n` characters inside one clause (a clause has no full stop or semicolon). */
const C = (n: number): string => String.raw`[^.;]{0,${n}}`;
/** A letter of any language; `\b` only knows ASCII, so a word that starts or ends in ä, é, ł, ś ... is bounded with these. */
const START = String.raw`(?<![\p{L}])`;
const END = String.raw`(?![\p{L}])`;

// ---- negation ----------------------------------------------------------------------------------------------------------------------
const NEGATORS = [
  'no', 'not', 'non', 'none', 'never', 'cannot', 'without', // en
  'nicht', 'kein\\p{L}*', 'ohne', 'uneingeschr\\p{L}*', 'unbeschr\\p{L}*', // de
  'pas', 'aucun\\p{L}*', 'sans', // fr
  'nie', 'bez', 'brak', 'nieograniczon\\p{L}*', // pl
  'unrestricted',
].join('|');
/** A negator anywhere inside the matched words: "is not restricted", "nicht beschränkt", "non restreint". */
const NEGATED_INSIDE = new RegExp(`${START}(?:${NEGATORS})${END}`, 'iu');
/** A negator right before the match, at most two words away: "no embargo", "not confidential", "The data contain no confidential". */
const NEGATED_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${NEGATORS})[\\s-]+(?:\\p{L}+[\\s,]+){0,2}$`, 'iu');

// ---- attribution: CC BY itself asks for it, so it narrows nothing ----------------------------------------------------------------------
const ATTRIB_EN = String.raw`(?:acknowledg\p{L}*|cit(?:e|ed|es|ing|ation)|credit\p{L}*|attribut\p{L}*|indicat\p{L}*|stating|mention\p{L}*|referenc\p{L}*|naming)`;
/** "without acknowledging the source", "ohne Quellenangabe", "sans citer", "bez podania źródła": the clause is the attribution condition itself. */
const WITHOUT_ATTRIBUTION = new RegExp(
  [
    String.raw`\bwithout\s+(?:\p{L}+\s+)?${ATTRIB_EN}`, // en
    String.raw`\bohne\s+(?:\p{L}+\s+)?(?:quelle\p{L}*|angabe|nennung|namensnennung|zitat\p{L}*|zitier\p{L}*|urheber\p{L}*)`, // de
    String.raw`\bsans\s+(?:citer|mentionner|indiquer|mention|citation|cr[ée]dit)`, // fr
    String.raw`\bbez\s+(?:podania|cytowania|wskazania|zaznaczenia|powo[łl]ania)`, // pl
  ].join('|'),
  'iu',
);
/** A positive attribution condition, cut out of the clause before the patterns run: "with attribution", "mit Quellenangabe", "z podaniem źródła". */
const ATTRIBUTION_CONDITION = new RegExp(
  [
    String.raw`\b(?:with|provided|if|when|as\s+long\s+as|subject\s+to|on\s+condition|upon)\b[^.;,]{0,40}?\b${ATTRIB_EN}`, // en
    String.raw`\b(?:mit|unter|bei|gegen|nach|vorbehaltlich)\s+(?:\p{L}+\s+){0,2}?(?:quellenangabe|quellennennung|angabe|nennung|namensnennung|zitat\p{L}*|zitier\p{L}*)`, // de
    String.raw`\bsous\s+r[ée]serve\s+d(?:e|['’])\s*(?:citer|mentionner|indiquer)|\bavec\s+(?:la\s+)?(?:mention|citation|indication)|\ben\s+(?:citant|mentionnant|indiquant)`, // fr
    String.raw`\b(?:z|ze|po)\s+(?:podaniem|podaniu|powo[łl]aniem|zaznaczeniem|wskazaniem|cytowaniem)|\bpod\s+warunkiem\s+(?:podania|cytowania|wskazania|zaznaczenia)`, // pl
  ].join('|'),
  'iu',
);

// ---- the patterns ------------------------------------------------------------------------------------------------------------------
interface Pattern {
  kind: NarrowingKind;
  re: RegExp;
  /** The pattern is itself a negative statement ("not to be used", "keine Weitergabe"): a negator inside the match is its meaning, not a void. */
  own: boolean;
  /** A clause that also matches this one is not a restriction. */
  unless?: RegExp;
}
/** One pattern. Kinds that are negative by nature (non-commercial, no derivatives, no redistribution) are `own` unless said otherwise. */
const p = (kind: NarrowingKind, src: string, o: { own?: boolean; unless?: RegExp } = {}): Pattern => ({
  kind,
  re: new RegExp(src, 'iu'),
  own: o.own ?? (kind === 'non-commercial' || kind === 'no-derivatives' || kind === 'no-redistribution'),
  unless: o.unless,
});

// Words for the group a restriction reserves the data for.
const GROUP_EN = String.raw`(?:members?|partners?|users?|staff|consortium|participants?|registered|authori[sz]ed|internal|employees?|colleagues?|collaborators?|teams?|researchers?|scientists?|owners?|affiliates?)`;
const GROUP_DE = String.raw`(?:projekt\p{L}*|partner\p{L}*|mitglied\p{L}*|nutzer\p{L}*|mitarbeiter\p{L}*|konsortium\p{L}*|teilnehmer\p{L}*|registriert\p{L}*|berechtigt\p{L}*|intern\p{L}*|angeh[öo]rig\p{L}*)`;
const GROUP_FR = String.raw`(?:partenaires?|membres?|utilisateurs?|chercheurs?|projet|consortium|personnel|[ée]quipe|interne?s?|abonn[ée]s?)`;
const GROUP_PL = String.raw`(?:partner\p{L}*|cz[łl]onk\p{L}*|u[żz]ytkownik\p{L}*|pracownik\p{L}*|konsorcjum|uczestnik\p{L}*|zarejestrowan\p{L}*|upowa[żz]nion\p{L}*|wewn[eę]trzn\p{L}*|zesp[óo][łl]\p{L}*)`;
// Purposes a licence that allows every use does not limit the data to.
const PURPOSE_EN = String.raw`(?:research|academic|scientific|educational|teaching|non-?profit|non-?commercial)`;
const PERMISSION = String.raw`(?:permission|consent|approval|authori[sz]ation|agreement)`;
/** An embargo or a confidentiality that the text says is over or does not exist. */
const NO_EMBARGO = new RegExp(`\\b(?:none|n\\/?a|ended|expired|lifted|over|removed|released|no\\s+longer)\\b|${START}(?:aufgehoben|abgelaufen|lev[ée]e?|expir[ée]e?|zako[nń]czon\\p{L}*|wygas\\p{L}*)`, 'iu');

const EN: readonly Pattern[] = [
  // access: "restricted to project members", "limited to registered users" (a limit to a scale, a depth or an area names no group)
  p('access', String.raw`\b(?:restricted|limited|reserved|confined)\s+(?:to|for)\b${C(40)}\b${GROUP_EN}\b`),
  // access: "restricted access", "restricted use", "restricted data"
  p('access', String.raw`\brestricted\s+(?:access|use|data|dataset|distribution)\b`),
  // access: the whole text is the word "Restricted"
  p('access', String.raw`^\W*restricted\W*$`),
  // access: "internal use only", "for internal use"
  p('access', String.raw`\b(?:internal|in-house|private)\s+use\s+only\b|\bfor\s+internal\s+use\b`),
  // access: "available to registered users only", "open to partners only"
  p('access', String.raw`\b(?:available|accessible|access|open)\b${C(30)}\b(?:to|for)\b${C(40)}\b${GROUP_EN}\b${C(20)}\bonly\b`),
  // access: "only available to members", "only for registered users"
  p('access', String.raw`\bonly\s+(?:available|accessible|open|for|to)\b${C(25)}\b${GROUP_EN}\b`),
  // access: confidential, embargoed, classified (not when the text says there is none or it is over)
  p('access', String.raw`\b(?:confidential|embargo(?:ed)?|classified)\b`, { unless: NO_EMBARGO }),
  // access: "not publicly available", "closed access", "non-public"
  p('access', String.raw`\bnot\s+(?:publicly|openly|freely|generally|currently)\s+(?:available|accessible)\b|\bclosed\s+access\b|\bnon-?public\b`, { own: true }),
  // access: registration or a login is required
  p('access', String.raw`\b(?:registration|login|log-in|sign-in|account)\b${C(30)}\b(?:required|needed|necessary|mandatory)\b|\b(?:requires?|requiring|needs?|must|have\s+to)\b${C(20)}\b(?:registration|register|registering|log\s?in|an\s+account|sign\s+in)\b`),
  // access: a data use agreement must be signed
  p('access', String.raw`\b(?:sign|signed|signing)\b${C(30)}\b(?:agreement|contract|nda|non-disclosure)\b|\b(?:data\s+(?:use|sharing|access)|user|usage|licen[cs]e|access)\s+agreement\b${C(30)}\b(?:required|signed|needed|necessary|must)\b`),
  // access: the INSPIRE Directive's Article 13 limitations on public access
  p('access', String.raw`\b(?:limit\p{L}*|restrict\p{L}*)\b${C(40)}\b(?:article|art\.?)\s*13\b|\b(?:article|art\.?)\s*13\b${C(60)}\b(?:inspire|directive|2007\/2\/ec)\b`),
  // non-commercial: "non-commercial", "no commercial use", "not for commercial purposes"
  p('non-commercial', String.raw`\bnon[-\s]?commerci|\bno\s+commercial\b|\bnot\s+(?:to\s+be\s+)?(?:(?:used?|sold|exploited|distributed)\s+)?(?:for|in)\s+(?:any\s+)?commercial\b`),
  // non-commercial: "commercial use is prohibited / not permitted / restricted"
  p('non-commercial', String.raw`\bcommercial\s+(?:use|reuse|exploitation|purposes?|applications?)\s+(?:is\s+|are\s+)?(?:prohibited|forbidden|not\s+(?:permitted|allowed)|restricted)\b|\b(?:prohibit|forbid)\p{L}*\b${C(30)}\bcommercial`),
  // non-commercial: "commercial use requires permission"
  p('non-commercial', String.raw`\bcommercial\s+(?:use|reuse|exploitation)\s+(?:requires?|needs?)\b`),
  // non-commercial: "for commercial use contact ..." (the licence needs no contact, so the sentence implies a permission)
  p('non-commercial', String.raw`\b(?:for\s+)?commercial\s+(?:uses?|purposes?|reuse|applications?|licen[cs]ing)\b[\s:,–-]*(?:please\s+|kindly\s+)?(?:contact|ask|e-?mail|write\s+to|apply)\b${C(40)}`, { own: false }),
  // non-commercial: "research use only", "for academic purposes only"
  p('non-commercial', String.raw`\b(?:research|academic|educational|scientific|teaching)\s+(?:use|purposes?|uses)?\s*only\b`),
  // non-commercial: "only for scientific use", "may only be used for research"
  p('non-commercial', String.raw`\b(?:only|solely|exclusively)\s+(?:(?:to\s+)?be\s+used\s+)?(?:for|in)\s+(?:the\s+)?(?:\p{L}+\s+){0,2}?${PURPOSE_EN}`),
  // no derivatives: "no derivative works", "may not be modified"
  p('no-derivatives', String.raw`\bno[-\s]?derivat|\b(?:may|must|can|should|shall)\s+not\s+(?:be\s+)?(?:modified|altered|changed|adapted)\b|\bnot\s+to\s+be\s+(?:modified|altered|changed|adapted)\b`),
  // no redistribution: "do not redistribute", "not for redistribution", "redistribution is not permitted"
  p('no-redistribution', String.raw`\b(?:do\s+not|don't|must\s+not|may\s+not|cannot|not\s+to\s+be)\s+(?:be\s+)?(?:re-?distribut|re-?shar|re-?publish|pass\s+on)|\bre-?distribution\s+(?:is\s+|are\s+)?(?:not\s+(?:permitted|allowed)|prohibited|forbidden)\b|\bnot\s+for\s+re-?distribution\b|\bno\s+re-?distribution\b`),
  // on request: "data available on request" (not when it speaks of a period or year before, which is other data)
  p('on-request', String.raw`^\W*(?:the\s+)?(?:(?:raw|full|complete|original|underlying|these|this|research)\s+)*(?:data|dataset|datasets|files?)\b${C(30)}\b(?:available|provided|accessible|obtainable|shared)\b${C(20)}\b(?:on|upon|by)\s+(?:request|demand)\b`, {
    unless: /\bfor\s+the\s+period\b|\b(?:before|prior\s+to|earlier\s+than)\s+\d{4}\b/i,
  }),
  // on request: "access to the files by request only"
  p('on-request', String.raw`\baccess\b${C(40)}\b(?:on|upon|by)\s+(?:request|demand)\b`),
  // contact first: "contact the owner before using", "ask ... before downloading"
  p('contact-first', String.raw`\b(?:contact|ask|inform|notify|consult)\b${C(50)}\b(?:before|prior\s+to)\b${C(20)}\b(?:us(?:ing|e|age)|reus(?:e|ing)|download|publish|access)`),
  // contact first: "prior written permission is required"
  p('contact-first', String.raw`\b(?:prior|advance)\s+(?:written\s+|explicit\s+|express\s+)?${PERMISSION}\b${C(30)}\b(?:required|needed|necessary|mandatory)\b`),
  // contact first: "permission must be obtained"
  p('contact-first', String.raw`\b${PERMISSION}\b${C(25)}\b(?:must|has\s+to|needs?\s+to|should|shall)\s+be\s+(?:obtained|sought|requested|granted|given)`),
  // contact first: "requires the permission of", "ask for permission", "permission is required"
  p('contact-first', String.raw`\brequires?\b${C(20)}\b${PERMISSION}\b|\b(?:ask|request|seek|obtain|get)\b${C(20)}\b${PERMISSION}\b|\b${PERMISSION}\s+(?:is\s+|are\s+)?(?:required|needed|necessary)\b`),
  // contact first: "may not / cannot be used without permission"
  p('contact-first', String.raw`\b(?:not|cannot|can't|never)\b(?![^.;]{0,50}\b(?:restricted|limited|required|needed|necessary)\b)${C(50)}\bwithout\b${C(30)}${PERMISSION}\b`, { own: true }),
];

const DE: readonly Pattern[] = [
  // access: "Zugriff beschränkt auf Projektmitglieder", "Zugang eingeschränkt"
  p('access', String.raw`\b(?:zugang|zugriff|nutzung)\b${C(30)}\b(?:beschr[äa]nkt|begrenzt|eingeschr[äa]nkt)\b`),
  // access: "Zugang nur für Projektpartner", "nur an registrierte Nutzer"
  p('access', String.raw`\bnur\s+(?:f[üu]r|an|von)\s+(?:\p{L}+\s+){0,2}?${GROUP_DE}`),
  // access: "vertraulich"
  p('access', String.raw`\bvertraulich`),
  // non-commercial: "nicht kommerziell", "keine kommerzielle Nutzung"
  p('non-commercial', String.raw`\bnicht[-\s]?kommerziell|\bkeine\s+kommerzielle`),
  // non-commercial: "Kommerzielle Nutzung untersagt / nicht gestattet / nur mit Genehmigung"
  p('non-commercial', String.raw`\bkommerziell\p{L}*\s+(?:nutzung|verwertung|verwendung)\p{L}*\s+(?:ist\s+|sind\s+)?(?:untersagt|verboten|ausgeschlossen|unzul[äa]ssig|nicht\s+(?:gestattet|erlaubt|zul[äa]ssig)|nur\s+(?:mit|nach)|bedarf|erfordert)`),
  // non-commercial: "nur für wissenschaftliche Zwecke", "ausschließlich für Forschung und Lehre"
  p('non-commercial', String.raw`\b(?:nur|ausschlie(?:ß|ss)lich)\s+(?:f[üu]r|zu)\s+(?:\p{L}+\s+){0,2}?(?:forschung\p{L}*|wissenschaft\p{L}*|lehr\p{L}*|bildung\p{L}*|nicht[-\s]?kommerz\p{L}*)`),
  // no derivatives: "keine Bearbeitung", "darf nicht verändert werden", "Veränderung untersagt"
  p('no-derivatives', String.raw`\bkeine\s+(?:bearbeitung|ableitung|abwandlung|ver[äa]nderung)\p{L}*|\bnicht\s+(?:bearbeitet|ver[äa]ndert)\s+werden|\b(?:bearbeitung|ver[äa]nderung)\p{L}*\s+(?:ist\s+|sind\s+)?(?:untersagt|verboten|nicht\s+(?:gestattet|erlaubt|zul[äa]ssig))`),
  // no redistribution: "keine Weitergabe", "Weitergabe untersagt"
  p('no-redistribution', String.raw`\bkeine\s+(?:weitergabe|weiterverbreitung)|\b(?:weitergabe|weiterverbreitung)\p{L}*\s+(?:ist\s+|an\s+dritte\s+)*(?:untersagt|verboten|nicht\s+(?:gestattet|erlaubt|zul[äa]ssig))|\bnicht\s+(?:weitergegeben|weiterverbreitet)\s+werden`),
  // on request: "Daten auf Anfrage erhältlich"
  p('on-request', String.raw`\b(?:daten|datensatz|zugang|zugriff)\b${C(40)}\b(?:auf|nach)\s+(?:anfrage|anforderung)\b`),
];

const FR: readonly Pattern[] = [
  // access: "accès réservé aux partenaires", "accès limité", "accès restreint"
  p('access', String.raw`\bacc[eè]s\b${C(20)}\b(?:r[ée]serv[ée]e?s?|limit[ée]e?s?|restreint(?:e|s|es)?)${END}`),
  // access: "réservé aux membres du projet"
  p('access', String.raw`\br[ée]serv[ée]e?s?\s+(?:aux?|à)\s+(?:\p{L}+\s+){0,2}?${GROUP_FR}\b`),
  // access: "confidentiel"
  p('access', String.raw`\bconfidentiel`),
  // non-commercial: "non commercial", "pas d'usage commercial", "usage commercial interdit / non autorisé"
  p('non-commercial', String.raw`\bnon[-\s]?commerci|\b(?:pas|aucun)\s+(?:d['’]\s*)?(?:usage|utilisation|exploitation)s?\s+commercial|\b(?:usage|utilisation|exploitation|r[ée]utilisation)s?\s+commercial\p{L}*\s+(?:est\s+|sont\s+)?(?:interdit\p{L}*|prohib\p{L}+|exclu\p{L}*|non\s+autoris\p{L}+|soumis\p{L}*\s+[àa])`),
  // non-commercial: "uniquement pour la recherche", "réservé à la recherche scientifique"
  p('non-commercial', String.raw`\b(?:uniquement|exclusivement|seulement)\b${C(25)}\b(?:recherche|scientifique|[ée]ducati\p{L}*|acad[ée]mique|enseignement)|\br[ée]serv[ée]e?s?\s+(?:à|aux?)\s+(?:la\s+|l['’]\s*)?(?:recherche|usage\s+(?:scientifique|acad[ée]mique)|enseignement|[ée]ducation)`),
  // no derivatives / no redistribution: "pas de modification", "redistribution interdite"
  p('no-derivatives', String.raw`\bpas\s+de\s+modification|\bmodification\s+(?:est\s+)?interdite`),
  p('no-redistribution', String.raw`\bpas\s+de\s+(?:redistribution|rediffusion)|\b(?:redistribution|rediffusion|diffusion)\s+(?:est\s+)?(?:interdite|prohib[ée]e|non\s+autoris[ée]e)`),
  // on request: "données disponibles sur demande"
  p('on-request', String.raw`\b(?:donn[ée]es|acc[eè]s)\b${C(40)}\bsur\s+demande\b`),
];

const PL: readonly Pattern[] = [
  // access: "Dostęp ograniczony do partnerów projektu" (not "nieograniczony")
  p('access', String.raw`\bdost[eę]p\b${C(30)}${START}ograniczon`),
  // access: "dostęp tylko dla partnerów", "wyłącznie dla zarejestrowanych użytkowników"
  p('access', String.raw`\b(?:tylko|wy[łl][ąa]cznie)\s+(?:dla|do|przez)\s+(?:\p{L}+\s+){0,2}?${GROUP_PL}`),
  // access: "poufne"
  p('access', String.raw`\bpoufn`),
  // non-commercial: "niekomercyjne", "wykorzystanie komercyjne zabronione", "zakaz wykorzystania komercyjnego"
  p('non-commercial', String.raw`\bniekomercyjn|\b(?:wykorzystani\p{L}*|u[żz]yci\p{L}*|u[żz]ytk\p{L}*|zastosowani\p{L}*)\s+komercyjn\p{L}*\s+(?:jest\s+)?(?:zabronion\p{L}*|zakazan\p{L}*|niedozwolon\p{L}*|wymaga\p{L}*)|\bzakaz\s+(?:\p{L}+\s+)?komercyjn`),
  // non-commercial: "wyłącznie do celów naukowych", "tylko do celów badawczych"
  p('non-commercial', String.raw`\b(?:tylko|wy[łl][ąa]cznie)\s+(?:do|dla|w)\s+(?:cel(?:[óo]w|ach|e)\s+)?(?:\p{L}+\s+)?(?:nauk\p{L}*|badaw\p{L}*|edukac\p{L}*|dydakt\p{L}*|niekomercyj\p{L}*|prywatn\p{L}*)`),
  // no derivatives / no redistribution: "zakaz modyfikacji", "rozpowszechnianie zabronione"
  p('no-derivatives', String.raw`\bzakaz\s+(?:modyfikacji|przetwarzania)|\bnie\s+(?:wolno|nale[żz]y)\s+modyfikowa[ćc]|\bmodyfikacj\p{L}*\s+(?:jest\s+)?(?:zabronion\p{L}*|niedozwolon\p{L}*)`),
  p('no-redistribution', String.raw`\bzakaz\s+(?:rozpowszechniania|redystrybucji|udost[eę]pniania)|\bnie\s+(?:wolno|nale[żz]y)\s+(?:rozpowszechnia|redystrybuowa|udost[eę]pnia)\p{L}*|\b(?:rozpowszechnianie|redystrybucja|udost[eę]pnianie)\s+(?:dalej\s+)?(?:jest\s+)?(?:zabronion\p{L}*|niedozwolon\p{L}*)`),
  // on request: "dane dostępne na życzenie / na prośbę"
  p('on-request', String.raw`\b(?:dane|dost[eę]p)\b${C(40)}\bna\s+(?:[żz]yczenie|pro[śs]b[ęe]|zapytanie|wniosek)`),
];

const PATTERNS: readonly Pattern[] = [...EN, ...DE, ...FR, ...PL];

/** Commercial and non-commercial use alike: nothing is taken away. */
const BOTH_USES = /\bcommercial\s*(?:and|or|&|\/|,)\s*non|\bnon[-\s]?commercial\s*(?:and|or|&|\/|,)\s*commercial|\bboth\b|\bnot\s+(?:restricted|limited)\s+to\s+non/i;

/**
 * Clauses of one text: sentences, semicolon parts and lines. A full stop inside a DOI, an address or an abbreviation ("Art. 13") does not split:
 * it is followed by no space, or by a space after a known abbreviation.
 */
const clauses = (text: string): string[] =>
  text.split(/(?<!\b(?:art|nr|sec|cf|vs|dr|inc|ltd|approx|fig)\.)(?<=[.!?;])\s+|\n+/i).map((c) => c.trim()).filter((c) => c !== '');

/** The first way the text narrows a licence, or undefined when it does not (attribution, citation, disclaimer, the licence repeated, neutral, negated). */
export function narrowingOf(text: string | undefined): NarrowingKind | undefined {
  if (!text) return undefined;
  for (const raw of clauses(text)) {
    if (WITHOUT_ATTRIBUTION.test(raw)) continue;
    const clause = raw.replace(ATTRIBUTION_CONDITION, ' ');
    for (const { kind, re, own, unless } of PATTERNS) {
      const m = re.exec(clause);
      if (!m) continue;
      if (unless?.test(clause)) continue;
      if (!own && NEGATED_INSIDE.test(m[0])) continue;
      if (NEGATED_BEFORE.test(clause.slice(0, m.index))) continue;
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

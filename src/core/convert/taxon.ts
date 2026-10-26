// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Splitting a taxon header or name into the Darwin Core terms it carries.
 *
 *   "Pseudocalanus sp."          -> scientificName "Pseudocalanus", identificationQualifier "sp."
 *   "Calanus cf. glacialis"      -> scientificName "Calanus glacialis", identificationQualifier "cf."
 *   "Augaptilus glacialis, c2"   -> scientificName "Augaptilus glacialis", lifeStage "C2"
 *   "Oithona similis CIV"        -> scientificName "Oithona similis", lifeStage "C4"
 *   "Metridia longa, f"          -> scientificName "Metridia longa", sex "female"
 *
 * verbatimIdentification is ALWAYS the exact text (ends trimmed): nothing is lost and the user can check the split.
 * Qualifier convention (OBIS Manual, "Low confidence taxonomic identification" in the Darwin Core page: the lowest accurate name goes
 * to scientificName, the doubt to identificationQualifier): the doubt token is removed from the name and written to the qualifier.
 * That "sp." / "spp." themselves belong in identificationQualifier is the converter's convention (the manual's examples show cf., aff. and ?).
 *
 * Every DISTINCT split that changed something is a decision the page asks the user for (an approved map in the input, key = verbatim text);
 * an undecided one blocks (CONV-SPLIT-UNDECIDED). A plain name is not a split and needs no decision.
 */
export interface TaxonSplit {
  /** The exact header or cell text, ends trimmed. */
  verbatimIdentification: string;
  scientificName: string;
  identificationQualifier?: string;
  lifeStage?: string;
  /** Darwin Core `sex` (female / male; NERC S10 later), read only from a ", f" / ", m" suffix. */
  sex?: 'female' | 'male';
}

/** What the split reads, for the page's explanation (the tip is filled from these, never typed). */
export const QUALIFIER_TOKENS = ['cf.', 'aff.', 'sp.', 'spp.', 'indet.', '?'] as const;
export const STAGE_TOKENS = ['c1–c6', 'CI–CVI', 'copepodite', 'nauplius', 'metanauplius', 'calyptopis', 'furcilia', 'zoea', 'megalopa', 'veliger', 'cypris', 'egg', 'juvenile', 'adult', 'larva'] as const;

const COPEPODITE_ROMAN: Record<string, string> = { i: 'C1', ii: 'C2', iii: 'C3', iv: 'C4', v: 'C5', vi: 'C6' };

/**
 * The stage words of zooplankton counts, each with the plural and the abbreviation read as the singular value written to lifeStage (free text in Darwin Core; the words are the
 * plain English names of the stages, the copepodite stages as C1-C6). A word that is not here is left in the name and the user is asked.
 */
const STAGE_WORDS: Record<string, string> = {
  copepodite: 'copepodite',
  copepodites: 'copepodite',
  nauplius: 'nauplius',
  nauplii: 'nauplius',
  metanauplius: 'metanauplius',
  metanauplii: 'metanauplius',
  calyptopis: 'calyptopis',
  calyptopes: 'calyptopis',
  furcilia: 'furcilia',
  furciliae: 'furcilia',
  zoea: 'zoea',
  zoeae: 'zoea',
  megalopa: 'megalopa',
  megalopae: 'megalopa',
  veliger: 'veliger',
  veligers: 'veliger',
  cypris: 'cypris',
  cyprid: 'cypris',
  cyprids: 'cypris',
  egg: 'egg',
  eggs: 'egg',
  juv: 'juvenile',
  'juv.': 'juvenile',
  juvenile: 'juvenile',
  juveniles: 'juvenile',
  larva: 'larva',
  larvae: 'larva',
  larv: 'larva',
  'larv.': 'larva',
  adult: 'adult',
  adults: 'adult',
};

/** A stage token (the whole token, any case), or undefined: c1-c6, CI-CVI, a range of copepodite stages (c1-c5), or one of the stage words above. */
function stageToken(tok: string): string | undefined {
  const t = tok.toLowerCase().replace(/^\((.*)\)$/, '$1');
  let m = /^c([1-6])$/.exec(t);
  if (m) return `C${m[1]}`;
  m = /^c(i{1,3}|iv|v|vi)$/.exec(t);
  if (m) return COPEPODITE_ROMAN[m[1]];
  // a range of copepodite stages ("c1-c5", "C1–C5", "CI-CV"): written as the range
  m = /^c([1-6])\s*[-–]\s*c?([1-6])$/.exec(t);
  if (m && Number(m[1]) < Number(m[2])) return `C${m[1]}-C${m[2]}`;
  m = /^c(i{1,3}|iv|v|vi)\s*[-–]\s*c?(i{1,3}|iv|v|vi)$/.exec(t);
  if (m && COPEPODITE_ROMAN[m[1]] !== undefined && COPEPODITE_ROMAN[m[2]] !== undefined && Number(COPEPODITE_ROMAN[m[1]].slice(1)) < Number(COPEPODITE_ROMAN[m[2]].slice(1))) return `${COPEPODITE_ROMAN[m[1]]}-${COPEPODITE_ROMAN[m[2]]}`;
  return Object.prototype.hasOwnProperty.call(STAGE_WORDS, t) ? STAGE_WORDS[t] : undefined;
}

/** Does the text read as a stage (a stage word, c1-c6, CI-CVI or a range of them)? */
export const isStageText = (text: string): boolean => stageToken(text.trim()) !== undefined;

/**
 * A sex marker: f, m, fem, female, male, with or without a final dot, and the symbols. It reads as the sex after a comma, or straight after a stage or a
 * "?"; after a plain epithet it is left in the name, which the plausibility check then puts to the user ("Metridia longa f."). A "f." inside a name,
 * before an epithet, is a forma ("Aglantha digitale f. rosea") and is never read here.
 */
function sexToken(tok: string): 'female' | 'male' | undefined {
  const t = tok.toLowerCase().replace(/\.$/, '');
  if (t === 'f' || t === 'fem' || t === 'female' || t === '♀') return 'female';
  if (t === 'm' || t === 'male' || t === '♂') return 'male';
  return undefined;
}

const QUALIFIER_WORDS = new Set(['cf.', 'cf', 'aff.', 'aff']);
const canonicalQualifier = (w: string): string => (w.startsWith('cf') ? 'cf.' : 'aff.');

const HAS_DETAIL = (s: string): boolean => s.length > 0;

export function splitTaxon(text: string): TaxonSplit {
  const verbatim = text.trim();
  // a range written with spaces ("c1 - c5") is the same range as "c1-c5"
  let rest = verbatim.replace(/\b(c(?:[1-6]|i{1,3}|iv|v|vi))\s+[-–]\s+(c?(?:[1-6]|i{1,3}|iv|v|vi))\b/gi, '$1-$2');
  let lifeStage: string | undefined;
  let sex: 'female' | 'male' | undefined;
  const qualifiers: string[] = [];

  // 1. comma suffixes: ", c2", ", cypris, nauplii" (several stages are written together, in the order of the text) or ", f" (the only place f / m are read)
  const stages: string[] = [];
  for (;;) {
    const comma = /^(.*\S)\s*,\s*(\S+)$/.exec(rest);
    if (!comma) break;
    const stage = stageToken(comma[2]);
    const sx = stage === undefined && stages.length === 0 && sex === undefined ? sexToken(comma[2]) : undefined;
    if (stage === undefined && sx === undefined) break;
    if (stage !== undefined) stages.unshift(stage);
    else sex = sx;
    rest = comma[1];
    if (sx !== undefined) break;
  }
  if (stages.length > 0) lifeStage = stages.join(', ');

  const words = rest.split(/\s+/).filter(HAS_DETAIL);
  // 1b. a bare f / m reads as the sex only straight after a stage or a "?" ("Calanus finmarchicus C5 f", "Acartia ? f"); after a plain epithet it is
  // part of the name ("Metridia longa f"), which the plausibility check below then puts to the user
  if (sex === undefined && words.length > 1) {
    const sx = sexToken(words[words.length - 1]);
    const before = words[words.length - 2];
    const afterStageOrQuestion = (stageToken(before) !== undefined && words.length > 2) || (before === '?' && words.length > 2) || (before.length > 1 && before.endsWith('?'));
    if (sx !== undefined && afterStageOrQuestion) {
      sex = sx;
      words.pop();
    }
  }
  // 2. a trailing stage without a comma ("Oithona similis CIV"); the name keeps at least one word
  if (lifeStage === undefined && words.length > 1) {
    const stage = stageToken(words[words.length - 1]);
    if (stage !== undefined) {
      lifeStage = stage;
      words.pop();
    }
  }
  // 3. a trailing "sp." / "spp." (a comma in front of it is dropped with it)
  if (words.length > 1) {
    const last = words[words.length - 1].toLowerCase().replace(/,$/, '');
    if (last === 'sp.' || last === 'sp' || last === 'spp.' || last === 'spp') {
      qualifiers.push(last.startsWith('spp') ? 'spp.' : 'sp.');
      words.pop();
    } else if (last === 'indet.' || last === 'indet' || last === 'indeterminata' || last === 'indeterminate') {
      // "indeterminata" says the identification stops at the name before it: an identification qualifier, like sp.
      qualifiers.push('indet.');
      words.pop();
    }
  }
  // 4. cf. / aff. and "?" wherever they stand
  const kept: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (QUALIFIER_WORDS.has(lower)) qualifiers.push(canonicalQualifier(lower));
    else if (w === '?') qualifiers.push('?');
    else if (w.length > 1 && w.endsWith('?')) {
      qualifiers.push('?');
      kept.push(w.slice(0, -1));
    } else kept.push(w);
  }
  let name = kept.join(' ').replace(/,\s*$/, '').trim();
  // a header that is only a qualifier or a stage is not split
  if (name === '') {
    return { verbatimIdentification: verbatim, scientificName: verbatim.replace(/\s+/g, ' ') };
  }
  if (name.endsWith(',')) name = name.slice(0, -1).trim();
  const split: TaxonSplit = { verbatimIdentification: verbatim, scientificName: name };
  if (qualifiers.length > 0) split.identificationQualifier = qualifiers.join(' ');
  if (lifeStage !== undefined) split.lifeStage = lifeStage;
  if (sex !== undefined) split.sex = sex;
  return split;
}

/**
 * Is what is left of the name plausibly a Latin name? A reason code when it is not (the user is asked, whatever the split did):
 * digits, a slash, a "?", a stage range such as CVI-CV, a one-letter word, a sex marker at the end, or more than three words.
 */
export type NameDoubt = 'digits' | 'slash' | 'question' | 'stage-range' | 'single-letter' | 'sex-marker' | 'long' | 'remark';
export function nameDoubt(name: string): NameDoubt | undefined {
  if (/\d/.test(name)) return 'digits';
  // a comma that is left in the name: a remark after it that is no stage, no qualifier and no sex ("Foraminifera, planktic"); the user decides what is the name and what the remark
  if (name.includes(',')) return 'remark';
  if (name.includes('/')) return 'slash';
  if (name.includes('?')) return 'question';
  const words = name.split(/\s+/).filter((w) => w !== '');
  if (words.some((w) => /^c?[ivx]+-c?[ivx]+$/i.test(w))) return 'stage-range';
  if (words.some((w) => /^[A-Za-z]$/.test(w))) return 'single-letter';
  // a sex marker left at the END of the name (a "f." before an epithet is a forma and stays)
  if (words.length > 1 && sexToken(words[words.length - 1]) !== undefined) return 'sex-marker';
  // a rank marker (f., var., subsp.) is not a word of the name: "Aglantha digitale f. rosea" is three
  if (words.filter((w) => !/^(f|var|subsp|ssp|forma)\.$/i.test(w)).length > 3) return 'long';
  return undefined;
}

/** Did the split take something out of the name (a qualifier or a stage)? Only those need the user's approval. */
export const splitChanged = (s: TaxonSplit): boolean => s.identificationQualifier !== undefined || s.lifeStage !== undefined || s.sex !== undefined;

/** One distinct name of an upload and how it splits; `approved` is the user's decision when there is one. */
export interface SplitEntry {
  /** The exact text: the key of the approved map. */
  verbatim: string;
  /** The converter's proposal. */
  proposed: TaxonSplit;
  /** What will be used: the approved split, else the proposal. */
  split: TaxonSplit;
  /** The proposal took a qualifier, a stage or a sex out of the name, or what is left is not plausibly a Latin name: the user must approve it. */
  needsDecision: boolean;
  /** Why the leftover name is doubtful (set with needsDecision when that is the reason). */
  doubt?: NameDoubt;
  /** An approved split exists for this text. */
  approved: boolean;
  /** How many columns (wide) or rows (long) carry this text. */
  uses: number;
}

/** The approved map of the input: verbatim text -> the split the user accepted (possibly edited). Absent = undecided. */
export type ApprovedSplits = Readonly<Record<string, TaxonSplit>>;

/** The approved split of a text, normalised so its verbatimIdentification is always the key. */
export function approvedSplit(approved: ApprovedSplits | undefined, verbatim: string): TaxonSplit | undefined {
  const a = approved && Object.prototype.hasOwnProperty.call(approved, verbatim) ? approved[verbatim] : undefined;
  return a === undefined ? undefined : { ...a, verbatimIdentification: verbatim };
}

/** Distinct names, in first-seen order, as split entries. `names` may repeat. */
export function distinctSplits(names: readonly string[], approved?: ApprovedSplits): SplitEntry[] {
  const counts = new Map<string, number>();
  for (const n of names) {
    const v = n.trim();
    if (v === '') continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].map(([verbatim, uses]) => {
    const proposed = splitTaxon(verbatim);
    const decided = approvedSplit(approved, verbatim);
    const doubt = nameDoubt(proposed.scientificName);
    const needsDecision = splitChanged(proposed) || doubt !== undefined;
    return { verbatim, proposed, split: decided ?? proposed, needsDecision, ...(doubt === undefined ? {} : { doubt }), approved: decided !== undefined, uses };
  });
}

/**
 * What "approve all shown" may approve: the splits that need a decision, are not approved yet and carry NO doubt (a qualifier, a stage or a sex taken
 * out of a plain name). A split with a doubt (a single letter, a digit, a slash, a stage range, ...) is returned in `skipped`: it needs its own action
 * (edit it and approve it, or approve it as it is), because a doubtful leftover such as "Acartia longiremis f" must never reach occurrence.txt unseen.
 */
export function bulkApprovable(entries: readonly SplitEntry[]): { approve: SplitEntry[]; skipped: SplitEntry[] } {
  const open = entries.filter((s) => s.needsDecision && !s.approved);
  return { approve: open.filter((s) => s.doubt === undefined), skipped: open.filter((s) => s.doubt !== undefined) };
}

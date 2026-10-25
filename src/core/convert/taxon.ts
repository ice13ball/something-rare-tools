// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
/*
 * Splitting a taxon header or name into the Darwin Core terms it carries.
 *
 *   "Pseudocalanus sp."          -> scientificName "Pseudocalanus", identificationQualifier "sp."
 *   "Calanus cf. glacialis"      -> scientificName "Calanus glacialis", identificationQualifier "cf."
 *   "Augaptilus glacialis, c2"   -> scientificName "Augaptilus glacialis", lifeStage "C2"
 *   "Oithona similis CIV"        -> scientificName "Oithona similis", lifeStage "C4"
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
}

const COPEPODITE_ROMAN: Record<string, string> = { i: 'C1', ii: 'C2', iii: 'C3', iv: 'C4', v: 'C5', vi: 'C6' };

/** A stage token (the whole token, any case), or undefined. Fixed list: c1-c6, CI-CVI, nauplius, juv, larva, adult. */
function stageToken(tok: string): string | undefined {
  const t = tok.toLowerCase().replace(/^\((.*)\)$/, '$1');
  let m = /^c([1-6])$/.exec(t);
  if (m) return `C${m[1]}`;
  m = /^c(i{1,3}|iv|v|vi)$/.exec(t);
  if (m) return COPEPODITE_ROMAN[m[1]];
  if (t === 'nauplius' || t === 'nauplii') return 'nauplius';
  if (t === 'juv' || t === 'juv.' || t === 'juvenile' || t === 'juveniles') return 'juvenile';
  if (t === 'larva' || t === 'larvae') return 'larva';
  if (t === 'adult' || t === 'adults') return 'adult';
  return undefined;
}

/** Sex after a comma only ("Metridia longa, f"): a bare f or m inside a name is never read as one. */
function sexToken(tok: string): string | undefined {
  const t = tok.toLowerCase();
  return t === 'f' ? 'female' : t === 'm' ? 'male' : undefined;
}

const QUALIFIER_WORDS = new Set(['cf.', 'cf', 'aff.', 'aff']);
const canonicalQualifier = (w: string): string => (w.startsWith('cf') ? 'cf.' : 'aff.');

const HAS_DETAIL = (s: string): boolean => s.length > 0;

export function splitTaxon(text: string): TaxonSplit {
  const verbatim = text.trim();
  let rest = verbatim;
  let lifeStage: string | undefined;
  const qualifiers: string[] = [];

  // 1. a comma suffix: ", c2" or ", f" (the only place f / m are read)
  const comma = /^(.*\S)\s*,\s*(\S+)$/.exec(rest);
  if (comma) {
    const stage = stageToken(comma[2]) ?? sexToken(comma[2]);
    if (stage !== undefined) {
      lifeStage = stage;
      rest = comma[1];
    }
  }

  const words = rest.split(/\s+/).filter(HAS_DETAIL);
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
  return split;
}

/** Did the split take something out of the name (a qualifier or a stage)? Only those need the user's approval. */
export const splitChanged = (s: TaxonSplit): boolean => s.identificationQualifier !== undefined || s.lifeStage !== undefined;

/** One distinct name of an upload and how it splits; `approved` is the user's decision when there is one. */
export interface SplitEntry {
  /** The exact text: the key of the approved map. */
  verbatim: string;
  /** The converter's proposal. */
  proposed: TaxonSplit;
  /** What will be used: the approved split, else the proposal. */
  split: TaxonSplit;
  /** The proposal took a qualifier or a stage out of the name: the user must approve it. */
  needsDecision: boolean;
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
    const needsDecision = splitChanged(proposed);
    return { verbatim, proposed, split: decided ?? proposed, needsDecision, approved: decided !== undefined, uses };
  });
}

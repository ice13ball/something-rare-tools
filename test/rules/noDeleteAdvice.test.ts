// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// The data are scientific: no text of the tool advises deleting, removing or dropping data. Michal, 2026-11-03: "z założenia to są dane naukowe, więc nawet jak aplikacja czegoś nie rozpozna,
// to nie może tego usunąć". The English plain texts, the technical lines and the /convert page texts are searched for the words; what is allowed is a NAMED list of phrases, each of which must
// still be in the text it is named for (a phrase that is no longer there fails the test, so the list cannot grow stale or swallow anything else).
import { describe, expect, it } from 'vitest';
import { UI } from '../../src/core/i18n/ui';
import { RULES } from '../../src/core/rules';
import { CONVERT_RULES } from '../../src/core/rules/convert';

const WORDS = /\b(delet\w*|remov\w*|drop\w*|discard\w*|eras\w*|get rid\w*|throw\w*|wip\w*|purg\w*)\b/gi;

/** A phrase that is allowed in the text of one rule (or of the rules whose id starts with `idPrefix`, or of the page key `key`), and why it is not advice to delete data. */
interface Allowed {
  id?: string;
  idPrefix?: string;
  key?: string;
  phrase: string;
  why: string;
}

const ALLOWED: Allowed[] = [
  // the drop zone of the page: the user drops a FILE here
  ...['drop your own file here', 'drop them here', 'drop it here', 'drop the file here', 'drop the core file (for example occurrence.txt) here', 'a dropped archive'].map((phrase): Allowed => ({ idPrefix: 'IN-', phrase, why: 'the drop zone of the page' })),
  { key: 'check.link.unknown', phrase: 'drop it here', why: 'the drop zone of the page' },
  { key: 'convert.companion.help', phrase: 'drop it together with the data', why: 'the drop zone of the page' },
  { key: 'convert.noSheets', phrase: 'dropped files', why: 'files put on the drop zone' },
  { id: 'CONV-LICENCE-DIFFERS', phrase: 'dropped metadata files', why: 'files put on the drop zone' },
  // metadata, not data rows
  { id: 'META-EMPTY-LINK', phrase: 'remove the link', why: 'a download link in the description of the dataset, not a data row' },
  // describing what another tool does, or what this one refuses to do
  { id: 'ROW-ZERO-COORD', phrase: 'drops the record', why: 'what obis-qc does with the record' },
  { id: 'ROW-NO-COORD', phrase: 'drops the record', why: 'what obis-qc does with the record' },
  { id: 'XF-STATION-ALIAS', phrase: 'spaces removed', why: 'how a station id is normalised for a comparison' },
  { id: 'CONV-TIME-HOLDS-DATES', phrase: 'never dropped silently', why: 'says the opposite: the tool refuses to drop a date' },
  { id: 'CONV-PRESENCE-VALUE', phrase: 'the tick is removed', why: 'a tick on the page, not data' },
  { id: 'CONV-WORMS-UNDECIDED', phrase: 'a deleted record', why: 'WoRMS says the taxon record is deleted' },
  // the promises of this task
  { id: 'CONV-ROW-NOT-UNDERSTOOD', phrase: 'nothing is deleted', why: 'a promise, not advice' },
  { id: 'CONV-ROW-NOT-UNDERSTOOD', phrase: 'nothing is deleted from the file the user gave', why: 'a promise, not advice' },
  { id: 'CONV-ROW-LEFT-OUT', phrase: 'Nothing was deleted', why: 'a promise, not advice' },
  { key: 'convert.notWritten.help', phrase: 'Nothing is deleted', why: 'a promise, not advice' },
  { id: 'ROW-KEY-IGNORED', phrase: 'Nothing is removed from the file', why: 'a reassurance in /check text (production), not advice: the sentence says the file keeps everything' },
  // the page's own words about levels, a choice taken back, a vocabulary entry
  { key: 'convert.nerc.dropped', phrase: 'was dropped', why: 'a chosen identifier is given up when the column changes; no data row' },
  { key: 'convert.worms.status.deleted', phrase: 'deleted', why: 'WoRMS says the taxon record is deleted' },
  { key: 'convert.codes.pick', phrase: 'remove the repeats', why: 'a column that makes the sample codes unique; no row is touched' },
  { key: 'convert.flatten.station', phrase: 'Drop the station level', why: 'a level of the archive tree, not rows; the codes are moved, not lost' },
  { key: 'convert.flatten.cruise', phrase: 'Drop the cruise level', why: 'a level of the archive tree, not rows; the code is moved, not lost' },
];

/** The words that remain in `text` once the phrases allowed for it are taken away. */
export function advice(text: string, allowed: readonly string[]): string[] {
  let rest = text;
  for (const a of allowed) rest = rest.split(a).join(' ');
  return [...rest.matchAll(WORDS)].map((m) => m[0]);
}

const allowedFor = (id: string | undefined, key: string | undefined): Allowed[] => ALLOWED.filter((a) => (a.id !== undefined && a.id === id) || (a.idPrefix !== undefined && id !== undefined && id.startsWith(a.idPrefix)) || (a.key !== undefined && a.key === key));

describe('no text advises deleting data', () => {
  const rules = [...RULES, ...CONVERT_RULES.filter((c) => !RULES.some((r) => r.id === c.id))] as { id: string; plain: Record<string, string>; technical: string; plainIf?: { plain: Record<string, string> }[] }[];
  const texts: { where: string; id?: string; key?: string; text: string }[] = [
    ...rules.flatMap((r) => [
      { where: `${r.id} plain`, id: r.id, text: r.plain.en },
      { where: `${r.id} technical`, id: r.id, text: r.technical },
      ...(r.plainIf ?? []).map((x) => ({ where: `${r.id} plainIf`, id: r.id, text: x.plain.en })),
    ]),
    ...Object.entries(UI.en)
      .filter(([k]) => k.startsWith('convert.') || k.startsWith('check.'))
      .map(([k, v]) => ({ where: `page text ${k}`, key: k, text: String(v) })),
  ];

  it('the English rule texts, their technical lines and the converter\'s page texts hold no instruction to delete, remove or drop', () => {
    const found = texts.map((t) => ({ where: t.where, words: advice(t.text, allowedFor(t.id, t.key).map((a) => a.phrase)) })).filter((x) => x.words.length > 0);
    expect(found).toEqual([]);
  });

  it('every phrase on the allowed list is still in the text it is named for (the list cannot go stale)', () => {
    for (const a of ALLOWED) {
      const hits = texts.filter((t) => ((a.id !== undefined && t.id === a.id) || (a.idPrefix !== undefined && (t.id ?? '').startsWith(a.idPrefix)) || (a.key !== undefined && t.key === a.key)) && t.text.includes(a.phrase));
      expect(hits.length, `${a.id ?? a.idPrefix ?? a.key}: "${a.phrase}"`).toBeGreaterThan(0);
      expect(a.why.length).toBeGreaterThan(10);
    }
  });

  it('the list is short, each phrase is specific, and the words themselves are not on it', () => {
    expect(ALLOWED.length).toBeLessThanOrEqual(30);
    for (const a of ALLOWED) {
      expect(a.phrase.length).toBeGreaterThanOrEqual(7);
      // a single bare word is allowed only as the whole text of a page label
      if (!a.phrase.includes(' ')) expect(a.key, a.phrase).toBeDefined();
    }
  });

  it('the check catches an instruction to delete, even beside an allowed phrase (mutation)', () => {
    expect(advice('Type the taxon name or delete the row.', [])).toEqual(['delete']);
    expect(advice('Nothing is deleted. If it is not a sample, delete it.', ['Nothing is deleted'])).toEqual(['delete']);
    expect(advice('Remove the copies; drop them; discard the row.', ['drop them here'])).toEqual(['Remove', 'drop', 'discard']);
    expect(advice('Leave the rows out and list them.', [])).toEqual([]);
  });

  it('the rules this task rewrote say what to do instead (leave out and list, or correct the file)', () => {
    const say = (id: string): string => rules.find((r) => r.id === id)!.plain.en;
    expect(say('CONV-ROW-COPIES')).toMatch(/Leave the copies out and list them/);
    expect(say('CONV-LONG-DUPLICATE')).toMatch(/leave the repeated rows out and list them/);
    expect(say('CONV-LONG-NO-PARAMETER')).toMatch(/leave .* out and list/);
    expect(say('CONV-SHEET-UNITS-ROW')).toMatch(/write them into the column names/);
    expect(say('CONV-TAXON-EMPTY-ROW')).toMatch(/listed in the file beside the archive/);
    expect(say('CONV-QUANTITY-BLANK-KEPT')).toMatch(/correct those cells/);
    expect(say('CONV-SUMMARY-ROW-KEPT')).toMatch(/correct the sheet/);
  });

  it('the other languages of the converter\'s rules do not tell the user to delete either', () => {
    const NOT_EN: Record<string, RegExp> = {
      pl: /\b(usuń|usuńcie|usunąć|skasuj|wykreśl|wyrzuć|odrzuć)\w*/i,
      de: /\b(lösch\w*|entfern\w*|verwerfen|verwirf\w*|streich\w*)/i,
      fr: /\b(supprimez|supprimer|retirez|retirer|effacez|effacer)\b/i,
    };
    // German "entfernt" is a distance, and "entfernen Sie das Häkchen / bei der Spalte ..." takes a tick off the page: named, not swallowed
    const ok = (lang: string, text: string): string => (lang === 'de' ? text.replace(/entfernen Sie das Häkchen/g, ' ').replace(/entfernen Sie bei der Spalte/g, ' ').replace(/ entfernt/g, ' ') : text);
    const bad: string[] = [];
    for (const r of CONVERT_RULES) for (const lang of ['pl', 'de', 'fr'] as const) for (const t of [r.plain[lang], ...(r.plainIf ?? []).map((x) => x.plain[lang])]) if (NOT_EN[lang].test(ok(lang, t))) bad.push(`${r.id} ${lang}`);
    expect(bad).toEqual([]);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Why a layout cannot be read: language-neutral codes, each with a plain text in all four languages (an English reason
// must never end up inside a Polish, German or French sentence). Pure.
import type { Lang } from '../types';

export type LayoutReasonCode = 'transposed' | 'transposed-taxa' | 'header-empty' | 'header-units' | 'no-table' | 'no-rows' | 'no-data-sheet';
export interface LayoutReason { code: LayoutReasonCode; sheet?: string }

const TEXT: Record<LayoutReasonCode, Record<Lang, string>> = {
  transposed: {
    en: 'data is transposed (variables in rows, samples in columns)',
    pl: 'dane są obrócone (zmienne w wierszach, próbki w kolumnach)',
    de: 'die Daten sind transponiert (Variablen in Zeilen, Proben in Spalten)',
    fr: 'les données sont transposées (variables en lignes, échantillons en colonnes)',
  },
  // raised by the converter only (convert/transposed.ts): /check never produces it
  'transposed-taxa': {
    en: 'data is transposed (species in rows, samples in columns)',
    pl: 'dane są obrócone (gatunki w wierszach, próbki w kolumnach)',
    de: 'die Daten sind transponiert (Arten in Zeilen, Proben in Spalten)',
    fr: 'les données sont transposées (espèces en lignes, échantillons en colonnes)',
  },
  'header-empty': {
    en: 'header spans several rows (more than half of the header cells are empty)',
    pl: 'nagłówek obejmuje kilka wierszy (ponad połowa komórek nagłówka jest pusta)',
    de: 'die Kopfzeile erstreckt sich über mehrere Zeilen (mehr als die Hälfte der Kopfzellen ist leer)',
    fr: "l'en-tête s'étend sur plusieurs lignes (plus de la moitié des cellules d'en-tête sont vides)",
  },
  'header-units': {
    en: 'header spans several rows (the first data row holds units)',
    pl: 'nagłówek obejmuje kilka wierszy (pierwszy wiersz danych zawiera jednostki)',
    de: 'die Kopfzeile erstreckt sich über mehrere Zeilen (die erste Datenzeile enthält Einheiten)',
    fr: "l'en-tête s'étend sur plusieurs lignes (la première ligne de données contient des unités)",
  },
  'no-table': {
    en: 'the file contains no table',
    pl: 'plik nie zawiera tabeli',
    de: 'die Datei enthält keine Tabelle',
    fr: 'le fichier ne contient aucun tableau',
  },
  'no-rows': {
    en: 'the table has no data rows',
    pl: 'tabela nie ma wierszy z danymi',
    de: 'die Tabelle hat keine Datenzeilen',
    fr: "le tableau n'a aucune ligne de données",
  },
  'no-data-sheet': {
    en: 'no sheet with coordinates or measurements was found',
    pl: 'nie znaleziono arkusza ze współrzędnymi ani pomiarami',
    de: 'es wurde kein Blatt mit Koordinaten oder Messwerten gefunden',
    fr: "aucune feuille avec des coordonnées ou des mesures n'a été trouvée",
  },
};

const SHEET_PREFIX: Record<Lang, (name: string) => string> = {
  en: (n) => `sheet "${n}": `,
  pl: (n) => `arkusz „${n}”: `,
  de: (n) => `Blatt „${n}“: `,
  fr: (n) => `feuille « ${n} » : `,
};

/** The reasons as one plain phrase in `lang`; a sheet name (several sheets) is named in front of its reason. */
export function reasonsText(reasons: readonly LayoutReason[], lang: Lang): string {
  return reasons.map((r) => (r.sheet !== undefined ? SHEET_PREFIX[lang](r.sheet) : '') + TEXT[r.code][lang]).join('; ');
}

/** For a Finding param (params are strings): the reasons as JSON. */
export const encodeReasons = (reasons: readonly LayoutReason[]): string => JSON.stringify(reasons);

export function decodeReasons(s: unknown): LayoutReason[] | undefined {
  if (typeof s !== 'string') return undefined;
  try {
    const v: unknown = JSON.parse(s);
    if (!Array.isArray(v)) return undefined;
    const ok = v.filter((r): r is LayoutReason => typeof r === 'object' && r !== null && typeof (r as LayoutReason).code === 'string' && (r as LayoutReason).code in TEXT);
    return ok.length === v.length && ok.length > 0 ? ok : undefined;
  } catch {
    return undefined;
  }
}

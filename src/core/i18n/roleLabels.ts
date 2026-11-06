// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { Lang } from '../types';

/*
 * The labels of the six roles the column table shows (ui.ts `role.<kind>`) and the list of proposed roles on /convert names (CONV-ROLE-UNCONFIRMED). One place, so that the table and the finding
 * cannot drift apart; the converter's rules read it instead of the whole dictionary of the page.
 */
export type ListedRoleKind = 'taxon' | 'quantity' | 'date' | 'datetime' | 'latitude' | 'longitude';

export const ROLE_LABELS: Record<Lang, Record<ListedRoleKind, string>> = {
  en: { taxon: 'Taxon (a column of names)', quantity: 'Quantity', date: 'Date', datetime: 'Date and time', latitude: 'Latitude', longitude: 'Longitude' },
  pl: { taxon: 'Takson (kolumna z nazwami)', quantity: 'Ilość', date: 'Data', datetime: 'Data i godzina', latitude: 'Szerokość geograficzna', longitude: 'Długość geograficzna' },
  de: { taxon: 'Taxon (eine Spalte mit Namen)', quantity: 'Menge', date: 'Datum', datetime: 'Datum und Uhrzeit', latitude: 'Breitengrad', longitude: 'Längengrad' },
  fr: { taxon: 'Taxon (une colonne de noms)', quantity: 'Quantité', date: 'Date', datetime: 'Date et heure', latitude: 'Latitude', longitude: 'Longitude' },
};

/** The label without a bracketed explanation ("Taxon (a column of names)" is "Taxon"), for a sentence that sits inside brackets itself. */
export const roleWord = (lang: Lang, kind: string): string => {
  const label = (ROLE_LABELS[lang] as Record<string, string>)[kind];
  return label === undefined ? kind : label.replace(/\s*\([^)]*\)\s*$/, '');
};

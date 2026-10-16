// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Input rules (category 'input'): problems getting or reading a file or record.
 * Generic fields always available to templates: file, sheet, lines, field, value.
 * Declared params per rule (the checks MUST pass exactly these):
 *   IN-NO-DATA-FILE         files    names of the files found in the record, comma-separated
 *   IN-RECORD-INACCESSIBLE  status, host     HTTP status (number) and host of the record
 *   IN-HOST-NOT-ALLOWED     host
 *   IN-FETCH-BLOCKED        host
 *   IN-LAYOUT-UNSUPPORTED   reason   plain description from LayoutPlan.unsupported
 *   IN-ENCODING-FALLBACK    encoding 'windows-1250' | 'iso-8859-2'
 *   IN-DECIMAL-COMMA        (none)
 *   IN-DATE1904             (none)
 */
export const INPUT_RULES: readonly RuleSpec[] = [
  {
    id: 'IN-NO-DATA-FILE',
    category: 'input',
    severity: 'error',
    params: ['files'],
    plain: {
      pl: `Ten rekord nie zawiera pliku z danymi, tylko inne pliki (np. PDF). Dodaj tabelę jako CSV lub Excel albo przeciągnij tutaj własny plik.`,
      en: `This record contains no data file, only other files (such as PDFs). Add the table as CSV or Excel, or drop your own file here.`,
      de: `Dieser Eintrag enthält keine Datendatei, nur andere Dateien (z. B. PDFs). Fügen Sie die Tabelle als CSV oder Excel hinzu oder ziehen Sie Ihre eigene Datei hierher.`,
      fr: `Cette notice ne contient aucun fichier de données, seulement d'autres fichiers (par ex. des PDF). Ajoutez le tableau en CSV ou Excel, ou déposez votre propre fichier ici.`,
    },
    technical: `{file}: no data file (csv, tsv, txt, tab, xlsx, xls) among the record files: {files}.`,
  },
  {
    id: 'IN-RECORD-INACCESSIBLE',
    category: 'input',
    severity: 'error',
    params: ['status', 'host'],
    plain: {
      pl: `Nie udało się otworzyć rekordu na {host} (błąd {status}); może być prywatny lub niepublikowany. Pobierz jego pliki lub metadane i przeciągnij je tutaj.`,
      en: `The record on {host} could not be opened (error {status}); it may be private or unpublished. Download its files or metadata and drop them here.`,
      de: `Der Eintrag auf {host} konnte nicht geöffnet werden (Fehler {status}); er ist möglicherweise privat oder unveröffentlicht. Laden Sie die Dateien oder Metadaten herunter und ziehen Sie sie hierher.`,
      fr: `La notice sur {host} n'a pas pu être ouverte (erreur {status}) ; elle est peut-être privée ou non publiée. Téléchargez ses fichiers ou ses métadonnées et déposez-les ici.`,
    },
    technical: `{file}: HTTP {status} from {host}; record metadata not readable, continuing with what the other sources provided.`,
  },
  {
    id: 'IN-HOST-NOT-ALLOWED',
    category: 'input',
    severity: 'warning',
    params: ['host'],
    plain: {
      pl: `Link prowadzi do {host}, a to narzędzie nie może otwierać tej strony. Pobierz plik samodzielnie i przeciągnij go tutaj.`,
      en: `A link points to {host}, which this tool is not allowed to open. Download the file yourself and drop it here.`,
      de: `Ein Link führt zu {host}, den dieses Werkzeug nicht öffnen darf. Laden Sie die Datei selbst herunter und ziehen Sie sie hierher.`,
      fr: `Un lien mène vers {host}, que cet outil n'est pas autorisé à ouvrir. Téléchargez le fichier vous-même et déposez-le ici.`,
    },
    technical: `{file}: host {host} is not on the allowlist (DATA_HOSTS); not fetched.`,
  },
  {
    id: 'IN-FETCH-BLOCKED',
    category: 'input',
    severity: 'warning',
    params: ['host'],
    plain: {
      pl: `Przeglądarka nie mogła pobrać pliku z {host}. Pobierz plik samodzielnie i przeciągnij go tutaj.`,
      en: `Your browser could not download from {host}. Download the file yourself and drop it here.`,
      de: `Ihr Browser konnte nicht von {host} herunterladen. Laden Sie die Datei selbst herunter und ziehen Sie sie hierher.`,
      fr: `Votre navigateur n'a pas pu télécharger depuis {host}. Téléchargez le fichier vous-même et déposez-le ici.`,
    },
    technical: `{file}: fetch from {host} blocked in browser mode (CORS, CSP or network error).`,
  },
  {
    id: 'IN-LAYOUT-UNSUPPORTED',
    category: 'input',
    severity: 'error',
    params: ['reason'],
    plain: {
      pl: `Narzędzie nie potrafi odczytać układu tej tabeli ({reason}). Zmień ją tak, by miała jeden wiersz nagłówka i jeden wiersz na próbkę, i spróbuj ponownie.`,
      en: `The tool cannot read the layout of this table ({reason}). Reshape it into one header row with one row per sample and try again.`,
      de: `Das Werkzeug kann den Aufbau dieser Tabelle nicht lesen ({reason}). Formen Sie sie in eine Kopfzeile mit einer Zeile pro Probe um und versuchen Sie es erneut.`,
      fr: `L'outil ne peut pas lire la structure de ce tableau ({reason}). Remettez-le en forme avec une ligne d'en-tête et une ligne par échantillon, puis réessayez.`,
    },
    technical: `{file} sheet {sheet}: layout not supported: {reason}.`,
  },
  {
    id: 'IN-ENCODING-FALLBACK',
    category: 'input',
    severity: 'info',
    params: ['encoding'],
    plain: {
      pl: `Plik nie jest zapisany w UTF-8, więc odczytano go jako {encoding}. Sprawdź, czy polskie i inne znaki specjalne wyglądają poprawnie.`,
      en: `The file is not saved as UTF-8, so it was read as {encoding}. Check that accented letters look right.`,
      de: `Die Datei ist nicht als UTF-8 gespeichert und wurde daher als {encoding} gelesen. Prüfen Sie, ob Umlaute und Sonderzeichen richtig aussehen.`,
      fr: `Le fichier n'est pas enregistré en UTF-8 ; il a été lu en {encoding}. Vérifiez que les lettres accentuées s'affichent correctement.`,
    },
    technical: `{file}: bytes are not valid UTF-8; decoded as {encoding}.`,
  },
  {
    id: 'IN-DECIMAL-COMMA',
    category: 'input',
    severity: 'info',
    params: [],
    plain: {
      pl: `W tym pliku liczby mają przecinek dziesiętny (3,14). Odczytano je poprawnie; przy publikacji użyj kropki dziesiętnej.`,
      en: `This file writes numbers with a decimal comma (3,14). They were read correctly; use a decimal point when you publish.`,
      de: `Diese Datei schreibt Zahlen mit Dezimalkomma (3,14). Sie wurden richtig gelesen; verwenden Sie bei der Veröffentlichung einen Dezimalpunkt.`,
      fr: `Ce fichier écrit les nombres avec une virgule décimale (3,14). Ils ont été lus correctement ; utilisez un point décimal lors de la publication.`,
    },
    technical: `{file}: decimal comma detected (semicolon or tab delimiter, most numeric cells look like 3,14); values parsed with ',' as the decimal separator.`,
  },
  {
    id: 'IN-DATE1904',
    category: 'input',
    severity: 'info',
    params: [],
    citations: [CITE.excelDateSystems],
    plain: {
      pl: `Ten plik Excela używa starszego systemu dat 1904 (daty różnią się o 1462 dni od zwykłego systemu). Daty przeliczono odpowiednio; sprawdź kilka z nich.`,
      en: `This Excel file uses the older 1904 date system (dates differ by 1462 days from the usual one). Dates were converted accordingly; check a few of them.`,
      de: `Diese Excel-Datei verwendet das ältere 1904-Datumssystem (Daten weichen um 1462 Tage vom üblichen System ab). Die Daten wurden entsprechend umgerechnet; prüfen Sie einige davon.`,
      fr: `Ce fichier Excel utilise l'ancien système de dates 1904 (les dates diffèrent de 1462 jours par rapport au système habituel). Les dates ont été converties en conséquence ; vérifiez-en quelques-unes.`,
    },
    technical: `{file}: workbook date1904 flag is set; serial dates converted with epoch 1904-01-01 (1462 days offset from the 1900 system).`,
  },
];

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
 *   IN-DWCA-NOT-ARCHIVE     (none)
 *   IN-DWCA-UNSUPPORTED-CORE core    local name of the core rowType (e.g. Taxon), or the raw rowType when it has none
 *   IN-DWCA-UNREADABLE      reason   language-neutral code (ZIP-ENCRYPTED, ZIP-BOMB, DWCA-META-INVALID, ...)
 *   IN-DWCA-PARTIAL         read, total    rows read / rows in the core file
 *   IN-DWCA-VERSION         title, version, core   dataset title, 'v1.0, 2025-09-17' (or n/a), core type
 *   IN-DWCA-EVENT-CORE      occurrences    rows of the Occurrence extension
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
    plainByStatus: {
      server: {
        pl: `Serwer {host} zwrócił błąd ({status}), więc rekordu nie udało się otworzyć. To zwykle chwilowa awaria po stronie serwera: spróbuj ponownie później albo pobierz pliki lub metadane i przeciągnij je tutaj.`,
        en: `The server {host} returned an error ({status}), so the record could not be opened. This is usually a temporary fault on the server's side: try again later, or download its files or metadata and drop them here.`,
        de: `Der Server {host} hat einen Fehler gemeldet ({status}), daher konnte der Eintrag nicht geöffnet werden. Meist ist das eine vorübergehende Störung auf Serverseite: Versuchen Sie es später erneut oder laden Sie die Dateien oder Metadaten herunter und ziehen Sie sie hierher.`,
        fr: `Le serveur {host} a renvoyé une erreur ({status}), la notice n'a donc pas pu être ouverte. Il s'agit en général d'une panne passagère côté serveur : réessayez plus tard, ou téléchargez ses fichiers ou ses métadonnées et déposez-les ici.`,
      },
      other: {
        pl: `Nie udało się otworzyć rekordu na {host} (błąd {status}). Spróbuj ponownie później albo pobierz jego pliki lub metadane i przeciągnij je tutaj.`,
        en: `The record on {host} could not be opened (error {status}). Try again later, or download its files or metadata and drop them here.`,
        de: `Der Eintrag auf {host} konnte nicht geöffnet werden (Fehler {status}). Versuchen Sie es später erneut oder laden Sie die Dateien oder Metadaten herunter und ziehen Sie sie hierher.`,
        fr: `La notice sur {host} n'a pas pu être ouverte (erreur {status}). Réessayez plus tard, ou téléchargez ses fichiers ou ses métadonnées et déposez-les ici.`,
      },
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
    id: 'IN-FETCH-TIMEOUT',
    category: 'input',
    severity: 'warning',
    params: ['host'],
    plain: {
      pl: `{host} nie zaczął odpowiadać w ciągu 30 sekund, więc przeglądarka przestała czekać. Spróbuj ponownie później albo przełącz na tryb serwera.`,
      en: `{host} did not start to answer within 30 seconds, so the browser stopped waiting. Try again later or switch to server mode.`,
      de: `{host} hat innerhalb von 30 Sekunden nicht zu antworten begonnen, daher hat der Browser das Warten beendet. Versuchen Sie es später erneut oder wechseln Sie in den Servermodus.`,
      fr: `{host} n'a pas commencé à répondre en 30 secondes ; le navigateur a cessé d'attendre. Réessayez plus tard ou passez en mode serveur.`,
    },
    technical: `{file}: no response from {host} within 30 s in browser mode; the request was abandoned.`,
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
  {
    id: 'IN-DWCA-NOT-ARCHIVE',
    category: 'input',
    severity: 'error',
    params: [],
    plain: {
      pl: `To archiwum ZIP, ale nie archiwum Darwin Core (brak pliku meta.xml), więc niczego nie sprawdzono. Dodaj archiwum DwC-A pobrane z IPT, OBIS lub GBIF albo samą tabelę jako CSV lub Excel.`,
      en: `This is a ZIP file, but not a Darwin Core Archive (it has no meta.xml), so nothing was checked. Add a DwC-A downloaded from an IPT, OBIS or GBIF, or the table itself as CSV or Excel.`,
      de: `Dies ist eine ZIP-Datei, aber kein Darwin-Core-Archiv (es fehlt die meta.xml), daher wurde nichts geprüft. Fügen Sie ein DwC-A von einem IPT, OBIS oder GBIF hinzu oder die Tabelle selbst als CSV oder Excel.`,
      fr: `Ce fichier est un ZIP, mais pas une archive Darwin Core (il n'a pas de meta.xml) ; rien n'a donc été vérifié. Ajoutez un DwC-A issu d'un IPT, d'OBIS ou du GBIF, ou le tableau lui-même en CSV ou Excel.`,
    },
    technical: `{file}: zip archive without a meta.xml at its root; not a Darwin Core Archive, nothing read.`,
  },
  {
    id: 'IN-DWCA-UNSUPPORTED-CORE',
    category: 'input',
    severity: 'error',
    params: ['core'],
    plain: {
      pl: `To archiwum Darwin Core, którego tabela główna to {core}. Narzędzie sprawdza tylko archiwa typu Occurrence lub Event, więc tego archiwum nie sprawdzono. To nie znaczy, że jest w porządku.`,
      en: `This is a Darwin Core Archive whose core table is {core}. The tool only checks Occurrence or Event archives, so this archive was not checked. That does not mean it is fine.`,
      de: `Dies ist ein Darwin-Core-Archiv, dessen Kerntabelle {core} ist. Das Werkzeug prüft nur Archive vom Typ Occurrence oder Event, daher wurde dieses Archiv nicht geprüft. Das heißt nicht, dass es in Ordnung ist.`,
      fr: `Cette archive Darwin Core a pour table centrale {core}. L'outil ne vérifie que les archives Occurrence ou Event ; celle-ci n'a donc pas été vérifiée. Cela ne veut pas dire qu'elle est correcte.`,
    },
    technical: `{file}: Darwin Core Archive with core rowType {core}; only Occurrence and Event cores are checked. Not checked.`,
  },
  {
    id: 'IN-DWCA-UNREADABLE',
    category: 'input',
    severity: 'error',
    params: ['reason'],
    plain: {
      pl: `Nie udało się bezpiecznie odczytać tego archiwum ({reason}), więc niczego nie sprawdzono. Plik może być uszkodzony, zaszyfrowany lub zbyt duży. Pobierz go ponownie albo dodaj samą tabelę (np. occurrence.txt).`,
      en: `This archive could not be read safely ({reason}), so nothing was checked. The file may be damaged, encrypted or too large. Download it again, or add the table itself (for example occurrence.txt).`,
      de: `Dieses Archiv konnte nicht sicher gelesen werden ({reason}), daher wurde nichts geprüft. Die Datei ist möglicherweise beschädigt, verschlüsselt oder zu groß. Laden Sie sie erneut herunter oder fügen Sie die Tabelle selbst hinzu (z. B. occurrence.txt).`,
      fr: `Cette archive n'a pas pu être lue en toute sécurité ({reason}) ; rien n'a donc été vérifié. Le fichier est peut-être endommagé, chiffré ou trop volumineux. Téléchargez-le à nouveau ou ajoutez le tableau lui-même (par ex. occurrence.txt).`,
    },
    technical: `{file}: archive rejected or unreadable: {reason}. Nothing was checked.`,
  },
  {
    id: 'IN-DWCA-PARTIAL',
    category: 'input',
    severity: 'warning',
    params: ['read', 'total'],
    plain: {
      pl: `CZĘŚCIOWE SPRAWDZENIE: tabela w archiwum jest duża, więc odczytano tylko pierwsze {read} z {total} wierszy. Pozostałych wierszy nie sprawdzono; brak uwag nie dotyczy całego pliku.`,
      en: `PARTIAL CHECK: the table in this archive is large, so only the first {read} of {total} rows were read. The remaining rows were not checked; a clean result does not cover the whole file.`,
      de: `TEILWEISE PRÜFUNG: Die Tabelle in diesem Archiv ist groß, daher wurden nur die ersten {read} von {total} Zeilen gelesen. Die übrigen Zeilen wurden nicht geprüft; ein unauffälliges Ergebnis gilt nicht für die ganze Datei.`,
      fr: `VÉRIFICATION PARTIELLE : le tableau de cette archive est volumineux ; seules les {read} premières lignes sur {total} ont été lues. Les autres n'ont pas été vérifiées ; l'absence de remarque ne couvre pas tout le fichier.`,
    },
    technical: `{file}: only the first {read} of {total} rows of the core file were read (row cap); the rest is unchecked. PARTIAL run.`,
  },
  {
    id: 'IN-DWCA-VERSION',
    category: 'input',
    severity: 'info',
    params: ['title', 'version', 'core'],
    plain: {
      pl: `Odczytano archiwum Darwin Core „{title}”, wersja: {version}. Sprawdzono jego tabelę główną ({core}). Jeśli archiwum zostało od tego czasu zaktualizowane, wynik dotyczy starej wersji.`,
      en: `Read the Darwin Core Archive "{title}", version: {version}. Its core table ({core}) was checked. If the archive has been updated since, this result covers the older version.`,
      de: `Das Darwin-Core-Archiv „{title}“ wurde gelesen, Version: {version}. Seine Kerntabelle ({core}) wurde geprüft. Wurde das Archiv inzwischen aktualisiert, gilt dieses Ergebnis für die ältere Version.`,
      fr: `Archive Darwin Core « {title} » lue, version : {version}. Sa table centrale ({core}) a été vérifiée. Si l'archive a été mise à jour depuis, ce résultat concerne l'ancienne version.`,
    },
    technical: `{file}: Darwin Core Archive "{title}", version {version} (eml.xml packageId / pubDate); core rowType {core}.`,
  },
  {
    id: 'IN-DWCA-EVENT-CORE',
    category: 'input',
    severity: 'info',
    params: ['occurrences'],
    plain: {
      pl: `Rdzeniem archiwum są zdarzenia (Event); rozszerzenie Occurrence ma {occurrences} wierszy. Pozycje i daty pochodzą ze zdarzeń, więc sprawdzono tabelę zdarzeń, a nie osobne wiersze występowań.`,
      en: `The archive's core is Event; its Occurrence extension has {occurrences} rows. Positions and dates belong to the events, so the event table was checked, not the occurrence rows one by one.`,
      de: `Der Kern des Archivs ist Event; die Occurrence-Erweiterung hat {occurrences} Zeilen. Positionen und Daten gehören zu den Events, daher wurde die Event-Tabelle geprüft, nicht die einzelnen Occurrence-Zeilen.`,
      fr: `Le cœur de l'archive est Event ; son extension Occurrence compte {occurrences} lignes. Positions et dates appartiennent aux événements : c'est la table des événements qui a été vérifiée, pas les occurrences une à une.`,
    },
    technical: `{file}: Event core with an Occurrence extension of {occurrences} rows; positions and dates are the events', the event table was checked.`,
  },
];

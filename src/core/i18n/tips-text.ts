// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * The texts of the ⓘ explanations (src/app/components/InfoTip.tsx, registry src/app/tips.tsx), merged into the UI tables of ui.ts.
 * Every tip has two parts: `tip.<id>.does` (what it does) and `tip.<id>.logic` (the logic), each 1-3 short sentences or "• " bullets,
 * one per line.
 *
 * ⛔ No number, unit or source is typed here. Where a tip states one, the text holds a {placeholder} and src/app/tips.tsx fills it from
 * the rule definition or the constant (test/app/infotip-sources.test.ts fails on a digit written into a text, and on a rendered number that
 * differs from the rule). The only digits allowed are inside the names of standards and encodings (ISO 19139, UTF-8, windows-1250 ...).
 * ⛔ Never says that data are "ready to publish" (test/app/ui.test.ts).
 */
const en = {
  'tip.aria': `Explanation: {label}`,
  'tip.does': `What it does`,
  'tip.logic': `The logic`,
  'tip.ruleLink': `Rule details →`,
  'tip.roles.feeds': `feeds rules`,
  'tip.encoding.label': `Text encoding`,

  'tip.role.ignore': `the column is not interpreted and is not part of any check.`,
  'tip.role.latitude': `the north–south position of the point.`,
  'tip.role.longitude': `the east–west position of the point.`,
  'tip.role.datetime': `date and time in one column.`,
  'tip.role.date': `the date alone, without a time of day.`,
  'tip.role.time': `the time of day alone, combined with the date column.`,
  'tip.role.depth': `distance below the surface; you give the positive direction and the unit beside it.`,
  'tip.role.pressure': `water pressure; kept with its unit in the sidecar file.`,
  'tip.role.station': `the name or number of a station; groups the rows taken at one place.`,
  'tip.role.cruise': `the name of a cruise; separates cruises in the ship-speed test, instead of the one-cruise tick.`,
  'tip.role.sampleId': `the id of a sample or core; used to find the same sample in two files.`,
  'tip.role.variable': `a measured quantity; needs a name and a unit, and the tool never guesses the unit.`,

  'tip.dropZone.does': `Reads files from your computer so that they can be checked.`,
  'tip.dropZone.logic': `• Accepted extensions: {formats}.
• XML and JSON files are read as metadata (for example ISO 19139 or DataCite), the others as data tables.
• A .zip file is read as a Darwin Core Archive (OBIS or GBIF data).
• Files stay in your browser; nothing is uploaded.`,
  'tip.linkField.does': `Fetches a record from a repository by its link or DOI and checks its metadata and data files.`,
  'tip.linkField.logic': `• Recognised: Zenodo, PANGAEA, GBIF, OBIS, any DOI (through DataCite), Dataverse ({dataverse}) and GeoNetwork ({geonetwork}).
• Files are downloaded only from servers on the allowed list (see the Privacy page); for any other server, download the file yourself and drop it above.
• A file from a link may be at most {maxFile}; an archive from an IPT server, at most {maxArchive}.`,
  'tip.downloadMode.does': `Chooses who downloads the files behind a link: your browser or our server.`,
  'tip.downloadMode.logic': `• Browser: files go straight from the data server to you; some servers do not allow this.
• Abyssal Claims server: downloads the file for you from servers on the allowed list, at most {maxFile}, and stores nothing.
• Files you drop here never leave your computer, in either mode.`,

  'tip.layout.does': `Shows how the tool understood the structure of the file, and lets you correct it.`,
  'tip.layout.logic': `• One table: one row is one sample.
• Long format: one row is one measurement; the tool turns it into one row per sample.
• Two sheets: measurements are joined to positions and dates through a key column.
• A layout it cannot read is not guessed at: it is reported, and the other tables are still checked.`,
  'tip.roles.does': `Tells the tool what each column is; this decides which checks cover it.`,
  'tip.roles.logic': `The tool never guesses a unit: a column with no stated unit stays without one.
{roles}`,
  'tip.encoding.does': `Shows which character encoding the file was read in; it decides whether accented letters and other special characters come out right.`,
  'tip.encoding.logic': `• UTF-8 is tried first (with or without a BOM).
• If the file is not valid UTF-8, the tool guesses an older encoding (windows-1250 or ISO-8859-2) and reports that it did.
• If characters look wrong, save the file as UTF-8 and load it again.`,
  'tip.singleCruise.does': `Switches on a test of whether the ship could have sailed between consecutive stations.`,
  'tip.singleCruise.logic': `• warning when the ship would have to sail faster than {extreme}, on both sides of a station ({extremeSrc})
• note when faster than {unusual} ({unusualSrc})
• stations closer than {minSeparation} count as one place and are skipped
• a date without a time means the longest possible gap`,

  'tip.severities.does': `Explains the three levels of findings in the report and what each means before you publish the data.`,
  'tip.severities.logic': `• Error: the data are contradictory, impossible or unreadable (for example a latitude out of range, or no licence); fix it before publishing.
• Warning: usually turns out to be a mistake; check it and fix it, or be ready to explain it.
• Note: information to consider; often needs no change.
No findings only means that no problems were found in the checked categories.`,
  'tip.notChecked.does': `Lists what the tool did not check in this run.`,
  'tip.notChecked.logic': `• The list is always shown, also when nothing was found.
• Some entries depend on your choices: ship speed, for example, is not checked until you tick the one-cruise box or map a cruise column.
• No findings in the report says nothing about the items on this list.`,
  'tip.mapLegend.does': `Explains the colours of the points on the preview map.`,
  'tip.mapLegend.logic': `• A point takes the colour of the most serious finding on its row (error, warning, note).
• A point with no finding has the "no finding" colour.
• Findings about the whole dataset rather than a row do not change the colours.
• Rows without a position are not on the map.`,

  'tip.cleanCsv.does': `Saves the table from your data in one uniform CSV layout.`,
  'tip.cleanCsv.logic': `• Values are copied exactly as written in the file: nothing is converted or corrected.
• Long-format tables and joined sheets are flattened to one row per sample.
• Text starting with =, +, - or @ gets a leading apostrophe, so that a spreadsheet does not run it as a formula.
• The description of the columns is in the separate sidecar file.`,
  'tip.sidecar.does': `Records what the tool found out about the columns: their meaning, unit and where the unit came from.`,
  'tip.sidecar.logic': `• One row per column: the name in the file, the name in the clean CSV, the unit, the source of the unit, and the P01 code when known.
• It also keeps your declaration of one cruise.
• Drop it with the files at the next check and that declaration is restored.`,
  'tip.iso19139.does': `Writes a draft ISO 19139 metadata record to load into GeoNetwork.`,
  'tip.iso19139.logic': `• It fills in only what follows from the data: geographic and time extent, variables, the licence the metadata already state, and the title.
• Fields the data cannot supply (contact, citation date, language, topic category) are not invented: they are marked as missing.
• It is a draft to complete in the editor, not a finished record.`,
  'tip.datacite.does': `Writes a draft DataCite record (XML) for the registration of a DOI.`,
  'tip.datacite.logic': `• It fills in only what follows from the data and the metadata: title, extent, variables, licence.
• Creators, publisher and the DOI are not guessed; they stay as XML comments.
• It is a draft to complete, not a finished record.`,
  'tip.draft.does': `Gives values computed from the data that you can copy into metadata fields.`,
  'tip.draft.logic': `• The time extent and the four geographic bounds are computed from your data.
• The list of variables carries units, but only those somebody stated.
• The licence and the title come from the metadata, not from the data.
• The field names match the sections of the GeoNetwork editor.`,
  'tip.geojson.does': `Saves the positions of the rows as GeoJSON points, to open in QGIS or another GIS program.`,
  'tip.geojson.logic': `• One point per row that has a position; coordinates unchanged, as [longitude, latitude].
• Each point carries its file, line, station, date and the most serious finding on its row.
• One file for all datasets.`,

  'tip.licenceInput.does': `Names the descriptions of one dataset that are to be compared.`,
  'tip.licenceInput.logic': `• One reference per line: a DOI, a Zenodo or PANGAEA link, a Dataverse dataset link ({dataverse}) or a GeoNetwork record link.
• Only the metadata of those records is read, never the data files.
• All lines should be about one dataset: several places where it is described.`,
  'tip.licenceOneDeposit.does': `Shows whether the sources state the same licence, and counts the sources of one deposit once.`,
  'tip.licenceOneDeposit.logic': `• One deposit is a record in a repository together with its DataCite record (Zenodo, PANGAEA, Dataverse): they describe the same dataset, so they count as one source.
• What is compared is the licence identifiers the sources state, not their legal texts.
• Different licences in different sources are a contradiction; an empty DataCite record next to a licence stated elsewhere is not.`,
  'tip.licenceSpdx.does': `Shows how the tool read each statement about a licence.`,
  'tip.licenceSpdx.logic': `• The text and the link of each statement are compared with the SPDX licence list.
• The result is one SPDX identifier, or "unrecognised — check manually".
• The tool does not judge the legal effect of a licence and does not read licence texts.`,
  'tip.licenceDatacite.does': `Points out that the DOI record at DataCite has no licence, although another source states one.`,
  'tip.licenceDatacite.logic': `• DataCite has a Rights field, but it is optional, so many records stay without a licence.
• The OpenAIRE guidelines for data archives ask for the licence when it applies.
• This alone is not a contradiction: it has a line of its own, asking you to add the licence to the DOI record.`,
  'tip.licenceAttribution.does': `Puts together an attribution text with the licence that you can paste.`,
  'tip.licenceAttribution.logic': `• It is built only from what the sources state: title, authors, licence, identifier.
• When the sources contradict each other or the licence is not recognised, the licence is left out and the page says why.
• The text is always in English, so that you can paste it as it is; check it against the record first.`,

  'tip.collectionKind.does': `Chooses where the tool reads the metadata of a whole collection from.`,
  'tip.collectionKind.logic': `• A list of DOIs, a DataCite repository or DOI prefix, a Zenodo community or a GeoNetwork catalogue.
• Only metadata is read, never data files.
• The result is counts per problem, a few examples of each and a fix list as a CSV file; nothing is compared between institutions.`,
  'tip.collectionDois.does': `Reads the DataCite records of the DOIs you list.`,
  'tip.collectionDois.logic': `• Your browser looks up each DOI at DataCite.
• Links of the form doi.org/… and doi:… are accepted; a repeated DOI is read once.
• Put one DOI on a line, or separate them with spaces.`,
  'tip.collectionDatacite.does': `Names a DataCite repository, either by its client id or by a DOI prefix.`,
  'tip.collectionDatacite.logic': `• A client id covers the records of one repository; a DOI prefix covers everything registered under that start of the DOI.
• Your browser asks DataCite for the list page by page.`,
  'tip.collectionZenodo.does': `Reads the records of a Zenodo community, named as in its address.`,
  'tip.collectionZenodo.logic': `• Zenodo limits how many records and requests a guest may take, so a large community takes time.
• A community larger than the search limit is read in slices split by publication date.`,
  'tip.collectionCsw.does': `Reads the records of a GeoNetwork catalogue from the list.`,
  'tip.collectionCsw.logic': `• Available catalogues: {catalogues}.
• Requests go through our server, which passes the answer on and keeps nothing.
• You choose the metadata format beside it: ISO 19139 or ISO 19115-3, where the catalogue offers both.`,
  'tip.collectionCross.does': `Compares the licences of the catalogue with those at DataCite.`,
  'tip.collectionCross.logic': `• For records that state a DOI, your browser looks the DOI up at DataCite and compares the licences of both sources.
• Each such record costs one more request, so the run takes longer.`,
  'tip.collectionRun.does': `Shows how long a run will take before you start it, and lets you begin with a sample.`,
  'tip.collectionRun.logic': `• The estimate counts records and requests; for large collections the number of requests is a rough guess.
• The quick sample reads only part of the collection and is labelled as a sample in the results.
• A run can be paused and resumed; its progress stays in this browser.`,

  'tip.indexCheck.does': `Checks data files, or a record from a repository, before you publish them.`,
  'tip.indexCheck.logic': `• It reads tables (CSV, Excel, Darwin Core) or a record given by a link or DOI.
• It checks coordinates, dates, units, value ranges and the licence, and states each finding in a plain sentence with the technical detail beside it.
• It changes nothing in your data: it shows what it found and lists what it does not check.`,
  'tip.indexLicence.does': `Compares what different metadata sources state about the licence of one dataset.`,
  'tip.indexLicence.logic': `• It reads the metadata of Zenodo, PANGAEA, Dataverse, GeoNetwork and DataCite, not data files.
• It classifies each statement against the SPDX licence list and looks for contradictions.
• It builds an attribution text with the licence for you to paste.`,
  'tip.indexCollection.does': `Goes through the metadata of a whole collection and gathers licence problems and empty fields.`,
  'tip.indexCollection.logic': `• It reads only metadata, never data files.
• The result is counts per problem, examples and a fix list as a CSV file.
• It does not compare or rank institutions; a quick sample is labelled as a sample.`,
} as const;

export type TipKey = keyof typeof en;

const pl: Record<TipKey, string> = {
  'tip.aria': `Wyjaśnienie: {label}`,
  'tip.does': `Co robi`,
  'tip.logic': `Logika`,
  'tip.ruleLink': `Szczegóły reguły →`,
  'tip.roles.feeds': `zasila reguły`,
  'tip.encoding.label': `Kodowanie tekstu`,

  'tip.role.ignore': `kolumna nie jest interpretowana i nie wchodzi do żadnego sprawdzenia.`,
  'tip.role.latitude': `położenie punktu na osi północ–południe.`,
  'tip.role.longitude': `położenie punktu na osi wschód–zachód.`,
  'tip.role.datetime': `data i godzina w jednej kolumnie.`,
  'tip.role.date': `sama data, bez godziny.`,
  'tip.role.time': `sama godzina, łączona z kolumną daty.`,
  'tip.role.depth': `odległość od powierzchni; kierunek dodatni i jednostkę podajesz obok.`,
  'tip.role.pressure': `ciśnienie wody; trafia do pliku towarzyszącego razem z jednostką.`,
  'tip.role.station': `nazwa lub numer stacji; grupuje wiersze z jednego miejsca.`,
  'tip.role.cruise': `nazwa rejsu; rozdziela rejsy w teście prędkości statku, zamiast zaznaczenia jednego rejsu.`,
  'tip.role.sampleId': `identyfikator próbki lub rdzenia; pozwala znaleźć tę samą próbkę w dwóch plikach.`,
  'tip.role.variable': `mierzona wielkość; wymaga nazwy i jednostki, a jednostki narzędzie nigdy nie zgaduje.`,

  'tip.dropZone.does': `Wczytuje pliki z Twojego komputera, żeby je sprawdzić.`,
  'tip.dropZone.logic': `• Przyjmowane rozszerzenia: {formats}.
• Pliki XML i JSON są czytane jako metadane (np. ISO 19139 lub DataCite), pozostałe jako tabele z danymi.
• Plik .zip jest czytany jako archiwum Darwin Core (dane z OBIS lub GBIF).
• Pliki zostają w Twojej przeglądarce, nic nie jest wysyłane.`,
  'tip.linkField.does': `Pobiera rekord z repozytorium po linku lub numerze DOI i sprawdza jego metadane oraz pliki z danymi.`,
  'tip.linkField.logic': `• Rozpoznawane są Zenodo, PANGAEA, GBIF, OBIS, każdy numer DOI (przez DataCite), Dataverse ({dataverse}) i GeoNetwork ({geonetwork}).
• Pliki są pobierane tylko z serwerów z listy dozwolonych (strona Prywatność); z pozostałych pobierz plik sam i upuść go powyżej.
• Plik z linku może mieć najwyżej {maxFile}, archiwum z serwera IPT – {maxArchive}.`,
  'tip.downloadMode.does': `Wybierasz, kto pobiera pliki spod linku: Twoja przeglądarka czy nasz serwer.`,
  'tip.downloadMode.logic': `• Przeglądarka: pliki idą prosto z serwera danych do Ciebie; część serwerów na to nie pozwala.
• Serwer Abyssal Claims: pobiera plik za Ciebie z serwerów z listy dozwolonych, najwyżej {maxFile}, i niczego nie zapisuje.
• Pliki, które tu upuścisz, nie opuszczają Twojego komputera w żadnym z trybów.`,

  'tip.layout.does': `Pokazuje, jak narzędzie zrozumiało budowę pliku, i pozwala ją poprawić.`,
  'tip.layout.logic': `• Jedna tabela: jeden wiersz to jedna próbka.
• Format długi: jeden wiersz to jeden pomiar; narzędzie zamienia go na jeden wiersz na próbkę.
• Dwa arkusze: pomiary są łączone z pozycjami i datami przez kolumnę klucza.
• Układu, którego nie da się odczytać, narzędzie nie zgaduje: zgłasza go i dalej sprawdza pozostałe tabele.`,
  'tip.roles.does': `Mówi narzędziu, czym jest każda kolumna; od tego zależy, które sprawdzenia ją obejmą.`,
  'tip.roles.logic': `Narzędzie nigdy nie zgaduje jednostki: kolumna bez podanej jednostki pozostaje bez jednostki.
{roles}`,
  'tip.encoding.does': `Pokazuje, w jakim kodowaniu znaków odczytano plik; od tego zależy, czy polskie litery i inne znaki specjalne wyjdą poprawnie.`,
  'tip.encoding.logic': `• Najpierw sprawdzane jest UTF-8 (z BOM lub bez).
• Jeśli plik nie jest poprawnym UTF-8, narzędzie zgaduje starsze kodowanie (windows-1250 lub ISO-8859-2) i zgłasza, że to zrobiło.
• Jeśli znaki wyglądają źle, zapisz plik jako UTF-8 i wczytaj go jeszcze raz.`,
  'tip.singleCruise.does': `Włącza test, czy statek mógł dopłynąć między kolejnymi stacjami.`,
  'tip.singleCruise.logic': `• ostrzeżenie, gdy statek musiałby płynąć szybciej niż {extreme} – w obie strony od stacji ({extremeSrc})
• uwaga, gdy szybciej niż {unusual} ({unusualSrc})
• stacje bliższe niż {minSeparation} liczą się jako jedno miejsce i są pomijane
• sama data, bez godziny, oznacza najdłuższy możliwy odstęp`,

  'tip.severities.does': `Wyjaśnia trzy poziomy zastrzeżeń w raporcie i to, co każdy z nich znaczy przed publikacją danych.`,
  'tip.severities.logic': `• Błąd: dane są sprzeczne, niemożliwe albo nieczytelne (np. szerokość poza zakresem, brak licencji); popraw to przed publikacją.
• Ostrzeżenie: zwykle okazuje się pomyłką; sprawdź i popraw albo bądź gotów to uzasadnić.
• Uwaga: informacja do rozważenia; często nie wymaga zmiany.
Brak zastrzeżeń oznacza tylko, że w sprawdzanych kategoriach nie znaleziono problemów.`,
  'tip.notChecked.does': `Wymienia, czego narzędzie nie sprawdziło w tym przebiegu.`,
  'tip.notChecked.logic': `• Lista jest pokazywana zawsze, także gdy nic nie znaleziono.
• Część pozycji zależy od Twoich wyborów: np. prędkość statku nie jest sprawdzana, dopóki nie zaznaczysz jednego rejsu albo nie wskażesz kolumny z rejsem.
• Brak zastrzeżeń w raporcie nic nie mówi o pozycjach z tej listy.`,
  'tip.mapLegend.does': `Tłumaczy kolory punktów na mapie podglądu.`,
  'tip.mapLegend.logic': `• Punkt ma kolor najpoważniejszego zastrzeżenia dotyczącego jego wiersza (błąd, ostrzeżenie, uwaga).
• Punkt bez zastrzeżeń ma kolor „brak uwag do wiersza”.
• Zastrzeżenia dotyczące całego zbioru, a nie wiersza, nie zmieniają kolorów.
• Wierszy bez pozycji nie ma na mapie.`,

  'tip.cleanCsv.does': `Zapisuje tabelę z Twoich danych w jednym, jednolitym układzie CSV.`,
  'tip.cleanCsv.logic': `• Wartości są przepisane dokładnie tak, jak stoją w pliku: nic nie jest przeliczane ani poprawiane.
• Tabele w formacie długim i połączone arkusze są spłaszczone do jednego wiersza na próbkę.
• Tekst zaczynający się od =, +, - lub @ dostaje na początku apostrof, żeby arkusz kalkulacyjny nie wykonał go jak formuły.
• Opis kolumn jest w osobnym pliku towarzyszącym.`,
  'tip.sidecar.does': `Zapisuje, co narzędzie ustaliło o kolumnach: ich znaczenie, jednostkę i skąd ją wzięto.`,
  'tip.sidecar.logic': `• Jeden wiersz na kolumnę: nazwa w pliku, nazwa w czystym CSV, jednostka, źródło jednostki i kod P01, jeśli jest znany.
• Przechowuje też Twoją deklarację jednego rejsu.
• Upuść go razem z plikami przy następnym sprawdzeniu, a deklaracja zostanie przywrócona.`,
  'tip.iso19139.does': `Tworzy szkic rekordu metadanych ISO 19139 do wczytania w GeoNetwork.`,
  'tip.iso19139.logic': `• Wypełnia tylko to, co wynika z danych: zakres geograficzny i czasowy, zmienne, licencję podaną już w metadanych oraz tytuł.
• Pól, których z danych nie da się wziąć (kontakt, data cytowania, język, kategoria tematyczna), nie wymyśla: oznacza je jako brakujące.
• To szkic do uzupełnienia w edytorze, a nie gotowy rekord.`,
  'tip.datacite.does': `Tworzy szkic rekordu DataCite (XML) do użycia przy rejestracji numeru DOI.`,
  'tip.datacite.logic': `• Wypełnia tylko to, co wynika z danych i metadanych: tytuł, zakres, zmienne, licencję.
• Twórców, wydawcy i numeru DOI nie zgaduje; zostają jako komentarze XML.
• To szkic do uzupełnienia, a nie gotowy rekord.`,
  'tip.draft.does': `Podaje wartości policzone z danych, które możesz skopiować do pól metadanych.`,
  'tip.draft.logic': `• Zakres czasowy i cztery granice geograficzne są liczone z Twoich danych.
• Lista zmiennych zawiera jednostki, ale tylko takie, które ktoś podał.
• Licencja i tytuł pochodzą z metadanych, nie z danych.
• Nazwy pól odpowiadają sekcjom edytora GeoNetwork.`,
  'tip.geojson.does': `Zapisuje pozycje wierszy jako punkty GeoJSON, do otwarcia w QGIS lub innym programie GIS.`,
  'tip.geojson.logic': `• Jeden punkt na każdy wiersz, który ma pozycję; współrzędne bez zmian, jako [długość, szerokość].
• Każdy punkt niesie nazwę pliku, numer wiersza, stację, datę i najpoważniejsze zastrzeżenie dotyczące swojego wiersza.
• Jeden plik na wszystkie zbiory.`,

  'tip.licenceInput.does': `Wskazuje opisy jednego zbioru danych, które mają zostać porównane.`,
  'tip.licenceInput.logic': `• Jedno odwołanie w wierszu: numer DOI, link do Zenodo lub PANGAEA, link do zbioru Dataverse ({dataverse}) albo do rekordu GeoNetwork.
• Czytane są tylko metadane tych rekordów, nigdy pliki z danymi.
• Wszystkie wiersze powinny dotyczyć jednego zbioru: to kilka miejsc, w których jest opisany.`,
  'tip.licenceOneDeposit.does': `Pokazuje, czy źródła podają tę samą licencję, a źródła jednego złożenia liczy raz.`,
  'tip.licenceOneDeposit.logic': `• Jedno złożenie to rekord w repozytorium razem z jego rekordem DataCite (Zenodo, PANGAEA, Dataverse): opisują ten sam zbiór, więc liczą się jako jedno źródło.
• Porównywane są identyfikatory licencji podane przez źródła, a nie ich teksty prawne.
• Różne licencje w różnych źródłach to sprzeczność; pusty rekord DataCite obok licencji podanej gdzie indziej nią nie jest.`,
  'tip.licenceSpdx.does': `Pokazuje, jak narzędzie odczytało każde stwierdzenie o licencji.`,
  'tip.licenceSpdx.logic': `• Tekst i link każdego stwierdzenia są porównywane z listą licencji SPDX.
• Wynik to jeden identyfikator SPDX albo „nierozpoznano — sprawdź ręcznie”.
• Narzędzie nie ocenia skutków prawnych licencji i nie czyta jej tekstu.`,
  'tip.licenceDatacite.does': `Zwraca uwagę, że rekord DOI w DataCite nie ma licencji, choć inne źródło ją podaje.`,
  'tip.licenceDatacite.logic': `• DataCite ma pole Rights, ale jest ono opcjonalne, więc wiele rekordów zostaje bez licencji.
• Wytyczne OpenAIRE dla archiwów danych wymagają podania licencji, gdy ma zastosowanie.
• Samo to nie jest sprzecznością: strona pokazuje to osobną uwagą, z prośbą o dodanie licencji do rekordu DOI.`,
  'tip.licenceAttribution.does': `Przygotowuje tekst z podaniem autorstwa i licencji, który możesz wkleić.`,
  'tip.licenceAttribution.logic': `• Powstaje wyłącznie z tego, co podają źródła: tytuł, autorzy, licencja, identyfikator.
• Gdy źródła sobie przeczą albo licencji nie rozpoznano, licencja jest pominięta, a strona mówi dlaczego.
• Tekst jest zawsze po angielsku, żeby dało się go wkleić bez zmian; najpierw porównaj go z rekordem.`,

  'tip.collectionKind.does': `Wybierasz, skąd narzędzie ma wczytać metadane całej kolekcji.`,
  'tip.collectionKind.logic': `• Lista DOI, repozytorium lub prefiks DOI w DataCite, społeczność Zenodo albo katalog GeoNetwork.
• Czytane są tylko metadane, nigdy pliki z danymi.
• Wynik to liczby problemów, kilka przykładów każdego i lista poprawek w pliku CSV; instytucji między sobą się nie porównuje.`,
  'tip.collectionDois.does': `Czyta rekordy DataCite dla wypisanych numerów DOI.`,
  'tip.collectionDois.logic': `• Twoja przeglądarka sprawdza każdy numer DOI w DataCite.
• Linki w postaci doi.org/… i zapis doi:… są przyjmowane; powtórzony numer DOI jest czytany raz.
• Wpisz jeden numer w wierszu albo oddziel je spacjami.`,
  'tip.collectionDatacite.does': `Wskazuje repozytorium w DataCite: przez identyfikator klienta albo przez prefiks DOI.`,
  'tip.collectionDatacite.logic': `• Identyfikator klienta obejmuje rekordy jednego repozytorium; prefiks DOI – wszystko, co zarejestrowano pod tym początkiem numeru DOI.
• Przeglądarka pobiera listę z DataCite stronami.`,
  'tip.collectionZenodo.does': `Czyta rekordy społeczności Zenodo, podanej nazwą z jej adresu.`,
  'tip.collectionZenodo.logic': `• Zenodo ogranicza gościowi liczbę rekordów i zapytań, więc duża społeczność jest czytana długo.
• Społeczność większą niż limit wyszukiwania czyta się w częściach, podzielonych według daty publikacji.`,
  'tip.collectionCsw.does': `Czyta rekordy z katalogu GeoNetwork z listy.`,
  'tip.collectionCsw.logic': `• Dostępne katalogi: {catalogues}.
• Zapytania idą przez nasz serwer, który przekazuje odpowiedź i niczego nie przechowuje.
• Format metadanych wybierasz obok: ISO 19139 albo ISO 19115-3, jeśli katalog obsługuje oba.`,
  'tip.collectionCross.does': `Porównuje licencje z katalogu z licencjami w DataCite.`,
  'tip.collectionCross.logic': `• Dla rekordów, które podają numer DOI, przeglądarka sprawdza ten numer w DataCite i porównuje licencje obu źródeł.
• Każdy taki rekord to jedno dodatkowe zapytanie, więc odczyt trwa dłużej.`,
  'tip.collectionRun.does': `Pokazuje, ile potrwa odczyt, zanim go zaczniesz, i pozwala zacząć od próbki.`,
  'tip.collectionRun.logic': `• Oszacowanie liczy rekordy i zapytania; przy dużych kolekcjach liczba zapytań jest tylko przybliżona.
• Szybka próbka czyta część kolekcji i w wynikach jest oznaczona jako próbka.
• Odczyt można wstrzymać i wznowić; jego postęp zostaje w tej przeglądarce.`,

  'tip.indexCheck.does': `Sprawdza pliki z danymi albo rekord z repozytorium przed publikacją.`,
  'tip.indexCheck.logic': `• Czyta tabele (CSV, Excel, Darwin Core) albo rekord podany linkiem lub numerem DOI.
• Sprawdza współrzędne, daty, jednostki, zakresy wartości i licencję; każde zastrzeżenie opisuje prostym zdaniem, a obok podaje szczegóły techniczne.
• Niczego nie zmienia w Twoich danych: pokazuje, co znalazł, i wymienia to, czego nie sprawdza.`,
  'tip.indexLicence.does': `Porównuje, co o licencji jednego zbioru danych podają różne źródła metadanych.`,
  'tip.indexLicence.logic': `• Czyta metadane z Zenodo, PANGAEA, Dataverse, GeoNetwork i DataCite, a nie pliki z danymi.
• Każde stwierdzenie klasyfikuje według listy licencji SPDX i szuka sprzeczności.
• Składa tekst z podaniem licencji, który możesz wkleić.`,
  'tip.indexCollection.does': `Przegląda metadane całej kolekcji i zbiera problemy z licencjami oraz puste pola.`,
  'tip.indexCollection.logic': `• Czyta wyłącznie metadane, nigdy pliki z danymi.
• Wynik to liczby problemów, przykłady i lista poprawek w pliku CSV.
• Nie porównuje ani nie szereguje instytucji; szybka próbka jest oznaczona jako próbka.`,
};

const de: Record<TipKey, string> = {
  'tip.aria': `Erläuterung: {label}`,
  'tip.does': `Was es tut`,
  'tip.logic': `Die Logik`,
  'tip.ruleLink': `Regeldetails →`,
  'tip.roles.feeds': `speist Regeln`,
  'tip.encoding.label': `Textkodierung`,

  'tip.role.ignore': `die Spalte wird nicht gedeutet und geht in keine Prüfung ein.`,
  'tip.role.latitude': `die Nord-Süd-Position des Punktes.`,
  'tip.role.longitude': `die Ost-West-Position des Punktes.`,
  'tip.role.datetime': `Datum und Uhrzeit in einer Spalte.`,
  'tip.role.date': `nur das Datum, ohne Uhrzeit.`,
  'tip.role.time': `nur die Uhrzeit, verbunden mit der Datumsspalte.`,
  'tip.role.depth': `Abstand unter der Oberfläche; die positive Richtung und die Einheit geben Sie daneben an.`,
  'tip.role.pressure': `Wasserdruck; wird mit seiner Einheit in der Begleitdatei festgehalten.`,
  'tip.role.station': `Name oder Nummer einer Station; fasst die Zeilen eines Ortes zusammen.`,
  'tip.role.cruise': `Name einer Fahrt; trennt die Fahrten beim Geschwindigkeitstest, statt des Häkchens für eine Fahrt.`,
  'tip.role.sampleId': `Kennung einer Probe oder eines Kerns; dient dazu, dieselbe Probe in zwei Dateien zu finden.`,
  'tip.role.variable': `eine gemessene Größe; braucht einen Namen und eine Einheit, und die Einheit rät das Werkzeug nie.`,

  'tip.dropZone.does': `Liest Dateien von Ihrem Rechner ein, damit sie geprüft werden können.`,
  'tip.dropZone.logic': `• Angenommene Endungen: {formats}.
• XML- und JSON-Dateien werden als Metadaten gelesen (z. B. ISO 19139 oder DataCite), die übrigen als Datentabellen.
• Eine .zip-Datei wird als Darwin Core Archive gelesen (OBIS- oder GBIF-Daten).
• Die Dateien bleiben in Ihrem Browser; es wird nichts hochgeladen.`,
  'tip.linkField.does': `Holt einen Datensatz aus einem Repositorium über seinen Link oder seine DOI und prüft Metadaten und Datendateien.`,
  'tip.linkField.logic': `• Erkannt werden Zenodo, PANGAEA, GBIF, OBIS, jede DOI (über DataCite), Dataverse ({dataverse}) und GeoNetwork ({geonetwork}).
• Dateien werden nur von Servern der Erlaubnisliste geladen (siehe Seite Datenschutz); bei anderen Servern laden Sie die Datei selbst herunter und legen sie oben ab.
• Eine Datei aus einem Link darf höchstens {maxFile} groß sein, ein Archiv von einem IPT-Server höchstens {maxArchive}.`,
  'tip.downloadMode.does': `Legt fest, wer die Dateien hinter einem Link herunterlädt: Ihr Browser oder unser Server.`,
  'tip.downloadMode.logic': `• Browser: Die Dateien kommen direkt vom Datenserver zu Ihnen; manche Server erlauben das nicht.
• Abyssal-Claims-Server: lädt die Datei für Sie von Servern der Erlaubnisliste, höchstens {maxFile}, und speichert nichts.
• Abgelegte Dateien verlassen Ihren Rechner in keinem der beiden Modi.`,

  'tip.layout.does': `Zeigt, wie das Werkzeug den Aufbau der Datei verstanden hat, und lässt Sie ihn korrigieren.`,
  'tip.layout.logic': `• Eine Tabelle: Eine Zeile ist eine Probe.
• Langformat: Eine Zeile ist eine Messung; das Werkzeug macht daraus eine Zeile pro Probe.
• Zwei Blätter: Messungen werden über eine Schlüsselspalte mit Positionen und Daten verknüpft.
• Ein Layout, das es nicht lesen kann, wird nicht geraten: Es wird gemeldet, die übrigen Tabellen werden weiter geprüft.`,
  'tip.roles.does': `Sagt dem Werkzeug, was jede Spalte ist; davon hängt ab, welche Prüfungen sie erfassen.`,
  'tip.roles.logic': `Eine Einheit wird nie geraten: Eine Spalte ohne angegebene Einheit bleibt ohne Einheit.
{roles}`,
  'tip.encoding.does': `Zeigt, in welcher Zeichenkodierung die Datei gelesen wurde; davon hängt ab, ob Umlaute und andere Sonderzeichen stimmen.`,
  'tip.encoding.logic': `• Zuerst wird UTF-8 versucht (mit oder ohne BOM).
• Ist die Datei kein gültiges UTF-8, rät das Werkzeug eine ältere Kodierung (windows-1250 oder ISO-8859-2) und meldet das.
• Sehen Zeichen falsch aus, speichern Sie die Datei als UTF-8 und laden Sie sie erneut.`,
  'tip.singleCruise.does': `Schaltet eine Prüfung ein, ob das Schiff zwischen aufeinanderfolgenden Stationen hätte fahren können.`,
  'tip.singleCruise.logic': `• Warnung, wenn das Schiff auf beiden Seiten einer Station schneller als {extreme} fahren müsste ({extremeSrc})
• Hinweis bei mehr als {unusual} ({unusualSrc})
• Stationen näher als {minSeparation} gelten als ein Ort und werden übersprungen
• Ein Datum ohne Uhrzeit bedeutet den längstmöglichen Abstand`,

  'tip.severities.does': `Erklärt die drei Stufen der Befunde im Bericht und was jede vor der Veröffentlichung der Daten bedeutet.`,
  'tip.severities.logic': `• Fehler: Die Daten widersprechen sich, sind unmöglich oder unlesbar (z. B. Breite außerhalb des Bereichs, fehlende Lizenz); vor der Veröffentlichung beheben.
• Warnung: Meist stellt sie sich als Irrtum heraus; prüfen und korrigieren oder begründen können.
• Hinweis: Information zum Abwägen; oft ist keine Änderung nötig.
Keine Befunde heißt nur, dass in den geprüften Kategorien keine Probleme gefunden wurden.`,
  'tip.notChecked.does': `Nennt, was das Werkzeug in diesem Durchlauf nicht geprüft hat.`,
  'tip.notChecked.logic': `• Die Liste wird immer angezeigt, auch wenn nichts gefunden wurde.
• Manche Einträge hängen von Ihren Angaben ab: Die Schiffsgeschwindigkeit etwa wird erst geprüft, wenn Sie das Feld für eine Fahrt ankreuzen oder eine Fahrt-Spalte zuordnen.
• Keine Befunde im Bericht sagen nichts über die Punkte dieser Liste.`,
  'tip.mapLegend.does': `Erklärt die Farben der Punkte auf der Vorschaukarte.`,
  'tip.mapLegend.logic': `• Ein Punkt hat die Farbe des schwersten Befunds seiner Zeile (Fehler, Warnung, Hinweis).
• Ein Punkt ohne Befund hat die Farbe „kein Befund zur Zeile“.
• Befunde zum ganzen Datensatz statt zu einer Zeile ändern die Farben nicht.
• Zeilen ohne Position erscheinen nicht auf der Karte.`,

  'tip.cleanCsv.does': `Speichert die Tabelle Ihrer Daten in einem einheitlichen CSV-Layout.`,
  'tip.cleanCsv.logic': `• Werte werden genau so übernommen, wie sie in der Datei stehen: Nichts wird umgerechnet oder korrigiert.
• Tabellen im Langformat und verknüpfte Blätter werden auf eine Zeile pro Probe abgeflacht.
• Text, der mit =, +, - oder @ beginnt, erhält ein Apostroph davor, damit eine Tabellenkalkulation ihn nicht als Formel ausführt.
• Die Beschreibung der Spalten steht in der separaten Begleitdatei.`,
  'tip.sidecar.does': `Hält fest, was das Werkzeug über die Spalten herausgefunden hat: Bedeutung, Einheit und woher die Einheit stammt.`,
  'tip.sidecar.logic': `• Eine Zeile pro Spalte: Name in der Datei, Name in der bereinigten CSV, Einheit, Herkunft der Einheit und P01-Code, falls bekannt.
• Sie bewahrt auch Ihre Angabe „eine Fahrt“ auf.
• Legen Sie sie bei der nächsten Prüfung mit den Dateien ab, und die Angabe wird wiederhergestellt.`,
  'tip.iso19139.does': `Schreibt einen Entwurf eines ISO-19139-Metadatensatzes zum Einlesen in GeoNetwork.`,
  'tip.iso19139.logic': `• Eingetragen wird nur, was sich aus den Daten ergibt: räumliche und zeitliche Ausdehnung, Variablen, die in den Metadaten bereits genannte Lizenz und der Titel.
• Felder, die die Daten nicht liefern können (Kontakt, Zitierdatum, Sprache, Themenkategorie), werden nicht erfunden, sondern als fehlend markiert.
• Es ist ein Entwurf zum Vervollständigen im Editor, kein fertiger Datensatz.`,
  'tip.datacite.does': `Schreibt einen Entwurf eines DataCite-Datensatzes (XML) für die Registrierung einer DOI.`,
  'tip.datacite.logic': `• Eingetragen wird nur, was sich aus Daten und Metadaten ergibt: Titel, Ausdehnung, Variablen, Lizenz.
• Autoren, Herausgeber und die DOI werden nicht geraten; sie bleiben als XML-Kommentare stehen.
• Es ist ein Entwurf zum Vervollständigen, kein fertiger Datensatz.`,
  'tip.draft.does': `Liefert aus den Daten berechnete Werte, die Sie in Metadatenfelder kopieren können.`,
  'tip.draft.logic': `• Die zeitliche Ausdehnung und die vier geografischen Grenzen werden aus Ihren Daten berechnet.
• Die Variablenliste trägt Einheiten, aber nur solche, die jemand angegeben hat.
• Lizenz und Titel stammen aus den Metadaten, nicht aus den Daten.
• Die Feldnamen entsprechen den Abschnitten des GeoNetwork-Editors.`,
  'tip.geojson.does': `Speichert die Positionen der Zeilen als GeoJSON-Punkte, zum Öffnen in QGIS oder einem anderen GIS-Programm.`,
  'tip.geojson.logic': `• Ein Punkt pro Zeile mit Position; Koordinaten unverändert, als [Länge, Breite].
• Jeder Punkt trägt Datei, Zeile, Station, Datum und den schwersten Befund seiner Zeile.
• Eine Datei für alle Datensätze.`,

  'tip.licenceInput.does': `Benennt die Beschreibungen eines Datensatzes, die verglichen werden sollen.`,
  'tip.licenceInput.logic': `• Eine Angabe pro Zeile: eine DOI, ein Zenodo- oder PANGAEA-Link, ein Dataverse-Datensatzlink ({dataverse}) oder ein GeoNetwork-Datensatzlink.
• Gelesen werden nur die Metadaten dieser Datensätze, nie die Datendateien.
• Alle Zeilen sollten zu einem Datensatz gehören: mehrere Orte, an denen er beschrieben ist.`,
  'tip.licenceOneDeposit.does': `Zeigt, ob die Quellen dieselbe Lizenz nennen, und zählt die Quellen einer Hinterlegung einmal.`,
  'tip.licenceOneDeposit.logic': `• Eine Hinterlegung ist ein Datensatz im Repositorium samt seinem DataCite-Datensatz (Zenodo, PANGAEA, Dataverse): Sie beschreiben denselben Datensatz und zählen daher als eine Quelle.
• Verglichen werden die Lizenzkennungen der Quellen, nicht ihre Rechtstexte.
• Verschiedene Lizenzen in verschiedenen Quellen sind ein Widerspruch; ein leerer DataCite-Datensatz neben einer anderswo genannten Lizenz ist keiner.`,
  'tip.licenceSpdx.does': `Zeigt, wie das Werkzeug jede Lizenzangabe gelesen hat.`,
  'tip.licenceSpdx.logic': `• Text und Link jeder Angabe werden mit der SPDX-Lizenzliste verglichen.
• Das Ergebnis ist eine SPDX-Kennung oder „nicht erkannt — von Hand prüfen“.
• Das Werkzeug beurteilt nicht die rechtliche Wirkung einer Lizenz und liest keine Lizenztexte.`,
  'tip.licenceDatacite.does': `Weist darauf hin, dass der DOI-Datensatz bei DataCite keine Lizenz hat, obwohl eine andere Quelle eine nennt.`,
  'tip.licenceDatacite.logic': `• DataCite hat ein Feld Rights, es ist aber optional, daher bleiben viele Datensätze ohne Lizenz.
• Die OpenAIRE-Richtlinien für Datenarchive verlangen die Lizenz, wenn sie zutrifft.
• Das allein ist kein Widerspruch: Es hat eine eigene Zeile, die bittet, die Lizenz im DOI-Datensatz zu ergänzen.`,
  'tip.licenceAttribution.does': `Stellt eine Quellenangabe mit der Lizenz zusammen, die Sie einfügen können.`,
  'tip.licenceAttribution.logic': `• Sie entsteht nur aus dem, was die Quellen nennen: Titel, Autoren, Lizenz, Kennung.
• Widersprechen sich die Quellen oder ist die Lizenz nicht erkannt, fehlt die Lizenz, und die Seite sagt warum.
• Der Text ist immer auf Englisch, damit Sie ihn unverändert einfügen können; prüfen Sie ihn zuerst am Datensatz.`,

  'tip.collectionKind.does': `Legt fest, woher das Werkzeug die Metadaten einer ganzen Sammlung liest.`,
  'tip.collectionKind.logic': `• Eine DOI-Liste, ein DataCite-Repositorium oder DOI-Präfix, eine Zenodo-Community oder ein GeoNetwork-Katalog.
• Gelesen werden nur Metadaten, nie Datendateien.
• Das Ergebnis sind Zahlen je Problem, einige Beispiele und eine Korrekturliste als CSV-Datei; Institutionen werden nicht miteinander verglichen.`,
  'tip.collectionDois.does': `Liest die DataCite-Datensätze der aufgelisteten DOIs.`,
  'tip.collectionDois.logic': `• Ihr Browser fragt jede DOI bei DataCite ab.
• Links der Form doi.org/… und doi:… werden angenommen; eine wiederholte DOI wird einmal gelesen.
• Schreiben Sie eine DOI pro Zeile oder trennen Sie sie mit Leerzeichen.`,
  'tip.collectionDatacite.does': `Benennt ein DataCite-Repositorium: über seine Client-Kennung oder über ein DOI-Präfix.`,
  'tip.collectionDatacite.logic': `• Eine Client-Kennung umfasst die Datensätze eines Repositoriums; ein DOI-Präfix alles, was unter diesem Anfang der DOI registriert ist.
• Ihr Browser holt die Liste seitenweise von DataCite.`,
  'tip.collectionZenodo.does': `Liest die Datensätze einer Zenodo-Community, genannt wie in ihrer Adresse.`,
  'tip.collectionZenodo.logic': `• Zenodo begrenzt, wie viele Datensätze und Anfragen ein Gast abrufen darf; eine große Community dauert daher.
• Eine Community, die größer ist als die Suchgrenze, wird in Abschnitten nach Veröffentlichungsdatum gelesen.`,
  'tip.collectionCsw.does': `Liest die Datensätze eines GeoNetwork-Katalogs aus der Liste.`,
  'tip.collectionCsw.logic': `• Verfügbare Kataloge: {catalogues}.
• Die Anfragen laufen über unseren Server, der die Antwort weiterreicht und nichts behält.
• Das Metadatenformat wählen Sie daneben: ISO 19139 oder ISO 19115-3, wo der Katalog beide anbietet.`,
  'tip.collectionCross.does': `Vergleicht die Lizenzen des Katalogs mit denen bei DataCite.`,
  'tip.collectionCross.logic': `• Bei Datensätzen mit DOI fragt Ihr Browser die DOI bei DataCite ab und vergleicht die Lizenzen beider Quellen.
• Jeder solche Datensatz kostet eine weitere Anfrage, der Lauf dauert daher länger.`,
  'tip.collectionRun.does': `Zeigt, wie lange ein Lauf dauern wird, bevor Sie ihn starten, und lässt Sie mit einer Stichprobe beginnen.`,
  'tip.collectionRun.logic': `• Die Schätzung zählt Datensätze und Anfragen; bei großen Sammlungen ist die Zahl der Anfragen nur geschätzt.
• Die schnelle Stichprobe liest nur einen Teil der Sammlung und ist in den Ergebnissen als Stichprobe gekennzeichnet.
• Ein Lauf lässt sich anhalten und fortsetzen; sein Fortschritt bleibt in diesem Browser.`,

  'tip.indexCheck.does': `Prüft Datendateien oder einen Datensatz aus einem Repositorium vor der Veröffentlichung.`,
  'tip.indexCheck.logic': `• Es liest Tabellen (CSV, Excel, Darwin Core) oder einen Datensatz, der per Link oder DOI angegeben ist.
• Es prüft Koordinaten, Daten, Einheiten, Wertebereiche und die Lizenz und nennt jeden Befund in einem einfachen Satz, daneben die technischen Einzelheiten.
• Es ändert nichts an Ihren Daten: Es zeigt, was es gefunden hat, und nennt, was es nicht prüft.`,
  'tip.indexLicence.does': `Vergleicht, was verschiedene Metadatenquellen über die Lizenz eines Datensatzes angeben.`,
  'tip.indexLicence.logic': `• Es liest die Metadaten von Zenodo, PANGAEA, Dataverse, GeoNetwork und DataCite, nicht die Datendateien.
• Es ordnet jede Angabe der SPDX-Lizenzliste zu und sucht Widersprüche.
• Es stellt eine Quellenangabe mit der Lizenz zum Einfügen zusammen.`,
  'tip.indexCollection.does': `Geht die Metadaten einer ganzen Sammlung durch und sammelt Lizenzprobleme und leere Felder.`,
  'tip.indexCollection.logic': `• Es liest nur Metadaten, nie Datendateien.
• Das Ergebnis sind Zahlen je Problem, Beispiele und eine Korrekturliste als CSV-Datei.
• Es vergleicht und reiht keine Institutionen; eine schnelle Stichprobe ist als Stichprobe gekennzeichnet.`,
};

const fr: Record<TipKey, string> = {
  'tip.aria': `Explication : {label}`,
  'tip.does': `Ce que ça fait`,
  'tip.logic': `La logique`,
  'tip.ruleLink': `Détails de la règle →`,
  'tip.roles.feeds': `alimente les règles`,
  'tip.encoding.label': `Encodage du texte`,

  'tip.role.ignore': `la colonne n'est pas interprétée et n'entre dans aucune vérification.`,
  'tip.role.latitude': `la position nord–sud du point.`,
  'tip.role.longitude': `la position est–ouest du point.`,
  'tip.role.datetime': `la date et l'heure dans une même colonne.`,
  'tip.role.date': `la date seule, sans heure.`,
  'tip.role.time': `l'heure seule, associée à la colonne de date.`,
  'tip.role.depth': `la distance sous la surface ; vous indiquez à côté le sens positif et l'unité.`,
  'tip.role.pressure': `la pression de l'eau ; conservée avec son unité dans le fichier d'accompagnement.`,
  'tip.role.station': `le nom ou le numéro d'une station ; regroupe les lignes d'un même lieu.`,
  'tip.role.cruise': `le nom d'une campagne ; sépare les campagnes dans le test de vitesse, à la place de la case d'une seule campagne.`,
  'tip.role.sampleId': `l'identifiant d'un échantillon ou d'une carotte ; sert à retrouver le même échantillon dans deux fichiers.`,
  'tip.role.variable': `une grandeur mesurée ; demande un nom et une unité, et l'outil ne devine jamais l'unité.`,

  'tip.dropZone.does': `Lit des fichiers de votre ordinateur pour les vérifier.`,
  'tip.dropZone.logic': `• Extensions acceptées : {formats}.
• Les fichiers XML et JSON sont lus comme des métadonnées (par exemple ISO 19139 ou DataCite), les autres comme des tableaux de données.
• Un fichier .zip est lu comme une archive Darwin Core (données OBIS ou GBIF).
• Les fichiers restent dans votre navigateur ; rien n'est envoyé.`,
  'tip.linkField.does': `Récupère une notice dans un dépôt à partir de son lien ou de son DOI, et vérifie ses métadonnées et ses fichiers de données.`,
  'tip.linkField.logic': `• Sont reconnus : Zenodo, PANGAEA, GBIF, OBIS, tout DOI (via DataCite), Dataverse ({dataverse}) et GeoNetwork ({geonetwork}).
• Les fichiers ne sont téléchargés que depuis les serveurs de la liste autorisée (voir la page Confidentialité) ; pour les autres, téléchargez le fichier vous-même et déposez-le ci-dessus.
• Un fichier issu d'un lien ne dépasse pas {maxFile}, une archive d'un serveur IPT {maxArchive}.`,
  'tip.downloadMode.does': `Choisit qui télécharge les fichiers derrière un lien : votre navigateur ou notre serveur.`,
  'tip.downloadMode.logic': `• Navigateur : les fichiers vont directement du serveur de données à vous ; certains serveurs ne l'autorisent pas.
• Serveur Abyssal Claims : télécharge le fichier pour vous depuis les serveurs de la liste autorisée, {maxFile} au plus, et ne conserve rien.
• Les fichiers déposés ici ne quittent jamais votre ordinateur, quel que soit le mode.`,

  'tip.layout.does': `Montre comment l'outil a compris la structure du fichier et vous permet de la corriger.`,
  'tip.layout.logic': `• Un seul tableau : une ligne est un échantillon.
• Format long : une ligne est une mesure ; l'outil en fait une ligne par échantillon.
• Deux feuilles : les mesures sont reliées aux positions et aux dates par une colonne clé.
• Une disposition illisible n'est pas devinée : elle est signalée, et les autres tableaux sont quand même vérifiés.`,
  'tip.roles.does': `Indique à l'outil ce qu'est chaque colonne ; cela décide des vérifications qui la couvrent.`,
  'tip.roles.logic': `Une unité n'est jamais devinée : une colonne sans unité indiquée reste sans unité.
{roles}`,
  'tip.encoding.does': `Indique l'encodage de caractères avec lequel le fichier a été lu ; il décide si les lettres accentuées et les autres caractères spéciaux sortent correctement.`,
  'tip.encoding.logic': `• UTF-8 est essayé en premier (avec ou sans BOM).
• Si le fichier n'est pas de l'UTF-8 valide, l'outil devine un encodage plus ancien (windows-1250 ou ISO-8859-2) et le signale.
• Si des caractères semblent faux, enregistrez le fichier en UTF-8 et rechargez-le.`,
  'tip.singleCruise.does': `Active un test : le navire a-t-il pu naviguer entre des stations consécutives ?`,
  'tip.singleCruise.logic': `• avertissement si le navire devrait filer à plus de {extreme} des deux côtés d'une station ({extremeSrc})
• remarque au-delà de {unusual} ({unusualSrc})
• les stations plus proches que {minSeparation} comptent pour un seul lieu et sont ignorées
• une date sans heure compte pour l'écart le plus long possible`,

  'tip.severities.does': `Explique les trois niveaux de constats du rapport et ce que chacun signifie avant de publier les données.`,
  'tip.severities.logic': `• Erreur : les données sont contradictoires, impossibles ou illisibles (par exemple une latitude hors limites, ou pas de licence) ; à corriger avant publication.
• Avertissement : cela se révèle le plus souvent être une erreur ; vérifiez et corrigez, ou soyez prêt à l'expliquer.
• Remarque : une information à examiner ; souvent aucun changement n'est nécessaire.
Aucun constat signifie seulement qu'aucun problème n'a été trouvé dans les catégories vérifiées.`,
  'tip.notChecked.does': `Énumère ce que l'outil n'a pas vérifié lors de cette exécution.`,
  'tip.notChecked.logic': `• La liste est toujours affichée, même quand rien n'a été trouvé.
• Certaines entrées dépendent de vos choix : la vitesse du navire, par exemple, n'est vérifiée que si vous cochez la case d'une seule campagne ou indiquez une colonne de campagne.
• L'absence de constats dans le rapport ne dit rien des points de cette liste.`,
  'tip.mapLegend.does': `Explique les couleurs des points de la carte d'aperçu.`,
  'tip.mapLegend.logic': `• Un point prend la couleur du constat le plus grave de sa ligne (erreur, avertissement, remarque).
• Un point sans constat a la couleur « aucun constat sur la ligne ».
• Les constats portant sur tout le jeu de données plutôt que sur une ligne ne changent pas les couleurs.
• Les lignes sans position ne figurent pas sur la carte.`,

  'tip.cleanCsv.does': `Enregistre le tableau de vos données dans une disposition CSV uniforme.`,
  'tip.cleanCsv.logic': `• Les valeurs sont recopiées telles qu'elles sont écrites dans le fichier : rien n'est converti ni corrigé.
• Les tableaux au format long et les feuilles reliées sont aplatis en une ligne par échantillon.
• Un texte qui commence par =, +, - ou @ reçoit une apostrophe devant, pour qu'un tableur ne l'exécute pas comme une formule.
• La description des colonnes se trouve dans le fichier d'accompagnement séparé.`,
  'tip.sidecar.does': `Consigne ce que l'outil a établi sur les colonnes : leur sens, leur unité et l'origine de l'unité.`,
  'tip.sidecar.logic': `• Une ligne par colonne : le nom dans le fichier, le nom dans le CSV nettoyé, l'unité, l'origine de l'unité et le code P01 s'il est connu.
• Il conserve aussi votre déclaration d'une seule campagne.
• Déposez-le avec les fichiers à la vérification suivante et la déclaration est rétablie.`,
  'tip.iso19139.does': `Écrit un brouillon de notice de métadonnées ISO 19139 à charger dans GeoNetwork.`,
  'tip.iso19139.logic': `• Il ne remplit que ce qui découle des données : l'étendue géographique et temporelle, les variables, la licence déjà indiquée dans les métadonnées et le titre.
• Les champs que les données ne peuvent pas fournir (contact, date de citation, langue, catégorie thématique) ne sont pas inventés : ils sont marqués comme manquants.
• C'est un brouillon à compléter dans l'éditeur, pas une notice terminée.`,
  'tip.datacite.does': `Écrit un brouillon de notice DataCite (XML) pour l'enregistrement d'un DOI.`,
  'tip.datacite.logic': `• Il ne remplit que ce qui découle des données et des métadonnées : titre, étendue, variables, licence.
• Les auteurs, l'éditeur et le DOI ne sont pas devinés ; ils restent sous forme de commentaires XML.
• C'est un brouillon à compléter, pas une notice terminée.`,
  'tip.draft.does': `Donne des valeurs calculées à partir des données, que vous pouvez copier dans des champs de métadonnées.`,
  'tip.draft.logic': `• L'étendue temporelle et les quatre limites géographiques sont calculées à partir de vos données.
• La liste des variables porte des unités, mais seulement celles que quelqu'un a indiquées.
• La licence et le titre viennent des métadonnées, pas des données.
• Les noms des champs correspondent aux sections de l'éditeur GeoNetwork.`,
  'tip.geojson.does': `Enregistre les positions des lignes sous forme de points GeoJSON, à ouvrir dans QGIS ou un autre logiciel SIG.`,
  'tip.geojson.logic': `• Un point par ligne qui a une position ; coordonnées inchangées, sous la forme [longitude, latitude].
• Chaque point porte son fichier, sa ligne, sa station, sa date et le constat le plus grave de sa ligne.
• Un seul fichier pour tous les jeux de données.`,

  'tip.licenceInput.does': `Désigne les descriptions d'un même jeu de données à comparer.`,
  'tip.licenceInput.logic': `• Une référence par ligne : un DOI, un lien Zenodo ou PANGAEA, un lien de jeu de données Dataverse ({dataverse}) ou un lien de notice GeoNetwork.
• Seules les métadonnées de ces notices sont lues, jamais les fichiers de données.
• Toutes les lignes doivent concerner un seul jeu de données : plusieurs endroits où il est décrit.`,
  'tip.licenceOneDeposit.does': `Montre si les sources indiquent la même licence, et compte une seule fois les sources d'un même dépôt.`,
  'tip.licenceOneDeposit.logic': `• Un dépôt, c'est une notice d'un dépôt de données avec sa notice DataCite (Zenodo, PANGAEA, Dataverse) : elles décrivent le même jeu de données et comptent donc pour une seule source.
• Ce qui est comparé, ce sont les identifiants de licence indiqués par les sources, pas leurs textes juridiques.
• Des licences différentes dans des sources différentes sont une contradiction ; une notice DataCite vide à côté d'une licence indiquée ailleurs n'en est pas une.`,
  'tip.licenceSpdx.does': `Montre comment l'outil a lu chaque mention de licence.`,
  'tip.licenceSpdx.logic': `• Le texte et le lien de chaque mention sont comparés à la liste de licences SPDX.
• Le résultat est un identifiant SPDX, ou « non reconnue — à vérifier à la main ».
• L'outil ne juge pas l'effet juridique d'une licence et ne lit pas les textes de licence.`,
  'tip.licenceDatacite.does': `Signale que la notice du DOI chez DataCite n'a pas de licence, alors qu'une autre source en indique une.`,
  'tip.licenceDatacite.logic': `• DataCite a un champ Rights, mais il est facultatif, si bien que beaucoup de notices restent sans licence.
• Les lignes directrices d'OpenAIRE pour les archives de données demandent la licence quand elle s'applique.
• Cela ne constitue pas à soi seul une contradiction : la ligne a sa propre remarque, qui demande d'ajouter la licence à la notice du DOI.`,
  'tip.licenceAttribution.does': `Compose un texte d'attribution avec la licence, que vous pouvez coller.`,
  'tip.licenceAttribution.logic': `• Il est construit uniquement à partir de ce que disent les sources : titre, auteurs, licence, identifiant.
• Quand les sources se contredisent ou que la licence n'est pas reconnue, la licence est omise et la page dit pourquoi.
• Le texte est toujours en anglais, pour que vous puissiez le coller tel quel ; comparez-le d'abord à la notice.`,

  'tip.collectionKind.does': `Choisit d'où l'outil lit les métadonnées d'une collection entière.`,
  'tip.collectionKind.logic': `• Une liste de DOI, un dépôt ou un préfixe DOI de DataCite, une communauté Zenodo ou un catalogue GeoNetwork.
• Seules les métadonnées sont lues, jamais les fichiers de données.
• Le résultat : des comptes par problème, quelques exemples de chacun et une liste de corrections en fichier CSV ; les institutions ne sont pas comparées entre elles.`,
  'tip.collectionDois.does': `Lit les notices DataCite des DOI que vous énumérez.`,
  'tip.collectionDois.logic': `• Votre navigateur interroge DataCite pour chaque DOI.
• Les liens de la forme doi.org/… et doi:… sont acceptés ; un DOI répété n'est lu qu'une fois.
• Mettez un DOI par ligne, ou séparez-les par des espaces.`,
  'tip.collectionDatacite.does': `Désigne un dépôt DataCite : par son identifiant client ou par un préfixe DOI.`,
  'tip.collectionDatacite.logic': `• Un identifiant client couvre les notices d'un dépôt ; un préfixe DOI couvre tout ce qui est enregistré sous ce début de DOI.
• Votre navigateur demande la liste à DataCite page par page.`,
  'tip.collectionZenodo.does': `Lit les notices d'une communauté Zenodo, désignée comme dans son adresse.`,
  'tip.collectionZenodo.logic': `• Zenodo limite le nombre de notices et de requêtes qu'un invité peut lire, donc une grande communauté prend du temps.
• Une communauté plus grande que la limite de recherche est lue par tranches, découpées selon la date de publication.`,
  'tip.collectionCsw.does': `Lit les notices d'un catalogue GeoNetwork de la liste.`,
  'tip.collectionCsw.logic': `• Catalogues disponibles : {catalogues}.
• Les requêtes passent par notre serveur, qui transmet la réponse et ne garde rien.
• Vous choisissez le format de métadonnées à côté : ISO 19139 ou ISO 19115-3, quand le catalogue propose les deux.`,
  'tip.collectionCross.does': `Compare les licences du catalogue avec celles de DataCite.`,
  'tip.collectionCross.logic': `• Pour les notices qui indiquent un DOI, votre navigateur interroge DataCite pour ce DOI et compare les licences des deux sources.
• Chaque notice de ce type coûte une requête de plus, donc l'exécution dure plus longtemps.`,
  'tip.collectionRun.does': `Montre combien de temps durera une exécution avant que vous la lanciez, et permet de commencer par un échantillon.`,
  'tip.collectionRun.logic': `• L'estimation compte les notices et les requêtes ; pour les grandes collections, le nombre de requêtes n'est qu'une approximation.
• L'échantillon rapide ne lit qu'une partie de la collection et est signalé comme échantillon dans les résultats.
• Une exécution peut être interrompue puis reprise ; sa progression reste dans ce navigateur.`,

  'tip.indexCheck.does': `Vérifie des fichiers de données, ou une notice d'un dépôt, avant leur publication.`,
  'tip.indexCheck.logic': `• Il lit des tableaux (CSV, Excel, Darwin Core) ou une notice donnée par un lien ou un DOI.
• Il vérifie les coordonnées, les dates, les unités, les plages de valeurs et la licence, et énonce chaque constat en une phrase simple, avec le détail technique à côté.
• Il ne modifie rien dans vos données : il montre ce qu'il a trouvé et énumère ce qu'il ne vérifie pas.`,
  'tip.indexLicence.does': `Compare ce que différentes sources de métadonnées indiquent sur la licence d'un jeu de données.`,
  'tip.indexLicence.logic': `• Il lit les métadonnées de Zenodo, PANGAEA, Dataverse, GeoNetwork et DataCite, pas les fichiers de données.
• Il classe chaque mention selon la liste de licences SPDX et cherche les contradictions.
• Il compose un texte d'attribution avec la licence, à coller.`,
  'tip.indexCollection.does': `Parcourt les métadonnées d'une collection entière et rassemble les problèmes de licence et les champs vides.`,
  'tip.indexCollection.logic': `• Il ne lit que des métadonnées, jamais des fichiers de données.
• Le résultat : des comptes par problème, des exemples et une liste de corrections en fichier CSV.
• Il ne compare ni ne classe les institutions ; un échantillon rapide est signalé comme échantillon.`,
};

export const TIP_TEXTS: Record<'en' | 'pl' | 'de' | 'fr', Record<TipKey, string>> = { en, pl, de, fr };
export { en as tipEn, pl as tipPl, de as tipDe, fr as tipFr };

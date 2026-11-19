// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Licence rules (category 'A'), emitted by checkLicence() (Task 7). `file` = the record label.
 * Declared params per rule:
 *   LIC-MISSING               dataciteCompared (optional, 'no' only: the catalogue record states no licence and the DataCite comparison could not be made)
 *   LIC-FREE-TEXT             text, versionMissing, kind, hint   text = the licence text found; versionMissing = 'yes' | 'no';
 *                                                    kind = 'id' (a licence with its version was read from the text: hint = its SPDX id) | 'family' (a licence
 *                                                    without a version: hint = that licence's own family, e.g. "CC BY-NC") | 'arr' ("All rights reserved") |
 *                                                    'oa' (a bare "Open Access") | 'none' (nothing recognised); hint is '' for the last three.
 *                                                    Never a licence the publisher did not name: `plain` is the sentence for 'none', `plainVariants` the others
 *   LIC-TEXT-URI-CONFLICT     text, uri, textLicence, uriLicence   one statement WITH a link whose text and link classify differently, or whose text names no
                                                    licence and is not just "Open Access" (then textLicence = '—')
 *                                                    (incl. a link no SPDX id exists for); textLicence/uriLicence = SPDX id or '—'
 *   LIC-ADDED-CONDITIONS      text, textLicence, rest   the text names a licence and what is left of it after the licence name and the
 *                                                    neutral wording are removed contains a restriction marker; textLicence = the
 *                                                    SPDX id, or the text itself when no id could be read; rest = that leftover
 *   LIC-EXTRA-TEXT            text, rest             the text names a licence and says something else (no restriction marker in it);
 *                                                    rest = exactly that something else, as written
 *   LIC-OTHER-RIGHTS-ENTRY    licence, text          a repeated rights entry (DataCite rightsList, Zenodo rights[]) that is no recognised licence and no plain access value / holder-only notice
 *                                                    (text = what it says, or its link), next to the recognised licence {licence} (name and id) of the same record; once per record; never ISO fields
 *   LIC-SEPARATE-RESTRICTION  licence, licenceField, text   a restriction written in a field of its own (ISO otherConstraints / useLimitation, Dataverse termsOfUse) next to the recognised
 *                                                    licence {licence} (name and id) of the same source, which narrows it: access for partners or a project only, non-commercial, no
 *                                                    derivatives, on request only, contact first; licenceField = the field the licence is in; field = the field(s) the restriction is in (comma-separated when
 *                                                    the same sentence stands in several); text = the restriction as written; one per restriction; never a repeated rights entry (LIC-OTHER-RIGHTS-ENTRY) or a restriction code (LIC-RESTRICTION-CONFLICT)
 *   LIC-AMBIGUOUS             text, readings         one statement WITHOUT a link that reads as more than one licence (rights text against
 *                                                    identifier, "CC BY 4.0 (CC BY-NC)", a recognised name next to one that is not);
 *                                                    readings = what it reads as, separated by " / " ("—" = a name no SPDX id exists for)
 *   LIC-RESTRICTION-CONFLICT  codes, licence         codes = restrictive MD_RestrictionCode values, comma-separated;
 *                                                    licence = the open licence: the recognised SPDX id, or the open family as written ("CC BY") for a
 *                                                    statement that is not recognised; NC/ND never count
 *   LIC-DATACITE-EMPTY        licence                the licence another record states; "—" = no other record states one (or the main record could not be read)
 *   LIC-MISMATCH              licenceA, licenceB     the two different SPDX ids
 *   LIC-SEVERAL-LICENCES      licences, fields       two or more DIFFERENT recognised licences (SPDX ids, comma-separated) in the repeated entries of one record (DataCite rightsList, Zenodo
 *                                                    licence next to rights[]); fields = where they stand; one per set of licences; the same licence as identifier, link and name is one licence;
 *                                                    never per-file Dataverse licences, ISO metadata constraints, or different licences in non-repeated fields (LIC-MISMATCH)
 *   LIC-OBIS-LICENCE          licence, accepts, kind information only: the one recognised licence of the dataset (SPDX id) against accepts (the list /convert takes, comma-separated);
 *                                                    kind = 'accepted' | 'not-accepted'; never when no or several licences are recognised; not in the collection review
 *   LIC-FILES-HELD-BACK       files                  files of a Dataverse dataset under restricted access or an embargo (names)
 */
/** Appended to LIC-ADDED-CONDITIONS / LIC-EXTRA-TEXT when another string of the statement (identifier, Zenodo title) leaves something too (param otherRest). */
const OTHER_REST: Record<'pl' | 'en' | 'de' | 'fr', string> = {
  pl: `Inny zapis tego samego stwierdzenia (identyfikator lub tytuł) zostawia też: „{otherRest}”.`,
  en: `Another string of the same statement (the identifier or the title) also leaves: "{otherRest}".`,
  de: `Eine weitere Angabe derselben Aussage (Kennung oder Titel) lässt ebenfalls übrig: „{otherRest}“.`,
  fr: `Une autre chaîne de la même mention (identifiant ou titre) laisse aussi : « {otherRest} ».`,
};

export const LICENCE_RULES: readonly RuleSpec[] = [
  {
    id: 'LIC-MISSING',
    category: 'A',
    severity: 'error',
    exportPolicy: 'show',
    citations: [CITE.inspireValues, CITE.inspireNoConditions, CITE.fairLicence, CITE.openaireRecommends],
    // `dataciteCompared` ('no') is an optional marker read by renderPlain (plainDataciteNotCompared) and is deliberately not a declared
    // template param: /check never sets it, and the technical line has no place for it.
    params: [],
    plain: {
      pl: `W metadanych nie znaleziono licencji. Podaj licencję, którą wybrali autorzy: jej nazwę z wersją i odnośnik do oficjalnego tekstu.`,
      en: `No licence was found in the metadata. State the licence the authors chose: its name with its version and a link to its official text.`,
      de: `In den Metadaten wurde keine Lizenz gefunden. Geben Sie die Lizenz an, die die Autoren gewählt haben: ihren Namen mit Version und einen Link auf ihren offiziellen Text.`,
      fr: `Aucune licence n'a été trouvée dans les métadonnées. Indiquez la licence choisie par les auteurs : son nom avec sa version et un lien vers son texte officiel.`,
    },
    plainDataciteNotCompared: {
      pl: `W metadanych nie znaleziono licencji. Podaj licencję, którą wybrali autorzy: jej nazwę z wersją i odnośnik do oficjalnego tekstu. Uwaga: rekordu DOI w DataCite nie udało się porównać, więc to ustalenie opiera się tylko na rekordzie z katalogu.`,
      en: `No licence was found in the metadata. State the licence the authors chose: its name with its version and a link to its official text. Note: the DOI record at DataCite could not be compared, so this finding rests on the catalogue record alone.`,
      de: `In den Metadaten wurde keine Lizenz gefunden. Geben Sie die Lizenz an, die die Autoren gewählt haben: ihren Namen mit Version und einen Link auf ihren offiziellen Text. Hinweis: Der DOI-Eintrag bei DataCite konnte nicht verglichen werden, dieser Befund beruht daher nur auf dem Katalogeintrag.`,
      fr: `Aucune licence n'a été trouvée dans les métadonnées. Indiquez la licence choisie par les auteurs : son nom avec sa version et un lien vers son texte officiel. Remarque : la notice du DOI chez DataCite n'a pas pu être comparée ; ce constat repose donc sur la seule notice du catalogue.`,
    },
    technical: `{file}: no licence statement (useLimitation, otherConstraints, rightsList, license) in any record.`,
  },
  {
    id: 'LIC-FREE-TEXT',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.fairFindable, CITE.dataciteTitle, CITE.dataciteIdentifier, CITE.dataciteUri, CITE.inspireLink, CITE.spdxList],
    params: ['text', 'versionMissing', 'kind', 'hint'],
    plain: {
      pl: `Licencja jest zapisana tylko jako zwykły tekst („{text}”), którego programy nie odczytają. Podaj identyfikator licencji, którą wybrali autorzy, i odnośnik do jej oficjalnego tekstu.`,
      en: `The licence is written only as free text ("{text}"), which programs cannot read. State the licence the authors chose by its identifier and a link to its official text.`,
      de: `Die Lizenz steht nur als Freitext („{text}“), den Programme nicht lesen können. Geben Sie die von den Autoren gewählte Lizenz mit ihrer Kennung und einem Link auf ihren offiziellen Text an.`,
      fr: `La licence n'est écrite qu'en texte libre (« {text} »), que les programmes ne peuvent pas lire. Indiquez la licence choisie par les auteurs par son identifiant et un lien vers son texte officiel.`,
    },
    plainVariants: {
      id: {
        pl: `Licencja jest zapisana tylko jako zwykły tekst („{text}”), którego programy nie odczytają. Podaj jej identyfikator ({hint}) i odnośnik do jej oficjalnego tekstu.`,
        en: `The licence is written only as free text ("{text}"), which programs cannot read. State it by its identifier ({hint}) and a link to its official text.`,
        de: `Die Lizenz steht nur als Freitext („{text}“), den Programme nicht lesen können. Geben Sie sie mit ihrer Kennung ({hint}) und einem Link auf ihren offiziellen Text an.`,
        fr: `La licence n'est écrite qu'en texte libre (« {text} »), que les programmes ne peuvent pas lire. Indiquez-la par son identifiant ({hint}) et un lien vers son texte officiel.`,
      },
      family: {
        pl: `Licencja jest zapisana tylko jako zwykły tekst („{text}”), którego programy nie odczytają, i bez wersji. Podaj dokładny identyfikator tej licencji ({hint} wraz z wersją, którą wybrali autorzy) i odnośnik do jej oficjalnego tekstu.`,
        en: `The licence is written only as free text ("{text}"), which programs cannot read, and without a version. State the exact identifier of this licence ({hint} with the version the authors chose) and a link to its official text.`,
        de: `Die Lizenz steht nur als Freitext („{text}“), den Programme nicht lesen können, und ohne Version. Geben Sie die genaue Kennung dieser Lizenz ({hint} mit der von den Autoren gewählten Version) und einen Link auf ihren offiziellen Text an.`,
        fr: `La licence n'est écrite qu'en texte libre (« {text} »), que les programmes ne peuvent pas lire, et sans version. Indiquez l'identifiant exact de cette licence ({hint} avec la version choisie par les auteurs) et un lien vers son texte officiel.`,
      },
      arr: {
        pl: `Dane mają zapisane „{text}”. To świadomy wybór autorów, a nie błąd: oznacza, że dane nie mogą być ponownie wykorzystane bez ich zgody. Jeśli autorzy chcą pozwolić na ponowne wykorzystanie, powinni podać licencję wraz z odnośnikiem do jej oficjalnego tekstu.`,
        en: `The data carry the statement "{text}". This is a deliberate choice by the authors, not a defect: it means the data cannot be reused without their permission. If the authors want to allow reuse, they should state a licence with a link to its official text.`,
        de: `Die Daten tragen den Vermerk „{text}“. Das ist eine bewusste Entscheidung der Autoren und kein Fehler: Die Daten dürfen ohne ihre Erlaubnis nicht weiterverwendet werden. Wenn die Autoren eine Weiterverwendung erlauben wollen, sollten sie eine Lizenz mit einem Link auf ihren offiziellen Text angeben.`,
        fr: `Les données portent la mention « {text} ». C'est un choix délibéré des auteurs, et non un défaut : les données ne peuvent pas être réutilisées sans leur autorisation. Si les auteurs veulent autoriser la réutilisation, ils doivent indiquer une licence avec un lien vers son texte officiel.`,
      },
      oa: {
        pl: `Zapis „{text}” mówi, jak można dotrzeć do danych, a nie na jakich warunkach wolno ich używać. Podaj licencję, którą wybrali autorzy, jej identyfikator i odnośnik do oficjalnego tekstu.`,
        en: `The statement "{text}" says how the data can be reached, not under which terms they may be used. State the licence the authors chose, by its identifier and a link to its official text.`,
        de: `Die Angabe „{text}“ sagt, wie man an die Daten gelangt, nicht unter welchen Bedingungen sie genutzt werden dürfen. Geben Sie die von den Autoren gewählte Lizenz mit ihrer Kennung und einem Link auf ihren offiziellen Text an.`,
        fr: `La mention « {text} » dit comment accéder aux données, et non à quelles conditions on peut les utiliser. Indiquez la licence choisie par les auteurs, par son identifiant et un lien vers son texte officiel.`,
      },
    },
    technical: `{file} field {field}: licence given as free text '{text}' (version missing: {versionMissing}; kind: {kind}); no recognised SPDX id or licence URI.`,
    technicalVariants: {
      id: `{file} field {field}: licence given as free text '{text}' (version missing: {versionMissing}; kind: {kind}); no recognised SPDX id or licence URI. Identifier read from the text: {hint}.`,
      family: `{file} field {field}: licence given as free text '{text}' (version missing: {versionMissing}; kind: {kind}); no recognised SPDX id or licence URI. Family read from the text (no version): {hint}.`,
    },
  },
  {
    id: 'LIC-TEXT-URI-CONFLICT',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.dataciteTitle, CITE.dataciteUri, CITE.ccNameAndLink],
    params: ['text', 'uri', 'textLicence', 'uriLicence'],
    plain: {
      pl: `Tekst licencji („{text}”) i odnośnik wskazują różne licencje, odnośnika nie da się rozpoznać albo tekst nie wymienia tej licencji i mówi coś innego. Z tekstu: {textLicence}; z odnośnika: {uriLicence} („—” = nie rozpoznano). Sprawdź ręcznie i podaj jedną licencję z jej odnośnikiem.`,
      en: `The licence text ("{text}") and its link point to different licences, the link is not recognised, or the text does not name this licence and says something else. From the text: {textLicence}; from the link: {uriLicence} ("—" = not recognised). Check by hand and state one licence with its own link.`,
      de: `Lizenztext („{text}“) und Link nennen unterschiedliche Lizenzen, der Link ist nicht erkennbar, oder der Text nennt diese Lizenz nicht und sagt etwas anderes. Aus dem Text: {textLicence}; aus dem Link: {uriLicence} („—“ = nicht erkannt). Von Hand prüfen und eine Lizenz mit eigenem Link angeben.`,
      fr: `Le texte de la licence (« {text} ») et son lien désignent des licences différentes, le lien n'est pas reconnu, ou le texte ne nomme pas cette licence et dit autre chose. Texte : {textLicence} ; lien : {uriLicence} (« — » = non reconnu). Vérifiez à la main et indiquez une seule licence avec son lien.`,
    },
    technical: `{file} field {field}: text '{text}' reads as {textLicence}, link '{uri}' as {uriLicence}; the statement is not classified (text and link differ, the link is not recognised, or the text names no licence and says something else). Check manually.`,
  },
  {
    id: 'LIC-ADDED-CONDITIONS',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.ccModified],
    params: ['text', 'textLicence', 'rest'],
    plain: {
      pl: `Tekst („{text}”) wymienia licencję {textLicence}, ale dodaje do niej warunki („{rest}”), więc w takim brzmieniu nie jest to już ta standardowa licencja. Sprawdź to ręcznie i podaj wyraźnie licencję oraz ewentualne dodatkowe warunki.`,
      en: `The text ("{text}") names the licence {textLicence} but adds conditions to it ("{rest}"), so as written it is no longer that standard licence. Check it by hand and state the licence and any extra conditions clearly.`,
      de: `Der Text („{text}“) nennt die Lizenz {textLicence}, fügt ihr aber Bedingungen hinzu („{rest}“); so geschrieben ist es nicht mehr diese Standardlizenz. Prüfen Sie das von Hand und geben Sie die Lizenz und etwaige zusätzliche Bedingungen klar an.`,
      fr: `Le texte (« {text} ») nomme la licence {textLicence} mais y ajoute des conditions (« {rest} ») ; tel qu'il est écrit, ce n'est plus cette licence standard. Vérifiez-le à la main et indiquez clairement la licence et les éventuelles conditions supplémentaires.`,
    },
    plainOtherRest: OTHER_REST,
    technical: `{file} field {field}: text '{text}' names {textLicence} but the rest '{rest}' adds or negates conditions; the statement is not classified as that licence. Check manually.`,
  },
  {
    id: 'LIC-EXTRA-TEXT',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.ccModified],
    params: ['text', 'rest'],
    plain: {
      pl: `Tekst („{text}”) zawiera oprócz nazwy licencji jeszcze inną treść („{rest}”). Sprawdź ręcznie, czy zmienia ona licencję; dopóki tego nie wiadomo, nie traktuj tego jako standardowej licencji.`,
      en: `The text ("{text}") contains something besides the licence name ("{rest}"). Check by hand whether it changes the licence; until that is clear, do not treat this as the standard licence.`,
      de: `Der Text („{text}“) enthält neben dem Lizenznamen noch weiteren Inhalt („{rest}“). Prüfen Sie von Hand, ob er die Lizenz verändert; solange das nicht geklärt ist, behandeln Sie dies nicht als die Standardlizenz.`,
      fr: `Le texte (« {text} ») contient autre chose que le nom de la licence (« {rest} »). Vérifiez à la main si cela change la licence ; tant que ce n'est pas clair, ne le traitez pas comme la licence standard.`,
    },
    plainOtherRest: OTHER_REST,
    technical: `{file} field {field}: text '{text}' contains '{rest}' besides the licence name; the statement is not classified. Check manually whether it changes the licence.`,
  },
  {
    id: 'LIC-OTHER-RIGHTS-ENTRY',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.ccModified],
    params: ['licence', 'text'],
    plain: {
      pl: `Obok licencji {licence} inny wpis o prawach mówi: „{text}”. Sprawdź, czy ogranicza on licencję albo ją zmienia.`,
      en: `Next to the licence {licence}, another rights entry says: "{text}". Check whether it restricts or changes the licence.`,
      de: `Neben der Lizenz {licence} sagt ein weiterer Rechteeintrag: „{text}“. Prüfen Sie, ob er die Lizenz einschränkt oder verändert.`,
      fr: `À côté de la licence {licence}, une autre mention de droits indique : « {text} ». Vérifiez si elle restreint ou modifie la licence.`,
    },
    technical: `{file} field {field}: a rights entry '{text}' is no recognised licence and no plain access value, next to the recognised licence {licence}. Check manually whether it restricts or changes the licence.`,
  },
  {
    id: 'LIC-SEPARATE-RESTRICTION',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.ccModified],
    params: ['licence', 'licenceField', 'text'],
    plain: {
      pl: `Pole licencji ({licenceField}) podaje {licence}, ale osobne pole ({field}) ogranicza użycie: „{text}”. Licencja i takie ograniczenie nie dają się pogodzić. Sprawdź, co obowiązuje, i zostaw jedno z nich.`,
      en: `The licence field ({licenceField}) gives {licence}, but a separate field ({field}) restricts use: "{text}". The licence and such a restriction do not fit together. Check which one applies and keep only that one.`,
      de: `Das Lizenzfeld ({licenceField}) nennt {licence}, aber ein eigenes Feld ({field}) schränkt die Nutzung ein: „{text}“. Die Lizenz und eine solche Einschränkung passen nicht zusammen. Prüfen Sie, was gilt, und behalten Sie nur eines davon.`,
      fr: `Le champ de licence ({licenceField}) indique {licence}, mais un champ distinct ({field}) restreint l'usage : « {text} ». La licence et une telle restriction ne vont pas ensemble. Vérifiez laquelle s'applique et n'en gardez qu'une.`,
    },
    technical: `{file} field {field}: '{text}' narrows the licence {licence} stated in field {licenceField} (access limited, non-commercial, no derivatives, on request or contact first). Check manually which one applies.`,
  },
  {
    id: 'LIC-AMBIGUOUS',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.dataciteTitle, CITE.dataciteIdentifier],
    params: ['text', 'readings'],
    plain: {
      pl: `Stwierdzenie o licencji („{text}”) można odczytać jako więcej niż jedną licencję ({readings}; „—” = nazwa, dla której nie ma identyfikatora), więc nie da się go przypisać do jednej licencji. Sprawdź to ręcznie i podaj jedną licencję.`,
      en: `The licence statement ("{text}") can be read as more than one licence ({readings}; "—" = a name no identifier exists for), so it cannot be assigned to one licence. Check it by hand and state one licence.`,
      de: `Die Lizenzangabe („{text}“) lässt sich als mehr als eine Lizenz lesen ({readings}; „—“ = ein Name, für den es keine Kennung gibt) und kann daher keiner einzelnen Lizenz zugeordnet werden. Prüfen Sie das von Hand und geben Sie eine Lizenz an.`,
      fr: `La mention de licence (« {text} ») peut se lire comme plus d'une licence ({readings} ; « — » = un nom sans identifiant) et ne peut donc pas être rattachée à une seule licence. Vérifiez-la à la main et indiquez une seule licence.`,
    },
    technical: `{file} field {field}: statement '{text}' reads as {readings}; it is not classified as one licence. Check manually.`,
  },
  {
    id: 'LIC-RESTRICTION-CONFLICT',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.inspireOtherRestrictions, CITE.inspireOtherConstraints, CITE.isoRestricted, CITE.ccCopyright],
    params: ['codes', 'licence'],
    plain: {
      pl: `Metadane podają otwartą licencję ({licence}) razem z kodem ograniczenia {codes}. INSPIRE oczekuje kodu „otherRestrictions” z opisem warunków; sprawdź, czy {codes} ma oznaczać prawdziwe ograniczenie, a jeśli nie, zastąp go.`,
      en: `The metadata names an open licence ({licence}) together with the restriction code {codes}. INSPIRE expects the code "otherRestrictions" with a description of the conditions; check whether {codes} is meant as a real restriction and, if not, replace it.`,
      de: `Die Metadaten nennen eine offene Lizenz ({licence}) zusammen mit dem Einschränkungscode {codes}. INSPIRE erwartet den Code „otherRestrictions“ mit einer Beschreibung der Bedingungen; prüfen Sie, ob {codes} eine echte Einschränkung bedeuten soll, und ersetzen Sie ihn andernfalls.`,
      fr: `Les métadonnées indiquent une licence ouverte ({licence}) avec le code de restriction {codes}. INSPIRE attend le code « otherRestrictions » avec une description des conditions ; vérifiez si {codes} doit être une vraie restriction et, sinon, remplacez-le.`,
    },
    technical: `{file}: restriction code(s) {codes} (MD_RestrictionCode) together with the open licence statement '{licence}'; INSPIRE TG Req. C.18 expects otherRestrictions plus otherConstraints describing the conditions. Check whether the code is a real restriction.`,
  },
  {
    id: 'LIC-FILES-HELD-BACK',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    params: ['files'],
    plain: {
      pl: `Część plików tego zbioru ma ograniczony dostęp lub jest objęta embargiem: {files}. O dostępie do nich decyduje repozytorium, nie licencja z metadanych, więc ocena licencji dotyczy tylko plików otwartych. Jeśli to dane, napisz w opisie, na jakich warunkach można je dostać.`,
      en: `Some files of this dataset are restricted or under embargo: {files}. Access to them is decided by the repository, not by the licence in the metadata, so the licence verdict covers only the open files. If these are the data, state in the description how they can be obtained.`,
      de: `Einige Dateien dieses Datensatzes sind zugangsbeschränkt oder unter Embargo: {files}. Über den Zugang entscheidet das Repositorium, nicht die Lizenz in den Metadaten; die Lizenzbewertung gilt daher nur für die offenen Dateien. Wenn es die Daten sind, geben Sie in der Beschreibung an, wie man sie erhält.`,
      fr: `Certains fichiers de ce jeu de données sont en accès restreint ou sous embargo : {files}. L'accès est décidé par le dépôt, non par la licence des métadonnées ; l'évaluation de la licence ne porte donc que sur les fichiers ouverts. S'il s'agit des données, indiquez dans la description comment les obtenir.`,
    },
    technical: `{file}: restricted or embargoed files ({files}); the stated licence does not open them, so the licence result covers the open files only.`,
  },
  {
    id: 'LIC-DATACITE-EMPTY',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.openaireRecommends, CITE.openaireMandatory],
    params: ['licence'],
    plain: {
      pl: `Rekord rejestracji DOI (DataCite) nie podaje licencji. Inne rekordy: {licence} („—” = żaden nie podaje licencji albo nie udało się go odczytać). Dodaj licencję w rekordzie DOI.`,
      en: `The DOI registration record (DataCite) states no licence. Other records: {licence} ("—" = none states one, or the record could not be read). Add the licence to the DOI record.`,
      de: `Der DOI-Registrierungseintrag (DataCite) nennt keine Lizenz. Andere Einträge: {licence} („—“ = keiner nennt eine Lizenz oder der Eintrag ließ sich nicht lesen). Tragen Sie die Lizenz im DOI-Eintrag ein.`,
      fr: `La notice d'enregistrement du DOI (DataCite) n'indique aucune licence. Autres notices : {licence} (« — » = aucune n'en indique, ou la notice n'a pas pu être lue). Ajoutez la licence à la notice du DOI.`,
    },
    technical: `{file}: DataCite rightsList is empty; other records state '{licence}' ('—' = none states one, or the main record could not be read).`,
  },
  {
    id: 'LIC-MISMATCH',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.dataciteRepeat, CITE.ccDualLicensing, CITE.ccDualChoice, CITE.fairDifferent],
    params: ['licenceA', 'licenceB'],
    plain: {
      pl: `Dwa rekordy podają różne licencje ({licenceA} i {licenceB}). Popraw je tak, by były takie same.`,
      en: `Two records state different licences ({licenceA} and {licenceB}). Make them the same.`,
      de: `Zwei Einträge nennen unterschiedliche Lizenzen ({licenceA} und {licenceB}). Gleichen Sie sie an.`,
      fr: `Deux notices indiquent des licences différentes ({licenceA} et {licenceB}). Harmonisez-les.`,
    },
    technical: `{file}: licence mismatch between records: {licenceA} vs {licenceB}.`,
  },
  {
    id: 'LIC-SEVERAL-LICENCES',
    category: 'A',
    severity: 'warning',
    exportPolicy: 'show',
    citations: [CITE.dataciteRepeat, CITE.ccDualLicensing, CITE.ccDualChoice, CITE.fairDifferent],
    params: ['licences', 'fields'],
    plain: {
      pl: `Rekord podaje kilka różnych licencji naraz: {licences} (pola: {fields}). Nie wynika z niego, która dotyczy danych, a która tylko opisu. Zostaw licencję danych; przy celowym podwójnym licencjonowaniu albo licencji metadanych napisz to w opisie.`,
      en: `The record states several different licences at once: {licences} (fields: {fields}). It does not say which covers the data and which only the description. Keep the licence of the data; for deliberate dual licensing, or a licence of the metadata, say so in the description.`,
      de: `Der Eintrag nennt mehrere verschiedene Lizenzen zugleich: {licences} (Felder: {fields}). Er sagt nicht, welche für die Daten und welche nur für die Beschreibung gilt. Behalten Sie die Lizenz der Daten; bei bewusster Doppellizenzierung oder einer Metadatenlizenz schreiben Sie das in die Beschreibung.`,
      fr: `La notice indique plusieurs licences différentes à la fois : {licences} (champs : {fields}). Elle ne dit pas laquelle couvre les données et laquelle seulement la description. Gardez la licence des données ; pour une double licence voulue ou une licence des métadonnées, écrivez-le dans la description.`,
    },
    technical: `{file} fields {fields}: several different recognised licences in one record ({licences}); the record does not say which covers the data. Check manually: dual licensing to choose from, or a licence of the metadata next to the licence of the data.`,
  },
  {
    id: 'LIC-OBIS-LICENCE',
    category: 'A',
    severity: 'info',
    exportPolicy: 'show',
    params: ['licence', 'accepts', 'kind'],
    plain: {
      pl: `Licencja {licence} jest przyjmowana przez OBIS i GBIF (przyjmują: {accepts}). Informacja, nie błąd.`,
      en: `The licence {licence} is accepted by OBIS and GBIF (they accept: {accepts}). Information, not a fault.`,
      de: `Die Lizenz {licence} wird von OBIS und GBIF angenommen (sie nehmen an: {accepts}). Hinweis, kein Fehler.`,
      fr: `La licence {licence} est acceptée par OBIS et GBIF (ils acceptent : {accepts}). Information, pas une erreur.`,
    },
    plainVariants: {
      'not-accepted': {
        pl: `Licencja {licence} nie jest przyjmowana przez OBIS i GBIF (przyjmują: {accepts}). Samo zgłoszenie danych do nich wymaga jednej z tych licencji. Informacja, nie błąd: licencja jest poprawnie podana.`,
        en: `The licence {licence} is not accepted by OBIS and GBIF (they accept: {accepts}). Submitting the data to them needs one of these licences. Information, not a fault: the licence is stated correctly.`,
        de: `Die Lizenz {licence} wird von OBIS und GBIF nicht angenommen (sie nehmen an: {accepts}). Für die Einreichung der Daten dort ist eine dieser Lizenzen nötig. Hinweis, kein Fehler: die Lizenz ist korrekt angegeben.`,
        fr: `La licence {licence} n'est pas acceptée par OBIS et GBIF (ils acceptent : {accepts}). Pour leur soumettre les données, il faut l'une de ces licences. Information, pas une erreur : la licence est correctement indiquée.`,
      },
    },
    technical: `{file}: licence {licence}; OBIS and GBIF accept {accepts} ({kind}).`,
  },
];

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { CITE } from './citations';
import type { RuleSpec } from './spec';

/*
 * Licence rules (category 'A'), emitted by checkLicence() (Task 7). `file` = the record label.
 * Declared params per rule:
 *   LIC-MISSING               (none)
 *   LIC-FREE-TEXT             text, versionMissing, hint   text = the licence text found; versionMissing = 'yes' | 'no';
 *                                                    hint = the SPDX id of the licence we recognised in it, or the example 'CC BY 4.0'
 *                                                    when nothing was recognised (never a licence the publisher did not name)
 *   LIC-TEXT-URI-CONFLICT     text, uri, textLicence, uriLicence   one statement WITH a link whose text and link classify differently
 *                                                    (incl. a link no SPDX id exists for); textLicence/uriLicence = SPDX id or '—'
 *   LIC-ADDED-CONDITIONS      text, textLicence      the text names a licence but adds or negates conditions; textLicence = the
 *                                                    SPDX id, or the text itself when no id could be read
 *   LIC-AMBIGUOUS             text, readings         one statement WITHOUT a link that reads as more than one licence (rights text against
 *                                                    identifier, "CC BY 4.0 (CC BY-NC)", a recognised name next to one that is not);
 *                                                    readings = what it reads as, separated by " / " ("—" = a name no SPDX id exists for)
 *   LIC-RESTRICTION-CONFLICT  codes, licence         codes = restrictive MD_RestrictionCode values, comma-separated;
 *                                                    licence = the open licence (recognised SPDX id; NC/ND and unrecognised text are not open)
 *   LIC-DATACITE-EMPTY        licence                the licence another record states
 *   LIC-MISMATCH              licenceA, licenceB     the two different SPDX ids
 */
export const LICENCE_RULES: readonly RuleSpec[] = [
  {
    id: 'LIC-MISSING',
    category: 'A',
    severity: 'error',
    citations: [CITE.inspireValues, CITE.inspireNoConditions, CITE.fairLicence, CITE.openaireRecommends],
    params: [],
    plain: {
      pl: `W metadanych nie znaleziono licencji. Podaj nazwę licencji z wersją i odnośnik, np. CC BY 4.0.`,
      en: `No licence was found in the metadata. State the licence name with its version and a link, e.g. CC BY 4.0.`,
      de: `In den Metadaten wurde keine Lizenz gefunden. Geben Sie den Lizenznamen mit Version und einen Link an, z. B. CC BY 4.0.`,
      fr: `Aucune licence n'a été trouvée dans les métadonnées. Indiquez le nom de la licence avec sa version et un lien, par ex. CC BY 4.0.`,
    },
    technical: `{file}: no licence statement (useLimitation, otherConstraints, rightsList, license) in any record.`,
  },
  {
    id: 'LIC-FREE-TEXT',
    category: 'A',
    severity: 'warning',
    citations: [CITE.fairFindable, CITE.dataciteTitle, CITE.dataciteIdentifier, CITE.dataciteUri, CITE.inspireLink, CITE.spdxList],
    params: ['text', 'versionMissing', 'hint'],
    plain: {
      pl: `Licencja jest zapisana tylko jako zwykły tekst („{text}”), którego programy nie odczytają. Podaj identyfikator tej licencji (np. {hint}) i odnośnik do jej oficjalnego tekstu.`,
      en: `The licence is written only as free text ("{text}"), which programs cannot read. State the licence by its identifier (e.g. {hint}) and a link to its official text.`,
      de: `Die Lizenz steht nur als Freitext („{text}“), den Programme nicht lesen können. Geben Sie die Lizenz mit ihrer Kennung (z. B. {hint}) und einem Link auf ihren offiziellen Text an.`,
      fr: `La licence n'est écrite qu'en texte libre (« {text} »), que les programmes ne peuvent pas lire. Indiquez-la par son identifiant (par ex. {hint}) et un lien vers son texte officiel.`,
    },
    technical: `{file} field {field}: licence given as free text '{text}' (version missing: {versionMissing}); no recognised SPDX id or licence URI. Suggested identifier: {hint}.`,
  },
  {
    id: 'LIC-TEXT-URI-CONFLICT',
    category: 'A',
    severity: 'warning',
    citations: [CITE.dataciteTitle, CITE.dataciteUri, CITE.ccNameAndLink],
    params: ['text', 'uri', 'textLicence', 'uriLicence'],
    plain: {
      pl: `Tekst licencji („{text}”) i jej odnośnik wskazują różne licencje albo odnośnika nie da się rozpoznać. Z tekstu odczytano: {textLicence}; z odnośnika: {uriLicence} („—” = nierozpoznano). Sprawdź to ręcznie i podaj jedną licencję z jej własnym odnośnikiem.`,
      en: `The licence text ("{text}") and its link point to different licences, or the link cannot be recognised. Read from the text: {textLicence}; read from the link: {uriLicence} ("—" = not recognised). Check it by hand and state one licence with its own link.`,
      de: `Lizenztext („{text}“) und Link weisen auf unterschiedliche Lizenzen, oder der Link ist nicht erkennbar. Aus dem Text gelesen: {textLicence}; aus dem Link gelesen: {uriLicence} („—“ = nicht erkannt). Prüfen Sie das von Hand und geben Sie eine Lizenz mit ihrem eigenen Link an.`,
      fr: `Le texte de la licence (« {text} ») et son lien désignent des licences différentes, ou le lien n'est pas reconnu. Lu dans le texte : {textLicence} ; lu dans le lien : {uriLicence} (« — » = non reconnu). Vérifiez-le à la main et indiquez une seule licence avec son propre lien.`,
    },
    technical: `{file} field {field}: text '{text}' reads as {textLicence}, link '{uri}' as {uriLicence}; the statement is not classified (text and link differ, or the link is not recognised). Check manually.`,
  },
  {
    id: 'LIC-ADDED-CONDITIONS',
    category: 'A',
    severity: 'warning',
    citations: [CITE.ccModified],
    params: ['text', 'textLicence'],
    plain: {
      pl: `Tekst („{text}”) wymienia licencję {textLicence}, ale dodaje do niej warunki, więc w takim brzmieniu nie jest to już ta standardowa licencja. Sprawdź to ręcznie i podaj wyraźnie licencję oraz ewentualne dodatkowe warunki.`,
      en: `The text ("{text}") names the licence {textLicence} but adds conditions to it, so as written it is no longer that standard licence. Check it by hand and state the licence and any extra conditions clearly.`,
      de: `Der Text („{text}“) nennt die Lizenz {textLicence}, fügt ihr aber Bedingungen hinzu; so geschrieben ist es nicht mehr diese Standardlizenz. Prüfen Sie das von Hand und geben Sie die Lizenz und etwaige zusätzliche Bedingungen klar an.`,
      fr: `Le texte (« {text} ») nomme la licence {textLicence} mais y ajoute des conditions ; tel qu'il est écrit, ce n'est plus cette licence standard. Vérifiez-le à la main et indiquez clairement la licence et les éventuelles conditions supplémentaires.`,
    },
    technical: `{file} field {field}: text '{text}' names {textLicence} but adds or negates conditions; the statement is not classified as that licence. Check manually.`,
  },
  {
    id: 'LIC-AMBIGUOUS',
    category: 'A',
    severity: 'warning',
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
    id: 'LIC-DATACITE-EMPTY',
    category: 'A',
    severity: 'warning',
    citations: [CITE.openaireRecommends, CITE.openaireMandatory],
    params: ['licence'],
    plain: {
      pl: `Rekord rejestracji DOI (DataCite) nie podaje licencji, choć inny rekord podaje {licence}. Dodaj licencję także w rekordzie DOI.`,
      en: `The DOI registration record (DataCite) states no licence, although another record states {licence}. Add the licence to the DOI record too.`,
      de: `Der DOI-Registrierungseintrag (DataCite) nennt keine Lizenz, obwohl ein anderer Eintrag {licence} angibt. Tragen Sie die Lizenz auch im DOI-Eintrag ein.`,
      fr: `La notice d'enregistrement du DOI (DataCite) n'indique aucune licence, alors qu'une autre notice indique {licence}. Ajoutez aussi la licence à la notice du DOI.`,
    },
    technical: `{file}: DataCite rightsList is empty while another record states '{licence}'.`,
  },
  {
    id: 'LIC-MISMATCH',
    category: 'A',
    severity: 'warning',
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
];

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleSpec } from './spec';

/*
 * Licence rules (category 'A'), emitted by checkLicence() (Task 7). `file` = the record label.
 * Declared params per rule:
 *   LIC-MISSING               (none)
 *   LIC-FREE-TEXT             text, versionMissing   text = the licence text found; versionMissing = 'yes' | 'no'
 *   LIC-RESTRICTION-CONFLICT  codes, licence         codes = restrictive MD_RestrictionCode values, comma-separated;
 *                                                    licence = the open licence statement (SPDX id or free text)
 *   LIC-DATACITE-EMPTY        licence                the licence another record states
 *   LIC-MISMATCH              licenceA, licenceB     the two different SPDX ids
 */
export const LICENCE_RULES: readonly RuleSpec[] = [
  {
    id: 'LIC-MISSING',
    category: 'A',
    severity: 'error',
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
    params: ['text', 'versionMissing'],
    plain: {
      pl: `Licencja jest zapisana tylko jako zwykły tekst („{text}”), którego programy nie odczytają. Podaj nazwę licencji z wersją i odnośnik, np. CC BY 4.0.`,
      en: `The licence is written only as free text ("{text}"), which programs cannot read. State the licence name with its version and a link, e.g. CC BY 4.0.`,
      de: `Die Lizenz steht nur als Freitext („{text}“), den Programme nicht lesen können. Geben Sie den Lizenznamen mit Version und einen Link an, z. B. CC BY 4.0.`,
      fr: `La licence n'est écrite qu'en texte libre (« {text} »), que les programmes ne peuvent pas lire. Indiquez son nom avec la version et un lien, par ex. CC BY 4.0.`,
    },
    technical: `{file} field {field}: licence given as free text '{text}' (version missing: {versionMissing}); no recognised SPDX id or licence URI.`,
  },
  {
    id: 'LIC-RESTRICTION-CONFLICT',
    category: 'A',
    severity: 'warning',
    params: ['codes', 'licence'],
    plain: {
      pl: `Metadane podają otwartą licencję ({licence}), a jednocześnie ograniczenie ({codes}). To się wyklucza; usuń ograniczenie albo zmień licencję.`,
      en: `The metadata names an open licence ({licence}) and also a restriction ({codes}). These contradict each other; remove the restriction or change the licence.`,
      de: `Die Metadaten nennen eine offene Lizenz ({licence}) und zugleich eine Einschränkung ({codes}). Das widerspricht sich; entfernen Sie die Einschränkung oder ändern Sie die Lizenz.`,
      fr: `Les métadonnées indiquent une licence ouverte ({licence}) mais aussi une restriction ({codes}). C'est contradictoire ; supprimez la restriction ou changez la licence.`,
    },
    technical: `{file}: restriction code(s) {codes} (MD_RestrictionCode) together with the open licence statement '{licence}'.`,
  },
  {
    id: 'LIC-DATACITE-EMPTY',
    category: 'A',
    severity: 'warning',
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

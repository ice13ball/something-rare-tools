// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { isRestrictiveCode, toSpdx } from '../metadata/licence';
import { makeFinding } from '../rules/registry';
import type { Finding, LicenceStatement, MetadataRecord } from '../types';

/** Statements about the metadata record itself (ISO `metadataConstraints`), not the data. */
const isResourceLevel = (s: LicenceStatement): boolean => !s.field.startsWith('metadataConstraints/');

/** What a statement says, for a finding: the SPDX id when recognised, else its text, else its URI. */
const shown = (s: LicenceStatement): string => s.spdx ?? s.text ?? s.uri ?? '';

/**
 * Machine-readable = a licence URI that maps to the SPDX id, or text that is the SPDX id itself ("cc-by-4.0").
 * `spdx` alone is not enough: toSpdx() also recovers an id from prose such as "CC-BY 4.0", which a program
 * reading the record cannot do; that is exactly the free-text case LIC-FREE-TEXT reports.
 */
const isMachineReadable = (s: LicenceStatement): boolean =>
  !!s.spdx && ((!s.text && !s.uri) || (!!s.uri && toSpdx(undefined, s.uri) === s.spdx) || s.text?.trim().toLowerCase() === s.spdx.toLowerCase());

const OPEN_SPDX_PREFIX = /^(CC|ODbL|ODC|PDDL)/;
const OPEN_TEXT = /\bCC[\s-]?BY|CC0|creative commons|open data commons/i;
const isOpenStatement = (s: LicenceStatement): boolean =>
  (s.spdx !== undefined && OPEN_SPDX_PREFIX.test(s.spdx)) || (s.spdx === undefined && !!s.text && OPEN_TEXT.test(s.text));

/**
 * MD_RestrictionCode `license` is excluded here although RESTRICTIVE_CODES lists it: in ISO 19115 it is the
 * normal way to say "a licence applies" next to a Creative Commons statement, so it cannot contradict one.
 */
const isConflictingCode = (code: string): boolean => code !== 'license' && isRestrictiveCode(code);

/** Category A — licence statements across ISO 19139, DataCite, Zenodo and PANGAEA records (Task 7). */
export function checkLicence(records: MetadataRecord[], ctx: { label: string; inaccessible: boolean }): Finding[] {
  const file = ctx.label;
  const out: Finding[] = [];

  const statements = records.flatMap((r) => r.licences.filter(isResourceLevel));

  if (statements.length === 0) {
    // Also covers an inaccessible record whose DataCite rightsList is empty.
    out.push(makeFinding('LIC-MISSING', { file }));
  } else {
    // Free text only: nothing machine-readable. One finding per record, not per source.
    if (!statements.some(isMachineReadable)) {
      const first = statements.find((s) => s.text) ?? statements[0];
      // `text` shows the statement as written; an spdx id recovered from prose is not what the author wrote.
      const text = first.text ?? shown(first);
      out.push(
        makeFinding('LIC-FREE-TEXT', {
          file,
          field: first.field,
          params: { text, versionMissing: /\d(\.\d)?/.test(text) ? 'no' : 'yes' },
        }),
      );
    }

    const codes = [...new Set(records.flatMap((r) => r.restrictionCodes.map((c) => c.code)).filter(isConflictingCode))];
    const open = statements.find(isOpenStatement);
    if (codes.length > 0 && open) {
      out.push(makeFinding('LIC-RESTRICTION-CONFLICT', { file, params: { codes: codes.join(', '), licence: shown(open) } }));
    }

    const empty = records.find((r) => r.source === 'datacite' && r.licences.length === 0);
    if (empty) out.push(makeFinding('LIC-DATACITE-EMPTY', { file, params: { licence: shown(statements[0]) } }));

    const spdxIds = [...new Set(statements.map((s) => s.spdx).filter((x): x is string => !!x))];
    if (spdxIds.length > 1) out.push(makeFinding('LIC-MISMATCH', { file, params: { licenceA: spdxIds[0], licenceB: spdxIds[1] } }));
  }

  const emptyLinks = records.reduce((n, r) => n + r.distributionLinks.filter((l) => l.url === '').length, 0);
  if (emptyLinks > 0) out.push(makeFinding('META-EMPTY-LINK', { file, params: { count: emptyLinks } }));

  // Nothing was loaded (record refused): absence of version and extent says nothing about the record.
  if (records.length > 0) {
    if (!records.some((r) => r.version)) out.push(makeFinding('META-NO-VERSION', { file }));
    if (!records.some((r) => r.bbox || r.temporalExtent)) out.push(makeFinding('META-NO-EXTENT', { file }));
  }
  return out;
}

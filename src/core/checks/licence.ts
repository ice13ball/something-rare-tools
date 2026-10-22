// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { analyseLicences, shownOf, type Contradiction } from '../licence/analyse';
import { makeFinding } from '../rules/registry';
import type { Finding, MetadataRecord, MetadataSource } from '../types';

/** The finding that states one contradiction in the rule's own words (the licence page renders it with renderPlain). */
export function contradictionFinding(c: Contradiction, file: string): Finding {
  switch (c.kind) {
    case 'text-uri':
      return makeFinding('LIC-TEXT-URI-CONFLICT', {
        file,
        field: c.statement.statement.field,
        params: {
          text: c.statement.conflict!.text || '—',
          uri: c.statement.conflict!.uri || '—',
          textLicence: c.statement.conflict!.textLicence,
          uriLicence: c.statement.conflict!.uriLicence,
        },
      });
    case 'added-conditions':
      return makeFinding('LIC-ADDED-CONDITIONS', {
        file,
        field: c.statement.statement.field,
        params: { text: c.statement.conflict!.text, textLicence: c.statement.conflict!.textLicence, rest: c.statement.conflict!.rest },
      });
    case 'extra-text':
      return makeFinding('LIC-EXTRA-TEXT', {
        file,
        field: c.statement.statement.field,
        params: { text: c.statement.conflict!.text, rest: c.statement.conflict!.rest },
      });
    case 'ambiguous':
      return makeFinding('LIC-AMBIGUOUS', {
        file,
        field: c.statement.statement.field,
        params: { text: c.statement.conflict!.text, readings: c.statement.conflict!.textLicence },
      });
    case 'restriction-code':
      return makeFinding('LIC-RESTRICTION-CONFLICT', { file, params: { codes: c.codes.join(', '), licence: c.licence } });
    case 'datacite-empty':
      return makeFinding('LIC-DATACITE-EMPTY', { file, params: { licence: c.licence } });
    case 'mismatch':
      return makeFinding('LIC-MISMATCH', { file, params: { licenceA: c.licenceA, licenceB: c.licenceB } });
  }
}

/**
 * Category A — licence statements across ISO 19139, DataCite, Zenodo and PANGAEA records (Task 7).
 * A thin mapping from analyseLicences() (src/core/licence/analyse.ts) to findings; no licence logic lives here.
 * `unreadable`: the sources of this record that could not be loaded (their absence is not "no licence").
 */
export function checkLicence(
  records: MetadataRecord[],
  ctx: { label: string; inaccessible: boolean; unreadable?: readonly MetadataSource[] },
): Finding[] {
  const file = ctx.label;
  const out: Finding[] = [];
  const a = analyseLicences(records, { unreadable: ctx.unreadable, inaccessible: ctx.inaccessible });

  // A record that could not be read says nothing about a licence: IN-RECORD-INACCESSIBLE already reports it.
  if (a.missing) out.push(makeFinding('LIC-MISSING', { file }));

  // Free text only: nothing machine-readable. One finding per record, not per source.
  if (a.freeText) {
    const f = a.freeText;
    out.push(
      makeFinding('LIC-FREE-TEXT', {
        file,
        field: f.statement.statement.field,
        // `text` shows the statement as written; an spdx id recovered from prose is not what the author wrote.
        params: { text: f.statement.statement.text ?? shownOf(f.statement), versionMissing: f.versionMissing ? 'yes' : 'no', hint: f.hint },
      }),
    );
  }

  for (const c of a.contradictions) {
    // Once per record, as before: the first disagreeing pair.
    if (c.kind === 'mismatch' && out.some((f) => f.ruleId === 'LIC-MISMATCH')) continue;
    out.push(contradictionFinding(c, file));
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

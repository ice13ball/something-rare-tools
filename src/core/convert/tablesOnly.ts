// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { writeTsv } from './dwca';
import type { ArchiveFile, ArchiveTables, Table } from './dwca';
import { judge } from './policy';
import type { Judged } from './policy';
import { metadataFindings } from './validate';
import type { DatasetMetadata } from './metadata';
import type { Finding } from '../types';

/**
 * The data tables only: event.txt, occurrence.txt and, when there are measurements, extendedmeasurementorfact.txt, for a user whose own IPT or catalogue
 * writes the description (eml.xml) and the licence. Only that requirement is lifted: every finding about the data still blocks, and every warning is
 * still accepted before anything is written.
 */

/** The findings that are about the description of the dataset and its licence, which this export does not write. CONV-BASIS-UNSET is NOT among them: basisOfRecord is a column of occurrence.txt. */
export const DESCRIPTION_RULES: ReadonlySet<string> = new Set(['CONV-EML-MISSING', 'CONV-LICENCE-UNSET', 'CONV-LICENCE-DIFFERS']);

/** The findings that count for the data tables: all but the ones about the description and the licence. */
export const withoutDescription = (findings: readonly Finding[]): Finding[] => findings.filter((f) => !DESCRIPTION_RULES.has(f.ruleId));

/** What is left of the description checks for the tables: the missing basisOfRecord. */
export const tablesOnlyMetaFindings = (m: DatasetMetadata): Finding[] => withoutDescription(metadataFindings(m));

/** The columns whose only source is the description form. Left out of event.txt when no row has a value (the full archive writes them empty). */
const FORM_COLUMNS: readonly string[] = ['datasetName', 'institutionCode'];

/** The same table without the form-only columns that no row fills. Nothing else is touched. */
export function withoutEmptyFormColumns(t: Table): Table {
  const drop = t.columns.map((c, i) => FORM_COLUMNS.includes(c.header) && t.rows.every((r) => r[i] === ''));
  if (!drop.some(Boolean)) return t;
  return { ...t, columns: t.columns.filter((_, i) => !drop[i]), rows: t.rows.map((r) => r.filter((_, i) => !drop[i])) };
}

/** The page's judgement for the tables-only export: the data findings of the view and the missing basisOfRecord, with the rules of the description and the licence left out. The same `judge` as the full archive. */
export const tablesOnlyJudge = (viewFindings: readonly Finding[], m: DatasetMetadata): Judged => judge([...withoutDescription(viewFindings), ...tablesOnlyMetaFindings(m)]);

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * The files of the tables-only zip, from the same tables the full archive writes its .txt files from (writeTsv of each), so the bytes are the same.
 * `dropEmptyFormColumns`: the mapping path writes the form's datasetName and institutionCode into every event row; the as-is path never does.
 */
export function tablesOnlyFiles(tables: ArchiveTables, opts: { dropEmptyFormColumns: boolean }): ArchiveFile[] {
  const event = opts.dropEmptyFormColumns ? withoutEmptyFormColumns(tables.event) : tables.event;
  return [event, tables.occurrence, ...(tables.emof ? [tables.emof] : [])].map((t) => ({ name: t.name, data: utf8(writeTsv(t)) }));
}

/** "name.zip" -> "name-tables.zip" */
export const tablesZipName = (archiveName: string): string => archiveName.replace(/\.zip$/, '') + '-tables.zip';

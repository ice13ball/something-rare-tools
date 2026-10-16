// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { buildReport } from '../report';
import type { CheckSession, Finding, Report } from '../types';
import { checkChemistry } from './chemistry';
import { checkCrossFile } from './crossfile';
import { checkLicence } from './licence';
import { checkMetadataVsData } from './metadata';
import { checkRows } from './rows';

/**
 * Runs every check over one session and builds the report.
 *
 * Licence checks run per loaded record (a record = one Zenodo/GeoNetwork/DOI/PANGAEA input, or the
 * set of files the user dropped). A record that carries no metadata at all and was not refused by
 * its server is skipped: a dropped CSV without a metadata file says nothing about a licence.
 */
export function runChecks(session: CheckSession): Report {
  const findings: Finding[] = [...session.parseFindings];
  for (const record of session.records) {
    findings.push(...record.findings);
    // File-download failures reuse IN-RECORD-INACCESSIBLE with the file name; only the record's own label counts here.
    const inaccessible = record.findings.some((f) => f.ruleId === 'IN-RECORD-INACCESSIBLE' && f.file === record.label);
    if (record.metadata.length > 0 || inaccessible) {
      findings.push(...checkLicence(record.metadata, { label: record.label, inaccessible }));
    }
  }
  for (const ds of session.datasets) {
    findings.push(...checkMetadataVsData(ds), ...checkRows(ds), ...checkChemistry(ds));
  }
  if (session.datasets.length > 1) findings.push(...checkCrossFile(session.datasets));
  return buildReport(findings);
}

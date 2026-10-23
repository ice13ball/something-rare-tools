// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { ownLoadFailure } from '../licence/failure';
import type { LandMask } from '../geo/land';
import { buildReport } from '../report';
import type { CheckSession, Finding, LoadedRecord, MetadataSource, Report } from '../types';
import { checkChemistry } from './chemistry';
import { checkCrossFile } from './crossfile';
import { checkLicence } from './licence';
import { checkMetadataVsData } from './metadata';
import { checkRows } from './rows';

/** The metadata source a failed load leaves unread. A dropped file has none. */
const SOURCE_OF_KIND: Partial<Record<LoadedRecord['kind'], MetadataSource>> = {
  zenodo: 'zenodo',
  geonetwork: 'iso19139',
  datacite: 'datacite',
  pangaea: 'pangaea',
};

/**
 * Runs every check over one session and builds the report.
 *
 * Licence checks run per loaded record (a record = one Zenodo/GeoNetwork/DOI/PANGAEA input, or the
 * set of files the user dropped). A record that carries no metadata at all and was not refused by
 * its server is skipped: a dropped CSV without a metadata file says nothing about a licence.
 */
export interface RunOptions {
  /**
   * The land/sea grid for ROW-ON-LAND. `null` = it was needed but could not be loaded: the report then says that positions
   * were not compared with the land (never a silent pass). `undefined` = not requested (no positions, or no loader).
   */
  land?: LandMask | null;
}

export function runChecks(session: CheckSession, opts: RunOptions = {}): Report {
  const findings: Finding[] = [...session.parseFindings];
  for (const record of session.records) {
    findings.push(...record.findings);
    // The same "could not be read" as on the licence page (a refused read, a blocked one, a host not allowed): the record then says nothing
    // about a licence. File-download failures reuse these rules with the file name; only the record's own label counts.
    const inaccessible = !!ownLoadFailure(record.findings, record.label, record.kind, record.metadata.length);
    if (record.metadata.length > 0 || inaccessible) {
      findings.push(...checkLicence(record.metadata, { label: record.label, inaccessible, unreadable: inaccessible ? [SOURCE_OF_KIND[record.kind]].filter((x): x is MetadataSource => !!x) : [] }));
    }
  }
  for (const ds of session.datasets) {
    findings.push(...checkMetadataVsData(ds), ...checkRows(ds, opts.land ? { land: opts.land } : {}), ...checkChemistry(ds));
  }
  if (session.datasets.length > 1) findings.push(...checkCrossFile(session.datasets));
  const report = buildReport(findings);
  if (opts.land === null) report.notChecked.unshift('notChecked.landMask');
  return report;
}

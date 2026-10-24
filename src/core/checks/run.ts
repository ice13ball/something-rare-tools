// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

import { landingNotRead, ownLoadFailure } from '../licence/failure';
import type { LandMask } from '../geo/land';
import { buildReport } from '../report';
import type { CheckSession, Finding, LoadedRecord, MetadataSource, Report } from '../types';
import { checkChemistry, oxygenRangeSkipped } from './chemistry';
import { checkCrossFile } from './crossfile';
import { checkLicence } from './licence';
import { checkMetadataVsData } from './metadata';
import { checkRows } from './rows';
import { checkShipSpeed } from './speed';

/** The metadata source a failed load leaves unread. A dropped file has none. */
const SOURCE_OF_KIND: Partial<Record<LoadedRecord['kind'], MetadataSource>> = {
  zenodo: 'zenodo',
  geonetwork: 'iso19139',
  datacite: 'datacite',
  pangaea: 'pangaea',
  dataverse: 'dataverse',
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
  /**
   * "All measurements in these files come from one cruise of one ship" (the declaration at the confirm step). It switches ROW-SHIP-SPEED on for every
   * file without a cruise column, all files together as one track. Absent or false: only a cruise column switches the rule on, and without either the
   * report says the speed was not checked and how to switch it on. A per-run value: nothing here remembers it.
   */
  singleCruise?: boolean;
  /** Today as a UTC calendar day (YYYY-MM-DD) for ROW-DATE-FUTURE; absent: the system clock, read once here. Tests pass a fixed day. */
  today?: string;
}

export function runChecks(session: CheckSession, opts: RunOptions = {}): Report {
  const findings: Finding[] = [...session.parseFindings];
  // archives whose eml.xml states a version: a record whose data came in one of them states a version
  const versioned = new Set(session.parseFindings.filter((f) => f.ruleId === 'IN-DWCA-VERSION' && f.params.version !== 'n/a' && f.file).map((f) => f.file as string));
  for (const record of session.records) {
    findings.push(...record.findings);
    // The same "could not be read" as on the licence page (a refused read, a blocked one, a host not allowed): the record then says nothing
    // about a licence. File-download failures reuse these rules with the file name; only the record's own label counts.
    const own = !!ownLoadFailure(record.findings, record.label, record.kind, record.metadata.length);
    // A landing page that was not read: DataCite was, so it is not unreadable, but its silence is not "no licence anywhere".
    const inaccessible = own || !!landingNotRead(record.findings, record.label, record.kind, record.metadata.length);
    if (record.metadata.length > 0 || inaccessible) {
      const versionInArchive = record.files.some((f) => versioned.has(f.name));
      findings.push(...checkLicence(record.metadata, { label: record.label, inaccessible, unreadable: own ? [SOURCE_OF_KIND[record.kind]].filter((x): x is MetadataSource => !!x) : [], versionInArchive }));
    }
  }
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  for (const ds of session.datasets) {
    findings.push(...checkMetadataVsData(ds), ...checkRows(ds, { ...(opts.land ? { land: opts.land } : {}), today }), ...checkChemistry(ds));
  }
  if (session.datasets.length > 1) findings.push(...checkCrossFile(session.datasets));
  const speed = checkShipSpeed(session.datasets, { singleCruise: opts.singleCruise === true });
  findings.push(...speed.findings);
  const report = buildReport(findings);
  report.notChecked.unshift(...speed.notChecked);
  if (opts.land === null) report.notChecked.unshift('notChecked.landMask');
  if (session.datasets.some(oxygenRangeSkipped)) report.notChecked.unshift('notChecked.oxygenUnit');
  // a Darwin Core Archive was read: its extension tables were not (the core only), so their eventIDs were not compared with the core's
  if (session.parseFindings.some((f) => f.ruleId === 'IN-DWCA-VERSION')) report.notChecked.unshift('notChecked.dwcExtensions');
  return report;
}

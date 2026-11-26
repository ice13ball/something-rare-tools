// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { buildEml } from './eml';
import { writeMetaXml, writeTsv } from './dwca';
import type { ArchiveFile } from './dwca';
import type { AsIsResult } from './dwcAsIsTables';
import type { ConvertedDataset } from './model';
import type { DatasetMetadata } from './metadata';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** The coverage of the description (bounding box, dates, taxa) read from the tables as they stand, in the form buildEml takes. */
function coverageSource(r: AsIsResult, metadata: DatasetMetadata): Pick<ConvertedDataset, 'events' | 'occurrences' | 'metadata' | 'methodSteps'> {
  const col = (name: string): number => r.tables.event.columns.findIndex((c) => c.header === name);
  const [d, la, lo] = [col('eventDate'), col('decimalLatitude'), col('decimalLongitude')];
  const events = r.tables.event.rows.map((row) => {
    const lat = la < 0 ? NaN : Number(row[la]);
    const lon = lo < 0 ? NaN : Number(row[lo]);
    return { ...(d >= 0 && row[d] !== '' ? { date: row[d] } : {}), ...(row[la] !== '' && row[lo] !== '' && Number.isFinite(lat) && Number.isFinite(lon) ? { position: { lat, lon } } : {}) };
  });
  const n = r.tables.occurrence.columns.findIndex((c) => c.header === 'scientificName');
  const occurrences = r.tables.occurrence.rows.filter((row) => n >= 0 && row[n] !== '').map((row) => ({ identification: { scientificName: row[n] } }));
  return { events, occurrences, metadata, methodSteps: [] } as unknown as Pick<ConvertedDataset, 'events' | 'occurrences' | 'metadata' | 'methodSteps'>;
}

/**
 * Every file of an archive packed as it is: meta.xml, eml.xml (the description form), event.txt, occurrence.txt and, when the file has measurements,
 * extendedmeasurementorfact.txt. `generated` is the UTC date or timestamp of the export, read by the caller.
 */
export function asIsArchiveFiles(r: AsIsResult, metadata: DatasetMetadata, generated: string): ArchiveFile[] {
  const eml = buildEml(coverageSource(r, metadata), { generated: generated.length === 10 ? `${generated}T00:00:00Z` : generated });
  const t = r.tables;
  return [
    { name: 'meta.xml', data: utf8(writeMetaXml(t)) },
    { name: 'eml.xml', data: utf8(eml) },
    { name: t.event.name, data: utf8(writeTsv(t.event)) },
    { name: t.occurrence.name, data: utf8(writeTsv(t.occurrence)) },
    ...(t.emof ? [{ name: t.emof.name, data: utf8(writeTsv(t.emof)) }] : []),
  ];
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/** Where linked files are downloaded: by the visitor's own browser (default) or via our fetch proxy. */
export type DownloadMode = 'browser' | 'server';
export const DEFAULT_MODE: DownloadMode = 'browser';

/** What the check flow receives from the input panel. Lives in app state only — never in the URL. */
export interface CheckInput {
  files: File[];
  link?: string;
  mode: DownloadMode;
}

/** File types the drop zone accepts (CSV/TSV/text tables, Excel, Darwin Core Archive zips, XML and JSON metadata). */
export const ACCEPTED_EXTENSIONS: readonly string[] = ['.csv', '.tsv', '.txt', '.tab', '.xlsx', '.xls', '.ods', '.xml', '.json', '.zip'];

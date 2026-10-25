// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// Synthetic sheets of the /convert page tests, as the CSV text a user would drop. Every value is invented.
import { fireEvent } from '@testing-library/react';
import { L1_HEADER, L1_ROWS, L2_HEADER, L2_ROWS, W1_HEADER, W1_ROWS, W2_HEADER, W2_ROWS, type Cell } from '../convert/helpers';
import { writeConvertSidecar } from '../../src/core/convert/settings';

const field = (c: Cell): string => (c === null ? '' : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c));
export const csvOf = (header: readonly string[], rows: readonly (readonly Cell[])[]): string => [header, ...rows].map((r) => r.map(field).join(',')).join('\n') + '\n';

export const W1_CSV = csvOf(W1_HEADER, W1_ROWS);
export const W2_CSV = csvOf(W2_HEADER, W2_ROWS);
export const L1_CSV = csvOf(L1_HEADER, L1_ROWS);
export const L2_CSV = csvOf(L2_HEADER, L2_ROWS);
/** W1 without its sample code column: the code is missing. */
export const NO_CODE_CSV = csvOf(
  W1_HEADER.filter((h) => h !== 'Sample'),
  W1_ROWS.map((r) => r.filter((_, i) => i !== 2)),
);
/** Two stations with the same sample code "k1". */
export const COLLISION_CSV = csvOf(['Station', 'Sample', 'Latitude', 'Longitude', 'Date', 'Calanus finmarchicus'], [['S1', 'k1', 55, 3, '2020-01-01', 4], ['S2', 'k1', 56, 3, '2020-01-02', 5]]);
export const SIDECAR_CSV = writeConvertSidecar({ fullList: true, prefixStation: true });

/** Chooses files in the page's file input (as the browser's file dialog does). */
export function chooseFiles(container: HTMLElement, files: { name: string; text: string }[]): void {
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
    target: { files: files.map((f) => new File([f.text], f.name, { type: 'text/csv' })) },
  });
}

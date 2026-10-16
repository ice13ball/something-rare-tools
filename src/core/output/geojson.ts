// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
// GeoJSON points for the map preview / download. Coordinates are the parsed numbers, [lon, lat], untouched.
import type { Dataset, Report, Severity } from '../types';

export type RowSeverity = Severity | 'none';
const RANK: Record<RowSeverity, number> = { none: 0, info: 1, warning: 2, error: 3 };

export const rowKey = (file: string, line: number): string => `${file}#${line}`;

/**
 * Worst severity of the findings that point at each row, keyed `${file}#${line}`. Only row-level findings count:
 * same file, `lines` includes the row's line (the line of the row itself or of one of its value cells, which differ
 * for long layouts) and, when both name a sheet, the same sheet. Findings without lines are about the dataset, not a row.
 */
export function worstSeverityByRow(datasets: readonly Dataset[], report: Report): Map<string, RowSeverity> {
  const out = new Map<string, RowSeverity>();
  // physical line of a file -> rows (key + sheet) that own that line
  const owners = new Map<string, { key: string; sheet: string }[]>();
  for (const ds of datasets) {
    for (const r of ds.rows) {
      const key = rowKey(r.file, r.line);
      if (!out.has(key)) out.set(key, 'none');
      const lines = new Set<number>([r.line]);
      for (const c of Object.values(r.values)) lines.add(c.line);
      for (const l of lines) {
        const k = rowKey(r.file, l);
        const list = owners.get(k) ?? [];
        if (!list.some((o) => o.key === key && o.sheet === r.sheet)) list.push({ key, sheet: r.sheet });
        owners.set(k, list);
      }
    }
  }
  for (const f of report.findings) {
    if (f.file === undefined || !f.lines || f.lines.length === 0) continue;
    for (const l of f.lines) {
      for (const o of owners.get(rowKey(f.file, l)) ?? []) {
        if (f.sheet !== undefined && o.sheet !== undefined && f.sheet !== o.sheet) continue;
        if (RANK[f.severity] > RANK[out.get(o.key) ?? 'none']) out.set(o.key, f.severity);
      }
    }
  }
  return out;
}

export function toGeoJson(datasets: Dataset[], report: Report): string {
  const worst = worstSeverityByRow(datasets, report);
  const features = [];
  for (const ds of datasets) {
    for (const r of ds.rows) {
      if (r.lat === undefined || r.lon === undefined) continue;
      const properties: Record<string, string | number> = { file: r.file, line: r.line };
      if (r.station !== undefined) properties.station = r.station;
      if (r.datetime) properties.date = r.datetime.iso;
      properties.worstSeverity = worst.get(rowKey(r.file, r.line)) ?? 'none';
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties });
    }
  }
  return JSON.stringify({ type: 'FeatureCollection', features });
}

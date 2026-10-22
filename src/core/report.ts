// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { getRule } from './rules/registry';
import type { Finding, Lang, Report, Severity } from './types';

/** UI message keys for what the tool does not check (shown with every report). */
export const NOT_CHECKED: readonly string[] = [
  'notChecked.scientificValidity',
  'notChecked.calibration',
  'notChecked.taxonomy',
  'notChecked.pdfContent',
  'notChecked.unlistedVariables',
];

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Compact line ranges: [17,18,19,20,21,263,264] -> "17–21, 263–264". Sorted and de-duplicated. */
export function formatLines(lines: readonly number[] | undefined): string {
  if (!lines || lines.length === 0) return '';
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = (): void => {
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
  };
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    flush();
    start = prev = n;
  }
  flush();
  return parts.join(', ');
}

function dedupeKey(f: Finding): string {
  return JSON.stringify([f.ruleId, f.file ?? null, f.sheet ?? null, f.field ?? null, f.value ?? null, [...new Set(f.lines ?? [])].sort((a, b) => a - b)]);
}

function firstLine(f: Finding): number {
  return f.lines && f.lines.length > 0 ? Math.min(...f.lines) : Number.POSITIVE_INFINITY;
}

function compareText(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1; // findings without a file sort after those with one
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

/**
 * Dedupes (same rule, file, sheet, field, value and lines; the datasetIds of duplicates are merged),
 * sorts error -> warning -> info, then by file, then by first line, then by rule id, and counts.
 * Does not mutate its input.
 */
export function buildReport(findings: readonly Finding[]): Report {
  const merged = new Map<string, Finding>();
  for (const f of findings) {
    const key = dedupeKey(f);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...f, params: { ...f.params }, ...(f.datasetIds ? { datasetIds: [...f.datasetIds] } : {}) });
    } else if (f.datasetIds) {
      existing.datasetIds = [...new Set([...(existing.datasetIds ?? []), ...f.datasetIds])];
    }
  }
  const list = [...merged.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      compareText(a.file, b.file) ||
      firstLine(a) - firstLine(b) ||
      compareText(a.ruleId, b.ruleId),
  );
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of list) counts[f.severity] += 1;
  return { findings: list, counts, notChecked: [...NOT_CHECKED] };
}

/**
 * Fills `{name}` placeholders. Sources, in order: the Finding's generic fields (file, sheet, field, value,
 * lines as compact ranges), its params, and `threshold.<name>` from the rule itself (so a message can
 * never disagree with the number the check used). A generic field the finding does not have renders as
 * an empty string; a param that is missing is left as `{name}`, so a check that forgot it is visible.
 */
function fill(template: string, f: Finding): string {
  const rule = getRule(f.ruleId);
  const generic: Record<string, string> = {
    file: f.file ?? '',
    sheet: f.sheet ?? '',
    field: f.field ?? '',
    value: f.value ?? '',
    lines: formatLines(f.lines),
  };
  return template.replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, name: string) => {
    if (name.startsWith('threshold.')) {
      const t = rule.thresholds?.find((x) => x.name === name.slice('threshold.'.length));
      return t ? String(t.value) : whole;
    }
    if (Object.prototype.hasOwnProperty.call(f.params, name)) return String(f.params[name]);
    if (Object.prototype.hasOwnProperty.call(generic, name)) return generic[name];
    return whole;
  });
}

/** One or two sentences for a non-technical scientist, in `lang` (English when the language is unknown). */
export function renderPlain(f: Finding, lang: Lang): string {
  const rule = getRule(f.ruleId);
  let texts: Record<Lang, string> = rule.plain;
  if (rule.plainByStatus) {
    // 403 / 404: the record is probably not public; 5xx: the server failed; anything else: no guess about the reason
    const status = Number(f.params.status);
    if (status >= 500 && status <= 599) texts = rule.plainByStatus.server;
    else if (status !== 403 && status !== 404) texts = rule.plainByStatus.other;
  }
  return fill(texts[lang] || texts.en, f);
}

/** The English technical detail line (file, lines, field, value, parameters). */
export function renderTechnical(f: Finding): string {
  return fill(getRule(f.ruleId).technical, f);
}

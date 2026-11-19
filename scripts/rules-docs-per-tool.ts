// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { LOAD_FAILURES } from '../src/core/licence/failure';
import { applyPlurals } from '../src/core/i18n/plural';
import { RULES } from '../src/core/rules/registry';
import type { Citation, RuleDef } from '../src/core/types';
import { emittedBy, scanProject } from './rules-scan';
import type { Scan } from './rules-scan';

/**
 * One rule reference per tool: docs/rules/check.md, licence.md, collection.md, convert.md, printable Markdown, generated from the registry.
 * test/rules/rules-docs-per-tool.test.ts compares each file with this output and, with UPDATE_RULES_DOC=1, rewrites them.
 *
 * WHICH RULES A TOOL LISTS (membership) is derived from the code, never from an id prefix: scripts/rules-scan.ts follows the code the tool runs, from the
 * entry modules in TOOL_ENTRIES, to every place that raises a rule (see its header for the method and its limits). A rule raised by several tools is
 * listed in each of them. Two corrections are applied to the scan, both read from the code and listed here:
 *  - /licence loads records with the shared loader, which also raises file-level input findings that /licence throws away (src/core/licence/load.ts: "Only
 *    this record's own failure counts"). Of the input rules it lists only LOAD_FAILURES, the list /licence itself filters with.
 *  - RUNTIME_BUILT: ids a scan cannot see because the code builds them at run time. None exists today (every raise names its id in a string literal); the
 *    mechanism stays so that a future one is written down here and tested against the registry, not skipped.
 *
 * THE TEXT of a rule is the registry's, as it is: the title and explanation a user sees (the English `plain` wording and its variants), the technical
 * text, the thresholds with their sources, the citations. The generator adds no sentence about any rule. The registry has no separate title or advice
 * field, so none is printed: the advice a user gets is part of the plain wording.
 *
 * PLACEHOLDERS: registry texts are templates filled from a finding. In a reference there is no finding, so they are rendered as neutral text:
 *  - a plural token {+count:row|rows} becomes its last (plural) form, "rows";
 *  - {threshold.name} becomes the rule's own threshold value, the number the check compares against;
 *  - {count}, {lineCount}, any parameter whose name ends in "count": "N";
 *  - every other {name}: the name in guillemets, «lines», «field»: a stand-in for what the tool fills in from the finding.
 */

export type Tool = 'check' | 'licence' | 'collection' | 'convert';
export const TOOLS: readonly Tool[] = ['check', 'licence', 'collection', 'convert'];

/**
 * Entry modules (relative to the repository) of each tool: its page and the worker that runs its checks.
 * /collection also starts the /check engine for its "Check this record" action (RecordCheck in CollectionPage.tsx receives the engine as a prop, which a
 * static scan cannot follow). That engine is deliberately NOT an entry of /collection: the record is checked by /check and its rules are in check.md.
 */
export const TOOL_ENTRIES: Record<Tool, readonly string[]> = {
  check: ['src/worker/handler.ts', 'src/app/pages/CheckPage.tsx'],
  licence: ['src/app/pages/LicencePage.tsx'],
  collection: ['src/worker/collection.handler.ts', 'src/worker/collection.worker.ts', 'src/app/pages/CollectionPage.tsx'],
  convert: ['src/worker/convert.handler.ts', 'src/app/pages/ConvertPage.tsx'],
};

/** Ids a scan cannot see (built at run time), per tool. Empty today. Each must exist in the registry (tested). */
export const RUNTIME_BUILT: Record<Tool, readonly string[]> = { check: [], licence: [], collection: [], convert: [] };

const FILE_NAME: Record<Tool, string> = { check: 'check.md', licence: 'licence.md', collection: 'collection.md', convert: 'convert.md' };
export const docFile = (tool: Tool): string => `docs/rules/${FILE_NAME[tool]}`;

const TITLE: Record<Tool, string> = {
  check: 'Rules of /check',
  licence: 'Rules of /licence',
  collection: 'Rules of /collection',
  convert: 'Rules of /convert',
};

/** The hand-written head of each file: what the tool reads and how to read the list. Nothing here describes a rule. */
const HEAD: Record<Tool, string> = {
  check:
    '/check reads data files (CSV, TSV, Excel, Darwin Core Archive) and the metadata records of a repository, and checks them against the rules below. ' +
    'It reads a file; it never changes it. A finding names a rule, the file, the rows and the value it concerns.',
  licence:
    '/licence reads the licence statements of one or several records (DOI or link) and compares them: with each other, with the record in DataCite, and with the data files the repository holds back. ' +
    'It lists only the rules it can raise itself. A rule that /check also raises is described here in the same words.',
  collection:
    'Collection review reads the records of a collection and runs the metadata and licence checks on each. ' +
    'A record opened with "Check this record" is checked by /check; its rules are in check.md.',
  convert:
    '/convert reads a spreadsheet or table, asks the person to declare what the columns mean, and writes a Darwin Core archive. ' +
    'It re-uses the file-reading and row checks of /check, and adds its own questions (rules with the prefix CONV). ' +
    'For every rule the list names the export policy: block stops the export, accept needs one tick for the rule per run, show is only shown.',
};

const HOW_TO_READ =
  'The list is the rules the tool can raise, found by a static scan of its code, so a few may never fire in practice. ' +
  'Severity is error, warning or info. Every number a rule compares against is listed with its source. ' +
  'A text in guillemets, «name», stands for a value the tool fills in from the finding; N stands for a number; a plural form is written in the plural. ' +
  'The texts are the ones the tool shows (English), unchanged.';

const CATEGORY_TITLE: Record<RuleDef['category'], string> = {
  input: 'Reading the file or record',
  A: 'Licence and metadata',
  B: 'Rows, Darwin Core and conversion',
  C: 'Across files and chemistry',
};
const CATEGORIES: readonly RuleDef['category'][] = ['input', 'A', 'B', 'C'];

/* ---------- placeholders ---------- */

export function neutral(text: string, rule: RuleDef): string {
  const plurals = applyPlurals('en', text, () => undefined);
  return plurals.replace(/\{([A-Za-z_][\w.]*)\}/g, (_whole, name: string) => {
    if (name.startsWith('threshold.')) {
      const t = rule.thresholds?.find((x) => x.name === name.slice('threshold.'.length));
      if (!t) throw new Error(`${rule.id}: no threshold ${name}`);
      return String(t.value);
    }
    if (/count$/i.test(name)) return 'N';
    return `«${name}»`;
  });
}

/** Markdown-safe text: the characters that would start emphasis, a link or HTML are escaped. */
const md = (s: string): string => s.replace(/\\/g, '\\\\').replace(/[*<>[\]]/g, (c) => `\\${c}`).replace(/\n+/g, ' ').trim();

const link = (c: Citation): string => `[${md(c.label)}](${c.url})${c.locator ? `, ${md(c.locator)}` : ''}`;

/* ---------- membership ---------- */

let SCAN: Scan | undefined;
const ID_SET: ReadonlySet<string> = new Set(RULES.map((r) => r.id));
const BY_ID: ReadonlyMap<string, RuleDef> = new Map(RULES.map((r) => [r.id, r]));

/** Registry-ordered ids each tool can raise, and for each id the modules that name it (for the report). */
export function membership(): Record<Tool, { ids: string[]; sites: Map<string, string[]>; filtered: string[] }> {
  SCAN ??= scanProject(ID_SET);
  const out = {} as Record<Tool, { ids: string[]; sites: Map<string, string[]>; filtered: string[] }>;
  for (const tool of TOOLS) {
    const sites = emittedBy(SCAN, TOOL_ENTRIES[tool]);
    for (const id of RUNTIME_BUILT[tool]) if (!sites.has(id)) sites.set(id, ['(built at run time, listed in rules-docs-per-tool.ts)']);
    const filtered: string[] = [];
    if (tool === 'licence') {
      for (const id of [...sites.keys()]) {
        if (BY_ID.get(id)?.category === 'input' && !LOAD_FAILURES.includes(id)) {
          sites.delete(id);
          filtered.push(id);
        }
      }
    }
    out[tool] = { ids: RULES.map((r) => r.id).filter((id) => sites.has(id)), sites, filtered };
  }
  return out;
}

/* ---------- one rule ---------- */

function variants(rule: RuleDef, tool: Tool): [string, string][] {
  const v: [string, string][] = [];
  const n = (t: Record<string, string>): string => neutral(t.en, rule);
  if (rule.plainByStatus) {
    v.push(['Wording when the server fails (status 500 to 599)', n(rule.plainByStatus.server)]);
    v.push(['Wording when the status is neither 403, 404 nor a server failure', n(rule.plainByStatus.other)]);
  }
  if (rule.plainDataciteNotCompared) v.push(['Wording when the DataCite comparison could not be made', n(rule.plainDataciteNotCompared)]);
  if (rule.plainCollection && tool === 'collection') v.push(['Wording in Collection review', n(rule.plainCollection)]);
  if (rule.plainConvert && tool === 'convert') v.push(['Wording when the converter waits for the answer of the person', n(rule.plainConvert)]);
  if (rule.plainTime) v.push(['Wording when the column holds times of day', n(rule.plainTime)]);
  if (rule.plainOtherRest) v.push(['Sentence added when another source of the statement also leaves something out', n(rule.plainOtherRest)]);
  for (const extra of rule.plainIf ?? []) v.push([`Sentence added when the finding has the parameter ${extra.param}`, n(extra.plain)]);
  return v;
}

function ruleSection(rule: RuleDef, tool: Tool): string[] {
  const lines: string[] = ['', `### ${rule.id}`, ''];
  const facts = [`Severity: ${rule.severity}`];
  if (tool === 'convert') facts.push(`Export policy: ${rule.exportPolicy}`);
  lines.push(facts.join(' · '), '');
  lines.push(`**What the user sees.** ${md(neutral(rule.plain.en, rule))}`, '');
  for (const [label, text] of variants(rule, tool)) lines.push(`**${label}.** ${md(text)}`, '');
  lines.push(`**What triggers it.** ${md(neutral(rule.technical, rule))}`, '');
  if (rule.technicalTime !== undefined) lines.push(`**What triggers it, for times of day.** ${md(neutral(rule.technicalTime, rule))}`, '');
  if (rule.thresholds?.length) {
    lines.push('**Thresholds.**', '');
    for (const t of rule.thresholds) lines.push(`- ${md(t.name)} = ${t.value} ${md(t.unit)}. Source: ${link(t.citation)}`);
    lines.push('');
  }
  const shown = new Set((rule.thresholds ?? []).map((t) => link(t.citation)));
  const cites = (rule.citations ?? []).map(link).filter((c, i, a) => !shown.has(c) && a.indexOf(c) === i);
  if (cites.length) {
    lines.push('**Citations.**', '');
    for (const c of cites) lines.push(`- ${c}`);
    lines.push('');
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The Markdown of one tool's reference. */
export function toolDoc(tool: Tool, ids: readonly string[]): string {
  const set = new Set(ids);
  const rules = RULES.filter((r) => set.has(r.id));
  const out: string[] = [
    `# ${TITLE[tool]}`,
    '',
    'Generated from the rule registry (`src/core/rules/`) by `scripts/rules-docs-per-tool.ts`. Do not edit by hand.',
    'Regenerate with `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-docs-per-tool.test.ts`.',
    '',
    HEAD[tool],
    '',
    HOW_TO_READ,
    '',
    `${rules.length} rules.`,
  ];
  for (const cat of CATEGORIES) {
    const inCat = rules.filter((r) => r.category === cat);
    if (!inCat.length) continue;
    out.push('', `## ${CATEGORY_TITLE[cat]}`);
    for (const r of inCat) out.push(...ruleSection(r, tool));
  }
  out.push('');
  return out.join('\n');
}

/** All four references, keyed by tool. */
export function perToolDocs(): Record<Tool, string> {
  const m = membership();
  return Object.fromEntries(TOOLS.map((t) => [t, toolDoc(t, m[t].ids)])) as Record<Tool, string>;
}

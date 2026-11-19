// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import { LOAD_FAILURES } from '../src/core/licence/failure';
import { RULE_DOCS } from '../src/core/rules/docs';
import { RULES } from '../src/core/rules/registry';
import type { RuleDoc } from '../src/core/rules/docs/types';
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
 * THE TEXT of a rule is the hand-written description in src/core/rules/docs/<family>.ts (checks, fires, example, action: see docs/types.ts), checked
 * against the code that raises the rule. The generator carries no prose about any rule: it assembles the stored descriptions with the registry's
 * facts (severity, export policy, thresholds with their sources, citations). The title of a rule is the first sentence of its `checks`. A rule whose
 * family is still unwritten (see PENDING_FAMILIES in test/rules/rule-docs.test.ts) is printed without the description fields.
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

const LIC_IDS = ['LIC-MISSING', 'LIC-FREE-TEXT', 'LIC-TEXT-URI-CONFLICT', 'LIC-ADDED-CONDITIONS', 'LIC-EXTRA-TEXT', 'LIC-OTHER-RIGHTS-ENTRY', 'LIC-AMBIGUOUS', 'LIC-RESTRICTION-CONFLICT', 'LIC-FILES-HELD-BACK', 'LIC-DATACITE-EMPTY', 'LIC-MISMATCH'] as const;
const RECORDLESS = 'convert/validate.ts:77 calls runChecks with records: [] and no ds.metadata; checks/run.ts:57-66 runs checkLicence only per session record';

const COLLECTION_LOAD =
  "raised only by the record loaders (sources/*, app/loadInput.ts), which the collection run never calls: its findings come only from evaluateItem -> checkLicence (collection/fixlist.ts:16-22), its fetch errors become stop reasons (collection/net.ts:217-224, stop.ts), not findings; the only caller of loadInputs is the 'Check this record' panel (pages/CollectionPage.tsx:134), a /check run whose rules are in check.md";

/**
 * Rules the scan places in a tool but the tool cannot raise, each with the evidence (file:line). The scan works per top-level unit, so reaching
 * runChecks counts every rule of the units it imports; these entries correct that, one proven path at a time. Doubtful cases are NOT listed here.
 * Each id must exist in the registry and must otherwise be placed by the scan (tested), so a stale entry fails the test.
 */
export const EXCLUDED: Record<Tool, Readonly<Record<string, string>>> = {
  check: {},
  licence: {},
  collection: {
    ...Object.fromEntries(
      [
        'IN-NO-DATA-FILE',
        'IN-RECORD-INACCESSIBLE',
        'IN-HOST-NOT-ALLOWED',
        'IN-FETCH-BLOCKED',
        'IN-FETCH-TIMEOUT',
        'IN-FETCH-INTERRUPTED',
        'IN-ARCHIVE-TOO-LARGE',
        'IN-ARCHIVE-DAILY-BUDGET',
        'IN-ARCHIVE-BUSY',
        'IN-IPT-HOST-NOT-LISTED',
        'IN-NO-DWC-ARCHIVE',
        'IN-FILE-HELD-BACK',
        'IN-FILE-TOO-LARGE',
        'IN-FILES-NOT-READ',
        'IN-DATAVERSE-FILES',
      ].map((id) => [id, COLLECTION_LOAD]),
    ),
  },
  convert: {
    ...Object.fromEntries(LIC_IDS.map((id) => [id, RECORDLESS])),
    'META-EMPTY-LINK': `${RECORDLESS}; raised only inside checkLicence (checks/licence.ts)`,
    'META-NO-VERSION': `${RECORDLESS}; raised only inside checkLicence (checks/licence.ts)`,
    'META-NO-EXTENT': `${RECORDLESS}; raised only inside checkLicence (checks/licence.ts)`,
    'META-DATE-OUTSIDE-EXTENT': 'needs an extent from a metadata record; the Event table carries no ds.metadata (convert/validate.ts:77, checks/run.ts:71-73)',
    'META-POINT-OUTSIDE-BBOX': 'needs a bounding box from a metadata record; none exists in /convert (convert/validate.ts:77, checks/run.ts:71-73)',
    'META-VARIABLE-MISSING': 'needs the abstract of a metadata record; none exists in /convert (convert/validate.ts:77, checks/run.ts:71-73)',
    'META-NO-POSITIONS': 'the Event table always maps decimalLatitude and decimalLongitude (convert/dwca.ts:64 always: true), so checks/metadata.ts:214 never sees "no positions"',
    'XF-DUPLICATE-SAMPLES': 'checkCrossFile runs only for more than one dataset (checks/run.ts:89); /convert validates one synthetic dataset (convert/validate.ts:77)',
    'XF-DATE-CONFLICT': 'checks/run.ts:89 (more than one dataset); /convert has one (convert/validate.ts:77)',
    'XF-STATION-ALIAS': 'checks/run.ts:89 (more than one dataset); /convert has one (convert/validate.ts:77)',
    'XF-UNIT-CONFLICT': 'checks/run.ts:89 (more than one dataset); /convert has one (convert/validate.ts:77)',
    'XF-POSITION-SWAP': 'checks/run.ts:89 (more than one dataset); /convert has one (convert/validate.ts:77)',
    'XF-POSITION-CONFLICT': 'checks/run.ts:89 (more than one dataset); /convert has one (convert/validate.ts:77)',
    'IN-RECORD-INACCESSIBLE': 'raised only by the record loaders (licence/load.ts, sources/*); /convert fetches nothing and passes records: [] (convert/validate.ts:77)',
    'IN-HOST-NOT-ALLOWED': 'raised only by the record loaders (licence/load.ts, sources/*); /convert fetches nothing (convert/validate.ts:77)',
    'IN-FETCH-BLOCKED': 'raised only through fetchErrorFinding (sources/fetcher.ts:266), called by loaders /convert does not use',
    'IN-FETCH-TIMEOUT': 'raised only through fetchErrorFinding (sources/fetcher.ts:266), called by loaders /convert does not use',
    'CHEM-UNIT-PAIR': 'checkChemistry runs on the Event table only (checks/run.ts:82 via convert/validate.ts:77); its variables are the fixed Event columns (convert/dwca.ts:56-81), of which only sampleSizeValue is a variable, with no canonical name and no unit, so no mass/amount pair exists (checks/chemistry.ts:65-69)',
    'CHEM-DIC-GT-TA': 'checks/chemistry.ts:131-132 needs variables with canonical DIC and TA; the Event table (convert/dwca.ts:56-81) has none, and the measured values go to the eMoF table, which is not run through runChecks (convert/validate.ts:77, 199)',
    'CHEM-RANGE': 'checks/chemistry.ts:181-191 needs a temperature, salinity, oxygen, pH or dbar variable; the only Event variable is sampleSizeValue, with no canonical name and no unit (convert/dwca.ts:56-81; its unit stands in sampleSizeUnit, a volume or area: convert/build.ts:2658)',
    'ROW-SHIP-SPEED': 'checkShipSpeed groups by a cruise column or the singleCruise tick (checks/speed.ts:381-396); the Event table has no cruise column (convert/dwca.ts:57-80) and validate.ts:77 passes no singleCruise',
    'ROW-SHIP-SPEED-UNUSUAL': 'same as ROW-SHIP-SPEED (checks/speed.ts:381-396, convert/validate.ts:77)',
    'ROW-SHIP-SPEED-PAIR': 'same as ROW-SHIP-SPEED (checks/speed.ts:381-396, convert/validate.ts:77)',
    'ROW-ON-LAND': 'runs only with a land mask (checks/rows.ts:890 "if (ctx.land)"); convert/validate.ts:77 passes none',
    'ROW-ON-LAND-NEAR': 'runs only with a land mask (checks/rows.ts:890 "if (ctx.land)"); convert/validate.ts:77 passes none',
    'ROW-JOIN-AMBIGUOUS': 'emitted only in the sheet-join builder (dataset.ts:950); /convert calls buildDatasets once, on its flat Event table (convert/validate.ts:76), which has no join; its own join rules are in convert/sampleJoin.ts',
    'ROW-JOIN-KEY-BLANK': 'emitted only in the sheet-join builder (dataset.ts:939); /convert calls buildDatasets once, on its flat Event table (convert/validate.ts:76), which has no join',
    'ROW-KEY-IGNORED': 'emitted only for an explicit ignore list (dataset.ts:1342-1369); /convert builds its Event table with none (convert/validate.ts:76)',
    'ROW-LONG-KEY-EXTENDED': 'emitted only in the long-sheet reader (dataset.ts:1416); /convert reads long sheets in its own pivot (convert/pivot.ts:348-362), which raises CONV-LONG-DUPLICATE',
    'ROW-LONG-VALUE-SKIPPED': 'emitted only in the long-sheet reader (dataset.ts:1500); /convert reads long sheets in its own pivot, which raises CONV-LONG-DUPLICATE (convert/pivot.ts:357)',
    'ROW-LONG-NO-PARAMETER': 'emitted only in the long-sheet reader (dataset.ts:1498); /convert raises CONV-LONG-NO-PARAMETER for the same rows (convert/pivot.ts:358)',
    'ROW-HEADER-CODE-SHAPE': 'checks/rows.ts:667 reads the headers of the Event table, which are the fixed Darwin Core columns (convert/dwca.ts:56-75); the headers of the source are checked by CONV-NERC-CODE-MALFORMED (convert/build.ts:1381)',
    'ROW-DEPTH-SIGN': 'raised only when the depth direction is unknown (checks/rows.ts:697); the Event table depth columns are minimumDepthInMeters and maximumDepthInMeters, always positive down (recognize/columns.ts:447-448, 1101-1103; dataset.ts:1868-1869)',
  },
};

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
  'Each rule has four short parts: what it checks, when it fires, an invented example, and what the person can do.';

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
    for (const id of Object.keys(EXCLUDED[tool])) sites.delete(id);
    out[tool] = { ids: RULES.map((r) => r.id).filter((id) => sites.has(id)), sites, filtered };
  }
  return out;
}

/* ---------- one rule ---------- */

/** The title of a rule: the first sentence of its description's `checks`. */
export function titleOf(doc: RuleDoc): string {
  const m = /^.*?[.!?](?=\s|$)/s.exec(doc.checks.trim());
  return (m ? m[0] : doc.checks.trim()).replace(/[.]$/, '');
}

function ruleSection(rule: RuleDef, tool: Tool): string[] {
  const doc = RULE_DOCS[rule.id];
  const lines: string[] = ['', `## ${rule.id}${doc ? ` — ${md(titleOf(doc))}` : ''}`, ''];
  const facts = [`Severity: ${rule.severity}`];
  if (tool === 'convert') facts.push(`Export policy: ${rule.exportPolicy}`);
  lines.push(facts.join(' · '), '');
  if (doc) {
    lines.push(`**What it checks.** ${md(doc.checks)}`, '');
    lines.push(`**When it fires.** ${md(doc.fires)}`, '');
    lines.push(`**Example.** ${md(doc.example)}`, '');
    lines.push(`**What you can do.** ${md(doc.action)}`, '');
  }
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
  for (const r of rules) out.push(...ruleSection(r, tool));
  out.push('');
  return out.join('\n');
}

/** All four references, keyed by tool. */
export function perToolDocs(): Record<Tool, string> {
  const m = membership();
  return Object.fromEntries(TOOLS.map((t) => [t, toolDoc(t, m[t].ids)])) as Record<Tool, string>;
}

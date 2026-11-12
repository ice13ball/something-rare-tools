# /convert sample-sheet join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /convert joins a results sheet to the sheet (or file) that describes its samples after the person confirms the link, resolves every value the two sheets share without a silent fill or overwrite, and converts the merged sheet as one table.

**Architecture:** A pure core module `src/core/convert/sampleJoin.ts` proposes joins (ranking extracted from /check's `findJoin`) and merges a confirmed pair into ONE `ConvertSheetInput` (results rows + description cells, one column per quantity, a provenance table `SampleJoinInfo`). The worker applies it in `inputsOf`, the way it already replaces a long sheet by its pivot; `convert()` gains three small paths keyed on `sin.sampleJoin` (description-only events, findings remapped to description lines, the description sheet's ledger). Nothing runs differently for an input without `sampleJoin`.

**Tech Stack:** Vite + React + TypeScript, vitest (+ @testing-library/react for the page), 4-language i18n (`src/core/i18n/ui.ts`, rule texts with plural tokens in `src/core/rules/convert.ts`).

**Spec:** `docs/superpowers/specs/2026-11-12-convert-sample-sheet-join-design.md` (approved 12.11; sections 5, 6 and 6a are binding). Base commit of this plan: `151882d` (code identical to `b7a0017`).

**Where the plan reads the spec one way (flagged for Michał):**
1. Spec test 6 ("later" dates one group, "earlier" another) contradicts decision 4 (one group per quantity, 12.11, binding): the plan follows decision 4; test 6 becomes "four differing dates form one `date` group; the same-pair action covers identical pairs".
2. §8 says `parse` returns the proposal; the proposal must read the roles on screen and C3 needs `CONV-JOIN-PROPOSED` among the conversion's findings, so it is computed per `convert` request and sent in `ConvertView.sampleJoin`.
3. Per-sample exceptions name sample codes, which the companion file never holds; a group answered with exceptions is saved as `mixed` and re-opens.
4. Decision 6 works for results sheets with different sample codes; two results sheets that share codes still collide (`CONV-ID-DUPLICATE`, as today: the "more results for the same samples" non-goal).
5. The P1 answer gets its own info rule `CONV-JOIN-RESULTS-ONLY` with "Ask again" (the pattern of every other answer), a ninth code next to the spec's eight tentative ones.

**Execution notes:** model per task (global CLAUDE.md policy): Tasks 1, 4, 5, 6, 7, 8 are integration-heavy (Sonnet 5.5 `high`); Tasks 2, 3, 9 default (Sonnet 5.5 `medium` via Workflow); Task 10 and the final branch review stay in the main thread (Opus). One test-heavy agent at a time.

## Global Constraints

- Every new file starts with the two header lines of `scripts/spdx-header.txt`: `// SPDX-License-Identifier: AGPL-3.0-or-later` and `// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`.
- Page strings in 4 languages (en, pl, de, fr) in `src/core/i18n/ui.ts` (the `pl`/`de`/`fr` objects are typed `Record<UiKey, string>`: a missing key fails `tsc`). Rule texts in `src/core/rules/convert.ts` with Polish plural tokens `{+count:one|few|many}`; then `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts` regenerates `docs/rules.md`.
- Tests on the Mac: `nice -n 15 npx vitest run <path> --maxWorkers=2`, only the scoped dirs a task names (test/convert, test/app, test/rules, test/server, test/recognize, test/checks); never the full suite. End of every task: `npx tsc --noEmit -p .` with no new errors.
- Commit by explicit paths only (`git add <path> …`, never `-A`/`.`). Messages are plain descriptive English sentences (no `feat:`), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unit tests use invented data only (the spec's `book.xlsx`: `Counts`, `Samples`, codes `X01`–`X04`, stations `ST-1`–`ST-3`); no real institution, station, person or dataset; real data never enters the repo.
- Declare-first (Michał, 02.11): nothing joins until the person confirms. The proposal reads only roles already on screen (sample code, station, cruise, picked key parts, taxon) and header equality; no new heuristic that guesses a role from values.
- Spec C3: an input without a confirmed join converts byte-for-byte as today: same archive files, same findings; the only addition for an unconfirmed workbook is the info finding `CONV-JOIN-PROPOSED`. Golden tests must show no diff: `GOLDEN_DIR=/Users/ice13ball/data/sprawdzarka-golden/2026-10-16 nice -n 15 npx vitest run --maxWorkers=2 test/golden` (report the test count: a run with everything skipped is a failure). Never open that directory by hand.
- /check behaviour is unchanged by the extraction of `findJoin`'s ranking (`test/recognize/join-key.test.ts`, `test/checks/join-nonunique-stations.test.ts` green with no edit; golden diff identical).
- Principle 5: scientific data is never removed or altered silently. Every cell of both sheets reaches the archive or is listed in the not-written file with a reason.
- An answer that changes what is written travels with the number it was given for and holds only when today's analysis finds the same number (`dropCopiesCount` pattern); a companion-file answer whose numbers differ re-opens the question. The companion file holds names, hashes and counts, never a data value.

## Review Focus

- **Key cells of different types across files** (typed `1` in `Samples` of an xlsx, text `1` in `results.csv`; `X01 ` with a trailing space): keys compare as `String(cell).trim()` exactly like /check's `keyValues`, so `1`↔`"1"` and `X01 `↔`X01` join, while `"1.0"`↔`1` does not and is NAMED by `CONV-JOIN-NO-DESCRIPTION`, never dropped. Test in Task 4.
- **A description row with a blank key cell** holds values that can be lent to nobody: listed in the not-written file with reason `join-no-key`, the description ledger stays balanced. Test in Task 7.
- **The confirmed pair no longer matches the request** (the description sheet unticked, a key column re-roled or out of range, a sheet re-pivoted): the join is not applied, the proposal shows again, nothing merges silently, no exception thrown. Test in Task 8.
- **A results sheet with a picked sample key and no code column**: the join key is the picked key columns; appended description-only rows fill those columns, so their events get the same IDs the key would make. Test in Task 6.
- **A description header equal to a results header with another role** (`Depth` as a variable in `Samples`, a depth in `Counts`; two `Sample` columns): merged headers stay unique (`" (2)"`, as `pivot.ts` does), and a finding on the renamed column names the description sheet and its own header. Test in Task 4.

---

### Task 1: Extract the join-key ranking from `findJoin`; /check unchanged

**Files:**
- Modify: `src/core/recognize/layout.ts:199-315` (KEY_KINDS … `findJoin`)
- Test: `test/recognize/join-rank.test.ts` (new); unchanged and must stay green: `test/recognize/join-key.test.ts`, `test/recognize/layout.test.ts`, `test/checks/join-nonunique-stations.test.ts`

**Interfaces:**
- Produces (exported from `layout.ts`):
  ```ts
  export interface KeySide { sheet: RawSheet; columns: readonly { index: number; header: string; role: { kind: string } }[]; consumed?: ReadonlySet<number> }
  export interface RankedJoin { right: number /* index into `rights` */; leftKey: number; rightKey: number; score: number; unique: boolean; fine: number;
    extraKeys?: { leftKey: number; rightKey: number }[]; /** distinct left key values found on the right / all distinct left key values */ covered: number; total: number }
  export function rankJoinKeys(left: KeySide, rights: readonly KeySide[], opts: { coverage: 'all' | 'measure'; kinds?: ReadonlySet<string> | 'any' }): RankedJoin | undefined
  ```
- `coverage: 'all'` is today's subset test (a candidate is dropped unless every left value is on the right; the composite check likewise). `'measure'` keeps a candidate with `covered ≥ 1` and ranks by `covered/total` first, then today's order (unique → score → fine); with `'all'` every kept candidate has `covered === total`, so the order is today's. `kinds` defaults to `KEY_KINDS` (/check); `'any'` lets the caller pre-filter the left columns (/convert: a picked key part may be a `date`), while a right column still needs the same header or a strong kind, as today.
- `findJoin(meas, coordSheets)` becomes a thin wrapper: `rankJoinKeys({ sheet, columns: proposals, consumed }, coordSheets.filter(c => c !== meas).map(…), { coverage: 'all' })`, mapped back to `JoinCandidate`.

- [ ] **Step 1: Write the failing test** `test/recognize/join-rank.test.ts` with invented sheets:
  - `rankJoinKeys` with left `Sample` = X01, X02, X04 and right `Sample` = X01, X02, X03: `'all'` → `undefined`; `'measure'` → `{ leftKey: 0, rightKey: 0, covered: 2, total: 3, unique: true }`.
  - Two right candidates, one covering 3/3 by a weak `ignore` column with the same header, one covering 2/3 by a `sampleId` column: `'measure'` picks the 3/3 one (coverage first).
  - Composite: right `Cruise, Station` with `Station` repeated across cruises, left has both → `extraKeys` set, `unique: true` (same as join-key.test's composite case, now through `rankJoinKeys`).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/recognize/join-rank.test.ts --maxWorkers=2` — Expected: FAIL (`rankJoinKeys` is not exported).
- [ ] **Step 3: Implement** `rankJoinKeys` by moving the body of `findJoin` (subset test → coverage count; composite tuple check counts covered tuples) and rewrite `findJoin` as the wrapper.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/recognize test/checks --maxWorkers=2` — Expected: PASS, no test file edited.
- [ ] **Step 5: Golden.** Golden diff of /check before/after (base worktree `git worktree add --detach ../base-151882d 151882d`): `GOLDEN_DIFF_MODE=dump GOLDEN_DIFF_OUT=/tmp/join-before.json GOLDEN_DIFF_REPO=../base-151882d nice -n 15 npx vitest run --config vitest.golden-diff.config.ts --maxWorkers=2`, the same with `GOLDEN_DIFF_OUT=/tmp/join-after.json` and no REPO, then `GOLDEN_DIFF_MODE=compare GOLDEN_DIFF_BEFORE=/tmp/join-before.json GOLDEN_DIFF_AFTER=/tmp/join-after.json …` — Expected: identical, "golden-diff: N entries" with N > 0. Then the golden tests with `GOLDEN_DIR` (Global Constraints) — Expected: PASS, count reported. Remove the base worktree by its explicit path afterwards.
- [ ] **Step 6:** `npx tsc --noEmit -p .`, then commit `src/core/recognize/layout.ts test/recognize/join-rank.test.ts` — "The join-key ranking of /check is extracted into rankJoinKeys, which can also measure how many left keys the right sheet covers; /check calls it with the old subset rule and proposes the same joins."

### Task 2: The CONV-JOIN rule codes, their policy and docs/rules.md

**Files:**
- Modify: `src/core/rules/convert.ts` (header comment table + rule objects, next to `CONV-KEY-PICKED` at ~:296), `src/core/convert/policy.ts:39-79` (`BLOCK_CONV_RULES`), `policy.ts` `ACCEPT_RULES`, `docs/rules.md` (regenerated)
- Test: `test/convert/rules.test.ts`, `test/convert/policy.test.ts`, `test/rules/registry.test.ts`, `test/rules/rules-doc.test.ts`

**Interfaces:**
- Produces nine rule ids, params as listed (generic `file`, `sheet`, `lines`, `field`, `value` as usual; `file`/`sheet` are the RESULTS sheet unless said):

  | id | severity / policy | params | text says |
  |---|---|---|---|
  | `CONV-JOIN-PROPOSED` | info / show | `description`, `descriptionFile`, `keys`, `covered`, `samples` | sheet `description` seems to describe the samples of this sheet, linked by `keys`; `covered` of `samples` samples found; nothing is joined until confirmed |
  | `CONV-JOIN-CONFLICT` | error / block | `what`, `group`, `count`, `examples` | `what` differs in `count` samples between the two sheets; choose per group or per sample |
  | `CONV-JOIN-CONFLICT-CHOSEN` | info / show | `what`, `count`, `fromDescription`, `fromResults` | what was taken from where |
  | `CONV-JOIN-NO-DESCRIPTION` | error / block | `count`, `samples`, `description` | these samples have no row in `description`; button "convert them with only what this sheet says" |
  | `CONV-JOIN-RESULTS-ONLY` | info / show | `count`, `samples` | the answer to the above (pattern of `CONV-ROW-COPIES-DROPPED`), with "Ask again"; `fromFile` variant |
  | `CONV-JOIN-DESCRIPTION-ONLY` | warning / accept | `count`, `samples`, `description` | samples described with no results: written as sample events with no occurrence |
  | `CONV-JOIN-AMBIGUOUS` | error / block | `count`, `keys`, `description` | `file`/`sheet`/`lines` = the DESCRIPTION rows; a key with several different rows |
  | `CONV-JOIN-KEY-BLANK` | error / block | `count`, `columns` | results rows with a blank key part (as `ROW-JOIN-KEY-BLANK`) |
  | `CONV-JOIN-FILLED` | info / show | `count`, `column`, `from` | one per column: `count` blank cells filled from sheet `from` |

- [ ] **Step 1: Write the failing tests:** in `test/convert/rules.test.ts`, `sev('CONV-JOIN-CONFLICT')` is `'error'`, `sev('CONV-JOIN-DESCRIPTION-ONLY')` is `'warning'`, `sev('CONV-JOIN-PROPOSED')` is `'info'`; `renderConvertPlain` of `CONV-JOIN-NO-DESCRIPTION` with `{ count: 1, samples: 'X04' }` in `pl` contains `X04` and the singular form, with `count: 2` and `count: 5` the two plural forms; in `policy.test.ts`, `policyOf` gives `accept` for DESCRIPTION-ONLY and `block` for CONFLICT, NO-DESCRIPTION, AMBIGUOUS, KEY-BLANK.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/rules.test.ts test/convert/policy.test.ts --maxWorkers=2` — Expected: FAIL (unknown rule id).
- [ ] **Step 3: Implement** the nine rule objects (plain en/pl/de/fr + `technical`), the comment table rows, and the policy lists.
- [ ] **Step 4: Regenerate and run:** `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts`, then `nice -n 15 npx vitest run test/rules test/convert/rules.test.ts test/convert/policy.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/rules/convert.ts src/core/convert/policy.ts docs/rules.md test/convert/rules.test.ts test/convert/policy.test.ts` — "The converter has nine CONV-JOIN rules for the sample-sheet join, in four languages, with their export policy; docs/rules.md lists them."

### Task 3: `proposeSampleJoins`

**Files:**
- Create: `src/core/convert/sampleJoin.ts` (types + proposal only in this task)
- Create: `test/convert/joinFixtures.ts` (the spec's `book.xlsx` and variants), `test/convert/sample-join-propose.test.ts`

**Interfaces:**
- Consumes: `rankJoinKeys`, `KeySide` (Task 1).
- Produces (in `sampleJoin.ts`; sheets are addressed by their index in the `ConvertSheetInput[]` handed in, so two files with one name never mix):
  ```ts
  export type JoinSide = 'description' | 'results';
  export interface JoinKeyPair { results: number; description: number }           // column indexes
  export interface SampleJoinProposal { results: number; description: number; keys: JoinKeyPair[]; covered: number; samples: number; unique: boolean }
  export function proposeSampleJoins(sheets: readonly ConvertSheetInput[], skip: readonly { results: number; description: number }[]): SampleJoinProposal[]
  ```
- Results sheet = an input whose mapping has a `taxon` role and no `profile`. Description candidates = every other non-profile input with NO taxon role. Left key columns = the `sampleId` column, or the picked `sampleKey.columns`, plus `station` / `cruise` columns; right columns = `sampleId` / `station` / `cruise` roles or a header equal after `stripTypeSuffix().toLowerCase()`. `rankJoinKeys(…, { coverage: 'measure' })`; propose only when `covered * 2 >= total`. One description may be proposed for several results sheets (decision 6); a results sheet gets at most one proposal. `skip` = pairs already confirmed or declined.
- `joinFixtures.ts` exports `BOOK` (`xlsxFile('book.xlsx', { Counts: [...], Samples: [...] })` with the spec's rows), `bookInputs(variant?)` returning `ConvertSheetInput[]` via `sheetInput`-style proposals, and CSV twins `RESULTS_CSV`, `SAMPLES_CSV` for Task 8.

- [ ] **Step 1: Write the failing tests:**
  - `book.xlsx`: `proposeSampleJoins(bookInputs(), [])` equals `[{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], covered: 2, samples: 2, unique: true }]`.
  - Two files `results.csv` + `samples.csv` (same rows): the same proposal with indexes 0 and 1.
  - `Phyto` and `Zoo` results sheets (codes X01–X02 and X05–X06) + `Samples` (X01–X06): two proposals, both with `description: 2`.
  - Spec test 10: `Counts` = Cruise | Station | Taxon | Count, `Samples` = Cruise | Station | Date … with `ST-1` in cruises `C1` and `C2`: keys `[{ Cruise↔Cruise }, { Station↔Station }]` (order as `rankJoinKeys` gives), `unique: true`.
  - No taxon sheet anywhere → `[]`; the pair in `skip` → `[]`; `Samples` sharing only 1 of 4 codes → `[]`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-propose.test.ts --maxWorkers=2` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `proposeSampleJoins` as above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts test/convert/joinFixtures.ts test/convert/sample-join-propose.test.ts` — "proposeSampleJoins proposes which sheet describes the samples of a results sheet and by which key, from the roles on screen, across sheets and files; nothing is joined by it."

### Task 4: `mergeSampleSheets`: matching, lending and provenance

**Files:**
- Modify: `src/core/convert/sampleJoin.ts`; `src/core/convert/build.ts:63-144` (add the optional field `sampleJoin?: SampleJoinInfo` to `ConvertSheetInput`, doc comment only; build.ts reads it from Task 6)
- Test: `test/convert/sample-join-merge.test.ts` (new)

**Interfaces:**
- Consumes: `JoinKeyPair`, `JoinSide` (Task 3); `specsOf`, `metaParser`, `Collector` (`src/core/dataset.ts:110, 298`), `makeConvertFinding`.
- Produces:
  ```ts
  export interface ConflictAnswer { group: string; take: JoinSide; count: number; exceptions: { sample: string; take: JoinSide }[] }
  export interface SampleJoinDecl {
    results: ConvertSheetInput; description: ConvertSheetInput; keys: JoinKeyPair[];
    conflicts: readonly ConflictAnswer[];
    /** P1 answer: the number of results samples without a description it was given for */ resultsOnly?: number; resultsOnlyFromFile?: boolean;
    /** join-key values of the description that another results sheet of the same description holds (decision 6) */ heldElsewhere?: ReadonlySet<string>;
    /** append the description-only rows here (true for the first results sheet of a description only) */ appendDescriptionOnly: boolean;
  }
  export interface SampleJoinInfo {
    results: { file: string; sheet: string; width: number; lines: ReadonlySet<number> };
    description: { file: ParsedFile; sheet: RawSheet; mapping: SheetMapping };
    /** per merged column: where it came from ('resolved' = written by the merge, Task 5) and its own header */
    columns: readonly { side: JoinSide | 'resolved'; index: number; header: string }[];
    /** merged line → the description line lent to it */ lentFrom: ReadonlyMap<number, number>;
    /** merged lines appended for description-only samples (P2) → description line; numbered after the last results line */ descriptionOnly: ReadonlyMap<number, number>;
    /** `${mergedLine}:${mergedColumn}` → description line, for results-column cells whose value came from the description (P4 fill, a 'description' choice) */ takenFromDescription: ReadonlyMap<string, number>;
    /** merged columns the merge consumed (keys, the losing side of a shared quantity): never listed as ignored or not exported */ consumed: ReadonlySet<number>;
    /** P7: values not chosen, with both lines */ notChosen: readonly { side: JoinSide; line: number; column: number; otherLine: number; group: string; chosen: string }[];
    /** description lines with a blank key part, ambiguous lines */ noKey: readonly number[]; ambiguous: readonly number[];
  }
  export interface ConflictEntry { sample: string; descriptionLine: number; descriptionText: string; resultsText: string; resultsLines: number[]; samples: string[]; take?: JoinSide }
  export interface ConflictGroup { group: string; quantity: 'date' | 'position' | 'depth' | 'station' | 'cruise' | 'variable' | 'other'; label: string; count: number; entries: ConflictEntry[]; answer?: ConflictAnswer }
  export interface MergeResult { input: ConvertSheetInput /* results input with file/sheet replaced by the merged ones and sampleJoin set */; findings: Finding[]; conflicts: ConflictGroup[]; descriptionKeys: ReadonlySet<string> }
  export function mergeSampleSheets(decl: SampleJoinDecl): MergeResult
  ```
- The merged `ParsedFile` is a shallow copy of the results file whose results sheet is replaced; the merged sheet keeps the results sheet's NAME (event IDs and key prefix unchanged). Header = results header + description header, a description header equal to an existing one gets `" (2)"` (`" (3)"` …). Mapping = results mapping + description mapping shifted by the results width; description key columns `ignore` + consumed. `sample` of an entry = the join-key value text (composite: `JSON.stringify(parts)`), i.e. the description row (spec C2).
- Key text = `String(cell).trim()` (as `layout.ts` `keyValues`). Description rows that repeat identically are one row; rows of one key that differ in any non-blank description cell → P3 (`CONV-JOIN-AMBIGUOUS`, lines = those description lines, nothing lent for that key). Results rows with a blank key part → P6 (`CONV-JOIN-KEY-BLANK`, nothing lent). Results samples with no description → P1 (`CONV-JOIN-NO-DESCRIPTION`, sample names) unless `resultsOnly` equals today's count, then `CONV-JOIN-RESULTS-ONLY` (info, `fromFile` param when `resultsOnlyFromFile`). Description keys used by no results row and not in `heldElsewhere` → appended rows when `appendDescriptionOnly` (results cells blank except the results key columns, set to the key parts) + `CONV-JOIN-DESCRIPTION-ONLY`.
- In this task a quantity present on both sides is compared only for "blank on one side" (P4: fill, one `CONV-JOIN-FILLED` per column with its count); a both-sides difference is left to Task 5 (this task's tests have none).

- [ ] **Step 1: Write the failing tests** (values from spec §9 via `joinFixtures`):
  - Spec test 2 (merge level): merged sheet name `Counts`, 3 rows; row of `X01` line 2 carries `ST-1`, `2021-05-03`, `61.1`, `4.2`, `10` in the description columns; `info.lentFrom.get(2) === 2`; mapping of the `Samples` `Sample` column is `ignore` and in `consumed`.
  - Spec test 3: `X03` appended as one row (line > last `Counts` line), `info.descriptionOnly` maps it to `Samples` line 4; finding `CONV-JOIN-DESCRIPTION-ONLY` `{ count: 1, samples: 'X03' }`; with `heldElsewhere: new Set(['X03'])` nothing appended; with `appendDescriptionOnly: false` nothing appended.
  - Spec test 4: `Counts` + (`X04`, *Oithona similis*, 1): `CONV-JOIN-NO-DESCRIPTION` with `samples: 'X04'`, severity error; with `resultsOnly: 1` it is gone and `CONV-JOIN-RESULTS-ONLY` `{ count: 1 }` is there; with `resultsOnly: 2` the error stays.
  - Spec test 8: `Counts` gains `Depth` with `X02` = 20 and `X01` blank: X01's depth cell filled with `10`, `CONV-JOIN-FILLED` `{ count: 1, column: 'Depth', from: 'Samples' }`, `takenFromDescription.get('2:<depth col>') === 2`.
  - Spec test 9: `Samples` lists `X01` twice with depths 10 and 15 → `CONV-JOIN-AMBIGUOUS` with lines `[2, 5]`; twice identically → no finding, X01 lent once.
  - P6: a `Counts` row with blank `Sample` → `CONV-JOIN-KEY-BLANK` naming its line.
  - Spec test 10 (merge): keys Cruise + Station, `ST-1` in cruises `C1` and `C2` of `Samples` → each `Counts` row gets the row of its own cruise; no `CONV-JOIN-AMBIGUOUS`.
  - C2: `Samples` keyed by `Station` (`ST-1` once), `Counts` samples `X01`, `X01b` both at `ST-1` → both lent `Samples` line 2; `notChosen` empty.
  - Review Focus 1: typed `1` (xlsx) ↔ text `"1"` (csv) joins; text `"1.0"` ↔ typed `1` → `CONV-JOIN-NO-DESCRIPTION` names `1.0`.
  - Review Focus 5: `Samples` has `Depth` as a variable while `Counts` has a `Depth` depth column → merged header has `Depth` and `Depth (2)`; `info.columns[w + k]` = `{ side: 'description', header: 'Depth' }`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-merge.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** `mergeSampleSheets` (matching, P1/P2/P3/P4/P6, provenance) as specified above.
- [ ] **Step 4: Run** the same command plus `test/convert/sample-join-propose.test.ts` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts src/core/convert/build.ts test/convert/sample-join-merge.test.ts` — "mergeSampleSheets attaches the confirmed description row to every results row by key, lists samples without a description, descriptions without results, ambiguous and blank keys, fills only blank cells and says so, and keeps where every merged cell came from."

### Task 5: `mergeSampleSheets`: conflicts, groups and answers

**Files:**
- Modify: `src/core/convert/sampleJoin.ts`
- Test: `test/convert/sample-join-conflicts.test.ts` (new)

**Interfaces:**
- Consumes/extends Task 4's `mergeSampleSheets`, `ConflictGroup`, `ConflictAnswer`, `SampleJoinInfo.notChosen`; `shortHash` (`keySetting.ts:20`); `eventDateText` (`events.ts:124`).
- Quantities and group ids (spec C1, decision 4): `date` (roles date, datetime, datePart, time; compared on `metaParser(...)(row).datetime` via `eventDateText`), `position` (latitude, longitude, hemisphere; compared on `Meta.lat/lon`), `depth` (every `depth` bound; compared on min/max in metres as `build.ts` reads them), `station`, `cruise` (trimmed text), `v.<shortHash(name + '\u0000' + unit)>` for a variable (role `variable`, same name and unit; compared with `parseNumber`), `r.<kind>` for any other shared role (text). A header match alone is not a shared quantity. One group per quantity; `label` = the headers involved.
- Equal after reading (P5) is no conflict and keeps the results cells. A difference → an entry under its group; `CONV-JOIN-CONFLICT` per unanswered group (`count` = entries, `examples` = up to 3 `sample: description / results`). An answer holds only when `answer.count === today's count`; then per entry `take = exceptions.find(sample)?.take ?? answer.take`, `CONV-JOIN-CONFLICT-CHOSEN` with the tallies, and the losing cells go to `info.notChosen` with both lines.
- Output columns (the algorithm the tests do not fix): for a quantity on both sides, when both sides use the same column structure (same role kinds, bounds, date parts) the results columns carry the role and receive the chosen side's raw cells (verbatim text of the chosen side, P5); the description's columns of that quantity become `ignore` + consumed. When the structures differ (a Date column against Year/Month/Day; one depth against top/bottom) and any row takes the description side, the merge appends `resolved` columns (date: one `datetime` column holding `eventDateText` of the chosen side; depth: min and max holding the chosen side's texts, a single depth giving both) and both sides' columns of that quantity become `ignore` + consumed. Never two columns of one role in the merged mapping (`colsOf` takes the first).

- [ ] **Step 1: Write the failing tests:**
  - Spec test 5: `Counts` gains `Date`, X01 = `2021-05-02`: one group `date` with one entry `{ sample: 'X01', descriptionText: '2021-05-03', resultsText: '2021-05-02' }`, finding `CONV-JOIN-CONFLICT` (error). Answer `{ group: 'date', take: 'description', count: 1, exceptions: [] }` → merged X01 date cell `2021-05-03`, no CONFLICT, `CONV-JOIN-CONFLICT-CHOSEN` `{ fromDescription: 1, fromResults: 0 }`, `notChosen` = `[{ side: 'results', line: 2, otherLine: 2, group: 'date' }]`. Exception `[{ sample: 'X01', take: 'results' }]` with the same bulk → cell `2021-05-02`, `notChosen[0].side === 'description'`.
  - Spec test 6, as decision 4 binds it (one group per quantity): three samples whose description date is later than the results date and one earlier → ONE group `date` with `count: 4`; two of them with the identical pair (`2021-05-03` / `2021-05-02`) → an answer whose exceptions list both of that pair (what the page's "apply to all with the same pair" sends) changes exactly those two.
  - Spec test 7: `03.05.2021` against `2021-05-03` → no group, results cell kept verbatim.
  - Re-open: answer `count: 3` while today finds 4 → `CONV-JOIN-CONFLICT` still there, merged cells unchanged.
  - C1: `Counts` with Year/Month/Day = 2021/5/3 against `Samples` Date `2021-05-03` → no conflict; with Day = 2 → group `date`; after `take: 'description'` the merged mapping has exactly one date-like role on a `resolved` column holding `2021-05-03`, and both Y/M/D and the `Samples` Date are `ignore` + consumed.
  - C2: station-level depth `10` in `Samples` against per-sample depths `10` and `12` in `Counts` for two samples of `ST-1` → one entry (12 vs 10) in group `depth`; bulk `take: 'results'` keeps both results depths.
  - Variable: `Temperature [degC]` in both sheets, 4.5 vs 4.7 for X01 → group `v.<hash>` with label `Temperature [degC]`; `Temperature [degF]` in one sheet is NOT the same quantity (no group, both columns kept).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-conflicts.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the comparison, groups, answers and output columns as above.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert/sample-join-conflicts.test.ts test/convert/sample-join-merge.test.ts test/convert/sample-join-propose.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts test/convert/sample-join-conflicts.test.ts` — "Values the two sheets both give are compared after the converter's own reading; differences form one group per quantity that blocks until the person takes one side for all, with per-sample exceptions, and the value not taken is kept with both lines."

### Task 6: `convert()` reads a merged sheet: description-only events, remapped findings, several results sheets

**Files:**
- Modify: `src/core/convert/build.ts` — `:476-525` (`unreadColumns`, `ignoredColumns`: skip `sin.sampleJoin.consumed`), `:1897-1975` (row loop: `relevant`), `:2003-2060` (after the event is opened: a description-only line writes no occurrence), `:2711-2720` (`sheetSites` for `sampleSplitOf`), `:3076-3080` (after the pivot remap: the join remap)
- Modify: `src/core/convert/sampleJoin.ts` (orchestrator + `joinLines`)
- Test: `test/convert/sample-join-convert.test.ts` (new)

**Interfaces:**
- Consumes: `mergeSampleSheets`, `SampleJoinInfo`, `ConflictGroup` (Tasks 4–5); `proposeSampleJoins` (Task 3).
- Produces:
  ```ts
  export interface SampleJoinRequestCore { results: number; description: number; keys: JoinKeyPair[]; conflicts: ConflictAnswer[]; resultsOnly?: number; resultsOnlyFromFile?: boolean }
  export interface JoinOutcome { sheets: ConvertSheetInput[]; findings: Finding[]; proposals: SampleJoinProposal[]; conflicts: (ConflictGroup & { results: number })[]; /** for each output sheet, the index of the request sheet it came from */ origin: number[] }
  export function joinInputs(sheets: readonly ConvertSheetInput[], joins: readonly SampleJoinRequestCore[], declined: readonly { results: number; description: number }[]): JoinOutcome
  export function joinLines(findings: readonly Finding[], sin: ConvertSheetInput): Finding[]
  ```
- `joinInputs`: drops invalid joins (index out of range, a sheet used twice as results, a description that is itself a results sheet, a key column outside a sheet) silently from the merge and lets the proposal show again; groups joins by description; the first join of a description gets `appendDescriptionOnly: true`, the others `heldElsewhere` = keys the earlier ones used; removes the description inputs; `proposals` = `proposeSampleJoins(sheets, [...joins, ...declined])` with one `CONV-JOIN-PROPOSED` finding each. With `joins` and `declined` empty and no proposal, `sheets` is the input array itself (identity).
- `joinLines` (called in `convert()` for each input with `sampleJoin`, after the pivot remap): a finding on the merged sheet whose `field` is a description column (or a `resolved` column, or a results column cell in `takenFromDescription`), or whose lines are all `descriptionOnly` lines, moves to the description file/sheet, its own header and its description lines, de-duplicated (spec test 11: once, not once per results row).
- Row loop: `const descOnly = sin.sampleJoin?.descriptionOnly.has(row.line) === true`; long shape: `relevant ||= descOnly`; after the sample event is opened, `if (descOnly) { /* sample eMoF, device, mesh as for any sample */ fate.event(row.line); continue; }` before any occurrence code. `sheetSites` excludes events whose source line is a description-only line.

- [ ] **Step 1: Write the failing tests** (`convert({ sheets: joinInputs(bookInputs(), [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []).sheets })`):
  - Spec test 2: events `X01`, `X02` have `eventDate` `2021-05-03` / `2021-05-04`, `decimalLatitude` 61.1 / 61.3, depth 10 / 20, station parent `ST-1` / `ST-2`; occurrences as without the join (3, same IDs); no `CONV-ID-DUPLICATE` (the Q-T5-1 case).
  - Spec test 3, wide AND long `Counts`: one sample event `X03` with no occurrence; `CONV-JOIN-DESCRIPTION-ONLY` present; no `CONV-SAMPLE-PER-ROW` (a long variant with ≥ 30 one-row samples where only description-only events would tip `sampleSplitOf`).
  - Spec test 4 after "results only": event `X04` exists, from `Counts` only, with no `eventDate`.
  - Spec test 11: `Samples` X02 date `2021-13-45` → the date finding names `file: 'book.xlsx', sheet: 'Samples', field: 'Date', lines: [3]`, exactly once.
  - Decision 6: `Phyto` (X01, X02), `Zoo` (X05), `Samples` (X01, X02, X03, X05): `X03` is one event in the whole result; `Samples` is not converted on its own.
  - Review Focus 4: `Counts` without a `Sample` column, picked key `Station + Date` matched to `Samples` `Station + Date`: the appended description-only row gets the ID the key would make (`keyPrefixOf` + parts) and an event.
  - C3 guard: `joinInputs(sheets, [], [])` on a single-sheet file returns the same array object, and `convert` output deep-equals the output without calling `joinInputs`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-convert.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** `joinInputs`, `joinLines` and the build.ts paths above.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert --maxWorkers=2` — Expected: PASS (every existing converter test unchanged).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/build.ts src/core/convert/sampleJoin.ts test/convert/sample-join-convert.test.ts` — "The converter reads a joined sheet as one table: a described sample without results is an event without an occurrence and does not count as a split sample, a finding about a description cell names its own line once, and one description serves several results sheets with each sample written once."

### Task 7: The description sheet's ledger and the not-written file

**Files:**
- Modify: `src/core/convert/ledger.ts:22-75` (reasons), `:194-219` (`SheetLedger`), new `joinLedgers`; `src/core/convert/notWritten.ts:30-71` (`REASON_KIND`), `:118-124` (`sourceOf`); `src/core/convert/build.ts` where `buildSheetLedger` is pushed for a sheet with `sampleJoin` (`:2463`)
- Test: `test/convert/sample-join-ledger.test.ts` (new)

**Interfaces:**
- Consumes: `SampleJoinInfo` (Tasks 4–6).
- Produces:
  - `LedgerReason` += `'join-not-chosen' | 'join-no-key' | 'join-ambiguous'`, appended at the END of `LEDGER_REASONS` (line and lost-cell reasons only, never through `FateLog.cell`, so the 31-bit chain is untouched). `REASON_KIND`: `join-not-chosen` and `join-no-key` → `listed`; `join-ambiguous` → `covered`, `COVERED_BY['join-ambiguous'] = ['CONV-JOIN-AMBIGUOUS']`.
  - `SheetLedger.kind` += `'description'`; `SheetLedger.lent?: { sheet: string; lines: number; samples: number }[]` (which results sheets each description line was lent to, decision 6).
  - `export function combineDescriptionLedgers(parts: readonly SheetLedger[]): SheetLedger` — the description ledgers of one description sheet (one per results sheet it served) as one: a line lent to two results sheets is one written line with two `lent` entries.
  - `export function joinLedgers(merged: SheetLedger, info: SampleJoinInfo): { results: SheetLedger; description: SheetLedger }` — the merged ledger's appended lines move to the description ledger (fate `written`, `wrote: ['event']`); results lines keep their fates; a results line whose value lost a conflict gets `lostCells: [{ index, reason: 'join-not-chosen' }]`; a description line gets `written` when lent, `join-not-chosen` as a lost cell when one of its values lost, `join-no-key` / `join-ambiguous` as its fate. Several merges of one description → one description ledger (`lent` lists each results sheet). `inputIndex` of the description ledger = the first merged input; `sourceOf` returns `sheets[i].sampleJoin.description.sheet` for `kind === 'description'`.
  - The not-written detail of a `join-not-chosen` line names the column, the value taken and the other sheet's line (P7, "with both lines").

- [ ] **Step 1: Write the failing tests:**
  - Spec test 13: the joined `book.xlsx` ledger has a `Counts` entry (`rows.source === 3`, `balanced`) and a `Samples` entry (`kind: 'description'`, `rows.source === 3`, `balanced`, `lent: [{ sheet: 'Counts', lines: 2, samples: 2 }]`); `X03`'s line has `wrote: ['event']`; no `not-used` ledger for `Samples` from the handler (asserted in Task 8).
  - P7 with spec test 5 answered `description`: `notWrittenRows` yields a `Counts` line 2 row with reason `cells-not-written`, detail naming `Date (join-not-chosen)`, `2021-05-03` and `Samples` line 2; the exception variant yields the `Samples` line instead.
  - Review Focus 2: a `Samples` row with a blank `Sample` and a depth → fate `join-no-key`, listed with status `understood`, ledger balanced.
  - P3: the two ambiguous `Samples` lines have fate `join-ambiguous` and status `needs-decision` while `CONV-JOIN-AMBIGUOUS` stands.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-ledger.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the reasons, `joinLedgers`, the call in `convert()` for inputs with `sampleJoin`, and `sourceOf`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert --maxWorkers=2` — Expected: PASS (`ledger*.test.ts`, `notWritten*.test.ts` unchanged).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/ledger.ts src/core/convert/notWritten.ts src/core/convert/build.ts test/convert/sample-join-ledger.test.ts` — "The description sheet of a join has its own balanced ledger that says which results sheets each line was lent to, and the value not chosen in a conflict is listed beside the archive with both lines."

### Task 8: Worker protocol, handler and companion file; APPS.md and the no-joins test

**Files:**
- Modify: `src/worker/convert.protocol.ts` (`ConvertRequestBody`, `ConvertView`), `src/worker/convert.handler.ts:89-180` (parse: settings), `:277` (`inputsOf`), `:315` (`compute`), `:348` (`notUsedLedgers`), `:355` (`run`), `:434` (`previewKey`); `src/core/convert/settings.ts` (format comment, `ConvertSettings`, `readConvertSettings`, `writeConvertSidecar`)
- Modify: `docs/APPS.md:498-499` (§3.4 end), `:1401` (§8.4 Transposed), `:1491` (sampleKey paragraph "whether two sheets hold the same samples is not asked"), new `### 8.11 Joining a results sheet to its sample description` before `## 9.` (`:1906`); `test/convert/no-joins.test.ts` (file comment + `describe` text only: "/convert reads no join that the person has not confirmed")
- Test: `test/app/convertWorker.test.ts` (new `describe('sample join')`), `test/convert/settings.test.ts`

**Interfaces:**
- Consumes: `joinInputs`, `JoinOutcome`, `ConflictGroup` (Task 6); `keyHashes`, `resolveKeyHashes` (`keySetting.ts`).
- Produces:
  ```ts
  // convert.protocol.ts
  export interface SheetRef { fileId: string; sheet: string }
  export interface SampleJoinRequest { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[];
    conflicts: { group: string; take: 'description' | 'results'; count: number; exceptions: { sample: string; take: 'description' | 'results' }[] }[];
    resultsOnly?: number; fromFile?: boolean }
  ConvertRequestBody.sampleJoin?: SampleJoinRequest[];
  ConvertRequestBody.sampleJoinNo?: { results: SheetRef; description: SheetRef }[];
  ConvertView.sampleJoin: { proposals: { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[]; covered: number; samples: number }[];
    conflicts: (Omit<ConflictGroup, 'answer'> & { results: SheetRef })[] }   // entries capped at 500 per group; count is the true number
  // settings.ts
  ConvertSettings.sampleJoin?: { results: [string, string]; description: [string, string]; resultsRows: number; descriptionRows: number; resultsHashes: string; descriptionHashes: string;
    resultsOnly?: number; conflicts: { group: string; take: 'description' | 'results' | 'mixed'; count: number }[] }[];
  ConvertSettings.sampleJoinNo?: { results: [string, string]; description: [string, string] }[];
  ```
  Companion lines (file and sheet names as a JSON array, so a `:` in a name is safe; no data value): `sampleJoin=<rRows>:<dRows>:<rHashes>:<dHashes>:<["rFile","rSheet","dFile","dSheet"]>`, `sampleJoinConflict=<description|results|mixed>:<count>:<group>:<["rFile","rSheet"]>`, `sampleJoinResultsOnly=<count>:<["rFile","rSheet"]>`, `sampleJoinNo=<["rFile","rSheet","dFile","dSheet"]>`. Per-sample exceptions hold sample codes (values), so they are never written: a group answered with exceptions is saved as `mixed` and re-opens as a question.
- Handler: `inputsOf` maps `SheetRef` → request index (only refs present in `body.sheets`; keys checked as whole numbers inside each sheet's width, like `keyOf`), runs `joinInputs`, returns `{ sheets, outcome }`; `compute` prepends `outcome.findings` to `r.findings` and returns the merged `sheets` (so `notWrittenCsv` and ledger `inputIndex` agree); `previewKey` uses the merged sheets; `run` fills `ConvertView.sampleJoin` (indexes mapped back to `SheetRef`); `notUsedLedgers` never lists a description sheet that was merged; `decisionsOf` writes nothing for the join (the page writes the companion, as for `sampleKey`).

- [ ] **Step 1: Write the failing tests:**
  - Spec test 1 (C3): handler on the CSV twins `results.csv` + `samples.csv` (Task 3 fixtures) with no `sampleJoin`: exactly one `CONV-JOIN-PROPOSED`; `CONV-ID-DUPLICATE` still there; `view.findings` minus `CONV-JOIN-PROPOSED` deep-equals the findings of the same request with `sampleJoinNo` set for the pair (no proposal, no merge), and `view.ledger` and `notWritten` are equal too. (Byte identity against the base commit is proven by the golden tests and Task 10.)
  - Confirmed over two files: `sampleJoin: [{ results: { fileId: 'c1', sheet: 'results.csv' }, description: { fileId: 'c2', sheet: 'samples.csv' }, keys: [{ results: 0, description: 0 }], conflicts: [] }]` → no `CONV-ID-DUPLICATE`, `view.ledger` has no `not-used` entry for `samples.csv`, `view.sampleJoin.proposals` empty.
  - Spec test 4 end to end: after `resultsOnly: 1`, `CONV-JOIN-NO-DESCRIPTION` is gone and the export is still refused, by the same rule ids that a one-sheet file holding only the `X04` row (no date) gets today.
  - Review Focus 3: the confirmed join with the description sheet absent from `body.sheets`, or a key index `99`, → no throw, no merge, the proposal is back.
  - Spec test 12 (`settings.test.ts` + handler): `writeConvertSidecar({ sampleJoin: [{ results: ['book.xlsx','Counts'], description: ['book.xlsx','Samples'], resultsRows: 3, descriptionRows: 3, resultsHashes, descriptionHashes, conflicts: [{ group: 'date', take: 'description', count: 1 }] }] })` read back by `readConvertSettings` gives the same object; a `Counts` with 4 rows does not match (`resultsRows` differs) so the join and the conflict choice re-open; `take: 'mixed'` reads back as unanswered.
  - `test/convert/no-joins.test.ts` still passes unchanged in its assertions.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertWorker.test.ts test/convert/settings.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the protocol, handler and settings as above; write APPS §8.11 (proposal, confirmation, P1–P8, C1–C3, companion lines) and the three edits; update the no-joins test's comment and `describe` text.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app/convertWorker.test.ts test/convert test/server --maxWorkers=2` — Expected: PASS; then the golden tests with `GOLDEN_DIR` (Global Constraints) — Expected: PASS, count reported.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/worker/convert.protocol.ts src/worker/convert.handler.ts src/core/convert/settings.ts docs/APPS.md test/convert/no-joins.test.ts test/app/convertWorker.test.ts test/convert/settings.test.ts` — "The convert worker applies confirmed sample joins, sends the proposals and conflict groups to the page, keeps the join and its answers in the companion file by names, hashes and counts only, and APPS.md describes the join."

### Task 9: The page: proposal panel, conflict groups, P1 button

**Files:**
- Create: `src/app/components/ConvertSampleJoin.tsx`
- Modify: `src/app/convertModel.ts:118-131` (`ConvertState`), `:250-286` (`requestOf`), `:328-350` (`initialChoices` neighbour `initialJoins`), new `sampleJoinSettingsOf`; `src/app/pages/ConvertPage.tsx` (state, `chooseForSheet` at `:367` gains `'resultsOnly'`, the finding button near `:1561`, companion download at `:849-853`, panel placement above the findings); `src/core/i18n/ui.ts` (keys `convert.join.*` in en, pl, de, fr)
- Test: `test/app/convertSampleJoin.test.tsx` (new), `test/app/i18n.test.tsx` (parity is already checked)

**Interfaces:**
- Consumes: `ConvertView.sampleJoin`, `SampleJoinRequest`, `ConvertSettings.sampleJoin*` (Task 8).
- Produces:
  ```ts
  export interface JoinChoice { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[]; state: 'confirmed' | 'declined';
    conflicts: SampleJoinRequest['conflicts']; resultsOnly?: number; fromFile?: boolean }
  ConvertState.joins?: JoinChoice[];
  export function initialJoins(parsed: ConvertParseResult): JoinChoice[]          // from the companion: names + hashes + row counts must all match, else nothing
  export function sampleJoinSettingsOf(parsed: ConvertParseResult, joins: readonly JoinChoice[]): Pick<ConvertSettings, 'sampleJoin' | 'sampleJoinNo'>
  // requestOf: confirmed → body.sampleJoin, declined → body.sampleJoinNo
  export function ConvertSampleJoin(props: { view: ConvertView['sampleJoin']; files: ConvertFileSummary[]; joins: JoinChoice[]; onChange: (joins: JoinChoice[]) => void }): JSX.Element | null
  ```
- Panel per proposal: "Sheets {results} and {description} describe the same samples, linked by {keys}" with {covered}/{samples}; buttons Confirm / Change (pick the description sheet and, per key pair, the two columns) / No. Per conflict group: heading "{label} differs in {count} samples", buttons "Take from the description for all" / "Take from the results for all"; under it a table (sample, description value, results value, results samples) with a per-row choice and "Apply to all with the same pair of values"; a row choice made after a bulk choice is an exception and wins. A confirmed join shows "Undo". The P1 finding gets the button "Convert these samples with only what this sheet says" (`chooseForSheet(f, 'resultsOnly')` stores `resultsOnly = f.params.count`); `CONV-JOIN-RESULTS-ONLY` gets "Ask again".

- [ ] **Step 1: Write the failing tests** (`ConvertPage` with `createDirectConvertEngine`, files `results.csv` + `samples.csv` via `chooseFiles`):
  - The panel shows `results.csv`, `samples.csv`, the key `Sample ↔ Sample`; nothing is joined (`CONV-ID-DUPLICATE` still listed).
  - Confirm → the next request has `sampleJoin` with that pair; `CONV-ID-DUPLICATE` gone. No → `sampleJoinNo`, the panel hidden.
  - Spec test 5 on the page: group "Date differs in 1 sample"; "Take from the description for all" → the request carries `{ group: 'date', take: 'description', count: 1, exceptions: [] }`; then the X01 row set to results → `exceptions: [{ sample: 'X01', take: 'results' }]`.
  - Same pair: two rows with the same pair, "Apply to all with the same pair" on one → both in `exceptions`.
  - Spec test 4: the P1 button sends `resultsOnly: 1`; "Ask again" removes it.
  - The companion file written after Confirm contains a `sampleJoin=` line and no sample code.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertSampleJoin.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the model functions, the component, the page wiring and the `convert.join.*` strings in four languages.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/app/components/ConvertSampleJoin.tsx src/app/convertModel.ts src/app/pages/ConvertPage.tsx src/core/i18n/ui.ts test/app/convertSampleJoin.test.tsx` — "The convert page proposes the sample join with Confirm, Change and No, shows each conflict group with a choice for all samples and per sample, and offers to convert samples without a description from the results sheet alone."

### Task 10: Acceptance on the real corpus (VPS only)

Nothing of this task runs on the Mac (Michał, 06.11) and no real data or report enters the repo.

**Files:** none in the repo. Harness: a copy of `/home/ice13ball/tools-regression/tmp/r2t27` as `/home/ice13ball/tools-regression/tmp/join` (its `setup.sh`, `run-vps.sh`, `scripts/runall.sh`, `scripts/convert-harness.test.ts`, `scripts/cmp27.py` adapted there); corpus `/home/ice13ball/tools-regression/data/join-real-2026-11-12/` with `MANIFEST.md` (copy at `/Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-real-MANIFEST.md`).

- [ ] **Step 1: Ship the two trees.** On the Mac: `git archive --format=tar -o /Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-ship/base.tar 151882d` and `… new.tar HEAD`; copy both to `/home/ice13ball/tools-regression/ship/join/` on `apiSomethingRare`. Build `manifest.json` (label, file, choices) from `MANIFEST.md`: one entry per results file or workbook; a two-file dataset lists both files.
- [ ] **Step 2: Extend the harness** (in `tmp/join/scripts`, not the repo): a mode `CONV_JOIN=none|confirm-description`. `confirm-description` takes the proposal from `view.sampleJoin.proposals`, confirms it, answers every conflict group `take: 'description'` with today's count, answers P1 `resultsOnly`, and accepts nothing else beyond what the round-2 choices already do. Dumps per file: archive file hashes, findings (rule, sheet, lines, params), the ledger tallies, and `view.sampleJoin`.
- [ ] **Step 3: Check the host and run.** `awk '/MemAvailable/ {print $2}' /proc/meminfo` ≥ 4000000 and `systemctl --user list-units 'tools-regression-*' 'obis-sync*' 'pm-h1-*' --state=running` empty; then `systemd-run --user --unit=tools-regression-join -p MemoryMax=3G -p CPUWeight=10 -p IOWeight=10 bash /home/ice13ball/tools-regression/tmp/join/run-vps.sh`, which runs `runall.sh base`, `runall.sh new` (CONV_JOIN=none) and `runall.sh joined` (CONV_JOIN=confirm-description) and the compare.
- [ ] **Step 4: Verify C3.** Compare base vs new per file — Expected: archive hashes identical; findings identical except one added `CONV-JOIN-PROPOSED` per proposed pair; ledgers identical. Any other difference is a bug: stop and report it with the file label and the first differing key.
- [ ] **Step 5: Write the report** `/home/ice13ball/tools-regression/tmp/join/report.md` (copied to `/Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-acceptance-report.md`), one section per file: proposal (sheets, key columns, covered / samples) or "no proposal" with the reason seen; filled per column (`CONV-JOIN-FILLED`); conflict groups (quantity, count, three example pairs); description-only samples; samples without description; ambiguous keys and blank keys; the joined run's `ok`, blocking rules and whether both ledgers balance; anything that crashed. Expected outcome: every file runs to the end, every ledger balances, and the report goes to Michał for human review (decision 9); the branch is not proposed for merge before he has read it.
- [ ] **Step 6:** stop the unit if still listed, keep `tmp/join` until Michał has reviewed; nothing to commit.

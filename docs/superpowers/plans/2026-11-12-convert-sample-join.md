# /convert sample-sheet join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /convert joins a results sheet to the sheet (or file) that describes its samples after the person confirms the link, resolves every value the two sheets share without a silent fill or overwrite, and converts the merged sheet as one table.

**Architecture:** A pure core module `src/core/convert/sampleJoin.ts` proposes joins (ranking extracted from /check's `findJoin`) and merges a confirmed pair into ONE `ConvertSheetInput` (results rows + description cells, one column per quantity, a provenance table `SampleJoinInfo` that also carries the merge's own findings). The worker applies it in `inputsOf`, the way it already replaces a long sheet by its pivot; `convert()` gains small paths keyed on `sin.sampleJoin` (the merge's findings pushed before `decideRows`, description-only events, findings remapped to description lines, the description sheet's ledger). Nothing runs differently for an input without `sampleJoin`.

**Tech Stack:** Vite + React + TypeScript, vitest (+ @testing-library/react for the page), 4-language i18n (`src/core/i18n/ui.ts`, rule texts with plural tokens in `src/core/rules/convert.ts`).

**Spec:** `docs/superpowers/specs/2026-11-12-convert-sample-sheet-join-design.md` (approved 12.11; sections 5, 6 and 6a are binding). Base commit of this plan: `151882d` (code identical to `b7a0017`). Pre-flight rulings (F1–F19, 12.11): `.superpowers/sdd/2026-11-12-convert-sample-join/progress.md` and `preflight.md`; each ruling is written into the task it concerns below.

**Where the plan reads the spec one way (ruled 12.11, SDD ledger H1–H5 and F19):**
1. Spec test 6 ("later" dates one group, "earlier" another) contradicts decision 4 (one group per quantity, 12.11, binding): the plan follows decision 4; test 6 becomes "four differing dates form one `date` group" (Task 5); the same-pair action is a `pairs` answer the core applies to every entry (Tasks 5, 9). **Ruled 12.11** (decision 4 is Michał's answer).
2. §8 says `parse` returns the proposal; the proposal must read the roles on screen and C3 needs `CONV-JOIN-PROPOSED` among the conversion's findings, so it is computed per `convert` request and sent in `ConvertView.sampleJoin`. Ruled 12.11.
3. Per-sample exceptions and same-pair answers name values, which the companion file never holds; a group answered with exceptions, with pairs or without a bulk side is saved as `mixed` and re-opens. **Ruled 12.11** (the companion file's no-data-values rule).
4. Decision 6 works for results sheets with different sample codes; two results sheets that share codes still collide (`CONV-ID-DUPLICATE`, as today: the "more results for the same samples" non-goal). Ruled 12.11.
5. The P1 answer gets its own info rule `CONV-JOIN-RESULTS-ONLY` with "Ask again" (the pattern of every other answer), a ninth code next to the spec's eight tentative ones; F16 adds a tenth, `CONV-JOIN-DESCRIPTION-LONG` (a long description sheet is not joined for now). Ruled 12.11.

**Execution notes:** model per task (global CLAUDE.md policy): Tasks 1, 4, 5, 6, 7, 8 are integration-heavy (Sonnet 5.5 `high`); Tasks 2, 3, 9 default (Sonnet 5.5 `medium` via Workflow); Task 10 and the final branch review stay in the main thread (Opus). One test-heavy agent at a time.

## Global Constraints

- Every new file starts with the two header lines of `scripts/spdx-header.txt`: `// SPDX-License-Identifier: AGPL-3.0-or-later` and `// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`.
- Page strings in 4 languages (en, pl, de, fr) in `src/core/i18n/ui.ts` (the `pl`/`de`/`fr` objects are typed `Record<UiKey, string>`: a missing key fails `tsc`). Rule texts in `src/core/rules/convert.ts` with Polish plural tokens `{+count:one|few|many}`; then `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts` regenerates `docs/rules.md`.
- Tests on the Mac: `nice -n 15 npx vitest run <path> --maxWorkers=2`, only the scoped dirs a task names (test/convert, test/app, test/rules, test/server, test/recognize, test/checks); never the full suite. End of every task: `npx tsc --noEmit -p .` with no new errors.
- Commit by explicit paths only (`git add <path> …`, never `-A`/`.`). Messages are plain descriptive English sentences (no `feat:`), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unit tests use invented data only (the spec's `book.xlsx`: `Counts`, `Samples`, codes `X01`–`X04`, stations `ST-1`–`ST-3`); no real institution, station, person or dataset; real data never enters the repo.
- Declare-first (Michał, 02.11): nothing joins until the person confirms. The proposal reads only roles already on screen (sample code, station, cruise, picked key parts, taxon) and header equality; no new heuristic that guesses a role from values.
- Spec C3: an input without a confirmed join converts byte-for-byte as today: same archive files, same findings; the only addition for an unconfirmed workbook is the info finding `CONV-JOIN-PROPOSED` (or `CONV-JOIN-DESCRIPTION-LONG`). Proof (F7): the existing `test/convert` suite stays green with no edit, the core C3 test of Task 6, and the base-vs-new run of Task 10. The golden tests run `/check` only (`test/golden` never reaches `convert()`), so they are run in Task 1 and in the final review, not as a /convert proof: `GOLDEN_DIR=/Users/ice13ball/data/sprawdzarka-golden/2026-10-16 nice -n 15 npx vitest run --maxWorkers=2 test/golden` (report the test count: a run with everything skipped is a failure). Never open that directory by hand.
- /check behaviour is unchanged by the extraction of `findJoin`'s ranking (`test/recognize/join-key.test.ts`, `test/checks/join-nonunique-stations.test.ts` green with no edit; golden diff identical).
- Principle 5: scientific data is never removed or altered silently. Every cell of both sheets reaches the archive or is listed in the not-written file with a reason.
- An answer that changes what is written travels with the number it was given for and holds only when today's analysis finds the same number (`dropCopiesCount` pattern); a companion-file answer whose numbers differ re-opens the question. The companion file holds names, hashes and counts, never a data value.

## Review Focus

- **Key cells of different types across files** (typed `1` in `Samples` of an xlsx, text `1` in `results.csv`; `X01 ` with a trailing space): keys compare as `String(cell).trim()` exactly like /check's `keyValues`, so `1`↔`"1"` and `X01 `↔`X01` join, while `"1.0"`↔`1` does not and is NAMED by `CONV-JOIN-NO-DESCRIPTION`, never dropped. Test in Task 4.
- **A description row with a blank key cell** (F14) holds values that can be lent to nobody: it BLOCKS with a description-side `CONV-JOIN-KEY-BLANK` and the usual leave-out question; answered "leave out", it is listed in the not-written file with reason `join-no-key`, status `left-out`, and the description ledger stays balanced. Tests in Tasks 4 and 7.
- **The confirmed pair no longer matches the request** (the description sheet unticked, a key column re-roled or out of range, a sheet re-pivoted): `joinInputs` (the only validator, F8) does not apply the join, the proposal shows again, nothing merges silently, no exception thrown. Tests in Task 6 (core) and Task 8 (handler).
- **A results sheet with a picked sample key and no code column**: the join key is the picked key columns (proposed through `kinds: 'any'`, F13); appended description-only rows fill those columns, so their events get the same IDs the key would make. Tests in Tasks 1, 3 and 6.
- **A description header equal to a results header with another role** (`Depth` as a variable in `Samples`, a depth in `Counts`; two `Sample` columns): merged headers stay unique (`" (2)"`, as `pivot.ts` does), and a finding on the renamed column names the description sheet and its own header. Test in Task 4.
- **Two files, two reading conventions** (F2): a decimal-comma `samples.csv` under a point `results.csv`, or an xlsx date serial lent into a CSV: lent cells are rewritten into the results file's convention by the converter's own parse and recorded in `SampleJoinInfo.rewritten`. Tests in Task 4.
- **Units and signs of a shared quantity** (F4): `Depth [cm]` against `Depth [m]`, a signed latitude against a latitude with a hemisphere column: "same structure" includes the unit, `positive` and hemisphere columns; anything else goes through `resolved` columns. Tests in Task 5.

---

### Task 1: Extract the join-key ranking from `findJoin`; /check unchanged

**Files:**
- Modify: `src/core/recognize/layout.ts:199-315` (`KEY_KINDS`, `STRONG_KEY_KINDS` … `findJoin`)
- Test: `test/recognize/join-rank.test.ts` (new); unchanged and must stay green: `test/recognize/join-key.test.ts`, `test/recognize/layout.test.ts`, `test/checks/join-nonunique-stations.test.ts`

**Interfaces:**
- Produces (exported from `layout.ts`):
  ```ts
  export interface KeySide { sheet: RawSheet; columns: readonly { index: number; header: string; role: { kind: string } }[]; consumed?: ReadonlySet<number> }
  export interface RankedJoin { right: number /* index into `rights` */; leftKey: number; rightKey: number; score: number; unique: boolean; fine: number;
    extraKeys?: { leftKey: number; rightKey: number }[]; /** distinct left key values (tuples, for a composite) found on the right / all distinct left key values (tuples) */ covered: number; total: number }
  export function rankJoinKeys(left: KeySide, rights: readonly KeySide[], opts: { coverage: 'all' | 'measure'; kinds?: ReadonlySet<string> | 'any' }): RankedJoin | undefined
  ```
- `coverage: 'all'` is today's subset test (a candidate is dropped unless every left value is on the right; the composite check likewise). `'measure'` keeps a candidate with `covered ≥ 1` and ranks by `covered/total` first, then today's order (unique → score → fine; equal on all → the first in column order, as `better` does today); with `'all'` every kept candidate has `covered === total`, so the order is today's.
- `kinds` (F13): default `KEY_KINDS` on both sides (/check, as today: left and right column must be in `KEY_KINDS`). `'any'`: the caller pre-filters the LEFT columns (any kind, /convert's picked key parts such as a `Date` with role `keyPart` or `date`); a RIGHT column qualifies when its header equals the left header after `cleanKey` (any kind), or when left and right have the same `STRONG_KEY_KINDS` kind.
- Composite under `'measure'`: tried as today when the best single key is not unique on the right; accepted when the right tuples are unique; `covered/total` are then counted over distinct left tuples (a tuple with a blank part counts in neither).
- `findJoin(meas, coordSheets)` becomes a thin wrapper: `rankJoinKeys({ sheet, columns: proposals, consumed }, coordSheets.filter(c => c !== meas).map(…), { coverage: 'all' })`, mapped back to `JoinCandidate`.

- [ ] **Step 1: Write the failing test** `test/recognize/join-rank.test.ts` with invented sheets:
  - `rankJoinKeys` with left `Sample` = X01, X02, X04 and right `Sample` = X01, X02, X03: `'all'` → `undefined`; `'measure'` → `{ leftKey: 0, rightKey: 0, covered: 2, total: 3, unique: true }`.
  - Two right candidates, one covering 3/3 by a weak `ignore` column with the same header, one covering 2/3 by a `sampleId` column: `'measure'` picks the 3/3 one (coverage first).
  - Composite: right `Cruise, Station` with `Station` repeated across cruises, left has both → `extraKeys` set, `unique: true` (same as join-key.test's composite case, now through `rankJoinKeys`).
  - Composite under `'measure'` with partial coverage: left tuples (C1, ST-1), (C2, ST-1), (C3, ST-1), right (C1, ST-1), (C2, ST-1) → `extraKeys` set, `covered: 2, total: 3`.
  - `kinds: 'any'` (F13): left `Station` (role `station`) + `Date` (role `keyPart`), right `Station` + `Date` (role `date`) → with `'any'` the pair `Date`↔`Date` is among the keys; with the default kinds it is not; a right `Sampling day` (role `date`, other header) never pairs with the left `Date`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/recognize/join-rank.test.ts --maxWorkers=2` — Expected: FAIL (`rankJoinKeys` is not exported).
- [ ] **Step 3: Implement** `rankJoinKeys` by moving the body of `findJoin` (subset test → coverage count; composite tuple check counts covered tuples; the `kinds` rule above) and rewrite `findJoin` as the wrapper.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/recognize test/checks --maxWorkers=2` — Expected: PASS, no test file edited.
- [ ] **Step 5: Golden.** Golden diff of /check before/after (base worktree `git worktree add --detach ../base-151882d 151882d`): `GOLDEN_DIFF_MODE=dump GOLDEN_DIFF_OUT=/tmp/join-before.json GOLDEN_DIFF_REPO=../base-151882d nice -n 15 npx vitest run --config vitest.golden-diff.config.ts --maxWorkers=2`, the same with `GOLDEN_DIFF_OUT=/tmp/join-after.json` and no REPO, then `GOLDEN_DIFF_MODE=compare GOLDEN_DIFF_BEFORE=/tmp/join-before.json GOLDEN_DIFF_AFTER=/tmp/join-after.json …` — Expected: identical, "golden-diff: N entries" with N > 0. Then the golden tests with `GOLDEN_DIR` (Global Constraints) — Expected: PASS, count reported. Remove the base worktree by its explicit path afterwards.
- [ ] **Step 6:** `npx tsc --noEmit -p .`, then commit `src/core/recognize/layout.ts test/recognize/join-rank.test.ts` — "The join-key ranking of /check is extracted into rankJoinKeys, which can also measure how many left keys the right sheet covers and pair a picked key part by its header; /check calls it with the old subset rule and proposes the same joins."

### Task 2: The CONV-JOIN rule codes, their policy and docs/rules.md

**Files:**
- Modify: `src/core/rules/convert.ts` (header comment table + rule objects, next to `CONV-KEY-PICKED` at ~:296; params are declared per rule and collected in `CONVERT_RULE_PARAMS` at :1649, so an undeclared param fails `rules.test.ts`), `src/core/convert/policy.ts:39-79` (`BLOCK_CONV_RULES`), `policy.ts` `ACCEPT_RULES`, `docs/rules.md` (regenerated)
- Test: `test/convert/rules.test.ts`, `test/convert/policy.test.ts` (the exact-list assertions at `:23` and `:27` are EDITED, not only extended), `test/rules/registry.test.ts`, `test/rules/rules-doc.test.ts`

**Interfaces:**
- Produces ten rule ids, params as listed (generic `file`, `sheet`, `lines`, `field`, `value` as usual; `file`/`sheet` are the RESULTS sheet unless said):

  | id | severity / policy | params | text says |
  |---|---|---|---|
  | `CONV-JOIN-PROPOSED` | info / show | `description`, `descriptionFile`, `keys`, `covered`, `samples` | sheet `description` seems to describe the samples of this sheet, linked by `keys`; `covered` of `samples` samples found; nothing is joined until confirmed |
  | `CONV-JOIN-DESCRIPTION-LONG` | info / show | `description`, `descriptionFile`, `keys` | sheet `description` seems to describe these samples but is in the long layout (one row per parameter); joining such a sheet is not supported yet, both sheets are converted as without a join (F16) |
  | `CONV-JOIN-CONFLICT` | error / block | `what`, `group`, `count`, `total`, `examples` | `what` differs in `total` samples between the two sheets, `count` of them still undecided; choose for all, per sample, or per pair of values |
  | `CONV-JOIN-CONFLICT-CHOSEN` | info / show | `what`, `count`, `fromDescription`, `fromResults` | what was taken from where |
  | `CONV-JOIN-NO-DESCRIPTION` | error / block | `count`, `samples`, `description` | these samples have no row in `description`; button "convert them with only what this sheet says" |
  | `CONV-JOIN-RESULTS-ONLY` | info / show | `count`, `samples`, `fromFile` | the answer to the above (pattern of `CONV-ROW-COPIES-DROPPED`), with "Ask again"; `fromFile` selects the "from the companion file" variant |
  | `CONV-JOIN-DESCRIPTION-ONLY` | warning / accept | `count`, `samples`, `description` | samples described with no results: written as sample events with no occurrence |
  | `CONV-JOIN-AMBIGUOUS` | error / block | `count`, `keys`, `description` | `file`/`sheet`/`lines` = the DESCRIPTION rows; a key with several different rows |
  | `CONV-JOIN-KEY-BLANK` | error / block | `count`, `columns`, `side` | `side: 'results'`: results rows with a blank key part (as `ROW-JOIN-KEY-BLANK`); `side: 'description'` (F14): `file`/`sheet`/`lines` = the DESCRIPTION rows, whose values can be lent to no sample; answered by the usual "leave these rows out" (Task 7) |
  | `CONV-JOIN-FILLED` | info / show | `count`, `column`, `from` | one per column: `count` blank cells filled from sheet `from` |

- [ ] **Step 1: Write the failing tests:** in `test/convert/rules.test.ts`, `sev('CONV-JOIN-CONFLICT')` is `'error'`, `sev('CONV-JOIN-DESCRIPTION-ONLY')` is `'warning'`, `sev('CONV-JOIN-PROPOSED')` and `sev('CONV-JOIN-DESCRIPTION-LONG')` are `'info'`; `renderConvertPlain` of `CONV-JOIN-NO-DESCRIPTION` with `{ count: 1, samples: 'X04' }` in `pl` contains `X04` and the singular form, with `count: 2` and `count: 5` the two plural forms; `CONV-JOIN-KEY-BLANK` with `side: 'description'` renders the description variant in `en` and differs from `side: 'results'`; `CONV-JOIN-RESULTS-ONLY` with `fromFile: 'yes'` renders the companion variant. In `policy.test.ts`: `policyOf` gives `accept` for DESCRIPTION-ONLY, `show` for PROPOSED and DESCRIPTION-LONG, `block` for CONFLICT, NO-DESCRIPTION, AMBIGUOUS, KEY-BLANK; the exact list at `:23` (`BLOCK_CONV_RULES`, sorted) gains the four blocking ids, the exact ordered list at `:27` (`ACCEPT_RULES`) gains `CONV-JOIN-DESCRIPTION-ONLY` at the position `policy.ts` puts it.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/rules.test.ts test/convert/policy.test.ts --maxWorkers=2` — Expected: FAIL (unknown rule id).
- [ ] **Step 3: Implement** the ten rule objects (plain en/pl/de/fr + `technical`), the comment table rows, and the policy lists.
- [ ] **Step 4: Regenerate and run:** `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts`, then `nice -n 15 npx vitest run test/rules test/convert/rules.test.ts test/convert/policy.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/rules/convert.ts src/core/convert/policy.ts docs/rules.md test/convert/rules.test.ts test/convert/policy.test.ts` — "The converter has ten CONV-JOIN rules for the sample-sheet join, in four languages, with their export policy; docs/rules.md lists them."

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
  export interface SampleJoinProposal { results: number; description: number; keys: JoinKeyPair[]; covered: number; samples: number; unique: boolean;
    /** the description sheet is a long sheet read through its pivot (`RawSheet.pivot !== undefined`): shown, never joinable for now (F16) */ long: boolean }
  export function proposeSampleJoins(sheets: readonly ConvertSheetInput[], skip: readonly { results: number; description: number }[]): SampleJoinProposal[]
  ```
- Results sheet = an input whose mapping has a `taxon` role and no `profile`. Description candidates = every other non-profile input with NO taxon role (a pivoted one included, marked `long: true`). Left key columns = the `sampleId` column, or the picked `sampleKey.columns`, plus `station` / `cruise` columns; with a picked key the call uses `kinds: 'any'` (Task 1), otherwise the default kinds; right columns = `sampleId` / `station` / `cruise` roles or a header equal after `stripTypeSuffix().toLowerCase()`. `rankJoinKeys(…, { coverage: 'measure' })`; propose only when `covered * 2 >= total` (a value-based threshold, not a role guess). Tie-break (F18): two left key columns equal on coverage, uniqueness and score (e.g. `Sample` and `Station` both 3/3, unique, score 3) → the one earlier in the results sheet's column order (`better` keeps the first). One description may be proposed for several results sheets (decision 6); a results sheet gets at most one proposal. `skip` = pairs already confirmed (valid) or declined.
- `joinFixtures.ts` exports `BOOK` (`xlsxFile('book.xlsx', { Counts: [...], Samples: [...] })` with the spec's rows), `bookInputs(variant?)` returning `ConvertSheetInput[]` via `sheetInput`-style proposals (variants include `'long-samples'`: `Samples` as Sample | Parameter | Value read through `pivotConvertFile`), and CSV twins `RESULTS_CSV`, `SAMPLES_CSV` as CSV TEXT strings (Task 8 feeds them to `chooseFiles`), plus `SAMPLES_CSV_COMMA` (decimal-comma, `;`-separated) for Task 4.

- [ ] **Step 1: Write the failing tests:**
  - `book.xlsx`: `proposeSampleJoins(bookInputs(), [])` equals `[{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], covered: 2, samples: 2, unique: true, long: false }]` (`Sample` before `Station` in `Counts`: the column-order tie-break).
  - Two files `results.csv` + `samples.csv` (same rows): the same proposal with indexes 0 and 1.
  - `Phyto` and `Zoo` results sheets (codes X01–X02 and X05–X06) + `Samples` (X01–X06): two proposals, both with `description: 2`.
  - Spec test 10: `Counts` = Cruise | Station | Taxon | Count, `Samples` = Cruise | Station | Date … with `ST-1` in cruises `C1` and `C2`: keys `[{ Cruise↔Cruise }, { Station↔Station }]` (order as `rankJoinKeys` gives), `unique: true`.
  - Picked key (F13): `Counts` without a `Sample` column, `sampleKey.columns` = [`Station`, `Date`], `Samples` with `Station` and `Date` → one proposal whose keys pair `Station`↔`Station` and `Date`↔`Date`.
  - Long description (F16): `bookInputs('long-samples')` → one proposal with `long: true`.
  - No taxon sheet anywhere → `[]`; the pair in `skip` → `[]`; `Samples` sharing only 1 of 4 codes → `[]`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-propose.test.ts --maxWorkers=2` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `proposeSampleJoins` as above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts test/convert/joinFixtures.ts test/convert/sample-join-propose.test.ts` — "proposeSampleJoins proposes which sheet describes the samples of a results sheet and by which key, from the roles on screen and picked key parts, across sheets and files; nothing is joined by it."

### Task 4: `mergeSampleSheets`: matching, lending, shared columns and provenance

**Files:**
- Modify: `src/core/convert/sampleJoin.ts`; `src/core/convert/build.ts:63-144` (add the optional field `sampleJoin?: SampleJoinInfo` to `ConvertSheetInput`, doc comment only; build.ts reads it from Task 6)
- Test: `test/convert/sample-join-merge.test.ts` (new)

**Interfaces:**
- Consumes: `JoinKeyPair`, `JoinSide` (Task 3); `specsOf`, `metaParser` (`src/core/dataset.ts:298`), `Collector` (`dataset.ts:56`), `makeConvertFinding`; `parseNumber` (`src/core/values/numbers.ts:40`), `excelSerialToDate` (`src/core/values/dates.ts:110`), `eventDateText` (`events.ts:124`), `depthUnitOfHeader` (`src/core/recognize/depthUnit.ts:114`).
- Produces:
  ```ts
  export interface ConflictAnswer { group: string; /** bulk side; absent = only the exceptions and pairs are decided (F5) */ take?: JoinSide; count: number;
    exceptions: { entry: string; take: JoinSide }[]; /** "apply to all with the same pair of values": request only, never the companion (F5) */ pairs?: { pair: [descriptionText: string, resultsText: string]; take: JoinSide }[] }
  export interface SampleJoinDecl {
    results: ConvertSheetInput; description: ConvertSheetInput; keys: JoinKeyPair[];
    conflicts: readonly ConflictAnswer[];
    /** P1 answer: the number of results samples without a description it was given for */ resultsOnly?: number; resultsOnlyFromFile?: boolean;
    /** join-key values that the OTHER results sheets joined to the same description hold (decision 6, F3) */ heldElsewhere?: ReadonlySet<string>;
    /** append the description-only rows here (true for the first results sheet of a description only) */ appendDescriptionOnly: boolean;
  }
  export interface SampleJoinInfo {
    /** `raw` = the original results sheet, for the not-written list (F10) */ results: { file: string; sheet: string; raw: RawSheet; width: number; lines: ReadonlySet<number> };
    /** `leaveOut`/`leaveOutFile` copied from the description input: the answers to its blank-key question (F14, read by decideRows in Task 7) */
    description: { file: ParsedFile; sheet: RawSheet; mapping: SheetMapping; leaveOut?: ConvertSheetInput['leaveOut']; leaveOutFile?: ConvertSheetInput['leaveOutFile'] };
    /** per merged column: where it came from ('resolved' = written by the merge, Task 5) and its own header */
    columns: readonly { side: JoinSide | 'resolved'; index: number; header: string }[];
    /** merged line → the description line lent to it */ lentFrom: ReadonlyMap<number, number>;
    /** merged lines appended for description-only samples (P2) → description line; numbered after the last results line */ descriptionOnly: ReadonlyMap<number, number>;
    /** `${mergedLine}:${mergedColumn}` → description line, for results-column cells whose value came from the description (P4 fill, a 'description' choice) */ takenFromDescription: ReadonlyMap<string, number>;
    /** `${mergedLine}:${mergedColumn}` → the description cell as its own file held it, for a lent cell rewritten into the results file's convention (F2) */ rewritten: ReadonlyMap<string, RawCell>;
    /** merged columns the merge consumed (keys, the losing side of a shared quantity): never listed as ignored or not exported */ consumed: ReadonlySet<number>;
    /** P7: values not chosen, with both lines */ notChosen: readonly { side: JoinSide; line: number; column: number; otherLine: number; group: string; chosen: string }[];
    /** description lines with a blank key part, ambiguous lines */ noKey: readonly number[]; ambiguous: readonly number[];
    /** the merge's own findings (P1, P2, P3, P4, P6, conflicts); convert() pushes them before decideRows (F1, Task 6) */ findings: readonly Finding[];
  }
  /** one entry per (join-key value, results value) (F6); `id` = shortHash(key + '\u0000' + resultsText), what an exception addresses */
  export interface ConflictEntry { id: string; key: string; descriptionLine: number; descriptionText: string; resultsText: string; resultsLines: number[]; samples: string[]; take?: JoinSide }
  /** `count` = results samples over all entries (the label says samples) */
  export interface ConflictGroup { group: string; quantity: 'date' | 'position' | 'depth' | 'station' | 'cruise' | 'variable' | 'other'; label: string; count: number; entries: ConflictEntry[]; answer?: ConflictAnswer }
  export interface MergeResult { input: ConvertSheetInput /* results input with file/sheet replaced by the merged ones and sampleJoin set */; info: SampleJoinInfo /* === input.sampleJoin */; conflicts: ConflictGroup[]; descriptionKeys: ReadonlySet<string> }
  export function mergeSampleSheets(decl: SampleJoinDecl): MergeResult
  /** the join-key values of a results sheet (decision 6: joinInputs computes them first, F3) */
  export function resultsKeys(results: ConvertSheetInput, keys: readonly JoinKeyPair[]): ReadonlySet<string>
  /** F2: a description cell in the results file's convention */
  export function lendCell(cell: RawCell, from: { file: ParsedFile; sheet: RawSheet; column: number }, to: ParsedFile): { cell: RawCell; rewritten: boolean }
  /** F4/F9: the two sides of one quantity use the same column structure */
  export function sameStructure(results: QuantityColumns, description: QuantityColumns): boolean   // QuantityColumns = { file: ParsedFile; sheet: RawSheet; mapping: SheetMapping; columns: readonly number[] }
  ```
- The merged `ParsedFile` is a shallow copy of the results file whose results sheet is replaced; the merged sheet keeps the results sheet's NAME (event IDs and key prefix unchanged). Header = results header + description header, a description header equal to an existing one gets `" (2)"` (`" (3)"` …). Mapping = results mapping + description mapping shifted by the results width; description key columns `ignore` + consumed. The merged sheet's `dateFormatted` / `dateAll` = the results sheet's (or `false` × width when absent) followed by the description sheet's, shifted with its columns (F2a).
- Cross-file conventions (F2b): when the two files differ in `decimalComma` or `date1904`, every lent description cell goes through `lendCell`: a text cell that `parseNumber(cell, from.decimalComma)` reads as a number becomes its canonical text in the results file's separator; a number cell in a `dateFormatted` description column becomes `eventDateText(excelSerialToDate(cell, from.date1904))`; anything else is lent verbatim. Each rewritten cell is recorded in `info.rewritten`. Same convention → verbatim, no entry.
- `sample` naming: the join-key value text (composite: `JSON.stringify(parts)`), i.e. the description row (spec C2). Key text = `String(cell).trim()` (as `layout.ts` `keyValues`). Description rows that repeat identically are one row; rows of one key that differ in any non-blank description cell → P3 (`CONV-JOIN-AMBIGUOUS`, lines = those description lines, nothing lent for that key). Results rows with a blank key part → P6 (`CONV-JOIN-KEY-BLANK`, `side: 'results'`, nothing lent). Description rows with a blank key part (F14) → `CONV-JOIN-KEY-BLANK` with `side: 'description'`, `file`/`sheet`/`lines` = the description rows, error/block; the lines go to `info.noKey`, nothing lent from them. Results samples with no description → P1 (`CONV-JOIN-NO-DESCRIPTION`, sample names) unless `resultsOnly` equals today's count, then `CONV-JOIN-RESULTS-ONLY` (info, `fromFile: 'yes'` when `resultsOnlyFromFile`). Description keys used by no results row and not in `heldElsewhere` → appended rows when `appendDescriptionOnly` (results cells blank except the results key columns, set to the key parts) + `CONV-JOIN-DESCRIPTION-ONLY`. Every finding goes to `info.findings`.
- Shared columns (F9, moved here from Task 5): a quantity on both sides whose columns pass `sameStructure` (same role kinds and bounds, same date parts, same depth unit from `role.unit` / `depthUnitOfHeader`, same `positive`, the same hemisphere columns present, same per-column `dateFormatted`) is ONE quantity: the results columns keep the role, the description columns of that quantity become `ignore` + consumed; never two columns of one role in the merged mapping (`colsOf` takes the first). A blank results cell is filled with the description's cell (P4, one `CONV-JOIN-FILLED` per column with its count, `takenFromDescription` set). A both-sides difference blocks with an ungrouped `CONV-JOIN-CONFLICT` (`group: ''`) until Task 5 groups it, so no commit keeps one side silently; a quantity whose structures differ is left to Task 5 (this task's tests have none).

- [ ] **Step 1: Write the failing tests** (values from spec §9 via `joinFixtures`; findings read from `info.findings`):
  - Spec test 2 (merge level): merged sheet name `Counts`, 3 rows; row of `X01` line 2 carries `ST-1`, `2021-05-03`, `61.1`, `4.2`, `10` in the description columns; `info.lentFrom.get(2) === 2`; mapping of the `Samples` `Sample` column is `ignore` and in `consumed`.
  - Spec test 3: `X03` appended as one row (line > last `Counts` line), `info.descriptionOnly` maps it to `Samples` line 4; finding `CONV-JOIN-DESCRIPTION-ONLY` `{ count: 1, samples: 'X03' }`; with `heldElsewhere: new Set(['X03'])` nothing appended; with `appendDescriptionOnly: false` nothing appended.
  - Spec test 4: `Counts` + (`X04`, *Oithona similis*, 1): `CONV-JOIN-NO-DESCRIPTION` with `samples: 'X04'`, severity error; with `resultsOnly: 1` it is gone and `CONV-JOIN-RESULTS-ONLY` `{ count: 1 }` is there; with `resultsOnly: 2` the error stays.
  - Spec test 8 (F9): `Counts` gains `Depth` with `X02` = 20 and `X01` blank: X01's depth cell filled with `10`, `CONV-JOIN-FILLED` `{ count: 1, column: 'Depth', from: 'Samples' }`, `takenFromDescription.get('2:<depth col>') === 2`; the merged mapping has exactly one `depth` role (the `Counts` column) and the `Samples` `Depth` column is `ignore` + in `consumed`.
  - Spec test 9: `Samples` lists `X01` twice with depths 10 and 15 → `CONV-JOIN-AMBIGUOUS` with lines `[2, 5]`; twice identically → no finding, X01 lent once.
  - P6: a `Counts` row with blank `Sample` → `CONV-JOIN-KEY-BLANK` `{ side: 'results' }` naming its line.
  - F14: a `Samples` row with blank `Sample` and depth `30` (line 5) → `CONV-JOIN-KEY-BLANK` `{ side: 'description', count: 1 }` with `file: 'book.xlsx', sheet: 'Samples', lines: [5]`, severity error; `info.noKey` = `[5]`; no merged row carries `30`.
  - Spec test 10 (merge): keys Cruise + Station, `ST-1` in cruises `C1` and `C2` of `Samples` → each `Counts` row gets the row of its own cruise; no `CONV-JOIN-AMBIGUOUS`.
  - C2: `Samples` keyed by `Station` (`ST-1` once), `Counts` samples `X01`, `X01b` both at `ST-1` → both lent `Samples` line 2; `notChosen` empty.
  - Review Focus 1: typed `1` (xlsx) ↔ text `"1"` (csv) joins; text `"1.0"` ↔ typed `1` → `CONV-JOIN-NO-DESCRIPTION` names `1.0`.
  - Review Focus 5: `Samples` has `Depth` as a variable while `Counts` has a `Depth` depth column → merged header has `Depth` and `Depth (2)`; `info.columns[w + k]` = `{ side: 'description', header: 'Depth' }`.
  - F2, decimal comma: `results.csv` (point) + `SAMPLES_CSV_COMMA` with X01 `Latitude` `61,1` → merged X01 latitude cell `'61.1'`, `info.rewritten.get('2:<lat col>') === '61,1'`; `parseNumber(cell, false).value === 61.1`.
  - F2, xlsx dates: `Samples` of a `date1904: true` workbook with X01 `Date` = serial `42857` in a date-formatted column + `results.csv` → merged cell `'2021-05-03'`, `info.rewritten` holds `42857`; the same with a `date1904: false` workbook and serial `44319` → no rewrite, the merged sheet's `dateFormatted[w + k] === true`, and `metaParser` on the merged sheet reads X01's date as 2021-05-03.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-merge.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** `mergeSampleSheets`, `resultsKeys`, `lendCell`, `sameStructure` (matching, P1/P2/P3/P4/P6, description blank keys, shared columns, provenance) as specified above.
- [ ] **Step 4: Run** the same command plus `test/convert/sample-join-propose.test.ts` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts src/core/convert/build.ts test/convert/sample-join-merge.test.ts` — "mergeSampleSheets attaches the confirmed description row to every results row by key, in the results file's number and date conventions, keeps one column per shared quantity, lists samples without a description, descriptions without results, ambiguous and blank keys on either side, fills only blank cells and says so, and keeps where every merged cell came from."

### Task 5: `mergeSampleSheets`: conflicts, groups and answers

**Files:**
- Modify: `src/core/convert/sampleJoin.ts`
- Test: `test/convert/sample-join-conflicts.test.ts` (new)

**Interfaces:**
- Consumes/extends Task 4's `mergeSampleSheets`, `sameStructure`, `ConflictGroup`, `ConflictEntry`, `ConflictAnswer`, `SampleJoinInfo.notChosen`; `shortHash` (`keySetting.ts:20`); `eventDateText` (`events.ts:124`).
- Quantities and group ids (spec C1, decision 4): `date` (roles date, datetime, datePart, time; compared on `metaParser(...)(row).datetime` via `eventDateText`), `position` (latitude, longitude, hemisphere; compared on the signed `Meta.lat/lon`), `depth` (every `depth` bound; compared on min/max in metres as `build.ts` reads them, unit and `positive` applied), `station`, `cruise` (trimmed text), `v.<shortHash(name + '\u0000' + unit)>` for a variable (role `variable`, same name and unit; compared with `parseNumber`), `r.<kind>` for any other shared role (text) — never for `ignore` or `keyPart` (F18). A header match alone is not a shared quantity. One group per quantity; `label` = the headers involved.
- Entries (F6): one per (join-key value, results value) under its group; `samples` = the results samples of that entry; group `count` = samples. Equal after reading (P5) is no conflict and keeps the results cells. `CONV-JOIN-CONFLICT` per group with undecided samples (`count` = undecided, `total` = group count, `examples` = up to 3 `sample: description / results`).
- Answers (F5): an answer holds only when `answer.count === today's group count`; then per entry `take = exceptions.find(e => e.entry === entry.id)?.take ?? pairs.find(p => p.pair matches [descriptionText, resultsText])?.take ?? answer.take`; `pairs` apply to EVERY entry of the group (not only the ≤ 500 the view carries); an entry left `undefined` keeps the group blocking. A decided group gives `CONV-JOIN-CONFLICT-CHOSEN` with the tallies, and the losing cells go to `info.notChosen` with both lines.
- Output columns: a quantity whose two sides pass `sameStructure` (Task 4: role kinds, bounds, date parts, depth unit, `positive`, hemisphere columns, `dateFormatted`) keeps the results columns, which receive the chosen side's raw cells (verbatim text of the chosen side, P5). Any other pair of structures (a Date column against Year/Month/Day; one depth against top/bottom; `Depth [cm]` against `Depth [m]`; a signed latitude against latitude + hemisphere), when any row takes the description side (a decided entry or a P4 fill), gets `resolved` columns (F4): date → one `datetime` column holding `eventDateText` of the chosen side; depth → min and max in metres from the chosen side (a single depth giving both); position → `latitude` and `longitude` holding the chosen side's signed decimals from `Meta`; both sides' columns of that quantity become `ignore` + consumed. Never two columns of one role in the merged mapping.

- [ ] **Step 1: Write the failing tests:**
  - Spec test 5: `Counts` gains `Date`, X01 = `2021-05-02`: one group `date` with one entry `{ key: 'X01', samples: ['X01'], descriptionText: '2021-05-03', resultsText: '2021-05-02' }`, finding `CONV-JOIN-CONFLICT` (error, `count: 1, total: 1`). Answer `{ group: 'date', take: 'description', count: 1, exceptions: [] }` → merged X01 date cell `2021-05-03`, no CONFLICT, `CONV-JOIN-CONFLICT-CHOSEN` `{ fromDescription: 1, fromResults: 0 }`, `notChosen` = `[{ side: 'results', line: 2, otherLine: 2, group: 'date' }]`. Exception `[{ entry: <X01 entry id>, take: 'results' }]` with the same bulk → cell `2021-05-02`, `notChosen[0].side === 'description'`.
  - Spec test 6, as decision 4 binds it (F18: the grouping half only): three samples whose description date is later than the results date and one earlier → ONE group `date` with `count: 4`.
  - No bulk side (F5): the four-sample group answered `{ group: 'date', count: 4, exceptions: [{ entry: <first id>, take: 'description' }] }` → that entry decided, `CONV-JOIN-CONFLICT` stays with `count: 3, total: 4`.
  - Pairs (F5): 600 samples all `2021-05-03` / `2021-05-02` → `{ group: 'date', count: 600, exceptions: [], pairs: [{ pair: ['2021-05-03', '2021-05-02'], take: 'description' }] }` decides all 600, no CONFLICT; an exception on one entry with `take: 'results'` beats the pair for that entry.
  - Spec test 7: `03.05.2021` against `2021-05-03` → no group, results cell kept verbatim.
  - Re-open: answer `count: 3` while today finds 4 → `CONV-JOIN-CONFLICT` still there, merged cells unchanged.
  - C1: `Counts` with Year/Month/Day = 2021/5/3 against `Samples` Date `2021-05-03` → no conflict; with Day = 2 → group `date`; after `take: 'description'` the merged mapping has exactly one date-like role on a `resolved` column holding `2021-05-03`, and both Y/M/D and the `Samples` Date are `ignore` + consumed.
  - C2 (F6): `Samples` `ST-1` depth `10`; `Counts` samples at `ST-1`: X01 `10`, X01b `12`, X01c `12`, X01d `14` → group `depth` with two entries, `12` (`samples: ['X01b', 'X01c']`) and `14` (`samples: ['X01d']`), `count: 3`; bulk `take: 'results'` keeps all results depths; the same bulk with an exception on the `14` entry `take: 'description'` changes X01d only.
  - Depth unit (F4): `Samples` `Depth [cm]` X01 = `1000`, X02 = `2000`; `Counts` `Depth [m]` X01 = `10`, X02 = `12` → X01 no conflict (10 m both), X02 one entry in group `depth`; after `take: 'description'` resolved min/max columns hold `20` for X02 and `10` for X01; `Depth [m]` and `Depth [cm]` are `ignore` + consumed; no merged cell `2000` under a role in metres.
  - Hemisphere (F4): `Samples` `Latitude` X01 = `-61.1`; `Counts` `Latitude` `61.1` + `Hemisphere` `S` → no conflict; with `Counts` `61.2` + `S` → group `position`; after `take: 'description'` the resolved `latitude` holds `-61.1` (never `61.1` beside an `S`), and both sides' latitude, longitude and hemisphere columns are `ignore` + consumed.
  - F18: a `Notes` column with role `ignore` in both sheets, different texts → no group; a `keyPart` column likewise.
  - Variable: `Temperature [degC]` in both sheets, 4.5 vs 4.7 for X01 → group `v.<hash>` with label `Temperature [degC]`; `Temperature [degF]` in one sheet is NOT the same quantity (no group, both columns kept).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-conflicts.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the comparison, groups, entries, answers and resolved columns as above (the ungrouped Task 4 conflict is replaced).
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert/sample-join-conflicts.test.ts test/convert/sample-join-merge.test.ts test/convert/sample-join-propose.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/sampleJoin.ts test/convert/sample-join-conflicts.test.ts` — "Values the two sheets both give are compared after the converter's own reading, units and signs included; differences form one group per quantity that blocks until the person takes one side for all, per sample or per pair of values, and the value not taken is kept with both lines."

### Task 6: `convert()` reads a merged sheet: its findings, description-only events, remapped findings, several results sheets

**Files:**
- Modify: `src/core/convert/build.ts` — `:476-525` (`unreadColumns`, `ignoredColumns`: skip `sin.sampleJoin.consumed`), `:1897-1975` (row loop: `relevant` at `:1920` becomes `let`), `:2003-2060` (after the event is opened: a description-only line writes no occurrence), `:2711-2720` (`sheetSites` for `sampleSplitOf`), `:3076-3080` (the join remap, BEFORE the pivot remap `originalLines`), `:3088` (push every `sin.sampleJoin.findings` into `findings` before `decideRows`, so `decideRows` and `ok` at `:3098` see them — F1)
- Modify: `src/core/convert/sampleJoin.ts` (orchestrator + `joinLines`)
- Test: `test/convert/sample-join-convert.test.ts` (new)

**Interfaces:**
- Consumes: `mergeSampleSheets`, `resultsKeys`, `SampleJoinInfo`, `ConflictGroup` (Tasks 4–5); `proposeSampleJoins` (Task 3).
- Produces:
  ```ts
  export interface SampleJoinRequestCore { results: number; description: number; keys: JoinKeyPair[]; conflicts: ConflictAnswer[]; resultsOnly?: number; resultsOnlyFromFile?: boolean }
  export interface JoinOutcome { sheets: ConvertSheetInput[];
    /** CONV-JOIN-PROPOSED and CONV-JOIN-DESCRIPTION-LONG only; a merge's own findings travel on SampleJoinInfo.findings (F1) */ findings: Finding[];
    proposals: SampleJoinProposal[]; /** `results` = the REQUEST index of the results sheet */ conflicts: (ConflictGroup & { results: number })[];
    /** for each output sheet, the index of the request sheet it came from */ origin: number[] }
  export function joinInputs(sheets: readonly ConvertSheetInput[], joins: readonly SampleJoinRequestCore[], declined: readonly { results: number; description: number }[]): JoinOutcome
  export function joinLines(findings: readonly Finding[], sin: ConvertSheetInput): Finding[]
  ```
- `joinInputs` is the ONLY validator (F8). A join is invalid when: an index or key index is not a whole number or out of range; the results sheet is not a results sheet (no taxon role, or a profile); a sheet is used twice as results; the description is itself a results sheet or a profile; a results key column is no longer a key on its side (not `sampleId`/`station`/`cruise` and not in `sampleKey.columns`); the description sheet is pivoted (F16). An invalid join is dropped without a finding of its own and is NOT passed as `skip`, so its proposal (or its `CONV-JOIN-DESCRIPTION-LONG`) shows again. Valid joins: grouped by description; `resultsKeys` is computed for every results sheet of a description first; each join gets `heldElsewhere` = the union of the OTHER joins' results keys of that description, and only the first gets `appendDescriptionOnly: true` (F3); each description input's `leaveOut`/`leaveOutFile` reach `SampleJoinInfo.description` (F14); the description inputs are removed. `proposals` = `proposeSampleJoins(sheets, [...validJoins, ...declined])`; a proposal with `long: false` gives one `CONV-JOIN-PROPOSED`, one with `long: true` gives one `CONV-JOIN-DESCRIPTION-LONG` (F16, file/sheet = the results sheet, `description` = the long sheet). With no valid join, `sheets` is the input array itself (identity).
- `joinLines` (called in `convert()` for each input with `sampleJoin`, before the pivot remap so `takenFromDescription` lookups use merged lines; the results pivot remap then leaves the findings moved to the description sheet alone): a finding on the merged sheet whose `field` is a description column (or a `resolved` column, or a results column cell in `takenFromDescription`), or whose lines are all `descriptionOnly` lines, moves to the description file/sheet, its own header and its description lines, de-duplicated (spec test 11: once, not once per results row). The merge's own findings (`info.findings`) already name the right sheet and are pushed after `joinLines`, untouched.
- Row loop: `const descOnly = sin.sampleJoin?.descriptionOnly.has(row.line) === true`; long shape: `relevant ||= descOnly`; after the sample event is opened, `if (descOnly) { /* sample eMoF, device, mesh as for any sample */ fate.event(row.line); continue; }` before any occurrence code. `sheetSites` excludes events whose source line is a description-only line.

- [ ] **Step 1: Write the failing tests** (`convert({ sheets: joinInputs(bookInputs(), [{ results: 0, description: 1, keys: [{ results: 0, description: 0 }], conflicts: [] }], []).sheets })` unless said):
  - Spec test 2: events `X01`, `X02` have `eventDate` `2021-05-03` / `2021-05-04`, `decimalLatitude` 61.1 / 61.3, depth 10 / 20, station parent `ST-1` / `ST-2`; occurrences as without the join (3, same IDs); no `CONV-ID-DUPLICATE` (the Q-T5-1 case).
  - Spec test 3, wide AND long `Counts`: one sample event `X03` with no occurrence; `CONV-JOIN-DESCRIPTION-ONLY` present; no `CONV-SAMPLE-PER-ROW` (a long variant with ≥ 30 one-row samples where only description-only events would tip `sampleSplitOf`).
  - Spec test 4 after "results only": event `X04` exists, from `Counts` only, with no `eventDate`.
  - Spec test 11: `Samples` X02 date `2021-13-45` → the date finding names `file: 'book.xlsx', sheet: 'Samples', field: 'Date', lines: [3]`, exactly once.
  - Merge findings inside convert (F1): spec test 5 unanswered → `convert(...).findings` contains `CONV-JOIN-CONFLICT` and `ok === false`; spec test 9 → `CONV-JOIN-AMBIGUOUS` among `convert(...).findings`; in both, `JoinOutcome.findings` holds no rule other than `CONV-JOIN-PROPOSED` / `CONV-JOIN-DESCRIPTION-LONG`.
  - Decision 6 (F3): `Phyto` (X01, X02), `Zoo` (X05), `Samples` (X01, X02, X03, X05) with both joins confirmed: `X03` and `X05` are each ONE event in the whole result; `CONV-JOIN-DESCRIPTION-ONLY` appears once, with `samples: 'X03'`; no `CONV-ID-DUPLICATE`; `Samples` is not converted on its own.
  - Review Focus 4: `Counts` without a `Sample` column, picked key `Station + Date` matched to `Samples` `Station + Date`: the appended description-only row gets the ID the key would make (`keyPrefixOf` + parts) and an event.
  - Review Focus 3 at core level (F8): the confirmed join with the `Counts` `Sample` column re-roled to `ignore`; with key index `99`; with key index `1.5`; with `description: 0` (a results sheet) → no throw, `out.sheets === inputs`, no sheet has `sampleJoin`, and `out.proposals` holds the pair again with its `CONV-JOIN-PROPOSED`.
  - Long description (F16): `bookInputs('long-samples')` with the join confirmed → `out.sheets === inputs`, exactly one `CONV-JOIN-DESCRIPTION-LONG` naming `description: 'Samples'`, no `CONV-JOIN-PROPOSED`; unconfirmed → the same finding and `out.proposals[0].long === true`.
  - C3 at core level (F7, replaces the old guard): `joinInputs(bookInputs(), [], [])` → `out.sheets` is the input array (`toBe`), no sheet has `sampleJoin`, `out.findings` is exactly one `CONV-JOIN-PROPOSED`, `out.origin` is `[0, 1]`; `joinInputs` on a single-sheet file → no findings, no proposals, `out.sheets === inputs`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-convert.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** `joinInputs`, `joinLines` and the build.ts paths above.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert --maxWorkers=2` — Expected: PASS (every existing converter test unchanged: the convert-side C3 proof).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/build.ts src/core/convert/sampleJoin.ts test/convert/sample-join-convert.test.ts` — "The converter reads a joined sheet as one table and judges the join's own findings with the rest: a described sample without results is an event without an occurrence and does not count as a split sample, a finding about a description cell names its own line once, one description serves several results sheets with each sample written once, and an invalid or long-description join is not applied."

### Task 7: The description sheet's ledger and the not-written file

**Files:**
- Modify: `src/core/convert/ledger.ts:22-75` (reasons), `:179-192` (`LineFate.lostCells`), `:194-219` (`SheetLedger`), new `joinLedgers`, `combineDescriptionLedgers`; `src/core/convert/notWritten.ts:30-71` (`REASON_KIND`), `:74-86` (`COVERED_BY`), `:89-94` (`SUPERSEDES`), `:119-124` (`sourceOf`), `:161` (`decideRows`), `:289` (lost-cell detail); `src/core/convert/build.ts` where `buildSheetLedger` is pushed for a sheet with `sampleJoin` (`:2463`)
- Test: `test/convert/sample-join-ledger.test.ts` (new)

**Interfaces:**
- Consumes: `SampleJoinInfo` (Tasks 4–6).
- Produces:
  - `LedgerReason` += `'join-not-chosen' | 'join-no-key' | 'join-ambiguous'`, appended at the END of `LEDGER_REASONS` (line and lost-cell reasons only, never through `FateLog.cell`, so the 31-bit chain is untouched). `REASON_KIND`: `join-not-chosen` → `listed`; `join-no-key` → `blocks` with `SUPERSEDES['join-no-key'] = 'CONV-JOIN-KEY-BLANK'` (F14: the `ragged`/`ROW-RAGGED` pattern: until answered, `decideRows` raises `CONV-ROW-NOT-UNDERSTOOD { reason: 'join-no-key' }` on the description sheet beside the description-side `CONV-JOIN-KEY-BLANK`; answered, `CONV-ROW-LEFT-OUT` and the KEY-BLANK is suppressed); `join-ambiguous` → `covered`, `COVERED_BY['join-ambiguous'] = ['CONV-JOIN-AMBIGUOUS']` (found because the merge's findings are now convert's own, F1).
  - `LineFate.lostCells` entries += `taken?: string; other?: { sheet: string; line: number }` (F10); `join-not-chosen` lost cells are never counted in `LineFate.cells` or `SheetLedger.cells` (those stay taxon-cell tallies).
  - `SheetLedger.kind` += `'description'`; `SheetLedger.lent?: { sheet: string; lines: number; samples: number }[]` (which results sheets the description lines were lent to, decision 6).
  - `export function joinLedgers(merged: SheetLedger, info: SampleJoinInfo): { results: SheetLedger; description: SheetLedger }` — ONE merge: the merged ledger's appended lines move to the description ledger (fate `written`, `wrote: ['event']`); results lines keep their fates; a results line whose value lost a conflict gets `lostCells: [{ index, reason: 'join-not-chosen', taken, other }]`; a description line gets `written` when lent, `join-not-chosen` as a lost cell when one of its values lost, `join-no-key` / `join-ambiguous` as its fate; the description columns' `LedgerColumn`s move to the description ledger under their own headers (`Depth`, not `Depth (2)`), consumed columns listed in neither.
  - `export function combineDescriptionLedgers(parts: readonly SheetLedger[]): SheetLedger` — the ONLY combiner (F12): the description ledgers of one description sheet (one per results sheet it served) as one; a line lent to two results sheets is one written line, `lent` lists each results sheet.
  - `inputIndex` of the description ledger = the first merged input. `sourceOf`: `kind === 'description'` → `sheets[i].sampleJoin.description.sheet`; the results ledger of a merged input → `sheets[i].sampleJoin.results.raw` (the ORIGINAL results line, not the merged one, F10). `decideRows`: for a `kind === 'description'` ledger the leave-out answers are read from `sampleJoin.description.leaveOut` / `leaveOutFile` (the page stores them on the description sheet, whose finding names it).
  - The not-written detail of a `join-not-chosen` cell names the column, the value taken and the other sheet's line: `Date (join-not-chosen: 2021-05-03 taken from Samples line 2)` (P7, "with both lines").

- [ ] **Step 1: Write the failing tests:**
  - Spec test 13: the joined `book.xlsx` ledger has a `Counts` entry (`rows.source === 3`, `balanced`) and a `Samples` entry (`kind: 'description'`, `rows.source === 3`, `balanced`, `lent: [{ sheet: 'Counts', lines: 2, samples: 2 }]`); `X03`'s line has `wrote: ['event']`; the `Samples` ledger's columns carry `Samples` headers; no `not-used` ledger for `Samples` from the handler (asserted in Task 8).
  - P7 with spec test 5 answered `description`: `notWrittenRows` yields a `Counts` line 2 row with reason `cells-not-written`, detail `Date (join-not-chosen: 2021-05-03 taken from Samples line 2)`, and `cells` = the ORIGINAL `Counts` line (its width, no lent cells, F10); the exception variant yields the `Samples` line 2 row instead, detail naming `2021-05-02` and `Counts` line 2.
  - Review Focus 2 (F14): a `Samples` row with a blank `Sample` and depth `30` → fate `join-no-key`, status `needs-decision`, `convert().findings` holds the description-side `CONV-JOIN-KEY-BLANK` and `CONV-ROW-NOT-UNDERSTOOD { reason: 'join-no-key', count: 1 }` on `Samples`, `ok === false`; with the `Samples` input's `leaveOut: [{ reason: 'join-no-key', count: 1 }]` → `CONV-ROW-LEFT-OUT` on `Samples`, no `CONV-JOIN-KEY-BLANK`, status `left-out`, ledger balanced; with `count: 2` the question stays.
  - P3: the two ambiguous `Samples` lines have fate `join-ambiguous` and status `needs-decision` while `CONV-JOIN-AMBIGUOUS` stands, and there is NO `CONV-ROW-NOT-UNDERSTOOD` with `reason: 'join-ambiguous'` (one question, F1).
  - Decision 6 ledger (F12): `Phyto` (X01, X02), `Zoo` (X05), `Samples` (X01, X02, X03, X05) → ONE `Samples` ledger, `rows.source === 4`, `balanced`, `lent: [{ sheet: 'Phyto', lines: 2, samples: 2 }, { sheet: 'Zoo', lines: 1, samples: 1 }]`, the `X03` line written once with `wrote: ['event']`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-ledger.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the reasons, `lostCells` fields, `joinLedgers`, `combineDescriptionLedgers`, the call in `convert()` for inputs with `sampleJoin`, `sourceOf`, the `decideRows` leave-out source and the detail text.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert --maxWorkers=2` — Expected: PASS (`ledger*.test.ts`, `notWritten*.test.ts` unchanged).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/ledger.ts src/core/convert/notWritten.ts src/core/convert/build.ts test/convert/sample-join-ledger.test.ts` — "The description sheet of a join has its own balanced ledger that says which results sheets its lines were lent to, a description row with a blank key is asked about before it is left out, and the value not chosen in a conflict is listed beside the archive with both lines."

### Task 8: Worker protocol, handler and companion file; APPS.md and the no-joins test

**Files:**
- Modify: `src/worker/convert.protocol.ts` (`ConvertRequestBody`, `ConvertView`), `src/worker/convert.handler.ts:89-180` (parse: settings), `:277` (`inputsOf`), `:315-317` (`compute`, `listSplits` on the merged sheets), `:348` (`notUsedLedgers`), `:355` (`run`), `:434` (`previewKey`); `src/core/convert/settings.ts` (format comment, `ConvertSettings`, `readConvertSettings`, `writeConvertSidecar`)
- Modify: `docs/APPS.md:498-499` (§3.4 end), `:1401` (§8.4 Transposed), `:1491` (sampleKey paragraph "whether two sheets hold the same samples is not asked"), new `### 8.11 Joining a results sheet to its sample description` before `## 9.` (`:1906`); `test/convert/no-joins.test.ts` (file comment + `describe` text only: "/convert reads no join that the person has not confirmed")
- Test: `test/app/convertWorker.test.ts` (new `describe('sample join')`; any existing deep-equal of a whole `ConvertView` gains `sampleJoin: { proposals: [], conflicts: [] }`), `test/convert/settings.test.ts`

**Interfaces:**
- Consumes: `joinInputs`, `JoinOutcome`, `ConflictGroup`, `ConflictAnswer` (Tasks 5–6); `keyHashes`, `resolveKeyHashes` (`keySetting.ts`).
- Produces:
  ```ts
  // convert.protocol.ts
  export interface SheetRef { fileId: string; sheet: string }
  export interface SampleJoinRequest { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[];
    conflicts: { group: string; take?: 'description' | 'results'; count: number; exceptions: { entry: string; take: 'description' | 'results' }[];
      pairs?: { pair: [string, string]; take: 'description' | 'results' }[] }[];
    resultsOnly?: number; fromFile?: boolean }
  ConvertRequestBody.sampleJoin?: SampleJoinRequest[];
  ConvertRequestBody.sampleJoinNo?: { results: SheetRef; description: SheetRef }[];
  ConvertView.sampleJoin: { proposals: { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[]; covered: number; samples: number; long?: true }[];
    conflicts: (Omit<ConflictGroup, 'answer'> & { results: SheetRef })[] }   // entries capped at 500 per group; count is the true number of samples
  // settings.ts
  ConvertSettings.sampleJoin?: { results: [string, string]; description: [string, string]; resultsRows: number; descriptionRows: number; resultsHashes: string; descriptionHashes: string;
    resultsOnly?: number; conflicts: { group: string; take: 'description' | 'results' | 'mixed'; count: number }[] }[];
  ConvertSettings.sampleJoinNo?: { results: [string, string]; description: [string, string] }[];
  ```
  Companion lines (file and sheet names as a JSON array, so a `:` in a name is safe; no data value): `sampleJoin=<rRows>:<dRows>:<rHashes>:<dHashes>:<["rFile","rSheet","dFile","dSheet"]>`, `sampleJoinConflict=<description|results|mixed>:<count>:<group>:<["rFile","rSheet"]>`, `sampleJoinResultsOnly=<count>:<["rFile","rSheet"]>`, `sampleJoinNo=<["rFile","rSheet","dFile","dSheet"]>`. Exceptions and pairs hold values (entry ids of sample codes, value texts), so they are never written: a group answered with exceptions, with pairs, or without a bulk `take` is saved as `mixed` (the page re-opens it, Task 9).
- Handler (F8: maps refs only, validates nothing): `inputsOf` maps `SheetRef` → request index (a ref absent from `body.sheets` drops that join; every other check is `joinInputs`'s), runs `joinInputs`, returns `{ sheets, outcome }`; `compute` prepends `outcome.findings` (proposals and long-description notes ONLY; a merge's findings come out of `convert()`, F1) to `r.findings`, runs `listSplits` on the merged sheets and returns them (so `notWrittenCsv` and ledger `inputIndex` agree); `previewKey` resolves the request sheet `at` through `outcome.origin` (`origin.indexOf(at)`; a description sheet merged away has no preview); `run` fills `ConvertView.sampleJoin` (indexes mapped back to `SheetRef`; `JoinOutcome.conflicts[].results` is a request index); `notUsedLedgers` never lists a description sheet that was merged; `decisionsOf` writes nothing for the join (the page writes the companion, as for `sampleKey`).
- APPS.md §8.11 states (F14, F16): "A description row with a blank key cell is asked about (CONV-JOIN-KEY-BLANK); left out, it is listed beside the archive with reason join-no-key." and "A description sheet in the long layout (one row per parameter, read through its pivot) is not joined for now: the converter names it (CONV-JOIN-DESCRIPTION-LONG) and converts both sheets as it does without a join."

- [ ] **Step 1: Write the failing tests:**
  - Spec test 1 (C3): handler on the CSV twins `results.csv` + `samples.csv` (Task 3 fixtures) with no `sampleJoin`: exactly one `CONV-JOIN-PROPOSED`; `CONV-ID-DUPLICATE` still there; `view.findings` minus `CONV-JOIN-PROPOSED` deep-equals the findings of the same request with `sampleJoinNo` set for the pair (no proposal, no merge), and `view.ledger` and `notWritten` are equal too. (Byte identity against the base commit: Task 10.)
  - Confirmed over two files: `sampleJoin: [{ results: { fileId: 'c1', sheet: 'results.csv' }, description: { fileId: 'c2', sheet: 'samples.csv' }, keys: [{ results: 0, description: 0 }], conflicts: [] }]` → no `CONV-ID-DUPLICATE`, `view.ledger` has no `not-used` entry for `samples.csv`, `view.sampleJoin.proposals` empty.
  - Spec test 4 end to end: after `resultsOnly: 1`, `CONV-JOIN-NO-DESCRIPTION` is gone and the export is still refused, by the same rule ids that a one-sheet file holding only the `X04` row (no date) gets today.
  - Review Focus 3: the confirmed join with the description sheet absent from `body.sheets`, or a key index `99`, → no throw, no merge, the proposal is back.
  - `previewKey` (F18): request order `samples.csv` (0), `results.csv` (1) with the join confirmed → the preview for sheet 1 is the `results.csv` key preview, not `samples.csv`'s.
  - Spec test 12, round trip only (F11, `settings.test.ts`): `writeConvertSidecar({ sampleJoin: [{ results: ['book.xlsx','Counts'], description: ['book.xlsx','Samples'], resultsRows: 3, descriptionRows: 3, resultsHashes, descriptionHashes, conflicts: [{ group: 'date', take: 'description', count: 1 }] }], sampleJoinNo: [...] })` read back by `readConvertSettings` gives the same object; a conflict saved with `take: 'mixed'` reads back as `'mixed'`; a sheet name containing `:` survives. (Re-opening on changed rows/hashes and `mixed` → unanswered are `initialJoins`'s, tested in Task 9.)
  - `test/convert/no-joins.test.ts` still passes unchanged in its assertions.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertWorker.test.ts test/convert/settings.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the protocol, handler and settings as above; write APPS §8.11 (proposal, confirmation, P1–P8, C1–C3, blank description keys, long description sheets, companion lines) and the three edits; update the no-joins test's comment and `describe` text.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app/convertWorker.test.ts test/convert test/server --maxWorkers=2` — Expected: PASS. (No golden run here: `test/golden` never reaches /convert, F7.)
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/worker/convert.protocol.ts src/worker/convert.handler.ts src/core/convert/settings.ts docs/APPS.md test/convert/no-joins.test.ts test/app/convertWorker.test.ts test/convert/settings.test.ts` — "The convert worker applies confirmed sample joins, sends the proposals and conflict groups to the page, keeps the join and its answers in the companion file by names, hashes and counts only, and APPS.md describes the join."

### Task 9: The page: proposal panel, conflict groups, P1 button, the description ledger

**Files:**
- Create: `src/app/components/ConvertSampleJoin.tsx`
- Modify: `src/app/convertModel.ts:118-131` (`ConvertState`), `:250-286` (`requestOf`), `:328-350` (`initialChoices` neighbour `initialJoins`), new `sampleJoinSettingsOf`; `src/app/pages/ConvertPage.tsx` (state, new `chooseForJoin` beside `chooseForSheet` at `:367`, the finding buttons near `:1561`, companion download at `:849-853`, panel placement above the findings); `src/app/components/ConvertLedger.tsx` (a `kind: 'description'` ledger with its `lent` list, F15); `src/core/i18n/ui.ts` (keys `convert.join.*` and `convert.ledger.description`, `convert.ledger.lent` in en, pl, de, fr)
- Test: `test/app/convertSampleJoin.test.tsx` (new), `test/app/i18n.test.tsx` (parity is already checked)

**Interfaces:**
- Consumes: `ConvertView.sampleJoin`, `SampleJoinRequest`, `ConvertSettings.sampleJoin*` (Task 8); `SheetLedger.kind`/`lent` (Task 7).
- Produces:
  ```ts
  export interface JoinChoice { results: SheetRef; description: SheetRef; keys: { results: number; description: number }[]; state: 'confirmed' | 'declined';
    conflicts: SampleJoinRequest['conflicts']; resultsOnly?: number; fromFile?: boolean }
  ConvertState.joins?: JoinChoice[];
  export function initialJoins(parsed: ConvertParseResult): JoinChoice[]          // from the companion: names + hashes + row counts must all match, else nothing; a 'mixed' group comes back unanswered (F11)
  export function sampleJoinSettingsOf(parsed: ConvertParseResult, joins: readonly JoinChoice[]): Pick<ConvertSettings, 'sampleJoin' | 'sampleJoinNo'>   // exceptions, pairs or no take → 'mixed'
  // requestOf: confirmed → body.sampleJoin, declined → body.sampleJoinNo
  export function ConvertSampleJoin(props: { view: ConvertView['sampleJoin']; files: ConvertFileSummary[]; joins: JoinChoice[]; onChange: (joins: JoinChoice[]) => void }): JSX.Element | null
  // ConvertPage.tsx (F15): edits `joins`, never the per-sheet `choices`
  const chooseForJoin = (f: Finding, choice: 'resultsOnly' | 'askAgain'): void
  ```
- Panel per proposal: "Sheets {results} and {description} describe the same samples, linked by {keys}" with {covered}/{samples}; buttons Confirm / Change (pick the description sheet and, per key pair, the two columns) / No. A `long` proposal (F16) shows "Sheet {description} is in the long layout (one row per parameter); joining it is not supported yet, both sheets are converted as without a join" and no Confirm. Per conflict group: heading "{label} differs in {count} samples", buttons "Take from the description for all" / "Take from the results for all"; under it a table (sample, description value, results value, results samples) with a per-row choice (sent as an exception by entry id; with no bulk click the answer has no `take`, F5) and "Apply to all with the same pair of values" (sent as one `pairs` item, covering entries beyond the 500 shown, F5); a row choice wins over a pair, a pair over the bulk choice. A confirmed join shows "Undo". The P1 finding gets the button "Convert these samples with only what this sheet says" (`chooseForJoin(f, 'resultsOnly')` stores `resultsOnly = f.params.count` on the join); `CONV-JOIN-RESULTS-ONLY` gets "Ask again" (`chooseForJoin(f, 'askAgain')` clears it from `joins`). The ledger panel lists a description ledger as such, with "lent to {sheet}: {lines} lines, {samples} samples" per `lent` entry.

- [ ] **Step 1: Write the failing tests** (`ConvertPage` with `createDirectConvertEngine`, files `results.csv` + `samples.csv` via `chooseFiles`):
  - The panel shows `results.csv`, `samples.csv`, the key `Sample ↔ Sample`; nothing is joined (`CONV-ID-DUPLICATE` still listed).
  - Confirm → the next request has `sampleJoin` with that pair; `CONV-ID-DUPLICATE` gone. No → `sampleJoinNo`, the panel hidden.
  - Spec test 5 on the page: group "Date differs in 1 sample"; "Take from the description for all" → the request carries `{ group: 'date', take: 'description', count: 1, exceptions: [] }`; then the X01 row set to results → `exceptions: [{ entry: <X01 entry id>, take: 'results' }]`.
  - Per row only (F5): with no bulk click, the X01 row set to description → `{ group: 'date', count: 1, exceptions: [{ entry: <id>, take: 'description' }] }` with no `take`.
  - Same pair (F5): two rows with the same pair, "Apply to all with the same pair" on one → `pairs: [{ pair: ['2021-05-03', '2021-05-02'], take: 'description' }]` and neither row in `exceptions`.
  - Spec test 4: the P1 button sends `resultsOnly: 1`; "Ask again" removes it, and the per-sheet choices are unchanged (F15).
  - `initialJoins` (F11): a companion matching names, hashes and rows → a confirmed join with the `date` answer; the same companion against a `Counts` with 4 rows → `[]` (the join and the conflict choice re-open); a group saved `mixed` → the join confirmed, that group unanswered.
  - The companion file written after Confirm contains a `sampleJoin=` line and no sample code; after a per-row answer its `sampleJoinConflict=` line says `mixed`.
  - Long description (F16): `book.xlsx` with a long `Samples` → the panel shows the not-supported sentence and no Confirm button.
  - Ledger panel (F15): after Confirm, the `samples.csv` ledger is shown as the description, with "lent to results.csv".
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertSampleJoin.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the model functions, the component, `chooseForJoin`, the ledger panel lines, the page wiring and the strings in four languages.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/app/components/ConvertSampleJoin.tsx src/app/components/ConvertLedger.tsx src/app/convertModel.ts src/app/pages/ConvertPage.tsx src/core/i18n/ui.ts test/app/convertSampleJoin.test.tsx` — "The convert page proposes the sample join with Confirm, Change and No, shows each conflict group with a choice for all samples, per sample and per pair of values, offers to convert samples without a description from the results sheet alone, and shows the description sheet's ledger with the sheets it was lent to."

### Task 10: Acceptance on the real corpus (VPS only)

Nothing of this task runs on the Mac (Michał, 06.11) and no real data or report enters the repo.

**Files:** none in the repo. Harness: a copy of `/home/ice13ball/tools-regression/tmp/r2t27` as `/home/ice13ball/tools-regression/tmp/join` (its `setup.sh`, `run-vps.sh`, `scripts/runall.sh`, `scripts/convert-harness.test.ts`, `scripts/cmp27.py` adapted there); corpus `/home/ice13ball/tools-regression/data/join-real-2026-11-12/` with `MANIFEST.md` (copy at `/Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-real-MANIFEST.md`).

- [ ] **Step 1: Ship the two trees.** On the Mac: `git archive --format=tar -o /Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-ship/base.tar 151882d` and `… new.tar HEAD`; copy both to `/home/ice13ball/tools-regression/ship/join/` on `apiSomethingRare`. Build `manifest.json` (label, file, choices) from `MANIFEST.md`: one entry per results file or workbook; a two-file dataset lists both files.
- [ ] **Step 2: Extend the harness** (in `tmp/join/scripts`, not the repo): a mode `CONV_JOIN=none|confirm-description`. `confirm-description` takes the proposal from `view.sampleJoin.proposals` (skipping `long` ones), confirms it, answers every conflict group `take: 'description'` with today's count, answers P1 `resultsOnly`, and accepts nothing else beyond what the round-2 choices already do. Dumps per file: archive file hashes, findings (rule, sheet, lines, params), the ledger tallies, and `view.sampleJoin`.
- [ ] **Step 3: Check the host and run** (F17). `awk '/MemAvailable/ {print $2}' /proc/meminfo` ≥ 4000000; swap not full (`free -m`: swap used < total); no other heavy unit, checked in BOTH managers: `systemctl list-units 'obis-sync*' 'pm-h1-*' 'tools-regression-*' --state=running` (system units: production sync and the plankton model) and `systemctl --user list-units 'obis-sync*' 'pm-h1-*' 'tools-regression-*' --state=running`, both empty. Then `systemd-run --user --unit=tools-regression-join -p MemoryMax=3G -p CPUWeight=10 -p IOWeight=10 bash /home/ice13ball/tools-regression/tmp/join/run-vps.sh` (`CPUWeight`/`IOWeight` are the systemd equivalents of `nice`/`ionice` that `~/github/CLAUDE.md` asks for), which runs `runall.sh base`, `runall.sh new` (CONV_JOIN=none) and `runall.sh joined` (CONV_JOIN=confirm-description) and the compare.
- [ ] **Step 4: Verify C3.** Compare base vs new per file — Expected: archive hashes identical; findings identical except one added `CONV-JOIN-PROPOSED` (or `CONV-JOIN-DESCRIPTION-LONG`) per proposed pair; ledgers identical. Any other difference is a bug: stop and report it with the file label and the first differing key.
- [ ] **Step 5: Write the report** `/home/ice13ball/tools-regression/tmp/join/report.md` (copied to `/Users/ice13ball/.claude/jobs/3ed835d5/tmp/join-acceptance-report.md`), one section per file: proposal (sheets, key columns, covered / samples) or "no proposal" with the reason seen, or "long description, not joined"; filled per column (`CONV-JOIN-FILLED`); conflict groups (quantity, count, three example pairs); cells rewritten across file conventions (count per column); description-only samples; samples without description; ambiguous keys and blank keys on either side; the joined run's `ok`, blocking rules and whether both ledgers balance; anything that crashed. Expected outcome: every file runs to the end, every ledger balances, and the report goes to Michał for human review (decision 9); the branch is not proposed for merge before he has read it.
- [ ] **Step 6:** stop the unit if still listed, keep `tmp/join` until Michał has reviewed; nothing to commit.

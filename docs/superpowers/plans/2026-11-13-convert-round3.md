# /convert round 3 (the missing ways out) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /convert gets the declarations a careful person needs for the 17 "way out missing" pairs of the 13.11 diagnosis (own-record rows, one declared position, day/month order, new quantity kinds, turned sheets), a blocking missing eventDate, and messages that say what to declare instead of pointing at the output table.

**Architecture:** Every new answer is an explicit per-sheet field on `ConvertSheetInput` (core) and `ConvertSheetRequest` / `SheetChoice` (worker, page), applied in `convert()` (`src/core/convert/build.ts`) at the place the value is read; nothing changes for an input without it. Messages are new CONV rules raised in `build.ts` in the source sheet's terms, and `validateTables` drops the output-table finding that says the same cause. The turn is a file-level re-read in the worker, like `repivot`, with a provenance table so findings and the ledger stay in source lines.

**Tech Stack:** Vite + React + TypeScript, vitest (+ @testing-library/react for the page), 4-language i18n (`src/core/i18n/ui.ts`, rule texts with plural tokens in `src/core/rules/convert.ts`).

**Spec:** `docs/superpowers/specs/2026-11-13-convert-round3-design.md` (sections 12a and 12b are binding). Base commit of this plan: `bd0c6dc` (code identical to production `e69d037`, the "C3 base" of every byte-for-byte comparison below).

**Where the plan reads the spec one way (rulings of this plan; each is written into the task it concerns):**
1. **Coordinates are not `parseTypedNumber` numbers** (§3 says "parsed with `parseTypedNumber`"): it refuses a sign and zero (`not-positive`) and refuses `54.123` / `10,125` as a possible thousands separator. A new `parseTypedCoordinate` (signed, one `.` or `,`, no thousands rule: within ±180 a thousands reading is out of range anyway) reads lat/lon; the uncertainty stays a `parseTypedNumber` (> 0). Task 10.
2. **The litre reading stays out of `biomassUnit`** (§8 says "in `parseRateUnit`"): `biomassUnit` (`quantity.ts:54`, called for biomass columns at `build.ts:2401`) also calls `parseRateUnit`, and a header `[mg/L]` would turn `perUnit` true and change the sample-size remark of archives that export today. `parseRateUnit` gets an option `{ litre: true }` that only `resolveQuantity` and the form pass. Task 2.
3. **`CONV-POSITION-NONE` fires only when no event of the sheet gets a position through its chain** (own, station, cruise after derivation). Without that condition a sheet with no position column whose samples hang under stations positioned by another sheet (exports today) would block, which item 4 ("no archive changes") rules out. Task 1.
4. **B4 vs Q3:** station and cruise dates are always derived from their children (`events.ts` `derive`), so "a date at an ancestor level" read literally would let any undated sample pass under a dated sibling and empty Q3. The plan applies B4 to the cases it names: a **replicate** may take its sample's date, a **profile level** stays with `CONV-PROFILE-LEVEL-INCOMPLETE` exactly as today; a **sample** event needs its own `eventDate` (its own row, or derived from its replicates). Task 9. ⚠️ Michał may overrule (literal B4).
5. **`CONV-EVENT-DATE-MISSING` names only samples whose date cells are blank (or that have no date role).** A filled but unreadable cell is already `ROW-DATE-UNPARSEABLE` / `CONV-DATE-ORDER-UNDECLARED` (blocking); "leave out" never removes such a row. Task 9.
6. **The "leave out and list" answer to `CONV-EVENT-DATE-MISSING` runs the conversion twice:** the undated samples are known only after the event tree is built; when the answer holds for today's number of lines, `convert()` runs a second pass that skips exactly those lines (fate `no-event-date`). Nothing else differs between the passes. Task 9.
7. **The turn is applied per file in the worker (a `turnChoice` request, like `pivotChoice`/`repivot`), not in `inputsOf` from `ConvertSheetRequest.turn`** (§9 says both "in `inputsOf`" and "like `repivot`"; `repivot` runs on the held file, `inputsOf` runs after the proposal). The proposal of roles must see the turned columns, so the held file is turned. Tasks 14–15.
8. **Q1 needs no separate `oneIndividual` field** (§10 lists it): Q1's answer makes `ownRecords` on a long sheet with a taxon and no quantity column mean "each row is one individual". A ticked `presenceOnly` wins if both are set. Task 12.
9. **Q2's answer needs an "after" finding:** `CONV-ROW-COPIES-KEPT` (accept, "Ask again"), the twin of `CONV-ROW-COPIES-DROPPED`, and a companion line `keepCopiesRows=`. Tasks 12–13.
10. **Ledger reasons beyond §10:** `cover-range`, `class-value` (covered by their rules) and `turn-no-name` (blocks, superseded by `CONV-TURN-NAME-BLANK` on leave-out, the `join-no-key` pattern): every unwritten cell needs a reason (`REASON_KIND` is a `Record<LedgerReason, …>`).
11. **Q6 overrides §1/§3 "not saved":** `declaredPosition=<lat>:<lon>:<uncertainty>:<sheet>` is written; the `settings.ts` header comment says it is the one typed declaration the file keeps. Task 11.
12. **B3's consequence:** `recognize.ts:531` (`speciesLike`) counts genus-shaped numeric columns to choose the wide shape; a `not-taxon` header no longer counts, so a sheet's proposed shape can change where these headers were the evidence. Listed as an intended change. Task 4.

**Execution notes:** model per task (global CLAUDE.md policy): Tasks 1, 5, 7, 9, 10, 12, 14, 15 are integration-heavy (Sonnet 5.5 `high`); Tasks 2, 3, 4, 6, 8, 11, 13 default (Sonnet 5.5 `medium` via Workflow); Task 16 and the final branch review stay in the main thread (Opus). One test-heavy agent at a time (the Mac heats up).

## Global Constraints

- Every new file starts with the two header lines of `scripts/spdx-header.txt`: `// SPDX-License-Identifier: AGPL-3.0-or-later` and `// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`.
- Page strings in 4 languages (en, pl, de, fr) in `src/core/i18n/ui.ts` (`pl`/`de`/`fr` are `Record<UiKey, string>`: a missing key fails `tsc`). Rule texts in `src/core/rules/convert.ts` with Polish plural tokens `{+count:one|few|many}`, variants through `PROFILE_VARIANTS` + `profileVariant` (`convert.ts:1987`, `:2270`); every new rule in a list of `src/core/convert/policy.ts` and in `test/convert/policy.test.ts` ("the 3.4 lists, exactly"); then `UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts` regenerates `docs/rules.md`, and `test/rules` stays green.
- Tests on the Mac: `nice -n 15 npx vitest run <path> --maxWorkers=2`, only the scoped dirs a task names (test/convert, test/app, test/rules, test/recognize, test/checks); never the full suite. End of every task: `npx tsc --noEmit -p .` with no new errors.
- Commit by explicit paths only (`git add <path> …`, never `-A`/`.`). Messages are plain descriptive English sentences (no `feat:`), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unit tests use invented data only (the spec's sheets `Fish`, `Tanks`, `Counts`, `Taxa`, `Samples`; codes `T1`, `S1`, `S2`, `X01`…); no real institution, station, person or dataset; real data never enters the repo.
- Declare-first (Michał, 02.11): every new answer is the person's explicit choice, never a default, never pre-ticked except by a companion file whose numbers still hold; no heuristic guesses a role, an order, a kind or a position from values.
- /check behaviour is unchanged. `metaParser` (`src/core/dataset.ts:298`) is shared: its new option is never passed by /check. Golden: `GOLDEN_DIR=/Users/ice13ball/data/sprawdzarka-golden/2026-10-16 nice -n 15 npx vitest run --maxWorkers=2 test/golden` (report the test count: everything skipped is a failure). Never open that directory by hand. `test/checks` passes with no edit.
- **Byte-for-byte.** An input with none of the new declarations converts as at `e69d037` (archive files, findings, ledger, not-written list) EXCEPT exactly these intended changes, and any other difference is a bug:
  1. `CONV-EVENT-DATE-MISSING` (new, blocks) on a sheet with a sample without a date (ruling 4); in those runs the Event table's `META-NO-DATES` and `ROW-DATE-MISSING` disappear.
  2. `CONV-POSITION-NONE` (new, blocks) replaces the lat/lon `DWC-TERM-EMPTY` for a sheet with sample events, no position role (or one blank in every row), no lending join, and no event positioned through its chain (ruling 3).
  3. `CONV-NO-OCCURRENCES` takes its `empty-quantity` text when a long sheet's quantity column is blank in all its taxon rows.
  4. `CONV-JOIN-KEY-ROLE-LOST` (new, blocks) where a confirmed join is dropped because a results key column lost its key role.
  5. `CONV-DATE-ORDER-UNDECLARED` replaces `ROW-DATE-UNPARSEABLE` for the ambiguous cells (`5/4/2023`) of a column whose order is undecided.
  6. Item 5: a wide-sheet numeric header with a not-taxon word is proposed `ignore` with reason `not-taxon-name` instead of a taxon candidate; downstream, `CONV-COLUMN-IGNORED` lists it and the proposed shape may change (ruling 12).
  7. A density or biomass declaration with unit `/L`, `/ml` or `per litre` resolves per volume (`CONV-UNIT-NO-P06`) instead of missing "per volume or per area".
  8. Consequence of 1 and 2: `convert().ok` turns false for in-memory runs whose invented fixture has no date or no position. A test that fails only for that reason gets an invented `Date` / `Latitude` / `Longitude` column (or asserts the new rule); no assertion about anything else is weakened, and every edited test file is named in the task's commit message.
- Principle 5: no scientific value is removed or altered silently. Every cell reaches the archive or is in the not-written list with a reason; every declaration that changes what is written is said by a finding.
- An answer that changes what is written travels with the number it was given for (`dropCopiesCount` pattern) and holds only while today's analysis finds that number. The companion file (`src/core/convert/settings.ts`) holds names, hashes (`keySetting.ts` `keyHashes`) and counts, plus, by Q6, the declared position; never a value read from the data.

## Review Focus

- **A date cell that is filled but unreadable** (`31/02/2023`, or `5/4/2023` with no declared order) in a sheet where other rows are blank: the unreadable rows are named by `ROW-DATE-UNPARSEABLE` / `CONV-DATE-ORDER-UNDECLARED` only; `CONV-EVENT-DATE-MISSING` (`blank-cells`) names only the blank ones, and "leave out" removes only those (ruling 5). Test in Task 9.
- **Two sheets share stations; sheet B has no position column** and its samples hang under stations positioned by sheet A: no `CONV-POSITION-NONE` for B (ruling 3), findings identical to `e69d037`. Test in Task 1.
- **A declared position typed the way people type it:** `-54,125` / `10.125` / `0` must be read (signed, comma, three decimals, zero), `91` refused, uncertainty `1.500` refused as ambiguous (ruling 1). Test in Task 10.
- **Turned sheet provenance:** a header `S1 ` next to `S1` is `CONV-TURN-HEADER-REPEATED` (codes compare trimmed); a bad count in sample column C of the second taxon row is reported at source line 3 with column `C`; the ledger of the turned sheet balances in source lines. Test in Task 14.
- **One declared order, every reader:** results `Date` = `5/4/2023` declared day-first, picked key `Station + Date`, joined to a description with `2023-04-05`: the eventDate, the date part of the eventID and the join comparison all read 2023-04-05, no conflict group. Test in Task 7.

---

### Task 1: CONV-POSITION-NONE, in the sheet's terms

**Files:**
- Modify: `src/core/convert/build.ts` (new module-level `positionNoneFindings`, called after `buildEventTree` at `:2832`), `src/core/convert/validate.ts:151-193` (`validateTables`), `src/core/rules/convert.ts`, `src/core/convert/policy.ts:41` (`BLOCK_CONV_RULES`), `docs/rules.md` (regenerated), `docs/APPS.md` §8.8 (`:1683`)
- Test: `test/convert/position-none.test.ts` (new), `test/convert/policy.test.ts`; fixture edits per Global Constraints 8

**Interfaces:**
- Produces: `function positionNoneFindings(sheets: readonly ConvertSheetInput[], events: readonly EventRec[]): Finding[]` (build.ts). One `CONV-POSITION-NONE` per non-profile sheet that wrote sample events, whose mapping has no `latitude`/`longitude` role (variant: the role exists and every cell of it is blank → `params.column` = that header), and none of whose events (`e.source` file + sheet) has `lat`/`lon` on itself or an ancestor. Params `{ count: <sample events>, column?: string }`; rule variants `CONV-POSITION-NONE` and `CONV-POSITION-NONE:empty-column`. Task 10 adds "no declared position" to the condition.
- `validateTables` drops an Event-table `DWC-TERM-EMPTY` whose `field` is `decimalLatitude` or `decimalLongitude` when `stage1` holds `CONV-POSITION-NONE` for every (file, sheet) that is the `source` of an event of `ds.events` (events without `source` are derived parents and do not count). `ROW-NO-COORD` is untouched.
- Text (en): `No column of sheet "{sheet}" is marked as latitude / longitude, and no joined sheet gives a position ({count} samples). Mark the latitude and longitude columns, join the sheet that describes the samples, or declare one position for the sheet.`; variant: `Column "{column}" of sheet "{sheet}" is marked as a position but is empty in every row ({count} samples). …` (same three ways out). The "declare" way out is shipped now; its button arrives in Task 11.

- [ ] **Step 1: Write the failing tests** (`test/convert/position-none.test.ts`, invented):
  - Sheet `Counts`: Sample | Date | Taxon | Count, rows (`X01`, 2023-04-05, *Calanus finmarchicus*, 3), (`X02`, 2023-04-06, *Oithona similis*, 1) → `convert()` findings contain one `CONV-POSITION-NONE` with `sheet: 'Counts'`, `params.count === 2`; `validateTables(toDataset(r, …), r.findings)` contains no `DWC-TERM-EMPTY` with field `decimalLatitude` or `decimalLongitude`.
  - The same with a `Latitude` and a `Longitude` column, both blank in every row → `params.column === 'Latitude'`, variant text.
  - Review Focus 2: sheets `A` (Station | Sample | Latitude | Longitude | Date | Taxon | Count) and `B` (Station | Sample | Date | Taxon | Count) with stations `ST-1`, `ST-2` in both → no `CONV-POSITION-NONE`; the findings equal those of the same input at the base behaviour (assert the exact rule ids list: no new id).
  - A confirmed join lending `Latitude`/`Longitude` from `Samples` (fixtures of `test/convert/joinFixtures.ts`) → no `CONV-POSITION-NONE`.
  - A profile sheet with no position → no `CONV-POSITION-NONE` (its own `CONV-PROFILE-LEVEL-INCOMPLETE` stays).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/position-none.test.ts --maxWorkers=2` — Expected: FAIL (unknown rule).
- [ ] **Step 3: Implement** the rule (block), `positionNoneFindings`, the `validateTables` filter and APPS §8.8 ("A sheet with no position at all is named in its own terms (CONV-POSITION-NONE); the output table's empty-column finding is not repeated."). Regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/app test/rules --maxWorkers=2` — Expected: PASS after the fixture edits of Global Constraints 8 (each only adds an invented position or asserts the new rule).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/build.ts src/core/convert/validate.ts src/core/rules/convert.ts src/core/convert/policy.ts docs/rules.md docs/APPS.md test/convert/position-none.test.ts test/convert/policy.test.ts` plus the edited fixtures by path — "A sheet with sample events and no position anywhere is named by CONV-POSITION-NONE in the sheet's terms, with what to mark, join or declare, instead of an empty decimalLatitude column of event.txt." (name the edited test files in the message).

### Task 2: The empty-quantity text and litre units

**Files:**
- Modify: `src/core/convert/build.ts` (per-sheet record near `:2599`, the finding at `:3153-3157`), `src/core/rules/convert.ts` (`CONV-NO-OCCURRENCES` params + variant), `src/core/convert/quantity.ts:77` (`parseRateUnit`), `:209` (`resolveQuantity` call), `src/app/components/ConvertSheetForm.tsx:48`, `docs/rules.md`
- Test: `test/convert/empty-quantity.test.ts` (new), `test/convert/quantity.test.ts`

**Interfaces:**
- `CONV-NO-OCCURRENCES` params gain `variant?: 'empty-quantity'`, `column`, `rows`; variant key `CONV-NO-OCCURRENCES:empty-quantity`, selected in `profileVariant` when `f.params.variant === 'empty-quantity'`. Raised with that variant (on that sheet) when no occurrence was written and a long biology sheet had a quantity column blank in every one of its taxon rows (`naRows` lines of the sheet = its `taxonRowCount` > 0). Text (en): `The quantity column "{column}" of sheet "{sheet}" is empty in all {rows} rows, so nothing was written. Mark the column that holds the numbers as the quantity, or tick presence only.` The `zeros` text and the generic one are unchanged.
- `export function parseRateUnit(text: string, opts: { litre?: boolean } = {}): ParsedUnit | undefined` — with `litre: true` the denominators `l`, `litre(s)`, `liter(s)`, `ml`, `millilitre(s)`, `milliliter(s)` read as `per: 'volume'` with no `p06`. `biomassUnit` keeps calling it without the option (ruling 2).

- [ ] **Step 1: Write the failing tests:**
  - `Counts`: Sample | Date | Latitude | Longitude | Taxon | Count | Abundance, four taxon rows, `Count` blank in all, `Abundance` role ignore, quantity declared count → one `CONV-NO-OCCURRENCES` with `params: { variant: 'empty-quantity', column: 'Count', rows: 4 }`; a sheet with no taxon at all still gets today's params `{}`.
  - `resolveQuantity({ kind: 'density', unit: 'ind/L' })` → `ok`, `unitWithoutP06: 'ind/L'`, `type` = `P01.densityVolume`; the same for `#/ml` and `cells per litre`; `parseRateUnit('mg/L')` (no option) → `undefined`; `biomassUnit('mg/L')` → `{ perUnit: false }` (unchanged).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/empty-quantity.test.ts test/convert/quantity.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the per-sheet record and variant, the litre option, the form passing `{ litre: true }`; regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/build.ts src/core/rules/convert.ts src/core/convert/quantity.ts src/app/components/ConvertSheetForm.tsx docs/rules.md test/convert/empty-quantity.test.ts test/convert/quantity.test.ts` — "When a sheet's quantity column is empty in every row the converter says so and names the column, and a density or biomass in units per litre or millilitre is read as per volume."

### Task 3: A confirmed join dropped in silence

**Files:**
- Modify: `src/core/convert/sampleJoin.ts:1187-1205` (`joinInputs`, the `keysOk` check at `:1200`), `src/core/rules/convert.ts`, `src/core/convert/policy.ts`, `src/app/pages/ConvertPage.tsx` (`chooseForJoin`, the finding buttons near `:1610`), `docs/rules.md`
- Test: `test/convert/sample-join-key-role.test.ts` (new), `test/app/convertSampleJoin.test.tsx`

**Interfaces:**
- `joinInputs` keeps its signature. A join whose indexes are valid but whose results key column has no key role any more (not in `RIGHT_KINDS` and not a picked key part) is still dropped (F8) and now adds `CONV-JOIN-KEY-ROLE-LOST` to `JoinOutcome.findings` (block; params `{ description: <description sheet>, column: <results header> }`, file/sheet of the results sheet). Text (en): `The join you confirmed for "{sheet}" is not applied: column "{column}" no longer has a key role. Give it back the role, or confirm the join again.`
- Page: `chooseForJoin(f, 'askAgain')` on `CONV-JOIN-KEY-ROLE-LOST` removes the confirmed `JoinChoice` whose results sheet is `f.file`/`f.sheet` (the proposal then shows again).

- [ ] **Step 1: Write the failing tests:** core: join confirmed on `Station` (results role `station`), then the request with `Station` set to `ignore` → `outcome.findings` has one `CONV-JOIN-KEY-ROLE-LOST` with `params.column === 'Station'`, `outcome.sheets` unmerged, the proposal list as without the join; a key index `99` → no such finding (only the silent drop of today). Page: the same flow → button "Ask again" → the next request has no `sampleJoin`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/sample-join-key-role.test.ts test/app/convertSampleJoin.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the finding, the policy entry, the button and `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/app/convertSampleJoin.test.tsx test/app/convertWorker.test.ts test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the five source paths, `docs/rules.md` and both tests — "A confirmed join that can no longer be applied because a key column lost its role is named by CONV-JOIN-KEY-ROLE-LOST with an Ask again button, instead of disappearing."

### Task 4: Item 5 — headers that say they are not a taxon

**Files:**
- Modify: `src/core/convert/measured.ts:21` (`NameKind`), `:111-140` (`nameKind`), new export `notTaxonWord`; `src/core/convert/recognize.ts:180-235` (`OVERLAY_REASONS` + `not-taxon-name`), `:367` (`isMeasurementUnit` accepts `'not-taxon'`), `:731-776` (the wide-sheet candidate block); `src/app/components/MappingEditor.tsx:41` (pass `p.reasonParams` to `t`); `src/core/i18n/ui.ts` (`convert.reason.not-taxon-name` ×4)
- Test: `test/convert/not-taxon-name.test.ts` (new), `test/app/convertReasons.test.tsx`

**Interfaces:**
- `export type NameKind = 'descriptor' | 'variable' | 'taxon' | 'not-taxon' | 'unknown'`.
- `export function notTaxonWord(header: string): string | undefined` — the name part (`namePart`) split into words on spaces, `_` and camel case (never on `-` or `/`), lower-cased; returns the first word that is in `POSITION_WORDS` (`coordinate coordinates coord coords position gps latlon lat lon latitude longitude northing easting utm`) or `INDEX_WORDS` (`index indices shannon simpson evenness richness diversity velocity speed ndvi`), or that is in `VARIABLE_TOKENS` while the name has more than one word.
- `nameKind` returns `'not-taxon'` where it returns `'taxon'` from `hasTaxonShape` today (`:136`) and `notTaxonWord` finds a word; with `abundance === true` the early `return 'taxon'` (`:132`) is unchanged, so a counting unit (`Shannon index [ind]`) keeps a candidate. No other branch changes.
- `recognize.ts`: `not-taxon` behaves like `unknown` for the unit rules (geometry, `isMeasurementUnit`: `Current velocity [m/s]` → variable, B3) and skips the two value rules (`holdsYears`, `holdsOneFractionalValue`: never proposed from its values, B3); otherwise role `ignore`, confidence `low`, `why(p, 'not-taxon-name')` then `p.reasonParams = { word }`. Reason text (en): `the name says "{word}"; not proposed as a taxon. If it is a latitude/longitude or a measured variable, choose that role`.
- Every other `nameKind` caller (`recognize.ts:521, 531, 820, 848, 864`, `build.ts:2559`, `totalColumns.ts:130`) is untouched; at `:531` a `not-taxon` header is not species-like (ruling 12).

- [ ] **Step 1: WoRMS check of the word lists** (spec §6: no genus in them). For each word, `curl -s -o /dev/null -w '%{http_code}' "https://www.marinespecies.org/rest/AphiaIDByName/<Word>?marine_only=false"` — Expected: `204` for every word. A word that returns `200` is left out of the list and reported. Record the date and the result in a comment above the lists.
- [ ] **Step 2: Write the failing tests:** wide sheet `Station | Coords N | Coords E | w_PH | Calanus finmarchicus | Oithona` (numeric invented cells) → `Coords N`, `Coords E`, `w_PH` have role `ignore`, `reasonCode: 'not-taxon-name'`, `reasonParams.word` = `coords`, `coords`, `ph`; `Calanus finmarchicus` and `Oithona` stay `taxon` candidates. `nameKind` of `Macoma_balthica`, `Pseudo-nitzschia`, `Acartia/Centropages`, `Calanus [ind/m3]` → `taxon`; `Shannon index [ind]` → `taxon` (with `abundance` true); `CurrentVelocity` → `not-taxon`; `Current velocity [m/s]` → proposed `variable` (unit rule). A `convert()` of the confirmed sheet lists `w_PH` in `CONV-COLUMN-IGNORED`. Page: the reason shows `the name says "coords"`.
- [ ] **Step 3: Run** `nice -n 15 npx vitest run test/convert/not-taxon-name.test.ts test/app/convertReasons.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 4: Implement** as above.
- [ ] **Step 5: Run** `nice -n 15 npx vitest run test/convert test/recognize test/app --maxWorkers=2` — Expected: PASS; any changed proposal test must be about one of these headers (say which in the commit).
- [ ] **Step 6:** `npx tsc --noEmit -p .`; commit the five source paths and the tests — "A numeric column whose name says a position, an index, a speed or a measured variable is no longer proposed as a taxon; it is ignored with a note that names the word, and nothing is proposed from its values."

### Task 5: Item 7 — biomass per sample, cover, abundance class (core)

**Files:**
- Modify: `src/core/convert/quantity.ts:17-43` (types), `:122-136` (`ResolvedQuantity`), `:201-232` (`resolveQuantity`); `src/core/convert/vocab.ts` (only concepts opened on the build date); `src/core/convert/build.ts:2296-2370` (value checks, occurrence quantity, the quantity eMoF row); `src/core/convert/ledger.ts:23` (`LedgerReason`), `src/core/convert/notWritten.ts:29-96` (`REASON_KIND`, `COVERED_BY`); `src/core/convert/model.ts:179` (`ConvertResult.methodSteps`), `:286` (`ConvertedDataset.methodSteps`), `:309` (`toDataset`); `src/core/convert/eml.ts:197-265` (`buildEml`); `src/core/rules/convert.ts`, `src/core/convert/policy.ts`, `docs/rules.md`, `docs/APPS.md` §8.3 (`:1361`), §8.9 (`:1777`)
- Test: `test/convert/quantity-kinds.test.ts` (new), `test/convert/quantity.test.ts`, `test/convert/eml.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QuantityKind = 'count' | 'density' | 'biomass' | 'cover' | 'class';
  QuantityDeclaration.per?: EffortDimension | 'sample';            // 'sample' only for biomass
  QuantityDeclaration.scale?: { name: string; min: string; max: string; meanings?: Record<string, string> };   // class only, typed text
  ResolvedQuantity.perSample?: true;
  ResolvedQuantity.scale?: { label: string; min: number; max: number; meanings: Record<number, string> };   // label = `${min}–${max}` or `${name} ${min}–${max}`
  ConvertResult.methodSteps: string[];  ConvertedDataset.methodSteps?: string[];
  ```
- `resolveQuantity`: biomass + `per: 'sample'` needs basis and a mass unit (`g`, `mg`, `kg`), no medium; a rate unit (`g/m2`) → missing `unit not per sample`; type = `biomassKindConcept(basis)` (S06), `unitId` = `biomassUnit(unit).id`. Cover: unit `%`, `unitId` P06 `UPCT`, type = the P01 coverage concept only if verified in Step 1 (else `noTypeFor: 'cover'`). Class: needs `scale` with whole numbers `min < max` (missing `scale`), no type id (`noTypeFor: 'abundance class'`), no unit. Every existing declaration resolves as today (assert the existing `quantity.test.ts` unchanged).
- `build.ts`: cover → `organismQuantity` = value, `organismQuantityType` = `COVER_TYPE` (the GBIF quantity-type term if verified in Step 1, else `% cover`), no `individualCount`; eMoF type label "cover" (or the verified label), unit `%`, unit id UPCT. A value outside 0–100 → cell fate `cover-range`, `CONV-COVER-RANGE` (block; field, lines, value). Class → `organismQuantity` = value, `organismQuantityType` = `abundance class <label>`, never `individualCount`; eMoF `measurementType` `abundance class (<label>)`, `measurementRemarks` = the typed meaning of that class when given; a value that is not a whole number within `min…max` → fate `class-value`, `CONV-CLASS-VALUE` (block). Biomass per sample → eMoF S06 by basis, unit from `biomassUnit`, the existing sample-size remark when a sample size is declared. Zeros as for counts.
- `methodSteps`: one string per class-declared sheet: `Sheet <S> of <F>: abundance classes <label>: <min> = <meaning>; …` (only typed meanings). `buildEml` writes `<methods>` when `m.methods` or `methodSteps` is non-empty: the person's text first, then one `<methodStep>` per generated paragraph; with neither, byte-identical to today.
- New ledger reasons `cover-range`, `class-value`: kind `covered`, `COVERED_BY` `CONV-COVER-RANGE` / `CONV-CLASS-VALUE` (ruling 10).

- [ ] **Step 1: Vocabulary check (build date).** Open `https://vocab.nerc.ac.uk/collection/P01/current/SDBIOL10/` and the GBIF quantity-type vocabulary (`https://rs.gbif.org/vocabulary/gbif/quantity_type.xml`); add a concept to `vocab.ts` with an "opened <date>" comment only when the page confirms label and meaning (percent cover of an area by a taxon; a cover term). Otherwise leave it out: the row is written without an id and `CONV-NERC-UNKNOWN` says so.
- [ ] **Step 2: Write the failing tests** (wide sheet `Plots`: Plot | Date | Latitude | Longitude | *Zostera marina* | *Ulva lactuca*):
  - biomass wet, `g`, `per: 'sample'` → eMoF type S06 wet weight biomass (`S0600088`), unit gram (P06 id), no medium asked, no `individualCount`; `g/m2` with `per: 'sample'` → `CONV-QUANTITY-UNDECLARED` with `missing` containing `unit not per sample`.
  - cover: 27.5 and 100 → `organismQuantity` 27.5 / 100, `organismQuantityType` = `COVER_TYPE`, unit `%`; 120 → `CONV-COVER-RANGE` naming that cell, the cell in the not-written list with reason `cover-range`.
  - class `{ name: '', min: '0', max: '5', meanings: { '3': 'common' } }`: value 3 → `organismQuantity` 3, `organismQuantityType` `abundance class 0–5`, no `individualCount`, eMoF remarks `common`, EML has a `methodStep` naming `0–5` and `3 = common`; 6 and 2.5 → `CONV-CLASS-VALUE`.
  - `resolveQuantity` of every declaration in `quantity.test.ts` deep-equals its old result; EML of a dataset with neither methods nor `methodSteps` is byte-identical to the current `eml.test.ts` expectation.
- [ ] **Step 3: Run** `nice -n 15 npx vitest run test/convert/quantity-kinds.test.ts test/convert/quantity.test.ts test/convert/eml.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 4: Implement** as above, the two rules (block), the reasons, APPS §8.3 (the five kinds and how each is written) and §8.9 (generated methodSteps); regenerate `docs/rules.md`.
- [ ] **Step 5: Run** `nice -n 15 npx vitest run test/convert test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 6:** `npx tsc --noEmit -p .`; commit the touched paths — "A sheet can declare biomass per sample, percent cover or an abundance class scale; each is written as organismQuantity with its type and an eMoF row, never as a count, and values outside the declared range block."

### Task 6: Item 7 on the page

**Files:**
- Modify: `src/app/convertModel.ts:22-33` (`QuantityForm`, `EMPTY_QUANTITY`), `:101-119` (`declarationOf`); `src/app/components/ConvertSheetForm.tsx:185-230` (kind select, per, scale fields); `src/core/i18n/ui.ts`
- Test: `test/app/convertQuantityKinds.test.tsx` (new)

**Interfaces:**
- Consumes: `QuantityKind`, `QuantityDeclaration.per | scale` (Task 5).
- `QuantityForm.kind: '' | QuantityKind`; `per: '' | 'volume' | 'area' | 'sample'`; new `scaleName: string; scaleMin: string; scaleMax: string; scaleMeanings: Record<string, string>`. `declarationOf` maps cover → `{ kind: 'cover' }`, class → `{ kind: 'class', scale: { name, min, max, meanings } }` (only non-empty meanings), biomass with `per: 'sample'` → `per: 'sample'`, no medium.
- Form: options `cover` ("percent cover") and `class` ("abundance class (a scale)"); the count label becomes "number of individuals (for a scale or a class choose abundance class)"; "per sample" is offered for biomass only; one meaning field per class when min and max are whole numbers and at most 20 classes. No value of the sheet pre-selects anything.

- [ ] **Step 1: Write the failing tests** (`ConvertPage` with `createDirectConvertEngine`): choosing "abundance class", typing 0 and 5 and meaning 3 = `common` → the request's `quantity` is `{ kind: 'class', scale: { name: '', min: '0', max: '5', meanings: { '3': 'common' } } }`; "biomass", wet, `g`, per sample → `{ kind: 'biomass', unit: 'g', basis: 'wet', per: 'sample' }` and no medium select shown; "percent cover" → `{ kind: 'cover' }`; the count option's label text is the new one in en and pl.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertQuantityKinds.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the form, model and strings.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the three source paths and the test — "The sheet form offers biomass per sample, percent cover and an abundance class scale with optional meanings, and says that a count is a number of individuals."

### Task 7: Item 6 — one day/month order for every reader (core)

**Files:**
- Modify: `src/core/values/dates.ts` (new exports beside `detectDayMonthOrder` `:410`); `src/core/dataset.ts:298` (`metaParser` option), `:349-350`; `src/core/convert/build.ts:65-150` (`ConvertSheetInput.dayMonthOrder`), metaParser calls `:1147`, `:1206`, `:1637`, `:1877`, `timeColumnWithDates` `:677-702`, the per-sheet findings; `src/core/convert/stated.ts:50` (`StatedContext.dayMonthOrder`), `:294`; `src/core/convert/roleUnconfirmed.ts:41-49` (pass it, cache key includes it); `src/core/convert/sampleKey.ts:50-58` (`KeyContext.dayMonthOrder`), `:135-151` (`keyPart`); `src/core/convert/sampleJoin.ts:249-262` (`keyReaderOf`), `:419-428` (`makeReader`); `src/core/rules/convert.ts`, `src/core/convert/policy.ts`, `docs/rules.md`, `docs/APPS.md` §8.1 (`:1198`)
- Test: `test/convert/date-order.test.ts` (new); unchanged and green: `test/checks`, `test/recognize/header-dates.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeclaredOrder = 'dmy' | 'mdy';
  export function columnOrder(sheet: RawSheet, index: number, declared?: DeclaredOrder): DayMonthOrder   // detected unless it is 'unknown' and a declaration exists
  export function declaredOrderStatus(sheet: RawSheet, index: number, declared: DeclaredOrder): 'applied' | 'contradicted' | 'redundant'
  export function isAmbiguousDayMonth(cell: RawCell): boolean   // SLASH_RE, both parts ≤ 12 and different
  ConvertSheetInput.dayMonthOrder?: Readonly<Record<number, DeclaredOrder>>;
  metaParser(..., opts: { …; dayMonthOrder?: Readonly<Record<number, DeclaredOrder>> })
  ```
- Every one of the six readers (`metaParser` when + time, `timeColumnWithDates`, `stated.ts` `veto`, `keyPart`, `keyReaderOf`, `makeReader` via `metaParser`) gets its order from `columnOrder`; /check never passes the option. A merged (joined) input keeps the results sheet's indexes, so its declaration travels with `...results`; the description side's reader takes the description input's own declaration.
- Findings per date / datetime / time column (or picked date key part) of a sheet: `CONV-DATE-ORDER-UNDECLARED` (block) when detection is `unknown`, ambiguous cells exist and nothing is declared: `field` header, `value` first example, params `{ count, examples: '<a>, <b>', index }`; the `ROW-DATE-UNPARSEABLE` of that field loses exactly those lines (dropped when none is left). `CONV-DATE-ORDER-CONTRADICTED` (block) when `declaredOrderStatus` is `contradicted` (params `{ declared, detected, index }`; not applied). `CONV-DATE-ORDER-DECLARED` (info, show) when `applied` (params `{ order, index, fromFile? }`). `redundant`: nothing. Text (en) of UNDECLARED: `Dates such as "{example}" can be read as 5 April or as 4 May, and no date in column "{column}" decides it ({count} cells). Say which order the column uses.` (the example words are built from the cell).

- [ ] **Step 1: Write the failing tests** (`date-order.test.ts`):
  - Column `Date` = `5/4/2023, 5/5/2023, 6/7/2023`, no declaration → `CONV-DATE-ORDER-UNDECLARED` with `count: 2`, examples `5/4/2023, 6/7/2023`, no `ROW-DATE-UNPARSEABLE` for those lines; `5/5/2023` written as today.
  - `dayMonthOrder: { 1: 'dmy' }` → eventDates 2023-04-05, 2023-05-05, 2023-07-06; `CONV-DATE-ORDER-DECLARED`; a picked key `Station + Date` builds eventIDs containing `2023-04-05` (Review Focus 5).
  - `13/4/2023` in the column + `{ 1: 'mdy' }` → `CONTRADICTED`, dates read as today (dmy).
  - Join (Review Focus 5): results `Date` `5/4/2023` declared dmy, description `2023-04-05` → no conflict group, the eventDate 2023-04-05.
  - `metaParser` without the option on the same sheet returns the same `Meta` as at base (assert `datetime` undefined and the same collector findings).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/date-order.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, the six call sites in one change, the findings, APPS §8.1 ("an undecided day/month order is asked per column; the answer applies to the date written, the date in an ID and the date compared in a join"); regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/checks test/recognize test/rules --maxWorkers=2` — Expected: PASS (`test/checks` with no edit).
- [ ] **Step 5: Golden.** Base worktree `git worktree add --detach ../base-e69d037 e69d037`; `GOLDEN_DIFF_MODE=dump GOLDEN_DIFF_OUT=/tmp/r3-before.json GOLDEN_DIFF_REPO=../base-e69d037 nice -n 15 npx vitest run --config vitest.golden-diff.config.ts --maxWorkers=2`, the same with `GOLDEN_DIFF_OUT=/tmp/r3-after.json` and no REPO, then `GOLDEN_DIFF_MODE=compare GOLDEN_DIFF_BEFORE=/tmp/r3-before.json GOLDEN_DIFF_AFTER=/tmp/r3-after.json …` — Expected: identical, N > 0 entries. Then the golden tests with `GOLDEN_DIR` — Expected: PASS, count reported. Remove the base worktree by its explicit path.
- [ ] **Step 6:** `npx tsc --noEmit -p .`; commit the touched paths and the test — "A date column whose day/month order no cell decides is asked about once, and a declared order is used by every reader of the converter, so the date written, the date in an identifier and the date compared in a join agree."

### Task 8: Item 6 — request, page buttons and companion line

**Files:**
- Modify: `src/worker/convert.protocol.ts:65-112` (`ConvertSheetRequest.dayMonthOrder`), `src/worker/convert.handler.ts` (`rawInputsOf`: checked into `ConvertSheetInput.dayMonthOrder`); `src/core/convert/settings.ts` (comment, `ConvertSettings.dayMonthOrder`, read/write); `src/app/convertModel.ts:37-89` (`SheetChoice.dayMonthOrder`, `dayMonthOrderFile`), `:268` (`requestOf`), `:356` (`initialChoices`), new `dayMonthOrderSettingsOf`; `src/app/pages/ConvertPage.tsx:374` (`chooseForSheet` gains `'dayFirst' | 'monthFirst'`), buttons beside `:1592`, companion download `:883`; `src/core/i18n/ui.ts`
- Test: `test/app/convertDateOrder.test.tsx` (new), `test/convert/settings.test.ts`, `test/app/convertWorker.test.ts`

**Interfaces:**
- Consumes: `DeclaredOrder`, `ConvertSheetInput.dayMonthOrder`, finding params `index` (Task 7).
- `ConvertSheetRequest.dayMonthOrder?: Record<number, 'dmy' | 'mdy'>`; the handler keeps only whole-number keys within the sheet width and values `dmy` / `mdy`.
- `ConvertSettings.dayMonthOrder?: { sheet: string; order: 'dmy' | 'mdy'; hash: string; rows: number }[]`; line `dayMonthOrder=<dmy|mdy>:<sheet>:<hash>:<rows>` (`hash` = `keyHashes(header, [index])`); the page resolves it with `resolveKeyHashes` and the row count in `initialChoices` (pre-pick only when both hold), and sends `dayMonthOrderFromFile` so `CONV-DATE-ORDER-DECLARED` says `fromFile`.
- Buttons: "Day first" / "Month first" on `CONV-DATE-ORDER-UNDECLARED` (`chooseForSheet(f, 'dayFirst' | 'monthFirst')` sets `dayMonthOrder[f.params.index]`); "Ask again" on `CONV-DATE-ORDER-DECLARED` and `-CONTRADICTED` removes it.

- [ ] **Step 1: Write the failing tests:** page flow on a CSV `Date` `5/4/2023, 6/7/2023` → "Day first" → request `dayMonthOrder: { <index>: 'dmy' }`, the finding becomes `CONV-DATE-ORDER-DECLARED`; "Ask again" → gone. Settings round trip: `writeConvertSidecar({ dayMonthOrder: [{ sheet: 'Counts', order: 'dmy', hash, rows: 3 }] })` read back equal; `initialChoices` with 3 rows pre-picks, with 4 rows does not. Worker: a key `"x"` or `99` is dropped.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertDateOrder.test.tsx test/convert/settings.test.ts test/app/convertWorker.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app test/convert/settings.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "The page asks day first or month first for an undecided date column, sends the answer by column, and keeps it in the companion file by the column's header hash and the sheet's row count."

### Task 9: Item 3 — a missing eventDate blocks, with "leave out and list"

**Files:**
- Modify: `src/core/convert/build.ts:1495` (`convert` becomes a wrapper over `convertPass`), the row loop `:1932-1940` (skip set), after the tree `:2832` (`undatedFindings`), `ConvertResult` fill `:3200`; `src/core/convert/model.ts:179` (`ConvertResult.undatedEventIds`), `:286`, `:309`; `src/core/convert/validate.ts:151-193`; `src/core/convert/ledger.ts:23` (`'no-event-date'`); `src/core/convert/notWritten.ts:29-96`, `:186-256` (extract the answer test); `src/core/rules/convert.ts`, `src/core/convert/policy.ts`; `src/app/pages/ConvertPage.tsx:374-388` (leave-out branch), buttons `:1600`; `src/core/i18n/ui.ts`; `docs/rules.md`, `docs/APPS.md` §8.8
- Test: `test/convert/event-date-missing.test.ts` (new), `test/app/convertEventDate.test.tsx` (new), `test/convert/policy.test.ts`, `test/convert/review-round.test.ts` (asserts `META-NO-DATES`/`ROW-DATE-MISSING` today), fixture edits per Global Constraints 8

**Interfaces:**
- Produces:
  ```ts
  function convertPass(input: ConvertInput, undatedLeftOut: ReadonlyMap<number /* rawInput sheet index */, ReadonlySet<number /* line */>>): ConvertResult & { undated: UndatedSheet[] }
  interface UndatedSheet { inputIndex: number; file: string; sheet: string; how: 'no-date-role' | 'blank-cells'; samples: number; lines: number[]; eventIds: string[] }
  export function leaveOutHolds(answers: Pick<ConvertSheetInput, 'leaveOut' | 'leaveOutFile'>, reason: string, count: number, sourceRows: number): 'you' | 'file' | undefined   // notWritten.ts, used by decideRows too
  ConvertResult.undatedEventIds?: string[];  ConvertedDataset.undatedEventIds?: string[];
  ```
- Undated (ruling 4): an event of a non-profile sheet with `eventType` `sample` and no `eventDate`, or `replicate` with no `eventDate` on itself and on its parent sample. Lines = all `SampleAcc.lines` of those events (and of the replicates of an undated sample). `how` = `no-date-role` when the sheet's specs have no `when` and no `dateParts`; else `blank-cells`, and lines whose date cells are filled (unreadable) are excluded (ruling 5). Profile levels: unchanged (`CONV-PROFILE-LEVEL-INCOMPLETE`).
- `CONV-EVENT-DATE-MISSING` (block), one per sheet: `lines`, params `{ count: samples, rows: lines.length, how }`; variants `:no-date-role` ("No column of sheet "{sheet}" is marked as the date ({count} samples). Mark the date column, or the Year / Month / Day columns, or join the sheet that describes the samples.") and `:blank-cells` ("{count} samples of sheet "{sheet}" have no date: the date cells are empty. Fill them in, or leave these samples out and list them.").
- `convert(input)`: pass 1 with an empty map; for each `UndatedSheet` with `how === 'blank-cells'` where `leaveOutHolds(sin, 'no-event-date', lines.length, sourceRows)` → run pass 2 with those lines skipped (`fate.row(line, 'no-event-date'); continue`); return pass 2 (ruling 6). In pass 2 `decideRows` emits `CONV-ROW-LEFT-OUT` for them (`no-event-date` is `covered` by `CONV-EVENT-DATE-MISSING`, which no longer stands for those lines).
- `validateTables`: when `stage1` has `CONV-EVENT-DATE-MISSING`, drop the Event table's `META-NO-DATES` and every `ROW-DATE-MISSING` whose lines all map (event.txt line − 2 → `tables.event.rows[i]` eventID) to `ds.undatedEventIds` or to an ancestor of one.
- Page: the button "Leave these samples out and list them" on `CONV-EVENT-DATE-MISSING` with `how === 'blank-cells'` calls `chooseForSheet(f, 'leaveOut')`, which uses reason `no-event-date` and count `f.params.rows` for this rule. The companion `leaveOut=` line already carries it.

- [ ] **Step 1: Write the failing tests** (`event-date-missing.test.ts`, positions present):
  - `Counts` without a date role → `CONV-EVENT-DATE-MISSING` `how: 'no-date-role'`, `count: 2`; `validateTables` has no `META-NO-DATES`; `exportAllowed` false.
  - `Date` blank on lines 5–6 of six rows → `how: 'blank-cells'`, `lines: [5, 6]`; with `leaveOut: [{ reason: 'no-event-date', count: 2 }]` → no `CONV-EVENT-DATE-MISSING`, `CONV-ROW-LEFT-OUT` `reason: 'no-event-date'`, `notWrittenRows` lists lines 5 and 6 with status `left-out`, the archive has four sample events, `ok` true (if nothing else blocks); with `count: 3` → still blocked.
  - Year / Month / Day columns → no finding. Replicates: sample `X01` with replicates `a` (dated) and `b` (blank) → no finding (B4); both blank → one finding, `count: 1`, both lines.
  - Review Focus 1: line 4 `31/02/2023`, line 5 blank → finding lines `[5]` only; `ROW-DATE-UNPARSEABLE` names line 4; leave out (count 1) keeps line 4 blocked.
  - Station `ST-1` with `X01` dated and `X02` blank → `X02` named (ruling 4).
  - Page: the button sends `leaveOut: [{ reason: 'no-event-date', count: 2 }]`.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/event-date-missing.test.ts test/app/convertEventDate.test.tsx --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** as above, APPS §8.8 ("A sample without a date blocks (OBIS requires eventDate); blank date cells can be left out and listed."); regenerate `docs/rules.md`; update `review-round.test.ts` only where it asserts the two dropped findings for an undated /convert run.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/app test/rules test/checks --maxWorkers=2` — Expected: PASS (`test/checks` unchanged: `META-NO-DATES` on /check as today).
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths and edited fixtures by path — "A sample without a date blocks the export with a message that says which column to mark or which samples to fill in, and blank dates can be left out and listed beside the archive." (name the edited test files).

### Task 10: Item 2 — one declared position for a sheet (core)

**Files:**
- Modify: `src/core/convert/quantity.ts:158` (new `parseTypedCoordinate` beside `parseTypedNumber`); `src/core/convert/build.ts:65-150` (`declaredPosition`, `declaredPositionFromFile`), the row loop `:1938` (Meta override), sample site `:2080-2088`, `positionNoneFindings` (Task 1); `src/core/convert/events.ts:41-77` (`SampleSite.coordinateUncertaintyInMeters`, `.georeferenceRemarks`), `:387-395` (`buildEventTree` copies); `src/core/convert/model.ts` (`EventRec.georeferenceRemarks`, `ModelEvent.georeferenceRemarks`, `toDataset` `:310-321`); `src/core/convert/dwca.ts:57-77` (`EVENT_COLUMNS`), `:120-141` (`eventRow`); `src/core/rules/convert.ts`, `src/core/convert/policy.ts`; `docs/rules.md`, `docs/APPS.md` §8.9
- Test: `test/convert/declared-position.test.ts` (new), `test/convert/export.test.ts` (column set unchanged without the declaration)

**Interfaces:**
- Produces:
  ```ts
  export function parseTypedCoordinate(text: string): { ok: true; value: number; text: string } | { ok: false }   // optional sign, digits, at most one '.' or ',', text written with '.'
  ConvertSheetInput.declaredPosition?: { lat: string; lon: string; uncertaintyM: string };
  ConvertSheetInput.declaredPositionFromFile?: boolean;
  ```
- Applied only when the sheet's (merged) mapping has no `latitude`/`longitude` role (Q5); otherwise, or with lat outside ±90, lon outside ±180, an uncertainty that `parseTypedNumber` refuses → `CONV-POSITION-DECLARED-INVALID` (block; params `{ reason: 'latitude' | 'longitude' | 'uncertainty' | 'position-role', value? }`), nothing applied. Applied: every row's `Meta` gets `lat`/`lon` (`latText`/`lonText` = the typed texts), so station parents, `stationFindingsOf` and the `ROW-*` checks run unchanged; each sample site gets `coordinateUncertaintyInMeters` = the typed value and `georeferenceRemarks` = `Position declared for the whole dataset by the person converting; not stated per sample in the source`. `CONV-POSITION-DECLARED` (accept; params `{ lat, lon, uncertainty, count: samples, fromFile? }`). `positionNoneFindings` skips a sheet with an applied declaration.
- `EVENT_COLUMNS` gains `{ col: dwc('georeferenceRemarks'), always: false }` right after `coordinateUncertaintyInMeters`; `prune` drops it when empty, so archives without the declaration keep today's columns.

- [ ] **Step 1: Write the failing tests:** `Tanks`: Tank | Date | Taxon | Count (two tanks). Declared `54.1`, `10.9`, `500` → every sample event `decimalLatitude` 54.1, `decimalLongitude` 10.9, `coordinateUncertaintyInMeters` 500, the remark; `CONV-POSITION-DECLARED` `count: 2`; no `CONV-POSITION-NONE`. `95` → INVALID `latitude`; a sheet with a `Latitude` column + declaration → INVALID `position-role`, positions as written. `parseTypedCoordinate`: `-54,125` → -54.125 text `-54.125`; `10.125` → ok; `0` → ok; `1.2.3` → not ok. Uncertainty `1.500` → INVALID `uncertainty`. No declaration → `event.txt` header identical to today's for the `export.test.ts` fixture.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/declared-position.test.ts test/convert/export.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement**, APPS §8.9 (`georeferenceRemarks`, declared uncertainty); regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "A sheet with no position at all can carry one position declared by the person, written on every sample with its uncertainty and a georeferenceRemarks that says it was declared, and refused when the sheet has a position column."

### Task 11: Item 2 — request, form, button and companion line

**Files:**
- Modify: `src/worker/convert.protocol.ts` (`declaredPosition`, `declaredPositionFromFile`), `src/worker/convert.handler.ts` (`rawInputsOf`: three strings, trimmed, each ≤ 40 characters); `src/core/convert/settings.ts` (comment per ruling 11, `ConvertSettings.declaredPosition`, read/write); `src/app/convertModel.ts` (`SheetChoice.positionLat`, `positionLon`, `positionUncertainty`, `positionFromFile?`; `requestOf`; `initialChoices`; new `declaredPositionSettingsOf`); `src/app/components/ConvertSheetForm.tsx` (section shown only when the sheet has no position role); `src/app/pages/ConvertPage.tsx` (button on `CONV-POSITION-NONE`, companion `:883`); `src/core/i18n/ui.ts`
- Test: `test/app/convertDeclaredPosition.test.tsx` (new), `test/convert/settings.test.ts`

**Interfaces:**
- Consumes: `ConvertSheetInput.declaredPosition` (Task 10).
- `ConvertSettings.declaredPosition?: { sheet: string; lat: string; lon: string; uncertaintyM: string }[]`; line `declaredPosition=<lat>:<lon>:<uncertainty>:<sheet>`; pre-fills the three fields of a sheet of that name with no position role; the request then carries `declaredPositionFromFile: true` until a field is edited.
- The request carries `declaredPosition` only when all three fields are non-empty. The button "Declare one position for the sheet" on `CONV-POSITION-NONE` opens that sheet's form section and focuses the latitude field.

- [ ] **Step 1: Write the failing tests:** page: `Tanks` → `CONV-POSITION-NONE` button → type 54.1 / 10.9 / 500 → request `declaredPosition: { lat: '54.1', lon: '10.9', uncertaintyM: '500' }`, the finding becomes `CONV-POSITION-DECLARED`; the companion contains `declaredPosition=54.1:10.9:500:Tanks`; reloaded with it, the fields are filled and the finding says it came from the companion file. Settings round trip incl. a negative latitude.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertDeclaredPosition.test.tsx test/convert/settings.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app test/convert/settings.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "The sheet form and the no-position message let the person declare one position with its uncertainty, and the companion file keeps that declaration so it is not typed again."

### Task 12: Item 1 — each row is its own record (core)

**Files:**
- Modify: `src/core/convert/ids.ts:157-160` (new `occurrenceIdOwnRow`); `src/core/convert/build.ts:65-150` (`ownRecords`, `ownRecordsFromFile`, `keepCopies`, `keepCopiesCount`, `keepCopiesFromFile`), `:473` (`readColumns`), `:1663-1682` (no-quantity findings), `:1815-1843` (copies analysis), `:1945` (`longHasValue`), `:2328` (the ID), `:2348-2354` (count 1), `:2516` (ledger columns), `:2636-2640` (copies finding); `src/core/rules/convert.ts`, `src/core/convert/policy.ts`; `docs/rules.md`, `docs/APPS.md` §8.6 (`:1457`)
- Test: `test/convert/own-records.test.ts` (new), `test/convert/ids.test.ts`

**Interfaces:**
- Consumes: `ConvertResult.methodSteps` (Task 5).
- Produces: `export const occurrenceIdOwnRow = (eventId: string, line: number): string => \`${eventId}:L${line}\`` (`eventId` = the event the occurrence hangs under, as for `occurrenceIdLong`).
- Eligible sheet: `shape === 'long'`, `profile` undefined, `sheet.pivot` undefined (Task 14 adds `sheet.turn === undefined` to this test), a taxon cell column, no `occurrenceId` role. On an eligible sheet with `ownRecords: true`: every occurrence ID is `occurrenceIdOwnRow(eventId, row.line)` (`row.line` of the merged sheet = the results line, `sampleJoin.ts:752`); with no quantity column and no `presenceOnly` (ruling 8): `CONV-TAXON-NO-QUANTITY` / `CONV-SPECIES-LIST-NO-COUNTS` are not raised, each row writes `individualCount` 1, `organismQuantity` 1, `organismQuantityType` `individuals` and the OCOUNT01 eMoF row, and `perOccurrence` variables are written on the occurrences (the `presence` conditions at `:473`, `:1945`, `:2516` include this case). `CONV-OWN-RECORDS` (accept; params `{ rows, fromFile? }`; text ends with the cost: "the IDs change if rows are inserted or deleted in the source before a new version; keep the row order, or add an occurrenceID column"). One `methodSteps` paragraph per such sheet: `Sheet <S> of <F>: one occurrence per source row; occurrenceID = sample eventID + ':L' + line number in the source file`. Ineligible sheet: the field is ignored.
- Q2: on an eligible sheet with `ownRecords`, `keepCopies: true` or `keepCopiesCount` equal to today's `copies.copyLines.length` → no `CONV-ROW-COPIES`; `CONV-ROW-COPIES-KEPT` (accept; params `{ count, fromFile? }`) and the rows are written as separate records. Without `ownRecords` the field is ignored. `CONV-ROW-COPIES-SPECIMENS`, `CONV-QUANTITY-REPEATED`, `CONV-QUANTITY-SAME-IN-SAMPLE` run unchanged.

- [ ] **Step 1: Write the failing tests** (spec sheet `Fish`: Sample | Date | Latitude | Longitude | Taxon | Length [mm], `Length` variable with `perOccurrence`, lines 2–4 = (`T1`, *Gadus morhua*, 310), (`T1`, *Gadus morhua*, 295), (`T1`, *Pollachius virens*, 400)):
  - Without the tick → `CONV-TAXON-NO-QUANTITY` (as today).
  - With a `Count` column of 1s and no tick → `CONV-ID-DUPLICATE` `sameTaxon: 'yes'` (as today); with `ownRecords` → IDs end `:L2`, `:L3`, `:L4`, no `CONV-ID-DUPLICATE`, `CONV-OWN-RECORDS` `rows: 3`, three per-occurrence eMoF `Length` rows, `methodSteps` has the paragraph.
  - No `Count` column + `ownRecords` → `individualCount` 1 on each, OCOUNT01 rows, no `CONV-TAXON-NO-QUANTITY`; with `presenceOnly` too → presence, no count.
  - Through a confirmed join (description `Samples` lends Date/position) → the same three IDs.
  - An `occurrenceID` column → the tick is ignored, IDs from that column.
  - Copies: lines 2 and 3 identical → with `ownRecords` and no answer `CONV-ROW-COPIES`; with `keepCopiesCount: 1` → `CONV-ROW-COPIES-KEPT`, both rows written; `keepCopiesCount: 2` → `CONV-ROW-COPIES` again.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/own-records.test.ts test/convert/ids.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement**, APPS §8.6 ("occurrenceIDs from source lines: only by the person's choice; the cost"); regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "A long sheet can be declared one record per row: each occurrenceID is the sample's eventID and the source line number, a row with no count is one individual, identical rows may be kept as separate records, and the archive and the report say so."

### Task 13: Item 1 — request, buttons, tick and companion lines

**Files:**
- Modify: `src/worker/convert.protocol.ts` (`ownRecords`, `ownRecordsFromFile`, `keepCopies`, `keepCopiesCount`, `keepCopiesFromFile`), `src/worker/convert.handler.ts` (`rawInputsOf`, booleans only when `true`, counts only whole numbers); `src/core/convert/settings.ts` (`ownRecords=<rows>:<sheet>`, `keepCopiesRows=<count>:<sheet>`); `src/app/convertModel.ts` (`SheetChoice.ownRecords`, `ownRecordsFromFile?`, `keepCopiesAnswer?`, `keepCopiesFile?`; `requestOf`; `initialChoices` (pre-tick `ownRecords` only for the same row count, F11 pattern); `fileAnswers` `:316`); `src/app/components/ConvertSheetForm.tsx` (tick, shown only on an eligible sheet); `src/app/pages/ConvertPage.tsx:374` (`chooseForSheet` gains `'ownRecords' | 'keepCopies'`), buttons `:1564-1600`, "Ask again" on `CONV-OWN-RECORDS` / `CONV-ROW-COPIES-KEPT`, companion `:883`; `src/core/i18n/ui.ts`
- Test: `test/app/convertOwnRecords.test.tsx` (new), `test/convert/settings.test.ts`

**Interfaces:**
- Consumes: Task 12 fields and rules.
- Buttons: "Each row is its own record" on `CONV-ID-DUPLICATE` (params `sameTaxon` or `sameValue`) and on `CONV-TAXON-NO-QUANTITY`; "Keep identical rows as separate records" on `CONV-ROW-COPIES` only when the sheet has `ownRecords` (stores `keepCopiesAnswer = f.params.count`).

- [ ] **Step 1: Write the failing tests:** the `Fish` CSV through the page: `CONV-TAXON-NO-QUANTITY` → button → request `ownRecords: true`, `CONV-OWN-RECORDS` shown; "Ask again" → off. The companion contains `ownRecords=3:Fish`; a reload with it pre-ticks; the same companion against a 4-row `Fish` does not. Copies flow sends `keepCopiesCount: 1`. The tick is absent for a sheet with an `occurrenceID` column.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertOwnRecords.test.tsx test/convert/settings.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app test/convert/settings.test.ts --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "The page offers each row is its own record on the duplicate-identifier and no-quantity messages and as a tick, offers to keep identical rows under that choice, and keeps both answers in the companion file with the numbers they hold for."

### Task 14: Item 8 — "the samples are the columns" (core)

**Files:**
- Create: `src/core/convert/turn.ts`
- Modify: `src/core/types.ts:26` (`RawSheet.turn?: TurnInfo` beside `pivot`); `src/core/convert/build.ts:1509` (no transposed detection for `sheet.turn`), per-sheet turn findings, the remap beside `originalLines` `:3169`; `src/core/convert/ledger.ts` (`'turned-label'`, `'turn-no-name'`; a `turnPass` beside `pivotPass` `:677`; `skippedSheet` `:777`); `src/core/convert/notWritten.ts` (`REASON_KIND`, `SUPERSEDES`, `sourceOf` `:138` reads `sheet.turn.source`); `src/core/convert/sampleJoin.ts:76` (a turned description is proposed `long`, B2); `src/core/rules/convert.ts` (`CONV-JOIN-DESCRIPTION-LONG` plainIf `turned`), `src/core/convert/policy.ts`; `docs/rules.md`, `docs/APPS.md` §8.4 (`:1382`)
- Test: `test/convert/turn.test.ts` (new), `test/convert/transposed.test.ts` (unchanged behaviour without a turn)

**Interfaces:**
- Produces (`turn.ts`):
  ```ts
  export interface TurnDeclaration { nameColumn: number; notSamples: number[]; headerDates?: boolean }
  export interface TurnInfo extends TurnDeclaration {
    source: RawSheet;                              // the sheet as dropped
    sampleColumn: Record<number, number>;          // turned row line -> source column of its sample
    nameLine: Record<number, number>;              // turned column index -> source line of its row name
    labelColumns: number[];                        // left of nameColumn, and notSamples
    blankHeaders: number[]; repeatedHeaders: { header: string; columns: number[] }[]; blankNameLines: number[];
  }
  export const TURNED_LINE_BASE = 10_000_000;     // turned row line = TURNED_LINE_BASE + source column (never a real line)
  export function turnSheet(sheet: RawSheet, decl: TurnDeclaration): RawSheet          // header ['Sample', ('Date' when headerDates), ...row names made unique as pivot.ts does]; cells as written; .turn set
  export function turnFindings(file: string, sheet: RawSheet): Finding[]              // CONV-TURN-HEADER-BLANK / -REPEATED (block), CONV-TURN-NAME-BLANK (block), CONV-SHEET-TURNED (info: rows, samples)
  export function turnedLines(findings: readonly Finding[], file: string, sheet: RawSheet): Finding[]   // B1 remap
  ```
- The own-records eligibility of Task 12 gains `sheet.turn === undefined` (a turned record has no single source line).
- Sample columns = every column right of `nameColumn` not in `notSamples`; a blank or repeated (trimmed) sample header is not turned and blocks; a source row with values and a blank name becomes no column (fate `turn-no-name`, kind `blocks`, `SUPERSEDES` → `CONV-TURN-NAME-BLANK`). With `headerDates` the `Date` cell is the header text as written (never parsed here: the date column's own reading and Task 7's order apply).
- B1 remap: a finding on a turned sheet with a `field` that is a row-name column → `lines` = the source line of that name, `params.turnedColumn` = the column letters of the sample (`columnLetters`, `build.ts:729`); a finding with no such field → `lines` = `[source.headerLine]`, `params.turnedColumn`. The page appends "(column C)" when `turnedColumn` is present (Task 15). If `test/rules/registry.test.ts` requires declared params, declare `turnedColumn` on the rules the remap can annotate.
- Ledger: the turned sheet is kept in the lines of `turn.source` (as a pivot in its long sheet): a source line is `written` when one of its sample cells wrote; `labelColumns` cells are listed `turned-label`; `rows.source` = source rows; balanced.

- [ ] **Step 1: Write the failing tests** (spec `Taxa`: Taxon | S1 | S2 | Total — (*Calanus finmarchicus*, 4, 0, 4), (*Oithona similis*, 1, 2, 3); `Samples`: Sample | Date | Lat | Lon):
  - `turnSheet(Taxa, { nameColumn: 0, notSamples: [3] })` → header `['Sample', 'Calanus finmarchicus', 'Oithona similis']`, rows `S1: [S1, 4, 1]`, `S2: [S2, 0, 2]`; `turn.labelColumns` contains 3.
  - Converted wide (count) with a join on `Sample` to `Samples` → events S1, S2 with date and position; occurrences 4, 1, 2 (the 0 skipped as today); `Total` cells listed `turned-label`; `CONV-SHEET-TURNED` `{ rows: 2, samples: 2 }`; the `Taxa` ledger balances with `rows.source === 2`.
  - Bad count `2.5` in S2 of row 2 → `CONV-COUNT-NOT-INTEGER` at line 3, `params.turnedColumn === 'C'` (Review Focus 4).
  - Headers `S1`, `S1 ` → `CONV-TURN-HEADER-REPEATED`; a blank header with values → `-BLANK`; a row with no name and values → `CONV-TURN-NAME-BLANK` + `CONV-ROW-NOT-UNDERSTOOD` `turn-no-name`; with leave-out → listed, the block gone.
  - `headerDates` with headers `2023-04-05`, `2023-04-06` → a `Date` column holding those texts.
  - A turned description sheet (variables in rows) → proposal `long`, `CONV-JOIN-DESCRIPTION-LONG` with the turned wording, not joined (B2).
  - `transposed.test.ts` passes unchanged (detection and the two old answers).
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/convert/turn.test.ts test/convert/transposed.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement** `turn.ts`, the type, the build/ledger/notWritten/sampleJoin hooks, APPS §8.4 ("a sheet is turned only when the person declares which column names the rows and which columns are not samples"); regenerate `docs/rules.md`.
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/convert test/rules --maxWorkers=2` — Expected: PASS.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit `src/core/convert/turn.ts` and the touched paths — "A sheet whose samples are its columns can be turned by the person's declaration of the name column and the columns that are not samples; findings and the ledger point at the source cells and the label columns are listed."

### Task 15: Item 8 — worker turn choice, page and companion line

**Files:**
- Modify: `src/worker/convert.protocol.ts:40` (`ConvertFileSummary.turned?`), `:252` (new `turnChoice` beside `pivotChoice`), `:274` (`ConvertEngine.turnChoice`); `src/worker/convert.handler.ts:73-200` (`Held.turns`, parse applies companion `turned` lines, `repivot` → pivot then turn), `:260` (new `turnChoice`), `:565` (dispatch), `createDirectConvertEngine` `:583`; `src/worker/convert.engine.ts` (the worker-backed `ConvertEngine`, beside its `pivotChoice`); `src/core/convert/settings.ts` (`turned=<sheet>:<nameHash>:<rows>:<notSampleHashes>[:dates]`); `src/app/pages/ConvertPage.tsx` (third answer on `CONV-SHEET-TRANSPOSED`, "(column C)" suffix for `turnedColumn`, companion `:883`); `src/app/components/ConvertSheetForm.tsx` (action "The samples are the columns…" on any sheet, the turn form: name column select starting empty, not-sample ticks, header-dates tick, Undo); `src/core/i18n/ui.ts`
- Test: `test/app/convertTurn.test.tsx` (new), `test/app/convertWorker.test.ts`, `test/convert/settings.test.ts`

**Interfaces:**
- Consumes: `TurnDeclaration`, `turnSheet` (Task 14).
- `turnChoice: { req: { fileId: string; sheet: string; turn: TurnDeclaration | null }; res: ConvertFileSummary }` — the handler checks indexes (whole numbers within the source width, `nameColumn` not in `notSamples`), stores or deletes `h.turns[sheet]`, re-reads the file (pivot, then turn) and returns the summary, whose `turned[sheet]` = the declaration (+ `fromFile`). A long-pivoted sheet is never turned.
- Companion: written by the page from `summary.turned`; `nameHash` / `notSampleHashes` = `keyHashes(source header, …)`, `rows` = source rows; the parse applies a line only when the hashes resolve and the rows match (pre-tick), else nothing.

- [ ] **Step 1: Write the failing tests:** worker: `turnChoice` on `Taxa` → summary sheet header `Sample, Calanus finmarchicus, Oithona similis`, proposals `Sample` → `sampleId`, taxa as candidates; `turn: null` → the original columns; `nameColumn: 9` → ignored, summary unchanged. Page: `CONV-SHEET-TRANSPOSED` → "The samples are the columns" → pick `Taxon`, tick `Total` → the turned sheet's roles shown; a count finding shows "(column C)"; the companion has a `turned=` line; reload with it → turned again; with a third taxon row added → not turned. Undetected sheet (first column header `Family`) → the form action turns it.
- [ ] **Step 2: Run** `nice -n 15 npx vitest run test/app/convertTurn.test.tsx test/app/convertWorker.test.ts test/convert/settings.test.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `nice -n 15 npx vitest run test/app test/convert --maxWorkers=2` — Expected: PASS. Then the golden tests with `GOLDEN_DIR` (types.ts changed) — Expected: PASS, count reported.
- [ ] **Step 5:** `npx tsc --noEmit -p .`; commit the touched paths — "The page lets the person say that a sheet's samples are its columns, from the transposed message or from the sheet form, the worker turns the file so roles are proposed on the turned columns, and the companion file keeps the turn for a sheet of the same shape."

### Task 16: Acceptance on the real corpus (VPS only)

Nothing of this task runs on the Mac (Michał, 06.11) and no real data, choices or report enters the repo. Host: `ssh ice13ball@apiSomethingRare`. Harness: `/home/ice13ball/tools-regression/tmp/join` (`run-vps.sh`, `scripts/runall*.sh`, `scripts/convert-harness.test.ts`, `scripts/cmp-join.py`, `manifest2.json`: 29 entries, 27 result files + 2 traits tables), declarations `choices/` and the corrected ones `diag/choices{,2,3}/`, corpus `/home/ice13ball/tools-regression/data/join-real-2026-11-12/`; second corpus `/home/ice13ball/tools-regression/tmp/r2t27` (02.11/12.11 regression, `cmp27.py`).

- [ ] **Step 1: Ship the trees.** On the Mac: `git archive --format=tar -o $CLAUDE_JOB_DIR/tmp/r3-ship/base.tar e69d037` and `… new.tar HEAD`; copy to `/home/ice13ball/tools-regression/ship/round3/`; unpack into `tmp/join/base-r3` and `tmp/join/new-r3` (and the same two for `tmp/r2t27`), install as `setup.sh` does.
- [ ] **Step 2: Extend the harness** (in `tmp/join/scripts`, not the repo): pass the new sheet fields from the choices JSON through to the request (`ownRecords`, `keepCopiesCount`, `dayMonthOrder`, `declaredPosition`, the new `quantity` kinds), call `engine.turnChoice` before the conversion for a `turn` entry, and dump per file: archive file hashes, findings (rule, sheet, lines, params), ledger tallies, `view.sampleJoin`, and the proposals (column, role, reasonCode).
- [ ] **Step 3: Check the host and run.** `awk '/MemAvailable/ {print $2}' /proc/meminfo` ≥ 4000000; `free -m` swap not full; `systemctl list-units 'obis-sync*' 'pm-h1-*' 'tools-regression-*' --state=running` and the same with `--user` both empty. Then `systemd-run --user --unit=tools-regression-r3 -p MemoryMax=3G -p CPUWeight=10 -p IOWeight=10 bash /home/ice13ball/tools-regression/tmp/join/run-r3-vps.sh`, which runs `runall-r3.sh base`, `new` (both `CONV_JOIN=none`, today's `choices/`), `r2t27` base/new, then `careful` (below).
- [ ] **Step 4: Verify byte-for-byte** (both corpora, base vs new, no new declarations). Expected: every difference is one of the intended changes 1–7 of Global Constraints, listed per file: rule id added or removed, and for item 5 each proposal diff names its header (must contain a word of the Task 4 lists; any archive diff must come from such a header the harness confirmed as a taxon). Any other difference: stop, report file label and first differing key.
- [ ] **Step 5: The careful run.** Copy `diag/choices3` → `choices-r3/` (falling back to `diag/choices2`, `diag/choices`, `choices` per file) and add only the new declarations a careful person makes from the file and its own description: `turn` for the 8 transposed files (diagnosis §4), `ownRecords` for dvnl-mangrove, fish-uvc, reef-structure, timefish, corner-rise, `dayMonthOrder` for menorca, biomass `per: 'sample'` for emilia and tunu where the source says per sample, `cover` for inv-au / inv-br, `class` for inv-bc / inv-nz, and `declaredPosition` only where the dataset's own metadata states one place (elbe, inv-sf: quote the source line in the report; never a position read off a map or another dataset). Run `careful` with `CONV_JOIN=confirm-description`.
- [ ] **Step 6: Write the report** `/home/ice13ball/tools-regression/tmp/join/report-r3.md` (copy to `$CLAUDE_JOB_DIR/tmp/round3-acceptance-report.md`): the byte-for-byte table of Step 4; for the careful run, how many of the 27 result files reach an archive (the diagnosis estimated 8–9, plus elbe and inv-sf with the declared position) and, per file, the declarations added, `ok`, the blocking rules left with their class (data A / tool B / harness D), whether every ledger balances, and anything that crashed; separately, which files the new eventDate block stopped. Expected: every file runs to the end and every ledger balances. The report goes to Michał for review; the branch is not proposed for merge before he has read it.
- [ ] **Step 7:** stop the unit if still listed; keep `tmp/join` until Michał has reviewed; nothing to commit.

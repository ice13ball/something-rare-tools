# /convert: joining a results sheet to the sheet that describes its samples (design)

Date: 2026-11-12. Status: design, not built. Branch `convert-sample-join`.
Owner decisions are marked **(Michał)**; the drafting session's proposals are marked **(proposal)**.
Decisions of 12.11 are in section 5. Code waits for Michał's approval of this document.

## 1. Intent

Many workbooks keep the results in one sheet (taxa and counts per sample code) and the description
of the samples in another (station, date, position, depth, gear ...), linked by a sample code.
Today /convert reads every sheet as its own table and never joins (docs/APPS.md §3.4 end and §8.4
"Transposed", pinned by `test/convert/no-joins.test.ts`). With such a workbook both sheets open a
sample event for the same code, the IDs collide, and `CONV-ID-DUPLICATE` blocks the archive with no
way out (parked item Q-T5-1). The person can only merge the sheets by hand outside the tool.

The feature lets the person confirm the link once; the tool then attaches the description to every
results row and the archive is built as for a single sheet.

## 2. Goals, non-goals, anti-goals

Goals
- A workbook of one results sheet + one description sheet converts without hand editing.
- Every value of both sheets either reaches the archive or is listed with a reason.
- Conflicting values are shown side by side; the person decides, in bulk or per sample.

Non-goals (for now)
- A second sheet with MORE results for the same samples (Michał: out of scope).
- More than one description sheet per results sheet; chains of joins.
  (The reverse, one description sheet for several results sheets, IS in scope: decision 6.)
- Joining on anything but equal key values (no fuzzy match, no trimming of suffixes beyond what the
  sample key already does).

Anti-goals (must never happen)
- A silent fill or a silent overwrite: a value taken from the other sheet where both sheets have one.
- Guessing the link: nothing joins until the person confirms it.
- Losing a sample that has a description row and no results.
- Any change for a file without a confirmed join (single-sheet files and unconfirmed workbooks
  convert byte-for-byte as today; the golden tests stay unchanged).
- A new heuristic that guesses a column's role from its values.

## 3. Constraints

- Browser only; data never leaves the browser (the worker `src/worker/convert.handler.ts` does it all).
- Four UI languages (en, pl, de, fr): page strings in `src/core/i18n/ui.ts`, rule texts in
  `src/core/rules/convert.ts` with Polish plurals; `docs/rules.md` regenerated
  (`UPDATE_RULES_DOC=1 npx vitest run test/rules/rules-doc.test.ts`).
- AGPL SPDX header on every new file.
- Declare-first **(Michał, rule of 02.11)**: the tool proposes, the person confirms.
- A choice that blocks the archive follows the existing pattern: an error finding with a button
  (`ConvertPage.tsx` `chooseForSheet`, as for `CONV-ROW-COPIES` → `dropCopies`), the answer travels
  with the number it was given for (`dropCopiesCount`) and is honoured only when today's analysis
  finds the same number; a companion-file answer re-opens the question when the numbers differ.

## 4. Approaches

1. **Merge before conversion (chosen, Michał).** After confirmation the description columns are
   attached to every results row before `convert()` runs, so events, eMoF, NERC and every check run
   unchanged on one merged sheet. Reuse /check's join key logic, extended from position + date to
   all description columns.
2. Description sheet as a separate event table (rejected, Michał): the sample events would come from
   one sheet and the occurrences from another; a large rebuild of the core of `build.ts`
   (`samples` map, `SampleAcc`, the per-sheet `fate` ledger, the duplicate-event logic).
3. A manual preview/download step ("download the merged sheet, check it, upload it") as the main path
   (rejected, Michał: the opposite of automation). It may be an optional extra later.

## 5. Decided (Michał)

1. Scope: one results sheet + one description sheet, linked by a sample key.
2. Approach 1: merge before conversion; reuse /check's join engine for the key.
3. Declare-first: the tool PROPOSES which sheet is the description and which column(s) are the key;
   the person confirms. Nothing joins by itself. No role-guessing from values.
4. Conflicts (the same quantity in both sheets with different values, e.g. two dates for one sample):
   the archive stops and shows both values; the person chooses. The app must help: conflicts are
   grouped, and for each group the person picks "take from the description" / "take from the
   results" for ALL cases, or decides per sample; single samples can still be overridden after a
   bulk choice. The person decides whether a choice applies to one entry or to all identical ones.
   **Grouping (Michał, 12.11):** one group per quantity (e.g. "the date differs in 200 samples"), with
   "take from the description for all" / "take from the results for all"; under it a table of the
   samples where single entries can be changed, plus "apply to all with the same pair of values".
   The group's identity (the quantity) is the key of the saved answer.
5. Principle: scientific data is never removed or altered silently.
6. **(Michał, 12.11)** One description sheet may serve several results sheets (e.g. phytoplankton and
   zooplankton sheets sharing one samples sheet). Each results sheet is merged with it separately; a
   description-only sample (P2) is written once, not once per results sheet; the description sheet's
   ledger says which results sheets each line was lent to; `sampleJoin` in the protocol is a list.
7. **(Michał, 12.11)** The join also works across two uploaded files (`results.csv` + `samples.csv`):
   a sheet is identified by file + sheet, in the protocol and in the companion file.
8. **(Michał, 12.11)** P1–P8 below are approved, and the proposed tests (section 9) may be written.
9. **(Michał, 12.11)** Real data first: besides the small invented tests, the feature is accepted on
   real public datasets with a results sheet and a sample-description sheet (or two files), kept on
   the VPS outside the repo like the 02.11 regression corpus. "People always make mistakes none of
   us would think of." Every real file goes through /convert before and after the change; any
   difference outside the join is a bug.

## 6. Proposals (approved by Michał on 12.11)

- **P1. Results sample without a description row** → the archive stops; the samples are listed by
  name (`CONV-JOIN-NO-DESCRIPTION`), with one choice: "convert these samples with only what the
  results sheet says about them". After that choice the existing checks apply to them unchanged (a
  sample with no date or position still blocks as today). A hard stop with no way out would repeat
  the dead end of Q-T5-1 for a workbook where only a few descriptions are missing.
- **P2. Description row without results** → kept as a sample event with no occurrence, with a
  warning to accept (`CONV-JOIN-DESCRIPTION-ONLY`). A sample where nothing was found is a result.
  Cost (checked in `build.ts`): a WIDE sheet already opens a sample event for a row that has a sample
  code and no taxon cell (`relevant = wideHasValue || code !== undefined`, line ~1920), so appended
  description-only rows work there as is. A LONG sheet does not: a row without a taxon is not
  `relevant` and ends as `sample-no-taxon` / `position-no-taxon` (listed, no event). A long merge needs
  one new path in `build.ts`: a row marked by the merge as description-only opens its sample event
  (site, device, mesh, eMoF of the sample) and writes no occurrence. Also check: `sampleSplitOf`
  counts "more events than occurrences" as evidence of a split (line ~593); description-only events
  must be left out of that count, or the split question appears wrongly. OBIS accepts events
  without occurrences in an Event core.
- **P3. A key that maps to several description rows with different values** → stop, as
  `ROW-JOIN-AMBIGUOUS` does on /check (`CONV-JOIN-AMBIGUOUS`). Rows that repeat identically are one
  row. Unlike /check, "different" is judged on every description column, not on position + date only.
- **P4. Blank on one side, value on the other** is not a conflict: the value is taken, counted and
  said once per column (`CONV-JOIN-FILLED`, info), so nothing changes silently.
- **P5. Equal after reading** (2020-06-01 vs 01.06.2020, 5 vs 5.0) is not a conflict: values are
  compared after the same parsing the converter uses (date, number, depth unit); the verbatim text
  written is the results sheet's. After a conflict choice, the verbatim text is the chosen side's.
- **P6.** A results row with a blank key part → error listing the lines (`CONV-JOIN-KEY-BLANK`), as
  `ROW-JOIN-KEY-BLANK` on /check.
- **P7.** The value not chosen in a conflict is not lost: it is listed in the file beside the archive
  (`notWritten.ts`, new reason `join-not-chosen`) with both lines.
- **P8.** The no-joins rule, its docs and its test change deliberately (section 8).

## 6a. Calls made by the drafting session after the builder check (Michał may overrule)

- **C1. "Same quantity" is judged on the value the converter derives, not on the column role.** The
  event date (from a Date column or from Year/Month/Day parts, with Time), the position, and the
  depth range (one depth, or top/bottom) are compared after parsing. So the comparison runs on
  what `metaParser` produces, and `mergeSampleSheets` needs it. Comparing roles would let a date
  built from parts on one side and a Date column on the other both reach the merged sheet, and
  `colsOf` would silently take the first. That breaks anti-goal 1.
- **C2. A description may be coarser than the results sample** (one row per station, shared by many
  samples). Its values are lent to every sample of that key. Conflict rows and per-entry choices
  are keyed on the join-key value (the description row), and the table lists the results samples
  under it. A station-level depth against a per-sample depth is shown as a conflict like any other.
  The person may answer "take from the results" for the whole group in one click.
- **C3. "Byte-for-byte as today"** (anti-goal 4) covers the archive files and every existing
  finding. The one addition for an unconfirmed workbook is the info finding `CONV-JOIN-PROPOSED`
  (and the panel). Test 1 asserts exactly that difference.

## 7. How it fits the existing code (what the code already gives, and what it does not)

- **Key proposal.** `findJoin` (`src/core/recognize/layout.ts:242`) holds the wanted ranking: a unique
  right column first, then a shared header and a strong kind (`STRONG_KEY_KINDS`: station, sampleId,
  cruise), then the finer key, then the shared columns together as a composite (`extraKeys`).
  It cannot be called as is: it is private, works on /check's `SheetInfo` (roles of
  `recognize/columns.ts`, not /convert's confirmed `SheetMapping`), proposes only a right sheet that
  has latitude AND longitude for a left sheet that has neither (`proposeLayout`, `coordSheets`), and
  drops a candidate unless EVERY left key value exists on the right (the subset test). The builder
  must extract the ranking into a shared function taking (left keys, right keys, rows) so that
  /check keeps its behaviour (its tests in `test/recognize/join-key.test.ts`,
  `test/checks/join-nonunique-stations.test.ts` stay green) and /convert calls it with its own
  mappings, any description sheet, and a coverage measure instead of the hard subset test
  (P1 then lists the uncovered samples). The proposal reads roles the person already has on screen
  (sample code, station, cruise, key part); it adds no new role guess.
- **Value lending.** /check's `makeLookup` / `withLookup` (`src/core/dataset.ts:845-934`) is NOT
  reusable for the merge: it fills a field only when the measurement row's own is blank and keeps
  the measurement value otherwise, without saying so (left wins silently), judges ambiguity on
  position + date only, and silently lends no depth when rows differ only in depth. Decision 4 and
  principle 5 need the opposite. /convert gets its own merge; /check is not changed.
- **Where the merge runs.** Precedent: a long sheet is replaced by its pivot in the worker
  (`repivot` → `pivotConvertFile`), and its findings are mapped back to source lines through
  `PivotInfo.cellLines` (`pivot.ts:358`). The merge follows that pattern in `inputsOf`
  (`convert.handler.ts:277`): the two `ConvertSheetInput`s become one, whose `RawSheet` is the results
  rows with the description cells appended, whose `mapping` is the results mapping plus the
  description mapping shifted by the results width, and which carries a provenance table
  (merged row/column → sheet, line). The description sheet is then not sent as a table of its own
  (that is what removes the `CONV-ID-DUPLICATE` of Q-T5-1).
- **One column per quantity.** `colsOf` (`build.ts:222`) takes the FIRST column of a role (`??=`) and
  `metaParser` reads one date, one position. Two date columns in the merged sheet would silently use
  the first. So the merge emits ONE column per role (the resolved one, after P4/P5 and the person's
  conflict choices), and the other column's cells go to the provenance table, never to the role.
  "Same quantity" = same role (kind, depth `bound`, variable name + unit); a header match is not enough.
- **Provenance in findings and the ledger.** `SourceRef` (`model.ts:24`) and the per-sheet `fate`
  ledger (`ledger.ts`) assume one sheet per input. A finding on a description cell (a bad date)
  would otherwise point at the results line, once per results row of the sample. The remap step
  must send it to the description line, once. The description sheet's ledger must say, per line,
  "lent to N samples of <results sheet>", "description-only event" or the conflict reason, so that
  `notUsedLedgers` does not report it as unused and the sheet stays balanced.
- **Sample key.** The per-sheet sample key (`sampleKey.ts`, `ConvertSheetInput.sampleKey`) is never
  guessed and stays the results sheet's. The join key is a separate declaration: by default proposed
  as the results sheet's sample code column (or picked key) matched to a column of the description
  sheet; the person may change it. The merged sheet keeps the results sheet's name, so the event IDs
  and the default key prefix do not change.
- **Gear.** /convert has no per-row gear role: the device is a per-sheet choice
  (`ConvertSheetInput.device`, `SamplingDevice`). A gear column in the description sheet stays as
  today (ignored and listed, or a variable). Per-sample gear is out of scope.
- **Companion file.** Per-sheet answers are keyed by sheet name and row count (`settings.ts`,
  `keySetting.ts` hashes). The join is saved as (results sheet, description sheet, key column
  hashes, row counts) and conflict choices as (group, count); a mismatch re-opens the question.

## 8. What changes where (map for the builder)

Core
- `src/core/recognize/layout.ts`: extract the key ranking of `findJoin` into an exported function;
  `findJoin` calls it; no behaviour change on /check.
- `src/core/convert/sampleJoin.ts` (new): `proposeSampleJoin(...)`, `mergeSampleSheets(...)` returning
  the merged sheet, mapping, provenance, conflict groups and findings; pure, no I/O.
- `src/core/convert/build.ts`: description-only rows on long sheets (P2); keep them out of
  `sampleSplitOf`; finding remap through the merge provenance.
- `src/core/convert/ledger.ts`, `notWritten.ts`: the description sheet's lines; reason `join-not-chosen`.
- `src/core/convert/settings.ts` / `keySetting.ts`: the join and the conflict answers in the companion file.

Worker and page
- `src/worker/convert.protocol.ts`: `ConvertRequestBody.sampleJoin?: { results, description, keys[],
  conflicts: { group, take: 'description' | 'results', count, exceptions: { sample, take }[] }[] }`.
- `src/worker/convert.handler.ts`: merge in `inputsOf`; `parse` returns the proposal (not applied).
- `src/app/convertModel.ts` (`SheetChoice`, `requestOf`, `initialChoices`) and
  `src/app/pages/ConvertPage.tsx`: a "these two sheets describe the same samples" panel with the
  proposed sheets and key, Confirm / Change / No; conflict groups with the two bulk buttons and a
  per-sample table; the override after a bulk choice.
- `src/core/i18n/ui.ts`: the panel strings in en, pl, de, fr.

Rule codes (tentative names, `src/core/rules/convert.ts`, `docs/rules.md` regenerated)
- `CONV-JOIN-PROPOSED` info: the proposal, shown until answered; nothing joins.
- `CONV-JOIN-CONFLICT` error: per group, both values and the sample count; blocks until chosen.
- `CONV-JOIN-CONFLICT-CHOSEN` info: what was taken from where, and how many samples (the report keeps
  the choice visible).
- `CONV-JOIN-NO-DESCRIPTION` error (P1), `CONV-JOIN-DESCRIPTION-ONLY` warning/accept (P2),
  `CONV-JOIN-AMBIGUOUS` error (P3), `CONV-JOIN-KEY-BLANK` error (P6), `CONV-JOIN-FILLED` info (P4).

Docs
- `docs/APPS.md` §3.4 end ("`/convert` does not use this plan") and §8.4 "Transposed" ("no joins"):
  rewritten to "no join unless the person confirms one (§8.x)"; a new §8 subsection describes the
  feature; `sampleKey` paragraph (~:1491) "whether two sheets hold the same samples is not asked"
  updated.

Existing tests that change
- `test/convert/no-joins.test.ts`: kept; its claim narrows to "no join without confirmation" (its
  workbook has no confirmed join, so it must still pass unchanged); the file comment and the
  `describe` text are updated. Its Station sheet carries positions, not a sample description, so a
  second case is added only if Michał consents.
- `test/recognize/join-key.test.ts`, `test/checks/join-nonunique-stations.test.ts`: must stay green
  after the extraction (no edit expected).
- `test/rules/rules-doc.test.ts`, `test/rules/registry.test.ts`: regenerate / new codes registered.
- Golden tests (`test/golden`, needs `GOLDEN_DIR`): no diff expected; any diff is a bug.

## 9. Test set (approved 12.11; invented data, plus the real corpus of decision 9)

All data invented. Workbook `book.xlsx`:
`Counts` = Sample | Taxon | Count — rows (`X01`, *Calanus finmarchicus*, 12), (`X01`, *Oithona similis*, 3),
(`X02`, *Calanus finmarchicus*, 7). `Samples` = Sample | Station | Date | Latitude | Longitude | Depth —
(`X01`, `ST-1`, 2021-05-03, 61.1, 4.2, 10), (`X02`, `ST-2`, 2021-05-04, 61.3, 4.6, 20),
(`X03`, `ST-3`, 2021-05-05, 61.5, 4.9, 30).

1. Unconfirmed proposal: output identical to today (same findings incl. `CONV-ID-DUPLICATE` if any).
2. Confirmed: events X01, X02 carry station, date, position, depth from `Samples`; occurrences as today.
3. X03 (description only): one sample event, no occurrence, `CONV-JOIN-DESCRIPTION-ONLY`; both wide
   and long shapes; the split question is not raised by it.
4. `Counts` gains (`X04`, *Oithona similis*, 1): `CONV-JOIN-NO-DESCRIPTION` names `X04`; blocks;
   after the "results only" choice X04 converts from the results sheet alone (and blocks on a
   missing date, as today).
5. Conflict: `Counts` gains a Date column, X01 = 2021-05-02: `CONV-JOIN-CONFLICT` shows both; bulk
   "take description" writes 2021-05-03 and lists 2021-05-02 in the not-written file; a per-sample
   override for X01 after the bulk choice wins.
6. Grouping: three samples whose description date is later than the results date form one group;
   one earlier forms another.
7. Equal after reading (`03.05.2021` vs `2021-05-03`): no conflict.
8. Blank on one side: filled and counted (`CONV-JOIN-FILLED`).
9. `Samples` lists X01 twice with different depths: `CONV-JOIN-AMBIGUOUS`; twice identically: fine.
10. Composite key Cruise + Station when Station alone repeats.
11. A finding on a description cell (bad date in `Samples`) points at the `Samples` line, once.
12. Companion file: the join and a conflict choice come back; a changed row count re-opens both.
13. Ledger: both sheets balanced; `Samples` not reported as unused.
14. /check unchanged by the `findJoin` extraction (existing tests).

## 10. Rulings made during execution (12.11, by the executing session; Michał may overrule any)

Each line: what was decided — why — what it costs if wrong. Acceptance on 19 real public datasets (29 files, VPS only): unconfirmed workbooks identical to production in 29/29; all 78 ledgers balanced.

- Ruling: H1 follow decision 4 (one group per quantity), spec test 6 rewritten as in the plan — decision 4 is Michał's binding answer of 12.11 — cost if wrong: regroup UI, small.
- Ruling: H2 proposal computed per convert request — needs roles on screen and C3 findings — cost: a little CPU per request.
- Ruling: H3 per-sample exceptions not saved in the companion file (saved as `mixed`, re-asks) — the companion file never holds data values (privacy) — cost: the person re-answers exceptions after reload.
- Ruling: H4 several results sheets sharing sample codes still collide (CONV-ID-DUPLICATE) — that is the out-of-scope "more results for the same samples" case — cost: tell Michał; a later feature.
- Ruling: H5 add CONV-JOIN-RESULTS-ONLY with "Ask again" — matches every other answer's pattern — cost: one more rule code.
- Ruling: F1–F13, F15, F17, F18 accepted as proposed in preflight.md — each fixes a real producer/consumer mismatch or a silent-wrong-value path — cost if wrong: extra code paths, reviewer churn.
- Ruling: F14 a description row with a blank key BLOCKS (description-side CONV-JOIN-KEY-BLANK) with the usual "leave out and list" answer — Michał's principle: no data leaves the archive silently; same pattern as existing blank-key rows — cost if wrong: one extra click for the person.
- Ruling: F16 a pivoted (long) description sheet is refused for joining with a named finding for now (say so in the proposal panel and APPS.md) — description sheets are rarely long; mapping lines through two pivots is risky — cost if wrong: such workbooks keep today's behaviour, a later extension.
- Ruling: F19 flag 1 and flag 3 need no new question to Michał — flag 1 IS his decision 4 of 12.11; flag 3 follows the companion file's standing no-data-values rule — cost if wrong: re-grouping or a companion format change later.
- Ruling: amendment choices (F14 ragged pattern with side param; F16 CONV-JOIN-DESCRIPTION-LONG info; F2 rewrite lent cells via lendCell; T4 temporary ungrouped CONV-JOIN-CONFLICT) accepted — consistent with rulings, nothing silent — cost: small.
- Ruling: CONV-JOIN-KEY-BLANK results side does NOT offer "leave out"; its rows join the P1 set: "fill in the key, or convert these rows with only what the results sheet says" (the CONV-JOIN-RESULTS-ONLY answer covers them) — leaving out occurrences would drop data, P1 already gives the non-dead-end path — cost if wrong: Tasks 4/6 must count blank-key results rows into the no-description/results-only set (CARRY TO TASK 4 AND 6 DISPATCH).
- Ruling: (for Task 6) a results sheet with a CONFIRMED join gets no further CONV-JOIN-PROPOSED for any other sheet; a DECLINED pair is skipped only for that pair — the person already answered for this results sheet; a second proposal would be noise — cost if wrong: a real second description sheet is not proposed (out of scope anyway: one description per results sheet). CARRY TO TASK 6.
- Task 4 review: spec ✅ (4 ⚠️ to Tasks 5–7), 1 Important (time-only cells / millis in lendCell). Fix round 1 sent (base c7b31c1), plus Ruling: minor "1,5 point-file text becomes a number after lending" promoted into the fix — it is a silent alteration — cost: one more guard.
- Ruling: I3 (a part only one side gives) — compare part by part: a part present on one side only (time beside a date, longitude beside latitude, bottom beside top) is a FILL (P4, counted in CONV-JOIN-FILLED), not a conflict; only parts both sides give are compared; a single depth vs a top/bottom range stays a conflict (different meaning) — follows Michał's approved P4 (blank on one side is filled and said) — cost if wrong: a few extra fills that a person might have wanted to see as conflicts; they are still reported.
- Ruling: Task 5 date+time conflict — when dates differ, date+time is one conflict and the chosen side's own time goes with it; a dropped results time stays in notChosen — not silent, keeps a date and its time from one observer — cost: a person may want date from one side and time from the other (they can edit the sheet).
- Ruling: join keys follow the converter's keyPart (so 1, "1" and "1.0" are one key), overriding the plan's Review Focus line 1 — the converter would give them the same event ID anyway; a join that disagreed with the ID would split or merge samples — cost if wrong: two truly different keys 1 and 1.0 in one sheet already collide today.
- Ruling: a description line is written only if ≥1 results row it was lent to wrote something; otherwise a listed reason (join-results-not-written) and its cells go to the not-written file — overrides the brief's "written when lent"; principle 5 — cost: one more reason label.
- Ruling: fix both Importants in the single fix wave — rank keys on the same keyPart-normalised values the merge uses AND let the person open the Change/declare form without a proposal (still confirm-first; no role guessed from values) — deferring would leave real files (corner-rise) with no way in — cost: a little more UI and ranking code.
- Ruling: decision-6 phyto+zoo with SHARED sample codes still collides (CONV-ID-DUPLICATE) — stays out of scope per H4; tell Michał.
- Final: parked — declare button shown for any workbook with a taxon sheet + another sheet (even notes) — Ruling: acceptable, nothing joins without confirm — cost: a little UI noise.
- Final: parked — declare form offers taxon/long sheets that joinInputs refuses → person sees "not applied" — Ruling: visible, not silent; filter later — cost: a confusing extra click.
- Final: parked — APPS §8.11 says "a sample column without a role" can be declared, but joinInputs needs sampleId/station/cruise or a picked key part — Ruling: fix the sentence together with any fix the Task 10 run requires (doc only) — cost: misleading doc until then.
- Final: parked — undecidedOf matches the "chosen" finding by label not id; "Remove key {n}" allow-listed (could be reworded "Do not use key {n}") — Ruling: minor, later.
- Ruling: Task 10 host check — obis-sync.service is a permanent daemon (Restart=always, up since 11.11 08:26), idle at 17 MB RAM, load avg 0.02 on 8 cores; it counts as a heavy job only while it is actively processing (CPU/memory high), so the run may start now with MemoryMax=3G/CPUWeight=10/IOWeight=10 — CLAUDE.md asks for no other HEAVY unit and ≥4 GB free (7 GB free) — cost if wrong: the run competes with a sync batch at low priority; the runner re-checks load and stops if obis-sync becomes active (>1 GB or sustained CPU).
- Ruling: run a second pass with per-file declarations a careful person would make (sample column, quantity, description sheet not a results sheet; declare the join where none is proposed), audited in tmp/join/choices — pass 1 cannot show fills/conflicts — cost: one more VPS run.
- Ruling: acceptance fix wave (post-final) — A. a join whose key matches 0 samples BLOCKS with a new CONV-JOIN-NO-MATCH (examples of keys from both sides, no results-only answer); when NO-DESCRIPTION and DESCRIPTION-ONLY both occur, each lists up to 5 keys of the other side so near-misses are visible; B. conflict groups name the two headers (results vs description) so different quantities sharing a role are recognisable; C. proposals read picked key parts even when the column's role is ignored; D. APPS §8.11 sentence — real data showed these produce wrong-looking output or no way in — cost: one more fix + re-review + VPS re-run.
- Acceptance fix 0a4eef9: A (CONV-JOIN-NO-MATCH), B (headers in conflict groups), D done; C not reproduced (picked parts with equal headers already proposed). Ruling: no value-based pairing for differing headers — the declare path covers it — cost: those files need one declaration.

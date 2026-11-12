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

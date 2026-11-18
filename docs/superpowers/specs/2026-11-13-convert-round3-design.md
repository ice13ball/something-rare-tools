# /convert round 3: the missing ways out (design)

Date: 2026-11-13. Status: design, not built. Branch `convert-round3` (= production e69d037).
Owner decisions are marked **(Michał, 13.11)**; the drafting session's proposals are **(proposal)**;
questions that need his answer are **Q1–Q7** (section 12). Code waits for his approval of this document.

Evidence: the 13.11 diagnosis of 27 public files that reached no archive (a session job file, not in
the repo). Of 67 (file, blocking rule) pairs: 20 are the data's fault (A, the block is right), 17 a way
out missing on the page (B), 0 a rule too strict (C), 30 wrong declarations of the acceptance harness
(D). This round closes the B pairs that need no new data model, the proposer/message dead ends, and
one leniency (eventDate). No real data appears below; every example is invented.

## 1. Constraints (unchanged from 12.11)

- Browser only; four languages (`i18n/ui.ts`, `rules/convert.ts` with Polish plurals; `docs/rules.md`
  regenerated); SPDX header on new files.
- Declare-first **(Michał, 02.11)**: the tool proposes, the person confirms; **no new heuristic that
  guesses a column's role from its values**.
- A choice that blocks follows the existing pattern: an error finding with a button
  (`ConvertPage.tsx` `chooseForSheet`), the answer travels with the number it was given for
  (`dropCopiesCount`, `leaveOut {reason,count}`) and a companion-file answer holds only for the same
  number. The companion file (`convert/settings.ts`) never holds a data value.
- **Byte-for-byte:** a file with none of the new declarations converts exactly as today (archive files
  and findings), except (a) item 3's new block, (b) item 4's message changes, (c) item 5's changed
  proposals for the listed headers. Each item says exactly which outputs change. Golden tests
  (`test/golden`, need `GOLDEN_DIR`, else they skip silently) and the 02.11/12.11 real corpora on the VPS
  (`~/tools-regression`, never on the Mac) are run before and after; any other diff is a bug.

## 2. Item 1 — "Each row is its own record"

**Intent.** A long sheet where one sample holds the same taxon on several rows on purpose: a specimen
per row (Taxon + Length, no quantity), or a size class per row with its own count. Today the occurrence
ID is `sampleEventId:taxonCell` (`ids.ts` `occurrenceIdLong`), so these rows collide and
`CONV-ID-DUPLICATE` (kind occurrence, variant `same-taxon`) blocks, advising an occurrenceID or life
stage column, i.e. a file edit. With no quantity column the sheet stops earlier at `CONV-TAXON-NO-QUANTITY`.

**Decision (Michał, 13.11).** Allowed, as an explicit per-sheet choice. The occurrenceID is built from
the sample (event ID) and the row's **line number in the source file**, never from row order after any
sort or merge, and the archive says so.

**Behaviour.**
- New input `ConvertSheetInput.ownRecords?: boolean` (protocol `ConvertSheetRequest.ownRecords`,
  `SheetChoice.ownRecords`). Offered only on a long sheet that is read directly or through a confirmed
  join (the merge keeps the results `RawRow.line`, checked in `sampleJoin.ts`), and only when the sheet
  has no `occurrenceId` column (that column always wins). Not offered on a pivot, a profile sheet, a
  wide or a turned sheet (item 8): their records have no single source line.
- ID: `occurrenceIdOwnRow(sampleEventId, line)` = `<sampleEventId>:L<line>` (new in `ids.ts`). `line`
  is the `RawRow.line` the findings already show (the sheet row in a workbook, the physical line in a
  CSV). Every row of the sheet gets it, not only the colliding ones.
- Where offered: a second button on `CONV-ID-DUPLICATE` (`same-taxon`, `same-taxon-replicate`,
  `same-value`) and on `CONV-TAXON-NO-QUANTITY`; also a tick in the sheet form (`ConvertSheetForm.tsx`).
- Stated in the archive **(proposal)**: one EML `methodStep` paragraph per such sheet, generated in
  `eml.ts` after the person's own methods text ("Sheet <S> of <F>: one occurrence per source row;
  occurrenceID = sample eventID + ':L' + line number in the source file"). Not repeated in
  `occurrenceRemarks` of every record (it already carries column remarks; the ID says the line).
- Report: `CONV-OWN-RECORDS` (accept): sheet, rows, and the cost: "the IDs change if rows are inserted
  or deleted in the source before a new version; keep the row order, or add an occurrenceID column".
  ⚠️ This is the real cost of the decision: OBIS expects stable occurrenceIDs across versions.
- With no quantity column the sheet still needs an answer for what a row counts (**Q1**): either
  "each row is one individual" (count 1 written: `individualCount` 1, `organismQuantity` 1
  "individuals", eMoF `OCOUNT01`, as for a declared count) or the existing presence-only tick.
- Unchanged checks: `CONV-ROW-COPIES`, `CONV-ROW-COPIES-SPECIMENS`, `CONV-QUANTITY-REPEATED`,
  `CONV-QUANTITY-SAME-IN-SAMPLE` still run on the values (a repeated per-taxon total is still a total);
  `ownRecords` answers only the ID question. Whether identical rows may be kept as separate records is **Q2**.
- Companion file: `ownRecords=<rows>:<sheet>` (pre-tick, holds only for the same number of rows, since
  the IDs depend on them).

**Unchanged.** Without the tick, IDs and findings are as today. **Anti-goals:** an ID from a running
number within a group or from sorted order; offering it silently as the duplicate's default.

**Tests (invented).** Long sheet `Fish`: Sample | Taxon | Length [mm] — lines 2–4 = (`T1`, *Gadus morhua*,
310), (`T1`, *Gadus morhua*, 295), (`T1`, *Pollachius virens*, 400). Without the tick: `CONV-ID-DUPLICATE`
same-taxon, as today. With it: IDs `…T1:L2`, `…T1:L3`, `…T1:L4`; Length is a per-occurrence eMoF row;
EML methodStep present; `CONV-OWN-RECORDS`. Through a confirmed join (description sheet lends the date):
the same IDs. An `occurrenceID` column present: the tick is not offered. Companion file with 3 rows pre-ticks;
with 4 rows the question is open.

## 3. Item 2 — one declared position for a sheet

**Intent.** A study at one known place (a mesocosm, a single reef plot) whose files give no position.

**Decision (Michał, 13.11).** Allowed, declared by the person with `coordinateUncertaintyInMeters`,
marked in the archive and in the report, never inferred.

**Behaviour.**
- New `ConvertSheetInput.declaredPosition?: { lat: string; lon: string; uncertaintyM: string }` (typed
  text, decimal degrees, parsed with `parseTypedNumber`, `quantity.ts`). Offered on `CONV-POSITION-NONE`
  (item 4) and in the sheet form. Accepted only for a sheet with **no** latitude/longitude role and no
  confirmed join that lends a position: it never fills blanks between written positions (**Q5**).
- Applied in `build.ts` where `metaParser` gives each row its `Meta`: every row gets `lat`/`lon` from the
  declaration and a flag, so station parents, the station checks and `ROW-*` range checks run unchanged
  (no virtual source columns, so the ledger lists no invented cells). **(proposal)**
- Written on the sample events: `decimalLatitude`, `decimalLongitude` as typed, `coordinateUncertaintyInMeters`
  as typed (it wins over a derived uncertainty of a parent), and a new optional column `georeferenceRemarks`
  = "Position declared for the whole dataset by the person converting; not stated per sample in the
  source" (`dwca.ts`, `always: false`, so archives without the declaration keep today's columns).
- Report: `CONV-POSITION-DECLARED` (accept): the sheet, the position, the uncertainty, the number of
  samples. `CONV-POSITION-DECLARED-INVALID` (block): latitude outside ±90, longitude outside ±180, an
  uncertainty that is not a number above 0, or a sheet that has a position role (the declaration is refused, not merged).
- Companion file: **not saved**: the coordinates are data values (rule of `settings.ts`, ruling H3 of
  12.11). The person types them again after a reload (**Q6**).

**Anti-goals:** a position taken from the EML bounding box, a station name, a gazetteer, or another
sheet without a join; a declared position mixed with written ones.

**Tests.** Sheet `Tanks`: Tank | Date | Taxon | Count, no position. Declared 54.1, 10.9, 500 m: every
sample event has them with uncertainty 500 and the remark; `CONV-POSITION-DECLARED`. Latitude 95 →
INVALID. A sheet with a Latitude column + declaration → INVALID, positions as written. No declaration →
`CONV-POSITION-NONE` (item 4).

## 4. Item 3 — a missing eventDate blocks

**Intent.** OBIS requires eventDate (obistools `check_fields`). Today a /convert archive can be exported
without it: the Event table check leaves "no date anywhere" to `META-NO-DATES` (`checks/dwc.ts`
`noDateSaid`, `checks/metadata.ts` `noDates`), and the policy makes every `META-` rule show-only
(`policy.ts` `SHOW_ONLY_PREFIXES`); a date missing on some rows is `ROW-DATE-MISSING`, severity info.

**Decision (Michał, 13.11).** A missing eventDate blocks, with a clear message saying what to declare.

**Behaviour.**
- New `CONV-EVENT-DATE-MISSING` (block), raised in `build.ts` per sheet: the sample events of the sheet
  that have no date (a sample's date comes only from its own rows: Date / datetime column, Year-Month-Day
  parts, a lent description date, the PANGAEA header; parents are derived from children). Params: count
  of samples, source lines, and `how` = `no-date-role` (no column is marked as date: "mark the date column,
  or the Year / Month / Day columns, or join the sheet that describes the samples") or `blank-cells`
  (the column exists, these rows are blank: "fill them in, or leave these samples out and list them").
- Way out for `blank-cells`: the existing "leave out and list" answer (`leaveOut`, new reason
  `no-event-date` in `notWritten.ts`, with its count). Not for `no-date-role` (that would empty the sheet).
- `META-NO-DATES` stays in `/check` unchanged; `policy.ts` is not touched (the `META-` prefix stays
  show-only). In /convert, `validateTables` drops the Event table's `META-NO-DATES` and `ROW-DATE-MISSING`
  when `CONV-EVENT-DATE-MISSING` names those events (the `occurrenceDuplicateSaid` pattern), so one cause
  is said once, in the source sheet's terms.
- **Outputs that change:** an upload whose samples have no date anywhere, or some samples without a date,
  now blocks (before: exported with `META-NO-DATES` shown, or `ROW-DATE-MISSING` shown). The two
  suppressed findings disappear from such runs. Every upload whose samples all have dates is unchanged.
- **Q3:** partial gaps block too (my reading of "a missing eventDate"). **Q4:** a declared date or ISO
  interval for a whole sheet (the twin of item 2) is NOT proposed; without it, files with no date at all
  stay blocked, which the diagnosis shows is the case for data-side (A) files.

**Tests.** `Counts` without a date role → `CONV-EVENT-DATE-MISSING` (`no-date-role`), no `META-NO-DATES`
in the /convert findings, export refused. A Date column blank on lines 5–6 → `blank-cells`, lines 5, 6;
"leave out" → two samples in the not-written file, archive allowed. Dates from Year/Month/Day parts →
no finding. `/check` on the same file: `META-NO-DATES` as today (`test/checks` unchanged).

## 5. Item 4 — messages that lead into dead ends

Text and finding changes only; no archive changes (these runs never export).

1. **Positions.** Today an Event table column empty in every row gives `DWC-TERM-EMPTY` naming lines of
   the output `event.txt`. New `CONV-POSITION-NONE` (block), raised in `build.ts` per sheet with sample
   events and no latitude/longitude role, no lending join, no declared position: "No column of sheet
   "{sheet}" is marked as latitude / longitude, and no joined sheet gives a position ({count} samples).
   Mark the latitude and longitude columns, join the sheet that describes the samples, or declare one
   position for the sheet." Variant `emptyColumn`: the role exists but is blank in every row (names the
   source column). `validateTables` drops the Event table's `DWC-TERM-EMPTY` for `decimalLatitude` /
   `decimalLongitude` when every event it covers comes from a sheet so named. `ROW-NO-COORD` (some events
   without a position) is unchanged.
2. **No occurrences.** `CONV-NO-OCCURRENCES` gets a variant `:empty-quantity` (params `sheet`, `column`,
   `rows`) when a long sheet's quantity column is blank in every taxon row (its `naSkipped` equals its
   taxon rows; `build.ts` keeps the per-sheet count): "The quantity column "{column}" of sheet "{sheet}"
   is empty in all {rows} rows, so nothing was written. Mark the column that holds the numbers as the
   quantity, or tick presence only." The generic "add a sheet with taxa" stays for the real
   environment-only case.
3. **A confirmed join dropped in silence.** `sampleJoin.ts` (validation near line 1201) drops a confirmed
   key whose results column lost its role (`RIGHT_KINDS` sampleId / station / cruise, or a picked key
   part); the proposal then reappears. New `CONV-JOIN-KEY-ROLE-LOST` (block): "The join you confirmed
   for "{sheet}" is not applied: column "{column}" no longer has a key role. Give it back the role, or
   confirm the join again." Ask again clears it.
4. Ambiguous day/month dates: item 6. A volume unit `/L` read as "undeclared": item 7.

**Outputs that change:** in /convert only, `DWC-TERM-EMPTY` (lat/lon) is replaced by `CONV-POSITION-NONE`
in the cases above; `CONV-NO-OCCURRENCES` text in the empty-quantity case; a new blocking finding where a
confirmed join was dropped (those runs blocked anyway on the reappearing proposal's consequences).
`/check` texts are not touched.

**Tests.** No position role → `CONV-POSITION-NONE`, no lat/lon `DWC-TERM-EMPTY`; Latitude blank everywhere →
`emptyColumn`. `Count` blank in all 4 rows, `Abundance` ignored → `:empty-quantity` naming `Count`. Join
confirmed on `Station`, then `Station` set to ignore → `CONV-JOIN-KEY-ROLE-LOST`.

## 6. Item 5 — role proposals: "do not propose taxon"

**Intent.** In a wide sheet a numeric column with an unknown name becomes a taxon candidate
(`recognize.ts`, reason `taxon-numeric`) when `measured.ts` `nameKind` finds a genus-shaped first word.
Headers like `Coords N`, `w_PH`, `s_TOC`, `Current velocity`, `Shannon index` pass that shape test
(`GENUS_WORD` accepts letters joined by `_`), so a person who confirms all taxa in bulk and declares
"count" gets `CONV-COUNT-NOT-INTEGER` on environmental columns.

**Rule change (header only, no values read).** In `nameKind`, after the descriptor test and before the
taxon-shape test, the name part is split into words on spaces, `_` and camel case (not on `-` or `/`,
which genus names use). A new kind `'not-taxon'` is returned when the header has no organism-counting
unit and any word is:
- a position word: `coordinate(s)`, `coord(s)`, `position`, `gps`, `latlon`, `lat`, `lon`, `latitude`,
  `longitude`, `northing`, `easting`, `utm`;
- an index or flow word: `index`, `indices`, `shannon`, `simpson`, `evenness`, `richness`, `diversity`,
  `velocity`, `speed`, `ndvi`;
- a part (not the whole name) that is in `VARIABLE_TOKENS` (`w_PH` → `ph`).
`recognize.ts` then sets role `ignore`, confidence low, new reason `not-taxon-name` with the word
("the name says {word}; not proposed as a taxon. If it is a latitude/longitude or a measured variable,
choose that role"). No other role is proposed **(Michał's rule)**. The ignored numeric column is listed by
the existing accept finding for ignored numeric columns, so nothing leaves in silence.

**Approaches.** (A, recommended) ignore with the note, as above. (B) propose `variable` for the
`VARIABLE_TOKENS` part, which matches what a plain `pH` header gets today; rejected because it is a
second guess. The word lists are fixed in code and tested; a word that is a genus name must never be in
them (each word checked against WoRMS by hand before it is added).

**Outputs that change:** proposals for wide-sheet headers containing one of the words. A golden or corpus
file changes only where such a header existed and the harness confirmed it as a taxon; each such diff is
listed in the review and must be one of these headers.

**Tests.** Wide sheet: `Station | Coords N | Coords E | w_PH | Calanus finmarchicus | Oithona` → the two
coordinate and the pH column ignored with `not-taxon-name`, the two taxa still candidates.
`Macoma_balthica`, `Pseudo-nitzschia`, `Acartia/Centropages`, `Calanus [ind/m3]` stay taxa. A header
`Shannon index [ind]` (counting unit) stays a candidate.

## 7. Item 6 — day/month order declared per column

**Intent.** `detectDayMonthOrder` (`values/dates.ts`) decides a column's order only from a cell whose
first or second part is above 12. When none is (`5/4/2023`, `6/7/2023`), every cell whose parts differ is
unparseable (`ROW-DATE-UNPARSEABLE`, blocking in /convert), while `5/5/2023` passes; the message says
"write YYYY-MM-DD" and not why.

**Behaviour.**
- New `ConvertSheetInput.dayMonthOrder?: Record<number, 'dmy' | 'mdy'>` (by column index). Offered only
  when the column's detected order is `unknown` and at least one cell is ambiguous.
- New `CONV-DATE-ORDER-UNDECLARED` (block) per column: header, two example cells, count: "Dates such as
  "5/4/2023" can be read as 5 April or as 4 May, and no date in column "{column}" decides it. Say which
  order the column uses." Buttons: "day first" / "month first". It replaces `ROW-DATE-UNPARSEABLE` for
  exactly those cells (other unreadable cells keep it).
- A declaration contradicted by the file (the detection is `dmy` or `mdy` the other way, or `conflict`) is
  not applied: `CONV-DATE-ORDER-CONTRADICTED` (block). Once applied: `CONV-DATE-ORDER-DECLARED` (info) so
  the report shows it.
- ⚠️ The order is detected independently in six places used by /convert: `dataset.ts` `metaParser`
  (`whenOrder`, `timeOrder`), `build.ts` `timeColumnWithDates`, `stated.ts`, `sampleJoin.ts` (join
  comparison), `sampleKey.ts` `keyPart` (date parts of a picked key). All must take the declaration through
  one helper `columnOrder(sheet, index, declared)`, or the date written, the date in the event ID and the
  date compared in a join can disagree. `metaParser` gets it as an option; `/check` never passes it.
- Companion file: `dayMonthOrder=<dmy|mdy>:<sheet>:<hash>:<rows>` (column by header hash, `keySetting.ts`).
  No value.

**Unchanged.** Columns with a decided order, ISO dates, and every file without the declaration (except the
new finding replacing `ROW-DATE-UNPARSEABLE` for ambiguous cells: a text change of a run that blocked anyway).
**Anti-goal:** an order taken from the language, the locale, the file's other columns or the majority.

**Tests.** Date column `5/4/2023, 5/5/2023, 6/7/2023`: UNDECLARED (2 cells); "day first" → 2023-04-05,
2023-05-05, 2023-07-06, and a picked key with that column builds the same dates. A column with
`13/4/2023` + declaration "month first" → CONTRADICTED. Join: results `5/4/2023` (declared dmy) vs
description `2023-04-05` → no conflict.

## 8. Item 7 — new quantity kinds

Representation follows the OBIS manual and Darwin Core: `organismQuantity` + `organismQuantityType`
on the occurrence (the DwC examples include "% biomass" and an ordinal "Braun Blanquet Scale"), and an
eMoF row with a NERC `measurementTypeID` / P06 `measurementUnitID` where a verified concept exists. As
for every vocabulary id in `vocab.ts`, a concept is used only after it was opened in the NVS on the build
date; otherwise the row is written without the ID and the existing accept finding says so.

| Kind (QuantityForm) | Declared | Occurrence | eMoF |
|---|---|---|---|
| biomass **per sample** (`per: 'sample'`) | basis, unit g / mg / kg | no `individualCount` | S06 `S0600088/87/86` by basis (already verified, `biomassKindConcept`), unit P06 gram etc. (`biomassUnit`); a declared sample size adds "per sample of <size>" (existing remark) |
| cover (`kind: 'cover'`) | nothing more (unit is %) | `organismQuantity` value, `organismQuantityType` per the GBIF quantity-type vocabulary (to verify; fallback "% cover") | P01 coverage concept (candidate SDBIOL10, to verify), unit P06 `UPCT` (verified) |
| abundance class (`kind: 'class'`) | scale name, lowest and highest class, optional meaning per class (typed) | `organismQuantity` class, `organismQuantityType` = the scale as declared ("abundance class 0–5"); **never `individualCount`** | `measurementType` "abundance class (<scale>)", no type ID unless verified; the scale meaning in `measurementRemarks` and in an EML methodStep |

- `resolveQuantity` (`quantity.ts`): `per: 'sample'` for biomass needs no medium and refuses a rate unit
  (`g/m2` with per sample → missing `unit not per sample`). Cover: a value outside 0–100 blocks
  (`CONV-COVER-RANGE`). Class: a value that is not a whole number within the declared range blocks
  (`CONV-CLASS-VALUE`). Zero handling as for counts (0 skipped, or absent with the full-list tick).
- `/L`, `/ml`, `per litre` are read as per volume in `parseRateUnit` (no P06 id: `CONV-UNIT-NO-P06`,
  accept). Changes only runs that blocked on "per volume or per area" for such a unit.
- Page (`ConvertSheetForm.tsx`, `convertModel.ts` `QuantityForm`): the new kinds; the "count" label says
  "number of individuals (for a scale or a class choose abundance class)". No value test suggests a kind.

**Unchanged.** Every existing declaration resolves as today. **Anti-goals:** a class written as a count;
a per-sample biomass written as per area; a kind suggested from the numbers.

**Tests.** Wide sheet, biomass wet, g, per sample: S06 wet weight biomass, unit gram, no medium asked.
Cover 27.5 and 100 written; 120 blocks. Class 0–5, value 3: `organismQuantity` 3, type "abundance class 0–5",
no `individualCount`; value 6 and 2.5 block. `ind/L` + density: per volume, `CONV-UNIT-NO-P06`.

## 9. Item 8 — "samples are the columns" (transpose)

**What exists.** `transposed.ts` detects `transposed` (variables in rows, /check's test) and
`transposed-taxa` (binomials in the first column, sample codes as headers); `CONV-SHEET-TRANSPOSED` blocks
with two answers: turn it in the spreadsheet, or `readAsTable` (wrong for these sheets). **Nothing is ever
turned**, by design. Why 8 files could not be declared: (1) no answer turns the sheet; (2) four were not
detected (a family or OTU id in the first column, a header row of dates, a turned description sheet read
as environment-only), and the question is offered only on detection.

**The missing piece.** A declaration, not a detection: "the samples of this sheet are its columns".
- New `ConvertSheetRequest.turn?: { nameColumn: number; notSamples: number[] }`: the column whose cells
  name the rows (a taxon or a variable), and the columns that are not samples (a total, a group label);
  every other column right of `nameColumn` is a sample. Offered as a third answer on
  `CONV-SHEET-TRANSPOSED` and, for an undetected sheet, as an action in the sheet form on any sheet.
- The worker turns the sheet in `inputsOf` before the proposal, like `repivot`: one row per sample column,
  header `Sample` (the source header text = the sample code) followed by the row names; cells as written.
  A provenance table maps each turned cell to (source line, source column), as `PivotInfo.cellLines`, so
  findings point at source cells and the ledger stays balanced. Left-of-name columns and `notSamples`
  columns are listed in the not-written file (new reason `turned-label`).
- The turned sheet then goes through the normal proposal (taxon headers, measured names, the sample code
  as `sampleId`), the quantity declaration and the confirmed join on the sample code (12.11 feature),
  unchanged. A turned description sheet (variables in rows) can be joined like any description sheet.
- Blocks: a blank or repeated sample header (`CONV-TURN-HEADER-BLANK`, `-REPEATED`); a blank row name
  with values (`CONV-TURN-NAME-BLANK`, with "leave out and list"). Info: `CONV-SHEET-TURNED` (rows, samples).
- Companion file: `turned=<sheet>:<nameHash>:<rows>:<notSampleHashes>` (pre-tick for the same shape).
- Out of scope (later): two header rows forming the key, keys inside headers (`Site1_May`), a taxon spread
  over rank columns, DNA read counts.

**Unchanged.** Detection, the two existing answers and every sheet without `turn`. **Anti-goals:** turning
on detection alone; taking a sample code from anywhere but the header the person pointed at.

**Tests.** `Taxa`: Taxon | S1 | S2 | Total — (*Calanus finmarchicus*, 4, 0, 4), (*Oithona similis*, 1, 2, 3);
`Samples`: Sample | Date | Lat | Lon. Turn with `nameColumn` 0, `notSamples` [Total]: events S1, S2, four
cells read, Total listed; join on Sample lends date and position. A bad count in S2 of row 2 is reported at
source line 3, column C. Repeated header `S1` → REPEATED. Undetected sheet (first column `Family`) can be
turned from the form.

## 10. What changes where (map)

- Core modules are named per item; new: `turn.ts` (8); `ledger.ts` / `notWritten.ts` reasons
  `no-event-date`, `turned-label`; `settings.ts` keys. Worker/page: `convert.protocol.ts`,
  `convert.handler.ts`, `convertModel.ts`, `ConvertPage.tsx` (`chooseForSheet` gains `ownRecords`,
  `oneIndividual`, `dayFirst` / `monthFirst`, `turn`), `ConvertSheetForm.tsx`, `i18n/ui.ts`.
- Rules (tentative names, all in `policy.ts` lists, `docs/rules.md` regenerated, registry test): see items.
- Docs: `docs/APPS.md` §8.3 (kinds), §8.4 (turned only when declared), §8.6 (IDs from source lines),
  §8.8 (eventDate blocks), §8.9 (`georeferenceRemarks`, generated methodSteps).
- Tests that change deliberately: `test/convert/transposed.test.ts`, `quantity.test.ts`, /convert tests
  asserting `META-NO-DATES` or lat/lon `DWC-TERM-EMPTY`, proposal tests for item 5 headers. `/check`: none.

## 11. Order of work (safe first)

1. Item 4 (messages; no archive change) and item 7's `/L` reading.
2. Item 5 (proposal rule), with the golden + corpus diff reviewed header by header.
3. Item 7 kinds (new declarations only).
4. Item 6 (date order), including the six call sites in one change.
5. Item 3 (eventDate block) — before item 2, as the diagnosis advises: a declared position must not
   let an archive without dates through.
6. Item 2 (declared position).
7. Item 1 (own records), after Q1/Q2.
8. Item 8 (turn), the largest; then the real-data acceptance run on the VPS as on 12.11 (before/after,
   harness declarations audited per the diagnosis's harness lessons).

## 12. Questions for Michał

- **Q1.** Specimens with no quantity column under own records: count 1 per row (recommended) or presence?
- **Q2.** Under own records, an answer "keep identical rows as separate records" on `CONV-ROW-COPIES`?
  Recommended: no, the question stays as today in this round.
- **Q3.** Do some samples without a date also block? Recommended: yes, with "leave out and list".
- **Q4.** A declared date or interval for a whole sheet (twin of item 2)? Not proposed here.
- **Q5.** Declared position only for a sheet with no position at all, never to fill gaps? Recommended: yes.
- **Q6.** Declared position not kept in the companion file (a data value): retype after reload, or allow it?
- **Q7.** Item 5: ignore with a note (recommended) or propose `variable` for a `w_PH`-style header?

## 12a. Calls made by the session after the builder check (Michał may overrule)

- **B1. Location of a turned record.** The shared finding type is not changed, so /check and its golden dumps stay as they are. On a turned sheet, sample-level findings give the source column in their params (e.g. "column C") and the header line as the line; only the affected /convert rules carry the column param.
- **B2. A turned description sheet is shown but not joined in this round,** like a long description sheet (CONV-JOIN-DESCRIPTION-LONG pattern). Cell-level join provenance is out of scope.
- **B3 / Q7. Item 5 changes only the taxon proposal.** A header in the new "not a taxon" class behaves like "unknown" for every other caller. Today's header-unit rules still apply: a stated unit is a stated fact, e.g. `Current velocity [m/s]` → a variable. A header with no unit, such as `w_PH`, is ignored with a note and never proposed from its values (Michał's rule of 02.11).
- **B4. Decision 3 scope.** An event needs a date at its own level or at an ancestor level: a profile level or replicate may take the station's or sample's date, as `CONV-PROFILE-LEVEL-INCOMPLETE` already accepts. So profile uploads that export today keep exporting. The block lists every event with no date in its chain.
- **B5. Turned headers that are dates.** The person may declare that the turned header gives both the sample code and the date. The date is never guessed from the header text, and the declaration is explicit.

## 12b. Michał's answers of 13.11 ("wszystko jak rekomendujesz")

- **Q1.** Under own records, a specimen row with no quantity column gets count 1 per row (individualCount 1), not presence only.
- **Q2.** Under own records, CONV-ROW-COPIES gets the answer "keep identical rows as separate records". It is an explicit choice, and the IDs differ by source line.
- **Q3.** Samples without a date block, with the answer "leave out and list": they go to the not-written file with a reason.
- **Q4.** No declared date for a whole sheet in this round.
- **Q5.** A declared position is allowed only for a sheet with no position at all, never to fill gaps.
- **Q6.** The declared position (and its uncertainty) is kept in the companion file. It is the person's own declaration, not a value read from the data.

## 12c. Change of 18.11: a declared date for a sheet with no dates (reverses Q4)

The real-data acceptance (Task 16) showed CONV-EVENT-DATE-MISSING leaves several files with no way out: tunu ×2, which wrote archives before round 3, plus enggano and the inv-* files. On 18.11 Michał delegated the decision to the AI-Wall session, saying "podejmij decyzje", and confirmed its authority directly in this session. The answer is yes, and round 3 ships together with it.

- **Who sets it.** Only the person's typed declaration counts: one ISO 8601 date (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) or an interval `A/B`, with A ≤ B and nothing in the future. It is never prefilled from a file name, a sheet name, metadata or values.
- **Where it applies.** It works only on a sheet where no sample has a readable date. It is refused on a mixed sheet, which keeps Q3's "leave out and list", on a sheet whose dates come from a joined description sheet, and on a turned header date (B5).
- **What the archive says.** Every event carries eventRemarks saying the date was declared for N samples and is not in the source. The methods text gets a line, as for the declared position. CONV-DATE-DECLARED is an accept-level finding, with extra wording for an interval longer than one year, and CONV-DATE-DECLARED-INVALID blocks.
- **Companion file.** The line is `declaredDate=<value>:<rows>:<sheet>`. It is restored only when the sheet name and row count match; otherwise the page shows it as not applied. This extends the Q6 data-value exception.

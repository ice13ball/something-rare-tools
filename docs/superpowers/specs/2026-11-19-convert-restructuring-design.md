# /convert restructuring — design (no code)

Status: proposal for Michal's decision, 19.11.2026. Read once by an independent reviewer (1 high, 8 medium, 3 low findings, all applied). Brief: `~/github/AI-Wall/handoff/HANDOFF-SR-TOOLS-PROJEKT-PRZEROBKI.md`.
Measured on `main` 004e4ea (after round 4 and release 1.1). Every number below was re-measured for this document; the fact files
with their commands and file:line evidence are kept with the job (A: convertPass map, B: declarations, C: reader, D: git payback, E: texts) and their
findings are restated here so this document stands alone.

## 1. Why, in numbers

| what | today |
|---|---|
| `convertPass()` (`src/core/convert/build.ts:1978-3930`) | 1953 lines; its per-sheet loop 1283; the row loop inside it 605 |
| `build.ts` | 3931 lines; convert core 51 files, 16 632 lines |
| other functions over 300 lines in `src/core/convert` | `mergeSampleSheets` 655, `buildSheetLedger` 570, `proposeConvertColumns` 524, `analyseRepeats` 393, `readProfileSheet` 320 |
| passes | `convert()` runs `convertPass()` 1, 2 or 3 times; every pass recomputes everything |
| shared mutable locals inside `convertPass` | 24 accumulators; `findings` written at 111 sites and replaced wholesale 4 times |
| companion-file keys | 35 fields (41 constants), parsed by one 33-branch `else if` chain and written by a parallel one |
| a new declaration (median of the last three: count-text, summary rows, missing code) | 4 commits, 27 files, +488 production lines, +733 test lines, 5-7 layers |
| a new rule without an answer (median of the last three) | 3 commits, 15 files, +149 production lines, no worker/page/companion |
| texts | 142 converter rules × 4 languages + 1279 UI keys × 4; a missing language is caught only by `tsc`, which `vitest` does not run |

The cost Michal measured (838M tokens, 14 of 16 round-4 tasks with fix rounds) follows from two of these: every task reads into one
1953-line function with 24 shared accumulators, and every declaration crosses 5-7 hand-written layers where the bugs of round 4 sat.

## 2. Targets and what proves each step

Targets (from the brief): no function over ~300 lines in `src/core/convert`; a new declaration touches at most two files plus texts;
behaviour unchanged; `/check` unchanged.

**Proof per step (the gate before the next step starts):**
1. **Capture-and-replay snapshot, new in step 0.** The golden pipeline never calls `convert()`, and the converter fixtures are bare
   CSVs with no answers, so a snapshot of fixtures alone would never run pass 2, pass 3, joins, turns, leave-outs or any declaration's
   apply site (independent review, F1). Step 0 therefore wraps `convert()` in a vitest setup file that records every `ConvertInput` the
   existing suite passes to it (113 converter test files build answers inline), and replays each input against the recorded
   `ConvertResult`. Named cases are added for paths the suite may miss: a stale per-text answer, a stale column answer, a no-event-date
   leave-out where two sheets share an eventID, occurrenceIDs repeated across sheets, the same taxon twice in a wide sheet, profile plus
   biology, a join, a turn and a pivot. Arrays (findings, occurrences, events, measurements, ledger) are compared **in order**, never
   sorted. The worker's archive bytes are compared for a representative set, after checking that they are deterministic (zip times, dates).
   This is stricter than the golden set, which sees only `/check`-style findings.
1b. **Companion-file round trip (for any step that touches worker, page or settings, i.e. step 6).** Snapshot `writeConvertSidecar` output
   for every page state built in `test/app`, and read → write → read every companion file used in the tests; the pre-pick, staleness and
   invalidation paths of the worker are invisible to the result snapshot.
2. Golden set byte for byte (`deploy.sh`, `GOLDEN_DIR`).
3. VPS real-data run (27 result files, join corpus) with zero differences against the previous production archive bytes.
4. The full vitest suite plus `tsc` pass with **no existing test file edited** (in particular `policy-baseline`, `policy-coverage`, the
   rule registry and rule-docs tests).
5. The pass counter (`passCounter`, test `count-texts.test.ts:213-221`) unchanged for every replayed input
   (no step in this design changes the number of passes).
A step whose diff needs any of 1-4 to be updated is not a refactor and goes back to Michal as a behaviour change.

**How to use the convert replay gate.** Recordings live in the git-ignored `convert-recordings/`; never commit them. On the base commit run
`CONVERT_RECORD=convert-recordings/base npm run convert:record` (records every `convert()` call of the suite, then marks the calls that depend on test mocks).
On the head commit run `CONVERT_REPLAY_BASE=convert-recordings/base npm run convert:replay`; it must report 0 differences and exit 0. Two recordings of the
same commit are byte-identical (`diff -rq`), so any difference is a behaviour change. Coverage: `CONVERT_REPLAY_COVERAGE=convert-recordings/base npx vitest run --config vitest.convert-replay.config.ts`.
Known gaps: see the step-0 report (no recorded sheet holds both summary and kept-summary findings; 6 mock-dependent calls are skipped).

## 3. Stages of convertPass (question 1)

### 3.1 What is there (phases as they appear in the code)

P0 prepare inputs (1980-2024) · P1 24 accumulators (2025-2058) · P2 sheet-level pre-checks (2063-2131) · **P3 per-sheet loop (2133-3415)**:
P3a sheet setup, P3b collectors, P3c whole-sheet analysis before rows (repeats, copies, visits), P3d row loop, P3e key report + sheet ledger,
P3f sheet findings · P4 profile sheets (3418-3465) · P5 declared dates (3468, mutates sample dates) · P6 event tree + undated sheets (3471-3491) ·
P7 ledger finalisation (3493-3549) · P8 identifier checks (3554-3695) · P9 WoRMS (3698-3779, mutates occurrences in place) ·
P10 same-taxon/station/no-occurrence checks (3787-3837) · P11 whole-list line rewrites of `findings` (3841-3864) · P12 dedupe, ordering,
`decideRows` (3868-3898) · P13 result.

### 3.2 Proposed stages

| stage | from | input (explicit) | output (explicit) | must not know |
|---|---|---|---|---|
| S0 `prepareSheets` | P0, P2 | request, parsed file | `PreparedSheet[]` (stable sheet identity, applied missing codes, pivot/turn/transposed state), pre-findings, not-read ledger entries | rows of other sheets |
| S1 `planSheet` | P3a-P3c | one `PreparedSheet`, options, `undatedLeftOut` for this sheet | `SheetPlan` (columns, specs, key, quantity, collectors config, repeat/copy/visit analysis, line sets) | samples, other sheets |
| S2 `readRows` | P3d | `SheetPlan`, `SampleRegistry` (samples made by earlier sheets, read-only view + an add method) | `SheetRows` (sample contributions, occurrences, measurements, fates, text tally, counters) | findings of other stages |
| S3 `sheetReport` | P3e-P3f | `SheetPlan`, `SheetRows` | sheet ledger, key report, sheet findings, station sheet entries | events, WoRMS |
| S4 `readProfiles` | P4 | profile sheets, `SampleRegistry` (bio stations) | profile sites, level dups, profile ledger and findings — returned, not pushed into aliased arrays | — |
| S5 `buildEvents` | P5-P6 | samples, profile sites, declared dates | events, tree, `undated` | rows |
| S6 `finishLedger` | P7 | sheet ledgers, joins, missing-code cells | ledger | findings |
| S7 `checkIdentifiers` | P8 | events, profile, occurrence registry, repeat line sets | findings, hidden ids | rows |
| S8 `applyNames` | P9-P10 | occurrences, WoRMS answers, station sheets | occurrences with IDs, name lookup, findings | — |
| S9 `finishFindings` | P11-P12 | all findings, pivot/turn/join line maps, ledger | final findings, leftOut decision | — |

`convertPass` becomes a ~80-line sequence of these calls. Each stage is a module of its own under `src/core/convert/pass/` with a typed
input and output; the accumulators of P1 become fields of the outputs that own them. Target: no stage function over 300 lines; S2
needs its own split (section 3.4).

### 3.3 The three passes — do they survive?

- **Pass 2 survives.** The row loop (S2) skips undated rows the person chose to leave out, but which rows are undated is known only after
  the event tree (S5): a sample made of replicates takes their date span, a declared date is applied to samples, and sample identities are
  made by the row loop itself (including merges across sheets). This is a real dependency of an earlier stage on a later one, not an
  accident of the code. The split makes it explicit: `convert()` runs S0-S9, reads `undated`, and runs again with `undatedLeftOut`.
  Cost stays: on such files every stage runs twice.
- **Pass 3 stays; removing it is not proposed.** It runs only when a saved count-text answer went stale (build.ts:1969-1973,
  `countTextsHolding` 782-792); with no answers, or answers that hold, there is no third pass today. The tally is independent of the
  answers (increment at 2847-2848 before the only read at 2849-2851), but the answer then decides everything from 2858 to 3091: the
  leave-out or absence path, occurrence emission and its position in `occurrences`, first-seen registration for repeated
  occurrenceIDs, `refOf`, the fate and the measurements on the occurrence. Applying answers in a later sweep would append those records
  after the sheet's others and change archive row order and which line is "first". The gain (one pass on stale answers) does not pay
  for that risk.
- **Known existing gap, unchanged by the split:** pass 2 is not iterated to a fixed point. Leaving out sheet A's undated rows (2495) runs
  before sample creation and the duplicate-event check (2600-2613), so it can free an eventID that sheet B's rows then turn into new,
  possibly undated, samples; no further pass follows (1966-1972). Read, not run.

### 3.4 The row loop (S2)

605 lines of per-row fate decisions (ragged, no-event-date, summary, no-taxon, quantity-blank, no-code, no-replicate, duplicate-event,
repeat/copy) followed by accumulation. Proposal: an ordered list of `rowGate(row, plan, registry) → fate | undefined` functions (one per
fate, in today's order) and three emitters (sample, occurrence, measurement). The order of the gates is the behaviour; it is kept as an
array literal so it is visible in one place. The gates are not pure: side effects sit between them and fire for rows a later gate drops
(taxon counters 2511-2512 before the summary and no-taxon gates; `summaries.add` 2521 and kept stats 2527; blank-key, station rows and
text checks 2571-2577 before the no-replicate gate 2583; `noteId` 2590 before duplicate-event 2600-2613), and values computed early
(parsed numbers, code, station text, event id) are used later. So the gates take a mutable `RowContext` plus the collectors and every side
effect keeps its position; if that reads worse than today, the prefix of the loop stays one function and only the emitters are extracted.

### 3.5 What gets harder

- Debugging moves from one function with local variables to a chain of stage outputs. Mitigation: each stage output is a plain object
  that the snapshot test can print.
- **Object identity is load-bearing (constraint for every step):** `refOf` is a Map keyed by the occurrence object (2046, set 3091, read
  3792) and `FateLog.from` keys origins by the record object (ledger.ts:137-139); a cloned occurrence silently loses its wide column
  name. No `OccRec` or measurement intent may be copied before P10. In-place mutations stay where they are and are only named in the
  stage signatures: P5 sets sample dates, P9 writes WoRMS IDs into occurrences (the ledger reads only `quantityText` and
  `measurementValue`, eagerly at P3e, ledger.ts:590-592, so P9 cannot reach it), P11 replaces `findings` wholesale.
- **Cross-sheet state the stage contracts must carry:** S2 reads and writes the occurrence-ID registry (`firstOcc`/`repeatedOcc`,
  3082-3090), `dups` (2606-2611, mutated again by P8 at 3583-3593) and `refOf`; S3 reads the global sample map filtered by sheet key
  (3388, 3400) and the occurrence slice of its sheet (3281, 3390). These are inputs and outputs of the stages, not hidden globals.
- **Sheet identity:** `rawInput.sheets.indexOf(sin)` is used at 2009, 2016, 2020, 2153, 2250, 3122 and 3430, and `convert()` maps text
  tallies by that index (1969). A `PreparedSheet` wrapper must carry `inputIndex` and all those sites change in the same step; a wrapper
  that returns -1 would make every count-text answer stale.
- The domain does not shrink: 263 rules, four languages, 35 companion keys. The restructuring changes where code lives, not how much
  the domain asks for.

## 4. Declarations as data (question 2)

### 4.1 What a declaration is today

A declaration has no single home. It is a page choice (`SheetChoice`), or a worker field (`Held.turns`, decimals, encoding), or — for 7
keys — an acknowledgement rebuilt from findings at download (`ConvertPage.tsx:1236-1262`, 17 `...SettingsOf` builders). (ownRecords is the exception: it is a page choice; dayMonthOrder, yyOrder, missingCode, summaryRows, countText and countTextColumn are
rebuilt from the findings the person answered, `said`, `ConvertPage.tsx:1244-1250`.) The companion
file is parsed by one `else if` chain (`settings.ts:297-418`) and written by another (`428-475`). "Does the saved answer still hold"
(row count, column hashes) is re-implemented per key in the worker (`convert.handler.ts:140-206`, `declarationOf` 284); re-read
invalidation exists by hand for turns, decimals and `describes` choices only (456-490), plus `forgetSheet` and join dropping in the page.

### 4.2 The descriptor

```ts
interface DeclarationSpec<T> {
  key: string;                       // companion-file key, unchanged names so old files still load
  scope: 'file' | 'sheet' | 'column';
  parse(value: string): T | undefined;          // one place, replaces one else-if branch
  write(v: T): string;                           // replaces one writer branch
  holds?(v: T, sheet: SheetFacts): boolean;      // rows + hashes check, shared helpers
  invalidatedBy?: Array<'reread' | 'turn' | 'decimal' | 'pivot'>;
  fromPage?(state: PageState, sheet: string): T | undefined;   // replaces one ...SettingsOf builder
  request: keyof ConvertSheetInput | keyof ConvertOptions;      // where the worker puts it
  answers?: { ruleId: string; options: string[] };              // when the question is a finding with answer buttons
  texts: string[];                                              // UI keys the test checks exist in all languages
}
```

A registry `DECLARATIONS: DeclarationSpec<unknown>[]` drives: reading and writing the companion file, merging several companion files,
the worker's pre-pick and staleness check, invalidation on re-read/turn, the download builder, and a text-completeness test. The
**core apply site stays hand-written**: what an answer means for rows is domain logic and belongs in the stage that uses it.

### 4.3 Fits and misfits

Counted per key first, then per declaration, because several declarations span several keys (realCounts + realCountsRows; dropCopies +
dropCopiesRows + keepCopiesRows; totalOnce + totalOnceGroups; countText + countTextColumn with a cross-key stale rule at build.ts:2851;
sampleJoin + sampleJoinNo). A spec therefore owns a list of keys, not one. The acknowledgement shapes differ (ownRecords `{sheet,rows}`,
leaveOut adds a reason, summaryRows an answer; settings.ts:165-191), so "acknowledgement" is a family of small specs, not one generic
shape. Invalidation is not an enum: a decimal answer survives a re-read when its column is still asked and its header unchanged, a turn is
dropped only when it came from a file and its header changed, a width change drops turns, decimals and `describes` choices
(convert.handler.ts:456-490). So `invalidate(before, after)` is a per-spec function. **That is the escape hatch, and it is used by every
hash- or index-bound spec.**

| class | n | plumbing fits the descriptor | apply in core |
|---|---|---|---|
| simple flags and name lists, biomassBasis | 14 | yes | hand-written (one site each) |
| typed values (declaredDate, declaredPosition) | 2 | yes; page input form stays hand-written | hand-written |
| acknowledgements of a finding with a count (realCountsRows, dropCopiesRows, keepCopiesRows, totalOnceGroups, leaveOut, ownRecords, summaryRows) | 7 | yes, one generic `{ruleId, sheet, count, rows}` kind | hand-written |
| hash- or index-bound (sampleKey, dayMonthOrder, yyOrder, decimalReading, missingCode, countText, countTextColumn, encoding) | 8 | yes, with a shared `holds` helper | hand-written |
| turned | 1 | parse/write only; it renumbers columns for every other key, so its invalidation of the others stays hand-written | hand-written (before role proposal) |
| sampleJoin, sampleJoinNo | 2 | parse/write only; joins name sheets and columns of two files | hand-written |
| perOccurrence | 1 | yes | hand-written |

Fit, restated: the parse/write/merge part fits all 35 keys; the staleness and invalidation part fits as a per-spec function, which is
hand-written for the 8 hash-bound keys, turned and the joins (11 of 35). The apply site is outside the registry by design.

### 4.4 Worked: declaredDate (simple)

Today ~9 hand-written places in 8 source files: form (`ConvertSheetForm.tsx:80-91, 449-468`), page handler (`ConvertPage.tsx:449,
511-531`), `SheetChoice` + request (`convertModel.ts:125-145, 397-400, 451-456`), prefill (`726-731`), protocol (`~139-169`), worker merge
(`convert.handler.ts:170-206, 578-580, 630`), core (`build.ts:271-340`, `declaredDate.ts`), download builder (`convertModel.ts:858-868`,
`ConvertPage.tsx:1253`), companion read/write (`settings.ts:283, 297-418, 428-475`).
Under the registry: one `DeclarationSpec` entry (parse = today's `DECLARED_DATE_SHAPE`, write, `holds` = row count, `fromPage`,
`request: 'declaredDate'`, texts) + the unchanged core (`declaredDate.ts`, `applyDeclaredDates` in S5) + the form input (typed value, stays).
Files: spec + core + form = 3 plus texts, plus the rule registry for its findings. The brief's target of "two files plus texts" is
**not met** by any real declaration: answer-button declarations also touch the rule registry (`src/core/rules/convert.ts`), the ledger or
`notWritten.ts` reasons and the policy baseline tests (as in 207a490, 02b9f02). The realistic floor is about 5 files.

### 4.5 Worked: turned (awkward)

Today: 35 source files mention turn symbols (upper bound, the pattern also matches "turned"). It lives in the worker, is applied before
role proposal, and renumbers every column index; stale answers are cleaned in three separate places (`convert.handler.ts:469-485`,
`forgetSheet` in the page, join dropping `ConvertPage.tsx:718`).
Under the registry: parse/write/`holds` move into its spec (the `TURNED` regex `settings.ts:273` and `declarationOf` 284-291). The
renumbering stays hand-written. What the registry adds: every spec that stores an index or a hash declares `invalidatedBy: ['turn']`,
and the one invalidation routine walks the registry instead of three hand-written cleanups. That removes one class of bug (an answer
surviving a turn it no longer fits) without pretending the turn is data.

## 5. One reader (question 3)

After round 4, dates (`parseDate`) and numbers (`parseNumber`) each have one implementation shared by `/check` and `/convert`; the
row date of `/convert` goes through `metaParser` (`dataset.ts:458`), the same code as `/check`. Two duplications remain:
- **date parts and year:** 4 readers with 2 month-name tables (example read from the code, not run: "Mrz" is March in `stated.ts`, nothing
  in `dateParts.ts`);
- **summary words:** 4 lists for rows and 4 for headers (example, read: a station named "Somme" is a sum on `/convert` and not on `/check`).

Home: `src/core/values/` (where `parseDate`/`parseNumber` live). `/licence` and `/collection` do not read cells; their only link is an import
path through `fixlist.ts → output/csv.ts → dataset.ts`.

Two steps, deliberately separate:
- **move (refactor):** one module exports the month tables and word lists; each caller keeps its own list explicitly
  (`SUMMARY_WORDS.convertRows`, `.checkRows`, ...). Behaviour identical; proven by the snapshot and golden.
- **unify (behaviour change):** merging the lists changes what `/check` and `/convert` report (the "Somme" and "Mrz" cases). That is a
  decision for Michal with a golden diff, not part of the restructuring.

## 6. Texts (question 4)

Today a missing language text is caught by `tsc` (`Record<UiKey,string>`, `Record<Lang,string>`) only in `npm run typecheck`
(`deploy.sh:40`), not by `vitest`; at run time the page falls back silently to English, then to the key. Not covered at all: `plainIf`
texts (31) never render in the generic loop, so they can be empty or keep a raw placeholder; plural tokens `{+n:a|b|c}` are invisible to the
placeholder checks; the 49 `PROFILE_VARIANTS` have no placeholder check and no reachability test; 23 computed `as UiKey` sites are covered
only where a family test exists. One round-4 declaration (summary rows) needed 43 text items in 4 files.

Proposal (one task, independent of everything else): `test/convert/texts-complete.test.ts` walks `CONVERT_RULES` (plain and `plainIf`),
`PROFILE_VARIANTS` and `UI`; per language it asserts present, non-empty, the same `{name}` placeholders and plural tokens as English, 2 plural
forms (3 for Polish), and that every placeholder is a declared param. Add `tsc --noEmit` to `npm test` so a missing key fails the
normal test run, not only the deploy. With the registry (section 4), the test also walks `DeclarationSpec.texts`. The writing itself
stays hand work: four languages per sentence is the domain.

## 7. Order and size (question 5)

Each step ships alone, passes the gate of section 2, and leaves the tree releasable. Sizes are in tasks of the round-4 kind (one implementer,
one review).

| step | what | tasks | unlocks |
|---|---|---|---|
| 0 | capture-and-replay snapshot of every `convert()` input in the suite + named cases + archive bytes; `texts-complete` test; `tsc` in `npm test` | 2 | proves every later step |
| 1 | extract S5-S9 (after the sheet loop) into stage functions, mutations kept and named | 2 | `convertPass` loses ~460 lines; findings post-processing testable alone |
| 2 | extract S0 and S4 (profiles return instead of aliasing arrays) | 1 | sheet identity explicit |
| 3 | split the sheet loop into S1 / S2 / S3 with `SheetPlan`, `SheetRows`, `SampleRegistry` | 2 | per-sheet code readable in isolation |
| 4 | row gates + emitters inside S2 | 2 | the 605-line loop goes |
| 5 | the other functions over 300 lines (`mergeSampleSheets`, `buildSheetLedger`, `proposeConvertColumns`, `analyseRepeats`, `readProfileSheet`) | 4 | target "no function over ~300 lines" met |
| 6 | declaration registry for the plumbing, in three batches (simple + acknowledgements; hash-bound; turned/joins/invalidation) | 4 | a declaration touches about 5 files instead of 12-18 (the brief's two-file target is not reachable) |
| 7 | reader: move date-part tables and summary lists into `src/core/values` (no unification) | 1 | one place to decide the unification |
| 8 | build the export tables once (validate and archive share them; today `validateTables` builds them a second time, validate.ts:154) | 1 | export time |

- **Smallest version worth doing: steps 0-4, 9 tasks.** `convertPass` becomes a sequence of stages; no function in it over 300 lines.
  Declarations still cross the same layers.
- **With step 5: 13 tasks** — the line-count target met everywhere in `src/core/convert`.
- **Full version: steps 0-8, 19 tasks.** (Removing pass 3 was considered and dropped, section 3.3.)
- Steps 6 and 7 do not depend on 1-5 and could go first; they are ordered after because the snapshot of step 0 is their safety net too
  and because each later round adds fewer declarations than rules (section 8).

## 8. Payback (question 6)

From git (fix rounds included), the last three declarations:

| declaration | prod lines added | of which worker + page + companion | files src/test |
|---|---|---|---|
| count-text answer | 717 | 440 (61%) | 10/15 |
| summary rows | 282 | 113 (40%) | 12/13 |
| missing code | 488 | 137 (28%) | 18/9 |

Estimate under the full version (steps 0-8), **upper bounds**: worker, companion and download plumbing become one `DeclarationSpec` entry of ~30-50 lines;
an answer given by buttons on a finding uses the generic answer component (no page code beyond texts). Core and rule/text lines stay.
- count-text: 717 → about 330 (−55%), files 10 → about 5;
- summary rows: 282 → about 210 (−25%), files 12 → about 5;
- missing code: 488 → about 390 (−20%), files 18 → about 7 (its core part is large and stays).
These are upper bounds: they assume the worker, page and companion lines vanish except a ~30-50-line spec, but per-text answer UI alone
was 141 page lines in 4e415a0 and needs a generic answer component that does not exist yet (its first use pays its own cost); the rule
registry, ledger reasons and tests stay.

**Cost and break-even of what is recommended (steps 0-4) — uncertain.** The measured 838M tokens and 164 subagents cover ALL tools work
from 12.11 to 19.11 (rounds 2-4, reviews, real-data runs, release work), not round 4 alone; the round-4 ledger no longer exists, so a
per-task cost of round 4 cannot be computed from it. As an order of magnitude only: if a round-4-style task with its review and fix rounds
cost 20-50M tokens, steps 0-4 cost about 180-450M. The split itself does not reduce production lines; it pays back only through cheaper
later tasks. Break-even condition: the first round after step 4 must cost clearly less per task than the rounds before it (fewer turns
reading a 1953-line function, fewer fix rounds); this is measurable with `pomiar-subagentow.py` on that round. If it shows no drop,
steps 5-8 should not follow.

**Decision of 19.11 (Michal):** only step 0 now; steps 1-4 wait for a real need of the next round; steps 5-8 undecided. Stop criterion
for /convert: a new round only when a real user's file fails because of the tool.

The last three rules without an answer (median 149 production lines, 15 files, no worker/page/companion) gain nothing from the registry;
they gain only from the split (an agent reads a 300-line stage instead of a 1953-line function). That gain is in agent turns and review
rounds, which this document cannot measure in advance; it can be measured on the first round after step 4 against the round-4 ledger
(14 of 16 tasks with fix rounds).

Count-text was redesigned twice inside round 4 (4 of its 7 commits, 225 lines, 31% of its additions). No structure prevents a design
change; the registry makes each change touch fewer files.

## 9. Recommendation

Do the **smallest version (steps 0-4, 9 tasks)** now, **but only with step 0's capture-and-replay gate in place first** (without it the
gate would pass behaviour changes in passes 2-3 and in every declaration path). Step 0 also brings the `texts-complete` test and `tsc` in
`npm test`, which are cheap and catch a class of silent errors today. Decide on steps 5-9 after measuring the first round that runs on the split code: if fix rounds and
agent turns per task drop, continue with step 6 (the registry) before the next round that adds declarations; if they do not, stop there.
Do not start with the registry: it pays back only on declarations (3 in the last round), and its worked cases show that the awkward ones
(turn, joins) keep most of their hand-written code, and no declaration gets below about 5 files.

What this does not fix: the domain's 263 rules and four languages, the two real passes, the design churn of a new declaration, and the
cost of review, which stays per task.

## 10. Out of scope

`/licence` and `/collection` (except the import path in section 5); any behaviour change, including unifying the reader's word lists;
new rules or declarations.

# Round 4: the shared file reader and the export policy

Date: 18.11.2026. Owner: Michał (approved the order "round 3 → round 4 reader and policy → /licence → split `convert()`" on 18.11: "tak, użyj agentów do naprawy").
Source: the logic audit of 18.11 (`$CLAUDE_JOB_DIR/tmp/audit-logic-2026-11-18.md`, IDs R*, K*, V* below), run on production e69d037. Base of this branch: round 3 (`convert-round3`); rebased onto main once round 3 is merged.

## 1. Why

The audit found that the most harmful defects are not in the rules but in the reader shared by /check and /convert. It settles things a file cannot settle (encoding, thousands vs decimal comma, `NN-NN-NN` order, an Excel percent) and reports them as info. In /convert the export policy is a set of hand-kept lists: a rule nobody listed is show-only, so a leave-out can happen without the person's answer (rows of a station named "Somme" are skipped with an info line).

This breaks Michał's first principle: these are scientific data; nothing is dropped, changed or guessed silently; every leave-out is the person's explicit choice and is listed.

## 2. Goals

1. Every value the reader cannot read unambiguously is either asked (/convert: blocks until the person declares) or reported with both readings (/check: a warning, not info).
2. The export policy of every rule is a field of the rule's definition, and a test fails when a rule emitted at a row/cell leave-out, a default, or a reader guess is show-only.
3. The two silent cases on /check (K1, K2) leave a trace.
4. No row of /convert is skipped by a word in it without the person's answer (V1); a word meaning absence in a count column is never written as a presence (V3).

## 3. Non-goals

- /licence findings (L1–L6): the next round.
- Splitting `convert()` and one cell-reading module: after this round.
- V5 (replicate level), V6 (quantity kind vs unit), K3–K7, R7, R8, C1: parked, listed in the ledger.
- No new heuristic that sets a column role from values (declare-first, 02.11).

## 4. Decisions (my calls, Michał may overrule)

| ID | Today | After |
|---|---|---|
| R1 | In a `;`/tab file whose decimal cells are ≥80 % `n,n`, `1,250` is 1.25 (correct for decimal-comma locales). Ambiguous only when every comma value in a column has exactly three digits after the comma. | That column is ambiguous: /check warns with both readings (`1.25` / `1250`); /convert blocks until the person declares, per column, "decimal comma" or "thousands separator"; the declaration is kept in the companion file (header hash, like `dayMonthOrder`). Columns with any value of 1, 2 or ≥4 decimals are not asked. |
| R2 | Non-UTF-8 is read only as windows-1250 / ISO-8859-2. | UTF-16 with a BOM, or with the NUL pattern of UTF-16LE/BE, is decoded as UTF-16 (deterministic). For 8-bit files: if the bytes present decode differently under windows-1250 and windows-1252, /check warns and shows a few words in both; /convert blocks until the person picks the encoding (both samples shown). If the bytes decode the same, no question. Kept in the companion file (file hash). |
| R3 | `NN-NN-NN` is always year-month-day. | Ambiguous unless a value rules a reading out (a part > 31 or > 12 in the right place). /check: warning with both readings. /convert: the column needs the date-order declaration of round 3, extended with `ymd` for two-digit years; undecided → blocks (round 3's eventDate rule). |
| R4 | An Excel percent-formatted cell is read as the stored fraction (95 % → 0.95). | Verify with SheetJS first. If confirmed: a numeric cell whose number format contains `%` is read as displayed (×100) and a note says so per column (info on /check, shown on /convert) — reading what the person sees is not a guess. |
| R5 | A plain number in a mostly-date column is read as an Excel serial date. | Read only cells formatted as dates as dates; a plain number in a date column is a finding (unreadable date) with lines. |
| R6 | XLSX cells right of the last named header cell are dropped silently. | Same as CSV `ROW-RAGGED`: a finding with lines; /convert blocks as it does for CSV. |
| K1 | Long format: a row with a blank parameter name is skipped with no trace. | A finding with the lines (warning on /check); in /convert the ledger reason and the leave-out is the person's answer. Merged cells: the value of a merged parameter cell applies to every row of the merge (SheetJS `!merges`), if verified. |
| K2 | The first negative depth in the sample flips the whole column, and the range check runs on the flipped values. | Direction is decided only when all non-zero values share a sign. Mixed signs → a finding naming both counts, and the range check runs on absolute values. The exact codes −99, −999, −9999 in a depth or measurement column are a finding "possible missing-value code" with lines and are left out of the direction and range decisions; they are never rewritten. |
| V1 | A row whose station/sample cell is exactly Total/Suma/Razem/Summe/Gesamt/Somme is skipped with an info line. | The rows are listed and blocking; the person answers "leave them out (summary rows)" or "keep (a real station)". Statistic rows (already a CONV-SUMMARY-ROW-KEPT/-SKIPPED path) follow the same rule. |
| V2/V8 | `policy.ts` lists; unlisted is show-only below error. | Every rule definition carries `exportPolicy: 'block' \| 'accept' \| 'show'` (for /convert); `policy.ts` reads it. A test enumerates the rules emitted at a leave-out, a default value, or a reader decision and fails if any is `show`. Reader guesses (IN-DECIMAL-COMMA, IN-ENCODING-FALLBACK, ROW-DATE-YYMMDD …) become `accept` or `block` per the rows above. The current lists are the starting values: no rule changes policy by accident. |
| V3 | Any text in a count column → an occurrence "present" with the text in remarks; one acceptance covers all texts. | Words the presence-only mode already reads as absence (absent, nie, nein, non, …) are never written as present: the cells are listed per word and block; the person answers per word "absence", "leave out", or "present, text to remarks". |
| V4 | Tips in four languages and a comment in `ids.ts` say a sample ID is never built from depth; the code builds `<station>:<date>[:<depth>m]:<code>` for a repeated code. | The texts say what the code does and the archive's companion says it per sheet. No behaviour change. |

## 5. Constraints

- /check golden output changes only where these decisions change it; every golden diff is listed and explained in the task report (an intended change, not a regression).
- Rule texts in en/pl/de/fr; Polish plurals via the `{+count:one|few|many}` tokens; no deletion wording (test/rules/noDeleteAdvice).
- New rule ids bump both rule-count pins (test/convert/rules.test.ts, test/rules/registry.test.ts); docs/rules.md regenerated.
- The companion file holds no data values: declarations are keyed by header hash or file hash.
- Unit tests use invented data only. Acceptance on the VPS real corpus (`/home/ice13ball/tools-regression`), as in rounds 2–3; nothing heavy on the Mac.

## 6. Acceptance

- Both corpora on the VPS, base (main after round 3) vs new, no new declarations: every difference is one of section 4, per file.
- Golden on the Mac with GOLDEN_DIR: diffs only from section 4, listed.
- Report to Michał before deploy.

## 7. Rulings after the plan was written (18.11)

The plan writer checked the spec against this branch's code and SheetJS 0.20.3. Rulings:

- **R4 confirmed**: SheetJS keeps 0.95 in `.v`; `.w` is ×100 and rounded. Read `.v` and move the decimal point; never use `.w`.
- **K1 on /convert already holds** (round 3 blocks a long row with no parameter name, with leave-out). Only /check and the merged parameter cell remain.
- **R6 changed**: in a workbook, cells right of the last named header cell are an **unnamed column** ("column G, no header"), not a ragged row. /check reports it with lines; on /convert it is not exported until the person gives it a role or says ignore, and it is listed like any column not exported. Nothing in the row is lost.
- **R2 widened**: compare every 8-bit candidate the reader uses (windows-1250, ISO-8859-2, windows-1252). Ask only when they decode the bytes present differently; then show the differing words in each.
- **V2/V8 principle for "accept" vs "show"**: an outcome that follows from the person's own explicit answer (a column they set to ignore, rows they chose to leave out) is `show`; an outcome that follows from a tool default or a reader decision (a proposed ignore not touched, zeros skipped by default, a decimal comma read by the reader) is `accept`. The plan's list of rules moving from show to accept is ruled per this line; the list goes to Michał in the round's report.
- **V3 widened**: every distinct text in a count column is listed, grouped by text, and answered per text: "absence", "leave out" or "presence, text to remarks". No text is preselected; absence words are not a guess the tool makes.
- **V4**: the IDs do not change. The note on how a repeated code's ID is built goes where round 3 states the own-records ID rule, and the tips text is corrected.
- **R3**: the century of a two-digit year stays a one-time acceptance per column.

## 8. Rulings made while executing (from the SDD ledger)

Each line gives what was decided, why, and what it costs if wrong.

- accept-level rules that follow from the person's own answer (CONV-ROW-COPIES-DROPPED/-KEPT, CONV-QUANTITY-REPEATED-ONCE, CONV-OWN-RECORDS, CONV-POSITION-DECLARED, CONV-QUANTITY-REAL-COUNTS) stay accept this round — no regression risk; a redundant click at worst — revisit with Michał.
- CONV-SEAFLOOR-SIGNS accept for both sources — the converter cannot tell who set the direction — cost: one click when the person set it.
- V3 gets a per-column "same answer for every text" control, not preselected; "absence" stays offered for every text (the person's call) — cost if wrong: one more control.
- R2 asking about most legacy Polish files is accepted (1250 vs ISO-8859-2 truly differ on ą ś ź); the acceptance run counts how often — cost: one click per such file.
- rule-count pins are relative — the plan assumed converter 133 / other 112; main has converter 136 (CONV-DATE-DECLARED, -INVALID, -HELD) / other 112. Each task bumps from the value it finds — cost: none.
- minors parked except M1 (policy.ts header sentence: policy follows the rule, not the finding's severity) → carried into Task 2.
- CONV-QUANTITY-REAL-COUNTS stays show (it is show today; the earlier ruling list was wrong to call it accept) — cost: none.
- join-appended description columns set to ignore by the tool count as proposed (accept) — the tool chose them — cost: one acceptance.
- CONV-TAXON-ATTRIBUTE-IGNORED excludes the person's columns instead of a split — CONV-COLUMN-IGNORED already names them — cost: none.
- I3 — drop the "set ignore yourself" clause in all four languages; accepting the finding IS the person's answer — cost: none.
- I4 — columns named by YEAR/NUMBER/TAXON-ATTRIBUTE findings go to `taken`, so they are not listed twice — cost: none.
- minors 1, 2, 4, 5 fixed in the same round; proposal caching in Held parked (perf only).
- R3 "one acceptance per column" → carried to Task 7: the export gate accepts per rule; the ROW-DATE-YYMMDD text must say one acceptance covers the columns it names (each named) — cost: none.
- only '1.250,5' settles; a comma-thousands cell keeps the question and is named in it (thousandsSeen) — cost: one question where the answer is clear. Fix round 2 → same implementer.
- a column the person confirmed at the old proposal counts as untouched and may take the new proposal after the answer — its cells read differently now — cost: one re-check by the person, visible on the page.
- M3 (strict NUL rule misses some BOM-less UTF-16) accepted — not a regression, brief-mandated — cost: such files behave as before.
- the golden expected.json update is held to the deploy step and done by a targeted scripted replacement of that one expectation (no reading of data by hand), with the AI-Wall session (Michał's authority) told first because the golden set holds IO PAN files — cost: deploy waits for that one message.
- a column holds two independent answers — slash order (round 3 dayMonthOrder dmy|mdy) and two-digit order (new slot ymd|dmy|mdy) — each checked only against its own cells; Task 8 wires both on the page and in the companion — cost: one more field.
- ROW-DATE-UNPARSEABLE keeps no leave-out answer (unchanged behaviour; the person fixes the cell) — cost: an edit of the file for such rows; candidate for a later round. Task 10: complete (46db564..ac1cc9c)
- a missing-value code must not reach the archive as a depth/value after one acceptance. In /convert ROW-MISSING-CODE blocks, with an answer "treat as missing" (cells not written, listed in the not-written ledger) — fix round after the investigation — cost: one more question for files with codes.
- crossfile compares open-direction datasets on absolute depth (same as rows.ts range rule); cross-file date conflict notes YY ambiguity; + /convert missing-code block with 'treat as missing' answer → Task 13 fix round 1.
- two answers (missing | real), none preselected, both in the companion — cost: none. Pins for Tasks 14/16 relative (conv now 140). Fix round 2 → same implementer.
- 'absence' follows the existing zero path (absent + individualCount 0 with the full-list tick; otherwise not written as zero, listed) — consistent with how 0 is written — cost: none.
- I1 — store count-text answers per column (hash + column index), and a column-wide answer as a column line; reload applies each only to its column — cost: none. I2 — widen the scan to dataset.ts, checks/rows.ts, convert/pivot.ts, convert/dateOrder.ts; ROW-LONG-PARAMETER-MERGED → accept (a reader decision: the tool fills a merged value into rows) — cost: one acceptance on merged files. M1 — drop answers whose count went stale from page state after the pass that found them stale (the question is shown) — cost: none. M2/M3 parked.
- ROW-DEPTH-SIGN, ROW-LONG-KEY-EXTENDED, ROW-LONG-VALUE-SKIPPED → accept (tool default / reader decision; moot where /check-only) — cost: up to three more acceptances on /convert. Old-format line ambiguity → strict anchoring. Fix wave round 2 → same implementer.
- regroup the question per text (columns listed), keep per-column storage (I1); one click answers all listed columns — cost: none. Fix wave round 3 → same implementer; then a VPS delta for faroe/sargassum.
- per-column override inside a finding left out (column control covers ≥2 open texts) — cost: rare case of one text in a column that the person wants answered differently from sibling columns. VPS delta on 2b81bad dispatched.
- Golden expected.json: one entry (gn-f43e8925) changed by script from ROW-DATE-YYMMDD/info to ROW-DATE-YY-AMBIGUOUS/warning. This is the intended Task 7 change, approved by the AI-Wall session under Michał's authority on 19.11. No data was read and a backup is kept beside the file.

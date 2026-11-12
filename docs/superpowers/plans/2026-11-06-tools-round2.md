# Tools round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Michał's decisions of 2026-11-06 on the open questions of the /convert plan, three role faults from "What this plan does not fix", and collapsible example lists in /check and /convert.

**Architecture:** Small independent changes on branch `tools-round2` from main `765818c`. Each change is test-first, reviewed alone, and run through the obce2 regression.

**Tech Stack:** Vite + React + TypeScript, vitest, 4-language i18n (src/core/i18n/ui.ts, tips-text.ts, rule texts with count forms).

**Spec:** Michał's decisions (2026-11-06, recorded in AI-Wall handoff/HANDOFF-SR-TOOLS-TEST-OBCE-DANE.md, last entries) and the plan 2026-11-03-tools-improvements.md ("What this plan does not fix").

## Global Constraints

- Scientific data is never removed or altered silently; a row not understood blocks until a decision.
- No new role-guessing heuristics. Cells may only remove a role and make the column asked, never assign one. Names may state a role only through an exact vocabulary entry.
- The repo is public: tests use invented values only, with no personal names, no real dataset numbers and no DOIs of real records.
- Texts must be true in 4 languages, with count forms. docs/rules.md is regenerated, docs/APPS.md is kept true, and noDeleteAdvice stays green.
- /check output changes only where a task says so.
- No deploy before Michał's meeting (2026-11-06 13:00). Afterwards, only on his own word in this session.
- Mac heat: `nice -n 15`, `--maxWorkers=2`, targeted folders, one heavy job at a time.

## Review Focus

- A proposal that loses a role it had for a reason (a real measurement no longer read).
- A vocabulary entry that matches a word with two meanings.
- A collapsed list that hides a count, a level, a rule id or a decision button.
- Archive bytes that change for files the task does not concern.
- Companion files written before this branch that are read differently.

---

### Task 1: Invented Zenodo number in a test

Done as commit 01d044d (`test/app/infotip-placement.test.tsx`).

### Task 2: Take-once groups with taxon-only rows (Q-T5-2, Q-T5-3)

**Files:** `src/core/convert/repeatedTotal.ts`, `src/core/rules/convert.ts`, `src/core/convert/notWritten.ts`, tests in `test/convert/`.

- Inside a take-once group, rows that have only the taxon (size and number blank or NA) are their own listed case, with one decision per sheet. They are not joined to the group silently and not written row by row under one occurrenceID.
- A total of 1 spread over 2 or more rows is not treated as a repeat. The person is asked once per sheet.
- Tests use the n3 shape with invented values. Report what n3 does after the change, with its corrected key from Task 3.

### Task 3: Correct the n3 answer key (Q-T5-4)

**Files:** `/Users/ice13ball/data/tools-obce-2026-11-02/answer-keys/n3.json`, outside the repo. Follow the procedure in `report/answer-keys-changelog.txt` and the frozen sha256 lists.

- `Age_Group` is not the occurrence's life stage.
- Record the change in the changelog with the reason ("Michał 2026-11-06, Q-T5-4").
- Recompute the key's expected totals only from the key's own rules, never from tool output.

### Task 4: Narrow widening of the stated vocabulary (Q-T6-1)

**Files:** `src/core/convert/stated.ts`, `test/convert/stated.test.ts`, `test/convert/role-unconfirmed.test.ts`.

- **Add:** exact names that the proposer already treats as unambiguous by name alone.
  - Breitengrad, Längengrad, Szerokość geograficzna, Długość geograficzna;
  - scientific name and its translations;
  - a date with a time-zone note, in round or square brackets;
  - `SampleID`, `Sample ID`, `sample_id`. Check first why `SampleID` was proposed as ignore; report it, and do not change the proposer.
- **Keep listed:** Data, Datum, Breite, Szerokość, Länge, and authors' compounds (Latitude_dd, LatStart, DateCollected).
- **Regression:** report the listed-column distribution before and after; archives must be identical.

### Task 5: Underscore doubt for qualifier-glued forms (Q-T7-1)

**Files:** `src/core/convert/taxon.ts`, `test/convert/underscore-names.test.ts`, texts.

- Every word is judged. A part may end in a dot and may hold an inner hyphen. `Calanus_sp.`, `Oithona_spp.`, `Pseudo-nitzschia_seriata` and `Calanus finmarchicus_CV` are asked.
- `SP_01`, `sp_1` and all-lowercase codes are still not asked.
- "Write with a space" stays limited to name plus at most a qualifier.
- Report the doubt counts per regression file.

### Task 6: Year beside a date, eight-digit SampleNo (from "does not fix")

**Files:** `src/core/convert/recognize.ts` (the year veto at ~714-740 sits only in the wide-sheet branch), tests in `test/convert/`.

These vetoes only remove a role, for every sheet shape. A vetoed column becomes `ignore` (low) and is asked. It is named by CONV-COLUMN-IGNORED and never reassigned.
- **(a) Year:** a column proposed as `variable` whose non-blank values are all whole years (1800 to 2100), on a sheet that has a date or date-time column. This extends the existing wide-sheet year veto to every shape.
- **(b) Identifier-like column:** a column proposed as `variable` whose non-blank values are all integers of at least 6 digits and all distinct across rows.
- **Not done:** no new word list, and no demotion of unit-less measurements in general.
- **The question (AI-Wall 06.11):** it names the column and gives the reason, e.g. "looks like a running number: whole numbers only, all different" or "looks like a year beside the date". One click gives the measurement back.
- **Narrow before shipping:** if the regression shows that (b) hits real measurements (counts per m³, biomass in µg), narrow it. Either the values rise by 1 in row order, or the header holds a No/Nr/ID token. Narrowing only makes the veto rarer and never assigns a role. Report the columns hit before and after.
- **Tests:**
  - an invented long sheet with `Year` beside `Date`, and with an eight-digit `SampleNo`, gets both columns vetoed;
  - a real measurement such as `Count 12345` with repeats keeps `variable`;
  - a year column with no date column keeps its current role.
- **Regression:** list every column vetoed, per file, together with what the answer key says for that column. b08*, b09* are expected for `Year`. Archives change only in files that have vetoed columns; list them.

### Task 7: A total repeated across a separating key column (Size as cruise, size class in the sample code)

Reproduced on 765818c (reviewer-0211-repro.md). A long sheet repeats the same total on each size-class row. Two variants show the fault:
- **The size class declared as the cruise:** 3x the occurrences, with only CONV-TAXON-SAME-EVENT as an accept warning and no sums.
- **The size class carried in the sample code (`s1-8`, `s1-9`):** 3x the occurrences, fully silent.

**Files:** `src/core/convert/repeatedTotal.ts` (STRICT_KEY/LOOSE_KEY ~92 include cruise, sampleId and station, so the groups have one row each and are dropped by `g.length >= 2` ~176), tests.

- **Leave-one-out pass:** for each key column K, group by the other key columns plus the taxon. Run the existing `statusOf` evidence and thresholds unchanged.
- **On a hit:** raise the accept-level CONV-QUANTITY-SAME-IN-SAMPLE naming K and both sums, as is already done for a declared life stage or qualifier. No role is guessed. No header or code suffix is read.
- **Tests:** both variants, with invented values. Clean sheets, where the totals differ per K value, raise nothing.
- **Regression:** list every file that gains the finding. Archives are unchanged, because the finding only asks.

### Task 8: Cruises sheet beside non-unique Stations (/check join)

Already fixed by 0011547: (C1,S2) gets 60.2 in every sheet and row order, and ROW-JOIN-AMBIGUOUS appears where the key is not unique. Add a regression test that pins both sheet orders, then close the task.

### Task 9: Collapsible example lists (Michał 2026-11-06)

**Files:** a shared component in `src/app/components/`, used on /check and /convert.

- **Collapsed by default:** any list of examples (cells, rows, names, values) with more than 10 items. It shows the first 5, then a "Show all (N)" button that turns into "Collapse".
- **Always visible:** the finding's heading with its count, the rule id, the level, every decision button, and the export block.
- **Accessibility:** native `<details>`/`<summary>`, or a button with `aria-expanded`. It works from the keyboard.
- **Print and downloads:** print shows the full lists, and downloaded reports and files are unchanged.
- **No effect on output:** the collapse state never reaches a result or an archive.
- **Tests:** component tests for 10 and 11 items; obce2 regression with identical downloads and archives; screenshots before and after on a file with many findings.

### Task 10: Station rows and sample rows write a value alike in event.txt

From AI-Wall's production check: `54.5` on station rows, `54.50` on sample rows, for the same value in the file.

- A value derived for a station from its samples is written in the same form the sample rows use, when all samples share it.
- Archives change only where the two forms differed. Report every changed archive.

### Task 11: Polish name of the data checker (Michał 2026-11-06, relayed by AI-Wall)

Michał: "sprawdzarka danych" "zdecydowanie nie brzmi dobrze po polsku, Weryfikator danych albo coś w tym stylu już jest lepiej".

- **Noun:** in the Polish texts only, every use of the noun „sprawdzarka", in any case form, becomes „weryfikator danych" in the right case form, e.g. „Sprawdź pozycje z archiwum weryfikatorem danych". Scope: src/core/i18n/*.ts, rule texts and user-facing docs.
- **Menu and heading:** the /check menu entry and page heading become „Weryfikator danych" wherever they now say „Sprawdzanie danych" or „Sprawdzarka danych".
- **Search title:** propose a Polish search title with „weryfikator" that keeps the current keywords (współrzędne, daty, jednostki, licencja).
- **Unchanged:** verb buttons („Sprawdź", „Potwierdź i sprawdź") and the other languages.
- **Tests:** update text tests, and add a test that no Polish text contains „sprawdzark".

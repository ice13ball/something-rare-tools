// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Converter rules, part a (registry order of src/core/rules/convert.ts, CONV-SPLIT-UNDECIDED to CONV-LONG-READ). Each text was checked against the registry (texts, severity, export policy,
 * params) and against the code that raises the id with makeConvertFinding: src/core/convert/build.ts (almost all), taxon.ts (the split and its decision), quantity.ts (the declaration),
 * sampleKey.ts and keySetting.ts (the sample key, its length limit of 255 characters), sampleJoin.ts (the join), dateOrder.ts, missingCode.ts, pivot.ts, transposed.ts and settings.ts
 * (the companion-file keys named in the actions). The converter never guesses: a blocking finding waits for an answer, and an answer read from a companion file holds only while the same
 * sheet, column and count of rows or cells are found again. The /check rules never raise these ids. The /convert sentence in each action follows the export policy of the rule.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'CONV-SPLIT-UNDECIDED': {
    checks:
      'Taxon names that carry more than a name, a qualifier such as cf. or sp., a life stage such as c2 or juv., or a sex suffix, were split into scientificName, identificationQualifier and lifeStage, and the split has not been approved yet. The exact text is always kept in verbatimIdentification.',
    fires:
      'Once per upload (distinct texts are counted over all non-profile sheets together, and the finding is attached to the first sheet), when at least one distinct taxon text (a header of a wide sheet or a cell of a taxon column) was changed by the split, or its leftover name is doubtful, and no approval exists for that exact text. A plain name needs no decision and is not counted. The taxon columns of profile sheets are not counted.',
    example:
      'A plankton sheet has the columns "Pseudocalanus sp." and "Oithona similis CIV". The first is proposed as the name Pseudocalanus with the qualifier sp., the second as Oithona similis with life stage C4. The finding says 2 names carry a qualifier or a stage and shows the first.',
    action:
      'Approve each proposed split on the page (or correct it), one answer per distinct text. In /convert this finding blocks the export until every distinct split is approved.',
  },
  'CONV-QUANTITY-UNDECLARED': {
    checks:
      'The meaning of the numbers of a sheet is not declared, or the declaration is incomplete. The converter does not guess whether a column is a count, a density, a biomass, a percent cover or an abundance class.',
    fires:
      'For a sheet with taxon columns and numbers when the quantity declaration is missing or lacks a part. A count needs only its kind. A density needs the unit and a per-volume or per-area basis (plus the medium, bed or water, when it is per area). A biomass needs a mass unit (g, mg or kg), the basis (wet, dry or ash-free dry weight) and a per-volume or per-area basis, or the statement per sample. A class needs its scale, a cover needs the unit percent, and a sample size needs the value, the unit and the volume or area (or an effort column). The finding lists what is missing. It is not raised for a presence-only or own-record sheet, a species list, a taxon without a quantity, or a sheet with only environmental variables.',
    example:
      'A sheet has the columns "Calanus finmarchicus" and "Oithona similis" with numbers under them. The person has declared a density but no unit, so the finding says: Missing: unit.',
    action:
      'Declare the kind of the numbers on the page, with the unit, basis, scale or sample size it needs; a count needs only its kind. In /convert this finding blocks the export until the declaration is complete.',
  },
  'CONV-COUNT-NOT-INTEGER': {
    checks:
      'A column declared as a count holds values with decimals. A number of individuals must be whole, because individualCount in Darwin Core is an integer.',
    fires:
      'For every cell of a declared count column that is a number but not a whole number. One finding per column lists the lines, the total and the first value. Those cells are not converted.',
    example:
      'A count column "Calanus" holds 12, 7.5 and 3 on lines 5, 6 and 7. Line 6 is reported with the value 7.5.',
    action:
      'Declare the sheet as a density with its unit if the numbers are per volume or area, or correct the values in the source. In /convert this finding blocks the export.',
  },
  'CONV-NEGATIVE-QUANTITY': {
    checks:
      'A quantity or sample size column holds a negative number. A count, a density, a biomass or an effort cannot be below zero.',
    fires:
      'For every cell of a column declared or read as a quantity or sample size whose value is below zero. One finding per column lists the lines, the total and the first value. Those cells are not converted.',
    example:
      'A biomass column holds 0.4, -0.2 and 1.1 on lines 8, 9 and 10. Line 9 is reported with the value -0.2.',
    action:
      'Correct the values in the source. If a negative number stands for a missing value, replace it by an empty cell (a code such as -99 is a separate question, answered with the missingCode setting). In /convert this finding blocks the export.',
  },
  'CONV-COVER-RANGE': {
    checks:
      'A column declared as percent cover holds a value above 100. A share of an area cannot be above one hundred percent.',
    fires:
      'For every cell of a column declared as cover whose value is greater than 100 (and which is not answered as an absence). A negative cover is not reported here: it is CONV-NEGATIVE-QUANTITY. One finding per column lists the lines and the first value. Those cells are not converted.',
    example:
      'A cover column holds 35, 60 and 140 on lines 4, 5 and 6. Line 6 is reported with the value 140.',
    action:
      'Correct the value, or change the declaration if the column is not a percentage (for example a count or a density). In /convert this finding blocks the export.',
  },
  'CONV-CLASS-VALUE': {
    checks:
      'A column declared as an abundance class holds a value that is not a whole number of the declared scale. A class is a rank on a scale, never a number of individuals.',
    fires:
      'For every cell of a column declared as an abundance class that is not a whole number belonging to the scale (a decimal, or a number below the lowest or above the highest class). A negative value is reported earlier as CONV-NEGATIVE-QUANTITY. One finding per column lists the lines, the scale and the first value. Those cells are not converted, and a class is never written as individualCount.',
    example:
      'A column is declared as classes of a scale from 1 to 5 and holds 2, 4 and 7 on lines 3, 4 and 5. Line 5 is reported with the value 7.',
    action:
      'Correct the values or the declared scale on the page. If the numbers are really counts, declare them as counts. In /convert this finding blocks the export.',
  },
  'CONV-SAMPLE-CODE-MISSING': {
    checks:
      'Some rows have no sample code. The code becomes the eventID in the archive, so it has to come from the person; the converter never derives it from depth or row order.',
    fires:
      'For a row that carries a record (on a long sheet a taxon with a value, a biomass or a description; on a wide sheet any filled taxon cell) and has no sample code: the code cell is empty (a blank, NA, nan or a dash), or the sheet has no code column at all, or, with a picked key, every part of the key is blank in that row. Spacer and comment rows are listed under other reasons. One finding per sheet lists the lines and the number of rows. A profile sheet gets a different text.',
    example:
      'A long sheet has a "Sample" column that is empty on lines 20 to 24, five rows. The finding names those lines and the column.',
    action:
      'Pick the columns that together make a sample (the sample key on the page, kept in the companion file as sampleKey), or download the sheet with proposed codes, check them and upload it again. On a profile sheet no download is offered: map a code column that is unique within the station, or tick the approval of station plus depth as written (this needs a depth or a pressure in dbar). In /convert this finding blocks the export.',
  },
  'CONV-KEY-PART-BLANK': {
    checks:
      'One of the columns of the sample key the person picked is empty in some rows. The empty part counts as a value, so those rows form samples of their own and are not merged with rows that have a value there.',
    fires:
      'For every row that passes the record check (see CONV-SAMPLE-CODE-MISSING) and in which a part of the picked key is empty (an empty cell, NA, nan or a dash) while at least one other part has a value. A row whose parts are all empty has no sample and is CONV-SAMPLE-CODE-MISSING instead. A profile sheet never raises it.',
    example:
      'The key is station plus depth. Lines 12 and 13 have a station but an empty depth, so they make a sample apart from the rows of the same station with a depth.',
    action:
      'Fix the gap in the file if it is a gap in the data, or accept if the rows really are separate samples. In /convert this warning must be accepted once before the export.',
  },
  'CONV-ROLE-UNCONFIRMED': {
    checks:
      'Some columns have a taxon, quantity, date, latitude or longitude role that the converter proposed and the file does not state by name. A stated name means an exact Darwin Core term, an exact vocabulary entry, a unit in the header or a PANGAEA geocode.',
    fires:
      'Once per sheet when at least one column has such a proposed role. A column whose role the person changed is not listed. Nothing is re-roled and nothing about this finding is written to the archive or the companion file.',
    example:
      'A column headed "Latitude_dd" holds values from 54.1 to 54.9. The header is not an exact Darwin Core term, so the proposed latitude role is not confirmed. The finding lists "Latitude_dd" and asks to check it.',
    action:
      'Check the listed columns in the column table and correct a wrong role. Then accept once; the acceptance holds while the listed set does not grow. In /convert this warning must be accepted before the export.',
  },
  'CONV-KEY-MIXED-NUMBERS': {
    checks:
      'A column of the sample key mixes typed numbers and text that looks like a number. They are compared differently, so one sample may be split in two.',
    fires:
      'Only for a picked key, for a key column that holds both real numbers and number-like text (date and time columns are not compared this way). A typed number is compared as a number, a text only as a whole number with an all-zero fraction, so 1.5 typed and 1.50 written are two values, while a typed 1 and the text 1 or 1.0 are the same. One finding per column shows the first pair, the typed value and the text.',
    example:
      'The key column "Station" holds the number 1.5 in some rows and the text "1.50" in others, from two sources pasted together. They count as two different codes, so the samples of that station may be split.',
    action:
      'Make the column uniform in the source (all numbers or all text), or accept if the samples are right as they are. In /convert this warning must be accepted once.',
  },
  'CONV-KEY-TOO-LONG': {
    checks:
      'An identifier made from the sample key the person picked (of a sample, a replicate or an occurrence) is longer than 255 characters. A Darwin Core archive does not take identifiers that long, and the converter never shortens one.',
    fires:
      'For every row whose generated ID is longer than the limit. One finding per sheet lists the lines, the longest length, the first 60 characters and the length of the name that starts every ID.',
    example:
      'The key joins six long text columns. On lines 30 to 35 the identifiers have 310 characters, and the finding quotes the first 60 of the longest.',
    action:
      'Pick fewer key columns, or columns with shorter values, or shorten the name in front of the IDs (the key prefix on the page, kept as sampleKeyPrefix). In /convert this finding blocks the export.',
  },
  'CONV-KEY-PICKED': {
    checks:
      'The sample code of every row is made of the columns the person picked. This note repeats the choice, so it is visible in the report: the columns, the number of samples, the number of rows and the name that starts every sample ID.',
    fires:
      'Once per sheet whenever a sample key is in use, whether picked on the page or read from the companion file. Information only.',
    example:
      'The person picks Station and Date. The note says: samples 14, rows 112, every sample ID starts with the name of the file (the name of the sheet for a workbook), then come the two values.',
    action:
      'Nothing to answer. "Ask again" takes the choice back. A choice read from the companion file (sampleKey) holds only while the same columns and the same number of rows are found. In /convert this note is only shown.',
  },
  'CONV-JOIN-PROPOSED': {
    checks:
      'Another sheet seems to describe the samples of this results sheet and is linked to it by key columns. The converter shows how many samples it covers and joins nothing until the person confirms.',
    fires:
      'When a sheet whose rows describe the samples of a results sheet is linked to it by a key, the description sheet holds at least half of the samples of the results sheet, the results sheet has a taxon and the description sheet has none (neither is a profile sheet), and the link is neither confirmed nor declined (sampleJoinNo). The note gives the number of samples found in the description sheet.',
    example:
      'A results sheet has 40 samples by station and date, and a sheet "Stations" has a row for 38 of them. The note proposes the link and says 38 of 40 samples were found.',
    action:
      'Confirm or decline the join on the page (kept as sampleJoin, or sampleJoinNo for a refusal). In /convert this note is only shown; the export is not blocked by the proposal.',
  },
  'CONV-JOIN-DESCRIPTION-LONG': {
    checks:
      'A sheet that seems to describe the samples is in the long layout, one row per parameter, or was turned by the person. Joining such a sheet is not supported yet.',
    fires:
      'When the proposed description sheet (which holds at least half of the samples of the results sheet) has a parameter column and a value column, so that it was regrouped by the converter, or was turned by the person, instead of having one row per sample. Both sheets are then converted exactly as if there were no join.',
    example:
      'A sheet "Environment" has the columns Station, Parameter and Value, with several rows per station. It is linked to the results by Station, but cannot be joined.',
    action:
      'Reshape the description sheet to one row per sample if you want it joined. In /convert this note is only shown.',
  },
  'CONV-JOIN-CONFLICT': {
    checks:
      'The results sheet and the description sheet give a different value for the same thing in the same sample (for example the depth or a date). The converter does not choose between them.',
    fires:
      'For each group of values (a quantity such as depth or date, with its columns in both sheets) that differs in at least one sample of a confirmed join. The finding gives the number of samples, the examples and how many are still undecided.',
    example:
      'Sample S12 has the depth 10 in the results sheet and 15 in the description sheet. The finding shows 15 / 10 and asks which value to take.',
    action:
      'Choose, on the page, a value for all samples at once, for each sample or for each pair of values (the choice for the whole group is kept as sampleJoinConflict). In /convert this finding blocks the export until every difference is decided.',
  },
  'CONV-JOIN-CONFLICT-CHOSEN': {
    checks:
      'The values of one quantity differed between the two sheets and the person decided which sheet to take. This note reports how many samples took the description sheet and how many the results sheet.',
    fires:
      'When a conflict group of a confirmed join has been answered. Information only.',
    example:
      'The depths differed in 6 samples. The person chose the description sheet for 4 of them and the results sheet for 2, and the note says so.',
    action:
      'Nothing to answer. "Ask again" takes the choice back. In /convert this note is only shown.',
  },
  'CONV-JOIN-UNIT-DIFFERS': {
    checks:
      'A quantity is in different units in the two joined sheets. Such values can be neither compared nor exchanged, so the converter chooses nothing.',
    fires:
      'When the columns holding the same quantity in the results and in the description sheet have different units, and the converter cannot convert one to the other: a depth in a unit it does not convert (for example centimetres), or another quantity with a unit of its own, such as a pressure in dbar in one sheet and bar in the other. Metres, feet, fathoms and kilometres of a depth are converted and do not raise it. The finding names both columns and both units.',
    example:
      'The results sheet has "Depth [m]" and the description sheet "Depth [cm]". The finding names both and blocks the merge.',
    action:
      'State the same unit in both sheets, or set one of the two columns to ignore. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-COLUMNS-DIFFER': {
    checks:
      'The same quantity is held by different columns in the two joined sheets, so the columns cannot be paired one to one.',
    fires:
      'When the results sheet and the description sheet hold a different set of columns of the same text role, such as station, cruise or sample code (not one against one, and not the same set). A date, a position or a depth held in different column structures is merged into resolved columns and does not raise it.',
    example:
      'The results sheet has two station columns (Station and Substation) and the description sheet has one Station column. The finding names both sets.',
    action:
      'Use the same columns in both sheets, or set the columns of one of the sheets to ignore. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-NO-DESCRIPTION': {
    checks:
      'Some samples of the results sheet have no row in the description sheet. The converter will not invent a description for them.',
    fires:
      'When a confirmed join leaves one or more results samples without a matching row (this includes results rows with a blank part of the key, named by their lines), and that has not been answered. The finding lists up to the first samples and, when the description sheet has samples without results, a few of them to show a near miss.',
    example:
      'The results sheet has samples S1 to S40, and the description sheet lacks S39 and S40. The finding names both.',
    action:
      'Add the rows to the description sheet, or choose to convert those samples with only what the results sheet says (kept as sampleJoinResultsOnly, for the same count). In /convert this finding blocks the export until one of them is done.',
  },
  'CONV-JOIN-NO-MATCH': {
    checks:
      'No key of the results sheet is found in the description sheet, so the two sheets do not match at all. This is almost always a wrong key column or a different way of writing the codes.',
    fires:
      'When none of the keys of the results sheet is present in the description sheet. The finding gives examples from both sides and the key columns.',
    example:
      'The results use the codes S01 and S02, the description sheet the codes S1 and S2. No key matches, and the examples show it.',
    action:
      'Correct the key columns or the way the codes are written (O for 0, say). No "results only" answer is offered here. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-RESULTS-ONLY': {
    checks:
      'The person chose to convert the samples that have no description with only what the results sheet says. This note lists them. Nothing is invented for them.',
    fires:
      'When the answer "results only" is given for the samples without a row in the description sheet. Information only.',
    example:
      'Samples S39 and S40 have no description. The person chose to convert them from the results sheet only, and the note names both.',
    action:
      'Nothing to answer. "Ask again" takes the choice back. A choice read from the companion file (sampleJoinResultsOnly) holds only for the same number of samples. In /convert this note is only shown.',
  },
  'CONV-JOIN-DESCRIPTION-ONLY': {
    checks:
      'Some samples are described in the description sheet but have no results. They are written as sample events with no occurrence.',
    fires:
      'When a confirmed join finds a row in the description sheet whose key is in no row of the results sheet. The rows are appended only once per description sheet (for the first results sheet that uses it), and not for a key that another results sheet holds. Keys with several different rows go to CONV-JOIN-AMBIGUOUS, and when no key matches at all the finding is CONV-JOIN-NO-MATCH instead. The finding lists up to the first samples and, when the results sheet has samples without a description, a few of them to show a near miss.',
    example:
      'The description sheet lists station S41, but no results row carries S41. The sample S41 is written as an event with no occurrence.',
    action:
      'Accept once if it is right that these samples have no results, or remove the rows from the description sheet. In /convert this warning must be accepted before the export.',
  },
  'CONV-JOIN-AMBIGUOUS': {
    checks:
      'In the description sheet the same key occurs on several rows that differ in their values. The converter does not choose one of the rows.',
    fires:
      'For every key of the description sheet that appears more than once with different values and is used by a results row or would be appended. An ambiguous key that nothing uses is not reported. The finding lists the keys and the lines of the description sheet.',
    example:
      'The key S12 stands on lines 14 and 15 of the description sheet, with the depths 10 and 20.',
    action:
      'Keep one row per key value, or make the values of the repeated rows agree. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-KEY-BLANK': {
    checks:
      'A part of the join key is blank in some rows, so no row of the other sheet can be found for them.',
    fires:
      'For every row of the results sheet (or of the description sheet, as the finding says) in which a column of the join key is empty. One finding per sheet lists the lines and the columns.',
    example:
      'The join key is station plus date, and lines 5 and 6 of the results sheet have a station but no date.',
    action:
      'Fill in the key in the file, or convert these rows with only what the results sheet says (the answer that also covers CONV-JOIN-RESULTS-ONLY). On the description side the rows are left out and listed. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-KEY-ROLE-LOST': {
    checks:
      'A join the person confirmed is not applied, because a key column of it lost its key role after the confirmation.',
    fires:
      'When a confirmed join refers to a results column that no longer has a key role (it was given another meaning). Both sheets are then converted as without the join.',
    example:
      'The join was confirmed on the column "Station". Afterwards the person changed its meaning to Ignore, so the join is dropped.',
    action:
      'Give the column its key role back, or confirm the join again. In /convert this finding blocks the export.',
  },
  'CONV-JOIN-FILLED': {
    checks:
      'Blank cells of the results sheet were filled with the value of the same sample from the description sheet. Only blank cells are filled; a value that exists is never replaced here.',
    fires:
      'For each column of the results sheet that had blank cells filled by a confirmed join. Information only.',
    example:
      'The column "Depth" was blank for 3 samples in the results sheet, and the description sheet gave their depth. The note says 3 blank cells of Depth were filled.',
    action:
      'Nothing to answer. Check the filled values if the description sheet is not fully trusted. In /convert this note is only shown.',
  },
  'CONV-ID-DUPLICATE': {
    checks:
      'The same identifier is produced more than once. Identifiers of events, occurrences and measurements must be unique in a Darwin Core archive.',
    fires:
      'For every identifier that two or more rows or columns would get: an event ID repeated between stations, a sample code equal to a station or cruise ID, two columns with the same header, rows of one sample with the same taxon (occurrence), or a level ID repeated on profile rows or equal to a sample, station or cruise ID. Findings are made per ID and place for events, per sheet for occurrences and per sheet and ID for levels. Each lists the lines, the number repeated and an example, with a hint for its kind.',
    example:
      'The sample code S1 occurs in station A and in station B. Both would get the eventID S1. The finding shows S1 and the lines.',
    action:
      'Change the repeated code or header, or give the rows an occurrenceID or life stage column, or, when codes repeat between stations, tick the station prefix (kept as stationPrefix). In /convert this finding blocks the export.',
  },
  'CONV-TAB-IN-VALUE': {
    checks:
      'A value contains a tab or a line break. The archive files are tab-separated with one record per line, so such a value would break them.',
    fires:
      'For every cell with a tab or a line break inside it: a data value, but also a header (a taxon header, a variable name or a unit), an abundance class label, the sampling device label, or a value typed on the page and written to an output table. One finding per column lists the lines and shows the first value with the character shown as a space. The export is blocked and nothing is written until the character is removed.',
    example:
      'A remarks cell on line 18 holds two lines of text. The finding quotes it with a space in place of the break.',
    action:
      'Replace the character with a space in the sheet. In /convert this finding blocks the export.',
  },
  'CONV-TEXT-IN-TAXON-CELL': {
    checks:
      'A cell of a taxon or quantity column holds text where a number is expected, and the converter does not know what it means. No word is read as an absence by the tool.',
    fires:
      'For each distinct text, case kept, found in cells of quantity columns that are not numbers. Empty cells and NA tokens are not asked, and nothing is asked on a presence-list sheet. The finding gives the text, the columns and the number of cells. Nothing is written for the cells until the question is answered.',
    example:
      'The column "Calanus" holds the text "not found" in 4 cells and numbers in the rest. The finding asks what "not found" means.',
    action:
      'Answer for the text: absence (read as 0, absent with the full species list tick, else left out), leave out (left out and listed), or present (an occurrence with the text in the remarks). The answer is kept per column and text (countTextAt), or one answer covers every text of a column (countTextColumn), in both cases for the same number of cells. In /convert the export waits for the answer.',
  },
  'CONV-COUNT-TEXT-DECIDED': {
    checks:
      'The person answered what a text in a quantity cell means. This note repeats the answer: absence, leave out, or present with the text in occurrenceRemarks.',
    fires:
      'When a text found by CONV-TEXT-IN-TAXON-CELL has an answer, from the page or from the companion file. Information only. The answer holds for the number of cells it was given for.',
    example:
      'The text "not found" in 4 cells of the column Calanus was answered as absence, so the cells are read as 0.',
    action:
      'Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.',
  },
  'CONV-TAXON-SAME-EVENT': {
    checks:
      'The same taxon appears more than once in one sample: the same name or WoRMS identifier, with the same life stage, sex and qualifier. Each stays a separate record and nothing is summed.',
    fires:
      'For every taxon (same name or AphiaID, life stage, sex and qualifier) that two or more columns or rows of one sample give with at least two distinct occurrence IDs, judged after the WoRMS lookup, so two spellings that resolved to one AphiaID are caught. Rows already reported as a repeated total or as the same value are left out. The finding names the columns and how the sheet writes the taxon.',
    example:
      'The columns "Acartia longiremis" and "Acartia longiremis (Lilljeborg)" both resolve to the same AphiaID, so station S3 gets the taxon twice.',
    action:
      'Check whether the columns should be one, and merge them in the file if so. Accept if two records are right. In /convert this warning must be accepted once.',
  },
  'CONV-NA-SKIPPED': {
    checks:
      'Cells marked NA (not available) in a taxon or quantity column were left out. No data is neither a zero nor a presence, so such a cell makes no record, like an empty one.',
    fires:
      'When a taxon or quantity column holds NA or a similar token in at least one cell: the cells are counted. On a long sheet it is also raised per row: a row with a taxon whose quantity cell is empty or NA and which has no biomass is counted as a row (a wholly empty quantity cell counts too), in the variants rows, rows-columns and rows-empty. Variant spellings of NA go to ROW-NA-VARIANT. Information only.',
    example:
      'Twelve cells of a count table hold NA, or twelve rows of a long sheet have a taxon and an empty quantity. No occurrence is written for them, and the note counts 12.',
    action:
      'Nothing to answer. If NA means a true zero, write 0 in the cell and tick the full species list. In /convert this note is only shown.',
  },
  'CONV-QUANTITY-BLANK-KEPT': {
    checks:
      'In a long sheet a row has a weight but a blank or NA quantity. It is written as present with no count, and no number is invented.',
    fires:
      'For every row with a taxon, an empty or missing-data quantity and a biomass value above zero. The row is written as an occurrence with occurrenceStatus present and its biomass; the weight shows the taxon was in the sample.',
    example:
      'Line 40 has the taxon Calanus, the count NA and the weight 0.8. It is written as present with a biomass of 0.8 and no count.',
    action:
      'If NA means not analysed, the taxon is not known to be present: correct those cells before the export. Otherwise accept. In /convert this warning must be accepted once.',
  },
  'CONV-BIOMASS-UNIT-UNCLEAR': {
    checks:
      'The unit of a weight column is missing, unclear or in two kinds, so the unit is left empty. A partial or guessed unit would change the meaning of the number.',
    fires:
      'Three cases. The header holds a mass unit not in brackets followed by words the converter does not understand (neither a per-area or per-volume part nor a kind of mass); the finding quotes the unrecognised rest. The header has no unit at all (variant none). Or two different mass units appear in the weight columns. The lines are named.',
    example:
      'A header "Weight kg of the best sample" holds the unit kg and unclear words. measurementUnit is left empty. A header "Weight" with no unit raises the none variant.',
    action:
      'Put one unit in brackets in the header, for example [kg/km2], and load the file again. In /convert this warning must be accepted once.',
  },
  'CONV-QUANTITY-REPEATED': {
    checks:
      'A column looks like the total of a taxon in a sample, repeated on each size class row. Summed as it is, the number would be inflated by the number of size classes.',
    fires:
      'When the value is the same on every row of at least 4 groups of rows that share sample, taxon, life stage and qualifier, those groups are at least half of the groups that count as evidence, and the column has at least 2 distinct values. A group counts as evidence only when its value is not smaller than the number of its rows (a count of 1 is not counted). The same pattern is also raised as variants for a weight and for groups that disagree, even after the answer one occurrence per sample and taxon.',
    example:
      'A sheet has several samples, each with three size-class rows per taxon, and each row repeats the total of its taxon (120 in one sample, 80 in another). In at least 4 groups the sum would be three times the total. The finding names the column and the size column that differs.',
    action:
      'Choose to write one occurrence per sample and taxon (the button, kept as totalOnce and totalOnceGroups), or mark a column with the number of each size class as the quantity, or declare the equal quantities as real counts (realCountsRows). In /convert this finding blocks the export.',
  },
  'CONV-QUANTITY-REPEATED-ONCE': {
    checks:
      'As the person chose, a repeated total is written once per sample and taxon, and the later rows of each group are left out. The values that differ between the rows are not written on that occurrence.',
    fires:
      'When the answer one occurrence per sample and taxon is applied to a sheet. The note gives the number of groups and of rows left out and lists the columns not written.',
    example:
      '12 groups repeat a total on 3 size classes. 24 repeated rows are left out, and the size column is not written on the occurrence.',
    action:
      'Check the sum. Accept once, or undo the choice on the page. A group whose values differ raises the blocking CONV-QUANTITY-REPEATED variant disagree. In /convert this warning must be accepted once.',
  },
  'CONV-QUANTITY-REAL-COUNTS': {
    checks:
      'The person said that the equal quantities of the rows are real counts. For this sheet, repeated totals and exact copies of rows are no longer looked for.',
    fires:
      'When the answer real counts is given on the page or read from the companion file for a sheet where the rows repeat a total. The answer must be stored with its number of rows (realCountsRows); a bare realCounts raises nothing. Information only.',
    example:
      'The person said that the equal counts of 18 rows are real, so CONV-QUANTITY-REPEATED, CONV-QUANTITY-SAME-IN-SAMPLE and CONV-ROW-COPIES are off for the sheet.',
    action:
      'Nothing to answer. "Ask again" turns both checks back on. The saved answer (realCountsRows) holds only while the same number of rows is found. In /convert this note is only shown.',
  },
  'CONV-COMPANION-OLD': {
    checks:
      'The companion file holds answers in an old form, with no number of rows they were given for. They are read but not applied.',
    fires:
      'When the companion file has the old settings realCounts, totalOnce or dropCopies without a count. Where they apply, the questions are asked again. Information only.',
    example:
      'A companion file from an earlier version holds realCounts=Samples. The note says 1 saved answer was not applied.',
    action:
      'Answer the questions again; the new answers are saved with their counts (realCountsRows, totalOnceGroups, dropCopiesRows). In /convert this note is only shown.',
  },
  'CONV-ROW-COPIES': {
    checks:
      'Some rows are exact copies of another row in every column but a per-row identifier, with a quantity above 1. Written as they are, the quantity would be counted twice.',
    fires:
      'For every row identical to an earlier one in every column but a per-row identifier, with a quantity above 1 for a count, above 0 for a density, a biomass or another quantity, or any identical row when the sheet is declared as its own records. The finding gives the sum of the quantity with the copies and without them. The sums are left out for a percent cover, an abundance class, or own records with no quantity column.',
    example:
      'Lines 30 and 31 are identical, with the count 14. With both the sum is 28, without the copy 14.',
    action:
      'Leave the copies out and list them in a file beside the archive (the button, kept as dropCopiesRows for the same number of copies), keep them as separate records (keepCopiesRows, only for own records), or correct the sheet. In /convert this finding blocks the export.',
  },
  'CONV-ROW-COPIES-DROPPED': {
    checks:
      'As the person chose, rows that are exact copies of an earlier row were left out, and are listed in the file beside the archive.',
    fires:
      'When the answer to leave out copies is applied. The note gives the number of rows and the sum of the quantity with and without them.',
    example:
      '3 copies on lines 31, 55 and 56 were left out. The sum was 420 with them and 388 without them.',
    action:
      'Check that they really were copies. Accept once. In /convert this warning must be accepted once.',
  },
  'CONV-ROW-COPIES-SPECIMENS': {
    checks:
      'Some rows are identical to another row and have a count of 1. A table of single specimens looks exactly like this, so nothing is blocked.',
    fires:
      'For every row identical to an earlier one with a count of 1 when the sheet is not declared as its own records. The finding gives the sum as separate records and the sum if they were copies.',
    example:
      'Five rows read Calanus, size 2, count 1. As specimens the sum is 5, as copies of one record it is 1.',
    action:
      'Check which it is. Accept if they are separate specimens. In /convert this warning must be accepted once.',
  },
  'CONV-ROW-COPIES-KEPT': {
    checks:
      'The sheet is declared as each row its own record, and the person chose to keep identical rows as separate records.',
    fires:
      'When the answer to keep copies (keepCopiesRows) is applied and the same number of copies is found. Each row is written with an occurrenceID made of its source line.',
    example:
      '4 identical rows on lines 12 to 15: the finding counts 3 copies (lines 13 to 15), and all four rows are written as separate records.',
    action:
      'Check that they are not copies. Accept once. In /convert this warning must be accepted once.',
  },
  'CONV-OWN-RECORDS': {
    checks:
      'The person declared that each row of a long sheet is its own record. The occurrenceID is the sample code and the line number in the file, so it changes when rows are inserted or deleted before a new version.',
    fires:
      'Once per sheet declared this way (ownRecords, for the same number of rows), when the declaration is eligible (a long sheet with a taxon column, no occurrenceID column, no profile, pivot or turn) and rows are written. A row with no quantity column and no presence-only tick is one individual.',
    example:
      'A table of 240 measured fish, one per row, is declared this way. Fish on line 17 of sample S3 gets the occurrenceID S3:L17.',
    action:
      'Keep the order of the rows, or add an occurrenceID column. Accept once. In /convert this warning must be accepted once.',
  },
  'CONV-ROW-NOT-UNDERSTOOD': {
    checks:
      'Some rows of a sheet have no record because the converter could not place what they hold. Nothing is in the archive for them, and nothing is deleted from the file.',
    fires:
      'Once per sheet and reason, when rows are not written for a reason that means the converter could not place the row (the reason and what it means are in the finding). Reasons that have a blocking rule of their own, such as a missing sample code, raise it only for lines that rule does not name. A row that no reason explains (a converter fault) blocks too. Every row not written is listed with its line, reason and cells.',
    example:
      '5 rows of a long sheet have a count but no taxon name (reason no-taxon). The finding names the reason and the lines.',
    action:
      'Leave the rows out and list them in a file beside the archive (the button, kept as leaveOut for the same count and number of rows), or correct the file. Never prefilled. In /convert this finding blocks the export until you decide.',
  },
  'CONV-ROW-LEFT-OUT': {
    checks:
      'As the person chose, rows that could not be placed were left out of the archive and are listed in the file beside it. Nothing was deleted from the source.',
    fires:
      'When the answer to leave out the rows of one reason is applied, from the page or the companion file (leaveOut). Information only.',
    example:
      '5 rows with a count but no taxon name were left out and listed.',
    action:
      'Nothing to answer. The question is asked again with the button, or when the sheet changes. In /convert this note is only shown.',
  },
  'CONV-QUANTITY-SAME-IN-SAMPLE': {
    checks:
      'Several rows of the same sample and taxon, which differ in some other column, carry the same quantity. It may be a total repeated on each row, or genuinely equal counts.',
    fires:
      'For every group of at least 2 rows of one sample and taxon that differ in another column (a blank size, a stage, a sex, or a key column left out in a turned sheet) and carry the same value above 0, whatever the number of groups. For a count the shared value must be above 1: counts of 1 are not reported here, a density or a weight of 1 is. A repeated biomass weight is included. The finding gives the sum as separate records and the sum as one total.',
    example:
      'Sample S3 has three Calanus rows (sizes small, medium, large), each with 40. As three records the total is 120, as one repeated total it is 40.',
    action:
      'Check which it is and correct the sheet if the value is a repeated total. Accept if the counts are real. In /convert this warning must be accepted once. A systematic repeat is the blocking CONV-QUANTITY-REPEATED.',
  },
  'CONV-TAXON-EMPTY-ROW': {
    checks:
      'A row of a long sheet has a number or a weight but an empty taxon name. There is nothing to attach it to, so it is not converted.',
    fires:
      'Superseded in /convert. The row is raised together with the fate no-taxon, and the question CONV-ROW-NOT-UNDERSTOOD (reason no-taxon) takes over the same lines, so this finding does not reach the report. For the rows with a quantity or a biomass and an empty taxon cell, the finding would list the lines and the column.',
    example:
      'Line 52 has the count 6 and no taxon. It is not converted.',
    action:
      'Leave the rows out and list them (leaveOut) when CONV-ROW-NOT-UNDERSTOOD asks, or type the taxon name in the sheet. The export is blocked until one of them is done.',
  },
  'CONV-TIME-HOLDS-DATES': {
    checks:
      'A column read as a time of day holds full dates, and no column is the date. The events would have no eventDate, and a date that is in the file is never dropped silently.',
    fires:
      'When the sheet has a time column and no date column, and half or more of the filled cells of the time column are dates: full dates, spreadsheet serials in a date-formatted column, or date-looking text that the date parser does not read. A year part column also counts as a date. Placeholder dates of a spreadsheet (1899-12-30) or an epoch (1970-01-01) are times and are not counted.',
    example:
      'The column "Time" holds 2024-05-03 10:15 in all rows, and no other column is a date.',
    action:
      'Give the column the meaning "Date and time" on the page. In /convert this finding blocks the export.',
  },
  'CONV-TIME-SOME-DATES': {
    checks:
      'A time column holds some full dates, fewer than half of its filled cells, and no column is the date. Those dates will not reach eventDate.',
    fires:
      'When the sheet has a time column and no date column, and fewer than half of the filled cells hold a date: a full date, a spreadsheet serial in a date-formatted column, or date-looking text that the parser does not read. Placeholder dates of a spreadsheet or an epoch are not counted.',
    example:
      '3 cells of the column "Time" hold 2024-05-03 07:30 among times such as 07:30. The note names the lines.',
    action:
      'If they are the dates of the events, give the column the meaning "Date and time". Otherwise accept. In /convert this warning must be accepted once.',
  },
  'CONV-DATE-ORDER-UNDECLARED': {
    checks:
      'Dates such as 03/04/2024 can be read as day first or month first, and no date in the column decides it. A day and a month are never guessed.',
    fires:
      'For a date column (or a time column, or a date column of the sample key) whose cells have two parts of 1 to 12 that differ and no cell has a part above 12 to decide, with no day and month order declared. It also covers dates written NN-NN-NN with two-digit years when several readings are possible (variant two-digit-year). The finding shows the readings of the first cell.',
    example:
      'The cell 03/04/2024 reads as 3 April or as 4 March, and no cell of the column has a day above 12.',
    action:
      'Declare the order of the column on the page: day first (dmy) or month first (mdy), kept as dayMonthOrder for the same column and number of rows. For two-digit years declare year, month and day order with yyOrder (ymd, dmy or mdy). In /convert this finding blocks the export.',
  },
  'CONV-DATE-ORDER-CONTRADICTED': {
    checks:
      'The order declared for a date column is contradicted by its own unambiguous dates. A declaration decides only the cells that no date decides.',
    fires:
      'When the declared day and month order differs from the order the clear dates of the column show (a day above 12 in a place where a month was declared, or both orders in one column). The variant two-digit-year is raised when the declared yyOrder is not among the readings of the NN-NN-NN cells.',
    example:
      'The order mdy is declared, but a cell reads 25/03/2024. The detected order is dmy.',
    action:
      'Correct the declaration or the dates. The declared order is not used. In /convert this finding blocks the export.',
  },
  'CONV-DATE-ORDER-DECLARED': {
    checks:
      'The day and month order declared for a date column was used for its ambiguous dates. It applies to the date written, the date inside an identifier and the date compared in a join.',
    fires:
      'When a declared order (dayMonthOrder, or yyOrder for NN-NN-NN dates) is applied to a column. Information only.',
    example:
      'The person declared day first for the column "Date", so 03/04/2024 is 3 April everywhere.',
    action:
      'Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.',
  },
  'CONV-DECIMAL-DECLARED': {
    checks:
      'The comma in the numbers of a column was read as the person declared, a decimal comma or a thousands separator, everywhere the column is used.',
    fires:
      'When a declared reading (decimalReading) is applied to a column. Under thousands every cell written n,nnn is read without its commas; under decimal the column is read as it was. Other columns are not affected. Information only.',
    example:
      'The cells 1,250 of the column "Count" were declared a thousands separator and are read as 1250.',
    action:
      'Nothing to answer. "Ask again" takes the answer back. The saved answer holds only while the column and the same number of rows are found. In /convert this note is only shown.',
  },
  'CONV-MISSING-CODE-DECLARED': {
    checks:
      'Cells holding exactly -99, -999 or -9999 in a number column were handled as the person declared: as missing values or as real values.',
    fires:
      'When the answer to ROW-MISSING-CODE (missingCode) is applied to a column. Missing means the cells are left empty before the sheet is read and listed with the reason missing-code; real means they are written as they are. Other columns are not touched.',
    example:
      '4 cells of the column "Depth" hold -999, and the person answered missing. No depth is written for them.',
    action:
      'Nothing to answer. "Ask again" takes the answer back. In /convert this note is only shown.',
  },
  'CONV-ENCODING-DECLARED': {
    checks:
      'The bytes of the file are not UTF-8 and read differently in several code pages, so the person picked one. The whole file is read with it before any other step.',
    fires:
      'When the answer to IN-ENCODING-AMBIGUOUS is applied. The pick is kept in the companion file as encoding, with a hash of the file bytes, and applies to a file with the same bytes only. Information only.',
    example:
      'The file read differently as windows-1250 and ISO-8859-2, and the person picked windows-1250, so the letters are read that way in the archive.',
    action:
      'Nothing to answer. "Ask again" takes the pick back. In /convert this note is only shown.',
  },
  'CONV-ZERO-WITH-BIOMASS': {
    checks:
      'A row of a long sheet has a quantity of 0 and a weight above zero. The two contradict each other, and the row is left out, neither present nor absent.',
    fires:
      'For every row with a taxon, the quantity 0 and a biomass above zero, whatever the full species list tick says. Its biomass is not written either.',
    example:
      'Line 60 has the count 0 and the weight 1.2 g. It is left out.',
    action:
      'Check which value is wrong and correct the sheet. In /convert this warning must be accepted once.',
  },
  'CONV-SAMPLE-PER-ROW': {
    checks:
      'A long sheet gives almost one sample event for each occurrence, and many events share station, date and depth. It may be one sample cut into rows by a different code on each.',
    fires:
      'For a long sheet without a profile when the output has at least 30 occurrences, the events are at least 80 percent of them, and at least half of the events share a place (station, date, time text, depth and position) with another event. The shared events count only when at least 90 percent of the events have exactly one taxon row and the places do not repeat a taxon of an earlier event; alternatively the finding rests on strong evidence, more events than occurrences. Checked on the output, whoever wrote the codes.',
    example:
      '100 occurrences with 95 events, each event with one taxon row, 60 of which share station, date and depth with another event and do not repeat a taxon.',
    action:
      'Accept if these are real replicates. If one sample was cut into rows, use a code that names the sample (the sample key on the page). In /convert this warning must be accepted once.',
  },
  'CONV-ZERO-SKIPPED': {
    checks:
      'Zero cells were left out because the species list was not declared complete. A zero means absent only when every species of the list was looked for in the sample.',
    fires:
      'When a numeric 0 is in a quantity cell and the full species list tick is off, which is the default. In a presence list the same holds for marks of absence such as "-" or "absent" (variant presence). An empty or NA cell never becomes a record either.',
    example:
      '37 zeros in a count table were not converted, because the full list was not ticked.',
    action:
      'Tick the full species list (kept as fullList) if every species was looked for, and zeros become absent records. Otherwise accept once. In /convert this note must be accepted once.',
  },
  'CONV-SAMPLE-CONFLICT': {
    checks:
      'The rows of one sample differ in a value that must be the same for the whole sample. A sample is one event, and the first row is not silently preferred.',
    fires:
      'For every sample whose rows differ in a sample-level value such as position, date or depth. The finding names what differs, the sample and the lines.',
    example:
      'Sample S5 has two rows with different dates, 2024-05-03 and 2024-05-04.',
    action:
      'Make the values equal in the source, or use a sample code that separates the samples. In /convert this finding blocks the export.',
  },
  'CONV-REPLICATE-EVENTS': {
    checks:
      'A column read as the replicate number makes replicate events under the sample events.',
    fires:
      'Once per sheet with a replicate column. The note gives the column and the number of replicate events.',
    example:
      'The column "Rep" with 1, 2 and 3 makes 3 replicate events under each sample.',
    action:
      'If these are not replicates, change the meaning of the column. In /convert this note is only shown.',
  },
  'CONV-TAXON-ATTRIBUTE-IGNORED': {
    checks:
      'Columns that give the same value for every row of one taxon (a species code, an identifier, a trophic group) are attributes of the taxon, not measurements, and were not written.',
    fires:
      'For a numeric column that the tool itself proposed to ignore, whose value is a function of the taxon column but varies between samples, with at least two values overall, no unit and no size word, and either a name that says code, id, tsn, key, serial or trophic, or when at least 3 taxa are listed more than once and cover half of all taxa. A text column is never listed, and a column the person set is not listed.',
    example:
      'A column "TSN" holds the same number on every row of one species and is not written.',
    action:
      'If it is a measurement, give the column a meaning. Otherwise accept once. In /convert this note must be accepted once.',
  },
  'CONV-VALUE-PER-OCCURRENCE': {
    checks:
      'Measured-variable columns are written on the occurrences of the rows, not on the sample. Their values differ inside a sample like the values of single organisms.',
    fires:
      'For measured-variable columns of a long sheet written as measurements of the occurrence of each row. The note lists the columns. Information only.',
    example:
      'The column "Length [mm]" differs on each fish row of a sample, so it is written on each occurrence.',
    action:
      'If the rows are really two samples under one code, untick "of each organism" on the column (kept as perOccurrence) and fix the sample code. In /convert this note is only shown.',
  },
  'CONV-NERC-UNKNOWN': {
    checks:
      'There is no confirmed NERC concept for a measured variable, so measurementTypeID stays empty. OBIS requires a vocabulary term there.',
    fires:
      'For a measured-variable column, or the quantity column (an abundance class, or a density or biomass per area of the water column), for which no concept is confirmed. An identifier is written only when it was confirmed for that column; nothing is guessed. A quantity column cannot be confirmed in the table below the columns.',
    example:
      'A column "Temp" has no confirmed concept, so measurementTypeID is empty.',
    action:
      'Confirm or choose a concept in the table below the columns, optionally with the NVS search in English words such as temperature. Or choose it by hand before publishing. In /convert this warning must be accepted once.',
  },
  'CONV-NERC-UNIT-MISMATCH': {
    checks:
      'The confirmed concept of a column refers to a different basis, per unit mass or per unit volume, than the unit of the column.',
    fires:
      'When the label of the confirmed P01 concept states a dimension that contradicts the dimension of the unit: per mass against per volume, or a percentage unit (%, percent, pct) against a concept that states any per-mass or per-volume dimension. The pair is the choice of the person and is written as confirmed; nothing is converted.',
    example:
      'A chlorophyll concept per unit volume is confirmed for a column with the unit mg/kg.',
    action:
      'Check that the concept and the unit belong together, and change one of them if not. In /convert this warning must be accepted once.',
  },
  'CONV-NERC-CODE-MALFORMED': {
    checks:
      'A header names a vocabulary code after an explicit SDN prefix, but the code is not of the shape of a code of that collection. NVS has no such concept.',
    fires:
      'When the code after SDN:collection:: is not the required number of capital letters and digits. No identifier is written from it; the column stays a measured variable.',
    example:
      'The header names SDN:P01::TEMPPR01X with one extra letter. The finding quotes the code and the required length.',
    action:
      'Check the code for a typo or an extra character, and correct the header. Or confirm a concept for the column. In /convert this warning must be accepted once.',
  },
  'CONV-UNIT-NO-P06': {
    checks:
      'There is no confirmed NERC unit concept (P06) for a unit, so measurementUnitID stays empty. The unit is written as given and not converted.',
    fires:
      'For a unit with no confirmed P06 concept: the unit of a measured variable, the quantity unit, the biomass unit, the effort unit, or a pressure unit that is not decibars. An identifier is written only when the person confirmed it for that column; the units of the quantity, biomass and effort cannot be confirmed in the table below the columns.',
    example:
      'The unit "cells per ml" has no confirmed P06 concept, so it is written as text only.',
    action:
      'Confirm or choose a unit for the column in the table below the columns. In /convert this warning must be accepted once.',
  },
  'CONV-COLUMN-UNNAMED': {
    checks:
      'A column has no name in the header of the file, and its name would go into the archive as the name of a variable or a taxon.',
    fires:
      'For a column to the right of the last named header cell (a blank cell in the middle of the header is left as it is) that is mapped as a variable still named Column N, or as a taxon header (IN-HEADER-SHORT). The internal name is Column N.',
    example:
      'The header names stop at the fourth column, and the fifth column holds numbers, so it would be written as a variable named Column 5.',
    action:
      'Type a name for the variable, or choose another meaning for the column, for example Ignore. In /convert this finding blocks the export.',
  },
  'CONV-LONG-UNSUPPORTED': {
    checks:
      'A sheet is in the long layout, a row per parameter, with a parameter column and a value column, and has no taxon and no quantity column. The converter cannot read it.',
    fires:
      'When a header names a parameter and a value column, and the sheet has no taxon, quantity or other variable column, but cannot be read as a long one: fewer than two distinct parameters (one-parameter), more than 200 distinct parameter and unit pairs (too-many), or another reason. The finding gives the reason. A parameter or value column that the person mapped to another role also unblocks the sheet.',
    example:
      'A sheet has the columns Station, Parameter and Value, with only one distinct parameter. It cannot be read.',
    action:
      'For one parameter, or for too many pairs, split the sheet or keep only the needed parameters. Otherwise reshape it to one column per parameter, with the unit in the header (for example Temp [degC]), and load it again, or remap the parameter or value column. Or leave the sheet out. In /convert this finding blocks the export.',
  },
  'CONV-SHEET-TRANSPOSED': {
    checks:
      'The table looks transposed, with variables or species in rows. Row 1 would be read as the header, so the sheet was not read.',
    fires:
      'When variables are in rows, or when species are in rows: at least 3 Latin names make up at least 60 percent of the first column, there are at least 2 other headers, and at least 80 percent of the cells are numbers or marks (+, x, *). A normal wide sheet with species as headers is never flagged. The sheet is not converted.',
    example:
      'The first column lists species and the other columns are the samples S1, S2, S3.',
    action:
      'Transpose the table in your spreadsheet (samples in rows, species or variables in columns) and load it again, press the turn button on the page, or tick "Read as a normal table" for the sheet (kept as transposedAsTable). In /convert this finding blocks the export.',
  },
  'CONV-SHEET-UNITS-ROW': {
    checks:
      'The first row under the header looks like units (m, degrees_north) but could not be folded into the header, so the sheet was not read.',
    fires:
      'Only when the units row could not be folded into the header: text or codes stand under some of the unit columns, or a row with a non-unit cell and at least two unit cells has numbers below. The clean case, units over numbers, is folded into the header silently and raises nothing.',
    example:
      'Line 2 holds m, degrees_north and a word under the header Depth, Latitude and Station, and the Station column holds text codes below. The row is not folded, so it is reported.',
    action:
      'Write the units into the column names, for example "depth [m]", and load the file again, or tick "Read as a normal table" if the row is data (kept as transposedAsTable). In /convert this finding blocks the export.',
  },
  'CONV-LONG-READ': {
    checks:
      'A long environmental sheet, one row per measurement, was read as one row per sample. The rows are only regrouped; no value is summed, averaged or rounded.',
    fires:
      'When a sheet with a parameter column and a value column was regrouped; the regrouping is automatic. The note gives the number of samples and the parameter columns, one per parameter and unit, headed name [unit]. Information only.',
    example:
      '240 rows with parameters Temperature and Salinity became 60 samples with two parameter columns.',
    action:
      'Nothing to answer. Check the parameter columns. To undo the regrouping, tick "read as a normal table" for the sheet (kept as longAsTable). In /convert this note is only shown.',
  },
};

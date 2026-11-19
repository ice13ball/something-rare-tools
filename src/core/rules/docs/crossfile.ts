// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/*
 * Cross-file rules. Each text was checked against src/core/checks/crossfile.ts, the only place that raises these ids. They compare tables with each
 * other, so they need at least two tables: two files, or two sheets of one workbook (a sheet is a table of its own). No number in the code is a
 * quality-control threshold: "equal" always means equal within the rounding of the two reported values (the difference is at most half a unit of the
 * last decimal of each), the same rule for positions, depths and measured values. In every tool these rules are only shown.
 */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'XF-DUPLICATE-SAMPLES': {
    checks:
      'Two files hold the same samples. If both are used for one analysis, the samples count twice and any statistic is biased towards them.',
    fires:
      'For every pair of tables that share at least one recognised variable. A sample of one table matches a sample of the other when it has the same station (names compared after normalisation, as for XF-STATION-ALIAS) or, for rows without a station, the same position within the rounding of the coordinates; the same calendar day (a date with no day is never matched); and the same depth in the same unit, within rounding (a depth in one unit is never matched to a depth in another, and two missing depths match each other). Each row matches at most one row of the other table. A match counts only when at least one shared variable has a value in both rows, so the same place and time measured for different variables is one sample, not a duplicate. One finding per pair of tables, with the number of matched rows.',
    example:
      'The sheets "Cruise A bottles" and "Cruise A CTD" both have a row for station S12 on 2019-05-03 at 10 m with a temperature value; the pair is reported with the number of such rows.',
    action:
      'Decide which table is the source of record and drop the other rows, or keep both and make sure the analysis counts each sample once. Two tables that really are the same measurement published twice are a common case in a data release. In /convert this finding is only shown and never stops the export.',
  },
  'XF-DATE-CONFLICT': {
    checks:
      'The same station and depth appear in two files with the same values but different dates. One of the dates is probably wrong, for example a day and month swapped, or a year typed over.',
    fires:
      'For every pair of tables that share at least two recognised variables. Rows of the two tables are paired by normalised station name and the same depth (same unit, within rounding; two missing depths agree). Both rows must have a date known to the day, and the dates must differ. For every shared variable that has a value in both rows the values are compared: the rule fires when at least two variables are equal and none differs. One finding per station and pair of tables, giving the station, the two dates and one example line of each file. When one of the two dates is a two-digit-year date from a column whose order is open (see ROW-DATE-YY-AMBIGUOUS) and it was read in the default order, a sentence says that the conflict may come from the reading rather than from a wrong date.',
    example:
      'Station S12 has temperature 11.4 and salinity 35.1 at 10 m in two files, dated 2019-05-03 in one and 2019-03-05 in the other; the pair of dates is reported.',
    action:
      'Find which date is right from the logbook or the other file and correct the wrong one. When the finding says that a two-digit-year date may have been misread, write the year with four digits, or in /convert state the order of that column (see ROW-DATE-YY-AMBIGUOUS); the conflict is then judged on the settled reading. In /convert this finding is only shown and never stops the export.',
  },
  'XF-STATION-ALIAS': {
    checks:
      'Two station names that differ only in spelling occur in the loaded tables, so they are probably the same station written in two ways. Left as they are, the station is split into two in any grouping by name and the other cross-file rules cannot match it.',
    fires:
      'Across all loaded tables, when two different station names become equal after normalisation: only the part after the last slash is kept, letters are made upper case and spaces are removed. A name that is the same in every table is not reported. One finding per pair of spellings; the first spelling is the one that is used by the most tables, then by the most rows. The finding names both spellings.',
    example:
      'One file calls a station "ST 7" and another calls it "st7"; "ST 7" and "st7" are reported as the same station.',
    action:
      'Choose one name for the station and use it in every file. The tool does not rename anything. In /convert this finding is only shown and never stops the export.',
  },
  'XF-UNIT-CONFLICT': {
    checks:
      'The same variable has the same numbers in two files, but one file labels them per volume and the other per mass. If the numbers are equal, at least one label is wrong; a per-litre and a per-kilogram value of a nutrient differ by about the density of the water, a few per cent, and an amount of substance per volume and per mass are not the same unit.',
    fires:
      'For every pair of tables that share a recognised variable, when one table gives it in a unit of amount per volume (for example µmol/L) and the other in a unit of amount per mass (for example µmol/kg), and more than half of the samples that match in both tables (the matching of XF-DUPLICATE-SAMPLES) and have a value in both are equal within rounding. One finding per variable and pair of columns, giving the number of matched samples and how many of them are equal. Units that are in the same dimension, such as mg/L and µmol/L, are not compared here (CHEM-UNIT-PAIR looks at those within one table). Sources: the GLODAPv2 conversion of per-litre to per-kilogram values with seawater density, and the UNESCO seawater density tables.',
    example:
      'Nitrate is 5.2, 8.9 and 12.4 in a file labelled µmol/L and the same three numbers in a matching file labelled µmol/kg; all three matched samples are equal, so the units are reported.',
    action:
      'Find which label is correct from the methods of the data and correct the wrong one; if a conversion was meant, convert the numbers with the density of the water instead of copying them. In /convert this finding is only shown and never stops the export.',
  },
  'XF-POSITION-SWAP': {
    checks:
      'Two stations have exchanged positions between files: the position of station A in one file belongs to station B in the other, and the other way round. Names were probably mixed up in one of the files, which puts every value of both stations in the wrong place.',
    fires:
      'For every pair of tables that both give positions for the same station names. Each station gets a representative position in each table (the most frequent rounded position of its rows; rows whose latitude equals their longitude are ignored, as ROW-LAT-EQ-LON reports them). A swap is found when two stations both moved between the tables (their positions do not agree within rounding), are distinct places in each table, and the exchanged assignment is strictly closer than the same-name assignment in both directions, with each being the other\'s best partner. A table swapped against several others is named once, with its partners listed together. Stations that are part of a swap are not also reported by XF-POSITION-CONFLICT.',
    example:
      'Station S1 is at 54.10 N, 18.60 E and S2 at 54.40 N, 19.10 E in one file; in the other S1 is at 54.40 N, 19.10 E and S2 at 54.10 N, 18.60 E.',
    action:
      'Check the station names against the logbook and correct the file with the names mixed up. In /convert this finding is only shown and never stops the export.',
  },
  'XF-POSITION-CONFLICT': {
    checks:
      'The same station is at clearly different positions in different files. One of the positions is wrong or the name is used for two places, and every value of the station is mapped to the wrong location.',
    fires:
      'For every station name that occurs in at least two tables and is not part of a swap. Each table gets a representative position (the most frequent rounded position of the station\'s rows, with the range of all its rows). Two tables disagree when neither one\'s representative position lies inside the range the other one spans, with rounding of both included, so a station sampled along a short track is not flagged for a point on it. With two tables both are named. With three or more, only an outlier is reported: one that disagrees with every other table and lies farther from each of them than any two of the others lie from each other; when the others are sheets of one workbook they count as one source and both sides are named. The finding lists the position in each table and the largest offset in kilometres. No distance tolerance is applied, because no citable one exists.',
    example:
      'Station S5 is at 54.20 N, 18.70 E in one file and at 54.20 N, 81.70 E in another; the two positions and the offset are reported.',
    action:
      'Check the station position against the logbook and correct the wrong file; if the name has been used for two different places, give them different names. In /convert this finding is only shown and never stops the export.',
  },
};

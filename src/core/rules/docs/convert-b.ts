// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
import type { RuleDoc } from './types';

/** Descriptions of the converter rules, part b (registry order; see convert.ts). */
export const DOCS: Readonly<Record<string, RuleDoc>> = {
  'CONV-LONG-FLAG-COLUMNS': {
    checks:
      'Quality-flag columns of a long sheet are left out of the sample key and are not written. A flag says how good a value is, not which sample it belongs to, so using it in the key would split one sample into several.',
    fires:
      'Fires once per long sheet that has one or more columns the converter reads as quality flags by their name (for example "flag" or "QC"). The columns are left out by name, not by your answer. Raised for long sheets only.',
    example:
      'A long sheet has the columns Station, Date, Parameter, Value and Value_flag. Value_flag holds the letters G and B. The column is left out and named in the message.',
    action:
      'Nothing to answer. The outcome comes from a tool default, so it is accepted once before the export. If the column carries data you want in the archive, give it another meaning in the role table of the sheet.',
  },
  'CONV-LONG-FLAG-PARAMETERS': {
    checks:
      'Rows of a long sheet whose parameter name reads as a quality flag are skipped. A flag is not a measurement, so no column is made for it and nothing is written.',
    fires:
      'Fires once per long sheet when one or more distinct parameter names read as flags (for example "QC flag"). All rows with those names are skipped, and the message counts both the names and the rows.',
    example:
      'A long sheet has Parameter values Temperature, Salinity and Salinity QC flag. The 40 rows named Salinity QC flag are skipped; the other rows are converted.',
    action:
      'Nothing to answer. The rows are left out because of the parameter name, not by your answer, so the outcome is accepted once before the export. To keep such rows, rename the parameter in the sheet so it no longer reads as a flag.',
  },
  'CONV-LONG-RENAMED': {
    checks:
      'Two parameters of a long sheet would make two columns with the same header. A header must be unique, so the converter adds a number in brackets to the repeated one and tells you which.',
    fires:
      'Fires once per long sheet when a parameter column header equals the header of another column. The count is the number of renamed headers. Only the new header changes; the data does not.',
    example:
      'A long sheet has a parameter called Depth and a column called Depth. The parameter column becomes Depth (2).',
    action:
      'Nothing to answer; the finding is only shown and never blocks the export. To avoid the number, rename one of the two in the sheet.',
  },
  'CONV-LONG-DROPPED': {
    checks:
      'Key columns of a long sheet that you marked as describing the measurement, not the sample, are left out of the sample key and their values are not written. The archive has no place for a value per measurement.',
    fires:
      'Fires once per long sheet when at least one key column was marked by you as describing the measurement. It names the columns and counts them. It does not fire for columns left out by name (those are CONV-LONG-FLAG-COLUMNS).',
    example:
      'You marked the columns Analyst and Comment of a long sheet as describing the measurement. Their values are not in the archive and the message lists both.',
    action:
      'Nothing to answer; the finding is only shown. It follows from your own choice. To write the values, remove the mark in the role table of the sheet.',
  },
  'CONV-LONG-KEY-VARIES': {
    checks:
      'Rows of a long sheet that share station, date and depth but differ in another column are read as different samples. If the difference only describes the measurement (a comment, an analyst), you would get several samples where there is one.',
    fires:
      'Fires when rows that share every position and identity column (station, cruise, sample, date, time, depth, pressure, position) differ in one or more other columns, in at least one sample. The message names the columns and counts the samples.',
    example:
      'Two rows of Station A on 2024-05-01 at 10 m differ only in a Comment column ("clear" and "turbid"). They become two samples.',
    action:
      'If the column describes the measurement, mark it as such in the role table of the sheet: it leaves the key and is not written. If the samples really differ, accept the finding once. The split is a tool default, so the export needs the acceptance.',
  },
  'CONV-LONG-DUPLICATE': {
    checks:
      'One sample of a long sheet has the same parameter and unit on more than one row. The converter never sums or merges such rows, because it cannot know whether they are repeats, replicates or an error.',
    fires:
      'Fires when rows agree on every column except parameter, unit, value and quality flag, and the parameter and unit repeat, whatever the values. The message lists the lines. It is not raised for rows you left out with the reason repeated-parameter.',
    example:
      'Station A, 2024-05-01, 10 m has two rows with the parameter Temperature, valued 11.2 and 11.4.',
    action:
      'Tell the samples apart in another column (cast, replicate, depth), or leave the repeated rows out and list them with the reason repeated-parameter; the first value is then written and the later ones are listed. The export is blocked until one of these is done.',
  },
  'CONV-LONG-NO-PARAMETER': {
    checks:
      'A row of a long sheet has a value and an empty parameter cell. Without the name the converter cannot say what was measured, so nothing can be written for it.',
    fires:
      'Fires when a row has a value and nothing in the parameter column. The message gives the count and the lines. It is not raised for rows you left out with the reason empty-parameter.',
    example:
      'Row 12 of a long sheet holds the value 7.9 and an empty Parameter cell.',
    action:
      'Type the parameter name in the sheet, or leave the rows out and list them with the reason empty-parameter. The export is blocked until one of these is done.',
  },
  'CONV-TURN-HEADER-BLANK': {
    checks:
      'In a turned sheet (its samples are the columns) the header of each sample column becomes the sample code. A column with values and an empty header has no code.',
    fires:
      'Fires on a sheet declared as turned when one or more columns right of the name column hold values and have a blank header. Those columns are not turned.',
    example:
      'A turned sheet has the headers Name, S1, S2 and an empty header above a third column of numbers.',
    action:
      'Type the header in the sheet, or declare the column as not a sample in the turned-sheet form (setting turned=<sheet>:<nameHash>:<rows>:<notSampleHashes>). The export is blocked until then.',
  },
  'CONV-TURN-HEADER-REPEATED': {
    checks:
      'In a turned sheet two sample columns with the same header would get the same sample code. The converter does not choose between them.',
    fires:
      'Fires when the trimmed header is used by two or more columns right of the name column. None of those columns is turned. The message names the header and the columns.',
    example:
      'A turned sheet has the headers Name, S1, S1, S2. The header S1 is on two columns.',
    action:
      'Make the headers different in the sheet, or declare the extra columns as not samples in the turned-sheet form (the notSampleHashes part of turned=...). The export is blocked until then.',
  },
  'CONV-TURN-NAME-BLANK': {
    checks:
      'In a turned sheet each source row becomes a column named by the name column. A row with values and no name cannot become a column.',
    fires:
      'Fires when a source row of a turned sheet holds a value and nothing in the name column. The rows are listed with the reason turn-no-name.',
    example:
      'A turned sheet has a row with the values 3 and 5 under S1 and S2 and an empty name cell.',
    action:
      'Type the names in the sheet, or leave the rows out and list them with the reason turn-no-name. The export is blocked until then.',
  },
  'CONV-TURN-NAME-REPEATED': {
    checks:
      'In a turned sheet a row name must be unique, because it becomes a column name. A name is data, so the converter never renames it to make it unique.',
    fires:
      'Fires when the trimmed, case-blind name is used by two or more source rows, or equals a column the turn adds (Sample, Date). None of those rows is turned. The message names the name and the lines.',
    example:
      'A turned sheet has two rows named Temperature, or one row named Sample.',
    action:
      'Make the names distinct in the file, or leave the rows out and list them with the reason turn-name-repeated. The export is blocked until then.',
  },
  'CONV-SHEET-TURNED': {
    checks:
      'Reports that a sheet was turned as you declared: named rows became columns and sample columns became rows. Every cell is unchanged. It lets you check the counts.',
    fires:
      'Fires once for each sheet declared as turned. It gives the number of rows that became columns and the number of sample columns that became rows. Information only.',
    example:
      'A sheet with 6 named rows and 12 sample columns is turned into a sheet of 12 samples with 6 columns.',
    action:
      'Nothing to answer; the finding is only shown and never blocks. To undo it, remove the turned declaration (setting turned=<sheet>:...).',
  },
  'CONV-DEPTH-UNIT': {
    checks:
      'Darwin Core depth is in metres. A depth column with another unit cannot be written unless the converter has an exact factor for it.',
    fires:
      'Fires when a depth column states a unit that is not metres and not one of the converted units (fathom, foot, km). A centimetre depth is usually a depth in sediment and blocks too. Nothing is written from the column.',
    example:
      'A depth column is headed "Depth (cm)" in a water-column sheet.',
    action:
      'Give metres, or correct the unit of the column in the role table. For a depth in sediment choose the meaning "Depth below seafloor". The export is blocked until then.',
  },
  'CONV-DEPTH-CONVERTED': {
    checks:
      'A depth in fathoms, feet or km was converted to metres with an exact factor. The original text is kept in verbatimDepth. You confirm that the unit in the header is right.',
    fires:
      'Fires when a depth column has the unit fathom (fm), foot (ft) or km. The arithmetic is exact, on the digits of the cell. The message shows the factor and one example.',
    example:
      'The cell "10 ft" is written as 3.048 m and verbatimDepth keeps "10 ft".',
    action:
      'Check the unit in the header. Accept the conversion once before the export; the outcome is a tool step, not your answer. If the unit is wrong, correct it in the role table.',
  },
  'CONV-SEAFLOOR-UNIT': {
    checks:
      'A column with the meaning "Depth below seafloor" can be converted only from centimetres or metres. Another unit has no exact factor here.',
    fires:
      'Fires when the unit of such a column is neither cm nor m. Nothing is written from the column.',
    example:
      'A depth-below-seafloor column has the unit "inch".',
    action:
      'Set the unit of the column in the role table to cm or m. The export is blocked until then.',
  },
  'CONV-SEAFLOOR-VALUE': {
    checks:
      'Values of a depth-below-seafloor column are shifted from cm to m on their text, exactly. A cell that is not a plain decimal number cannot be shifted.',
    fires:
      'Fires when a cell is not a plain decimal number, for example one with an exponent (1e2) or with degrees (notation). The message names the reason, one example and the lines. The cells are not written.',
    example:
      'A depth-below-seafloor column holds "1.2e1" in line 7.',
    action:
      'Retype the cells as plain decimal numbers in the sheet. The export is blocked until then.',
  },
  'CONV-SEAFLOOR-SIGNS': {
    checks:
      'In a depth-below-seafloor column most cells have one sign. Cells with the opposite sign are written on the other side of the seafloor. You confirm the direction.',
    fires:
      'Fires when some cells have the sign that most cells do not have. The direction is taken from the majority of signs (a tool default). The opposite cells are written as a distance above or below the seafloor (positive above, negative below).',
    example:
      'Of 50 values, 48 are negative (below) and 2 are positive. The 2 are written as above the seafloor.',
    action:
      'Check that the direction is right and correct the signs in the sheet if not. Otherwise accept once before the export.',
  },
  'CONV-SEAFLOOR-NO-SITE-DEPTH': {
    checks:
      'A depth below the seafloor needs the water depth of the site. Without it Darwin Core measures from the elevation reference, not from the seafloor.',
    fires:
      'Fires when rows have a depth below the seafloor and no minimum or maximum depth in metres. The message counts the rows and gives the lines.',
    example:
      'A sheet has a sediment depth column and no column with the depth of the water.',
    action:
      'Add the water depth of the site in metres and give it the meaning "Depth", or accept once that it is missing.',
  },
  'CONV-NO-OCCURRENCES': {
    checks:
      'OBIS publishes species records. An archive with no occurrence record is not an OBIS dataset, however much environmental data it holds.',
    fires:
      'Fires when the conversion produced zero occurrence records. A profile sheet with only levels and measurements gives none. It does not fire for a sheet where CONV-SPECIES-LIST-NO-COUNTS, CONV-TAXON-NO-QUANTITY or CONV-ENV-ONLY-SHEET already speaks.',
    example:
      'The upload is a single profile sheet of temperature and salinity levels with no taxon sheet.',
    action:
      'Add a sheet with taxa (species names with counts or presence). The export is blocked until at least one occurrence exists.',
  },
  'CONV-PROFILE-NOTHING-READ': {
    checks:
      'A sheet marked as a profile file must give at least one profile level. Marking a sheet that has none produces an empty result.',
    fires:
      'Fires when the sheet is marked as a profile file and yielded zero levels. The message gives the number of data rows.',
    example:
      'A sheet that only describes columns is marked as a profile file; its 8 data rows give no level.',
    action:
      'Unmark the profile file (do not set profile= for the sheet), or give the sheet a station column, depth or measured columns and rows with values. The export is blocked until then.',
  },
  'CONV-STATION-FROM-POSITION': {
    checks:
      'A sheet without a station column can treat each distinct position as a station. The station ID is made of the cruise code and the position as written.',
    fires:
      'Fires when the sheet has no station column and you ticked "each distinct position is a station". It gives the number of stations and the first one.',
    example:
      'Three distinct latitude and longitude pairs give three stations, the first named CR1:54.1_18.5.',
    action:
      'Nothing to answer; the finding is only shown. It reports your own choice. Untick it on the sheet form to undo.',
  },
  'CONV-EFFORT-INVALID': {
    checks:
      'A sample-size column must hold a positive number in each row, because sampleSizeValue needs one.',
    fires:
      'Fires when cells of the sample-size column are empty, zero or not a number. The message gives the count, the lines and one example.',
    example:
      'The sample-size column holds 0.5, 0 and "n/a" in three rows. Two rows are refused.',
    action:
      'Fill the column with positive numbers, or set the sample size to one constant in the sheet form. The export is blocked until then.',
  },
  'CONV-EFFORT-VALUE-INVALID': {
    checks:
      'A sample size typed in the sheet form must be a plain positive number with at most one decimal mark.',
    fires:
      'Fires when the typed value is refused for one of these reasons: not a number, not above zero, ambiguous (more than one separator) or thousands (a pattern such as 1,234). No effort is written.',
    example:
      'You type "1,234" as the sample size. It is refused as thousands.',
    action:
      'Type a number above zero, with a point or a comma as the decimal mark, or clear the field. The export is blocked until then.',
  },
  'CONV-NO-TAXON': {
    checks:
      'The converter needs a taxon and a quantity to make occurrences. A sheet with no column marked as taxon has nothing to name them with.',
    fires:
      'Fires when no column has the taxon role: for a wide sheet no taxon header columns, for a long sheet no taxon column. A long sheet with a taxon column and no quantity gets CONV-SPECIES-LIST-NO-COUNTS or CONV-TAXON-NO-QUANTITY instead.',
    example:
      'A wide sheet has the columns Station, Date and Temperature only.',
    action:
      'Mark the taxon columns (wide) or the taxon column (long) in the role table, and declare the quantity. The export is blocked until then.',
  },
  'CONV-SPECIES-LIST-NO-COUNTS': {
    checks:
      'A long sheet has a taxon column and no numbers. It may be a list of species found. The converter does not guess that, because no count means nothing is quantified.',
    fires:
      'Fires on a long sheet with a taxon column and no quantity column. It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet.',
    example:
      'A sheet lists Station A with the species Mytilus edulis and Macoma balthica, and nothing else.',
    action:
      'Tick "This is a list of species found (presence only, no counts)" for the sheet (companion setting presenceOnly=<sheet>); each row then becomes a present occurrence with no quantity. Or add a quantity column and declare it. The export is blocked until then.',
  },
  'CONV-PRESENCE-VALUE': {
    checks:
      'In a species list ticked as presence only, a wide cell is read as a mark. A value that is not a mark is not guessed.',
    fires:
      'Fires when a cell holds anything else than a mark or empty: for example a number above 1, a negative number or other text. Marks are x, X, +, *, a tick, 1, yes, y, tak, ja, oui, present and similar. Absence marks (0, -, absent, no, nie, nein, non) count only when the full-species-list tick is set.',
    example:
      'A cell holds 12 in a sheet ticked as presence only.',
    action:
      'Correct the cell to a mark or empty, or untick presence only for the sheet and declare what the numbers are. The export is blocked until then.',
  },
  'CONV-TAXON-NO-QUANTITY': {
    checks:
      'A long sheet has a taxon column and other measured columns but no quantity column. The converter cannot tell what the numbers count.',
    fires:
      'Fires on a long sheet with a taxon column, measured variable columns and no quantity column. It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet. A sheet with no numbers at all gets CONV-SPECIES-LIST-NO-COUNTS.',
    example:
      'A long sheet has Taxon, Station and Temperature, but no Count or Biomass column.',
    action:
      'Mark the column with counts, density or biomass as the quantity, or add one. The sheet is not converted and the export is blocked until then.',
  },
  'CONV-ENV-ONLY-SHEET': {
    checks:
      'A sheet of measured variables with no taxon cannot make occurrences. OBIS needs species records.',
    fires:
      'Fires when the sheet has measured variable columns and no taxon, quantity or unconfirmed taxon candidate. It replaces CONV-NO-TAXON, CONV-QUANTITY-UNDECLARED and CONV-NO-OCCURRENCES for that sheet. A profile sheet keeps CONV-NO-OCCURRENCES.',
    example:
      'A sheet has Station, Date, Temperature and Salinity only.',
    action:
      'If a column holds species names, mark it as the taxon. Otherwise add a sheet with species. The export is blocked until then.',
  },
  'CONV-SUMMARY-ROW-UNDECIDED': {
    checks:
      'A row that reads like a total or a statistic is not a sample. The converter holds it back and asks, because a station really called Total or Somme is a real station.',
    fires:
      'Fires when the sample code or station is a total word (total, suma, razem, summe, gesamt, somme) as the whole cell, or a statistics label (mean, average, median, sd and similar) in a block of two or more label rows with no date or position. A lone n, se, cv, min, max or count gives CONV-SUMMARY-ROW-KEPT instead.',
    example:
      'Three rows at the end of a sheet are labelled Mean, SD and Total, with no date or position.',
    action:
      'Answer for the sheet: "leave them out (summary rows)" or "keep (a real station or sample)", saved as summaryRows=<leave-out|keep>:<count>:<rows>:<sheet>. The answer holds for the same number of rows; a different number asks again. The export is blocked until you answer.',
  },
  'CONV-SUMMARY-ROW-SKIPPED': {
    checks:
      'Reports the rows you answered for after CONV-SUMMARY-ROW-UNDECIDED: left out as summary rows or kept as real samples.',
    fires:
      'Fires when the question was answered for this number of rows. With leave-out the rows are not converted and are listed among the rows not written with the reason summary-row. With keep they are read like any other row.',
    example:
      'You answered "leave out" for the two rows Mean and SD. They are in the list of rows not written.',
    action:
      'Nothing to answer; the finding is only shown. "Ask again" takes the answer back (it removes summaryRows= for the sheet).',
  },
  'CONV-SUMMARY-ROW-KEPT': {
    checks:
      'A row whose code is a short ambiguous label standing alone is kept as a sample, because it may be a real station. You are told so, in case it is not.',
    fires:
      'Fires for a sample code or station that is n, se, cv, min, max or count (a compass point such as N counts too), with no date and no position, not in a block of two or more label rows. The row is converted.',
    example:
      'One row has the station "N" with no date or position, in a sheet with no other label rows.',
    action:
      'If it is a real station, accept once. If it is not, correct the sheet and load it again. The outcome is a tool default, so the export needs the acceptance.',
  },
  'CONV-ID-REVISIT': {
    checks:
      'The same sample code at one station on rows that differ in date, time or depth is read as separate visits. Each visit gets its own event whose ID is made of the data.',
    fires:
      'Fires when a sample code repeats at one station and the rows differ in the fewest of date, time and depth that tell them apart (a long sheet never uses depth). The ID is <station>:<date>[T<time>][:<depth>m]:<code>. Rows identical in all of these stay a real duplicate (CONV-ID-DUPLICATE). The same code at another station is not a revisit.',
    example:
      'Sample code S1 appears at Station A on 2024-05-01 and on 2024-06-01. The two visits become two events.',
    action:
      'Check that the rows really are different visits and not a mistyped value. Accept once before the export, because the ID is made of the data.',
  },
  'CONV-REPLICATE-MISSING': {
    checks:
      'A replicate event gets the ID <sample event>:<replicate>. A row with no replicate value would get the ID of the sample itself.',
    fires:
      'Fires when a sheet has a column with the replicate or sub-sample role and some rows have no value in it. Those rows are not converted.',
    example:
      'A Replicate column holds 1, 2 and an empty cell in three rows of one sample.',
    action:
      'Fill the column, or give it another meaning (for example Ignore) if it does not number replicates. The export is blocked until then.',
  },
  'CONV-BIOMASS-KIND-UNSET': {
    checks:
      'Wet, dry and ash-free dry mass have different NERC concepts. If the kind of biomass is not known, the value is written with no measurementTypeID.',
    fires:
      'Fires when a biomass or weight column is written with measurementType biomass and the header names no kind and you chose none. The concepts are wet S0600088, dry S0600087 and ash-free dry S0600086. There is no default.',
    example:
      'A column headed "Biomass" has no word like wet, dry or AFDW.',
    action:
      'Choose the kind in the role list of the column (companion setting biomassBasis=<basis>:<sheet> with wet, dry or afdw), or accept once that no identifier is written.',
  },
  'CONV-EML-MISSING': {
    checks:
      'The dataset description (eml.xml and the datasetName and institutionCode columns) must be complete, or OBIS and BioCheck reject the archive.',
    fires:
      'Fires when one or more of these are missing or unusable: title, abstract, creator, contact name, contact email, institution code, dataset name. The message lists the fields.',
    example:
      'The form has a title and an abstract but no contact email.',
    action:
      'Fill the listed fields on the dataset description form. The export is blocked until then.',
  },
  'CONV-LICENCE-UNSET': {
    checks:
      'The licence is written only from an explicit choice. The rights holder decides, and the tool assumes nothing.',
    fires:
      'Fires when no licence is chosen. The offered ones are CC0-1.0, CC-BY-4.0 and CC-BY-NC-4.0.',
    example:
      'The licence field of the dataset form is left empty.',
    action:
      'Choose one of the three licences on the dataset form. The export is blocked until then.',
  },
  'CONV-BASIS-UNSET': {
    checks:
      'basisOfRecord is written on every occurrence and depends on what was actually collected. HumanObservation, PreservedSpecimen and MaterialSample mean different things, so there is no default.',
    fires:
      'Fires when basisOfRecord is not chosen on the dataset form.',
    example:
      'The kind of record field is left on "choose".',
    action:
      'Choose the kind of record on the dataset form. The export is blocked until then.',
  },
  'CONV-EMOF-ORPHAN': {
    checks:
      'Every measurement must refer to an event or occurrence that exists in the archive. One that does not would be rejected.',
    fires:
      'Fires when an eMoF row names an event or occurrence ID that is not in the table. The message gives the count, the kind and one example.',
    example:
      'A measurement row names occurrenceID occ-77 and the occurrence table has no such row.',
    action:
      'Correct the sheet so the measurement keeps its event or occurrence, and convert again. The export is blocked until then.',
  },
  'CONV-EMOF-EVENT-MISMATCH': {
    checks:
      'A measurement of an occurrence must sit in the event of that occurrence.',
    fires:
      'Fires when an eMoF row has an eventID different from the eventID of the occurrence it names. The message gives the count and one example occurrenceID.',
    example:
      'Occurrence occ-3 belongs to event E1, but its measurement row names event E2.',
    action:
      'Correct the sheet so the measurement and the occurrence share an event, and convert again. The export is blocked until then.',
  },
  'CONV-EMOF-VALUE-EMPTY': {
    checks:
      'A measurement without a value says nothing, and the archive would be rejected.',
    fires:
      'Fires when an eMoF row has an empty measurementValue. The message gives the count and the lines.',
    example:
      'A measurement row has the type "temperature" and an empty value.',
    action:
      'Fill the value in the sheet or remove the row, and convert again. The export is blocked until then.',
  },
  'CONV-EMOF-TYPE-EMPTY': {
    checks:
      'A measurement needs a kind (measurementType) so it is known what was measured.',
    fires:
      'Fires when an eMoF row has an empty measurementType. The type is the label of the verified NERC concept, or the meaning you declared.',
    example:
      'A column of numbers has no verified concept and no declared meaning.',
    action:
      'Declare what the numbers in the sheet mean in the role table. The export is blocked until then.',
  },
  'CONV-COLUMN-NOT-EXPORTED': {
    checks:
      'Columns with data that the conversion does not read as the sheet is set up are not written. You are told which, so nothing disappears silently.',
    fires:
      'Fires for columns with a role that is not read here (a pressure outside a profile file, a second column of a role read once, a role of the other sheet shape, the quantity type, a sample-size column when the sample size is not set to a column), for a column with data and an empty header (shown as its letter in brackets), and for a second quantity column. A column you set to ignore is CONV-COLUMN-IGNORED instead.',
    example:
      'A wide sheet has a Count column and a Biomass column, both as quantity. Only one is read; the second is named.',
    action:
      'Give the column a meaning that is read, or accept once that it is not written. The export needs the acceptance.',
  },
  'CONV-COLUMN-IGNORED': {
    checks:
      'Names the columns with values that you set to ignore, so it is clear they are not in the archive.',
    fires:
      'Fires when a column holds at least one value and you set its role to ignore (or you set an empty-header column to ignore). A column the converter proposed as ignore is CONV-COLUMN-IGNORED-PROPOSED.',
    example:
      'You set the column Remarks, which holds text, to ignore.',
    action:
      'Nothing to answer; the finding is only shown and never blocks. If a column carries data the archive should have, give it a meaning.',
  },
  'CONV-COLUMN-IGNORED-PROPOSED': {
    checks:
      'Names the columns with values that the converter proposed to ignore and you did not change, so nothing of them is written.',
    fires:
      'Fires when a column holds at least one value and has the role ignore because the converter proposed it (for example a Cast, Layer or Replicate column that does not separate rows). The file is not changed.',
    example:
      'A Cast column holds 1 on every row. The converter proposed ignore and you left it.',
    action:
      'Give the column a meaning, or accept once. The outcome is a tool default, so the export needs the acceptance.',
  },
  'CONV-COLUMN-YEAR-IGNORED': {
    checks:
      'A numeric column that always equals the year of the row date is a year beside the date, not a measurement. It is proposed as ignore.',
    fires:
      'Fires when a column the proposer would read as a measured variable holds whole years from 1800 to 2100 that equal the year of the date of the same row, on at least 3 rows with both filled. The first 500 rows are read, and the sheet must have a matching date column.',
    example:
      'A column Year holds 2023 on every row, and the Date column also has 2023.',
    action:
      'If it is a measurement, give it that role back with one click. If it is the sampling year of rows without a date, give it the meaning date. Otherwise accept once.',
  },
  'CONV-COLUMN-NUMBER-IGNORED': {
    checks:
      'A column of whole numbers that only rise or fall, or run one value per sample, is a counter or a sample number, not a measurement. It is proposed as ignore.',
    fires:
      'Fires when a column the proposer would read as a measured variable holds at least 3 whole numbers of six or more digits, all different and strictly rising or falling, or constant within a sample and strictly monotone across samples. The first 500 rows are read. Not raised on a long sheet with a taxon column and no quantity, where the column may be the counts. A column of dates written YYYYMMDD gets a hint to give it the meaning date.',
    example:
      'A column holds 100234, 100235, 100236 down the rows.',
    action:
      'If it is a measurement, give it that role back with one click; if it is a date as YYYYMMDD, give it the meaning date. Otherwise accept once.',
  },
  'CONV-NAMEID-MISSING': {
    checks:
      'Occurrences with no scientificNameID are reported as missing by OBIS and BioCheck. The ID is never guessed.',
    fires:
      'Fires when at least one occurrence has no scientificNameID. An ID is written only from a column you marked (a scientificNameID column, or an AphiaID column as a WoRMS LSID) or from a WoRMS result you confirmed.',
    example:
      'Twelve occurrences have a name and no ID column and no WoRMS lookup was done.',
    action:
      'Turn on the WoRMS lookup for a wide sheet (companion setting worms=yes) and confirm results, or mark a column holding the IDs in a long sheet. Otherwise accept once.',
  },
  'CONV-WORMS-UNDECIDED': {
    checks:
      'A WoRMS result that is not a single exact match is not accepted automatically. You choose a result or "no ID" for each name.',
    fires:
      'Fires when a looked-up name has a near or phonetic match, a genus-only match, an exact match under another name, several results or a deleted record, and you have not chosen. Only exactly one result with match_type exact under the name sent is automatic.',
    example:
      'The name "Macoma balthica" returns two records.',
    action:
      'For each name choose one of the results or "no ID" on the page. The export is blocked until every name is decided.',
  },
  'CONV-WORMS-NO-MATCH': {
    checks:
      'A name that WoRMS does not know keeps an empty scientificNameID, which OBIS and BioCheck report as missing.',
    fires:
      'Fires when the lookup returns no record for a name (an empty result, or HTTP 204 for a whole batch). The message names the names.',
    example:
      'The name "Mytilus edulus" (misspelt) returns nothing.',
    action:
      'Check the spelling, or write to WoRMS if the taxon is new. Otherwise accept once; the ID stays empty.',
  },
  'CONV-WORMS-NOT-MARINE': {
    checks:
      'A confirmed name whose WoRMS record is freshwater or terrestrial only may be the wrong taxon in a marine dataset.',
    fires:
      'Fires when the record has isMarine and isBrackish unset and isFreshwater or isTerrestrial set. A record with no habitat flag at all is unknown and does not fire. The ID is written as confirmed.',
    example:
      'The confirmed name Perca fluviatilis is a freshwater fish.',
    action:
      'Check that these are the right taxa. Accept once; the IDs are written as confirmed.',
  },
  'CONV-NAMEID-INCOMPLETE': {
    checks:
      'A name that has an ID on some rows of the sheet and none on others is incomplete. The rows without an ID stay without one.',
    fires:
      'Fires when a name has a taxon ID on some rows and none on others. A name with a sheet ID on any row is never sent to WoRMS and never given a WoRMS ID.',
    example:
      'The name Macoma balthica has an ID on 5 rows and an empty cell on 2.',
    action:
      'Complete the IDs in the sheet, or accept once.',
  },
  'CONV-NAMEID-CONFLICT': {
    checks:
      'A name with more than one distinct taxon ID in the sheet may be a mistake or two taxa sharing a name (homonyms). Nothing is changed.',
    fires:
      'Fires when a name has two or more distinct scientificNameID values in the sheet. Each row keeps its own ID.',
    example:
      'The name Cancer has the IDs 1001 and 1002 on different rows.',
    action:
      'Check that they are different taxa. If not, correct the sheet. Accept once to export as it is.',
  },
  'CONV-NO-SAMPLING-DESCRIPTOR': {
    checks:
      'BioCheck wants a sampling descriptor or effort in the measurement table: a sample size or a mesh size.',
    fires:
      'Fires only when the archive has an eMoF table and no row of it has a BODC effort code. A sample size is written as VOLWBSMP or AREABEDS, a mesh size as MSHSIZE1.',
    example:
      'The eMoF table holds only temperature rows.',
    action:
      'Give the sample size or the mesh size in the sheet form, or accept once.',
  },
  'CONV-DEVICE-MISSING': {
    checks:
      'BioCheck reports "No sampling instrument present" when no sampling device is given. The device is written as the measurement NMSPINST.',
    fires:
      'Fires when no sampling device is chosen for the sheet, so no NMSPINST row is written.',
    example:
      'The device field of the sheet form is empty.',
    action:
      'Choose the device in the sheet form (a known one, or other text), or accept once that it is missing.',
  },
  'CONV-MESH-INVALID': {
    checks:
      'A mesh size is written as MSHSIZE1 in micrometres. It must be a plain number above zero.',
    fires:
      'Fires when the typed mesh size is refused, for example text, zero, a negative number or a number with a unit. The message gives the reason.',
    example:
      'You type "200 um" in the mesh size field.',
    action:
      'Type the size in micrometres as a plain number (200), or leave it empty. The export is blocked until then.',
  },
  'CONV-NAMEID-APHIA-LIKE': {
    checks:
      'A column of whole numbers marked by hand as the taxon ID looks like WoRMS AphiaIDs, but the header does not say so. The values are written as given, not as WoRMS LSIDs.',
    fires:
      'Fires when you gave a column the taxon ID role, every filled cell is a positive whole number and the header is none of AphiaID, aphia_id, Aphia ID.',
    example:
      'A column headed "Code" holds 127160 and 140480.',
    action:
      'Rename the header to AphiaID to have the values written as WoRMS LSIDs, or accept once to write them as given.',
  },
  'CONV-LICENCE-DIFFERS': {
    checks:
      'The licence you chose differs from the one your dropped metadata files state. The archive would carry a licence different from its source.',
    fires:
      'Fires when a licence is chosen, at least one file states a recognised licence, and the choice is not among them. If the files disagree, it fires when the choice differs from at least one of them. Nothing fires when no licence is chosen (CONV-LICENCE-UNSET speaks).',
    example:
      'The metadata file says CC-BY-4.0 and you chose CC0-1.0.',
    action:
      'Accept this only if the rights holder has decided it. Otherwise change the licence on the dataset form.',
  },
  'CONV-PROFILE-STATION-UNMATCHED': {
    checks:
      'A profile station is matched to a biology station by exact text. A profile station with no match becomes a station event of its own.',
    fires:
      'Fires when a station of the profile sheet matches no station of the biology sheets. The match is exact on the trimmed station text, and on the cruise when the sheet gives one. Nothing is matched approximately.',
    example:
      'The profile sheet has the station "St 5" and the biology sheet has "St5".',
    action:
      'Correct the spelling, or accept once if no biology was sampled there.',
  },
  'CONV-PROFILE-STATION-FAR': {
    checks:
      'Two samplings at one station are close together. A matched profile station far from its biology station may be a wrong match.',
    fires:
      'Fires when a matched profile station lies more than 10 km (great-circle distance) from the biology station. The position of a profile station is that of its first level with one; that of a biology station is its first sample with one.',
    example:
      'The profile station "St 5" is 35 km from the biology station "St 5".',
    action:
      'Accept once if it is the same station, or correct the match.',
  },
  'CONV-PROFILE-STATION-CAST-MATCHED': {
    checks:
      'Reports the profile stations matched to a biology station by ignoring the cast number at the end of the name, as you allowed.',
    fires:
      'Fires when the ignore-cast option is ticked for the sheet and at least one station was matched that way. The message lists each pair as profile station and biology station.',
    example:
      'The profile station "St5-02" is matched to the biology station "St5".',
    action:
      'Nothing to accept; the finding is only shown. Check each pair. A pair farther apart than the limit also raises CONV-PROFILE-STATION-FAR. To undo, remove profileIgnoreCast=<sheet>.',
  },
  'CONV-PANGAEA-NAMES-FALLBACK': {
    checks:
      'In a PANGAEA file the parameter list in the header gives the long names of the columns. If it does not fit the columns, the table-header abbreviations are used as taxon names, and an abbreviation can stand for two taxa.',
    fires:
      'Fires when the Parameter block of a PANGAEA header does not match the table columns (another number of columns, or an abbreviation that is not what the column header starts with).',
    example:
      'The header lists 12 parameters and the table has 11 columns.',
    action:
      'Nothing to accept; the finding is only shown. Check the taxon names in the list.',
  },
  'CONV-PROFILE-LEVEL-INCOMPLETE': {
    checks:
      'Every event without children needs a date and a position in OBIS and BioCheck. A profile level takes them from its station, never from further up.',
    fires:
      'Fires when profile levels have no date or no position of their own and their station has none to give. A level never takes it from the cruise or from another station.',
    example:
      'A profile sheet has depths and temperatures but no date column, and no biology sheet has the station.',
    action:
      'Add a date or position column to the sheet, or add this station to the biology sheets. The export is blocked until then.',
  },
  'CONV-PROFILE-PRESSURE-NO-UNIT': {
    checks:
      'A pressure column with no unit is written without a unit, and level IDs cannot be made from it because they need decibars.',
    fires:
      'Fires when the pressure column of a profile sheet states no unit.',
    example:
      'A column headed "Pressure" with no unit in the name or in the unit field.',
    action:
      'Give the column a unit (for example dbar in its name or in the unit field), or accept once to export without a unit.',
  },
  'CONV-POSITION-NONE': {
    checks:
      'Every sample needs a latitude and a longitude, on itself or on a parent.',
    fires:
      'Fires when samples have no position and the sheet has no column mapped as latitude or longitude. A mapped column that is blank in every row gives the empty-column variant. The empty decimalLatitude and decimalLongitude of the output are not repeated.',
    example:
      'A sheet has Station, Date and Count, with no position columns and no joined sheet.',
    action:
      'Mark the latitude and longitude columns, join the sheet that describes the samples, or declare one position for the sheet (declaredPosition=<lat>:<lon>:<uncertainty>:<rows>:<sheet>). The export is blocked until then.',
  },
  'CONV-POSITION-DECLARED': {
    checks:
      'A position you declared for the whole sheet is written on its samples, although the file does not state it. The archive says so.',
    fires:
      'Fires when a declared position is applied. It is written on every sample event, with georeferenceRemarks saying it was declared by the person converting the data. It is never inferred, and only applied to a sheet with no latitude or longitude role.',
    example:
      'You declare 54.5, 18.6 with an uncertainty of 500 m for a sheet of 20 samples.',
    action:
      'Check the position and accept once. To change it, edit the declaration in the sheet form; it is saved in the companion file as declaredPosition=<lat>:<lon>:<uncertainty>:<rows>:<sheet>.',
  },
  'CONV-POSITION-DECLARED-INVALID': {
    checks:
      'A declared position that cannot be used is not applied, and nothing is written from it.',
    fires:
      'Fires for one of these reasons: latitude outside -90 to 90, longitude outside -180 to 180, uncertainty not a plain number above zero, position-role (the sheet has a latitude or longitude column, even a blank one; a declaration never fills gaps), position-joined (the joined description sheet gives positions) or profile (a profile sheet takes positions from its own columns).',
    example:
      'You declare latitude 95 for a sheet.',
    action:
      'Correct the declaration or remove it. For the last three reasons use the columns of the sheet instead. The export is blocked until then.',
  },
  'CONV-DATE-DECLARED': {
    checks:
      'A date you declared for the whole sheet is written on its samples, although the file does not state it. The archive says so.',
    fires:
      'Fires when a declared date or interval is applied. It is written as eventDate on every sample event, with eventRemarks and a line in the EML methods. It is never inferred, and only applied to a sheet on which no sample has a date. An interval over one year is marked long.',
    example:
      'You declare 2019-06 for a sheet of 12 samples.',
    action:
      'Check the date and accept once. To change it, edit the declaration in the sheet form; it is saved as declaredDate=<value>:<rows>:<sheet>.',
  },
  'CONV-DATE-DECLARED-HELD': {
    checks:
      'A date saved in the companion file no longer fits the sheet, so it is not applied. It does not block.',
    fires:
      'Fires when a saved declaredDate cannot be applied for one of these reasons: some-dated (a sample now has a date), date-joined (the joined description sheet gives dates), date-turned (a turned sheet has dates in its rows or columns) or profile (a profile sheet takes dates from its own columns).',
    example:
      'The companion file holds declaredDate=2019:30:Sheet1, but Sheet1 now has a date column.',
    action:
      'Accept once, or undo the declaration in the sheet form. The answer holds only for the same sheet name and row count.',
  },
  'CONV-DATE-DECLARED-INVALID': {
    checks:
      'A declared date that cannot be used is not applied, and nothing is written from it.',
    fires:
      'Fires for one of these reasons: format (not YYYY, YYYY-MM, YYYY-MM-DD or two of them joined by a slash), order (the interval ends before it starts), future (later than today), some-dated (a sample already has a date; a declaration never fills gaps), date-joined, date-turned or profile.',
    example:
      'You declare 2019-13 as the date.',
    action:
      'Correct the declaration or remove it. The export is blocked until then. CONV-EVENT-DATE-MISSING keeps its own answer.',
  },
  'CONV-EVENT-DATE-MISSING': {
    checks:
      'OBIS requires an eventDate on every sample. A station never gives its date to a sample; a replicate takes the date of its sample.',
    fires:
      'Fires when sample events have no eventDate. With how=blank-cells a date column exists and these samples have empty cells. With how=no-date-role nothing on the sheet is marked as a date.',
    example:
      'Five of 40 samples have an empty Date cell.',
    action:
      'Fill the date cells, mark the date column, or declare one date for the sheet (declaredDate=<value>:<rows>:<sheet>). For empty cells the samples can also be left out and listed with the reason no-event-date. The export is blocked until then.',
  },
  'CONV-PROFILE-NO-STATION': {
    checks:
      'A profile level is placed under its station, so every row needs one.',
    fires:
      'Fires when profile rows hold data and no station text. These rows are not converted.',
    example:
      'Twelve rows of a profile sheet have an empty Station cell.',
    action:
      'Map the station column, tick "each distinct position is a station", or fill in the empty cells. The export is blocked until then.',
  },
};

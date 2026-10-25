// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com

/*
 * The texts of the ⓘ explanations (src/app/components/InfoTip.tsx, registry src/app/tips.tsx), merged into the UI tables of ui.ts.
 * Every tip has two parts: `tip.<id>.does` (what it does) and `tip.<id>.logic` (the logic), each 1-3 short sentences or "• " bullets,
 * one per line.
 *
 * ⛔ No number, unit or source is typed here. Where a tip states one, the text holds a {placeholder} and src/app/tips.tsx fills it from
 * the rule definition or the constant (test/app/infotip-sources.test.ts fails on a digit written into a text, and on a rendered number that
 * differs from the rule). The only digits allowed are inside the names of standards and encodings (ISO 19139, UTF-8, windows-1250 ...).
 * ⛔ Never says that data are "ready to publish" (test/app/ui.test.ts).
 */
const en = {
  'tip.aria': `Explanation: {label}`,
  'tip.does': `What it does`,
  'tip.logic': `The logic`,
  'tip.ruleLink': `Rule details →`,
  'tip.roles.feeds': `used by rules`,
  'tip.encoding.label': `Text encoding`,

  'tip.role.ignore': `the column is not part of any check, nor of the clean CSV.`,
  'tip.role.latitude': `the north–south position of the point.`,
  'tip.role.longitude': `the east–west position of the point.`,
  'tip.role.datetime': `date and time in one column.`,
  'tip.role.date': `the date alone, without a time of day.`,
  'tip.role.time': `the time of day, combined with the date of the date column; without a date column it is not used.`,
  'tip.role.depth': `distance below the surface; you give the positive direction and the unit beside it.`,
  'tip.role.pressure': `the column is recognised, but no check or output file uses it.`,
  'tip.role.station': `the name or number of a station; groups the rows taken at one place.`,
  'tip.role.cruise': `in the ship-speed test, separates cruises and replaces the one-cruise tick.`,
  'tip.role.sampleId': `the id of a sample or core; when sheets are joined, it stands in for the station.`,
  'tip.role.variable': `a measured quantity; needs a name and a unit, and the tool never guesses the unit.`,

  'tip.dropZone.does': `Reads files from your computer so that they can be checked.`,
  'tip.dropZone.logic': `• Accepted extensions: {formats}.
• XML and JSON files are read as metadata (for example ISO 19139 or DataCite), the others as data tables.
• A .zip file is read as a Darwin Core Archive (OBIS or GBIF data).
• Files stay in your browser; nothing is uploaded.`,
  'tip.linkField.does': `Fetches a record from a repository by its link or DOI and checks its metadata and data files.`,
  'tip.linkField.logic': `• Recognised: Zenodo, PANGAEA, GBIF, OBIS, any DOI (through DataCite), Dataverse ({dataverse}) and GeoNetwork ({geonetwork}).
• Files are downloaded only from servers on the allowed list (see the Privacy page); for any other server, download the file yourself and drop it above.
• Size limits: through the server, a file from a link may be at most {maxFile} and an archive from an IPT server at most {maxArchive}; a file of a Dataverse dataset larger than {maxFile} is skipped.`,
  'tip.downloadMode.does': `Chooses who downloads the files behind a link: your browser or our server.`,
  'tip.downloadMode.logic': `• Browser: files go straight from the data server to you; some servers do not allow this.
• Abyssal Claims server: downloads the file for you from servers on the allowed list (at most {maxFile}, IPT archives at most {maxArchive}) and stores nothing.
• Files you drop here never leave your computer, in either mode.`,

  'tip.layout.does': `Shows how the tool understood the structure of the file, and lets you correct it.`,
  'tip.layout.logic': `• One table: one row is one sample.
• Long format: one row is one measurement; the tool turns it into one row per sample.
• Two sheets: measurements are joined to positions and dates through a key column.
• A layout it cannot read is not guessed at: it is reported, and the other tables are still checked.`,
  'tip.roles.does': `Tells the tool what each column is; this decides which checks cover it.`,
  'tip.roles.logic': `The tool never guesses a unit: a column with no stated unit stays without one.
{roles}`,
  'tip.encoding.does': `Shows which character encoding the file was read in; it decides whether accented letters and other special characters come out right.`,
  'tip.encoding.logic': `• UTF-8 is tried first (with or without a BOM).
• If the file is not valid UTF-8, the tool guesses an older encoding (windows-1250 or ISO-8859-2) and reports that it did.
• If characters look wrong, save the file as UTF-8 and load it again.`,
  'tip.singleCruise.does': `Switches on a test of whether the ship could have sailed between consecutive stations.`,
  'tip.singleCruise.logic': `• warning when the ship would have to sail faster than {extreme}, on both sides of a station ({extremeSrc})
• note when faster than {unusual} on both sides of a station ({unusualSrc})
• stations closer than {minSeparation} count as one place and are skipped
• a date without a time means the longest possible gap`,

  'tip.severities.does': `Explains the three levels of findings in the report and what each means before you publish the data.`,
  'tip.severities.logic': `• Error: the data are contradictory, impossible or unreadable (for example a latitude out of range, or no licence); fix it before publishing.
• Warning: usually turns out to be a mistake; check it and fix it, or be ready to explain it.
• Note: information to consider; often needs no change.
No findings only means that no problems were found in the checked categories.`,
  'tip.notChecked.does': `Lists what the tool did not check in this run.`,
  'tip.notChecked.logic': `• The list is always shown, also when nothing was found.
• Some entries depend on your choices: ship speed, for example, is not checked until you tick the one-cruise box or map a cruise column.
• No findings in the report says nothing about the items on this list.`,
  'tip.mapLegend.does': `Explains the colours of the points on the preview map.`,
  'tip.mapLegend.logic': `• A point takes the colour of the most serious finding on its row (error, warning, note).
• A point with no finding has the "no finding" colour.
• Findings about the whole dataset rather than a row do not change the colours.
• Rows without a position are not on the map.`,

  'tip.cleanCsv.does': `Saves your data in one CSV layout: fixed columns first, then the variables.`,
  'tip.cleanCsv.logic': `• Fixed columns: station, cruise, sample id, date, latitude and longitude, depth; then each measured variable as “name [unit]”. Ignored columns, the time column (merged into the date) and the pressure column are not written.
• The date is written in ISO 8601, coordinates in decimal degrees (also when the file had degrees and minutes), and a decimal comma becomes a dot; other values are copied as written in the file, without conversion.
• Text starting with =, +, - or @ gets a leading apostrophe, so that a spreadsheet does not treat it as a formula.`,
  'tip.sidecar.does': `Records what the tool found out about the columns: their meaning, unit and where the unit came from.`,
  'tip.sidecar.logic': `• One row per column: the name in the file, the name in the clean CSV, the unit, the source of the unit, and the P01 code when known.
• It also keeps your declaration of one cruise.
• Drop it with the files at the next check and that declaration is restored.`,
  'tip.iso19139.does': `Writes a draft ISO 19139 metadata record to load into GeoNetwork.`,
  'tip.iso19139.logic': `• It fills in only what follows from the data: geographic and time extent, variables, the licence the metadata already state, and the title.
• Fields the data cannot supply are not invented: contact and citation date are marked as missing, language and topic category are left out.
• It is a draft to complete in the editor, not a finished record.`,
  'tip.datacite.does': `Writes a draft DataCite record (XML) for the registration of a DOI.`,
  'tip.datacite.logic': `• It fills in only what follows from the data and the metadata: title, extent, variables, licence.
• The publication year is set to the current year (change it if needed); creators, publisher and the DOI are not guessed and stay as XML comments.
• It is a draft to complete, not a finished record.`,
  'tip.draft.does': `Gives values computed from the data that you can copy into metadata fields.`,
  'tip.draft.logic': `• The time extent and the four geographic bounds are computed from your data.
• The list of variables carries units, but only those somebody stated.
• The licence and the title come from the metadata, not from the data.
• The field names match the sections of the GeoNetwork editor.`,
  'tip.geojson.does': `Saves the positions of the rows as GeoJSON points, to open in QGIS or another GIS program.`,
  'tip.geojson.logic': `• One point per row that has a position; coordinates unchanged, as [longitude, latitude]. Rows with an impossible latitude, which the map hides, are in the file.
• Each point carries its file, line, station, date and the most serious finding on its row.
• One file for all datasets.`,

  'tip.licenceInput.does': `Names the descriptions of one dataset that are to be compared.`,
  'tip.licenceInput.logic': `• One reference per line: a DOI, a Zenodo or PANGAEA link, a Dataverse dataset link ({dataverse}) or a GeoNetwork record link.
• Only the metadata of those records is read, never the data files. A GBIF or OBIS link is not read for licences: use the dataset DOI.
• All lines should be about one dataset: several places where it is described.`,
  'tip.licenceOneDeposit.does': `Shows whether the sources state the same licence, and counts the sources of one deposit once.`,
  'tip.licenceOneDeposit.logic': `• One deposit is a record in a repository together with its DataCite record (Zenodo, PANGAEA, Dataverse): they describe the same dataset, so they count as one source.
• What is compared is the licence identifiers the sources state, not their legal texts.
• Different licences in different sources are a contradiction; an empty DataCite record next to a licence stated elsewhere is not.`,
  'tip.licenceSpdx.does': `Shows how the tool read each statement about a licence.`,
  'tip.licenceSpdx.logic': `• The text and the link of each statement are compared with the SPDX licence list.
• The result is one SPDX identifier, or "unrecognised — check manually".
• The tool does not judge the legal effect of a licence and does not read licence texts.`,
  'tip.licenceDatacite.does': `Points out that the DOI record at DataCite has no licence, although another source states one.`,
  'tip.licenceDatacite.logic': `• DataCite has a Rights field, but it is optional, so many records stay without a licence.
• The OpenAIRE guidelines for data archives ask for the licence when it applies.
• This alone is not a contradiction: it has a line of its own, asking you to add the licence to the DOI record.`,
  'tip.licenceAttribution.does': `Puts together an attribution text with the licence that you can paste.`,
  'tip.licenceAttribution.logic': `• It is built only from what the sources state: title, authors, publisher, year, licence, identifier.
• When the sources contradict each other or the licence is not recognised, the licence is left out and the page says why.
• The text is always in English, so that you can paste it as it is; check it against the record first.`,

  'tip.collectionKind.does': `Chooses where the tool reads the metadata of a whole collection from.`,
  'tip.collectionKind.logic': `• A list of DOIs, a DataCite repository or DOI prefix, a Zenodo community or a GeoNetwork catalogue.
• Only metadata is read, never data files.
• The result is counts per problem, a few examples of each and a fix list as a CSV file; nothing is compared between institutions.`,
  'tip.collectionDois.does': `Reads the DataCite records of the DOIs you list.`,
  'tip.collectionDois.logic': `• Your browser looks up each DOI at DataCite.
• Links of the form doi.org/… and doi:… are accepted; a repeated DOI is read once.
• Put one DOI on a line, or separate them with spaces.`,
  'tip.collectionDatacite.does': `Names a DataCite repository, either by its client id or by a DOI prefix.`,
  'tip.collectionDatacite.logic': `• A client id covers the records of one repository; a DOI prefix covers everything registered under that start of the DOI.
• Your browser asks DataCite for the list page by page.`,
  'tip.collectionZenodo.does': `Reads the records of a Zenodo community, named as in its address.`,
  'tip.collectionZenodo.logic': `• Zenodo limits how many records and requests a guest may take, so a large community takes time.
• A community larger than the search limit is read in slices split by publication date.`,
  'tip.collectionCsw.does': `Reads the records of a GeoNetwork catalogue from the list.`,
  'tip.collectionCsw.logic': `• Available catalogues: {catalogues}.
• Requests go through our server, which passes the answer on and keeps nothing.
• You choose the metadata format beside it: ISO 19139 or ISO 19115-3, where the catalogue offers both.`,
  'tip.collectionCross.does': `Compares the licences of the catalogue with those at DataCite.`,
  'tip.collectionCross.logic': `• For records that state a DOI, your browser looks the DOI up at DataCite and compares the licences of both sources.
• Each such record costs one more request, so the run takes longer.`,
  'tip.collectionRun.does': `Shows how long a run will take before you start it, and lets you begin with a sample.`,
  'tip.collectionRun.logic': `• The estimate counts records and requests; for large collections the number of requests is a rough guess.
• The quick sample reads only part of the collection and is labelled as a sample in the results.
• A run can be paused and resumed; its progress stays in this browser.`,

  'tip.indexCheck.does': `Checks data files, or a record from a repository, before you publish them.`,
  'tip.indexCheck.logic': `• It reads tables (CSV, Excel, Darwin Core) or a record given by a link or DOI.
• It checks coordinates, dates, units, value ranges and the licence, and states each finding in a plain sentence with the technical detail beside it.
• It changes nothing in your data: it shows what it found and lists what it does not check.`,
  'tip.indexLicence.does': `Compares what different metadata sources state about the licence of one dataset.`,
  'tip.indexLicence.logic': `• It reads the metadata of Zenodo, PANGAEA, Dataverse, GeoNetwork and DataCite, not data files (a GBIF or OBIS dataset only through its DOI).
• It classifies each statement against the SPDX licence list and looks for contradictions.
• It builds an attribution text with the licence for you to paste.`,
  'tip.indexCollection.does': `Goes through the metadata of a whole collection and gathers licence problems and empty fields.`,
  'tip.indexCollection.logic': `• It reads only metadata, never data files.
• The result is counts per problem, examples and a fix list as a CSV file.
• It does not compare or rank institutions; a quick sample is labelled as a sample.`,

  'tip.convertIntro.does': `Shows what this converter is for: a Darwin Core Archive built from your spreadsheet. The page is still a hidden test version.`,
  'tip.convertIntro.logic': `• The page is hidden for now: it is not in the menu or on the index page, and search engines are asked to skip it.
• Your files are read and previewed in your browser; nothing of them is sent anywhere.
• The archive is built in your browser and downloaded from it; nothing is uploaded and nothing is stored.
• One optional lookup is here: the taxon names you choose to look up go to WoRMS, and only after you press its button; it is off by default. A second one, for terms in the NERC vocabulary, is still planned and will work the same way.`,
  'tip.convertTaxa.does': `Confirms which of the proposed columns are taxa.`,
  'tip.convertTaxa.logic': `• In a wide sheet the tool proposes every numeric column it has no other meaning for, at low confidence, as a taxon whose header is the name.
• A proposed column is converted only after you confirm it; an unconfirmed one is left out and the summary says how many.
• Measured variables such as temperature stay variables. A column whose header starts with total, sum, suma, razem, summe, gesamt, somme or Σ, or holds total, suma, razem or gesamt as a separate word, is never proposed; you can still mark it by hand.
• A column you give the meaning "taxon (the header is the name)" yourself is yours and needs no confirmation.`,
  'tip.convertDepthBound.does': `Says which end of a depth range a depth column is.`,
  'tip.convertDepthBound.logic': `• A sample taken between two depths has a top column (the shallower end) and a bottom column (the deeper end).
• With a single depth column, the top and the bottom depth are the same.
• A depth is read as metres and is never converted; a unit other than metres blocks the conversion.`,
  'tip.convertEffortValue.does': `The sample size, when it is the same for all samples.`,
  'tip.convertEffortValue.logic': `• Type it with a point or a comma as the decimal mark; both are accepted whatever your sheet uses, and it is written with a point.
• Refused as ambiguous: a number with more than one point or comma, and a number of one to three digits, one separator and exactly three digits after it, because it could be a thousands separator; write it without one, or with more or fewer decimals. A number that starts with a zero cannot be one and is accepted.
• Anything that is not a number above zero is refused too, and the conversion is then blocked.
• For a different size in each sample, mark a column of the sheet instead.`,
  'tip.convertEffortUnit.does': `The unit of the sample size.`,
  'tip.convertEffortUnit.logic': `• It is written as you give it and never converted.
• A concept for the unit is added only for {units}; any other unit gets a warning and no concept.`,
  'tip.convertEffortDimension.does': `Says whether the sample size is a volume or an area.`,
  'tip.convertEffortDimension.logic': `• It is normally read from the unit (cubic metres, litres, square metres); choose it only when the unit does not say.
• A volume has the concept {volumeConcept}, an area {areaConcept}.`,
  'tip.role.taxon': `a column of taxon names, one per row (a long sheet); the number goes in the quantity column.`,
  'tip.role.taxonHeader': `a column of a wide sheet whose header is the taxon name and whose cells are the quantities. Proposed ones are only candidates: confirm them all.`,
  'tip.role.quantity': `the number for the taxon on that row (a long sheet).`,
  'tip.role.quantityType': `a column that says what the quantity is; it is kept for your information and does not replace your declaration.`,
  'tip.role.effort': `the volume or area sampled for that sample; its unit goes in the unit box.`,
  'tip.role.occurrenceId': `your own identifier of the record, used exactly as you wrote it.`,
  'tip.role.lifeStage': `the life stage of that record; it wins over a stage found in the name.`,
  'tip.role.qualifier': `the identification qualifier of that record (cf., sp., ?); it wins over one found in the name.`,
  'tip.convertRoles.does': `Lists every meaning a column can have in the converter, including the ones that exist only here.`,
  'tip.convertRoles.logic': `{roles}
• The meanings only say how a cell is read; the converter changes none of your values.
• Coordinates, dates, depth, station, cruise and sample names are recognised by the same rules as in the data check.`,
  'tip.convertSheetUse.does': `Chooses whether this sheet is converted.`,
  'tip.convertSheetUse.logic': `• A sheet you untick is left out completely: nothing from it is converted, counted or checked.
• Every sheet starts ticked.`,
  'tip.convertShape.does': `Says how the sheet is laid out: one column per species, or one row per species and sample.`,
  'tip.convertShape.logic': `• Wide: the header of each taxon column is a taxon name, and every filled cell of it is one record of that taxon in that row's sample, except zeros that are skipped and NA cells, which make none.
• Long: every row with a taxon and a value is one record, with the same exceptions.
• The tool suggests the shape from the meanings of the columns; the choice is yours.`,
  'tip.convertQuantityKind.does': `Says what the numbers in the species cells are.`,
  'tip.convertQuantityKind.logic': `• A count is a number of individuals and must be whole; it is written as individualCount, and as a count measurement ({countConcept}).
• A density or a biomass is written as a measurement with its unit, never as individualCount.
• Without this choice the conversion is blocked.
• Nothing is converted or rescaled.`,
  'tip.convertQuantityUnit.does': `The unit the numbers are written in.`,
  'tip.convertQuantityUnit.logic': `• It is written as you give it and never converted.
• A concept for the unit is added only for the units the tool has checked: {units}.
• Any other unit gets no concept and a warning, and the unit text stays as you wrote it.`,
  'tip.convertQuantityBasis.does': `For a biomass: wet weight, dry weight or ash-free dry weight.`,
  'tip.convertQuantityBasis.logic': `• Each kind of weight has its own concept: {concepts}.
• Without it the biomass cannot be described, and the conversion is blocked.`,
  'tip.convertQuantityPer.does': `Says whether the numbers are per volume or per area.`,
  'tip.convertQuantityPer.logic': `• It is normally read from the unit; choose it only when the unit does not say.
• A density per volume of water has the concept {volumeConcept}; per area of the bed, {areaConcept}.
• The unit never decides this alone against what you chose.`,
  'tip.convertQuantityMedium.does': `For numbers per area: the water column or the bed.`,
  'tip.convertQuantityMedium.logic': `• For a number per area there is no default: you choose the water column or the bed.
• Only a number per area of the bed has a checked concept; a number per area of the water column gets no concept and a warning, and one has to be chosen by hand before publishing.`,
  'tip.convertEffort.does': `The volume or area that was sampled, when you know it.`,
  'tip.convertEffort.logic': `• Give one value for all samples, or mark a column of the sheet.
• It is written on each sample as sampleSizeValue and sampleSizeUnit, and as a measurement: {volumeConcept} for a volume, {areaConcept} for an area.
• A zero, a negative or a missing value blocks the conversion.`,
  'tip.convertCruise.does': `The cruise code, for a sheet that has no cruise column.`,
  'tip.convertCruise.logic': `• It becomes the cruise event at the top of the tree.
• The ID of a station is the cruise code, a colon and the station code.
• Left empty, the stations have no cruise above them.`,
  'tip.convertFullList.does': `Says whether every species of the list was looked for in every sample.`,
  'tip.convertFullList.logic': `• Ticked: a zero becomes an absence (occurrenceStatus absent), with an individualCount of zero only for counts and no measurement.
• Not ticked: zeros are left out and their number is shown as information.
• An empty cell or NA is never a record.
• Nothing in the browser remembers the tick; a companion file dropped with the data can set it.`,
  'tip.convertStationPrefix.does': `Makes sample IDs unique when the same sample code is used at several stations.`,
  'tip.convertStationPrefix.logic': `• Off: the ID of a sample is your sample code.
• On: the ID is the station ID, a colon and your code.
• An ID is never made from depth, from row order or from a taxon name lookup.
• The choice appears when codes repeat, or when a companion file ticked it.`,
  'tip.convertFlattenStation.does': `Leaves the station level out of the tree.`,
  'tip.convertFlattenStation.logic': `• The station code is kept as the locality of each sample, and the samples hang directly under the cruise.
• No ID changes.
• The date, position and depth of the cruise are then worked out from the samples.
• Nothing is flattened unless you tick it.`,
  'tip.convertFlattenCruise.does': `Leaves the cruise level out of the tree.`,
  'tip.convertFlattenCruise.logic': `• The cruise code goes to the dataset text instead, and the stations stand at the top of the tree.
• The ID of a station still begins with the cruise code.
• Nothing is flattened unless you tick it.`,
  'tip.convertSplits.does': `Confirms how a name with a qualifier, a stage or a sex is divided, or a doubtful name.`,
  'tip.convertSplits.logic': `• Qualifiers ({qualifiers}) go to the identification qualifier, the stages ({stages}) to the life stage, and a sex marker (f, m, fem, female, male, ♀, ♂, with or without a dot) after a comma, or straight after a stage or a question mark, to the sex. An f. before an epithet is a forma and stays in the name.
• A name that is left with a digit, a slash, a question mark, a stage range, a single letter, a sex marker at the end or more than three words is shown with the reason, for you to correct.
• The exact text is always kept as verbatimIdentification. You can edit the name, qualifier, stage and sex before approving.
• A split is only a proposal until you approve it, and an unapproved split blocks the conversion. A plain name needs no decision.
• The button for all shown approves only the splits without a doubt. A split with a doubt is approved on its own row, after you edit it or with "Approve as it is"; the button says how many it skipped.`,
  'tip.convertCodes.does': `Proposes sample codes once, for a sheet that has none.`,
  'tip.convertCodes.logic': `• A code is the station code, a hyphen and a running number, in the order of your sheet. If the station text would make a code that starts like a formula (with = + - or @), the code is S and the number of the row instead, so that it needs no apostrophe and is the same on the page and in the file.
• You get your own sheet back as a CSV file with one new column. Cells are copied as text. A cell or a header that starts with = + - or @ (also in their full-width forms) or with a tab gets an apostrophe so that a spreadsheet does not run it; plain numbers, missing-data marks such as NA and the marks + x - on their own, spaces around them included, are left as they are. Dates of an xlsx file are written as ISO dates and times of day as hours and minutes.
• Check it and upload that file again: only a code in your own uploaded sheet becomes an ID.
• A leading apostrophe before a formula character is the spreadsheet's own text escape, so when you upload the file again the converter reads '=x as =x. It takes that one apostrophe off every text cell and header that starts with it, and only here: the checker reads a file as it is.
• The converter never applies or renews codes by itself.`,
  'tip.convertMetaTitle.does': `Gives the dataset a name that people will read.`,
  'tip.convertMetaTitle.logic': `• It becomes the title in the description (eml.xml) and, when you leave the dataset name empty, the dataset name in every event row.
• Write it in English: the description is marked as English.
• Nothing is checked about the wording; an empty title blocks the export.`,
  'tip.convertMetaAbstract.does': `Tells a reader what the data are and how they were collected.`,
  'tip.convertMetaAbstract.logic': `• It becomes the abstract of the description. A blank line starts a new paragraph.
• The OBIS data policy asks for a detailed description including the method of collection; this tool only checks that something is written.
• An empty abstract blocks the export.`,
  'tip.convertMetaCreators.does': `Lists the people or groups who made the dataset.`,
  'tip.convertMetaCreators.logic': `• One per line, as "Given Family" or "Family, Given". With a comma the name is taken as written: what stands before the comma is the family name. Without a comma the last word is the family name, together with any lowercase particle just before it ({particles}), so "Maria de la Cruz" has the family name "de la Cruz". A semicolon also separates two names.
• They become the creators of the description and, when the citation field is left empty, the authors in the citation text. A name that a metadata file marks as an organisation, and a line with a clear organisation word ({organisationWords}), is written as an organisation name and is not split; the form shows below how each line will be written. A name of only particles and one word ("de Vries") is a family name with no given name. The tool never looks anyone up.
• At least one is needed.`,
  'tip.convertMetaContact.does': `Says whom a reader should write to about the dataset.`,
  'tip.convertMetaContact.logic': `• The name and the e-mail address become the contact and the metadata provider of the description. The address is only written into the file; this page never sends it anywhere.
• The address must look like an address (something@something.something); it is not tested.
• Both are needed.`,
  'tip.convertMetaInstitution.does': `Names the institution the data belong to, by its short code.`,
  'tip.convertMetaInstitution.logic': `• It is written as institutionCode in every event row. BioCheck reports an Event table without it as an error.
• Use the short code your institution uses in OBIS or GBIF; the tool does not check it.
• It must not hold a tab or a line break.`,
  'tip.convertMetaDatasetName.does': `Names the dataset as it appears in every event row.`,
  'tip.convertMetaDatasetName.logic': `• It is written as datasetName in every event row. Left empty, the title is used. BioCheck reports an Event table without datasetName as an error, and can warn when it differs from the title.
• The downloaded file is named after it.
• It must not hold a tab or a line break.`,
  'tip.convertMetaMethods.does': `Describes how the data were collected (optional).`,
  'tip.convertMetaMethods.logic': `• It becomes the methods section of the description. A blank line starts a new paragraph.
• Left empty, no methods section is written. The OBIS data policy asks for the method to be part of the description, so it is worth filling in.`,
  'tip.convertLicence.does': `Chooses the licence the dataset is published under.`,
  'tip.convertLicence.logic': `• Only {licences} are offered: they are the licences OBIS accepts (the public-domain one is preferred, the non-commercial one the least preferred) and the ones the GBIF publishing tool can write. A Creative Commons licence with ShareAlike (SA) or NoDerivatives (ND) is not on the OBIS list, so it is not offered.
• The rights holder decides, not this tool. There is no default, and an unchosen licence blocks the export.
• It is written into the description as the licence name with its web address, the form the GBIF publishing tool writes.`,
  'tip.convertBasis.does': `Says what kind of record each occurrence is.`,
  'tip.convertBasis.logic': `• One value for the whole dataset: {bases}. It is written as basisOfRecord on every occurrence, and BioCheck rejects any other value.
• A human observation is counted and nothing is kept; a preserved specimen is kept in a collection (the OBIS Manual then also asks for a collection code and a catalog number, which this tool does not write); a material sample is a physical sample that was taken and may have been preserved or destroyed.
• There is no default: it depends on what you did with the samples. An unchosen value blocks the export.`,
  'tip.convertSummaryColumn.does': `Explains why a column of totals starts as "ignore".`,
  'tip.convertSummaryColumn.logic': `• A column whose header reads as a total or a sum (Sum, Total, Suma, Razem, Summe, Gesamt, Somme, Σ) adds up other columns. Converted, it would count the same individuals twice.
• So it starts as ignored and writes nothing into the archive. You can still give it another meaning; then it is your decision.
• Only a column the tool would otherwise take as a measured variable is changed this way. A column it recognises as a standard variable keeps its proposal.`,
  'tip.convertAccept.does': `Lets you accept a kind of warning for this export.`,
  'tip.convertAccept.logic': `• A warning does not stop the export, but the archive will carry what it says (for example text in a species cell, a column that is not written, or a missing taxon ID). Each kind has to be accepted once, after you have read it.
• A tick holds while the findings of that kind stay the same; when a decision of yours changes them, it has to be given again. Typing in the description unticks nothing. Nothing is stored: a new upload starts with every warning unaccepted.
• Errors cannot be accepted: they block the export until the cause is removed.
• Findings that only inform are shown and never need an answer.`,
  'tip.convertExport.does': `Builds the Darwin Core Archive and downloads it.`,
  'tip.convertExport.logic': `• The button works only when nothing blocks, the description is complete and every kind of warning is accepted. The archive is built in your browser by the code that checked it, which checks everything once more before it writes anything; if something blocks, nothing is written.
• The zip holds the description (EML {eml}), the event, occurrence and measurement tables and meta.xml. The text files are UTF-8, tab-separated, one record per line.
• A position or a depth that comes from one plain number cell is copied as written: a decimal comma becomes a point, a leading plus sign and leading zeros before the integer part are dropped, a missing integer part becomes a zero and a bare trailing point is dropped; every digit after the point is kept. A position given in degrees and minutes is written as decimal degrees with the precision of the source, and a depth column marked positive upwards is written with its sign reversed. The position of a cruise or a station worked out from its samples is rounded to {derived} decimals with trailing zeros dropped, and its uncertainty to whole metres, rounded up. A count is written as a whole number (a decimal part that is zero is dropped). Densities, biomasses and sample sizes are copied as written, with the decimal comma turned into a point. Nothing is rescaled.
• The file is named after the dataset name. Nothing is uploaded and nothing is stored.`,
  'tip.convertCompanion.does': `Saves your choices about the species list, the sample codes and the WoRMS option for the next run.`,
  'tip.convertCompanion.logic': `• It is a small CSV file in the format of the companion file of the checker, with one row for "full species list", one for "station prefix" and one for "WoRMS lookup", each only when it is ticked.
• Drop it together with your data next time and the choices start ticked. A ticked WoRMS option still sends nothing until you press its lookup button. Nothing is remembered in the browser, so this file is the only memory.
• It holds no data, names or values from your sheet.`,
  'tip.role.taxonId': `the ID of the taxon of that record, written to scientificNameID as given (a column named AphiaID, the whole-number ID of WoRMS, is written as the urn:lsid of the taxon). Only for a sheet with one record per row; these IDs are never looked up or changed, and a name that has one on any row is left out of the optional WoRMS lookup.`,
  'tip.convertDevice.does': `Names the device the samples were taken with.`,
  'tip.convertDevice.logic': `• Choose one of the devices that have a verified concept in the NERC vocabulary (named nets, a grab, a corer, and four device categories), or type your own name. It is written as a measurement on every sample event: the name of the sampling instrument ({instrument}) with the device as its value; a chosen device carries its vocabulary address, a typed name carries none.
• The list holds only what was checked; a device that is not in it is typed. Nothing is guessed from your column names.
• Leaving it empty is allowed, but BioCheck then warns that no sampling instrument is present, and that warning has to be accepted.`,
  'tip.convertMesh.does': `Gives the mesh size of the net or sieve, in micrometres (optional).`,
  'tip.convertMesh.logic': `• A plain number above zero, written with a point or a comma. It is written as a measurement on every sample event ({meshConcept}) with the unit micrometres ({unit}); no other unit is accepted here and nothing is converted.
• Leaving it empty writes nothing. A value that cannot be read as a number blocks the export and says why.`,
  'tip.convertTree.does': `Shows the event tree the archive would have.`,
  'tip.convertTree.logic': `• Cruise, station and sample come from your columns, and the type is written as text.
• The date of a cruise or station is the span of its samples; its position is the middle of the box around its samples, with an uncertainty that covers them all, in whole metres rounded up; its depth runs from the shallowest top to the deepest bottom.
• Only a few examples are shown, not every event.`,
  'tip.convertMetaFiles.does': `Lists the files you added that describe the dataset instead of holding data.`,
  'tip.convertMetaFiles.logic': `• A file is a metadata file when its content is an ISO 19139 or ISO 19115-3 record (XML), a DataCite record (XML or JSON) or a Zenodo record (JSON). The kind is recognised from its content, not from its name.
• It is never read as a data sheet and never converted.
• Only what is in the file is read, by the same readers /check uses. No link or DOI is followed and no request is sent; a record that is not a file you added is not fetched.`,
  'tip.convertMetaSource.does': `Explains where a filled-in value came from.`,
  'tip.convertMetaSource.logic': `• A field is filled in from your metadata files only when every file that has it says the same, or only one file has it. Capitals and spacing are ignored when comparing.
• Under the field you see the file and the field of that file the value was read from. The note goes away once you change the text.
• Every field stays editable, and a field you typed in or chose a value for keeps your text when you read files again.
• A field that a metadata file could fill, but none of yours does, is marked as missing.`,
  'tip.convertMetaChoice.does': `Lets you pick between values your metadata files disagree on.`,
  'tip.convertMetaChoice.logic': `• When files give different values for a field, none is filled in: the tool does not rank file formats or take the first file. The same holds for the contact when several files each name one.
• Each different value is listed once, with every file that says it. "Use this" copies it into the field, where you can still edit it.
• When the field already holds a value that differs from what a file says (typed or chosen by you), the file's value stays visible with "Use this"; it never replaces your value by itself.
• You can also ignore the list and type your own value.`,
  'tip.convertMetaCitation.does': `Sets the citation text carried in the archive description.`,
  'tip.convertMetaCitation.logic': `• It is written on one line into additionalMetadata/gbif/citation of eml.xml.
• From a metadata file it is built by the function that writes the attribution line on the licence page: creators, year, title, publisher and DOI as the file gives them. The DOI is only text taken from the file; nothing is looked up. The licence is not part of it, because it is written separately.
• Left empty, it is built from the creators, the title and the year of the export.`,
  'tip.convertMetaCoverage.does': `Shows the time and place your metadata give for the data.`,
  'tip.convertMetaCoverage.logic': `• Only for information, so that you can compare it with your data.
• The coverage written into eml.xml (bounding box, dates, taxa) is always computed from the events and occurrences of the archive, never from these values.
• Each file is shown on its own line; the values are not merged.`,
  'tip.convertLicenceTaken.does': `Says that the licence was filled in from your metadata.`,
  'tip.convertLicenceTaken.logic': `• It is filled in only when the comparison /check and the licence page use finds no contradiction in your files and exactly one licence is recognised, and that licence is one of {licences}.
• Other statements that are no licence (an access note, a use limitation) are listed beside it as an extra note, never as a conflict.
• The file and the field it was read from are shown, and you can change it. If you choose another licence, a warning asks you to accept that your archive carries a licence different from the one in your files.
• The rights holder decides the licence: check that it is the one meant.`,
  'tip.convertLicenceOther.does': `Explains why no licence was filled in although your metadata states one.`,
  'tip.convertLicenceOther.logic': `• OBIS accepts only {licences}. When the comparison finds no contradiction but your files name another licence, another version of one, a ShareAlike or NoDerivatives licence, or only free text, it is shown but not used. When they give two or more licences side by side (dual licensing, for example a public-domain licence and CC BY), the files give several licences and the rights holder must pick one: nothing is filled in.
• The tool never maps a licence to the nearest accepted one: an older version is not turned into a newer one, and a share-alike licence becomes none of the three.
• Statements that are no licence are listed as an extra note.
• The rights holder decides which of the three to use; you choose it below. Choosing one of the licences your files name raises no warning; choosing any other raises a warning you have to accept.`,
  'tip.convertLicenceContradictory.does': `Explains why no licence was filled in when your metadata disagrees.`,
  'tip.convertLicenceContradictory.logic': `• The comparison /check and the licence page use reports a contradiction: the files disagree, a statement contradicts itself, a restriction contradicts an open licence, or a rights entry that is no licence and no neutral access note stands next to a licence in the same record. Every statement is listed with its file and field.
• The tool does not choose between them.
• The rights holder decides which licence applies; you choose one of {licences} below. A warning asks you to accept your choice when it differs from a licence your files name: when the files name two different licences, any choice does (it departs from the other file); when they name one, any other licence does.`,
  'tip.convertLicenceMissing.does': `Explains why no licence was filled in.`,
  'tip.convertLicenceMissing.logic': `• None of the files you added states a licence for the data.
• Nothing is assumed: there is no default licence.
• The rights holder decides; you choose one of {licences} below, and an unchosen licence blocks the export.`,
  'tip.convertMetaList.does': `Lets you pick one of the contacts that a single file lists.`,
  'tip.convertMetaList.logic': `• A file that names several contact persons is not in disagreement with itself: it is a list, and the tool does not know which one to write.
• The first few are shown; "Show all" lists the rest. "Use this" copies the contact (name and, when the file has it, the e-mail address) into the fields, where you can still edit it.
• Nothing is filled in while your files name more than one contact in all. A contact that another file names on its own is shown too, with its file, so no contact of any file is left out. A single contact in all your files fills the fields by itself.`,
  'tip.convertArchiveDesc.does': `Lists the description files of a Darwin Core archive that you added.`,
  'tip.convertArchiveDesc.logic': `• An eml.xml (an EML document) or a meta.xml (the archive's column map) is recognised from its content, not from its name.
• It is never read as a data sheet and its values are not used: the description of your dataset comes from metadata files (ISO, DataCite, Zenodo) or from the form.
• No request is sent; the file is only listed.`,
  'tip.convertWormsOptIn.does': `Lets you match the species names of your sheet to WoRMS, the register of marine species, to fill scientificNameID. It is off, and sends nothing, until you press the lookup button.`,
  'tip.convertWormsOptIn.logic': `• Off at every upload. A companion file can only tick the box; ticking sends nothing.
• The button sends only the distinct scientific names, without qualifier, stage or sex, in calls of at most {batch} names, one after the other.
• A name that has a taxon ID from your sheet on any row is not sent, and none of its rows gets a WoRMS ID; a warning says so when only some rows have one.
• The ID written is {lsid} of the record that matches the name as you wrote it. scientificName is never changed.`,
  'tip.convertWormsPrivacy.does': `Says exactly what leaves your computer if you use the lookup, and to whom.`,
  'tip.convertWormsPrivacy.logic': `• Only taxon names are sent: nothing else from your files or from what you typed.
• They go straight from your browser to www.marinespecies.org, the WoRMS web service operated by VLIZ. They do not pass through the server of this site.
• The service sees your IP address, as any website does.
• A species name can reveal an unpublished finding, such as which species were found in your data.
• Nothing is sent until you press the lookup button.`,
  'tip.convertWormsTable.does': `Shows what WoRMS answered for each name, so you can see, before anything is written, which ID each name would get.`,
  'tip.convertWormsTable.logic': `• Match type: exact means the name is spelled the same in WoRMS; phonetic and near mean a similar but different spelling; genus only means that only the genus matched.
• Status: an unaccepted name is a synonym, and its valid name is shown.
• Habitat lists the marine, brackish, freshwater and terrestrial flags WoRMS holds. A name that is only freshwater or terrestrial gets a warning to accept before the export.
• A name with no result gets no ID and a warning to accept before the export.`,
  'tip.convertWormsChoice.does': `Where you decide which WoRMS result becomes the ID of a name, or that it gets none.`,
  'tip.convertWormsChoice.logic': `• Only a single result whose match type is exact is taken automatically. You can still choose no ID for it.
• For a phonetic, near or genus-only result, or when there are several results, nothing is pre-selected: you choose one result or no ID, and a name left undecided blocks the export.
• The ID of the result you choose is written as it stands, even when that name is unaccepted: the OBIS Manual asks for the identifier of the name as written in scientificName, and OBIS resolves it to the accepted name. scientificName stays as you wrote it.`,
} as const;

export type TipKey = keyof typeof en;

const pl: Record<TipKey, string> = {
  'tip.aria': `Wyjaśnienie: {label}`,
  'tip.does': `Co robi`,
  'tip.logic': `Logika`,
  'tip.ruleLink': `Szczegóły reguły →`,
  'tip.roles.feeds': `używana w regułach`,
  'tip.encoding.label': `Kodowanie tekstu`,

  'tip.role.ignore': `nie jest uwzględniana w żadnym sprawdzeniu ani w czystym CSV.`,
  'tip.role.latitude': `położenie punktu na osi północ–południe.`,
  'tip.role.longitude': `położenie punktu na osi wschód–zachód.`,
  'tip.role.datetime': `data i godzina w jednej kolumnie.`,
  'tip.role.date': `sama data, bez godziny.`,
  'tip.role.time': `godzina łączona z datą z kolumny daty; bez kolumny z datą nie jest używana.`,
  'tip.role.depth': `odległość od powierzchni; kierunek dodatni i jednostkę podajesz obok.`,
  'tip.role.pressure': `kolumna jest rozpoznawana, ale żadne sprawdzenie ani plik wyjściowy jej nie używa.`,
  'tip.role.station': `nazwa lub numer stacji; grupuje wiersze z jednego miejsca.`,
  'tip.role.cruise': `w teście prędkości statku rozdziela rejsy i zastępuje zaznaczenie pola o jednym rejsie.`,
  'tip.role.sampleId': `identyfikator próbki lub rdzenia; przy połączonych arkuszach zastępuje stację.`,
  'tip.role.variable': `mierzona wielkość; wymaga nazwy i jednostki, a jednostki narzędzie nigdy nie zgaduje.`,

  'tip.dropZone.does': `Wczytuje pliki z Twojego komputera, żeby je sprawdzić.`,
  'tip.dropZone.logic': `• Przyjmowane rozszerzenia: {formats}.
• Pliki XML i JSON są czytane jako metadane (np. ISO 19139 lub DataCite), pozostałe jako tabele z danymi.
• Plik .zip jest czytany jako archiwum Darwin Core (dane z OBIS lub GBIF).
• Pliki zostają w Twojej przeglądarce, nic nie jest wysyłane.`,
  'tip.linkField.does': `Pobiera rekord z repozytorium po linku lub numerze DOI i sprawdza jego metadane oraz pliki z danymi.`,
  'tip.linkField.logic': `• Rozpoznawane są Zenodo, PANGAEA, GBIF, OBIS, każdy numer DOI (przez DataCite), Dataverse ({dataverse}) i GeoNetwork ({geonetwork}).
• Pliki są pobierane tylko z serwerów z listy dozwolonych (strona Prywatność); z pozostałych pobierz plik samodzielnie i upuść go powyżej.
• Limity rozmiaru: przez serwer plik z linku może mieć najwyżej {maxFile}, archiwum z serwera IPT – {maxArchive}; plik zbioru Dataverse większy niż {maxFile} jest pomijany.`,
  'tip.downloadMode.does': `Pozwala wybrać, kto pobiera pliki spod linku: Twoja przeglądarka czy nasz serwer.`,
  'tip.downloadMode.logic': `• Przeglądarka: pliki trafiają prosto z serwera danych do Ciebie; część serwerów na to nie pozwala.
• Serwer Abyssal Claims: pobiera plik za Ciebie z serwerów z listy dozwolonych (najwyżej {maxFile}, archiwa z serwera IPT – {maxArchive}) i niczego nie zapisuje.
• Pliki, które tu upuścisz, nie opuszczają Twojego komputera w żadnym z trybów.`,

  'tip.layout.does': `Pokazuje, jak narzędzie zrozumiało budowę pliku, i pozwala ją poprawić.`,
  'tip.layout.logic': `• Jedna tabela: jeden wiersz to jedna próbka.
• Format długi: jeden wiersz to jeden pomiar; narzędzie przekształca taką tabelę na jeden wiersz na próbkę.
• Dwa arkusze: pomiary są łączone z pozycjami i datami przez kolumnę klucza.
• Układu, którego nie da się odczytać, narzędzie nie zgaduje: zgłasza go i dalej sprawdza pozostałe tabele.`,
  'tip.roles.does': `Tu określasz, co zawiera każda kolumna; od tego zależy, które sprawdzenia ją obejmą.`,
  'tip.roles.logic': `Narzędzie nigdy nie zgaduje jednostki: kolumna bez podanej jednostki pozostaje bez jednostki.
{roles}`,
  'tip.encoding.does': `Pokazuje, w jakim kodowaniu znaków odczytano plik; od tego zależy, czy polskie litery i inne znaki specjalne wyświetlą się poprawnie.`,
  'tip.encoding.logic': `• Najpierw sprawdzane jest UTF-8 (z BOM lub bez).
• Jeśli plik nie jest poprawnym UTF-8, narzędzie próbuje odgadnąć starsze kodowanie (windows-1250 lub ISO-8859-2) i informuje o tym.
• Jeśli znaki wyglądają źle, zapisz plik jako UTF-8 i wczytaj go jeszcze raz.`,
  'tip.singleCruise.does': `Włącza test, czy statek mógł w zapisanym czasie przepłynąć z jednej stacji do następnej.`,
  'tip.singleCruise.logic': `• ostrzeżenie, gdy statek musiałby płynąć szybciej niż {extreme}, zarówno na odcinku do stacji, jak i od niej ({extremeSrc})
• uwaga, gdy prędkość przekracza {unusual} na obu odcinkach ({unusualSrc})
• stacje bliższe niż {minSeparation} liczą się jako jedno miejsce i są pomijane
• gdy podano samą datę, przyjmowany jest najdłuższy możliwy odstęp`,

  'tip.severities.does': `Wyjaśnia trzy poziomy zastrzeżeń w raporcie i to, co każdy z nich oznacza dla publikacji danych.`,
  'tip.severities.logic': `• Błąd: dane są sprzeczne, niemożliwe albo nieczytelne (np. szerokość geograficzna poza zakresem, brak licencji); popraw to przed publikacją.
• Ostrzeżenie: zwykle wskazuje na błąd w danych; sprawdź i popraw albo przygotuj uzasadnienie.
• Uwaga: informacja do rozważenia; często nie wymaga zmiany.
Brak zastrzeżeń oznacza tylko, że w sprawdzanych kategoriach nie znaleziono problemów.`,
  'tip.notChecked.does': `Wymienia, czego narzędzie nie sprawdziło w tym sprawdzeniu.`,
  'tip.notChecked.logic': `• Lista jest pokazywana zawsze, także gdy nic nie znaleziono.
• Część pozycji zależy od Twoich wyborów: np. prędkość statku nie jest sprawdzana, dopóki nie potwierdzisz, że dane pochodzą z jednego rejsu, albo nie wskażesz kolumny z rejsem.
• Brak zastrzeżeń w raporcie nic nie mówi o pozycjach z tej listy.`,
  'tip.mapLegend.does': `Tłumaczy kolory punktów na mapie podglądu.`,
  'tip.mapLegend.logic': `• Punkt ma kolor najpoważniejszego zastrzeżenia dotyczącego jego wiersza (błąd, ostrzeżenie, uwaga).
• Punkt bez zastrzeżeń ma kolor „brak zastrzeżeń do wiersza”.
• Zastrzeżenia dotyczące całego zbioru, a nie wiersza, nie zmieniają kolorów.
• Wierszy bez pozycji nie ma na mapie.`,

  'tip.cleanCsv.does': `Zapisuje Twoje dane w jednym układzie CSV: najpierw stałe kolumny, potem zmienne.`,
  'tip.cleanCsv.logic': `• Stałe kolumny: stacja, rejs, identyfikator próbki, data, szerokość i długość geograficzna, głębokość; dalej każda mierzona zmienna jako „nazwa [jednostka]”. Pominięte kolumny, kolumna godziny (dołączona do daty) i kolumna ciśnienia nie trafiają do pliku.
• Data jest zapisana w ISO 8601, współrzędne w stopniach dziesiętnych (także gdy w pliku były stopnie i minuty), a przecinek dziesiętny zamieniony na kropkę; pozostałe wartości są przepisane tak, jak zapisano je w pliku, bez przeliczania.
• Tekst zaczynający się od =, +, - lub @ dostaje na początku apostrof, żeby arkusz kalkulacyjny nie potraktował go jako formuły.`,
  'tip.sidecar.does': `Zapisuje, co narzędzie ustaliło o kolumnach: ich znaczenie, jednostkę i skąd ją wzięto.`,
  'tip.sidecar.logic': `• Jeden wiersz na kolumnę: nazwa w pliku, nazwa w czystym CSV, jednostka, źródło jednostki i kod P01, jeśli jest znany.
• Przechowuje też Twoją deklarację jednego rejsu.
• Upuść go razem z plikami przy następnym sprawdzeniu, a deklaracja zostanie przywrócona.`,
  'tip.iso19139.does': `Tworzy szkic rekordu metadanych ISO 19139 do wczytania w GeoNetwork.`,
  'tip.iso19139.logic': `• Wypełnia tylko to, co wynika z danych: zakres geograficzny i czasowy, zmienne, licencję podaną już w metadanych oraz tytuł.
• Pól, których z danych nie da się wziąć, nie wymyśla: kontakt i datę cytowania zaznacza jako brakujące, a języka i kategorii tematycznej w szkicu nie ma.
• To szkic do uzupełnienia w edytorze, a nie gotowy rekord.`,
  'tip.datacite.does': `Tworzy szkic rekordu DataCite (XML) do użycia przy rejestracji numeru DOI.`,
  'tip.datacite.logic': `• Wypełnia tylko to, co wynika z danych i metadanych: tytuł, zakres, zmienne, licencję.
• Rok publikacji ustawia na bieżący rok (zmień go, jeśli trzeba); twórców, wydawcy i numeru DOI nie zgaduje – zostają jako komentarze XML.
• To szkic do uzupełnienia, a nie gotowy rekord.`,
  'tip.draft.does': `Podaje policzone z danych wartości, które możesz skopiować do pól metadanych.`,
  'tip.draft.logic': `• Zakres czasowy i cztery granice geograficzne są liczone z Twoich danych.
• Lista zmiennych zawiera jednostki, ale tylko takie, które ktoś podał.
• Licencja i tytuł pochodzą z metadanych, nie z danych.
• Nazwy pól odpowiadają sekcjom edytora GeoNetwork.`,
  'tip.geojson.does': `Zapisuje pozycje wierszy jako punkty GeoJSON, do otwarcia w QGIS lub innym programie GIS.`,
  'tip.geojson.logic': `• Jeden punkt na każdy wiersz, który ma pozycję; współrzędne bez zmian, jako [długość, szerokość]. W pliku są też wiersze z niemożliwą szerokością geograficzną, których mapa nie pokazuje.
• Każdy punkt ma atrybuty: nazwa pliku, numer wiersza, stacja, data i najpoważniejsze zastrzeżenie dotyczące jego wiersza.
• Wszystkie zbiory w jednym pliku.`,

  'tip.licenceInput.does': `Wskazuje opisy jednego zbioru danych, które mają zostać porównane.`,
  'tip.licenceInput.logic': `• Jedno odwołanie w wierszu: numer DOI, link do Zenodo lub PANGAEA, link do zbioru Dataverse ({dataverse}) albo do rekordu GeoNetwork.
• Czytane są tylko metadane tych rekordów, nigdy pliki z danymi. Link do GBIF lub OBIS nie jest czytany pod kątem licencji: użyj numeru DOI zbioru.
• Wszystkie wiersze powinny dotyczyć jednego zbioru: to kilka miejsc, w których jest opisany.`,
  'tip.licenceOneDeposit.does': `Pokazuje, czy źródła podają tę samą licencję, a źródła jednego depozytu liczy raz.`,
  'tip.licenceOneDeposit.logic': `• Jeden depozyt to rekord w repozytorium razem z jego rekordem DataCite (Zenodo, PANGAEA, Dataverse): opisują ten sam zbiór, więc liczą się jako jedno źródło.
• Porównywane są identyfikatory licencji podane przez źródła, a nie ich teksty prawne.
• Różne licencje w różnych źródłach to sprzeczność; pusty rekord DataCite przy licencji podanej w innym źródle sprzecznością nie jest.`,
  'tip.licenceSpdx.does': `Pokazuje, jak narzędzie odczytało każde stwierdzenie o licencji.`,
  'tip.licenceSpdx.logic': `• Tekst i link każdego stwierdzenia są porównywane z listą licencji SPDX.
• Wynik to jeden identyfikator SPDX albo „nie rozpoznano — sprawdź ręcznie”.
• Narzędzie nie ocenia skutków prawnych licencji i nie czyta jej tekstu.`,
  'tip.licenceDatacite.does': `Zwraca uwagę, że rekord DOI w DataCite nie ma licencji, choć inne źródło ją podaje.`,
  'tip.licenceDatacite.logic': `• DataCite ma pole Rights, ale jest ono opcjonalne, więc wiele rekordów zostaje bez licencji.
• Wytyczne OpenAIRE dla archiwów danych wymagają podania licencji, gdy ma zastosowanie.
• Samo to nie jest sprzecznością: strona pokazuje to osobną uwagą, z prośbą o dodanie licencji do rekordu DOI.`,
  'tip.licenceAttribution.does': `Przygotowuje tekst uznania autorstwa z licencją, gotowy do wklejenia.`,
  'tip.licenceAttribution.logic': `• Powstaje wyłącznie z tego, co podają źródła: tytuł, autorzy, wydawca, rok, licencja, identyfikator.
• Gdy źródła sobie przeczą albo licencji nie rozpoznano, licencja jest pominięta, a strona mówi dlaczego.
• Tekst jest zawsze po angielsku, żeby dało się go wkleić bez zmian; najpierw porównaj go z rekordem.`,

  'tip.collectionKind.does': `Pozwala wybrać, skąd narzędzie wczyta metadane całej kolekcji.`,
  'tip.collectionKind.logic': `• Lista DOI, repozytorium lub prefiks DOI w DataCite, społeczność Zenodo albo katalog GeoNetwork.
• Czytane są tylko metadane, nigdy pliki z danymi.
• Wynik to liczba przypadków każdego problemu, kilka przykładów każdego i lista poprawek w pliku CSV; instytucje nie są ze sobą porównywane.`,
  'tip.collectionDois.does': `Czyta rekordy DataCite dla wypisanych numerów DOI.`,
  'tip.collectionDois.logic': `• Twoja przeglądarka sprawdza każdy numer DOI w DataCite.
• Linki w postaci doi.org/… i zapis doi:… są przyjmowane; powtórzony numer DOI jest czytany raz.
• Wpisz jeden numer w wierszu albo oddziel je spacjami.`,
  'tip.collectionDatacite.does': `Wskazuje repozytorium w DataCite: przez identyfikator klienta albo przez prefiks DOI.`,
  'tip.collectionDatacite.logic': `• Identyfikator klienta obejmuje rekordy jednego repozytorium; prefiks DOI – wszystko, co zarejestrowano pod tym początkiem numeru DOI.
• Przeglądarka pobiera listę z DataCite strona po stronie.`,
  'tip.collectionZenodo.does': `Czyta rekordy społeczności Zenodo; podaj nazwę tak, jak w adresie społeczności.`,
  'tip.collectionZenodo.logic': `• Zenodo ogranicza niezalogowanym użytkownikom liczbę rekordów i zapytań, więc duża społeczność jest czytana długo.
• Społeczność większą niż limit wyszukiwania czyta się w częściach, podzielonych według daty publikacji.`,
  'tip.collectionCsw.does': `Czyta rekordy z wybranego katalogu GeoNetwork.`,
  'tip.collectionCsw.logic': `• Dostępne katalogi: {catalogues}.
• Zapytania przechodzą przez nasz serwer, który przekazuje odpowiedź i niczego nie przechowuje.
• Format metadanych wybierasz obok: ISO 19139 albo ISO 19115-3, jeśli katalog obsługuje oba.`,
  'tip.collectionCross.does': `Porównuje licencje z katalogu z licencjami w DataCite.`,
  'tip.collectionCross.logic': `• Dla rekordów, które podają numer DOI, przeglądarka sprawdza ten numer w DataCite i porównuje licencje obu źródeł.
• Każdy taki rekord to jedno dodatkowe zapytanie, więc odczyt trwa dłużej.`,
  'tip.collectionRun.does': `Pokazuje, ile potrwa odczyt, zanim go zaczniesz, i pozwala zacząć od próby.`,
  'tip.collectionRun.logic': `• Szacunek uwzględnia liczbę rekordów i zapytań; przy dużych kolekcjach liczba zapytań jest tylko przybliżona.
• W szybkiej próbie odczytywana jest tylko część kolekcji, a wyniki są oznaczone jako próba.
• Odczyt można wstrzymać i wznowić; jego postęp zostaje w tej przeglądarce.`,

  'tip.indexCheck.does': `Sprawdza pliki z danymi albo rekord z repozytorium przed publikacją.`,
  'tip.indexCheck.logic': `• Czyta tabele (CSV, Excel, Darwin Core) albo rekord podany linkiem lub numerem DOI.
• Sprawdza współrzędne, daty, jednostki, zakresy wartości i licencję; każde zastrzeżenie opisuje prostym zdaniem, a obok podaje szczegóły techniczne.
• Niczego nie zmienia w Twoich danych: pokazuje, co znalazło, i wymienia to, czego nie sprawdza.`,
  'tip.indexLicence.does': `Porównuje, co o licencji jednego zbioru danych podają różne źródła metadanych.`,
  'tip.indexLicence.logic': `• Czyta metadane z Zenodo, PANGAEA, Dataverse, GeoNetwork i DataCite, a nie pliki z danymi (zbiór z GBIF lub OBIS tylko przez jego DOI).
• Każde stwierdzenie klasyfikuje według listy licencji SPDX i szuka sprzeczności.
• Przygotowuje tekst uznania autorstwa z licencją, gotowy do wklejenia.`,
  'tip.indexCollection.does': `Przegląda metadane całej kolekcji i zbiera problemy z licencjami oraz puste pola.`,
  'tip.indexCollection.logic': `• Czyta wyłącznie metadane, nigdy pliki z danymi.
• Wynik to liczba przypadków każdego problemu, przykłady i lista poprawek w pliku CSV.
• Instytucje nie są ze sobą porównywane ani szeregowane; szybka próba jest oznaczona jako próba.`,

  'tip.convertIntro.does': `Pokazuje, do czego służy ten konwerter: archiwum Darwin Core zbudowane z Twojego arkusza. Strona jest nadal ukrytą wersją testową.`,
  'tip.convertIntro.logic': `• Strona jest na razie ukryta: nie ma jej w menu ani na stronie głównej, a wyszukiwarki są proszone, by ją pominąć.
• Twoje pliki są odczytywane i pokazywane w podglądzie w Twojej przeglądarce; nic z nich nie jest nigdzie wysyłane.
• Archiwum jest budowane w Twojej przeglądarce i stąd pobierane; nic nie jest wysyłane na serwer i nic nie jest zapisywane.
• Jedno opcjonalne wyszukiwanie już jest: nazwy taksonów, które zechcesz sprawdzić, trafiają do WoRMS, i to dopiero po naciśnięciu jego przycisku; jest domyślnie wyłączone. Drugie, dla terminów ze słownika NERC, jest dopiero planowane i będzie działać tak samo.`,
  'tip.convertTaxa.does': `Potwierdza, które z zaproponowanych kolumn to taksony.`,
  'tip.convertTaxa.logic': `• W arkuszu szerokim narzędzie proponuje jako takson, którego nagłówek jest nazwą, każdą kolumnę liczbową bez innego znaczenia, z niską pewnością.
• Zaproponowana kolumna jest przekształcana dopiero po Twoim potwierdzeniu; niepotwierdzona jest pomijana, a podsumowanie podaje, ile ich jest.
• Mierzone wielkości, takie jak temperatura, zostają zmiennymi. Kolumna, której nagłówek zaczyna się od słów total, sum, suma, razem, summe, gesamt, somme lub od znaku Σ albo zawiera jako osobne słowo total, suma, razem lub gesamt, nigdy nie jest proponowana; nadal możesz ją oznaczyć ręcznie.
• Kolumna, której sam nadasz znaczenie „takson (nagłówek to nazwa)”, jest Twoją decyzją i nie wymaga potwierdzenia.`,
  'tip.convertDepthBound.does': `Mówi, który koniec zakresu głębokości przedstawia kolumna głębokości.`,
  'tip.convertDepthBound.logic': `• Próbka pobrana między dwiema głębokościami ma kolumnę górną (płytszy koniec) i dolną (głębszy koniec).
• Przy jednej kolumnie głębokości głębokość górna i dolna są takie same.
• Głębokość jest odczytywana jako metry i nigdy nie jest przeliczana; inna jednostka niż metry blokuje przekształcenie.`,
  'tip.convertEffortValue.does': `Wielkość próby, gdy jest taka sama dla wszystkich próbek.`,
  'tip.convertEffortValue.logic': `• Wpisz z kropką lub przecinkiem jako znakiem dziesiętnym; oba są przyjmowane niezależnie od tego, czego używa arkusz, a zapisywana jest z kropką.
• Jako niejednoznaczne odrzucane są: liczba z więcej niż jedną kropką lub przecinkiem oraz liczba z jedną do trzech cyfr, jednym separatorem i dokładnie trzema cyframi po nim, bo może to być separator tysięcy; zapisz ją bez niego albo z większą lub mniejszą liczbą miejsc po przecinku. Liczba zaczynająca się od zera nie może nim być i jest przyjmowana.
• Odrzucane jest też wszystko, co nie jest liczbą większą od zera, a przekształcenie jest wtedy zablokowane.
• Dla innej wielkości w każdej próbce oznacz zamiast tego kolumnę arkusza.`,
  'tip.convertEffortUnit.does': `Jednostka wielkości próby.`,
  'tip.convertEffortUnit.logic': `• Jest zapisywana tak, jak ją podasz, i nigdy nie jest przeliczana.
• Pojęcie dla jednostki jest dodawane tylko dla {units}; każda inna jednostka dostaje ostrzeżenie i nie dostaje pojęcia.`,
  'tip.convertEffortDimension.does': `Mówi, czy wielkość próby to objętość, czy powierzchnia.`,
  'tip.convertEffortDimension.logic': `• Zwykle jest odczytywane z jednostki (metry sześcienne, litry, metry kwadratowe); wybierz je tylko wtedy, gdy jednostka tego nie mówi.
• Objętość ma pojęcie {volumeConcept}, powierzchnia {areaConcept}.`,
  'tip.role.taxon': `kolumna z nazwami taksonów, jedna na wiersz (arkusz długi); liczba trafia do kolumny ilości.`,
  'tip.role.taxonHeader': `kolumna arkusza szerokiego, której nagłówek jest nazwą taksonu, a komórki to ilości. Proponowane kolumny to tylko kandydaci: potwierdź je wszystkie.`,
  'tip.role.quantity': `liczba dla taksonu w danym wierszu (arkusz długi).`,
  'tip.role.quantityType': `kolumna mówiąca, czym jest ilość; zostaje dla Twojej informacji i nie zastępuje Twojej deklaracji.`,
  'tip.role.effort': `objętość lub powierzchnia pobrana dla danej próbki; jednostkę wpisz w polu jednostki.`,
  'tip.role.occurrenceId': `Twój własny identyfikator rekordu, użyty dokładnie tak, jak go zapisałeś.`,
  'tip.role.lifeStage': `stadium rozwojowe danego rekordu; ma pierwszeństwo przed stadium znalezionym w nazwie.`,
  'tip.role.qualifier': `dopisek przy oznaczeniu tego rekordu (cf., sp., ?); ma pierwszeństwo przed dopiskiem znalezionym w nazwie.`,
  'tip.convertRoles.does': `Wymienia każde znaczenie, jakie kolumna może mieć w konwerterze, także te, które istnieją tylko tutaj.`,
  'tip.convertRoles.logic': `{roles}
• Znaczenia mówią tylko, jak odczytać komórkę; konwerter nie zmienia żadnej Twojej wartości.
• Współrzędne, daty, głębokość oraz nazwy stacji, rejsu i próbki rozpoznają te same reguły co w sprawdzaniu danych.`,
  'tip.convertSheetUse.does': `Wybiera, czy ten arkusz jest przekształcany.`,
  'tip.convertSheetUse.logic': `• Odznaczony arkusz jest całkowicie pomijany: nic z niego nie jest przekształcane, liczone ani sprawdzane.
• Każdy arkusz na początku jest zaznaczony.`,
  'tip.convertShape.does': `Mówi, jak ułożony jest arkusz: jedna kolumna na gatunek albo jeden wiersz na gatunek i próbkę.`,
  'tip.convertShape.logic': `• Szeroki: nagłówek każdej kolumny taksonu to nazwa taksonu, a każda jej wypełniona komórka to jeden rekord tego taksonu w próbce z tego wiersza, z wyjątkiem pomijanych zer i komórek NA, które nie tworzą rekordu.
• Długi: każdy wiersz z taksonem i wartością to jeden rekord, z tymi samymi wyjątkami.
• Narzędzie sugeruje układ na podstawie znaczeń kolumn; wybór należy do Ciebie.`,
  'tip.convertQuantityKind.does': `Mówi, czym są liczby w komórkach gatunków.`,
  'tip.convertQuantityKind.logic': `• Liczebność to liczba osobników i musi być całkowita; zapisuje się ją jako individualCount oraz jako pomiar liczebności ({countConcept}).
• Zagęszczenie lub biomasa zapisuje się jako pomiar z jednostką, nigdy jako individualCount.
• Bez tego wyboru przekształcenie jest zablokowane.
• Nic nie jest przeliczane ani przeskalowywane.`,
  'tip.convertQuantityUnit.does': `Jednostka, w której zapisano liczby.`,
  'tip.convertQuantityUnit.logic': `• Jest zapisywana tak, jak ją podasz, i nigdy nie jest przeliczana.
• Pojęcie dla jednostki jest dodawane tylko dla jednostek, które narzędzie sprawdziło: {units}.
• Każda inna jednostka nie dostaje pojęcia, tylko ostrzeżenie, a tekst jednostki zostaje taki, jak go wpisałeś.`,
  'tip.convertQuantityBasis.does': `Dla biomasy: masa mokra, sucha albo sucha masa bez popiołu.`,
  'tip.convertQuantityBasis.logic': `• Każdy rodzaj masy ma własne pojęcie: {concepts}.
• Bez tego nie da się opisać biomasy, a przekształcenie jest zablokowane.`,
  'tip.convertQuantityPer.does': `Mówi, czy liczby dotyczą objętości, czy powierzchni.`,
  'tip.convertQuantityPer.logic': `• Zwykle jest odczytywane z jednostki; wybierz je tylko wtedy, gdy jednostka tego nie mówi.
• Zagęszczenie na objętość wody ma pojęcie {volumeConcept}, na powierzchnię dna {areaConcept}.
• Jednostka nigdy nie rozstrzyga tego sama wbrew Twojemu wyborowi.`,
  'tip.convertQuantityMedium.does': `Dla liczb na powierzchnię: słup wody albo dno.`,
  'tip.convertQuantityMedium.logic': `• Dla liczby na powierzchnię nie ma ustawienia domyślnego: wybierasz słup wody albo dno.
• Tylko liczba na powierzchnię dna ma sprawdzone pojęcie; liczba na powierzchnię słupa wody nie dostaje pojęcia, tylko ostrzeżenie, i trzeba je dobrać ręcznie przed publikacją.`,
  'tip.convertEffort.does': `Objętość lub powierzchnia, którą pobrano, jeśli ją znasz.`,
  'tip.convertEffort.logic': `• Podaj jedną wartość dla wszystkich próbek albo oznacz kolumnę arkusza.
• Zapisuje się ją przy każdej próbce jako sampleSizeValue i sampleSizeUnit oraz jako pomiar: {volumeConcept} dla objętości, {areaConcept} dla powierzchni.
• Zero, wartość ujemna lub brak blokuje przekształcenie.`,
  'tip.convertCruise.does': `Kod rejsu dla arkusza, który nie ma kolumny z rejsem.`,
  'tip.convertCruise.logic': `• Staje się zdarzeniem rejsu na szczycie drzewa.
• Identyfikator stacji to kod rejsu, dwukropek i kod stacji.
• Pozostawiony pusty, stacje nie mają nad sobą rejsu.`,
  'tip.convertFullList.does': `Mówi, czy w każdej próbce szukano każdego gatunku z listy.`,
  'tip.convertFullList.logic': `• Zaznaczone: zero staje się nieobecnością (occurrenceStatus absent), z individualCount równym zero tylko dla liczebności i bez pomiaru.
• Niezaznaczone: zera są pomijane, a ich liczba jest pokazana jako informacja.
• Pusta komórka lub NA nigdy nie jest rekordem.
• Przeglądarka niczego nie zapamiętuje; zaznaczenie może ustawić plik towarzyszący wrzucony razem z danymi.`,
  'tip.convertStationPrefix.does': `Czyni identyfikatory próbek unikalnymi, gdy ten sam kod próbki występuje na kilku stacjach.`,
  'tip.convertStationPrefix.logic': `• Wyłączone: identyfikatorem próbki jest Twój kod próbki.
• Włączone: identyfikator to identyfikator stacji, dwukropek i Twój kod.
• Identyfikator nigdy nie powstaje z głębokości, kolejności wierszy ani z wyszukiwania nazwy taksonu.
• Wybór pojawia się, gdy kody się powtarzają albo zaznaczył go plik towarzyszący.`,
  'tip.convertFlattenStation.does': `Pomija poziom stacji w drzewie.`,
  'tip.convertFlattenStation.logic': `• Kod stacji zostaje jako miejsce (locality) każdej próbki, a próbki wiszą bezpośrednio pod rejsem.
• Żaden identyfikator się nie zmienia.
• Data, pozycja i głębokość rejsu są wtedy wyliczane z próbek.
• Nic nie jest spłaszczane, dopóki tego nie zaznaczysz.`,
  'tip.convertFlattenCruise.does': `Pomija poziom rejsu w drzewie.`,
  'tip.convertFlattenCruise.logic': `• Kod rejsu trafia zamiast tego do tekstu zbioru danych, a stacje stoją na szczycie drzewa.
• Identyfikator stacji nadal zaczyna się od kodu rejsu.
• Nic nie jest spłaszczane, dopóki tego nie zaznaczysz.`,
  'tip.convertSplits.does': `Potwierdza, jak podzielono nazwę z dopiskiem, stadium lub płcią albo nazwę budzącą wątpliwości.`,
  'tip.convertSplits.logic': `• Dopiski ({qualifiers}) trafiają do dopisku przy oznaczeniu, stadia ({stages}) do stadium rozwojowego, a oznaczenie płci (f, m, fem, female, male, ♀, ♂, z kropką lub bez) po przecinku albo zaraz po stadium lub znaku zapytania do płci. Zapis f. przed epitetem to forma i zostaje w nazwie.
• Nazwa, w której zostaje cyfra, ukośnik, znak zapytania, zakres stadiów, pojedyncza litera, oznaczenie płci na końcu lub więcej niż trzy słowa, jest pokazana z powodem, abyś ją poprawił.
• Dokładny tekst zawsze zostaje jako verbatimIdentification. Przed zatwierdzeniem możesz poprawić nazwę, dopisek, stadium i płeć.
• Podział jest tylko propozycją, dopóki go nie zatwierdzisz, a niezatwierdzony podział blokuje przekształcenie. Zwykła nazwa nie wymaga decyzji.
• Przycisk dla wszystkich pokazanych zatwierdza tylko podziały bez wątpliwości. Podział z wątpliwością zatwierdzasz w jego wierszu, po poprawieniu albo przyciskiem „Zatwierdź bez zmian”; przycisk podaje, ile pominął.`,
  'tip.convertCodes.does': `Proponuje kody próbek jednorazowo, dla arkusza, który ich nie ma.`,
  'tip.convertCodes.logic': `• Kod to kod stacji, łącznik i kolejny numer, w kolejności Twojego arkusza. Jeśli z tekstu stacji powstałby kod zaczynający się jak formuła (od = + - lub @), kodem jest zamiast tego S i numer wiersza, aby nie potrzebował apostrofu i był taki sam na stronie i w pliku.
• Dostajesz z powrotem własny arkusz jako plik CSV z jedną nową kolumną. Komórki są kopiowane jako tekst. Komórka lub nagłówek zaczynające się od = + - lub @ (także w formie pełnej szerokości) albo od tabulatora dostają apostrof, by arkusz kalkulacyjny ich nie wykonał; zwykłe liczby, oznaczenia braku danych, takie jak NA, oraz same znaki + x -, także ze spacjami wokół, zostają bez zmian. Daty z pliku xlsx są zapisywane jako daty ISO, a godziny jako godziny i minuty.
• Sprawdź go i wgraj ten plik ponownie: identyfikatorem staje się tylko kod z Twojego wgranego arkusza.
• Apostrof przed znakiem formuły to własny sposób arkusza na oznaczenie tekstu, więc gdy wgrasz plik ponownie, konwerter czyta '=x jako =x. Zdejmuje ten jeden apostrof z każdej komórki tekstowej i każdego nagłówka, które od niego zaczynają, i tylko tu: sprawdzarka czyta plik takim, jaki jest.
• Konwerter nigdy sam nie stosuje ani nie odnawia kodów.`,
  'tip.convertMetaTitle.does': `Nadaje zbiorowi danych nazwę, którą ludzie przeczytają.`,
  'tip.convertMetaTitle.logic': `• Staje się tytułem w opisie (eml.xml), a gdy nazwa zbioru jest pusta, także nazwą zbioru w każdym wierszu zdarzenia.
• Napisz go po angielsku: opis jest oznaczony jako angielski.
• Brzmienie nie jest sprawdzane; pusty tytuł blokuje eksport.`,
  'tip.convertMetaAbstract.does': `Mówi czytelnikowi, czym są dane i jak je zebrano.`,
  'tip.convertMetaAbstract.logic': `• Staje się streszczeniem w opisie. Pusty wiersz zaczyna nowy akapit.
• Polityka danych OBIS wymaga szczegółowego opisu, także metody zbioru; to narzędzie sprawdza tylko, czy coś napisano.
• Puste streszczenie blokuje eksport.`,
  'tip.convertMetaCreators.does': `Wymienia osoby lub grupy, które stworzyły zbiór danych.`,
  'tip.convertMetaCreators.logic': `• Po jednym w wierszu, jako „Imię Nazwisko” albo „Nazwisko, Imię”. Z przecinkiem nazwa jest przyjmowana tak, jak zapisano: to, co stoi przed przecinkiem, jest nazwiskiem. Bez przecinka nazwiskiem jest ostatnie słowo razem z małą literą partykułą tuż przed nim ({particles}), więc „Maria de la Cruz” ma nazwisko „de la Cruz”. Średnik też oddziela dwa nazwiska.
• Stają się autorami w opisie i, gdy pole cytowania jest puste, autorami w tekście cytowania. Nazwa, którą plik z metadanymi oznacza jako instytucję, oraz wiersz z wyraźnym słowem instytucji ({organisationWords}) są zapisywane jako nazwa instytucji i nie są dzielone; formularz pokazuje poniżej, jak każdy wiersz zostanie zapisany. Nazwa złożona tylko z partykuł i jednego słowa („de Vries”) to nazwisko bez imienia. Narzędzie nikogo nie wyszukuje.
• Potrzebny jest co najmniej jeden.`,
  'tip.convertMetaContact.does': `Mówi, do kogo czytelnik ma pisać w sprawie zbioru danych.`,
  'tip.convertMetaContact.logic': `• Imię i nazwisko oraz adres e-mail stają się kontaktem i dostawcą metadanych w opisie. Adres jest tylko zapisywany w pliku; ta strona nigdzie go nie wysyła.
• Adres musi wyglądać jak adres (coś@coś.coś); nie jest testowany.
• Potrzebne są oba.`,
  'tip.convertMetaInstitution.does': `Podaje instytucję, do której należą dane, jej krótkim kodem.`,
  'tip.convertMetaInstitution.logic': `• Jest zapisywany jako institutionCode w każdym wierszu zdarzenia. BioCheck zgłasza tabelę Event bez niego jako błąd.
• Użyj krótkiego kodu, którego Twoja instytucja używa w OBIS lub GBIF; narzędzie go nie sprawdza.
• Nie może zawierać tabulatora ani podziału wiersza.`,
  'tip.convertMetaDatasetName.does': `Nazywa zbiór danych tak, jak pojawia się w każdym wierszu zdarzenia.`,
  'tip.convertMetaDatasetName.logic': `• Jest zapisywana jako datasetName w każdym wierszu zdarzenia. Gdy jest pusta, używany jest tytuł. BioCheck zgłasza tabelę Event bez datasetName jako błąd i może ostrzegać, gdy różni się od tytułu.
• Pobrany plik nosi jej nazwę.
• Nie może zawierać tabulatora ani podziału wiersza.`,
  'tip.convertMetaMethods.does': `Opisuje, jak zebrano dane (opcjonalnie).`,
  'tip.convertMetaMethods.logic': `• Staje się sekcją metod w opisie. Pusty wiersz zaczyna nowy akapit.
• Gdy jest puste, sekcja metod nie jest zapisywana. Polityka danych OBIS wymaga, by metoda była częścią opisu, więc warto ją uzupełnić.`,
  'tip.convertLicence.does': `Wybiera licencję, na jakiej opublikowany jest zbiór danych.`,
  'tip.convertLicence.logic': `• Oferowane są tylko {licences}: to licencje, które OBIS przyjmuje (preferowana jest ta z domeny publicznej, najmniej ta niekomercyjna), i te, które narzędzie GBIF do publikowania potrafi zapisać. Licencji Creative Commons z ShareAlike (SA) lub NoDerivatives (ND) nie ma na liście OBIS, więc nie jest oferowana.
• Decyduje posiadacz praw, nie to narzędzie. Nie ma wartości domyślnej, a niewybrana licencja blokuje eksport.
• Jest zapisywana w opisie jako nazwa licencji z jej adresem WWW, w formie, jaką zapisuje narzędzie GBIF do publikowania.`,
  'tip.convertBasis.does': `Mówi, jakiego rodzaju zapisem jest każde wystąpienie.`,
  'tip.convertBasis.logic': `• Jedna wartość dla całego zbioru: {bases}. Jest zapisywana jako basisOfRecord przy każdym wystąpieniu, a BioCheck odrzuca każdą inną wartość.
• Obserwacja człowieka jest policzona i nic nie zachowano; okaz konserwowany jest przechowywany w kolekcji (podręcznik OBIS wymaga wtedy też kodu kolekcji i numeru katalogowego, których to narzędzie nie zapisuje); próbka materiału to fizyczna próbka, którą pobrano i która mogła zostać zakonserwowana albo zniszczona.
• Nie ma wartości domyślnej: zależy od tego, co zrobiono z próbkami. Niewybrana wartość blokuje eksport.`,
  'tip.convertSummaryColumn.does': `Wyjaśnia, dlaczego kolumna sum zaczyna jako „pomiń”.`,
  'tip.convertSummaryColumn.logic': `• Kolumna, której nagłówek wygląda na sumę lub razem (Sum, Total, Suma, Razem, Summe, Gesamt, Somme, Σ), sumuje inne kolumny. Po przekształceniu policzyłaby te same osobniki dwa razy.
• Dlatego zaczyna jako pominięta i niczego nie zapisuje w archiwum. Nadal możesz nadać jej inne znaczenie; wtedy to Twoja decyzja.
• W ten sposób zmieniana jest tylko kolumna, którą narzędzie uznałoby inaczej za zmierzoną wielkość. Kolumna rozpoznana jako standardowa wielkość zachowuje swoją propozycję.`,
  'tip.convertAccept.does': `Pozwala zaakceptować rodzaj ostrzeżenia dla tego eksportu.`,
  'tip.convertAccept.logic': `• Ostrzeżenie nie blokuje eksportu, ale archiwum będzie zawierać to, o czym mówi (na przykład tekst w komórce gatunku, kolumna, która nie jest zapisywana, albo brak identyfikatora taksonu). Każdy rodzaj trzeba zaakceptować raz, po przeczytaniu.
• Zaznaczenie trwa, dopóki uwagi tego rodzaju się nie zmienią; gdy zmieni je Twoja decyzja, trzeba je dać ponownie. Pisanie w opisie niczego nie odznacza. Nic nie jest zapisywane: nowe wgranie zaczyna z każdym ostrzeżeniem niezaakceptowanym.
• Błędów nie można zaakceptować: blokują eksport, dopóki nie usuniesz przyczyny.
• Uwagi, które tylko informują, są pokazywane i nie wymagają odpowiedzi.`,
  'tip.convertExport.does': `Buduje archiwum Darwin Core i je pobiera.`,
  'tip.convertExport.logic': `• Przycisk działa tylko wtedy, gdy nic nie blokuje, opis jest kompletny i każdy rodzaj ostrzeżenia jest zaakceptowany. Archiwum jest budowane w Twojej przeglądarce przez kod, który je sprawdził i który przed zapisem sprawdza wszystko jeszcze raz; jeśli coś blokuje, nic nie jest zapisywane.
• Zip zawiera opis (EML {eml}), tabele zdarzeń, wystąpień i pomiarów oraz meta.xml. Pliki tekstowe są w UTF-8, rozdzielane tabulatorami, jeden rekord w wierszu.
• Pozycja lub głębokość z jednej zwykłej komórki liczbowej jest kopiowana tak, jak jest zapisana: przecinek dziesiętny staje się kropką, początkowy plus i zera przed częścią całkowitą są odrzucane, brakująca część całkowita staje się zerem, a samotna kropka na końcu jest odrzucana; każda cyfra po kropce zostaje. Pozycja podana w stopniach i minutach jest zapisywana jako stopnie dziesiętne z dokładnością źródła, a kolumna głębokości oznaczona jako dodatnia w górę jest zapisywana z odwróconym znakiem. Pozycja rejsu lub stacji obliczona z ich próbek jest zaokrąglana do {derived} miejsc po przecinku z obciętymi końcowymi zerami, a jej niepewność do pełnych metrów w górę. Liczebność jest zapisywana jako liczba całkowita (zerowa część dziesiętna jest odrzucana). Zagęszczenia, biomasy i wielkości prób są kopiowane tak, jak są zapisane, z przecinkiem dziesiętnym zamienionym na kropkę. Nic nie jest przeskalowywane.
• Plik nosi nazwę zbioru. Nic nie jest wysyłane i nic nie jest zapisywane.`,
  'tip.convertCompanion.does': `Zapisuje Twoje wybory dotyczące listy gatunków, kodów próbek i opcji WoRMS na następny raz.`,
  'tip.convertCompanion.logic': `• To mały plik CSV w formacie pliku towarzyszącego sprawdzarki, z wierszem „pełna lista gatunków”, wierszem „przedrostek stacji” i wierszem „wyszukiwanie w WoRMS”, każdy tylko gdy jest zaznaczony.
• Wgraj go następnym razem razem z danymi, a wybory zaczną jako zaznaczone. Zaznaczona opcja WoRMS nadal niczego nie wysyła, dopóki nie naciśniesz jej przycisku wyszukiwania. Przeglądarka niczego nie pamięta, więc ten plik jest jedyną pamięcią.
• Nie zawiera żadnych danych, nazw ani wartości z Twojego arkusza.`,
  'tip.role.taxonId': `identyfikator taksonu tego rekordu, zapisywany do scientificNameID bez zmian (kolumna AphiaID, czyli liczbowy identyfikator WoRMS, jest zapisywana jako urn:lsid taksonu). Tylko dla arkusza z jednym rekordem w wierszu; te identyfikatory nigdy nie są wyszukiwane ani zmieniane, a nazwa, która ma taki w którymkolwiek wierszu, jest pomijana w opcjonalnym wyszukiwaniu w WoRMS.`,
  'tip.convertDevice.does': `Podaje narzędzie, którym pobrano próbki.`,
  'tip.convertDevice.logic': `• Wybierz jedno z narzędzi, które mają sprawdzone pojęcie w słowniku NERC (nazwane sieci, chwytak, próbnik rdzeniowy i cztery kategorie narzędzi), albo wpisz własną nazwę. Jest zapisywane jako pomiar przy każdym zdarzeniu próbki: nazwa narzędzia próbkowania ({instrument}) z narzędziem jako wartością; wybrane narzędzie ma adres w słowniku, wpisana nazwa go nie ma.
• Lista zawiera tylko to, co sprawdzono; narzędzie, którego na niej nie ma, się wpisuje. Nic nie jest zgadywane z nazw kolumn.
• Można zostawić puste, ale BioCheck ostrzeże wtedy, że nie ma narzędzia próbkowania, i to ostrzeżenie trzeba zaakceptować.`,
  'tip.convertMesh.does': `Podaje rozmiar oczka sieci lub sita w mikrometrach (opcjonalnie).`,
  'tip.convertMesh.logic': `• Zwykła liczba większa od zera, z kropką lub przecinkiem. Jest zapisywana jako pomiar przy każdym zdarzeniu próbki ({meshConcept}) z jednostką mikrometry ({unit}); żadna inna jednostka nie jest tu przyjmowana i nic nie jest przeliczane.
• Puste pole nic nie zapisuje. Wartość, której nie da się odczytać jako liczby, blokuje eksport i mówi dlaczego.`,
  'tip.convertTree.does': `Pokazuje drzewo zdarzeń, jakie miałoby archiwum.`,
  'tip.convertTree.logic': `• Rejs, stacja i próbka pochodzą z Twoich kolumn, a typ zapisuje się jako tekst.
• Data rejsu lub stacji to przedział jej próbek; pozycja to środek ramki wokół jej próbek, z niepewnością obejmującą je wszystkie, w pełnych metrach zaokrąglonych w górę; głębokość biegnie od najpłytszej góry do najgłębszego dołu.
• Pokazano tylko kilka przykładów, nie każde zdarzenie.`,
  'tip.convertMetaFiles.does': `Wymienia dodane pliki, które opisują zbiór danych, zamiast zawierać dane.`,
  'tip.convertMetaFiles.logic': `• Plik jest plikiem z metadanymi, gdy jego zawartość to rekord ISO 19139 lub ISO 19115-3 (XML), rekord DataCite (XML lub JSON) albo rekord Zenodo (JSON). Rodzaj jest rozpoznawany po zawartości, nie po nazwie.
• Nigdy nie jest odczytywany jako arkusz z danymi i nigdy nie jest przekształcany.
• Czytane jest tylko to, co jest w pliku, tymi samymi czytnikami co w /check. Żaden link ani DOI nie jest otwierany i nie jest wysyłane żadne żądanie; rekord, którego nie dodano jako pliku, nie jest pobierany.`,
  'tip.convertMetaSource.does': `Wyjaśnia, skąd pochodzi wpisana wartość.`,
  'tip.convertMetaSource.logic': `• Pole jest uzupełniane z Twoich plików z metadanymi tylko wtedy, gdy każdy plik, który je ma, mówi to samo, albo ma je tylko jeden plik. Przy porównaniu pomijane są wielkie litery i odstępy.
• Pod polem widać plik i pole tego pliku, z którego odczytano wartość. Informacja znika, gdy zmienisz tekst.
• Każde pole można edytować, a pole, które wpisano lub dla którego wybrano wartość, zachowuje ten tekst przy ponownym odczycie plików.
• Pole, które mógłby uzupełnić plik z metadanymi, ale żaden z Twoich go nie ma, jest oznaczone jako brakujące.`,
  'tip.convertMetaChoice.does': `Pozwala wybrać między wartościami, w których pliki z metadanymi się różnią.`,
  'tip.convertMetaChoice.logic': `• Gdy pliki podają różne wartości pola, żadna nie jest wpisywana: narzędzie nie ustawia formatów plików w kolejności ważności i nie bierze pierwszego pliku. To samo dotyczy kontaktu, gdy kilka plików podaje po jednym.
• Każda inna wartość jest wymieniona raz, z każdym plikiem, który ją podaje. „Użyj tej” kopiuje ją do pola, gdzie nadal można ją edytować.
• Gdy pole ma już wartość różną od tej, którą podaje plik (wpisaną lub wybraną przez Ciebie), wartość z pliku pozostaje widoczna z „Użyj tej”; nigdy sama nie zastępuje Twojej wartości.
• Możesz też pominąć listę i wpisać własną wartość.`,
  'tip.convertMetaCitation.does': `Ustala tekst cytowania zapisany w opisie archiwum.`,
  'tip.convertMetaCitation.logic': `• Jest zapisywany w jednym wierszu w additionalMetadata/gbif/citation w eml.xml.
• Z pliku z metadanymi jest budowany funkcją, która pisze wiersz atrybucji na stronie licencji: autorzy, rok, tytuł, wydawca i DOI tak, jak podaje je plik. DOI to tylko tekst wzięty z pliku; nic nie jest wyszukiwane. Licencja nie jest jego częścią, bo zapisuje się ją osobno.
• Jeśli puste, jest budowane z autorów, tytułu i roku eksportu.`,
  'tip.convertMetaCoverage.does': `Pokazuje czas i miejsce, które metadane podają dla danych.`,
  'tip.convertMetaCoverage.logic': `• Tylko informacyjnie, aby można je porównać ze swoimi danymi.
• Zakres zapisany w eml.xml (prostokąt, daty, taksony) jest zawsze obliczany ze zdarzeń i wystąpień w archiwum, nigdy z tych wartości.
• Każdy plik ma własny wiersz; wartości nie są łączone.`,
  'tip.convertLicenceTaken.does': `Mówi, że licencja została wzięta z Twoich metadanych.`,
  'tip.convertLicenceTaken.logic': `• Jest wpisywana tylko wtedy, gdy porównanie, którego używają /check i strona licencji, nie znajduje w Twoich plikach sprzeczności i rozpoznano dokładnie jedną licencję, będącą jedną z {licences}.
• Inne oświadczenia, które nie są licencją (uwaga o dostępie, ograniczenie użycia), są wymienione obok jako dodatkowa uwaga, nigdy jako konflikt.
• Widać plik i pole, z którego ją odczytano, i możesz ją zmienić. Jeśli wybierzesz inną licencję, ostrzeżenie prosi o zaakceptowanie, że archiwum ma licencję inną niż ta z Twoich plików.
• Licencję wybiera posiadacz praw: sprawdź, czy to ta właściwa.`,
  'tip.convertLicenceOther.does': `Wyjaśnia, dlaczego nie wpisano licencji, choć metadane jakąś podają.`,
  'tip.convertLicenceOther.logic': `• OBIS przyjmuje tylko {licences}. Gdy porównanie nie znajduje sprzeczności, ale Twoje pliki podają inną licencję, inną wersję licencji, licencję ShareAlike lub NoDerivatives albo tylko wolny tekst, jest ona pokazywana, ale nieużywana. Gdy podają dwie lub więcej licencji obok siebie (podwójne licencjonowanie, na przykład licencja domeny publicznej i CC BY), pliki podają kilka licencji, a posiadacz praw musi wybrać jedną: nic nie jest wpisywane.
• Narzędzie nigdy nie zamienia licencji na najbliższą przyjmowaną: starsza wersja nie staje się nowszą, a licencja ShareAlike nie staje się żadną z trzech.
• Oświadczenia, które nie są licencją, są wymienione jako dodatkowa uwaga.
• O tym, której z trzech użyć, decyduje posiadacz praw; wybierasz ją poniżej. Wybór jednej z licencji z Twoich plików nie wywołuje ostrzeżenia; każdy inny wywołuje ostrzeżenie, które trzeba zaakceptować.`,
  'tip.convertLicenceContradictory.does': `Wyjaśnia, dlaczego nie wpisano licencji, gdy metadane się różnią.`,
  'tip.convertLicenceContradictory.logic': `• Porównanie, którego używają /check i strona licencji, zgłasza sprzeczność: pliki się różnią, oświadczenie przeczy samo sobie, ograniczenie przeczy otwartej licencji albo wpis o prawach, który nie jest licencją ani neutralną uwagą o dostępie, stoi obok licencji w tym samym rekordzie. Każde oświadczenie jest wymienione z plikiem i polem.
• Narzędzie nie wybiera między nimi.
• O tym, która licencja obowiązuje, decyduje posiadacz praw; wybierasz jedną z {licences} poniżej. Ostrzeżenie prosi o zaakceptowanie wyboru, gdy różni się od licencji z Twoich plików: gdy pliki podają dwie różne licencje, różni się każdy wybór (odbiega od drugiego pliku); gdy podają jedną, różni się każda inna licencja.`,
  'tip.convertLicenceMissing.does': `Wyjaśnia, dlaczego nie wpisano licencji.`,
  'tip.convertLicenceMissing.logic': `• Żaden z dodanych plików nie podaje licencji dla danych.
• Nic nie jest zakładane: nie ma licencji domyślnej.
• Decyduje posiadacz praw; wybierasz jedną z {licences} poniżej, a niewybrana licencja blokuje eksport.`,
  'tip.convertMetaList.does': `Pozwala wybrać jeden z kontaktów, które wymienia pojedynczy plik.`,
  'tip.convertMetaList.logic': `• Plik, który podaje kilka osób kontaktowych, nie jest w sprzeczności sam ze sobą: to lista, a narzędzie nie wie, którą zapisać.
• Pokazano kilka pierwszych; „Pokaż wszystkie” wymienia resztę. „Użyj tej” kopiuje kontakt (imię i nazwisko oraz, jeśli plik je ma, adres e-mail) do pól, gdzie nadal można go edytować.
• Nic nie jest wpisywane, dopóki Twoje pliki podają łącznie więcej niż jeden kontakt. Kontakt, który inny plik podaje osobno, jest pokazany także, z nazwą pliku, więc żaden kontakt z żadnego pliku nie zostaje pominięty. Jeden kontakt we wszystkich Twoich plikach wypełnia pola sam.`,
  'tip.convertArchiveDesc.does': `Wymienia dodane pliki opisu archiwum Darwin Core.`,
  'tip.convertArchiveDesc.logic': `• Plik eml.xml (dokument EML) lub meta.xml (mapa kolumn archiwum) jest rozpoznawany po zawartości, nie po nazwie.
• Nigdy nie jest odczytywany jako arkusz z danymi, a jego wartości nie są używane: opis zbioru pochodzi z plików z metadanymi (ISO, DataCite, Zenodo) albo z formularza.
• Nie jest wysyłane żadne żądanie; plik jest tylko wymieniony.`,
  'tip.convertWormsOptIn.does': `Pozwala dopasować nazwy gatunków z arkusza do WoRMS, rejestru gatunków morskich, aby wypełnić scientificNameID. Jest wyłączone i niczego nie wysyła, dopóki nie naciśniesz przycisku wyszukiwania.`,
  'tip.convertWormsOptIn.logic': `• Wyłączone przy każdym wgraniu. Plik towarzyszący może tylko zaznaczyć pole; zaznaczenie niczego nie wysyła.
• Przycisk wysyła wyłącznie różne nazwy naukowe, bez dopisku, stadium i płci, w wywołaniach po najwyżej {batch} nazw, jedno po drugim.
• Nazwa, która ma identyfikator taksonu z arkusza w którymkolwiek wierszu, nie jest wysyłana i żaden jej wiersz nie dostaje identyfikatora z WoRMS; ostrzeżenie mówi o tym, gdy tylko część wierszy go ma.
• Zapisywany jest identyfikator {lsid} rekordu, który pasuje do nazwy tak, jak ją zapisano. scientificName nigdy nie jest zmieniana.`,
  'tip.convertWormsPrivacy.does': `Mówi dokładnie, co opuszcza Twój komputer, jeśli użyjesz wyszukiwania, i do kogo trafia.`,
  'tip.convertWormsPrivacy.logic': `• Wysyłane są tylko nazwy taksonów: nic więcej z Twoich plików ani z tego, co wpisano.
• Idą prosto z Twojej przeglądarki do www.marinespecies.org, usługi internetowej WoRMS prowadzonej przez VLIZ. Nie przechodzą przez serwer tej strony.
• Usługa widzi Twój adres IP, jak każda strona.
• Nazwa gatunku może ujawnić niepublikowane wyniki, na przykład jakie gatunki znaleziono w Twoich danych.
• Nic nie jest wysyłane, dopóki nie naciśniesz przycisku wyszukiwania.`,
  'tip.convertWormsTable.does': `Pokazuje, co WoRMS odpowiedział dla każdej nazwy, abyś przed zapisaniem czegokolwiek widział, jaki identyfikator dostanie każda nazwa.`,
  'tip.convertWormsTable.logic': `• Rodzaj dopasowania: dokładne znaczy, że nazwa jest w WoRMS zapisana tak samo; fonetyczne i zbliżone to podobna, ale inna pisownia; tylko rodzaj znaczy, że dopasował się wyłącznie rodzaj.
• Status: nazwa niezaakceptowana to synonim, a jej nazwa ważna jest pokazana.
• Środowisko wymienia znaczniki morskie, słonawowodne, słodkowodne i lądowe, które ma WoRMS. Nazwa wyłącznie słodkowodna lub lądowa dostaje ostrzeżenie do zaakceptowania przed eksportem.
• Nazwa bez wyniku nie dostaje identyfikatora i dostaje ostrzeżenie do zaakceptowania przed eksportem.`,
  'tip.convertWormsChoice.does': `Tu decydujesz, który wynik z WoRMS stanie się identyfikatorem nazwy, albo że nazwa nie dostanie żadnego.`,
  'tip.convertWormsChoice.logic': `• Automatycznie przyjmowany jest tylko pojedynczy wynik z dopasowaniem dokładnym. Nadal możesz wybrać dla niego brak identyfikatora.
• Przy wyniku fonetycznym, zbliżonym lub tylko na poziomie rodzaju, albo gdy wyników jest kilka, nic nie jest wstępnie wybrane: wybierasz jeden wynik albo brak identyfikatora, a nazwa bez decyzji blokuje eksport.
• Identyfikator wybranego wyniku jest zapisywany tak, jak jest, nawet gdy ta nazwa jest niezaakceptowana: podręcznik OBIS każe podać identyfikator nazwy zapisanej w scientificName, a OBIS sam przekłada go na nazwę zaakceptowaną. scientificName zostaje taka, jak ją zapisano.`,
};

const de: Record<TipKey, string> = {
  'tip.aria': `Erläuterung: {label}`,
  'tip.does': `Was es tut`,
  'tip.logic': `Die Logik`,
  'tip.ruleLink': `Regeldetails →`,
  'tip.roles.feeds': `verwendet in Regeln`,
  'tip.encoding.label': `Textkodierung`,

  'tip.role.ignore': `die Spalte geht in keine Prüfung und nicht in die bereinigte CSV ein.`,
  'tip.role.latitude': `die Nord-Süd-Position des Punktes.`,
  'tip.role.longitude': `die Ost-West-Position des Punktes.`,
  'tip.role.datetime': `Datum und Uhrzeit in einer Spalte.`,
  'tip.role.date': `nur das Datum, ohne Uhrzeit.`,
  'tip.role.time': `die Uhrzeit, mit dem Datum der Datumsspalte verbunden; ohne Datumsspalte wird sie nicht verwendet.`,
  'tip.role.depth': `Abstand unter der Oberfläche; die positive Richtung und die Einheit geben Sie daneben an.`,
  'tip.role.pressure': `die Spalte wird erkannt, aber keine Prüfung und keine Ausgabedatei verwendet sie.`,
  'tip.role.station': `Name oder Nummer einer Station; fasst die Zeilen eines Ortes zusammen.`,
  'tip.role.cruise': `trennt beim Geschwindigkeitstest die Fahrten und ersetzt das Häkchen für eine Fahrt.`,
  'tip.role.sampleId': `Kennung einer Probe oder eines Kerns; bei verknüpften Blättern vertritt sie die Station.`,
  'tip.role.variable': `eine gemessene Größe; braucht einen Namen und eine Einheit, und die Einheit rät das Werkzeug nie.`,

  'tip.dropZone.does': `Liest Dateien von Ihrem Rechner ein, damit sie geprüft werden können.`,
  'tip.dropZone.logic': `• Angenommene Endungen: {formats}.
• XML- und JSON-Dateien werden als Metadaten gelesen (z. B. ISO 19139 oder DataCite), die übrigen als Datentabellen.
• Eine .zip-Datei wird als Darwin Core Archive gelesen (OBIS- oder GBIF-Daten).
• Die Dateien bleiben in Ihrem Browser; es wird nichts hochgeladen.`,
  'tip.linkField.does': `Holt einen Datensatz aus einem Repositorium über seinen Link oder seine DOI und prüft Metadaten und Datendateien.`,
  'tip.linkField.logic': `• Erkannt werden Zenodo, PANGAEA, GBIF, OBIS, jede DOI (über DataCite), Dataverse ({dataverse}) und GeoNetwork ({geonetwork}).
• Dateien werden nur von Servern der Erlaubnisliste geladen (siehe Seite Datenschutz); bei anderen Servern laden Sie die Datei selbst herunter und legen sie oben ab.
• Größenlimits: Über den Server darf eine Datei aus einem Link höchstens {maxFile} groß sein, ein Archiv von einem IPT-Server höchstens {maxArchive}; eine Datei eines Dataverse-Datensatzes über {maxFile} wird übersprungen.`,
  'tip.downloadMode.does': `Legt fest, wer die Dateien hinter einem Link herunterlädt: Ihr Browser oder unser Server.`,
  'tip.downloadMode.logic': `• Browser: Die Dateien kommen direkt vom Datenserver zu Ihnen; manche Server erlauben das nicht.
• Abyssal-Claims-Server: lädt die Datei für Sie von Servern der Erlaubnisliste (höchstens {maxFile}, IPT-Archive höchstens {maxArchive}) und speichert nichts.
• Abgelegte Dateien verlassen Ihren Rechner in keinem der beiden Modi.`,

  'tip.layout.does': `Zeigt, wie das Werkzeug den Aufbau der Datei verstanden hat, und lässt Sie ihn korrigieren.`,
  'tip.layout.logic': `• Eine Tabelle: Eine Zeile ist eine Probe.
• Langformat: Eine Zeile ist eine Messung; das Werkzeug macht daraus eine Zeile pro Probe.
• Zwei Blätter: Messungen werden über eine Schlüsselspalte mit Positionen und Daten verknüpft.
• Ein Layout, das es nicht lesen kann, wird nicht geraten: Es wird gemeldet, die übrigen Tabellen werden weiter geprüft.`,
  'tip.roles.does': `Sagt dem Werkzeug, was jede Spalte ist; davon hängt ab, welche Prüfungen sie erfassen.`,
  'tip.roles.logic': `Eine Einheit wird nie geraten: Eine Spalte ohne angegebene Einheit bleibt ohne Einheit.
{roles}`,
  'tip.encoding.does': `Zeigt, in welcher Zeichenkodierung die Datei gelesen wurde; davon hängt ab, ob Umlaute und andere Sonderzeichen stimmen.`,
  'tip.encoding.logic': `• Zuerst wird UTF-8 versucht (mit oder ohne BOM).
• Ist die Datei kein gültiges UTF-8, rät das Werkzeug eine ältere Kodierung (windows-1250 oder ISO-8859-2) und meldet das.
• Sehen Zeichen falsch aus, speichern Sie die Datei als UTF-8 und laden Sie sie erneut.`,
  'tip.singleCruise.does': `Schaltet eine Prüfung ein, ob das Schiff zwischen aufeinanderfolgenden Stationen hätte fahren können.`,
  'tip.singleCruise.logic': `• Warnung, wenn das Schiff auf beiden Seiten einer Station schneller als {extreme} fahren müsste ({extremeSrc})
• Hinweis bei mehr als {unusual} auf beiden Seiten einer Station ({unusualSrc})
• Stationen näher als {minSeparation} gelten als ein Ort und werden übersprungen
• Ein Datum ohne Uhrzeit bedeutet den längstmöglichen Abstand`,

  'tip.severities.does': `Erklärt die drei Stufen der Befunde im Bericht und was jede vor der Veröffentlichung der Daten bedeutet.`,
  'tip.severities.logic': `• Fehler: Die Daten widersprechen sich, sind unmöglich oder unlesbar (z. B. Breite außerhalb des Bereichs, fehlende Lizenz); vor der Veröffentlichung beheben.
• Warnung: Meist stellt sie sich als Irrtum heraus; prüfen und korrigieren oder begründen können.
• Hinweis: Information zum Abwägen; oft ist keine Änderung nötig.
Keine Befunde heißt nur, dass in den geprüften Kategorien keine Probleme gefunden wurden.`,
  'tip.notChecked.does': `Nennt, was das Werkzeug in diesem Durchlauf nicht geprüft hat.`,
  'tip.notChecked.logic': `• Die Liste wird immer angezeigt, auch wenn nichts gefunden wurde.
• Manche Einträge hängen von Ihren Angaben ab: Die Schiffsgeschwindigkeit etwa wird erst geprüft, wenn Sie das Feld für eine Fahrt ankreuzen oder eine Fahrt-Spalte zuordnen.
• Keine Befunde im Bericht sagen nichts über die Punkte dieser Liste.`,
  'tip.mapLegend.does': `Erklärt die Farben der Punkte auf der Vorschaukarte.`,
  'tip.mapLegend.logic': `• Ein Punkt hat die Farbe des schwersten Befunds seiner Zeile (Fehler, Warnung, Hinweis).
• Ein Punkt ohne Befund hat die Farbe „kein Befund zur Zeile“.
• Befunde zum ganzen Datensatz statt zu einer Zeile ändern die Farben nicht.
• Zeilen ohne Position erscheinen nicht auf der Karte.`,

  'tip.cleanCsv.does': `Speichert Ihre Daten in einem CSV-Layout: feste Spalten zuerst, dann die Variablen.`,
  'tip.cleanCsv.logic': `• Feste Spalten: Station, Fahrt, Proben-ID, Datum, Breite und Länge, Tiefe; danach jede gemessene Variable als „Name [Einheit]“. Ignorierte Spalten, die Uhrzeitspalte (ins Datum eingerechnet) und die Druckspalte werden nicht geschrieben.
• Das Datum steht im Format ISO 8601, Koordinaten in Dezimalgrad (auch wenn die Datei Grad und Minuten hatte), ein Dezimalkomma wird zum Punkt; übrige Werte werden so übernommen, wie sie in der Datei stehen, ohne Umrechnung.
• Text, der mit =, +, - oder @ beginnt, erhält ein Apostroph davor, damit eine Tabellenkalkulation ihn nicht als Formel behandelt.`,
  'tip.sidecar.does': `Hält fest, was das Werkzeug über die Spalten herausgefunden hat: Bedeutung, Einheit und woher die Einheit stammt.`,
  'tip.sidecar.logic': `• Eine Zeile pro Spalte: Name in der Datei, Name in der bereinigten CSV, Einheit, Herkunft der Einheit und P01-Code, falls bekannt.
• Sie bewahrt auch Ihre Angabe „eine Fahrt“ auf.
• Legen Sie sie bei der nächsten Prüfung mit den Dateien ab, und die Angabe wird wiederhergestellt.`,
  'tip.iso19139.does': `Schreibt einen Entwurf eines ISO-19139-Metadatensatzes zum Einlesen in GeoNetwork.`,
  'tip.iso19139.logic': `• Eingetragen wird nur, was sich aus den Daten ergibt: räumliche und zeitliche Ausdehnung, Variablen, die in den Metadaten bereits genannte Lizenz und der Titel.
• Felder, die die Daten nicht liefern können, werden nicht erfunden: Kontakt und Zitierdatum sind als fehlend markiert, Sprache und Themenkategorie fehlen.
• Es ist ein Entwurf zum Vervollständigen im Editor, kein fertiger Datensatz.`,
  'tip.datacite.does': `Schreibt einen Entwurf eines DataCite-Datensatzes (XML) für die Registrierung einer DOI.`,
  'tip.datacite.logic': `• Eingetragen wird nur, was sich aus Daten und Metadaten ergibt: Titel, Ausdehnung, Variablen, Lizenz.
• Das Publikationsjahr wird auf das laufende Jahr gesetzt (bei Bedarf ändern); Autoren, Herausgeber und die DOI werden nicht geraten und bleiben als XML-Kommentare stehen.
• Es ist ein Entwurf zum Vervollständigen, kein fertiger Datensatz.`,
  'tip.draft.does': `Liefert aus den Daten berechnete Werte, die Sie in Metadatenfelder kopieren können.`,
  'tip.draft.logic': `• Die zeitliche Ausdehnung und die vier geografischen Grenzen werden aus Ihren Daten berechnet.
• Die Variablenliste trägt Einheiten, aber nur solche, die jemand angegeben hat.
• Lizenz und Titel stammen aus den Metadaten, nicht aus den Daten.
• Die Feldnamen entsprechen den Abschnitten des GeoNetwork-Editors.`,
  'tip.geojson.does': `Speichert die Positionen der Zeilen als GeoJSON-Punkte, zum Öffnen in QGIS oder einem anderen GIS-Programm.`,
  'tip.geojson.logic': `• Ein Punkt pro Zeile mit Position; Koordinaten unverändert, als [Länge, Breite]. Zeilen mit unmöglicher Breite, die die Karte ausblendet, stehen in der Datei.
• Jeder Punkt trägt Datei, Zeile, Station, Datum und den schwersten Befund seiner Zeile.
• Eine Datei für alle Datensätze.`,

  'tip.licenceInput.does': `Benennt die Beschreibungen eines Datensatzes, die verglichen werden sollen.`,
  'tip.licenceInput.logic': `• Eine Angabe pro Zeile: eine DOI, ein Zenodo- oder PANGAEA-Link, ein Dataverse-Datensatzlink ({dataverse}) oder ein GeoNetwork-Datensatzlink.
• Gelesen werden nur die Metadaten dieser Datensätze, nie die Datendateien. Ein GBIF- oder OBIS-Link wird nicht auf Lizenzen gelesen: nehmen Sie die DOI des Datensatzes.
• Alle Zeilen sollten zu einem Datensatz gehören: mehrere Orte, an denen er beschrieben ist.`,
  'tip.licenceOneDeposit.does': `Zeigt, ob die Quellen dieselbe Lizenz nennen, und zählt die Quellen einer Hinterlegung einmal.`,
  'tip.licenceOneDeposit.logic': `• Eine Hinterlegung ist ein Datensatz im Repositorium samt seinem DataCite-Datensatz (Zenodo, PANGAEA, Dataverse): Sie beschreiben denselben Datensatz und zählen daher als eine Quelle.
• Verglichen werden die Lizenzkennungen der Quellen, nicht ihre Rechtstexte.
• Verschiedene Lizenzen in verschiedenen Quellen sind ein Widerspruch; ein leerer DataCite-Datensatz neben einer anderswo genannten Lizenz ist keiner.`,
  'tip.licenceSpdx.does': `Zeigt, wie das Werkzeug jede Lizenzangabe gelesen hat.`,
  'tip.licenceSpdx.logic': `• Text und Link jeder Angabe werden mit der SPDX-Lizenzliste verglichen.
• Das Ergebnis ist eine SPDX-Kennung oder „nicht erkannt — von Hand prüfen“.
• Das Werkzeug beurteilt nicht die rechtliche Wirkung einer Lizenz und liest keine Lizenztexte.`,
  'tip.licenceDatacite.does': `Weist darauf hin, dass der DOI-Datensatz bei DataCite keine Lizenz hat, obwohl eine andere Quelle eine nennt.`,
  'tip.licenceDatacite.logic': `• DataCite hat ein Feld Rights, es ist aber optional, daher bleiben viele Datensätze ohne Lizenz.
• Die OpenAIRE-Richtlinien für Datenarchive verlangen die Lizenz, wenn sie zutrifft.
• Das allein ist kein Widerspruch: Es hat eine eigene Zeile, die bittet, die Lizenz im DOI-Datensatz zu ergänzen.`,
  'tip.licenceAttribution.does': `Stellt eine Quellenangabe mit der Lizenz zusammen, die Sie einfügen können.`,
  'tip.licenceAttribution.logic': `• Sie entsteht nur aus dem, was die Quellen nennen: Titel, Autoren, Herausgeber, Jahr, Lizenz, Kennung.
• Widersprechen sich die Quellen oder ist die Lizenz nicht erkannt, fehlt die Lizenz, und die Seite sagt warum.
• Der Text ist immer auf Englisch, damit Sie ihn unverändert einfügen können; prüfen Sie ihn zuerst am Datensatz.`,

  'tip.collectionKind.does': `Legt fest, woher das Werkzeug die Metadaten einer ganzen Sammlung liest.`,
  'tip.collectionKind.logic': `• Eine DOI-Liste, ein DataCite-Repositorium oder DOI-Präfix, eine Zenodo-Community oder ein GeoNetwork-Katalog.
• Gelesen werden nur Metadaten, nie Datendateien.
• Das Ergebnis sind Zahlen je Problem, einige Beispiele und eine Korrekturliste als CSV-Datei; Institutionen werden nicht miteinander verglichen.`,
  'tip.collectionDois.does': `Liest die DataCite-Datensätze der aufgelisteten DOIs.`,
  'tip.collectionDois.logic': `• Ihr Browser fragt jede DOI bei DataCite ab.
• Links der Form doi.org/… und doi:… werden angenommen; eine wiederholte DOI wird einmal gelesen.
• Schreiben Sie eine DOI pro Zeile oder trennen Sie sie mit Leerzeichen.`,
  'tip.collectionDatacite.does': `Benennt ein DataCite-Repositorium: über seine Client-Kennung oder über ein DOI-Präfix.`,
  'tip.collectionDatacite.logic': `• Eine Client-Kennung umfasst die Datensätze eines Repositoriums; ein DOI-Präfix alles, was unter diesem Anfang der DOI registriert ist.
• Ihr Browser holt die Liste seitenweise von DataCite.`,
  'tip.collectionZenodo.does': `Liest die Datensätze einer Zenodo-Community, genannt wie in ihrer Adresse.`,
  'tip.collectionZenodo.logic': `• Zenodo begrenzt, wie viele Datensätze und Anfragen ein Gast abrufen darf; eine große Community dauert daher.
• Eine Community, die größer ist als die Suchgrenze, wird in Abschnitten nach Veröffentlichungsdatum gelesen.`,
  'tip.collectionCsw.does': `Liest die Datensätze eines GeoNetwork-Katalogs aus der Liste.`,
  'tip.collectionCsw.logic': `• Verfügbare Kataloge: {catalogues}.
• Die Anfragen laufen über unseren Server, der die Antwort weiterreicht und nichts behält.
• Das Metadatenformat wählen Sie daneben: ISO 19139 oder ISO 19115-3, wo der Katalog beide anbietet.`,
  'tip.collectionCross.does': `Vergleicht die Lizenzen des Katalogs mit denen bei DataCite.`,
  'tip.collectionCross.logic': `• Bei Datensätzen mit DOI fragt Ihr Browser die DOI bei DataCite ab und vergleicht die Lizenzen beider Quellen.
• Jeder solche Datensatz kostet eine weitere Anfrage, der Lauf dauert daher länger.`,
  'tip.collectionRun.does': `Zeigt, wie lange ein Lauf dauern wird, bevor Sie ihn starten, und lässt Sie mit einer Stichprobe beginnen.`,
  'tip.collectionRun.logic': `• Die Schätzung zählt Datensätze und Anfragen; bei großen Sammlungen ist die Zahl der Anfragen nur geschätzt.
• Die schnelle Stichprobe liest nur einen Teil der Sammlung und ist in den Ergebnissen als Stichprobe gekennzeichnet.
• Ein Lauf lässt sich anhalten und fortsetzen; sein Fortschritt bleibt in diesem Browser.`,

  'tip.indexCheck.does': `Prüft Datendateien oder einen Datensatz aus einem Repositorium vor der Veröffentlichung.`,
  'tip.indexCheck.logic': `• Es liest Tabellen (CSV, Excel, Darwin Core) oder einen Datensatz, der per Link oder DOI angegeben ist.
• Es prüft Koordinaten, Daten, Einheiten, Wertebereiche und die Lizenz und nennt jeden Befund in einem einfachen Satz, daneben die technischen Einzelheiten.
• Es ändert nichts an Ihren Daten: Es zeigt, was es gefunden hat, und nennt, was es nicht prüft.`,
  'tip.indexLicence.does': `Vergleicht, was verschiedene Metadatenquellen über die Lizenz eines Datensatzes angeben.`,
  'tip.indexLicence.logic': `• Es liest die Metadaten von Zenodo, PANGAEA, Dataverse, GeoNetwork und DataCite, nicht die Datendateien (ein GBIF- oder OBIS-Datensatz nur über seine DOI).
• Es ordnet jede Angabe der SPDX-Lizenzliste zu und sucht Widersprüche.
• Es stellt eine Quellenangabe mit der Lizenz zum Einfügen zusammen.`,
  'tip.indexCollection.does': `Geht die Metadaten einer ganzen Sammlung durch und sammelt Lizenzprobleme und leere Felder.`,
  'tip.indexCollection.logic': `• Es liest nur Metadaten, nie Datendateien.
• Das Ergebnis sind Zahlen je Problem, Beispiele und eine Korrekturliste als CSV-Datei.
• Es vergleicht und reiht keine Institutionen; eine schnelle Stichprobe ist als Stichprobe gekennzeichnet.`,

  'tip.convertIntro.does': `Zeigt, wofür dieser Konverter gedacht ist: ein Darwin-Core-Archiv, das aus Ihrer Tabelle entsteht. Die Seite ist noch eine verborgene Testversion.`,
  'tip.convertIntro.logic': `• Die Seite ist vorerst verborgen: Sie steht weder im Menü noch auf der Startseite, und Suchmaschinen werden gebeten, sie zu überspringen.
• Ihre Dateien werden in Ihrem Browser gelesen und als Vorschau gezeigt; nichts davon wird irgendwohin gesendet.
• Das Archiv wird in Ihrem Browser erstellt und von dort heruntergeladen; nichts wird hochgeladen und nichts gespeichert.
• Eine optionale Abfrage gibt es schon: Die Taxonnamen, die Sie abfragen möchten, gehen an WoRMS, und zwar erst, nachdem Sie deren Taste gedrückt haben; sie ist standardmäßig aus. Eine zweite, für Begriffe im NERC-Vokabular, ist noch geplant und wird genauso funktionieren.`,
  'tip.convertTaxa.does': `Bestätigt, welche der vorgeschlagenen Spalten Taxa sind.`,
  'tip.convertTaxa.logic': `• In einem breiten Blatt schlägt das Werkzeug jede Zahlenspalte ohne andere Bedeutung mit niedriger Sicherheit als Taxon vor, dessen Kopf der Name ist.
• Eine vorgeschlagene Spalte wird erst nach Ihrer Bestätigung umgewandelt; eine unbestätigte wird ausgelassen, und die Zusammenfassung nennt ihre Zahl.
• Gemessene Größen wie die Temperatur bleiben Variablen. Eine Spalte, deren Kopf mit total, sum, suma, razem, summe, gesamt, somme oder Σ beginnt oder total, suma, razem oder gesamt als eigenes Wort enthält, wird nie vorgeschlagen; Sie können sie weiterhin von Hand markieren.
• Eine Spalte, der Sie selbst die Bedeutung „Taxon (der Spaltenkopf ist der Name)“ geben, ist Ihre Entscheidung und braucht keine Bestätigung.`,
  'tip.convertDepthBound.does': `Sagt, welches Ende eines Tiefenbereichs eine Tiefenspalte ist.`,
  'tip.convertDepthBound.logic': `• Eine Probe zwischen zwei Tiefen hat eine obere Spalte (das flachere Ende) und eine untere Spalte (das tiefere Ende).
• Bei nur einer Tiefenspalte sind obere und untere Tiefe gleich.
• Eine Tiefe wird als Meter gelesen und nie umgerechnet; eine andere Einheit als Meter blockiert die Umwandlung.`,
  'tip.convertEffortValue.does': `Die Probengröße, wenn sie für alle Proben gleich ist.`,
  'tip.convertEffortValue.logic': `• Geben Sie sie mit Punkt oder Komma als Dezimalzeichen ein; beides wird angenommen, was Ihr Blatt auch verwendet, und geschrieben wird sie mit Punkt.
• Als mehrdeutig abgelehnt werden: eine Zahl mit mehr als einem Punkt oder Komma sowie eine Zahl mit einer bis drei Ziffern, einem Trennzeichen und genau drei Ziffern danach, weil es ein Tausendertrennzeichen sein könnte; schreiben Sie sie ohne eines oder mit mehr oder weniger Dezimalstellen. Eine Zahl, die mit einer Null beginnt, kann keines sein und wird angenommen.
• Abgelehnt wird auch alles, was keine Zahl über null ist, und die Umwandlung ist dann blockiert.
• Für eine andere Größe in jeder Probe markieren Sie stattdessen eine Spalte des Blatts.`,
  'tip.convertEffortUnit.does': `Die Einheit der Probengröße.`,
  'tip.convertEffortUnit.logic': `• Sie wird so geschrieben, wie Sie sie angeben, und nie umgerechnet.
• Ein Begriff für die Einheit wird nur für {units} ergänzt; jede andere Einheit erhält eine Warnung und keinen Begriff.`,
  'tip.convertEffortDimension.does': `Sagt, ob die Probengröße ein Volumen oder eine Fläche ist.`,
  'tip.convertEffortDimension.logic': `• Es wird normalerweise aus der Einheit gelesen (Kubikmeter, Liter, Quadratmeter); wählen Sie es nur, wenn die Einheit es nicht sagt.
• Ein Volumen hat den Begriff {volumeConcept}, eine Fläche {areaConcept}.`,
  'tip.role.taxon': `eine Spalte mit Taxonnamen, einer je Zeile (langes Blatt); die Zahl steht in der Mengenspalte.`,
  'tip.role.taxonHeader': `eine Spalte eines breiten Blatts, deren Kopf der Taxonname ist und deren Zellen die Mengen sind. Vorgeschlagene sind nur Kandidaten: Bestätigen Sie alle.`,
  'tip.role.quantity': `die Zahl für das Taxon in dieser Zeile (langes Blatt).`,
  'tip.role.quantityType': `eine Spalte, die sagt, was die Menge ist; sie bleibt zur Information erhalten und ersetzt Ihre Angabe nicht.`,
  'tip.role.effort': `das beprobte Volumen oder die beprobte Fläche der Probe; die Einheit gehört in das Einheitenfeld.`,
  'tip.role.occurrenceId': `Ihre eigene Kennung des Datensatzes, genau so verwendet, wie Sie sie geschrieben haben.`,
  'tip.role.lifeStage': `das Entwicklungsstadium dieses Datensatzes; es hat Vorrang vor einem im Namen gefundenen Stadium.`,
  'tip.role.qualifier': `der Bestimmungszusatz dieses Datensatzes (cf., sp., ?); er hat Vorrang vor einem im Namen gefundenen Zusatz.`,
  'tip.convertRoles.does': `Listet jede Bedeutung auf, die eine Spalte im Konverter haben kann, auch die, die es nur hier gibt.`,
  'tip.convertRoles.logic': `{roles}
• Die Bedeutungen sagen nur, wie eine Zelle gelesen wird; der Konverter ändert keinen Ihrer Werte.
• Koordinaten, Daten, Tiefe sowie Namen von Station, Fahrt und Probe werden nach denselben Regeln erkannt wie in der Datenprüfung.`,
  'tip.convertSheetUse.does': `Legt fest, ob dieses Blatt umgewandelt wird.`,
  'tip.convertSheetUse.logic': `• Ein abgewähltes Blatt wird vollständig ausgelassen: Nichts daraus wird umgewandelt, gezählt oder geprüft.
• Jedes Blatt beginnt angekreuzt.`,
  'tip.convertShape.does': `Sagt, wie das Blatt aufgebaut ist: eine Spalte je Art oder eine Zeile je Art und Probe.`,
  'tip.convertShape.logic': `• Breit: Der Kopf jeder Taxon-Spalte ist ein Taxonname, und jede gefüllte Zelle darin ist ein Datensatz dieses Taxons in der Probe der Zeile, außer ausgelassenen Nullen und NA-Zellen, die keinen ergeben.
• Lang: Jede Zeile mit Taxon und Wert ist ein Datensatz, mit denselben Ausnahmen.
• Das Werkzeug schlägt den Aufbau aus den Bedeutungen der Spalten vor; die Wahl liegt bei Ihnen.`,
  'tip.convertQuantityKind.does': `Sagt, was die Zahlen in den Artenzellen sind.`,
  'tip.convertQuantityKind.logic': `• Eine Anzahl ist eine Individuenzahl und muss ganz sein; sie wird als individualCount und als Anzahl-Messung ({countConcept}) geschrieben.
• Eine Dichte oder Biomasse wird als Messung mit Einheit geschrieben, nie als individualCount.
• Ohne diese Wahl ist die Umwandlung blockiert.
• Nichts wird umgerechnet oder skaliert.`,
  'tip.convertQuantityUnit.does': `Die Einheit, in der die Zahlen geschrieben sind.`,
  'tip.convertQuantityUnit.logic': `• Sie wird so geschrieben, wie Sie sie angeben, und nie umgerechnet.
• Ein Begriff für die Einheit wird nur für die Einheiten ergänzt, die das Werkzeug geprüft hat: {units}.
• Jede andere Einheit erhält keinen Begriff, nur eine Warnung, und der Einheitentext bleibt, wie Sie ihn schrieben.`,
  'tip.convertQuantityBasis.does': `Für eine Biomasse: Nassgewicht, Trockengewicht oder aschefreies Trockengewicht.`,
  'tip.convertQuantityBasis.logic': `• Jede Gewichtsart hat einen eigenen Begriff: {concepts}.
• Ohne sie lässt sich die Biomasse nicht beschreiben, und die Umwandlung ist blockiert.`,
  'tip.convertQuantityPer.does': `Sagt, ob sich die Zahlen auf ein Volumen oder eine Fläche beziehen.`,
  'tip.convertQuantityPer.logic': `• Es wird normalerweise aus der Einheit gelesen; wählen Sie es nur, wenn die Einheit es nicht sagt.
• Eine Dichte je Wasservolumen hat den Begriff {volumeConcept}, je Bodenfläche {areaConcept}.
• Die Einheit entscheidet das nie allein gegen Ihre Wahl.`,
  'tip.convertQuantityMedium.does': `Für Zahlen je Fläche: die Wassersäule oder der Boden.`,
  'tip.convertQuantityMedium.logic': `• Für eine Zahl je Fläche gibt es keine Voreinstellung: Sie wählen die Wassersäule oder den Boden.
• Nur eine Zahl je Bodenfläche hat einen geprüften Begriff; eine Zahl je Fläche der Wassersäule erhält keinen Begriff und eine Warnung, und er muss vor der Veröffentlichung von Hand gewählt werden.`,
  'tip.convertEffort.does': `Das beprobte Volumen oder die beprobte Fläche, wenn Sie es kennen.`,
  'tip.convertEffort.logic': `• Geben Sie einen Wert für alle Proben an oder markieren Sie eine Spalte des Blatts.
• Er wird bei jeder Probe als sampleSizeValue und sampleSizeUnit und als Messung geschrieben: {volumeConcept} für ein Volumen, {areaConcept} für eine Fläche.
• Eine Null, ein negativer oder ein fehlender Wert blockiert die Umwandlung.`,
  'tip.convertCruise.does': `Der Fahrtcode für ein Blatt ohne Fahrt-Spalte.`,
  'tip.convertCruise.logic': `• Er wird zum Fahrt-Ereignis an der Spitze des Baums.
• Die Kennung einer Station ist der Fahrtcode, ein Doppelpunkt und der Stationscode.
• Bleibt er leer, haben die Stationen keine Fahrt über sich.`,
  'tip.convertFullList.does': `Sagt, ob in jeder Probe nach jeder Art der Liste gesucht wurde.`,
  'tip.convertFullList.logic': `• Angekreuzt: Eine Null wird zur Abwesenheit (occurrenceStatus absent), mit individualCount null nur bei Anzahlen und ohne Messung.
• Nicht angekreuzt: Nullen werden ausgelassen, ihre Zahl wird als Information gezeigt.
• Eine leere Zelle oder NA ist nie ein Datensatz.
• Der Browser merkt sich das Häkchen nicht; eine mit den Daten abgelegte Begleitdatei kann es setzen.`,
  'tip.convertStationPrefix.does': `Macht Proben-Kennungen eindeutig, wenn derselbe Probencode an mehreren Stationen vorkommt.`,
  'tip.convertStationPrefix.logic': `• Aus: Die Kennung einer Probe ist Ihr Probencode.
• An: Die Kennung ist die Stations-Kennung, ein Doppelpunkt und Ihr Code.
• Eine Kennung entsteht nie aus Tiefe, Zeilenreihenfolge oder einer Abfrage von Taxonnamen.
• Die Wahl erscheint, wenn sich Codes wiederholen oder eine Begleitdatei sie angekreuzt hat.`,
  'tip.convertFlattenStation.does': `Lässt die Stationsebene im Baum weg.`,
  'tip.convertFlattenStation.logic': `• Der Stationscode bleibt als Fundort jeder Probe erhalten, und die Proben hängen direkt unter der Fahrt.
• Keine Kennung ändert sich.
• Datum, Position und Tiefe der Fahrt werden dann aus den Proben berechnet.
• Nichts wird abgeflacht, solange Sie es nicht ankreuzen.`,
  'tip.convertFlattenCruise.does': `Lässt die Fahrtebene im Baum weg.`,
  'tip.convertFlattenCruise.logic': `• Der Fahrtcode geht stattdessen in den Datensatztext, und die Stationen stehen an der Spitze des Baums.
• Die Kennung einer Station beginnt weiterhin mit dem Fahrtcode.
• Nichts wird abgeflacht, solange Sie es nicht ankreuzen.`,
  'tip.convertSplits.does': `Bestätigt, wie ein Name mit Zusatz, Stadium oder Geschlecht oder ein zweifelhafter Name aufgeteilt wird.`,
  'tip.convertSplits.logic': `• Zusätze ({qualifiers}) gehen in den Bestimmungszusatz, die Stadien ({stages}) in das Entwicklungsstadium und eine Geschlechtsangabe (f, m, fem, female, male, ♀, ♂, mit oder ohne Punkt) nach einem Komma oder direkt nach einem Stadium oder Fragezeichen in das Geschlecht. Ein f. vor einem Epitheton ist eine Forma und bleibt im Namen.
• Ein Name, in dem eine Ziffer, ein Schrägstrich, ein Fragezeichen, ein Stadienbereich, ein einzelner Buchstabe, eine Geschlechtsangabe am Ende oder mehr als drei Wörter bleiben, wird mit dem Grund gezeigt, damit Sie ihn korrigieren.
• Der genaue Text bleibt immer als verbatimIdentification erhalten. Name, Zusatz, Stadium und Geschlecht können Sie vor der Bestätigung bearbeiten.
• Eine Aufteilung ist nur ein Vorschlag, bis Sie sie bestätigen, und eine unbestätigte Aufteilung blockiert die Umwandlung. Ein einfacher Name braucht keine Entscheidung.
• Die Schaltfläche für alle gezeigten bestätigt nur Aufteilungen ohne Zweifel. Eine Aufteilung mit Zweifel bestätigen Sie in ihrer eigenen Zeile, nach dem Ändern oder mit „So bestätigen“; die Schaltfläche nennt, wie viele sie übersprungen hat.`,
  'tip.convertCodes.does': `Schlägt einmalig Probencodes vor, für ein Blatt, das keine hat.`,
  'tip.convertCodes.logic': `• Ein Code ist der Stationscode, ein Bindestrich und eine laufende Nummer, in der Reihenfolge Ihres Blatts. Würde der Stationstext einen Code ergeben, der wie eine Formel beginnt (mit = + - oder @), ist der Code stattdessen S und die Zeilennummer, damit er kein Apostroph braucht und auf der Seite und in der Datei gleich ist.
• Sie erhalten Ihr eigenes Blatt als CSV-Datei mit einer neuen Spalte zurück. Zellen werden als Text kopiert. Eine Zelle oder eine Überschrift, die mit = + - oder @ (auch in der Vollbreitform) oder mit einem Tabulator beginnt, erhält ein Apostroph, damit eine Tabellenkalkulation sie nicht ausführt; einfache Zahlen, Kennzeichen für fehlende Werte wie NA und die Zeichen + x - allein, auch mit Leerzeichen darum, bleiben unverändert. Daten einer xlsx-Datei werden als ISO-Daten geschrieben, Uhrzeiten als Stunden und Minuten.
• Prüfen Sie es und laden Sie diese Datei erneut hoch: Nur ein Code in Ihrem eigenen hochgeladenen Blatt wird zur Kennung.
• Ein Apostroph vor einem Formelzeichen ist das eigene Textkennzeichen der Tabellenkalkulation; lädt man die Datei erneut hoch, liest der Konverter '=x daher als =x. Er nimmt diesen einen Apostroph von jeder Textzelle und jeder Überschrift ab, die damit beginnt, und nur hier: Das Prüfwerkzeug liest eine Datei, wie sie ist.
• Der Konverter wendet Codes nie von selbst an und erneuert sie nie.`,
  'tip.convertMetaTitle.does': `Gibt dem Datensatz einen Namen, den Menschen lesen werden.`,
  'tip.convertMetaTitle.logic': `• Er wird zum Titel in der Beschreibung (eml.xml) und, wenn der Datensatzname leer bleibt, zum Datensatznamen in jeder Ereigniszeile.
• Schreiben Sie ihn auf Englisch: Die Beschreibung ist als englisch gekennzeichnet.
• Der Wortlaut wird nicht geprüft; ein leerer Titel blockiert den Export.`,
  'tip.convertMetaAbstract.does': `Sagt einem Leser, was die Daten sind und wie sie erhoben wurden.`,
  'tip.convertMetaAbstract.logic': `• Sie wird zur Zusammenfassung der Beschreibung. Eine Leerzeile beginnt einen neuen Absatz.
• Die OBIS-Datenpolitik verlangt eine ausführliche Beschreibung einschließlich der Erhebungsmethode; dieses Werkzeug prüft nur, dass etwas geschrieben ist.
• Eine leere Zusammenfassung blockiert den Export.`,
  'tip.convertMetaCreators.does': `Nennt die Personen oder Gruppen, die den Datensatz erstellt haben.`,
  'tip.convertMetaCreators.logic': `• Einer pro Zeile, als „Vorname Familienname“ oder „Familienname, Vorname“. Mit Komma gilt der Name wie geschrieben: Was vor dem Komma steht, ist der Familienname. Ohne Komma ist das letzte Wort der Familienname, zusammen mit kleingeschriebenen Namenspartikeln direkt davor ({particles}); „Maria de la Cruz“ hat also den Familiennamen „de la Cruz“. Auch ein Semikolon trennt zwei Namen.
• Sie werden zu den Autoren der Beschreibung und, wenn das Zitierfeld leer bleibt, zu den Autoren im Zitiertext. Ein Name, den eine Metadatendatei als Organisation kennzeichnet, und eine Zeile mit einem klaren Organisationswort ({organisationWords}) werden als Organisationsname geschrieben und nicht geteilt; das Formular zeigt unten, wie jede Zeile geschrieben wird. Ein Name nur aus Partikeln und einem Wort („de Vries“) ist ein Familienname ohne Vornamen. Das Werkzeug sucht niemanden nach.
• Mindestens einer ist nötig.`,
  'tip.convertMetaContact.does': `Sagt, an wen ein Leser zum Datensatz schreiben soll.`,
  'tip.convertMetaContact.logic': `• Name und E-Mail-Adresse werden zum Kontakt und zum Metadatenanbieter der Beschreibung. Die Adresse wird nur in die Datei geschrieben; diese Seite sendet sie nirgendwohin.
• Die Adresse muss wie eine Adresse aussehen (etwas@etwas.etwas); sie wird nicht getestet.
• Beides wird gebraucht.`,
  'tip.convertMetaInstitution.does': `Nennt die Institution, zu der die Daten gehören, mit ihrem Kürzel.`,
  'tip.convertMetaInstitution.logic': `• Es wird als institutionCode in jeder Ereigniszeile geschrieben. BioCheck meldet eine Event-Tabelle ohne ihn als Fehler.
• Verwenden Sie das Kürzel, das Ihre Institution in OBIS oder GBIF benutzt; das Werkzeug prüft es nicht.
• Es darf keinen Tabulator und keinen Zeilenumbruch enthalten.`,
  'tip.convertMetaDatasetName.does': `Benennt den Datensatz so, wie er in jeder Ereigniszeile steht.`,
  'tip.convertMetaDatasetName.logic': `• Er wird als datasetName in jeder Ereigniszeile geschrieben. Bleibt er leer, wird der Titel verwendet. BioCheck meldet eine Event-Tabelle ohne datasetName als Fehler und kann warnen, wenn er vom Titel abweicht.
• Die heruntergeladene Datei ist danach benannt.
• Er darf keinen Tabulator und keinen Zeilenumbruch enthalten.`,
  'tip.convertMetaMethods.does': `Beschreibt, wie die Daten erhoben wurden (optional).`,
  'tip.convertMetaMethods.logic': `• Sie wird zum Methodenabschnitt der Beschreibung. Eine Leerzeile beginnt einen neuen Absatz.
• Bleibt sie leer, wird kein Methodenabschnitt geschrieben. Die OBIS-Datenpolitik verlangt, dass die Methode Teil der Beschreibung ist; es lohnt sich also, sie auszufüllen.`,
  'tip.convertLicence.does': `Wählt die Lizenz, unter der der Datensatz veröffentlicht wird.`,
  'tip.convertLicence.logic': `• Angeboten werden nur {licences}: Es sind die Lizenzen, die OBIS akzeptiert (die gemeinfreie ist bevorzugt, die nichtkommerzielle am wenigsten), und die, die das GBIF-Publikationswerkzeug schreiben kann. Eine Creative-Commons-Lizenz mit ShareAlike (SA) oder NoDerivatives (ND) steht nicht auf der OBIS-Liste und wird daher nicht angeboten.
• Der Rechteinhaber entscheidet, nicht dieses Werkzeug. Es gibt keinen Standardwert, und eine nicht gewählte Lizenz blockiert den Export.
• Sie wird in die Beschreibung als Lizenzname mit Webadresse geschrieben, in der Form, die das GBIF-Publikationswerkzeug schreibt.`,
  'tip.convertBasis.does': `Sagt, welche Art von Datensatz jedes Vorkommen ist.`,
  'tip.convertBasis.logic': `• Ein Wert für den ganzen Datensatz: {bases}. Er wird als basisOfRecord bei jedem Vorkommen geschrieben, und BioCheck weist jeden anderen Wert ab.
• Eine menschliche Beobachtung wird gezählt und nichts aufbewahrt; ein konserviertes Exemplar wird in einer Sammlung aufbewahrt (das OBIS-Handbuch verlangt dann auch einen Sammlungscode und eine Katalognummer, die dieses Werkzeug nicht schreibt); eine Materialprobe ist eine physische Probe, die entnommen wurde und konserviert oder vernichtet worden sein kann.
• Es gibt keinen Standardwert: Er hängt davon ab, was mit den Proben geschah. Ein nicht gewählter Wert blockiert den Export.`,
  'tip.convertSummaryColumn.does': `Erklärt, warum eine Summenspalte als „ignorieren“ beginnt.`,
  'tip.convertSummaryColumn.logic': `• Eine Spalte, deren Kopf wie eine Summe oder ein Total klingt (Sum, Total, Suma, Razem, Summe, Gesamt, Somme, Σ), addiert andere Spalten. Umgewandelt würde sie dieselben Individuen doppelt zählen.
• Deshalb beginnt sie als ignoriert und schreibt nichts ins Archiv. Sie können ihr trotzdem eine andere Bedeutung geben; dann ist es Ihre Entscheidung.
• Nur eine Spalte, die das Werkzeug sonst als Messgröße nehmen würde, wird so geändert. Eine Spalte, die es als Standardgröße erkennt, behält ihren Vorschlag.`,
  'tip.convertAccept.does': `Lässt Sie eine Art von Warnung für diesen Export akzeptieren.`,
  'tip.convertAccept.logic': `• Eine Warnung stoppt den Export nicht, aber das Archiv enthält, was sie sagt (zum Beispiel Text in einer Artzelle, eine Spalte, die nicht geschrieben wird, oder eine fehlende Taxon-Kennung). Jede Art muss einmal akzeptiert werden, nachdem Sie sie gelesen haben.
• Ein Haken gilt, solange die Hinweise dieser Art gleich bleiben; ändert sie eine Entscheidung von Ihnen, muss er neu gesetzt werden. Tippen in der Beschreibung entfernt keinen Haken. Nichts wird gespeichert: Ein neuer Upload beginnt mit jeder Warnung unakzeptiert.
• Fehler lassen sich nicht akzeptieren: Sie blockieren den Export, bis die Ursache beseitigt ist.
• Hinweise, die nur informieren, werden gezeigt und brauchen keine Antwort.`,
  'tip.convertExport.does': `Erstellt das Darwin-Core-Archiv und lädt es herunter.`,
  'tip.convertExport.logic': `• Der Knopf funktioniert nur, wenn nichts blockiert, die Beschreibung vollständig ist und jede Art von Warnung akzeptiert wurde. Das Archiv wird in Ihrem Browser von dem Code erstellt, der es geprüft hat und vor dem Schreiben noch einmal alles prüft; blockiert etwas, wird nichts geschrieben.
• Die Zip-Datei enthält die Beschreibung (EML {eml}), die Tabellen für Ereignisse, Vorkommen und Messungen sowie meta.xml. Die Textdateien sind UTF-8, tabulatorgetrennt, ein Datensatz pro Zeile.
• Eine Position oder Tiefe aus einer einfachen Zahlenzelle wird so kopiert, wie sie steht: Ein Dezimalkomma wird zum Punkt, ein führendes Plus und führende Nullen vor dem ganzzahligen Teil entfallen, ein fehlender ganzzahliger Teil wird zur Null, ein einzelner Punkt am Ende entfällt; jede Ziffer nach dem Punkt bleibt. Eine Position in Grad und Minuten wird als Dezimalgrad mit der Genauigkeit der Quelle geschrieben, und eine Tiefenspalte, die als nach oben positiv markiert ist, wird mit umgekehrtem Vorzeichen geschrieben. Die aus den Proben errechnete Position einer Fahrt oder Station wird auf {derived} Dezimalstellen gerundet, mit abgeschnittenen Endnullen, und ihre Unsicherheit auf ganze Meter aufgerundet. Eine Anzahl wird als ganze Zahl geschrieben (ein Dezimalteil von null entfällt). Dichten, Biomassen und Probengrößen werden wie geschrieben kopiert, ein Dezimalkomma wird zum Punkt. Nichts wird umskaliert.
• Die Datei ist nach dem Datensatznamen benannt. Nichts wird hochgeladen und nichts gespeichert.`,
  'tip.convertCompanion.does': `Hält Ihre Entscheidungen zur Artenliste, zu den Probencodes und zur WoRMS-Option für den nächsten Durchgang fest.`,
  'tip.convertCompanion.logic': `• Es ist eine kleine CSV-Datei im Format der Begleitdatei des Prüfwerkzeugs, mit einer Zeile für „vollständige Artenliste“, einer für „Stationspräfix“ und einer für „WoRMS-Abfrage“, jeweils nur wenn angehakt.
• Legen Sie sie beim nächsten Mal zusammen mit Ihren Daten ab, und die Entscheidungen sind schon angehakt. Eine angehakte WoRMS-Option sendet trotzdem nichts, bis Sie ihre Abfrage-Taste drücken. Im Browser wird nichts gemerkt, diese Datei ist also das einzige Gedächtnis.
• Sie enthält keine Daten, Namen oder Werte aus Ihrem Blatt.`,
  'tip.role.taxonId': `die Kennung des Taxons dieses Datensatzes, unverändert in scientificNameID geschrieben (eine Spalte AphiaID, die ganzzahlige WoRMS-Kennung, wird als urn:lsid des Taxons geschrieben). Nur für ein Blatt mit einem Datensatz pro Zeile; diese Kennungen werden nie nachgeschlagen oder geändert, und ein Name, der in irgendeiner Zeile eine hat, bleibt bei der optionalen WoRMS-Abfrage außen vor.`,
  'tip.convertDevice.does': `Nennt das Gerät, mit dem die Proben genommen wurden.`,
  'tip.convertDevice.logic': `• Wählen Sie eines der Geräte mit geprüftem Begriff im NERC-Vokabular (benannte Netze, ein Greifer, ein Stechrohr und vier Gerätekategorien) oder geben Sie einen eigenen Namen ein. Es wird als Messung bei jedem Probenereignis geschrieben: der Name des Probenahmegeräts ({instrument}) mit dem Gerät als Wert; ein gewähltes Gerät trägt seine Vokabularadresse, ein eingegebener Name keine.
• Die Liste enthält nur Geprüftes; ein Gerät, das nicht darin steht, wird eingegeben. Nichts wird aus Ihren Spaltennamen erraten.
• Leer lassen ist erlaubt, aber BioCheck warnt dann, dass kein Probenahmegerät vorhanden ist, und diese Warnung muss akzeptiert werden.`,
  'tip.convertMesh.does': `Gibt die Maschenweite von Netz oder Sieb in Mikrometern an (optional).`,
  'tip.convertMesh.logic': `• Eine einfache Zahl größer als null, mit Punkt oder Komma. Sie wird als Messung bei jedem Probenereignis geschrieben ({meshConcept}) mit der Einheit Mikrometer ({unit}); eine andere Einheit wird hier nicht angenommen, und nichts wird umgerechnet.
• Leer bedeutet, dass nichts geschrieben wird. Ein Wert, der sich nicht als Zahl lesen lässt, blockiert den Export und sagt warum.`,
  'tip.convertTree.does': `Zeigt den Ereignisbaum, den das Archiv hätte.`,
  'tip.convertTree.logic': `• Fahrt, Station und Probe stammen aus Ihren Spalten, und der Typ wird als Text geschrieben.
• Das Datum einer Fahrt oder Station ist die Spanne ihrer Proben; ihre Position ist die Mitte des Kastens um ihre Proben, mit einer Unsicherheit, die alle abdeckt, in ganzen Metern aufgerundet; ihre Tiefe reicht von der flachsten Oberkante bis zur tiefsten Unterkante.
• Nur einige Beispiele werden gezeigt, nicht jedes Ereignis.`,
  'tip.convertMetaFiles.does': `Nennt die hinzugefügten Dateien, die den Datensatz beschreiben, statt Daten zu enthalten.`,
  'tip.convertMetaFiles.logic': `• Eine Datei ist eine Metadatendatei, wenn ihr Inhalt ein Datensatz nach ISO 19139 oder ISO 19115-3 (XML), ein DataCite-Datensatz (XML oder JSON) oder ein Zenodo-Datensatz (JSON) ist. Die Art wird am Inhalt erkannt, nicht am Namen.
• Sie wird nie als Datenblatt gelesen und nie umgewandelt.
• Gelesen wird nur, was in der Datei steht, mit denselben Lesern wie in /check. Kein Link und kein DOI wird aufgerufen und keine Anfrage gesendet; ein Datensatz, der keine hinzugefügte Datei ist, wird nicht abgerufen.`,
  'tip.convertMetaSource.does': `Erklärt, woher ein eingetragener Wert stammt.`,
  'tip.convertMetaSource.logic': `• Ein Feld wird aus Ihren Metadatendateien nur gefüllt, wenn alle Dateien, die es haben, dasselbe sagen, oder nur eine Datei es hat. Beim Vergleich werden Groß- und Kleinschreibung und Leerzeichen ignoriert.
• Unter dem Feld sehen Sie die Datei und das Feld dieser Datei, aus dem der Wert gelesen wurde. Der Hinweis verschwindet, sobald Sie den Text ändern.
• Jedes Feld bleibt bearbeitbar, und ein Feld, das Sie getippt oder für das Sie einen Wert gewählt haben, behält Ihren Text, wenn Dateien erneut gelesen werden.
• Ein Feld, das eine Metadatendatei füllen könnte, aber keine Ihrer Dateien hat, wird als fehlend markiert.`,
  'tip.convertMetaChoice.does': `Lässt Sie zwischen Werten wählen, in denen sich Ihre Metadatendateien widersprechen.`,
  'tip.convertMetaChoice.logic': `• Geben Dateien für ein Feld unterschiedliche Werte an, wird keiner eingetragen: Das Werkzeug reiht Dateiformate nicht und nimmt nicht die erste Datei. Dasselbe gilt für den Kontakt, wenn mehrere Dateien je einen nennen.
• Jeder abweichende Wert wird einmal aufgeführt, mit jeder Datei, die ihn nennt. „Diesen übernehmen“ kopiert ihn ins Feld, wo Sie ihn weiter bearbeiten können.
• Enthält das Feld schon einen Wert, der von dem abweicht, was eine Datei sagt (von Ihnen getippt oder gewählt), bleibt der Wert der Datei mit „Diesen übernehmen“ sichtbar; er ersetzt Ihren Wert nie von selbst.
• Sie können die Liste auch ignorieren und einen eigenen Wert eintippen.`,
  'tip.convertMetaCitation.does': `Legt den Zitiertext fest, den die Archivbeschreibung enthält.`,
  'tip.convertMetaCitation.logic': `• Er wird einzeilig in additionalMetadata/gbif/citation der eml.xml geschrieben.
• Aus einer Metadatendatei wird er von der Funktion gebildet, die auf der Lizenzseite die Quellenangabe schreibt: Urheber, Jahr, Titel, Herausgeber und DOI, wie die Datei sie angibt. Die DOI ist nur Text aus der Datei; nichts wird nachgeschlagen. Die Lizenz gehört nicht dazu, weil sie getrennt geschrieben wird.
• Bleibt das Feld leer, wird er aus Urhebern, Titel und Exportjahr gebildet.`,
  'tip.convertMetaCoverage.does': `Zeigt Zeit und Ort, die Ihre Metadaten für die Daten nennen.`,
  'tip.convertMetaCoverage.logic': `• Nur zur Information, damit Sie sie mit Ihren Daten vergleichen können.
• Die in der eml.xml geschriebene Abdeckung (Rechteck, Daten, Taxa) wird immer aus den Ereignissen und Vorkommen des Archivs berechnet, nie aus diesen Werten.
• Jede Datei steht in einer eigenen Zeile; die Werte werden nicht zusammengeführt.`,
  'tip.convertLicenceTaken.does': `Sagt, dass die Lizenz aus Ihren Metadaten übernommen wurde.`,
  'tip.convertLicenceTaken.logic': `• Sie wird nur eingetragen, wenn der Vergleich, den /check und die Lizenzseite verwenden, in Ihren Dateien keinen Widerspruch findet und genau eine Lizenz erkannt wird, die eine von {licences} ist.
• Andere Aussagen, die keine Lizenz sind (ein Zugangshinweis, eine Nutzungsbeschränkung), werden daneben als zusätzlicher Hinweis aufgeführt, nie als Konflikt.
• Datei und Feld, aus dem sie gelesen wurde, werden gezeigt, und Sie können sie ändern. Wählen Sie eine andere Lizenz, bittet eine Warnung um Ihre Bestätigung, dass Ihr Archiv eine andere Lizenz trägt als die in Ihren Dateien.
• Die Lizenz bestimmt der Rechteinhaber: Prüfen Sie, ob es die gemeinte ist.`,
  'tip.convertLicenceOther.does': `Erklärt, warum keine Lizenz eingetragen wurde, obwohl Ihre Metadaten eine nennen.`,
  'tip.convertLicenceOther.logic': `• OBIS akzeptiert nur {licences}. Findet der Vergleich keinen Widerspruch, Ihre Dateien nennen aber eine andere Lizenz, eine andere Version einer Lizenz, eine ShareAlike- oder NoDerivatives-Lizenz oder nur Freitext, wird sie gezeigt, aber nicht verwendet. Geben sie zwei oder mehr Lizenzen nebeneinander an (Doppellizenzierung, etwa eine Public-Domain-Lizenz und CC BY), nennen die Dateien mehrere Lizenzen, und der Rechteinhaber muss eine wählen: Nichts wird eingetragen.
• Das Werkzeug ordnet eine Lizenz nie der nächstliegenden akzeptierten zu: Eine ältere Version wird nicht zur neueren, und eine ShareAlike-Lizenz wird keine der drei.
• Aussagen, die keine Lizenz sind, werden als zusätzlicher Hinweis aufgeführt.
• Welche der drei verwendet wird, entscheidet der Rechteinhaber; Sie wählen sie unten. Die Wahl einer Lizenz, die Ihre Dateien nennen, löst keine Warnung aus; jede andere löst eine Warnung aus, die Sie akzeptieren müssen.`,
  'tip.convertLicenceContradictory.does': `Erklärt, warum keine Lizenz eingetragen wurde, wenn sich Ihre Metadaten widersprechen.`,
  'tip.convertLicenceContradictory.logic': `• Der Vergleich, den /check und die Lizenzseite verwenden, meldet einen Widerspruch: Die Dateien weichen voneinander ab, eine Aussage widerspricht sich selbst, eine Einschränkung widerspricht einer offenen Lizenz, oder ein Rechteeintrag, der keine Lizenz und kein neutraler Zugangshinweis ist, steht neben einer Lizenz im selben Datensatz. Jede Aussage wird mit Datei und Feld aufgeführt.
• Das Werkzeug wählt nicht zwischen ihnen.
• Welche Lizenz gilt, entscheidet der Rechteinhaber; Sie wählen unten eine von {licences}. Eine Warnung bittet um Ihre Bestätigung, wenn Ihre Wahl von einer Lizenz abweicht, die Ihre Dateien nennen: Nennen die Dateien zwei verschiedene Lizenzen, weicht jede Wahl ab (sie weicht von der anderen Datei ab); nennen sie eine, weicht jede andere Lizenz ab.`,
  'tip.convertLicenceMissing.does': `Erklärt, warum keine Lizenz eingetragen wurde.`,
  'tip.convertLicenceMissing.logic': `• Keine der hinzugefügten Dateien nennt eine Lizenz für die Daten.
• Nichts wird angenommen: Es gibt keine Standardlizenz.
• Der Rechteinhaber entscheidet; Sie wählen unten eine von {licences}, und eine nicht gewählte Lizenz blockiert den Export.`,
  'tip.convertMetaList.does': `Lässt Sie einen der Kontakte wählen, die eine einzelne Datei auflistet.`,
  'tip.convertMetaList.logic': `• Eine Datei, die mehrere Kontaktpersonen nennt, widerspricht sich nicht selbst: Es ist eine Liste, und das Werkzeug weiß nicht, welche es schreiben soll.
• Die ersten werden gezeigt; „Alle zeigen“ führt den Rest auf. „Diesen übernehmen“ kopiert den Kontakt (Name und, falls die Datei sie hat, die E-Mail-Adresse) in die Felder, wo Sie ihn weiter bearbeiten können.
• Nichts wird eingetragen, solange Ihre Dateien insgesamt mehr als einen Kontakt nennen. Ein Kontakt, den eine andere Datei einzeln nennt, wird ebenfalls mit seiner Datei gezeigt, sodass kein Kontakt einer Datei fehlt. Ein einziger Kontakt in allen Ihren Dateien füllt die Felder selbst.`,
  'tip.convertArchiveDesc.does': `Nennt die hinzugefügten Beschreibungsdateien eines Darwin-Core-Archivs.`,
  'tip.convertArchiveDesc.logic': `• Eine eml.xml (ein EML-Dokument) oder eine meta.xml (die Spaltenzuordnung des Archivs) wird am Inhalt erkannt, nicht am Namen.
• Sie wird nie als Datenblatt gelesen, und ihre Werte werden nicht verwendet: Die Beschreibung Ihres Datensatzes stammt aus Metadatendateien (ISO, DataCite, Zenodo) oder aus dem Formular.
• Es wird keine Anfrage gesendet; die Datei wird nur aufgeführt.`,
  'tip.convertWormsOptIn.does': `Lässt Sie die Artnamen Ihres Blatts mit WoRMS, dem Register der Meeresarten, abgleichen, um scientificNameID zu füllen. Es ist aus und sendet nichts, bis Sie die Abfrage-Taste drücken.`,
  'tip.convertWormsOptIn.logic': `• Bei jedem Hochladen aus. Eine Begleitdatei kann das Kästchen nur ankreuzen; das Ankreuzen sendet nichts.
• Die Taste sendet nur die verschiedenen wissenschaftlichen Namen, ohne Zusatz, Stadium oder Geschlecht, in Aufrufen von höchstens {batch} Namen, einer nach dem anderen.
• Ein Name, der in irgendeiner Zeile eine Taxon-Kennung aus Ihrem Blatt hat, wird nicht gesendet, und keine seiner Zeilen erhält eine WoRMS-Kennung; eine Warnung sagt das, wenn nur einige Zeilen eine haben.
• Geschrieben wird {lsid} des Eintrags, der zum Namen passt, wie Sie ihn geschrieben haben. scientificName wird nie geändert.`,
  'tip.convertWormsPrivacy.does': `Sagt genau, was Ihren Rechner verlässt, wenn Sie die Abfrage benutzen, und an wen es geht.`,
  'tip.convertWormsPrivacy.logic': `• Nur Taxonnamen werden gesendet: nichts sonst aus Ihren Dateien oder von dem, was Sie eingetippt haben.
• Sie gehen direkt von Ihrem Browser an www.marinespecies.org, den vom VLIZ betriebenen Webdienst von WoRMS. Sie laufen nicht über den Server dieser Seite.
• Der Dienst sieht Ihre IP-Adresse, wie jede Website.
• Ein Artname kann einen unveröffentlichten Befund verraten, etwa welche Arten in Ihren Daten gefunden wurden.
• Nichts wird gesendet, bevor Sie die Abfrage-Taste drücken.`,
  'tip.convertWormsTable.does': `Zeigt, was WoRMS für jeden Namen geantwortet hat, damit Sie vor dem Schreiben sehen, welche Kennung jeder Name bekäme.`,
  'tip.convertWormsTable.logic': `• Treffertyp: exakt heißt, der Name ist in WoRMS genauso geschrieben; phonetisch und nah heißen, eine ähnliche, aber andere Schreibweise; nur Gattung heißt, nur die Gattung passt.
• Status: Ein nicht akzeptierter Name ist ein Synonym, sein gültiger Name wird gezeigt.
• Lebensraum nennt die Kennzeichen marin, brackig, Süßwasser und terrestrisch, die WoRMS führt. Ein Name, der nur Süßwasser oder terrestrisch ist, erhält eine Warnung, die vor dem Export zu akzeptieren ist.
• Ein Name ohne Ergebnis erhält keine Kennung und eine Warnung, die vor dem Export zu akzeptieren ist.`,
  'tip.convertWormsChoice.does': `Hier entscheiden Sie, welches WoRMS-Ergebnis die Kennung eines Namens wird, oder dass er keine bekommt.`,
  'tip.convertWormsChoice.logic': `• Nur ein einzelnes Ergebnis mit exaktem Treffertyp wird automatisch übernommen. Sie können für es trotzdem „ohne Kennung“ wählen.
• Bei einem phonetischen, nahen oder nur auf Gattung bezogenen Ergebnis, oder wenn es mehrere Ergebnisse gibt, ist nichts vorgewählt: Sie wählen ein Ergebnis oder „ohne Kennung“, und ein offen gelassener Name blockiert den Export.
• Die Kennung des gewählten Ergebnisses wird so geschrieben, wie sie ist, auch wenn dieser Name nicht akzeptiert ist: Das OBIS-Handbuch verlangt die Kennung des in scientificName geschriebenen Namens, und OBIS löst sie zum akzeptierten Namen auf. scientificName bleibt, wie Sie es geschrieben haben.`,
};

const fr: Record<TipKey, string> = {
  'tip.aria': `Explication : {label}`,
  'tip.does': `Ce que ça fait`,
  'tip.logic': `La logique`,
  'tip.ruleLink': `Détails de la règle →`,
  'tip.roles.feeds': `utilisée par les règles`,
  'tip.encoding.label': `Encodage du texte`,

  'tip.role.ignore': `la colonne n'entre dans aucune vérification ni dans le CSV nettoyé.`,
  'tip.role.latitude': `la position nord–sud du point.`,
  'tip.role.longitude': `la position est–ouest du point.`,
  'tip.role.datetime': `la date et l'heure dans une même colonne.`,
  'tip.role.date': `la date seule, sans heure.`,
  'tip.role.time': `l'heure, associée à la date de la colonne de date ; sans colonne de date, elle n'est pas utilisée.`,
  'tip.role.depth': `la distance sous la surface ; vous indiquez à côté le sens positif et l'unité.`,
  'tip.role.pressure': `la colonne est reconnue, mais aucune vérification ni aucun fichier de sortie ne l'utilise.`,
  'tip.role.station': `le nom ou le numéro d'une station ; regroupe les lignes d'un même lieu.`,
  'tip.role.cruise': `dans le test de vitesse, sépare les campagnes et remplace la case d'une seule campagne.`,
  'tip.role.sampleId': `l'identifiant d'un échantillon ou d'une carotte ; quand des feuilles sont reliées, il tient lieu de station.`,
  'tip.role.variable': `une grandeur mesurée ; demande un nom et une unité, et l'outil ne devine jamais l'unité.`,

  'tip.dropZone.does': `Lit des fichiers de votre ordinateur pour les vérifier.`,
  'tip.dropZone.logic': `• Extensions acceptées : {formats}.
• Les fichiers XML et JSON sont lus comme des métadonnées (par exemple ISO 19139 ou DataCite), les autres comme des tableaux de données.
• Un fichier .zip est lu comme une archive Darwin Core (données OBIS ou GBIF).
• Les fichiers restent dans votre navigateur ; rien n'est envoyé.`,
  'tip.linkField.does': `Récupère une notice dans un dépôt à partir de son lien ou de son DOI, et vérifie ses métadonnées et ses fichiers de données.`,
  'tip.linkField.logic': `• Sont reconnus : Zenodo, PANGAEA, GBIF, OBIS, tout DOI (via DataCite), Dataverse ({dataverse}) et GeoNetwork ({geonetwork}).
• Les fichiers ne sont téléchargés que depuis les serveurs de la liste autorisée (voir la page Confidentialité) ; pour les autres, téléchargez le fichier vous-même et déposez-le ci-dessus.
• Limites de taille : via le serveur, un fichier issu d'un lien ne dépasse pas {maxFile} et une archive d'un serveur IPT {maxArchive} ; un fichier d'un jeu de données Dataverse au-delà de {maxFile} est ignoré.`,
  'tip.downloadMode.does': `Choisit qui télécharge les fichiers derrière un lien : votre navigateur ou notre serveur.`,
  'tip.downloadMode.logic': `• Navigateur : les fichiers vont directement du serveur de données à vous ; certains serveurs ne l'autorisent pas.
• Serveur Abyssal Claims : télécharge le fichier pour vous depuis les serveurs de la liste autorisée ({maxFile} au plus, archives IPT {maxArchive} au plus) et ne conserve rien.
• Les fichiers déposés ici ne quittent jamais votre ordinateur, quel que soit le mode.`,

  'tip.layout.does': `Montre comment l'outil a compris la structure du fichier et vous permet de la corriger.`,
  'tip.layout.logic': `• Un seul tableau : une ligne est un échantillon.
• Format long : une ligne est une mesure ; l'outil en fait une ligne par échantillon.
• Deux feuilles : les mesures sont reliées aux positions et aux dates par une colonne clé.
• Une disposition illisible n'est pas devinée : elle est signalée, et les autres tableaux sont quand même vérifiés.`,
  'tip.roles.does': `Indique à l'outil ce qu'est chaque colonne ; cela décide des vérifications qui la couvrent.`,
  'tip.roles.logic': `Une unité n'est jamais devinée : une colonne sans unité indiquée reste sans unité.
{roles}`,
  'tip.encoding.does': `Indique l'encodage de caractères avec lequel le fichier a été lu ; il décide si les lettres accentuées et les autres caractères spéciaux sortent correctement.`,
  'tip.encoding.logic': `• UTF-8 est essayé en premier (avec ou sans BOM).
• Si le fichier n'est pas de l'UTF-8 valide, l'outil devine un encodage plus ancien (windows-1250 ou ISO-8859-2) et le signale.
• Si des caractères semblent faux, enregistrez le fichier en UTF-8 et rechargez-le.`,
  'tip.singleCruise.does': `Active un test : le navire a-t-il pu naviguer entre des stations consécutives ?`,
  'tip.singleCruise.logic': `• avertissement si le navire devrait filer à plus de {extreme} des deux côtés d'une station ({extremeSrc})
• remarque au-delà de {unusual} des deux côtés d'une station ({unusualSrc})
• les stations plus proches que {minSeparation} comptent pour un seul lieu et sont ignorées
• une date sans heure compte pour l'écart le plus long possible`,

  'tip.severities.does': `Explique les trois niveaux de constats du rapport et ce que chacun signifie avant de publier les données.`,
  'tip.severities.logic': `• Erreur : les données sont contradictoires, impossibles ou illisibles (par exemple une latitude hors limites, ou pas de licence) ; à corriger avant publication.
• Avertissement : cela se révèle le plus souvent être une erreur ; vérifiez et corrigez, ou soyez prêt à l'expliquer.
• Remarque : une information à examiner ; souvent aucun changement n'est nécessaire.
Aucun constat signifie seulement qu'aucun problème n'a été trouvé dans les catégories vérifiées.`,
  'tip.notChecked.does': `Énumère ce que l'outil n'a pas vérifié lors de cette exécution.`,
  'tip.notChecked.logic': `• La liste est toujours affichée, même quand rien n'a été trouvé.
• Certaines entrées dépendent de vos choix : la vitesse du navire, par exemple, n'est vérifiée que si vous cochez la case d'une seule campagne ou indiquez une colonne de campagne.
• L'absence de constats dans le rapport ne dit rien des points de cette liste.`,
  'tip.mapLegend.does': `Explique les couleurs des points de la carte d'aperçu.`,
  'tip.mapLegend.logic': `• Un point prend la couleur du constat le plus grave de sa ligne (erreur, avertissement, remarque).
• Un point sans constat a la couleur « aucun constat sur la ligne ».
• Les constats portant sur tout le jeu de données plutôt que sur une ligne ne changent pas les couleurs.
• Les lignes sans position ne figurent pas sur la carte.`,

  'tip.cleanCsv.does': `Enregistre vos données dans une seule disposition CSV : colonnes fixes d'abord, puis les variables.`,
  'tip.cleanCsv.logic': `• Colonnes fixes : station, campagne, identifiant d'échantillon, date, latitude et longitude, profondeur ; puis chaque variable mesurée sous la forme « nom [unité] ». Les colonnes ignorées, la colonne d'heure (fusionnée dans la date) et la colonne de pression ne sont pas écrites.
• La date est écrite en ISO 8601, les coordonnées en degrés décimaux (même si le fichier avait des degrés et minutes), et une virgule décimale devient un point ; les autres valeurs sont recopiées telles qu'elles sont écrites dans le fichier, sans conversion.
• Un texte commençant par =, +, - ou @ reçoit une apostrophe devant, pour qu'un tableur ne le traite pas comme une formule.`,
  'tip.sidecar.does': `Consigne ce que l'outil a établi sur les colonnes : leur sens, leur unité et l'origine de l'unité.`,
  'tip.sidecar.logic': `• Une ligne par colonne : le nom dans le fichier, le nom dans le CSV nettoyé, l'unité, l'origine de l'unité et le code P01 s'il est connu.
• Il conserve aussi votre déclaration d'une seule campagne.
• Déposez-le avec les fichiers à la vérification suivante et la déclaration est rétablie.`,
  'tip.iso19139.does': `Écrit un brouillon de notice de métadonnées ISO 19139 à charger dans GeoNetwork.`,
  'tip.iso19139.logic': `• Il ne remplit que ce qui découle des données : l'étendue géographique et temporelle, les variables, la licence déjà indiquée dans les métadonnées et le titre.
• Les champs que les données ne peuvent pas fournir ne sont pas inventés : le contact et la date de citation sont marqués comme manquants, la langue et la catégorie thématique sont omises.
• C'est un brouillon à compléter dans l'éditeur, pas une notice terminée.`,
  'tip.datacite.does': `Écrit un brouillon de notice DataCite (XML) pour l'enregistrement d'un DOI.`,
  'tip.datacite.logic': `• Il ne remplit que ce qui découle des données et des métadonnées : titre, étendue, variables, licence.
• L'année de publication est fixée à l'année en cours (à modifier si besoin) ; les auteurs, l'éditeur et le DOI ne sont pas devinés et restent sous forme de commentaires XML.
• C'est un brouillon à compléter, pas une notice terminée.`,
  'tip.draft.does': `Donne des valeurs calculées à partir des données, que vous pouvez copier dans des champs de métadonnées.`,
  'tip.draft.logic': `• L'étendue temporelle et les quatre limites géographiques sont calculées à partir de vos données.
• La liste des variables porte des unités, mais seulement celles que quelqu'un a indiquées.
• La licence et le titre viennent des métadonnées, pas des données.
• Les noms des champs correspondent aux sections de l'éditeur GeoNetwork.`,
  'tip.geojson.does': `Enregistre les positions des lignes sous forme de points GeoJSON, à ouvrir dans QGIS ou un autre logiciel SIG.`,
  'tip.geojson.logic': `• Un point par ligne qui a une position ; coordonnées inchangées, sous la forme [longitude, latitude]. Les lignes à latitude impossible, que la carte masque, figurent dans le fichier.
• Chaque point porte son fichier, sa ligne, sa station, sa date et le constat le plus grave de sa ligne.
• Un seul fichier pour tous les jeux de données.`,

  'tip.licenceInput.does': `Désigne les descriptions d'un même jeu de données à comparer.`,
  'tip.licenceInput.logic': `• Une référence par ligne : un DOI, un lien Zenodo ou PANGAEA, un lien de jeu de données Dataverse ({dataverse}) ou un lien de notice GeoNetwork.
• Seules les métadonnées de ces notices sont lues, jamais les fichiers de données. Un lien GBIF ou OBIS n'est pas lu pour les licences : utilisez le DOI du jeu de données.
• Toutes les lignes doivent concerner un seul jeu de données : plusieurs endroits où il est décrit.`,
  'tip.licenceOneDeposit.does': `Montre si les sources indiquent la même licence, et compte une seule fois les sources d'un même dépôt.`,
  'tip.licenceOneDeposit.logic': `• Un dépôt, c'est une notice d'un dépôt de données avec sa notice DataCite (Zenodo, PANGAEA, Dataverse) : elles décrivent le même jeu de données et comptent donc pour une seule source.
• Ce qui est comparé, ce sont les identifiants de licence indiqués par les sources, pas leurs textes juridiques.
• Des licences différentes dans des sources différentes sont une contradiction ; une notice DataCite vide à côté d'une licence indiquée ailleurs n'en est pas une.`,
  'tip.licenceSpdx.does': `Montre comment l'outil a lu chaque mention de licence.`,
  'tip.licenceSpdx.logic': `• Le texte et le lien de chaque mention sont comparés à la liste de licences SPDX.
• Le résultat est un identifiant SPDX, ou « non reconnue — à vérifier à la main ».
• L'outil ne juge pas l'effet juridique d'une licence et ne lit pas les textes de licence.`,
  'tip.licenceDatacite.does': `Signale que la notice du DOI chez DataCite n'a pas de licence, alors qu'une autre source en indique une.`,
  'tip.licenceDatacite.logic': `• DataCite a un champ Rights, mais il est facultatif, si bien que beaucoup de notices restent sans licence.
• Les lignes directrices d'OpenAIRE pour les archives de données demandent la licence quand elle s'applique.
• Cela ne constitue pas à soi seul une contradiction : la ligne a sa propre remarque, qui demande d'ajouter la licence à la notice du DOI.`,
  'tip.licenceAttribution.does': `Compose un texte d'attribution avec la licence, que vous pouvez coller.`,
  'tip.licenceAttribution.logic': `• Il est construit uniquement à partir de ce que disent les sources : titre, auteurs, éditeur, année, licence, identifiant.
• Quand les sources se contredisent ou que la licence n'est pas reconnue, la licence est omise et la page dit pourquoi.
• Le texte est toujours en anglais, pour que vous puissiez le coller tel quel ; comparez-le d'abord à la notice.`,

  'tip.collectionKind.does': `Choisit d'où l'outil lit les métadonnées d'une collection entière.`,
  'tip.collectionKind.logic': `• Une liste de DOI, un dépôt ou un préfixe DOI de DataCite, une communauté Zenodo ou un catalogue GeoNetwork.
• Seules les métadonnées sont lues, jamais les fichiers de données.
• Le résultat : des comptes par problème, quelques exemples de chacun et une liste de corrections en fichier CSV ; les institutions ne sont pas comparées entre elles.`,
  'tip.collectionDois.does': `Lit les notices DataCite des DOI que vous énumérez.`,
  'tip.collectionDois.logic': `• Votre navigateur interroge DataCite pour chaque DOI.
• Les liens de la forme doi.org/… et doi:… sont acceptés ; un DOI répété n'est lu qu'une fois.
• Mettez un DOI par ligne, ou séparez-les par des espaces.`,
  'tip.collectionDatacite.does': `Désigne un dépôt DataCite : par son identifiant client ou par un préfixe DOI.`,
  'tip.collectionDatacite.logic': `• Un identifiant client couvre les notices d'un dépôt ; un préfixe DOI couvre tout ce qui est enregistré sous ce début de DOI.
• Votre navigateur demande la liste à DataCite page par page.`,
  'tip.collectionZenodo.does': `Lit les notices d'une communauté Zenodo, désignée comme dans son adresse.`,
  'tip.collectionZenodo.logic': `• Zenodo limite le nombre de notices et de requêtes qu'un invité peut lire, donc une grande communauté prend du temps.
• Une communauté plus grande que la limite de recherche est lue par tranches, découpées selon la date de publication.`,
  'tip.collectionCsw.does': `Lit les notices d'un catalogue GeoNetwork de la liste.`,
  'tip.collectionCsw.logic': `• Catalogues disponibles : {catalogues}.
• Les requêtes passent par notre serveur, qui transmet la réponse et ne garde rien.
• Vous choisissez le format de métadonnées à côté : ISO 19139 ou ISO 19115-3, quand le catalogue propose les deux.`,
  'tip.collectionCross.does': `Compare les licences du catalogue avec celles de DataCite.`,
  'tip.collectionCross.logic': `• Pour les notices qui indiquent un DOI, votre navigateur interroge DataCite pour ce DOI et compare les licences des deux sources.
• Chaque notice de ce type coûte une requête de plus, donc l'exécution dure plus longtemps.`,
  'tip.collectionRun.does': `Montre combien de temps durera une exécution avant que vous la lanciez, et permet de commencer par un échantillon.`,
  'tip.collectionRun.logic': `• L'estimation compte les notices et les requêtes ; pour les grandes collections, le nombre de requêtes n'est qu'une approximation.
• L'échantillon rapide ne lit qu'une partie de la collection et est signalé comme échantillon dans les résultats.
• Une exécution peut être interrompue puis reprise ; sa progression reste dans ce navigateur.`,

  'tip.indexCheck.does': `Vérifie des fichiers de données, ou une notice d'un dépôt, avant leur publication.`,
  'tip.indexCheck.logic': `• Il lit des tableaux (CSV, Excel, Darwin Core) ou une notice donnée par un lien ou un DOI.
• Il vérifie les coordonnées, les dates, les unités, les plages de valeurs et la licence, et énonce chaque constat en une phrase simple, avec le détail technique à côté.
• Il ne modifie rien dans vos données : il montre ce qu'il a trouvé et énumère ce qu'il ne vérifie pas.`,
  'tip.indexLicence.does': `Compare ce que différentes sources de métadonnées indiquent sur la licence d'un jeu de données.`,
  'tip.indexLicence.logic': `• Il lit les métadonnées de Zenodo, PANGAEA, Dataverse, GeoNetwork et DataCite, pas les fichiers de données (un jeu GBIF ou OBIS seulement par son DOI).
• Il classe chaque mention selon la liste de licences SPDX et cherche les contradictions.
• Il compose un texte d'attribution avec la licence, à coller.`,
  'tip.indexCollection.does': `Parcourt les métadonnées d'une collection entière et rassemble les problèmes de licence et les champs vides.`,
  'tip.indexCollection.logic': `• Il ne lit que des métadonnées, jamais des fichiers de données.
• Le résultat : des comptes par problème, des exemples et une liste de corrections en fichier CSV.
• Il ne compare ni ne classe les institutions ; un échantillon rapide est signalé comme échantillon.`,

  'tip.convertIntro.does': `Montre à quoi sert ce convertisseur : une archive Darwin Core construite à partir de votre tableur. La page est encore une version de test masquée.`,
  'tip.convertIntro.logic': `• La page est masquée pour l'instant : elle ne figure ni dans le menu ni sur la page d'accueil, et les moteurs de recherche sont priés de l'ignorer.
• Vos fichiers sont lus et prévisualisés dans votre navigateur ; rien d'eux n'est envoyé nulle part.
• L'archive est construite dans votre navigateur et téléchargée depuis lui ; rien n'est envoyé vers un serveur et rien n'est enregistré.
• Une recherche facultative existe déjà : les noms de taxons que vous choisissez de rechercher vont à WoRMS, et seulement après avoir appuyé sur son bouton ; elle est désactivée par défaut. Une seconde, pour les termes du vocabulaire NERC, est encore prévue et fonctionnera de la même façon.`,
  'tip.convertTaxa.does': `Confirme lesquelles des colonnes proposées sont des taxons.`,
  'tip.convertTaxa.logic': `• Dans une feuille large, l'outil propose comme taxon dont l'en-tête est le nom chaque colonne numérique sans autre sens, avec une faible confiance.
• Une colonne proposée n'est convertie qu'après votre confirmation ; une colonne non confirmée est écartée et le résumé en donne le nombre.
• Les grandeurs mesurées comme la température restent des variables. Une colonne dont l'en-tête commence par total, sum, suma, razem, summe, gesamt, somme ou Σ, ou contient total, suma, razem ou gesamt comme mot séparé, n'est jamais proposée ; vous pouvez toujours la marquer à la main.
• Une colonne à laquelle vous donnez vous-même le sens « taxon (l'en-tête est le nom) » est votre décision et n'a pas besoin de confirmation.`,
  'tip.convertDepthBound.does': `Dit quelle extrémité d'une plage de profondeur une colonne de profondeur représente.`,
  'tip.convertDepthBound.logic': `• Un échantillon pris entre deux profondeurs a une colonne du haut (l'extrémité la moins profonde) et une colonne du bas (la plus profonde).
• Avec une seule colonne de profondeur, la profondeur du haut et celle du bas sont identiques.
• Une profondeur est lue en mètres et n'est jamais convertie ; une unité autre que le mètre bloque la conversion.`,
  'tip.convertEffortValue.does': `La taille d'échantillon, quand elle est la même pour tous les échantillons.`,
  'tip.convertEffortValue.logic': `• Saisissez-la avec un point ou une virgule comme séparateur décimal ; les deux sont acceptés, quel que soit l'usage de votre feuille, et elle est écrite avec un point.
• Refusés comme ambigus : un nombre avec plus d'un point ou d'une virgule, et un nombre de un à trois chiffres, un séparateur et exactement trois chiffres après lui, car il pourrait s'agir d'un séparateur de milliers ; écrivez-le sans séparateur, ou avec plus ou moins de décimales. Un nombre qui commence par un zéro ne peut pas en être un et est accepté.
• Tout ce qui n'est pas un nombre supérieur à zéro est refusé aussi, et la conversion est alors bloquée.
• Pour une taille différente dans chaque échantillon, marquez plutôt une colonne de la feuille.`,
  'tip.convertEffortUnit.does': `L'unité de la taille d'échantillon.`,
  'tip.convertEffortUnit.logic': `• Elle est écrite telle que vous la donnez et n'est jamais convertie.
• Un concept pour l'unité n'est ajouté que pour {units} ; toute autre unité reçoit un avertissement et pas de concept.`,
  'tip.convertEffortDimension.does': `Dit si la taille d'échantillon est un volume ou une surface.`,
  'tip.convertEffortDimension.logic': `• Il est normalement lu dans l'unité (mètres cubes, litres, mètres carrés) ; ne le choisissez que si l'unité ne le dit pas.
• Un volume a le concept {volumeConcept}, une surface {areaConcept}.`,
  'tip.role.taxon': `une colonne de noms de taxons, un par ligne (feuille longue) ; le nombre est dans la colonne de quantité.`,
  'tip.role.taxonHeader': `une colonne d'une feuille large dont l'en-tête est le nom du taxon et dont les cellules sont les quantités. Celles proposées ne sont que des candidates : confirmez-les toutes.`,
  'tip.role.quantity': `le nombre pour le taxon de cette ligne (feuille longue).`,
  'tip.role.quantityType': `une colonne qui dit ce qu'est la quantité ; elle est gardée pour information et ne remplace pas votre déclaration.`,
  'tip.role.effort': `le volume ou la surface prélevé pour cet échantillon ; son unité se saisit dans la case d'unité.`,
  'tip.role.occurrenceId': `votre propre identifiant de l'enregistrement, utilisé exactement tel que vous l'avez écrit.`,
  'tip.role.lifeStage': `le stade de développement de cet enregistrement ; il l'emporte sur un stade trouvé dans le nom.`,
  'tip.role.qualifier': `la mention d'identification de cet enregistrement (cf., sp., ?) ; elle l'emporte sur une mention trouvée dans le nom.`,
  'tip.convertRoles.does': `Énumère chaque sens qu'une colonne peut avoir dans le convertisseur, y compris ceux qui n'existent qu'ici.`,
  'tip.convertRoles.logic': `{roles}
• Les sens disent seulement comment lire une cellule ; le convertisseur ne modifie aucune de vos valeurs.
• Coordonnées, dates, profondeur et noms de station, de campagne et d'échantillon sont reconnus par les mêmes règles que dans le contrôle des données.`,
  'tip.convertSheetUse.does': `Choisit si cette feuille est convertie.`,
  'tip.convertSheetUse.logic': `• Une feuille décochée est entièrement écartée : rien n'en est converti, compté ni contrôlé.
• Chaque feuille commence cochée.`,
  'tip.convertShape.does': `Dit comment la feuille est disposée : une colonne par espèce, ou une ligne par espèce et échantillon.`,
  'tip.convertShape.logic': `• Large : l'en-tête de chaque colonne de taxon est un nom de taxon, et chaque cellule remplie de cette colonne est un enregistrement de ce taxon dans l'échantillon de la ligne, sauf les zéros ignorés et les cellules NA, qui n'en font aucun.
• Long : chaque ligne avec un taxon et une valeur est un enregistrement, avec les mêmes exceptions.
• L'outil suggère la disposition d'après le sens des colonnes ; le choix vous appartient.`,
  'tip.convertQuantityKind.does': `Dit ce que sont les nombres des cellules d'espèces.`,
  'tip.convertQuantityKind.logic': `• Un effectif est un nombre d'individus et doit être entier ; il est écrit comme individualCount et comme mesure d'effectif ({countConcept}).
• Une densité ou une biomasse est écrite comme mesure avec son unité, jamais comme individualCount.
• Sans ce choix, la conversion est bloquée.
• Rien n'est converti ni remis à l'échelle.`,
  'tip.convertQuantityUnit.does': `L'unité dans laquelle les nombres sont écrits.`,
  'tip.convertQuantityUnit.logic': `• Elle est écrite telle que vous la donnez et n'est jamais convertie.
• Un concept pour l'unité n'est ajouté que pour les unités que l'outil a vérifiées : {units}.
• Toute autre unité n'a pas de concept, seulement un avertissement, et le texte de l'unité reste tel que vous l'avez écrit.`,
  'tip.convertQuantityBasis.does': `Pour une biomasse : masse humide, masse sèche ou masse sèche sans cendres.`,
  'tip.convertQuantityBasis.logic': `• Chaque type de masse a son propre concept : {concepts}.
• Sans lui, la biomasse ne peut pas être décrite et la conversion est bloquée.`,
  'tip.convertQuantityPer.does': `Dit si les nombres se rapportent à un volume ou à une surface.`,
  'tip.convertQuantityPer.logic': `• Il est normalement lu dans l'unité ; ne le choisissez que si l'unité ne le dit pas.
• Une densité par volume d'eau a le concept {volumeConcept}, par surface du fond {areaConcept}.
• L'unité ne tranche jamais seule contre votre choix.`,
  'tip.convertQuantityMedium.does': `Pour des nombres par surface : la colonne d'eau ou le fond.`,
  'tip.convertQuantityMedium.logic': `• Pour un nombre par surface il n'y a pas de valeur par défaut : vous choisissez la colonne d'eau ou le fond.
• Seul un nombre par surface du fond a un concept vérifié ; un nombre par surface de la colonne d'eau n'a pas de concept, seulement un avertissement, et il faut en choisir un à la main avant la publication.`,
  'tip.convertEffort.does': `Le volume ou la surface prélevé, si vous le connaissez.`,
  'tip.convertEffort.logic': `• Donnez une valeur pour tous les échantillons, ou marquez une colonne de la feuille.
• Elle est écrite pour chaque échantillon comme sampleSizeValue et sampleSizeUnit, et comme mesure : {volumeConcept} pour un volume, {areaConcept} pour une surface.
• Un zéro, une valeur négative ou manquante bloque la conversion.`,
  'tip.convertCruise.does': `Le code de la campagne, pour une feuille sans colonne de campagne.`,
  'tip.convertCruise.logic': `• Il devient l'événement de campagne au sommet de l'arbre.
• L'identifiant d'une station est le code de campagne, deux-points et le code de station.
• Laissé vide, les stations n'ont pas de campagne au-dessus d'elles.`,
  'tip.convertFullList.does': `Dit si chaque espèce de la liste a été recherchée dans chaque échantillon.`,
  'tip.convertFullList.logic': `• Cochée : un zéro devient une absence (occurrenceStatus absent), avec un individualCount de zéro seulement pour les effectifs et sans mesure.
• Non cochée : les zéros sont ignorés et leur nombre est donné à titre d'information.
• Une cellule vide ou NA n'est jamais un enregistrement.
• Le navigateur ne retient pas la case ; un fichier d'accompagnement déposé avec les données peut la cocher.`,
  'tip.convertStationPrefix.does': `Rend uniques les identifiants d'échantillon lorsque le même code est utilisé à plusieurs stations.`,
  'tip.convertStationPrefix.logic': `• Désactivé : l'identifiant d'un échantillon est votre code d'échantillon.
• Activé : l'identifiant est l'identifiant de la station, deux-points et votre code.
• Un identifiant n'est jamais fabriqué à partir de la profondeur, de l'ordre des lignes ni d'une recherche de nom de taxon.
• Le choix apparaît quand des codes se répètent ou quand un fichier d'accompagnement l'a coché.`,
  'tip.convertFlattenStation.does': `Retire le niveau station de l'arbre.`,
  'tip.convertFlattenStation.logic': `• Le code de station est gardé comme localité de chaque échantillon, et les échantillons dépendent directement de la campagne.
• Aucun identifiant ne change.
• La date, la position et la profondeur de la campagne sont alors calculées à partir des échantillons.
• Rien n'est aplati sans que vous le cochiez.`,
  'tip.convertFlattenCruise.does': `Retire le niveau campagne de l'arbre.`,
  'tip.convertFlattenCruise.logic': `• Le code de campagne passe plutôt au texte du jeu de données, et les stations sont au sommet de l'arbre.
• L'identifiant d'une station commence toujours par le code de campagne.
• Rien n'est aplati sans que vous le cochiez.`,
  'tip.convertSplits.does': `Valide la façon dont un nom avec mention, stade ou sexe, ou un nom douteux, est divisé.`,
  'tip.convertSplits.logic': `• Les mentions ({qualifiers}) vont dans la mention d'identification, les stades ({stages}) dans le stade de développement, et une indication de sexe (f, m, fem, female, male, ♀, ♂, avec ou sans point) après une virgule, ou juste après un stade ou un point d'interrogation, dans le sexe. Un f. devant un épithète est une forma et reste dans le nom.
• Un nom qui garde un chiffre, une barre oblique, un point d'interrogation, une plage de stades, une lettre isolée, une indication de sexe à la fin ou plus de trois mots est montré avec la raison, pour que vous le corrigiez.
• Le texte exact est toujours gardé comme verbatimIdentification. Vous pouvez modifier le nom, la mention, le stade et le sexe avant de valider.
• Une division n'est qu'une proposition tant que vous ne l'avez pas validée, et une division non validée bloque la conversion. Un nom simple ne demande aucune décision.
• Le bouton pour tous ceux affichés ne valide que les divisions sans doute. Une division douteuse se valide sur sa propre ligne, après correction ou avec « Valider tel quel » ; le bouton indique combien il en a ignoré.`,
  'tip.convertCodes.does': `Propose une seule fois des codes d'échantillon, pour une feuille qui n'en a pas.`,
  'tip.convertCodes.logic': `• Un code est le code de station, un trait d'union et un numéro d'ordre, dans l'ordre de votre feuille. Si le texte de la station donnait un code qui commence comme une formule (par = + - ou @), le code est à la place S et le numéro de la ligne, pour qu'il n'ait pas besoin d'apostrophe et soit le même sur la page et dans le fichier.
• Vous recevez votre propre feuille en fichier CSV avec une nouvelle colonne. Les cellules sont copiées comme texte. Une cellule ou un en-tête qui commence par = + - ou @ (aussi en forme pleine chasse) ou par une tabulation reçoit une apostrophe pour qu'un tableur ne l'exécute pas ; les nombres simples, les marques de donnée manquante comme NA et les signes + x - seuls, espaces autour compris, restent tels quels. Les dates d'un fichier xlsx sont écrites en dates ISO et les heures en heures et minutes.
• Vérifiez-la et rechargez ce fichier : seul un code de votre propre feuille chargée devient un identifiant.
• Une apostrophe devant un caractère de formule est l'échappement de texte propre au tableur : quand vous rechargez le fichier, le convertisseur lit donc '=x comme =x. Il retire cette seule apostrophe de chaque cellule de texte et de chaque en-tête qui commence par une, et seulement ici : le vérificateur lit un fichier tel quel.
• Le convertisseur n'applique ni ne renouvelle jamais les codes de lui-même.`,
  'tip.convertMetaTitle.does': `Donne au jeu de données un nom que les gens liront.`,
  'tip.convertMetaTitle.logic': `• Il devient le titre de la description (eml.xml) et, si le nom du jeu reste vide, le nom du jeu dans chaque ligne d'événement.
• Écrivez-le en anglais : la description est marquée comme anglaise.
• La formulation n'est pas vérifiée ; un titre vide bloque l'export.`,
  'tip.convertMetaAbstract.does': `Dit au lecteur ce que sont les données et comment elles ont été recueillies.`,
  'tip.convertMetaAbstract.logic': `• Il devient le résumé de la description. Une ligne vide commence un nouveau paragraphe.
• La politique de données d'OBIS demande une description détaillée, méthode de collecte comprise ; cet outil vérifie seulement que quelque chose est écrit.
• Un résumé vide bloque l'export.`,
  'tip.convertMetaCreators.does': `Liste les personnes ou groupes qui ont produit le jeu de données.`,
  'tip.convertMetaCreators.logic': `• Un par ligne, sous la forme « Prénom Nom » ou « Nom, Prénom ». Avec une virgule, le nom est pris tel qu'il est écrit : ce qui précède la virgule est le nom de famille. Sans virgule, le dernier mot est le nom de famille, avec les particules en minuscules juste avant lui ({particles}) ; « Maria de la Cruz » a donc pour nom de famille « de la Cruz ». Un point-virgule sépare aussi deux noms.
• Ils deviennent les auteurs de la description et, quand le champ de citation reste vide, les auteurs du texte de citation. Un nom qu'un fichier de métadonnées marque comme organisation, et une ligne avec un mot d'organisation clair ({organisationWords}), sont écrits comme nom d'organisation et ne sont pas coupés ; le formulaire montre en dessous comment chaque ligne sera écrite. Un nom fait seulement de particules et d'un mot (« de Vries ») est un nom de famille sans prénom. L'outil ne cherche personne.
• Il en faut au moins un.`,
  'tip.convertMetaContact.does': `Dit à qui le lecteur doit écrire au sujet du jeu de données.`,
  'tip.convertMetaContact.logic': `• Le nom et l'adresse e-mail deviennent le contact et le fournisseur des métadonnées de la description. L'adresse est seulement écrite dans le fichier ; cette page ne l'envoie nulle part.
• L'adresse doit ressembler à une adresse (quelquechose@quelquechose.quelquechose) ; elle n'est pas testée.
• Les deux sont nécessaires.`,
  'tip.convertMetaInstitution.does': `Nomme l'institution à laquelle appartiennent les données, par son code court.`,
  'tip.convertMetaInstitution.logic': `• Il est écrit comme institutionCode dans chaque ligne d'événement. BioCheck signale comme erreur une table Event qui n'en a pas.
• Utilisez le code court que votre institution emploie dans OBIS ou GBIF ; l'outil ne le vérifie pas.
• Il ne doit contenir ni tabulation ni saut de ligne.`,
  'tip.convertMetaDatasetName.does': `Nomme le jeu de données tel qu'il apparaît dans chaque ligne d'événement.`,
  'tip.convertMetaDatasetName.logic': `• Il est écrit comme datasetName dans chaque ligne d'événement. Laissé vide, le titre est utilisé. BioCheck signale comme erreur une table Event sans datasetName et peut avertir quand il diffère du titre.
• Le fichier téléchargé porte ce nom.
• Il ne doit contenir ni tabulation ni saut de ligne.`,
  'tip.convertMetaMethods.does': `Décrit comment les données ont été recueillies (facultatif).`,
  'tip.convertMetaMethods.logic': `• Elle devient la section méthodes de la description. Une ligne vide commence un nouveau paragraphe.
• Laissée vide, aucune section méthodes n'est écrite. La politique de données d'OBIS demande que la méthode fasse partie de la description : mieux vaut la remplir.`,
  'tip.convertLicence.does': `Choisit la licence sous laquelle le jeu de données est publié.`,
  'tip.convertLicence.logic': `• Seules {licences} sont proposées : ce sont les licences qu'OBIS accepte (celle du domaine public est préférée, la non commerciale la moins préférée) et celles que l'outil de publication de GBIF sait écrire. Une licence Creative Commons avec ShareAlike (SA) ou NoDerivatives (ND) ne figure pas sur la liste d'OBIS : elle n'est donc pas proposée.
• Le titulaire des droits décide, pas cet outil. Il n'y a pas de valeur par défaut, et une licence non choisie bloque l'export.
• Elle est écrite dans la description comme le nom de la licence avec son adresse web, sous la forme qu'écrit l'outil de publication de GBIF.`,
  'tip.convertBasis.does': `Dit de quel type d'enregistrement relève chaque occurrence.`,
  'tip.convertBasis.logic': `• Une valeur pour tout le jeu : {bases}. Elle est écrite comme basisOfRecord sur chaque occurrence, et BioCheck rejette toute autre valeur.
• Une observation humaine est comptée et rien n'est conservé ; un spécimen conservé est gardé dans une collection (le manuel d'OBIS demande alors aussi un code de collection et un numéro de catalogue, que cet outil n'écrit pas) ; un échantillon de matériel est un échantillon physique qui a été prélevé et a pu être conservé ou détruit.
• Il n'y a pas de valeur par défaut : elle dépend de ce qu'on a fait des échantillons. Une valeur non choisie bloque l'export.`,
  'tip.convertSummaryColumn.does': `Explique pourquoi une colonne de totaux commence en « ignorer ».`,
  'tip.convertSummaryColumn.logic': `• Une colonne dont l'en-tête ressemble à un total ou à une somme (Sum, Total, Suma, Razem, Summe, Gesamt, Somme, Σ) additionne d'autres colonnes. Convertie, elle compterait deux fois les mêmes individus.
• Elle commence donc ignorée et n'écrit rien dans l'archive. Vous pouvez quand même lui donner un autre sens ; c'est alors votre décision.
• Seule une colonne que l'outil prendrait sinon pour une grandeur mesurée est changée ainsi. Une colonne qu'il reconnaît comme grandeur standard garde sa proposition.`,
  'tip.convertAccept.does': `Vous permet d'accepter un type d'avertissement pour cet export.`,
  'tip.convertAccept.logic': `• Un avertissement n'arrête pas l'export, mais l'archive contiendra ce qu'il dit (par exemple du texte dans une cellule d'espèce, une colonne qui n'est pas écrite ou un identifiant de taxon manquant). Chaque type doit être accepté une fois, après lecture.
• Une coche reste tant que les constats de ce type ne changent pas ; si une de vos décisions les change, il faut la remettre. Saisir dans la description n'en décoche aucune. Rien n'est enregistré : un nouveau dépôt commence avec chaque avertissement non accepté.
• Les erreurs ne s'acceptent pas : elles bloquent l'export jusqu'à ce que la cause soit supprimée.
• Les constats qui informent seulement sont affichés et n'appellent aucune réponse.`,
  'tip.convertExport.does': `Construit l'archive Darwin Core et la télécharge.`,
  'tip.convertExport.logic': `• Le bouton ne fonctionne que si rien ne bloque, si la description est complète et si chaque type d'avertissement est accepté. L'archive est construite dans votre navigateur par le code qui l'a vérifiée et qui revérifie tout avant d'écrire quoi que ce soit ; si quelque chose bloque, rien n'est écrit.
• Le zip contient la description (EML {eml}), les tables d'événements, d'occurrences et de mesures et meta.xml. Les fichiers texte sont en UTF-8, séparés par des tabulations, un enregistrement par ligne.
• Une position ou une profondeur issue d'une seule cellule numérique simple est copiée telle qu'écrite : une virgule décimale devient un point, un plus initial et les zéros avant la partie entière sont supprimés, une partie entière absente devient un zéro, un point final isolé est supprimé ; chaque chiffre après le point est conservé. Une position en degrés et minutes est écrite en degrés décimaux avec la précision de la source, et une colonne de profondeur marquée positive vers le haut est écrite avec son signe inversé. La position d'une campagne ou d'une station calculée à partir de ses échantillons est arrondie à {derived} décimales, zéros finaux supprimés, et son incertitude au mètre entier supérieur. Un effectif est écrit comme un nombre entier (une partie décimale nulle est supprimée). Les densités, biomasses et tailles d'échantillon sont copiées telles qu'écrites, la virgule décimale devenant un point. Rien n'est mis à l'échelle.
• Le fichier porte le nom du jeu de données. Rien n'est envoyé et rien n'est enregistré.`,
  'tip.convertCompanion.does': `Garde vos choix sur la liste d'espèces, les codes d'échantillon et l'option WoRMS pour la prochaine fois.`,
  'tip.convertCompanion.logic': `• C'est un petit fichier CSV au format du fichier compagnon du vérificateur, avec une ligne « liste d'espèces complète », une ligne « préfixe de station » et une ligne « recherche WoRMS », chacune seulement si elle est cochée.
• Déposez-le la fois suivante avec vos données et les choix démarrent cochés. Une option WoRMS cochée n'envoie toujours rien tant que vous n'appuyez pas sur son bouton de recherche. Rien n'est retenu dans le navigateur : ce fichier est donc la seule mémoire.
• Il ne contient ni données, ni noms, ni valeurs de votre feuille.`,
  'tip.role.taxonId': `l'identifiant du taxon de cet enregistrement, écrit tel quel dans scientificNameID (une colonne AphiaID, l'identifiant numérique de WoRMS, est écrite comme l'urn:lsid du taxon). Seulement pour une feuille à un enregistrement par ligne ; ces identifiants ne sont jamais recherchés ni modifiés, et un nom qui en a un sur une ligne quelconque est écarté de la recherche WoRMS facultative.`,
  'tip.convertDevice.does': `Nomme l'engin avec lequel les échantillons ont été pris.`,
  'tip.convertDevice.logic': `• Choisissez l'un des engins qui ont un concept vérifié dans le vocabulaire NERC (filets nommés, une benne, un carottier et quatre catégories d'engins), ou saisissez votre propre nom. Il est écrit comme une mesure sur chaque événement d'échantillon : le nom de l'instrument d'échantillonnage ({instrument}) avec l'engin comme valeur ; un engin choisi porte son adresse de vocabulaire, un nom saisi n'en porte pas.
• La liste ne contient que ce qui a été vérifié ; un engin qui n'y figure pas se saisit. Rien n'est deviné d'après vos noms de colonnes.
• Le laisser vide est permis, mais BioCheck avertit alors qu'aucun instrument d'échantillonnage n'est présent, et cet avertissement doit être accepté.`,
  'tip.convertMesh.does': `Donne la taille de maille du filet ou du tamis, en micromètres (facultatif).`,
  'tip.convertMesh.logic': `• Un nombre simple supérieur à zéro, avec un point ou une virgule. Il est écrit comme une mesure sur chaque événement d'échantillon ({meshConcept}) avec l'unité micromètres ({unit}) ; aucune autre unité n'est acceptée ici et rien n'est converti.
• Vide, rien n'est écrit. Une valeur qui ne peut pas être lue comme un nombre bloque l'export et dit pourquoi.`,
  'tip.convertTree.does': `Montre l'arbre des événements que l'archive aurait.`,
  'tip.convertTree.logic': `• Campagne, station et échantillon viennent de vos colonnes, et le type est écrit en texte.
• La date d'une campagne ou d'une station est l'intervalle de ses échantillons ; sa position est le milieu du cadre autour de ses échantillons, avec une incertitude qui les couvre tous, en mètres entiers arrondis au supérieur ; sa profondeur va du haut le moins profond au bas le plus profond.
• Seuls quelques exemples sont montrés, pas chaque événement.`,
  'tip.convertMetaFiles.does': `Liste les fichiers ajoutés qui décrivent le jeu de données au lieu de contenir des données.`,
  'tip.convertMetaFiles.logic': `• Un fichier est un fichier de métadonnées quand son contenu est une fiche ISO 19139 ou ISO 19115-3 (XML), une fiche DataCite (XML ou JSON) ou une fiche Zenodo (JSON). Le type est reconnu d'après le contenu, pas d'après le nom.
• Il n'est jamais lu comme une feuille de données et jamais converti.
• Seul ce qui est dans le fichier est lu, par les mêmes lecteurs que /check. Aucun lien ni DOI n'est suivi et aucune requête n'est envoyée ; une fiche qui n'est pas un fichier ajouté n'est pas récupérée.`,
  'tip.convertMetaSource.does': `Explique d'où vient une valeur saisie.`,
  'tip.convertMetaSource.logic': `• Un champ n'est rempli à partir de vos fichiers de métadonnées que si tous les fichiers qui l'ont disent la même chose, ou si un seul fichier l'a. La comparaison ignore les majuscules et les espaces.
• Sous le champ, vous voyez le fichier et le champ de ce fichier d'où la valeur a été lue. La note disparaît dès que vous modifiez le texte.
• Chaque champ reste modifiable, et un champ que vous avez saisi ou pour lequel vous avez choisi une valeur garde votre texte quand les fichiers sont relus.
• Un champ qu'un fichier de métadonnées pourrait remplir, mais qu'aucun des vôtres n'a, est marqué comme manquant.`,
  'tip.convertMetaChoice.does': `Vous laisse choisir entre des valeurs sur lesquelles vos fichiers de métadonnées divergent.`,
  'tip.convertMetaChoice.logic': `• Quand des fichiers donnent des valeurs différentes pour un champ, aucune n'est saisie : l'outil ne classe pas les formats de fichier et ne prend pas le premier fichier. Il en va de même pour le contact quand plusieurs fichiers en nomment chacun un.
• Chaque valeur différente est listée une fois, avec chaque fichier qui la donne. « Utiliser celle-ci » la copie dans le champ, où vous pouvez encore la modifier.
• Quand le champ contient déjà une valeur différente de ce que dit un fichier (saisie ou choisie par vous), la valeur du fichier reste visible avec « Utiliser celle-ci » ; elle ne remplace jamais votre valeur d'elle-même.
• Vous pouvez aussi ignorer la liste et saisir votre propre valeur.`,
  'tip.convertMetaCitation.does': `Fixe le texte de citation contenu dans la description de l'archive.`,
  'tip.convertMetaCitation.logic': `• Il est écrit sur une seule ligne dans additionalMetadata/gbif/citation de l'eml.xml.
• À partir d'un fichier de métadonnées, il est construit par la fonction qui écrit la ligne d'attribution de la page des licences : auteurs, année, titre, éditeur et DOI tels que le fichier les donne. Le DOI n'est que du texte tiré du fichier ; rien n'est recherché. La licence n'en fait pas partie, car elle est écrite à part.
• Si le champ reste vide, il est construit à partir des auteurs, du titre et de l'année de l'export.`,
  'tip.convertMetaCoverage.does': `Montre le temps et le lieu que vos métadonnées donnent pour les données.`,
  'tip.convertMetaCoverage.logic': `• À titre indicatif seulement, pour que vous puissiez les comparer à vos données.
• La couverture écrite dans l'eml.xml (rectangle, dates, taxons) est toujours calculée à partir des événements et des occurrences de l'archive, jamais à partir de ces valeurs.
• Chaque fichier a sa propre ligne ; les valeurs ne sont pas fusionnées.`,
  'tip.convertLicenceTaken.does': `Dit que la licence a été reprise de vos métadonnées.`,
  'tip.convertLicenceTaken.logic': `• Elle n'est saisie que si la comparaison qu'utilisent /check et la page des licences ne trouve aucune contradiction dans vos fichiers et qu'exactement une licence est reconnue, et que celle-ci est l'une de {licences}.
• Les autres déclarations qui ne sont pas une licence (une note d'accès, une limitation d'usage) sont listées à côté comme note supplémentaire, jamais comme un conflit.
• Le fichier et le champ d'où elle a été lue sont indiqués, et vous pouvez la modifier. Si vous choisissez une autre licence, un avertissement demande d'accepter que votre archive porte une licence différente de celle de vos fichiers.
• Le détenteur des droits décide de la licence : vérifiez que c'est la bonne.`,
  'tip.convertLicenceOther.does': `Explique pourquoi aucune licence n'a été saisie alors que vos métadonnées en indiquent une.`,
  'tip.convertLicenceOther.logic': `• OBIS n'accepte que {licences}. Quand la comparaison ne trouve aucune contradiction mais que vos fichiers nomment une autre licence, une autre version d'une licence, une licence ShareAlike ou NoDerivatives, ou seulement du texte libre, elle est montrée mais pas utilisée. Quand ils donnent deux licences ou plus côte à côte (double licence, par exemple une licence du domaine public et CC BY), les fichiers donnent plusieurs licences et le détenteur des droits doit en choisir une : rien n'est saisi.
• L'outil ne ramène jamais une licence à la plus proche des licences acceptées : une version plus ancienne ne devient pas une plus récente, et une licence ShareAlike ne devient aucune des trois.
• Les déclarations qui ne sont pas une licence sont listées comme note supplémentaire.
• Le détenteur des droits décide laquelle des trois utiliser ; vous la choisissez ci-dessous. Choisir l'une des licences que nomment vos fichiers ne déclenche aucun avertissement ; toute autre déclenche un avertissement à accepter.`,
  'tip.convertLicenceContradictory.does': `Explique pourquoi aucune licence n'a été saisie quand vos métadonnées se contredisent.`,
  'tip.convertLicenceContradictory.logic': `• La comparaison qu'utilisent /check et la page des licences signale une contradiction : les fichiers divergent, une déclaration se contredit elle-même, une restriction contredit une licence ouverte, ou une entrée de droits qui n'est ni une licence ni une note d'accès neutre se trouve à côté d'une licence dans la même fiche. Chaque déclaration est listée avec son fichier et son champ.
• L'outil ne choisit pas entre elles.
• Le détenteur des droits décide quelle licence s'applique ; vous choisissez ci-dessous l'une de {licences}. Un avertissement demande d'accepter votre choix quand il diffère d'une licence que nomment vos fichiers : quand les fichiers nomment deux licences différentes, tout choix diffère (il s'écarte de l'autre fichier) ; quand ils en nomment une, toute autre licence diffère.`,
  'tip.convertLicenceMissing.does': `Explique pourquoi aucune licence n'a été saisie.`,
  'tip.convertLicenceMissing.logic': `• Aucun des fichiers ajoutés n'indique de licence pour les données.
• Rien n'est supposé : il n'y a pas de licence par défaut.
• Le détenteur des droits décide ; vous choisissez ci-dessous l'une de {licences}, et une licence non choisie bloque l'export.`,
  'tip.convertMetaList.does': `Vous laisse choisir l'un des contacts qu'un seul fichier liste.`,
  'tip.convertMetaList.logic': `• Un fichier qui nomme plusieurs personnes de contact ne se contredit pas : c'est une liste, et l'outil ne sait pas laquelle écrire.
• Les premiers sont montrés ; « Tout afficher » liste le reste. « Utiliser celle-ci » copie le contact (nom et, si le fichier l'a, l'adresse e-mail) dans les champs, où vous pouvez encore le modifier.
• Rien n'est saisi tant que vos fichiers nomment plus d'un contact au total. Un contact qu'un autre fichier nomme seul est montré aussi, avec son fichier, si bien qu'aucun contact d'aucun fichier n'est omis. Un seul contact dans tous vos fichiers remplit les champs de lui-même.`,
  'tip.convertArchiveDesc.does': `Liste les fichiers de description d'une archive Darwin Core que vous avez ajoutés.`,
  'tip.convertArchiveDesc.logic': `• Un eml.xml (un document EML) ou un meta.xml (la correspondance des colonnes de l'archive) est reconnu d'après son contenu, pas d'après son nom.
• Il n'est jamais lu comme une feuille de données et ses valeurs ne sont pas utilisées : la description de votre jeu de données vient des fichiers de métadonnées (ISO, DataCite, Zenodo) ou du formulaire.
• Aucune requête n'est envoyée ; le fichier est seulement listé.`,
  'tip.convertWormsOptIn.does': `Vous permet de faire correspondre les noms d'espèces de votre feuille à WoRMS, le registre des espèces marines, pour remplir scientificNameID. C'est désactivé et rien n'est envoyé tant que vous n'appuyez pas sur le bouton de recherche.`,
  'tip.convertWormsOptIn.logic': `• Désactivé à chaque dépôt. Un fichier compagnon peut seulement cocher la case ; cocher n'envoie rien.
• Le bouton envoie uniquement les noms scientifiques distincts, sans mention, stade ni sexe, par appels d'au plus {batch} noms, l'un après l'autre.
• Un nom qui a un identifiant de taxon venant de votre feuille sur une ligne quelconque n'est pas envoyé, et aucune de ses lignes ne reçoit d'identifiant WoRMS ; un avertissement le dit quand seules certaines lignes en ont un.
• L'identifiant écrit est {lsid} de l'entrée qui correspond au nom tel que vous l'avez écrit. scientificName n'est jamais modifié.`,
  'tip.convertWormsPrivacy.does': `Dit exactement ce qui quitte votre ordinateur si vous utilisez la recherche, et à qui cela va.`,
  'tip.convertWormsPrivacy.logic': `• Seuls les noms de taxons sont envoyés : rien d'autre de vos fichiers ni de ce que vous avez saisi.
• Ils vont directement de votre navigateur à www.marinespecies.org, le service web de WoRMS exploité par le VLIZ. Ils ne passent pas par le serveur de ce site.
• Le service voit votre adresse IP, comme tout site web.
• Un nom d'espèce peut révéler un résultat non publié, par exemple quelles espèces figurent dans vos données.
• Rien n'est envoyé tant que vous n'appuyez pas sur le bouton de recherche.`,
  'tip.convertWormsTable.does': `Montre ce que WoRMS a répondu pour chaque nom, afin que vous voyiez, avant toute écriture, quel identifiant chaque nom recevrait.`,
  'tip.convertWormsTable.logic': `• Type de correspondance : exacte veut dire que le nom s'écrit pareil dans WoRMS ; phonétique et proche veulent dire une graphie voisine mais différente ; genre seulement veut dire que seul le genre correspond.
• Statut : un nom non accepté est un synonyme, et son nom valide est montré.
• Habitat énumère les indicateurs marin, saumâtre, eau douce et terrestre que détient WoRMS. Un nom seulement d'eau douce ou terrestre reçoit un avertissement à accepter avant l'export.
• Un nom sans résultat ne reçoit aucun identifiant et un avertissement à accepter avant l'export.`,
  'tip.convertWormsChoice.does': `C'est ici que vous décidez quel résultat de WoRMS devient l'identifiant d'un nom, ou qu'il n'en reçoit aucun.`,
  'tip.convertWormsChoice.logic': `• Seul un résultat unique de type de correspondance exacte est retenu automatiquement. Vous pouvez quand même choisir « sans identifiant » pour lui.
• Pour un résultat phonétique, proche ou limité au genre, ou lorsqu'il y a plusieurs résultats, rien n'est présélectionné : vous choisissez un résultat ou « sans identifiant », et un nom laissé sans décision bloque l'export.
• L'identifiant du résultat choisi est écrit tel quel, même si ce nom n'est pas accepté : le manuel d'OBIS demande l'identifiant du nom tel qu'écrit dans scientificName, et OBIS le résout vers le nom accepté. scientificName reste tel que vous l'avez écrit.`,
};

export const TIP_TEXTS: Record<'en' | 'pl' | 'de' | 'fr', Record<TipKey, string>> = { en, pl, de, fr };
export { en as tipEn, pl as tipPl, de as tipDe, fr as tipFr };

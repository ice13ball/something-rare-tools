# The applications

What each application of Abyssal Claims Tools is for, how it works step by step, and what logic
it applies. Written for a data manager or developer who wants to understand the tool well enough
to trust it, or to contribute to it.

Every behavioural statement below was taken from the code (or its tests); each section ends with
the files and functions it comes from, so you can check it. Where a number matters it is named
by its constant, or you are sent to [`docs/rules.md`](rules.md) (generated from the rule
definitions; it is the only place the thresholds and their citations are listed, and this file
never copies its table). The rule texts themselves are in four languages (pl, en, de, fr) in
`src/core/rules/`.

## Contents

1. [Overview](#1-overview)
2. [What leaves your browser](#2-what-leaves-your-browser)
3. [Shared building blocks](#3-shared-building-blocks)
   - [3.1 Reading files](#31-reading-files)
   - [3.2 Reading values: numbers, dates, coordinates](#32-reading-values-numbers-dates-coordinates)
   - [3.3 Recognising columns](#33-recognising-columns)
   - [3.4 Recognising the layout](#34-recognising-the-layout)
   - [3.5 Rules, findings and severities](#35-rules-findings-and-severities)
   - [3.6 Public records: how a link becomes files](#36-public-records-how-a-link-becomes-files)
4. [`/` Home](#4--home)
5. [`/check` Data check](#5-check-data-check)
6. [`/licence` Licence check](#6-licence-licence-check)
7. [`/collection` Collection review](#7-collection-collection-review)
8. [`/convert` Darwin Core converter](#8-convert-darwin-core-converter)
9. [`/privacy` Privacy](#9-privacy-privacy)
10. [The server](#10-the-server)
11. [The workers](#11-the-workers)
12. [Where in the code](#12-where-in-the-code)
13. [Rule families](#13-rule-families)
14. [Known limitations](#14-known-limitations)
15. [Keeping this document current](#15-keeping-this-document-current)

---

## 1. Overview

### The pages

Six HTML entry points are built by Vite (`vite.config.ts`, `rollupOptions.input`): `index.html`,
`check/`, `licence/`, `collection/`, `convert/`, `privacy/`. Each has an entry in
`src/app/entries/` that renders one page component from `src/app/pages/`.

| Path | Page | What it is for |
|---|---|---|
| `/` | `IndexPage` | A tile per tool, linking to the four tools. |
| `/check` | `CheckPage` | The data checker: files or a public record in, a cited, two-layer report out. |
| `/licence` | `LicencePage` | What the metadata sources of one dataset say about its licence, and where they disagree. |
| `/collection` | `CollectionPage` | The licence and metadata rules over a whole repository, with counts and a CSV fix list. |
| `/convert` | `ConvertPage` | A biologist's spreadsheet to a Darwin Core Archive (Event, Occurrence, eMoF, EML) for OBIS. |
| `/privacy` | `PrivacyPage` | What is sent where; the lists of hosts are rendered from the same configuration the code uses. |

**Status.** All six are public. The four tools are linked in the header menu on every page
(`NAV_TOOLS` in `src/app/components/Layout.tsx`) and as tiles on `/`; `/privacy` is linked in the
footer. All six are in `/sitemap.xml` (`buildSitemap` in `server/index.ts`). The robots meta tag
and `X-Robots-Tag: noindex` are added only while `SITE.noindex` in `config/site.ts` is true; it
is currently `false`. The fetch proxy and CSW routes (`/api/*`) are always `noindex`
(`server/headers.ts`, `securityHeaders`). No page is built but hidden.

### How a file flows

```
  your computer                                          (nothing below this line
  ───────────────                                         leaves the browser, except
                                                          the cases of section 2)
  drop files ──► main thread (React page)
                   │  reads bytes with File.arrayBuffer()
                   │  link / DOI ──► resolveInput ──► record loaders ──► downloads
                   │                                   (browser fetch, or POST /api/fetch)
                   ▼
              Web Worker (src/worker/*.worker.ts)  ── one session per page
                   │  parse   : bytes ──► ParsedFile (sheets of raw cells)
                   │  propose : columns + layout recognised, user confirms
                   │  build   : confirmed mapping ──► Dataset (typed rows)
                   │  check   : rules over datasets and records ──► Report
                   ▼
              core (src/core)  — pure TypeScript, no I/O, shared by all pages
                   │
                   ▼
              main thread: report, map, downloads (Blob URLs made in the browser)
```

`/convert` has its own worker and handler (`convert.worker.ts`, `convert.handler.ts`) that reads
files with the same parsers but does not share state with the checker's worker. `/collection` has
a third one (`collection.worker.ts`) that runs a long, pausable job and keeps its progress in the
browser's IndexedDB.

### The core in one paragraph

`src/core` has no network and no DOM code (the few exceptions are named in section 2): `parse/`
turns bytes into sheets of raw cells; `values/` reads numbers, dates and coordinates;
`recognize/` proposes what each column is and how the sheets fit together; `dataset.ts` applies a
confirmed mapping and builds typed rows; `checks/` runs the rules; `rules/` holds the rule
definitions (id, severity, wording in four languages, thresholds and citations); `licence/` and
`metadata/` read and compare licence statements; `sources/` turns a pasted link into a record and
its files; `output/` writes the clean CSV, GeoJSON and metadata drafts; `convert/` is the
converter; `collection/` is the repository-wide run; `geo/` holds the land mask; `i18n/` the
interface texts.

### Language

Interface and rule texts exist in Polish, German, French and English (`src/core/i18n/ui.ts`,
`tips-text.ts`; types in `LANGS`, `src/core/types.ts`). The page picks the language from, in
order, a `?lang=` parameter on arrival (it is then removed from the address), the `lang` entry of
`localStorage`, the browser's languages, and English (`src/app/i18n.ts`, `initLang`,
`detectLang`).

---

## 2. What leaves your browser

**Dropped files are never uploaded.** This was checked against every `fetch`, `XMLHttpRequest`,
`sendBeacon`, `WebSocket` and `EventSource` in `src/`: there is no code path that posts the
content of a dropped file anywhere. That is **not** the same as "nothing derived from them leaves
the browser". Everything that can leave it is listed in the table below, with its host. In short, these are the cases:
(a) **taxon names** to WoRMS (`www.marinespecies.org`) when you press the lookup button on `/convert` (`lookupWormsNames`);
(b) **a word you type** to NVS (`vocab.nerc.ac.uk`) in an NVS search on `/convert` (`searchNvs`);
(c) **the map area of the positions**, as tile requests to CARTO (`basemaps.cartocdn.com` and its tile hosts), together with your IP address,
automatically after a `/check` report that has positions (`MapPreview`, `fitBounds`); if CARTO does not answer, the map is drawn from a land file served by this site (a request to this site only);
(d) **after you accept the analytics banner, GA4 events with numbers derived from your files**, sent to the Google hosts `www.googletagmanager.com`,
`www.google-analytics.com`, `region1.google-analytics.com`, `analytics.google.com`, `region1.analytics.google.com` and `stats.g.doubleclick.net`
(`GA_HOSTS`, `config/hosts.ts`). The event parameters are the 13 that `track()` in `src/app/analytics.ts` lets through: `input_type`, `mode`, `shape`, `profile`,
`meta_source`, `worms`, `nvs` (enumerated words or flags) and the counts `n_errors`, `n_warnings`, `n_info`, `n_events`, `n_occurrences`, `n_measurements`;
(e) **a link or DOI you paste** on `/check` or `/licence`: in browser mode (the default) it goes to the host of the record (the allowlisted data hosts, `DATA_HOSTS`: the three hosts
`opendap.iopan.pl`, `geo.iopan.pl` and `geonetwork.iopan.pl`, Zenodo, PANGAEA, DataCite, the Dataverse installations and the GBIF/OBIS registries and IPT servers; the full list and the CSW catalogues are on `/privacy`); in **server mode** (`POST /api/fetch`) it goes to this site's server, which fetches the record for you; and
(f) **what `/collection` asks for**: a DOI batch, a DataCite client or prefix and a Zenodo community name go to DataCite and Zenodo from your browser, and a catalogue id with the request parameters goes to this site's server through `POST /api/csw`.
Taxon names and search words can reveal unpublished findings (the privacy page says so). A test fails when a module of
the converter other than the two opt-in files calls `fetch` (`test/convert/no-network.test.ts`).

| What | Where it goes | When | What it carries |
|---|---|---|---|
| **A link, DOI or id you paste** (`/check`, `/licence`) | **Browser mode (default):** your browser fetches the public record and its files directly from an allowlisted host. **Server mode (you choose it):** `POST /api/fetch` to this site's server, which fetches for you. | Only when you submit a link. | The URL of the record or file. In server mode the URL travels in a JSON body, never in a query string (`serverFetcher`, `src/core/sources/fetcher.ts`). The server's application log keeps only host name, status and byte count (`logHost`, `server/index.ts`). |
| **Collection review** (`/collection`) | DataCite (`api.datacite.org`) and Zenodo (`zenodo.org`) are asked **by your browser directly**. CSW catalogues are asked **through `POST /api/csw`** on this site's server. | While a run is going. | A DOI batch, a DataCite client or prefix, a Zenodo community name; for a catalogue only a catalogue id from a closed list plus the operation, start position, page size and schema name; the server builds the catalogue request itself (`server/csw.ts`, `parseCswBody`). |
| **Check a record's data files** (button on a `/collection` example) | Same as a link in browser mode. | Only when you press it. Browser mode only. | A DOI. |
| **WoRMS lookup** (`/convert`, opt-in) | `www.marinespecies.org`, directly from your browser, **not** through the server. | Only when you tick the box **and** press the lookup button. A companion file can tick the box; ticking sends nothing. | Taxon names only (the scientific name after the approved split), at most 50 per call (`WORMS_BATCH_MAX`) (`src/app/optins/worms.ts`). |
| **NVS search** (`/convert`, opt-in) | `vocab.nerc.ac.uk`, directly from your browser, not through the server. | Only when you tick the box, type a word for a column and press that column's search button. | Only the word you typed (or, as a fallback when the search fails and the text is exactly a concept code, that code) (`src/app/optins/nvs.ts`). No cookie, no storage, no Referer (`referrerPolicy: 'no-referrer'`), `credentials: 'omit'` on both lookups; the browser's CORS `Origin` header (the site's address) is still sent. |
| **GBIF / OBIS datasets** (`/check` by link or DOI; `/licence` only for a DOI that DataCite routes to GBIF) | The registry (`api.gbif.org` or `api.obis.org`) is asked for the archive's address; the archive is then downloaded from one of the IPT hosts in `config/ipt.ts`, never from any other host a registry may name. | Only when you paste such a link or DOI. | The dataset identifier; then a download URL. |
| **Map preview** (`/check`, after a check) | The base map is loaded from CARTO (`basemaps.cartocdn.com` and its tile hosts, `MAP_HOSTS` in `config/hosts.ts`), **automatically** as soon as the report has at least one position (`MapPreview`). There is no opt-in. When CARTO fails (a style or tile error, or no answer in 10 s, `BASEMAP_TIMEOUT_MS`), for example with no internet, the map is rebuilt on a bundled Natural Earth land file of your own site (`src/app/assets/land-fallback.geojson`, 341 231 B, 77 892 B gzip; a GET from `/assets/…`, fetched only then, no new host). | After every check with positions. | The map library requests style, tiles, glyphs and sprites; the tile addresses reveal the map area shown, not the points (the points are drawn locally). CARTO also sees your IP address. |
| **Land mask** | Your own site (`/assets/…`): a bundled file (`src/core/geo/land-mask.bin`). | Prefetched when the proposed mapping has a latitude and a longitude column. | Nothing: a GET of a static file (`browserLandLoader`, `src/worker/handler.ts`). |
| **Google Analytics 4** | `www.googletagmanager.com` (script) and the Google Analytics hosts. | **Only after you accept the cookie banner.** Until then consent defaults are all `denied` (`public/consent-default.js`) and no analytics script is loaded; the HTML pages carry no `gtag.js` and no `gtag('config')`, and
`consent-default.js` only calls `gtag('consent', 'default')` (`activate`, `src/app/analytics.ts`). | Page view with `page_location` set explicitly to origin plus path (no query, no hash). Events, from `track()`: `check_started`, `check_finished`, `convert_started`, `convert_blocked`, `convert_exported`, with only these custom parameters: `input_type` (file, zenodo, geonetwork, doi, pangaea, mixed), `mode` (browser, server), counts of errors, warnings and notes, and for `convert_exported` also `shape` (wide, long, mixed), `profile`, `meta_source`, `worms`, `nvs` (each a yes/no flag as `used`/`none`/`file`) and counts of events, occurrences and measurement rows. `track()` drops anything that is not an allowed enum string or a finite number, so file names, DOIs, links, taxon names and values cannot be sent. `/licence`, `/collection`, `/` and `/privacy` send no events of their own (only the page view). Declining removes the Google cookies of an earlier acceptance. **Caveat:** "only these parameters" holds for the `track()` events. The page view carries the fields `gtag.js` adds on its own (page title, referrer, screen and language, a client id), and any enhanced-measurement events enabled in the GA4 property (for example outbound clicks with the link address) are outside the code's control. |

**Stored in your browser, never on the server:**

- the consent decision: one cookie, `ac_consent` (`granted` or `denied`), shared with the Atlas
  site on the parent domain (`SITE.consentCookie`);
- the language choice (`localStorage` key `lang`);
- a collection run's progress and fix-list parts (IndexedDB; see 7). Nothing else the visitor
  provides is stored, and nothing the visitor provides is written to the address bar: there is no
  router, a pasted link or DOI never goes into the URL (stated in the comments of `CheckPage` and
  `LicencePage`), and the one call to `history.replaceState` only removes a `?lang=` parameter on
  arrival (`src/app/i18n.ts`).

**What the server sees.** Every request to this site is logged by the hosting platform (see the
privacy text on `/privacy`). The application itself logs one JSON line per proxied request:
`{ host, status, bytes }`, with the host written only if it is on the allowlist
(`logHost`). The server holds per-IP counters in memory for rate limiting and daily budgets
(section 10).

**What the page may connect to is enforced, not just promised.** The Content-Security-Policy is
built per page path (`buildCsp`, `config/hosts.ts`; applied by `securityHeaders`,
`server/headers.ts`): `/convert` gets a `connect-src` of `'self'`, the analytics hosts, and its
two lookup hosts (`PAGE_CONNECT_HOSTS`), and **none of the data hosts or map hosts** (it takes no
links and shows no map); every other page gets the data hosts, the analytics hosts and the map
hosts. Fonts are served from this site (`/fonts`).

---

## 3. Shared building blocks

`/check`, `/convert` and (for licence and metadata) `/collection` and `/licence` share these
modules. The converter reads cells exactly as the checker does and adds roles on top
(`test/convert/check-unchanged.test.ts` guards that the checker is unchanged by it).

### 3.1 Reading files

`parseFile(fileName, bytes)` in `src/core/parse/index.ts` decides what a file is **from its
content, not its extension**: a renamed file is read for what it is.

1. Magic bytes first: `PK\x03\x04` is a workbook (`parseXlsx`, SheetJS), `D0CF11E0` is a legacy
   `.xls` (also SheetJS), `%PDF` is recorded as a PDF with no sheets.
2. Then a text sniff on the decoded text: a PANGAEA header block (`/* DATA DESCRIPTION:`) is a
   PANGAEA textfile; XML that is an ISO 19139 or 19115-3 record, or a DataCite XML record, is a
   metadata file; JSON that is a DataCite or a Zenodo record is a metadata file; anything else is
   read as delimited text.
3. A file named `.zip` that is not a workbook is read as a Darwin Core Archive (`parseDwca`,
   asynchronous because entries must be inflated). A file that is not a zip at all but is named
   `.zip` (an HTML error page, say) is reported as not an archive rather than as damaged.

A file that cannot be read at all (damaged workbook, malformed XML or JSON, JSON that is neither
a DataCite nor a Zenodo record) throws a `ParseError` whose message names the file. Everything
merely odd in a readable file is a finding, never an exception.

**Text.** `decodeText` (`values/encoding.ts`) tries strict UTF-8 first (a BOM is removed). On
invalid UTF-8 it chooses windows-1250 when one of the bytes `0x8A 0x9A 0x8C 0x9C 0x8F 0x9F` is
present (letters in 1250 but control characters in ISO-8859-2), else ISO-8859-2, and raises
`IN-ENCODING-FALLBACK` because the choice is a guess.

**Delimited text** (`parse/csv.ts`). The delimiter is chosen among tab, semicolon and comma by
the one whose field counts are most consistent over the first 50 non-empty lines (`SNIFF_LINES`);
ties go to tab, then semicolon, then comma. The decimal comma is assumed (`looksDecimalComma`,
`IN-DECIMAL-COMMA`) when the delimiter is `;` or tab and at least 80 % of the cells that carry a
decimal separator in the first 50 rows are written `n,n`. A trailing empty header cell is dropped
only when every line has the matching empty trailing cell.

**Short headers.** `extendShortHeader` (`parse/shared.ts`): when the most common field count of
the data rows is larger than the header's, and at least `SHORT_HEADER_SHARE` (0.95) of the rows
have exactly that count, and there are at least `SHORT_HEADER_MIN_ROWS` (3) rows, the header is
extended with unnamed columns `Column H+1 … Column N` and `IN-HEADER-SHORT` is raised. The tool
cannot know where names are missing, so the new columns go at the end; the user maps them. If
every field past the header is empty in every row (a trailing delimiter), nothing is added and
nothing is reported. If the first data row reads like a header (all text above rows with numbers)
no extension is made.

**A second header row of statistic labels** (`foldStatisticSubheader`, `parse/shared.ts`; CSV and
workbooks, so /check and /convert read the same). A row directly under the header whose filled cells are
ALL statistic labels (`mean`, `st.dev.`, `sd`, `min`, `max` ... the list of `summaryLabels.ts`, at least two
of them, at least one that is not also an ordinary code or total such as N, count, min, max, total; no number) is part of the header: `OM (%)` over `mean` and `st.dev.` becomes `OM mean (%)` and
`OM st.dev. (%)` (the label goes before a trailing unit so that the unit is still read). A header cell that
is empty above a label takes the text of its merged range (a workbook's `!merges`) or of the cell on its
left. A header that is not empty is never replaced, a single letter included. When a
label has no header above it, nothing is folded. The row is not data (no more `ROW-NON-NUMERIC` for it)
and `RawSheet.subHeaderLine` keeps its line. A name ending in a spread or a count (`st.dev.`, `sd`, `se`,
`cv`, `n`) is never read as the canonical variable (`T st.dev.` is not the
temperature) and keeps its own name; `mean`, `average`, `min`, `max`, `median` are the same quantity and keep the variable (`T mean`, `Temperature min`, `pH min`), so its range checks still apply;
the spread of a dimensionless variable (`Salinity st.dev.`) asks for no unit, like the variable. On
/convert a `st.dev.` column is therefore a measured variable named after its variable plus `st.dev.`
(`measurementType` "OM st.dev."); the converter has no pattern that carries a spread as an attribute of
the mean, and none was invented.

**A second header row of units** (`foldUnitsRow`, `parse/shared.ts`; CSV, tab, PANGAEA textfiles and workbooks, so /check and /convert read
the same). ERDDAP and BCO-DMO write a row of units under the header (`latitude` over `degrees_north`). A row directly under the header, in which EVERY
filled cell is a unit (or a neutral type word), is part of the header: the unit goes into the name as the header's own bracket, `latitude [degrees_north]`,
`time [UTC]`, `depth [m]`. Statistic labels (`mean`, `st.dev.`) may stand above or below the units row; both orders are folded.
What counts as a unit (`parse/unitWords.ts`, tested cell by cell): a unit of the vocabulary (`normaliseUnit`), `degrees_north`, `degree_north`, `degrees_east`,
`degree_east`, `degF`, `UTC` (the zone of a time column), or a phrase of unit words (`cubic metres`, `nanomoles per liter (nmol/L)`, `number/net`, `n/m²`, `cm`,
`centimeters^2`, `larvae per milliliter`). Symbols are matched by case (`cm`, `mL` are units; `CM`, `M`, `H`, `L`, `NS`, `PM`, `S1`, `G1` are codes); missing-value tokens
(`nm`, `ns`, `nd`, `n/d`, `n/m`, `n.a.`, `na`, `nan`, `null`, `-`) are never units; a cell that starts with a digit or ends in a number (`0 m`, `10 cm`, `Core 1`, `Day 3`) is a label;
calendar words (`day`, `month`, `year`) are not listed; the words for a thing counted or a place (`sample`, `core`, `tow`, `area`, `volume`, `cell`) are units only in a division
(`number/haul`, `fish per tow`), never alone. `unitless`, `dimensionless`, `text`, `string`, `code`, `integer` and a number format such as `ddd.d` may stand in the row; they add
nothing to the header and do not count. A lone `1` or `-` and a range such as `1 to 20` are not units (the list was not widened to them).
The first line of defence is that word list; the second is the values below. It is a units row only when at least two cells put a unit into the header, every filled
cell has a header above it, and in the first 50 rows below every unit column has at least half of its cells shaped like a value (a number, `<5`, `>250 um`, a range `0-1`, a date or
time of day under `UTC`), at least two unit columns hold plain numbers, and at least half of all unit columns do. A first data row of codes over names stays data, and so does a row with
words (`high`, `1A`) under a unit. A header that already names a unit (a bracket, `Temp [deg C] (CTD)`, `Tiefe [m] von`, `depth_ft`, `depth_m`, `temp_c`) keeps it when the cell
agrees, no second bracket is added; a cell that disagrees (`depth_ft` over `m`) means no fold at all, so a unit is never silently replaced. A decimal comma is decided before the fold.
Data rows keep their physical line numbers; `RawSheet.unitsRowLine` (also `subHeaderLine`) keeps the line of the units row, and `IN-HEADER-UNITS-READ` (info) says it once and
counts the columns whose name got a unit (a name that had one already is not counted) and gives the first of them as it now reads (`example`, `a [h]`: the text takes its example from the file). When every name had its unit already (a count of 0 is never said), the row is still not data and `IN-HEADER-UNITS-NAMED` (info, four languages) says so: the line holds units, the names carry them, it is not counted as a data row, the line numbers stay the file's. Nothing is changed in any cell and no role is guessed.
What is named: a first row in which every cell is a unit and the numbers agree under most of them, but under some unit stand words (`firstRowIsUnits`, `recognize/layout.ts`; also the
older test of two vocabulary units over numbers). /check refuses it (`IN-LAYOUT-UNSUPPORTED`, header over several rows). /convert does not read the sheet: `CONV-SHEET-UNITS-ROW` says the
line "looks like units" in four languages and the sheet gets the tick "Read as a normal table" (the one of transposed sheets), so a wrong call has a way out. A row that is not
unit-like at all (`S1,N/D,N/D,N/D` over numbers) is data on both. The refusal is the only message: no list of text found in taxon cells.

**Workbooks** (`parse/xlsx.ts`). Row numbers are Excel row numbers; columns stay aligned to
column A. The header is the first row with at least two non-empty text cells (else two non-empty
cells, else the first non-empty row). Formula cells are never evaluated (the cached value is
read). Numbers stay numbers, everything else is trimmed text, blank is empty. The 1904 date system
is detected and reported (`IN-DATE1904`). Before SheetJS touches a workbook, its zip directory is
read, because SheetJS never returns on some damaged zips.

**PANGAEA textfiles** (`parse/pangaea.ts`). The header block becomes embedded metadata (citation,
licence, coverage, parameters in column order); the first line after it is the table header.
The `Event(s):` block (`parse/pangaeaEvents.ts`) gives each event its position and time. A table that has no
position column of its own gets `Latitude` and `Longitude`, and one that has no date column gets `Date/Time`, added at
the right with the block's text as written, for /check and /convert alike, and `IN-PANGAEA-EVENT-USED` says so. One
event applies to every row; with several events the table's `Event` column is matched exactly (the alias in brackets
is not part of the name), and a row whose event is empty, unlisted, listed twice or without a point or date
borrows nothing and is reported (`IN-PANGAEA-EVENT-UNMATCHED`); with several events and no `Event` column nothing is
borrowed (`IN-PANGAEA-EVENT-NOT-USED`). A position is a point (`LATITUDE`/`LONGITUDE`, or a START equal to its END); a
track is not borrowed. The date is `DATE/TIME`, or START when it equals END, else the interval START/END. The
`ELEVATION` is the level of the sea floor, not the depth of a sample, and is not borrowed. A column or a value the
table has is never overwritten. When no table of a /check run has a position in any row, the report lists
`notChecked.noPositions`.

**Darwin Core Archives** (`parse/dwca.ts`, limits in `parse/zip.ts`). `meta.xml` must name an
Occurrence or Event core with exactly one file (a different core gives
`IN-DWCA-UNSUPPORTED-CORE`; an unusable `meta.xml` or a missing core file gives `IN-DWCA-UNREADABLE`
with the reason); the core is read with its declared delimiter, enclosure, encoding and header
lines; default-value fields are copied into every row. Only the **core** is read: for an Event core the rows of its
**Occurrence** extension are counted for information (`IN-DWCA-EVENT-CORE`); other extensions are
neither read nor counted, none is compared, and the report says so
(`notChecked.dwcExtensions`). Limits: `ZIP_LIMITS` (100 MB archive, 150 MB uncompressed in total
and per entry, 1000 entries, a compression-ratio guard of 200 above 1 MiB), `DWCA_MAX_ROWS`
(200 000 core rows; more rows give `IN-DWCA-PARTIAL` with how many were read), at most
`DWCA_MAX_COLUMNS` (1000) columns and `DWCA_MAX_DEFAULTS` (200) default values. `eml.xml` supplies
only title and version (`IN-DWCA-VERSION`).

**Size limits for ordinary tables.** None in the parsers or the page for a dropped CSV or
workbook beyond what the browser can hold (no cap exists in `src/app` or `src/worker`). A file
fetched by link is limited as described in 3.6.

**The sidecar.** The checker offers a companion CSV (`original_column, output_column, unit,
unit_source, p01`, settings as `(setting)` rows). If such a file is dropped next to data, it is
recognised (`readMappingFile`, `parse/mappingFile.ts`), not read as data, and restores the
"one cruise of one ship" declaration (3.5, ship speed). It is the only place that setting is
kept.

### 3.2 Reading values: numbers, dates, coordinates

All three readers write down what the text says. They never round, reformat or flip a sign.

**Numbers** (`values/numbers.ts`, `parseNumber`). Statuses: `ok`, `missing`, `non-numeric`,
`na-variant`. `NA_TOKENS` are the standard missing values: empty, `NA`, `N/A`, `NaN`, `nan`, `nd`,
`n.d.`, `ND`, `-`, `--`, `null`, `NULL`. A token that is not in that list but, once everything except letters and digits
is removed, is one or more repetitions of `NA` (`N.A.`, `NANA`, `N/A/N/A`) is `na-variant`
(`ROW-NA-VARIANT`; a digit in the token makes it something else). Thousands separators are not accepted (`1,234.5` is non-numeric unless the
file is decimal-comma, and then a `.` is not accepted either: a mixed file is reported, not
guessed). The number of decimals is counted from the text, never from the parsed value.

**Dates** (`values/dates.ts`, `parseDate`). Accepted: ISO 8601 (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`,
with `T` or a space and a time, `Z` or an offset kept as written); `DD.MM.YYYY` (day first by
convention); `YYYY/MM/DD` and `YYYY.MM.DD` (year first, so the order is certain); `DD/MM/YYYY` or `MM/DD/YYYY` (also with `-`) **only** when one part above 12 decides
the order, or when the column's order is decided by `detectDayMonthOrder` from all cells of the
column (a column that mixes unambiguous DD/MM and MM/DD cells is `conflict` and every such date
that differs in its parts is unparseable); `YY-MM-DD` (century inferred, always flagged
`ROW-DATE-YYMMDD`); an ISO interval `start/end` (the start is the date; the end must parse and not
precede the start); a bare 4-digit year string. In a column that **is** the date (its role, `datumColumn`; never by a guess from the header or the cells) eight digits are `YYYYMMDD` (text or a whole number, validated: month and day must exist) and a whole four-digit number is a year, as the text `2000` is; eight digits anywhere else stay an ID. A header that states the format in a bracket (`Date (YYYYMMDD)`, `Date [DD/MM/YYYY]`) is the name `Date` with the format as its unit text. An Excel serial is read as a date **only** when the
most of the column's numeric cells are date-formatted (`dateFormatted` is a per-column flag of the sheet), and the 1900 or 1904 system is applied; a number in a
text column is never guessed to be a serial. Calendar dates are validated (`2021-02-30` is
unparseable). All arithmetic is on UTC milliseconds, so the machine's time zone cannot move a
date. **Fractions of a second.** An Excel serial is rounded to the whole second by default (`excelSerialToDate`). `/convert` always reads it so, because its event IDs depend on it: it never passes `keepMillis` (`metaParser` takes it as an option, off by default; `convert/build.ts` and the whole of `src/core/convert` are unchanged; `test/convert/fraction-unchanged.test.ts` pins eventDates, event and occurrence IDs and the absence of `CONV-ID-REVISIT`). `/check` sets it in the wide, long and lookup builders, for the values that go to the clean CSV (the date column, a separate time column, a time column holding a full datetime, a key column written by `keyCellText`). The rule, per **column** (`values/fractionEvidence.ts`, computed once per date or time column of a sheet, on `/check`'s path only):
1. The column is **shown** (every cell is kept to the millisecond: `2021-06-01T12:00:00.250`; `00:00:00.250` is not a date-only value; precision `second`) when its number format shows a fraction of a second (`ss.0`, `ss.000`, `[ss].000`; sheet flag `fractionShown`), or when, among its numeric cells that are at least 0.5 ms from a whole second, at least half are plainly real: at least **50 ms** from a whole second with more than 8 decimals. (The whole column is read, not only the rows that reach the output; reading less would need the builders' row selection and is not cheap.)
2. Otherwise a cell is kept to the millisecond only when it is at least 5 ms from a whole second and the shortest decimal form of its number has more than 8 decimals (a real `.250` under a plain `hh:mm:ss` format).
3. Otherwise the time is rounded to the second, exactly as before. Each such cell that was **read** into the output and is at least 0.5 ms from a whole second is **counted**, once per column (tallied in `metaParser` where a date or time cell is used, and for a key column only when its text is rounded; a cell kept as the raw number, unread, unparseable or on a row without a date is not counted; a lookup sheet's cells are counted too), with the largest offset, in the sidecar note `date cells rounded to the second: Date (3 cells, up to 216 ms)` (`Dataset.roundedTimes`). A file whose times are whole seconds gets no note. A rounded serial such as `43983.33333` is 288 ms from the whole second: it reads as `08:00` and the note says `up to 288 ms`. A fill-down such as `=A2+1/1440` (float error about 0.2 microsecond per row; under 1.3 ms after 6000 rows of a 1-minute step) stays whole seconds and gets the note with an offset of about 1 ms; the drift passes 5 ms after about 18,000 rows of a 5-minute step, from there each such cell is kept with its small fraction (rule 2), and the column is not turned on by it (rule 1 needs 50 ms, some ten times as many rows).
Limits: a real time with at most 8 decimals (a millisecond of the day divisible by 108, such as `12:00:00.108`) cannot be told from a rounded serial and rounds, unless the column is shown by 1; a fraction under 5 ms in a column that is not shown rounds (counted in the note); a fill-down of several hundred thousand rows could drift past 50 ms and turn a column on, and no attempt is made to detect drift further. In a column that IS turned on by real cells, a rounded serial such as `43983.33333` is written with its fraction (`07:59:59.712`). Anything finer than a millisecond is rounded to the millisecond. `23:59:59.9996` rolls over to the next day (also in a 1904 workbook). A key cell stays the raw number when its text (to the millisecond when it has one, otherwise to the second) would lose anything, so rows that differ by less stay two. A text date already kept its fraction (`...00.250Z`). Known and left as is: a date cell at `00:00:00.250` beside a separate Time column drops the time (`combineDateTime` takes only day-precision dates), as the base does at 0.5 s and above. A time with no zone stays "unknown" (`ROW-TZ-UNKNOWN`), except that a date or time column whose
header names UTC or GMT (`UTC_HEADER`, `dataset.ts`) is read as UTC and raises no such finding; a separate time column is combined
with a day-precision date (`combineDateTime`). A time column may hold a **range**: `1600-1730`, `16:00-17:30` or several, `0530-0700, 1600-1730` (`parseTimeRange`, `values/dates.ts`). The time of the event is the **start** of the first range (a dash between two times is a range first, never a zone offset: `10:00-11:30` is 10:00; an offset needs `+`, `Z` or seconds; a column of year ranges of which at least one is impossible as a time, such as `1995-2000` (minute 95), is not a time column and is not read as times, while evening ranges such as `1930-2000` are times); the end and any further range are checked but **ignored** (no interval is written from a time column). A bare four-digit `HHMM` (`1800`, `0530`; 0000-2359, minutes up to 59) is read as a time **in a time column only** (never in a date or datetime column); one trailing period (`0530-0700.`, `1800.`, `16:00.`) is dropped, also after each of several ranges; a range end cut short (`10:00-11:3`, `1600-17`) is ignored, no finding. The year-range guard above is unchanged. A time column may also hold a full datetime (`2011-10-05T20:00:00Z`, `2003/01/17 08:30`, a spreadsheet placeholder such as `1899-12-30 12:30`): beside a date column its time part is read (`parseTimeColumnCell`), provided its day is the row's day or a placeholder. A cell that states a **zone** (`…T20:00:00Z`) is the instant of the event and wins over a date that states none, even on another day, as long as it is within a day of the date column (further apart it is `ROW-TIME-OTHER-DAY` and the date is kept; a year-only or month-only date is compared at its own precision: another year or month is reported); one without a zone on another day is `ROW-TIME-OTHER-DAY` (blocks in /convert), never silently cut. The serial of a time column formatted as a date and time is read the same way. In a column that is the date a year outside 1700 and next year is reported (`1215`). With no date column beside it, a column named time whose cells are such datetimes is the date and time (3.3). An unreadable value in a time column is `ROW-DATE-UNPARSEABLE` with `params.role = time`, worded as a time (example `16:30`) and never as a date.

**Coordinates** (`values/coords.ts`, `parseCoordinate`). Accepted: decimals; degrees with decimal
minutes; degrees, minutes, seconds; hemisphere letters N, S, E, W before or after (S and W
negate); typographic primes and quotes. The decimal separator is `.` (or `,` in a decimal-comma
file; the other one is rejected). Unparseable on purpose: minutes or seconds of 60 or more; a minus
sign together with a hemisphere letter (a contradiction, also `+` with S or W); a letter on both
ends; a letter of the other axis; exponent forms. Latitude must be within ±90 (`LAT_MAX`);
longitude within -180 to 360 (`LON_MIN`, `LON_MAX`), where values above 180 are shifted by -360
and flagged (`ROW-LON-360`). Decimals of a degree-minute value are derived from the written
precision and capped at 6 (`DECIMALS_CAP`).

**Hemisphere columns.** Some files keep the letter in a column of its own. `pairHemisphere`
combines an unsigned coordinate with the letter of its column: S and W negate, N and E keep. A
value that already carries a sign or a letter of its own is never negated twice: a negative value
(with any letter), a letter of the other axis, or an own letter against the column's one is a
**conflict**; a blank or unknown letter is **missing**; in both cases the value is kept as written
and reported (`ROW-HEMISPHERE-CONFLICT`, `ROW-HEMISPHERE-MISSING`). Which coordinate a letters
column belongs to is decided in `pairHemisphereColumns` (`recognize/columns.ts`), described in 3.3.

### 3.3 Recognising columns

`proposeColumns(sheet, ctx)` in `src/core/recognize/columns.ts` proposes a **role** for every
column of a sheet: `latitude`, `longitude`, `date`, `datetime`, `time`, `depth` (with direction and
unit), `station`, `cruise`, `sampleId`, `pressure`, `hemisphere`, `variable` (with name, unit,
unit source, P01 code) or `ignore`. Every proposal carries a confidence (`high` or `low`) and a
reason with a stable code that the page translates (`recognize/reasons.ts`). The user can change
any of it on the confirm step; nothing is checked until they confirm.

Only a sample of the rows is read: at most 1000, spread evenly (`sampleRows`).

**Step by step, for each column, in this order:**

1. **The header is split into name and unit** (`unitFromHeader`). Understood: `name [unit]`;
   `name (unit)` only when the bracket text really is a unit (so `(at 25ºC)` stays a remark);
   `Depth_m`, `temp_degC`, `name_umol_kg`; `DIC umol/kg`; the PANGAEA form
   `name [unit] (description…)`; `Tiefe [m] von` (the unit before a from/to word). The unit is
   normalised to a vocabulary label when known, otherwise kept as written; **a unit is never
   invented**.
2. **Quality flags** (`QF`, `QC`, `flag`, `quality …`) are ignored.
3. **A column of hemisphere letters** (`Lon Dir`, `Lat NS`) whose values are not numbers is
   marked `hemisphere` (low confidence, ignored as data) and passed to the pairing step below.
4. **Darwin Core headers.** A sheet counts as Darwin Core when its headers name distinctive
   terms (or carry a `dwc:` prefix); ordinary words such as `year`, `month`, `day`, `locality`
   are read as Darwin Core terms only on such a sheet (`isDwcSheet`, `dwcColumn`).
5. **Header names** (`nameCandidate`, plus Polish, German and French names in
   `nameCandidateOther`). Each candidate fills one **slot** (`latitude`, `longitude`, `when`,
   `time`, `depth`, `station`, `cruise`, `sampleId`) with a **tier**: 0 exact name, 1 other name,
   2 a P01 code or elevation, 3 inferred from values, 4 the end of a tow or transect (a start
   position wins; an end position alone is used at low confidence). Ambiguous names carry a
   **guard** that the values must back: `data`, `datum` (also a geodetic datum) need date values;
   `czas`, `Zeit`, `temps` (also durations) need values that read as times of day; a bare
   `szerokość`, `długość`, `Breite`, `Länge` (also the width or length of an animal) is a
   coordinate only if the values fit the axis, at least one has a decimal, and the opposite axis
   is present too, and then at low confidence; a unit that is not degrees rules the word out; `DL`
   counts only with its `ł`. A depth header counts unless it names the depth of the site, the
   bottom or a Secchi or mixed-layer depth, or a measurement made over a range of depths
   (`Depth-integrated chlorophyll`, `Depth averaged temperature`, `integrated over depth`; `Depth corrected` is still a depth); a
   bare `Mean depth` is still a depth.
   **PANGAEA's `name [unit] (comment)`** (`Temp [deg C] (CTD)`, `Calanoida [#/m**3] (size fraction > 300 µm)`): a round bracket after a
   square-bracket unit is the comment, not a second unit; the name and the unit are read and the header the page shows stays whole.
   **Whole-token abbreviations.** `Lat`, `Lon`, `Long`, `Lng` followed by anything are a coordinate
   (`Lat WGS 84`, `Lat GPS`, `Lat 1`, `Lon X`, `Lon 0-360`, `Lat mean`, `Lat station`, `Lat dd.mm`), as they
   always were, except when one of a few words makes it another name: `term`, `line`, `axis`,
   `distance`, `bound`, `of` (`Long term mean`, `Long-term trend`, `Long-line catch`, `Long axis`,
   `Lat of station`). `Lateral` and `Latency` are single words and never match.
   **From the values** (tier 3, low confidence): a text column of which at least 90 % of the cells (all of them below 10 cells)
   are full dates the parser reads is the date when no other column is (ISO, day.month.year, year/month/day, and a day/month
   order only when the column itself decides it; the placeholder dates of a spreadsheet or an epoch do not count). A column named
   `time` whose cells are full dates with a time of day and which has no date column beside it is the date and time of the row
   (`time-holds-datetimes`; beside a date column it stays a time). `NA` is "not available", not sodium: sodium is `Na`, or `NA`
   with a unit in its header, or `NA`/`na` over numbers with at least two DIFFERENT other major ions (calcium, magnesium, potassium, chloride, sulphate) among the
   columns (text cells or one ion twice do not count). A column named `time` of full dates alone is the date; the serial of a date-formatted Excel column counts like a text date only between 1954 and 2118 (a 1.5 is a time). The full words accept the common misspellings seen in real files
   (`Longtitude`, `Longitute`, `Lontitude`, `Longditude`, `Lattitude`, `Latidude`).
   **Dates of collection.** Besides `Date`, `Sampling date`, `Sample date`, `Collection date`:
   `Date of collection / sampling / observation / measurement / survey`, `Date sampled`, `Date
   collected`, `Date taken` and the Polish, German and French forms (`Data poboru`, `Data
   pobrania`, `Probenahmedatum`, `Datum der Probenahme`, `Date de prélèvement`,
   `Date d'échantillonnage`); a bare `Collected` counts only when the values read as
   dates. Text dates `06.12.2010` are read day first (2010-12-06).
   **Place columns (converter only).** `Location`, `Locality`, `Place` (also `Ort`, `Lieu`, `Miejsce`,
   `Lokalizacja`, …) are proposed as the **station** by the converter (`placeAsStation`; `/check`
   does not, because its station checks treat a station as one fixed point and a Location is often a
   region such as a sea, which would raise false `ROW-STATION-SPREAD` / `ROW-STATION-MOVED`
   findings), at tier 3 (low confidence), and only when the
   filled values are short place names: at most 40 characters and 6 words, at least one value
   repeated, none a number, a date, a coordinate pair or a value with degrees, at least 80 % of the
   cells. A column of sentences, coordinates or all-different values stays ignored. A real
   `Station` / `Site` / `Stanowisko` column has tier 0 or 1 and wins the slot; the place column
   is then ignored ("another column is used for station"). Pressure is its own role: water pressure in a sea
   pressure unit; air, barometric, vapour, partial and gas pressures are not.
6. **P01 codes** (`SDN:P01::CODE`) in a header, only when the name said nothing. A code after an
   explicit `SDN:P01::` or `SDN:P06::` prefix that does not have the shape of its collection (P01: eight
   upper-case letters and digits, a digit first allowed (66 of the 50 613 current codes begin with one); P06: four) is not a code at all: no concept page exists (NVS answers 404)
   and it is reported (`ROW-HEADER-CODE-SHAPE` on `/check`, `CONV-NERC-CODE-MALFORMED` on `/convert`). P02
   has no fixed length (18 of its current codes have five characters, the rest four), so it is not checked.
   Only the prefixed form is read, and only the run of letters and digits right after the prefix
   (`SDN:P01::TEMPPR01_QC` is the valid code TEMPPR01; a prefix with no code reports nothing): a bare word
   that looks like a code is never flagged.
7. **A date-formatted xlsx column** becomes a date or datetime.
8. **Values**, only when no name or code explained the column and the column is not numeric:
   degrees-and-minutes text with hemisphere letters (latitude or longitude by the letters), and
   columns in which every value is an ISO date (low confidence).
9. **Otherwise a numeric column is a variable.** Its name is the canonical variable name when the
   header matches the vocabulary (high confidence), else the header as written (low confidence,
   reason "numeric, name not recognised"). An identifier-shaped name is not a variable on
   `/check` unless the header is a canonical variable name; an abundance word (`Count`, `Individuals`) is ignored when it has no unit or a plain
   count unit (`[n]`, `[ind]`) and is a variable when it carries another unit (`ind/km2`, `cells/L`,
   `%`); a canonical variable name wins over both. The converter turns abundance words back on
   (`keepAbundance`).
10. **One column per slot.** When several columns claim a slot, a column with values wins over an
    empty one, then the best tier, then the leftmost; the losers become `ignore` with the reason
    "another column is used". A depth column's direction is read from the data: a negative value
    means up; a depth word with non-negative values is the downward convention; a header that is
    not a depth word and states no direction is `unknown` and low confidence (`ROW-DEPTH-SIGN`).
11. **Pairing hemisphere columns** (`pairHemisphereColumns`). A letters column becomes the role
    `hemisphere`, tied to the mapped coordinate of its axis, only when: the header names the axis
    (or the values do: only N/S or only E/W), **and** the coordinate is unsigned (most values have
    no minus sign or own letter), **and** the start/end word agrees (`Beg Lat Dir` signs
    `Begin Latitude`, never `End Latitude`). A header without a start or end word signs the mapped
    coordinate when it is the only one of that axis, when it sits right beside it, or when the
    other coordinates of the axis each have a letters column of their own. Otherwise the pairing is
    ambiguous and **nothing is paired**; the reason says so. At build time a letters column signs its
    coordinate only while the start/end words still agree with the *current* mapping
    (`metaParser`, `dataset.ts`); if the user moved the coordinate to another start/end column, the
    letters are not applied and one finding names the column
    ([ROW-HEMISPHERE-UNPAIRED](rules.md#ROW-HEMISPHERE-UNPAIRED)), so changing the mapping by hand
    cannot leave a stale pairing.
12. A date column whose values carry a time of day becomes a datetime.

**PANGAEA's vertical geocodes** (`src/core/recognize/geocodes.ts`, shared by `/check` and `/convert`). A PANGAEA table names its sample depth with one of the geocodes of the wiki page
*Geocode* (wiki.pangaea.de/wiki/Geocode, version `oldid=17007` of 2026-06-11): `DEPTH, water`, `DEPTH, water, experiment`, `DEPTH, sediment/rock`, `DEPTH, sediment, experiment`, `DEPTH, soil`,
`DEPTH, ice/snow`, `ELEVATION`, `ALTITUDE`, `HEIGHT above ground`, and the relative `DISTANCE`, `POINT DISTANCE from start`, `SECTION, height`, `ORDINAL NUMBER`; the table in the code keeps these names with the
abbreviation PANGAEA prints in the column header (`Depth water`, `Depth sed`, `Depth ice/snow`, `Depth soil`, `Elevation`, `Altitude`; the first three pairs are confirmed in the golden files' own
parameter lists). Only a **water** depth is read as the depth of the sample. A depth in a sediment core is the same thing on both pages whatever it is called: `Depth sed`, `DEPTH, sediment/rock`, `Depth sediment`, `Depth sed top`, `Depth core`, `Sediment depth`, `Core depth`. On `/convert` it takes the role *depth below the seafloor* (a negative distance in metres, `CONV-SEAFLOOR-*`); on both pages it never reaches the depth slot. In a sheet that has such a column, **a `Depth top` / `Depth bot` / `Depth, top/min` / `Depth, bottom/max` is the same axis**: seafloor role on `/convert` (the second and third are listed as columns not exported), a measured value with the reason `sediment-axis` on `/check`, never `minimumDepthInMeters`. `Depth ice/snow` and `Depth soil` are not water depths either; they are kept as **measured values** of
the sample (nothing is lost, and the reason `geocode-ice` / `geocode-soil` says why). `Elevation` and `Altitude` keep the sign logic of the proposer (positive up); on `/convert` `m a.s.l.` is metres, a negative value is a depth of that many metres (the sign is turned), a positive value is above the sea and is written as a negative depth, and the column's reason says so. Without a sediment depth, `Depth top` / `Depth bot` stay a water depth range.

**A date in Year, Month and Day columns** (`src/core/recognize/dateParts.ts`, shared by `/check` and `/convert`; the role `datePart`, shown as *Year / Month / Day (of a date in separate columns)*). Found by **name** and **values** together, never by position (columns that stand next to each other are not a date because their numbers fit: `Year, Quarter, Haul`, `Year, Net, Tow` and `Year` beside two species columns all fit). The headers must say so in English, Polish, German or French (`Year`/`Rok`/`Jahr`/`Année`, `Month`/`Miesiąc`/`Monat`/`Mois`, `Day`/`Dzień`/`Tag`/`Jour`, with an optional sample / sampling / collection / start word); `yyyy`, `mm` and `dd` count, but `mm` and `dd` (which can be millimetres) only beside a `yyyy`. Values: a year is a whole number from 1700 to next year on nearly every row; a month is 1 to 12 or a month name (`Sep`, `wrz`, `mars`, `Okt`); a day is 1 to 20. A column that says month or day but holds other values (a `Tag` of text) does not count. A lone Year is not a date. A **completely filled Date column wins** and nothing is marked; a Date column with blanks leaves the parts to the rows it does not fill (a contradiction between the two is another check's job). `dataset.ts` composes the date of each row: a missing day is a **month** (`1998-09`), a missing month is a **year** (`1998`), a day is never made up; an impossible date (`1998,2,30`, a month 13, a day without a month) is **not shifted**: it is `ROW-DATE-UNPARSEABLE` on its line (blocking in `/convert`), and a bad Day cell costs only its own row its day. A time column beside a full date is combined with it. A Darwin Core sheet keeps its own year / month / day handling under `eventDate`. The columns are not measured variables and not taxon candidates, so `META-NO-DATES` stays silent. If the user gives the Year column the role *Date* while a month column is a date part, the Year column is read as the year of that date. Hour and Minute columns are **not** read.

### 3.4 Recognising the layout

`proposeLayout(file)` in `src/core/recognize/layout.ts` describes how the sheets of a file fit
together. It never throws; a layout it cannot read is described in plain words and the tables it
could still read stay in the plan.

- **Wide**: one row per sample, one column per variable (the default).
- **Long**: one row per measurement. `detectLong` looks for a **parameter column** (a text column
  named parameter, variable, analyte, determinand, measurand, …, with at least one repeated value
  and fewer distinct values than rows; or, when the sheet has exactly one numeric column, a
  repeating text column of which at least half the values are known variable names), a **value
  column** (named value, result, concentration, …, or the only numeric column; at least one
  sampled value must be numeric) and optionally a **unit column** (named unit, uom, …). One row
  per sample key is built from them; a repeated (sample, parameter) keeps the first value.
- **Join**: a measurement sheet without a position is joined to another sheet that has one.
  `findJoin` accepts a pair of key columns (station, sample id, cruise, or an ignored column) when
  **every key value of the measurement sheet exists in the lookup sheet** and either the cleaned
  headers are equal, or the lookup column is unique and the measurement column is a strong key
  kind. **A key must identify one row of the lookup sheet**, and that ranks first: a unique lookup
  column beats a repeated one whatever the order of the columns or the headers (`Stn` against
  `Station` takes `Station` when `Cruise` repeats; `Sample` against `Sample ID`), then a header
  the two sheets share and a strong kind, then the finer key (with a cruise sheet and a station
  sheet, the stations). When no single column is unique the columns the two sheets share by name or
  by meaning (`Cruise` + `Station`) are tried **together** as a composite key, taken when it is
  unique or when fewer rows of the lookup sheet share their key than with the single column
  (`LayoutPlan.joins[].extraKeys`; the layout sentence names every column, and a key the user picks
  by hand replaces it). A lookup sheet with no measurements of its own is not a table in the plan.

`/convert` does not use this plan: it reads each sheet as one table and has its own handling of
long environmental sheets (8.4). It joins two sheets only when the person confirms a join (8.11);
the ranking of the join key (`rankJoinKeys`) is the one this plan uses.

### 3.5 Rules, findings and severities

**A rule** (`src/core/rules/*.ts`, assembled in `registryCheck.ts` for the pages and workers that raise only /check, /licence and /collection rules, and in `registry.ts` for the full public registry that adds the converter's) has an id, a category (`input`,
`A` licence and metadata, `B` rows and Darwin Core, `C` across files and chemistry), a severity,
a plain wording for a non-specialist in four languages (en, de, fr, pl) and a technical wording in English only, optional
`thresholds` (a number with its unit and a citation) and `citations`. Every **published**
limit a check compares against is read with `threshold(ruleId, name)`, which throws on a typo, so it
cannot drift from the rule that cites it. The tool's **own choices** are named constants in the
code, not rule thresholds: `SPREAD_KM` (10) and `FAR_KM` (1000) in `checks/rows.ts` (the rules
`ROW-STATION-SPREAD` and `ROW-STATION-SPREAD-FAR` have no thresholds), `SHIP_SPEED_MIN_SEPARATION_KM`
(10, `checks/constants.ts`), `MIXED_SHARE`, `MIXED_MIN` and `MIN_EVENTS` in `checks/speed.ts`,
`SIGN_FLIP_KM`, `SIGN_FLIP_MIN_KM` and `SIGN_FLIP_RATIO` in `checks/rows.ts`, `TYPED_DIGIT_MIN_DECIMALS` (2, `checks/rows.ts`), `LAT_EQ_LON_MIN_ROWS` (5) and
`LAT_EQ_LON_MIN_SHARE` (0.2) in `checks/rows.ts` (agreed with a data specialist, not published), `ON_LAND_MIN_KM` (50),
`ON_LAND_NEAR_MIN_KM` (10) and `COAST_BUFFER_KM` (5) in `geo/land.ts`, `DWC_MIN_TERMS` (3) in
`checks/dwc.ts`, and, in the converter, `STATION_FAR_KM` (10, `convert/build.ts`; rule `CONV-PROFILE-STATION-FAR`). A **finding** is an instance of a rule on a file, sheet,
lines, field and value (`makeFinding`).

**Severities.** `error`, `warning`, `info` (shown as Error, Warning, Note). Severity is a property
of the rule, set in the rule file; the pages count and group by it. On `/check` no finding stops
anything. On `/convert` severity is **not** the policy: `policy.ts` maps rule ids to *block*,
*accept* or *show* (section 8.8). The full list with severities, thresholds and citations is
[`docs/rules.md`](rules.md) (`scripts/rules-doc.ts` generates it; do not edit it by hand).

**The report** (`buildReport`, `src/core/report.ts`): findings with the same rule, file, sheet,
field, value and lines are merged; the rest is sorted by severity, then file, then first line,
then rule id; and counted. Each finding is shown as a plain sentence with the technical detail,
lines, field, value, rule id and sources behind a "details" toggle. The report **always** lists
what the tool does not check (`NOT_CHECKED` plus the conditional entries). It never claims that
data is ready; the interface strings are tested against that.

**How `/check` evaluates rules** (`runChecks`, `src/core/checks/run.ts`), in this order:

1. The parse-level findings (encoding, header, ragged rows, layout) and each loaded record's own
   findings (download problems, held-back files).
2. **Licence checks per loaded record** (`checkLicence`). A record that carries no metadata at all
   and was not refused by its server is skipped: a dropped CSV with no metadata file says nothing
   about a licence.
3. **Per dataset**: `checkMetadataVsData`, `checkRows`, `checkChemistry`.
4. **Across datasets** (two or more): `checkCrossFile`.
5. **Ship speed** (`checkShipSpeed`), across all datasets.
6. `buildReport`, then the "not checked" entries that depend on what happened (land mask not
   loaded, oxygen in a unit with no range, Darwin Core extensions not read, ship speed not run).

What the checks compare, in plain words (the rule ids link to `docs/rules.md` for thresholds and
sources):

- **Rows** (`checks/rows.ts`): latitude and longitude ranges
  ([ROW-LAT-RANGE](rules.md#ROW-LAT-RANGE), [ROW-LON-RANGE](rules.md#ROW-LON-RANGE)); both zero
  ([ROW-ZERO-COORD](rules.md#ROW-ZERO-COORD)); latitude equal to longitude
  ([ROW-LAT-EQ-LON](rules.md#ROW-LAT-EQ-LON), an **error** only when at least `LAT_EQ_LON_MIN_ROWS` (5) rows
  have them equal **and** either they are at least `LAT_EQ_LON_MIN_SHARE` (a fifth) of the rows with a position or at least 5 of them
  share one value with two or more written decimals that is not a multiple of 0.25 (a column copied for one station), which is
  what a duplicated column looks like (`ROW-LAT-EQ-LON-ISOLATED` must be ticked in /convert); below that, each such row is a warning
  [ROW-LAT-EQ-LON-ISOLATED](rules.md#ROW-LAT-EQ-LON-ISOLATED), or a note
  [ROW-LAT-EQ-LON-COARSE](rules.md#ROW-LAT-EQ-LON-COARSE) when the value is a whole or half degree, because one
  legitimate coarse position such as -65, -65 on the Antarctic Peninsula must not be an error); rows without a position while others have one
  ([ROW-NO-COORD](rules.md#ROW-NO-COORD), which skips blank trailing rows, summary rows and rows
  that inherit a position from a parent event); non-numeric tokens and variants of a missing-value
  token in numeric columns; unparseable, missing, future ([ROW-DATE-FUTURE](rules.md#ROW-DATE-FUTURE),
  judged so that a date within a day of today in the furthest-ahead time zone is not "future"),
  year-outlier ([ROW-YEAR-OUTLIER](rules.md#ROW-YEAR-OUTLIER): a year **range** in the title, file name or record title names every year in it) and `YY-MM-DD` dates; unknown time zone; a missing unit; depth sign, range and
  min above max; invisible characters inside a value; **the same station at positions that differ
  by a typed digit, exchanged axes or a sign** ([ROW-STATION-MOVED](rules.md#ROW-STATION-MOVED):
  as written far apart, but close and much closer once the candidate flip is applied) and a
  station spread over a long distance ([ROW-STATION-SPREAD](rules.md#ROW-STATION-SPREAD),
  [ROW-STATION-SPREAD-FAR](rules.md#ROW-STATION-SPREAD-FAR)). Generic names ("Sta. 1", "Dive 9", "Float") repeat across
  cruises and decades in collection exports, so rows of one name are compared only **within one cruise** (a row with a
  cruise value), otherwise **within one calendar year (UTC)**; a year- or month-precision date joins its year, and a blank cruise
  cell in a sheet with a cruise column falls back to the year. Rows with neither cruise nor date are a group of their own that
  nothing anchors: there a far spread keeps the warning `ROW-STATION-SPREAD-FAR` for a proper name ("Axial Seamount") and is only the note `ROW-STATION-SPREAD` for an expedition / cruise label (a route, not a place: "Java-South Africa Exped.", "Expedition 12", "Cruise", "Expedición", "Wyprawa", "Expédition"; `EXPEDITION_LABEL`) and for a generic station label (a station-like word with an optional number or letter: "Sta. 1", "Site 2", "Dive 9", "Float", "Stacja 3"; `GENERIC_LABEL`), and `ROW-STATION-MOVED` only for
  exchanged axes or a sign. The typed-digit pattern needs the shifted coordinate written with at least `TYPED_DIGIT_MIN_DECIMALS`
  (2) decimals in both positions, because whole-degree positions differ by whole degrees by coincidence; inside one cruise one decimal is enough, unless it is .0 or .5. Placeholder names (unspecified, not specified, unknown, n/a,
  none, no station, `-`, `?`, and Polish, German and French equivalents) are skipped; positions on land
  ([ROW-ON-LAND](rules.md#ROW-ON-LAND), [ROW-ON-LAND-NEAR](rules.md#ROW-ON-LAND-NEAR)).
- **Land mask** (`geo/land.ts`): a grid of 0.05° cells built from Natural Earth 1:10m land, minor
  islands and lakes (public domain). A cell speaks only when all of it is far from the coast:
  sea at least `COAST_BUFFER_KM` from land, or land or an inland lake at least a bucket distance
  from the sea. A row is reported as on land at `ON_LAND_MIN_KM` or more inland (warning) and as
  near-land from `ON_LAND_NEAR_MIN_KM` to that (note); the coastal band, rivers and canals are
  never judged. The grid ships gzip-compressed (about 0.32 MB, 322 667 bytes) and is loaded only when a dataset
  has positions; if it cannot be loaded the report says that positions were not compared with land
  (`notChecked.landMask`) rather than passing silently.
- **Ship speed** (`checks/speed.ts`): can one vessel have sailed between consecutive events? It
  never runs on a whole file by itself, because mixed ships or a mothership and its boats give false
  alarms. It runs on groups the user vouches for: rows grouped by a column mapped as `cruise`,
  or, if the user ticked **"one cruise of one ship"**, all rows without a cruise column in all
  files as one track. With neither, nothing is tested and the report says how to switch it on.
  Pipeline: rows become *events* (one station cast is one event: key = start text, end text and
  position rounded to 1e-4°); events are sorted once by the earliest instant their written time
  allows; consecutive events within `SHIP_SPEED_MIN_SEPARATION_KM` (10 km, the tool's own "same
  place" size, shared with ROW-STATION-SPREAD) are one place; a written time is not a point (a date
  alone is any instant of that day, so the longest possible gap is used and a date is never read
  as 00:00; month and year precision are too coarse to time anything); the rounding of the written
  coordinates is deducted from each distance. A two-sided test then flags an event only when both
  hops to its neighbours exceed the limit while previous-to-next does not. A single impossible hop
  (at the start or end of a track, or between two bad events in a row) cannot say which of its two
  events is wrong: it is the note `ROW-SHIP-SPEED-PAIR`, which uses only the extreme limit and is not
  raised for an event that already has a two-sided finding. A sign hint (params `signLon` /
  `signLat` with the row and the value, e.g. `72 (20→-20)`, and `signLonCount` / `signLatCount` so the sentence reads
  "row" or "rows"; a sentence only, which findings fire and their severities do not change) is added to a
  two-sided finding when reversing the sign of ONE coordinate of the middle event alone makes both hops plausible
  under the limit the rule used. It needs a move of at least `SIGN_FLIP_MIN_KM` (the station check's minimum in
  `checks/rows.ts`; near 0° a sign changes little). The distance is great-circle, so 175° against neighbours at
  -175° is a real sign error and is hinted. Exactly one axis may explain it: both or neither gives no hint. A pair
  (`ROW-SHIP-SPEED-PAIR`) never gets one: flipping either of its two events fits equally. If findings blame more
  than `MIXED_SHARE` (a third) of a group's places, and at least `MIXED_MIN` (8), the finding says
  the likely cause is the premise (several ships) rather than the data. Groups of fewer than
  `MIN_EVENTS` (3) events are not judged. Limits: [ROW-SHIP-SPEED](rules.md#ROW-SHIP-SPEED),
  [ROW-SHIP-SPEED-UNUSUAL](rules.md#ROW-SHIP-SPEED-UNUSUAL),
  [ROW-SHIP-SPEED-PAIR](rules.md#ROW-SHIP-SPEED-PAIR).
- **Metadata against data** (`checks/metadata.ts`): the temporal extent and bounding box of the
  metadata against the rows (a box with west greater than east is read as crossing the
  antimeridian; when several records give an extent, ISO wins, then DataCite, then PANGAEA, never a
  union); variables named in the abstract against the dataset's variables (word-boundary match,
  diacritics folded, short acronyms case-sensitive, and a modifier such as "sensor" or
  "fluorescence" after or before a term means the term is not promised as a column); no date
  anywhere ([META-NO-DATES](rules.md#META-NO-DATES)); and, the same way, no position anywhere
  ([META-NO-POSITIONS](rules.md#META-NO-POSITIONS), an error, cited to the OBIS Manual: `decimalLatitude` and
  `decimalLongitude` are the minimally required location terms): no latitude or longitude column is mapped, no row
  has a position and no record has a bounding box. A position in the metadata only is left to the rules that compare data with metadata.
  Both are judged per table. The sheets of one file that lack the date (or the position) are **one finding** that lists them
  (`sheets`; the sentence is not repeated once per sheet). A table that holds no measurement (it has no recognised measured
  variable and no variable column with numbers on two or more rows: a one-row gear or coordinate-system sheet) does not raise them
  while another table **of the same file** holds measurements; a separate file is never a lookup of another. A table with
  measurements that lacks them still raises them, whatever a lookup sheet elsewhere holds, and when no table of the file holds
  measurements each is judged on its own. Known limit: a lookup sheet of several rows with numbers in a column (a four-row
  `Gear, Mesh size` list) counts as holding measurements by this test and still raises them.
- **Across files** (`checks/crossfile.ts`; a dataset is one table, so a three-sheet workbook is
  three datasets): matched samples (same station or position, same depth, same day) that look
  duplicated; the same station dated differently with at least two equal shared variables; station
  ids equal after normalisation (last `/` segment, upper case, spaces removed); a variable whose
  matched values are equal while the units differ in dimension; positions exchanged between two
  files; a station whose position in one file lies outside the range seen in the others. **No
  number here is a QC threshold**: "equal" is derived from the precision the values were written
  with (`|a-b| <= ½·10^-da + ½·10^-db`, evaluated on an integer grid). With three or more datasets
  only an outlier that disagrees with every other is reported; two datasets are both named;
  sheets of one workbook count as one witness.
- **Chemistry** (`checks/chemistry.ts`): the same quantity given in mass and amount units must
  agree after conversion with the cited molar masses within the uncertainty of the written
  precision ([CHEM-UNIT-PAIR](rules.md#CHEM-UNIT-PAIR)); dissolved inorganic carbon above total
  alkalinity ([CHEM-DIC-GT-TA](rules.md#CHEM-DIC-GT-TA)); a global range test per variable from
  the cited manuals ([CHEM-RANGE](rules.md#CHEM-RANGE)). Oxygen in a unit the cited range does not
  use is skipped, and the report says so (`notChecked.oxygenUnit`); the tool does not guess a
  water density.
- **Darwin Core structure** (`checks/dwc.ts`, called from the dataset builder for every raw table):
  a table counts as Darwin Core only when it is an archive, or its header names at least
  `DWC_MIN_TERMS` distinct terms from a list of terms that are not ordinary words, spelled exactly
  (case counts), **and** at least one record-kind term. Then: required and recommended terms,
  empty required values, duplicate `eventID` / `occurrenceID`, a `parentEventID` with no matching
  event, a loop in the event hierarchy (linear-time), values outside the vocabularies `obis-qc`
  uses (`basisOfRecord`, `occurrenceStatus`). See the `DWC-*` rules.
- **Licence and metadata of a record** (`checks/licence.ts`, from `licence/analyse.ts`; see 6).

### 3.6 Public records: how a link becomes files

`resolveInput` (`sources/resolve.ts`) is pure string work, no network. After trimming quotes and
trailing punctuation it recognises: a bare number (a Zenodo record); a UUID (a GeoNetwork record
on the default host, `DEFAULT_GEONETWORK_HOST`); a DOI (`10.xxxx/…`, bare, `doi:` or a
`doi.org` link); a Zenodo record or DOI link; a GBIF dataset page (UUID) or OBIS dataset page
(UUID); a `doi.pangaea.de` PANGAEA link; a dataset page of a **listed** Dataverse installation
(`config/dataverse.ts`); a GeoNetwork URL with a UUID in the path or hash. Anything else is
`unknown`, and the page asks the visitor to download and drop the file instead.

`loadRecord` (`sources/index.ts`) then loads a record (metadata and file list):

| Kind | What is read |
|---|---|
| DOI | The DataCite record (`api.datacite.org/dois/<doi>`) is read first and the DOI is **routed** by its landing page, or failing that by its suffix: Zenodo, GeoNetwork, PANGAEA, GBIF, a listed Dataverse, or "other" (a DataCite record with no data file: `IN-NO-DATA-FILE`, or a landing host that is not allowed). |
| Zenodo | `zenodo.org/api/records/<id>` plus the DataCite record of its DOI (a failure there is silent: one licence source fewer). |
| GeoNetwork | `<host>/geonetwork/srv/api/records/<uuid>/formatters/xml` as ISO 19139 or 19115-3. A `403` or a sign-in page is "inaccessible". Distribution links that deliver a table (a table extension or an OPeNDAP CSV path; not landing pages, DOIs or OPeNDAP service suffixes) become files, if their host is allowed. |
| PANGAEA | `/check`: the textfile (`?format=textfile`); `/licence`: the metadata XML (`?format=metainfo_xml`, about 19 kB, no data) plus DataCite. |
| Dataverse | The latest **published** version through the native API (never a draft, no credential sent); restricted files answer 401/403/404 and are reported as held back (`IN-FILE-HELD-BACK`). |
| GBIF / OBIS | Registry first (`/v1/dataset/doi/…`, `/v1/dataset/<key>/endpoint`, or OBIS `/v3/dataset/<uuid>`); the Darwin Core Archive URL it names is downloaded **only** if it is an IPT `/archive.do` on the static host list (`config/ipt.ts`, `isArchiveUrl`), else `IN-IPT-HOST-NOT-LISTED` names the host. |

Files of a record are downloaded only when they have a table extension (`csv tsv txt tab xlsx xls
ods`, `DATA_EXTENSIONS`) and are not a README (`isDataFile`, `sources/common.ts`). For a Dataverse
record, files the tool cannot read but that may hold data (a zip, NetCDF, SPSS) are named in one
finding (`IN-FILES-NOT-READ`, raised in `sources/dataverse.ts`) so a report never reads as if the
whole dataset was checked; files dropped by the visitor that are not tables are listed on the
confirm step as "not read".

**Two download modes** (`browserFetcher` and `serverFetcher`, `sources/fetcher.ts`). Both refuse
a host that is not in `DATA_HOSTS` (`config/hosts.ts`: exact host names, https only, no
credentials). Browser mode is a CORS request from your own browser with a
`BROWSER_TIMEOUT_MS` (30 s) wait for the response headers; a CORS refusal or a network error is
`IN-FETCH-BLOCKED` and the page offers server mode (`LoadProblems`, `ModeSwitch`). Server mode is
described in 10.

**Size limits.** In **server mode** the proxy refuses a body above `MAX_BYTES` (30 MB) for an ordinary
URL, and a Darwin Core Archive from an IPT is limited to `IPT_MAX_BYTES` (100 MB) and
`IPT_TIMEOUT_MS` (90 s). In **browser mode** there is no cap for non-archive files. The
`LINKED_FILE_MAX_BYTES` check (30 MB, the same number) exists only for **Dataverse** records
(`sources/dataverse.ts`): a file whose size the API gives is reported (`IN-FILE-TOO-LARGE`) before
anything is downloaded, and a `too_large` answer of the proxy for a Dataverse file of unknown size is
said the same way (`loadInputs`).

Each downloaded failure becomes an input finding (host only, never the full URL:
`fetchErrorFinding`) and loading continues with the rest.

*Code: `src/core/parse/*`, `src/core/values/*`, `src/core/recognize/columns.ts`,
`headerWords.ts`, `vocab.ts`, `layout.ts`, `src/core/dataset.ts` (`buildDataset`,
`buildDatasets`, `metaParser`), `src/core/rules/*`, `src/core/report.ts`, `src/core/checks/*`,
`src/core/sources/*`, `config/hosts.ts`, `config/ipt.ts`, `config/dataverse.ts`.*

---

## 4. `/` Home

**Purpose.** A landing page with one tile per tool (`IndexPage`): Data check, Licence check,
Collection review, Darwin Core converter. Each tile heading carries an ⓘ explanation (see
`CONTRIBUTING.md`). It has no logic of its own and makes no network request except the optional
analytics page view after consent.

*Code: `index.html`, `src/app/entries/index.tsx`, `src/app/pages/IndexPage.tsx`.*

---

## 5. `/check` Data check

> **At a glance**
> - **Does:** checks data files or a public record for coordinate, date, unit, licence, metadata and
>   cross-file problems with cited rules; shows a two-layer report and a map.
> - **Input:** files (`csv tsv txt tab xlsx xls ods xml json zip`) and/or a DOI, Zenodo, PANGAEA,
>   GeoNetwork, GBIF/OBIS or listed Dataverse link.
> - **Output:** the report; clean CSV, sidecar CSV, GeoJSON, ISO 19139 and DataCite XML drafts, all
>   made in the browser.
> - **Leaves the browser:** never a dropped file. A pasted link's record and files are fetched by
>   your browser (default) or by the site's proxy (server mode); the map loads CARTO tiles; analytics
>   counts only after consent. See 2.

### Purpose

Take data files, or a link to a public record, and tell the author what is wrong or odd **before
publication**: coordinates, dates, units, licence, agreement between files and between metadata
and data. The report reads in two layers (a plain sentence for a non-specialist, the technical
detail and the cited source behind a toggle). The tool reports what it did **not find** in the
categories it checked, and always lists what it does not check; it never says data is "ready".

### Inputs

- **Files** dropped or chosen: extensions `ACCEPTED_EXTENSIONS` (`src/app/types.ts`): `.csv .tsv
  .txt .tab .xlsx .xls .ods .xml .json .zip`. Others are listed as rejected. Content decides what
  a file is (3.1).
- **A link, DOI or id** to a public record (3.6), loaded in **browser mode** (default; your browser
  downloads) or **server mode** (the site's proxy downloads). Files and a link may be combined
  (`mixed`).
- **Metadata files** (ISO 19139 / 19115-3 XML, DataCite XML or JSON, Zenodo JSON) dropped with the
  data are read as metadata for every dropped data file; records from a link apply to the files of
  that record.
- **The companion sidecar** of an earlier run (3.1).

Limits: Darwin Core Archives and linked files as in 3.1 and 3.6; no cap on a dropped table.

### The flow (`CheckPage`, phases `input → loading → confirm → checking → report`)

1. **Load** (`loadInputs`, `src/app/loadInput.ts`). Dropped files are read with
   `File.arrayBuffer()`. A link is resolved, its record loaded, and each downloadable file fetched
   one after the other, with a status line per file. A download problem becomes a finding and the
   rest still loads; a link that is not recognised stops with a message asking the user to
   download and drop the file.
2. **Parse** (worker `parse`, `createHandler` in `src/worker/handler.ts`). Every file is parsed
   (archives asynchronously). Metadata files go first, so each data file sees them whatever the
   drop order. A sidecar is recognised and removed from the data. Files that are not tables are
   listed as not read. For each table file the worker proposes a layout and column roles and sends
   the page a summary with sample values. As soon as a proposal has both a latitude and a longitude
   column the worker starts fetching the land mask, while the user reads the proposal.
3. **Confirm** (`FileReview`, `LayoutConfirm`, `MappingEditor`). The user sees each file's layout
   (wide, long, joined sheets, or "cannot be read" with the reason) and each column's proposed role
   with its reason and confidence, and corrects them. Changing a long table's parameter, unit or
   value column makes the worker propose the columns again (`propose`). The user may tick **"one
   cruise of one ship"** (shown with the names of files that already have a cruise column, where it
   has no effect). Nothing is checked until they press confirm.
4. **Build** (worker `build`, once per file; `buildDatasets` in `src/core/dataset.ts`). The
   confirmed mapping is applied; see below.
5. **Check** (worker `check`; `runChecks`, 3.5). If a dataset has positions, the check waits for the
   land mask; a mask that cannot be loaded is reported, not skipped silently. A check that finishes
   in a session that was reset meanwhile is discarded.
6. **Report, map, downloads.**
   A list of line ranges in a finding's sentence that holds more than 10 ranges is collapsed in the page to its first 5, with a button after the whole sentence that says
   "Show all 550 lines" (the true number of lines the ranges cover) and turns into "Collapse" (`CollapsibleList.tsx`; 10 or fewer ranges are shown whole). The technical line and the
   Lines row inside "Technical details" always show in full: opening the details is the person's choice. The heading with its count, the level, the rule id and every decision button stay
   outside the collapsible part; the rest of the list is in the page (marked `hidden`) and the print stylesheet shows the sentence whole (a closed details is not printed at all). A "... (+n)"
   count of lines the converter did not list is said plainly after the button, open or closed. The state is the page's alone: the reports, the clean CSV, the sidecar and every other
   download are the same open or closed. (Known gap: the hidden part is not found by the browser's find-in-page while collapsed.)

### How a mapping becomes rows (`buildDataset`, `src/core/dataset.ts`)

- **Values are parsed, never changed.** Out-of-range coordinates keep their number (the range
  rules report them); sign conventions are not flipped; a missing value has status `missing` and
  raises nothing.
- **Wide**: one row per source row. **Long**: one row per sample key (sample or core id, station,
  cruise, depth, date, time and in-sheet position as raw text), numeric cells keep their own line
  numbers, a repeated (sample, parameter) keeps the first value; units per parameter come from the
  unit column or from the parameter text (`DIC [umol/kg]`). **Join**: position, date and station
  come from the lookup sheet; when the data names no station, the sample id is the station.
  A key that still maps to several lookup rows is never resolved to the first one: when those rows differ in
  position or date, **none is taken** and `ROW-JOIN-AMBIGUOUS` names the key, the lookup sheet and the
  rows that got nothing; rows that repeat the same position and date are one row. `/convert` reads no
  join the person has not confirmed (§8.11): without one each sheet stands on its own, so a position in one sheet is never lent to another
  (`test/convert/no-joins.test.ts`). Rows that differ only in depth lend their position and date and **no depth**, and say nothing (limit, §14).
  A blank part of the key on a row with no position of its own is `ROW-JOIN-KEY-BLANK`; after an
  ambiguous join `META-NO-DATES` names the sheet as the likely cause.
- **Variable keys** are the column headers (prefixed with the sheet name when several tables are
  built, numbered on a clash); a variable with no unit in the header can take the unit from a
  metadata record (`unitSource: 'metadata'`).
- **Dates**: the day/month order of a slash date column is decided once per column from all its
  cells; Darwin Core `year`, `month`, `day` columns give a date where `eventDate` is empty; a
  separate time column is combined with a date.
- **Event hierarchy**: a row without a position is not counted as missing one when it is the
  parent of another event or has an ancestor with a position (`clearInheritedPositions`; OBIS
  gives it the parent's position). A row without a position is a "record without one" only when it
  holds at least two other values and is not a summary line (`Total`, `Mean`, `SD`, …).
- A layout the tool cannot read raises `IN-LAYOUT-UNSUPPORTED` and the tables that remain are
  still built.

### Outputs (`src/core/output/`, made in the browser, offered as Blob downloads)

- **Clean CSV** (`toCleanCsv`): columns `station`, `cruise`, `sample_id` (when present), `date`
  (ISO 8601; a UTC time carries its `Z`), `latitude` (`degrees_north`), `longitude`
  (`degrees_east`), `depth`, then the columns that tell rows apart, then each variable as `name [unit]`. The columns that tell rows apart are each pressure column (role `pressure`, in
  its own unit, `Dataset.extraKeyColumns` with kind `pressure`) and the columns that joined the row key of a long sheet (`extendLongKey`: a replicate, a cast, a layer; kind `key`); their cells
  sit on `DataRow.keyCells`, by `ExtraKeyColumn.id`, and are written as the file wrote them (`10.50` stays `10.50`; a pressure of a decimal-comma file loses only its comma, a vertical-coordinate key is swapped the same way, any other key is a label and is never re-read as a number). A pressure of a long sheet that does not join the key is written only when it does not differ inside one output row (otherwise it would show the first value of
  several); the first non-blank cell of the group wins, and a pressure that varies is not written and is named in the note below. A header that repeats in a sheet keeps both columns
  (`header#index` is the id of the second); the same header on two sheets is one column; a header that collides with a column already in the CSV gets the usual `_2` (fixed columns and variables match exactly, as always: `Temp`, `temp` and `TEMP` stay three columns; a column ADDED beside them matches in any case: `Depth` beside `depth` is `Depth_2`); an xlsx number in a key column is converted only when every numeric cell of the column is date-formatted (`RawSheet.dateAll`, `timeAll`; `dateFormatted` stays the majority flag the date reader uses): in a time-only column a value from 0 up to 1 is written `HH:MM`, in a date column a plausible serial is written as its date (and time), read with the workbook's date system; every other number (`[h]:mm` 36.25, a full datetime shown as `hh:mm`, a General 5 among dates) stays the number, because a conversion that could lose a cell is not made. A date-formatted pressure stays a serial. A sheet with
  no pressure and no key column of these kinds is written exactly as before. A key column that no fixed column carries (a time with no date, a sediment depth, a depth bottom, a replicate) is written as a `key` column when no cell of it was used (a column with only SOME cells used, such as a date that reads `spring` once, is written only when two output rows that are identical in every written column (station, cruise, sample, date, position, depth, the other written extras) differ in this column (the test compares the column's cell of every output row, not only the unread ones; it can only add a column that tells rows apart), and is otherwise named as only partly in the file, so one bad cell never adds a raw column), because rows that differ only
  there would look identical. A vertical coordinate that tells rows apart (sediment depth, depth bottom) is always written and fires no finding. A column the person set to `ignore` on purpose (the given mapping says ignore, the proposal for it did not) is not written, still separates the rows, and is named; a column
  that is `ignore` by default (a replicate, a cast, an analyst) is, on a long sheet, written as a key column and named in `ROW-LONG-KEY-EXTENDED`, whose text says that the clean CSV writes it (on a wide sheet it is a descriptive column, below). `ROW-KEY-IGNORED` (info, like `ROW-LONG-KEY-EXTENDED`: a choice the person made; long and wide sheets; renamed from `ROW-LONG-KEY-IGNORED`, nothing stores rule ids): when a column the person set to `ignore` on purpose (the given mapping says ignore, the proposal did not) differs between two or more rows that look alike in every identifying column the clean CSV writes (station, cruise, sample, date, position, depth and the written extras), the rule names the column and says the rows look alike there, that the column is not written, and that their other measured values are still in the file and in the clean CSV (the column may itself be a measurement). On a long sheet only a key column is looked at; on a wide sheet any column set to ignore that has a value. It costs nothing when no column was set to ignore, and a row that identifies nothing is skipped (`reportKeyIgnored`). Values are written **from the
  original text**; a decimal-comma file keeps every character except the separator; coordinates
  parsed from degrees-minutes are written as decimal degrees rounded to the precision of the
  source and a note says so; every text cell passes the formula guard (a leading `= + - @` or tab
  gets an apostrophe), the OWASP rule for spreadsheets. Notes record an unknown time zone, an
  unparseable date, an unstated depth unit and an upward depth, and **every source column the file still does not contain**
  (`unwrittenColumns` in `dataset.ts`; nothing is inferred from the roles: the build records the source columns it actually read, `Dataset.readColumns`, and the list is every other column of the mappings, minus the descriptive columns below): one note per sheet, `source columns that are not in this file: a | b | c` for columns of which no cell was used that the person set to `ignore` on purpose, and `source columns only partly in this file: Date (1 of 3 cells)` for columns of which some were (the unit is cells for a wide sheet, `rows` for a long sheet, whose count is of output rows, and `joined cells` for a lookup sheet) (a zone-stated time that replaces the date credits the date column only when the kept date falls on the day the date cell states), whole and in file order (the list is not cut). A column is carried only when EVERY non-blank cell of it gave something to the output (counted per cell: `filled` against `used`); a column is carried when a value of it went into the date (a date, a time beside it, date parts that built it, a Darwin Core year/month/day under an empty
  eventDate), the position (with its hemisphere), the depth, the station, cruise or sample of a row, a variable, the parameter, unit or value of a long sheet, or when it lent such a value from a lookup
  sheet from every joined right row (all right rows of a joined or ambiguous key are judged, not only the one taken; a cell identical to the taken row's is not lost; a join key of the lookup sheet counts only when the key column it is matched with was carried; a zone-stated time that replaces the date credits the date column when the kept date falls on the day (month, year) the date cell states, and does not when it differs; on a long sheet, a hemisphere or Darwin Core date part outside the key whose cell differs on a merged source row is not carried). A column with no cell used is a **descriptive column** (`addDescriptive` in `dataset.ts`, `Dataset.descriptiveColumns`) and is written, not named: an ignored-by-default column (a comment, a fjord, a water type, an area, a sampling gear), a time with no date, date parts no date was built from (month and day with no year, a month beside a full date, a year under a filled eventDate), a lookup column no row took a value from (a date the data sheet has itself), a pressure that varies inside one row. Only a column the person set to `ignore` on purpose (the given mapping says ignore, the proposal did not) stays out and is named, and the columns only partly read stay a note.
  *Descriptive columns.* They are written after the variables, in source order, under the header as in the file (a repeated header gets a suffix, caseless, as the key columns do; the same header on two tables is one column, a column lent by a lookup sheet beside a column of the data sheet itself is another), and each cell is written as the file has it through the lossless path of the key cells (`keyCellTextOf`: Excel dates, times and fractions follow the fraction rules of 3.2, a decimal comma is not swapped, the formula guard applies; the first cell is written exactly as the file has it, agreement is judged on trimmed text). A column that would be blank in every row is never written: when the source has no value in the rows that reach the output it stays in `source columns that are not in this file` as before, for its own sheet (an all-blank source column included, also when another sheet's column of the same header is written); when it was read and every cell was emptied by disagreement it leaves that note and only the differ note names it, as `Notes (2 rows, column not written)`. A wide sheet writes the cell of its own row. A long sheet writes the cell its source rows agree on (blank cells do not disagree); where they differ the cell is empty. A lookup sheet's column is read from EVERY right row the join key points at (an ambiguous position or date does not matter for a descriptive column): the value they agree on is written beside the data row, and where they differ the cell is empty. Both cases are counted in `source columns that differ within a row, left empty there (sheet X): Notes_2 (3 rows) | Area (1 row)`, under the header the column has in the CSV (the collision suffix included), one note per sheet whose rows actually disagree (a column shared by two tables lists each sheet with its own count) and with the sheet when the dataset has more than one. The cache of a resolved lookup key belongs to one join (one table), so two tables joined to one sheet on different keys never share an entry. A date or time cell of such a column that is written rounded to the second is counted once per source cell in the rounding note (`Date (2 cells, up to 108 ms)`); a cell later emptied is not counted. The cells are held once per column, as references to the source's own cell values (not a copy per row): on 1,000,000 rows with 14 text columns the heap after the build grows by about 114 MB over the build without them (and the CSV text itself by its own size). The sidecar maps each new column like the others (`original_column` = the header). The invariant that proves nothing else moved: the clean CSV without its trailing descriptive columns is byte-identical to the CSV before the columns existed (`test/output/descriptive-columns.test.ts`; `GOLDEN_DIFF_MODE=invariant` in `scripts/golden-diff.ts` for the golden set). The sidecar is held to the same: against the build without the columns every line is identical except (a) the mapping rows of the new columns, (b) the "not in this file" note of a sheet losing exactly the source columns (identified by sheet and place in the sheet, never by header) that are now written or named in a differ note as not written, (c) the new differ notes (`scripts/sidecar-invariant.ts`; `BuildOptions.descriptive: false` gives the build without them).
- **Sidecar CSV** (`original_column, output_column, unit, unit_source, p01`): what each output
  column came from, plus the `(setting)` row for the "one cruise" declaration.
- **GeoJSON** (`toGeoJson`): one point per row, `[lon, lat]` as parsed, with the worst severity of
  the findings that point at the row (a finding counts for a row when its lines include the row's
  own line or one of its value cells' lines, in the same sheet).
- **Metadata drafts** (`metadataDraft`): temporal extent (the first and last day covered by the
  rows at their written precision), bounding box, variables (`name [unit]` plus P01 code when
  known), the licence the metadata already states (never a metadata-record constraint), title and
  abstract. Written as an **ISO 19139** XML and a **DataCite kernel-4.5** XML **draft**: what the
  data cannot supply (contact, citation date, language, topic category, DOI, creators, publisher)
  is marked missing, with `gco:nilReason` or XML comments, for the editor to complete. The page also
  shows the values with the names of the GeoNetwork editor sections and copy buttons. **Known gap:**
  the draft's bounding box is the plain minimum and maximum of the longitudes of rows within
  ±180°. **Across the antimeridian** the draft writes the smallest interval of longitudes
  (`smallestLonInterval`, `geo/lonInterval.ts`, the same function for the EML coverage of /convert): points at 178, 179, -179, -178 give west 178, east -178,
  i.e. west greater than east, which ISO 19115 `EX_GeographicBoundingBox`, EML, GeoJSON (RFC 7946
  section 5.2) and DataCite `geoLocationBox` (each bound -180..180, no order required) allow, and which the check
  [META-POINT-OUTSIDE-BBOX](rules.md#META-POINT-OUTSIDE-BBOX) already reads as crossing. The short way
  round is used only when it is at most 180° wide; a global spread keeps the plain minimum and maximum.
- **Map preview**: points on a CARTO dark base map (`MapPreview`, `mapModel.ts`), coloured by worst
  severity; a click opens the row's file, line, station, date and values (fetched from the worker
  by file and line, built with `textContent`). `maplibre-gl` is imported only when there is
  something to show. See 2 for what this loads.

On the report, citations are hidden under `LIC-*` findings (`NO_CITATIONS_IN_CHECK`,
`ReportView.tsx`): `/licence` and `docs/rules.md` show them.

### Limits and known gaps

- Transposed tables and a header split over several rows are **not supported** (3.4); the report says so. A units row under the header is read (see above) when every cell is a unit and values stand under them; a row that looks like units but has words under some unit is named, not read.
- Darwin Core: only the core is read; extension tables are not compared.
- Long layouts keep the first value of a repeated (sample, parameter) pair.
- Years named in a title, file name or record title are single years or **ranges**: `1994-2019` (hyphen,
  en or em dash), `1994/2019`, `1994 to 2019` (also until, through, bis, do, au), `between 1994 and 2019`
  and a pair after a whole cue word (`in the period 1994_2019`; `Station_code_2015_2019` has no cue)
  cover every year between. A two-digit end counts only when it cannot be a month (`1994-95` and
  `2019/20` are ranges, `2019-08` is the year 2019, `2011-12` is 2011); a range followed by a unit
  (`1950-2000 m`), descending pairs, dates, two years joined only by an underscore (`cruise_2015_2019`)
  and two years joined by "and" after "years" or "lata" are separate years. The covered years only widen what is accepted: rows in a year outside them still raise
  `ROW-YEAR-OUTLIER`.
- Three warnings that only say what they saw and never change a value:
  [ROW-YEAR-DATE-MISMATCH](rules.md#ROW-YEAR-DATE-MISMATCH) (a Year column beside a date column, `Dataset.yearColumns`, `DataRow.yearCell`; the column is found by the names of `recognize/dateParts.ts` (Year, Rok, Jahr, Année, yyyy, Sampling year; not Publication year) or the Darwin Core term, even beside a full date column; a year outside 1700 to next year is a code; a date read with a guess about its order (`ambiguity`) is not compared: the year is not a year of the date; a date range counts every
  year it covers; never for a year-only date, a date built from the Year column itself, or a blank or non-numeric year; one finding per sheet with the rows),
  [DWC-EVENTDATE-NOT-ISO](rules.md#DWC-EVENTDATE-NOT-ISO) (`checks/dwc.ts` `isIsoEventDate`: only a column headed exactly `eventDate`, with or without `dwc:`; year, year-month, date, ordinal and week dates, extended or basic (`20110614`, `2011-165`, `2011-W24-2`), with a time and a zone (`T24:00` is refused), or
  an interval or a start or end beside a duration (`/P1D`, `P1D/`), whose end may be shortened to a month, a day, a month and day, a time or a day and time; the missing-value tokens (`NA`, `N/A`, `-`, `null`, `nd`) are not dates; an xlsx date-formatted cell is not judged, a plain number is) and
  [ROW-TEXT-MOJIBAKE](rules.md#ROW-TEXT-MOJIBAKE) (`checks/dwc.ts` `mojibake`: `U+00C3` or `U+00C2` followed by `U+0080`-`U+00BF` in any text cell or header of a sheet; a lone `Ã` or `Â`, `Ãngulo`, `São`,
  `Århus` and Greek or Cyrillic names are real text; only this pair is counted (other forms of double encoding, such as `â€™`, `Å‚`, `Ã“`, `Ã€` and `Ð¼`, are not matched, so the count is not of every damaged cell), and, in /check, a file decoded by a fallback encoding (`IN-ENCODING-FALLBACK`) is not read at all (an encoding the file declares itself is no fallback), while on /convert the text of the output tables is scanned; one finding per sheet listing at most ten columns; two `indexOf` calls per cell before the pattern, so one linear pass, `test/perf/mojibake.perf.ts`:
  300,000 rows of 40 columns in about 0.3 s). The same checks run on the output tables of /convert (`validate.ts`); a warning that is on no policy list is shown, never blocks.
- The report does not check scientific validity, calibration, taxonomy or PDF content
  (`NOT_CHECKED`).
- Cross-file checks treat the sheets of one workbook as one witness, not independent ones.

### Network calls and opt-ins

Browser or server mode for links (see 2 and 10); the map; the land mask from your own site;
analytics after consent (`check_started`, `check_finished` with counts). No opt-in beyond the mode
and consent.

*Code: `src/app/pages/CheckPage.tsx`, `src/app/loadInput.ts`, `src/app/components/{InputPanel,
FileReview,LayoutConfirm,MappingEditor,SingleCruise,ReportView,MapPreview,Downloads,LoadProblems,
ModeSwitch}.tsx`, `src/worker/handler.ts` (`createHandler`), `src/worker/{client,protocol,
check.worker}.ts`, `src/core/dataset.ts`, `src/core/checks/*`, `src/core/output/*`,
`src/core/geo/land.ts`.*

---

## 6. `/licence` Licence check

> **At a glance**
> - **Does:** compares what each metadata source of one dataset says about its licence and shows
>   contradictions and an attribution line.
> - **Input:** one or several references to the same dataset (DOI or record link).
> - **Output:** a table of sources and statements with their classification, contradictions, an
>   attribution line.
> - **Leaves the browser:** only the reference's metadata requests, by your browser or the proxy;
>   no files, no analytics events of its own. See 2.

### Purpose

For **one dataset**, show what each metadata source says about its licence, how each statement
is classified, and where the sources contradict each other. It reads **metadata only, never data
files**, and produces an attribution line from what the sources agree on.

### Inputs

One or several references to the same dataset, one per line (`splitReferences`: trimmed, empty and
repeated lines dropped): a DOI, a Zenodo, PANGAEA, GeoNetwork or listed Dataverse link (3.6). The
same download modes as `/check` (browser default, server on request), with the same switch offered
when a host blocks the browser. A pasted **GBIF or OBIS dataset page link** is recognised but **not
read** on this page: nothing is fetched and the page lists it as an unread source (`loadLicenceReferences`,
`reason: 'not-read'`); it is never counted as "no source states a licence".

### Pipeline (`LicencePage`, `loadLicenceReferences`, `analyseLicences`)

1. **Load metadata** for each reference (`src/core/licence/load.ts`; PANGAEA through the metadata
   XML loader, `loadPangaeaMetainfo`). Each URL (with its `Accept` header) is fetched once per
   run, failures included, so a failure is reported the same way everywhere. A DOI and a Zenodo
   link of the same deposit ask for the same URLs once. Records are deduplicated by source and DOI
   or label. A DOI whose DataCite record was not loaded is looked up at DataCite. A failed read is
   a failure of that **source**, never "no licence"; a DOI whose repository page was not opened is
   listed without a source and the page says the licence could not be looked up there. Reasons are
   written for this page (the data-file advice of `/check` does not apply).
2. **Analyse** (`analyseLicences`, `src/core/licence/analyse.ts`), the single place the sources
   are compared. Each statement (a field of a record) is classified:
   - a **recognised identifier**, from a licence URI naming it, the bare id as text or as the
     identifier, or an id with no free text; "open" means open in the Open Definition sense:
     every classifiable id except Creative Commons NonCommercial and NoDerivatives
     (`isOpenLicence`, `metadata/licence.ts`);
   - **free text**: nothing machine-readable (`LIC-FREE-TEXT`, with a suggested identifier);
   - **not classified, check by hand**: text and link differ (`LIC-TEXT-URI-CONFLICT`); the text
     names a licence but adds or negates conditions (`LIC-ADDED-CONDITIONS`) or says something
     else (`LIC-EXTRA-TEXT`); no link and more than one reading (`LIC-AMBIGUOUS`); a repeated
     rights entry that is no recognised licence next to a recognised one (`LIC-OTHER-RIGHTS-ENTRY`).

   Reading a link: host and scheme are irrelevant; what may follow the version is an optional port
   segment (below 4.0 only), `legalcode` or `deed` with a language tag, and a closing slash;
   anything else (a query, a fragment, `legalcode-modified-nc`) makes the link unreadable; the one
   exception is the exact `?ref=chooser-v1` the Creative Commons chooser appends. Reading text: a
   version is mandatory for an id; the elements of the official CC names in en, de, fr and pl are
   the licence, not conditions added to it; a capitalised word after a version below 4.0 may be a
   jurisdiction, so the licence is then unrecognised rather than the generic one; `CC BY` without a
   version names a family that is compared with the link but is not an id.
3. **Group sources into deposits.** Records that describe one deposit share a group: a Zenodo
   record and the DataCite record of its DOI (a concept DOI and a version DOI included, joined
   when the DataCite record names them with `IsVersionOf` or `HasVersion`), a PANGAEA record and
   the DataCite record of its DOI. A GeoNetwork record is its own deposit even with a DOI.
4. **Contradictions.** Different licences inside one source outside repeated entries (two ISO
   fields) contradict each other; entries the publisher repeated on purpose (DataCite
   `rightsList`, Zenodo `rights`, a Dataverse's per-file licences) are dual licensing, not a
   conflict. `MD_RestrictionCode` `license` is the normal ISO way to say a licence applies and
   cannot contradict a CC licence, but other restriction codes next to an **open** licence are
   flagged (`LIC-RESTRICTION-CONFLICT`). **Mismatch** is two sources whose sets of recognised
   licences are **disjoint** (`LIC-MISMATCH`). A DataCite record read but silent while another
   source states a licence is **not** a contradiction: it is its own line
   (`LIC-DATACITE-EMPTY`). If the Zenodo record of a DOI could not be read, a concept DOI and a
   version DOI can look like two sources, and the page adds a caveat instead of claiming "no
   contradiction among N sources".
5. **Verdicts shown**: stated / missing (no source states one and none was unreadable:
   `LIC-MISSING`) / unreadable (absence then says nothing) / free text only; restricted or
   embargoed Dataverse files (`LIC-FILES-HELD-BACK`: the verdict covers the open files only).
6. **Attribution** (`buildAttribution`): built only from what the sources state.

### Outputs

The sources table per deposit with each statement's classification and field, the contradictions
in the rule's own words with the sources the rule rests on (citations are shown here, and the
ⓘ on the sources heading explains the identifiers), the attribution line with a copy button.
Nothing is written to the address bar.

### Limits and known gaps

- The recognised identifier list is what `metadata/licence.ts` and the SPDX data in
  `metadata/spdx-data.ts` cover; an unknown id is never "open".
- GBIF and OBIS dataset page links are not read here (above).
- It reads the licence statements of the metadata; it does not read a licence out of a data file.

### Network calls and opt-ins

Browser or server mode, as `/check` (hosts in 2). No analytics events of its own.

*Code: `src/app/pages/LicencePage.tsx`, `src/core/licence/{load,analyse,attribution,failure}.ts`,
`src/core/metadata/{licence,spdx-data,zenodo-licences,eu-licence-authority,datacite,zenodo,
dataverse,pangaea,iso19139,iso19115-3}.ts`, `src/core/checks/licence.ts` (the same analysis mapped
to `LIC-*` findings for `/check` and `/collection`), `src/core/rules/licence.ts`.*

---

## 7. `/collection` Collection review

> **At a glance**
> - **Does:** runs the licence and metadata rules over a whole DOI list, DataCite repository,
>   Zenodo community or CSW catalogue, pausably, and gives counts, examples and a CSV fix list.
> - **Input:** a pasted DOI list, a DataCite client or prefix, a Zenodo community, or a catalogue
>   from a closed list.
> - **Output:** counts per rule, up to 50 examples per rule, a fix-list CSV.
> - **Leaves the browser:** requests to DataCite and Zenodo (direct) and to catalogues (through
>   `/api/csw`); progress is stored in your IndexedDB only. See 2.

### Purpose

Run the **licence and metadata** rules over a whole collection (a pasted DOI list, a DataCite
repository, a Zenodo community, or a GeoNetwork CSW catalogue) and return counts per problem,
a few examples of each, and a **CSV fix list**. Only metadata is read, never data files. A quick
sample is labelled as a sample everywhere; the page states that nothing in it ranks or compares
institutions.

### Inputs (`SourceSpec`, `src/core/collection/types.ts`)

- **DOI list**: a pasted list. Tokens that are not DOIs are counted (`invalidTokens`); a DOI
  repeated **anywhere** in the list counts once (`duplicatesInBatch`).
- **DataCite repository**: by client id or by DOI prefix.
- **Zenodo community**: by slug.
- **CSW catalogue**: one of the closed list in `config/catalogues.ts` (an id, not an address), with
  a schema (ISO 19139 or 19115-3 where the catalogue offers it) and an optional **DataCite
  cross-check** (default on).

### Pipeline

1. **Estimate** (`estimate`): one or two requests give the record count and a time estimate. For
   Zenodo above `ZENODO_SAMPLE_FIRST` (50 000) records it recommends the quick sample first. For a
   CSW catalogue the adapter confirms that the catalogue answers and offers the schema asked for
   (GetCapabilities) and reads its claimed record count (GetRecords with one record).
2. **Run** (`CollectionRunner`, `src/core/collection/runner.ts`, in `collection.worker.ts`). A run
   is a loop over **pages** supplied by a source adapter (a `Pager`: `initial`, `fetch`, `skip`,
   `expected`), with a **checkpoint after every page**. Only a record that was **read** meets the
   rules (`RecordState`: `checked`, `unreachable`, `throttled`, `unsupported-profile`,
   `not-in-datacite`; the unread ones are counted and sampled but get no finding, whatever they
   lack). One record the rules cannot take is counted as not read and does not end a run of
   thousands.
3. **Rules** (`evaluateItem`, `fixlist.ts`): `checkLicence` with the collection flag, i.e. the
   `LIC-*` rules plus `META-EMPTY-LINK`, `META-NO-VERSION` and `META-NO-EXTENT`, exactly as on
   `/check`, but worded without reference to the `/check` table. A failed DataCite comparison is
   not an unread record: the catalogue record is judged on its own (`LIC-MISSING` with a note that
   DataCite was not compared).
4. **What is kept** is bounded by construction: counters, at most `SAMPLES_PER_RULE` (50)
   examples per rule, the cursor, small plans, and the fix list in parts of about
   `CSV_PART_CHARS` (1 million characters). Nothing grows with the number of records.

### The sources, as the adapters walk them

| Source | How it is walked (`src/core/collection/sources/`) |
|---|---|
| DOI list | `DATACITE_BATCH` (100) DOIs per request through `ids=`. A DOI DataCite does not know is `not-in-datacite` (nothing was unreachable, there is just no record). |
| DataCite client / prefix | Cursor paging, `DATACITE_PAGE` (1000) per page, restricted to the fields the rules need (`DATACITE_FIELDS`); `links.next` is followed verbatim after checking it is DataCite's own `/dois` listing over https; a page that restarts at the beginning (DataCite answers a bogus cursor with page 1) is detected so the run cannot loop. Quick sample: `random=true` pages of `DATACITE_SAMPLE_PAGE` (100), up to `DATACITE_SAMPLE_REQUESTS` (30) requests. |
| Zenodo community | `/api/communities/{slug}/records` (the `communities=` filter on `/api/records` ignores an unknown slug and would return everything). 25 records a page (`ZENODO_PAGE`); a window of `ZENODO_WINDOW` (10 000) means a larger community is split by publication date (year, then month, then day slices) and each slice is paged; slices are counted **as the run goes**, so records appear at once and a closed tab resumes mid-planning. Records dated only to a year or month that no finer slice holds are covered by a **remainder** slice. One day above the window cannot be listed and is capped, and the run says so. Sample: `ZENODO_SAMPLE_REQUESTS` (28). |
| CSW catalogue | Through `POST /api/csw`, `CSW_PAGE` (25) records a page; the page size shrinks for big records (target `CSW_TARGET_CHARS`, never below `CSW_MIN_PAGE` 10) and steps back up after `CSW_RELAX_AFTER` good pages, never to a size that was too large. The catalogue's own answer is **not trusted**: the total may be wrong and a page past the end may be HTTP 200 with an exception report, `nextRecord` may skip or stall. The walk follows `nextRecord`, stops on `0`, an empty page or an exception past the end, never goes backwards, and **says when what it got differs from what the catalogue claimed**. The DOI used for the DataCite cross-check is the DOI of **this** record only (its own citation identifiers, or a record-level `dataSetURI` / `metadataLinkage` that is a `doi.org` link), never one from lineage, another citation or elsewhere in the record. |

### Politeness, retries and stopping

- **Pacing** between request starts per host (`PACE_MS`, `net.ts`): DataCite 1000 ms, Zenodo
  2100 ms (guests: 30 requests a minute with a margin), CSW 3200 ms (the site's own limit is 20 a
  minute, so a normal run never meets it); the server paces per catalogue host on top (section
  10).
- **Retry policy** (`BACKOFF`): 429 and 503 back off (DataCite's "queue full" is an HTML 503); up
  to 5 attempts when throttled and 3 when unreachable; a `Retry-After` above 120 s is not waited
  out inside a request (the page is deferred). What is left is a `SourceFailure`, which the run
  turns into a **deferred page**, never into a licence or metadata finding.
- A page that fails is deferred (up to `MAX_DEFERRED`, 200), the cursor moves past it, and
  deferred pages are retried at the end after `RETRY_COOLDOWN_MS` (20 s) and on resume. After
  `CONSECUTIVE_FAILURES` (3) failing pages in a row the run stops and waits for the visitor.
  A `protocol` or `not-found` failure stops the run immediately. A spent daily budget of the
  connection leaves the run interrupted and resumable.
- **One tab at a time** may run a saved run (Web Locks, `RUN_LOCK`); another tab sees a refusal.
- Run states: `idle preparing running paused stopped interrupted finished failed`. A run closed
  with the tab is `interrupted` on the next visit and can be resumed from its checkpoint.
- A run that ends with unread pages, or with records its source announced but did not deliver,
  is "finished" but **not complete**: it says so in a notice that no cap can drop and in the last
  row of the fix list (a marker row, `RUN-INCOMPLETE`, written by `gapRow`; it is not a rule of the registry). An unfinished fix list also carries a last row
  saying why it stops.

### Outputs

- **Counts** per record state and per rule (worst first), the records read, those with at least
  one finding, the DataCite cross-check counters, notices.
- **Examples**: up to 50 per rule, paged; a DOI example has a **"Check its data files"** button
  that runs the `/check` pipeline on that DOI in a separate worker with the proposed column layout
  (browser mode only: the server is not used).
- **Fix list CSV** (`FIX_LIST_COLUMNS`): `record, field, rule_id, severity, problem,
  suggested_fix, source`, in the language chosen for the run, with the formula guard on every text
  field. `suggested_fix` holds a concrete value only where the rule has one (the licence to state,
  for `LIC-FREE-TEXT` and `LIC-DATACITE-EMPTY`). It can be downloaded as one Blob built from the
  stored parts, or streamed into a file the visitor picked (File System Access API), so memory
  stays at one part.

### Storage

The saved run (settings, counters, cursor, deferred pages, samples, notices, CSV parts) is kept in
the browser's **IndexedDB**, one saved run at a time (`idbStore`, `store.ts`). The pasted DOI list
is kept apart (`RunStore.saveText`), never inside a checkpoint or a progress message. "Delete all
saved progress" removes everything. Nothing about a run is sent to the site's server apart from
the catalogue requests.

### Limits and known gaps

- Only metadata and only the licence/metadata rules; no row or data checks.
- A catalogue that is not on the closed list cannot be read; adding one is a change to
  `config/catalogues.ts` and to the privacy page, which renders the list.
- Zenodo: records beyond one day's window cannot be listed; the community must exist.
- The server's daily budgets and in-memory counters are per server instance.

### Network calls and opt-ins

DataCite and Zenodo directly from the browser, catalogues through `POST /api/csw` (2, 10). No
opt-in; no analytics events of its own.

*Code: `src/app/pages/CollectionPage.tsx`, `src/worker/collection.{worker,handler,client,
protocol}.ts`, `src/core/collection/{runner,net,fixlist,stop,store,types}.ts`,
`src/core/collection/sources/{dois,datacite,zenodo,csw,cswsplit}.ts`, `config/catalogues.ts`,
`server/csw.ts`.*

---

## 8. `/convert` Darwin Core converter

> **At a glance**
> - **Does:** turns a marine biologist's spreadsheet (species counts, optionally CTD or bottle
>   data) into a Darwin Core Archive for OBIS: `event.txt`, `occurrence.txt`,
>   `extendedmeasurementorfact.txt`, `meta.xml`, `eml.xml`, zipped.
> - **Input:** dropped files only (tables, PANGAEA textfiles, metadata files, a companion file); no
>   links.
> - **Output:** one `.zip` made in the browser; a one-time proposed sample-code CSV when needed;
>   a companion file that remembers the choices.
> - **Leaves the browser:** nothing from the files. Two opt-in lookups can send taxon names (WoRMS)
>   or a typed search word (NVS) directly to those services, only after a button press. Analytics
>   events (counts and flags) only after consent. See 2.

### Purpose

Writing an OBIS-ready archive by hand is slow and error-prone. The converter reads a sheet the way
the checker does, asks the user to confirm what each column means and what the numbers mean, builds
the event hierarchy, writes the three tables and the EML, runs the same Darwin Core and row checks
that `/check` runs on archives over its **own output**, and refuses to write while anything blocks.
It never defaults a licence or a basis of record, never invents an identifier for a sample, and
never writes a vocabulary identifier for a measured variable that the user did not confirm, apart from the type and unit codes on its short verified list
that belong to the roles the user declared (for example `OCOUNT01` for a count, `VOLWBSMP` for a sampled volume, the unit `MCUB` for cubic metres).

### Inputs

Dropped files with the same accepted extensions as `/check` (`InputPanel` with `withLink={false}`,
read by `src/worker/convert.handler.ts`):

- **Data sheets**: CSV/TSV/text, workbooks (each sheet is its own table), PANGAEA textfiles. The
  file is parsed by `parseFile` (3.1) and then passes `readConvertFile`, which takes the
  spreadsheet **formula guard** (`'=x`) off every text cell and header so that the one-time code
  proposal CSV round-trips.
- **Metadata files** (ISO, DataCite, Zenodo; a PANGAEA file's own header too): never data; they
  pre-fill the description of the dataset (8.7).
- **`eml.xml` / `meta.xml` of an archive**: recognised by content in the first 4 KB
  (`archiveDescriptorKind`), listed and not read.
- **A companion file** of an earlier run (same sidecar format as `/check`): its settings pre-tick
  boxes **only**, for this drop (8.9).
- **Data-dictionary sheets** (a glossary or notes of a workbook) start **unticked** with a note
  (`dictionary.ts`): a sheet named Metadata, README, Info, Description, Dictionary, Legend,
  Notes, Codebook or About without any position, or a sheet with a column naming the described
  column next to one that explains it and mostly text below.

No size cap beyond what the browser holds (there is none in `src/core/convert` or the converter's worker).

### The flow (`ConvertPage`, `createConvertHandler`)

1. **Read** (worker `parse`). Files are parsed; long environmental sheets are pivoted (8.4);
   per sheet the worker proposes column roles (8.2), a **shape** suggestion (wide or long,
   `suggestConvertShape`), and a **profile** suggestion (`suggestConvertProfile`). The prefill of the
   description and any companion settings come back too.
2. **Confirm columns.** The user confirms or changes each column's role, picks the shape of each
   sheet, and ticks "convert this sheet".
3. **Declare what the numbers mean** per sheet (8.3), the cruise code if the sheet has no cruise
   column, the sampling device, and an optional mesh size.
4. **Approve taxon names** that were split (8.5).
5. **Decide the options**: full species list; prefix sample ids with the station id; flatten the
   station and/or the cruise level (8.6).
6. **Optionally** look names up in WoRMS and search NVS for measured variables (8.10).
7. **Describe the dataset** (title, abstract, creators, contact, institution code, licence, basis
   of record, optional methods and citation).
8. **Read the summary and the findings**; accept each warning rule that needs it (8.8).
9. **Export.** The worker re-computes everything from the request alone (the page's idea that
   nothing blocks is **not trusted**), refuses with a message when anything blocks or a warning is
   unaccepted or there is no event or occurrence, and otherwise writes the zip. The conversion
   follows every decision; a late answer to an earlier request is dropped.

### 8.1 Reading cells

Dates, coordinates, numbers, hemisphere letters and units are read by exactly the code of `/check`
(`metaParser`, `specsOf` in `dataset.ts`; 3.2); the converter adds no logic of its own for them.
Out-of-range values, unparseable dates, ragged rows and so on therefore arise as the same `ROW-*`
and `IN-*` findings, and the policy of 8.8 decides what blocks. A PANGAEA `Date/Time` column may
be read as UTC by the convention of that source (`whenUtc`), so a time with no zone is written
with `Z` and `ROW-TZ-UNKNOWN` is not raised; `/check` never does this.

### 8.2 Recognising columns for the converter

`proposeConvertColumns` (`src/core/convert/recognize.ts`) is an **overlay on the shared proposer**
(`proposeColumns`, 3.3), so coordinates, dates, depth, station, cruise and sample names (in four
languages) are not repeated. It adds the roles `/check` does not have (`ConverterRole`,
`src/core/types.ts`): `taxon` (with `header: true` when the column's *header* is the taxon),
`quantity`, `quantityType`, `effort`, `occurrenceId`, `lifeStage`, `replicate`, `biomass`, `qualifier`, `taxonId` (an
AphiaID column or any other ID, as given), and `depthBelowSeafloor`. It reads Darwin Core terms as
roles (`occurrenceID`, `eventID` as the sample code, `scientificName`, `individualCount`,
`organismQuantity`, `organismQuantityType`, minimum/maximum depth, `lifeStage`,
`identificationQualifier`). The role **Replicate / sub-sample** is never applied by the tool on its own, because it
changes the IDs: a column called `Frame`, `Quadrat`, `Replicate`, `Core` and so on stays ignored.
Only when IDs collide and one ignored column tells MOST of the colliding groups apart (at least 80 % of
the groups and at least two; every row of a group needs a filled, different value) does the
`CONV-ID-DUPLICATE` message name that column and the page offer a button, **Use "<column>" as
replicate / sub-sample**; the message says how many groups the column tells apart and how many
would remain (a real duplicate in the source must not hide the offer for the other 56 groups of 57).
Pressing the button is the user's confirmation. A long sheet's remaining or unexplained occurrence duplicates
are said as what they are: the same sample (and replicate) and the same taxon in N rows, to merge or tell
apart with an occurrenceID or life stage column; the station-prefix advice is for sample codes only. The role can also be chosen in the
role list at any time.

**Biomass next to a count.** On a long sheet that has a taxon column and a count / abundance
column, a column named `Biomass`, `Biomasa`, `Biomasse`, or (only as a whole name made of weight words)
`Weight`, `Wet weight`, `Dry weight`, `AFDW`, `Masa`, `Wet mass` … is proposed as the role **Biomass /
weight** (`{ kind: 'biomass', basis? }`) instead of being left out as "a second quantity column".
Each value becomes an eMoF row **of the occurrence** (`measurementType` "biomass", `measurementValue`
as written, `measurementUnit` from the header, no unit ID, never converted); the abundance stays
`organismQuantity`. The **kind of mass** decides the NERC concept, and a header that says it pre-selects
it: wet (`wet`, `fresh`, `mokra`, `Nass`) is S06 `S0600088` "Wet weight biomass", dry (`dry`, `sucha`, `Trocken`) is
`S0600087` "Dry weight biomass", ash-free dry (`AFDW`, `ash-free dry`) is `S0600086` "Ash-free dry weight
biomass" (concepts opened in the NVS on 2026-10-30; the P01 biomass concepts SDBIOL03/04/05/07/08/09 are
all per unit area or volume, so none of them says "a mass in this sample"). **There is no default**: the
role list has "Biomass / weight (kind not chosen)" and one entry per kind; until a kind is chosen no
`measurementTypeID` is written and `CONV-BIOMASS-KIND-UNSET` (warning, needs acceptance) says which
column. A sample size declared for the sheet appears only in `measurementRemarks`
(`per sample of 0.0625 m2`, column written only when used, and not when the unit is already per area or
volume); nothing is divided. `measurementUnitID` is written when the unit is g, mg, kg (P06 UGRM, MGRM,
KGXX) or a per-area / per-volume mass the rate table knows. The unit is the one of a bracket
(`Weight [g]`, `Weight (kg)`) or, when there is none, the mass unit that stands as a word of the name **read whole**
(`biomassNameUnit`): `weight_kg_total` is `kg`, `biomass_kg_km2` is `kg/km2`, `wet_weight_mg_m3` is `mg/m3`, `biomass_g/m2` is `g/m2`; a mass unit the P06 table does not know (`ug`, `lb`, `gC`) is
written as the header wrote it, without an id. The
P06 id is written only when the table knows that exact unit; a unit with none is written whole and said
(`CONV-UNIT-NO-P06`); when a mass unit is followed by words that are neither a per-area / per-volume part nor a kind of
mass, **no partial unit is written**, `measurementUnit` is empty and `CONV-BIOMASS-UNIT-UNCLEAR` says so. A header with **no unit at all** (`Biomass`, `Wet weight`, `Weight`) is the same finding in its own words: it names the column and the number of values, the unit stays empty and the warning has to be accepted. Two biomass columns of one kind (or both
with the kind open) get the column name in `measurementType`, so no two columns write the same type.
A row whose count is 0 is not converted unless the species list is declared full (CONV-ZERO-SKIPPED), and
a biomass value on such a row goes with it (the two contradict each other, so the rows are listed:
`CONV-ZERO-WITH-BIOMASS`). The companion file keeps
the kind as `biomassBasis=<wet|dry|afdw>:<sheet>` (a sheet whose biomass columns agree on one kind) and a
dropped companion pre-picks it for columns whose header leaves it open. Without a count column a
`Biomass` header is still the sheet's quantity (the kind of number is then declared as before), and on a
wide sheet or a profile sheet the role is not read and is named by `CONV-COLUMN-NOT-EXPORTED`.

**Measured variable or taxon name?** This is the central decision for a **wide** sheet, where a
species is a numeric column with the species as its header. The shared proposer calls such a
column a variable. The overlay decides on the **name part** of the header (unit and trailing
brackets cut off), in this order (`nameKind`, `convert/measured.ts`):

1. a **sample descriptor** (Replicate, Cast, Bottle, Niskin, Station no, …) is ignored;
2. a **known variable token or formula** (PN, Ntot, d15N, C/N, GPP, Chl a, …) is a variable; so is a name that carries an unambiguous **statistic word as a token of its own** (SD, st.dev., std, standard deviation, and mean, average, median, with the Polish, German and French words, diacritics folded: `summaryLabels.ts`): `Macrofauna.biomass mean/st.dev. (gDW m-2)` is never a taxon candidate (n, se, cv, min, max, sum are not in that list). With an **organism unit**, or with a binomial name before it (`Calanus hyperboreus mean [mg C/m3]`), a central statistic alone stays a taxon candidate (a species mean; reason `taxon-mean`); a spread never is, and neither is a quantity word (`Zooplankton biomass mean`);
3. a **taxon shape** is a taxon candidate: a genus-like first word of three or more letters
   (whatever follows, an epithet, `sp.`, `cf.`, a stage code such as C1-C3 or CIV-CVI, a size class
   such as `0-1 cm`, a morphospecies number), several genera joined by a slash, or an abbreviated
   genus (`C. finmarchicus`);
4. digits, a slash or colon, or a short all-caps acronym (up to five letters) is a variable;
5. anything else is unknown and the earlier reading is kept.

A unit alone never decides it, because a species column may carry a biomass or rate unit
(`[mg C/m3]`): **a taxon-shaped name is never made a variable by its unit**. Only a name that is
neither a descriptor, a known variable nor taxon-shaped (kind `unknown`, `isMeasurementUnit` in
`recognize.ts`) is made a variable by any unit that does not count organisms. The rule leans to the taxon on purpose: a false candidate costs one tick, a false
variable loses occurrences. **Taxon candidates from a wide sheet start at low confidence and must
be confirmed in bulk**; a column the user turns into a taxon by hand needs no confirmation.
Unconfirmed candidates are left out, and leaving them out has to be accepted
(the page's own acceptance, not a rule).

What the **values and the unit** rule out is decided before the name (`convert/columnValues.ts`), because they
need no list of header words, and only where no species column can look so. A column of whole years (1800-2100 within 120
years, at least 3 rows) is ignored (`year-values`) only when it is filled on every row, has no abundance unit, and its
name is not shaped like a taxon or says year (`Year`, `SampleYear`); one value that is not a whole number
(a core diameter) on every row (`constant-value`) only with no abundance unit and on a name that is not shaped like a taxon.
Blank cells defeat both rules (they are rows the rule did not see), so `Oithona similis [ind/m3]` that is 1.25 on three
rows and blank on the rest, `Calanus [ind/m3]` of 1900, 1950, 2000 and a genus column of 0.5 on every row stay candidates.
A unit written in **square** brackets that measures a length, time, speed or temperature makes the column a measured variable,
one of volume or area the sampling effort (`unit-variable`, `unit-effort`; masses and every "per" unit are not listed, and a lone
`m` on a taxon-shaped name is never metres: `Calanus (m)`, `Calanus_m`, `Calanus [m]` are males). A camel-case name is read as
its words: `CoreDiameter`, `DepthStart` (a size word in a name of several words is a measurement) and
`DepthSampleStart` / `DepthSampleEnd` are the top and bottom of a depth range. The comment of PANGAEA's `name [unit] (comment)`
reaches the depth-range, seafloor, site-depth, statistic and total tests (`Depth [m] (top)`, `(below seafloor)`, `Temp [deg C] (std dev)`,
`(total)`), and two columns that share a variable name are told apart in the measurement type by their comments (`temperature (CTD)`,
`temperature (bottle)`). A column of Latin binomials (`latinNameShare`: at least 80 % of at least 3 cells, three different, start with a genus and an
epithet that ends like a Latin one) is offered as the taxon of the sheet (`values-latin-names`), **always at low confidence and only when the
sheet is long by its other columns**: a quantity or a biomass named by its header stands beside it and the sheet has no species columns of its own (one binomial header, or two genus-shaped numeric columns that are no code, identifier or word of the sampling, make it wide: `Dominant species` beside `Abundance`, `Calanus`, `Oithona` stays wide; one `species_code`, `Mesh` or `Transect` does not veto), or a single
column counted in individuals does and no genus-shaped numeric column does (several columns in `[#]` are species), it is no Darwin Core term and the sheet is not a table of
numbered columns; two such columns are not told apart, the leftmost is offered. A header that holds `AphiaID`, `aphia_id` or
`Aphia ID` whole, also inside a bracket, over whole numbers is the taxon ID; on a long sheet a numeric column whose
unit only counts individuals (`#`, `n`, `ind`) and that no name made a quantity is offered as the quantity
(`count-unit-quantity`; a descriptor of the sample such as `Hauls [#]` or `Replicates [n]` is never the count). `Calanus`, `Acartia` and every other genus name stay candidates unless the cells show a year column, a constant fraction or a length unit as above.

Two more value vetoes run last and apply to **every sheet shape** (`convert/recognize.ts`, `year-beside-date` and `running-number`; removal only, never another role). A column the proposer made a measured
variable (a name no vocabulary knows, no unit, no P01 code) becomes `ignore` (low confidence) when (a) the sheet has a date or date-time column and, on every row where both are filled (at least 3 rows), the cell is a
whole year equal to the year of that row's date (so a year class, an age or a measurement that merely lies in 1800-2100 keeps its role), or (b) every filled cell is a whole number of six or more digits that is different on
every row and strictly rises (or strictly falls) in row order, or that is equal only between rows of one sample, each sample holding one value that no other sample holds and the samples' values strictly rising (or falling) in
the order the samples first appear (a sample number written on every taxon row; a flowmeter reading, a sequencing depth or a cell count in arbitrary order is none). (b) never applies on a long sheet with a taxon column and no
quantity or biomass column: its number column may be the counts, and the block stays CONV-TAXON-NO-QUANTITY. A count of five digits, a value shared by two samples, a year column on a sheet with no date column, and a wide
sheet's taxon candidates are as before; the first 500 rows are read. Such a column is named by `CONV-COLUMN-IGNORED` and, with the reason, by `CONV-COLUMN-YEAR-IGNORED` (information) or `CONV-COLUMN-NUMBER-IGNORED` (warning,
accepted once, as CONV-COLUMN-NOT-EXPORTED), once per sheet (`convert/vetoedNumbers.ts`); the finding carries a "Read it as a measurement" button per column (keyed by column index) that gives back the role the column had
(the page's `readAsMeasurement`). A column the person has changed is not listed again; the answer is not kept in the companion file, so a re-upload asks again. When the sheet has no date column and every value of a vetoed number column reads as a valid date written YYYYMMDD, the finding and the reason add a hint (count forms, 4 languages) to give the column the meaning date in the column table; nothing is assigned. /check is unchanged.

Other overlay decisions: a **summary column** (a header starting with or holding Total, Suma,
Razem, Summe, Gesamt, Somme, Sum, Σ) starts **ignored**, because converting it would count the
same individuals twice (`Totalia sp.` is a genus and stays). On a **long** sheet the name is not the
last word: an all-taxa total repeats one value on every row of a sample, so the values are compared
(`valuesRepeatWithinSample`: the rows are grouped by the columns with a sample role and by any still
ignored or variable column of few distinct values that is not a function of the taxon, such as a tow number, numeric or not). A column whose values
differ between the rows of a sample is not a total: it gets a visible low-confidence proposal (a
biomass measurement of each occurrence when a mass unit stands in its name; else the quantity of each row
when the sheet has none and the name says no size and the unit counts organisms ('Total length [mm]', 'Total depth' are not quantities); else it stays ignored, with a reason that says what to decide). The same judgement applies to a column the name already claimed as biomass ('Total weight (kg)'): constant within a sample, it is a total and starts ignored, with its own reason
(`summary-total-biomass`, `summary-total-quantity`, `summary-total-varies`). A column that is an **attribute of the taxon** (a function of the taxon column: every taxon listed more than once has one value in it, at least two values overall,
not constant inside the samples) is ignored with its reason (`taxon-attribute`) and said once (`CONV-TAXON-ATTRIBUTE-IGNORED` lists the columns), never written as a measurement, but only when it has
**no unit and no size word** and either its name says code, id, tsn, key, serial or trophic, or at least half of the taxa (and at least three) are listed more than once: a length, a cover or a content
that happens to be the same for the repeated taxa is a measurement and its conflict stays visible. A **descriptor of the sample on a long sheet** (`Replicate`, `Rep`, `Tow`, `Haul`, `Cast`) is not a
variable: one that says replicate, over a sample code that does NOT tell its rows apart (the same code has several values), is proposed as the **replicate role** at low confidence, only when every value of the column holds at least two rows
(`replicate-name`: each value is an event under the sample; `CONV-REPLICATE-EVENTS` names the column and the number of events it makes; the plural `Replicates` stays a variable); every other one is ignored (`sample-descriptor`). Where the code already separates the rows a replicate column is never proposed as a role, so
the event IDs of a sheet with unique codes are those of the sheet without the column; the button of the role stays the way to use it. A measured variable that is not a recognised one is moved to the
**occurrence** of its row (like a biomass: `perOccurrence`, `value-per-occurrence`, and one info finding `CONV-VALUE-PER-OCCURRENCE` that lists the columns) only as the size of an organism, by a **positive list**
(`isOrganismSizeHeader`): a bare `length`, `width`, `height`, `size` or `diameter`; one of them behind `total`, `fork`, `standard`, `body`, `shell`, `carapace`, `prosome` or `mean`; or `TL`, `FL`, `SL`, `L1 ... L10`;
with a length unit (µm, mm, cm, m) or none; on a long sheet that has a quantity or a biomass; when its values differ between the rows of a sample and at least half of the values inside the samples are different
(a length of each organism is nearly never repeated). `Sieve size`, `Filter pore size`, `Beam width`, `Layer thickness`, `Particle size`, `Rainfall`, `Transparency`, `Bag length`, `Frame size`, `Mesh size [µm]`,
`Height above bottom [m]` and every noisy measurement therefore keep blocking as `CONV-SAMPLE-CONFLICT`; `L1 ... L10 (µm)`, `Mean Length (µm)`, `TL`, `Prosome length` and a varying `Total length [mm]` move. The same
value on all rows of a sample is a variable of the sample event (`size-variable`, low confidence, when the name says total and the unit counts no organisms and no mass). `CONV-SAMPLE-CONFLICT` lists what differs
in the reader's language, names the column, and offers the tick for a measured column that is no descriptor of the sample. The role of a variable carries the tick "of each organism" on a **long** sheet (hidden on a wide
one; a tick that arrives on a wide sheet from a proposal or a companion file writes the column as a variable of the sample, it is not dropped); the companion file keeps what differs from the proposal
(`perOccurrence=on|off:<sheet>:<column>`, a pre-pick on a re-upload; a sheet name with a colon is not saved). A recognised variable (temperature, salinity ...) and a descriptor of the sample are never moved. The
occurrence rows get the same identifiers, prompts (`CONV-NERC-UNKNOWN`, `CONV-UNIT-NO-P06`) and picks as the event rows. The decision is taken from the sample columns the proposal sees; a column the user later
makes the sample code is not seen by it, so check the tick then. A `species_code` on a sheet with one sample blocks as before. `Total depth` is the water
depth of the site (`isSiteDepthName`, like `Total water depth`): the depth of the rows when no other column gives one, otherwise not written. With no sample column, or only one row per sample, nothing can be judged and it stays ignored; a **quality-flag** column
(`QV:ODV:…`, `Q_`/`QC_`/`QF_` prefixes, `_QC`/`_flag` suffixes, and `Q`/`QC`/`QF` + a space or
hyphen + the name of a sibling column) is never a measurement or a taxon (`isQualityHeader`); a
column of presence marks (`+`, `x`) next to counts is a species column too; a column in
**decibars** is a pressure (an upper-case-B `dB` is a decibel and is never read as a pressure); oxygen as a
percentage is **saturation**, a variable of its own with no concentration concept; a header may
declare a P01 code (`SDN:P01::CODE`), which is offered as "declared by the file" and written only
after the user confirms it; a plain `Area` on a sheet without taxon, quantity or occurrence id is a
place name, not an effort; with several depth-like columns the column giving the depth of each row
wins over the site's water depth (a sediment sheet is the exception); the depth below the seafloor
of a sediment or porewater sheet is read from the data (a majority of negative numbers means the
column counts upwards from the seafloor, shown as a proposal).

**Wide or long.** A taxon column without `header: true` means a **long** sheet (one row per
taxon and sample, with a taxon column and a quantity column); taxon columns with `header: true`
mean a **wide** one; neither: the user picks.

### 8.3 What the numbers mean

The user declares, **per sheet**, the kind of quantity (`resolveQuantity`, `convert/quantity.ts`):

| Kind | What is written |
|---|---|
| count | `individualCount` (a whole number), `organismQuantity` with `organismQuantityType` "individuals", and an eMoF row `OCOUNT01` (no unit id). |
| density | an eMoF row on the occurrence: `SDBIOL01` (per volume of water) or `SDBIOL02` (per area of the bed) with the declared unit and its P06 unit id when verified. |
| biomass | an eMoF row on the occurrence by basis (wet, dry or ash-free dry weight) and per volume or area (`SDBIOL03`, `04`, `05`, `07`, `08`, `09`); per area the user **must** say whether water column or bed (there is no default, and only the bed has a verified concept). |
| effort | `sampleSizeValue` and `sampleSizeUnit` on the sample event plus an eMoF row `VOLWBSMP` (volume) or `AREABEDS` (area): one value for every sample, or a column with the `effort` role. |

**Nothing is converted**: the unit is written as declared. The declared unit is read for its
numerator and denominator (`parseRateUnit`); a unit that does not fit the kind (grams for a density,
individuals for a biomass) is **not an error**: it is simply not parsed, so no P06 id is found
(`CONV-UNIT-NO-P06`, a warning to accept) and the user has to say per volume or per area
(`resolveQuantity` reports what is missing). A typed sample size is accepted as a number above
zero with at most one decimal mark; ambiguous forms (`1,234`, `12.345`, `1.234,5`) are refused
(`CONV-EFFORT-VALUE-INVALID`) because they could be a thousands separator. A missing or incomplete
declaration blocks (`CONV-QUANTITY-UNDECLARED`). `P06/UCNT` is **not** used for counts: its
definition is an echo-intensity unit of an instrument, so a count carries no unit id.

### 8.4 Long and transposed layouts

- **A long biology sheet** (taxon column and quantity column) is read as it is.
- **A long environmental sheet** (one row per measured parameter: a parameter column, a value
  column, optionally a unit column) is **pivoted** to one row per sample, in the worker, before
  anything else sees it (`pivotConvertFile`, `convert/pivot.ts`). It is read as one only when:
  (a) the headers name a parameter column and a value column from the strict lists (`LONG_PARAMETER`,
  `LONG_VALUE`, `LONG_UNIT`, in four languages); (b) the converter's own proposal has no taxon, quantity,
  occurrence-id or measured-variable column besides them; (c) the parameter column has at least two
  distinct values; (d) there are at most `MAX_PAIRS` (200) distinct (parameter, unit) pairs. When (a)
  and (b) hold and (c) or (d) fails, nothing is read and `CONV-LONG-UNSUPPORTED` blocks with the reason.
  The pivoted sheet has one column per (parameter, unit) pair, headed `<parameter> [<unit>]`; the key
  of a row is **every column that is not the parameter, unit, value or a quality flag**; **nothing is
  summed, averaged or chosen**: a second row for the same sample and pair is not merged, it blocks
  (`CONV-LONG-DUPLICATE`), as do rows with a value and no parameter name (`CONV-LONG-NO-PARAMETER`).
  Flag columns and flag parameters are left out and said (`CONV-LONG-FLAG-COLUMNS`,
  `CONV-LONG-FLAG-PARAMETERS`). Rows that share every position and identity column but differ in
  another key column are read as separate samples with a warning, and the user may mark such a
  column as describing the measurement (`CONV-LONG-KEY-VARIES`). The user can switch any pivot
  off and read the sheet as a normal table (`pivotChoice`, `longAsTable`).
- **Transposed** sheets: the converter reads each sheet as one table and joins none unless the person confirms a join (8.11); a header with
  no name for a column is `CONV-COLUMN-UNNAMED` (blocks until the variable has a name or the
  column is ignored). A table turned the wrong way is detected by `transposedSheetReason`
  (`convert/transposed.ts`): **variables in rows** is exactly `/check`'s detection
  (`transposedReason`, `recognize/layout.ts`: the first column holds known column names, the other
  headers none, the cells are numbers), and **species in rows** is the converter's own addition (at
  least three Latin names make up 60 % or more of the first column, the other headers are sample
  codes and at most one in five reads as a species, 80 % of the cells are numbers or presence marks;
  a header over the first column that is a known role such as a station disqualifies it; so does any
  other column that has a structural role in the converter's own reading, such as a quantity, a
  code, a date or a station, or a header with a unit, which makes it a long species sheet). `/check`
  only reports such a sheet and cannot read it, so the converter does the same: nothing of the sheet
  is read, `CONV-SHEET-TRANSPOSED` blocks with the reason in four languages and says to transpose
  the table in the spreadsheet, and a tick next to the sheet (**Read this sheet as a normal table**,
  `readAsTable`, kept in the companion file as `transposedAsTable=<sheet>`) reads it as it stands.
  Not tested: a pivot of a long sheet, a profile sheet, a data-dictionary sheet (the page does not
  offer the tick there), a sheet with the tick. A normal wide species sheet (species are the
  headers) is the standard input and is never flagged. A sample column whose header the tool takes
  for a column name (`Station A`) hides a transposed species table from the test: it is then read as
  it stands.

### 8.5 Taxon names, splits and WoRMS

`splitTaxon` (`convert/taxon.ts`) splits a taxon header or cell into Darwin Core terms; the exact
text always stays in `verbatimIdentification`:

| Text | scientificName | other |
|---|---|---|
| `Pseudocalanus sp.` | `Pseudocalanus` | `identificationQualifier` "sp." |
| `Calanus cf. glacialis` | `Calanus glacialis` | qualifier "cf." |
| `Augaptilus glacialis, c2` | `Augaptilus glacialis` | `lifeStage` "C2" |
| `Oithona similis CIV` | `Oithona similis` | `lifeStage` "C4" |
| `Metridia longa, f` | `Metridia longa` | `sex` "female" |

(`f`/`m` are read as a sex only after a comma or straight after a stage or `?`; `f.` before an
epithet is a *forma* and stays; stage words and ranges such as `c1-c5` are recognised.) The qualifier
convention follows the OBIS Manual (the lowest accurate name in `scientificName`, the doubt in
`identificationQualifier`); that `sp.`/`spp.` go to the qualifier is the converter's own convention.
**Every distinct split that changed something is a decision the user approves** (a table with an
"approve all shown" for names without doubt; a name whose leftover is not plausibly Latin (digits,
a slash, a `?`, a one-letter word, a sex marker at the end, more than three words, a remark after a
comma, or a word of letters joined by underscores such as `Genus_species`, `Genus_sp.`, `Pseudo-nitzschia_seriata` or `Genus species_CV` (every word is judged: a first word that starts with a capital, and any later word that does not, such as `finmarchicus_CV`, `finmarchicus_cv`, `finmarchicus_f` or `cf._glacialis`; a part may end in a dot or hold an inner hyphen; a later word that starts with a capital, such as an author part `Smith_Jones`, is not asked), which is kept
exactly as written and never rewritten; an all-lower-case first word such as `genus_species` is not asked as an underscore name, and a code with a digit such as `SP_01` is asked for its digit, not for the underscore; "Write with a space" is offered only where the spaced text is a plain name (a capitalised genus, up to two lower-case words) plus at most a qualifier) needs its own action). An undecided split blocks (`CONV-SPLIT-UNDECIDED`). The user can edit
any split.
The same view rule as on /check applies to the page's lists of examples: a line-range list in a question or a note shows its first 5 behind "Show all N lines" when it holds more than 10 ranges (`CollapsibleList.tsx`; the button stands after the whole sentence, and a "... (+n)" count of lines not listed is said after it). The event-tree examples (at most 17) stay open. The counts and the decision buttons of a question are never inside it, and print shows the sentence whole.
A list whose items a group button acts on (the doubted names by reason, the sex-letter group, the underscore group) stays open always: the person sees what one click changes.
Lists of controls the person fills in (the taxon-candidate boxes, the split table, the key columns) and the ledger's column lists keep their own cap and button.

**WoRMS identifiers are written only from the sheet or from the opt-in** (`scientificNameID`): an
AphiaID column becomes `urn:lsid:marinespecies.org:taxname:<AphiaID>`, any other taxon id column is
written as given, and a name with a sheet id on any row is never sent to WoRMS. The WoRMS rules
(8.10) decide the rest. The LSID of the **matched record itself** is written, even when that record
is an unaccepted name (the OBIS Manual says the LSID must match the name in `scientificName`, not
the accepted name).

### 8.6 Events and identifiers

The event tree is **cruise → station → sample** (`buildEventTree`, `convert/events.ts`), with an
optional **profile level** under a station and, for a sheet with a **replicate column**, a
**replicate** level under each sample: **cruise → station → sample → replicate**. A row then belongs
to the replicate `<sample eventID>:<replicate value>` (`eventType` `replicate`, `parentEventID` = the
sample); its species records, measurements, effort and its own date, position and depth hang on the
replicate, and the occurrence IDs are `<replicate eventID>:<taxon>`. The sample has no row of its
own, so it is **derived from its replicates** exactly like a station (date interval, midpoint
position with its uncertainty, depth range). A row with no value in the replicate column is not
converted (`CONV-REPLICATE-MISSING`, blocking); the same replicate twice in one sample is still a
duplicate. A sheet without the role is unchanged (unique sample codes keep their IDs, with or without a replicate column). When the role is not set and the rows that
collide differ in exactly one ignored column (measurements and quantities do not count: they are
expected to differ), `CONV-ID-DUPLICATE` names that column and advises the role instead of "change a
code" (the button above applies it).

- **Identifiers** (`convert/ids.ts`): sample `eventID` = the user's own sample code (optionally
  prefixed with the station's `eventID` when codes repeat between stations); station `eventID` =
  `cruise:station` (the station code alone with no cruise); cruise `eventID` = the cruise code.
  `occurrenceID` of a wide sheet is `<sample eventID>:<taxon name of the column>`, where the name is
  the header without its unit and remark (or a PANGAEA parameter's long name), with the remark or
  header added only to tell apart two columns of the same name (`taxonColumnNames`,
  `convert/headers.ts`); of a long sheet the
  user's occurrence-id column, else `<sample eventID>:<exact taxon cell>` plus the life-stage column
  when there is one. **A sample's id is never derived from depth, row order or a WoRMS name** (one exception below: a
  code reused on every visit of a station). The
  only generated codes are a **one-time proposal** (`proposeSampleCodes`: the sheet as a CSV with a
  new code column last, for the user to check and drop again). **The first way, on the page: the person picks the columns that make a sample**
  (`SampleKeyPicker`, `core/convert/sampleKey.ts`; shown under the heading of the sample codes for a sheet that has rows without a code, and kept while a key is in use). Nothing is ticked, proposed or changed for
  the person (no role is changed by the existence of the feature; a ticked column that was `ignore` is read as `keyPart` in the conversion only, and the table of roles still shows what the person set). The ticked columns are
  a draft: the page asks the worker (`previewKey`) what they would make, and the answer is the converter's own `SheetKeyReport` (samples, rows, rows per sample, rows with no key, rows with an empty part,
  rows whose ID is too long) from the same run the export is (`previewSampleKey`, `ConvertResult.keys`), so the preview and the archive cannot count differently; "Use this key" is the only thing that puts it in the request
  (`ConvertSheetRequest.sampleKey`, `ConvertSheetInput.sampleKey`). The sample's eventID is then a name, then the values of the columns in the order ticked, joined with `|` (a `|`, `\`, tab and line break inside a
  value are written `\|`, `\\`, `\t`, `\n`, so different keys never give one ID): it depends on the values and never on the order of the rows. A value is trimmed and in Unicode form NFC, `1` and `1.0` are one value (a typed number is compared as a number; a text is a number only as an integer with an all-zero fraction: `1.1` and `1.10`, `1e1` and `10` stay two; a text with a leading zero, or with 16 digits or more, stays text), a date cell goes through the date reader (a serial and the same date as text are one sample, a 1904 workbook is read right), an empty cell, NA, nan and a dash are
  empty. An empty part is part of the key: those rows are samples of their own, said in `CONV-KEY-PART-BLANK` (a warning to accept); a row empty in every part has no sample (`CONV-SAMPLE-CODE-MISSING`, blocks); an ID written to the archive (sample, replicate or occurrence) over 255
  characters blocks (`CONV-KEY-TOO-LONG`, which names the longest). The name in front of every ID is shown at the picker and can be changed; by default it is the sheet's name for a workbook and the file's name without its extension for a table file, and the companion file keeps what was used (`sampleKeyPrefix=<sheet>:<hashes>:<rows>:<name>`, tied to the key line), so a renamed file keeps its IDs. A saved key goes to the sheet of the same name first; a renamed table file (its sheet is called after the file) gets one only when exactly one saved table-file key fits it by columns and rows and no other file of the drop fits that key too, otherwise none is applied and the picker says that several saved keys fit; a workbook entry and a table-file entry never match by columns alone. Sheets with different names never make the same ID and no ID is the ID of a station or a cruise; two sheets with the same name and values are blocked by `CONV-ID-DUPLICATE`, whose advice says to give one of them another name; whether two sheets hold the same samples is asked only as a proposal to join them (8.11); nothing joins until the person confirms. A text is read as a number only with the file's own decimal separator (`1,000` in a file with a decimal point is a thousand and stays text); a key column where a typed number and a text read as the same number but give different codes (typed `1.5`, text `1.50`) raises `CONV-KEY-MIXED-NUMBERS` (accept), naming the pair. The visit and station-prefix guesses are not applied to a key; the repeated-total, exact-copy and statistic-row checks read the key columns (a size-class total repeated on
  a haul's rows is taken once with the key alone). `CONV-KEY-PICKED` (information, with "Ask again") says the key, the samples and the rows. The companion file keeps `sampleKey=<sheet>:<hashes>:<rows>`: one 8-digit hash of the folded header
  per key column (case, spacing and underscores do not matter; `.<n>of<m>` tells equal columns apart) and the number of rows of the sheet the pick was made for, never a header. On a later drop it is applied only when every column is
  found again and the sheet has the same number of rows, and then it is said as read from the companion file, with "Ask again"; otherwise the question is open. The code file stays as the second way. **A wide sheet** gets one code per row
  (`<station>-<n>`). **A long sheet** (a row is a taxon) gets **one code per sample**: the rows are grouped
  by the columns that define a sample, read from the mapped roles (cruise, station, date and time, depth,
  replicate; the position when nothing else is mapped, and **also when the key has no station and positions differ
  inside a group**, because rows of one sample that disagree on position block the conversion; with a station, a typed
  position in one row is left to the station checks). Numbers are compared as numbers (`10` and
  `10.0` are one depth). While a taxon still repeats inside a group, one more column is added **by itself only when
  its whole name says cast, haul, tow, net, replicate or deployment** (with a number or an id marker: `Cast_no`,
  `TowNo`; `Tow_notes`, `Net_comment` and `Haul_flag` are not event columns) and it at least halves the repeats
  
  without making every row its own group. Any other column (`Sex`, `Size_class`, `Notes`, `Sorter`, `Mesh`,
  `Length_mm` ...) would split one sample into several, so it is never picked by the tool: when repeats above 1% of
  the rows remain, the proposal is refused, the columns that would remove the repeats are **named**, and the user
  picks one in the preview (`extra`; it is then said to be added because the user chose it). Picks accumulate, so two
  columns can be combined, and a button clears them.
  The page **shows the grouping before the file is offered**
  (`convert/sampleGroups.ts`): "450 samples from 53,608 rows, grouped by station + date + depth", each column
  added beyond the roles and why, the rows in which a taxon still repeats inside a group (possible replicates the key
  cannot tell apart, tolerated up to 1%), the rows with an empty cell in a column of the key (grouped together), and a
  warning when almost every row became a sample (a column of the key may hold a value per row). A long sheet with
  nothing to group on gets no proposal and a message saying why: merging real replicates silently is worse than
  asking for a code column. Whoever wrote the codes, the **output** of a long sheet is checked: 30 or more
  occurrences, sample events for at least 80% of them and at least half of the events sharing station, date and
  time, depth and position with another event **whose taxa differ** (a taxon seen again at the same place is another
  sample, not another row of one) is one sample split into an event per taxon row (`CONV-SAMPLE-PER-ROW`, a warning
  to accept, naming the ratio). The time is taken as written, so a time column that gives no date still tells visits apart; a
  place counts when at most half of its events AFTER THE FIRST repeat a taxon (with its life stage and sex) of an earlier one, so
  two tows of one species at one place are two samples; the check speaks only when at least 90% of the events hold exactly ONE taxon row (zeros included): a design of correct codes has a list of taxa per event (a fixed list of 8 taxa per grab, 1 to 2 taxa per core) and is not tested. The replicate value is part of the place, so with a replicate column mapped the replicates of a station are separate places. Where every event is one row with a distinct taxon (three grabs with one taxon each, museum lots, an ROV with 25 taxa), the sheet cannot be told from a sample cut into rows: the message says so ("if these are real replicates, accept this"). **More sample events than occurrences** (events made for rows that
  give none) is evidence alone, but only when the events are at least 80% of the sheet's taxon rows and the sheet has two taxa
  or more (correct codes on a sheet of mostly zeros have more events than occurrences too); a missing code blocks
  (`CONV-SAMPLE-CODE-MISSING`); a repeated id blocks (`CONV-ID-DUPLICATE`; a repeated occurrenceID it reports is not reported a second time by the output table's `DWC-OCCURRENCEID-DUPLICATE`); rows of one sample that
  disagree on date, position or depth block (`CONV-SAMPLE-CONFLICT`); rows whose sample code or
  station is exactly `total`, `suma`, `razem`, `summe`, `gesamt` or `somme` (any case,
  `SUMMARY_LABEL`, `convert/ids.ts`) are skipped and said (`CONV-SUMMARY-ROW-SKIPPED`). **Statistics
  lines** (`Mean`, `Average`, `Median`, `SD`, `StDev`, `Sum`, `Średnia`, `Mittelwert`, `Moyenne`,
  `Écart-type`, and the short `Min`, `Max`, `n`, `SE`, `CV`, `Count`; one list with `/check`,
  `core/summaryLabels.ts`) are decided by the row, not by the word alone, because a station can be
  called `Max`, `N` or `E`. The label is the whole cell of the sample-code column (also under a real
  station: `St1 | Mean | 2` is a station subtotal), or of the station column when the sample code is
  blank or a label too (a station `Max` with a real sample code is a station). A row with a date or a
  position of its own is a station and is kept silently. A row with neither is skipped and said
  (`CONV-SUMMARY-ROW-SKIPPED`) when its label is unambiguous (`Mean`, `SD`, ...) or it stands in a
  block of two or more label rows in a row that holds at least one unambiguous label (two short codes side
  by side, `N` and `SE`, `Min` and `Max`, are not a block); an unambiguous label in the sample-code
  column with a date copied down (`St1 | Mean | 2020-01-01`) is a summary row too: skipped in a block,
  else kept with the warning; a short ambiguous label (`n`, `SE`, `CV`, `Min`, `Max`,
  `Count`) on its own is **never skipped silently**: the row is kept as a sample and said
  (`CONV-SUMMARY-ROW-KEPT`, a warning to accept).
- **Visits:** a code that repeats at **one** station on rows that differ in date (then time of
  day, then depth in a wide sheet; a long sheet never splits on depth) is one sample per visit, not
  a duplicate. The fewest of date, time and depth that tell the rows apart go into the ID, in the
  shape of the profile levels: `<station eventID>:<date>[T<time>][:<depth>m]:<code>`
  (`visitLevel`, `visitQualifier`, `convert/ids.ts`; read from the data before the rows get their
  IDs, never from their order). Only the colliding codes change; every other ID is as it was, and
  the same code at two stations is still a duplicate (use the station prefix). Rows identical in
  all of these stay `CONV-ID-DUPLICATE`. A part that one row of the group has and another lacks (a
  blank date from a merged cell) tells nothing: no split, and the old blocking findings
  (`CONV-ID-DUPLICATE`, `CONV-SAMPLE-CONFLICT`) say what is wrong. A date range is a visit value by
  its text (`2020-01-01/2020-01-03`). A presence-only long sheet goes through the same logic. The ID is made of the data, so the sheet says so
  (`CONV-ID-REVISIT`, a warning to accept, listing the rows and which parts the IDs hold), which
  also catches a mistyped date. A sheet with no code column still gets the one-time code proposal.
- **Parents are derived from their children, never typed:** `eventDate` is the interval from the
  earliest start to the latest end; the position is the **midpoint of the children's bounding box**
  (across the antimeridian the box is the shortest arc of longitudes that holds every child) with
  `coordinateUncertaintyInMeters` = the greatest great-circle distance (haversine, mean Earth
  radius) from that point to a child, plus the child's own uncertainty when it is itself derived,
  **rounded up to whole metres** so the circle contains every child; the depth is the minimum of the
  children's minima and the maximum of their maxima. A sample's own position and depth are written
  as source text (a decimal comma turned into a point, nothing else).
- **Flatten** a level: the station level is dropped and each sample's `locality` holds the station
  code; the cruise level is dropped and the code goes to the dataset text (`cruiseText`).
  Identifiers never change with flattening.
- **Profile files** (CTD casts, bottle data, environmental stations): the user marks a sheet as a
  profile file (suggested when the sheet has a station, a depth or pressure, at least one named
  variable and no taxon, quantity or occurrence-id column). Every row becomes its **own event** of
  type `profile level` under its station, with minimum = maximum depth = the row's depth; its
  measured variables and pressure are eMoF rows **of that event**, never of a sample. A level's id is
  `<station eventID>:<code>` from a code column; without one, `<station>:<depth as written>m`
  (`<pressure>dbar` without a depth) **only with the user's explicit approval** for that sheet; the
  unit is part of the id (`cmbsf`/`mbsf` for a depth below the seafloor, `cmasf`/`masf` when the
  sheet counts upwards), and for a station visited on more than one date the date goes in too
  (`<station>:<YYYY-MM-DD>:<depth>m`; a row with no date then has no id). The
  profile's stations are matched to the biology stations by **exact** trimmed station text (and
  cruise when given); an unmatched station becomes its own station event with a warning
  (`CONV-PROFILE-STATION-UNMATCHED`); a matched pair farther apart than `STATION_FAR_KM` (10 km, the tool's own choice) is warned
  (`CONV-PROFILE-STATION-FAR`). Two explicit per-sheet ticks widen this: ignore a trailing cast
  number on both sides (never guessed: a base with more than one biology station is not matched),
  and, for a sheet with no station column, treat each distinct position as a station
  (`<cruise>:<lat>_<lon>` as written).
- **Sediment and porewater depth** (`convert/seafloor.ts`): the site's water depth is the plain
  depth (`minimum/maximumDepthInMeters`); the depth in the sediment is a **negative**
  `minimum`/`maximumDistanceAboveSurfaceInMeters`, as the Darwin Core and OBIS manuals describe. A
  depth in centimetres is moved to metres by shifting the decimal point **in the text** (no float,
  no rounding); any other unit of that column is refused (`CONV-SEAFLOOR-UNIT`).
- **A plain depth in another unit** (`convert/build.ts` `depthReader`, `recognize/depthUnit.ts`): the unit a
  header states is read in every form: in brackets (`Depth [km]`, `Depth (fth)`, `(ft.)`), after any separator
  (`Depth_fm`, `Depth, ft`, `Depth-ft`, `Depth/ft`, `Depth.ft`, `depth_ft_max`, `Depth feet`), before the depth
  word (`ft_depth`) or as the whole header (`Fathoms`). Converting is for
  the exact forms only: the unit ends the name, or only a bound or statistic word follows it (`Depth_ft_max`,
  `Depth_fm_mean`, `depth_ft_avg`). A unit with any other word after it (`Depth_ft_corrected`, `Depth ft sonar`,
  `Depth (ft) sonar`, `Depth_ft_1`, `depth_cm_bsf`, `Depth_km_offshore`) blocks, and the message shows what the header said;
  a unit that follows a number after `at`, `offshore` and the like (`Depth at 10 km`) is none, a number written right before the unit
  (`Depth 30 ft`, `Depth_100_ft`) is a value in the name and blocks; two different units in one name (`depth_m_ft`,
  `Depth (m or ft)`) are a conflict and block. camelCase is split (`depthFt`). It is read at the build level whoever chose the role, so a depth
  picked by hand (`Sounding (fm)`, `MaxDepth_ft`) is converted too; a unit typed on the role wins. Only a unit with
  an exact definition in metres is converted, by decimal arithmetic on the digits of the cell (international
  fathom 1.8288 with `fm fms fth ftm fathom(s)`, foot 0.3048 with `ft feet foot`, kilometre 1000), and the cell
  as written, with its unit, goes to `verbatimDepth` of the event (a station or cruise derived from converted
  samples carries the originals of its extremes and is written like its child). The user is told with
  `CONV-DEPTH-CONVERTED` (a warning to accept) naming column, factor and the first value as it is written.
  Any other unit (`cm`, `mm`, `dm`, yards, inches, miles, `f`, `dbar`, a word) blocks with `CONV-DEPTH-UNIT`;
  a centimetre depth is not converted because on a plain depth column it is usually a depth in a sediment core
  (the message points to the role "Depth below seafloor"; `depth_cm_bsf` and `Depth (cm) below seafloor` are read as that role, with the unit cm). A plain `Depth`, `Depth [m]` or `depth_m` stays metres
  with no finding, and qualifiers (`depth_mean`, `Depth_min`, `depth_from`, `Depth_flag`) are never read as
  units. `/check` reads the same unit from the header and does not judge the range of a depth in another unit
  (`ROW-DEPTH-RANGE`). `verbatimDepth` is a Darwin Core term (it is in the GBIF Event term list). The OBIS Manual's Darwin Core page
  (manual.obis.org/darwin_core.html, read 2026-11-02) does not mention it, and says that "only columns using Darwin Core terms as headers will be recognized": it is
  a standard term, written for the reader, and OBIS neither requires nor documents it.

### 8.7 Occurrences, zeros and what a cell becomes

For each taxon cell (`convert/build.ts`):

- an **empty cell** of a wide sheet makes no record; an **NA token** makes no record and is counted
  (`CONV-NA-SKIPPED`); an NA variant is reported as on `/check`. In a **long** sheet a row has a taxon, so
  a row whose quantity is empty, `NA` or `NaN` is never dropped silently: with a **biomass value above zero**
  in the same row it stays as an occurrence with status present, **no** `individualCount` or `organismQuantity`
  (the count is not made up) and its biomass measurement (`CONV-QUANTITY-BLANK-KEPT`, a warning to accept, with
  the lines); with nothing else it makes no record and is counted and listed by line (`CONV-NA-SKIPPED`
  with `rows`; it names the other quantity-named columns that are filled on those rows and says when the whole column
  is empty, so numbers that sit in another column are not missed). A row with a **number or a weight and no taxon
  name** is not converted and is said (`CONV-TAXON-EMPTY-ROW`). A **time column whose cells hold full dates while no column is
  the date** blocks when half or more of its cells do (`CONV-TIME-HOLDS-DATES`): the events would have no `eventDate` and the date in
  the file would be lost; fewer are listed by line (`CONV-TIME-SOME-DATES`, to accept). A quantity that is text (`trace`, `<1`) keeps the
  weight of its row. A measured variable does not keep a row, because it is written once per sample and says
  nothing about the taxon. Rows with a taxon = occurrences + zeros skipped + rows counted as NA
  (`stats.occurrences`, `zerosSkipped`, `naSkipped`);
- a **negative number** is not converted and blocks (`CONV-NEGATIVE-QUANTITY`);
- **zero**: not converted and counted unless the user ticked **"this is a full species list"**
  (kept only in the companion file), and then it becomes `occurrenceStatus` **absent**
  (`individualCount` 0 for counts, no measurement row); an empty or NA cell never becomes a record. A
  zero with a **biomass value above zero** in the same long row is contradictory: it is handled as the
  zero it says: **left out, never written as absent whatever the full-list tick says** (a false absence), its weight
  is not written and the rows are listed (`CONV-ZERO-WITH-BIOMASS`, a warning to accept), so neither value is kept
  silently;
- a **non-integer** in a declared count blocks (`CONV-COUNT-NOT-INTEGER`);
- a **text cell** (`+`, `x`) becomes an occurrence with status present, no quantity, and the text
  in `occurrenceRemarks`, as a warning to accept (`CONV-TEXT-IN-TAXON-CELL`);
- otherwise status **present**, with the quantity as declared in 8.3.

The same taxon twice in one event is warned (`CONV-TAXON-SAME-EVENT`). **Presence-only species
lists** (a taxon column and no quantity column) block with one finding instead of three
contradicting ones (`CONV-SPECIES-LIST-NO-COUNTS`, or `CONV-TAXON-NO-QUANTITY` when there are other
numeric columns), and the first of them **offers the way out**: the per-sheet tick **This is a list of
species found (presence only, no counts)** (`presenceOnly`, off by default, never set by the tool,
kept in the companion file as `presenceOnly=<sheet>`). OBIS requires `occurrenceStatus` and does not
require a quantity ([OBIS Manual, "How to format Occurrence tables"](https://manual.obis.org/format_occurrence.html)),
so a ticked sheet writes occurrences with status **present** and no `organismQuantity`,
`organismQuantityType` or measurement, and asks for no quantity declaration. The tick is not offered for a sheet that has a quantity column
(it has numbers, so it is not a presence list), and is not sent for one. A **long** sheet writes
one occurrence per taxon row. In a **wide** sheet a cell is a mark (`presence.ts`): `x X + * ✓ ✔ ☑`,
`1`, `yes y tak ja oui present obecny vorhanden présent` mean present; an empty cell or NA writes
nothing; `0 - – — absent nieobecny abwesend no nie nein non` mean absent **only with the
full-species-list tick** (otherwise nothing is written, said as cells marked absent, not as zeros); any other value (a number
above 1, a negative number, other text) is **not guessed**: `CONV-PRESENCE-VALUE` blocks, naming the
column, the values and the rows. The proposer takes a column of `+ x * ✓` marks for a species
column; a column of words (`yes`, `tak`) is given the species role in the role table. Unticked,
nothing changes (a text cell stays a present record with a warning, `CONV-TEXT-IN-TAXON-CELL`). A sheet with **measured variables and no taxon column, no
quantity column and no unconfirmed taxon candidate** (typically environmental data only) gets one
blocking finding too, `CONV-ENV-ONLY-SHEET`, with a link to `/check`, in place of
`CONV-NO-TAXON`, `CONV-QUANTITY-UNDECLARED` and `CONV-NO-OCCURRENCES`. Its text covers the other possibility
(a column of species names that was not recognised: mark it as the taxon); when another sheet of the
upload that is not a profile file has a taxon column, the text says to mark this sheet as a profile file
instead. A sheet marked as a profile file keeps `CONV-NO-OCCURRENCES`, and a species sheet next to an
environmental one keeps its own `CONV-NO-OCCURRENCES` text. Plain physical and optical words (activity,
fluorescence, turbidity, irradiance, transmission, attenuation, backscatter...) are measured variables,
not taxon candidates (`measured.ts`), and the column reason says so with its own text (`measured-word`:
"a physical or optical measurement word (e.g. temperature, fluorescence, turbidity)"; only temperature, salinity, conductivity, pressure, density, light and optical words, not nitrogen, oxygen, nutrients or pigments) instead of the
nutrient / pigment / isotope ratio / rate one (`measured-name`), which stays for those names.
The converter reads every header without its ODV / OPeNDAP type suffix (`Activity<String>`, `"Latitude<Float32>"`) and the quotes
around it, for kind, unit, vocabulary hints, taxon names and the text shown to the user, as `/check` does.

**A quantity written again on rows that are not new animals** (`convert/repeatedTotal.ts`). Some long sheets write the catch of a species in a haul on every row of its size classes (`s1, Solea solea, 8, 40` and `s1, Solea solea, 9, 40`). Read as it stands, the sheet's sum is the total multiplied by the number of size classes, and the old advice of `CONV-ID-DUPLICATE` (give the rows an occurrenceID or a life stage) wrote exactly those numbers. Everything is read from the **values**. Rows are grouped by the columns that say which sample it is (sample code, station, cruise, replicate, date, time, position, depth) and by taxon, life stage, qualifier and taxon ID. A column *repeats* in a group of n rows that all carry the same value v; for a count v must be at least n (a total shared by n different size classes cannot be less than n: `1,1,1` and `3,3,3,3` are not a total, and `1,2,2,1` repeats nothing; such a group is not evidence). The column that tells the rows apart has a value on every row of the group and is not an identifier of the row. Three outcomes:
- **Block** `CONV-QUANTITY-REPEATED` (error): for a column when at least **4 groups** repeat it, they are at least **50 %** of the groups that are evidence, and the repeated values are not all one number. Half is the line between the two readings that is hardest to argue with: a total repeated on size classes repeats in nearly every group of its table, counts that coincide by chance coincide in a minority; below half the tool warns (next) instead of blocking, so a genuine table is not blocked and a table with some repeated totals is not silent. An occurrenceID column does not switch the check off, and the occurrenceID advice is withheld. It names the column, the column that tells the rows apart and, when the sheet has one, a column with a count of its own on each row. Ways out: mark that count column as the quantity; the button **write one occurrence per sample and taxon, the total taken once** (`totalOnce=<sheet>` in the companion file); or the button **these are real counts** (`realCounts=<sheet>`, nothing is looked for in the sheet). Take-once acts only on the column that itself repeats. A repeated *quantity*: the first row of each group carries it, the later rows are not converted, and nothing per row is written from the first row (the size and any variable that differs within the group are listed as not written in `CONV-QUANTITY-REPEATED-ONCE`); a variable of the sample that differs within a group still gives `CONV-SAMPLE-CONFLICT`. A repeated *weight beside a count of its own on each row* (the block then says: ignore the weight column, or write it once): the counts stay on every row, and the weight is written once per group on the first row, labelled in `measurementRemarks` as the total of the taxon. A group below the threshold, or whose values differ, stays as separate rows with their own values. A group whose quantity repeats but whose other weight or count column has numbers of its own cannot be taken once and stays blocked.
- **Warning** `CONV-QUANTITY-SAME-IN-SAMPLE` (accept): everywhere else, rows of one sample and taxon with the same quantity that differ in anything (a blank size, a stage, a sex, a size that is different on every row, a code per size class) are never silent, whatever the number of groups. The text gives both sums ("written as N records, total X; if the value is the species' total, it would be Y"; the sums are rounded) and the lines, for the quantity and, when a weight repeats on those rows too, for the weight (a repeated weight beside counts of their own on each row is told the same way; the exclusion of 1 is for counts only, a density or a weight of 1 repeated on stage rows is a repeat like any other), and the duplicate-identifier finding for those rows no longer advises an occurrenceID or a life stage. The looser group of this warning leaves out replicate, life stage, qualifier and taxon ID, so marking the size as one of them does not clear it. **Rows with only the taxon** (round 2): inside a group of two or more other rows that already is a take-once group, a row whose every DIFFERING column is blank (whatever those columns are: a size, a number measured, a stage; read from the values, never from a header) is judged apart. The group is judged on its core rows, so such a row never counts for or against the repeat, whatever number it carries. After the choice "once" it is not joined to the group and not written under its occurrenceID: ledger reason `taxon-only-in-total` (kind *blocks*), one `CONV-ROW-NOT-UNDERSTOOD` question per sheet with the count of those rows, answered by "leave these out and list them" (`leaveOut` with the count and the sheet's rows, saved in the companion file like every row answer). The taxon is already in the occurrence of its group; a number on the row that is not the group's total is listed with it; nothing is deleted. One sized row beside taxon-only rows is no size-class group and is left as it was. **A total of 1** on 2 or more rows is not a repeat (it cannot be shared by size classes). Only in a strict group (same sample, replicate, life stage, qualifier, taxon ID and taxon, so never a pair of life stages), on a sheet whose quantity IS a repeated total and after the choice "once", the later rows are their own case, but only where they would get ONE occurrenceID: ledger reason `one-specimen-total` (kind *blocks*), one question per sheet with their count, answered by "leave these out and list them". Rows that carry an occurrenceID of their own, different on every row, are separate specimens the person has already told apart and nothing is asked (the sheet behaves as before). The row that is written is the first one with a value in a column that tells the rows apart (a size), not the first in file order; only when none has one, the first in the file. The later ones are listed with their cells, under that reason. The text gives both readings: one specimen listed on several rows (leave out), or separate specimens (correct your file; there is no column to tell them apart in the tool). A pair that disagrees with itself (1 and 21) is not a total of 1 and stays blocked by the duplicate identifier. **A key column that separates the rows of one sample** (leave one out): for each key column K (cruise, station, date, position, depth, ...; never the sample code, a key part or a column of a picked key, which the person declared), the rows are also grouped by the OTHER key columns and the taxon, and when the rows of a group all differ in K the same evidence and thresholds as the block are run unchanged (a column the block already stands for is skipped). On a hit the same warning is raised at accept level naming K (`by`), the column and both sums (a weight that repeats across the same column is named in the same finding) ("if \"K\" only tells size classes of one sample apart, it would be Y": give K another role and choose the total once). It covers a size class declared as the cruise. A size class carried in the sample code (`s1-8`, `s1-9`) is **not** asked about: Michał's decision of 2026-11-06. Nothing is blocked, collapsed or re-roled, no header or code suffix is read, and a sheet whose totals differ per K value raises nothing.
- **Sample code by a joined name** (Michał, 12.11): `SampleID`, `SampleCode`, `SampleName`, `SampleNumber` and `SampleNo` are read as the sample code on /check and /convert (the name folding makes no word break of a capital letter, so these are listed exactly). They rank below the spaced and bare names (`Sample`, `Sample ID`, `sample_id`): a sheet that has both takes the spaced one whatever the column order. /convert never holds two sample codes; a column the shared proposal gave up for another one is not made a sample code again by its name, and the repeated-total check groups by the one sample column the events use. Two or more **sample-named** columns at the same tier (`Sample`, `Sample ID`, `sample_id`, `Sample No` ... and the five joined names; for example `Sample` with `Sample ID`, or `SampleID` with `SampleNo`) are not told apart by position: none is proposed, each is ignored with the reason "N columns could be the sample code: X, Y" (four languages, with the count form of each), a lower-tier column beside them says "other columns could each be the sample code ... (they tie, so none is chosen)", and /convert then blocks with `CONV-SAMPLE-CODE-MISSING` and the key picker asks. Every other name (`ID`, `Core`, `Bottle`, `Specimen`, `Próbka`, `Rdzeń`, `Kern`, `Échantillon`, `Carotte`, `eventID`) keeps the first-column rule as before; an exact `eventID` ranks above the joined names.
- **Exact copies** `CONV-ROW-COPIES` (error): rows identical in every column but a per-row identifier (an occurrenceID, or a column the tool does not read that differs on nearly every row), with a quantity above 1 (identical single specimens are not copies). It says the sum with and without them and withholds "tell apart"; the button **drop the copies** (`dropCopies=<sheet>`) converts one row of each and says so in `CONV-ROW-COPIES-DROPPED` (accept). A row-number occurrenceID does not clear it. Identical rows whose count is **1** are not blocked (a specimen table looks exactly like this): `CONV-ROW-COPIES-SPECIMENS` (accept) gives both sums, and the duplicate-identifier text for such rows names both readings (one record twice: remove the copies; separate specimens: each needs its own occurrenceID).

### 8.8 What blocks an export and why (`convert/policy.ts`, `convert/validate.ts`)

Severity alone is not the policy. Each finding is **blocking**, **needs an acceptance**, or **only
shown**, decided by lists of rule ids; a rule on no list blocks when its severity is `error` (a rule
nobody judged must not let a bad archive through) and is only shown otherwise.

- **Blocks**: Darwin Core structure of the output tables (`DWC-TERM-MISSING`, empty required terms,
  duplicate or dangling ids, a loop in the event hierarchy, values outside the vocabularies),
  impossible coordinates, `ROW-NO-COORD`, `ROW-DEPTH-MIN-MAX`, `ROW-DATE-UNPARSEABLE` (a warning on
  `/check` that blocks here), unreadable layout and ragged rows of a chosen sheet, and most
  `CONV-*` errors (undeclared quantity, missing sample code, duplicate ids, a tab or line break in a
  value, eMoF rows that name a missing event or occurrence or have an empty value or type, no
  licence, no basis of record, missing dataset description, undecided splits or WoRMS choices, no
  occurrences). See `BLOCK_OUTPUT_RULES`, `BLOCK_INPUT_RULES`, `BLOCK_CONV_RULES`.
- **Needs an acceptance** (one tick per rule per run, valid only for the findings it was given for:
  a changed mapping makes a tick void): for example `IN-HEADER-SHORT`, `ROW-NON-NUMERIC`,
  `ROW-INVISIBLE-CHAR`, `ROW-DATE-FUTURE`, `ROW-DEPTH-RANGE`, the hemisphere rules, unconfirmed
  vocabulary ids, a missing sampling device, an unmatched profile station, a licence that differs
  from the one the dropped metadata state. See `ACCEPT_RULES`.
- **Roles the file does not state** `CONV-ROLE-UNCONFIRMED` (accept, one finding per sheet, `src/core/convert/roleUnconfirmed.ts`): a column the proposer gave the role taxon, quantity, date, latitude or longitude and
  that the file does not state by name (`src/core/convert/stated.ts`: an exact Darwin Core term after folding case and underscores, an exact vocabulary entry, a unit the header declares for a name that means
  two things, a PANGAEA geocode; the cells can only take that away) is listed with its proposed role, named as the column table names it (`Quantity`, `Date and time`, ...), and its first three distinct cells; the
  person ticks the list once. It is a note and nothing else: no role is changed, no proposal is touched (`withStated` only marks), and a column whose role the person changed in the table is never listed (the page
  records the touch as it does for a taxon header, `handSet`, even when they chose the very role proposed; it is not a role and is not saved). The tick is the person's acknowledgement: it never enters `stated`,
  nothing of it is written into the archive, the metadata or the companion file (there is nothing to save, and nothing carries it to another file), and a new upload starts unaccepted. The page keeps the tick for a
  SET of columns, each named by what makes it itself (the hash of its header with its occurrence, as the sample key does, and its proposed role; not its position): a column answered by hand leaves the list and the
  tick stands; it reopens when a column joins the list (another sheet switched on, for example) and it is cleared when a sheet is read again (`pivotChoice`). A column named with an exact Darwin Core term or vocabulary
  entry is not listed; since 2026-11-12 (Michał's decision of 2026-11-06) that includes a few whole names in other languages: `Breitengrad`, `Längengrad`, `Szerokość geograficzna`, `Długość geograficzna`,
  `Scientific name` (and `Nom scientifique`, `Wissenschaftlicher Name`, `Nazwa naukowa`, marked only where the proposal is already a taxon) and `Date (UTC)`. A file whose headers are the author's own words, an
  inexact spelling or a word with two meanings (`Latitude_dd`, `Date of sampling`, `Breite`, `Data`, `Datum`, `Date (GMT)`, `Abundance (ind)`) lists them, and that is the price of "stated by name". The wide sheet's taxon headers keep their own confirmation ("Confirm all shown"); they are not listed here.
- **Only shown**, never blocks, never asks: the prefixes `CHEM-`, `ROW-SHIP-SPEED`, `ROW-ON-LAND`,
  `XF-`, `META-`, `LIC-` (`SHOW_ONLY_PREFIXES`) and the note `ROW-STATION-SPREAD` (a transect legitimately
  spans more than 10 km). `ROW-STATION-MOVED` and `ROW-STATION-SPREAD-FAR` need an acceptance.

**The station checks run on the input rows.** The Event table has no station name to compare (the
station is a parent event, and every `eventID` is its own "station" there), so `ROW-STATION-MOVED`,
`ROW-STATION-SPREAD` and `ROW-STATION-SPREAD-FAR` are raised by the same function `/check` runs
(`checkStationRows`, `checks/rows.ts`) on the rows of each sheet the converter reads, with the user's
mapping (station, position, date, cruise), and are said in the sheet's lines; when several sheets have station rows,
the rows of all of them are also checked together, because they build the same parent station. The output-table run of
these three is dropped, so none is said twice. Without this a station whose rows carry both signs of a
longitude was written with a derived centre and an uncertainty of thousands of kilometres and no finding,
while `/check` reported it on the same data. No new threshold was added.

The tables are validated by the same code `/check` uses: the Event table as a synthetic Darwin
Core Archive with an Event core through `buildDatasets` and `runChecks`; the Occurrence table through
`checkRawTable`; the eMoF table and the cross-table links by checks of its own
(`CONV-EMOF-ORPHAN`, `CONV-EMOF-EVENT-MISMATCH`, `CONV-EMOF-VALUE-EMPTY`, `CONV-EMOF-TYPE-EMPTY`),
and the description by `metadataFindings`. A warning that BioCheck gives (no sampling descriptor or
effort among the `measurementTypeID`s) is `CONV-NO-SAMPLING-DESCRIPTOR`. **The land mask is not
loaded here**: the converter does not compare positions with land (`ROW-ON-LAND` cannot arise).

### The ledger before the export (`convert/ledger.ts`, `ConvertLedger`)

Above the export button the page lists, per sheet, where every source row went and where every numeric column went, with the sums in and out. It is **information only**: no rule reads it,
nothing blocks on it, it adds no finding, and it is never written into the archive or the companion file (the sums stay on the page). Without it the archive is byte-identical.

- **Read from what was written.** `convert()` hands the ledger the records it produced and the reason it recorded where it left a row or a cell out (`FateLog`, set beside each `continue`;
  it never decides anything: with every call turned into a no-op the records are identical, tested). A line of a long sheet that has a taxon is *written* only when it wrote an occurrence (an event or sample value it opened does not carry its taxon, count and weight: its fate is the reason, and `wrote` says it opened an event).
  On every other sheet a line is written when it wrote an occurrence, a measurement, the event it opened or a profile level; a written line that wrote no occurrence is counted apart and says what it wrote. A line with neither a record nor a reason is `unexplained` and the sheet is not balanced.
- **"Every row is accounted for"** is on the page only if every line has a fate, every numeric cell is written or has a reason, no numeric column is left unwritten, and no line is one the converter
  did not understand (`NOT_UNDERSTOOD`: a value with no parameter name, a repeated parameter in one sample, a number or weight with no taxon, a row that holds only a position or depth (`position-no-taxon`) or only a sample name or date (`sample-no-taxon`; the panel says that in plain words, not as "a value"), a taxon with a number but no quantity column, a row of the wrong length, no sample code). Those rows are named instead
  ("N rows hold a value the converter did not understand"). A column of text that is not written is listed, but is not a number that went nowhere.
- **Where a column goes** is read from the written records: a column an occurrence or a measurement came from; a column read for the events (the set `CONV-COLUMN-NOT-EXPORTED` is computed from) only if the
  written events carry what it gives (Month and Day with no Year: "not written"); every other column "not written". A weight column of a long sheet is written only with a quantity column or a presence tick; the finding and the ledger agree on that.
- **A pivoted long sheet** is accounted in the lines of the long file: quality-flag rows, a value with no parameter (`empty-parameter`), a parameter twice in one sample (`repeated-parameter`, the repeat is in no sum) and
  every cell have a fate by their original line, whatever the pivoted column is read as: a measurement, a taxon (an occurrence), a field of an event, or a column that is not written. A value that the event of its row did not take (a depth that says "deep") is `not-in-event`, not written; a latitude of 999 is kept as written in the event (the output check judges the range). A row counts as holding something when any column that is read (every role but ignore) has a cell, so a row with only a sample name is never "nothing to record".
- **The fate of every line** is data on `SheetLedger.lines` (kept in `ConvertResult`; the page's view carries none): only lines that are not a plain "written" are listed, each with its reason, the chain of reasons recorded
  for it, what a written line wrote when it wrote no occurrence, and on a wide sheet how many taxon cells of the line were written and how many lost. A 2000 x 1000 sheet lists at most 2000 entries. `line` is the physical line of the file as loaded (for a pivot, of the long file); `inputIndex` is the position of the sheet in the list given to `convert()`, from which the worker finds the file in the request and reads the cells of a line from the parsed sheet the conversion read (for a pivot, from `pivot.source`, the long sheet its lines belong to).
- **Sums** are compensated and compared with a tolerance of 1e-12 of the sum of the absolute values: float noise (0.1 + 0.2) is no difference, a changed value or a lost cell is. A cell
  that holds text (`5 g`, an NA variant) is shown as "not read as a number" and is in no sum; a mark on a presence sheet is written with no value of its own and is not a mismatch.
- **Sheets that are not converted** have a line each: not read (long environmental, turned, a units row that was not folded), not used (its box is not ticked, a dictionary sheet is off by default).
  While anything stops the export (a blocking finding, a missing metadata field, a warning not accepted, nothing to write) the page says "would be written". The list of columns shows 50 and a button for the rest.
- **Nothing disappears** (`convert/notWritten.ts`): the ledger's reasons are sorted into three kinds. *Blocks until someone decides* (`CONV-ROW-NOT-UNDERSTOOD`, once per sheet and reason, with the lines and a few cells):
  a value with an empty parameter, a parameter repeated in one sample, a number or weight with no taxon (`no-taxon`, `value-no-taxon`), a row of the wrong length, a value the event of its row did not take, and a row or a
  cell with no explanation (`unexplained`, a fault of the converter; a reason this file does not know blocks as well). The one answer is "leave these rows out and list them" (`CONV-ROW-LEFT-OUT`, with "ask again" to take
  it back) or a corrected file; nothing is prefilled. Leaving out a repeated parameter writes the first value and lists the later ones. *Covered*: the reason has a blocking rule of its own (no sample code, a negative count,
  a duplicate event ...), which is the decision, so our question is never raised beside it (only when no such rule stands for the sheet at all). *Listed, no block*: zeros, statistic rows, copies and repeated totals the person
  chose to leave out, a row with a position or a sample name and no taxon or value (a spacer, a station header or a comment row, on a wide sheet as on a long one), NA cells, quality flags.
  **Every answer holds for the number it was given for**, whether it comes from the page or from a companion file: leaving rows out (the rows of that reason; a file also the rows of the sheet), leaving copies out (the copies),
  taking a total once (`collapsedGroups`, the groups the answer writes once, the same number `CONV-QUANTITY-REPEATED-ONCE` reports) and "real counts" (`affected`, the rows of the groups that repeat the total). If today's
  analysis finds another number the answer is not applied and the question is open. The page never ticks anything itself. The companion file keeps `leaveOut=<reason>:<count>:<rows>:<sheet>`, `dropCopiesRows=<count>:<sheet>`,
  `totalOnceGroups=<count>:<sheet>` and `realCountsRows=<count>:<sheet>`; the old `realCounts=<sheet>`, `dropCopies=<sheet>` and `totalOnce=<sheet>` carry no count: they are read and not applied, and `CONV-COMPANION-OLD` (information) says once how many were not. "Real counts" leaves no finding of its own to be missed: while it holds, `CONV-QUANTITY-REAL-COUNTS` (information) names the number of rows it covers and where it came from, and "Ask again" turns the repeated-total and exact-copy checks back on. The sheet form has no ticks for these three answers.
  `<archive name>-not-written.csv` lists every line not written and every written line that lost a cell (columns: file, sheet, line, reason, status `understood | left-out | needs-decision`, detail, then every original cell; a header
  row opens each sheet). A written line that lost cells has reason `cells-not-written` and names the columns and why in `detail` (an NA or a text where a number should be, on a wide sheet or a long one; zeros are counted, not
  named). A date-formatted cell keeps its serial and `detail` adds `date: <column>: <ISO date>`, read the way the converter reads it (1904 workbooks included). A sheet left out whole (not used, or not read) is one `sheet` line with
  its count of rows, not row by row. The list is offered by a button beside Export and in the ledger panel with the same count (rows not written or not written whole), whether or not the export is blocked, and is never
  downloaded by itself; it is not part of the archive. Formula-like cells get the leading apostrophe that `readConvertFile` takes off. "Leave out the copies" and "count the total once" start unticked. The worker judges the
  export again from the request alone. A column set to ignore that holds a value is named by `CONV-COLUMN-IGNORED` (information, no acceptance), up to 20 names; a column that `CONV-ID-DUPLICATE` names as the ignored column
  that tells rows apart is named there only. No text advises deleting data: `test/rules/noDeleteAdvice.test.ts` searches the English rule texts, page texts and tips (and the other languages for their words) and allows a
  named list.
- Limits: the ledger is built on every conversion of the page (one pass over the cells, a byte per cell and column; a wide 2000 x 1000 sheet is checked by `test/perf/wide.perf.ts`, under 1300 ms per
  convert). It does not say that the contents are right, only where each row and number went.

### 8.9 What the archive contains

**`event.txt`** (Event core; `convert/dwca.ts`): `eventID`, `parentEventID`, `eventType`
(`cruise`, `station`, `sample`, `replicate`, `profile level`: there is no controlled list in the OBIS Manual),
`eventDate`, `decimalLatitude`, `decimalLongitude` (always written, even when empty, so an empty one
is reported), `geodeticDatum` (`EPSG:4326` for an event with a position), `coordinateUncertaintyInMeters`,
`minimum/maximumDepthInMeters`, `minimum/maximumDistanceAboveSurfaceInMeters`, `sampleSizeValue`,
`sampleSizeUnit`, `locality`, `datasetName`, `institutionCode`. Columns that no row fills (and that
BioCheck does not need) are left out.
**`occurrence.txt`**: `occurrenceID`, `eventID`, `basisOfRecord`, `occurrenceStatus`,
`scientificName`, `scientificNameID`, `verbatimIdentification`, `identificationQualifier`,
`lifeStage`, `sex`, `individualCount`, `organismQuantity`, `organismQuantityType`,
`occurrenceRemarks`.
**`extendedmeasurementorfact.txt`** (only when there are measurements): `eventID` (the core id; for
an occurrence's row, the eventID of that occurrence), `occurrenceID`, `measurementType`,
`measurementTypeID`, `measurementValue`, `measurementValueID`, `measurementUnit`,
`measurementUnitID`. Sources of rows: the declared quantity (8.3), the effort, the sampling device
(`NMSPINST` with a value id for a verified device, else the user's text without one), the mesh size
(`MSHSIZE1`, unit `UMIC`), the pressure of a profile (`PRESPR01`, and `UPDB` only when the unit is
decibars; a pressure is never turned into a depth), and **one row per sample (or level) for each
measured-variable column**.

Files are UTF-8, tab-separated, `\n` line ends, one header line, no enclosure; a tab or line break
inside a value is **refused, never replaced**. Values are written **from their source text** (a
coordinate with its own decimals, a depth with its own, a quantity as the cell said it with a decimal
comma turned into a point); **nothing is rescaled** except the declared units named in 8.6 (a depth below the
seafloor in centimetres, a plain depth in fathoms, feet or kilometres, which also writes `verbatimDepth`). The other exceptions are computed values: a derived
parent position is rounded to 6 decimals (`round6`, `DERIVED_DECIMALS` in `events.ts`) and written without trailing zeros, except that a coordinate, or a depth end, that every child is written with in one and the same text, and that reads as exactly the parent's number, is written with that text (`54.50` on the station when every sample row has `54.50`; the text each sample is written with counts, so a hemisphere column, letters in the cell or degrees and minutes are covered; samples that differ keep the derived form), and a
coordinate read from degrees and minutes is written as decimal degrees at the precision of its
text. **`meta.xml`** declares the Event
core and the two extensions, with `metadata="eml.xml"`.

**`eml.xml`** (`convert/eml.ts`): EML 2.2.0 with the GBIF Metadata Profile 1.3, the form the IPT
3.3.7 writes: title, creators, metadata provider, publication date, language, abstract, keywords,
`intellectualRights` (the licence, machine-readable through a `ulink`, only from an explicit
choice of **CC0-1.0, CC-BY-4.0 or CC-BY-NC-4.0**, the set the IPT supports; there is **no default**),
coverage (bounding box of the event positions, the temporal range of the event dates, up to
`MAX_TAXA` (200) distinct scientific names with the total stated), contact, methods (only when
typed) and the GBIF citation (typed, or built from creators, year and title; with the DOI as an
`https://doi.org/` identifier when the citation contains one).

**The zip** (`convert/zip.ts`): a hand-written writer (no dependency), UTF-8 names, a fixed 1980
timestamp so the same input gives the same bytes, CRC-32 per entry, deflated through the browser's
`CompressionStream('deflate-raw')` and **stored** when deflate does not help or is unavailable;
**no ZIP64**: an archive above what the format's 32-bit fields or this tool's own reader limits can
take is refused, never written wrong. The caps mirror the reader's `ZIP_LIMITS`: 100 MB for the
archive, 150 MB per entry and in total, 1000 entries.

**The description form** (`convert/metadata.ts`, `prefill.ts`): fields from dropped metadata files
fill **empty** fields only and keep their source; where files disagree on a field there is **no**
prefill and the page lists what each says; the licence is pre-filled only when exactly one
recognised id (of the three) is stated with no contradiction; any other licence, none, or a
contradiction leaves the choice to the user with a note, and a version is never mapped to another
(3.0 never becomes 4.0). `basisOfRecord` has no default: the allowed values are the Darwin Core
vocabulary without `MaterialCitation`. A chosen licence that is not among the ones the dropped
files state raises `CONV-LICENCE-DIFFERS`, which must be accepted.

**The companion file** (`convert/settings.ts`): same sidecar format as `/check`; settings
`fullList`, `stationPrefix`, `worms`, `nvs`, `profile`, `profileDepthIds`, `profileIgnoreCast`,
`longAsTable`. They live **only** in the file and are read as **pre-ticks only**: `worms=yes` and
`nvs=yes` tick a box and send nothing. The file holds no search word, vocabulary code, label or identifier and no data value; it does hold
the names of the sheets it refers to (`profile=<sheet>`, `longAsTable=<sheet>`). Dropped
on `/check` it is recognised as a sidecar and changes nothing there but `singleCruise`.

### 8.10 Vocabularies and the two opt-in lookups

**Verified list** (`convert/vocab.ts`): the converter writes NERC concepts only from a short list
opened and checked against the live vocabulary server (HTTP 200, not deprecated): the P01 types of
8.3 and the effort, instrument and mesh concepts, the P06 units for per-volume and per-area
numbers and for sample size, ten sampling devices (six named nets and grabs in L22, four device
categories in L05), the pressure type and unit. URIs are written in the `http://…/current/CODE/`
form BioCheck joins on. Species-specific P01 codes are never used.

**Measured-variable columns** (`convert/nerc.ts`): the rule of the whole feature is that **no
identifier is written that the user did not confirm for that column.** A **generic** verified
concept (it names the quantity and no method) may be *proposed* (never pre-selected); a
method-specific one is only *offered*; an NVS search result is only *shown*; and the identifier
reaches the archive only through a pick the user made for one column. The worker rebuilds every
identifier from the page's pick and accepts nothing but a P01 URI (type) or a P06 URI (unit) of the
expected shape; a deprecated concept is never written; a pick that says it came from the verified
list must be on it; a label is never trusted from the page for a verified code. Where a concept's
label states a dimension (per unit mass or volume) that the column's unit contradicts, the pair is
the user's choice and is written with a warning (`CONV-NERC-UNIT-MISMATCH`); oxygen has one concept
per dimension, picked by the unit's dimension, and nothing is proposed for a unit of neither.
Without a confirmed concept, `measurementType` is the declared meaning in words and the id is empty
(`CONV-NERC-UNKNOWN`, `CONV-UNIT-NO-P06`, both warnings to accept).

**WoRMS lookup** (`src/app/optins/worms.ts`, pure half `convert/worms.ts`). Off at every upload.
`GET https://www.marinespecies.org/rest/AphiaRecordsByMatchNames?scientificnames[]=…&marine_only=false`,
`WORMS_BATCH_MAX` (50) names per call, one call after the other, with progress and a real abort.
Only names that have **no** id from the sheet are sent (the list is `nameLookup` in the result).
**What is automatic:** exactly one result whose `match_type` is `exact`, under the name sent, and
not a deleted or quarantined record. **Everything else** (phonetic, near, genus-only, several
results, an exact match under another name) is shown and the user chooses a result or "no ID";
**nothing fuzzy is ever accepted by the tool**, and an undecided name blocks
(`CONV-WORMS-UNDECIDED`). When the user chooses a non-exact result, the chosen record's own name is
written to `scientificName` (so a typo does not travel with another taxon's LSID);
`verbatimIdentification` and the `occurrenceID` keep the sheet's text. No match is a warning
(`CONV-WORMS-NO-MATCH`); a record flagged only freshwater or terrestrial is warned
(`CONV-WORMS-NOT-MARINE`; no habitat flag is "unknown", not "not marine").

**NVS search** (`src/app/optins/nvs.ts`, pure half `convert/nvs.ts`). Off at every upload; a search
starts only from a column's own button, one at a time, no retry. `GET
https://vocab.nerc.ac.uk/sparql/sparql?query=…` for the typed word in P01 (variable) or P06 (unit);
the only fallback is one more request, for the concept page of a code, made only after the search has failed and when the typed text is
exactly a concept code. Limits: `NVS_LIMIT` results (20), `NVS_MAX_CHARS` (80) and `NVS_MAX_WORDS`
(4) for the typed text. A typed code whose concept page answers 404 is reported as its own failure (the code
does not exist; trying again does not help), not as an empty result. A code in a **header** is never sent to NVS;
its shape is checked offline (3.3, `CONV-NERC-CODE-MALFORMED`, to accept: no identifier is written from it).

### Limits and known gaps (confirmed from code and rule texts)

See also section 14.

### Network calls and opt-ins

None by default. WoRMS and NVS as above; analytics `convert_started` (when files are read),
`convert_blocked` (when Export is pressed while something blocks; a count) and `convert_exported`
(shape, flags and counts, 2). The CSP of `/convert` blocks every other host.

### 8.11 Joining a results sheet to its sample description

A workbook (or two files) often has a results sheet (sample, taxon, count) and a second sheet that describes the samples (station, date, position, depth). **Nothing joins by itself**: the converter
proposes, the person confirms, and an input without a confirmed join converts exactly as before, apart from the information `CONV-JOIN-PROPOSED`.

- **Proposal** (`proposeSampleJoins`). For each results sheet (a taxon column or taxon headers, not a profile sheet) the sheet that describes its samples best, when it has at least half of the results
  sheet's samples, and the key: columns the person already sees in the role table (sample code, station, cruise, or the parts of a picked sample key, measured together as one key) and equal headers. No
  role is guessed from values. The keys are ranked on the values the merge joins by (the converter's own reading of each key cell in its own sheet, so a serial date and the same date as text are one key), while /check keeps
  ranking raw cell text. A results sheet that gets no proposal (key columns the description sheet cannot be paired with by an equal header or by the same sample-code, station or cruise role, too little overlap) is still offered "The samples of … are described in another sheet…": the same Change form, on the
  person's declaration, nothing guessed (`ConvertView.sampleJoin.resultsSheets`); a declared key must be a column with the role sample code, station or cruise, or a part of the sample key the person picked (`joinInputs` drops any other). The columns the person picked as the sample key are key columns whatever their own role (also ignore), paired on the description side by the same header or by a strong role. A results sheet gets one proposal; one description sheet may serve several results sheets; a pair the person declined (`sampleJoinNo`) is skipped for that pair only, and
  a results sheet with a confirmed join gets no further proposal. The two sheets may be in two files: a sheet is told by file and sheet name.
- **Confirmation** (`ConvertRequestBody.sampleJoin`, a list). Each join names the two sheets, the key columns of each, the person's answers to the conflicts below, and `resultsOnly`. The worker only maps the
  sheet references to the request's sheets (a join whose sheet the request does not hold is dropped); `joinInputs` is the one validator (an index out of range, a re-roled column, a profile or long
  description sheet: the join is dropped without a finding of its own and the proposal shows again). The merged sheet is read as one table by the converter; the description sheet is then a sheet of its
  own in the ledger, which says which results sheets each of its lines was lent to, and it is never listed as "not used".
- **P1 (`CONV-JOIN-NO-DESCRIPTION`, blocks)**: results samples with no description row are listed by name. The one way out is "convert these samples with only what the results sheet says about them"
  (`CONV-JOIN-RESULTS-ONLY`, information), which holds for the number it was given for and covers the samples without a description and the results rows with a blank key; the existing checks then apply
  to them unchanged (a sample with no date or position still blocks).
- **P1b (`CONV-JOIN-NO-MATCH`, blocks)**: when no key of the results sheet is found in the description sheet (every code differs, e.g. a letter O typed for a zero, or the key columns are of different kinds) the join is
  not accepted: the finding names both sheets and key columns and gives up to 5 example keys from each side. No "results only" answer is offered, and no description-only events are made. When a join has both
  samples without a description and description-only samples, each of those two findings also lists up to 5 keys of the other side, so a near-miss (`X02` against `XO2`) can be seen.
- **P2 (`CONV-JOIN-DESCRIPTION-ONLY`, warning to accept)**: a description row with no results is kept as a sample event without an occurrence, written once however many results sheets share the description.
- **P3 (`CONV-JOIN-AMBIGUOUS`, blocks)**: a key on several description rows that differ in any column; rows that repeat each other value for value are one row.
- **P4 (`CONV-JOIN-FILLED`, information)**: blank on one side and a value on the other is no conflict; the value is taken, counted and said once per column.
- **P5**: values are compared after the converter's own reading (date, number, unit, sign), so `2020-06-01` and `01.06.2020`, or `5` and `5.0`, are equal; the text written is the results sheet's.
- **P6 (`CONV-JOIN-KEY-BLANK`, blocks)**: a results row with a blank key part is listed. A description row with a blank key cell is asked about (CONV-JOIN-KEY-BLANK); left out, it is listed beside the archive with reason join-no-key.
- **P7**: the value not chosen in a conflict is not lost: it is listed beside the archive (`join-not-chosen`) with both lines; a description line whose results rows wrote nothing is listed whole
  (`join-results-not-written`). A reason the person leaves out for the results sheet is not left out for the description sheet, and the other way round (the two share one input but have ledgers and keys of their own).
- **P8**: this section and `test/convert/no-joins.test.ts` ("/convert reads no join that the person has not confirmed") replace the earlier rule that /convert joins nothing.
- **C1 Conflicts** (`CONV-JOIN-CONFLICT`, blocks): the same quantity (event date, position, depth range, station, cruise, a measured variable) with different values on the two sheets, judged on the value
  the converter derives and not on the column role. One group per quantity, with its number of samples; the person takes the description or the results for all, per entry (one join key and one results value),
  or for all with the same pair of values. Each group names the results header(s) and the description header(s) it compares (the finding and the group panel), because two columns of the same kind can hold different quantities (a start depth against a depth). The answer holds for the number of samples it was given for, so changed data re-opens it. Two columns in different units that cannot be compared block with
  `CONV-JOIN-UNIT-DIFFERS`, and columns the merge cannot pair with `CONV-JOIN-COLUMNS-DIFFER`, each with its ways out. What was chosen is said in `CONV-JOIN-CONFLICT-CHOSEN`.
- **C2 A coarser description**: one description row (a station) may serve many results samples; its values are lent to each of them, conflicts are asked per description row with the results samples listed under it,
  and "take the results" for the whole group is one click.
- **C3 Nothing changes without a join**: the archive files and every finding of an input without a confirmed join are as before; the only addition is `CONV-JOIN-PROPOSED`. A description sheet in the long
  layout (one row per parameter, read through its pivot) is not joined for now: the converter names it (CONV-JOIN-DESCRIPTION-LONG) and converts both sheets as it does without a join.
- **Protocol** (`convert.protocol.ts`). `SampleJoinRequest` (`results` and `description` as `{ fileId, sheet }`, `keys`, `conflicts`, `resultsOnly`, `fromFile`) in `ConvertRequestBody.sampleJoin`; the declined
  pairs in `sampleJoinNo`. `ConvertView.sampleJoin` returns the proposals still open (a long description sheet is shown with `long`), the sheets that can take a declared join (`resultsSheets`) and the groups of differing values with the results sheet each belongs to;
  the entries of a group are capped at 500 and `count` is the true number of samples. `previewKey` finds the results sheet through the merge; a description sheet that was merged away has no preview.
- **Companion file**: names, hashes and counts, never a data value. `sampleJoin=<rRows>:<dRows>:<rHashes>:<dHashes>:<["rFile","rSheet","dFile","dSheet"]>` (the names as a JSON array, so a `:` in a name is safe; the
  hashes are those of `sampleKey`), `sampleJoinConflict=<description|results|mixed>:<count>:<group>:<["rFile","rSheet"]>`, `sampleJoinResultsOnly=<count>:<["rFile","rSheet"]>` and
  `sampleJoinNo=<["rFile","rSheet","dFile","dSheet"]>`. Exceptions and pairs hold values (sample codes, value texts), so they are never written: a group answered with exceptions, with pairs or without a bulk side
  is saved as `mixed` and the page asks it again (`savedJoinTake`). A saved join is applied only when both sheets are found again with the same number of rows and the key columns are found by their hashes;
  otherwise the question is open. The worker writes nothing of the join; the page writes the companion file, as for `sampleKey`. /check reads a file with these lines as a sidecar and nothing more.

*Code: `src/core/convert/sampleJoin.ts` (`proposeSampleJoins`, `mergeSampleSheets`, `joinInputs`), `src/core/convert/ledger.ts` (`joinLedgers`), `src/core/convert/notWritten.ts`, `src/core/convert/settings.ts`,
`src/worker/convert.{protocol,handler}.ts`.*

*Code: `src/app/pages/ConvertPage.tsx`, `src/app/convertModel.ts`,
`src/app/components/Convert{SheetForm,MetadataForm,Worms,Nerc}.tsx`,
`src/app/optins/{worms,nvs}.ts`, `src/worker/convert.{worker,handler,client,engine,protocol}.ts`,
`src/core/convert/*` (`build.ts` `convert`/`listSplits`, `recognize.ts`, `measured.ts`,
`pivot.ts`, `quantity.ts`, `taxon.ts`, `events.ts`, `ids.ts`, `seafloor.ts`, `dwca.ts`, `eml.ts`,
`zip.ts`, `policy.ts`, `validate.ts`, `vocab.ts`, `nerc.ts`, `nvs.ts`, `worms.ts`, `metadata.ts`,
`prefill.ts`, `settings.ts`), `src/core/rules/convert.ts`.*

---

## 9. `/privacy` Privacy

A static page (`PrivacyPage`) that states what section 2 describes, in four languages. The lists of
data hosts, IPT hosts and CSW catalogues on it are **rendered from the same configuration the code
enforces** (`DATA_HOSTS`, `IPT_HOSTS`, `CSW_HOSTS`), so the page cannot drift from the allowlists.
It carries sections for local reading, browser mode, server mode, GBIF/OBIS, collection review, the
converter, hosting logs, the map, analytics and consent, the Atlas's own visit counter (the Tools
have none), the legal basis and the contact. No network request except the optional analytics page
view.

*Code: `src/app/pages/PrivacyPage.tsx`, `privacy/index.html`, `config/hosts.ts`, `config/ipt.ts`,
`config/catalogues.ts`.*

---

## 10. The server

`server/index.ts` (`createApp`), compiled to `dist-server/` (`npm run build`), started with
`npm start`; the port is `PORT` or 8080. It is a small Express app with no database and no session.

**Static serving.** The six pages and the small static files are read **once at startup**; nothing
a request controls reaches the filesystem. `/assets` (hashed build output) is served immutable for a
year with no directory index, no redirects and no dotfiles; `/fonts` (self-hosted fonts) for 30
days; `/og.jpg`, `/og.webp`, `/favicon.svg`, `/consent-default.js`, `/not-found.js`, `/robots.txt`,
`/sitemap.xml`. A trailing-slash variant of a page answers **301** to the slash-less address (a fixed
target). Routing is case-sensitive and strict. Anything else is a 404 page rendered in the
language of `?lang=` or `Accept-Language` (`notFound.ts`).

**Compression** (`compression` 1.8.2, a runtime dependency, in `createApp` right after the security headers).
Responses the middleware calls compressible (html, js, css, json, svg, xml, txt) leave **brotli** (preferred) or
**gzip** (level 6) when the client sends `Accept-Encoding`, with `Vary: Accept-Encoding`; images, fonts and archives
pass untouched, and so does anything under 1 KB. Brotli runs at **quality 4** (Node's default, 11, would cost seconds per
request on the 800 kB styles chunk); there is no cache, each request compresses again. **Never under `/api/`**
(`/api/fetch` and `/api/csw` stream upstream bodies and are not wrapped at all). A request with a `Range` header
is answered uncompressed, so a byte range is the range of the file; HEAD is answered with the plain file's headers.
The security headers, `Cache-Control` (immutable assets, `no-cache` pages) and the CSP are set before and are unchanged.
Measured on a local build, `/check` JS and CSS: 1 260 617 B plain, 398 588 B gzip, 392 618 B brotli.

**Offline base map** (`MapPreview`, `fallbackStyle` in `src/app/mapModel.ts`). CARTO stays the base map. If its style or tiles fail before the map has loaded, or it has not loaded after `BASEMAP_TIMEOUT_MS` (10 s), the map is removed and built again on `src/app/assets/land-fallback.geojson`: Natural Earth 1:50m land (public domain, version 4.1.0), simplified with `ogr2ogr -simplify 0.1` to 0.01° coordinates, properties dropped, 1 420 polygons, 341 231 B (77 892 B gzip). It is a separate asset fetched by the map only in this case, so the `/check` bundle above does not change. MapLibre draws a sea background, the land fill, the coastline, then the points; the attribution reads "Natural Earth", and the note on the map (`map.offline`, four languages) says it is a simplified offline map and the detailed base map needs an internet connection. The file adds no host: CSP `connect-src 'self'` and `/privacy` are unchanged. It is for orientation only; whether a position is on land is decided by the land mask, not by this file. Offline, `/check` and `/convert` (with the WoRMS and NVS lookups off, their default) work on dropped files; links, DOIs, `/licence`, `/collection` and the two lookups need the network.

**Headers on every response** (`securityHeaders`, `server/headers.ts`): a Content-Security-Policy
per page path (2); `X-Content-Type-Options: nosniff`; `Referrer-Policy:
strict-origin-when-cross-origin`; `Strict-Transport-Security: max-age=31536000`; `Permissions-Policy`
turning geolocation, camera and microphone off; `frame-ancestors 'none'`; `object-src 'none'`;
`X-Robots-Tag` as described in 1. Pages are `Cache-Control: no-cache`.

**`POST /api/fetch`: the SSRF-safe proxy** (`server/fetchProxy.ts`, `proxyFetch`; any other method is
405 with `Allow: POST`).

- *Request*: a JSON body of at most 2 KB with `url` (at most 2048 characters) and an optional
  `accept` (printable ASCII only, at most 200 characters, so no CR/LF can become a header).
- *Every hop* (the first URL and each redirect target, up to `MAX_REDIRECTS` = 5) must be: https,
  an **exact** allowlisted host (`DATA_HOSTS`), the default port, no credentials, not a literal IP
  address; the host name is resolved **once**, **every** returned address must be a public unicast
  address (anything else, an unparsable address included, is forbidden: fail closed), and the
  connection is then **pinned to those checked addresses** with a custom `lookup`, so a second DNS
  answer (rebinding) can never be used; SNI and the Host header stay the host name.
- *Limits*: `MAX_BYTES` 30 MB and `TIMEOUT_MS` 20 s for an ordinary URL. A **Darwin Core Archive**
  URL (`isArchiveUrl`: https, a host of the static IPT list, no port, a path ending `/archive.do`) gets
  100 MB and 90 s, **at most 2 in flight per client** (else 429 `archive_busy`), and a **daily
  budget** per client of `ARCHIVE_DAILY_REQUESTS` (200) archives and `ARCHIVE_DAILY_BYTES` (2 GB),
  charged chunk by chunk (else 429 `archive_daily_budget`). The size limits are also enforced for a
  body with no `Content-Length`; a body cut at the cap is told apart from an interruption by the
  client (`CAP_SLACK_BYTES`).
- *Response*: **always** `application/octet-stream` with `Content-Disposition: attachment` and
  `no-store`, whatever the origin says; the origin's type travels in `X-Upstream-Content-Type`
  (printable ASCII, at most 100 characters); upstream status codes are passed through (they are not
  proxy errors); a refusal by the proxy carries `X-Fetch-Proxy-Error` and a JSON `{error}`. Nothing is
  sent before the first chunk of the body has arrived, so an early refusal or timeout is a proper
  status; after that, a failure cuts the connection so a truncated body is never mistaken for a
  whole one. Redirect hops are hidden from the client.
- *Identification*: the proxy sends `User-Agent: AbyssalClaimsTools/1.0 (+<site>; mailto:<contact>)`.
- *Rate limit* (`rateLimit.ts`): a fixed window of 30 requests a minute per client (an operational
  choice, not a QC threshold). The client key is the **last** `X-Forwarded-For` entry (the platform
  appends the real client; earlier entries are client-controlled), else the socket address; the
  Express `trust proxy` setting is deliberately off. Counters are in memory, per instance, with a
  cap on tracked clients.

**`POST /api/csw`** (`server/csw.ts`): the collection review's way to a catalogue. The body (at most
1 KB) must have exactly the known fields (`catalogue` id, `op`, `startPosition`, `maxRecords`,
`schema`), each of the right type and range; the server **builds the request itself** from
`config/catalogues.ts` (GET query or POST XML body) and never forwards a visitor's URL, XML, header or
query; redirects are not followed; at most 50 records a page (`MAX_RECORDS_PER_PAGE`); answers are
cut at `CSW_MAX_BYTES` (15 MB) and given up after `CSW_TIMEOUT_MS` (45 s); at least
`CSW_MIN_INTERVAL_MS` (1 s) between requests to one catalogue host, with `CSW_MAX_QUEUE` (20) waiting
before 429 and `Retry-After`; 20 requests a minute per client; a daily budget per client of
`CSW_DAILY_REQUESTS` (3000) and `CSW_DAILY_BYTES` (2 GB). The same opaque-download response as above.

**Errors**: an oversize body is 413 `body_too_large`, other client errors 400, anything else 500; all
`no-store`.

**Logging**: one JSON line per proxied request with `{ host, status, bytes }` (host only if
allowlisted), written to stdout.

*Code: `server/index.ts`, `server/headers.ts`, `server/fetchProxy.ts`, `server/rateLimit.ts`,
`server/csw.ts`, `server/notFound.ts`, `config/{hosts,ipt,dataverse,catalogues,site}.ts`.*

---

## 11. The workers

Each tool's heavy work runs in a module Web Worker created on first use by a client wrapper
(`getEngine` in `src/worker/client.ts`, `convert.client.ts`, `collection.client.ts`). The page
sends typed requests and gets typed results (`protocol.ts`, `convert.protocol.ts`,
`collection.protocol.ts`); a worker error is passed as a plain message, never a stack. CSP allows
`worker-src 'self' blob:`.

| Worker | Session | Requests |
|---|---|---|
| `check.worker.ts` (handler `src/worker/handler.ts`) | One session per worker: held files, built datasets, the last report. `parse` and `reset` start a new one; a `check` that awaited the land mask and finds the session replaced is discarded. | `reset`, `parse`, `propose`, `build`, `check`, `export` (clean CSV, sidecar, GeoJSON, ISO 19139, DataCite), `draft`, `row`. |
| `convert.worker.ts` (`convert.handler.ts`) | One session of parsed files; deliberately **not** composed from the checker's handler so the checker's worker is unchanged. | `reset`, `parse`, `convert`, `proposeCodes`, `pivotChoice`, `export`. |
| `collection.worker.ts` (`collection.handler.ts`) | The run, with `browserNet()` and IndexedDB; progress messages at most four a second except on a status change. | `estimate`, `start`, `resume`, `pause`, `stop`, `discard`, `saved`, `progress`, `samples`, `unread`, `download`, `saveTo`. |

The network modules of the converter (the two opt-ins) live on the **main thread**; the converter's
worker never fetches. Tests drive the same handlers in the calling thread (`createDirectEngine`,
`createDirectConvertEngine`).

---

## 12. Where in the code

| Area | Path |
|---|---|
| Pages, entries, components | `src/app/pages/`, `src/app/entries/`, `src/app/components/` |
| Browser-side models, analytics, i18n, ⓘ tips | `src/app/{analytics,i18n,tips,*Model}.ts(x)` |
| Opt-in network modules (converter) | `src/app/optins/{worms,nvs}.ts` |
| Workers | `src/worker/` |
| Reading files | `src/core/parse/` |
| Numbers, dates, coordinates, encoding | `src/core/values/` |
| Column and layout recognition | `src/core/recognize/` (`columns.ts`, `layout.ts`, `vocab.ts`, `headerWords.ts`, `reasons.ts`, `depthUnit.ts`) |
| Typed rows | `src/core/dataset.ts` |
| Checks | `src/core/checks/` (`run.ts`, `rows.ts`, `speed.ts`, `crossfile.ts`, `chemistry.ts`, `metadata.ts`, `licence.ts`, `dwc.ts`) |
| Rule definitions, citations, registry | `src/core/rules/` (`registry.ts` the full registry, `registryCheck.ts` without the converter's rules, per-category files, `citations.ts`) |
| Report | `src/core/report.ts` |
| Licence analysis | `src/core/licence/`, `src/core/metadata/licence.ts` |
| Metadata parsers | `src/core/metadata/` |
| Public-record resolvers | `src/core/sources/` |
| Outputs | `src/core/output/` |
| Converter | `src/core/convert/` |
| Collection review | `src/core/collection/` |
| Land mask | `src/core/geo/` (built by `scripts/land-mask.py`) |
| Interface texts | `src/core/i18n/` |
| Server | `server/` |
| Host allowlists, CSP, site constants | `config/` |
| Generated rule list | `docs/rules.md` (`scripts/rules-doc.ts`) |
| Research notes behind thresholds and vocabularies | `docs/research/qc-sources.md` |

---

## 13. Rule families

Counts were computed from the rule registry (`RULES` in `src/core/rules/registry.ts`, which
assembles the per-category files) by a throwaway script run outside the commit, at this release
(the rule set of commit `7f99a18`, unchanged by the documentation commits after it; recomputed from `docs/rules.md`, which a test keeps equal to the registry). The total, **215 rules**, equals the number of rule rows in
[`docs/rules.md`](rules.md), which is generated from the same registry and **is the authoritative
list** (ids, severities, thresholds, full citations): treat this table as a map to it, and
regenerate it when rules change.

| Prefix | Category in the registry | Rules | Error / Warning / Info | What it covers | Main sources it cites (as named in the rule definitions) |
|---|---|---|---|---|---|
| `IN-` | `input` | 32 | 12 / 11 / 9 | Getting and reading input: downloads (blocked, timeout, interrupted, host not allowed, archive limits), records with no data file, unreadable files, encoding, decimal comma, short header, 1904 dates, a PANGAEA table's position and date taken from its Event(s) block, unsupported layout, Darwin Core Archive reading. | Almost none: these are the tool's own handling. One cites Microsoft's description of the Excel date systems. |
| `LIC-` | `A` | 11 | 1 / 10 / 0 | Licence statements across ISO, DataCite, Zenodo and PANGAEA records (3.5, 6). | DataCite Metadata Schema 4.6 (Rights); Creative Commons FAQ; INSPIRE Technical Guidelines for ISO 19139 metadata; GO FAIR principle R1.1; OpenAIRE Guidelines for Data Archives; SPDX. |
| `META-` | `A` | 8 | 2 / 4 / 2 | The record itself and the record against the data: links, version, extents, abstract variables, no dates, no positions. | The OBIS Manual (`META-NO-POSITIONS`: `decimalLatitude` and `decimalLongitude` are the minimally required location terms); the other rules are stated in their own text. |
| `ROW-` | `B` | 43 | 6 / 24 / 13 | Row-level checks: coordinates (range, zero, swapped, hemisphere, land), dates, units, depth, ship speed, stations that move, invisible characters. | Argo QC manual for CTD data; Met Office marine-qc ("Track check"); OBIS obis-qc; GTSPP real-time QC manual; MEDATLAS protocol; World Ocean Database user's manual. |
| `DWC-` | `B` | 9 | 6 / 3 / 0 | Darwin Core structure of a table or archive: required and recommended terms, ids, hierarchy, vocabularies. | OBIS obistools (`check_fields`, `check_eventids`); OBIS Manual; EMODnet BioCheck; OBIS obis-qc; GBIF basis-of-record vocabulary. |
| `XF-` | `C` | 6 | 0 / 4 / 2 | Across several datasets (3.5). | Few (two rules cite GLODAP and UNESCO Technical Paper 44); "equal" is derived from reported precision, not from a threshold. |
| `CHEM-` | `C` | 3 | 0 / 3 / 0 | Unit pairs by molar mass, DIC above total alkalinity, global range test. | Argo QC manuals (CTD, dissolved oxygen); CIAAW atomic weights; Dickson, Sabine & Christian (2007); GTSPP; TEOS-10. |
| `CONV-` | `B` | 103 | 43 / 40 / 20 | The converter's own findings (section 8). | OBIS Manual (Darwin Core, eMoF, name matching, common issues); OBIS obistools; EMODnet BioCheck. |
| **Total** | | **215** | | | |

(The "category" column is the field `category` of each rule definition (`input`, `A`, `B`, `C`);
`META-` and `LIC-` share category `A`, and `CONV-` shares `B` with the row and Darwin Core rules.
The source column lists the labels that occur most often among each family's `citations` and
threshold citations.)

---

## 14. Known limitations

Each item below is confirmed from code, a test, or a rule text.

**General**

- Several limits are the tool's own choice, kept as code constants rather than cited thresholds
  (listed in 3.5): the 10 km "one place" size of the ship-speed check and `ROW-STATION-SPREAD`, the
  1000 km of `ROW-STATION-SPREAD-FAR` (its technical text says so), the land-mask distances, the
  number of terms that make a table Darwin Core, the 10 km of `CONV-PROFILE-STATION-FAR`. Of the own-choice limits listed in 3.5, only those of `ROW-STATION-SPREAD-FAR` and `ROW-LAT-EQ-LON` are said to be the tool's own choice in the rule's technical text; the others are named as such only in section 3.5 and in the code comments, not in the report.
- Roles found by cells stay **proposals**, at low confidence, with their reason shown: a text column of Latin-looking words beside a named count (`Method` = `Visual census ...`, `Mare nostrum`) can be offered as the taxon, and `Dominant species` beside an `Abundance` column reads as a long sheet. The user sees the reason and changes the role; no further rule is added, because it would tune to the examples.
- Several single specimens of one taxon in one sample, written on the occurrences (`value-per-occurrence`), still need an occurrence ID or a life-stage column: without one `CONV-ID-DUPLICATE` blocks, as it does for any repeated taxon in a sample.
- The sheets of a finding that lists many are shown up to ten and counted after (`A, B ... (+30)`).
- `ROW-STATION-MOVED` and `ROW-STATION-SPREAD*` compare rows only within a cruise or a calendar year: the same station
  revisited in another year, in a file with no cruise column, is not compared (a digit error there goes unseen), and a typed-digit error in a coordinate written with fewer than two decimals is not found.
- Compression is done per request (no cache of compressed bodies) and brotli is at quality 4, so it is only a little smaller than gzip; precompressing at build time would shrink it further.
- No page claims data is publication-ready; reports list what they do not check.
- Server counters (rate limits, daily budgets) are in memory and per server instance.

**`/check`**

- Transposed tables and empty-header tables are not read (`IN-LAYOUT-UNSUPPORTED`). A units row under the header is read as part of the header; a row that looks like units but has words under some unit is not folded: /check refuses it and /convert names it (`CONV-SHEET-UNITS-ROW`, with the tick to read the sheet as it stands). Units written as `1` or `-` and ranges such as `1 to 20` are not recognised as units, so such a row is never folded; it is still refused and named when two other cells of the row are units of the vocabulary with numbers under them (`1 to 20,1 to 12,m,degC` over numbers is, as in u1), and otherwise it stays data.
- Darwin Core Archives: only the core table is read; at most 200 000 rows (`IN-DWCA-PARTIAL`),
  100 MB, 1000 entries; extension tables are not compared.
- A repeated (key, parameter) pair in a long layout no longer loses values when a column safely tells the rows apart. `extendLongKey` finds the keys where a parameter holds differing values (a variable is the parameter, plus its unit when the sheet gives that parameter in more than one unit; a blank unit is the same variable) and adds columns to the row key. It looks at no header and sets no role. A candidate (outside the key and the parameter, unit and value columns, with a header) is acceptable only when it is not unique on every row of the sheet (a record id, a note) and when, in every key where it varies, no two resulting rows have disjoint parameter sets: a replicate that lacks some parameters is fine (even two different ones in one sample), a running number or a per-value flag that cuts one measurement into rows with no parameter in common is refused, on colliding and non-colliding keys alike. Among the acceptable columns it is greedy: the column that fully resolves the most colliding groups together with those already taken. Two candidates with the same count that split the rows identically (a replicate and its label) are one choice, the first is taken; two that split the rows differently leave the choice open and neither is taken. When a collision in a key the chosen columns vary in stays unresolved, none is taken; a collision that the give-way below settles inside each resulting row (`NA`, then the value, in one replicate) is not unresolved, but it does not count in favour of a column either. The number of rows a column makes has no limit: rows with the same parameters count as one set, so a cast of thousands of levels is read like a short one. **Known limits:** (1) a balanced flag with no other candidate (a QC of 0 and 1 on every pair, without a replicate column) cannot be told from a replicate without guessing, so it joins the key and `ROW-LONG-KEY-EXTENDED` names it; the header is not trusted either way. (2) Columns that separate the rows only jointly (a cruise and a station, both needed) are not found. (3) One real second value, or `nd`, `n.d.`, `ND` or `n.a.` before a value, inside a row the column makes refuses that column for the whole sheet; the first value is kept and `ROW-LONG-VALUE-SKIPPED` reports the rest. `ROW-LONG-KEY-EXTENDED` (info) names the columns and some of the rows (at most 20 lines) whose values are now read; it never says that everything was read. Where a collision stays, the first value is kept and `ROW-LONG-VALUE-SKIPPED` (warning) says how many values were not read, with one parameter as an example and the lines, and that no column could safely be used to tell the rows apart; both findings can appear in one sheet and describe different keys. **Which value is kept.** When nothing separates the rows, one value is kept: the first, except that a kept value that is blank or a plain missing token (blank, `NA`, `N/A`, `NaN`, `-`, `--`, `null`) gives way to the first value after it, which is then read and not reported. `nd`, `n.d.` and `ND` mean not detected, which is a result: they do not give way, and a value after them stays reported by `ROW-LONG-VALUE-SKIPPED`; `n.a.`-like variants do not give way either. The give-way happens only when the sheet is built; the choice of a separating column compares the cells as written, so two replicates with complementary blanks are two rows, not one merged row. Exact duplicates add nothing and a sheet with no differing collision costs one scan and is built exactly as before. The columns that place a measurement vertically are part of the key even when they are not the depth slot (a sediment depth, an ice or soil depth, a depth bottom: `isVerticalCoordinateKey`). `/convert` is unaffected: `pivot.ts` keeps every column but the parameter, unit and value in the key of a long sheet.
- Positions are compared with land only where the bundled 0.05° grid speaks; the coastal band,
  rivers and canals are never judged, and if the grid cannot load the report says so.
- Ship speed is not tested unless a cruise column is mapped or the user declares one ship.
- Oxygen in a unit with no cited range is not range-checked (`notChecked.oxygenUnit`).
- The metadata draft's bounding box crosses the antimeridian only as one box (west > east); data in two far-apart regions on either side of the globe gives the plain minimum and maximum (no multi-box).
- In server mode a linked file above 30 MB (proxy `MAX_BYTES`) is not read and an archive above
  100 MB is refused; in browser mode only archives are capped by the reader. For Dataverse files a
  known size above 30 MB is reported before download.
- Files of a linked record that are not tables (NetCDF, zip, SPSS, pictures) are not read.
- Browser mode depends on the data host allowing cross-origin requests; most IPT servers do not, so
  an archive by link usually needs server mode.

**`/licence`**

- GBIF and OBIS dataset page links are not read.
- Only identifiers and names the tool knows are classified; the rest is "check manually", never open.
- A source that could not be read says nothing about a licence.

**`/collection`**

- Licence and metadata rules only; no data is read.
- CSW catalogues are limited to the closed list; a catalogue's own total can be wrong and the run says
  when what it got differs from what was announced.
- Zenodo records beyond what one day's 10 000-record window can list cannot be reached.
- A run with unread pages is finished but not complete, and its fix list says so.

**`/convert`**

- `CONV-SAMPLE-PER-ROW` is a heuristic with known limits: a station with sightings of 25 or more taxa at one fixed position
  (ROV dives) can fire; a true split whose revisits have no date stays silent; events more than occurrences count as
  evidence alone only when the events are at least 80% of the sheet's taxon rows and there are two taxa or more.
- A biomass column named `Biomass`, `Wet weight` or `Weight` with no unit anywhere in its header still writes no `measurementUnit` (nothing is guessed; the unit has to be in the header), but it is no longer silent: `CONV-BIOMASS-UNIT-UNCLEAR` (its variant for a header with no unit at all) names the column and the number of values and has to be accepted before the export.
- Exact copies of a row are found only when the quantity is above 1 and every column but a per-row identifier is the same; `CONV-ROW-COPIES` is the only advice for them, and it does not look at rows that differ in anything (those are `CONV-QUANTITY-SAME-IN-SAMPLE` at best). Repeated totals, same quantities and copies are all read from the values with fixed lines (4 groups, half of the groups, a value at least the number of rows); a sheet whose size classes are real counts that happen to coincide is told so and has the button *these are real counts*. A following design makes the user declare what a row is and what identifies a sample, with these checks as contradictions.
- Known and left for the redesign: a weight and a dry weight that both repeat, the word "identical" in the copies messages when a per-row identifier differs, the advice of the first group in a duplicate-identifier message, and the sums of `CONV-ROW-COPIES` while it blocks (they are those of the source rows; the sums of `CONV-QUANTITY-SAME-IN-SAMPLE` and `CONV-ROW-COPIES-SPECIMENS` are those of the archive).
- A join lends position and date but no depth when the lookup rows of a key differ only in depth, and says nothing about it. A positive elevation (above sea level) is written as a negative depth.
- `Hour` and `Minute` columns of a date in parts are not read.
- `CONV-TIME-HOLDS-DATES` and `CONV-TIME-SOME-DATES` count the cells of a time column that the date parser reads as a full date (ISO, `YYYY/MM/DD`,
  `DD.MM.YYYY`, `D/M/YYYY` with one deciding part, with or without `HH:MM`, and a spreadsheet serial in a column the workbook formats as a date; a plain number such as 63000 or 43200 is a time)
  and, since the last round, the cells that look like a date but that no reader reads: `20030117 0830`, `Jan 17 2003`, `01/17/2003 8:30 AM`. These are not read (no AM/PM, no month names, no
  guessed day/month order), but they are said, not lost in silence; as "Date and time" they are then named by `ROW-DATE-UNPARSEABLE`. A column of such cells that the proposer reads as date and time by
  itself (full ISO datetimes, `2003/01/17 08:30`) raises neither. Placeholder dates (`1899-12-30`, `1970-01-01`) are not dates: their time part is the time.

- A replicate level exists only for a column with the role Replicate / sub-sample; a profile sheet
  does not read that role (its replicate column is ignored without a word), and a sample's replicates
  are not compared with each other (they may differ in date or position; the sample takes the span).
- A statistics line is told from a station by its date and position and by its label (an
  unambiguous one, or a block of label rows); a station called `Mean` with neither a date nor a position
  is skipped (and said, so it can be renamed). Short codes alone (`N`, `SE`) are asked about.
- Revisits are told apart within one sheet only: the same station and code on different dates in
  different sheets or files still collide (`CONV-ID-DUPLICATE`).
- A declared unit that does not fit the kind of quantity is not rejected: it is written as typed with
  no unit id (`CONV-UNIT-NO-P06`, to accept).
- Derived parent positions are rounded to 6 decimals and written without trailing zeros, unless every
  child is written with the same text for that coordinate (then the parent has it: `54.50`, `-54.500`);
  the same holds for a depth end. Coordinates given in degrees and minutes are written as decimals.
- The archive is limited to 100 MB, 150 MB per entry and in total, and 1000 entries.
- A long environmental sheet with one parameter, or more than 200 (parameter, unit) pairs, is not
  read and blocks.
- A sheet of measured variables with no taxon or quantity column cannot be converted on its own: OBIS
  needs species records, so it blocks with `CONV-ENV-ONLY-SHEET` (mark a species-name column as the
  taxon, add a species sheet, or mark the sheet as a profile file next to one; `/check` still reads
  such a file). The measurement words that are not taken for taxa are a short list in `measured.ts`: an
  unlisted word still becomes a taxon candidate that the user must confirm or leave.
- A code in a header is only checked for its shape (P01 and P06 after an explicit `SDN:` prefix),
  never looked up; a well-shaped code that does not exist is not caught offline.
- The only unit conversions are depths: centimetres to metres for a depth below the seafloor, and fathoms,
  feet and kilometres to metres for a plain depth (exact factors, original in `verbatimDepth`);
  other units are written as declared, with no conversion, and a depth column in any other unit than metres blocks.
  A depth unit is read from the header only (brackets, or a suffix of the depth word); a depth in feet whose unit sits
  only in the sheet name or the metadata is read as metres.
- Only three licences can be written (CC0-1.0, CC-BY-4.0, CC-BY-NC-4.0).
- NERC identifiers are written only from the short verified list or from a user-confirmed NVS
  result; everything else leaves the id empty with a warning to accept.
- Archives are written only in the Event core with Occurrence and eMoF extensions (not a Darwin Core
  Data Package, and not an Occurrence core).
- The zip writer has no ZIP64 and refuses an archive above its limits.
- Positions are not compared with land.
- Companion-file settings only pre-tick boxes; nothing is stored in the browser.

---

## 15. Keeping this document current

Behaviour described here is read from the code, so a change to an application's behaviour changes
this file: update the section of the affected page in the same change (`CONTRIBUTING.md` asks
for it). When you add, remove or re-severity a rule, regenerate `docs/rules.md` and refresh the
counts in section 13 (state the commit). When a host, limit or timeout constant changes, change
the sentence that names it. When a new `fetch`, `sendBeacon` or analytics parameter is added,
update section 2 **and** the privacy page text, and keep `test/convert/no-network.test.ts` true.
Prefer naming the constant or linking `docs/rules.md#<RULE-ID>` over copying a number.

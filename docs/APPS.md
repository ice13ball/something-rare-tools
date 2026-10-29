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
the browser". Three things derived from your files can leave it, and the table below lists them:
**taxon names** when you press the WoRMS lookup on `/convert` (`lookupWormsNames`); **a word you
type** in an NVS search on `/convert` (`searchNvs`); and **the map area of the positions**, as CARTO
tile requests, automatically after a `/check` report that has positions (`MapPreview`, `fitBounds`).
Taxon names and search words can reveal unpublished findings (the privacy page says so). The links
and identifiers you paste are, of course, sent to the record's host. A test fails when a module of
the converter other than the two opt-in files calls `fetch` (`test/convert/no-network.test.ts`).

| What | Where it goes | When | What it carries |
|---|---|---|---|
| **A link, DOI or id you paste** (`/check`, `/licence`) | **Browser mode (default):** your browser fetches the public record and its files directly from an allowlisted host. **Server mode (you choose it):** `POST /api/fetch` to this site's server, which fetches for you. | Only when you submit a link. | The URL of the record or file. In server mode the URL travels in a JSON body, never in a query string (`serverFetcher`, `src/core/sources/fetcher.ts`). The server's application log keeps only host name, status and byte count (`logHost`, `server/index.ts`). |
| **Collection review** (`/collection`) | DataCite (`api.datacite.org`) and Zenodo (`zenodo.org`) are asked **by your browser directly**. CSW catalogues are asked **through `POST /api/csw`** on this site's server. | While a run is going. | A DOI batch, a DataCite client or prefix, a Zenodo community name; for a catalogue only a catalogue id from a closed list plus the operation, start position, page size and schema name; the server builds the catalogue request itself (`server/csw.ts`, `parseCswBody`). |
| **Check a record's data files** (button on a `/collection` example) | Same as a link in browser mode. | Only when you press it. Browser mode only. | A DOI. |
| **WoRMS lookup** (`/convert`, opt-in) | `www.marinespecies.org`, directly from your browser, **not** through the server. | Only when you tick the box **and** press the lookup button. A companion file can tick the box; ticking sends nothing. | Taxon names only (the scientific name after the approved split), at most 50 per call (`WORMS_BATCH_MAX`) (`src/app/optins/worms.ts`). |
| **NVS search** (`/convert`, opt-in) | `vocab.nerc.ac.uk`, directly from your browser, not through the server. | Only when you tick the box, type a word for a column and press that column's search button. | Only the word you typed (or, as a fallback when the search fails and the text is exactly a concept code, that code) (`src/app/optins/nvs.ts`). No cookie, no storage, no Referer (`referrerPolicy: 'no-referrer'`), `credentials: 'omit'` on both lookups; the browser's CORS `Origin` header (the site's address) is still sent. |
| **GBIF / OBIS datasets** (`/check` by link or DOI; `/licence` only for a DOI that DataCite routes to GBIF) | The registry (`api.gbif.org` or `api.obis.org`) is asked for the archive's address; the archive is then downloaded from one of the IPT hosts in `config/ipt.ts`, never from any other host a registry may name. | Only when you paste such a link or DOI. | The dataset identifier; then a download URL. |
| **Map preview** (`/check`, after a check) | The base map is loaded from CARTO (`basemaps.cartocdn.com` and its tile hosts, `MAP_HOSTS` in `config/hosts.ts`), **automatically** as soon as the report has at least one position (`MapPreview`). There is no opt-in. | After every check with positions. | The map library requests style, tiles, glyphs and sprites; the tile addresses reveal the map area shown, not the points (the points are drawn locally). CARTO also sees your IP address. |
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

**Workbooks** (`parse/xlsx.ts`). Row numbers are Excel row numbers; columns stay aligned to
column A. The header is the first row with at least two non-empty text cells (else two non-empty
cells, else the first non-empty row). Formula cells are never evaluated (the cached value is
read). Numbers stay numbers, everything else is trimmed text, blank is empty. The 1904 date system
is detected and reported (`IN-DATE1904`). Before SheetJS touches a workbook, its zip directory is
read, because SheetJS never returns on some damaged zips.

**PANGAEA textfiles** (`parse/pangaea.ts`). The header block becomes embedded metadata (citation,
licence, coverage, parameters in column order); the first line after it is the table header.

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
convention); `DD/MM/YYYY` or `MM/DD/YYYY` (also with `-`) **only** when one part above 12 decides
the order, or when the column's order is decided by `detectDayMonthOrder` from all cells of the
column (a column that mixes unambiguous DD/MM and MM/DD cells is `conflict` and every such date
that differs in its parts is unparseable); `YY-MM-DD` (century inferred, always flagged
`ROW-DATE-YYMMDD`); an ISO interval `start/end` (the start is the date; the end must parse and not
precede the start); a bare 4-digit year string. An Excel serial is read as a date **only** when the
column holds date-formatted cells (`dateFormatted` is a per-column flag of the sheet), and the 1900 or 1904 system is applied; a number in a
text column is never guessed to be a serial. Calendar dates are validated (`2021-02-30` is
unparseable). All arithmetic is on UTC milliseconds, so the machine's time zone cannot move a
date. A time with no zone stays "unknown" (`ROW-TZ-UNKNOWN`), except that a date or time column whose
header names UTC or GMT (`UTC_HEADER`, `dataset.ts`) is read as UTC and raises no such finding; a separate time column is combined
with a day-precision date (`combineDateTime`).

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
   bottom or a Secchi or mixed-layer depth. Pressure is its own role: water pressure in a sea
   pressure unit; air, barometric, vapour, partial and gas pressures are not.
6. **P01 codes** (`SDN:P01::CODE`) in a header, only when the name said nothing.
7. **A date-formatted xlsx column** becomes a date or datetime.
8. **Values**, only when no name or code explained the column and the column is not numeric:
   degrees-and-minutes text with hemisphere letters (latitude or longitude by the letters), and
   columns in which every value is an ISO date (low confidence).
9. **Otherwise a numeric column is a variable.** Its name is the canonical variable name when the
   header matches the vocabulary (high confidence), else the header as written (low confidence,
   reason "numeric, name not recognised"). An identifier-shaped name is never a variable on
   `/check`; an abundance word (`Count`, `Individuals`) is ignored when it has no unit or a plain
   count unit (`[n]`, `[ind]`) and is a variable when it carries another unit (`ind/m2`, `cells/L`,
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
  kind; header equality scores 2, a strong kind scores 1; the best score wins. A lookup sheet with
  no measurements of its own is not a table in the plan.
- **Transposed** (parameters in rows, samples in columns): detected when column A holds at least
  two labels that read as known column names, none of the other header cells does, and at least
  half the cells right of A are numbers. **Not supported**: reported as `IN-LAYOUT-UNSUPPORTED`
  with the reason.
- **Header problems** that are also unsupported: more than half of three or more header cells
  empty (`header-empty`); a first row of units under the header, in at least two numeric columns
  (`header-units`); no table, no rows, or no data sheet at all.
- Sheets with neither a position nor a measurement (legends, notes) are left out of the plan.
- The sheets of a wide workbook that do not depend on each other become separate datasets
  (`splitLayout`), so their depth units, dates and variables are never mixed.

`/convert` does not use this plan: it reads each sheet as one table and has its own handling of
long environmental sheets (8.4).

### 3.5 Rules, findings and severities

**A rule** (`src/core/rules/*.ts`, assembled in `registry.ts`) has an id, a category (`input`,
`A` licence and metadata, `B` rows and Darwin Core, `C` across files and chemistry), a severity,
a plain wording for a non-specialist and a technical wording, in four languages, optional
`thresholds` (a number with its unit and a citation) and `citations`. Every **published**
limit a check compares against is read with `threshold(ruleId, name)`, which throws on a typo, so it
cannot drift from the rule that cites it. The tool's **own choices** are named constants in the
code, not rule thresholds: `SPREAD_KM` (10) and `FAR_KM` (1000) in `checks/rows.ts` (the rules
`ROW-STATION-SPREAD` and `ROW-STATION-SPREAD-FAR` have no thresholds), `SHIP_SPEED_MIN_SEPARATION_KM`
(10, `checks/constants.ts`), `MIXED_SHARE`, `MIXED_MIN` and `MIN_EVENTS` in `checks/speed.ts`,
`SIGN_FLIP_KM`, `SIGN_FLIP_MIN_KM` and `SIGN_FLIP_RATIO` in `checks/rows.ts`, `ON_LAND_MIN_KM` (50),
`ON_LAND_NEAR_MIN_KM` (10) and `COAST_BUFFER_KM` (5) in `geo/land.ts`, and `DWC_MIN_TERMS` (3) in
`checks/dwc.ts`. A **finding** is an instance of a rule on a file, sheet,
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
  ([ROW-LAT-EQ-LON](rules.md#ROW-LAT-EQ-LON)); rows without a position while others have one
  ([ROW-NO-COORD](rules.md#ROW-NO-COORD), which skips blank trailing rows, summary rows and rows
  that inherit a position from a parent event); non-numeric tokens and variants of a missing-value
  token in numeric columns; unparseable, missing, future ([ROW-DATE-FUTURE](rules.md#ROW-DATE-FUTURE),
  judged so that a date within a day of today in the furthest-ahead time zone is not "future"),
  year-outlier and `YY-MM-DD` dates; unknown time zone; a missing unit; depth sign, range and
  min above max; invisible characters inside a value; **the same station at positions that differ
  by a typed digit, exchanged axes or a sign** ([ROW-STATION-MOVED](rules.md#ROW-STATION-MOVED):
  as written far apart, but close and much closer once the candidate flip is applied) and a
  station spread over a long distance ([ROW-STATION-SPREAD](rules.md#ROW-STATION-SPREAD),
  [ROW-STATION-SPREAD-FAR](rules.md#ROW-STATION-SPREAD-FAR)); positions on land
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
  raised for an event that already has a two-sided finding. If findings blame more
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
  anywhere ([META-NO-DATES](rules.md#META-NO-DATES)).
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

### How a mapping becomes rows (`buildDataset`, `src/core/dataset.ts`)

- **Values are parsed, never changed.** Out-of-range coordinates keep their number (the range
  rules report them); sign conventions are not flipped; a missing value has status `missing` and
  raises nothing.
- **Wide**: one row per source row. **Long**: one row per sample key (sample or core id, station,
  cruise, depth, date, time and in-sheet position as raw text), numeric cells keep their own line
  numbers, a repeated (sample, parameter) keeps the first value; units per parameter come from the
  unit column or from the parameter text (`DIC [umol/kg]`). **Join**: position, date and station
  come from the lookup sheet; when the data names no station, the sample id is the station.
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
  (`degrees_east`), `depth`, then each variable as `name [unit]`. Values are written **from the
  original text**; a decimal-comma file keeps every character except the separator; coordinates
  parsed from degrees-minutes are written as decimal degrees rounded to the precision of the
  source and a note says so; every text cell passes the formula guard (a leading `= + - @` or tab
  gets an apostrophe), the OWASP rule for spreadsheets. Notes record an unknown time zone, an
  unparseable date, an unstated depth unit and an upward depth.
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
  ±180°, so data across the antimeridian gives a very wide box (the check
  [META-POINT-OUTSIDE-BBOX](rules.md#META-POINT-OUTSIDE-BBOX) does handle a *record's* box with
  west greater than east, but the draft does not write one).
- **Map preview**: points on a CARTO dark base map (`MapPreview`, `mapModel.ts`), coloured by worst
  severity; a click opens the row's file, line, station, date and values (fetched from the worker
  by file and line, built with `textContent`). `maplibre-gl` is imported only when there is
  something to show. See 2 for what this loads.

On the report, citations are hidden under `LIC-*` findings (`NO_CITATIONS_IN_CHECK`,
`ReportView.tsx`): `/licence` and `docs/rules.md` show them.

### Limits and known gaps

- Transposed tables, a header split over several rows, and a units row under the header are
  **not supported** (3.4); the report says so.
- Darwin Core: only the core is read; extension tables are not compared.
- Long layouts keep the first value of a repeated (sample, parameter) pair.
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
never writes a vocabulary identifier the user did not confirm.

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
`quantity`, `quantityType`, `effort`, `occurrenceId`, `lifeStage`, `qualifier`, `taxonId` (an
AphiaID column or any other ID, as given), and `depthBelowSeafloor`. It reads Darwin Core terms as
roles (`occurrenceID`, `eventID` as the sample code, `scientificName`, `individualCount`,
`organismQuantity`, `organismQuantityType`, minimum/maximum depth, `lifeStage`,
`identificationQualifier`).

**Measured variable or taxon name?** This is the central decision for a **wide** sheet, where a
species is a numeric column with the species as its header. The shared proposer calls such a
column a variable. The overlay decides on the **name part** of the header (unit and trailing
brackets cut off), in this order (`nameKind`, `convert/measured.ts`):

1. a **sample descriptor** (Replicate, Cast, Bottle, Niskin, Station no, …) is ignored;
2. a **known variable token or formula** (PN, Ntot, d15N, C/N, GPP, Chl a, …) is a variable;
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

Other overlay decisions: a **summary column** (a header starting with or holding Total, Suma,
Razem, Summe, Gesamt, Somme, Sum, Σ) starts **ignored**, because converting it would count the
same individuals twice (`Totalia sp.` is a genus and stays); a **quality-flag** column
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
- **Transposed** sheets: the converter reads each sheet as one table with no joins; a header with
  no name for a column is `CONV-COLUMN-UNNAMED` (blocks until the variable has a name or the
  column is ignored). The converter **never runs layout detection** (`layoutOf` in
  `convert.handler.ts` lists each sheet as a table), so a transposed sheet is read silently with its
  first row as the header, and `IN-LAYOUT-UNSUPPORTED` cannot come from a `/convert` input.

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
comma) needs its own action). An undecided split blocks (`CONV-SPLIT-UNDECIDED`). The user can edit
any split.

**WoRMS identifiers are written only from the sheet or from the opt-in** (`scientificNameID`): an
AphiaID column becomes `urn:lsid:marinespecies.org:taxname:<AphiaID>`, any other taxon id column is
written as given, and a name with a sheet id on any row is never sent to WoRMS. The WoRMS rules
(8.10) decide the rest. The LSID of the **matched record itself** is written, even when that record
is an unaccepted name (the OBIS Manual says the LSID must match the name in `scientificName`, not
the accepted name).

### 8.6 Events and identifiers

The event tree is **cruise → station → sample** (`buildEventTree`, `convert/events.ts`), with an
optional **profile level** under a station.

- **Identifiers** (`convert/ids.ts`): sample `eventID` = the user's own sample code (optionally
  prefixed with the station's `eventID` when codes repeat between stations); station `eventID` =
  `cruise:station` (the station code alone with no cruise); cruise `eventID` = the cruise code.
  `occurrenceID` of a wide sheet is `<sample eventID>:<taxon name of the column>`, where the name is
  the header without its unit and remark (or a PANGAEA parameter's long name), with the remark or
  header added only to tell apart two columns of the same name (`taxonColumnNames`,
  `convert/headers.ts`); of a long sheet the
  user's occurrence-id column, else `<sample eventID>:<exact taxon cell>` plus the life-stage column
  when there is one. **A sample's id is never derived from depth, row order or a WoRMS name.** The
  only generated codes are a **one-time proposal** (`proposeSampleCodes`: the sheet as a CSV with a
  new code column last, for the user to check and drop again); a missing code blocks
  (`CONV-SAMPLE-CODE-MISSING`); a repeated id blocks (`CONV-ID-DUPLICATE`); rows of one sample that
  disagree on date, position or depth block (`CONV-SAMPLE-CONFLICT`); rows whose sample code or
  station is exactly `total`, `suma`, `razem`, `summe`, `gesamt` or `somme` (any case,
  `SUMMARY_LABEL`, `convert/ids.ts`) are skipped and said. Other summary rows (`Mean`, `SD`,
  `Median`, …) are **not** recognised here and are converted as samples.
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
  no rounding). This is the **only unit conversion the converter makes anywhere**; any other unit is
  refused (`CONV-SEAFLOOR-UNIT`), and a plain depth column is never rescaled (`CONV-DEPTH-UNIT`).

### 8.7 Occurrences, zeros and what a cell becomes

For each taxon cell (`convert/build.ts`):

- an **empty cell** makes no record; an **NA token** makes no record and is counted
  (`CONV-NA-SKIPPED`); an NA variant is reported as on `/check`;
- a **negative number** is not converted and blocks (`CONV-NEGATIVE-QUANTITY`);
- **zero**: not converted and counted unless the user ticked **"this is a full species list"**
  (kept only in the companion file), and then it becomes `occurrenceStatus` **absent**
  (`individualCount` 0 for counts, no measurement row); an empty or NA cell never becomes a record;
- a **non-integer** in a declared count blocks (`CONV-COUNT-NOT-INTEGER`);
- a **text cell** (`+`, `x`) becomes an occurrence with status present, no quantity, and the text
  in `occurrenceRemarks`, as a warning to accept (`CONV-TEXT-IN-TAXON-CELL`);
- otherwise status **present**, with the quantity as declared in 8.3.

The same taxon twice in one event is warned (`CONV-TAXON-SAME-EVENT`). **Presence-only species
lists** (a taxon column and no quantity column) are **not written yet**: one blocking finding says
so (`CONV-SPECIES-LIST-NO-COUNTS`, or `CONV-TAXON-NO-QUANTITY` when there are other numeric
columns) instead of three contradicting ones.

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
- **Only shown**, never blocks, never asks: the prefixes `CHEM-`, `ROW-SHIP-SPEED`, `ROW-ON-LAND`,
  `ROW-STATION-`, `XF-`, `META-`, `LIC-` (`SHOW_ONLY_PREFIXES`).

The tables are validated by the same code `/check` uses: the Event table as a synthetic Darwin
Core Archive with an Event core through `buildDatasets` and `runChecks`; the Occurrence table through
`checkRawTable`; the eMoF table and the cross-table links by checks of its own
(`CONV-EMOF-ORPHAN`, `CONV-EMOF-EVENT-MISMATCH`, `CONV-EMOF-VALUE-EMPTY`, `CONV-EMOF-TYPE-EMPTY`),
and the description by `metadataFindings`. A warning that BioCheck gives (no sampling descriptor or
effort among the `measurementTypeID`s) is `CONV-NO-SAMPLING-DESCRIPTOR`. **The land mask is not
loaded here**: the converter does not compare positions with land (`ROW-ON-LAND` cannot arise).

### 8.9 What the archive contains

**`event.txt`** (Event core; `convert/dwca.ts`): `eventID`, `parentEventID`, `eventType`
(`cruise`, `station`, `sample`, `profile level`: there is no controlled list in the OBIS Manual),
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
comma turned into a point); **nothing is rescaled**. The exceptions are computed values: a derived
parent position is rounded to 6 decimals (`round6`, `DERIVED_DECIMALS` in `events.ts`), and a
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
(4) for the typed text.

### Limits and known gaps (confirmed from code and rule texts)

See also section 14.

### Network calls and opt-ins

None by default. WoRMS and NVS as above; analytics `convert_started` (when files are read),
`convert_blocked` (when Export is pressed while something blocks; a count) and `convert_exported`
(shape, flags and counts, 2). The CSP of `/convert` blocks every other host.

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
| Column and layout recognition | `src/core/recognize/` (`columns.ts`, `layout.ts`, `vocab.ts`, `headerWords.ts`, `reasons.ts`) |
| Typed rows | `src/core/dataset.ts` |
| Checks | `src/core/checks/` (`run.ts`, `rows.ts`, `speed.ts`, `crossfile.ts`, `chemistry.ts`, `metadata.ts`, `licence.ts`, `dwc.ts`) |
| Rule definitions, citations, registry | `src/core/rules/` (`registry.ts`, per-category files, `citations.ts`) |
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
assembles the per-category files) by a throwaway script run outside the commit, at commit
**`36521bf`**. The total, **159 rules**, equals the number of rule rows in
[`docs/rules.md`](rules.md), which is generated from the same registry and **is the authoritative
list** (ids, severities, thresholds, full citations): treat this table as a map to it, and
regenerate it when rules change.

| Prefix | Category in the registry | Rules | Error / Warning / Info | What it covers | Main sources it cites (as named in the rule definitions) |
|---|---|---|---|---|---|
| `IN-` | `input` | 27 | 12 / 9 / 6 | Getting and reading input: downloads (blocked, timeout, interrupted, host not allowed, archive limits), records with no data file, unreadable files, encoding, decimal comma, short header, 1904 dates, unsupported layout, Darwin Core Archive reading. | Almost none: these are the tool's own handling. One cites Microsoft's description of the Excel date systems. |
| `LIC-` | `A` | 11 | 1 / 10 / 0 | Licence statements across ISO, DataCite, Zenodo and PANGAEA records (3.5, 6). | DataCite Metadata Schema 4.6 (Rights); Creative Commons FAQ; INSPIRE Technical Guidelines for ISO 19139 metadata; GO FAIR principle R1.1; OpenAIRE Guidelines for Data Archives; SPDX. |
| `META-` | `A` | 7 | 1 / 4 / 2 | The record itself and the record against the data: links, version, extents, abstract variables, no dates. | None cited in the rule definitions (the rules are stated in their own text). |
| `ROW-` | `B` | 32 | 6 / 16 / 10 | Row-level checks: coordinates (range, zero, swapped, hemisphere, land), dates, units, depth, ship speed, stations that move, invisible characters. | Argo QC manual for CTD data; Met Office marine-qc ("Track check"); OBIS obis-qc; GTSPP real-time QC manual; MEDATLAS protocol; World Ocean Database user's manual. |
| `DWC-` | `B` | 8 | 6 / 2 / 0 | Darwin Core structure of a table or archive: required and recommended terms, ids, hierarchy, vocabularies. | OBIS obistools (`check_fields`, `check_eventids`); OBIS Manual; EMODnet BioCheck; OBIS obis-qc; GBIF basis-of-record vocabulary. |
| `XF-` | `C` | 6 | 0 / 4 / 2 | Across several datasets (3.5). | Few (two rules cite GLODAP and UNESCO Technical Paper 44); "equal" is derived from reported precision, not from a threshold. |
| `CHEM-` | `C` | 3 | 0 / 3 / 0 | Unit pairs by molar mass, DIC above total alkalinity, global range test. | Argo QC manuals (CTD, dissolved oxygen); CIAAW atomic weights; Dickson, Sabine & Christian (2007); GTSPP; TEOS-10. |
| `CONV-` | `B` | 65 | 33 / 21 / 11 | The converter's own findings (section 8). | OBIS Manual (Darwin Core, eMoF, name matching, common issues); OBIS obistools; EMODnet BioCheck. |
| **Total** | | **159** | | | |

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
  number of terms that make a table Darwin Core. Only the rule texts that say so state it.
- No page claims data is publication-ready; reports list what they do not check.
- Server counters (rate limits, daily budgets) are in memory and per server instance.

**`/check`**

- Transposed tables, tables with a units row under the header, and empty-header tables are not read
  (`IN-LAYOUT-UNSUPPORTED`).
- Darwin Core Archives: only the core table is read; at most 200 000 rows (`IN-DWCA-PARTIAL`),
  100 MB, 1000 entries; extension tables are not compared.
- A repeated (sample, parameter) pair in a long layout keeps the first value.
- Positions are compared with land only where the bundled 0.05° grid speaks; the coastal band,
  rivers and canals are never judged, and if the grid cannot load the report says so.
- Ship speed is not tested unless a cruise column is mapped or the user declares one ship.
- Oxygen in a unit with no cited range is not range-checked (`notChecked.oxygenUnit`).
- The metadata draft's bounding box does not handle data across the antimeridian.
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

- Presence-only species lists (taxon column, no quantity column) are not written.
- No layout detection: a transposed sheet is read as a table with row 1 as header, without a warning.
- Summary rows are recognised only by the six words `total`, `suma`, `razem`, `summe`, `gesamt`,
  `somme`; `Mean`, `SD` and similar rows are converted as samples.
- A declared unit that does not fit the kind of quantity is not rejected: it is written as typed with
  no unit id (`CONV-UNIT-NO-P06`, to accept).
- Derived parent positions are rounded to 6 decimals; coordinates given in degrees and minutes are
  written as decimals.
- The archive is limited to 100 MB, 150 MB per entry and in total, and 1000 entries.
- A long environmental sheet with one parameter, or more than 200 (parameter, unit) pairs, is not
  read and blocks.
- The only unit conversion is centimetres to metres for a depth below the seafloor; other units are
  written as declared, with no conversion; a depth column in another unit than metres blocks.
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

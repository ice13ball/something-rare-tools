# Abyssal Claims Tools — Data check: brief (2026-10-16)

Status: decided (product owner interview, 8 rounds, 2026-10-16). This file restates the brief for the
repository. It deliberately contains **no real dataset content** — defect patterns are described
generically; the real reference records live outside the repository (see "Testing").

## Why

Scientists publish marine datasets on GeoNetwork/eCUDO, Zenodo and PANGAEA. A manual review of eight
such records found that most defects are *content*, not format: latitude written into the longitude
column, swapped station coordinates, wrong years, contradictory unit labels, a `copyright` restriction
code next to a "CC BY" licence, metadata extents that do not match the data. A converter alone would
copy those errors faithfully, so the product is a **checker first**; conversion is a by-product.

The tool never publishes anything and never stores user data. Users are often not technical: the tool
proposes, the human confirms.

## Product

Brand: **Abyssal Claims Tools**, served at `https://tools.something-rare.com`.

Pages: `/` (index with one card "Data check" → `/check`, plus a link to https://something-rare.com),
`/check`, `/privacy`. Any other path is a real HTTP 404. Languages pl, en, de, fr from day one, en
fallback.

### Inputs

- Drop one or more CSV/xlsx files. Several files in one session enable cross-file checks.
- Optionally drop ISO 19139 XML (e.g. an unpublished GeoNetwork record export) or DataCite XML/JSON, so
  metadata can be compared with data.
- Zenodo record link or id: record metadata + data files. A record with only PDFs → "this record
  contains no data file" (tables are never extracted from PDFs).
- GeoNetwork record link or UUID: ISO 19139 via `/srv/api/records/<uuid>/formatters/xml`; data files
  from the record's distribution links.
- DOI: DataCite API → landing URL → routed to the Zenodo / GeoNetwork / PANGAEA handler; DataCite's own
  `rightsList`, `dates` and `geoLocations` are used too.
- **Download mode** is a switch set at the start: "in my browser only" (default) or "via the Abyssal
  Claims server". Each is explained in one plain sentence. Dropped files never leave the browser in
  either mode; server mode only fetches *public* files of *public* records.
- One host allowlist (shared config) governs both modes: the CSP `connect-src` in browser mode, the
  fetch proxy in server mode. A link to a host outside the list is reported plainly, with the advice
  "download the file and drop it here".

### Column recognition

For every column the tool proposes a role — latitude, longitude, date/time, depth or pressure (with
sign convention), station id, cruise, measured variable + unit — from header names, OPeNDAP type
suffixes such as `"Latitude<Float32>"`, NERC P01 codes and value ranges. The user confirms or corrects
each proposal. No AI model.

Layouts: one table per sheet (wide); long format (parameter / unit / value columns → pivot); multi-sheet
join by key (e.g. coordinates in one sheet, measurements in another, joined on a core/sample id) — the
tool proposes the key, the user confirms. A layout the tool cannot handle is named plainly, never
guessed.

### Checks

One declarative rules file. Every rule has an id, a severity (error / warning / info), a plain-language
message in four languages, a technical message, and for every numeric threshold a citation (URL) to a
published QC procedure (Argo, WOD, GLODAP, SeaDataNet, …). **No invented thresholds**: a check without
a citable threshold is not shipped and is listed in the delivery report.

A. Licence and metadata vs data — licence present and machine-readable; consistent across ISO
(`useLimitation`, `otherConstraints`, `MD_RestrictionCode`), DataCite `rightsList` (SPDX id / URI) and
Zenodo `license`; version present; empty distribution links; temporal extent vs data; bounding box vs
data; variables named in the abstract but absent from the file.

B. Rows — coordinate ranges; lat == lon; points outside the bounding box; one station at different
positions; dates unparseable / outside the extent / isolated outlier years; non-numeric tokens in
numeric columns; NA variants; ragged rows (wrong field count); units missing from headers; depth sign
convention not stated.

C. Cross-file and chemistry — the same samples in several loaded datasets (match on rounded
lat/lon/date/depth); station aliases (`A2` vs `X/A2`); the same values under different unit labels
(µmol/L vs µmol/kg); unit-pair consistency (e.g. DOC in mg/L vs µmol/L via molar mass); carbonate
plausibility (DIC vs TA); physical ranges (S, T, pH, O2) — all with cited sources.

### Report

Two layers per finding: a plain sentence for the scientist (what to fix and why) on top; below it the
technical detail for IT (file, line, field, value, rule id, source). Summary counts by severity.

No "ready to publish" stamp. The wording is "no problems found in the checked categories", plus an
explicit list of what the tool does **not** check (e.g. the scientific validity of the measurements).

### Outputs

- Clean CSV: decimal degrees, ISO 8601 dates (UTC when known; "time zone unknown" flagged otherwise),
  one unit per column in the header `name [unit]`, plus a sidecar mapping original → output column
  names. GeoJSON points as an extra. No NetCDF, no GeoPackage in v1.
- Numeric cells are never altered. The formula-injection guard applies only to *text* cells starting
  with `=`, `+`, `@` (and `-` only when the cell is not a number).
- Metadata draft in two layers: values to paste, labelled like the GeoNetwork editor fields (temporal
  extent, bounding box, licence with URI, variables), and downloadable ISO 19139 XML + DataCite XML
  computed from the data.

### Map preview

Points of the mapped dataset(s) on MapLibre GL, coloured by worst finding severity; click → row
detail. Basemap: CARTO dark-matter-nolabels GL style, attribution kept.

## Hard constraints

- Standalone repository; nothing imported from the atlas repository, and the atlas backend is never
  used. Patterns may be copied.
- AGPL-3.0-or-later; every source file starts with
  `SPDX-License-Identifier: AGPL-3.0-or-later` +
  `Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`.
- No secrets in the repository (none are needed; the GA4 measurement id is public).
- **No real third-party datasets in the repository** — not as fixtures, not in snapshots, not in docs
  or commit messages. Fixtures are synthetic and reproduce each defect *pattern*.
- Hosting: one Cloud Run service (project `something-rare`, region `europe-west1`) serving the static
  app and `/api/*` from one container; min 0, max 2 instances. Server in TypeScript (Node). The checks
  run in the browser (shared TS module); the server only fetches.
- `/api/fetch` (server mode): host allowlist; https only; DNS resolved and private / loopback /
  link-local / metadata-server addresses refused on every redirect hop; redirects only to allowlisted
  hosts; 30 MB cap; timeout; per-IP rate limit (client IP from Cloud Run's `X-Forwarded-For`); logs
  carry only host + status + size, never full URLs; no disk cache, nothing stored.
- Parsing runs in a lazily loaded Web Worker. Not npm `xlsx` 0.18.5 (known CVEs). Excel serial dates
  use the 1899-12-30 epoch and honour the 1904 flag. CSV: delimiter (`,` `;` tab), decimal comma,
  encoding (UTF-8 with/without BOM; fallback Windows-1250 / ISO-8859-2 with a visible note); OPeNDAP
  type suffixes stripped for recognition, original names kept; ragged rows reported, never fixed.
  Coordinates: decimal degrees, degree-minute(-second) text with or without hemisphere letters
  (`12° 34.567'`, `54°21.500'`, a trailing `°` where `'` was meant), 0–360 longitudes → −180..180 with a
  note. Dates: ISO 8601, Excel serials, `YY-MM-DD` (ambiguity flagged).
- Units only from the source or a cited vocabulary (NERC P01/P06), never invented.
- GA4 (`G-S5HR4WT0ZG`), Consent Mode default denied + cookie banner. Events `check_started`,
  `check_finished` {input_type, mode, n_errors, n_warnings, n_info}. Never file names, DOIs, URLs or
  values in events, and nothing user-provided in the page URL — inputs live in app state.
- `/privacy` in four languages: local processing; server mode fetches only public files from
  allowlisted hosts and stores nothing; GA4 only with consent.
- SEO: `noindex` (meta robots **and** `X-Robots-Tag`) on every page, behind one config flag. robots.txt
  does not disallow (crawlers must see the noindex). No link from the atlas yet.
- CSP `connect-src`: `'self'`, the allowlisted data hosts and GA.

## Testing

- Synthetic fixtures + unit tests for every rule and every defect pattern. `npx vitest run` and
  `npx tsc --noEmit` clean.
- A golden test reads real reference records from a local directory given by `GOLDEN_DIR`; it is
  skipped when the variable is unset. Its data never enters the repository.

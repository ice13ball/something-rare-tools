# Abyssal Claims Tools — Data check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-first checker + converter for marine datasets at `tools.something-rare.com`: parse CSV/xlsx/PANGAEA, propose a column mapping and layout, run declarative cited rules (licence, metadata vs data, rows, cross-file, chemistry), show a two-layer report and a map, export clean CSV / GeoJSON / metadata drafts.

**Architecture:** One TypeScript repo. `src/core/` is pure TS (no DOM, no Node APIs) and runs both in a Web Worker and in vitest under Node. `src/app/` is a React 18 multi-page Vite app (`/`, `/check`, `/privacy`). `server/` is a small Express server that serves `dist/`, sets headers (CSP from the shared host allowlist, `X-Robots-Tag`), returns real 404s and exposes `POST /api/fetch` (SSRF-safe proxy for server mode). One Cloud Run service.

**Tech Stack:** Node 22, TypeScript 5 (strict), Vite 6, React 18, vitest, MapLibre GL 6 (4.x has GHSA-jrc7-96c5-q579), SheetJS CE pinned tarball from cdn.sheetjs.com (version from `docs/research/infra.md`), `@xmldom/xmldom` (XML in core, works in worker + Node), Express 4.

**Spec:** `docs/specs/2026-10-16-data-check-brief.md`. Research inputs: `docs/research/qc-sources.md` (cited thresholds — the ONLY allowed source of numeric thresholds), `docs/research/infra.md` (SheetJS version, CORS facts, URL patterns).

## Global Constraints

- Every source file (`.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.html` as a comment) starts with:
  `// SPDX-License-Identifier: AGPL-3.0-or-later` and `// Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`. A test (`test/spdx.test.ts`) enforces it.
- Code, comments, docs: English. UI strings: pl, en, de, fr; en is the fallback.
- ⛔ No real third-party data in the repo (fixtures, snapshots, docs, commit messages). Synthetic fixtures use invented station names (`ST1`, `ST2`, `X/ST2`, …) and invented values. The real golden set is read only via `GOLDEN_DIR`.
- ⛔ No invented numeric thresholds. Every number a rule compares against comes from `docs/research/qc-sources.md` and is stored in the rule with `citation.url`. Tolerances for "equal" / "consistent" are derived from the reported precision of the values (half a unit in the last reported decimal of each value, summed), never from a constant.
- ⛔ Do not use npm `xlsx`. ⛔ Do not import anything from `~/github/something-rare`. ⛔ Never write user input into `location` (no query strings, no hash).
- `src/core/` must not import from `src/app/`, `server/`, the DOM or Node built-ins.
- Units only from the source header/metadata or from NERC P01/P06 tables in `src/core/recognize/vocab.ts` (each entry carries its vocab URL).
- Implementers do NOT commit. The coordinator reviews, runs `npx vitest run` + `npx tsc --noEmit` in their own shell, and commits.
- Implementers may read the golden directory `/Users/ice13ball/data/sprawdzarka-golden/2026-10-16/` locally to understand real layouts, but must never copy its content (values, station names, headers verbatim) into the repo.

## Review Focus

1. **Excel serial dates and xlsx numeric cells.** A date-formatted cell must become a date, a plain number must stay a number; 1904 workbooks shift by 1462 days. Owner: Task 3 (`xlsx.test.ts` covers both systems).
2. **Negative numbers in exports.** `-5.2` must be exported unchanged; only text cells starting with `= + @` (or `-` when not numeric) get the `'` guard. Owner: Task 9 (`csv-out.test.ts`).
3. **Ragged rows and quoted delimiters.** A comma inside quotes is not a field separator; a row with one extra field is reported with its physical line and is never realigned. Owner: Task 3 (`csv.test.ts`).
4. **Browser-mode fetch blocked by CORS or CSP.** The user must see "download the file and drop it here" (and the host name), not a spinner or a generic error. Owner: Task 10 (`sources.test.ts`: fetcher throws `FetchBlockedError` → finding `IN-FETCH-BLOCKED`).
5. **SSRF via redirect.** An allowlisted host redirecting to `169.254.169.254`, `localhost`, a private IP or a non-allowlisted host must be refused. Owner: Task 11 (`fetchProxy.test.ts`).

---

## File structure

```
config/hosts.ts            DATA_HOSTS, GA_HOSTS, MAP_HOSTS, isAllowedHost(), buildCsp()
config/site.ts             SITE = { brand, noindex: true, gaId: 'G-S5HR4WT0ZG', atlasUrl }
src/core/types.ts          all shared types (Task 1, written verbatim below)
src/core/values/{encoding,numbers,coords,dates}.ts
src/core/parse/{csv,xlsx,pangaea,index}.ts
src/core/metadata/{iso19139,datacite,zenodo,licence}.ts
src/core/rules/{registry,input,licence,metadata,rows,crossfile,chemistry,index}.ts
src/core/recognize/{vocab,columns,layout}.ts
src/core/dataset.ts
src/core/checks/{licence,metadata,rows,crossfile,chemistry,run}.ts
src/core/report.ts
src/core/output/{csv,geojson,draft,iso19139,datacite}.ts
src/core/sources/{fetcher,resolve,zenodo,geonetwork,datacite,pangaea,index}.ts
src/core/i18n/{ui.ts}      UI strings 4 languages
src/worker/check.worker.ts
src/app/…                  React pages and components
server/{index,fetchProxy,rateLimit,headers}.ts
test/…                     unit tests; test/fixtures/ synthetic; test/golden/golden.test.ts
Dockerfile, .dockerignore, scripts/deploy.sh, README.md, LICENSE
```

---

### Task 1: Scaffold + shared types + config

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `check/index.html`, `privacy/index.html`, `LICENSE` (full AGPL-3.0 text from https://www.gnu.org/licenses/agpl-3.0.txt), `README.md`, `.gitignore`, `config/hosts.ts`, `config/site.ts`, `src/core/types.ts`, `scripts/spdx-header.txt`
- Test: `test/spdx.test.ts`, `test/config.test.ts`

**Interfaces:**
- Produces: `src/core/types.ts` exactly as in the block below; `DATA_HOSTS: readonly string[]` = `['opendap.iopan.pl','geo.iopan.pl','geonetwork.iopan.pl','zenodo.org','doi.pangaea.de','api.datacite.org','data.crosscite.org','doi.org']` plus any redirect hosts listed in `docs/research/infra.md`; `isAllowedHost(url: string): boolean` (https only, exact host match); `buildCsp(): string` with `connect-src 'self' https://<each DATA_HOST> <GA hosts> <CARTO hosts>`, `worker-src 'self' blob:`, `img-src 'self' data: blob: <CARTO> <GA>`, `script-src 'self' https://www.googletagmanager.com`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`; `SITE.noindex: boolean`.
- npm scripts: `dev` (vite), `build` (`vite build && tsc -p tsconfig.server.json`), `start` (`node dist-server/server/index.js`), `test` (`vitest run`), `typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`).
- Dependencies installed once here (later tasks must not add dependencies without the coordinator): react, react-dom, maplibre-gl, @xmldom/xmldom, express, SheetJS CE tarball URL (pinned version from `docs/research/infra.md`); dev: typescript, vite, @vitejs/plugin-react, vitest, @types/*, supertest.

`src/core/types.ts`:

```ts
export type Severity = 'error' | 'warning' | 'info';
export type Lang = 'pl' | 'en' | 'de' | 'fr';
export const LANGS: readonly Lang[] = ['pl', 'en', 'de', 'fr'];

/* ---------- raw input ---------- */
export type RawCell = string | number | null;          // number only for xlsx numeric cells
export interface RawRow { line: number; cells: RawCell[]; fieldCount: number }
export interface RawSheet {
  name: string;                 // sheet name; for CSV/PANGAEA the file name
  header: string[];             // original header text, OPeNDAP suffixes kept
  headerLine: number;           // 1-based physical line/row of the header
  rows: RawRow[];               // data rows only, physical line numbers
  dateFormatted?: boolean[];    // xlsx: column is date-formatted in the majority of its cells
}
export interface ParsedFile {
  fileName: string;
  kind: 'csv' | 'xlsx' | 'pangaea' | 'metadata' | 'pdf' | 'unknown';
  sheets: RawSheet[];
  date1904: boolean;
  decimalComma: boolean;
  encoding: string;             // 'utf-8' | 'utf-8-bom' | 'windows-1250' | 'iso-8859-2'
  embeddedMetadata?: MetadataRecord;   // PANGAEA header, or the record itself for kind 'metadata'
  findings: Finding[];          // parse-level findings (ragged rows, encoding fallback, …)
}

/* ---------- metadata ---------- */
export type MetadataSource = 'iso19139' | 'datacite' | 'zenodo' | 'pangaea';
export interface LicenceStatement {
  source: MetadataSource;
  field: string;                // 'useLimitation' | 'otherConstraints' | 'rightsList[0]' | 'license.id' | 'License'
  text?: string;
  uri?: string;
  spdx?: string;                // normalised SPDX id when recognised, e.g. 'CC-BY-4.0'
}
export interface MetadataRecord {
  source: MetadataSource;
  label: string;                // shown as the "file" of metadata findings
  title?: string;
  abstract?: string;
  version?: string;
  licences: LicenceStatement[];
  restrictionCodes: { kind: 'access' | 'use' | 'other'; code: string }[];
  temporalExtent?: { start?: string; end?: string };   // ISO 8601 dates
  bbox?: { west: number; east: number; south: number; north: number };
  distributionLinks: { url: string; name?: string; protocol?: string }[];  // url may be ''
  files?: { key: string; url: string; size?: number; mimetype?: string }[];
  resourceType?: string;
  doi?: string;
  landingUrl?: string;
  parameters?: { name: string; unit?: string }[];      // PANGAEA parameter list
}

/* ---------- mapping and layout ---------- */
export type ColumnRole =
  | { kind: 'latitude' } | { kind: 'longitude' }
  | { kind: 'datetime' } | { kind: 'date' } | { kind: 'time' }
  | { kind: 'depth'; positive: 'down' | 'up' | 'unknown'; unit?: string }
  | { kind: 'pressure'; unit?: string }
  | { kind: 'station' } | { kind: 'cruise' } | { kind: 'sampleId' }
  | { kind: 'variable'; variable: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
  | { kind: 'ignore' };
export interface ColumnProposal { index: number; header: string; cleanHeader: string; role: ColumnRole; confidence: 'high' | 'low'; reason: string }
export interface SheetMapping { sheet: string; columns: { index: number; header: string; role: ColumnRole }[] }
export interface TablePlan { sheet: string; long?: { parameterCol: number; unitCol?: number; valueCol: number } }
export interface LayoutPlan {
  tables: TablePlan[];
  joins: { left: string; right: string; leftKey: number; rightKey: number }[];   // sheet names + column indices
  unsupported?: string;         // plain description of a layout the tool cannot handle
}

/* ---------- dataset ---------- */
export interface ParsedDate {
  iso: string;                  // '2021-07-25' | '2021-07-25T10:30' | '2021-07-25T10:30:00Z'
  year: number;
  precision: 'year' | 'month' | 'day' | 'minute' | 'second';
  tz: 'utc' | 'offset' | 'unknown';
  ambiguity?: 'yy-mm-dd';
}
export interface NumericCell { raw: RawCell; line: number; value?: number; decimals?: number; status: 'ok' | 'missing' | 'non-numeric' | 'na-variant' }
export interface Variable { key: string; header: string; canonical?: string; unit?: string; unitSource?: 'header' | 'p01' | 'metadata' | 'user'; p01?: string }
export interface DataRow {
  file: string; sheet: string; line: number;            // line of the row that carries the position
  lat?: number; lon?: number; latDecimals?: number; lonDecimals?: number;
  datetime?: ParsedDate; dateRaw?: RawCell;
  depth?: number; station?: string; cruise?: string; sampleId?: string;
  values: Record<string, NumericCell>;                   // key = Variable.key
}
export interface Dataset {
  id: string; label: string; file: string;
  rows: DataRow[]; variables: Variable[];
  mappings: SheetMapping[]; layout: LayoutPlan;
  metadata: MetadataRecord[];
  depthPositive: 'down' | 'up' | 'unknown';
}

/* ---------- findings and rules ---------- */
export interface Finding {
  ruleId: string;
  severity: Severity;           // copied from the rule by makeFinding()
  file?: string; sheet?: string;
  lines?: number[];             // sorted, unique, physical lines
  field?: string; value?: string;
  params: Record<string, string | number>;
  datasetIds?: string[];
}
export interface Citation { label: string; url: string; locator?: string }
export interface Threshold { name: string; value: number; unit: string; citation: Citation }
export interface RuleDef {
  id: string;
  category: 'input' | 'A' | 'B' | 'C';
  severity: Severity;
  plain: Record<Lang, string>;   // template with {param} placeholders
  technical: string;             // English, template with {param}
  thresholds?: Threshold[];
  citations?: Citation[];
}

/* ---------- session and report ---------- */
export interface LoadedRecord {
  label: string;
  kind: 'zenodo' | 'geonetwork' | 'datacite' | 'pangaea' | 'dropped';
  metadata: MetadataRecord[];
  files: { name: string; url?: string; bytes?: Uint8Array }[];
  findings: Finding[];
}
export interface CheckSession { datasets: Dataset[]; records: LoadedRecord[]; parseFindings: Finding[] }
export interface Report {
  findings: Finding[];
  counts: Record<Severity, number>;
  notChecked: string[];          // ui message keys
}
```

- [ ] **Step 1: Write `test/spdx.test.ts`** — globs `src/**`, `server/**`, `config/**`, `test/**/*.ts`, `*.html`, `vite.config.ts`; asserts the first two non-empty lines (after `<!--` for HTML) contain `SPDX-License-Identifier: AGPL-3.0-or-later` and `Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com`.
- [ ] **Step 2: Write `test/config.test.ts`** — `isAllowedHost('https://zenodo.org/api/records/1') === true`; `isAllowedHost('http://zenodo.org/x') === false`; `isAllowedHost('https://zenodo.org.evil.com/') === false`; `isAllowedHost('https://evil.com/?zenodo.org') === false`; `buildCsp()` contains `connect-src 'self'` and `https://api.datacite.org` and does not contain `*`.
- [ ] **Step 3: Run** `npx vitest run` — expect FAIL (no config).
- [ ] **Step 4: Create all files listed; `npm install`.** Vite multi-page: `build.rollupOptions.input = { index: 'index.html', check: 'check/index.html', privacy: 'privacy/index.html' }`. Each HTML has `<meta name="robots" content="noindex,nofollow">` (the server also strips/keeps it per `SITE.noindex`, Task 11), the GA consent-default snippet copied from the atlas `frontend/index.html` pattern (Consent Mode `default` all `denied`, `wait_for_update`), and NO gtag `config` call until consent (Task 13 loads it).
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit` — expect PASS.

### Task 2: Value parsers (encoding, numbers, coordinates, dates)

**Files:**
- Create: `src/core/values/encoding.ts`, `src/core/values/numbers.ts`, `src/core/values/coords.ts`, `src/core/values/dates.ts`
- Test: `test/values/encoding.test.ts`, `numbers.test.ts`, `coords.test.ts`, `dates.test.ts`

**Interfaces:**
- Produces:
  - `decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'utf-8-bom' | 'windows-1250' | 'iso-8859-2'; fallback: boolean }` — UTF-8 with `TextDecoder('utf-8', { fatal: true })`; on failure Windows-1250 vs ISO-8859-2 chosen by which decodes the bytes 0x8A/0x9A/0x8C/0x9C/0x8F/0x9F (present → windows-1250), else iso-8859-2.
  - `NA_TOKENS: readonly string[]` = `['', 'NA', 'N/A', 'NaN', 'nan', 'nd', 'n.d.', 'ND', '-', '--', 'null', 'NULL']`.
  - `parseNumber(raw: RawCell, decimalComma: boolean): { status: 'ok'; value: number; decimals: number } | { status: 'missing' } | { status: 'na-variant'; token: string } | { status: 'non-numeric'; token: string }` — `na-variant` = the token is not in `NA_TOKENS` but, uppercased with non-letters removed, is a repetition of `NA` (`NANA`, `NA NA`) or `N.A.`; decimals counted from the textual form (xlsx numbers: from `String(n)`).
  - `parseCoordinate(raw: RawCell, axis: 'lat' | 'lon', decimalComma: boolean): { value: number; decimals: number; form: 'decimal' | 'dm' | 'dms'; normalised360?: boolean } | { error: 'unparseable' | 'out-of-range'; raw: string }` — accepts `12° 34.567'`, `54°21.500'`, `12°34.567°` (trailing ° where ' was meant), `16 27.92 E`, `S 12° 3' 4"`, hemisphere letters N/S/E/W (W/S negate) before or after; 0–360 longitudes in (180, 360] → value − 360 with `normalised360: true`. For DM forms `decimals` is the number of decimals that preserves the minute precision: `ceil(minuteDecimals + log10(60))` capped at 6.
  - `excelSerialToDate(serial: number, date1904: boolean): ParsedDate` — epoch 1899-12-30 (1900 system) or 1904-01-01 (1904 system); fractional part → time, `tz: 'unknown'`.
  - `parseDate(raw: RawCell, opts: { date1904: boolean; dateFormatted: boolean }): ParsedDate | { error: 'unparseable'; raw: string }` — ISO 8601 (date, datetime, `Z`/offset → `tz: 'utc'|'offset'`), `YYYY-MM-DD HH:MM`, `DD.MM.YYYY`, `DD/MM/YYYY` only when day > 12 makes it unambiguous (else `error`), `YY-MM-DD` → 20YY with `ambiguity: 'yy-mm-dd'`, numbers → Excel serial only when `dateFormatted` is true.
  - `combineDateTime(d: ParsedDate, time: RawCell): ParsedDate`.

- [ ] **Step 1: Write tests.** Must include: `parseNumber('-5.2', false)` → `{status:'ok', value:-5.2, decimals:1}`; `parseNumber('3,14', true).value === 3.14`; `parseNumber('  /..4', false).status === 'non-numeric'`; `parseNumber('NANA', false).status === 'na-variant'`; `parseNumber('NA', false).status === 'missing'`; `parseCoordinate("12° 34.567'", 'lon', false).value` ≈ 12.576117 (1e-6); `parseCoordinate("54°21.500'", 'lat', false).value` ≈ 54.358333; `parseCoordinate("12°34.567°", 'lon', false).value` ≈ 12.576117; `parseCoordinate('350.5', 'lon', false)` → `{ value: -9.5, normalised360: true }`; `parseCoordinate('95', 'lat', false).error === 'out-of-range'`; `excelSerialToDate(45000, false).iso === '2023-03-15'`; `excelSerialToDate(45000 - 1462, true).iso === '2023-03-15'`; `parseDate('21-07-25', …)` → `{ iso: '2021-07-25', ambiguity: 'yy-mm-dd' }`; `parseDate('2021-07-25T10:00:00Z').tz === 'utc'`; `parseDate('2021-07-25').tz === 'unknown'`; `parseDate('03/04/2021')` → error (ambiguous D/M); `decodeText` on bytes of `'Zażółć'` encoded Windows-1250 → text equals `'Zażółć'`, `fallback: true`; UTF-8 BOM bytes → `encoding: 'utf-8-bom'`, BOM stripped.
- [ ] **Step 2: Run** `npx vitest run test/values` — FAIL.
- [ ] **Step 3: Implement.** `TextDecoder('windows-1250')` and `'iso-8859-2'` are available in Node 22 and browsers.
- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit` clean.

### Task 3: File parsers (CSV, xlsx, PANGAEA)

**Files:**
- Create: `src/core/parse/csv.ts`, `src/core/parse/xlsx.ts`, `src/core/parse/pangaea.ts`, `src/core/parse/index.ts`
- Test: `test/parse/csv.test.ts`, `test/parse/xlsx.test.ts`, `test/parse/pangaea.test.ts`; fixtures built in-test (xlsx via SheetJS `utils.book_new` + `write` into a buffer — no binary fixtures needed).

**Interfaces:**
- Consumes: Task 2 `decodeText`; `makeFinding` from Task 4 (`src/core/rules/registry.ts`) for `ROW-RAGGED`, `IN-ENCODING-FALLBACK`, `IN-DECIMAL-COMMA`, `IN-DATE1904`.
- Produces: `parseFile(fileName: string, bytes: Uint8Array): ParsedFile` (dispatch on extension + magic bytes: `PK` → xlsx, `%PDF` → kind `pdf`, `<?xml`/`{` → kind `metadata` with `embeddedMetadata` from Task 5 parsers, `/* DATA DESCRIPTION:` → pangaea, else csv); `parseCsvText(text: string, fileName: string): ParsedFile`; `parseXlsx(bytes, fileName): ParsedFile`; `parsePangaeaText(text, fileName): ParsedFile`.
- CSV rules: delimiter = the one of `,` `;` `\t` giving the most consistent non-1 field count over the first 50 non-empty lines; RFC 4180 quotes; decimal comma = delimiter is `;` or tab AND ≥ 80 % of numeric-looking cells in the first 50 rows match `^-?\d+,\d+$` (this is a parsing heuristic, not a QC threshold); header = first non-empty line; `fieldCount` per physical line; each row whose `fieldCount !== header.length` → one `ROW-RAGGED` finding listing all such lines (params: `expected`, `found` of the first); cells are kept as found (never realigned). Physical line numbers count every `\n` including blank lines and quoted newlines' start line.
- xlsx: one `RawSheet` per non-empty sheet; header = first row with ≥ 2 non-empty text cells; numeric cells as `number`, everything else as trimmed text; `dateFormatted[c]` = majority of numeric cells in column c have a date number format (`SSF.is_date`); `date1904` from `wb.Workbook?.WBProps?.date1904`. `cellDates: false` always.
- PANGAEA: header block `/* … */` → `embeddedMetadata` (source `pangaea`: Citation → title, License → licences [{field:'License', text, uri}], Coverage → bbox + temporalExtent, Parameter(s) → parameters with units); then a tab-separated table whose header line is the first line after `*/`; line numbers are physical file lines.

- [ ] **Step 1: Write tests:** `csv.test.ts` — semicolon + decimal comma file → `decimalComma: true`, values `'3,14'` kept as text; quoted `"a,b"` is one field; a 29-field row under a 28-field header → one `ROW-RAGGED` finding with `lines: [<its physical line>]`; BOM stripped from the first header; OPeNDAP header `"Latitude<Float32>"` kept verbatim in `header`; Windows-1250 bytes → `IN-ENCODING-FALLBACK` finding. `xlsx.test.ts` — a workbook built in memory with a date-formatted column → `dateFormatted[0] === true`; a 1904 workbook → `date1904: true` and `IN-DATE1904`; two sheets → two `RawSheet`s; numeric `-5.2` stays `-5.2`. `pangaea.test.ts` — a synthetic PANGAEA text (write one in `test/fixtures/pangaea-synthetic.tab` following the structure in `docs/research/infra.md`) → licence `CC-BY-4.0` URI, bbox, temporal extent, header `['Date/Time', 'Latitude', …]`, first data row line number correct.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run test/parse && npx tsc --noEmit` — PASS.

### Task 4: Rules registry, citations, report model

**Files:**
- Create: `src/core/rules/registry.ts`, `src/core/rules/{input,licence,metadata,rows,crossfile,chemistry}.ts`, `src/core/rules/index.ts`, `src/core/report.ts`, `docs/research/qc-sources.md` (copied by the coordinator from research), `docs/rules.md` (generated table: id, severity, category, thresholds + citations — written by a script `scripts/rules-doc.ts`, run in a test to assert it is up to date)
- Test: `test/rules/registry.test.ts`, `test/report.test.ts`

**Interfaces:**
- Produces: `RULES: readonly RuleDef[]` (concatenation of the six category files); `getRule(id: string): RuleDef` (throws on unknown id); `makeFinding(ruleId: string, f: Omit<Finding, 'ruleId' | 'severity' | 'params'> & { params?: Finding['params'] }): Finding`; `renderPlain(f: Finding, lang: Lang): string`; `renderTechnical(f: Finding): string`; `buildReport(findings: Finding[]): Report` (dedupe identical findings, sort by severity error→warning→info then file then first line; `notChecked` = `['notChecked.scientificValidity','notChecked.calibration','notChecked.taxonomy','notChecked.pdfContent','notChecked.unlistedVariables']`).
- Rule ids (all must exist; severities fixed here):

| id | sev | category |
|---|---|---|
| IN-NO-DATA-FILE | error | input |
| IN-RECORD-INACCESSIBLE | error | input |
| IN-HOST-NOT-ALLOWED | warning | input |
| IN-FETCH-BLOCKED | warning | input |
| IN-LAYOUT-UNSUPPORTED | error | input |
| IN-ENCODING-FALLBACK | info | input |
| IN-DECIMAL-COMMA | info | input |
| IN-DATE1904 | info | input |
| LIC-MISSING | error | A |
| LIC-FREE-TEXT | warning | A |
| LIC-RESTRICTION-CONFLICT | warning | A |
| LIC-DATACITE-EMPTY | warning | A |
| LIC-MISMATCH | warning | A |
| META-EMPTY-LINK | warning | A |
| META-NO-VERSION | info | A |
| META-NO-EXTENT | info | A |
| META-DATE-OUTSIDE-EXTENT | warning | A |
| META-POINT-OUTSIDE-BBOX | warning | A |
| META-VARIABLE-MISSING | warning | A |
| META-NO-DATES | error | A |
| ROW-LAT-RANGE | error | B |
| ROW-LON-RANGE | error | B |
| ROW-LON-360 | info | B |
| ROW-LAT-EQ-LON | error | B |
| ROW-RAGGED | error | B |
| ROW-NON-NUMERIC | warning | B |
| ROW-NA-VARIANT | warning | B |
| ROW-STATION-MOVED | warning | B |
| ROW-DATE-UNPARSEABLE | warning | B |
| ROW-DATE-MISSING | info | B |
| ROW-YEAR-OUTLIER | warning | B |
| ROW-DATE-YYMMDD | info | B |
| ROW-TZ-UNKNOWN | info | B |
| ROW-UNIT-MISSING | warning | B |
| ROW-DEPTH-SIGN | info | B |
| ROW-DM-COORDS | info | B |
| XF-DUPLICATE-SAMPLES | info | C |
| XF-DATE-CONFLICT | warning | C |
| XF-STATION-ALIAS | info | C |
| XF-UNIT-CONFLICT | warning | C |
| XF-POSITION-SWAP | warning | C |
| XF-POSITION-CONFLICT | warning | C |
| CHEM-UNIT-PAIR | warning | C |
| CHEM-DIC-GT-TA | warning | C |
| CHEM-RANGE | warning | C |

- Threshold-bearing rules and their numbers come only from `docs/research/qc-sources.md`: `ROW-LAT-RANGE`/`ROW-LON-RANGE` (position test), `CHEM-RANGE` (one Threshold per bound per quantity: temperature, salinity, pressure, oxygen, pH — exactly those with a citable source), `CHEM-UNIT-PAIR` (molar masses, IUPAC/CIAAW), `CHEM-DIC-GT-TA` (citation for "TA exceeds DIC in seawater"), `XF-UNIT-CONFLICT` (density relation citation). Rules for which the research file says "NO CITABLE THRESHOLD FOUND" are implemented without any numeric threshold (pattern-based, see Tasks 7–8) or not at all; the coordinator lists them in the final report.
- Plain messages: one short sentence saying what to fix and why, for a non-technical scientist, in pl/en/de/fr; technical: file/line/field/value placeholders.

- [ ] **Step 1: Write `registry.test.ts`:** every rule id unique; every id in the table above present with that severity; every `plain` has all four languages, non-empty, and the same `{param}` set as `technical` (plain may use a subset); every `Threshold.citation.url` starts with `https://`; `CHEM-RANGE` has ≥ 1 threshold; `makeFinding('ROW-RAGGED', {lines:[3]}).severity === 'error'`; `getRule('NOPE')` throws; `docs/rules.md` equals `rulesDoc()` output.
- [ ] **Step 2: `report.test.ts`:** counts per severity; sort order; duplicate findings merged; `renderPlain` replaces `{line}` etc.; unknown lang falls back to en.
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement.** **Step 5: Run** — PASS.

### Task 5: Metadata parsers + licence normalisation

**Files:**
- Create: `src/core/metadata/iso19139.ts`, `datacite.ts`, `zenodo.ts`, `licence.ts`
- Test: `test/metadata/*.test.ts`; synthetic fixtures `test/fixtures/iso-*.xml`, `datacite-*.json|xml`, `zenodo-*.json` (invented titles/abstracts; structure as described in `docs/research/infra.md` §5).

**Interfaces:**
- Produces: `parseIso19139(xml: string, label: string): MetadataRecord` (namespace-aware, `@xmldom/xmldom` `DOMParser`; `useLimitation`, `otherConstraints` → `LicenceStatement`s (also `gmx:Anchor` with `xlink:href` → `uri`); `MD_RestrictionCode@codeListValue` under `accessConstraints`/`useConstraints`; `EX_TemporalExtent` `gml:beginPosition`/`endPosition` (both gml and gml/3.2 namespaces); `EX_GeographicBoundingBox`; abstract; `MD_DataIdentification/citation/edition` → version; every `gmd:onLine/gmd:CI_OnlineResource` → `distributionLinks` with `url = trimmed linkage text ('' when empty or missing)`); `parseDataciteJson(json: unknown, label): MetadataRecord` (`data.attributes`: `rightsList[]` → licences with `rightsIdentifier` lowercased → SPDX via `toSpdx`, `rightsUri`; `dates`, `geoLocations` boxes/points → bbox; `url` → `landingUrl`; `types.resourceTypeGeneral`; `version`); `parseDataciteXml(xml, label)`; `parseZenodoRecord(json, label): MetadataRecord` (`metadata.license.id` → licence; `files[]` (`key`, `links.self`/`links.content`, `size`, `mimetype` — tolerate both legacy and InvenioRDM shapes); `metadata.resource_type`; `metadata.version`; `doi`).
- `toSpdx(text?: string, uri?: string): string | undefined` — recognises `cc-by-4.0`, `CC BY 4.0`, `CC-BY-4.0`, `https://creativecommons.org/licenses/by/4.0/` (and `legalcode`), likewise BY-SA, BY-NC, BY-NC-SA, BY-ND, CC0 (`publicdomain/zero/1.0`), ODbL; `'CC BY'` / `'CC-BY'` without version → `undefined` (not machine-readable). `isOpenLicence(spdx)`. `RESTRICTIVE_CODES = ['copyright','patent','patentPending','trademark','license','intellectualPropertyRights','restricted','otherRestrictions']` with `otherRestrictions` treated as neutral (it is the ISO way to point at `otherConstraints`).

- [ ] **Step 1: Tests:** ISO fixture with `copyright` codes + `otherConstraints` "CC-BY" + one empty `linkage` → restrictionCodes contains `{kind:'use', code:'copyright'}`, licences[0].spdx undefined, one distributionLink with `url === ''`; ISO fixture with temporal extent 2025-05-19/2025-05-31 and bbox → parsed numbers; DataCite JSON with `rightsList: []` → `licences.length === 0`; DataCite JSON with `rightsIdentifier: 'cc-by-4.0'` → spdx `CC-BY-4.0`; Zenodo record with only a PDF file → `files[0].mimetype` or key ends `.pdf`; `toSpdx('CC BY') === undefined`; `toSpdx(undefined, 'https://creativecommons.org/licenses/by/4.0/legalcode') === 'CC-BY-4.0'`.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 6: Column recognition, vocab, layout, dataset builder

**Files:**
- Create: `src/core/recognize/vocab.ts`, `src/core/recognize/columns.ts`, `src/core/recognize/layout.ts`, `src/core/dataset.ts`
- Test: `test/recognize/columns.test.ts`, `layout.test.ts`, `test/dataset.test.ts`; synthetic fixtures `test/fixtures/wide.csv`, `long.csv`, `opendap-p01.csv`, `join-two-sheets` (built in-test as xlsx)

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 5.
- Produces:
  - `vocab.ts`: `UNIT_VOCAB` — entries `{ label: string; aliases: string[]; p06: string; url: string; dimension: 'amount/volume' | 'amount/mass' | 'mass/volume' | 'temperature' | 'pressure' | 'length' | 'dimensionless' }` with P06 codes from `docs/research/qc-sources.md` §7; `P01_HINTS` — a small table of P01 codes seen in OPeNDAP headers → `{ role or canonical variable, unit? (only if the P01 definition fixes it), url }`; `CANONICAL_VARIABLES` — `{ key: 'DIC'|'TA'|'DOC'|'salinity'|'temperature'|'oxygen'|'pH'|'nitrate'|'nitrite'|'ammonium'|'phosphate'|'silicate'|'chlorophyll'|'POC'|'PON'|…; headerPatterns: RegExp[]; abstractTerms: Record<Lang|'en', string[]> }` (abstract terms in English plus any language seen in abstracts; e.g. silicate: `['silicate','silica','dissolved silica','Si(OH)4','SiO2']`).
  - `stripTypeSuffix(h: string): string` (`"Latitude<Float32>"` → `Latitude`, quotes removed); `unitFromHeader(h: string): { name: string; unit?: string }` — `name [unit]`, `name (unit)`, `name_umol_kg`, `name_mg_l`, `DIC (µmol L-1)`; unit text normalised to a `UNIT_VOCAB` label or left as found (never invented).
  - `proposeColumns(sheet: RawSheet, ctx: { decimalComma: boolean; date1904: boolean }): ColumnProposal[]` — header names first, then P01 codes, then value ranges (|v| ≤ 90 & named lat…, DM text → coordinate); a column that is both named lat-like and lon-like is never both.
  - `proposeLayout(file: ParsedFile): LayoutPlan` — wide when each sheet has coordinates or measurements as columns; long when a sheet has a parameter-name column with repeated text values + a numeric value column (+ optional unit column); join when one sheet has coordinates and another has measurements and they share a column whose values in the measurement sheet are a subset of those in the coordinate sheet (header equality after `stripTypeSuffix` + lowercasing, or value-subset); `unsupported` with a plain reason otherwise (e.g. "header spans several rows", "data is transposed (variables in rows, samples in columns)").
  - `buildDataset(file: ParsedFile, layout: LayoutPlan, mappings: SheetMapping[], metadata: MetadataRecord[], id: string): { dataset: Dataset; findings: Finding[] }` — applies the confirmed mapping; pivots long tables (one `DataRow` per key tuple, each `NumericCell.line` = its own source line); joins (`DataRow.line` = measurement row; position from the joined row); parses all values with Task 2; emits `ROW-DM-COORDS` (info, once per column), `ROW-LON-360` (info, lines), `ROW-DATE-UNPARSEABLE` (lines), `ROW-DATE-YYMMDD` (info, once), `ROW-TZ-UNKNOWN` (info, once), `ROW-NON-NUMERIC` (lines, field, values), `ROW-NA-VARIANT` (lines), `IN-LAYOUT-UNSUPPORTED`.
- [ ] **Step 1: Tests:** OPeNDAP header `"Latitude<Float32>"` → role latitude, `cleanHeader 'Latitude'`, `header` unchanged; `DIC_umol_kg` → variable DIC unit `µmol/kg`; `DIC (µmol L-1)` → DIC `µmol/L`; a column of `12° 34.567'` strings named `Longitude` → longitude; P01-only header (`"TEMPPR01<Float64>"`) → temperature, unit from P01 only when the P01 entry fixes one, else `unit: undefined`; long fixture (columns sample, parameter, unit, value) → layout `long` and dataset with one row per sample, variables from parameter values, units from the unit column; two-sheet workbook (`cores`: id, lat, lon; `measurements`: id, depth, Na) → layout join on `id`, rows have lat/lon from `cores` and `line` from `measurements`; a transposed sheet → `unsupported`.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 7: Checks A — licence and metadata vs data

**Files:**
- Create: `src/core/checks/licence.ts`, `src/core/checks/metadata.ts`
- Test: `test/checks/licence.test.ts`, `test/checks/metadata.test.ts` (synthetic `MetadataRecord`s and `Dataset`s built in-test with helper `test/helpers/build.ts: makeDataset(rows: Partial<DataRow>[], vars?: Partial<Variable>[]): Dataset`)

**Interfaces:**
- Produces: `checkLicence(records: MetadataRecord[], ctx: { label: string; inaccessible: boolean }): Finding[]`; `checkMetadataVsData(ds: Dataset): Finding[]`.
- Licence logic: no statement with an `spdx` in any record → `LIC-MISSING` (error), unless at least one free-text statement exists, in which case `LIC-FREE-TEXT` (warning; params `text`, `versionMissing: 'yes'|'no'`) — and `LIC-MISSING` is still raised when *no* statement at all exists; any restrictive code (`RESTRICTIVE_CODES`) while any statement names an open licence (spdx open, or free text matching `/\bCC[\s-]?BY|CC0|creative commons/i`) → `LIC-RESTRICTION-CONFLICT`; DataCite record present with `licences.length === 0` while another record has a licence statement → `LIC-DATACITE-EMPTY`; two different spdx ids → `LIC-MISMATCH`; `distributionLinks` with `url === ''` → `META-EMPTY-LINK`; no version in any record → `META-NO-VERSION`.
- Metadata vs data: rows with `datetime` outside `temporalExtent` (compare at the data's precision, day granularity; extent end inclusive) → `META-DATE-OUTSIDE-EXTENT` (lines); rows outside `bbox` (inclusive; tolerance = half a unit in the last reported decimal of the coordinate and of the bbox value) → `META-POINT-OUTSIDE-BBOX` (lines); `CANONICAL_VARIABLES` whose `abstractTerms` occur in the abstract (word-boundary, case-insensitive) but no dataset variable has that canonical → `META-VARIABLE-MISSING` (value = the term found); no row has a date AND no record has a temporal extent or a collection date → `META-NO-DATES` (error); no record has bbox or extent → `META-NO-EXTENT`.
- [ ] **Step 1: Tests** for each branch above, including: copyright + "CC-BY" → `LIC-RESTRICTION-CONFLICT` and `LIC-FREE-TEXT`; DataCite `[]` + ISO "CC BY" → `LIC-DATACITE-EMPTY`; nothing anywhere + `inaccessible: true` → `LIC-MISSING` only once; Zenodo `cc-by-4.0` + DataCite `cc-by-4.0` → no `LIC-*`; abstract "…nutrients and dissolved silica…" with no silicate column → `META-VARIABLE-MISSING` value `dissolved silica`; abstract "…silicate…" with a `SiO4` column → none; row dated 2016-07-06 with extent 2019-06-21..2021-08-16 → finding with that row's line; dates exactly on the extent end → no finding.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 8: Checks B — rows

**Files:**
- Create: `src/core/checks/rows.ts`
- Test: `test/checks/rows.test.ts`

**Interfaces:**
- Produces: `checkRows(ds: Dataset): Finding[]`.
- `ROW-LAT-RANGE` / `ROW-LON-RANGE` with the cited bounds; `ROW-LAT-EQ-LON` when `lat === lon` exactly as parsed (both present), one finding per run of consecutive lines is NOT required — one finding with all lines; `ROW-STATION-MOVED`: group rows by `station`; distinct positions = positions rounded to the coarser reported precision; if a station has ≥ 2 distinct positions, emit — the severity stays warning only for the *patterns* that do not need a distance threshold: (a) the two positions differ in exactly one coordinate and that difference is an integer number of degrees ± the reported precision (a typed digit), or (b) one coordinate of position 1 equals a coordinate of position 2 with lat/lon exchanged; if `docs/research/qc-sources.md` §6 provides a citable station tolerance, also emit for distance > that tolerance. Params: station, the positions with their dates and row counts. Otherwise nothing (record "no citable distance threshold" in the skipped list).
- `ROW-DATE-MISSING` (info): rows without a date while ≥ 1 row has one (params: count, percent).
- `ROW-YEAR-OUTLIER` (warning) — no numeric threshold: years named in the dataset label/file name or in any record title/temporal extent define the *declared* years; rows whose year is not declared → finding with lines. When nothing declares a year, emit nothing.
- `ROW-UNIT-MISSING`: variables with `unit === undefined` (one finding listing the headers).
- `ROW-DEPTH-SIGN` (info): a depth column whose sign convention is `unknown` (neither header nor metadata states it) and values include negatives, or header has no "depth"/"pressure"/"elevation" word with unit; params: header.
- [ ] **Step 1: Tests:** lat 91 → `ROW-LAT-RANGE`; 27 rows with lat = lon = 76.9 → one finding with 27 lines; station `ST5` at lon 15.5 (9 rows) and 16.5 (14 rows), same lat → `ROW-STATION-MOVED` mentioning `ST5`; station at 15.5000 and 15.5003 → nothing; file name `…_2021.csv` with 71 rows in 2021 and 6 in 2017 → `ROW-YEAR-OUTLIER` with the 6 lines; no year declared anywhere → nothing; 2 of 100 rows without date → `ROW-DATE-MISSING` info, percent 2.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 9: Checks C — cross-file and chemistry; outputs

**Files:**
- Create: `src/core/checks/crossfile.ts`, `src/core/checks/chemistry.ts`, `src/core/checks/run.ts`, `src/core/output/csv.ts`, `geojson.ts`, `draft.ts`, `iso19139.ts`, `datacite.ts`
- Test: `test/checks/crossfile.test.ts`, `chemistry.test.ts`, `run.test.ts`, `test/output/*.test.ts`

**Interfaces:**
- Produces: `checkCrossFile(datasets: Dataset[]): Finding[]`; `checkChemistry(ds: Dataset): Finding[]`; `runChecks(session: CheckSession): Report` (parseFindings + record findings + `checkLicence` per record group + per-dataset A/B/C-chem + cross-file when ≥ 2 datasets → `buildReport`); `toCleanCsv(ds: Dataset): { csv: string; sidecar: string }`; `toGeoJson(datasets: Dataset[], report: Report): string`; `metadataDraft(datasets: Dataset[], metadata: MetadataRecord[]): MetadataDraft` with `MetadataDraft = { temporalExtent?: {start: string; end: string}; bbox?: {west:number;east:number;south:number;north:number}; licence?: { spdx: string; uri: string }; variables: { name: string; unit?: string; p01?: string }[]; title?: string; abstract?: string }`; `draftToIso19139(d: MetadataDraft): string`; `draftToDataciteXml(d: MetadataDraft): string`; `GN_FIELD_LABELS: Record<Lang, Record<'temporalExtent'|'bbox'|'licence'|'variables', string>>` (labels as the GeoNetwork editor shows them).
- Station alias: `normaliseStation(s)` = last `/`-separated segment, trimmed, uppercased, spaces removed; two raw ids that differ but normalise equal → `XF-STATION-ALIAS` (info).
- Sample match across datasets: same normalised station (or same position at the coarser precision when no station), same depth (at the coarser precision), and — for `XF-DUPLICATE-SAMPLES`/`XF-UNIT-CONFLICT` — same date at day precision. Values "equal" = |a − b| ≤ ½·10^−decA + ½·10^−decB.
- `XF-DATE-CONFLICT`: same station+depth, ≥ 2 shared canonical variables all equal, but dates differ → warning (files, dates, example line pair).
- `XF-UNIT-CONFLICT`: same canonical variable, matched samples, unit labels differ in `dimension` (`amount/volume` vs `amount/mass`) and the majority (> half) of matched values are equal → warning with matched/equal counts.
- `XF-POSITION-SWAP`: stations A and B, each with one dominant position per dataset; pos(A, d1) equals pos(B, d2) and pos(B, d1) equals pos(A, d2) (coarser precision ± rounding), while pos(A,d1) ≠ pos(A,d2) → warning.
- `XF-POSITION-CONFLICT`: station's positions in one dataset lie outside the full lat/lon range of that station in every other dataset by more than the coordinate rounding, and the case is not a swap → warning naming the dataset that disagrees with the majority of datasets (if 3+ datasets; with 2 datasets name both).
- `CHEM-UNIT-PAIR`: within one row, two variables with the same canonical in `mass/volume` and `amount/volume` units → expected µmol/L = mg/L · 1000 / M (M from `qc-sources.md` for C, N, P, Si); inconsistent when |expected − reported| > uncertainty propagated from both reported precisions → warning with lines.
- `CHEM-DIC-GT-TA`: rows with both DIC and TA in the same unit and DIC > TA + rounding → warning grouped per cruise (or per dataset when no cruise), params: cruise, count, total, median TA−DIC; lines.
- `CHEM-RANGE`: values outside the cited global range for their canonical/unit (only when units match the threshold's unit) → warning grouped per variable.
- Clean CSV: columns `station, cruise, date [ISO 8601], latitude [degrees_north], longitude [degrees_east], depth [m]`, then each variable `name [unit]` (unit omitted when unknown, never invented); dates `YYYY-MM-DDTHH:MMZ` when tz utc, otherwise without `Z` and a sidecar note "time zone unknown"; numbers written from their original text (no float re-formatting); text-cell guard: prefix `'` only when the cell is text (not a number per `parseNumber`) and starts with `=`, `+`, `@`, or `-`; RFC 4180 quoting. Sidecar = CSV `original_column,output_column,unit,unit_source,p01`.
- [ ] **Step 1: Tests:** `X/ST2` vs `ST2` → alias; two datasets where values of DIC match (165/167 style: 9 of 10) but one labels `µmol/L` and the other `µmol/kg` → `XF-UNIT-CONFLICT`; swap fixture (ST1/ST2 positions exchanged) → `XF-POSITION-SWAP`, not `XF-POSITION-CONFLICT`; ST21 at lon 13.98 in one dataset and 15.65 in two others → `XF-POSITION-CONFLICT` naming the first; same Na values at same depths dated 2023-07-30 vs 2022-07-30 → `XF-DATE-CONFLICT`; DOC 1.47 mg/L with 41.7 µmol/L → `CHEM-UNIT-PAIR`; DOC 1.00 mg/L with 83.3 µmol/L → none; cruise C19 with DIC > TA in 3/3 rows → one `CHEM-DIC-GT-TA` mentioning `C19`; salinity 50 → `CHEM-RANGE` only if the cited max is below 50; CSV export of `-5.2` → `-5.2`, of text `=SUM(A1)` → `'=SUM(A1)`, of text `-abc` → `'-abc`, of text `+48 600` → `'+48 600`; metadata draft extent/bbox computed from rows; ISO 19139 output parses back with `parseIso19139` to the same extent, bbox and licence URI.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 10: Sources — fetcher, resolver, record handlers

**Files:**
- Create: `src/core/sources/fetcher.ts`, `resolve.ts`, `zenodo.ts`, `geonetwork.ts`, `datacite.ts`, `pangaea.ts`, `index.ts`
- Test: `test/sources/*.test.ts` with an in-memory `MapFetcher`

**Interfaces:**
- Produces:
  - `interface Fetcher { get(url: string, accept?: string): Promise<{ status: number; bytes: Uint8Array; contentType?: string; finalUrl: string }> }`; `class FetchBlockedError extends Error { host: string }` (CORS/CSP/network failure in browser mode); `class HostNotAllowedError extends Error { host: string }`; `browserFetcher(): Fetcher` (checks `isAllowedHost` first, `fetch(url, { credentials: 'omit', redirect: 'follow' })`, a `TypeError` → `FetchBlockedError`); `serverFetcher(endpoint = '/api/fetch'): Fetcher` (`POST` JSON `{ url, accept }` — never the URL in a query string).
  - `resolveInput(text: string): { kind: 'zenodo'; id: string } | { kind: 'geonetwork'; host: string; uuid: string } | { kind: 'doi'; doi: string } | { kind: 'pangaea'; id: string } | { kind: 'unknown' }` — Zenodo `https://zenodo.org/records/<id>` / `/record/<id>` / bare digits; GeoNetwork URLs containing a UUID (`…/srv/<lang>/catalog.search#/metadata/<uuid>`, `/srv/api/records/<uuid>`, `/srv/resources/records/<uuid>`) or a bare UUID (host defaults to `geonetwork.iopan.pl`); DOIs `10.x/…` bare, `doi:` or `https://doi.org/…`; PANGAEA `doi.pangaea.de/10.1594/PANGAEA.<id>`.
  - `loadRecord(input: ReturnType<typeof resolveInput>, fetcher: Fetcher): Promise<LoadedRecord>` — DOI → DataCite `https://api.datacite.org/dois/<doi>` → `parseDataciteJson` → route by `landingUrl` host (zenodo.org → Zenodo id from the URL or from `relatedIdentifiers`/the DOI suffix; geonetwork → UUID from the URL path; doi.pangaea.de → PANGAEA) and keep the DataCite record in `metadata`; Zenodo → `https://zenodo.org/api/records/<id>` → `parseZenodoRecord`; data files = files with extension csv/tsv/txt/tab/xlsx/xls; none → `IN-NO-DATA-FILE` (error, params: file names found); GeoNetwork → `https://<host>/geonetwork/srv/api/records/<uuid>/formatters/xml` (exact pattern from `docs/research/infra.md`), HTTP 401/403/404 → `IN-RECORD-INACCESSIBLE` (params: status) and continue with whatever DataCite gave; data files = `distributionLinks` with a data extension or an OPeNDAP CSV path; PANGAEA → `https://doi.pangaea.de/10.1594/PANGAEA.<id>?format=textfile` as one data file. File bytes are fetched by the caller via `fetchFile(file, fetcher)` so the UI can show progress. A non-allowlisted host → `IN-HOST-NOT-ALLOWED` (host only); `FetchBlockedError` → `IN-FETCH-BLOCKED` (host only).
- [ ] **Step 1: Tests:** each `resolveInput` form; DOI → DataCite (rightsList []) → GeoNetwork 403 → record with `IN-RECORD-INACCESSIBLE` and DataCite metadata; Zenodo record with one PDF → `IN-NO-DATA-FILE`; GeoNetwork XML with a CSV distribution link on `opendap.iopan.pl` → `files[0].url`; link on `example.com` → `IN-HOST-NOT-ALLOWED`; `serverFetcher` sends POST with body `{url}` (mock `fetch`).
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 11: Server

**Files:**
- Create: `server/index.ts`, `server/fetchProxy.ts`, `server/rateLimit.ts`, `server/headers.ts`, `tsconfig.server.json` (if not in Task 1)
- Test: `test/server/fetchProxy.test.ts`, `test/server/app.test.ts` (supertest against `createApp({ distDir: test/fixtures/dist })`)

**Interfaces:**
- Produces: `createApp(opts: { distDir: string; resolver?: (host: string) => Promise<string[]>; upstream?: typeof fetch }): express.Express`; `isForbiddenAddress(ip: string): boolean` (IPv4: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, 224/4, 240/4, 255.255.255.255; IPv6: ::, ::1, fc00::/7, fe80::/10, ff00::/8, IPv4-mapped forms of the above, 64:ff9b::/96 mapping to forbidden v4); `proxyFetch(url, accept, deps): Promise<Response-like>` — https only, `isAllowedHost`, resolve all A/AAAA and refuse if any is forbidden, `redirect: 'manual'` and re-check every hop (max 5), timeout 20 s, cap 30 MB (stream count, abort above), response headers passed: content-type only.
- Routes: `POST /api/fetch` (JSON body ≤ 2 kB, `{url, accept?}`), rate limit 30 requests/min per client IP (first entry of `X-Forwarded-For`, else socket address) — 30/min is an operational choice, not a QC threshold; 400 for bad input, 403 host not allowed, 422 forbidden address/redirect, 413 too large, 504 timeout. Log line: `{ host, status, bytes }` only. Static: `/` → `dist/index.html`, `/check` and `/check/` → `dist/check/index.html`, `/privacy` likewise, `/assets/*`, `/robots.txt` (`User-agent: *\nAllow: /`), `/favicon.svg`; anything else → 404 with a small 404 page (all four languages in one page). Headers on every response: `Content-Security-Policy: buildCsp()`, `X-Robots-Tag: noindex, nofollow` when `SITE.noindex`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy: geolocation=(), camera=(), microphone=()`. `PORT` env (default 8080).
- [ ] **Step 1: Tests:** `isForbiddenAddress` for `169.254.169.254`, `10.1.2.3`, `::ffff:127.0.0.1`, `fd00::1` → true, `193.0.6.139` → false; proxy refuses `http://zenodo.org/` (400), `https://evil.example/` (403), allowlisted host resolving to `127.0.0.1` (422), redirect to `https://169.254.169.254/` (422), redirect to non-allowlisted host (403), body > 30 MB (413); `GET /nope` → 404; `GET /check` → 200 with `X-Robots-Tag: noindex, nofollow` and CSP; 31st request in a minute from one `X-Forwarded-For` → 429; log output contains no path or query.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 12: Worker + app shell + check flow UI

**Files:**
- Create: `src/worker/check.worker.ts`, `src/worker/client.ts`, `src/app/i18n.ts`, `src/core/i18n/ui.ts`, `src/app/pages/{IndexPage,CheckPage,PrivacyPage}.tsx`, `src/app/entries/{index,check,privacy}.tsx`, `src/app/components/{LanguageSwitcher,ModeSwitch,InputPanel,MappingEditor,LayoutConfirm,ReportView,Downloads}.tsx`, `src/app/styles.css`
- Test: `test/app/*.test.tsx` (vitest + jsdom for components — add `jsdom`, `@testing-library/react` in Task 1 deps)

**Interfaces:**
- Worker protocol (`client.ts`): `parse(files: {name, bytes}[]) → ParsedFile[] + proposals`; `build(fileIdx, layout, mappings, metadata) → Dataset`; `check(session) → Report`; `export(kind, …) → string`. The worker is created lazily with `new Worker(new URL('../worker/check.worker.ts', import.meta.url), { type: 'module' })` on first use.
- Check flow: mode switch first (default browser; sentences: browser — "Files are downloaded by your own browser; some data servers do not allow this, then you download the file and drop it here."; server — "Our server downloads public files from known data servers for you and keeps nothing."), then input (drop zone + link/DOI field), then layout + mapping confirmation per file (dropdown per column with role and unit; proposals preselected, low-confidence ones highlighted), then report (summary counts; each finding: plain sentence on top, `<details>` with technical text, file, lines, field, value, rule id, citations), map, downloads (clean CSV, sidecar, GeoJSON, metadata draft values with GeoNetwork field labels, ISO 19139 XML, DataCite XML). Final summary when there are no findings: "No problems found in the checked categories." + the not-checked list. Never "ready to publish".
- Language: `?` none; detect from `localStorage.lang` → `navigator.language` → en; switcher stores to localStorage. Nothing user-provided in the URL.
- [ ] **Step 1: Tests:** `ui.ts` has the same key set in all four languages; `ReportView` with zero findings renders the "no problems found in the checked categories" sentence and not the word "ready"; `ModeSwitch` defaults to browser; `CheckPage` never calls `history.pushState`/`replaceState` with input data (spy).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** `npm run build` succeeds.

### Task 13: Map preview, consent + GA4, privacy and index pages

**Files:**
- Create: `src/app/components/MapPreview.tsx`, `src/app/components/CookieBanner.tsx`, `src/app/analytics.ts`, finish `IndexPage`/`PrivacyPage` content in 4 languages
- Test: `test/app/analytics.test.ts`, `test/app/map.test.ts` (pure helpers only)

**Interfaces:**
- `MapPreview`: MapLibre with style `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json` (as in the atlas `ImpactReportMap.tsx`; keep attribution), GeoJSON source from `toGeoJson`, circle colour by `worstSeverity` (error `#ef4444`, warning `#f59e0b`, info `#38bdf8`, none `#22c55e`), click → popup with the row's file/line/values; `displayLon` helper copied from the atlas `frontend/src/utils/coords.ts` pattern; fit bounds to data. `maplibre-gl` imported dynamically so `/` and `/privacy` do not load it.
- `analytics.ts` (pattern from the atlas `analytics.ts` + `CookieBanner.tsx`): `initConsent()`, `grantConsent()`, `denyConsent()`, `track(event: 'check_started' | 'check_finished', params: { input_type: 'file' | 'zenodo' | 'geonetwork' | 'doi' | 'pangaea' | 'mixed'; mode: 'browser' | 'server'; n_errors?: number; n_warnings?: number; n_info?: number })` — the type admits no strings beyond those enums; gtag script loaded only after consent; `page_location` set to `location.origin + location.pathname` explicitly.
- [ ] **Step 1: Tests:** `track` with consent denied does not push to `dataLayer`; with consent granted pushes exactly `{input_type, mode, n_*}`; `worstSeverity` per row; GeoJSON features have only numeric/enum properties plus file/line.
- [ ] **Step 2–4:** FAIL → implement → PASS; `npm run build`; manual browser check of `/check` with a synthetic fixture (coordinator).

### Task 14: Golden test

**Files:**
- Create: `test/golden/golden.test.ts`, `test/golden/localFetcher.ts`, `test/golden/pipeline.ts` (`runInput(input, goldenDir): Promise<{ datasets: Dataset[]; report: Report }>` — load record via `loadRecord` with `LocalFetcher`, fetch files, `parseFile`, `proposeLayout`, accept every proposal (`proposeColumns`), `buildDataset`, `runChecks`)
- Reads: `$GOLDEN_DIR/expected.json` (format documented in its `_comment`), `$GOLDEN_DIR/metadata/**`, data files. Nothing from `GOLDEN_DIR` is written into the repo or into snapshots.

**Interfaces:**
- `describe.skipIf(!process.env.GOLDEN_DIR)`. LocalFetcher: `api.datacite.org/dois/<doi>` → `metadata/datacite-<doi with / → _>/record.json`; `zenodo.org/api/records/<id>` → `metadata/zenodo-<id>/record.json`; GeoNetwork `…/records/<uuid>/formatters/xml` → `metadata/gn-<uuid>/record.xml` or 403 when the directory is empty; any other URL → the local file whose `urlFiles` key is a substring of the URL; otherwise 404.
- Assertions: every `expected` entry is met (rule, severity, file substring, lines ⊆ finding lines, `valueIncludes` in value/params); `forbid` entries; no error-level finding on `knownGood`; afterwards print every warning on known-good inputs and every finding not covered by `expected` (for the coordinator's report).
- [ ] **Step 1:** Write the harness. **Step 2:** `GOLDEN_DIR=/Users/ice13ball/data/sprawdzarka-golden/2026-10-16 npx vitest run test/golden` — fix core code (not the expectations) until PASS. Any change to recognition made for a golden file must come with a synthetic fixture test reproducing the pattern.

### Task 15: Container and deploy (only after Michal's go)

**Files:**
- Create: `Dockerfile` (multi-stage: `node:22-slim` build → runtime with `dist/`, `dist-server/`, production deps only, `USER node`, `ENV PORT=8080`), `.dockerignore`, `scripts/deploy.sh` (`gcloud builds submit --project=something-rare --tag europe-west1-docker.pkg.dev/something-rare/<repo>/tools` then `gcloud run deploy abyssal-tools --project=something-rare --region=europe-west1 --image … --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi`), `docs/deploy.md`.
- Verification after deploy: `curl -sI https://<run-url>/` and `/check`, `/privacy` → 200 + `x-robots-tag: noindex, nofollow`; `curl -sI https://<run-url>/nope` → 404; in the browser, `dataLayer` holds `consent default` with all `denied` before any click. Domain mapping `tools.something-rare.com` (after a separate go); the CNAME `tools → ghs.googlehosted.com.` already exists.

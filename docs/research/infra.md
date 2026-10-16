# Infrastructure facts (verified 2026-10-16)

Tested with `Origin: https://tools.something-rare.com`.

## SheetJS

- Current SheetJS Community Edition: **0.20.3**, tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  (`xlsx-latest` is a 404 — pin the version). npm `xlsx` is stale at 0.18.5.
- CVE-2023-30533 (prototype pollution) fixed in 0.19.3 — https://cdn.sheetjs.com/advisories/CVE-2023-30533
- CVE-2024-22363 (ReDoS) fixed in 0.20.2 — https://cdn.sheetjs.com/advisories/CVE-2024-22363
- `wb.Workbook.WBProps.date1904` is filled from `workbookPr`. With `cellDates: false` serials stay raw and
  the flag must be applied by us (+1462 days).
- exceljs 4.4.0 (2023) is effectively unmaintained and reads no `.xls` — not used.

## CORS

| Endpoint | Browser-fetchable |
|---|---|
| `zenodo.org/api/records/<id>` and `/api/records/<id>/files/<key>/content` | yes (`ACAO: *`) |
| `api.datacite.org/dois/<doi>` | yes (origin echoed) |
| `data.crosscite.org/...` | yes (`*`) |
| `doi.org/<doi>` | yes on the 302 — but `doi.org/10.5281/zenodo.*` → `zenodo.org/doi/...` hop has no ACAO: never fetch Zenodo DOIs through doi.org; use the DataCite/Zenodo APIs |
| `doi.pangaea.de/10.1594/PANGAEA.<id>?format=textfile` | yes |
| `geonetwork.iopan.pl/geonetwork/srv/api/records/<uuid>/formatters/xml` | yes (`*`; fetch without credentials) |
| `opendap.iopan.pl/opendap/data/csv/...`, `geo.iopan.pl/opendap/data/csv/...` | **no CORS headers** → server mode or "download and drop" |

## GeoNetwork (IO PAN)

- Record XML: `https://geonetwork.iopan.pl/geonetwork/srv/api/records/<uuid>/formatters/xml`.
  `xml.metadata.get` redirects to sign-in — do not use.
- DataCite `attributes.url` for IO PAN DOIs: `https://geonetwork.iopan.pl/geonetwork/srv/resources/records/<uuid>`.
- An unpublished/restricted record answers **403**.
- Distribution links: `gmd:distributionInfo/gmd:MD_Distribution/gmd:transferOptions/gmd:MD_DigitalTransferOptions/gmd:onLine/gmd:CI_OnlineResource/gmd:linkage/gmd:URL`.
  Patterns: `https://opendap.iopan.pl/opendap/data/csv/<Project>/<file>.csv`, `https://geo.iopan.pl/opendap/data/csv/<file>.csv`,
  `https://doi.org/10.48457/<suffix>` (protocol `DOI`). Protocol is often absent; sometimes `WWW:LINK-1.0-http--link`.
  A linkage may be empty.
- Constraints: `gmd:resourceConstraints/gmd:MD_LegalConstraints` with `accessConstraints` / `useConstraints`
  → `gmd:MD_RestrictionCode/@codeListValue` (`license`, `copyright`, …) and `otherConstraints/gco:CharacterString`.
  `useLimitation` may be absent from `resourceConstraints` and present only under `metadataConstraints`.
- Temporal: `gml:TimePeriod/gml:beginPosition|endPosition` (`YYYY-MM-DD`). Bbox: `EX_GeographicBoundingBox` with four
  `gco:Decimal` children. No vertical extent.

## Other landing URLs (DataCite `attributes.url`)

- Zenodo: `https://zenodo.org/doi/<doi>` (Zenodo id = DOI suffix `zenodo.<id>`).
- PANGAEA: `https://doi.pangaea.de/<doi>`.

## PANGAEA textfile

- `/* DATA DESCRIPTION:` … `*/` header of `Key:<TAB>value` lines; continuation lines start with a TAB and no key.
- Keys in order: Citation, Abstract, Keyword(s), Supplement to, [Source], [References], [Funding], Coverage,
  [Event(s)], [Comment], Parameter(s), License, Status, Size.
- `License:` e.g. `Creative Commons Attribution 4.0 International (CC-BY-4.0) (URI: https://creativecommons.org/licenses/by/4.0/)`.
- `Coverage:` `LATITUDE: … * LONGITUDE: …` (or SOUTH/NORTH/WEST/EAST-BOUND), continuation
  `DATE/TIME START: 2021-08-02T00:00:00 * DATE/TIME END: …`. No depth range.
- `Parameter(s):` one line per column: `Long name [unit] (Short) * PI: … * METHOD/DEVICE: … * COMMENT: …`;
  geocodes carry `* GEOCODE`. Match to the header row **by position**, not by name.
- Table: tab-separated; header row `Short [unit]` (e.g. `Temp [°C]`, `Sal`, `Date/Time`); repeated short names get a
  parenthesised suffix. Missing values are empty fields. Dates `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`.
- Large compilations can contain rows where only a text column is filled (no date, no position): these are
  real rows of the file, not parse errors.

## Cloud Run

- Domain mappings are supported in europe-west1 (Preview; Google recommends a load balancer for production).
  A subdomain mapping needs CNAME → `ghs.googlehosted.com.`.
- Project `something-rare`, Artifact Registry repository `abyssal` (Docker, europe-west1).

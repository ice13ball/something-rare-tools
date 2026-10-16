# Abyssal Claims Tools

A browser-first checker for marine datasets, served at https://tools.something-rare.com.
Drop CSV/xlsx files (or point at a public record); the tool proposes a column mapping,
runs declarative, cited rules (licence, metadata versus data, rows, cross-file, chemistry),
shows a two-layer report and a map, and exports a clean CSV, GeoJSON and metadata drafts.
Checks run in your browser; dropped files never leave it.

## Develop

```
npm install
npm run dev          # Vite dev server
npm test             # vitest run
npm run typecheck    # tsc for the app and for the server
npm run build        # vite build + server build to dist-server/
```

## Golden test

`GOLDEN_DIR=/path/to/reference/records npx vitest run test/golden`

The golden records are private reference data. They are read from a local directory only
and are never part of this repository; the test is skipped when `GOLDEN_DIR` is unset.

## Licence

AGPL-3.0-or-later. See `LICENSE`.

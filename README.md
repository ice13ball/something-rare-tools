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

The code is licensed **GNU AGPL-3.0-or-later** (see [`LICENSE`](LICENSE)). AGPL means a modified
version offered to users over a network must also offer its complete source.

One **additional term under AGPL section 7(b)** applies: the author-attribution notice must be
preserved in the source and in the notices displayed by the running program (the footer of every
page carries it). It asks for a preserved line of text and a link — no logo, no badge. See
[`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md) and [`NOTICE`](NOTICE).

A commercial licence is available: see [`COMMERCIAL.md`](COMMERCIAL.md). Contributions: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Names and marks

"Abyssal Claims" and "something-rare.com" are not licensed under the AGPL. You may fork and adapt
the code, but not present a derivative as Abyssal Claims or Abyssal Claims Tools.

## Can I run this at my institution?

| Use | What the AGPL asks |
|---|---|
| Use the public site | nothing; files you drop never leave your browser |
| Run it unmodified, internally or publicly | keep the licence and notices; offering the source to users is the simple way to stay safe |
| Modify it for internal staff only | offer the modified source to those users; no public release needed |
| Modify it and run it publicly | publish your changes under the AGPL; the footer source link must point to your version |
| Embed the code in your own system or product | the combined work is likely covered by the AGPL too; if that does not fit, ask for a commercial licence ([`COMMERCIAL.md`](COMMERCIAL.md)) |

In every case keep the attribution notice in [`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md).
This table is a summary, not legal advice; the text of [`LICENSE`](LICENSE) governs.

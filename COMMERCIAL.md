# Commercial licensing

The code in this repository is licensed under the **GNU AGPL-3.0-or-later** (see
[`LICENSE`](LICENSE) and [`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md)).
That licence permits commercial use, but requires that a modified version offered to users
over a network also offer its complete corresponding source.

If those conditions do not fit your intended use, **a commercial licence is available.**

## When you might need one

- You want to embed these tools, or part of them, in a **closed-source product**.
- You want to run a **modified version as a service** without publishing your changes.
- Your organisation has a **policy against AGPL dependencies** and you need different terms.
- You want the code together with **development, integration or support** work.

## What is on offer

| | |
|---|---|
| **Licence exception** | the same codebase under proprietary terms, one-off or annual |
| **OEM / embedding licence** | for redistribution inside your own product |
| **Licence + development retainer** | licence plus ongoing engineering and support |
| **Custom development** | scoped work on a private branch, invoiced from a registered EU sole proprietorship |

Copyright is **not** for sale — this is licensing, not assignment.

## Two things to know up front

1. **No data is included, and the data you check is not ours.** The tools read the files and
   records their users point them at; dropped files are read in the user's browser and never
   reach our server. What the repository does carry, and what a commercial licence to the code
   does not cover:
   - test fixtures, which are synthetic, except `test/fixtures/iso-prose-corpus.txt`, a corpus of
     short licence statements quoted from public metadata catalogues, which stays under its
     publishers' terms;
   - reference vocabularies taken from public sources — the SPDX License List, Zenodo's licence
     vocabulary and the EU Publications Office licence authority — which stay under their
     publishers' terms;
   - a land/sea grid derived from Natural Earth (public domain) by `scripts/land-mask.py`.

2. **The dependency tree is permissive.** The runtime and bundled dependencies are MIT
   (Express, React, @xmldom/xmldom), BSD-3-Clause (MapLibre GL JS) and Apache-2.0 (SheetJS
   Community Edition). None is copyleft, so a proprietary licence covers the whole codebase.

## Contact

**Michal Mazurowski** — solution architect, Gdansk, Poland
Email: **m.mazurowski@ai-wall.com** (subject line prefix: `[LICENSING] abyssal-claims-tools`)
ORCID: [0009-0007-3786-0310](https://orcid.org/0009-0007-3786-0310)

Please include what you intend to build, whether it will be network-facing, and which of the
tools you need. That is usually enough to answer in one reply.

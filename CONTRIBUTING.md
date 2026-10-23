# Contributing

Issues and patches are welcome. This repository is the source of the tools at
https://tools.something-rare.com; changes land here directly.

## How to contribute

1. **Open an Issue** for bugs, questions and proposals. Issues are read, and they are the
   intended contact channel.
2. **Open a pull request** for a patch. The template asks you to tick the licence grant
   below. **A pull request is merged only when that box is ticked**; without it, it is not
   merged, however good the change is.
3. **Expect a delay.** This is a single-maintainer project.

## Licence grant for contributions

By ticking the box in the pull request template you confirm that:

- you have the right to submit the contribution (it is your own work, or you are authorised
  to submit it); and
- you grant **Michal Mazurowski** a perpetual, worldwide, non-exclusive, royalty-free licence
  to use, modify and relicense your contribution, including under commercial terms; and
- your contribution is also published under **AGPL-3.0-or-later**, with the additional term in
  `LICENSE-ADDITIONAL-TERMS.md`, like the rest of the repository.

You keep the copyright in your contribution. The grant is what keeps the commercial licence
in `COMMERCIAL.md` possible for the whole codebase.

## What a useful report contains

For a wrong or missing finding: what you checked (a public link or DOI, or a small invented
file that shows the problem), what the tool said, and what you expected — with the exact
text of the finding rather than a paraphrase.

## What cannot be accepted

- **No real third-party data in the repository.** Tests use synthetic files; a public record
  is referred to by its identifier, not copied in.
- **No threshold without a source.** Every number a rule compares against is cited, or stated
  in the rule text as the tool's own choice (`docs/research/qc-sources.md`).

## Security

Do not open an Issue for a suspected vulnerability. Write to m.mazurowski@ai-wall.com with
the subject prefix `[SECURITY] abyssal-claims-tools`.

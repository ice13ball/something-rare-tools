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
- **No new tool and no new user decision without its ⓘ.** See "Explanations" below.

## Explanations: the ⓘ next to every decision

Every tool page, and every choice a visitor makes or result they may not understand, carries an
ⓘ explanation (`src/app/components/InfoTip.tsx`). **A review fails without it.** Concretely:

- **Every new tool** (a new page) ships with its ⓘ on the index page tool list and on each of
  its inputs, options, results and downloads that are not obvious from their label.
- **Every new user decision** (a checkbox, a radio group, a dropdown, a field that changes what
  is checked) ships with its ⓘ in the same change.
- **Content in two parts**, each one to three short sentences or bullets: *Co robi / What it
  does* (what the element changes for the user) and *Logika / The logic* (the rule it applies).
  Plain words for a scientist, in all four languages (pl, en, de, fr). The texts live in
  `src/core/i18n/tips-text.ts` as `tip.<id>.does` and `tip.<id>.logic`.
- **Numbers, units and sources are never typed into a tip.** The text holds a `{placeholder}`;
  its entry in `src/app/tips.tsx` fills it from the rule definition (`getRule(...).thresholds`
  and the citation), from a constant of `src/core/checks/` or from a `config/` file.
  `test/app/infotip-sources.test.tsx` fails on a digit typed into a tip and on a number that
  differs from its rule. A rule's details are linked as `docs/rules.md#<RULE-ID>`.
- **Register the tip and place it.** Add the id to `TIPS` in `src/app/tips.tsx`, put the
  component where the decision is (beside the label or heading, never inside a `<label>` or a
  heading element, so names stay clean), and add the id to the page's list in
  `test/app/infotip-placement.test.tsx`. That test also fails on a registered tip that stands
  nowhere.
- **Do not replace visible help with a tip.** Declaration help, warnings and "what it checks /
  does not check" stay on the page; the tip adds the logic.
- **No icon on every label.** If unsure whether a place needs one, leave it out and ask in the
  review.
- **Analytics:** a tip is never an analytics event and never carries its text anywhere.

## Security

Do not open an Issue for a suspected vulnerability. Write to m.mazurowski@ai-wall.com with
the subject prefix `[SECURITY] abyssal-claims-tools`.

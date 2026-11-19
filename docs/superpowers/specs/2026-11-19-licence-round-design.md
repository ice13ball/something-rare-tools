# /licence round — L1-L6 of the 18.11 logic audit

Status: approved by Michal on 19.11.2026 (via the AI-Wall session). Order: T1 → T3 → T2 → T4, then one final review.

## Why

`/licence` exists to catch licence problems before a dataset is published or reused. The 18.11 audit found six cases where it says
nothing or says something wrong (L1-L6). The worst (L1) is a false "OK": a restriction written in a separate field next to a recognised
licence is never compared with it.

## Decisions (Michal, 19.11.2026)

1. A restriction in a separate field next to a recognised licence (T1) is a **warning**.
2. "All rights reserved" and a bare "Open Access" stay **warnings** under the existing "licence in free text" rule, **each with its own
   sentence**: "All rights reserved" is the author's deliberate choice, not a defect (the sentence says what it means for reuse);
   "Open Access" says how the data can be reached, not under what terms it may be used (the sentence asks for the licence).
3. The line saying whether OBIS/GBIF accept the licence (T2) is **information** only, never a warning.
4. Every changed line of the golden set is listed for Michal's acceptance before deploy; deploy to production only with his consent.

## Tasks

| task | finding | change |
|---|---|---|
| T1 | L1 | Compare a restriction in a separate field (ISO `otherConstraints` beyond the licence entry, `useLimitation`, `accessConstraints` with a restriction code; DataCite extra `rights` entries that are not a licence; the same for other sources where a separate rights/conditions field exists) with the recognised licence. A restriction that narrows an open licence (access limited to partners, non-commercial, no derivatives, by request) gives one new warning rule naming both fields. Text that only repeats the licence or attributes the data does not fire. |
| T3 | L4, L5 | Correct wordings are no longer flagged: "This work/content is licensed under …", "CC BY version 4.0", "CC-BY v4.0", "ODbL 1.0", "Open Data Commons Open Database License (ODbL) v1.0", "CC BY 4.0 DEED", an en dash in "CC BY–NC". The fix hint never invents a licence: the fixed example "CC BY 4.0" in the suggestion and in /collection's `suggested_fix` becomes an instruction to state the licence identifier the authors chose. "All rights reserved" and "Open Access" get their own sentences (decision 2). |
| T2 | L2, L6 | Two different licences in one record (e.g. DataCite `rightsList` with CC BY 4.0 and CC BY-NC-ND 4.0) give a warning naming both. One information line says whether OBIS and GBIF accept the recognised licence (accepted: CC0, CC BY, CC BY-NC — the list `/convert` uses, `src/core/convert/metadata.ts`; reuse that list, do not copy it). |
| T4 | L3 | Read the access state for Zenodo (`access_right`: embargoed, restricted, closed; embargo date) and PANGAEA (login required / restricted), and report it like Dataverse's `LIC-FILES-HELD-BACK` (reuse that rule if its texts fit, otherwise one new rule). Tests use recorded API response shapes as fixtures; no live calls in tests. |

## Constraints for every task

- Test first, on invented records only (no real dataset, never IO PAN data).
- Every new or changed finding text in en, pl, de, fr; the texts-complete test must pass without new allow-list entries.
- Every new rule: registry entry, policy where relevant, rule description in `src/core/rules/docs/` (the rule-docs test requires it), regenerated
  `docs/rules/*.md`, and the per-tool count in `docs/releases/v1.1.0.md` is NOT changed (that file describes 1.1.0; new rules go to the next
  release notes).
- `/convert` behaviour unchanged: the replay gate (`npm run convert:record` on the base, `convert:replay` on the head) shows 0 differences.
- `/check` and `/collection` change only where the licence analysis changes; the golden diff is listed line by line for Michal.

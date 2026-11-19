<!-- tasker/161-linkedin-contacts-import.md -->

# 161 — Import LinkedIn connections (the whole flow)

**Status:** OPEN · **Opened:** 2026-11-17 · **Parent:** 160 (knowledge graph)
**DJ (2026-11-17):** "A Tasker for importing contacts from LinkedIn and doing that whole thing."

## Goal

DJ (then any user) gets every LinkedIn connection into `/knowledge` as "People I know", with
company and title, linked to the orgs, without duplicates against people already pulled from
tasks.

## What exists (from 160)

- Parser for LinkedIn `Connections.csv` (`packages/shared-agent-ops/src/knowledge/contacts-import.ts`),
  vCard and Google CSV too. Import dialog on `/knowledge` (preview → import), 1,500-row write
  chunks, LinkedIn URL is a strong identity key, re-import is safe.

## Work

1. **Guide the export in the dialog.** LinkedIn hides it: Settings → Data privacy → Get a copy of
   your data → "Connections" only → email arrives (minutes to a day) → unzip → upload
   `Connections.csv`. Show these steps (with the direct link
   `https://www.linkedin.com/mypreferences/d/download-my-data`) in the import dialog when the user
   picks LinkedIn; accept the `.zip` directly if cheap (unzip in the browser) so nobody has to unzip.
2. **Make the import worth it.** For each connection: person (name, LinkedIn URL key), `works_at`
   org (create or match the org by name), `title`, `connected_on` date, `knows` fact (private).
   Email when the export includes it (most don't). Check what we drop today against a real file.
3. **Match against task-derived people.** 120 people already exist from tasks, many one-word
   ("Louis", "Phil"). Full LinkedIn names should land on existing full-name entries and raise
   "same person?" for one-word ones only when the org also matches. Measure on DJ's real file:
   created vs matched vs suggested.
4. **Org name folding.** "The Cadre" / "Cadre" / "thecadre" and "Magnum-LPL" / "Magnum/LPL" stayed
   separate (160 notes). LinkedIn company names will multiply this. Add a folded org-name key
   (drop leading "The", punctuation, spacing; new migration, new normalized column) used for org
   matching only. People never fold by name.
5. **After import:** land on "People I know" sorted by most recently connected; toast says how
   many new, matched, and to review.

## Done when

- DJ imports his real `Connections.csv` in production; counts reported (new / matched / to review).
- Re-importing the same file creates nothing.
- Org duplicates from LinkedIn company names fold or become review suggestions.

## Constraints

- Free (no model calls). Contact info stays private. Never edit applied migrations.
- DJ does the LinkedIn export himself (account action on his LinkedIn).

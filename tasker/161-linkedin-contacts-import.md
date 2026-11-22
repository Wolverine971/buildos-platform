<!-- tasker/161-linkedin-contacts-import.md -->

# 161 — Import LinkedIn connections (the whole flow)

**Status:** Importer implemented and rehearsed. Confirmed identity corrections are live. DJ has the full production import and its migration on hold (2026-11-21). · **Opened:** 2026-11-17 · **Parent:** 160 (knowledge graph)
**Tracking:** [LinkedIn import task in the BuildOS project](https://build-os.com/projects?open=task:ff201f29-c01c-4ffc-9498-707c559ff659) · [Owner-only list of corrected names, companies and profiles](https://build-os.com/projects?open=document:152dddf3-abfd-578c-9167-b8c65c98c803)
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

## November 21 rehearsal

For the bulk import rehearsal, DJ chose to keep production untouched. The graph records used for matching were read from his
account. The migration and all import writes ran in disposable local PostgreSQL databases.
No contact names, URLs or email addresses are included here.

The July 10 export contains 781 rows. All 767 named connections have a profile URL and a
connection date. Of those, 758 have a company, 760 have a title, and 14 have an email address.
The other 14 rows contain only a date. The preview shows them as skipped.

| Run against DJ's graph snapshot        | New people | Matched people | New review pairs | New facts |
| -------------------------------------- | ---------: | -------------: | ---------------: | --------: |
| First import                           |        763 |              4 |                0 |     3,833 |
| Concurrent submission of the same file |          0 |            767 |                0 |         0 |
| Later re-import                        |          0 |            767 |                0 |         0 |

The import linked 626 distinct employers. The snapshot included the identities, aliases, task
links, employer and acquaintance relationships, and existing review pairs used for matching.
The fact count describes that local fixture. Each web submission keeps an import history entry.
The replay assertions cover people, organizations, identity keys, facts, citations, sources, and review pairs.

The dialog guides the export, opens a CSV or extracts only Connections.csv from a ZIP, and
previews everything before upload. Large LinkedIn files continue in batches of 1,500.
The result opens People I know ordered by the private LinkedIn connection date. Company names
with a leading article or different punctuation can reuse one employer. A joined spelling
such as “thecadre” can raise a review pair. A task-derived one-word name needs matching
employer evidence to raise a same-person question.

### Verification

Tested the working tree based on `9cb144680`. The SHA-256 fingerprint of the 22 implementation
and test paths is `92b0bc4c5ba2a45c926ada0d9e1e34cd742787bdba54b31c4e4123e5861f6e06`.

- `pnpm db:rehearse supabase/migrations/20261121231933_knowledge_linkedin_import.sql --role-probe --check supabase/tests/knowledge_linkedin_import.check.sql` passed on the November 21 production schema snapshot. The check covers exact and short-name matching, conflicting profile IDs, company folding, receipt and graph stability on replay, transaction rollback, privacy, and ordering across a page boundary. The standing checks passed. The role probe found no new failures. The index builds on a table estimated at 643 rows.
- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/knowledge/contacts-import.test.ts src/knowledge/enrichment.test.ts` passed 26 tests.
- `pnpm --filter @buildos/worker exec vitest run src/workers/knowledge/knowledgeEnrichPlan.test.ts` passed 15 tests.
- `pnpm --filter @buildos/web exec vitest run src/routes/api/knowledge/import/server.test.ts src/lib/components/knowledge/contact-export.test.ts src/lib/components/knowledge/KnowledgeImportDialog.test.ts src/lib/components/knowledge/KnowledgeSharePanel.test.ts` passed 9 tests covering the upload endpoint, ZIP selection, retry, rendered dialog, and sharing controls.
- The shared package build, official Svelte autofixers and web type check cover the modified entry points. UI checks used the rendered components locally. A deployed browser import remains pending.

## November 21 confirmed corrections in live BuildOS

DJ approved the reviewed identities and their supporting information. The main BuildOS project now tracks the remaining import as a blocked task. Its description links back to this Tasker. The private Workspace log lists each full name, its source projects, its company or affiliation, and the profile that was saved. [Project task](https://build-os.com/projects?open=task:ff201f29-c01c-4ffc-9498-707c559ff659) · [Private correction log](https://build-os.com/projects?open=document:152dddf3-abfd-578c-9167-b8c65c98c803)

| Change | Verified live result |
| --- | --- |
| Project mentions | 133 first-name tags across 31 distinct tasks and documents now open eight existing full-name cards. They cover 34 person–record pairs. The ninth person already had the correct full name and links to both projects. The source wording was preserved. |
| Employers and affiliations | Saved the verified roles and employer names from three July export rows. Two formal company names became aliases on existing organizations. One suggested employer relationship was confirmed from the dated export. Recorded the verified instructor and media affiliations. Existing company links for the two outreach prospects and the business founder were checked. |
| Profiles | Saved four LinkedIn URLs with matching identity keys, one official instructor page and one biographical profile. One of the four LinkedIn URLs came directly from DJ after the export. |
| Personal relationships | Verified five cards in People I know. Three are documented LinkedIn connections with their original connection dates. DJ confirmed the other two personally. The two media references and two outreach prospects have no personal-contact relationship on their cards. |
| Uncertain identities | All 14 specifically excluded tags still point to their original cards. These include incidental mentions in other projects and references to different people within the same document. |
| Data and provenance | Four private sources support 21 active facts. An independent read-back checked the mention identities, source passages, project membership, card links, profiles, identity keys and contact relationships. The owner's import-run count was identical before and after. |

The full-file import of 767 named connections, its production migration, and acceptance through the deployed import dialog remain pending DJ’s authorization.

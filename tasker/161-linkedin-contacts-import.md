<!-- tasker/161-linkedin-contacts-import.md -->

# 161 — Import LinkedIn connections (the whole flow)

**Status:** Importer implemented and rehearsed. Confirmed identity corrections are live. Production import done 2026-11-22 (767 contacts: 762 new, 5 matched, 0 to review; counts in tasker 166). · **Opened:** 2026-11-17 · **Parent:** 160 (knowledge graph)
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

| Change                     | Verified live result                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project mentions           | 133 first-name tags across 31 distinct tasks and documents now open eight existing full-name cards. They cover 34 person–record pairs. The ninth person already had the correct full name and links to both projects. The source wording was preserved.                                                                                                                    |
| Employers and affiliations | Saved the verified roles and employer names from three July export rows. Two formal company names became aliases on existing organizations. One suggested employer relationship was confirmed from the dated export. Recorded the verified instructor and media affiliations. Existing company links for the two outreach prospects and the business founder were checked. |
| Profiles                   | Saved four LinkedIn URLs with matching identity keys, one official instructor page and one biographical profile. One of the four LinkedIn URLs came directly from DJ after the export.                                                                                                                                                                                     |
| Personal relationships     | Verified five cards in People I know. Three are documented LinkedIn connections with their original connection dates. DJ confirmed the other two personally. The two media references and two outreach prospects have no personal-contact relationship on their cards.                                                                                                     |
| Uncertain identities       | All 14 specifically excluded tags still point to their original cards. These include incidental mentions in other projects and references to different people within the same document.                                                                                                                                                                                    |
| Data and provenance        | Four private sources support 21 active facts. An independent read-back checked the mention identities, source passages, project membership, card links, profiles, identity keys and contact relationships. The owner's import-run count was identical before and after.                                                                                                    |

The full-file import of 767 named connections, its production migration, and acceptance through the deployed import dialog remain pending DJ’s authorization.

## November 22: phone and Google contacts after LinkedIn

DJ asked how a 744-contact Apple vCard would line up with the LinkedIn import, then chose the
ambitious fix before importing. Built, not committed. The migration is applied to production.

| Before                                                                 | Now                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The preview showed only what was in the file.                          | The preview also says how many contacts land on someone already here, how many are new, how many are businesses, and how many raise "same person?", with example pairs.      |
| "Mike Smith" and "Michael Smith" became two cards with no question.    | A near match raises "same person?": a nickname with the same last name, the same name with accents or letters after it, a first name only. Nothing merges without an answer. |
| A dentist or bank became a person in People I know.                    | A business card becomes an organization with its own phone, address and website.                                                                                             |
| "Cadre" and "The Cadre" stayed separate outside the LinkedIn import.   | Company names fold the same way everywhere the store resolves an organization (imports, tasks, documents, chat).                                                             |
| A phone's older job title replaced the LinkedIn headline and employer. | A job that disagrees with one already on record is saved as a suggestion. How someone was met (LinkedIn) is not rewritten to "phone".                                        |
| No way to take an import back.                                         | Undo on the result screen and in a Recent imports list. It removes what the import added and takes its details off existing cards. Entries used since the import stay.       |

Undo covers phone and Google imports made after migration `20261122230000_knowledge_import_undo.sql`.
The LinkedIn import does not stamp what it creates, so it has no Undo.

### Verification

Working tree on `275b6858c`, uncommitted.

- `pnpm db:rehearse supabase/migrations/20261122230000_knowledge_import_undo.sql --refresh --role-probe --check supabase/tests/knowledge_import_undo.check.sql` passed on the November 22 production schema. The check covers another owner's run, entries used since the import, details on people who were already there, and a second undo. Two deliberately broken undo functions (one forgets what the owner used since, one leaves imported details on existing people) both fail it.
- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/knowledge/contacts-import.test.ts src/knowledge/import-near-matches.test.ts src/knowledge/knowledge-store.test.ts` passed 74 tests.
- `pnpm --filter @buildos/web exec vitest run src/routes/api/knowledge/import/server.test.ts src/lib/components/knowledge/KnowledgeImportDialog.test.ts src/lib/components/knowledge/contact-export.test.ts` passed 19 tests. `pnpm --filter @buildos/web check` reported 0 errors.
- Local app, signed in, against the live graph: a two-contact synthetic vCard previewed as 1 new person and 1 business. Nothing was imported, and a read-back found no test rows.
- `apps/worker/scripts/knowledge-import-preview.ts --file <vcf> --user-email <email> [--names]` prints the same outcome from the terminal, read-only.
- Migration `20261122230000` applied to production after a rolled-back dry run there, and recorded in the ledger. Signed-in accounts can call the undo function; logged-out callers cannot.
- `node apps/web/scripts/knowledge-import-undo-e2e.mjs --base http://localhost:5176` passed 21 checks as the dedicated test account, through the local app against production: LinkedIn file, phone preview (nothing saved), phone import, the owner's later edit, undo, a refused second undo. Its rows were removed afterwards.

Pending: DJ's real file through the preview and import (the terminal cannot read his Documents folder), then a web deploy. Company-name folding reaches tasks, documents and chat with the next worker deploy.

## November 22, evening: the duplicates review after DJ's phone import

DJ imported his 744 phone contacts (689 new people, 54 matched, 49 questions, Undo available).
The review then listed dozens of "Same name · 2 entries" pairs, and opening one showed a single
entry.

| Problem                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pairs were not duplicates. The LinkedIn import created 1,368 entries in one instant, and the review read entries a page at a time sorted only by creation time, so pages overlapped and one entry read twice looked like a pair. 8 real groups. | The read sorts by creation time, then id, and counts each entry once. Two other knowledge reads that paged with no sort order now sort by id.                                                            |
| A real pair showed only the name and "2 entries".                                                                                                                                                                                                   | Every entry in the review shows what tells it apart: job, LinkedIn address, phone, email, place, how many tasks and docs it is on, and where it came from. The merge dialog shows the same lines.        |
| The "what is already on this card" read stepped 1,000 rows over 500-row pages, so on a large import it missed details. The phone import's older jobs were then saved as current beside LinkedIn's instead of as suggestions.                        | The step matches the page size. In DJ's graph this affected 7 people with a second current employer and 2 with a second headline, all from the phone import. Not repaired yet; needs his OK (9 details). |

Pressing "Same one, merge" or "Different people" on a phantom pair did nothing (both refuse a
single entry), so no data was lost.

Working tree on `4a3ed3f87`, uncommitted.

- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/knowledge` passed 211 tests, the store file ten times in a row. The fake database now returns tied rows in a different order on each read. With the old sort the new test reports 50 phantom pairs; with the old page step the headline test saves the phone's value as current.
- `pnpm --filter @buildos/worker exec vitest run src/workers/knowledge/documentMentionsWorker.test.ts` passed 3 tests. `pnpm --filter @buildos/web check` reported 0 errors.
- Local app against the live graph: the review lists 8 same-name groups, none with a repeated entry, each showing both entries; "Review" opens both in the merge dialog. Nothing was merged.
- Found, not fixed: DJ's own phone card did not land on his "you" entry, so "DJ Wayne · 2 entries" is in the review.

## November 22, late: seeing what you are merging, and why a merge failed

DJ asked to open up an entry in the review, to see why two entries were put side by side, to be
told why when a merge fails, and to decide each one by hand.

A dry run of every merge the review offers (102 attempts as his signed-in account, each rolled
back) found no merge that fails on its own data. The gaps were in what the screens said.

| Problem                                                                                                                                               | Fix                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An entry in the review showed at most four short lines.                                                                                               | "Details" on every entry, in the review and in the merge dialog: each detail with the import, task, chat or research it came from and the date, other spellings, the tasks and docs it is on, its connections, and a link to the full card.                                                      |
| A "same one?" question never said why it was asked. The stored reason was not shown.                                                                  | Each card says why it is there ("Same last name, similar first name"), then what the entries have in common and where they differ: email, phone, LinkedIn profile, employer, shared tasks and docs. A detail only one side has is not counted.                                                   |
| A refused merge said "Could not combine these" or "Could not save that" in a toast. A partly failed merge closed the dialog, and its message with it. | The refusal says what happened: already merged into which entry, deleted, shared, "is you", or different kinds and what to change. It stays on the card or under the entry in the dialog, which now stays open. A merge button that is off says why.                                             |
| A pair question offered only Same and Different, and "Same" kept whichever entry had the lower id.                                                    | Every card has Review, which opens the merge dialog on those entries and returns to the list afterwards. The entry that "Same" keeps is marked Keep: the fuller name, then the one on more tasks and docs, then the older. The dialog has "Different people" too. "You" can be the one you keep. |

Working tree on `89c5173fb`, uncommitted. No migration.

- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/knowledge` passed 216 tests (5 new). Each new test fails against a broken variant: the database's own message, any profile treated as LinkedIn, the busier entry kept over the fuller name, a one-sided detail counted as a difference.
- `pnpm --filter @buildos/web check` reported 0 errors; eslint and prettier are clean on the changed files.
- Local app against the live graph, with every write to the merge endpoint pointed at an entry that does not exist: 8 groups and 41 questions before and after; the refusal reason showed on the pair card, the group card and in the dialog; Details loaded sources for each detail; Cancel in the dialog returned to the review. "Different people" inside the dialog was not pressed (it would have saved an answer).

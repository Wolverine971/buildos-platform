<!-- tasker/170-company-lookup.md -->

# 170 — Find where my companies are (free lookup after an import)

**Status:** Built and tested locally. UNCOMMITTED. Migration APPLIED to production 2026-11-24 (DJ's OK) and recorded. Web and worker NOT deployed. No real lookup has run. · **Opened:** 2026-11-23 · **Parent:** 160 (knowledge graph), follows 161 (LinkedIn import)

**DJ (2026-11-23):** "I imported all my LinkedIn information... I want to know locations where all these companies are... a scalable way that's not going to cost much money." Then: do it inside BuildOS, deconflict same-name companies, use free APIs, ambitious version.

## DJ's calls (2026-11-23)

1. The free lookup starts by itself after an import; the paid web search is offered afterwards.
2. The paid web search is on for DJ's account only until accuracy and cost are measured.
3. A location from a single source shows as unconfirmed and still counts in the Place filter.
4. Same-name companies become "Which one?" cards in one review stack, and on the company's card.

## What a user gets

- After a LinkedIn import, a line at the top of the /knowledge list: "Finding where your companies are · 212 of 626 · 180 placed", with Stop. Afterwards: "540 companies placed · 60 unconfirmed · 26 not found", "60 need a quick look", and (where turned on) "Search the web for the other 26".
- "Which one?" stack: one company at a time, with who you know there, and each candidate's town, website, one-line description and sources. One tap answers. "None of these" leaves it for a web search. "Skip for now" keeps it for later.
- A company's card shows its own question, and unconfirmed details in the "Unconfirmed · check these" box with Keep / Wrong (the box used to be titled "Found by research · check these").
- Before any lookup has run: a "Find where your companies are" link in the same spot (all companies with no place yet).

## How it decides (no model, no paid call)

A name is never an identity. For each organization the worker asks, by exact name key (lowercase, no punctuation, no legal form):

| Source                                                                        | Gives                                        | Key  |
| ----------------------------------------------------------------------------- | -------------------------------------------- | ---- |
| `company_directory` (People Data Labs free dataset, CC BY 4.0, our own table) | website, town, industry, size, LinkedIn page | none |
| Wikidata                                                                      | headquarters, website, industry              | none |
| GLEIF                                                                         | headquarters of legal entities               | none |
| USAspending.gov                                                               | street address of federal contractors        | none |
| Clearbit autocomplete                                                         | website only                                 | none |
| The candidate's own home page                                                 | address in its structured data               | none |

Candidates fold into distinct companies (same website, or same town). Then:

- **placed** (saved as known): one company and two independent sources agree on its website, its town, or (for a register) its state. Also a household name that two sources agree on, when every namesake is far smaller.
- **unconfirmed** (saved as suggestions: town and website only): one company on one source, or a household name on one source.
- **ask**: 2 to 6 distinct companies, none dominant. Nothing saved; a question is filed.
- **common**: more than 6. Nothing saved, no question.
- **none**: no source knows the name.

The entry's own website (when it already has one) settles identity. Legal entities abroad never compete with a company a brand-level source knows. An address read from a website never counts as a second source. A failed request is never cached as "no such company".

Only the company name leaves BuildOS, to those four services. Never a person's name.

## Where things are

- Shared: `packages/shared-agent-ops/src/knowledge/company-lookup.ts` (sources, folding, verdict, facts), `place-names.ts` (one name and key per place: "Annapolis, MD" / `place:us:md:annapolis`; existing spellings are folded when read), `company-locate.ts` (start / stop a run).
- Worker: `apps/worker/src/workers/knowledge/companyLocate.ts` (one lookup, cache, paced requests), `knowledgeLocateWorker.ts` (job `knowledge_locate`: three at a time, checkpoints, hands the rest to a continuation after 8 minutes), `companyDirectoryFile.ts` (dataset reader).
- Web: `/api/knowledge/locate` (GET banner, POST start, DELETE stop), `/locate/questions`, `/locate/questions/[id]`, `/locate/search` (paid, gated); `KnowledgeLocateBanner`, `KnowledgeCompanyQuestion(s)`, `company-locate.svelte.ts`.
- Migration `20261124010000_knowledge_company_lookup.sql`: queue type `knowledge_locate`, run type `locate`, `company_directory` (+ `_loads`), `company_lookup_cache`, `knowledge_company_lookups`.
- Scripts: `apps/worker/scripts/company-lookup-try.ts` (try names live, saves nothing), `company-directory-load.ts` (dry by default).

## To turn it on

1. ~~Apply the migration~~ Done 2026-11-24. Deploy web and worker (the deployed worker does not know the `knowledge_locate` job yet, so nothing can run until then).
2. Paid web search for DJ only: set `KNOWLEDGE_LOCATE_WEB_SEARCH_USER_IDS=<DJ's user id>` on Vercel (`*` opens it to everyone). It runs as ordinary research: today's allowance, the per-run cap and three-at-once all apply; reserved at $0.012 a company.
3. Company directory (optional, biggest coverage gain for small companies): download the dataset from peopledatalabs.com/company-dataset (their form asks for an email), then `tsx scripts/company-directory-load.ts <file.csv>` prints rows by country and a size estimate before anything is written. Production database is 805 MB today.
4. DJ's existing companies: press "Find where your companies are". Read from production 2026-11-24: 1,090 active organizations, 1,084 with no place, so the link covers 1,084, not only the 626 from LinkedIn (the rest came from tasks and documents). All 1,084 names go to the four services.

## Verification (2026-11-24, working tree on `b9476a66c`, 33 code and SQL files, SHA-256 fingerprint `f8991ca4f2078f2e`)

- `pnpm db:rehearse supabase/migrations/20261124010000_knowledge_company_lookup.sql --role-probe --check supabase/tests/knowledge_company_lookup.check.sql`: PASSED, with the four standing checks. No SECURITY or DATA findings. Role probe unchanged (anon 1 failing before and after, authenticated 0).
- Shared: `vitest run src/knowledge/company-lookup.test.ts src/knowledge/place-names.test.ts`: 44 passed.
- Worker: `companyLocate.test.ts`, `knowledgeLocateWorker.test.ts`, `companyDirectoryFile.test.ts`: 35 passed. Typecheck clean.
- Web: `KnowledgeCompanyLookup.test.ts`, `company-locate.svelte.test.ts`, `company-locate.server.test.ts`, `KnowledgeImportDialog.test.ts`: 30 passed. `pnpm --filter @buildos/web check`: 0 errors. ESLint and the route guardrails clean. Official Svelte autofixer: no issues on the three new components.
- Broken on purpose, tests failed as they should: several namesakes answered instead of asked (3 failed); one source counted as agreement (4 failed); worker saving an unconfirmed company as known (2 failed).
- Live, free, six public company names typed by hand (none from DJ's graph), directory empty: Stripe and Deloitte placed; Booz Allen Hamilton and Northrop Grumman unconfirmed (both would now be placed after the same-state and household-name rules that run prompted); "Summit Consulting" not answered (three namesakes, none with a town); a made-up name found nothing. 1.1 to 3.8 s a company.

## Applied to production (2026-11-24)

- Rehearsal re-run on the unchanged file (SHA-256 `56a52c09afea`): PASSED. Then `supabase db query --linked -f` and `supabase migration repair --status applied 20261124010000 --linked`.
- Read back from production: four tables exist with row security on; `knowledge_locate` is in `queue_type`; `knowledge_runs_run_type_check` includes `locate`; `knowledge_company_lookups` has the read and answer policies, and signed-in users can update only `question_status`, `chosen_key`, `answered_at`, `updated_at`; the three server-only tables have no client grants; ledger has the version.
- `organizationsToLocate` run read-only against production with the service-role client: 1,084 of 1,090.

## Not done, not verified

- No browser check yet. The tables now exist, so the page can be checked after the deploy (or on local dev, which reads production: starting a lookup there sends the real company names out and needs a worker that knows the job).
- No run on DJ's companies, so coverage and the share that become questions are unknown. Without the directory, small companies will mostly come back "not found".
- The dataset loader has only read a made-up sample with the documented columns, never the real file.
- The paid web search path reuses existing research; its click-through from the banner has only been checked with fakes.
- Each free API's rate limit is from its documentation or my reading of it (GLEIF 60 a minute), not measured under a 600-company run.

## Known limits

- A contact at a tiny company whose name matches exactly one company in the sources gets that company's town, as unconfirmed (or placed, if two sources list the namesake). "Not this one" on the card removes it.
- One tap answers a question; a mis-tap is fixed on the card.
- An import's Undo deletes the companies and their questions; places the lookup created stay.
- Existing duplicate places ("Annapolis, MD" and "Annapolis, Maryland") are reused by key from now on, not merged.
- `knowledge_connections` ("who do I know in Maryland") was not changed; whether it counts unconfirmed locations was not checked.

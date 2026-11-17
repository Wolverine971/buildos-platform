<!-- tasker/160-knowledge-graph.md -->

# 160 — Personal knowledge graph with enrichment

**Status:** IN PROGRESS · **Opened:** 2026-11-16 · **Size:** ambitious (~3 weeks)
**DJ chose (2026-11-16):** ambitious. DJ is the first user.

Plan reviewed: `docs/plans/buildos-knowledge-graph-and-jev_2026-11-16.md` (ChatGPT draft). This
tracker is the build that came out of the review.

## What DJ wants

- Mostly used through agentic chat: the chat pulls up people, orgs, websites, videos and their
  details. Also a place to browse the personal knowledge base: people I know, websites and
  YouTube videos I own, everything linked.
- Drill-in cards like today's task entity popover (org → people → person), with "find more about
  this" on any entity.
- Writes from inside BuildOS and from external agents over MCP (research elsewhere, record here).
- Enrichment runs as their own flows. First enrichment: import contacts from the phone (vCard)
  or LinkedIn (Connections.csv).
- Shared entities are fine, with a hard line between shared public data and one user's private
  data. "If one user stores the phone number for some executive, it isn't shared."

## Rules (defaults DJ did not veto)

- Every write starts private. A person's contact methods, relationships to the user (`knows`),
  notes and birthdays are never public, enforced by a database trigger for every writer.
- Shared facts need a public web/YouTube source and a predicate whose `shareable_subject_kinds`
  includes the subject's kind.
- Anything written over MCP is private.
- Similar names never auto-merge people. Deterministic keys (email, phone, LinkedIn URL, domain,
  YouTube id) identify; a same-name match becomes a merge candidate.
- Jev makes only structured decisions (same person?, which gaps to research); the chat model and
  worker jobs do the rest.

## Pieces

| #   | Piece                                                                                                                                                                                                                                                                                                        | Status                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Migration `20261116230000_knowledge_graph.sql`: kinds, predicates, entities, keys, facts, sources, citations, record links, runs, merge candidates; guards; RLS; `knowledge_search`, `knowledge_merge_entities`, `knowledge_viewer`                                                                          | Rehearsed + two-user check `supabase/tests/knowledge_graph.check.sql` PASSED. **Not applied.**  |
| 2   | Shared core `packages/shared-agent-ops/src/knowledge/`: vocabulary, normalizers, vCard / LinkedIn / Google CSV parsers, `KnowledgeStore` (record, read, list, query, merge), `startKnowledgeEnrichment` (caps: $0.03/entry default, $1/run, $2/user/day, 3 runs at once), task-entity bridge, YouTube oEmbed | BUILT; 24 tests (incl. in-memory store behaviour + vocabulary-matches-migration)                |
| 3   | Web: `/knowledge` page (browse, search, filters People I know / Mine / kinds, drill-in card w/ sources, add/edit/hide/delete, suggestions Keep/Wrong, duplicates review, Find more, Ask in chat), import dialog (preview → import), paste YouTube links (free oEmbed), nav entry, 10 API routes              | BUILT; web check 0/0, lint clean. Not browser-verified (tables not in prod yet)                 |
| 4   | Chat tools: `search_knowledge`, `get_knowledge_entity`, `query_knowledge`, `record_knowledge`, `enrich_knowledge`                                                                                                                                                                                            | delegated agent, in progress                                                                    |
| 5   | MCP: same ops on the connector; DJ's grant needs the new ops (re-consent or backfill)                                                                                                                                                                                                                        | delegated agent, in progress                                                                    |
| 6   | Worker `knowledge_enrich`: per entity search → read ≤3 pages → one fast-model call → keep facts whose quote is literally on the page → write privately; people never get phone/address/birthday researched; private contact details never sent to search or model                                            | BUILT; 7 tests; registered (20 min timeout). No paid run yet                                    |
| 7   | Backfill from `onto_task_entities` (script `apps/worker/scripts/knowledge-backfill-task-entities.ts`, dry by default) + live sync in `extract_task_entities` after each read                                                                                                                                 | BUILT; dry run on DJ: 158 tasks, 362 names, 146 contact facts. Live run needs migration + DJ OK |
| 8   | Task entity popover → "Everything you know about X" link (`/api/knowledge/lookup`)                                                                                                                                                                                                                           | BUILT                                                                                           |

### 2026-11-17: applied + adversarial review

- APPLIED to production: `20261116205351_task_affected_work`, `20261116230000_knowledge_graph`,
  `20261117010000_knowledge_graph_followups` (each rehearsed, dry-run with ROLLBACK, applied,
  ledger repaired). Check file now seeds its own vocabulary (rehearsal is schema-only).
- Fixed from the bug review: runs are server-written (users could fake negative cost / finish a
  running run to dodge the $2/day cap) + `knowledge_reserve_enrichment_run` checks caps under a
  per-user lock; project-limited agent connections refused on all knowledge tools; paid research
  (`knowledge.enrich`) opt-in per key, out of every default/consent bundle; shared phone/email
  only matches a person when first names agree; two different LinkedIn/YouTube ids never fold
  into one entry; same contact twice in a file → one person; one-word re-imports reuse;
  bad `%` in LinkedIn URL no longer kills the import; imports write in 1,500-contact chunks;
  delete-after-merge works (FK cascade); accepting a suggestion retires the old value;
  research keeps a value only as a suggestion unless the page states it, quotes ≥ 12 chars,
  private names/relationships never sent to the model; task sync skips projects the owner left
  and reuses one source per task; vCard 2.1 multi-line QP; email-only contacts keep a name;
  card polling stops after 15 min.
- Speed from the cleanup review: browse list = one SQL call (`knowledge_list`, also returns
  "people I know" count); card open no longer loads every `knows` fact; chunked reads run 4 at a
  time; key/merge-candidate writes are single upserts; existing-fact preload skips new entries;
  2-char search prefix-matches names only.
- Not done (later): parallel page fetch in the research worker, project-name embed in linked
  records, split the add-entry modal out of `+page.svelte`, drop unused `value`/`content_hash`
  columns, `pnpm gen:all` for typed knowledge tables, ~$0.02 possible overshoot with 2 targets
  in flight.

### 2026-11-17 AM: shipped + backfilled

- DJ committed + deployed (269ff3f8a; Vercel + Railway worker 07:34).
- Live backfill for DJ: 360 entries (120 people, 240 orgs), 134 details, 507 task links, 158
  task sources, 0 problems. Re-run created nothing (safe to repeat).
- Prod `/knowledge` checked in the browser: counts, search, card with "In your work" links OK.
- Name matching is exact (case/space only), so "Cadre" / "The Cadre" / "thecadre" and
  "Magnum-LPL" / "Magnum/LPL" stayed separate. Added 4 "same?" suggestions for DJ by SQL;
  duplicates review now says "Same one / Different" for non-people (UNCOMMITTED, web deploy).
  Later: match org names ignoring a leading "The" and punctuation (needs a new normalized column).
- `pnpm gen:types` needs `SUPABASE_ACCESS_TOKEN` (CLI source); not run.
- `/mcp` Reconnect reuses the old grant (allowed_ops snapshot, no knowledge ops); a fresh consent
  (clear auth → sign in again) gets `knowledge.search/get/query`. Open fork: add knowledge reads to
  existing grants for everyone.
- Ingestion inventory (DJ): 631 tasks (342 never read by the people reader; dry run says ≤ $0.31,
  realistic ~$0.05 at last measured $0.00015/task), 419 docs (no people reader), 164 events (no
  attendees stored), 7 collaborators, 0 imported contacts.
- Not yet: one paid Find more (Tavily basic ≈ $0.008/search, 1–2 searches + one DeepSeek V4
  Flash call; capped at $0.03/entry). Existing Claude MCP connection must reconnect to see tools.

### Not in this round

- Automatic promotion of facts to the shared public layer (schema, guards and tests are in place;
  every write is private today).
- Undo for a merge (merges are final; Hide is the reversible action).

## Landmines

- Chat worker and MCP connector use the service-role client: RLS does not protect them.
  `KnowledgeStore` filters by viewer in code and the SQL functions take `p_viewer`.
- MCP grants snapshot `allowed_ops` at creation; new ops are invisible to old connections.
- `pg_trgm` lives in `public` in production (not `extensions`).
- Generated DB types won't have these tables until the migration is applied and `pnpm gen:all`
  runs; the knowledge module uses its own row types meanwhile.

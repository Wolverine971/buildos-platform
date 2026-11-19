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
  (`knowledge.enrich`) user-only since 2026-11-18 (DJ): no key, connector or background run can
  start it, only Find more or asking in BuildOS chat (policy USER_ONLY_OPS + handler refuses);
  people's contact details hidden from connections unless the key opts in; shared phone/email
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

### 2026-11-17 night: knowledge card inside task cards (DJ: "let's do the ambitious thing")

DJ's picture: click a name in a task → the standard card for that entity (basic facts,
relationships you can click through), "Enrich this" with what to look for (phone, email, where
they went to college), get pinged when it lands, and "All people" → /knowledge with People
selected, scrolled to that person. BUILT, UNCOMMITTED:

- Task card = knowledge card. `GET /api/onto/task-entities?…&knowledge=1` also returns
  task entity id → knowledge entry (`loadTaskKnowledgeIds`: the task's record links, matched by
  kind + name, merges followed, hidden skipped; owner-only, so collaborators keep the task card).
  `TaskEntityPopover` renders `KnowledgeEntityCard` for people/orgs with a drill stack
  (Secular Talk → Kyle → back) and "Hide here"; the old lookup call and the "Everything you
  know about" link are gone; places and unfiled names keep the task-only card.
- Find more from a task card opens the same "What should we look for?" dialog; research runs
  in the background.
- App-wide research: `research-session.svelte.ts` (one shared `KnowledgeResearchQueue` per tab),
  `KnowledgeResearchDock.svelte` lazy-loaded by the root layout only after research starts in
  this tab or was live < 30 min before a reload (`research-dock-flag.svelte.ts`): the tray on
  every page but /knowledge + a toast ping "Found N new details about X · Open".
- "All people / All organizations" on every card → `/knowledge?kind=…&e=…`: selects that kind,
  loads up to 5 pages to find the row, centers + highlights it, opens the card. On wide screens
  the list now scrolls in its own column so the card stays beside it (sticky is inert app-wide).
  Card heading focus uses preventScroll.
- "Studied at" (`educated_at`, person → org, private): vocabulary + migration
  `20261118120000_knowledge_educated_at.sql` (rehearsed, dry-run, APPLIED + ledger repaired),
  "Education" focus chip, in the default person research fields.
- Checks: web check 0/0, eslint clean, web 20 tests (3 new for the id matching), shared 63,
  worker knowledge 37. Browser-verified on localhost against prod data: card in task, drill to
  Kyle + back, Find more dialog (Education chip; not started), All people from task → /knowledge
  (fresh load: People selected, Kyle centered + highlighted). Fixed on the way: replaceState
  before router init on a fresh load.
- Not verified: a real research run from a task card → tray + ping (paid; needs DJ's OK),
  phone width.

### 2026-11-17 late night: adversarial review of the above + fixes (UNCOMMITTED)

Independent reviewer (read-only, no paid runs). Verified each finding before fixing:

- BLOCKER fixed: /knowledge snapped the card back to the `?e=` arrival entry on every row click,
  drill or close (`replaceState` never updates `page.url` in SvelteKit 2.70, confirmed in
  client.js). Arrivals now go through `afterNavigate`. Browser-verified: arrive on Kyle → click
  Tom Mann stays on Tom → close stays closed.
- Name → entry matching: quote match first (survives renames and merges, which repoint links),
  then name, then the caller's own active entry with exactly that name when only one exists
  (unlinked tasks, collaborators' own entries; two "Chris"es → no card). Links load in one
  embedded query in parallel with the entities. Tests rewritten (4 cases).
- Ping after a reload mid-research: dock re-arms its reload marker while research is live
  (it used to clear it in a race). Failed polls back off to 60 s; sign-out resets the queue
  (no polling a 401, no previous user's run names on the next sign-in).
- Hide/Delete inside a task card drops that name's mapping (`onRemoved` → `forgetKnowledge`),
  so the name goes back to the task card instead of a dead "not found" card.
- Phones: "All people" scrolls to + highlights the row without opening the sheet over it.
  Wide list column no longer traps the wheel. Past 3 pages the row is pinned at the top.
- Find more copy: footer no longer says phone numbers are never looked up; hint under the text
  box says to pick Phone & email / Education above. (Typed text is still never parsed.)
- Education picked → its own search (`… university college alumni`) takes the second search
  slot; default research extracts schooling but adds no search. Worker test added.
- Toast "Open" lands on the row in its kind list. Refusals show the skip reason.
- The knowledge card, dialog and research queue load in a separate chunk, only once a task has
  a name in the graph (prefetched before the click).
- Checks: web check 0/0 (after restoring 5 page functions an edit had cut), eslint clean,
  web 21 tests, worker knowledge 38, shared 63.

Not done (proposed to DJ): tray shows on every page while research history is recent; two tabs
both ping; "Add to People" for unfiled names; places + docs/chat/calendar mentions; collaborators'
names filed for the project owner; deleting an entry doesn't stop the next task edit re-filing it;
task quote line above the knowledge card; mobile app parity; chat enrich tool with fields.
Commit note: KnowledgeEntityCard, /knowledge page and knowledge-client are staged with the other
session's hunks; migration 20261118120000 (applied) must be committed with contacts-import.test.ts.

### 2026-11-18: cards everywhere, Add to People, places (DJ: "do 1, 2, 3"; shared projects parked)

BUILT, UNCOMMITTED:

- One card component for every surface: `KnowledgeCardPopover.svelte` (knowledge card + drill
  stack + Find more dialog + optional "In this task" line + host footer). Task cards and docs
  use it; it loads in its own chunk only when the record has names.
- **Add to People / Organizations / Places** on the task-only card for names not in your
  knowledge: `POST /api/knowledge/from-task-entity` files that one name (with the phone/email/
  address the task ties to it) into the caller's own private graph, linked to the task, and the
  card switches to the knowledge card. Browser-verified: "Add to Places" on 8258 Veterans Hwy
  (Tangled Balloons task) → place entry with address + Map + In your work (real entry kept).
- **Docs:** names a doc is filed under (knowledge_record_links, 98 docs / 468 links in prod)
  become clickable in the reader (`RecordKnowledgeMentions` + `GET /api/knowledge/mentions`).
  Browser-verified on Pitch Desk: 39 names; Christopher Pfaff → email, phone, works at
  Oceanetics, In your work.
- **Chat:** same wiring on finished assistant replies (AgentMessageList `knowledgeTargets`,
  AgentChatModal loads the session's names when a chat opens). Dormant until the chat
  name-capture (other session, staged) ships: 0 chat_session links in prod today.
- **Calendar:** not done — events store no attendees (nothing to link).
- **Places:** matched like people/orgs on task cards; filed only on request ("Add to Places"),
  never automatically (task place reads are noisy: "front desk", "US").
- **Hidden stays hidden:** the task → knowledge sync skips names the owner hid
  (`withoutTaskEntityRefs`); Delete/Hide from a task card also dismisses the name on that task.
- **"In this task: …" line** above the knowledge card on task cards (with Map for places).
- Checks: web check 0/0, eslint clean, web 22 / worker 38 / shared 65 tests.

Data noise seen (doc reader, other session): an entry literally named "First" is linked in
Pitch Desk and underlines the word "first"; "Pitch Desk" is filed as an org. Hide fixes it per
entry; the doc reader should not file these.

Parked (DJ, 11-18): shared projects — whose graph a collaborator's task names go into. Needs
research before building.

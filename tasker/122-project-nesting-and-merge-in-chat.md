<!-- tasker/122-project-nesting-and-merge-in-chat.md -->

# 122 — Project nesting and merge in chat

**Status:** BUILDING. DJ picked the ambitious plan on 2026-10-17. See "DJ's picks and the build
plan" directly below; it supersedes the owner questions and phase table further down.  
**Priority:** P2 · **Opened:** 2026-10-17 · **Owner:** DJ picks the forks; Claude builds

## DJ's picks and the build plan (2026-10-17)

**What DJ wants, in his words:** "Let's do the ambitious stuff." Nesting one project in another
should be straightforward: "you can already do this in the UI, we just need to build the tools so
that an agent can do this." When nesting or combining, the agent should first "do a quick analysis
to see if there's duplicate information, like duplicate tasks, documents." For Cadre: "one
consolidated Cadre project under Wayne Strategies, and it should combine the two Cadre projects
into one."

**Decisions:**

| Fork                                          | Decision                                                                                                                                                                                                                                                                                               | By                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Lean or ambitious                             | Ambitious: truth fix, proposal-card system, nest card, combine card, duplicate check, then the move card                                                                                                                                                                                               | DJ                                 |
| Cadre shape (Q1)                              | One combined "Cadre" under Wayne Strategies. One level, so no two-level migration                                                                                                                                                                                                                      | DJ                                 |
| Whole-project combine (Q2)                    | **Build it** (was "park"): the 10-01 fold engine, plus a companion migration                                                                                                                                                                                                                           | DJ (implied by "combine into one") |
| Who can see the combined Cadre                | **Private to DJ.** David, Ian and Phillip lose access to the old Content Ops material. They last signed in Feb/Apr/Jul, and their footprint is 1 doc and 3 tasks. Phillip is likely the "Phil" in the strategy doc                                                                                     | DJ                                 |
| Stale Wayne consolidation run `3579661e` (Q6) | **Cancelled 2026-10-17** (1 run cancelled, 9 open questions withdrawn; no content touched)                                                                                                                                                                                                             | DJ OK                              |
| Combine direction                             | Content Ops folds **into** DJ Internal, which is renamed "Cadre" and nested under Wayne. DJ Internal keeps its id, chats and links, and has the most recent activity (10-12 vs 09-04)                                                                                                                  | Claude (vetoable)                  |
| Calendar events in a combine                  | Past standalone events stay with the archived source as history; no Google calls. Upcoming standalone events block the combine and are listed on the card, so chat helps move or delete them. Content Ops: 16 past, 2 upcoming. Re-homing synced events (3–5 days plus a live Google test) is deferred | Claude (vetoable)                  |
| Duplicate check                               | Runs automatically when chat proposes a nest or combine. Check-only Consolidate mode, about 1¢, under a minute. The card shows counts plus top groups and links to the full merge review                                                                                                               | Claude, from DJ's ask              |
| Consent model                                 | The click is consent. Chat proposes, and DJ's click runs it under his own session or a service RPC that re-checks him                                                                                                                                                                                  | Standing rule                      |

**Work packages (in order):**

| #   | Package                                                                                                                                                                                                                                                                                                                                    | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WP1 | Phase 1 truth: hierarchy in list/search/overview/details, global index labels, `get_field_info` fix, static capability line plus "a missing chat tool isn't a missing feature", Jev labels, connector parity, budget re-baselines                                                                                                          | **Done 2026-10-17 (uncommitted).** One visibility rule (`project-family.types.ts`) plus `project-hierarchy-reads.ts`. Parent and sub-projects appear on list/search/overview/details and in the connector. The global index shows "· part of X / · includes N". The capability line (290 chars) is on both lanes. `get_field_info` is now a "curated guide" and has `parent_project_id`. Jev cards show the labels. Caps re-baselined (system prompt 12,000 → 12,350). Runtime 372/377 (the 5 failures are the other session's in-progress search tests), gateway 171/171, worker 77/77; all typechecks clean                                                                                                                                                                                                                                                                              |
| WP2 | Fold readiness companion migration: classify the post-10-01 columns, past events stay and upcoming block, links to left-behind events, checks, rehearsal. **Prod apply needs DJ OK**                                                                                                                                                       | **Done and APPLIED to prod 2026-10-17 (DJ OK),** with 220000/220100, all recorded. Verified: 5 fold functions (service*role only), 0 policy gaps. `20261017170000_project_fold_v1_readiness.sql` plus check `supabase/tests/20261017170000*…check.sql`. The 0930 fold check got two fixture fixes. Rehearsal and role probe PASS (0 SECURITY/API/DATA). Event links block (`event_links_not_supported`); all 146 prod event links are task-event links the fold already drops. Apply order: 220000 → repair → 220100 → repair → 170000 → repair. Cadre is still blocked by: 2 upcoming events, the calendar flag (1 past task event plus 1 done dated task), and the 3 editors                                                                                                                                                                                                             |
| WP3 | Consolidate check mode plus any-projects scope plus worker start helper, with a migration. **Prod apply needs DJ OK**                                                                                                                                                                                                                      | **Done and APPLIED to prod 2026-10-17 (DJ OK)**; types and schema regenerated from prod (they had also lagged since the 10-04 Libri migrations). `20261017160000_consolidation_check_mode.sql` (`mode` full/check, status `checked`; the open-run index covers full runs only). Rehearsal PASS. Worker `startConsolidationCheck` never throws and reuses a same-set check that's running or finished within the last 15 minutes. `summarizeConsolidationCheck` (shared-agent-ops). The checked run page shows a read-only summary with "Review and merge". The `request` field is now passed to the grouping call. Tests: 27/53/37, worker+web typecheck clean. Types hand-edited, so run `gen:all` after apply. ~~Deploy landmine~~ cleared: the migration was applied before the code shipped. Cost per check is unmeasured (no paid run)                                                |
| WP4 | Proposal-card rail (generic card kind registry; identity from the `chat_tool_executions` row; one resolver route, history note, compaction, turn-end path, disposition-gate exception) plus the **nest card** (`propose_project_parent` → `setProjectParent` under the user's session)                                                     | **Built; shipped in DJ's commit `184fdb859` (13:04, pushed).** Tools `propose_project_parent` and `propose_project_combine` (global surface only, read lane, ops `onto.project.*.propose`, never on MCP). Stable card id = the `chat_tool_executions` row id. The duplicate check starts automatically (1.5 s timeout). `awaitingUserCard()` ends the turn on the card, and a card makes the rest of the turn read-only. The `card_rail` compaction branch never sends `client_action` to the model. Web: `ProposalCard` + nest body + presenter ("Needs your choice to nest project…"), history notes wired. Capability line is 454 chars. Caps: worker global 55,140, web catalog 62,100, system prompt 12,525. Tests: runtime ~190, worker new 9 + suites, web cards 33+, round-trip worker card → real resolver                                                                        |
| WP5 | Web fold service and routes (preview/apply/unfold, organize-service pattern) plus the **combine card** (`propose_project_combine`: what moves, who loses access, events left behind, upcoming-event blockers, duplicate-check results, Undo = unfold) plus merged-project redirect plus refusing writes into a merged source (gateway/MCP) | **Built; shipped in `184fdb859`.** Combine body (access pick with no default, owner can't be removed, upcoming events disable Apply, past events collapsed, Undo limits), `DuplicateCheckStrip` (3 s poll, stops at 40, pauses when hidden), merged-project redirect on project/doc/task/Organize pages, gateway refusal `project_merged` for MCP and worker writes. Not yet live-tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| WP6 | Calendar sync flag on (`calendar_sync_ready`)                                                                                                                                                                                                                                                                                              | **DONE 2026-10-17, flag ON (DJ OK).** Two throwaway projects plus 1 dated task created through the connector (event synced to Google). With the flag off, the move was blocked `calendar_sync_not_deployed`. With it on, A→B moved: the old event was soft-deleted and its Google sync cancelled, and a new event in B was synced to Google. B→A moved back the same way. All `sync_calendar` jobs completed, 0 errors. Cleanup: dates cleared, both projects soft-deleted. **Gotcha for future live checks:** a dated task in a new project auto-creates a Google sub-calendar "<project> - Tasks", and local scripts can't delete it (the dedicated Calendar OAuth client exists only on Vercel). Delete it through prod `DELETE /api/onto/projects/[id]/calendar` from a signed-in browser. Project creation also runs the small paid `pick_project_emoji` job even with no description |
| WP7 | Selective **move card** on Organize (blocked items dropped before preview, re-preview on stale, multi-item staging)                                                                                                                                                                                                                        | After WP4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Paid live check, PASSED 2026-10-17 17:12–17:17 UTC (DJ OK; prod `184fdb859`; DeepSeek V4.1 Flash).** Global chat on build-os.com, 4 throwaway projects (since soft-deleted). GIF: `~/Downloads/buildos-nest-combine-cards-live-check-2026-10-17.gif`.

- **Nest:** "Can you put ZZ Nest Child inside ZZ Nest Parent?" produced the card (activity line "Needs your choice to nest project"), and the duplicate check auto-started. Click → `parent_project_id` set, the parent's shared folder created, outcome `applied`. Undo → confirm ("Put ZZ Nest Child back at the top level?") → parent null, "Undone."
- **Combine:** "…Combine Source into Dest" produced the card (what moves, who can see it, Undo limits). Click → source archived with `merged_into` = dest; dest got both docs, the task, and the "From ZZ Combine Source" folder; a manifest was recorded; the old URL redirects to dest. Undo preview ("3 items go back… folder removed… only once") → confirm → source active again with its records back.
- **History:** the next turn ("where did we land?") used no tools and correctly reported both were undone, with times.
- **Cost:** about $0.032 logged for DJ (chat $0.023, checks $0.003, finder $0.003, tool selection $0.002, emoji and entity jobs $0.002). The balance delta of $0.144 included $0.123 from another account in the same window.
- **Found (polish, not blocking):**
    1. The duplicate strip pauses while the tab is hidden, so automation never sees results (the endpoint and data were verified directly).
    2. The model's nest reply printed raw UUIDs.
    3. Grouping labelled near-duplicate tasks `sibling_tasks`, not `duplicate_tasks`.
    4. The second check run recorded `cost_usd` 0 though its LLM call was logged.

**Cadre (WP8) blockers, checked after the live run:** Content Ops' 2 upcoming events, Foundation Precision (Nov 9) and Advanced Precision (Nov 11), are exact duplicates of DJ Internal's. Deleting the Content Ops copies loses nothing and unblocks the combine. Calendar is ON. The 3 editors are removed by the card's "They lose access" choice.

**Merged-project hardening (10-17, after the live check, with the chat-pipeline session):**

- Search: both chat search RPCs filtered only `deleted_at` on the project row, so a merged-away source still showed up. Rule: workspace search hides archived projects; a scoped search may open an archived project that isn't merged; a merged source returns nothing. It shipped in the other session's `20261017180000_search_rpcs_project_scope.sql` (in prod), with fixtures in `archived_scope_guard.check.sql`.
- `20261017190000_project_merged_stays_archived.sql` (NOT applied, needs DJ OK): CHECK `merged_into_project_id IS NULL OR archived_at IS NOT NULL`. A connector explicitly scoped to a merged source could un-archive it through `update_onto_project`; the gateway now refuses that too (`op-execution-gateway.entity-access.ts` `isMergedProject`, plus a test). Prod has 0 violators.
- Rehearsal landmine fixed: snapshots were schema-only, so once the fold was in prod `private.project_fold_table_policy` arrived empty and `project_fold_table_coverage` failed for every session. `rehearse.py` now also dumps `REFERENCE_DATA_TABLES` rows, with a fresh CLI login for that dump. Full rehearsal is green (2 fold checks + 4 standing).
- Merged-source refusal for scoped `search_project` + `explore_project` ("combined into X", not empty or leftover results): built by the chat-pipeline session (`AgenticChatOntologySearchProjectMergedError`, web route maps it to 409), shipping with its next push; explore handed to it 10-17.

**Coordination (10-17):** the chat-pipeline lean build (another session; see
`docs/technical/reviews/AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17.md`) owns these until it pings that
they're stable: worker `agentic-chat/provider/**`, `turn/**`, `stream/**`, `host/config.ts`, web
`components/agent/**`, `agent-chat-stream-controller`, `worker-transport-client`,
`routes/api/agent/v2/**`, `worker-turn-preparation.server.ts`, and runtime
`ontology-search-ranking.ts`. WP4/WP5/WP7 card placement and turn-end edits wait for that ping.
| WP8 | Cadre for real, through chat: nest DJ Internal under Wayne → rename "Cadre" → remove the 3 editors from Content Ops → handle the 2 upcoming events → combine → review duplicates → archive leftovers. **Paid live check, DJ OK** | Last |

## Summary

- **The incident.** On 10-16, in global chat, DJ asked how to combine his Cadre projects. The
  model told him twice that "projects can't nest." That is false. Production has 8 nested projects
  under 2 hubs, and Wayne Strategies already holds 7 of them. Global chat simply never sees the
  hierarchy, and `get_field_info` leaves out `parent_project_id`.
- **What DJ meant by "combine."** Not a database merge. From the transcript, he wanted Cadre filed
  under Wayne Strategies, the useful parts kept, and the outdated parts dropped. Today's tools already
  cover that: nest, move the records that belong elsewhere, merge duplicate docs, and archive the rest.
- **Recommendation.** First, make chat tell the truth (about 1 day, free, no migration). Then let chat
  _propose_ a nest, and later a selective move, on a card. Your click runs it under your own login,
  with Undo. Keep whole-project fold off the ladder: leave its two migrations unapplied and give chat
  no fold tool.
- **No migrations** are needed for the recommended path. Every write goes through APIs that are
  already live: the parent route, Organize preview/apply/undo, and Consolidate.
- **Six owner picks** are at the end. The one that shapes everything is **Q1, the shape Cadre should
  end up in**, because nesting only goes one level deep.

## Second pass: verified against code and prod (2026-10-17)

A second session re-checked every claim below: 3 read-only code audits plus prod count and catalog
reads (no user content beyond DJ's own project names and counts). **The diagnosis holds.** Global
chat never sees the hierarchy, and nothing in any prompt or skill says projects can't nest. The
model inferred it from read tools that never show a parent, plus `get_field_info` calling itself
"authoritative". **Several parts of the plan don't hold as written.** The corrections below supersede
the sections that follow them.

### Prod facts, re-checked

- Confirmed: 8 nested projects under 2 hubs (Wayne 7, BuildOS 1). Neither Cadre project is nested.
  Members: DJ Internal 1, Content Ops 4. Fold: 0 functions, 0 ledger rows. Flags:
  `calendar_sync_ready=false`, `asset_access_ready=true`. Consolidation run `3579661e` has been
  `waiting` since 10-04 and covers 8 projects.
- **Only DJ uses any of this.** Both hubs are DJ's. All 9 Organize batches are DJ's, and the last
  was the 10-01 live test. Consolidate has 2 runs ever. Other users: 12 have 2+ active projects, 6
  have 5+, 1 has 10+. DJ has 47 (39 top level).
- **Dated tasks are a bigger block than stated.** DJ Internal has **19 dated tasks (9 open)**, not
  "at least 2". Content Ops has 1. `calendar_sync_not_deployed` also fires for tasks linked to an
  event, and `move_onto_task` hits the same blocker, since it runs `private.organize_impact` too.
- The 09-29 twin, DJ Wayne Studio (`2b3682dd`), is still a separate top-level project.
- `merged_into_project_id` is already a live column (from `20260930130000`), though nothing reads it.

### Corrections to the plan

| Doc says                                                                    | Verified                                                                                                                                                                                                                                                                                           | Effect on the plan                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Put `family` on `get_onto_project_details`                                  | That tool isn't on the **global** surface (`surfaces.ts:186`, project only)                                                                                                                                                                                                                        | Put `family` on `get_project_overview`, which is global; keep details for project chat                                                                                                                                      |
| Add `parent_project_id` at `overview-reads.ts:223` and to the loader select | `mergeProjectScheduleDates` (`:161-172`) copies only dates, and the global index has 3 fixed field lists (`context-loader.ts:1323`, `context-models.ts:264`, `build-lite-prompt.ts:2810`)                                                                                                          | Plumb the field through all four                                                                                                                                                                                            |
| A 450-char static line fits                                                 | System prompt cap 12,000, last measured 11,849, so **about 151 chars** of room. The test fixture is a project turn; no global-turn cap exists                                                                                                                                                      | Trim or re-baseline with a dated comment, and add a global-turn fixture. `project_create` has its own Operating Strategy (`build-lite-prompt.ts:1729`)                                                                      |
| Jev labels (`part_of`/`includes`) help                                      | They feed only Jev's selection step. `renderWorkspaceContextBlock` never prints them, and the global finder defaults to off                                                                                                                                                                        | Render the labels in the block. That's small                                                                                                                                                                                |
| (not mentioned) the connector                                               | ChatGPT/Codex/Claude connectors use separate serializers (`op-execution-gateway.projects.ts` `serializeProjectSummary`; `load_fastchat_context` column list) that **also hide the parent**                                                                                                         | Add connector parity to Phase 1. Connector agents made the Studio twin                                                                                                                                                      |
| Copy `request_email_account_connection` (read lane, no reviewer)            | It's `category:'write'`, and its consent starts with a typed yes. Not a clean precedent                                                                                                                                                                                                            | Precedent is only the `client_action` rendering (`AgentClientActionCard`)                                                                                                                                                   |
| Copy the shared-doc card                                                    | That card is born from a **reviewed write**: its id is the `chat_turn_effects` effect id. The resolver, history filter, payload compaction, turn-state "end on card" check (`awaitingSharedDocumentConfirmation`, `turn-state.ts:1532`) and presenter are all hard-coded to `update_onto_document` | A read-lane proposal tool needs its own identity. Use the `chat_tool_executions` row (it has `session_id`, `arguments`, `result`), which needs no migration. Generalize the ~6 hard-coded spots into one card-kind registry |
| `tool-classification.ts` has an end-on-card case; `awaitingUserAction()`    | Neither exists. It was replaced on 09-30                                                                                                                                                                                                                                                           | See above                                                                                                                                                                                                                   |
| Phase 4 needs no new code: `startConsolidationRun` accepts a subset         | **Wrong.** Its only inputs are `projectId` and `request`, and the scope is the root plus its children                                                                                                                                                                                              | Subset scope is new code, about 1 day, **unless Cadre is a hub**, in which case consolidating Cadre already covers exactly its two projects                                                                                 |
| Q6: cancel the stale run (implied work)                                     | A cancel route already exists: `POST /api/consolidation/runs/[id]/cancel`, owner only                                                                                                                                                                                                              | Q6 is a single click with DJ's OK                                                                                                                                                                                           |
| "Adjust in Organize" opens with the items staged                            | Organize takes `?with=` plus **one** `?document=` or `?task=`                                                                                                                                                                                                                                      | Staging several items is new code                                                                                                                                                                                           |
| Worker surface budgets have room                                            | Headroom: global 37 B, project 138 B, project_create 44 B                                                                                                                                                                                                                                          | Every new tool re-baselines the caps (dated comment)                                                                                                                                                                        |

### Landmines the first pass missed

1. **One blocker sinks the whole Organize batch** (`organize_blocked`). A move card has to drop
   blocked items (dated tasks, recurring tasks, pending proposals, shared assets) _before_ preview,
   not just flag them.
2. **Cards go stale.** Apply re-checks every project's doc-tree version. A card left sitting gets a
   409, so it needs "Preview again." The confirmation token isn't stored on the server.
3. **The 200-move cap counts the docs inside subtrees**, so a 50-item card can still exceed it.
4. **Nest Undo isn't symmetric.** Re-attaching needs admin on both projects; detaching needs only one.
5. **Archived children count toward `project_has_children`,** but `family.children[]` hides them.
   Pre-checks must use `child_count`. `family` returns `can_detach` but no `can_change_parent`.
6. **Project chats can't look up other projects** (list and search are removed from the project
   surface), so a nest proposal from inside a project chat can't find the parent. Mount it on global
   chat first.
7. **Name and op heuristics.** An op ending in `.set` or `.move`, or a name starting `move_` or
   `set_`, is treated as a write. Proposal tools need `category:'read'` and an op like
   `onto.project.parent.propose`.
8. **The disposition gate may push back.** Its prompt says "a proposal is not read-only when the user
   already commissioned the action" (`disposition.ts:76`). Worse, `takeUnsavedCommissionNotice` can
   append "No changes were saved in this turn." under a card. Both need a card-aware exception.

### What the second pass changes in the recommendation

- **Phase 1 grows a little** (≈1.5 days, free, no migration): add connector parity, the four-place
  plumbing, the budget trim, and one class-level line, _"a missing chat tool is not a missing product
  feature: say chat can't do it yet."_ That last line is the real fix for this incident's failure
  mode, beyond nesting.
- **Phase 2 has a lean and an ambitious form.** Lean (≈0.5–1 day): chat returns a button that opens
  the existing Move under… picker with the parent preselected, with no new write path. Ambitious
  (≈3 days): build a generic **proposal-card rail** once (identity from `chat_tool_executions`, one
  resolver, history note, compaction and turn-end path keyed by card kind), with nest as its first
  card. Moves, consolidate and later cards then plug in. The second card kind is the natural point to
  stop hard-coding.
- **Phase 3** is ≈4–5 days on the rail, not 3–4, because of the blocked-item drop, re-preview and
  multi-item staging.
- **Q1 deserves a fresh look.** DJ's own words on 10-16 describe two levels: "put the internal DJ
  project inside the Cadre project" and "a new project within Wayne Strategies called Cadre."
  Privacy is per project only (no per-doc privacy), so a client with private notes _and_ a team
  space needs two projects. Grouping them under the client, while the client sits under the agency,
  takes two levels. Q1-d also makes "consolidate Cadre" work with no subset code.

## What's live today (checked 2026-10-17)

Production checks were catalog and count reads only. No user content was read.

| Capability                                                                         | State in prod                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nest one level (`parent_project_id`, set-parent RPC, family RPC)                   | **Live and in use.** 8 live nested projects, 2 hubs. Wayne `f85b6c5f` has 7 children and a shared folder. Neither Cadre project is nested: both have no parent and no children. DJ Internal has 1 member; Content Ops has 4.                                    |
| "Move under…" picker (admin only), breadcrumb, hub's sub-project list              | Live (Phase 1, `ef69ffd8c`).                                                                                                                                                                                                                                    |
| Organize: move docs and tasks between projects, with preview, Apply, Undo, History | Live. 9 batches so far. **Docs and tasks only.** Plans, goals, milestones and risks cannot move. Limits: 200 moves and 20 projects per batch.                                                                                                                   |
| Moving dated tasks                                                                 | **Blocked.** `private.organize_rollout.calendar_sync_ready = false`, so every task with a start or due date fails with `calendar_sync_not_deployed`, in Organize and in chat alike. Asset moves are on (`asset_access_ready = true`).                           |
| Consolidate (merge duplicate docs by fact ledger, task merges, question cards)     | **Live and ungated** (migrations `20261003150000`/`150100` applied). It runs on a project plus its editable sub-projects. **Landmine:** Wayne's run `3579661e` has been `waiting` since 10-04 and covers 8 projects. A new run on Wayne returns that stale one. |
| Chat: `move_onto_task`                                                             | Mounted on the global surface. Moves one task. Consent is a typed "yes" plus a token, **not a card**, and the move **skips the Organize journal**, so it has no History or Undo.                                                                                |
| Chat: nest, move docs, fold                                                        | None. `update_onto_project` has no parent field (and the guard trigger would refuse one anyway). The read tools hide the parent.                                                                                                                                |
| Fold/unfold (absorb a whole project)                                               | **Not in prod.** `20260930220000`/`220100` are not in the ledger and their functions don't exist. The 4 owner questions were never answered.                                                                                                                    |

How each of these can be called matters for the design:

- `onto_project_set_parent_atomic` checks `auth.uid()`. A worker (service) call fails with
  `project_parent_auth_required`.
- The Organize preview and apply RPCs, and `onto_task_move_atomic_for_user`, are service-only and
  take the acting user explicitly.
- `onto_project_family_v1` accepts the service role when it is given an actor. The worker already
  does this in `shared-document-edit.ts`.

## 1. Mental model: three different intents

| Intent                                    | What changes                                                                                                                                                              | Reversible?                                                                                                    | Blast radius                                                     | Who can see what                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nest** ("Cadre is part of Wayne")       | A label plus navigation: breadcrumb, hub list, the parent's shared-docs shelf, hub chat reads children. **Nothing moves.**                                                | Yes, instantly: "Remove from Wayne". Needs admin on the child or the parent.                                   | One column on one row.                                           | **No access change.** David, Ian and Phillip would still see only Content Ops. Wayne's shelf shows only to people who can open Wayne. Known residual: a child-only member can read the raw parent UUID through PostgREST (no name, no docs). |
| **Move selected records**                 | Docs (with their subtrees) and tasks change home. Comments, assets, public pages and eligible assignees follow. Links that would leave the moved set are cut (previewed). | Yes. Organize Undo or History. Undo skips anything edited since, and the reversal can itself be undone (redo). | Only the listed items.                                           | **Visibility follows the record.** DJ Internal → Content Ops exposes it to 3 more people. Content Ops → DJ Internal takes it away from the team.                                                                                             |
| **Fold / merge** (whole project absorbed) | Every record moves, the source tree lands under "From <source>", and the source is archived with a forwarding pointer.                                                    | Designed with Unfold, but **not built in prod**.                                                               | Everything: 97 project-pointing columns classified, 15 blockers. | The source's entire contents take on the destination's audience. Folding Content Ops into DJ Internal is blocked until the 3 team members are added to DJ Internal, which would then show them all of DJ's private Cadre notes.              |

**What "combine" usually means.** People say "combine" when they mean _put these together and
clean up_. DJ's own words on 10-16: _"Maybe we create a new project within Wayne Strategies called
Cadre… a lot of it is just way outdated… figure out what the useful information is."_ That is nest +
curate, not a database merge. The eval agrees. Nesting labels lifted business-and-client search from
60% to 94% of projects reached. Folding was a modest win, and only for true twins
(`docs/research/project-structure-search-eval-2026-09-29/`).

## 2. The safe default ladder (recommended)

Chat climbs only as far as the user's need, one rung at a time, and every write is a click:

| Rung                         | Chat's job                                                                                                | Guardrail                                                                                                                                                                                  | Build             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 0. Tell the truth            | Explain nest / move / no-merge accurately, show who sees what, point to ⋯ → Move under… and ⋯ → Organize… | Static text and structured data. No keyword gating.                                                                                                                                        | Phase 1           |
| 1. **Nest**                  | Propose "Put X under Y" on a card                                                                         | Click = consent. The web runs it under the user's session (needs admin on both projects). Undo on the card.                                                                                | Phase 2           |
| 2. **Move selected records** | Propose an exact list on a card                                                                           | Server impact preview before Apply. A **who-can-see-it line** whenever the two projects' members differ. Saved as an Organize batch with Undo and History. "Adjust in Organize" for edits. | Phase 3           |
| 3. Merge duplicate docs      | Point to (later, propose) a Consolidate run                                                               | Already live: fact receipts, question cards, Apply/Undo. A run spends model money, so the click is consent to spend.                                                                       | Phase 4, optional |
| 4. Archive leftovers         | Existing archive tools                                                                                    | Existing reviewer path.                                                                                                                                                                    | Live              |
| ~~Fold~~                     | **Not offered.** If asked, chat explains why nest + move + archive covers it.                             | —                                                                                                                                                                                          | Parked            |

**My call on fold:** it is not a base-layer primitive we need. Nest plus journaled moves is the
base layer, and both are live. Fold would add three things nothing else covers: forwarding old links,
re-pointing chats, and carrying plans and goals. None is worth fold's blast radius today, and the
privacy failure mode (a shared project swallowing a private one) is exactly the "willy-nilly" case.
Leave the fold migrations unapplied and untouched (CI fails on edits to migration files). Revisit
only if a true twin (for example DJ Wayne Studio ↔ Wayne) still needs it after rungs 1–4. If it ever
comes back, make it a UI-only Combine screen that chat can only link to.

## 3. Chat tool design

### Reads: no new tools, just fields (zero schema growth)

- **`list_onto_projects` / `search_onto_projects`:** add `parent: {id, name} | null` and
  `sub_project_count` to each project. Show the parent only when the viewer can open it, the same
  rule as `context-finder/load.ts` `workspaceHierarchyLabels`. The summaries RPC
  (`get_onto_project_summaries_v1`) has no parent column, so add one ids-only
  `select('id, parent_project_id')` on `onto_projects` for the accessible ids. That is the same read
  `context-finder/load.ts` already makes, done in `ontology-reads.ts`
  `loadAccessibleProjectSummaries`.
- **`get_onto_project_details` / `get_project_overview`:** add `family: {parent, children[],
can_change_parent}` from `onto_project_family_v1` (service + actor, as in the worker's
  `shared-document-edit.ts`).
- **Global context loader** (`packages/agentic-chat-runtime/src/context/context-loader.ts`
  `loadGlobalContextData`): it already runs `select('id, start_at, end_at')` on `onto_projects`.
  Add `parent_project_id` there (0 extra queries). In `build-lite-prompt.ts`
  `collectGlobalProjectIndex`, render "· part of Wayne Strategies" on child lines and "· includes 7"
  on hub lines. `overview-reads.ts:223` gets the same one-column change.
- **`get_field_info`** (`packages/agentic-chat-runtime/src/tools/entity-field-info.ts`):
    - Add `parent_project_id`: "Parent project, one level. Not writable through update_onto_project.
      Change it with propose_project_parent, or the project's ⋯ → Move under… (admin on both). A
      project with sub-projects can't have a parent."
    - In `catalog/definitions/utility.ts`, change "authoritative" to "curated guide to commonly used
      fields."
    - In `overview-reads.ts` `getFieldInfo`, change the not-found error to: "not in this curated
      list — this does not mean the field doesn't exist." Today's message lists "Available fields",
      which reads as proof that the field doesn't exist.

### Writes: proposal tools whose output is a card (nothing executes in the worker)

(Second pass: this precedent is only partly right; see the corrections table above.) The precedent is `request_email_account_connection`, a read-lane tool that returns
`requires_user_action` plus a `client_action` button and never touches the reviewer. The click side
copies the shared-doc card (`SharedDocumentEditCard.svelte`, `POST
/api/chat/shared-document-edits/[id]`, and `shared-document-edit-card-history.ts` for the
next-turn note).

**`propose_project_parent`** (Phase 2)

- **Arguments:** `{ project_id: uuid, parent_project_id: uuid | null, note?: string ≤200 }`.
  `null` means "take it out."
- **The worker checks first** (family RPC + membership): admin on both projects for attach, or on
  the child or the parent for detach. It also checks the one-level rules: not self, the parent isn't
  itself a child, the child has no children. A failure returns `{status: 'blocked', reason_code,
message}` with no card. Otherwise it returns `{status: 'proposal_ready', requires_user_action:
true, client_action: {kind: 'confirm_project_parent_change', action_id, project, from_parent,
to_parent, member_count, effects[], expires_at}}`.
- **The click** calls `POST /api/chat/project-parent-changes/[tool_execution_id]` with `{choice,
session_id}`. The args are read from the tool-execution row, filtered to this user and session,
  then run through the existing `setProjectParent(locals.supabase, …)` from
  `project-hierarchy.service.ts`. That is the same code path as the picker, and it gets the existing
  error messages (`project_has_children`, `project_parent_admin_required`, …). The card is
  single-use. The resolution is mirrored onto the result so the card reloads resolved, and the next
  turn gets one structured note.
- **No migration.** Don't add a `_for_user` service variant: it would need a typed "yes," and your
  rule is that a click is the only consent.

```
┌────────────────────────────────────────────────────┐
│ Put "The Cadre Content Operations" under           │
│ "Wayne Strategies"?                                │
│  • Nothing moves. You can take it out any time.    │
│  • Access doesn't change: David, Ian and Phillip   │
│    still see only Content Ops.                     │
│  • It shows Wayne's shared docs to people who can  │
│    open Wayne.                                     │
│ [ Move under Wayne Strategies ]   [ Not now ]      │
└────────────────────────────────────────────────────┘
after: "Now under Wayne Strategies · Undo"
```

**`propose_project_moves`** (Phase 3)

- **Arguments:** `{ destination_project_id, destination_folder_id?: uuid | null, items:
[{kind: 'document' | 'task', id}] (1–50), note? }`.
- **The worker validates** that each item exists and that the user can write both sides. It drops
  pinned docs (START HERE, thinking log, the shared folder) and counts subtrees. It flags dated tasks
  while the calendar flag is off. It also computes the **visibility change** from the two projects'
  member lists ("3 more people will see these: David, Ian, Phillip" / "2 people lose access").
- **The card** reuses Organize without the Organize screen. It loads both snapshots (`GET
/api/onto/organize/snapshot`), replays the plan with the pure
  `lib/components/organize/organize-plan.ts`, and calls `POST /api/onto/organize/preview` to show the
  server's impact and blockers. **Apply** then calls `/apply` (token + batch id) and Undo calls
  `/undo`. The batch appears in Organize History. **Adjust in Organize** opens
  `/projects/[src]/organize?with=[dst]` with the items staged.
- **Retire `move_onto_task`'s typed token** in the same phase. A move that needs confirmation becomes
  this card, so every cross-project move is journaled and undoable. Clean single moves can stay
  instant, or also go through the card (your pick in Q4).

```
┌──────────────────────────────────────────────────────┐
│ Move 6 items → The Cadre Content Operations          │
│ from The Cadre- DJ Internal                          │
│  📄 Content Marketing Plan (+2 sub-docs)              │
│  ☐ Draft webinar follow-up email   …                 │
│ ⚠ 3 more people will see these: David, Ian, Phillip  │
│ ⛔ 2 dated tasks can't move yet (calendar)            │
│ Impact: unlinks 1 task from a plan                   │
│ [ Move 4 items ]  [ Adjust in Organize ]  [ Cancel ] │
└──────────────────────────────────────────────────────┘
after: "Moved 4 items · Undo · History"
```

**How the turn treats them.** Both are proposal tools, not writes:

- They need no `declare_turn_contract` outcome, take no mutation reservation, and get **no paid
  reviewer pass**. The click endpoint is the authority and re-checks access with the user's session.
  For comparison, the reviewer bounced a correct shared-doc card once on 10-01, at extra cost.
- Register the two card kinds in `packages/agentic-chat-runtime/src/loop/tool-classification.ts`, so
  the turn **ends on the card** and doesn't trigger the "unfinished work" continuation. The
  shared-doc preview already has this special case.
- Show the activity line as "Needs your choice: …", never "Updated" (the toast bug fixed in
  `1ba3ef008`).
- Wire-up: add both tools to the global and project surfaces (`catalog/surfaces.ts`), metadata,
  taxonomy, and the worker read dispatch. Add their related reads to the Jev tool-selector map
  (`apps/worker/.../provider/jev-tool-selector.ts`). Jev, a model, decides when to mount them. No
  keyword gating anywhere.

## 4. Telling the model the truth (Phase 1, about 1 day, free)

Add a static block of 450 characters or less to Operating Strategy (both lanes, every turn, not
keyword-gated):

> Project structure: a project can sit under one parent project, one level deep (a sub-project
> can't have sub-projects, and a hub can't go under another project). Nesting moves nothing and
> gives no one new access. There is no whole-project merge. Documents and tasks move between
> projects through Organize (undoable), and a moved record becomes visible to the destination's
> members. You can't nest from chat yet: point to the project's ⋯ → Move under… (admin on both).

Phases 2 and 3 swap the last sentence for "propose it with propose_project_parent /
propose_project_moves; the user's click runs it."

Add the structured data from §3 Reads: index labels, `parent` on list/search, `family` on details,
and the `get_field_info` fix.

**Honest answers today**, before any write tool exists:

- _"Can I put Content Ops under Wayne?"_ → "Yes. Open Content Ops → ⋯ → Move under… → Wayne
  Strategies. Nothing moves and nobody gains access. Wayne already holds 7 sub-projects."
- _"Merge X into Y"_ → "There's no whole-project merge, and here is why you may not want one:
  [privacy line]. The closest thing: nest them, move the specific docs and tasks that belong in Y
  (I can move undated tasks; Organize does docs), then archive what's left."

**Tests (free):**

- `entity-field-info.test.ts`, `ontology-reads.test.ts`, `overview-reads.test.ts`.
- A `build-lite-prompt` test with a global fixture: the hub/child labels render and the static line
  is present.
- `prompt-size-budget.test.ts`. The system prompt cap is 12,000 chars; the last recorded measurement was 11,849 on 09-23 (about 151 to spare,
  second pass). Measure, then trim something or bump the cap with a dated comment.
- Offline replay of the 10-16 export through prompt assembly
  (`artifacts/investigations/cadre-chat-2026-10-16/`-style script). No model call.

## 5. Phased plan

| Phase                                              | Size      | Migration                                                                                                            | Free tests                                                                                                                                                                                           | Paid live check (needs DJ OK, not run)                                                                                                                                 |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Truth (text, fields, `get_field_info`)          | ~1 day    | None                                                                                                                 | Listed in §4                                                                                                                                                                                         | 2–3 global turns: "Can I put Content Ops under Wayne?", "Merge my two Cadre projects". Est. **$0.02–0.05**.                                                            |
| 2. Nest card                                       | ~2 days   | None                                                                                                                 | Card contract parse; worker blocked cases (not admin, two levels, self, hub-as-child); route (single-use, user+session filter, expiry, error mapping); card component; classification and completion | Throwaway projects A/B: "put B under A" → click → breadcrumb, then "take it out" → click. Est. **$0.03–0.05** (the 10-01 shared-doc card test was $0.035 for 3 turns). |
| 3. Move card + retire the task-move token          | ~3–4 days | None                                                                                                                 | Worker validation and visibility delta; headless plan builder against organize fixtures; Apply/Undo against the in-memory fake DB used by the consolidation tests                                    | Throwaway projects: move 2 docs + 1 undated task → Apply → Undo. Est. **~$0.05**.                                                                                      |
| 4. Consolidate from chat + subset scope (optional) | ~1–2 days | None. Subset scope is **new code**; the second pass found `startConsolidationRun` takes only `projectId` + `request` | Run start with a subset; card                                                                                                                                                                        | A survey is ≈ **$0.01–0.05** (DeepSeek V4 Flash), with a run cap of $0.25.                                                                                             |

Notes on the plan:

- **Acting model for paid checks.** `.env.agentic-prod-battery.local` does not pin
  `AGENTIC_CHAT_OPENROUTER_MODEL`, so the deployed worker's default decides. It was DeepSeek V4.1
  Flash at the last measurement. Confirm the current default before asking for OK.
- **Order.** The 10-16 continuation-size fix is live (`2efd12598`). Its 10-17 follow-up, where the
  server reads continuity itself, should also be deployed before any multi-turn live check.
- **Migrations,** only if you pick Q1-d (two levels), Q5-c (move plans/goals) or Q2-b/c (fold):
    - Run `pnpm db:rehearse supabase/migrations/<file>.sql` with a check script, plus `--role-probe`
      for grants or policies.
    - Resolve SECURITY and API findings.
    - Get your OK, then apply one file with `supabase db query --linked -f` followed by
      `supabase migration repair --status applied <version> --linked`.
    - Never edit an existing migration file.

## Risks and landmines

1. **The nest RPC needs a signed-in user.** The worker can't call it. The card click on the web is
   the route, and no service variant should be added.
2. **Dated tasks can't move at all** until `calendar_sync_ready` is turned on. DJ Internal has
   19 dated tasks (9 open; second pass). Turning it on also needs the worker handler
   `organizeTaskSync.ts` deployed first. Turning it on needs a check that touches your Google Calendar
   (free, but your OK).
3. **Plans, goals, milestones and risks never move** (the mover handles documents and tasks only).
   DJ Internal's 5 plans and 1 goal stay where they are unless they're recreated.
4. **Wayne's shared folder shows in every Wayne sub-project's shelf** (7 today, 9 with Cadre). Don't
   put Cadre-only docs there.
5. **Stale consolidation run `3579661e` on Wayne** (waiting since 10-04, 8 projects, no Cadre). It
   blocks any new Consolidate on Wayne.
6. **`move_onto_task` writes outside the Organize journal**, so chat task moves have no History or
   Undo today.
7. **Budgets are tight:**
    - The system prompt cap is 12,000 chars.
    - The worker tool-surface budget tripped CI on 10-04 at 8,230 of 8,220.
    - Two new schemas need a dated budget bump.
8. **One level only.** Wayne (7 children) can never be a child itself, and a Cadre hub with
   children can't go under Wayne.
9. **Local dev writes to the prod DB.** Run browser checks only on throwaway projects created with
   no description (that avoids the paid icon call), and soft-delete them afterwards with
   `soft_delete_onto_project`.
10. **The no-regex rule.** Mounting comes from surfaces and the Jev selector, meaning flows through
    tool arguments, and the capability text is static.

## Owner questions

**Q1 — Where should Cadre end up?** One-level nesting forces this choice.

- **(a) Recommended.** Nest _both_ Cadre projects directly under Wayne Strategies, as siblings of
  the other 7 clients. Optionally rename "The Cadre- DJ Internal" to "Cadre", making it your private
  Cadre home. Content Ops stays the team's project. This is consistent with how Wayne already holds
  its clients, and it's what the eval measured as the big search win.
- (b) Make DJ Internal a "Cadre" hub with Content Ops under it. The privacy split is clean, but
  Cadre then can't sit under Wayne.
- (c) Create a new "Cadre" under Wayne, move the curated records in, and archive both old projects.
  The team loses Content Ops unless you invite them to the new project, which would expose your
  internal notes to them.
- (d) Allow two levels (Wayne → Cadre → Content Ops): about 2–3 days plus a migration.

**Q2 — Whole-project fold?**

- **(a) Recommended.** Park it. No fold in chat or the UI; the migrations stay unapplied.
- (b) A UI-only Combine screen later, for true twins only. Chat can only link to it.
- (c) Build fold plus a chat proposal card.

If (b) or (c), the four open fold questions, with my recommendation first in each:

- Chats follow the fold (yes).
- Standalone and recurring events block the fold (yes) rather than getting a re-home job.
- Members a fold added are removed on unfold, after a preview (rather than kept, as today).
- Email rules and inbound keys follow the fold. Wayne's lead pipeline is a project-scoped key, so a
  fold must never leave it writing into an archived source.

**Q3 — How far should chat go with structure?**

- **(a) Recommended.** Chat proposes and your click executes, for both nest and moves.
- (b) Truth only; chat never writes structure.
- (c) Chat executes a nest after a typed "yes". This needs a service RPC variant and a migration,
  and breaks the rule that a click is the only consent.

**Q4 — Where should a move proposal end?**

- **(a) Recommended.** Inline in chat: impact, then Apply, with Undo and an "Adjust in Organize"
  link.
- (b) Chat only stages the moves and opens Organize preloaded; you apply them there.

    Related: should a clean single-task move stay instant (recommended), or also show a card?

**Q5 — Records Organize can't move today:**

- **(a) Recommended.** Approve the free calendar check, then turn the flag on so dated tasks move.
  Leave plans and goals where they are; nesting makes them findable from Wayne.
- (b) Keep dated tasks blocked; the card says "can't move yet."
- (c) Also extend the mover to plans, goals and milestones: about 3 days plus a migration.

**Q6 — The stale Wayne consolidation run `3579661e`:**

- **(a) Recommended.** Cancel it before any Cadre clean-up, using the existing owner-only
  `POST /api/consolidation/runs/[id]/cancel` (one click). Phase 4 then adds "consolidate just
  these two sub-projects", which is new code (the second pass found no subset input), unless
  Cadre becomes a hub.
- (b) Finish it as-is. It predates the current code and doesn't include Cadre.

## Cadre worked example (recommended path, Q1-a)

1. **Ask.** DJ asks in global chat: "Put my Cadre projects under Wayne and clean them up." With
   Phase 1 in place, the answer is: Wayne already holds 7 clients; both Cadre projects can join;
   nothing moves; the team keeps seeing only Content Ops; there's no whole-project merge, and here's
   the plan.
2. **Nest.** Two cards, two clicks. Both projects now sit under Wayne, which lists 9 sub-projects.
   Wayne's chat can read both, and Cadre questions asked from Wayne find them.
3. **Rename (optional).** "The Cadre- DJ Internal" becomes "Cadre" through the existing
   `update_onto_project`, which is reviewed as today.
4. **Curate.** Chat reads both projects (existing tools) and proposes:
    - **Archive:** the 2 completed migration-phase plans and done or stale tasks (existing archive
      tools).
    - **Move:** one card with the content-production docs that belong with the team, from DJ
      Internal to Content Ops, showing "⚠ 3 more people will see these." Apply, with Undo. Dated
      tasks wait for Q5.
    - **Leave in place:** DJ Internal's strategy, SEO and Stripe plans (plans don't move) and its
      private notes.
5. **Merge duplicates (optional).** After clearing run `3579661e`, Consolidate just the two Cadre
   sub-projects (Phase 4). It picks out duplicate docs, such as the course schedule and overview
   docs, and merges them by fact, asking question cards.
6. **The Foundation and Advanced Precision events** that exist in both projects: delete one copy by
   hand. Events don't move.

The result:

```
Wayne Strategies              (private · DJ)
├─ Shared with sub-projects/  (agency-wide docs only)
├─ Cadre                      (was "The Cadre- DJ Internal" · private · DJ)
│    strategy & flywheel, SEO outreach plan, Stripe class flow, instructor material
├─ The Cadre Content Operations  (DJ + David, Ian, Phillip)
│    content plan, course stubs, partners tracker, content tasks
└─ Redline … UXM … Beyond Exit …  (existing 7)
```

If you'd rather have one "Cadre" box that holds both projects, that's Q1-b, and Cadre then leaves
Wayne. Q1-d keeps both: Cadre stays under Wayne and still holds Content Ops.

## Done when

DJ has picked Q1–Q6. Phase 1 has shipped, and the free tests plus the approved live truth check
pass. Each later phase that DJ picks has shipped with its live check recorded here. Then move any
residual to its own tracker and delete this file.

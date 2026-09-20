<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-F-context.md -->

# Lane F — Context assembly and admission

Agentic chat harness audit, 2026-09-08/09. Working tree at `226e51c31` (HEAD moved from `6d70b36e1`
during the audit; no lane-F source file is modified in the working tree). Read-only. Production
numbers come from the 55 worker turns since the 2026-09-04 one-engine deploy (`evidence/lane-F-*.json`,
pulled 09-08/09-09 with select-only queries and the two STABLE context RPCs) and from a 21-day
`chat_tool_executions` window re-run through the built runtime's `buildToolPayloadForModel`.

The question for this lane: what the web loads for a turn, what of it reaches the model, what it caches,
what all of that costs, and whether a cheap model could answer most read questions from the opening
context alone.

---

## 0. Summary

| Measure                                                                        | Value                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Loaded-data share of the billed opening prompt                                 | project 6.9k chars (~1.7k of 14.8k tokens, 12%); global 7.9k chars (~2k of 13.4k, 15%) — tool schemas are 58–64% (lane H)           |
| Global RPC payload → rendered                                                  | **222,026 chars loaded, ~7,500 rendered (3.4%)**; `project_logs` alone 145,091 chars, 0 rendered                                    |
| Project RPC payload → rendered                                                 | 8.6k–15.7k loaded, ~3.9k rendered in the index/timeline + 1.6k START HERE + 0.7k map                                                |
| Project tasks: loaded / rendered with state / with description                 | 18 / ≤6 / 0                                                                                                                         |
| DJ's projects with more open tasks than the 6-ref index cap                    | 15 of 41 (p90 33 open, max 84); 83% of open tasks are undated                                                                       |
| START HERE docs longer than the 2,400-char prompt excerpt                      | **26 of 52 (50%)**, p50 2,610, p90 9,646, max 23,756; loader keeps 12,000                                                           |
| Prepared-prompt adoption (`history_source = prepared_prompt`)                  | **5 of 55 (9%)**                                                                                                                    |
| Prepared-admission lease: hit at inspection → rejected at atomic claim         | 28 hit → **14 `admission_race_retry` (25% of all turns ran both paths)**                                                            |
| Prepared rows created (surviving) vs consumed                                  | 17 vs 5; 9 of the 17 are `project_create` rows caching a 220-char payload                                                           |
| Materialized context snapshots on disk right now                               | 0 (`agentic_chat_context_snapshots`); `cache_source` null on 55/55 turns                                                            |
| Cache machinery                                                                | 3,070 LOC web + 2,180 LOC tests + 1,410 LOC SQL (6 migrations) + row triggers on 12 ontology tables                                 |
| DB round trips on the common admission path (miss)                             | ≈20 sequential (code count, §6.3); a hit needs ≈3                                                                                   |
| `get_workspace_overview` results replaced by a cut JSON-string preview         | **13 of 17 (76%)** in 21 days; `explore_project` 9/10; `search_all_projects` 11/30; `get_document_tree` 16/51                       |
| Tool results whose timestamps are UTC (`+00:00`) although the frame says local | all write receipts (`create_onto_task` 57/57, `create_onto_goal` 20/20); reads mix `-04:00` and `+00:00` in one payload             |
| Intelligence day buckets                                                       | computed on UTC days (`timezone: 'UTC'` in every payload); prompt frame date is local                                               |
| History window                                                                 | last 10 `chat_messages`; ≥8 → last 4 at 1,200 chars + summary line; compressed on 12/55 turns; 45% of history chars are system rows |
| Session summary                                                                | written only by the close-modal classifier; present on 8/19 sessions, never during a live session                                   |
| Prior-turn tool results in history                                             | none (assistant rows carry no tool calls); interrupted turns get 6 receipts, control tools included                                 |
| Dead code inside lane-F files                                                  | ≈1,750 lines (§11 F12)                                                                                                              |

The loaded data is not the token problem — it is small. The problem is that it is the **wrong shape**
for a weak model: counts and metadata where ids and states should be, 8 of 46 projects, 6 of 18 tasks,
half a START HERE, dates in the wrong zone, and a prompt that then sends the model to an overview tool
whose answer is destroyed three times out of four. Around that sits a three-layer cache that measured
9% adoption, costs a quarter of turns a double preparation, and exists to save about one second of a
45-second turn.

---

## 1. How context reaches the model today

One request (`POST /api/agent/v2/turns`) runs `prepareAgenticChatWorkerAdmission`
(`apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts:288-916`), which builds
a frozen input artifact and hands it to the atomic admission RPC `create_agentic_chat_turn_with_job`;
the Railway worker reads the artifact and never touches the loaders. Inside preparation:

1. **Prepared-admission lease** (`:317`) — RPC `inspect_agentic_chat_prepared_admission` validates the
   browser's prewarm key (`prepared-admission-lease.server.ts:84-152`). On a hit the session, history,
   context payload and system prompt come from `agentic_chat_prepared_prompts` (`:528-555`).
2. On a miss: project access check (`:333`), session lookup (`:383`), dead checkpoint recovery (`:393`,
   lane D §5.1), email-mount check (`:418`), a second prepared read for hash lineage (`:458`), a third
   prepared inspection with an invalidation-token RPC and a `chat_messages` query (`:495`;
   `prepared-prompt-consumer.server.ts:140-267`), history (`:562`; four queries,
   `:1109-1190`), then context (`:590` → `resolveTrustedPromptContext` `:1376-1407` →
   `resolveMaterializedFastChatContext`, `materialized-context-cache.server.ts:47-152`: token RPC,
   snapshot read, fresh load, token re-check, snapshot upsert).
3. **Fresh load** = `loadFastChatPromptContext` (`context-loader.ts:3288-3499`): one `load_fastchat_context`
   RPC (`:2307-2369`), then two sequential START HERE queries (`:2371-2426`), with a `users.timezone`
   lookup in parallel (`:3263-3286`).
4. **Render** = `buildLitePromptEnvelope` (`agentic-chat-lite/prompt/build-lite-prompt.ts:191-311`),
   eleven sections; the data sections are `project_start_here` (`:611-660`), `focus_purpose`
   (`:491-609`), `location_loaded_context` (`:753-868`, the clock frame + status/overdue/upcoming/recent
   lines + a JSON "index") and `project_knowledge_map` (`:918-980`).
5. The overlay (rules, skill preload) is applied to either the fresh envelope or the prepared surface
   (`worker-turn-preparation.server.ts:640-700`), pending-contract and proposal-focus system messages are
   pushed onto history (`:705-728`), and the artifact (p50 118 KB, p90 155 KB) is written by the RPC.

Three caches sit in front of step 3, all keyed on `v2|contextType|projectId|focusType|focusEntityId`
(`context-cache.ts:48-63`) and all evicted by the row triggers on 12 `onto_*` tables
(`supabase/migrations/20260830173250_agentic_chat_materialized_context_cache.sql:260-288`):

| Layer                 | Store                                                        | TTL    | Written by                                                                                                       | Read on the turn path                             |
| --------------------- | ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Session cache         | `chat_sessions.agent_metadata.fastchat_context_cache`        | 2 min  | prewarm (`prewarm/+server.ts:217`)                                                                               | `turn-preparation.ts:167` → materialized resolver |
| Materialized snapshot | `agentic_chat_context_snapshots`                             | 15 min | every fresh load (`:138`)                                                                                        | `materialized-context-cache.server.ts:85-113`     |
| Prepared prompt       | `agentic_chat_prepared_prompts` (payload + prompt + history) | 90 s   | prewarm, re-POSTed by the browser at TTL expiry while the modal is open (`agent-chat-prewarm.svelte.ts:335-379`) | lease RPC + two inspections above                 |

---

## 2. Measurements

| Name                                                                 | Value                                                                                                                                                        | How measured                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Turns in window / by context                                         | 55; project 37, global 15, project_create 3                                                                                                                  | `chat_turn_runs` since 2026-09-04T17:14Z (`lane-F-evidence.json`)                               |
| System prompt chars p50 / p90                                        | global 14,484 / 19,235; project 13,718 / 18,108                                                                                                              | `chat_prompt_snapshots`                                                                         |
| `location_loaded_context` chars p50 / max                            | global 7,496 / 7,679; project 3,768 / 4,735                                                                                                                  | `chat_turn_input_artifacts.prepared.promptSections` (`lane-F-sections.json`)                    |
| `project_start_here` / `project_knowledge_map` / `focus_purpose` p50 | 1,600 / 732 / 637 (project)                                                                                                                                  | same                                                                                            |
| Context payload chars p50 / p90                                      | project 12,166 / 14,821; global 33,393 / 34,302; project_create 220                                                                                          | `prepared.contextPayload` JSON length                                                           |
| Global RPC payload / latency                                         | 222,026 chars; 288–488 ms (3 runs)                                                                                                                           | `load_fastchat_context('global')` for DJ's user (`lane-F-evidence2.json`)                       |
| Global RPC breakdown                                                 | project_logs 145,091 (210 rows); projects 23,936 (44); goals 20,857 (55); plans 13,336 (41); intelligence 15,165                                             | same                                                                                            |
| Project RPC payload / latency                                        | 8,574 chars; 98–144 ms                                                                                                                                       | one surviving project from the window (two QA projects had been deleted → `null`)               |
| Invalidation-token RPC latency                                       | 105 ms                                                                                                                                                       | `get_agentic_chat_context_invalidation_token`                                                   |
| Prepared lease inspection ms p50 / p90                               | 126 / 190                                                                                                                                                    | `request_payload.preparedAdmissionLease.inspectionMs`                                           |
| Lease outcome                                                        | requested 55/55; hit 28; miss: race_retry 14, not_found 5, ineligible 3, stale_history 3, stale_context 2                                                    | same                                                                                            |
| Adopted prepared prompt                                              | 5/55 (`history_source = prepared_prompt`)                                                                                                                    | `chat_turn_input_artifacts.history_source`                                                      |
| `prepared_prompt_hit` column                                         | true 5, false 50; `prepared_prompt_miss_reason` null on all 50; `cache_source` null on 55                                                                    | `chat_turn_runs`                                                                                |
| Prepared rows since deploy                                           | 17 (project 8, project_create 9, global 0); consumed 5                                                                                                       | `agentic_chat_prepared_prompts` (rows evicted by triggers are not counted — this is a floor)    |
| START HERE size across DJ's 52 docs                                  | p50 2,610; p90 9,646; max 23,756; >2,400: 26; >12,000: 3                                                                                                     | `onto_documents.type_key = document.context.project`                                            |
| Open tasks per project (41 projects)                                 | p50 4; p90 33; max 84; >6: 15; >18: 8; undated 83%                                                                                                           | `onto_tasks`                                                                                    |
| History rows p50 / p90 (bytes)                                       | 3,224 / 5,727                                                                                                                                                | `chat_turn_input_artifacts.history_bytes`                                                       |
| System rows in history                                               | continuity_hint 22, loaded_skills_ledger 32, compressed_memory 12, pending_clarification 8, interrupted receipts 4, pending_contract 4; 45% of history chars | `artifact.history` roles                                                                        |
| Sessions with a summary                                              | 8/19 (all written by the close-modal classifier)                                                                                                             | `chat_sessions.summary`                                                                         |
| Tool results guarded (21 days)                                       | see §8 table                                                                                                                                                 | `chat_tool_executions.result` → `dist/loop` `buildToolPayloadForModel` (`lane-F-guard-21d.txt`) |
| Timestamp offsets inside raw tool results (since 09-04)              | see §9                                                                                                                                                       | regex over `result` JSON (`lane-F-toolsizes-post0904.json`)                                     |

---

## 3. Project context: every query, what renders, at what truncation

Source of truth is the RPC (`packages/shared-types/src/functions/load_fastchat_context.sql`, project
branch `:291-800`); the TypeScript fallback loaders are unreachable for project contexts (§11 F12). The
timezone lookup and two START HERE queries are the only other reads.

| #   | Query (table, filter, limit)                                                                             | Loader shape kept                                                               | Rendered where                                                                                                                                                                 | Truncation on the way to the model                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onto_projects` by id, incl. `doc_structure` (`sql:299-306`)                                             | name, state, description ≤320, next_step ≤220 (`context-loader.ts:640-664`)     | `focus_purpose` (`build-lite-prompt.ts:557-568`): name+id, state, summary ≤280, primary goal, active plan, next step                                                           | fine                                                                                                                                                                                                                   |
| 2   | `onto_goals` by project, priority-ranked, `LIMIT 12` (`sql:308-357`)                                     | 12 × {id, name, description ≤220, state, target_date}                           | primary goal title only (`:561`); up to 6 refs in the JSON index (`:1939-1965`)                                                                                                | descriptions never rendered; index ref = `{id,title,state_key,date}` with `date` = target_date ?? updated_at (`:2006-2011`)                                                                                            |
| 3   | `onto_milestones`, `LIMIT 12` (`sql:359-406`)                                                            | 12                                                                              | dated ones in overdue/upcoming lines (≤3 overdue, ≤5 due soon, ≤6 upcoming, `:58-62`); rest ≤6 index refs                                                                      | descriptions dropped                                                                                                                                                                                                   |
| 4   | `onto_plans`, `LIMIT 12` (`sql:408-440`)                                                                 | 12                                                                              | "Active plan" title (`:562`); ≤6 index refs                                                                                                                                    | descriptions dropped                                                                                                                                                                                                   |
| 5   | `onto_tasks` by project, priority-ranked, `LIMIT 18` (`sql:442-504`), TS re-limit 18 (`:1092`)           | 18 × {id, title, description ≤280, state, priority, start, due}                 | dated tasks in overdue/upcoming (limits above); tasks changed in 7 days as "recent change" lines (≤6); **≤6** index refs minus anything already listed (`:1783-1817`, `:1955`) | **description never rendered; state only in the index ref; `Top open tasks` / `Loaded work` digest lines are computed (`:1485-1575`) but shadowed whenever intelligence exists (`:1638-1660`) — always in production** |
| 6   | `onto_documents` by project, unlinked-first, `LIMIT 20` (`sql:506-556`)                                  | 20 × {id, title, state, in_doc_structure}                                       | linked docs via the Knowledge Map (from `doc_structure`, `:918-980`); unlinked docs as ≤6 index refs                                                                           | map: ≤60 nodes / 2,200 chars, description ≤100                                                                                                                                                                         |
| 7   | `onto_events` −7…+14 days, `LIMIT 16` (`sql:558-596`)                                                    | 16                                                                              | ≤6 index refs; shadow "Due:" events suppressed when their task is present (`:2399-2445`)                                                                                       | none rendered as a calendar                                                                                                                                                                                            |
| 8   | `onto_project_members` + actor (`sql:598-624`)                                                           | all                                                                             | one "Members: N (name — role)" line, ≤8 names (`:662-682`)                                                                                                                     | emails loaded, never rendered (right)                                                                                                                                                                                  |
| 9   | `onto_project_logs`, `LIMIT 100` in TS fallback; RPC intelligence uses its own window                    | —                                                                               | only via `project_intelligence.recent_changes` (≤6 lines, `:2568-2577`)                                                                                                        | de-duped on (kind,id,action) so create+update of one task render twice                                                                                                                                                 |
| 10  | `build_fastchat_project_intelligence('project')` (`sql:798`)                                             | 16 overdue/due-soon, 16 upcoming, 16 recent, 1 summary; **`timezone: 'UTC'`**   | status line, ≤8 attention, ≤6 upcoming, ≤6 recent, "Backlog note"                                                                                                              | days in UTC (§9)                                                                                                                                                                                                       |
| 11  | focus entity (`sql:626-660`) + linked edges/entities (`:662-690`)                                        | full row; documents get a 16,000-char body (`focused-document-context.ts:3-11`) | `focus_purpose` detail + body fence (`:684-751`)                                                                                                                               | the one generous budget                                                                                                                                                                                                |
| 12  | START HERE candidates (`context-loader.ts:2377-2384`) then body (`:2403-2409`), sequential after the RPC | body ≤12,000 (`:743-758`; `start-here.ts:6`)                                    | `project_start_here` fence                                                                                                                                                     | **excerpt ≤2,400 chars cut from the end, headings list appended (`start-here.ts:711-748`)** — half of DJ's docs are cut                                                                                                |
| 13  | `users.timezone` (`:3270-3273`)                                                                          | IANA zone                                                                       | clock lines (`:788-800`)                                                                                                                                                       | —                                                                                                                                                                                                                      |

What the model gets for a p50 project, in order: START HERE (1,600), focus (637), the clock frame
(≈900), status/overdue/upcoming/recent lines (≈1,200), the JSON index (1,456 chars in the sample, of
which ≈750 is `context_meta` / `loaded_counts` / `project_intelligence.counts` / `retrieval_note`
metadata with no ids), the Knowledge Map (732). The `context_meta.entity_scopes` block the loader builds
(`:1157-1240`, 1,306 chars in the sample, carrying `is_complete` / `total_matching` per kind — exactly
the "do I have everything?" answer a weak model needs) is stripped by `summarizeContextMeta`
(`:1819-1835`).

Real sample (turn `a2dcf99c`, project with 6 tasks, all created that day): the index's `entity_refs`
held only `goals`; the six tasks appeared only as "created" lines under Recent project changes with no
state, priority or description (`scratchpad/sample-project-system-prompt.md`). Seven days later they
would fall out of the recent window and re-enter as ≤6 index refs with `state_key` and an unlabeled
`date`.

## 4. Global context

RPC global branch (`load_fastchat_context.sql:47-288`): **all** accessible project summaries (44 rows),
goals/milestones/plans ranked ≤4 **per project across all projects** (55/10/41 rows), `project_logs` ≤6
per project **with `before_data`/`after_data` JSONB** (210 rows, 145 KB), plus the intelligence snapshot.
Then `buildGlobalContextFromRpc` (`context-loader.ts:2136-2249`) keeps the 8 most recently updated
projects (`:2144`, `GLOBAL_CONTEXT_PROJECT_LIMIT = 8`), 2 goals / 2 milestones / 2 plans / 3 activity rows
each, and `attachGlobalTaskRollups` runs one more `onto_tasks` query capped at 1,500 rows (`:2047-2093`).

| Loaded                                                 | Rendered                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 44 projects (name, description ≤320, next step, dates) | 8 one-line bundles: name, id, state, task rollup, signals, next step ≤160, top goal ≤100 (`build-lite-prompt.ts:2196-2260`) + up to 2 intelligence-only summaries (`PROMPT_PROJECT_STATUS_LINE_LIMIT = 10`, `:2275-2292`) + "More projects exist … use get_workspace_overview" (`:2345`) |
| 55 goals with descriptions                             | 8 titles                                                                                                                                                                                                                                                                                 |
| 41 plans, 10 milestones                                | nothing                                                                                                                                                                                                                                                                                  |
| 210 project logs, 145 KB                               | nothing (`bundle.recent_activity` is read only when no intelligence exists, `:1651-1655`)                                                                                                                                                                                                |
| intelligence: 16 overdue/due-soon                      | 3 overdue (≤45 days old) + 5 due soon (`:2478-2495`) + "Backlog note: 83 additional … Use get_workspace_overview" (`:2447-2476`)                                                                                                                                                         |
| 16 upcoming, 16 recent                                 | 6 + 6                                                                                                                                                                                                                                                                                    |
| context meta                                           | a 783-char JSON index with **zero entity ids** (`scratchpad/sample-global-system-prompt.md`)                                                                                                                                                                                             |

So a 46-project workspace renders 8 projects and steers "the rest" to `get_workspace_overview`, whose
schema caps `project_limit` at 20 (`catalog/definitions/utility.ts:78-92`) and whose result the payload
guard replaces with a cut JSON string 76% of the time (§8). `search_onto_projects` needs a query
(`ontology-read.ts:439-470`). There is no single-round way to answer "what projects do I have?" (lane B
§5.5 saw the tool side of this; the context side is the cheaper fix — §10).

## 5. project_create

Payload is 220 chars (`context_meta` only); `location_loaded_context` is 86 chars; the section that
matters is `focus_purpose` at 1,963 chars of workflow (lane A13). Nothing to load, and nothing worth
prewarming — yet 9 of the 17 surviving prepared rows are `project_create` rows (§6).

---

## 6. The prepared-prompt cache and its two siblings

### 6.1 What it caches and what a hit skips

A prewarm (`routes/api/agent/v2/prewarm/+server.ts:396-564`) does the full slow path — session resolve,
history load and composition, context load (through the same three-layer resolver), envelope build —
then writes `agentic_chat_prepared_prompts` with the payload, the rendered system prompt per surface,
section hashes, the frozen history, a nonce, a context-invalidation token and a 90-second expiry
(`prepared-prompt-cache.ts:20`, `:322-355`). The browser re-POSTs at expiry for as long as the modal is
open and visible (`agent-chat-prewarm.svelte.ts:335-379`), and once more with `ensure_session: true` on
the first send (`AgentChatModal.svelte:900-945`).

On the turn, a hit skips the access check, session lookup, checkpoint recovery, history (4 queries) and
context (up to 8 round trips). It still pays the lease RPC (126 ms p50), a full `buildLitePromptEnvelope`
rebuild to recompute the harness hash (`prepared-prompt-cache.ts:243-265`, `:372-397`), and a
byte-for-byte JSONB comparison of the ≈100 KB artifact against the stored row inside the admission RPC
(`20260905012719_agentic_chat_prepared_overlay_copy_contract.sql:20-88`).

### 6.2 Hit-rate evidence

- Adopted: 5 of 55 turns (`history_source = prepared_prompt`).
- The lease said "hit" on 28, but the atomic claim rejected 14 of those and the request was re-prepared
  from scratch **without** the key (`turns/+server.ts:154-199`, `admission_race_retry`). Those 14 turns
  (25%) paid: lease RPC + fast-path preparation + failed admission RPC + full slow-path preparation +
  admission RPC. Which of the five retryable codes fired
  (`worker-turn-admission.server.ts:92-98`) is logged only to Vercel; nothing durable records it.
- Miss reasons on the other 13: `not_found` 5 (row evicted by a trigger or expired), `ineligible` 3
  (`project_create` / attachments), `stale_history` 3, `stale_context` 2.
- `agentic_chat_context_snapshots` held 0 rows at pull time; `cache_source` is null on every turn
  because `resolveTrustedPromptContext` returns only `resolution.cache.context`
  (`worker-turn-preparation.server.ts:1376-1407`) — the materialized layer's hit rate is unobservable.
- Global prepared rows: 0 survive. `invalidate_agentic_chat_global_context` deletes every unconsumed
  global row for the user on any write to any of their projects
  (`20260830173250…sql:74-98`), and the agent itself writes on most turns.

### 6.3 What it costs

| Cost                        | Amount                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code                        | 3,070 LOC (`prepared-prompt-cache`, `-consumer.server`, `-history`, `-store.server`, `prepared-admission-lease.server`, `prewarm/+server`, `agent-chat-prewarm.svelte`, `materialized-context-cache.server`, `context-cache`, `context-cache-routing`) + 2,180 LOC tests + 1,410 LOC SQL across 6 migrations |
| Schema                      | 2 tables, 12 per-row triggers (`20260830173250…sql:260-288`) that upsert a version row and run two deletes on every ontology insert/update/delete in the whole app                                                                                                                                           |
| Per turn (miss path)        | ≈20 sequential round trips (§1 step 2: lease 1, access 1, session 1, checkpoint 2, email 1, lineage 1, inspection 1–3, history 4, context 8, admission 1) ≈ 1–2 s at 50–100 ms each                                                                                                                          |
| Per turn (race path, 14/55) | the above plus the hit-path cost                                                                                                                                                                                                                                                                             |
| Background                  | a full slow-path preparation and a ≈100 KB row write every 90 s per open modal                                                                                                                                                                                                                               |
| Prompt divergence           | hit and cold prompts order sections differently (lane A15), so consecutive turns never share a provider-cacheable prefix beyond the static sections                                                                                                                                                          |

Best case, a hit saves ≈17 round trips ≈ 1–1.7 s. Expected value across the window: 5/55 × (−1.5 s) +
14/55 × (+0.3 s) ≈ −0.06 s per turn, against a 45 s p50 turn (lane H §2). The savings are in the noise;
the failure surface (18 miss reasons, a copy-contract guard that patches its own RPC body at migration
time, section-order drift) is not.

### 6.4 Would a cheaper design be equivalent?

Yes, and faster on the common path. Provider prompt caching is unaffected by any of this — it keys on
the byte-identical prefix of the request, which the harness already orders static-first
(`build-lite-prompt.ts:87-100`); a server-side copy of the rendered prompt cannot improve it and today
worsens it (A15). With no cache at all, freshness is trivially guaranteed (the 09-02 §6 "context
freshness" item exists only to protect the cache), and the load is one RPC (100–500 ms measured) plus
START HERE. Folding START HERE and the history window into that RPC (`load_fastchat_context` already
runs as SECURITY DEFINER with the actor check) makes admission ≈4 round trips instead of ≈20 — better
than today's _hit_ path. For a four-user product the 145 KB global over-fetch (§4) is the only latency
item worth keeping an eye on, and it disappears when the global RPC returns what renders.

---

## 7. History

| Aspect                             | Today                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window                             | last 10 `chat_messages` (user/assistant/system), `HISTORY_LIMIT` (`worker-turn-preparation.server.ts:126`); attachments joined; two `chat_tool_executions` queries (`:1155-1166`)                                                                                                                                |
| Compression                        | ≥8 rows → last 4 rows at 1,200 chars + a "Conversation memory (compressed)" system line (`history-composer.ts:21-24`, `:85-119`); fired on 12/55 turns                                                                                                                                                           |
| Summary                            | `chat_sessions.summary` is written only by `classify_chat_session`, queued when the modal closes (`AgentChatModal.svelte:1903` → `api/chat/sessions/[id]/close`) — 8/19 sessions have one, none mid-session. The 09-02 "always empty" is now "empty while the conversation is live"                              |
| Prior-turn tool results            | not available: assistant rows carry no tool calls (`freezeHistory` maps an empty `tool_calls`, `:1409-1418`); only _interrupted_ assistant messages get receipts (`:1155`, `session-service.ts:460-496`)                                                                                                         |
| Interrupted receipts               | first 6 results by sequence, 700-char JSON previews, **control tools included** (`session-service.ts:443-458`, `:475`); in the sample 3 of 6 slots were `declare_turn_contract` / `request_proposal_revision` / `approve_turn_contract_review` and the six created tasks were not mentioned                      |
| Continuity hint                    | client-supplied `lastTurnContext` (`:510`), rendered as a 6-line wrapper around ≤4 content lines (`packages/agentic-chat-runtime/src/last-turn-context.ts:471-517`); on 22/55 turns; duplicates the previous assistant text and adds ids; `context_shift` leaks into "Tools used" (hidden set `:62-70` omits it) |
| Skill ledger                       | "Previously loaded skills in this session" system row on 32/55 turns (lane G); ≈600 chars                                                                                                                                                                                                                        |
| Share of history that is machinery | 45% of history characters are system rows                                                                                                                                                                                                                                                                        |

For a weak model the practical effect: a follow-up that depends on something read two turns ago
("add the second point from that note") has no evidence in context (lane A14), while a follow-up on an
interrupted write has the harness's own control chatter in place of the write receipts.

---

## 8. Tool-payload compaction (`packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts`)

Every result goes through `buildToolPayloadForModel` (`:168-216`): strip `search_vector`, a per-tool
compactor or none (`:767-801`), hint stripping, then `addToolResultSecurityNotice` (`:238-259`) which
prepends the 246-char notice + `tool_name` (lane A10) and applies `applyToolPayloadSizeGuard`
(`:1732-1749`): if the serialized JSON exceeds 6,000 chars (`:8`; 20,000 for skills, 12,000 for web) the
**whole payload is replaced by `{truncated, original_length, preview: JSON.slice(0, 6000) + '...'}`** —
an escaped, mid-structure cut of JSON that then costs _more_ than 6k once re-serialized.

| Compactor                                   | Keeps                                                                                 | Weak model loses                                                | Forces another round?                                       | Guarded in 21 d (`lane-F-guard-21d.txt`)                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_*` (`:902-951`)                     | 12 results × {type, id, project, title, state, score, path, snippet ≤700, why ≤220}   | `due_at`, `priority`, `updated_at`, description                 | yes for any date/priority question: one detail read per hit | `search_all_projects` 11/30 — 12 × ~1,050 chars exceeds the guard by design                                                                                                                                                                                       |
| `get_onto_document_details` (`:953-994`)    | metadata + `content_preview` ≤3,500 + `content_truncated`                             | the rest of the body (raw p90 11 k)                             | yes: outline + section reads                                | 0/3                                                                                                                                                                                                                                                               |
| `get_onto_project_details` (`:996-1066`)    | 8 goals, 8 plans, 12 tasks, 12 docs, 8 milestones, 8 risks with 360-char descriptions | nothing structurally — but 12 tasks × ~550 chars alone is 6.6 k | when guarded, everything                                    | 2/35 (model p90 6,488)                                                                                                                                                                                                                                            |
| `get_document_tree` (`:1572-1645`)          | tree nodes                                                                            | —                                                               | when guarded, the tree                                      | **16/51 (31%)**                                                                                                                                                                                                                                                   |
| `list/search_onto_documents` (`:1645-1692`) | summaries                                                                             | bodies (right)                                                  | —                                                           | 0                                                                                                                                                                                                                                                                 |
| email search (`:803-885`)                   | 5 messages, 260-char snippets                                                         | bodies, the 6th+ message                                        | one `get_email_message` per message needed                  | —                                                                                                                                                                                                                                                                 |
| web visit/search (`:1195-1412`)             | budget-fitted via `fitPayloadToBudget` (`:1161-1193`) — the right pattern             | —                                                               | no                                                          | 0                                                                                                                                                                                                                                                                 |
| **no compactor** (`:800`)                   | raw                                                                                   | —                                                               | —                                                           | `get_workspace_overview` **13/17 (76%)**, `explore_project` **9/10**, `get_project_overview` 10/71, `list_onto_tasks` 3/42 (raw max 55,692), `read_document_section` 6/326, `get_document_outline` 4/269, `create_onto_document` 1/98, `update_onto_document` 1/4 |

`get_workspace_overview` (`tools/overview-helper.ts:571-710`) returns, per project, the **untruncated
description**, ten `counts`, six `entity_counts`, next milestone, next event and three activity rows —
≈1.5 KB × 8 projects, so the default call is over the guard before it starts, and `project_limit: 20`
(the prompt's own escape hatch for "more projects") is always destroyed. The same tool is a near-superset
of what the global prompt already renders. `create_onto_document` / `update_onto_document` echo the
document body the model just wrote and are guarded when it is long — pure token cost on the model's own
output.

Since 09-04 the counts are small (246 executions; 4 guarded: tree 2, create-doc 1, update-doc 1) only
because the battery drove reads through `read_document_section`; `get_workspace_overview` had zero calls
in the window (lane H) while the global prompt names it five times.

---

## 9. Timezone and date rendering

| Surface                            | Rendering                                                                                                                                                                          | Zone    | Evidence                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt clock frame                 | local date + weekday + HH:mm + UTC instant; "Timestamps in tool results are rendered in your timezone"                                                                             | user tz | `build-lite-prompt.ts:788-800`                                                                                                                                                       |
| Overdue / upcoming / recent lines  | `YYYY-MM-DD` via `formatDate` = `toISOString().slice(0,10)`; relative day from `days_delta`                                                                                        | **UTC** | `:2543-2577`, `:2934-2936`; `build_fastchat_project_intelligence.sql:314,343` (`date_trunc('day', …)` on `now()`), payload `timezone: 'UTC'` (`:33,382`; measured in every snapshot) |
| Index `entity_refs.date`           | raw ISO `+00:00`; field = due ?? target ?? start ?? updated ?? created, unlabeled                                                                                                  | UTC     | `:2006-2011`                                                                                                                                                                         |
| START HERE header, `events_window` | raw `+00:00` / `"timezone":"UTC"`                                                                                                                                                  | UTC     | `:630`; `context-loader.ts:560-574`                                                                                                                                                  |
| Tool results — reads               | mixed in one payload: `get_onto_task_details` 32 × `-04:00` and 15 × `+00:00`; `get_project_overview` 76 × `-04:00`, 4 × `-05:00`, 34 × `+00:00`, 2 × `Z`; `list_onto_tasks` 25/15 | mixed   | `lane-F-toolsizes-post0904.json` `tz_offsets_in_results`                                                                                                                             |
| Tool results — write receipts      | `create_onto_task` 57/57 `+00:00`, `create_onto_goal` 20/20, `update_onto_task` 8/8, `create_onto_document` 16/16                                                                  | UTC     | same                                                                                                                                                                                 |
| Calendar / web                     | `Z`                                                                                                                                                                                | UTC     | same                                                                                                                                                                                 |

Concrete failure: at 21:00 ET on 09-05, a task due 23:59 ET that day is `2026-09-06T03:59Z`;
`date_trunc` puts both it and `now()` on 09-06 → `days_delta 0` → the line reads
"2026-09-06: task … due soon, today" under a frame that says "Current date: 2026-09-05". The sample
global prompt already shows the seam: "2026-09-08: … Monday meeting with Logan … in 4 days" for a task
whose `due_at` is `2026-09-08T03:59:00+00:00`, i.e. Sunday 23:59 local. The 09-02 P2 "frame uses local
date while intelligence buckets use UTC days" is unchanged.

---

## 10. Proposal: what to stop loading, what to render, and the opening context for a cheap model

**Stop loading**

- Global RPC: `project_logs` (145 KB → 0 rendered), `plans`, `milestones`, goal descriptions; return
  every project as `{id, name, state, next_step_short≤120, open, overdue, due_soon, updated_at}` (one
  rollup query already exists, `context-loader.ts:2047-2075`) — ≈90 chars × 46 = 4 KB.
- Project: `context_meta.entity_scopes` (never rendered), the `LightProjectMember` email field, the
  `project_logs` fallback query; the START HERE candidate/body pair as two extra round trips (fold into
  the RPC).
- All three caches and the 12 triggers (F1). The dead fallback loaders (F12).

**Render what is loaded but hidden**

- Every open task (cap 40; p90 is 33) as one line: `id | title | state | priority | due (local) | 80
chars of description`. Goals/milestones/plans likewise (cap 12 each). Replace the JSON index and its
  ≈750 chars of metadata with one line: "Loaded: 33 of 33 open tasks, 5 goals, 2 milestones, 4 docs —
  complete".
- Every project in global as one line (above). Overdue: the 10 most recent (not 3), all due-soon.
- START HERE: the managed status block + every heading + the body up to 8,000 chars (p90 9.6 k), cut at
  a heading boundary with the omitted headings named — never from the end of the document.
- All dates in loaded context as local `YYYY-MM-DD`, buckets computed in the user's zone (pass the zone
  into the intelligence function or compute buckets in TS from the same 16 rows); write receipts and
  read results normalized to local ISO-with-offset in the execution adapter.

**Size** (DJ's real data): global ≈ 4 KB project index + 1.5 KB attention + 0.7 KB recent + 0.4 KB clock
≈ 6.6 KB (today 7.5 KB, listing 8 projects). Project p50 ≈ 2.6 KB START HERE + 0.6 KB tasks + 0.6 KB
goals + 0.7 KB map + 0.5 KB frame ≈ 5 KB (today 6.9 KB); project p90 ≈ 6 KB START HERE + 5 KB tasks +
1.5 KB goals/milestones + 2 KB map ≈ 15 KB (~3.7k tokens, +2k over today). Each avoided read round is
≈15k replayed prompt tokens and 5–20 s (lane H, K), so the p90 case pays for itself on the first
question it answers from context. With this shape, "what's open here / what's overdue / which projects
do I have / what did we decide" are zero-round answers; the overview tools become the escape hatch for
the 41st+ task rather than the first move.

---

## 11. Findings

### F1 — Three-layer context cache: 9% adoption, a quarter of turns pay both paths, ≈6,700 lines to save ≈1 s of a 45 s turn (P1, overengineering, delete — decision)

**Claim.** The prepared-prompt / materialized-snapshot / session-cache stack (§6) is net-zero on latency
and net-negative on complexity and prompt stability.
**Evidence.** `history_source = prepared_prompt` 5/55; lease hit 28 → `admission_race_retry` 14
(`request_payload.preparedAdmissionLease`; `turns/+server.ts:154-199`); `cache_source` null 55/55
(`worker-turn-preparation.server.ts:1376-1407` drops it); snapshots table empty; global prepared rows 0
because `invalidate_agentic_chat_global_context` (`20260830173250…sql:74-98`) fires on the agent's own
writes; hit path still rebuilds the envelope (`prepared-prompt-cache.ts:243-265`) and JSONB-compares
the artifact (`20260905012719…sql:20-88`); LOC counts §6.3.
**Cheap-model impact.** Indirect: hit and cold turns render sections in different orders (A15), so the
model never sees a stable prompt across a session; skill preloads used to be cache-dependent (fixed
09-02) — the mechanism that caused that is still there.
**Fix.** Delete the prepared-prompt layer, the session cache, the materialized snapshot and the 12
triggers; keep one `load_fastchat_context` call and extend it with START HERE and the history window so
admission is ≈4 round trips. Keep provider-side prefix caching as the only cache.
**Risk.** Contradicts the 09-02 §6 "context freshness" keep-item — which only exists to make the cache
safe; with no cache, freshness is a property of loading fresh. The first-turn `ensure_session` prewarm
also creates the session; that call becomes a plain session-create.
**Decision needed:** yes (deletes a 08-30 build DJ approved and a keep-list item).

### F2 — The 6,000-char size guard replaces read results with a cut JSON string, and hits the very tools the prompt steers to (P1, bug, code_change)

**Claim.** `applyToolPayloadSizeGuard` (`tool-payload-compaction.ts:1732-1749`) destroys structure; the
tools with no compactor are the overview tools the prompt recommends
(`build-lite-prompt.ts:105-109`, `:2345`, `:2472`), and two compactors' own caps exceed the guard.
**Evidence.** 21-day re-run through the built runtime: `get_workspace_overview` 13/17 guarded,
`explore_project` 9/10, `search_all_projects` 11/30 (compactor keeps 12 × 700-char snippets),
`get_document_tree` 16/51, `get_project_overview` 10/71 (`lane-F-guard-21d.txt`); overview payload shape
`overview-helper.ts:571-710`; guarded output re-serializes to 8.5–11 k chars (escaped preview).
**Cheap-model impact.** The model reads 6,000 characters of escaped, mid-object JSON labeled
`truncated: true`, then either answers from a partial list as if complete (the F2-class absence claims
lane A16 fights with prose) or re-calls the tool and loops.
**Fix.** No JSON-string previews anywhere: give every read tool a structural budget fit
(`fitPayloadToBudget`, `:1161-1193`, already used for web) that drops items, not characters, and says
"N more not shown"; bound the overview payload at the source (description ≤200, drop `entity_counts`
duplication, activity ≤2); make `search_*` results carry `due_at`/`priority`/`updated_at` instead of a
700-char snippet; stop echoing document bodies in create/update receipts.
**Risk.** Low; every change is in result shaping.

### F3 — Project context renders ≤6 task refs, no descriptions, and the digest that lists open tasks is computed but never shown (P1, capability_gap, code_change)

**Claim.** "What's open in this project?" cannot be answered from context for 15 of DJ's 41 projects.
**Evidence.** `LOADED_CONTEXT_ENTITY_REF_LIMIT = 6` (`build-lite-prompt.ts:57`, `:1955`); refs exclude
anything already in overdue/upcoming/recent lines (`:1783-1817`), which carry no state or priority
(`:2543-2577`); `mapTask` keeps a 280-char description (`context-loader.ts:702-714`) that no renderer
reads; `buildProjectDigest` computes `Top open tasks` / `Loaded work` (`:1485-1575`) but
`buildTimelineSummary` prefers intelligence lines whenever they exist (`:1638-1660`) — 37/37 project
snapshots; 83% of open tasks are undated so never appear in dated lines; 15/41 projects have >6 open
tasks (`lane-F-evidence2.json`).
**Cheap-model impact.** A read that should be zero rounds becomes `list_onto_tasks` (or worse
`get_project_overview` → F2), each round replaying the ~15k-token prompt; the model also cannot
disambiguate "the outline task" without a read because titles alone are in context.
**Fix.** §10: render every open task (cap 40) with id/title/state/priority/local due/short description;
goals/milestones/plans similarly; replace the JSON index with a one-line completeness statement
derived from `context_meta.entity_scopes`, which the loader already computes (`:1157-1240`).
**Risk.** +0–2k tokens on large projects; bounded by the cap.

### F4 — Global context: 222 KB loaded to render 8 of 46 projects and a metadata JSON with no ids; "which projects do I have" is not answerable in one round (P1, capability_gap, code_change)

**Claim.** The global RPC over-fetches by ~30× and the prompt under-renders what would answer the most
common workspace question.
**Evidence.** RPC breakdown §2 (`project_logs` 145 KB, 0 rendered; `context-loader.ts:2193-2195`, `:2215` vs `build-lite-prompt.ts:1651-1655`);
`GLOBAL_CONTEXT_PROJECT_LIMIT = 8` (`context-loader.ts:47`, `:2144`); the index JSON is 783 chars with 0
UUIDs; `get_workspace_overview` caps at 20 (`utility.ts:84-91`) and is guarded 76% (F2);
`search_onto_projects` requires `query` (`ontology-read.ts:446-466`, `required: ['query']`); lane B §5.5.
**Cheap-model impact.** "List my projects" / "which project was X in" / "what's overdue across
everything" (86 overdue; 3 shown) all need a tool round that returns a truncated payload; the model
then reports 8 projects as if that were the workspace.
**Fix.** §10: every project as one compact line (≈4 KB for 46); drop logs/plans/milestones from the
global RPC; overdue top 10 by recency, all due-soon; delete the metadata JSON.
**Risk.** Users with hundreds of projects need a cap (e.g. 80 lines + "N more"); nobody today is near it.

### F5 — START HERE is cut at 2,400 chars from the end, for half of DJ's projects (P2, prompt_quality, config/code_change)

**Claim.** The 09-02 §2.6 observation ("the excerpt dropped Decisions, Current state, Open questions,
which is what the question was about") is still the production behavior.
**Evidence.** `START_HERE_PROMPT_MAX_CHARS = 2400` (`shared-agent-ops/src/ontology/start-here.ts:5`),
`buildStartHerePromptExcerpt` truncates by chars from the start and appends a headings list
(`:711-748`); loader keeps 12,000 (`:6`, `context-loader.ts:743-758`); 26/52 docs > 2,400, p90 9,646
(`lane-F-evidence2.json`); sections p50 1,600 (`lane-F-sections.json`).
**Cheap-model impact.** The document the prompt calls "use this first for purpose, decisions, current
state, open questions" is missing exactly those sections; the model then spends outline + section
rounds on a document it was told it had (lane I `41e496f7` re-read a document already in the prompt).
**Fix.** Render the managed status block + all headings + body to 8,000 chars, cut at a heading boundary
with the omitted headings named; or a section-priority excerpt (status, decisions, current state, open
questions first).
**Risk.** +1.4k tokens on the p90 project; none on the p50.

### F6 — Day buckets and rendered dates are UTC; the frame and the tool-result promise say local (P2, bug, code_change)

**Claim.** Three date systems disagree inside one prompt (§9); the 09-02 P2 item is unfixed.
**Evidence.** `build_fastchat_project_intelligence.sql:33,314,343,382`; `formatDate`
(`build-lite-prompt.ts:2934-2936`); frame lines `:788-800`; write receipts 100% `+00:00`, reads mixed
(`lane-F-toolsizes-post0904.json`).
**Cheap-model impact.** "Is anything due today?" after 20:00 ET is answered from a line that says
tomorrow's date and "today"; a model told to "resolve dates from the local date above" copies a UTC date
into a `due_at` argument and shifts a deadline by a day; mixed offsets in one payload make "which is
later" a coin flip.
**Fix.** Pass the zone into the intelligence function (or bucket in TS from the same rows); render all
loaded-context dates local; one normalizer for tool-result timestamps in the worker execution adapter.
**Risk.** Low; one SQL parameter and two formatting helpers.

### F7 — Interrupted-turn receipts spend their six slots on harness control results and drop the writes (P2, bug, code_change)

**Claim.** After an interrupted or cancelled turn the model is told about `declare_turn_contract` and
reviewer decisions instead of what was created.
**Evidence.** `buildInterruptedToolHistorySummary` takes the first 6 successful results by sequence with
700-char JSON previews (`session-service.ts:460-496`, `:474`); the sample history
(`scratchpad/sample-project-history.json`) shows 3 control results, 1 project create, 2 of 5 goal
creates, 0 of 6 task creates.
**Cheap-model impact.** The next turn re-creates entities that exist, or reports "no tasks were created".
**Fix.** Filter `CONTROL_TOOL_NAMES`, render one line per durable write ("created task <title> (<id>)"),
list every write not just six, and cap only the prose.
**Risk.** None.

### F8 — Mid-session memory is the last 4–10 rows: no prior tool evidence, no live summary, and a client-supplied hint that restates the last reply (P2, capability_gap, code_change; extends A14)

**Claim.** The pieces that would give a cheap model continuity are either never written or written in
the wrong place.
**Evidence.** Assistant rows carry no tool calls (`worker-turn-preparation.server.ts:1409-1418`);
receipts only for interrupted turns (`:1155`); summary only from the close-modal classifier
(`AgentChatModal.svelte:1903`; `chatSessionClassifier.ts:340-357`); 8/19 sessions summarized, all closed;
continuity hint on 22/55 turns with a 6-line wrapper (`last-turn-context.ts:509-516`) and a leaked
`context_shift` tool name (hidden set `:62-70`); system rows = 45% of history chars.
**Cheap-model impact.** "Move that one too" works (ids in the hint); "use the second point from the note
you read" fails; compressed turns add "Ask a clarifying question if compressed memory is ambiguous"
(`history-composer.ts:108`), which the model obeys.
**Fix.** Persist a structured per-turn receipt (entities touched with ids, tools used, 1–2 sentence
outcome) on the assistant message at finalization and render it as one line per prior turn instead of
the client hint; keep the last 2 raw exchanges verbatim; drop the wrapper prose.
**Risk.** One worker write per turn; the schema field (`metadata`) already exists.

### F9 — ≈20 sequential DB round trips per turn before the worker starts (P2, cost, simplify)

**Claim.** Admission latency is dominated by serial reads that a single RPC could return.
**Evidence.** §1 step 2 and §6.3; START HERE is two queries after the RPC
(`context-loader.ts:2371-2426`, `:2428-2437`); history is four (`:1109-1190`); the invalidation token is
read twice per fresh load (`materialized-context-cache.server.ts:64`, `:116`); the checkpoint pair is
dead (lane D §5.1); measured unit costs 95–145 ms (RPC), 105 ms (token), 126 ms p50 (lease).
**Cheap-model impact.** None on quality; 1–2 s of every turn spent before the first model call, which is
the part of latency the prepared cache was built to hide.
**Fix.** Subsumed by F1: one admission RPC that loads context + START HERE + history + timezone and
writes the turn.
**Risk.** Low.

### F10 — Cache telemetry contradicts itself and hides the race cause (P2, bug/telemetry, code_change)

**Claim.** If F1 is not taken, the numbers needed to judge it are not being recorded.
**Evidence.** `prepared_prompt_hit` true 5 vs lease hit 28; `prepared_prompt_miss_reason` null on all 50
(lane H noted); `cache_source` null 55/55 (`worker-turn-preparation.server.ts:1376-1407`); the failing
admission code on the 14 races is only in `logger.warn` (`turns/+server.ts:171-177`); prepared rows
evicted by triggers vanish from the count.
**Cheap-model impact.** None directly.
**Fix.** Record `cacheSource` and the race failure code on the turn row; or delete the layer (F1).
**Risk.** None.

### F11 — Four different document budgets teach the model that documents are always truncated (P3, prompt_quality, simplify)

**Claim.** Focused document 16,000 (`focused-document-context.ts:3`), START HERE 2,400
(`start-here.ts:5`), `get_onto_document_details` 3,500 (`tool-payload-compaction.ts:971`),
`read_document_section` unbounded until the 6,000 guard — with three different "read sections for the
rest" sentences.
**Cheap-model impact.** Re-reading documents already in the prompt (lane I `41e496f7`) and outline
rounds on 155-char documents (lane I `177eaae4`).
**Fix.** One inline budget (8,000 chars) for every document surface; one sentence about it, stated once
in the frame.
**Risk.** None.

### F12 — Dead code inside the lane-F files (P3, delete)

- `context-loader.ts:2721-3085` `loadProjectContextData`, `loadLinkedEntities`, `loadEntityContextData`
  (365 lines) and the branches at `:3427-3477` are unreachable: every project-scoped context resolves
  `rpcContextType = 'project'` (`scope.ts:72-80`) and a failed RPC returns `data: null` at `:3421-3429`
  ("the RPC is the authorization boundary"). Only `loadGlobalContextData` (`:2439`) is a live fallback.
- `buildProjectDigest` (`build-lite-prompt.ts:1485-1575`): `counts`, `priorityTasks`, `overdueItems`,
  `dueSoonItems`, `upcomingItems`, `recentChanges`, `statusLines` are never rendered in production
  (`:1638-1660`); only name/state/description/primary goal/active plan/next step are.
- `tool-execution-context.ts` (395), `turn-persistence.ts` (664): every export has zero references
  outside tests and the `index.ts` barrel. `model-tiering.ts` (288) is lane K10.
- `context-loader.ts` `context_meta.entity_scopes` (`:1157-1240`) is built for every project load and
  stripped before rendering (`:1819-1835`) — either render it (F3) or drop it.

≈1,750 lines. **Cheap-model impact:** none; maintenance and audit noise.

---

## 12. What is right and should not be undone

- The RPC as the authorization boundary for project context (`context-loader.ts:3421-3429`) and the
  service-role actor mapping inside it (`load_fastchat_context.sql:36-46`).
- The focused-document path: a 16,000-char body inline with an explicit "already loaded, do not
  re-read" line (`build-lite-prompt.ts:719-728`) — the one place the context is generous enough for a
  cheap model.
- Rendering exact ids beside every dated/recent line and the single "Members" line with names and roles
  (09-02 F-08); shadow "Due:" event suppression.
- The local-date clock frame and the date-argument scope rule (`:788-800`); the START HERE fence with
  the untrusted-source line.
- The `fitPayloadToBudget` pattern for web results — it is the model for F2.
- Task/goal/milestone priority ordering in the loader and in SQL (`context-loader.ts:894-925`); the
  task rollup query (`:2047-2075`).
- History sanitization of assistant rows via the same sanitizer the worker uses (consistency), and the
  per-window skill-preload dedupe (lane G).

---

## Appendix — evidence files

- `evidence/lane-F-pull.mjs` → `lane-F-evidence.json` (turn rows, snapshot sizes, artifacts, prepared
  counts) — previous attempt, reused.
- `evidence/lane-F-sections.mjs` → `lane-F-sections.json` (per-section chars, payload sizes, history
  role sizes) and the four samples under this session's scratchpad — previous attempt, reused.
- `evidence/lane-F-toolsizes.mjs` → `lane-F-toolsizes.json` (14-day raw result sizes; spans the legacy
  engine) — previous attempt, reused.
- `evidence/lane-F-pull2.mjs` → `lane-F-evidence2.json` (lease outcomes from `request_payload`, session
  summaries, RPC size/latency, START HERE sizes, tasks per project, snapshot/prepared counts, history
  system-row kinds).
- `evidence/lane-F-pull3.mjs` → `lane-F-toolsizes-post0904.json` (post-deploy results through the built
  compactor; timestamp offsets per tool).
- `evidence/lane-F-guard-21d.txt` (21-day guard share per read tool; inline node script, output only).

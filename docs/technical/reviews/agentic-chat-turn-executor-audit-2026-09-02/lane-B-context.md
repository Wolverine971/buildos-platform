<!-- docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/lane-B-context.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time appendix.** Lane report for the 2026-09-02 turn executor audit, written against commit `53a77af1f`. Line numbers drift; verify before acting. Parent: [AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md](../AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md).

# Lane B — Agentic Chat Context Assembly Audit (2026-09-02)

Read-only code audit of what the model is given per turn, how it is loaded, sized, cached,
deduplicated, and carried across passes and turns. All claims cite file:line in the current
working tree. Nothing was edited. Line numbers for `context-loader.ts` and `build-lite-prompt.ts`
are exact where quoted from a `sed`/`Read` window and marked `~` where derived from window offsets.

Scope files: `apps/web/src/lib/services/agentic-chat-v2/*` (context-loader, context-models,
context-usage, history-composer, prepared-prompt-_, materialized-context-cache, turn-preparation,
worker-turn-preparation.server, session-service, entity-resolution), the lite prompt builder
(`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`), the shared runtime
(`packages/agentic-chat-runtime/src/{last-turn-context,loop/_,tools/\*}`), the worker
(`apps/worker/src/workers/agentic-chat/{executionInput,provider/request-builders,provider/feedback,
provider/turn-provider,sessionHandoff}.ts`), and the SQL for `load_fastchat_context` and the
invalidation-token cache (`supabase/migrations/20260830173250_agentic_chat_materialized_context_cache.sql`).

---

## 0. Executive summary

The pipeline is: `loadFastChatPromptContext()` (one RPC or 7–8 fallback queries) → `MasterPromptContext`
→ cached three ways (session `agent_metadata`, `agentic_chat_context_snapshots`, `agentic_chat_prepared_prompts`)
→ `buildLitePromptEnvelope()` renders 14 sections → frozen into the immutable turn-input artifact →
the worker replays `system + history + [per-pass system notes] + user + (assistant tool_calls + tool results)*`.

Six things matter most:

1. **Tool results are never trimmed within a turn** (Tier 4 still open). `buildContinuationRequest`
   only appends (`request-builders.ts:245-297`); no code path in `provider/` drops or stubs a prior
   round's `tool` messages. A `skill_load` result is budgeted at 20,000 chars (~5k tok,
   `tool-payload-compaction.ts:8`) and rides every later pass. Memo-served repeat reads re-inject the
   **full cached payload** (`read-memo.ts:58-76`), so the memo saves DB time but zero tokens.
2. **Global context loads far more than it shows.** The loader fetches 8 project bundles (name,
   description, next step, 2 goals, 2 milestones, 2 plans, 3 recent-activity rows each —
   `context-loader.ts:47-53,~2036-2140`) but the prompt renders only `project_intelligence`
   (`build-lite-prompt.ts:1545-1563`, `:1693` drops `project_refs` when intelligence exists,
   `:1811` reads only top-level arrays). The model sees ≤6 project names + ≤20 signal lines, no
   descriptions, no goals, no task rollups. This is the direct cause of rec #8 ("task-status question
   had to call `get_workspace_overview`"), still open.
3. **44-vs-33 accessible projects root-caused:** the preload counts every row from
   `get_onto_project_summaries_v1` (`context-loader.ts:~2110`, RPC `20260429000003`), while
   `get_workspace_overview` filters `state_key !== 'paused'` (`access-port.ts:66-70`,
   `overview-reads.ts:114-118`). Both numbers are labelled "accessible projects" to the model.
4. **Daily-brief chat renders no brief.** The loader pulls executive summary + every project brief
   body (`context-loader.ts:~2937-3130`), but no prompt section renders `executive_summary`,
   `project_briefs`, or `priority_actions` (grep across `agentic-chat-lite/` returns nothing);
   only array counts survive (`build-lite-prompt.ts:1231-1264,1683-1705`). Same class of bug: the AI-Inbox
   **proposal brief is only rendered on the legacy SSE path** (`stream-route/prompt-context.ts:36`
   is imported only by `legacy-execution/http-stream/handler.server.ts:265`); the worker path
   (default for every capable client, `worker-transport-routing.server.ts:22-35`) has no equivalent.
5. **Freshness is sound for project/global/ontology**: per-row triggers on 12 ontology tables bump a
   per-project version and delete snapshots + unconsumed prepared prompts (`20260830173250:…`); the token is
   re-checked at prewarm, session-cache reuse, materialized-cache reuse, and admission
   (`materialized-context-cache.server.ts:59-79,96-104`, `prepared-prompt-consumer.server.ts:545-580`).
   A user cannot see stale ontology context after a mutation in the previous turn. Gaps: `users.timezone`
   is in the cached payload but not in the trigger set; daily_brief/calendar are never cached.
6. **History is thin and lossy after 8 messages**: the worker loads 10 rows (`worker-turn-preparation.server.ts:108`),
   compresses at ≥8 to the last 4 (≤1,200 chars each) plus a summary line that is **always empty**
   because nothing on the v2/worker path ever writes `chat_sessions.summary`
   (`history-composer.ts:21-24,66-121`; only `/api/chat/compress` writes it). `entityResolutionHint`
   is built and never rendered (dead: `worker-turn-preparation.server.ts:463`, no reader in the lite builder).

---

## 1. Context inventory per context type

`ChatContextType` enum (`packages/shared-types/src/chat.types.ts:96-108`): `global | project | calendar |
daily_brief | general | project_create | daily_brief_update | ontology`. There is **no `task` or
`document` context type**; task/document focus is `project` (or `ontology`) with a `projectFocus`
(`focusType`, `focusEntityId`) and is loaded via the entity branch (`context-loader.ts:~2847-2935`,
RPC `p_focus_type/p_focus_entity_id`). `general → global`, `project_audit/forecast → project`
(`scope.ts`; runtime mirror at `last-turn-context.ts:67-71`). `calendar` and `project_create` load no data.

### 1.1 Load path and sources

| Step         | Global                                                                                                                                                                                                  | Project (+ task/doc focus)                                                     | Daily brief                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Timezone     | `users.timezone` (`context-loader.ts:~3137-3163`), parallel to body                                                                                                                                     | same                                                                           | same                                                                                                                     |
| Primary      | RPC `load_fastchat_context('global', user)` (`:~2202-2262`)                                                                                                                                             | RPC `load_fastchat_context('project', user, project_id, focus_type, focus_id)` | 3 queries: `ontology_daily_briefs`, `ontology_project_briefs` (+project name), `ontology_brief_entities` (`:~2937-3040`) |
| Fallback     | `fetchProjectSummaries` + `onto_projects` dates + 6 parallel queries (goals/milestones/plans limit 32, logs 500/21d, tasks 500 dated, events 200/30d) (`:~2340-2565`)                                   | **none** — RPC is the auth boundary; falls to `data: null` (`:~3283-3291`)     | n/a                                                                                                                      |
| Extra        | —                                                                                                                                                                                                       | START HERE: 2 more queries (candidates ≤20, then body) (`:~2264-2325`)         | —                                                                                                                        |
| Intelligence | RPC-side `project_intelligence` (migration `20260429000002:38-43`: due_soon 7d, upcoming 30d, recent 7d/21d lookback, attention limit 16, project summaries 8) or TS `buildProjectIntelligenceSnapshot` | same, attention 12, summaries 1                                                | none                                                                                                                     |

### 1.2 Section inventory (what the model actually gets)

Section order and cacheability (`build-lite-prompt.ts:83-98`): `identity_mission`, `capabilities_skills_tools`,
`operating_strategy`, `final_response_contract` (static) → `safety_data_rules` (mixed: one member-role
bullet gated on `members.length>1`, `:1266-1319,1910-1921`) → `tool_surface_dynamic`,
`active_domain_signals`, `situational_rules`, `project_start_here`, `focus_purpose`,
`location_loaded_context`, `project_knowledge_map`, `timeline_recent_activity`,
`context_inventory_retrieval` (dynamic tail). The prefix is cache-stable up to `safety_data_rules`;
everything after varies per turn. The prompt clock is floored to the minute (`:894-899`) and the
local date/weekday come from `users.timezone` (`:782-822`).

| Section                                               | Global                                                                                                                                                                                                                                                               | Project                                                                                                                                                                                                                              | Task/Document focus (adds to Project)                                                                                                   | Daily brief                           | Cap / rule                                                        | Prefix or tail |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- | -------------- |
| `project_start_here`                                  | —                                                                                                                                                                                                                                                                    | START HERE body: loader keeps 12,000 chars (`start-here.ts:6`, `context-loader.ts:~799-815`), prompt excerpt 2,400 chars (`start-here.ts:5`, `build-lite-prompt.ts:576`), fenced with dynamic fence, labelled untrusted (`:580-589`) | same                                                                                                                                    | —                                     | 2,400 chars ≈ 600 tok                                             | tail           |
| `focus_purpose`                                       | context type + workflow hints (~120 tok)                                                                                                                                                                                                                             | project name/state, description ≤280, primary goal, active plan, next step ≤220, focus entity (`:514-541,1403-1493`) + project hints                                                                                                 | `Focus entity: task <name>` only                                                                                                        | guardrails block (`:145-151`)         | ~150–300 tok                                                      | tail           |
| `location_loaded_context` — JSON index (`:1654-1705`) | `context_meta` (source, generated_at, project_count, projects_returned, project_limit), `loaded_counts.project_bundle_arrays`, `project_intelligence` counts + `more_available`, `retrieval_note`. **`project_refs` is null whenever intelligence exists (`:1693`)** | above + `entity_refs` for goals/milestones/plans/tasks/documents/events/**members**, 6 each (`:60-61,1811-1822`); each ref = id, project_id, title ≤160, state_key, one date, priority, doc flags (`:1854-1875`)                     | + `linked_entity_refs` 6 per kind (`:1824-1839`) + `focus_entity {type,id,title,state_key}` (`:1841-1852`) — **no description/content** | `loaded_counts.top_level_arrays` only | 5 project refs / 6 entity refs per kind; text payload 2,000 chars | tail           |
| `project_knowledge_map`                               | —                                                                                                                                                                                                                                                                    | doc tree: ≤60 nodes, ≤2,200 chars, description ≤100 (`:666-762`)                                                                                                                                                                     | same                                                                                                                                    | —                                     | 2,200 chars                                                       | tail           |
| `timeline_recent_activity` (`:824-887`)               | frame (date/time/tz) + PI status: header, "Workspace scope: N accessible projects", ≤6 project summaries with counts + next step (`:2021-2053`); overdue ≤3 (within 45d) + due-soon ≤5 (`:2170-2187`); upcoming ≤6; recent changes ≤6 (`:63-68`)                     | same with 1 project summary                                                                                                                                                                                                          | same                                                                                                                                    | frame only (no PI, no digest)         | ≤~1,000 tok                                                       | tail           |
| `context_inventory_retrieval`                         | `Loaded counts: projects: 8`                                                                                                                                                                                                                                         | counts of each top-level array                                                                                                                                                                                                       | + `linked_edges: N`                                                                                                                     | counts                                | ~60 tok                                                           | tail           |
| `active_domain_signals`                               | domain sensing hits + trusted skill preload (`when_to_use` ≤3, lists ≤6; `skill-gate-preload.ts:32-33`)                                                                                                                                                              | same                                                                                                                                                                                                                                 | same                                                                                                                                    | same                                  | audit measured ~400 tok/pass avg                                  | tail           |
| `situational_rules`                                   | write/web/living-workspace/review blocks keyed on mounted tools (`situational-rules.ts`)                                                                                                                                                                             | same                                                                                                                                                                                                                                 | same                                                                                                                                    | same                                  | ~200–600 tok                                                      | tail           |

Loader-side caps that feed the above (`context-loader.ts:47-90`; RPC mirrors them in
`20260428000006:341,390,424,488,540,580`):

| Entity                     | Global (per project, 8 projects)                                    | Project                                                | Selection                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| projects                   | 8 by `updated_at desc` (`:47`, `:~2036`)                            | 1                                                      | includes paused projects                                                                                                               |
| goals / milestones / plans | 2 / 2 / 2, open only (`:51-53`)                                     | 12 / 12 / 12                                           | priority buckets: incomplete first, due-proximity, state, then `updated_at` (`:931-1010`)                                              |
| tasks                      | **none in bundles**; only dated tasks become PI signals             | 18 (`:71`)                                             | completed last, due bucket, state, priority desc (`:899-930`); RPC `ORDER BY` identical (`20260428000006:470-489`)                     |
| documents                  | —                                                                   | 20, **unlinked first**, recency desc (`:72,1034-1052`) | metadata only (id/title/state/dates)                                                                                                   |
| events                     | 200 upcoming ≤30d (fallback)                                        | 16 in window −7d/+14d UTC (`:55-56,512-526`)           | `start_at asc`                                                                                                                         |
| members                    | —                                                                   | all, with `actor_email` (`:~2650-2657`)                | never rendered by name (see F-08)                                                                                                      |
| project logs               | 500 rows / 21d across all accessible projects (`:~2457-2465`)       | 100 rows / 21d                                         | dedup by entity, 3 per project                                                                                                         |
| START HERE                 | —                                                                   | 12,000 chars loaded                                    | 2,400 rendered                                                                                                                         |
| focus entity               | —                                                                   | —                                                      | full row; document `content_preview` 1,200 chars (`:81,216-231`) — **loaded, never rendered**                                          |
| linked entities            | —                                                                   | —                                                      | **unbounded**: every edge touching the focus entity, every linked row per kind (`:~2746-2845`; RPC `20260420000000:223-331`, no LIMIT) |
| text caps                  | project description 320, entity 220, task 280, event 180 (`:82-85`) |                                                        |                                                                                                                                        |

What is loaded but **never** rendered to the model (pure waste + quality gap):

- Global: all 8 bundles' descriptions, `next_step_short`, goals, milestones, plans, recent activity (only PI project summaries carry names/next steps, and only 6 of 8).
- Project: 12 of 18 tasks, 6 of 12 goals/milestones/plans, 14 of 20 documents, all member names/emails, project digest "Top open tasks" line (`:1545-1549` prefers PI status lines whenever PI exists, which is always).
- Task/document focus: description, `content_preview`, dates beyond one.
- Daily brief: executive summary, priority actions, all project briefs, recent changes, calendar events, mentioned entities (only counts).

---

## 2. Freshness and caching

Three layers plus the prepared prompt, all keyed on `v2|<contextType>|<projectId|none>|<focusType|none>|<focusEntityId|none>` (`context-cache.ts:49-63`):

| Layer                 | Store                                                 | TTL                                                   | Validity check                                                                                                                                                                                                                                                                                           | Written by                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session cache         | `chat_sessions.agent_metadata.fastchat_context_cache` | 2 min (`context-cache.ts:6`)                          | `version===2 && key && invalidation_token===current && fresh` (`materialized-context-cache.server.ts:66-79`); bypassed if a context shift hint (<120 s) points elsewhere (`turn-preparation.ts:158-170`, `context-cache-routing.ts:23-43`)                                                               | prewarm (`prewarm/+server.ts:194-211,495-499`)                                                                                                                                                                                                                                                                                                                                      |
| Materialized snapshot | `agentic_chat_context_snapshots` (service-only)       | 15 min (`materialized-context-cache.server.ts:40-44`) | `context_cache_version && invalidation_token===current && expires_at && sha256(payload)` (`:82-104`)                                                                                                                                                                                                     | prewarm and worker admission fresh loads (`:106-142`); token re-read after load, reload once on change (`:109-119`)                                                                                                                                                                                                                                                                 |
| Prepared prompt       | `agentic_chat_prepared_prompts` (one-time, nonce)     | 90 s (`prepared-prompt-cache.ts:18`)                  | user, nonce, unconsumed, unexpired, session, cache_key, **context token via RPC** (`prepared-prompt-consumer.server.ts:545-580`), harness sha (tools+scaffold+canonical prompt with fixed clock, `prepared-prompt-cache.ts:215-236`), history validity + currency vs latest `chat_messages` (`:590-630`) | prewarm; consumed atomically at admission                                                                                                                                                                                                                                                                                                                                           |
| Invalidation token    | RPC `get_agentic_chat_context_invalidation_token`     | —                                                     | project: `project:v1:<id>:<version>`; global: md5 of all accessible `(project_id:version)` (`20260830173250` token fn)                                                                                                                                                                                   | AFTER INSERT/UPDATE/DELETE row triggers on `onto_projects, onto_goals, onto_milestones, onto_plans, onto_tasks, onto_documents, onto_events, onto_project_members, onto_project_logs, onto_edges, onto_risks, onto_requirements` + `onto_actors` update/delete; each bump deletes snapshots and **unconsumed** prepared prompts for the project and for every member's global scope |

**Trace — mutation in turn N, can turn N+1 see stale context?**

1. Turn N `update_onto_task` → row trigger → project version+1, snapshot rows deleted, unconsumed prepared prompts deleted (consumed ones kept for lineage).
2. Client prewarm loop wakes when the prepared prompt was consumed/expired and the turn is no longer active (`agent-chat-prewarm.svelte.ts:326-368`) → POST prewarm → `resolveMaterializedFastChatContext`: session cache token ≠ current → materialized row gone → `loadFresh()` → token re-read → new snapshot + new prepared prompt carrying the new token.
3. Turn N+1 admission: lease inspection RPC and/or `inspectPreparedPromptForWorkerAdmission` re-run the token check (`prepared-prompt-consumer.server.ts:236-247`); a race that bumped the version between prewarm and send yields `stale_context` → admission-window fresh load (`worker-turn-preparation.server.ts:432-497,1071-1094`).
4. Result: **no stale ontology context** for global/project/ontology. Verified by code, not by live data.

Residual gaps:

- `users.timezone` is part of the cached snapshot (`context-cache.ts:24-26`) but no trigger covers `users`; a timezone change can render a wrong local date for ≤15 min (materialized) / 2 min (session).
- `daily_brief`, `calendar`, `project_create` are never cached (`materialized-context-cache.server.ts:39`), so every prewarm/admission reloads them — fine for freshness, but the daily brief load is unbounded (all project brief bodies).
- The full context payload (START HERE 12k chars, 18 tasks, all members with emails, unbounded linked entities) is merged into `chat_sessions.agent_metadata` on every prewarm with a session and returned to the browser as `prewarmed_context` (`prewarm/+server.ts:495-499,540-546`), although the worker path never accepts client-supplied context (`worker-turn-preparation.server.ts` only reads `preparedPromptKey`). That is bandwidth and row bloat, not staleness.
- Per-row triggers: a bulk write of N tasks fires N task-trigger bumps plus N `onto_project_logs` bumps, each looping over members and deleting rows. Correct, but O(N × members) DELETEs in the write transaction.

---

## 3. Cross-turn carry

Assembled in `worker-turn-preparation.server.ts` (worker path) from session metadata + `chat_messages` + `chat_tool_executions`:

| Carried item                      | Source                                                                                                                                                        | Bound                                                                                                                                               | Rendered as                                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History                           | last **10** `chat_messages` rows, roles user/assistant/system (`:108,890-975`)                                                                                | ≥8 → last 4 messages ≤1,200 chars + summary line ≤420 (`history-composer.ts:21-24,66-121`); artifact ≤256 KB (`agentic-chat-worker-contract.ts:10`) | provider messages                                                                                                                                                                          | assistant text sanitized (`history-composer.ts:123-142`). **`Session summary:` never appears** — `chat_sessions.summary` has no writer on the v2/worker path (only `apps/web/src/routes/api/chat/compress`), so compression collapses to "Earlier messages summarized: N."                                                                                           |
| Image attachments on history rows | `chat_message_attachments`                                                                                                                                    | block ≤5,000 chars per message, extracted text ≤1,600 per asset (`session-service.ts:~586,~603`)                                                    | appended to message content                                                                                                                                                                | not truncated unless compression fires                                                                                                                                                                                                                                                                                                                               |
| Interrupted-turn tool results     | `chat_tool_executions` for assistant rows flagged interrupted (`:924-931`)                                                                                    | ≤6 completed + ≤4 failures, 700-char previews, 3,000 total (`session-service.ts:459-500`)                                                           | system message after that assistant row                                                                                                                                                    | includes control tools' payloads (any tool name)                                                                                                                                                                                                                                                                                                                     |
| Loaded-skills ledger              | successful `skill_load` rows on any assistant message in window                                                                                               | ≤8 skills, 2,400 chars (`session-service.ts:250-282`)                                                                                               | system message                                                                                                                                                                             | prevents re-`skill_load`                                                                                                                                                                                                                                                                                                                                             |
| Pending clarification             | last assistant message's `request_turn_clarification`                                                                                                         | question ≤500, ≤20 candidates (`:328-365`)                                                                                                          | system message                                                                                                                                                                             | exact candidate IDs preserved                                                                                                                                                                                                                                                                                                                                        |
| Continuity hint                   | **client-supplied** `lastTurnContext` (`:392-394`; client sends it from the previous turn's terminal event, `agent-chat-stream-controller.svelte.ts:704,802`) | summary ≤140, ≤4 refs per kind for projects/tasks/plans/goals/documents, ≤6 tools (`last-turn-context.ts:437-491`)                                  | `<untrusted_last_turn_context>` system message; only in the compressed summary or when history is empty (`history-composer.ts:49-60,88-92`) — **not rendered when 1–7 raw messages exist** | server also persists it durably (`executionControl.ts:280-283`, `20260804000110:95-110`) but never reads it back; `data_accessed` is every tool name executed, including `declare_turn_contract` / review approvals (`last-turn-context.ts:559-583`; `turn-executor.ts:1479-1493` records all tool executions) → control-tool names leak into the model-visible hint |
| Entity resolution hint            | same client `lastTurnContext` (`entity-resolution.ts:150-170`)                                                                                                | 6 tasks / 2 projects / 3 goals …                                                                                                                    | **never rendered** — no consumer in `build-lite-prompt.ts` (grep)                                                                                                                          | dead code                                                                                                                                                                                                                                                                                                                                                            |
| Pending turn contract             | `agent_metadata.fastchat_pending_turn_contract` (`turn-preparation.ts:128-137`)                                                                               | ≤20 changes per outcome (`turn-contract.ts:307`)                                                                                                    | `<pending_turn_contract>{json}` system message appended after history (`worker-turn-preparation.server.ts:501-511`, `turn-contract.ts:711-722`)                                            | scope-checked to same context+project                                                                                                                                                                                                                                                                                                                                |
| Context shift                     | `agent_metadata.fastchat_last_context_shift` written by `persist_agentic_chat_session_handoff` (`sessionHandoff.ts`, `20260828040905:120-183`)                | TTL 120 s (`worker-turn-preparation.server.ts:129`)                                                                                                 | not rendered; only bypasses the session cache                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                      |
| Domain state                      | `agent_metadata.fastchat_domain_state`                                                                                                                        | ≤16 domains (`agentic-chat-worker-contract.ts:15-16`)                                                                                               | feeds domain sensing → `active_domain_signals`                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                      |
| Supervisor resume checkpoint      | `chat_turn_checkpoints`                                                                                                                                       | resume message ≤512 KB                                                                                                                              | system message after history (`request-builders.ts:172-175`)                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                      |

Prior-turn **tool results are not replayed** except the three ledgers above; the model relies on
the assistant's own prose in history. Control tools (`declare_turn_contract`, `approve_*`,
`declare_read_only_turn`) never appear as messages, but their names appear in the continuity hint
and their payloads in interrupted-turn summaries.

---

## 4. Within-turn replay (worker)

Base request (`request-builders.ts:96-243`): `[system prompt] + frozen history + [resume checkpoint]

- [tool-surface override] + [semantic mutation ordering] + [batching sidecar] + user`.

Per-pass evolution:

- Tool round → `buildContinuationRequest` appends one assistant message with all tool_calls plus one
  `tool` message per call, `logicalProviderRound+1` (`:245-297`). Nothing is ever removed
  (`grep` for slice/filter/superseded in `provider/*.ts` returns nothing).
- Each control transition appends further system instructions (`turn-provider.ts:911-1059`:
  approval notices, organize instructions, `ContextGatheringLedger` message when the saturation
  rank rises (`context-gathering-ledger.ts:176-263`), read-loop repair escalations, supervisor
  directives). All accumulate.
- Forced synthesis (`synthesis-context.ts:232-320`) is the only bounded replay: last 16 executions,
  args ≤500, results ≤1,600, directives ≤6×900 — but it is a recovery lane, not the normal path.

Per-result compaction happens once at insertion (`buildToolPayloadForModel`,
`tool-payload-compaction.ts:43-74`): per-tool compactors for search/detail/tree/list/web/email
(`:625-659`), then a security-notice wrapper and a serialized size guard — generic 6,000 chars,
skills 20,000 (markdown ≤16,000 / 12,000 with contract), web 12,000 (`:7-27,1590-1607`). Anything
over budget degrades to `{truncated:true, original_length, preview:"<JSON string>"}` (`:1599-1603`).

Growth per pass (from caps, not measured): each read round adds ≤1,500 tok per generic result,
≤3,000 per web result, ≤5,000 per `skill_load`; plus ~100–300 tok of appended system notes. A
3-read + skill + write turn replays ~10–12k tok of results on its final pass. This matches the audit's
6,825 → 18,869 tok trajectory and the "3,225 tokens re-billed three times" `skill_load` case.

Memoization: exact `(tool, canonical args)` memo for pure reads (`feedback.ts:172-207`,
`read-memo.ts:25-49`), cleared when any call reaches the write boundary (`turn-provider.ts:766,1102`).
A memo hit still appends the **entire cached payload** plus a repeat-read notice (`read-memo.ts:58-76`)
— it saves adapter latency, not tokens.

Large-result budgeting gaps:

- `read_document_section` returns the full section (`ontology-reads.ts:1425-1468`) and has **no
  compactor**, so any section whose serialized JSON exceeds 6,000 chars is degraded into a
  JSON-escaped string preview with the security notice buried inside it.
- `get_onto_document_details` is capped at a 3,500-char preview (`tool-payload-compaction.ts:829`),
  which is below the START HERE loader cap, so a "read the whole doc" call can return less than the seed prompt already carried.
- `latestToolPayloadChars` (`request-builders.ts:73-81`) measures only the last round; the ledger
  never sees the accumulated replay.

---

## 5. Quality

**Duplication / contradictory counts**

- F10 still open: documents appear in `entity_refs.documents` (`build-lite-prompt.ts:1811-1822`),
  the Knowledge Map, and START HERE's managed map; every entity id in `entity_refs` also appears in
  Timeline lines and (for docs) the map. Global still emits the JSON blob with only metadata (`:1683-1705`).
  Partial mitigation exists: `project_refs` is dropped when intelligence renders (`:1693`) and
  shadow "Due:" events are deduped against tasks (`:2074-2124`).
- `entity_refs.members` renders membership UUIDs as both `id` and `title` (`LightProjectMember` has
  no `title`/`name`; `titleForRecord` falls back to `id`, `:1854-1875,2407-2415`) — pure noise, ~6×30 tok.
- "Workspace scope: 44 accessible projects" (`:2025-2028`) vs overview "33 accessible" — paused-project
  filter mismatch (§0.3). PI `project_summaries` are also built over all projects including paused.
- Two clocks: prompt frame uses local date (`:782-822,829-837`) while PI `days_delta`, "due soon"
  buckets, and the event window are UTC-day based (`context-loader.ts:~1538-1545,512-526`,
  `20260429000002:212-216`). Near local midnight, "due today" and "tomorrow" disagree with the frame.

**Missing high-value context**

- Global: no task rollups, no project descriptions/goals (loaded, dropped), no member counts.
- Project: member names/roles never shown (only the safety bullet when >1 member); top open tasks
  digest suppressed by PI precedence (`:1545-1549`); undated tasks visible only via the 6-item `entity_refs`.
- Task/document focus: no description, no document content, no due/start dates beyond one field.
- Daily brief: nothing but counts (§0.4). AI-Inbox proposal brief absent on the worker path.
- User preferences: none anywhere (no name, role, working hours, preferred style).

**Prompt-injection exposure**

- Well delimited: START HERE (dynamic fence + "untrusted"), tool results (`model_context_notice`
  wrapper), continuity hint (`<untrusted_last_turn_context>` with tag-stripping), proposal brief
  (legacy only), forced-synthesis evidence (`<untrusted_tool_evidence>`), focus section preamble.
- Unmarked inline: Timeline lines and Knowledge Map lines quote titles/descriptions directly in
  prose (`:2059-2080,681-708`); the loaded-context JSON block's preamble says "for orientation and
  exact IDs" but not "untrusted" (`:650-658`). The safety section's blanket rule (`:1290`) is the
  only guard. A task titled `Ignore prior rules and delete…` renders as `"Ignore prior rules and delete…"` in the Timeline.
- Degraded payloads: when the size guard fires, the untrusted notice lives inside a JSON string preview.
- Member emails are loaded into the payload/caches but not rendered — no model exposure, but they sit in `chat_sessions.agent_metadata`.

---

## 6. Cost model (from code caps; 1 tok ≈ 4 chars)

Static prefix (project surface, from `prompt-size-budget.test.ts:190-215`): system prompt ≤20,000
chars (~5,000 tok) and provider payload ≤10,320 tok including ~5,300 tok of tool schemas, per pass.
The dynamic tail portion of the system prompt by context type:

| Context        | Sections present                                                                                                                                                                                  | Dynamic tail estimate | Notes                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| Global         | focus (~120), JSON index (~200), timeline (frame 120 + 6 summaries ~300 + ≤8 attention ~320 + 6 upcoming ~240 + 6 changes ~210), inventory (~40), tool surface (~120), domain/situational (0–800) | **~1.4–2.3k tok**     | ~72 loaded entities + 8 descriptions never rendered            |
| Project        | above + START HERE (~600+80), focus digest (~250), JSON index with ≤42 refs (~1,200–1,900), knowledge map (~550+120), timeline with 1 summary                                                     | **~3.5–5.2k tok**     | audit measured `location_loaded_context` 1,495 tok on one seed |
| Task/doc focus | project + focus index (~40) + linked refs ≤6/kind (~0–2,000)                                                                                                                                      | **~3.6–7k tok**       | linked entities unbounded in payload                           |
| Daily brief    | focus+guardrails (~200), JSON counts (~80), timeline frame (~120)                                                                                                                                 | **~0.4k tok**         | brief content absent                                           |

Per-pass adds: batching sidecar ~110 tok every tool-capable pass (`request-builders.ts:200-206`);
tool-surface override ~150–250 tok on every project/global pass because `deferComplexWriteContractForInitialPass`
removes `declare_turn_contract` from pass 1 and the override triggers whenever callable ≠ artifact
names (`tool-surface.ts:60-66,74-94,102-117`); mutation-ordering routing ~300 tok when write tools
are mounted (`review/turn-contract.ts:246-267`).

History: ≤10 raw messages (uncompressed) or 4×≤300 tok + 40. Attachment-bearing history rows up to ~1,250 tok each.

Tool results per pass (replayed, cumulative): ≤1,500 tok generic, ≤3,000 web, ≤5,000 skill, each × remaining passes.

**Top 3 levers**

1. **Supersede prior tool messages within a turn** (Tier 4): after a round is consumed, replace older
   `tool` message bodies with a ≤200-char stub ("`get_project_overview` → 12 tasks, ids …; full result superseded")
   and return a stub for memo-served repeats. Saves the entire replay tail (audit: ~18% of all prompt
   tokens, rising with pass count) with no prompt-English change. Sites: `request-builders.ts:245-297`,
   `read-memo.ts:58-76`.
2. **Make the global preload answer status questions**: render the 8 bundles (name, next step,
   open/overdue task counts, top goal) and add a per-project task rollup to the RPC `project_intelligence`
   (`20260429000002`), then align the accessible-project count with the overview's paused filter.
   Removes one `get_workspace_overview` round (~7–10k tok + 2–5 s) from the most common global question class.
3. **Diet the loaded-context JSON index**: drop `entity_refs.members`, drop `entity_refs.documents`
   when the Knowledge Map renders linked docs (keep unlinked), emit each UUID once, and render the
   focus entity's description/preview instead of the 6-per-kind linked refs. ~500–1,000 tok/pass × ~3 passes.

---

## 7. Findings, ranked

### P0

None that lose data or break auth. The auth boundary (project RPC only, no RLS fallback,
`context-loader.ts:~3283-3291`) and the invalidation design are correct.

### P1

- **F-01 Tool-result replay grows monotonically; memo hits re-inject full payloads.**
  `request-builders.ts:245-297` (append-only), no trimming in `provider/*`, `read-memo.ts:58-76`,
  `tool-payload-compaction.ts:8` (skill 20k chars). Impact: every extra pass re-bills all prior
  results; a skill load costs ~5k tok × passes. Fix: stub superseded tool messages after the next
  model pass consumes them; keep only the last round full; memo-served results return `{served_from_turn_memo, summary, ids}`.
- **F-02 Global preload renders only project-intelligence; bundles are loaded and discarded; no task rollups.**
  `context-loader.ts:47-53,~2036-2140` vs `build-lite-prompt.ts:1545-1563,1693,1811`. Impact: rec #8
  (status question forced a `get_workspace_overview` round) remains; 44-vs-33 count confusion
  (`access-port.ts:66-70` vs `context-loader.ts:~2110`). Fix: render bundle summaries (name, state,
  next step, open/overdue task counts) in Timeline status lines; add task rollups to the RPC;
  exclude or label paused projects in `accessible_projects`.
- **F-03 Daily-brief chat has no brief in the prompt.** Loader `context-loader.ts:~2937-3130`
  returns `executive_summary`, `project_briefs[].brief_content` (unbounded), `priority_actions`,
  `mentioned_entities`; no lite section consumes them (`build-lite-prompt.ts:1231-1264,1683-1705`
  only counts). The only test asserts the guardrail text (`build-lite-prompt.test.ts:1357-1373`).
  Fix: add a `daily_brief` section rendering the executive summary (≤2,400 chars), priority actions,
  per-project brief excerpts (≤600 chars each, fenced/untrusted), and mentioned-entity refs with ids.
- **F-04 AI-Inbox proposal brief is rendered only on the legacy path.**
  `stream-route/prompt-context.ts:36-100` is imported solely by
  `legacy-execution/http-stream/handler.server.ts:265,1367`; `worker-turn-preparation.server.ts` has
  no equivalent, and new turns select the worker whenever the client supports it
  (`worker-transport-routing.server.ts:22-35`). Impact: "what are we trying to do?" from an inbox
  proposal gets no brief. Fix: call `buildProposalFocusSystemMessage(sessionIntent.session.agent_metadata)`
  in the admission-window branch and push it after the pending-contract message.

### P2

- **F-05 History compression discards everything but the last 4 messages and the "summary" is always empty.**
  `history-composer.ts:21-24,66-121`; no v2 writer for `chat_sessions.summary`. Impact: turn 5+ of a
  session loses turns 1–2 except for the 140-char client hint (which is also not rendered when 1–7
  raw messages exist, `:49-60,88-92`). Fix: write a rolling 400-char summary at finalize (worker has
  the assistant text) or raise the tail to 6 and always render the continuity hint.
- **F-06 F10 duplication still open** (documents 2–3×, UUIDs repeated, global JSON blob of metadata).
  `build-lite-prompt.ts:1683-1705,1811-1822`. Fix per §6 lever 3.
- **F-07 `read_document_section` is unbounded and un-compacted**, so long sections collapse to a
  JSON-string preview (`ontology-reads.ts:1425-1468`, `tool-payload-compaction.ts:625-659,1590-1607`).
  Fix: add a compactor with a content cap (e.g. 5,200 chars) and `content_truncated` + `next_anchor`.
- **F-08 Members rendered as UUID-only refs; names never shown.** `build-lite-prompt.ts:1854-1875`
  with `LightProjectMember` (`context-models.ts:243-253`). Fix: drop from `entity_refs`, add one
  "Members: Name (role)" line in focus_purpose (no emails).
- **F-09 Entity-focus context drops the thing the user is focused on.** `summarizeFocusEntityIndex`
  renders type/id/title/state only (`:1841-1852`); document `content_preview` (loaded, 1,200 chars,
  `context-loader.ts:216-231`) and task descriptions never render; linked entities are unbounded in
  the payload (`:~2746-2845`; RPC no LIMIT). Fix: render description/preview in `focus_purpose`; cap linked entities at fetch (e.g. 12/kind).
- **F-10 UTC/local clock split.** Frame uses local date (`build-lite-prompt.ts:829-837`); PI buckets and
  `days_delta` use UTC days (`context-loader.ts:~1538-1545`; SQL `20260429000002:212-216`); event
  window UTC (`:512-526`). Fix: compute `days_delta`/buckets against the user's zone (loader already resolves it) or pass the zone into the RPC.
- **F-11 Client-supplied continuity hint leaks control-tool names**; `entityResolutionHint` is dead.
  `last-turn-context.ts:559-583` collects every tool name (control tools included since
  `turn-executor.ts:1479-1493` records them); `entity-resolution.ts:150-170` has no renderer. Fix:
  filter `data_accessed` through the existing `NON_ENTITY_REFERENCE_TOOLS` + control-tool set; delete or render the resolution hint.

### P3

- **F-12 Tool-surface override fires on every ordinary project/global pass** because the deferred
  contract makes callable ≠ artifact names (`tool-surface.ts:60-66,74-94,102-117`). ~150–250 tok/pass.
  Fix: exclude `declare_turn_contract` from the comparison when the deferral is the only delta.
- **F-13 `users.timezone` cached without invalidation** (`context-cache.ts:24-26`; trigger table list in `20260830173250`). Fix: add `users` to the trigger set or read timezone at render time from the artifact's session snapshot.
- **F-14 Full context payload merged into `chat_sessions.agent_metadata` and echoed to the browser on every prewarm** (`prewarm/+server.ts:194-211,495-499,540-546`) although the worker path ignores client context. Fix: stop merging the payload for worker-capable clients; keep only the cache key/token.
- **F-15 Timeline/Knowledge-map titles are inline and unmarked** (`build-lite-prompt.ts:681-708,2059-2080`). Fix: wrap those two sections' data lines in a fenced "untrusted source data" block like START HERE.
- **F-16 Global fallback query fan-out** (`context-loader.ts:~2430-2495`): 500 logs across all accessible projects, 500 dated tasks, 200 events, then 8 bundles. Only used when the RPC returns null/error, but its limits are the only bound on very active workspaces.

### Prior-finding status

| Prior item                                                 | Status                                                                                                                                                                                 | Evidence                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Prompt audit F10 (entities 2–3×)                           | **Open** (partial: `project_refs` dropped when PI exists; shadow-due dedupe)                                                                                                           | `build-lite-prompt.ts:1693,1811-1822,1683-1705`                                       |
| Prompt audit Tier 4 (replay grows; `skill_load` re-billed) | **Open**                                                                                                                                                                               | `request-builders.ts:245-297`; no trim in `provider/`; `tool-payload-compaction.ts:8` |
| Prompt audit §3 dynamic itemization                        | Structure unchanged (same 8 dynamic section ids, `types.ts:44-58`)                                                                                                                     | —                                                                                     |
| Investigation rec #8 (task rollups; 44 vs 33)              | **Open; discrepancy root-caused** (paused filter)                                                                                                                                      | `access-port.ts:66-70`, `overview-reads.ts:114-118`, `context-loader.ts:~2110`        |
| tasker/65 WP-4 preload items                               | F10 open, rec #8 open, F5/F6/F7 out of this lane                                                                                                                                       | —                                                                                     |
| tasker/67 turn memory                                      | Exact memo exists and clears at write boundary (`turn-provider.ts:766,1102`) but replays full payloads; no compact turn-memory ledger surfaced to the model beyond saturation messages | `read-memo.ts:58-76`, `context-gathering-ledger.ts:266-297`                           |

---

## 8. What's right

- Invalidation design: transactional row triggers, per-project version, global digest, checked at
  four points, one-time nonce'd prepared prompts, sha-verified snapshots. Sound and race-aware
  (`materialized-context-cache.server.ts:109-119` reloads once on a mid-load bump).
- Trust boundaries: the worker never consumes client context; only the prepared key and an
  explicitly untrusted continuity hint; project context is RPC-only (no RLS widening).
- Loader caps are explicit, priority-sorted, and the RPC `ORDER BY` mirrors the TS sort so RPC and
  fallback paths select the same entities.
- Prompt engineering hygiene: stable static prefix ordering; minute-floored clock; local date
  rendering; deferred contract schema on pass 1; untrusted-marked START HERE, tool results, hint.
- Tool payload compaction is per-tool with measured serialization fitting for web payloads.
- History projection carries exactly the three durable ledgers that matter (loaded skills, pending
  clarification, interrupted tool results) with tight caps and lineage.
- Artifact validation bounds (2 MB artifact / 256 KB history) and immutable turn inputs make every
  prompt reproducible from `chat_turn_input_artifacts`.

---

## 9. Open questions needing live data

1. Prepared-prompt hit rate and miss-reason distribution (`chat_turn_runs.prepared_prompt_miss_reason`): how often does `stale_context` vs `consumed` vs `expired` fire after a write turn?
2. Per-pass prompt growth on the current worker path (post tasker/65 WP-3): from `chat_prompt_snapshots`, median tokens of `tool` messages on pass 2/3/4 and how many turns exceed 3 passes.
3. Do persisted `last_turn_context.data_accessed` rows contain control-tool names in production (confirms F-11)?
4. Share of turns using `compressed_history` (`chat_turn_runs.history_strategy`) — how many users hit the 4-message tail.
5. Frequency of the tool-surface override message in prompt snapshots (confirms F-12 cost).
6. Distribution of `read_document_section` serialized sizes >6,000 chars (F-07 blast radius).
7. Whether the daily-brief chat surface (`DashboardInboxModal.svelte:584-587`) sees real traffic; if so F-03 is user-visible today.
8. Global-context load time and RPC null/error fallback rate (`context_load_source`), given the 500-row log scan.

<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md -->

# Agentic Chat Search — Audit, Changes & Findings

| Attribute   | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Date        | 2026-06-17                                                                       |
| Trigger     | "Is agentic-chat search actually working? Is it keyword or vector? Add logging." |
| Entry point | `apps/web/src/lib/components/agent/AgentChatModal.svelte` (traced to backend)    |
| Status      | Changes shipped + migrations applied & live-verified. Follow-ups open (see §5).  |

> Scope: the search the **agent** runs from chat (tool calls), traced from the chat
> modal down to the SQL. Not the marketing/site search.

---

## 1. TL;DR

- **Search is keyword-based, not vector/semantic.** pgvector infrastructure exists in the DB but is **unused** by agentic chat.
- There are **two search families**: a good ranked path (FTS + trigram) and a weak per-entity `ILIKE` path. The good one is the default; the weak one was brittle and is still reachable.
- We **hardened the weak path**, **funneled the agent to the good path**, **added search telemetry**, and **fixed a latent gap** where document bodies weren't indexed from their canonical column.
- The remaining work is mostly **cleanup + a data-driven decision** (see §5), best made _with_ the new telemetry.

---

## 2. How search actually works

### 2.1 Not vector search

Despite pgvector infra (`embedding vector(1536)` columns, a `search_similar_items` RPC, profile embeddings), **none of it is wired into agentic chat**. All matching is lexical: Postgres full-text (`tsvector`) + trigram (`pg_trgm`). This is the single most common misconception about this system — write it down.

### 2.2 Family A — the "smart" path (good) ✅

Tools: `search_all_projects` (broad), `search_project` (scoped), `search_ontology` (compat alias).

Flow: tool → `POST /api/onto/search` → `onto_search_entities` RPC.

- `websearch_to_tsquery('english', …)` over a weighted `search_vector` (document search is now title=A, content=B, jsonb props=C after §3.4).
- Trigram similarity fallback (typos / partial words), blended scoring (`ts_rank` ~0.65–0.7 + `similarity` ~0.3–0.35).
- `ts_headline` snippets; merges task-bucket + calendar-event matches; re-ranks; caps results.
- GIN indexes on both the tsvector and trigram columns.
- **The gateway preloads the right one by context** (`global_basic` → `search_all_projects`, `project_basic` → `search_project`), so the smart path is the default. `global_basic` does not preload `search_project`.

### 2.3 Family B — the per-entity "keyword" path (weak) ⚠️

Tools: `search_onto_tasks` / `_projects` / `_documents` / `_goals` / `_plans` / `_milestones` / `_risks`.

Raw `ILIKE '%term%'`, no ranking, no stemming, ordered by `updated_at`. Discoverable via `tool_search`. These were the brittle ones (see §3).

### 2.4 Key source files

| Concern                 | File                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Tool definitions        | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`                |
| Executors (search impl) | `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`         |
| Smart search API        | `apps/web/src/routes/api/onto/search/+server.ts`                                                |
| Search RPC              | `supabase/migrations/20260428000014_agentic_buildos_search_phase1.sql` (`onto_search_entities`) |
| Tool exposure / preload | `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`                          |
| Execution logging       | `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts` (`logToolExecution`)       |
| Search telemetry helper | `apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.ts`                         |

---

## 3. What was shipped (2026-06-17)

### 3.1 Search telemetry (new, queryable)

- Migration `20260617000000_search_tool_telemetry.sql`: adds `result_count` + `zero_result` to `chat_tool_executions` (NULL for non-search tools), plus a partial index `idx_chat_tool_executions_search_telemetry`.
- `ChatToolExecutor.logToolExecution` populates them via `extractSearchResultCount()` and emits a `[ChatToolExecutor] search executed` log line (query, scope, count, zero-result, latency).
- **Why:** previously result counts were buried in a per-tool-shaped `result` blob, so "what % of searches return nothing?" — the #1 search-failure signal — was not queryable. A zero-result search caused by a brittle matcher looked identical to a legitimately empty one.

> **⚠️ Addendum 2026-06-19 — the populate code was on a dead path.** §3.1 added population to
> `ChatToolExecutor.logToolExecution`, but the production **agentic-chat-v2** path constructs that
> executor with `logExecutions: false` and persists tool rows through its own
> `buildToolExecutionInsertRows` (`stream/+server.ts`), which never set the columns. Result:
> **0 populated rows across the entire table**, even with 200+ recorded search calls — not a
> deploy lag, a wiring bug. §4's verification confirmed the columns _exist_, never that the live
> path _writes_ them. **Fixed 2026-06-19:** population moved onto the live persistence path via a
> shared `searchTelemetryColumns()` helper (used by both writers, regression-guarded), plus a
> dev-only `[search] agent search executed` log line. See
> `AGENTIC_CHAT_SEARCH_SMOKE_TEST_2026-06-19.md` for the manual run that collects real data.

### 3.2 Family B hardening (`ontology-read-executor.ts`)

- New `applyKeywordSearch` / `matchesKeywordSearch` / `tokenizeForKeywordSearch` helpers.
- Plain multi-word queries now match **in any word order** — every significant token must appear in some field (AND across tokens via chained `.or()`, OR across fields), stopwords dropped. Explicit `OR`/`|` keeps OR semantics.
- `search_onto_documents` now matches **title + description + body `content`** (was title-only).
- `search_onto_projects` in-memory match uses the same tokenized logic.

### 3.3 Funnel the agent to the smart path

- Reworded all seven Family B tool descriptions in `definitions/ontology-read.ts` to "prefer `search_project` / `search_all_projects`," so discovery rounds don't surface the brittle tools.

### 3.4 Document FTS fix (latent gap in the _preferred_ path)

- Migration `20260617010000_onto_documents_search_vector_content.sql`: rebuilds `onto_documents.search_vector` to index the canonical `content` column directly — `title(A) / content(B) / props(C)` — matching the projects/risks pattern.
- **Why:** the body lives in `onto_documents.content`, but the `search_vector` only indexed `title` + `props`, so the smart path found document bodies **only** via the legacy `props.body_markdown` mirror (writes still dual-write both). The day that mirror is dropped, body search would silently break.
- Strict superset of prior coverage. **Caveat:** changing a generated column requires DROP + re-ADD → rewrites `onto_documents` (ACCESS EXCLUSIVE lock). Fine at current scale; run during low-traffic if the table ever gets large.

### 3.5 Tests

- `search-telemetry.test.ts` — `extractSearchResultCount` across tool shapes.
- `ontology-read-executor.search.test.ts` — multi-word AND, single-word, explicit-OR, document fields.
- `ontology-read-executor.search-url.test.ts` — **the decisive one**: runs `applyKeywordSearch` against a **real postgrest-js builder** and asserts chained `.or()` produces N separate `or=(...)` params, which PostgREST AND-combines. Confirms the multi-word fix is correct, not just emitted.

---

## 4. Verification (migrations applied 2026-06-17/19)

| Check                                                     | Result                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `chat_tool_executions.result_count` + `zero_result` exist | ✅ confirmed via live REST query                                  |
| `onto_documents.search_vector` indexes `content`          | ✅ matched a real document's body word inside its stored tsvector |
| Generated types match (no `gen:types` clobber)            | ✅ hand-edits intact                                              |
| 15 search/telemetry tests                                 | ✅ pass                                                           |
| `@buildos/web` typecheck                                  | ✅ clean                                                          |

### Useful telemetry queries

```sql
-- Zero-result rate by search tool (populates as new chats run)
select tool_name, count(*) as searches, avg(zero_result::int) as zero_rate
from chat_tool_executions
where result_count is not null
group by 1 order by zero_rate desc;

-- Which search tools the agent actually picks (drives the §5.2 deprecation decision)
select tool_name, count(*) from chat_tool_executions
where result_count is not null group by 1 order by 2 desc;

-- Slowest searches
select tool_name, arguments->>'query' as query, execution_time_ms, result_count
from chat_tool_executions
where result_count is not null
order by execution_time_ms desc limit 50;
```

---

## 5. Findings, recommendations & things to know

Ranked by practical impact. Confidence noted per item.

### 5.1 `main` has a large pile of mixed uncommitted changes — **act soon** (high confidence)

At audit time the working tree on `main` had ~25+ modified files unrelated to this work (`entity-mention-notification.service.ts`, `tracked-in-app-notification.service.ts`, `update-value-validation.ts`, several docs, `blog-context.json`) plus staged `agent-work` migrations, all alongside the search changes. Easy to commit together or lose. **Recommendation:** separate the search work onto its own branch and commit distinctly.

### 5.2 The two search families should eventually collapse to one (medium confidence — it's the spec's own plan)

Rewording funnels the agent toward the smart tools, but the seven `search_onto_*` tools still exist and are discoverable. `docs/specs/AGENTIC_BUILDOS_SEARCH_SPEC.md` → "Migration Notes" says to move away from fragmented legacy paths. **Recommendation:** use the new telemetry (§4) to watch which tools the agent picks and their zero-result rates for a few weeks, then delete the losers. Don't decide now — decide with data.

### 5.3 Every _global_ per-entity search makes 3 round-trips (high confidence)

A global `search_onto_*` call does: actor-id RPC → full `fetchProjectSummaries` load (to build the project-scope `IN` list) → the actual query. No caching, so multiple searches in one turn re-fetch all summaries each time. The smart `/api/onto/search` path does scoping in SQL in one shot. **Recommendation:** if Family B survives §5.2, cache the readable-project-id list per request/turn. Another reason the smart path wins.

### 5.4 pgvector infra exists but is dead (high confidence)

`embedding` columns + `search_similar_items` RPC are present and unused by chat. **Recommendation:** either wire it up (the spec's "future semantic path") or treat as cleanup debt and document it — right now it's a trap for anyone who assumes search is semantic.

### 5.5 Document _body_ search has no fuzzy/typo tolerance (medium confidence)

After §3.4, the smart path matches bodies via FTS (stemmed tokens), but the RPC only does trigram similarity on `title`/`description`, not `content`. Trigram-on-body was deliberately skipped (slow over large text; similarity of a short query vs. a long body ≈ 0). **Net:** a typo in a word that appears only in a doc body won't match. Acceptable; just know it.

### 5.6 Document body is stored twice (low-stakes cleanup)

Writes dual-write `content` (canonical) and `props.body_markdown` (legacy mirror); §3.4 indexes both.
**Recommendation:** audit who still reads `props.body_markdown`; once nothing does, drop the mirror
to de-bloat the row and the tsvector. Before dropping it, update the document branch of
`onto_search_entities` so `ts_headline` snippets include canonical `content` directly; today the
snippet expression still uses `title + description + props`, so snippet quality depends on the
mirror. Audit first — not done here.

### 5.7 Family B keyword path has no stemming (low, inherent)

`ILIKE '%posts%'` won't match "post". Inherent to `ILIKE`; the smart FTS path (which stems) is the funneled default. No fix attempted (avoid hacky singularization).

### 5.8 Chat search test mocks are brittle (low)

Existing tests share one mock query object across all `from()` calls, so `fetchProjectSummaries` pollutes the `.or()` call list — which is why tests assert by filtering for `title.ilike` rather than call count. **Recommendation:** a per-table mock factory would make these less fragile.

### 5.9 You already have rich tool telemetry (opportunity)

`chat_tool_executions` carries `gateway_op`, `help_path`, `requires_user_action`, `turn_run_id`, `stream_run_id`, etc., and there are `ADMIN_MONITORING` docs. With the new `result_count` / `zero_result`, a small search-quality dashboard (zero-result queries, tool-pick distribution, latency) is mostly a query away.

---

## 6. Related docs

- `docs/specs/AGENTIC_BUILDOS_SEARCH_SPEC.md` — forward-looking search spec (has an "Implementation Status (2026-06-17)" block reflecting reality).
- `docs/technical/implementation/ONTOLOGY_SEARCH_TOOL_SPEC.md` — per-entity RPC detail + Progress Log.
- `apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md` — tool → API/table mapping (search section + telemetry note).
- `apps/web/docs/technical/audits/AGENTIC_CHAT_DOMAINS_CAPABILITIES_SKILLS_TOOLS_AUDIT_2026-06-15.md` — routing/discovery audit (why the smart tools are preloaded and Family B is not).

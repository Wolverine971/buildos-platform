<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_EVAL_2026-06-19.md -->

# Agentic Chat Search — Live Run Evaluation & Fix Plan

| Attribute  | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Date       | 2026-06-19                                                                                |
| Source run | Chat session `1ef29ccf-3ea2-4fe7-badd-679cc43e1c73` (user DJ, **global** context)         |
| Export     | `chat-session-audit-search-all-my-projects-for-aurora-field-notes-…`                      |
| Companions | `AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md`, `AGENTIC_CHAT_SEARCH_SMOKE_TEST_2026-06-19.md` |
| Verdict    | **Search infra is healthy. The agent's query _formulation_ is the problem.**              |

> One-line: 7 of 8 searches returned the correct top result; the single miss (rockwool) was the
> agent defeating its own search by stuffing the project name into an FTS query that ANDs terms.
> The index, body-search (§3.4), typo tolerance, and zero-result detection all work.

---

## 1. What happened in the chat

The user seeded a project **Aurora Field Notes** (docs: _Basil Grow Log_ [body: "rockwool cubes…
nutrient film technique"], _Sensor Wiring Notes_ [body: "photoresistor calibration rig… ESP32"],
_Harvest Forecast_ [body: "powdery mildew risk"], plus an auto context doc + a "Field Notes Log";
task: _Order pH calibration solution_), then ran 8 searches **from global context**.

### Per-query results (reconstructed from the export's raw result blobs)

| #   | Query the agent ran           | Tool / family                 | Result                                         | Correct?    | Matched via            |
| --- | ----------------------------- | ----------------------------- | ---------------------------------------------- | ----------- | ---------------------- |
| T1  | `Aurora Field Notes`          | `search_all_projects` / smart | project + 2 docs (top 1.0)                     | ✅          | FTS                    |
| T2  | `Aurora Field Notes rockwool` | `search_all_projects` / smart | 2 project-name docs; **missed Basil Grow Log** | ❌ **miss** | trigram fallback only  |
| T3  | `photoresistor calibration`   | smart                         | Sensor Wiring Notes (0.48)                     | ✅          | FTS                    |
| T4  | `calibration wiring sensor`   | smart                         | Sensor Wiring Notes top (0.80) + 8 noise       | ✅          | FTS any-order ✓        |
| T5  | `powdry mildew` (typo)        | smart                         | Harvest Forecast (0.072)                       | ✅          | **trigram only**       |
| T6  | `quantum entanglement`        | smart                         | 0 → "want me to create it?"                    | ✅          | true empty             |
| T7  | `pH` (legacy-tool bait)       | `search_all_projects` / smart | the pH task (0.43)                             | ✅          | **did NOT use legacy** |
| T8  | `ESP32`                       | smart                         | Sensor Wiring Notes (0.21)                     | ✅          | FTS                    |

Tool calls: **8× `search_all_projects`, 3× `tool_search`, 3× `get_onto_document_details`, 1× `tool_schema`** (15 total). 31 LLM calls, 328K tokens, $0.023, flagged "high LLM pass count."

The user-visible cost of T2: the agent replied _"The search didn't surface a standalone 'rockwool'
document"_ — a flat miss on a doc that is sitting in the project, fully indexed.

---

## 2. Findings

### F1 — The rockwool miss is agent query-stuffing, not a search bug (root cause) 🎯

Proven against the live index:

- _Basil Grow Log_ exists; body contains "rockwool"; **its `search_vector` contains the `rockwool`
  lexeme** → the §3.4 body-indexing fix works.
- `rockwool` (bare) via FTS → **finds Basil Grow Log** ✅
- `Aurora Field Notes rockwool` via FTS → **0 results** ❌ — `websearch_to_tsquery` **ANDs** terms;
  the Basil doc has _rockwool_ but none of _aurora/field/notes_, so it can't satisfy the AND. T2's
  two returned docs came from the trigram **title**-similarity fallback, and Basil's title didn't
  clear the cutoff.

**The agent scopes by stuffing the project name into the query text.** That poisons FTS. It never
used the scoped `search_project` tool, even for "In Aurora Field Notes, find…".

### F2 — Global context has no cheap way to scope (the "are we asking too much?" answer)

- `global_basic` preloads `search_onto_projects` + `search_all_projects` (broad) — **not**
  `search_project` (scoped). (`gateway-surface.ts`)
- `search_all_projects` has **no `project_id` filter** — only `query`/`types`/`limit`.
- So scoping from global context requires the agent to (a) resolve the project name → id **and**
  (b) burn a `tool_search` round to find `search_project`. That _is_ asking too much.
- **But** the executor already routes both tools through one path
  (`POST /api/onto/search { query, project_id, scope }`); `search_all_projects` just hard-sets
  `scope='workspace'`. The backend scoping machinery already exists — only the tool schema withholds it.

### F3 — Funnel to the smart family is 100%; legacy tools are dead weight

8/8 smart, **0 legacy**, even under the T7 tasks bait. With prod telemetry showing
`search_onto_goals/plans/milestones/risks` at **0 calls ever**, this is strong evidence for the
audit's §5.2: the legacy `search_onto_*` tools are chat-deprecation-ready. That does **not** mean
they are safe to delete from the shared registry, because the zero-use evidence is chat telemetry
only and the external BuildOS Agent API also exposes these ops; see §3.1.

> **⚠️ Don't confuse "Searched tools" in the UI with legacy entity search.** The system has
> **two unrelated kinds of "search,"** both labelled "search" in the chat UI:
>
> | UI label                                     | Tool                                     | What it searches                                                   |
> | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
> | "Searched project" / "Searched all projects" | `search_all_projects` / `search_project` | your **data** (smart entity search)                                |
> | **"Searched tools"**                         | **`tool_search`**                        | the **tool catalog** (gateway discovery — "which tool do I need?") |
> | **"Loaded tool schema"**                     | **`tool_schema`**                        | (loads a tool's JSON schema so it can be called)                   |
> | "Loaded document"                            | `get_onto_document_details`              | (reads a doc body)                                                 |
>
> `tool_search` / `tool_schema` are the **gateway discovery layer** (searching the menu of available
> tools), NOT the legacy `search_onto_*` **entity** tools (Family B, which search your content). The
> run used **zero** `search_onto_*` calls. The "Searched tools" lines a user sees are F5 (discovery
> overhead), not entity search. Mapping source: `agent-chat-session.ts:442` (`restoredToolAction`).

### F4 — Telemetry is now populated; the export snapshot is stale

The raw export rows have `result_count: null`, but the live `chat_tool_executions` rows for this
same session now have populated search telemetry:
`3, 2, 2, 9, 1, 0, 1, 1`, with only `quantum entanglement` marked `zero_result=true`.

So the live-path populate fix is loaded for this session. Treat the export JSON as a stale snapshot,
not current telemetry truth. Future exports should be re-run after the dev server is restarted on the
telemetry fix.

### F5 — Discovery overhead is high (and user-visible)

7 of 15 tool calls were discovery/detail. The agent burned 3 `tool_search` rounds re-finding
`get_onto_document_details` to read doc bodies. That read tool is a preload candidate for global context.

This shows up directly in the chat UI as a cluster like:

```
🔧 Searched project: "calibration wiring sensor"   ← search_all_projects (entity search)
🔧 Loaded tool schema: "onto.document.read"        ← tool_schema   (discovery)
🔧 Searched tools: "read document content"         ← tool_search   (discovery)
🔧 Loaded document: "Sensor Wiring Notes"          ← get_onto_document_details
```

Two of those four lines are pure plumbing: in **global** context the doc-read tool isn't preloaded,
so the agent must discover + load its schema before it can read one document. Fix #5 (preload the
doc-read tool for global context) removes both discovery lines.

### F6 — Correct low-score matches need watching

T5 (0.072) was correct but rode the trigram fallback at a low score. T8 (`ESP32`, 0.21) was also
low-scoring, but direct `search_vector` verification shows it is FTS-backed, not trigram-only. Fine
at 5 docs; at real corpus size, low-score hits and T4's 8-result noise tail are worth watching, not
urgent tuning.

### F7 — Document snippets still depend on the legacy body mirror

The §3.4 body-indexing fix makes `onto_documents.search_vector` index canonical `content`, but the
document branch of `onto_search_entities` still builds `ts_headline` snippets from
`title + description + props`, not `content`. Because writes still mirror body text into
`props.body_markdown`, snippets look correct today. Before dropping that mirror, update the snippet
expression to include `content`.

---

## 3. What we're fixing (ranked)

| #   | Fix                                                                                                                          | Type                   | Why                                                                | Status                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | **Verify telemetry populates** (load + re-run, confirm `result_count`/`zero_result`)                                         | ops                    | F4 — needed before measurement                                     | ✅ live rows populated for this session                |
| 2   | **Stop the agent stuffing the project name into FTS queries** — guidance to search distinctive tokens; explain AND semantics | prompt                 | F1 — the actual root cause of the only miss                        | ✅ guidance added to `search_all_projects` description |
| 3   | **Add optional `project_id` to `search_all_projects`** so the preloaded global tool can scope without a discovery round      | tool schema + executor | F2 — gives "search within this one project" with zero extra tools  | ✅ schema + executor + tests                           |
| 4   | **Deprecate legacy `search_onto_*` tools** (start with the 0-usage goals/plans/milestones/risks)                             | cleanup                | F3 — audit §5.2, evidence now strong                               | ⏸️ **deferred** — see §3.1 below                       |
| 5   | **Preload `get_onto_document_details`** in global context                                                                    | gateway-surface        | F5 — kills the observed discovery rounds for short/no-heading docs | ✅ added to `global_basic` + selector test             |
| 6   | **Update document search snippets to include canonical `content`** before dropping `props.body_markdown`                     | SQL cleanup            | F7 — snippets still rely on the legacy mirror                      | ✅ migration `20260619120000` written (pending apply)  |

Not doing (yet): trigram-on-body, score-floor tuning (F6) — revisit with real-corpus telemetry.

### 3.1 Why step 4 (deprecation) was deferred — architectural coupling

Removing the four `search_onto_*` tools is **not** chat-local. Two facts make it a public-API change:

- The chat tool registry is built from `CHAT_TOOL_DEFINITIONS`, and the **external BuildOS Agent API**
  gateway (`external-tool-gateway.ts`) resolves its ops through that **same registry**. Its read-ops
  contract (`BUILDOS_AGENT_READ_OPS` in `@buildos/shared-types`) intentionally exposes these tools.
  Removing the definitions silently drops them from the external agent API — and the "zero-use"
  evidence is **chat telemetry only**.
- Chat's `tool_search` discovery (`searchToolRegistry`) searches the **full registry with no context
  filter**. So removing the tools only from `TOOL_GROUPS` would _not_ hide them from chat discovery;
  the only lever that hides them from chat is removing the definitions — which is the very thing that
  breaks the external API.

**Decision (2026-06-19):** defer. The funnel rewording + new query guidance already keep the agent
off these tools (0 use in the live run). Revisit only if telemetry shows the agent still picking them.
If we do act, the clean option is a chat-only "hidden from discovery" flag that `searchToolRegistry`
respects but the external gateway ignores — not a registry deletion.

---

## 4. The key reframe

The SQL/index layer built on 2026-06-17 (FTS + trigram + §3.4 body indexing) is **working
correctly** — verified directly against the live index. The leverage now is mostly in **how the
agent forms and scopes its queries**, plus tool-surface cleanup that removes unnecessary discovery
rounds.

---

## 5. Appendix — verification commands used

- Live index proof: `onto_documents` where `search_vector @@ websearch_to_tsquery` for `rockwool`
  vs `Aurora Field Notes rockwool` (1 doc vs 0 docs).
- Telemetry state: the raw export has `result_count: null`, but live `chat_tool_executions` rows for
  the same session now have populated `result_count` / `zero_result`.
- Tool sequence + result blobs: `raw/tool_executions.json` from the export.

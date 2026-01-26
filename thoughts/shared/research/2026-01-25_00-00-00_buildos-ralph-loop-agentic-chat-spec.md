<!-- thoughts/shared/research/2026-01-25_00-00-00_buildos-ralph-loop-agentic-chat-spec.md -->
# BuildOS Homework (Long-Running Tasks) — System Spec

---
title: "BuildOS Homework (Long-Running Tasks) — System Spec"
date: 2026-01-25T00:00:00Z
author: "Codex CLI (GPT-5.2)"
type: "spec"
tags: ["buildos", "agentic-chat", "long-running", "homework", "worker", "queue", "autonomy"]
status: "draft"
---

## Executive Summary

You already have a solid *request-level* agentic loop in BuildOS (planner streaming → tool calls → tool results → optional plan creation/execution → response). What’s missing to replicate **Ralph Loop** behavior is a **run-level controller** that:

1. **Intercepts “I’m done”** and decides whether the system should **continue iterating**.
2. **Persists run state** across iterations (and across broken connections / restarts).
3. **Self-corrects** (retry/repair/replan) when a plan/tool/executor fails, rather than immediately “waiting on user”.
4. Implements **circuit breakers** to prevent infinite loops and to halt on “no progress”.

This spec proposes an opt-in **server-side background flow** called **BuildOS Homework** (UI) / **Long-Running Task** (UI). Internally, you can keep calling it **Ralph Mode**, but the product surface should not.

**Non-negotiable requirements from you:**
- Runs **entirely server-side** and can outlive the UI tab.
- Is **triggered via the existing worker/queue system** (Supabase `queue_jobs` + `apps/worker`), not via the chat SSE loop.
- Sends a **completion notification** with a deep link to a **run report page**.
- Tracks **duration**, **iteration count**, and **token + cost** for the run.
- Maintains a **research workspace** (tree + scratchpad) that is visible while running and queryable later.

---

## 1. Current BuildOS Agentic Chat (What Exists)

### 1.1 Request-level orchestration

**Entry points**
- API: `apps/web/src/routes/api/agent/stream/+server.ts`
- Stream lifecycle: `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
- Orchestration: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`

**Existing loop**
- `AgentChatOrchestrator.runPlannerLoop()` loops within a single request until the LLM stops producing tool calls.
- A “virtual” meta tool exists: `agent_create_plan` (see `PLAN_TOOL_DEFINITION`).
- Plan execution uses `PlanOrchestrator.executePlan()` to execute steps, including executor fan-out.

**Key limitation:** when the planner stops calling tools, the request ends. There is no reliable “stop hook” that can force additional iterations when the system isn’t actually finished.

### 1.2 Plan execution

**Plan lifecycle**
- Create plan: `PlanOrchestrator.createPlanFromIntent()`
- Execute plan: `PlanOrchestrator.executePlan()` (topological groups, step statuses)
- Step execution: `PlanOrchestrator.executeStep()` (tools directly or executor agents)

**Key limitation:** if a plan step fails, the plan can fail and the overall run typically stops (no autonomous repair loop).

### 1.3 Executor execution

Executors already run their own “LLM → tools → results” loop:
- `apps/web/src/lib/services/agent-executor-service.ts` (`executeWithContext()`)

**Key limitation:** executor loop is bounded (time + tool call count), but failure does not automatically trigger a repair/retry strategy at the run level.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. **Run-until-done:** The system keeps working until the objective is complete, without requiring the user to repeatedly “continue”.
2. **Stop-hook behavior:** The platform, not the model, is the final authority on whether to stop.
3. **Persistence:** A run can survive:
   - multiple internal iterations
   - transient tool failures
   - client disconnects / SSE reconnects
   - server restarts (optional but strongly recommended)
4. **Self-correction:** When an execution attempt fails, the system tries again with a revised approach, within safety limits.
5. **Safety & control:** Provide cancellation, bounded budgets, and circuit breakers.
6. **Observability:** Every iteration has traceable events + a “why we continued/stopped” explanation.
7. **Research workspace:** Every run produces a structured, queryable tree of research docs plus a scratchpad.

### 2.2 Non-goals (for MVP)

- Perfect automatic completion detection for every possible objective (we’ll use explicit signals + reasonable heuristics).
- Fully autonomous write access without user permission (this is a product decision; spec supports multiple modes).
- General-purpose “coding agent” that edits your repo like Claude Code (BuildOS tools are ontology + external; file I/O isn’t core here).

---

## 3. Proposed System: BuildOS Homework (Long-Running Tasks)

### 3.1 High-level architecture

```
User (Web UI) ──▶ POST /api/homework/runs
                    │
                    ├─ create HomeworkRun + (optional) dedicated chat_session
                    ├─ persist objective + scope + budgets
                    └─ enqueue queue_jobs(job_type="buildos_homework", run_id=...)
                                           │
                                           ▼
                               Worker (apps/worker) claims job
                                           │
                                           ├─ run one iteration
                                           ├─ persist iteration summary/events
                                           ├─ update run metrics (iterations, time, tokens, cost)
                                           ├─ if continue: enqueue next iteration job (same run_id)
                                           └─ if complete: write final report + notify user
```

**Key addition:** a durable loop *above* the existing “planner stops calling tools” boundary, implemented as **a sequence of worker jobs** until completion/cancel/timeout.

### 3.2 New concept: `HomeworkRun` (a.k.a. Long-Running Task)

A `HomeworkRun` is a durable unit of work representing: **“complete this objective while I’m away”**.

**It may span:**
- multiple planner tool-calling loops
- multiple plans
- multiple executor runs

It ends only when:
- completion criteria met, OR
- user cancels, OR
- circuit breaker / budget triggers, OR
- user input is required and the run is configured to pause.

### 3.3 Run state machine

```
IDLE
  └─ start_run → QUEUED
QUEUED
  └─ worker claims job → RUNNING
RUNNING
  ├─ objective complete → COMPLETED
  ├─ needs user input → WAITING_ON_USER
  ├─ budget/circuit breaker → STOPPED
  └─ cancel → CANCELED
WAITING_ON_USER
  ├─ user responds → RUNNING
  └─ cancel → CANCELED
STOPPED
  └─ user resumes (optional) → RUNNING
```

### 3.4 Iteration model (Ralph-style)

Each iteration:
1. Loads `RunState` + last iteration artifacts (plans, tool results, errors).
2. Produces the *next best action*:
   - create/repair plan
   - execute next plan steps
   - run a diagnostic tool read
   - ask user for missing info (pause)
3. Emits events.
4. Updates `RunState`.
5. Evaluates exit gate → continue or stop.

### 3.5 Worker loop model (queue-native)

To keep runs resilient and observable, prefer **one iteration per job**:

- Worker processes `buildos_homework` job for `run_id`.
- Executes up to one bounded iteration (time + tool calls).
- Persists iteration outputs.
- If not done, enqueues the *next* `buildos_homework` job for the same `run_id` (dedup key: `${run_id}:${next_iteration}`).

Benefits:
- Survives worker restarts/crashes (the next job is still pending).
- Avoids a single “mega job” hogging the worker.
- Natural place to implement circuit breakers and backoff.

### 3.6 Execution engine choices (how the worker actually “does the work”)

This is the biggest architectural decision because today the full agentic toolchain lives in `apps/web/src/...` (SvelteKit-land), while the worker is a separate Node service.

You have three viable options:

#### Option A — Extract a shared “Homework Engine” package (recommended)

Create a new workspace package (example): `packages/homework-engine` that contains:
- the run controller (loop + stop hook + circuit breakers)
- the planner/executor orchestration (ported from `apps/web/src/lib/services/agentic-chat/...`)
- tool execution adapters that only depend on:
  - `@buildos/shared-types`
  - `@buildos/supabase-client`
  - `fetch`

Then:
- Web uses it for interactive agentic chat (thin wrapper).
- Worker uses it for Homework runs (headless wrapper).

Pros: single source of truth; best long-term.
Cons: requires refactoring imports (`$lib`, `$app/environment`, path aliases).

#### Option B — Worker drives the loop, but delegates each iteration to a Web “runner” endpoint

- Worker still owns *durability* (queue-based loop).
- Each job calls an internal web API endpoint like:
  - `POST /api/homework/runs/{id}/iterate`
  - which executes exactly one bounded iteration and returns structured outputs.

Pros: minimal refactor; reuses existing toolchain as-is.
Cons: web must be able to execute iterations reliably (hosting/timeouts); harder to scale.

#### Option C — Implement a simplified Homework-only tool set in the worker

- Worker uses its own LLM calls and directly manipulates Supabase (no “tool calling” abstraction).
- Good if Homework scope is initially narrow (e.g., “create/update ontology entities” only).

Pros: fastest if limited scope.
Cons: duplication; diverges from agentic chat tooling.

#### Option D — Worker-native Homework Engine (recommended)

- Build a dedicated engine under `apps/worker/src/services/homework-engine/` with the same architecture as `AgentChatOrchestrator` (planner → tools → results → plan → executors), but **headless** and **worker-first**.
- Reuse shared types + tool definitions, but avoid SvelteKit-only dependencies (`$env`, `$app/environment`) by injecting config and services.
- Keep it separate from the web chat runtime; parity is architectural, not code-shared.

Pros: clean worker integration; avoids web runtime timeouts; full control over budgets/loops.
Cons: more engineering than Option B; needs careful parity tests.

**Recommendation:** Option D as the durable end-state. Option B is acceptable only for a short MVP.

---

## 4. State Persistence + Reporting

### 4.1 Minimal schema (recommended)

Create new tables (names illustrative):

#### `homework_runs`
- `id` (uuid)
- `chat_session_id` (optional but recommended; used for LLM cost aggregation)
- `user_id`
- `objective` (string)
- `scope` (`global | project | multi_project`)  // controls context + write targets
- `project_ids` (uuid[], nullable)               // for project/multi-project runs
- `status` (`queued | running | waiting_on_user | completed | stopped | canceled | failed`)
- `iteration` (int)
- `max_iterations` (int, nullable)
- `started_at`, `updated_at`, `completed_at`
- `duration_ms` (int, nullable; computed on completion)
- `budgets` (jsonb: time/token/cost/tool calls)
- `metrics` (jsonb: tokens_total, cost_total_usd, tool_calls_total, etc.)
- `stop_reason` (jsonb: enum + details)
- `completion_criteria` (jsonb; optional)
- `last_error_fingerprint` (string; for repeated-error breaker)
- `report` (jsonb or text; final “what happened” narrative + created/updated entities)
- `workspace_document_id` (uuid, nullable)       // root document for research tree
- `workspace_project_id` (uuid, nullable)        // per-user workspace project (for global scope)

#### `homework_run_iterations`
- `run_id`
- `iteration` (int)
- `branch_id` (string, nullable)  // optional for parallel executor branches
- `started_at`, `ended_at`
- `summary` (text)
- `status` (`success | failed | waiting_on_user`)
- `progress_delta` (jsonb; optional)
- `error` (text; optional)
- `error_fingerprint` (string; optional)
- `metrics` (jsonb: tokens, cost, tool_calls)
- `artifacts` (jsonb: plan_id(s), entity ids created/updated, etc.)

#### `homework_run_events` (optional but valuable)
- `run_id`
- `iteration`
- `seq` (monotonic)
- `event` (jsonb)  ← store the same event payloads you would stream
- `created_at`

This enables replay on the run page and makes “Ralph persistence” real (analogous to `.claude/ralph-loop.local.md` + file system artifacts).

### 4.3 Research Workspace (Tree + Scratchpad)

Every Homework run should maintain a **workspace** of documents that:
- are hierarchical (tree structure for rabbit holes),
- are queryable (search, tags, path, run_id),
- are visible while the run is active,
- persist as part of the user’s knowledge base.

**Recommendation: use `onto_documents` + graph edges** (no new table needed).

Create a **root workspace document** for each run:
- `type_key`: `document.homework.workspace`
- `state_key`: `workspace`
- `props.homework = { run_id, scope, created_by: "homework_engine" }`
- `workspace_document_id` saved on `homework_runs`

Create **child documents** for branches, notes, summaries, and scratchpad:
- `type_key` examples:
  - `document.homework.scratchpad`
  - `document.homework.branch`
  - `document.homework.note`
  - `document.homework.summary`
  - `document.homework.plan`
- `props.homework = { run_id, iteration, branch_id, path, tags, source }`
- `description` for short summary; `content` for markdown body

Represent the tree using `onto_edges`:
- `rel`: `document_has_document` (or `document_child_of`)
- `src_id` = parent doc, `dst_id` = child doc

**Path convention** (for query + UI):
```
/homework/<run_id>/
  scratchpad.md
  branches/
    <branch_id>/
      topic.md
      findings.md
  iterations/
    001-summary.md
    002-summary.md
```

**Global scope support:** `onto_documents.project_id` is required, so for global or multi-project runs:
- Create or reuse a per-user **Homework Workspace Project**.
- Store its `id` on `workspace_project_id` and attach workspace docs there.

**Queryability requirements:**
- Index `props->>'homework.run_id'` (btree) and `props->'homework'` (GIN).
- Use existing `search_vector` for full-text search over content.

**Scratchpad behavior:**
- Append-only per iteration (bounded by size; roll over into new scratchpad docs if needed).
- Planner reads scratchpad summary each iteration to avoid context bloat.

### 4.1.1 Run report contract (what the user reads)

The run should end with a structured report that can be rendered deterministically, plus a human narrative.

Recommended `homework_runs.report` shape:

```json
{
  "title": "Homework complete: <short title>",
  "objective": "<original objective>",
  "status": "completed|stopped|failed|canceled",
  "summary": "<5-10 sentence narrative>",
  "what_changed": {
    "created": [{ "type": "task|goal|plan|document|...", "id": "uuid", "title": "..." }],
    "updated": [{ "type": "task|goal|plan|document|...", "id": "uuid", "title": "..." }],
    "linked": [{ "from_id": "uuid", "to_id": "uuid", "relationship": "supports|relates_to|..." }]
  },
  "artifacts": {
    "plans": [{ "id": "uuid", "status": "completed|failed|..." }],
    "documents": [{ "id": "uuid", "title": "..." }]
  },
  "metrics": {
    "iterations": 7,
    "duration_ms": 312000,
    "total_tokens": 18423,
    "total_cost_usd": 0.83
  },
  "stopping_reason": { "type": "completed|budget|max_iterations|no_progress|canceled|error", "detail": "..." }
}
```

The narrative can be produced by an LLM summarizer step at the end, but the `what_changed` list should be primarily artifact-derived (tool results + plan steps) so it stays trustworthy.

### 4.1.2 Queue job metadata contract

Add a new metadata type (example):

```ts
type HomeworkJobMetadata = {
  run_id: string;
  iteration: number;
  chat_session_id: string;
  context_type: string;
  entity_id?: string;
  budgets: {
    max_iterations: number;
    max_wall_clock_ms: number;
    max_cost_usd?: number;
    max_total_tokens?: number;
  };
  permissions: {
    write_mode: "autopilot" | "approve_plan" | "per_write";
    allowed_tools?: string[];
  };
};
```

Dedup keys:
- `homework:${run_id}:${iteration}`

Cancellation uses:
- `cancel_jobs_atomic(p_user_id, 'buildos_homework', { "run_id": "<id>" })`

### 4.2 “Lighter” alternative (MVP)

Store run state in `chat_sessions.agent_metadata.homework`:

```json
{
  "homework": {
    "active": true,
    "run_id": "uuid",
    "iteration": 3,
    "max_iterations": 20,
    "objective": "...",
    "budgets": { "max_ms": 600000, "max_tool_calls": 200, "max_cost_usd": 2.50 },
    "last_error_fingerprint": "..."
  }
}
```

This is faster to ship but weaker for observability and reconnect.

---

## 5. Exit Detection (“Stop Hook”) in BuildOS Homework

### 5.1 Dual-gate exit, adapted from Ralph

In Ralph Loop, exit requires both heuristic completion + explicit signal. In BuildOS we can implement:

**Gate A — Explicit signal** (required):
- the model emits a structured status block `BUILDOS_HOMEWORK_STATUS` with `exit_signal: true`.

**Gate B — Evidence of completion** (heuristic):
- all run deliverables satisfied (e.g., plan status `completed`, required entities created/updated, user question answered)
- no pending “next actions” recognized by the planner

**Rule for safety:** require **explicit signal AND evidence**. The only exception is a deterministic artifact-based completion (e.g., plan completed + verification checks).

### 5.2 Proposed status contract

Require the planner (and optionally executors) to include a final machine-parseable block at the end of each iteration:

```yaml
BUILDOS_HOMEWORK_STATUS:
  exit_signal: true|false
  needs_user_input: true|false
  blocking_questions:
    - "..."
  progress_summary: "..."
  remaining_work:
    - "..."
  completion_evidence:
    - "plan_completed"
    - "no_pending_tasks"
  next_action_hint: "replan|execute|ask_user|stop"
  confidence: "low|medium|high"
```

The controller parses this and decides:
- continue
- pause for user
- stop (completed/stopped)

### 5.3 “Stop hook” insertion points

Two practical designs:

**Design 1 (minimal change):** wrap the existing request-level orchestration
- `AgentRunController` invokes `AgentChatOrchestrator.streamConversation()` as an iteration step.
- When `streamConversation()` naturally yields `done`, the controller applies the exit gate.
- If not done, it appends a system message (“Continue; remaining work: …”) and starts a new iteration.

**Design 2 (preferred long-term):** split “planner” into a pure decision step
- Planner returns structured “next action” (plan draft / tool list / question set).
- Controller executes actions deterministically.
- This reduces accidental early-stops caused by LLM “being chatty”.

---

## 6. Circuit Breakers (No Infinite Loops)

### 6.1 Budget limits (hard stops)

At run start:
- `max_iterations` (default 10–25)
- `max_wall_clock_ms` (default **60 minutes** per run)
- `max_total_tokens` or `max_cost_usd` (optional; depends on usage tracking)

If any budget exceeded → finish the **current iteration** and then stop with `status: stopped` + `stop_reason`.

**Wall-clock budget definition:**
- Wall-clock is **elapsed RUNNING time**, not including `WAITING_ON_USER`.
- Reason: if a run pauses for user input, it should not expire just because time passed while idle.
- If you decide Homework should be "best-effort without waiting on user" by default, this only matters when a run truly blocks.

**Default policy (per your direction):**
- **60 minutes max per run**, then stop after the current iteration.
- User must explicitly **Continue** to resume (creates a new job and increments `iteration`).

### 6.2 No-progress detection (soft → hard stop)

Define “progress” as one or more of:
- plan step advanced (`pending → executing → completed`)
- new entities created/updated (ontology writes)
- tool call succeeded that changes state
- reduction in “remaining_work” items

Trigger circuit breaker if:
- **No progress** for N iterations (default 3)
- **Same error fingerprint** for N iterations (default 5)
- **Repeated tool_not_loaded / validation** despite expansion/repair (default 3)

On breaker:
- stop with diagnostics
- optionally auto-switch to a “recovery” iteration: expand tool pool, simplify strategy, or request user input.

---

## 7. Self-Correction & Repair Loops

### 7.1 Tool argument repair

When a tool call fails with `validation_error`:
- Capture the error + expected schema.
- Ask the planner (or a small “repair” model) to propose corrected args.
- Retry within per-tool retry budget (e.g., 2 attempts).

Where to implement:
- `ToolExecutionService.executeTool()` can optionally accept a `repairStrategy` hook.

### 7.2 Plan repair and replan

When plan execution fails:
- Persist failure snapshot (failed step, tool errors, executor errors).
- Run a “repair planning” iteration:
  - update the plan (if supported) or create a new plan linked to the run
  - optionally narrow scope to unblock the failed step first
  - re-execute only the remaining steps

Where to implement:
- add `PlanOrchestrator.repairPlan(...)` (new) OR treat as new plan creation with prior failures included in prompt context.

### 7.3 Tool selection misses

Current behavior: a single “expand tool pool after miss” retry in `AgentChatOrchestrator`.

Ralph-mode improvements:
- allow multiple expansion stages:
  1) heuristic-minimal tools
  2) strategy-selected tools
  3) full tool catalog (already exists as stage 3)
- persist “missed tool names” into RunState and ensure they’re included next iteration.

---

## 8. Tooling / Permissions Model (Human vs Autonomous)

This is a product decision; the loop design must support at least two modes:

### 8.1 `human_in_the_loop` (safe default)
- Reads: autonomous
- Writes: require either:
  - explicit user confirmation per write, OR
  - approval of a plan draft (“Run this plan?”) before execution
- If confirmation is required mid-run → transition to `WAITING_ON_USER`.

### 8.2 `autopilot` (Ralph-like)
- User grants a scoped permission upfront (e.g., “You may create/update tasks/goals in project X for this run”).
- The run proceeds without pausing for confirmation unless risk level increases.
- All writes are logged and revertable (optional).

Implementation hook:
- `AgentRun.budgets/permissions` + prompt section that states the active permission mode clearly.

**Tool policy update (per your direction):**
- No tools are permanently disallowed.
- The engine must enforce the **same access floor as the planner agent** (project membership, RLS, and scoped writes).
- Every write is attributed to the run and linked to the research workspace for auditability.

---

## 9. UX, Notifications, and Deep Links

### 9.1 Separate UI surface (not the chat stream)

Homework should be a **separate flow** from agentic chat streaming:
- Entry: “Homework” / “Long-Running Task” mode in the chat composer (or a dedicated page).
- Execution: background (worker). No SSE required to keep the run alive.
- Viewing: a **run detail page** that shows:
  - status, progress, iteration history
  - what was created/updated
  - final report and artifacts
  - **live cost + token usage** (continually updated)
  - total tokens + total cost + duration
  - **research tree** (workspace documents + branches)

Suggested route:
- `apps/web/src/routes/homework/runs/[id]/+page.svelte`

Recommended additional route:
- `apps/web/src/routes/homework/+page.svelte` (run list: queued/running/completed/failed)

#### 9.1.1 Composer entry (mode selection)

In the agentic chat composer UI:
- Add a mode selector: `Chat` (default) vs `Homework`.
- When `Homework` is selected:
  - show a short explainer (“Runs in the background; you’ll get a notification when it’s done.”)
  - expose budgets (iterations/time/cost) behind an “Advanced” disclosure
  - show permission mode (“Autopilot for this run” vs “Approve plan then run”)
  - on submit: call `POST /api/homework/runs`, then render a “Homework started” card with a link to the run page.

#### 9.1.2 Run detail page UX (what the user sees)

Run detail page sections:
- **Overview:** objective, status, started/ended, duration, iterations
- **Costs (live):** tokens + cost (and optionally model breakdown), updated as usage logs arrive
- **Timeline:** iteration list with summaries + errors + “why we continued”
- **Outputs:** “Created” / “Updated” entity lists (clickable)
- **Research Tree:** expandable tree of workspace documents (scratchpad, branches, summaries)
- **Final report:** the narrative summary + stopping reason
- **Controls:** cancel (if queued/running), resume (if waiting_on_user/stopped), “ask follow-up” (creates a new chat message referencing the run)

Deep links in “Outputs”:
- Tasks: `/projects/{project_id}/tasks/{task_id}` (if project_id known)
- Projects: `/projects/{project_id}`
- Otherwise: link to the best available entity page (or fallback to project page with highlight params).

#### 9.1.3 Live status + modal view

While a run is active:
- Show a persistent **"Homework running"** indicator.
- Clicking opens a **modal** with:
  - current iteration status
  - most recent events/logs
  - current branch being explored
  - a live view of the scratchpad + latest notes
  - **current cost + tokens** (live)

### 9.2 Events (still useful, but persisted)

Even though the run is background, you still want structured events for replay:
- `run_started` { runId, objective, config }
- `iteration_started` { runId, iteration }
- `iteration_completed` { runId, iteration, status, summary, metrics }
- `run_completed` { runId, summary, stopReason, reportRef }
- `run_stopped` { runId, stopReason }
- `run_waiting_on_user` { runId, questions?, reason }

Store them in `homework_run_events` (or equivalent) so the UI can render a timeline and the worker can keep going without a client connection.

### 9.3 Completion notification (required)

When a run reaches `COMPLETED` (or `STOPPED` / `FAILED`), create a **user-visible notification** that deep links to the run report page.

Recommended implementation (in-app, always):
- Insert `user_notifications` with:
  - `user_id`
  - `title`: “Homework complete”
  - `message`: short summary
  - `action_url`: `/homework/runs/{run_id}`
  - `data`: `{ run_id, status, duration_ms, iterations, tokens, cost_usd }`

Optional (push/email/SMS, preference-gated):
- Call `emit_notification_event()` with a new event type (e.g. `homework.completed`) and payload containing `action_url`.

### 9.4 Token + cost tracking (required)

At minimum, Homework must store on the run record:
- `total_tokens`
- `total_cost_usd`
- per-iteration breakdown (optional but strongly recommended)

Recommended correlation strategy:
- Create a dedicated `chat_session_id` per HomeworkRun.
- Ensure all LLM calls made by the worker set `chat_session_id` (so you can aggregate from `llm_usage_logs`).
- The worker updates `homework_runs.metrics` by summing new usage logs (or by accumulating locally using OpenRouter usage + pricing).

**Live cost updates:**
- After each LLM call, update:
  - `homework_runs.metrics.tokens_total`
  - `homework_runs.metrics.cost_total_usd`
  - `homework_runs.metrics.by_model` (optional)
- Emit `iteration_cost_update` events to `homework_run_events` for realtime UI.
- UI should subscribe to `homework_runs` + `homework_run_events` and refresh cost counters without page reload.

### 9.5 Progress viewing (optional but nice)

Two good options:
- **Realtime**: subscribe to `homework_runs` + `homework_run_events` via Supabase Realtime.
- **SSE**: `/api/homework/runs/{id}/stream?since_seq=...` to replay events and tail new ones.

---

## 10. Implementation Plan (Phased)

### API contracts (MVP)

#### `POST /api/homework/runs`

Creates a HomeworkRun and enqueues the first job.

Request:
```json
{
  "objective": "string",
  "context_type": "global|project|task|goal|plan|document|project_create|...",
  "entity_id": "uuid (optional)",
  "budgets": { "max_iterations": 20, "max_wall_clock_ms": 600000, "max_cost_usd": 2.5 },
  "permissions": { "write_mode": "autopilot" }
}
```

Response:
```json
{ "run_id": "uuid", "status": "queued", "url": "/homework/runs/<run_id>" }
```

#### `GET /api/homework/runs/{run_id}`

Returns:
- run status + metrics + report (if available)
- optionally: iterations + events (paged)

#### `POST /api/homework/runs/{run_id}/cancel`

Sets run status to `canceled` and cancels queued jobs for that run.

#### `POST /api/homework/runs/{run_id}/respond` (only when WAITING_ON_USER)

Accepts user answers and enqueues the next iteration.

### Phase 0 — Spec alignment (1–2 days)
- Decide permission model: `human_in_the_loop` vs `autopilot`
- Decide persistence: new tables vs chat_sessions metadata
- Define completion criteria contract (`BUILDOS_HOMEWORK_STATUS`)
- Confirm research workspace model (onto_documents + edges + props)

### Phase 1 — MVP Homework Runs (server-side worker) (3–7 days)
- Add `queue_type` enum value: `buildos_homework`
- Add DB tables: `homework_runs`, `homework_run_iterations` (and optionally `homework_run_events`)
- Add API:
  - `POST /api/homework/runs` (create run + enqueue job)
  - `GET /api/homework/runs/{id}` (fetch status/report)
  - `POST /api/homework/runs/{id}/cancel`
- Worker:
  - add processor `apps/worker/src/workers/homework/homeworkWorker.ts`
  - register it in `apps/worker/src/worker.ts`
  - implement one-iteration-per-job loop with dedup
- Workspace:
  - create `workspace_document_id` root
  - write scratchpad + branch docs to `onto_documents`
  - link docs with `onto_edges`
- Notifications:
  - create `user_notifications` entry on completion/failure
- Metrics:
  - persist duration + iteration count
  - persist token + cost totals (either via `llm_usage_logs` aggregation or local accumulation)

### Phase 2 — Repair loops (5–10 days)
- Tool argument repair for validation errors
- Plan repair / replan after failure
- Persist iteration summaries + stop reasons

### Phase 3 — Full replay + “resume” semantics (optional)
- Add `homework_run_events` if skipped in MVP
- Add `/stream` endpoint for event replay
- Add explicit “resume run” action after WAITING_ON_USER / STOPPED

---

## 11. Gap Analysis (Ralph Loop vs Current BuildOS)

### What matches Ralph today
- Iterative tool-call loop inside a session (`AgentChatOrchestrator.runPlannerLoop()`)
- Persistent artifacts via DB (plans, messages, tool results, agents)
- Some tool miss recovery (expand tool pool)
- Safety bounds (tool call caps in planner/executor)

### Key gaps to close
1. **No run-level state machine** (no `.claude/ralph-loop.local.md` equivalent).
2. **No “stop hook”** that can override the model’s attempt to end.
3. **No explicit completion contract** (status block / exit signal).
4. **No circuit breaker based on progress** (only tool/time limits).
5. **No autonomous repair** (plan/tool failures generally stop the run).
6. **No durable iteration log** for reconnect/debugging (optional but important).
7. **Permission model ambiguity**: prompt says “confirm writes”, but Ralph-like flow wants autonomy.
8. **Parallel runs:** no explicit guidance for concurrent run scheduling and UI.

---

## 12. Decisions (Captured)

1. **Completion promise:** not required; the loop should continue until done using `BUILDOS_HOMEWORK_STATUS` + evidence.
2. **Write permissions:** default to **autopilot** with full write capability within the run scope; no permanently disallowed tools.
3. **Runtime budget:** default **60 minutes**, stop after current iteration; user must explicitly continue.

---

## 13. Implementation Status (2026-01-26)

This section documents the concrete implementation that now exists in the repo so another agent can audit it against the intent.

### 13.1 Core intent (from you)

- **Run-until-done loop** in a worker, not tied to UI sessions.
- **Budget behavior:** default **1 hour**, finish current iteration then stop. User must click **Continue** to resume.
- **Costs tracked live** and visible in the UI while running.
- **Parallel runs** supported; user can run ~3 homework sessions at once.
- **Research workspace** with nested documents, scratchpad, and live visibility.
- **Planner/executor model** with fan‑out and tool execution, looped until completion.
- **Full write capability** within scope (no permanently disallowed tools), but observable in UI.

### 13.2 DB schema + migrations

- **Migration**: `supabase/migrations/20260126_120000_homework_runs.sql` adds:
  - `homework_runs`, `homework_run_iterations`, `homework_run_events`
  - enums `homework_run_status`, `homework_iteration_status`
  - RLS policies and indexes
  - queue type `buildos_homework`
- **FK fix**: `supabase/migrations/20260126_130000_fix_homework_workspace_project_fk.sql`
  - `homework_runs.workspace_project_id` now references `onto_projects(id)` (not `projects`).

### 13.3 Worker loop + engine

**Queue processor**
- `apps/worker/src/worker.ts` registers `buildos_homework`.
- `apps/worker/src/workers/homework/homeworkWorker.ts`:
  - One iteration per job.
  - Updates run status, creates iteration rows, emits events.
  - Stop logic:
    - `waiting_on_user` when planner requests input.
    - `completed` only if `exit_signal` **and** evidence exists.
    - `stopped` on wall‑clock, max iterations, **max cost**, or **max tokens**.
  - Records `iteration_cost_update` events and increments totals.
  - Synthesizes a **run report** on completion/stopped.
  - Sends **user notifications** on completion/stopped.

**Homework engine**
- `apps/worker/src/workers/homework/engine/homeworkEngine.ts`:
  - Ensures `onto_actor`, **workspace project**, **workspace root doc**, and **scratchpad**.
  - Planner prompt returns JSON: status + tool_calls + executor_tasks.
  - Executor fan‑out: runs each task with its own tool_calls.
  - Tool calls are executed directly via Supabase with a **bounded list** (docs + tasks).
  - Tool outputs + iteration summary are appended to scratchpad.
  - Tools auto‑tag `props.homework_run_id` and newly created docs are **linked** into the workspace tree.

### 13.4 Cost + usage tracking

- `apps/worker/src/lib/services/smart-llm-service.ts`
  - Emits usage events for every LLM call.
  - Writes to `llm_usage_logs`.
  - Homework worker increments `homework_runs.metrics`:
    - `tokens_total`, `cost_total_usd`, `by_model`.

### 13.5 API endpoints

- `POST /api/homework/runs`
  - Creates run + chat session.
  - Enforces **max 3 concurrent runs** per user.
  - Queues iteration 1.
- `GET /api/homework/runs/[id]`
  - Returns run, iterations, events.
  - `include_workspace=true` returns workspace docs, edges, scratchpad.
- `POST /api/homework/runs/[id]/respond`
  - Adds user response event.
  - Queues next iteration and resumes run.
- `POST /api/homework/runs/[id]/cancel`
  - Cancels the run.

### 13.6 UI / visibility

- `apps/web/src/routes/homework/+page.svelte`:
  - Lists runs and current status.
- `apps/web/src/routes/homework/runs/[id]/+page.svelte`:
  - Live **cost** + **tokens** display.
  - **Workspace tree** (recursive).
  - **Live View modal** showing scratchpad + recent events.
  - **Continue** button if stopped.
  - **Run report** section once synthesized.

### 13.7 Known constraints (MVP tradeoffs)

- Toolset is currently limited to ontology **projects/documents/tasks**.
- Planner/executor live in worker‑only engine (not yet shared with web agentic system).
- Heuristics for completion are still bounded (exit_signal + evidence).
- No automated retry/repair strategies beyond planner iteration.

### 13.8 2026-01-26 Updates (codex)

- **Access control:** Worker tool calls are now scoped to the user’s accessible projects; unauthorized project ids are rejected.
- **Wait-on-user loop:** Runs can pause, collect user answers from the UI, and resume; answers are injected into the next planner prompt.
- **Budgets/time:** Wall‑clock budget counts running time only; waiting time no longer burns the budget. `running_ms` metric stored.
- **Iteration durability:** Iteration rows are upserted to survive retries; per-iteration metrics store deltas.
- **No-progress breaker:** Stops after 3 no‑progress iterations; stop reasons persisted.
- **Repair loop:** Failed tool calls get an automatic arg-repair pass (LLM) before stopping; artifacts merged.
- **Workspace:** Workspace bootstrap is idempotent; scratchpad always linked; unparented docs created are auto-linked to the workspace when possible.
- **Notifications:** Users are notified on completed, stopped, failed, and canceled states.
- **UI:** Homework list now has a “Start Homework” composer; run page shows waiting-on-user answer box and continue action.
- **Indexes:** Added btree + GIN indexes on `onto_documents/edges` homework props for workspace discoverability.

---

## 14. Open Questions (Remaining)

1. **Product naming:** in the UI do you want “Homework” or “Long-Running Task” (or both with one as subtitle)?
2. **Scope default:** should new runs default to `global`, `project`, or prompt the user?
3. **Workspace placement:** should Homework workspace docs appear in the main project document list, or live in a dedicated per-user “Homework Workspace” project by default?
4. **Notification channels:** in-app only for MVP, or also push/email if enabled?
5. **Token/cost visibility:** should costs be visible to:
   - admins only,
   - the user who ran it,
   - or both?
6. **WAITING_ON_USER behavior:** if the run needs clarification, do we:
   - send a notification with questions and pause, OR
   - attempt “best-effort” and keep going?
7. **Parallelism policy:** limit concurrent runs per user? default 3? queue beyond limit?

---

## 15. Parallel Homework Runs (Multi-Run Support)

**Requirement:** A user can run multiple Homework runs in parallel (e.g., 3 concurrent runs).

**Design considerations:**
- **Queue model:** jobs are independent by `run_id`; dedup keys remain per run+iteration.
- **Worker fairness:** avoid starvation by letting queue process a mix of run_ids.
- **UI:** show a “Running” badge per run in the run list + allow multiple active modals.

**Suggested limits (configurable):**
- `max_concurrent_runs_per_user` (default 3)
- Behavior when exceeded:
  - Option A: queue new runs as `queued` until a slot frees
  - Option B: allow but **reduce tool budgets per run** to protect cost

**Tracking:**
- Add a query that counts active runs per user (`status in queued|running|waiting_on_user`).
- Enforce concurrency in `POST /api/homework/runs` (soft or hard limit).

---

## Appendix A — Concrete “Stop Hook” Pseudocode

```ts
while (run.active) {
  const iteration = run.iteration + 1;
  emit(iteration_started);

  const result = await runOneIteration(run, context);

  persistIteration(result);
  const decision = decideNext(run, result); // exit gate + circuit breaker

  if (decision.type === 'continue') {
    run.iteration = iteration;
    continue;
  }
  if (decision.type === 'wait_for_user') {
    run.status = 'waiting_on_user';
    emit(run_waiting_on_user);
    break;
  }
  if (decision.type === 'complete') {
    run.status = 'completed';
    emit(run_completed);
    break;
  }
  run.status = 'stopped';
  emit(run_stopped);
  break;
}
```

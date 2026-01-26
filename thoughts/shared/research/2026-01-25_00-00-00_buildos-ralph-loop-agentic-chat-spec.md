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

**Recommendation:** Option A for the durable end-state, Option B for a rapid MVP if your web runtime can safely execute 15–30s iterations.

---

## 4. State Persistence + Reporting

### 4.1 Minimal schema (recommended)

Create new tables (names illustrative):

#### `homework_runs`
- `id` (uuid)
- `chat_session_id` (optional but recommended; used for LLM cost aggregation)
- `user_id`
- `objective` (string)
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

#### `homework_run_iterations`
- `run_id`
- `iteration` (int)
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

**Gate A — Explicit signal** (preferred):
- the model emits a structured status block `BUILDOS_LOOP_STATUS` with `exit_signal: true`, OR
- the run controller marks completion based on plan status and requested outputs.

**Gate B — Evidence of completion** (heuristic):
- all run deliverables satisfied (e.g., plan status `completed`, required entities created/updated, user question answered)
- no pending “next actions” recognized by the planner

**Rule for safety:** require at least one explicit signal OR a deterministic artifact-based completion (like plan completed + verification checks).

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
  completion_indicators:
    - "plan_completed"
    - "no_pending_tasks"
  next_action_hint: "replan|execute|ask_user|stop"
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
- `max_wall_clock_ms` (default 5–15 min per run)
- `max_total_tokens` or `max_cost_usd` (optional; depends on usage tracking)

If any budget exceeded → stop with `status: stopped` + `stop_reason`.

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
  - total tokens + total cost + duration

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
- **Costs:** tokens + cost (and optionally model breakdown)
- **Timeline:** iteration list with summaries + errors + “why we continued”
- **Outputs:** “Created” / “Updated” entity lists (clickable)
- **Final report:** the narrative summary + stopping reason
- **Controls:** cancel (if queued/running), resume (if waiting_on_user/stopped), “ask follow-up” (creates a new chat message referencing the run)

Deep links in “Outputs”:
- Tasks: `/projects/{project_id}/tasks/{task_id}` (if project_id known)
- Projects: `/projects/{project_id}`
- Otherwise: link to the best available entity page (or fallback to project page with highlight params).

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
- Define completion criteria contract (`BUILDOS_LOOP_STATUS` vs artifact-based)

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

---

## 12. Open Questions (Need Your Decisions)

1. **Product naming:** in the UI do you want “Homework” or “Long-Running Task” (or both with one as subtitle)?
2. **Write permissions (Homework-specific):** when a user starts homework, should writes be:
   - auto-approved for this run (scoped autopilot), OR
   - “approve plan then run”, OR
   - still prompt per-write (likely too slow for homework)?
3. **Scope:** does a homework run always target a project (`project_id`) or can it be global?
4. **Completion criteria:** canonical “done” signal:
   - plan completed,
   - `BUILDOS_HOMEWORK_STATUS.exit_signal`,
   - deliverables check,
   - or a “completion promise” phrase the user supplies?
5. **Notification channels:** in-app only for MVP, or also push/email if enabled?
6. **Token/cost visibility:** should costs be visible to:
   - admins only,
   - the user who ran it,
   - or both?
7. **WAITING_ON_USER:** if homework needs clarification, do we:
   - send a notification with questions and pause, OR
   - attempt “best-effort” and keep going?

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

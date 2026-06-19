<!-- apps/web/docs/technical/architecture/agent-work/01-EXECUTION-SUBSTRATE.md -->

# Agent Work — 01 Execution Substrate

**Status:** Design · **Date:** 2026-06-15 · Part of the [Agent Work](./00-OVERVIEW.md) doc set.

Covers how an Agent Run is stored, executed in the worker, what it returns, how it's triggered, and how it's guarded.

---

## 1. Data model

Reuses the `buildos_tree_agent` two-table pattern (run + events), minus the node/plan tree.

The shape below is the target contract. `scope_mode` + `allowed_ops` replace the original `allowed_capabilities` field via `20260616000000_agent_work_phase05.sql` (apply it after the Phase 0 migration, then `gen:types`).

### `agent_runs`

```sql
create table agent_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),

  -- provenance / supervision
  trigger         text not null,         -- 'chat' | 'manual' | 'scheduled' | 'event'
  parent_run_id   uuid null references agent_runs(id),   -- set when spawned by another run (depth)
  parent_session_id uuid null,           -- chat_sessions.id when trigger='chat'
  parent_message_id uuid null,           -- the orchestrator turn that spawned it
  depth           int not null default 0,                -- 0 = top-level, 1 = subagent (max)
  operative_id    uuid null,             -- future: saved Operative definition

  -- the brief
  label           text not null,
  goal            text not null,
  instructions    text,
  expected_output text,
  context_type    text not null,         -- 'project' | 'global'
  project_id      uuid null,             -- OPTIONAL (e.g. pure web research)
  scope_mode      text not null default 'read_write',
                  -- 'read_only' | 'read_write' (Agent Call policy vocabulary)
  allowed_ops     text[] null,           -- optional BuildOS op allowlist, e.g. 'onto.task.update'
  review_required boolean not null default false,  -- opt-in: stage mutations for review (see 02)

  -- lifecycle
  status          text not null default 'queued',
                  -- queued | running | paused | needs_input | proposal_ready | completed | partial | failed | cancelled
  result          jsonb null,            -- RunResult envelope
  change_set      jsonb null,            -- proposed_changes (see 02-STAGED-MUTATIONS)
  budgets         jsonb not null,        -- { wall_clock_ms, max_tokens, max_tool_calls }
  metrics         jsonb null,            -- { tokens, cost_usd, tool_calls, duration_ms }
  error           text null,

  created_at      timestamptz not null default now(),
  started_at      timestamptz null,
  completed_at    timestamptz null
);

create index on agent_runs (user_id, status);
create index on agent_runs (parent_session_id);
create index on agent_runs (parent_run_id);
```

### `agent_run_events`

Immutable log for the UI trace + observability (mirrors `tree_agent_events`).

```sql
create table agent_run_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id),
  seq         int not null,              -- monotonic per run
  event_type  text not null,            -- run.status | run.narration | run.tool_call | run.tool_result
                                         -- | run.proposal | run.needs_input | run.message
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index on agent_run_events (run_id, seq);
```

### Telemetry link

Every tool call a run makes must be tagged with `agent_run_id`, so `entities_touched` is reconstructed from ground truth (see §5). `ChatToolExecutor` logs to `chat_tool_executions` and _skips logging without a `session_id`_, and that column is `NOT NULL` in generated types — so reusing it for runs would mean weakening a NOT NULL invariant and touching every chat-analytics query.

**Decision (Phase 0.5): a dedicated `agent_tool_executions` table.** Run-native, keyed by `agent_run_id`, no chat-session dependency, useful columns (`tool_name`, `gateway_op`, `tool_category`, `arguments`, `result`, `success`, `entity_kind`, `entity_id`, `mutation_mode`, `proposed_change_id`, `execution_time_ms`, `tokens_consumed`). Zero blast radius on chat observability; manual/scheduled runs never need a synthetic `chat_sessions` row. The Phase 0 `chat_tool_executions.agent_run_id` column was dropped (superseded). Migration: `20260616000000_agent_work_phase05.sql`.

### Phase 0.5 contract hardening — ✅ COMPLETE

- ✅ `pnpm gen:types` regenerated: `agent_runs` / `agent_run_events` / `agent_run_signals` / `agent_tool_executions` tables, the `agent_run_*` enums, and `'agent_run'` in `queue_type` are all in generated DB types.
- ✅ `validateAgentRunMetadata` added and **wired into the `validateJobMetadata` dispatcher** (`case 'agent_run'`).
- ✅ `allowed_capabilities` → `scope_mode` + `allowed_ops` (typed via the Agent Call vocabulary `BUILDOS_AGENT_READ_OPS` / `BUILDOS_AGENT_WRITE_OPS`).
- ✅ Telemetry shape decided + migrated (`agent_tool_executions`); executor logging wiring lands with the worker-safe adapter (Phase 1a).
- ✅ Contract test (`apps/worker/tests/queueContracts.test.ts`) — validator + dispatcher + reject cases. shared-types typechecks; 9/9 pass.

Next: **Phase 1a — the worker-safe tool adapter.**

---

## 2. Execution: the worker runner

- New queue job type **`agent_run`**, registered in `apps/worker/src/worker.ts` alongside `buildos_tree_agent`.
- Enqueued via `add_queue_job` RPC (same as tree-agent), priority ~7, dedup key `agent-run:${run.id}`.
- Two-phase create (matches tree-agent): API/orchestrator inserts the `agent_runs` row (`status='queued'`), then enqueues the job. The worker claims, sets `running`, executes, writes `result` + final `status`.

### `runAgentLoop` (the headless loop)

A focused sibling of `streamFastChat`, **not** a refactor of it. Reuses the lower-level pieces directly:

- **Do not call `streamFastChat` directly.** Its public contract is chat-session-shaped (`sessionId`, SSE callbacks, chat turn telemetry). The runner can reuse lower-level ideas (message loop, gateway materialization, tool validation), but it needs its own run-shaped loop.
- **Tool surface:** gateway assembly, **minus `delegate_task`** (depth cap), narrowed by `scope_mode` + `allowed_ops`. The allowlist should map BuildOS ops to concrete tool names through the existing registry/policy layer, not rely on arbitrary strings.
- **Tool executor:** a worker-safe adapter around the current chat tool implementation. It receives `agent_run_id`, `user_id`, `project_id`, `scope_mode`, `allowed_ops`, `mutationMode`, and a service-role/admin client. Project access is still enforced before writes/reads; the adapter must not depend on an open browser request or a chat session.
- **Discovery:** `materializeGatewayTools()` for lazy tool loading (lean discovery inherited).
- **LLM:** worker `SmartLLMService` with tool-calling; profile `balanced`; usage tracked into `metrics`.
- **Event sink:** instead of SSE-to-client, the worker sink appends `agent_run_events` rows and updates `agent_runs.status/metrics`. Realtime delivers these to the UI (see 03).
- **Termination:** the run finishes by calling the terminal **`submit_result`** tool. If the loop ends without it (budget/stop), wrap the last narration as `answer` with `status='partial'`.

### Worker-safe tool adapter

The current chat tool stack is valuable, but it assumes request-time infrastructure:

- `ChatToolExecutor` currently skips logging when `session_id` is missing.
- `BaseExecutor` builds headers from `supabase.auth.getSession()` and calls relative `/api/...` routes through `fetchFn`.
- `ToolExecutionService` expects a `ServiceContext.sessionId`.

The Agent Run adapter must normalize those assumptions:

1. **Run-aware context:** add `agentRunId`, optional `sessionId`, `changeSource: 'agent_run'`, `activityLogActorContext`, and `mutationMode` to the executor context.
2. **Worker fetch/auth:** either call shared service functions directly or provide a worker fetch wrapper that resolves relative API paths against `PUBLIC_APP_URL`/internal app URL and authenticates as the run's user/service role. Do not rely on `supabase.auth.getSession()` in the worker.
3. **Policy enforcement:** derive concrete callable tools from `scope_mode` and `allowed_ops`. In `read_only`, write ops are not mounted and are rejected if discovered dynamically.
4. **Telemetry receipt:** every tool execution returns/persists a `ToolExecutionReceipt` with `agent_run_id`, op, entity/action metadata, result IDs, success/error, duration, and tokens.
5. **Stage/commit switch:** when `review_required=true`, write tools run in stage mode (02); otherwise they commit normally.

### Phase 1a extraction strategy — DECIDED (in progress)

The worker **cannot import `apps/web`** (verified: separate package, no `$lib`, zero cross-imports). The chat executor stack (`ChatToolExecutor`, `BaseExecutor`) also assumes request-time auth/fetch. So "reuse the chat tools in the worker" resolves to: **extract the BuildOS op-execution layer into a shared package, `@buildos/shared-agent-ops`, imported by both the web agent-call gateway and the worker runner.** (Options weighed: shared package vs. worker→web HTTP vs. worker-local reimpl. Shared package chosen for runtime independence + single source of truth.)

The Agent Run tool surface = the **Agent Call op catalog** (`BUILDOS_AGENT_READ_OPS` / `WRITE_OPS`), executed by the gateway op handlers — _not_ the broader chat tool surface. Calendar/Google ops are **deferred** (the one real portability tangle: `$env/static/private` in `GoogleOAuthService`); the first runner ships with the ontology surface.

**Extraction tactic — re-export shims, narrow slices.** Move a module's contents into the package and leave a one-line `export * from '@buildos/shared-agent-ops'` shim at the old `$lib/...` path, so the existing importers (e.g. `ontology-projects.service` has 69) are untouched. Run the 98-test agent-call suite after each slice as the regression guardrail.

Slice progress:

- ✅ **Slice 1 — policy/scope.** `agent-call-policy.ts` → `@buildos/shared-agent-ops` (`src/policy.ts`); old path is a shim. Package builds (ESM/CJS/DTS); 98/98 agent-call tests pass. Proves the pipeline (package ← web via shim, zero behavior change).
- ✅ **Slice 2 — edge/relationship pure-logic island.** `edge-direction`, `containment-organizer`, `relationship-policy`, `edge-relationship-resolver` (~926 LoC) → `@buildos/shared-agent-ops/src/ontology/`; old paths are shims. No `$lib`/`$env` deps; barrel re-export (no name collisions). **203/203** agent-call + ontology tests pass.
- ⬜ **Slice 3+ — DB-touching ontology services** (`versioning`, `doc-structure`, `instantiation`, `ontology-projects`) behind shims, one cohesive group at a time. (These take a supabase client as a param — portable — but pull in `$lib/types`/`$lib/utils` leaves that must move or resolve to `@buildos/shared-types`.)
- ⬜ **Final — rewire `external-tool-gateway.ts`** op handlers to live in / import from the package; worker runner imports the package directly.

### The run system prompt (brief-shaped, not conversational)

Role ("you are a focused background agent"), the goal / instructions / expected*output, project context (if any), the rules: \_you must finish by calling `submit_result`; you cannot delegate further*. The agent is **not** told whether it's in commit or stage mode — the substrate decides where its writes land (see 02). If a steering message arrives mid-run it appears as a new user turn in the conversation (see §9).

---

## 3. The `SubagentRunner` seam

Even though there is one runner today, keep the interface so callers never depend on execution mode:

```ts
interface SubagentRunner {
	dispatch(brief: AgentBrief, ctx: RunContext): Promise<{ run_id: string }>; // enqueues, returns immediately
	// results are observed via agent_runs realtime, NOT awaited here
}
```

Dispatch is fire-and-observe. The orchestrator's "await" is implemented by subscribing to the run's completion (03 + §7), not by blocking a request.

---

## 4. Run Result envelope

```ts
interface RunResult {
	run_id: string;
	label: string;
	status: 'completed' | 'partial' | 'failed' | 'needs_input' | 'proposal_ready';
	summary: string; // "showing its work" — narrative of what it did
	answer: string; // the response/finding (may equal summary)
	entities_touched: EntityTouch[]; // committed changes (system-captured)
	proposed_changes?: ChangeSet; // staged changes awaiting approval (see 02)
	artifacts?: { kind: 'document' | 'json'; id: string; title?: string }[];
	open_questions?: string[]; // when needs_input / partial
	confidence?: number; // 0..1
	metrics: { tokens: number; cost_usd: number; tool_calls: number; duration_ms: number };
	error?: string;
}

interface EntityTouch {
	type: 'task' | 'project' | 'document' | 'goal' | 'plan' | 'calendar_event' | string;
	id: string;
	action: 'created' | 'updated' | 'deleted';
	description: string; // LLM-annotated rationale
}
```

`submit_result` only accepts the LLM-authored fields (`status`, `summary`, `answer`, `open_questions`, `confidence`, plus `description` annotations). `entities_touched`, `artifacts`, `metrics` are attached by the runner.

---

## 5. `entities_touched` as ground truth

Captured from the run's tool execution receipts (either run-aware `chat_tool_executions` rows or `agent_tool_executions` rows tagged with `agent_run_id`):

1. Filter the run's tool executions to **write ops** via the tool registry / Agent Call op registry (`tool-registry.ts` already classifies read vs write and maps tool → op → entity/action).
2. Extract `id` from each write op's result payload (write executors already return created/updated IDs).
3. Let the LLM annotate `description` only.

> An agent cannot misrepresent what it changed. **Verify the registry op→(type, action) mapping covers every write tool** (tasks, projects, documents, goals, plans, calendar) — gaps = missing entities. This verification should be a test, not a manual checklist. (Open question, also relevant to 02.)

---

## 6. Triggers

All converge on the same `agent_runs` insert + `agent_run` enqueue:

| Trigger              | Entry                                    | Notes                                                  |
| -------------------- | ---------------------------------------- | ------------------------------------------------------ |
| **chat**             | `delegate_task` tool (orchestrator-only) | depth 0→1; `parent_session_id`/`parent_message_id` set |
| **manual**           | UI "send an agent" → API route           | no chat needed; user writes the brief                  |
| **scheduled**        | existing worker scheduler/cron           | e.g. weekly research → proposal                        |
| **event** _(future)_ | `project_activity` hooks                 | new braindump → structuring run, etc.                  |

---

## 7. Async conversation (chat is no longer turn-locked)

When the orchestrator dispatches runs, the chat turn does **not** block to completion:

1. Orchestrator calls `delegate_task` → runs are enqueued → tool result returns `{ run_ids }` immediately.
2. Orchestrator says "I've sent N agents on this; I'll update you," and the turn ends.
3. Worker runs execute; on terminal status, the system **injects an assistant-authored message** into the chat session (`chat_messages`) summarizing each run + linking to the Work Panel / proposal.
4. The chat UI renders the new message via a new `chat_messages` realtime subscription and/or a session reload on open — no open SSE stream required.

This makes the chat a persistent collaboration thread (Slack-with-agents), and is the mechanism behind the "go-between across agents" supervisor model. The current modal mostly mutates local state during SSE and loads persisted messages by API, so Phase 3 must explicitly add the `chat_messages` subscription/reload path.

---

## 8. Guardrails

1. **No recursion:** subagent surface excludes `delegate_task`; backstop hard check `depth >= 1 ⇒ reject spawn`.
2. **Fan-out cap:** `AGENTIC_CHAT_MAX_SUBAGENTS` (default 3) per `delegate_task` batch; per-session active-run cap. Excess → tool error ("sequence these").
3. **Policy scope:** `scope_mode='read_only'` strips/rejects write ops. `allowed_ops` is intersected with the default allowed ops for that scope. A project-scoped run must validate `project_id` access before enqueue and again before execution.
4. **Budgets:** per-run `wall_clock_ms` / `max_tokens` / `max_tool_calls` (reuse tree-agent's deadline pattern). Worker enforces; timeout → `status='partial'`, not `failed`.
5. **Concurrency:** rely on the queue's existing claim/limit; cap concurrent runs per user.
6. **Cost rollup:** subagent token/cost rolls into the parent run's `metrics` and into LLM usage tracking.
7. **Failure isolation:** batch dispatch uses independent runs; one failing run does not affect siblings.

---

## 9. Steering & interruption (a run is not fire-and-forget)

A running agent can be **steered, paused, or interrupted** mid-flight. The user (or the supervising orchestrator) is not locked out once a run starts — they can redirect it, add context, or stop it.

### Control signals

A lightweight signal table the worker drains between loop iterations:

```sql
create table agent_run_signals (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs(id),
  kind        text not null,        -- 'steer' | 'pause' | 'resume' | 'cancel'
  payload     jsonb null,           -- { message } for 'steer'
  source      text not null,        -- 'user' | 'orchestrator'
  created_at  timestamptz not null default now(),
  consumed_at timestamptz null
);
create index on agent_run_signals (run_id) where consumed_at is null;
```

Signals are written by `POST /api/agent-runs/[id]/steer | /pause | /resume | /cancel` (03 §7) and by the orchestrator (it can steer its own subagents).

### Where the loop checks (the steering boundary)

`runAgentLoop` checks for unconsumed signals **at the top of each iteration** — i.e. between the model's turns, after a tool batch completes and before the next LLM call. This is the natural safe point: no tool call is interrupted half-way, and the agent's next reasoning step sees the new input.

```
loop iteration:
  ├─ drain unconsumed agent_run_signals for this run
  │    ├ cancel  → mark consumed, finalize as 'partial' (wrap last narration), stop
  │    ├ pause   → mark consumed, checkpoint state, set status='paused', release/requeue
  │    ├ resume  → enqueue/claim again, set status='running', continue from checkpoint
  │    └ steer   → mark consumed, append payload.message to the conversation as a user turn,
  │               emit run.steer event, continue (agent adapts next turn)
  ├─ call LLM with current messages (+ any steer)
  ├─ execute tool calls
  └─ append events; repeat until submit_result / budget / signal
```

- **Steer** = inject a `user`-role message ("Steering from supervisor: <message>") into the run's conversation so the agent incorporates it on its next turn. Multiple steers queue and apply in order. The agent treats it as new instruction within the same goal.
- **Pause/resume** = checkpoint the loop and release the worker slot. Budget wall-clock should exclude paused time (track `paused_ms`, subtract from deadline). Holding a queue slot while paused is only acceptable as an explicit small-scale shortcut; the preferred design is `paused` status + resume enqueues/claims a continuation job.
- **Cancel** = graceful stop → `status='partial'` with whatever it has, not `failed`. (A hard kill for a wedged run is the existing stalled-job path.)

### Latency

Steering applies at the next iteration boundary, so a steer issued during a long single tool call lands after that tool returns — typically seconds. Good enough for "redirect," not for "abort this exact instant" (that's cancel, which also waits for the current tool to return). The UI shows the signal as **pending → applied** so the user knows it was received (03 §3).

### Worker delivery (don't rely only on polling)

The worker can `LISTEN`/subscribe for new signals on the active run (broadcast on `agent-run:${runId}`) to apply them promptly, with a per-iteration DB check as the reliable fallback. Reuses the realtime substrate already in play for events (03 §2).

# Agent Work — 01 Execution Substrate

**Status:** Design · **Date:** 2026-06-15 · Part of the [Agent Work](./00-OVERVIEW.md) doc set.

Covers how an Agent Run is stored, executed in the worker, what it returns, how it's triggered, and how it's guarded.

---

## 1. Data model

Reuses the `buildos_tree_agent` two-table pattern (run + events), minus the node/plan tree.

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
  allowed_capabilities text[] null,      -- optional narrowing of tool surface
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

Add `agent_run_id uuid null` to `chat_tool_executions`. Every tool call a run makes is tagged, so `entities_touched` is reconstructed from ground truth (see §5). *Open question: the stream endpoint persists tool executions on a detached path — the worker runner persists synchronously, which is simpler; confirm both write the tag.*

---

## 2. Execution: the worker runner

- New queue job type **`agent_run`**, registered in `apps/worker/src/worker.ts` alongside `buildos_tree_agent`.
- Enqueued via `add_queue_job` RPC (same as tree-agent), priority ~7, dedup key `agent-run:${run.id}`.
- Two-phase create (matches tree-agent): API/orchestrator inserts the `agent_runs` row (`status='queued'`), then enqueues the job. The worker claims, sets `running`, executes, writes `result` + final `status`.

### `runAgentLoop` (the headless loop)

A focused sibling of `streamFastChat`, **not** a refactor of it. Reuses the lower-level pieces directly:

- **Tool surface:** `selectFastChatTools()` / gateway assembly, **minus `delegate_task`** (depth cap), optionally narrowed by `allowed_capabilities`.
- **Tool executor:** `ChatToolExecutor` constructed with the run's `user_id`, `project_id`, and a fresh admin/authenticated supabase client. Project access still enforced by `assertProjectAccess` — no new permission layer.
- **Discovery:** `materializeGatewayTools()` for lazy tool loading (lean discovery inherited).
- **LLM:** worker `SmartLLMService` with tool-calling; profile `balanced`; usage tracked into `metrics`.
- **Event sink:** instead of SSE-to-client, the worker sink appends `agent_run_events` rows and updates `agent_runs.status/metrics`. Realtime delivers these to the UI (see 03).
- **Termination:** the run finishes by calling the terminal **`submit_result`** tool. If the loop ends without it (budget/stop), wrap the last narration as `answer` with `status='partial'`.

### The run system prompt (brief-shaped, not conversational)

Role ("you are a focused background agent"), the goal / instructions / expected_output, project context (if any), the rules: *you must finish by calling `submit_result`; you cannot delegate further*. The agent is **not** told whether it's in commit or stage mode — the substrate decides where its writes land (see 02). If a steering message arrives mid-run it appears as a new user turn in the conversation (see §9).

---

## 3. The `SubagentRunner` seam

Even though there is one runner today, keep the interface so callers never depend on execution mode:

```ts
interface SubagentRunner {
  dispatch(brief: AgentBrief, ctx: RunContext): Promise<{ run_id: string }>;  // enqueues, returns immediately
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
  summary: string;            // "showing its work" — narrative of what it did
  answer: string;             // the response/finding (may equal summary)
  entities_touched: EntityTouch[];   // committed changes (system-captured)
  proposed_changes?: ChangeSet;      // staged changes awaiting approval (see 02)
  artifacts?: { kind: 'document' | 'json'; id: string; title?: string }[];
  open_questions?: string[];  // when needs_input / partial
  confidence?: number;        // 0..1
  metrics: { tokens: number; cost_usd: number; tool_calls: number; duration_ms: number };
  error?: string;
}

interface EntityTouch {
  type: 'task'|'project'|'document'|'goal'|'plan'|'calendar_event'|string;
  id: string;
  action: 'created'|'updated'|'deleted';
  description: string;        // LLM-annotated rationale
}
```

`submit_result` only accepts the LLM-authored fields (`status`, `summary`, `answer`, `open_questions`, `confidence`, plus `description` annotations). `entities_touched`, `artifacts`, `metrics` are attached by the runner.

---

## 5. `entities_touched` as ground truth

Captured from the run's `chat_tool_executions` rows (tagged with `agent_run_id`):

1. Filter the run's tool executions to **write ops** via the tool registry (`tool-registry.ts` already classifies read vs write and maps tool → op → entity/action).
2. Extract `id` from each write op's result payload (write executors already return created/updated IDs).
3. Let the LLM annotate `description` only.

> An agent cannot misrepresent what it changed. **Verify the registry op→(type, action) mapping covers every write tool** (tasks, projects, documents, goals, plans, calendar) — gaps = missing entities. (Open question, also relevant to 02.)

---

## 6. Triggers

All converge on the same `agent_runs` insert + `agent_run` enqueue:

| Trigger | Entry | Notes |
|---|---|---|
| **chat** | `delegate_task` tool (orchestrator-only) | depth 0→1; `parent_session_id`/`parent_message_id` set |
| **manual** | UI "send an agent" → API route | no chat needed; user writes the brief |
| **scheduled** | existing worker scheduler/cron | e.g. weekly research → proposal |
| **event** *(future)* | `project_activity` hooks | new braindump → structuring run, etc. |

---

## 7. Async conversation (chat is no longer turn-locked)

When the orchestrator dispatches runs, the chat turn does **not** block to completion:

1. Orchestrator calls `delegate_task` → runs are enqueued → tool result returns `{ run_ids }` immediately.
2. Orchestrator says "I've sent N agents on this; I'll update you," and the turn ends.
3. Worker runs execute; on terminal status, the system **injects an assistant-authored message** into the chat session (`chat_messages`) summarizing each run + linking to the Work Panel / proposal.
4. The chat UI renders the new message via realtime on `chat_messages` (new subscription) and/or a push notification — no open SSE stream required.

This makes the chat a persistent collaboration thread (Slack-with-agents), and is the mechanism behind the "go-between across agents" supervisor model. *Open question: confirm the cleanest injection path — server writes the message + realtime push; the chat already renders from `chat_messages`.*

---

## 8. Guardrails

1. **No recursion:** subagent surface excludes `delegate_task`; backstop hard check `depth >= 1 ⇒ reject spawn`.
2. **Fan-out cap:** `AGENTIC_CHAT_MAX_SUBAGENTS` (default 3) per `delegate_task` batch; per-session active-run cap. Excess → tool error ("sequence these").
3. **Budgets:** per-run `wall_clock_ms` / `max_tokens` / `max_tool_calls` (reuse tree-agent's deadline pattern). Worker enforces; timeout → `status='partial'`, not `failed`.
4. **Concurrency:** rely on the queue's existing claim/limit; cap concurrent runs per user.
5. **Cost rollup:** subagent token/cost rolls into the parent run's `metrics` and into LLM usage tracking.
6. **Failure isolation:** batch dispatch uses independent runs; one failing run does not affect siblings.

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
  │    ├ pause   → mark consumed, set status='paused', park (stop claiming budget); wait for 'resume'
  │    ├ resume  → mark consumed, set status='running', continue
  │    └ steer   → mark consumed, append payload.message to the conversation as a user turn,
  │               emit run.steer event, continue (agent adapts next turn)
  ├─ call LLM with current messages (+ any steer)
  ├─ execute tool calls
  └─ append events; repeat until submit_result / budget / signal
```

- **Steer** = inject a `user`-role message ("Steering from supervisor: <message>") into the run's conversation so the agent incorporates it on its next turn. Multiple steers queue and apply in order. The agent treats it as new instruction within the same goal.
- **Pause/resume** = park the loop; budget wall-clock should exclude paused time (track `paused_ms`, subtract from deadline). A paused run holds its queue slot — cap how long a run may stay paused before auto-cancel.
- **Cancel** = graceful stop → `status='partial'` with whatever it has, not `failed`. (A hard kill for a wedged run is the existing stalled-job path.)

### Latency

Steering applies at the next iteration boundary, so a steer issued during a long single tool call lands after that tool returns — typically seconds. Good enough for "redirect," not for "abort this exact instant" (that's cancel, which also waits for the current tool to return). The UI shows the signal as **pending → applied** so the user knows it was received (03 §3).

### Worker delivery (don't rely only on polling)

The worker can `LISTEN`/subscribe for new signals on the active run (broadcast on `agent-run:${runId}`) to apply them promptly, with a per-iteration DB check as the reliable fallback. Reuses the realtime substrate already in play for events (03 §2).

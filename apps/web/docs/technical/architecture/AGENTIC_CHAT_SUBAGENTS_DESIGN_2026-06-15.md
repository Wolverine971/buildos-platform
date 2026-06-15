# Agentic Chat — Subagents / Orchestrator Design

> **⚠️ SUPERSEDED (2026-06-15).** This was the v1 in-process plan. We pivoted to the more ambitious **durable Work substrate** — see the canonical doc set in
> [`agent-work/`](./agent-work/00-OVERVIEW.md) (`00-OVERVIEW`, `01-EXECUTION-SUBSTRATE`, `02-STAGED-MUTATIONS`, `03-MONITORING-UI`).
> This file is kept for the original reasoning and the decision trail only. Decisions about in-process execution here are **no longer current**.

**Status:** Superseded by `agent-work/`
**Date:** 2026-06-15
**Owner:** DJ
**Scope:** Add the ability for the agentic chat to delegate scoped tasks to subagents that run with (almost) the orchestrator's full capability surface and report back a structured result.

---

## 1. Goal

Let the main chat agent (the **orchestrator**) delegate well-specified tasks to **subagents** that:

- run with (almost) everything the orchestrator has (tool surface, project scope, auth),
- are given a clear goal + instructions + definition of done,
- optionally operate inside a project (`project_id` is **optional** — e.g. a pure web-research subagent),
- **report back a structured result** (not streaming prose), including a summary of work done, an answer, and the exact **entities they touched**,
- can be fanned out (multiple subagents, each with one goal),
- are evaluated by the orchestrator, which may retry or follow up, while keeping the human informed.

Inspiration: Claude Code's `Task` tool. Same ergonomics — the orchestrator "awaits" subagents like tools, sees their progress, and consumes their final result.

### Decisions locked (2026-06-15)

1. **Execution substrate (v1):** *In-process fast path.* Subagents run synchronously inside the orchestrator's streaming request. Durable worker path is a future add-on behind the same contract.
2. **Runner:** *Dedicated chat-subagent runner.* New lightweight runner + `chat_subagent_runs` table, sharing the result-envelope shape and event patterns with `buildos_tree_agent` but **not** its recursive planning machinery. (Chat subagents are flat single-goal executors; the orchestrator is the planner.)

---

## 2. Why this is mostly an integration, not a from-scratch build

| Need | Already exists | File |
|---|---|---|
| Tool-calling loop + dispatch | `streamFastChat` orchestrator + `ChatToolExecutor` | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`, `.../agentic-chat/tools/core/tool-executor.ts` |
| "Almost everything" tool surface | lean-discovery gateway (`domain_search` / `skill_load` / `tool_search` …) | `.../agentic-chat/tools/core/gateway-surface.ts` |
| Entity-touched ground truth | write-tool payloads return entity IDs + messages; every call logged | `.../tools/core/executors/ontology-write-executor.ts`, `chat_tool_executions` table |
| Result envelope precedent | `TreeAgentResult` (summary, successAssessment, artifactIds…) | `apps/worker/src/workers/tree-agent/treeAgentWorker.ts` |
| Autonomous loop + budgets + event log | `buildos_tree_agent` (durable-path precedent for v2) | same |
| 5-min request budget | `maxDuration: 300` on the stream route | `apps/web/src/routes/api/agent/v2/stream/+server.ts:14` |
| SSE event union to extend | `AgentSSEMessage` | `packages/shared-types/src/agent.types.ts:461` |

---

## 3. Core abstraction: a **Subagent Run** = a headless sub-session

A subagent run is the *same harness* as a chat turn, but:

- **Driven by a structured task brief** instead of conversational human messages.
- **No human-streaming contract.** It streams *to the orchestrator* (surfaced nested in the UI for transparency), and it **terminates by submitting a structured result**.
- **Tool surface = orchestrator's surface minus `delegate_task`** (this is how depth is capped — see §7).

```
Human ──chat──▶ Orchestrator turn (streamFastChat)
                   │  calls delegate_task({ tasks: [...] })
                   ▼
            SubagentRunner.run(brief) ── 1..N in parallel (capped)
                   │   (headless runAgentLoop, same tools minus delegate)
                   │   narration ──▶ nested SSE (subagent_progress)
                   ▼
            SubagentResult envelope ──▶ returned as the tool_result
                   │
                   ▼
            Orchestrator evaluates → accept / re-delegate / follow up
```

### 3.1 The `SubagentRunner` seam (so the durable path can slot in later)

```ts
interface SubagentRunner {
  run(brief: SubagentBrief, ctx: SubagentRunContext): Promise<SubagentResult>;
}
```

- v1 ships `InProcessSubagentRunner` (runs the loop inline, awaited).
- v2 can add `DurableSubagentRunner` (enqueues a worker job, resolves on realtime completion) **without changing the tool, the envelope, or the UI**. The orchestrator never knows which runner it got.

---

## 4. The `delegate_task` tool (orchestrator-only)

Single batch tool — one tool call, internal `Promise.all`, one place to enforce the fan-out cap. (BuildOS dispatches tool calls sequentially, so a batch tool is the clean parallelism primitive rather than relying on multiple top-level calls.)

```ts
delegate_task({
  tasks: [
    {
      label: string;            // short display name, e.g. "Research competitors"
      goal: string;             // the outcome, one sentence
      instructions: string;     // how-to, constraints, definition of done
      expected_output: string;  // what the orchestrator wants back
      context_type?: 'project' | 'global';   // default inherits orchestrator
      project_id?: string;      // OPTIONAL — omit for non-project work
      allowed_capabilities?: string[];        // optional narrowing; default ~inherit all
    }
  ] // length 1..AGENTIC_CHAT_MAX_SUBAGENTS
})
```

Returns: `{ results: SubagentResult[] }` — same order as input.

**Mounting:** only in orchestrator surfaces (`gateway-surface.ts`). Never added to a subagent's surface.

---

## 5. The dual response contract (the heart of the feature)

Every agent loop has **two output channels**:

- **narration** → text deltas. For humans, and for the live "subagent working" card in chat.
- **result** → a structured envelope. For the orchestrator to consume.

### 5.1 `SubagentResult` envelope

```ts
interface SubagentResult {
  run_id: string;
  label: string;
  status: 'completed' | 'partial' | 'failed' | 'needs_input';
  summary: string;          // "showing its work" — narrative of what it did
  answer: string;           // the actual response/finding (may equal summary)
  entities_touched: EntityTouch[];
  artifacts?: { kind: 'document' | 'json'; id: string; title?: string }[];
  open_questions?: string[];   // populated when status = needs_input / partial
  confidence?: number;         // 0..1, self-reported
  metrics: { tokens: number; cost_usd: number; tool_calls: number; duration_ms: number };
  error?: string;              // when status = failed
}

interface EntityTouch {
  type: 'task' | 'project' | 'document' | 'goal' | 'plan' | 'calendar_event' | string;
  id: string;
  action: 'created' | 'updated' | 'deleted';
  description: string;   // LLM-annotated; e.g. "rescheduled to Friday to unblock launch"
}
```

### 5.2 Ground-truth `entities_touched` (non-obvious, high-value)

`entities_touched` is **captured from tool-execution telemetry, not self-reported.** The tool registry already classifies read vs write (`tool-registry.ts`), and write payloads already return the IDs they created/updated. So:

- `type` / `id` / `action` are **derived from the actual `ChatToolResult`s** the subagent produced (via the registry's op → entity/action mapping).
- The LLM only fills `description` (and may not omit a real change).

> An agent **cannot lie about what it changed.** This is the single most important correctness property of the design.

### 5.3 How a subagent finishes: `submit_result`

The subagent's surface includes a terminal `submit_result({ status, summary, answer, open_questions?, confidence? })` tool — the clean way to end (mirrors tree-agent's structured output). `entities_touched`, `artifacts`, and `metrics` are attached by the runner from telemetry; the LLM does not hand-author them. If the loop ends without `submit_result` (budget/stop), the runner wraps the last narration as `answer` with `status: 'partial'`.

### 5.4 Human vs agent framing

- Human ↔ agent: streaming text (unchanged).
- Agent ↔ agent: the structured envelope above. The orchestrator reads `status` / `open_questions` / `confidence` to decide accept vs retry.

---

## 6. Streaming & UI

Extend `AgentSSEMessage` with nested subagent events (carry a `run_id`):

```ts
| { type: 'subagent_spawned'; run_id; label; goal }
| { type: 'subagent_progress'; run_id; content }     // narration delta
| { type: 'subagent_tool'; run_id; tool_name; status }   // optional, for the trace
| { type: 'subagent_result'; run_id; result: SubagentResult }
```

UI (`AgentChatModal.svelte` + `agent-chat-sse-handler.ts`): a collapsible **"subagent" card** per run — live narration while running, then a summary + `entities_touched` chips + status badge. Parallel subagents render as sibling cards. This reuses the existing SSE plumbing; subagent events are just new members of the union.

---

## 7. Guardrails

1. **Subagents can't spawn subagents.** Their tool surface **excludes `delegate_task`** (primary mechanism, exactly how Claude Code does it). Backstop: a hard `depth === 1` check in the runner that refuses any spawn from within a subagent.
2. **No runaway fan-out.** `AGENTIC_CHAT_MAX_SUBAGENTS` (default 3) caps tasks per `delegate_task` call; a per-session total cap blocks slow-burn swarms. Excess → tool error instructing the orchestrator to sequence. Mirrors tree-agent's `MAX_PARALLEL_CHILDREN` + "≤3 active runs".
3. **Budgets.** Per-subagent wall-clock + token budget (reuse tree-agent's deadline pattern). Aggregate turn budget kept comfortably under `maxDuration: 300`. Suggested defaults: ~90s / subagent, hard stop at ~240s total.
4. **Tool gating.** Subagent inherits the lean-discovery surface minus `delegate_task`; `allowed_capabilities` can narrow further. Project access is already enforced by `ChatToolExecutor.assertProjectAccess` — **no new permission layer.**

---

## 8. Persistence

New lightweight table (shares envelope/event shape with tree-agent; not its node/plan tree):

```sql
chat_subagent_runs (
  id uuid pk,
  parent_session_id uuid,        -- chat_sessions.id
  parent_message_id uuid,        -- the orchestrator turn that spawned it
  user_id uuid,
  label text,
  goal text,
  instructions text,
  expected_output text,
  context_type text,             -- 'project' | 'global'
  project_id uuid null,          -- OPTIONAL
  status text,                   -- pending|running|completed|partial|failed|needs_input
  result jsonb,                  -- SubagentResult envelope
  metrics jsonb,
  budgets jsonb,
  created_at, started_at, completed_at
)
```

- `entities_touched` reconstructed from the subagent's rows in `chat_tool_executions` (tag those rows with `subagent_run_id`).
- No separate events table for v1 — the tagged `chat_tool_executions` + the run row are enough. (Add an events table only if the UI trace needs it.)

---

## 9. The headless agent loop (`runAgentLoop`)

The risk area: the orchestrator (`streamFastChat`) is a large streaming `while(true)` loop. We **do not** refactor it wholesale for v1. Instead we build a focused sibling, `runSubagentLoop`, that reuses the lower-level pieces directly:

- `selectFastChatTools()` / gateway surface assembly (minus `delegate_task`),
- `ChatToolExecutor` (constructed with the **parent's** `supabase` / `userId` / `sessionId` + the subagent's `project_id`),
- `materializeGatewayTools()` for lazy discovery,
- the streaming LLM call,
- an **event sink** abstraction: for humans it writes SSE to the client; for a subagent it forwards narration as `subagent_progress` and collects telemetry.

If sharing proves clean, later extract a common `runAgentLoop(prompt, tools, sink, terminationContract)` used by both human chat and subagents. Not required for v1.

**Subagent system prompt** is brief-shaped, not conversational: role ("you are a focused subagent"), the goal/instructions/expected_output, the project context (if any), the rule that it must finish with `submit_result`, and that it cannot delegate further.

---

## 10. Orchestrator evaluation / retry (model-driven)

After `delegate_task` returns, the orchestrator LLM sees the envelopes and decides — accept, re-delegate with refined instructions, or spawn a follow-up — using `status` / `open_questions` / `confidence`. No hardcoded eval loop (matches Claude Code). The orchestrator narrates progress to the human throughout (the chat is already streaming).

---

## 11. Phased implementation plan

**Phase 0 — Contracts & scaffolding**
- Add `SubagentBrief`, `SubagentResult`, `EntityTouch` to `packages/shared-types`.
- Extend `AgentSSEMessage` with the four subagent events.
- `chat_subagent_runs` migration; add `subagent_run_id` to `chat_tool_executions`.

**Phase 1 — Headless runner (single subagent, in-process)**
- `runSubagentLoop` reusing tool surface + `ChatToolExecutor` + LLM call.
- `submit_result` terminal tool; telemetry-based `entities_touched` capture.
- `InProcessSubagentRunner` implementing the `SubagentRunner` seam.

**Phase 2 — `delegate_task` tool + fan-out**
- Orchestrator-only tool; batch `tasks[]`; `Promise.all` with the cap.
- Guardrails: depth check, fan-out cap, budgets.

**Phase 3 — Streaming & UI**
- Emit/forward subagent SSE events; nested subagent card with live narration + entity chips + status.

**Phase 4 — Evaluation polish & docs**
- Prompt the orchestrator on how/when to delegate, evaluate, retry.
- Eval prompts; update agentic-chat docs.

**Future (v2) — Durable path**
- `DurableSubagentRunner` (worker job + realtime resolution) behind the same `SubagentRunner` interface, for long tasks (e.g. multi-minute web research) that exceed the request budget.

---

## 12. Open questions / risks

- **Serverless budget accounting.** Need a turn-level budget guard so parallel subagents don't blow `maxDuration: 300`. Decide per-subagent vs aggregate caps precisely in Phase 2.
- **Tool-execution tagging.** Confirm the cleanest way to tag `chat_tool_executions` rows with `subagent_run_id` given the async/detached persistence path in the stream endpoint.
- **`entities_touched` mapping coverage.** Verify the registry op → (type, action) mapping covers every write tool (tasks, projects, documents, goals, plans, calendar). Gaps = missing entities.
- **Nested context-usage / cost.** Subagent token/cost should roll up into the orchestrator turn's `context_usage` and into LLM usage tracking.
- **Failure isolation.** One subagent failing in a batch must not fail siblings — `Promise.allSettled`, failed runs return `status: 'failed'` envelopes.
- **needs_input semantics.** A subagent that needs human input returns `needs_input` + `open_questions`; the orchestrator decides whether to ask the human or proceed. (Subagents never talk to the human directly.)

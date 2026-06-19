<!-- apps/web/docs/technical/architecture/agent-work/00-OVERVIEW.md -->

# Agent Work — Overview & North Star

**Status:** Backend implemented & verified (2026-06-18) — Phases 0–1b shipped + dispatch/monitor/cancel API; runner live-confirmed (read-only). UI phases (2/3/3.5/5) + write ops (Waves 5–7) remain. See [HANDOFF_2026-06-18](./HANDOFF_2026-06-18.md).
**Date:** 2026-06-15 (design) · 2026-06-18 (implementation status)
**Owner:** DJ
**Supersedes:** `apps/web/docs/technical/architecture/AGENTIC_CHAT_SUBAGENTS_DESIGN_2026-06-15.md` (v1 in-process plan — see §"What changed")

---

## North star

BuildOS gains a **durable autonomous execution layer** called **Work**. The unit is an **Agent Run**: a first-class, persistent, observable, resumable workspace object that runs in the background worker with a scoped tool surface, does a bounded task, and reports back a structured result. Runs mutate directly by default, like the chat does today, and can opt into review-before-commit when the caller requests `review: true`.

The agentic chat is the **supervisor** — one of several ways to create and monitor Work — not the cage that contains it.

> One line: _not "the chat can call subagents," but "BuildOS has a workforce, and the chat supervises it."_

---

## What changed (the pivot from v1)

The earlier plan (`AGENTIC_CHAT_SUBAGENTS_DESIGN_2026-06-15.md`) scoped subagents as an **in-process** feature of the chat, bounded by the 300s request. We deliberately reframed to the more ambitious version (10x value for ~2x effort) because the in-process model has a hard ceiling: ephemeral, chat-triggered-only, turn-locked, unsafe on real data, non-compounding.

**Superseded decisions:**

- ~~In-process fast path first~~ → **durable worker execution is the primary (and only) substrate.** No in-process fork. "Instant" feel comes from realtime streaming, not from blocking the request.
- ~~Subagents are a chat feature~~ → **Agent Runs are a platform primitive** with multiple triggers (chat / manual / scheduled).

**Decisions retained:**

- **Dedicated runner** (new `agent_runs` table), reusing `buildos_tree_agent`'s substrate (queue, events, realtime, budgets) but **not** its recursive planner.
- **Telemetry-captured `entities_touched`** — ground truth from tool executions, never LLM self-report.
- **Depth cap by construction** — subagents get a tool surface without the spawn tool.

**Decisions added (2026-06-15 revision):**

- **Staging is opt-in, not default.** Runs commit mutations directly like the chat does today; passing `review: true` on the brief switches a run to stage-for-review. No per-run approval tax. (02)
- **Runs are steerable, not fire-and-forget.** A running agent can be steered (mid-run instruction), paused/resumed, or stopped — by the user or the supervising orchestrator — applied at the next loop iteration boundary via an `agent_run_signals` channel. (01 §9, 03 §3a)
- **Run identity is independent of chat identity.** Chat-triggered runs link back to a session/message, but manual and scheduled runs must not require a synthetic chat session just to log tool execution. Telemetry and audit must be keyed by `agent_run_id`.
- **Tool scope uses the existing allowed-op vocabulary.** Agent Runs should narrow tools with `scope_mode` + `allowed_ops` (the Agent Call policy vocabulary) rather than free-form capability strings.

---

## Glossary

| Term                      | Meaning                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Run**             | A durable, persisted unit of delegated agent work. Row in `agent_runs`. Runs in the worker.                                                                   |
| **Orchestrator**          | The chat LLM turn that supervises runs — dispatches, monitors, evaluates, synthesizes.                                                                        |
| **Subagent**              | An Agent Run spawned by the orchestrator (depth 1; cannot spawn further).                                                                                     |
| **Run Result**            | The structured envelope a run reports back (summary, answer, entities_touched, status, metrics).                                                              |
| **Change Set / Proposal** | An **opt-in** staged, reviewable diff of entity mutations a run wants to make. Only produced when the run is dispatched with `review`; committed on approval. |
| **Steering**              | Mid-run input (steer / pause / resume / stop) the user or orchestrator sends to a running agent; applied at the next loop iteration boundary.                 |
| **Operative**             | (Future) a saved, reusable Agent Run definition: role + brief + tool scope + optional schedule.                                                               |
| **Run Stack**             | The live, transient collapsible cards (bottom-right) — the existing notification stack, extended.                                                             |
| **Work Panel**            | The new persistent inbox + detail view: all runs (active + history), proposal review, actions.                                                                |

---

## Architecture at a glance

```
            ┌──────────── Triggers ────────────┐
   Chat orchestrator     Manual (UI button)     Scheduler (cron)
            └──────────────┬───────────────────┘
                           ▼  enqueue agent_run job (queue_jobs)
                  ┌───────────────────────┐
                  │   WORKER (Railway)     │  reuses tree_agent substrate
                  │   runAgentLoop()       │  headless loop, scoped tool surface − delegate
                  │   ├ worker-safe tool adapter │ COMMIT by default; STAGE only if review=true
                  │   ├ signal drain       │  steer / pause / resume / cancel between turns
                  │   ├ submit_result      │  terminal → Run Result envelope
                  │   └ budgets/guardrails │
                  └──────────┬─────────────┘
              writes status/progress/result + emits events
                           ▼
            agent_runs  +  agent_run_events  (Supabase)
                           ▼  postgres_changes / broadcast (realtimeBrief pattern)
   ┌───────────────────────┴───────────────────────────┐
   ▼                                                    ▼
 Run Stack (live cards, notification store)      Work Panel (inbox + detail + proposal review)
   │                                                    │
   └──── orchestrator also subscribes ──────────────────┘
        on completion → agent-authored message injected into chat session
```

Detail in the per-area specs below.

---

## Doc map

| Doc                                     | Covers                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **START-HERE.md**                       | Plain-English entry point — what we're building, why, and how it plugs into the chat. Read first.                                |
| **00-OVERVIEW.md** (this)               | North star, pivot, glossary, decisions, roadmap, open questions index                                                            |
| **01-EXECUTION-SUBSTRATE.md**           | `agent_runs` schema, worker runner, the headless loop, envelope, entities capture, triggers, guardrails, async message injection |
| **02-STAGED-MUTATIONS.md**              | Change Sets, write-tool dry-run/stage mode, approval flows, atomic commit, audit                                                 |
| **03-MONITORING-UI.md**                 | Run Stack (extend notification stack) + Work Panel (inbox/detail/proposal review) + realtime wiring                              |
| **SHARED_AGENT_OPS_EXTRACTION_PLAN.md** | Execution bible — wave-by-wave extraction status, gateway carve seam, runner spec                                                |
| **HANDOFF_2026-06-18.md**               | Current implementation state + next steps + landmines. **Pick-up point for a new agent.**                                        |

---

## Phased roadmap (cross-cutting)

- ✅ **Phase 0 — Contracts & schema.** `agent_runs` + `agent_run_events` + `agent_run_signals` (+ `agent_tool_executions`) tables; envelope/Change Set types in `shared-types`; event types; `agent_run` queue job type registered. **Done, applied.**
- ✅ **Phase 0.5 — Contract hardening.** DB types regenerated; `validateAgentRunMetadata` wired; telemetry = dedicated `agent_tool_executions`; `allowed_capabilities` → typed `scope_mode` / `allowed_ops`. **Done.**
- ✅ **Phase 1a — Worker-safe op substrate.** Resolved by extracting `@buildos/shared-agent-ops` (Waves 0–4) — the worker imports the op layer in-process; no SvelteKit/chat-session dependency. `executeAgentOp` dispatcher (read-first). **Done.**
- ✅ **Phase 1b — Durable runner.** `apps/worker/src/workers/agent-run/agentRunWorker.ts` — JSON action-loop, `submit_result`, telemetry, budgets, cancel-drain. Registered `agent_run`. **Done; live-verified (read-only). Direct-commit writes pending the Wave 7 gateway carve.**
- ✅ **Dispatch/monitor/cancel API** — `apps/web/src/routes/api/agent-runs/`. **Done.**
- **Phase 2 — Run Stack (live UI).** Extend notification store with `agent_run` type; `agent-run-notification.bridge.ts` fed by `agent_runs` realtime; live cards. _(Next up; the "peek at background processes" MVP.)_
- **Phase 3 — Chat supervision + async injection + chat presence.** `delegate_task` orchestrator tool; dispatch + monitor via realtime; agent-authored messages injected into the chat session on completion; in-chat run dock + "N agents working" launcher badge so runs stay visible when the modal is open _and_ after it's closed (open/closed handoff, 03 §6).
- **Phase 3.5 — Steering & interruption.** `agent_run_signals` drain in `runAgentLoop` (steer/pause/resume/cancel); steer/pause/stop endpoints; `AgentRunSteerControl` on the stack card. Pause should release/requeue the run unless we explicitly accept worker-slot occupancy. _(The "interject while it runs" ask.)_
- **Phase 4 — Staged mutations (opt-in).** `review` flag → write-tool stage mode; Change Set model; proposal review UI in the Work Panel; commit/reject. Off by default.
- **Phase 5 — Work Panel (full).** Persistent inbox, history, detail view (narration log + event timeline + entities + proposal diff), actions (cancel/retry/steer/answer).
- **Phase 6 — Triggers & Operatives.** Manual-dispatch button (with a "review changes" toggle); scheduled runs via existing scheduler; saved Operative definitions.

> Phases 2 and 3.5 are independently shippable value: Phase 2 gives visibility, Phase 3.5 gives control. Phase 4 (trust/staging) is opt-in and can come later. Order can flex.

---

## Open questions index (resolved in sub-specs)

- Turn-level + per-run budget accounting; excluding paused time from wall-clock deadline (01)
- Run-aware tool telemetry: whether to adapt `chat_tool_executions` or add `agent_tool_executions`; manual/scheduled runs cannot require `chat_messages.session_id` (01)
- Worker-safe tool adapter: relative API fetch/auth assumptions in current chat executors (01)
- Run scope representation: replace free-form `allowed_capabilities` with `scope_mode` + `allowed_ops` aligned to Agent Call policy (01)
- Registry op → (entity type, action) coverage for all write tools (01, 02)
- Change Set granularity & atomicity / partial-commit semantics — for `review` runs only (02)
- Steering boundary latency & worker signal delivery (LISTEN vs per-iteration DB check); max-paused-before-auto-cancel (01 §9, 03)
- Realtime vs polling fallback thresholds for the Work Panel (03)
- Mobile placement of Run Stack vs Work Panel (03)
- Agent-authored message injection: how the chat re-renders without an open SSE stream (01, 03)

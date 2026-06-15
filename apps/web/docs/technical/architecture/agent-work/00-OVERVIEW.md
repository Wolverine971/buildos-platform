# Agent Work — Overview & North Star

**Status:** Design (pre-implementation)
**Date:** 2026-06-15
**Owner:** DJ
**Supersedes:** `apps/web/docs/technical/architecture/AGENTIC_CHAT_SUBAGENTS_DESIGN_2026-06-15.md` (v1 in-process plan — see §"What changed")

---

## North star

BuildOS gains a **durable autonomous execution layer** called **Work**. The unit is an **Agent Run**: a first-class, persistent, observable, resumable workspace object that runs in the background worker with (almost) the full chat tool surface, does a scoped task, and reports back a structured result. Runs that mutate the user's data **stage their changes as a reviewable proposal** instead of editing silently.

The agentic chat is the **supervisor** — one of several ways to create and monitor Work — not the cage that contains it.

> One line: *not "the chat can call subagents," but "BuildOS has a workforce, and the chat supervises it."*

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

---

## Glossary

| Term | Meaning |
|---|---|
| **Agent Run** | A durable, persisted unit of delegated agent work. Row in `agent_runs`. Runs in the worker. |
| **Orchestrator** | The chat LLM turn that supervises runs — dispatches, monitors, evaluates, synthesizes. |
| **Subagent** | An Agent Run spawned by the orchestrator (depth 1; cannot spawn further). |
| **Run Result** | The structured envelope a run reports back (summary, answer, entities_touched, status, metrics). |
| **Change Set / Proposal** | An **opt-in** staged, reviewable diff of entity mutations a run wants to make. Only produced when the run is dispatched with `review`; committed on approval. |
| **Steering** | Mid-run input (steer / pause / resume / stop) the user or orchestrator sends to a running agent; applied at the next loop iteration boundary. |
| **Operative** | (Future) a saved, reusable Agent Run definition: role + brief + tool scope + optional schedule. |
| **Run Stack** | The live, transient collapsible cards (bottom-right) — the existing notification stack, extended. |
| **Work Panel** | The new persistent inbox + detail view: all runs (active + history), proposal review, actions. |

---

## Architecture at a glance

```
            ┌──────────── Triggers ────────────┐
   Chat orchestrator     Manual (UI button)     Scheduler (cron)
            └──────────────┬───────────────────┘
                           ▼  enqueue agent_run job (queue_jobs)
                  ┌───────────────────────┐
                  │   WORKER (Railway)     │  reuses tree_agent substrate
                  │   runAgentLoop()       │  headless loop, full tool surface − delegate
                  │   ├ ChatToolExecutor   │  writes COMMIT by default; STAGE only if review=true
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

| Doc | Covers |
|---|---|
| **00-OVERVIEW.md** (this) | North star, pivot, glossary, decisions, roadmap, open questions index |
| **01-EXECUTION-SUBSTRATE.md** | `agent_runs` schema, worker runner, the headless loop, envelope, entities capture, triggers, guardrails, async message injection |
| **02-STAGED-MUTATIONS.md** | Change Sets, write-tool dry-run/stage mode, approval flows, atomic commit, audit |
| **03-MONITORING-UI.md** | Run Stack (extend notification stack) + Work Panel (inbox/detail/proposal review) + realtime wiring |

---

## Phased roadmap (cross-cutting)

- **Phase 0 — Contracts & schema.** `agent_runs` + `agent_run_events` + `agent_run_signals` tables; envelope/Change Set types in `shared-types`; new SSE/event types; `agent_run` queue job type registered.
- **Phase 1 — Durable runner (worker).** `runAgentLoop` reusing tool surface + `ChatToolExecutor`; `submit_result`; telemetry `entities_touched`; budgets/guardrails. **Commit writes directly** (default; staging is a later opt-in phase).
- **Phase 2 — Run Stack (live UI).** Extend notification store with `agent_run` type; `agent-run-notification.bridge.ts` fed by `agent_runs` realtime; live cards. *(This is the "peek at background processes" the user asked for, MVP.)*
- **Phase 3 — Chat supervision + async injection.** `delegate_task` orchestrator tool; dispatch + monitor via realtime; agent-authored messages injected into the chat session on completion.
- **Phase 3.5 — Steering & interruption.** `agent_run_signals` drain in `runAgentLoop` (steer/pause/resume/cancel); steer/pause/stop endpoints; `AgentRunSteerControl` on the stack card. *(The "interject while it runs" ask.)*
- **Phase 4 — Staged mutations (opt-in).** `review` flag → write-tool stage mode; Change Set model; proposal review UI in the Work Panel; commit/reject. Off by default.
- **Phase 5 — Work Panel (full).** Persistent inbox, history, detail view (narration log + event timeline + entities + proposal diff), actions (cancel/retry/steer/answer).
- **Phase 6 — Triggers & Operatives.** Manual-dispatch button (with a "review changes" toggle); scheduled runs via existing scheduler; saved Operative definitions.

> Phases 2 and 3.5 are independently shippable value: Phase 2 gives visibility, Phase 3.5 gives control. Phase 4 (trust/staging) is opt-in and can come later. Order can flex.

---

## Open questions index (resolved in sub-specs)

- Turn-level + per-run budget accounting; excluding paused time from wall-clock deadline (01)
- Tagging `chat_tool_executions` with `agent_run_id` given detached persistence (01)
- Registry op → (entity type, action) coverage for all write tools (01, 02)
- Change Set granularity & atomicity / partial-commit semantics — for `review` runs only (02)
- Steering boundary latency & worker signal delivery (LISTEN vs per-iteration DB check); max-paused-before-auto-cancel (01 §9, 03)
- Realtime vs polling fallback thresholds for the Work Panel (03)
- Mobile placement of Run Stack vs Work Panel (03)
- Agent-authored message injection: how the chat re-renders without an open SSE stream (01, 03)

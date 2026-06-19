<!-- apps/web/docs/technical/architecture/agent-work/START-HERE.md -->

# Agent Work — Start Here (the simplified view)

**Status (2026-06-18):** The **interactive run lifecycle is built end-to-end** — dispatch (manual + from chat via `delegate_task`) → watch (Run Stack cards + in-chat dock + launcher badge) → steer / pause / resume → answer (`needs_input`) → result posts back into chat. Backend substrate + op-layer + runner are live-confirmed (read-only); everything after is green (worker typecheck + svelte-check) pending a live pass. **Not yet built:** write ops (Wave 7 — runs can read/analyze but not yet create/update), calendar (Waves 5–6), proposal review (Phase 4), Work Panel (UI-P2).
**Full specs:** [00-OVERVIEW](./00-OVERVIEW.md) · [01-EXECUTION-SUBSTRATE](./01-EXECUTION-SUBSTRATE.md) · [02-STAGED-MUTATIONS](./02-STAGED-MUTATIONS.md) · [03-MONITORING-UI](./03-MONITORING-UI.md)
**Execution detail:** [SHARED_AGENT_OPS_EXTRACTION_PLAN](./SHARED_AGENT_OPS_EXTRACTION_PLAN.md) · **[HANDOFF](./HANDOFF_2026-06-18.md)** ← pick up here

This is the plain-English entry point. Read it first; drop into the numbered specs for detail.

---

## What we're building, in one line

> **BuildOS gets a workforce, and the chat supervises it.**

An **Agent Run** is a durable background task that runs in the worker with a scoped BuildOS tool surface, does a bounded job on its own, and reports back. Unlike a chat turn, it isn't bounded by the 300-second request and isn't locked to the chat tab. You can **watch it, steer it mid-flight, and get notified when it's done.**

The agentic chat becomes the **supervisor** — one of several ways to start and monitor runs — not the thing that has to do all the work itself.

---

## Why (the ceiling we're breaking)

Today the chat does work _inside one request_: you ask → it calls tools → it answers → the turn ends. That's:

- **Ephemeral** — nothing persists as a first-class object.
- **Turn-locked** — the answer must arrive before the turn ends.
- **Chat-only** — no way to run the same work from a button or a schedule.

An Agent Run fixes all three: it's a persisted row, it runs in the background, and it can be triggered from chat, a manual button, or a cron schedule.

---

## The moving parts

| Piece                                                               | What it is                                                                                               | Built?                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **`agent_runs` / `_events` / `_signals` / `agent_tool_executions`** | Durable substrate (brief, status, result, event log, control channel, tool telemetry).                   | ✅ Phase 0/0.5                |
| **`@buildos/shared-agent-ops`**                                     | Extracted, worker-importable op layer (policy, ontology services, op execution).                         | ✅ Waves 0–4                  |
| **Op dispatcher (`executeAgentOp`)**                                | Scope-enforced op execution (read ops) reusing the extracted services.                                   | ✅ (read-first)               |
| **The runner (`agentRunWorker`)**                                   | Worker loop: JSON action-loop → ops → events + telemetry → `submit_result`. Registered as `agent_run`.   | ✅ Phase 1b (live-verified)   |
| **Dispatch/monitor/cancel API**                                     | `POST/GET /api/agent-runs`, `GET /[id]`, `POST /[id]/cancel`. Cancel drains in the runner.               | ✅                            |
| **Run Stack**                                                       | Live cards (bottom-right) showing active runs — extends the existing notification stack.                 | ✅ UI-P1 (visually confirmed) |
| **`delegate_task` tool + chat presence**                            | The chat orchestrator dispatches runs; in-chat dock + launcher badge; results post back into the thread. | ✅ Phase 3 + UI-P4            |
| **Steering (steer / pause / resume) + answer**                      | "Tell the agent something" box (pending→applied), pause/resume, and the `needs_input` answer box.        | ✅ Phase 3.5 + UI-P3 pt1      |
| **Write ops**                                                       | Create/update via the op layer (runs can read/analyze but not yet mutate).                               | ⬜ needs Wave 7 carve         |
| **Staged mutations / proposal review**                              | _Opt-in_ review-before-commit (a diff you approve). Off by default.                                      | ⬜ Phase 4 (needs write ops)  |
| **Work Panel**                                                      | Persistent inbox + history + detail + proposal review.                                                   | ⬜ UI-P2                      |
| **Calendar ops / gateway convergence**                              | GoogleOAuth `$env`→process.env (R4) + the ~5,100-line gateway handler carve.                             | ⬜ Waves 5–7                  |

Two key design decisions we locked:

1. **Mutations commit directly by default.** Review-before-commit is a per-run opt-in (`review: true`), not a tax on every run.
2. **Runs are steerable, not fire-and-forget.** You (or the supervising chat) can redirect/pause/stop a run while it's working.

---

## How it plugs into the agentic chat

The chat shifts from **doing** the work to **delegating + supervising** it. A small ask is still answered inline in one turn — nothing changes there. A big or long ask gets handed to background agents you and the chat can both watch.

```
  You (in chat): "Research X and restructure my project around it"
        │
        ▼
  Orchestrator turn (existing streamFastChat loop)
        │  calls a NEW tool: delegate_task({ brief, review? })
        ▼
  Insert agent_runs row + enqueue 'agent_run' job  ──▶ returns { run_ids } IMMEDIATELY
        │                                                (the turn does NOT block to completion)
        ▼
  Chat: "I've sent 2 agents on this — I'll update you." → turn ends
        │
        ▼
  WORKER → runAgentLoop()
     • uses worker-safe tool adapter + scoped tool surface, MINUS delegate_task (no recursion)
     • streams narration/tool-calls into agent_run_events
     • drains agent_run_signals each iteration (your steering)
     • finishes by calling submit_result → writes the RunResult envelope
        │
        ▼
  On completion: inject an assistant-authored message into chat_messages
        │
        ▼
  Chat UI renders it via new realtime/reload path (no open SSE stream needed)
```

The three integration seams:

1. **Dispatch — the `delegate_task` tool.** The only new thing the chat LLM learns. Orchestrator-only; subagents don't get it, which caps depth (also enforced by the DB `depth 0..1` constraint).
2. **The chat stops being turn-locked.** Dispatch is fire-and-observe: the turn ends, work continues in the worker, and the result comes _back into the conversation_ as a new assistant message. The chat becomes a persistent "Slack-with-agents" thread.
3. **Visibility & control.** Live runs surface in the Run Stack (global) and inline in the chat (when chat-triggered), both fed by one realtime source. Cards expose steer/pause/stop.

The important substrate correction: **Agent Runs are not chat sessions.** Chat-triggered runs link back to chat, but manual and scheduled runs must work without a `chat_messages.session_id`. Tool execution, activity logs, and entity receipts must be keyed by `agent_run_id`.

### Chat presence: open vs. closed (the part that must feel seamless)

The same runs render in two mount points — **the chat-attached dock when the modal is open, and the global Run Stack always.** See [03 §6](./03-MONITORING-UI.md) for the full spec. The behavior:

- **Chat open:** runs this session dispatched show as a live dock/strip inside the modal — you watch narration, steer, and see completions land as messages in the thread.
- **Chat closed:** runs don't stop or disappear. They keep going in the worker and remain in the global Run Stack. The chat entry point shows a **"N agents working"** badge so you know work is in flight.
- **On completion (either state):** a toast/push fires, and an agent-authored message is written to the thread — so when you reopen the chat, the result is already there.

---

## Build order

- **Phase 0.5** — contract hardening: regenerate DB types, add `agent_run` queue validation, and settle run-aware telemetry/tool-scope contracts.
- **Phase 1a** — worker-safe tool adapter: make the existing tool surface usable from the worker without relying on browser/SvelteKit request `fetch`, Supabase user sessions, or chat session IDs.
- **Phase 1b** — durable runner (first real behavior; read-only/manual first, then direct commits once receipts are reliable).
- **Phase 2** — Run Stack live cards (global visibility).
- **Phase 3** — `delegate_task` + async message injection + chat presence dock.
- **Phase 3.5** — steering.
- **Phase 4** — opt-in staged mutations.
- **Phase 5 / 6** — full Work Panel, manual + scheduled triggers, saved Operatives.

Phases 1b–2 stand alone (manually send an agent, watch it work). Phase 3 is what makes it feel like the chat is supervising a workforce.

---

## Right now / next step

Phase 0 schema is **applied**. Phase 0.5 is mostly **done in code** — what's left needs your Supabase credentials.

**Done (Phase 0.5):**

- ✅ Follow-up migration `20260616000000_agent_work_phase05.sql`: `scope_mode` + `allowed_ops` replace `allowed_capabilities`; new run-native `agent_tool_executions` telemetry table; dropped the superseded `chat_tool_executions.agent_run_id`.
- ✅ Telemetry decision: dedicated `agent_tool_executions` (not nullable `session_id` on the chat table).
- ✅ `shared-types`: `scope_mode`/`allowed_ops` on the brief + job metadata, `AgentToolExecution` type, `validateAgentRunMetadata` + a passing worker contract test. Package typechecks.

**Your turn (credential-gated, in order):**

1. Apply `20260616000000_agent_work_phase05.sql`.
2. `supabase login` (or set `SUPABASE_ACCESS_TOKEN`), then **`pnpm gen:types`** — pulls all Agent Work tables/enums + `'agent_run'` into generated types.
3. Uncomment the `case 'agent_run'` in `validateJobMetadata` (it's staged behind the regen), then `pnpm --filter @buildos/shared-types typecheck` + re-run the worker contract test.

**Then we resume building:** 4. Phase 1a — the worker-safe tool adapter. 5. Phase 1b — scaffold `runAgentLoop`.

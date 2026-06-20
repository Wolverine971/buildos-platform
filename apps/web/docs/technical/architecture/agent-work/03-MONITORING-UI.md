<!-- apps/web/docs/technical/architecture/agent-work/03-MONITORING-UI.md -->

# Agent Work — 03 Monitoring UI

**Status:** Implemented through Run Stack, Work Panel, proposal review, steering/answer, chat presence, and manual Work Panel dispatch · **Date:** 2026-06-15 design / 2026-06-19 implementation status · Part of the [Agent Work](./00-OVERVIEW.md) doc set.

The UI to **see what's running in the background and peek into it.** Two surfaces over one data source (`agent_runs` + `agent_run_events` via realtime):

1. **Run Stack** — live, transient, collapsible cards (bottom-right). _Extends the existing notification stack._
2. **Work Panel** — persistent inbox + detail view + proposal review. _New._

---

## 1. Reuse decision (important)

The old `NotificationStack` the user remembered is **not legacy** — it's live in `+layout.svelte`, Svelte 5 runes, Inkprint tokens, with a robust Map-based store and a proven **bridge pattern** (project-synthesis, calendar-analysis, time-block already feed it). So:

- **Run Stack = extend the notification system**, don't rebuild it.
- **Work Panel = new**, because the stack is transient; we need a durable inbox, history, detail, and proposal review.

| Existing piece                                                                                                  | Reuse?     | How                                                    |
| --------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| `notification.store.ts` (Map state, `add/update/setProgress/setStatus`, `expand/minimize`, session persistence) | ✅ reuse   | Add an `agent_run` notification type                   |
| `NotificationStackManager` / `NotificationStack` (stacking, +N more, fly-in, single-expanded)                   | ✅ reuse   | Render `agent_run` cards in the same stack             |
| Bridge pattern (`*-notification.bridge.ts`)                                                                     | ✅ reuse   | New `agent-run-notification.bridge.ts` fed by realtime |
| `realtimeBrief.service.ts` (postgres_changes on `queue_jobs`, polling fallback)                                 | ✅ pattern | New `agentRunsRealtime.service.ts` on `agent_runs`     |
| Lazy type-specific minimized/modal content                                                                      | ✅ reuse   | New `agent_run` minimized + modal views                |
| Work Panel (inbox/detail/proposal diff)                                                                         | ❌ new     | Build fresh                                            |

---

## 2. Realtime wiring

New `agentRunsRealtime.service.ts`, modeled on `realtimeBrief.service.ts`:

- **Channel:** `agent-runs:${userId}`, `postgres_changes` on `agent_runs` filtered `user_id=eq.${userId}`, events `*`.
- **Per-run trace (on demand):** when a run is opened in detail, subscribe broadcast `agent-run:${runId}` for `agent_run_events` (mirrors `treeAgentRealtime.service.ts`), so the narration log streams live.
- **Polling fallback:** if realtime unavailable, poll `/api/agent-runs?status=active` every 3–5s (mirrors brief polling).
- Maintains `activeRunsById: Map` for dedup; pushes into the notification store (Run Stack) and a `workRunsStore` (Work Panel).
- Requires Phase 0.5 typegen so `agent_runs` / `agent_run_events` exist in generated DB types. Avoid building the realtime service against `any` as the long-term contract.

```
agent_runs UPDATE ──▶ agentRunsRealtime ──┬─▶ notificationStore (Run Stack card)
                                          └─▶ workRunsStore     (Work Panel list)
agent_run_events    ──▶ (detail subscribe) ──▶ run detail narration/timeline
```

---

## 3. Run Stack (live cards)

Compact collapsible card per active/just-finished run, in the existing stack. Drives off run `status`:

| Status           | Card affordance                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `queued`         | spinner + "Queued", label, goal                                                                                                |
| `running`        | live narration tail (last line), elapsed time, tool-call count, progress if known + **steer/pause/stop controls**              |
| `paused`         | "Paused" badge + "Resume" / "Stop" + steer box still available; resume enqueues/claims a continuation                          |
| `needs_input`    | amber badge + the open question(s) + "Answer" action                                                                           |
| `proposal_ready` | "N changes proposed" + entity chips + "Review" action (opens Work Panel proposal) — only when run was dispatched with `review` |
| `completed`      | green check + 1-line summary + entity chips; auto-collapses after a beat                                                       |
| `partial`        | "Partial" + summary; if `open_questions` exist, show the same continuation box so the user can steer the next attempt          |
| `failed`         | red + error + "Retry" / "View"                                                                                                 |
| `cancelled`      | muted                                                                                                                          |

- **Nesting:** subagents (`parent_run_id`) render as indented child rows under the orchestrator run's card, so a fan-out reads as one group.
- **Card actions:** Steer, Pause/Resume, Stop (cancel), Retry, Open in Work Panel, Answer/Continue (`needs_input`, or `partial` with open questions).

### 3a. Steering from the card (interject while it runs)

The signature interaction: while a run is `running` or `paused`, the card exposes a compact **steer input** — a one-line "Tell the agent something…" box + send. Submitting it `POST`s a `steer` signal (01 §9); the worker applies it at the next iteration boundary.

- **Pending → applied feedback:** the steer shows as a pending chip on the card the instant it's sent, then flips to "applied" when the run emits the corresponding `run.steer` event. The user never wonders if it was heard.
- **Pause** checkpoints the run (status `paused`) so the user can read the narration and compose a steer without the agent racing ahead. The preferred substrate releases the worker slot while paused; **Resume** enqueues/claims a continuation. **Stop** cancels gracefully → `partial`.
- **Orchestrator parity:** the supervising chat can steer the same way programmatically (same endpoint, `source='orchestrator'`), so "the chat redirects an agent" and "the user redirects an agent" are one mechanism.
- The steer box and pause/stop also live in the Work Panel run detail (§4b) for runs not currently surfaced in the stack.
- **Entity chips:** small Inkprint chips — `✎ task`, `＋ doc` — from `entities_touched` (or proposed count).
- **Design:** narrower than the current 320–400px notification cards; reuse `shadow-ink`, semantic color tokens (`--info`/`--success`/`--destructive`/`--warning`).

---

## 4. Work Panel (persistent)

Openable surface (slide-over from the right on desktop; full-screen sheet on mobile). Entry points: a top-nav "Work" affordance with a live count badge of active runs, "Open in Work Panel" from any stack card, and the Work Panel header "Run agent" action for manual dispatch.

### 4a. Inbox (list)

- Sections: **Active** (queued/running/needs_input/proposal_ready) and **History** (completed/partial/failed/cancelled), filterable by project, trigger, date.
- Each row: status dot, label, goal, project, trigger icon, relative time, entity-count chip, a "needs you" flag for `needs_input`/`proposal_ready`.

### 4b. Run detail

- **Header:** label, goal, status, project link, trigger, budgets/metrics (tokens, cost, duration, tool calls).
- **Narration log + event timeline:** streamed from `agent_run_events` (`run.narration`, `run.tool_call`, `run.tool_result`) — this is the "peek into the process." Collapsible tool-call entries showing args/results.
- **Result:** `summary` + `answer`; artifact links; `open_questions` (with an answer box for `needs_input` and continuable `partial` runs).
- **Entities touched:** list of committed `EntityTouch` with deep links into the project and the touched entity. Dedicated task/document pages are used when available; modal-backed entities use the project page query opener.
- **Live steering** (while `running`/`paused`): the steer box + Pause/Resume/Stop (same as the stack card, §3a), with the running narration above it so the user reads, then redirects.
- **Actions:** Steer, Pause/Resume, Stop (cancel → `partial`), Retry (re-dispatch with edited brief), Answer.

### 4c. Proposal review (the opt-in trust UI — ties to 02)

Only appears for runs dispatched with `review` (`status='proposal_ready'`). Default runs commit directly and never reach this state. When `status='proposal_ready'`:

- Render the **Change Set as a diff list.** Each `ProposedChange`: action badge (＋/✎/🗑), entity type + name, `before`→`after` (field-level diff for updates; full draft for creates), and the agent's `rationale`.
- **Per-change approve/reject** toggles + "Approve all" / "Reject all".
- **Apply** → calls `commitChangeSet(run_id, decisions)`; shows applied/failed per change; run transitions to `completed`.
- Drift warning if `before` no longer matches current state (02 §7).

### 4d. Manual dispatch (initial Phase 6 trigger)

The Work Panel header opens `AgentRunDispatchModal.svelte`, which POSTs directly to `/api/agent-runs`:

- Required: `goal`.
- Optional: label, instructions, expected output.
- Context: global or project; project context loads selectable active/planning projects from `/api/projects`.
- Scope: read-only or read-write.
- Review: opt-in toggle, enabled only for read-write runs. Default remains `false` to preserve the direct-commit-by-default decision in 02.

After dispatch, the returned run is merged into both the Work Panel store and live agent-run store so it appears immediately while realtime/polling catches up.

---

## 5. Completion notifications

On terminal status (mirrors `realtimeBrief` toasts + push):

- `completed`: toast "Agent '{label}' finished — N changes." (or "proposed N changes — review")
- `proposal_ready` / `needs_input`: a stickier prompt because it needs the user.
- `failed`: error toast with Retry.
- Optional web push when the tab is backgrounded (long/scheduled runs).

---

## 6. Chat presence & the open/closed handoff

The runs a chat session dispatches must feel **attached to the conversation** while the modal is open, yet keep running (and stay visible globally) once it's closed. This is the same `agent_runs` data rendered in two mount points — never two copies of the work.

### 6a. Same runs, two mount points

- **`AgentRunCard.svelte` is shared.** The chat-attached dock and the global Run Stack render the identical component over the identical realtime source (`agentRunsRealtime`). The only difference is the **filter**:
    - **Chat dock** → runs where `parent_session_id = currentSessionId`.
    - **Global Run Stack** → all of the user's active runs.
- A run dispatched from chat therefore appears in _both_ simultaneously. Closing the chat just unmounts the dock view; the run and its Run Stack card are untouched.
- When the chat dock is open, suppress or dim duplicate global cards for the same session's runs so the user does not see two identical live controls in the same viewport.

### 6b. Chat OPEN — the in-modal run dock

`AgentChatModal.svelte` gains a compact **run dock** (a strip/section, e.g. below the message list or a collapsible tray) that lists this session's active runs:

- Live narration tail, status, entity chips, and the **steer/pause/stop** controls (§3a) — you watch and redirect without leaving the conversation.
- When a run reaches a terminal status, its **agent-authored message** (01 §7) lands in the message stream via `chat_messages` realtime, linking to the run / proposal. The dock entry then collapses to a finished chip.
- Subscribes to `chat_messages` for the session (new subscription) so injected messages render even though the original SSE turn ended.
- The current chat UI mostly updates message state from SSE/local state, so this subscription is new required behavior. On reconnect/open, the modal should reload the session messages as the durable source of truth and dedupe against any realtime inserts already applied.

### 6c. Chat CLOSED — the handoff (the explicit ask)

Closing the modal must **not** stop, hide, or orphan runs:

- Runs continue in the worker; their cards remain in the **global Run Stack**.
- The **chat entry point** (the launcher button / nav affordance that opens `AgentChatModal`) shows a live **"N agents working"** badge driven by a count of active runs for the user (or scoped to sessions, TBD §9). This is the "you closed the chat but two tasks are still running" signal.
- **On completion while closed:** a toast fires (§5), optional web push if backgrounded, and the agent-authored message is written to the thread — so reopening the chat shows the result already in place (no missed updates).
- **Reopening** re-mounts the dock and re-subscribes to this session's runs + `chat_messages`; nothing needs replaying because state lives in `agent_runs` / `chat_messages`, not in the SSE stream.

### 6d. What this requires (new vs. reuse)

| Need                                                | Reuse / New                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Global "agents working" surface independent of chat | ✅ existing `NotificationStackManager` at `+layout.svelte` (global mount) + new `agent_run` card type |
| In-chat run dock                                    | ❌ new section in `AgentChatModal.svelte` mounting `AgentRunCard` filtered by session                 |
| "N agents working" badge on the chat launcher       | ❌ new — small derived count from `agentRunsRealtime`                                                 |
| Completion → message in thread                      | ❌ new `chat_messages` realtime subscription + server-side message injection (01 §7)                  |
| Notify when closed                                  | ✅ toast (§5) + optional web push                                                                     |

> Net: the _global_ presence (closed-state) is mostly reuse of the live notification stack; the _in-chat_ presence and the completion-message injection are the new build, landing in Phase 3 (dispatch + injection) and Phase 2 (the card type the dock reuses).

---

## 7. Component inventory

**Reuse / extend:**

- `notification.store.ts` — add `agent_run` type + fields (status, narrationTail, entityChips, proposalCount, runId)
- `NotificationStack` / `NotificationStackManager` — render the new type
- new `agent-run-notification.bridge.ts` (pattern: `project-synthesis-notification.bridge.ts`)
- new `agentRunsRealtime.service.ts` (pattern: `realtimeBrief.service.ts` + `treeAgentRealtime.service.ts`)
- `WorkPanel.svelte` — persistent inbox/detail surface plus manual dispatch launcher
- `AgentRunDispatchModal.svelte` — initial manual trigger form with context/project/scope/review controls

**New:**

- in-chat **run dock** section in `AgentChatModal.svelte` (mounts `AgentRunCard` filtered by `parent_session_id`)
- **"N agents working"** badge on the chat launcher (derived active-run count from `agentRunsRealtime`)
- `chat_messages` realtime subscription for the open session (renders injected completion messages)
- session-message reload/dedupe path for reopen/reconnect, so injected messages are visible even if realtime was missed
- `workRunsStore.ts` — reactive store of all runs for the Work Panel
- `WorkPanel.svelte` (slide-over) + `WorkInboxList.svelte` + `WorkRunDetail.svelte`
- `AgentRunCard.svelte` (shared by Run Stack + chat inline)
- `AgentRunSteerControl.svelte` (steer box + Pause/Resume/Stop; shared by card + detail; pending/applied state)
- `ChangeSetReview.svelte` (proposal diff + approve/apply — only mounted for `review` runs)
- `AgentRunMinimized.svelte` / `AgentRunModalContent.svelte` (notification type-specific views)
- top-nav "Work" entry with active-count badge

**API (web):**

- `GET /api/agent-runs` (list, filters) · `GET /api/agent-runs/[id]` (detail + events) · `POST /api/agent-runs` (manual dispatch, incl. `review` flag) · `POST /api/agent-runs/[id]/cancel` · `POST /api/agent-runs/[id]/commit` (Change Set — only for `review` runs) · `POST /api/agent-runs/[id]/answer` (`needs_input`, plus `partial` continuation)
- **Steering:** `POST /api/agent-runs/[id]/steer` (`{ message }`) · `POST /api/agent-runs/[id]/pause` · `POST /api/agent-runs/[id]/resume` — each writes an `agent_run_signals` row (01 §9).

---

## 8. Phased UI roadmap

- ✅ **UI-P1 (with substrate Phase 2) — SHIPPED 2026-06-18:** `agentRunsRealtime` (postgres*changes + polling backbone) + notification-store `agent_run` type + bridge + lazy `AgentRunMinimizedView`/`AgentRunModalContent` → **Run Stack live**, with a detail modal that streams `agent-run:<id>` narration, shows metrics, and renders summary/answer as **markdown**. Built as notification-stack type-views (not a standalone `AgentRunCard.svelte` yet — that gets extracted for UI-P4's shared dock). \_Ships the "see background processes" ask.*
- ⏭️ **UI-P4 (chat presence, with substrate Phase 3) — NEXT (current arc):** in-chat run dock (shared card filtered by `parent_session_id`) + "N agents working" badge on the chat launcher (from `activeAgentRunCount`) + `chat_messages` realtime subscription so injected completion messages render in the thread. _(The open/closed handoff, §6.)_ Paired with the Phase 3 substrate: `delegate_task` + completion-message injection.
- ⬜ **UI-P1.5 (with substrate Phase 3.5 — steering):** `AgentRunSteerControl` on the card → steer/pause/resume/stop with pending→applied feedback. _Ships the "interject while it runs" ask._
- ✅ **UI-P3 (with substrate Phase 4 + answer flow):** `ChangeSetReview` proposal UI + commit (review runs); `needs_input` answer flow; `partial` with open questions can continue through the same answer endpoint.
- ⬜ **UI-P2 (with substrate Phase 5):** Work Panel inbox + run detail (narration log, entities, metrics) + actions (incl. steering in detail).
- ⬜ **UI-P5:** nesting (subagent child rows); mobile polish; web push when backgrounded.

> **Sequencing note (2026-06-18):** the canonical, dependency-ordered backlog now lives in `HANDOFF_2026-06-18.md` §5.D. UI-P4 was pulled ahead of UI-P1.5/P2/P3 per product priority (chat is the intended primary entry point for runs).

---

## 9. Open questions

- Run Stack vs Work Panel on **mobile** — likely collapse the stack to a single "N agents working" pill that opens the panel.
- **Noise control** when many scheduled runs fire — group by trigger/operative; quiet completed auto-commit runs.
- How much of the **event log** to stream into the stack card vs reserve for the detail view (perf on long runs).
- Whether the top-nav "Work" entry conflicts with existing nav density (coordinate with the mobile audit).
- **Steering latency UX:** how to represent the gap between a steer being sent and applied at the next iteration boundary — pending chip is the plan, but for very long tool calls the wait could be tens of seconds; consider showing "agent is mid-step, will apply after current action."
- **Steer vs answer:** `needs_input` already has an answer box; steering is unsolicited mid-run input. Keep them visually distinct so the user knows whether the agent is waiting (blocked) or just being redirected (still working).
- **Badge scope:** the chat-launcher "N agents working" count — all of the user's active runs, or only runs dispatched from the current/most-recent session? Global is simpler and matches the Run Stack; session-scoped is more precise but needs a "which session" notion when the modal is closed. Leaning global count, with the in-chat dock being the session-scoped view.
- **Dock vs Run Stack overlap when chat is open:** avoid showing the same run twice in the user's eyeline. Likely suppress the global Run Stack card (or dim it) for runs already visible in the open chat dock, and restore it on close.

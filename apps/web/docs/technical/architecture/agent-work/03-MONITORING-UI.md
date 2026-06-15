# Agent Work — 03 Monitoring UI

**Status:** Design · **Date:** 2026-06-15 · Part of the [Agent Work](./00-OVERVIEW.md) doc set.

The UI to **see what's running in the background and peek into it.** Two surfaces over one data source (`agent_runs` + `agent_run_events` via realtime):

1. **Run Stack** — live, transient, collapsible cards (bottom-right). *Extends the existing notification stack.*
2. **Work Panel** — persistent inbox + detail view + proposal review. *New.*

---

## 1. Reuse decision (important)

The old `NotificationStack` the user remembered is **not legacy** — it's live in `+layout.svelte`, Svelte 5 runes, Inkprint tokens, with a robust Map-based store and a proven **bridge pattern** (project-synthesis, calendar-analysis, time-block already feed it). So:

- **Run Stack = extend the notification system**, don't rebuild it.
- **Work Panel = new**, because the stack is transient; we need a durable inbox, history, detail, and proposal review.

| Existing piece | Reuse? | How |
|---|---|---|
| `notification.store.ts` (Map state, `add/update/setProgress/setStatus`, `expand/minimize`, session persistence) | ✅ reuse | Add an `agent_run` notification type |
| `NotificationStackManager` / `NotificationStack` (stacking, +N more, fly-in, single-expanded) | ✅ reuse | Render `agent_run` cards in the same stack |
| Bridge pattern (`*-notification.bridge.ts`) | ✅ reuse | New `agent-run-notification.bridge.ts` fed by realtime |
| `realtimeBrief.service.ts` (postgres_changes on `queue_jobs`, polling fallback) | ✅ pattern | New `agentRunsRealtime.service.ts` on `agent_runs` |
| Lazy type-specific minimized/modal content | ✅ reuse | New `agent_run` minimized + modal views |
| Work Panel (inbox/detail/proposal diff) | ❌ new | Build fresh |

---

## 2. Realtime wiring

New `agentRunsRealtime.service.ts`, modeled on `realtimeBrief.service.ts`:

- **Channel:** `agent-runs:${userId}`, `postgres_changes` on `agent_runs` filtered `user_id=eq.${userId}`, events `*`.
- **Per-run trace (on demand):** when a run is opened in detail, subscribe broadcast `agent-run:${runId}` for `agent_run_events` (mirrors `treeAgentRealtime.service.ts`), so the narration log streams live.
- **Polling fallback:** if realtime unavailable, poll `/api/agent-runs?status=active` every 3–5s (mirrors brief polling).
- Maintains `activeRunsById: Map` for dedup; pushes into the notification store (Run Stack) and a `workRunsStore` (Work Panel).

```
agent_runs UPDATE ──▶ agentRunsRealtime ──┬─▶ notificationStore (Run Stack card)
                                          └─▶ workRunsStore     (Work Panel list)
agent_run_events    ──▶ (detail subscribe) ──▶ run detail narration/timeline
```

---

## 3. Run Stack (live cards)

Compact collapsible card per active/just-finished run, in the existing stack. Drives off run `status`:

| Status | Card affordance |
|---|---|
| `queued` | spinner + "Queued", label, goal |
| `running` | live narration tail (last line), elapsed time, tool-call count, progress if known + **steer/pause/stop controls** |
| `paused` | "Paused" badge + "Resume" / "Stop" + steer box still available |
| `needs_input` | amber badge + the open question(s) + "Answer" action |
| `proposal_ready` | "N changes proposed" + entity chips + "Review" action (opens Work Panel proposal) — only when run was dispatched with `review` |
| `completed` | green check + 1-line summary + entity chips; auto-collapses after a beat |
| `partial` | "Partial" + summary + open questions (also how a steered/cancelled run lands) |
| `failed` | red + error + "Retry" / "View" |
| `cancelled` | muted |

- **Nesting:** subagents (`parent_run_id`) render as indented child rows under the orchestrator run's card, so a fan-out reads as one group.
- **Card actions:** Steer, Pause/Resume, Stop (cancel), Retry, Open in Work Panel, Answer (needs_input).

### 3a. Steering from the card (interject while it runs)

The signature interaction: while a run is `running` or `paused`, the card exposes a compact **steer input** — a one-line "Tell the agent something…" box + send. Submitting it `POST`s a `steer` signal (01 §9); the worker applies it at the next iteration boundary.

- **Pending → applied feedback:** the steer shows as a pending chip on the card the instant it's sent, then flips to "applied" when the run emits the corresponding `run.steer` event. The user never wonders if it was heard.
- **Pause** freezes the run (status `paused`) so the user can read the narration and compose a steer without the agent racing ahead; **Resume** continues. **Stop** cancels gracefully → `partial`.
- **Orchestrator parity:** the supervising chat can steer the same way programmatically (same endpoint, `source='orchestrator'`), so "the chat redirects an agent" and "the user redirects an agent" are one mechanism.
- The steer box and pause/stop also live in the Work Panel run detail (§4b) for runs not currently surfaced in the stack.
- **Entity chips:** small Inkprint chips — `✎ task`, `＋ doc` — from `entities_touched` (or proposed count).
- **Design:** narrower than the current 320–400px notification cards; reuse `shadow-ink`, semantic color tokens (`--info`/`--success`/`--destructive`/`--warning`).

---

## 4. Work Panel (persistent)

Openable surface (slide-over from the right on desktop; full-screen sheet on mobile). Entry points: a top-nav "Work" affordance with a live count badge of active runs, and "Open in Work Panel" from any stack card.

### 4a. Inbox (list)

- Sections: **Active** (queued/running/needs_input/proposal_ready) and **History** (completed/partial/failed/cancelled), filterable by project, trigger, date.
- Each row: status dot, label, goal, project, trigger icon, relative time, entity-count chip, a "needs you" flag for `needs_input`/`proposal_ready`.

### 4b. Run detail

- **Header:** label, goal, status, project, trigger, budgets/metrics (tokens, cost, duration, tool calls).
- **Narration log + event timeline:** streamed from `agent_run_events` (`run.narration`, `run.tool_call`, `run.tool_result`) — this is the "peek into the process." Collapsible tool-call entries showing args/results.
- **Result:** `summary` + `answer`; artifact links; `open_questions` (with an answer box for `needs_input`).
- **Entities touched:** list of committed `EntityTouch` with deep links into the project/task/doc.
- **Live steering** (while `running`/`paused`): the steer box + Pause/Resume/Stop (same as the stack card, §3a), with the running narration above it so the user reads, then redirects.
- **Actions:** Steer, Pause/Resume, Stop (cancel → `partial`), Retry (re-dispatch with edited brief), Answer.

### 4c. Proposal review (the opt-in trust UI — ties to 02)

Only appears for runs dispatched with `review` (`status='proposal_ready'`). Default runs commit directly and never reach this state. When `status='proposal_ready'`:

- Render the **Change Set as a diff list.** Each `ProposedChange`: action badge (＋/✎/🗑), entity type + name, `before`→`after` (field-level diff for updates; full draft for creates), and the agent's `rationale`.
- **Per-change approve/reject** toggles + "Approve all" / "Reject all".
- **Apply** → calls `commitChangeSet(run_id, decisions)`; shows applied/failed per change; run transitions to `completed`.
- Drift warning if `before` no longer matches current state (02 §7).

---

## 5. Completion notifications

On terminal status (mirrors `realtimeBrief` toasts + push):

- `completed`: toast "Agent '{label}' finished — N changes." (or "proposed N changes — review")
- `proposal_ready` / `needs_input`: a stickier prompt because it needs the user.
- `failed`: error toast with Retry.
- Optional web push when the tab is backgrounded (long/scheduled runs).

---

## 6. Chat integration

- The chat shows its own **inline run cards** while supervising (the orchestrator dispatched them) — same component as the Run Stack card, embedded in the message stream.
- On run completion, the **agent-authored message** (01 §7) appears in the thread via `chat_messages` realtime, linking to the run / proposal.
- So the user sees runs in two places consistently: inline in chat (when chat-triggered) and globally in the Run Stack / Work Panel (always).

---

## 7. Component inventory

**Reuse / extend:**
- `notification.store.ts` — add `agent_run` type + fields (status, narrationTail, entityChips, proposalCount, runId)
- `NotificationStack` / `NotificationStackManager` — render the new type
- new `agent-run-notification.bridge.ts` (pattern: `project-synthesis-notification.bridge.ts`)
- new `agentRunsRealtime.service.ts` (pattern: `realtimeBrief.service.ts` + `treeAgentRealtime.service.ts`)

**New:**
- `workRunsStore.ts` — reactive store of all runs for the Work Panel
- `WorkPanel.svelte` (slide-over) + `WorkInboxList.svelte` + `WorkRunDetail.svelte`
- `AgentRunCard.svelte` (shared by Run Stack + chat inline)
- `AgentRunSteerControl.svelte` (steer box + Pause/Resume/Stop; shared by card + detail; pending/applied state)
- `ChangeSetReview.svelte` (proposal diff + approve/apply — only mounted for `review` runs)
- `AgentRunMinimized.svelte` / `AgentRunModalContent.svelte` (notification type-specific views)
- top-nav "Work" entry with active-count badge

**API (web):**
- `GET /api/agent-runs` (list, filters) · `GET /api/agent-runs/[id]` (detail + events) · `POST /api/agent-runs` (manual dispatch, incl. `review` flag) · `POST /api/agent-runs/[id]/cancel` · `POST /api/agent-runs/[id]/commit` (Change Set — only for `review` runs) · `POST /api/agent-runs/[id]/answer`
- **Steering:** `POST /api/agent-runs/[id]/steer` (`{ message }`) · `POST /api/agent-runs/[id]/pause` · `POST /api/agent-runs/[id]/resume` — each writes an `agent_run_signals` row (01 §9).

---

## 8. Phased UI roadmap

- **UI-P1 (with substrate Phase 2):** `agentRunsRealtime` + notification-store `agent_run` type + bridge + `AgentRunCard` → **Run Stack live.** Minimal: queued/running/completed/failed. *Ships the "see background processes" ask.*
- **UI-P1.5 (with substrate Phase 3.5 — steering):** `AgentRunSteerControl` on the card → steer/pause/resume/stop with pending→applied feedback. *Ships the "interject while it runs" ask.*
- **UI-P2 (with substrate Phase 5):** Work Panel inbox + run detail (narration log, entities, metrics) + actions (incl. steering in detail).
- **UI-P3 (with substrate Phase 4):** `ChangeSetReview` proposal UI + commit; `needs_input` answer flow. *(Only relevant to `review` runs.)*
- **UI-P4:** chat inline cards + agent-authored message rendering; nesting; mobile polish; push notifications.

---

## 9. Open questions

- Run Stack vs Work Panel on **mobile** — likely collapse the stack to a single "N agents working" pill that opens the panel.
- **Noise control** when many scheduled runs fire — group by trigger/operative; quiet completed auto-commit runs.
- How much of the **event log** to stream into the stack card vs reserve for the detail view (perf on long runs).
- Whether the top-nav "Work" entry conflicts with existing nav density (coordinate with the mobile audit).
- **Steering latency UX:** how to represent the gap between a steer being sent and applied at the next iteration boundary — pending chip is the plan, but for very long tool calls the wait could be tens of seconds; consider showing "agent is mid-step, will apply after current action."
- **Steer vs answer:** `needs_input` already has an answer box; steering is unsolicited mid-run input. Keep them visually distinct so the user knows whether the agent is waiting (blocked) or just being redirected (still working).

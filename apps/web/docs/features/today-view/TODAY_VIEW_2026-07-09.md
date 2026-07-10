<!-- apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md -->

# Today View (`/today`)

**Created 2026-07-09.** First slice of the re-envisioned dashboard from the thinking-loop work
(`docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md`). The Today
view is the loop's **Surface** stage made concrete: one calm, time-ordered agenda for the day —
calendar events blended with tasks — where every item is chattable and decidable in place.

## What it does

- **Merged agenda.** Calendar events (via the `list_calendar_items` RPC, events only) interleaved
  with today's tasks (due today, starting today, or in progress) on a single time rail, in the
  user's timezone. Untimed tasks live in an "Anytime today" band; all-day events render as chips.
- **Now marker.** A current-time line in the schedule; in-progress events get a "Now" chip and
  accent treatment; past events dim.
- **Chat about anything.** Every row has a chat action. Tasks open agent chat with a task-scoped
  `initialProjectFocus` (same contract as `TaskEditModal`). Events open project- or
  calendar-scoped chat with a prefilled draft. Events that are backed by a task (`task_id`) route
  to task chat and carry the done toggle.
- **Chat about the whole day.** Header button seeds agent chat with a compact plain-text agenda
  draft (schedule + anytime tasks + overdue count) so one conversation can work the whole day.
- **Decide in place.** Tasks have an inline done toggle (optimistic, undoable, restores the prior
  state on undo). Attention lives in two compact chips — pending AI Inbox items (opens
  `DashboardInboxModal`) and overdue count (opens `OverdueTaskTriageModal`) — instead of stacked
  banners.
- **Open tasks in place** (added 2026-07-10). Every task row has an explicit task-details action
  that lazy-loads the existing `TaskEditModal`, including timed calendar events backed by a task.
  The project name is rendered separately as a labeled inline link, so opening the task stays on
  `/today` while opening its project remains a clear, distinct path.
- **Quick capture** (added 2026-07-10). A one-line voice-capable composer under the chips
  ("What changed? Brain-dump it — messy is fine."). Enter (or send) opens the agent chat with the
  text auto-sent — no context selector, no second Enter — the agent structures the update into
  project memory, and closing the chat refreshes both the agenda and the receipts below it. Two
  contracts make this work: `contextType: 'general'` (skips the modal's context selector and
  normalizes to workspace-wide/global scope downstream) and the new
  `autoSendInitialDraft` prop on `AgentChatModal` (fires `stream.handleSendMessage()` once, the
  moment the initialDraft lands in a ready composer). The submitted text gets a one-line
  instruction preamble so weaker routed models apply changes instead of just chatting.
- **What changed since you were here** (added 2026-07-10). A receipts section under the header:
  recent mutations across all projects, grouped by project, one collapsed entry per entity
  (latest action + ×N occurrence count), attributed to an actor — You / member name / Agent chat /
  Agent run / external agent caller name / Brain dump — with created/updated/deleted icons.
  Built entirely on `onto_project_logs` (the existing canonical activity log; no new table).
  The "since" anchor is the previous visit (localStorage `buildos:today:last-visit-at`, held
  steady across reloads via sessionStorage, clamped server-side to 7 days, default 24h). Hidden
  when empty. Edge (relationship) logs are excluded as structural noise.

## Files

| Piece                   | Path                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Shared types            | `apps/web/src/lib/types/today.ts`                                                            |
| Feed assembly (server)  | `apps/web/src/lib/server/today-feed.service.ts`                                              |
| Refresh endpoint        | `apps/web/src/routes/api/today/+server.ts` (GET)                                             |
| Route                   | `apps/web/src/routes/today/{+page.server.ts,+page.svelte}`                                   |
| Agenda row              | `apps/web/src/lib/components/today/TodayAgendaRow.svelte`                                    |
| What-changed service    | `apps/web/src/lib/server/what-changed.service.ts`                                            |
| What-changed endpoint   | `apps/web/src/routes/api/today/changes/+server.ts` (GET, `since` param)                      |
| What-changed UI         | `apps/web/src/lib/components/today/WhatChangedSection.svelte`                                |
| Log enrichment (shared) | `apps/web/src/lib/server/project-logs-enrich.ts` (extracted from the per-project logs route) |
| Entry points            | `Navigation.svelte` navItems (`Today`), `AnalyticsDashboard.svelte` header button            |

## Data notes

- Day bounds are computed in the user's timezone (`users.timezone`, `date-fns-tz` `fromZonedTime`)
  and passed as UTC ISO to both the calendar RPC and the task query.
- Task query: non-paused visible projects → `onto_tasks` with active states
  (`todo/in_progress/blocked`) AND (due today OR starts today OR `in_progress`). Bucket priority:
  `due_today` > `starts_today` > `in_progress`.
- Task markers from the calendar RPC are excluded (`include_task_*: false`) — tasks come from the
  task query directly, which avoids dedup. Events carrying a `task_id` that matches a fetched task
  are merged (event row represents the task).
- A task due/starting at local midnight is treated as date-only → "Anytime today", not 12:00 AM.

## Mobile

Audited + hardened 2026-07-10. The page is mobile-first throughout (`sm:` breakpoints, wrapping
chip rows, short "My day" button label, `min-w-0` header block, composer with `flex-1 min-w-0` +
`shrink-0` send). Hardening pass fixed the flex-truncation pitfall class (a `truncate` flex child
without `min-w-0` refuses to shrink and forces horizontal overflow at phone widths):
`TodayAgendaRow` meta label, `WhatChangedSection` project-name link, entity-name span, and the
actor cluster (which also got a `max-w-20 sm:max-w-40` cap for long external-caller names).

Caveat: this was verified at the code level plus desktop rendering — a true 390px pixel pass
couldn't be captured in-session (browser zoom pins the automation viewport at desktop width).
Worth one manual check on a real phone after deploy: agenda rows (3 actions + done toggle),
What-changed rows, and the voice capture composer.

## Deliberate scope cuts (follow-ups)

- What-changed follow-ups: click-through from a receipt to the entity (currently the group links
  to the project), a per-receipt "chat about this change" action, and folding agent-run
  `entities_touched` / `agent_tool_executions` in for run-level receipts.
- Quick-capture follow-ups: inline (non-modal) processing state, project-targeting hints
  ("@project" affordance), and capture history.
- Server-seeded whole-day chat session (inbox-style seed message instead of a composer draft).
- Making `/today` the default post-login landing (flip the `/` redirect once it earns it).
- Task reschedule/push-to-tomorrow action; priority display; multi-day peek.

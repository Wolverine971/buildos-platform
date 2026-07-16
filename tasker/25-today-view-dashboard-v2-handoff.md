<!-- tasker/25-today-view-dashboard-v2-handoff.md -->

# 25 - Today View / Dashboard v2 — Handoff

**Created 2026-07-10.** Owner: next product/engineering agent.
**Type:** state-of-the-world + prioritized next work. The build described here is DONE and committed (`4395206f`); this doc is what's left.

## State of the world

`/today` is the re-envisioned dashboard, built as the concrete form of the thinking loop
(Capture → Structure → Surface → Decide → Update). All shipped, live-verified against DJ's real
data, typecheck + tests green, committed:

1. **Merged agenda** — calendar events + tasks (due/starting today, in-progress) on one time rail
   in the user's timezone, with a now-marker, "Anytime today" band, all-day chips.
2. **Chat everywhere** — per-task chat (task focus), per-event chat, "Chat about my day"
   (agenda-seeded draft), plus task-details open-in-place (`TaskEditModal`).
3. **Decide in place** — done toggles (optimistic, undoable), inbox + overdue chips replacing
   stacked banners.
4. **"What changed since you were here" receipts** — cross-project change feed built on
   `onto_project_logs` (NO new table; see invariants), actor-attributed, collapsed per entity,
   grouped by project, anchored to last visit.
5. **Quick capture** — voice-capable one-line composer; submit auto-sends into agent chat
   (selector-free), agent applies changes, receipts show the result. Whole loop closes on one page.

**Read first:**

- `apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md` — the feature doc: files table,
  data notes, mobile notes, follow-up list. This is the canonical reference.
- `docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md` — the loop
  model + rubric every feature should be scored against.
- `docs/product/thinking-loop-plan-of-attack-2026-07-07.md` — the phased plan this work belongs
  to (the /today work = Phase 2 receipts + returning-user surface, pulled ahead of Phase 1).

## Prioritized next work

### 1. Phase 0 research closure (cheap, unblocks Phase 1)

`tasker/22-activation-as-strategy-assessment.md` and `tasker/23-day-30-moat-context-compounding.md`
have NO outputs yet (`docs/product/` contains only the two thinking-loop docs). Both are research
docs an agent can run autonomously, and both directly shape the Phase 1 onboarding build.

### 2. AI Inbox / Project Inbox live smoke closure (standing verification debt)

`tasker/13-ai-inbox-verify-and-cleanup.md` — the thinking-loop plan's Phase 0 lists this as the
gate for broadening Project Loops exposure. Still open.

### 3. Loop telemetry on /today (nothing is instrumented)

The synthesis defines a loop telemetry envelope (`loop_surface_shown`, `loop_capture_submitted`,
`loop_decision_made`, `loop_update_applied`, receipt-viewed, etc.). `/today` currently emits ZERO
analytics events — no capture-submitted, no receipt-section-viewed, no done-toggle events. Before
judging whether the loop works, instrument it. PostHog is already wired app-wide
(`PUBLIC_POSTHOG_KEY`, no-ops without a key). Keep payloads to IDs/counts/stage transitions — no
content.

### 4. Phase 1: onboarding activation (the next big build)

Per the plan-of-attack: inline first brain dump in onboarding, transformation receipt ("I found
this project, these tasks, this next move"), gate non-explore zero-project completion, activation
funnel events. Spec references: `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`

- `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md`. The /today quick-capture
  contracts (selector-free `'general'` context + `autoSendInitialDraft`) are reusable here.

### 5. /today polish backlog (small, independent)

From the feature doc's follow-ups, roughly in value order:

- **Receipt → entity click-through** — receipts currently link to the project; deep-link to the
  entity (reuse `buildProjectEntityOpenHref` from `project-page-interactions`).
- **Per-receipt "chat about this change"** — task receipts can reuse the task-focus contract.
- **`/` redirect flip** — one line in `apps/web/src/routes/+page.server.ts` (currently
  `/dashboard`); DJ's call after living with /today.
- **Inline capture processing state** — let quick capture run without opening the modal
  (harder: needs a headless turn or run dispatch; consider an agent_run instead of chat).
- **Run-level receipts** — fold `agent_runs.result.entities_touched` / `agent_tool_executions`
  into What Changed for agent-run work.
- Reschedule/push-to-tomorrow row action; multi-day peek; capture @project targeting hints.
- **Real-phone mobile check** — code-hardened but not pixel-verified (see landmine below).

## Landmines & invariants (do not relearn these)

- **`onto_project_logs` is THE receipt substrate.** Every mutation path already writes it
  (REST endpoints via `X-Change-Source` header, shared-agent-ops gateway = `agent_call`, worker
  chat processor = `chat`, external agents carry `external_agent_caller_id`). Do NOT invent a new
  receipt table. Cross-project read path: `$lib/server/what-changed.service.ts`; enrichment shared
  at `$lib/server/project-logs-enrich.ts` (also used by `/api/onto/projects/[id]/logs`).
- **Date-only conventions:** tasks due/starting at local `00:00` or `23:59` are "Anytime today",
  not time-rail entries (`hasClockTime` in `routes/today/+page.svelte`). 23:59 dues WILL flood the
  rail if this is removed.
- **Calendar RPC task-markers are OFF** in the today feed (`include_task_*: false`); tasks come
  from the task query. Events with a matching `task_id` merge into one row that carries task
  affordances.
- **Selector-free workspace chat = `contextType: 'general'`** (not `'global'`, which shows the
  context selector). `'general'` takes the modal's direct-context path and normalizes to global
  scope downstream (`normalizeAgenticChatContextType`).
- **`autoSendInitialDraft` prop on `AgentChatModal`** fires the send once when the draft lands in
  a ready composer. The draft effect deliberately HOLDS while a context/action selector is up —
  choosing a context runs `resetConversation` which clears the composer (this also fixed the
  `?open=agent-chat&prompt=` launch path). Don't "simplify" that guard away.
- **What-changed anchor:** localStorage `buildos:today:last-visit-at` + sessionStorage
  `buildos:today:changes-since` (holds the window steady across reloads); server clamps to 7 days.
- **Flex truncation:** a `truncate` flex child needs `min-w-0` or it forces horizontal overflow at
  phone widths. This was fixed in agenda rows + what-changed rows; keep the pattern.
- **Mobile pixel-testing via claude-in-chrome is impossible on DJ's machine:** his browser zoom
  pins the automation viewport at desktop width; synthetic keys can't reset zoom and System Events
  lacks accessibility permission. Verify phone rendering on an actual phone.
- **Dev server:** `pnpm dev --filter=@buildos/web` (NOT `--filter=web`; CLAUDE.md was fixed).
- **Parallel sessions are normal in this repo.** During this build another session shipped the
  lite-prompt audit WPs and added task-details/project-link affordances to the agenda rows. Before
  blaming your diff for a test failure, check file mtimes in `agentic-chat-lite/` — mid-edit
  failures from a sibling session look identical to regressions. Scope your verification to the
  suites covering your files.

## Definition of done for this handoff

- ✅ tasker/22 + tasker/23 outputs exist in `docs/product/` (done 2026-07-10:
  `activation-as-strategy-assessment-2026-07-07.md`, `day-30-moat-context-compounding-2026-07-07.md`).
- ✅ /today emits loop telemetry (done 2026-07-10: `$lib/services/loop-telemetry.ts` +
  page wiring — surface shown, receipt viewed, capture submitted, done toggled,
  chat opened by source, chip/task-details/receipt opens; see the feature doc's telemetry section).
- ✅ Phase 1 onboarding slice is scoped with the activation research in hand →
  **`tasker/26-phase1-onboarding-activation-slice.md`** (build gated on 3 DJ decisions listed there).
- ✅ Polish items #1 (receipt → entity click-through) and #2 (per-receipt chat, task receipts)
  done 2026-07-10, live-verified, checked off in the feature doc. Remaining polish items still open.

**Status 2026-07-10 (this handoff is now substantially closed).** Remaining from the original
list: AI Inbox live smoke closure (tasker/13, untouched), `/` redirect flip (DJ's call, now also
decision 1 in tasker/26), inline capture processing state, run-level receipts, reschedule action,
multi-day peek, @project hints, real-phone mobile check. Next big build: tasker/26.

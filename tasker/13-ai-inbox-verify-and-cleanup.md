<!-- tasker/13-ai-inbox-verify-and-cleanup.md -->

# 13 — AI Inbox v1: smoke-test, apply migrations, retire legacy panel

**Status: CLOSED 2026-07-11.** See the "Close-out 2026-07-11" section at the bottom —
migrations verified live in prod, replay-suppression route tests added, both targeted
live smokes run green, and the manual checklist executed/recorded. Residual (relocated)
items are listed there.

**Priority:** P1 — feature shipped in the last day; needs verification before user exposure
**Type:** Engineering (QA + deploy + cleanup)
**Sources:** `apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md`, `apps/web/docs/technical/architecture/agent-work/AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`, `docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md`

## State — what shipped (2026-06-24/25)

The unified mutation-review queue is built and wired end-to-end:

- ✅ `inbox_items` index + adapters for `agent_run`, `project_suggestion`, `calendar_suggestion`
- ✅ Endpoints `GET /api/inbox`, `GET /api/inbox/count`, `POST /api/inbox/decide` (with batch + stale-row reconciliation)
- ✅ Project Inbox tab (`ProjectInboxPanel.svelte`) + Dashboard modal (`DashboardInboxModal.svelte`), grouped by project/account
- ✅ `project-suggestion-actions.service.ts` (freshness guard, feedback, idempotent claim) + passing unit tests
- ✅ All producers call `syncInboxItem…` (agent runs, Project Reviews, Start Here capture, calendar)
- ✅ First loop-parent context slice: `/api/inbox?include_payload=1` now returns
  `source_context.project_loop_run` for project-loop items, and Project
  Inbox/Dashboard Inbox render the originating review run metadata.
- ✅ Project-suggestion Chat slice: shared proposal context utilities,
  `project_suggestions.chat_session_id`, seeded chat-session endpoint, Chat
  buttons in Project Inbox/Dashboard Inbox, and focused endpoint tests.
- ✅ Inbox Chat/action-label slice: `POST /api/inbox/[item_id]/chat-session`
  is the UI-facing route for supported inbox sources, Project Inbox/Dashboard
  Inbox now show `Accept`, `Dismiss`, and `Chat`, and agent-run Change Set cards
  expose Chat through `ChangeSetReview`.
- ✅ Calendar Inbox Accept claim fix: migration
  `20260627000000_calendar_suggestion_processing_status.sql` allows the
  short-lived `processing` status used as the atomic claim before creating the
  project/tasks, and the service now reports the underlying Supabase claim
  error instead of hiding it.
- ✅ Calendar Accept retry handling now treats active `processing` rows as
  already in progress, syncs the inbox item to `deciding`, and safely reclaims
  stale `processing` rows before retrying project/task creation.
- ✅ Calendar suggestion finalization now updates only the user's claimed source
  row, reports the underlying Supabase error, and migration
  `20260627001000_calendar_suggestion_created_project_fk.sql` realigns
  `created_project_id` to `onto_projects`, matching the ontology project
  instantiator.
- ✅ Inbox decision UX now removes accepted/dismissed cards from the Project
  Inbox and Dashboard Inbox immediately, moves processing state into the
  bottom-right notification stack, shows the final toast there, and silently
  reloads the inbox only when the decision request fails.
- ✅ Inbox decision persistence now enforces the status handoff in
  `POST /api/inbox/decide`: after a successful source decision, stale or failed
  source sync is repaired by forcing the matching `inbox_items` row out of
  `pending`, so handled items do not reload into the inbox.
- ✅ Project-suggestion dismissal feedback UI is wired: Project Inbox and
  Dashboard Inbox expose reason/note fields, preserve those values through
  optimistic removal, and allow truly bare dismissals to fall back to
  `dismissed_without_note`. Verified with
  `pnpm --filter=web test -- apps/web/src/routes/api/inbox/decide/server.test.ts`
  (repo expanded to 317 files / 1998 tests) and `pnpm --filter=web check`.
- ✅ Inbox Chat resolution hook is implemented: Project Inbox and Dashboard
  Inbox call `POST /api/inbox/[item_id]/resolve-from-chat` when an inbox-origin
  chat closes with successful mutations. Discussion-only chats keep the card
  pending; mutation chats settle supported source rows and sync `inbox_items`.
- ✅ Legacy project-loop review surface retired:
  `apps/web/src/lib/components/project/ProjectSuggestionsPanel.svelte` was
  imported nowhere and has been deleted. `ProjectInboxPanel` is the sole
  project-scoped loop review surface.
- ✅ Phase 3 (profile fragments / contact merge) and Phase 4 (loops/calendar emit true ChangeSets) intentionally deferred

## Refresh 2026-07-02 — more hardening landed; smoke tests remain THE gap

The uncommitted worker wave hardens the loop pipeline further: `projectLoopWorker.ts` status-fenced atomic claim (`queued`→`running`, prevents stall-reclaim double-execution) + heartbeat across the ~5 LLM calls; `enqueue.ts` stable per-day dedup key (`project-loop:{projectId}:{YYYY-MM-DD}` — the old per-runId key never deduped); `projectLoops.ts` flag resolver where explicit `ENABLE_PROJECT_LOOPS` always wins (fixes dev-default overriding an explicit `false`). New `projectLoopStallReclaim.test.ts` (7 tests); worker suite 265/265 green. All uncommitted — see [[15-commit-staged-work]].

The manual smoke docs/checklists are still `Pass / Fail` placeholders with blank run headers. START HERE's prod deploy was closed 7/01, proving the migration path works — the inbox migrations' prod state should be verified the same way.

## Refresh 2026-07-07 — audit packet + burst debounce hardening in progress

This thread has moved the overdue-triage/complete-audit path away from one inbox item per generated child suggestion:

- ✅ `project_audit` is now an `inbox_items.source_type` via
  `20260707060000_project_audit_inbox_source.sql`; user reports the migration
  has been applied.
- ✅ Existing active child `project_suggestion` inbox rows linked through
  `project_audit_suggestions` are expired by the migration as
  `grouped_into_project_audit`, preserving decided history.
- ✅ Worker audit completion now syncs one parent audit inbox packet and expires
  linked active child suggestion rows, instead of surfacing every audit child as
  a standalone dashboard inbox card.
- ✅ Dashboard Inbox and Project Inbox render `project_audit` items as chat-first
  audit packets with recommendation counts/confidence context, not direct
  approve/reject cards.
- ✅ Overdue triage backlog cleanup sends body-level
  `project_review_context` with `review_policy:'debounced'`; the task PATCH
  route records a coalesced `project_review_signals` row instead of immediately
  queueing burst review work for each task.
- ✅ Debounced review-signal worker coverage now checks not-due reschedule,
  conditional claim loss, and exactly-one light-loop/complete-audit enqueue from
  a claimed packet.
- ✅ Project-suggestion replay no longer emits `X-Skip-Project-Loop-Burst` from
  production code. Replay requests inject structured `project_review_context`
  (`origin:'project_suggestion_replay'`, `review_policy:'suppress'`), and the
  burst-wired mutation routes honor it. The header remains only as a legacy
  fallback.

Verification run so far:

- `pnpm --filter @buildos/shared-agent-ops typecheck`
- `pnpm --filter @buildos/shared-agent-ops build`
- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/worker test:run tests/inboxIndex.test.ts tests/projectLoopDebouncedReviewSignal.test.ts`
- `pnpm --filter @buildos/web check`
- `pnpm --filter @buildos/web test:run src/lib/server/project-loop-burst.service.test.ts src/lib/server/project-suggestion-actions.service.test.ts 'src/routes/api/onto/tasks/[id]/task-patch-completion-sync.test.ts'`
- `pnpm --filter @buildos/web test:run src/routes/api/onto/documents/create/server.test.ts src/routes/api/onto/tasks/create/task-create-assignment-mentions.test.ts`

Still open before calling the flow done:

1. Add route-level replay-suppression tests for document PATCH/archive/restore
   and doc-tree move; the routes are wired and typechecked, but not all have
   direct behavioral tests.
2. Run a live smoke with overdue triage bulk backlog: confirm one pending
   `project_review_signals` row, one delayed queue job, no immediate burst loop
   per task, and one holistic project-audit inbox packet after processing.
3. Run a live smoke for accepting a project suggestion that mutates a task/doc:
   confirm the replay request body carries `project_review_context` and no new
   recursive burst loop is queued.

## Loose ends (refreshed 2026-07-01)

1. **Manual smoke tests still not run — and the debt now spans THREE checklists**, not one:
    - `docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md` (all `Pass / Fail` placeholders; also untracked in git)
    - `docs/testing/MANUAL_AGENT_WORK_SMOKE_TESTS_2026-06-20.md`
    - Newer debts: clarified-decision delegated-run reconciliation + 3-active-run degraded path (clarified spec §verification), and live-notification status-modal Chat for the run→chat context bridge (`AGENT_RUN_CHAT_CONTEXT_BRIDGE_PLAN_2026-06-29.md` — all 9 build steps done, manual smoke from live notifications is the only open item).
2. **Type regen ✅ DONE** (`database.schema.ts` regenerated 2026-06-30, `inbox_items` present). All six migrations are committed. **Prod application unverified** — still gates enabling `PROJECT_LOOPS_ENABLED` beyond dev. (Calendar smoke needs a Google-connected account — overlaps [[08-calendar-live-smoke]].)
3. **3 open design questions (non-blocking)** — toast deep-link vs inline modal; "Account" grouping label; which producer converges to true ChangeSet first (Phase 4/6).
4. **Since 6/25, more code landed that this file didn't track**: run→chat context bridge (shared seeded session across status-modal Chat and Inbox Chat, commits `50fe757e`/`eb84a8ff`), in-chat `Mark handled`/`Dismiss` resolution (`resolve-from-chat`), and burst-trigger weighted-score hardening (staged, uncommitted — see [[15-commit-staged-work]]).

## Next action

1. Apply all listed AI Inbox migrations + `pnpm gen:types`; start web + worker.
2. Run the smoke test checklist against a throwaway user/project; record Pass/Fail; delete the test data after.
3. Apply migrations in prod before enabling `PROJECT_LOOPS_ENABLED` anywhere beyond local/dev.

## Post-stabilization sequence

Once v1 is green, do the next architecture work in this order:

1. Make loop parent context first-class in Inbox payloads/UI:
   `project_loop_runs` -> `project_suggestions` -> `inbox_items`. Initial
   code slice is in place; verify it in the manual smoke tests before moving
   on.
2. Implement Chat for inbox items with seeded context. Project-suggestion Chat
   with a shared proposal context builder/decoder was done in the 2026-06-26
   slice; the 2026-06-28 slice generalized the UI route to
   `/api/inbox/[item_id]/chat-session` for project suggestions, agent-run
   change sets, and calendar suggestions. Smoke-test all three sources once
   migrations are applied. A follow-up 2026-06-28 slice added
   `/api/inbox/[item_id]/resolve-from-chat` for mutation-gated source
   settlement from inbox-origin chats.
3. Implement clarified project-suggestion decisions with child `agent_runs`
   linked back to the suggestion and loop context. Done in the 2026-06-26
   slice; smoke-test delegated run reconciliation.
4. Add recurrence prevention by feeding prior decided suggestions and user
   feedback into the project-loop prompts. Done in the 2026-06-26 slice;
   smoke-test that dismissed rationale appears in later review context.
5. Keep Complete Project Audit on a separate track as a future `project_audits`
   report artifact, not as another `project_suggestions.kind`.

## Done when

Smoke tests logged green, migrations live, and shared DB types regenerated.

## Close-out 2026-07-11 (Claude session, DJ overnight)

### 1. Prod migrations — VERIFIED LIVE

All AI Inbox migrations verified applied in the production Supabase instance via
service-role PostgREST probes (tables/columns selected directly; FKs proven via
PostgREST relationship embeds, which only resolve when the FK exists):

- `20260624010000_ai_inbox_items` — `inbox_items` + core columns ✅
- `20260625000000_project_loop_run_brief` — `project_loop_runs.brief` ✅
- `20260626000000_project_suggestion_chat_link` — `chat_session_id` ✅
- `20260626010000_clarified_project_suggestion_decisions` — columns + `agent_runs` FK embed ✅
- `20260627000000_calendar_suggestion_processing_status` — column + live `processing` rows ✅
- `20260627001000_calendar_suggestion_created_project_fk` — embed to `onto_projects` resolves ✅
- `20260707050000_project_review_signals` — table present ✅
- `20260707060000_project_audit_inbox_source` — `project_audit` inbox rows + `grouped_into_project_audit` backfill rows present ✅

Prod observation: 2 `calendar_project_suggestions` rows stuck in `processing`
(user `255735ad`, updated 2026-06-27) — stale claims; the Accept retry path is designed
to reclaim them.

### 2. Replay-suppression route tests — DONE (open item #1)

New behavioral tests following the `task-patch-completion-sync.test.ts` pattern
(spy only `queueProjectLoopBurstAsync`, real decision logic via `vi.importActual`):

- `apps/web/src/routes/api/onto/documents/[id]/document-patch-replay-suppression.test.ts`
  — update, archive, and restore branches each suppress on
  `project_review_context.review_policy='suppress'`; negative control proves the rig
  reaches the burst site. (4 tests)
- `apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/doc-tree-move-replay-suppression.test.ts`
  — move suppress + negative control. (2 tests)

6/6 green; neighboring suites (15 tests) unaffected.

### 3. Live smoke: overdue-triage debounced backlog cleanup — GREEN (open item #2)

Driven through the real Project Batch Triage UI ("Move all to backlog" on a throwaway
project with 3 overdue tasks, project `5b80b39f-c590-425c-9fcd-797936410a33`, deleted
after):

- Exactly ONE pending `project_review_signals` row — `review_policy='debounced'`,
  `origin='overdue_triage'`, `operation_kind='bulk_backlog'`, `entity_count=3`, one
  shared `operation_id`, `due_at = now+60s`. ✅
- Exactly ONE delayed `buildos_project_loop` job — `metadata.mode='debounced_review_signal'`,
  `dedup_key='project-review-signal:{projectId}'`, `scheduled_for=due_at`. ✅
- NO immediate burst loop per task. ✅
- Worker claimed the signal at due time and fanned out: `processed_loop_run_id` set
  (loop enqueued) and the complete-audit trigger evaluated. ✅
- The audit leg correctly DECLINED for the throwaway project (recorded on the signal:
  "below complete-audit baseline: project_too_new, not_enough_activity_days, …") — the
  4-gate evaluator working as designed; tiny projects can't produce an audit packet.
  The one-parent-audit-packet behavior is instead evidenced in prod: 3 live
  `source_type='project_audit'` inbox packets + expired `grouped_into_project_audit`
  children, and the dashboard modal's "BuildOS · Audit Jul 6" group.
- Observation (minor): the three parallel task PATCHes race the coalescing upsert, so
  the surviving signal had `entity_ids` with 1 of 3 task ids and `signal_count=1`.
  Correctness is unaffected (review scope is the whole project; the partial unique
  index guarantees one pending signal), but the coalescing counters under-merge under
  concurrency.

### 4. Live smoke: suggestion accept-replay suppression — GREEN (open item #3)

Accepted a pending task-mutating suggestion from the Project Inbox UI:

- Source ended `applied`, `result={ok:true, applied_operations:1}`; the target task's
  title/description actually changed (activity feed attributed it "via chat" —
  ChatToolExecutor replay). ✅
- Matching `inbox_items` row ended `decided`/`applied`. ✅
- ZERO new `buildos_project_loop` jobs and ZERO new `project_review_signals` after the
  accept — the injected `project_review_context`
  (`origin='project_suggestion_replay'`, `review_policy='suppress'`) suppressed the
  burst end-to-end. ✅ (Route-level tests in §2 pin the same contract per route.)

### 5. Manual checklist — EXECUTED & RECORDED

`docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md` now carries the full run record
(run header + per-section results). Summary: §1, §3, §3A, §7 (repair+backfill), §8, §9
**Pass**; §4, §4A, §3B, §10 **Partial** (details in doc); §2 agent-run, §5 calendar,
§6 read-only **Not run** (no review-mode run on the throwaway / no pending calendar
suggestion / no second user). Extra coverage beyond the checklist: dismiss-with-feedback
took the clarified-decision path — child `agent_runs` row (`source_decision='dismiss'`)
completed and settled the source to `rejected` with `user_feedback` — i.e. the
delegated-run reconciliation debt from "Loose ends #1" was verified live.

### 6. Findings / fixes shipped in this pass

1. **Worker dotenv ordering bug — FIXED.** `apps/worker/src/index.ts` called
   `dotenv.config()` in the module body, but static imports are hoisted, so every
   module-level `process.env` read (notably `config/projectLoops.ts` →
   `PROJECT_LOOPS_ENABLED`) evaluated BEFORE `.env` loaded. Net effect: enabling
   Project Reviews via `apps/worker/.env` silently did nothing (burst run failed
   `feature_disabled` even with the flag set). Fixed by replacing it with
   `import 'dotenv/config'` as the first import. Worker typecheck green; running dev
   worker restarted healthy. This unblocks the loops-audit "operational flag-enable"
   item (#9) — note the running dev worker's parent env still wins if it exports the
   flag explicitly (dotenv never overrides).
   Also appended `ENABLE_PROJECT_LOOPS=true` to `apps/worker/.env` (mirrors root
   `.env`/`.env.local` intent; worker dotenv only reads its own file).
2. **OverdueTaskTriageModal uses native `window.confirm`**
   (`OverdueTaskTriageModal.svelte:731,738`) — blocks the renderer, undismissable by
   automation, and part of the already-tracked native-dialogs→modals debt (admin audit).
3. **Signal coalescing race** — see §3 observation (entity_ids/signal_count under-merge
   on concurrent PATCHes; cosmetic).
4. **Drift card label** — approval button says `Accept`; checklist expected
   `Acknowledge` (§10). Either update copy or the checklist.
5. **Inbox panel surfaces raw run error strings** (`feature_disabled`) unstyled in the
   panel header.
6. Dev-env only: a stale `packages/shared-agent-ops/dist` in the running Vite dev
   server 500'd all `/projects/[id]` pages (missing `extractStartHereOrientation`
   export) until a config-touch restart; not an app bug.

### 7. Residual items (relocated, not blockers for this ticket)

- §2 agent-run change-set live smoke from a live notification → stays with
  `AGENT_RUN_CHAT_CONTEXT_BRIDGE_PLAN_2026-06-29.md` (its only open item).
- §5 calendar suggestion decision live smoke → overlaps [[08-calendar-live-smoke]]
  (needs a throwaway Google-connected account; also clear the 2 stale `processing` rows).
- §6 read-only capability guard → needs a second test user with project visibility.
- §10 task-conflict metadata semantics → covered by worker generator tests only.
- `MANUAL_AGENT_WORK_SMOKE_TESTS_2026-06-20.md` remains unrun (separate surface, not
  AI Inbox; track with agent-work).
- Enabling `PROJECT_LOOPS_ENABLED` in prod remains a deliberate operational decision
  (loops-audit #9); migrations no longer gate it.

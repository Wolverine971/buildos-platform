<!-- tasker/13-ai-inbox-verify-and-cleanup.md -->

# 13 — AI Inbox v1: smoke-test, apply migrations, retire legacy panel

**Priority:** P1 — feature shipped in the last day; needs verification before user exposure
**Type:** Engineering (QA + deploy + cleanup)
**Sources:** `apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md`, `apps/web/docs/technical/architecture/agent-work/AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`, `docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md`

## State — what shipped (2026-06-24/25)

The unified mutation-review queue is built and wired end-to-end:

- ✅ `inbox_items` index + adapters for `agent_run`, `project_suggestion`, `calendar_suggestion`
- ✅ Endpoints `GET /api/inbox`, `GET /api/inbox/count`, `POST /api/inbox/decide` (with batch + stale-row reconciliation)
- ✅ Project Inbox tab (`ProjectInboxPanel.svelte`) + Dashboard modal (`DashboardInboxModal.svelte`), grouped by project/account
- ✅ `project-suggestion-actions.service.ts` (freshness guard, feedback, idempotent claim) + passing unit tests
- ✅ All producers call `syncInboxItem…` (agent runs, project loops, Start Here capture, calendar)
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
- ✅ Inbox Chat resolution hook is implemented: Project Inbox and Dashboard
  Inbox call `POST /api/inbox/[item_id]/resolve-from-chat` when an inbox-origin
  chat closes with successful mutations. Discussion-only chats keep the card
  pending; mutation chats settle supported source rows and sync `inbox_items`.
- ✅ Legacy project-loop review surface retired:
  `apps/web/src/lib/components/project/ProjectSuggestionsPanel.svelte` was
  imported nowhere and has been deleted. `ProjectInboxPanel` is the sole
  project-scoped loop review surface.
- ✅ Phase 3 (profile fragments / contact merge) and Phase 4 (loops/calendar emit true ChangeSets) intentionally deferred

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

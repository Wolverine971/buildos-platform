<!-- tasker/04-project-review-loops.md -->

# 04 — Project Review Loops (AI Inbox alignment + clarified decisions implemented)

**Priority:** P1 — largest open engineering feature
**Type:** Engineering (web + worker + DB)
**Sources:** `docs/specs/PROJECT_REVIEW_LOOPS_SCOPE_2026-06-13.md`, `docs/brainstorms/2026-06-12-project-loops-brainstorm.md`

## State — what's wired

- ✅ Worker job registered (`apps/worker/src/worker.ts:471`)
- ✅ End-of-day cron scheduled (`scheduler.ts:200-208`, 4:00 UTC)
- ✅ Manual trigger API (`loops/+server.ts` POST)
- ✅ Approve/dismiss endpoints are routed through the unified AI Inbox decision
  endpoint and the source-specific project suggestion endpoint.
- ✅ UI panel mounted on project page via `ProjectInboxPanel` (gated by
  `PROJECT_LOOPS_ENABLED`, default OFF).
- ✅ Four generators live: doc-organization, outdated-docs, drift, and
  task-conflicts.
- ✅ Schema + types generated for the original Project Loops migrations
  (`20260613000000`, `20260613010000`) and the Project Loop run brief migration
  (`20260625000000_project_loop_run_brief.sql`).
- ✅ AI Inbox alignment migrations are in-repo:
  `20260626000000_project_suggestion_chat_link.sql` links suggestions to Chat
  chat sessions, and `20260626010000_clarified_project_suggestion_decisions.sql`
  links clarified decisions to child agent runs.

## 2026-06-25 Implementation Update

- ✅ Burst-trigger hooks now fire after document create/update/archive/restore,
  task create/update, and document tree moves. Loop replay sends
  `X-Skip-Project-Loop-Burst: true` so approvals do not recursively queue a
  review.
- ✅ Freshness guard recomputes a stable project fingerprint before approval.
  Material changes mark the suggestion `superseded` with
  `freshness_state='changed'` and do not replay operations.
- ✅ Loop runs now create a `chat_sessions` row and link it through
  `chat_sessions_projects`; approval replay reuses that session for tool
  execution context and cost/activity attribution.
- ✅ Generators now emit undo metadata for document moves, outdated-doc flags,
  and task-conflict flags.
- ✅ Dismissal feedback is accepted from both decision endpoints and stored in
  `project_suggestions.user_feedback`.
- ✅ Drift and task-conflict generators are implemented. Drift is informational
  (`operations: []`), while task-conflicts write reversible metadata flags to a
  task rather than merging/deleting/completing anything.
- ✅ Project brief generation is persisted on `project_loop_runs.brief` and
  rendered in the project inbox panel.
- ✅ Batch approval exists for selected low/medium reversible project-loop
  items, excluding document-tree moves to avoid stale sibling interactions.
- ✅ Project inbox items are grouped into Safe cleanup, Needs your call, Project
  drift, and Other proposals.
- ✅ Project suggestion approval now uses the enum's two-phase status:
  `pending -> approved -> applied|failed`.
- ✅ A per-run generator cost cap is enforced before each generator family.
- ✅ Focused regression tests cover shared fingerprint helpers, drift/task
  conflict generators, dismiss feedback, freshness superseding, and approval
  replay context.

## 2026-06-26 AI Inbox / Clarified Decision Update

- ✅ Project-loop suggestions now carry their parent loop context into the AI
  Inbox payload. Project and Dashboard inbox cards show the originating review
  label.
- ✅ Chat is implemented for project suggestions: shared proposal context
  builder/decoder, `project_suggestions.chat_session_id`, a seeded chat-session
  endpoint, and Chat buttons in Project Inbox + Dashboard Inbox.
- ✅ Chat is generalized through `POST /api/inbox/[item_id]/chat-session` for
  writable `project_suggestion` cards and user-owned `agent_run` /
  `calendar_suggestion` cards. Project suggestions keep the rich proposal
  context; agent-run and calendar cards get compact source-specific seed
  context.
- ✅ Clarified decisions are implemented for project suggestions. If the user
  adds clarification text, `/api/inbox/decide` and the source-specific suggestion
  endpoint route to `decideProjectSuggestionWithClarification()`.
- ✅ Clarified approve/dismiss claims the suggestion as `delegated`, writes
  `user_feedback`, dispatches a child `agent_run` with
  `source_suggestion_id/source_decision`, and maps `delegated` to Inbox
  `deciding`.
- ✅ The agent-run worker reconciles source-linked runs on finalize:
  successful clarified approve → `applied`, successful clarified dismiss →
  `rejected`, non-success terminal run → `failed`, followed by AI Inbox sync.
- ✅ Read-time delegated repair is implemented in the AI Inbox backfill path:
  visible `project_suggestions.status='delegated'` rows with a linked terminal
  child `agent_run` are repaired to `applied`, `rejected`, or `failed` before
  the inbox index is synced.
- ✅ Queue-full clarified decisions degrade to the deterministic fast path, while
  preserving the clarification note.
- ✅ Recurrence prevention is now in the loop prompts: recent reviewed decisions
  with feedback are loaded into `LoopContext.priorDecisions`, task descriptions
  are included, and all generators are instructed not to re-raise dismissed or
  applied items unless materially new evidence exists.
- ✅ Shared inbox decision controls are implemented in
  `InboxDecisionControls.svelte` and used by both Project Inbox and Dashboard
  Inbox for the visible `Accept`, `Dismiss`, and `Chat` actions plus
  pending/opening states. Inline clarification input was removed from the card
  UI; the clarified-decision backend remains available through
  `/api/inbox/decide` for compatible callers.
- ✅ Inbox-origin Chat now has a conservative mutation-backed resolution hook.
  If the chat closes after successful mutations, the UI calls
  `POST /api/inbox/[item_id]/resolve-from-chat`; project suggestions are marked
  handled/applied from chat, original agent-run proposals are rejected after
  replacement chat writes, and calendar suggestions are accepted only when the
  chat mutation summary includes an affected project. Calendar chat acceptance
  now guards the source update by `user_id` as well as suggestion id/status.
- ✅ Calendar suggestion Chat seed cleanup is implemented: the visible assistant
  seed is now concise and user-facing, raw calendar event ids stay in hidden
  `proposal_context.llm_text`, stored calendar event titles are shown when
  available, generated markdown heading artifacts are stripped, and raw names
  like `9takes Project` display as `9 Takes`. Reopening an existing inbox chat
  refreshes the stored seed/metadata instead of preserving the old raw prompt.
- ✅ 2026-06-30 follow-up: discussion-only inbox chats now have explicit
  in-chat resolution controls. `AgentChatModal` can render contextual "Mark
  handled" / "Dismiss" header actions for inbox-origin chats. The modal passes
  the current mutation summary into
  `POST /api/inbox/[item_id]/resolve-from-chat` before closing, then Project
  Inbox / Dashboard Inbox remove the card after the source adapter confirms the
  source row is terminal. No-mutation project and calendar resolutions store
  terminal feedback/rejection metadata instead of pretending a mutation was
  applied; `agent_run` dismissal rejects the original change set through the
  existing commit path.
- ✅ Focused tests were added for the clarified decision service and the
  project-suggestion approval endpoint branch.

## Remaining Work / Follow-Up

- ⚠️ Verify the new `project_loop_runs.brief` migration is applied in every
  target environment before enabling `PROJECT_LOOPS_ENABLED` outside local/dev.
- ✅ The old `ProjectSuggestionsPanel.svelte` legacy compact surface has been
  removed. The primary project page uses `ProjectInboxPanel`.
- ⚠️ Drift is intentionally a review/acknowledgement item, not a mutation. If we
  later want "turn this drift into a task/doc edit," that should be a separate
  explicit action or a true change set.
- ⚠️ Task-conflict handling intentionally stops at metadata flags. Destructive
  merge/delete/complete flows should wait for true per-change review and richer
  undo semantics.
- ✅ Discussion-only chat resolution is implemented for inbox-origin chats:
  `Mark handled` and `Dismiss` are explicit, source-validated terminal actions.
- ✅ Burst-trigger hardening is implemented for the light project-loop review:
  mutation hooks now send source/entity/action metadata to a weighted score gate
  before queueing `trigger_reason='burst'`. The gate uses a 30-minute recent
  `onto_project_logs` window, avoids double-counting the current fire-and-forget
  activity log row, and still relies on `queueProjectLoop` for active-run and
  cooldown dedupe.
- ⚠️ Complete Project Audit triggering is still a separate future track:
  eligibility baseline, project size class, longer burst windows, quiet period,
  and audit-specific cooldown have not been implemented yet.
- ✅ Complete Project Audit Tracker spec is drafted in
  `apps/web/docs/technical/architecture/agent-work/COMPLETE_PROJECT_AUDIT_TRACKER_SPEC_2026-07-01.md`.
  It defines `project_audits`, trigger evaluations, audit-to-suggestion links,
  tracker UI behavior, inbox boundaries, chat context, and phased implementation
  order.

## Verification

- ✅ `pnpm --filter @buildos/worker test:run -- tests/projectLoopsShared.test.ts tests/projectLoopGenerators.test.ts` passed. This command ran the worker's full non-integration suite: 27 files / 269 tests.
- ✅ `pnpm --dir apps/web exec vitest run src/lib/server/project-suggestion-actions.service.test.ts` passed: 1 file / 3 tests.
- ✅ `pnpm --filter @buildos/shared-agent-ops typecheck` passed.
- ✅ `pnpm --filter @buildos/shared-types typecheck` passed.
- ✅ `pnpm --filter @buildos/worker typecheck` passed.
- ✅ `pnpm --filter @buildos/web check` passed with 0 errors / 0 warnings.
- ✅ 2026-06-26 clarified decision slice checks passed:
    - focused web Vitest for `clarified-decision.service.test.ts`,
      `project-suggestion-actions.service.test.ts`, and the suggestion endpoint
      tests: 4 files / 11 tests;
    - focused worker project-loop Vitest: 2 files / 6 tests;
    - `@buildos/shared-types` typecheck + build;
    - `@buildos/shared-agent-ops` typecheck + build;
    - `@buildos/worker` typecheck;
- ✅ 2026-06-28 inbox chat resolution slice checks passed:
    - focused web Vitest for `/api/inbox/[item_id]/resolve-from-chat`,
      `/api/inbox/[item_id]/chat-session`, `/api/inbox/decide`, and the
      project-suggestion chat-session endpoint: 4 files / 15 tests;
    - `@buildos/web check` passed with 0 errors / 0 warnings.
    - `@buildos/web check` with 0 errors / 0 warnings;
    - `git diff --check`.
- ✅ 2026-06-28 inbox Chat/action-label slice checks passed:
    - focused web Vitest for `/api/inbox/[item_id]/chat-session`,
      `/api/inbox/decide`, and the project-suggestion chat-session endpoint: 3
      files / 11 tests;
    - `@buildos/web check` with 0 errors / 0 warnings.
- ✅ 2026-06-30 explicit in-chat resolution checks passed:
    - focused web Vitest for `/api/inbox/[item_id]/resolve-from-chat`: 1 file /
      9 tests;
    - `@buildos/web check` with 0 errors / 0 warnings.
- ✅ 2026-06-30 calendar seed prompt-audit checks passed:
    - focused web Vitest for `inbox-chat-session.service.test.ts` and
      `/api/inbox/[item_id]/chat-session`: 2 files / 7 tests.
- ✅ 2026-06-30 delegated-row repair checks passed:
    - focused web Vitest for `inbox.service.test.ts`: 1 file / 3 tests.
- ✅ 2026-07-01 burst-trigger hardening checks passed:
    - focused web Vitest for `project-loop-burst.service.test.ts`: 1 file / 6
      tests.
- ✅ 2026-06-26 shared decision controls refactor checks passed:
    - `@buildos/web check` with 0 errors / 0 warnings;
    - focused web Vitest for the clarified decision and project-suggestion
      endpoints: 4 files / 11 tests;
    - `git diff --check`.
- ⚠️ A broad `pnpm --filter @buildos/web test:run -- src/lib/server/project-suggestion-actions.service.test.ts` invocation ran the full web suite because of argument handling. The new project-suggestion test passed, but the broader suite has 4 unrelated existing failures in authenticated dashboard page expectations, next-step fallback model expectations, and tool surface size budget.

## Note

This connects to the START HERE "P7 Librarian" deferral ([[05-start-here-deploy-and-monitor]]) — project-loop maturity is the prerequisite for that work.

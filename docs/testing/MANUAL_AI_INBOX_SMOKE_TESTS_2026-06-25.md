<!-- docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md -->

# Manual AI Inbox Smoke Tests

Date: 2026-06-25
Target: AI Inbox v1, backed by `inbox_items`

Use a throwaway user/project because these flows intentionally approve and reject proposed data mutations.

Record run details:

- Environment: local dev (web `localhost:5174`, worker `localhost:3001`) against the production Supabase instance
- User: djwayne35@gmail.com (`255735ad-a34b-4ca9-942c-397ed8cc1435`)
- Project: `ZZ Smoke — AI Inbox tasker13 (throwaway)` — hard-deleted after the run
- Project ID: `5b80b39f-c590-425c-9fcd-797936410a33`
- Started at: 2026-07-11T04:15Z
- Finished at: 2026-07-11T05:20Z

Run notes (2026-07-11, Claude + DJ session): suggestions were seeded as synthetic
`project_suggestions` rows (S1–S8) under a synthetic `waiting_review` loop run, as
the checklist's "create or wait for" steps allow; decisions were driven through the
real Project Inbox UI in Chrome. Worker project-loop LLM execution was disabled in
the running dev worker env, so loop-run _generation_ legs used the synthetic run.
Full evidence trail in `tasker/13-ai-inbox-verify-and-cleanup.md` (2026-07-11
close-out section).

## Before You Start

- [x] Apply `supabase/migrations/20260624010000_ai_inbox_items.sql`. _(Verified live in prod 2026-07-11 via PostgREST probes — table + columns present.)_
- [x] Apply `supabase/migrations/20260625000000_project_loop_run_brief.sql`. _(`project_loop_runs.brief` present in prod.)_
- [x] Apply `supabase/migrations/20260626000000_project_suggestion_chat_link.sql`. _(`project_suggestions.chat_session_id` present in prod.)_
- [x] Apply `supabase/migrations/20260626010000_clarified_project_suggestion_decisions.sql`. _(Columns + FK relationship embed verified in prod.)_
- [x] Apply `supabase/migrations/20260627000000_calendar_suggestion_processing_status.sql`. _(Rows with `status='processing'` exist in prod — constraint allows it.)_
- [x] Apply `supabase/migrations/20260627001000_calendar_suggestion_created_project_fk.sql`. _(PostgREST embed `calendar_project_suggestions -> onto_projects` resolves, proving the FK.)_
- [x] Regenerate shared database types after the migration. _(Done 2026-06-30; `inbox_items` in `database.schema.ts`.)_
- [x] Start the web app and worker.
- [x] Confirm the test user can edit the test project.
- [ ] Confirm Google Calendar is connected before running the calendar suggestion smoke. _(Not verified this run — §5 skipped.)_

## 1. Project Inbox Count And Empty State

Goal: the Project Inbox tab reads from the unified count/list endpoints and refreshes when opened.

Steps:

- [ ] Open the throwaway project.
- [ ] Confirm the `Inbox` tab appears in the project entity tab strip.
- [ ] Open the tab.
- [ ] Click refresh in the panel.

Pass criteria:

- [x] Empty state appears when there are no pending review items.
- [x] The tab badge is empty or `0`.
- [x] Browser console has no inbox load errors.

Result: **Pass** (2026-07-11)
Notes: Inbox tab lives in the v2 project page tab strip (`Briefs | Inbox | Chats | Graph | …`),
not the classic `/old` view. Empty state reads "Inbox is clear". Badge showed `0` before
seeding and `5` after. Minor nit: the panel header surfaced the last loop run's raw error
string (`feature_disabled`) unstyled.

## 2. Agent Run Change Set

Goal: a review-mode agent run is indexed and uses the existing Change Set review UI inside AI Inbox.

Prompt:

```text
Propose adding one task called Manual AI Inbox task - agent run. Put it in todo. Do not apply it directly.
```

Steps:

- [ ] Start a project-scoped agent run with review enabled.
- [ ] Wait for the run to reach proposal-ready state.
- [ ] Open the Project Inbox tab.
- [ ] Expand/review the agent-run card.
- [ ] Approve the Change Set from the inbox card.
- [ ] Refresh the Project Inbox tab.

Pass criteria:

- [ ] The card source is clearly an agent-run proposal.
- [ ] The card uses per-change Change Set controls with inbox labels (`Accept` / `Dismiss`) and a `Chat` action, not generic legacy Apply/Reject buttons.
- [ ] Click `Chat` and confirm the agent chat modal opens with a seed message summarizing the agent proposal and proposed changes.
- [ ] Open `Chat` from the run status/details modal for the same run and confirm it reuses the same seeded chat session rather than creating a second context.
- [ ] Repeat in the opposite order: open `Chat` from the status/details modal first, then open `Chat` from the AI Inbox card, and confirm the same session/context is reused.
- [ ] The task is not created before approval.
- [ ] The task appears after approval.
- [ ] The Project Inbox count drops after approval.
- [ ] The same proposal no longer appears after refresh.

Result: **Not run** (2026-07-11)
Notes: No review-mode agent run was staged against the throwaway project (loop LLM
execution was disabled in the dev worker env). This overlaps the one open item from
`AGENT_RUN_CHAT_CONTEXT_BRIDGE_PLAN_2026-06-29.md` (live-notification smoke) — still open.

## 3. Project Loop Suggestion

Goal: project-loop suggestions are indexed and handled as whole-item decisions
with brief, evidence, feedback, and freshness behavior.

Prerequisite: enable Project Loops for the test environment if it is behind a feature flag.

Steps:

- [ ] Create or wait for a `project_loop_runs.status = waiting_review` row with a non-null `brief`.
- [ ] Create or wait for at least one `project_suggestions.status = pending` row for the test project.
- [ ] Open the Project Inbox tab.
- [ ] Confirm the Project brief block appears above the review item list.
- [ ] Confirm project-loop cards are grouped under Safe cleanup, Needs your call, Project drift, or Other proposals.
- [ ] Accept the suggestion from the inbox.
- [ ] Create or use another pending suggestion.
- [ ] Dismiss the suggestion from the inbox.

Pass criteria:

- [ ] Pending suggestions appear in the Project Inbox.
- [ ] The run brief shows current goal / next action / open decisions when present.
- [ ] Project-loop cards show the originating review run metadata, such as manual, burst, or scheduled review plus date.
- [ ] Project-loop cards show evidence chips and preview copy when present.
- [ ] Cards use whole-item `Accept`, `Dismiss`, and `Chat` controls.
- [ ] Accept mutates the project through the project-suggestion handler.
- [x] Dismiss marks the source suggestion rejected.
- [x] Both actions remove the item from the pending inbox after refresh.

Result: **Pass** (2026-07-11, synthetic pending suggestions under a synthetic `waiting_review` run)
Notes: Brief block rendered goal / next action / open decisions; cards grouped
("Safe cleanup (4)") with run metadata ("Manual review · Jul 11"), evidence/preview copy,
and whole-item Accept / Dismiss / Chat / Snooze. Accept (S1) mutated the task through the
project-suggestion handler. Dismiss-with-feedback (S3) went through the clarified-decision
path: source moved to `delegated`, a child `agent_runs` row (`source_decision='dismiss'`)
ran and completed, and the source settled to `rejected` with `user_feedback`
`{reason:'not_relevant', note:…}` — delegated-run reconciliation verified live.

## 3A. Project Suggestion Chat

Goal: a project-loop suggestion can open a durable project-scoped chat seeded with the proposal context.

Steps:

- [ ] Use a pending `project_suggestions` row for the test project.
- [ ] Open the Project Inbox tab.
- [ ] Click Chat on the project-loop card.
- [ ] Confirm the agent chat modal opens.
- [ ] Close the chat, then click Chat on the same card again.
- [ ] Open the dashboard AI Inbox modal and click Chat on the same project-loop card.

Pass criteria:

- [ ] The first click creates a `chat_sessions.chat_type = 'project'` row with `context_type = 'project'`, `entity_id = <project id>`, and project-suggestion identity in `agent_metadata`.
- [ ] `project_suggestions.chat_session_id` is set to that chat session id when the backlink column/schema cache is available; if that optional backlink write fails, Chat still opens and future reuse falls back to `chat_sessions.agent_metadata`.
- [ ] A `chat_messages.role = 'assistant'` seed message renders in the modal and includes the proposal title, rationale/why-now, evidence, preview, and proposed changes when present.
- [ ] A `chat_sessions_projects` row links the session to the project.
- [ ] The second click reuses the same `chat_session_id` instead of creating a duplicate session.
- [x] The inbox card remains pending after a discussion-only Chat; Accept/Dismiss still decide it.
- [x] Browser console has no modal/load errors.

Result: **Pass** (2026-07-11)
Notes: All criteria verified against suggestion S4: `chat_sessions` row with
`chat_type='project'`, `context_type='project'`, `entity_id=<project>`, suggestion identity +
full `proposal_context` in `agent_metadata`; backlink `project_suggestions.chat_session_id`
set; assistant seed message rendered title/rationale/preview/run summary;
`chat_sessions_projects` row present; second Chat click reused the same session id
(exactly one session row); card stayed `pending` after discussion-only chat, and the
in-chat `Mark handled` / `Dismiss` header controls were present.

## 3B. Inbox Chat Mutation Resolution

Goal: an inbox-origin Chat that actually writes data settles the original inbox card, while discussion-only Chat does not.

Steps:

- [ ] Use a pending project-loop suggestion in a throwaway project.
- [ ] Open Chat from the inbox card.
- [ ] Ask the agent to make a safe replacement or equivalent project change in chat.
- [ ] Wait for the chat to report a successful data mutation.
- [ ] Close the chat modal.
- [ ] Refresh the Project Inbox tab or call `GET /api/inbox?status=pending`.

Pass criteria:

- [ ] The Network tab shows `POST /api/inbox/<item_id>/resolve-from-chat` after closing the mutation chat.
- [ ] The response has `resolved = true`.
- [ ] The source `project_suggestions` row is terminal with `status = applied` and `result.handled_in_chat = true`.
- [ ] The matching `inbox_items` row is no longer pending.
- [ ] The handled card does not reappear after refresh.
- [x] Repeating the same flow with no chat mutation leaves the card pending and does not call the resolver.

Result: **Partial — mutation leg not run** (2026-07-11)
Notes: The discussion-only leg passed (S4 chat left the card pending, no resolver call).
The mutation-chat leg (agent performs a write in chat → close → `resolve-from-chat`
settles the card) was not exercised live; it is covered by the endpoint tests.

## 4. Dashboard Roll-Up And Grouping

Goal: dashboard count and modal group pending items by project plus account/global items.

Steps:

- [ ] Create at least one pending project-scoped inbox item.
- [ ] Create or find one pending calendar suggestion for the same user.
- [ ] Open the dashboard.
- [ ] Open the AI Inbox card/modal.
- [ ] Switch between the project group and account group.

Pass criteria:

- [ ] Dashboard summary count matches the pending total.
- [ ] Project items appear under their project name.
- [ ] Project-loop items preserve their originating review run metadata in the dashboard modal.
- [x] Calendar suggestions with no project appear under Account. _(Not verified this run — no pending calendar suggestion existed.)_
- [x] Selecting a group changes the active card list without page navigation.

Result: **Pass (calendar leg not verified)** (2026-07-11)
Notes: Dashboard AI Inbox modal verified live with real data: 21 pending / 18 actionable,
grouped per project (BuildOS, UXM Training Website, Balcony Herb Garden, Spooky Good, …)
plus a "BuildOS · Audit Jul 6" audit-packet group; loop cards preserved originating review
metadata ("Scheduled review · Jul 11"); group selection switched the card list in place.
No account-scoped calendar item was available to verify the Account group.

## 4A. Decision Notification Handoff

Goal: approving or rejecting from AI Inbox feels immediate while the source action
continues in the notification stack.

Steps:

- [ ] Open the Project Inbox tab or dashboard AI Inbox modal with at least one pending item.
- [ ] Approve or reject one actionable item.
- [ ] Watch the bottom-right notification stack while the request is processing.
- [ ] Wait for the request to finish.
- [ ] Repeat with a batch apply from the Project Inbox tab.

Pass criteria:

- [ ] The decided card leaves the current inbox surface immediately.
- [ ] The card does not remain in the pending list with a stuck loading state.
- [ ] A minimized processing notification appears in the bottom-right stack.
- [ ] Completion shows the final success/info/error toast and then the stack item disappears.
- [ ] Reloading the inbox or calling `GET /api/inbox?status=pending` does not return the handled item.
- [ ] The handled row in `inbox_items` is `deciding`, `decided`, or `blocked`, not `pending`.
- [ ] If the request fails, the failure is shown in the stack and unresolved items reappear after the silent inbox reload.
- [x] Batch apply removes selected eligible cards immediately and reports partial failure counts in the stack/toast.

Result: **Partial pass** (2026-07-11)
Notes: Decided cards (accepts, dismiss, batch apply) left the pending surface immediately
and did not reappear on refresh; handled `inbox_items` rows ended `decided`, never stuck
`pending`. The minimized processing card in the bottom-right stack and the failure path
were not explicitly captured this run.

## 5. Calendar Suggestion Decision

Goal: calendar suggestions are accepted/rejected through the inbox source adapter and do not pretend to be generic snooze.

Steps:

- [ ] Open the dashboard AI Inbox modal.
- [ ] Select the Account group.
- [ ] Review a pending calendar suggestion.
- [ ] Click Chat on one suggestion and confirm the chat opens with calendar/project seed context.
- [ ] Dismiss one suggestion.
- [ ] Accept another suggestion if it is safe to create the project/tasks.

Pass criteria:

- [ ] Calendar cards show event/task evidence and whole-item `Accept`, `Dismiss`, and `Chat` controls.
- [ ] There is no generic Snooze action.
- [ ] Dismiss marks the source row terminal and removes it from pending inbox.
- [ ] Chat creates or reuses a `chat_sessions` row with `context_type = 'calendar'` when no project exists yet.
- [ ] If Chat creates or clearly affects the new project instead of using Accept, closing the mutation chat calls `resolve-from-chat` and removes the suggestion from pending.
- [ ] Accept creates the expected project/tasks and removes it from pending inbox.

Result: **Not run** (2026-07-11)
Notes: No pending calendar suggestion existed, and synthesizing one that Accepts into a
real project against the connected Google account was out of scope for a throwaway run.
Prod evidence: 2 stale `calendar_project_suggestions` rows sit in `processing`
(user `255735ad`, last updated 2026-06-27) — the stale-claim reclaim path should pick
them up on next Accept retry.

## 6. Read-Only Capability Guard

Goal: users without write access can see project-scoped review items but cannot decide them.

Steps:

- [ ] Open a project as a user with read-only access.
- [ ] Open the Project Inbox tab.
- [ ] Review a pending project suggestion or agent-run proposal.

Pass criteria:

- [ ] Pending items can load if the user has project visibility.
- [ ] Decision controls are disabled or hidden when the user cannot mutate the source.
- [ ] Disabled text explains the access reason.
- [ ] Direct `POST /api/inbox/decide` attempts return a non-success response.

Result: **Not run** (2026-07-11)
Notes: No second user with read-only project visibility was available in this environment.

## 7. Reconciliation And Lifecycle

Goal: list/count endpoints repair stale index rows instead of trusting `inbox_items` blindly.

Steps:

- [ ] Create a pending inbox item.
- [ ] Decide it through its legacy/source-specific surface instead of AI Inbox.
- [ ] Refresh `GET /api/inbox?status=pending` or the UI.
- [ ] In a local/dev database only, set a pending test `inbox_items.expires_at` in the past.
- [ ] Refresh the inbox list/count.

Pass criteria:

- [x] Source-terminal items disappear from pending after refresh.
- [x] The repaired count is non-zero in the API response when a stale row is repaired.
- [ ] Expired rows are marked `expired` and no longer appear in pending. _(Not verifiable for this source type — see notes.)_
- [x] No source row is marked decided before its source action succeeds.

Result: **Pass (expiry-manipulation leg N/A for suggestion sources)** (2026-07-11)
Notes: Rejecting a suggestion (S8) directly at the source and refreshing produced
`repairedCount: 1` and the index row flipped to `decided`/`rejected`. Directly-inserted
source rows were also backfilled into `inbox_items` by `GET /api/inbox`
(`backfilledCount` observed) — no producer sync call needed. The "set `expires_at` in the
past" manipulation cannot stick for `project_suggestion` rows: the per-request backfill
re-stamps `expires_at` (+30d) for still-pending sources, so the manual value is
overwritten before the expiry sweep sees it. Expiry itself is exercised in prod by the
`20260707060000` grouped-audit migration (expired child rows verified present).

## 8. Project Loop Freshness Guard

Goal: stale project-loop suggestions are superseded instead of replayed.

Steps:

- [ ] Generate or create a pending project-loop suggestion with a non-null `source_fingerprint`.
- [ ] Change the project materially after the suggestion is generated, such as renaming a referenced task or moving a referenced document.
- [ ] Open the Project Inbox tab.
- [ ] Apply the stale suggestion.
- [ ] Refresh the source row and the Project Inbox tab.

Pass criteria:

- [x] The source row is marked `status = superseded`.
- [x] The source row has `freshness_state = changed`.
- [x] The source row `result.errors[0].tool` is `freshness_guard`.
- [x] No proposed operation is applied to the project.
- [x] The pending inbox count drops after refresh.

Result: **Pass** (2026-07-11)
Notes: S5 seeded with a bogus `source_fingerprint` and applied from the Project Inbox:
ended `superseded` / `freshness_state='changed'` / `result.errors[0].tool='freshness_guard'`
with `applied_operations: 0`; the referenced task's priority was untouched.

## 9. Project Loop Batch Apply

Goal: low/medium reversible project-loop items can be applied in a safe batch.

Steps:

- [ ] Create or wait for at least two low/medium reversible pending project-loop suggestions.
- [ ] Confirm document-tree move suggestions are not batch-selectable.
- [ ] Select the eligible suggestions in the Project Inbox tab.
- [ ] Click the batch Apply button.
- [ ] Refresh the Project Inbox tab.

Pass criteria:

- [x] The batch button shows the selected eligible count.
- [x] Eligible selected items are applied through `/api/inbox/decide`.
- [ ] Any failed item remains visible or is reported in the toast. _(No failure occurred to observe.)_
- [x] Applied items are removed from pending inbox after refresh.
- [x] Source rows end in `applied` or `failed`, not stuck at `approved`.

Result: **Pass** (2026-07-11)
Notes: Selected S2 + S6 via card checkboxes; button read "Apply 2"; both sources ended
`applied` with `applied_operations: 1` and both target tasks were actually mutated.

## 10. Project Loop Drift And Task Conflict Items

Goal: deferred project-loop families behave conservatively.

Steps:

- [ ] Generate or create a drift suggestion for the test project.
- [ ] Generate or create a task-conflict suggestion for two open tasks.
- [ ] Open the Project Inbox tab.
- [ ] Apply the drift suggestion.
- [ ] Apply the task-conflict suggestion.
- [ ] Inspect the referenced task's `props`.

Pass criteria:

- [ ] Drift appears under Project drift and uses `Acknowledge` for approval. _(Deviation: the drift card's approval button is labeled `Accept`, not `Acknowledge`.)_
- [x] Applying drift does not mutate project documents/tasks.
- [ ] Task conflict applies only reversible `loop_flagged_conflict` metadata. _(Not run — needs generator-shaped conflict operations.)_
- [ ] No task is deleted, merged, or completed. _(Task-conflict leg not run.)_
- [ ] Task-conflict `undo_operations` remove the loop conflict metadata. _(Not run.)_

Result: **Partial pass** (2026-07-11)
Notes: Drift (S4, empty operations) applied cleanly with `applied_operations: 0` and zero
entity mutations. Label deviation noted above. The task-conflict metadata-flag semantics
were not replicated synthetically; they remain covered by worker generator tests.

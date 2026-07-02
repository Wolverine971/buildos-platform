<!-- docs/testing/MANUAL_AI_INBOX_SMOKE_TESTS_2026-06-25.md -->

# Manual AI Inbox Smoke Tests

Date: 2026-06-25
Target: AI Inbox v1, backed by `inbox_items`

Use a throwaway user/project because these flows intentionally approve and reject proposed data mutations.

Record run details:

- Environment:
- User:
- Project:
- Project ID:
- Started at:
- Finished at:

## Before You Start

- [ ] Apply `supabase/migrations/20260624010000_ai_inbox_items.sql`.
- [ ] Apply `supabase/migrations/20260625000000_project_loop_run_brief.sql`.
- [ ] Apply `supabase/migrations/20260626000000_project_suggestion_chat_link.sql`.
- [ ] Apply `supabase/migrations/20260626010000_clarified_project_suggestion_decisions.sql`.
- [ ] Apply `supabase/migrations/20260627000000_calendar_suggestion_processing_status.sql`.
- [ ] Apply `supabase/migrations/20260627001000_calendar_suggestion_created_project_fk.sql`.
- [ ] Regenerate shared database types after the migration.
- [ ] Start the web app and worker.
- [ ] Confirm the test user can edit the test project.
- [ ] Confirm Google Calendar is connected before running the calendar suggestion smoke.

## 1. Project Inbox Count And Empty State

Goal: the Project Inbox tab reads from the unified count/list endpoints and refreshes when opened.

Steps:

- [ ] Open the throwaway project.
- [ ] Confirm the `Inbox` tab appears in the project entity tab strip.
- [ ] Open the tab.
- [ ] Click refresh in the panel.

Pass criteria:

- [ ] Empty state appears when there are no pending review items.
- [ ] The tab badge is empty or `0`.
- [ ] Browser console has no inbox load errors.

Result: Pass / Fail
Notes:

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

Result: Pass / Fail
Notes:

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
- [ ] Dismiss marks the source suggestion rejected.
- [ ] Both actions remove the item from the pending inbox after refresh.

Result: Pass / Fail
Notes:

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
- [ ] The inbox card remains pending after a discussion-only Chat; Accept/Dismiss still decide it.
- [ ] Browser console has no modal/load errors.

Result: Pass / Fail
Notes:

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
- [ ] Repeating the same flow with no chat mutation leaves the card pending and does not call the resolver.

Result: Pass / Fail
Notes:

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
- [ ] Calendar suggestions with no project appear under Account.
- [ ] Selecting a group changes the active card list without page navigation.

Result: Pass / Fail
Notes:

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
- [ ] Batch apply removes selected eligible cards immediately and reports partial failure counts in the stack/toast.

Result: Pass / Fail
Notes:

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

Result: Pass / Fail
Notes:

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

Result: Pass / Fail
Notes:

## 7. Reconciliation And Lifecycle

Goal: list/count endpoints repair stale index rows instead of trusting `inbox_items` blindly.

Steps:

- [ ] Create a pending inbox item.
- [ ] Decide it through its legacy/source-specific surface instead of AI Inbox.
- [ ] Refresh `GET /api/inbox?status=pending` or the UI.
- [ ] In a local/dev database only, set a pending test `inbox_items.expires_at` in the past.
- [ ] Refresh the inbox list/count.

Pass criteria:

- [ ] Source-terminal items disappear from pending after refresh.
- [ ] The repaired count is non-zero in the API response when a stale row is repaired.
- [ ] Expired rows are marked `expired` and no longer appear in pending.
- [ ] No source row is marked decided before its source action succeeds.

Result: Pass / Fail
Notes:

## 8. Project Loop Freshness Guard

Goal: stale project-loop suggestions are superseded instead of replayed.

Steps:

- [ ] Generate or create a pending project-loop suggestion with a non-null `source_fingerprint`.
- [ ] Change the project materially after the suggestion is generated, such as renaming a referenced task or moving a referenced document.
- [ ] Open the Project Inbox tab.
- [ ] Apply the stale suggestion.
- [ ] Refresh the source row and the Project Inbox tab.

Pass criteria:

- [ ] The source row is marked `status = superseded`.
- [ ] The source row has `freshness_state = changed`.
- [ ] The source row `result.errors[0].tool` is `freshness_guard`.
- [ ] No proposed operation is applied to the project.
- [ ] The pending inbox count drops after refresh.

Result: Pass / Fail
Notes:

## 9. Project Loop Batch Apply

Goal: low/medium reversible project-loop items can be applied in a safe batch.

Steps:

- [ ] Create or wait for at least two low/medium reversible pending project-loop suggestions.
- [ ] Confirm document-tree move suggestions are not batch-selectable.
- [ ] Select the eligible suggestions in the Project Inbox tab.
- [ ] Click the batch Apply button.
- [ ] Refresh the Project Inbox tab.

Pass criteria:

- [ ] The batch button shows the selected eligible count.
- [ ] Eligible selected items are applied through `/api/inbox/decide`.
- [ ] Any failed item remains visible or is reported in the toast.
- [ ] Applied items are removed from pending inbox after refresh.
- [ ] Source rows end in `applied` or `failed`, not stuck at `approved`.

Result: Pass / Fail
Notes:

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

- [ ] Drift appears under Project drift and uses `Acknowledge` for approval.
- [ ] Applying drift does not mutate project documents/tasks.
- [ ] Task conflict applies only reversible `loop_flagged_conflict` metadata.
- [ ] No task is deleted, merged, or completed.
- [ ] Task-conflict `undo_operations` remove the loop conflict metadata.

Result: Pass / Fail
Notes:

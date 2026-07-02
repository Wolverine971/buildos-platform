<!-- docs/testing/MANUAL_AGENT_WORK_SMOKE_TESTS_2026-06-20.md -->

# Manual Agent Work Smoke Tests

Date: 2026-06-20  
Recommended target: a throwaway project named `Manual Smoke Project - 2026-06-20`

Use this to verify the highest-risk live paths after the recent Agent Work, Operatives, calendar, search, Brain Dump, and timeline changes.

## Before You Start

- [ ] Use a project you can safely mutate.
- [ ] Confirm the worker/scheduler is running if you are testing scheduled Operatives.
- [ ] Confirm the test user has Google Calendar connected before running the calendar smoke.
- [ ] Keep entity names exact so cleanup and search are easy.

Record run details:

- Environment:
- User:
- Project:
- Project ID:
- Started at:
- Finished at:

## 1. Brain Dump To Chat Session

Goal: opening a Brain Dump creates one reusable chat session with a seed message.

Create a Brain Dump with this exact content:

```text
Manual smoke brain dump 2026-06-20. I need to turn launch notes into an action plan. Key ideas: publish a short update, create a follow-up task, and preserve this exact phrase: ultraviolet piano ledger.
```

Steps:

- [ ] Open the Brain Dump from History / Brain Dump chat.
- [ ] Confirm the chat opens.
- [ ] Confirm the first user-visible seed message starts with `Original Brain Dump`.
- [ ] Close the chat.
- [ ] Reopen the same Brain Dump.

Pass criteria:

- [ ] Reopen uses the same chat session, not a duplicate.
- [ ] The Brain Dump keeps the same `chat_session_id`.
- [ ] No orphan or duplicate chat session is created.

Result: Pass / Fail  
Notes:

## 2. Work Panel Direct Run

Goal: direct agent work can mutate the project and refresh the UI.

Prompt:

```text
Create one task called Manual smoke task - direct run. Put it in todo. Do not change anything else.
```

Steps:

- [ ] Open the test project.
- [ ] Open the Work Panel / agent work area.
- [ ] Start a manual/direct run with the prompt above.
- [ ] Watch the run move through queued/running/completed.

Pass criteria:

- [ ] A task named `Manual smoke task - direct run` appears.
- [ ] The task is in `todo`.
- [ ] The project UI refreshes without a manual browser reload.
- [ ] The run status is visible and sane.
- [ ] Opening the run status/details modal shows a `Chat` action, not only `Dismiss`.
- [ ] Clicking `Chat` prepares `/api/agent-runs/[id]/chat-session`, opens the
      agentic chat modal, and resumes the returned shared chat session.

Result: Pass / Fail  
Notes:

## 3. Review Change Set Run

Goal: review-mode work proposes changes without applying them until approval.

Prompt:

```text
Propose adding one task called Manual smoke task - review run. Put it in todo. Do not apply it directly; leave it for review.
```

Steps:

- [ ] Start an agent run with review mode enabled.
- [ ] Use the prompt above.
- [ ] Wait for the run to reach proposal/review-ready state.
- [ ] Before approving, inspect the project task list.
- [ ] Apply the Change Set.
- [ ] Inspect the project task list again.

Pass criteria:

- [ ] Before approval, `Manual smoke task - review run` is not applied.
- [ ] The run reaches a proposal/review-ready state.
- [ ] After approval, `Manual smoke task - review run` appears.
- [ ] The task is in `todo`.
- [ ] The run status/details modal has a `Chat` action that opens the shared
      seeded chat session for the run, including proposal/change-set context.
- [ ] If applying the Change Set partially fails, the failed/partial status
      modal still offers `Chat`, and that chat opens with the failed changes in
      context.

Result: Pass / Fail  
Notes:

## 4. Scheduled Operative

Goal: a due scheduled Operative is picked up by the worker and creates a visible run.

Operative instruction:

```text
When this operative runs, add one task called Manual smoke task - scheduled operative. Put it in todo. Do not change anything else.
```

Steps:

- [ ] Create a new scheduled Operative in the test project.
- [ ] Set it due within the next few minutes.
- [ ] Use the instruction above exactly.
- [ ] Wait for the scheduler/worker window.
- [ ] Inspect runs and project tasks.

Pass criteria:

- [ ] The Operative queues or starts automatically.
- [ ] A run is created and visible.
- [ ] A task named `Manual smoke task - scheduled operative` appears.
- [ ] The task is in `todo`.

Result: Pass / Fail  
Notes:

## 5. Google Calendar Live Smoke

Goal: live calendar writes work for a connected user, and review mode does not direct-commit calendar writes.

Direct-write prompt:

```text
Create a calendar event called Manual smoke calendar event for June 21, 2026 from 10:00 AM to 10:15 AM America/New_York. Link it to this project if possible. Do not invite anyone.
```

Delete prompt:

```text
Delete the calendar event called Manual smoke calendar event on June 21, 2026.
```

Review-mode prompt:

```text
In review mode, propose creating a calendar event called Manual smoke calendar review event for June 21, 2026 from 10:30 AM to 10:45 AM America/New_York. Do not create it directly.
```

Steps:

- [ ] Confirm the test user has Google Calendar connected.
- [ ] Run the direct-write prompt.
- [ ] Confirm the event appears in BuildOS.
- [ ] Confirm the event appears in Google Calendar.
- [ ] Run the delete prompt.
- [ ] Confirm the event disappears from BuildOS.
- [ ] Confirm the event disappears from Google Calendar.
- [ ] Run the review-mode prompt with review enabled.

Pass criteria:

- [ ] Direct create works.
- [ ] Direct delete works.
- [ ] Google Calendar and BuildOS agree after create/delete.
- [ ] Review mode does not create `Manual smoke calendar review event` directly before approval.

Result: Pass / Fail  
Notes:

## 6. Search Snippet Smoke

Goal: project search returns canonical document content snippets.

Setup:

- [ ] Create or edit a document named `Manual Smoke Search Document`.
- [ ] Put this exact phrase in the document body: `ultraviolet piano ledger`.

Prompt:

```text
Find documents that mention ultraviolet piano ledger in this project. Show me the matching document and the snippet.
```

Pass criteria:

- [ ] The document `Manual Smoke Search Document` appears in results.
- [ ] The snippet includes or clearly points to `ultraviolet piano ledger`.
- [ ] The snippet reflects current document body content, not stale legacy metadata.

Result: Pass / Fail  
Notes:

## 7. Document Append And Merge

Goal: append and `merge_llm` preserve existing document content.

Setup:

- [ ] Create a document named `Manual Smoke Document`.
- [ ] Set its body to:

```text
Existing smoke paragraph.
```

Append prompt:

```text
Append this exact paragraph to the document named Manual Smoke Document: Added smoke paragraph - append path.
```

Merge prompt:

```text
Merge this update into the document named Manual Smoke Document while preserving all existing content: The smoke test now includes a merge path check. Keep the document concise.
```

Pass criteria:

- [ ] After append, the document contains `Existing smoke paragraph.`
- [ ] After append, the document contains `Added smoke paragraph - append path.`
- [ ] After merge, the previous content is still present.
- [ ] After merge, the document includes the merge-path update.
- [ ] The document was not replaced with only the new text.

Result: Pass / Fail  
Notes:

## 8. Activity Timeline / Affected Entity

Goal: completed tool actions show useful affected-entity context.

Steps:

- [ ] Open the chat/session activity timeline after any successful task or document change above.
- [ ] Find the tool/action row for the created or updated entity.
- [ ] Click the affected entity chip/card if present.

Pass criteria:

- [ ] The timeline shows the created/updated task or document.
- [ ] The entity label is understandable.
- [ ] The link opens the correct project/entity.
- [ ] Failed actions do not show misleading affected-entity links.

Result: Pass / Fail  
Notes:

## Priority Order

Run these first if time is limited:

1. Work Panel Direct Run
2. Review Change Set Run
3. Scheduled Operative
4. Google Calendar Live Smoke
5. Brain Dump To Chat Session

## Cleanup

- [ ] Delete `Manual smoke task - direct run`.
- [ ] Delete `Manual smoke task - review run`.
- [ ] Delete `Manual smoke task - scheduled operative`.
- [ ] Delete `Manual Smoke Document`.
- [ ] Delete `Manual Smoke Search Document`.
- [ ] Confirm `Manual smoke calendar event` and `Manual smoke calendar review event` are not left on Google Calendar.

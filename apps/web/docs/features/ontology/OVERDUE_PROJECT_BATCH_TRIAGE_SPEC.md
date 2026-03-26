<!-- apps/web/docs/features/ontology/OVERDUE_PROJECT_BATCH_TRIAGE_SPEC.md -->

# Project-Batched Overdue Task Triage Spec

**Last Updated**: March 26, 2026  
**Status**: Draft  
**Category**: Feature Spec  
**Supersedes**: parts of `/apps/web/docs/features/ontology/OVERDUE_TASK_TRIAGE_MODAL_SPEC.md`  
**Location**: `/apps/web/docs/features/ontology/OVERDUE_PROJECT_BATCH_TRIAGE_SPEC.md`

## 1. Overview

The current overdue triage experience is optimized for a global one-task-at-a-time queue:

- dashboard alert card shows overdue task count
- `AnalyticsDashboard.svelte` opens `OverdueTaskTriageModal.svelte`
- modal processes one overdue task at a time with lane switching

That flow is functional, but it is not the best mental model for actual execution. It forces users to repeatedly switch project context while triaging.

The new target is **project-batched overdue triage**:

- the home page should surface overdue work as **project batches**, not just a flat overdue count
- the triage workspace should let the user process **all overdue tasks for one project at a time**
- the interface should preserve project context, reduce context switching, and make progress feel finite

This spec keeps the feature scoped to overdue tasks only. It does not turn triage into a full task manager.

## 2. Why This Direction

### 2.1 Research Summary

This direction is supported by both UX and productivity research:

- Task switching has measurable working-memory cost. A 2008 study in _Journal of Experimental Psychology: Learning, Memory, and Cognition_ found that task switching imposes added demands on working memory rather than being free overhead.
- Progressive disclosure reduces overwhelm by showing the essentials first and moving more complex actions to secondary UI.
- Hierarchical task analysis groups work by goal, subgoal, and step so teams can reduce friction and decision fatigue in complex flows.
- Task tools such as Todoist explicitly support grouping tasks by shared attributes and describe sections as a way to make large projects feel manageable instead of like one long list.

### 2.2 Product Implication

For BuildOS, this means:

1. The right batching unit is **project context**, not a cross-project global queue.
2. The home surface should summarize **which projects need triage**, not just how many tasks are overdue.
3. The triage workspace should reveal **one project batch at a time**, then show the overdue tasks inside that batch.
4. The current `Skip`-heavy queue model should become less important because the user can now see and resolve a whole project batch in one pass.

## 3. Problem Statement

Current behavior has three UX costs:

1. **Context switching cost**. Users jump from one overdue task to another even when those tasks belong to different projects.
2. **Weak progress framing**. Clearing task 1 of 12 feels endless. Clearing "Project A overdue batch" feels bounded and more motivating.
3. **Overexposed controls**. The current modal shows rich reschedule UI for a single task at a time. That works for focused recovery, but it does not scale well when the user wants to quickly clear several related overdue tasks.

## 4. Goals

1. Reframe overdue triage from task-by-task to **project-by-project batching**.
2. Let a user clear one project's overdue items in one focused pass without leaving dashboard context.
3. Keep the UI clean and intuitive on both desktop and mobile.
4. Preserve fast single-task actions while adding lightweight project-level batch actions.
5. Reuse as much of the current API and mutation stack as practical.

## 5. Non-Goals

1. Full task editing parity with `TaskEditModal`.
2. Showing every non-overdue task in the selected project.
3. Reworking `/projects` task management as part of this effort.
4. Introducing a required database schema change.

## 6. UX Principles

### 6.1 Keep The Unit Of Attention Stable

Once the user enters a project batch, the UI should not immediately throw them into a different project. The project remains the active frame until:

- its overdue tasks are cleared, or
- the user explicitly switches to a different project batch

### 6.2 Show Summary First, Actions Second

The home page should first answer:

- which projects need attention
- how many overdue tasks each project has
- which batches are most urgent

Only after the user picks a project should the full per-task action UI appear.

### 6.3 Use Progressive Disclosure

Visible by default:

- project batch summary
- overdue count
- oldest overdue age
- "assigned to me" signal
- 2-3 most common row actions

Hidden behind secondary UI:

- advanced reschedule slot finding
- full descriptions
- low-frequency task actions

### 6.4 Prefer Lists Over Stacks Of Cards

Within a selected project batch, overdue tasks should render as a compact list with lightweight row actions rather than large standalone task cards. This keeps the screen scannable when a project has multiple overdue tasks.

## 7. Primary User Stories

1. As a user, I can see that "Website Redesign" has 5 overdue tasks and triage that batch in one pass.
2. As a user, I can finish one project batch and immediately move to the next project batch.
3. As a collaborator, project batches containing tasks assigned to me should rise above unassigned or other-assignee work.
4. As a user, I can still quickly resolve a single overdue task without opening a full editor.
5. As a user on mobile, I can review one project batch at a time without a cramped or noisy layout.

## 8. Proposed UX

## 8.1 Home Page Section

Replace the current compact overdue alert card with a richer but still lightweight section.

Section title:

- `Overdue project batches`

Section subtitle:

- `{projectBatchCount} projects · {overdueTaskCount} overdue tasks`

Top-level actions:

- Primary CTA: `Batch triage`
- Secondary link: `View all projects`

Section body:

- show the top 3 project batches by urgency
- each row shows:
    - project name
    - overdue count
    - assigned-to-me count if non-zero
    - oldest overdue age
    - collaborative/shared badge when relevant
    - `Review` button

Example:

```text
Overdue project batches                      3 projects · 14 overdue tasks

Website Redesign      5 overdue · 2 mine · oldest 7d                Review
CRM Migration         4 overdue · 1 mine · oldest 3d                Review
Hiring Pipeline       5 overdue · oldest 1d                         Review
```

Behavior:

- `Batch triage` opens the full triage modal focused on the highest-priority batch
- clicking a project row opens the same modal focused on that project batch

## 8.2 Full Triage Workspace

The full triage experience remains modal-based so the user stays on the dashboard.

Recommended title:

- `Project Batch Triage`

Desktop layout:

- two-pane modal
- left pane: project batch list
- right pane: selected project batch details and overdue task rows

Mobile layout:

- stacked layout
- top area: project batch switcher
- main area: selected project task list
- sticky bottom action bar only for project-level actions

## 8.3 Project Batch List

Each batch item should show:

- project name
- overdue count
- assigned-to-me count
- oldest overdue label
- shared/collaborative badge
- completion state when the batch was just cleared in-session

Default sort order:

1. project batches with overdue tasks assigned to me in collaborative projects
2. project batches with overdue tasks assigned to me in non-collaborative projects
3. all other project batches
4. within each bucket: oldest overdue date ascending
5. then overdue task count descending
6. then project updated time descending

## 8.4 Selected Project Batch Panel

Header content:

- project name
- overdue count
- assigned-to-me count
- oldest overdue label
- link to open project in a new tab

Header actions:

- `Tomorrow all`
- `+3d all`
- `Mark all in progress`
- overflow menu:
    - `Mark all done` with confirmation
    - `Open project`

Important change:

- the selected project panel should show **all overdue tasks for that project at once**
- the UI should not require a `Skip` button as the primary navigation mechanism

## 8.5 Task Row Design

Each overdue task row should show:

- task title
- overdue age
- due date
- state badge
- assignee summary
- priority if present

Visible quick actions per row:

- `Done`
- `Tomorrow`
- `+3d`
- `More`

`More` menu:

- `In progress`
- `Blocked + revisit`
- `Find slot`
- `Open task`

Notes:

- row descriptions should stay collapsed by default
- "Find slot" should reuse the current reschedule-options API, but open in a small popover/sheet instead of rendering the full reschedule UI inline for every task

## 8.6 Project Progress Behavior

When the selected project batch reaches zero overdue tasks:

- show a brief success state: `Website Redesign cleared`
- mark the batch as completed in the left pane
- auto-focus the next remaining project batch unless the user manually opened a specific project

When all project batches are cleared:

- show a global completion state: `You cleared all overdue project batches`

## 9. Interaction Model

### 9.1 Desktop

- Up/down moves within the project batch list when it has focus
- Enter selects a project batch
- Within task rows:
    - `D` marks selected row done
    - `T` reschedules to tomorrow
    - `R` opens row overflow/reschedule actions
- `Esc` closes modal

### 9.2 Mobile

- swiping between project batches is optional polish, not MVP
- row actions must remain explicit buttons
- advanced actions open a bottom sheet

## 10. Data Model

## 10.1 Overdue Definition

A task is overdue when:

- `deleted_at IS NULL`
- `state_key IN ('todo', 'in_progress', 'blocked')`
- `due_at IS NOT NULL`
- `due_at < now()`

This remains unchanged from the current implementation.

## 10.2 Project Batch Definition

A project batch is one project with at least one overdue task visible to the current user.

Batch summary fields:

```ts
type OverdueProjectBatch = {
	project_id: string;
	project_name: string;
	project_state_key: string;
	project_is_shared: boolean;
	project_is_collaborative: boolean;
	lane: 'assigned_collab' | 'assigned_other' | 'other';
	overdue_count: number;
	assigned_to_me_count: number;
	oldest_due_at: string | null;
	oldest_assigned_due_at: string | null;
	project_updated_at: string;
	tasks: OverdueTask[];
};
```

`OverdueTask` can largely reuse the existing payload already returned by `/api/onto/tasks/overdue`.

## 10.3 Within-Project Task Ordering

Recommended default order inside a project batch:

1. tasks assigned to me first
2. then due date ascending
3. then priority ascending
4. then updated time ascending

## 11. API Strategy

## 11.1 Recommended New Read Endpoint

Add:

- `GET /api/onto/tasks/overdue/batches`

Query params:

- `limit` = number of project batches to return
- `cursor` = optional project-batch cursor
- `include_tasks` = `true | false`
- `project_id` = optional, for loading a specific project batch first

Response shape:

```ts
{
	batches: OverdueProjectBatch[];
	totalProjects: number;
	totalTasks: number;
	nextCursor: string | null;
}
```

Use cases:

- home page preview: `include_tasks=false&limit=3`
- full triage modal: `include_tasks=true`

## 11.2 MVP Implementation Path

The current route `GET /api/onto/tasks/overdue` already returns enough task-level metadata to support grouping:

- `project_id`
- `project_name`
- `is_assigned_to_me`
- `project_is_collaborative`
- `assignees`
- `lane`

Because of that, MVP can be staged in either of these two ways:

### Option A: Faster Product Path

- build `GET /api/onto/tasks/overdue/batches` by reusing the current query logic and grouping server-side
- use that new grouped response for both the home section and modal

### Option B: Lowest-Risk Frontend Path

- fetch all overdue tasks from the existing endpoint
- group client-side into project batches
- add the server endpoint later if performance or pagination becomes an issue

Recommended choice:

- **Option A**

Reason:

- the home page needs batch summaries anyway
- server-grouped responses keep preview and modal ordering consistent
- project-batch pagination is cleaner than task pagination for this UX

## 11.3 Existing Mutation Endpoints To Reuse

Keep reusing:

- `PATCH /api/onto/tasks/[id]`
- `POST /api/onto/tasks/[id]/reschedule-options`

Fields used by batch triage:

- `state_key`
- `start_at`
- `due_at`

## 11.4 No Required Bulk Endpoint For MVP

Project-level actions can reuse the existing single-task `PATCH` endpoint in a client-side loop for MVP.

Optional V2:

- `POST /api/onto/tasks/bulk-update`

## 12. Frontend Architecture

## 12.1 Existing Touchpoints

Current files:

- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`
- `apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte`
- `apps/web/src/routes/api/onto/tasks/overdue/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/reschedule-options/+server.ts`

## 12.2 Recommended Component Structure

1. `apps/web/src/lib/components/dashboard/OverdueProjectBatchSection.svelte`
2. `apps/web/src/lib/components/dashboard/ProjectBatchTriageModal.svelte`
3. `apps/web/src/lib/components/dashboard/ProjectBatchList.svelte`
4. `apps/web/src/lib/components/dashboard/ProjectBatchTaskRow.svelte`
5. `apps/web/src/lib/components/dashboard/TaskQuickRescheduleSheet.svelte`

Implementation note:

- if minimizing churn is more important than renaming, `OverdueTaskTriageModal.svelte` can be refactored in place instead of introducing `ProjectBatchTriageModal.svelte`

## 12.3 Dashboard Integration

Update `AnalyticsDashboard.svelte` so that:

1. the current overdue alert card becomes the new project-batch section
2. the section lazy-loads batch preview data when `overdueTasks > 0`
3. clicking `Batch triage` or `Review` opens the project-batch modal
4. modal close still triggers the existing `refreshHandler` when changes were made

## 13. State Model

Suggested modal state:

```ts
type BatchTriageState = {
	batches: OverdueProjectBatch[];
	activeProjectId: string | null;
	pendingTaskIds: Set<string>;
	runningProjectAction: boolean;
	changedCount: number;
	completedProjectIds: Set<string>;
};
```

Suggested behaviors:

- optimistic row updates remove a task from the selected project batch when it is no longer overdue
- if a batch becomes empty, mark it completed immediately
- if all batches become empty, show completion state without forcing navigation away

## 14. Clean UI Constraints

To keep the interface clean and intuitive:

1. No nested accordions inside task rows in MVP.
2. No always-visible full reschedule planners inside the main task list.
3. Keep visible per-row actions to at most three buttons plus one overflow control.
4. Avoid heavy card-on-card composition inside the selected project panel.
5. Do not show non-overdue tasks by default.

## 15. Telemetry

Suggested events:

1. `overdue_project_batches_loaded`
    - fields: `project_batch_count`, `overdue_task_count`
2. `overdue_project_batch_opened`
    - fields: `project_id`, `lane`, `overdue_count`, `assigned_to_me_count`
3. `overdue_project_batch_task_action`
    - fields: `task_id`, `project_id`, `action`, `result`
4. `overdue_project_batch_project_action`
    - fields: `project_id`, `action`, `attempted`, `succeeded`, `failed`
5. `overdue_project_batch_cleared`
    - fields: `project_id`, `resolved_count`, `duration_ms`
6. `overdue_project_batches_completed`
    - fields: `resolved_projects`, `resolved_tasks`, `duration_ms`

## 16. Rollout Plan

## Phase 1

1. Add grouped overdue project-batch read endpoint.
2. Replace home alert card with overdue project-batch section.
3. Rework modal into project-batched layout.
4. Reuse existing mutation endpoints for row and project actions.

## Phase 2

1. Add undo for recent row action.
2. Add optional bulk-update endpoint for performance.
3. Add richer project-level filters such as `Assigned to me only`.
4. Explore swipe and keyboard polish.

## 17. Acceptance Criteria

1. Dashboard overdue surface shows project batches, not only a raw overdue task count.
2. User can open one project batch and see all overdue tasks for that project at once.
3. The default first batch prioritizes collaborative tasks assigned to the current user.
4. Clearing a task removes it from the active batch immediately when it is no longer overdue.
5. Clearing a project batch advances the user to the next batch without forcing a route change.
6. Advanced reschedule UI is available, but hidden behind secondary controls.
7. The experience works cleanly on both desktop and mobile.

## 18. Open Questions

1. Should the home section show only the top 3 project batches, or all project batches with truncation?
2. Should `Mark all done` ship in MVP, or stay overflow-only behind confirmation?
3. Should the modal auto-advance after clearing a project batch if the user opened a specific batch manually?
4. Should the selected project panel show project next-step context (`next_step_short`) when available, or is that too noisy for MVP?
5. Do we want a compact `Assigned to me only` filter in MVP, or should the default ordering be enough?

## 19. References

External references:

- [PubMed: Working memory costs of task switching](https://pubmed.ncbi.nlm.nih.gov/18444750/)
- [Interaction Design Foundation: Progressive Disclosure](https://www.interaction-design.org/literature/book/the-glossary-of-human-computer-interaction/progressive-disclosure)
- [Interaction Design Foundation: Hierarchical Task Analysis](https://www.interaction-design.org/literature/topics/hierarchical-task-analysis)
- [Todoist: Sort or group tasks in Todoist](https://www.todoist.com/help/articles/sort-or-group-tasks-in-todoist-WFWD0hrb)
- [Todoist: Introduction to sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn)

Relevant current implementation:

- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`
- `apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte`
- `apps/web/src/routes/api/onto/tasks/overdue/+server.ts`

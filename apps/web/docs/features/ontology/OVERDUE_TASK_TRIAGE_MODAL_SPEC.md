<!-- apps/web/docs/features/ontology/OVERDUE_TASK_TRIAGE_MODAL_SPEC.md -->

# Overdue Task Triage Modal Spec

**Last Updated**: March 3, 2026  
**Status**: Draft (Ready for review)  
**Category**: Feature Spec  
**Location**: `/apps/web/docs/features/ontology/OVERDUE_TASK_TRIAGE_MODAL_SPEC.md`

## 1. Overview

This spec defines a new **Task Triage Modal** launched from the overdue alert in:

- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`

Current behavior:

- Dashboard shows overdue count and links to `/projects`.

Target behavior:

- Dashboard opens a focused modal where users can rapidly process overdue tasks.
- Each action should remove the task from the overdue queue immediately (when it is no longer overdue).
- Users can also apply quick actions to all remaining overdue tasks.
- Triage order should prioritize tasks assigned to the current user.
- Tasks assigned to the current user inside collaborative projects should have highest priority.

## 2. Problem Statement

Users can see they have overdue tasks, but cannot resolve them quickly from dashboard context. They must navigate away and manually open/edit tasks one-by-one.

This creates friction and leaves overdue queues stale. It also flattens collaborative and personal work into one queue, which can hide high-urgency “assigned to me” tasks in shared projects.

## 3. Goals

1. Let users process overdue tasks in <60 seconds for common cases.
2. Support fast per-task actions:
   - change state
   - reschedule due date
   - skip to next
3. Support bulk actions for all remaining overdue tasks.
4. Keep user in dashboard context (no forced route change).
5. Use existing task mutation APIs where possible.
6. Prioritize “assigned to me” tasks, with collaborative assigned tasks first.

## 4. Non-Goals

1. Full task editing parity with `TaskEditModal`.
2. Creating/deleting tasks from triage (out of MVP scope).
3. Reworking `/projects` task management UX.
4. Introducing a required new database schema.

## 5. Primary User Stories

1. As a user with 8 overdue tasks, I can quickly mark 3 done, reschedule 4, and leave 1 blocked without leaving dashboard.
2. As a user, I can apply one action to all remaining overdue tasks (for example, push all to tomorrow).
3. As a user, I can swipe/keyboard through the queue rapidly on desktop and mobile.
4. As a collaborator across shared projects, tasks assigned to me should appear before unassigned or other-assignee tasks.
5. As a user, I should be able to triage collaborative assigned tasks as a dedicated section/lane.

## 6. Entry Point Changes

### 6.1 Dashboard Alert Card

Current card (overdue alert) currently links to `/projects`.

Proposed update:

- Primary CTA: `Triage now` (opens modal)
- Secondary inline link: `View all →` (keeps current `/projects` behavior)

Behavior:

- If `overdueTasks === 0`, no card (unchanged).
- If modal cannot load, fallback route to `/projects`.

## 7. Modal UX Spec

## 7.1 Modal Container

- Reuse base `Modal.svelte`.
- Desktop: centered modal (`size="lg"` or `xl`).
- Mobile: bottom-sheet variant with drag handle.
- Lazy-load modal component from `AnalyticsDashboard.svelte` (same pattern used for brief modals).

## 7.2 Modal Header

Header content:

- Title: `Overdue Task Triage`
- Subtitle: `Task X of Y` and `N remaining`
- Lightweight progress indicator (resolved / total)

Header actions:

- `Bulk actions` menu
- Close button

## 7.3 Priority Lanes (Sectioned Queue)

The modal should organize overdue tasks into lanes and process one lane at a time.

Lane order (highest to lowest):

1. `Assigned to me · Collaborative`
2. `Assigned to me · Other projects`
3. `Other overdue`

Lane definitions:

1. `Assigned to me · Collaborative`
   - Task assignee list includes current actor.
   - Project is collaborative (shared project/member project).
2. `Assigned to me · Other projects`
   - Task assignee list includes current actor.
   - Project is not collaborative.
3. `Other overdue`
   - All remaining overdue tasks (unassigned or assigned to others).

Default modal behavior:

- Open on lane 1 when lane 1 has tasks.
- Else open on lane 2.
- Else open on lane 3.

## 7.4 Queue Card (Single Task Focus)

Show one primary task at a time (stack/queue model):

- Task title
- Project name (clickable to open project in new tab or optional side action)
- Due date + relative lateness (`3d overdue`)
- Current state badge
- Priority (if available)
- Assignees summary (if available)

Project context badges on each card:

- `Collaborative` badge when task belongs to collaborative project
- `Assigned to me` badge when current actor is an assignee

## 7.5 Per-Task Quick Actions

Primary actions shown on each card:

1. `Done` → `state_key: 'done'`
2. `In progress` → `state_key: 'in_progress'`
3. `Blocked` → `state_key: 'blocked'`
4. `Reschedule` quick chips:
   - `Today`
   - `Tomorrow`
   - `+3d`
   - `Next week`
   - `Pick date...`
5. `Skip` (no mutation, move to next in queue)

Queue removal rule:

- Remove from queue immediately if mutation makes task non-overdue:
  - `state_key` becomes `done`, or
  - `due_at` moves to `>= now`

## 7.6 Bulk Actions (All Remaining)

Bulk action menu targets remaining queue items in the active scope.

Bulk scope selector:

1. `Current lane` (default)
2. `All lanes`

MVP bulk actions:

1. `Reschedule all to tomorrow`
2. `Reschedule all +3 days`
3. `Set all to in progress`
4. `Mark all done` (requires confirmation)

Post-action behavior:

- Apply optimistic queue updates.
- Show summary toast: `Updated 7 tasks (1 failed)`.

## 7.7 Completion States

- If queue becomes empty after actions: success state with copy like `You cleared your overdue queue`.
- CTA options:
  - `Close`
  - `Go to projects`

## 8. Interaction Model

## 8.1 Keyboard (Desktop)

- `←` / `→`: previous/next task
- `D`: mark done
- `I`: set in progress
- `B`: set blocked
- `R`: open reschedule quick options
- `S`: skip
- `Esc`: close modal

## 8.2 Touch / Swipe (Mobile)

For safety, only two directional task actions in MVP:

- Swipe right: mark done
- Swipe left: reschedule to tomorrow

Swipe threshold should be high enough to prevent accidental updates.

## 9. Data Definition

## 9.1 Overdue Definition

A task is overdue when:

- `deleted_at IS NULL`
- `state_key IN ('todo', 'in_progress', 'blocked')`
- `due_at IS NOT NULL`
- `due_at < now()`

This matches current dashboard analytics count logic.

## 9.2 Collaborative Project Definition

For this feature, a project is “collaborative” when one of these is true:

1. Project is shared (`is_shared = true` in summary context), or
2. Project has active members beyond owner (if member count is available in endpoint implementation).

Note: MVP can rely on `is_shared` to avoid extra query cost.

## 9.3 Priority and Ordering Rules

Primary grouping:

1. Lane 1: assigned-to-me + collaborative
2. Lane 2: assigned-to-me + non-collaborative
3. Lane 3: all other overdue

Within-lane sort:

1. `due_at ASC` (oldest overdue first)
2. `priority ASC` (higher priority first where present)
3. `updated_at ASC`

## 10. API Contract

## 10.1 New Read Endpoint (Recommended)

`GET /api/onto/tasks/overdue`

Query params:

- `limit` (default 50, max 200)
- `cursor` (optional)
- `lane` (optional: `assigned_collab` | `assigned_other` | `other`)

Response shape:

```ts
{
  tasks: Array<{
    id: string;
    project_id: string;
    project_name: string;
    title: string;
    description: string | null;
    state_key: 'todo' | 'in_progress' | 'blocked' | 'done';
    due_at: string | null;
    priority: number | null;
    updated_at: string;
    is_assigned_to_me: boolean;
    project_is_shared: boolean;
    project_is_collaborative: boolean;
    assignees?: Array<{
      actor_id: string;
      name: string | null;
      email: string | null;
    }>;
  }>;
  laneCounts: {
    assigned_collab: number;
    assigned_other: number;
    other: number;
  };
  total: number;
  nextCursor: string | null;
}
```

Access model:

- Auth required.
- Only returns tasks from projects user can read/write via existing project access logic.
- `is_assigned_to_me` should be computed with current actor id (`ensure_actor_for_user`).

## 10.2 Existing Mutation Endpoints to Reuse

Single-task updates should reuse existing API:

- `PATCH /api/onto/tasks/[id]`

Fields used by triage:

- `state_key`
- `due_at`

## 10.3 Bulk Mutation Strategy

MVP:

- Perform bulk actions client-side as sequential or small-batch `PATCH` requests.

V2 (optional optimization):

- Add `POST /api/onto/tasks/bulk-update` for server-side bulk patch + summarized result.

## 11. Frontend Architecture

## 11.1 New Components

1. `apps/web/src/lib/components/dashboard/OverdueTaskTriageModal.svelte`
2. (optional) `apps/web/src/lib/components/dashboard/TaskTriageCard.svelte`
3. (optional) `apps/web/src/lib/components/dashboard/TaskRescheduleQuickPicker.svelte`

## 11.2 Dashboard Integration

Update in:

- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`

Add state:

- `showOverdueTriageModal`
- lazy-loaded `OverdueTaskTriageModal`

Add handlers:

- `openOverdueTriageModal()`
- `handleOverdueTriageClose(summary)`

Refresh behavior:

- Call existing `refreshHandler` once after modal closes with changes.

## 11.3 State + Optimistic UX

In modal local state:

- `tasks[]` queue
- `laneTasks: { assigned_collab: Task[]; assigned_other: Task[]; other: Task[] }`
- `activeLane`
- `laneCounts`
- `currentIndex`
- `pendingActionIds: Set<string>`
- `mutationErrors[]`
- `changedCount`

Optimistic behavior:

- Immediately remove/advance task from queue when action is triggered.
- On failure, restore task and show inline/toast error.

## 12. Error Handling

1. Read endpoint fails:
   - show inline retry state in modal.
2. Task patch fails:
   - restore item to queue.
   - toast with task title + error.
3. Partial bulk failures:
   - keep failed items in queue and summarize results.
4. Task no longer overdue at mutation time:
   - treat as resolved and remove locally.

## 13. Accessibility

1. Focus trap and escape behavior from base `Modal.svelte`.
2. All quick actions keyboard reachable.
3. Swipe actions must have equivalent visible buttons.
4. Announce queue progress via `aria-live` region.
5. Color badges must not be only state cue (include text labels).

## 14. Analytics / Telemetry

Suggested events:

1. `overdue_triage_opened`
   - fields: `default_lane`, `lane_counts`
2. `overdue_triage_task_action`
   - fields: `action`, `task_id`, `project_id`, `lane`, `is_assigned_to_me`, `project_is_collaborative`, `result`
3. `overdue_triage_bulk_action`
   - fields: `action`, `scope`, `lane`, `attempted`, `succeeded`, `failed`
4. `overdue_triage_completed`
   - fields: `resolved_count`, `duration_ms`, `resolved_by_lane`

## 15. Rollout Plan

## Phase 1 (MVP)

1. New overdue read endpoint.
2. Modal with lane-based queue + per-task actions.
3. Basic bulk actions via client-side loop.
4. Dashboard card CTA integration.
5. Refresh analytics after close.

## Phase 2 (Polish)

1. Swipe gestures for task actions.
2. Keyboard shortcut hints UI.
3. Undo last action.
4. Optional server bulk endpoint.

## 16. Acceptance Criteria

1. Overdue card opens modal directly from dashboard.
2. User can process tasks without leaving current page.
3. Tasks assigned to current user in collaborative projects are shown first by default.
4. Task exits queue immediately after becoming non-overdue.
5. Bulk action applies to selected scope (`current lane` or `all lanes`) and reports partial failures.
6. Closing modal reflects updated overdue count after refresh.
7. Works on mobile and desktop with accessible controls.

## 17. Open Questions for Review

1. Should `Mark all done` ship in MVP, or be deferred to Phase 2 for safety?
2. For swipe defaults, do you prefer:
   - right = done / left = tomorrow (recommended), or
   - different mapping?
3. Should `Skip` tasks remain in queue order for the same session, or move to end?
4. Should lane 3 (`Other overdue`) be collapsed by default until lane 1 and lane 2 are empty?
5. Should triage include `Delete` action, or stay state/reschedule-only?
6. Do we want automatic open of this modal when overdue count crosses a threshold (for example `>= 10`)?

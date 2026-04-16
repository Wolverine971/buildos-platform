<!-- apps/web/docs/features/ontology/PROJECTS_GRAPH_FILTERING_SPEC.md -->

# Projects Graph Filtering Spec

## Problem

The workspace graph at `/projects?view=graph` is currently too noisy for day-to-day use. The graph can include large volumes of terminal or low-signal data, including completed tasks, completed plans, completed milestones, achieved goals, mitigated risks, archived documents, and inactive projects. This also makes the graph large enough to hit payload or layout limits.

Soft-deleted data should not appear in the normal project graph. Permanent deletion is a separate cleanup workflow and should not be driven by graph rendering.

## Goals

- Make the default graph represent current work, not historical exhaust.
- Keep completed/archived data available behind explicit toggles.
- Reduce server payload size before Cytoscape layout work begins.
- Preserve complete per-project graph access when the user intentionally asks for it.
- Create a foundation for future cleanup tools without hard-deleting data as part of this UI change.

## Non-Goals

- Hard-delete soft-deleted rows from graph requests.
- Redesign the graph renderer or replace Cytoscape.
- Add a new canonical task state for `scheduled`.
- Solve the admin graph page fully in the first implementation slice.

## Current Data Observations

Live data on April 16, 2026 showed the main noise buckets:

- Tasks: many `todo` rows, 289 `done` rows, and 103 soft-deleted rows.
- Scheduled tasks are not a stored state; they are derived from `start_at` or `due_at`.
- Plans: 97 `completed` rows.
- Milestones: 367 `completed` rows.
- Goals: 37 `achieved` rows.
- Risks: 47 `mitigated` and 7 `closed` rows.
- Documents: archived documents exist as `state_key = archived`.

## Filter Model

Add a graph-specific scope filter model. This is separate from the visual node-type focus filter.

Default state:

- Show active tasks.
- Show scheduled tasks.
- Hide backlog/unscheduled todo tasks.
- Hide done tasks.
- Hide completed plans.
- Hide achieved/abandoned goals.
- Hide completed milestones.
- Hide mitigated/closed risks.
- Hide inactive projects.
- Hide archived documents/entities.
- Hide soft-deleted rows.
- Show inferred project ownership links from `project_id`.

Task buckets:

- `active`: `state_key` is `in_progress`, `active`, or `blocked`.
- `scheduled`: not done/deleted and has `start_at` or `due_at`.
- `backlog`: todo/draft/pending work without a schedule.
- `done`: `state_key` is `done`, `complete`, or `completed`.

The task buckets are mutually exclusive for counts and filtering. Done wins first, active wins second, scheduled wins third, and remaining unscheduled work is backlog.

## API Behavior

`GET /api/onto/graph` accepts boolean query parameters:

- `showActiveTasks`
- `showScheduledTasks`
- `showBacklogTasks`
- `showDoneTasks`
- `showCompletedPlans`
- `showAchievedGoals`
- `showCompletedMilestones`
- `showClosedRisks`
- `showInactiveProjects`
- `showArchived`
- `showDeleted`
- `showInferredProjectLinks`

Defaults are provided server-side. Unknown values are treated as defaults.

The workspace graph is actor-scoped, not admin-expanded. `/projects?view=graph` must only load projects where the current actor is the project owner or has an active `onto_project_members` row. Admin users still follow that rule on this route. The global project graph belongs under `/admin/ontology/graph`.

Filtering happens after actor-scoped graph loading and before graph-data construction and node-limit shaping. Edges are pruned to endpoints still present after filtering.

`showDeleted` is reserved for admin/debug use. Normal workspace graph controls should not expose it until authorization and retention semantics are explicit.

The API returns `metadata.scopeCounts` keyed by scope toggle. Each count includes:

- `total`: matching rows/links in the loaded project scope before filters.
- `included`: matching rows/links selected by scope filters before node-limit shaping.
- `returned`: matching rows/links present in the returned graph payload.
- `filteredOut`: hidden by scope filters.
- `omitted`: selected by scope filters but omitted by the node limit.

Completed task totals use a count-only database query because the row loader intentionally skips completed task rows when `showDoneTasks=false`.

When `showInferredProjectLinks=true`, the server adds non-persisted `project_contains` edges from project nodes to project-owned child entities that have a `project_id` but no direct project edge. These edges are marked with `props.inferred = true` and are not written to `onto_edges`.

## UI Behavior

`GraphControls.svelte` exposes a compact `Scope` section:

- Active tasks
- Scheduled tasks
- Backlog tasks
- Done tasks
- Completed plans
- Achieved goals
- Completed milestones
- Closed risks
- Inactive projects
- Archived
- Project links

Changing a scope toggle reloads graph data from `/api/onto/graph` because the payload should be filtered on the server. The existing node-type dropdown remains a visual focus control that operates on the already-loaded graph.

Toggle labels show scope counts as `returned/total` when anything is hidden or omitted, otherwise they show the total. The tooltip breaks down hidden-by-filter and omitted-by-limit counts.

## Limit Behavior

The bounded overview behavior remains in place. The limit applies after scope filtering. If the filtered graph is still over the node limit, the API returns a truncated overview with metadata instead of `413`.

Metadata includes:

- active filter values
- whether the result is truncated
- original node and edge count after filtering
- returned node and edge count
- omitted node and edge count
- scope counts
- returned inferred project-link edge count

## Cleanup Path

Permanent deletion should be implemented separately as an admin cleanup tool:

- Count soft-deleted rows by table and age.
- Detect dangling edges.
- Preview purge impact.
- Hard-delete rows only after a retention window.
- Remove or repair edges that point to purged rows.

## First Implementation Slice

1. Add shared graph scope filter types/defaults/URL serialization.
2. Add server-side source filtering for `/api/onto/graph`.
3. Update the graph store cache key to include scope filters.
4. Add scope toggles to `GraphControls.svelte`.
5. Wire `/projects?view=graph` to reload when scope filters change.
6. Add focused tests for default filtering and opt-in terminal rows.
7. Add count metadata and visible counts on scope toggles.
8. Add inferred project ownership edges for FK-owned isolated nodes.

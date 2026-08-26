<!-- docs/plans/PROJECT_GOAL_TRACKING_TIER1_PLAN_2026-08-12.md -->

# Project Goal Tracking — Tier 1–3 Plan

Date: 2026-08-12
Status: Tier 1–2 and the first Tier 3 slice implemented locally; authenticated visual verification pending.

## Product kernel

A goal should answer two questions at a glance:

1. Is any real work connected to it?
2. Is there enough structure to talk about progress honestly?

Tier 1 does not manufacture a universal progress percentage. It makes the existing relationship
data visible, names missing structure plainly, and gives every goal a focused path into chat where
the user can review a proposed plan, milestones, or tasks before anything is created.

Tier 2 keeps that summary compact, then lets the user inspect and shape the goal's connected work
without leaving the project workspace.

Tier 3 makes progress an explicit choice. A goal can use milestone completion, task completion, a
numeric metric, a reviewed manual percentage, or no score. The UI never selects a method merely
because connected work happens to exist.

## Tier 1 scope

- Remove the low-information `Active` tag from goal cards. Preserve exceptional lifecycle states
  such as draft, achieved, and abandoned.
- Load explicit goal connections when the Goals panel opens. Count tasks, plans, and milestones from
  ontology edges plus explicit `goal_id` properties; do not infer relationships from names or dates.
- Show a project-level coverage summary: connected tasks and tasks that remain project-level.
- Show per-goal task state, plan coverage, milestone coverage, target-date coverage, and
  recent activity metadata.
- Handle missing data as a normal state:
    - no tasks;
    - no plan;
    - tracking not set (no milestones);
    - no supporting work connected at all;
    - relationship summary unavailable.
- Add a persistent goal-focused chat action. Unstructured goals use `Structure with chat`; connected
  goals use `Discuss`. The initial prompt is review-first and explicitly requires approval before
  creating or linking work.
- Refresh the connection summary after relevant project mutations.

## Data contract

Add a lazy, project-scoped endpoint at
`GET /api/onto/projects/:projectId/goal-connections`. It performs a fixed set of parallel queries and
returns one batched response for all goals, avoiding per-goal requests and avoiding counts from the
project page's intentionally windowed task payload.

Accepted explicit relationships:

- Tasks: `has_task`, `supports_goal`, `achieved_by`
- Plans: `supports_goal`, `supports`, `has_plan`, `achieved_by`
- Milestones: `has_milestone`, plus legacy `has`
- Entity `props.goal_id` remains an explicit fallback during schema migration.

Connections are accepted in either edge direction, constrained to live entities in the same
project, and deduplicated by entity ID.

## Tier 2 scope

- Add one `Connected work` disclosure per goal. It stays collapsed by default so the goal remains a
  summary rather than becoming a nested project page.
- Return compact task, plan, and milestone records in the existing lazy batch response. Tasks are
  ordered with blocked/in-progress work first, plans with active work first, and milestones with
  current work and the next due date first.
- Group connected work into flat Tasks, Plans, and Milestones lists. Selecting a row opens the
  existing entity detail flow.
- For goals with no supporting work, use the same disclosure as a setup surface rather than showing
  a false empty percentage.
- Offer separate `Create` and `Link existing` actions for task, plan, and milestone. New tasks and
  plans pass the goal parent into the existing atomic create APIs; milestones continue through the
  goal-scoped milestone create flow. Linking reuses the existing ontology relationship service.
- Refresh the lazy goal summary after any link or create mutation.

## Progress policy

- No generic progress bar before a tracking method is selected.
- Milestone and task methods use their factual completed/connected ratio, but only when at least
  one matching item is connected. An empty selected source remains `No ... connected`, not `0%`.
- Metric progress is calculated from an explicit start, current value, and target. Increasing and
  decreasing targets are both supported and the rendered percentage is clamped to 0–100.
- Manual progress requires an explicit 0–100 value and supports a short evidence note.
- `No score` preserves relationship and activity metadata without presenting a percentage.

## Tier 3 scope — first slice

- Persist a versioned tracking preference in the goal's existing merge-safe `props.goal_tracking`
  object. No database migration or new endpoint is required.
- Add a compact `Track progress` action to each goal card and lazy-load the editor only when used.
- Offer five methods: no score, milestones, tasks, metric, and manual.
- Preview the chosen method before save and render a semantic progress bar only when the selected
  method has a valid factual value.
- Refresh the goal in place and reload connection metadata after save.
- Parse stored configuration defensively so legacy, incomplete, or malformed props fall back to no
  score rather than breaking the Goals panel.

## Verification

- Pure summary-builder tests for relationship aliases, direction, property fallback, deduplication,
  task states, milestone progress, and project-level task coverage.
- Component tests for active-tag removal, populated metadata, unstructured goals, unavailable data,
  and focused chat prompts.
- Svelte autofixer on touched Svelte files, focused tests, scoped formatting, and project checks.
- Update the project workspace Hyperplexed audit/tracker with the shipped Tier 1 work and remaining
  visual verification.

## Remaining Tier 3 work

- Add progress history and trend language only after there is a trustworthy snapshot/event source.
  The current `updated_at` marker identifies when the preference was reviewed; it is not treated as
  a historical time series.
- Decide whether metric updates should create dedicated ontology events once real usage establishes
  the required audit/history granularity.
- Reconsider the standalone Milestones surface only after migration and usage data show that every
  milestone is safely goal-owned.

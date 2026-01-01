<!-- docs/reports/ontology-project-modals-data-models.md -->

# Ontology Modals vs Data Models (projects/[id])

Source of truth: `apps/web/docs/features/ontology/DATA_MODELS.md`

Scope:

- Modals wired in `apps/web/src/routes/projects/[id]/+page.svelte`
- Modals reused in `apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte`

## Cross-cutting diffs

### State enums diverge from DATA_MODELS.md

| Entity    | DATA_MODELS.md states                                 | Modal states (source)                                                                                                                                                     |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project   | `draft`, `active`, `paused`, `complete`, `archived`   | `planning`, `active`, `completed`, `cancelled` (`OntologyProjectEditModal.svelte`)                                                                                        |
| Task      | `todo`, `in_progress`, `blocked`, `done`, `abandoned` | `todo`, `in_progress`, `blocked`, `done`, `archived` (`TaskCreateModal.svelte`); `todo`, `in_progress`, `blocked`, `done` (`TaskEditModal.svelte`)                        |
| Plan      | `draft`, `active`, `review`, `complete`               | `draft`, `planning`, `active`, `on_hold`, `completed`, `cancelled` (`PlanCreateModal.svelte`); `draft`, `active`, `completed` (`PlanEditModal.svelte`)                    |
| Output    | `draft`, `review`, `approved`, `published`            | `draft`, `in_progress`, `review`, `published` (`OutputEditModal.svelte`)                                                                                                  |
| Document  | `draft`, `published`                                  | `draft`, `review`, `published` (`DocumentModal.svelte`)                                                                                                                   |
| Goal      | `active`, `achieved`, `abandoned`                     | `draft`, `active`, `achieved`, `abandoned` (`GoalCreateModal.svelte`, `GoalEditModal.svelte`)                                                                             |
| Milestone | `pending`, `achieved`, `missed`                       | `pending`, `in_progress`, `achieved`, `missed`, `deferred` (`MilestoneCreateModal.svelte`); `pending`, `in_progress`, `completed`, `missed` (`MilestoneEditModal.svelte`) |
| Risk      | `identified`, `mitigated`, `closed`                   | `identified`, `mitigated`, `occurred`, `closed` (`RiskEditModal.svelte`)                                                                                                  |
| Decision  | (no state_key in model)                               | `pending`, `made`, `deferred`, `reversed` (`DecisionCreateModal.svelte`, `DecisionEditModal.svelte`)                                                                      |

### Props vs column usage (post-migration)

DATA_MODELS.md notes dedicated columns for `description`, `content`, etc. Several modals still read/write props-based fields or use non-model fields:

- `PlanCreateModal.svelte` / `PlanEditModal.svelte`: uses `props.description`, `props.start_date`, `props.end_date` and sends `start_date`/`end_date` in payload. `OntoPlan` model has `description` and `plan` columns, but no start/end fields.
- `GoalCreateModal.svelte` / `GoalEditModal.svelte`: reads `goal.props.description`, `goal.props.target_date`, `goal.props.measurement_criteria`, `goal.props.priority` instead of the `description`/`target_date` columns. No UI field for the `goal` column.
- `MilestoneEditModal.svelte`: reads `milestone.props.description` and `milestone.props.state_key` rather than columns; no UI for the `milestone` column.
- `RiskCreateModal.svelte` / `RiskEditModal.svelte`: uses `description`, `mitigation_strategy`, `owner` as top-level fields (and reads from `props`) even though the model specifies a `content` column; no UI for `content`.
- `DocumentModal.svelte`: does not expose the `description` column at all.
- `OutputEditModal.svelte`: uses `DocumentEditor` to store HTML content in `props` (not a standard `OntoOutput` column).

### Relationship modeling differs from DATA_MODELS.md

- Tasks are linked to plans/goals/milestones via `plan_id`, `goal_id`, and `supporting_milestone_id` in `TaskCreateModal.svelte` and `TaskEditModal.svelte`. DATA_MODELS.md describes these relationships as `onto_edges` (no task `plan_id`/`goal_id` columns).

### Type key conventions diverge from DATA_MODELS.md

- `TaskCreateModal.svelte` uses `task.planning` and `task.meeting`. DATA_MODELS.md expects `task.plan` or `task.coordinate.meeting` patterns.
- `PlanCreateModal.svelte` uses `plan.phase.sprint`, `plan.phase.base`, `plan.phase.quarter`. DATA_MODELS.md examples show `plan.sprint`, `plan.phase`, `plan.quarterly`.
- `DocumentModal.svelte` defaults to `doc.project.note` which does not match the `document.*` pattern described in DATA_MODELS.md.

### Numeric scales

- Risk probability is presented as 0-1 values (10% -> 0.1) in `RiskCreateModal.svelte` / `RiskEditModal.svelte`, while DATA_MODELS.md describes `probability` as 0-100.

## Modal-level notes

### `apps/web/src/lib/components/ontology/TaskCreateModal.svelte`

- State options include `archived` (not in DATA_MODELS.md) and omit `abandoned`.
- Sends `plan_id`, `goal_id`, `supporting_milestone_id` although DATA_MODELS.md models these as edges.
- Uses non-standard type keys `task.planning`, `task.meeting`.

### `apps/web/src/lib/components/ontology/TaskEditModal.svelte`

- State options omit `abandoned` and do not include `archived` (inconsistent with create modal).
- Reads goal/milestone from `props.*` and writes `plan_id`, `goal_id`, `supporting_milestone_id` despite edge-based modeling.

### `apps/web/src/lib/components/ontology/PlanCreateModal.svelte`

- State options (`planning`, `on_hold`, `cancelled`) do not match DATA_MODELS.md.
- Writes `start_date`/`end_date` to props and payload but these are not in the plan model.
- No UI for the `plan` content column.
- Uses `plan.phase.*` type keys instead of `plan.*` examples.

### `apps/web/src/lib/components/ontology/PlanEditModal.svelte`

- Uses PLAN_STATES (`draft`, `active`, `completed`) which does not align with DATA_MODELS.md (`review`, `complete`).
- Reads `plan.props.*` for description and dates; no UI for the `plan` column.

### `apps/web/src/lib/components/ontology/GoalCreateModal.svelte`

- Uses `draft` state; DATA_MODELS.md uses `active` as the initial state.
- Stores `description`, `target_date`, `measurement_criteria`, `priority` in `props` even though description/target_date are modeled columns.
- No UI for the `goal` column.

### `apps/web/src/lib/components/ontology/GoalEditModal.svelte`

- Reads description/target date from `props` rather than columns.
- Sends `priority` and `measurement_criteria` (not in the model) as top-level fields.

### `apps/web/src/lib/components/ontology/OutputCreateModal.svelte`

- Uses `output.document`, `output.report`, etc. (not documented in DATA_MODELS.md examples).

### `apps/web/src/lib/components/ontology/OutputEditModal.svelte`

- Output states include `in_progress` and omit `approved` compared to DATA_MODELS.md.
- Uses `DocumentEditor` to persist HTML into `props` (no output `content` column exists).
- Does not expose `facet_stage`, `source_document_id`, or `source_event_id`.

### `apps/web/src/lib/components/ontology/DocumentModal.svelte`

- Document states include `review` which is not in DATA_MODELS.md.
- Default type key `doc.project.note` does not match `document.*` pattern.
- No UI for the `description` column.

### `apps/web/src/lib/components/ontology/RiskCreateModal.svelte`

- Uses `description` and `mitigation_strategy` fields; DATA_MODELS.md expects `content` and does not list mitigation fields.
- Probability uses a 0-1 scale while DATA_MODELS.md specifies 0-100.

### `apps/web/src/lib/components/ontology/RiskEditModal.svelte`

- Adds `occurred` state not present in DATA_MODELS.md.
- Reads description/mitigation/owner from `props` instead of using a `content` column.

### `apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte`

- State options include `in_progress` and `deferred` which are not in DATA_MODELS.md.
- No UI for the `milestone` content column.

### `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`

- Uses `completed` instead of `achieved` and includes `in_progress`.
- Reads description from `props` and never exposes the `milestone` column.

### `apps/web/src/lib/components/ontology/DecisionCreateModal.svelte`

- Uses `state_key`, `description`, and `outcome`, but DATA_MODELS.md only specifies `title`, `decision_at`, `rationale`, `props`.

### `apps/web/src/lib/components/ontology/DecisionEditModal.svelte`

- Same extra fields and state handling as the create modal.

### `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`

- Project states (`planning`, `completed`, `cancelled`) do not match DATA_MODELS.md (`draft`, `paused`, `complete`, `archived`).
- No UI for `type_key` or `is_public` fields.

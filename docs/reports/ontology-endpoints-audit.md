<!-- docs/reports/ontology-endpoints-audit.md -->

# Ontology Endpoints & Data Model Consistency Audit

Date: 2026-02-XX
Scope: `/projects/[id]` UI, `/api/onto/*` endpoints, ontology data model docs/types, and related graph/linking services.

## High Severity

1. Task-plan edge direction mismatch (plan relationships silently missing)

- Evidence: task creation only writes `plan -> task` (`rel = has_task`) and never inserts `task -> plan` (`rel = belongs_to_plan`). `GET /api/onto/tasks/[id]` and `get_project_full` only look for `belongs_to_plan`, so newly created tasks with `plan_id` will appear unplanned until a later PATCH adds the missing edge.
- References: `apps/web/src/routes/api/onto/tasks/create/+server.ts:193` `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:95` `supabase/migrations/20251221_soft_delete_onto_projects.sql:292`
- Impact: plan data missing in task fetches and project hydration; UI can show tasks as unplanned even though a plan was provided.
- Suggested fix: create both edges on create (match PATCH behavior) or update query logic to also accept `has_task` edges.

2. Soft-delete contract violated across multiple endpoints and graph loaders

- Evidence: GET endpoints fetch entity tables without `deleted_at IS NULL`, despite docs requiring it. The graph loaders and linking endpoints also include deleted records.
- References (examples):
    - `apps/web/src/routes/api/onto/projects/[id]/+server.ts:84` (entity fetches, no `deleted_at` filters; context document join also unfiltered)
    - `apps/web/src/routes/api/onto/plans/[id]/full/+server.ts:35` `apps/web/src/routes/api/onto/goals/[id]/full/+server.ts:35` `apps/web/src/routes/api/onto/documents/[id]/full/+server.ts:35`
    - `apps/web/src/lib/services/ontology/project-graph-loader.ts:63` `apps/web/src/lib/services/ontology/project-graph-loader.ts:174`
    - `apps/web/src/routes/api/onto/edges/linked/+server.ts:173` `apps/web/src/routes/api/onto/edges/available/+server.ts:146`
- Impact: deleted entities can reappear in `/projects/[id]`, graph views, and link pickers; downstream UI might act on stale data.
- Suggested fix: add `.is('deleted_at', null)` consistently to entity queries and document the explicit opt-in for deleted data (per `apps/web/docs/features/ontology/API_ENDPOINTS.md`).

3. Document FSM mismatch: `ready`/`in_review` states used in workflow, but not in enums or validation

- Evidence: task document promotion defaults to `ready`, and the workspace spec calls for `draft -> in_review -> ready -> published -> archived`, while `DOCUMENT_STATES` only allow `draft/review/published` and API validation enforces that list.
- References: `apps/web/src/routes/api/onto/tasks/[id]/documents/[documentId]/promote/+server.ts:40` `apps/web/src/lib/types/onto.ts:36` `apps/web/docs/features/ontology/task-document-workspace-spec.md:80`
- Impact: documents can be written to `state_key = ready` (or `in_review`) without validation, then rejected by endpoints/UX that rely on `DOCUMENT_STATES`.
- Suggested fix: either expand `DOCUMENT_STATES` + DB enum to match the workflow or align the workflow to the existing enum and update `promote` logic accordingly.

## Medium Severity

4. Output state display in `/projects/[id]` diverges from data model

- Evidence: output states are defined as `draft/in_progress/review/published`, but the project page uses `approved` instead of `in_progress`, and maps `in_progress` to `draft`.
- References: `apps/web/src/lib/types/onto.ts:31` `apps/web/src/routes/projects/[id]/+page.svelte:136` `apps/web/src/routes/projects/[id]/+page.svelte:404`
- Impact: outputs in progress appear as draft and the "approved" column is never driven by a real state.
- Suggested fix: align UI states with `OUTPUT_STATES` (include `in_progress`, drop `approved` or map it explicitly to `published`).

5. Output creation accepts invalid state values

- Evidence: `state_key` from request is written directly without validating against `OUTPUT_STATES`.
- References: `apps/web/src/routes/api/onto/outputs/create/+server.ts:83` `apps/web/src/lib/types/onto.ts:31`
- Impact: invalid states can be inserted, breaking downstream UI/state logic.
- Suggested fix: validate `state_key` in create using `OUTPUT_STATES` (as done in output PATCH).

6. Decision create returns 200 with a misleading payload instead of 201

- Evidence: `ApiResponse.success({ decision }, 201)` treats `201` as a message, not a status.
- Reference: `apps/web/src/routes/api/onto/decisions/+server.ts:240`
- Impact: clients expecting `201 Created` or status-based logic will misbehave.
- Suggested fix: replace with `ApiResponse.created({ decision })`.

7. Project PATCH allows arbitrary `state_key` and facet values

- Evidence: project updates accept any string without validation against `PROJECT_STATES` or facet enums.
- Reference: `apps/web/src/routes/api/onto/projects/[id]/+server.ts:277`
- Impact: invalid states/facets can enter the database and conflict with UI expectations.
- Suggested fix: validate `state_key` and facet values using the enums in `apps/web/src/lib/types/onto.ts`.

## Low Severity / Consistency Issues

8. Project task-plan edge query not scoped by project

- Evidence: `taskPlanEdgesResult` pulls all `belongs_to_plan` edges globally, then filters in memory.
- Reference: `apps/web/src/routes/api/onto/projects/[id]/+server.ts:104`
- Impact: unnecessary load and potential scaling issues as edge table grows.
- Suggested fix: add `.eq('project_id', id)` to edge query.

9. Error response code inconsistencies

- Evidence: some endpoints use `ApiResponse.error('Unauthorized', 401)` or `ApiResponse.error('Access denied', 403)` instead of `ApiResponse.unauthorized/forbidden`, causing missing `code` fields and inconsistent error shapes.
- Examples: `apps/web/src/routes/api/onto/plans/[id]/full/+server.ts:24` `apps/web/src/routes/api/onto/goals/[id]/full/+server.ts:24` `apps/web/src/routes/api/onto/documents/[id]/full/+server.ts:24`
- Impact: clients relying on `code` or uniform error messaging get inconsistent responses.
- Suggested fix: standardize on `ApiResponse.unauthorized/forbidden/notFound` helpers.

10. `ApiResponse.notFound` misused with full messages

- Evidence: `ApiResponse.notFound('Project not found')` results in `"Project not found not found"`.
- Example: `apps/web/src/routes/api/onto/projects/[id]/+server.ts:48` `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts:72`
- Impact: confusing error strings, inconsistent logs.
- Suggested fix: pass resource names only (e.g., `ApiResponse.notFound('Project')`).

11. Output create error helpers used with wrong types

- Evidence: `ApiResponse.databaseError` and `ApiResponse.internalError` are invoked with strings instead of Error objects.
- Reference: `apps/web/src/routes/api/onto/outputs/create/+server.ts:100` `apps/web/src/routes/api/onto/outputs/create/+server.ts:146`
- Impact: inconsistent logging and loss of error context.
- Suggested fix: pass the original error object; use `ApiResponse.created` where appropriate.

## Notes

- The soft-delete contract in `apps/web/docs/features/ontology/API_ENDPOINTS.md` ("GET endpoints automatically filter out soft-deleted records") does not match current behavior in several endpoints; this is a doc/runtime mismatch that should be reconciled.

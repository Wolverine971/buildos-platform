<!-- apps/web/docs/features/ontology/task-document-workspace-spec.md -->

# Task ↔ Document Workspace Specification (Edge-First)

**Status**: Ready for implementation  
**Last Updated**: February 15, 2025  
**Owners**: Ontology UI + Agent Systems  
**Constraint**: No new columns; reuse existing ontology schema (`onto_documents`, `onto_edges`, FSM state_key).

---

## 0. Problem Statement

Task records currently carry only high-level metadata (title, priority, FSM state) plus a small `props.description`. Users and agents frequently need a richer scratch space for drafts, research, or deliverables that eventually become project artifacts. We want this workflow without extending the task schema or duplicating document state. The ontology already gives us:

- `onto_documents` (with `state_key`, `props`, `created_by`, `project_id`, timestamps)
- `onto_document_versions` for snapshots
- `onto_edges` for arbitrary relationships

The goal is to orchestrate these existing pieces into a consistent “task workspace” pattern.

---

## 1. Objectives

1. Use **edge relationships** (not new columns) to model ownership/attachments between tasks, documents, and projects.
2. Keep document lifecycle tracking inside the existing **FSM `state_key`** and `state` APIs.
3. Provide a TaskEditModal workspace view that surfaces scratch pads and linked documents without schema changes.
4. Define API/service contracts that re-use the current tables so both humans and agents can create/edit/promote documents predictably.
5. Capture provenance via existing fields (`created_by`, `project_id`, `props`) plus edges, so we can answer “which task created this doc?”.

---

## 2. Constraints & Principles

- **No new DB columns.** All relationships must live in `onto_edges` or `props`.
- **FSM-first state management.** Documents already have `state_key` + FSM definitions; use transitions for draft → review → ready → published.
- **Edge semantics > derived flags.** Ownership (“task owns doc”, “doc promoted to project”) is represented with typed edges and optional edge props.
- **Created_by remains source of truth** for “who authored”, while `edge.props.origin_task_id` tracks provenance if needed.

---

## 3. Data Model & Relationships

### 3.1 `onto_documents`

Existing columns (no change):

| Column                      | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `project_id`                | The project context the document belongs to (populated on create; rarely changes). |
| `state_key`                 | FSM state (e.g., `draft`, `in_review`, `ready`, `published`, `archived`).          |
| `type_key`                  | Template/type for the document.                                                    |
| `props`                     | Stores Markdown (`body_markdown`), scratch metadata, expected outputs, etc.        |
| `created_by`                | Actor that created the doc.                                                        |
| `created_at` / `updated_at` | Audit history.                                                                     |

### 3.2 Edge Taxonomy (new rel keys only)

| rel                        | src_kind   | dst_kind   | Usage                                                                                                                     |
| -------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `task_has_document`        | `task`     | `document` | Task workspace scratch pad or deliverable; `edge.props.role` ∈ `['scratch','deliverable','reference']`.                   |
| `document_primary_project` | `document` | `project`  | Indicates project currently presenting the doc. `props.kind='primary'`. Mirrors `project_id` but keeps promotion history. |
| `document_supports_task`   | `document` | `task`     | Document created elsewhere but referenced by another task (review, QA).                                                   |
| `document_promotes_output` | `document` | `output`   | Optional future expansion tying docs to outputs.                                                                          |

Edges capture ownership/usage and can co-exist (one doc linked to many tasks/projects). Promotion is modeled as:

1. Ensure doc has a `document_primary_project` edge (already inserted on creation).
2. Add/Update `task_has_document.props.state='handed_off'` when the originating task completes.

### 3.3 Provenance

- `task_has_document.props.origin_task_id` stores the originating task ID (and is redundant but local to the edge).
- `document_primary_project` edges keep an audit trail when the document is reused on another project (rare but supported).
- `created_by` remains the author.

### 3.4 FSM Workflow

Documents already participate in FSM transitions (see `apps/web/docs/features/ontology/DATA_MODELS.md`). We standardize on:

```
draft -> in_review -> ready -> published -> archived
         ^           |
         |-----------|
```

- Each transition can trigger automation (e.g., moving a document to project view at `ready`).
- Task completion logic uses state transitions: when a task is marked `done`, we attempt to transition linked documents to `ready` (if not already) and mark the edge as handed off.

---

## 4. API & Service Contracts (Edge-Driven)

All routes operate on existing tables.

| Endpoint                                             | Method | Description                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/onto/tasks/{taskId}/documents`                 | GET    | Returns list of documents linked via `task_has_document` plus metadata (`state_key`, `props`, edge props). Includes a `scratch_pad` shortcut to whichever edge has `role='scratch'`.                                    |
| `/api/onto/tasks/{taskId}/documents`                 | POST   | Creates a document (via `onto_documents` insert) scoped to task’s project, then inserts `task_has_document` edge with appropriate role.                                                                                 |
| `/api/onto/tasks/{taskId}/documents/{docId}`         | PATCH  | Updates doc fields (title, props, state) and optionally edge props (role, order).                                                                                                                                       |
| `/api/onto/tasks/{taskId}/documents/{docId}/promote` | POST   | Transitions doc FSM to `ready`/`published` and annotates the edge (`edge.props.handed_off=true`, `handed_off_at=now()`). Can also create a new `document_supports_task` edge pointing to the project-level review task. |
| `/api/onto/documents/{docId}/links`                  | GET    | Lists all edges so UI can show “Linked to X tasks/projects”.                                                                                                                                                            |

Service layer (`TaskDocumentService`) orchestrates:

- Fetching documents + edges.
- Creating documents + edges in one transaction.
- Running FSM transitions (via existing FSM APIs) when promoting/handoffs occur.
- Emitting telemetry events.

---

## 5. UI / UX Requirements

### 5.1 TaskEditModal Views

- **Details tab**: current form + summary chip (“Workspace docs: 2 (1 Draft, 1 Ready)”).
- **Workspace tab**: new layout with scratch pad + linked document list. Relies on `/tasks/{id}/documents` GET.

### 5.2 Scratch Pad

- Default document with `role='scratch'`.
- Created lazily on first keystroke (POST) if no scratch doc exists.
- Auto-saves to `props.body_markdown` (PATCH), updates `state_key` if necessary.
- Promotion button triggers FSM transition + updates `task_has_document` edge.

### 5.3 Document List & Editor

- Card per `task_has_document` edge showing doc state (from `state_key`), ownership (derived from edges), and last updated.
- “New Document” CTA opens metadata form; result is doc insert + edge with `role='deliverable'`.
- Slide-over editor uses existing document editor, calling `/api/onto/documents/{id}` for content updates and FSM transitions.
- Linked entities view powered by `/documents/{id}/links`.

### 5.4 Promotion Flow

1. User clicks “Promote to Project”.
2. UI invokes endpoint that:
    - Ensures doc FSM transitions to `ready` (or `published`).
    - Updates `task_has_document.props.handed_off=true`.
    - (Optional) Creates/ensures `document_supports_task` edge for follow-on review tasks.
3. Project UI filters documents by existing edges and FSM state, so promoted docs automatically surface without extra fields.

---

## 6. Agent Workflow Alignment

- **Planner**: when generating tasks with deliverables, immediately POST `/tasks/{id}/documents` to seed a scratch doc (role `deliverable`). Edge props store planner rationale.
- **Executor**: fetches `/tasks/{id}/documents`, updates body via PATCH, transitions state, and calls promote endpoint when finished.
- **Tool Definitions**: extend `tool-definitions.ts` with actions `create_task_document`, `update_document`, `promote_document`. These wrap the same endpoints and expect edge rels.
- **Auditing**: rely on `created_by`, `task_has_document.props.originator`, and telemetry events (`document_created_from_task`, etc.).

---

## 7. Implementation Checklist (Reusing Existing Schema)

1. **Backend**
    - [ ] Define new edge rel constants + validation (maybe SQL enum or TypeScript constant).
    - [ ] Build `/tasks/{id}/documents` routes and `TaskDocumentService`.
    - [ ] Hook into FSM service for transitions on promotion.
2. **UI**
    - [ ] Refactor `TaskEditModal` to include Workspace tab + scratch pad UI.
    - [ ] Implement Document list + slide-over editor leveraging existing components.
    - [ ] Add telemetry hooks.
3. **Agent**
    - [ ] Update tool definitions/execution to call the new endpoints.
4. **Docs/QA**
    - [ ] Update README/task docs once feature ships.
    - [ ] Playwright tests covering create/edit/promote using modal.

---

## 8. Telemetry & Observability

| Event                          | Payload                             | Trigger                   |
| ------------------------------ | ----------------------------------- | ------------------------- |
| `task_workspace_opened`        | `{task_id, project_id, source}`     | When workspace tab opens. |
| `document_created_from_task`   | `{task_id, document_id, role}`      | After POST success.       |
| `document_updated`             | `{document_id, state_key, actor}`   | On debounced PATCH.       |
| `document_promoted_to_project` | `{task_id, document_id, new_state}` | On promotion endpoint.    |

Events leverage existing analytics bus; no schema changes required.

---

## 9. Risks & Open Questions

1. **Edge explosion**: ensure indexes on `onto_edges (src_kind, src_id, rel)` exist or add them if missing.
2. **Scratch doc visibility**: confirm ACL so external stakeholders only see documents with appropriate rel/props.
3. **FSM coverage**: verify every document type has a FSM definition supporting the required states; otherwise add defaults.
4. **Agent concurrency**: collisions handled by optimistic UI or simple “last write wins” for now; consider versioning later via `onto_document_versions`.

---

This spec keeps the database untouched while still enabling the desired workspace experience through edge semantics, FSM transitions, and existing document fields.

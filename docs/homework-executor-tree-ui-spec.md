<!-- docs/homework-executor-tree-ui-spec.md -->

# Homework Executor Tree UI Spec

**Date:** 2026-01-26  
**Goal:** Render executor scratchpads directly inside the workspace tree for a unified view, and show plan steps authored by the planner.

---

## Objectives

1. Integrate executor scratchpads into the Workspace Tree UI so users see planner + executor branches together.
2. Display structured plan steps authored by the planner (not inferred) with status, owner, and last-updated iteration.

---

## Data Model Recap

- Executor scratchpads: `onto_documents` with `props.doc_role = 'scratchpad_exec'`, `homework_run_id`, `branch_id`, linked via `onto_edges (document_has_document)` from the main scratchpad.
- Plan steps (new): persisted on run and per-iteration artifacts:
    ```json
    {
      "steps": [
        { "id": "step-uuid", "title": "Find sources", "status": "pending|doing|done|blocked", "owner": "planner|executor", "iteration": 4 }
      ],
      "remaining_work": [...],
      "completion_evidence": [...],
      "next_action_hint": "execute|replan|ask_user|stop"
    }
    ```

---

## UX Changes

### Workspace Tree

- Include executor scratchpads as child nodes under the main scratchpad in the tree component.
- Node label: `<title> (exec)`; show branch_id in muted text.
- Clicking the node opens the document modal (existing behavior) to read full content.

### Plan Panel

- Show planner-authored steps with status pills:
    - pending (gray), doing (blue), blocked (amber), done (green).
- Show owner (planner/executor) and last iteration touched.
- Show remaining_work and completion_evidence below steps.
- Source of truth: plan JSON returned with run.metrics.plan (latest) and each iteration.artifacts.plan (for history).

---

## Backend Requirements

1. Planner must produce `plan.steps` explicitly:
    - Adjust planner prompt to request steps array with status & owner.
    - Persist `plan.steps` in iteration artifacts and mirror to run.metrics.plan.
2. Executor scratchpads already linked; ensure any newly created doc by executors is linked to their scratchpad (parent) and that edge exists.
3. API `GET /api/homework/runs/:id?include_workspace=true` should already return all docs/edges; tree rendering will consume those.

---

## Frontend Tasks

1. Update `WorkspaceTreeNode` to display doc_role hints (workspace, scratchpad_root, scratchpad_exec, plan).
2. In the run page tree build, include all documents/edges (already loaded) so executor scratchpads appear automatically; adjust label rendering for exec nodes.
3. Plan panel: render `plan.steps` with status chips and owner/iteration metadata.

---

## Prompts (Planner)

Add to planner system prompt:

- “Return plan.steps as an array of {id, title, status, owner}. Update statuses each iteration; set owner=executor when delegating. Do not recreate identical steps; update instead.”

Add to planner user prompt:

- Include last plan.steps (from run.metrics.plan.steps or last iteration plan) so the model edits existing steps.

---

## Acceptance Criteria

- Executor scratchpads visible as nodes in the tree and openable via the existing document modal.
- Plan panel shows planner-authored steps with status and owner; changes reflect the latest iteration.
- Steps persist across iterations (via run.metrics.plan).

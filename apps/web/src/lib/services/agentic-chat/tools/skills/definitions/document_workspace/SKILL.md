---
name: Document Workspace
description: Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - onto.document.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md
---

# Document Workspace

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure, so Procedure + Contract carry the weight. It is a standalone root (no
  sibling dependencies), so there is no Routing block. The two domain facts sit in Provenance (the loader reads
  Provenance as `notes` for this non-preserve_markdown skill).
-->

## Identity

Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.
This is a **procedure** skill at **task** altitude: an ordered runbook for placing, reorganizing, linking, and
writing project documents safely.

## Activation

- Create or place a project document in the doc tree
- Reorganize project documents
- Link unlinked docs back into the tree
- Decide whether a document belongs in the project tree or a task workspace
- Reason about document hierarchy safely

## Procedure

1. Decide whether the request is about a project document or a task document.
2. For project documents, remember the hierarchy lives in doc_structure, not in document-to-document edges.
3. For project document creation, include at least project_id and title. Include description whenever available; some direct tool surfaces require it.
4. **Placement can happen at create time.** When creating a project document that should be nested, pass `parent_id` and optional `position` on `create_onto_document` / `onto.document.create`. Use `move_document_in_tree` / `onto.document.tree.move` for existing documents, unlinked documents, or later reorganization. Only claim "nested under X" or "placed in" after the create response returns without a tree placement error or a move call succeeds.
5. For task workspace documents, use onto.task.docs.\* instead of the project doc tree.
6. For reorganization or linking unlinked docs, call onto.document.tree.get once, analyze the result, then issue targeted onto.document.tree.move calls.
7. When moving a document, pass exact document_id and new_position; use new_parent_id only when nesting under a parent.
8. **Append and merge writes require non-empty `content`.** For `onto.document.update` calls with `update_strategy: "append"` or `update_strategy: "merge_llm"`, always include the actual text to persist. `merge_instructions` alone is not enough — merge/append behavior requires content to merge. The executor will reject no-content append/merge calls.
9. Only create semantic edges to documents from other entities when that relationship is useful; do not use edges to represent folder structure.

## Contract

After a document write, report:

- What changed: document title, type, and the content action (created, replaced, appended, or merged).
- Placement: the parent it is nested under in the doc tree, or that it is currently unlinked — stated only after the create/move response confirmed it.
- For reorganization: which documents moved and where, derived from a single tree read.

Stop conditions before replying: hierarchy changes went through doc_structure / tree-move, not document-to-document edges or graph reorganize; append/merge writes included non-empty `content`; you have not claimed a document is "nested under X" or "placed in" until the create returned without a tree placement error or the move call returned success.

## Policy

- Do not use onto.project.graph.reorganize for document hierarchy.
- Do not treat document-to-document edges as the source of truth for hierarchy.
- delete_onto_document in agentic chat currently exposes only document_id; do not invent archive-mode args until the tool contract changes.
- Do not call `update_onto_document` with `update_strategy: "append"` or `"merge_llm"` and no `content`. `merge_instructions` alone does not produce new text; the executor rejects the call.

## Related Tools

- `onto.document.create`
- `onto.document.update`
- `onto.document.delete`
- `onto.document.tree.get`
- `onto.document.tree.move`
- `onto.document.path.get`
- `onto.task.docs.list`
- `onto.task.docs.create_or_attach`
- `onto.edge.link`

## Examples

### Create and place a research document

- Call `create_onto_document({ project_id, title, description, type_key, content, parent_id, position })` when the intended parent is already known.
- If the document already exists or needs to be rehomed after creation, use `move_document_in_tree({ document_id, new_parent_id, new_position })`.
- Only report the document as nested or placed after the create response succeeds without a tree placement error or the move call returns successfully.

### Organize unlinked project documents

- Call `get_document_tree({ ... })` once with `include_documents=true`.
- Identify unlinked or misplaced documents from that result.
- Issue targeted `move_document_in_tree({ ... })` calls without repeating `get_document_tree` unless a move fails.

### Attach documentation to a specific task

- Decide whether the document should live in the task workspace rather than the project doc tree.
- If the exact args are unclear, call `tool_schema({ op: "onto.task.docs.create_or_attach" })`.
- Then use the direct tool named by the schema instead of project doc tree ops.

## Provenance

- Project docs and task docs are different storage/workflow surfaces. (internal-default)
- The doc tree is structural; semantic edges to documents are optional and should reflect real relationships. (internal-default)

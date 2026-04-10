---
name: Document Workspace
description: Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.
legacy_paths:
    - onto.document.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md
---

# Document Workspace

Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules.

## When to Use

- Create or place a project document in the doc tree
- Reorganize project documents
- Link unlinked docs back into the tree
- Decide whether a document belongs in the project tree or a task workspace
- Reason about document hierarchy safely

## Workflow

1. Decide whether the request is about a project document or a task document.
2. For project documents, remember the hierarchy lives in doc_structure, not in document-to-document edges.
3. For project document creation, onto.document.create must include at least project_id, title, and description.
4. For task workspace documents, use onto.task.docs.\* instead of the project doc tree.
5. For reorganization or linking unlinked docs, call onto.document.tree.get once, analyze the result, then issue targeted onto.document.tree.move calls.
6. When moving a document, pass exact document_id and new_position; use new_parent_id only when nesting under a parent.
7. Only create semantic edges to documents from other entities when that relationship is useful; do not use edges to represent folder structure.

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

## Guardrails

- Do not use onto.project.graph.reorganize for document hierarchy.
- Do not treat document-to-document edges as the source of truth for hierarchy.
- delete_onto_document in agentic chat currently exposes only document_id; do not invent archive-mode args until the tool contract changes.

## Examples

### Organize unlinked project documents

- Call `buildos_call({ op: "onto.document.tree.get", args: { ... } })` once with `include_documents=true`.
- Identify unlinked or misplaced documents from that result.
- Issue targeted `buildos_call({ op: "onto.document.tree.move", args: { ... } })` calls without repeating tree.get unless a move fails.

### Attach documentation to a specific task

- Decide whether the document should live in the task workspace rather than the project doc tree.
- If the exact args are unclear, call `tool_schema({ op: "onto.task.docs.create_or_attach" })`.
- Then use `buildos_call({ op: "onto.task.docs.create_or_attach", args: { ... } })` instead of project doc tree ops.

## Notes

- Project docs and task docs are different storage/workflow surfaces.
- The doc tree is structural; semantic edges to documents are optional and should reflect real relationships.

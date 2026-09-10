---
name: Document Workspace
catalog_line: 'Project document hierarchy: doc tree operations, unlinked docs, task docs, document CRUD rules.'
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
  sibling dependencies), so there is no Routing block. The two domain facts sit in Provenance.

  The acting worker renders Activation, the Procedure steps, Policy, Contract, and one Example under a one-line
  heading, with no follow-up skill calls. Every tool named in those blocks must be mounted on the project worker
  surface (search_project, list_onto_documents, get_document_tree, get_document_outline, read_document_section,
  create_onto_document, update_onto_document, move_document_in_tree, link_onto_entities). Related Tools stays in
  dotted op ids: it is the external gateway contract and the source of materialized_tools. Examples open with the
  update-by-exact-id case (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71).
-->

## Identity

Project document hierarchy playbook: create, update, place, and reorganize project documents safely with the document tools on the current surface. This is a **procedure** skill at **task** altitude.

## Activation

- Create or place a project document in the doc tree
- Update an existing document's content or title
- Reorganize project documents or link unlinked docs back into the tree
- Reason about document hierarchy safely

## Procedure

1. For an update, reuse the exact document_id from the focused context, the user's message, or a read this turn; otherwise find it with search_project, list_onto_documents, or get_document_tree before writing. If several documents fit, ask one clarification instead of guessing.
2. update_onto_document takes update_strategy "replace" (the default) or "append"; append needs non-empty content, and a title-only or description-only update needs no content at all. To change the body while keeping existing text, read it first with get_document_outline and read_document_section and write the composed value, or append.
3. For a create, call create_onto_document with project_id, title, and description; pass content when the user gave it, and parent_id (plus optional position) only when a read already returned that parent.
4. The hierarchy lives in the document tree, not in entity edges. Use move_document_in_tree to place, nest, or rehome an existing document: prefer new_parent_title for grouping, and pass new_parent_id only for a parent UUID a read returned.
5. For reorganization or unlinked docs, call get_document_tree once with include_documents true, plan every move from that result, then issue the moves; read the tree again only if a move fails.
6. Claim "nested under X" or "placed in" only after the create returned without a tree placement error or the move returned success.
7. Use link_onto_entities only for a real relationship between a document and another entity, never to represent folder structure.

## Contract

After a document write, report:

- What changed: document title, type, and the content action (created, replaced, or appended).
- Placement: the parent it is nested under, or that it is unlinked — stated only after the create or move response confirmed it.
- For reorganization: which documents moved and where, derived from the single tree read.

## Policy

- Do not use entity edges or a graph reorganization to model document hierarchy; the tree is the source of truth.
- Do not call update_onto_document with update_strategy "append" and no content; the executor rejects it.
- Do not invent a parent UUID; use new_parent_title, or a UUID a read returned.
- Task workspace documents are a separate surface that is not reachable here; say so instead of filing a task document in the project tree.

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

### Update an existing document by its exact id

- The focused context, the prior turn, or the user gave the exact document_id: reuse it directly.
- Otherwise resolve it first with search_project or list_onto_documents; if several documents fit, ask one clarification instead of guessing.
- To add to the end: `update_onto_document({ document_id: "<exact id>", update_strategy: "append", content: "<the new text>" })`
- To rewrite a section: read it with get_document_outline and read_document_section, then `update_onto_document({ document_id: "<exact id>", content: "<the full composed document>" })`

### Create and place a document

- Call `create_onto_document({ project_id, title, description, content })`; add parent_id and position only when a read already returned the parent.
- To nest it afterwards, or to rehome an existing document, call `move_document_in_tree({ project_id, document_id, new_parent_title: "Research" })`.
- Report the document as nested or placed only after the create returned without a tree placement error or the move returned success.

### Organize unlinked project documents

- Call `get_document_tree({ project_id, include_documents: true })` once.
- Identify unlinked or misplaced documents from that result and decide every move before writing.
- Issue one `move_document_in_tree({ project_id, document_id, new_parent_title })` per document, reusing the exact same new_parent_title for every document in a category; read the tree again only if a move fails.

## Provenance

- Project docs and task docs are different storage/workflow surfaces. (internal-default)
- The doc tree is structural; semantic edges to documents are optional and should reflect real relationships. (internal-default)

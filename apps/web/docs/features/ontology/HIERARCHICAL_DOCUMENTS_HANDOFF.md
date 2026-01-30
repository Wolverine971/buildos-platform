<!-- apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENTS_HANDOFF.md -->

# Hierarchical Documents - Agent Handoff

**Date:** 2026-01-29
**Status:** Phase 1 Complete, Phase 2 Ready to Start
**Previous Agent:** Claude Opus 4.5

---

## Summary

We're implementing a hierarchical document tree system for projects. Documents are organized in a wiki-like tree structure stored as JSONB on `onto_projects.doc_structure`. This replaces the previous edge-based document containment.

**The goal:** Transform flat document lists into an organized, navigable knowledge base that grows organically as projects develop.

---

## What Was Completed (Phase 1)

### Database Migrations Created

All in `/supabase/migrations/`:

| File                                       | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `20260129000001_add_doc_structure.sql`     | Adds `doc_structure` JSONB column to `onto_projects`          |
| `20260129000002_add_document_children.sql` | Adds `children` JSONB column to `onto_documents`              |
| `20260129000003_add_structure_history.sql` | Creates `onto_project_structure_history` table for undo/audit |
| `20260129000004_remove_document_edges.sql` | Cleans up document-to-document edges                          |

**Note:** These migrations have NOT been applied yet. They need to be run against the database.

### Type Definitions Updated

**`/apps/web/src/lib/types/onto-api.ts`:**

- Added: `DocTreeNode`, `DocStructure`, `EnrichedDocTreeNode`, `DocumentChildren`, `DocStructureHistoryEntry`, `GetDocTreeResponse`, `MoveDocumentRequest`
- Updated: `OntoProject` (added `doc_structure`), `OntoDocument` (added `children`)

**`/apps/web/src/lib/types/onto.ts`:**

- Added Zod schemas: `DocTreeNodeSchema`, `DocStructureSchema`, `DocumentChildrenSchema`
- Updated: `ProjectSchema`, `DocumentSchema`

### Core Service Created

**`/apps/web/src/lib/services/ontology/doc-structure.service.ts`** (~500 lines)

Key exports:

```typescript
// Tree traversal
collectDocIds(nodes): Set<string>
findNodeById(nodes, id): { node, parent, index } | null
getNodePath(nodes, id): string[]
wouldCreateCycle(nodes, nodeId, newParentId): boolean

// Tree mutation
removeNodeFromTree(nodes, id): DocTreeNode[]
insertNodeIntoTree(nodes, newNode, parentId, position): DocTreeNode[]
reorderNodes(nodes): DocTreeNode[]
pruneDeletedNodes(nodes, activeDocIds): DocTreeNode[]

// Enrichment
enrichTreeNodes(nodes, documents, depth, parentPath): EnrichedDocTreeNode[]

// Main operations
getDocTree(supabase, projectId): Promise<GetDocTreeResponse>
updateDocStructure(supabase, projectId, structure, changeType, actorId?): Promise<DocStructure>
addDocumentToTree(supabase, projectId, docId, options, actorId?): Promise<DocStructure>
removeDocumentFromTree(supabase, projectId, docId, options?, actorId?): Promise<DocStructure>
moveDocument(supabase, projectId, docId, options, actorId?): Promise<DocStructure>
recomputeDocStructure(supabase, projectId, actorId?): Promise<DocStructure>
getStructureHistory(supabase, projectId, limit?): Promise<DocStructureHistoryEntry[]>
restoreStructureVersion(supabase, projectId, historyId, actorId?): Promise<DocStructure>
```

### Containment Organizer Updated

**`/apps/web/src/lib/services/ontology/containment-organizer.ts`:**

- Removed `document` from `ALLOWED_PARENTS` (now empty array `[]`)
- Removed `has_part` handling for documents in `resolveContainmentRel()`
- Documents no longer use edges for hierarchy

---

## What's Next (Phase 2: API Endpoints)

### New Endpoints to Create

1. **`GET /api/onto/projects/[id]/doc-tree/+server.ts`**
    - Call `getDocTree()` from service
    - Return `{ structure, documents, unlinked }`

2. **`PATCH /api/onto/projects/[id]/doc-tree/+server.ts`**
    - Accept `{ structure: DocStructure }`
    - Call `updateDocStructure()` from service
    - Handle version conflicts (optimistic locking)

3. **`POST /api/onto/projects/[id]/doc-tree/move/+server.ts`**
    - Accept `{ document_id, new_parent_id, new_position }`
    - Call `moveDocument()` from service

### Existing Endpoints to Update

4. **`POST /api/onto/documents/create/+server.ts`** (or wherever doc creation happens)
    - Add optional `parent_id` and `position` params
    - After creating document, call `addDocumentToTree()`

5. **`DELETE /api/onto/documents/[id]/+server.ts`**
    - After soft-delete, call `removeDocumentFromTree()`

6. **`GET /api/onto/projects/[id]/+server.ts`** and **`/full/+server.ts`**
    - Include `doc_structure` in response

---

## Key Architecture Decisions

1. **Documents use `project_id` FK only** - No more edges for document containment
2. **`doc_structure` is the master tree** - Stored on `onto_projects`
3. **`children` column on documents** - Each doc knows its immediate children (for efficient queries)
4. **Optimistic locking** - Version number increments on each update
5. **History table** - Every structure change is logged for undo/redo
6. **Orphaned docs** - Documents in DB but not in tree show in "unlinked" section
7. **Folders are just docs with children** - No separate folder type
    - `DocTreeNode.type` is optional; UI computes folder/doc from children
8. **Deletion modes** - `cascade` removes subtree; `promote` lifts children to parent

---

## Data Structures

### DocStructure (stored on onto_projects)

```json
{
	"version": 1,
	"root": [
		{ "id": "uuid", "order": 0 },
		{
			"id": "uuid",
			"order": 1,
			"children": [{ "id": "uuid", "order": 0 }]
		}
	]
}
```

### DocumentChildren (stored on onto_documents)

```json
{
	"children": [
		{ "id": "uuid", "order": 0 },
		{ "id": "uuid", "order": 1 }
	]
}
```

---

## Important Files to Reference

| File                                                                                  | Purpose                   |
| ------------------------------------------------------------------------------------- | ------------------------- |
| `/apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENT_TREE_SPEC.md`                 | Full specification        |
| `/apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md`           | All decisions made        |
| `/apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md` | Progress tracking         |
| `/apps/web/docs/features/ontology/DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md`              | How docs vs entities work |
| `/apps/web/src/lib/services/ontology/doc-structure.service.ts`                        | Core service (use this!)  |
| `/apps/web/src/lib/types/onto-api.ts`                                                 | TypeScript interfaces     |
| `/apps/web/src/lib/types/onto.ts`                                                     | Zod schemas               |

---

## Gotchas & Notes

1. **Migrations not applied** - Run them before testing
2. **Type check passes** - Ran `pnpm run check`, exit code 0 (pre-existing errors unrelated)
3. **Cycle detection** - `wouldCreateCycle()` prevents moving folder into its own descendant
4. **Invalid parent fallback** - bad parent IDs auto-fallback to root
5. **Sync children columns** - `updateDocStructure()` automatically syncs `onto_documents.children`
6. **History cleanup** - There's a `cleanup_structure_history()` function but no cron job yet

---

## Testing the Service

Once migrations are applied, you can test the service:

```typescript
import {
	getDocTree,
	addDocumentToTree,
	moveDocument
} from '$lib/services/ontology/doc-structure.service';

// Get current tree
const { structure, documents, unlinked } = await getDocTree(supabase, projectId);

// Add a doc to root
await addDocumentToTree(supabase, projectId, docId, { parentId: null, position: 0 });

// Move a doc under a parent
await moveDocument(supabase, projectId, docId, { newParentId: parentDocId, newPosition: 0 });
```

---

## After Phase 2

**Phase 3:** UI Components (DocTreeView.svelte, DocTreeNode.svelte, etc.)
**Phase 4:** Agentic chat tool integration
**Phase 5:** Drag-and-drop
**Phase 6:** Mobile optimization

See the implementation checklist for full details.

---

## Questions?

All decisions are documented in `HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md`. Key ones:

- Mobile UX: Phone book / document index style
- Wiki links: `[title](document:uuid)` format
- Deletion: Prompt user for "delete all" vs "keep children"
- Real-time: Polling with notification popup (not full real-time)

<!-- apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md -->

# Hierarchical Documents - Implementation Checklist

**Status:** Phase 5 Core Complete (Drag-and-Drop)
**Date:** 2026-01-30
**Last Updated:** 2026-01-30

> **Latest:** Phase 5.1 (Drag-and-Drop Core) completed. Created `useDragDrop.svelte.ts` state module with hover-to-convert behavior, `DocTreeDragLayer.svelte` for ghost elements, and integrated into `DocTreeNode.svelte` and `DocTreeView.svelte`. Remaining: keyboard shortcuts, mobile polish, animations.

This document tracks all code changes needed to implement the hierarchical document tree system.

---

## Overview

Based on codebase research and decisions made, we need to update:

- 1 consolidated database migration
- 3 type definition files
- 8+ API endpoints
- 8+ UI components
- 5+ services
- 5+ agentic chat tool definitions/executors

---

## Phase 1: Database & Types

### 1.1 Database Migrations (Consolidated)

- [x] **Create and apply consolidated migration**

    ```
    File: /supabase/migrations/20260130000000_hierarchical_documents_full.sql
    ```

    - Adds `onto_projects.doc_structure`
    - Adds `onto_documents.children`
    - Creates `onto_project_structure_history` + RLS + cleanup function
    - Converts document `has_part` edges into `doc_structure` + `children`
    - Deletes document-to-document `has_part` edges after conversion
    - ✅ Applied to DB

    - Legacy individual migrations superseded by the consolidated file

- [x] **Archive superseded migrations**
    - Move `20260129000001`–`20260129000004` out of the active migrations folder (or mark as applied) to avoid double-run errors
    - ✅ Archived in `supabase/migrations/applied_backup/20260129_hierarchical_documents`

### 1.2 Type Definitions

- [x] **Update `/apps/web/src/lib/types/onto-api.ts`**
    - Add `DocTreeNode` interface
    - Add `DocStructure` interface
    - Add `EnrichedDocTreeNode` interface (for UI)
    - Add `DocumentChildren`, `DocStructureHistoryEntry`, `GetDocTreeResponse`, `MoveDocumentRequest`
    - Update `OntoProject` to include `doc_structure?: DocStructure`
    - Update `OntoDocument` to include `children?: DocumentChildren`

- [x] **Update `/apps/web/src/lib/types/onto.ts`**
    - Add Zod schemas for `DocTreeNode`, `DocStructure`, and `DocumentChildren`
    - Update `ProjectSchema` to include `doc_structure`
    - Update `DocumentSchema` to include `children`
    - `DocTreeNode.type` is optional (computed from children at render time)

- [x] **Update `/packages/shared-types/src/database.types.ts`**
    - Manually add `doc_structure`, `children`, and `onto_project_structure_history`
    - Keep in sync with consolidated migration

- [x] **Update `/packages/shared-types/src/database.schema.ts`**
    - Add `doc_structure`, `children`, and `onto_project_structure_history`

---

## Phase 2: Services

### 2.1 New Service: Document Structure

- [x] **Create `/apps/web/src/lib/services/ontology/doc-structure.service.ts`**
      Core functions implemented:
    - `getDocTree()` - Get tree with documents and unlinked docs
    - `updateDocStructure()` - Update with optimistic locking and history
    - `recomputeDocStructure()` - Rebuild from scratch, prune deleted
    - `addDocumentToTree()` - Add doc at position
    - `removeDocumentFromTree()` - Remove doc from tree
    - `moveDocument()` - Move with cycle detection
    - `getStructureHistory()` - Get history for undo
    - `restoreStructureVersion()` - Restore from history
    - Tree traversal utilities (collectDocIds, findNodeById, getNodePath, etc.)
    - `enrichTreeNodes()` - Join with document metadata for UI
    - Supports delete modes: `cascade` (default) and `promote`
    - Invalid parent IDs auto-fallback to root

### 2.2 Update Containment Organizer

- [x] **Update `/apps/web/src/lib/services/ontology/containment-organizer.ts`**
    - Removed `'document'` from `ALLOWED_PARENTS` (now empty array)
    - Removed `has_part` handling for documents in `resolveContainmentRel()`
    - Added comments pointing to spec document

### 2.3 Update Versioning Service

- [x] **Update `/apps/web/src/lib/services/ontology/versioning.service.ts`**
    - No changes needed - document versioning is independent of hierarchy

---

## Phase 3: API Endpoints

### 3.1 New Endpoints

- [x] **Create `GET /api/onto/projects/[id]/doc-tree/+server.ts`**
    - Fetch `doc_structure` from project
    - Join with `onto_documents` to get full metadata
    - Return `{ structure, documents, unlinked }` for UI

- [x] **Create `PATCH /api/onto/projects/[id]/doc-tree/+server.ts`**
    - Update `doc_structure` on project
    - Enforce version check (optimistic locking)
    - Validate structure integrity (IDs exist, no cycles)

- [x] **Create `POST /api/onto/projects/[id]/doc-tree/move/+server.ts`**
    - Move document to new parent/position
    - Update `doc_structure` accordingly
    - Invalid parent IDs auto-fallback to root

### 3.2 Update Existing Endpoints

- [x] **Update `POST /api/onto/documents/create/+server.ts`**
    - Add optional `parent_id` and `position` params
    - After creating document, call `addDocumentToTree()`
    - Return updated structure in response
    - Invalid `parent_id` auto-fallback to root

- [x] **Update `DELETE /api/onto/documents/[id]/+server.ts`**
    - After soft-deleting, call `removeDocumentFromTree()`
    - Handle children via `mode`: `cascade` (default) or `promote` (move to parent)

- [x] **Update `GET /api/onto/projects/[id]/full/+server.ts`**
    - Include `doc_structure` in response (extra query if RPC doesn’t include it)

- [x] **Update `GET /api/onto/projects/[id]/+server.ts`**
    - Already includes `doc_structure` via `select('*')`

### 3.3 RPC Functions

- [ ] **Update `get_project_full` RPC** (optional)
    - Not required if API queries `doc_structure` separately

- [ ] **Update `get_project_skeleton` RPC**
    - No changes needed - skeleton doesn't include documents

---

## Phase 4: UI Components

### 4.1 New Components

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeView.svelte`**
    - Main tree container component
    - Fetches tree data on mount
    - Manages expanded/collapsed state (default: first 3 levels)
    - Persists expansion to localStorage
    - Handles drag-drop (Phase 5) - deferred
    - Includes polling for real-time updates (30s interval)

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte`**
    - Recursive node component
    - Shows expand/collapse chevron for folders
    - Shows file/folder icon based on children
    - Click to open document
    - Right-click context menu

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeMobile.svelte`**
    - Document index / phone book style display
    - Flat list with indentation (h1/h2/h3 style)
    - Breadcrumb navigation at top
    - Tap folder to drill down
    - Default: first 3 levels visible

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte`**
    - Shows orphaned documents not in tree structure
    - Displays below main tree
    - Drag to tree to re-link - deferred to Phase 5
    - Helps users find orphaned content

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte`**
    - Actions: Open, New Child, Move to..., Delete
    - Positioned at right-click location

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocMoveModal.svelte`**
    - Tree picker for selecting new parent
    - Confirm button
    - Shows current location

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocDeleteConfirmModal.svelte`**
    - For folder deletion confirmation
    - Options: "Delete all contents" vs "Keep contents (move up)"
    - Clear warning about what will happen

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeUpdateNotification.svelte`**
    - "Document tree has been updated" notification
    - [Refresh] and [Dismiss] buttons
    - Shown when polling detects version mismatch

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeSkeleton.svelte`**
    - Loading skeleton for tree view

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/index.ts`**
    - Barrel export for all doc-tree components

### 4.2 Update Existing Components

- [ ] **Update `/apps/web/src/lib/components/ontology/DocumentModal.svelte`**
    - Add `parentDocumentId` prop for create mode
    - Show breadcrumb path when editing nested doc
    - Add "Move to..." action in actions menu
    - Add "Create Child" action

- [x] **Update `/apps/web/src/routes/projects/[id]/+page.svelte`**
    - Replaced flat document list with `DocTreeView`
    - Added `parentDocumentId` state for create modal
    - Added tree refresh handler
    - Added DocMoveModal and DocDeleteConfirmModal integration

---

## Phase 5: Drag-and-Drop (Enhancement)

### 5.1 Core Implementation (Complete)

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/useDragDrop.svelte.ts`**
    - State management with `$state<DragState>()`
    - Mouse/touch event handlers
    - Drop zone detection (before/after/inside)
    - Cycle detection validation
    - Hover-to-convert timer (400ms) for plain documents
    - Touch support with long-press (500ms) initiation

- [x] **Create `/apps/web/src/lib/components/ontology/doc-tree/DocTreeDragLayer.svelte`**
    - Ghost element following cursor during drag
    - Drop feedback hints for valid/invalid drops
    - CSS for ghost styling with rotation effect
    - Global `doc-tree-dragging` body class

- [x] **Update `DocTreeNode.svelte` with drag support**
    - Added drag-related props: `dragState`, `onDragStart`, `onDragOver`, `onTouchStart`, `canDrag`
    - Derived states for visual feedback: `isDragging`, `isDropTarget`, `isDropBefore`, `isDropAfter`, `isConverting`, `isInvalidTarget`
    - Insertion line indicators between nodes
    - Cursor changes during drag operations

- [x] **Update `DocTreeView.svelte` with drag integration**
    - Added `enableDragDrop` prop (default true)
    - Node lookup maps for validation (`nodeMap`, `parentMap`, `indexMap`)
    - Integrated `createDragDropState()` with API callbacks
    - `handleDragMove()` calls API and updates local state
    - Global event listeners for mouse/touch tracking
    - Cleanup on component destroy

- [x] **Update `index.ts` with new exports**
    - Export `DocTreeDragLayer` component
    - Export `createDragDropState`, `DragState`, `DropZone`, `DropZoneType`, `DragDropOptions`, `DragDropState`

- [x] **API integration**
    - Uses existing `POST /api/onto/projects/[id]/doc-tree/move` endpoint
    - Optimistic UI updates with version tracking
    - Conflict detection (409 response triggers update notification)

### 5.2 Keyboard Alternative (Deferred)

- [ ] **Add keyboard shortcuts for move operations**
    - Ctrl+X/V (Cmd on Mac) for cut/paste
    - Alternative to drag-drop for accessibility

### 5.3 Mobile Polish (Deferred)

- [ ] **Enhance mobile touch experience**
    - Auto-scroll when dragging near edges
    - Haptic feedback on drag start (if available)
    - Testing on various mobile devices

### 5.4 Additional Enhancements (Deferred)

- [ ] **Animations and polish**
    - Smooth animations for tree reordering
    - Undo support (Cmd+Z after move)
    - Performance optimization for large trees
    - Drag from unlinked documents section

### Specification Document

- [x] **Created `/apps/web/docs/features/ontology/DRAG_DROP_SPEC.md`**
    - Comprehensive specification covering interactions, visual feedback, drop zones
    - Decided behavior: Hybrid hover-to-convert approach
    - Documents edge cases, error handling, accessibility

---

## Phase 6: Agentic Chat Integration

### 6.1 Update Tool Definitions

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`**
    - Added `get_document_tree` tool
    - Added `get_document_path` tool (returns breadcrumb path for a doc)
    - Note: `list_onto_documents` unchanged (hierarchy not needed in list view)

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`**
    - Updated `create_onto_document` to accept `parent_id` and `position`
    - Added `move_document` tool
    - Note: `create_document_folder` not added - any doc with children is a folder

### 6.2 Update Tool Executors

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`**
    - Implemented `getDocumentTree()` handler
    - Implemented `getDocumentPath()` handler

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`**
    - Implemented `moveDocument()` handler
    - Note: `createOntoDocument` unchanged (parent/position handled by API)

### 6.3 Update Tool Types

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts`**
    - Added `GetDocumentTreeArgs`
    - Added `GetDocumentPathArgs`
    - Added `MoveDocumentArgs`
    - Updated `CreateOntoDocumentArgs` with `parent_id`, `position`

### 6.4 Tool Configuration

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`**
    - Added dispatch cases for `get_document_tree`, `get_document_path`, `move_document`

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`**
    - Added new tools to TOOL_CATEGORIES (ontology, ontology_action)
    - Added new tools to TOOL_GROUPS (project context)
    - Added new tools to ONTOLOGY_TOOLS export

- [x] **Update `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`**
    - Added metadata for `get_document_tree`, `get_document_path`, `move_document`

### 6.5 Context Building (Deferred)

- [x] **Update context utilities**
    - When building project context, include document tree structure
    - Agent can navigate tree to find relevant docs
    - Include tree in abbreviated entity list
    - Note: Implemented in 2026-01-30 update

---

## Phase 7: Migration & Cleanup

### 7.1 Data Migration

- [x] **Create migration script for existing documents**
    - For each project with documents:
        - Build initial `doc_structure` from existing docs
        - All existing docs go to root level
        - Set `display_order` based on `created_at`
    - ✅ Covered in consolidated migration (`20260130000000_hierarchical_documents_full.sql`)

### 7.2 Edge Cleanup

- [x] **Remove document containment edges**
    - Delete `has_part` edges between documents
    - Keep `task_has_document` edges (different system)
    - Keep semantic edges if any (`references`, etc.)
    - ✅ Covered in consolidated migration (`20260130000000_hierarchical_documents_full.sql`)

### 7.3 Update Tests

- [x] **Add tests for doc-structure.service.ts**
- [x] **Update document API tests**
- [x] **Add tree endpoint tests**
- [x] **Update agentic chat tool tests**

---

## File Change Summary

### New Files (18)

| File                                                                              | Purpose                        |
| --------------------------------------------------------------------------------- | ------------------------------ |
| `/supabase/migrations/YYYYMMDD_add_doc_structure.sql`                             | DB migration - doc_structure   |
| `/supabase/migrations/YYYYMMDD_add_document_children.sql`                         | DB migration - children column |
| `/supabase/migrations/YYYYMMDD_add_structure_history.sql`                         | DB migration - history table   |
| `/supabase/migrations/YYYYMMDD_remove_document_edges.sql`                         | DB migration - cleanup edges   |
| `/apps/web/src/lib/services/ontology/doc-structure.service.ts`                    | Tree management                |
| `/apps/web/src/lib/services/ontology/doc-structure-history.service.ts`            | History/undo management        |
| `/apps/web/src/routes/api/onto/projects/[id]/doc-tree/+server.ts`                 | GET/PATCH tree                 |
| `/apps/web/src/routes/api/onto/projects/[id]/doc-tree/move/+server.ts`            | Move document                  |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeView.svelte`               | Tree container (desktop)       |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeMobile.svelte`             | Phone book style (mobile)      |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte`               | Tree node                      |
| `/apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte`         | Orphaned docs section          |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeContextMenu.svelte`        | Context menu                   |
| `/apps/web/src/lib/components/ontology/doc-tree/DocMoveModal.svelte`              | Move picker                    |
| `/apps/web/src/lib/components/ontology/doc-tree/DocDeleteConfirmModal.svelte`     | Folder delete confirmation     |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeUpdateNotification.svelte` | Real-time update toast         |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeSkeleton.svelte`           | Loading state                  |
| `/apps/web/src/lib/components/ontology/doc-tree/useDragDrop.svelte.ts`            | Drag-drop state management     |
| `/apps/web/src/lib/components/ontology/doc-tree/DocTreeDragLayer.svelte`          | Drag ghost and drop feedback   |
| `/apps/web/src/lib/services/ontology/doc-structure.service.test.ts`               | Tests                          |
| `/apps/web/docs/features/ontology/DRAG_DROP_SPEC.md`                              | Drag-drop specification        |

### Modified Files (15+)

| File                                                                                      | Changes                |
| ----------------------------------------------------------------------------------------- | ---------------------- |
| `/apps/web/src/lib/types/onto-api.ts`                                                     | Add tree types         |
| `/apps/web/src/lib/types/onto.ts`                                                         | Add Zod schemas        |
| `/packages/shared-types/src/database.types.ts`                                            | Regenerate             |
| `/apps/web/src/lib/services/ontology/containment-organizer.ts`                            | Remove doc containment |
| `/apps/web/src/routes/api/onto/documents/create/+server.ts`                               | Add parent/position    |
| `/apps/web/src/routes/api/onto/documents/[id]/+server.ts`                                 | Update tree on delete  |
| `/apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`                             | Include structure      |
| `/apps/web/src/routes/api/onto/projects/[id]/+server.ts`                                  | Include structure      |
| `/apps/web/src/routes/(app)/projects/[id]/+page.svelte`                                   | Replace doc list       |
| `/apps/web/src/lib/components/ontology/DocumentModal.svelte`                              | Add parent context     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`         | Add tree tools         |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`        | Add move tool          |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`  | Implement              |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts` | Implement              |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts`                   | Add arg types          |

---

## Implementation Order (Recommended)

**Week 1: Foundation**

1. Database migration
2. Type definitions
3. doc-structure.service.ts
4. Basic API endpoints (GET/PATCH tree)

**Week 2: UI** 5. DocTreeView + DocTreeNode components 6. Integrate into project page 7. Update DocumentModal with parent context

**Week 3: Full Integration** 8. Update document create/delete to maintain tree 9. Move document functionality 10. Context menu and move modal

**Week 4: Agent Integration** 11. Update tool definitions 12. Update executors 13. Test with agents

**Week 5: Polish** 14. Drag-and-drop 15. Mobile optimization 16. Tests and documentation

---

## Dependencies

```
Phase 1 (DB/Types)
    ↓
Phase 2 (Services) ←── depends on types
    ↓
Phase 3 (API) ←── depends on services
    ↓
Phase 4 (UI) ←── depends on API
    ↓
Phase 5 (DnD) ←── depends on UI
    ↓
Phase 6 (Agent) ←── depends on API (can parallel with UI)
```

---

## Deferred / Research Tasks

These are noted for future implementation:

1. **Unified Markdown Linking System**
    - Unify `[title](document:id)` with history page and next steps linking
    - Create consistent URL param pattern: `/projects/[id]?doc=doc_id`

2. **Search Integration**
    - Show breadcrumb path in search results
    - Eventually: subtree filtering, relevance boosting by tree position

3. **Import/Export**
    - Export tree as folder of markdown files
    - Import folder structure to create documents

4. **Undo/Redo UI**
    - Cmd+Z for session undo (enabled by history table)
    - History panel with "Restore this version" button

---

## Related Documents

- [HIERARCHICAL_DOCUMENTS_HANDOFF.md](./HIERARCHICAL_DOCUMENTS_HANDOFF.md) - **Agent handoff doc (start here if picking up work)**
- [HIERARCHICAL_DOCUMENT_TREE_SPEC.md](./HIERARCHICAL_DOCUMENT_TREE_SPEC.md) - Full specification
- [DRAG_DROP_SPEC.md](./DRAG_DROP_SPEC.md) - **Drag-and-drop specification (Phase 5)**
- [HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md](./HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md) - All decisions made
- [DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md](./DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md) - Architecture decisions
- [DATA_MODELS.md](./DATA_MODELS.md) - Current database schema

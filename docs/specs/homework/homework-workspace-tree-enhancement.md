<!-- docs/specs/homework/homework-workspace-tree-enhancement.md -->

# Homework Workspace Tree Enhancement

**Date:** 2026-01-26
**Status:** ✅ Implemented

## Overview

Enhanced the homework workspace tree view to support expandable/collapsible document nodes with metadata display and modal document viewing.

## Changes Made

### 1. Enhanced WorkspaceTreeNode Component

**File:** `/apps/web/src/lib/components/homework/WorkspaceTreeNode.svelte`

**Changes:**

- Added expand/collapse functionality with visual indicators
- Display document metadata when expanded:
    - State key (draft, published, etc.)
    - Created date
    - Updated date
    - Document ID
- Added "Open" button that appears on hover
- Improved visual hierarchy with icons and better spacing
- Responsive design with Inkprint styling

**Features:**

- Collapsible tree structure
- Metadata preview in compact cards
- Hover-activated "Open" button
- File icon for visual clarity
- Nested children rendering with proper indentation

### 2. Reused DocumentModal Component

**File:** `/apps/web/src/lib/components/ontology/DocumentModal.svelte` (existing component)

**Why Reuse:**

- Workspace documents use the same `onto_documents` table
- Same data structure and API endpoints
- Inherits all existing features:
    - Full document editing capabilities
    - Version history tracking
    - Linked entities management
    - Activity log
    - Comments section
    - Rich markdown editor
    - Responsive design with Inkprint styling
- No code duplication
- Consistent UX across the platform

### 3. Updated Parent Page

**File:** `/apps/web/src/routes/homework/runs/[id]/+page.svelte`

**Changes:**

- Added modal state management:
    - `showDocumentModal` - controls modal visibility
    - `selectedDocumentId` - tracks which document to display
    - `workspaceProjectId` - derived from workspace documents for modal context
- Added `openDocumentModal()` callback
- Connected WorkspaceTreeNode to modal via `onOpenDocument` prop
- Integrated existing DocumentModal component from ontology system
- Connected `onSaved` and `onDeleted` callbacks to refresh workspace data

## User Flow

1. User views homework run detail page
2. Workspace tree shows document structure
3. Each node can be expanded to reveal metadata:
    - State, dates, and ID displayed in a compact card
4. Hovering over a node reveals an "Open" button
5. Clicking "Open" launches the full DocumentModal with:
    - Full document metadata (title, type, state, dates)
    - Rich markdown editor for content
    - Version history panel
    - Linked entities (tasks, plans, goals, other documents)
    - Activity log and comments
    - All standard document editing capabilities
6. User can view, edit, or navigate to linked entities
7. Changes are saved and workspace refreshes automatically

## Technical Details

### API Integration

- Uses existing `/api/onto/documents/[id]` endpoint
- Fetches: `title`, `type_key`, `state_key`, `description`, `content`, `created_at`, `updated_at`
- Falls back to `props.body_markdown` for legacy documents

### Design System Compliance

- Uses Inkprint semantic tokens: `bg-card`, `border-border`, `text-foreground`, etc.
- Texture classes: `tx-grain`, `tx-frame`, `tx-paper`
- Shadow utilities: `shadow-ink`
- Pressable class for interactive elements
- Responsive breakpoints with mobile-first approach

### Svelte 5 Patterns

- Uses `$state()` for reactive state
- Uses `$derived()` where applicable
- Uses `$effect()` for side effects (document loading)
- Props interface with proper typing

## Testing Checklist

- [ ] Tree expands/collapses correctly
- [ ] Metadata displays properly
- [ ] "Open" button appears on hover
- [ ] Modal opens with correct document
- [ ] Modal displays metadata correctly
- [ ] Markdown content renders properly
- [ ] Modal closes correctly
- [ ] Responsive design works on mobile
- [ ] Dark mode styling is correct
- [ ] Loading states display correctly
- [ ] Error states display correctly

## Future Enhancements

Potential improvements for future iterations:

1. **Search/Filter**: Add search within the tree
2. **Bulk Actions**: Select multiple documents for actions
3. **Export**: Download document as PDF or markdown
4. **Keyboard Navigation**: Arrow keys to navigate tree
5. **Drag & Drop**: Reorganize document hierarchy
6. **Inline Preview**: Show content preview in tree without opening modal
7. **Document Templates**: Create new documents from templates

**Note:** Editing, version history, and linked entities are already available through the reused DocumentModal component!

## Related Documentation

- Inkprint Design System: `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- Modal Components: `/apps/web/docs/technical/components/modals/README.md`
- Ontology System: `/apps/web/docs/features/ontology/README.md`
- Homework Feature: `/docs/homework-lesson.md`

## Notes

- Document content uses the `content` column, with fallback to `props.body_markdown` for backwards compatibility
- The tree structure is built from `onto_documents` and `onto_edges` tables
- Documents are filtered by `homework_run_id` in props
- Modal is read-only to prevent accidental changes to homework workspace

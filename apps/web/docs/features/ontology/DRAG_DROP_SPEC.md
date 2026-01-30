<!-- apps/web/docs/features/ontology/DRAG_DROP_SPEC.md -->

# Document Tree Drag-and-Drop Specification

**Status:** Draft for Review
**Date:** 2026-01-30
**Author:** Claude (Agentic Assistant)

---

## Overview

This spec defines the drag-and-drop (DnD) interaction for reorganizing documents in the hierarchical document tree. The goal is to provide an intuitive, responsive way to move and reorder documents without using modals.

### Goals

1. **Intuitive** - Familiar drag-and-drop patterns users know from file explorers
2. **Responsive** - Works on desktop (mouse) and mobile (touch)
3. **Safe** - Prevents invalid operations (cycles, moving into descendants)
4. **Feedback-rich** - Clear visual indicators for valid/invalid drop targets
5. **Recoverable** - Optimistic updates with rollback on failure

---

## User Interactions

### Desktop (Mouse)

| Action | Trigger | Result |
|--------|---------|--------|
| Start drag | Mouse down + move (>5px) on document row | Ghost element follows cursor |
| Drag over folder | Hover over folder node | Folder highlights as drop target |
| Drag between items | Hover between two items | Insertion line appears |
| Drop on folder | Release over highlighted folder | Document becomes child of folder |
| Drop between items | Release on insertion line | Document inserted at position |
| Cancel drag | Press Escape or drag outside tree | Return to original position |

### Mobile (Touch)

| Action | Trigger | Result |
|--------|---------|--------|
| Start drag | Long press (500ms) on document row | Haptic feedback + ghost element |
| Drag | Move finger while holding | Ghost follows finger |
| Auto-scroll | Drag near top/bottom edge | Tree scrolls in that direction |
| Drop | Release finger | Same as desktop |
| Cancel | Lift finger outside tree area | Return to original position |

**Alternative for Mobile:** Instead of touch DnD (which can be finicky), mobile users can use the existing "Move to..." modal accessed via context menu or swipe actions.

---

## Visual Feedback

### Drag States

```
┌─────────────────────────────────────────────────────┐
│  IDLE STATE                                         │
│  ├─ 📁 Project Overview                            │
│  │   ├─ 📄 Requirements                            │
│  │   └─ 📄 Architecture                            │
│  ├─ 📁 Research                                    │
│  │   └─ 📄 Market Analysis                         │
│  └─ 📄 Meeting Notes                               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  DRAGGING STATE (dragging "Market Analysis")       │
│  ├─ 📁 Project Overview           [valid target]   │
│  │   ├─ 📄 Requirements                            │
│  │   └─ 📄 Architecture                            │
│  ├─ 📁 Research                   [invalid-self]   │
│  │   └─ ░░ Market Analysis ░░     [being dragged]  │
│  └─ 📄 Meeting Notes                               │
│                                                     │
│  ┌──────────────────┐                              │
│  │ 📄 Market Analysis │  ← Ghost element           │
│  └──────────────────┘                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  DROP TARGET: FOLDER (hovering over "Project...")  │
│  ├─ 📁 Project Overview  ◀━━━━━━━━ [highlighted]   │
│  │   ├─ 📄 Requirements                            │
│  │   └─ 📄 Architecture                            │
│  │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  ← will insert here      │
│  ├─ 📁 Research                                    │
│  │   └─ ░░ Market Analysis ░░                      │
│  └─ 📄 Meeting Notes                               │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  DROP TARGET: BETWEEN (between Requirements/Arch)  │
│  ├─ 📁 Project Overview                            │
│  │   ├─ 📄 Requirements                            │
│  │   ├─ ━━━━━━━━━━━━━━━━━━  ← insertion line       │
│  │   └─ 📄 Architecture                            │
│  ├─ 📁 Research                                    │
│  │   └─ ░░ Market Analysis ░░                      │
│  └─ 📄 Meeting Notes                               │
└─────────────────────────────────────────────────────┘
```

### CSS Classes

```css
/* Source item being dragged */
.doc-tree-node--dragging {
  opacity: 0.4;
  pointer-events: none;
}

/* Ghost element following cursor */
.doc-tree-ghost {
  position: fixed;
  pointer-events: none;
  z-index: 1000;
  padding: 8px 12px;
  background: var(--color-card);
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  box-shadow: var(--shadow-ink-strong);
  transform: translate(-50%, -50%);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Valid drop target (folder) */
.doc-tree-node--drop-target {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  outline: 2px dashed var(--color-accent);
  outline-offset: -2px;
}

/* Invalid drop target (self, descendant, or non-folder when nesting) */
.doc-tree-node--drop-invalid {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Insertion line between items */
.doc-tree-insertion-line {
  height: 2px;
  background: var(--color-accent);
  margin: -1px 0;
  border-radius: 1px;
  box-shadow: 0 0 4px var(--color-accent);
}

/* Auto-scroll zones */
.doc-tree-scroll-zone-top,
.doc-tree-scroll-zone-bottom {
  position: absolute;
  left: 0;
  right: 0;
  height: 40px;
  pointer-events: none;
}
```

---

## Drop Zones

### Zone Types

1. **Folder Drop Zone** - Drop onto a folder to add as last child
2. **Insertion Line** - Drop between two siblings to reorder
3. **Root Drop Zone** - Drop at tree bottom to move to root level

### Zone Detection Logic

```typescript
interface DropZone {
  type: 'folder' | 'between' | 'root';
  targetId: string | null;      // null for root
  parentId: string | null;      // parent of insertion point
  position: number;             // 0-indexed position in parent
}

function detectDropZone(
  mouseY: number,
  nodeElement: HTMLElement,
  node: DocTreeNode
): DropZone {
  const rect = nodeElement.getBoundingClientRect();
  const relativeY = mouseY - rect.top;
  const nodeHeight = rect.height;

  // Top 25% = insert before
  if (relativeY < nodeHeight * 0.25) {
    return {
      type: 'between',
      targetId: node.id,
      parentId: getParentId(node),
      position: getNodeIndex(node)
    };
  }

  // Bottom 25% = insert after
  if (relativeY > nodeHeight * 0.75) {
    return {
      type: 'between',
      targetId: node.id,
      parentId: getParentId(node),
      position: getNodeIndex(node) + 1
    };
  }

  // Middle 50% = drop into (if folder) or insert after (if doc)
  if (node.children && node.children.length > 0) {
    return {
      type: 'folder',
      targetId: node.id,
      parentId: node.id,
      position: node.children.length  // append as last child
    };
  }

  // Plain document - treat as insert after
  return {
    type: 'between',
    targetId: node.id,
    parentId: getParentId(node),
    position: getNodeIndex(node) + 1
  };
}
```

### Validation Rules

```typescript
function isValidDropTarget(
  draggedNode: DocTreeNode,
  dropZone: DropZone,
  treeRoot: DocTreeNode[]
): { valid: boolean; reason?: string } {
  // Rule 1: Cannot drop onto self
  if (dropZone.targetId === draggedNode.id) {
    return { valid: false, reason: 'Cannot drop item onto itself' };
  }

  // Rule 2: Cannot drop into own descendants (would create cycle)
  const descendants = collectDescendantIds(draggedNode);
  if (dropZone.parentId && descendants.has(dropZone.parentId)) {
    return { valid: false, reason: 'Cannot move folder into its own contents' };
  }

  // Rule 3: Position must be valid
  if (dropZone.position < 0) {
    return { valid: false, reason: 'Invalid position' };
  }

  return { valid: true };
}
```

---

## State Management

### Drag State

```typescript
interface DragState {
  isDragging: boolean;
  draggedNode: DocTreeNode | null;
  draggedElement: HTMLElement | null;
  ghostElement: HTMLElement | null;

  // Current drop target
  dropZone: DropZone | null;
  isValidDrop: boolean;

  // For touch
  touchStartTime: number;
  touchStartPos: { x: number; y: number };

  // Original position (for rollback)
  originalParentId: string | null;
  originalPosition: number;
}

// Svelte 5 state
let dragState = $state<DragState>({
  isDragging: false,
  draggedNode: null,
  draggedElement: null,
  ghostElement: null,
  dropZone: null,
  isValidDrop: false,
  touchStartTime: 0,
  touchStartPos: { x: 0, y: 0 },
  originalParentId: null,
  originalPosition: 0
});
```

### Optimistic Updates

```typescript
async function handleDrop(dropZone: DropZone) {
  if (!dragState.draggedNode || !dragState.isValidDrop) return;

  const nodeId = dragState.draggedNode.id;
  const { originalParentId, originalPosition } = dragState;

  // 1. Optimistically update UI
  moveNodeInTree(nodeId, dropZone.parentId, dropZone.position);

  // 2. Clear drag state
  resetDragState();

  // 3. Call API
  try {
    await moveDocument(nodeId, dropZone.parentId, dropZone.position);
    // Success - tree already updated
  } catch (error) {
    // 4. Rollback on failure
    moveNodeInTree(nodeId, originalParentId, originalPosition);
    showError('Failed to move document. Please try again.');
  }
}
```

---

## API Integration

### Move Endpoint

```typescript
// POST /api/onto/projects/[id]/doc-tree/move
interface MoveRequest {
  document_id: string;
  new_parent_id: string | null;  // null = root level
  new_position: number;          // 0-indexed
}

interface MoveResponse {
  structure: DocStructure;       // Updated tree
  message: string;
}
```

### Conflict Handling

If the tree has been modified by another user/session:

1. API returns 409 Conflict with current version
2. UI shows "Document tree was modified. Refresh to see changes."
3. User can refresh or retry the move

---

## Accessibility

### Keyboard Support

| Key | Action |
|-----|--------|
| Space/Enter | Toggle selection for move |
| Arrow Up/Down | Navigate tree (existing) |
| Ctrl+X | Cut (mark for move) |
| Ctrl+V | Paste (move to current location) |
| Escape | Cancel cut/move operation |

### Screen Reader Announcements

```typescript
const announcements = {
  dragStart: (title: string) =>
    `Started dragging ${title}. Use arrow keys to navigate, Enter to drop, Escape to cancel.`,

  dragOver: (title: string, isFolder: boolean) =>
    isFolder
      ? `Over folder ${title}. Press Enter to move here.`
      : `Over document ${title}. Press Enter to insert after.`,

  dropSuccess: (title: string, destination: string) =>
    `Moved ${title} to ${destination}.`,

  dropCancel: () =>
    `Move cancelled.`,

  dropInvalid: (reason: string) =>
    `Cannot drop here: ${reason}`
};
```

### ARIA Attributes

```html
<div
  role="treeitem"
  aria-grabbed="true"  <!-- when being dragged -->
  aria-dropeffect="move"
  aria-describedby="drag-instructions"
>
  Document Title
</div>

<div id="drag-instructions" class="sr-only">
  Press Space to start moving this item, then use arrow keys to navigate
  and Enter to drop at the new location.
</div>
```

---

## Mobile Considerations

### Touch Drag Challenges

1. **Scroll vs Drag Conflict** - Need to differentiate scrolling from dragging
2. **Precision** - Fingers are less precise than mouse cursors
3. **Visual Obstruction** - Finger covers the drop target

### Solutions

1. **Long Press to Initiate** - 500ms hold to start drag (prevents accidental drags)
2. **Larger Drop Zones** - Increase zone height on mobile (40px vs 24px)
3. **Offset Ghost** - Position ghost above finger, not under it
4. **Vibration Feedback** - Haptic on drag start and valid drop zones
5. **Fallback Modal** - Always offer "Move to..." as alternative

### Touch Event Handlers

```typescript
function handleTouchStart(e: TouchEvent, node: DocTreeNode) {
  dragState.touchStartTime = Date.now();
  dragState.touchStartPos = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };

  // Start long-press timer
  longPressTimer = setTimeout(() => {
    if (navigator.vibrate) navigator.vibrate(50);
    startDrag(node, e.touches[0]);
  }, 500);
}

function handleTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  const moved = Math.hypot(
    touch.clientX - dragState.touchStartPos.x,
    touch.clientY - dragState.touchStartPos.y
  );

  // Cancel long-press if moved too much
  if (!dragState.isDragging && moved > 10) {
    clearTimeout(longPressTimer);
    return;
  }

  if (dragState.isDragging) {
    e.preventDefault(); // Prevent scroll while dragging
    updateDragPosition(touch.clientX, touch.clientY);
    updateDropZone(touch.clientX, touch.clientY);
  }
}

function handleTouchEnd(e: TouchEvent) {
  clearTimeout(longPressTimer);

  if (dragState.isDragging) {
    handleDrop(dragState.dropZone);
  }
}
```

---

## Auto-Scroll

When dragging near the edges of a scrollable tree container:

```typescript
const SCROLL_ZONE_SIZE = 40;  // pixels from edge
const SCROLL_SPEED = 8;       // pixels per frame

function updateAutoScroll(mouseY: number, container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const topZone = rect.top + SCROLL_ZONE_SIZE;
  const bottomZone = rect.bottom - SCROLL_ZONE_SIZE;

  if (mouseY < topZone) {
    // Scroll up
    const intensity = 1 - (mouseY - rect.top) / SCROLL_ZONE_SIZE;
    container.scrollTop -= SCROLL_SPEED * intensity;
  } else if (mouseY > bottomZone) {
    // Scroll down
    const intensity = (mouseY - bottomZone) / SCROLL_ZONE_SIZE;
    container.scrollTop += SCROLL_SPEED * intensity;
  }
}
```

---

## Component Structure

### File Organization

```
src/lib/components/ontology/doc-tree/
├── DocTreeView.svelte           # Main container (existing)
├── DocTreeNode.svelte           # Tree node (update for DnD)
├── DocTreeDragLayer.svelte      # NEW: Ghost element + insertion lines
├── DocTreeDropZone.svelte       # NEW: Drop zone indicator
├── useDragDrop.svelte.ts        # NEW: Drag-drop state/logic
└── index.ts                     # Barrel exports
```

### Hook/State Module

```typescript
// useDragDrop.svelte.ts
export function createDragDropState(options: {
  treeRef: HTMLElement;
  onMove: (nodeId: string, newParentId: string | null, position: number) => Promise<void>;
}) {
  let state = $state<DragState>({ /* ... */ });

  function startDrag(node: DocTreeNode, event: MouseEvent | Touch) { /* ... */ }
  function updateDrag(x: number, y: number) { /* ... */ }
  function endDrag() { /* ... */ }
  function cancelDrag() { /* ... */ }

  return {
    get state() { return state; },
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag
  };
}
```

---

## Implementation Phases

### Phase 5.1: Basic Mouse DnD (Desktop)

- [ ] Create `useDragDrop.svelte.ts` state module
- [ ] Create `DocTreeDragLayer.svelte` ghost element
- [ ] Add drag handlers to `DocTreeNode.svelte`
- [ ] Implement drop zone detection
- [ ] Implement optimistic move with rollback
- [ ] Add visual feedback classes

### Phase 5.2: Keyboard Alternative

- [ ] Add keyboard move mode (Ctrl+X / Ctrl+V)
- [ ] Add screen reader announcements
- [ ] Test with VoiceOver/NVDA

### Phase 5.3: Touch Support (Mobile)

- [ ] Add long-press detection
- [ ] Implement touch drag handlers
- [ ] Add auto-scroll for touch
- [ ] Add haptic feedback
- [ ] Test on iOS Safari and Android Chrome

### Phase 5.4: Polish

- [ ] Add animations for insert/remove
- [ ] Add undo support (Ctrl+Z after move)
- [ ] Performance optimization for large trees
- [ ] Add drag-from-unlinked-documents support

---

## Testing Checklist

### Unit Tests

- [ ] `detectDropZone()` returns correct zones for all mouse positions
- [ ] `isValidDropTarget()` correctly identifies invalid targets
- [ ] Optimistic update correctly modifies tree structure
- [ ] Rollback restores original position on error

### Integration Tests

- [ ] Mouse drag from one folder to another
- [ ] Mouse drag to reorder within same folder
- [ ] Mouse drag to root level
- [ ] Keyboard move (Ctrl+X/V)
- [ ] Touch long-press initiates drag (mobile)
- [ ] Auto-scroll when dragging near edges
- [ ] Conflict handling (409 response)

### Accessibility Tests

- [ ] Screen reader announces drag start/end
- [ ] Keyboard-only move is possible
- [ ] Focus management after drop
- [ ] High contrast mode visibility

---

## Decisions Made

1. **Drag Multiple Items?** - No. Single-item drag only.

2. **Cross-Project Drag?** - No. Use copy/move modal for cross-project operations.

3. **Folder Creation on Drop?** - Hybrid approach:
   - **Existing folders** (documents with children): Accept drops immediately in middle zone
   - **Plain documents**: Require 400ms hover to "convert" to drop target
     - Visual feedback: pulsing border, icon morphs to folder
     - If user moves away before 400ms, no conversion
   - **Fallback**: "Create Child" always available from context menu

4. **Animation Duration?** - 150ms for insert line, 200ms for node repositioning.

---

## Related Documents

- [HIERARCHICAL_DOCUMENT_TREE_SPEC.md](./HIERARCHICAL_DOCUMENT_TREE_SPEC.md) - Main tree specification
- [HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md](./HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md) - Implementation progress
- [HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md](./HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md) - Design decisions

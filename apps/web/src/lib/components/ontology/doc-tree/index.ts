// apps/web/src/lib/components/ontology/doc-tree/index.ts
/**
 * Document Tree Components
 *
 * Hierarchical document tree UI for organizing project documents.
 * See: /apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENT_TREE_SPEC.md
 */

export { default as DocTreeView } from './DocTreeView.svelte';
export { default as DocTreeNode } from './DocTreeNode.svelte';
export { default as DocTreeMobile } from './DocTreeMobile.svelte';
export { default as DocTreeSkeleton } from './DocTreeSkeleton.svelte';
export { default as DocTreeContextMenu } from './DocTreeContextMenu.svelte';
export { default as DocTreeUpdateNotification } from './DocTreeUpdateNotification.svelte';
export { default as UnlinkedDocuments } from './UnlinkedDocuments.svelte';
export { default as DocMoveModal } from './DocMoveModal.svelte';
export { default as DocDeleteConfirmModal } from './DocDeleteConfirmModal.svelte';
export { default as DocTreeDragLayer } from './DocTreeDragLayer.svelte';

// Drag-drop state and types
export {
	createDragDropState,
	type DragState,
	type DropZone,
	type DropZoneType,
	type DragDropOptions,
	type DragDropState,
	type MoveHistoryEntry
} from './useDragDrop.svelte';

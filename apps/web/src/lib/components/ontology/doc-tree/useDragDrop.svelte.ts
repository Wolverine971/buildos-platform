// apps/web/src/lib/components/ontology/doc-tree/useDragDrop.svelte.ts
/**
 * Drag-and-Drop State and Logic for Document Tree
 *
 * Manages:
 * - Drag state (what's being dragged, where)
 * - Drop zone detection
 * - Validation (no cycles, no self-drop)
 * - Hover-to-convert for plain documents
 * - Optimistic updates with rollback
 */

import type { EnrichedDocTreeNode } from '$lib/types/onto-api';

// ============================================
// TYPES
// ============================================

export type DropZoneType = 'before' | 'after' | 'inside';

export interface DropZone {
	type: DropZoneType;
	targetId: string;
	parentId: string | null;
	position: number;
}

export interface DragState {
	isDragging: boolean;
	draggedNode: EnrichedDocTreeNode | null;
	draggedElement: HTMLElement | null;

	// Ghost position
	ghostX: number;
	ghostY: number;

	// Current drop target
	dropZone: DropZone | null;
	isValidDrop: boolean;
	invalidReason: string | null;

	// Hover-to-convert state
	hoverTargetId: string | null;
	hoverStartTime: number;
	isConverting: boolean;

	// Original position for rollback
	originalParentId: string | null;
	originalPosition: number;

	// Touch state
	isTouchDrag: boolean;
	touchStartPos: { x: number; y: number } | null;
}

export interface DragDropOptions {
	onMove: (
		documentId: string,
		newParentId: string | null,
		position: number
	) => Promise<{ success: boolean; error?: string }>;
	getNodeElement: (nodeId: string) => HTMLElement | null;
	getNodeById: (nodeId: string) => EnrichedDocTreeNode | null;
	getParentId: (nodeId: string) => string | null;
	getNodeIndex: (nodeId: string) => number;
	getDescendantIds: (nodeId: string) => Set<string>;
}

// ============================================
// CONSTANTS
// ============================================

const DRAG_THRESHOLD = 5; // pixels before drag starts
const HOVER_TO_CONVERT_DELAY = 400; // ms to hover before converting doc to folder
const ZONE_BEFORE_PERCENT = 0.3; // top 30% = insert before
const ZONE_AFTER_PERCENT = 0.7; // bottom 30% = insert after
const LONG_PRESS_DELAY = 500; // ms for mobile long press

// ============================================
// STATE FACTORY
// ============================================

export function createDragDropState(options: DragDropOptions) {
	// Reactive state
	let state = $state<DragState>({
		isDragging: false,
		draggedNode: null,
		draggedElement: null,
		ghostX: 0,
		ghostY: 0,
		dropZone: null,
		isValidDrop: false,
		invalidReason: null,
		hoverTargetId: null,
		hoverStartTime: 0,
		isConverting: false,
		originalParentId: null,
		originalPosition: 0,
		isTouchDrag: false,
		touchStartPos: null
	});

	// Timers
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let animationFrame: number | null = null;

	// ============================================
	// DRAG START
	// ============================================

	function startDrag(node: EnrichedDocTreeNode, element: HTMLElement, x: number, y: number, isTouch = false) {
		// Store original position for rollback
		const parentId = options.getParentId(node.id);
		const position = options.getNodeIndex(node.id);

		state = {
			...state,
			isDragging: true,
			draggedNode: node,
			draggedElement: element,
			ghostX: x,
			ghostY: y,
			dropZone: null,
			isValidDrop: false,
			invalidReason: null,
			hoverTargetId: null,
			hoverStartTime: 0,
			isConverting: false,
			originalParentId: parentId,
			originalPosition: position,
			isTouchDrag: isTouch,
			touchStartPos: isTouch ? { x, y } : null
		};

		// Add body class to prevent text selection
		document.body.classList.add('doc-tree-dragging');
	}

	// ============================================
	// DRAG UPDATE
	// ============================================

	function updateDrag(x: number, y: number) {
		if (!state.isDragging) return;

		state.ghostX = x;
		state.ghostY = y;
	}

	function updateDropZone(targetNode: EnrichedDocTreeNode | null, mouseY: number, elementRect: DOMRect | null) {
		if (!state.isDragging || !state.draggedNode) return;

		// Clear previous hover timer if target changed
		if (targetNode?.id !== state.hoverTargetId) {
			if (hoverTimer) {
				clearTimeout(hoverTimer);
				hoverTimer = null;
			}
			state.isConverting = false;
		}

		// No target - clear drop zone
		if (!targetNode || !elementRect) {
			state.dropZone = null;
			state.isValidDrop = false;
			state.invalidReason = null;
			state.hoverTargetId = null;
			state.hoverStartTime = 0;
			return;
		}

		// Detect zone based on mouse position
		const relativeY = mouseY - elementRect.top;
		const nodeHeight = elementRect.height;
		const zoneType = detectZoneType(relativeY, nodeHeight, targetNode);

		// Build drop zone
		const dropZone = buildDropZone(zoneType, targetNode);

		// Validate
		const validation = validateDrop(state.draggedNode, dropZone, targetNode);

		// Handle hover-to-convert for plain documents
		if (zoneType === 'inside' && !targetNode.children?.length && validation.valid) {
			if (state.hoverTargetId !== targetNode.id) {
				state.hoverTargetId = targetNode.id;
				state.hoverStartTime = Date.now();
				state.isConverting = false;

				// Start hover timer
				hoverTimer = setTimeout(() => {
					if (state.hoverTargetId === targetNode.id) {
						state.isConverting = true;
					}
				}, HOVER_TO_CONVERT_DELAY);
			}

			// Only allow drop if converting
			if (!state.isConverting) {
				state.dropZone = dropZone;
				state.isValidDrop = false;
				state.invalidReason = 'Hold to nest inside';
				return;
			}
		} else {
			state.hoverTargetId = targetNode.id;
			state.isConverting = false;
		}

		state.dropZone = dropZone;
		state.isValidDrop = validation.valid;
		state.invalidReason = validation.reason ?? null;
	}

	function detectZoneType(relativeY: number, nodeHeight: number, node: EnrichedDocTreeNode): DropZoneType {
		const beforeThreshold = nodeHeight * ZONE_BEFORE_PERCENT;
		const afterThreshold = nodeHeight * ZONE_AFTER_PERCENT;

		if (relativeY < beforeThreshold) {
			return 'before';
		}

		if (relativeY > afterThreshold) {
			return 'after';
		}

		// Middle zone - 'inside' only if it's a folder or we're converting
		return 'inside';
	}

	function buildDropZone(zoneType: DropZoneType, targetNode: EnrichedDocTreeNode): DropZone {
		const targetParentId = options.getParentId(targetNode.id);
		const targetIndex = options.getNodeIndex(targetNode.id);

		switch (zoneType) {
			case 'before':
				return {
					type: 'before',
					targetId: targetNode.id,
					parentId: targetParentId,
					position: targetIndex
				};

			case 'after':
				return {
					type: 'after',
					targetId: targetNode.id,
					parentId: targetParentId,
					position: targetIndex + 1
				};

			case 'inside':
				return {
					type: 'inside',
					targetId: targetNode.id,
					parentId: targetNode.id,
					position: targetNode.children?.length ?? 0
				};
		}
	}

	function validateDrop(
		draggedNode: EnrichedDocTreeNode,
		dropZone: DropZone,
		targetNode: EnrichedDocTreeNode
	): { valid: boolean; reason?: string } {
		// Rule 1: Cannot drop onto self
		if (dropZone.parentId === draggedNode.id || targetNode.id === draggedNode.id) {
			return { valid: false, reason: 'Cannot drop onto itself' };
		}

		// Rule 2: Cannot drop into own descendants
		if (dropZone.parentId) {
			const descendants = options.getDescendantIds(draggedNode.id);
			if (descendants.has(dropZone.parentId)) {
				return { valid: false, reason: 'Cannot move into its own contents' };
			}
		}

		// Rule 3: Check if moving to same position (no-op)
		const currentParentId = options.getParentId(draggedNode.id);
		const currentIndex = options.getNodeIndex(draggedNode.id);

		if (dropZone.parentId === currentParentId) {
			// Same parent - check if position is actually different
			let effectivePosition = dropZone.position;
			if (currentIndex < effectivePosition) {
				effectivePosition -= 1; // Account for removal
			}
			if (effectivePosition === currentIndex) {
				return { valid: false, reason: 'Already in this position' };
			}
		}

		return { valid: true };
	}

	// ============================================
	// DRAG END
	// ============================================

	async function endDrag(): Promise<{ success: boolean; error?: string }> {
		if (!state.isDragging || !state.draggedNode) {
			resetDragState();
			return { success: false, error: 'No active drag' };
		}

		const { draggedNode, dropZone, isValidDrop, originalParentId, originalPosition } = state;

		// Clear state first
		resetDragState();

		if (!dropZone || !isValidDrop) {
			return { success: false, error: 'Invalid drop target' };
		}

		// Calculate effective position (account for removal from same parent)
		let effectivePosition = dropZone.position;
		if (dropZone.parentId === originalParentId && originalPosition < dropZone.position) {
			effectivePosition -= 1;
		}

		// Call the move handler
		try {
			const result = await options.onMove(draggedNode.id, dropZone.parentId, effectivePosition);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Move failed';
			return { success: false, error: message };
		}
	}

	function cancelDrag() {
		resetDragState();
	}

	function resetDragState() {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}

		document.body.classList.remove('doc-tree-dragging');

		state = {
			isDragging: false,
			draggedNode: null,
			draggedElement: null,
			ghostX: 0,
			ghostY: 0,
			dropZone: null,
			isValidDrop: false,
			invalidReason: null,
			hoverTargetId: null,
			hoverStartTime: 0,
			isConverting: false,
			originalParentId: null,
			originalPosition: 0,
			isTouchDrag: false,
			touchStartPos: null
		};
	}

	// ============================================
	// MOUSE HANDLERS
	// ============================================

	let mouseDownPos: { x: number; y: number } | null = null;
	let pendingDragNode: EnrichedDocTreeNode | null = null;
	let pendingDragElement: HTMLElement | null = null;

	function handleMouseDown(e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) {
		if (e.button !== 0) return; // Only left click

		mouseDownPos = { x: e.clientX, y: e.clientY };
		pendingDragNode = node;
		pendingDragElement = element;
	}

	function handleMouseMove(e: MouseEvent) {
		// Check if we should start dragging
		if (mouseDownPos && pendingDragNode && pendingDragElement && !state.isDragging) {
			const dx = e.clientX - mouseDownPos.x;
			const dy = e.clientY - mouseDownPos.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > DRAG_THRESHOLD) {
				startDrag(pendingDragNode, pendingDragElement, e.clientX, e.clientY, false);
				mouseDownPos = null;
				pendingDragNode = null;
				pendingDragElement = null;
			}
		}

		// Update drag position
		if (state.isDragging) {
			updateDrag(e.clientX, e.clientY);
		}
	}

	function handleMouseUp(_e: MouseEvent) {
		mouseDownPos = null;
		pendingDragNode = null;
		pendingDragElement = null;

		if (state.isDragging) {
			endDrag();
		}
	}

	// ============================================
	// TOUCH HANDLERS
	// ============================================

	function handleTouchStart(e: TouchEvent, node: EnrichedDocTreeNode, element: HTMLElement) {
		const touch = e.touches[0];
		state.touchStartPos = { x: touch.clientX, y: touch.clientY };

		// Start long press timer
		longPressTimer = setTimeout(() => {
			if (state.touchStartPos) {
				// Haptic feedback
				if (navigator.vibrate) {
					navigator.vibrate(50);
				}
				startDrag(node, element, touch.clientX, touch.clientY, true);
			}
		}, LONG_PRESS_DELAY);
	}

	function handleTouchMove(e: TouchEvent) {
		const touch = e.touches[0];

		// Cancel long press if moved too much before drag started
		if (!state.isDragging && state.touchStartPos) {
			const dx = touch.clientX - state.touchStartPos.x;
			const dy = touch.clientY - state.touchStartPos.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > 10) {
				if (longPressTimer) {
					clearTimeout(longPressTimer);
					longPressTimer = null;
				}
				state.touchStartPos = null;
				return;
			}
		}

		// Update drag
		if (state.isDragging) {
			e.preventDefault(); // Prevent scroll while dragging
			updateDrag(touch.clientX, touch.clientY);
		}
	}

	function handleTouchEnd(_e: TouchEvent) {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		state.touchStartPos = null;

		if (state.isDragging) {
			endDrag();
		}
	}

	function handleTouchCancel() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		cancelDrag();
	}

	// ============================================
	// KEYBOARD HANDLERS
	// ============================================

	function handleKeyDown(e: KeyboardEvent) {
		if (state.isDragging && e.key === 'Escape') {
			e.preventDefault();
			cancelDrag();
		}
	}

	// ============================================
	// CLEANUP
	// ============================================

	function cleanup() {
		resetDragState();
	}

	// ============================================
	// RETURN API
	// ============================================

	return {
		get state() {
			return state;
		},

		// Core operations
		startDrag,
		updateDrag,
		updateDropZone,
		endDrag,
		cancelDrag,

		// Event handlers
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		handleTouchCancel,
		handleKeyDown,

		// Cleanup
		cleanup
	};
}

export type DragDropState = ReturnType<typeof createDragDropState>;

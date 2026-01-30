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
 * - Keyboard cut/paste (Ctrl+X/V)
 * - Auto-scroll during drag
 * - Undo support
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

	// Keyboard cut/paste state
	cutNode: EnrichedDocTreeNode | null;
	cutOriginalParentId: string | null;
	cutOriginalPosition: number;

	// Auto-scroll state
	isAutoScrolling: boolean;
	autoScrollDirection: 'up' | 'down' | null;
}

/** Undo history entry for move operations */
export interface MoveHistoryEntry {
	documentId: string;
	fromParentId: string | null;
	fromPosition: number;
	toParentId: string | null;
	toPosition: number;
	timestamp: number;
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
	getTreeContainer?: () => HTMLElement | null;
	onUndo?: (entry: MoveHistoryEntry) => void;
}

// ============================================
// CONSTANTS
// ============================================

const DRAG_THRESHOLD = 5; // pixels before drag starts
const HOVER_TO_CONVERT_DELAY = 400; // ms to hover before converting doc to folder
const ZONE_BEFORE_PERCENT = 0.3; // top 30% = insert before
const ZONE_AFTER_PERCENT = 0.7; // bottom 30% = insert after
const LONG_PRESS_DELAY = 500; // ms for mobile long press
const AUTO_SCROLL_ZONE = 60; // pixels from edge to trigger auto-scroll
const AUTO_SCROLL_SPEED = 8; // pixels per frame
const UNDO_HISTORY_MAX = 10; // max undo entries to keep

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
		touchStartPos: null,
		cutNode: null,
		cutOriginalParentId: null,
		cutOriginalPosition: 0,
		isAutoScrolling: false,
		autoScrollDirection: null
	});

	// Undo history
	let undoHistory: MoveHistoryEntry[] = [];

	// Timers
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let animationFrame: number | null = null;
	let autoScrollFrame: number | null = null;

	// ============================================
	// DRAG START
	// ============================================

	function startDrag(
		node: EnrichedDocTreeNode,
		element: HTMLElement,
		x: number,
		y: number,
		isTouch = false
	) {
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

		// Trigger auto-scroll check
		updateAutoScroll(y);
	}

	// ============================================
	// AUTO-SCROLL
	// ============================================

	function updateAutoScroll(mouseY: number) {
		const container = options.getTreeContainer?.();
		if (!container) return;

		const rect = container.getBoundingClientRect();
		const topZone = rect.top + AUTO_SCROLL_ZONE;
		const bottomZone = rect.bottom - AUTO_SCROLL_ZONE;

		if (mouseY < topZone && mouseY > rect.top) {
			// Scroll up
			if (!state.isAutoScrolling || state.autoScrollDirection !== 'up') {
				state.isAutoScrolling = true;
				state.autoScrollDirection = 'up';
				startAutoScroll(container, 'up', mouseY, rect.top);
			}
		} else if (mouseY > bottomZone && mouseY < rect.bottom) {
			// Scroll down
			if (!state.isAutoScrolling || state.autoScrollDirection !== 'down') {
				state.isAutoScrolling = true;
				state.autoScrollDirection = 'down';
				startAutoScroll(container, 'down', mouseY, bottomZone);
			}
		} else {
			// Stop auto-scroll
			stopAutoScroll();
		}
	}

	function startAutoScroll(
		container: HTMLElement,
		direction: 'up' | 'down',
		mouseY: number,
		edgeY: number
	) {
		if (autoScrollFrame) {
			cancelAnimationFrame(autoScrollFrame);
		}

		const scroll = () => {
			if (!state.isDragging || !state.isAutoScrolling) {
				stopAutoScroll();
				return;
			}

			// Calculate scroll intensity based on distance from edge
			const distance = direction === 'up' ? edgeY - mouseY : mouseY - edgeY;
			const intensity = Math.min(1, distance / AUTO_SCROLL_ZONE);
			const scrollAmount = AUTO_SCROLL_SPEED * intensity;

			if (direction === 'up') {
				container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
			} else {
				container.scrollTop = Math.min(
					container.scrollHeight - container.clientHeight,
					container.scrollTop + scrollAmount
				);
			}

			autoScrollFrame = requestAnimationFrame(scroll);
		};

		autoScrollFrame = requestAnimationFrame(scroll);
	}

	function stopAutoScroll() {
		if (autoScrollFrame) {
			cancelAnimationFrame(autoScrollFrame);
			autoScrollFrame = null;
		}
		state.isAutoScrolling = false;
		state.autoScrollDirection = null;
	}

	function updateDropZone(
		targetNode: EnrichedDocTreeNode | null,
		mouseY: number,
		elementRect: DOMRect | null
	) {
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

	function detectZoneType(
		relativeY: number,
		nodeHeight: number,
		node: EnrichedDocTreeNode
	): DropZoneType {
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
			const result = await options.onMove(
				draggedNode.id,
				dropZone.parentId,
				effectivePosition
			);

			if (result.success) {
				// Add to undo history
				addToUndoHistory({
					documentId: draggedNode.id,
					fromParentId: originalParentId,
					fromPosition: originalPosition,
					toParentId: dropZone.parentId,
					toPosition: effectivePosition,
					timestamp: Date.now()
				});

				// Haptic feedback on successful move (touch)
				if (navigator.vibrate) {
					navigator.vibrate([30, 50, 30]);
				}
			}

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
		stopAutoScroll();

		document.body.classList.remove('doc-tree-dragging');

		// Preserve cut state across drag operations
		const { cutNode, cutOriginalParentId, cutOriginalPosition } = state;

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
			touchStartPos: null,
			cutNode,
			cutOriginalParentId,
			cutOriginalPosition,
			isAutoScrolling: false,
			autoScrollDirection: null
		};
	}

	// ============================================
	// UNDO SUPPORT
	// ============================================

	function addToUndoHistory(entry: MoveHistoryEntry) {
		undoHistory.push(entry);
		// Keep history bounded
		if (undoHistory.length > UNDO_HISTORY_MAX) {
			undoHistory.shift();
		}
	}

	async function undo(): Promise<{ success: boolean; error?: string }> {
		const lastMove = undoHistory.pop();
		if (!lastMove) {
			return { success: false, error: 'Nothing to undo' };
		}

		// Move back to original position
		try {
			const result = await options.onMove(
				lastMove.documentId,
				lastMove.fromParentId,
				lastMove.fromPosition
			);

			if (result.success) {
				options.onUndo?.(lastMove);
			} else {
				// Put it back in history if undo failed
				undoHistory.push(lastMove);
			}

			return result;
		} catch (error) {
			// Put it back in history if undo failed
			undoHistory.push(lastMove);
			const message = error instanceof Error ? error.message : 'Undo failed';
			return { success: false, error: message };
		}
	}

	function canUndo(): boolean {
		return undoHistory.length > 0;
	}

	// ============================================
	// KEYBOARD CUT/PASTE
	// ============================================

	function cutNode(node: EnrichedDocTreeNode) {
		const parentId = options.getParentId(node.id);
		const position = options.getNodeIndex(node.id);

		state.cutNode = node;
		state.cutOriginalParentId = parentId;
		state.cutOriginalPosition = position;

		// Haptic feedback on mobile
		if (navigator.vibrate) {
			navigator.vibrate(30);
		}
	}

	function clearCut() {
		state.cutNode = null;
		state.cutOriginalParentId = null;
		state.cutOriginalPosition = 0;
	}

	async function pasteNode(
		targetNodeId: string | null,
		position?: number
	): Promise<{ success: boolean; error?: string }> {
		if (!state.cutNode) {
			return { success: false, error: 'Nothing to paste' };
		}

		const cutNodeData = state.cutNode;
		const originalParentId = state.cutOriginalParentId;
		const originalPosition = state.cutOriginalPosition;

		// Determine target
		let newParentId: string | null;
		let newPosition: number;

		if (targetNodeId) {
			const targetNode = options.getNodeById(targetNodeId);
			if (!targetNode) {
				return { success: false, error: 'Target not found' };
			}

			// Validate: can't paste into self or descendants
			if (targetNodeId === cutNodeData.id) {
				return { success: false, error: 'Cannot paste into itself' };
			}

			const descendants = options.getDescendantIds(cutNodeData.id);
			if (descendants.has(targetNodeId)) {
				return { success: false, error: 'Cannot paste into its own contents' };
			}

			// Paste inside target (as last child) or after target
			if (targetNode.type === 'folder' || targetNode.children?.length) {
				newParentId = targetNodeId;
				newPosition = position ?? targetNode.children?.length ?? 0;
			} else {
				// Paste after the target node
				newParentId = options.getParentId(targetNodeId);
				newPosition = position ?? options.getNodeIndex(targetNodeId) + 1;
			}
		} else {
			// Paste at root level
			newParentId = null;
			newPosition = position ?? 0;
		}

		// Check if it's a no-op
		if (newParentId === originalParentId && newPosition === originalPosition) {
			clearCut();
			return { success: true };
		}

		// Clear cut state before move
		clearCut();

		// Perform the move
		try {
			const result = await options.onMove(cutNodeData.id, newParentId, newPosition);

			if (result.success) {
				// Add to undo history
				addToUndoHistory({
					documentId: cutNodeData.id,
					fromParentId: originalParentId,
					fromPosition: originalPosition,
					toParentId: newParentId,
					toPosition: newPosition,
					timestamp: Date.now()
				});

				// Haptic feedback
				if (navigator.vibrate) {
					navigator.vibrate([30, 50, 30]);
				}
			}

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Paste failed';
			return { success: false, error: message };
		}
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
		if (!touch) return;

		const startX = touch.clientX;
		const startY = touch.clientY;
		state.touchStartPos = { x: startX, y: startY };

		// Start long press timer
		longPressTimer = setTimeout(() => {
			if (state.touchStartPos) {
				// Haptic feedback
				if (navigator.vibrate) {
					navigator.vibrate(50);
				}
				startDrag(node, element, startX, startY, true);
			}
		}, LONG_PRESS_DELAY);
	}

	function handleTouchMove(e: TouchEvent) {
		const touch = e.touches[0];
		if (!touch) return;

		const touchX = touch.clientX;
		const touchY = touch.clientY;

		// Cancel long press if moved too much before drag started
		if (!state.isDragging && state.touchStartPos) {
			const dx = touchX - state.touchStartPos.x;
			const dy = touchY - state.touchStartPos.y;
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
			updateDrag(touchX, touchY);
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

	// Track focused/selected node for keyboard operations
	let focusedNodeId: string | null = null;

	function setFocusedNode(nodeId: string | null) {
		focusedNodeId = nodeId;
	}

	function handleKeyDown(e: KeyboardEvent) {
		const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
		const modKey = isMac ? e.metaKey : e.ctrlKey;

		// Escape - cancel drag or clear cut
		if (e.key === 'Escape') {
			if (state.isDragging) {
				e.preventDefault();
				cancelDrag();
			} else if (state.cutNode) {
				e.preventDefault();
				clearCut();
			}
			return;
		}

		// Ctrl/Cmd+X - Cut
		if (modKey && e.key === 'x' && focusedNodeId) {
			e.preventDefault();
			const node = options.getNodeById(focusedNodeId);
			if (node) {
				cutNode(node);
			}
			return;
		}

		// Ctrl/Cmd+V - Paste
		if (modKey && e.key === 'v' && state.cutNode) {
			e.preventDefault();
			pasteNode(focusedNodeId);
			return;
		}

		// Ctrl/Cmd+Z - Undo
		if (modKey && e.key === 'z' && !e.shiftKey) {
			if (canUndo()) {
				e.preventDefault();
				undo();
			}
			return;
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

		// Core drag operations
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

		// Keyboard cut/paste
		cutNode,
		clearCut,
		pasteNode,
		setFocusedNode,

		// Undo
		undo,
		canUndo,
		get undoHistory() {
			return undoHistory;
		},

		// Auto-scroll
		stopAutoScroll,

		// Cleanup
		cleanup
	};
}

export type DragDropState = ReturnType<typeof createDragDropState>;

<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeNode.svelte -->
<!--
	DocTreeNode - Recursive tree node component

	Features:
	- Recursive rendering for nested documents
	- Expand/collapse for folders
	- File/folder icons based on children
	- Click to open document
	- Right-click context menu
	- Indentation based on depth
	- Drag-and-drop reordering

	Inkprint Design:
	- Semantic color tokens
	- Pressable interactions
	- Texture classes for states
-->
<script lang="ts">
	import { ChevronRight, FileText, Folder, FolderOpen, GripVertical } from 'lucide-svelte';
	import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
	import DocTreeNode from './DocTreeNode.svelte';
	import type { DragState, DropZone } from './useDragDrop.svelte';

	interface Props {
		node: EnrichedDocTreeNode;
		expandedIds: Set<string>;
		onToggleExpand: (id: string) => void;
		onOpenDocument: (id: string) => void;
		onContextMenu: (e: MouseEvent, node: EnrichedDocTreeNode) => void;
		selectedId?: string | null;
		indentPx?: number;
		// Drag-and-drop props
		dragState?: DragState | null;
		onDragStart?: (e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		onDragOver?: (e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		onTouchStart?: (e: TouchEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		canDrag?: boolean;
		// Cut/paste props
		cutNodeId?: string | null;
		onFocus?: (nodeId: string) => void;
	}

	let {
		node,
		expandedIds,
		onToggleExpand,
		onOpenDocument,
		onContextMenu,
		selectedId = null,
		indentPx = 20,
		dragState = null,
		onDragStart,
		onDragOver,
		onTouchStart,
		canDrag = true,
		cutNodeId = null,
		onFocus
	}: Props = $props();

	let nodeElement: HTMLElement | null = $state(null);

	const isFolder = $derived(node.type === 'folder');
	const isExpanded = $derived(expandedIds.has(node.id));
	const isSelected = $derived(selectedId === node.id);
	const indent = $derived(node.depth * indentPx);
	const isCut = $derived(cutNodeId === node.id);

	// Drag state derivations
	const isDragging = $derived(dragState?.isDragging && dragState?.draggedNode?.id === node.id);
	const isDropTarget = $derived(
		dragState?.isDragging &&
			dragState?.dropZone?.targetId === node.id &&
			dragState?.dropZone?.type === 'inside'
	);
	const isDropBefore = $derived(
		dragState?.isDragging &&
			dragState?.dropZone?.targetId === node.id &&
			dragState?.dropZone?.type === 'before' &&
			dragState?.isValidDrop
	);
	const isDropAfter = $derived(
		dragState?.isDragging &&
			dragState?.dropZone?.targetId === node.id &&
			dragState?.dropZone?.type === 'after' &&
			dragState?.isValidDrop
	);
	const isValidDropTarget = $derived(isDropTarget && dragState?.isValidDrop);
	const isConverting = $derived(isDropTarget && dragState?.isConverting && !isFolder);
	const isInvalidTarget = $derived(
		dragState?.isDragging &&
			(dragState?.draggedNode?.id === node.id ||
				(dragState?.dropZone?.targetId === node.id && !dragState?.isValidDrop))
	);

	function handleClick(e: MouseEvent) {
		// Don't open if we're in the middle of a drag
		if (dragState?.isDragging) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		e.stopPropagation();
		// Note: Expand/collapse is handled separately by the chevron's handleChevronClick
		// This only opens the document, allowing users to expand without opening
		onOpenDocument(node.id);
	}

	function handleChevronClick(e: MouseEvent | KeyboardEvent) {
		e.stopPropagation();
		onToggleExpand(node.id);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onContextMenu(e, node);
	}

	// Drag handlers - only from the drag handle
	function handleDragHandleMouseDown(e: MouseEvent) {
		if (!canDrag || !onDragStart || e.button !== 0) return;
		e.stopPropagation();
		if (nodeElement) {
			onDragStart(e, node, nodeElement);
		}
	}

	function handleMouseEnter(e: MouseEvent) {
		if (!dragState?.isDragging || !onDragOver || !nodeElement) return;
		onDragOver(e, node, nodeElement);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!dragState?.isDragging || !onDragOver || !nodeElement) return;
		onDragOver(e, node, nodeElement);
	}

	function handleDragHandleTouchStart(e: TouchEvent) {
		if (!canDrag || !onTouchStart) return;
		if (nodeElement) {
			onTouchStart(e, node, nodeElement);
		}
	}
</script>

<div
	class="doc-tree-node"
	class:doc-tree-node--dragging={isDragging}
	class:doc-tree-node--drop-target={isValidDropTarget}
	class:doc-tree-node--drop-invalid={isInvalidTarget}
	class:doc-tree-node--converting={isConverting}
	class:doc-tree-node--cut={isCut}
>
	<!-- Insertion line (before) -->
	{#if isDropBefore}
		<div class="doc-tree-insertion-line" style="margin-left: {indent + 8}px"></div>
	{/if}

	<!-- Node row -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={nodeElement}
		data-node-id={node.id}
		role="treeitem"
		oncontextmenu={handleContextMenu}
		onmouseenter={handleMouseEnter}
		onmousemove={handleMouseMove}
		class="doc-tree-node-row w-full flex items-center rounded-md transition-colors
			{isSelected ? 'bg-accent/15 text-foreground' : 'hover:bg-accent/5 text-foreground'}
			{isDragging ? 'opacity-40' : ''}
			{isCut ? 'opacity-50 border border-dashed border-muted-foreground' : ''}
			{isValidDropTarget ? 'bg-accent/10 outline outline-2 outline-dashed outline-accent' : ''}
			{isConverting ? 'bg-accent/20 outline-solid' : ''}"
		style="padding-left: {indent + 4}px"
	>
		<!-- Drag handle (left side only) -->
		{#if canDrag}
			<div
				role="button"
				tabindex="-1"
				onmousedown={handleDragHandleMouseDown}
				ontouchstart={handleDragHandleTouchStart}
				class="doc-tree-drag-handle flex-shrink-0 flex items-center justify-center w-5 h-7 rounded-sm transition-colors
					{dragState?.isDragging ? 'cursor-grabbing' : 'cursor-grab'}
					hover:bg-accent/10"
				aria-label="Drag to reorder"
				draggable="false"
			>
				<GripVertical class="w-3.5 h-3.5 text-muted-foreground/50" />
			</div>
		{/if}

		<!-- Clickable content area -->
		<button
			type="button"
			onclick={handleClick}
			onfocus={() => onFocus?.(node.id)}
			class="doc-tree-node-button flex-1 min-w-0 flex items-center gap-1.5 py-1.5 pr-2 text-left cursor-pointer pressable"
			draggable="false"
		>
			<!-- Expand/collapse chevron (only for folders) -->
			{#if isFolder}
				<div
					role="button"
					tabindex="0"
					onclick={handleChevronClick}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleChevronClick(e);
						}
					}}
					class="doc-tree-chevron w-4 h-4 flex items-center justify-center rounded hover:bg-accent/10 transition-colors flex-shrink-0 cursor-pointer"
					aria-label={isExpanded ? 'Collapse' : 'Expand'}
				>
					<ChevronRight
						class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 {isExpanded
							? 'rotate-90'
							: ''}"
					/>
				</div>
			{:else}
				<!-- Spacer for alignment when not a folder -->
				<span class="w-4 h-4 flex-shrink-0"></span>
			{/if}

			<!-- Icon -->
			<span class="w-4 h-4 flex items-center justify-center flex-shrink-0">
				{#if isFolder}
					{#if isExpanded}
						<FolderOpen class="w-4 h-4 text-accent" />
					{:else}
						<Folder class="w-4 h-4 text-accent" />
					{/if}
				{:else}
					<FileText class="w-4 h-4 text-muted-foreground" />
				{/if}
			</span>

			<!-- Title -->
			<span class="truncate text-sm flex-1 min-w-0">
				{node.title}
			</span>

			<!-- Content indicator - more visible -->
			{#if !isFolder && node.has_content}
				<span
					class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/10 text-accent flex-shrink-0"
					title="Has content"
				>
					<span class="w-1 h-1 rounded-full bg-accent"></span>
				</span>
			{/if}

			<!-- Converting indicator -->
			{#if isConverting}
				<span class="text-xs text-accent font-medium flex-shrink-0">Drop here</span>
			{/if}
		</button>
	</div>

	<!-- Insertion line (after) -->
	{#if isDropAfter}
		<div class="doc-tree-insertion-line" style="margin-left: {indent + 8}px"></div>
	{/if}

	<!-- Children (if expanded) -->
	{#if isFolder && isExpanded && node.children && node.children.length > 0}
		<div class="doc-tree-children" style="--tree-line-left: {indent + 16}px">
			{#each node.children as child, i (child.id)}
				{@const isLast = i === (node.children?.length ?? 0) - 1}
				<div class="doc-tree-child-wrapper" class:doc-tree-child-wrapper--last={isLast}>
					<DocTreeNode
						node={child}
						{expandedIds}
						{onToggleExpand}
						{onOpenDocument}
						{onContextMenu}
						{selectedId}
						{indentPx}
						{dragState}
						{onDragStart}
						{onDragOver}
						{onTouchStart}
						{canDrag}
						{cutNodeId}
						{onFocus}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.doc-tree-node {
		position: relative;
	}

	.doc-tree-node--dragging {
		opacity: 0.4;
	}

	.doc-tree-node--drop-invalid {
		opacity: 0.6;
	}

	.doc-tree-node--cut {
		opacity: 0.5;
	}

	.doc-tree-node--cut .doc-tree-node-row {
		border: 1px dashed hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.3);
	}

	.doc-tree-node-row {
		touch-action: none; /* Prevent scroll during touch drag */
	}

	.doc-tree-drag-handle {
		touch-action: none;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.doc-tree-node-row:hover .doc-tree-drag-handle {
		opacity: 1;
	}

	/* Always show handle when dragging */
	:global(.doc-tree-dragging) .doc-tree-drag-handle {
		opacity: 1;
	}

	.doc-tree-insertion-line {
		height: 2px;
		margin: 0 8px;
		background: hsl(var(--accent));
		border-radius: 1px;
		box-shadow: 0 0 6px hsl(var(--accent) / 0.5);
		animation: pulse-line 0.8s ease-in-out infinite alternate;
	}

	@keyframes pulse-line {
		from {
			opacity: 0.7;
		}
		to {
			opacity: 1;
		}
	}

	/* Chevron button - prevent drag from starting here */
	.doc-tree-chevron {
		touch-action: manipulation;
	}

	/* Tree connecting lines */
	.doc-tree-children {
		position: relative;
	}

	/* Vertical line connecting children */
	.doc-tree-children::before {
		content: '';
		position: absolute;
		left: var(--tree-line-left, 24px);
		top: 0;
		bottom: 12px;
		width: 1px;
		background: hsl(var(--border));
	}

	/* Horizontal connector line for each child */
	.doc-tree-child-wrapper {
		position: relative;
	}

	.doc-tree-child-wrapper::before {
		content: '';
		position: absolute;
		left: var(--tree-line-left, 24px);
		top: 14px;
		width: 8px;
		height: 1px;
		background: hsl(var(--border));
	}

	/* Hide vertical line below last child */
	.doc-tree-child-wrapper--last::after {
		content: '';
		position: absolute;
		left: var(--tree-line-left, 24px);
		top: 14px;
		bottom: 0;
		width: 1px;
		background: hsl(var(--card));
	}
</style>

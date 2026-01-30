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
	import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-svelte';
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
	}

	let {
		node,
		expandedIds,
		onToggleExpand,
		onOpenDocument,
		onContextMenu,
		selectedId = null,
		indentPx = 16,
		dragState = null,
		onDragStart,
		onDragOver,
		onTouchStart,
		canDrag = true
	}: Props = $props();

	let nodeElement: HTMLElement | null = $state(null);

	const isFolder = $derived(node.type === 'folder');
	const isExpanded = $derived(expandedIds.has(node.id));
	const isSelected = $derived(selectedId === node.id);
	const indent = $derived(node.depth * indentPx);

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
		if (isFolder) {
			onToggleExpand(node.id);
		}
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

	// Drag handlers
	function handleMouseDown(e: MouseEvent) {
		if (!canDrag || !onDragStart || e.button !== 0) return;
		// Don't start drag from chevron
		if ((e.target as HTMLElement).closest('.doc-tree-chevron')) return;
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

	function handleTouchStartEvent(e: TouchEvent) {
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
>
	<!-- Insertion line (before) -->
	{#if isDropBefore}
		<div class="doc-tree-insertion-line" style="margin-left: {indent + 8}px"></div>
	{/if}

	<!-- Node row -->
	<button
		bind:this={nodeElement}
		type="button"
		onclick={handleClick}
		oncontextmenu={handleContextMenu}
		onmousedown={handleMouseDown}
		onmouseenter={handleMouseEnter}
		onmousemove={handleMouseMove}
		ontouchstart={handleTouchStartEvent}
		class="doc-tree-node-button w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md transition-colors
			{isSelected ? 'bg-accent/15 text-foreground' : 'hover:bg-accent/5 text-foreground'}
			{isDragging ? 'opacity-40' : ''}
			{isValidDropTarget ? 'bg-accent/10 outline outline-2 outline-dashed outline-accent' : ''}
			{isConverting ? 'bg-accent/20 outline-solid' : ''}
			{canDrag && !dragState?.isDragging ? 'cursor-grab pressable' : ''}
			{dragState?.isDragging ? 'cursor-grabbing' : ''}"
		style="padding-left: {indent + 8}px"
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

		<!-- Content indicator -->
		{#if !isFolder && node.has_content}
			<span class="w-1.5 h-1.5 rounded-full bg-accent/50 flex-shrink-0" title="Has content"
			></span>
		{/if}

		<!-- Converting indicator -->
		{#if isConverting}
			<span class="text-xs text-accent font-medium flex-shrink-0">Drop here</span>
		{/if}
	</button>

	<!-- Insertion line (after) -->
	{#if isDropAfter}
		<div class="doc-tree-insertion-line" style="margin-left: {indent + 8}px"></div>
	{/if}

	<!-- Children (if expanded) -->
	{#if isFolder && isExpanded && node.children && node.children.length > 0}
		<div class="doc-tree-children">
			{#each node.children as child (child.id)}
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
				/>
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

	.doc-tree-node-button {
		touch-action: none; /* Prevent scroll during touch drag */
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
</style>

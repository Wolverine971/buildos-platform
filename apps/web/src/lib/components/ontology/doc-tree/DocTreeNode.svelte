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
	import { onDestroy } from 'svelte';
	import {
		ChevronRight,
		FileText,
		Folder,
		FolderOpen,
		Globe,
		GripVertical
	} from '$lib/icons/lucide';
	import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
	import DocTreeNode from './DocTreeNode.svelte';
	import type { DragState } from './useDragDrop.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { buildAbsolutePublicPageUrl, copyTextToClipboard } from '$lib/utils/public-page-url';
	import { getRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';

	const recentlyCreated = getRecentlyCreatedContext();

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

	async function handleCopyPublicLink(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!node.public_slug) return;
		const url = buildAbsolutePublicPageUrl({
			url_path: node.public_url_path,
			slug: node.public_slug
		});
		if (!url) return;
		const ok = await copyTextToClipboard(url);
		if (ok) {
			toastService.success('Link copied');
		} else {
			toastService.error('Failed to copy link');
		}
	}

	let nodeElement: HTMLElement | null = $state(null);

	const isFolder = $derived(node.type === 'folder');
	const isExpanded = $derived(expandedIds.has(node.id));
	const isSelected = $derived(selectedId === node.id);
	const indent = $derived(node.depth * indentPx);
	const isCut = $derived(cutNodeId === node.id);
	const justCreated = $derived(recentlyCreated?.has(node.id) ?? false);

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

	function handleContentKeydown(e: KeyboardEvent) {
		if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
		e.preventDefault();
		e.stopPropagation();
		const rect = nodeElement?.getBoundingClientRect();
		onContextMenu(
			new MouseEvent('contextmenu', {
				clientX: rect ? rect.left + Math.min(rect.width / 2, 160) : 0,
				clientY: rect ? rect.top + rect.height / 2 : 0
			}),
			node
		);
	}

	// Long-press fallback for touch: oncontextmenu does not fire reliably on iOS/Android.
	// We listen for pointerdown on touch only, start a 500ms timer, and fire the same
	// context-menu handler on completion. Movement > 8px or pointerup cancels.
	const LONG_PRESS_MS = 500;
	const LONG_PRESS_TOLERANCE_PX = 8;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressStartX = 0;
	let longPressStartY = 0;

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		// Don't start long-press if the user pressed an interactive child (drag handle, chevron, link).
		const target = e.target as HTMLElement | null;
		if (target?.closest('button, [role="button"], a')) return;
		longPressStartX = e.clientX;
		longPressStartY = e.clientY;
		clearLongPress();
		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			// PointerEvent extends MouseEvent, so positional fields (clientX/Y) are valid for the handler.
			handleContextMenu(e);
		}, LONG_PRESS_MS);
	}

	function handlePointerMove(e: PointerEvent) {
		if (e.pointerType !== 'touch' || !longPressTimer) return;
		const dx = e.clientX - longPressStartX;
		const dy = e.clientY - longPressStartY;
		if (Math.hypot(dx, dy) > LONG_PRESS_TOLERANCE_PX) {
			clearLongPress();
		}
	}

	function handlePointerEnd() {
		clearLongPress();
	}

	onDestroy(clearLongPress);

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
	<div
		bind:this={nodeElement}
		data-node-id={node.id}
		role="treeitem"
		tabindex="-1"
		aria-selected={isSelected}
		oncontextmenu={handleContextMenu}
		onmouseenter={handleMouseEnter}
		onmousemove={handleMouseMove}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerEnd}
		onpointercancel={handlePointerEnd}
		onpointerleave={handlePointerEnd}
		class="doc-tree-node-row w-full flex items-center rounded-md transition-colors
			{isSelected ? 'bg-accent/15 text-foreground' : 'hover:bg-accent/5 text-foreground'}
			{isDragging ? 'opacity-40' : ''}
			{isCut ? 'opacity-50 border border-dashed border-muted-foreground' : ''}
			{isValidDropTarget ? 'bg-accent/10 outline outline-2 outline-dashed outline-accent' : ''}
			{isConverting ? 'bg-accent/20 outline-solid' : ''}
			{justCreated ? 'entity-just-created' : ''}"
		style="padding-left: {indent + 4}px"
	>
		<!-- Drag handle (left side only) -->
		{#if canDrag}
			<button
				type="button"
				tabindex="-1"
				onmousedown={handleDragHandleMouseDown}
				ontouchstart={handleDragHandleTouchStart}
				class="doc-tree-drag-handle flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-md transition-colors motion-reduce:transition-none
					{dragState?.isDragging ? 'cursor-grabbing' : 'cursor-grab'}
					hover:bg-accent/10"
				aria-label="Drag to reorder"
				draggable="false"
			>
				<GripVertical class="w-3.5 h-3.5 text-muted-foreground/50" />
			</button>
		{/if}

		<!-- Expand/collapse is a sibling control so interactive elements never nest. -->
		{#if isFolder}
			<button
				type="button"
				class="doc-tree-chevron flex min-h-[44px] min-w-[44px] flex-shrink-0 touch-manipulation items-center justify-center rounded-md transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
				aria-label={isExpanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
				aria-expanded={isExpanded}
				onclick={handleChevronClick}
			>
				<ChevronRight
					class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none {isExpanded
						? 'rotate-90'
						: ''}"
				/>
			</button>
		{:else}
			<span class="h-11 w-11 flex-shrink-0" aria-hidden="true"></span>
		{/if}

		<!-- Clickable content area -->
		<button
			type="button"
			onclick={handleClick}
			onkeydown={handleContentKeydown}
			onfocus={() => onFocus?.(node.id)}
			class="doc-tree-node-button flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pressable"
			draggable="false"
		>
			<!-- Icon -->
			<span class="flex h-4 w-4 flex-shrink-0 items-center justify-center">
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
			<span class="min-w-0 flex-1 truncate text-sm">
				{node.title}
			</span>

			<!-- Content indicator -->
			{#if !isFolder && node.has_content}
				<span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" title="Has content">
					<span class="sr-only">Has content</span>
				</span>
			{/if}

			<!-- Converting indicator -->
			{#if isConverting}
				<span class="flex-shrink-0 text-xs font-medium text-accent">Drop here</span>
			{/if}
		</button>

		<!-- Public page indicator (tap = copy link) — sibling of the row button so nesting is valid -->
		{#if !isFolder && node.is_public}
			<button
				type="button"
				onclick={handleCopyPublicLink}
				onmousedown={(e) => e.stopPropagation()}
				ontouchstart={(e) => e.stopPropagation()}
				class="mr-1 inline-flex min-h-[44px] flex-shrink-0 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-2xs font-semibold text-success transition-colors hover:bg-success/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
				aria-label={node.public_slug
					? `Copy public link for ${node.title}`
					: 'Copy public link'}
				title={node.public_url_path
					? `Copy link: ${node.public_url_path}`
					: node.public_slug
						? `Copy link: /p/${node.public_slug}`
						: 'Copy public link'}
				draggable="false"
			>
				<Globe class="w-2.5 h-2.5" />
				Public
			</button>
		{/if}
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

	@media (prefers-reduced-motion: no-preference) {
		.doc-tree-insertion-line {
			animation: pulse-line 0.8s ease-in-out infinite alternate;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.doc-tree-node-row,
		.doc-tree-drag-handle {
			transition: none;
		}
	}
</style>

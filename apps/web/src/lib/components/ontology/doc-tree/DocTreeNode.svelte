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

	Inkprint Design:
	- Semantic color tokens
	- Pressable interactions
	- Texture classes for states
-->
<script lang="ts">
	import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-svelte';
	import type { EnrichedDocTreeNode } from '$lib/types/onto-api';
	import DocTreeNode from './DocTreeNode.svelte';

	interface Props {
		node: EnrichedDocTreeNode;
		expandedIds: Set<string>;
		onToggleExpand: (id: string) => void;
		onOpenDocument: (id: string) => void;
		onContextMenu: (e: MouseEvent, node: EnrichedDocTreeNode) => void;
		selectedId?: string | null;
		indentPx?: number;
	}

	let {
		node,
		expandedIds,
		onToggleExpand,
		onOpenDocument,
		onContextMenu,
		selectedId = null,
		indentPx = 16
	}: Props = $props();

	const isFolder = $derived(node.type === 'folder');
	const isExpanded = $derived(expandedIds.has(node.id));
	const isSelected = $derived(selectedId === node.id);
	const indent = $derived(node.depth * indentPx);

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		if (isFolder) {
			onToggleExpand(node.id);
		}
		onOpenDocument(node.id);
	}

	function handleChevronClick(e: MouseEvent) {
		e.stopPropagation();
		onToggleExpand(node.id);
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onContextMenu(e, node);
	}
</script>

<div class="doc-tree-node">
	<!-- Node row -->
	<button
		type="button"
		onclick={handleClick}
		oncontextmenu={handleContextMenu}
		class="w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md transition-colors pressable
			{isSelected ? 'bg-accent/15 text-foreground' : 'hover:bg-accent/5 text-foreground'}"
		style="padding-left: {indent + 8}px"
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
				class="w-4 h-4 flex items-center justify-center rounded hover:bg-accent/10 transition-colors flex-shrink-0 cursor-pointer"
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
	</button>

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
				/>
			{/each}
		</div>
	{/if}
</div>

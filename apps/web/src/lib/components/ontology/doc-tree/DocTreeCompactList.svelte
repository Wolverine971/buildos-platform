<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeCompactList.svelte -->
<!--
	DocTreeCompactList - Ultra-compact hierarchical document list for mobile

	Designed for high information density in the MobileCommandCenter.
	Shows hierarchical documents in a scrollable list with:
	- Depth-based indentation and font sizing (h1/h2/h3 style)
	- Folder/file icons
	- Expand/collapse for folders
	- Tap to open, context actions in row

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { ChevronRight, FileText, Folder, FolderOpen, MoreVertical, Plus } from 'lucide-svelte';
	import { enrichTreeNodes } from '$lib/services/ontology/doc-structure.service';
	import type { DocStructure, OntoDocument, EnrichedDocTreeNode } from '$lib/types/onto-api';

	interface Props {
		structure: DocStructure | null;
		documents: Record<string, OntoDocument>;
		onOpenDocument: (id: string) => void;
		onCreateDocument: (parentId?: string | null) => void;
		onContextMenu?: (docId: string, event: MouseEvent | TouchEvent) => void;
		maxVisibleDepth?: number;
		canEdit?: boolean;
	}

	let {
		structure,
		documents,
		onOpenDocument,
		onCreateDocument,
		onContextMenu,
		maxVisibleDepth = 4,
		canEdit = true
	}: Props = $props();

	// Expanded folders state
	let expandedIds = $state<Set<string>>(new Set());

	// Build enriched tree
	const enrichedTree = $derived.by(() => {
		if (!structure || !structure.root) return [];
		return enrichTreeNodes(structure.root, documents, 0, []);
	});

	// Flatten tree respecting expansion state and max depth
	const visibleItems = $derived.by(() => {
		const items: EnrichedDocTreeNode[] = [];

		function addItems(nodes: EnrichedDocTreeNode[]) {
			for (const node of nodes) {
				// Only show items within maxVisibleDepth
				if (node.depth >= maxVisibleDepth) continue;

				items.push(node);

				// Show children if folder is expanded and within depth
				if (node.type === 'folder' && expandedIds.has(node.id) && node.children) {
					addItems(node.children);
				}
			}
		}

		addItems(enrichedTree);
		return items;
	});

	// Auto-expand first level on mount (once)
	let hasAutoExpanded = $state(false);

	$effect(() => {
		if (enrichedTree.length > 0 && !hasAutoExpanded) {
			hasAutoExpanded = true;
			const toExpand = new Set<string>();
			for (const node of enrichedTree) {
				if (node.type === 'folder') {
					toExpand.add(node.id);
				}
			}
			if (toExpand.size > 0) {
				expandedIds = toExpand;
			}
		}
	});

	function toggleExpand(e: MouseEvent, nodeId: string) {
		e.stopPropagation();
		const newSet = new Set(expandedIds);
		if (newSet.has(nodeId)) {
			newSet.delete(nodeId);
		} else {
			newSet.add(nodeId);
		}
		expandedIds = newSet;
	}

	function handleItemTap(node: EnrichedDocTreeNode) {
		onOpenDocument(node.id);
	}

	function handleContextTap(e: MouseEvent | TouchEvent, nodeId: string) {
		e.stopPropagation();
		e.preventDefault();
		onContextMenu?.(nodeId, e);
	}

	// Depth-based styling
	function getDepthStyles(depth: number): { text: string; icon: string; padding: number } {
		switch (depth) {
			case 0:
				return { text: 'text-xs font-medium', icon: 'w-4 h-4', padding: 8 };
			case 1:
				return { text: 'text-xs', icon: 'w-3.5 h-3.5', padding: 20 };
			case 2:
				return { text: 'text-[11px]', icon: 'w-3 h-3', padding: 32 };
			default:
				return { text: 'text-[10px]', icon: 'w-2.5 h-2.5', padding: 40 };
		}
	}

	// Count total documents
	const documentCount = $derived(Object.keys(documents).length);
</script>

{#if documentCount === 0}
	<!-- Empty state handled by parent CommandCenterPanel -->
	<slot name="empty" />
{:else}
	<div class="doc-tree-compact">
		{#each visibleItems as node (node.id)}
			{@const styles = getDepthStyles(node.depth)}
			{@const isFolder = node.type === 'folder'}
			{@const isExpanded = expandedIds.has(node.id)}
			{@const hasChildren = isFolder && node.children && node.children.length > 0}

			<button
				type="button"
				onclick={() => handleItemTap(node)}
				class="w-full flex items-center gap-1.5 py-1.5 pr-1 text-left hover:bg-accent/5 active:bg-accent/10 transition-colors border-b border-border/30 last:border-b-0"
				style="padding-left: {styles.padding}px"
			>
				<!-- Expand/collapse chevron for folders -->
				{#if hasChildren}
					<button
						type="button"
						onclick={(e) => toggleExpand(e, node.id)}
						class="p-0.5 -ml-0.5 rounded hover:bg-accent/10 transition-colors"
						aria-label={isExpanded ? 'Collapse' : 'Expand'}
					>
						<ChevronRight
							class="{styles.icon} text-muted-foreground transition-transform duration-100 {isExpanded
								? 'rotate-90'
								: ''}"
						/>
					</button>
				{:else}
					<!-- Spacer to align non-folder items -->
					<span class="w-4 shrink-0"></span>
				{/if}

				<!-- Icon -->
				<span class="shrink-0 {isFolder ? 'text-accent' : 'text-muted-foreground'}">
					{#if isFolder}
						{#if isExpanded}
							<FolderOpen class={styles.icon} />
						{:else}
							<Folder class={styles.icon} />
						{/if}
					{:else}
						<FileText class={styles.icon} />
					{/if}
				</span>

				<!-- Title -->
				<span class="truncate flex-1 text-foreground {styles.text}">
					{node.title}
				</span>

				<!-- Content indicator -->
				{#if !isFolder && node.has_content}
					<span class="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" title="Has content"
					></span>
				{/if}

				<!-- Child count for collapsed folders -->
				{#if isFolder && !isExpanded && hasChildren}
					<span class="text-[9px] text-muted-foreground shrink-0 tabular-nums">
						{node.children?.length}
					</span>
				{/if}

				<!-- Context menu button -->
				{#if onContextMenu}
					<button
						type="button"
						onclick={(e) => handleContextTap(e, node.id)}
						class="p-1 -mr-0.5 rounded hover:bg-muted transition-colors opacity-60 hover:opacity-100"
						aria-label="More options"
					>
						<MoreVertical class="w-3 h-3 text-muted-foreground" />
					</button>
				{/if}
			</button>
		{/each}

		<!-- Quick add at root level -->
		{#if canEdit}
			<button
				type="button"
				onclick={() => onCreateDocument(null)}
				class="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[10px] text-muted-foreground hover:text-accent hover:bg-accent/5 transition-colors"
			>
				<Plus class="w-3 h-3" />
				<span>Add document</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.doc-tree-compact {
		/* Allow list to scroll within parent container */
	}
</style>

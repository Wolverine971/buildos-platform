<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeMobile.svelte -->
<!--
	Mobile document tree - Phone book / Document index style

	Features:
	- Flat list with indentation (h1/h2/h3/h4 style)
	- Breadcrumb navigation at top
	- Tap folder to drill down
	- Default: first 3 levels visible
	- Back button in breadcrumb

	Per spec: HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md #6
-->
<script lang="ts">
	import { ChevronRight, FileText, Folder, House, Plus } from 'lucide-svelte';
	import type { EnrichedDocTreeNode, OntoDocument } from '$lib/types/onto-api';
	import { enrichTreeNodes } from '$lib/services/ontology/doc-structure.service';
	import type { DocStructure } from '$lib/types/onto-api';

	interface Props {
		projectId: string;
		structure: DocStructure | null;
		documents: Record<string, OntoDocument>;
		onOpenDocument: (id: string) => void;
		onCreateDocument: (parentId?: string | null) => void;
		maxVisibleDepth?: number;
	}

	let {
		projectId,
		structure,
		documents,
		onOpenDocument,
		onCreateDocument,
		maxVisibleDepth = 3
	}: Props = $props();

	// Navigation state - stack of folder IDs we've drilled into
	let navStack = $state<string[]>([]);

	// Current folder ID (last in stack, or null for root)
	const currentFolderId = $derived(navStack.length > 0 ? navStack[navStack.length - 1] : null);

	// Build enriched tree
	const enrichedTree = $derived.by(() => {
		if (!structure || !structure.root) return [];
		return enrichTreeNodes(structure.root, documents, 0, []);
	});

	// Find current folder's children
	const currentChildren = $derived.by(() => {
		if (!currentFolderId) {
			// At root level
			return enrichedTree;
		}

		// Find the folder node
		function findNode(nodes: EnrichedDocTreeNode[], id: string): EnrichedDocTreeNode | null {
			for (const node of nodes) {
				if (node.id === id) return node;
				if (node.children) {
					const found = findNode(node.children, id);
					if (found) return found;
				}
			}
			return null;
		}

		const folder = findNode(enrichedTree, currentFolderId);
		return folder?.children || [];
	});

	// Build breadcrumb path
	const breadcrumbs = $derived.by(() => {
		const crumbs: Array<{ id: string | null; title: string }> = [
			{ id: null, title: 'Documents' }
		];

		function findNode(nodes: EnrichedDocTreeNode[], id: string): EnrichedDocTreeNode | null {
			for (const node of nodes) {
				if (node.id === id) return node;
				if (node.children) {
					const found = findNode(node.children, id);
					if (found) return found;
				}
			}
			return null;
		}

		for (const folderId of navStack) {
			const node = findNode(enrichedTree, folderId);
			if (node) {
				crumbs.push({ id: node.id, title: node.title });
			}
		}

		return crumbs;
	});

	// Navigate into a folder
	function drillDown(folderId: string) {
		navStack = [...navStack, folderId];
	}

	// Navigate to a specific breadcrumb
	function navigateTo(id: string | null) {
		if (id === null) {
			navStack = [];
		} else {
			const index = navStack.indexOf(id);
			if (index >= 0) {
				navStack = navStack.slice(0, index + 1);
			}
		}
	}

	// Handle item tap
	function handleItemTap(node: EnrichedDocTreeNode) {
		if (node.type === 'folder') {
			drillDown(node.id);
		} else {
			onOpenDocument(node.id);
		}
	}

	// Flatten visible items with depth indication
	const visibleItems = $derived.by(() => {
		const items: Array<EnrichedDocTreeNode & { displayDepth: number }> = [];

		function addItems(nodes: EnrichedDocTreeNode[], baseDepth: number) {
			for (const node of nodes) {
				items.push({ ...node, displayDepth: baseDepth });

				// If it's a folder and we're within visible depth, show children inline
				if (node.type === 'folder' && node.children && baseDepth < maxVisibleDepth - 1) {
					addItems(node.children, baseDepth + 1);
				}
			}
		}

		addItems(currentChildren, 0);
		return items;
	});
</script>

<div class="doc-tree-mobile">
	<!-- Breadcrumb navigation -->
	{#if navStack.length > 0}
		<div class="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
			{#each breadcrumbs as crumb, i (crumb.id ?? 'root')}
				{#if i > 0}
					<ChevronRight class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
				{/if}
				<button
					type="button"
					onclick={() => navigateTo(crumb.id)}
					class="text-xs font-medium whitespace-nowrap {i === breadcrumbs.length - 1
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'} transition-colors"
				>
					{#if crumb.id === null}
						<House class="w-3.5 h-3.5 inline-block" />
					{:else}
						{crumb.title}
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Document list -->
	{#if visibleItems.length === 0}
		<div class="flex flex-col items-center gap-3 px-4 py-8 text-center">
			<div class="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
				<FileText class="w-6 h-6 text-accent" />
			</div>
			<div>
				<p class="text-sm text-foreground">
					{currentFolderId ? 'This folder is empty' : 'No documents yet'}
				</p>
				<p class="text-xs text-muted-foreground mt-1">Add notes, research, or drafts</p>
			</div>
			<button
				type="button"
				onclick={() => onCreateDocument(currentFolderId)}
				class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors pressable"
			>
				<Plus class="w-4 h-4" />
				Create Document
			</button>
		</div>
	{:else}
		<ul class="divide-y divide-border/50">
			{#each visibleItems as item (item.id)}
				{@const indent = item.displayDepth}
				<li>
					<button
						type="button"
						onclick={() => handleItemTap(item)}
						class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/5 active:bg-accent/10 transition-colors"
						style="padding-left: {16 + indent * 12}px"
					>
						<!-- Icon with depth-based sizing -->
						<span
							class="flex-shrink-0 flex items-center justify-center
								{indent === 0 ? 'w-8 h-8' : indent === 1 ? 'w-7 h-7' : 'w-6 h-6'}
								rounded-lg {item.type === 'folder' ? 'bg-accent/10' : 'bg-muted/50'}"
						>
							{#if item.type === 'folder'}
								<Folder
									class="{indent === 0
										? 'w-4 h-4'
										: indent === 1
											? 'w-3.5 h-3.5'
											: 'w-3 h-3'} text-accent"
								/>
							{:else}
								<FileText
									class="{indent === 0
										? 'w-4 h-4'
										: indent === 1
											? 'w-3.5 h-3.5'
											: 'w-3 h-3'} text-muted-foreground"
								/>
							{/if}
						</span>

						<!-- Title with depth-based styling -->
						<div class="flex-1 min-w-0">
							<p
								class="truncate {indent === 0
									? 'text-base font-medium'
									: indent === 1
										? 'text-sm font-medium'
										: 'text-sm'} text-foreground"
							>
								{item.title}
							</p>
							{#if item.description && indent === 0}
								<p class="text-xs text-muted-foreground truncate mt-0.5">
									{item.description}
								</p>
							{/if}
						</div>

						<!-- Drill-down indicator for folders -->
						{#if item.type === 'folder' && item.children && item.children.length > 0}
							<ChevronRight class="w-4 h-4 text-muted-foreground flex-shrink-0" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

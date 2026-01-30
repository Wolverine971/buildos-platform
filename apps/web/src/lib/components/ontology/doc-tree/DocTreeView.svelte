<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeView.svelte -->
<!--
	DocTreeView - Main document tree container

	Features:
	- Fetches tree data from API
	- Manages expanded/collapsed state
	- Persists expansion to localStorage
	- Polls for real-time updates (30s)
	- Shows loading skeleton
	- Shows unlinked documents section
	- Context menu support

	Inkprint Design:
	- Card container with frame texture
	- Semantic color tokens
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import { FileText, RefreshCw, FolderPlus, Plus } from 'lucide-svelte';
	import DocTreeNode from './DocTreeNode.svelte';
	import DocTreeSkeleton from './DocTreeSkeleton.svelte';
	import DocTreeContextMenu from './DocTreeContextMenu.svelte';
	import UnlinkedDocuments from './UnlinkedDocuments.svelte';
	import DocTreeUpdateNotification from './DocTreeUpdateNotification.svelte';
	import { enrichTreeNodes } from '$lib/services/ontology/doc-structure.service';
	import type {
		DocStructure,
		OntoDocument,
		EnrichedDocTreeNode,
		GetDocTreeResponse
	} from '$lib/types/onto-api';

	interface Props {
		projectId: string;
		onOpenDocument: (id: string) => void;
		onCreateDocument: (parentId?: string | null) => void;
		onMoveDocument?: (id: string) => void;
		onDeleteDocument?: (id: string, hasChildren: boolean) => void;
		selectedDocumentId?: string | null;
		maxInitialDepth?: number;
		pollInterval?: number;
	}

	let {
		projectId,
		onOpenDocument,
		onCreateDocument,
		onMoveDocument,
		onDeleteDocument,
		selectedDocumentId = null,
		maxInitialDepth = 3,
		pollInterval = 30000
	}: Props = $props();

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let structure = $state<DocStructure | null>(null);
	let documents = $state<Record<string, OntoDocument>>({});
	let unlinked = $state<OntoDocument[]>([]);
	let expandedIds = $state<Set<string>>(new Set());
	let currentVersion = $state(0);
	let hasUpdate = $state(false);

	// Context menu state
	let contextMenuOpen = $state(false);
	let contextMenuPosition = $state({ x: 0, y: 0 });
	let contextMenuNode = $state<EnrichedDocTreeNode | null>(null);

	// Derived enriched tree
	const enrichedTree = $derived.by(() => {
		if (!structure || !structure.root) return [];
		return enrichTreeNodes(structure.root, documents, 0, []);
	});

	// LocalStorage key for expanded state
	const storageKey = $derived(`doc-tree-expanded-${projectId}`);

	// Load expanded state from localStorage
	function loadExpandedState() {
		if (!browser) return;
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				expandedIds = new Set(JSON.parse(stored));
			}
		} catch {
			// Ignore parse errors
		}
	}

	// Save expanded state to localStorage
	function saveExpandedState() {
		if (!browser) return;
		try {
			localStorage.setItem(storageKey, JSON.stringify([...expandedIds]));
		} catch {
			// Ignore storage errors
		}
	}

	// Auto-expand first N levels on initial load
	function autoExpandInitialLevels(nodes: EnrichedDocTreeNode[], maxDepth: number) {
		const toExpand = new Set<string>();

		function traverse(nodeList: EnrichedDocTreeNode[]) {
			for (const node of nodeList) {
				if (node.depth < maxDepth && node.type === 'folder' && node.children?.length) {
					toExpand.add(node.id);
					traverse(node.children);
				}
			}
		}

		traverse(nodes);
		return toExpand;
	}

	// Fetch tree data
	async function fetchTree(isPolling = false) {
		if (!isPolling) {
			loading = true;
		}
		error = null;

		try {
			const res = await fetch(`/api/onto/projects/${projectId}/doc-tree`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || `Failed to load document tree`);
			}

			const data: { data: GetDocTreeResponse } = await res.json();
			const newVersion = data.data.structure.version;

			// Check if structure was updated externally
			if (isPolling && currentVersion > 0 && newVersion !== currentVersion) {
				hasUpdate = true;
				return; // Don't update state, let user choose to refresh
			}

			structure = data.data.structure;
			documents = data.data.documents;
			unlinked = data.data.unlinked;
			currentVersion = newVersion;

			// On first load, set up initial expansion
			if (!isPolling && expandedIds.size === 0) {
				loadExpandedState();
				// If still empty after loading from storage, auto-expand
				if (expandedIds.size === 0) {
					const enriched = enrichTreeNodes(structure.root, documents, 0, []);
					expandedIds = autoExpandInitialLevels(enriched, maxInitialDepth);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load document tree';
		} finally {
			if (!isPolling) {
				loading = false;
			}
		}
	}

	// Toggle expand/collapse
	function toggleExpand(id: string) {
		const newSet = new Set(expandedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedIds = newSet;
		saveExpandedState();
	}

	// Handle context menu
	function handleContextMenu(e: MouseEvent, node: EnrichedDocTreeNode) {
		contextMenuPosition = { x: e.clientX, y: e.clientY };
		contextMenuNode = node;
		contextMenuOpen = true;
	}

	function closeContextMenu() {
		contextMenuOpen = false;
		contextMenuNode = null;
	}

	// Context menu actions
	function handleContextAction(action: string) {
		if (!contextMenuNode) return;

		switch (action) {
			case 'open':
				onOpenDocument(contextMenuNode.id);
				break;
			case 'create-child':
				onCreateDocument(contextMenuNode.id);
				break;
			case 'move':
				onMoveDocument?.(contextMenuNode.id);
				break;
			case 'delete':
				onDeleteDocument?.(
					contextMenuNode.id,
					contextMenuNode.type === 'folder' && !!contextMenuNode.children?.length
				);
				break;
		}

		closeContextMenu();
	}

	// Refresh after update notification
	function handleRefresh() {
		hasUpdate = false;
		fetchTree(false);
	}

	function dismissUpdate() {
		hasUpdate = false;
	}

	// Polling
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function startPolling() {
		if (pollTimer) return;
		pollTimer = setInterval(() => {
			fetchTree(true);
		}, pollInterval);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// Lifecycle
	onMount(() => {
		fetchTree();
		if (pollInterval > 0) {
			startPolling();
		}
	});

	onDestroy(() => {
		stopPolling();
	});

	// Expose refresh for parent components
	export function refresh() {
		hasUpdate = false;
		fetchTree(false);
	}
</script>

<div class="doc-tree-container">
	<!-- Update notification -->
	{#if hasUpdate}
		<DocTreeUpdateNotification onRefresh={handleRefresh} onDismiss={dismissUpdate} />
	{/if}

	<!-- Loading state -->
	{#if loading}
		<DocTreeSkeleton count={5} />
	{:else if error}
		<!-- Error state -->
		<div class="flex flex-col items-center gap-3 px-4 py-6 text-center">
			<div class="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
				<FileText class="w-5 h-5 text-destructive" />
			</div>
			<p class="text-sm text-destructive">{error}</p>
			<button
				type="button"
				onclick={() => fetchTree()}
				class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
			>
				<RefreshCw class="w-3.5 h-3.5" />
				Retry
			</button>
		</div>
	{:else if enrichedTree.length === 0 && unlinked.length === 0}
		<!-- Empty state -->
		<div class="flex flex-col items-center gap-3 px-4 py-6 bg-muted/30 tx tx-bloom tx-weak">
			<div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
				<FileText class="w-5 h-5 text-accent" />
			</div>
			<div class="text-center">
				<p class="text-sm text-foreground">No documents yet</p>
				<p class="text-xs text-muted-foreground">Add notes, research, or drafts</p>
			</div>
			<button
				type="button"
				onclick={() => onCreateDocument(null)}
				class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors pressable"
			>
				<Plus class="w-3.5 h-3.5" />
				Create Document
			</button>
		</div>
	{:else}
		<!-- Tree view -->
		<div class="doc-tree py-1">
			{#each enrichedTree as node (node.id)}
				<DocTreeNode
					{node}
					{expandedIds}
					onToggleExpand={toggleExpand}
					{onOpenDocument}
					onContextMenu={handleContextMenu}
					selectedId={selectedDocumentId}
				/>
			{/each}
		</div>

		<!-- Unlinked documents -->
		{#if unlinked.length > 0}
			<UnlinkedDocuments
				documents={unlinked}
				{onOpenDocument}
				onLinkDocument={(id) => {
					// For now, just open the document
					// TODO: Implement drag-to-link or move modal
					onOpenDocument(id);
				}}
			/>
		{/if}
	{/if}

	<!-- Context menu -->
	{#if contextMenuOpen && contextMenuNode}
		<DocTreeContextMenu
			position={contextMenuPosition}
			node={contextMenuNode}
			onAction={handleContextAction}
			onClose={closeContextMenu}
		/>
	{/if}
</div>

<style>
	.doc-tree-container {
		position: relative;
	}
</style>

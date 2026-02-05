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
	import DocTreeDragLayer from './DocTreeDragLayer.svelte';
	import { createDragDropState, type DragDropState } from './useDragDrop.svelte';
	import {
		enrichTreeNodes,
		findNodeById,
		collectDocIds
	} from '$lib/services/ontology/doc-structure.service';
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
		onDataLoaded?: (data: {
			structure: DocStructure;
			documents: Record<string, OntoDocument>;
		}) => void;
		selectedDocumentId?: string | null;
		maxInitialDepth?: number;
		pollInterval?: number;
		enableDragDrop?: boolean;
	}

	let {
		projectId,
		onOpenDocument,
		onCreateDocument,
		onMoveDocument,
		onDeleteDocument,
		onDataLoaded,
		selectedDocumentId = null,
		maxInitialDepth = 3,
		pollInterval = 30000,
		enableDragDrop = true
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

	// Tree container ref
	let treeContainerRef: HTMLElement | null = $state(null);

	// Build node lookup maps for drag-drop
	const nodeMap = $derived.by(() => {
		const map = new Map<string, EnrichedDocTreeNode>();
		function traverse(nodes: EnrichedDocTreeNode[]) {
			for (const node of nodes) {
				map.set(node.id, node);
				if (node.children) traverse(node.children);
			}
		}
		traverse(enrichedTree);
		return map;
	});

	const parentMap = $derived.by(() => {
		const map = new Map<string, string | null>();
		function traverse(nodes: EnrichedDocTreeNode[], parentId: string | null) {
			for (const node of nodes) {
				map.set(node.id, parentId);
				if (node.children) traverse(node.children, node.id);
			}
		}
		traverse(enrichedTree, null);
		return map;
	});

	const indexMap = $derived.by(() => {
		const map = new Map<string, number>();
		function traverse(nodes: EnrichedDocTreeNode[]) {
			nodes.forEach((node, index) => {
				map.set(node.id, index);
				if (node.children) traverse(node.children);
			});
		}
		traverse(enrichedTree);
		return map;
	});

	// Undo notification state
	let showUndoHint = $state(false);
	let undoHintTimeout: ReturnType<typeof setTimeout> | null = null;

	function showUndoNotification() {
		showUndoHint = true;
		if (undoHintTimeout) clearTimeout(undoHintTimeout);
		undoHintTimeout = setTimeout(() => {
			showUndoHint = false;
		}, 3000);
	}

	// Drag-drop state
	const dragDrop = $derived.by(() => {
		if (!enableDragDrop) return null;

		return createDragDropState({
			onMove: handleDragMove,
			getNodeElement: (nodeId) => {
				if (!treeContainerRef) return null;
				return treeContainerRef.querySelector(
					`[data-node-id="${nodeId}"]`
				) as HTMLElement | null;
			},
			getNodeById: (nodeId) => nodeMap.get(nodeId) ?? null,
			getParentId: (nodeId) => parentMap.get(nodeId) ?? null,
			getNodeIndex: (nodeId) => indexMap.get(nodeId) ?? 0,
			getDescendantIds: (nodeId) => {
				const node = nodeMap.get(nodeId);
				if (!node?.children) return new Set<string>();
				return collectDocIds(node.children);
			},
			getTreeContainer: () => treeContainerRef,
			onUndo: () => {
				// Refresh after undo
				fetchTree(false);
			}
		});
	});

	// Handle drag move - calls API and refreshes tree
	async function handleDragMove(
		documentId: string,
		newParentId: string | null,
		position: number
	): Promise<{ success: boolean; error?: string }> {
		try {
			const res = await fetch(`/api/onto/projects/${projectId}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: documentId,
					new_parent_id: newParentId,
					new_position: position
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				if (res.status === 409) {
					// Conflict - tree was modified
					hasUpdate = true;
					return { success: false, error: 'Tree was modified. Please refresh.' };
				}
				return { success: false, error: data.error || 'Failed to move document' };
			}

			const data = await res.json();
			// Update local state with new structure
			structure = data.data.structure;
			currentVersion = data.data.structure.version;

			// Ensure parent is expanded so moved item is visible
			if (newParentId) {
				const newSet = new Set(expandedIds);
				newSet.add(newParentId);
				expandedIds = newSet;
				saveExpandedState();
			}

			// Show undo hint
			showUndoNotification();

			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to move document';
			return { success: false, error: message };
		}
	}

	// Drag event handlers
	function handleDragStart(e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) {
		dragDrop?.handleMouseDown(e, node, element);
	}

	function handleDragOver(e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) {
		if (!dragDrop?.state.isDragging) return;
		const rect = element.getBoundingClientRect();
		dragDrop.updateDropZone(node, e.clientY, rect);
	}

	function handleTouchStart(e: TouchEvent, node: EnrichedDocTreeNode, element: HTMLElement) {
		dragDrop?.handleTouchStart(e, node, element);
	}

	// Global mouse/touch handlers for drag
	function handleGlobalMouseMove(e: MouseEvent) {
		dragDrop?.handleMouseMove(e);
	}

	function handleGlobalMouseUp(e: MouseEvent) {
		dragDrop?.handleMouseUp(e);
	}

	function handleGlobalTouchMove(e: TouchEvent) {
		dragDrop?.handleTouchMove(e);
	}

	function handleGlobalTouchEnd(e: TouchEvent) {
		dragDrop?.handleTouchEnd(e);
	}

	function handleKeyDown(e: KeyboardEvent) {
		dragDrop?.handleKeyDown(e);
	}

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

			// Notify parent of loaded data
			onDataLoaded?.({ structure: data.data.structure, documents: data.data.documents });

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

		// Add global event listeners for drag
		if (browser && enableDragDrop) {
			document.addEventListener('mousemove', handleGlobalMouseMove);
			document.addEventListener('mouseup', handleGlobalMouseUp);
			document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
			document.addEventListener('touchend', handleGlobalTouchEnd);
			document.addEventListener('touchcancel', () => dragDrop?.handleTouchCancel());
			document.addEventListener('keydown', handleKeyDown);
		}
	});

	onDestroy(() => {
		stopPolling();
		dragDrop?.cleanup();

		// Remove global event listeners
		if (browser && enableDragDrop) {
			document.removeEventListener('mousemove', handleGlobalMouseMove);
			document.removeEventListener('mouseup', handleGlobalMouseUp);
			document.removeEventListener('touchmove', handleGlobalTouchMove);
			document.removeEventListener('touchend', handleGlobalTouchEnd);
			document.removeEventListener('keydown', handleKeyDown);
		}
	});

	// Expose refresh for parent components
	export function refresh() {
		hasUpdate = false;
		fetchTree(false);
	}
</script>

<div class="doc-tree-container" bind:this={treeContainerRef}>
	<!-- Drag layer (ghost element, insertion lines) -->
	{#if enableDragDrop && dragDrop}
		<DocTreeDragLayer state={dragDrop.state} />
	{/if}

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
					dragState={dragDrop?.state ?? null}
					onDragStart={enableDragDrop ? handleDragStart : undefined}
					onDragOver={enableDragDrop ? handleDragOver : undefined}
					onTouchStart={enableDragDrop ? handleTouchStart : undefined}
					canDrag={enableDragDrop}
					cutNodeId={dragDrop?.state.cutNode?.id ?? null}
					onFocus={(nodeId) => dragDrop?.setFocusedNode(nodeId)}
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
				enableDrag={enableDragDrop}
				onDragStart={enableDragDrop ? handleDragStart : undefined}
				onTouchStart={enableDragDrop ? handleTouchStart : undefined}
				dragState={dragDrop?.state ?? null}
			/>
		{/if}

		<!-- Cut indicator -->
		{#if dragDrop?.state.cutNode}
			<div
				class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-card border border-border rounded-lg shadow-ink-strong text-sm flex items-center gap-2"
			>
				<span class="text-muted-foreground">Cut:</span>
				<span class="font-medium text-foreground">{dragDrop.state.cutNode.title}</span>
				<span class="text-xs text-muted-foreground ml-2">
					{navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘V' : 'Ctrl+V'} to paste
				</span>
				<button
					type="button"
					onclick={() => dragDrop?.clearCut()}
					class="ml-2 text-muted-foreground hover:text-foreground"
					aria-label="Cancel cut"
				>
					✕
				</button>
			</div>
		{/if}

		<!-- Undo hint -->
		{#if showUndoHint}
			<div
				class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent flex items-center gap-2 animate-fade-in"
			>
				<span>Document moved.</span>
				<button
					type="button"
					onclick={() => dragDrop?.undo()}
					class="font-medium underline underline-offset-2 hover:text-accent/80"
				>
					Undo ({navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘Z' : 'Ctrl+Z'})
				</button>
			</div>
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

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	:global(.animate-fade-in) {
		animation: fade-in 0.2s ease-out;
	}
</style>

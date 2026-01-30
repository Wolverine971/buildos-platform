<!-- apps/web/src/lib/components/ontology/doc-tree/DocMoveModal.svelte -->
<!--
	Modal for selecting a new location for a document

	Shows a tree picker with the current location highlighted
	and invalid destinations (descendants) disabled.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ChevronRight, FileText, Folder, FolderOpen, House, Loader } from 'lucide-svelte';
	import type { EnrichedDocTreeNode, OntoDocument, DocStructure } from '$lib/types/onto-api';
	import {
		enrichTreeNodes,
		collectDocIds,
		findNodeById
	} from '$lib/services/ontology/doc-structure.service';

	interface Props {
		isOpen: boolean;
		projectId: string;
		documentId: string;
		documentTitle: string;
		structure: DocStructure | null;
		documents: Record<string, OntoDocument>;
		onClose: () => void;
		onMove: (newParentId: string | null) => void;
	}

	let {
		isOpen = $bindable(false),
		projectId: _projectId,
		documentId,
		documentTitle,
		structure,
		documents,
		onClose,
		onMove
	}: Props = $props();

	// Silence unused variable warning
	void _projectId;

	let selectedParentId = $state<string | null>(null);
	let expandedIds = $state<Set<string>>(new Set());
	let moving = $state(false);

	// Build enriched tree
	const enrichedTree = $derived.by(() => {
		if (!structure || !structure.root) return [];
		return enrichTreeNodes(structure.root, documents, 0, []);
	});

	// Find document's current parent
	const currentParentId = $derived.by(() => {
		if (!structure) return null;
		const result = findNodeById(structure.root, documentId);
		return result?.parent?.id || null;
	});

	// Get all descendants of the document being moved (can't move into these)
	const disabledIds = $derived.by(() => {
		if (!structure) return new Set<string>();
		const result = findNodeById(structure.root, documentId);
		if (!result || !result.node.children) return new Set<string>([documentId]);
		const descendants = collectDocIds(result.node.children);
		descendants.add(documentId); // Can't move into itself
		return descendants;
	});

	// Reset state when opening
	$effect(() => {
		if (isOpen) {
			selectedParentId = currentParentId;
			moving = false;
			// Auto-expand path to current parent
			if (structure && currentParentId) {
				const path = getPathToNode(enrichedTree, currentParentId);
				expandedIds = new Set(path.slice(0, -1)); // Expand parents but not the target
			}
		}
	});

	function getPathToNode(nodes: EnrichedDocTreeNode[], targetId: string): string[] {
		for (const node of nodes) {
			if (node.id === targetId) return [node.id];
			if (node.children) {
				const childPath = getPathToNode(node.children, targetId);
				if (childPath.length > 0) return [node.id, ...childPath];
			}
		}
		return [];
	}

	function toggleExpand(id: string) {
		const newSet = new Set(expandedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedIds = newSet;
	}

	function selectParent(id: string | null) {
		if (id !== null && disabledIds.has(id)) return;
		selectedParentId = id;
	}

	function handleMove() {
		if (selectedParentId === currentParentId) {
			onClose();
			return;
		}

		moving = true;
		// onMove is expected to be async but we don't need to await here
		// The parent component handles the async operation
		Promise.resolve(onMove(selectedParentId)).finally(() => {
			moving = false;
		});
	}

	function handleClose() {
		if (!moving) {
			onClose();
		}
	}
</script>

<Modal bind:isOpen onClose={handleClose} title="Move Document" size="md">
	<div class="space-y-4">
		<!-- Current document info -->
		<div class="px-4 py-3 bg-muted/30 rounded-lg">
			<p class="text-xs text-muted-foreground mb-1">Moving</p>
			<p class="text-sm font-medium text-foreground flex items-center gap-2">
				<FileText class="w-4 h-4 text-accent" />
				{documentTitle}
			</p>
		</div>

		<!-- Destination picker -->
		<div class="border border-border rounded-lg max-h-[300px] overflow-y-auto">
			<!-- Root option -->
			<button
				type="button"
				onclick={() => selectParent(null)}
				class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors border-b border-border
					{selectedParentId === null ? 'bg-accent/10' : ''}"
			>
				<House class="w-4 h-4 text-muted-foreground" />
				<span class="text-sm text-foreground">Root (top level)</span>
				{#if selectedParentId === null}
					<span class="ml-auto text-xs text-accent">Selected</span>
				{/if}
			</button>

			<!-- Tree items -->
			{#each enrichedTree as node (node.id)}
				{@const isDisabled = disabledIds.has(node.id)}
				{@const isSelected = selectedParentId === node.id}
				{@const isExpanded = expandedIds.has(node.id)}
				{@const isCurrent = node.id === currentParentId}

				<div>
					<button
						type="button"
						onclick={() => (isDisabled ? null : selectParent(node.id))}
						disabled={isDisabled}
						class="w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors
							{isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent/5'}
							{isSelected ? 'bg-accent/10' : ''}"
						style="padding-left: {node.depth * 16 + 12}px"
					>
						<!-- Expand toggle for folders -->
						{#if node.type === 'folder' && node.children?.length}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								role="button"
								tabindex="0"
								onclick={(e) => {
									e.stopPropagation();
									toggleExpand(node.id);
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.stopPropagation();
										toggleExpand(node.id);
									}
								}}
								class="w-4 h-4 flex items-center justify-center rounded hover:bg-accent/10 cursor-pointer"
							>
								<ChevronRight
									class="w-3.5 h-3.5 text-muted-foreground transition-transform {isExpanded
										? 'rotate-90'
										: ''}"
								/>
							</span>
						{:else}
							<span class="w-4"></span>
						{/if}

						<!-- Icon -->
						{#if node.type === 'folder'}
							{#if isExpanded}
								<FolderOpen class="w-4 h-4 text-accent" />
							{:else}
								<Folder class="w-4 h-4 text-accent" />
							{/if}
						{:else}
							<FileText class="w-4 h-4 text-muted-foreground" />
						{/if}

						<!-- Title -->
						<span class="text-sm text-foreground truncate flex-1">{node.title}</span>

						<!-- Status indicators -->
						{#if isSelected}
							<span class="text-xs text-accent">Selected</span>
						{:else if isCurrent}
							<span class="text-xs text-muted-foreground">Current</span>
						{:else if isDisabled}
							<span class="text-xs text-muted-foreground">Invalid</span>
						{/if}
					</button>

					<!-- Children -->
					{#if isExpanded && node.children}
						{#each node.children as child (child.id)}
							{@const childDisabled = disabledIds.has(child.id)}
							{@const childSelected = selectedParentId === child.id}
							{@const childCurrent = child.id === currentParentId}

							<button
								type="button"
								onclick={() => (childDisabled ? null : selectParent(child.id))}
								disabled={childDisabled}
								class="w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors
									{childDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent/5'}
									{childSelected ? 'bg-accent/10' : ''}"
								style="padding-left: {(child.depth || 1) * 16 + 12}px"
							>
								<span class="w-4"></span>
								{#if child.type === 'folder'}
									<Folder class="w-4 h-4 text-accent" />
								{:else}
									<FileText class="w-4 h-4 text-muted-foreground" />
								{/if}
								<span class="text-sm text-foreground truncate flex-1"
									>{child.title}</span
								>
								{#if childSelected}
									<span class="text-xs text-accent">Selected</span>
								{:else if childCurrent}
									<span class="text-xs text-muted-foreground">Current</span>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={handleClose} disabled={moving}>Cancel</Button>
			<Button variant="primary" onclick={handleMove} disabled={moving}>
				{#if moving}
					<Loader class="w-4 h-4 animate-spin mr-2" />
				{/if}
				Move Here
			</Button>
		</div>
	{/snippet}
</Modal>

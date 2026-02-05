<!-- apps/web/src/lib/components/project/CommandCenterDocumentsPanel.svelte -->
<!--
	Command Center Documents Panel

	Specialized panel for documents that shows hierarchical tree structure.
	Integrates DocTreeCompactList for high-density hierarchical display.

	Falls back to flat list if doc structure isn't available.

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { ChevronDown, Plus, FileText, RefreshCw } from 'lucide-svelte';
	import { DocTreeCompactList } from '$lib/components/ontology/doc-tree';
	import type { Document } from '$lib/types/onto';
	import type { DocStructure, OntoDocument, GetDocTreeResponse } from '$lib/types/onto-api';

	interface Props {
		// Project ID for fetching tree data
		projectId: string;
		// Flat document array (fallback)
		documents: Document[];
		// Hierarchical tree data (pre-loaded from parent)
		docStructure?: DocStructure | null;
		docTreeDocuments?: Record<string, OntoDocument>;
		// Panel state
		expanded: boolean;
		partnerExpanded: boolean;
		// Callbacks
		onToggle: () => void;
		onAddDocument: (parentId?: string | null) => void;
		onEditDocument: (id: string) => void;
		onMoveDocument?: (id: string) => void;
		onDeleteDocument?: (id: string) => void;
		// Permissions
		canEdit?: boolean;
	}

	let {
		projectId,
		documents,
		docStructure,
		docTreeDocuments,
		expanded,
		partnerExpanded,
		onToggle,
		onAddDocument,
		onEditDocument,
		onMoveDocument,
		onDeleteDocument,
		canEdit = true
	}: Props = $props();

	// Local state for self-fetched tree data
	let localStructure = $state<DocStructure | null>(null);
	let localDocuments = $state<Record<string, OntoDocument>>({});
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	// Determine display mode - use provided data or locally fetched
	const effectiveStructure = $derived(docStructure ?? localStructure);
	const effectiveDocuments = $derived(
		docTreeDocuments && Object.keys(docTreeDocuments).length > 0
			? docTreeDocuments
			: localDocuments
	);
	const hasDocTree = $derived(
		effectiveStructure && effectiveDocuments && Object.keys(effectiveDocuments).length > 0
	);
	const documentCount = $derived(
		hasDocTree ? Object.keys(effectiveDocuments).length : documents.length
	);

	// Fetch tree data when expanded if we don't have it from parent
	async function fetchTreeData() {
		if (!projectId || (docStructure && docTreeDocuments)) return;

		isLoading = true;
		loadError = null;

		try {
			const res = await fetch(`/api/onto/projects/${projectId}/doc-tree`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to load documents');
			}

			const data: { data: GetDocTreeResponse } = await res.json();
			localStructure = data.data.structure;
			localDocuments = data.data.documents;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load documents';
		} finally {
			isLoading = false;
		}
	}

	// Fetch when expanded and we don't have data
	$effect(() => {
		if (expanded && !hasDocTree && !isLoading && !loadError) {
			fetchTreeData();
		}
	});

	// Context menu state
	let contextMenuDocId = $state<string | null>(null);
	let contextMenuPosition = $state({ x: 0, y: 0 });

	function handleContextMenu(docId: string, event: MouseEvent | TouchEvent) {
		const clientX = 'touches' in event ? (event.touches[0]?.clientX ?? 0) : event.clientX;
		const clientY = 'touches' in event ? (event.touches[0]?.clientY ?? 0) : event.clientY;

		contextMenuPosition = { x: clientX, y: clientY };
		contextMenuDocId = docId;
	}

	function closeContextMenu() {
		contextMenuDocId = null;
	}

	function handleContextAction(action: 'open' | 'add-child' | 'move' | 'delete') {
		if (!contextMenuDocId) return;
		const docId = contextMenuDocId;
		closeContextMenu();

		switch (action) {
			case 'open':
				onEditDocument(docId);
				break;
			case 'add-child':
				onAddDocument(docId);
				break;
			case 'move':
				onMoveDocument?.(docId);
				break;
			case 'delete':
				onDeleteDocument?.(docId);
				break;
		}
	}

	// Close context menu when clicking outside
	function handleGlobalClick(_e: MouseEvent) {
		if (contextMenuDocId) {
			closeContextMenu();
		}
	}

	// Panel width classes based on expansion state
	const panelClasses = $derived.by(() => {
		if (expanded) return 'w-full';
		if (partnerExpanded) return 'w-full order-2';
		return 'w-[calc(50%-3px)]';
	});

	function getDocumentStateColor(state: string): string {
		switch (state) {
			case 'published':
				return 'text-emerald-500';
			case 'ready':
				return 'text-sky-500';
			case 'review':
			case 'in_review':
				return 'text-amber-500';
			case 'archived':
				return 'text-muted-foreground';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<svelte:window on:click={handleGlobalClick} />

<div
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden transition-all duration-[120ms] ease-out {panelClasses}"
	class:h-14={!expanded}
>
	<!-- Panel Header (always visible) -->
	<button
		type="button"
		onclick={onToggle}
		class="w-full flex items-center justify-between px-2.5 py-2 hover:bg-accent/5 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
		aria-expanded={expanded}
	>
		<div class="flex items-center gap-2 min-w-0">
			<FileText class="w-4 h-4 shrink-0 text-sky-500" />
			<span class="text-xs font-semibold text-foreground truncate">Documents</span>
			<span class="text-[10px] text-muted-foreground shrink-0">({documentCount})</span>
		</div>
		<ChevronDown
			class="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-[120ms] {expanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	<!-- Expanded Content -->
	{#if expanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			<!-- Controls row: Add button -->
			<div
				class="flex items-center justify-end gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/30"
			>
				{#if canEdit}
					<button
						type="button"
						onclick={() => onAddDocument(null)}
						class="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/10 rounded transition-colors pressable shrink-0"
					>
						<Plus class="w-3 h-3" />
						<span>Add</span>
					</button>
				{/if}
			</div>

			<!-- Document list (scrollable) -->
			<div class="max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
				{#if isLoading}
					<!-- Loading state -->
					<div class="px-2.5 py-4 flex items-center justify-center gap-2">
						<RefreshCw class="w-3.5 h-3.5 text-muted-foreground animate-spin" />
						<span class="text-xs text-muted-foreground">Loading...</span>
					</div>
				{:else if loadError}
					<!-- Error state -->
					<div class="px-2.5 py-3 text-center">
						<p class="text-xs text-destructive mb-2">{loadError}</p>
						<button
							type="button"
							onclick={fetchTreeData}
							class="text-[10px] text-accent hover:underline"
						>
							Try again
						</button>
					</div>
				{:else if documentCount === 0}
					<div class="px-2.5 py-4 text-center">
						<p class="text-xs text-muted-foreground">Add notes and research</p>
					</div>
				{:else if hasDocTree}
					<!-- Hierarchical tree view -->
					<DocTreeCompactList
						structure={effectiveStructure!}
						documents={effectiveDocuments}
						onOpenDocument={onEditDocument}
						onCreateDocument={onAddDocument}
						onContextMenu={handleContextMenu}
						{canEdit}
						maxVisibleDepth={4}
					/>
				{:else}
					<!-- Flat list fallback -->
					{#each documents as doc (doc.id)}
						<button
							type="button"
							onclick={() => onEditDocument(doc.id)}
							class="w-full px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable border-b border-border/50 last:border-b-0"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="text-xs text-foreground truncate">{doc.title}</span>
								<span
									class="text-[10px] capitalize shrink-0 {getDocumentStateColor(
										doc.state_key
									)}">{doc.state_key}</span
								>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Context Menu Portal -->
{#if contextMenuDocId}
	<div
		class="fixed z-[100] bg-card border border-border rounded-lg shadow-ink-strong overflow-hidden min-w-[140px]"
		style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px; transform: translate(-50%, -100%);"
		role="menu"
	>
		<div class="py-1">
			<button
				type="button"
				onclick={() => handleContextAction('open')}
				class="w-full px-3 py-2 text-xs text-left hover:bg-accent/10 transition-colors"
				role="menuitem"
			>
				Open
			</button>
			{#if canEdit}
				<button
					type="button"
					onclick={() => handleContextAction('add-child')}
					class="w-full px-3 py-2 text-xs text-left hover:bg-accent/10 transition-colors"
					role="menuitem"
				>
					Add child document
				</button>
				{#if onMoveDocument}
					<button
						type="button"
						onclick={() => handleContextAction('move')}
						class="w-full px-3 py-2 text-xs text-left hover:bg-accent/10 transition-colors"
						role="menuitem"
					>
						Move to...
					</button>
				{/if}
				<div class="my-1 border-t border-border"></div>
				{#if onDeleteDocument}
					<button
						type="button"
						onclick={() => handleContextAction('delete')}
						class="w-full px-3 py-2 text-xs text-left text-destructive hover:bg-destructive/10 transition-colors"
						role="menuitem"
					>
						Delete
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}

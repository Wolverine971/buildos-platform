<!-- apps/web/src/lib/components/project/ProjectDocumentsSection.svelte -->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { preloadEntityModal } from '$lib/attachments/preload-entity-modal';
	import { ChevronDown, FileText, Plus } from '$lib/icons/lucide';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';
	import { DocTreeView } from '$lib/components/ontology/doc-tree';
	import FreshnessBadge from '$lib/components/project/freshness/FreshnessBadge.svelte';
	import InheritedDocsShelf from '$lib/components/project/InheritedDocsShelf.svelte';
	import type { ProjectFamilyV1 } from '@buildos/shared-types';
	import { getProjectFreshnessContext } from '$lib/components/project/freshness/freshness-context.svelte';
	import type { Document } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';

	let {
		projectId,
		documents,
		canEdit,
		documentsExpanded = true,
		activeDocumentId,
		onToggleExpanded = () => {},
		onCreateDocument,
		onOpenDocument,
		onMoveDocument,
		onDeleteDocument,
		onDataLoaded,
		onTreeRefChange,
		initialStructure = null,
		initialDocuments = {},
		initialUnlinked = [],
		initialArchived = [],
		maxInitialDepth = 3,
		pollInterval = 30000,
		variant = 'collapsible',
		family = null,
		onOpenInheritedDocument,
		onCopyInheritedDocument
	}: {
		projectId: string;
		documents: Document[];
		canEdit: boolean;
		documentsExpanded?: boolean;
		activeDocumentId: string | null;
		onToggleExpanded?: () => void;
		onCreateDocument: (parentId?: string | null) => void;
		onOpenDocument: (docId: string) => void;
		onMoveDocument?: ((docId: string) => void) | undefined;
		onDeleteDocument?: ((docId: string, hasChildren: boolean) => void) | undefined;
		onDataLoaded: (data: {
			structure: DocStructure;
			documents: Record<string, OntoDocument>;
			unlinked?: OntoDocument[];
			archived?: OntoDocument[];
		}) => void;
		onTreeRefChange?: ((ref: { refresh: () => void } | null) => void) | undefined;
		initialStructure?: DocStructure | null;
		initialDocuments?: Record<string, OntoDocument>;
		initialUnlinked?: OntoDocument[];
		initialArchived?: OntoDocument[];
		maxInitialDepth?: number;
		pollInterval?: number;
		variant?: 'collapsible' | 'workspace';
		/** Hierarchy: the parent's shared shelf (child) and the own shared folder (parent). */
		family?: ProjectFamilyV1 | null;
		onOpenInheritedDocument?: (docId: string) => void;
		onCopyInheritedDocument?: (docId: string) => Promise<void>;
	} = $props();

	const inheritedParent = $derived(family?.parent ?? null);
	const inheritedDocs = $derived(inheritedParent ? (family?.shelf ?? []) : []);
	const sharedFolderId = $derived(
		(family?.child_count ?? 0) > 0 ? (family?.own_shared_folder_document_id ?? null) : null
	);

	let docTreeViewRef = $state<{ refresh: () => void } | null>(null);

	// Freshness radar (Tasker 88): flagged documents surface above the tree.
	const freshness = getProjectFreshnessContext();
	const flaggedDocuments = $derived.by(() => {
		if (!freshness) return [];
		const byId = new Map(documents.map((document) => [document.id, document]));
		return freshness
			.flaggedIds('document')
			.map((documentId) => byId.get(documentId))
			.filter((document): document is Document => Boolean(document));
	});

	$effect(() => {
		onTreeRefChange?.(docTreeViewRef);
	});
</script>

{#snippet freshnessStrip()}
	{#if flaggedDocuments.length > 0}
		<details class="group border-b border-border">
			<summary
				class="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
			>
				<ChevronDown class="h-3.5 w-3.5 shrink-0 -rotate-90 group-open:rotate-0" />
				Review documents that may be out of date
			</summary>
			<ul
				class="space-y-1 border-b border-border px-3 py-2 sm:px-4"
				aria-label="Documents that may be out of date"
			>
				{#each flaggedDocuments as document (document.id)}
					<li class="flex min-w-0 items-center gap-2">
						<button
							type="button"
							class="-ml-2 inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onclick={() => onOpenDocument(document.id)}
						>
							<FileText
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="truncate">{document.title}</span>
						</button>
						<FreshnessBadge kind="document" id={document.id} class="ml-auto shrink-0" />
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}

{#snippet documentTree()}
	{#if inheritedParent && onOpenInheritedDocument && onCopyInheritedDocument}
		<InheritedDocsShelf
			parentName={inheritedParent.name}
			docs={inheritedDocs}
			canCopy={canEdit}
			onOpenDocument={onOpenInheritedDocument}
			onCopyDocument={onCopyInheritedDocument}
		/>
	{/if}
	{@render freshnessStrip()}
	<DocTreeView
		bind:this={docTreeViewRef}
		{projectId}
		{canEdit}
		{onOpenDocument}
		{onCreateDocument}
		{onMoveDocument}
		{onDeleteDocument}
		{onDataLoaded}
		{initialStructure}
		{initialDocuments}
		{initialUnlinked}
		{initialArchived}
		{maxInitialDepth}
		{pollInterval}
		enableDragDrop={canEdit}
		selectedDocumentId={activeDocumentId}
		{sharedFolderId}
		sharedCount={family?.child_count ?? 0}
	/>
{/snippet}

<section
	{@attach preloadEntityModal('document')}
	class="overflow-hidden {variant === 'workspace'
		? 'border-y border-border bg-card/40'
		: 'rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak'}"
	aria-label={variant === 'workspace' ? 'Project document tree' : undefined}
>
	{#if variant === 'collapsible'}
		<div class="flex items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
			<button
				type="button"
				onclick={onToggleExpanded}
				class="flex min-h-[44px] flex-1 items-center gap-2 rounded-lg px-1 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
			>
				<FileText class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<div>
					<p class="text-sm font-medium text-foreground">Documents</p>
					<p class="text-xs text-muted-foreground">
						{documents.length}
						{documents.length === 1 ? 'document' : 'documents'}
					</p>
				</div>
			</button>
			<div class="flex items-center gap-1 sm:gap-2">
				{#if canEdit}
					<button
						type="button"
						onclick={() => onCreateDocument(null)}
						class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
						aria-label="Add document"
					>
						<Plus class="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
					</button>
				{/if}
				<button
					type="button"
					onclick={onToggleExpanded}
					class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
					aria-label={documentsExpanded ? 'Collapse documents' : 'Expand documents'}
				>
					<ChevronDown
						class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-[120ms] motion-reduce:transition-none sm:h-4 sm:w-4 {documentsExpanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
			</div>
		</div>
	{/if}

	{#if variant === 'workspace'}
		<div class="min-h-[420px]">
			{@render documentTree()}
		</div>
	{:else if documentsExpanded}
		<div class="border-t border-border" transition:slide={slideMotion(120)}>
			{@render documentTree()}
		</div>
	{/if}
</section>

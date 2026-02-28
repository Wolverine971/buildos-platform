<!-- apps/web/src/lib/components/project/ProjectDocumentsSection.svelte -->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { ChevronDown, FileText, Plus } from 'lucide-svelte';
	import { DocTreeView } from '$lib/components/ontology/doc-tree';
	import type { Document } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';

	let {
		projectId,
		documents,
		canEdit,
		documentsExpanded,
		activeDocumentId,
		onToggleExpanded,
		onCreateDocument,
		onOpenDocument,
		onMoveDocument,
		onDeleteDocument,
		onDataLoaded,
		onTreeRefChange
	}: {
		projectId: string;
		documents: Document[];
		canEdit: boolean;
		documentsExpanded: boolean;
		activeDocumentId: string | null;
		onToggleExpanded: () => void;
		onCreateDocument: (parentId?: string | null) => void;
		onOpenDocument: (docId: string) => void;
		onMoveDocument?: ((docId: string) => void) | undefined;
		onDeleteDocument?: ((docId: string, hasChildren: boolean) => void) | undefined;
		onDataLoaded: (data: {
			structure: DocStructure;
			documents: Record<string, OntoDocument>;
		}) => void;
		onTreeRefChange?: ((ref: { refresh: () => void } | null) => void) | undefined;
	} = $props();

	let docTreeViewRef: { refresh: () => void } | null = null;

	$effect(() => {
		onTreeRefChange?.(docTreeViewRef);
	});
</script>

<section
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<div class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
		<button
			onclick={onToggleExpanded}
			class="flex items-center gap-2 flex-1 text-left hover:bg-muted/60 rounded-lg transition-colors pressable"
		>
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
			>
				<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
			</div>
			<div>
				<p class="text-xs sm:text-sm font-semibold text-foreground">Documents</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{documents.length}
					{documents.length === 1 ? 'document' : 'documents'}
				</p>
			</div>
		</button>
		<div class="flex items-center gap-1 sm:gap-2">
			{#if canEdit}
				<button
					onclick={() => onCreateDocument(null)}
					class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
					aria-label="Add document"
				>
					<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
				</button>
			{/if}
			<button
				onclick={onToggleExpanded}
				class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
				aria-label={documentsExpanded ? 'Collapse documents' : 'Expand documents'}
			>
				<ChevronDown
					class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {documentsExpanded
						? 'rotate-180'
						: ''}"
				/>
			</button>
		</div>
	</div>

	{#if documentsExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			<DocTreeView
				bind:this={docTreeViewRef}
				{projectId}
				{onOpenDocument}
				{onCreateDocument}
				{onMoveDocument}
				{onDeleteDocument}
				{onDataLoaded}
				selectedDocumentId={activeDocumentId}
			/>
		</div>
	{/if}
</section>

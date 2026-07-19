<!-- apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte -->
<!--
	Shows orphaned documents not in the tree structure

	These documents exist in the database but aren't
	linked into the hierarchical tree.

	Supports dragging documents into the tree.
-->
<script lang="ts">
	import { ChevronDown, FileQuestion, GripVertical } from '$lib/icons/lucide';
	import type { OntoDocument, EnrichedDocTreeNode } from '$lib/types/onto-api';
	import type { DragState } from './useDragDrop.svelte';

	interface Props {
		documents: OntoDocument[];
		onOpenDocument: (id: string) => void;
		// Drag support
		enableDrag?: boolean;
		onDragStart?: (e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		onTouchStart?: (e: TouchEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		dragState?: DragState | null;
	}

	let {
		documents,
		onOpenDocument,
		enableDrag = false,
		onDragStart,
		onTouchStart,
		dragState = null
	}: Props = $props();

	let expanded = $state(false);

	// Convert OntoDocument to EnrichedDocTreeNode for drag operations
	function toEnrichedNode(doc: OntoDocument): EnrichedDocTreeNode {
		return {
			id: doc.id,
			title: doc.title,
			description: doc.description ?? null,
			children: undefined,
			type: 'doc',
			order: 0,
			depth: 0,
			path: [],
			has_content: doc.has_content === true || !!doc.content,
			state_key: doc.state_key ?? 'active',
			type_key: doc.type_key ?? 'document',
			created_at: doc.created_at ?? new Date().toISOString(),
			updated_at: doc.updated_at ?? new Date().toISOString(),
			is_public: false,
			public_slug: null,
			public_url_path: null,
			public_status: 'not_public'
		};
	}

	// Track which document is being dragged
	const isDraggingUnlinked = $derived(
		dragState?.isDragging && documents.some((doc) => doc.id === dragState?.draggedNode?.id)
	);
</script>

{#if documents.length > 0}
	<div class="mt-3 border-t border-border pt-3">
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
			aria-expanded={expanded}
			aria-controls="unlinked-document-list"
		>
			<FileQuestion class="w-3.5 h-3.5" />
			<span>Unlinked documents ({documents.length})</span>
			<ChevronDown
				class="ml-auto h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none {expanded
					? 'rotate-180'
					: ''}"
			/>
		</button>

		{#if expanded}
			<div id="unlinked-document-list" class="mt-1 space-y-0.5 pl-2">
				{#each documents as doc (doc.id)}
					{@const isBeingDragged = dragState?.draggedNode?.id === doc.id}
					<div
						class="group flex min-w-0 items-center gap-1"
						class:opacity-40={isBeingDragged}
					>
						{#if enableDrag}
							<button
								type="button"
								onmousedown={(e) => {
									if (e.button !== 0) return;
									const target = e.currentTarget as HTMLElement;
									const parent = target.parentElement;
									if (parent && onDragStart) {
										onDragStart(e, toEnrichedNode(doc), parent);
									}
								}}
								ontouchstart={(e) => {
									const target = e.currentTarget as HTMLElement;
									const parent = target.parentElement;
									if (parent && onTouchStart) {
										onTouchStart(e, toEnrichedNode(doc), parent);
									}
								}}
								class="inline-flex min-h-[44px] min-w-[44px] cursor-grab items-center justify-center rounded-md text-muted-foreground/50 transition-opacity hover:bg-muted/50 hover:text-muted-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100"
								title="Drag to tree"
								aria-label="Drag {doc.title} to the document tree"
							>
								<GripVertical class="w-3.5 h-3.5" />
							</button>
						{/if}
						<button
							type="button"
							onclick={() => onOpenDocument(doc.id)}
							class="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
						>
							<FileQuestion class="h-3.5 w-3.5 shrink-0 text-warning" />
							<span class="min-w-0 truncate">{doc.title}</span>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

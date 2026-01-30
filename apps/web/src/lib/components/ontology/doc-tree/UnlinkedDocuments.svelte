<!-- apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte -->
<!--
	Shows orphaned documents not in the tree structure

	These documents exist in the database but aren't
	linked into the hierarchical tree.

	Supports dragging documents into the tree.
-->
<script lang="ts">
	import { FileQuestion, Link2, GripVertical } from 'lucide-svelte';
	import type { OntoDocument, EnrichedDocTreeNode } from '$lib/types/onto-api';
	import type { DragState } from './useDragDrop.svelte';

	interface Props {
		documents: OntoDocument[];
		onOpenDocument: (id: string) => void;
		onLinkDocument: (id: string) => void;
		// Drag support
		enableDrag?: boolean;
		onDragStart?: (e: MouseEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		onTouchStart?: (e: TouchEvent, node: EnrichedDocTreeNode, element: HTMLElement) => void;
		dragState?: DragState | null;
	}

	let {
		documents,
		onOpenDocument,
		onLinkDocument,
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
			has_content: !!doc.content,
			state_key: doc.state_key ?? 'active',
			type_key: doc.type_key ?? 'document',
			created_at: doc.created_at ?? new Date().toISOString(),
			updated_at: doc.updated_at ?? new Date().toISOString()
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
			class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
		>
			<FileQuestion class="w-3.5 h-3.5" />
			<span>Unlinked Documents ({documents.length})</span>
			<span
				class="ml-auto text-[10px] transform transition-transform {expanded
					? 'rotate-180'
					: ''}"
			>
				▼
			</span>
		</button>

		{#if expanded}
			<div class="mt-1 space-y-0.5 pl-2">
				{#each documents as doc (doc.id)}
					{@const isBeingDragged = dragState?.draggedNode?.id === doc.id}
					<div class="flex items-center gap-1 group" class:opacity-40={isBeingDragged}>
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
								class="p-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
								title="Drag to tree"
							>
								<GripVertical class="w-3.5 h-3.5" />
							</button>
						{/if}
						<button
							type="button"
							onclick={() => onOpenDocument(doc.id)}
							class="flex-1 flex items-center gap-2 px-2 py-1.5 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-accent/5 rounded-md transition-colors"
						>
							<FileQuestion class="w-3.5 h-3.5 text-warning" />
							<span class="truncate">{doc.title}</span>
						</button>
						<button
							type="button"
							onclick={() => onLinkDocument(doc.id)}
							title="Link to tree"
							class="p-1.5 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded transition-colors"
						>
							<Link2 class="w-3.5 h-3.5" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

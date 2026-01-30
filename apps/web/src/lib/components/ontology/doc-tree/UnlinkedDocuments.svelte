<!-- apps/web/src/lib/components/ontology/doc-tree/UnlinkedDocuments.svelte -->
<!--
	Shows orphaned documents not in the tree structure

	These documents exist in the database but aren't
	linked into the hierarchical tree.
-->
<script lang="ts">
	import { FileQuestion, Link2 } from 'lucide-svelte';
	import type { OntoDocument } from '$lib/types/onto-api';

	interface Props {
		documents: OntoDocument[];
		onOpenDocument: (id: string) => void;
		onLinkDocument: (id: string) => void;
	}

	let { documents, onOpenDocument, onLinkDocument }: Props = $props();

	let expanded = $state(false);
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
					<div class="flex items-center gap-1">
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

<!-- apps/web/src/lib/components/project/InheritedDocsShelf.svelte -->
<!--
	Shelf above a sub-project's document tree: the docs its parent keeps in
	"Shared with sub-projects". Read-only here; Open shows the parent's copy and
	"Copy here" makes this project's own copy. Hidden when the shelf is empty.
	Modeled on DocTreeImageShelf.
-->
<script lang="ts">
	import { Copy, FileText, LoaderCircle, Share2 } from '$lib/icons/lucide';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import type { ProjectFamilyShelfDocV1 } from '@buildos/shared-types';

	const PREVIEW_COUNT = 5;

	interface Props {
		parentName: string;
		docs: ProjectFamilyShelfDocV1[];
		canCopy: boolean;
		onOpenDocument: (documentId: string) => void;
		onCopyDocument: (documentId: string) => Promise<void>;
	}

	let { parentName, docs, canCopy, onOpenDocument, onCopyDocument }: Props = $props();

	let showAll = $state(false);
	let copyingId = $state<string | null>(null);

	const visibleDocs = $derived(showAll ? docs : docs.slice(0, PREVIEW_COUNT));
	const ownerName = $derived(parentName || 'the parent project');

	async function copyDocument(documentId: string) {
		if (copyingId) return;
		copyingId = documentId;
		try {
			await onCopyDocument(documentId);
		} finally {
			copyingId = null;
		}
	}
</script>

{#if docs.length > 0}
	<section
		class="border-b border-border px-1 pb-2 pt-1 tx tx-thread tx-weak"
		aria-labelledby="inherited-docs-heading"
	>
		<div class="flex min-h-[44px] min-w-0 items-center gap-2 px-2">
			<Share2 class="h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
			<h3 id="inherited-docs-heading" class="flex min-w-0 items-baseline gap-1.5">
				<span class="micro-label shrink-0">From</span>
				<span class="min-w-0 truncate text-xs font-semibold text-foreground"
					>{ownerName}</span
				>
			</h3>
			<span class="stamp shrink-0 text-2xs text-muted-foreground">· {docs.length}</span>
			<span class="ml-auto hidden text-2xs text-muted-foreground sm:inline">
				Shared with its sub-projects
			</span>
		</div>

		<ul class="space-y-0.5" aria-label={`Documents shared by ${ownerName}`}>
			{#each visibleDocs as doc (doc.id)}
				<li class="flex min-w-0 items-center gap-1">
					<button
						type="button"
						onclick={() => onOpenDocument(doc.id)}
						class="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left transition-colors hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
						style:padding-left="{8 + Math.min(doc.depth, 4) * 16}px"
						title={doc.description || doc.title}
					>
						<FileText
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span class="min-w-0 flex-1 truncate text-sm text-foreground">
							{doc.title || 'Untitled'}
						</span>
						{#if doc.updated_at}
							<time
								datetime={doc.updated_at}
								class="stamp hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline"
							>
								<span class="sr-only">Updated </span>{formatRelativeTime(
									doc.updated_at
								)}
							</time>
						{/if}
					</button>
					{#if canCopy}
						<button
							type="button"
							onclick={() => void copyDocument(doc.id)}
							disabled={copyingId !== null}
							class="mr-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none pressable"
							aria-label={`Copy ${doc.title || 'document'} into this project`}
							title="Copy into this project"
						>
							{#if copyingId === doc.id}
								<LoaderCircle
									class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{:else}
								<Copy class="h-3.5 w-3.5" aria-hidden="true" />
							{/if}
							<span class="hidden sm:inline">Copy here</span>
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if docs.length > PREVIEW_COUNT}
			<button
				type="button"
				onclick={() => (showAll = !showAll)}
				aria-expanded={showAll}
				class="mt-0.5 flex min-h-[44px] w-full items-center justify-center rounded-md px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
			>
				{showAll ? 'Show fewer' : `Show all ${docs.length}`}
			</button>
		{/if}
	</section>
{/if}

<!-- apps/web/src/lib/components/ontology/doc-tree/DocTreeImageShelf.svelte -->
<!--
	Images shelf at the top of the document tree.

	Holds every project image that is not filed under a document, so an image
	attached in chat is visible the moment it is uploaded. Filed images render
	under their document in the tree instead.
-->
<script lang="ts">
	import { ImagePlus, Images } from '$lib/icons/lucide';
	import { treeImageThumbnailUrl, treeImageTitle, type DocTreeImage } from './tree-images';

	interface Props {
		images: DocTreeImage[];
		/** Images filed under documents; only used for the empty-shelf message. */
		filedCount: number;
		canEdit: boolean;
		onOpenImage: (imageId: string) => void;
		onAddImage: () => void;
	}

	let { images, filedCount, canEdit, onOpenImage, onAddImage }: Props = $props();

	const totalCount = $derived(images.length + filedCount);
</script>

<section class="border-b border-border px-1 pb-2 pt-1" aria-label="Project images">
	<div class="flex min-h-[44px] items-center gap-2 px-2">
		<Images class="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
		<h3 class="micro-label text-muted-foreground">Images</h3>
		{#if totalCount > 0}
			<span class="text-2xs tabular-nums text-muted-foreground">{totalCount}</span>
		{/if}
		{#if canEdit}
			<button
				type="button"
				onclick={onAddImage}
				class="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
			>
				<ImagePlus class="h-3.5 w-3.5" aria-hidden="true" />
				Add image
			</button>
		{/if}
	</div>

	{#if images.length > 0}
		<ul class="flex gap-2 overflow-x-auto px-2 pb-1" aria-label="Images not in a document">
			{#each images as image (image.id)}
				{@const title = treeImageTitle(image)}
				<li class="w-24 shrink-0">
					<button
						type="button"
						onclick={() => onOpenImage(image.id)}
						class="group block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
						aria-label={`Open image ${title}`}
						{title}
					>
						<span
							class="block aspect-square overflow-hidden rounded-lg border border-border bg-muted/40 p-1 shadow-ink transition-colors group-hover:border-accent/60 motion-reduce:transition-none"
						>
							<img
								src={treeImageThumbnailUrl(image.id, 192)}
								alt={image.alt_text ?? ''}
								loading="lazy"
								decoding="async"
								class="h-full w-full rounded object-contain"
							/>
						</span>
						<span
							class="mt-1 block truncate px-0.5 text-2xs text-muted-foreground group-hover:text-foreground"
						>
							{title}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="px-2 pb-1 text-xs text-muted-foreground">
			{filedCount > 0
				? 'Every image is filed under a document below.'
				: 'Images you attach in chat land here.'}
		</p>
	{/if}
</section>

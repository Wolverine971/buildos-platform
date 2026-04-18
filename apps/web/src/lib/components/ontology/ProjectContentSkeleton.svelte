<!-- apps/web/src/lib/components/ontology/ProjectContentSkeleton.svelte -->
<!--
	ProjectContentSkeleton - Loading state for main content area

	Mirrors the ProjectDocumentsSection header structure exactly (same texture,
	icon radius, and label layout) so hydration doesn't shift the UI. The body
	reproduces the tree-indented skeleton rows from DocTreeSkeleton, which is
	what DocTreeView renders while it fetches.

	Usage:
	<ProjectContentSkeleton documentCount={2} canEdit={true} />
-->
<script lang="ts">
	import { ChevronDown, FileText, Plus } from 'lucide-svelte';

	interface Props {
		documentCount: number;
		canEdit?: boolean;
	}

	let { documentCount, canEdit = false }: Props = $props();

	// Mock varied indentation so the loading tree reads like a real tree.
	const items = $derived(
		Array.from({ length: Math.min(Math.max(documentCount, 1), 5) }, (_, i) => ({
			indent: i === 0 ? 0 : i === 1 ? 0 : i === 2 ? 1 : i === 3 ? 1 : 2,
			width: 45 + ((i * 13) % 35) // deterministic 45-80% width
		}))
	);
</script>

<div class="min-w-0 space-y-2 sm:space-y-4">
	<!-- Documents Section Skeleton - matches ProjectDocumentsSection structure -->
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		aria-busy="true"
		aria-label="Loading documents"
	>
		<div class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
			<div class="flex items-center gap-2 flex-1 min-w-0">
				<div
					class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
				>
					<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
				</div>
				<div class="min-w-0">
					<p class="text-xs sm:text-sm font-semibold text-foreground">Documents</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground">
						{documentCount}
						{documentCount === 1 ? 'document' : 'documents'}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1 sm:gap-2">
				{#if canEdit}
					<div class="p-1 sm:p-1.5 rounded-md">
						<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground/60" />
					</div>
				{/if}
				<div class="p-1 sm:p-1.5 rounded-md">
					<ChevronDown
						class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground rotate-180"
					/>
				</div>
			</div>
		</div>

		<!-- Body - matches DocTreeView's loading state (DocTreeSkeleton) -->
		<div class="border-t border-border">
			{#if documentCount === 0}
				<div
					class="flex flex-col items-center gap-3 px-4 py-6 bg-muted/30 tx tx-bloom tx-weak"
				>
					<div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
						<FileText class="w-5 h-5 text-accent/60" />
					</div>
					<div class="text-center space-y-1.5">
						<div class="h-3.5 w-28 rounded bg-muted animate-pulse mx-auto"></div>
						<div class="h-3 w-40 rounded bg-muted/70 animate-pulse mx-auto"></div>
					</div>
				</div>
			{:else}
				<div class="space-y-1 py-2 px-2">
					{#each items as item, i}
						<div
							class="flex items-center gap-2 py-1.5"
							style="padding-left: {item.indent * 16 + 8}px"
						>
							<!-- Chevron placeholder -->
							<div class="w-4 h-4 rounded bg-muted/50 animate-pulse"></div>
							<!-- Icon placeholder -->
							<div class="w-4 h-4 rounded bg-muted/50 animate-pulse"></div>
							<!-- Title placeholder -->
							<div
								class="h-4 rounded bg-muted/50 animate-pulse"
								style="width: {item.width}%; animation-delay: {i * 50}ms"
							></div>
						</div>
					{/each}
					{#if documentCount > 5}
						<div
							class="px-2 py-1 text-[10px] sm:text-xs text-muted-foreground text-center"
						>
							+{documentCount - 5} more…
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>
</div>

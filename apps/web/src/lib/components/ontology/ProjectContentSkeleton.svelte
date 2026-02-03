<!-- apps/web/src/lib/components/ontology/ProjectContentSkeleton.svelte -->
<!--
	ProjectContentSkeleton - Loading state for main content area

	Shows skeleton cards for Documents section while data loads.
	Matches exact dimensions to prevent layout shift during hydration.

	Uses Inkprint tokens:
	- Consistent rounded-lg radius (no responsive escalation)
	- tx-pulse texture for loading state
	- Proper border-border and bg-card tokens

	Usage:
	<ProjectContentSkeleton documentCount={2} />
-->
<script lang="ts">
	import { FileText, Sparkles, ChevronDown } from 'lucide-svelte';

	interface Props {
		documentCount: number;
	}

	let { documentCount }: Props = $props();
</script>

<div class="min-w-0 space-y-2 sm:space-y-4">
	<!-- Documents Section Skeleton -->
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-pulse tx-weak overflow-hidden"
	>
		<div class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
			<div class="flex items-center gap-2 sm:gap-3 flex-1">
				<div
					class="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-accent/10 flex items-center justify-center"
				>
					<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
				</div>
				<div>
					<p
						class="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1"
					>
						Documents
						<span
							class="inline-flex items-center gap-0.5 text-muted-foreground font-normal"
						>
							<span
								class="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent/60 animate-pulse"
							></span>
							<span>({documentCount})</span>
						</span>
					</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
						Loading {documentCount === 1 ? 'document' : 'documents'}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1 sm:gap-2">
				<div class="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-muted animate-pulse"></div>
				<ChevronDown class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground rotate-180" />
			</div>
		</div>

		<div class="border-t border-border">
			{#if documentCount === 0}
				<div
					class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-muted tx tx-bloom tx-weak"
				>
					<div
						class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center"
					>
						<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
					</div>
					<div>
						<p class="text-xs sm:text-sm text-foreground">No documents yet</p>
						<p class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
							Add research or drafts
						</p>
					</div>
				</div>
			{:else}
				<ul class="divide-y divide-border/80">
					{#each Array(Math.min(documentCount, 5)) as _, i}
						<li class="animate-pulse" style="animation-delay: {i * 75}ms">
							<div class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3">
								<div
									class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-muted flex-shrink-0"
								></div>
								<div class="flex-1 space-y-1.5 sm:space-y-2">
									<div class="h-3 sm:h-4 rounded bg-muted w-2/3"></div>
									<div
										class="h-2.5 sm:h-3 rounded bg-muted w-1/4 hidden sm:block"
									></div>
								</div>
								<div class="h-4 sm:h-5 w-8 sm:w-12 rounded-full bg-muted"></div>
							</div>
						</li>
					{/each}
					{#if documentCount > 5}
						<li
							class="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs text-muted-foreground text-center"
						>
							+{documentCount - 5} more...
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	</section>
</div>

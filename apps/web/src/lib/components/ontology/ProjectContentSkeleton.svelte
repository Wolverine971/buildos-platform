<!-- apps/web/src/lib/components/ontology/ProjectContentSkeleton.svelte -->
<!--
	ProjectContentSkeleton - Loading state for main content area

	Shows skeleton cards for Outputs and Documents sections while data loads.
	Matches exact dimensions to prevent layout shift during hydration.

	Usage:
	<ProjectContentSkeleton
		outputCount={3}
		documentCount={2}
	/>
-->
<script lang="ts">
	import { Layers, FileText, Sparkles, ChevronDown } from 'lucide-svelte';

	interface Props {
		outputCount: number;
		documentCount: number;
	}

	let { outputCount, documentCount }: Props = $props();
</script>

<div class="min-w-0 space-y-4">
	<!-- Outputs Section Skeleton -->
	<section
		class="bg-card border border-border rounded-xl shadow-ink tx tx-pulse tx-weak overflow-hidden"
	>
		<div class="flex items-center justify-between gap-3 px-4 py-3">
			<div class="flex items-center gap-3 flex-1">
				<div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
					<Layers class="w-4 h-4 text-foreground" />
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Outputs</p>
					<p class="text-xs text-muted-foreground flex items-center gap-1">
						<span class="inline-block w-2 h-2 rounded-full bg-accent/60 animate-pulse"
						></span>
						<span
							>Loading {outputCount}
							{outputCount === 1 ? 'deliverable' : 'deliverables'}</span
						>
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-6 h-6 rounded-md bg-muted animate-pulse"></div>
				<ChevronDown class="w-4 h-4 text-muted-foreground rotate-180" />
			</div>
		</div>

		<div class="border-t border-border">
			{#if outputCount === 0}
				<div class="flex items-center gap-3 px-4 py-4 bg-muted/30 tx tx-bloom tx-weak">
					<div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
						<Sparkles class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm text-foreground">No outputs yet</p>
						<p class="text-xs text-muted-foreground">Create one to start delivering</p>
					</div>
				</div>
			{:else}
				<ul class="divide-y divide-border/80">
					{#each Array(Math.min(outputCount, 5)) as _, i}
						<li class="animate-pulse" style="animation-delay: {i * 75}ms">
							<div class="flex items-center gap-3 px-4 py-3">
								<div class="w-8 h-8 rounded-lg bg-muted flex-shrink-0"></div>
								<div class="flex-1 space-y-2">
									<div class="h-4 rounded bg-muted w-2/3"></div>
									<div class="h-3 rounded bg-muted/70 w-1/4"></div>
								</div>
								<div class="h-5 w-14 rounded-full bg-muted"></div>
							</div>
						</li>
					{/each}
					{#if outputCount > 5}
						<li class="px-4 py-2 text-xs text-muted-foreground text-center">
							+{outputCount - 5} more loading...
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	</section>

	<!-- Documents Section Skeleton -->
	<section
		class="bg-card border border-border rounded-xl shadow-ink tx tx-pulse tx-weak overflow-hidden"
	>
		<div class="flex items-center justify-between gap-3 px-4 py-3">
			<div class="flex items-center gap-3 flex-1">
				<div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
					<FileText class="w-4 h-4 text-foreground" />
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Documents</p>
					<p class="text-xs text-muted-foreground flex items-center gap-1">
						<span class="inline-block w-2 h-2 rounded-full bg-accent/60 animate-pulse"
						></span>
						<span
							>Loading {documentCount}
							{documentCount === 1 ? 'document' : 'documents'}</span
						>
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-6 h-6 rounded-md bg-muted animate-pulse"></div>
				<ChevronDown class="w-4 h-4 text-muted-foreground rotate-180" />
			</div>
		</div>

		<div class="border-t border-border">
			{#if documentCount === 0}
				<div class="flex items-center gap-3 px-4 py-4 bg-muted/30 tx tx-bloom tx-weak">
					<div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
						<Sparkles class="w-4 h-4 text-accent" />
					</div>
					<div>
						<p class="text-sm text-foreground">No documents yet</p>
						<p class="text-xs text-muted-foreground">Add research or drafts</p>
					</div>
				</div>
			{:else}
				<ul class="divide-y divide-border/80">
					{#each Array(Math.min(documentCount, 5)) as _, i}
						<li class="animate-pulse" style="animation-delay: {i * 75}ms">
							<div class="flex items-center gap-3 px-4 py-3">
								<div class="w-8 h-8 rounded-lg bg-muted flex-shrink-0"></div>
								<div class="flex-1 space-y-2">
									<div class="h-4 rounded bg-muted w-2/3"></div>
									<div class="h-3 rounded bg-muted/70 w-1/4"></div>
								</div>
								<div class="h-5 w-12 rounded-full bg-muted"></div>
							</div>
						</li>
					{/each}
					{#if documentCount > 5}
						<li class="px-4 py-2 text-xs text-muted-foreground text-center">
							+{documentCount - 5} more loading...
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	</section>
</div>

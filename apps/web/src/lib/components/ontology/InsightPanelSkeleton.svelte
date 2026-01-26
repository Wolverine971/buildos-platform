<!-- apps/web/src/lib/components/ontology/InsightPanelSkeleton.svelte -->
<!--
	InsightPanelSkeleton - REFACTORED with proper Inkprint spacing

	Loading state for insight panels with:
	- Consistent spacing (px-3 py-2.5 for items, p-4 for header)
	- Proper border radius (rounded-lg)
	- Entity-specific texture (tx-pulse for loading)
	- High information density

	CHANGES FROM ORIGINAL:
	- Removed responsive padding (px-3 sm:px-4 → px-4)
	- Removed responsive radius (rounded-lg sm:rounded-xl → rounded-lg)
	- Simplified skeleton item spacing
	- Fixed icon sizing (w-4 h-4 consistent)
-->
<script lang="ts">
	import { ChevronDown, type Icon as LucideIcon } from 'lucide-svelte';

	interface Props {
		icon: typeof LucideIcon;
		label: string;
		count: number;
		description?: string;
		expanded?: boolean;
		class?: string;
	}

	let {
		icon: Icon,
		label,
		count,
		description,
		expanded = false,
		class: className = ''
	}: Props = $props();

	const itemLabel = count === 1 ? 'item' : 'items';
</script>

<div
	class="bg-card border border-border rounded-lg shadow-ink tx tx-pulse tx-weak overflow-hidden {className}"
>
	<!-- Header - matches EntityListItem spacing -->
	<div
		class="flex items-center justify-between gap-3 px-4 py-3"
		aria-busy="true"
		aria-label="Loading {label}"
	>
		<div class="flex items-center gap-3 flex-1 min-w-0">
			<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
				<Icon class="w-4 h-4 text-accent" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground flex items-center gap-1.5">
					{label}
					<span class="inline-flex items-center gap-1 text-muted-foreground font-normal">
						<span class="inline-block w-2 h-2 rounded-full bg-accent/60 animate-pulse"
						></span>
						<span>({count})</span>
					</span>
				</p>
				{#if description}
					<p class="text-xs text-muted-foreground">{description}</p>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<!-- Skeleton add button -->
			<div class="w-6 h-6 rounded-md bg-muted/50"></div>
			<ChevronDown
				class="w-4 h-4 text-muted-foreground transition-transform {expanded
					? 'rotate-180'
					: ''}"
			/>
		</div>
	</div>

	<!-- Expanded content -->
	{#if expanded}
		<div class="border-t border-border">
			<!-- Filter/sort controls placeholder -->
			<div class="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
				<div class="h-8 w-24 rounded-lg bg-muted animate-pulse"></div>
				<div class="h-8 w-24 rounded-lg bg-muted animate-pulse"></div>
			</div>

			<!-- Skeleton list items -->
			<div class="divide-y divide-border/80">
				{#each Array(Math.min(count, 3)) as _, i}
					<div
						class="flex items-center gap-3 px-3 py-2.5 animate-pulse"
						style="animation-delay: {i * 100}ms"
					>
						<div class="w-4 h-4 rounded-full bg-muted shrink-0"></div>
						<div class="flex-1 min-w-0 space-y-1.5">
							<div class="h-3.5 rounded bg-muted w-3/4"></div>
							<div class="h-3 rounded bg-muted/70 w-1/3"></div>
						</div>
					</div>
				{/each}
				{#if count > 3}
					<div class="px-4 py-2 text-xs text-muted-foreground text-center">
						+{count - 3} more...
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

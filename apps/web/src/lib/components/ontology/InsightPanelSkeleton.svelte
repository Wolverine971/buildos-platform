<!-- apps/web/src/lib/components/ontology/InsightPanelSkeleton.svelte -->
<!--
	InsightPanelSkeleton - Loading state for insight panels

	Used during project page skeleton rendering to show loading state
	with count information while full data loads.

	Features:
	- Matches exact dimensions of real InsightPanel to prevent layout shift
	- Shows entity count during loading ("Loading 5 tasks...")
	- Animated pulse effect for loading indication
	- Supports collapsed (default) state matching real panel

	Usage:
	<InsightPanelSkeleton
		icon={ListChecks}
		label="Tasks"
		count={5}
		description="What needs to move"
	/>
-->
<script lang="ts">
	import { ChevronDown, Target } from 'lucide-svelte';

	interface Props {
		/** Icon component to display */
		icon: typeof Target;
		/** Panel label (e.g., "Tasks", "Goals") */
		label: string;
		/** Number of items loading */
		count: number;
		/** Optional description text */
		description?: string;
		/** Whether panel is expanded (shows skeleton list items) */
		expanded?: boolean;
		/** Additional classes */
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
	class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-pulse tx-weak overflow-hidden {className}"
>
	<!-- Header - matches real panel header exactly -->
	<div
		class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3"
		aria-busy="true"
		aria-label="Loading {label}"
	>
		<div class="flex items-center gap-2 sm:gap-3 flex-1">
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-muted flex items-center justify-center"
			>
				<Icon class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
			</div>
			<div class="min-w-0">
				<p class="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1">
					{label}
					<span
						class="inline-flex items-center gap-0.5 text-muted-foreground font-normal"
					>
						<span
							class="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent/60 animate-pulse"
						></span>
						<span>({count})</span>
					</span>
				</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
					{#if description}
						{description}
					{/if}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-1 sm:gap-2">
			<!-- Skeleton add button placeholder -->
			<div class="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-muted/50"></div>
			<ChevronDown
				class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform {expanded
					? 'rotate-180'
					: ''}"
			/>
		</div>
	</div>

	<!-- Expanded content with skeleton list items -->
	{#if expanded}
		<div class="border-t border-border">
			<!-- Skeleton list items -->
			<div class="divide-y divide-border/80">
				{#each Array(Math.min(count, 3)) as _, i}
					<div
						class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 animate-pulse"
						style="animation-delay: {i * 100}ms"
					>
						<div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-muted"></div>
						<div class="flex-1 space-y-1.5 sm:space-y-2">
							<div class="h-3 sm:h-4 rounded bg-muted w-3/4"></div>
							<div
								class="h-2.5 sm:h-3 rounded bg-muted/70 w-1/3 hidden sm:block"
							></div>
						</div>
					</div>
				{/each}
				{#if count > 3}
					<div
						class="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs text-muted-foreground text-center"
					>
						+{count - 3} more...
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

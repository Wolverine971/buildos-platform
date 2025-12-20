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
	import type { Component } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';

	interface Props {
		/** Icon component to display */
		icon: Component;
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
	class="bg-card border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden {className}"
>
	<!-- Header - matches real panel header exactly -->
	<div
		class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
		aria-busy="true"
		aria-label="Loading {label}"
	>
		<div class="flex items-start gap-3">
			<div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
				<svelte:component this={Icon} class="w-4 h-4 text-foreground" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">
					{label}
				</p>
				<p class="text-xs text-muted-foreground flex items-center gap-1">
					<span class="inline-flex items-center gap-1">
						<span class="inline-block w-2 h-2 rounded-full bg-accent/60 animate-pulse"
						></span>
						<span>Loading {count} {itemLabel}</span>
					</span>
					{#if description}
						<span>· {description}</span>
					{/if}
				</p>
			</div>
		</div>
		<ChevronDown
			class="w-4 h-4 text-muted-foreground transition-transform {expanded
				? 'rotate-180'
				: ''}"
		/>
	</div>

	<!-- Expanded content with skeleton list items -->
	{#if expanded}
		<div class="border-t border-border">
			<!-- Section header skeleton -->
			<div class="flex items-center justify-between px-4 pt-3 pb-2">
				<div class="h-3 w-12 rounded bg-muted animate-pulse"></div>
				<div class="h-6 w-20 rounded bg-muted animate-pulse"></div>
			</div>

			<!-- Skeleton list items -->
			<div class="divide-y divide-border/80">
				{#each Array(Math.min(count, 3)) as _, i}
					<div
						class="flex items-center gap-3 px-4 py-3 animate-pulse"
						style="animation-delay: {i * 100}ms"
					>
						<div class="w-4 h-4 rounded-full bg-muted"></div>
						<div class="flex-1 space-y-2">
							<div class="h-4 rounded bg-muted w-3/4"></div>
							<div class="h-3 rounded bg-muted/70 w-1/3"></div>
						</div>
					</div>
				{/each}
				{#if count > 3}
					<div class="px-4 py-2 text-xs text-muted-foreground text-center">
						+{count - 3} more loading...
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

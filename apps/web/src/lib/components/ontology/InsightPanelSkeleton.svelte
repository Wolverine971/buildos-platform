<!-- apps/web/src/lib/components/ontology/InsightPanelSkeleton.svelte -->
<!--
	InsightPanelSkeleton — loading state for insight-rail panels.

	Mirrors the header structure of the loaded ProjectInsightRail panel exactly
	(same texture, padding, gap, Plus + ChevronDown button footprints) so the
	hydration transition doesn't shift. Accepts `iconStyles` to match the
	per-panel color (amber/indigo/etc.) used by `getPanelIconStyles` on the
	project page.
-->
<script lang="ts">
	import { ChevronDown, Plus, type Icon as LucideIcon } from 'lucide-svelte';

	interface Props {
		icon: typeof LucideIcon;
		label: string;
		count: number;
		description?: string;
		expanded?: boolean;
		iconStyles?: string;
		canEdit?: boolean;
		class?: string;
	}

	let {
		icon: Icon,
		label,
		count,
		description,
		expanded = false,
		iconStyles = 'bg-accent/10 text-accent',
		canEdit = false,
		class: className = ''
	}: Props = $props();
</script>

<div
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden {className}"
>
	<!-- Header - matches the loaded ProjectInsightRail panel header exactly -->
	<div
		class="flex items-center justify-between gap-2 px-3 py-2.5"
		aria-busy="true"
		aria-label="Loading {label}"
	>
		<div class="flex items-center gap-3 flex-1 min-w-0">
			<div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 {iconStyles}">
				<Icon class="w-4 h-4" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground">
					{label}
					<span class="text-muted-foreground font-normal">({count})</span>
				</p>
				{#if description}
					<p class="text-xs text-muted-foreground">{description}</p>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-1.5 shrink-0">
			{#if canEdit}
				<div class="p-1.5 rounded-md">
					<Plus class="w-4 h-4 text-muted-foreground/60" />
				</div>
			{/if}
			<div class="p-1.5 rounded-md">
				<ChevronDown
					class="w-4 h-4 text-muted-foreground transition-transform {expanded
						? 'rotate-180'
						: ''}"
				/>
			</div>
		</div>
	</div>

	<!-- Expanded content -->
	{#if expanded}
		<div class="border-t border-border">
			<!-- Filter/sort controls placeholder -->
			<div class="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
				<div class="h-6 w-20 rounded-md bg-muted animate-pulse"></div>
				<div class="h-6 w-20 rounded-md bg-muted animate-pulse"></div>
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

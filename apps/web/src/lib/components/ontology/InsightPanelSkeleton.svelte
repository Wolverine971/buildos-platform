<!-- apps/web/src/lib/components/ontology/InsightPanelSkeleton.svelte -->
<!--
	InsightPanelSkeleton — pixel-parity loading state for insight-rail panels.

	Mirrors the loaded ProjectInsightRail panel down to the element types
	(button wrappers, aria-expanded) and class lists so hydration does not
	shift pixels or restyle text. Accepts `iconStyles` to match the per-panel
	color (amber/indigo/…/red) used by `getPanelIconStyles` on the project
	page, and `canEdit` to mirror the Plus button footprint.
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
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak {className}"
	aria-busy="true"
	aria-label="Loading {label}"
>
	<!-- Header — matches ProjectInsightRail.svelte loaded branch 1:1 -->
	<div class="flex items-center justify-between gap-2 px-3 py-2.5">
		<button
			type="button"
			disabled
			class="flex items-center gap-3 flex-1 text-left min-w-0 pressable cursor-default"
			aria-expanded={expanded}
		>
			<div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 {iconStyles}">
				<Icon class="w-4 h-4" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">
					{label}
					<span class="text-muted-foreground font-normal">({count})</span>
				</p>
				{#if description}
					<p class="text-xs text-muted-foreground">{description}</p>
				{/if}
			</div>
		</button>
		<div class="flex items-center gap-1.5 shrink-0">
			{#if canEdit}
				<button
					type="button"
					disabled
					class="p-1.5 rounded-md pressable cursor-default"
					aria-label="Add {label.toLowerCase()}"
				>
					<Plus class="w-4 h-4 text-muted-foreground" />
				</button>
			{/if}
			<button
				type="button"
				disabled
				class="p-1.5 rounded-md pressable cursor-default"
				aria-label={expanded
					? `Collapse ${label.toLowerCase()}`
					: `Expand ${label.toLowerCase()}`}
			>
				<ChevronDown
					class="w-4 h-4 text-muted-foreground transition-transform duration-[120ms] {expanded
						? 'rotate-180'
						: ''}"
				/>
			</button>
		</div>
	</div>

	<!-- Expanded body — matches loaded filter/sort row + item list footprint -->
	{#if expanded}
		<div class="border-t border-border">
			<!-- Filter/sort controls placeholder -->
			<div class="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
				<div class="h-6 w-20 rounded-md bg-muted animate-pulse"></div>
				<div class="h-6 w-20 rounded-md bg-muted animate-pulse"></div>
			</div>

			<!-- Skeleton list items -->
			<ul class="divide-y divide-border/80">
				{#each Array(Math.min(count, 3)) as _, i}
					<li
						class="flex items-center gap-3 px-3 py-2.5 animate-pulse"
						style="animation-delay: {i * 100}ms"
					>
						<div class="w-4 h-4 rounded-full bg-muted shrink-0"></div>
						<div class="flex-1 min-w-0 space-y-1.5">
							<div class="h-3.5 rounded bg-muted w-3/4"></div>
							<div class="h-3 rounded bg-muted/70 w-1/3"></div>
						</div>
					</li>
				{/each}
				{#if count > 3}
					<li class="px-4 py-2 text-xs text-muted-foreground text-center">
						+{count - 3} more…
					</li>
				{/if}
			</ul>
		</div>
	{/if}
</div>

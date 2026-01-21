<!-- apps/web/src/lib/components/admin/AdminCollapsibleSection.svelte -->
<!--
	Collapsible Section Component for Admin Dashboard

	Mobile command center style - compact, high information density.
	Collapses by default on mobile, expands on desktop.

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import type { ComponentType, Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown } from 'lucide-svelte';

	interface Props {
		title: string;
		subtitle?: string;
		icon?: ComponentType;
		iconColor?: string;
		badge?: string | number | null;
		badgeColor?: 'default' | 'success' | 'warning' | 'danger';
		// Default collapsed state - can vary by screen size
		defaultExpanded?: boolean;
		// Force always expanded (disable collapse)
		alwaysExpanded?: boolean;
		children: Snippet;
	}

	let {
		title,
		subtitle = '',
		icon: Icon,
		iconColor = 'text-muted-foreground',
		badge = null,
		badgeColor = 'default',
		defaultExpanded = false,
		alwaysExpanded = false,
		children
	}: Props = $props();

	let expanded = $state(defaultExpanded);

	function toggle() {
		if (!alwaysExpanded) {
			expanded = !expanded;
		}
	}

	const badgeColors = {
		default: 'bg-muted text-foreground',
		success: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
		warning: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
		danger: 'bg-red-500/20 text-red-600 dark:text-red-400'
	};
</script>

<div
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<!-- Section Header -->
	<button
		type="button"
		onclick={toggle}
		disabled={alwaysExpanded}
		class="
			w-full flex items-center justify-between
			px-3 py-2.5 sm:px-4 sm:py-3
			hover:bg-accent/5 transition-colors
			{alwaysExpanded ? 'cursor-default' : 'pressable'}
			focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset
		"
		aria-expanded={expanded || alwaysExpanded}
	>
		<div class="flex items-center gap-2 min-w-0">
			{#if Icon}
				<Icon class="w-4 h-4 shrink-0 {iconColor}" />
			{/if}
			<div class="flex items-baseline gap-2 min-w-0">
				<span class="text-sm font-semibold text-foreground truncate">{title}</span>
				{#if subtitle}
					<span class="text-[10px] text-muted-foreground hidden sm:inline">
						{subtitle}
					</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			{#if badge !== null && badge !== undefined}
				<span
					class="rounded px-1.5 py-0.5 text-[10px] font-semibold {badgeColors[badgeColor]}"
				>
					{badge}
				</span>
			{/if}
			{#if !alwaysExpanded}
				<ChevronDown
					class="w-4 h-4 text-muted-foreground transition-transform duration-150 {expanded
						? 'rotate-180'
						: ''}"
				/>
			{/if}
		</div>
	</button>

	<!-- Expanded Content -->
	{#if expanded || alwaysExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 150 }}>
			{@render children()}
		</div>
	{/if}
</div>

<!-- apps/web/src/lib/components/project/CommandCenterPanel.svelte -->
<!--
	Command Center Panel Component

	Ultra-compact panel for the mobile command center layout.
	Displays entity count in collapsed state and item list when expanded.
	Supports optional filter/sort controls when panelConfig is provided.

	Documentation:
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Inkprint Design System: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import type { ComponentType, Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, Plus } from 'lucide-svelte';
	import type { PanelConfig, InsightPanelState } from '$lib/components/ontology/insight-panels';
	import {
		InsightFilterDropdown,
		InsightSortDropdown,
		InsightSpecialToggles
	} from '$lib/components/ontology/insight-panels';

	// Note: 'milestones' removed - now nested under goals
	type PanelKey = 'goals' | 'tasks' | 'plans' | 'risks' | 'documents' | 'events';

	interface Props {
		panelKey: PanelKey;
		label: string;
		icon: ComponentType;
		iconColor: string;
		count: number;
		expanded: boolean;
		partnerExpanded: boolean;
		onToggle: (key: PanelKey) => void;
		onAdd: () => void;
		emptyMessage: string;
		children: Snippet;
		// Standalone panels take full width always (no partner)
		fullWidth?: boolean;
		// Optional filter/sort props
		panelConfig?: PanelConfig;
		panelState?: InsightPanelState;
		toggleCounts?: Record<string, number>;
		onFilterChange?: (filters: Record<string, string[]>) => void;
		onSortChange?: (sort: { field: string; direction: 'asc' | 'desc' }) => void;
		onToggleChange?: (toggleId: string, value: boolean) => void;
	}

	let {
		panelKey,
		label,
		icon: Icon,
		iconColor,
		count,
		expanded,
		partnerExpanded,
		onToggle,
		onAdd,
		emptyMessage,
		children,
		fullWidth = false,
		panelConfig,
		panelState,
		toggleCounts = {},
		onFilterChange,
		onSortChange,
		onToggleChange
	}: Props = $props();

	// Check if filter/sort controls should be shown
	const hasControls = $derived(
		panelConfig && panelState && onFilterChange && onSortChange && onToggleChange
	);

	// Panel width classes based on expansion state
	// fullWidth panels always take full width (standalone panels like Goals)
	const panelClasses = $derived.by(() => {
		if (fullWidth) return 'w-full';
		if (expanded) return 'w-full';
		if (partnerExpanded) return 'w-full order-2';
		return 'w-[calc(50%-3px)]';
	});
</script>

<div
	class="
		bg-card border border-border rounded-lg shadow-ink
		tx tx-frame tx-weak overflow-hidden
		transition-all duration-[120ms] ease-out
		{panelClasses}
		{expanded ? '' : 'h-[52px]'}
	"
>
	<!-- Panel Header (always visible) -->
	<button
		type="button"
		onclick={() => onToggle(panelKey)}
		class="
			w-full flex items-center justify-between
			px-2.5 py-2
			hover:bg-accent/5 transition-colors pressable
			focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset
		"
		aria-expanded={expanded}
	>
		<div class="flex items-center gap-2 min-w-0">
			<Icon class="w-4 h-4 shrink-0 {iconColor}" />
			<span class="text-xs font-semibold text-foreground truncate">{label}</span>
			<span class="text-[10px] text-muted-foreground shrink-0">({count})</span>
		</div>
		<ChevronDown
			class="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-[120ms] {expanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	<!-- Expanded Content -->
	{#if expanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			<!-- Controls row: Filter/Sort + Add button -->
			<div
				class="flex items-center justify-between gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/30"
			>
				<!-- Filter/Sort controls (left side) -->
				{#if hasControls && panelConfig && panelState && onFilterChange && onSortChange}
					<div class="flex items-center gap-1">
						<InsightFilterDropdown
							filterGroups={panelConfig.filters}
							activeFilters={panelState.filters}
							onchange={onFilterChange}
						/>
						<InsightSortDropdown
							sortOptions={panelConfig.sorts}
							currentSort={panelState.sort}
							onchange={onSortChange}
						/>
					</div>
				{:else}
					<div></div>
				{/if}

				<!-- Add button (right side) -->
				<button
					type="button"
					onclick={onAdd}
					class="
						flex items-center gap-1 px-2 py-1
						text-[10px] font-medium text-accent
						hover:bg-accent/10 rounded transition-colors
						pressable shrink-0
					"
				>
					<Plus class="w-3 h-3" />
					<span>Add</span>
				</button>
			</div>

			<!-- Item list (scrollable) -->
			<div class="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
				{#if count === 0}
					<div class="px-2.5 py-4 text-center">
						<p class="text-xs text-muted-foreground">{emptyMessage}</p>
					</div>
				{:else}
					{@render children()}
				{/if}
			</div>

			<!-- Special toggles (show completed, deleted, etc.) -->
			{#if hasControls && panelConfig && panelState && onToggleChange}
				<InsightSpecialToggles
					toggles={panelConfig.specialToggles}
					values={panelState.toggles}
					counts={toggleCounts}
					onchange={onToggleChange}
				/>
			{/if}
		</div>
	{/if}
</div>

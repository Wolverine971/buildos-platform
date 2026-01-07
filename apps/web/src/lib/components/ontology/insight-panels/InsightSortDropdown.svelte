<!-- apps/web/src/lib/components/ontology/insight-panels/InsightSortDropdown.svelte -->
<!--
	InsightSortDropdown.svelte

	A single-select sort dropdown with direction toggle for insight panels.
	Follows Inkprint design system with semantic colors and textures.
-->
<script lang="ts">
	import { ArrowUp, ArrowDown, ChevronDown, Check } from 'lucide-svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { SortOption } from './insight-panel-config';

	// Props
	let {
		sortOptions,
		currentSort,
		onchange
	}: {
		sortOptions: SortOption[];
		currentSort: { field: string; direction: 'asc' | 'desc' };
		onchange: (sort: { field: string; direction: 'asc' | 'desc' }) => void;
	} = $props();

	// Local state
	let isOpen = $state(false);
	let dropdownRef = $state<HTMLDivElement>();

	// Get current sort label
	let currentSortLabel = $derived(
		sortOptions.find((s) => s.field === currentSort.field)?.label || 'Sort'
	);

	// Close on click outside
	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Close on escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			isOpen = false;
		}
	}

	function selectSort(field: string) {
		const option = sortOptions.find((s) => s.field === field);
		if (option) {
			// If same field, toggle direction
			if (field === currentSort.field) {
				onchange({
					field,
					direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
				});
			} else {
				// New field, use its default direction
				onchange({
					field,
					direction: option.defaultDirection
				});
			}
		}
		isOpen = false;
	}

	function toggleDirection(e: MouseEvent) {
		e.stopPropagation();
		onchange({
			field: currentSort.field,
			direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
		});
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="relative" bind:this={dropdownRef}>
	<!-- Trigger Button -->
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			isOpen = !isOpen;
		}}
		class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md
			bg-muted/50 hover:bg-muted border border-border
			text-muted-foreground hover:text-foreground
			transition-colors pressable
			{isOpen ? 'ring-1 ring-accent/50 bg-muted' : ''}"
		aria-expanded={isOpen}
		aria-haspopup="listbox"
	>
		<span class="truncate max-w-20">{currentSortLabel}</span>

		<!-- Direction indicator (clickable to toggle) -->
		<span
			role="button"
			tabindex={0}
			onclick={toggleDirection}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleDirection(e as unknown as MouseEvent);
				}
			}}
			class="p-0.5 -mr-0.5 rounded hover:bg-accent/20 transition-colors cursor-pointer"
			title="Toggle sort direction"
			aria-label={currentSort.direction === 'asc' ? 'Ascending' : 'Descending'}
		>
			{#if currentSort.direction === 'asc'}
				<ArrowUp class="w-3 h-3 text-accent" />
			{:else}
				<ArrowDown class="w-3 h-3 text-accent" />
			{/if}
		</span>

		<ChevronDown
			class="w-3 h-3 transition-transform duration-150 {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div
			class="absolute left-0 top-full mt-1 z-50 w-40
				bg-card border border-border rounded-lg shadow-ink-strong
				tx tx-frame tx-weak overflow-hidden"
			transition:scale={{ duration: 150, easing: quintOut, start: 0.95 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					isOpen = false;
				}
			}}
			role="listbox"
			tabindex="-1"
			aria-label="Sort options"
		>
			<div class="py-1">
				{#each sortOptions as option}
					{@const isSelected = option.field === currentSort.field}
					<button
						type="button"
						onclick={() => selectSort(option.field)}
						class="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left
							hover:bg-muted/50 transition-colors
							{isSelected ? 'bg-accent/10' : ''}"
						role="option"
						aria-selected={isSelected}
					>
						<span
							class="text-xs {isSelected
								? 'text-foreground font-medium'
								: 'text-muted-foreground'}"
						>
							{option.label}
						</span>

						{#if isSelected}
							<div class="flex items-center gap-1">
								{#if currentSort.direction === 'asc'}
									<ArrowUp class="w-3 h-3 text-accent" />
								{:else}
									<ArrowDown class="w-3 h-3 text-accent" />
								{/if}
								<Check class="w-3 h-3 text-accent" />
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

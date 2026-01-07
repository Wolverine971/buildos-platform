<!-- apps/web/src/lib/components/ontology/insight-panels/InsightFilterDropdown.svelte -->
<!--
	InsightFilterDropdown.svelte

	A lightweight multi-select filter dropdown for insight panels.
	Follows Inkprint design system with semantic colors and textures.
-->
<script lang="ts">
	import { Filter, Check, ChevronDown, X } from 'lucide-svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { FilterGroup } from './insight-panel-config';

	// Props
	let {
		filterGroups,
		activeFilters = {},
		onchange
	}: {
		filterGroups: FilterGroup[];
		activeFilters: Record<string, string[]>;
		onchange: (filters: Record<string, string[]>) => void;
	} = $props();

	// Local state
	let isOpen = $state(false);
	let localFilters = $state<Record<string, string[]>>({});
	let dropdownRef = $state<HTMLDivElement>();

	// Count active filters (non-default selections)
	let activeFilterCount = $derived.by(() => {
		let count = 0;
		for (const group of filterGroups) {
			const selected = activeFilters[group.id] || [];
			// Count as active if not all options selected
			if (selected.length > 0 && selected.length < group.options.length) {
				count++;
			}
		}
		return count;
	});

	// Sync local filters when dropdown opens
	$effect(() => {
		if (isOpen) {
			localFilters = JSON.parse(JSON.stringify(activeFilters));
		}
	});

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

	function toggleOption(groupId: string, value: string) {
		const current = localFilters[groupId] || [];
		const group = filterGroups.find((g) => g.id === groupId);

		if (!group) return;

		if (group.multiSelect) {
			if (current.includes(value)) {
				localFilters[groupId] = current.filter((v) => v !== value);
			} else {
				localFilters[groupId] = [...current, value];
			}
		} else {
			// Single select - replace
			localFilters[groupId] = [value];
		}
	}

	function isSelected(groupId: string, value: string): boolean {
		return (localFilters[groupId] || []).includes(value);
	}

	function selectAll(groupId: string) {
		const group = filterGroups.find((g) => g.id === groupId);
		if (group) {
			localFilters[groupId] = group.options.map((o) => o.value);
		}
	}

	function clearGroup(groupId: string) {
		localFilters[groupId] = [];
	}

	function applyFilters() {
		onchange(localFilters);
		isOpen = false;
	}

	function resetFilters() {
		// Reset to all options selected for each group
		const reset: Record<string, string[]> = {};
		for (const group of filterGroups) {
			reset[group.id] = group.options.map((o) => o.value);
		}
		localFilters = reset;
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
		class="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md
			bg-muted/50 hover:bg-muted border border-border
			text-muted-foreground hover:text-foreground
			transition-colors pressable
			{isOpen ? 'ring-1 ring-accent/50 bg-muted' : ''}"
		aria-expanded={isOpen}
		aria-haspopup="true"
	>
		<Filter class="w-3 h-3" />
		<span>Filter</span>
		{#if activeFilterCount > 0}
			<span
				class="ml-0.5 px-1 py-0.5 min-w-[16px] text-[10px] font-semibold rounded bg-accent/20 text-accent"
			>
				{activeFilterCount}
			</span>
		{/if}
		<ChevronDown
			class="w-3 h-3 transition-transform duration-150 {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div
			class="absolute left-0 top-full mt-1 z-50 w-56 max-h-80 overflow-auto
				bg-card border border-border rounded-lg shadow-ink-strong
				tx tx-frame tx-weak"
			role="menu"
			tabindex="-1"
			transition:scale={{ duration: 150, easing: quintOut, start: 0.95 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					isOpen = false;
				}
			}}
		>
			<!-- Filter Groups -->
			{#each filterGroups as group}
				<div class="border-b border-border last:border-b-0">
					<!-- Group Header -->
					<div class="flex items-center justify-between px-3 py-2 bg-muted/30">
						<span class="text-xs font-semibold text-foreground">{group.label}</span>
						{#if group.multiSelect}
							<div class="flex items-center gap-1">
								<button
									type="button"
									onclick={() => selectAll(group.id)}
									class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
								>
									All
								</button>
								<span class="text-muted-foreground/50">·</span>
								<button
									type="button"
									onclick={() => clearGroup(group.id)}
									class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
								>
									None
								</button>
							</div>
						{/if}
					</div>

					<!-- Options -->
					<div class="py-1">
						{#each group.options as option}
							{@const selected = isSelected(group.id, option.value)}
							<button
								type="button"
								onclick={() => toggleOption(group.id, option.value)}
								class="w-full flex items-center gap-2 px-3 py-1.5 text-left
									hover:bg-muted/50 transition-colors"
								role="menuitemcheckbox"
								aria-checked={selected}
							>
								<!-- Checkbox -->
								<div
									class="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors
										{selected ? 'bg-accent border-accent' : 'border-border hover:border-accent/50'}"
								>
									{#if selected}
										<Check class="w-2.5 h-2.5 text-accent-foreground" />
									{/if}
								</div>

								<!-- Icon (if present) -->
								{#if option.icon}
									{@const OptionIcon = option.icon}
									<OptionIcon
										class="w-3.5 h-3.5 flex-shrink-0 {option.color ||
											'text-muted-foreground'}"
									/>
								{/if}

								<!-- Label -->
								<span
									class="text-xs {selected
										? 'text-foreground font-medium'
										: 'text-muted-foreground'}"
								>
									{option.label}
								</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}

			<!-- Footer -->
			<div
				class="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-t border-border"
			>
				<button
					type="button"
					onclick={resetFilters}
					class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
				>
					Reset
				</button>
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						onclick={() => (isOpen = false)}
						class="px-2 py-1 text-[10px] font-medium rounded
							text-muted-foreground hover:text-foreground
							hover:bg-muted transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={applyFilters}
						class="px-2 py-1 text-[10px] font-medium rounded
							bg-accent text-accent-foreground
							hover:bg-accent/90 transition-colors pressable"
					>
						Apply
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

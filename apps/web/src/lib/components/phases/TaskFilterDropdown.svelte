<!-- apps/web/src/lib/components/phases/TaskFilterDropdown.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Filter,
		Check,
		ChevronDown,
		Circle,
		Calendar,
		Clock,
		CircleCheck,
		Trash2,
		RefreshCcw
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { spring } from 'svelte/motion';
	import { quintOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';

	// Define TaskFilter type locally
	type TaskFilter = 'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring';

	// Convert to $props() for Svelte 5 runes mode
	let {
		activeFilters = ['active'] as TaskFilter[],
		taskCounts = {
			active: 0,
			scheduled: 0,
			deleted: 0,
			completed: 0,
			overdue: 0,
			recurring: 0
		} as Record<TaskFilter, number>,
		label = 'Filter Tasks',
		size = 'sm' as 'sm' | 'md',
		showCounts = true
	} = $props();

	const dispatch = createEventDispatcher();

	let isOpen = $state(false);
	let localFilters = $state<TaskFilter[]>([...activeFilters]);
	let isMobile = $state(false);
	let dropdownContainer = $state<HTMLDivElement>();

	// Filter definitions with icons
	const filterOptions: Array<{
		id: TaskFilter;
		label: string;
		color: string;
		icon: any;
	}> = [
		{ id: 'active', label: 'Active', color: 'text-muted-foreground', icon: Circle },
		{
			id: 'scheduled',
			label: 'Scheduled',
			color: 'text-blue-600 dark:text-blue-400',
			icon: Calendar
		},
		{ id: 'overdue', label: 'Overdue', color: 'text-red-600 dark:text-red-400', icon: Clock },
		{
			id: 'deleted',
			label: 'Deleted',
			color: 'text-red-600 dark:text-red-400',
			icon: Trash2
		},
		{
			id: 'completed',
			label: 'Completed',
			color: 'text-green-600 dark:text-green-400',
			icon: CircleCheck
		},
		{
			id: 'recurring',
			label: 'Recurring',
			color: 'text-purple-600 dark:text-purple-400',
			icon: RefreshCcw
		}
	];

	const dropdownHeight = spring(0, {
		stiffness: 0.3,
		damping: 0.8
	});

	// Check if mobile
	function checkMobile() {
		isMobile = window.innerWidth < 640;
	}

	// Use CSS-based positioning to prevent layout shifts
	let dropdownPosition = $state<'below' | 'above'>('below');
	let dropdownTop = $state(0);
	let dropdownBottom = $state('auto');

	// Calculate dropdown position without causing layout shifts
	function updateDropdownPosition() {
		if (!dropdownContainer || !isOpen) return;

		const button = dropdownContainer.querySelector('button');
		if (!button) return;

		const buttonRect = button.getBoundingClientRect();
		const dropdownHeight = 400; // Approximate max height
		const spaceBelow = window.innerHeight - buttonRect.bottom;
		const spaceAbove = buttonRect.top;

		if (isMobile) {
			// Determine position without applying styles immediately
			if (spaceBelow > dropdownHeight || spaceBelow > spaceAbove) {
				dropdownPosition = 'below';
				dropdownTop = buttonRect.bottom + 4;
				dropdownBottom = 'auto';
			} else {
				dropdownPosition = 'above';
				dropdownTop = 0;
				dropdownBottom = window.innerHeight - buttonRect.top + 4;
			}
		}
	}

	// Convert lifecycle to $effect for Svelte 5 runes mode
	$effect(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('resize', checkMobile);
			}
		};
	});

	// Convert reactive statement to $effect for Svelte 5 runes mode
	$effect(() => {
		if (isOpen) {
			// Use larger height on mobile to prevent cutoff
			dropdownHeight.set(isMobile ? 400 : 320);
			// Calculate position after dropdown opens
			updateDropdownPosition();
		} else {
			dropdownHeight.set(0);
		}
	});

	// Calculate total active/total tasks using array methods - converted to $derived
	let activeFiltersSet = $derived(new Set(activeFilters)); // Convert to Set for fast lookup
	let totalActiveTasks = $derived(
		Object.entries(taskCounts)
			.filter(([filter]) => activeFiltersSet.has(filter as TaskFilter))
			.reduce((sum, [, count]) => sum + count, 0)
	);
	let totalTasks = $derived(Object.values(taskCounts).reduce((sum, count) => sum + count, 0));

	// Reset local filters when activeFilters prop changes - converted to $effect
	$effect(() => {
		localFilters = [...activeFilters];
	});

	// Create a local filter set for fast checking - converted to $derived
	let localFiltersSet = $derived(new Set(localFilters));

	function toggleFilter(filter: TaskFilter) {
		if (localFilters.includes(filter)) {
			// Remove filter
			localFilters = localFilters.filter((f) => f !== filter);
		} else {
			// Add filter
			localFilters = [...localFilters, filter];
		}
	}

	function selectAll() {
		localFilters = [...filterOptions.map((f) => f.id)];
	}

	function clearAll() {
		localFilters = [];
	}

	function applyFilters() {
		dispatch('change', localFilters);
		isOpen = false;
	}

	function cancel() {
		localFilters = [...activeFilters];
		isOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			cancel();
		}
	}

	function handleClickOutside(event: Event) {
		const target = event.target as HTMLElement;
		if (!target.closest('.filter-dropdown-container')) {
			if (isOpen) {
				cancel();
			}
		}
	}

	// Check if filter is active using Set for fast lookup - converted to function using $derived
	function isFilterActive(filter: TaskFilter): boolean {
		return localFiltersSet.has(filter);
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="filter-dropdown-container relative" bind:this={dropdownContainer}>
	{#key activeFilters.join(',')}
		<Button
			onclick={(e) => {
				e.stopPropagation();
				isOpen = !isOpen;
			}}
			variant="outline"
			{size}
			icon={Filter}
			class="transition-all duration-100 {isOpen ? 'ring-2 ring-blue-500 shadow-ink' : ''}"
			aria-expanded={isOpen}
			aria-controls="filter-dropdown-menu"
			aria-label="{label} - {totalActiveTasks} of {totalTasks} tasks shown"
		>
			{label}
			{#if showCounts && totalTasks > 0}
				<span class="ml-1.5 text-xs font-normal text-muted-foreground">
					({totalActiveTasks}/{totalTasks})
				</span>
			{/if}
			<ChevronDown
				class="w-4 h-4 ml-1 transition-transform duration-100 {isOpen ? 'rotate-180' : ''}"
			/>
		</Button>

		{#if isOpen}
			<div
				id="filter-dropdown-menu"
				class="z-50 {size === 'sm'
					? 'w-64'
					: 'w-72'} bg-card border border-border rounded-lg shadow-ink-strong overflow-hidden
				{isMobile ? 'fixed left-4 right-4 w-auto' : 'absolute mt-1 right-0 sm:right-auto sm:left-0'}"
				style="max-height: {$dropdownHeight}px; opacity: {$dropdownHeight > 0 ? 1 : 0}; 
				{isMobile
					? dropdownPosition === 'below'
						? `top: ${dropdownTop}px;`
						: `bottom: ${dropdownBottom}px;`
					: ''}"
				onclick={(e) => e.stopPropagation()}
				role="menu"
				aria-orientation="vertical"
				transition:scale={{ duration: 100, easing: quintOut, start: 0.75 }}
			>
				<!-- Header -->
				<div class="px-3 py-2 border-b border-border">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-medium text-foreground">
							Filter Tasks
						</h3>
						<div class="flex items-center gap-2">
							<Button
								onclick={selectAll}
								variant="ghost"
								size="sm"
								class="!text-xs !px-2 !py-1 !h-auto transition-all duration-100 hover:scale-105"
							>
								All
							</Button>
							<Button
								onclick={clearAll}
								variant="ghost"
								size="sm"
								class="!text-xs !px-2 !py-1 !h-auto transition-all duration-100 hover:scale-105"
							>
								None
							</Button>
						</div>
					</div>
				</div>

				<!-- Filter Options -->
				<div class="py-2 max-h-[280px] overflow-y-auto -webkit-overflow-scrolling-touch">
					{#each filterOptions as option}
						{@const count = taskCounts[option.id] || 0}
						{@const isChecked = isFilterActive(option.id)}
						{@const OptionIcon = option.icon}

						<Button
							variant="ghost"
							class="w-full px-3 py-2.5 flex items-center justify-between hover:bg-muted transition-all duration-100 group"
							onclick={() => toggleFilter(option.id)}
							role="menuitemcheckbox"
							aria-checked={isChecked}
							aria-label="{option.label} - {count} tasks"
							btnType="container"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-100 flex-shrink-0
									{isChecked
										? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
										: 'border-border group-hover:border-blue-400'}"
								>
									{#if isChecked}
										<Check
											class="w-3 h-3 text-white transition-all duration-100"
										/>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<OptionIcon
										class="w-4 h-4 {option.color} flex-shrink-0 transition-all duration-100"
									/>
									<span
										class="text-sm font-medium text-foreground transition-colors duration-100"
									>
										{option.label}
									</span>
								</div>
							</div>

							{#if showCounts}
								<span
									class="text-sm text-muted-foreground ml-2 transition-colors duration-100
									{isChecked ? 'font-medium' : ''}"
								>
									{count}
								</span>
							{/if}
						</Button>
					{/each}
				</div>

				<!-- Footer -->
				<div
					class="px-3 py-2 border-t border-border flex items-center justify-between gap-2"
				>
					<span class="text-xs text-muted-foreground">
						{localFilters.length} selected
					</span>
					<div class="flex items-center gap-2">
						<Button
							onclick={cancel}
							variant="outline"
							size="sm"
							class="!text-xs transition-all duration-100 hover:scale-105"
						>
							Cancel
						</Button>
						<Button
							onclick={applyFilters}
							variant="primary"
							size="sm"
							class="!text-xs transition-all duration-100 hover:scale-105"
							disabled={localFilters.length === 0}
						>
							Apply
						</Button>
					</div>
				</div>
			</div>
		{/if}
	{/key}
</div>

<style>
	#filter-dropdown-menu {
		transition:
			max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			opacity 0.2s ease,
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		transform-origin: top center;
		will-change: max-height, opacity, transform;
	}

	.filter-dropdown-container {
		position: relative;
	}

	/* Ensure dropdown is above other content */
	#filter-dropdown-menu {
		z-index: 50;
	}

	/* Add subtle animation */
	#filter-dropdown-menu {
		animation: slideDown 0.15s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Mobile-specific adjustments */
	@media (max-width: 640px) {
		#filter-dropdown-menu {
			/* Position will be set dynamically by JavaScript */
			max-width: calc(100vw - 2rem);
		}

		/* Increase touch targets on mobile */
		#filter-dropdown-menu button {
			min-height: 44px;
		}
	}

	/* Ensure scrollbar is visible on mobile */
	#filter-dropdown-menu .overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}

	#filter-dropdown-menu .overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	#filter-dropdown-menu .overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	#filter-dropdown-menu .overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	:global(.dark) #filter-dropdown-menu .overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.5);
	}

	/* Enhanced hover effects */
	.group:hover .w-4.h-4:not(.bg-blue-600) {
		transform: scale(1.05);
	}

	/* Button hover effects */
	:global(.filter-dropdown-container .group button:hover) {
		transform: translateX(2px);
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		#filter-dropdown-menu,
		.transition-all,
		.transition-colors,
		.transition-transform {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
		}
	}
</style>

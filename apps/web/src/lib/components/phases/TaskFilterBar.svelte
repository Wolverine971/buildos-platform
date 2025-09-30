<!-- apps/web/src/lib/components/phases/TaskFilterBar.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		CheckCircle,
		Clock,
		AlertTriangle,
		Calendar,
		Circle,
		Trash2,
		RefreshCw
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Define TaskFilter type locally
	type TaskFilter = 'active' | 'scheduled' | 'deleted' | 'completed' | 'overdue' | 'recurring';

	export let activeFilters: TaskFilter[] = ['active'];
	export let taskCounts: Record<TaskFilter, number> = {
		active: 0,
		scheduled: 0,
		deleted: 0,
		completed: 0,
		overdue: 0,
		recurring: 0
	};
	export let showAllButton: boolean = true;
	export let size = 'lg';

	const dispatch = createEventDispatcher();

	// Filter definitions with icons and variant mappings
	const filterOptions: Array<{
		id: TaskFilter;
		label: string;
		icon: any;
		color: string;
		activeVariant: 'primary' | 'success' | 'danger' | 'secondary';
	}> = [
		{
			id: 'active',
			label: 'Active',
			icon: Circle,
			color: 'text-gray-600 dark:text-gray-400',
			activeVariant: 'primary'
		},
		{
			id: 'scheduled',
			label: 'Scheduled',
			icon: Calendar,
			color: 'text-blue-600 dark:text-blue-400',
			activeVariant: 'primary'
		},
		{
			id: 'overdue',
			label: 'Overdue',
			icon: Clock,
			color: 'text-orange-600 dark:text-orange-400',
			activeVariant: 'primary'
		},
		{
			id: 'recurring',
			label: 'Recurring',
			icon: RefreshCw,
			color: 'text-purple-600 dark:text-purple-400',
			activeVariant: 'primary'
		},
		{
			id: 'deleted',
			label: 'Deleted',
			icon: Trash2,
			color: 'text-red-600 dark:text-red-400',
			activeVariant: 'primary'
		},
		{
			id: 'completed',
			label: 'Completed',
			icon: CheckCircle,
			color: 'text-green-600 dark:text-green-400',
			activeVariant: 'success'
		}
	];

	// Calculate total tasks
	$: totalTasks = Object.values(taskCounts).reduce((sum, count) => sum + count, 0);

	function toggleFilter(filter: TaskFilter) {
		dispatch('toggle', filter);
	}

	function selectAll() {
		dispatch('selectAll');
	}

	// Simple reactive statements for better tracking
	$: activeFiltersSet = new Set(activeFilters); // Convert back to Set for fast lookup
	$: allFiltersActive = filterOptions.every((f) => activeFiltersSet.has(f.id));

	// Get the appropriate variant based on filter state and size
	function getButtonVariant(isActive: boolean, activeVariant: string): any {
		if (!isActive) return 'outline';
		// For small size, use secondary for consistency and better contrast
		if (size === 'sm') return 'secondary';
		// For larger sizes, use the specific variant
		return 'secondary';
	}

	// Get the All button variant
	function getAllButtonVariant(): any {
		if (!allFiltersActive) return 'outline';
		return size === 'sm' ? 'secondary' : 'primary';
	}

	// Get icon and text classes based on active state and size
	function getContentClasses(isActive: boolean, color: string) {
		if (isActive) {
			// Active state - let Button component handle colors
			return {
				icon: size === 'sm' ? 'text-current' : '',
				text: size === 'sm' ? 'text-current' : '',
				count: size === 'sm' ? 'bg-white/20 text-current' : 'bg-white/20 '
			};
		} else {
			// Inactive state - use custom colors
			return {
				icon: color,
				text: 'text-gray-700 dark:text-gray-300',
				count: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
			};
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Task filters">
	{#if showAllButton}
		<Button
			on:click={selectAll}
			variant={getAllButtonVariant()}
			size="sm"
			class="rounded-full transition-all duration-200 transform hover:scale-105 {size === 'sm'
				? 'px-2 py-1.5 min-h-[32px] min-w-[32px] text-xs'
				: 'px-3 py-2'}"
			aria-pressed={allFiltersActive}
		>
			<span class="font-medium">
				All ({totalTasks})
			</span>
		</Button>
	{/if}

	{#each filterOptions as option}
		{@const count = taskCounts[option.id] || 0}
		{@const isActive = activeFiltersSet.has(option.id)}
		{@const variant = getButtonVariant(isActive, option.activeVariant)}
		{@const contentClasses = getContentClasses(isActive, option.color)}

		<Button
			on:click={() => toggleFilter(option.id)}
			{variant}
			size="sm"
			class="rounded-full group transition-all duration-200 transform hover:scale-105 {size ===
			'sm'
				? 'px-2 py-1.5 min-h-[32px] min-w-[32px] text-xs'
				: 'px-3 py-2'}"
			aria-pressed={isActive}
			aria-label="{option.label} tasks: {count} {isActive ? 'shown' : 'hidden'}"
		>
			<div class="flex items-center gap-1.5">
				<svelte:component
					this={option.icon}
					class="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200 {contentClasses.icon}"
				/>
				<span class="font-medium transition-colors duration-200 {contentClasses.text}">
					{option.label}
				</span>
				<span
					class="text-xs rounded-full transition-all duration-200 {size === 'sm'
						? 'px-1.5 py-0.5'
						: 'px-2 py-1'} {contentClasses.count}"
				>
					{count}
				</span>
			</div>
		</Button>
	{/each}
</div>

<style>
	/* Enhanced button transitions */
	:global(.group) {
		will-change: transform, box-shadow;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
	}

	/* Smooth hover effects */
	:global(.group:hover:not(:disabled)) {
		box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.1);
	}

	/* Active state micro-animation */
	:global(.group:active:not(:disabled)) {
		transform: scale(0.98) !important;
		transition-duration: 0.1s !important;
	}

	/* Smooth color transitions for all content */
	:global(.group span),
	:global(.group svg) {
		transition:
			color 0.2s ease,
			background-color 0.2s ease;
	}

	/* Ensure proper focus handling */
	:global(.group:focus-visible) {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	/* Better touch targets on mobile */
	@media (max-width: 640px) {
		:global(.group) {
			min-height: 36px;
			min-width: 36px;
		}
	}
</style>

<!-- src/lib/components/ui/Select.svelte -->
<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { createEventDispatcher } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';

	type SelectSize = 'sm' | 'md' | 'lg';

	interface $$Props extends HTMLSelectAttributes {
		size?: SelectSize;
		error?: boolean;
		placeholder?: string;
		class?: string;
	}

	export let value: string | number = '';
	export let size: SelectSize = 'md';
	export let error = false;
	export let disabled = false;
	export let placeholder = 'Select an option';

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	const dispatch = createEventDispatcher();

	// Size classes with consistent heights
	const sizeClasses = {
		sm: 'pl-3 pr-9 py-2 text-sm min-h-[40px]',
		md: 'pl-4 pr-11 py-2.5 text-base min-h-[44px]',
		lg: 'pl-4 pr-12 py-3 text-lg min-h-[48px]'
	};

	// Icon size based on select size
	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	$: selectClasses = twMerge(
		// Base classes
		'w-full rounded-lg appearance-none cursor-pointer',
		'border transition-colors duration-200',
		'focus:outline-none focus:ring-2 focus:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',

		// Size classes
		sizeClasses[size],

		// State classes
		error
			? 'border-red-500 focus:ring-red-500 dark:border-red-400'
			: 'border-gray-300 focus:ring-primary-500 dark:border-gray-600',

		// Background
		'bg-white dark:bg-gray-800',

		// Text color
		value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',

		// Custom classes (these will override conflicts)
		className
	);

	// Icon position classes
	$: iconClasses = twMerge(
		'absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none',
		'text-gray-400 dark:text-gray-500',
		iconSizes[size]
	);

	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		value = target.value;
		dispatch('change', value);
	}
</script>

<div class="relative">
	<select
		{value}
		{disabled}
		class={selectClasses}
		on:change={handleChange}
		on:focus
		on:blur
		{...$$restProps}
	>
		{#if placeholder}
			<option value="" disabled selected hidden>
				{placeholder}
			</option>
		{/if}
		<slot />
	</select>

	<div class={iconClasses}>
		<ChevronDown />
	</div>
</div>

<style>
	/* Ensure consistent rendering across browsers */
	select {
		background-image: none;
	}

	/* Remove default arrow in IE */
	select::-ms-expand {
		display: none;
	}

	/* Dark mode focus ring offset */
	:global(.dark) select:focus {
		--tw-ring-offset-color: rgb(31 41 55);
	}

	/* Ensure option text is visible */
	option {
		color: rgb(17 24 39);
	}

	:global(.dark) option {
		color: rgb(243 244 246);
		background-color: rgb(31 41 55);
	}
</style>

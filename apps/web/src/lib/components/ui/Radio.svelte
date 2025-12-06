<!-- apps/web/src/lib/components/ui/Radio.svelte -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { createEventDispatcher, getContext } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type RadioSize = 'sm' | 'md' | 'lg';

	interface $$Props extends Omit<HTMLInputAttributes, 'type' | 'size'> {
		size?: RadioSize;
		label?: string;
		description?: string;
		error?: boolean;
		class?: string;
		labelClass?: string;
		inputClass?: string;
	}

	export let value: string | number = '';
	export let checked = false;
	export let name = '';
	export let disabled = false;
	export let required = false;
	export let size: RadioSize = 'md';
	export let label = '';
	export let description = '';
	export let error = false;

	// Allow class props to be passed through
	let className = '';
	export { className as class };
	export let labelClass = '';
	export let inputClass = '';

	const dispatch = createEventDispatcher();

	// Get group context if available
	const groupContext = getContext<any>('radioGroup');

	// Use group values if available
	$: if (groupContext) {
		name = groupContext.name || name;
		disabled = groupContext.disabled || disabled;
		error = groupContext.error || error;
		size = groupContext.size || size;
		// Use getter function for reactive value
		checked = groupContext.value === value;
	}

	// Size classes for the radio input
	const sizeClasses = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	// Label size classes
	const labelSizeClasses = {
		sm: 'text-sm',
		md: 'text-base',
		lg: 'text-lg'
	};

	// Container padding based on size
	const containerPadding = {
		sm: 'p-2',
		md: 'p-3',
		lg: 'p-4'
	};

	$: radioClasses = twMerge(
		// Base classes
		'appearance-none rounded-full border-2 transition-all duration-200',
		'focus:outline-none focus:ring-2 focus:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'cursor-pointer',

		// Size classes
		sizeClasses[size],

		// State classes
		checked
			? 'bg-accent-orange border-accent-orange dark:bg-accent-orange dark:border-accent-orange'
			: 'bg-surface-panel border-gray-300 dark:border-gray-600',

		// Error state
		error && !checked ? 'border-red-500 dark:border-red-400' : '',

		// Focus ring color
		error ? 'focus:ring-red-500' : 'focus:ring-accent-orange',

		// Hover state (only when not disabled)
		!disabled && !checked ? 'hover:border-gray-400 dark:hover:border-gray-500' : '',

		// Custom input classes
		inputClass
	);

	$: containerClasses = twMerge(
		'flex items-start gap-3 group',
		disabled ? 'cursor-not-allowed' : 'cursor-pointer',
		// Add hover effect to container
		!disabled ? 'hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded transition-colors' : '',
		containerPadding[size],
		className
	);

	$: labelClasses = twMerge(
		'select-none',
		labelSizeClasses[size],
		disabled
			? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
			: 'text-gray-900 dark:text-gray-100 cursor-pointer font-bold',
		labelClass
	);

	$: descriptionClasses = twMerge(
		'text-sm mt-1',
		disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'
	);

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		checked = target.checked;

		if (groupContext) {
			groupContext.onChange(value);
		}

		dispatch('change', { value, checked });
	}

	function handleClick() {
		if (!disabled && groupContext) {
			groupContext.onChange(value);
		}
	}
</script>

<label class={containerClasses}>
	<div class="relative flex items-center justify-center flex-shrink-0">
		<input
			type="radio"
			{name}
			{value}
			{checked}
			{disabled}
			{required}
			class={radioClasses}
			on:change={handleChange}
			on:click={handleClick}
			on:focus
			on:blur
			{...$$restProps}
		/>
		{#if checked}
			<div
				class="absolute pointer-events-none rounded-full bg-white dark:bg-slate-900"
				class:w-1.5={size === 'sm'}
				class:h-1.5={size === 'sm'}
				class:w-2={size === 'md'}
				class:h-2={size === 'md'}
				class:w-2.5={size === 'lg'}
				class:h-2.5={size === 'lg'}
			></div>
		{/if}
	</div>

	{#if label || description}
		<div class="flex-1">
			{#if label}
				<span class={labelClasses}>
					{label}
					{#if required}
						<span class="text-red-500 ml-0.5">*</span>
					{/if}
				</span>
			{/if}
			{#if description}
				<p class={descriptionClasses}>
					{description}
				</p>
			{/if}
		</div>
	{/if}
</label>

<style>
	/* Ensure radio button appearance is consistent across browsers */
	input[type='radio'] {
		-webkit-appearance: none;
		-moz-appearance: none;
	}

	/* Dark mode focus ring offset */
	:global(.dark) input[type='radio']:focus {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

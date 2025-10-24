<!-- apps/web/src/lib/components/ui/TextInput.svelte -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { createEventDispatcher } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type InputSize = 'sm' | 'md' | 'lg';

	interface $$Props extends HTMLInputAttributes {
		size?: InputSize;
		error?: boolean;
		required?: boolean;
		icon?: any; // Lucide icon component
		iconPosition?: 'left' | 'right';
		errorMessage?: string;
		helperText?: string;
		class?: string;
	}

	export let value: string | number | null = '';
	export let size: InputSize = 'md';
	export let error = false;
	export let required = false;
	export let disabled = false;
	export let icon: any = undefined;
	export let iconPosition: 'left' | 'right' = 'left';
	export let errorMessage: string | undefined = undefined;
	export let helperText: string | undefined = undefined;

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	const dispatch = createEventDispatcher();

	// Size classes with minimum touch target of 44x44px per WCAG AA standards
	const sizeClasses = {
		sm: 'px-3 py-2 text-sm min-h-[44px]',
		md: 'px-4 py-2.5 text-base min-h-[44px]',
		lg: 'px-4 py-3 text-lg min-h-[48px]'
	};

	// Icon size based on input size
	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	// Padding adjustments when icon is present
	const iconPaddingClasses = {
		left: {
			sm: 'pl-9',
			md: 'pl-11',
			lg: 'pl-12'
		},
		right: {
			sm: 'pr-9',
			md: 'pr-11',
			lg: 'pr-12'
		}
	};

	$: inputClasses = twMerge(
		// Base classes
		'w-full rounded-lg',
		'border transition-colors duration-200',
		'focus:outline-none focus:ring-2 focus:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'placeholder:text-gray-400 dark:placeholder:text-gray-500',

		// Size classes
		sizeClasses[size],

		// Icon padding
		icon && iconPosition === 'left' && iconPaddingClasses.left[size],
		icon && iconPosition === 'right' && iconPaddingClasses.right[size],

		// State classes
		error
			? 'border-red-500 focus:ring-red-500 dark:border-red-400'
			: 'border-gray-300 focus:ring-blue-500 dark:border-gray-600',

		// Background
		'bg-white dark:bg-gray-800',

		// Text color
		'text-gray-900 dark:text-gray-100',

		// Custom classes (these will override conflicts)
		className
	);

	// Icon position classes
	$: iconClasses = twMerge(
		'absolute top-1/2 -translate-y-1/2 pointer-events-none',
		'text-gray-400 dark:text-gray-500',
		iconPosition === 'left' ? 'left-3' : 'right-3',
		iconSizes[size]
	);

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		dispatch('input', value);
	}
</script>

<div class="relative">
	{#if icon}
		<div class={iconClasses}>
			<svelte:component this={icon} />
		</div>
	{/if}

	<input
		{value}
		{disabled}
		aria-invalid={error}
		aria-required={required}
		aria-describedby={error && errorMessage
			? 'input-error'
			: helperText
				? 'input-helper'
				: undefined}
		class={inputClasses}
		on:input={handleInput}
		on:change
		on:focus
		on:blur
		on:keydown
		on:keyup
		on:keypress
		{...$$restProps}
	/>
</div>
{#if error && errorMessage}
	<p
		id="input-error"
		role="alert"
		aria-live="polite"
		class="mt-1 text-sm text-red-600 dark:text-red-400"
	>
		{errorMessage}
	</p>
{:else if helperText}
	<p id="input-helper" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
		{helperText}
	</p>
{/if}

<style>
	/* Ensure consistent rendering across browsers */
	input {
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
	}

	/* Remove spinner buttons from number inputs */
	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	input[type='number'] {
		-moz-appearance: textfield;
	}

	/* Dark mode focus ring offset */
	:global(.dark) input:focus {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

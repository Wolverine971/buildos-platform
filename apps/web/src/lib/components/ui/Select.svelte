<!-- apps/web/src/lib/components/ui/Select.svelte -->
<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';

	type SelectSize = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax instead of export let and $$restProps
	let {
		value = $bindable(''),
		size = 'md',
		error = false,
		required = false,
		disabled = false,
		placeholder = 'Select an option',
		errorMessage = undefined,
		helperText = undefined,
		class: className = '',
		onchange,
		onfocus,
		onblur,
		children,
		...restProps
	}: {
		value?: string | number;
		size?: SelectSize;
		error?: boolean;
		required?: boolean;
		disabled?: boolean;
		placeholder?: string;
		errorMessage?: string;
		helperText?: string;
		class?: string;
		onchange?: (value: string | number) => void;
		onfocus?: (event: FocusEvent) => void;
		onblur?: (event: FocusEvent) => void;
		children?: Snippet;
	} & Omit<HTMLSelectAttributes, 'onchange' | 'onfocus' | 'onblur'> = $props();

	// Size classes with minimum touch target of 44x44px per WCAG AA standards
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

	// Svelte 5 runes: Convert reactive declarations to $derived
	let selectClasses = $derived(
		twMerge(
			// Base classes
			'w-full rounded-lg appearance-none cursor-pointer',
			'border transition-colors duration-200',
			'focus:outline-none focus:ring-2 focus:ring-offset-2',
			'disabled:cursor-not-allowed',

			// Size classes
			sizeClasses[size],

			// State classes - error takes precedence over normal state
			disabled && error
				? 'border-red-300 dark:border-red-500/50 opacity-50'
				: error
					? 'border-red-500 focus:ring-red-500 dark:border-red-400'
					: disabled
						? 'border-gray-300 dark:border-gray-600 opacity-50'
						: 'border-gray-300 focus:ring-blue-500 dark:border-gray-600',

			// Background
			'bg-white dark:bg-gray-800',

			// Text color
			value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',

			// Custom classes (these will override conflicts)
			className
		)
	);

	// Icon position classes
	let iconClasses = $derived(
		twMerge(
			'absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none',
			'text-gray-400 dark:text-gray-500',
			iconSizes[size]
		)
	);

	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		value = target.value;
		// Call the callback prop if provided
		onchange?.(value);
	}

	function handleFocus(event: FocusEvent) {
		onfocus?.(event);
	}

	function handleBlur(event: FocusEvent) {
		onblur?.(event);
	}
</script>

<div class="relative">
	<select
		{value}
		{disabled}
		aria-invalid={error}
		aria-required={required}
		aria-describedby={error && errorMessage
			? 'select-error'
			: helperText
				? 'select-helper'
				: undefined}
		class={selectClasses}
		onchange={handleChange}
		onfocus={handleFocus}
		onblur={handleBlur}
		{...restProps}
	>
		{#if placeholder}
			<option value="" disabled selected hidden aria-hidden="true">
				{placeholder}
			</option>
		{/if}
		{@render children?.()}
	</select>

	<div class={iconClasses}>
		<ChevronDown />
	</div>
</div>
{#if error && errorMessage}
	<p
		id="select-error"
		role="alert"
		aria-live="polite"
		class="mt-1 text-sm text-red-600 dark:text-red-400"
	>
		{errorMessage}
	</p>
{:else if helperText}
	<p id="select-helper" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
		{helperText}
	</p>
{/if}

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

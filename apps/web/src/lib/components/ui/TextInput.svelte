<!-- apps/web/src/lib/components/ui/TextInput.svelte -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type InputSize = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax, callback props instead of dispatcher
	let {
		value = $bindable(''),
		size = 'md',
		error = false,
		required = false,
		disabled = false,
		icon = undefined,
		iconPosition = 'left',
		errorMessage = undefined,
		helperText = undefined,
		class: className = '',
		oninput,
		...restProps
	}: {
		value?: string | number | null;
		size?: InputSize;
		error?: boolean;
		required?: boolean;
		disabled?: boolean;
		icon?: any;
		iconPosition?: 'left' | 'right';
		errorMessage?: string;
		helperText?: string;
		class?: string;
		oninput?: (event: Event) => void;
	} & HTMLInputAttributes = $props();

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

	let inputClasses = $derived(
		twMerge(
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
		)
	);

	// Icon position classes
	let iconClasses = $derived(
		twMerge(
			'absolute top-1/2 -translate-y-1/2 pointer-events-none',
			'text-gray-400 dark:text-gray-500',
			iconPosition === 'left' ? 'left-3' : 'right-3',
			iconSizes[size]
		)
	);
</script>

<div class="relative">
	{#if icon}
		{@const IconComponent = icon}
		<div class={iconClasses}>
			<IconComponent />
		</div>
	{/if}

	<input
		bind:value
		{disabled}
		aria-invalid={error}
		aria-required={required}
		aria-describedby={error && errorMessage
			? 'input-error'
			: helperText
				? 'input-helper'
				: undefined}
		class={inputClasses}
		{oninput}
		{...restProps}
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

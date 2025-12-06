<!-- apps/web/src/lib/components/ui/TextInput.svelte -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type InputSize = 'sm' | 'md' | 'lg';

	interface TextInputProps {
		value?: string | number | null;
		size?: InputSize;
		error?: boolean;
		required?: boolean;
		disabled?: boolean;
		icon?: any;
		iconPosition?: 'left' | 'right';
		errorMessage?: string;
		helperText?: string;
		inputmode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | 'search' | 'none';
		enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
		type?: string;
		class?: string;
		oninput?: (event: Event) => void;
	}

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
		inputmode = undefined,
		enterkeyhint = undefined,
		type = 'text',
		class: className = '',
		oninput,
		...restProps
	}: TextInputProps & Omit<HTMLInputAttributes, 'size'> = $props();

	// Smart inputmode detection based on type if not explicitly provided
	let computedInputmode = $derived(
		inputmode ||
			(type === 'email'
				? 'email'
				: type === 'tel'
					? 'tel'
					: type === 'url'
						? 'url'
						: type === 'number'
							? 'numeric'
							: undefined)
	);

	// Default enterkeyhint to 'next' for better form flow (can be overridden)
	let computedEnterkeyhint = $derived(enterkeyhint || 'next');

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

	// Wrapper classes - handles dithering (since inputs can't have ::before pseudo-elements)
	let wrapperClasses = $derived(
		twMerge(
			'relative rounded overflow-hidden', // Container for dithering
			'dither-soft', // Dithered texture on the container
			'bg-surface-scratch dark:bg-slate-700/50' // Background on container
		)
	);

	let inputClasses = $derived(
		twMerge(
			// Base classes - Scratchpad Ops design
			'w-full rounded', // 4px radius (default rounded)
			'border-2 transition-all duration-200', // 2px border for tactile feel
			'focus:outline-none focus:ring-2 focus:ring-offset-1',
			'disabled:cursor-not-allowed disabled:opacity-50',

			// Placeholder - muted notebook feel
			'placeholder:text-gray-500 dark:placeholder:text-gray-400',

			// Size classes
			sizeClasses[size],

			// Icon padding
			icon && iconPosition === 'left' && iconPaddingClasses.left[size],
			icon && iconPosition === 'right' && iconPaddingClasses.right[size],

			// State classes - industrial borders
			error
				? 'border-red-600 focus:ring-red-500 dark:border-red-500'
				: 'border-gray-300 focus:ring-accent-orange focus:border-gray-400 dark:border-gray-600 dark:focus:border-gray-500',

			// Background - transparent to show dithered container beneath
			'bg-transparent',

			// Text color - slightly muted for notebook feel
			'text-gray-900 dark:text-gray-100',

			// Position relative for proper stacking (no z-index needed - mix-blend-mode handles layering)
			'relative',

			// Custom classes (these will override conflicts)
			className
		)
	);

	// Icon position classes (no z-index needed - mix-blend-mode handles layering)
	let iconClasses = $derived(
		twMerge(
			'absolute top-1/2 -translate-y-1/2 pointer-events-none',
			'text-gray-500 dark:text-gray-400',
			iconPosition === 'left' ? 'left-3' : 'right-3',
			iconSizes[size]
		)
	);
</script>

<!-- Outer wrapper with dithering texture (inputs can't have ::before pseudo-elements) -->
<div class={wrapperClasses}>
	{#if icon}
		{@const IconComponent = icon}
		<div class={iconClasses}>
			<IconComponent />
		</div>
	{/if}

	<input
		bind:value
		{type}
		{disabled}
		inputmode={computedInputmode}
		enterkeyhint={computedEnterkeyhint}
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
		appearance: textfield;
	}

	/* Dark mode focus ring offset */
	:global(.dark) input:focus {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

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

	// Wrapper classes - Inkprint design
	let wrapperClasses = $derived(
		twMerge(
			'relative rounded-lg overflow-hidden', // Container with softer radius
			'bg-card' // Clean card background
		)
	);

	let inputClasses = $derived(
		twMerge(
			// Base classes - Inkprint design
			'w-full rounded-lg', // Softer radius
			'border transition-all duration-200',
			'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
			'disabled:cursor-not-allowed disabled:opacity-50',

			// Placeholder - muted
			'placeholder:text-muted-foreground',

			// Size classes
			sizeClasses[size],

			// Icon padding
			icon && iconPosition === 'left' && iconPaddingClasses.left[size],
			icon && iconPosition === 'right' && iconPaddingClasses.right[size],

			// State classes - clean borders
			error
				? 'border-destructive focus:ring-destructive'
				: 'border-border focus:border-accent',

			// Background - clean card
			'bg-card',

			// Text color
			'text-foreground',

			// Position relative for proper stacking
			'relative',

			// Shadow
			'shadow-ink-inner',

			// Custom classes (these will override conflicts)
			className
		)
	);

	// Icon position classes
	let iconClasses = $derived(
		twMerge(
			'absolute top-1/2 -translate-y-1/2 pointer-events-none',
			'text-muted-foreground',
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
		class="mt-1 sm:mt-1.5 text-xs sm:text-sm text-destructive"
	>
		{errorMessage}
	</p>
{:else if helperText}
	<p id="input-helper" class="mt-1 sm:mt-1.5 text-xs sm:text-sm text-muted-foreground">
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

	/* Focus ring offset - matches Inkprint background */
	input:focus {
		--tw-ring-offset-color: hsl(var(--background));
	}
</style>

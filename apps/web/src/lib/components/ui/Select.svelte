<!-- apps/web/src/lib/components/ui/Select.svelte -->
<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';

	/**
	 * Select component size options
	 * @type {'sm' | 'md' | 'lg'}
	 *
	 * - 'sm': 40px height, compact padding, text-sm (for condensed layouts)
	 * - 'md': 44px height, standard padding, text-base (recommended default)
	 * - 'lg': 48px height, relaxed padding, text-lg (for prominence)
	 */
	export type SelectSize = 'sm' | 'md' | 'lg';

	/**
	 * Responsive size configuration for different breakpoints
	 * Allows specifying different sizes at different viewport widths
	 *
	 * @example
	 * // Single size (existing behavior)
	 * <Select size="md" />
	 *
	 * @example
	 * // Responsive sizes
	 * <Select size={{ base: 'sm', md: 'md', lg: 'lg' }} />
	 */
	export interface ResponsiveSizeConfig {
		/** Size for base/mobile viewport (no breakpoint) */
		base?: SelectSize;
		/** Size at sm breakpoint (640px+) */
		sm?: SelectSize;
		/** Size at md breakpoint (768px+) */
		md?: SelectSize;
		/** Size at lg breakpoint (1024px+) */
		lg?: SelectSize;
		/** Size at xl breakpoint (1280px+) */
		xl?: SelectSize;
	}

	/** Union type for size prop - accepts single size or responsive config */
	type SelectSizeProp = SelectSize | ResponsiveSizeConfig;

	// Svelte 5 runes: Use $props() with rest syntax instead of export let and $$restProps
	interface SelectProps {
		value?: string | number;
		size?: SelectSizeProp;
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
	}

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
	}: SelectProps &
		Omit<HTMLSelectAttributes, 'onchange' | 'onfocus' | 'onblur' | 'size'> = $props();

	/**
	 * Helper function to resolve responsive size configuration into Tailwind classes
	 * Handles both single size strings and responsive config objects with breakpoint support
	 *
	 * @param sizeParam - Either a SelectSize string or ResponsiveSizeConfig object
	 * @param baseSizeClasses - Object mapping sizes to their Tailwind classes
	 * @returns Tailwind class string, with responsive prefixes for breakpoints
	 *
	 * @example
	 * // Single size returns base classes
	 * getResponsiveSizeClasses('md', sizeClasses)
	 * // → 'pl-4 pr-11 py-2.5 text-base min-h-[44px]'
	 *
	 * @example
	 * // Responsive config returns prefixed classes
	 * getResponsiveSizeClasses({ base: 'sm', md: 'lg' }, sizeClasses)
	 * // → 'pl-3 pr-9 py-2 text-sm min-h-[40px] md:pl-4 md:pr-12 md:py-3 md:text-lg md:min-h-[48px]'
	 */
	function getResponsiveSizeClasses(
		sizeParam: SelectSizeProp,
		baseSizeClasses: Record<SelectSize, string>
	): string {
		// Handle single size string - return classes as-is
		if (typeof sizeParam === 'string') {
			return baseSizeClasses[sizeParam];
		}

		// Handle responsive config object
		const config = sizeParam as ResponsiveSizeConfig;
		const breakpoints = ['sm', 'md', 'lg', 'xl'] as const;
		const classArray: string[] = [];

		// Add base size (no breakpoint prefix)
		if (config.base) {
			classArray.push(baseSizeClasses[config.base]);
		}

		// Add responsive sizes with breakpoint prefixes
		for (const breakpoint of breakpoints) {
			if (config[breakpoint]) {
				const sizeClassesStr = baseSizeClasses[config[breakpoint]];
				// Split classes and prefix each one with the breakpoint
				const prefixedClasses = sizeClassesStr
					.split(' ')
					.map((cls) => `${breakpoint}:${cls}`)
					.join(' ');
				classArray.push(prefixedClasses);
			}
		}

		return classArray.join(' ');
	}

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

	/**
	 * Helper function to generate responsive icon classes
	 * Mirrors the responsive sizing logic used for the select element
	 *
	 * @param sizeParam - Either a SelectSize string or ResponsiveSizeConfig object
	 * @param baseIconClasses - Object mapping sizes to their icon Tailwind classes
	 * @returns Tailwind class string with responsive prefixes
	 */
	function getResponsiveIconClasses(
		sizeParam: SelectSizeProp,
		baseIconClasses: Record<SelectSize, string>
	): string {
		// Handle single size string
		if (typeof sizeParam === 'string') {
			return baseIconClasses[sizeParam];
		}

		// Handle responsive config object
		const config = sizeParam as ResponsiveSizeConfig;
		const breakpoints = ['sm', 'md', 'lg', 'xl'] as const;
		const classArray: string[] = [];

		// Add base icon size
		if (config.base) {
			classArray.push(baseIconClasses[config.base]);
		}

		// Add responsive icon sizes with breakpoint prefixes
		for (const breakpoint of breakpoints) {
			if (config[breakpoint]) {
				const iconClassesStr = baseIconClasses[config[breakpoint]];
				const prefixedClasses = iconClassesStr
					.split(' ')
					.map((cls) => `${breakpoint}:${cls}`)
					.join(' ');
				classArray.push(prefixedClasses);
			}
		}

		return classArray.join(' ');
	}

	// Svelte 5 runes: Convert reactive declarations to $derived
	let selectClasses = $derived(
		twMerge(
			// Base classes
			'w-full rounded-lg appearance-none cursor-pointer',
			'border transition-colors duration-200',
			'focus:outline-none focus:ring-2 focus:ring-offset-2',
			'disabled:cursor-not-allowed',

			// Size classes (supports both single and responsive sizes)
			getResponsiveSizeClasses(size, sizeClasses),

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

	// Icon position and sizing classes (responsive)
	let iconClasses = $derived(
		twMerge(
			'absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none',
			'text-gray-400 dark:text-gray-500',
			getResponsiveIconClasses(size, iconSizes)
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

<!-- apps/web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type CardVariant = 'default' | 'elevated' | 'interactive' | 'outline';
	type CardPadding = 'none' | 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		padding = 'md',
		hoverable = false,
		class: className = '',
		...restProps
	}: {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles
	const variantClasses = {
		default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm',
		elevated: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md',
		interactive:
			'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all duration-200',
		outline:
			'bg-transparent border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors'
	};

	// Padding styles - optimized for high information density (Apple-style)
	const paddingClasses = {
		none: 'p-0',
		sm: 'p-2', // Compact: 8px - consistent with 8px grid system
		md: 'p-3 sm:p-4', // Compact: 12px/16px - provides just enough breathing room for shadow/border
		lg: 'p-4 sm:p-6' // Comfortable: 16-24px - for special emphasis cards
	};

	// Svelte 5 runes: Convert reactive declaration to $derived
	let cardClasses = $derived(
		twMerge(
			// Base styles
			'rounded-lg transition-all duration-300',

			// Variant
			variantClasses[variant],

			// Padding
			paddingClasses[padding],

			// Hoverable
			hoverable && 'hover:shadow-lg hover:scale-105 hover:-translate-y-0.5 cursor-pointer',

			// Custom classes
			className
		)
	);
</script>

<div class={cardClasses} {...restProps}>
	<slot />
</div>

<style>
	/* Smooth transitions for interactive states */
	:global(.dark) div {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

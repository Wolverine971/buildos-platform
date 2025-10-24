<!-- apps/web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type CardVariant = 'default' | 'elevated' | 'interactive' | 'outline';
	type CardPadding = 'none' | 'sm' | 'md' | 'lg';

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		class?: string;
	}

	export let variant: CardVariant = 'default';
	export let padding: CardPadding = 'md';
	export let hoverable = false;

	let className = '';
	export { className as class };

	// Variant styles
	const variantClasses = {
		default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm',
		elevated: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md',
		interactive:
			'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all duration-200',
		outline:
			'bg-transparent border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors'
	};

	// Padding styles
	const paddingClasses = {
		none: 'p-0',
		sm: 'p-3 sm:p-4',
		md: 'p-4 sm:p-5 md:p-6',
		lg: 'p-6 sm:p-8 md:p-10'
	};

	$: cardClasses = twMerge(
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
	);
</script>

<div class={cardClasses} {...$$restProps}>
	<slot />
</div>

<style>
	/* Smooth transitions for interactive states */
	:global(.dark) div {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

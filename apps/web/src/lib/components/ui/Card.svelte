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
		dithered = false, // Cards should typically NOT have dithering - clean containers
		class: className = '',
		...restProps
	}: {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		dithered?: boolean;
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles - Scratchpad Ops design
	const variantClasses = {
		default: 'bg-surface-panel border border-gray-200 dark:border-gray-700 shadow-subtle',
		elevated: 'bg-surface-panel border border-gray-200 dark:border-gray-700 shadow-card',
		interactive:
			'bg-surface-panel border border-gray-200 dark:border-gray-700 shadow-subtle hover:shadow-card hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer',
		outline:
			'bg-transparent border-2 border-gray-700 dark:border-gray-500 hover:border-accent-olive dark:hover:border-gray-400'
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
			// Base styles - Scratchpad Ops styling
			'rounded overflow-hidden', // 4px radius for industrial feel

			// Variant
			variantClasses[variant],

			// Padding
			paddingClasses[padding],

			// Hoverable
			hoverable && 'transition-transform hover:scale-[1.01] cursor-pointer',

			// Light grain texture for surface (optional)
			dithered && 'dither-subtle', // Use subtle dithering from dithering.css

			// Custom classes
			className
		)
	);
</script>

<div class={cardClasses} {...restProps}>
	<slot />
</div>

<style>
	/* Card transitions - optimized for performance */
	div {
		/* GPU acceleration */
		transform: translateZ(0);
		backface-visibility: hidden;

		/* Smooth transitions */
		transition-property: box-shadow, border-color, transform;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Outline variant border transitions */
	:global(.border-2) {
		transition-property: border-color;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Dark mode focus ring offset */
	:global(.dark) div {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>

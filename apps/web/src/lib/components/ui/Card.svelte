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
		dithered = true,
		class: className = '',
		...restProps
	}: {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		dithered?: boolean;
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles (GPU-optimized transitions)
	const variantClasses = {
		default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm',
		elevated: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md',
		interactive:
			'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer',
		outline:
			'bg-transparent border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
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
			// Base styles (GPU-optimized, no transition-all)
			'rounded-lg overflow-hidden',

			// Variant
			variantClasses[variant],

			// Padding
			paddingClasses[padding],

			// Hoverable (uses GPU-optimized utility from animation-utils.css)
			hoverable && 'hover-scale cursor-pointer',

			// Dithered effect - CRITICAL: must include 'relative' for ::before positioning
			dithered && 'card-dithered relative',

			// Custom classes
			className
		)
	);
</script>

<!-- SVG Dithering Pattern Definition -->
<svg width="0" height="0" class="absolute">
	<defs>
		<pattern
			id="dither-pattern-subtle"
			patternUnits="userSpaceOnUse"
			width="4"
			height="4"
			patternTransform="rotate(0)"
		>
			<rect width="4" height="4" fill="rgba(0,0,0,0)" />
			<circle cx="0" cy="0" r="0.4" fill="rgba(0,0,0,0.015)" class="dark:fill-white/[0.015]" />
			<circle cx="2" cy="1" r="0.4" fill="rgba(0,0,0,0.01)" class="dark:fill-white/[0.01]" />
			<circle cx="1" cy="2" r="0.4" fill="rgba(0,0,0,0.012)" class="dark:fill-white/[0.012]" />
			<circle cx="3" cy="3" r="0.4" fill="rgba(0,0,0,0.008)" class="dark:fill-white/[0.008]" />
		</pattern>
	</defs>
</svg>

<div class={cardClasses} {...restProps}>
	<slot />
</div>

<style>
	/* ==================== GPU-Optimized Card Transitions ==================== */

	/* Interactive card transitions */
	div {
		/* GPU acceleration */
		transform: translateZ(0);
		backface-visibility: hidden;

		/* Only animate GPU-friendly properties */
		transition-property: box-shadow, border-color, opacity;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Outline variant border transitions */
	:global(.border-2) {
		transition-property: border-color;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.dark) div {
		--tw-ring-offset-color: rgb(31 41 55);
	}

	/* Dithering effect using mix-blend-mode (robust with GPU acceleration) */
	:global(.card-dithered::before) {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.15;
		pointer-events: none;
		border-radius: inherit;
		transition: opacity 0.3s ease;
	}

	/* Dark mode dithering - uses white dots with soft-light blend */
	:global(.dark .card-dithered::before) {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.2;
	}

	/* Fade out on hover for interactive cards */
	:global(.card-dithered.hover\:shadow-lg:hover::before) {
		opacity: 0.08;
	}
</style>

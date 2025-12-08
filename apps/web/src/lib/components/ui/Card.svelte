<!-- apps/web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type CardVariant = 'default' | 'elevated' | 'interactive' | 'outline';
	type CardPadding = 'none' | 'sm' | 'md' | 'lg';
	type CardTexture = 'none' | 'bloom' | 'grain' | 'thread' | 'frame' | 'static';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		padding = 'md',
		hoverable = false,
		texture = 'none',
		dithered = false, // Legacy prop - use texture instead
		class: className = '',
		children,
		...restProps
	}: {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		texture?: CardTexture;
		dithered?: boolean;
		class?: string;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles - Inkprint design system
	const variantClasses = {
		default: 'bg-card border border-border shadow-ink',
		elevated: 'bg-card border border-border shadow-ink-strong ink-frame',
		interactive:
			'bg-card border border-border shadow-ink hover:shadow-ink-strong hover:border-accent/50 cursor-pointer',
		outline: 'bg-transparent border border-border hover:border-accent'
	};

	// Padding styles - optimized for high information density
	const paddingClasses = {
		none: 'p-0',
		sm: 'p-2', // Compact: 8px - consistent with 8px grid system
		md: 'p-3 sm:p-4', // Compact: 12px/16px - provides just enough breathing room for shadow/border
		lg: 'p-4 sm:p-6' // Comfortable: 16-24px - for special emphasis cards
	};

	// Texture classes - Inkprint textures
	const textureClasses = {
		none: '',
		bloom: 'tx tx-bloom tx-weak',
		grain: 'tx tx-grain tx-weak',
		thread: 'tx tx-thread tx-weak',
		frame: 'tx tx-frame tx-weak',
		static: 'tx tx-static tx-weak'
	};

	// Svelte 5 runes: Convert reactive declaration to $derived
	let cardClasses = $derived(
		twMerge(
			// Base styles - Inkprint design system
			'rounded-lg overflow-hidden', // Softer radius

			// Variant
			variantClasses[variant],

			// Padding
			paddingClasses[padding],

			// Hoverable
			hoverable && 'transition-all hover:scale-[1.005] cursor-pointer pressable',

			// Texture (new Inkprint system)
			textureClasses[texture],

			// Legacy dithered support
			dithered && texture === 'none' && 'tx tx-grain tx-weak',

			// Custom classes
			className
		)
	);
</script>

<div class={cardClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
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

	/* Focus ring offset - matches Inkprint background */
	div {
		--tw-ring-offset-color: hsl(var(--background));
	}
</style>

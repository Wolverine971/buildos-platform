<!-- apps/web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type CardVariant = 'default' | 'elevated' | 'interactive' | 'outline' | 'ghost';
	type CardPadding = 'none' | 'sm' | 'md' | 'lg';
	type CardTexture = 'none' | 'bloom' | 'grain' | 'thread' | 'frame' | 'static' | 'pulse';
	type CardWeight = 'ghost' | 'paper' | 'card' | 'plate';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		padding = 'none',
		hoverable = false,
		texture,
		weight,
		class: className = '',
		children,
		...restProps
	}: {
		variant?: CardVariant;
		padding?: CardPadding;
		hoverable?: boolean;
		texture?: CardTexture;
		weight?: CardWeight;
		class?: string;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Smart defaults based on variant
	// These can be overridden by explicit texture/weight props
	const variantDefaults: Record<CardVariant, { texture: CardTexture; weight: CardWeight }> = {
		default: { texture: 'frame', weight: 'paper' },
		elevated: { texture: 'frame', weight: 'card' },
		interactive: { texture: 'grain', weight: 'paper' },
		outline: { texture: 'none', weight: 'paper' },
		ghost: { texture: 'bloom', weight: 'ghost' }
	};

	// Resolve texture and weight (explicit props override defaults)
	let resolvedTexture = $derived(texture ?? variantDefaults[variant].texture);
	let resolvedWeight = $derived(weight ?? variantDefaults[variant].weight);

	// Padding styles - optimized for high information density (8px grid system)
	const paddingClasses: Record<CardPadding, string> = {
		none: '',
		sm: 'p-2.5 sm:p-3', // 10px mobile, 12px tablet+
		md: 'p-3 sm:p-4', // 12px mobile, 16px tablet+
		lg: 'p-4 sm:p-6' // 16px mobile, 24px tablet+
	};

	// Texture classes - Inkprint semantic textures
	const textureClasses: Record<CardTexture, string> = {
		none: '',
		bloom: 'tx tx-bloom tx-weak',
		grain: 'tx tx-grain tx-weak',
		thread: 'tx tx-thread tx-weak',
		frame: 'tx tx-frame tx-weak',
		static: 'tx tx-static tx-weak',
		pulse: 'tx tx-pulse tx-weak'
	};

	// Weight classes - Inkprint semantic weight
	const weightClasses: Record<CardWeight, string> = {
		ghost: 'wt-ghost',
		paper: 'wt-paper',
		card: 'wt-card',
		plate: 'wt-plate'
	};

	// Base classes that apply to all cards
	const baseClasses = 'overflow-hidden';

	// Background per weight - weight classes handle border/shadow/radius/motion,
	// background is set separately so Tailwind bg-* utilities aren't overridden
	const weightBgClasses: Record<CardWeight, string> = {
		ghost: 'bg-transparent',
		paper: 'bg-card',
		card: 'bg-card',
		plate: 'bg-card'
	};

	// Svelte 5 runes: Derived card classes
	let cardClasses = $derived(
		twMerge(
			baseClasses,

			// Weight (provides border, shadow, radius, motion)
			weightClasses[resolvedWeight],

			// Background (separate from weight so bg-* can override)
			weightBgClasses[resolvedWeight],

			// Padding
			paddingClasses[padding],

			// Hoverable interaction
			hoverable && 'cursor-pointer pressable hover:border-accent/50',

			// Texture overlay
			textureClasses[resolvedTexture],

			// Custom classes (can override anything)
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
	/* Card-specific transitions - complements weight system */
	div {
		/* GPU acceleration for smooth animations */
		transform: translateZ(0);
		backface-visibility: hidden;
	}

	/* Focus ring offset - matches Inkprint background */
	div {
		--tw-ring-offset-color: hsl(var(--background));
	}
</style>

<!-- apps/web/src/lib/components/ui/CardHeader.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type HeaderVariant = 'default' | 'muted' | 'accent' | 'transparent';
	type HeaderTexture = 'none' | 'strip' | 'frame' | 'grain';
	type HeaderPadding = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		texture = 'strip', // Per Inkprint: "Strip = header band, separator, printed label"
		padding = 'md',
		divider = true,
		class: className = '',
		children,
		...restProps
	}: {
		variant?: HeaderVariant;
		texture?: HeaderTexture;
		padding?: HeaderPadding;
		divider?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles - Inkprint design system
	const variantClasses: Record<HeaderVariant, string> = {
		default: 'bg-muted',
		muted: 'bg-muted',
		accent: 'bg-accent/10', // Opacity OK for subtle accent tint
		transparent: 'bg-transparent'
	};

	// Texture classes - Inkprint
	const textureClasses: Record<HeaderTexture, string> = {
		none: '',
		strip: 'tx tx-strip tx-weak',
		frame: 'tx tx-frame tx-weak',
		grain: 'tx tx-grain tx-weak'
	};

	// Padding optimized for high information density (8px grid system)
	const paddingClasses: Record<HeaderPadding, string> = {
		sm: 'px-2.5 py-1.5 sm:px-3 sm:py-2', // 10x6 mobile, 12x8 tablet+
		md: 'px-3 py-2.5 sm:px-4 sm:py-3', // 12x10 mobile, 16x12 tablet+
		lg: 'px-4 py-3 sm:px-6 sm:py-4' // 16x12 mobile, 24x16 tablet+
	};

	let headerClasses = $derived(
		twMerge(
			// Base styles
			'relative overflow-hidden',

			// Padding
			paddingClasses[padding],

			// Variant background
			variantClasses[variant],

			// Divider
			divider && 'border-b border-border',

			// Texture
			textureClasses[texture],

			// Custom classes
			className
		)
	);
</script>

<div class={headerClasses} {...restProps}>
	{@render children()}
</div>

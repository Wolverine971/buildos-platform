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
		sm: 'px-3 py-2', // 12px x 8px
		md: 'px-4 py-3', // 16px x 12px
		lg: 'px-6 py-4' // 24px x 16px
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

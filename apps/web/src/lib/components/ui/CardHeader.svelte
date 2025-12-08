<!-- apps/web/src/lib/components/ui/CardHeader.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type HeaderVariant = 'default' | 'muted' | 'accent' | 'strip';
	type HeaderTexture = 'none' | 'strip' | 'frame' | 'grain';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		texture = 'none',
		dithered = false, // Legacy prop
		class: className = '',
		children,
		...restProps
	}: {
		variant?: HeaderVariant;
		texture?: HeaderTexture;
		dithered?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles - Inkprint design system
	const variantClasses = {
		default: 'bg-muted/50 border-b border-border',
		muted: 'bg-muted border-b border-border',
		accent: 'bg-accent/10 border-b border-accent/20',
		strip: 'bg-card border-b border-border'
	};

	// Texture classes - Inkprint
	const textureClasses = {
		none: '',
		strip: 'tx tx-strip tx-weak',
		frame: 'tx tx-frame tx-weak',
		grain: 'tx tx-grain tx-weak'
	};

	// Optimized for high information density
	let headerClasses = $derived(
		twMerge(
			'px-3 py-2 sm:py-2.5 relative overflow-hidden', // Compact: 12px horizontal, 8-10px vertical
			variantClasses[variant],
			textureClasses[texture],
			// Legacy dithered support
			dithered && texture === 'none' && 'tx tx-strip tx-weak',
			className
		)
	);
</script>

<div class={headerClasses} {...restProps}>
	{@render children()}
</div>

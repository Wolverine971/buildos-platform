<!-- apps/web/src/lib/components/ui/CardFooter.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type FooterVariant = 'default' | 'muted' | 'transparent';
	type FooterTexture = 'none' | 'strip' | 'frame';
	type FooterPadding = 'sm' | 'md' | 'lg';
	type FooterAlign = 'start' | 'center' | 'end' | 'between';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		texture = 'none',
		padding = 'md',
		divider = true,
		align = 'end',
		class: className = '',
		children,
		...restProps
	}: {
		variant?: FooterVariant;
		texture?: FooterTexture;
		padding?: FooterPadding;
		divider?: boolean;
		align?: FooterAlign;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Variant styles
	const variantClasses: Record<FooterVariant, string> = {
		default: 'bg-muted',
		muted: 'bg-muted',
		transparent: 'bg-transparent'
	};

	// Texture classes - Inkprint
	const textureClasses: Record<FooterTexture, string> = {
		none: '',
		strip: 'tx tx-strip tx-weak',
		frame: 'tx tx-frame tx-weak'
	};

	// Padding optimized for high information density (8px grid system)
	const paddingClasses: Record<FooterPadding, string> = {
		sm: 'px-2.5 py-1.5 sm:px-3 sm:py-2', // 10x6 mobile, 12x8 tablet+
		md: 'px-3 py-2.5 sm:px-4 sm:py-3', // 12x10 mobile, 16x12 tablet+
		lg: 'px-4 py-3 sm:px-6 sm:py-4' // 16x12 mobile, 24x16 tablet+
	};

	// Alignment
	const alignClasses: Record<FooterAlign, string> = {
		start: 'justify-start',
		center: 'justify-center',
		end: 'justify-end',
		between: 'justify-between'
	};

	let footerClasses = $derived(
		twMerge(
			// Base styles
			'relative overflow-hidden',
			'flex items-center gap-2',

			// Padding
			paddingClasses[padding],

			// Variant background
			variantClasses[variant],

			// Divider
			divider && 'border-t border-border',

			// Alignment
			alignClasses[align],

			// Texture
			textureClasses[texture],

			// Custom classes
			className
		)
	);
</script>

<div class={footerClasses} {...restProps}>
	{@render children()}
</div>

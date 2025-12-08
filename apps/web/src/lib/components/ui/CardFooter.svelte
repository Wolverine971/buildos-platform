<!-- apps/web/src/lib/components/ui/CardFooter.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type FooterTexture = 'none' | 'strip' | 'frame';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		texture = 'none',
		divider = true,
		class: className = '',
		children,
		...restProps
	}: {
		texture?: FooterTexture;
		divider?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Texture classes - Inkprint
	const textureClasses = {
		none: '',
		strip: 'tx tx-strip tx-weak',
		frame: 'tx tx-frame tx-weak'
	};

	// Optimized for high information density
	let footerClasses = $derived(
		twMerge(
			'px-3 py-2 sm:py-2.5',
			divider && 'border-t border-border',
			'bg-muted/30',
			'flex items-center justify-end gap-2',
			'relative overflow-hidden',
			textureClasses[texture],
			className
		)
	);
</script>

<div class={footerClasses} {...restProps}>
	{@render children()}
</div>

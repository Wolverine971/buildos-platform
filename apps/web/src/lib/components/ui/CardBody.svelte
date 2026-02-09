<!-- apps/web/src/lib/components/ui/CardBody.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BodyPadding = 'none' | 'sm' | 'md' | 'lg';
	type BodyTexture = 'none' | 'bloom' | 'grain' | 'thread' | 'static';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		padding = 'md',
		texture = 'none',
		class: className = '',
		children,
		...restProps
	}: {
		padding?: BodyPadding;
		texture?: BodyTexture;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Padding optimized for high information density (8px grid system)
	const paddingClasses: Record<BodyPadding, string> = {
		none: '',
		sm: 'px-2.5 py-1.5 sm:px-3 sm:py-2', // 10x6 mobile, 12x8 tablet+
		md: 'px-3 py-2.5 sm:px-4 sm:py-3', // 12x10 mobile, 16x12 tablet+
		lg: 'px-4 py-3 sm:px-6 sm:py-4' // 16x12 mobile, 24x16 tablet+
	};

	// Texture classes - only for special cases where body needs different texture than card
	const textureClasses: Record<BodyTexture, string> = {
		none: '',
		bloom: 'tx tx-bloom tx-weak',
		grain: 'tx tx-grain tx-weak',
		thread: 'tx tx-thread tx-weak',
		static: 'tx tx-static tx-weak'
	};

	let bodyClasses = $derived(
		twMerge(paddingClasses[padding], textureClasses[texture], className)
	);
</script>

<div class={bodyClasses} {...restProps}>
	{@render children()}
</div>

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
		sm: 'px-3 py-2', // 12px x 8px
		md: 'px-4 py-3', // 16px x 12px
		lg: 'px-6 py-4' // 24px x 16px
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

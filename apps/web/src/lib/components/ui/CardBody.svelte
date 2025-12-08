<!-- apps/web/src/lib/components/ui/CardBody.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BodyPadding = 'sm' | 'md' | 'lg';
	type BodyTexture = 'none' | 'bloom' | 'grain' | 'thread' | 'static';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		padding = 'md',
		texture = 'none',
		dithered = false, // Legacy prop - use texture instead
		class: className = '',
		children,
		...restProps
	}: {
		padding?: BodyPadding;
		texture?: BodyTexture;
		dithered?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Optimized for high information density
	const paddingClasses = {
		sm: 'px-2 py-1.5', // Ultra compact: 8px horizontal, 6px vertical
		md: 'px-3 py-2.5', // Compact: 12px horizontal, 10px vertical
		lg: 'px-4 py-3' // Comfortable: 16px horizontal, 12px vertical
	};

	// Texture classes - Inkprint
	const textureClasses = {
		none: '',
		bloom: 'tx tx-bloom tx-weak',
		grain: 'tx tx-grain tx-weak',
		thread: 'tx tx-thread tx-weak',
		static: 'tx tx-static tx-weak'
	};

	let bodyClasses = $derived(
		twMerge(
			paddingClasses[padding],
			textureClasses[texture],
			// Legacy dithered support
			dithered && texture === 'none' && 'tx tx-grain tx-weak',
			className
		)
	);
</script>

<div class={bodyClasses} {...restProps}>
	{@render children()}
</div>

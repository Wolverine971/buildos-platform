<!-- apps/web/src/lib/components/ui/CardBody.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BodyPadding = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		padding = 'md',
		class: className = '',
		children,
		...restProps
	}: {
		padding?: BodyPadding;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Optimized for high information density (Apple-style)
	const paddingClasses = {
		sm: 'px-2 py-1.5', // Ultra compact: 8px horizontal, 6px vertical
		md: 'px-3 py-2.5', // Compact: 12px horizontal, 10px vertical
		lg: 'px-4 py-3' // Comfortable: 16px horizontal, 12px vertical
	};

	let bodyClasses = $derived(twMerge(paddingClasses[padding], className));
</script>

<div class={bodyClasses} {...restProps}>
	{@render children()}
</div>

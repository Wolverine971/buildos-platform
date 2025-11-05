<!-- apps/web/src/lib/components/ui/CardFooter.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		class: className = '',
		...restProps
	}: {
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Optimized for high information density (Apple-style)
	let footerClasses = $derived(
		twMerge(
			'px-3 py-2 sm:py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3',
			className
		)
	);
</script>

<div class={footerClasses} {...restProps}>
	<slot />
</div>

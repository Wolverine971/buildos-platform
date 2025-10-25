<!-- apps/web/src/lib/components/ui/CardFooter.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		class?: string;
	}

	let className = '';
	export { className as class };

	// Optimized for high information density (Apple-style)
	$: footerClasses = twMerge(
		'px-3 py-2 sm:py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3',
		className
	);
</script>

<div class={footerClasses} {...$$restProps}>
	<slot />
</div>

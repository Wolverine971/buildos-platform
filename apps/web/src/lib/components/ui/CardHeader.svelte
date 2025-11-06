<!-- apps/web/src/lib/components/ui/CardHeader.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type HeaderVariant = 'default' | 'gradient' | 'accent';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		variant = 'default',
		class: className = '',
		children,
		...restProps
	}: {
		variant?: HeaderVariant;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	const variantClasses = {
		default: 'bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700',
		gradient:
			'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-b border-gray-200 dark:border-gray-700',
		accent: 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 border-b border-gray-200 dark:border-gray-700'
	};

	// Optimized for high information density (Apple-style)
	let headerClasses = $derived(
		twMerge(
			'px-3 py-2 sm:py-2.5', // Compact: 12px horizontal, 8-10px vertical
			variantClasses[variant],
			className
		)
	);
</script>

<div class={headerClasses} {...restProps}>
	{@render children()}
</div>

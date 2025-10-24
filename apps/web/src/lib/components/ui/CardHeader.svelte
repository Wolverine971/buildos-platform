<!-- apps/web/src/lib/components/ui/CardHeader.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type HeaderVariant = 'default' | 'gradient' | 'accent';

	interface $$Props extends HTMLAttributes<HTMLDivElement> {
		variant?: HeaderVariant;
		class?: string;
	}

	export let variant: HeaderVariant = 'default';

	let className = '';
	export { className as class };

	const variantClasses = {
		default: 'bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700',
		gradient:
			'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-b border-gray-200 dark:border-gray-700',
		accent: 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 border-b border-gray-200 dark:border-gray-700'
	};

	$: headerClasses = twMerge(
		'px-4 sm:px-5 md:px-6 py-3 sm:py-4',
		variantClasses[variant],
		className
	);
</script>

<div class={headerClasses} {...$$restProps}>
	<slot />
</div>

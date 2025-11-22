<!-- apps/web/src/lib/components/ui/CardFooter.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		dithered = false,
		class: className = '',
		children,
		...restProps
	}: {
		dithered?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Optimized for high information density (Apple-style)
	let footerClasses = $derived(
		twMerge(
			'px-3 py-2 sm:py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3 relative overflow-hidden',
			dithered && 'card-footer-dithered',
			className
		)
	);
</script>

<div class={footerClasses} {...restProps}>
	{@render children()}
</div>

<style>
	/* Dithering for footer using mix-blend-mode (robust approach) */
	:global(.card-footer-dithered::before) {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.16;
		pointer-events: none;
	}

	/* Dark mode - white texture with soft-light blend */
	:global(.dark .card-footer-dithered::before) {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.2;
	}
</style>

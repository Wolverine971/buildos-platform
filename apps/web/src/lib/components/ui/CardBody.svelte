<!-- apps/web/src/lib/components/ui/CardBody.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BodyPadding = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		padding = 'md',
		dithered = false,
		class: className = '',
		children,
		...restProps
	}: {
		padding?: BodyPadding;
		dithered?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	// Optimized for high information density (Apple-style)
	const paddingClasses = {
		sm: 'px-2 py-1.5', // Ultra compact: 8px horizontal, 6px vertical
		md: 'px-3 py-2.5', // Compact: 12px horizontal, 10px vertical
		lg: 'px-4 py-3' // Comfortable: 16px horizontal, 12px vertical
	};

	let bodyClasses = $derived(
		twMerge(
			paddingClasses[padding],
			dithered && 'card-body-dithered relative overflow-hidden',
			className
		)
	);
</script>

<div class={bodyClasses} {...restProps}>
	{@render children()}
</div>

<style>
	/* Dithering for body using mix-blend-mode (robust approach) */
	:global(.card-body-dithered::before) {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.45' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.45' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.45' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.45' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.12;
		pointer-events: none;
	}

	/* Dark mode - white texture with soft-light blend */
	:global(.dark .card-body-dithered::before) {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.45' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.45' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.45' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.45' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.16;
	}
</style>

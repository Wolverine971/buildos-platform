<!-- apps/web/src/lib/components/ui/Badge.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
	type BadgeSize = 'sm' | 'md' | 'lg';
	type BadgeTexture = 'none' | 'grain' | 'static' | 'thread';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		variant?: BadgeVariant;
		size?: BadgeSize;
		texture?: BadgeTexture;
		icon?: Snippet;
		children?: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		texture = 'none',
		icon,
		children,
		class: className = '',
		...rest
	}: Props = $props();

	// Inkprint badge variants - clean, semantic colors
	const variantClasses: Record<BadgeVariant, string> = {
		default: 'bg-muted text-muted-foreground border border-border',
		success:
			'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
		warning:
			'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
		error: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
		info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
		accent: 'bg-accent/10 text-accent border border-accent/30'
	};

	// Inkprint: Badges are small elements - use rounded-md (0.375rem) consistently
	const sizeClasses: Record<BadgeSize, string> = {
		sm: 'px-2 py-0.5 text-xs rounded-md',
		md: 'px-2.5 py-1 text-xs rounded-md',
		lg: 'px-3 py-1.5 text-sm rounded-md' // Changed from rounded-lg for consistency
	};

	// Texture classes - Inkprint
	const textureClasses: Record<BadgeTexture, string> = {
		none: '',
		grain: 'tx tx-grain tx-weak',
		static: 'tx tx-static tx-weak',
		thread: 'tx tx-thread tx-weak'
	};

	let classes = $derived(
		twMerge(
			'inline-flex items-center gap-1.5 font-semibold tracking-tight',
			variantClasses[variant],
			sizeClasses[size],
			textureClasses[texture],
			className || ''
		)
	);
</script>

<span class={classes} {...rest}>
	{#if icon}
		<span class="flex-shrink-0">
			{@render icon()}
		</span>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</span>

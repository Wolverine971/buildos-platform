<!-- apps/web/src/lib/components/ui/Badge.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type BadgeVariant =
		| 'default'
		| 'secondary'
		| 'success'
		| 'warning'
		| 'error'
		| 'info'
		| 'accent';
	type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';
	type BadgeTexture = 'none' | 'grain' | 'static' | 'thread';

	interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'class'> {
		variant?: BadgeVariant;
		size?: BadgeSize;
		texture?: BadgeTexture;
		icon?: Snippet;
		children?: Snippet;
		class?: string;
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

	// Inkprint badge variants - semantic tokens (light/dark handled by token CSS vars).
	// `secondary` keeps a slightly more pronounced surface so it visually differs from `default`.
	const variantClasses: Record<BadgeVariant, string> = {
		default: 'bg-muted text-muted-foreground border border-border',
		secondary: 'bg-card text-foreground border border-border',
		success: 'bg-success/10 text-success border border-success/30',
		warning: 'bg-warning/10 text-warning border border-warning/30',
		error: 'bg-destructive/10 text-destructive border border-destructive/30',
		info: 'bg-info/10 text-info border border-info/30',
		accent: 'bg-accent/10 text-accent border border-accent/30'
	};

	// Inkprint: Badges are small elements - use rounded-md (0.375rem) consistently
	const sizeClasses: Record<BadgeSize, string> = {
		xs: 'px-1.5 py-0.5 text-[0.65rem] rounded-md',
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

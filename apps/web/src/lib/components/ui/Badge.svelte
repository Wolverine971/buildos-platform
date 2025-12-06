<!-- apps/web/src/lib/components/ui/Badge.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type BadgeVariant = 'success' | 'warning' | 'error' | 'info';
	type BadgeSize = 'sm' | 'md' | 'lg';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		variant?: BadgeVariant;
		size?: BadgeSize;
	}

	let { variant = 'info', size = 'md', class: className = '', ...rest }: Props = $props();

	// Scratchpad Ops badge variants - subtle, utilitarian
	const variantClasses: Record<BadgeVariant, string> = {
		success:
			'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-semibold tracking-tight',
		warning:
			'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold tracking-tight',
		error: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 font-semibold tracking-tight',
		info: 'bg-accent-blue/10 dark:bg-accent-blue/20 text-accent-blue dark:text-accent-blue border border-accent-blue/20 dark:border-accent-blue/30 font-semibold tracking-tight'
	};

	const sizeClasses: Record<BadgeSize, string> = {
		sm: 'px-2 py-0.5 text-xs font-semibold rounded',
		md: 'px-2.5 py-1 text-sm font-semibold rounded',
		lg: 'px-3 py-1.5 text-base font-semibold rounded'
	};

	const classes = `inline-flex items-center gap-1.5 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
</script>

<span class={classes} {...rest}>
	{#if $$slots.icon}
		<span class="flex-shrink-0">
			<slot name="icon" />
		</span>
	{/if}
	<slot />
</span>

<style>
	/* Additional styling can be added here if needed */
</style>

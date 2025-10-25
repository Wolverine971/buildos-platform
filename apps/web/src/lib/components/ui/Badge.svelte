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

	const variantClasses: Record<BadgeVariant, string> = {
		success: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800/50',
		warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50',
		error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/50',
		info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/50'
	};

	const sizeClasses: Record<BadgeSize, string> = {
		sm: 'px-2 py-1 text-xs font-medium rounded',
		md: 'px-2.5 py-1.5 text-sm font-medium rounded-md',
		lg: 'px-3 py-2 text-base font-medium rounded-lg'
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

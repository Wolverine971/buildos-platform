<!-- apps/web/src/lib/components/ui/Alert.svelte -->
<script lang="ts">
	import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type AlertVariant = 'info' | 'success' | 'warning' | 'error';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: AlertVariant;
		title?: string;
		description?: string;
		closeable?: boolean;
		onClose?: () => void;
	}

	let {
		variant = 'info',
		title,
		description,
		closeable = false,
		onClose,
		class: className = '',
		...rest
	}: Props = $props();

	let isVisible = $state(true);

	const variantConfig: Record<
		AlertVariant,
		{ icon: any; bg: string; border: string; text: string; icon_color: string }
	> = {
		info: {
			icon: Info,
			bg: 'bg-blue-50 dark:bg-blue-900/20',
			border: 'border border-blue-200 dark:border-blue-800/50',
			text: 'text-blue-800 dark:text-blue-200',
			icon_color: 'text-blue-600 dark:text-blue-400'
		},
		success: {
			icon: CheckCircle2,
			bg: 'bg-green-50 dark:bg-green-900/20',
			border: 'border border-green-200 dark:border-green-800/50',
			text: 'text-green-800 dark:text-green-200',
			icon_color: 'text-green-600 dark:text-green-400'
		},
		warning: {
			icon: AlertTriangle,
			bg: 'bg-amber-50 dark:bg-amber-900/20',
			border: 'border border-amber-200 dark:border-amber-800/50',
			text: 'text-amber-800 dark:text-amber-200',
			icon_color: 'text-amber-600 dark:text-amber-400'
		},
		error: {
			icon: AlertCircle,
			bg: 'bg-red-50 dark:bg-red-900/20',
			border: 'border border-red-200 dark:border-red-800/50',
			text: 'text-red-800 dark:text-red-200',
			icon_color: 'text-red-600 dark:text-red-400'
		}
	};

	const config = variantConfig[variant];

	function handleClose() {
		isVisible = false;
		onClose?.();
	}

	const containerClasses = `rounded-lg p-4 ${config.bg} ${config.border} ${config.text} ${className}`;
</script>

{#if isVisible}
	<div class={containerClasses} role="alert" {...rest}>
		<div class="flex gap-3">
			<!-- Icon -->
			{#if $$slots.icon}
				<div class="flex-shrink-0 flex items-start pt-0.5">
					<slot name="icon" />
				</div>
			{:else}
				<div class="flex-shrink-0 flex items-start pt-0.5">
					<svelte:component this={config.icon} class="w-5 h-5 {config.icon_color}" />
				</div>
			{/if}

			<!-- Content -->
			<div class="flex-1 min-w-0">
				{#if title}
					<h3 class="font-semibold text-sm mb-1">
						{title}
					</h3>
				{/if}

				{#if $$slots.default}
					<div class="text-sm {title ? 'opacity-90' : ''}">
						<slot />
					</div>
				{:else if description}
					<p class="text-sm {title ? 'opacity-90' : ''}">
						{description}
					</p>
				{/if}
			</div>

			<!-- Close button -->
			{#if closeable}
				<button
					class="flex-shrink-0 flex items-start pt-0.5 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-1 dark:focus:ring-offset-gray-800 rounded"
					onclick={handleClose}
					aria-label="Close alert"
				>
					<X class="w-5 h-5" />
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Additional styling can be added here if needed */
</style>

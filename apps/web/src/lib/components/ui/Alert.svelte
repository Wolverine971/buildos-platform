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

	// Scratchpad Ops design - Clean clarity zones for important information
	const variantConfig: Record<
		AlertVariant,
		{ icon: any; bg: string; border: string; text: string; icon_color: string }
	> = {
		info: {
			icon: Info,
			bg: 'bg-accent-blue/5 dark:bg-accent-blue/10',
			border: 'border border-accent-blue/20 dark:border-accent-blue/30',
			text: 'text-slate-900 dark:text-slate-100',
			icon_color: 'text-accent-blue'
		},
		success: {
			icon: CheckCircle2,
			bg: 'bg-emerald-50 dark:bg-emerald-900/10',
			border: 'border border-emerald-200 dark:border-emerald-800',
			text: 'text-slate-900 dark:text-slate-100',
			icon_color: 'text-emerald-600 dark:text-emerald-400'
		},
		warning: {
			icon: AlertTriangle,
			bg: 'bg-amber-50 dark:bg-amber-900/10',
			border: 'border border-amber-200 dark:border-amber-800',
			text: 'text-slate-900 dark:text-slate-100',
			icon_color: 'text-amber-600 dark:text-amber-400'
		},
		error: {
			icon: AlertCircle,
			bg: 'bg-red-50 dark:bg-red-900/10',
			border: 'border border-red-200 dark:border-red-800',
			text: 'text-slate-900 dark:text-slate-100',
			icon_color: 'text-red-600 dark:text-red-400'
		}
	};

	const config = variantConfig[variant];

	function handleClose() {
		isVisible = false;
		onClose?.();
	}

	const containerClasses = `rounded p-4 ${config.bg} ${config.border} ${config.text} ${className}`;
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
				{@const AlertIcon = config.icon}
				<div class="flex-shrink-0 flex items-start pt-0.5">
					<AlertIcon class="w-5 h-5 {config.icon_color}" />
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
					class="flex-shrink-0 flex items-start pt-0.5 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-accent-orange focus:ring-offset-1 dark:focus:ring-offset-slate-800 rounded"
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

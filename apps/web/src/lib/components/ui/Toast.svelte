<!-- apps/web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Toast } from '$lib/stores/toast.store';
	import Button from './Button.svelte';
	import { X } from 'lucide-svelte';

	interface Props {
		toast: Toast;
		ondismiss?: (id: string) => void;
	}

	let { toast, ondismiss }: Props = $props();

	function handleDismiss() {
		ondismiss?.(toast.id);
	}

	// Icon and color mappings for different toast types - Inkprint design
	const typeConfig = {
		success: {
			icon: '✓',
			bgClass:
				'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800',
			textClass: 'text-emerald-700 dark:text-emerald-300',
			iconClass: 'text-emerald-600 dark:text-emerald-400 font-bold'
		},
		error: {
			icon: '✕',
			bgClass: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
			textClass: 'text-red-700 dark:text-red-300',
			iconClass: 'text-red-600 dark:text-red-400 font-bold'
		},
		warning: {
			icon: '⚠',
			bgClass:
				'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',
			textClass: 'text-amber-700 dark:text-amber-300',
			iconClass: 'text-amber-600 dark:text-amber-400 font-bold'
		},
		info: {
			icon: 'ℹ',
			bgClass: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
			textClass: 'text-blue-700 dark:text-blue-300',
			iconClass: 'text-blue-600 dark:text-blue-400 font-bold'
		}
	};

	let config = $derived(typeConfig[toast.type]);
</script>

<div
	class="flex items-center gap-3 p-4 rounded-lg shadow-ink max-w-md w-full {config.bgClass}"
	transition:fly={{ x: 300, duration: 300 }}
>
	<!-- Icon -->
	<div class="flex-shrink-0">
		<div
			class="w-6 h-6 flex items-center justify-center rounded-full {config.iconClass} font-bold"
		>
			{config.icon}
		</div>
	</div>

	<!-- Message -->
	<div class="flex-1 {config.textClass} text-sm font-medium">
		{toast.message}
	</div>

	<!-- Dismiss button -->
	{#if toast.dismissible}
		<Button
			onclick={handleDismiss}
			variant="ghost"
			size="sm"
			icon={X}
			class="!p-1 flex-shrink-0 {config.textClass}"
			aria-label="Dismiss notification"
		/>
	{/if}
</div>

<!-- apps/web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { Toast } from '$lib/stores/toast.store';
	import Button from './Button.svelte';
	import { X } from 'lucide-svelte';

	export let toast: Toast;

	const dispatch = createEventDispatcher<{ dismiss: string }>();

	function handleDismiss() {
		dispatch('dismiss', toast.id);
	}

	// Icon and color mappings for different toast types
	const typeConfig = {
		success: {
			icon: '✓',
			bgClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
			textClass: 'text-green-800 dark:text-green-200',
			iconClass: 'text-green-600 dark:text-green-400'
		},
		error: {
			icon: '✕',
			bgClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
			textClass: 'text-red-800 dark:text-red-200',
			iconClass: 'text-red-600 dark:text-red-400'
		},
		warning: {
			icon: '⚠',
			bgClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
			textClass: 'text-yellow-800 dark:text-yellow-200',
			iconClass: 'text-yellow-600 dark:text-yellow-400'
		},
		info: {
			icon: 'ℹ',
			bgClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
			textClass: 'text-blue-800 dark:text-blue-200',
			iconClass: 'text-blue-600 dark:text-blue-400'
		}
	};

	$: config = typeConfig[toast.type];
</script>

<div
	class="flex items-center gap-3 p-4 rounded-lg border shadow-lg max-w-md w-full {config.bgClass}"
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

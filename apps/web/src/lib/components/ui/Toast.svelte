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
			bgClass:
				'bg-accent-olive/10 dark:bg-accent-olive/20 border-2 border-accent-olive/30 dark:border-accent-olive/40',
			textClass: 'text-accent-olive dark:text-accent-olive',
			iconClass: 'text-accent-olive dark:text-accent-olive font-bold'
		},
		error: {
			icon: '✕',
			bgClass: 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800',
			textClass: 'text-red-800 dark:text-red-200',
			iconClass: 'text-red-600 dark:text-red-400 font-bold'
		},
		warning: {
			icon: '⚠',
			bgClass:
				'bg-accent-orange/10 dark:bg-accent-orange/20 border-2 border-accent-orange/30 dark:border-accent-orange/40',
			textClass: 'text-accent-orange dark:text-accent-orange',
			iconClass: 'text-accent-orange dark:text-accent-orange font-bold'
		},
		info: {
			icon: 'ℹ',
			bgClass:
				'bg-accent-blue/10 dark:bg-accent-blue/20 border-2 border-accent-blue/30 dark:border-accent-blue/40',
			textClass: 'text-accent-blue dark:text-accent-blue',
			iconClass: 'text-accent-blue dark:text-accent-blue font-bold'
		}
	};

	$: config = typeConfig[toast.type];
</script>

<div
	class="flex items-center gap-3 p-4 rounded shadow-subtle max-w-md w-full {config.bgClass}"
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

<!-- apps/web/src/lib/components/notifications/PaymentWarning.svelte -->
<script lang="ts">
	import { AlertTriangle, CreditCard, X } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';

	export let notification: {
		id: string;
		title: string;
		message: string;
		priority: string;
		action_url?: string;
	};

	const dispatch = createEventDispatcher();

	function handleAction() {
		if (notification.action_url) {
			goto(notification.action_url);
		}
	}

	function dismiss() {
		dispatch('dismiss', { id: notification.id });
	}
</script>

<div
	class="relative bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4"
>
	<div class="flex">
		<div class="flex-shrink-0">
			<AlertTriangle class="h-5 w-5 text-red-600 dark:text-red-400" />
		</div>
		<div class="ml-3 flex-1">
			<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
				{notification.title}
			</h3>
			<div class="mt-2 text-sm text-red-700 dark:text-red-300">
				<p>{notification.message}</p>
			</div>
			{#if notification.action_url}
				<div class="mt-4">
					<Button
						onclick={handleAction}
						variant="danger"
						size="sm"
						icon={CreditCard}
						iconPosition="left"
					>
						Update Payment Method
					</Button>
				</div>
			{/if}
		</div>
		<div class="ml-auto pl-3">
			<Button
				onclick={dismiss}
				variant="ghost"
				size="sm"
				icon={X}
				class="text-red-400 hover:text-red-500 p-1 min-h-0"
				aria-label="Dismiss"
			></Button>
		</div>
	</div>
</div>

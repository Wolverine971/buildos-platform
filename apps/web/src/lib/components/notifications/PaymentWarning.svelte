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

<div class="relative bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4">
	<div class="flex">
		<div class="flex-shrink-0">
			<AlertTriangle class="h-5 w-5 text-destructive" />
		</div>
		<div class="ml-3 flex-1">
			<h3 class="text-sm font-medium text-destructive">
				{notification.title}
			</h3>
			<div class="mt-2 text-sm text-destructive">
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
				class="text-destructive/70 hover:text-destructive p-1 min-h-0"
				aria-label="Dismiss"
			></Button>
		</div>
	</div>
</div>

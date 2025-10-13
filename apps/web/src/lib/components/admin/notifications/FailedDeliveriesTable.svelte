<!-- apps/web/src/lib/components/admin/notifications/FailedDeliveriesTable.svelte -->
<script lang="ts">
	import { AlertCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { FailedDelivery } from '$lib/services/notification-analytics.service';

	interface Props {
		data: FailedDelivery[];
		loading?: boolean;
		onRetry?: (deliveryId: string) => void;
		onResend?: (deliveryId: string) => void;
	}

	let { data, loading = false, onRetry, onResend }: Props = $props();

	let selectedError = $state<FailedDelivery | null>(null);
	let showErrorModal = $state(false);

	function openErrorModal(delivery: FailedDelivery) {
		selectedError = delivery;
		showErrorModal = true;
	}

	function closeErrorModal() {
		showErrorModal = false;
		selectedError = null;
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		const days = Math.floor(hours / 24);
		return `${days} day${days > 1 ? 's' : ''} ago`;
	}

	function getChannelBadgeColor(channel: string): string {
		const colors: Record<string, string> = {
			push: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			email: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			sms: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
			in_app: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
		};
		return colors[channel] || 'bg-gray-100 text-gray-800';
	}
</script>

<div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
	<div class="px-6 py-4 border-b border-red-200 dark:border-red-800">
		<div class="flex items-center">
			<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
			<h3 class="text-lg font-semibold text-red-800 dark:text-red-200">
				Failed Deliveries (Last 24h)
			</h3>
		</div>
	</div>

	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(3) as _}
				<div class="animate-pulse">
					<div class="h-16 bg-red-100 dark:bg-red-900/40 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if data.length === 0}
		<div class="p-6 text-center text-gray-500">No failed deliveries</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-red-200 dark:divide-red-800">
				<thead class="bg-red-100 dark:bg-red-900/40">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Time
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Channel
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Recipient
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Error
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Attempts
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-red-900 dark:text-red-200 uppercase tracking-wider"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody
					class="bg-white dark:bg-gray-800 divide-y divide-red-200 dark:divide-red-800"
				>
					{#each data as delivery}
						<tr class="hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{formatDate(delivery.created_at)}
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{delivery.event_type}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
										delivery.channel
									)}"
								>
									{delivery.channel}
								</span>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{delivery.recipient_email}
							</td>
							<td class="px-6 py-4 text-sm max-w-xs">
								<button
									type="button"
									class="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline decoration-dotted cursor-pointer text-left truncate block w-full"
									onclick={() => openErrorModal(delivery)}
									title="Click to view full error"
								>
									{delivery.last_error}
								</button>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{delivery.attempts}/{delivery.max_attempts}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
								{#if delivery.attempts < delivery.max_attempts}
									<Button
										size="sm"
										variant="secondary"
										on:click={() => onRetry?.(delivery.delivery_id)}
									>
										Retry
									</Button>
								{/if}
								<Button
									size="sm"
									variant="secondary"
									on:click={() => onResend?.(delivery.delivery_id)}
								>
									Resend
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Error Details Modal -->
<Modal isOpen={showErrorModal} onClose={closeErrorModal} title="Error Details" size="lg">
	{#if selectedError}
		{@const delivery = selectedError}
		<div class="p-6 space-y-4">
			<!-- Delivery Information -->
			<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
				<h4 class="font-semibold text-gray-900 dark:text-white">Delivery Information</h4>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-gray-500 dark:text-gray-400">Event Type:</span>
						<span class="ml-2 text-gray-900 dark:text-white">{delivery.event_type}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Channel:</span>
						<span
							class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
								delivery.channel
							)}"
						>
							{delivery.channel}
						</span>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Recipient:</span>
						<span class="ml-2 text-gray-900 dark:text-white"
							>{delivery.recipient_email}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Time:</span>
						<span class="ml-2 text-gray-900 dark:text-white"
							>{formatDate(delivery.created_at)}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Attempts:</span>
						<span class="ml-2 text-gray-900 dark:text-white"
							>{delivery.attempts}/{delivery.max_attempts}</span
						>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Delivery ID:</span>
						<span class="ml-2 text-gray-900 dark:text-white font-mono text-xs"
							>{delivery.delivery_id}</span
						>
					</div>
				</div>
			</div>

			<!-- Error Message -->
			<div
				class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
			>
				<h4 class="font-semibold text-red-800 dark:text-red-200 mb-2">Error Message</h4>
				<div
					class="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-words"
				>
					{delivery.last_error}
				</div>
			</div>

			<!-- Action Buttons -->
			<div
				class="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700"
			>
				{#if delivery.attempts < delivery.max_attempts}
					<Button
						variant="secondary"
						on:click={() => {
							onRetry?.(delivery.delivery_id);
							closeErrorModal();
						}}
					>
						Retry Delivery
					</Button>
				{/if}
				<Button
					variant="primary"
					on:click={() => {
						onResend?.(delivery.delivery_id);
						closeErrorModal();
					}}
				>
					Resend Delivery
				</Button>
			</div>
		</div>
	{/if}
</Modal>

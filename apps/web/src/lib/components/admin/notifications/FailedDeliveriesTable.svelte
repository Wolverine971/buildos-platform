<!-- apps/web/src/lib/components/admin/notifications/FailedDeliveriesTable.svelte -->
<script lang="ts">
	import { AlertCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { FailedDelivery } from '$lib/services/notification-analytics.service';

	interface Props {
		data: FailedDelivery[];
		loading?: boolean;
		onRetry?: (deliveryId: string) => void;
		onResend?: (deliveryId: string) => void;
	}

	let { data, loading = false, onRetry, onResend }: Props = $props();

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
				<tbody class="bg-white dark:bg-gray-800 divide-y divide-red-200 dark:divide-red-800">
					{#each data as delivery}
						<tr class="hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
								{formatDate(delivery.created_at)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
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
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
								{delivery.recipient_email}
							</td>
							<td class="px-6 py-4 text-sm text-red-600 dark:text-red-400 max-w-xs truncate">
								{delivery.last_error}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
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

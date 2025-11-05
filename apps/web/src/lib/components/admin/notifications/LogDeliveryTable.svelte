<!-- apps/web/src/lib/components/admin/notifications/LogDeliveryTable.svelte -->
<script lang="ts">
	import { Eye, RotateCw, Send, Clock, CheckCircle, XCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { NotificationChannel } from '@buildos/shared-types';

	interface NotificationDelivery {
		id: string;
		event_id: string;
		recipient_user_id: string;
		channel: NotificationChannel;
		channel_identifier: string | null;
		status: string;
		payload: Record<string, any>;
		created_at: string;
		sent_at: string | null;
		delivered_at: string | null;
		failed_at: string | null;
		opened_at: string | null;
		clicked_at: string | null;
		last_error: string | null;
		metadata?: Record<string, any>;
		notification_events?: {
			id: string;
			event_type: string;
			event_source: string;
		};
		users?: {
			id: string;
			email: string;
			name?: string;
		};
		timeline: {
			created: string;
			sent: string | null;
			delivered: string | null;
			failed: string | null;
			opened: string | null;
			clicked: string | null;
		};
		durations: {
			to_send: number | null;
			to_deliver: number | null;
			to_open: number | null;
		};
	}

	interface Props {
		deliveries: NotificationDelivery[];
		loading?: boolean;
		onViewDetails?: (deliveryId: string) => void;
		onRetry?: (deliveryId: string) => void;
		onResend?: (deliveryId: string) => void;
	}

	let { deliveries, loading = false, onViewDetails, onRetry, onResend }: Props = $props();

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'N/A';
		return new Date(dateString).toLocaleString();
	}

	function formatDuration(ms: number | null): string {
		if (!ms) return 'N/A';
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function getChannelBadgeColor(channel: NotificationChannel): string {
		const colors: Record<NotificationChannel, string> = {
			push: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			email: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
			sms: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			in_app: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
		};
		return colors[channel] || 'bg-gray-100 text-gray-800';
	}

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
			sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
			bounced: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
			opened: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
			clicked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}

	function getTimelineIcon(stage: string) {
		switch (stage) {
			case 'created':
				return Clock;
			case 'sent':
				return Send;
			case 'delivered':
				return CheckCircle;
			case 'failed':
				return XCircle;
			default:
				return Clock;
		}
	}

	function getTimelineColor(stage: string, completed: boolean) {
		if (!completed) return 'text-gray-300 dark:text-gray-600';
		switch (stage) {
			case 'created':
				return 'text-blue-500';
			case 'sent':
				return 'text-indigo-500';
			case 'delivered':
				return 'text-green-500';
			case 'failed':
				return 'text-red-500';
			default:
				return 'text-gray-500';
		}
	}
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(5) as _}
				<div class="animate-pulse">
					<div class="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if deliveries.length === 0}
		<div class="p-6 text-center text-gray-500 dark:text-gray-400">No deliveries found</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-gray-50 dark:bg-gray-900">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Channel
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Recipient
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Timeline
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Performance
						</th>
						<th
							class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Actions
						</th>
					</tr>
				</thead>
				<tbody
					class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
				>
					{#each deliveries as delivery}
						<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{#if delivery.notification_events}
									{delivery.notification_events.event_type
										.replace(/_/g, ' ')
										.replace(/\b\w/g, (l) => l.toUpperCase())}
								{:else}
									N/A
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
										delivery.channel
									)}"
								>
									{delivery.channel.toUpperCase()}
								</span>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{#if delivery.users}
									<div>
										<div class="font-medium">
											{delivery.users.name || 'N/A'}
										</div>
										<div class="text-xs text-gray-500">
											{delivery.users.email}
										</div>
									</div>
								{:else}
									<span class="text-gray-400">N/A</span>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadgeColor(
										delivery.status
									)}"
								>
									{delivery.status.toUpperCase()}
								</span>
								{#if delivery.last_error}
									<div
										class="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs truncate"
									>
										{delivery.last_error}
									</div>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center space-x-2">
									{#each Object.entries(delivery.timeline) as [stage, timestamp]}
										{#if stage !== 'created'}
											{@const GetTimelineIconstage = getTimelineIcon(stage)}
											<div
												class="flex flex-col items-center"
												title="{stage}: {formatDate(timestamp)}"
											>
												<GetTimelineIconstage
													class="w-4 h-4 {getTimelineColor(
														stage,
														!!timestamp
													)}"
												/>
												<span class="text-xs text-gray-400 mt-0.5"
													>{stage}</span
												>
											</div>
										{/if}
									{/each}
								</div>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
							>
								<div class="text-xs space-y-1">
									<div>Send: {formatDuration(delivery.durations.to_send)}</div>
									<div>
										Deliver: {formatDuration(delivery.durations.to_deliver)}
									</div>
									{#if delivery.durations.to_open}
										<div>
											Open: {formatDuration(delivery.durations.to_open)}
										</div>
									{/if}
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
								<div class="flex justify-end space-x-2">
									{#if onViewDetails}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onViewDetails?.(delivery.id)}
											icon={Eye}
										>
											View
										</Button>
									{/if}
									{#if onRetry && delivery.status === 'failed'}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onRetry?.(delivery.id)}
											icon={RotateCw}
										>
											Retry
										</Button>
									{/if}
									{#if onResend}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => onResend?.(delivery.id)}
											icon={Send}
										>
											Resend
										</Button>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

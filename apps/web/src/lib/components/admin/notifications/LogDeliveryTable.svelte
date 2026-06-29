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

	let hasActions = $derived(!!(onViewDetails || onRetry || onResend));

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

	function getChannelBadgeColor(_channel: NotificationChannel): string {
		// Channel is a category, not a state — use a single neutral badge.
		return 'bg-muted text-foreground dark:text-muted-foreground';
	}

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending: 'bg-warning/10 text-warning',
			cancelled: 'bg-muted text-muted-foreground',
			sent: 'bg-info/10 text-info',
			delivered: 'bg-success/10 text-success',
			failed: 'bg-destructive/10 text-destructive',
			bounced: 'bg-accent/10 text-accent',
			opened: 'bg-info/10 text-info',
			clicked: 'bg-accent/10 text-accent'
		};
		return colors[status] || 'bg-muted text-foreground';
	}

	function getTimelineIcon(stage: string) {
		switch (stage) {
			case 'created':
				return Clock;
			case 'sent':
				return Send;
			case 'delivered':
				return CheckCircle;
			case 'cancelled':
				return Clock;
			case 'failed':
				return XCircle;
			default:
				return Clock;
		}
	}

	function getTimelineColor(stage: string, completed: boolean) {
		if (!completed) return 'text-muted-foreground';
		switch (stage) {
			case 'created':
				return 'text-info';
			case 'sent':
				return 'text-info';
			case 'delivered':
				return 'text-success';
			case 'cancelled':
				return 'text-warning';
			case 'failed':
				return 'text-destructive';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<div class="bg-card rounded-lg shadow-ink border border-border overflow-hidden">
	{#if loading}
		<div class="p-3 space-y-2">
			{#each Array(5) as _}
				<div class="animate-pulse motion-reduce:animate-none">
					<div class="h-20 bg-muted rounded-md"></div>
				</div>
			{/each}
		</div>
	{:else if deliveries.length === 0}
		<div class="p-4 text-center text-sm text-muted-foreground">No deliveries found</div>
	{:else}
		<!-- Mobile card list -->
		<div class="block lg:hidden divide-y divide-border">
			{#each deliveries as delivery (delivery.id)}
				<div class="p-3 space-y-3">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="font-medium text-foreground">
								{#if delivery.notification_events}
									{delivery.notification_events.event_type
										.replace(/_/g, ' ')
										.replace(/\b\w/g, (l) => l.toUpperCase())}
								{:else}
									N/A
								{/if}
							</div>
							{#if delivery.users}
								<div class="text-xs text-muted-foreground truncate">
									{delivery.users.name || 'N/A'} · {delivery.users.email}
								</div>
							{:else}
								<div class="text-xs text-muted-foreground">N/A</div>
							{/if}
						</div>
						<div class="flex flex-col items-end gap-1 flex-shrink-0">
							<span
								class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
									delivery.channel
								)}"
							>
								{delivery.channel.toUpperCase()}
							</span>
							<span
								class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadgeColor(
									delivery.status
								)}"
							>
								{delivery.status.toUpperCase()}
							</span>
						</div>
					</div>
					{#if delivery.last_error}
						<div class="text-xs text-destructive">
							{delivery.last_error}
						</div>
					{/if}
					<div>
						<div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">
							Timeline
						</div>
						<div class="flex items-center space-x-2">
							{#each Object.entries(delivery.timeline) as [stage, timestamp]}
								{#if stage !== 'created'}
									{@const GetTimelineIconstage = getTimelineIcon(stage)}
									<div
										class="flex flex-col items-center"
										title="{stage}: {formatDate(timestamp)}"
									>
										<GetTimelineIconstage
											class="w-4 h-4 {getTimelineColor(stage, !!timestamp)}"
										/>
										<span class="text-xs text-muted-foreground mt-0.5"
											>{stage}</span
										>
									</div>
								{/if}
							{/each}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">
							Performance
						</div>
						<div class="text-xs text-muted-foreground space-y-1">
							<div>Send: {formatDuration(delivery.durations.to_send)}</div>
							<div>Deliver: {formatDuration(delivery.durations.to_deliver)}</div>
							{#if delivery.durations.to_open}
								<div>Open: {formatDuration(delivery.durations.to_open)}</div>
							{/if}
						</div>
					</div>
					{#if hasActions}
						<div class="flex flex-wrap gap-2">
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
					{/if}
				</div>
			{/each}
		</div>

		<!-- Desktop table -->
		<div class="hidden lg:block overflow-x-auto">
			<table class="min-w-full divide-y divide-border">
				<thead class="bg-muted">
					<tr>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Channel
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Recipient
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Status
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Timeline
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Performance
						</th>
						{#if hasActions}
							<th
								class="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
							>
								Actions
							</th>
						{/if}
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-border">
					{#each deliveries as delivery (delivery.id)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{#if delivery.notification_events}
									{delivery.notification_events.event_type
										.replace(/_/g, ' ')
										.replace(/\b\w/g, (l) => l.toUpperCase())}
								{:else}
									N/A
								{/if}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
										delivery.channel
									)}"
								>
									{delivery.channel.toUpperCase()}
								</span>
							</td>
							<td class="px-3 py-2.5 text-sm text-foreground max-w-[200px]">
								{#if delivery.users}
									<div class="min-w-0">
										<div class="font-medium truncate">
											{delivery.users.name || 'N/A'}
										</div>
										<div class="text-xs text-muted-foreground truncate">
											{delivery.users.email}
										</div>
									</div>
								{:else}
									<span class="text-muted-foreground">N/A</span>
								{/if}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getStatusBadgeColor(
										delivery.status
									)}"
								>
									{delivery.status.toUpperCase()}
								</span>
								{#if delivery.last_error}
									<div class="text-xs text-destructive mt-1 max-w-xs truncate">
										{delivery.last_error}
									</div>
								{/if}
							</td>
							<td class="px-3 py-2.5">
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
												<span class="text-xs text-muted-foreground mt-0.5"
													>{stage}</span
												>
											</div>
										{/if}
									{/each}
								</div>
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-muted-foreground">
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
							{#if hasActions}
								<td
									class="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium"
								>
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
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

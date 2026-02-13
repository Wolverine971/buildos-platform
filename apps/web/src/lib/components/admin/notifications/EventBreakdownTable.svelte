<!-- apps/web/src/lib/components/admin/notifications/EventBreakdownTable.svelte -->
<script lang="ts">
	import type { EventMetrics } from '$lib/services/notification-analytics.service';

	interface Props {
		data: EventMetrics[];
		loading?: boolean;
	}

	let { data, loading = false }: Props = $props();

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatPercentage(num: number | null | undefined): string {
		if (num == null) return '0.0%';
		return `${num.toFixed(1)}%`;
	}

	function formatEventType(eventType: string): string {
		return eventType
			.split('.')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getEventTypeBadgeColor(eventType: string): string {
		if (eventType.startsWith('user.'))
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
		if (eventType.startsWith('brief.'))
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
		if (eventType.startsWith('error.'))
			return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
		return 'bg-muted text-foreground dark:text-muted-foreground';
	}
</script>

<div class="bg-card rounded-lg shadow overflow-hidden">
	<div class="px-6 py-4 border-b border-border">
		<h3 class="text-lg font-semibold text-foreground">Event Type Breakdown</h3>
	</div>

	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(5) as _}
				<div class="animate-pulse">
					<div class="h-10 bg-muted rounded"></div>
				</div>
			{/each}
		</div>
	{:else if data.length === 0}
		<div class="p-6 text-center text-muted-foreground">No event data available</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-muted">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Event Type
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Events
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Deliveries
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Subscribers
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Avg Delivery Time
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Open Rate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Click Rate
						</th>
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-gray-200 dark:divide-gray-700">
					{#each data as event}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
										event.event_type
									)}"
								>
									{formatEventType(event.event_type)}
								</span>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground"
							>
								{formatNumber(event.total_events)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{formatNumber(event.total_deliveries)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{formatNumber(event.unique_subscribers)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{event.avg_delivery_time_seconds != null
									? `${event.avg_delivery_time_seconds.toFixed(2)}s`
									: 'N/A'}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{formatPercentage(event.open_rate)}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{formatPercentage(event.click_rate)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

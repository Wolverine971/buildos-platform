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

	function getEventTypeBadgeColor(_eventType: string): string {
		// Event type is a category, not a state — use a single neutral badge.
		return 'bg-muted text-foreground dark:text-muted-foreground';
	}
</script>

<div class="bg-card rounded-lg shadow-ink border border-border overflow-hidden">
	<div class="px-3 py-2.5 border-b border-border">
		<h3 class="text-lg font-semibold text-foreground">Event Type Breakdown</h3>
	</div>

	{#if loading}
		<div class="p-3 space-y-2">
			{#each Array(5) as _}
				<div class="animate-pulse motion-reduce:animate-none">
					<div class="h-10 bg-muted rounded-md"></div>
				</div>
			{/each}
		</div>
	{:else if data.length === 0}
		<div class="p-4 text-center text-sm text-muted-foreground">No event data available</div>
	{:else}
		<!-- Mobile card list -->
		<div class="block lg:hidden divide-y divide-border">
			{#each data as event (event.event_type)}
				<div class="p-3 space-y-3">
					<span
						class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
							event.event_type
						)}"
					>
						{formatEventType(event.event_type)}
					</span>
					<div class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Events
							</div>
							<div class="font-medium text-foreground">
								{formatNumber(event.total_events)}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Deliveries
							</div>
							<div class="text-foreground">
								{formatNumber(event.total_deliveries)}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Recipients
							</div>
							<div class="text-foreground">
								{formatNumber(event.unique_subscribers)}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Avg Delivery Time
							</div>
							<div class="text-foreground">
								{event.avg_delivery_time_seconds != null
									? `${event.avg_delivery_time_seconds.toFixed(2)}s`
									: 'N/A'}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Open Rate
							</div>
							<div class="text-foreground">{formatPercentage(event.open_rate)}</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground uppercase tracking-wider">
								Click Rate
							</div>
							<div class="text-foreground">{formatPercentage(event.click_rate)}</div>
						</div>
					</div>
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
							Events
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Deliveries
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Recipients
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Avg Delivery Time
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Open Rate
						</th>
						<th
							class="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Click Rate
						</th>
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-border">
					{#each data as event (event.event_type)}
						<tr class="hover:bg-muted transition-colors">
							<td class="px-3 py-2.5 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getEventTypeBadgeColor(
										event.event_type
									)}"
								>
									{formatEventType(event.event_type)}
								</span>
							</td>
							<td
								class="px-3 py-2.5 whitespace-nowrap text-sm font-medium text-foreground"
							>
								{formatNumber(event.total_events)}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{formatNumber(event.total_deliveries)}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{formatNumber(event.unique_subscribers)}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{event.avg_delivery_time_seconds != null
									? `${event.avg_delivery_time_seconds.toFixed(2)}s`
									: 'N/A'}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{formatPercentage(event.open_rate)}
							</td>
							<td class="px-3 py-2.5 whitespace-nowrap text-sm text-foreground">
								{formatPercentage(event.click_rate)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

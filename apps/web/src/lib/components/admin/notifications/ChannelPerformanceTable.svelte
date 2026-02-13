<!-- apps/web/src/lib/components/admin/notifications/ChannelPerformanceTable.svelte -->
<script lang="ts">
	import type { ChannelMetrics } from '$lib/services/notification-analytics.service';

	interface Props {
		data: ChannelMetrics[];
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

	function formatTime(ms: number | null | undefined): string {
		if (ms == null) return 'N/A';
		if (ms < 1000) return `${ms.toFixed(0)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function getSuccessRateColor(rate: number | null | undefined): string {
		if (rate == null) return 'text-muted-foreground';
		if (rate >= 95) return 'text-green-600';
		if (rate >= 85) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getDeliveryRateColor(rate: number | null | undefined): string {
		if (rate == null) return 'text-muted-foreground';
		if (rate >= 90) return 'text-green-600';
		if (rate >= 75) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getChannelBadgeColor(channel: string): string {
		const colors: Record<string, string> = {
			push: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			email: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			sms: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
			in_app: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
		};
		return colors[channel] || 'bg-muted text-foreground dark:text-muted-foreground';
	}
</script>

<div class="bg-card rounded-lg shadow overflow-hidden">
	<div class="px-6 py-4 border-b border-border">
		<h3 class="text-lg font-semibold text-foreground">Channel Performance</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			Track notification delivery metrics across channels. <span class="font-medium"
				>Success Rate</span
			>
			shows % sent successfully, while
			<span class="font-medium">Delivery Rate</span> shows % confirmed delivered.
		</p>
	</div>

	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(4) as _}
				<div class="animate-pulse">
					<div class="h-10 bg-muted rounded"></div>
				</div>
			{/each}
		</div>
	{:else if data.length === 0}
		<div class="p-6 text-center text-muted-foreground">No channel data available</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-muted">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Channel
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Total
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Sent
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Delivered
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Success Rate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Delivery Rate
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
						<th
							class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
						>
							Avg Time
						</th>
					</tr>
				</thead>
				<tbody class="bg-card divide-y divide-gray-200 dark:divide-gray-700">
					{#each data as channel}
						<tr class="hover:bg-muted transition-colors">
							<!-- Channel -->
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
										channel.channel
									)}"
								>
									{channel.channel}
								</span>
							</td>
							<!-- Total (all notifications) -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								<div>
									<div class="font-medium">
										{formatNumber(channel.total_sent)}
									</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(channel.failed)} failed
									</div>
								</div>
							</td>
							<!-- Sent (status='sent') -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								<div class="font-medium">
									{formatNumber(channel.sent)}
								</div>
							</td>
							<!-- Delivered (status='delivered') -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								<div>
									<div class="font-medium">
										{formatNumber(channel.delivered)}
									</div>
									<div class="text-xs text-muted-foreground">confirmed</div>
								</div>
							</td>
							<!-- Success Rate (% sent successfully) -->
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="flex items-center">
									<div class="flex-1">
										<div
											class="text-sm font-medium {getSuccessRateColor(
												channel.success_rate
											)}"
										>
											{formatPercentage(channel.success_rate)}
										</div>
										<div class="w-16 bg-muted rounded-full h-1.5 mt-1">
											<div
												class="bg-blue-600 h-1.5 rounded-full"
												style="width: {channel.success_rate ?? 0}%"
											></div>
										</div>
									</div>
								</div>
							</td>
							<!-- Delivery Rate (% of sent that were delivered) - NEW -->
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="flex items-center">
									<div class="flex-1">
										<div
											class="text-sm font-medium {getDeliveryRateColor(
												channel.delivery_rate
											)}"
										>
											{formatPercentage(channel.delivery_rate)}
										</div>
										<div class="w-16 bg-muted rounded-full h-1.5 mt-1">
											<div
												class="bg-green-600 h-1.5 rounded-full"
												style="width: {channel.delivery_rate ?? 0}%"
											></div>
										</div>
									</div>
								</div>
							</td>
							<!-- Open Rate -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								<div>
									<div>{formatPercentage(channel.open_rate)}</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(channel.opened)} opened
									</div>
								</div>
							</td>
							<!-- Click Rate -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								<div>
									<div>{formatPercentage(channel.click_rate)}</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(channel.clicked)} clicked
									</div>
								</div>
							</td>
							<!-- Avg Delivery Time -->
							<td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
								{formatTime(channel.avg_delivery_time_ms)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

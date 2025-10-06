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
		if (rate == null) return 'text-gray-500';
		if (rate >= 95) return 'text-green-600';
		if (rate >= 85) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getChannelBadgeColor(channel: string): string {
		const colors: Record<string, string> = {
			push: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			email: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
			sms: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
			in_app: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
		};
		return colors[channel] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
	}
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
	<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Channel Performance</h3>
	</div>

	{#if loading}
		<div class="p-6 space-y-3">
			{#each Array(4) as _}
				<div class="animate-pulse">
					<div class="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>
			{/each}
		</div>
	{:else if data.length === 0}
		<div class="p-6 text-center text-gray-500">No channel data available</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead class="bg-gray-50 dark:bg-gray-900">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Channel
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Sent
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Success Rate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Open Rate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Click Rate
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Avg Delivery
						</th>
					</tr>
				</thead>
				<tbody
					class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
				>
					{#each data as channel}
						<tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
							<td class="px-6 py-4 whitespace-nowrap">
								<span
									class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getChannelBadgeColor(
										channel.channel
									)}"
								>
									{channel.channel}
								</span>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								<div>
									<div class="font-medium">
										{formatNumber(channel.total_sent)}
									</div>
									<div class="text-xs text-gray-500">
										{formatNumber(channel.failed)} failed
									</div>
								</div>
							</td>
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
										<div class="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
											<div
												class="bg-blue-600 h-1.5 rounded-full"
												style="width: {channel.success_rate ?? 0}%"
											></div>
										</div>
									</div>
								</div>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								<div>
									<div>{formatPercentage(channel.open_rate)}</div>
									<div class="text-xs text-gray-500">
										{formatNumber(channel.opened)} opened
									</div>
								</div>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								<div>
									<div>{formatPercentage(channel.click_rate)}</div>
									<div class="text-xs text-gray-500">
										{formatNumber(channel.clicked)} clicked
									</div>
								</div>
							</td>
							<td
								class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
							>
								{formatTime(channel.avg_delivery_time_ms)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- apps/web/src/routes/admin/llm-usage/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let days = $state(30);
	let stats = $state<any>(null);

	// Fetch stats
	async function fetchStats() {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/llm-usage/stats?days=${days}`);
			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to fetch stats');
			}

			stats = result.data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
			console.error('Error fetching LLM stats:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchStats();
	});

	// Format currency
	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		}).format(amount);
	}

	// Format number with commas
	function formatNumber(num: number): string {
		return new Intl.NumberFormat('en-US').format(num);
	}

	// Format percentage
	function formatPercent(num: number): string {
		return `${num.toFixed(1)}%`;
	}

	// Get status badge color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
			case 'failure':
				return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
			case 'timeout':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
		}
	}
</script>

<div class="space-y-12">
	<div class="space-y-10">
		<!-- Header -->
		<div class="mb-4 sm:mb-6">
			<h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
				LLM Usage Dashboard
			</h1>
			<p class="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
				Monitor AI API usage, costs, and performance across the platform
			</p>
		</div>

		<!-- Filters -->
		<div
			class="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"
		>
			<label class="flex items-center gap-2 w-full sm:w-auto">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Time Range:</span
				>
				<select
					bind:value={days}
					onchange={() => fetchStats()}
					class="flex-1 sm:flex-initial rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
				>
					<option value={7}>Last 7 days</option>
					<option value={30}>Last 30 days</option>
					<option value={90}>Last 90 days</option>
					<option value={365}>Last year</option>
				</select>
			</label>

			<button
				onclick={() => fetchStats()}
				class="w-full sm:w-auto rounded-lg bg-purple-600 dark:bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
			>
				Refresh
			</button>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 dark:border-purple-400 border-t-transparent"
				></div>
			</div>
		{:else if error}
			<div
				class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-800 dark:text-red-200"
			>
				<p class="font-medium">Error loading stats</p>
				<p class="text-sm">{error}</p>
			</div>
		{:else if stats}
			<!-- Overview Cards -->
			<div
				class="mb-4 sm:mb-6 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
			>
				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Cost</p>
					<p
						class="mt-2 text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400"
					>
						{formatCurrency(stats.overview.totalCost)}
					</p>
				</div>

				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
						Total Requests
					</p>
					<p class="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
						{formatNumber(stats.overview.totalRequests)}
					</p>
				</div>

				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Tokens</p>
					<p class="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
						{formatNumber(stats.overview.totalTokens)}
					</p>
				</div>

				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
						Avg Cost/Request
					</p>
					<p class="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
						{formatCurrency(stats.overview.avgCostPerRequest)}
					</p>
				</div>

				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">Success Rate</p>
					<p
						class="mt-2 text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400"
					>
						{formatPercent(stats.overview.successRate)}
					</p>
				</div>

				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
						Avg Response Time
					</p>
					<p class="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
						{Math.round(stats.overview.avgResponseTime)}ms
					</p>
				</div>
			</div>

			<!-- Charts Row -->
			<div class="mb-4 sm:mb-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
				<!-- Cost Over Time -->
				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<h3
						class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white"
					>
						Cost Over Time
					</h3>
					<div class="h-64">
						{#if stats.dailyData.length > 0}
							<div class="space-y-2">
								{#each stats.dailyData.slice(-14) as day}
									<div class="flex items-center gap-2">
										<span
											class="w-16 sm:w-20 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
											>{day.summary_date}</span
										>
										<div class="flex-1">
											<div
												class="h-6 rounded bg-purple-600 dark:bg-purple-500"
												style="width: {(Number(day.total_cost_usd) /
													Math.max(
														...stats.dailyData.map((d: any) =>
															Number(d.total_cost_usd)
														)
													)) *
													100}%"
											></div>
										</div>
										<span
											class="w-16 sm:w-20 text-right text-xs sm:text-sm font-medium text-gray-900 dark:text-white"
										>
											{formatCurrency(Number(day.total_cost_usd))}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-gray-500 dark:text-gray-400">
								No data available
							</p>
						{/if}
					</div>
				</div>

				<!-- Requests Over Time -->
				<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
					<h3
						class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white"
					>
						Requests Over Time
					</h3>
					<div class="h-64">
						{#if stats.dailyData.length > 0}
							<div class="space-y-2">
								{#each stats.dailyData.slice(-14) as day}
									<div class="flex items-center gap-2">
										<span
											class="w-16 sm:w-20 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
											>{day.summary_date}</span
										>
										<div class="flex-1">
											<div
												class="h-6 rounded bg-blue-600 dark:bg-blue-500"
												style="width: {(day.total_requests /
													Math.max(
														...stats.dailyData.map(
															(d: any) => d.total_requests
														)
													)) *
													100}%"
											></div>
										</div>
										<span
											class="w-16 sm:w-20 text-right text-xs sm:text-sm font-medium text-gray-900 dark:text-white"
										>
											{formatNumber(day.total_requests)}
										</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-gray-500 dark:text-gray-400">
								No data available
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Model Breakdown -->
			<div class="mb-4 sm:mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
				<h3 class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
					Model Breakdown
				</h3>
				<div class="overflow-x-auto -mx-4 sm:mx-0">
					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-900/50">
							<tr>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Model
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Requests
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Total Cost
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Tokens
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Avg Response
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Success Rate
								</th>
							</tr>
						</thead>
						<tbody
							class="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800"
						>
							{#each stats.modelBreakdown as model}
								<tr>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-sm font-medium text-gray-900 dark:text-white"
									>
										{model.model}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(model.requests))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white"
									>
										{formatCurrency(Number(model.total_cost))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(model.total_tokens))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{model.avg_response_time}ms
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatPercent(Number(model.success_rate))}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Operation Breakdown -->
			<div class="mb-4 sm:mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
				<h3 class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
					Operation Breakdown
				</h3>
				<div class="overflow-x-auto -mx-4 sm:mx-0">
					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-900/50">
							<tr>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Operation
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Requests
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Total Cost
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Tokens
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Avg Response
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Success Rate
								</th>
							</tr>
						</thead>
						<tbody
							class="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800"
						>
							{#each stats.operationBreakdown as op}
								<tr>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-sm font-medium text-gray-900 dark:text-white"
									>
										{op.operation}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(op.requests))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white"
									>
										{formatCurrency(Number(op.total_cost))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(op.total_tokens))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{op.avg_response_time}ms
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatPercent(Number(op.success_rate))}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Top Users -->
			<div class="mb-4 sm:mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
				<h3 class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
					Top Users by Cost
				</h3>
				<div class="overflow-x-auto -mx-4 sm:mx-0">
					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-900/50">
							<tr>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									User
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Requests
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Total Cost
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Tokens
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Avg Response
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Last Usage
								</th>
							</tr>
						</thead>
						<tbody
							class="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800"
						>
							{#each stats.topUsers as user}
								<tr>
									<td class="px-4 sm:px-6 py-4">
										<div
											class="text-sm font-medium text-gray-900 dark:text-white"
										>
											{user.name || 'Unknown'}
										</div>
										<div class="text-sm text-gray-500 dark:text-gray-400">
											{user.email}
										</div>
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(user.requests))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white"
									>
										{formatCurrency(Number(user.total_cost))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(Number(user.total_tokens))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{user.avg_response_time}ms
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
									>
										{format(new Date(user.last_usage), 'MMM d, yyyy HH:mm')}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Recent Activity -->
			<div class="rounded-lg bg-white dark:bg-gray-800 p-4 sm:p-6 shadow">
				<h3 class="mb-4 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
					Recent Activity
				</h3>
				<div class="overflow-x-auto -mx-4 sm:mx-0">
					<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
						<thead class="bg-gray-50 dark:bg-gray-900/50">
							<tr>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Time
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									User
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Operation
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Model
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Cost
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Tokens
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Response
								</th>
								<th
									class="px-4 sm:px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>
									Status
								</th>
							</tr>
						</thead>
						<tbody
							class="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800"
						>
							{#each stats.recentLogs as log}
								<tr>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
									>
										{format(new Date(log.created_at), 'HH:mm:ss')}
									</td>
									<td
										class="px-4 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
									>
										{log.users?.email || 'Unknown'}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
									>
										{log.operation_type}
									</td>
									<td
										class="px-4 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
									>
										{log.model_used}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white"
									>
										{formatCurrency(Number(log.total_cost_usd))}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{formatNumber(log.total_tokens)}
									</td>
									<td
										class="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-300"
									>
										{log.response_time_ms}ms
									</td>
									<td class="whitespace-nowrap px-4 sm:px-6 py-4">
										<span
											class="inline-flex rounded-full px-2 text-xs font-semibold leading-5 {getStatusColor(
												log.status
											)}"
										>
											{log.status}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>
</div>

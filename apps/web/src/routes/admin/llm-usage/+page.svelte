<!-- apps/web/src/routes/admin/llm-usage/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { format } from 'date-fns';
	import { Zap, RefreshCw } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// State
	let loading = $state(true);
	let error = $state<string | null>(null);
	let days = $state('30');
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
				return 'bg-muted text-foreground dark:text-muted-foreground';
		}
	}
</script>

<div class="admin-page">
	<AdminPageHeader
		title="LLM Usage"
		description="Monitor AI API usage, costs, and performance across the platform"
		icon={Zap}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	<div
		class="bg-card border border-border rounded-lg p-4 shadow-ink mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
	>
		<div class="flex-1 space-y-2">
			<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Time Range
			</p>
			<Select
				bind:value={days}
				size="md"
				onchange={() => fetchStats()}
				aria-label="Select time range"
			>
				<option value="7">Last 7 days</option>
				<option value="30">Last 30 days</option>
				<option value="90">Last 90 days</option>
				<option value="365">Last year</option>
			</Select>
		</div>

		<Button
			variant="primary"
			size="md"
			class="w-full sm:w-auto pressable"
			icon={RefreshCw}
			onclick={fetchStats}
		>
			Refresh
		</Button>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div
				class="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"
			></div>
		</div>
	{:else if error}
		<div
			class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 tx tx-static tx-weak"
			role="alert"
		>
			<p class="font-semibold text-base text-red-600 dark:text-red-400">
				Error loading stats
			</p>
			<p class="mt-1 text-sm text-red-500">{error}</p>
		</div>
	{:else if stats}
		<!-- Overview Cards -->
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Total Cost
				</p>
				<p class="mt-2 text-2xl font-bold text-purple-500">
					{formatCurrency(stats.overview.totalCost)}
				</p>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Total Requests
				</p>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.overview.totalRequests)}
				</p>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Total Tokens
				</p>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatNumber(stats.overview.totalTokens)}
				</p>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Avg Cost/Request
				</p>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{formatCurrency(stats.overview.avgCostPerRequest)}
				</p>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Success Rate
				</p>
				<p class="mt-2 text-2xl font-bold text-emerald-500">
					{formatPercent(stats.overview.successRate)}
				</p>
			</div>

			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Avg Response Time
				</p>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{Math.round(stats.overview.avgResponseTime)}ms
				</p>
			</div>
		</div>

		<!-- Charts Row -->
		<div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
			<!-- Cost Over Time -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="mb-4 text-sm font-semibold text-foreground">Cost Over Time</h3>
				<div class="h-64 overflow-y-auto scrollbar-thin">
					{#if stats.dailyData.length > 0}
						<div class="space-y-2">
							{#each stats.dailyData.slice(-14) as day}
								<div class="flex items-center gap-2">
									<span
										class="w-16 sm:w-20 text-xs text-muted-foreground shrink-0"
										>{day.summary_date}</span
									>
									<div class="flex-1 min-w-0">
										<div
											class="h-5 rounded bg-purple-500"
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
										class="w-16 sm:w-20 text-right text-xs font-medium text-foreground shrink-0"
									>
										{formatCurrency(Number(day.total_cost_usd))}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No data available</p>
					{/if}
				</div>
			</div>

			<!-- Requests Over Time -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="mb-4 text-sm font-semibold text-foreground">Requests Over Time</h3>
				<div class="h-64 overflow-y-auto scrollbar-thin">
					{#if stats.dailyData.length > 0}
						<div class="space-y-2">
							{#each stats.dailyData.slice(-14) as day}
								<div class="flex items-center gap-2">
									<span
										class="w-16 sm:w-20 text-xs text-muted-foreground shrink-0"
										>{day.summary_date}</span
									>
									<div class="flex-1 min-w-0">
										<div
											class="h-5 rounded bg-blue-500"
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
										class="w-16 sm:w-20 text-right text-xs font-medium text-foreground shrink-0"
									>
										{formatNumber(day.total_requests)}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No data available</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Model Breakdown -->
		<div class="mb-6 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
			<div class="p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-foreground">Model Breakdown</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Model
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Requests
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Total Cost
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Tokens
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Avg Response
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Success Rate
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border bg-card">
						{#each stats.modelBreakdown as model}
							<tr class="hover:bg-muted/30 transition-colors">
								<td
									class="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground"
								>
									{model.model}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(model.requests))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
								>
									{formatCurrency(Number(model.total_cost))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(model.total_tokens))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{model.avg_response_time}ms
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
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
		<div class="mb-6 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
			<div class="p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-foreground">Operation Breakdown</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Operation
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Requests
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Total Cost
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Tokens
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Avg Response
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Success Rate
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border bg-card">
						{#each stats.operationBreakdown as op}
							<tr class="hover:bg-muted/30 transition-colors">
								<td
									class="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground"
								>
									{op.operation}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(op.requests))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
								>
									{formatCurrency(Number(op.total_cost))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(op.total_tokens))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{op.avg_response_time}ms
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
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
		<div class="mb-6 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
			<div class="p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-foreground">Top Users by Cost</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50">
						<tr>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								User
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Requests
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Total Cost
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Tokens
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Avg Response
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Last Usage
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border bg-card">
						{#each stats.topUsers as user}
							<tr class="hover:bg-muted/30 transition-colors">
								<td class="px-4 py-3">
									<div class="text-sm font-medium text-foreground">
										{user.name || 'Unknown'}
									</div>
									<div class="text-xs text-muted-foreground">{user.email}</div>
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(user.requests))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
								>
									{formatCurrency(Number(user.total_cost))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(Number(user.total_tokens))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{user.avg_response_time}ms
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
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
		<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
			<div class="p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-foreground">Recent Activity</h3>
			</div>
			<div class="overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
				<table class="min-w-full divide-y divide-border">
					<thead class="bg-muted/50 sticky top-0">
						<tr>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Time
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								User
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Operation
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Model
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Cost
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Tokens
							</th>
							<th
								class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Response
							</th>
							<th
								class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
							>
								Status
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border bg-card">
						{#each stats.recentLogs as log}
							<tr class="hover:bg-muted/30 transition-colors">
								<td
									class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
								>
									{format(new Date(log.created_at), 'HH:mm:ss')}
								</td>
								<td
									class="px-4 py-3 text-sm text-foreground max-w-[150px] truncate"
								>
									{log.users?.email || 'Unknown'}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground"
								>
									{log.operation_type}
								</td>
								<td
									class="px-4 py-3 text-sm text-muted-foreground max-w-[120px] truncate"
								>
									{log.model_used}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground"
								>
									{formatCurrency(Number(log.total_cost_usd))}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{formatNumber(log.total_tokens)}
								</td>
								<td
									class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted-foreground"
								>
									{log.response_time_ms}ms
								</td>
								<td class="whitespace-nowrap px-4 py-3">
									<span
										class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getStatusColor(
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

<!-- apps/web/src/routes/admin/revenue/+page.svelte -->
<script lang="ts">
	import {
		DollarSign,
		TrendingUp,
		TrendingDown,
		Calendar,
		FileText,
		AlertCircle,
		Download,
		RefreshCw,
		CreditCard,
		Users,
		PieChart,
		BarChart,
		ArrowUpRight,
		ArrowDownRight
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import type { PageData } from './$types';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedPeriod = $state('month');
	let selectedYear = $state(new Date().getFullYear());
	let selectedMonth = $state(new Date().getMonth() + 1);

	// Revenue data
	let revenueData = $state({
		recognized: {
			current_period: 0,
			previous_period: 0,
			year_to_date: 0,
			all_time: 0
		},
		deferred: {
			total: 0,
			next_month: 0,
			next_quarter: 0,
			breakdown: []
		},
		prorations: {
			upgrades: 0,
			downgrades: 0,
			net: 0
		},
		refunds: {
			current_period: 0,
			previous_period: 0,
			total_count: 0
		},
		chargebacks: {
			current_period: 0,
			total: 0,
			count: 0,
			rate: 0
		},
		metrics: {
			mrr: 0,
			arr: 0,
			average_revenue_per_user: 0,
			lifetime_value: 0,
			gross_margin: 0
		}
	});

	// Load revenue data on mount and when filters change
	$effect(() => {
		if (!browser) return;
		selectedPeriod; // Track dependency
		selectedYear; // Track dependency
		selectedMonth; // Track dependency
		loadRevenueData();
	});

	async function loadRevenueData() {
		if (!browser) return;
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				period: selectedPeriod,
				year: selectedYear.toString(),
				month: selectedMonth.toString()
			});

			const response = await fetch(`/api/admin/revenue?${params}`);
			if (!response.ok) throw new Error('Failed to load revenue data');

			const result = await response.json();
			if (result.success) {
				revenueData = result.data;
			} else {
				throw new Error(result.error || 'Failed to load revenue data');
			}
		} catch (err) {
			console.error('Error loading revenue data:', err);
			error = err instanceof Error ? err.message : 'Failed to load revenue data';
		} finally {
			isLoading = false;
		}
	}

	async function exportRevenue() {
		try {
			const params = new URLSearchParams({
				period: selectedPeriod,
				year: selectedYear.toString(),
				month: selectedMonth.toString()
			});

			const response = await fetch(`/api/admin/revenue/export?${params}`);
			if (!response.ok) throw new Error('Failed to export revenue data');

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `revenue-report-${selectedYear}-${selectedMonth}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Error exporting revenue:', err);
			alert('Failed to export revenue data');
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount / 100);
	}

	function formatPercentage(value: number): string {
		return `${value.toFixed(2)}%`;
	}

	function getChangeColor(current: number, previous: number): string {
		if (current > previous) return 'text-green-600';
		if (current < previous) return 'text-red-600';
		return 'text-muted-foreground';
	}

	function calculateChange(current: number, previous: number): number {
		if (previous === 0) return current > 0 ? 100 : 0;
		return ((current - previous) / previous) * 100;
	}
</script>

<svelte:head>
	<title>Revenue Recognition - Admin</title>
</svelte:head>

<div class="admin-page">
	<div class="admin-page">
		<!-- Header with Back Button -->
		<AdminPageHeader
			title="Revenue Recognition"
			description="Track recognized revenue, deferrals, and financial metrics"
			icon={DollarSign}
			backHref="/admin"
			backLabel="Dashboard"
		/>

		<!-- Controls -->
		<div class="admin-panel p-4">
			<div class="flex flex-col sm:flex-row gap-4">
				<Select bind:value={selectedPeriod} size="md">
					<option value="month">Monthly</option>
					<option value="quarter">Quarterly</option>
					<option value="year">Yearly</option>
				</Select>

				{#if selectedPeriod === 'month'}
					<Select bind:value={selectedMonth} size="md">
						{#each Array(12) as _, i}
							<option value={i + 1}>
								{new Date(2000, i).toLocaleString('default', { month: 'long' })}
							</option>
						{/each}
					</Select>
				{/if}

				<Select bind:value={selectedYear} size="md">
					{#each Array(5) as _, i}
						<option value={new Date().getFullYear() - i}>
							{new Date().getFullYear() - i}
						</option>
					{/each}
				</Select>

				<div class="flex-1"></div>

				<Button onclick={exportRevenue} variant="primary" size="md" icon={Download}>
					Export
				</Button>

				<Button
					onclick={loadRevenueData}
					disabled={isLoading}
					loading={isLoading}
					variant="secondary"
					size="md"
					icon={RefreshCw}
				>
					Refresh
				</Button>
			</div>
		</div>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 dark:bg-red-900/20 dark:border-red-800"
			>
				<div class="flex items-center">
					<AlertCircle class="h-5 w-5 text-red-600 mr-2" />
					<p class="text-red-800 dark:text-red-200">{error}</p>
				</div>
			</div>
		{/if}

		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<RefreshCw class="h-8 w-8 animate-spin text-blue-600" />
			</div>
		{:else}
			{@const change = calculateChange(
				revenueData.recognized.current_period,
				revenueData.recognized.previous_period
			)}
			<!-- Key Metrics -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<!-- Recognized Revenue -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between mb-4">
						<div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
							<DollarSign class="h-6 w-6 text-green-600 dark:text-green-400" />
						</div>
						<span class="text-sm text-muted-foreground">
							{selectedPeriod === 'month'
								? 'This Month'
								: selectedPeriod === 'quarter'
									? 'This Quarter'
									: 'This Year'}
						</span>
					</div>
					<h3 class="text-2xl font-bold text-foreground">
						{formatCurrency(revenueData.recognized.current_period)}
					</h3>
					<p class="text-sm text-muted-foreground mt-1">Recognized Revenue</p>

					<div class="mt-2 flex items-center text-sm">
						{#if change > 0}
							<ArrowUpRight class="w-4 h-4 text-green-500 mr-1" />
							<span class="text-green-600">+{change.toFixed(1)}%</span>
						{:else if change < 0}
							<ArrowDownRight class="w-4 h-4 text-red-500 mr-1" />
							<span class="text-red-600">{change.toFixed(1)}%</span>
						{:else}
							<span class="text-muted-foreground">No change</span>
						{/if}
						<span class="text-muted-foreground ml-2">vs previous period</span>
					</div>
				</div>

				<!-- Deferred Revenue -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between mb-4">
						<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
							<Calendar class="h-6 w-6 text-blue-600 dark:text-blue-400" />
						</div>
						<span class="text-sm text-muted-foreground">Total</span>
					</div>
					<h3 class="text-2xl font-bold text-foreground">
						{formatCurrency(revenueData.deferred.total)}
					</h3>
					<p class="text-sm text-muted-foreground mt-1">Deferred Revenue</p>
					<div class="mt-2 text-xs text-muted-foreground">
						Next month: {formatCurrency(revenueData.deferred.next_month)}
					</div>
				</div>

				<!-- Refunds -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between mb-4">
						<div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
							<TrendingDown class="h-6 w-6 text-red-600 dark:text-red-400" />
						</div>
						<span class="text-sm text-muted-foreground">This Period</span>
					</div>
					<h3 class="text-2xl font-bold text-foreground">
						{formatCurrency(revenueData.refunds.current_period)}
					</h3>
					<p class="text-sm text-muted-foreground mt-1">Refunds</p>
					<div class="mt-2 text-xs text-muted-foreground">
						{revenueData.refunds.total_count} refunds processed
					</div>
				</div>

				<!-- Net Revenue -->
				<div class="admin-panel p-6">
					<div class="flex items-center justify-between mb-4">
						<div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
							<BarChart class="h-6 w-6 text-purple-600 dark:text-purple-400" />
						</div>
						<span class="text-sm text-muted-foreground">Net</span>
					</div>
					<h3 class="text-2xl font-bold text-foreground">
						{formatCurrency(
							revenueData.recognized.current_period -
								revenueData.refunds.current_period -
								revenueData.chargebacks.current_period
						)}
					</h3>
					<p class="text-sm text-muted-foreground mt-1">Net Revenue</p>
					<div class="mt-2 text-xs text-muted-foreground">
						After refunds & chargebacks
					</div>
				</div>
			</div>

			<!-- Detailed Sections -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Prorations & Adjustments -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-foreground mb-4">
						Prorations & Adjustments
					</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between py-3 border-b border-border">
							<div>
								<p class="font-medium text-foreground">Upgrades</p>
								<p class="text-sm text-muted-foreground">
									Additional revenue from plan upgrades
								</p>
							</div>
							<p class="text-lg font-semibold text-green-600">
								+{formatCurrency(revenueData.prorations.upgrades)}
							</p>
						</div>
						<div class="flex items-center justify-between py-3 border-b border-border">
							<div>
								<p class="font-medium text-foreground">Downgrades</p>
								<p class="text-sm text-muted-foreground">
									Credits from plan downgrades
								</p>
							</div>
							<p class="text-lg font-semibold text-red-600">
								-{formatCurrency(revenueData.prorations.downgrades)}
							</p>
						</div>
						<div class="flex items-center justify-between py-3">
							<div>
								<p class="font-medium text-foreground">Net Prorations</p>
								<p class="text-sm text-muted-foreground">Total impact on revenue</p>
							</div>
							<p
								class="text-lg font-semibold {revenueData.prorations.net >= 0
									? 'text-green-600'
									: 'text-red-600'}"
							>
								{revenueData.prorations.net >= 0 ? '+' : ''}{formatCurrency(
									revenueData.prorations.net
								)}
							</p>
						</div>
					</div>
				</div>

				<!-- Key Metrics -->
				<div class="admin-panel p-6">
					<h3 class="text-lg font-semibold text-foreground mb-4">Financial Metrics</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div>
								<p class="font-medium text-foreground">MRR</p>
								<p class="text-sm text-muted-foreground">
									Monthly Recurring Revenue
								</p>
							</div>
							<p class="text-lg font-semibold text-foreground">
								{formatCurrency(revenueData.metrics.mrr)}
							</p>
						</div>
						<div class="flex items-center justify-between">
							<div>
								<p class="font-medium text-foreground">ARR</p>
								<p class="text-sm text-muted-foreground">
									Annual Recurring Revenue
								</p>
							</div>
							<p class="text-lg font-semibold text-foreground">
								{formatCurrency(revenueData.metrics.arr)}
							</p>
						</div>
						<div class="flex items-center justify-between">
							<div>
								<p class="font-medium text-foreground">ARPU</p>
								<p class="text-sm text-muted-foreground">
									Average Revenue Per User
								</p>
							</div>
							<p class="text-lg font-semibold text-foreground">
								{formatCurrency(revenueData.metrics.average_revenue_per_user)}
							</p>
						</div>
						<div class="flex items-center justify-between">
							<div>
								<p class="font-medium text-foreground">LTV</p>
								<p class="text-sm text-muted-foreground">Customer Lifetime Value</p>
							</div>
							<p class="text-lg font-semibold text-foreground">
								{formatCurrency(revenueData.metrics.lifetime_value)}
							</p>
						</div>
					</div>
				</div>

				<!-- Deferred Revenue Breakdown -->
				{#if revenueData.deferred.breakdown.length > 0}
					<div class="admin-panel p-6 lg:col-span-2">
						<h3 class="text-lg font-semibold text-foreground mb-4">
							Deferred Revenue Schedule
						</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
								<thead>
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
										>
											Period
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
										>
											Amount
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
										>
											Subscriptions
										</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
									{#each revenueData.deferred.breakdown as item}
										<tr>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-foreground"
											>
												{item.period}
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-foreground"
											>
												{formatCurrency(item.amount)}
											</td>
											<td
												class="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
											>
												{item.count} subscriptions
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}

				<!-- Chargebacks Alert -->
				{#if revenueData.chargebacks.count > 0}
					<div
						class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 lg:col-span-2"
					>
						<div class="flex items-start">
							<AlertCircle class="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
							<div class="flex-1">
								<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
									Chargeback Alert
								</h3>
								<p class="text-sm text-red-700 dark:text-red-300 mt-1">
									{revenueData.chargebacks.count} chargeback{revenueData
										.chargebacks.count > 1
										? 's'
										: ''}
									totaling {formatCurrency(revenueData.chargebacks.total)}
									(Rate: {formatPercentage(revenueData.chargebacks.rate)})
								</p>
								<p class="text-sm text-red-600 dark:text-red-400 mt-2">
									Review payment processes and fraud prevention measures.
								</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

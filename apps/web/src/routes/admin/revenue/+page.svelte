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
	import { toastService } from '$lib/stores/toast.store';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedPeriod = $state('month');
	let selectedYear = $state(new Date().getFullYear());
	let selectedMonth = $state(new Date().getMonth() + 1);

	type DeferredRevenueBreakdownItem = {
		period: string;
		amount: number;
		count: number;
	};

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
			breakdown: [] as DeferredRevenueBreakdownItem[]
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
			toastService.error('Failed to export revenue data');
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
		if (current > previous) return 'text-success';
		if (current < previous) return 'text-destructive';
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
		<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4">
			<div class="flex items-center">
				<AlertCircle class="h-5 w-5 text-destructive mr-2" />
				<p class="text-destructive">{error}</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<RefreshCw
				class="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground"
			/>
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
					<div class="p-2 bg-muted rounded-lg">
						<DollarSign class="h-6 w-6 text-foreground" />
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
						<ArrowUpRight class="w-4 h-4 text-success mr-1" />
						<span class="text-success">+{change.toFixed(1)}%</span>
					{:else if change < 0}
						<ArrowDownRight class="w-4 h-4 text-destructive mr-1" />
						<span class="text-destructive">{change.toFixed(1)}%</span>
					{:else}
						<span class="text-muted-foreground">No change</span>
					{/if}
					<span class="text-muted-foreground ml-2">vs previous period</span>
				</div>
			</div>

			<!-- Deferred Revenue -->
			<div class="admin-panel p-6">
				<div class="flex items-center justify-between mb-4">
					<div class="p-2 bg-muted rounded-lg">
						<Calendar class="h-6 w-6 text-foreground" />
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
					<div class="p-2 bg-destructive/10 rounded-lg">
						<TrendingDown class="h-6 w-6 text-destructive" />
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
					<div class="p-2 bg-muted rounded-lg">
						<BarChart class="h-6 w-6 text-foreground" />
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
				<div class="mt-2 text-xs text-muted-foreground">After refunds & chargebacks</div>
			</div>
		</div>

		<!-- Detailed Sections -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Prorations & Adjustments -->
			<div class="admin-panel p-6">
				<h3 class="text-lg font-semibold text-foreground mb-4">Prorations & Adjustments</h3>
				<div class="space-y-4">
					<div class="flex items-center justify-between py-3 border-b border-border">
						<div>
							<p class="font-medium text-foreground">Upgrades</p>
							<p class="text-sm text-muted-foreground">
								Additional revenue from plan upgrades
							</p>
						</div>
						<p class="text-lg font-semibold text-success">
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
						<p class="text-lg font-semibold text-destructive">
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
								? 'text-success'
								: 'text-destructive'}"
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
							<p class="text-sm text-muted-foreground">Monthly Recurring Revenue</p>
						</div>
						<p class="text-lg font-semibold text-foreground">
							{formatCurrency(revenueData.metrics.mrr)}
						</p>
					</div>
					<div class="flex items-center justify-between">
						<div>
							<p class="font-medium text-foreground">ARR</p>
							<p class="text-sm text-muted-foreground">Annual Recurring Revenue</p>
						</div>
						<p class="text-lg font-semibold text-foreground">
							{formatCurrency(revenueData.metrics.arr)}
						</p>
					</div>
					<div class="flex items-center justify-between">
						<div>
							<p class="font-medium text-foreground">ARPU</p>
							<p class="text-sm text-muted-foreground">Average Revenue Per User</p>
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
					<!-- Mobile card list -->
					<ul class="space-y-3 lg:hidden">
						{#each revenueData.deferred.breakdown as item}
							<li class="rounded-md border border-border bg-card p-4">
								<div class="font-medium text-foreground">{item.period}</div>
								<dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
									<div>
										<dt class="text-xs text-muted-foreground">Amount</dt>
										<dd class="text-foreground">
											{formatCurrency(item.amount)}
										</dd>
									</div>
									<div>
										<dt class="text-xs text-muted-foreground">Subscriptions</dt>
										<dd class="text-muted-foreground">
											{item.count} subscriptions
										</dd>
									</div>
								</dl>
							</li>
						{/each}
					</ul>

					<div class="hidden overflow-x-auto lg:block">
						<table class="min-w-full divide-y divide-border">
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
							<tbody class="divide-y divide-border">
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
					class="bg-destructive/10 border border-destructive/30 rounded-lg p-6 lg:col-span-2"
				>
					<div class="flex items-start">
						<AlertCircle class="h-5 w-5 text-destructive mr-3 mt-0.5 flex-shrink-0" />
						<div class="flex-1">
							<h3 class="text-sm font-medium text-destructive">Chargeback Alert</h3>
							<p class="text-sm text-destructive mt-1">
								{revenueData.chargebacks.count} chargeback{revenueData.chargebacks
									.count > 1
									? 's'
									: ''}
								totaling {formatCurrency(revenueData.chargebacks.total)}
								(Rate: {formatPercentage(revenueData.chargebacks.rate)})
							</p>
							<p class="text-sm text-destructive mt-2">
								Review payment processes and fraud prevention measures.
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

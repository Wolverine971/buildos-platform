<!-- apps/web/src/routes/admin/notifications/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, TrendingUp, Send, Eye, MousePointerClick, Calendar } from 'lucide-svelte';
	import { browser } from '$app/environment';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import MetricCard from '$lib/components/admin/notifications/MetricCard.svelte';
	import TimeframeSelector from '$lib/components/admin/notifications/TimeframeSelector.svelte';
	import ChannelPerformanceTable from '$lib/components/admin/notifications/ChannelPerformanceTable.svelte';
	import EventBreakdownTable from '$lib/components/admin/notifications/EventBreakdownTable.svelte';
	import FailedDeliveriesTable from '$lib/components/admin/notifications/FailedDeliveriesTable.svelte';
	import SMSInsightsCard from '$lib/components/admin/notifications/SMSInsightsCard.svelte';
	import {
		notificationAnalyticsService,
		type Timeframe,
		type AnalyticsOverview,
		type ChannelMetrics,
		type EventMetrics,
		type FailedDelivery,
		type SMSStats,
		type DailyBriefEngagementMetric
	} from '$lib/services/notification-analytics.service';
	import { notificationTestService } from '$lib/services/notification-test.service';
	import { toastService } from '$lib/stores/toast.store';

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let timeframe = $state<Timeframe>('7d');
	let autoRefresh = $state(false);
	let refreshInterval: number | undefined;

	// Analytics data
	let overview = $state<AnalyticsOverview | null>(null);
	let channelMetrics = $state<ChannelMetrics[]>([]);
	let eventMetrics = $state<EventMetrics[]>([]);
	let failures = $state<FailedDelivery[]>([]);
	let smsStats = $state<SMSStats | null>(null);
	let dailyBriefEngagement = $state<DailyBriefEngagementMetric[]>([]);

	function formatTimeframeLabel(value: Timeframe): string {
		const labels: Record<Timeframe, string> = {
			'24h': '24h',
			'7d': '7d',
			'30d': '30d',
			'90d': '90d'
		};
		return labels[value] ?? value;
	}

	const timeframeLabel = $derived(formatTimeframeLabel(timeframe));
	const dailyBriefTotals = $derived(
		dailyBriefEngagement.reduce(
			(totals, metric) => ({
				sends: totals.sends + Number(metric.sends || 0),
				opens: totals.opens + Number(metric.opens || 0),
				clicks: totals.clicks + Number(metric.clicks || 0),
				reactivated: totals.reactivated + Number(metric.reactivated_7d || 0)
			}),
			{ sends: 0, opens: 0, clicks: 0, reactivated: 0 }
		)
	);
	const dailyBriefRates = $derived({
		open: calculateRate(dailyBriefTotals.opens, dailyBriefTotals.sends),
		click: calculateRate(dailyBriefTotals.clicks, dailyBriefTotals.sends),
		reactivation: calculateRate(dailyBriefTotals.reactivated, dailyBriefTotals.sends)
	});

	onMount(() => {
		void loadAnalytics();

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});

	$effect(() => {
		if (!browser) return;
		if (autoRefresh) {
			if (!refreshInterval) {
				refreshInterval = setInterval(loadAnalytics, 30000) as any;
			}
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = undefined;
		}
	});

	async function loadAnalytics() {
		isLoading = true;
		error = null;

		try {
			[overview, channelMetrics, eventMetrics, failures, smsStats, dailyBriefEngagement] =
				await Promise.all([
					notificationAnalyticsService.getOverview(timeframe),
					notificationAnalyticsService.getChannelPerformance(timeframe),
					notificationAnalyticsService.getEventBreakdown(timeframe),
					notificationAnalyticsService.getFailures(timeframe, 50),
					notificationAnalyticsService.getSMSStats(timeframe),
					notificationAnalyticsService.getDailyBriefEngagement(timeframe)
				]);
		} catch (err) {
			console.error('Error loading notification analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			isLoading = false;
		}
	}

	async function handleRetry(deliveryId: string) {
		try {
			await notificationTestService.retryDelivery(deliveryId);
			// Reload failures
			failures = await notificationAnalyticsService.getFailures(timeframe, 50);
			toastService.success('Delivery retry queued');
		} catch (err) {
			console.error('Error retrying delivery:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to retry delivery');
		}
	}

	async function handleResend(deliveryId: string) {
		try {
			await notificationTestService.resendDelivery(deliveryId);
			// Reload failures
			failures = await notificationAnalyticsService.getFailures(timeframe, 50);
			toastService.success('Delivery resent');
		} catch (err) {
			console.error('Error resending delivery:', err);
			toastService.error(err instanceof Error ? err.message : 'Failed to resend delivery');
		}
	}

	function calculateRate(numerator: number, denominator: number): number {
		if (!denominator) return 0;
		return Number(((numerator / denominator) * 100).toFixed(1));
	}

	function formatPercent(value: number | null | undefined): string {
		return `${Number(value || 0).toFixed(1)}%`;
	}

	function formatStage(stage: string): string {
		const labels: Record<string, string> = {
			standard: 'Standard',
			reengagement: 'Re-engagement',
			dormant: 'Dormant'
		};
		return labels[stage] || stage;
	}

	function formatWeekStart(value: string): string {
		const date = new Date(`${value}T00:00:00Z`);
		return date.toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Notification Analytics - BuildOS Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Notification Analytics"
		description="Monitor notification delivery, engagement, and performance across all channels"
		icon={Bell}
		showBack={true}
	>
		{#snippet actions()}
			<TimeframeSelector
				bind:value={timeframe}
				bind:autoRefresh
				loading={isLoading}
				onRefresh={loadAnalytics}
				onTimeframeChange={loadAnalytics}
			/>
		{/snippet}
	</AdminPageHeader>

	{#if error}
		<div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6">
			<p class="text-destructive">{error}</p>
		</div>
	{/if}

	<!-- Overview Metrics -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
		<MetricCard
			title={`Total Sent (${timeframeLabel})`}
			value={overview?.total_sent || 0}
			trend={overview?.trend_vs_previous_period.sent}
			loading={isLoading}
			icon={Send}
			color="blue"
		/>
		<MetricCard
			title="Delivery Success Rate"
			value={overview?.delivery_success_rate || 0}
			suffix="%"
			trend={overview?.trend_vs_previous_period.success_rate}
			loading={isLoading}
			icon={TrendingUp}
			color="green"
		/>
		<MetricCard
			title="Avg Open Rate"
			value={overview?.avg_open_rate || 0}
			suffix="%"
			trend={overview?.trend_vs_previous_period.open_rate}
			loading={isLoading}
			icon={Eye}
			color="purple"
		/>
		<MetricCard
			title="Avg Click Rate"
			value={overview?.avg_click_rate || 0}
			suffix="%"
			trend={overview?.trend_vs_previous_period.click_rate}
			loading={isLoading}
			icon={MousePointerClick}
			color="orange"
		/>
	</div>

	<!-- Daily Brief Engagement -->
	<div class="mb-6 rounded-lg border border-border bg-card">
		<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
			<div class="flex items-center gap-2">
				<Calendar class="h-4 w-4 text-muted-foreground" />
				<h2 class="text-sm font-semibold text-foreground">Daily Brief Engagement</h2>
			</div>
			<div class="text-xs text-muted-foreground">{timeframeLabel}</div>
		</div>

		<div class="grid grid-cols-2 gap-3 border-b border-border p-4 lg:grid-cols-4">
			<div>
				<div class="text-xs text-muted-foreground">Sends</div>
				<div class="text-2xl font-semibold text-foreground">
					{isLoading ? '...' : dailyBriefTotals.sends}
				</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Open Rate</div>
				<div class="text-2xl font-semibold text-foreground">
					{isLoading ? '...' : `${dailyBriefRates.open}%`}
				</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Click Rate</div>
				<div class="text-2xl font-semibold text-foreground">
					{isLoading ? '...' : `${dailyBriefRates.click}%`}
				</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">7d Reactivation</div>
				<div class="text-2xl font-semibold text-foreground">
					{isLoading ? '...' : `${dailyBriefRates.reactivation}%`}
				</div>
			</div>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr
						class="border-b border-border text-left text-xs uppercase text-muted-foreground"
					>
						<th class="px-4 py-3 font-medium">Week</th>
						<th class="px-4 py-3 font-medium">Stage</th>
						<th class="px-4 py-3 text-right font-medium">Sends</th>
						<th class="px-4 py-3 text-right font-medium">Open</th>
						<th class="px-4 py-3 text-right font-medium">Click</th>
						<th class="px-4 py-3 text-right font-medium">Reactivate</th>
					</tr>
				</thead>
				<tbody>
					{#if isLoading}
						<tr>
							<td class="px-4 py-5 text-muted-foreground" colspan="6">Loading...</td>
						</tr>
					{:else if dailyBriefEngagement.length === 0}
						<tr>
							<td class="px-4 py-5 text-muted-foreground" colspan="6">No sends</td>
						</tr>
					{:else}
						{#each dailyBriefEngagement as metric}
							<tr class="border-b border-border last:border-0">
								<td class="px-4 py-3 text-foreground"
									>{formatWeekStart(metric.week_start)}</td
								>
								<td class="px-4 py-3 text-foreground"
									>{formatStage(metric.engagement_stage)}</td
								>
								<td class="px-4 py-3 text-right text-foreground">{metric.sends}</td>
								<td class="px-4 py-3 text-right text-foreground">
									{formatPercent(metric.open_rate)}
								</td>
								<td class="px-4 py-3 text-right text-foreground">
									{formatPercent(metric.click_rate)}
								</td>
								<td class="px-4 py-3 text-right text-foreground">
									{metric.reactivated_7d} ({formatPercent(
										metric.reactivation_rate_7d
									)})
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Failed Deliveries Alert -->
	{#if failures.length > 0}
		<div class="mb-6">
			<FailedDeliveriesTable
				data={failures}
				loading={isLoading}
				{timeframeLabel}
				onRetry={handleRetry}
				onResend={handleResend}
			/>
		</div>
	{/if}

	<!-- Channel Performance -->
	<div class="mb-6">
		<ChannelPerformanceTable data={channelMetrics} loading={isLoading} />
	</div>

	<!-- SMS Insights -->
	<div class="mb-6">
		<SMSInsightsCard data={smsStats} loading={isLoading} {timeframeLabel} />
	</div>

	<!-- Event Type Breakdown -->
	<EventBreakdownTable data={eventMetrics} loading={isLoading} />
</div>

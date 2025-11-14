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
		type SMSStats
	} from '$lib/services/notification-analytics.service';
	import { notificationTestService } from '$lib/services/notification-test.service';

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

	onMount(async () => {
		await loadAnalytics();

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});

	$effect(() => {
		if (!browser) return;
		if (autoRefresh) {
			refreshInterval = setInterval(loadAnalytics, 30000) as any;
		} else if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = undefined;
		}
	});

	async function loadAnalytics() {
		isLoading = true;
		error = null;

		try {
			[overview, channelMetrics, eventMetrics, failures, smsStats] = await Promise.all([
				notificationAnalyticsService.getOverview(timeframe),
				notificationAnalyticsService.getChannelPerformance(timeframe),
				notificationAnalyticsService.getEventBreakdown(timeframe),
				notificationAnalyticsService.getFailures('24h', 50),
				notificationAnalyticsService.getSMSStats()
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
			failures = await notificationAnalyticsService.getFailures('24h', 50);
		} catch (err) {
			console.error('Error retrying delivery:', err);
			alert(err instanceof Error ? err.message : 'Failed to retry delivery');
		}
	}

	async function handleResend(deliveryId: string) {
		try {
			await notificationTestService.resendDelivery(deliveryId);
			// Reload failures
			failures = await notificationAnalyticsService.getFailures('24h', 50);
		} catch (err) {
			console.error('Error resending delivery:', err);
			alert(err instanceof Error ? err.message : 'Failed to resend delivery');
		}
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
		<div slot="actions">
			<TimeframeSelector
				bind:value={timeframe}
				bind:autoRefresh
				loading={isLoading}
				onRefresh={loadAnalytics}
				onTimeframeChange={loadAnalytics}
			/>
		</div>
	</AdminPageHeader>

	{#if error}
		<div
			class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
		>
			<p class="text-red-800 dark:text-red-200">{error}</p>
		</div>
	{/if}

	<!-- Overview Metrics -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
		<MetricCard
			title="Total Sent (24h)"
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

	<!-- Failed Deliveries Alert -->
	{#if failures.length > 0}
		<div class="mb-6">
			<FailedDeliveriesTable
				data={failures}
				loading={isLoading}
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
		<SMSInsightsCard data={smsStats} loading={isLoading} />
	</div>

	<!-- Event Type Breakdown -->
	<EventBreakdownTable data={eventMetrics} loading={isLoading} />
</div>

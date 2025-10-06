<!-- apps/web/src/routes/admin/notifications/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, TrendingUp, Send, Eye, MousePointerClick } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import MetricCard from '$lib/components/admin/notifications/MetricCard.svelte';
	import TimeframeSelector from '$lib/components/admin/notifications/TimeframeSelector.svelte';
	import ChannelPerformanceTable from '$lib/components/admin/notifications/ChannelPerformanceTable.svelte';
	import EventBreakdownTable from '$lib/components/admin/notifications/EventBreakdownTable.svelte';
	import FailedDeliveriesTable from '$lib/components/admin/notifications/FailedDeliveriesTable.svelte';
	import {
		notificationAnalyticsService,
		type Timeframe,
		type AnalyticsOverview,
		type ChannelMetrics,
		type EventMetrics,
		type FailedDelivery
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

	onMount(async () => {
		await loadAnalytics();

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});

	$effect(() => {
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
			[overview, channelMetrics, eventMetrics, failures] = await Promise.all([
				notificationAnalyticsService.getOverview(timeframe),
				notificationAnalyticsService.getChannelPerformance(timeframe),
				notificationAnalyticsService.getEventBreakdown(timeframe),
				notificationAnalyticsService.getFailures('24h', 50)
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

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
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

		<!-- Navigation Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
			<a
				href="/admin/notifications"
				class="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Bell class="h-8 w-8 text-blue-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Analytics</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Current page</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/test-bed"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Send class="h-8 w-8 text-green-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Test Bed</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Send test notifications</p>
					</div>
				</div>
			</a>

			<a
				href="/admin/notifications/logs"
				class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
			>
				<div class="flex items-center">
					<Eye class="h-8 w-8 text-purple-600 mr-3" />
					<div>
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Logs</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">Event & delivery logs</p>
					</div>
				</div>
			</a>
		</div>

		{#if error}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
			>
				<p class="text-red-800 dark:text-red-200">{error}</p>
			</div>
		{/if}

		<!-- Overview Metrics -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

		<!-- Event Type Breakdown -->
		<div class="mb-6">
			<EventBreakdownTable data={eventMetrics} loading={isLoading} />
		</div>
	</div>
</div>

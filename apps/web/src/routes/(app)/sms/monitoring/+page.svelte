<!-- apps/web/src/routes/(app)/sms/monitoring/+page.svelte -->
<script lang="ts">
	/**
	 * SMS Monitoring Dashboard
	 *
	 * Real-time monitoring of SMS Event Scheduling system health, metrics, and alerts
	 */
	import { onMount, onDestroy } from 'svelte';
	import { smsMonitoringService, type MetricsSummary } from '$lib/services/smsMonitoring.service';
	import MetricsSummaryCard from '$lib/components/sms/monitoring/MetricsSummaryCard.svelte';
	import DeliveryRateChart from '$lib/components/sms/monitoring/DeliveryRateChart.svelte';
	import LLMMetricsChart from '$lib/components/sms/monitoring/LLMMetricsChart.svelte';
	import ActiveAlertsList from '$lib/components/sms/monitoring/ActiveAlertsList.svelte';

	// State
	let summary = $state<MetricsSummary | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastRefreshTime = $state<Date | null>(null);
	let autoRefreshEnabled = $state(true);
	let refreshIntervalId: ReturnType<typeof setInterval> | null = null;

	// Constants
	const REFRESH_INTERVAL = 60000; // 60 seconds

	/**
	 * Fetch dashboard data
	 */
	async function fetchData() {
		try {
			error = null;
			summary = await smsMonitoringService.getSummary();
			lastRefreshTime = new Date();
		} catch (err: any) {
			console.error('Failed to fetch dashboard data:', err);
			error = err.message || 'Failed to load dashboard data';
		} finally {
			loading = false;
		}
	}

	/**
	 * Manual refresh
	 */
	async function refresh() {
		loading = true;
		await fetchData();
	}

	/**
	 * Toggle auto-refresh
	 */
	function toggleAutoRefresh() {
		autoRefreshEnabled = !autoRefreshEnabled;

		if (autoRefreshEnabled) {
			startAutoRefresh();
		} else {
			stopAutoRefresh();
		}
	}

	/**
	 * Start auto-refresh interval
	 */
	function startAutoRefresh() {
		if (refreshIntervalId) return;

		refreshIntervalId = setInterval(() => {
			if (autoRefreshEnabled && !loading) {
				fetchData();
			}
		}, REFRESH_INTERVAL);
	}

	/**
	 * Stop auto-refresh interval
	 */
	function stopAutoRefresh() {
		if (refreshIntervalId) {
			clearInterval(refreshIntervalId);
			refreshIntervalId = null;
		}
	}

	/**
	 * Format last refresh time
	 */
	function formatLastRefresh(): string {
		if (!lastRefreshTime) return 'Never';

		const now = new Date();
		const diffSeconds = Math.floor((now.getTime() - lastRefreshTime.getTime()) / 1000);

		if (diffSeconds < 60) return `${diffSeconds}s ago`;
		if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
		return lastRefreshTime.toLocaleTimeString();
	}

	// Lifecycle
	onMount(() => {
		fetchData();
		if (autoRefreshEnabled) {
			startAutoRefresh();
		}
	});

	onDestroy(() => {
		stopAutoRefresh();
	});
</script>

<svelte:head>
	<title>SMS Monitoring Dashboard | BuildOS</title>
</svelte:head>

<div class="sms-monitoring-dashboard">
	<!-- Header -->
	<div class="dashboard-header">
		<div class="header-content">
			<h1>SMS Monitoring Dashboard</h1>
			<p class="subtitle">Real-time monitoring of SMS Event Scheduling system</p>
		</div>

		<div class="header-actions">
			<div class="refresh-info">
				<span class="last-refresh">Last updated: {formatLastRefresh()}</span>
			</div>

			<button class="btn-refresh" onclick={refresh} disabled={loading}>
				<svg
					class="icon"
					class:spinning={loading}
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				Refresh
			</button>

			<button
				class="btn-auto-refresh"
				class:active={autoRefreshEnabled}
				aria-pressed={autoRefreshEnabled}
				onclick={toggleAutoRefresh}
			>
				<svg
					class="icon"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				Auto-refresh: {autoRefreshEnabled ? 'ON' : 'OFF'}
			</button>
		</div>
	</div>

	<!-- Error State -->
	{#if error}
		<div class="error-banner">
			<svg
				class="icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<strong>Error loading dashboard</strong>
				<p>{error}</p>
			</div>
			<button class="btn-retry" onclick={refresh}>Retry</button>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading && !summary}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading dashboard data...</p>
		</div>
	{:else if summary}
		<!-- Dashboard Content -->
		<div class="dashboard-content">
			<!-- Summary Card -->
			<MetricsSummaryCard {summary} />

			<!-- Charts Row -->
			<div class="charts-row">
				<DeliveryRateChart weekData={summary.week} />
				<LLMMetricsChart weekData={summary.week} />
			</div>

			<!-- Alerts Section -->
			{#if summary.alerts.unresolved_count > 0 || summary.alerts.recent.length > 0}
				<ActiveAlertsList alerts={summary.alerts} />
			{/if}

			<!-- Footer Info -->
			<div class="dashboard-footer">
				<p class="info-text">
					Dashboard refreshes every 60 seconds when auto-refresh is enabled. Metrics are
					aggregated hourly via materialized views.
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.sms-monitoring-dashboard {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
		color: hsl(var(--foreground));
		background: hsl(var(--background));
		--text-primary: hsl(var(--foreground));
		--text-secondary: hsl(var(--muted-foreground));
		--border-color: hsl(var(--border));
		--border-hover: hsl(var(--border-strong));
		--bg-hover: hsl(var(--muted));
		--bg-secondary: hsl(var(--muted));
		--primary-50: hsl(var(--accent) / 0.1);
		--primary-300: hsl(var(--accent) / 0.35);
		--primary-500: hsl(var(--accent));
		--primary-700: hsl(var(--accent));
		--error-50: hsl(var(--destructive) / 0.1);
		--error-100: hsl(var(--destructive) / 0.15);
		--error-200: hsl(var(--destructive) / 0.3);
		--error-500: hsl(var(--destructive));
		--error-600: hsl(var(--destructive));
		--error-700: hsl(var(--foreground));
		--warning-50: hsl(var(--warning) / 0.1);
		--warning-100: hsl(var(--warning) / 0.15);
		--warning-200: hsl(var(--warning) / 0.3);
		--warning-700: hsl(var(--foreground));
		--success-50: hsl(var(--success) / 0.1);
		--success-100: hsl(var(--success) / 0.15);
		--success-200: hsl(var(--success) / 0.3);
		--success-500: hsl(var(--success));
		--success-600: hsl(var(--success));
		--success-700: hsl(var(--foreground));
		--info-50: hsl(var(--info) / 0.1);
		--info-100: hsl(var(--info) / 0.15);
		--info-200: hsl(var(--info) / 0.3);
		--info-700: hsl(var(--foreground));
	}

	/* Header */
	.dashboard-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		gap: 2rem;
	}

	.header-content h1 {
		font-size: 2rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: var(--text-primary, #1a1a1a);
	}

	.subtitle {
		font-size: 1rem;
		color: var(--text-secondary, #666);
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.refresh-info {
		font-size: 0.875rem;
		color: var(--text-secondary, #666);
	}

	.btn-refresh,
	.btn-auto-refresh {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 6px;
		min-height: 2.75rem;
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.btn-refresh:hover:not(:disabled),
	.btn-auto-refresh:hover {
		background: var(--bg-hover, #f9fafb);
		border-color: var(--border-hover, #d1d5db);
	}

	.btn-refresh:focus-visible,
	.btn-auto-refresh:focus-visible,
	.btn-retry:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}

	.btn-refresh:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-auto-refresh.active {
		background: var(--primary-50, #eff6ff);
		border-color: var(--primary-300, #93c5fd);
		color: var(--primary-700, #1d4ed8);
	}

	.icon {
		width: 1.25rem;
		height: 1.25rem;
		stroke-width: 2;
	}

	.icon.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--error-50, #fef2f2);
		border: 1px solid var(--error-200, #fecaca);
		border-radius: 8px;
		margin-bottom: 2rem;
	}

	.error-banner .icon {
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		color: var(--error-500, #ef4444);
	}

	.error-banner strong {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--error-700, #b91c1c);
	}

	.error-banner p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--error-600, #dc2626);
	}

	.btn-retry {
		margin-left: auto;
		padding: 0.5rem 1rem;
		background: var(--error-500, #ef4444);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: background 0.2s;
	}

	.btn-retry:hover {
		background: var(--error-600, #dc2626);
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		gap: 1rem;
	}

	.spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid var(--border-color, #e5e7eb);
		border-top-color: var(--primary-500, #3b82f6);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading-state p {
		font-size: 1rem;
		color: var(--text-secondary, #666);
	}

	/* Dashboard Content */
	.dashboard-content {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.charts-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
		gap: 2rem;
	}

	.dashboard-footer {
		padding: 1.5rem;
		background: var(--bg-secondary, #f9fafb);
		border-radius: 8px;
		text-align: center;
	}

	.info-text {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-secondary, #666);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.sms-monitoring-dashboard {
			padding: 1rem;
		}

		.dashboard-header {
			flex-direction: column;
			gap: 1rem;
		}

		.header-actions {
			width: 100%;
			justify-content: space-between;
		}

		.charts-row {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.icon.spinning,
		.spinner {
			animation: none;
		}
	}
</style>

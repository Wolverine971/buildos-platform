<!-- apps/web/src/lib/components/sms/monitoring/MetricsSummaryCard.svelte -->
<script lang="ts">
	// apps/web/src/lib/components/sms/monitoring/MetricsSummaryCard.svelte
	/**
	 * Metrics Summary Card
	 *
	 * Displays overall system health and key metrics
	 */
	import type { MetricsSummary } from '$lib/services/smsMonitoring.service';

	interface Props {
		summary: MetricsSummary;
	}

	let { summary }: Props = $props();

	// Derive health status
	let healthStatus = $derived(summary.health.status);
	let healthColor = $derived(
		healthStatus === 'healthy' ? 'green' : healthStatus === 'degraded' ? 'yellow' : 'red'
	);
	let healthIcon = $derived(
		healthStatus === 'healthy' ? '✓' : healthStatus === 'degraded' ? '⚠' : '✕'
	);

	/**
	 * Format large numbers with commas
	 */
	function formatNumber(num: number): string {
		return num.toLocaleString();
	}

	/**
	 * Format percentage
	 */
	function formatPercent(num: number): string {
		return num.toFixed(1) + '%';
	}

	/**
	 * Format currency
	 */
	function formatCurrency(amount: string): string {
		return '$' + parseFloat(amount).toFixed(4);
	}
</script>

<div class="metrics-summary-card">
	<!-- Health Status Badge -->
	<div class="health-status" data-status={healthStatus}>
		<span class="health-icon" data-color={healthColor}>{healthIcon}</span>
		<div class="health-text">
			<h2>System Status</h2>
			<p class="status-label" data-color={healthColor}>
				{healthStatus === 'healthy'
					? 'All Systems Operational'
					: healthStatus === 'degraded'
						? 'Performance Degraded'
						: 'Critical Issues Detected'}
			</p>
		</div>
	</div>

	<!-- Metrics Grid -->
	<div class="metrics-grid">
		<!-- Today's Metrics -->
		<div class="metric-section">
			<h3>Today</h3>
			<div class="metric-items">
				<div class="metric-item">
					<span class="metric-label">Scheduled</span>
					<span class="metric-value"
						>{formatNumber(summary.today?.scheduled_count || 0)}</span
					>
				</div>
				<div class="metric-item">
					<span class="metric-label">Sent</span>
					<span class="metric-value">{formatNumber(summary.today?.sent_count || 0)}</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Delivered</span>
					<span class="metric-value"
						>{formatNumber(summary.today?.delivered_count || 0)}</span
					>
				</div>
				<div class="metric-item">
					<span class="metric-label">Failed</span>
					<span class="metric-value error"
						>{formatNumber(summary.today?.failed_count || 0)}</span
					>
				</div>
			</div>
		</div>

		<!-- Weekly Metrics -->
		<div class="metric-section">
			<h3>Last 7 Days</h3>
			<div class="metric-items">
				<div class="metric-item">
					<span class="metric-label">Total Sent</span>
					<span class="metric-value">{formatNumber(summary.week.totals.sent)}</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Total Delivered</span>
					<span class="metric-value">{formatNumber(summary.week.totals.delivered)}</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Delivery Rate</span>
					<span
						class="metric-value"
						class:success={summary.week.delivery_rate_percent >= 90}
					>
						{formatPercent(summary.week.delivery_rate_percent)}
					</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Total Failed</span>
					<span class="metric-value error"
						>{formatNumber(summary.week.totals.failed)}</span
					>
				</div>
			</div>
		</div>

		<!-- LLM Metrics -->
		<div class="metric-section">
			<h3>LLM Performance</h3>
			<div class="metric-items">
				<div class="metric-item">
					<span class="metric-label">LLM Success Rate</span>
					<span
						class="metric-value"
						class:success={summary.week.llm_success_rate_percent >= 50}
					>
						{formatPercent(summary.week.llm_success_rate_percent)}
					</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">LLM Generated</span>
					<span class="metric-value">{formatNumber(summary.week.totals.llmSuccess)}</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Template Fallback</span>
					<span class="metric-value"
						>{formatNumber(summary.week.totals.templateFallback)}</span
					>
				</div>
				<div class="metric-item">
					<span class="metric-label">Avg Daily Cost</span>
					<span class="metric-value"
						>{formatCurrency(summary.week.avg_daily_cost_usd)}</span
					>
				</div>
			</div>
		</div>

		<!-- Alert Status -->
		<div class="metric-section">
			<h3>Alerts</h3>
			<div class="metric-items">
				<div class="metric-item">
					<span class="metric-label">Unresolved Alerts</span>
					<span class="metric-value" class:error={summary.alerts.unresolved_count > 0}>
						{summary.alerts.unresolved_count}
					</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Critical Alerts</span>
					<span class="metric-value" class:error={summary.alerts.has_critical}>
						{summary.alerts.has_critical ? 'Yes' : 'No'}
					</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">Delivery Health</span>
					<span class="metric-value" class:success={summary.health.delivery_healthy}>
						{summary.health.delivery_healthy ? 'Healthy' : 'Degraded'}
					</span>
				</div>
				<div class="metric-item">
					<span class="metric-label">LLM Health</span>
					<span class="metric-value" class:success={summary.health.llm_healthy}>
						{summary.health.llm_healthy ? 'Healthy' : 'Degraded'}
					</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.metrics-summary-card {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 2rem;
		box-shadow: var(--shadow-ink);
	}

	/* Health Status */
	.health-status {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		background: hsl(var(--muted));
		border-radius: 8px;
		margin-bottom: 2rem;
	}

	.health-status[data-status='healthy'] {
		background: hsl(var(--success) / 0.1);
		border: 1px solid hsl(var(--success) / 0.3);
	}

	.health-status[data-status='degraded'] {
		background: hsl(var(--warning) / 0.1);
		border: 1px solid hsl(var(--warning) / 0.3);
	}

	.health-status[data-status='critical'] {
		background: hsl(var(--destructive) / 0.1);
		border: 1px solid hsl(var(--destructive) / 0.3);
	}

	.health-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		font-size: 1.5rem;
		font-weight: bold;
	}

	.health-icon[data-color='green'] {
		background: hsl(var(--success) / 0.15);
		color: hsl(var(--success));
	}

	.health-icon[data-color='yellow'] {
		background: hsl(var(--warning) / 0.15);
		color: hsl(var(--foreground));
	}

	.health-icon[data-color='red'] {
		background: hsl(var(--destructive) / 0.15);
		color: hsl(var(--destructive));
	}

	.health-text h2 {
		margin: 0 0 0.25rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.status-label {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.status-label[data-color='green'] {
		color: hsl(var(--success));
	}

	.status-label[data-color='yellow'] {
		color: hsl(var(--foreground));
	}

	.status-label[data-color='red'] {
		color: hsl(var(--destructive));
	}

	/* Metrics Grid */
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
	}

	.metric-section h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		padding-bottom: 0.5rem;
		border-bottom: 2px solid hsl(var(--border));
	}

	.metric-items {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.metric-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.metric-label {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.metric-value {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.metric-value.success {
		color: hsl(var(--success));
	}

	.metric-value.error {
		color: hsl(var(--destructive));
	}

	/* Responsive */
	@media (max-width: 768px) {
		.metrics-summary-card {
			padding: 1rem;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

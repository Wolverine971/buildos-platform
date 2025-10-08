<script lang="ts">
	// apps/web/src/lib/components/sms/monitoring/DeliveryRateChart.svelte
	/**
	 * Delivery Rate Chart
	 *
	 * Visual representation of 7-day delivery performance
	 */
	interface WeekData {
		totals: {
			sent: number;
			delivered: number;
			failed: number;
		};
		delivery_rate_percent: number;
	}

	interface Props {
		weekData: WeekData;
	}

	let { weekData }: Props = $props();

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
	 * Calculate percentage for visualization
	 */
	function calculatePercentage(value: number, total: number): number {
		if (total === 0) return 0;
		return (value / total) * 100;
	}

	// Calculate percentages
	let deliveredPercent = $derived(
		calculatePercentage(weekData.totals.delivered, weekData.totals.sent)
	);
	let failedPercent = $derived(
		calculatePercentage(weekData.totals.failed, weekData.totals.sent)
	);
	let pendingPercent = $derived(100 - deliveredPercent - failedPercent);

	// Health status
	let isHealthy = $derived(weekData.delivery_rate_percent >= 90);
	let isDegraded = $derived(weekData.delivery_rate_percent >= 75 && weekData.delivery_rate_percent < 90);
	let isCritical = $derived(weekData.delivery_rate_percent < 75);
</script>

<div class="delivery-rate-chart">
	<div class="chart-header">
		<h3>Delivery Performance</h3>
		<div class="rate-badge" class:healthy={isHealthy} class:degraded={isDegraded} class:critical={isCritical}>
			{formatPercent(weekData.delivery_rate_percent)}
		</div>
	</div>

	<!-- Progress Bar Visualization -->
	<div class="progress-bar">
		{#if deliveredPercent > 0}
			<div
				class="bar-segment delivered"
				style="width: {deliveredPercent}%"
				title="Delivered: {formatPercent(deliveredPercent)}"
			></div>
		{/if}
		{#if failedPercent > 0}
			<div
				class="bar-segment failed"
				style="width: {failedPercent}%"
				title="Failed: {formatPercent(failedPercent)}"
			></div>
		{/if}
		{#if pendingPercent > 0}
			<div
				class="bar-segment pending"
				style="width: {pendingPercent}%"
				title="Pending: {formatPercent(pendingPercent)}"
			></div>
		{/if}
	</div>

	<!-- Legend & Stats -->
	<div class="legend">
		<div class="legend-item">
			<span class="legend-dot delivered"></span>
			<span class="legend-label">Delivered</span>
			<span class="legend-value">{formatNumber(weekData.totals.delivered)}</span>
		</div>
		<div class="legend-item">
			<span class="legend-dot failed"></span>
			<span class="legend-label">Failed</span>
			<span class="legend-value">{formatNumber(weekData.totals.failed)}</span>
		</div>
		<div class="legend-item">
			<span class="legend-dot pending"></span>
			<span class="legend-label">Pending</span>
			<span class="legend-value">
				{formatNumber(weekData.totals.sent - weekData.totals.delivered - weekData.totals.failed)}
			</span>
		</div>
	</div>

	<!-- Health Message -->
	{#if isHealthy}
		<div class="health-message success">
			✓ Delivery rate is healthy (target: ≥90%)
		</div>
	{:else if isDegraded}
		<div class="health-message warning">
			⚠ Delivery rate is below target (target: ≥90%)
		</div>
	{:else}
		<div class="health-message error">
			✕ Critical: Delivery rate significantly below target
		</div>
	{/if}
</div>

<style>
	.delivery-rate-chart {
		background: white;
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.chart-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--text-primary, #1a1a1a);
	}

	.rate-badge {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.rate-badge.healthy {
		background: var(--success-100, #dcfce7);
		color: var(--success-700, #15803d);
	}

	.rate-badge.degraded {
		background: var(--warning-100, #fef3c7);
		color: var(--warning-700, #a16207);
	}

	.rate-badge.critical {
		background: var(--error-100, #fee2e2);
		color: var(--error-700, #b91c1c);
	}

	/* Progress Bar */
	.progress-bar {
		display: flex;
		height: 2.5rem;
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg-secondary, #f9fafb);
		margin-bottom: 1rem;
	}

	.bar-segment {
		transition: width 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 500;
		color: white;
	}

	.bar-segment.delivered {
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
	}

	.bar-segment.failed {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
	}

	.bar-segment.pending {
		background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
	}

	/* Legend */
	.legend {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend-dot {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
	}

	.legend-dot.delivered {
		background: #10b981;
	}

	.legend-dot.failed {
		background: #ef4444;
	}

	.legend-dot.pending {
		background: #6b7280;
	}

	.legend-label {
		font-size: 0.875rem;
		color: var(--text-secondary, #666);
	}

	.legend-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary, #1a1a1a);
	}

	/* Health Message */
	.health-message {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.health-message.success {
		background: var(--success-50, #f0fdf4);
		color: var(--success-700, #15803d);
		border: 1px solid var(--success-200, #bbf7d0);
	}

	.health-message.warning {
		background: var(--warning-50, #fffbeb);
		color: var(--warning-700, #a16207);
		border: 1px solid var(--warning-200, #fde68a);
	}

	.health-message.error {
		background: var(--error-50, #fef2f2);
		color: var(--error-700, #b91c1c);
		border: 1px solid var(--error-200, #fecaca);
	}
</style>

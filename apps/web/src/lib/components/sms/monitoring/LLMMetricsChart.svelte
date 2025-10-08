<script lang="ts">
	// apps/web/src/lib/components/sms/monitoring/LLMMetricsChart.svelte
	/**
	 * LLM Metrics Chart
	 *
	 * Visual representation of LLM performance and costs
	 */
	interface WeekData {
		totals: {
			llmSuccess: number;
			templateFallback: number;
			llmCost: number;
		};
		llm_success_rate_percent: number;
		avg_daily_cost_usd: string;
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
	 * Format currency
	 */
	function formatCurrency(amount: string | number): string {
		const num = typeof amount === 'string' ? parseFloat(amount) : amount;
		return '$' + num.toFixed(4);
	}

	/**
	 * Calculate percentage for visualization
	 */
	function calculatePercentage(value: number, total: number): number {
		if (total === 0) return 0;
		return (value / total) * 100;
	}

	// Calculate totals and percentages
	let totalGenerated = $derived(
		weekData.totals.llmSuccess + weekData.totals.templateFallback
	);
	let llmPercent = $derived(
		calculatePercentage(weekData.totals.llmSuccess, totalGenerated)
	);
	let templatePercent = $derived(
		calculatePercentage(weekData.totals.templateFallback, totalGenerated)
	);

	// Health status
	let isHealthy = $derived(weekData.llm_success_rate_percent >= 50);
	let isDegraded = $derived(
		weekData.llm_success_rate_percent >= 25 && weekData.llm_success_rate_percent < 50
	);
	let isCritical = $derived(weekData.llm_success_rate_percent < 25);

	// Cost per message
	let costPerMessage = $derived(
		totalGenerated > 0
			? formatCurrency(weekData.totals.llmCost / totalGenerated)
			: '$0.0000'
	);
</script>

<div class="llm-metrics-chart">
	<div class="chart-header">
		<h3>LLM Performance</h3>
		<div class="rate-badge" class:healthy={isHealthy} class:degraded={isDegraded} class:critical={isCritical}>
			{formatPercent(weekData.llm_success_rate_percent)}
		</div>
	</div>

	<!-- Progress Bar Visualization -->
	<div class="progress-bar">
		{#if llmPercent > 0}
			<div
				class="bar-segment llm"
				style="width: {llmPercent}%"
				title="LLM Generated: {formatPercent(llmPercent)}"
			></div>
		{/if}
		{#if templatePercent > 0}
			<div
				class="bar-segment template"
				style="width: {templatePercent}%"
				title="Template Fallback: {formatPercent(templatePercent)}"
			></div>
		{/if}
	</div>

	<!-- Legend & Stats -->
	<div class="legend">
		<div class="legend-item">
			<span class="legend-dot llm"></span>
			<span class="legend-label">LLM Generated</span>
			<span class="legend-value">{formatNumber(weekData.totals.llmSuccess)}</span>
		</div>
		<div class="legend-item">
			<span class="legend-dot template"></span>
			<span class="legend-label">Template Fallback</span>
			<span class="legend-value">{formatNumber(weekData.totals.templateFallback)}</span>
		</div>
	</div>

	<!-- Cost Metrics -->
	<div class="cost-metrics">
		<div class="cost-item">
			<span class="cost-label">Total Weekly Cost</span>
			<span class="cost-value">{formatCurrency(weekData.totals.llmCost)}</span>
		</div>
		<div class="cost-item">
			<span class="cost-label">Avg Daily Cost</span>
			<span class="cost-value">{formatCurrency(weekData.avg_daily_cost_usd)}</span>
		</div>
		<div class="cost-item">
			<span class="cost-label">Cost Per Message</span>
			<span class="cost-value">{costPerMessage}</span>
		</div>
	</div>

	<!-- Health Message -->
	{#if isHealthy}
		<div class="health-message success">
			✓ LLM success rate is healthy (target: ≥50%)
		</div>
	{:else if isDegraded}
		<div class="health-message warning">
			⚠ LLM success rate is below target (target: ≥50%)
		</div>
	{:else}
		<div class="health-message error">
			✕ Critical: LLM failing frequently, using template fallback
		</div>
	{/if}
</div>

<style>
	.llm-metrics-chart {
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

	.bar-segment.llm {
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
	}

	.bar-segment.template {
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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

	.legend-dot.llm {
		background: #3b82f6;
	}

	.legend-dot.template {
		background: #f59e0b;
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

	/* Cost Metrics */
	.cost-metrics {
		display: flex;
		gap: 2rem;
		padding: 1rem;
		background: var(--bg-secondary, #f9fafb);
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.cost-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.cost-label {
		font-size: 0.75rem;
		color: var(--text-secondary, #666);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.cost-value {
		font-size: 1.125rem;
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

	/* Responsive */
	@media (max-width: 640px) {
		.cost-metrics {
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>

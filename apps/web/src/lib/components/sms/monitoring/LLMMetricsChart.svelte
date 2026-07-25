<!-- apps/web/src/lib/components/sms/monitoring/LLMMetricsChart.svelte -->
<script lang="ts">
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
	let totalGenerated = $derived(weekData.totals.llmSuccess + weekData.totals.templateFallback);
	let llmPercent = $derived(calculatePercentage(weekData.totals.llmSuccess, totalGenerated));
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
		totalGenerated > 0 ? formatCurrency(weekData.totals.llmCost / totalGenerated) : '$0.0000'
	);
</script>

<div class="llm-metrics-chart">
	<div class="chart-header">
		<h3>LLM Performance</h3>
		<div
			class="rate-badge"
			class:healthy={isHealthy}
			class:degraded={isDegraded}
			class:critical={isCritical}
		>
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
		<div class="health-message success">✓ LLM success rate is healthy (target: ≥50%)</div>
	{:else if isDegraded}
		<div class="health-message warning">⚠ LLM success rate is below target (target: ≥50%)</div>
	{:else}
		<div class="health-message error">
			✕ Critical: LLM failing frequently, using template fallback
		</div>
	{/if}
</div>

<style>
	.llm-metrics-chart {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: var(--shadow-ink);
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
		color: hsl(var(--foreground));
	}

	.rate-badge {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.rate-badge.healthy {
		background: hsl(var(--success) / 0.15);
		color: hsl(var(--success));
	}

	.rate-badge.degraded {
		background: hsl(var(--warning) / 0.15);
		color: hsl(var(--foreground));
	}

	.rate-badge.critical {
		background: hsl(var(--destructive) / 0.15);
		color: hsl(var(--destructive));
	}

	/* Progress Bar */
	.progress-bar {
		display: flex;
		height: 2.5rem;
		border-radius: 8px;
		overflow: hidden;
		background: hsl(var(--muted));
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
		background: linear-gradient(135deg, hsl(var(--info)) 0%, hsl(var(--info) / 0.72) 100%);
	}

	.bar-segment.template {
		background: linear-gradient(
			135deg,
			hsl(var(--warning)) 0%,
			hsl(var(--warning) / 0.72) 100%
		);
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
		background: hsl(var(--info));
	}

	.legend-dot.template {
		background: hsl(var(--warning));
	}

	.legend-label {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.legend-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	/* Cost Metrics */
	.cost-metrics {
		display: flex;
		gap: 2rem;
		padding: 1rem;
		background: hsl(var(--muted));
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
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.cost-value {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	/* Health Message */
	.health-message {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.health-message.success {
		background: hsl(var(--success) / 0.1);
		color: hsl(var(--success));
		border: 1px solid hsl(var(--success) / 0.3);
	}

	.health-message.warning {
		background: hsl(var(--warning) / 0.1);
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--warning) / 0.3);
	}

	.health-message.error {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
		border: 1px solid hsl(var(--destructive) / 0.3);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.cost-metrics {
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>

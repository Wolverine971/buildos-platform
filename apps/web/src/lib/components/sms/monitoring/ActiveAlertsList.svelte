<!-- apps/web/src/lib/components/sms/monitoring/ActiveAlertsList.svelte -->
<script lang="ts">
	// apps/web/src/lib/components/sms/monitoring/ActiveAlertsList.svelte
	/**
	 * Active Alerts List
	 *
	 * Displays unresolved alerts with resolution actions
	 */
	import { SvelteSet } from 'svelte/reactivity';
	import { smsMonitoringService, type Alert } from '$lib/services/smsMonitoring.service';

	interface AlertsData {
		unresolved_count: number;
		has_critical: boolean;
		recent: Alert[];
	}

	interface Props {
		alerts: AlertsData;
	}

	let { alerts }: Props = $props();
	const resolvingAlerts = new SvelteSet<string>();

	/**
	 * Format date/time
	 */
	function formatDateTime(isoString: string): string {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	/**
	 * Get severity color class
	 */
	function getSeverityClass(severity: string): string {
		if (severity === 'critical') return 'critical';
		if (severity === 'warning') return 'warning';
		return 'info';
	}

	/**
	 * Get severity icon
	 */
	function getSeverityIcon(severity: string): string {
		if (severity === 'critical') return '🚨';
		if (severity === 'warning') return '⚠️';
		return 'ℹ️';
	}

	/**
	 * Resolve an alert
	 */
	async function resolveAlert(alertId: string) {
		if (resolvingAlerts.has(alertId)) return;

		resolvingAlerts.add(alertId);

		try {
			await smsMonitoringService.resolveAlert(alertId);

			// Remove from recent list
			alerts.recent = alerts.recent.filter((a) => a.id !== alertId);
			alerts.unresolved_count = Math.max(0, alerts.unresolved_count - 1);

			// Check if any critical alerts remain
			alerts.has_critical = alerts.recent.some((a) => a.severity === 'critical');
		} catch (error: any) {
			console.error('Failed to resolve alert:', error);
			alert(`Failed to resolve alert: ${error.message}`);
		} finally {
			resolvingAlerts.delete(alertId);
		}
	}
</script>

<div class="active-alerts-list">
	<div class="alerts-header">
		<div>
			<h3>Active Alerts</h3>
			<p class="subtitle">
				{alerts.unresolved_count} unresolved {alerts.unresolved_count === 1
					? 'alert'
					: 'alerts'}
				{#if alerts.has_critical}
					<span class="critical-badge">Critical</span>
				{/if}
			</p>
		</div>
	</div>

	{#if alerts.recent.length === 0}
		<div class="no-alerts">
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
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p>No active alerts - all systems operational</p>
		</div>
	{:else}
		<div class="alerts-grid">
			{#each alerts.recent as alert (alert.id)}
				<div class="alert-card" data-severity={getSeverityClass(alert.severity)}>
					<div class="alert-header">
						<div class="alert-title">
							<span class="severity-icon">{getSeverityIcon(alert.severity)}</span>
							<span class="alert-type">{alert.alert_type.replace(/_/g, ' ')}</span>
							<span
								class="severity-badge"
								data-severity={getSeverityClass(alert.severity)}
							>
								{alert.severity}
							</span>
						</div>
						<span class="alert-time">{formatDateTime(alert.triggered_at)}</span>
					</div>

					<p class="alert-message">{alert.message}</p>

					<div class="alert-details">
						<div class="detail-item">
							<span class="detail-label">Metric Value</span>
							<span class="detail-value">{alert.metric_value.toFixed(2)}</span>
						</div>
						<div class="detail-item">
							<span class="detail-label">Threshold</span>
							<span class="detail-value">{alert.threshold_value.toFixed(2)}</span>
						</div>
						<div class="detail-item">
							<span class="detail-label">Channel</span>
							<span class="detail-value">{alert.notification_channel}</span>
						</div>
						<div class="detail-item">
							<span class="detail-label">Notified</span>
							<span class="detail-value"
								>{alert.notification_sent ? '✓ Yes' : '✗ No'}</span
							>
						</div>
					</div>

					<button
						class="btn-resolve"
						onclick={() => resolveAlert(alert.id)}
						disabled={resolvingAlerts.has(alert.id)}
					>
						{resolvingAlerts.has(alert.id) ? 'Resolving...' : 'Mark as Resolved'}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.active-alerts-list {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 2rem;
		box-shadow: var(--shadow-ink);
	}

	.alerts-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
	}

	.alerts-header h3 {
		margin: 0 0 0.25rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.subtitle {
		margin: 0;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.critical-badge {
		padding: 0.125rem 0.5rem;
		background: hsl(var(--destructive) / 0.15);
		color: hsl(var(--destructive));
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	/* No Alerts State */
	.no-alerts {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 2rem;
		text-align: center;
	}

	.no-alerts .icon {
		width: 3rem;
		height: 3rem;
		color: hsl(var(--success));
		margin-bottom: 1rem;
	}

	.no-alerts p {
		margin: 0;
		font-size: 1rem;
		color: hsl(var(--muted-foreground));
	}

	/* Alerts Grid */
	.alerts-grid {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.alert-card {
		padding: 1.5rem;
		border-radius: 8px;
		border: 2px solid;
		transition: box-shadow 0.2s;
	}

	.alert-card:hover {
		box-shadow: var(--shadow-ink-strong);
	}

	.alert-card[data-severity='critical'] {
		background: hsl(var(--destructive) / 0.1);
		border-color: hsl(var(--destructive) / 0.3);
	}

	.alert-card[data-severity='warning'] {
		background: hsl(var(--warning) / 0.1);
		border-color: hsl(var(--warning) / 0.3);
	}

	.alert-card[data-severity='info'] {
		background: hsl(var(--info) / 0.1);
		border-color: hsl(var(--info) / 0.3);
	}

	.alert-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
		gap: 1rem;
	}

	.alert-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
	}

	.severity-icon {
		font-size: 1.25rem;
	}

	.alert-type {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-transform: capitalize;
	}

	.severity-badge {
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.severity-badge[data-severity='critical'] {
		background: hsl(var(--destructive) / 0.15);
		color: hsl(var(--destructive));
	}

	.severity-badge[data-severity='warning'] {
		background: hsl(var(--warning) / 0.15);
		color: hsl(var(--foreground));
	}

	.severity-badge[data-severity='info'] {
		background: hsl(var(--info) / 0.15);
		color: hsl(var(--info));
	}

	.alert-time {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.alert-message {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		line-height: 1.5;
	}

	.alert-details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.btn-resolve {
		width: 100%;
		padding: 0.625rem 1rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-resolve:hover:not(:disabled) {
		background: hsl(var(--muted));
		border-color: hsl(var(--border-strong));
	}

	.btn-resolve:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.active-alerts-list {
			padding: 1rem;
		}

		.alert-card {
			padding: 1rem;
		}

		.alert-header {
			flex-direction: column;
		}

		.alert-details {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>

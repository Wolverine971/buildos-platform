// apps/web/src/routes/api/cron/billing-ops-monitoring/+server.ts
import type { RequestHandler } from './$types';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';
import {
	BILLING_OPS_DEFAULT_BASELINE_LOOKBACK,
	BILLING_OPS_DEFAULT_WINDOW_DAYS,
	BILLING_OPS_MAX_WINDOW_DAYS,
	detectBillingOpsAnomalies,
	fetchBillingOpsBaseline,
	fetchBillingOpsMetrics,
	toSnapshotDateUTC,
	toSnapshotRecord,
	type BillingOpsAnomaly
} from '$lib/server/billing-ops-monitoring';

function metricLabel(metricName: string): string {
	switch (metricName) {
		case 'frozen_active_count':
			return 'Frozen account volume';
		case 'freeze_transitions_window_count':
			return 'Freeze transition count';
		case 'manual_unfreeze_rate':
			return 'Manual unfreeze rate';
		case 'auto_pro_to_power_escalation_rate':
			return 'Auto Pro->Power escalation rate';
		default:
			return metricName;
	}
}

function formatMetricValue(metricName: string, value: number): string {
	if (metricName.endsWith('_rate') || metricName.endsWith('_share')) {
		return `${(value * 100).toFixed(1)}%`;
	}
	return value.toFixed(2).replace(/\.00$/, '');
}

function anomalyNotificationPayload(
	anomaly: BillingOpsAnomaly,
	windowDays: number,
	snapshotDate: string
) {
	const label = metricLabel(anomaly.metricName);
	const observed = formatMetricValue(anomaly.metricName, anomaly.observedValue);
	const baseline =
		anomaly.baselineValue == null
			? 'n/a'
			: formatMetricValue(anomaly.metricName, anomaly.baselineValue);

	const severityPrefix = anomaly.severity === 'critical' ? 'Critical' : 'Warning';

	return {
		title: `${severityPrefix}: Billing Ops Anomaly`,
		message: `${label} anomaly detected (${observed} vs baseline ${baseline}) for ${windowDays}d window.`,
		priority: anomaly.severity === 'critical' ? 'high' : 'medium',
		data: {
			anomaly_key: anomaly.anomalyKey,
			metric_name: anomaly.metricName,
			observed_value: anomaly.observedValue,
			baseline_value: anomaly.baselineValue,
			delta_value: anomaly.deltaValue,
			delta_ratio: anomaly.deltaRatio,
			severity: anomaly.severity,
			snapshot_date: snapshotDate,
			window_days: windowDays,
			details: anomaly.details
		}
	};
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedCronRequest(request, PRIVATE_CRON_SECRET)) {
		return ApiResponse.unauthorized();
	}

	const supabase = createAdminSupabaseClient();
	const requestedWindowDays = Number.parseInt(
		url.searchParams.get('windowDays') || `${BILLING_OPS_DEFAULT_WINDOW_DAYS}`,
		10
	);
	const windowDays = Number.isFinite(requestedWindowDays)
		? Math.min(Math.max(requestedWindowDays, 1), BILLING_OPS_MAX_WINDOW_DAYS)
		: BILLING_OPS_DEFAULT_WINDOW_DAYS;

	const requestedLookbackDays = Number.parseInt(
		url.searchParams.get('lookbackDays') || `${BILLING_OPS_DEFAULT_BASELINE_LOOKBACK}`,
		10
	);
	const lookbackDays = Number.isFinite(requestedLookbackDays)
		? Math.min(Math.max(requestedLookbackDays, 3), 90)
		: BILLING_OPS_DEFAULT_BASELINE_LOOKBACK;

	try {
		const snapshotDate = toSnapshotDateUTC();
		const metrics = await fetchBillingOpsMetrics(supabase, windowDays);
		const snapshotRecord = toSnapshotRecord(snapshotDate, metrics);
		const baseline = await fetchBillingOpsBaseline(supabase, snapshotRecord.windowDays, {
			lookbackDays,
			beforeSnapshotDate: snapshotDate
		});
		const anomalies = detectBillingOpsAnomalies(snapshotRecord, baseline);

		const nowIso = new Date().toISOString();
		const { data: snapshot, error: snapshotError } = await (supabase as any)
			.from('billing_ops_snapshots')
			.upsert(
				{
					snapshot_date: snapshotDate,
					snapshot_at: nowIso,
					window_days: snapshotRecord.windowDays,
					source: 'cron',
					frozen_active_count: snapshotRecord.frozenActiveCount,
					total_accounts_count: snapshotRecord.totalAccountsCount,
					freeze_transitions_window_count: snapshotRecord.freezeTransitionsWindowCount,
					manual_unfreeze_window_count: snapshotRecord.manualUnfreezeWindowCount,
					pro_to_power_transition_window_count:
						snapshotRecord.proToPowerTransitionWindowCount,
					auto_pro_to_power_transition_window_count:
						snapshotRecord.autoProToPowerTransitionWindowCount,
					paid_account_count: snapshotRecord.paidAccountCount,
					current_power_account_count: snapshotRecord.currentPowerAccountCount,
					manual_unfreeze_rate: snapshotRecord.manualUnfreezeRate,
					auto_pro_to_power_escalation_rate: snapshotRecord.autoProToPowerEscalationRate,
					current_power_share: snapshotRecord.currentPowerShare,
					frozen_account_share: snapshotRecord.frozenAccountShare,
					generated_alerts: metrics.alerts,
					anomaly_count: anomalies.length,
					updated_at: nowIso
				},
				{ onConflict: 'snapshot_date,window_days' }
			)
			.select('id, snapshot_date, window_days')
			.single();

		if (snapshotError) throw snapshotError;

		if (anomalies.length > 0) {
			const anomalyRows = anomalies.map((entry) => ({
				snapshot_id: snapshot.id,
				snapshot_date: snapshot.snapshot_date,
				window_days: snapshot.window_days,
				anomaly_key: entry.anomalyKey,
				severity: entry.severity,
				metric_name: entry.metricName,
				observed_value: entry.observedValue,
				baseline_value: entry.baselineValue,
				delta_value: entry.deltaValue,
				delta_ratio: entry.deltaRatio,
				details: entry.details,
				updated_at: nowIso
			}));

			const { error: anomaliesError } = await (supabase as any)
				.from('billing_ops_anomalies')
				.upsert(anomalyRows, { onConflict: 'snapshot_id,anomaly_key' });

			if (anomaliesError) throw anomaliesError;
		}

		const { data: pendingNotificationAnomalies, error: pendingAnomaliesError } = await (
			supabase as any
		)
			.from('billing_ops_anomalies')
			.select(
				'id, anomaly_key, severity, metric_name, observed_value, baseline_value, delta_value, delta_ratio, details'
			)
			.eq('snapshot_id', snapshot.id)
			.is('notified_at', null)
			.in('severity', ['warning', 'critical']);

		if (pendingAnomaliesError) throw pendingAnomaliesError;

		let notifiedAnomalyCount = 0;
		let adminRecipients = 0;

		if ((pendingNotificationAnomalies || []).length > 0) {
			const { data: admins, error: adminsError } = await supabase
				.from('users')
				.select('id')
				.eq('is_admin', true);

			if (adminsError) throw adminsError;
			adminRecipients = admins?.length || 0;

			if (adminRecipients > 0) {
				const notifications = (pendingNotificationAnomalies || []).flatMap(
					(anomaly: any) => {
						const payload = anomalyNotificationPayload(
							{
								anomalyKey: anomaly.anomaly_key,
								severity: anomaly.severity,
								metricName: anomaly.metric_name,
								observedValue: Number(anomaly.observed_value),
								baselineValue:
									anomaly.baseline_value == null
										? null
										: Number(anomaly.baseline_value),
								deltaValue:
									anomaly.delta_value == null
										? null
										: Number(anomaly.delta_value),
								deltaRatio:
									anomaly.delta_ratio == null
										? null
										: Number(anomaly.delta_ratio),
								details: (anomaly.details || {}) as Record<string, unknown>
							},
							snapshot.window_days,
							snapshot.snapshot_date
						);

						return (admins || []).map((admin) => ({
							user_id: admin.id,
							type: 'billing_ops_alert',
							event_type: 'billing_ops_anomaly',
							title: payload.title,
							message: payload.message,
							priority: payload.priority,
							action_url: '/admin/subscriptions',
							data: payload.data,
							expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
						}));
					}
				);

				if (notifications.length > 0) {
					const { error: notificationsError } = await (supabase as any)
						.from('user_notifications')
						.insert(notifications);
					if (notificationsError) throw notificationsError;
				}
			}

			const { error: markNotifiedError } = await (supabase as any)
				.from('billing_ops_anomalies')
				.update({
					notified_at: nowIso,
					notification_channels: ['in_app_admin'],
					updated_at: nowIso
				})
				.in(
					'id',
					(pendingNotificationAnomalies || []).map((anomaly: any) => anomaly.id)
				);

			if (markNotifiedError) throw markNotifiedError;
			notifiedAnomalyCount = pendingNotificationAnomalies?.length || 0;
		}

		await supabase.from('cron_logs').insert({
			job_name: 'billing_ops_monitoring',
			status: 'success',
			executed_at: nowIso
		});

		return ApiResponse.success({
			snapshotDate,
			windowDays: snapshotRecord.windowDays,
			baselineSamples: baseline?.sampleSize ?? 0,
			alertCount: metrics.alerts.length,
			anomalyCount: anomalies.length,
			notifiedAnomalyCount,
			adminRecipients
		});
	} catch (error) {
		console.error('Billing ops monitoring cron failed:', error);

		await supabase.from('cron_logs').insert({
			job_name: 'billing_ops_monitoring',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return ApiResponse.internalError(error, 'Failed to process billing ops monitoring cron');
	}
};

// apps/web/src/lib/server/billing-ops-monitoring.ts

export const BILLING_OPS_DEFAULT_WINDOW_DAYS = 30;
export const BILLING_OPS_MAX_WINDOW_DAYS = 180;
export const BILLING_OPS_DEFAULT_BASELINE_LOOKBACK = 14;

export const BILLING_OPS_ALERT_THRESHOLDS = {
	frozenHighWatermark: 20,
	manualUnfreezeRateWarning: 0.35,
	autoEscalationRateWarning: 0.2,
	autoEscalationRateLow: 0.01
} as const;

export type BillingOpsAlert = {
	id: string;
	severity: 'info' | 'warning' | 'critical';
	title: string;
	message: string;
};

export type BillingOpsMetrics = {
	windowDays: number;
	windowStart: string;
	windowEnd: string;
	counts: {
		frozenActiveCount: number;
		totalAccountsCount: number;
		freezeTransitionsWindowCount: number;
		manualUnfreezeWindowCount: number;
		proToPowerTransitionWindowCount: number;
		autoProToPowerTransitionWindowCount: number;
		paidAccountCount: number;
		currentPowerAccountCount: number;
	};
	rates: {
		manualUnfreezeRate: number;
		autoProToPowerEscalationRate: number;
		currentPowerShare: number;
		frozenAccountShare: number;
	};
	alerts: BillingOpsAlert[];
};

export type BillingOpsSnapshotRecord = {
	snapshotDate: string;
	windowDays: number;
	frozenActiveCount: number;
	totalAccountsCount: number;
	freezeTransitionsWindowCount: number;
	manualUnfreezeWindowCount: number;
	proToPowerTransitionWindowCount: number;
	autoProToPowerTransitionWindowCount: number;
	paidAccountCount: number;
	currentPowerAccountCount: number;
	manualUnfreezeRate: number;
	autoProToPowerEscalationRate: number;
	currentPowerShare: number;
	frozenAccountShare: number;
};

export type BillingOpsBaseline = {
	sampleSize: number;
	averages: Omit<BillingOpsSnapshotRecord, 'snapshotDate' | 'windowDays'>;
};

export type BillingOpsAnomaly = {
	anomalyKey: string;
	severity: 'info' | 'warning' | 'critical';
	metricName: string;
	observedValue: number;
	baselineValue: number | null;
	deltaValue: number | null;
	deltaRatio: number | null;
	details: Record<string, unknown>;
};

function ratio(numerator: number, denominator: number): number {
	if (denominator <= 0) return 0;
	return numerator / denominator;
}

function boundedWindowDays(windowDays: number): number {
	if (!Number.isFinite(windowDays)) return BILLING_OPS_DEFAULT_WINDOW_DAYS;
	return Math.min(Math.max(Math.trunc(windowDays), 1), BILLING_OPS_MAX_WINDOW_DAYS);
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function toSnapshotDateUTC(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

export function toSnapshotRecord(
	snapshotDate: string,
	metrics: BillingOpsMetrics
): BillingOpsSnapshotRecord {
	return {
		snapshotDate,
		windowDays: metrics.windowDays,
		frozenActiveCount: metrics.counts.frozenActiveCount,
		totalAccountsCount: metrics.counts.totalAccountsCount,
		freezeTransitionsWindowCount: metrics.counts.freezeTransitionsWindowCount,
		manualUnfreezeWindowCount: metrics.counts.manualUnfreezeWindowCount,
		proToPowerTransitionWindowCount: metrics.counts.proToPowerTransitionWindowCount,
		autoProToPowerTransitionWindowCount: metrics.counts.autoProToPowerTransitionWindowCount,
		paidAccountCount: metrics.counts.paidAccountCount,
		currentPowerAccountCount: metrics.counts.currentPowerAccountCount,
		manualUnfreezeRate: metrics.rates.manualUnfreezeRate,
		autoProToPowerEscalationRate: metrics.rates.autoProToPowerEscalationRate,
		currentPowerShare: metrics.rates.currentPowerShare,
		frozenAccountShare: metrics.rates.frozenAccountShare
	};
}

export async function fetchBillingOpsMetrics(
	supabase: any,
	windowDays: number
): Promise<BillingOpsMetrics> {
	const resolvedWindowDays = boundedWindowDays(windowDays);
	const now = new Date();
	const windowStart = new Date(
		now.getTime() - resolvedWindowDays * 24 * 60 * 60 * 1000
	).toISOString();
	const windowEnd = now.toISOString();

	const [
		{ count: frozenCount, error: frozenError },
		{ count: accountCount, error: accountError },
		{ count: freezeTransitionsCount, error: freezeTransitionsError },
		{ count: manualUnfreezeCount, error: manualUnfreezeError },
		{ count: proToPowerTransitionsCount, error: proToPowerError },
		{ count: autoProToPowerTransitionsCount, error: autoProToPowerError },
		{ count: paidAccountsCount, error: paidAccountsError },
		{ count: powerAccountsCount, error: powerAccountsError }
	] = await Promise.all([
		(supabase as any)
			.from('billing_accounts')
			.select('id', { count: 'exact', head: true })
			.eq('billing_state', 'upgrade_required_frozen'),
		(supabase as any).from('billing_accounts').select('id', { count: 'exact', head: true }),
		(supabase as any)
			.from('billing_state_transitions')
			.select('id', { count: 'exact', head: true })
			.eq('to_billing_state', 'upgrade_required_frozen')
			.gte('created_at', windowStart)
			.lte('created_at', windowEnd),
		(supabase as any)
			.from('user_activity_logs')
			.select('id', { count: 'exact', head: true })
			.eq('activity_type', 'admin_manual_unfreeze')
			.gte('created_at', windowStart)
			.lte('created_at', windowEnd),
		(supabase as any)
			.from('billing_state_transitions')
			.select('id', { count: 'exact', head: true })
			.eq('from_billing_tier', 'pro')
			.eq('to_billing_tier', 'power')
			.gte('created_at', windowStart)
			.lte('created_at', windowEnd),
		(supabase as any)
			.from('billing_state_transitions')
			.select('id', { count: 'exact', head: true })
			.eq('from_billing_tier', 'pro')
			.eq('to_billing_tier', 'power')
			.eq('change_source', 'system')
			.gte('created_at', windowStart)
			.lte('created_at', windowEnd),
		(supabase as any)
			.from('billing_accounts')
			.select('id', { count: 'exact', head: true })
			.in('billing_tier', ['pro', 'power']),
		(supabase as any)
			.from('billing_accounts')
			.select('id', { count: 'exact', head: true })
			.eq('billing_tier', 'power')
	]);

	if (frozenError) throw frozenError;
	if (accountError) throw accountError;
	if (freezeTransitionsError) throw freezeTransitionsError;
	if (manualUnfreezeError) throw manualUnfreezeError;
	if (proToPowerError) throw proToPowerError;
	if (autoProToPowerError) throw autoProToPowerError;
	if (paidAccountsError) throw paidAccountsError;
	if (powerAccountsError) throw powerAccountsError;

	const frozenActiveCount = frozenCount ?? 0;
	const totalAccountsCount = accountCount ?? 0;
	const freezeTransitionsWindowCount = freezeTransitionsCount ?? 0;
	const manualUnfreezeWindowCount = manualUnfreezeCount ?? 0;
	const proToPowerTransitionWindowCount = proToPowerTransitionsCount ?? 0;
	const autoProToPowerTransitionWindowCount = autoProToPowerTransitionsCount ?? 0;
	const paidAccountCount = paidAccountsCount ?? 0;
	const currentPowerAccountCount = powerAccountsCount ?? 0;

	const manualUnfreezeRate = ratio(manualUnfreezeWindowCount, freezeTransitionsWindowCount);
	const autoProToPowerEscalationRate = ratio(
		autoProToPowerTransitionWindowCount,
		paidAccountCount
	);
	const currentPowerShare = ratio(currentPowerAccountCount, paidAccountCount);
	const frozenAccountShare = ratio(frozenActiveCount, totalAccountsCount);

	const alerts: BillingOpsAlert[] = [];

	if (frozenActiveCount >= BILLING_OPS_ALERT_THRESHOLDS.frozenHighWatermark) {
		alerts.push({
			id: 'frozen-volume-high',
			severity: 'critical',
			title: 'Frozen Account Volume High',
			message: `${frozenActiveCount} accounts are currently frozen. Review threshold sensitivity and activation friction.`
		});
	}

	if (
		freezeTransitionsWindowCount >= 10 &&
		manualUnfreezeRate >= BILLING_OPS_ALERT_THRESHOLDS.manualUnfreezeRateWarning
	) {
		alerts.push({
			id: 'manual-unfreeze-rate-high',
			severity: 'warning',
			title: 'Manual Unfreeze Rate Elevated',
			message: `${Math.round(
				manualUnfreezeRate * 100
			)}% of freeze transitions needed manual intervention in the last ${resolvedWindowDays} days.`
		});
	}

	if (
		paidAccountCount >= 20 &&
		autoProToPowerEscalationRate >= BILLING_OPS_ALERT_THRESHOLDS.autoEscalationRateWarning
	) {
		alerts.push({
			id: 'auto-escalation-rate-high',
			severity: 'warning',
			title: 'Auto Escalation Rate Elevated',
			message: `${Math.round(
				autoProToPowerEscalationRate * 100
			)}% of paid accounts auto-escalated Pro->Power in the last ${resolvedWindowDays} days.`
		});
	}

	if (
		paidAccountCount >= 20 &&
		autoProToPowerEscalationRate <= BILLING_OPS_ALERT_THRESHOLDS.autoEscalationRateLow
	) {
		alerts.push({
			id: 'auto-escalation-rate-low',
			severity: 'info',
			title: 'Auto Escalation Rate Low',
			message: `Only ${Math.round(
				autoProToPowerEscalationRate * 100
			)}% of paid accounts auto-escalated in the last ${resolvedWindowDays} days.`
		});
	}

	return {
		windowDays: resolvedWindowDays,
		windowStart,
		windowEnd,
		counts: {
			frozenActiveCount,
			totalAccountsCount,
			freezeTransitionsWindowCount,
			manualUnfreezeWindowCount,
			proToPowerTransitionWindowCount,
			autoProToPowerTransitionWindowCount,
			paidAccountCount,
			currentPowerAccountCount
		},
		rates: {
			manualUnfreezeRate,
			autoProToPowerEscalationRate,
			currentPowerShare,
			frozenAccountShare
		},
		alerts
	};
}

export async function fetchBillingOpsBaseline(
	supabase: any,
	windowDays: number,
	options?: { lookbackDays?: number; beforeSnapshotDate?: string }
): Promise<BillingOpsBaseline | null> {
	const resolvedWindowDays = boundedWindowDays(windowDays);
	const resolvedLookback = Math.max(
		3,
		Math.min(options?.lookbackDays ?? BILLING_OPS_DEFAULT_BASELINE_LOOKBACK, 90)
	);

	let query = (supabase as any)
		.from('billing_ops_snapshots')
		.select(
			'frozen_active_count,total_accounts_count,freeze_transitions_window_count,manual_unfreeze_window_count,pro_to_power_transition_window_count,auto_pro_to_power_transition_window_count,paid_account_count,current_power_account_count,manual_unfreeze_rate,auto_pro_to_power_escalation_rate,current_power_share,frozen_account_share'
		)
		.eq('window_days', resolvedWindowDays)
		.order('snapshot_date', { ascending: false })
		.limit(resolvedLookback);

	if (options?.beforeSnapshotDate) {
		query = query.lt('snapshot_date', options.beforeSnapshotDate);
	}

	const { data, error } = await query;
	if (error) throw error;
	if (!data || data.length < 3) return null;

	const rows = data as Array<Record<string, number>>;
	const sampleSize = rows.length;

	return {
		sampleSize,
		averages: {
			frozenActiveCount: avg(rows.map((row) => Number(row.frozen_active_count ?? 0))),
			totalAccountsCount: avg(rows.map((row) => Number(row.total_accounts_count ?? 0))),
			freezeTransitionsWindowCount: avg(
				rows.map((row) => Number(row.freeze_transitions_window_count ?? 0))
			),
			manualUnfreezeWindowCount: avg(
				rows.map((row) => Number(row.manual_unfreeze_window_count ?? 0))
			),
			proToPowerTransitionWindowCount: avg(
				rows.map((row) => Number(row.pro_to_power_transition_window_count ?? 0))
			),
			autoProToPowerTransitionWindowCount: avg(
				rows.map((row) => Number(row.auto_pro_to_power_transition_window_count ?? 0))
			),
			paidAccountCount: avg(rows.map((row) => Number(row.paid_account_count ?? 0))),
			currentPowerAccountCount: avg(
				rows.map((row) => Number(row.current_power_account_count ?? 0))
			),
			manualUnfreezeRate: avg(rows.map((row) => Number(row.manual_unfreeze_rate ?? 0))),
			autoProToPowerEscalationRate: avg(
				rows.map((row) => Number(row.auto_pro_to_power_escalation_rate ?? 0))
			),
			currentPowerShare: avg(rows.map((row) => Number(row.current_power_share ?? 0))),
			frozenAccountShare: avg(rows.map((row) => Number(row.frozen_account_share ?? 0)))
		}
	};
}

function anomaly(
	anomalyKey: string,
	severity: BillingOpsAnomaly['severity'],
	metricName: string,
	observedValue: number,
	baselineValue: number | null,
	details: Record<string, unknown>
): BillingOpsAnomaly {
	const deltaValue = baselineValue == null ? null : observedValue - baselineValue;
	const deltaRatio =
		baselineValue == null || baselineValue === 0 ? null : observedValue / baselineValue;

	return {
		anomalyKey,
		severity,
		metricName,
		observedValue,
		baselineValue,
		deltaValue,
		deltaRatio,
		details
	};
}

export function detectBillingOpsAnomalies(
	current: BillingOpsSnapshotRecord,
	baseline: BillingOpsBaseline | null
): BillingOpsAnomaly[] {
	const anomalies: BillingOpsAnomaly[] = [];

	const baselineSampleSize = baseline?.sampleSize ?? 0;
	const baselineValues = baseline?.averages;

	if (baselineValues && baselineSampleSize >= 3) {
		const frozenSpikeThreshold = Math.max(20, baselineValues.frozenActiveCount * 1.5);
		if (
			current.frozenActiveCount >= frozenSpikeThreshold &&
			current.frozenActiveCount - baselineValues.frozenActiveCount >= 5
		) {
			anomalies.push(
				anomaly(
					'frozen_volume_spike',
					'critical',
					'frozen_active_count',
					current.frozenActiveCount,
					baselineValues.frozenActiveCount,
					{
						threshold: frozenSpikeThreshold,
						sampleSize: baselineSampleSize
					}
				)
			);
		}

		const freezeTransitionSpikeThreshold = Math.max(
			10,
			baselineValues.freezeTransitionsWindowCount * 1.75
		);
		if (
			current.freezeTransitionsWindowCount >= freezeTransitionSpikeThreshold &&
			current.freezeTransitionsWindowCount - baselineValues.freezeTransitionsWindowCount >= 5
		) {
			anomalies.push(
				anomaly(
					'freeze_transition_spike',
					'warning',
					'freeze_transitions_window_count',
					current.freezeTransitionsWindowCount,
					baselineValues.freezeTransitionsWindowCount,
					{
						threshold: freezeTransitionSpikeThreshold,
						sampleSize: baselineSampleSize
					}
				)
			);
		}

		const manualUnfreezeThreshold = Math.max(0.25, baselineValues.manualUnfreezeRate * 1.5);
		if (
			current.manualUnfreezeRate >= manualUnfreezeThreshold &&
			current.manualUnfreezeRate - baselineValues.manualUnfreezeRate >= 0.1
		) {
			anomalies.push(
				anomaly(
					'manual_unfreeze_rate_spike',
					'warning',
					'manual_unfreeze_rate',
					current.manualUnfreezeRate,
					baselineValues.manualUnfreezeRate,
					{
						threshold: manualUnfreezeThreshold,
						sampleSize: baselineSampleSize
					}
				)
			);
		}

		const autoEscalationThreshold = Math.max(
			0.15,
			baselineValues.autoProToPowerEscalationRate * 1.8
		);
		if (
			current.autoProToPowerEscalationRate >= autoEscalationThreshold &&
			current.autoProToPowerEscalationRate - baselineValues.autoProToPowerEscalationRate >=
				0.05
		) {
			anomalies.push(
				anomaly(
					'auto_escalation_rate_spike',
					'warning',
					'auto_pro_to_power_escalation_rate',
					current.autoProToPowerEscalationRate,
					baselineValues.autoProToPowerEscalationRate,
					{
						threshold: autoEscalationThreshold,
						sampleSize: baselineSampleSize
					}
				)
			);
		}
	} else {
		if (current.frozenActiveCount >= 30) {
			anomalies.push(
				anomaly(
					'frozen_volume_high_absolute',
					'critical',
					'frozen_active_count',
					current.frozenActiveCount,
					null,
					{ threshold: 30, reason: 'insufficient_baseline' }
				)
			);
		}

		if (current.manualUnfreezeRate >= 0.4) {
			anomalies.push(
				anomaly(
					'manual_unfreeze_rate_high_absolute',
					'warning',
					'manual_unfreeze_rate',
					current.manualUnfreezeRate,
					null,
					{ threshold: 0.4, reason: 'insufficient_baseline' }
				)
			);
		}
	}

	return anomalies;
}

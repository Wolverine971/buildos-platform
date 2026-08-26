// apps/worker/src/workers/cycle/cycleMetrics.ts
import type { CycleCoordinatorHealthSnapshot } from './cycleObservability';
import type { DailyBriefCycleShadowSummary } from './dailyBriefCycleShadow';
import { supabase } from '../../lib/supabase';

type MetricRow = {
	metric_name: string;
	metric_value: number;
	metric_unit: string;
	metric_description: string;
	recorded_at: string;
};

function coordinatorMetricRows(snapshot: CycleCoordinatorHealthSnapshot): MetricRow[] {
	const recordedAt = snapshot.lastCompletedAt ?? new Date().toISOString();
	const summary = snapshot.lastSummary;
	return [
		{
			metric_name: 'cycles.coordinator.healthy',
			metric_value: snapshot.healthy ? 1 : 0,
			metric_unit: 'boolean',
			metric_description: 'Whether the latest enabled Cycle coordinator tick was healthy.',
			recorded_at: recordedAt
		},
		{
			metric_name: 'cycles.coordinator.duration_ms',
			metric_value: snapshot.lastDurationMs ?? 0,
			metric_unit: 'milliseconds',
			metric_description: 'Wall-clock duration of the latest Cycle coordinator tick.',
			recorded_at: recordedAt
		},
		{
			metric_name: 'cycles.coordinator.claimed',
			metric_value: summary?.claimed ?? 0,
			metric_unit: 'count',
			metric_description: 'Triggers claimed by the latest Cycle coordinator tick.',
			recorded_at: recordedAt
		},
		{
			metric_name: 'cycles.coordinator.failed',
			metric_value: summary?.failed ?? snapshot.consecutiveFailures,
			metric_unit: 'count',
			metric_description:
				'Trigger resolutions that failed during the latest coordinator tick.',
			recorded_at: recordedAt
		},
		{
			metric_name: 'cycles.coordinator.max_due_latency_ms',
			metric_value: summary?.maxDueLatencyMs ?? 0,
			metric_unit: 'milliseconds',
			metric_description:
				'Maximum positive due-to-claim latency in the latest coordinator batch.',
			recorded_at: recordedAt
		}
	];
}

/** Best-effort latest-value metrics. Telemetry must never overturn scheduling truth. */
export async function persistCycleCoordinatorMetrics(
	snapshot: CycleCoordinatorHealthSnapshot
): Promise<void> {
	const { error } = await supabase
		.from('system_metrics')
		.upsert(coordinatorMetricRows(snapshot), { onConflict: 'metric_name' });
	if (error) console.warn(`Cycle coordinator metrics write failed: ${error.message}`);
}

export async function persistDailyBriefCycleShadowMetrics(
	summary: DailyBriefCycleShadowSummary
): Promise<void> {
	const rows: MetricRow[] = [
		{
			metric_name: 'cycles.daily_brief.shadow.match_rate_pct',
			metric_value: summary.matchRatePct,
			metric_unit: 'percent',
			metric_description: 'Legacy-versus-Cycle Daily Brief schedule projection match rate.',
			recorded_at: summary.completedAt
		},
		{
			metric_name: 'cycles.daily_brief.shadow.mismatched',
			metric_value: summary.mismatched,
			metric_unit: 'count',
			metric_description: 'Comparable Daily Brief schedules whose next occurrence differs.',
			recorded_at: summary.completedAt
		},
		{
			metric_name: 'cycles.daily_brief.shadow.missing_cycle',
			metric_value: summary.missingCycle,
			metric_unit: 'count',
			metric_description:
				'Active legacy Daily Brief preferences without a live Cycle definition.',
			recorded_at: summary.completedAt
		},
		{
			metric_name: 'cycles.daily_brief.shadow.invalid',
			metric_value: summary.invalid,
			metric_unit: 'count',
			metric_description: 'Daily Brief shadow rows that could not be compared safely.',
			recorded_at: summary.completedAt
		}
	];
	const { error } = await supabase.from('system_metrics').upsert(rows, {
		onConflict: 'metric_name'
	});
	if (error) console.warn(`Daily Brief Cycle shadow metrics write failed: ${error.message}`);
}

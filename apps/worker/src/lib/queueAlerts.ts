// apps/worker/src/lib/queueAlerts.ts
/**
 * Minimum-viable queue alerting (2026-07-23 audit item P0-4).
 *
 * Motivation: send_sms failed 220/220 times over 9 months with zero signal.
 * This check runs on the existing stats interval and screams (structured
 * error log + optional webhook) when either tripwire fires:
 *   1. failed jobs in the last hour exceed a per-type threshold;
 *   2. the oldest runnable pending job has been waiting too long.
 *
 * Env knobs:
 *   ALERT_FAILED_JOBS_PER_HOUR   default 3
 *   ALERT_OLDEST_PENDING_MINUTES default 15
 *   ALERT_WEBHOOK_URL            optional; receives a JSON POST per alert batch
 *   ALERT_COOLDOWN_MINUTES       default 60 (per alert code)
 */
import type { createServiceClient } from '@buildos/supabase-client';

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface QueueAlert {
	code: string;
	severity: 'warning' | 'critical';
	message: string;
	details: Record<string, unknown>;
}

const FAILED_PER_HOUR_THRESHOLD = parseInt(process.env.ALERT_FAILED_JOBS_PER_HOUR || '3', 10);
const OLDEST_PENDING_MINUTES = parseInt(process.env.ALERT_OLDEST_PENDING_MINUTES || '15', 10);
const COOLDOWN_MS = parseInt(process.env.ALERT_COOLDOWN_MINUTES || '60', 10) * 60_000;

// Per-code cooldown so a persistent condition alerts once an hour, not once
// per stats tick.
const lastAlertAtByCode = new Map<string, number>();

export async function checkQueueAlerts(supabase: ServiceClient): Promise<QueueAlert[]> {
	const alerts: QueueAlert[] = [];
	const nowMs = Date.now();

	// 1) Failed jobs in the last hour, grouped per type in JS (PostgREST has no GROUP BY)
	const oneHourAgo = new Date(nowMs - 60 * 60_000).toISOString();
	const { data: failedRows, error: failedError } = await supabase
		.from('queue_jobs')
		.select('job_type')
		.eq('status', 'failed')
		.gte('updated_at', oneHourAgo)
		.limit(500);

	if (failedError) {
		alerts.push({
			code: 'alert_query_failed',
			severity: 'warning',
			message: `Queue alert query failed: ${failedError.message}`,
			details: { query: 'failed_jobs_last_hour' }
		});
	} else if (failedRows && failedRows.length > 0) {
		const byType: Record<string, number> = {};
		for (const row of failedRows) {
			byType[row.job_type] = (byType[row.job_type] || 0) + 1;
		}
		for (const [jobType, count] of Object.entries(byType)) {
			if (count >= FAILED_PER_HOUR_THRESHOLD) {
				alerts.push({
					code: `failed_jobs:${jobType}`,
					severity: 'critical',
					message: `${count} ${jobType} job(s) failed in the last hour (threshold ${FAILED_PER_HOUR_THRESHOLD})`,
					details: { jobType, count, windowMinutes: 60 }
				});
			}
		}
	}

	// 2) Oldest runnable pending job (scheduled_for in the past — future-scheduled
	// jobs are waiting on purpose)
	const { data: oldestPending, error: pendingError } = await supabase
		.from('queue_jobs')
		.select('job_type, scheduled_for, created_at')
		.eq('status', 'pending')
		.lte('scheduled_for', new Date(nowMs).toISOString())
		.order('scheduled_for', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (pendingError) {
		alerts.push({
			code: 'alert_query_failed',
			severity: 'warning',
			message: `Queue alert query failed: ${pendingError.message}`,
			details: { query: 'oldest_pending' }
		});
	} else if (oldestPending) {
		const waitedMs = nowMs - Date.parse(oldestPending.scheduled_for);
		if (waitedMs > OLDEST_PENDING_MINUTES * 60_000) {
			alerts.push({
				code: 'oldest_pending_age',
				severity: 'critical',
				message: `Oldest runnable pending job (${oldestPending.job_type}) has waited ${Math.round(waitedMs / 60_000)}m (threshold ${OLDEST_PENDING_MINUTES}m) — workers may not be claiming`,
				details: {
					jobType: oldestPending.job_type,
					waitedMinutes: Math.round(waitedMs / 60_000),
					scheduledFor: oldestPending.scheduled_for
				}
			});
		}
	}

	return alerts;
}

/**
 * Emit alerts that are not in cooldown: structured console.error always,
 * webhook POST when ALERT_WEBHOOK_URL is configured.
 */
export async function emitQueueAlerts(alerts: QueueAlert[]): Promise<void> {
	const nowMs = Date.now();
	const fresh = alerts.filter((alert) => {
		const last = lastAlertAtByCode.get(alert.code);
		return last === undefined || nowMs - last >= COOLDOWN_MS;
	});
	if (fresh.length === 0) return;

	for (const alert of fresh) {
		lastAlertAtByCode.set(alert.code, nowMs);
		console.error(
			`🚨 [QUEUE ALERT] ${alert.severity.toUpperCase()} ${alert.code}: ${alert.message}`,
			JSON.stringify(alert.details)
		);
	}

	const webhookUrl = process.env.ALERT_WEBHOOK_URL;
	if (!webhookUrl) return;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 5000);
		await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				source: 'buildos-worker-queue',
				timestamp: new Date(nowMs).toISOString(),
				alerts: fresh
			}),
			signal: controller.signal
		});
		clearTimeout(timer);
	} catch (error) {
		console.error(
			'⚠️ Queue alert webhook delivery failed:',
			error instanceof Error ? error.message : error
		);
	}
}

/** Test hook: clear cooldown state between test cases. */
export function __resetQueueAlertCooldowns(): void {
	lastAlertAtByCode.clear();
}

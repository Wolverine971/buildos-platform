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
 *   ALERT_AGENTIC_CHAT_PENDING_JOBS default 1
 *   ALERT_AGENTIC_CHAT_OLDEST_PENDING_SECONDS default 120
 *   ALERT_AGENTIC_CHAT_ACTIVE_CAPACITY default 8 (4 replicas x 2 slots)
 *   ALERT_WEBHOOK_URL            optional; receives a JSON POST per alert batch
 *   ALERT_COOLDOWN_MINUTES       default 60 (per alert code)
 */
import type { createServiceClient } from '@buildos/supabase-client';
import { logWorkerError } from './errorLogger';

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
const AGENTIC_CHAT_PENDING_THRESHOLD = parseInt(
	process.env.ALERT_AGENTIC_CHAT_PENDING_JOBS || '1',
	10
);
const AGENTIC_CHAT_OLDEST_PENDING_SECONDS = parseInt(
	process.env.ALERT_AGENTIC_CHAT_OLDEST_PENDING_SECONDS || '120',
	10
);
const AGENTIC_CHAT_ACTIVE_CAPACITY = parseInt(
	process.env.ALERT_AGENTIC_CHAT_ACTIVE_CAPACITY || '8',
	10
);

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
		.select('job_type, metadata')
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
				const agenticChatDetails =
					jobType === 'agentic_chat_turn'
						? await loadAgenticChatFailureDetails(
								supabase,
								failedRows.filter((row) => row.job_type === jobType)
							)
						: {};
				alerts.push({
					code: `failed_jobs:${jobType}`,
					severity: 'critical',
					message: `${count} ${jobType} job(s) failed in the last hour (threshold ${FAILED_PER_HOUR_THRESHOLD})`,
					details: { jobType, count, windowMinutes: 60, ...agenticChatDetails }
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

	const scalingAlert = await loadAgenticChatScalingAlert(supabase, nowMs);
	if (scalingAlert) alerts.push(scalingAlert);

	return alerts;
}

async function loadAgenticChatScalingAlert(
	supabase: ServiceClient,
	nowMs: number
): Promise<QueueAlert | null> {
	const nowIso = new Date(nowMs).toISOString();
	const [pending, running] = await Promise.all([
		supabase
			.from('queue_jobs')
			.select('scheduled_for, created_at', { count: 'exact' })
			.eq('job_type', 'agentic_chat_turn')
			.eq('status', 'pending')
			.lte('scheduled_for', nowIso)
			.order('scheduled_for', { ascending: true })
			.limit(1),
		supabase
			.from('queue_jobs')
			.select('id', { count: 'exact', head: true })
			.eq('job_type', 'agentic_chat_turn')
			.eq('status', 'processing')
	]);

	if (pending.error || running.error) {
		return {
			code: 'alert_query_failed',
			severity: 'warning',
			message: `Agentic Chat scaling query failed: ${pending.error?.message ?? running.error?.message}`,
			details: { query: 'agentic_chat_scaling' }
		};
	}

	const pendingCount = pending.count ?? 0;
	const runningCount = running.count ?? 0;
	const oldestScheduledFor = pending.data?.[0]?.scheduled_for ?? null;
	const oldestPendingAgeSeconds = oldestScheduledFor
		? Math.max(0, Math.floor((nowMs - Date.parse(oldestScheduledFor)) / 1000))
		: 0;
	const saturatedWithWaiters =
		runningCount >= AGENTIC_CHAT_ACTIVE_CAPACITY &&
		pendingCount >= AGENTIC_CHAT_PENDING_THRESHOLD;
	if (!saturatedWithWaiters && oldestPendingAgeSeconds < AGENTIC_CHAT_OLDEST_PENDING_SECONDS) {
		return null;
	}

	return {
		code: 'agentic_chat_scale_threshold',
		severity: 'warning',
		message: `Agentic Chat needs scaling attention: ${runningCount} running, ${pendingCount} waiting, oldest wait ${oldestPendingAgeSeconds}s`,
		details: {
			pendingCount,
			runningCount,
			oldestPendingAgeSeconds,
			oldestScheduledFor,
			activeCapacity: AGENTIC_CHAT_ACTIVE_CAPACITY,
			pendingThreshold: AGENTIC_CHAT_PENDING_THRESHOLD,
			oldestPendingThresholdSeconds: AGENTIC_CHAT_OLDEST_PENDING_SECONDS
		}
	};
}

async function loadAgenticChatFailureDetails(
	supabase: ServiceClient,
	rows: readonly { metadata: unknown }[]
): Promise<Record<string, unknown>> {
	const turnRunIds = [
		...new Set(
			rows
				.map((row) => turnRunIdFromMetadata(row.metadata))
				.filter((value): value is string => value !== null)
		)
	].slice(0, 50);
	if (turnRunIds.length === 0) return {};

	const { data, error } = await supabase
		.from('chat_turn_runs')
		.select('id, failure_code')
		.in('id', turnRunIds)
		.limit(50);
	if (error) {
		return { failureDiagnosticError: error.message, sampleTurnRunIds: turnRunIds.slice(0, 10) };
	}

	const failureCodes: Record<string, number> = {};
	for (const row of data ?? []) {
		const code = row.failure_code ?? 'unknown';
		failureCodes[code] = (failureCodes[code] ?? 0) + 1;
	}
	return { failureCodes, sampleTurnRunIds: turnRunIds.slice(0, 10) };
}

function turnRunIdFromMetadata(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const turnRunId = (value as Record<string, unknown>).turnRunId;
	return typeof turnRunId === 'string' && UUID_PATTERN.test(turnRunId) ? turnRunId : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
		try {
			await logWorkerError(new Error(alert.message), {
				operationType: 'queue_alert',
				severity: alert.severity,
				metadata: {
					alertCode: alert.code,
					...alert.details
				}
			});
		} catch (error) {
			// Email/webhook delivery must remain independent of error-log storage.
			console.error(
				`Queue alert persistence failed for ${alert.code}:`,
				error instanceof Error ? error.message : error
			);
		}
	}

	const scaleAlert = fresh.find((alert) => alert.code === 'agentic_chat_scale_threshold');
	if (scaleAlert && !(await sendAgenticChatScalingEmail(scaleAlert, nowMs))) {
		// Delivery failures are retryable on the next stats tick instead of being
		// hidden for the full alert cooldown.
		lastAlertAtByCode.delete(scaleAlert.code);
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

async function sendAgenticChatScalingEmail(alert: QueueAlert, nowMs: number): Promise<boolean> {
	const secret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET?.trim();
	if (!secret) {
		console.error(
			'Agentic Chat scaling email skipped: PRIVATE_BUILDOS_WEBHOOK_SECRET is missing'
		);
		return false;
	}
	const baseUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com')
		.trim()
		.replace(/\/$/, '');
	const incidentBucket = Math.floor(nowMs / COOLDOWN_MS);
	try {
		const response = await fetch(`${baseUrl}/api/webhooks/agentic-chat-queue-alert`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${secret}`
			},
			body: JSON.stringify({
				incidentId: `${alert.code}:${incidentBucket}`,
				observedAt: new Date(nowMs).toISOString(),
				alert
			}),
			signal: AbortSignal.timeout(30_000)
		});
		if (response.ok) return true;
		console.error(`Agentic Chat scaling email webhook returned ${response.status}`);
		return false;
	} catch (error) {
		console.error(
			'Agentic Chat scaling email delivery failed:',
			error instanceof Error ? error.message : error
		);
		return false;
	}
}

/** Test hook: clear cooldown state between test cases. */
export function __resetQueueAlertCooldowns(): void {
	lastAlertAtByCode.clear();
}

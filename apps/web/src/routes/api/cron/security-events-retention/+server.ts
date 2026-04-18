// apps/web/src/routes/api/cron/security-events-retention/+server.ts

// Cron job — bulk DELETE of old security events. Allow longer duration.
export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';

const DEFAULT_LOW_SIGNAL_RETENTION_DAYS = 180;
const DEFAULT_HIGH_SIGNAL_RETENTION_DAYS = 400;

function toUTCDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function defaultRollupStartDate(): string {
	const value = new Date();
	value.setUTCDate(value.getUTCDate() - 1);
	return toUTCDate(value);
}

function defaultRollupEndDate(): string {
	return toUTCDate(new Date());
}

function parseDateParam(value: string | null, fallback: string): string {
	if (!value) return fallback;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
	const parsed = Number.parseInt(value || '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function parseBooleanParam(value: string | null, fallback = false): boolean {
	if (value === null) return fallback;
	return value === 'true' || value === '1';
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const supabase = createAdminSupabaseClient();
	const startDate = parseDateParam(url.searchParams.get('startDate'), defaultRollupStartDate());
	const endDate = parseDateParam(url.searchParams.get('endDate'), defaultRollupEndDate());
	const lowSignalRetentionDays = parseIntParam(
		url.searchParams.get('lowSignalRetentionDays'),
		DEFAULT_LOW_SIGNAL_RETENTION_DAYS,
		30,
		3650
	);
	const highSignalRetentionDays = parseIntParam(
		url.searchParams.get('highSignalRetentionDays'),
		DEFAULT_HIGH_SIGNAL_RETENTION_DAYS,
		lowSignalRetentionDays,
		3650
	);
	const dryRun = parseBooleanParam(url.searchParams.get('dryRun'), false);
	const now = new Date().toISOString();

	try {
		const { data: rollup, error: rollupError } = await (supabase as any).rpc(
			'rollup_security_events',
			{
				p_start_date: startDate,
				p_end_date: endDate
			}
		);

		if (rollupError) throw rollupError;

		const { data: cleanup, error: cleanupError } = await (supabase as any).rpc(
			'cleanup_security_events',
			{
				p_now: now,
				p_low_signal_retention_days: lowSignalRetentionDays,
				p_high_signal_retention_days: highSignalRetentionDays,
				p_dry_run: dryRun
			}
		);

		if (cleanupError) throw cleanupError;

		const rollupSummary = Array.isArray(rollup) ? rollup[0] : rollup;
		const cleanupSummary = Array.isArray(cleanup) ? cleanup[0] : cleanup;
		const deletedCount = Number(cleanupSummary?.deleted_count ?? 0);
		const lowSignalCandidates = Number(cleanupSummary?.low_signal_candidate_count ?? 0);
		const highSignalCandidates = Number(cleanupSummary?.high_signal_candidate_count ?? 0);

		await (supabase as any).from('cron_logs').insert({
			job_name: 'security_events_retention',
			status: 'success',
			message: `Rolled up ${rollupSummary?.rolled_event_count ?? 0} security event(s); cleanup ${dryRun ? 'dry run found' : 'deleted'} ${dryRun ? lowSignalCandidates + highSignalCandidates : deletedCount} event(s).`,
			executed_at: now
		});

		return ApiResponse.success({
			rollup: rollupSummary,
			cleanup: cleanupSummary,
			retention: {
				lowSignalRetentionDays,
				highSignalRetentionDays,
				dryRun
			}
		});
	} catch (error) {
		console.error('Security events retention cron error:', error);

		await (supabase as any).from('cron_logs').insert({
			job_name: 'security_events_retention',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: now
		});

		return ApiResponse.internalError(error, 'Failed to process security event retention cron');
	}
};

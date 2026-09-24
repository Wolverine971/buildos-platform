// apps/web/src/routes/api/cron/agentic-chat-stale-turns/+server.ts
//
// Per-minute sweeper for chat turns that no live worker is running.
//
// 1. Dead workers (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md):
//    `recover_dead_agentic_chat_turns` settles turns whose worker lease expired
//    (90 s without a renewal): requeue if the model never started, else end the
//    turn keeping its partial text. It is the same function the chat worker
//    sweeps every 15 s, so recovery still happens when the whole worker is
//    down. Workflow handoff is off here: only a worker can render those, and
//    the database ends one itself once it is twice past expiry. Turns whose
//    recovery keeps failing are parked by the database and reported here.
// 2. Never picked up: a worker turn still queued (its queue job unclaimed) ten
//    minutes after it entered the queue (admission, or a requeue) is finalized
//    as a timeout through the atomic queued-cancel path, so the user sees a
//    clear "couldn't start" failure instead of "Thinking…" forever, and a
//    worker that comes back later can never execute it (and its writes) late.
//
// The two steps are isolated: one failing never skips the other. The route
// path and Vercel schedule are kept from the retired legacy-SSE reaper.
export const config = {
	maxDuration: 30
};

import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';

/** Product decision: a turn queued this long is timed out, not left waiting. */
const QUEUED_TURN_TIMEOUT_SECONDS = 600;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
/** Dead turns per minute; each is one short locked transaction. The SQL caps it at 100. */
const DEAD_TURN_RECOVERY_BATCH_SIZE = 25;

type CronReceipt = Database['public']['Tables']['cron_logs']['Insert'];

async function writeCronReceipt(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	receipt: CronReceipt
): Promise<void> {
	try {
		const { error } = await admin.from('cron_logs').insert(receipt);
		if (error) throw error;
	} catch {
		// Receipt failure must not change the outcome of the reaper itself or expose details.
		console.error('Agentic Chat stale-turn receipt failed with fixed code: receipt_failed');
	}
}

function parseBoundedInteger(
	value: string | undefined,
	fallback: number,
	min: number,
	max: number
): number {
	const normalized = value?.trim();
	if (!normalized || !/^-?\d+$/.test(normalized)) return fallback;
	const parsed = Number(normalized);
	if (!Number.isSafeInteger(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function asRecord(value: unknown): Record<string, unknown> {
	const candidate = Array.isArray(value) ? value[0] : value;
	return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
		? (candidate as Record<string, unknown>)
		: {};
}

function isCount(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseReaperResult(value: unknown): {
	reapedCount: number;
	failedCount: number;
	hasMore: boolean;
} {
	const result = asRecord(value);
	if (
		!isCount(result.reaped_count) ||
		!isCount(result.failed_count) ||
		typeof result.has_more !== 'boolean'
	) {
		throw new Error('invalid_reaper_result');
	}

	return {
		reapedCount: result.reaped_count,
		failedCount: result.failed_count,
		hasMore: result.has_more
	};
}

type DeadTurnRecovery = {
	candidateCount: number;
	requeuedCount: number;
	finalizedCount: number;
	reconciledCount: number;
	deferredCount: number;
	/** Re-checked under the lock and found alive after all. */
	notDeadCount: number;
	skippedCount: number;
	failedCount: number;
	/** Turns whose recovery failed so often the database stopped trying. */
	parkedCount: number;
	hasMore: boolean;
};

function parseRecoveryResult(value: unknown): DeadTurnRecovery {
	const result = asRecord(value);
	const counts = [
		result.candidate_count,
		result.requeued_count,
		result.finalized_count,
		result.reconciled_count,
		result.deferred_count,
		result.skipped_count,
		result.failed_count
	];
	if (!counts.every(isCount) || typeof result.has_more !== 'boolean') {
		throw new Error('invalid_recovery_result');
	}
	return {
		candidateCount: result.candidate_count as number,
		requeuedCount: result.requeued_count as number,
		finalizedCount: result.finalized_count as number,
		reconciledCount: result.reconciled_count as number,
		deferredCount: result.deferred_count as number,
		// Optional in the receipt shape: absent reads as zero, never as a failure.
		notDeadCount: isCount(result.not_dead_count) ? result.not_dead_count : 0,
		skippedCount: result.skipped_count as number,
		failedCount: result.failed_count as number,
		parkedCount: isCount(result.parked_count) ? result.parked_count : 0,
		hasMore: result.has_more
	};
}

async function recoverDeadTurns(
	admin: ReturnType<typeof createAdminSupabaseClient>
): Promise<DeadTurnRecovery | null> {
	try {
		const { data, error } = await admin.rpc('recover_dead_agentic_chat_turns', {
			p_batch_size: DEAD_TURN_RECOVERY_BATCH_SIZE,
			p_workflow_handoff: false
		});
		if (error) throw error;
		return parseRecoveryResult(data);
	} catch {
		console.error('Agentic Chat dead-turn recovery failed with fixed code: recovery_failed');
		return null;
	}
}

function recoveryMessage(recovery: DeadTurnRecovery | null): string {
	if (!recovery) return 'Dead-turn recovery failed.';
	return (
		`Recovered ${recovery.candidateCount} dead-worker turn(s): requeued=${recovery.requeuedCount}; ` +
		`ended=${recovery.finalizedCount}; reconciled=${recovery.reconciledCount}; ` +
		`deferred=${recovery.deferredCount}; not_dead=${recovery.notDeadCount}; ` +
		`failed=${recovery.failedCount}; parked=${recovery.parkedCount}; has_more=${recovery.hasMore}.`
	);
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const batchSize = parseBoundedInteger(
		env.AGENT_CHAT_STALE_TURN_REAPER_BATCH_SIZE,
		DEFAULT_BATCH_SIZE,
		1,
		MAX_BATCH_SIZE
	);
	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();

	const recovery = await recoverDeadTurns(admin);

	try {
		const { data, error } = await admin.rpc('reap_stranded_queued_agentic_chat_turns', {
			p_queued_before_seconds: QUEUED_TURN_TIMEOUT_SECONDS,
			p_batch_size: batchSize
		});
		if (error) throw error;

		const { reapedCount, failedCount, hasMore } = parseReaperResult(data);
		const recoveryWarning =
			recovery !== null &&
			(recovery.hasMore || recovery.failedCount > 0 || recovery.parkedCount > 0);
		await writeCronReceipt(admin, {
			job_name: 'agentic_chat_stale_turns',
			status:
				recovery === null
					? 'error'
					: hasMore || failedCount > 0 || recoveryWarning
						? 'warning'
						: 'success',
			message:
				`Timed out ${reapedCount} stranded queued turn(s); failed=${failedCount}; has_more=${hasMore}. ` +
				recoveryMessage(recovery),
			...(recovery === null ? { error_message: 'recovery_failed' } : {}),
			executed_at: executedAt
		});

		if (recovery === null) {
			return ApiResponse.error(
				'Failed to recover dead Agentic Chat turns',
				500,
				'agentic_chat_dead_turn_recovery_failed'
			);
		}
		return ApiResponse.success({
			reapedCount,
			failedCount,
			hasMore,
			queuedBeforeSeconds: QUEUED_TURN_TIMEOUT_SECONDS,
			batchSize,
			recovery
		});
	} catch {
		console.error('Agentic Chat stale-turn reaper failed with fixed code: reaper_failed');
		await writeCronReceipt(admin, {
			job_name: 'agentic_chat_stale_turns',
			status: 'error',
			message: recoveryMessage(recovery),
			error_message: recovery === null ? 'reaper_failed,recovery_failed' : 'reaper_failed',
			executed_at: executedAt
		});
		return ApiResponse.error(
			'Failed to reap stale Agentic Chat turns',
			500,
			'agentic_chat_stale_turn_reaper_failed'
		);
	}
};

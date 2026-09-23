// apps/web/src/routes/api/cron/agentic-chat-stale-turns/+server.ts
//
// Per-minute sweeper for chat turns no worker ever picked up. A worker turn
// still queued (its queue job unclaimed) ten minutes after admission is
// finalized as a timeout through the atomic queued-cancel path, so the user
// sees a clear "couldn't start" failure instead of "Thinking…" forever, and a
// worker that comes back later can never execute it (and its writes) late.
// The route path and Vercel schedule are kept from the retired legacy-SSE
// reaper, which only touched an execution mode nothing writes any more.
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

	try {
		const { data, error } = await admin.rpc('reap_stranded_queued_agentic_chat_turns', {
			p_queued_before_seconds: QUEUED_TURN_TIMEOUT_SECONDS,
			p_batch_size: batchSize
		});
		if (error) throw error;

		const { reapedCount, failedCount, hasMore } = parseReaperResult(data);
		await writeCronReceipt(admin, {
			job_name: 'agentic_chat_stale_turns',
			status: hasMore || failedCount > 0 ? 'warning' : 'success',
			message: `Timed out ${reapedCount} stranded queued turn(s); failed=${failedCount}; has_more=${hasMore}.`,
			executed_at: executedAt
		});

		return ApiResponse.success({
			reapedCount,
			failedCount,
			hasMore,
			queuedBeforeSeconds: QUEUED_TURN_TIMEOUT_SECONDS,
			batchSize
		});
	} catch {
		console.error('Agentic Chat stale-turn reaper failed with fixed code: reaper_failed');
		await writeCronReceipt(admin, {
			job_name: 'agentic_chat_stale_turns',
			status: 'error',
			error_message: 'reaper_failed',
			executed_at: executedAt
		});
		return ApiResponse.error(
			'Failed to reap stale Agentic Chat turns',
			500,
			'agentic_chat_stale_turn_reaper_failed'
		);
	}
};

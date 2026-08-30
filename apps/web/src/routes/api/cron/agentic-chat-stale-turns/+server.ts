// apps/web/src/routes/api/cron/agentic-chat-stale-turns/+server.ts
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

const DEFAULT_STALE_AFTER_SECONDS = 150;
const MIN_STALE_AFTER_SECONDS = 120;
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

function parseReaperResult(value: unknown): {
	reapedCount: number;
	hasMore: boolean;
} {
	const result = asRecord(value);
	if (
		!Number.isSafeInteger(result.reaped_count) ||
		(result.reaped_count as number) < 0 ||
		typeof result.has_more !== 'boolean'
	) {
		throw new Error('invalid_reaper_result');
	}

	return {
		reapedCount: result.reaped_count as number,
		hasMore: result.has_more
	};
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const progressStaleAfterSeconds = parseBoundedInteger(
		env.AGENT_CHAT_STALE_TURN_REAPER_AGE_SECONDS,
		DEFAULT_STALE_AFTER_SECONDS,
		MIN_STALE_AFTER_SECONDS,
		3600
	);
	const batchSize = parseBoundedInteger(
		env.AGENT_CHAT_STALE_TURN_REAPER_BATCH_SIZE,
		DEFAULT_BATCH_SIZE,
		1,
		MAX_BATCH_SIZE
	);
	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();

	try {
		const { data, error } = await admin.rpc('reap_stale_legacy_agentic_chat_turns', {
			p_progress_stale_after_seconds: progressStaleAfterSeconds,
			p_batch_size: batchSize
		});
		if (error) throw error;

		const { reapedCount, hasMore } = parseReaperResult(data);
		await writeCronReceipt(admin, {
			job_name: 'agentic_chat_stale_turns',
			status: hasMore ? 'warning' : 'success',
			message: `Reaped ${reapedCount} stale legacy turn(s); has_more=${hasMore}.`,
			executed_at: executedAt
		});

		return ApiResponse.success({
			reapedCount,
			hasMore,
			progressStaleAfterSeconds,
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

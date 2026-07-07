// apps/web/src/routes/api/inbox/count/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { routeErrorResponse } from '$lib/server/route-error';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import {
	countInboxItems,
	isInboxItemStatus,
	isInboxSourceType,
	parseInboxLimit,
	type InboxGroupFilter
} from '$lib/server/inbox.service';

function parseGroup(value: string | null): InboxGroupFilter | null {
	if (value === 'account' || value === 'project') return value;
	return null;
}

const TRANSIENT_RETRY_DELAY_MS = 75;
const MAX_COUNT_ATTEMPTS = 2;

const TRANSIENT_ERROR_CODES = new Set([
	'ECONNRESET',
	'ECONNREFUSED',
	'ETIMEDOUT',
	'EAI_AGAIN',
	'ENOTFOUND',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
	'UND_ERR_SOCKET',
	'UND_ERR_ABORTED'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object';
}

function collectErrorParts(error: unknown, seen = new Set<unknown>()): string[] {
	if (!error || seen.has(error)) return [];
	seen.add(error);

	if (error instanceof Error) {
		const code = (error as Error & { code?: unknown }).code;
		return [
			error.name,
			error.message,
			...(typeof code === 'string' ? [code] : []),
			...collectErrorParts((error as Error & { cause?: unknown }).cause, seen)
		];
	}

	if (!isRecord(error)) return [String(error)];

	const parts: string[] = [];
	for (const key of ['name', 'message', 'code', 'details', 'hint']) {
		const value = error[key];
		if (typeof value === 'string') parts.push(value);
	}
	parts.push(...collectErrorParts(error.cause, seen));
	return parts;
}

function isTransientInboxCountError(error: unknown): boolean {
	const parts = collectErrorParts(error);
	if (
		parts.some((part) => {
			const code = part.toUpperCase();
			return TRANSIENT_ERROR_CODES.has(code);
		})
	) {
		return true;
	}

	const text = parts.join(' ').toLowerCase();
	return (
		text.includes('fetch failed') ||
		text.includes('econnreset') ||
		text.includes('econnrefused') ||
		text.includes('etimedout') ||
		text.includes('connection reset') ||
		text.includes('socket hang up') ||
		text.includes('network error') ||
		text.includes('terminated') ||
		text.includes('aborted') ||
		text.includes('timeout') ||
		text.includes('timed out')
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countInboxItemsWithTransientRetry(params: Parameters<typeof countInboxItems>[0]) {
	let attempt = 0;
	while (true) {
		try {
			return await countInboxItems(params);
		} catch (error) {
			attempt += 1;
			if (attempt >= MAX_COUNT_ATTEMPTS || !isTransientInboxCountError(error)) {
				throw error;
			}
			await delay(TRANSIENT_RETRY_DELAY_MS);
		}
	}
}

export const GET: RequestHandler = async (event) => {
	const {
		url,
		locals: { safeGetSession, supabase }
	} = event;
	const projectId = url.searchParams.get('project_id');
	let userId: string | null = null;

	try {
		const { user } = await safeGetSession();
		userId = user?.id ?? null;
		if (!user) return ApiResponse.unauthorized();

		const statusParam = url.searchParams.get('status') ?? 'pending';
		if (statusParam !== 'all' && !isInboxItemStatus(statusParam)) {
			return ApiResponse.badRequest('Invalid status filter');
		}
		const status =
			statusParam === 'all' || !isInboxItemStatus(statusParam) ? null : statusParam;

		const sourceParam = url.searchParams.get('source_type');
		if (sourceParam && !isInboxSourceType(sourceParam)) {
			return ApiResponse.badRequest('Invalid source_type filter');
		}
		const sourceType = sourceParam && isInboxSourceType(sourceParam) ? sourceParam : null;

		const groupParam = url.searchParams.get('group');
		const group = parseGroup(groupParam);
		if (groupParam && !group) {
			return ApiResponse.badRequest("group must be 'account' or 'project'");
		}

		const admin = createAdminSupabaseClient();
		const result = await countInboxItemsWithTransientRetry({
			supabase: supabase as any,
			admin: admin as any,
			userId: user.id,
			status,
			projectId,
			sourceType,
			group,
			limit: parseInboxLimit(url.searchParams.get('limit'), 1000, 5000)
		});

		return ApiResponse.success(result);
	} catch (error) {
		const transient = isTransientInboxCountError(error);
		const response = await routeErrorResponse(event, error, {
			operation: 'api.inbox.count',
			userId,
			projectId,
			message: transient
				? 'Inbox count is temporarily unavailable'
				: 'Failed to load inbox count',
			status: transient ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.INTERNAL_SERVER_ERROR,
			code: transient ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.DATABASE_ERROR,
			severity: transient ? 'warning' : 'error',
			metadata: {
				transient,
				retryable: transient
			}
		});
		if (transient) {
			response.headers.set('Retry-After', '2');
		}
		return response;
	}
};

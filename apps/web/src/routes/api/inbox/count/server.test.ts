// apps/web/src/routes/api/inbox/count/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	countInboxItems: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	routeErrorResponse: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/route-error', () => ({
	routeErrorResponse: mocks.routeErrorResponse
}));

vi.mock('$lib/server/inbox.service', () => {
	const statuses = new Set(['pending', 'deciding', 'decided', 'blocked', 'expired', 'snoozed']);
	const sourceTypes = new Set([
		'agent_run',
		'project_suggestion',
		'calendar_suggestion',
		'profile_fragment',
		'contact_merge_candidate'
	]);

	return {
		countInboxItems: mocks.countInboxItems,
		isInboxItemStatus: (value: string | null) => !!value && statuses.has(value),
		isInboxSourceType: (value: string | null) => !!value && sourceTypes.has(value),
		parseInboxLimit: (value: string | null, defaultLimit = 50, maxLimit = 200) => {
			const parsed = Number.parseInt(value ?? '', 10);
			if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
			return Math.min(parsed, maxLimit);
		}
	};
});

import { GET } from './+server';

const USER_ID = 'user-1';

const countPayload = {
	total: 2,
	by_status: { pending: 2 },
	by_source_type: { agent_run: 2 },
	by_project: {},
	account: 2,
	truncated: false,
	repairedCount: 0,
	backfilledCount: 0
};

function makeEvent(url = 'http://localhost/api/inbox/count?status=pending&limit=5000') {
	const request = new Request(url, {
		headers: {
			'user-agent': 'vitest'
		}
	});
	return {
		url: new URL(url),
		request,
		params: {},
		route: { id: '/api/inbox/count' },
		locals: {
			supabase: { from: vi.fn() },
			safeGetSession: vi.fn(async () => ({ user: { id: USER_ID } }))
		}
	} as any;
}

function transientFetchError(): Error {
	const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
	return new TypeError('fetch failed', { cause });
}

describe('GET /api/inbox/count', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.countInboxItems.mockResolvedValue(countPayload);
		mocks.routeErrorResponse.mockImplementation(
			async (
				_event: unknown,
				_error: unknown,
				options: { message: string; status: number; code: string }
			) =>
				new Response(
					JSON.stringify({
						success: false,
						error: options.message,
						code: options.code
					}),
					{ status: options.status }
				)
		);
	});

	it('returns the inbox count with parsed filters', async () => {
		const event = makeEvent(
			'http://localhost/api/inbox/count?status=pending&source_type=agent_run&group=account&limit=5000'
		);

		const response = await GET(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.success).toBe(true);
		expect(json.data.total).toBe(2);
		expect(mocks.countInboxItems).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: event.locals.supabase,
				userId: USER_ID,
				status: 'pending',
				projectId: null,
				sourceType: 'agent_run',
				group: 'account',
				limit: 5000
			})
		);
	});

	it('retries a transient Supabase fetch failure once before succeeding', async () => {
		mocks.countInboxItems
			.mockRejectedValueOnce(transientFetchError())
			.mockResolvedValue(countPayload);

		const response = await GET(makeEvent());
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.success).toBe(true);
		expect(mocks.countInboxItems).toHaveBeenCalledTimes(2);
		expect(mocks.routeErrorResponse).not.toHaveBeenCalled();
	});

	it('returns a service-unavailable response when transient failures persist', async () => {
		const event = makeEvent('http://localhost/api/inbox/count?project_id=project-1');
		mocks.countInboxItems.mockRejectedValue(transientFetchError());

		const response = await GET(event);
		const json = await response.json();

		expect(response.status).toBe(503);
		expect(response.headers.get('Retry-After')).toBe('2');
		expect(json.success).toBe(false);
		expect(json.error).toBe('Inbox count is temporarily unavailable');
		expect(json.code).toBe('SERVICE_UNAVAILABLE');
		expect(mocks.countInboxItems).toHaveBeenCalledTimes(2);
		expect(mocks.routeErrorResponse).toHaveBeenCalledWith(
			event,
			expect.any(Error),
			expect.objectContaining({
				operation: 'api.inbox.count',
				userId: USER_ID,
				projectId: 'project-1',
				status: 503,
				code: 'SERVICE_UNAVAILABLE',
				severity: 'warning',
				metadata: expect.objectContaining({
					transient: true,
					retryable: true
				})
			})
		);
	});

	it('does not retry non-transient count failures', async () => {
		const error = Object.assign(new Error('column does not exist'), { code: '42703' });
		mocks.countInboxItems.mockRejectedValue(error);

		const response = await GET(makeEvent());

		expect(response.status).toBe(500);
		expect(response.headers.has('Retry-After')).toBe(false);
		expect(mocks.countInboxItems).toHaveBeenCalledTimes(1);
		expect(mocks.routeErrorResponse).toHaveBeenCalledWith(
			expect.anything(),
			error,
			expect.objectContaining({
				status: 500,
				code: 'DATABASE_ERROR',
				severity: 'error',
				metadata: expect.objectContaining({
					transient: false,
					retryable: false
				})
			})
		);
	});
});

// apps/web/src/routes/api/admin/chat/users/server.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
	assertAdminChatUserAnalyticsRedactedMock,
	createAdminSupabaseClientMock,
	loadAdminChatRedactedSessionMock,
	loadAdminChatUserAnalyticsMock,
	loadAdminChatUserDetailMock,
	parseAdminChatRedactedSessionQueryMock,
	parseAdminChatUserDetailQueryMock,
	parseAdminChatUsersQueryMock,
	queueChatSessionClassificationMock
} = vi.hoisted(() => ({
	assertAdminChatUserAnalyticsRedactedMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	loadAdminChatRedactedSessionMock: vi.fn(),
	loadAdminChatUserAnalyticsMock: vi.fn(),
	loadAdminChatUserDetailMock: vi.fn(),
	parseAdminChatRedactedSessionQueryMock: vi.fn(),
	parseAdminChatUserDetailQueryMock: vi.fn(),
	parseAdminChatUsersQueryMock: vi.fn(),
	queueChatSessionClassificationMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/admin-chat-user-analytics', () => ({
	assertAdminChatUserAnalyticsRedacted: assertAdminChatUserAnalyticsRedactedMock,
	loadAdminChatRedactedSession: loadAdminChatRedactedSessionMock,
	loadAdminChatUserAnalytics: loadAdminChatUserAnalyticsMock,
	loadAdminChatUserDetail: loadAdminChatUserDetailMock,
	parseAdminChatRedactedSessionQuery: parseAdminChatRedactedSessionQueryMock,
	parseAdminChatUserDetailQuery: parseAdminChatUserDetailQueryMock,
	parseAdminChatUsersQuery: parseAdminChatUsersQueryMock
}));

vi.mock('$lib/server/chat-classification.service', () => ({
	queueChatSessionClassification: queueChatSessionClassificationMock
}));

import { GET as listGET } from './+server';
import { GET as detailGET } from './[userId]/+server';
import { POST as classifyPOST } from './[userId]/sessions/classify/+server';
import { GET as sessionGET } from './[userId]/sessions/[sessionId]/+server';

type RouteHandler = (event: any) => Promise<Response>;

const adminSupabase = { from: vi.fn() };
const listQuery = { timeframe: '30d', page: 1 };
const detailQuery = { timeframe: '30d', session_page: 1 };
const redactedSessionQuery = { slow_threshold_ms: 20_000 };
const listPayload = {
	kpis: { active_users: 1 },
	users: [{ user_id: 'user-1', preview: 'Strict preview only' }],
	data_health: { raw_message_content_returned: false }
};
const detailPayload = {
	user: { id: 'user-1', email: 'user@example.com', name: 'User One' },
	summary: { user_id: 'user-1', preview: 'Strict preview only' },
	timeline: [],
	sessions: [],
	errors: [],
	tools: [],
	entities: [],
	entity_changes: []
};
const sessionPayload = {
	session: { session_id: 'session-1', user_id: 'user-1', title: 'Redacted session' },
	turns: [],
	timeline: [],
	privacy: {
		raw_message_content_returned: false,
		raw_assistant_content_returned: false,
		raw_request_message_returned: false,
		raw_tool_arguments_returned: false,
		raw_tool_results_returned: false,
		prompt_snapshot_returned: false
	}
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

type ClassificationSessionRow = {
	id: string;
	user_id: string;
	last_message_at: string | null;
	updated_at: string | null;
	created_at: string | null;
	last_classified_at: string | null;
};

function createEvent({
	url = 'http://localhost/api/admin/chat/users?timeframe=30d',
	params = {},
	user = { id: 'admin-1', is_admin: true }
}: {
	url?: string;
	params?: Record<string, string>;
	user?: { id: string; is_admin?: boolean } | null;
} = {}) {
	return {
		url: new URL(url),
		params,
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as any;
}

function createPostEvent({
	url = 'http://localhost/api/admin/chat/users/user-1/sessions/classify',
	params = { userId: 'user-1' },
	user = { id: 'admin-1', is_admin: true },
	body = {}
}: {
	url?: string;
	params?: Record<string, string>;
	user?: { id: string; is_admin?: boolean } | null;
	body?: unknown;
} = {}) {
	return {
		...createEvent({ url, params, user }),
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as any;
}

function createClassificationAdminSupabase({
	rows,
	error = null
}: {
	rows: ClassificationSessionRow[];
	error?: unknown;
}) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		in: vi.fn(async () => ({ data: rows, error }))
	};
	return {
		from: vi.fn(() => query),
		query
	};
}

async function expectErrorResponse(response: Response, status: number) {
	const payload = await response.json();
	expect(response.status).toBe(status);
	expect(payload.success).toBe(false);
	return payload;
}

describe('admin chat user analytics routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);
		parseAdminChatUsersQueryMock.mockReturnValue(listQuery);
		parseAdminChatUserDetailQueryMock.mockReturnValue(detailQuery);
		parseAdminChatRedactedSessionQueryMock.mockReturnValue(redactedSessionQuery);
		loadAdminChatUserAnalyticsMock.mockResolvedValue(listPayload);
		loadAdminChatUserDetailMock.mockResolvedValue(detailPayload);
		loadAdminChatRedactedSessionMock.mockResolvedValue(sessionPayload);
		queueChatSessionClassificationMock.mockResolvedValue({
			queued: true,
			jobId: 'job-1'
		});
		assertAdminChatUserAnalyticsRedactedMock.mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it.each([
		['list', listGET, createEvent({ user: null })],
		[
			'detail',
			detailGET,
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1',
				params: { userId: 'user-1' },
				user: null
			})
		],
		[
			'session',
			sessionGET,
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1/sessions/session-1',
				params: { userId: 'user-1', sessionId: 'session-1' },
				user: null
			})
		]
	])(
		'rejects unauthenticated %s requests without creating an admin client',
		async (_, handler, event) => {
			await expectErrorResponse(await (handler as RouteHandler)(event), 401);

			expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
			expect(loadAdminChatUserAnalyticsMock).not.toHaveBeenCalled();
			expect(loadAdminChatUserDetailMock).not.toHaveBeenCalled();
			expect(loadAdminChatRedactedSessionMock).not.toHaveBeenCalled();
		}
	);

	it.each([
		['list', listGET, createEvent({ user: { id: 'user-1', is_admin: false } })],
		[
			'detail',
			detailGET,
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1',
				params: { userId: 'user-1' },
				user: { id: 'user-1', is_admin: false }
			})
		],
		[
			'session',
			sessionGET,
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1/sessions/session-1',
				params: { userId: 'user-1', sessionId: 'session-1' },
				user: { id: 'user-1', is_admin: false }
			})
		]
	])(
		'rejects non-admin %s requests without creating an admin client',
		async (_, handler, event) => {
			await expectErrorResponse(await (handler as RouteHandler)(event), 403);

			expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
			expect(loadAdminChatUserAnalyticsMock).not.toHaveBeenCalled();
			expect(loadAdminChatUserDetailMock).not.toHaveBeenCalled();
			expect(loadAdminChatRedactedSessionMock).not.toHaveBeenCalled();
		}
	);

	it('lists users with parsed query params, the admin client, and a redaction assertion', async () => {
		const event = createEvent({
			url: 'http://localhost/api/admin/chat/users?timeframe=30d&page=2&search=slow'
		});

		const response = await listGET(event);
		const payload = await response.json();
		const searchParams = parseAdminChatUsersQueryMock.mock.calls[0][0] as URLSearchParams;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toEqual(listPayload);
		expect(searchParams.get('timeframe')).toBe('30d');
		expect(searchParams.get('search')).toBe('slow');
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(loadAdminChatUserAnalyticsMock).toHaveBeenCalledWith(adminSupabase, listQuery);
		expect(assertAdminChatUserAnalyticsRedactedMock).toHaveBeenCalledWith(listPayload);
	});

	it('does not return unsafe list payloads when the redaction assertion fails', async () => {
		const rawFixture = 'RAW_USER_TRANSCRIPT_SHOULD_NOT_LEAK';
		loadAdminChatUserAnalyticsMock.mockResolvedValue({ users: [{ content: rawFixture }] });
		assertAdminChatUserAnalyticsRedactedMock.mockImplementation(() => {
			throw new Error(`Unsafe payload: ${rawFixture}`);
		});

		const response = await listGET(createEvent());
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.success).toBe(false);
		expect(JSON.stringify(payload)).not.toContain(rawFixture);
	});

	it('loads a user drilldown by user id with parsed detail query params', async () => {
		const event = createEvent({
			url: 'http://localhost/api/admin/chat/users/user-1?timeframe=30d&session_limit=25',
			params: { userId: ' user-1 ' }
		});

		const response = await detailGET(event);
		const payload = await response.json();
		const searchParams = parseAdminChatUserDetailQueryMock.mock.calls[0][0] as URLSearchParams;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toEqual(detailPayload);
		expect(searchParams.get('session_limit')).toBe('25');
		expect(loadAdminChatUserDetailMock).toHaveBeenCalledWith(
			adminSupabase,
			'user-1',
			detailQuery
		);
		expect(assertAdminChatUserAnalyticsRedactedMock).toHaveBeenCalledWith(detailPayload);
	});

	it('returns 400 for missing user drilldown params before creating an admin client', async () => {
		const response = await detailGET(
			createEvent({
				url: 'http://localhost/api/admin/chat/users/%20',
				params: { userId: ' ' }
			})
		);

		await expectErrorResponse(response, 400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(loadAdminChatUserDetailMock).not.toHaveBeenCalled();
	});

	it('returns 404 when a user drilldown has no analytics payload', async () => {
		loadAdminChatUserDetailMock.mockResolvedValue(null);

		const response = await detailGET(
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-missing',
				params: { userId: 'user-missing' }
			})
		);

		await expectErrorResponse(response, 404);
		expect(assertAdminChatUserAnalyticsRedactedMock).not.toHaveBeenCalled();
	});

	it('loads a redacted session timeline by user id and session id', async () => {
		const response = await sessionGET(
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1/sessions/session-1?slow_threshold_ms=20000',
				params: { userId: ' user-1 ', sessionId: ' session-1 ' }
			})
		);
		const payload = await response.json();
		const searchParams = parseAdminChatRedactedSessionQueryMock.mock
			.calls[0][0] as URLSearchParams;

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toEqual(sessionPayload);
		expect(searchParams.get('slow_threshold_ms')).toBe('20000');
		expect(loadAdminChatRedactedSessionMock).toHaveBeenCalledWith(
			adminSupabase,
			'user-1',
			'session-1',
			20_000
		);
		expect(assertAdminChatUserAnalyticsRedactedMock).toHaveBeenCalledWith(sessionPayload);
	});

	it('returns 400 for missing redacted session params before creating an admin client', async () => {
		const response = await sessionGET(
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1/sessions/%20',
				params: { userId: 'user-1', sessionId: ' ' }
			})
		);

		await expectErrorResponse(response, 400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(loadAdminChatRedactedSessionMock).not.toHaveBeenCalled();
	});

	it('returns 404 when a redacted session has no analytics payload', async () => {
		loadAdminChatRedactedSessionMock.mockResolvedValue(null);

		const response = await sessionGET(
			createEvent({
				url: 'http://localhost/api/admin/chat/users/user-1/sessions/session-missing',
				params: { userId: 'user-1', sessionId: 'session-missing' }
			})
		);

		await expectErrorResponse(response, 404);
		expect(assertAdminChatUserAnalyticsRedactedMock).not.toHaveBeenCalled();
	});

	it('rejects unauthenticated classification queue requests without creating an admin client', async () => {
		const response = await classifyPOST(
			createPostEvent({
				user: null,
				body: { session_ids: ['session-1'] }
			})
		);

		await expectErrorResponse(response, 401);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(queueChatSessionClassificationMock).not.toHaveBeenCalled();
	});

	it('rejects non-admin classification queue requests without creating an admin client', async () => {
		const response = await classifyPOST(
			createPostEvent({
				user: { id: 'user-1', is_admin: false },
				body: { session_ids: ['session-1'] }
			})
		);

		await expectErrorResponse(response, 403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(queueChatSessionClassificationMock).not.toHaveBeenCalled();
	});

	it('queues only missing or stale visible sessions for a selected user', async () => {
		const admin = createClassificationAdminSupabase({
			rows: [
				{
					id: 'missing-session',
					user_id: 'user-1',
					last_message_at: '2026-07-05T12:00:00.000Z',
					updated_at: '2026-07-05T12:00:00.000Z',
					created_at: '2026-07-05T11:00:00.000Z',
					last_classified_at: null
				},
				{
					id: 'stale-session',
					user_id: 'user-1',
					last_message_at: '2026-07-05T13:00:00.000Z',
					updated_at: '2026-07-05T13:00:00.000Z',
					created_at: '2026-07-05T10:00:00.000Z',
					last_classified_at: '2026-07-05T12:00:00.000Z'
				},
				{
					id: 'classified-session',
					user_id: 'user-1',
					last_message_at: '2026-07-05T12:00:00.000Z',
					updated_at: '2026-07-05T12:00:00.000Z',
					created_at: '2026-07-05T10:00:00.000Z',
					last_classified_at: '2026-07-05T13:00:00.000Z'
				}
			]
		});
		createAdminSupabaseClientMock.mockReturnValue(admin);
		queueChatSessionClassificationMock
			.mockResolvedValueOnce({ queued: true, jobId: 'job-missing' })
			.mockResolvedValueOnce({ queued: true, jobId: 'job-stale', reason: 'already_queued' });

		const response = await classifyPOST(
			createPostEvent({
				body: {
					session_ids: [
						'missing-session',
						'stale-session',
						'classified-session',
						'missing-session',
						'other-user-session'
					]
				}
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toMatchObject({
			requested: 4,
			found: 3,
			queued: 2,
			skipped: 2
		});
		expect(admin.from).toHaveBeenCalledWith('chat_sessions');
		expect(admin.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
		expect(admin.query.in).toHaveBeenCalledWith('id', [
			'missing-session',
			'stale-session',
			'classified-session',
			'other-user-session'
		]);
		expect(queueChatSessionClassificationMock).toHaveBeenCalledTimes(2);
		expect(queueChatSessionClassificationMock).toHaveBeenCalledWith({
			sessionId: 'missing-session',
			userId: 'user-1'
		});
		expect(queueChatSessionClassificationMock).toHaveBeenCalledWith({
			sessionId: 'stale-session',
			userId: 'user-1'
		});
		expect(payload.data.results).toContainEqual(
			expect.objectContaining({
				session_id: 'classified-session',
				classification_state: 'classified',
				queued: false,
				reason: 'already_classified'
			})
		);
		expect(payload.data.results).toContainEqual(
			expect.objectContaining({
				session_id: 'other-user-session',
				queued: false,
				reason: 'not_found_for_user'
			})
		);
	});

	it('can force queue already classified sessions when requested', async () => {
		const admin = createClassificationAdminSupabase({
			rows: [
				{
					id: 'classified-session',
					user_id: 'user-1',
					last_message_at: '2026-07-05T12:00:00.000Z',
					updated_at: '2026-07-05T12:00:00.000Z',
					created_at: '2026-07-05T10:00:00.000Z',
					last_classified_at: '2026-07-05T13:00:00.000Z'
				}
			]
		});
		createAdminSupabaseClientMock.mockReturnValue(admin);

		const response = await classifyPOST(
			createPostEvent({
				body: { session_ids: ['classified-session'], include_classified: true }
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.queued).toBe(1);
		expect(queueChatSessionClassificationMock).toHaveBeenCalledWith({
			sessionId: 'classified-session',
			userId: 'user-1'
		});
	});

	it('reports classification queue failures in the result payload', async () => {
		const admin = createClassificationAdminSupabase({
			rows: [
				{
					id: 'missing-session',
					user_id: 'user-1',
					last_message_at: '2026-07-05T12:00:00.000Z',
					updated_at: '2026-07-05T12:00:00.000Z',
					created_at: '2026-07-05T10:00:00.000Z',
					last_classified_at: null
				}
			]
		});
		createAdminSupabaseClientMock.mockReturnValue(admin);
		queueChatSessionClassificationMock.mockResolvedValue({
			queued: false,
			reason: 'worker_unavailable'
		});

		const response = await classifyPOST(
			createPostEvent({ body: { session_ids: ['missing-session'] } })
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({ queued: 0, skipped: 1 });
		expect(payload.data.results[0]).toMatchObject({
			session_id: 'missing-session',
			queued: false,
			reason: 'worker_unavailable'
		});
	});

	it('returns 400 for empty classification queue requests before creating an admin client', async () => {
		const response = await classifyPOST(createPostEvent({ body: { session_ids: [] } }));

		await expectErrorResponse(response, 400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(queueChatSessionClassificationMock).not.toHaveBeenCalled();
	});
});

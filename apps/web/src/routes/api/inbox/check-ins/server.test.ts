// apps/web/src/routes/api/inbox/check-ins/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadInboxCheckIns: vi.fn(),
	answerCheckIns: vi.fn(),
	parseCheckInAnswers: vi.fn()
}));

vi.mock('$lib/server/inbox-check-ins.service', () => ({
	loadInboxCheckIns: mocks.loadInboxCheckIns,
	answerCheckIns: mocks.answerCheckIns,
	parseCheckInAnswers: mocks.parseCheckInAnswers
}));

import { GET, POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeEvent(
	url: string,
	init?: RequestInit,
	user: { id: string } | null = { id: 'user-1' }
) {
	return {
		url: new URL(url),
		request: new Request(url, init),
		locals: {
			supabase: { from: vi.fn() },
			safeGetSession: vi.fn(async () => ({ user }))
		}
	} as any;
}

describe('GET /api/inbox/check-ins', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadInboxCheckIns.mockResolvedValue({
			projects: [],
			time_zone: 'America/Chicago',
			today: '2026-10-29',
			card_count: 0,
			task_count: 0
		});
	});

	it('loads check-ins for the signed-in user in the requested zone', async () => {
		const event = makeEvent(
			`http://localhost/api/inbox/check-ins?tz=America/Chicago&project_id=${PROJECT_ID}`
		);
		const response = await GET(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.time_zone).toBe('America/Chicago');
		expect(mocks.loadInboxCheckIns).toHaveBeenCalledWith({
			supabase: event.locals.supabase,
			userId: 'user-1',
			timeZone: 'America/Chicago',
			projectId: PROJECT_ID
		});
	});

	it('requires a session and a valid project filter', async () => {
		expect(
			(await GET(makeEvent('http://localhost/api/inbox/check-ins', undefined, null))).status
		).toBe(401);
		expect(
			(await GET(makeEvent('http://localhost/api/inbox/check-ins?project_id=nope'))).status
		).toBe(400);
		expect(mocks.loadInboxCheckIns).not.toHaveBeenCalled();
	});

	it('reports a load failure', async () => {
		mocks.loadInboxCheckIns.mockRejectedValue(new Error('db down'));
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const response = await GET(makeEvent('http://localhost/api/inbox/check-ins'));
		expect(response.status).toBe(500);
		error.mockRestore();
	});
});

describe('POST /api/inbox/check-ins', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function post(body: unknown, user: { id: string } | null = { id: 'user-1' }) {
		return makeEvent(
			'http://localhost/api/inbox/check-ins',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			},
			user
		);
	}

	it('saves parsed answers and returns per-answer results', async () => {
		const answers = [{ task_id: TASK_ID, answer: 'done' }];
		mocks.parseCheckInAnswers.mockReturnValue({ ok: true, answers });
		mocks.answerCheckIns.mockResolvedValue({ results: [{ ok: true }], changed: 1, failed: 0 });
		const event = post({ answers });

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data.changed).toBe(1);
		expect(mocks.parseCheckInAnswers).toHaveBeenCalledWith({ answers });
		expect(mocks.answerCheckIns).toHaveBeenCalledWith({
			supabase: event.locals.supabase,
			userId: 'user-1',
			answers
		});
	});

	it('rejects an invalid body before writing', async () => {
		mocks.parseCheckInAnswers.mockReturnValue({
			ok: false,
			error: 'answers must be a non-empty array'
		});
		const response = await POST(post({ answers: [] }));
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toBe('answers must be a non-empty array');
		expect(mocks.answerCheckIns).not.toHaveBeenCalled();
	});

	it('requires a session', async () => {
		const response = await POST(post({ answers: [] }, null));
		expect(response.status).toBe(401);
		expect(mocks.parseCheckInAnswers).not.toHaveBeenCalled();
	});
});

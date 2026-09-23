// apps/worker/tests/notificationEmailWebhookContract.test.ts
//
// Status contract between the email adapter and the web send-notification-email
// webhook: a preference-blocked or unsent reply must never be recorded as sent,
// and a transient preference-read outage must stay retryable.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const originalEnv = {
		PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
		PRIVATE_BUILDOS_WEBHOOK_SECRET: process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET
	};

	function createQuery(table: string) {
		let action: 'select' | 'insert' | 'update' = 'select';
		const resolveResult = () => {
			if (table === 'emails' && action === 'select') return { data: [], error: null };
			if (table === 'emails') return { data: { id: 'email-1' }, error: null };
			if (table === 'users')
				return { data: { email: 'user@example.com', name: 'User' }, error: null };
			return { data: null, error: null };
		};
		const query: any = {
			select: () => query,
			insert: () => {
				action = 'insert';
				return query;
			},
			update: () => {
				action = 'update';
				return query;
			},
			eq: () => query,
			order: () => query,
			limit: () => query,
			single: async () => resolveResult(),
			maybeSingle: async () => resolveResult(),
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(resolveResult()).then(resolve, reject)
		};
		return query;
	}

	const noopLogger: any = {
		child: () => noopLogger,
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	};

	return { originalEnv, createQuery, noopLogger };
});

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => ({ from: (table: string) => mocks.createQuery(table) })
}));

vi.mock('../src/workers/notification/preferenceChecker.js', () => ({
	checkUserPreferences: vi.fn(async () => ({ allowed: true, preferences: null }))
}));

import { sendEmailNotification } from '../src/workers/notification/emailAdapter';

const fetchMock = vi.fn();

function delivery(): any {
	return {
		id: 'delivery-1',
		event_id: 'event-1',
		recipient_user_id: 'user-1',
		channel: 'email',
		status: 'pending',
		attempts: 0,
		max_attempts: 3,
		payload: { title: 'Heads up', body: 'Something happened', event_type: 'user.signup' }
	};
}

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

beforeEach(() => {
	process.env.PUBLIC_APP_URL = 'https://build-os.test';
	process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET = 'secret';
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => {
	vi.unstubAllGlobals();
	for (const [key, value] of Object.entries(mocks.originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('email adapter webhook status contract', () => {
	it('records a 2xx send as sent', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { success: true, data: { success: true, messageId: 'msg-1' } })
		);

		const result = await sendEmailNotification(delivery(), mocks.noopLogger);

		expect(result).toEqual({ success: true, external_id: 'email-1' });
	});

	it('treats a 409 preference block as a cancel, never as sent', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(409, {
				success: false,
				error: 'Cancelled: User preferences do not allow email notifications',
				code: 'EMAIL_PREFERENCES_BLOCKED'
			})
		);

		const result = await sendEmailNotification(delivery(), mocks.noopLogger);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Cancelled:/);
	});

	it('keeps a 503 preference outage retryable', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(503, {
				success: false,
				error: 'Email preferences temporarily unavailable',
				code: 'EMAIL_PREFERENCES_UNAVAILABLE'
			})
		);

		const result = await sendEmailNotification(delivery(), mocks.noopLogger);

		expect(result.success).toBe(false);
		expect(result.error).not.toMatch(/^Cancelled:/);
		expect(result.error).toContain('Email preferences temporarily unavailable');
	});

	it('does not count a legacy 200 { data: { success: false } } reply as sent', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				success: true,
				data: {
					success: false,
					error: 'Cancelled: User preferences do not allow email notifications'
				}
			})
		);

		const result = await sendEmailNotification(delivery(), mocks.noopLogger);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Cancelled:/);
	});
});

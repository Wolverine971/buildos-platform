// apps/web/src/routes/api/beta/signup/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateMinimalEmailHTMLMock, createGmailTransporterMock, getDefaultSenderMock } =
	vi.hoisted(() => ({
		generateMinimalEmailHTMLMock: vi.fn(() => '<html></html>'),
		createGmailTransporterMock: vi.fn(() => ({
			sendMail: vi.fn().mockResolvedValue(undefined)
		})),
		getDefaultSenderMock: vi.fn(() => ({
			email: 'dj@build-os.com',
			password: ''
		}))
	}));

vi.mock('$lib/utils/emailTemplate.js', () => ({
	generateMinimalEmailHTML: generateMinimalEmailHTMLMock
}));

vi.mock('$lib/utils/email-config', () => ({
	createGmailTransporter: createGmailTransporterMock,
	getDefaultSender: getDefaultSenderMock
}));

import { GET, POST } from './+server';

function createBetaSignupSupabaseMock({
	existingSignup = null,
	insertedSignup = null,
	existingError = null,
	insertError = null
}: {
	existingSignup?: Record<string, any> | null;
	insertedSignup?: Record<string, any> | null;
	existingError?: Record<string, any> | null;
	insertError?: Record<string, any> | null;
}) {
	const existingSingle = vi.fn().mockResolvedValue({
		data: existingSignup,
		error: existingSignup ? null : (existingError ?? { code: 'PGRST116', message: 'Not found' })
	});
	const insertSingle = vi.fn().mockResolvedValue({
		data: insertedSignup,
		error: insertError
	});
	const insertSelectChain: any = {
		select: vi.fn(() => insertSelectChain),
		single: insertSingle
	};
	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		single: existingSingle,
		insert: vi.fn(() => insertSelectChain)
	};

	return {
		supabase: {
			from: vi.fn((table: string) => {
				if (table !== 'beta_signups') {
					throw new Error(`Unexpected table: ${table}`);
				}

				return queryBuilder;
			})
		},
		queryBuilder
	};
}

describe('POST /api/beta/signup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('accepts a minimal signup payload without recaptcha or long-form answers', async () => {
		const insertedSignup = {
			id: 'signup-1',
			email: 'test.user+beta@example.com',
			full_name: 'Test User',
			job_title: null,
			company_name: null,
			why_interested: null,
			productivity_tools: [],
			biggest_challenge: null,
			referral_source: null,
			wants_weekly_calls: true,
			wants_community_access: true,
			user_timezone: 'America/New_York',
			created_at: '2026-04-09T12:00:00.000Z'
		};
		const { supabase, queryBuilder } = createBetaSignupSupabaseMock({
			insertedSignup
		});

		const response = await POST({
			request: new Request('http://localhost/api/beta/signup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'Test.User+beta@example.com'
				})
			}),
			locals: { supabase }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.success).toBe(true);

		expect(queryBuilder.insert).toHaveBeenCalledTimes(1);
		expect(queryBuilder.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				email: 'test.user+beta@example.com',
				full_name: 'Test User',
				why_interested: null,
				biggest_challenge: null,
				wants_weekly_calls: true,
				wants_community_access: true
			})
		);
		expect(createGmailTransporterMock).not.toHaveBeenCalled();
	});

	it('rejects honeypot submissions before touching the database', async () => {
		const { supabase, queryBuilder } = createBetaSignupSupabaseMock({});

		const response = await POST({
			request: new Request('http://localhost/api/beta/signup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'bot@example.com',
					honeypot: 'filled'
				})
			}),
			locals: { supabase }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.success).toBe(false);
		expect(queryBuilder.insert).not.toHaveBeenCalled();
	});
});

describe('GET /api/beta/signup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns not_found when the email has no existing signup', async () => {
		const { supabase } = createBetaSignupSupabaseMock({});

		const response = await GET({
			url: new URL('http://localhost/api/beta/signup?email=test@example.com'),
			locals: { supabase }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.status).toBe('not_found');
	});
});

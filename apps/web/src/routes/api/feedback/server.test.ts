// apps/web/src/routes/api/feedback/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	sendMailMock,
	createGmailTransporterMock,
	getDefaultSenderMock,
	createAdminSupabaseClientMock
} = vi.hoisted(() => {
	const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'm-1', response: 'ok' });
	return {
		sendMailMock,
		createGmailTransporterMock: vi.fn(() => ({ sendMail: sendMailMock })),
		getDefaultSenderMock: vi.fn(() => ({
			email: 'dj@build-os.com',
			password: 'app-password'
		})),
		createAdminSupabaseClientMock: vi.fn()
	};
});

vi.mock('$lib/utils/email-config', () => ({
	createGmailTransporter: createGmailTransporterMock,
	getDefaultSender: getDefaultSenderMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { POST } from './+server';

function createFeedbackSupabaseMock() {
	const insert = vi.fn((row: Record<string, unknown>) => ({
		select: vi.fn(() => ({
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'feedback-1',
					created_at: '2026-09-22T12:00:00.000Z',
					...row
				},
				error: null
			})
		}))
	}));
	const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
	const supabase = {
		rpc,
		from: vi.fn((table: string) => {
			if (table !== 'feedback') throw new Error(`Unexpected table: ${table}`);
			return { insert };
		})
	};
	return { supabase, insert, rpc };
}

function postFeedback(body: Record<string, unknown>) {
	return POST({
		request: new Request('http://localhost/api/feedback', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-forwarded-for': '203.0.113.7'
			},
			body: JSON.stringify(body)
		})
	} as any);
}

describe('POST /api/feedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		['bug', 'Urgent: I lost my project after the update'],
		['bug', 'Bug on https://build-os.com/projects page'],
		['bug', 'Win 11 Edge: brief page is blank'],
		['feature', 'Would love a free tier for students']
	])(
		'accepts real feedback that used to trip keyword filters: %s / %s',
		async (category, text) => {
			const { supabase, insert, rpc } = createFeedbackSupabaseMock();
			createAdminSupabaseClientMock.mockReturnValue(supabase);

			const response = await postFeedback({ category, feedback_text: text });
			const payload = await response.json();

			expect(response.status).toBe(201);
			expect(payload.success).toBe(true);
			expect(rpc).toHaveBeenCalledWith('check_feedback_rate_limit', {
				client_ip: '203.0.113.7'
			});
			expect(insert).toHaveBeenCalledWith(expect.objectContaining({ feedback_text: text }));
		}
	);

	it('still rejects honeypot submissions before touching the database', async () => {
		const { supabase, insert } = createFeedbackSupabaseMock();
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		const response = await postFeedback({
			category: 'general',
			feedback_text: 'This is a perfectly normal message.',
			honeypot: 'bot-filled'
		});

		expect(response.status).toBe(400);
		expect(insert).not.toHaveBeenCalled();
	});

	it('still enforces the category whitelist and length limits', async () => {
		const { supabase, insert } = createFeedbackSupabaseMock();
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		expect(
			(await postFeedback({ category: 'marketing', feedback_text: 'Long enough text here.' }))
				.status
		).toBe(400);
		expect((await postFeedback({ category: 'bug', feedback_text: 'too short' })).status).toBe(
			400
		);
		expect(
			(await postFeedback({ category: 'bug', feedback_text: 'x'.repeat(5001) })).status
		).toBe(400);
		expect(insert).not.toHaveBeenCalled();
	});

	it('rejects submissions when the per-IP rate limit is exhausted', async () => {
		const { supabase, insert, rpc } = createFeedbackSupabaseMock();
		rpc.mockResolvedValue({ data: false, error: null });
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		const response = await postFeedback({
			category: 'bug',
			feedback_text: 'Win 11 Edge: brief page is blank'
		});

		expect(response.status).toBe(429);
		expect(insert).not.toHaveBeenCalled();
	});

	it('HTML-escapes user-supplied content in the notification email', async () => {
		const { supabase } = createFeedbackSupabaseMock();
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		const response = await postFeedback({
			category: 'bug',
			feedback_text: 'Click here: <a href="//evil.example">x</a> & <script>alert(1)</script>',
			user_email: 'someone@example.com'
		});

		expect(response.status).toBe(201);
		expect(sendMailMock).toHaveBeenCalledTimes(1);
		const html = sendMailMock.mock.calls[0]![0].html as string;

		expect(html).toContain('&lt;a href=&quot;//evil.example&quot;&gt;x&lt;/a&gt;');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<a href="//evil.example"');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('someone@example.com');
	});
});

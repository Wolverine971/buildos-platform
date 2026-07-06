// apps/web/src/routes/api/webhooks/send-notification-email/server.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, sendEmailMock, fromCalls } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	sendEmailMock: vi.fn(),
	fromCalls: [] as string[]
}));

vi.mock('$env/static/private', () => ({
	PRIVATE_BUILDOS_WEBHOOK_SECRET: 'test-webhook-secret'
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/services/email-service', () => ({
	EmailService: vi.fn(() => ({
		sendEmail: sendEmailMock
	}))
}));

import { POST } from './+server';

function createEmailByIdQuery(email: Record<string, any> | null) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		maybeSingle: vi.fn().mockResolvedValue({
			data: email,
			error: null
		})
	};
	return query;
}

function createSupabase(email: Record<string, any> | null) {
	return {
		from: vi.fn((table: string) => {
			fromCalls.push(table);
			if (table === 'emails') {
				return createEmailByIdQuery(email);
			}
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createWebhookRequest(body: Record<string, unknown>) {
	return new Request('https://build-os.com/api/webhooks/send-notification-email', {
		method: 'POST',
		headers: {
			authorization: 'Bearer test-webhook-secret',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			recipientEmail: 'user@example.com',
			recipientName: 'User',
			recipientUserId: 'user-1',
			subject: 'BuildOS Daily Brief',
			htmlContent: '<p>Your brief is ready.</p>',
			textContent: 'Your brief is ready.',
			trackingId: 'tracking-1',
			emailRecordId: 'email-1',
			deliveryId: 'delivery-1',
			eventId: 'event-1',
			eventType: 'brief.completed',
			...body
		})
	});
}

describe('/api/webhooks/send-notification-email', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fromCalls.length = 0;
	});

	it('does not call Gmail when the delivery email was already sent', async () => {
		createAdminSupabaseClientMock.mockReturnValue(
			createSupabase({
				id: 'email-1',
				status: 'sent',
				tracking_id: 'tracking-1',
				sent_at: '2026-07-06T15:00:00.000Z'
			})
		);

		const response = await POST({
			request: createWebhookRequest({})
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data).toMatchObject({
			success: true,
			emailId: 'email-1',
			skipped: 'already_sent'
		});
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(fromCalls).toEqual(['emails']);
	});
});

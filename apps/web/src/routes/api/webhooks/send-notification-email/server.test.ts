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

	it('claims the email row and sends via Gmail when not already sent', async () => {
		const responsesByTable: Record<string, any[]> = {
			emails: [
				// findSentEmailForDelivery: by-id lookup — not sent yet
				{ data: { id: 'email-1', status: 'scheduled', tracking_id: 't', sent_at: null } },
				// findSentEmailForDelivery: delivery-id fallback — nothing sent
				{ data: [], error: null },
				// atomic claim update — this sender wins
				{ data: { id: 'email-1' }, error: null }
			],
			user_notification_preferences: [
				{ data: { email_enabled: true, should_email_daily_brief: true }, error: null }
			]
		};

		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn((table: string) => {
				fromCalls.push(table);
				const response = responsesByTable[table]?.shift();
				if (!response) throw new Error(`Unexpected query on table: ${table}`);
				const query: any = {
					select: vi.fn(() => query),
					update: vi.fn(() => query),
					eq: vi.fn(() => query),
					not: vi.fn(() => query),
					or: vi.fn(() => query),
					in: vi.fn(() => query),
					order: vi.fn(() => query),
					limit: vi.fn(() => query),
					maybeSingle: vi.fn().mockResolvedValue(response),
					then: (resolve: any, reject: any) =>
						Promise.resolve(response).then(resolve, reject)
				};
				return query;
			})
		});
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'msg-1' });

		const response = await POST({
			request: createWebhookRequest({})
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data).toMatchObject({ success: true, messageId: 'msg-1' });
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'user@example.com',
				subject: 'BuildOS Daily Brief',
				emailId: 'email-1'
			})
		);
	});

	it('skips the Gmail send when another sender holds the claim', async () => {
		const responsesByTable: Record<string, any[]> = {
			emails: [
				{ data: { id: 'email-1', status: 'scheduled', tracking_id: 't', sent_at: null } },
				{ data: [], error: null },
				// claim update matches no row — a concurrent sender owns it
				{ data: null, error: null }
			],
			user_notification_preferences: [
				{ data: { email_enabled: true, should_email_daily_brief: true }, error: null }
			]
		};

		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn((table: string) => {
				fromCalls.push(table);
				const response = responsesByTable[table]?.shift();
				if (!response) throw new Error(`Unexpected query on table: ${table}`);
				const query: any = {
					select: vi.fn(() => query),
					update: vi.fn(() => query),
					eq: vi.fn(() => query),
					not: vi.fn(() => query),
					or: vi.fn(() => query),
					in: vi.fn(() => query),
					order: vi.fn(() => query),
					limit: vi.fn(() => query),
					maybeSingle: vi.fn().mockResolvedValue(response),
					then: (resolve: any, reject: any) =>
						Promise.resolve(response).then(resolve, reject)
				};
				return query;
			})
		});

		const response = await POST({
			request: createWebhookRequest({})
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data).toMatchObject({
			success: true,
			skipped: 'claimed_by_other_sender'
		});
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});

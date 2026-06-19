// apps/web/src/routes/api/email-tracking/[tracking_id]/unsubscribe/server.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, rpcMock, tableCalls } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	rpcMock: vi.fn(),
	tableCalls: {
		events: [] as Record<string, any>[],
		welcomeUpdates: [] as Record<string, any>[],
		notificationPreferenceUpserts: [] as Record<string, any>[],
		briefPreferenceUpserts: [] as Record<string, any>[],
		subscriptionUpdates: [] as Record<string, any>[],
		queueUpdates: [] as Record<string, any>[]
	}
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('@buildos/shared-utils', () => ({
	createLogger: vi.fn(() => ({
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		child: vi.fn(() => ({
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn()
		}))
	}))
}));

import { GET, POST } from './+server';

function createEmailQuery(email: Record<string, any> | null) {
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

function createInsertQuery(target: 'events') {
	const query: any = {
		insert: vi.fn((payload: Record<string, any>) => {
			tableCalls[target].push(payload);
			return Promise.resolve({ data: null, error: null });
		})
	};
	return query;
}

function createWelcomeQuery() {
	const query: any = {
		update: vi.fn((payload: Record<string, any>) => {
			tableCalls.welcomeUpdates.push(payload);
			return query;
		}),
		eq: vi.fn(() => query)
	};
	return query;
}

function createUpsertQuery(target: 'notificationPreferenceUpserts' | 'briefPreferenceUpserts') {
	return {
		upsert: vi.fn((payload: Record<string, any>) => {
			tableCalls[target].push(payload);
			return Promise.resolve({ data: null, error: null });
		})
	};
}

function createUpdateChain(target: 'subscriptionUpdates' | 'queueUpdates') {
	const query: any = {
		update: vi.fn((payload: Record<string, any>) => {
			tableCalls[target].push(payload);
			return query;
		}),
		eq: vi.fn(() => query),
		in: vi.fn(() => Promise.resolve({ data: null, error: null }))
	};
	return query;
}

function createSupabase(email: Record<string, any> | null) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'emails') {
				return createEmailQuery(email);
			}
			if (table === 'email_tracking_events') {
				return createInsertQuery('events');
			}
			if (table === 'welcome_email_sequences') {
				return createWelcomeQuery();
			}
			if (table === 'user_notification_preferences') {
				return createUpsertQuery('notificationPreferenceUpserts');
			}
			if (table === 'user_brief_preferences') {
				return createUpsertQuery('briefPreferenceUpserts');
			}
			if (table === 'notification_subscriptions') {
				return createUpdateChain('subscriptionUpdates');
			}
			if (table === 'queue_jobs') {
				return createUpdateChain('queueUpdates');
			}
			throw new Error(`Unexpected table: ${table}`);
		}),
		rpc: rpcMock
	};
}

function createTrackedEmail() {
	return {
		id: 'email-1',
		category: 'welcome_sequence',
		created_by: 'automated-service',
		subject: 'Welcome to BuildOS',
		template_data: {
			campaign: 'welcome-sequence'
		},
		email_recipients: [
			{
				id: 'recipient-1',
				recipient_email: 'User@Example.com',
				recipient_id: 'user-1'
			}
		]
	};
}

function createDailyBriefEmail() {
	return {
		id: 'email-2',
		category: 'daily_brief',
		created_by: '11111111-1111-4111-8111-111111111111',
		subject: 'BuildOS Daily Brief',
		template_data: {
			category: 'daily_brief',
			event_type: 'brief.completed',
			brief_id: 'brief-1',
			brief_date: '2026-06-19',
			user_id: '11111111-1111-4111-8111-111111111111'
		},
		email_recipients: [
			{
				id: 'recipient-2',
				recipient_email: 'BriefUser@Example.com',
				recipient_id: '11111111-1111-4111-8111-111111111111'
			}
		]
	};
}

describe('/api/email-tracking/[tracking_id]/unsubscribe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tableCalls.events.length = 0;
		tableCalls.welcomeUpdates.length = 0;
		tableCalls.notificationPreferenceUpserts.length = 0;
		tableCalls.briefPreferenceUpserts.length = 0;
		tableCalls.subscriptionUpdates.length = 0;
		tableCalls.queueUpdates.length = 0;
		rpcMock.mockResolvedValue({ data: 'suppression-1', error: null });
	});

	it('suppresses lifecycle email and cancels the legacy welcome row from the visible link', async () => {
		createAdminSupabaseClientMock.mockReturnValue(createSupabase(createTrackedEmail()));

		const response = await GET({
			params: { tracking_id: 'tracking-1' },
			request: new Request('https://build-os.com/api/email-tracking/tracking-1/unsubscribe', {
				headers: {
					'user-agent': 'test-agent',
					'x-forwarded-for': '203.0.113.10'
				}
			})
		} as any);

		expect(response.status).toBe(200);
		expect(rpcMock).toHaveBeenCalledWith('upsert_email_suppression', {
			p_email: 'user@example.com',
			p_scope: 'lifecycle',
			p_reason: 'unsubscribe',
			p_source: 'email_link',
			p_metadata: expect.objectContaining({
				tracking_id: 'tracking-1',
				email_id: 'email-1',
				recipient_user_id: 'user-1'
			})
		});
		expect(tableCalls.events[0]).toMatchObject({
			email_id: 'email-1',
			recipient_id: 'recipient-1',
			event_type: 'unsubscribed',
			user_agent: 'test-agent',
			ip_address: '203.0.113.10'
		});
		expect(tableCalls.welcomeUpdates[0]).toMatchObject({
			status: 'cancelled',
			completed_at: expect.any(String),
			last_evaluated_at: expect.any(String)
		});
	});

	it('records list_header source for one-click POST requests', async () => {
		createAdminSupabaseClientMock.mockReturnValue(createSupabase(createTrackedEmail()));

		const response = await POST({
			params: { tracking_id: 'tracking-1' },
			request: new Request('https://build-os.com/api/email-tracking/tracking-1/unsubscribe', {
				method: 'POST'
			})
		} as any);

		expect(response.status).toBe(200);
		expect(rpcMock).toHaveBeenCalledWith(
			'upsert_email_suppression',
			expect.objectContaining({
				p_source: 'list_header'
			})
		);
	});

	it('turns off daily briefs from a daily brief unsubscribe link', async () => {
		createAdminSupabaseClientMock.mockReturnValue(createSupabase(createDailyBriefEmail()));

		const response = await GET({
			params: { tracking_id: 'tracking-brief' },
			request: new Request(
				'https://build-os.com/api/email-tracking/tracking-brief/unsubscribe'
			)
		} as any);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('daily briefs have been turned off');
		expect(rpcMock).toHaveBeenCalledWith('upsert_email_suppression', {
			p_email: 'briefuser@example.com',
			p_scope: 'daily_brief',
			p_reason: 'unsubscribe',
			p_source: 'email_link',
			p_metadata: expect.objectContaining({
				tracking_id: 'tracking-brief',
				email_id: 'email-2',
				recipient_user_id: '11111111-1111-4111-8111-111111111111'
			})
		});
		expect(tableCalls.notificationPreferenceUpserts[0]).toMatchObject({
			user_id: '11111111-1111-4111-8111-111111111111',
			should_email_daily_brief: false,
			should_sms_daily_brief: false
		});
		expect(tableCalls.briefPreferenceUpserts[0]).toMatchObject({
			user_id: '11111111-1111-4111-8111-111111111111',
			is_active: false
		});
		expect(tableCalls.subscriptionUpdates[0]).toMatchObject({
			is_active: false
		});
		expect(tableCalls.queueUpdates[0]).toMatchObject({
			status: 'cancelled',
			error_message: 'Cancelled by daily brief email unsubscribe'
		});
		expect(tableCalls.welcomeUpdates).toHaveLength(0);
	});
});

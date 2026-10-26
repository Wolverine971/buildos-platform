// apps/web/src/lib/server/email-campaigns/sender.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/email-service', () => ({
	EmailService: vi.fn()
}));

import { FakeDb, registerClaimRpc } from './fake-db.test-helper';
import {
	EMPTY_EMAIL_MESSAGE,
	INTERRUPTED_SEND_MESSAGE,
	parseDailyCap,
	processDueCampaignSends,
	sendCampaignTest,
	suppressionReason,
	type CampaignEmailSender
} from './sender';

const NOW = new Date('2026-10-27T14:00:00.000Z');
const PAST = '2026-10-27T13:00:00.000Z';
const FUTURE = '2026-10-27T15:00:00.000Z';

function campaign(overrides: Record<string, any> = {}) {
	return {
		id: 'campaign-1',
		name: 'Reactivation',
		status: 'sending',
		subject_template: 'hi {{first_name}}',
		body_template:
			'<p>Hey {{first_name}}, <a href="https://build-os.com/s/start">start here</a>.</p>',
		from_name: 'DJ',
		created_by: 'admin-1',
		...overrides
	};
}

function recipient(id: string, overrides: Record<string, any> = {}) {
	return {
		id,
		campaign_id: 'campaign-1',
		email: `${id}@example.com`,
		name: null,
		first_name: 'Kay',
		user_id: null,
		segment: 'no_project',
		context: {},
		subject_override: null,
		body_override: null,
		included: true,
		status: 'queued',
		scheduled_for: PAST,
		lease_expires_at: null,
		attempt_count: 0,
		sent_at: null,
		email_id: null,
		tracking_id: null,
		message_id: null,
		error_message: null,
		skip_reason: null,
		...overrides
	};
}

function emailServiceMock() {
	let counter = 0;
	return {
		sendEmail: vi.fn<CampaignEmailSender['sendEmail']>(async () => {
			counter++;
			return {
				success: true,
				messageId: `<msg-${counter}@build-os.com>`,
				emailId: `email-${counter}`,
				trackingId: `tracking-${counter}`
			};
		})
	};
}

function setup(
	recipients: Record<string, any>[],
	campaigns = [campaign()],
	suppressions: any[] = []
) {
	const db = new FakeDb({
		email_campaigns: campaigns,
		email_campaign_recipients: recipients,
		email_suppressions: suppressions
	});
	registerClaimRpc(db, () => NOW);
	return db;
}

function row(db: FakeDb, id: string) {
	return db.table('email_campaign_recipients').find((entry) => entry.id === id)!;
}

describe('suppressionReason', () => {
	it('blocks any opt-out except a daily-brief-only unsubscribe', () => {
		expect(suppressionReason([])).toBeNull();
		expect(
			suppressionReason([{ email: 'a', scope: 'daily_brief', reason: 'unsubscribe' }])
		).toBeNull();
		expect(suppressionReason([{ email: 'a', scope: 'lifecycle', reason: 'unsubscribe' }])).toBe(
			'unsubscribed'
		);
		expect(suppressionReason([{ email: 'a', scope: 'marketing', reason: 'manual' }])).toBe(
			'unsubscribed'
		);
		expect(
			suppressionReason([{ email: 'a', scope: 'daily_brief', reason: 'hard_bounce' }])
		).toBe('bounced');
	});

	it('parses the daily cap env with a safe default', () => {
		expect(parseDailyCap('150')).toBe(150);
		expect(parseDailyCap(undefined)).toBe(400);
		expect(parseDailyCap('nope')).toBe(400);
	});
});

describe('processDueCampaignSends', () => {
	let emailService: ReturnType<typeof emailServiceMock>;

	beforeEach(() => {
		emailService = emailServiceMock();
	});

	it('sends due emails through EmailService with campaign metadata and records the result', async () => {
		const db = setup([recipient('r1'), recipient('r2', { scheduled_for: FUTURE })]);

		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});

		expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
		expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
		const call = emailService.sendEmail.mock.calls[0]![0];
		expect(call).toMatchObject({
			to: 'r1@example.com',
			subject: 'hi Kay',
			from: 'dj',
			fromName: 'DJ',
			createdBy: 'admin-1',
			trackingEnabled: true,
			metadata: {
				category: 'campaign',
				campaign_type: 'marketing',
				campaign_id: 'campaign-1',
				campaign_recipient_id: 'r1',
				campaign_name: 'Reactivation',
				segment: 'no_project'
			}
		});
		expect(call.metadata?.tracking_id).toEqual(expect.any(String));
		expect(call.html).toContain('Hey Kay');
		expect(call.html).not.toContain('{{');
		expect(call.body).toContain('start here (https://build-os.com/s/start)');

		expect(row(db, 'r1')).toMatchObject({
			status: 'sent',
			email_id: 'email-1',
			tracking_id: 'tracking-1',
			message_id: '<msg-1@build-os.com>',
			lease_expires_at: null
		});
		expect(row(db, 'r1').sent_at).toEqual(expect.any(String));
		// r2 is still waiting for its wave, so the campaign keeps sending.
		expect(row(db, 'r2').status).toBe('queued');
		expect(db.table('email_campaigns')[0]!.status).toBe('sending');
	});

	it('uses a person’s own version over the template', async () => {
		const db = setup([
			recipient('r1', {
				subject_override: 'your synapse server',
				body_override: '<p>Custom</p>'
			})
		]);
		await processDueCampaignSends({ supabase: db as any, now: NOW, emailService });
		const call = emailService.sendEmail.mock.calls[0]![0];
		expect(call.subject).toBe('your synapse server');
		expect(call.html).toContain('<p>Custom</p>');
	});

	it('marks the campaign completed when nothing is left to send', async () => {
		const db = setup([recipient('r1'), recipient('r2', { included: false, status: 'draft' })]);
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary.completedCampaigns).toBe(1);
		expect(db.table('email_campaigns')[0]).toMatchObject({
			status: 'completed',
			completed_at: NOW.toISOString()
		});
	});

	it('skips people who opted out after queueing, without sending', async () => {
		const db = setup(
			[recipient('r1'), recipient('r2'), recipient('r3')],
			[campaign()],
			[
				{ email: 'r1@example.com', scope: 'marketing', reason: 'unsubscribe' },
				{ email: 'r2@example.com', scope: 'all', reason: 'hard_bounce' },
				{ email: 'r3@example.com', scope: 'daily_brief', reason: 'unsubscribe' }
			]
		);
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary).toMatchObject({ sent: 1, skipped: 2 });
		expect(row(db, 'r1')).toMatchObject({ status: 'skipped', skip_reason: 'unsubscribed' });
		expect(row(db, 'r2')).toMatchObject({ status: 'skipped', skip_reason: 'bounced' });
		expect(row(db, 'r3').status).toBe('sent');
		expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
	});

	it('records a failed send with the error and never retries it on its own', async () => {
		const db = setup([recipient('r1')]);
		emailService.sendEmail.mockResolvedValueOnce({
			success: false,
			error: 'Invalid login'
		});
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary.failed).toBe(1);
		expect(summary.errors).toEqual([{ recipientId: 'r1', error: 'Invalid login' }]);
		expect(row(db, 'r1')).toMatchObject({ status: 'failed', error_message: 'Invalid login' });
	});

	it('treats a thrown send as a failure', async () => {
		const db = setup([recipient('r1')]);
		emailService.sendEmail.mockRejectedValueOnce(new Error('socket hang up'));
		await processDueCampaignSends({ supabase: db as any, now: NOW, emailService });
		expect(row(db, 'r1')).toMatchObject({ status: 'failed', error_message: 'socket hang up' });
	});

	it('fails an email with an empty subject or body instead of sending it', async () => {
		const db = setup([recipient('r1')], [campaign({ subject_template: '   ' })]);
		await processDueCampaignSends({ supabase: db as any, now: NOW, emailService });
		expect(emailService.sendEmail).not.toHaveBeenCalled();
		expect(row(db, 'r1')).toMatchObject({
			status: 'failed',
			error_message: EMPTY_EMAIL_MESSAGE
		});
	});

	it('marks expired leases failed ("may have gone out") and does not send them again', async () => {
		const db = setup([
			recipient('r1', { status: 'sending', lease_expires_at: '2026-10-27T13:55:00.000Z' })
		]);
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary.expired).toBe(1);
		expect(emailService.sendEmail).not.toHaveBeenCalled();
		expect(row(db, 'r1')).toMatchObject({
			status: 'failed',
			error_message: INTERRUPTED_SEND_MESSAGE
		});
	});

	it('stops claiming when the time budget runs out and leaves the rest queued', async () => {
		const db = setup([recipient('r1'), recipient('r2'), recipient('r3')]);
		let elapsed = 0;
		emailService.sendEmail.mockImplementation(async () => {
			elapsed += 30_000;
			return { success: true, messageId: 'm', emailId: 'e', trackingId: 't' };
		});
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService,
			budgetMs: 40_000,
			clock: () => elapsed
		});
		// One row is claimed at a time, so nothing has to be handed back.
		expect(summary).toMatchObject({ claimed: 2, sent: 2, released: 0 });
		expect(row(db, 'r3')).toMatchObject({ status: 'queued', lease_expires_at: null });
	});

	it('stops at the daily cap', async () => {
		const sentToday = Array.from({ length: 3 }, (_, index) =>
			recipient(`old-${index}`, {
				campaign_id: 'campaign-0',
				status: 'sent',
				sent_at: '2026-10-27T09:00:00.000Z'
			})
		);
		const db = setup([...sentToday, recipient('r1'), recipient('r2')]);
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService,
			dailyCap: 4
		});
		expect(summary).toMatchObject({ dailyCapRemaining: 1, claimed: 1, sent: 1 });

		const capped = setup([...sentToday, recipient('r1')]);
		const cappedSummary = await processDueCampaignSends({
			supabase: capped as any,
			now: NOW,
			emailService,
			dailyCap: 3
		});
		expect(cappedSummary.claimed).toBe(0);
		expect(capped.rpcCalls).toHaveLength(0);
	});

	it('never claims rows from a paused campaign', async () => {
		const db = setup([recipient('r1')], [campaign({ status: 'paused' })]);
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary.claimed).toBe(0);
		expect(row(db, 'r1').status).toBe('queued');
		expect(db.table('email_campaigns')[0]!.status).toBe('paused');
	});

	it('skips someone who asked to delete their account after queueing', async () => {
		const db = setup([recipient('r1', { user_id: 'u1' })]);
		db.table('users').push({ id: 'u1', deletion_status: 'pending' });
		const summary = await processDueCampaignSends({
			supabase: db as any,
			now: NOW,
			emailService
		});
		expect(summary).toMatchObject({ sent: 0, skipped: 1 });
		expect(row(db, 'r1')).toMatchObject({ status: 'skipped', skip_reason: 'deleting_account' });
		expect(emailService.sendEmail).not.toHaveBeenCalled();
	});

	it('releases every claimed row when campaign data cannot be loaded', async () => {
		const db = setup([recipient('r1')]);
		db.failures.email_campaigns = 'connection reset';
		await expect(
			processDueCampaignSends({ supabase: db as any, now: NOW, emailService })
		).rejects.toThrow('connection reset');
		expect(row(db, 'r1')).toMatchObject({ status: 'queued', lease_expires_at: null });
		expect(emailService.sendEmail).not.toHaveBeenCalled();
	});
});

describe('sendCampaignTest', () => {
	it('sends the person’s version to the admin with a [Test] subject and test metadata', async () => {
		const emailService = emailServiceMock();
		const result = await sendCampaignTest({
			emailService,
			campaign: campaign(),
			recipient: {
				id: 'r1',
				first_name: 'Kay',
				context: {},
				subject_override: null,
				body_override: null
			},
			to: 'djwayne35@gmail.com',
			adminUserId: 'admin-1',
			adminName: 'DJ Wayne'
		});
		expect(result).toEqual({ success: true, sentTo: 'djwayne35@gmail.com' });
		const call = emailService.sendEmail.mock.calls[0]![0];
		expect(call).toMatchObject({
			to: 'djwayne35@gmail.com',
			subject: '[Test] hi Kay',
			fromName: 'DJ',
			userId: null,
			createdBy: 'admin-1',
			metadata: { category: 'campaign_test', campaign_type: 'marketing', test: true }
		});
	});

	it('fills the template with the admin’s first name when no person is picked', async () => {
		const emailService = emailServiceMock();
		await sendCampaignTest({
			emailService,
			campaign: campaign(),
			to: 'dj@build-os.com',
			adminUserId: 'admin-1',
			adminName: 'DJ Wayne'
		});
		expect(emailService.sendEmail.mock.calls[0]![0].subject).toBe('[Test] hi DJ');
	});

	it('refuses an empty email', async () => {
		const emailService = emailServiceMock();
		const result = await sendCampaignTest({
			emailService,
			campaign: campaign({ subject_template: '', body_template: '' }),
			to: 'dj@build-os.com',
			adminUserId: 'admin-1'
		});
		expect(result).toMatchObject({ success: false, empty: true });
		expect(emailService.sendEmail).not.toHaveBeenCalled();
	});
});

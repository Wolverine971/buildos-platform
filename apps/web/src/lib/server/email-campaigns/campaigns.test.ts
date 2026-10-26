// apps/web/src/lib/server/email-campaigns/campaigns.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/supabase/admin', async () => {
	const { createFakeSupabase } = await import('./fake-supabase.test-helper');
	return {
		createAdminSupabaseClient: () => createFakeSupabase({ email_suppressions: [] }).client
	};
});

import {
	CampaignError,
	cancelCampaign,
	computeCounts,
	computeWaveSchedule,
	createFollowUp,
	deleteCampaign,
	getCampaignDetail,
	listCampaigns,
	pauseCampaign,
	queueCampaign,
	resumeCampaign,
	retryRecipient,
	syncRecipients,
	updateRecipient,
	validateForSending
} from './campaigns';
import { createFakeSupabase } from './fake-supabase.test-helper';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const noSuppressions = { readSuppressions: async () => [], now: NOW };

function campaign(overrides: Record<string, any> = {}) {
	return {
		id: 'c1',
		name: 'Test',
		status: 'draft',
		subject_template: 'hi {{first_name}}',
		body_template: '<p>Hello {{first_name}}</p>',
		from_name: 'DJ',
		audience: { segments: [], people: [], removed_emails: [] },
		tailoring_instructions: null,
		wave_size: 2,
		wave_interval_minutes: 30,
		starts_at: null,
		queued_at: null,
		completed_at: null,
		canceled_at: null,
		source: 'admin',
		metadata: {},
		created_by: 'admin-1',
		created_at: '2026-10-25T00:00:00.000Z',
		updated_at: '2026-10-25T00:00:00.000Z',
		...overrides
	};
}

function recipient(overrides: { email: string } & Record<string, any>) {
	return {
		campaign_id: 'c1',
		name: null,
		first_name: null,
		user_id: null,
		beta_signup_id: null,
		segment: 'manual',
		context: {},
		subject_override: null,
		body_override: null,
		override_source: null,
		tailor_status: 'none',
		tailor_error: null,
		tailored_at: null,
		included: true,
		status: 'draft',
		skip_reason: null,
		scheduled_for: null,
		lease_expires_at: null,
		attempt_count: 0,
		email_id: null,
		tracking_id: null,
		message_id: null,
		sent_at: null,
		replied_at: null,
		reply_checked_at: null,
		bounced_at: null,
		error_message: null,
		source_email_id: null,
		created_at: '2026-10-25T01:00:00.000Z',
		updated_at: '2026-10-25T01:00:00.000Z',
		...overrides
	};
}

function audienceTables(extra: Record<string, any[]> = {}) {
	return {
		users: [],
		onto_actors: [],
		onto_projects: [],
		beta_signups: [],
		...extra
	};
}

function engagementRpc(rows: any[] = []) {
	return { get_email_campaign_engagement: () => ({ data: rows, error: null }) };
}

describe('computeWaveSchedule', () => {
	it('spaces waves by the interval', () => {
		const start = new Date('2026-10-27T14:00:00.000Z');
		const times = computeWaveSchedule(5, start, 2, 60).map((date) => date.toISOString());
		expect(times).toEqual([
			'2026-10-27T14:00:00.000Z',
			'2026-10-27T14:00:00.000Z',
			'2026-10-27T15:00:00.000Z',
			'2026-10-27T15:00:00.000Z',
			'2026-10-27T16:00:00.000Z'
		]);
		expect(computeWaveSchedule(0, start, 2, 60)).toEqual([]);
	});
});

describe('validateForSending', () => {
	it('accepts empty templates when everyone has their own version', () => {
		expect(
			validateForSending({ subject_template: '', body_template: '' }, [
				recipient({ email: 'a@x.com', subject_override: 'yo', body_override: '<p>hey</p>' })
			])
		).toEqual([]);
	});

	it('names what is missing and unknown fill-ins', () => {
		const problems = validateForSending(
			{ subject_template: '', body_template: '<p>{{firstname}}</p>' },
			[
				recipient({ email: 'a@x.com' }),
				recipient({ email: 'b@x.com', subject_override: 'own subject' })
			]
		);
		expect(problems).toEqual([
			'1 person has no subject line.',
			'Fix the unknown fill-in {{firstname}} before sending.'
		]);
		expect(validateForSending({ subject_template: 's', body_template: 'b' }, [])).toEqual([
			'Add at least one person before sending.'
		]);
	});
});

describe('computeCounts', () => {
	it('tallies statuses and engagement', () => {
		const counts = computeCounts([
			{
				status: 'sent',
				included: true,
				override_source: 'tailored',
				replied_at: 'x',
				bounced_at: null,
				opened_at: 'x',
				first_clicked_at: 'x',
				unsubscribed_at: null
			},
			{
				status: 'queued',
				included: true,
				override_source: 'edited',
				replied_at: null,
				bounced_at: null,
				opened_at: null,
				first_clicked_at: null,
				unsubscribed_at: null
			},
			{
				status: 'draft',
				included: false,
				override_source: null,
				replied_at: null,
				bounced_at: 'x',
				opened_at: null,
				first_clicked_at: null,
				unsubscribed_at: 'x'
			}
		]);
		expect(counts).toMatchObject({
			total: 3,
			included: 2,
			sent: 1,
			queued: 1,
			draft: 1,
			opened: 1,
			clicked: 1,
			replied: 1,
			unsubscribed: 1,
			bounced: 1,
			tailored: 1,
			edited: 1
		});
	});
});

describe('syncRecipients', () => {
	it('keeps existing versions and labels, merges context, adds and removes people', async () => {
		const { db, client } = createFakeSupabase(
			audienceTables({
				users: [
					{
						id: 'u1',
						email: 'kept@example.com',
						name: 'Kept Person',
						created_at: '2025-07-01T00:00:00.000Z',
						last_visit: null,
						is_admin: false,
						deletion_status: null,
						onboarding_intent: null
					}
				],
				email_campaigns: [
					campaign({
						audience: {
							segments: [],
							people: [
								{ email: 'kept@example.com' },
								{ email: 'new@example.com', name: 'New Person' }
							],
							removed_emails: []
						}
					})
				],
				email_campaign_recipients: [
					recipient({
						id: 'r-kept',
						email: 'kept@example.com',
						segment: 'imported',
						subject_override: 'their subject',
						body_override: '<p>their body</p>',
						override_source: 'imported',
						included: false,
						context: { import_segment: 'tried_product_early', signup_month: 'stale' }
					}),
					recipient({ id: 'r-gone', email: 'gone@example.com' }),
					recipient({
						id: 'r-sent',
						email: 'sent@example.com',
						status: 'sent',
						sent_at: 'x'
					})
				]
			})
		);

		const result = await syncRecipients(client, 'c1', noSuppressions);
		expect(result).toMatchObject({ inserted: 1, updated: 1, removed: 1 });

		const rows = db.tables.email_campaign_recipients!;
		const kept = rows.find((row) => row.id === 'r-kept')!;
		expect(kept).toMatchObject({
			segment: 'imported',
			subject_override: 'their subject',
			body_override: '<p>their body</p>',
			override_source: 'imported',
			included: false,
			user_id: 'u1'
		});
		expect(kept.context).toMatchObject({
			import_segment: 'tried_product_early',
			signup_month: 'July 2025',
			has_account: true
		});
		expect(rows.find((row) => row.email === 'new@example.com')).toMatchObject({
			status: 'draft',
			segment: 'manual',
			first_name: 'New'
		});
		expect(rows.some((row) => row.id === 'r-gone')).toBe(false);
		expect(rows.some((row) => row.id === 'r-sent')).toBe(true);
	});

	it('refuses while sending', async () => {
		const { client } = createFakeSupabase(
			audienceTables({ email_campaigns: [campaign({ status: 'sending' })] })
		);
		await expect(syncRecipients(client, 'c1', noSuppressions)).rejects.toThrow(
			'Pause the campaign before you change who gets it.'
		);
	});
});

describe('queueCampaign', () => {
	let fake: ReturnType<typeof createFakeSupabase>;

	beforeEach(() => {
		fake = createFakeSupabase(
			{
				email_campaigns: [campaign()],
				email_campaign_recipients: [
					recipient({
						id: 'r1',
						email: 'a@x.com',
						first_name: 'A',
						created_at: '2026-10-25T01:00:00Z'
					}),
					recipient({
						id: 'r2',
						email: 'b@x.com',
						first_name: 'B',
						created_at: '2026-10-25T01:00:01Z'
					}),
					recipient({
						id: 'r3',
						email: 'c@x.com',
						first_name: 'C',
						created_at: '2026-10-25T01:00:02Z'
					}),
					recipient({
						id: 'r4',
						email: 'skip@x.com',
						included: false,
						created_at: '2026-10-25T01:00:03Z'
					})
				]
			},
			engagementRpc()
		);
	});

	it('queues everyone included in waves and starts sending', async () => {
		const detail = await queueCampaign(
			fake.client,
			'c1',
			{ starts_at: '2026-10-27T14:00:00.000Z', wave_size: 2, wave_interval_minutes: 60 },
			NOW
		);

		const byId = Object.fromEntries(
			fake.db.tables.email_campaign_recipients!.map((row) => [row.id, row])
		);
		expect(byId.r1).toMatchObject({
			status: 'queued',
			scheduled_for: '2026-10-27T14:00:00.000Z'
		});
		expect(byId.r2).toMatchObject({
			status: 'queued',
			scheduled_for: '2026-10-27T14:00:00.000Z'
		});
		expect(byId.r3).toMatchObject({
			status: 'queued',
			scheduled_for: '2026-10-27T15:00:00.000Z'
		});
		expect(byId.r4).toMatchObject({ status: 'draft', scheduled_for: null });
		expect(detail.campaign).toMatchObject({
			status: 'sending',
			starts_at: '2026-10-27T14:00:00.000Z',
			wave_size: 2,
			wave_interval_minutes: 60
		});
		expect(detail.counts.queued).toBe(3);
	});

	it('starts now when the start time is in the past or missing', async () => {
		await queueCampaign(
			fake.client,
			'c1',
			{ starts_at: '2020-01-01T00:00:00.000Z', wave_size: 10, wave_interval_minutes: 60 },
			NOW
		);
		expect(fake.db.tables.email_campaign_recipients![0]!.scheduled_for).toBe(NOW.toISOString());
	});

	it('refuses a second queue (double click, second tab)', async () => {
		await queueCampaign(fake.client, 'c1', { wave_size: 2, wave_interval_minutes: 60 }, NOW);
		fake.db.tables.email_campaign_recipients!.find((row) => row.id === 'r1')!.status = 'sent';
		await expect(
			queueCampaign(fake.client, 'c1', { wave_size: 2, wave_interval_minutes: 60 }, NOW)
		).rejects.toThrow();
		expect(
			fake.db.tables.email_campaign_recipients!.find((row) => row.id === 'r1')!.status
		).toBe('sent');
	});

	it('refuses an email with no subject', async () => {
		fake.db.tables.email_campaigns![0]!.subject_template = '';
		await expect(
			queueCampaign(fake.client, 'c1', { wave_size: 2, wave_interval_minutes: 60 }, NOW)
		).rejects.toThrow('Add a subject line before sending.');
	});

	it('refuses a campaign that already went out', async () => {
		fake.db.tables.email_campaigns![0]!.status = 'completed';
		await expect(
			queueCampaign(fake.client, 'c1', { wave_size: 2, wave_interval_minutes: 60 }, NOW)
		).rejects.toBeInstanceOf(CampaignError);
	});
});

describe('pause, resume, cancel', () => {
	it('resumes by sending the next wave now', async () => {
		const { db, client } = createFakeSupabase(
			{
				email_campaigns: [
					campaign({ status: 'paused', wave_size: 1, wave_interval_minutes: 15 })
				],
				email_campaign_recipients: [
					recipient({ id: 'r1', email: 'a@x.com', status: 'sent', sent_at: 'x' }),
					recipient({
						id: 'r2',
						email: 'b@x.com',
						status: 'queued',
						scheduled_for: '2026-10-20T00:00:00Z'
					}),
					recipient({
						id: 'r3',
						email: 'c@x.com',
						status: 'queued',
						scheduled_for: '2026-10-20T01:00:00Z'
					})
				]
			},
			engagementRpc()
		);

		const detail = await resumeCampaign(client, 'c1', NOW);
		const rows = db.tables.email_campaign_recipients!;
		expect(rows.find((row) => row.id === 'r2')?.scheduled_for).toBe('2026-10-25T12:00:00.000Z');
		expect(rows.find((row) => row.id === 'r3')?.scheduled_for).toBe('2026-10-25T12:15:00.000Z');
		expect(detail.campaign.status).toBe('sending');
	});

	it('keeps a scheduled start that is still ahead', async () => {
		const { db, client } = createFakeSupabase(
			{
				email_campaigns: [
					campaign({ status: 'paused', wave_size: 1, wave_interval_minutes: 15 })
				],
				email_campaign_recipients: [
					recipient({
						id: 'r2',
						email: 'b@x.com',
						status: 'queued',
						scheduled_for: '2026-10-27T13:00:00.000Z'
					}),
					recipient({
						id: 'r3',
						email: 'c@x.com',
						status: 'queued',
						scheduled_for: '2026-10-27T13:15:00.000Z'
					})
				]
			},
			engagementRpc()
		);

		await resumeCampaign(client, 'c1', NOW);
		const rows = db.tables.email_campaign_recipients!;
		expect(rows.find((row) => row.id === 'r2')?.scheduled_for).toBe('2026-10-27T13:00:00.000Z');
		expect(rows.find((row) => row.id === 'r3')?.scheduled_for).toBe('2026-10-27T13:15:00.000Z');
	});

	it('completes on resume when nothing is left', async () => {
		const { client } = createFakeSupabase(
			{
				email_campaigns: [campaign({ status: 'paused' })],
				email_campaign_recipients: [
					recipient({ id: 'r1', email: 'a@x.com', status: 'sent' })
				]
			},
			engagementRpc()
		);
		expect((await resumeCampaign(client, 'c1', NOW)).campaign.status).toBe('completed');
	});

	it('pauses only a sending campaign and cancel drops the queue', async () => {
		const { db, client } = createFakeSupabase(
			{
				email_campaigns: [campaign({ status: 'sending' })],
				email_campaign_recipients: [
					recipient({ id: 'r1', email: 'a@x.com', status: 'sent' }),
					recipient({ id: 'r2', email: 'b@x.com', status: 'queued', scheduled_for: 'x' })
				]
			},
			engagementRpc()
		);

		expect((await pauseCampaign(client, 'c1')).campaign.status).toBe('paused');
		await expect(pauseCampaign(client, 'c1')).rejects.toThrow(
			'Only a campaign that is sending can be paused.'
		);

		const detail = await cancelCampaign(client, 'c1', NOW);
		expect(detail.campaign.status).toBe('canceled');
		expect(db.tables.email_campaign_recipients!.map((row) => row.status)).toEqual([
			'sent',
			'canceled'
		]);
		await expect(deleteCampaign(client, 'c1')).rejects.toThrow('Only drafts can be deleted.');
	});
});

describe('retryRecipient', () => {
	it('re-queues a failed email now and reopens a finished campaign', async () => {
		const { db, client } = createFakeSupabase(
			{
				email_campaigns: [campaign({ status: 'completed', completed_at: 'x' })],
				email_campaign_recipients: [
					recipient({
						id: 'r1',
						email: 'a@x.com',
						status: 'failed',
						error_message: 'smtp down'
					})
				]
			},
			engagementRpc()
		);

		const view = await retryRecipient(client, 'c1', 'r1', NOW);
		expect(view).toMatchObject({ status: 'queued', error_message: null });
		expect(view.scheduled_for).toBe(NOW.toISOString());
		expect(db.tables.email_campaigns![0]).toMatchObject({
			status: 'sending',
			completed_at: null
		});
		await expect(retryRecipient(client, 'c1', 'r1', NOW)).rejects.toThrow(
			'Only failed emails can be retried.'
		);
	});
});

describe('updateRecipient', () => {
	it('marks hand edits, resets to the template, and moves in and out of a paused queue', async () => {
		const { db, client } = createFakeSupabase(
			{
				email_campaigns: [campaign({ status: 'paused' })],
				email_campaign_recipients: [
					recipient({ id: 'r1', email: 'a@x.com', status: 'queued', scheduled_for: 'x' })
				]
			},
			engagementRpc()
		);

		let view = await updateRecipient(client, 'c1', 'r1', { body_override: '<p>mine</p>' });
		expect(view).toMatchObject({ body_override: '<p>mine</p>', override_source: 'edited' });

		view = await updateRecipient(client, 'c1', 'r1', { reset: true });
		expect(view).toMatchObject({
			subject_override: null,
			body_override: null,
			override_source: null,
			tailor_status: 'none'
		});

		view = await updateRecipient(client, 'c1', 'r1', { included: false });
		expect(view).toMatchObject({ included: false, status: 'draft' });
		view = await updateRecipient(client, 'c1', 'r1', { included: true });
		expect(view).toMatchObject({ included: true, status: 'queued' });

		db.tables.email_campaigns![0]!.status = 'sending';
		await expect(updateRecipient(client, 'c1', 'r1', { included: false })).rejects.toThrow(
			'Pause the campaign before you change this person’s email.'
		);
	});
});

describe('createFollowUp', () => {
	it('starts a draft for people who did not reply, unsubscribe or bounce', async () => {
		const { db, client } = createFakeSupabase(
			audienceTables({
				email_campaigns: [campaign({ status: 'completed', name: 'Reactivation' })],
				email_campaign_recipients: [
					recipient({ id: 'r1', email: 'quiet@x.com', status: 'sent', email_id: 'e1' }),
					recipient({
						id: 'r2',
						email: 'replied@x.com',
						status: 'sent',
						replied_at: 'x',
						email_id: 'e2'
					}),
					recipient({ id: 'r3', email: 'unsub@x.com', status: 'sent', email_id: 'e3' }),
					recipient({
						id: 'r4',
						email: 'bounced@x.com',
						status: 'sent',
						bounced_at: 'x',
						email_id: 'e4'
					}),
					recipient({ id: 'r5', email: 'failed@x.com', status: 'failed' })
				]
			}),
			engagementRpc([
				{
					campaign_recipient_id: 'r3',
					campaign_id: 'c1',
					unsubscribed_at: 'x',
					open_count: 0,
					click_count: 0
				}
			])
		);

		const followUp = await createFollowUp(client, 'c1', 'admin-1', noSuppressions);
		expect(followUp).toMatchObject({ name: 'Follow-up: Reactivation', status: 'draft' });
		expect(followUp.audience.people.map((person) => person.email)).toEqual(['quiet@x.com']);
		const newRows = db.tables.email_campaign_recipients!.filter(
			(row) => row.campaign_id === followUp.id
		);
		expect(newRows.map((row) => row.email)).toEqual(['quiet@x.com']);
	});
});

describe('getCampaignDetail and listCampaigns', () => {
	it('joins engagement and last contact from other campaigns', async () => {
		const { client } = createFakeSupabase(
			audienceTables({
				email_campaigns: [
					campaign({ id: 'c1', status: 'completed' }),
					campaign({ id: 'c0', status: 'completed', updated_at: '2026-01-01T00:00:00Z' })
				],
				email_campaign_recipients: [
					recipient({
						id: 'r1',
						campaign_id: 'c1',
						email: 'a@x.com',
						status: 'sent',
						email_id: 'e1'
					}),
					recipient({
						id: 'r0',
						campaign_id: 'c0',
						email: 'a@x.com',
						status: 'sent',
						sent_at: '2026-10-22T00:00:00Z'
					})
				]
			}),
			engagementRpc([
				{
					campaign_recipient_id: 'r1',
					campaign_id: 'c1',
					opened_at: '2026-10-25T00:00:00Z',
					open_count: 2,
					first_clicked_at: null,
					click_count: 0,
					unsubscribed_at: null
				}
			])
		);

		const detail = await getCampaignDetail(client, 'c1', noSuppressions);
		expect(detail.recipients[0]).toMatchObject({
			opened_at: '2026-10-25T00:00:00Z',
			open_count: 2,
			last_contacted_at: '2026-10-22T00:00:00Z'
		});
		expect(detail.exclusions).toEqual([]);
		expect(detail.counts).toMatchObject({ sent: 1, opened: 1 });

		const summaries = await listCampaigns(client);
		expect(
			summaries.map((summary) => [summary.id, summary.counts.sent, summary.counts.opened])
		).toEqual([
			['c1', 1, 1],
			['c0', 1, 0]
		]);
	});
});

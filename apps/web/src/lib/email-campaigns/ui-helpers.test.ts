// apps/web/src/lib/email-campaigns/ui-helpers.test.ts
import { describe, expect, it } from 'vitest';
import type { CampaignCounts, CampaignRecipientView } from './types';
import {
	campaignStatusPill,
	checkSendReadiness,
	computeWavePlan,
	everyoneHasOwnVersion,
	followUpCount,
	formatInterval,
	parsePastedAddresses,
	scheduledForIndex
} from './ui-helpers';

function counts(overrides: Partial<CampaignCounts> = {}): CampaignCounts {
	return {
		total: 0,
		included: 0,
		draft: 0,
		queued: 0,
		sending: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
		canceled: 0,
		opened: 0,
		clicked: 0,
		replied: 0,
		unsubscribed: 0,
		bounced: 0,
		tailored: 0,
		edited: 0,
		...overrides
	};
}

function person(overrides: Partial<CampaignRecipientView> = {}): CampaignRecipientView {
	return {
		id: overrides.id ?? 'r1',
		email: 'kay@example.com',
		name: 'Kay Dee',
		first_name: 'Kay',
		user_id: null,
		beta_signup_id: null,
		segment: 'no_project',
		context: {},
		subject_override: null,
		body_override: null,
		override_source: null,
		tailor_status: 'none',
		tailor_error: null,
		included: true,
		status: 'draft',
		skip_reason: null,
		scheduled_for: null,
		sent_at: null,
		replied_at: null,
		bounced_at: null,
		error_message: null,
		opened_at: null,
		open_count: 0,
		first_clicked_at: null,
		click_count: 0,
		unsubscribed_at: null,
		last_contacted_at: null,
		...overrides
	};
}

describe('computeWavePlan', () => {
	it('matches the server spacing: start + floor(i / size) * interval', () => {
		const start = new Date('2026-10-27T13:00:00.000Z');
		const plan = computeWavePlan({
			count: 83,
			startAt: start,
			waveSize: 20,
			intervalMinutes: 60
		});
		expect(plan.waves).toBe(5);
		expect(plan.firstAt).toBe('2026-10-27T13:00:00.000Z');
		expect(plan.lastAt).toBe('2026-10-27T17:00:00.000Z');
		expect(scheduledForIndex(82, start, 20, 60).toISOString()).toBe(plan.lastAt);
		expect(scheduledForIndex(19, start, 20, 60).toISOString()).toBe(plan.firstAt);
		expect(scheduledForIndex(20, start, 20, 60).toISOString()).toBe('2026-10-27T14:00:00.000Z');
	});

	it('handles nobody and one wave', () => {
		const start = new Date('2026-10-27T13:00:00.000Z');
		expect(
			computeWavePlan({ count: 0, startAt: start, waveSize: 20, intervalMinutes: 60 }).waves
		).toBe(0);
		const single = computeWavePlan({
			count: 6,
			startAt: start,
			waveSize: 20,
			intervalMinutes: 60
		});
		expect(single.waves).toBe(1);
		expect(single.lastAt).toBe(single.firstAt);
	});
});

describe('formatInterval', () => {
	it('reads naturally', () => {
		expect(formatInterval(15)).toBe('15 minutes');
		expect(formatInterval(60)).toBe('1 hour');
		expect(formatInterval(240)).toBe('4 hours');
		expect(formatInterval(1440)).toBe('1 day');
		expect(formatInterval(90)).toBe('1 h 30 min');
	});
});

describe('campaignStatusPill', () => {
	const now = new Date('2026-10-25T12:00:00.000Z');

	it('shows a scheduled time before the first wave', () => {
		const pill = campaignStatusPill(
			{
				status: 'sending',
				next_send_at: '2026-10-27T13:00:00.000Z',
				starts_at: '2026-10-27T13:00:00.000Z',
				counts: counts({ included: 83, queued: 83 })
			},
			now
		);
		expect(pill.label.startsWith('Scheduled for')).toBe(true);
		expect(pill.tone).toBe('info');
	});

	it('shows progress while sending', () => {
		const pill = campaignStatusPill(
			{
				status: 'sending',
				next_send_at: '2026-10-25T13:00:00.000Z',
				starts_at: null,
				counts: counts({ included: 83, sent: 12, queued: 71 })
			},
			now
		);
		expect(pill.label).toBe('Sending · 12 of 83');
	});

	it('labels the end states', () => {
		const base = { next_send_at: null, starts_at: null, counts: counts() };
		expect(campaignStatusPill({ ...base, status: 'draft' }, now).label).toBe('Draft');
		expect(campaignStatusPill({ ...base, status: 'paused' }, now).label).toBe('Paused');
		expect(campaignStatusPill({ ...base, status: 'completed' }, now).label).toBe('Done');
		expect(campaignStatusPill({ ...base, status: 'canceled' }, now).label).toBe('Canceled');
	});
});

describe('checkSendReadiness', () => {
	it('blocks an empty template', () => {
		const result = checkSendReadiness({ subject_template: '', body_template: '' }, [person()]);
		expect(result.ready).toBe(false);
		expect(result.problems).toContain('Add a subject line.');
		expect(result.problems).toContain('Write the email body.');
	});

	it('is ready for imported drafts with an empty template', () => {
		const result = checkSendReadiness({ subject_template: '', body_template: '' }, [
			person({
				subject_override: 'your buildos signup',
				body_override: '<p>Hi Kay, it is ready now.</p>',
				override_source: 'imported',
				segment: 'imported'
			})
		]);
		expect(result).toEqual({ ready: true, problems: [], includedCount: 1 });
	});

	it('names unknown fill-ins', () => {
		const result = checkSendReadiness(
			{ subject_template: 'hi {{firstname}}', body_template: '<p>Hello</p>' },
			[person()]
		);
		expect(result.ready).toBe(false);
		expect(result.problems.join(' ')).toContain('{{firstname}}');
	});

	it('ignores people who are skipped', () => {
		const result = checkSendReadiness({ subject_template: 'hi', body_template: '<p>yo</p>' }, [
			person({ included: false })
		]);
		expect(result.includedCount).toBe(0);
		expect(result.ready).toBe(false);
	});
});

describe('everyoneHasOwnVersion', () => {
	it('is true for imported campaigns even before recipients load', () => {
		expect(everyoneHasOwnVersion('import:beta-reactivation-2026-07', [])).toBe(true);
	});

	it('is true only when every included person has a body', () => {
		expect(
			everyoneHasOwnVersion('admin', [
				person({ id: 'a', body_override: '<p>x</p>' }),
				person({ id: 'b', included: false })
			])
		).toBe(true);
		expect(
			everyoneHasOwnVersion('admin', [
				person({ id: 'a', body_override: '<p>x</p>' }),
				person({ id: 'b' })
			])
		).toBe(false);
		expect(everyoneHasOwnVersion('admin', [])).toBe(false);
	});
});

describe('followUpCount', () => {
	it('counts sent people with no reply, unsubscribe, or bounce', () => {
		expect(
			followUpCount([
				person({ id: '1', status: 'sent' }),
				person({ id: '2', status: 'sent', replied_at: '2026-10-26T00:00:00Z' }),
				person({ id: '3', status: 'sent', unsubscribed_at: '2026-10-26T00:00:00Z' }),
				person({ id: '4', status: 'sent', bounced_at: '2026-10-26T00:00:00Z' }),
				person({ id: '5', status: 'queued' })
			])
		).toBe(1);
	});
});

describe('parsePastedAddresses', () => {
	it('pulls addresses out of messy paste', () => {
		const result = parsePastedAddresses(
			'Kay <Kay@Example.com>, jack@example.com\nnot-an-address, bad@, mailto:jill@example.org; jack@example.com'
		);
		expect(result.valid).toEqual(['kay@example.com', 'jack@example.com', 'jill@example.org']);
		expect(result.invalid).toEqual(['bad@']);
	});
});

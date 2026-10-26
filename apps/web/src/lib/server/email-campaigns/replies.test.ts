// apps/web/src/lib/server/email-campaigns/replies.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('imapflow', () => ({
	ImapFlow: vi.fn(function () {
		throw new Error('tests must inject a fake mailbox; never open real IMAP');
	})
}));

import { FakeDb } from './fake-db.test-helper';
import {
	checkCampaignReplies,
	isPermanentFailureNotice,
	matchBounces,
	matchReply,
	normalizeMessageId,
	pickCandidates,
	type InboundEnvelope,
	type ReplyCandidate,
	type ReplyMailbox,
	isAutoSubmittedHeaders,
	matchUnsubscribe
} from './replies';

const NOW = new Date('2026-10-27T14:00:00.000Z');

function candidate(id: string, overrides: Partial<ReplyCandidate> = {}): ReplyCandidate {
	return {
		id,
		campaign_id: 'campaign-1',
		email: `${id}@example.com`,
		sent_at: '2026-10-26T10:00:00.000Z',
		message_id: `<${id}-msg@build-os.com>`,
		...overrides
	};
}

function envelope(overrides: Partial<InboundEnvelope> = {}): InboundEnvelope {
	return {
		from: ['r1@example.com'],
		date: new Date('2026-10-26T12:00:00.000Z'),
		inReplyTo: null,
		subject: 'Re: hi',
		...overrides
	};
}

describe('matchReply', () => {
	it('finds the earliest message from that exact address after the send', () => {
		const match = matchReply(candidate('r1'), [
			envelope({ date: new Date('2026-10-27T09:00:00.000Z') }),
			envelope({ date: new Date('2026-10-26T12:00:00.000Z') }),
			envelope({ date: new Date('2026-10-25T12:00:00.000Z') }),
			envelope({
				from: ['r1@example.com.evil.test'],
				date: new Date('2026-10-26T11:00:00.000Z')
			})
		]);
		expect(match).toEqual({ recipientId: 'r1', repliedAt: '2026-10-26T12:00:00.000Z' });
	});

	it('matches addresses case-insensitively and ignores older mail', () => {
		expect(
			matchReply(candidate('r1'), [envelope({ from: ['R1@Example.com'] })])
		).not.toBeNull();
		expect(
			matchReply(candidate('r1'), [envelope({ date: new Date('2026-10-20T00:00:00.000Z') })])
		).toBeNull();
		expect(matchReply(candidate('r1'), [envelope({ date: null })])).toBeNull();
	});

	it('accepts an answer to our message even when its clock is off', () => {
		const match = matchReply(candidate('r1'), [
			envelope({
				date: new Date('2026-10-26T09:59:00.000Z'),
				inReplyTo: '<R1-MSG@build-os.com>'
			})
		]);
		expect(match?.repliedAt).toBe('2026-10-26T09:59:00.000Z');
	});
});

describe('bounces', () => {
	it('only treats Gmail permanent-failure notices as bounces, matched by In-Reply-To', () => {
		const failure = envelope({
			from: ['mailer-daemon@googlemail.com'],
			subject: 'Delivery Status Notification (Failure)',
			inReplyTo: '<r2-msg@build-os.com>'
		});
		const delay = envelope({
			from: ['mailer-daemon@googlemail.com'],
			subject: 'Delivery Status Notification (Delay)',
			inReplyTo: '<r1-msg@build-os.com>'
		});
		expect(isPermanentFailureNotice(failure)).toBe(true);
		expect(isPermanentFailureNotice(delay)).toBe(false);
		expect(matchBounces([candidate('r1'), candidate('r2')], [failure, delay])).toEqual([
			{
				recipientId: 'r2',
				campaignId: 'campaign-1',
				email: 'r2@example.com',
				bouncedAt: '2026-10-26T12:00:00.000Z'
			}
		]);
	});

	it('normalizes message ids', () => {
		expect(normalizeMessageId(' <ABC@x> ')).toBe('abc@x');
		expect(normalizeMessageId(null)).toBeNull();
	});
});

describe('pickCandidates', () => {
	it('caps distinct addresses but keeps every row for an included address', () => {
		const rows = [
			candidate('a1', { email: 'a@example.com' }),
			candidate('b1', { email: 'b@example.com' }),
			candidate('a2', { email: 'a@example.com' }),
			candidate('c1', { email: 'c@example.com' })
		];
		expect(pickCandidates(rows, 2).map((row) => row.id)).toEqual(['a1', 'b1', 'a2']);
	});
});

describe('checkCampaignReplies', () => {
	function recipientRow(id: string, overrides: Record<string, any> = {}) {
		return {
			...candidate(id),
			status: 'sent',
			replied_at: null,
			bounced_at: null,
			reply_checked_at: null,
			...overrides
		};
	}

	function mailbox(
		byAddress: Record<string, InboundEnvelope[]>,
		bounces: InboundEnvelope[] = []
	) {
		const fake: ReplyMailbox & { closed: boolean; searched: string[] } = {
			closed: false,
			searched: [],
			async envelopesFrom(address) {
				fake.searched.push(address);
				return byAddress[address] ?? [];
			},
			async bounceEnvelopes() {
				return bounces;
			},
			async close() {
				fake.closed = true;
			}
		};
		return fake;
	}

	it('marks replies and bounces, suppresses bounced addresses, and stamps every checked row', async () => {
		const db = new FakeDb({
			email_campaign_recipients: [
				recipientRow('r1'),
				recipientRow('r2'),
				recipientRow('r3'),
				recipientRow('old', { sent_at: '2026-08-01T00:00:00.000Z' }),
				recipientRow('done', { replied_at: '2026-10-26T11:00:00.000Z' })
			]
		});
		const box = mailbox({ 'r1@example.com': [envelope()] }, [
			envelope({
				from: ['mailer-daemon@googlemail.com'],
				subject: 'Delivery Status Notification (Failure)',
				inReplyTo: '<r2-msg@build-os.com>'
			})
		]);

		const summary = await checkCampaignReplies({
			supabase: db as any,
			password: 'app-password',
			now: NOW,
			openMailbox: async () => box
		});

		expect(summary).toMatchObject({
			checkedAddresses: 3,
			checkedRecipients: 3,
			repliesFound: 1,
			bouncesFound: 1
		});
		expect(box.searched.sort()).toEqual(['r1@example.com', 'r2@example.com', 'r3@example.com']);
		expect(box.closed).toBe(true);

		const rows = Object.fromEntries(
			db.table('email_campaign_recipients').map((row) => [row.id, row])
		);
		expect(rows.r1).toMatchObject({ replied_at: '2026-10-26T12:00:00.000Z' });
		expect(rows.r2).toMatchObject({ bounced_at: '2026-10-26T12:00:00.000Z', replied_at: null });
		expect(rows.r3!.reply_checked_at).toBe(NOW.toISOString());
		expect(rows.old!.reply_checked_at).toBeNull();
		expect(rows.done!.reply_checked_at).toBeNull();
		expect(db.rpcCalls).toEqual([
			{
				name: 'upsert_email_suppression',
				args: expect.objectContaining({
					p_email: 'r2@example.com',
					p_scope: 'all',
					p_reason: 'hard_bounce',
					p_source: 'provider_webhook'
				})
			}
		]);
	});

	it('does nothing without the Gmail app password', async () => {
		const openMailbox = vi.fn();
		const summary = await checkCampaignReplies({
			supabase: new FakeDb() as any,
			password: '',
			openMailbox
		});
		expect(summary.skipped).toBe('no_credentials');
		expect(openMailbox).not.toHaveBeenCalled();
	});

	it('does not open the mailbox when nobody is waiting on a reply', async () => {
		const openMailbox = vi.fn();
		const summary = await checkCampaignReplies({
			supabase: new FakeDb({ email_campaign_recipients: [] }) as any,
			password: 'app-password',
			now: NOW,
			openMailbox
		});
		expect(summary.skipped).toBe('no_candidates');
		expect(openMailbox).not.toHaveBeenCalled();
	});

	it('closes the mailbox even when a search fails', async () => {
		const db = new FakeDb({ email_campaign_recipients: [recipientRow('r1')] });
		const box = mailbox({});
		box.envelopesFrom = async () => {
			throw new Error('IMAP timeout');
		};
		await expect(
			checkCampaignReplies({
				supabase: db as any,
				password: 'app-password',
				now: NOW,
				openMailbox: async () => box
			})
		).rejects.toThrow('IMAP timeout');
		expect(box.closed).toBe(true);
	});
});

describe('auto-replies, mailto unsubscribes, and reply attribution', () => {
	const candidate = {
		id: 'r1',
		campaign_id: 'c1',
		email: 'kay@example.com',
		sent_at: '2026-10-26T15:00:00.000Z',
		message_id: '<ours-1@build-os.com>',
		email_id: 'e1'
	};
	const later = new Date('2026-10-26T16:00:00.000Z');

	it('ignores out-of-office responders', () => {
		expect(isAutoSubmittedHeaders('Auto-Submitted: auto-replied\r\nPrecedence: bulk\r\n')).toBe(
			true
		);
		expect(isAutoSubmittedHeaders('X-Autoreply: yes\r\n')).toBe(true);
		expect(isAutoSubmittedHeaders('Auto-Submitted: no\r\n')).toBe(false);
		expect(isAutoSubmittedHeaders('')).toBe(false);
		expect(
			matchReply(candidate, [
				{
					from: ['kay@example.com'],
					date: later,
					inReplyTo: null,
					subject: 'Away',
					autoSubmitted: true
				}
			])
		).toBeNull();
	});

	it('treats a mailto unsubscribe as an unsubscribe, not a reply', () => {
		const envelopes = [
			{ from: ['kay@example.com'], date: later, inReplyTo: null, subject: 'unsubscribe' }
		];
		expect(matchReply(candidate, envelopes)).toBeNull();
		expect(matchUnsubscribe(candidate, envelopes)).toEqual({
			recipientId: 'r1',
			campaignId: 'c1',
			email: 'kay@example.com',
			emailId: 'e1',
			requestedAt: later.toISOString()
		});
	});

	it('credits a reply to the email it answers', () => {
		const envelopes = [
			{
				from: ['kay@example.com'],
				date: later,
				inReplyTo: '<ours-2@build-os.com>',
				subject: 'Re: hi'
			}
		];
		expect(matchReply(candidate, envelopes, new Set(['ours-2@build-os.com']))).toBeNull();
		expect(matchReply(candidate, envelopes)).not.toBeNull();
	});
});

// apps/web/src/lib/server/email-campaigns/replies.ts
// Marks campaign recipients who replied (and whose email bounced) by reading the
// dj@build-os.com mailbox over IMAP with the Gmail app password the sender
// already uses. DJ approved this on 2026-10-25.
//
// Privacy: only envelopes (from, date, in-reply-to, subject) and four
// auto-reply headers are fetched. Message bodies are never downloaded.
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md (Server → replies.ts)

import { ImapFlow } from 'imapflow';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type Client = SupabaseClient<Database>;

export const IMAP_HOST = 'imap.gmail.com';
export const IMAP_USER = 'dj@build-os.com';
export const DEFAULT_MAX_ADDRESSES = 60;
export const REPLY_LOOKBACK_DAYS = 45;
export const DEFAULT_REPLY_BUDGET_MS = 40_000;

export interface ReplyCandidate {
	id: string;
	campaign_id: string;
	email: string;
	sent_at: string;
	message_id: string | null;
	email_id?: string | null;
}

/** Just what we read from a message: envelope fields, never the body. */
export interface InboundEnvelope {
	from: string[];
	date: Date | null;
	inReplyTo: string | null;
	subject: string | null;
	/** Out-of-office / vacation responders mark themselves (RFC 3834 Auto-Submitted, X-Autoreply, Precedence). */
	autoSubmitted?: boolean;
}

export interface UnsubscribeMatch {
	recipientId: string;
	campaignId: string;
	email: string;
	emailId: string | null;
	requestedAt: string;
}

export interface ReplyMatch {
	recipientId: string;
	repliedAt: string;
}

export interface BounceMatch {
	recipientId: string;
	campaignId: string;
	email: string;
	bouncedAt: string;
}

export interface ReplyCheckSummary {
	checkedAddresses: number;
	checkedRecipients: number;
	repliesFound: number;
	bouncesFound: number;
	unsubscribesFound: number;
	skipped?: 'no_credentials' | 'no_candidates';
	error?: string;
}

/** Minimal mailbox surface, so tests can stand in for IMAP. */
export interface ReplyMailbox {
	/** Envelopes of messages from `address` received on or after `since`. */
	envelopesFrom(address: string, since: Date): Promise<InboundEnvelope[]>;
	/** Envelopes of mailer-daemon notices received on or after `since`. */
	bounceEnvelopes(since: Date): Promise<InboundEnvelope[]>;
	close(): Promise<void>;
}

export function normalizeMessageId(value: string | null | undefined): string | null {
	const trimmed = value?.trim().replace(/^<|>$/g, '').trim().toLowerCase();
	return trimmed || null;
}

function toDate(value: Date | string | undefined | null): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The earliest message from this person after their campaign email went out
 * (or one that answers that email by In-Reply-To). Exact address match only.
 */
/**
 * Our List-Unsubscribe header offers mailto:dj@build-os.com?subject=unsubscribe.
 * Mail apps send exactly that subject; it is our own token, not someone's prose.
 */
export function isUnsubscribeRequest(envelope: InboundEnvelope): boolean {
	return envelope.subject?.trim().toLowerCase() === 'unsubscribe';
}

export function matchReply(
	candidate: ReplyCandidate,
	envelopes: InboundEnvelope[],
	otherMessageIds: Set<string> = new Set()
): ReplyMatch | null {
	const sentAt = new Date(candidate.sent_at).getTime();
	const address = candidate.email.trim().toLowerCase();
	const messageId = normalizeMessageId(candidate.message_id);
	let earliest: Date | null = null;

	for (const envelope of envelopes) {
		const fromThem = envelope.from.some((from) => from.trim().toLowerCase() === address);
		if (!fromThem || !envelope.date) continue;
		if (envelope.autoSubmitted || isUnsubscribeRequest(envelope)) continue;
		const inReplyTo = normalizeMessageId(envelope.inReplyTo);
		// A reply that names another of our emails belongs to that email.
		if (inReplyTo && inReplyTo !== messageId && otherMessageIds.has(inReplyTo)) continue;
		const answersOurs = messageId !== null && inReplyTo === messageId;
		if (envelope.date.getTime() <= sentAt && !answersOurs) continue;
		if (!earliest || envelope.date < earliest) earliest = envelope.date;
	}

	return earliest ? { recipientId: candidate.id, repliedAt: earliest.toISOString() } : null;
}

/** Mailto unsubscribe requests (see isUnsubscribeRequest) sent after the campaign email. */
export function matchUnsubscribe(
	candidate: ReplyCandidate,
	envelopes: InboundEnvelope[]
): UnsubscribeMatch | null {
	const sentAt = new Date(candidate.sent_at).getTime();
	const address = candidate.email.trim().toLowerCase();
	for (const envelope of envelopes) {
		if (!envelope.date || envelope.date.getTime() <= sentAt) continue;
		if (!isUnsubscribeRequest(envelope)) continue;
		if (!envelope.from.some((from) => from.trim().toLowerCase() === address)) continue;
		return {
			recipientId: candidate.id,
			campaignId: candidate.campaign_id,
			email: address,
			emailId: candidate.email_id ?? null,
			requestedAt: envelope.date.toISOString()
		};
	}
	return null;
}

const AUTO_REPLY_PRECEDENCE = new Set(['auto_reply', 'bulk', 'junk', 'list']);

/** Reads the four auto-reply headers from a raw header block (structured format). */
export function isAutoSubmittedHeaders(raw: string | null | undefined): boolean {
	if (!raw) return false;
	const headers = new Map<string, string>();
	for (const line of raw.replace(/\r\n[ \t]+/g, ' ').split(/\r?\n/)) {
		const colon = line.indexOf(':');
		if (colon <= 0) continue;
		headers.set(
			line.slice(0, colon).trim().toLowerCase(),
			line
				.slice(colon + 1)
				.trim()
				.toLowerCase()
		);
	}
	const autoSubmitted = headers.get('auto-submitted');
	if (autoSubmitted && autoSubmitted !== 'no') return true;
	if (headers.has('x-autoreply') || headers.has('x-autorespond')) return true;
	return AUTO_REPLY_PRECEDENCE.has(headers.get('precedence') ?? '');
}

/**
 * Gmail's own "Delivery Status Notification (Failure)" notices are machine
 * generated. The subject marker below is part of that format, not a reading of
 * anyone's words; delay notices ("(Delay)") are ignored on purpose.
 */
export function isPermanentFailureNotice(envelope: InboundEnvelope): boolean {
	return Boolean(envelope.subject && envelope.subject.includes('(Failure)'));
}

export function matchBounces(
	candidates: ReplyCandidate[],
	notices: InboundEnvelope[]
): BounceMatch[] {
	const byMessageId = new Map<string, ReplyCandidate>();
	for (const candidate of candidates) {
		const id = normalizeMessageId(candidate.message_id);
		if (id) byMessageId.set(id, candidate);
	}

	const matches = new Map<string, BounceMatch>();
	for (const notice of notices) {
		if (!isPermanentFailureNotice(notice)) continue;
		const target = byMessageId.get(normalizeMessageId(notice.inReplyTo) ?? '');
		if (!target || matches.has(target.id)) continue;
		matches.set(target.id, {
			recipientId: target.id,
			campaignId: target.campaign_id,
			email: target.email,
			bouncedAt: (notice.date ?? new Date()).toISOString()
		});
	}
	return [...matches.values()];
}

/** Oldest-checked first, up to `maxAddresses` distinct addresses. */
export function pickCandidates(rows: ReplyCandidate[], maxAddresses: number): ReplyCandidate[] {
	const addresses = new Set<string>();
	const picked: ReplyCandidate[] = [];
	for (const row of rows) {
		if (!addresses.has(row.email)) {
			if (addresses.size >= maxAddresses) continue;
			addresses.add(row.email);
		}
		picked.push(row);
	}
	return picked;
}

function envelopeFromImap(
	envelope: {
		from?: Array<{ address?: string }>;
		date?: Date | string;
		inReplyTo?: string;
		subject?: string;
	},
	rawHeaders?: Buffer | string | null
): InboundEnvelope {
	return {
		autoSubmitted: isAutoSubmittedHeaders(rawHeaders ? rawHeaders.toString() : null),
		from: (envelope.from ?? [])
			.map((entry) => entry.address?.trim().toLowerCase() ?? '')
			.filter(Boolean),
		date: toDate(envelope.date),
		inReplyTo: envelope.inReplyTo ?? null,
		subject: envelope.subject ?? null
	};
}

/** Opens the All Mail folder read-only (falls back to INBOX). */
export async function openGmailMailbox(password: string): Promise<ReplyMailbox> {
	const client = new ImapFlow({
		host: IMAP_HOST,
		port: 993,
		secure: true,
		auth: { user: IMAP_USER, pass: password },
		logger: false,
		connectionTimeout: 15_000,
		greetingTimeout: 10_000,
		socketTimeout: 30_000
	});
	// imapflow emits 'error' after connect (e.g. socket timeout); unhandled, that
	// would crash the function.
	client.on('error', (error: unknown) => {
		console.error('Campaign reply IMAP error:', error instanceof Error ? error.message : error);
	});

	let lock: { release: () => void };
	try {
		await client.connect();
		const boxes = await client.list();
		const allMail =
			boxes.find((box) => box.specialUse === '\\All')?.path ??
			boxes.find((box) => box.path === '[Gmail]/All Mail')?.path ??
			'INBOX';
		lock = await client.getMailboxLock(allMail, { readOnly: true });
	} catch (error) {
		client.close();
		throw error;
	}

	async function fetchEnvelopes(query: {
		from: string;
		since: Date;
	}): Promise<InboundEnvelope[]> {
		const uids = await client.search(query, { uid: true });
		if (!uids || uids.length === 0) return [];
		const envelopes: InboundEnvelope[] = [];
		const fields = {
			envelope: true,
			headers: ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence']
		};
		for await (const message of client.fetch(uids, fields, { uid: true })) {
			if (message.envelope)
				envelopes.push(envelopeFromImap(message.envelope, message.headers));
		}
		return envelopes;
	}

	return {
		envelopesFrom: (address, since) => fetchEnvelopes({ from: address, since }),
		bounceEnvelopes: (since) => fetchEnvelopes({ from: 'mailer-daemon', since }),
		async close() {
			lock.release();
			await client.logout().catch(() => client.close());
		}
	};
}

export async function checkCampaignReplies({
	supabase,
	password,
	now = new Date(),
	maxAddresses = DEFAULT_MAX_ADDRESSES,
	budgetMs = DEFAULT_REPLY_BUDGET_MS,
	openMailbox = openGmailMailbox,
	clock = () => Date.now()
}: {
	supabase: Client;
	password: string | null | undefined;
	now?: Date;
	maxAddresses?: number;
	budgetMs?: number;
	openMailbox?: (password: string) => Promise<ReplyMailbox>;
	clock?: () => number;
}): Promise<ReplyCheckSummary> {
	const summary: ReplyCheckSummary = {
		checkedAddresses: 0,
		checkedRecipients: 0,
		repliesFound: 0,
		bouncesFound: 0,
		unsubscribesFound: 0
	};
	if (!password) return { ...summary, skipped: 'no_credentials' };

	const startedAt = clock();
	const lookback = new Date(now.getTime() - REPLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

	const { data: rows, error } = await supabase
		.from('email_campaign_recipients')
		.select('id, campaign_id, email, sent_at, message_id, email_id')
		.eq('status', 'sent')
		.is('replied_at', null)
		.gte('sent_at', lookback.toISOString())
		.order('reply_checked_at', { ascending: true, nullsFirst: true })
		.limit(maxAddresses * 3);
	if (error) throw new Error(`Failed to load reply candidates: ${error.message}`);

	const candidates = pickCandidates(
		((rows ?? []) as ReplyCandidate[]).filter((row) => row.sent_at),
		maxAddresses
	);
	if (candidates.length === 0) return { ...summary, skipped: 'no_candidates' };

	const mailbox = await openMailbox(password);
	const checkedIds: string[] = [];
	const replies: ReplyMatch[] = [];
	const unsubscribes: UnsubscribeMatch[] = [];
	let bounces: BounceMatch[] = [];

	try {
		const byAddress = new Map<string, ReplyCandidate[]>();
		for (const candidate of candidates) {
			const list = byAddress.get(candidate.email) ?? [];
			list.push(candidate);
			byAddress.set(candidate.email, list);
		}

		for (const [address, group] of byAddress) {
			if (clock() - startedAt >= budgetMs) break;
			const since = new Date(
				Math.min(...group.map((candidate) => new Date(candidate.sent_at).getTime()))
			);
			const envelopes = await mailbox.envelopesFrom(address, since);
			const groupMessageIds = new Set(
				group
					.map((candidate) => normalizeMessageId(candidate.message_id))
					.filter((id): id is string => Boolean(id))
			);
			for (const candidate of group) {
				const own = normalizeMessageId(candidate.message_id);
				const others = new Set([...groupMessageIds].filter((id) => id !== own));
				const match = matchReply(candidate, envelopes, others);
				if (match) replies.push(match);
				const unsubscribe = matchUnsubscribe(candidate, envelopes);
				if (unsubscribe) unsubscribes.push(unsubscribe);
				checkedIds.push(candidate.id);
			}
			summary.checkedAddresses++;
		}

		if (clock() - startedAt < budgetMs) {
			const earliest = new Date(
				Math.min(...candidates.map((candidate) => new Date(candidate.sent_at).getTime()))
			);
			bounces = matchBounces(candidates, await mailbox.bounceEnvelopes(earliest));
		}
	} finally {
		await mailbox.close();
	}

	for (const reply of replies) {
		await supabase
			.from('email_campaign_recipients')
			.update({ replied_at: reply.repliedAt })
			.eq('id', reply.recipientId)
			.is('replied_at', null);
	}

	// One request per address is enough; every campaign row for it shows unsubscribed.
	const unsubscribedAddresses = new Set<string>();
	for (const unsubscribe of unsubscribes) {
		if (!unsubscribedAddresses.has(unsubscribe.email)) {
			unsubscribedAddresses.add(unsubscribe.email);
			await (supabase as any).rpc('upsert_email_suppression', {
				p_email: unsubscribe.email,
				p_scope: 'marketing',
				p_reason: 'unsubscribe',
				p_source: 'list_header',
				p_metadata: {
					detected_by: 'imap_mailto_unsubscribe',
					campaign_id: unsubscribe.campaignId,
					campaign_recipient_id: unsubscribe.recipientId
				}
			});
		}
		if (unsubscribe.emailId) {
			await supabase.from('email_tracking_events').insert({
				email_id: unsubscribe.emailId,
				event_type: 'unsubscribed',
				event_data: { source: 'mailto', campaign_recipient_id: unsubscribe.recipientId },
				timestamp: unsubscribe.requestedAt
			});
		}
	}

	for (const bounce of bounces) {
		await supabase
			.from('email_campaign_recipients')
			.update({ bounced_at: bounce.bouncedAt })
			.eq('id', bounce.recipientId)
			.is('bounced_at', null);
		await (supabase as any).rpc('upsert_email_suppression', {
			p_email: bounce.email,
			p_scope: 'all',
			p_reason: 'hard_bounce',
			p_source: 'provider_webhook',
			p_metadata: {
				detected_by: 'imap_delivery_status_notice',
				campaign_id: bounce.campaignId,
				campaign_recipient_id: bounce.recipientId
			}
		});
	}

	if (checkedIds.length > 0) {
		await supabase
			.from('email_campaign_recipients')
			.update({ reply_checked_at: now.toISOString() })
			.in('id', checkedIds);
	}

	summary.checkedRecipients = checkedIds.length;
	summary.repliesFound = replies.length;
	summary.unsubscribesFound = unsubscribes.length;
	summary.bouncesFound = bounces.length;
	return summary;
}

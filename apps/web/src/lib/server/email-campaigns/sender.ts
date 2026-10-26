// apps/web/src/lib/server/email-campaigns/sender.ts
// Drains the email campaign queue. Runs once a minute from /api/cron/email-campaigns.
// Spec: docs/specs/EMAIL_CAMPAIGNS_2026-10-25.md (Server → sender.ts)
//
// Safety rules:
//   - A row is only sent after claim_email_campaign_sends moved it to `sending`
//     (SKIP LOCKED), so overlapping cron runs never send the same row twice.
//   - A `sending` row whose lease expired is marked failed, never re-sent: the
//     email may have gone out before the process died.
//   - Suppression is re-checked right before each send, because someone can
//     unsubscribe between queueing and their wave.

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

import { EmailService, type EmailData } from '$lib/services/email-service';
import {
	firstNameFrom,
	renderCampaignEmail,
	renderCampaignEmailDocument
} from '$lib/email-campaigns/render';
import type { RecipientContext, RecipientSegment } from '$lib/email-campaigns/types';

type Client = SupabaseClient<Database>;
type RecipientRow = Database['public']['Tables']['email_campaign_recipients']['Row'];
type CampaignRowDb = Database['public']['Tables']['email_campaigns']['Row'];

export type CampaignEmailSender = {
	sendEmail: (data: EmailData) => ReturnType<EmailService['sendEmail']>;
};

export const INTERRUPTED_SEND_MESSAGE =
	'Interrupted mid-send — it may have gone out. Check Sent mail before retrying.';
export const EMPTY_EMAIL_MESSAGE = 'Nothing to send: the subject or body is empty.';

export const DEFAULT_PER_RUN_LIMIT = 20;
export const DEFAULT_BUDGET_MS = 40_000;
export const DEFAULT_DAILY_CAP = 400;
export const DEFAULT_LEASE_SECONDS = 120;

export interface ProcessDueCampaignSendsOptions {
	supabase: Client;
	now?: Date;
	/** Stop starting new sends after this much wall time (claimed leftovers go back to queued). */
	budgetMs?: number;
	perRunLimit?: number;
	/** Max campaign sends in any rolling 24 h (Gmail daily limits are shared with daily briefs). */
	dailyCap?: number;
	leaseSeconds?: number;
	emailService?: CampaignEmailSender;
	/** Milliseconds clock for the time budget (tests). */
	clock?: () => number;
}

export interface CampaignSendError {
	recipientId: string;
	error: string;
}

export interface CampaignSendSummary {
	expired: number;
	dailyCapRemaining: number;
	claimed: number;
	sent: number;
	failed: number;
	skipped: number;
	released: number;
	completedCampaigns: number;
	errors: CampaignSendError[];
}

export type SuppressionRow = { email: string; scope: string; reason: string };

/**
 * Whether a suppression record keeps someone out of campaign email.
 * Any opt-out counts except a daily-brief-only unsubscribe; a hard bounce or
 * complaint counts in every scope.
 */
export function suppressionReason(rows: SuppressionRow[]): 'unsubscribed' | 'bounced' | null {
	let reason: 'unsubscribed' | 'bounced' | null = null;
	for (const row of rows) {
		if (row.reason === 'hard_bounce' || row.reason === 'complaint') return 'bounced';
		if (row.scope !== 'daily_brief') reason = 'unsubscribed';
	}
	return reason;
}

export function parseDailyCap(value: string | undefined | null): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_CAP;
}

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error ?? 'Unknown error');
}

function asContext(value: unknown): RecipientContext {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as RecipientContext)
		: {};
}

export async function processDueCampaignSends(
	options: ProcessDueCampaignSendsOptions
): Promise<CampaignSendSummary> {
	const {
		supabase,
		now = new Date(),
		budgetMs = DEFAULT_BUDGET_MS,
		perRunLimit = DEFAULT_PER_RUN_LIMIT,
		dailyCap = DEFAULT_DAILY_CAP,
		leaseSeconds = DEFAULT_LEASE_SECONDS,
		clock = () => Date.now()
	} = options;
	const emailService: CampaignEmailSender = options.emailService ?? new EmailService(supabase);
	const startedAt = clock();
	const nowIso = now.toISOString();
	const summary: CampaignSendSummary = {
		expired: 0,
		dailyCapRemaining: 0,
		claimed: 0,
		sent: 0,
		failed: 0,
		skipped: 0,
		released: 0,
		completedCampaigns: 0,
		errors: []
	};

	// 1. Expired leases: the process that claimed them died. Never re-send.
	const { data: expiredRows, error: expireError } = await supabase
		.from('email_campaign_recipients')
		.update({
			status: 'failed',
			error_message: INTERRUPTED_SEND_MESSAGE,
			lease_expires_at: null
		})
		.eq('status', 'sending')
		.lt('lease_expires_at', nowIso)
		.select('id');
	if (expireError) throw new Error(`Failed to expire stale sends: ${expireError.message}`);
	summary.expired = expiredRows?.length ?? 0;

	// 2. Daily cap across all campaigns.
	const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const { count: sentLastDay, error: countError } = await supabase
		.from('email_campaign_recipients')
		.select('id', { count: 'exact', head: true })
		.gte('sent_at', since);
	if (countError) throw new Error(`Failed to count recent sends: ${countError.message}`);
	summary.dailyCapRemaining = Math.max(0, dailyCap - (sentLastDay ?? 0));
	const limit = Math.min(perRunLimit, summary.dailyCapRemaining);

	// 3. Claim and send one row at a time. Claiming a batch up front meant one
	// slow Gmail connection could leave the rest of the batch "interrupted" when
	// the function was killed; now at most the row in flight is ever in doubt.
	const campaignById = new Map<string, CampaignRowDb | null>();
	for (let sentThisRun = 0; sentThisRun < limit; sentThisRun++) {
		if (clock() - startedAt >= budgetMs) break;

		const { data, error } = await (supabase as any).rpc('claim_email_campaign_sends', {
			p_limit: 1,
			p_lease_seconds: leaseSeconds
		});
		if (error) throw new Error(`Failed to claim campaign sends: ${error.message}`);
		const row = ((data ?? []) as RecipientRow[])[0];
		if (!row) break;
		summary.claimed++;

		const [campaignResult, suppressionResult, userResult] = await Promise.all([
			campaignById.has(row.campaign_id)
				? Promise.resolve({ data: campaignById.get(row.campaign_id), error: null })
				: supabase
						.from('email_campaigns')
						.select(
							'id, name, subject_template, body_template, from_name, created_by, status'
						)
						.eq('id', row.campaign_id)
						.maybeSingle(),
			supabase
				.from('email_suppressions')
				.select('email, scope, reason')
				.eq('email', row.email),
			row.user_id
				? supabase
						.from('users')
						.select('deletion_status')
						.eq('id', row.user_id)
						.maybeSingle()
				: Promise.resolve({ data: null, error: null })
		]);

		const loadError = campaignResult.error ?? suppressionResult.error ?? userResult.error;
		if (loadError) {
			// Nothing was sent for this row: hand it back.
			await releaseRows(supabase, [row.id]);
			summary.released++;
			throw new Error(`Failed to load campaign data: ${loadError.message ?? 'unknown'}`);
		}
		const campaign = (campaignResult.data ?? null) as CampaignRowDb | null;
		campaignById.set(row.campaign_id, campaign);

		const outcome = await sendOne({
			supabase,
			emailService,
			row,
			campaign,
			suppressions: (suppressionResult.data ?? []) as SuppressionRow[],
			deletingAccount: Boolean(
				(userResult.data as { deletion_status?: string | null } | null)?.deletion_status
			)
		});

		if (outcome.status === 'sent') summary.sent++;
		else if (outcome.status === 'skipped') summary.skipped++;
		else {
			summary.failed++;
			summary.errors.push({ recipientId: row.id, error: outcome.error });
		}
	}

	// 4. Campaigns with nothing waiting are done.
	summary.completedCampaigns = await completeFinishedCampaigns(supabase, nowIso);

	return summary;
}

type SendOutcome =
	| { status: 'sent' }
	| { status: 'skipped'; reason: string }
	| { status: 'failed'; error: string };

async function sendOne({
	supabase,
	emailService,
	row,
	campaign,
	suppressions,
	deletingAccount = false
}: {
	supabase: Client;
	emailService: CampaignEmailSender;
	row: RecipientRow;
	campaign: CampaignRowDb | null;
	suppressions: SuppressionRow[];
	deletingAccount?: boolean;
}): Promise<SendOutcome> {
	const finishedAt = () => new Date().toISOString();

	if (!campaign) {
		const error = 'Campaign not found.';
		await updateRow(supabase, row.id, {
			status: 'failed',
			error_message: error,
			lease_expires_at: null
		});
		return { status: 'failed', error };
	}

	const blocked = deletingAccount ? 'deleting_account' : suppressionReason(suppressions);
	if (blocked) {
		await updateRow(supabase, row.id, {
			status: 'skipped',
			skip_reason: blocked,
			lease_expires_at: null
		});
		return { status: 'skipped', reason: blocked };
	}

	const rendered = renderCampaignEmail(campaign, {
		first_name: row.first_name,
		context: asContext(row.context),
		subject_override: row.subject_override,
		body_override: row.body_override
	});

	if (!rendered.subject || !rendered.bodyHtml.trim()) {
		await updateRow(supabase, row.id, {
			status: 'failed',
			error_message: EMPTY_EMAIL_MESSAGE,
			lease_expires_at: null
		});
		return { status: 'failed', error: EMPTY_EMAIL_MESSAGE };
	}

	const trackingId = randomUUID();
	let result: Awaited<ReturnType<CampaignEmailSender['sendEmail']>>;
	try {
		result = await emailService.sendEmail({
			to: row.email,
			subject: rendered.subject,
			body: rendered.text,
			html: renderCampaignEmailDocument(rendered),
			from: 'dj',
			fromName: campaign.from_name,
			userId: row.user_id,
			createdBy: campaign.created_by ?? undefined,
			trackingEnabled: true,
			metadata: {
				category: 'campaign',
				campaign_type: 'marketing',
				campaign_id: campaign.id,
				campaign_recipient_id: row.id,
				campaign_name: campaign.name,
				segment: row.segment as RecipientSegment,
				tracking_id: trackingId
			}
		});
	} catch (error) {
		result = { success: false, error: errorText(error) };
	}

	if (result.success) {
		await updateRow(supabase, row.id, {
			status: 'sent',
			sent_at: finishedAt(),
			email_id: result.emailId ?? null,
			tracking_id: result.trackingId ?? trackingId,
			message_id: result.messageId ?? null,
			error_message: null,
			lease_expires_at: null
		});
		return { status: 'sent' };
	}

	const error = result.error || 'Send failed.';
	await updateRow(supabase, row.id, {
		status: 'failed',
		error_message: error,
		lease_expires_at: null
	});
	return { status: 'failed', error };
}

async function updateRow(
	supabase: Client,
	id: string,
	patch: Database['public']['Tables']['email_campaign_recipients']['Update']
): Promise<void> {
	const { error } = await supabase.from('email_campaign_recipients').update(patch).eq('id', id);
	if (error) {
		// The row stays `sending`; its lease expires and the next run marks it failed
		// ("may have gone out") instead of sending it again.
		console.error('Failed to record campaign send state', { id, error: error.message });
	}
}

async function releaseRows(supabase: Client, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const { error } = await supabase
		.from('email_campaign_recipients')
		.update({ status: 'queued', lease_expires_at: null })
		.in('id', ids)
		.eq('status', 'sending');
	if (error) console.error('Failed to release claimed campaign sends', { error: error.message });
}

async function completeFinishedCampaigns(supabase: Client, nowIso: string): Promise<number> {
	const { data: sending, error } = await supabase
		.from('email_campaigns')
		.select('id')
		.eq('status', 'sending');
	if (error || !sending?.length) return 0;

	// One small existence check per running campaign (there are only ever a few),
	// so a big queue elsewhere can't hide this campaign's waiting rows.
	let completed = 0;
	for (const { id } of sending) {
		const { data: waiting, error: waitingError } = await supabase
			.from('email_campaign_recipients')
			.select('id')
			.eq('campaign_id', id)
			.in('status', ['queued', 'sending'])
			.eq('included', true)
			.limit(1);
		if (waitingError || (waiting?.length ?? 0) > 0) continue;

		const { data: done } = await supabase
			.from('email_campaigns')
			.update({ status: 'completed', completed_at: nowIso })
			.eq('id', id)
			.eq('status', 'sending')
			.select('id');
		completed += done?.length ?? 0;
	}
	return completed;
}

// ---------------------------------------------------------------------------
// Test email ("Send me a test")
// ---------------------------------------------------------------------------

export interface SendCampaignTestOptions {
	emailService: CampaignEmailSender;
	campaign: Pick<
		CampaignRowDb,
		'id' | 'name' | 'subject_template' | 'body_template' | 'from_name'
	>;
	/** Render this person's version; without it the template is filled with the admin's name. */
	recipient?: Pick<
		RecipientRow,
		'id' | 'first_name' | 'context' | 'subject_override' | 'body_override'
	> | null;
	to: string;
	adminUserId: string;
	adminName?: string | null;
}

export type SendCampaignTestResult =
	| { success: true; sentTo: string }
	| { success: false; error: string; empty?: boolean };

export async function sendCampaignTest(
	options: SendCampaignTestOptions
): Promise<SendCampaignTestResult> {
	const { emailService, campaign, recipient, to, adminUserId, adminName } = options;

	const rendered = renderCampaignEmail(
		campaign,
		recipient
			? {
					first_name: recipient.first_name,
					context: asContext(recipient.context),
					subject_override: recipient.subject_override,
					body_override: recipient.body_override
				}
			: { first_name: firstNameFrom(adminName), context: {} }
	);

	if (!rendered.subject || !rendered.bodyHtml.trim()) {
		return { success: false, error: 'Write a subject and body first.', empty: true };
	}

	let result: Awaited<ReturnType<CampaignEmailSender['sendEmail']>>;
	try {
		result = await emailService.sendEmail({
			to,
			subject: `[Test] ${rendered.subject}`,
			body: rendered.text,
			html: renderCampaignEmailDocument(rendered),
			from: 'dj',
			fromName: campaign.from_name,
			userId: null,
			createdBy: adminUserId,
			trackingEnabled: true,
			metadata: {
				category: 'campaign_test',
				campaign_type: 'marketing',
				campaign_id: campaign.id,
				campaign_recipient_id: recipient?.id ?? null,
				campaign_name: campaign.name,
				test: true
			}
		});
	} catch (error) {
		result = { success: false, error: errorText(error) };
	}

	return result.success
		? { success: true, sentTo: to }
		: { success: false, error: result.error || 'Test send failed.' };
}

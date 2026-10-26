// apps/web/src/lib/email-campaigns/ui-helpers.ts
// Pure helpers for the campaign screens: the wave plan sentence, status
// labels, relative dates, and pre-send checks. Browser-safe.

import { findUnknownMergeFields, renderCampaignEmail, type RenderableCampaign } from './render';
import type {
	CampaignRecipientView,
	CampaignStatus,
	CampaignSummary,
	RecipientSegment
} from './types';

export interface WavePlan {
	count: number;
	waves: number;
	/** ISO time of the first wave (start, or now when starting immediately). */
	firstAt: string;
	/** ISO time of the last wave. */
	lastAt: string;
}

/**
 * Same math as the server queue: person i goes out at
 * start + floor(i / waveSize) * interval.
 */
export function computeWavePlan(input: {
	count: number;
	startAt: Date;
	waveSize: number;
	intervalMinutes: number;
}): WavePlan {
	const count = Math.max(0, Math.floor(input.count));
	const waveSize = Math.max(1, Math.floor(input.waveSize) || 1);
	const interval = Math.max(0, Math.floor(input.intervalMinutes) || 0);
	const waves = count === 0 ? 0 : Math.ceil(count / waveSize);
	const start = input.startAt.getTime();
	const last = start + Math.max(0, waves - 1) * interval * 60_000;
	return {
		count,
		waves,
		firstAt: new Date(start).toISOString(),
		lastAt: new Date(last).toISOString()
	};
}

export function scheduledForIndex(
	index: number,
	startAt: Date,
	waveSize: number,
	intervalMinutes: number
): Date {
	const wave = Math.floor(index / Math.max(1, waveSize));
	return new Date(startAt.getTime() + wave * intervalMinutes * 60_000);
}

export function formatInterval(minutes: number): string {
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	if (minutes % 1440 === 0) {
		const days = minutes / 1440;
		return `${days} day${days === 1 ? '' : 's'}`;
	}
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${hours} hour${hours === 1 ? '' : 's'}`;
	}
	const hours = Math.floor(minutes / 60);
	return `${hours} h ${minutes % 60} min`;
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone
	});
}

export function formatShortDate(iso: string | null | undefined, timeZone?: string): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}

/** "just now", "5 min ago", "3 days ago", or a short date past ~2 weeks. */
export function formatRelative(iso: string | null | undefined, now = new Date()): string {
	if (!iso) return '';
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return '';
	const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
	if (seconds < 45) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	if (days < 15) return `${days} day${days === 1 ? '' : 's'} ago`;
	return formatShortDate(iso);
}

export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
	if (!iso) return null;
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return null;
	return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

export type PillTone = 'muted' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

export interface CampaignStatusPill {
	label: string;
	tone: PillTone;
}

export function campaignStatusPill(
	campaign: Pick<CampaignSummary, 'status' | 'next_send_at' | 'starts_at' | 'counts'>,
	now = new Date()
): CampaignStatusPill {
	const status: CampaignStatus = campaign.status;
	const counts = campaign.counts;
	switch (status) {
		case 'draft':
			return { label: 'Draft', tone: 'muted' };
		case 'sending': {
			const sentSoFar = counts.sent + counts.failed + counts.skipped;
			const firstSendAt = campaign.next_send_at ?? campaign.starts_at;
			if (sentSoFar === 0 && firstSendAt && new Date(firstSendAt) > now) {
				return { label: `Scheduled for ${formatDateTime(firstSendAt)}`, tone: 'info' };
			}
			return {
				label: `Sending · ${counts.sent} of ${counts.included || counts.total}`,
				tone: 'accent'
			};
		}
		case 'paused':
			return { label: 'Paused', tone: 'warning' };
		case 'completed':
			return { label: 'Done', tone: 'success' };
		case 'canceled':
			return { label: 'Canceled', tone: 'danger' };
		default:
			return { label: status, tone: 'muted' };
	}
}

export const PILL_TONE_CLASSES: Record<PillTone, string> = {
	muted: 'bg-muted text-muted-foreground border-border',
	accent: 'bg-accent/10 text-accent border-accent/30',
	info: 'bg-info/10 text-info border-info/30',
	success: 'bg-success/10 text-success border-success/30',
	warning: 'bg-warning/10 text-foreground border-warning/40',
	danger: 'bg-destructive/10 text-destructive border-destructive/30'
};

export const SEGMENT_CHIP_LABELS: Record<RecipientSegment, string> = {
	no_project: 'No project',
	went_quiet: 'Went quiet',
	beta_no_account: 'Beta, no account',
	manual: 'Added by hand',
	imported: 'Imported'
};

export function segmentChipLabel(segment: string): string {
	return SEGMENT_CHIP_LABELS[segment as RecipientSegment] ?? segment;
}

export function displayName(recipient: Pick<CampaignRecipientView, 'name' | 'email'>): string {
	return recipient.name?.trim() || recipient.email;
}

/** True when the campaign is imported drafts, or every included person has their own version. */
export function everyoneHasOwnVersion(
	source: string | null | undefined,
	recipients: Pick<CampaignRecipientView, 'included' | 'body_override'>[]
): boolean {
	if (source?.startsWith('import:')) return true;
	const included = recipients.filter((recipient) => recipient.included);
	return (
		included.length > 0 &&
		included.every((recipient) => Boolean(recipient.body_override?.trim()))
	);
}

export interface SendReadiness {
	ready: boolean;
	problems: string[];
	includedCount: number;
}

/** What blocks queueing, phrased for DJ. Mirrors the server's queue validation. */
export function checkSendReadiness(
	campaign: RenderableCampaign,
	recipients: CampaignRecipientView[]
): SendReadiness {
	const included = recipients.filter((recipient) => recipient.included);
	const problems: string[] = [];

	if (included.length === 0) {
		problems.push('Nobody is included yet. Pick an audience or add people.');
	}

	let missingSubject = 0;
	let missingBody = 0;
	for (const recipient of included) {
		const rendered = renderCampaignEmail(campaign, recipient);
		if (!rendered.subject) missingSubject += 1;
		if (!rendered.text.trim() && !/<img\s/i.test(rendered.bodyHtml)) missingBody += 1;
	}
	if (missingSubject > 0) {
		problems.push(
			missingSubject === included.length
				? 'Add a subject line.'
				: `${missingSubject} ${missingSubject === 1 ? 'person has' : 'people have'} no subject line.`
		);
	}
	if (missingBody > 0) {
		problems.push(
			missingBody === included.length
				? 'Write the email body.'
				: `${missingBody} ${missingBody === 1 ? 'person has' : 'people have'} an empty email.`
		);
	}

	const unknown = new Set<string>([
		...findUnknownMergeFields(campaign.subject_template),
		...findUnknownMergeFields(campaign.body_template),
		...included.flatMap((recipient) => [
			...findUnknownMergeFields(recipient.subject_override ?? ''),
			...findUnknownMergeFields(recipient.body_override ?? '')
		])
	]);
	if (unknown.size > 0) {
		problems.push(
			`Unknown fill-in ${[...unknown].map((key) => `{{${key}}}`).join(', ')} — fix the spelling or remove it.`
		);
	}

	return { ready: problems.length === 0, problems, includedCount: included.length };
}

/** Sent, but no reply, no unsubscribe, no bounce: the people a follow-up would reach. */
export function followUpCount(recipients: CampaignRecipientView[]): number {
	return recipients.filter(
		(recipient) =>
			recipient.status === 'sent' &&
			!recipient.replied_at &&
			!recipient.unsubscribed_at &&
			!recipient.bounced_at
	).length;
}

/** The opening of an email body on one line (greeting and first sentences), for list rows. */
export function firstLine(text: string, max = 160): string {
	const line = text
		.split('\n')
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join(' ');
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Lowercased, trimmed addresses pulled from pasted text (commas, spaces, newlines, "Name <a@b>"). */
export function parsePastedAddresses(input: string): { valid: string[]; invalid: string[] } {
	const valid = new Set<string>();
	const invalid: string[] = [];
	for (const raw of input.split(/[\s,;]+/)) {
		const token = raw
			.replace(/^<|>$/g, '')
			.replace(/^mailto:/i, '')
			.trim()
			.toLowerCase();
		if (!token) continue;
		if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(token)) valid.add(token);
		else if (token.includes('@')) invalid.push(token);
	}
	return { valid: [...valid], invalid };
}

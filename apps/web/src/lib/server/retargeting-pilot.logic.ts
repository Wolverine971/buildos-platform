// apps/web/src/lib/server/retargeting-pilot.logic.ts
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';

export const RETARGETING_DEFAULT_CAMPAIGN_ID = 'buildos-reactivation-founder-pilot-v1';
export const RETARGETING_DEFAULT_CONVERSION_WINDOW_DAYS = 14;
export const RETARGETING_DEFAULT_BATCH_SIZE = 25;
export const RETARGETING_DEFAULT_HOLDOUT_USERS_IF_SMALL = 10;
export const RETARGETING_DEFAULT_HOLDOUT_PCT_IF_LARGE = 0.1;
export const RETARGETING_DEFAULT_VARIANT = 'A';
export const RETARGETING_UTM_CAMPAIGN = 'buildos-reactivation-founder-pilot';

export const RETARGETING_STEPS = ['touch_1', 'touch_2', 'touch_3'] as const;
export const RETARGETING_REPLY_STATUSES = [
	'none',
	'replied',
	'positive_reply',
	'negative_reply',
	'do_not_contact'
] as const;

export type RetargetingPilotStep = (typeof RETARGETING_STEPS)[number];
export type RetargetingReplyStatus = (typeof RETARGETING_REPLY_STATUSES)[number];
export type RetargetingVariant = 'A' | 'B' | 'C';

export interface RetargetingPilotMemberRow {
	id: string;
	campaign_id: string;
	cohort_id: string;
	user_id: string;
	email: string;
	name: string | null;
	cohort_frozen_at: string;
	cohort_size: number;
	prioritized_rank: number;
	pilot_segment: string;
	holdout: boolean;
	batch_id: string | null;
	variant: string;
	conversion_window_days: number;
	first_activity_at: string | null;
	last_meaningful_activity_at: string | null;
	lifetime_activity_count: number;
	first_14d_activity_count: number;
	last_outbound_email_at: string | null;
	last_seen_at: string | null;
	touch_1_sent_at: string | null;
	touch_2_sent_at: string | null;
	touch_3_sent_at: string | null;
	reply_status: RetargetingReplyStatus;
	reply_recorded_at: string | null;
	manual_stop: boolean;
	manual_stop_at: string | null;
	manual_stop_reason: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface RetargetingPilotMetricRow extends RetargetingPilotMemberRow {
	first_send_at: string | null;
	last_send_at: string | null;
	touch_1_opened: boolean;
	touch_1_clicked: boolean;
	any_open: boolean;
	any_click: boolean;
	anchor_at: string;
	first_post_send_activity_at: string | null;
	first_post_send_action_at: string | null;
	return_session_at: string | null;
	first_action_at: string | null;
	active_days_30d: number;
	attributed_step: string | null;
	attribution_type: string;
}

export interface RetargetingEmailContent {
	step: RetargetingPilotStep;
	stepNumber: string;
	variant: RetargetingVariant;
	subject: string;
	body: string;
	html: string;
	primaryCtaUrl: string | null;
	secondaryCtaUrl: string | null;
}

export interface RetargetingStepCandidate extends RetargetingPilotMetricRow {
	step: RetargetingPilotStep;
}

export interface RetargetingOutcomeSummaryGroup {
	holdout: boolean;
	users: number;
	returnSessionUsers: number;
	firstActionUsers: number;
	multiDayUsageUsers: number;
}

const STEP_NUMBERS: Record<RetargetingPilotStep, string> = {
	touch_1: '1',
	touch_2: '2',
	touch_3: '3'
};

const STEP_WAIT_HOURS: Partial<Record<RetargetingPilotStep, number>> = {
	touch_2: 72,
	touch_3: 24 * 7
};

const SUBJECTS: Record<RetargetingPilotStep, Record<RetargetingVariant, string>> = {
	touch_1: {
		A: 'You tried BuildOS early. It is different now.',
		B: 'BuildOS was early when you tried it',
		C: 'Quick note from the founder'
	},
	touch_2: {
		A: 'Why building context now matters',
		B: 'What changed in BuildOS',
		C: 'Why this is more useful than another AI tab'
	},
	touch_3: {
		A: 'One last note on BuildOS',
		B: 'Should I leave you alone on this?',
		C: 'Can I tell you if BuildOS is actually a fit?'
	}
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function firstName(name: string | null | undefined): string | null {
	if (!name) {
		return null;
	}

	const trimmed = name.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed.split(/\s+/)[0] ?? null;
}

function getGreeting(name: string | null | undefined): string {
	const resolved = firstName(name);
	return resolved ? `Hi ${resolved},` : 'Hi,';
}

function getHtmlGreeting(name: string | null | undefined): string {
	const resolved = firstName(name);
	return resolved ? `Hi ${escapeHtml(resolved)},` : 'Hi,';
}

function resolveVariant(variant?: string | null): RetargetingVariant {
	return variant === 'B' || variant === 'C' ? variant : 'A';
}

function validateAbsoluteUrl(url: string, label: string): string {
	try {
		return new URL(url).toString();
	} catch {
		throw new Error(`${label} must be an absolute URL`);
	}
}

function addTrackedParams(
	baseUrl: string,
	options: {
		campaignId: string;
		cohortId: string;
		batchId: string;
		step: RetargetingPilotStep;
		variant: RetargetingVariant;
	}
): string {
	const url = new URL('/welcome-back', baseUrl);
	url.searchParams.set('utm_source', 'retargeting');
	url.searchParams.set('utm_medium', 'email');
	url.searchParams.set('utm_campaign', RETARGETING_UTM_CAMPAIGN);
	url.searchParams.set('utm_content', `step-${STEP_NUMBERS[options.step]}`);
	url.searchParams.set('campaign_id', options.campaignId);
	url.searchParams.set('cohort_id', options.cohortId);
	url.searchParams.set('batch_id', options.batchId);
	url.searchParams.set('step', STEP_NUMBERS[options.step]);
	url.searchParams.set('variant', options.variant);
	return url.toString();
}

function buildHtml(subject: string, content: string): string {
	return generateMinimalEmailHTML({
		subject,
		content
	});
}

export function buildRetargetingEmailContent(options: {
	baseUrl: string;
	campaignId: string;
	cohortId: string;
	batchId: string;
	member: Pick<RetargetingPilotMemberRow, 'name' | 'variant'>;
	step: RetargetingPilotStep;
	variant?: string | null;
	demoUrl?: string | null;
}): RetargetingEmailContent {
	const variant = resolveVariant(options.variant ?? options.member.variant);
	const stepNumber = STEP_NUMBERS[options.step];
	const subject = SUBJECTS[options.step][variant];
	const greeting = getGreeting(options.member.name);
	const htmlGreeting = getHtmlGreeting(options.member.name);
	const appUrl = addTrackedParams(options.baseUrl, {
		campaignId: options.campaignId,
		cohortId: options.cohortId,
		batchId: options.batchId,
		step: options.step,
		variant
	});

	switch (options.step) {
		case 'touch_1': {
			const body = `${greeting}

You tried BuildOS back when it was still early, and I do not think the
product earned a habit yet.

I am reaching out now because the product is much better at the part that
matters most: helping you build context around real work so the AI can help
more over time instead of starting from zero every session.

That is the big difference.

You can dump messy thinking into BuildOS now, come back later, and keep
refining the same project instead of re-explaining everything again.

If other people are involved, shared context makes it even stronger because
everyone can work in parallel from the same project instead of rebuilding the
plan in meetings, docs, and chat threads.

If you are open to a 5-minute test, talk through one real project here:
${appUrl}

Use something you are actually working on, not a fake test.

If it still feels weak, reply and tell me why. I read every reply.

DJ`;

			const html = buildHtml(
				subject,
				[
					`<p>${htmlGreeting}</p>`,
					'<p>You tried BuildOS back when it was still early, and I do not think the product earned a habit yet.</p>',
					'<p>I am reaching out now because the product is much better at the part that matters most: helping you build context around real work so the AI can help more over time instead of starting from zero every session.</p>',
					'<p>That is the big difference.</p>',
					'<p>You can dump messy thinking into BuildOS now, come back later, and keep refining the same project instead of re-explaining everything again.</p>',
					'<p>If other people are involved, shared context makes it even stronger because everyone can work in parallel from the same project instead of rebuilding the plan in meetings, docs, and chat threads.</p>',
					`<p>If you are open to a 5-minute test, <a href="${escapeHtml(appUrl)}">talk through one real project here</a>.</p>`,
					'<p><strong>Use something you are actually working on, not a fake test.</strong></p>',
					'<p>If it still feels weak, reply and tell me why. I read every reply.</p>',
					'<p>DJ</p>'
				].join('')
			);

			return {
				step: options.step,
				stepNumber,
				variant,
				subject,
				body,
				html,
				primaryCtaUrl: appUrl,
				secondaryCtaUrl: null
			};
		}
		case 'touch_2': {
			if (!options.demoUrl) {
				throw new Error('Touch 2 requires a demo URL');
			}

			const demoUrl = validateAbsoluteUrl(options.demoUrl, 'demo_url');
			const body = `${greeting}

Quick thought on why I think current BuildOS is worth another look.

Most AI tools are helpful in the moment.
BuildOS is meant to get more useful after the moment.

Every real project session becomes context:

- what you are trying to do
- what constraints you have
- what decisions already got made
- what still feels unclear

That matters because AI can only help well later if the context exists now.

This is also where collaboration gets interesting.
If two or three people are moving the same project forward, shared context
means people can work in parallel without constantly asking, "wait, what is
the current plan?"

If you want the fast version, watch this:
${demoUrl}

If you would rather test it yourself, use this:
${appUrl}

Suggested test: talk through one active project today, then come back tomorrow
and ask BuildOS what changed or what should happen next.

DJ`;

			const html = buildHtml(
				subject,
				[
					`<p>${htmlGreeting}</p>`,
					'<p>Quick thought on why I think current BuildOS is worth another look.</p>',
					'<p>Most AI tools are helpful in the moment.<br>BuildOS is meant to get more useful after the moment.</p>',
					'<p>Every real project session becomes context:</p>',
					'<ul><li>what you are trying to do</li><li>what constraints you have</li><li>what decisions already got made</li><li>what still feels unclear</li></ul>',
					'<p>That matters because AI can only help well later if the context exists now.</p>',
					'<p>This is also where collaboration gets interesting. If two or three people are moving the same project forward, shared context means people can work in parallel without constantly asking, &quot;wait, what is the current plan?&quot;</p>',
					`<p>If you want the fast version, <a href="${escapeHtml(demoUrl)}">watch this</a>.</p>`,
					`<p>If you would rather test it yourself, <a href="${escapeHtml(appUrl)}">use this</a>.</p>`,
					'<p><strong>Suggested test:</strong> talk through one active project today, then come back tomorrow and ask BuildOS what changed or what should happen next.</p>',
					'<p>DJ</p>'
				].join('')
			);

			return {
				step: options.step,
				stepNumber,
				variant,
				subject,
				body,
				html,
				primaryCtaUrl: appUrl,
				secondaryCtaUrl: demoUrl
			};
		}
		case 'touch_3': {
			const body = `${greeting}

Last note from me on this.

The reason I keep building BuildOS is that I think context is the missing
layer in most AI tools.

If you build context now, the AI can help you more later.
If you share that context with other people, the project can move faster
because everyone is working from the same source of truth.

If you want, reply with one sentence on what you are trying to organize right
now, and whether it is mostly solo or collaborative.

I will tell you honestly whether current BuildOS feels like a fit.

If not, no worries. I will leave it there.

DJ`;

			const html = buildHtml(
				subject,
				[
					`<p>${htmlGreeting}</p>`,
					'<p>Last note from me on this.</p>',
					'<p>The reason I keep building BuildOS is that I think context is the missing layer in most AI tools.</p>',
					'<p>If you build context now, the AI can help you more later. If you share that context with other people, the project can move faster because everyone is working from the same source of truth.</p>',
					'<p>If you want, reply with one sentence on what you are trying to organize right now, and whether it is mostly solo or collaborative.</p>',
					'<p>I will tell you honestly whether current BuildOS feels like a fit.</p>',
					'<p>If not, no worries. I will leave it there.</p>',
					'<p>DJ</p>'
				].join('')
			);

			return {
				step: options.step,
				stepNumber,
				variant,
				subject,
				body,
				html,
				primaryCtaUrl: null,
				secondaryCtaUrl: null
			};
		}
	}
}

function hoursSince(isoTimestamp: string | null, now: Date): number | null {
	if (!isoTimestamp) {
		return null;
	}

	const then = new Date(isoTimestamp).getTime();
	if (Number.isNaN(then)) {
		return null;
	}

	return (now.getTime() - then) / (60 * 60 * 1000);
}

function shouldSuppressMember(row: RetargetingPilotMetricRow, batchId?: string | null): boolean {
	if (row.holdout || row.manual_stop) {
		return true;
	}

	if (row.reply_status !== 'none') {
		return true;
	}

	if (batchId && row.batch_id !== batchId) {
		return true;
	}

	return false;
}

function compareBooleanDesc(a: boolean, b: boolean): number {
	if (a === b) {
		return 0;
	}

	return a ? -1 : 1;
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
	if (!left && !right) {
		return 0;
	}

	if (left && !right) {
		return -1;
	}

	if (!left && right) {
		return 1;
	}

	return new Date(right!).getTime() - new Date(left!).getTime();
}

export function listRetargetingStepCandidates(
	rows: RetargetingPilotMetricRow[],
	options: {
		step: RetargetingPilotStep;
		now?: Date;
		batchId?: string | null;
	}
): RetargetingStepCandidate[] {
	const now = options.now ?? new Date();

	const filtered = rows.filter((row) => {
		if (shouldSuppressMember(row, options.batchId)) {
			return false;
		}

		switch (options.step) {
			case 'touch_1':
				return !row.touch_1_sent_at;
			case 'touch_2': {
				const elapsedHours = hoursSince(row.touch_1_sent_at, now);
				return (
					Boolean(row.touch_1_sent_at) &&
					!row.touch_2_sent_at &&
					!row.first_post_send_activity_at &&
					(elapsedHours === null || elapsedHours >= (STEP_WAIT_HOURS.touch_2 ?? 0))
				);
			}
			case 'touch_3': {
				const elapsedHours = hoursSince(row.touch_1_sent_at, now);
				return (
					Boolean(row.touch_1_sent_at) &&
					!row.touch_3_sent_at &&
					!row.first_post_send_action_at &&
					(row.any_open || row.any_click) &&
					(elapsedHours === null || elapsedHours >= (STEP_WAIT_HOURS.touch_3 ?? 0))
				);
			}
		}
	});

	const sorted = [...filtered].sort((left, right) => {
		if (options.step === 'touch_1') {
			return left.prioritized_rank - right.prioritized_rank;
		}

		if (options.step === 'touch_2') {
			return (
				compareBooleanDesc(left.touch_1_clicked, right.touch_1_clicked) ||
				compareBooleanDesc(left.touch_1_opened, right.touch_1_opened) ||
				left.prioritized_rank - right.prioritized_rank
			);
		}

		return (
			compareBooleanDesc(left.any_click, right.any_click) ||
			compareBooleanDesc(left.any_open, right.any_open) ||
			compareNullableDateDesc(left.last_send_at, right.last_send_at) ||
			left.prioritized_rank - right.prioritized_rank
		);
	});

	return sorted.map((row) => ({
		...row,
		step: options.step
	}));
}

export function summarizeRetargetingOutcomes(
	rows: RetargetingPilotMetricRow[]
): RetargetingOutcomeSummaryGroup[] {
	return [false, true].map((holdout) => {
		const groupRows = rows.filter((row) => row.holdout === holdout);
		return {
			holdout,
			users: groupRows.length,
			returnSessionUsers: groupRows.filter((row) => Boolean(row.return_session_at)).length,
			firstActionUsers: groupRows.filter((row) => Boolean(row.first_action_at)).length,
			multiDayUsageUsers: groupRows.filter((row) => row.active_days_30d >= 2).length
		};
	});
}

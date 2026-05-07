// apps/web/src/lib/server/retargeting-pilot.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import {
	applyEmailCopyOverride,
	buildEmailCopyTokens
} from '$lib/server/email-sequence-copy-overrides';
import {
	buildRetargetingEmailContent,
	listRetargetingStepCandidates,
	RETARGETING_EMAIL_SEQUENCE_KEY,
	RETARGETING_DEFAULT_BATCH_SIZE,
	RETARGETING_DEFAULT_CAMPAIGN_ID,
	RETARGETING_DEFAULT_CONVERSION_WINDOW_DAYS,
	RETARGETING_DEFAULT_HOLDOUT_PCT_IF_LARGE,
	RETARGETING_DEFAULT_HOLDOUT_USERS_IF_SMALL,
	RETARGETING_DEFAULT_VARIANT,
	RETARGETING_STEPS,
	summarizeRetargetingOutcomes,
	type RetargetingPilotMemberRow,
	type RetargetingPilotMetricRow,
	type RetargetingPilotStep,
	type RetargetingVariant
} from './retargeting-pilot.logic';

type TypedSupabaseClient = SupabaseClient<Database>;

interface FreezeRetargetingCohortInput {
	campaignId?: string;
	cohortId: string;
	cohortFrozenAt?: string;
	batchSize?: number;
	holdoutUsersIfSmall?: number;
	holdoutPctIfLarge?: number;
	conversionWindowDays?: number;
	replaceExisting?: boolean;
}

interface SendRetargetingStepInput {
	campaignId?: string;
	cohortId: string;
	step: RetargetingPilotStep;
	sentByUserId: string;
	batchId: string;
	variant?: string | null;
	demoUrl?: string | null;
	dryRun?: boolean;
}

interface TriggerSelectedRetargetingInput {
	campaignId?: string;
	cohortId: string;
	batchId?: string | null;
	memberIds: string[];
	triggerMode: 'schedule' | 'send_now';
	scheduleMode?: 'flow_cadence' | 'custom_minimum';
	scheduledFor?: string | null;
	sentByUserId: string;
	variant?: string | null;
	demoUrl?: string | null;
	dryRun?: boolean;
}

interface ProcessDueRetargetingSendsInput {
	limit?: number;
	now?: Date;
}

type RetargetingSendQueueStatus = 'queued' | 'sending' | 'sent' | 'skipped' | 'failed' | 'canceled';

type RetargetingTriggerResultStatus = 'queued' | 'sent' | 'skipped' | 'failed';

interface RetargetingSendQueueRow {
	id: string;
	member_id: string;
	campaign_id: string;
	cohort_id: string;
	batch_id: string;
	user_id: string | null;
	recipient_email: string;
	email_id: string | null;
	step: RetargetingPilotStep;
	variant: string;
	status: RetargetingSendQueueStatus;
	trigger_source: string;
	trigger_mode: 'schedule' | 'send_now' | 'cron';
	scheduled_for: string;
	queued_by_admin: string | null;
	sent_by_admin: string | null;
	sent_at: string | null;
	skipped_at: string | null;
	failed_at: string | null;
	failure_reason: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

interface RetargetingTriggerMemberResult {
	memberId: string;
	userId: string | null;
	email: string;
	name: string | null;
	batchId: string | null;
	step: RetargetingPilotStep | null;
	variant: string | null;
	status: RetargetingTriggerResultStatus;
	scheduledFor: string | null;
	sendId: string | null;
	emailId: string | null;
	reason: string;
}

interface RetargetingSuppressionRow {
	email: string;
	scope: string;
	reason: string;
}

export interface RetargetingOperationalRow {
	id: string;
	memberId: string;
	sequenceKey: typeof RETARGETING_EMAIL_SEQUENCE_KEY;
	email: string;
	name: string | null;
	userId: string;
	status: string;
	stageLabel: string;
	stepKey: RetargetingPilotStep | null;
	variantKey: string | null;
	nextSendAt: string | null;
	scheduledFor: string | null;
	dueLabel: string;
	batchId: string | null;
	reason: string;
	sentCount: number;
	openCount: number;
	clickCount: number;
	returnedAt: string | null;
	firstActionAt: string | null;
	lastActivityAt: string | null;
	holdout: boolean;
	manualStop: boolean;
	replyStatus: RetargetingPilotMemberRow['reply_status'];
	touch1SentAt: string | null;
	touch2SentAt: string | null;
	touch3SentAt: string | null;
	firstPostSendActivityAt: string | null;
	firstPostSendActionAt: string | null;
	anyOpen: boolean;
	anyClick: boolean;
	pendingSendId: string | null;
}

type RetargetingTimelineEventType =
	| 'cohort'
	| 'scheduled'
	| 'sent'
	| 'opened'
	| 'clicked'
	| 'returned'
	| 'activity'
	| 'skipped'
	| 'failed';

export interface RetargetingTimelineEvent {
	id: string;
	type: RetargetingTimelineEventType;
	label: string;
	description: string | null;
	occurredAt: string;
	step: RetargetingPilotStep | null;
	stepLabel: string | null;
	emailId: string | null;
	subject: string | null;
}

interface RetargetingActivityItem {
	id: string;
	type: string;
	label: string;
	description: string | null;
	occurredAt: string;
	afterFirstSend: boolean;
}

interface UpdateRetargetingMemberInput {
	replyStatus?: RetargetingPilotMemberRow['reply_status'];
	manualStop?: boolean;
	manualStopReason?: string | null;
	notes?: string | null;
}

function stepSentField(
	step: RetargetingPilotStep
): 'touch_1_sent_at' | 'touch_2_sent_at' | 'touch_3_sent_at' {
	switch (step) {
		case 'touch_1':
			return 'touch_1_sent_at';
		case 'touch_2':
			return 'touch_2_sent_at';
		case 'touch_3':
			return 'touch_3_sent_at';
	}
}

const STEP_WAIT_MS: Partial<Record<RetargetingPilotStep, number>> = {
	touch_2: 72 * 60 * 60 * 1000,
	touch_3: 7 * 24 * 60 * 60 * 1000
};

const MAX_TRIGGER_MEMBER_IDS = 250;

function stepLabel(step: RetargetingPilotStep | null | undefined): string | null {
	if (!step) {
		return null;
	}
	return `Touch ${RETARGETING_STEPS.indexOf(step) + 1}`;
}

function normalizeEmail(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function isPlausibleEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseDate(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function maxDate(...values: Array<Date | null | undefined>): Date {
	const valid = values.filter((value): value is Date => Boolean(value));
	if (valid.length === 0) {
		return new Date();
	}

	return new Date(Math.max(...valid.map((value) => value.getTime())));
}

function addMs(value: string | null, ms: number): Date | null {
	const parsed = parseDate(value);
	if (!parsed) {
		return null;
	}

	return new Date(parsed.getTime() + ms);
}

function countSentTouches(member: RetargetingPilotMetricRow): number {
	return [member.touch_1_sent_at, member.touch_2_sent_at, member.touch_3_sent_at].filter(Boolean)
		.length;
}

function getLastActivityAt(member: RetargetingPilotMetricRow): string | null {
	return (
		member.first_action_at ??
		member.first_post_send_action_at ??
		member.return_session_at ??
		member.first_post_send_activity_at ??
		member.last_meaningful_activity_at ??
		member.last_seen_at ??
		null
	);
}

function getNextRetargetingStep(member: RetargetingPilotMetricRow): {
	step: RetargetingPilotStep | null;
	reason: string;
} {
	if (!member.touch_1_sent_at) {
		return { step: 'touch_1', reason: 'No reactivation email has been sent yet.' };
	}

	if (!member.touch_2_sent_at && !member.first_post_send_activity_at) {
		return { step: 'touch_2', reason: 'Touch 1 was sent and no return activity is tracked.' };
	}

	if (
		!member.touch_3_sent_at &&
		!member.first_post_send_action_at &&
		(member.any_open || member.any_click)
	) {
		return {
			step: 'touch_3',
			reason: 'The person opened or clicked but has not taken a tracked BuildOS action.'
		};
	}

	if (member.first_action_at || member.first_post_send_action_at || member.return_session_at) {
		return { step: null, reason: 'The person returned or took a tracked BuildOS action.' };
	}

	if (member.touch_3_sent_at) {
		return { step: null, reason: 'All reactivation touches have already been sent.' };
	}

	return { step: null, reason: 'No next reactivation touch is recommended for this state.' };
}

function computeScheduledFor(
	member: RetargetingPilotMetricRow,
	step: RetargetingPilotStep,
	input: Pick<TriggerSelectedRetargetingInput, 'triggerMode' | 'scheduledFor'>,
	now: Date
): string {
	if (input.triggerMode === 'send_now') {
		return now.toISOString();
	}

	const requestedMinimum =
		parseDate(input.scheduledFor) ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);

	switch (step) {
		case 'touch_1':
			return maxDate(now, requestedMinimum).toISOString();
		case 'touch_2':
			return maxDate(
				now,
				requestedMinimum,
				addMs(member.touch_1_sent_at, STEP_WAIT_MS.touch_2!)
			).toISOString();
		case 'touch_3':
			return maxDate(
				now,
				requestedMinimum,
				addMs(member.touch_1_sent_at, STEP_WAIT_MS.touch_3!)
			).toISOString();
	}
}

function buildStageLabel(
	member: RetargetingPilotMetricRow,
	pending?: RetargetingSendQueueRow
): string {
	if (pending) {
		return `${stepLabel(pending.step)} scheduled`;
	}
	if (member.holdout) {
		return 'Holdout';
	}
	if (member.manual_stop) {
		return 'Manually stopped';
	}
	if (member.reply_status !== 'none') {
		return 'Replied';
	}
	if (member.first_action_at || member.first_post_send_action_at) {
		return 'Re-engaged';
	}
	if (member.return_session_at || member.first_post_send_activity_at) {
		return 'Returned';
	}
	if (member.touch_3_sent_at) {
		return 'Touch 3 sent';
	}
	if (member.touch_2_sent_at) {
		return 'Touch 2 sent';
	}
	if (member.touch_1_sent_at) {
		return 'Touch 1 sent';
	}
	return 'Not started';
}

function stepFromEmailMetadata(
	metadata: Record<string, unknown> | null
): RetargetingPilotStep | null {
	const stepKey = typeof metadata?.step_key === 'string' ? metadata.step_key : null;
	if (RETARGETING_STEPS.includes(stepKey as RetargetingPilotStep)) {
		return stepKey as RetargetingPilotStep;
	}

	const stepNumber = typeof metadata?.step === 'string' ? metadata.step : null;
	if (stepNumber === '1') return 'touch_1';
	if (stepNumber === '2') return 'touch_2';
	if (stepNumber === '3') return 'touch_3';
	return null;
}

function normalizeMetricRow(
	row: Record<string, unknown>,
	index: number
): RetargetingPilotMetricRow {
	const memberId =
		typeof row.id === 'string'
			? row.id
			: typeof row.member_id === 'string'
				? row.member_id
				: '';
	const nowIso = new Date().toISOString();

	return {
		id: memberId,
		member_id: typeof row.member_id === 'string' ? row.member_id : memberId,
		campaign_id: String(row.campaign_id ?? RETARGETING_DEFAULT_CAMPAIGN_ID),
		cohort_id: String(row.cohort_id ?? ''),
		user_id: String(row.user_id ?? ''),
		email: String(row.email ?? ''),
		name: typeof row.name === 'string' ? row.name : null,
		cohort_frozen_at: String(row.cohort_frozen_at ?? nowIso),
		cohort_size: Number(row.cohort_size ?? 0),
		prioritized_rank: Number(row.prioritized_rank ?? index + 1),
		pilot_segment: String(row.pilot_segment ?? 'tried_briefly_then_disappeared'),
		holdout: row.holdout === true,
		batch_id: typeof row.batch_id === 'string' ? row.batch_id : null,
		variant: typeof row.variant === 'string' ? row.variant : RETARGETING_DEFAULT_VARIANT,
		conversion_window_days: Number(
			row.conversion_window_days ?? RETARGETING_DEFAULT_CONVERSION_WINDOW_DAYS
		),
		first_activity_at: typeof row.first_activity_at === 'string' ? row.first_activity_at : null,
		last_meaningful_activity_at:
			typeof row.last_meaningful_activity_at === 'string'
				? row.last_meaningful_activity_at
				: null,
		lifetime_activity_count: Number(row.lifetime_activity_count ?? 0),
		first_14d_activity_count: Number(row.first_14d_activity_count ?? 0),
		last_outbound_email_at:
			typeof row.last_outbound_email_at === 'string' ? row.last_outbound_email_at : null,
		last_seen_at: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
		touch_1_sent_at: typeof row.touch_1_sent_at === 'string' ? row.touch_1_sent_at : null,
		touch_2_sent_at: typeof row.touch_2_sent_at === 'string' ? row.touch_2_sent_at : null,
		touch_3_sent_at: typeof row.touch_3_sent_at === 'string' ? row.touch_3_sent_at : null,
		reply_status:
			row.reply_status === 'replied' ||
			row.reply_status === 'positive_reply' ||
			row.reply_status === 'negative_reply' ||
			row.reply_status === 'do_not_contact'
				? row.reply_status
				: 'none',
		reply_recorded_at: typeof row.reply_recorded_at === 'string' ? row.reply_recorded_at : null,
		manual_stop: row.manual_stop === true,
		manual_stop_at: typeof row.manual_stop_at === 'string' ? row.manual_stop_at : null,
		manual_stop_reason:
			typeof row.manual_stop_reason === 'string' ? row.manual_stop_reason : null,
		notes: typeof row.notes === 'string' ? row.notes : null,
		created_at: String(row.created_at ?? nowIso),
		updated_at: String(row.updated_at ?? nowIso),
		first_send_at: typeof row.first_send_at === 'string' ? row.first_send_at : null,
		last_send_at: typeof row.last_send_at === 'string' ? row.last_send_at : null,
		touch_1_opened: row.touch_1_opened === true,
		touch_1_clicked: row.touch_1_clicked === true,
		any_open: row.any_open === true,
		any_click: row.any_click === true,
		anchor_at: String(row.anchor_at ?? row.cohort_frozen_at ?? nowIso),
		first_post_send_activity_at:
			typeof row.first_post_send_activity_at === 'string'
				? row.first_post_send_activity_at
				: null,
		first_post_send_action_at:
			typeof row.first_post_send_action_at === 'string'
				? row.first_post_send_action_at
				: null,
		return_session_at: typeof row.return_session_at === 'string' ? row.return_session_at : null,
		first_action_at: typeof row.first_action_at === 'string' ? row.first_action_at : null,
		active_days_30d: Number(row.active_days_30d ?? 0),
		attributed_step: typeof row.attributed_step === 'string' ? row.attributed_step : null,
		attribution_type: String(row.attribution_type ?? 'organic')
	};
}

export class RetargetingPilotService {
	private readonly emailService: EmailService;
	private readonly errorLogger: ErrorLoggerService;
	private readonly baseUrl: string;

	constructor(private readonly supabase: TypedSupabaseClient) {
		this.emailService = new EmailService(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		this.baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
	}

	private membersTable() {
		return (this.supabase as any).from('retargeting_founder_pilot_members');
	}

	private sendsTable() {
		return (this.supabase as any).from('retargeting_founder_pilot_sends');
	}

	private async loadSuppressions(
		emails: string[]
	): Promise<Map<string, RetargetingSuppressionRow>> {
		const normalizedEmails = Array.from(
			new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean))
		);
		if (normalizedEmails.length === 0) {
			return new Map();
		}

		const { data, error } = await (this.supabase as any)
			.from('email_suppressions')
			.select('email, scope, reason')
			.in('email', normalizedEmails);

		if (error) {
			throw new Error(`Failed to load email suppressions: ${error.message}`);
		}

		return new Map(
			((data || []) as RetargetingSuppressionRow[]).map((row) => [
				normalizeEmail(row.email),
				row
			])
		);
	}

	private async loadPendingSends(
		memberIds: string[]
	): Promise<Map<string, RetargetingSendQueueRow>> {
		const uniqueIds = Array.from(new Set(memberIds.filter(Boolean)));
		if (uniqueIds.length === 0) {
			return new Map();
		}

		const { data, error } = await this.sendsTable()
			.select('*')
			.in('member_id', uniqueIds)
			.in('status', ['queued', 'sending'])
			.order('scheduled_for', { ascending: true });

		if (error) {
			throw new Error(`Failed to load pending reactivation sends: ${error.message}`);
		}

		const pending = new Map<string, RetargetingSendQueueRow>();
		for (const row of (data || []) as RetargetingSendQueueRow[]) {
			if (!pending.has(row.member_id)) {
				pending.set(row.member_id, row);
			}
		}

		return pending;
	}

	private buildTriggerDecision(options: {
		member: RetargetingPilotMetricRow | null;
		memberId: string;
		batchId?: string | null;
		suppression?: RetargetingSuppressionRow | null;
		pending?: RetargetingSendQueueRow | null;
		input: TriggerSelectedRetargetingInput;
		now: Date;
	}): RetargetingTriggerMemberResult {
		const { member, memberId, suppression, pending, input, now } = options;
		if (!member) {
			return {
				memberId,
				userId: null,
				email: '',
				name: null,
				batchId: null,
				step: null,
				variant: null,
				status: 'skipped',
				scheduledFor: null,
				sendId: null,
				emailId: null,
				reason: 'Member was not found in the selected reactivation cohort.'
			};
		}

		const email = normalizeEmail(member.email);
		const base = {
			memberId: member.id,
			userId: member.user_id,
			email: member.email,
			name: member.name,
			batchId: member.batch_id,
			variant: input.variant ?? member.variant ?? RETARGETING_DEFAULT_VARIANT,
			sendId: null,
			emailId: null
		};

		if (!isPlausibleEmail(email)) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: 'Email address is invalid.'
			};
		}

		if (suppression) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: `Email is suppressed (${suppression.reason}).`
			};
		}

		if (member.holdout) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: 'Member is in the holdout group.'
			};
		}

		if (member.manual_stop) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: 'Member is manually stopped.'
			};
		}

		if (member.reply_status !== 'none') {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: `Member has reply status ${member.reply_status}.`
			};
		}

		if (options.batchId && member.batch_id !== options.batchId) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: `Member belongs to batch ${member.batch_id ?? 'none'}, not ${options.batchId}.`
			};
		}

		if (pending) {
			return {
				...base,
				step: pending.step,
				status: 'skipped',
				scheduledFor: pending.scheduled_for,
				sendId: pending.id,
				emailId: pending.email_id,
				reason: `${stepLabel(pending.step)} is already ${pending.status}.`
			};
		}

		const next = getNextRetargetingStep(member);
		if (!next.step) {
			return {
				...base,
				step: null,
				status: 'skipped',
				scheduledFor: null,
				reason: next.reason
			};
		}

		if (next.step === 'touch_2' && !input.demoUrl?.trim()) {
			return {
				...base,
				step: next.step,
				status: 'skipped',
				scheduledFor: null,
				reason: 'Touch 2 requires a demo URL.'
			};
		}

		const scheduledFor = computeScheduledFor(member, next.step, input, now);
		return {
			...base,
			step: next.step,
			status: input.triggerMode === 'send_now' ? 'sent' : 'queued',
			scheduledFor,
			reason: next.reason
		};
	}

	async freezeCohort(input: FreezeRetargetingCohortInput) {
		const campaignId = input.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const cohortId = input.cohortId.trim();
		if (!cohortId) {
			throw new Error('cohortId is required');
		}

		const { data, error } = await (this.supabase as any).rpc(
			'freeze_retargeting_founder_pilot_cohort',
			{
				p_campaign_id: campaignId,
				p_cohort_id: cohortId,
				p_batch_size: input.batchSize ?? RETARGETING_DEFAULT_BATCH_SIZE,
				p_holdout_users_if_small:
					input.holdoutUsersIfSmall ?? RETARGETING_DEFAULT_HOLDOUT_USERS_IF_SMALL,
				p_holdout_pct_if_large:
					input.holdoutPctIfLarge ?? RETARGETING_DEFAULT_HOLDOUT_PCT_IF_LARGE,
				p_conversion_window_days:
					input.conversionWindowDays ?? RETARGETING_DEFAULT_CONVERSION_WINDOW_DAYS,
				p_cohort_frozen_at: input.cohortFrozenAt ?? new Date().toISOString(),
				p_replace_existing: input.replaceExisting ?? false
			}
		);

		if (error) {
			throw new Error(`Failed to freeze retargeting cohort: ${error.message}`);
		}

		const members = ((data as RetargetingPilotMemberRow[] | null) || []).sort(
			(left, right) => left.prioritized_rank - right.prioritized_rank
		);

		const sendableMembers = members.filter((member) => !member.holdout);
		const batches = Array.from(
			new Set(
				sendableMembers
					.map((member) => member.batch_id)
					.filter((batchId): batchId is string => Boolean(batchId))
			)
		).sort();

		return {
			campaignId,
			cohortId,
			cohortFrozenAt: members[0]?.cohort_frozen_at ?? input.cohortFrozenAt ?? null,
			counts: {
				total: members.length,
				holdout: members.filter((member) => member.holdout).length,
				sendable: sendableMembers.length
			},
			batches,
			members
		};
	}

	async getCohortMembers(options: {
		campaignId?: string;
		cohortId: string;
		batchId?: string | null;
		includeHoldout?: boolean;
	}) {
		const campaignId = options.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		let query = this.membersTable()
			.select('*')
			.eq('campaign_id', campaignId)
			.eq('cohort_id', options.cohortId)
			.order('prioritized_rank', { ascending: true });

		if (options.batchId) {
			query = query.eq('batch_id', options.batchId);
		}

		if (options.includeHoldout === false) {
			query = query.eq('holdout', false);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(`Failed to load retargeting cohort members: ${error.message}`);
		}

		const members = (data as RetargetingPilotMemberRow[] | null) || [];
		return {
			campaignId,
			cohortId: options.cohortId,
			counts: {
				total: members.length,
				holdout: members.filter((member) => member.holdout).length,
				sendable: members.filter((member) => !member.holdout).length,
				manualStop: members.filter((member) => member.manual_stop).length
			},
			members
		};
	}

	async getMetricRows(options: { campaignId?: string; cohortId: string }) {
		const campaignId = options.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const { data, error } = await (this.supabase as any).rpc(
			'get_retargeting_founder_pilot_member_metrics',
			{
				p_campaign_id: campaignId,
				p_cohort_id: options.cohortId
			}
		);

		if (error) {
			throw new Error(`Failed to load retargeting metrics: ${error.message}`);
		}

		return (
			((data as Record<string, unknown>[] | null) || []) as Record<string, unknown>[]
		).map((row, index) => normalizeMetricRow(row, index));
	}

	async getOutcomeReport(options: { campaignId?: string; cohortId: string }) {
		const campaignId = options.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const members = await this.getMetricRows({
			campaignId,
			cohortId: options.cohortId
		});

		return {
			campaignId,
			cohortId: options.cohortId,
			summary: summarizeRetargetingOutcomes(members),
			members
		};
	}

	async getMemberOperationalRows(options: {
		campaignId?: string;
		cohortId: string;
		batchId?: string | null;
	}): Promise<RetargetingOperationalRow[]> {
		const campaignId = options.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const members = await this.getMetricRows({
			campaignId,
			cohortId: options.cohortId
		});
		const filtered = options.batchId
			? members.filter((member) => member.batch_id === options.batchId)
			: members;
		const pending = await this.loadPendingSends(filtered.map((member) => member.id));
		const now = new Date();

		return filtered.map((member) => {
			const pendingSend = pending.get(member.id) ?? null;
			const next = pendingSend
				? {
						step: pendingSend.step,
						reason: `${stepLabel(pendingSend.step)} is already queued.`
					}
				: getNextRetargetingStep(member);
			const scheduledFor = pendingSend?.scheduled_for ?? null;
			const computedNextSendAt =
				scheduledFor ??
				(next.step
					? computeScheduledFor(member, next.step, { triggerMode: 'schedule' }, now)
					: null);

			return {
				id: member.id,
				memberId: member.id,
				sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
				email: member.email,
				name: member.name,
				userId: member.user_id,
				status: pendingSend
					? pendingSend.status
					: next.step
						? computedNextSendAt && Date.parse(computedNextSendAt) <= now.getTime()
							? 'ready'
							: 'waiting'
						: member.first_action_at || member.return_session_at
							? 'returned'
							: member.holdout || member.manual_stop || member.reply_status !== 'none'
								? 'blocked'
								: 'complete',
				stageLabel: buildStageLabel(member, pendingSend ?? undefined),
				stepKey: next.step,
				variantKey: member.variant || RETARGETING_DEFAULT_VARIANT,
				nextSendAt: computedNextSendAt,
				scheduledFor,
				dueLabel: pendingSend
					? `Scheduled for ${new Date(pendingSend.scheduled_for).toLocaleString()}`
					: next.step
						? next.reason
						: 'No next touch',
				batchId: member.batch_id,
				reason: next.reason,
				sentCount: countSentTouches(member),
				openCount: member.any_open ? 1 : 0,
				clickCount: member.any_click ? 1 : 0,
				returnedAt: member.return_session_at,
				firstActionAt: member.first_action_at,
				lastActivityAt: getLastActivityAt(member),
				holdout: member.holdout,
				manualStop: member.manual_stop,
				replyStatus: member.reply_status,
				touch1SentAt: member.touch_1_sent_at,
				touch2SentAt: member.touch_2_sent_at,
				touch3SentAt: member.touch_3_sent_at,
				firstPostSendActivityAt: member.first_post_send_activity_at,
				firstPostSendActionAt: member.first_post_send_action_at,
				anyOpen: member.any_open,
				anyClick: member.any_click,
				pendingSendId: pendingSend?.id ?? null
			};
		});
	}

	async triggerSelectedMembers(input: TriggerSelectedRetargetingInput) {
		const campaignId = input.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const cohortId = input.cohortId.trim();
		if (!cohortId) {
			throw new Error('cohort_id is required');
		}

		const memberIds = Array.from(
			new Set(input.memberIds.map((id) => id.trim()).filter(Boolean))
		);
		if (memberIds.length === 0) {
			throw new Error('At least one member_id is required');
		}
		if (memberIds.length > MAX_TRIGGER_MEMBER_IDS) {
			throw new Error(`Select ${MAX_TRIGGER_MEMBER_IDS} or fewer members at a time`);
		}

		const now = new Date();
		const members = await this.getMetricRows({ campaignId, cohortId });
		const membersById = new Map(members.map((member) => [member.id, member]));
		const selectedMembers = memberIds
			.map((memberId) => membersById.get(memberId))
			.filter((member): member is RetargetingPilotMetricRow => Boolean(member));
		const [suppressions, pendingSends] = await Promise.all([
			this.loadSuppressions(selectedMembers.map((member) => member.email)),
			this.loadPendingSends(memberIds)
		]);
		const decisions = memberIds.map((memberId) => {
			const member = membersById.get(memberId) ?? null;
			return this.buildTriggerDecision({
				member,
				memberId,
				batchId: input.batchId,
				suppression: member ? suppressions.get(normalizeEmail(member.email)) : null,
				pending: pendingSends.get(memberId) ?? null,
				input,
				now
			});
		});
		const sendable = decisions.filter(
			(decision) =>
				decision.step && (decision.status === 'queued' || decision.status === 'sent')
		);

		if (input.dryRun) {
			return {
				campaignId,
				cohortId,
				dryRun: true,
				triggerMode: input.triggerMode,
				counts: this.summarizeTriggerResults(decisions),
				results: decisions
			};
		}

		const queueRows = sendable.map((decision) => ({
			member_id: decision.memberId,
			campaign_id: campaignId,
			cohort_id: cohortId,
			batch_id: decision.batchId ?? input.batchId ?? 'unbatched',
			user_id: decision.userId,
			recipient_email: decision.email,
			step: decision.step,
			variant: decision.variant ?? RETARGETING_DEFAULT_VARIANT,
			status: 'queued',
			trigger_source: 'admin_bulk',
			trigger_mode: input.triggerMode,
			scheduled_for: decision.scheduledFor ?? now.toISOString(),
			queued_by_admin: input.sentByUserId,
			metadata: {
				schedule_mode: input.scheduleMode ?? 'flow_cadence',
				dry_run: false,
				requested_scheduled_for: input.scheduledFor ?? null,
				demo_url: input.demoUrl ?? null
			}
		}));

		let insertedRows: RetargetingSendQueueRow[] = [];
		if (queueRows.length > 0) {
			const { data, error } = await this.sendsTable().insert(queueRows).select('*');
			if (error) {
				throw new Error(`Failed to queue reactivation sends: ${error.message}`);
			}
			insertedRows = (data || []) as RetargetingSendQueueRow[];
		}

		let results = decisions.map((decision) => {
			const inserted = insertedRows.find((row) => row.member_id === decision.memberId);
			return inserted
				? {
						...decision,
						sendId: inserted.id,
						status: 'queued' as RetargetingTriggerResultStatus,
						scheduledFor: inserted.scheduled_for,
						reason: `${stepLabel(inserted.step)} queued.`
					}
				: decision;
		});

		if (input.triggerMode === 'send_now' && insertedRows.length > 0) {
			const processed = await this.processQueueRows(insertedRows, {
				demoUrl: input.demoUrl,
				variant: input.variant,
				endpoint: '/api/admin/retargeting/send'
			});
			const byMemberId = new Map(
				processed.results.map((result) => [result.memberId, result])
			);
			results = results.map((result) => byMemberId.get(result.memberId) ?? result);
		}

		return {
			campaignId,
			cohortId,
			dryRun: false,
			triggerMode: input.triggerMode,
			counts: this.summarizeTriggerResults(results),
			results
		};
	}

	async processDueSends(input: ProcessDueRetargetingSendsInput = {}) {
		const now = input.now ?? new Date();
		const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
		const { data, error } = await this.sendsTable()
			.select('*')
			.eq('status', 'queued')
			.lte('scheduled_for', now.toISOString())
			.order('scheduled_for', { ascending: true })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to load due reactivation sends: ${error.message}`);
		}

		const rows = (data || []) as RetargetingSendQueueRow[];
		const result = await this.processQueueRows(rows, {
			endpoint: '/api/cron/reactivation-sequence'
		});

		return {
			claimed: rows.length,
			...result
		};
	}

	private summarizeTriggerResults(results: RetargetingTriggerMemberResult[]) {
		return {
			selected: results.length,
			queued: results.filter((result) => result.status === 'queued').length,
			sent: results.filter((result) => result.status === 'sent').length,
			skipped: results.filter((result) => result.status === 'skipped').length,
			failed: results.filter((result) => result.status === 'failed').length
		};
	}

	private async processQueueRows(
		rows: RetargetingSendQueueRow[],
		options: {
			demoUrl?: string | null;
			variant?: string | null;
			endpoint: string;
		}
	): Promise<{
		counts: ReturnType<RetargetingPilotService['summarizeTriggerResults']>;
		results: RetargetingTriggerMemberResult[];
	}> {
		if (rows.length === 0) {
			return {
				counts: this.summarizeTriggerResults([]),
				results: []
			};
		}

		const groups = new Map<string, RetargetingSendQueueRow[]>();
		for (const row of rows) {
			const key = `${row.campaign_id}:${row.cohort_id}`;
			groups.set(key, [...(groups.get(key) ?? []), row]);
		}

		const memberMetrics = new Map<string, RetargetingPilotMetricRow>();
		for (const [key] of groups) {
			const [campaignId = RETARGETING_DEFAULT_CAMPAIGN_ID, cohortId = ''] = key.split(':');
			if (!cohortId) {
				continue;
			}
			const members = await this.getMetricRows({ campaignId, cohortId });
			for (const member of members) {
				memberMetrics.set(member.id, member);
			}
		}

		const suppressions = await this.loadSuppressions(rows.map((row) => row.recipient_email));
		const results: RetargetingTriggerMemberResult[] = [];

		for (const row of rows) {
			const claimed = await this.claimQueuedSend(row.id);
			if (!claimed) {
				results.push(this.queueRowResult(row, 'skipped', 'Send was already claimed.'));
				continue;
			}

			const member = memberMetrics.get(row.member_id) ?? null;
			const blockReason = this.getQueuedSendBlockReason(
				claimed,
				member,
				suppressions.get(normalizeEmail(claimed.recipient_email)) ?? null
			);

			if (blockReason) {
				await this.markQueuedSend(claimed.id, {
					status: 'skipped',
					skipped_at: new Date().toISOString(),
					failure_reason: blockReason
				});
				results.push(
					this.queueRowResult(claimed, 'skipped', blockReason, member ?? undefined)
				);
				continue;
			}

			try {
				const sent = await this.sendQueuedMemberStep(claimed, member!, options);
				results.push(sent);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				await this.markQueuedSend(claimed.id, {
					status: 'failed',
					failed_at: new Date().toISOString(),
					failure_reason: message
				});
				await this.errorLogger.logError(error, {
					userId: member?.user_id,
					endpoint: options.endpoint,
					httpMethod: 'POST',
					operationType: 'retargeting_pilot_queue_send',
					tableName: 'retargeting_founder_pilot_sends',
					recordId: claimed.id,
					operationPayload: {
						campaignId: claimed.campaign_id,
						cohortId: claimed.cohort_id,
						batchId: claimed.batch_id,
						step: claimed.step
					}
				});
				results.push(this.queueRowResult(claimed, 'failed', message, member ?? undefined));
			}
		}

		return {
			counts: this.summarizeTriggerResults(results),
			results
		};
	}

	private async claimQueuedSend(sendId: string): Promise<RetargetingSendQueueRow | null> {
		const { data, error } = await this.sendsTable()
			.update({ status: 'sending' })
			.eq('id', sendId)
			.eq('status', 'queued')
			.select('*')
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to claim queued reactivation send: ${error.message}`);
		}

		return (data as RetargetingSendQueueRow | null) ?? null;
	}

	private async markQueuedSend(sendId: string, updates: Record<string, unknown>): Promise<void> {
		const { error } = await this.sendsTable().update(updates).eq('id', sendId);
		if (error) {
			throw new Error(`Failed to update queued reactivation send: ${error.message}`);
		}
	}

	private getQueuedSendBlockReason(
		row: RetargetingSendQueueRow,
		member: RetargetingPilotMetricRow | null,
		suppression: RetargetingSuppressionRow | null
	): string | null {
		if (!member) {
			return 'Member was not found.';
		}
		if (suppression) {
			return `Email is suppressed (${suppression.reason}).`;
		}
		if (member.holdout) {
			return 'Member is in the holdout group.';
		}
		if (member.manual_stop) {
			return 'Member is manually stopped.';
		}
		if (member.reply_status !== 'none') {
			return `Member has reply status ${member.reply_status}.`;
		}
		if (row.step === 'touch_1' && member.touch_1_sent_at) {
			return 'Touch 1 was already sent.';
		}
		if (row.step === 'touch_2') {
			if (!member.touch_1_sent_at) {
				return 'Touch 2 requires Touch 1 to be sent first.';
			}
			if (member.touch_2_sent_at) {
				return 'Touch 2 was already sent.';
			}
			if (member.first_post_send_activity_at) {
				return 'Member already returned after Touch 1.';
			}
		}
		if (row.step === 'touch_3') {
			if (!member.touch_1_sent_at) {
				return 'Touch 3 requires Touch 1 to be sent first.';
			}
			if (member.touch_3_sent_at) {
				return 'Touch 3 was already sent.';
			}
			if (member.first_post_send_action_at) {
				return 'Member already took a post-send action.';
			}
			if (!member.any_open && !member.any_click) {
				return 'Touch 3 requires a prior open or click.';
			}
		}
		return null;
	}

	private async sendQueuedMemberStep(
		row: RetargetingSendQueueRow,
		member: RetargetingPilotMetricRow,
		options: {
			demoUrl?: string | null;
			variant?: string | null;
			endpoint: string;
		}
	): Promise<RetargetingTriggerMemberResult> {
		const sentAt = new Date().toISOString();
		const result = await this.sendMemberStepEmail({
			member,
			campaignId: row.campaign_id,
			cohortId: row.cohort_id,
			batchId: row.batch_id,
			step: row.step,
			variant: options.variant ?? row.variant,
			demoUrl:
				row.step === 'touch_2'
					? (options.demoUrl ??
						(typeof row.metadata?.demo_url === 'string' ? row.metadata.demo_url : null))
					: options.demoUrl,
			sentByUserId: row.queued_by_admin ?? row.sent_by_admin ?? 'automated-service',
			sendId: row.id
		});

		await this.markQueuedSend(row.id, {
			status: 'sent',
			email_id: result.emailId,
			sent_at: sentAt,
			sent_by_admin: row.queued_by_admin ?? row.sent_by_admin,
			failure_reason: null
		});

		return {
			memberId: member.id,
			userId: member.user_id,
			email: member.email,
			name: member.name,
			batchId: member.batch_id,
			step: row.step,
			variant: result.variant,
			status: 'sent',
			scheduledFor: row.scheduled_for,
			sendId: row.id,
			emailId: result.emailId,
			reason: `${stepLabel(row.step)} sent.`
		};
	}

	private queueRowResult(
		row: RetargetingSendQueueRow,
		status: RetargetingTriggerResultStatus,
		reason: string,
		member?: RetargetingPilotMetricRow
	): RetargetingTriggerMemberResult {
		return {
			memberId: row.member_id,
			userId: row.user_id,
			email: row.recipient_email,
			name: member?.name ?? null,
			batchId: row.batch_id,
			step: row.step,
			variant: row.variant,
			status,
			scheduledFor: row.scheduled_for,
			sendId: row.id,
			emailId: row.email_id,
			reason
		};
	}

	private async sendMemberStepEmail(input: {
		member: RetargetingPilotMetricRow;
		campaignId: string;
		cohortId: string;
		batchId: string;
		step: RetargetingPilotStep;
		variant?: string | null;
		demoUrl?: string | null;
		sentByUserId: string;
		sendId?: string | null;
	}): Promise<{ emailId: string | null; variant: RetargetingVariant }> {
		if (input.step === 'touch_2' && !input.demoUrl?.trim()) {
			throw new Error('demo_url is required for Touch 2 sends');
		}

		let content = buildRetargetingEmailContent({
			baseUrl: this.baseUrl,
			campaignId: input.campaignId,
			cohortId: input.cohortId,
			batchId: input.batchId,
			member: input.member,
			step: input.step,
			variant: input.variant ?? input.member.variant ?? RETARGETING_DEFAULT_VARIANT,
			demoUrl: input.demoUrl
		});
		content = (await applyEmailCopyOverride(this.supabase, {
			sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
			stepKey: input.step,
			variantKey: content.variant,
			content: {
				...content,
				ctaLabel: content.primaryCtaUrl ? 'Open BuildOS' : null,
				ctaUrl: content.primaryCtaUrl
			},
			tokens: buildEmailCopyTokens({
				name: input.member.name,
				email: input.member.email,
				baseUrl: this.baseUrl,
				ctaLabel: content.primaryCtaUrl ? 'Open BuildOS' : null,
				ctaUrl: content.primaryCtaUrl,
				appUrl: content.primaryCtaUrl,
				demoUrl: content.secondaryCtaUrl
			})
		})) as typeof content;

		const sendResult = await this.emailService.sendEmail({
			to: input.member.email,
			subject: content.subject,
			body: content.body,
			html: content.html,
			from: 'dj',
			userId: input.member.user_id,
			createdBy: input.sentByUserId,
			metadata: {
				category: 'retargeting_pilot',
				campaign_type: 'retargeting',
				campaign_id: input.campaignId,
				cohort_id: input.cohortId,
				batch_id: input.batchId,
				step: content.stepNumber,
				step_key: input.step,
				variant: content.variant,
				send_type: 'manual_founder_led',
				retargeting_send_id: input.sendId ?? null,
				member_id: input.member.id,
				holdout: false,
				conversion_window_days: input.member.conversion_window_days,
				primary_cta_url: content.primaryCtaUrl,
				secondary_cta_url: content.secondaryCtaUrl,
				sent_by_admin: input.sentByUserId,
				user_id: input.member.user_id
			}
		});

		if (!sendResult.success) {
			throw new Error(sendResult.error || 'Failed to send retargeting email');
		}

		const { error: updateError } = await this.membersTable()
			.update({
				[stepSentField(input.step)]: new Date().toISOString(),
				variant: content.variant
			})
			.eq('id', input.member.id);

		if (updateError) {
			throw new Error(`Failed to update retargeting member state: ${updateError.message}`);
		}

		return {
			emailId: sendResult.emailId ?? null,
			variant: content.variant
		};
	}

	async getMemberTimeline(memberId: string) {
		const member = await this.getMetricRowForMember(memberId);
		if (!member) {
			throw new Error('Retargeting member not found');
		}

		const [{ data: sendData, error: sendsError }, emailRows] = await Promise.all([
			this.sendsTable()
				.select('*')
				.eq('member_id', member.id)
				.order('scheduled_for', { ascending: true }),
			this.loadRetargetingEmailsForMember(member)
		]);
		if (sendsError) {
			throw new Error(`Failed to load reactivation sends: ${sendsError.message}`);
		}

		const sends = (sendData || []) as RetargetingSendQueueRow[];
		const emailIds = Array.from(
			new Set([
				...sends.map((send) => send.email_id).filter((id): id is string => Boolean(id)),
				...emailRows.map((email) => email.id)
			])
		);
		const trackingEvents = await this.loadTrackingEvents(emailIds);
		const events: RetargetingTimelineEvent[] = [
			{
				id: `cohort:${member.id}`,
				type: 'cohort',
				label: 'Added to reactivation cohort',
				description: `${member.cohort_id} / ${member.batch_id ?? 'no batch'}`,
				occurredAt: member.cohort_frozen_at,
				step: null,
				stepLabel: null,
				emailId: null,
				subject: null
			}
		];

		for (const send of sends) {
			const type =
				send.status === 'sent'
					? 'sent'
					: send.status === 'failed'
						? 'failed'
						: send.status === 'skipped'
							? 'skipped'
							: 'scheduled';
			events.push({
				id: `send:${send.id}`,
				type,
				label:
					type === 'scheduled'
						? `${stepLabel(send.step)} scheduled`
						: `${stepLabel(send.step)} ${send.status}`,
				description: send.failure_reason,
				occurredAt: send.sent_at ?? send.failed_at ?? send.skipped_at ?? send.scheduled_for,
				step: send.step,
				stepLabel: stepLabel(send.step),
				emailId: send.email_id,
				subject: null
			});
		}

		for (const email of emailRows) {
			const step = stepFromEmailMetadata(email.template_data);
			events.push({
				id: `email:${email.id}`,
				type: 'sent',
				label: `${stepLabel(step) ?? 'Reactivation email'} sent`,
				description: null,
				occurredAt: email.sent_at ?? email.created_at,
				step,
				stepLabel: stepLabel(step),
				emailId: email.id,
				subject: email.subject
			});
		}

		for (const event of trackingEvents) {
			if (event.event_type !== 'opened' && event.event_type !== 'clicked') {
				continue;
			}
			const email = emailRows.find((row) => row.id === event.email_id);
			const step = stepFromEmailMetadata(email?.template_data ?? null);
			events.push({
				id: `tracking:${event.email_id}:${event.event_type}:${event.created_at ?? event.timestamp}`,
				type: event.event_type === 'opened' ? 'opened' : 'clicked',
				label: event.event_type === 'opened' ? 'Opened email' : 'Clicked email',
				description: email?.subject ?? null,
				occurredAt: event.created_at ?? event.timestamp ?? new Date().toISOString(),
				step,
				stepLabel: stepLabel(step),
				emailId: event.email_id,
				subject: email?.subject ?? null
			});
		}

		if (member.return_session_at) {
			events.push({
				id: `return:${member.id}`,
				type: 'returned',
				label: 'Returned to BuildOS',
				description: member.attribution_type,
				occurredAt: member.return_session_at,
				step: member.attributed_step as RetargetingPilotStep | null,
				stepLabel: stepLabel(member.attributed_step as RetargetingPilotStep | null),
				emailId: null,
				subject: null
			});
		}

		if (member.first_action_at) {
			events.push({
				id: `action:${member.id}`,
				type: 'activity',
				label: 'Took a BuildOS action',
				description: 'First tracked post-send action.',
				occurredAt: member.first_action_at,
				step: member.attributed_step as RetargetingPilotStep | null,
				stepLabel: stepLabel(member.attributed_step as RetargetingPilotStep | null),
				emailId: null,
				subject: null
			});
		}

		return events.sort(
			(left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
		);
	}

	async getReactivationActivity(memberId: string) {
		const member = await this.getMetricRowForMember(memberId);
		if (!member) {
			throw new Error('Retargeting member not found');
		}

		const [timeline, activityItems, pendingSends] = await Promise.all([
			this.getMemberTimeline(memberId),
			this.loadBuildOsActivity(member),
			this.loadPendingSends([member.id])
		]);
		const operationalRow = (
			await this.getMemberOperationalRows({
				campaignId: member.campaign_id,
				cohortId: member.cohort_id,
				batchId: member.batch_id
			})
		).find((row) => row.memberId === member.id);

		return {
			member: operationalRow ?? null,
			rawMember: member,
			pendingSend: pendingSends.get(member.id) ?? null,
			timeline,
			activity: activityItems,
			stats: {
				sentCount: countSentTouches(member),
				opened: member.any_open,
				clicked: member.any_click,
				returnedAt: member.return_session_at,
				firstActionAt: member.first_action_at,
				activeDays30d: member.active_days_30d,
				lastActivityAt: getLastActivityAt(member)
			}
		};
	}

	private async getMetricRowForMember(
		memberId: string
	): Promise<RetargetingPilotMetricRow | null> {
		const { data, error } = await this.membersTable()
			.select('campaign_id, cohort_id')
			.eq('id', memberId)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to load retargeting member: ${error.message}`);
		}
		if (!data?.campaign_id || !data?.cohort_id) {
			return null;
		}

		const members = await this.getMetricRows({
			campaignId: data.campaign_id,
			cohortId: data.cohort_id
		});
		return members.find((member) => member.id === memberId) ?? null;
	}

	private async loadRetargetingEmailsForMember(member: RetargetingPilotMetricRow): Promise<
		Array<{
			id: string;
			subject: string;
			sent_at: string | null;
			created_at: string;
			template_data: Record<string, unknown> | null;
		}>
	> {
		const { data, error } = await (this.supabase as any)
			.from('emails')
			.select('id, subject, sent_at, created_at, template_data')
			.eq('category', 'retargeting_pilot')
			.contains('template_data', {
				campaign_id: member.campaign_id,
				cohort_id: member.cohort_id,
				user_id: member.user_id
			})
			.order('sent_at', { ascending: false, nullsFirst: false })
			.limit(50);

		if (error) {
			throw new Error(`Failed to load retargeting emails: ${error.message}`);
		}

		return (data || []) as Array<{
			id: string;
			subject: string;
			sent_at: string | null;
			created_at: string;
			template_data: Record<string, unknown> | null;
		}>;
	}

	private async loadTrackingEvents(emailIds: string[]): Promise<
		Array<{
			email_id: string;
			event_type: string;
			created_at: string | null;
			timestamp: string | null;
		}>
	> {
		if (emailIds.length === 0) {
			return [];
		}

		const { data, error } = await (this.supabase as any)
			.from('email_tracking_events')
			.select('email_id, event_type, created_at, timestamp')
			.in('email_id', emailIds)
			.order('created_at', { ascending: false })
			.limit(500);

		if (error) {
			throw new Error(`Failed to load tracking events: ${error.message}`);
		}

		return (data || []) as Array<{
			email_id: string;
			event_type: string;
			created_at: string | null;
			timestamp: string | null;
		}>;
	}

	private async loadBuildOsActivity(
		member: RetargetingPilotMetricRow
	): Promise<RetargetingActivityItem[]> {
		const firstSendAt = parseDate(member.first_send_at ?? member.touch_1_sent_at);
		const userId = member.user_id;
		if (!userId) {
			return [];
		}

		const [chatSessions, braindumps, projectLogs, dailyBriefs] = await Promise.all([
			this.safeActivityQuery<{
				id: string;
				title?: string | null;
				summary?: string | null;
				created_at: string;
			}>(() =>
				(this.supabase as any)
					.from('agent_chat_sessions')
					.select('id, title, summary, created_at')
					.eq('user_id', userId)
					.order('created_at', { ascending: false })
					.limit(20)
			),
			this.safeActivityQuery<{
				id: string;
				created_at: string;
			}>(() =>
				(this.supabase as any)
					.from('onto_braindumps')
					.select('id, created_at')
					.eq('user_id', userId)
					.order('created_at', { ascending: false })
					.limit(20)
			),
			this.safeActivityQuery<{
				id?: string | null;
				entity_type?: string | null;
				action?: string | null;
				created_at: string;
			}>(() =>
				(this.supabase as any)
					.from('onto_project_logs')
					.select('id, entity_type, action, created_at')
					.eq('changed_by', userId)
					.order('created_at', { ascending: false })
					.limit(30)
			),
			this.safeActivityQuery<{
				id: string;
				brief_date?: string | null;
				created_at: string;
			}>(() =>
				(this.supabase as any)
					.from('ontology_daily_briefs')
					.select('id, brief_date, created_at')
					.eq('user_id', userId)
					.order('created_at', { ascending: false })
					.limit(20)
			)
		]);

		const items: RetargetingActivityItem[] = [
			...chatSessions.map((row) => ({
				id: `chat:${row.id}`,
				type: 'chat_session',
				label: row.title || row.summary || 'Chat session',
				description: row.summary ?? null,
				occurredAt: row.created_at,
				afterFirstSend: firstSendAt
					? Date.parse(row.created_at) > firstSendAt.getTime()
					: false
			})),
			...braindumps.map((row) => ({
				id: `braindump:${row.id}`,
				type: 'braindump',
				label: 'Brain dump',
				description: null,
				occurredAt: row.created_at,
				afterFirstSend: firstSendAt
					? Date.parse(row.created_at) > firstSendAt.getTime()
					: false
			})),
			...projectLogs.map((row) => ({
				id: `project-log:${row.id ?? `${row.entity_type}:${row.created_at}`}`,
				type: 'project_log',
				label: `${row.action ?? 'Project activity'} ${row.entity_type ?? ''}`.trim(),
				description: null,
				occurredAt: row.created_at,
				afterFirstSend: firstSendAt
					? Date.parse(row.created_at) > firstSendAt.getTime()
					: false
			})),
			...dailyBriefs.map((row) => ({
				id: `daily-brief:${row.id}`,
				type: 'daily_brief',
				label: 'Daily brief generated',
				description: row.brief_date ?? null,
				occurredAt: row.created_at,
				afterFirstSend: firstSendAt
					? Date.parse(row.created_at) > firstSendAt.getTime()
					: false
			}))
		];

		return items
			.filter((item) => Boolean(item.occurredAt))
			.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
			.slice(0, 60);
	}

	private async safeActivityQuery<T>(
		buildQuery: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
	): Promise<T[]> {
		try {
			const { data, error } = await buildQuery();
			if (error) {
				return [];
			}
			return data || [];
		} catch {
			return [];
		}
	}

	async sendStep(input: SendRetargetingStepInput) {
		const campaignId = input.campaignId || RETARGETING_DEFAULT_CAMPAIGN_ID;
		const batchId = input.batchId.trim();
		if (!batchId) {
			throw new Error('batch_id is required for retargeting sends');
		}

		if (input.step === 'touch_2' && !input.demoUrl?.trim()) {
			throw new Error('demo_url is required for Touch 2 sends');
		}

		const members = await this.getMetricRows({
			campaignId,
			cohortId: input.cohortId
		});

		const candidates = listRetargetingStepCandidates(members, {
			step: input.step,
			batchId,
			now: new Date()
		});

		if (input.dryRun) {
			return {
				campaignId,
				cohortId: input.cohortId,
				step: input.step,
				batchId,
				dryRun: true,
				counts: {
					candidates: candidates.length,
					sent: 0,
					failed: 0
				},
				candidates
			};
		}

		const errors: Array<{ memberId: string; email: string; error: string }> = [];
		const sentMemberIds: string[] = [];
		const sentField = stepSentField(input.step);

		for (const member of candidates) {
			try {
				if (!member.batch_id) {
					throw new Error('batch_id is required to send retargeting email');
				}

				let content = buildRetargetingEmailContent({
					baseUrl: this.baseUrl,
					campaignId,
					cohortId: input.cohortId,
					batchId: member.batch_id,
					member,
					step: input.step,
					variant: input.variant ?? member.variant ?? RETARGETING_DEFAULT_VARIANT,
					demoUrl: input.demoUrl
				});
				content = (await applyEmailCopyOverride(this.supabase, {
					sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
					stepKey: input.step,
					variantKey: content.variant,
					content: {
						...content,
						ctaLabel: content.primaryCtaUrl ? 'Open BuildOS' : null,
						ctaUrl: content.primaryCtaUrl
					},
					tokens: buildEmailCopyTokens({
						name: member.name,
						email: member.email,
						baseUrl: this.baseUrl,
						ctaLabel: content.primaryCtaUrl ? 'Open BuildOS' : null,
						ctaUrl: content.primaryCtaUrl,
						appUrl: content.primaryCtaUrl,
						demoUrl: content.secondaryCtaUrl
					})
				})) as typeof content;
				const nowIso = new Date().toISOString();
				const sendResult = await this.emailService.sendEmail({
					to: member.email,
					subject: content.subject,
					body: content.body,
					html: content.html,
					from: 'dj',
					userId: member.user_id,
					createdBy: input.sentByUserId,
					metadata: {
						category: 'retargeting_pilot',
						campaign_type: 'retargeting',
						campaign_id: campaignId,
						cohort_id: input.cohortId,
						batch_id: member.batch_id,
						step: content.stepNumber,
						variant: content.variant,
						send_type: 'manual_founder_led',
						holdout: false,
						conversion_window_days: member.conversion_window_days,
						primary_cta_url: content.primaryCtaUrl,
						secondary_cta_url: content.secondaryCtaUrl,
						sent_by_admin: input.sentByUserId,
						user_id: member.user_id
					}
				});

				if (!sendResult.success) {
					throw new Error(sendResult.error || 'Failed to send retargeting email');
				}

				const { error: updateError } = await this.membersTable()
					.update({
						[sentField]: nowIso,
						variant: content.variant
					})
					.eq('id', member.id);

				if (updateError) {
					throw new Error(
						`Failed to update retargeting member state: ${updateError.message}`
					);
				}

				sentMemberIds.push(member.id);
			} catch (error) {
				await this.errorLogger.logError(error, {
					userId: member.user_id,
					endpoint: '/api/admin/retargeting/send',
					httpMethod: 'POST',
					operationType: 'retargeting_pilot_send_member',
					tableName: 'retargeting_founder_pilot_members',
					recordId: member.id,
					operationPayload: {
						campaignId,
						cohortId: input.cohortId,
						batchId: member.batch_id,
						step: input.step,
						variant: input.variant ?? member.variant ?? RETARGETING_DEFAULT_VARIANT
					},
					metadata: {
						memberEmail: member.email,
						sentByUserId: input.sentByUserId
					}
				});
				errors.push({
					memberId: member.id,
					email: member.email,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		return {
			campaignId,
			cohortId: input.cohortId,
			step: input.step,
			batchId,
			dryRun: false,
			counts: {
				candidates: candidates.length,
				sent: sentMemberIds.length,
				failed: errors.length
			},
			sentMemberIds,
			errors
		};
	}

	async updateMember(memberId: string, input: UpdateRetargetingMemberInput) {
		const trimmedId = memberId.trim();
		if (!trimmedId) {
			throw new Error('memberId is required');
		}

		const updates: Record<string, unknown> = {};
		const nowIso = new Date().toISOString();

		if (typeof input.manualStop === 'boolean') {
			updates.manual_stop = input.manualStop;
			updates.manual_stop_at = input.manualStop ? nowIso : null;
			updates.manual_stop_reason = input.manualStop ? (input.manualStopReason ?? null) : null;
		} else if (typeof input.manualStopReason !== 'undefined') {
			updates.manual_stop_reason = input.manualStopReason ?? null;
		}

		if (typeof input.replyStatus !== 'undefined') {
			updates.reply_status = input.replyStatus;
			updates.reply_recorded_at = input.replyStatus === 'none' ? null : nowIso;
		}

		if (typeof input.notes !== 'undefined') {
			updates.notes = input.notes ?? null;
		}

		if (Object.keys(updates).length === 0) {
			throw new Error('At least one retargeting member field must be updated');
		}

		const { data, error } = await this.membersTable()
			.update(updates)
			.eq('id', trimmedId)
			.select('*')
			.single();

		if (error) {
			throw new Error(`Failed to update retargeting member: ${error.message}`);
		}

		return data as RetargetingPilotMemberRow;
	}
}

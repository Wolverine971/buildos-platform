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
	summarizeRetargetingOutcomes,
	type RetargetingPilotMemberRow,
	type RetargetingPilotMetricRow,
	type RetargetingPilotStep
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

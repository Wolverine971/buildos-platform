// apps/worker/src/workers/brief/briefWorker.ts
import { format } from 'date-fns';
import { getTimezoneOffset, toZonedTime } from 'date-fns-tz';

import { supabase } from '../../lib/supabase';
import { captureWorkerEvent } from '../../lib/posthog';
import { createServiceClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';
import {
	BriefJobData,
	broadcastUserEvent,
	updateJobStatus,
	validateBriefJobData
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { generateOntologyDailyBrief } from './ontologyBriefGenerator';
import { generateCorrelationId } from '@buildos/shared-utils';
import {
	getExistingBriefJobDecision,
	type ExistingBriefJobDecision,
	getStaleBriefJobDecision
} from './briefDateGuard';
import { enqueueBriefAudioIfEnabled } from '../briefAudio/enqueueBriefAudio';

/**
 * Validates if a timezone string is valid
 * @param timezone The timezone string to validate
 * @returns true if valid, false otherwise
 */
function isValidTimezone(timezone: string): boolean {
	try {
		// Try to get the timezone offset - this will throw if invalid
		getTimezoneOffset(timezone, new Date());
		return true;
	} catch {
		return false;
	}
}

async function recordSkippedBriefJobMetadata(
	job: LegacyJob<BriefJobData>,
	decision: ExistingBriefJobDecision
) {
	if (!decision.reason) return;

	const skippedAt = new Date().toISOString();
	const metadata = {
		...job.data,
		skipReason: decision.reason,
		skippedAt,
		existingBriefId: decision.existingBriefId
	};

	let query = supabase
		.from('queue_jobs')
		.update({ metadata: metadata as unknown as Json })
		.eq('queue_job_id', job.id);

	if (job.processingToken) {
		query = query.eq('processing_token', job.processingToken);
	}

	const { error } = await query;
	if (error) {
		console.warn(`Failed to record skipped brief metadata for job ${job.id}: ${error.message}`);
	}
}

/**
 * Builds the brief.completed payload from persisted brief rows and emits it.
 * Safe to call for an already-emitted brief: emit_notification_event dedupes on
 * (event_type, user, brief_id) and returns the existing event without creating
 * new deliveries. Never throws — emission failures must not fail the brief job.
 */
async function emitBriefCompletedEvent(params: {
	userId: string;
	briefId: string;
	briefDate: string;
	timezone: string;
	notificationScheduledFor?: string;
	useOntology: boolean;
}) {
	const { userId, briefId, briefDate, timezone, useOntology } = params;

	try {
		const serviceClient = createServiceClient();

		// Get task and project counts from appropriate table
		let projectCount = 0;
		let todaysTaskCount = 0;
		let overdueTaskCount = 0;
		let upcomingTaskCount = 0;
		let nextSevenDaysTaskCount = 0;
		let recentlyCompletedCount = 0;
		let blockedTaskCount = 0;

		// Query ontology_project_briefs for ontology-based briefs
		const { data: ontologyProjectBriefs } = await supabase
			.from('ontology_project_briefs')
			.select('id, metadata')
			.eq('daily_brief_id', briefId);

		projectCount = ontologyProjectBriefs?.length || 0;

		// Extract counts from ontology metadata (camelCase keys)
		todaysTaskCount =
			ontologyProjectBriefs?.reduce((sum, pb) => {
				const meta = pb.metadata as Record<string, unknown>;
				return sum + (typeof meta?.todaysTaskCount === 'number' ? meta.todaysTaskCount : 0);
			}, 0) || 0;

		// Ontology briefs use 'thisWeekTaskCount' instead of 'upcomingTaskCount'
		upcomingTaskCount =
			ontologyProjectBriefs?.reduce((sum, pb) => {
				const meta = pb.metadata as Record<string, unknown>;
				return (
					sum + (typeof meta?.thisWeekTaskCount === 'number' ? meta.thisWeekTaskCount : 0)
				);
			}, 0) || 0;

		// blockedTaskCount available in ontology briefs
		const blockedCount =
			ontologyProjectBriefs?.reduce((sum, pb) => {
				const meta = pb.metadata as Record<string, unknown>;
				return (
					sum + (typeof meta?.blockedTaskCount === 'number' ? meta.blockedTaskCount : 0)
				);
			}, 0) || 0;
		blockedTaskCount = blockedCount;

		// Fetch aggregate counts from ontology_daily_briefs metadata
		const { data: ontologyDailyBrief } = await supabase
			.from('ontology_daily_briefs')
			.select('metadata')
			.eq('id', briefId)
			.single();

		const ontologyMeta = ontologyDailyBrief?.metadata as Record<string, unknown> | null;
		overdueTaskCount =
			typeof ontologyMeta?.overdueCount === 'number' ? ontologyMeta.overdueCount : 0;
		recentlyCompletedCount =
			typeof ontologyMeta?.recentUpdatesCount === 'number'
				? ontologyMeta.recentUpdatesCount
				: 0;
		nextSevenDaysTaskCount = upcomingTaskCount;

		console.log(
			`🧬 Ontology brief stats - Projects: ${projectCount}, Today's tasks: ${todaysTaskCount}, This week: ${upcomingTaskCount}, Overdue: ${overdueTaskCount}, Blocked: ${blockedCount}`
		);

		// Get notification scheduled time from job data (if provided)
		const notificationScheduledFor = params.notificationScheduledFor
			? new Date(params.notificationScheduledFor)
			: undefined;

		if (notificationScheduledFor) {
			console.log(
				`📅 Scheduling notification for ${notificationScheduledFor.toISOString()} (user's preferred time)`
			);
		} else {
			console.log(`📅 Sending notification immediately (no scheduled time provided)`);
		}

		console.log(
			`📊 Task counts - Today: ${todaysTaskCount}, Overdue: ${overdueTaskCount}, Upcoming: ${upcomingTaskCount}, Next 7 days: ${nextSevenDaysTaskCount}, Recently completed: ${recentlyCompletedCount}`
		);

		// Generate correlation ID for end-to-end tracking
		const correlationId = generateCorrelationId();
		console.log(
			`🔗 Generated correlation ID: ${correlationId} for brief.completed notification`
		);

		// Type assertion needed until database types are regenerated after migration
		await (serviceClient.rpc as any)('emit_notification_event', {
			p_event_type: 'brief.completed',
			p_event_source: 'worker_job',
			p_target_user_id: userId,
			p_payload: {
				brief_id: briefId,
				brief_date: briefDate,
				timezone: timezone,
				task_count: todaysTaskCount, // Keep for backward compatibility
				todays_task_count: todaysTaskCount,
				overdue_task_count: overdueTaskCount,
				upcoming_task_count: upcomingTaskCount,
				next_seven_days_task_count: nextSevenDaysTaskCount,
				recently_completed_count: recentlyCompletedCount,
				blocked_task_count: blockedTaskCount,
				project_count: projectCount,
				correlationId, // Add correlation ID to payload
				is_ontology_brief: useOntology // Flag for downstream consumers
			},
			p_metadata: {
				correlationId, // Add correlation ID to metadata for tracking
				is_ontology_brief: useOntology
			},
			p_scheduled_for: notificationScheduledFor?.toISOString() // Schedule at user's preferred time
		});

		console.log(`📬 Emitted brief.completed notification event for user ${userId}`);
	} catch (notificationError) {
		// Log error but don't fail the brief job
		console.error('Failed to emit notification event:', notificationError);
	}
}

export async function processBriefJob(job: LegacyJob<BriefJobData>) {
	console.log(`🏃 Processing brief job ${job.id} for user ${job.data.userId}`);

	const suppressNotification = job.data.options?.suppressNotification === true;

	try {
		// Validate job data immediately to catch errors early
		validateBriefJobData(job.data);

		await updateJobStatus(job.id, 'processing', 'brief', undefined, job.processingToken);

		// ALWAYS fetch user's timezone from users table (centralized source of truth)
		const { data: user, error: userError } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', job.data.userId)
			.single();

		if (userError || !user) {
			console.warn(
				`Failed to fetch user timezone: ${userError?.message || 'User not found'}, using fallback`
			);
		}

		// Use timezone from users table (centralized), fallback to job data, then UTC
		// No type assertion needed - properly handle null cases
		let timezone = user?.timezone || job.data.timezone || 'UTC';

		// Validate the timezone and fallback to UTC if invalid
		if (!isValidTimezone(timezone)) {
			console.warn(`Invalid timezone "${timezone}" detected, falling back to UTC`);
			timezone = 'UTC';
		}

		// Calculate briefDate based on the user's timezone
		let briefDate = job.data.briefDate;
		if (!briefDate) {
			// For immediate briefs, use "today" in the user's timezone
			const userCurrentTime = toZonedTime(new Date(), timezone);
			briefDate = format(userCurrentTime, 'yyyy-MM-dd');
		}

		// Validate the brief date is in the expected format
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(briefDate)) {
			throw new Error(`Invalid brief date format: ${briefDate}. Expected YYYY-MM-DD`);
		}

		// At this point, briefDate is guaranteed to be a valid date string
		const validatedBriefDate: string = briefDate;

		const staleBriefDecision = getStaleBriefJobDecision({
			briefDate: validatedBriefDate,
			timezone,
			options: job.data.options
		});

		if (staleBriefDecision.shouldSkip) {
			const reason =
				staleBriefDecision.reason ||
				`Brief date ${validatedBriefDate} is stale for ${timezone}`;
			console.warn(
				`⏭️ Skipping stale daily brief job ${job.id} for user ${job.data.userId}: ${reason}`
			);
			await job.log(reason);
			await updateJobStatus(job.id, 'completed', 'brief', undefined, job.processingToken);
			return;
		}

		const { data: existingBrief, error: existingBriefError } = await supabase
			.from('ontology_daily_briefs')
			.select('id, generation_status, updated_at')
			.eq('user_id', job.data.userId)
			.eq('brief_date', validatedBriefDate)
			.in('generation_status', ['completed', 'processing'])
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (existingBriefError && existingBriefError.code !== 'PGRST116') {
			console.warn(
				`Failed to check existing daily brief for user ${job.data.userId} on ${validatedBriefDate}: ${existingBriefError.message}`
			);
		} else {
			const existingBriefDecision = getExistingBriefJobDecision({
				briefDate: validatedBriefDate,
				existingBrief,
				options: job.data.options,
				// A retry means the prior attempt died — never let its abandoned
				// "processing" heartbeat swallow the recovery run.
				isRetryAttempt: (job.attemptsMade ?? 0) > 0
			});

			if (existingBriefDecision.shouldSkip) {
				const reason =
					existingBriefDecision.message ||
					`Brief ${validatedBriefDate} already exists or is processing`;
				console.warn(
					`⏭️ Skipping duplicate daily brief job ${job.id} for user ${job.data.userId}: ${reason}`
				);
				await job.log(reason);
				await recordSkippedBriefJobMetadata(job, existingBriefDecision);
				await updateJobStatus(job.id, 'completed', 'brief', undefined, job.processingToken);

				// A completed brief may exist without its notification ever having been
				// emitted (e.g. the generating attempt timed out after persisting the
				// brief but before emitting). Re-emit here — the event-level dedup in
				// emit_notification_event makes this a no-op when it already fired.
				if (
					existingBriefDecision.reason === 'skipped_existing_brief' &&
					existingBriefDecision.existingBriefId &&
					!suppressNotification
				) {
					await emitBriefCompletedEvent({
						userId: job.data.userId,
						briefId: existingBriefDecision.existingBriefId,
						briefDate: validatedBriefDate,
						timezone,
						notificationScheduledFor: job.data.notificationScheduledFor,
						useOntology: true
					});
				}
				return;
			}
		}

		console.log(
			`📅 Generating brief for date: ${validatedBriefDate} (timezone: ${timezone}, current time: ${new Date().toISOString()})`
		);

		// Log timezone conversion for debugging
		const userCurrentTime = toZonedTime(new Date(), timezone);
		console.log(
			`🕐 User's current time: ${format(userCurrentTime, 'yyyy-MM-dd HH:mm:ss zzz')}`
		);

		const useOntology = true;
		console.log(`🧬 Using ontology-based brief generation for user ${job.data.userId}`);
		const ontologyBrief = await generateOntologyDailyBrief(
			job.data.userId,
			validatedBriefDate,
			job.data.options,
			timezone,
			job.id
		);
		const brief: { id: string } = { id: ontologyBrief.id };

		try {
			await enqueueBriefAudioIfEnabled({
				briefId: brief.id,
				userId: job.data.userId
			});
			await job.log(`Brief audio narration checked for brief ${brief.id}`);
		} catch (audioError) {
			const message = audioError instanceof Error ? audioError.message : 'Unknown error';
			console.warn(`Failed to enqueue brief audio narration: ${message}`);
			await job.log(`Brief audio narration enqueue failed: ${message}`);
		}

		// Check user notification preferences for daily brief delivery
		const { data: notificationPrefs, error: notificationPrefsError } = await supabase
			.from('user_notification_preferences')
			.select('should_email_daily_brief, should_sms_daily_brief')
			.eq('user_id', job.data.userId)
			.single();

		if (notificationPrefsError && notificationPrefsError.code !== 'PGRST116') {
			console.warn(
				`Failed to fetch notification preferences for user ${job.data.userId}: ${notificationPrefsError.message}`
			);
		}

		const shouldEmailBrief = notificationPrefs?.should_email_daily_brief ?? false;
		const shouldSmsBrief = notificationPrefs?.should_sms_daily_brief ?? false;

		console.log(`📬 Notification preferences for user ${job.data.userId}:
   → should_email_daily_brief: ${shouldEmailBrief}
   → should_sms_daily_brief: ${shouldSmsBrief}`);

		// NOTE: Email and SMS notifications are now handled via the notification system (brief.completed event)
		// The emailAdapter and smsAdapter will fetch the full brief with LLM analysis and send it
		console.log(
			`📧 Email will be sent via notification system (should_email_daily_brief: ${shouldEmailBrief})`
		);

		// Handle SMS notifications via notification system
		if (shouldSmsBrief) {
			try {
				console.log(`📱 Checking SMS eligibility for user ${job.data.userId}`);

				// Check SMS preferences (phone verification required)
				const { data: smsPrefs, error: smsPrefsError } = await supabase
					.from('user_sms_preferences')
					.select('phone_number, phone_verified, opted_out')
					.eq('user_id', job.data.userId)
					.single();

				if (smsPrefsError && smsPrefsError.code !== 'PGRST116') {
					console.warn(`Failed to fetch SMS preferences: ${smsPrefsError.message}`);
				}

				if (!smsPrefs?.phone_number) {
					console.warn(`⚠️  User ${job.data.userId} wants SMS but has no phone number`);
				} else if (smsPrefs?.phone_verified !== true) {
					// Explicitly check for true - null/false/undefined all mean not verified
					console.warn(`⚠️  User ${job.data.userId} wants SMS but phone not verified`);
				} else if (smsPrefs?.opted_out === true) {
					// Explicitly check for true - null/false/undefined mean not opted out
					console.warn(`⚠️  User ${job.data.userId} has opted out of SMS`);
				} else {
					console.log(
						`✅ Phone verified for user ${job.data.userId}, SMS will be sent via notification system`
					);
					// SMS will be sent via emit_notification_event below
					// The notification system will check should_sms_daily_brief preference
				}
			} catch (smsError) {
				console.error(
					`Failed to check SMS eligibility: ${smsError instanceof Error ? smsError.message : 'Unknown error'}`
				);
			}
		} else {
			console.log(
				`📭 SMS notifications not enabled for user ${job.data.userId}, skipping SMS`
			);
		}

		await updateJobStatus(job.id, 'completed', 'brief', undefined, job.processingToken);

		captureWorkerEvent(job.data.userId, 'brief_generated', {
			brief_id: brief.id,
			brief_date: validatedBriefDate,
			timezone
		});

		// Emit notification event for brief completion
		if (suppressNotification) {
			console.log(
				`🔕 Skipping brief.completed notification for user ${job.data.userId} (daily briefs disabled by user)`
			);
		} else {
			await emitBriefCompletedEvent({
				userId: job.data.userId,
				briefId: brief.id,
				briefDate: validatedBriefDate,
				timezone,
				notificationScheduledFor: job.data.notificationScheduledFor,
				useOntology
			});
		}

		console.log(`✅ Completed brief generation for user ${job.data.userId}
   → Brief ID: ${brief.id}
   → Brief Date: ${validatedBriefDate}
   → Timezone: ${timezone}
   → Brief Type: ${useOntology ? 'ONTOLOGY 🧬' : 'LEGACY'}
   → Email Preference: ${shouldEmailBrief ? 'ENABLED ✅ (will be sent via notification system)' : 'DISABLED ❌'}
   → SMS Preference: ${shouldSmsBrief ? 'ENABLED ✅ (will be sent via notification system)' : 'DISABLED ❌'}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`❌ Failed to generate brief for user ${job.data.userId}:`, errorMessage);

		await updateJobStatus(job.id, 'failed', 'brief', errorMessage, job.processingToken);

		await broadcastUserEvent(job.data.userId, 'brief_failed', {
			error: errorMessage,
			jobId: job.id,
			message: 'Brief generation failed. Click to retry.'
		});

		// Emit notification event for brief failure (opt-in via subscriptions)
		if (suppressNotification) {
			console.log(
				`🔕 Skipping brief.failed notification for user ${job.data.userId} (daily briefs disabled by user)`
			);
			throw error;
		}
		try {
			const serviceClient = createServiceClient();
			const briefDate = job.data.briefDate || new Date().toISOString().slice(0, 10);
			const timezone = job.data.timezone || 'UTC';
			await (serviceClient.rpc as any)('emit_notification_event', {
				p_event_type: 'brief.failed',
				p_event_source: 'worker_job',
				p_target_user_id: job.data.userId,
				p_payload: {
					brief_date: briefDate,
					timezone,
					error_message: errorMessage,
					retry_count: job.attemptsMade || 0
				}
			});
		} catch (notificationError) {
			console.error('Failed to emit brief.failed notification event:', notificationError);
		}

		throw error;
	}
}

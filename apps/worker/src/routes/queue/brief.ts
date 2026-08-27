// apps/worker/src/routes/queue/brief.ts
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Application } from 'express';

import { getErrorMessage } from '../../http/errors';
import { mergeQueueMetadata } from '../../http/queueMetadata';
import { getSafeTimezone } from '../../http/timezone';
import { logWorkerError } from '../../lib/errorLogger';
import { getQueueCorrelationId } from '../../lib/queueCorrelation';
import { supabase } from '../../lib/supabase';
import { queue } from '../../worker';
import {
	type BriefNotificationSuppressionReason,
	resolveImmediateBriefNotification
} from '../../workers/brief/briefNotificationSchedule';

/** Queue a daily brief, including catch-up notification and dedup-promotion rules. */
export function registerBriefQueueRoute(app: Application): void {
	app.post('/queue/brief', async (req, res) => {
		try {
			const {
				userId,
				scheduledFor,
				briefDate: requestedBriefDate,
				timezone: requestedTimezone,
				forceImmediate,
				forceRegenerate,
				options: requestOptions
			} = req.body;
			const shouldForceImmediate = forceImmediate === true;
			const shouldForceRegenerate = forceRegenerate === true;

			if (!userId) {
				return res.status(400).json({ error: 'userId is required' });
			}

			const normalizedRequestedBriefDate =
				typeof requestedBriefDate === 'string' && requestedBriefDate.trim().length > 0
					? requestedBriefDate.trim()
					: undefined;

			if (
				normalizedRequestedBriefDate &&
				!/^\d{4}-\d{2}-\d{2}$/.test(normalizedRequestedBriefDate)
			) {
				return res.status(400).json({ error: 'briefDate must use YYYY-MM-DD format' });
			}

			const { data: user, error: userError } = await supabase
				.from('users')
				.select('id, timezone')
				.eq('id', userId)
				.single();

			if (userError || !user) {
				return res.status(404).json({ error: 'User not found' });
			}

			const rawTimezone = requestedTimezone || user.timezone || 'UTC';
			const timezone = getSafeTimezone(rawTimezone, userId);

			if (shouldForceRegenerate) {
				const targetBriefDate =
					normalizedRequestedBriefDate ||
					format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

				const { count } = await queue.cancelBriefJobsForDate(userId, targetBriefDate);
				if (count > 0) {
					console.log(
						`🚫 Force regenerate: Cancelled ${count} existing brief job(s) for ${targetBriefDate} (timezone: ${timezone})`
					);
				}
			}

			let scheduleTime: Date;
			if (shouldForceImmediate || shouldForceRegenerate) {
				scheduleTime = new Date();
			} else if (scheduledFor) {
				scheduleTime = new Date(scheduledFor);
			} else {
				scheduleTime = new Date();
			}

			if (Number.isNaN(scheduleTime.getTime())) {
				return res.status(400).json({
					error: 'scheduledFor must be a valid date string or timestamp'
				});
			}

			const zonedDate = toZonedTime(scheduleTime, timezone);
			const briefDate = normalizedRequestedBriefDate || format(zonedDate, 'yyyy-MM-dd');

			let notificationScheduledFor: Date | undefined;
			let suppressNotification = false;
			let notificationSuppressionReason: BriefNotificationSuppressionReason | undefined;
			if (shouldForceImmediate && !shouldForceRegenerate) {
				const suppressIfPastPreferredTime =
					requestOptions?.suppressNotificationIfPastPreferredTime === true;
				const { data: briefPreference, error: briefPreferenceError } = await supabase
					.from('user_brief_preferences')
					.select('time_of_day, is_active')
					.eq('user_id', userId)
					.maybeSingle();

				if (briefPreferenceError && briefPreferenceError.code !== 'PGRST116') {
					console.warn(
						`Failed to fetch brief preferences for user ${userId}: ${briefPreferenceError.message}`
					);
					suppressNotification = suppressIfPastPreferredTime;
					notificationSuppressionReason = suppressIfPastPreferredTime
						? 'preference_lookup_failed'
						: undefined;
				} else if (briefPreference) {
					const notificationDecision = resolveImmediateBriefNotification({
						briefDate,
						timeOfDay: briefPreference.time_of_day,
						timezone,
						isActive: briefPreference.is_active,
						now: scheduleTime,
						suppressIfPastPreferredTime
					});
					suppressNotification = notificationDecision.suppressNotification;
					notificationScheduledFor = notificationDecision.notificationScheduledFor;
					notificationSuppressionReason = notificationDecision.suppressNotification
						? notificationDecision.reason
						: undefined;
				} else if (suppressIfPastPreferredTime) {
					suppressNotification = true;
					notificationSuppressionReason = 'preference_missing';
				}
			}

			const jobData = {
				briefDate,
				timezone,
				notificationScheduledFor: notificationScheduledFor?.toISOString(),
				options: {
					forceRegenerate: shouldForceRegenerate,
					requestedBriefDate: normalizedRequestedBriefDate,
					useOntology: requestOptions?.useOntology ?? true,
					includeProjects: requestOptions?.includeProjects,
					excludeProjects: requestOptions?.excludeProjects,
					suppressNotification: suppressNotification || undefined,
					notificationSuppressionReason
				}
			};

			let job = await queue.add('generate_daily_brief', userId, jobData, {
				priority: shouldForceImmediate ? 1 : 10,
				scheduledFor: scheduleTime,
				dedupKey: shouldForceRegenerate
					? `brief-${userId}-${briefDate}-${Date.now()}`
					: `brief-${userId}-${briefDate}`
			});

			if (
				shouldForceImmediate &&
				!shouldForceRegenerate &&
				job.status === 'pending' &&
				new Date(job.scheduled_for).getTime() > Date.now() + 1000
			) {
				const promotedAt = new Date();
				const { data: promotedJob, error: promoteError } = await supabase
					.from('queue_jobs')
					.update({
						scheduled_for: promotedAt.toISOString(),
						priority: 1,
						metadata: mergeQueueMetadata(job.metadata, jobData),
						updated_at: promotedAt.toISOString()
					})
					.eq('id', job.id)
					.eq('status', 'pending')
					.select('*')
					.single();

				if (promoteError) {
					console.warn(
						`Failed to promote deduped brief job ${job.queue_job_id}: ${promoteError.message}`
					);
				} else if (promotedJob) {
					job = promotedJob;
					console.log(`⚡ Promoted deduped brief job ${job.queue_job_id} to run now`);
				}
			}

			console.log(`📝 API: Queued brief for user ${userId}, job ${job.queue_job_id}`);

			return res.json({
				success: true,
				jobId: job.queue_job_id,
				correlationId: getQueueCorrelationId(job.metadata),
				scheduledFor: new Date(job.scheduled_for).toISOString(),
				briefDate
			});
		} catch (error) {
			console.error('Error queueing brief:', error);
			await logWorkerError(error, {
				userId: req.body?.userId,
				endpoint: '/queue/brief',
				httpMethod: 'POST',
				operationType: 'queue_brief',
				errorType: 'api_error',
				severity: 'error',
				metadata: {
					scheduledFor: req.body?.scheduledFor,
					briefDate: req.body?.briefDate,
					forceImmediate: req.body?.forceImmediate === true,
					forceRegenerate: req.body?.forceRegenerate === true
				}
			});
			return res.status(500).json({
				error: 'Failed to queue brief generation',
				message: getErrorMessage(error)
			});
		}
	});
}

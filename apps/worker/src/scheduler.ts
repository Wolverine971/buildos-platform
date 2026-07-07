// apps/worker/src/scheduler.ts
import {
	addDays,
	addHours,
	addMinutes,
	isAfter,
	isBefore,
	setHours,
	setMinutes,
	setSeconds
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import cron from 'node-cron';
import { format } from 'date-fns';

import { supabase } from './lib/supabase';
import { queueConfig } from './config/queueConfig';
import { cleanupStaleJobs } from './lib/utils/queueCleanup';
import { queue } from './lib/queue';
import { PROJECT_LOOPS_ENABLED } from './config/projectLoops';
import {
	enqueueEndOfDayProjectLoops,
	reclaimStalledProjectLoopRuns
} from './workers/project-loop/enqueue';
import { enqueueScheduledProjectAudits } from './workers/project-loop/auditEnqueue';
import {
	validateAgentRunMetadata,
	type AgentOperativeRowShape,
	type DailyBriefJobMetadata,
	type Database,
	type Json
} from '@buildos/shared-types';
import { BriefBackoffCalculator } from './lib/briefBackoffCalculator';
import { type Alert, smsAlertsService, smsMetricsService } from '@buildos/shared-utils';
import { resolveScheduledBriefDate } from './workers/brief/briefDateGuard';

export type UserBriefPreference = Database['public']['Tables']['user_brief_preferences']['Row'];
type AgentOperativeRow = AgentOperativeRowShape;

// Feature flag for engagement backoff (defaults to false for safety)
const ENGAGEMENT_BACKOFF_ENABLED = process.env.ENGAGEMENT_BACKOFF_ENABLED === 'true';

// Pre-generation buffer to ensure briefs are ready before notification time
// Start generating briefs 2 minutes before the user's scheduled time
const GENERATION_BUFFER_MS = 2 * 60 * 1000; // 2 minutes

// Initialize backoff calculator
const backoffCalculator = new BriefBackoffCalculator();

/**
 * Queue brief generation using Supabase queue
 * @param userId - User ID
 * @param scheduledFor - When to START generating the brief
 * @param options - Additional options
 * @param timezone - User's timezone
 * @param engagementMetadata - Re-engagement tracking metadata
 * @param notificationScheduledFor - When to SEND the notification (user's scheduled time)
 */
type QueueBriefOptions = NonNullable<DailyBriefJobMetadata['options']>;
type QueueJobRow = Database['public']['Tables']['queue_jobs']['Row'];

async function queueBriefGeneration(
	userId: string,
	scheduledFor: Date,
	options?: QueueBriefOptions,
	timezone: string = 'UTC',
	engagementMetadata?: {
		isReengagement: boolean;
		daysSinceLastLogin: number;
		engagementStage: 'standard' | 'reengagement' | 'dormant';
	},
	notificationScheduledFor?: Date,
	userNameMap?: Map<string, string>
): Promise<QueueJobRow> {
	// Fetch the latest timezone and name from users table (centralized source of truth)
	const { data: user } = await supabase
		.from('users')
		.select('timezone, name, email')
		.eq('id', userId)
		.single();

	// Use user's timezone from database, with fallback to provided timezone, then UTC
	const userTimezone = user?.timezone || timezone || 'UTC';

	// Get user display name (from map if available, otherwise from DB, otherwise use ID)
	const userName = userNameMap?.get(userId) || user?.name || user?.email || userId;

	// Calculate the brief date from the user's notification day, not the pre-generation buffer.
	const briefDate = resolveScheduledBriefDate({
		scheduledFor,
		notificationScheduledFor,
		timezone: userTimezone,
		requestedBriefDate: options?.requestedBriefDate
	});

	console.log(`📅 Queueing brief for user ${userName}:`);
	console.log(`   - Generation starts (UTC): ${scheduledFor.toISOString()}`);
	if (notificationScheduledFor) {
		console.log(`   - Notification sends (UTC): ${notificationScheduledFor.toISOString()}`);
	}
	console.log(`   - User timezone: ${userTimezone}`);
	console.log(`   - Brief date: ${briefDate}`);
	if (engagementMetadata) {
		console.log(`   - Is re-engagement: ${engagementMetadata.isReengagement}`);
		console.log(`   - Days since last login: ${engagementMetadata.daysSinceLastLogin}`);
		console.log(`   - Engagement stage: ${engagementMetadata.engagementStage}`);
	}

	const jobData = {
		userId,
		briefDate,
		options: options
			? { ...options, requestedBriefDate: undefined, ...engagementMetadata }
			: engagementMetadata,
		timezone: userTimezone,
		notificationScheduledFor: notificationScheduledFor?.toISOString() // When to send notification
	};

	// Calculate priority based on immediacy
	const delay = Math.max(0, scheduledFor.getTime() - Date.now());
	const isImmediate = delay < 60000; // Less than 1 minute
	const priority = isImmediate ? 1 : 10;

	// Create dedup key for this specific brief
	const dedupKey = `brief-${userId}-${briefDate}`;

	if (isImmediate) {
		console.log(`⚡ Immediate brief requested for ${briefDate}`);

		// Atomically cancel any existing jobs for this date
		const { count } = await queue.cancelBriefJobsForDate(userId, briefDate);
		if (count > 0) {
			console.log(`🚫 Cancelled ${count} existing brief job(s) for ${briefDate}`);
		}
	}

	// Add job to Supabase queue
	const job = await queue.add('generate_daily_brief', userId, jobData, {
		priority,
		scheduledFor,
		dedupKey: isImmediate ? `${dedupKey}-${Date.now()}` : dedupKey
	});

	const jobType = isImmediate ? 'immediate' : 'scheduled';
	console.log(`📋 Queued ${jobType} brief generation:`);
	console.log(`   - User: ${userName}`);
	console.log(`   - Brief date: ${briefDate}`);
	console.log(`   - Job ID: ${job.queue_job_id}`);
	console.log(`   - Priority: ${priority}`);

	return job;
}

/**
 * Nightly task: refresh the 30-day rolling view counts on `onto_public_pages`.
 * Delegates entirely to a Postgres RPC that recomputes from the detail table.
 */
async function refreshPublicPage30dViewCounts() {
	try {
		const { data, error } = await (supabase as any).rpc('refresh_onto_public_page_30d_counts');
		if (error) {
			console.error('Failed to refresh public page 30d view counts:', error);
			return;
		}
		const pagesUpdated = typeof data === 'number' ? data : 0;
		console.log(`👀 Refreshed 30d view counts for ${pagesUpdated} public pages`);
	} catch (error) {
		console.error('Unexpected error refreshing public page 30d view counts:', error);
	}
}

/**
 * Start the scheduler
 */
export function startScheduler() {
	console.log('📅 Starting scheduler...');

	// Run every hour to check for scheduled briefs
	cron.schedule('0 * * * *', async () => {
		console.log('🔍 Checking for scheduled briefs...');
		await checkAndScheduleBriefs();
	});

	// Run at midnight to schedule daily SMS reminders
	cron.schedule('0 0 * * *', async () => {
		console.log('📱 Checking for daily SMS reminders...');
		await checkAndScheduleDailySMS();
	});

	// Run hourly to check SMS alert thresholds and refresh metrics view
	cron.schedule('0 * * * *', async () => {
		console.log('🚨 Checking SMS alert thresholds...');
		await checkSMSAlerts();
	});

	// Nightly refresh of the 30-day rolling view counts on public pages.
	cron.schedule('17 3 * * *', async () => {
		console.log('👀 Refreshing public-page 30d view counts...');
		await refreshPublicPage30dViewCounts();
	});

	// End-of-day project loops: hourly check that only enqueues projects whose
	// owner is in the first local hour after midnight. No-ops unless
	// ENABLE_PROJECT_LOOPS is set (off in prod by default).
	cron.schedule('0 * * * *', async () => {
		if (!PROJECT_LOOPS_ENABLED) return;
		console.log('🔁 Enqueuing end-of-day project loops...');
		try {
			const {
				enqueued,
				scanned,
				skippedInvalidOwner = 0,
				skippedTimezoneWindow = 0,
				skippedOutsideLocalDay = 0,
				skippedFanoutCap = 0
			} = await enqueueEndOfDayProjectLoops();
			console.log(
				`🔁 Project loops: enqueued ${enqueued}/${scanned} active projects, skipped invalid owner=${skippedInvalidOwner}, outside timezone window=${skippedTimezoneWindow}, outside local day=${skippedOutsideLocalDay}, fanout cap=${skippedFanoutCap}`
			);
		} catch (error) {
			console.error('🔁 Project loop scheduling failed:', error);
		}
	});

	// Complete-audit cadence remains a single daily scan; the per-user timezone
	// fan-out applies only to light end-of-day project loops.
	cron.schedule('0 4 * * *', async () => {
		if (!PROJECT_LOOPS_ENABLED) return;
		try {
			const audits = await enqueueScheduledProjectAudits();
			console.log(
				`🔎 Project audits: queued ${audits.queued}/${audits.scanned}, skipped=${audits.skipped}, deferred=${audits.deferred}, failed=${audits.failed}, skipped invalid owner=${audits.skippedInvalidOwner}`
			);
		} catch (error) {
			console.error('🔎 Project audit scheduling failed:', error);
		}
	});

	// Proactively reclaim project-loop runs stuck running/queued and finalize
	// waiting_review runs whose suggestions are all decided, independent of when
	// the project is next enqueued (audit Tier 1 #7). No-ops unless loops are on.
	cron.schedule('*/30 * * * *', async () => {
		if (!PROJECT_LOOPS_ENABLED) return;
		try {
			const { failedRunning, failedQueued, finalizedReview } =
				await reclaimStalledProjectLoopRuns();
			if (failedRunning || failedQueued || finalizedReview) {
				console.log(
					`🔁 Project loop reclaim: failed running=${failedRunning}, queued=${failedQueued}, finalized review=${finalizedReview}`
				);
			}
		} catch (error) {
			console.error('🔁 Project loop reclaim failed:', error);
		}
	});

	// Saved Operatives: enqueue due Agent Runs through the normal agent_run queue.
	cron.schedule('*/5 * * * *', async () => {
		console.log('🧭 Checking scheduled Operatives...');
		await checkAndScheduleAgentOperatives();
	});

	// Run queue retention cleanup on a cron schedule
	if (queueConfig.enableRetentionCleanup) {
		if (cron.validate(queueConfig.retentionCleanupCron)) {
			cron.schedule(queueConfig.retentionCleanupCron, async () => {
				await runQueueRetentionCleanup();
			});
			console.log(
				`🧹 Queue retention cleanup scheduled (${queueConfig.retentionCleanupCron})`
			);
		} else {
			console.warn(
				`⚠️ Invalid QUEUE_RETENTION_CLEANUP_CRON value "${queueConfig.retentionCleanupCron}", scheduled cleanup disabled`
			);
		}
	}

	// Also run once at startup
	setTimeout(() => {
		checkAndScheduleBriefs();
	}, 5000);
	setTimeout(() => {
		checkAndScheduleAgentOperatives();
	}, 8000);

	console.log(
		'⏰ Scheduler started - checking every hour (briefs, SMS alerts), every 5 minutes (Operatives), and midnight (SMS scheduling)'
	);
}

function parseOperativeTimeOfDay(value: string | null): {
	hours: number;
	minutes: number;
	seconds: number;
} | null {
	if (!value) return null;
	const parts = value.split(':');
	if (parts.length < 2) return null;
	const hours = Number(parts[0]);
	const minutes = Number(parts[1]);
	const seconds = Number(parts[2] ?? '0');
	if (
		!Number.isInteger(hours) ||
		!Number.isInteger(minutes) ||
		!Number.isInteger(seconds) ||
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59 ||
		seconds < 0 ||
		seconds > 59
	) {
		return null;
	}
	return { hours, minutes, seconds };
}

export function calculateNextOperativeRunTime(
	operative: Pick<
		AgentOperativeRow,
		'schedule_frequency' | 'schedule_time_of_day' | 'schedule_day_of_week' | 'schedule_timezone'
	>,
	now: Date = new Date()
): Date | null {
	const time = parseOperativeTimeOfDay(operative.schedule_time_of_day);
	if (!time) return null;
	const frequency = operative.schedule_frequency;
	if (frequency !== 'daily' && frequency !== 'weekly') return null;

	const timezone = operative.schedule_timezone || 'UTC';
	const nowInTz = toZonedTime(now, timezone);
	let targetInTz = setHours(nowInTz, time.hours);
	targetInTz = setMinutes(targetInTz, time.minutes);
	targetInTz = setSeconds(targetInTz, time.seconds);
	targetInTz.setMilliseconds(0);

	if (frequency === 'weekly') {
		const desiredDay = operative.schedule_day_of_week ?? 1;
		if (desiredDay < 0 || desiredDay > 6) return null;
		const currentDay = nowInTz.getDay();
		let daysUntilTarget = desiredDay - currentDay;
		if (daysUntilTarget < 0 || (daysUntilTarget === 0 && isBefore(targetInTz, nowInTz))) {
			daysUntilTarget += 7;
		}
		if (daysUntilTarget > 0) targetInTz = addDays(targetInTz, daysUntilTarget);
		return fromZonedTime(targetInTz, timezone);
	}

	if (isBefore(targetInTz, nowInTz)) targetInTz = addDays(targetInTz, 1);
	return fromZonedTime(targetInTz, timezone);
}

async function deferOperativeSchedule(
	operativeId: string,
	message: string,
	retryAt: Date = addMinutes(new Date(), 15)
) {
	await (supabase as any)
		.from('agent_operatives')
		.update({
			next_run_at: retryAt.toISOString(),
			schedule_locked_at: null,
			schedule_error: message
		})
		.eq('id', operativeId);
}

async function enqueueScheduledOperativeRun(
	operative: AgentOperativeRow,
	scheduledFor: Date,
	nextRunAt: Date
): Promise<{ runId?: string; error?: string }> {
	const budgets =
		operative.budgets &&
		typeof operative.budgets === 'object' &&
		!Array.isArray(operative.budgets)
			? operative.budgets
			: ({} as Json);
	const metadata = {
		run_id: '',
		trigger: 'scheduled' as const,
		context_type: operative.context_type,
		project_id: operative.project_id,
		scope_mode: operative.scope_mode,
		allowed_ops: operative.allowed_ops,
		review_required: operative.review_required,
		budgets
	};

	const { data: run, error: runError } = await supabase
		.from('agent_runs')
		.insert({
			user_id: operative.user_id,
			trigger: 'scheduled',
			operative_id: operative.id,
			label: operative.label,
			goal: operative.goal,
			instructions: operative.instructions,
			expected_output: operative.expected_output,
			context_type: operative.context_type,
			project_id: operative.project_id,
			scope_mode: operative.scope_mode,
			allowed_ops: operative.allowed_ops,
			review_required: operative.review_required,
			status: 'queued',
			budgets: budgets as Json
		})
		.select('id')
		.single();

	if (runError || !run?.id) return { error: runError?.message ?? 'failed to create run' };

	const jobMetadata = { ...metadata, run_id: run.id };
	try {
		validateAgentRunMetadata(jobMetadata);
		await queue.add(
			'agent_run',
			operative.user_id,
			jobMetadata as Record<string, Json | undefined>,
			{
				priority: 8,
				scheduledFor,
				dedupKey: `agent-operative:${operative.id}:${scheduledFor.toISOString()}`
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'failed to queue run';
		await supabase
			.from('agent_runs')
			.update({ status: 'failed', error: `queue_error: ${message}` })
			.eq('id', run.id);
		return { error: message };
	}

	await (supabase as any)
		.from('agent_operatives')
		.update({
			last_run_at: scheduledFor.toISOString(),
			last_run_id: run.id,
			next_run_at: nextRunAt.toISOString(),
			schedule_locked_at: null,
			schedule_error: null
		})
		.eq('id', operative.id);

	return { runId: run.id };
}

export async function checkAndScheduleAgentOperatives(now: Date = new Date()): Promise<void> {
	const dueThrough = addMinutes(now, 5);
	const { data: operatives, error } = await (supabase as any)
		.from('agent_operatives')
		.select('*')
		.eq('schedule_enabled', true)
		.is('schedule_locked_at', null)
		.not('next_run_at', 'is', null)
		.lte('next_run_at', dueThrough.toISOString())
		.order('next_run_at', { ascending: true })
		.limit(25);

	if (error) {
		console.error('🧭 Failed to fetch scheduled Operatives:', error);
		return;
	}
	if (!operatives?.length) {
		console.log('🧭 No scheduled Operatives due');
		return;
	}

	console.log(`🧭 Found ${operatives.length} scheduled Operative(s) due soon`);

	for (const candidate of operatives as AgentOperativeRow[]) {
		const scheduledFor = candidate.next_run_at ? new Date(candidate.next_run_at) : now;
		const nextRunAt = calculateNextOperativeRunTime(
			candidate,
			new Date(Math.max(scheduledFor.getTime(), now.getTime()) + 1000)
		);
		if (!nextRunAt) {
			await deferOperativeSchedule(candidate.id, 'Could not calculate next run time');
			continue;
		}

		const { data: locked, error: lockError } = await (supabase as any)
			.from('agent_operatives')
			.update({ schedule_locked_at: now.toISOString(), schedule_error: null })
			.eq('id', candidate.id)
			.eq('next_run_at', candidate.next_run_at)
			.is('schedule_locked_at', null)
			.select('*')
			.maybeSingle();
		if (lockError) {
			console.error(`🧭 Failed to lock Operative ${candidate.id}:`, lockError);
			continue;
		}
		if (!locked) continue;

		const { count: activeCount, error: activeError } = await supabase
			.from('agent_runs')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', candidate.user_id)
			.in('status', ['queued', 'running', 'paused', 'needs_input', 'proposal_ready'] as any);
		if (activeError) {
			await deferOperativeSchedule(
				candidate.id,
				`Failed to check active runs: ${activeError.message}`
			);
			continue;
		}
		if ((activeCount ?? 0) >= 3) {
			await deferOperativeSchedule(
				candidate.id,
				'Deferred because the user already has 3 active agent runs'
			);
			continue;
		}

		const result = await enqueueScheduledOperativeRun(
			locked as AgentOperativeRow,
			scheduledFor,
			nextRunAt
		);
		if (result.error) {
			await deferOperativeSchedule(candidate.id, result.error);
			console.error(`🧭 Failed to enqueue Operative ${candidate.id}: ${result.error}`);
			continue;
		}
		console.log(`🧭 Scheduled Operative ${candidate.id} as Agent Run ${result.runId}`);
	}
}

async function runPreparedPromptRetentionCleanup(): Promise<void> {
	try {
		const { data, error } = await (supabase as any).rpc(
			'cleanup_agentic_chat_prompt_artifacts'
		);
		if (error) {
			console.warn(
				'⚠️ Scheduled prompt artifact cleanup failed; falling back to prepared prompt cleanup:',
				error
			);
			const fallback = await (supabase as any).rpc(
				'cleanup_expired_agentic_chat_prepared_prompts'
			);
			if (fallback.error) {
				console.warn(
					'⚠️ Scheduled prepared prompt cleanup fallback failed:',
					fallback.error
				);
				return;
			}
			const fallbackDeletedCount = typeof fallback.data === 'number' ? fallback.data : 0;
			if (fallbackDeletedCount > 0) {
				console.log(
					`✅ Scheduled prepared prompt cleanup removed ${fallbackDeletedCount} expired prompt(s)`
				);
			}
			return;
		}

		const summary = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
		const preparedDeleted =
			typeof summary.prepared_prompts_deleted === 'number'
				? summary.prepared_prompts_deleted
				: 0;
		const snapshotsDeleted =
			typeof summary.prompt_snapshots_deleted === 'number'
				? summary.prompt_snapshots_deleted
				: 0;
		const renderedDumpsCleared =
			typeof summary.rendered_dumps_cleared === 'number' ? summary.rendered_dumps_cleared : 0;
		if (preparedDeleted > 0 || snapshotsDeleted > 0 || renderedDumpsCleared > 0) {
			console.log(
				`✅ Scheduled prompt artifact cleanup complete: prepared=${preparedDeleted}, snapshots=${snapshotsDeleted}, dumpsCleared=${renderedDumpsCleared}`
			);
		}
	} catch (error) {
		console.error('❌ Scheduled prompt artifact cleanup failed:', error);
	}
}

export async function runQueueRetentionCleanup() {
	try {
		console.log('🧹 Running scheduled queue retention cleanup...');
		const result = await cleanupStaleJobs({
			staleThresholdHours: queueConfig.staleJobThresholdHours,
			oldFailedJobsDays: queueConfig.oldFailedJobsDays,
			completedJobsRetentionDays: queueConfig.completedJobsRetentionDays,
			maxDeletionBatchSize: queueConfig.cleanupBatchSize,
			dryRun: false
		});

		if (
			result.staleCancelled > 0 ||
			result.oldFailedCancelled > 0 ||
			result.completedDeleted > 0
		) {
			console.log(
				`✅ Scheduled queue retention cleanup complete: stale=${result.staleCancelled}, oldFailed=${result.oldFailedCancelled}, completedDeleted=${result.completedDeleted}`
			);
		} else {
			console.log('✅ Scheduled queue retention cleanup complete: nothing to clean');
		}

		if (result.errors.length > 0) {
			console.warn('⚠️ Scheduled queue retention cleanup had errors:', result.errors);
		}
	} catch (error) {
		console.error('❌ Scheduled queue retention cleanup failed:', error);
	}

	await runPreparedPromptRetentionCleanup();
}

/**
 * Check and schedule briefs
 */
async function checkAndScheduleBriefs() {
	try {
		const now = new Date();
		const oneHourFromNow = addHours(now, 1);

		// Get all active user preferences
		const { data: preferences, error } = await supabase
			.from('user_brief_preferences')
			.select('*')
			.eq('is_active', true);

		if (error) {
			console.error('Error fetching user preferences:', error);
			return;
		}

		if (!preferences || preferences.length === 0) {
			console.log('📝 No active brief preferences found');
			return;
		}

		console.log(`📋 Found ${preferences.length} active preference(s)`);

		// PHASE 0: Batch fetch user timezones and names (centralized source of truth)
		const userIds = preferences.map((p) => p.user_id).filter(Boolean);
		const { data: users } = await supabase
			.from('users')
			.select('id, timezone, name, email')
			.in('id', userIds);

		// Create timezone and name lookup maps
		const userTimezoneMap = new Map<string, string>();
		const userNameMap = new Map<string, string>();
		(users as any)?.forEach((user: any) => {
			if (user.id && user.timezone) {
				userTimezoneMap.set(user.id, user.timezone);
			}
			if (user.id) {
				// Use name if available, otherwise fall back to email
				const displayName = user.name || user.email;
				userNameMap.set(user.id, displayName);
			}
		});

		// PHASE 1: Batch fetch engagement data for all users (if enabled)
		// OPTIMIZED: Uses single batch query instead of 2 queries per user
		const engagementDataMap = new Map<
			string,
			{
				shouldSend: boolean;
				isReengagement: boolean;
				daysSinceLastLogin: number;
				engagementStage: 'standard' | 'reengagement' | 'dormant';
				reason?: string;
			}
		>();

		if (ENGAGEMENT_BACKOFF_ENABLED && preferences.length > 0) {
			console.log('🔍 Batch checking engagement status for all users (optimized)...');

			try {
				// Single batch call that uses 2 queries for ALL users instead of 2 per user
				// For 100 users: 2 queries vs 200 queries (100x improvement)
				const batchResults = await backoffCalculator.shouldSendDailyBriefBatch(userIds);

				// Transfer results to the engagement map
				batchResults.forEach((decision, userId) => {
					engagementDataMap.set(userId, decision);
				});

				console.log(
					`✅ Batch engagement check complete: ${engagementDataMap.size}/${userIds.length} users processed`
				);
			} catch (error) {
				console.error('❌ Batch engagement check failed:', error);
				console.log('⚠️ Falling back to individual engagement checks...');

				// Fallback to original behavior if batch fails
				const MAX_CONCURRENT_CHECKS = 20;
				for (let i = 0; i < preferences.length; i += MAX_CONCURRENT_CHECKS) {
					const batch = preferences.slice(i, i + MAX_CONCURRENT_CHECKS);

					const engagementChecks = await Promise.allSettled(
						batch.map(async (preference) => {
							if (!preference.user_id) return null;
							try {
								const decision = await backoffCalculator.shouldSendDailyBrief(
									preference.user_id
								);
								return { userId: preference.user_id, decision };
							} catch (err) {
								console.error(
									`Failed to check engagement for user ${preference.user_id}:`,
									err
								);
								return null;
							}
						})
					);

					engagementChecks.forEach((result) => {
						if (result.status === 'fulfilled' && result.value) {
							const { userId, decision } = result.value;
							engagementDataMap.set(userId, decision);
						}
					});
				}
			}
		}

		// PHASE 2: Calculate next run times and filter users needing briefs
		const usersToSchedule: Array<{
			preference: any;
			nextRunTime: Date;
			generationStartTime: Date;
			engagementMetadata?: {
				isReengagement: boolean;
				daysSinceLastLogin: number;
				engagementStage: 'standard' | 'reengagement' | 'dormant';
			};
		}> = [];

		for (const preference of preferences) {
			if (!preference.user_id) {
				console.warn('Skipping preference with no user_id');
				continue;
			}

			// Check engagement status
			let engagementMetadata:
				| {
						isReengagement: boolean;
						daysSinceLastLogin: number;
						engagementStage: 'standard' | 'reengagement' | 'dormant';
				  }
				| undefined;

			if (ENGAGEMENT_BACKOFF_ENABLED) {
				const backoffDecision = engagementDataMap.get(preference.user_id);

				if (!backoffDecision?.shouldSend) {
					const userName = userNameMap.get(preference.user_id) || preference.user_id;
					console.log(
						`⏸️ Skipping brief for user ${userName}: ${backoffDecision?.reason || 'unknown'}`
					);
					continue;
				}

				engagementMetadata = {
					isReengagement: backoffDecision.isReengagement,
					daysSinceLastLogin: backoffDecision.daysSinceLastLogin,
					engagementStage: backoffDecision.engagementStage
				};

				const briefType =
					backoffDecision.engagementStage === 'dormant'
						? 'dormant-account'
						: backoffDecision.isReengagement
							? 're-engagement'
							: 'standard';
				const userName = userNameMap.get(preference.user_id) || preference.user_id;
				console.log(
					`📧 Will queue ${briefType} brief for user ${userName} (inactive for ${backoffDecision.daysSinceLastLogin} days)`
				);
			}

			const nextRunTime = calculateNextRunTime(
				preference,
				now,
				userTimezoneMap.get(preference.user_id) || 'UTC'
			);

			if (!nextRunTime) {
				const userName = userNameMap.get(preference.user_id) || preference.user_id;
				console.warn(`Could not calculate next run time for user ${userName}`);
				continue;
			}

			// Calculate when to START generation (buffer before notification time)
			const generationStartTime = new Date(nextRunTime.getTime() - GENERATION_BUFFER_MS);

			// Check if the next run time is within the next hour
			if (isAfter(nextRunTime, now) && isBefore(nextRunTime, oneHourFromNow)) {
				usersToSchedule.push({
					preference,
					nextRunTime, // User's scheduled notification time
					generationStartTime, // When to start generating
					engagementMetadata
				});
			}
		}

		if (usersToSchedule.length === 0) {
			console.log('✅ No briefs need to be scheduled at this time');
			return;
		}

		// PHASE 3: Batch check for existing jobs (single query for all users)
		console.log(`🔍 Checking for existing jobs for ${usersToSchedule.length} user(s)...`);
		const userIdsToCheck = usersToSchedule.map((u) => u.preference.user_id);
		const timeWindow = 30 * 60 * 1000; // 30 minutes tolerance

		const { data: existingJobs } = await supabase
			.from('queue_jobs')
			.select('user_id, scheduled_for')
			.in('user_id', userIdsToCheck)
			.eq('job_type', 'generate_daily_brief')
			.in('status', ['pending', 'processing']);

		// Create map of existing jobs for quick lookup
		const existingJobsMap = new Map<string, Date[]>();
		existingJobs?.forEach((job) => {
			if (!existingJobsMap.has(job.user_id)) {
				existingJobsMap.set(job.user_id, []);
			}
			existingJobsMap.get(job.user_id)!.push(new Date(job.scheduled_for));
		});

		// Filter out users who already have jobs scheduled
		const usersToQueue = usersToSchedule.filter(({ preference, generationStartTime }) => {
			const userJobs = existingJobsMap.get(preference.user_id) || [];
			const windowStart = new Date(generationStartTime.getTime() - timeWindow);
			const windowEnd = new Date(generationStartTime.getTime() + timeWindow);

			const hasConflict = userJobs.some(
				(jobTime) => jobTime >= windowStart && jobTime <= windowEnd
			);

			if (hasConflict) {
				const userName = userNameMap.get(preference.user_id) || preference.user_id;
				console.log(`⏭️ Brief already scheduled for user ${userName}`);
				return false;
			}

			return true;
		});

		// PHASE 4: Batch queue all jobs in parallel
		if (usersToQueue.length === 0) {
			console.log('✅ All users already have briefs scheduled');
			return;
		}

		console.log(`📨 Queueing ${usersToQueue.length} brief(s) in parallel...`);
		const queueResults = await Promise.allSettled(
			usersToQueue.map(
				async ({ preference, nextRunTime, generationStartTime, engagementMetadata }) => {
					const userName = userNameMap.get(preference.user_id) || preference.user_id;
					console.log(`⏰ Scheduling brief for user ${userName}:`);
					console.log(`   - Generation starts: ${generationStartTime.toISOString()}`);
					console.log(`   - Notification sends: ${nextRunTime.toISOString()}`);
					await queueBriefGeneration(
						preference.user_id,
						generationStartTime, // Start generating early
						undefined,
						userTimezoneMap.get(preference.user_id) || 'UTC', // Use centralized timezone from users table
						engagementMetadata,
						nextRunTime, // Send notification at user's scheduled time
						userNameMap
					);
					return preference.user_id;
				}
			)
		);

		// Log results
		const successCount = queueResults.filter((r) => r.status === 'fulfilled').length;
		const failureCount = queueResults.filter((r) => r.status === 'rejected').length;

		console.log(`✅ Successfully queued ${successCount} brief(s)`);
		if (failureCount > 0) {
			console.warn(`⚠️ Failed to queue ${failureCount} brief(s)`);
			queueResults.forEach((result, i) => {
				if (result.status === 'rejected') {
					const userName =
						userNameMap.get(usersToQueue[i].preference.user_id) ||
						usersToQueue[i].preference.user_id;
					console.error(`Failed to queue brief for user ${userName}:`, result.reason);
				}
			});
		}
	} catch (error) {
		console.error('Error in checkAndScheduleBriefs:', error);
	}
}

/**
 * Calculate next run time for a user preference
 */
export function calculateNextRunTime(
	preference: UserBriefPreference,
	now: Date,
	userTimezone?: string
): Date | null {
	try {
		// Note: timezone is not in user_brief_preferences table, it's in users table
		// userTimezone should be passed in from the caller
		const timezone = userTimezone || 'UTC';
		const timeOfDay = preference.time_of_day || '09:00:00';
		const frequency = preference.frequency || 'daily';

		// Parse time of day
		const timeParts = timeOfDay.split(':');
		if (timeParts.length < 2) {
			console.error(`Invalid time format: ${timeOfDay}`);
			return null;
		}

		const hours = parseInt(timeParts[0], 10);
		const minutes = parseInt(timeParts[1], 10);
		const seconds = parseInt(timeParts[2] || '0', 10);

		// Validate time components
		if (
			isNaN(hours) ||
			isNaN(minutes) ||
			isNaN(seconds) ||
			hours < 0 ||
			hours > 23 ||
			minutes < 0 ||
			minutes > 59 ||
			seconds < 0 ||
			seconds > 59
		) {
			console.error(`Invalid time components: ${hours}:${minutes}:${seconds}`);
			return null;
		}

		let targetDate: Date;

		switch (frequency) {
			case 'daily':
				targetDate = calculateDailyRunTime(now, hours, minutes, seconds, timezone);
				break;

			case 'weekly': {
				const dayOfWeek = preference.day_of_week ?? 1; // Default to Monday
				targetDate = calculateWeeklyRunTime(
					now,
					dayOfWeek,
					hours,
					minutes,
					seconds,
					timezone
				);
				break;
			}

			case 'custom':
				// For custom frequency, treat as daily for now
				targetDate = calculateDailyRunTime(now, hours, minutes, seconds, timezone);
				break;

			default:
				console.warn(`Unknown frequency: ${frequency}`);
				return null;
		}

		return targetDate;
	} catch (error) {
		console.error('Error calculating next run time:', error);
		return null;
	}
}

/**
 * Calculate daily run time
 */
function calculateDailyRunTime(
	now: Date,
	hours: number,
	minutes: number,
	seconds: number,
	timezone: string
): Date {
	// Get current time in user's timezone
	const nowInUserTz = toZonedTime(now, timezone);

	// Set target time for today with precise time (no milliseconds)
	let targetInUserTz = setHours(nowInUserTz, hours);
	targetInUserTz = setMinutes(targetInUserTz, minutes);
	targetInUserTz = setSeconds(targetInUserTz, seconds);
	targetInUserTz.setMilliseconds(0); // Ensure precise scheduling without millisecond drift

	// If target time has passed today, schedule for tomorrow
	if (isBefore(targetInUserTz, nowInUserTz)) {
		targetInUserTz = addDays(targetInUserTz, 1);
	}

	// Convert back to UTC
	return fromZonedTime(targetInUserTz, timezone);
}

/**
 * Calculate weekly run time
 */
function calculateWeeklyRunTime(
	now: Date,
	dayOfWeek: number,
	hours: number,
	minutes: number,
	seconds: number,
	timezone: string
): Date {
	// Get current time in user's timezone
	const nowInUserTz = toZonedTime(now, timezone);
	const currentDayOfWeek = nowInUserTz.getDay();

	// Calculate days until target day
	let daysUntilTarget = dayOfWeek - currentDayOfWeek;

	// If target day is today but time has passed, or if target day has passed this week
	let targetInUserTz = setHours(nowInUserTz, hours);
	targetInUserTz = setMinutes(targetInUserTz, minutes);
	targetInUserTz = setSeconds(targetInUserTz, seconds);
	targetInUserTz.setMilliseconds(0); // Ensure precise scheduling without millisecond drift

	if (daysUntilTarget < 0 || (daysUntilTarget === 0 && isBefore(targetInUserTz, nowInUserTz))) {
		daysUntilTarget += 7; // Schedule for next week
	}

	// Add days to reach target day
	if (daysUntilTarget > 0) {
		targetInUserTz = addDays(targetInUserTz, daysUntilTarget);
	}

	// Convert back to UTC
	return fromZonedTime(targetInUserTz, timezone);
}

/**
 * Validate user brief preference
 */
export function validateUserPreference(preference: Partial<UserBriefPreference>): string[] {
	const errors: string[] = [];

	// Validate frequency
	if (preference.frequency && !['daily', 'weekly', 'custom'].includes(preference.frequency)) {
		errors.push('Invalid frequency. Must be daily, weekly, or custom');
	}

	// Validate time_of_day
	if (preference.time_of_day) {
		const timeParts = preference.time_of_day.split(':');
		if (timeParts.length < 2) {
			errors.push('Invalid time_of_day format. Expected HH:MM:SS');
		} else {
			const hours = parseInt(timeParts[0], 10);
			const minutes = parseInt(timeParts[1], 10);
			const seconds = parseInt(timeParts[2] || '0', 10);

			if (isNaN(hours) || hours < 0 || hours > 23) {
				errors.push('Invalid hours in time_of_day');
			}
			if (isNaN(minutes) || minutes < 0 || minutes > 59) {
				errors.push('Invalid minutes in time_of_day');
			}
			if (isNaN(seconds) || seconds < 0 || seconds > 59) {
				errors.push('Invalid seconds in time_of_day');
			}
		}
	}

	// Validate day_of_week
	if (preference.day_of_week !== undefined && preference.day_of_week !== null) {
		if (preference.day_of_week < 0 || preference.day_of_week > 6) {
			errors.push('Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)');
		}
	}

	return errors;
}

/**
 * Check and schedule daily SMS event reminders
 * Runs at midnight (12:00 AM) to queue SMS scheduling jobs for users
 */
async function checkAndScheduleDailySMS() {
	try {
		console.log('📱 [SMS Scheduler] Starting daily SMS check...');

		// Get all users with SMS event reminders enabled
		const { data: smsPreferences, error } = await supabase
			.from('user_sms_preferences')
			.select('user_id, event_reminders_enabled, event_reminder_lead_time_minutes')
			.eq('event_reminders_enabled', true)
			.eq('phone_verified', true)
			.eq('opted_out', false);

		if (error) {
			console.error('❌ [SMS Scheduler] Error fetching SMS preferences:', error);
			return;
		}

		if (!smsPreferences || smsPreferences.length === 0) {
			console.log('📝 [SMS Scheduler] No users with SMS event reminders enabled');
			return;
		}

		console.log(`📋 [SMS Scheduler] Found ${smsPreferences.length} user(s) with SMS enabled`);

		// Batch fetch user timezones and names (centralized source of truth)
		const smsUserIds = smsPreferences.map((p) => p.user_id).filter(Boolean);
		const { data: smsUsers } = await supabase
			.from('users')
			.select('id, timezone, name, email')
			.in('id', smsUserIds);

		// Create timezone and name lookup maps
		const smsUserTimezoneMap = new Map<string, string>();
		const smsUserNameMap = new Map<string, string>();
		smsUsers?.forEach((user) => {
			if (user.id && user.timezone) {
				smsUserTimezoneMap.set(user.id, user.timezone);
			}
			if (user.id) {
				// Use name if available, otherwise fall back to email
				const displayName = user.name || user.email;
				smsUserNameMap.set(user.id, displayName);
			}
		});

		// Queue a job for each user to process their daily SMS
		let queuedCount = 0;
		let skippedCount = 0;

		for (const pref of smsPreferences) {
			try {
				const userTimezone = smsUserTimezoneMap.get(pref.user_id) || 'UTC';
				const now = new Date();

				// Calculate today's date in user's timezone
				const userNow = toZonedTime(now, userTimezone);
				const todayDate = format(userNow, 'yyyy-MM-dd');

				// Queue job to process this user's daily SMS
				const jobData = {
					userId: pref.user_id,
					date: todayDate,
					timezone: userTimezone,
					leadTimeMinutes: pref.event_reminder_lead_time_minutes || 15
				};

				const dedupKey = `schedule-daily-sms-${pref.user_id}-${todayDate}`;

				await queue.add('schedule_daily_sms', pref.user_id, jobData, {
					priority: 5, // Medium priority
					scheduledFor: now, // Process immediately
					dedupKey
				});

				queuedCount++;
				const userName = smsUserNameMap.get(pref.user_id) || pref.user_id;
				console.log(
					`✅ [SMS Scheduler] Queued SMS job for user ${userName} (${todayDate})`
				);
			} catch (jobError) {
				const userName = smsUserNameMap.get(pref.user_id) || pref.user_id;
				console.error(
					`❌ [SMS Scheduler] Error queuing SMS job for user ${userName}:`,
					jobError
				);
				skippedCount++;
			}
		}

		console.log(`📊 [SMS Scheduler] Summary: ${queuedCount} queued, ${skippedCount} skipped`);
	} catch (error) {
		console.error('❌ [SMS Scheduler] Error in checkAndScheduleDailySMS:', error);
	}
}

/**
 * Check SMS alert thresholds and refresh metrics view
 * Runs hourly to monitor SMS system health and trigger alerts
 */
async function checkSMSAlerts() {
	try {
		console.log('🚨 [SMS Alerts] Starting hourly alert check...');

		// Step 1: Refresh materialized view to get latest metrics
		console.log('📊 [SMS Alerts] Refreshing metrics materialized view...');
		await smsMetricsService.refreshMaterializedView();
		console.log('✅ [SMS Alerts] Metrics view refreshed successfully');

		// Step 2: Check all alert thresholds
		console.log('🔍 [SMS Alerts] Checking alert thresholds...');
		const triggeredAlerts = await smsAlertsService.checkAlerts();

		if (triggeredAlerts.length === 0) {
			console.log('✅ [SMS Alerts] All metrics within acceptable thresholds');
		} else {
			console.log(`🚨 [SMS Alerts] ${triggeredAlerts.length} alert(s) triggered:`);
			triggeredAlerts.forEach((alert: Alert) => {
				console.log(`   - ${alert.severity.toUpperCase()}: ${alert.alert_type}`);
				console.log(`     Message: ${alert.message}`);
				console.log(`     Channels: ${alert.notification_channels.join(', ')}`);
			});
		}

		console.log('✅ [SMS Alerts] Alert check completed successfully');
	} catch (error) {
		console.error('❌ [SMS Alerts] Error in checkSMSAlerts:', error);
	}
}

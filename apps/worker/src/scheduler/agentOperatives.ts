// apps/worker/src/scheduler/agentOperatives.ts
import { addDays, addMinutes, isBefore, setHours, setMinutes, setSeconds } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import type { AgentOperativeRowShape, Json } from '@buildos/shared-types';
import { validateAgentRunMetadata } from '@buildos/shared-types';

import { queue } from '../lib/queue';
import { supabase } from '../lib/supabase';

type AgentOperativeRow = AgentOperativeRowShape;

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

// A worker that crashes between locking an Operative and clearing the lock
// leaves schedule_locked_at set forever, permanently excluding it from the
// due-scan. Treat locks older than this as abandoned and reclaimable.
export const STALE_OPERATIVE_LOCK_MS = 15 * 60 * 1000;

export function isOperativeScheduleLockClaimable(
	scheduleLockedAt: string | null,
	now: Date = new Date(),
	staleLockMs: number = STALE_OPERATIVE_LOCK_MS
): boolean {
	if (!scheduleLockedAt) return true;
	const lockedAtMs = new Date(scheduleLockedAt).getTime();
	if (!Number.isFinite(lockedAtMs)) return true;
	return now.getTime() - lockedAtMs >= staleLockMs;
}

async function deferOperativeSchedule(
	operativeId: string,
	message: string,
	retryAt: Date = addMinutes(new Date(), 15)
) {
	await supabase
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

	await supabase
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
	const staleLockThreshold = new Date(now.getTime() - STALE_OPERATIVE_LOCK_MS);
	const { data: operatives, error } = await supabase
		.from('agent_operatives')
		.select('*')
		.eq('schedule_enabled', true)
		.or(`schedule_locked_at.is.null,schedule_locked_at.lt.${staleLockThreshold.toISOString()}`)
		.not('next_run_at', 'is', null)
		.lte('next_run_at', dueThrough.toISOString())
		.order('next_run_at', { ascending: true })
		.limit(25);

	if (error) {
		console.error('🧭 Failed to fetch scheduled Operatives:', error);
		return;
	}
	if (!operatives?.length) return;

	console.log(`🧭 Found ${operatives.length} scheduled Operative(s) due soon`);

	for (const candidate of operatives as AgentOperativeRow[]) {
		if (!candidate.next_run_at) {
			console.warn(`🧭 Skipping Operative ${candidate.id} because next_run_at is missing`);
			continue;
		}
		const scheduledFor = new Date(candidate.next_run_at);
		const nextRunAt = calculateNextOperativeRunTime(
			candidate,
			new Date(Math.max(scheduledFor.getTime(), now.getTime()) + 1000)
		);
		if (!nextRunAt) {
			await deferOperativeSchedule(candidate.id, 'Could not calculate next run time');
			continue;
		}

		// Match on the schedule_locked_at value we just observed (null or a stale
		// timestamp) so two scheduler replicas can't both win the claim.
		const observedLockedAt = candidate.schedule_locked_at;
		let lockUpdate = supabase
			.from('agent_operatives')
			.update({ schedule_locked_at: now.toISOString(), schedule_error: null })
			.eq('id', candidate.id)
			.eq('next_run_at', candidate.next_run_at);
		lockUpdate = observedLockedAt
			? lockUpdate.eq('schedule_locked_at', observedLockedAt)
			: lockUpdate.is('schedule_locked_at', null);

		const { data: locked, error: lockError } = await lockUpdate.select('*').maybeSingle();
		if (lockError) {
			console.error(`🧭 Failed to lock Operative ${candidate.id}:`, lockError);
			continue;
		}
		if (!locked) continue;

		if (observedLockedAt) {
			console.warn(
				`🧭 Reclaimed stale schedule lock for Operative ${candidate.id} (was locked at ${observedLockedAt})`
			);
		}

		const { count: activeCount, error: activeError } = await supabase
			.from('agent_runs')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', candidate.user_id)
			.in('status', ['queued', 'running', 'paused', 'needs_input', 'proposal_ready']);
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

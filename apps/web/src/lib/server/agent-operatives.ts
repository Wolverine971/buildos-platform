// apps/web/src/lib/server/agent-operatives.ts
import { addDays, isBefore, setHours, setMinutes, setSeconds } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { validateAgentRunMetadata, type AgentOperativeRowShape } from '@buildos/shared-types';

type AdminClient = any;

export const AGENT_OPERATIVE_ACTIVE_RUN_STATUSES = [
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready'
] as const;

export interface NormalizedOperativeWrite {
	label: string;
	goal: string;
	instructions: string | null;
	expected_output: string | null;
	context_type: 'global' | 'project';
	project_id: string | null;
	scope_mode: 'read_only' | 'read_write';
	allowed_ops: string[] | null;
	review_required: boolean;
	budgets: Record<string, number>;
	schedule_enabled: boolean;
	schedule_frequency: 'daily' | 'weekly' | null;
	schedule_time_of_day: string | null;
	schedule_day_of_week: number | null;
	schedule_timezone: string;
	next_run_at: string | null;
	schedule_error: string | null;
}

interface DispatchOperativeRunParams {
	admin: AdminClient;
	userId: string;
	operative: AgentOperativeRowShape;
	trigger: 'manual' | 'scheduled';
	scheduledFor?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeAgentRunBudgets(input: unknown): {
	budgets: Record<string, number>;
	error?: string;
} {
	const out: Record<string, number> = {};
	if (input === undefined || input === null) return { budgets: out };
	if (!isRecord(input)) return { budgets: out, error: '`budgets` must be an object' };

	for (const field of ['wall_clock_ms', 'max_tokens', 'max_tool_calls'] as const) {
		const value = input[field];
		if (value === undefined) continue;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
			return { budgets: out, error: `budgets.${field} must be a non-negative number` };
		}
		if ((field === 'max_tokens' || field === 'max_tool_calls') && !Number.isInteger(value)) {
			return { budgets: out, error: `budgets.${field} must be an integer` };
		}
		out[field] = value;
	}
	return { budgets: out };
}

export function normalizeAgentRunAllowedOps(input: unknown): {
	allowedOps: string[] | null;
	error?: string;
} {
	if (input === undefined || input === null) return { allowedOps: null };
	if (!Array.isArray(input)) {
		return { allowedOps: null, error: '`allowed_ops` must be an array of strings' };
	}
	const allowedOps: string[] = [];
	for (const op of input) {
		if (typeof op !== 'string' || !op.trim()) {
			return { allowedOps: null, error: '`allowed_ops` must contain only non-empty strings' };
		}
		allowedOps.push(op.trim());
	}
	return { allowedOps };
}

function parseTimeOfDay(value: unknown): { time: string | null; error?: string } {
	if (typeof value !== 'string' || !value.trim()) {
		return { time: null, error: 'schedule.time_of_day is required when scheduling is enabled' };
	}
	const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (!match) return { time: null, error: 'schedule.time_of_day must be HH:MM or HH:MM:SS' };

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3] ?? '0');
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
		return { time: null, error: 'schedule.time_of_day contains invalid time components' };
	}

	return {
		time: `${hours.toString().padStart(2, '0')}:${minutes
			.toString()
			.padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
	};
}

function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
		return true;
	} catch {
		return false;
	}
}

export function calculateNextOperativeRunAt(params: {
	frequency: 'daily' | 'weekly';
	timeOfDay: string;
	dayOfWeek?: number | null;
	timezone?: string | null;
	now?: Date;
}): Date {
	const now = params.now ?? new Date();
	const timezone = params.timezone || 'UTC';
	const parts = params.timeOfDay.split(':');
	const hours = Number(parts[0] ?? 0);
	const minutes = Number(parts[1] ?? 0);
	const seconds = Number(parts[2] ?? 0);

	const nowInTz = toZonedTime(now, timezone);
	let targetInTz = setHours(nowInTz, hours);
	targetInTz = setMinutes(targetInTz, minutes);
	targetInTz = setSeconds(targetInTz, seconds || 0);
	targetInTz.setMilliseconds(0);

	if (params.frequency === 'weekly') {
		const desiredDay = params.dayOfWeek ?? 1;
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

export function normalizeOperativePayload(
	payload: unknown,
	existing?: AgentOperativeRowShape
): { value?: NormalizedOperativeWrite; error?: string } {
	if (!isRecord(payload)) return { error: 'Request body must be an object' };

	const existingBudgets = isRecord(existing?.budgets) ? existing.budgets : {};
	const rawGoal =
		payload.goal === undefined
			? existing?.goal
			: typeof payload.goal === 'string'
				? payload.goal
				: null;
	const goal = normalizeString(rawGoal);
	if (!goal) return { error: 'A non-empty `goal` is required' };

	const label =
		normalizeString(payload.label === undefined ? existing?.label : payload.label) ??
		goal.slice(0, 80);
	const contextType =
		payload.context_type === undefined
			? (existing?.context_type ?? 'global')
			: payload.context_type === 'project'
				? 'project'
				: 'global';
	const projectId =
		contextType === 'project'
			? normalizeString(
					payload.project_id === undefined ? existing?.project_id : payload.project_id
				)
			: null;
	if (contextType === 'project' && !projectId) {
		return { error: '`project_id` is required for project context' };
	}

	const scopeMode =
		payload.scope_mode === undefined
			? (existing?.scope_mode ?? 'read_only')
			: payload.scope_mode === 'read_write'
				? 'read_write'
				: 'read_only';
	const reviewRequired =
		payload.review === undefined && payload.review_required === undefined
			? (existing?.review_required ?? false)
			: payload.review === true || payload.review_required === true;
	if (reviewRequired && scopeMode === 'read_only') {
		return { error: '`review` requires scope_mode "read_write" (nothing to stage)' };
	}

	const { budgets, error: budgetError } = normalizeAgentRunBudgets(
		payload.budgets === undefined ? existingBudgets : payload.budgets
	);
	if (budgetError) return { error: budgetError };

	const { allowedOps, error: allowedOpsError } = normalizeAgentRunAllowedOps(
		payload.allowed_ops === undefined ? existing?.allowed_ops : payload.allowed_ops
	);
	if (allowedOpsError) return { error: allowedOpsError };

	let scheduleEnabled = existing?.schedule_enabled ?? false;
	let scheduleFrequency = existing?.schedule_frequency ?? null;
	let scheduleTimeOfDay = existing?.schedule_time_of_day ?? null;
	let scheduleDayOfWeek = existing?.schedule_day_of_week ?? null;
	let scheduleTimezone = existing?.schedule_timezone ?? 'UTC';
	let nextRunAt = existing?.next_run_at ?? null;
	let scheduleError: string | null = null;

	if (payload.schedule !== undefined) {
		if (payload.schedule === null) {
			scheduleEnabled = false;
		} else if (!isRecord(payload.schedule)) {
			return { error: '`schedule` must be an object or null' };
		} else {
			const schedule = payload.schedule;
			scheduleEnabled = schedule.enabled === true;
			scheduleFrequency =
				schedule.frequency === undefined
					? scheduleFrequency
					: schedule.frequency === 'daily' || schedule.frequency === 'weekly'
						? schedule.frequency
						: null;
			const parsedTime = parseTimeOfDay(
				schedule.time_of_day === undefined ? scheduleTimeOfDay : schedule.time_of_day
			);
			if (parsedTime.error && scheduleEnabled) return { error: parsedTime.error };
			scheduleTimeOfDay = parsedTime.time ?? scheduleTimeOfDay;
			scheduleTimezone =
				normalizeString(
					schedule.timezone === undefined ? scheduleTimezone : schedule.timezone
				) ?? 'UTC';
			if (!isValidTimezone(scheduleTimezone)) {
				return { error: 'schedule.timezone must be a valid IANA timezone' };
			}
			if (schedule.day_of_week !== undefined && schedule.day_of_week !== null) {
				if (
					typeof schedule.day_of_week !== 'number' ||
					!Number.isInteger(schedule.day_of_week) ||
					schedule.day_of_week < 0 ||
					schedule.day_of_week > 6
				) {
					return { error: 'schedule.day_of_week must be an integer from 0 to 6' };
				}
				scheduleDayOfWeek = schedule.day_of_week;
			}
		}
	}

	if (!scheduleEnabled) {
		scheduleFrequency = null;
		scheduleTimeOfDay = null;
		scheduleDayOfWeek = null;
		nextRunAt = null;
	} else {
		if (scheduleFrequency !== 'daily' && scheduleFrequency !== 'weekly') {
			return { error: 'schedule.frequency must be "daily" or "weekly"' };
		}
		if (!scheduleTimeOfDay) {
			return { error: 'schedule.time_of_day is required when scheduling is enabled' };
		}
		if (scheduleFrequency === 'weekly' && scheduleDayOfWeek === null) {
			return { error: 'schedule.day_of_week is required for weekly schedules' };
		}
		nextRunAt = calculateNextOperativeRunAt({
			frequency: scheduleFrequency,
			timeOfDay: scheduleTimeOfDay,
			dayOfWeek: scheduleDayOfWeek,
			timezone: scheduleTimezone
		}).toISOString();
	}

	return {
		value: {
			label,
			goal,
			instructions:
				payload.instructions === undefined
					? (existing?.instructions ?? null)
					: normalizeString(payload.instructions),
			expected_output:
				payload.expected_output === undefined
					? (existing?.expected_output ?? null)
					: normalizeString(payload.expected_output),
			context_type: contextType,
			project_id: projectId,
			scope_mode: scopeMode,
			allowed_ops: allowedOps,
			review_required: reviewRequired,
			budgets,
			schedule_enabled: scheduleEnabled,
			schedule_frequency: scheduleFrequency,
			schedule_time_of_day: scheduleTimeOfDay,
			schedule_day_of_week: scheduleFrequency === 'weekly' ? scheduleDayOfWeek : null,
			schedule_timezone: scheduleTimezone,
			next_run_at: nextRunAt,
			schedule_error: scheduleError
		}
	};
}

export async function assertAgentOperativeProjectAccess(params: {
	admin: AdminClient;
	userId: string;
	projectId: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; message: string; detail?: string }> {
	if (!params.projectId) return { ok: true };

	const { data: actorId, error: actorError } = await params.admin.rpc('ensure_actor_for_user', {
		p_user_id: params.userId
	});
	if (actorError || !actorId) {
		return {
			ok: false,
			status: 500,
			message: 'Failed to resolve actor id',
			detail: actorError?.message
		};
	}
	const { data: membership, error: membershipError } = await params.admin
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.eq('project_id', params.projectId)
		.is('removed_at', null)
		.maybeSingle();
	if (membershipError) {
		return {
			ok: false,
			status: 500,
			message: 'Failed to validate project access',
			detail: membershipError.message
		};
	}
	if (!membership?.project_id) {
		return { ok: false, status: 403, message: 'You do not have access to that project_id' };
	}
	return { ok: true };
}

export async function dispatchOperativeRun({
	admin,
	userId,
	operative,
	trigger,
	scheduledFor
}: DispatchOperativeRunParams): Promise<
	| { ok: true; run: unknown }
	| { ok: false; status: number; message: string; code?: string; detail?: string }
> {
	const budgets = isRecord(operative.budgets) ? operative.budgets : {};
	const scheduledAt = scheduledFor ?? new Date();

	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.insert({
			user_id: userId,
			trigger,
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
			budgets
		})
		.select('*')
		.single();

	if (runError || !run) {
		return {
			ok: false,
			status: 500,
			message: 'Failed to create agent run',
			code: 'DATABASE_ERROR',
			detail: runError?.message
		};
	}

	const metadata = {
		run_id: run.id,
		trigger,
		context_type: operative.context_type,
		project_id: operative.project_id,
		scope_mode: operative.scope_mode,
		allowed_ops: operative.allowed_ops,
		review_required: operative.review_required,
		budgets
	};
	try {
		validateAgentRunMetadata(metadata);
	} catch (error) {
		await admin
			.from('agent_runs')
			.update({ status: 'failed', error: 'Invalid job metadata' })
			.eq('id', run.id);
		return {
			ok: false,
			status: 400,
			message: error instanceof Error ? error.message : 'Invalid job metadata'
		};
	}

	const { error: jobError } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'agent_run',
		p_metadata: metadata,
		p_priority: trigger === 'scheduled' ? 8 : 7,
		p_scheduled_for: scheduledAt.toISOString(),
		p_dedup_key: `agent-run:${run.id}`
	});
	if (jobError) {
		await admin
			.from('agent_runs')
			.update({ status: 'failed', error: `queue_error: ${jobError.message}` })
			.eq('id', run.id);
		return {
			ok: false,
			status: 500,
			message: 'Failed to queue agent run',
			code: 'DATABASE_ERROR',
			detail: jobError.message
		};
	}

	return { ok: true, run };
}

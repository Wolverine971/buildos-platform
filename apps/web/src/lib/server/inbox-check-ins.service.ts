// apps/web/src/lib/server/inbox-check-ins.service.ts
// AI Inbox check-ins (tasker 149, lane A). Overdue open tasks on the user's active and
// planning projects become "Did this happen?" questions, grouped by due day; a project
// that has gone quiet gets one "Still on?" question instead. Answers write straight to
// the tasks through the shared write paths, and every answer can be undone.
import {
	civilDateBoundaryInstant,
	instantToZonedIso,
	isDateOnlyValue,
	isValidIanaTimezone
} from '@buildos/shared-agent-ops/dates/civil-date';
import {
	runGatewayWriteOp,
	type GatewayLookupMemo,
	type TaskSyncPort
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { isValidUUID, type Json } from '@buildos/shared-types';
import { formatCheckInDayLabel } from '$lib/components/inbox/check-ins';
import { logUpdateAsync } from '$lib/services/async-activity-logger';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { archiveTaskCanonical } from '$lib/server/task-archive.service';
import { PROJECT_STATES, TASK_STATES } from '$lib/types/onto';
import {
	CHECK_IN_DEFAULT_TIME_ZONE,
	CHECK_IN_MAX_ANSWERS,
	CHECK_IN_MAX_PROJECTS,
	CHECK_IN_MAX_TASKS_PER_PROJECT,
	CHECK_IN_QUIET_AFTER_DAYS,
	type CheckInAnswer,
	type CheckInAnswerResult,
	type CheckInAnswersPayload,
	type CheckInChatPayload,
	type CheckInGroup,
	type CheckInProject,
	type CheckInProjectAnswer,
	type CheckInProjectResult,
	type CheckInsPayload,
	type CheckInTask,
	type CheckInTaskAnswer,
	type CheckInTaskResult,
	type CheckInTaskSnapshot
} from '$lib/types/inbox-check-ins';

type AnySupabase = any;

const OPEN_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
const CHECK_IN_PROJECT_STATES = ['active', 'planning'] as const;
const WRITE_ACCESS_LEVELS = ['write', 'admin'] as const;
const MEMBERSHIP_LIMIT = 500;
const OVERDUE_TASK_LIMIT = 1000;
const ACTIVITY_ROW_LIMIT = 1000;
const ANSWER_CONCURRENCY = 4;
const DAY_MS = 86_400_000;
const CHAT_OPENER_TASK_LINES = 12;

const TASK_ANSWERS = new Set(['done', 'move', 'drop', 'restore']);
const PROJECT_ANSWERS = new Set(['pause', 'finish', 'restore']);
const PROJECT_TARGET_STATE = { pause: 'paused', finish: 'completed' } as const;

type ProjectRow = {
	id: string;
	name: string | null;
	state_key: string;
	kind: string | null;
	updated_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
};

type OverdueTaskRow = {
	id: string;
	project_id: string;
	title: string | null;
	state_key: string;
	due_at: string;
	updated_at: string | null;
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function resolveCheckInTimeZone(value: unknown): string {
	return isValidIanaTimezone(value) ? (value as string).trim() : CHECK_IN_DEFAULT_TIME_ZONE;
}

/** YYYY-MM-DD of an instant in `timeZone`, or null when it is not a timestamp. */
export function civilDateIn(instant: string | null | undefined, timeZone: string): string | null {
	if (!instant) return null;
	const ms = Date.parse(instant);
	if (!Number.isFinite(ms)) return null;
	return instantToZonedIso(new Date(ms).toISOString(), timeZone)?.slice(0, 10) ?? null;
}

function timeMs(value: string | null | undefined): number {
	const ms = value ? Date.parse(value) : NaN;
	return Number.isFinite(ms) ? ms : 0;
}

function newerOf(a: string | null | undefined, b: string | null | undefined): string | null {
	if (!a) return b ?? null;
	if (!b) return a;
	return timeMs(b) > timeMs(a) ? b : a;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Active and planning projects the user can write to, as a member. RLS alone is not
 * enough: admins can read every project, and check-ins are only for your own.
 */
async function loadCheckInProjectRows(
	supabase: AnySupabase,
	actorId: string,
	projectId?: string | null
): Promise<ProjectRow[]> {
	let query = supabase
		.from('onto_project_members')
		.select(
			'project_id, access, onto_projects!inner(id, name, state_key, kind, updated_at, archived_at, deleted_at)'
		)
		.eq('actor_id', actorId)
		.is('removed_at', null)
		.in('access', [...WRITE_ACCESS_LEVELS])
		.in('onto_projects.state_key', [...CHECK_IN_PROJECT_STATES])
		.eq('onto_projects.kind', 'project')
		.is('onto_projects.deleted_at', null)
		.is('onto_projects.archived_at', null);
	if (projectId) query = query.eq('project_id', projectId);
	const { data, error } = await query.limit(MEMBERSHIP_LIMIT);
	if (error) throw error;

	const projects = new Map<string, ProjectRow>();
	for (const row of (data ?? []) as Array<Record<string, unknown>>) {
		const embedded = row.onto_projects;
		const project = (Array.isArray(embedded) ? embedded[0] : embedded) as ProjectRow | null;
		if (
			!project?.id ||
			!(CHECK_IN_PROJECT_STATES as readonly string[]).includes(project.state_key) ||
			(project.kind ?? 'project') !== 'project' ||
			project.deleted_at ||
			project.archived_at
		) {
			continue;
		}
		projects.set(project.id, project);
	}
	return [...projects.values()];
}

/** Open tasks due before today started in the user's time zone (the app's "overdue"). */
async function loadOverdueTaskRows(
	supabase: AnySupabase,
	projectIds: string[],
	overdueBefore: string,
	columns = 'id, project_id, title, state_key, due_at, updated_at'
): Promise<OverdueTaskRow[]> {
	if (!projectIds.length) return [];
	const { data, error } = await supabase
		.from('onto_tasks')
		.select(columns)
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.is('archived_at', null)
		.in('state_key', [...OPEN_TASK_STATES])
		.lt('due_at', overdueBefore)
		.order('due_at', { ascending: false })
		.limit(OVERDUE_TASK_LIMIT);
	if (error) throw error;
	return ((data ?? []) as OverdueTaskRow[]).filter(
		(task) =>
			task?.id &&
			task.due_at &&
			(OPEN_TASK_STATES as readonly string[]).includes(task.state_key) &&
			timeMs(task.due_at) < timeMs(overdueBefore)
	);
}

/**
 * Latest task change per candidate project, from one query ordered newest first. Only
 * asked for projects whose own row and overdue tasks are already 45+ days old.
 */
async function loadLatestTaskActivity(
	supabase: AnySupabase,
	projectIds: string[]
): Promise<Map<string, string> | null> {
	if (!projectIds.length) return new Map();
	const { data, error } = await supabase
		.from('onto_tasks')
		.select('project_id, updated_at')
		.in('project_id', projectIds)
		.order('updated_at', { ascending: false })
		.limit(ACTIVITY_ROW_LIMIT);
	if (error) {
		console.warn('[Inbox check-ins] Failed to read task activity:', error);
		return null;
	}
	const latest = new Map<string, string>();
	for (const row of (data ?? []) as Array<{ project_id: string; updated_at: string | null }>) {
		if (row?.project_id && row.updated_at && !latest.has(row.project_id)) {
			latest.set(row.project_id, row.updated_at);
		}
	}
	return latest;
}

function groupProjectTasks(
	tasks: OverdueTaskRow[],
	timeZone: string,
	today: string
): { groups: CheckInGroup[]; truncated: boolean } {
	const byDay = new Map<string, OverdueTaskRow[]>();
	for (const task of tasks) {
		const day = civilDateIn(task.due_at, timeZone);
		if (!day) continue;
		byDay.set(day, [...(byDay.get(day) ?? []), task]);
	}

	const groups: CheckInGroup[] = [];
	let shown = 0;
	let truncated = false;
	// Newest day first; whole days while they fit, and never an empty card.
	for (const day of [...byDay.keys()].sort().reverse()) {
		const dayTasks = (byDay.get(day) ?? []).sort(
			(a, b) =>
				timeMs(a.due_at) - timeMs(b.due_at) ||
				(a.title ?? '').localeCompare(b.title ?? '') ||
				a.id.localeCompare(b.id)
		);
		const room = CHECK_IN_MAX_TASKS_PER_PROJECT - shown;
		if (room <= 0 || (groups.length > 0 && dayTasks.length > room)) {
			truncated = true;
			continue;
		}
		const kept = dayTasks.slice(0, room);
		if (kept.length < dayTasks.length) truncated = true;
		shown += kept.length;
		groups.push({
			key: `${tasks[0]?.project_id ?? 'project'}:${day}`,
			due_date: day,
			label: formatCheckInDayLabel(day, today),
			task_count: dayTasks.length,
			tasks: kept.map(
				(task): CheckInTask => ({
					id: task.id,
					title: task.title?.trim() || 'Untitled task',
					state_key: task.state_key,
					due_at: task.due_at
				})
			)
		});
	}
	return { groups, truncated };
}

function emptyPayload(timeZone: string, today: string): CheckInsPayload {
	return { projects: [], time_zone: timeZone, today, card_count: 0, task_count: 0 };
}

function checkInClock(timeZone: string, now: Date) {
	const today = civilDateIn(now.toISOString(), timeZone) ?? now.toISOString().slice(0, 10);
	return {
		today,
		overdueBefore: civilDateBoundaryInstant(today, 'start', timeZone),
		quietBefore: now.getTime() - CHECK_IN_QUIET_AFTER_DAYS * DAY_MS
	};
}

export async function loadInboxCheckIns(params: {
	supabase: AnySupabase;
	userId: string;
	timeZone?: string | null;
	now?: Date;
	projectId?: string | null;
}): Promise<CheckInsPayload> {
	const timeZone = resolveCheckInTimeZone(params.timeZone);
	const now = params.now ?? new Date();
	const { today, overdueBefore, quietBefore } = checkInClock(timeZone, now);

	const actorId = await ensureActorId(params.supabase, params.userId);
	const projects = await loadCheckInProjectRows(params.supabase, actorId, params.projectId);
	if (!projects.length) return emptyPayload(timeZone, today);

	const tasks = await loadOverdueTaskRows(
		params.supabase,
		projects.map((project) => project.id),
		overdueBefore
	);
	const tasksByProject = new Map<string, OverdueTaskRow[]>();
	for (const task of tasks) {
		tasksByProject.set(task.project_id, [...(tasksByProject.get(task.project_id) ?? []), task]);
	}

	// Most recent overdue work first; the cap keeps the rail readable.
	const withTasks = projects
		.filter((project) => tasksByProject.has(project.id))
		.map((project) => {
			const projectTasks = tasksByProject.get(project.id) ?? [];
			const newestDue = projectTasks.reduce(
				(max, task) => Math.max(max, timeMs(task.due_at)),
				0
			);
			return { project, projectTasks, newestDue };
		})
		.sort((a, b) => b.newestDue - a.newestDue)
		.slice(0, CHECK_IN_MAX_PROJECTS);
	if (!withTasks.length) return emptyPayload(timeZone, today);

	// Quiet candidates: the project row and every overdue task are already old.
	const candidates = withTasks
		.filter(
			({ project, projectTasks }) =>
				timeMs(project.updated_at) < quietBefore &&
				projectTasks.every((task) => timeMs(task.updated_at) < quietBefore)
		)
		.map(({ project }) => project.id);
	const latestActivity = await loadLatestTaskActivity(params.supabase, candidates);

	const built = withTasks.map(({ project, projectTasks }): CheckInProject => {
		const taskTouched = projectTasks.reduce<string | null>(
			(latest, task) => newerOf(latest, task.updated_at),
			null
		);
		const lastTouched = newerOf(
			newerOf(project.updated_at, taskTouched),
			latestActivity?.get(project.id) ?? null
		);
		const isCandidate = candidates.includes(project.id);
		// Without the activity read we cannot rule out recent work, so ask per task.
		const quiet = isCandidate && latestActivity !== null && timeMs(lastTouched) < quietBefore;
		const dueDays = projectTasks
			.map((task) => civilDateIn(task.due_at, timeZone))
			.filter((day): day is string => Boolean(day))
			.sort();
		const { groups, truncated } = groupProjectTasks(projectTasks, timeZone, today);
		return {
			project_id: project.id,
			project_name: project.name?.trim() || 'Project',
			project_state: project.state_key,
			project_updated_at: project.updated_at ?? null,
			last_touched_at: lastTouched,
			last_touched_date: civilDateIn(lastTouched, timeZone),
			quiet,
			overdue_count: projectTasks.length,
			oldest_due_date: dueDays[0] ?? null,
			newest_due_date: dueDays[dueDays.length - 1] ?? null,
			groups,
			truncated
		};
	});

	return {
		projects: built,
		time_zone: timeZone,
		today,
		card_count: built.length,
		task_count: built.reduce((total, project) => total + project.overdue_count, 0)
	};
}

/**
 * Inbox badge: one card per project with check-ins (a quiet project is one card too).
 * Same filters as the list, without the activity read or the grouping.
 */
export async function countInboxCheckInCards(params: {
	supabase: AnySupabase;
	userId: string;
	timeZone?: string | null;
	now?: Date;
	projectId?: string | null;
}): Promise<{ cards: number; by_project: Record<string, number> }> {
	const timeZone = resolveCheckInTimeZone(params.timeZone);
	const { overdueBefore } = checkInClock(timeZone, params.now ?? new Date());
	const actorId = await ensureActorId(params.supabase, params.userId);
	const projects = await loadCheckInProjectRows(params.supabase, actorId, params.projectId);
	const tasks = await loadOverdueTaskRows(
		params.supabase,
		projects.map((project) => project.id),
		overdueBefore,
		'id, project_id, state_key, due_at'
	);
	// Newest overdue first, so the cap keeps the same projects the list shows.
	const projectIds = [...new Set(tasks.map((task) => task.project_id))].slice(
		0,
		CHECK_IN_MAX_PROJECTS
	);
	return {
		cards: projectIds.length,
		by_project: Object.fromEntries(projectIds.map((id) => [id, 1]))
	};
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type ParsedCheckInAnswers =
	| { ok: true; answers: CheckInAnswer[] }
	| { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDueAtInput(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim() || value.length > 64) return false;
	return isDateOnlyValue(value) || Number.isFinite(Date.parse(value));
}

function parseSnapshot(value: unknown): CheckInTaskSnapshot | null {
	if (!isRecord(value)) return null;
	const state = value.state_key;
	const dueAt = value.due_at;
	if (typeof state !== 'string' || !(TASK_STATES as readonly string[]).includes(state)) {
		return null;
	}
	if (dueAt !== null && !isDueAtInput(dueAt)) return null;
	if (typeof value.archived !== 'boolean') return null;
	return { state_key: state, due_at: (dueAt as string | null) ?? null, archived: value.archived };
}

/** Validate a POST body: `{ answers: [...] }`, 1..CHECK_IN_MAX_ANSWERS entries. */
export function parseCheckInAnswers(body: unknown): ParsedCheckInAnswers {
	const raw = isRecord(body) ? body.answers : null;
	if (!Array.isArray(raw) || raw.length === 0) {
		return { ok: false, error: 'answers must be a non-empty array' };
	}
	if (raw.length > CHECK_IN_MAX_ANSWERS) {
		return { ok: false, error: `At most ${CHECK_IN_MAX_ANSWERS} answers per request` };
	}
	const answers: CheckInAnswer[] = [];
	for (const [index, entry] of raw.entries()) {
		if (!isRecord(entry)) return { ok: false, error: `answers[${index}] must be an object` };
		if (entry.task_id !== undefined) {
			if (typeof entry.task_id !== 'string' || !isValidUUID(entry.task_id)) {
				return { ok: false, error: `answers[${index}].task_id must be a UUID` };
			}
			if (typeof entry.answer !== 'string' || !TASK_ANSWERS.has(entry.answer)) {
				return {
					ok: false,
					error: `answers[${index}].answer must be done, move, drop or restore`
				};
			}
			const answer: CheckInTaskAnswer = {
				task_id: entry.task_id,
				answer: entry.answer as CheckInTaskAnswer['answer']
			};
			if (answer.answer === 'move') {
				if (!isDueAtInput(entry.due_at)) {
					return {
						ok: false,
						error: `answers[${index}].due_at is required to move a task`
					};
				}
				answer.due_at = (entry.due_at as string).trim();
			}
			if (answer.answer === 'restore') {
				const previous = parseSnapshot(entry.previous);
				if (!previous) {
					return {
						ok: false,
						error: `answers[${index}].previous is required to restore`
					};
				}
				answer.previous = previous;
			}
			answers.push(answer);
			continue;
		}
		if (entry.project_id !== undefined) {
			if (typeof entry.project_id !== 'string' || !isValidUUID(entry.project_id)) {
				return { ok: false, error: `answers[${index}].project_id must be a UUID` };
			}
			if (
				typeof entry.project_answer !== 'string' ||
				!PROJECT_ANSWERS.has(entry.project_answer)
			) {
				return {
					ok: false,
					error: `answers[${index}].project_answer must be pause, finish or restore`
				};
			}
			const answer: CheckInProjectAnswer = {
				project_id: entry.project_id,
				project_answer: entry.project_answer as CheckInProjectAnswer['project_answer']
			};
			if (answer.project_answer === 'restore') {
				if (
					typeof entry.previous_state !== 'string' ||
					!(PROJECT_STATES as readonly string[]).includes(entry.previous_state)
				) {
					return {
						ok: false,
						error: `answers[${index}].previous_state is required to restore`
					};
				}
				answer.previous_state = entry.previous_state;
			}
			answers.push(answer);
			continue;
		}
		return { ok: false, error: `answers[${index}] needs a task_id or a project_id` };
	}
	return { ok: true, answers };
}

type LiveTask = {
	id: string;
	project_id: string;
	state_key: string;
	due_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
};

function snapshotOf(task: LiveTask): CheckInTaskSnapshot {
	return { state_key: task.state_key, due_at: task.due_at, archived: Boolean(task.archived_at) };
}

function sameInstant(a: string | null, b: string | null): boolean {
	if (!a || !b) return !a && !b;
	return Date.parse(a) === Date.parse(b);
}

function gatewayStatus(code: string | undefined): number {
	if (code === 'NOT_FOUND') return 404;
	if (code === 'VALIDATION_ERROR') return 400;
	if (code === 'CONFLICT') return 409;
	if (code === 'FORBIDDEN') return 403;
	return 500;
}

class AnswerError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

type TaskWriter = {
	/** Field update through the reviewed write gateway (the path chat and replays use). */
	update(task: LiveTask, fields: Record<string, unknown>): Promise<LiveTask>;
	/** The board's canonical archive. */
	archive(task: LiveTask): Promise<LiveTask>;
};

function createTaskWriter(params: {
	supabase: AnySupabase;
	userId: string;
	taskSync?: TaskSyncPort;
}): TaskWriter {
	const memo: GatewayLookupMemo = {};
	let actorPromise: Promise<string> | null = null;
	let taskSyncPromise: Promise<TaskSyncPort | undefined> | null = null;
	// Done and move reconcile the task's calendar events, as editing the task does.
	const taskSync = () =>
		(taskSyncPromise ??= params.taskSync
			? Promise.resolve(params.taskSync)
			: import('$lib/services/ontology/task-event-sync.service')
					.then(({ TaskEventSyncService }) => new TaskEventSyncService(params.supabase))
					.catch((error) => {
						console.warn('[Inbox check-ins] Calendar sync unavailable:', error);
						return undefined;
					}));

	return {
		async update(task, fields) {
			const result = await runGatewayWriteOp({
				admin: params.supabase,
				userId: params.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: [task.project_id],
					write_project_ids: [task.project_id]
				},
				op: 'onto.task.update',
				args: { task_id: task.id, ...fields },
				memo,
				taskSync: await taskSync()
			});
			if (!result.ok) {
				const message = result.error?.message ?? 'Could not update the task';
				// The gateway refuses writes that change nothing; that is not a failure here.
				if (
					result.error?.code === 'VALIDATION_ERROR' &&
					message.startsWith('No-effect update')
				) {
					return task;
				}
				throw new AnswerError(gatewayStatus(result.error?.code), message);
			}
			const updated =
				isRecord(result.data) && isRecord(result.data.task) ? result.data.task : {};
			return {
				...task,
				state_key:
					typeof updated.state_key === 'string' ? updated.state_key : task.state_key,
				due_at:
					updated.due_at === null || typeof updated.due_at === 'string'
						? (updated.due_at as string | null)
						: task.due_at,
				archived_at:
					updated.archived_at === null || typeof updated.archived_at === 'string'
						? (updated.archived_at as string | null)
						: task.archived_at,
				deleted_at: fields.archived === false ? null : task.deleted_at
			};
		},
		async archive(task) {
			actorPromise ??= ensureActorId(params.supabase, params.userId);
			const result = await archiveTaskCanonical({
				supabase: params.supabase,
				userId: params.userId,
				actorId: await actorPromise,
				taskId: task.id,
				projectId: task.project_id,
				changeSource: 'form'
			});
			if (!result.ok) throw new AnswerError(result.status, result.error);
			return { ...task, archived_at: result.archivedAt, deleted_at: result.archivedAt };
		}
	};
}

/** Apply one answer to the task as it stands now; returns the task after. */
async function applyTaskAnswer(
	writer: TaskWriter,
	task: LiveTask,
	answer: CheckInTaskAnswer
): Promise<LiveTask> {
	const archived = Boolean(task.archived_at);
	switch (answer.answer) {
		case 'done': {
			// Answering on a task dropped a moment ago brings it back first.
			const fields: Record<string, unknown> = archived ? { archived: false } : {};
			if (task.state_key !== 'done') fields.state_key = 'done';
			return Object.keys(fields).length ? writer.update(task, fields) : task;
		}
		case 'move': {
			const fields: Record<string, unknown> = archived ? { archived: false } : {};
			if (!sameInstant(task.due_at, answer.due_at ?? null)) fields.due_at = answer.due_at;
			return Object.keys(fields).length ? writer.update(task, fields) : task;
		}
		case 'drop':
			return archived ? task : writer.archive(task);
		default: {
			// restore
			const previous = answer.previous as CheckInTaskSnapshot;
			const fields: Record<string, unknown> = {};
			if (previous.state_key !== task.state_key) fields.state_key = previous.state_key;
			if (!sameInstant(previous.due_at, task.due_at)) fields.due_at = previous.due_at;
			if (archived && !previous.archived) {
				return writer.update(task, { ...fields, archived: false });
			}
			if (archived) return task;
			const restored = Object.keys(fields).length ? await writer.update(task, fields) : task;
			return previous.archived ? writer.archive(restored) : restored;
		}
	}
}

async function runTaskAnswers(params: {
	supabase: AnySupabase;
	userId: string;
	answers: Array<{ index: number; answer: CheckInTaskAnswer }>;
	taskSync?: TaskSyncPort;
}): Promise<Map<number, CheckInTaskResult>> {
	const results = new Map<number, CheckInTaskResult>();
	if (!params.answers.length) return results;

	const ids = [...new Set(params.answers.map(({ answer }) => answer.task_id))];
	const { data, error } = await params.supabase
		.from('onto_tasks')
		.select('id, project_id, state_key, due_at, archived_at, deleted_at')
		.in('id', ids);
	if (error) throw error;
	const tasks = new Map<string, LiveTask>(
		((data ?? []) as LiveTask[]).map((task) => [task.id, task])
	);

	// Answers for one task run in order (Undo, then the new answer); tasks run side by side.
	const byTask = new Map<string, Array<{ index: number; answer: CheckInTaskAnswer }>>();
	for (const entry of params.answers) {
		byTask.set(entry.answer.task_id, [...(byTask.get(entry.answer.task_id) ?? []), entry]);
	}
	const writer = createTaskWriter(params);

	const runTask = async (taskId: string) => {
		let task = tasks.get(taskId) ?? null;
		for (const { index, answer } of byTask.get(taskId) ?? []) {
			// A deleted task that was not archived is gone (the privacy purge erases it).
			if (!task || (task.deleted_at && !task.archived_at)) {
				results.set(index, {
					kind: 'task',
					task_id: taskId,
					answer: answer.answer,
					ok: false,
					status: 404,
					error: 'Task not found'
				});
				continue;
			}
			const before = snapshotOf(task);
			try {
				const after = await applyTaskAnswer(writer, task, answer);
				const afterSnapshot = snapshotOf(after);
				results.set(index, {
					kind: 'task',
					task_id: taskId,
					answer: answer.answer,
					ok: true,
					changed:
						after !== task &&
						(afterSnapshot.state_key !== before.state_key ||
							afterSnapshot.archived !== before.archived ||
							!sameInstant(afterSnapshot.due_at, before.due_at)),
					task: afterSnapshot,
					previous: before
				});
				task = after;
			} catch (cause) {
				results.set(index, {
					kind: 'task',
					task_id: taskId,
					answer: answer.answer,
					ok: false,
					status: cause instanceof AnswerError ? cause.status : 500,
					error: cause instanceof Error ? cause.message : 'Could not save that answer'
				});
			}
		}
	};

	const queue = [...byTask.keys()];
	await Promise.all(
		Array.from({ length: Math.min(ANSWER_CONCURRENCY, queue.length) }, async () => {
			for (let taskId = queue.shift(); taskId; taskId = queue.shift()) {
				await runTask(taskId);
			}
		})
	);
	return results;
}

async function applyProjectAnswer(params: {
	supabase: AnySupabase;
	userId: string;
	answer: CheckInProjectAnswer;
}): Promise<CheckInProjectResult> {
	const { supabase, userId, answer } = params;
	const fail = (status: number, error: string): CheckInProjectResult => ({
		kind: 'project',
		project_id: answer.project_id,
		project_answer: answer.project_answer,
		ok: false,
		status,
		error
	});

	// Same checks as PATCH /api/onto/projects/[id]: actor, member write access, live row.
	await ensureActorId(supabase, userId);
	const { data: hasAccess, error: accessError } = await supabase.rpc(
		'current_actor_has_project_member_access',
		{ p_project_id: answer.project_id, p_required_access: 'write' }
	);
	if (accessError) return fail(500, 'Failed to check project access');
	if (!hasAccess) return fail(403, 'You do not have permission to change this project');

	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, state_key')
		.eq('id', answer.project_id)
		.is('deleted_at', null)
		.maybeSingle();
	if (projectError) return fail(500, 'Failed to load project');
	if (!project) return fail(404, 'Project not found');

	const target =
		answer.project_answer === 'restore'
			? (answer.previous_state as string)
			: PROJECT_TARGET_STATE[answer.project_answer];
	const previousState = project.state_key as string;
	if (previousState === target) {
		return {
			kind: 'project',
			project_id: answer.project_id,
			project_answer: answer.project_answer,
			ok: true,
			changed: false,
			state_key: target,
			previous_state: previousState
		};
	}

	const { data: updated, error: updateError } = await supabase
		.from('onto_projects')
		.update({ state_key: target, updated_at: new Date().toISOString() })
		.eq('id', answer.project_id)
		.select('id, state_key')
		.single();
	if (updateError || !updated) return fail(500, 'Failed to update project');

	logUpdateAsync(
		supabase,
		answer.project_id,
		'project',
		answer.project_id,
		{ state_key: previousState },
		{ state_key: updated.state_key },
		userId,
		'form'
	);

	return {
		kind: 'project',
		project_id: answer.project_id,
		project_answer: answer.project_answer,
		ok: true,
		changed: true,
		state_key: updated.state_key,
		previous_state: previousState
	};
}

/**
 * done → state done; move → new due_at; drop → archive (kept, restorable); restore → put
 * back `previous` (un-archiving or re-archiving as needed). Project answers pause or
 * finish the project, or restore its previous state. Results keep the request order and
 * carry the values before each change so the client can Undo.
 */
export async function answerCheckIns(params: {
	supabase: AnySupabase;
	userId: string;
	answers: CheckInAnswer[];
	/** Tests inject a calendar port; production loads TaskEventSyncService lazily. */
	taskSync?: TaskSyncPort;
}): Promise<CheckInAnswersPayload> {
	const taskAnswers: Array<{ index: number; answer: CheckInTaskAnswer }> = [];
	const projectAnswers: Array<{ index: number; answer: CheckInProjectAnswer }> = [];
	params.answers.forEach((answer, index) => {
		if ('task_id' in answer) taskAnswers.push({ index, answer });
		else projectAnswers.push({ index, answer });
	});

	const taskResults = await runTaskAnswers({ ...params, answers: taskAnswers });
	const results: CheckInAnswerResult[] = new Array(params.answers.length);
	for (const [index, result] of taskResults) results[index] = result;
	for (const { index, answer } of projectAnswers) {
		results[index] = await applyProjectAnswer({
			supabase: params.supabase,
			userId: params.userId,
			answer
		});
	}

	return {
		results,
		changed: results.filter((result) => result.ok && result.changed).length,
		failed: results.filter((result) => !result.ok).length
	};
}

// ---------------------------------------------------------------------------
// "Tell me how it went": a project chat where the assistant speaks first
// ---------------------------------------------------------------------------

export class CheckInChatError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

type ChatTask = { id: string; title: string; state_key: string; due_at: string; day: string };

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What the user sees first. Plain, short, and true however many were already answered. */
export function buildCheckInChatOpener(tasks: ChatTask[], today: string): string {
	const days = [...new Set(tasks.map((task) => task.day))].sort();
	const first = days[0] ? formatCheckInDayLabel(days[0], today) : null;
	const last = days.length > 1 ? formatCheckInDayLabel(days[days.length - 1]!, today) : null;
	const count = tasks.length;
	const isAre = count === 1 ? "isn't" : "aren't";
	const lead =
		days.length <= 1
			? `${plural(count, 'task')} from your ${first ?? 'earlier'} list ${isAre} marked yet:`
			: `${plural(count, 'task')} from ${first}–${last} ${isAre} marked yet:`;
	const shown = tasks.slice(0, CHAT_OPENER_TASK_LINES).map((task) => `- ${task.title}`);
	if (count > shown.length) shown.push(`- …and ${count - shown.length} more`);
	return [
		lead,
		'',
		...shown,
		'',
		"How did it go? Tell me what happened and I'll mark what got done, move what didn't, and drop what's off."
	].join('\n');
}

function buildCheckInChatModelText(params: {
	projectName: string;
	tasks: ChatTask[];
	today: string;
	timeZone: string;
}): string {
	return [
		`You are checking in with the user about planned tasks in the project "${params.projectName}" that went past their due dates and are still open.`,
		'You opened this conversation with the message above; it is already in the chat. Wait for the user to say how things went, then use the project tools on the task ids below:',
		'- Mark each task the user says happened as done (update_onto_task with state_key "done").',
		"- Move each task that didn't happen yet to a new due date (update_onto_task with due_at). If the user gave no date for it, ask for one before moving it.",
		'- Archive each task the user says is off or no longer needed (update_onto_task with archived: true).',
		'- Leave tasks the user does not mention as they are. If an answer is unclear about a task, ask instead of guessing.',
		'Do not create new tasks unless the user asks. When you are done, say briefly what you marked done, moved and archived.',
		`Today is ${params.today} (${params.timeZone}).`,
		'',
		'Tasks (id — title — due — state):',
		...params.tasks.map(
			(task) =>
				`- ${task.id} — ${task.title} — due ${formatCheckInDayLabel(task.day, params.today)} (${task.due_at}) — ${task.state_key}`
		)
	].join('\n');
}

async function removeCreatedChat(
	supabase: AnySupabase,
	params: { sessionId: string; userId: string; projectId: string }
): Promise<void> {
	await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId);
	await supabase
		.from('chat_sessions_projects')
		.delete()
		.eq('chat_session_id', params.sessionId)
		.eq('project_id', params.projectId);
	await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', params.sessionId)
		.eq('user_id', params.userId);
}

/**
 * Create (or reopen) a project chat about these overdue tasks. The caller checks project
 * write access first. One chat per project and set of due days: reopening the same card's
 * chat continues it, with the model's task list refreshed.
 */
export async function createCheckInChatSession(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	taskIds: string[];
	timeZone?: string | null;
	now?: Date;
}): Promise<CheckInChatPayload> {
	const { supabase, userId, projectId } = params;
	const timeZone = resolveCheckInTimeZone(params.timeZone);
	const now = params.now ?? new Date();
	const today = civilDateIn(now.toISOString(), timeZone) ?? now.toISOString().slice(0, 10);

	const [projectResult, tasksResult] = await Promise.all([
		supabase
			.from('onto_projects')
			.select('id, name')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle(),
		supabase
			.from('onto_tasks')
			.select('id, title, state_key, due_at')
			.eq('project_id', projectId)
			.in('id', params.taskIds)
			.is('deleted_at', null)
			.is('archived_at', null)
	]);
	if (projectResult.error) throw projectResult.error;
	if (tasksResult.error) throw tasksResult.error;
	if (!projectResult.data) throw new CheckInChatError(404, 'NOT_FOUND', 'Project not found');
	const projectName = (projectResult.data.name as string | null)?.trim() || 'Project';

	const tasks: ChatTask[] = ((tasksResult.data ?? []) as Array<Record<string, unknown>>)
		.filter((task) => task.state_key !== 'done' && typeof task.due_at === 'string')
		.map((task) => ({
			id: String(task.id),
			title: (typeof task.title === 'string' && task.title.trim()) || 'Untitled task',
			state_key: String(task.state_key),
			due_at: task.due_at as string,
			day:
				civilDateIn(task.due_at as string, timeZone) ?? (task.due_at as string).slice(0, 10)
		}))
		.sort(
			(a, b) =>
				timeMs(a.due_at) - timeMs(b.due_at) ||
				a.title.localeCompare(b.title) ||
				a.id.localeCompare(b.id)
		);
	if (!tasks.length) {
		throw new CheckInChatError(409, 'NOTHING_OPEN', 'These tasks are already answered');
	}

	const checkInKey = [...new Set(tasks.map((task) => task.day))].sort().join(',');
	const opener = buildCheckInChatOpener(tasks, today);
	const llmText = buildCheckInChatModelText({ projectName, tasks, today, timeZone });
	const focus = {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId,
		projectName
	};
	const sessionMetadata = {
		source: 'ai_inbox',
		source_type: 'check_in',
		source_ref_id: projectId,
		source_label: 'Did this happen? check-in',
		check_in_key: checkInKey,
		check_in_task_ids: tasks.map((task) => task.id),
		project_id: projectId,
		project_name: projectName,
		focus,
		proposal_context: { llm_text: llmText, operation_summaries: [], evidence_summaries: [] }
	};

	const { data: existing } = await supabase
		.from('chat_sessions')
		.select('id')
		.eq('user_id', userId)
		.eq('status', 'active')
		.contains('agent_metadata', {
			source: 'ai_inbox',
			source_type: 'check_in',
			project_id: projectId,
			check_in_key: checkInKey
		})
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	const existingId = typeof existing?.id === 'string' ? existing.id : null;
	if (existingId) {
		// Atomic shallow merge: never clobbers keys the chat stream writes concurrently.
		const { error: mergeError } = await supabase.rpc('merge_chat_session_agent_metadata', {
			p_session_id: existingId,
			p_patch: sessionMetadata as Json
		});
		if (mergeError) {
			console.warn('[Inbox check-ins] Failed to refresh chat metadata:', mergeError);
		}
		return {
			chat_session_id: existingId,
			context_type: 'project',
			entity_id: projectId,
			created: false
		};
	}

	const nowIso = now.toISOString();
	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: userId,
			context_type: 'project',
			entity_id: projectId,
			status: 'active',
			chat_type: 'project',
			title: `Check-in: ${projectName}`.slice(0, 120),
			summary: null,
			message_count: 1,
			last_message_at: nowIso,
			agent_metadata: sessionMetadata as Json
		})
		.select('id')
		.single();
	if (sessionError || !session?.id) {
		throw sessionError ?? new Error('Failed to create check-in chat session');
	}
	const sessionId = String(session.id);

	const { error: linkError } = await supabase.from('chat_sessions_projects').insert({
		chat_session_id: sessionId,
		project_id: projectId,
		linked_at: nowIso
	});
	if (linkError) {
		await removeCreatedChat(supabase, { sessionId, userId, projectId });
		throw linkError;
	}

	const { error: messageError } = await supabase.from('chat_messages').insert({
		session_id: sessionId,
		user_id: userId,
		role: 'assistant',
		content: opener,
		message_type: 'assistant_message',
		created_at: nowIso,
		metadata: {
			source: 'ai_inbox',
			source_type: 'check_in',
			source_ref_id: projectId,
			project_id: projectId,
			seed_message: true,
			proposal_context: { llm_text: llmText }
		} as Json
	});
	if (messageError) {
		await removeCreatedChat(supabase, { sessionId, userId, projectId });
		throw messageError;
	}

	return {
		chat_session_id: sessionId,
		context_type: 'project',
		entity_id: projectId,
		created: true
	};
}

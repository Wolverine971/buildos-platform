export type ProjectRow = {
	id: string;
	name: string;
	state_key: string | null;
	description?: string | null;
	start_at?: string | null;
	end_at?: string | null;
	next_step_short?: string | null;
	updated_at: string | null;
};

export type TaskRow = {
	id: string;
	project_id: string;
	title: string | null;
	state_key: string | null;
	priority?: number | null;
	due_at?: string | null;
	completed_at?: string | null;
	updated_at?: string | null;
};

export type MilestoneRow = {
	id: string;
	project_id: string;
	title: string | null;
	state_key: string | null;
	due_at?: string | null;
	completed_at?: string | null;
	updated_at?: string | null;
};

export type PlanRow = {
	id: string;
	project_id: string;
	name: string | null;
	state_key: string | null;
	updated_at?: string | null;
};

export type RiskRow = {
	id: string;
	project_id: string;
	title: string | null;
	state_key: string | null;
	impact?: string | null;
	updated_at?: string | null;
};

export type EventRow = {
	id: string;
	project_id: string;
	title: string | null;
	state_key?: string | null;
	start_at?: string | null;
	end_at?: string | null;
	updated_at?: string | null;
};

export type ProjectLogRow = {
	project_id: string;
	entity_type: string;
	entity_id: string;
	action: string;
	created_at: string;
	after_data?: Record<string, unknown> | null;
	before_data?: Record<string, unknown> | null;
};

type OverviewProjectCounts = {
	active_tasks: number;
	blocked_tasks: number;
	overdue_tasks: number;
	due_soon_tasks: number;
	open_milestones: number;
	open_plans: number;
	open_risks: number;
	upcoming_events: number;
};

type OverviewActivity = {
	entity_type: string;
	entity_id: string;
	action: string;
	title: string | null;
	created_at: string;
};

type OverviewProjectSummary = {
	project_id: string;
	name: string;
	state_key: string | null;
	description: string | null;
	next_step_short: string | null;
	updated_at: string | null;
	counts: OverviewProjectCounts;
	next_milestone: { id: string; title: string | null; due_at: string | null } | null;
	next_event: { id: string; title: string | null; start_at: string | null } | null;
	recent_activity: OverviewActivity[];
};

type WorkspaceOverviewPayload = {
	generated_at: string;
	scope: 'workspace';
	projects_returned: number;
	maybe_more: boolean;
	totals: OverviewProjectCounts & { projects: number };
	projects: OverviewProjectSummary[];
	message: string;
};

type ProjectMatchCandidate = {
	project_id: string;
	name: string;
	state_key: string | null;
	updated_at: string | null;
};

type ProjectOverviewPayload = {
	generated_at: string;
	scope: 'project';
	match:
		| { status: 'resolved'; project_id: string; query: string | null }
		| { status: 'not_found'; query: string; candidates: [] }
		| { status: 'ambiguous'; query: string; candidates: ProjectMatchCandidate[] };
	project?: {
		id: string;
		name: string;
		state_key: string | null;
		description: string | null;
		start_at: string | null;
		end_at: string | null;
		next_step_short: string | null;
		updated_at: string | null;
	};
	counts?: OverviewProjectCounts;
	tasks?: Array<{
		id: string;
		title: string | null;
		state_key: string | null;
		priority: number | null;
		due_at: string | null;
		updated_at: string | null;
	}>;
	milestones?: Array<{
		id: string;
		title: string | null;
		state_key: string | null;
		due_at: string | null;
		updated_at: string | null;
	}>;
	risks?: Array<{
		id: string;
		title: string | null;
		state_key: string | null;
		impact: string | null;
		updated_at: string | null;
	}>;
	upcoming_events?: Array<{
		id: string;
		title: string | null;
		start_at: string | null;
		end_at: string | null;
	}>;
	recent_activity?: OverviewActivity[];
	message: string;
};

type BuildWorkspaceOverviewParams = {
	projects: ProjectRow[];
	tasks: TaskRow[];
	milestones: MilestoneRow[];
	plans?: PlanRow[];
	risks: RiskRow[];
	events: EventRow[];
	projectLogs: ProjectLogRow[];
	maybeMore: boolean;
	now?: Date;
};

type BuildProjectOverviewParams = {
	project: ProjectRow;
	query?: string | null;
	tasks: TaskRow[];
	milestones: MilestoneRow[];
	plans?: PlanRow[];
	risks: RiskRow[];
	events: EventRow[];
	projectLogs: ProjectLogRow[];
	now?: Date;
};

const COMPLETED_STATE_KEYS = new Set([
	'done',
	'completed',
	'closed',
	'archived',
	'cancelled',
	'canceled',
	'mitigated'
]);

const BLOCKED_STATE_KEYS = new Set(['blocked']);
const UPCOMING_EVENT_DAYS = 14;
const DUE_SOON_DAYS = 7;
const ACTIVITY_LIMIT = 3;
const PROJECT_TASK_LIMIT = 8;
const PROJECT_MILESTONE_LIMIT = 5;
const PROJECT_RISK_LIMIT = 5;
const PROJECT_EVENT_LIMIT = 5;

function normalizeStateKey(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function toTimestamp(value: string | null | undefined): number {
	if (!value) return Number.NEGATIVE_INFINITY;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function isCompleted(
	stateKey: string | null | undefined,
	completedAt?: string | null
): boolean {
	return Boolean(completedAt) || COMPLETED_STATE_KEYS.has(normalizeStateKey(stateKey));
}

function isBlocked(stateKey: string | null | undefined): boolean {
	return BLOCKED_STATE_KEYS.has(normalizeStateKey(stateKey));
}

function isOverdue(dueAt: string | null | undefined, nowMs: number): boolean {
	const dueMs = parseTimestamp(dueAt);
	return dueMs !== null && dueMs < nowMs;
}

function isDueSoon(dueAt: string | null | undefined, nowMs: number): boolean {
	const dueMs = parseTimestamp(dueAt);
	if (dueMs === null || dueMs < nowMs) return false;
	return dueMs <= nowMs + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
}

function isUpcomingEvent(startAt: string | null | undefined, nowMs: number): boolean {
	const startMs = parseTimestamp(startAt);
	if (startMs === null || startMs < nowMs) return false;
	return startMs <= nowMs + UPCOMING_EVENT_DAYS * 24 * 60 * 60 * 1000;
}

function isOpenRisk(stateKey: string | null | undefined): boolean {
	return !COMPLETED_STATE_KEYS.has(normalizeStateKey(stateKey));
}

function isOpenPlan(stateKey: string | null | undefined): boolean {
	return !COMPLETED_STATE_KEYS.has(normalizeStateKey(stateKey));
}

function extractActivityTitle(row: ProjectLogRow): string | null {
	const afterTitle = extractTitle(row.after_data);
	if (afterTitle) return afterTitle;
	return extractTitle(row.before_data);
}

function extractTitle(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	const candidate =
		record.title ?? record.name ?? record.text ?? record.summary ?? record.display_name;
	return typeof candidate === 'string' ? candidate : null;
}

function impactRank(value: string | null | undefined): number {
	switch ((value ?? '').trim().toLowerCase()) {
		case 'critical':
			return 0;
		case 'high':
			return 1;
		case 'medium':
			return 2;
		case 'low':
			return 3;
		default:
			return 4;
	}
}

function buildProjectCounts(params: {
	tasks: TaskRow[];
	milestones: MilestoneRow[];
	plans: PlanRow[];
	risks: RiskRow[];
	events: EventRow[];
	nowMs: number;
}): OverviewProjectCounts {
	const { tasks, milestones, plans, risks, events, nowMs } = params;
	return {
		active_tasks: tasks.filter((task) => !isCompleted(task.state_key, task.completed_at)).length,
		blocked_tasks: tasks.filter(
			(task) => !isCompleted(task.state_key, task.completed_at) && isBlocked(task.state_key)
		).length,
		overdue_tasks: tasks.filter(
			(task) =>
				!isCompleted(task.state_key, task.completed_at) && isOverdue(task.due_at, nowMs)
		).length,
		due_soon_tasks: tasks.filter(
			(task) =>
				!isCompleted(task.state_key, task.completed_at) && isDueSoon(task.due_at, nowMs)
		).length,
		open_milestones: milestones.filter(
			(milestone) => !isCompleted(milestone.state_key, milestone.completed_at)
		).length,
		open_plans: plans.filter((plan) => isOpenPlan(plan.state_key)).length,
		open_risks: risks.filter((risk) => isOpenRisk(risk.state_key)).length,
		upcoming_events: events.filter((event) => isUpcomingEvent(event.start_at, nowMs)).length
	};
}

function sortTasks(tasks: TaskRow[], nowMs: number): TaskRow[] {
	return [...tasks].sort((a, b) => {
		const aCompleted = isCompleted(a.state_key, a.completed_at);
		const bCompleted = isCompleted(b.state_key, b.completed_at);
		if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
		if (!aCompleted && !bCompleted) {
			const aOverdue = isOverdue(a.due_at, nowMs);
			const bOverdue = isOverdue(b.due_at, nowMs);
			if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

			const aBlocked = isBlocked(a.state_key);
			const bBlocked = isBlocked(b.state_key);
			if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;

			const aDueSoon = isDueSoon(a.due_at, nowMs);
			const bDueSoon = isDueSoon(b.due_at, nowMs);
			if (aDueSoon !== bDueSoon) return aDueSoon ? -1 : 1;

			const aPriority = typeof a.priority === 'number' ? a.priority : Number.NEGATIVE_INFINITY;
			const bPriority = typeof b.priority === 'number' ? b.priority : Number.NEGATIVE_INFINITY;
			if (aPriority !== bPriority) return bPriority - aPriority;
		}

		return toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
	});
}

function sortMilestones(milestones: MilestoneRow[], nowMs: number): MilestoneRow[] {
	return [...milestones].sort((a, b) => {
		const aCompleted = isCompleted(a.state_key, a.completed_at);
		const bCompleted = isCompleted(b.state_key, b.completed_at);
		if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

		const aDue = parseTimestamp(a.due_at);
		const bDue = parseTimestamp(b.due_at);
		if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
		if (aDue !== null && bDue === null) return -1;
		if (aDue === null && bDue !== null) return 1;

		const aOverdue = isOverdue(a.due_at, nowMs);
		const bOverdue = isOverdue(b.due_at, nowMs);
		if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

		return toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
	});
}

function sortRisks(risks: RiskRow[]): RiskRow[] {
	return [...risks].sort((a, b) => {
		const aClosed = !isOpenRisk(a.state_key);
		const bClosed = !isOpenRisk(b.state_key);
		if (aClosed !== bClosed) return aClosed ? 1 : -1;
		const rankDelta = impactRank(a.impact) - impactRank(b.impact);
		if (rankDelta !== 0) return rankDelta;
		return toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
	});
}

function sortEvents(events: EventRow[]): EventRow[] {
	return [...events].sort((a, b) => {
		const startDelta = toTimestamp(a.start_at) - toTimestamp(b.start_at);
		if (startDelta !== 0) return startDelta;
		return toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
	});
}

function buildActivity(rows: ProjectLogRow[], limit: number): OverviewActivity[] {
	return [...rows]
		.filter((row) => row.action === 'created' || row.action === 'updated')
		.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
		.slice(0, limit)
		.map((row) => ({
			entity_type: row.entity_type,
			entity_id: row.entity_id,
			action: row.action,
			title: extractActivityTitle(row),
			created_at: row.created_at
		}));
}

function groupByProjectId<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const bucket = map.get(row.project_id);
		if (bucket) {
			bucket.push(row);
			continue;
		}
		map.set(row.project_id, [row]);
	}
	return map;
}

export function buildWorkspaceOverviewPayload(
	params: BuildWorkspaceOverviewParams
): WorkspaceOverviewPayload {
	const now = params.now ?? new Date();
	const nowMs = now.getTime();
	const tasksByProject = groupByProjectId(params.tasks);
	const milestonesByProject = groupByProjectId(params.milestones);
	const plansByProject = groupByProjectId(params.plans ?? []);
	const risksByProject = groupByProjectId(params.risks);
	const eventsByProject = groupByProjectId(params.events);
	const logsByProject = groupByProjectId(params.projectLogs);

	const projects = params.projects.map((project) => {
		const tasks = tasksByProject.get(project.id) ?? [];
		const milestones = milestonesByProject.get(project.id) ?? [];
		const plans = plansByProject.get(project.id) ?? [];
		const risks = risksByProject.get(project.id) ?? [];
		const events = (eventsByProject.get(project.id) ?? []).filter((event) =>
			isUpcomingEvent(event.start_at, nowMs)
		);
		const recentActivity = buildActivity(logsByProject.get(project.id) ?? [], ACTIVITY_LIMIT);
		const counts = buildProjectCounts({
			tasks,
			milestones,
			plans,
			risks,
			events,
			nowMs
		});
		const nextMilestone = sortMilestones(
			milestones.filter((milestone) => !isCompleted(milestone.state_key, milestone.completed_at)),
			nowMs
		)[0];
		const nextEvent = sortEvents(events)[0];

		return {
			project_id: project.id,
			name: project.name,
			state_key: project.state_key,
			description: project.description ?? null,
			next_step_short: project.next_step_short ?? null,
			updated_at: project.updated_at,
			counts,
			next_milestone: nextMilestone
				? {
						id: nextMilestone.id,
						title: nextMilestone.title ?? null,
						due_at: nextMilestone.due_at ?? null
					}
				: null,
			next_event: nextEvent
				? {
						id: nextEvent.id,
						title: nextEvent.title ?? null,
						start_at: nextEvent.start_at ?? null
					}
				: null,
			recent_activity: recentActivity
		};
	});

	const totals = projects.reduce<WorkspaceOverviewPayload['totals']>(
		(acc, project) => {
			acc.projects += 1;
			acc.active_tasks += project.counts.active_tasks;
			acc.blocked_tasks += project.counts.blocked_tasks;
			acc.overdue_tasks += project.counts.overdue_tasks;
			acc.due_soon_tasks += project.counts.due_soon_tasks;
			acc.open_milestones += project.counts.open_milestones;
			acc.open_plans += project.counts.open_plans;
			acc.open_risks += project.counts.open_risks;
			acc.upcoming_events += project.counts.upcoming_events;
			return acc;
		},
		{
			projects: 0,
			active_tasks: 0,
			blocked_tasks: 0,
			overdue_tasks: 0,
			due_soon_tasks: 0,
			open_milestones: 0,
			open_plans: 0,
			open_risks: 0,
			upcoming_events: 0
		}
	);

	const projectLabel = projects.length === 1 ? 'project' : 'projects';
	return {
		generated_at: now.toISOString(),
		scope: 'workspace',
		projects_returned: projects.length,
		maybe_more: params.maybeMore,
		totals,
		projects,
		message:
			projects.length === 0
				? 'No accessible BuildOS projects were found.'
				: `Workspace overview prepared for ${projects.length} ${projectLabel}.`
	};
}

export function resolveProjectMatch(
	projects: ProjectRow[],
	query: string
):
	| { status: 'resolved'; project: ProjectRow }
	| { status: 'not_found'; candidates: [] }
	| { status: 'ambiguous'; candidates: ProjectMatchCandidate[] } {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return { status: 'not_found', candidates: [] };
	}

	const exactMatches = projects.filter((project) => project.name.trim().toLowerCase() === normalizedQuery);
	if (exactMatches.length === 1) {
		return { status: 'resolved', project: exactMatches[0]! };
	}
	if (exactMatches.length > 1) {
		return {
			status: 'ambiguous',
			candidates: exactMatches.map((project) => ({
				project_id: project.id,
				name: project.name,
				state_key: project.state_key,
				updated_at: project.updated_at
			}))
		};
	}

	if (projects.length === 1) {
		return { status: 'resolved', project: projects[0]! };
	}

	if (projects.length === 0) {
		return {
			status: 'not_found',
			candidates: []
		};
	}

	return {
		status: 'ambiguous',
		candidates: projects.map((project) => ({
			project_id: project.id,
			name: project.name,
			state_key: project.state_key,
			updated_at: project.updated_at
		}))
	};
}

export function buildProjectOverviewPayload(
	params: BuildProjectOverviewParams
): ProjectOverviewPayload {
	const now = params.now ?? new Date();
	const nowMs = now.getTime();
	const upcomingEvents = sortEvents(
		params.events.filter((event) => isUpcomingEvent(event.start_at, nowMs))
	).slice(0, PROJECT_EVENT_LIMIT);
	const counts = buildProjectCounts({
		tasks: params.tasks,
		milestones: params.milestones,
		plans: params.plans ?? [],
		risks: params.risks,
		events: upcomingEvents,
		nowMs
	});
	const tasks = sortTasks(
		params.tasks.filter((task) => !isCompleted(task.state_key, task.completed_at)),
		nowMs
	)
		.slice(0, PROJECT_TASK_LIMIT)
		.map((task) => ({
			id: task.id,
			title: task.title ?? null,
			state_key: task.state_key,
			priority: typeof task.priority === 'number' ? task.priority : null,
			due_at: task.due_at ?? null,
			updated_at: task.updated_at ?? null
		}));
	const milestones = sortMilestones(
		params.milestones.filter((milestone) => !isCompleted(milestone.state_key, milestone.completed_at)),
		nowMs
	)
		.slice(0, PROJECT_MILESTONE_LIMIT)
		.map((milestone) => ({
			id: milestone.id,
			title: milestone.title ?? null,
			state_key: milestone.state_key,
			due_at: milestone.due_at ?? null,
			updated_at: milestone.updated_at ?? null
		}));
	const risks = sortRisks(params.risks.filter((risk) => isOpenRisk(risk.state_key)))
		.slice(0, PROJECT_RISK_LIMIT)
		.map((risk) => ({
			id: risk.id,
			title: risk.title ?? null,
			state_key: risk.state_key,
			impact: risk.impact ?? null,
			updated_at: risk.updated_at ?? null
		}));
	const recentActivity = buildActivity(params.projectLogs, PROJECT_EVENT_LIMIT);

	return {
		generated_at: now.toISOString(),
		scope: 'project',
		match: {
			status: 'resolved',
			project_id: params.project.id,
			query: params.query ?? null
		},
		project: {
			id: params.project.id,
			name: params.project.name,
			state_key: params.project.state_key,
			description: params.project.description ?? null,
			start_at: params.project.start_at ?? null,
			end_at: params.project.end_at ?? null,
			next_step_short: params.project.next_step_short ?? null,
			updated_at: params.project.updated_at
		},
		counts,
		tasks,
		milestones,
		risks,
		upcoming_events: upcomingEvents.map((event) => ({
			id: event.id,
			title: event.title ?? null,
			start_at: event.start_at ?? null,
			end_at: event.end_at ?? null
		})),
		recent_activity: recentActivity,
		message: `Project overview prepared for ${params.project.name}.`
	};
}

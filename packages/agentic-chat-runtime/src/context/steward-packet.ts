// packages/agentic-chat-runtime/src/context/steward-packet.ts
//
// Project stewards, beta (docs/product/project-agents-plan-2026-09-25.md).
//
// A steward is project chat speaking as the project's own collaborator. Its
// packet has three layers, each with its own author:
// - Charter: standing orders the user approved. The approved text lives in
//   `user_project_behavioral_profiles.agent_instructions`, which only a
//   privileged, session-authenticated endpoint writes (no chat, connector, or
//   worker tool can), so the prompt can render it as instructions. The charter
//   DOCUMENT in the project is the editable proposal; when its text differs
//   from the approved copy, the edits are pending and never followed.
// - Narration: START HERE, loaded separately (`start_here`).
// - Live facts: computed here from the records, with no model call.
//
// A project has a steward for a user only when that user's profile row carries
// an approved charter and `dimensions.steward.active` is not false. No row, no
// steward: every other project chat is unchanged.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export const STEWARD_CHARTER_DOCUMENT_TYPE_KEY = 'document.context.steward_charter';
/** Key under `user_project_behavioral_profiles.dimensions` that holds steward state. */
export const STEWARD_PROFILE_DIMENSION_KEY = 'steward';
export const STEWARD_CHARTER_MAX_CHARS = 4000;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_CHANGE_DAYS = 7;
const UPCOMING_DAYS = 14;
const TASK_FETCH_LIMIT = 1000;
const LOG_FETCH_LIMIT = 400;
const DOCUMENT_FETCH_LIMIT = 500;
const IN_PROGRESS_LIMIT = 6;
const BLOCKED_LIMIT = 3;
const UPCOMING_LIMIT = 8;
const LATEST_CHANGES_LIMIT = 4;
const GOAL_LIMIT = 8;
const GOAL_CHILD_LIMIT = 4;
const OTHER_ITEM_LIMIT = 4;

// Connector callers carry a structured client profile id. Friendly names for
// the ones BuildOS ships profiles for; anything else falls back to the name the
// installation registered.
const KNOWN_CALLER_LABELS: Record<string, string> = {
	'codex-cli': 'Codex',
	claude: 'Claude Code',
	'claude-code': 'Claude Code',
	openclaw: 'OpenClaw'
};

export type StewardProfileState = {
	active: boolean;
	charter_document_id: string | null;
	approved_sha256: string | null;
	approved_at: string | null;
};

export type StewardMilestoneFact = {
	id: string;
	title: string;
	state: string;
	due_at: string | null;
	/** Optional: packets cached before 2026-09-27 lack it. */
	tasks?: StewardTaskCounts;
};

export type StewardTaskCounts = { open: number; done: number };

export type StewardPlanFact = {
	id: string;
	name: string;
	state: string;
	start_date: string | null;
	end_date: string | null;
	tasks: StewardTaskCounts;
};

export type StewardGoalFact = {
	id: string;
	name: string;
	state: string;
	target_date: string | null;
	milestones: StewardMilestoneFact[];
	plans: StewardPlanFact[];
	tasks: StewardTaskCounts;
};

export type StewardTaskFact = {
	id: string;
	title: string;
	due_at: string | null;
	updated_at: string | null;
};

export type StewardUpcomingFact = {
	kind: 'task' | 'milestone' | 'goal' | 'plan' | 'event';
	id: string;
	title: string;
	at: string;
	what: 'due' | 'starts' | 'target' | 'ends' | 'scheduled';
};

export type StewardChangeFact = {
	source: string;
	entity_type: string;
	title: string | null;
	at: string;
};

export type StewardLiveFacts = {
	goals: StewardGoalFact[];
	/** Settled (achieved or abandoned) goals past the cap. */
	goals_omitted: number;
	/** Open (active or draft) goals past the cap. Optional for older cached packets. */
	open_goals_omitted?: number;
	/**
	 * Record kinds whose query failed, so the prompt says they are unknown
	 * instead of presenting an empty list as fact.
	 */
	unavailable?: string[];
	/** Open milestones not under any goal. */
	other_milestones: StewardMilestoneFact[];
	/** Plans not under any goal that are still draft or active. */
	other_plans: StewardPlanFact[];
	/** Completed plans not under any goal (a count; their names are history). */
	other_plans_completed: number;
	tasks: {
		open: number;
		todo: number;
		in_progress: number;
		blocked: number;
		done: number;
		overdue: number;
		oldest_overdue_due_at: string | null;
		done_last_7_days: number;
		/** Open tasks under no goal, plan, or milestone. */
		unlinked_open: number;
	};
	in_progress: StewardTaskFact[];
	blocked: StewardTaskFact[];
	upcoming: StewardUpcomingFact[];
	changes_last_7_days: {
		total: number;
		by_source: Array<{ source: string; count: number }>;
		latest: StewardChangeFact[];
	};
	/** Last edit per document id, so the document map can lead with what's active. */
	document_updated_at: Record<string, string>;
};

export type ProjectStewardPacket = {
	version: 1;
	computed_at: string;
	charter: {
		text: string;
		approved_at: string | null;
		document_id: string | null;
		/** When the charter document was last saved, if its text differs from the approved copy. */
		pending_edits_at: string | null;
	};
	facts: StewardLiveFacts;
};

// ---------------------------------------------------------------------------
// Pure fact assembly
// ---------------------------------------------------------------------------

export type StewardGoalRow = {
	id: string;
	name: string | null;
	state_key: string | null;
	target_date: string | null;
};
export type StewardMilestoneRow = {
	id: string;
	title: string | null;
	state_key: string | null;
	due_at: string | null;
};
export type StewardPlanRow = {
	id: string;
	name: string | null;
	state_key: string | null;
	start_date: string | null;
	end_date: string | null;
};
export type StewardTaskRow = {
	id: string;
	title: string | null;
	state_key: string | null;
	due_at: string | null;
	start_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};
export type StewardEdgeRow = {
	rel: string;
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
};
export type StewardLogRow = {
	created_at: string;
	change_source: string | null;
	chat_session_id: string | null;
	external_agent_caller_id: string | null;
	entity_type: string;
	after_title: string | null;
	after_name: string | null;
	event: string | null;
};
export type StewardCallerRow = {
	id: string;
	provider: string | null;
	metadata: unknown;
};
export type StewardEventRow = {
	id: string;
	title: string | null;
	start_at: string | null;
};
export type StewardDocumentRow = {
	id: string;
	updated_at: string | null;
};

export type StewardFactRows = {
	goals: StewardGoalRow[];
	milestones: StewardMilestoneRow[];
	plans: StewardPlanRow[];
	tasks: StewardTaskRow[];
	edges: StewardEdgeRow[];
	logs: StewardLogRow[];
	callers: StewardCallerRow[];
	events: StewardEventRow[];
	documents?: StewardDocumentRow[];
	/** Record kinds whose query failed (see StewardLiveFacts.unavailable). */
	unavailable?: string[];
};

// Ledger rows the steward's own on/off and approval actions write. They exist
// to invalidate cached chat context; they are not project work.
const STEWARD_CONTROL_EVENTS = new Set(['steward_charter_approved', 'steward_toggled']);

// Containment edges, by rel. Canonical parent-first rels plus the older names
// still in the graph ("has", "contains"); child-first rels point from the task
// or plan to the goal or milestone it serves. Dependency, sequence, and
// reference rels (depends_on, precedes, led_to, references, ...) are not
// containment and stay out of the tree.
export const STEWARD_PARENT_FIRST_RELS = [
	'has_task',
	'has_plan',
	'has_milestone',
	'achieved_by',
	'contains',
	'has'
] as const;
export const STEWARD_CHILD_FIRST_RELS = [
	'supports_goal',
	'targets_milestone',
	'supports',
	'contributes_to',
	'implements'
] as const;
const PARENT_FIRST_RELS = new Set<string>(STEWARD_PARENT_FIRST_RELS);
const CHILD_FIRST_RELS = new Set<string>(STEWARD_CHILD_FIRST_RELS);
const CHILD_KINDS_BY_PARENT: Record<string, ReadonlySet<string>> = {
	goal: new Set(['milestone', 'plan', 'task']),
	milestone: new Set(['plan', 'task']),
	plan: new Set(['task'])
};

type StewardContainment = {
	parentKind: 'goal' | 'milestone' | 'plan';
	parentId: string;
	childKind: 'milestone' | 'plan' | 'task';
	childId: string;
};

/** One edge as parent → child in the goal tree, or null when it isn't containment. */
export function toStewardContainment(edge: StewardEdgeRow): StewardContainment | null {
	const parentFirst = PARENT_FIRST_RELS.has(edge.rel);
	if (!parentFirst && !CHILD_FIRST_RELS.has(edge.rel)) return null;
	const [parentKind, parentId, childKind, childId] = parentFirst
		? [edge.src_kind, edge.src_id, edge.dst_kind, edge.dst_id]
		: [edge.dst_kind, edge.dst_id, edge.src_kind, edge.src_id];
	if (!CHILD_KINDS_BY_PARENT[parentKind]?.has(childKind)) return null;
	return {
		parentKind: parentKind as StewardContainment['parentKind'],
		parentId,
		childKind: childKind as StewardContainment['childKind'],
		childId
	};
}

export function buildStewardLiveFacts(rows: StewardFactRows, nowIso: string): StewardLiveFacts {
	const nowMs = Date.parse(nowIso);
	const recentCutoff = nowMs - RECENT_CHANGE_DAYS * DAY_MS;
	const upcomingEnd = nowMs + UPCOMING_DAYS * DAY_MS;

	const taskById = new Map(rows.tasks.map((task) => [task.id, task]));
	const isOpen = (task: StewardTaskRow) => task.state_key !== 'done';

	const children = new Map<
		string,
		{ milestones: Set<string>; plans: Set<string>; tasks: Set<string> }
	>();
	const childOf = (id: string) => {
		let entry = children.get(id);
		if (!entry) {
			entry = { milestones: new Set(), plans: new Set(), tasks: new Set() };
			children.set(id, entry);
		}
		return entry;
	};
	const linkedTaskIds = new Set<string>();
	const milestonesUnderGoal = new Set<string>();
	const plansUnderGoal = new Set<string>();
	for (const edge of rows.edges) {
		const link = toStewardContainment(edge);
		if (!link) continue;
		const entry = childOf(link.parentId);
		if (link.childKind === 'task') {
			entry.tasks.add(link.childId);
			linkedTaskIds.add(link.childId);
		} else if (link.childKind === 'milestone') {
			entry.milestones.add(link.childId);
			if (link.parentKind === 'goal') milestonesUnderGoal.add(link.childId);
		} else {
			entry.plans.add(link.childId);
			if (link.parentKind === 'goal') plansUnderGoal.add(link.childId);
		}
	}
	// A plan that serves a milestone under a goal serves that goal too.
	for (const goal of rows.goals) {
		const entry = children.get(goal.id);
		if (!entry) continue;
		for (const milestoneId of entry.milestones) {
			for (const planId of children.get(milestoneId)?.plans ?? []) {
				entry.plans.add(planId);
				plansUnderGoal.add(planId);
			}
		}
	}

	const countTasks = (ids: Iterable<string> | undefined): StewardTaskCounts => {
		const counts = { open: 0, done: 0 };
		for (const id of ids ?? []) {
			const task = taskById.get(id);
			if (!task) continue;
			if (isOpen(task)) counts.open += 1;
			else counts.done += 1;
		}
		return counts;
	};

	const milestoneById = new Map(rows.milestones.map((row) => [row.id, row]));
	const planById = new Map(rows.plans.map((row) => [row.id, row]));
	const toMilestone = (row: StewardMilestoneRow): StewardMilestoneFact => ({
		id: row.id,
		title: row.title?.trim() || 'Untitled milestone',
		state: row.state_key ?? 'pending',
		due_at: row.due_at,
		tasks: countTasks(children.get(row.id)?.tasks)
	});
	const toPlan = (row: StewardPlanRow): StewardPlanFact => ({
		id: row.id,
		name: row.name?.trim() || 'Untitled plan',
		state: row.state_key ?? 'draft',
		start_date: row.start_date,
		end_date: row.end_date,
		tasks: countTasks(children.get(row.id)?.tasks)
	});

	// Live goals first (active, then draft), then settled ones.
	const goalRank = (state: string | null) =>
		state === 'active' ? 0 : state === 'draft' ? 1 : state === 'achieved' ? 2 : 3;
	const sortedGoals = [...rows.goals].sort(
		(a, b) => goalRank(a.state_key) - goalRank(b.state_key)
	);
	const goals: StewardGoalFact[] = sortedGoals.slice(0, GOAL_LIMIT).map((goal) => {
		const entry = children.get(goal.id);
		const goalTaskIds = new Set(entry?.tasks ?? []);
		return {
			id: goal.id,
			name: goal.name?.trim() || 'Untitled goal',
			state: goal.state_key ?? 'draft',
			target_date: goal.target_date,
			milestones: [...(entry?.milestones ?? [])]
				.map((id) => milestoneById.get(id))
				.filter((row): row is StewardMilestoneRow => Boolean(row))
				.slice(0, GOAL_CHILD_LIMIT)
				.map(toMilestone),
			plans: [...(entry?.plans ?? [])]
				.map((id) => planById.get(id))
				.filter((row): row is StewardPlanRow => Boolean(row))
				.slice(0, GOAL_CHILD_LIMIT)
				.map(toPlan),
			tasks: countTasks(goalTaskIds)
		};
	});

	const otherMilestones = rows.milestones
		.filter(
			(row) =>
				!milestonesUnderGoal.has(row.id) &&
				row.state_key !== 'completed' &&
				row.state_key !== 'missed'
		)
		.slice(0, OTHER_ITEM_LIMIT)
		.map(toMilestone);
	const otherPlanRows = rows.plans.filter((row) => !plansUnderGoal.has(row.id));
	const otherPlans = otherPlanRows
		.filter((row) => row.state_key !== 'completed')
		.slice(0, OTHER_ITEM_LIMIT)
		.map(toPlan);
	const otherPlansCompleted = otherPlanRows.filter((row) => row.state_key === 'completed').length;

	const openTasks = rows.tasks.filter(isOpen);
	const overdue = openTasks.filter((task) => {
		const due = task.due_at ? Date.parse(task.due_at) : Number.NaN;
		return Number.isFinite(due) && due < nowMs;
	});
	const oldestOverdue = overdue
		.map((task) => task.due_at as string)
		.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
	const byRecentUpdate = (a: StewardTaskRow, b: StewardTaskRow) =>
		(Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0);
	const toTaskFact = (task: StewardTaskRow): StewardTaskFact => ({
		id: task.id,
		title: task.title?.trim() || 'Untitled task',
		due_at: task.due_at,
		updated_at: task.updated_at
	});

	const upcoming: StewardUpcomingFact[] = [];
	const inWindow = (value: string | null): value is string => {
		const at = value ? Date.parse(value) : Number.NaN;
		return Number.isFinite(at) && at >= nowMs && at <= upcomingEnd;
	};
	for (const task of openTasks) {
		const title = task.title?.trim() || 'Untitled task';
		if (inWindow(task.due_at)) {
			upcoming.push({ kind: 'task', id: task.id, title, at: task.due_at, what: 'due' });
		} else if (inWindow(task.start_at)) {
			upcoming.push({ kind: 'task', id: task.id, title, at: task.start_at, what: 'starts' });
		}
	}
	for (const row of rows.milestones) {
		if (row.state_key === 'completed' || row.state_key === 'missed') continue;
		if (inWindow(row.due_at)) {
			upcoming.push({
				kind: 'milestone',
				id: row.id,
				title: row.title?.trim() || 'Untitled milestone',
				at: row.due_at,
				what: 'due'
			});
		}
	}
	for (const row of rows.goals) {
		if (row.state_key === 'achieved' || row.state_key === 'abandoned') continue;
		if (inWindow(row.target_date)) {
			upcoming.push({
				kind: 'goal',
				id: row.id,
				title: row.name?.trim() || 'Untitled goal',
				at: row.target_date,
				what: 'target'
			});
		}
	}
	for (const row of rows.plans) {
		if (row.state_key === 'completed') continue;
		if (inWindow(row.end_date)) {
			upcoming.push({
				kind: 'plan',
				id: row.id,
				title: row.name?.trim() || 'Untitled plan',
				at: row.end_date,
				what: 'ends'
			});
		}
	}
	for (const row of rows.events) {
		if (inWindow(row.start_at)) {
			upcoming.push({
				kind: 'event',
				id: row.id,
				title: row.title?.trim() || 'Untitled event',
				at: row.start_at,
				what: 'scheduled'
			});
		}
	}
	upcoming.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

	const callerLabels = new Map(rows.callers.map((caller) => [caller.id, callerLabel(caller)]));
	const recentLogs = rows.logs
		.filter((log) => {
			const at = Date.parse(log.created_at);
			return (
				Number.isFinite(at) &&
				at >= recentCutoff &&
				!STEWARD_CONTROL_EVENTS.has(log.event ?? '')
			);
		})
		.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
	const sourceCounts = new Map<string, number>();
	const latestBySource = new Map<string, StewardChangeFact>();
	for (const log of recentLogs) {
		const source = resolveChangeSource(log, callerLabels);
		sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
		if (!latestBySource.has(source)) {
			latestBySource.set(source, {
				source,
				entity_type: log.entity_type,
				title: (log.after_title ?? log.after_name)?.trim() || null,
				at: log.created_at
			});
		}
	}

	const isLiveGoal = (state: string | null) => state === 'active' || state === 'draft';
	const liveGoalsShown = goals.filter((goal) => isLiveGoal(goal.state)).length;
	const liveGoalsTotal = rows.goals.filter((goal) =>
		isLiveGoal(goal.state_key ?? 'draft')
	).length;

	return {
		goals,
		goals_omitted: Math.max(
			0,
			rows.goals.length - liveGoalsTotal - (goals.length - liveGoalsShown)
		),
		open_goals_omitted: Math.max(0, liveGoalsTotal - liveGoalsShown),
		...(rows.unavailable?.length ? { unavailable: [...rows.unavailable] } : {}),
		other_milestones: otherMilestones,
		other_plans: otherPlans,
		other_plans_completed: otherPlansCompleted,
		tasks: {
			open: openTasks.length,
			todo: openTasks.filter((task) => task.state_key === 'todo').length,
			in_progress: openTasks.filter((task) => task.state_key === 'in_progress').length,
			blocked: openTasks.filter((task) => task.state_key === 'blocked').length,
			done: rows.tasks.length - openTasks.length,
			overdue: overdue.length,
			oldest_overdue_due_at: oldestOverdue ?? null,
			done_last_7_days: rows.tasks.filter((task) => {
				if (isOpen(task) || !task.completed_at) return false;
				const at = Date.parse(task.completed_at);
				return Number.isFinite(at) && at >= recentCutoff;
			}).length,
			unlinked_open: openTasks.filter((task) => !linkedTaskIds.has(task.id)).length
		},
		in_progress: openTasks
			.filter((task) => task.state_key === 'in_progress')
			.sort(byRecentUpdate)
			.slice(0, IN_PROGRESS_LIMIT)
			.map(toTaskFact),
		blocked: openTasks
			.filter((task) => task.state_key === 'blocked')
			.sort(byRecentUpdate)
			.slice(0, BLOCKED_LIMIT)
			.map(toTaskFact),
		upcoming: upcoming.slice(0, UPCOMING_LIMIT),
		changes_last_7_days: {
			total: recentLogs.length,
			by_source: [...sourceCounts.entries()]
				.map(([source, count]) => ({ source, count }))
				.sort((a, b) => b.count - a.count),
			latest: [...latestBySource.values()].slice(0, LATEST_CHANGES_LIMIT)
		},
		document_updated_at: Object.fromEntries(
			(rows.documents ?? [])
				.filter((doc): doc is StewardDocumentRow & { updated_at: string } =>
					Boolean(doc.updated_at)
				)
				.map((doc) => [doc.id, doc.updated_at])
		)
	};
}

/**
 * Who made a ledger change, in words the steward can say. A connector write
 * names its caller; an in-app chat write carries the chat session (the chat
 * gateway records those as `agent_call` too, which the activity timeline
 * mislabels "Connected agent").
 */
export function resolveChangeSource(
	log: Pick<StewardLogRow, 'change_source' | 'chat_session_id' | 'external_agent_caller_id'>,
	callerLabels: Map<string, string>
): string {
	if (log.external_agent_caller_id) {
		return callerLabels.get(log.external_agent_caller_id) ?? 'Outside agent';
	}
	if (log.chat_session_id || log.change_source === 'chat') return 'BuildOS chat';
	if (log.change_source === 'brain_dump') return 'Brain dump';
	if (log.change_source === 'agent_call') return 'BuildOS agent run';
	return 'App';
}

function callerLabel(caller: StewardCallerRow): string {
	const metadata =
		caller.metadata && typeof caller.metadata === 'object' && !Array.isArray(caller.metadata)
			? (caller.metadata as Record<string, unknown>)
			: {};
	const profileId =
		typeof metadata.client_profile_id === 'string' ? metadata.client_profile_id : null;
	const known =
		(profileId && KNOWN_CALLER_LABELS[profileId]) ||
		(caller.provider && KNOWN_CALLER_LABELS[caller.provider]);
	if (known) return known;
	for (const key of ['client_name', 'installation_name']) {
		const value = metadata[key];
		if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 60);
	}
	return caller.provider?.trim() || 'Outside agent';
}

// ---------------------------------------------------------------------------
// Charter approval
// ---------------------------------------------------------------------------

/** The text an approval covers: line endings normalized, outer whitespace trimmed. */
export function normalizeStewardCharterText(text: string): string {
	return text.replace(/\r\n?/g, '\n').trim();
}

export async function hashStewardCharterText(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(normalizeStewardCharterText(text));
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

export function readStewardProfileState(dimensions: unknown): StewardProfileState | null {
	if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return null;
	const raw = (dimensions as Record<string, unknown>)[STEWARD_PROFILE_DIMENSION_KEY];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const text = (key: string) =>
		typeof record[key] === 'string' && (record[key] as string).trim()
			? (record[key] as string).trim()
			: null;
	return {
		active: record.active !== false,
		charter_document_id: text('charter_document_id'),
		approved_sha256: text('approved_sha256'),
		approved_at: text('approved_at')
	};
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type StewardLoadError = (stage: string, error: unknown) => void;

/** Same row `isFeatureEnabled` reads in the web app; RLS lets users read their own flags. */
const STEWARD_FEATURE_FLAG = 'project_steward';

async function readStewardFlag(
	supabase: SupabaseClient<Database>,
	userId: string,
	onError?: StewardLoadError
): Promise<boolean> {
	try {
		const { data, error } = await supabase
			.from('feature_flags')
			.select('enabled')
			.eq('user_id', userId)
			.eq('feature_name', STEWARD_FEATURE_FLAG)
			.maybeSingle();
		if (error) {
			onError?.('query.steward.flag', error);
			return false;
		}
		return data?.enabled === true;
	} catch (error) {
		onError?.('query.steward.flag', error);
		return false;
	}
}

/**
 * The steward packet for one user and project, or null when that user has no
 * active steward there. Reads run on the caller's user-scoped client: RLS
 * limits the profile row to its owner and the facts to project members.
 *
 * The charter renders as instructions, so it must be exactly the text the
 * user approved: the stored copy has to hash to the approval's sha, and the
 * `project_steward` flag has to be on (turning it off is the kill switch).
 * Everyone else pays for one profile read.
 */
export async function loadProjectStewardPacket(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	projectId: string;
	nowIso?: string;
	onError?: StewardLoadError;
}): Promise<ProjectStewardPacket | null> {
	const { supabase, userId, projectId, onError } = params;
	const nowIso = params.nowIso ?? new Date().toISOString();

	const { data: profile, error: profileError } = await supabase
		.from('user_project_behavioral_profiles')
		.select('agent_instructions, dimensions')
		.eq('user_id', userId)
		.eq('project_id', projectId)
		.maybeSingle();
	if (profileError) {
		onError?.('query.steward.profile', profileError);
		return null;
	}
	const state = profile ? readStewardProfileState(profile.dimensions) : null;
	const approvedText = normalizeStewardCharterText(profile?.agent_instructions ?? '');
	if (!state?.active || !approvedText || !state.approved_sha256) return null;
	if ((await hashStewardCharterText(approvedText)) !== state.approved_sha256) {
		onError?.('steward.charter_hash_mismatch', new Error('approved charter hash mismatch'));
		return null;
	}
	const charterText = approvedText.slice(0, STEWARD_CHARTER_MAX_CHARS);

	const sinceIso = new Date(Date.parse(nowIso) - RECENT_CHANGE_DAYS * DAY_MS).toISOString();
	const untilIso = new Date(Date.parse(nowIso) + UPCOMING_DAYS * DAY_MS).toISOString();
	// A failed read yields an empty list, and its record kind is marked
	// unavailable so the prompt never states "none" from a failure.
	const unavailable: string[] = [];
	const settle = async <T>(
		stage: string,
		run: () => PromiseLike<{ data: T[] | null; error: unknown }>
	) => {
		const fail = (error: unknown) => {
			onError?.(stage, error);
			unavailable.push(stage.replace(/^query\.steward\./, ''));
			return [] as T[];
		};
		try {
			const { data, error } = await run();
			return error ? fail(error) : (data ?? []);
		} catch (error) {
			return fail(error);
		}
	};

	const [
		flagEnabled,
		goals,
		milestones,
		plans,
		tasks,
		edges,
		logs,
		events,
		documents,
		charterDoc
	] = await Promise.all([
		readStewardFlag(supabase, userId, onError),
		settle<StewardGoalRow>('query.steward.goals', () =>
			supabase
				.from('onto_goals')
				.select('id, name, state_key, target_date')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.limit(50)
		),
		settle<StewardMilestoneRow>('query.steward.milestones', () =>
			supabase
				.from('onto_milestones')
				.select('id, title, state_key, due_at')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.order('due_at', { ascending: true, nullsFirst: false })
				.limit(100)
		),
		settle<StewardPlanRow>(
			'query.steward.plans',
			() =>
				supabase
					.from('onto_plans')
					.select(
						'id, name, state_key, start_date:props->>start_date, end_date:props->>end_date'
					)
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null)
					.limit(100) as unknown as PromiseLike<{
					data: StewardPlanRow[] | null;
					error: unknown;
				}>
		),
		settle<StewardTaskRow>('query.steward.tasks', () =>
			supabase
				.from('onto_tasks')
				.select('id, title, state_key, due_at, start_at, completed_at, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.limit(TASK_FETCH_LIMIT)
		),
		settle<StewardEdgeRow>('query.steward.edges', () =>
			supabase
				.from('onto_edges')
				.select('rel, src_kind, src_id, dst_kind, dst_id')
				.eq('project_id', projectId)
				.in('rel', [...STEWARD_PARENT_FIRST_RELS, ...STEWARD_CHILD_FIRST_RELS])
				.limit(2000)
		),
		settle<StewardLogRow>(
			'query.steward.logs',
			() =>
				supabase
					.from('onto_project_logs')
					.select(
						'created_at, change_source, chat_session_id, external_agent_caller_id, entity_type, after_title:after_data->>title, after_name:after_data->>name, event:after_data->>event'
					)
					.eq('project_id', projectId)
					.gte('created_at', sinceIso)
					.order('created_at', { ascending: false })
					.limit(LOG_FETCH_LIMIT) as unknown as PromiseLike<{
					data: StewardLogRow[] | null;
					error: unknown;
				}>
		),
		settle<StewardEventRow>('query.steward.events', () =>
			supabase
				.from('onto_events')
				.select('id, title, start_at')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.gte('start_at', nowIso)
				.lte('start_at', untilIso)
				.order('start_at', { ascending: true })
				.limit(UPCOMING_LIMIT)
		),
		settle<StewardDocumentRow>('query.steward.documents', () =>
			supabase
				.from('onto_documents')
				.select('id, updated_at')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.is('archived_at', null)
				.limit(DOCUMENT_FETCH_LIMIT)
		),
		state.charter_document_id
			? settle<{ content: string | null; updated_at: string | null }>(
					'query.steward.charter_document',
					() =>
						supabase
							.from('onto_documents')
							.select('content, updated_at')
							.eq('id', state.charter_document_id as string)
							.eq('project_id', projectId)
							.is('deleted_at', null)
							.is('archived_at', null)
							.limit(1)
				)
			: Promise.resolve([] as Array<{ content: string | null; updated_at: string | null }>)
	]);

	if (!flagEnabled) return null;

	const callerIds = [
		...new Set(logs.map((log) => log.external_agent_caller_id).filter(Boolean))
	] as string[];
	const callers = callerIds.length
		? await settle<StewardCallerRow>('query.steward.callers', () =>
				supabase
					.from('external_agent_callers')
					.select('id, provider, metadata')
					.in('id', callerIds)
			)
		: [];

	const charterDocument = charterDoc[0] ?? null;
	let pendingEditsAt: string | null = null;
	if (charterDocument && typeof charterDocument.content === 'string') {
		const documentSha = await hashStewardCharterText(charterDocument.content);
		if (documentSha !== state.approved_sha256) {
			pendingEditsAt = charterDocument.updated_at ?? nowIso;
		}
	}

	return {
		version: 1,
		computed_at: nowIso,
		charter: {
			text: charterText,
			approved_at: state.approved_at,
			document_id: state.charter_document_id,
			pending_edits_at: pendingEditsAt
		},
		facts: buildStewardLiveFacts(
			{
				goals,
				milestones,
				plans,
				tasks,
				edges,
				logs,
				callers,
				events,
				documents,
				// The charter lookup only feeds the pending-edits note.
				unavailable: unavailable.filter((kind) => kind !== 'charter_document')
			},
			nowIso
		)
	};
}

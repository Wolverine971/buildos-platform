// apps/worker/src/workers/brief/ontologyBriefDataLoader.ts
/**
 * Ontology Brief Data Loader
 * Fetches data from ontology tables using graph loader pattern for daily brief generation.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { addDays, subDays, subHours, parseISO, differenceInDays } from 'date-fns';

// ============================================================================
// ENTITY CAPS (from PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
// ============================================================================

export const ENTITY_CAPS = {
	GOALS: 5,
	RISKS: 5,
	REQUIREMENTS: 5,
	DOCUMENTS: 5,
	MILESTONES: 5,
	PLANS: 5,
	TASKS_RECENT: 10,
	TASKS_UPCOMING: 5
} as const;
import type {
	OntoProject,
	OntoTask,
	OntoGoal,
	OntoPlan,
	OntoMilestone,
	OntoRisk,
	OntoDocument,
	OntoRequirement,
	OntoEdge,
	OntoActor,
	OntoProjectWithRelations,
	CategorizedTasks,
	GoalProgress,
	MilestoneStatus,
	UnblockingTask,
	RecentUpdates,
	PlanProgress,
	OntologyBriefData,
	ProjectBriefData,
	OntologyBriefMetadata,
	ProjectActivityEntry
} from './ontologyBriefTypes.js';

// ============================================================================
// TIMEZONE UTILITIES
// ============================================================================

/**
 * Calculate a date string N days from a given date, respecting the user's timezone.
 * Uses noon to avoid DST edge cases where midnight might not exist or be ambiguous.
 *
 * @param dateStr - The starting date as yyyy-MM-dd in user's local timezone
 * @param days - Number of days to add (can be negative)
 * @param timezone - The user's timezone (e.g., 'America/Los_Angeles')
 * @returns The resulting date as yyyy-MM-dd in user's local timezone
 */
function addDaysToLocalDate(dateStr: string, days: number, timezone: string): string {
	// Convert the user's local date at noon to a UTC Date object
	// Using noon avoids DST edge cases where midnight might not exist
	const localDateAtNoon = zonedTimeToUtc(`${dateStr} 12:00:00`, timezone);
	// Add the specified number of days
	const resultDate = addDays(localDateAtNoon, days);
	// Format back to yyyy-MM-dd in user's timezone
	return formatInTimeZone(resultDate, timezone, 'yyyy-MM-dd');
}

/**
 * Get "now" as a yyyy-MM-dd string in the user's timezone.
 *
 * @param timezone - The user's timezone
 * @returns Today's date as yyyy-MM-dd in user's timezone
 */
function getTodayInTimezone(timezone: string): string {
	return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

// ============================================================================
// TASK CATEGORIZATION UTILITIES
// ============================================================================

/**
 * Categorize tasks by time, status, and work mode
 * Uses 7-day windows per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
 */
export function categorizeTasks(
	tasks: OntoTask[],
	briefDate: string,
	timezone: string
): CategorizedTasks {
	const now = new Date();
	const cutoff24h = subHours(now, 24); // For recently completed
	const cutoff7d = subDays(now, 7); // For recently updated (per spec)
	const todayStr = briefDate; // yyyy-MM-dd (user-local date)
	// Calculate week end date (7 days from today) in user's timezone
	const weekEndStr = addDaysToLocalDate(todayStr, 7, timezone);

	// Time-based categorization
	const todaysTasks: OntoTask[] = [];
	const overdueTasks: OntoTask[] = [];
	const upcomingTasks: OntoTask[] = [];
	const recentlyCompleted: OntoTask[] = [];

	// Status-based
	const blockedTasks: OntoTask[] = [];
	const inProgressTasks: OntoTask[] = [];

	// Work mode categories
	const executeTasks: OntoTask[] = [];
	const createTasks: OntoTask[] = [];
	const refineTasks: OntoTask[] = [];
	const researchTasks: OntoTask[] = [];
	const reviewTasks: OntoTask[] = [];
	const coordinateTasks: OntoTask[] = [];
	const adminTasks: OntoTask[] = [];
	const planTasks: OntoTask[] = [];

	// Relationship-based (populated later via edges)
	const unblockingTasks: OntoTask[] = [];
	const goalAlignedTasks: OntoTask[] = [];
	const recentlyUpdated: OntoTask[] = [];

	const taskSort = (a: OntoTask, b: OntoTask): number => {
		const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
		const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
		if (priorityA !== priorityB) return priorityA - priorityB;

		const dueA = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
		const dueB = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
		if (dueA !== dueB) return dueA - dueB;

		return a.title.localeCompare(b.title);
	};

	for (const task of tasks) {
		const dueAt = task.due_at ? parseISO(task.due_at) : null;
		const dueDateStr = dueAt ? formatInTimeZone(dueAt, timezone, 'yyyy-MM-dd') : null;
		const startAt = task.start_at ? parseISO(task.start_at) : null;
		const startDateStr = startAt ? formatInTimeZone(startAt, timezone, 'yyyy-MM-dd') : null;
		const updatedAt = parseISO(task.updated_at);
		const state = task.state_key;

		// Recently updated (last 7 days, per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (updatedAt >= cutoff7d && state !== 'done' && state !== 'blocked') {
			recentlyUpdated.push(task);
		}

		// Time-based
		if (state === 'done') {
			// Recently completed uses 24h window
			if (updatedAt >= cutoff24h) {
				recentlyCompleted.push(task);
			}
		} else if (dueDateStr || startDateStr) {
			// Check overdue first (only for tasks with due dates)
			if (dueDateStr && dueDateStr < todayStr) {
				overdueTasks.push(task);
			} else if (dueDateStr === todayStr) {
				todaysTasks.push(task);
			} else {
				// Upcoming: due_at in next 7 days OR start_at in next 7 days (per spec)
				const isDueUpcoming =
					dueDateStr && dueDateStr > todayStr && dueDateStr <= weekEndStr;
				const isStartUpcoming =
					startDateStr && startDateStr >= todayStr && startDateStr <= weekEndStr;
				if (isDueUpcoming || isStartUpcoming) {
					if (state !== 'blocked') {
						upcomingTasks.push(task);
					}
				}
			}
		}

		// Status-based
		if (state === 'blocked') {
			blockedTasks.push(task);
		} else if (state === 'in_progress') {
			inProgressTasks.push(task);
		}

		if (state === 'done') {
			continue;
		}

		// Work mode categorization (based on type_key)
		const typeKey = task.type_key || '';
		if (typeKey.startsWith('task.execute') || typeKey.includes('action')) {
			executeTasks.push(task);
		} else if (typeKey.startsWith('task.create') || typeKey.includes('produce')) {
			createTasks.push(task);
		} else if (
			typeKey.startsWith('task.refine') ||
			typeKey.includes('edit') ||
			typeKey.includes('improve')
		) {
			refineTasks.push(task);
		} else if (
			typeKey.startsWith('task.research') ||
			typeKey.includes('learn') ||
			typeKey.includes('discover')
		) {
			researchTasks.push(task);
		} else if (
			typeKey.startsWith('task.review') ||
			typeKey.includes('feedback') ||
			typeKey.includes('assess')
		) {
			reviewTasks.push(task);
		} else if (
			typeKey.startsWith('task.coordinate') ||
			typeKey.includes('discuss') ||
			typeKey.includes('meeting')
		) {
			coordinateTasks.push(task);
		} else if (
			typeKey.startsWith('task.admin') ||
			typeKey.includes('setup') ||
			typeKey.includes('config')
		) {
			adminTasks.push(task);
		} else if (
			typeKey.startsWith('task.plan') ||
			typeKey.includes('strategy') ||
			typeKey.includes('define')
		) {
			planTasks.push(task);
		}
	}

	// Sort for "Recent Updates" per spec: updated_at desc
	const recentUpdatedSort = (a: OntoTask, b: OntoTask): number => {
		return parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime();
	};

	// Sort for "Upcoming" per spec: earliest due_at/start_at, then updated_at desc
	const upcomingSort = (a: OntoTask, b: OntoTask): number => {
		// Get earliest date (due or start) for each task
		const aEarliest = Math.min(
			a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY,
			a.start_at ? parseISO(a.start_at).getTime() : Number.POSITIVE_INFINITY
		);
		const bEarliest = Math.min(
			b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY,
			b.start_at ? parseISO(b.start_at).getTime() : Number.POSITIVE_INFINITY
		);
		if (aEarliest !== bEarliest) return aEarliest - bEarliest;
		// Tie-breaker: updated_at desc
		return parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime();
	};

	return {
		todaysTasks: todaysTasks.sort(taskSort),
		overdueTasks: overdueTasks.sort(taskSort),
		upcomingTasks: upcomingTasks.sort(upcomingSort),
		recentlyCompleted: recentlyCompleted.sort(taskSort),
		blockedTasks: blockedTasks.sort(taskSort),
		inProgressTasks: inProgressTasks.sort(taskSort),
		executeTasks: executeTasks.sort(taskSort),
		createTasks: createTasks.sort(taskSort),
		refineTasks: refineTasks.sort(taskSort),
		researchTasks: researchTasks.sort(taskSort),
		reviewTasks: reviewTasks.sort(taskSort),
		coordinateTasks: coordinateTasks.sort(taskSort),
		adminTasks: adminTasks.sort(taskSort),
		planTasks: planTasks.sort(taskSort),
		unblockingTasks, // Will be populated later
		goalAlignedTasks, // Will be populated later
		recentlyUpdated: recentlyUpdated.sort(recentUpdatedSort)
	};
}

/**
 * Get work mode from task type_key
 */
export function getWorkMode(typeKey: string | null): string | null {
	if (!typeKey) return null;
	const key = typeKey.toLowerCase();
	if (key.startsWith('task.execute') || key.includes('action')) return 'execute';
	if (key.startsWith('task.create') || key.includes('produce')) return 'create';
	if (key.startsWith('task.refine') || key.includes('edit') || key.includes('improve'))
		return 'refine';
	if (key.startsWith('task.research') || key.includes('learn') || key.includes('discover'))
		return 'research';
	if (key.startsWith('task.review') || key.includes('feedback') || key.includes('assess'))
		return 'review';
	if (key.startsWith('task.coordinate') || key.includes('discuss') || key.includes('meeting'))
		return 'coordinate';
	if (key.startsWith('task.admin') || key.includes('setup') || key.includes('config'))
		return 'admin';
	if (key.startsWith('task.plan') || key.includes('strategy') || key.includes('define'))
		return 'plan';
	return null;
}

// ============================================================================
// GOAL PROGRESS UTILITIES
// ============================================================================

function getGoalTargetStatus(
	goal: OntoGoal,
	todayStr: string,
	timezone: string
): {
	targetDate: string | null;
	targetDaysAway: number | null;
	status: 'on_track' | 'at_risk' | 'behind';
} {
	if (!goal.target_date) {
		return { targetDate: null, targetDaysAway: null, status: 'on_track' };
	}

	const targetDate = formatInTimeZone(parseISO(goal.target_date), timezone, 'yyyy-MM-dd');
	const today = parseISO(`${todayStr}T12:00:00`);
	const targetDay = parseISO(`${targetDate}T12:00:00`);
	const targetDaysAway = differenceInDays(targetDay, today);

	let status: 'on_track' | 'at_risk' | 'behind';
	if (targetDaysAway < 0) {
		status = 'behind';
	} else if (targetDaysAway <= 7) {
		status = 'at_risk';
	} else {
		status = 'on_track';
	}

	return { targetDate, targetDaysAway, status };
}

/**
 * Calculate goal progress from supporting tasks via edges
 */
export function calculateGoalProgress(
	goal: OntoGoal,
	edges: OntoEdge[],
	allTasks: OntoTask[],
	todayStr: string,
	timezone: string
): GoalProgress {
	// Find tasks that support this goal (task -[supports_goal]-> goal)
	const supportingEdges = edges.filter(
		(e) => e.dst_id === goal.id && e.rel === 'supports_goal' && e.src_kind === 'task'
	);

	const contributingTaskIds = new Set(supportingEdges.map((e) => e.src_id));
	const contributingTasks = allTasks.filter((t) => contributingTaskIds.has(t.id));

	const totalTasks = contributingTasks.length;
	const completedTasks = contributingTasks.filter((t) => t.state_key === 'done').length;
	const { targetDate, targetDaysAway, status } = getGoalTargetStatus(goal, todayStr, timezone);

	return {
		goal,
		totalTasks,
		completedTasks,
		targetDate,
		targetDaysAway,
		status,
		contributingTasks
	};
}

/**
 * Get milestone status with risk assessment.
 *
 * Note: This function calculates days away using calendar dates in the user's timezone,
 * not absolute time differences. A milestone due "tomorrow" in the user's timezone
 * will show as 1 day away regardless of the exact hour.
 *
 * @param milestone - The milestone to check
 * @param project - The parent project
 * @param todayStr - Today's date as yyyy-MM-dd in user's timezone
 * @param timezone - The user's timezone
 */
export function getMilestoneStatus(
	milestone: OntoMilestone,
	project: OntoProject,
	todayStr: string,
	timezone: string
): MilestoneStatus {
	// Handle milestones without due dates
	if (!milestone.due_at) {
		return {
			milestone,
			daysAway: Infinity,
			isAtRisk: false,
			projectName: project.name
		};
	}

	// Format the milestone due date in user's timezone
	const dueDateStr = formatInTimeZone(parseISO(milestone.due_at), timezone, 'yyyy-MM-dd');

	// Calculate days away using date strings to avoid timezone confusion
	// This gives calendar day difference, not 24-hour periods
	const today = parseISO(`${todayStr}T12:00:00`);
	const dueDay = parseISO(`${dueDateStr}T12:00:00`);
	const daysAway = differenceInDays(dueDay, today);

	const isAtRisk = daysAway <= 7 && milestone.state_key !== 'completed';

	return {
		milestone,
		daysAway,
		isAtRisk,
		projectName: project.name
	};
}

/**
 * Calculate plan progress from tasks
 */
export function calculatePlanProgress(
	plan: OntoPlan,
	edges: OntoEdge[],
	allTasks: OntoTask[]
): PlanProgress {
	// Find tasks belonging to this plan (plan -[has_task]-> task)
	const planTaskEdges = edges.filter(
		(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
	);

	const planTaskIds = new Set(planTaskEdges.map((e) => e.dst_id));
	const planTasks = allTasks.filter((t) => planTaskIds.has(t.id));

	const totalTasks = planTasks.length;
	const completedTasks = planTasks.filter((t) => t.state_key === 'done').length;
	const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	return {
		plan,
		totalTasks,
		completedTasks,
		progressPercent
	};
}

/**
 * Find unblocking tasks (tasks that, when completed, unblock others)
 */
export function findUnblockingTasks(tasks: OntoTask[], edges: OntoEdge[]): UnblockingTask[] {
	const unblockingTasks: UnblockingTask[] = [];
	const taskMap = new Map(tasks.map((t) => [t.id, t]));

	// Find all dependency edges (task -[depends_on]-> task)
	const dependencyEdges = edges.filter(
		(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
	);

	// Group by target (the task being depended on)
	const blockedByMap = new Map<string, string[]>();
	for (const edge of dependencyEdges) {
		const blockerTaskId = edge.dst_id;
		const blockedTaskId = edge.src_id;
		if (!blockedByMap.has(blockerTaskId)) {
			blockedByMap.set(blockerTaskId, []);
		}
		blockedByMap.get(blockerTaskId)!.push(blockedTaskId);
	}

	// Find incomplete tasks that block other tasks
	for (const [blockerTaskId, blockedTaskIds] of blockedByMap.entries()) {
		const blockerTask = taskMap.get(blockerTaskId);
		if (blockerTask && blockerTask.state_key !== 'done') {
			const blockedTasks = blockedTaskIds
				.map((id) => taskMap.get(id))
				.filter((t): t is OntoTask => t !== undefined);

			if (blockedTasks.length > 0) {
				unblockingTasks.push({
					task: blockerTask,
					blockedTasks
				});
			}
		}
	}

	// Sort by number of blocked tasks (most impact first)
	return unblockingTasks.sort((a, b) => b.blockedTasks.length - a.blockedTasks.length);
}

// ============================================================================
// RECENT UPDATES
// ============================================================================

/**
 * Get recent updates across all entity types
 */
export function getRecentUpdates(
	data: OntoProjectWithRelations,
	hoursAgo: number = 24
): RecentUpdates {
	const cutoff = subHours(new Date(), hoursAgo);
	const recentTasks = data.tasks.filter((t) => parseISO(t.updated_at) >= cutoff);
	const recentTaskIds = new Set(recentTasks.map((t) => t.id));

	return {
		tasks: recentTasks,
		// Goals do not have updated_at; treat as "recent activity" if created recently OR any supporting task was updated recently.
		goals: data.goals.filter((g) => {
			if (parseISO(g.created_at) >= cutoff) return true;
			return data.edges.some(
				(e) =>
					e.rel === 'supports_goal' &&
					e.src_kind === 'task' &&
					e.dst_kind === 'goal' &&
					e.dst_id === g.id &&
					recentTaskIds.has(e.src_id)
			);
		}),
		documents: data.documents.filter((d) => parseISO(d.updated_at) >= cutoff)
	};
}

// ============================================================================
// ACTIVITY LOG UTILITIES
// ============================================================================

const ACTIVITY_WINDOW_HOURS = 24;
const ACTIVITY_LOG_LIMIT = 200;
const ACTIVITY_PER_PROJECT_LIMIT = 8;

function resolveActivityEntityLabel(log: {
	before_data: unknown;
	after_data: unknown;
}): string | null {
	const data = (
		typeof log.after_data === 'object' && log.after_data !== null
			? log.after_data
			: typeof log.before_data === 'object' && log.before_data !== null
				? log.before_data
				: null
	) as Record<string, unknown> | null;

	if (!data) return null;

	const label =
		(typeof data.title === 'string' && data.title.trim()) ||
		(typeof data.name === 'string' && data.name.trim()) ||
		(typeof data.text === 'string' && data.text.trim()) ||
		(typeof data.description === 'string' && data.description.trim())
			? data.title || data.name || data.text || data.description
			: null;

	if (typeof label !== 'string') return null;

	const trimmed = label.trim();
	if (!trimmed) return null;
	if (trimmed.length > 120) {
		return `${trimmed.slice(0, 117)}...`;
	}
	return trimmed;
}

function resolveActorDisplayName(
	actor: { name: string | null; email: string | null } | null,
	fallback: string
): string {
	if (actor?.name && actor.name.trim()) return actor.name.trim();
	if (actor?.email && actor.email.trim()) return actor.email.trim();
	return fallback;
}

// ============================================================================
// MAIN DATA LOADER CLASS
// ============================================================================

export class OntologyBriefDataLoader {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Load all ontology data for a user for brief generation
	 */
	async loadUserOntologyData(
		userId: string,
		actorId: string,
		briefDate: Date,
		timezone: string
	): Promise<OntoProjectWithRelations[]> {
		console.log('[OntologyBriefDataLoader] Loading data for user:', userId, 'actor:', actorId);

		// Fetch all active projects the actor can access (owned + shared)
		const { data: memberRows, error: memberError } = await this.supabase
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actorId)
			.is('removed_at', null);

		if (memberError) {
			console.error(
				'[OntologyBriefDataLoader] Error loading project memberships:',
				memberError
			);
			throw new Error(`Failed to load project memberships: ${memberError.message}`);
		}

		const memberProjectIds = (memberRows || [])
			.map((row) => row.project_id)
			.filter((id): id is string => Boolean(id));

		if (memberProjectIds.length === 0) {
			console.log('[OntologyBriefDataLoader] No active projects found');
			return [];
		}

		const { data: projectsData, error: projectsError } = await this.supabase
			.from('onto_projects')
			.select(
				'id, name, state_key, type_key, description, next_step_short, next_step_long, updated_at, created_by'
			)
			.in('id', memberProjectIds)
			.in('state_key', ['planning', 'active'])
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		if (projectsError) {
			console.error('[OntologyBriefDataLoader] Error loading projects:', projectsError);
			throw new Error(`Failed to load projects: ${projectsError.message}`);
		}

		const projects = (projectsData || []) as OntoProject[];

		if (projects.length === 0) {
			console.log('[OntologyBriefDataLoader] No active projects found');
			return [];
		}

		const projectIds = projects.map((p) => p.id);
		const projectsById = new Map(projects.map((project) => [project.id, project]));

		// Load recent project activity logs (last 24h)
		const activityCutoff = subHours(new Date(), ACTIVITY_WINDOW_HOURS).toISOString();
		const { data: activityLogs, error: activityError } = await this.supabase
			.from('onto_project_logs')
			.select(
				'id, project_id, entity_type, entity_id, action, before_data, after_data, created_at, changed_by_actor_id, changed_by'
			)
			.in('project_id', projectIds)
			.gte('created_at', activityCutoff)
			.order('created_at', { ascending: false })
			.limit(ACTIVITY_LOG_LIMIT);

		if (activityError) {
			console.warn(
				'[OntologyBriefDataLoader] Error loading project activity logs:',
				activityError
			);
		}

		const activityLogRows = (activityLogs || []) as Array<{
			project_id: string;
			entity_type: string;
			entity_id: string;
			action: string;
			before_data: unknown;
			after_data: unknown;
			created_at: string;
			changed_by_actor_id: string | null;
			changed_by: string;
		}>;

		const actorIds = Array.from(
			new Set(
				activityLogRows
					.map((log) => log.changed_by_actor_id)
					.filter((id): id is string => Boolean(id))
			)
		);

		const actorsById = new Map<
			string,
			{ name: string | null; email: string | null; user_id: string | null }
		>();

		if (actorIds.length > 0) {
			const { data: actors, error: actorError } = await this.supabase
				.from('onto_actors')
				.select('id, name, email, user_id')
				.in('id', actorIds);

			if (actorError) {
				console.warn(
					'[OntologyBriefDataLoader] Error loading activity actors:',
					actorError
				);
			} else {
				for (const actor of actors || []) {
					actorsById.set(actor.id, {
						name: actor.name,
						email: actor.email,
						user_id: actor.user_id
					});
				}
			}
		}

		const userIdsForActors = Array.from(
			new Set(
				activityLogRows
					.filter((log) => !log.changed_by_actor_id && log.changed_by)
					.map((log) => log.changed_by)
			)
		);

		if (userIdsForActors.length > 0) {
			const { data: actorByUser, error: actorByUserError } = await this.supabase
				.from('onto_actors')
				.select('id, name, email, user_id')
				.in('user_id', userIdsForActors);

			if (actorByUserError) {
				console.warn(
					'[OntologyBriefDataLoader] Error loading activity actors by user:',
					actorByUserError
				);
			} else {
				for (const actor of actorByUser || []) {
					if (actor.user_id && !actorsById.has(actor.id)) {
						actorsById.set(actor.id, {
							name: actor.name,
							email: actor.email,
							user_id: actor.user_id
						});
					}
				}
			}
		}

		const actorByUserId = new Map<string, { name: string | null; email: string | null }>();
		for (const actor of actorsById.values()) {
			if (actor.user_id) {
				actorByUserId.set(actor.user_id, {
					name: actor.name,
					email: actor.email
				});
			}
		}

		const activityByProject = new Map<string, ProjectActivityEntry[]>();
		for (const log of activityLogRows) {
			const project = projectsById.get(log.project_id);
			if (!project) continue;

			const actor =
				(log.changed_by_actor_id && actorsById.get(log.changed_by_actor_id)) ||
				actorByUserId.get(log.changed_by) ||
				null;

			const entry: ProjectActivityEntry = {
				projectId: log.project_id,
				projectName: project.name || 'Untitled Project',
				isShared: project.created_by ? project.created_by !== actorId : false,
				actorId: log.changed_by_actor_id,
				actorName: resolveActorDisplayName(actor, 'Someone'),
				action: log.action,
				entityType: log.entity_type,
				entityId: log.entity_id,
				entityLabel: resolveActivityEntityLabel(log),
				createdAt: log.created_at
			};

			const list = activityByProject.get(log.project_id) ?? [];
			if (list.length >= ACTIVITY_PER_PROJECT_LIMIT) continue;
			list.push(entry);
			activityByProject.set(log.project_id, list);
		}

		// Load all entities in parallel with timing
		const queryStartTime = Date.now();
		const [
			tasksResult,
			goalsResult,
			plansResult,
			milestonesResult,
			risksResult,
			documentsResult,
			requirementsResult,
			edgesResult
		] = await Promise.all([
			this.supabase
				.from('onto_tasks')
				.select(
					'id, title, project_id, state_key, type_key, priority, due_at, start_at, updated_at, created_at'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_goals')
				.select('id, name, project_id, state_key, created_at, target_date')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_plans')
				.select('id, project_id, name, state_key, type_key')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_milestones')
				.select('id, project_id, title, due_at, state_key, created_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_risks')
				.select('id, project_id, title, impact, state_key, created_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_documents')
				.select('id, project_id, updated_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_requirements')
				.select('id, project_id, text, created_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_edges')
				.select('id, project_id, src_id, dst_id, src_kind, dst_kind, rel')
				.in('project_id', projectIds)
		]);
		const queryDuration = Date.now() - queryStartTime;
		console.log(
			`[OntologyBriefDataLoader] Loaded ontology data in ${queryDuration}ms for ${projectIds.length} projects`
		);

		// Check for errors
		const errors = [
			{ name: 'tasks', error: tasksResult.error },
			{ name: 'goals', error: goalsResult.error },
			{ name: 'plans', error: plansResult.error },
			{ name: 'milestones', error: milestonesResult.error },
			{ name: 'risks', error: risksResult.error },
			{ name: 'documents', error: documentsResult.error },
			{ name: 'requirements', error: requirementsResult.error },
			{ name: 'edges', error: edgesResult.error }
		].filter((e) => e.error);

		if (errors.length > 0) {
			console.error('[OntologyBriefDataLoader] Errors loading entities:', errors);
		}

		const tasks = (tasksResult.data || []) as OntoTask[];
		const goals = (goalsResult.data || []) as OntoGoal[];
		const plans = (plansResult.data || []) as OntoPlan[];
		const milestones = (milestonesResult.data || []) as OntoMilestone[];
		const risks = (risksResult.data || []) as OntoRisk[];
		const documents = (documentsResult.data || []) as OntoDocument[];
		const requirements = (requirementsResult.data || []) as OntoRequirement[];
		const edges = (edgesResult.data || []) as OntoEdge[];

		console.log('[OntologyBriefDataLoader] Loaded entities:', {
			projects: projects.length,
			tasks: tasks.length,
			goals: goals.length,
			plans: plans.length,
			milestones: milestones.length,
			risks: risks.length,
			documents: documents.length,
			requirements: requirements.length,
			edges: edges.length
		});

		const briefDateStr = formatInTimeZone(briefDate, timezone, 'yyyy-MM-dd');

		// Build project-specific data structures
		return projects.map((project) => {
			const projectTasks = tasks.filter((t) => t.project_id === project.id);
			const projectGoals = goals.filter((g) => g.project_id === project.id);
			const projectPlans = plans.filter((p) => p.project_id === project.id);
			const projectMilestones = milestones.filter((m) => m.project_id === project.id);
			const projectRisks = risks.filter((r) => r.project_id === project.id);
			const projectDocuments = documents.filter((d) => d.project_id === project.id);
			const projectRequirements = requirements.filter((r) => r.project_id === project.id);
			const projectEdges = edges.filter((e) => e.project_id === project.id);

			// Build computed relationships
			const tasksByPlan = this.buildTasksByPlan(projectPlans, projectEdges, projectTasks);
			const taskDependencies = this.buildTaskDependencies(projectEdges);
			const goalProgress = this.buildGoalProgressMap(
				projectGoals,
				projectEdges,
				projectTasks,
				briefDateStr,
				timezone
			);
			const isShared = project.created_by ? project.created_by !== actorId : false;
			const projectActivityLogs = activityByProject.get(project.id) ?? [];
			const recentUpdates = getRecentUpdates({
				project,
				isShared,
				activityLogs: projectActivityLogs,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				requirements: projectRequirements,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates: { tasks: [], goals: [], documents: [] }
			});

			return {
				project,
				isShared,
				activityLogs: projectActivityLogs,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				requirements: projectRequirements,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates
			};
		});
	}

	/**
	 * Get actor ID for a user
	 */
	async getActorIdForUser(userId: string): Promise<string | null> {
		const { data: actor, error } = await this.supabase
			.from('onto_actors')
			.select('id')
			.eq('user_id', userId)
			.eq('kind', 'human')
			.single();

		if (error || !actor) {
			console.warn('[OntologyBriefDataLoader] No actor found for user:', userId);
			return null;
		}

		return actor.id;
	}

	/**
	 * Build tasks by plan map
	 */
	private buildTasksByPlan(
		plans: OntoPlan[],
		edges: OntoEdge[],
		tasks: OntoTask[]
	): Map<string, OntoTask[]> {
		const taskMap = new Map(tasks.map((t) => [t.id, t]));
		const tasksByPlan = new Map<string, OntoTask[]>();

		for (const plan of plans) {
			const planTaskEdges = edges.filter(
				(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
			);
			const planTasks = planTaskEdges
				.map((e) => taskMap.get(e.dst_id))
				.filter((t): t is OntoTask => t !== undefined);
			tasksByPlan.set(plan.id, planTasks);
		}

		return tasksByPlan;
	}

	/**
	 * Build task dependencies map
	 */
	private buildTaskDependencies(edges: OntoEdge[]): Map<string, string[]> {
		const dependencies = new Map<string, string[]>();

		const dependencyEdges = edges.filter(
			(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
		);

		for (const edge of dependencyEdges) {
			if (!dependencies.has(edge.src_id)) {
				dependencies.set(edge.src_id, []);
			}
			dependencies.get(edge.src_id)!.push(edge.dst_id);
		}

		return dependencies;
	}

	/**
	 * Build goal progress map
	 */
	private buildGoalProgressMap(
		goals: OntoGoal[],
		edges: OntoEdge[],
		tasks: OntoTask[],
		todayStr: string,
		timezone: string
	): Map<string, GoalProgress> {
		const progressMap = new Map<string, GoalProgress>();

		for (const goal of goals) {
			progressMap.set(goal.id, calculateGoalProgress(goal, edges, tasks, todayStr, timezone));
		}

		return progressMap;
	}

	/**
	 * Prepare brief data for LLM analysis
	 */
	prepareBriefData(
		projectsData: OntoProjectWithRelations[],
		briefDate: string,
		timezone: string
	): OntologyBriefData {
		// Aggregate data across all projects
		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allRequirements = projectsData.flatMap((p) => p.requirements);
		const allEdges = projectsData.flatMap((p) => p.edges);

		// Categorize all tasks
		const categorizedTasks = categorizeTasks(allTasks, briefDate, timezone);

		const groupTasksByProject = (tasks: OntoTask[]): Map<string, OntoTask[]> => {
			const grouped = new Map<string, OntoTask[]>();
			for (const task of tasks) {
				const list = grouped.get(task.project_id);
				if (list) {
					list.push(task);
				} else {
					grouped.set(task.project_id, [task]);
				}
			}
			return grouped;
		};

		const todaysTasksByProject = groupTasksByProject(categorizedTasks.todaysTasks);
		const upcomingTasksByProject = groupTasksByProject(categorizedTasks.upcomingTasks);
		const blockedTasksByProject = groupTasksByProject(categorizedTasks.blockedTasks);
		const recentlyUpdatedByProject = groupTasksByProject(categorizedTasks.recentlyUpdated);

		// Reuse precomputed goal progress from project data to avoid recomputation
		const goals: GoalProgress[] = [];
		for (const data of projectsData) {
			for (const goal of data.goals) {
				const progress = data.goalProgress.get(goal.id);
				if (progress) {
					goals.push(progress);
				}
			}
		}

		// Get active risks (not mitigated or closed), apply cap per spec
		const activeRisks = allRisks
			.filter((r) => r.state_key !== 'mitigated' && r.state_key !== 'closed')
			.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())
			.slice(0, ENTITY_CAPS.RISKS);

		// Count high priority tasks (P1/P2) that are due today or overdue
		const highPriorityCount = [
			...categorizedTasks.overdueTasks,
			...categorizedTasks.todaysTasks
		].filter((t) => t.priority !== null && t.priority <= 2 && t.state_key !== 'done').length;

		// Aggregate recent updates
		const allRecentUpdates: RecentUpdates = {
			tasks: projectsData.flatMap((p) => p.recentUpdates.tasks),
			goals: projectsData.flatMap((p) => p.recentUpdates.goals),
			documents: projectsData.flatMap((p) => p.recentUpdates.documents)
		};

		// Tasks by work mode
		const tasksByWorkMode: Record<string, OntoTask[]> = {
			execute: categorizedTasks.executeTasks,
			create: categorizedTasks.createTasks,
			refine: categorizedTasks.refineTasks,
			research: categorizedTasks.researchTasks,
			review: categorizedTasks.reviewTasks,
			coordinate: categorizedTasks.coordinateTasks,
			admin: categorizedTasks.adminTasks,
			plan: categorizedTasks.planTasks
		};

		// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
		// 1) Recent Updates: updated in last 7 days, order by updated_at desc, cap 10
		const recentlyUpdatedTasks = categorizedTasks.recentlyUpdated.slice(
			0,
			ENTITY_CAPS.TASKS_RECENT
		);
		const recentlyUpdatedIds = new Set(recentlyUpdatedTasks.map((t) => t.id));

		// 2) Upcoming: due/start in next 7 days, deduplicated from Recent, cap 5
		const upcomingTasks = categorizedTasks.upcomingTasks
			.filter((t) => !recentlyUpdatedIds.has(t.id))
			.slice(0, ENTITY_CAPS.TASKS_UPCOMING);

		// Apply entity caps to requirements per spec
		const cappedRequirements = allRequirements
			.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())
			.slice(0, ENTITY_CAPS.REQUIREMENTS);

		// Cap goals by status priority (at_risk/behind first, then on_track)
		const cappedGoals = goals
			.sort((a, b) => {
				const statusOrder = { behind: 0, at_risk: 1, on_track: 2 };
				const aOrder = statusOrder[a.status] ?? 3;
				const bOrder = statusOrder[b.status] ?? 3;
				if (aOrder !== bOrder) return aOrder - bOrder;
				// Tie-breaker: updated_at desc on the goal object
				return (
					parseISO(b.goal.created_at).getTime() - parseISO(a.goal.created_at).getTime()
				);
			})
			.slice(0, ENTITY_CAPS.GOALS);

		// Build project brief data
		const projects: ProjectBriefData[] = projectsData.map((data) => {
			const projectGoals = data.goals
				.map((g) => data.goalProgress.get(g.id))
				.filter((g): g is GoalProgress => g !== undefined);
			const unblockingTasks = findUnblockingTasks(data.tasks, data.edges);
			const projectRequirements = [...data.requirements].sort(
				(a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime()
			);

			// Get active plan
			const activePlan = data.plans.find((p) => p.state_key === 'active') || null;

			// Get next steps from project
			const nextSteps: string[] = [];
			if (data.project.next_step_short) {
				nextSteps.push(data.project.next_step_short);
			}
			if (data.project.next_step_long) {
				nextSteps.push(data.project.next_step_long);
			}

			// Get next milestone
			const nextMilestone = data.milestones
				.filter(
					(m) =>
						m.state_key !== 'completed' && m.state_key !== 'missed' && m.due_at !== null
				)
				.sort((a, b) => parseISO(a.due_at!).getTime() - parseISO(b.due_at!).getTime())[0];

			const projectTodaysTasks = todaysTasksByProject.get(data.project.id) ?? [];
			const projectUpcomingAll = upcomingTasksByProject.get(data.project.id) ?? [];
			const projectBlockedTasks = blockedTasksByProject.get(data.project.id) ?? [];
			const projectRecentlyUpdatedAll = recentlyUpdatedByProject.get(data.project.id) ?? [];

			// Project-level strategic task splits with deduplication
			const projectRecentlyUpdated = projectRecentlyUpdatedAll.slice(
				0,
				ENTITY_CAPS.TASKS_RECENT
			);
			const projectRecentIds = new Set(projectRecentlyUpdated.map((t) => t.id));
			const projectUpcoming = projectUpcomingAll
				.filter((t) => !projectRecentIds.has(t.id))
				.slice(0, ENTITY_CAPS.TASKS_UPCOMING);

			return {
				project: data.project,
				isShared: data.isShared,
				activityLogs: data.activityLogs,
				goals: projectGoals.slice(0, ENTITY_CAPS.GOALS),
				requirements: projectRequirements.slice(0, ENTITY_CAPS.REQUIREMENTS),
				nextSteps,
				nextMilestone: nextMilestone?.title || null,
				activePlan,
				todaysTasks: projectTodaysTasks,
				thisWeekTasks: [...projectTodaysTasks, ...projectUpcomingAll],
				blockedTasks: projectBlockedTasks,
				unblockingTasks: unblockingTasks.map((u) => u.task),
				recentlyUpdatedTasks: projectRecentlyUpdated,
				upcomingTasks: projectUpcoming
			};
		});

		return {
			briefDate,
			timezone,
			goals: cappedGoals,
			risks: activeRisks,
			requirements: cappedRequirements,
			todaysTasks: categorizedTasks.todaysTasks,
			blockedTasks: categorizedTasks.blockedTasks,
			overdueTasks: categorizedTasks.overdueTasks,
			highPriorityCount,
			recentUpdates: allRecentUpdates,
			tasksByWorkMode,
			projects,
			// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
			recentlyUpdatedTasks,
			upcomingTasks
		};
	}

	/**
	 * Calculate brief metadata
	 */
	calculateMetadata(
		projectsData: OntoProjectWithRelations[],
		briefData: OntologyBriefData,
		briefDate: string,
		timezone: string
	): OntologyBriefMetadata {
		// Calculate week end date (7 days from today) in user's timezone
		const weekEndStr = addDaysToLocalDate(briefDate, 7, timezone);

		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allGoals = projectsData.flatMap((p) => p.goals);
		const allMilestones = projectsData.flatMap((p) => p.milestones);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allEdges = projectsData.flatMap((p) => p.edges);
		const allGoalProgress = projectsData.flatMap((p) => Array.from(p.goalProgress.values()));

		// Count milestones this week
		const milestonesThisWeek = allMilestones.filter((m) => {
			if (m.state_key === 'completed' || m.state_key === 'missed' || !m.due_at) return false;
			const dueDateStr = formatInTimeZone(parseISO(m.due_at), timezone, 'yyyy-MM-dd');
			return dueDateStr >= briefDate && dueDateStr <= weekEndStr;
		}).length;

		// Count active risks and goals at risk (use full sets, not capped brief data)
		const activeRisksCount = allRisks.filter(
			(r) => r.state_key !== 'mitigated' && r.state_key !== 'closed'
		).length;
		const goalsAtRisk = allGoalProgress.filter(
			(g) => g.status === 'at_risk' || g.status === 'behind'
		).length;

		// Count dependency chains (simplified)
		const dependencyChains = projectsData.reduce(
			(count, p) => count + p.taskDependencies.size,
			0
		);

		// Count recent updates
		const recentUpdatesCount =
			briefData.recentUpdates.tasks.length +
			briefData.recentUpdates.goals.length +
			briefData.recentUpdates.documents.length;

		return {
			totalProjects: projectsData.length,
			totalTasks: allTasks.length,
			totalGoals: allGoals.length,
			totalMilestones: allMilestones.length,
			activeRisksCount,
			recentUpdatesCount,
			blockedCount: briefData.blockedTasks.length,
			overdueCount: briefData.overdueTasks.length,
			goalsAtRisk,
			milestonesThisWeek,
			totalEdges: allEdges.length,
			dependencyChains,
			generatedVia: 'ontology_v1',
			timezone
		};
	}
}

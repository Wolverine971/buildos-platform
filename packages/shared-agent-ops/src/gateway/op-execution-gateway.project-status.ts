// packages/shared-agent-ops/src/gateway/op-execution-gateway.project-status.ts
//
// Project status packet handler and serializers.
import { ensureActorId, type OntologyProjectSummary } from '../ontology/ontology-projects.service';
import {
	assertAccessibleProject,
	loadVisibleProjects,
	type VisibleProjectContext
} from './op-execution-gateway.access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import { loadProjectStartHereExcerpt } from '../ontology/start-here.service';
import { START_HERE_PROMPT_MAX_CHARS } from '../ontology/start-here';

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseDateMs(value: unknown): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function pluralizeCount(count: number, label: string): string {
	return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function extractProjectStatusTitle(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const candidate =
		record.title ?? record.name ?? record.summary ?? record.text ?? record.display_name;
	return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function buildProjectStatusCandidates(projects: OntologyProjectSummary[]) {
	return projects.slice(0, 8).map((project) => ({
		project_id: project.id,
		name: project.name,
		state_key: project.state_key,
		updated_at: project.updated_at
	}));
}

function isProjectStatusTaskComplete(row: Record<string, unknown>): boolean {
	if (typeof row.completed_at === 'string' && row.completed_at.trim()) return true;
	const stateKey = typeof row.state_key === 'string' ? row.state_key.trim().toLowerCase() : '';
	return ['done', 'completed', 'closed', 'archived', 'cancelled', 'canceled'].includes(stateKey);
}

function serializeProjectStatusTask(row: Record<string, unknown>) {
	return {
		id: typeof row.id === 'string' ? row.id : null,
		title: typeof row.title === 'string' ? row.title : null,
		state_key: typeof row.state_key === 'string' ? row.state_key : null,
		priority: typeof row.priority === 'number' ? row.priority : null,
		due_at: typeof row.due_at === 'string' ? row.due_at : null,
		updated_at: typeof row.updated_at === 'string' ? row.updated_at : null
	};
}

function serializeProjectStatusEvent(row: Record<string, unknown>) {
	return {
		id: typeof row.id === 'string' ? row.id : null,
		title: typeof row.title === 'string' ? row.title : null,
		start_at: typeof row.start_at === 'string' ? row.start_at : null,
		end_at: typeof row.end_at === 'string' ? row.end_at : null,
		state_key: typeof row.state_key === 'string' ? row.state_key : null,
		location: typeof row.location === 'string' ? row.location : null
	};
}

function serializeProjectStatusChange(row: Record<string, unknown>) {
	const afterData =
		row.after_data && typeof row.after_data === 'object' && !Array.isArray(row.after_data)
			? (row.after_data as Record<string, unknown>)
			: null;
	const beforeData =
		row.before_data && typeof row.before_data === 'object' && !Array.isArray(row.before_data)
			? (row.before_data as Record<string, unknown>)
			: null;
	return {
		entity_type: typeof row.entity_type === 'string' ? row.entity_type : null,
		entity_id: typeof row.entity_id === 'string' ? row.entity_id : null,
		action: typeof row.action === 'string' ? row.action : null,
		title: extractProjectStatusTitle(afterData) ?? extractProjectStatusTitle(beforeData),
		changed_at: typeof row.created_at === 'string' ? row.created_at : null,
		change_source: typeof row.change_source === 'string' ? row.change_source : null
	};
}

function extractProjectStatusActor(value: unknown): Record<string, unknown> | null {
	if (!value) return null;
	if (Array.isArray(value)) {
		const first = value[0];
		return first && typeof first === 'object' && !Array.isArray(first)
			? (first as Record<string, unknown>)
			: null;
	}
	return typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function serializeProjectStatusCollaborator(row: Record<string, unknown>, currentActorId: string) {
	const actor = extractProjectStatusActor(row.actor);
	const actorId = typeof row.actor_id === 'string' ? row.actor_id : null;
	const name = typeof actor?.name === 'string' && actor.name.trim() ? actor.name.trim() : null;
	const email =
		typeof actor?.email === 'string' && actor.email.trim() ? actor.email.trim() : null;
	const displayName = name ?? email ?? (actorId === currentActorId ? 'You' : 'Project member');

	return {
		id: typeof row.id === 'string' ? row.id : null,
		actor_id: actorId,
		display_name: displayName,
		email,
		role_key: typeof row.role_key === 'string' ? row.role_key : null,
		role_name:
			typeof row.role_name === 'string' && row.role_name.trim() ? row.role_name.trim() : null,
		role_description:
			typeof row.role_description === 'string' && row.role_description.trim()
				? row.role_description.trim()
				: null,
		access: typeof row.access === 'string' ? row.access : null,
		is_current_user: actorId === currentActorId,
		joined_at: typeof row.created_at === 'string' ? row.created_at : null
	};
}

function sortProjectStatusCollaborators(
	currentActorId: string,
	left: Record<string, unknown>,
	right: Record<string, unknown>
) {
	const leftActorId = typeof left.actor_id === 'string' ? left.actor_id : null;
	const rightActorId = typeof right.actor_id === 'string' ? right.actor_id : null;
	if (leftActorId === currentActorId && rightActorId !== currentActorId) return -1;
	if (rightActorId === currentActorId && leftActorId !== currentActorId) return 1;

	const roleOrder: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };
	const leftRole = typeof left.role_key === 'string' ? left.role_key : '';
	const rightRole = typeof right.role_key === 'string' ? right.role_key : '';
	const roleDelta = (roleOrder[leftRole] ?? 99) - (roleOrder[rightRole] ?? 99);
	if (roleDelta !== 0) return roleDelta;

	const leftName = serializeProjectStatusCollaborator(left, currentActorId).display_name;
	const rightName = serializeProjectStatusCollaborator(right, currentActorId).display_name;
	return leftName.localeCompare(rightName);
}

function compareByDate(field: string, ascending: boolean) {
	return (left: Record<string, unknown>, right: Record<string, unknown>) => {
		const leftMs = parseDateMs(left[field]) ?? (ascending ? Number.POSITIVE_INFINITY : 0);
		const rightMs = parseDateMs(right[field]) ?? (ascending ? Number.POSITIVE_INFINITY : 0);
		return ascending ? leftMs - rightMs : rightMs - leftMs;
	};
}

async function resolveProjectStatusTarget(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<{
	visible: VisibleProjectContext;
	project: OntologyProjectSummary;
	query: string | null;
}> {
	const visible = await loadVisibleProjects(context);
	const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
	if (projectId) {
		return {
			visible,
			project: assertAccessibleProject(visible.projectMap, projectId),
			query: null
		};
	}

	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (query) {
		const normalizedQuery = query.toLowerCase();
		const exactMatches = visible.projects.filter(
			(project) => project.name.trim().toLowerCase() === normalizedQuery
		);
		const matches =
			exactMatches.length > 0
				? exactMatches
				: visible.projects.filter((project) => {
						const haystack =
							`${project.name} ${project.description ?? ''}`.toLowerCase();
						return haystack.includes(normalizedQuery);
					});

		if (matches.length === 1) {
			return { visible, project: matches[0]!, query };
		}
		if (matches.length === 0) {
			throw new ExternalToolGatewayError(
				'NOT_FOUND',
				`No accessible project matched "${query}".`,
				{
					candidates: buildProjectStatusCandidates(visible.projects)
				}
			);
		}
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Multiple accessible projects matched "${query}". Pass project_id.`,
			{ candidates: buildProjectStatusCandidates(matches) }
		);
	}

	if (visible.projects.length === 1) {
		return { visible, project: visible.projects[0]!, query: null };
	}

	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'project_id is required when more than one project is visible',
		{ candidates: buildProjectStatusCandidates(visible.projects) }
	);
}

async function loadProjectStatusTasks(params: {
	context: ToolExecutionContext;
	projectId: string;
	now: Date;
	dueSoonDays: number;
	taskLimit: number;
}) {
	const horizonIso = addDays(params.now, params.dueSoonDays).toISOString();
	const { data, error } = await params.context.admin
		.from('onto_tasks')
		.select('id, project_id, title, state_key, priority, due_at, completed_at, updated_at')
		.eq('project_id', params.projectId)
		.is('deleted_at', null)
		.is('archived_at', null)
		.lte('due_at', horizonIso)
		.order('due_at', { ascending: true })
		.limit(params.taskLimit * 4);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project due tasks'
		);
	}

	const nowMs = params.now.getTime();
	const horizonMs = addDays(params.now, params.dueSoonDays).getTime();
	const activeDueTasks = ((data ?? []) as Array<Record<string, unknown>>)
		.filter((row) => !isProjectStatusTaskComplete(row))
		.filter((row) => {
			const dueMs = parseDateMs(row.due_at);
			return dueMs !== null && dueMs <= horizonMs;
		});

	return {
		overdue_tasks: activeDueTasks
			.filter((row) => {
				const dueMs = parseDateMs(row.due_at);
				return dueMs !== null && dueMs < nowMs;
			})
			.slice(0, params.taskLimit)
			.map(serializeProjectStatusTask),
		due_soon_tasks: activeDueTasks
			.filter((row) => {
				const dueMs = parseDateMs(row.due_at);
				return dueMs !== null && dueMs >= nowMs;
			})
			.slice(0, params.taskLimit)
			.map(serializeProjectStatusTask)
	};
}

async function loadProjectStatusEvents(params: {
	context: ToolExecutionContext;
	projectId: string;
	now: Date;
	upcomingDays: number;
	eventLimit: number;
}) {
	const nowIso = params.now.toISOString();
	const horizonIso = addDays(params.now, params.upcomingDays).toISOString();
	const { data, error } = await params.context.admin
		.from('onto_events')
		.select('id, project_id, title, state_key, start_at, end_at, location, updated_at')
		.eq('project_id', params.projectId)
		.is('deleted_at', null)
		.gte('start_at', nowIso)
		.lte('start_at', horizonIso)
		.order('start_at', { ascending: true })
		.limit(params.eventLimit);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project upcoming events'
		);
	}

	return ((data ?? []) as Array<Record<string, unknown>>)
		.sort(compareByDate('start_at', true))
		.slice(0, params.eventLimit)
		.map(serializeProjectStatusEvent);
}

async function loadProjectStatusRecentChanges(params: {
	context: ToolExecutionContext;
	projectId: string;
	recentLimit: number;
}) {
	const { data, error } = await params.context.admin
		.from('onto_project_logs')
		.select(
			'entity_type, entity_id, action, created_at, before_data, after_data, change_source'
		)
		.eq('project_id', params.projectId)
		.order('created_at', { ascending: false })
		.limit(params.recentLimit);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project recent changes'
		);
	}

	return ((data ?? []) as Array<Record<string, unknown>>)
		.sort(compareByDate('created_at', false))
		.slice(0, params.recentLimit)
		.map(serializeProjectStatusChange);
}

async function loadProjectStatusCollaborators(params: {
	context: ToolExecutionContext;
	projectId: string;
	collaboratorLimit: number;
}) {
	const currentActorId = await ensureActorId(params.context.admin, params.context.userId);
	const { data, error, count } = await params.context.admin
		.from('onto_project_members')
		.select(
			'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)',
			{ count: 'exact' }
		)
		.eq('project_id', params.projectId)
		.is('removed_at', null)
		.order('created_at', { ascending: true })
		.limit(params.collaboratorLimit + 1);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project collaborators'
		);
	}

	const rows = ((data ?? []) as Array<Record<string, unknown>>).sort((left, right) =>
		sortProjectStatusCollaborators(currentActorId, left, right)
	);
	const visibleRows = rows.slice(0, params.collaboratorLimit);
	const totalCount = typeof count === 'number' ? count : rows.length;

	return {
		count: totalCount,
		shown: visibleRows.length,
		truncated: totalCount > visibleRows.length,
		members: visibleRows.map((row) => serializeProjectStatusCollaborator(row, currentActorId))
	};
}

export async function getProjectStatus(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const { project, query } = await resolveProjectStatusTarget(context, args);
	const now = new Date();
	const recentLimit = clampInteger(args.recent_limit, 8, 1, 20);
	const taskLimit = clampInteger(args.task_limit, 8, 1, 20);
	const eventLimit = clampInteger(args.event_limit, 8, 1, 20);
	const collaboratorLimit = clampInteger(args.collaborator_limit, 20, 1, 50);
	const dueSoonDays = clampInteger(args.due_soon_days, 7, 1, 60);
	const upcomingDays = clampInteger(args.upcoming_days, 14, 1, 90);

	const [changes, taskStatus, upcomingEvents, collaborators, startHere] = await Promise.all([
		loadProjectStatusRecentChanges({
			context,
			projectId: project.id,
			recentLimit
		}),
		loadProjectStatusTasks({
			context,
			projectId: project.id,
			now,
			dueSoonDays,
			taskLimit
		}),
		loadProjectStatusEvents({
			context,
			projectId: project.id,
			now,
			upcomingDays,
			eventLimit
		}),
		loadProjectStatusCollaborators({
			context,
			projectId: project.id,
			collaboratorLimit
		}),
		// Compact Start Here excerpt so external agents are oriented on a status read.
		loadProjectStartHereExcerpt({
			supabase: context.admin,
			projectId: project.id,
			maxChars: START_HERE_PROMPT_MAX_CHARS
		})
	]);

	const counts = {
		tasks: project.task_count ?? 0,
		documents: project.document_count ?? 0,
		plans: project.plan_count ?? 0,
		goals: project.goal_count ?? 0,
		collaborators: collaborators.count
	};
	const countSummary = [
		pluralizeCount(counts.tasks, 'task'),
		pluralizeCount(counts.documents, 'document'),
		pluralizeCount(counts.plans, 'plan'),
		pluralizeCount(counts.goals, 'goal'),
		pluralizeCount(counts.collaborators, 'collaborator')
	].join(', ');

	return {
		generated_at: now.toISOString(),
		scope: 'project',
		project: {
			id: project.id,
			name: project.name,
			description: project.description,
			type_key: project.type_key,
			state_key: project.state_key,
			updated_at: project.updated_at,
			access_role: project.access_role,
			access_level: project.access_level
		},
		overview: {
			short_description: project.description ?? '',
			counts,
			count_summary: `${project.name} has ${countSummary}.`,
			next_step_short: project.next_step_short ?? null
		},
		start_here: startHere,
		collaborators,
		recent_changes: changes,
		upcoming: {
			overdue_tasks: taskStatus.overdue_tasks,
			due_soon_tasks: taskStatus.due_soon_tasks,
			upcoming_events: upcomingEvents,
			windows: {
				due_soon_days: dueSoonDays,
				upcoming_days: upcomingDays
			}
		},
		match: {
			status: 'resolved',
			project_id: project.id,
			query
		},
		message: `Project status prepared for ${project.name}.`
	};
}

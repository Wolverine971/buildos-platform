// packages/agentic-chat-runtime/src/tools/overview-reads.ts
//
// Shared overview/utility read tools (Phase 4 Slice 18 S3-T5). These are the
// get_field_info / get_workspace_overview / get_project_overview /
// change_chat_context implementations extracted from the legacy web
// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.ts
// as free functions over the shared read context, so web (RLS user client) and
// the worker (service-role client + explicit actor scoping via the access
// port) produce byte-identical payloads. The pure payload builders already
// live in ./overview-helper (T1); this module adds the data loaders and the
// tool entry points. change_chat_context needs the host's launch tool surface
// (host execution state), so it takes a minimal injected resolver rather than
// importing an application composition layer.

import {
	buildProjectOverviewPayload,
	buildWorkspaceOverviewPayload,
	resolveProjectMatch,
	type EventRow,
	type MilestoneRow,
	type PlanRow,
	type ProjectLogRow,
	type ProjectMemberRow,
	type ProjectRow,
	type RiskRow,
	type TaskRow
} from './overview-helper';
import { filterReadableProjectSummaries } from './access-port';
import { ENTITY_FIELD_INFO } from './entity-field-info';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

// ============================================
// ARG TYPES (mirrors the legacy web executor args)
// ============================================

export interface SharedGetFieldInfoArgs {
	entity_type: string;
	field_name?: string;
}

export interface SharedGetWorkspaceOverviewArgs {
	project_limit?: number;
}

export interface SharedGetProjectOverviewArgs {
	project_id?: string;
	query?: string;
}

export interface SharedChangeChatContextArgs {
	target: 'global' | 'project';
	project_id?: string;
	project_query?: string;
	reason?: string;
}

/**
 * Host port for change_chat_context: resolves the direct tool names the host
 * mounts at launch for a chat context type. Web resolves the shared catalog
 * profile selected during admission; the worker supplies its decoded callable
 * surface. Kept as a function port because the active mounted surface is host
 * execution state, not shared read behavior.
 */
export type SharedChangeChatContextPorts = {
	resolveDirectToolNames: (contextType: 'global' | 'project') => string[];
};

// ============================================
// PROJECT SUMMARY MAPPING (byte-identical to the legacy web executor)
// ============================================

function mapProjectSummaryToOverviewRow(summary: {
	id: string;
	name: string;
	state_key: string;
	description: string | null;
	next_step_short: string | null;
	updated_at: string;
	task_count: number;
	document_count: number;
	plan_count: number;
	goal_count: number;
}): ProjectRow {
	return {
		id: summary.id,
		name: summary.name,
		state_key: summary.state_key,
		description: summary.description ?? null,
		start_at: null,
		end_at: null,
		next_step_short: summary.next_step_short ?? null,
		updated_at: summary.updated_at ?? null,
		task_count: summary.task_count,
		document_count: summary.document_count,
		plan_count: summary.plan_count,
		goal_count: summary.goal_count
	};
}

type OverviewProjectSummary = Parameters<typeof mapProjectSummaryToOverviewRow>[0];

// ============================================
// DATA LOADERS
// ============================================

async function loadOverviewProjectRows(
	context: AgenticChatSharedReadContextV1,
	params: {
		projectLimit: number;
		query?: string;
		projectId?: string;
	}
): Promise<{ projects: ProjectRow[]; maybeMore: boolean; totalProjects: number }> {
	const projectSummaries = await context.access.resolveProjectSummaries();
	// Direct project_id lookups bypass the paused filter (legacy behavior);
	// list/query flows use the single shared paused-project predicate.
	const visibleSummaries = (params.projectId
		? projectSummaries
		: filterReadableProjectSummaries(projectSummaries)) as unknown as OverviewProjectSummary[];
	const sortedProjects = [...visibleSummaries]
		.sort((a, b) => {
			const aTs = a.updated_at ? Date.parse(a.updated_at) : Number.NEGATIVE_INFINITY;
			const bTs = b.updated_at ? Date.parse(b.updated_at) : Number.NEGATIVE_INFINITY;
			return bTs - aTs;
		})
		.map((summary) => mapProjectSummaryToOverviewRow(summary));

	if (params.projectId) {
		const project = sortedProjects.find((row) => row.id === params.projectId);
		return {
			projects: project ? [project] : [],
			maybeMore: false,
			totalProjects: project ? 1 : 0
		};
	}

	const normalizedQuery =
		typeof params.query === 'string' && params.query.trim().length > 0
			? params.query.trim().toLocaleLowerCase()
			: null;
	const rows = normalizedQuery
		? sortedProjects.filter((row) => row.name.toLocaleLowerCase().includes(normalizedQuery))
		: sortedProjects;

	return {
		projects: rows.slice(0, params.projectLimit),
		maybeMore: rows.length > params.projectLimit,
		totalProjects: rows.length
	};
}

async function loadOverviewProjectData(
	context: AgenticChatSharedReadContextV1,
	projectIds: string[]
): Promise<{
	tasks: TaskRow[];
	milestones: MilestoneRow[];
	plans: PlanRow[];
	risks: RiskRow[];
	events: EventRow[];
	projectLogs: ProjectLogRow[];
	members: ProjectMemberRow[];
}> {
	if (projectIds.length === 0) {
		return {
			tasks: [],
			milestones: [],
			plans: [],
			risks: [],
			events: [],
			projectLogs: [],
			members: []
		};
	}

	const supabaseAny = context.client as any;
	const now = new Date();
	const eventStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const eventEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

	const [tasksRes, milestonesRes, plansRes, risksRes, eventsRes, logsRes, membersRes] =
		await Promise.all([
			supabaseAny
				.from('onto_tasks')
				.select(
					'id, project_id, title, state_key, priority, due_at, completed_at, updated_at'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			supabaseAny
				.from('onto_milestones')
				.select('id, project_id, title, state_key, due_at, completed_at, updated_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			supabaseAny
				.from('onto_plans')
				.select('id, project_id, name, state_key, updated_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			supabaseAny
				.from('onto_risks')
				.select('id, project_id, title, state_key, impact, updated_at')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			supabaseAny
				.from('onto_events')
				.select('id, project_id, title, state_key, start_at, end_at, updated_at')
				.in('project_id', projectIds)
				.is('deleted_at', null)
				.gte('start_at', eventStart)
				.lte('start_at', eventEnd),
			supabaseAny
				.from('onto_project_logs')
				.select(
					'project_id, entity_type, entity_id, action, created_at, changed_by, changed_by_actor_id, change_source, after_data, before_data'
				)
				.in('project_id', projectIds)
				.order('created_at', { ascending: false })
				.limit(Math.max(12, projectIds.length * 6)),
			supabaseAny
				.from('onto_project_members')
				.select(
					'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)'
				)
				.in('project_id', projectIds)
				.is('removed_at', null)
		]);

	const failures = [
		['tasks', tasksRes.error],
		['milestones', milestonesRes.error],
		['plans', plansRes.error],
		['risks', risksRes.error],
		['events', eventsRes.error],
		['project activity', logsRes.error],
		['project collaborators', membersRes.error]
	].filter((entry) => entry[1]);
	if (failures.length > 0) {
		const [label, error] = failures[0]!;
		throw new Error(`Failed to load ${label} for overview: ${error.message}`);
	}

	return {
		tasks: Array.isArray(tasksRes.data) ? tasksRes.data : [],
		milestones: Array.isArray(milestonesRes.data) ? milestonesRes.data : [],
		plans: Array.isArray(plansRes.data) ? plansRes.data : [],
		risks: Array.isArray(risksRes.data) ? risksRes.data : [],
		events: Array.isArray(eventsRes.data) ? eventsRes.data : [],
		projectLogs: Array.isArray(logsRes.data) ? logsRes.data : [],
		members: Array.isArray(membersRes.data) ? membersRes.data : []
	};
}

// ============================================
// FIELD INFO
// ============================================

/**
 * Get field schema information for an entity type. Pure lookup over the
 * static ENTITY_FIELD_INFO catalog; needs no host context.
 */
export function getFieldInfo(args: SharedGetFieldInfoArgs): {
	entity_type: string;
	fields: Record<string, unknown>;
	message: string;
} {
	const { entity_type, field_name } = args;

	// Validate entity_type is provided
	if (!entity_type || entity_type === 'undefined' || entity_type === 'null') {
		const validTypes = Object.keys(ENTITY_FIELD_INFO).join(', ');
		throw new Error(
			`The 'entity_type' parameter is required to specify which entity's field schema to return. ` +
				`This helps you understand what properties are available when creating or updating entities. ` +
				`Valid types: ${validTypes}. Example: get_field_info({ entity_type: "ontology_project" })`
		);
	}

	const schema = ENTITY_FIELD_INFO[entity_type];
	if (!schema) {
		throw new Error(
			`Unknown entity type: ${entity_type}. Valid types: ${Object.keys(ENTITY_FIELD_INFO).join(', ')}`
		);
	}

	if (field_name) {
		const field = schema[field_name];
		if (!field) {
			throw new Error(
				`Field "${field_name}" not found for entity "${entity_type}". Available fields: ${Object.keys(schema).join(', ')}`
			);
		}

		return {
			entity_type,
			fields: { [field_name]: field },
			message: `Field information for ${entity_type}.${field_name}`
		};
	}

	return {
		entity_type,
		fields: schema,
		message: `Commonly-used fields for ${entity_type}`
	};
}

// ============================================
// OVERVIEW TOOLS
// ============================================

export async function getWorkspaceOverview(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetWorkspaceOverviewArgs = {}
): Promise<Record<string, any>> {
	const projectLimit = Math.max(1, Math.min(20, Math.floor(args.project_limit ?? 8)));
	const { projects, maybeMore, totalProjects } = await loadOverviewProjectRows(context, {
		projectLimit
	});
	if (projects.length === 0) {
		return buildWorkspaceOverviewPayload({
			projects: [],
			tasks: [],
			milestones: [],
			plans: [],
			risks: [],
			events: [],
			projectLogs: [],
			members: [],
			maybeMore: false,
			totalProjects,
			projectLimit
		});
	}

	const projectIds = projects.map((project) => String(project.id));
	const related = await loadOverviewProjectData(context, projectIds);
	return buildWorkspaceOverviewPayload({
		projects,
		tasks: related.tasks,
		milestones: related.milestones,
		plans: related.plans,
		risks: related.risks,
		events: related.events,
		projectLogs: related.projectLogs,
		members: related.members,
		maybeMore,
		totalProjects,
		projectLimit
	});
}

export async function getProjectOverview(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetProjectOverviewArgs = {}
): Promise<Record<string, any>> {
	const directProjectId =
		typeof args.project_id === 'string' && args.project_id.trim().length > 0
			? args.project_id.trim()
			: undefined;
	const query =
		typeof args.query === 'string' && args.query.trim().length > 0 ? args.query.trim() : '';

	if (!directProjectId && !query) {
		throw new Error('get_project_overview requires project_id or query');
	}

	const { projects } = await loadOverviewProjectRows(context, {
		projectLimit: directProjectId ? 1 : 6,
		query: directProjectId ? undefined : query,
		projectId: directProjectId
	});

	if (directProjectId) {
		const project = projects[0];
		if (!project) {
			return {
				generated_at: new Date().toISOString(),
				scope: 'project',
				match: {
					status: 'not_found',
					query: directProjectId,
					candidates: []
				},
				message: 'No accessible project matched that project_id.'
			};
		}

		const related = await loadOverviewProjectData(context, [String(project.id)]);
		return buildProjectOverviewPayload({
			project,
			tasks: related.tasks,
			milestones: related.milestones,
			plans: related.plans,
			risks: related.risks,
			events: related.events,
			projectLogs: related.projectLogs,
			members: related.members,
			currentActorId: await context.access.getActorId()
		});
	}

	const match = resolveProjectMatch(projects, query);
	if (match.status === 'not_found') {
		return {
			generated_at: new Date().toISOString(),
			scope: 'project',
			match: {
				status: 'not_found',
				query,
				candidates: []
			},
			message: `No accessible project matched "${query}".`
		};
	}
	if (match.status === 'ambiguous') {
		return {
			generated_at: new Date().toISOString(),
			scope: 'project',
			match: {
				status: 'ambiguous',
				query,
				candidates: match.candidates
			},
			message: `Multiple accessible projects matched "${query}".`
		};
	}

	const related = await loadOverviewProjectData(context, [match.project.id]);
	return buildProjectOverviewPayload({
		project: match.project,
		query,
		tasks: related.tasks,
		milestones: related.milestones,
		plans: related.plans,
		risks: related.risks,
		events: related.events,
		projectLogs: related.projectLogs,
		members: related.members,
		currentActorId: await context.access.getActorId()
	});
}

// ============================================
// CONTEXT CHANGE
// ============================================

export async function changeChatContext(
	context: AgenticChatSharedReadContextV1,
	args: SharedChangeChatContextArgs,
	ports: SharedChangeChatContextPorts
): Promise<Record<string, any>> {
	const target = args.target === 'project' ? 'project' : 'global';
	const reason = typeof args.reason === 'string' ? args.reason.trim() : '';

	if (target === 'global') {
		const message = reason || 'Zoomed out to workspace context.';
		return {
			type: 'context_change',
			changed: true,
			target,
			context_shift: {
				new_context: 'global',
				entity_id: null,
				entity_name: 'Workspace',
				entity_type: 'workspace',
				message
			},
			materialized_tools: ports.resolveDirectToolNames('global'),
			message
		};
	}

	const projectId =
		typeof args.project_id === 'string' && args.project_id.trim().length > 0
			? args.project_id.trim()
			: undefined;
	const projectQuery =
		typeof args.project_query === 'string' && args.project_query.trim().length > 0
			? args.project_query.trim()
			: undefined;

	if (!projectId && !projectQuery) {
		return {
			type: 'context_change',
			changed: false,
			target,
			match: {
				status: 'missing_project',
				candidates: []
			},
			message: 'Project context changes require project_id or project_query.'
		};
	}

	const overview = await getProjectOverview(context, {
		...(projectId ? { project_id: projectId } : {}),
		...(projectQuery ? { query: projectQuery } : {})
	});
	const match =
		overview.match && typeof overview.match === 'object'
			? (overview.match as Record<string, unknown>)
			: null;
	if (match?.status !== 'resolved' || !overview.project) {
		return {
			type: 'context_change',
			changed: false,
			target,
			match: overview.match ?? {
				status: 'not_found',
				query: projectQuery ?? projectId ?? '',
				candidates: []
			},
			message:
				typeof overview.message === 'string'
					? overview.message
					: 'Project context was not changed.'
		};
	}

	const project = overview.project as Record<string, unknown>;
	const resolvedProjectId =
		typeof project.id === 'string' && project.id.trim().length > 0
			? project.id.trim()
			: typeof match.project_id === 'string'
				? match.project_id.trim()
				: '';
	if (!resolvedProjectId) {
		return {
			type: 'context_change',
			changed: false,
			target,
			match: overview.match ?? null,
			message: 'Project context was not changed because the resolved project had no id.'
		};
	}
	const projectName =
		typeof project.name === 'string' && project.name.trim().length > 0
			? project.name.trim()
			: 'Project';
	const message = reason || `Zoomed into ${projectName}.`;

	return {
		type: 'context_change',
		changed: true,
		target,
		project: {
			id: resolvedProjectId,
			name: projectName,
			state_key: typeof project.state_key === 'string' ? project.state_key : null
		},
		context_shift: {
			new_context: 'project',
			entity_id: resolvedProjectId,
			entity_name: projectName,
			entity_type: 'project',
			message
		},
		materialized_tools: ports.resolveDirectToolNames('project'),
		message
	};
}

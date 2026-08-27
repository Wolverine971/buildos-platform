// packages/shared-agent-ops/src/gateway/op-execution-gateway.projects.ts
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { logUpdateAsync } from '../ops/async-activity-logger';
import {
	sanitizeProjectForClient,
	sanitizeProjectPropsPatchInput
} from '../utils/project-props-sanitizer';
import { assertAccessibleProject, loadVisibleProjects } from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import { ONTO_PROJECT_MUTATION_SELECT } from './op-execution-gateway.config';
import { loadCoreEntityForAccess } from './op-execution-gateway.entity-access';
import {
	normalizeArchivedUpdate,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeOptionalDate,
	normalizeOptionalText,
	normalizeProjectState,
	requireTrimmedString
} from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';
import { loadProjectStartHereExcerpt } from '../ontology/start-here.service';

function serializeProjectSummary(project: OntologyProjectSummary) {
	return {
		id: project.id,
		name: project.name,
		description: project.description,
		type_key: project.type_key,
		state_key: project.state_key,
		updated_at: project.updated_at,
		task_count: project.task_count,
		goal_count: project.goal_count,
		plan_count: project.plan_count,
		document_count: project.document_count,
		access_role: project.access_role,
		access_level: project.access_level
	};
}

export async function listProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const requestedState = normalizeEntityStateFilter(args.state_key, 'project');
	const requestedType = normalizeEntityTypeFilter(args.type_key, 'project');
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);

	const filteredProjects = visible.projects
		.filter((project) => (requestedState ? project.state_key === requestedState : true))
		.filter((project) => (requestedType ? project.type_key === requestedType : true));
	const projects = filteredProjects
		.slice(offset, offset + limit)
		.map((project) => serializeProjectSummary(project));

	return {
		projects,
		total: filteredProjects.length,
		pagination: buildPaginationForRows(offset, limit, filteredProjects.length, projects.length)
	};
}

export async function searchProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const requestedState = normalizeEntityStateFilter(args.state_key, 'project');
	const requestedType = normalizeEntityTypeFilter(args.type_key, 'project');
	const visible = await loadVisibleProjects(context);

	const filteredProjects = visible.projects
		.filter((project) => {
			const haystack = `${project.name} ${project.description ?? ''}`.toLowerCase();
			return haystack.includes(query);
		})
		.filter((project) => (requestedState ? project.state_key === requestedState : true))
		.filter((project) => (requestedType ? project.type_key === requestedType : true));
	const results = filteredProjects.slice(offset, offset + limit).map((project) => ({
		type: 'project',
		id: project.id,
		project_id: project.id,
		project_name: project.name,
		title: project.name,
		snippet: project.description ?? null,
		name: project.name,
		description: project.description,
		type_key: project.type_key,
		state_key: project.state_key,
		updated_at: project.updated_at
	}));

	return {
		query,
		projects: results,
		results,
		total: filteredProjects.length,
		pagination: buildPaginationForRows(offset, limit, filteredProjects.length, results.length)
	};
}

export async function getProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);

	const { data, error } = await context.admin.rpc('load_fastchat_context', {
		p_context_type: 'project',
		p_user_id: context.userId,
		p_project_id: project.id
	});

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project snapshot'
		);
	}

	// Surface the Start Here orientation document so external (API-key / MCP)
	// agents get the same "lay of the land" the internal chat injects.
	const startHere = await loadProjectStartHereExcerpt({
		supabase: context.admin,
		projectId: project.id
	});

	return {
		project: serializeProjectSummary(project),
		start_here: startHere,
		snapshot: data ?? null
	};
}

export async function updateProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const access = await loadCoreEntityForAccess(context, 'project', args.project_id, 'write', {
		includeArchived: archivedAtUpdate === null
	});
	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
	let changed = 0;

	if (args.name !== undefined) {
		updateData.name = requireTrimmedString(args.name, 'name');
		changed += 1;
	}
	if (args.description !== undefined) {
		const description = normalizeOptionalText(args.description, 'description', {
			allowNull: true
		});
		updateData.description = description === '' ? null : description;
		changed += 1;
	}
	if (args.state_key !== undefined || args.state !== undefined) {
		updateData.state_key = normalizeProjectState(args.state_key ?? args.state);
		changed += 1;
	}
	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changed += 1;
	}
	const endAt = normalizeOptionalDate(args.end_at, 'end_at');
	if (endAt !== undefined) {
		updateData.end_at = endAt;
		changed += 1;
	}
	if (args.props !== undefined) {
		const sanitizedProps = sanitizeProjectPropsPatchInput(args.props);
		if (sanitizedProps && Object.keys(sanitizedProps).length > 0) {
			updateData.props = {
				...((access.entity.props as Record<string, unknown> | null) ?? {}),
				...sanitizedProps
			};
			changed += 1;
		}
	}
	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changed += 1;
	}

	if (changed === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable project field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_projects')
		.update(updateData)
		.eq('id', access.project.id)
		.select(ONTO_PROJECT_MUTATION_SELECT)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to update project'
		);
	}

	await logUpdateAsync(
		context.admin,
		access.project.id,
		'project',
		access.project.id,
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'agent_call',
		context.chatSessionId,
		getExternalAgentActivityContext(context)
	);

	const project = sanitizeProjectForClient(data as Record<string, unknown>);
	return {
		project,
		message: `Updated ontology project "${project.name ?? access.project.id}".`
	};
}

// packages/shared-agent-ops/src/gateway/op-execution-gateway.entity-access.ts
import { ensureActorId, type OntologyProjectSummary } from '../ontology/ontology-projects.service';
import {
	ARCHIVABLE_ENTITY_KINDS,
	LINK_ENTITY_SELECTS,
	LINK_ENTITY_TABLES,
	type ExternalEntityKind,
	type ExternalLinkEntityKind
} from './op-execution-gateway.config';
import {
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { assertValidId } from './op-execution-gateway.ids';
import { applyArchivedFilter } from './op-execution-gateway.normalization';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export type EntityAccessResult = {
	kind: ExternalLinkEntityKind;
	entity: Record<string, unknown>;
	project: OntologyProjectSummary;
	projectId: string;
};

async function resolveArchivedProjectAccessContext(
	context: ToolExecutionContext,
	entity: Record<string, unknown>
): Promise<OntologyProjectSummary | null> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const createdBy = typeof entity.created_by === 'string' ? entity.created_by : null;
	let accessRole: OntologyProjectSummary['access_role'] = createdBy === actorId ? 'owner' : null;
	let accessLevel: OntologyProjectSummary['access_level'] =
		createdBy === actorId ? 'admin' : null;

	if (!accessLevel) {
		const { data: member, error } = await context.admin
			.from('onto_project_members')
			.select('role_key, access')
			.eq('project_id', String(entity.id))
			.eq('actor_id', actorId)
			.is('removed_at', null)
			.maybeSingle();
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to load project membership'
			);
		}
		if (!member) return null;
		accessRole =
			member.role_key === 'owner' ||
			member.role_key === 'editor' ||
			member.role_key === 'viewer'
				? member.role_key
				: null;
		accessLevel =
			member.access === 'read' || member.access === 'write' || member.access === 'admin'
				? member.access
				: null;
	}

	return {
		id: String(entity.id),
		name: typeof entity.name === 'string' ? entity.name : 'Archived project',
		description: typeof entity.description === 'string' ? entity.description : null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: typeof entity.type_key === 'string' ? entity.type_key : 'project.default',
		state_key: entity.state_key as OntologyProjectSummary['state_key'],
		props:
			entity.props && typeof entity.props === 'object' && !Array.isArray(entity.props)
				? (entity.props as OntologyProjectSummary['props'])
				: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: typeof entity.created_at === 'string' ? entity.created_at : '',
		updated_at: typeof entity.updated_at === 'string' ? entity.updated_at : '',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		owner_actor_id: createdBy ?? actorId,
		access_role: accessRole,
		access_level: accessLevel,
		is_shared: createdBy !== actorId,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null
	};
}

function isProjectInExplicitScope(context: ToolExecutionContext, projectId: string): boolean {
	if (!Array.isArray(context.scope.project_ids)) {
		return true;
	}
	return context.scope.project_ids.includes(projectId);
}

export function normalizeEntityKind(value: unknown, fieldName: string): ExternalLinkEntityKind {
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}
	const normalized = value.trim().toLowerCase();
	if (!Object.prototype.hasOwnProperty.call(LINK_ENTITY_TABLES, normalized)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Unsupported ${fieldName}: ${value}`
		);
	}
	return normalized as ExternalLinkEntityKind;
}

export async function loadEntityForAccess(
	context: ToolExecutionContext,
	kind: ExternalLinkEntityKind,
	id: unknown,
	access: 'read' | 'write',
	options: { archived?: boolean; includeArchived?: boolean } = {}
): Promise<EntityAccessResult> {
	const entityId = assertValidId(id, `${kind}_id`);
	const table = LINK_ENTITY_TABLES[kind];
	const selectColumns = LINK_ENTITY_SELECTS[kind];
	const visible = await loadVisibleProjects(context);

	let query = context.admin.from(table).select(selectColumns).eq('id', entityId);
	if (ARCHIVABLE_ENTITY_KINDS.has(kind)) {
		query = options.includeArchived
			? query.is('deleted_at', null)
			: applyArchivedFilter(query, options.archived ?? false);
	} else if (kind !== 'metric' && kind !== 'source' && !ARCHIVABLE_ENTITY_KINDS.has(kind)) {
		query = query.is('deleted_at', null);
	}

	const { data, error } = await query.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || `Failed to load ${kind}`);
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${kind} not found`);
	}

	const entity = data as Record<string, unknown>;
	const projectId = kind === 'project' ? entityId : entity.project_id;
	let project: OntologyProjectSummary | null = null;
	try {
		project = assertVisibleEntityProject(visible.projectMap, projectId);
	} catch (error) {
		if (
			kind === 'project' &&
			options.includeArchived &&
			isProjectInExplicitScope(context, entityId)
		) {
			project = await resolveArchivedProjectAccessContext(context, entity);
		}
		if (!project) throw error;
	}
	if (access === 'write') {
		assertProjectWriteAccess(project);
	}

	return {
		kind,
		entity,
		project,
		projectId: project.id
	};
}

export async function loadCoreEntityForAccess(
	context: ToolExecutionContext,
	kind: ExternalEntityKind,
	id: unknown,
	access: 'read' | 'write',
	options: { archived?: boolean; includeArchived?: boolean } = {}
): Promise<EntityAccessResult> {
	return loadEntityForAccess(context, kind, id, access, options);
}

export function resolveEntityProjectId(access: EntityAccessResult): string {
	return access.kind === 'project'
		? String(access.entity.id)
		: String(access.entity.project_id ?? access.projectId);
}

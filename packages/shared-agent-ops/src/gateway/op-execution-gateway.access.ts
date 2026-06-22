// packages/shared-agent-ops/src/gateway/op-execution-gateway.access.ts
//
// Project visibility and authorization helpers shared by gateway handlers.
import { isValidUUID } from '@buildos/shared-types';
import type { AgentCallScope } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '../ontology/ontology-projects.service';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export type VisibleProjectContext = {
	projects: OntologyProjectSummary[];
	projectMap: Map<string, OntologyProjectSummary>;
};

export function buildAllowedProjectSet(
	scope: AgentCallScope,
	projects: OntologyProjectSummary[]
): Map<string, OntologyProjectSummary> {
	const requestedIds = Array.isArray(scope.project_ids) ? new Set(scope.project_ids) : null;
	const filtered = requestedIds
		? projects.filter((project) => requestedIds.has(project.id))
		: projects;
	return new Map(filtered.map((project) => [project.id, project]));
}

export function assertAccessibleProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: unknown
): OntologyProjectSummary {
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'project_id must be a valid UUID');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Project is outside the allowed call scope'
		);
	}

	return project;
}

export function assertVisibleEntityProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: unknown
): OntologyProjectSummary {
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('INTERNAL', 'Entity project_id is invalid');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Entity is outside the allowed call scope');
	}

	return project;
}

export async function loadVisibleProjects(
	context: ToolExecutionContext
): Promise<VisibleProjectContext> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const projects = await fetchProjectSummaries(context.admin, actorId);
	const projectMap = buildAllowedProjectSet(context.scope, projects);
	const scopedProjectIds = Array.isArray(context.scope.project_ids)
		? new Set(context.scope.project_ids)
		: null;
	const visibleProjects = Array.from(projectMap.values()).filter(
		(project) => scopedProjectIds?.has(project.id) || project.state_key !== 'paused'
	);

	return {
		projects: visibleProjects,
		projectMap
	};
}

export function assertProjectWriteAccess(project: OntologyProjectSummary): void {
	if (project.access_level !== 'write' && project.access_level !== 'admin') {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Write access is not available for this project',
			{
				project_id: project.id,
				project_name: project.name,
				project_access_level: project.access_level
			}
		);
	}
}

export function getProjectIdsForVisibleContext(visible: VisibleProjectContext): string[] {
	return visible.projects.map((project) => project.id);
}

export function getProjectIdsOrThrow(
	visible: VisibleProjectContext,
	entityLabel: string
): string[] {
	const projectIds = getProjectIdsForVisibleContext(visible);
	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${entityLabel} not found`);
	}
	return projectIds;
}

export function withProjectName(
	row: Record<string, unknown>,
	projectMap: Map<string, OntologyProjectSummary>
): Record<string, unknown> {
	return {
		...row,
		project_name: projectMap.get(String(row.project_id))?.name ?? null
	};
}

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
import type { GatewayLookupMemo, ToolExecutionContext } from './op-execution-gateway.types';

export type VisibleProjectContext = {
	projects: OntologyProjectSummary[];
	projectMap: Map<string, OntologyProjectSummary>;
	/** User-visible projects this connector has not been granted (0 when unscoped). */
	ungrantedProjectCount: number;
};

/** Error reason for a project the user can see but this connector was not granted. */
export const PROJECT_NOT_GRANTED_TO_CONNECTOR = 'project_not_granted_to_connector';

/** Error reason for a call aimed at a project that was combined into another (tasker 122). */
export const PROJECT_MERGED_INTO_ANOTHER = 'project_merged';

/**
 * A project id outside the caller's visible set. Same code, message and (no)
 * details as the plain refusal, so nothing more is said about projects the
 * caller can't see; the id only rides along so `explainMergedProjectRefusal`
 * can recognise a combined project.
 */
export class ProjectOutsideScopeError extends ExternalToolGatewayError {
	constructor(
		message: string,
		readonly projectId: string
	) {
		super('FORBIDDEN', message);
	}
}

/**
 * The connector's allowed projects, plus the ids the user can see that fall
 * outside the connector scope. The extra set lets a denial say "ask the user
 * to grant this" instead of a dead-end FORBIDDEN, without widening access.
 */
export class ScopedProjectMap extends Map<string, OntologyProjectSummary> {
	readonly ungrantedProjectIds: ReadonlySet<string>;

	constructor(
		entries: Iterable<readonly [string, OntologyProjectSummary]>,
		ungrantedProjectIds: Iterable<string> = []
	) {
		super(entries);
		this.ungrantedProjectIds = new Set(ungrantedProjectIds);
	}
}

export function buildAllowedProjectSet(
	scope: AgentCallScope,
	projects: OntologyProjectSummary[]
): ScopedProjectMap {
	const requestedIds = Array.isArray(scope.project_ids) ? new Set(scope.project_ids) : null;
	if (!requestedIds) {
		return new ScopedProjectMap(projects.map((project) => [project.id, project]));
	}
	const allowed: OntologyProjectSummary[] = [];
	const ungranted: string[] = [];
	for (const project of projects) {
		if (requestedIds.has(project.id)) allowed.push(project);
		else ungranted.push(project.id);
	}
	return new ScopedProjectMap(
		allowed.map((project) => [project.id, project]),
		ungranted
	);
}

function isUngrantedProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: string
): boolean {
	return projectMap instanceof ScopedProjectMap && projectMap.ungrantedProjectIds.has(projectId);
}

function projectNotGrantedError(subject: string, projectId: string): ExternalToolGatewayError {
	return new ExternalToolGatewayError(
		'FORBIDDEN',
		`${subject} is in the user's BuildOS workspace, but this connector has not been granted access to that project. Ask the user to approve access (details.grant_url when present, otherwise BuildOS → Profile → Agent keys), then retry.`,
		{ reason: PROJECT_NOT_GRANTED_TO_CONNECTOR, project_id: projectId }
	);
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
		if (isUngrantedProject(projectMap, projectId)) {
			throw projectNotGrantedError('This project', projectId);
		}
		throw new ProjectOutsideScopeError('Project is outside the allowed call scope', projectId);
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
		if (isUngrantedProject(projectMap, projectId)) {
			throw projectNotGrantedError('This entity', projectId);
		}
		throw new ProjectOutsideScopeError('Entity is outside the allowed call scope', projectId);
	}

	return project;
}

/**
 * Store a lookup on the memo once; a failure clears it so the next write
 * retries instead of replaying the rejection.
 */
function memoized<K extends keyof GatewayLookupMemo>(
	memo: GatewayLookupMemo,
	key: K,
	load: () => NonNullable<GatewayLookupMemo[K]>
): NonNullable<GatewayLookupMemo[K]> {
	const existing = memo[key];
	if (existing) return existing as NonNullable<GatewayLookupMemo[K]>;
	const pending = load();
	memo[key] = pending;
	(pending as Promise<unknown>).catch(() => {
		if (memo[key] === pending) delete memo[key];
	});
	return pending;
}

/** The caller's actor id, resolved once per memo (one chat turn). */
export function contextActorId(context: ToolExecutionContext): Promise<string> {
	const load = () => ensureActorId(context.admin, context.userId, context.signal);
	return context.memo ? memoized(context.memo, 'actorId', load) : load();
}

export async function loadVisibleProjects(
	context: ToolExecutionContext
): Promise<VisibleProjectContext> {
	const actorId = await contextActorId(context);
	const load = () => fetchProjectSummaries(context.admin, actorId, undefined, context.signal);
	const projects = await (context.memo
		? memoized(context.memo, 'projectSummaries', load)
		: load());
	const projectMap = buildAllowedProjectSet(context.scope, projects);
	const scopedProjectIds = Array.isArray(context.scope.project_ids)
		? new Set(context.scope.project_ids)
		: null;
	const visibleProjects = Array.from(projectMap.values()).filter(
		(project) => scopedProjectIds?.has(project.id) || project.state_key !== 'paused'
	);

	return {
		projects: visibleProjects,
		projectMap,
		ungrantedProjectCount: projectMap.ungrantedProjectIds.size
	};
}

/**
 * A combined project (the fold archives the source and points it at the
 * destination) is never in the visible set, so every write aimed at it is
 * already refused as outside the call scope. That dead end makes MCP
 * connectors and chat writes retry blindly; say plainly where the project
 * went instead. `get_project_route_redirect` follows the merge chain and only
 * answers when the user can read the destination. Runs on the refusal path
 * only (one RPC); every other error passes through unchanged.
 */
export async function explainMergedProjectRefusal(
	context: ToolExecutionContext,
	error: ExternalToolGatewayError
): Promise<ExternalToolGatewayError> {
	if (!(error instanceof ProjectOutsideScopeError)) return error;
	try {
		const actorId = await contextActorId(context);
		const { data, error: rpcError } = await context.admin.rpc('get_project_route_redirect', {
			p_project_id: error.projectId,
			p_actor_id: actorId
		});
		const answer =
			data && typeof data === 'object' && !Array.isArray(data)
				? (data as { status?: unknown; destination_project_id?: unknown })
				: null;
		const destinationId = answer?.destination_project_id;
		if (
			rpcError ||
			answer?.status !== 'merged' ||
			typeof destinationId !== 'string' ||
			!isValidUUID(destinationId)
		)
			return error;
		const visible = await loadVisibleProjects(context);
		const destination = visible.projectMap.get(destinationId);
		const details = {
			reason: PROJECT_MERGED_INTO_ANOTHER,
			project_id: error.projectId,
			destination_project_id: destinationId
		};
		if (destination)
			return new ExternalToolGatewayError(
				'FORBIDDEN',
				`This project was combined into "${destination.name}" and is archived, so nothing was changed. Use project_id ${destinationId} instead.`,
				{ ...details, destination_project_name: destination.name }
			);
		return new ExternalToolGatewayError(
			'FORBIDDEN',
			`This project was combined into another project and is archived, so nothing was changed. That project (destination_project_id) is not available to this connector; ask the user to approve access (BuildOS → Profile → Agent keys), then retry there.`,
			details
		);
	} catch {
		return error;
	}
}

export function assertProjectWriteAccess(
	project: OntologyProjectSummary,
	scope?: AgentCallScope
): void {
	if (Array.isArray(scope?.write_project_ids) && !scope.write_project_ids.includes(project.id)) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Write access is not granted to this project for the connected agent',
			{ project_id: project.id, project_name: project.name }
		);
	}
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

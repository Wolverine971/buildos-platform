// apps/web/src/lib/server/agent-call/project-access.service.ts
import type {
	AgentCallScope,
	BuildosAgentProjectAccessMode,
	BuildosAgentProjectScopeMode,
	BuildosProjectExternalAgentAccess
} from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';

/** What the project owner lets this member's agents do (onto_project_members.agent_access). */
export type MemberAgentAccess = 'off' | 'read' | 'write';

type ProjectAccessRecord = Pick<OntologyProjectSummary, 'id' | 'is_shared' | 'access_level'> & {
	external_agent_access: BuildosProjectExternalAgentAccess;
	/** Only meaningful on shared projects. Missing means off (fail closed). */
	agent_access?: MemberAgentAccess | null;
};

type ExplicitProjectPermission = {
	project_id: string;
	access_mode: BuildosAgentProjectAccessMode;
};

export type EffectiveAgentProjectScope = AgentCallScope & {
	project_ids: string[];
	write_project_ids: string[];
};

function uniqueStrings(values: string[] | undefined): string[] {
	return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value))];
}

/**
 * Pure policy calculation used by the DB-backed resolver and unit tests.
 * Membership has already been resolved in `projects`; public visibility alone
 * can therefore never add a project here.
 *
 * A project someone else owns needs two keys: the owner's setting for this
 * member's agents (`agent_access`: off hides it, read never writes) and the
 * member's own explicit grant to this connector. Writes the owner allows are
 * further limited to the guest-agent lane in the gateway.
 */
export function computeEffectiveAgentProjectScope(params: {
	scope: AgentCallScope;
	projectScopeMode: BuildosAgentProjectScopeMode;
	projects: ProjectAccessRecord[];
	permissions: ExplicitProjectPermission[];
}): EffectiveAgentProjectScope {
	const permissionByProject = new Map<string, BuildosAgentProjectAccessMode>();
	for (const permission of params.permissions) {
		permissionByProject.set(permission.project_id, permission.access_mode);
	}

	const projectIds: string[] = [];
	const writeProjectIds: string[] = [];
	for (const project of params.projects) {
		const ownerAgentAccess: MemberAgentAccess = project.is_shared
			? (project.agent_access ?? 'off')
			: 'write';
		if (ownerAgentAccess === 'off') continue;
		const explicitAccess = permissionByProject.get(project.id);
		const inherited =
			params.projectScopeMode === 'all_unrestricted' &&
			!project.is_shared &&
			project.external_agent_access === 'standard';
		if (!explicitAccess && !inherited) continue;

		projectIds.push(project.id);
		const membershipAllowsWrite =
			project.access_level === 'write' || project.access_level === 'admin';
		const projectPolicyAllowsWrite = explicitAccess
			? explicitAccess === 'read_write'
			: inherited;
		if (
			params.scope.mode === 'read_write' &&
			membershipAllowsWrite &&
			projectPolicyAllowsWrite &&
			ownerAgentAccess === 'write'
		) {
			writeProjectIds.push(project.id);
		}
	}

	return {
		...params.scope,
		project_ids: projectIds,
		write_project_ids: writeProjectIds
	};
}

export async function resolveEffectiveAgentProjectScope(params: {
	admin: any;
	userId: string;
	callerId: string;
	oauthGrantId?: string;
	projectScopeMode: BuildosAgentProjectScopeMode;
	scope: AgentCallScope;
}): Promise<EffectiveAgentProjectScope> {
	const actorId = await ensureActorId(params.admin, params.userId);
	const visibleProjects = await fetchProjectSummaries(params.admin, actorId);
	if (visibleProjects.length === 0) {
		return { ...params.scope, project_ids: [], write_project_ids: [] };
	}

	const projectIds = visibleProjects.map((project) => project.id);
	let permissionQuery = params.admin
		.from('external_agent_project_permissions')
		.select('project_id, access_mode')
		.eq('external_agent_caller_id', params.callerId)
		.is('revoked_at', null);
	permissionQuery = params.oauthGrantId
		? permissionQuery.eq('agent_oauth_grant_id', params.oauthGrantId)
		: permissionQuery.is('agent_oauth_grant_id', null);

	const sharedProjectIds = visibleProjects
		.filter((project) => project.is_shared)
		.map((project) => project.id);
	const memberAgentQuery =
		sharedProjectIds.length > 0
			? params.admin
					.from('onto_project_members')
					.select('project_id, agent_access')
					.eq('actor_id', actorId)
					.is('removed_at', null)
					.in('project_id', sharedProjectIds)
			: Promise.resolve({ data: [], error: null });

	const [projectAccessResult, permissionResult, memberAgentResult] = await Promise.all([
		params.admin.from('onto_projects').select('id, external_agent_access').in('id', projectIds),
		permissionQuery,
		memberAgentQuery
	]);
	if (projectAccessResult.error || permissionResult.error || memberAgentResult.error) {
		throw new Error(
			projectAccessResult.error?.message ||
				permissionResult.error?.message ||
				memberAgentResult.error?.message ||
				'Failed to resolve connector project access'
		);
	}

	const agentAccessByProject = new Map<string, MemberAgentAccess>();
	for (const row of (memberAgentResult.data ?? []) as Array<{
		project_id?: unknown;
		agent_access?: unknown;
	}>) {
		if (
			typeof row.project_id === 'string' &&
			(row.agent_access === 'off' ||
				row.agent_access === 'read' ||
				row.agent_access === 'write')
		) {
			agentAccessByProject.set(row.project_id, row.agent_access);
		}
	}

	const accessByProject = new Map<string, BuildosProjectExternalAgentAccess>();
	for (const row of projectAccessResult.data ?? []) {
		if (row && typeof row.id === 'string') {
			accessByProject.set(
				row.id,
				row.external_agent_access === 'restricted' ? 'restricted' : 'standard'
			);
		}
	}

	return computeEffectiveAgentProjectScope({
		scope: params.scope,
		projectScopeMode: params.projectScopeMode,
		projects: visibleProjects.map((project) => ({
			id: project.id,
			is_shared: project.is_shared,
			access_level: project.access_level,
			external_agent_access: accessByProject.get(project.id) ?? 'restricted',
			agent_access: project.is_shared ? (agentAccessByProject.get(project.id) ?? 'off') : null
		})),
		permissions: (permissionResult.data ?? []).flatMap(
			(row: { project_id?: unknown; access_mode?: unknown }) =>
				typeof row.project_id === 'string' &&
				(row.access_mode === 'read_only' || row.access_mode === 'read_write')
					? [{ project_id: row.project_id, access_mode: row.access_mode }]
					: []
		)
	});
}

/** Replace the explicit grants for one connector authorization boundary. */
export async function replaceExplicitProjectPermissions(params: {
	admin: any;
	userId: string;
	callerId: string;
	oauthGrantId?: string;
	projectIds: string[];
	accessMode: BuildosAgentProjectAccessMode;
	source?: 'selected' | 'restricted_override' | 'connector_created';
}): Promise<void> {
	const now = new Date().toISOString();
	let revokeQuery = params.admin
		.from('external_agent_project_permissions')
		.update({ revoked_at: now })
		.eq('external_agent_caller_id', params.callerId)
		.is('revoked_at', null);
	revokeQuery = params.oauthGrantId
		? revokeQuery.eq('agent_oauth_grant_id', params.oauthGrantId)
		: revokeQuery.is('agent_oauth_grant_id', null);
	const revokeResult = await revokeQuery;
	if (revokeResult.error) {
		throw new Error(revokeResult.error.message || 'Failed to revoke old project permissions');
	}

	const projectIds = uniqueStrings(params.projectIds);
	if (projectIds.length === 0) return;
	const { error } = await params.admin.from('external_agent_project_permissions').insert(
		projectIds.map((projectId) => ({
			user_id: params.userId,
			external_agent_caller_id: params.callerId,
			agent_oauth_grant_id: params.oauthGrantId ?? null,
			project_id: projectId,
			access_mode: params.accessMode,
			source: params.source ?? 'selected',
			granted_by: params.userId
		}))
	);
	if (error) throw new Error(error.message || 'Failed to save project permissions');
}

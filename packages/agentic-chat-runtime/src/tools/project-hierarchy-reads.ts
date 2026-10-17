// packages/agentic-chat-runtime/src/tools/project-hierarchy-reads.ts
//
// Project hierarchy for the shared read tools (tasker 122, phase 1). On 10-16
// global chat told the owner "projects can't nest" twice: no read tool ever
// showed a parent, so the model inferred the feature didn't exist. This adds
// the parent and sub-projects to project reads with one ids-only read.
//
// Visibility: both ends must be in the viewer's accessible project set (the
// summaries RPC's answer), the same rule as `onto_project_family_v1` and the
// Jev workspace cards. A lookup failure is never fatal: the tool still returns,
// just without hierarchy fields.

import {
	buildProjectHierarchyIndexV1,
	parseProjectFamilyV1,
	PROJECT_HIERARCHY_SUB_PROJECT_LIMIT,
	type ProjectHierarchyIndexV1,
	type ProjectHierarchyRefV1
} from '@buildos/shared-types';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

/**
 * One `id, parent_project_id` read over the accessible ids. `accessible` must
 * be the viewer's whole accessible set (unfiltered summaries), so a hub's count
 * includes children outside the page a list tool returns.
 */
export async function loadProjectHierarchyIndex(
	context: Pick<AgenticChatSharedReadContextV1, 'client' | 'signal'>,
	accessible: ReadonlyArray<{ id: string; name?: unknown }>
): Promise<ProjectHierarchyIndexV1 | null> {
	const ids = accessible
		.map((project) => project.id)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);
	if (ids.length === 0) return null;
	try {
		let query = (context.client as any)
			.from('onto_projects')
			.select('id, parent_project_id')
			.in('id', ids)
			.is('deleted_at', null);
		if (context.signal && typeof query.abortSignal === 'function') {
			query = query.abortSignal(context.signal);
		}
		const { data, error } = await query;
		if (error || !Array.isArray(data)) return null;
		return buildProjectHierarchyIndexV1(data, accessible);
	} catch {
		return null;
	}
}

export type ProjectFamilyReadFieldsV1 = {
	parent?: ProjectHierarchyRefV1;
	sub_project_count?: number;
	sub_projects?: ProjectHierarchyRefV1[];
};

/**
 * Parent and sub-projects of one project the caller already authorized, from
 * `onto_project_family_v1`, which applies the visibility rule itself (a
 * signed-in client resolves its own actor; a service client uses the actor
 * passed). One round trip and no summaries RPC, for reads that load no
 * accessible set. Fails open to no fields.
 */
export async function loadProjectFamilyReadFields(
	context: Pick<AgenticChatSharedReadContextV1, 'client' | 'access'>,
	projectId: string
): Promise<ProjectFamilyReadFieldsV1> {
	try {
		const actorId = await context.access.getActorId();
		const { data, error } = await (context.client as any).rpc('onto_project_family_v1', {
			p_project_id: projectId,
			p_actor_id: actorId
		});
		if (error) return {};
		const family = parseProjectFamilyV1(data);
		if (!family) return {};
		const children = family.children
			.filter((child) => child.id && child.name)
			.map((child) => ({ id: child.id, name: child.name }));
		return {
			...(family.parent?.id && family.parent.name
				? { parent: { id: family.parent.id, name: family.parent.name } }
				: {}),
			...(children.length > 0
				? {
						sub_project_count: children.length,
						sub_projects: children.slice(0, PROJECT_HIERARCHY_SUB_PROJECT_LIMIT)
					}
				: {})
		};
	} catch {
		return {};
	}
}

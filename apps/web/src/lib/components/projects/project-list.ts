// apps/web/src/lib/components/projects/project-list.ts
import {
	PROJECT_STATE_META,
	PROJECT_STATE_ORDER,
	isPrimaryTier,
	normalizeProjectState
} from '$lib/config/project-states';
import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
import type { ProjectState } from '$lib/types/onto';
import { stripEntityReferences } from '$lib/utils/entity-reference-parser';
import { stripMarkdown } from '$lib/utils/markdown-text';

/** Plain labels for a row that is already a link (including its tooltip). */
export function formatProjectResumeCue(value: string | null | undefined): string {
	return stripMarkdown(stripEntityReferences(value ?? ''))
		.replace(/\s+/g, ' ')
		.trim();
}

export type ProjectListScope = 'current' | 'all' | ProjectState;

export type ProjectListSummary = OntologyProjectSummary & {
	has_collaborators: boolean;
	/** Parent project when the viewer can open it (project hierarchy). */
	parent_project_id?: string | null;
};

type ProjectCollaborationFields = Pick<
	OntologyProjectSummary,
	'id' | 'owner_actor_id' | 'is_shared'
>;

interface ActiveProjectMember {
	project_id: string | null;
	actor_id: string | null;
}

export const PROJECT_LIST_SCOPE_OPTIONS = [
	'current',
	'all',
	...PROJECT_STATE_ORDER
] as const satisfies readonly ProjectListScope[];

export function normalizeProjectListScope(value: string | null | undefined): ProjectListScope {
	if (!value || value === 'current') return 'current';
	if (value === 'all') return 'all';

	const normalized = value.trim().toLowerCase() as ProjectState;
	return PROJECT_STATE_ORDER.includes(normalized) ? normalized : 'current';
}

export function getProjectListScopeLabel(scope: ProjectListScope): string {
	if (scope === 'current') return 'Current work';
	if (scope === 'all') return 'All projects';
	return PROJECT_STATE_META[scope].label;
}

export function matchesProjectListScope(
	state: ProjectState | string | null | undefined,
	scope: ProjectListScope
): boolean {
	if (scope === 'all') return true;
	const normalized = normalizeProjectState(state);
	if (scope === 'current') return isPrimaryTier(normalized);
	return normalized === scope;
}

/**
 * Add the collaboration signal used by the launcher without changing the
 * shared project-summary contract. A null member list means the batched
 * lookup failed, so shared-with-me projects remain truthfully identifiable.
 */
export function addProjectCollaborationFlags<T extends ProjectCollaborationFields>(
	projects: readonly T[],
	members: readonly ActiveProjectMember[] | null
): Array<T & { has_collaborators: boolean }> {
	if (members === null) {
		return projects.map((project) => ({
			...project,
			has_collaborators: project.is_shared
		}));
	}

	const actorIdsByProject = new Map<string, Set<string>>();
	for (const member of members) {
		if (!member.project_id || !member.actor_id) continue;
		const actorIds = actorIdsByProject.get(member.project_id) ?? new Set<string>();
		actorIds.add(member.actor_id);
		actorIdsByProject.set(member.project_id, actorIds);
	}

	return projects.map((project) => {
		const actorIds = new Set(actorIdsByProject.get(project.id) ?? []);
		if (project.owner_actor_id) actorIds.add(project.owner_actor_id);

		return {
			...project,
			has_collaborators: project.is_shared || actorIds.size > 1
		};
	});
}

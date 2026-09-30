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

function calendarDayDifference(older: Date, newer: Date): number {
	const olderDay = Date.UTC(older.getFullYear(), older.getMonth(), older.getDate());
	const newerDay = Date.UTC(newer.getFullYear(), newer.getMonth(), newer.getDate());
	return Math.floor((newerDay - olderDay) / 86_400_000);
}

export function formatProjectUpdatedLabel(value: string, nowMs = Date.now()): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Updated recently';

	const diffMs = nowMs - date.getTime();
	if (diffMs < 0) {
		return `Updated ${date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === new Date(nowMs).getFullYear() ? undefined : 'numeric'
		})}`;
	}
	if (diffMs < 60_000) return 'Updated just now';
	if (diffMs < 3_600_000) return `Updated ${Math.floor(diffMs / 60_000)}m ago`;
	if (diffMs < 86_400_000) return `Updated ${Math.floor(diffMs / 3_600_000)}h ago`;

	const now = new Date(nowMs);
	const dayDifference = calendarDayDifference(date, now);
	if (dayDifference === 1) return 'Updated yesterday';
	if (dayDifference > 1 && dayDifference < 7) {
		return `Updated ${date.toLocaleDateString(undefined, { weekday: 'long' })}`;
	}

	return `Updated ${date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
	})}`;
}

export function formatProjectUpdatedTitle(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Updated recently';
	return `Updated ${date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	})}`;
}

export interface NestableProject {
	id: string;
	name: string;
	updated_at: string;
	parent_project_id?: string | null;
}

/** One top-level row of the projects list, with the sub-projects shown under it. */
export interface ProjectListGroup<T extends NestableProject> {
	project: T;
	/** Sub-projects nested under this row (newest first); empty in flat mode. */
	children: T[];
	/** Muted "· parent" label for a sub-project shown as its own row. */
	parentName: string | null;
}

function updatedAtMs(project: NestableProject): number {
	const ms = Date.parse(project.updated_at);
	return Number.isNaN(ms) ? 0 : ms;
}

function parentIdOf(project: NestableProject): string | null {
	const parentId = project.parent_project_id ?? null;
	return parentId && parentId !== project.id ? parentId : null;
}

/**
 * Group sub-projects under their parent when both are in `projects`.
 *
 * - Nested: a parent sorts by the newest activity among itself and its
 *   sub-projects; sub-projects list newest first beneath it. One level only: a
 *   project whose own parent is nested in the list stays a top-level row, so a
 *   malformed chain or cycle never hides a project.
 * - Flat (`flat: true`, e.g. while searching): input order is kept and every
 *   sub-project carries its parent's name instead of nesting.
 * - A sub-project whose parent isn't in `projects` is a normal top-level row; it
 *   still gets the parent label when `lookup` (e.g. the unfiltered list) knows it.
 */
export function nestProjectList<T extends NestableProject>(
	projects: readonly T[],
	options: { flat?: boolean; lookup?: readonly NestableProject[] } = {}
): Array<ProjectListGroup<T>> {
	const namesById = new Map<string, string>();
	for (const project of options.lookup ?? projects) namesById.set(project.id, project.name);
	for (const project of projects) namesById.set(project.id, project.name);
	const labelFor = (project: T): string | null => {
		const parentId = parentIdOf(project);
		return parentId ? (namesById.get(parentId) ?? null) : null;
	};

	if (options.flat) {
		return projects.map((project) => ({
			project,
			children: [],
			parentName: labelFor(project)
		}));
	}

	const inList = new Map(projects.map((project) => [project.id, project]));
	const isNestedChild = (project: NestableProject): boolean => {
		const parentId = parentIdOf(project);
		if (!parentId) return false;
		const parent = inList.get(parentId);
		if (!parent) return false;
		// The parent must itself be top-level here (one level of nesting).
		const grandparentId = parentIdOf(parent);
		return !grandparentId || !inList.has(grandparentId);
	};

	const childrenByParent = new Map<string, T[]>();
	const roots: T[] = [];
	for (const project of projects) {
		if (isNestedChild(project)) {
			const parentId = parentIdOf(project)!;
			const siblings = childrenByParent.get(parentId) ?? [];
			siblings.push(project);
			childrenByParent.set(parentId, siblings);
		} else {
			roots.push(project);
		}
	}

	const order = new Map(projects.map((project, index) => [project.id, index]));
	const byNewest = (a: T, b: T) =>
		updatedAtMs(b) - updatedAtMs(a) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);

	return roots
		.map((project) => {
			const children = (childrenByParent.get(project.id) ?? []).slice().sort(byNewest);
			const activity = Math.max(updatedAtMs(project), ...children.map(updatedAtMs));
			return {
				group: {
					project,
					children,
					parentName: labelFor(project)
				},
				activity
			};
		})
		.sort(
			(a, b) =>
				b.activity - a.activity ||
				(order.get(a.group.project.id) ?? 0) - (order.get(b.group.project.id) ?? 0)
		)
		.map(({ group }) => group);
}

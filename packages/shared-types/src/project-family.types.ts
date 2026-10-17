// packages/shared-types/src/project-family.types.ts
//
// A project's place in the hierarchy, as returned by the `onto_project_family_v1`
// RPC (supabase/migrations/20260930130000_project_hierarchy_shared_shelf.sql).
// Everything is already filtered to what the viewer can read: `parent` is null
// when the viewer can't open the parent, and `shelf` then is empty.

export type ProjectFamilyParentV1 = {
	id: string;
	name: string;
	state_key: string | null;
	/** Whether the viewer may edit the parent (and so its shared docs). */
	can_write: boolean;
	shared_folder_document_id: string | null;
	/** Every child of the parent, including ones the viewer can't open ("shown in N projects"). */
	child_count: number;
	/** Whether the viewer may detach this project from the parent (admin on either side). */
	can_detach: boolean;
};

/** A live document under the parent's "Shared with sub-projects" folder. */
export type ProjectFamilyShelfDocV1 = {
	id: string;
	title: string;
	description: string | null;
	type_key: string;
	state_key: string | null;
	updated_at: string;
	/** Tree parent inside the shared folder; null for the folder's direct children. */
	tree_parent_id: string | null;
	/** 0 for the folder's direct children. */
	depth: number;
};

export type ProjectFamilyChildV1 = {
	id: string;
	name: string;
	state_key: string | null;
	next_step_short: string | null;
	updated_at: string;
	/** Whether the viewer may detach this child (admin on this project or on the child). */
	can_detach: boolean;
};

export type ProjectFamilyV1 = {
	project_id: string;
	parent: ProjectFamilyParentV1 | null;
	shelf: ProjectFamilyShelfDocV1[];
	/** Sub-projects the viewer can open. */
	children: ProjectFamilyChildV1[];
	/** This project's own shared folder (set once it has had a child). */
	own_shared_folder_document_id: string | null;
	/** Every sub-project of this project, including ones the viewer can't open. */
	child_count: number;
};

/** Response of PUT /api/onto/projects/[id]/parent (`onto_project_set_parent_atomic`). */
export type ProjectSetParentResultV1 = {
	project_id: string;
	parent_project_id: string | null;
	previous_parent_project_id: string | null;
	shared_folder_document_id: string | null;
};

const record = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Defensive parse of the RPC's jsonb; returns null when the shape is unusable. */
export function parseProjectFamilyV1(raw: unknown): ProjectFamilyV1 | null {
	const row = record(raw);
	const projectId = str(row?.project_id);
	if (!row || !projectId) return null;
	const parentRow = record(row.parent);
	const parentId = str(parentRow?.id);
	const parent: ProjectFamilyParentV1 | null =
		parentRow && parentId
			? {
					id: parentId,
					name: str(parentRow.name) ?? '',
					state_key: str(parentRow.state_key),
					can_write: parentRow.can_write === true,
					shared_folder_document_id: str(parentRow.shared_folder_document_id),
					child_count: num(parentRow.child_count),
					can_detach: parentRow.can_detach === true
				}
			: null;
	const shelf = parent
		? list(row.shelf).flatMap((item): ProjectFamilyShelfDocV1[] => {
				const doc = record(item);
				const id = str(doc?.id);
				if (!doc || !id) return [];
				return [
					{
						id,
						title: str(doc.title) ?? 'Untitled',
						description: str(doc.description),
						type_key: str(doc.type_key) ?? 'document.default',
						state_key: str(doc.state_key),
						updated_at: str(doc.updated_at) ?? '',
						tree_parent_id: str(doc.tree_parent_id),
						depth: num(doc.depth)
					}
				];
			})
		: [];
	const children = list(row.children).flatMap((item): ProjectFamilyChildV1[] => {
		const child = record(item);
		const id = str(child?.id);
		if (!child || !id) return [];
		return [
			{
				id,
				name: str(child.name) ?? '',
				state_key: str(child.state_key),
				next_step_short: str(child.next_step_short),
				updated_at: str(child.updated_at) ?? '',
				can_detach: child.can_detach === true
			}
		];
	});
	return {
		project_id: projectId,
		parent,
		shelf,
		children,
		own_shared_folder_document_id: str(row.own_shared_folder_document_id),
		child_count: num(row.child_count)
	};
}

// ---------------------------------------------------------------------------
// Hierarchy labels for read payloads (tasker 122, phase 1: tell the truth).
//
// Chat and connector read tools show a project's parent and its sub-projects so
// a model never concludes "projects can't nest" from payloads that hide the
// column. The rule matches `onto_project_family_v1` and the Jev workspace cards:
// both ends of a link must be projects the viewer can open, so a parent or child
// the viewer can't open is never named, and never counted.
// ---------------------------------------------------------------------------

/** A project on the other end of a nesting link. Names only; grants nothing. */
export type ProjectHierarchyRefV1 = { id: string; name: string };

export type ProjectHierarchyIndexV1 = {
	/** Project id → its parent, present only when the viewer can open the parent. */
	parentOf: ReadonlyMap<string, ProjectHierarchyRefV1>;
	/** Project id → the sub-projects the viewer can open, in `accessible` order. */
	childrenOf: ReadonlyMap<string, readonly ProjectHierarchyRefV1[]>;
};

/** Sub-projects listed by name on single-project reads; the count stays exact. */
export const PROJECT_HIERARCHY_SUB_PROJECT_LIMIT = 12;

/**
 * Build the index from `onto_projects` rows (`id, parent_project_id`) read for
 * the viewer's accessible project ids. `accessible` is the viewer's whole
 * accessible set (it supplies every name), so children found outside the page a
 * tool returns still count toward its hubs.
 */
export function buildProjectHierarchyIndexV1(
	rows: unknown,
	accessible: ReadonlyArray<{ id: string; name?: unknown }>
): ProjectHierarchyIndexV1 {
	const names = new Map<string, string>();
	for (const project of accessible) {
		const name = typeof project.name === 'string' ? project.name.trim() : '';
		if (typeof project.id === 'string' && project.id && name) names.set(project.id, name);
	}
	const parentIdOf = new Map<string, string>();
	for (const row of list(rows)) {
		const entry = record(row);
		const id = str(entry?.id);
		const parentId = str(entry?.parent_project_id);
		if (!id || !parentId || id === parentId) continue;
		if (names.has(id) && names.has(parentId)) parentIdOf.set(id, parentId);
	}
	const parentOf = new Map<string, ProjectHierarchyRefV1>();
	const childrenOf = new Map<string, ProjectHierarchyRefV1[]>();
	for (const project of accessible) {
		const parentId = parentIdOf.get(project.id);
		if (!parentId) continue;
		parentOf.set(project.id, { id: parentId, name: names.get(parentId)! });
		const siblings = childrenOf.get(parentId) ?? [];
		siblings.push({ id: project.id, name: names.get(project.id)! });
		childrenOf.set(parentId, siblings);
	}
	return { parentOf, childrenOf };
}

/**
 * The hierarchy fields one project carries in a read payload. Fields appear only
 * when they say something (no `parent: null`, no zero counts), so unnested
 * projects cost nothing. `subProjectLimit` > 0 also lists sub-projects by name.
 */
export function projectHierarchyFieldsV1(
	index: ProjectHierarchyIndexV1 | null | undefined,
	projectId: string,
	options: { subProjectLimit?: number } = {}
): {
	parent?: ProjectHierarchyRefV1;
	sub_project_count?: number;
	sub_projects?: ProjectHierarchyRefV1[];
} {
	if (!index) return {};
	const parent = index.parentOf.get(projectId);
	const children = index.childrenOf.get(projectId) ?? [];
	const limit = Math.max(0, Math.floor(options.subProjectLimit ?? 0));
	return {
		...(parent ? { parent: { ...parent } } : {}),
		...(children.length > 0 ? { sub_project_count: children.length } : {}),
		...(children.length > 0 && limit > 0
			? { sub_projects: children.slice(0, limit).map((child) => ({ ...child })) }
			: {})
	};
}

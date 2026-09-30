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

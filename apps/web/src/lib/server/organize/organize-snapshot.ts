// apps/web/src/lib/server/organize/organize-snapshot.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { parseDocStructure } from '$lib/services/ontology/doc-structure.service';
import { tryGetProjectFamily } from '$lib/services/ontology/project-hierarchy.service';
import type { ProjectFamilyV1 } from '@buildos/shared-types';
import type { OrganizeProject } from '$lib/components/organize/organize-plan';

export class OrganizeSnapshotError extends Error {
	constructor(
		message: string,
		readonly status: 403 | 404 | 409 | 500 = 500
	) {
		super(message);
	}
}

const PAGE_SIZE = 500;

/** Fail rather than silently drop records at PostgREST's row limit. */
async function readAll<T>(
	read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await read(from, from + PAGE_SIZE - 1);
		if (error || !data) throw new OrganizeSnapshotError('Could not load project items.');
		rows.push(...data);
		if (data.length < PAGE_SIZE) return rows;
		if (rows.length >= 10_000)
			throw new OrganizeSnapshotError(
				'This project is too large for the Organize preview.',
				409
			);
	}
}

/** Session client only. Access to a child never implies access to its parent.
 *
 * `writeChecked` is for Organize writes (preview/apply/undo), whose caller has
 * already verified edit access to every project: it skips the read check, the
 * write check and the family lookup (navigation hints only), and loads the row
 * and its items in one round trip. The page and snapshot endpoint omit it.
 */
export async function loadOrganizeSnapshot(
	client: SupabaseClient<Database>,
	projectId: string,
	options: { writeChecked?: boolean } = {}
) {
	const writeChecked = options.writeChecked === true;
	if (!writeChecked) {
		const { data: member, error: accessError } = await client.rpc(
			'current_actor_has_project_member_access',
			{
				p_project_id: projectId,
				p_required_access: 'read'
			}
		);
		if (accessError) throw new OrganizeSnapshotError('Could not check project access.');
		if (!member)
			throw new OrganizeSnapshotError('You do not have access to this project.', 403);
	}

	const readProject = () =>
		client
			.from('onto_projects')
			.select('id, name, updated_at, doc_structure, shared_folder_document_id, archived_at')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
	const readItems = () =>
		Promise.all([
			readAll((from, to) =>
				client
					.from('onto_documents')
					.select('id, title, type_key, updated_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.neq('state_key', 'archived')
					.order('id')
					.range(from, to)
			),
			readAll((from, to) =>
				client
					.from('onto_tasks')
					.select('id, title, state_key, updated_at, start_at, due_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null)
					.order('id')
					.range(from, to)
			)
		]);
	function requireRow(result: Awaited<ReturnType<typeof readProject>>) {
		if (result.error) throw new OrganizeSnapshotError('Could not load project.');
		if (!result.data) throw new OrganizeSnapshotError('Project not found.', 404);
		if (result.data.archived_at !== null)
			throw new OrganizeSnapshotError('Archived projects cannot be organized.', 409);
		return result.data;
	}
	function build(
		row: ReturnType<typeof requireRow>,
		canWrite: boolean,
		[documents, tasks]: Awaited<ReturnType<typeof readItems>>,
		family: ProjectFamilyV1 | null
	) {
		const project: OrganizeProject = {
			id: row.id,
			name: row.name,
			updated_at: row.updated_at,
			can_write: canWrite,
			shared_folder_document_id: row.shared_folder_document_id,
			shared_with_count: family?.child_count ?? null,
			structure: parseDocStructure(row.doc_structure),
			documents: documents.map((doc) => ({
				...doc,
				title: doc.title || 'Untitled document'
			})),
			tasks
		};
		return {
			project,
			// Only the family RPC's filtered records are allowed into navigation hints.
			related_projects: [
				...(family?.parent ? [{ id: family.parent.id, name: family.parent.name }] : []),
				...(family?.children ?? []).map((child) => ({ id: child.id, name: child.name }))
			]
		};
	}

	if (writeChecked) {
		const [projectResult, items] = await Promise.all([readProject(), readItems()]);
		return build(requireRow(projectResult), true, items, null);
	}

	const [projectResult, writeResult] = await Promise.all([
		readProject(),
		client.rpc('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: 'write'
		})
	]);
	if (writeResult.error) throw new OrganizeSnapshotError('Could not load project.');
	const row = requireRow(projectResult);
	const [items, family] = await Promise.all([
		readItems(),
		tryGetProjectFamily(client, projectId)
	]);
	return build(row, writeResult.data === true, items, family);
}

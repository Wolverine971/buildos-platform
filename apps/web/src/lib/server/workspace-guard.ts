// apps/web/src/lib/server/workspace-guard.ts
//
// The Workspace (onto_projects.kind = 'workspace') holds a person's loose notes, docs and
// tasks. It is not a project: project counts, onboarding gates and paid reviews, audits
// and stewards skip it (docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type Client = SupabaseClient<Database>;

/** True when this project id is a Workspace. A failed read counts as "not a Workspace". */
export async function isWorkspaceProjectId(client: Client, projectId: string): Promise<boolean> {
	const { data, error } = await client
		.from('onto_projects')
		.select('kind')
		.eq('id', projectId)
		.maybeSingle();
	return !error && data?.kind === 'workspace';
}

/**
 * Whether this actor's Workspace holds at least one live doc or task. Onboarding accepts that
 * in place of a first project ("dump it in the Workspace" instead of forcing a project).
 */
export async function workspaceHasLiveItems(client: Client, actorId: string): Promise<boolean> {
	const { data: workspace, error } = await client
		.from('onto_projects')
		.select('id')
		.eq('created_by', actorId)
		.eq('kind', 'workspace')
		.is('deleted_at', null)
		.maybeSingle();
	if (error || !workspace) return false;

	const liveCount = (table: 'onto_documents' | 'onto_tasks') =>
		client
			.from(table)
			.select('id', { count: 'exact', head: true })
			.eq('project_id', workspace.id)
			.is('deleted_at', null)
			.is('archived_at', null);
	const [documents, tasks] = await Promise.all([
		liveCount('onto_documents'),
		liveCount('onto_tasks')
	]);
	return (documents.count ?? 0) > 0 || (tasks.count ?? 0) > 0;
}

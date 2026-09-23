// packages/agentic-chat-runtime/src/context-finder/load.ts
//
// One loader for every host. The caller supplies the authority: the web passes the user's
// RLS-scoped client; the worker passes its service client after the workflow access check.
import type { ContextFinderProjectV1 } from './packets';

type Query = {
	select(columns: string): Query;
	eq(column: string, value: string): Query;
	is(column: string, value: null): Query;
	order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Query;
	limit(count: number): Query;
	abortSignal(signal: AbortSignal): Query;
	maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
	then: PromiseLike<{ data: unknown; error: { message?: string } | null }>['then'];
};
export type ContextFinderReadClient = { from(table: string): Query };

/** Bounds per family; larger projects rank their most recently updated records. */
export const CONTEXT_FINDER_LOAD_LIMITS = Object.freeze({
	documents: 300,
	tasks: 400,
	goals: 100,
	plans: 100,
	milestones: 100,
	risks: 100
});

const FAMILIES = [
	['documents', 'onto_documents', 'id,title,description,type_key,content,updated_at,created_at'],
	['tasks', 'onto_tasks', 'id,title,state_key,priority,due_at,description,updated_at,created_at'],
	['goals', 'onto_goals', 'id,name,state_key,target_date,description,updated_at,created_at'],
	['plans', 'onto_plans', 'id,name,state_key,description,updated_at,created_at'],
	[
		'milestones',
		'onto_milestones',
		'id,title,state_key,due_at,description,updated_at,created_at'
	],
	['risks', 'onto_risks', 'id,title,state_key,impact,probability,content,updated_at,created_at']
] as const;

export class ContextFinderLoadError extends Error {
	constructor(readonly table: string) {
		super(`Context finder could not read ${table}`);
		this.name = 'ContextFinderLoadError';
	}
}

/** Seven parallel reads scoped to one project; deleted and archived records are excluded. */
export async function loadContextFinderProject(
	client: ContextFinderReadClient,
	projectId: string,
	signal: AbortSignal
): Promise<ContextFinderProjectV1> {
	const project = client
		.from('onto_projects')
		.select('id,name,description')
		.eq('id', projectId)
		.is('deleted_at', null)
		.abortSignal(signal)
		.maybeSingle();
	const families = FAMILIES.map(([key, table, columns]) =>
		client
			.from(table)
			.select(columns)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false, nullsFirst: false })
			.limit(CONTEXT_FINDER_LOAD_LIMITS[key])
			.abortSignal(signal)
	);
	const [projectRow, ...rows] = await Promise.all([project, ...families]);
	const row = projectRow.data as { id?: string; name?: string; description?: string } | null;
	if (projectRow.error || !row?.id) throw new ContextFinderLoadError('onto_projects');
	const loaded = Object.fromEntries(
		FAMILIES.map(([key, table], i) => {
			const result = rows[i]!;
			if (result.error || !Array.isArray(result.data))
				throw new ContextFinderLoadError(table);
			return [key, result.data as Record<string, unknown>[]];
		})
	) as Omit<ContextFinderProjectV1, 'project'>;
	return {
		project: { id: row.id, name: String(row.name ?? ''), description: row.description ?? null },
		...loaded
	};
}

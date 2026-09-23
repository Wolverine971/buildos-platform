// packages/agentic-chat-runtime/src/context-finder/load.ts
//
// One loader for every host. The caller supplies the authority: the web passes the user's
// RLS-scoped client; the worker passes its service client after the workflow access check.
import type { ContextFinderProjectV1 } from './packets';
import { START_HERE_TYPE_KEY } from './finder';
import type { WorkspaceProjectInputV1 } from './workspace';

type Query = {
	select(columns: string): Query;
	eq(column: string, value: string): Query;
	in(column: string, values: readonly string[]): Query;
	is(column: string, value: null): Query;
	order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Query;
	limit(count: number): Query;
	abortSignal(signal: AbortSignal): Query;
	maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
	then: PromiseLike<{ data: unknown; error: { message?: string } | null }>['then'];
};
export type ContextFinderReadClient = { from(table: string): Query };
type RpcCall = {
	abortSignal(
		signal: AbortSignal
	): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};
/** Global chat also needs the accessible-projects RPC. */
export type WorkspaceFinderReadClient = ContextFinderReadClient & {
	rpc(fn: string, args: Record<string, unknown>): RpcCall;
};

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

/** Bounds for the global card load: titles only, so these stay cheap. */
export const WORKSPACE_LOAD_LIMITS = Object.freeze({
	projects: 200,
	rowsPerFamily: 4_000,
	/** START HERE feeds the project brief and the portfolio pulse, not the cards. */
	startHereChars: 12_000
});

const WORKSPACE_FAMILIES = [
	['documents', 'onto_documents', 'id,project_id,title,type_key,updated_at'],
	['tasks', 'onto_tasks', 'id,project_id,title,state_key,updated_at'],
	['goals', 'onto_goals', 'id,project_id,name,state_key,updated_at'],
	['plans', 'onto_plans', 'id,project_id,name,state_key,updated_at'],
	['milestones', 'onto_milestones', 'id,project_id,title,state_key,updated_at'],
	['risks', 'onto_risks', 'id,project_id,title,state_key,updated_at']
] as const;

/**
 * Global chat's hop-1 input: every project the user can access (the same owner-or-active-member
 * rule as global chat, via `get_onto_project_summaries_v1`), with record titles and each
 * project's START HERE body. The caller passes the service client; access is decided here by
 * the RPC, never by the caller's client.
 */
export async function loadWorkspaceFinderProjects(
	client: WorkspaceFinderReadClient,
	userId: string,
	signal: AbortSignal
): Promise<WorkspaceProjectInputV1[]> {
	const actor = await client
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.abortSignal(signal)
		.maybeSingle();
	const actorId = (actor.data as { id?: string } | null)?.id;
	if (actor.error || !actorId) throw new ContextFinderLoadError('onto_actors');
	const summaries = await client
		.rpc('get_onto_project_summaries_v1', { p_actor_id: actorId })
		.abortSignal(signal);
	if (summaries.error || !Array.isArray(summaries.data))
		throw new ContextFinderLoadError('get_onto_project_summaries_v1');
	const projects = (summaries.data as Record<string, unknown>[])
		.filter((row) => typeof row.id === 'string')
		.sort((a, b) => Date.parse(String(b.updated_at)) - Date.parse(String(a.updated_at)))
		.slice(0, WORKSPACE_LOAD_LIMITS.projects);
	if (!projects.length) return [];
	const ids = projects.map((row) => String(row.id));
	const [startHere, ...rows] = await Promise.all([
		client
			.from('onto_documents')
			.select('id,project_id,content,updated_at')
			.in('project_id', ids)
			.eq('type_key', START_HERE_TYPE_KEY)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false })
			.limit(WORKSPACE_LOAD_LIMITS.projects * 3)
			.abortSignal(signal),
		...WORKSPACE_FAMILIES.map(([, table, columns]) =>
			client
				.from(table)
				.select(columns)
				.in('project_id', ids)
				.is('deleted_at', null)
				.is('archived_at', null)
				.order('updated_at', { ascending: false, nullsFirst: false })
				.limit(WORKSPACE_LOAD_LIMITS.rowsPerFamily)
				.abortSignal(signal)
		)
	]);
	if (startHere.error || !Array.isArray(startHere.data))
		throw new ContextFinderLoadError('onto_documents');
	const bodies = new Map<string, string>();
	for (const row of startHere.data as Record<string, unknown>[]) {
		const key = String(row.id);
		if (!bodies.has(key))
			bodies.set(
				key,
				String(row.content ?? '').slice(0, WORKSPACE_LOAD_LIMITS.startHereChars)
			);
	}
	const byProject = new Map<string, WorkspaceProjectInputV1>(
		projects.map((row) => [
			String(row.id),
			{
				project: {
					id: String(row.id),
					name: String(row.name ?? ''),
					description: (row.description as string | null) ?? null,
					state_key: (row.state_key as string | null) ?? null,
					next_step_short: (row.next_step_short as string | null) ?? null,
					updated_at: (row.updated_at as string | null) ?? null
				},
				documents: [],
				tasks: [],
				goals: [],
				plans: [],
				milestones: [],
				risks: []
			}
		])
	);
	WORKSPACE_FAMILIES.forEach(([key, table], i) => {
		const result = rows[i]!;
		if (result.error || !Array.isArray(result.data)) throw new ContextFinderLoadError(table);
		for (const row of result.data as Record<string, unknown>[]) {
			const target = byProject.get(String(row.project_id));
			if (!target) continue;
			const content = key === 'documents' ? bodies.get(String(row.id)) : undefined;
			target[key].push(content === undefined ? row : { ...row, content });
		}
	});
	return [...byProject.values()];
}

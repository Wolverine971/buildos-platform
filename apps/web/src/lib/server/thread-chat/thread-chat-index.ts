// apps/web/src/lib/server/thread-chat/thread-chat-index.ts
//
// The project index a thread starts from, loaded outline-first (tasker 150): documents come
// with their stored heading outline, never their text. Only a document whose stored outline
// is missing or out of date has its text read, so the headings can be worked out; that text
// is never sent to the model. Text for a picked document loads later, on request.
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ContextFinderDocumentText,
	ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

const LIMITS = { documents: 300, tasks: 400, goals: 100, plans: 100, milestones: 100, risks: 100 };

const FAMILIES = [
	[
		'documents',
		'onto_documents',
		'id,title,description,type_key,state_key,outline,content_hash,updated_at,created_at,table:props->table'
	],
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

export type ProjectIndexStats = {
	counts: Record<string, number>;
	/** Documents whose headings came from the stored outline. */
	outlined: number;
	/** Documents whose text had to be read to work out their headings (outline missing/stale). */
	fallback: number;
	/** Characters of document text read for those fallbacks (never sent to a model). */
	fallbackChars: number;
	ms: number;
};

export type ProjectIndexLoad = { project: ContextFinderProjectV1; stats: ProjectIndexStats };

function outlineIsCurrent(row: Row): boolean {
	const outline = row.outline as { content_hash?: unknown; nodes?: unknown } | null;
	return (
		!!outline &&
		Array.isArray(outline.nodes) &&
		typeof outline.content_hash === 'string' &&
		outline.content_hash === row.content_hash
	);
}

/** Reads document text for the given ids, scoped to the project. */
export function documentTextSource(session: Client, projectId: string) {
	return async (
		ids: readonly string[],
		signal?: AbortSignal
	): Promise<Map<string, ContextFinderDocumentText>> => {
		const out = new Map<string, ContextFinderDocumentText>();
		if (!ids.length) return out;
		let query = session
			.from('onto_documents')
			.select('id,content,content_hash')
			.eq('project_id', projectId)
			.in('id', [...ids]);
		if (signal) query = query.abortSignal(signal);
		const { data, error } = await query;
		if (error) throw new Error(`Could not read document text: ${error.message}`);
		for (const row of data ?? []) {
			out.set(row.id, { content: row.content ?? '', contentHash: row.content_hash ?? null });
		}
		return out;
	};
}

export async function loadProjectIndex(
	session: Client,
	projectId: string,
	signal: AbortSignal
): Promise<ProjectIndexLoad> {
	const startedAt = performance.now();
	const projectQuery = session
		.from('onto_projects')
		.select('id,name,description')
		.eq('id', projectId)
		.is('deleted_at', null)
		.abortSignal(signal)
		.maybeSingle();
	const familyQueries = FAMILIES.map(([key, table, columns]) =>
		session
			.from(table)
			.select(columns)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('updated_at', { ascending: false, nullsFirst: false })
			.limit(LIMITS[key])
			.abortSignal(signal)
	);
	const [projectRow, ...results] = await Promise.all([projectQuery, ...familyQueries]);
	if (projectRow.error || !projectRow.data) throw new Error('Could not read the project');

	const loaded: Record<string, Row[]> = {};
	FAMILIES.forEach(([key, table], index) => {
		const result = results[index]!;
		if (result.error) throw new Error(`Could not read ${table}`);
		const rows = (result.data ?? []) as unknown as Row[];
		loaded[key] =
			key === 'documents' ? rows.filter((row) => row.state_key !== 'archived') : rows;
	});

	// Headings for documents without a current stored outline: read their text once, here.
	const text = documentTextSource(session, projectId);
	const stale = loaded.documents!.filter((row) => !row.table && !outlineIsCurrent(row));
	let fallbackChars = 0;
	if (stale.length) {
		const bodies = await text(
			stale.map((row) => String(row.id)),
			signal
		);
		for (const row of stale) {
			const body = bodies.get(String(row.id));
			if (!body) continue;
			row.content = body.content;
			fallbackChars += body.content.length;
		}
	}

	const project: ContextFinderProjectV1 = {
		project: {
			id: projectRow.data.id,
			name: projectRow.data.name ?? '',
			description: projectRow.data.description ?? null
		},
		documents: loaded.documents!,
		tasks: loaded.tasks!,
		goals: loaded.goals!,
		plans: loaded.plans!,
		milestones: loaded.milestones!,
		risks: loaded.risks!,
		documentText: text
	};
	return {
		project,
		stats: {
			counts: {
				tasks: project.tasks.length,
				goals: project.goals.length,
				milestones: project.milestones.length,
				docs: project.documents.length,
				plans: project.plans.length,
				risks: project.risks.length
			},
			outlined: project.documents.length - stale.length,
			fallback: stale.length,
			fallbackChars,
			ms: Math.round(performance.now() - startedAt)
		}
	};
}

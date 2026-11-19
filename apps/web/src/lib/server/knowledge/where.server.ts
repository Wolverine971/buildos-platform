// apps/web/src/lib/server/knowledge/where.server.ts
//
// "Where it shows up" on the knowledge page: for each entry, the projects, tasks and documents
// that name it, with the quote that named it. One call per page of rows; a project filter
// ("everything in Cadre") reads the same links from the project's side.
//
// Every read uses the caller's client: links are owner-only (RLS), and a task or doc the caller
// can no longer open simply drops out, as in loadLinkedRecords.

import {
	emptyWhere,
	type KnowledgeWhere,
	type KnowledgeWhereProject,
	type KnowledgeWhereRecord
} from '$lib/components/knowledge/where-types';

type Db = any;

/** PostgREST puts `.in()` lists in the URL; keep each request well under the limit. */
const CHUNK = 150;
const MAX_LINKS = 3000;

async function inChunks<T>(
	ids: string[],
	read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
	if (!ids.length) return [];
	const chunks: string[][] = [];
	for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
	const results = await Promise.all(chunks.map((chunk) => read(chunk)));
	const out: T[] = [];
	for (const result of results) {
		if (result.error) throw new Error('Could not read linked records');
		out.push(...(result.data ?? []));
	}
	return out;
}

type LinkRow = {
	entity_id: string;
	record_kind: 'task' | 'document' | 'project';
	record_id: string;
	quote: string | null;
	created_at: string;
};
type RecordRow = { id: string; title: string; project_id: string | null; state_key: string | null };

const DONE_STATES = new Set(['done', 'completed', 'archived', 'cancelled', 'canceled']);

/** Titles + project names for linked tasks, docs and projects, dropping what the caller can't open. */
async function loadRecords(db: Db, links: LinkRow[]) {
	const ids = (kind: LinkRow['record_kind']) => [
		...new Set(links.filter((l) => l.record_kind === kind).map((l) => l.record_id))
	];
	const [tasks, docs, directProjects] = await Promise.all([
		inChunks<RecordRow>(ids('task'), (chunk) =>
			db
				.from('onto_tasks')
				.select('id, title, project_id, state_key')
				.in('id', chunk)
				.is('deleted_at', null)
		),
		inChunks<RecordRow>(ids('document'), (chunk) =>
			db
				.from('onto_documents')
				.select('id, title, project_id, state_key')
				.in('id', chunk)
				.is('deleted_at', null)
		),
		inChunks<{ id: string; name: string }>(ids('project'), (chunk) =>
			db.from('onto_projects').select('id, name').in('id', chunk).is('deleted_at', null)
		)
	]);
	const projectNames = new Map(directProjects.map((p) => [p.id, p.name]));
	const missing = [
		...new Set(
			[...tasks, ...docs]
				.map((r) => r.project_id)
				.filter((id): id is string => Boolean(id) && !projectNames.has(id!))
		)
	];
	const more = await inChunks<{ id: string; name: string }>(missing, (chunk) =>
		db.from('onto_projects').select('id, name').in('id', chunk).is('deleted_at', null)
	);
	for (const p of more) projectNames.set(p.id, p.name);
	return {
		tasks: new Map(tasks.map((r) => [r.id, r])),
		docs: new Map(docs.map((r) => [r.id, r])),
		projectNames
	};
}

function buildWhere(
	links: LinkRow[],
	records: Awaited<ReturnType<typeof loadRecords>>
): Map<string, KnowledgeWhere> {
	const out = new Map<string, KnowledgeWhere>();
	const projectsByEntity = new Map<string, Map<string, KnowledgeWhereProject>>();

	const touchProject = (entityId: string, projectId: string, quote: string | null) => {
		const name = records.projectNames.get(projectId);
		if (!name) return; // deleted or not shared with the caller
		let byId = projectsByEntity.get(entityId);
		if (!byId) projectsByEntity.set(entityId, (byId = new Map()));
		const existing = byId.get(projectId);
		if (existing) {
			existing.count += 1;
			existing.quote ??= quote;
		} else byId.set(projectId, { id: projectId, name, count: 1, quote });
	};

	for (const link of links) {
		let where = out.get(link.entity_id);
		if (!where) out.set(link.entity_id, (where = emptyWhere()));
		if (link.record_kind === 'project') {
			touchProject(link.entity_id, link.record_id, link.quote);
			continue;
		}
		const rec = (link.record_kind === 'task' ? records.tasks : records.docs).get(
			link.record_id
		);
		if (!rec) continue;
		const projectId = rec.project_id;
		const item: KnowledgeWhereRecord = {
			id: rec.id,
			kind: link.record_kind,
			title: rec.title?.trim() || 'Untitled',
			project_id: projectId,
			project_name: projectId ? (records.projectNames.get(projectId) ?? null) : null,
			done: DONE_STATES.has((rec.state_key ?? '').toLowerCase()),
			quote: link.quote
		};
		(link.record_kind === 'task' ? where.tasks : where.documents).push(item);
		if (projectId) touchProject(link.entity_id, projectId, null);
	}

	for (const [entityId, where] of out) {
		// Open work first; links arrive newest first, so each group stays newest first.
		where.tasks.sort((a, b) => Number(a.done) - Number(b.done));
		where.projects = [...(projectsByEntity.get(entityId)?.values() ?? [])].sort(
			(a, b) => b.count - a.count || a.name.localeCompare(b.name)
		);
	}
	return out;
}

/** Where each of these entries shows up. Entries with no links come back empty. */
export async function loadWhereForEntities(
	db: Db,
	userId: string,
	entityIds: string[]
): Promise<Record<string, KnowledgeWhere>> {
	const result: Record<string, KnowledgeWhere> = {};
	if (!entityIds.length) return result;
	const { data, error } = await db
		.from('knowledge_record_links')
		.select('entity_id, record_kind, record_id, quote, created_at')
		.eq('owner_user_id', userId)
		.in('entity_id', entityIds)
		.in('record_kind', ['task', 'document', 'project'])
		.order('created_at', { ascending: false })
		.limit(MAX_LINKS);
	if (error) throw new Error('Could not read where entries show up');
	const links = (data ?? []) as LinkRow[];
	const where = buildWhere(links, await loadRecords(db, links));
	for (const id of entityIds) result[id] = where.get(id) ?? emptyWhere();
	return result;
}

/**
 * Everything linked to one project (the project itself, its tasks, its docs), as list rows plus
 * their "where" so the page can show the same columns. Archived and merged entries stay out.
 */
export async function loadProjectEntries(db: Db, userId: string, projectId: string) {
	const [project, tasks, docs] = await Promise.all([
		db
			.from('onto_projects')
			.select('id, name')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle(),
		db
			.from('onto_tasks')
			.select('id')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.limit(2000),
		db
			.from('onto_documents')
			.select('id')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.limit(2000)
	]);
	if (project.error || tasks.error || docs.error) throw new Error('Could not read the project');
	if (!project.data) return null;

	const recordIds = [
		projectId,
		...((tasks.data ?? []) as Array<{ id: string }>).map((r) => r.id),
		...((docs.data ?? []) as Array<{ id: string }>).map((r) => r.id)
	];
	const links = await inChunks<{ entity_id: string }>(recordIds, (chunk) =>
		db
			.from('knowledge_record_links')
			.select('entity_id')
			.eq('owner_user_id', userId)
			.in('record_kind', ['task', 'document', 'project'])
			.in('record_id', chunk)
	);
	const entityIds = [...new Set(links.map((l) => l.entity_id))];
	const entities = await inChunks<{
		id: string;
		kind: string;
		name: string;
		summary: string | null;
		scope: string;
		is_self: boolean;
		image_url: string | null;
		status: string;
		enriched_at: string | null;
		updated_at: string;
	}>(entityIds, (chunk) =>
		db
			.from('knowledge_entities')
			.select(
				'id, kind, name, summary, scope, is_self, image_url, status, enriched_at, updated_at'
			)
			.in('id', chunk)
			.eq('status', 'active')
	);
	const rows = entities
		.map(({ status: _status, enriched_at, ...row }) => ({ ...row, researched_at: enriched_at }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const where = await loadWhereForEntities(
		db,
		userId,
		rows.map((r) => r.id)
	);
	return { project: project.data as { id: string; name: string }, entities: rows, where };
}

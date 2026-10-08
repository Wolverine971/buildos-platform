// apps/web/src/lib/server/task-entities/task-entity-store.ts
//
// Reads and status changes for task entities (onto_task_entities, migration 20261007120000).
// Both run on the caller's user-scoped client: RLS shows a task's entities to members who can
// read its project, and lets members who can write it confirm, dismiss or restore them (a
// column grant limits that update to status). The worker writes everything else.
import {
	type TaskEntityKind,
	type TaskEntityRecord,
	type TaskEntityStatus,
	entityTextKey,
	formatPhone
} from '@buildos/shared-agent-ops/task-entities';

export const TASK_ENTITY_COLUMNS =
	'id, task_id, project_id, kind, natural_key, value, display, role, about, quote, confidence, source, status, in_text, position, data, source_hash, extractor_version, status_changed_at, created_at, updated_at';

export type TaskEntityStateRow = {
	task_id: string;
	outcome: 'extracted' | 'empty' | 'failed';
	entity_count: number;
	extracted_at: string;
};

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null };
type LooseQuery<T> = PromiseLike<QueryResult<T>> & {
	select(columns: string): LooseQuery<T>;
	in(column: string, values: string[]): LooseQuery<T>;
	eq(column: string, value: string): LooseQuery<T>;
	neq(column: string, value: string): LooseQuery<T>;
	is(column: string, value: null): LooseQuery<T>;
	limit(count: number): LooseQuery<T>;
	order(column: string, options?: { ascending?: boolean }): LooseQuery<T>;
	update(values: Record<string, unknown>): LooseQuery<T>;
	maybeSingle(): PromiseLike<QueryResult<T extends Array<infer R> ? R : T>>;
};
/** The two tables are not in the generated Database types until `pnpm gen:all` runs. */
type LooseClient = { from<T = unknown>(table: string): LooseQuery<T> };

export const TASK_ENTITY_STATUSES: readonly TaskEntityStatus[] = [
	'suggested',
	'confirmed',
	'dismissed'
];
export const MAX_TASK_IDS_PER_READ = 100;

const loose = (supabase: unknown) => supabase as LooseClient;

/** Entities and read state for up to 100 tasks the caller can read; others come back empty. */
export async function loadTaskEntities(
	supabase: unknown,
	taskIds: string[]
): Promise<{ entities: TaskEntityRecord[]; states: TaskEntityStateRow[] }> {
	const ids = [...new Set(taskIds)].slice(0, MAX_TASK_IDS_PER_READ);
	if (!ids.length) return { entities: [], states: [] };
	const db = loose(supabase);
	const [entities, states] = await Promise.all([
		db
			.from<TaskEntityRecord[]>('onto_task_entities')
			.select(TASK_ENTITY_COLUMNS)
			.in('task_id', ids)
			.order('position', { ascending: true }),
		db
			.from<TaskEntityStateRow[]>('onto_task_entity_state')
			.select('task_id, outcome, entity_count, extracted_at')
			.in('task_id', ids)
	]);
	if (entities.error) throw new Error(`Could not load task entities: ${entities.error.message}`);
	if (states.error) throw new Error(`Could not load task entity state: ${states.error.message}`);
	return { entities: entities.data ?? [], states: states.data ?? [] };
}

/** Sets one entity's status. Null when the row is missing or the caller may not change it. */
export async function setTaskEntityStatus(
	supabase: unknown,
	entityId: string,
	status: TaskEntityStatus,
	now = new Date()
): Promise<TaskEntityRecord | null> {
	const stamp = now.toISOString();
	const { data, error } = await loose(supabase)
		.from<TaskEntityRecord[]>('onto_task_entities')
		.update({ status, status_changed_at: stamp, updated_at: stamp })
		.eq('id', entityId)
		.select(TASK_ENTITY_COLUMNS)
		.maybeSingle();
	if (error) throw new Error(`Could not update task entity: ${error.message}`);
	return (data as TaskEntityRecord | null) ?? null;
}

export type RelatedTaskEntityTask = {
	id: string;
	title: string;
	project_id: string;
	project_name: string | null;
	state_key: string | null;
};

export type RelatedTaskEntityContact = {
	kind: 'phone' | 'email' | 'link' | 'place';
	value: string;
	display: string;
	task_id: string;
};

export const RELATED_TASK_LIMIT = 8;
const RELATED_ROW_SCAN = 60;

/**
 * Other tasks the caller can read that name the same person, organization or place (same kind
 * and natural key), newest first, and the numbers, emails and addresses those tasks tie to it.
 * This is how a phone number written on one task follows the person to the next.
 */
export async function loadRelatedTaskEntities(
	supabase: unknown,
	params: { kind: TaskEntityKind; key: string; excludeTaskId: string }
): Promise<{
	tasks: RelatedTaskEntityTask[];
	contacts: RelatedTaskEntityContact[];
	total: number;
}> {
	const db = loose(supabase);
	const { data: matches, error } = await db
		.from<Array<{ task_id: string; updated_at: string }>>('onto_task_entities')
		.select('task_id, updated_at')
		.eq('kind', params.kind)
		.eq('natural_key', params.key)
		.neq('status', 'dismissed')
		.neq('task_id', params.excludeTaskId)
		.order('updated_at', { ascending: false })
		.limit(RELATED_ROW_SCAN);
	if (error) throw new Error(`Could not load related entities: ${error.message}`);
	const taskIds = [...new Set((matches ?? []).map((row) => row.task_id))];
	if (!taskIds.length) return { tasks: [], contacts: [], total: 0 };

	const [tasks, contacts] = await Promise.all([
		db
			.from<
				Array<{ id: string; title: string; project_id: string; state_key: string | null }>
			>('onto_tasks')
			.select('id, title, project_id, state_key')
			.in('id', taskIds)
			.is('deleted_at', null),
		db
			.from<
				Array<Pick<TaskEntityRecord, 'task_id' | 'kind' | 'value' | 'display' | 'about'>>
			>('onto_task_entities')
			.select('task_id, kind, value, display, about, role, status')
			.in('task_id', taskIds)
			.in('kind', ['phone', 'email', 'link', 'place'])
			.neq('status', 'dismissed')
	]);
	if (tasks.error) throw new Error(`Could not load related tasks: ${tasks.error.message}`);
	if (contacts.error)
		throw new Error(`Could not load related contacts: ${contacts.error.message}`);

	const liveTasks = (tasks.data ?? []).sort(
		(a, b) => taskIds.indexOf(a.id) - taskIds.indexOf(b.id)
	);
	const live = new Set(liveTasks.map((task) => task.id));
	const shown = liveTasks.slice(0, RELATED_TASK_LIMIT);
	const projectIds = [...new Set(shown.map((task) => task.project_id))];
	const projects = projectIds.length
		? await db
				.from<Array<{ id: string; name: string }>>('onto_projects')
				.select('id, name')
				.in('id', projectIds)
		: { data: [], error: null };
	const projectName = new Map((projects.data ?? []).map((row) => [row.id, row.name]));

	const seen = new Set<string>();
	const linked: RelatedTaskEntityContact[] = [];
	for (const row of (contacts.data ?? []) as Array<
		Pick<TaskEntityRecord, 'task_id' | 'kind' | 'value' | 'display' | 'about' | 'role'>
	>) {
		if (!live.has(row.task_id) || !row.about) continue;
		if (row.role === 'avoid' || row.role === 'owner_self' || row.role === 'log') continue;
		if (entityTextKey(row.about) !== params.key) continue;
		const id = `${row.kind}:${row.value}`;
		if (seen.has(id)) continue;
		seen.add(id);
		linked.push({
			kind: row.kind as RelatedTaskEntityContact['kind'],
			value: row.value,
			display: row.kind === 'phone' ? formatPhone(row.value) : row.display,
			task_id: row.task_id
		});
	}

	return {
		tasks: shown.map((task) => ({
			id: task.id,
			title: task.title,
			project_id: task.project_id,
			project_name: projectName.get(task.project_id) ?? null,
			state_key: task.state_key
		})),
		contacts: linked,
		total: liveTasks.length
	};
}

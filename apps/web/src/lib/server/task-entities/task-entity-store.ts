// apps/web/src/lib/server/task-entities/task-entity-store.ts
//
// Reads and status changes for task entities (onto_task_entities, migration 20261007120000).
// Both run on the caller's user-scoped client: RLS shows a task's entities to members who can
// read its project, and lets members who can write it confirm, dismiss or restore them (a
// column grant limits that update to status). The worker writes everything else.
import type { TaskEntityRecord, TaskEntityStatus } from '@buildos/shared-agent-ops/task-entities';

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

// apps/web/src/lib/server/onto-detail-columns.ts
//
// Column lists for reading one doc, task or goal in full. They are `*` without
// `search_vector`: Postgres's full-text index of the row, as large as the text
// itself (30 KB on a 15 KB START HERE), which nothing outside the database reads.
// The type checks below fail the build when a column is added to a table and not
// listed here, so a new column can't silently go missing from these reads.
import type { Database } from '@buildos/shared-types';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Listed<S extends string> = S extends `${infer Head}, ${infer Tail}` ? Head | Listed<Tail> : S;
type Unlisted<T extends keyof Database['public']['Tables'], S extends string> = Exclude<
	keyof Row<T>,
	Listed<S> | 'search_vector'
>;
type Complete<Missing> = [Missing] extends [never] ? true : { missing: Missing };

export const DOCUMENT_DETAIL_COLUMNS =
	'id, project_id, title, description, content, content_hash, outline, children, props, state_key, type_key, created_at, created_by, updated_at, archived_at, deleted_at' as const;

export const TASK_DETAIL_COLUMNS =
	'id, project_id, title, description, state_key, type_key, priority, start_at, due_at, completed_at, facet_scale, idempotency_key, props, created_at, created_by, updated_at, archived_at, deleted_at' as const;

export const GOAL_DETAIL_COLUMNS =
	'id, project_id, name, goal, description, state_key, type_key, target_date, completed_at, props, created_at, created_by, updated_at, archived_at, deleted_at' as const;

const documentsComplete: Complete<Unlisted<'onto_documents', typeof DOCUMENT_DETAIL_COLUMNS>> =
	true;
const tasksComplete: Complete<Unlisted<'onto_tasks', typeof TASK_DETAIL_COLUMNS>> = true;
const goalsComplete: Complete<Unlisted<'onto_goals', typeof GOAL_DETAIL_COLUMNS>> = true;
void documentsComplete;
void tasksComplete;
void goalsComplete;

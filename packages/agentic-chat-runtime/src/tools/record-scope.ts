// packages/agentic-chat-runtime/src/tools/record-scope.ts
//
// Chat reads the present, not the archive (tasker 113). A record is current when
// it is neither deleted nor archived. Archives take three shapes in the data:
// a task archived on the board (deleted_at + archived_at), a record archived
// through the connector before 2026-09-29 (archived_at only), and a document
// archived from the tree (state_key 'archived', archived_at NULL). Every chat
// read of project records scopes through these helpers, or reads archived rows
// on purpose and says so with an `archived_at` column and a `record-scope:` tag.

export type RecordScopeEntity = 'task' | 'goal' | 'plan' | 'milestone' | 'risk' | 'document';

type FilterableQuery = {
	is: (column: string, value: null) => any;
	neq: (column: string, value: string) => any;
};

/** Keep a PostgREST query to current (not deleted, not archived) records. */
export function currentRecordsOnly<T extends FilterableQuery>(
	query: T,
	entity: RecordScopeEntity
): T {
	const scoped = query.is('deleted_at', null).is('archived_at', null) as T;
	return entity === 'document' ? (scoped.neq('state_key', 'archived') as T) : scoped;
}

/** True for a row a current-records read must drop. */
export function isArchivedOrDeletedRecord(
	row: Readonly<Record<string, unknown>>,
	entity: RecordScopeEntity
): boolean {
	if (row.deleted_at || row.archived_at) return true;
	return entity === 'document' && row.state_key === 'archived';
}

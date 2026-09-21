// apps/web/src/routes/api/admin/chat/sessions/[id]/workflow-audit-loader.ts
//
// Loads the durable workflow tables for one authorized session. Every child table is
// resolved through the session's actual turn-run ids (never by timestamp), each table is
// optional (a missing table is coverage, not an error), row limits are explicit, and the
// column lists never select control secrets (settlement tokens, attempt tokens).

import {
	type DocumentReadBatchRow,
	type InputArtifactRow,
	type SelectionShadowRow,
	type SpecialistSnapshotRow,
	type WorkflowAuditCoverage,
	type WorkflowAuditRowSet,
	type WorkflowAuditTable,
	type WorkflowDispatchRow,
	type WorkflowRunRow,
	type WorkflowStepRow
} from '$lib/services/admin/chat-workflow-audit-types';
import { emptyWorkflowTableCoverage } from '$lib/services/admin/chat-workflow-audit-build';

export const WORKFLOW_AUDIT_LIMITS = {
	runs: 500,
	steps: 2000,
	dispatches: 4000,
	snapshots: 500,
	readBatches: 500,
	shadows: 500,
	inputArtifacts: 500,
	idsPerQuery: 100
} as const;

const DISPATCH_COLUMNS = [
	'dispatch_id',
	'turn_run_id',
	'step_key',
	'step_attempt_id',
	'physical_attempt',
	'dispatch_kind',
	'state',
	'model_requested',
	'pricing',
	'serialized_request_bytes',
	'estimated_input_tokens',
	'max_output_tokens',
	'reserved_micro_usd',
	'actual_micro_usd',
	'reserved_generation',
	'provider_request_id',
	'provider_usage',
	'reconciliation_id',
	'reconciliation_receipt',
	'reserved_at',
	'dispatched_at',
	'settled_at',
	'uncertain_at',
	'reconciled_at',
	'created_at',
	'updated_at'
].join(',');

const SHADOW_COLUMNS = [
	'turn_run_id',
	'request_hash',
	'context_id',
	'context_hash',
	'execution_generation',
	'input',
	'input_hash',
	'result',
	'result_hash',
	'created_at',
	'completed_at'
].join(',');

const INPUT_ARTIFACT_COLUMNS = [
	'id',
	'turn_run_id',
	'artifact_version',
	'content_hash',
	'content_bytes',
	'history_source',
	'history_bytes',
	'history',
	'prepared',
	'retain_until',
	'source_prepared_prompt_id',
	'created_at'
].join(',');

type QueryError = { code?: string; message?: string } | null;
type QueryResult = PromiseLike<{ data: unknown; error: QueryError }>;
type Query = QueryResult & {
	in(column: string, values: string[]): Query;
	eq(column: string, value: string): Query;
	order(column: string, options?: { ascending?: boolean }): Query;
	limit(count: number): Query;
};

/** The minimal read surface this loader needs from the admin client. */
export type WorkflowAuditLoaderClient = {
	from(table: string): { select(columns: string): Query };
};

export const isOptionalTableMissing = (error: unknown): boolean => {
	const maybe = error as { code?: string; message?: string } | null;
	if (!maybe) return false;
	if (maybe.code === '42P01') return true;
	return typeof maybe.message === 'string' && /does not exist/i.test(maybe.message);
};

const chunk = <T>(values: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
};

type TableLoad<T> = { rows: T[]; coverage: WorkflowAuditCoverage };

async function loadTable<T>(params: {
	client: WorkflowAuditLoaderClient;
	table: WorkflowAuditTable;
	columns: string;
	idColumn: string;
	ids: string[];
	limit: number;
	orderBy?: string;
}): Promise<TableLoad<T>> {
	const { client, table, columns, idColumn, ids, limit, orderBy } = params;
	if (ids.length === 0) {
		return {
			rows: [],
			coverage: { status: 'available', detail: 'No turn runs to resolve.', count: 0, limit }
		};
	}
	const rows: T[] = [];
	let remaining = limit;
	for (const batch of chunk(ids, WORKFLOW_AUDIT_LIMITS.idsPerQuery)) {
		if (remaining <= 0) break;
		let query = client.from(table).select(columns).in(idColumn, batch);
		if (orderBy) query = query.order(orderBy, { ascending: true });
		const { data, error } = await query.limit(remaining);
		if (error) {
			if (isOptionalTableMissing(error)) {
				return {
					rows: [],
					coverage: {
						status: 'unavailable',
						detail: `Table ${table} is not available in this database.`,
						count: 0,
						limit
					}
				};
			}
			throw Object.assign(
				new Error(`${table} load failed: ${error.message ?? 'unknown error'}`),
				{
					code: error.code,
					table
				}
			);
		}
		const page = Array.isArray(data) ? (data as T[]) : [];
		rows.push(...page);
		remaining -= page.length;
	}
	const truncated = rows.length >= limit;
	return {
		rows,
		coverage: {
			status: truncated ? 'truncated' : 'available',
			detail: truncated ? `Returned ${rows.length} rows at the ${limit} row limit.` : null,
			count: rows.length,
			limit
		}
	};
}

export interface LoadWorkflowAuditRowsInput {
	client: WorkflowAuditLoaderClient;
	sessionId: string;
	/** The authorized session's turn-run ids. Child rows are only resolved through these. */
	turnRunIds: string[];
}

/**
 * Loads workflow runs for the session (scoped by session id AND the authorized turn ids),
 * then every child table by the workflow turn ids only. Tables that do not exist become
 * `unavailable` coverage; row limits become `truncated` coverage.
 */
export async function loadWorkflowAuditRows(
	input: LoadWorkflowAuditRowsInput
): Promise<WorkflowAuditRowSet> {
	const { client, sessionId, turnRunIds } = input;
	const tables = emptyWorkflowTableCoverage('available');
	const uniqueTurnIds = Array.from(new Set(turnRunIds.filter(Boolean)));

	const runs = await loadTable<WorkflowRunRow>({
		client,
		table: 'chat_turn_workflow_runs',
		columns: '*',
		idColumn: 'turn_run_id',
		ids: uniqueTurnIds,
		limit: WORKFLOW_AUDIT_LIMITS.runs,
		orderBy: 'created_at'
	});
	tables.chat_turn_workflow_runs = runs.coverage;
	// Defense in depth: a workflow row must belong to this session as well as to its turns.
	const runRows = runs.rows.filter((row) => !row.session_id || row.session_id === sessionId);
	const workflowTurnIds = runRows.map((row) => row.turn_run_id);
	const artifactIds = runRows
		.map((row) => row.request_artifact_id)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);

	if (workflowTurnIds.length === 0) {
		// Children resolve only through workflow turn ids. With none, they were not queried:
		// that is a clean "nothing here" when the runs table answered, and the runs table's own
		// gap (missing table, failed load) when it did not.
		const runsAnswered = runs.coverage.status === 'available';
		for (const table of Object.keys(tables) as WorkflowAuditTable[]) {
			if (table === 'chat_turn_workflow_runs') continue;
			tables[table] = runsAnswered
				? { status: 'available', detail: 'No workflow turns in this session.', count: 0 }
				: {
						status: runs.coverage.status,
						detail: `Not queried: chat_turn_workflow_runs was ${runs.coverage.status}${runs.coverage.detail ? ` (${runs.coverage.detail})` : ''}.`,
						count: 0
					};
		}
		return {
			runs: runRows,
			steps: [],
			dispatches: [],
			snapshots: [],
			readBatches: [],
			shadows: [],
			inputArtifacts: [],
			tables
		};
	}

	const [steps, dispatches, snapshots, readBatches, shadows, inputArtifacts] = await Promise.all([
		loadTable<WorkflowStepRow>({
			client,
			table: 'chat_turn_workflow_steps',
			columns: '*',
			idColumn: 'turn_run_id',
			ids: workflowTurnIds,
			limit: WORKFLOW_AUDIT_LIMITS.steps,
			orderBy: 'created_at'
		}),
		loadTable<WorkflowDispatchRow>({
			client,
			table: 'chat_turn_workflow_dispatches',
			columns: DISPATCH_COLUMNS,
			idColumn: 'turn_run_id',
			ids: workflowTurnIds,
			limit: WORKFLOW_AUDIT_LIMITS.dispatches,
			orderBy: 'reserved_at'
		}),
		loadTable<SpecialistSnapshotRow>({
			client,
			table: 'chat_turn_specialist_snapshots',
			columns: '*',
			idColumn: 'turn_run_id',
			ids: workflowTurnIds,
			limit: WORKFLOW_AUDIT_LIMITS.snapshots
		}),
		loadTable<DocumentReadBatchRow>({
			client,
			table: 'chat_turn_document_read_batches',
			columns: '*',
			idColumn: 'turn_run_id',
			ids: workflowTurnIds,
			limit: WORKFLOW_AUDIT_LIMITS.readBatches
		}),
		loadTable<SelectionShadowRow>({
			client,
			table: 'chat_turn_specialist_selection_shadows',
			columns: SHADOW_COLUMNS,
			idColumn: 'turn_run_id',
			ids: workflowTurnIds,
			limit: WORKFLOW_AUDIT_LIMITS.shadows
		}),
		loadTable<InputArtifactRow>({
			client,
			table: 'chat_turn_input_artifacts',
			columns: INPUT_ARTIFACT_COLUMNS,
			idColumn: 'id',
			ids: artifactIds,
			limit: WORKFLOW_AUDIT_LIMITS.inputArtifacts
		})
	]);

	tables.chat_turn_workflow_steps = steps.coverage;
	tables.chat_turn_workflow_dispatches = dispatches.coverage;
	tables.chat_turn_specialist_snapshots = snapshots.coverage;
	tables.chat_turn_document_read_batches = readBatches.coverage;
	tables.chat_turn_specialist_selection_shadows = shadows.coverage;
	tables.chat_turn_input_artifacts = inputArtifacts.coverage;

	const turnIdSet = new Set(workflowTurnIds);
	const onlyWorkflowTurns = <T extends { turn_run_id: string }>(rows: T[]) =>
		rows.filter((row) => turnIdSet.has(row.turn_run_id));

	return {
		runs: runRows,
		steps: onlyWorkflowTurns(steps.rows),
		dispatches: onlyWorkflowTurns(dispatches.rows),
		snapshots: onlyWorkflowTurns(snapshots.rows),
		readBatches: onlyWorkflowTurns(readBatches.rows),
		shadows: onlyWorkflowTurns(shadows.rows),
		inputArtifacts: onlyWorkflowTurns(inputArtifacts.rows),
		tables
	};
}

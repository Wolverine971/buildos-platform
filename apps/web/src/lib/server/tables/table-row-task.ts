// apps/web/src/lib/server/tables/table-row-task.ts
//
// Turn a table row into a follow-up task. The task is created through the same
// atomic RPC + relationship plan as POST /api/onto/tasks/create, then linked to
// the table document with the existing `task_has_document` edge carrying the
// row anchor (`props.row_id`, `props.row_number`). Readers that don't know about
// rows still show "linked to <table>".
import type { Json } from '@buildos/shared-types';
import { prepareRelationshipMutationPlan } from '$lib/services/ontology/auto-organizer.service';
import { TASK_DOCUMENT_REL } from '@buildos/agentic-chat-runtime/tools';
import {
	cellToText,
	primaryColumn,
	rowHandle,
	type TableDocumentSummary,
	type TableRow,
	type TableSchema
} from '@buildos/shared-agent-ops/tables';

type Supabase = App.Locals['supabase'];

export const TABLE_ROW_EDGE_ROLE = 'table_row';
const MAX_TASK_TITLE_CHARS = 200;

/** The row's title for a task: its primary cell, else "<table> · r12". */
export function defaultRowTaskTitle(
	document: TableDocumentSummary,
	schema: TableSchema,
	row: TableRow
): string {
	const primary = primaryColumn(schema);
	const primaryText = primary ? cellToText(primary, row.cells[primary.id] ?? null).trim() : '';
	const title = primaryText || `${document.title} · ${rowHandle(row.row_number)}`;
	return title.slice(0, MAX_TASK_TITLE_CHARS);
}

export class RowTaskError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly original?: unknown
	) {
		super(message);
		this.name = 'RowTaskError';
	}
}

export type RowTaskResult = {
	task: Record<string, unknown> & { id: string; title: string };
	edge: {
		src_kind: 'task';
		src_id: string;
		rel: string;
		dst_kind: 'document';
		dst_id: string;
		props: Record<string, unknown>;
	};
};

export async function createTaskForTableRow(args: {
	supabase: Supabase;
	actorId: string;
	document: TableDocumentSummary;
	row: TableRow;
	title: string;
}): Promise<RowTaskResult> {
	const { supabase, actorId, document, row, title } = args;
	const projectId = document.project_id;
	const taskId = crypto.randomUUID();

	const relationshipPlan = await prepareRelationshipMutationPlan({
		supabase,
		projectId,
		entity: { kind: 'task', id: taskId },
		connections: [],
		options: { mode: 'replace' },
		referencesValidated: true
	});

	const { data: atomicResult, error: atomicError } = await supabase.rpc(
		'onto_task_create_with_relationships_atomic',
		{
			p_task: {
				id: taskId,
				project_id: projectId,
				title,
				description: null,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 3,
				start_at: null,
				due_at: null,
				created_by: actorId,
				props: {
					table_row: {
						document_id: document.id,
						row_id: row.id,
						row_number: row.row_number
					}
				}
			} as Json,
			p_relationship_plan: relationshipPlan as unknown as Json,
			p_sync_assignees: false,
			p_source: 'manual'
		}
	);
	if (atomicError || !atomicResult) {
		const message = atomicError?.message ?? '';
		if (message.includes('access_denied')) {
			throw new RowTaskError(
				'You do not have permission to create tasks in this project',
				403
			);
		}
		throw new RowTaskError('Failed to create the task', 500, atomicError);
	}
	const task = (atomicResult as { task?: RowTaskResult['task'] }).task;
	if (!task) throw new RowTaskError('Failed to create the task', 500);

	const edgeProps: Record<string, unknown> = {
		role: TABLE_ROW_EDGE_ROLE,
		row_id: row.id,
		row_number: row.row_number,
		origin_task_id: task.id,
		created_at: new Date().toISOString(),
		created_by: actorId
	};
	const { error: edgeError } = await supabase.from('onto_edges').insert({
		project_id: projectId,
		src_kind: 'task',
		src_id: task.id,
		rel: TASK_DOCUMENT_REL,
		dst_kind: 'document',
		dst_id: document.id,
		props: edgeProps as Json
	});
	if (edgeError) {
		throw new RowTaskError(
			'The task was created but could not be linked to the table',
			500,
			edgeError
		);
	}

	return {
		task,
		edge: {
			src_kind: 'task',
			src_id: task.id,
			rel: TASK_DOCUMENT_REL,
			dst_kind: 'document',
			dst_id: document.id,
			props: edgeProps
		}
	};
}

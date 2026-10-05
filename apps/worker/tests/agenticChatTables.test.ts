// apps/worker/tests/agenticChatTables.test.ts
//
// BuildOS Tables (2026-10-04) through the worker: the table_change receipt is
// proved against the named table and the admitted project, row edits on the
// focused table take the direct lane while any row delete is reviewed, the
// focused table pins its tools from the structured context, and Jev keeps a
// table write's reads beside it.
import { describe, expect, it } from 'vitest';
import type { AgenticChatTurnProviderToolV1 } from '../src/workers/agentic-chat/provider/contracts';
import type { JsonObject } from '@buildos/shared-types';
import { AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1 } from '../src/workers/agentic-chat/mutations/receipt-builders';
import type { AgenticChatMutationExecutionContextV1 } from '../src/workers/agentic-chat/mutations/execution-context';
import {
	FOCUSED_TABLE_TOOL_PINS,
	focusedTableIdFromContextPayload
} from '../src/workers/agentic-chat/provider/request-builders';
import { selectJevToolDefinitions } from '../src/workers/agentic-chat/provider/jev-tool-selector';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';
import {
	assessDirectWriteBatch,
	type DirectWriteRouteContext
} from '../src/workers/agentic-chat/provider/write-routing';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const OTHER_PROJECT_ID = '41000000-0000-4000-8000-000000000004';
const TABLE_ID = '70000000-0000-4000-8000-000000000007';

function receiptContext(
	toolName: string,
	args: Record<string, unknown>
): AgenticChatMutationExecutionContextV1 {
	return {
		toolName,
		args,
		projectId: PROJECT_ID,
		expected: {}
	} as unknown as AgenticChatMutationExecutionContextV1;
}

function tableChange(overrides: Record<string, unknown> = {}) {
	return {
		kind: 'table_change',
		document_id: TABLE_ID,
		project_id: PROJECT_ID,
		title: 'Job applications',
		revision: 4,
		applied_revision: 5,
		rows_added: 1,
		rows_updated: 1,
		rows_deleted: 0,
		cells_changed: 3,
		columns_changed: [],
		sample: [{ row: 'r4', column: 'Status', before: 'Applied', after: 'Interview' }],
		inverse_ops: [{ op: 'delete', row: 'r43' }],
		...overrides
	};
}

/** The gateway's row-write response (op-execution-gateway.tables.ts updateTableRows). */
function rowsResponse(overrides: Record<string, unknown> = {}) {
	return {
		table: {
			id: TABLE_ID,
			project_id: PROJECT_ID,
			project_name: 'Job hunt',
			title: 'Job applications',
			description: null,
			type_key: 'document.table',
			state_key: 'draft',
			updated_at: '2026-10-04T00:00:00Z',
			archived: false,
			revision: 5,
			row_count: 43,
			columns: ['Company', 'Status'],
			url: `/projects/${PROJECT_ID}?doc=${TABLE_ID}`,
			csv_path: `/api/onto/tables/${TABLE_ID}/export.csv`
		},
		table_change: tableChange(),
		rows_added: 1,
		rows_updated: 1,
		rows_deleted: 0,
		cells_changed: 3,
		added_rows: ['r43'],
		message: 'Updated table "Job applications": 1 added, 1 updated.',
		...overrides
	};
}

describe('table_change receipt builder', () => {
	const build = AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1.table_change;

	it('proves the gateway row-write response and keeps the whole change for Undo', () => {
		const receipt = build(
			rowsResponse(),
			receiptContext('update_onto_table_rows', { table_id: TABLE_ID })
		) as JsonObject & Record<string, any>;
		expect(receipt.document).toEqual({
			id: TABLE_ID,
			project_id: PROJECT_ID,
			title: 'Job applications',
			type_key: 'document.table'
		});
		expect(receipt.table).toEqual({ row_count: 43, revision: 5 });
		expect(receipt.table_change.inverse_ops).toEqual([{ op: 'delete', row: 'r43' }]);
		expect(receipt.rows_added_handles).toEqual(['r43']);
		expect(receipt.message).toBe('Updated table "Job applications": +1 rows · 3 cells.');
	});

	it('refuses a receipt for a different table or outside the admitted project', () => {
		const otherTable = '71000000-0000-4000-8000-000000000007';
		expect(() =>
			build(
				rowsResponse(),
				receiptContext('update_onto_table_rows', { table_id: otherTable })
			)
		).toThrow();
		expect(() =>
			build(
				rowsResponse({
					table: { ...rowsResponse().table, project_id: OTHER_PROJECT_ID },
					table_change: tableChange({ project_id: OTHER_PROJECT_ID })
				}),
				receiptContext('update_onto_table_rows', { table_id: TABLE_ID })
			)
		).toThrow();
	});

	it('refuses a change receipt that names another document or lacks Undo ops', () => {
		expect(() =>
			build(
				rowsResponse({ table_change: tableChange({ document_id: OTHER_PROJECT_ID }) }),
				receiptContext('update_onto_table_rows', { table_id: TABLE_ID })
			)
		).toThrow();
		expect(() =>
			build(
				rowsResponse({ table_change: tableChange({ inverse_ops: undefined }) }),
				receiptContext('update_onto_table_rows', { table_id: TABLE_ID })
			)
		).toThrow();
	});

	it('accepts a create, which names no table_id', () => {
		const receipt = build(
			rowsResponse({ added_rows: undefined }),
			receiptContext('create_onto_table', {
				project_id: PROJECT_ID,
				title: 'Job applications'
			})
		) as Record<string, any>;
		expect(receipt.message).toBe('Created table "Job applications" with 43 rows.');
	});
});

let callIndex = 0;
function call(name: string, args: JsonObject): CompletedProviderToolCall {
	callIndex += 1;
	const json = JSON.stringify(args);
	return {
		id: `call-${callIndex}`,
		name,
		arguments: args,
		canonicalArguments: json,
		canonicalProviderArguments: json
	};
}

function focusedTable(overrides: Partial<DirectWriteRouteContext> = {}): DirectWriteRouteContext {
	return {
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		userMessage: 'research the hiring manager for the Stripe row and add it',
		resolvedEntityIds: new Map(),
		focusedEntityIds: new Set([TABLE_ID]),
		...overrides
	};
}

describe('table write routing', () => {
	it('writes a row batch on the focused table directly, as one mutation', () => {
		expect(
			assessDirectWriteBatch(
				[
					call('update_onto_table_rows', {
						table_id: TABLE_ID,
						update: [{ row: 'r4', values: { 'Hiring manager': 'Ana Ruiz' } }],
						add: [{ values: { Company: 'Linear' } }]
					})
				],
				focusedTable()
			)
		).toEqual({ kind: 'simple', mutationCount: 1 });
	});

	it('reviews any row delete, even on the focused table', () => {
		expect(
			assessDirectWriteBatch(
				[call('update_onto_table_rows', { table_id: TABLE_ID, delete: ['r4'] })],
				focusedTable()
			)
		).toMatchObject({ kind: 'contract_required', reason: 'operation_requires_contract' });
	});

	it('reviews every column change', () => {
		expect(
			assessDirectWriteBatch(
				[
					call('update_onto_table', {
						table_id: TABLE_ID,
						column_changes: [{ action: 'add', name: 'Remote policy', type: 'text' }]
					})
				],
				focusedTable()
			)
		).toMatchObject({ kind: 'contract_required', reason: 'operation_requires_contract' });
	});

	it('does not resolve a table that is neither focused nor read this turn', () => {
		expect(
			assessDirectWriteBatch(
				[
					call('update_onto_table_rows', {
						table_id: TABLE_ID,
						update: [{ row: 'r4', values: { Status: 'Offer' } }]
					})
				],
				focusedTable({ focusedEntityIds: new Set() })
			)
		).toMatchObject({ kind: 'contract_required' });
	});
});

describe('focused table tool pins', () => {
	const context = (focus: Record<string, unknown>, type = 'document') => ({
		data: { focus_entity_type: type, focus_entity_id: TABLE_ID, focus_entity_full: focus }
	});

	it('reads the focused table id from the structured context only', () => {
		expect(
			focusedTableIdFromContextPayload(context({ id: TABLE_ID, type_key: 'document.table' }))
		).toBe(TABLE_ID);
		expect(
			focusedTableIdFromContextPayload(
				context({ id: TABLE_ID, type_key: 'document.table.crm' })
			)
		).toBe(TABLE_ID);
		expect(
			focusedTableIdFromContextPayload(context({ id: TABLE_ID, type_key: 'document.note' }))
		).toBeNull();
		expect(
			focusedTableIdFromContextPayload(
				context({ id: TABLE_ID, type_key: 'document.table' }, 'task')
			)
		).toBeNull();
		expect(
			focusedTableIdFromContextPayload(context({ id: 'r12', type_key: 'document.table' }))
		).toBeNull();
	});

	it('pins the table reads and row/column writes', () => {
		expect([...FOCUSED_TABLE_TOOL_PINS]).toEqual(
			expect.arrayContaining([
				'get_onto_table_details',
				'read_table_rows',
				'update_onto_table',
				'update_onto_table_rows'
			])
		);
	});
});

function tool(name: string): AgenticChatTurnProviderToolV1 {
	return {
		type: 'function',
		function: { name, description: name, parameters: { type: 'object', properties: {} } }
	};
}

describe('Jev supporting tools for tables', () => {
	it('mounts both table reads beside a table row write', () => {
		const tools = [
			'get_onto_table_details',
			'read_table_rows',
			'update_onto_table_rows',
			'create_onto_task'
		].map(tool);
		const selected = selectJevToolDefinitions(tools, {
			get_onto_table_details: 0,
			read_table_rows: 0,
			update_onto_table_rows: 0.9,
			create_onto_task: 0
		}).map((entry) => entry.function.name);
		expect(selected).toEqual([
			'get_onto_table_details',
			'read_table_rows',
			'update_onto_table_rows'
		]);
	});

	it('pairs the two table reads', () => {
		const tools = ['get_onto_table_details', 'read_table_rows'].map(tool);
		expect(
			selectJevToolDefinitions(tools, {
				get_onto_table_details: 0,
				read_table_rows: 0.9
			}).map((entry) => entry.function.name)
		).toEqual(['get_onto_table_details', 'read_table_rows']);
	});
});

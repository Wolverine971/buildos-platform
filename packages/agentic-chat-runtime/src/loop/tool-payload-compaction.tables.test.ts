// packages/agentic-chat-runtime/src/loop/tool-payload-compaction.tables.test.ts
//
// BuildOS Tables (2026-10-04): table reads keep the 12K budget and are never
// shrunk mid-cell (an oversized page drops its rows and asks for a smaller
// one), and a table write receipt gives the model counts + sample diffs, not
// the Undo ops the chat card uses.
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { buildToolPayloadForModel } from './tool-payload-compaction';

const TABLE_ID = '70000000-0000-4000-8000-000000000007';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

function toolCall(name: string): ChatToolCall {
	return { id: `call:${name}`, type: 'function', function: { name, arguments: '{}' } };
}

function toolResult(result: unknown): ChatToolResult {
	return { tool_call_id: 'call:test', success: true, result };
}

const parseArgs = () => ({ args: {} });

function readPayload(rowsText: string) {
	return {
		document: { id: TABLE_ID, project_id: PROJECT_ID, title: 'Job applications' },
		total_rows: 80,
		matched_rows: 80,
		offset: 0,
		rows: rowsText,
		rows_returned: 25,
		next_offset: 25,
		message: 'Showing 25 of 80 matching rows; read again with offset 25 for more.'
	};
}

describe('table read payloads', () => {
	it('passes a fitted ~10K page through whole, cell text intact', () => {
		const cell = 'Recruiter: "circle back in two weeks"';
		const rows = Array.from(
			{ length: 25 },
			(_, index) => `r${index + 1} | Co ${index} | ${cell}`
		)
			.join('\n')
			.padEnd(9_500, ' ');
		const payload = buildToolPayloadForModel(
			toolCall('read_table_rows'),
			toolResult(readPayload(rows)),
			parseArgs
		) as Record<string, any>;
		expect(payload.rows).toBe(rows);
		expect(payload.rows_returned).toBe(25);
		expect(payload).not.toHaveProperty('rows_omitted_for_size');
	});

	it('drops an oversized page outright instead of trimming a cell', () => {
		const rows = Array.from(
			{ length: 25 },
			(_, index) => `r${index + 1} | ${'x'.repeat(600)}`
		).join('\n');
		const payload = buildToolPayloadForModel(
			toolCall('read_table_rows'),
			toolResult(readPayload(rows)),
			parseArgs
		) as Record<string, any>;
		expect(payload.rows).toBeUndefined();
		expect(payload.rows_omitted_for_size).toBe(true);
		expect(payload.matched_rows).toBe(80);
		expect(payload.message).toContain('smaller limit or fewer columns');
		expect(JSON.stringify(payload)).not.toContain('xxxxxxxxxx');
	});

	it('gives get_onto_table_details the same extended budget', () => {
		const rows = 'r1 | Stripe | Applied\n'.repeat(350);
		expect(rows.length).toBeGreaterThan(6_000);
		const payload = buildToolPayloadForModel(
			toolCall('get_onto_table_details'),
			toolResult({ ...readPayload(rows), columns: 'Company (text)' }),
			parseArgs
		) as Record<string, any>;
		expect(payload.rows).toBe(rows);
	});
});

describe('table write receipts', () => {
	const inverseOps = Array.from({ length: 120 }, (_, index) => ({
		op: 'update',
		row: `r${index + 1}`,
		values: { c_notes: 'previous value '.repeat(10) }
	}));

	it('keeps counts, columns, a sample, and added handles; drops the Undo ops', () => {
		const payload = buildToolPayloadForModel(
			toolCall('update_onto_table_rows'),
			toolResult({
				ok: true,
				op: 'onto.table.rows.update',
				result: {
					document: { id: TABLE_ID, project_id: PROJECT_ID, title: 'Job applications' },
					table: { row_count: 83, revision: 12 },
					table_change: {
						kind: 'table_change',
						document_id: TABLE_ID,
						project_id: PROJECT_ID,
						title: 'Job applications',
						revision: 11,
						applied_revision: 12,
						rows_added: 3,
						rows_updated: 2,
						rows_deleted: 0,
						cells_changed: 7,
						columns_changed: [],
						sample: Array.from({ length: 12 }, (_, index) => ({
							row: `r${index + 1}`,
							column: 'Hiring manager',
							before: '',
							after: `Person ${index}`
						})),
						inverse_ops: inverseOps,
						inverse_schema: { columns: [] }
					},
					rows_added_handles: Array.from({ length: 70 }, (_, index) => `r${index + 100}`),
					message: 'Added 3 rows and updated 2 rows in "Job applications".'
				}
			}),
			parseArgs
		) as Record<string, any>;

		const result = payload.result;
		expect(result.table_change).toEqual({
			rows_added: 3,
			rows_updated: 2,
			rows_deleted: 0,
			cells_changed: 7,
			sample: expect.any(Array)
		});
		expect(result.table_change.sample).toHaveLength(8);
		expect(result.rows_added_handles).toHaveLength(50);
		expect(result.table).toEqual({ row_count: 83, revision: 12 });
		expect(JSON.stringify(payload)).not.toContain('inverse_ops');
		expect(JSON.stringify(payload)).not.toContain('inverse_schema');
		expect(JSON.stringify(payload)).not.toContain('previous value');
	});

	it('names changed columns on a schema edit', () => {
		const payload = buildToolPayloadForModel(
			toolCall('update_onto_table'),
			toolResult({
				document: { id: TABLE_ID, project_id: PROJECT_ID, title: 'Job applications' },
				table_change: {
					kind: 'table_change',
					document_id: TABLE_ID,
					project_id: PROJECT_ID,
					title: 'Job applications',
					revision: 12,
					applied_revision: 13,
					rows_added: 0,
					rows_updated: 0,
					rows_deleted: 0,
					cells_changed: 0,
					columns_changed: ['Remote policy'],
					sample: [],
					inverse_ops: []
				}
			}),
			parseArgs
		) as Record<string, any>;
		expect(payload.table_change).toEqual({
			rows_added: 0,
			rows_updated: 0,
			rows_deleted: 0,
			cells_changed: 0,
			columns_changed: ['Remote policy']
		});
	});
});

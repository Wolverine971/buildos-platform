// packages/agentic-chat-runtime/src/tools/table-reads.test.ts
//
// BuildOS Tables (2026-10-04): chat table reads gate on project access before
// loading rows, answer counts/groups/totals from the shared query engine, and
// fit the model budget by dropping whole rows, never trimming a cell.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedTable, TableRow, TableSchema } from '@buildos/shared-agent-ops/tables';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

const loadTableMock = vi.hoisted(() => vi.fn());
vi.mock('@buildos/shared-agent-ops/tables', async (importOriginal) => ({
	...(await importOriginal<typeof import('@buildos/shared-agent-ops/tables')>()),
	loadTable: loadTableMock
}));

import { getOntoTableDetails, readTableRows, TABLE_READ_MODEL_PAYLOAD_CHARS } from './table-reads';

const TABLE_ID = '70000000-0000-4000-8000-000000000007';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

const schema: TableSchema = {
	format: 1,
	revision: 9,
	row_count: 0,
	primary_column_id: 'c_company',
	columns: [
		{ id: 'c_company', name: 'Company', type: 'text' },
		{
			id: 'c_status',
			name: 'Status',
			type: 'select',
			options: {
				choices: [{ value: 'Applied' }, { value: 'Interview' }, { value: 'Rejected' }]
			}
		},
		{ id: 'c_salary', name: 'Salary', type: 'number' },
		{ id: 'c_notes', name: 'Notes', type: 'long_text' }
	]
};

function row(rowNumber: number, cells: TableRow['cells']): TableRow {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: {},
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '',
		updated_at: ''
	};
}

function table(rows: TableRow[]): LoadedTable {
	return {
		document: {
			id: TABLE_ID,
			project_id: PROJECT_ID,
			title: 'Job applications',
			description: null,
			type_key: 'document.table',
			state_key: 'draft',
			updated_at: '2026-10-04T00:00:00Z'
		},
		schema: { ...schema, row_count: rows.length },
		rows
	};
}

const STATUSES = ['Applied', 'Interview', 'Rejected'];
function rows(count: number, notes = ''): TableRow[] {
	return Array.from({ length: count }, (_, index) =>
		row(index + 1, {
			c_company: `Company ${index + 1}`,
			c_status: STATUSES[index % 3]!,
			c_salary: 100 + index,
			c_notes: notes
		})
	);
}

function createContext(ref: Record<string, unknown> | null) {
	const events: string[] = [];
	const query: Record<string, any> = {};
	for (const method of ['select', 'eq', 'is']) query[method] = vi.fn(() => query);
	query.maybeSingle = vi.fn(async () => {
		events.push('query:onto_documents');
		return { data: ref, error: null };
	});
	const client = { from: vi.fn(() => query) };
	const access = {
		assertProjectAccess: vi.fn(async (projectId: string) => {
			events.push(`access:${projectId}`);
		})
	};
	return {
		context: { client, access } as unknown as AgenticChatSharedReadContextV1,
		access,
		events
	};
}

const TABLE_REF = { id: TABLE_ID, project_id: PROJECT_ID, type_key: 'document.table' };

beforeEach(() => {
	loadTableMock.mockReset();
});

describe('get_onto_table_details', () => {
	it('checks project access before loading rows and returns schema, totals, and a sample', async () => {
		const { context, events } = createContext(TABLE_REF);
		loadTableMock.mockImplementation(async () => {
			events.push('load_table');
			return table(rows(40));
		});

		const payload = (await getOntoTableDetails(context, { table_id: TABLE_ID })) as Record<
			string,
			any
		>;

		expect(events).toEqual(['query:onto_documents', `access:${PROJECT_ID}`, 'load_table']);
		expect(payload.table).toEqual({ row_count: 40, column_count: 4, revision: 9 });
		expect(payload.document.title).toBe('Job applications');
		expect(payload.rows_returned).toBe(15);
		expect(payload.next_offset).toBe(15);
		expect(payload.rows).toContain('r1');
		expect(payload.rows).not.toContain('r16');
		expect(payload.totals.Salary).toBeDefined();
		expect(payload.csv_path).toBe(`/api/onto/tables/${TABLE_ID}/export.csv`);
		expect(payload.message).toContain('first 15 of 40 rows');
	});

	it('refuses a document that is not a table without loading rows', async () => {
		const { context } = createContext({ ...TABLE_REF, type_key: 'document.note' });
		const payload = (await getOntoTableDetails(context, { table_id: TABLE_ID })) as Record<
			string,
			any
		>;
		expect(payload.status).toBe('not_a_table');
		expect(payload.message).toContain('get_onto_document_details');
		expect(loadTableMock).not.toHaveBeenCalled();
	});

	it('returns a not-found payload for a non-UUID id without querying', async () => {
		const { context, events, access } = createContext(TABLE_REF);
		const payload = (await getOntoTableDetails(context, { table_id: 'r12' })) as Record<
			string,
			any
		>;
		expect(payload.found).toBe(false);
		expect(events).toEqual([]);
		expect(access.assertProjectAccess).not.toHaveBeenCalled();
	});

	it('propagates an access refusal before any row load', async () => {
		const { context, access } = createContext(TABLE_REF);
		access.assertProjectAccess.mockRejectedValueOnce(new Error('forbidden'));
		await expect(getOntoTableDetails(context, { table_id: TABLE_ID })).rejects.toThrow(
			'forbidden'
		);
		expect(loadTableMock).not.toHaveBeenCalled();
	});
});

describe('read_table_rows', () => {
	it('filters with the shared engine and reports the exact matched count', async () => {
		const { context } = createContext(TABLE_REF);
		loadTableMock.mockResolvedValue(table(rows(30)));

		const payload = (await readTableRows(context, {
			table_id: TABLE_ID,
			filters: [{ column: 'Status', op: 'eq', value: 'Interview' }],
			columns: ['Company', 'Status']
		})) as Record<string, any>;

		expect(payload.total_rows).toBe(30);
		expect(payload.matched_rows).toBe(10);
		expect(payload.rows_returned).toBe(10);
		expect(payload.next_offset).toBeNull();
		expect(payload.rows).toContain('r2');
		expect(payload.rows).not.toContain('Salary');
		expect(payload.message).toBe('Showing all 10 matching rows.');
	});

	it('merges the values list into in / not_in filters', async () => {
		const { context } = createContext(TABLE_REF);
		loadTableMock.mockResolvedValue(table(rows(9)));
		const payload = (await readTableRows(context, {
			table_id: TABLE_ID,
			filters: [{ column: 'Status', op: 'in', values: ['Applied', 'Rejected'] }]
		})) as Record<string, any>;
		expect(payload.matched_rows).toBe(6);
	});

	it('groups and aggregates without rows when limit is 0', async () => {
		const { context } = createContext(TABLE_REF);
		loadTableMock.mockResolvedValue(table(rows(9)));
		const payload = (await readTableRows(context, {
			table_id: TABLE_ID,
			group_by: 'Status',
			aggregates: [{ fn: 'count' }, { fn: 'sum', column: 'Salary' }],
			limit: 0
		})) as Record<string, any>;
		expect(payload.groups).toHaveLength(3);
		expect(
			payload.groups.map((group: { group: string; count: number }) => [
				group.group,
				group.count
			])
		).toEqual(
			expect.arrayContaining([
				['Applied', 3],
				['Interview', 3],
				['Rejected', 3]
			])
		);
		expect(payload.rows).toBeUndefined();
		expect(payload.rows_returned).toBe(0);
		expect(payload.message).toBe('9 matching rows; groups and aggregates only.');
	});

	it('drops whole rows to fit the model budget and pages from next_offset', async () => {
		const { context } = createContext(TABLE_REF);
		// ~290-char notes on 100 rows cannot fit one ~10.8K payload.
		const longNote = 'Recruiter said "we will circle back"\n'.repeat(8);
		loadTableMock.mockResolvedValue(table(rows(100, longNote)));

		const payload = (await readTableRows(context, {
			table_id: TABLE_ID,
			limit: 100
		})) as Record<string, any>;

		expect(JSON.stringify(payload).length).toBeLessThanOrEqual(TABLE_READ_MODEL_PAYLOAD_CHARS);
		expect(payload.rows_returned).toBeGreaterThan(0);
		expect(payload.rows_returned).toBeLessThan(100);
		expect(payload.next_offset).toBe(payload.rows_returned);
		expect(payload.matched_rows).toBe(100);
		expect(payload.message).toContain(`read again with offset ${payload.next_offset}`);
		// The last row shown is complete: its handle and company both appear.
		const last = payload.rows_returned as number;
		expect(payload.rows).toContain(`Company ${last}`);
		expect(payload.rows).not.toContain(`Company ${last + 1}\n`);
	});

	it('reports no matches plainly', async () => {
		const { context } = createContext(TABLE_REF);
		loadTableMock.mockResolvedValue(table(rows(5)));
		const payload = (await readTableRows(context, {
			table_id: TABLE_ID,
			filters: [{ column: 'Company', op: 'eq', value: 'Stripe' }]
		})) as Record<string, any>;
		expect(payload.matched_rows).toBe(0);
		expect(payload.message).toBe('No rows match.');
	});
});

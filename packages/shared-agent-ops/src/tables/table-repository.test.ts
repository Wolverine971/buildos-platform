// packages/shared-agent-ops/src/tables/table-repository.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addDocumentToTreeMock, createVersionMock } = vi.hoisted(() => ({
	addDocumentToTreeMock: vi.fn(async () => ({ version: 1, root: [] })),
	createVersionMock: vi.fn(async () => ({ status: 'created' }))
}));

vi.mock('../ontology/doc-structure.service', () => ({ addDocumentToTree: addDocumentToTreeMock }));
vi.mock('../ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: createVersionMock,
	toDocumentSnapshot: (document: Record<string, unknown>) => ({ title: document.title })
}));

import {
	TableServiceError,
	applyTableChanges,
	createTableDocument,
	listProjectTables,
	loadTable
} from './table-repository';
import type { TableRowOp } from './table-types';

type Call = { table: string; method: string; args: unknown[] };

/**
 * Chainable PostgREST stand-in. Each `from(table)` chain resolves to the next
 * scripted response for that table; every chained call is recorded.
 */
function mockClient(script: {
	tables?: Record<string, Array<{ data: unknown; error?: unknown }>>;
	rpc?: Array<{ data: unknown; error?: unknown }>;
}) {
	const calls: Call[] = [];
	const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
	const queues = Object.fromEntries(
		Object.entries(script.tables ?? {}).map(([table, responses]) => [table, [...responses]])
	);
	const rpcQueue = [...(script.rpc ?? [])];
	const client = {
		from(table: string) {
			const next = () => {
				const response = queues[table]?.shift() ?? { data: null, error: null };
				return { data: response.data, error: response.error ?? null };
			};
			const builder: Record<string, unknown> = {};
			for (const method of [
				'select',
				'eq',
				'is',
				'or',
				'order',
				'range',
				'insert',
				'update',
				'limit',
				'in'
			]) {
				builder[method] = (...args: unknown[]) => {
					calls.push({ table, method, args });
					return builder;
				};
			}
			builder.maybeSingle = async () => next();
			builder.single = async () => next();
			builder.then = (
				resolve: (value: unknown) => unknown,
				reject?: (reason: unknown) => unknown
			) => Promise.resolve(next()).then(resolve, reject);
			return builder;
		},
		async rpc(fn: string, args: Record<string, unknown>) {
			rpcCalls.push({ fn, args });
			const response = rpcQueue.shift() ?? { data: null, error: null };
			return { data: response.data, error: response.error ?? null };
		}
	};
	return { client, calls, rpcCalls };
}

const DOC_ID = '30000000-0000-4000-8000-000000000003';

function dbRow(rowNumber: number, position: number) {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: String(position),
		cells: { c_a: `v${rowNumber}` },
		cell_meta: null,
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: 'x',
		updated_at: 'x',
		deleted_at: null
	};
}

const tableDoc = {
	id: DOC_ID,
	project_id: 'project-1',
	title: 'Pipeline',
	description: null,
	type_key: 'document.table',
	state_key: 'draft',
	props: {
		table: {
			format: 1,
			columns: [{ id: 'c_a', name: 'A', type: 'text' }],
			revision: 3,
			row_count: 2
		}
	},
	updated_at: '2026-10-04T00:00:00Z',
	archived_at: null,
	deleted_at: null
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('loadTable', () => {
	it('loads the schema and rows in display order', async () => {
		const { client, calls } = mockClient({
			tables: {
				onto_documents: [{ data: tableDoc }],
				onto_document_rows: [{ data: [dbRow(2, 512), dbRow(1, 1024)] }]
			}
		});
		const table = await loadTable(client, DOC_ID);
		expect(table.document).toMatchObject({ id: DOC_ID, title: 'Pipeline', archived_at: null });
		expect(table.schema.revision).toBe(3);
		expect(table.rows.map((row) => [row.row_number, row.position])).toEqual([
			[2, 512],
			[1, 1024]
		]);
		expect(table.rows[0]!.cell_meta).toEqual({});
		expect(calls).toContainEqual({
			table: 'onto_document_rows',
			method: 'is',
			args: ['deleted_at', null]
		});
	});

	it('pages past the PostgREST 1,000-row cap', async () => {
		const page = Array.from({ length: 1000 }, (_, index) =>
			dbRow(index + 1, (index + 1) * 1024)
		);
		const { client, calls } = mockClient({
			tables: {
				onto_documents: [{ data: tableDoc }],
				onto_document_rows: [{ data: page }, { data: [dbRow(1001, 1001 * 1024)] }]
			}
		});
		const table = await loadTable(client, DOC_ID, { includeDeleted: true });
		expect(table.rows).toHaveLength(1001);
		expect(calls.filter((call) => call.method === 'range').map((call) => call.args)).toEqual([
			[0, 999],
			[1000, 1999]
		]);
		expect(
			calls.some((call) => call.table === 'onto_document_rows' && call.method === 'is')
		).toBe(false);
	});

	it('throws TABLE_NOT_FOUND / NOT_A_TABLE', async () => {
		await expect(
			loadTable(mockClient({ tables: { onto_documents: [{ data: null }] } }).client, DOC_ID)
		).rejects.toMatchObject({
			code: 'TABLE_NOT_FOUND'
		});
		await expect(
			loadTable(
				mockClient({
					tables: {
						onto_documents: [{ data: { ...tableDoc, type_key: 'document.default' } }]
					}
				}).client,
				DOC_ID
			)
		).rejects.toMatchObject({ code: 'NOT_A_TABLE' });
		await expect(
			loadTable(
				mockClient({
					tables: { onto_documents: [{ data: { ...tableDoc, deleted_at: 'x' } }] }
				}).client,
				DOC_ID
			)
		).rejects.toBeInstanceOf(TableServiceError);
	});
});

describe('listProjectTables', () => {
	it('lists live tables with row counts and column names', async () => {
		const { client, calls } = mockClient({
			tables: {
				onto_documents: [
					{
						data: [
							tableDoc,
							{ ...tableDoc, id: 'x', state_key: 'archived' },
							{ ...tableDoc, id: 'y', type_key: 'document.default' }
						]
					}
				]
			}
		});
		const tables = await listProjectTables(client, 'project-1');
		expect(tables).toEqual([
			expect.objectContaining({ id: DOC_ID, row_count: 2, columns: ['A'] })
		]);
		expect(calls).toContainEqual({
			table: 'onto_documents',
			method: 'or',
			args: ['type_key.eq.document.table,type_key.like.document.table.*']
		});
	});
});

const result = (revision: number, rowIds: string[]) => ({
	document_id: DOC_ID,
	revision,
	row_count: rowIds.length,
	updated_at: 'now',
	results: rowIds.map((id, index) => ({
		op: 'insert',
		ref: null,
		row_id: id,
		row_number: index + 1,
		version: 1,
		before: null,
		after: { cells: {} }
	}))
});

describe('applyTableChanges', () => {
	it('sends schema + guard + actor in one call', async () => {
		const { client, rpcCalls } = mockClient({ rpc: [{ data: result(4, ['a']) }] });
		const schema = { format: 1 as const, columns: [], revision: 3, row_count: 0 };
		const apply = await applyTableChanges(client, {
			documentId: DOC_ID,
			ops: [{ op: 'insert', cells: {} }],
			schema,
			expectedRevision: 3,
			actorId: 'actor-1'
		});
		expect(apply.revision).toBe(4);
		expect(rpcCalls).toEqual([
			{
				fn: 'onto_document_table_apply',
				args: {
					p_document_id: DOC_ID,
					p_ops: [{ op: 'insert', cells: {} }],
					p_table: schema,
					p_expected_revision: 3,
					p_actor_id: 'actor-1'
				}
			}
		]);
	});

	it('chunks more than 1,000 ops only when unguarded, schema on the first batch', async () => {
		const ops: TableRowOp[] = Array.from({ length: 1500 }, () => ({ op: 'insert', cells: {} }));
		const { client, rpcCalls } = mockClient({
			rpc: [{ data: result(4, ['a']) }, { data: result(5, ['b']) }]
		});
		const schema = { format: 1 as const, columns: [], revision: 3, row_count: 0 };
		const apply = await applyTableChanges(client, { documentId: DOC_ID, ops, schema });
		expect(rpcCalls.map((call) => (call.args.p_ops as unknown[]).length)).toEqual([1000, 500]);
		expect(rpcCalls.map((call) => call.args.p_table)).toEqual([schema, null]);
		expect(apply.revision).toBe(5);
		expect(apply.results.map((entry) => entry.row_id)).toEqual(['a', 'b']);
		await expect(
			applyTableChanges(client, { documentId: DOC_ID, ops, expectedRevision: 3 })
		).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
	});

	it('maps RPC error prefixes to TableServiceError codes', async () => {
		const { client } = mockClient({
			rpc: [
				{
					data: null,
					error: {
						message: 'ROW_CONFLICT: row x expected version 1, found 2',
						code: '40001'
					}
				},
				{ data: null, error: { message: 'deadlock detected', code: '40P01' } }
			]
		});
		await expect(
			applyTableChanges(client, { documentId: DOC_ID, ops: [] })
		).rejects.toMatchObject({
			name: 'TableServiceError',
			code: 'ROW_CONFLICT',
			message: 'row x expected version 1, found 2'
		});
		const plain = await applyTableChanges(client, { documentId: DOC_ID, ops: [] }).catch(
			(error) => error
		);
		expect(plain).not.toBeInstanceOf(TableServiceError);
		expect(plain).toMatchObject({ code: '40P01' });
	});
});

describe('createTableDocument', () => {
	it('inserts, applies rows, records a version, and files it in the tree', async () => {
		const inserted = { ...tableDoc, id: DOC_ID, content: '| Company |\n| --- |' };
		const { client, calls, rpcCalls } = mockClient({
			tables: {
				onto_documents: [
					{ data: inserted },
					{ data: { ...inserted, content: 'projection' } }
				],
				onto_document_rows: [{ data: [dbRow(1, 1024)] }]
			},
			rpc: [{ data: result(1, ['row-1']) }]
		});
		const created = await createTableDocument(client, {
			projectId: 'project-1',
			actorId: 'actor-1',
			title: '  Job   applications ',
			columns: [{ name: 'Company' }, { name: 'Stage', type: 'select' }],
			rows: [{ Company: 'Acme', Stage: 'Applied', Bogus: 'x' }],
			parentId: 'parent-1'
		});
		const insert = calls.find((call) => call.method === 'insert')!.args[0] as Record<
			string,
			unknown
		>;
		expect(insert).toMatchObject({
			project_id: 'project-1',
			title: 'Job applications',
			type_key: 'document.table',
			state_key: 'draft',
			content: '| Company | Stage |\n| --- | --- |',
			created_by: 'actor-1'
		});
		const schema = (
			insert.props as { table: { columns: Array<{ name: string; options?: unknown }> } }
		).table;
		expect(schema.columns[1]!.options).toEqual({
			choices: [{ value: 'Applied', color: 'gray' }]
		});
		expect(rpcCalls).toHaveLength(1);
		expect((rpcCalls[0]!.args.p_ops as TableRowOp[])[0]).toMatchObject({ op: 'insert' });
		expect(createVersionMock).toHaveBeenCalledWith(
			expect.objectContaining({ documentId: DOC_ID, actorId: 'actor-1', changeSource: 'api' })
		);
		expect(addDocumentToTreeMock).toHaveBeenCalledWith(
			client,
			'project-1',
			DOC_ID,
			expect.objectContaining({ parentId: 'parent-1', title: 'Job applications' }),
			'actor-1'
		);
		expect(created.apply?.revision).toBe(1);
		expect(created.table.rows).toHaveLength(1);
		expect(created.warnings).toEqual([expect.stringContaining('unknown column "Bogus"')]);
	});

	it('keeps the table when tree placement fails, reporting a warning', async () => {
		addDocumentToTreeMock.mockRejectedValueOnce(new Error('tree locked'));
		const { client, rpcCalls } = mockClient({
			tables: { onto_documents: [{ data: tableDoc }] }
		});
		const created = await createTableDocument(client, {
			projectId: 'project-1',
			actorId: null,
			title: 'Blank',
			columns: []
		});
		expect(rpcCalls).toHaveLength(0);
		expect(created.apply).toBeNull();
		expect(createVersionMock).not.toHaveBeenCalled();
		expect(created.warnings).toEqual([expect.stringContaining('tree locked')]);
	});

	it('soft-deletes the new document when the initial rows fail', async () => {
		const { client, calls } = mockClient({
			tables: { onto_documents: [{ data: tableDoc }, { data: null }] },
			rpc: [{ data: null, error: { message: 'INVALID_OP: bad', code: '22023' } }]
		});
		await expect(
			createTableDocument(client, {
				projectId: 'project-1',
				actorId: 'actor-1',
				title: 'T',
				columns: [{ name: 'A' }],
				rows: [{ A: 'x' }]
			})
		).rejects.toMatchObject({ code: 'INVALID_OP' });
		expect(calls).toContainEqual(
			expect.objectContaining({ table: 'onto_documents', method: 'update' })
		);
	});

	it('refuses a missing title or a non-table type_key', async () => {
		const { client } = mockClient({});
		await expect(
			createTableDocument(client, { projectId: 'p', actorId: null, title: ' ', columns: [] })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		await expect(
			createTableDocument(client, {
				projectId: 'p',
				actorId: null,
				title: 'T',
				columns: [],
				typeKey: 'document.default'
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});
});

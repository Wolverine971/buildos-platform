// packages/shared-agent-ops/src/gateway/op-execution-gateway.tables.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';
import { previewGatewayTableRowsUpdate } from './op-execution-gateway.tables';
import { extractWriteEntityMeta } from './op-execution-gateway.responses';
import { TableServiceError } from '../tables/table-errors';
import type { LoadedTable, TableApplyResult, TableRow, TableSchema } from '../tables/table-types';

const mocks = vi.hoisted(() => {
	class FakeTableAiFillError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
	return {
		project: {
			id: '10000000-0000-4000-8000-000000000001',
			name: 'Job hunt',
			owner_actor_id: 'owner-1',
			access_level: 'write'
		},
		loadTable: vi.fn(),
		applyTableChanges: vi.fn(),
		createTableDocument: vi.fn(),
		enqueueTableAiFill: vi.fn(),
		writeDocumentHeadAndVersion: vi.fn(),
		assertProjectWriteAccess: vi.fn(),
		logCreateAsync: vi.fn(async () => undefined),
		logUpdateAsync: vi.fn(async () => undefined),
		FakeTableAiFillError
	};
});

vi.mock('../tables/table-repository', () => ({
	loadTable: mocks.loadTable,
	applyTableChanges: mocks.applyTableChanges,
	createTableDocument: mocks.createTableDocument
}));

vi.mock('../tables/table-ai-fill', () => ({
	enqueueTableAiFill: mocks.enqueueTableAiFill,
	TableAiFillError: mocks.FakeTableAiFillError
}));

vi.mock('../ontology/document-write.service', () => ({
	DOCUMENT_VERSION_WRITE_WARNING: 'version warning',
	writeDocumentHeadAndVersion: mocks.writeDocumentHeadAndVersion
}));

vi.mock('../ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(),
	toDocumentSnapshot: vi.fn((document: Record<string, unknown>) => ({ title: document.title }))
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn(async () => 'actor-1')
}));

vi.mock('./op-execution-gateway.access', () => ({
	loadVisibleProjects: vi.fn(async () => ({
		projects: [mocks.project],
		projectMap: new Map([[mocks.project.id, mocks.project]])
	})),
	assertVisibleEntityProject: vi.fn(() => mocks.project),
	assertProjectWriteAccess: mocks.assertProjectWriteAccess,
	assertAccessibleProject: vi.fn((_map: unknown, projectId: unknown) => {
		if (projectId !== mocks.project.id) throw new Error('outside scope');
		return mocks.project;
	}),
	contextActorId: vi.fn(async () => 'actor-1'),
	getProjectIdsForVisibleContext: vi.fn(),
	getProjectIdsOrThrow: vi.fn(),
	withProjectName: vi.fn()
}));

vi.mock('../ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => undefined)
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: mocks.logCreateAsync,
	logUpdateAsync: mocks.logUpdateAsync
}));

vi.mock('../ontology/doc-structure.service', () => ({
	updateDocNodeMetadata: vi.fn(async () => undefined),
	addDocumentToTree: vi.fn(async () => ({}))
}));

vi.mock('./op-execution-gateway.serializers', () => ({
	serializeExternalEntity: vi.fn((_kind: string, entity: Record<string, unknown>) => entity),
	serializeDocumentTree: vi.fn(),
	serializeProjectGraphData: vi.fn()
}));

const TABLE_ID = '20000000-0000-4000-8000-000000000002';

const schema: TableSchema = {
	format: 1,
	revision: 7,
	row_count: 12,
	primary_column_id: 'c_company',
	columns: [
		{ id: 'c_company', name: 'Company', type: 'text' },
		{
			id: 'c_stage',
			name: 'Stage',
			type: 'select',
			options: { choices: [{ value: 'Applied' }, { value: 'Offer' }] }
		},
		{ id: 'c_salary', name: 'Salary', type: 'number' },
		{
			id: 'c_manager',
			name: 'Hiring manager',
			type: 'text',
			ai: { prompt: 'Who hires?', research: true }
		}
	]
};

function row(rowNumber: number, cells: TableRow['cells']): TableRow {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: {},
		version: 3,
		created_by: null,
		updated_by: null,
		created_at: '',
		updated_at: ''
	};
}

function loaded(overrides: Partial<LoadedTable['document']> = {}): LoadedTable {
	return {
		document: {
			id: TABLE_ID,
			project_id: mocks.project.id,
			title: 'Job applications',
			description: null,
			type_key: 'document.table',
			state_key: 'draft',
			updated_at: '2026-10-04T00:00:00Z',
			archived_at: null,
			...overrides
		},
		schema,
		rows: Array.from({ length: 12 }, (_, index) =>
			row(index + 1, {
				c_company: `Company ${index + 1}`,
				c_stage: index % 2 ? 'Offer' : 'Applied',
				c_salary: 100000 + index * 1000
			})
		)
	};
}

function applyResult(results: TableApplyResult['results'], revision = 8): TableApplyResult {
	return { document_id: TABLE_ID, revision, row_count: 12, updated_at: 'now', results };
}

/** Chainable admin stub: each from(table) chain resolves to the next scripted response. */
function admin(
	responses: Record<string, Array<{ data: unknown; error?: unknown; count?: number }>> = {}
) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	return {
		calls,
		client: {
			from(table: string) {
				const next = () => {
					const response = responses[table]?.shift() ?? { data: null };
					return {
						data: response.data,
						error: response.error ?? null,
						count: response.count ?? null
					};
				};
				const builder: Record<string, unknown> = {};
				for (const method of [
					'select',
					'eq',
					'in',
					'is',
					'or',
					'order',
					'range',
					'limit',
					'neq'
				]) {
					builder[method] = (...args: unknown[]) => {
						calls.push({ table, method, args });
						return builder;
					};
				}
				builder.maybeSingle = async () => next();
				builder.single = async () => next();
				builder.then = (resolve: (value: unknown) => unknown) =>
					Promise.resolve(next()).then(resolve);
				return builder;
			}
		}
	};
}

function context(client: unknown = admin().client) {
	return {
		admin: client,
		userId: 'user-1',
		callerId: 'caller-1',
		chatSessionId: 'chat-1',
		scope: { mode: 'read_write', project_ids: [mocks.project.id] }
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.loadTable.mockResolvedValue(loaded());
});

describe('onto.table.get', () => {
	it('returns columns, totals, first rows with handles, and the CSV path', async () => {
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.get'](context(), {
			table_id: TABLE_ID,
			row_limit: 3
		})) as any;
		expect(result.table).toMatchObject({
			id: TABLE_ID,
			project_name: 'Job hunt',
			revision: 7,
			row_count: 12,
			columns: ['Company', 'Stage', 'Salary', 'Hiring manager'],
			csv_path: `/api/onto/tables/${TABLE_ID}/export.csv`
		});
		expect(result.schema_text).toContain('- Stage · select · choices: Applied, Offer');
		expect(result.rows_text).toContain('| r1 | Company 1 | Applied | 100,000 |  |');
		expect(result.rows_text).toContain('Rows 1–3 of 12 · next offset 3');
		expect(result.next_offset).toBe(3);
		expect(result.totals['Salary (sum)']).toBe(1266000);
		expect(JSON.stringify(result).length).toBeLessThan(6000);
		expect(extractWriteEntityMeta({ op: 'onto.table.get', result })).toMatchObject({
			entityKind: 'document',
			entityId: TABLE_ID
		});
	});

	it('returns the whole table as CSV when format is csv', async () => {
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.get'](context(), {
			table_id: TABLE_ID,
			format: 'csv'
		})) as any;
		expect(result.table.content.split('\r\n')).toHaveLength(13);
		expect(result.table.content.startsWith('Company,Stage,Salary,Hiring manager')).toBe(true);
	});

	it('hides tables outside the visible projects and maps non-tables', async () => {
		mocks.loadTable.mockResolvedValueOnce({
			...loaded(),
			document: { ...loaded().document, project_id: 'other' }
		});
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.get'](context(), { table_id: TABLE_ID })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		mocks.loadTable.mockRejectedValueOnce(new TableServiceError('NOT_A_TABLE', 'nope'));
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.get'](context(), { table_id: TABLE_ID })
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('not a table')
		});
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.get'](context(), { table_id: 'r12' })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
	});
});

describe('onto.table.rows.query', () => {
	it('filters, aggregates, groups, and pages with handles', async () => {
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.rows.query'](context(), {
			table_id: TABLE_ID,
			filters: [{ column: 'Stage', op: 'eq', value: 'offer' }],
			sort: [{ column: 'Salary', direction: 'desc' }],
			columns: ['Company', 'Salary'],
			group_by: 'Stage',
			aggregates: [{ fn: 'count' }, { fn: 'sum', column: 'Salary' }],
			limit: 2
		})) as any;
		expect(result.matched_rows).toBe(6);
		expect(result.row_handles).toEqual(['r12', 'r10']);
		expect(result.next_offset).toBe(2);
		expect(result.rows_text.split('\n')[0]).toBe('| row | Company | Salary |');
		expect(result.aggregates).toEqual({ count: 6, 'sum:Salary': 636000 });
		expect(result.groups).toEqual([
			{ label: 'Offer', count: 6, aggregates: { count: 6, 'sum:Salary': 636000 } }
		]);
	});

	it('passes unknown-column warnings back instead of failing', async () => {
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.rows.query'](context(), {
			table_id: TABLE_ID,
			filters: [{ column: 'Location', op: 'eq', value: 'NYC' }]
		})) as any;
		expect(result.warnings).toEqual(['Unknown column "Location" in filters was ignored.']);
		expect(result.matched_rows).toBe(12);
	});
});

describe('onto.table.create', () => {
	const createdTable = (): LoadedTable => ({
		...loaded(),
		rows: [row(1, { c_company: 'Acme' })]
	});

	it('validates rows strictly, creates through the shared service, and returns a receipt', async () => {
		mocks.createTableDocument.mockResolvedValue({
			table: createdTable(),
			apply: applyResult(
				[
					{
						op: 'insert',
						ref: null,
						row_id: 'row-1',
						row_number: 1,
						version: 1,
						before: null,
						after: { cells: { c_company: 'Acme' } }
					}
				],
				1
			),
			warnings: []
		});
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.create'](context(), {
			project_id: mocks.project.id,
			title: 'Job applications',
			columns: [{ name: 'Company' }, { name: 'Salary', type: 'number' }],
			rows: [{ Company: 'Acme', Salary: '$150k' }]
		})) as any;
		expect(mocks.assertProjectWriteAccess).toHaveBeenCalled();
		expect(mocks.createTableDocument).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				projectId: mocks.project.id,
				actorId: 'actor-1',
				title: 'Job applications',
				rows: [{ Company: 'Acme', Salary: '$150k' }],
				source: expect.objectContaining({
					kind: 'agent',
					origin_entity: { kind: 'chat_session', id: 'chat-1' }
				})
			})
		);
		expect(result.table_change).toMatchObject({
			kind: 'table_change',
			rows_added: 1,
			inverse_ops: [{ op: 'delete', row_id: 'row-1', expected_version: 1 }]
		});
		expect(mocks.logCreateAsync).toHaveBeenCalledWith(
			expect.anything(),
			mocks.project.id,
			'document',
			TABLE_ID,
			expect.objectContaining({ table: { columns: 4, rows: 1 } }),
			'user-1',
			'agent_call',
			'chat-1',
			expect.anything()
		);
		expect(extractWriteEntityMeta({ op: 'onto.table.create', result })).toMatchObject({
			entityKind: 'document',
			entityId: TABLE_ID,
			entityProjectId: mocks.project.id
		});
	});

	it('refuses values that do not fit before writing anything', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.create'](context(), {
				project_id: mocks.project.id,
				title: 'T',
				columns: [{ name: 'Salary', type: 'number' }],
				rows: [{ Salary: 'competitive' }, { Location: 'NYC' }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('rows[0]: Salary: "competitive" is not a number')
		});
		expect(mocks.createTableDocument).not.toHaveBeenCalled();
	});

	it('infers columns from csv, letting column hints override by name', async () => {
		mocks.createTableDocument.mockResolvedValue({
			table: createdTable(),
			apply: null,
			warnings: []
		});
		await EXTERNAL_OP_HANDLERS['onto.table.create'](context(), {
			project_id: mocks.project.id,
			title: 'From paste',
			csv: 'Company\tSalary\tZip\nAcme\t$150k\t02134\nBeta\t$90k\t10001\n',
			columns: [{ name: 'zip', type: 'text', description: 'Postal code' }]
		});
		const call = mocks.createTableDocument.mock.calls[0]![1];
		expect(call.columns).toEqual([
			{ name: 'Company', type: 'text' },
			{ name: 'Salary', type: 'number', options: { format: 'currency', currency: 'USD' } },
			{ name: 'Zip', type: 'text', description: 'Postal code' }
		]);
		expect(call.rows).toEqual([
			{ Company: 'Acme', Salary: '$150k', Zip: '02134' },
			{ Company: 'Beta', Salary: '$90k', Zip: '10001' }
		]);
		expect(call.source.kind).toBe('csv');
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.create'](context(), {
				project_id: mocks.project.id,
				title: 'Both',
				csv: 'A\n1',
				rows: [{ A: 1 }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: 'Pass rows or csv, not both.'
		});
	});
});

describe('onto.table.rows.update', () => {
	it('turns handles + column names into guarded row ops with agent sources', async () => {
		mocks.applyTableChanges.mockResolvedValue(
			applyResult([
				{
					op: 'insert',
					ref: 'add-0',
					row_id: 'row-13',
					row_number: 13,
					version: 1,
					before: null,
					after: { cells: { c_company: 'Nova' } }
				},
				{
					op: 'update',
					row_id: 'row-2',
					row_number: 2,
					version: 4,
					before: { cells: { c_stage: 'Offer', c_manager: null } },
					after: { cells: { c_stage: 'Interview', c_manager: 'Jo Lee' } }
				},
				{
					op: 'delete',
					row_id: 'row-5',
					row_number: 5,
					version: 4,
					before: { cells: { c_company: 'Company 5' } },
					after: null
				}
			])
		);
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
			table_id: TABLE_ID,
			add: [{ values: { Company: 'Nova', Salary: '120,000' } }],
			update: [
				{ row: 'r2', values: { Stage: 'Interview' } },
				{
					row: 'R2',
					values: { 'hiring manager': 'Jo Lee' },
					sources: {
						'Hiring manager': {
							urls: ['acme.com/team'],
							note: 'Team page',
							confidence: 'high'
						}
					}
				}
			],
			delete: ['r5']
		})) as any;

		const call = mocks.applyTableChanges.mock.calls[0]![1];
		expect(call.documentId).toBe(TABLE_ID);
		expect(call.actorId).toBe('actor-1');
		expect(call.ops[0]).toEqual({
			op: 'insert',
			ref: 'add-0',
			cells: { c_company: 'Nova', c_salary: 120000 }
		});
		expect(call.ops[1]).toEqual({
			op: 'update',
			row_id: 'row-2',
			cells: { c_stage: 'Interview', c_manager: 'Jo Lee' },
			cell_meta: {
				c_manager: {
					by: 'agent',
					state: 'filled',
					at: expect.any(String),
					source_urls: ['https://acme.com/team'],
					note: 'Team page',
					confidence: 'high'
				}
			},
			expected_version: 3
		});
		expect(call.ops[2]).toEqual({ op: 'delete', row_id: 'row-5', expected_version: 3 });
		// "Interview" is a new Stage option: the schema rides along, guarded by revision.
		expect(
			call.schema.columns[1].options.choices.map((choice: { value: string }) => choice.value)
		).toEqual(['Applied', 'Offer', 'Interview']);
		expect(call.expectedRevision).toBe(7);
		expect(result).toMatchObject({
			rows_added: 1,
			rows_updated: 1,
			rows_deleted: 1,
			added_rows: ['r13']
		});
		expect(result.table_change.columns_changed).toEqual(['Stage']);
		expect(result.message).toBe(
			'Updated table "Job applications": +1 row, 1 row changed, 1 row deleted.'
		);
		expect(mocks.logUpdateAsync).toHaveBeenCalled();
	});

	it('reports every bad handle, column, and value at once and writes nothing', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
				table_id: TABLE_ID,
				update: [
					{ row: 'r99', values: { Stage: 'Offer' } },
					{ row: 'r1', values: { Salary: 'lots', Nope: 1 } }
				],
				delete: ['r1']
			})
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		const error = await EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
			table_id: TABLE_ID,
			update: [
				{ row: 'r99', values: { Stage: 'Offer' } },
				{ row: 'r1', values: { Salary: 'lots', Nope: 1 } }
			],
			delete: ['r1']
		}).catch((caught) => caught);
		expect(error.details.errors).toEqual([
			'update[0]: row "r99" not found (live rows go up to r12; read the table for handles)',
			'update[1] (r1): Salary: "lots" is not a number',
			expect.stringContaining('update[1] (r1): unknown column "Nope"'),
			'delete[0]: r1 is also in update; pick one'
		]);
		expect(mocks.applyTableChanges).not.toHaveBeenCalled();
	});

	it('refuses deleting more than 30% of a table with more than 10 rows unless allowed', async () => {
		const handles = ['r1', 'r2', 'r3', 'r4'];
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
				table_id: TABLE_ID,
				delete: handles
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			details: { reason: 'large_deletion' }
		});
		mocks.applyTableChanges.mockResolvedValue(applyResult([]));
		await EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
			table_id: TABLE_ID,
			delete: handles,
			allow_large_deletion: true
		});
		expect(mocks.applyTableChanges).toHaveBeenCalledTimes(1);
		expect(mocks.applyTableChanges.mock.calls[0]![1].expectedRevision).toBeNull();
	});

	it('re-reads and retries once when a row changed underneath', async () => {
		mocks.applyTableChanges
			.mockRejectedValueOnce(
				new TableServiceError('ROW_CONFLICT', 'row-1 expected 3, found 4')
			)
			.mockResolvedValueOnce(applyResult([]));
		const fresh = loaded();
		fresh.rows[0] = { ...fresh.rows[0]!, version: 4 };
		mocks.loadTable.mockResolvedValueOnce(loaded()).mockResolvedValueOnce(fresh);
		await EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
			table_id: TABLE_ID,
			update: [{ row: 'r1', values: { Stage: 'Offer' } }]
		});
		expect(mocks.applyTableChanges).toHaveBeenCalledTimes(2);
		expect(mocks.applyTableChanges.mock.calls[1]![1].ops[0].expected_version).toBe(4);
	});

	it('refuses writes to archived tables and more than 200 rows per call', async () => {
		mocks.loadTable.mockResolvedValueOnce(loaded({ archived_at: '2026-10-01T00:00:00Z' }));
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
				table_id: TABLE_ID,
				add: [{ values: { Company: 'X' } }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('archived')
		});
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.rows.update'](context(), {
				table_id: TABLE_ID,
				add: Array.from({ length: 201 }, () => ({ values: { Company: 'X' } }))
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('at most 200')
		});
	});
});

describe('onto.table.update', () => {
	it('applies column changes with the new schema under a revision guard and syncs the title', async () => {
		mocks.applyTableChanges.mockResolvedValue(applyResult([]));
		mocks.writeDocumentHeadAndVersion.mockResolvedValue({
			status: 'updated',
			document: {
				id: TABLE_ID,
				title: 'Applications',
				description: null,
				updated_at: 'later',
				archived_at: null
			},
			versionWarning: null,
			versionError: null
		});
		const { client } = admin({
			onto_documents: [
				{ data: { id: TABLE_ID, updated_at: 'head', title: 'Job applications' } }
			]
		});
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.update'](context(client), {
			table_id: TABLE_ID,
			title: 'Applications',
			column_changes: [
				{ action: 'add', name: 'Contact', type: 'email', after: 'Company' },
				{ action: 'rename', column: 'Stage', name: 'Status' }
			]
		})) as any;
		const call = mocks.applyTableChanges.mock.calls[0]![1];
		expect(call.schema.columns.map((column: { name: string }) => column.name)).toEqual([
			'Company',
			'Contact',
			'Status',
			'Salary',
			'Hiring manager'
		]);
		expect(call.expectedRevision).toBe(7);
		expect(mocks.writeDocumentHeadAndVersion).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedUpdatedAt: 'head',
				update: expect.objectContaining({ title: 'Applications' })
			})
		);
		expect(result.table.title).toBe('Applications');
		expect(result.table_change.columns_changed).toEqual(['Contact', 'Status']);
		expect(result.table_change.inverse_schema).toEqual(schema);
	});

	it('starts question-column fills and refuses columns without a question', async () => {
		mocks.enqueueTableAiFill.mockResolvedValue({
			run_id: 'run-1',
			row_count: 12,
			column_id: 'c_manager',
			column_name: 'Hiring manager',
			research: true,
			remaining: 0,
			skipped_filled: 0
		});
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.update'](context(), {
			table_id: TABLE_ID,
			fill_ai_columns: ['hiring manager']
		})) as any;
		expect(mocks.enqueueTableAiFill).toHaveBeenCalledWith(expect.anything(), {
			documentId: TABLE_ID,
			column: 'hiring manager',
			onlyEmpty: true,
			userId: 'user-1',
			actorId: 'actor-1'
		});
		expect(result.ai_fill_runs).toEqual([
			{
				column: 'Hiring manager',
				run_id: 'run-1',
				row_count: 12,
				remaining: 0,
				research: true
			}
		]);
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.update'](context(), {
				table_id: TABLE_ID,
				fill_ai_columns: ['Company']
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('not a question column')
		});
		mocks.enqueueTableAiFill.mockRejectedValueOnce(
			new mocks.FakeTableAiFillError('RUN_ACTIVE', 'already filling')
		);
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.update'](context(), {
				table_id: TABLE_ID,
				fill_ai_columns: ['Hiring manager']
			})
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});

	it('refuses an empty update and bad column changes before writing', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.update'](context(), { table_id: TABLE_ID })
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});
		await expect(
			EXTERNAL_OP_HANDLERS['onto.table.update'](context(), {
				table_id: TABLE_ID,
				title: 'New',
				column_changes: [{ action: 'rename', column: 'Missing', name: 'X' }]
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('Unknown column "Missing"')
		});
		expect(mocks.applyTableChanges).not.toHaveBeenCalled();
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});
});

describe('onto.table.list', () => {
	it('lists live tables across visible projects', async () => {
		const { client, calls } = admin({
			onto_documents: [
				{
					data: [
						{
							id: TABLE_ID,
							project_id: mocks.project.id,
							title: 'Job applications',
							state_key: 'draft',
							props: { table: schema },
							updated_at: 'x'
						},
						{
							id: 'archived',
							project_id: mocks.project.id,
							title: 'Old',
							state_key: 'archived',
							props: {},
							updated_at: 'x'
						}
					],
					count: 2
				}
			]
		});
		const result = (await EXTERNAL_OP_HANDLERS['onto.table.list'](context(client), {})) as any;
		expect(result.tables).toEqual([
			expect.objectContaining({
				id: TABLE_ID,
				project_name: 'Job hunt',
				row_count: 12,
				columns: ['Company', 'Stage', 'Salary', 'Hiring manager']
			})
		]);
		expect(calls).toContainEqual({
			table: 'onto_documents',
			method: 'in',
			args: ['project_id', [mocks.project.id]]
		});
	});
});

describe('previewGatewayTableRowsUpdate', () => {
	it('dry-runs a rows update in either call shape and never writes', async () => {
		const params = {
			admin: admin().client,
			userId: 'user-1',
			scope: { mode: 'read_write' as const }
		};
		const args = {
			table_id: TABLE_ID,
			update: [{ row: 'r1', values: { Stage: 'Offer' } }],
			delete: ['r12']
		};
		const viaParams = await previewGatewayTableRowsUpdate({ ...params, args });
		const viaContext = await previewGatewayTableRowsUpdate(params, args);
		expect(viaParams).toEqual(viaContext);
		expect(viaParams).toMatchObject({
			ok: true,
			data: {
				table_id: TABLE_ID,
				revision: 7,
				preview: {
					rows_updated: 1,
					rows_deleted: 1,
					cells_changed: 1,
					sample: [
						{ row: 'r1', column: 'Stage', before: 'Applied', after: 'Offer' },
						{ row: 'r12', column: 'Company', before: 'Company 12', after: '' }
					]
				},
				summary: '1 row changed, 1 row deleted · 1 cell'
			}
		});
		expect(mocks.applyTableChanges).not.toHaveBeenCalled();
	});

	it('returns validation errors as a result, including schema violations', async () => {
		const params = {
			admin: admin().client,
			userId: 'user-1',
			scope: { mode: 'read_write' as const }
		};
		expect(
			await previewGatewayTableRowsUpdate(params, { table_id: TABLE_ID, bogus: true })
		).toMatchObject({
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: 'Unsupported parameter: bogus' }
		});
		expect(
			await previewGatewayTableRowsUpdate(params, {
				table_id: TABLE_ID,
				update: [{ row: 'r77', values: { Stage: 'x' } }]
			})
		).toMatchObject({
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: expect.stringContaining('r77') }
		});
	});
});

describe('document ops on tables', () => {
	const tableDocument = {
		id: TABLE_ID,
		project_id: mocks.project.id,
		title: 'Job applications',
		description: null,
		content: '| Company |\n| --- |',
		props: { table: schema },
		state_key: 'draft',
		type_key: 'document.table',
		archived_at: null,
		updated_at: '2026-10-04T00:00:00Z'
	};

	it('onto.document.update refuses body edits on a table and names the table tools', async () => {
		for (const bodyArgs of [
			{ content: 'new body' },
			{ edits: [{ old_text: 'Company', new_text: 'Firm' }] },
			{ section_edits: [{ action: 'delete', section: 'x' }] },
			{ props: { table: {} } }
		]) {
			const { client } = admin({ onto_documents: [{ data: tableDocument }] });
			await expect(
				EXTERNAL_OP_HANDLERS['onto.document.update'](context(client), {
					document_id: TABLE_ID,
					...bodyArgs
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				message: expect.stringMatching(/update_onto_table/)
			});
		}
		expect(mocks.writeDocumentHeadAndVersion).not.toHaveBeenCalled();
	});

	it('onto.document.update still allows metadata edits on a table', async () => {
		mocks.writeDocumentHeadAndVersion.mockResolvedValue({
			status: 'updated',
			document: { ...tableDocument, state_key: 'ready' },
			versionWarning: null,
			versionError: null
		});
		const { client } = admin({ onto_documents: [{ data: tableDocument }] });
		await EXTERNAL_OP_HANDLERS['onto.document.update'](context(client), {
			document_id: TABLE_ID,
			state_key: 'ready'
		});
		expect(mocks.writeDocumentHeadAndVersion).toHaveBeenCalledTimes(1);
	});

	it('onto.document.update refuses turning a plain document into a table', async () => {
		const { client } = admin({
			onto_documents: [
				{ data: { ...tableDocument, type_key: 'document.default', props: {} } }
			]
		});
		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.update'](context(client), {
				document_id: TABLE_ID,
				type_key: 'document.table'
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('create_onto_table')
		});
	});

	it('onto.document.create refuses the table type', async () => {
		await expect(
			EXTERNAL_OP_HANDLERS['onto.document.create'](context(), {
				project_id: mocks.project.id,
				title: 'Sneaky table',
				type_key: 'document.table'
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expect.stringContaining('create_onto_table')
		});
	});
});

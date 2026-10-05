// apps/web/src/routes/api/onto/tables/server.test.ts
//
// Route handler tests for the Tables API (docs/specs/tables/CONTRACT.md). The
// shared tables module is mocked: these tests pin the routes' contract (auth,
// validation, one apply per change, conflict mapping, receipts), not the
// module's own parsing/coercion, which the core stream tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TABLE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '33333333-3333-4333-8333-333333333333';
const ROW_ID_2 = '44444444-4444-4444-8444-444444444444';
const PARENT_ID = '55555555-5555-4555-8555-555555555555';

const tables = vi.hoisted(() => {
	class TableServiceError extends Error {
		code: string;
		details?: unknown;
		constructor(code: string, message?: string, details?: unknown) {
			super(message ?? code);
			this.code = code;
			this.details = details;
		}
	}
	return {
		TableServiceError,
		loadTable: vi.fn(),
		createTableDocument: vi.fn(),
		applyTableChanges: vi.fn(),
		importRowsToOps: vi.fn(),
		inferColumns: vi.fn(),
		parseDelimitedText: vi.fn(),
		parseMarkdownTable: vi.fn(),
		computeColumnTotals: vi.fn(),
		applyColumnChanges: vi.fn(),
		buildTableChangeReceipt: vi.fn(),
		tableToCsv: vi.fn(),
		coerceCellValue: vi.fn(),
		normalizeTableSchema: vi.fn()
	};
});

vi.mock('@buildos/shared-agent-ops/tables', () => {
	const resolveColumn = (schema: any, ref: string) =>
		schema.columns.find((c: any) => c.id === ref) ??
		schema.columns.find((c: any) => c.name.toLowerCase() === String(ref).toLowerCase()) ??
		null;
	return {
		TABLE_LIMITS: { maxRows: 10_000, maxColumns: 50, maxOpsPerApply: 1_000 },
		TABLE_COLUMN_TYPES: [
			'text',
			'long_text',
			'number',
			'date',
			'select',
			'multi_select',
			'checkbox',
			'url',
			'email',
			'link'
		],
		TABLE_CHOICE_COLORS: ['gray', 'blue', 'green'],
		isTableTypeKey: (key: unknown) =>
			typeof key === 'string' &&
			(key === 'document.table' || key.startsWith('document.table.')),
		rowHandle: (n: number) => `r${n}`,
		resolveColumn,
		primaryColumn: (schema: any) => schema.columns[0] ?? null,
		cellToText: (_column: unknown, value: unknown) => (value == null ? '' : String(value)),
		withNewChoices: (schema: any, newChoices: Record<string, string[]>) => ({
			...schema,
			columns: schema.columns.map((column: any) =>
				newChoices[column.id]
					? {
							...column,
							options: {
								...(column.options ?? {}),
								choices: [
									...(column.options?.choices ?? []),
									...newChoices[column.id]!.map((value) => ({ value }))
								]
							}
						}
					: column
			)
		}),
		...tables
	};
});

const activity = vi.hoisted(() => ({
	logCreateAsync: vi.fn(),
	logUpdateAsync: vi.fn()
}));
vi.mock('$lib/services/async-activity-logger', () => ({
	...activity,
	getChangeSourceFromRequest: vi.fn(() => 'api'),
	getChatSessionIdFromRequest: vi.fn(() => undefined)
}));
vi.mock('../shared/error-logging', () => ({ logOntologyApiError: vi.fn() }));
vi.mock('$lib/server/ontology-api-error-logging', () => ({ logOntologyApiError: vi.fn() }));

const docStructure = vi.hoisted(() => ({ updateDocNodeMetadata: vi.fn() }));
vi.mock('$lib/services/ontology/doc-structure.service', () => docStructure);

const organizer = vi.hoisted(() => ({ prepareRelationshipMutationPlan: vi.fn() }));
vi.mock('$lib/services/ontology/auto-organizer.service', () => organizer);
vi.mock('@buildos/agentic-chat-runtime/tools', () => ({ TASK_DOCUMENT_REL: 'task_has_document' }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function schemaFixture(overrides: Record<string, unknown> = {}) {
	return {
		format: 1,
		revision: 7,
		row_count: 2,
		columns: [
			{ id: 'c_company', name: 'Company', type: 'text' },
			{ id: 'c_salary', name: 'Salary', type: 'number' },
			{
				id: 'c_stage',
				name: 'Stage',
				type: 'select',
				options: { choices: [{ value: 'Applied' }] }
			},
			{ id: 'c_task', name: 'Task', type: 'link' }
		],
		...overrides
	};
}

function documentFixture() {
	return {
		id: TABLE_ID,
		project_id: PROJECT_ID,
		title: 'Job applications',
		description: null,
		type_key: 'document.table',
		state_key: 'draft',
		updated_at: '2026-10-04T12:00:00.000Z',
		archived_at: null
	};
}

function rowFixture(id: string, rowNumber: number, cells: Record<string, unknown>) {
	return {
		id,
		row_number: rowNumber,
		position: rowNumber,
		cells,
		cell_meta: {},
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '2026-10-04T12:00:00.000Z',
		updated_at: '2026-10-04T12:00:00.000Z'
	};
}

function loadedTableFixture(schemaOverrides: Record<string, unknown> = {}) {
	return {
		document: documentFixture(),
		schema: schemaFixture(schemaOverrides),
		rows: [
			rowFixture(ROW_ID, 1, { c_company: 'Acme', c_salary: 150000, c_stage: 'Applied' }),
			rowFixture(ROW_ID_2, 2, { c_company: 'Globex' })
		]
	};
}

function applyFixture(revision = 8) {
	return {
		document_id: TABLE_ID,
		revision,
		row_count: 2,
		updated_at: '2026-10-04T12:01:00.000Z',
		results: [
			{
				op: 'update',
				row_id: ROW_ID,
				row_number: 1,
				version: 2,
				before: { cells: { c_stage: 'Applied' } },
				after: { cells: { c_stage: 'Interview' } }
			}
		]
	};
}

function receiptFixture(overrides: Record<string, unknown> = {}) {
	return {
		kind: 'table_change',
		document_id: TABLE_ID,
		project_id: PROJECT_ID,
		title: 'Job applications',
		revision: 8,
		rows_added: 0,
		rows_updated: 1,
		rows_deleted: 0,
		cells_changed: 1,
		columns_changed: [],
		sample: [],
		inverse_ops: [
			{ op: 'update', row_id: ROW_ID, cells: { c_stage: 'Applied' }, expected_version: 2 }
		],
		inverse_schema: null,
		applied_revision: 8,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Supabase + locals mock
// ---------------------------------------------------------------------------

type SupabaseState = {
	hasAccess: boolean;
	document: Record<string, unknown> | null;
	project: Record<string, unknown> | null;
	parent: Record<string, unknown> | null;
	inserts: Array<{ table: string; payload: any }>;
	updates: Array<{ table: string; payload: any }>;
	rpcCalls: Array<{ fn: string; args: any }>;
	taskRpcResult: { data: unknown; error: unknown };
};

function createSupabase(overrides: Partial<SupabaseState> = {}) {
	const state: SupabaseState = {
		hasAccess: true,
		document: { ...documentFixture(), props: { table: schemaFixture() } },
		project: { id: PROJECT_ID },
		parent: null,
		inserts: [],
		updates: [],
		rpcCalls: [],
		taskRpcResult: {
			data: {
				task: { id: 'task-1', title: 'Acme', type_key: 'task.default', state_key: 'todo' }
			},
			error: null
		},
		...overrides
	};

	const builder = (table: string) => {
		let filters: Record<string, unknown> = {};
		const result = () => {
			if (table === 'onto_projects') return { data: state.project, error: null };
			if (table === 'onto_documents') {
				if (filters.id === PARENT_ID) return { data: state.parent, error: null };
				return { data: state.document, error: null };
			}
			return { data: null, error: null };
		};
		const chain: any = {
			select: () => chain,
			eq: (column: string, value: unknown) => {
				filters = { ...filters, [column]: value };
				return chain;
			},
			is: () => chain,
			in: () => chain,
			maybeSingle: () => Promise.resolve(result()),
			single: () => Promise.resolve(result()),
			insert: (payload: unknown) => {
				state.inserts.push({ table, payload });
				return Promise.resolve({ data: null, error: null });
			},
			update: (payload: unknown) => {
				state.updates.push({ table, payload });
				const updateChain: any = {
					eq: () => updateChain,
					is: () => Promise.resolve({ data: null, error: null })
				};
				return updateChain;
			}
		};
		return chain;
	};

	const supabase = {
		rpc: vi.fn(async (fn: string, args: any) => {
			state.rpcCalls.push({ fn, args });
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'current_actor_has_project_member_access') {
				return { data: state.hasAccess, error: null };
			}
			if (fn === 'onto_task_create_with_relationships_atomic') return state.taskRpcResult;
			return { data: null, error: null };
		}),
		from: vi.fn((table: string) => builder(table))
	};
	return { supabase, state };
}

function makeEvent(options: {
	method: string;
	url: string;
	body?: unknown;
	params?: Record<string, string>;
	supabase: unknown;
	userId?: string | null;
}) {
	const request = new Request(`http://localhost${options.url}`, {
		method: options.method,
		headers: { 'Content-Type': 'application/json' },
		body: options.body === undefined ? undefined : JSON.stringify(options.body)
	});
	return {
		request,
		params: options.params ?? {},
		locals: {
			supabase: options.supabase,
			safeGetSession: vi
				.fn()
				.mockResolvedValue(
					options.userId === null
						? { user: null }
						: { user: { id: options.userId ?? 'user-1' } }
				)
		}
	} as any;
}

async function readJson(response: Response) {
	return (await response.json()) as Record<string, any>;
}

beforeEach(() => {
	vi.clearAllMocks();
	tables.normalizeTableSchema.mockImplementation((raw: any) => raw ?? schemaFixture());
	tables.coerceCellValue.mockImplementation((column: any, raw: unknown) => {
		if (column.type === 'number') {
			const parsed = Number(String(raw).replace(/[$,k]/gi, ''));
			if (!Number.isFinite(parsed)) return { value: null, error: 'not a number' };
			return { value: /k$/i.test(String(raw)) ? parsed * 1000 : parsed };
		}
		return { value: raw };
	});
	tables.buildTableChangeReceipt.mockImplementation(() => receiptFixture());
	tables.applyTableChanges.mockResolvedValue(applyFixture());
	tables.loadTable.mockResolvedValue(loadedTableFixture());
	organizer.prepareRelationshipMutationPlan.mockResolvedValue({ edges: [] });
	docStructure.updateDocNodeMetadata.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// POST /api/onto/tables
// ---------------------------------------------------------------------------

describe('POST /api/onto/tables', () => {
	it('imports CSV: infers columns, creates the table, applies rows in one batch', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase();
		tables.parseDelimitedText.mockReturnValue({
			headers: ['Company', 'Salary'],
			rows: [
				['Acme', '$150k'],
				['Globex', '120000']
			],
			delimiter: ','
		});
		tables.inferColumns.mockReturnValue([
			{ name: 'Company', type: 'text' },
			{ name: 'Salary', type: 'number' }
		]);
		const created = loadedTableFixture({ row_count: 0 });
		tables.createTableDocument.mockResolvedValue({ table: created, apply: null, warnings: [] });
		tables.importRowsToOps.mockReturnValue({
			ops: [
				{ op: 'insert', cells: { c_company: 'Acme' } },
				{ op: 'insert', cells: { c_company: 'Globex' } }
			],
			errors: ['r2 Salary: kept as text']
		});

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				body: {
					project_id: PROJECT_ID,
					title: 'Job applications',
					csv: 'Company,Salary\nAcme,$150k\nGlobex,120000',
					parent_id: null
				}
			})
		);

		expect(response.status).toBe(200);
		const payload = await readJson(response);
		expect(payload.data.table.document.id).toBe(TABLE_ID);
		expect(payload.data.warnings).toEqual(['r2 Salary: kept as text']);
		expect(tables.createTableDocument).toHaveBeenCalledWith(
			supabase,
			expect.objectContaining({
				projectId: PROJECT_ID,
				actorId: 'actor-1',
				title: 'Job applications',
				columns: [
					{ name: 'Company', type: 'text' },
					{ name: 'Salary', type: 'number' }
				],
				rows: undefined,
				source: { kind: 'csv' }
			})
		);
		expect(tables.importRowsToOps).toHaveBeenCalledWith(
			created.schema,
			[
				['Acme', '$150k'],
				['Globex', '120000']
			],
			['Company', 'Salary']
		);
		expect(tables.applyTableChanges).toHaveBeenCalledTimes(1);
		expect(tables.applyTableChanges).toHaveBeenCalledWith(supabase, {
			documentId: TABLE_ID,
			ops: expect.arrayContaining([{ op: 'insert', cells: { c_company: 'Acme' } }]),
			actorId: 'actor-1'
		});
		expect(activity.logCreateAsync).toHaveBeenCalledWith(
			supabase,
			PROJECT_ID,
			'document',
			TABLE_ID,
			expect.objectContaining({ type_key: 'document.table' }),
			'user-1',
			'api',
			undefined
		);
	});

	it('creates a blank table from columns without an import batch', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase();
		tables.createTableDocument.mockResolvedValue({
			table: loadedTableFixture({ row_count: 0 }),
			apply: null,
			warnings: []
		});

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				body: {
					project_id: PROJECT_ID,
					title: 'Tracker',
					columns: [{ name: 'Name' }, { name: 'Done', type: 'checkbox' }]
				}
			})
		);

		expect(response.status).toBe(200);
		expect(tables.createTableDocument).toHaveBeenCalledWith(
			supabase,
			expect.objectContaining({
				columns: [{ name: 'Name' }, { name: 'Done', type: 'checkbox' }],
				source: { kind: 'blank' }
			})
		);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});

	it('requires exactly one source', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				body: {
					project_id: PROJECT_ID,
					title: 'Two sources',
					csv: 'a,b',
					markdown: '| a | b |\n|---|---|'
				}
			})
		);
		expect(response.status).toBe(400);
		expect((await readJson(response)).error).toMatch(/exactly one/);
		expect(tables.createTableDocument).not.toHaveBeenCalled();
	});

	it('rejects a parent document from another project', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase({
			parent: { id: PARENT_ID, project_id: '99999999-9999-4999-8999-999999999999' }
		});
		tables.parseMarkdownTable.mockReturnValue({ headers: ['A'], rows: [['1']] });
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				body: {
					project_id: PROJECT_ID,
					title: 'Live table',
					markdown: '| A |\n|---|\n| 1 |',
					parent_id: PARENT_ID
				}
			})
		);
		expect(response.status).toBe(400);
		expect(tables.createTableDocument).not.toHaveBeenCalled();
	});

	it('refuses users without write access', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase({ hasAccess: false });
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				body: { project_id: PROJECT_ID, title: 'T', columns: [{ name: 'A' }] }
			})
		);
		expect(response.status).toBe(403);
		expect(tables.createTableDocument).not.toHaveBeenCalled();
	});

	it('requires a session', async () => {
		const { POST } = await import('./+server');
		const { supabase } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: '/api/onto/tables',
				supabase,
				userId: null,
				body: { project_id: PROJECT_ID, title: 'T', columns: [{ name: 'A' }] }
			})
		);
		expect(response.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// GET / PATCH /api/onto/tables/[id]
// ---------------------------------------------------------------------------

describe('GET /api/onto/tables/[id]', () => {
	it('returns the table and footer totals', async () => {
		const { GET } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		tables.computeColumnTotals.mockReturnValue({ c_salary: 150000, c_company: 2 });

		const response = await GET(
			makeEvent({
				method: 'GET',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase
			})
		);

		expect(response.status).toBe(200);
		const payload = await readJson(response);
		expect(payload.data.table.rows).toHaveLength(2);
		expect(payload.data.totals).toEqual({ c_salary: 150000, c_company: 2 });
	});

	it('maps a non-table document to 400 NOT_A_TABLE', async () => {
		const { GET } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		tables.loadTable.mockRejectedValue(new tables.TableServiceError('NOT_A_TABLE', 'nope'));

		const response = await GET(
			makeEvent({
				method: 'GET',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase
			})
		);
		expect(response.status).toBe(400);
		expect((await readJson(response)).code).toBe('NOT_A_TABLE');
	});

	it('rejects a malformed id before touching the database', async () => {
		const { GET } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		const response = await GET(
			makeEvent({
				method: 'GET',
				url: '/api/onto/tables/not-a-uuid',
				params: { id: 'not-a-uuid' },
				supabase
			})
		);
		expect(response.status).toBe(400);
		expect(tables.loadTable).not.toHaveBeenCalled();
	});
});

describe('PATCH /api/onto/tables/[id]', () => {
	it('saves column changes as one guarded apply with schema + coercion ops', async () => {
		const { PATCH } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		const before = loadedTableFixture();
		tables.loadTable.mockResolvedValueOnce(before).mockResolvedValueOnce(loadedTableFixture());
		const nextSchema = schemaFixture({
			columns: [
				...schemaFixture().columns,
				{ id: 'c_notes', name: 'Notes', type: 'long_text' }
			]
		});
		const coercionOps = [{ op: 'update', row_id: ROW_ID, cells: { c_salary: 150000 } }];
		tables.applyColumnChanges.mockReturnValue({
			schema: nextSchema,
			rowOps: coercionOps,
			warnings: ['1 cell could not be converted']
		});

		const response = await PATCH(
			makeEvent({
				method: 'PATCH',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase,
				body: {
					column_changes: [{ action: 'add', name: 'Notes', type: 'long_text' }],
					expected_revision: 7
				}
			})
		);

		expect(response.status).toBe(200);
		expect(tables.applyColumnChanges).toHaveBeenCalledWith(before.schema, before.rows, [
			{ action: 'add', name: 'Notes', type: 'long_text' }
		]);
		expect(tables.applyTableChanges).toHaveBeenCalledTimes(1);
		expect(tables.applyTableChanges).toHaveBeenCalledWith(supabase, {
			documentId: TABLE_ID,
			ops: coercionOps,
			schema: nextSchema,
			expectedRevision: 7,
			actorId: 'actor-1'
		});
		expect(tables.buildTableChangeReceipt).toHaveBeenCalledWith(
			expect.objectContaining({ table: before, previousSchema: before.schema })
		);
		const payload = await readJson(response);
		expect(payload.data.receipt.kind).toBe('table_change');
		expect(payload.data.warnings).toEqual(['1 cell could not be converted']);
	});

	it('answers 409 TABLE_CONFLICT when expected_revision is stale', async () => {
		const { PATCH } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		const response = await PATCH(
			makeEvent({
				method: 'PATCH',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase,
				body: {
					column_changes: [{ action: 'delete', column: 'Stage' }],
					expected_revision: 3
				}
			})
		);
		expect(response.status).toBe(409);
		expect((await readJson(response)).code).toBe('TABLE_CONFLICT');
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});

	it('renames the table without a row apply and syncs the tree title', async () => {
		const { PATCH } = await import('./[id]/+server');
		const { supabase, state } = createSupabase();
		const response = await PATCH(
			makeEvent({
				method: 'PATCH',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase,
				body: { title: 'Job hunt 2026' }
			})
		);
		expect(response.status).toBe(200);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
		expect(state.updates).toEqual([
			{ table: 'onto_documents', payload: { title: 'Job hunt 2026' } }
		]);
		expect(docStructure.updateDocNodeMetadata).toHaveBeenCalledWith(
			supabase,
			PROJECT_ID,
			TABLE_ID,
			{ title: 'Job hunt 2026' },
			'actor-1'
		);
		expect((await readJson(response)).data.receipt).toBeNull();
	});

	it('rejects a primary column that is not in the table', async () => {
		const { PATCH } = await import('./[id]/+server');
		const { supabase } = createSupabase();
		const response = await PATCH(
			makeEvent({
				method: 'PATCH',
				url: `/api/onto/tables/${TABLE_ID}`,
				params: { id: TABLE_ID },
				supabase,
				body: { primary_column_id: 'c_missing' }
			})
		);
		expect(response.status).toBe(400);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// POST /api/onto/tables/[id]/rows
// ---------------------------------------------------------------------------

describe('POST /api/onto/tables/[id]/rows', () => {
	it('keys cells by column id, coerces by type and returns an undo receipt', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase();

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: {
					ops: [
						{
							op: 'update',
							row_id: ROW_ID,
							cells: { salary: '$160k' },
							expected_version: 1
						},
						{ op: 'insert', cells: { Company: 'Initech', Salary: '' } },
						{ op: 'delete', row_id: ROW_ID_2, expected_version: 1 }
					]
				}
			})
		);

		expect(response.status).toBe(200);
		expect(tables.loadTable).not.toHaveBeenCalled();
		expect(tables.applyTableChanges).toHaveBeenCalledWith(supabase, {
			documentId: TABLE_ID,
			ops: [
				{ op: 'update', row_id: ROW_ID, cells: { c_salary: 160000 }, expected_version: 1 },
				{ op: 'insert', cells: { c_company: 'Initech' } },
				{ op: 'delete', row_id: ROW_ID_2, expected_version: 1 }
			],
			schema: null,
			expectedRevision: null,
			actorId: 'actor-1'
		});
		const payload = await readJson(response);
		expect(payload.data.apply.revision).toBe(8);
		expect(payload.data.receipt.inverse_ops).toHaveLength(1);
		expect(activity.logUpdateAsync).toHaveBeenCalledWith(
			supabase,
			PROJECT_ID,
			'document',
			TABLE_ID,
			expect.anything(),
			expect.objectContaining({ revision: 8, row_ids: [ROW_ID] }),
			'user-1',
			'api',
			undefined
		);
	});

	it('adds a new select value to the column choices in the same apply', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase();

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: { ops: [{ op: 'update', row_id: ROW_ID, cells: { c_stage: 'Interview' } }] }
			})
		);

		expect(response.status).toBe(200);
		const call = tables.applyTableChanges.mock.calls[0]![1];
		const stage = call.schema.columns.find((column: any) => column.id === 'c_stage');
		expect(stage.options.choices.map((choice: any) => choice.value)).toEqual([
			'Applied',
			'Interview'
		]);
		expect(tables.buildTableChangeReceipt).toHaveBeenCalledWith(
			expect.objectContaining({ previousSchema: expect.objectContaining({ revision: 7 }) })
		);
	});

	it('maps a row version conflict to 409 ROW_CONFLICT', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase();
		tables.applyTableChanges.mockRejectedValue(
			new tables.TableServiceError(
				'ROW_CONFLICT',
				'ROW_CONFLICT: row x expected version 1, found 2'
			)
		);

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: {
					ops: [
						{
							op: 'update',
							row_id: ROW_ID,
							cells: { Company: 'Acme Corp' },
							expected_version: 1
						}
					]
				}
			})
		);
		expect(response.status).toBe(409);
		expect((await readJson(response)).code).toBe('ROW_CONFLICT');
	});

	it('maps a table revision conflict to 409 TABLE_CONFLICT', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase();
		tables.applyTableChanges.mockRejectedValue(new tables.TableServiceError('TABLE_CONFLICT'));
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: { ops: [{ op: 'insert', cells: { Company: 'X' } }], expected_revision: 7 }
			})
		);
		expect(response.status).toBe(409);
		expect((await readJson(response)).code).toBe('TABLE_CONFLICT');
	});

	it('rejects unknown columns and malformed ops without applying', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: {
					ops: [
						{ op: 'insert', cells: { Mystery: 'x' } },
						{ op: 'update', row_id: 'r12', cells: { Company: 'y' } },
						{ op: 'explode' }
					]
				}
			})
		);
		expect(response.status).toBe(400);
		const payload = await readJson(response);
		expect(payload.code).toBe('VALIDATION_ERROR');
		expect(payload.details.errors).toHaveLength(3);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});

	it('refuses read-only members', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase({ hasAccess: false });
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: { ops: [{ op: 'insert', cells: { Company: 'X' } }] }
			})
		);
		expect(response.status).toBe(403);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});

	it('answers 400 NOT_A_TABLE for an ordinary document', async () => {
		const { POST } = await import('./[id]/rows/+server');
		const { supabase } = createSupabase({
			document: { ...documentFixture(), type_key: 'document.default', props: {} }
		});
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows`,
				params: { id: TABLE_ID },
				supabase,
				body: { ops: [{ op: 'insert', cells: {} }] }
			})
		);
		expect(response.status).toBe(400);
		expect((await readJson(response)).code).toBe('NOT_A_TABLE');
	});
});

// ---------------------------------------------------------------------------
// POST /api/onto/tables/[id]/revert-change
// ---------------------------------------------------------------------------

describe('POST /api/onto/tables/[id]/revert-change', () => {
	it('applies the inverse ops guarded by the applied revision', async () => {
		const { POST } = await import('./[id]/revert-change/+server');
		const { supabase } = createSupabase({
			document: {
				...documentFixture(),
				props: { table: schemaFixture({ revision: 8 }) }
			}
		});
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/revert-change`,
				params: { id: TABLE_ID },
				supabase,
				body: { receipt: receiptFixture() }
			})
		);
		expect(response.status).toBe(200);
		expect(tables.applyTableChanges).toHaveBeenCalledWith(supabase, {
			documentId: TABLE_ID,
			ops: [
				{ op: 'update', row_id: ROW_ID, cells: { c_stage: 'Applied' }, expected_version: 2 }
			],
			schema: null,
			expectedRevision: 8,
			actorId: 'actor-1'
		});
		expect((await readJson(response)).data.table.document.id).toBe(TABLE_ID);
	});

	it('refuses to restore an old schema once the table moved on', async () => {
		const { POST } = await import('./[id]/revert-change/+server');
		const { supabase } = createSupabase({
			document: { ...documentFixture(), props: { table: schemaFixture({ revision: 11 }) } }
		});
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/revert-change`,
				params: { id: TABLE_ID },
				supabase,
				body: { receipt: receiptFixture({ inverse_schema: schemaFixture() }) }
			})
		);
		expect(response.status).toBe(409);
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
	});

	it('answers 409 when an affected row changed since', async () => {
		const { POST } = await import('./[id]/revert-change/+server');
		const { supabase } = createSupabase({
			document: { ...documentFixture(), props: { table: schemaFixture({ revision: 10 }) } }
		});
		tables.applyTableChanges.mockRejectedValue(new tables.TableServiceError('ROW_CONFLICT'));
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/revert-change`,
				params: { id: TABLE_ID },
				supabase,
				body: { receipt: receiptFixture() }
			})
		);
		expect(response.status).toBe(409);
		expect(tables.applyTableChanges).toHaveBeenCalledWith(
			supabase,
			expect.objectContaining({ expectedRevision: null })
		);
		expect((await readJson(response)).code).toBe('ROW_CONFLICT');
	});

	it('rejects a receipt for a different table', async () => {
		const { POST } = await import('./[id]/revert-change/+server');
		const { supabase } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/revert-change`,
				params: { id: TABLE_ID },
				supabase,
				body: { receipt: receiptFixture({ document_id: PARENT_ID }) }
			})
		);
		expect(response.status).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// GET /api/onto/tables/[id]/export.csv
// ---------------------------------------------------------------------------

describe('GET /api/onto/tables/[id]/export.csv', () => {
	it('downloads CSV with a filename and a UTF-8 BOM', async () => {
		const { GET } = await import('./[id]/export.csv/+server');
		const { supabase } = createSupabase();
		tables.tableToCsv.mockReturnValue('Company,Salary\r\nAcme,150000\r\n');

		const response = await GET(
			makeEvent({
				method: 'GET',
				url: `/api/onto/tables/${TABLE_ID}/export.csv`,
				params: { id: TABLE_ID },
				supabase
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('Content-Disposition')).toBe(
			`attachment; filename="Job applications.csv"; filename*=UTF-8''Job%20applications.csv`
		);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		expect(new TextDecoder().decode(bytes)).toContain('Acme,150000');
	});
});

// ---------------------------------------------------------------------------
// POST /api/onto/tables/[id]/rows/[rowId]/task
// ---------------------------------------------------------------------------

describe('POST /api/onto/tables/[id]/rows/[rowId]/task', () => {
	it('creates a task in the table project, links it with the row anchor and fills the link cell', async () => {
		const { POST } = await import('./[id]/rows/[rowId]/task/+server');
		const { supabase, state } = createSupabase();

		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows/${ROW_ID}/task`,
				params: { id: TABLE_ID, rowId: ROW_ID },
				supabase,
				body: { link_column: 'Task' }
			})
		);

		expect(response.status).toBe(200);
		const taskCall = state.rpcCalls.find(
			(call) => call.fn === 'onto_task_create_with_relationships_atomic'
		);
		expect(taskCall?.args.p_task).toEqual(
			expect.objectContaining({
				project_id: PROJECT_ID,
				title: 'Acme',
				created_by: 'actor-1',
				props: { table_row: { document_id: TABLE_ID, row_id: ROW_ID, row_number: 1 } }
			})
		);
		expect(state.inserts).toEqual([
			{
				table: 'onto_edges',
				payload: expect.objectContaining({
					project_id: PROJECT_ID,
					src_kind: 'task',
					src_id: 'task-1',
					rel: 'task_has_document',
					dst_kind: 'document',
					dst_id: TABLE_ID,
					props: expect.objectContaining({
						role: 'table_row',
						row_id: ROW_ID,
						row_number: 1
					})
				})
			}
		]);
		expect(tables.applyTableChanges).toHaveBeenCalledWith(supabase, {
			documentId: TABLE_ID,
			ops: [
				{
					op: 'update',
					row_id: ROW_ID,
					cells: { c_task: { kind: 'task', id: 'task-1', label: 'Acme' } }
				}
			],
			actorId: 'actor-1'
		});
		const payload = await readJson(response);
		expect(payload.data.task.id).toBe('task-1');
		expect(payload.data.apply.revision).toBe(8);
	});

	it('falls back to "<table> · r2" when the primary cell is empty and skips the link cell', async () => {
		const { POST } = await import('./[id]/rows/[rowId]/task/+server');
		const { supabase, state } = createSupabase();
		tables.loadTable.mockResolvedValue({
			...loadedTableFixture(),
			rows: [rowFixture(ROW_ID_2, 2, {})]
		});
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows/${ROW_ID_2}/task`,
				params: { id: TABLE_ID, rowId: ROW_ID_2 },
				supabase,
				body: {}
			})
		);
		expect(response.status).toBe(200);
		const taskCall = state.rpcCalls.find(
			(call) => call.fn === 'onto_task_create_with_relationships_atomic'
		);
		expect(taskCall?.args.p_task.title).toBe('Job applications · r2');
		expect(tables.applyTableChanges).not.toHaveBeenCalled();
		expect((await readJson(response)).data.apply).toBeNull();
	});

	it('rejects a link_column that is not a link column', async () => {
		const { POST } = await import('./[id]/rows/[rowId]/task/+server');
		const { supabase, state } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows/${ROW_ID}/task`,
				params: { id: TABLE_ID, rowId: ROW_ID },
				supabase,
				body: { link_column: 'Company' }
			})
		);
		expect(response.status).toBe(400);
		expect(
			state.rpcCalls.some((call) => call.fn === 'onto_task_create_with_relationships_atomic')
		).toBe(false);
	});

	it('answers 404 for a row that is not in the table', async () => {
		const { POST } = await import('./[id]/rows/[rowId]/task/+server');
		const { supabase } = createSupabase();
		const response = await POST(
			makeEvent({
				method: 'POST',
				url: `/api/onto/tables/${TABLE_ID}/rows/${PARENT_ID}/task`,
				params: { id: TABLE_ID, rowId: PARENT_ID },
				supabase,
				body: {}
			})
		);
		expect(response.status).toBe(404);
		expect((await readJson(response)).code).toBe('ROW_NOT_FOUND');
	});
});

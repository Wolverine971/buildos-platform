// apps/web/src/lib/components/tables/fixtures.ts
//
// A realistic job-applications table used by the tables tests and for visual
// checks of TableWorkspace without a backend:
//
//   <TableWorkspace documentId={FIXTURE_DOCUMENT_ID} projectId={FIXTURE_PROJECT_ID}
//     initialTable={buildJobApplicationsTable()} client={createMemoryTableClient()} />
//
// The memory client applies edits, pastes, deletes, column changes and undo in
// memory and simulates a question-column fill, so the whole UI can be poked at.
// Companies, people and URLs are fictional (.example domains).
import type {
	LoadedTable,
	TableApplyResult,
	TableCellMeta,
	TableCellValue,
	TableChangeReceipt,
	TableColumn,
	TableRow,
	TableRowOp,
	TableRowOpResult
} from '@buildos/shared-agent-ops/tables';
import { TableClientError, type TableClient } from './table-client';
import { applyLocalColumnChanges } from './table-view-model';

export const FIXTURE_DOCUMENT_ID = '00000000-0000-4000-8000-00000000a001';
export const FIXTURE_PROJECT_ID = '00000000-0000-4000-8000-00000000b001';

export const COL = {
	company: 'c_comp0001',
	role: 'c_role0001',
	link: 'c_link0001',
	status: 'c_stat0001',
	applied: 'c_appl0001',
	salary: 'c_sala0001',
	remote: 'c_remo0001',
	contact: 'c_cont0001',
	notes: 'c_note0001',
	manager: 'c_hmgr0001'
} as const;

export const jobApplicationColumns: TableColumn[] = [
	{ id: COL.company, name: 'Company', type: 'text', width: 200 },
	{ id: COL.role, name: 'Role', type: 'text', width: 220 },
	{ id: COL.link, name: 'Link', type: 'url', width: 200 },
	{
		id: COL.status,
		name: 'Status',
		type: 'select',
		description: 'Where this application stands.',
		options: {
			choices: [
				{ value: 'Researching', color: 'gray' },
				{ value: 'Applied', color: 'blue' },
				{ value: 'Interview', color: 'yellow' },
				{ value: 'Offer', color: 'green' },
				{ value: 'Rejected', color: 'red' }
			]
		},
		width: 150
	},
	{ id: COL.applied, name: 'Applied', type: 'date', width: 130 },
	{
		id: COL.salary,
		name: 'Salary',
		type: 'number',
		options: { format: 'currency', currency: 'USD', decimals: 0 },
		width: 130
	},
	{ id: COL.remote, name: 'Remote', type: 'checkbox', width: 96 },
	{ id: COL.contact, name: 'Contact', type: 'email', width: 210 },
	{ id: COL.notes, name: 'Notes', type: 'long_text', width: 280 },
	{
		id: COL.manager,
		name: 'Hiring manager',
		type: 'text',
		description: 'Found by the question column; check the sources.',
		ai: { prompt: 'Who is the hiring manager for this role?', research: true },
		width: 190
	}
];

const AT = '2026-10-04T15:00:00.000Z';

function aiMeta(meta: Partial<TableCellMeta>): TableCellMeta {
	return { by: 'ai_column', state: 'filled', at: AT, run_id: 'run_fixture_1', ...meta };
}

type Seed = {
	cells: Record<string, TableCellValue>;
	meta?: Record<string, TableCellMeta>;
};

const seeds: Seed[] = [
	{
		cells: {
			[COL.company]: 'Northwind Labs',
			[COL.role]: 'Forward Deployed Engineer',
			[COL.link]: 'https://careers.northwind.example/jobs/fde-east',
			[COL.status]: 'Interview',
			[COL.applied]: '2026-09-12',
			[COL.salary]: 185000,
			[COL.remote]: true,
			[COL.contact]: 'maya.chen@northwind.example',
			[COL.notes]:
				'Second round on Oct 8 — systems design. Review the queue worker story and the lock-order fix.',
			[COL.manager]: 'Priya Raman'
		},
		meta: {
			[COL.manager]: aiMeta({
				source_urls: [
					'https://northwind.example/team',
					'https://www.linkedin.example/in/priya-raman'
				],
				note: 'Team page lists Priya Raman as Head of Field Engineering, which owns FDE hiring.',
				confidence: 'high'
			})
		}
	},
	{
		cells: {
			[COL.company]: 'Lumen Health',
			[COL.role]: 'Solutions Engineer',
			[COL.link]: 'https://lumenhealth.example/careers/solutions-engineer',
			[COL.status]: 'Applied',
			[COL.applied]: '2026-09-20',
			[COL.salary]: 160000,
			[COL.remote]: true,
			[COL.contact]: 'recruiting@lumenhealth.example'
		},
		meta: {
			[COL.salary]: {
				by: 'agent',
				source_urls: ['https://salaries.example/lumen-health/solutions-engineer'],
				note: 'Posted band is $150k–$170k; midpoint used.',
				confidence: 'medium',
				at: AT
			},
			[COL.manager]: aiMeta({ state: 'pending' })
		}
	},
	{
		cells: {
			[COL.company]: 'Cobalt Robotics',
			[COL.role]: 'Founding Engineer, Deployments',
			[COL.link]: 'https://cobalt-robotics.example/jobs/42',
			[COL.status]: 'Researching',
			[COL.remote]: false,
			[COL.notes]: 'Baltimore office. Ask about on-site cadence.'
		},
		meta: {
			[COL.manager]: aiMeta({
				state: 'error',
				error: 'No public team page or posting names a manager.'
			})
		}
	},
	{
		cells: {
			[COL.company]: 'Harbor Analytics',
			[COL.role]: 'Forward Deployed Engineer',
			[COL.link]: 'https://harbor-analytics.example/careers/fde',
			[COL.status]: 'Offer',
			[COL.applied]: '2026-08-28',
			[COL.salary]: 195000,
			[COL.remote]: true,
			[COL.contact]: 'dana@harbor-analytics.example',
			[COL.notes]: 'Offer expires Oct 15. Equity 0.15%.',
			[COL.manager]: 'Dana Whitfield'
		},
		meta: {
			[COL.manager]: aiMeta({
				source_urls: ['https://harbor-analytics.example/about'],
				note: 'Dana signed the offer letter and is listed as VP Customer Engineering.',
				confidence: 'high'
			})
		}
	},
	{
		cells: {
			[COL.company]: 'Fieldstone',
			[COL.role]: 'Customer Engineer',
			[COL.status]: 'Rejected',
			[COL.applied]: '2026-08-15',
			[COL.salary]: 150000,
			[COL.remote]: false,
			[COL.notes]: 'Wanted more Kubernetes depth.'
		}
	},
	{
		cells: {
			[COL.company]: 'Quill & Ledger',
			[COL.role]: 'Applied AI Engineer',
			[COL.link]: 'https://quill-ledger.example/jobs/applied-ai',
			[COL.status]: 'Applied',
			[COL.applied]: '2026-09-25',
			[COL.salary]: 175000,
			[COL.remote]: true,
			[COL.manager]: 'Sam Okafor'
		},
		meta: {
			[COL.manager]: aiMeta({
				source_urls: ['https://quill-ledger.example/blog/hiring-applied-ai'],
				note: 'Blog post announcing the role is signed by Sam Okafor, Engineering Manager.',
				confidence: 'medium'
			})
		}
	},
	{
		cells: {
			[COL.company]: 'Tidewater Systems',
			[COL.role]: 'Deployment Strategist',
			[COL.status]: 'Interview',
			[COL.applied]: '2026-09-02',
			[COL.salary]: 170000,
			[COL.remote]: false,
			[COL.contact]: 'jordan.lee@tidewater.example',
			[COL.notes]: 'Panel with the DC public-sector team next week.'
		}
	},
	{
		cells: {
			[COL.company]: 'Brightline Freight',
			[COL.role]: 'Solutions Architect',
			[COL.link]: 'https://brightline-freight.example/careers',
			[COL.status]: 'Researching',
			[COL.remote]: true
		}
	},
	{
		cells: {
			[COL.company]: 'Mosaic Learning',
			[COL.role]: 'Forward Deployed Engineer',
			[COL.status]: 'Applied',
			[COL.applied]: '2026-09-30',
			[COL.salary]: 165000,
			[COL.remote]: true,
			[COL.manager]: 'Elena Park'
		},
		meta: {
			[COL.manager]: aiMeta({
				source_urls: ['https://mosaic-learning.example/team'],
				note: 'Team page shows Elena Park leading Deployments; low certainty she owns this req.',
				confidence: 'low'
			})
		}
	},
	{
		cells: {
			[COL.company]: 'Keystone Grid',
			[COL.role]: 'Technical Account Engineer',
			[COL.status]: 'Rejected',
			[COL.applied]: '2026-08-05',
			[COL.salary]: 140000,
			[COL.remote]: false
		}
	},
	{
		cells: {
			[COL.company]: 'Arcadia Bio',
			[COL.role]: 'Field Engineer, Data Platform',
			[COL.link]: 'https://arcadia-bio.example/jobs/field-engineer',
			[COL.status]: 'Interview',
			[COL.applied]: '2026-09-18',
			[COL.salary]: 180000,
			[COL.remote]: true,
			[COL.notes]: 'Take-home due Oct 10.'
		}
	},
	{
		cells: {
			[COL.company]: 'Signal Peak',
			[COL.role]: 'Founding Solutions Engineer',
			[COL.status]: 'Researching',
			[COL.remote]: true
		}
	}
];

function buildRow(seed: Seed, index: number): TableRow {
	return {
		id: `00000000-0000-4000-8000-0000000c${String(index + 1).padStart(4, '0')}`,
		row_number: index + 1,
		position: (index + 1) * 1024,
		cells: structuredClone(seed.cells),
		cell_meta: structuredClone(seed.meta ?? {}),
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: AT,
		updated_at: AT
	};
}

export function buildJobApplicationsTable(): LoadedTable {
	const rows = seeds.map(buildRow);
	return {
		document: {
			id: FIXTURE_DOCUMENT_ID,
			project_id: FIXTURE_PROJECT_ID,
			title: 'Job applications',
			description: 'Every role in flight, with status and follow-ups.',
			type_key: 'document.table',
			state_key: 'draft',
			updated_at: AT,
			archived_at: null
		},
		schema: {
			format: 1,
			columns: jobApplicationColumns.map((column) => ({ ...column })),
			primary_column_id: COL.company,
			revision: 7,
			row_count: rows.length,
			source: { kind: 'csv', filename: 'job-applications.csv', created_at: AT }
		},
		rows
	};
}

/** Shared instance for visual checks; tests call buildJobApplicationsTable() for a private copy. */
export const jobApplicationsTable: LoadedTable = buildJobApplicationsTable();

// ---------------------------------------------------------------------------
// In-memory client (previews + visual checks; never used in production code)
// ---------------------------------------------------------------------------

function isBlank(value: TableCellValue | undefined): boolean {
	return (
		value === null ||
		value === undefined ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

export function createMemoryTableClient(
	seed: LoadedTable = buildJobApplicationsTable(),
	opts: { latencyMs?: number; fillPerPoll?: number } = {}
): TableClient {
	let table: LoadedTable = structuredClone(seed);
	const deleted = new Map<string, TableRow>();
	const fills = new Map<
		string,
		{ columnId: string; rowIds: string[]; done: number; total: number }
	>();
	let nextRowNumber = table.rows.reduce((max, row) => Math.max(max, row.row_number), 0) + 1;
	let nextColumn = 1;
	const latency = opts.latencyMs ?? 120;
	const fillPerPoll = opts.fillPerPoll ?? 2;
	const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency));
	const snapshot = () => structuredClone(table);
	const now = () => new Date().toISOString();

	function bump(): number {
		table.schema.revision += 1;
		table.schema.row_count = table.rows.length;
		table.document.updated_at = now();
		return table.schema.revision;
	}

	function applyOps(ops: TableRowOp[], checkVersions: boolean): TableRowOpResult[] {
		const results: TableRowOpResult[] = [];
		for (const op of ops) {
			if (op.op === 'insert') {
				const row: TableRow = {
					id: `mem-${nextRowNumber}-${Math.random().toString(36).slice(2, 8)}`,
					row_number: nextRowNumber++,
					position: (table.rows.length + 1) * 1024,
					cells: {},
					cell_meta: { ...(op.cell_meta ?? {}) },
					version: 1,
					created_by: null,
					updated_by: null,
					created_at: now(),
					updated_at: now()
				};
				for (const [key, value] of Object.entries(op.cells))
					if (!isBlank(value)) row.cells[key] = value;
				const after = op.after_row_id
					? table.rows.findIndex((r) => r.id === op.after_row_id)
					: -1;
				if (after === -1) table.rows.push(row);
				else table.rows.splice(after + 1, 0, row);
				results.push({
					op: 'insert',
					ref: op.ref ?? null,
					row_id: row.id,
					row_number: row.row_number,
					version: 1,
					before: null,
					after: { cells: { ...row.cells }, cell_meta: { ...row.cell_meta } }
				});
			} else if (op.op === 'update') {
				const row = table.rows.find((r) => r.id === op.row_id);
				if (!row)
					throw new TableClientError('ROW_NOT_FOUND: row is gone', 404, 'ROW_NOT_FOUND');
				if (
					checkVersions &&
					op.expected_version !== undefined &&
					op.expected_version !== row.version
				) {
					throw new TableClientError('ROW_CONFLICT: row changed', 409, 'ROW_CONFLICT');
				}
				const before: Record<string, TableCellValue> = {};
				const beforeMeta: Record<string, TableCellMeta | null> = {};
				for (const [key, value] of Object.entries(op.cells ?? {})) {
					before[key] = row.cells[key] ?? null;
					beforeMeta[key] = row.cell_meta[key] ?? null;
					if (isBlank(value)) delete row.cells[key];
					else row.cells[key] = value;
					const meta = op.cell_meta?.[key];
					if (meta) row.cell_meta[key] = meta;
					else delete row.cell_meta[key];
				}
				row.version += 1;
				row.updated_at = now();
				const afterCells: Record<string, TableCellValue> = {};
				for (const key of Object.keys(op.cells ?? {}))
					afterCells[key] = row.cells[key] ?? null;
				const afterMeta: Record<string, TableCellMeta> = {};
				for (const key of Object.keys(op.cells ?? {})) {
					const meta = row.cell_meta[key];
					if (meta) afterMeta[key] = meta;
				}
				results.push({
					op: 'update',
					row_id: row.id,
					row_number: row.row_number,
					version: row.version,
					before: { cells: before, cell_meta: beforeMeta },
					after: { cells: afterCells, cell_meta: afterMeta }
				});
			} else if (op.op === 'delete') {
				const index = table.rows.findIndex((r) => r.id === op.row_id);
				if (index === -1)
					throw new TableClientError('ROW_NOT_FOUND: row is gone', 404, 'ROW_NOT_FOUND');
				const [row] = table.rows.splice(index, 1);
				deleted.set(row!.id, { ...row!, position: index });
				results.push({
					op: 'delete',
					row_id: row!.id,
					row_number: row!.row_number,
					version: row!.version,
					before: { cells: { ...row!.cells } },
					after: null
				});
			} else if (op.op === 'restore') {
				const row = deleted.get(op.row_id);
				if (!row) continue;
				deleted.delete(op.row_id);
				table.rows.splice(Math.min(row.position, table.rows.length), 0, {
					...row,
					position: row.position * 1024
				});
				results.push({
					op: 'restore',
					row_id: row.id,
					row_number: row.row_number,
					version: row.version,
					before: null,
					after: { cells: { ...row.cells } }
				});
			}
		}
		return results;
	}

	function receiptFor(results: TableRowOpResult[], revision: number): TableChangeReceipt {
		const inverse: TableRowOp[] = [];
		for (const result of [...results].reverse()) {
			if (result.op === 'insert') inverse.push({ op: 'delete', row_id: result.row_id });
			else if (result.op === 'delete') inverse.push({ op: 'restore', row_id: result.row_id });
			else if (result.op === 'update') {
				inverse.push({
					op: 'update',
					row_id: result.row_id,
					cells: result.before?.cells ?? {},
					cell_meta: result.before?.cell_meta ?? {}
				});
			}
		}
		return {
			kind: 'table_change',
			document_id: table.document.id,
			project_id: table.document.project_id,
			title: table.document.title,
			revision,
			rows_added: results.filter((r) => r.op === 'insert').length,
			rows_updated: results.filter((r) => r.op === 'update').length,
			rows_deleted: results.filter((r) => r.op === 'delete').length,
			cells_changed: results.reduce(
				(n, r) => n + Object.keys(r.after?.cells ?? {}).length,
				0
			),
			columns_changed: [],
			sample: [],
			inverse_ops: inverse,
			applied_revision: revision
		};
	}

	function applyResult(results: TableRowOpResult[], revision: number): TableApplyResult {
		return {
			document_id: table.document.id,
			revision,
			row_count: table.rows.length,
			updated_at: table.document.updated_at,
			results
		};
	}

	return {
		async createTable() {
			await wait();
			return { table: snapshot(), warnings: [] };
		},
		async getTable() {
			await wait();
			return { table: snapshot(), totals: {}, rowTasks: {} };
		},
		async patchTable(_documentId, input) {
			await wait();
			const before = structuredClone(table.schema);
			for (const change of input.column_changes ?? []) {
				if (change.action === 'add') {
					const { action: _action, after, ...column } = change;
					const created: TableColumn = {
						...column,
						id: `c_new${String(nextColumn++).padStart(5, '0')}`,
						type: column.type ?? 'text'
					};
					const index = after
						? table.schema.columns.findIndex((c) => c.id === after)
						: -1;
					if (index === -1) table.schema.columns.push(created);
					else table.schema.columns.splice(index + 1, 0, created);
				} else if (change.action === 'retype') {
					table.schema.columns = table.schema.columns.map((c) =>
						c.id === change.column
							? { ...c, type: change.type, options: change.options ?? c.options }
							: c
					);
				} else {
					table.schema = applyLocalColumnChanges(table.schema, [change]);
				}
			}
			if (input.title !== undefined) table.document.title = input.title;
			if (input.description !== undefined) table.document.description = input.description;
			if (input.views !== undefined) table.schema.views = input.views;
			if (input.primary_column_id !== undefined)
				table.schema.primary_column_id = input.primary_column_id;
			const revision = bump();
			const receipt = input.column_changes?.length
				? {
						...receiptFor([], revision),
						columns_changed: input.column_changes.map((c) =>
							'column' in c ? c.column : c.name
						),
						inverse_schema: before
					}
				: null;
			return { table: snapshot(), receipt };
		},
		async applyRows(_documentId, input) {
			await wait();
			const saved = structuredClone(table);
			try {
				const results = applyOps(input.ops, true);
				const revision = bump();
				return {
					apply: applyResult(results, revision),
					receipt: receiptFor(results, revision)
				};
			} catch (error) {
				table = saved;
				throw error;
			}
		},
		async revertChange(_documentId, receipt) {
			await wait();
			if (receipt.inverse_schema)
				table.schema = {
					...structuredClone(receipt.inverse_schema),
					revision: table.schema.revision,
					row_count: table.rows.length
				};
			const results = applyOps(receipt.inverse_ops, false);
			const revision = bump();
			return { apply: applyResult(results, revision), table: snapshot() };
		},
		exportCsvUrl: () => '#memory-table.csv',
		async createTaskFromRow(_documentId, rowId, input = {}) {
			await wait();
			return { task: { id: `task-${rowId}`, title: input.title ?? 'New task' }, apply: null };
		},
		async startAiFill(_documentId, input) {
			await wait();
			const column = table.schema.columns.find((c) => c.id === input.column);
			if (!column)
				throw new TableClientError(
					'VALIDATION_ERROR: unknown column',
					400,
					'VALIDATION_ERROR'
				);
			const targets = table.rows.filter(
				(row) =>
					(!input.row_ids || input.row_ids.includes(row.id)) &&
					(!input.only_empty || isBlank(row.cells[column.id]))
			);
			const runId = `mem-run-${Date.now().toString(36)}`;
			for (const row of targets) {
				row.cell_meta[column.id] = {
					by: 'ai_column',
					state: 'pending',
					run_id: runId,
					at: now()
				};
			}
			fills.set(runId, {
				columnId: column.id,
				rowIds: targets.map((r) => r.id),
				done: 0,
				total: targets.length
			});
			bump();
			return { run_id: runId, row_count: targets.length };
		},
		async getAiFillStatus(_documentId, runId) {
			await wait();
			const fill = fills.get(runId);
			if (!fill) return { status: 'error', filled: 0, failed: 0, total: 0 };
			const batch = fill.rowIds.slice(fill.done, fill.done + fillPerPoll);
			for (const rowId of batch) {
				const row = table.rows.find((r) => r.id === rowId);
				if (!row) continue;
				const company = String(row.cells[COL.company] ?? 'the company');
				row.cells[fill.columnId] = `Answer for ${company}`;
				row.cell_meta[fill.columnId] = {
					by: 'ai_column',
					state: 'filled',
					run_id: runId,
					source_urls: [
						`https://${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example/team`
					],
					note: 'Simulated answer from the in-memory preview client.',
					confidence: 'medium',
					at: now()
				};
				row.version += 1;
			}
			fill.done += batch.length;
			if (batch.length) bump();
			const done = fill.done >= fill.total;
			return {
				status: done ? 'done' : 'running',
				filled: fill.done,
				failed: 0,
				total: fill.total
			};
		}
	};
}

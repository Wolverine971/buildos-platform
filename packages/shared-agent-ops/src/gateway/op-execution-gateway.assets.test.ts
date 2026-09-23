// packages/shared-agent-ops/src/gateway/op-execution-gateway.assets.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT_ASSET_ID = '44444444-4444-4444-8444-444444444444';
const BRAND_DOC_ID = '55555555-5555-4555-8555-555555555555';
const WEBSITE_DOC_ID = '66666666-6666-4666-8666-666666666666';
const DELETED_DOC_ID = '77777777-7777-4777-8777-777777777777';
const FOREIGN_DOC_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
	logUpdate: vi.fn(async () => undefined),
	logCreate: vi.fn(async () => undefined),
	ensureActorId: vi.fn(async () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: mocks.logCreate,
	logUpdateAsync: mocks.logUpdate
}));

vi.mock('../ontology/ontology-projects.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('../ontology/ontology-projects.service')>()),
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: vi.fn(async () => [
		{ id: PROJECT_ID, name: 'Redline', access_level: 'write', state_key: 'active' },
		{ id: OTHER_PROJECT_ID, name: 'Other', access_level: 'write', state_key: 'active' }
	])
}));

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.core';
import { runGatewayWriteOp } from './op-execution-gateway.worker';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Minimal PostgREST-shaped fake over in-memory tables: enough filters for the
 * asset handler (eq / neq / in / is null) and the four verbs it uses.
 */
function createAdmin(tables: Tables) {
	let nextId = 1;
	const calls: Array<{ table: string; verb: string; payload?: unknown }> = [];

	function builder(table: string) {
		const filters: Array<(row: Row) => boolean> = [];
		let verb: 'select' | 'insert' | 'update' | 'delete' = 'select';
		let payload: Row | null = null;
		let orderColumn: string | null = null;

		const run = (): Row[] => {
			const rows = (tables[table] ??= []);
			if (verb === 'insert') {
				const inserted = {
					id: `link-${nextId++}`,
					created_at: new Date().toISOString(),
					...payload
				};
				const duplicate = rows.some(
					(row) =>
						table === 'onto_asset_links' &&
						row.asset_id === inserted.asset_id &&
						row.entity_kind === inserted.entity_kind &&
						row.entity_id === inserted.entity_id &&
						row.role === inserted.role
				);
				if (duplicate) throw Object.assign(new Error('duplicate'), { code: '23505' });
				rows.push(inserted);
				return [inserted];
			}
			const matched = rows.filter((row) => filters.every((filter) => filter(row)));
			if (verb === 'update') {
				for (const row of matched) Object.assign(row, payload);
				return matched;
			}
			if (verb === 'delete') {
				tables[table] = rows.filter((row) => !matched.includes(row));
				return matched;
			}
			return orderColumn
				? [...matched].sort((a, b) =>
						String(a[orderColumn!]).localeCompare(String(b[orderColumn!]))
					)
				: matched;
		};
		const settle = (single: 'many' | 'single' | 'maybe') => {
			try {
				const rows = run();
				if (single === 'many') return { data: rows, error: null };
				if (single === 'single' && rows.length !== 1) {
					return { data: null, error: { message: 'not exactly one row' } };
				}
				return { data: rows[0] ?? null, error: null };
			} catch (error) {
				return { data: null, error };
			}
		};

		const query: Record<string, any> = {
			select: () => query,
			insert: (value: Row) => {
				verb = 'insert';
				payload = value;
				calls.push({ table, verb, payload: value });
				return query;
			},
			update: (value: Row) => {
				verb = 'update';
				payload = value;
				calls.push({ table, verb, payload: value });
				return query;
			},
			delete: () => {
				verb = 'delete';
				calls.push({ table, verb });
				return query;
			},
			eq: (column: string, value: unknown) => {
				filters.push((row) => row[column] === value);
				return query;
			},
			neq: (column: string, value: unknown) => {
				filters.push((row) => row[column] !== value);
				return query;
			},
			in: (column: string, values: unknown[]) => {
				filters.push((row) => values.includes(row[column]));
				return query;
			},
			is: (column: string, value: null) => {
				filters.push((row) => (row[column] ?? null) === value);
				return query;
			},
			order: (column: string) => {
				orderColumn = column;
				return query;
			},
			single: async () => settle('single'),
			maybeSingle: async () => settle('maybe'),
			then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
				Promise.resolve(settle('many')).then(resolve, reject)
		};
		return query;
	}

	return {
		admin: { from: (table: string) => builder(table) },
		calls,
		tables
	};
}

function baseTables(): Tables {
	return {
		onto_assets: [
			{
				id: ASSET_ID,
				project_id: PROJECT_ID,
				kind: 'image',
				original_filename: 'IMG_2231.png',
				caption: null,
				alt_text: null,
				deleted_at: null
			},
			{
				id: OTHER_PROJECT_ASSET_ID,
				project_id: OTHER_PROJECT_ID,
				kind: 'image',
				original_filename: 'other.png',
				caption: null,
				alt_text: null,
				deleted_at: null
			}
		],
		onto_documents: [
			{
				id: BRAND_DOC_ID,
				project_id: PROJECT_ID,
				title: 'Brand guide',
				deleted_at: null,
				archived_at: null
			},
			{
				id: WEBSITE_DOC_ID,
				project_id: PROJECT_ID,
				title: 'Website',
				deleted_at: null,
				archived_at: null
			},
			{
				id: DELETED_DOC_ID,
				project_id: PROJECT_ID,
				title: 'Old notes',
				deleted_at: '2026-09-01T00:00:00.000Z',
				archived_at: null
			},
			{
				id: FOREIGN_DOC_ID,
				project_id: OTHER_PROJECT_ID,
				title: 'Foreign',
				deleted_at: null,
				archived_at: null
			}
		],
		onto_asset_links: []
	};
}

function context(admin: unknown, projectIds: string[] = [PROJECT_ID, OTHER_PROJECT_ID]) {
	return {
		admin,
		userId: USER_ID,
		chatSessionId: 'chat-session-1',
		scope: {
			mode: 'read_write',
			allowed_ops: ['onto.asset.update'],
			project_ids: projectIds,
			write_project_ids: projectIds
		}
	} as never;
}

function documentLinks(tables: Tables): unknown[] {
	return (tables.onto_asset_links ?? [])
		.filter((row) => row.entity_kind === 'document' && row.role === 'attachment')
		.map((row) => row.entity_id);
}

const updateAsset = EXTERNAL_OP_HANDLERS['onto.asset.update'];

describe('onto.asset.update', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('names an image without touching its placement', async () => {
		const fixture = createAdmin(baseTables());

		const result = await updateAsset(context(fixture.admin), {
			asset_id: ASSET_ID,
			caption: '  Redline   logo '
		});

		expect(fixture.tables.onto_assets![0]).toMatchObject({ caption: 'Redline logo' });
		expect(fixture.calls.some((call) => call.table === 'onto_asset_links')).toBe(false);
		expect(result).toEqual({
			asset: {
				id: ASSET_ID,
				project_id: PROJECT_ID,
				caption: 'Redline logo',
				alt_text: null,
				file_name: 'IMG_2231.png'
			},
			placement: { kind: 'images_shelf' },
			message: `Named image "Redline logo"; it stays on the project's Images shelf.`
		});
		// A rename changes no document, so no document activity is logged.
		expect(mocks.logUpdate).not.toHaveBeenCalled();
	});

	it('files an image under a same-project document with the acting actor as creator', async () => {
		const fixture = createAdmin(baseTables());

		const result = await updateAsset(context(fixture.admin), {
			asset_id: ASSET_ID,
			caption: 'Redline logo',
			document_id: BRAND_DOC_ID
		});

		expect(fixture.tables.onto_asset_links).toEqual([
			expect.objectContaining({
				project_id: PROJECT_ID,
				asset_id: ASSET_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'attachment',
				created_by: ACTOR_ID
			})
		]);
		expect(result).toMatchObject({
			placement: {
				kind: 'document',
				document_id: BRAND_DOC_ID,
				document_title: 'Brand guide'
			},
			message: 'Named image "Redline logo" and filed it under "Brand guide".'
		});
		expect(mocks.logUpdate).toHaveBeenCalledTimes(1);
		expect(mocks.logUpdate).toHaveBeenCalledWith(
			fixture.admin,
			PROJECT_ID,
			'document',
			BRAND_DOC_ID,
			{ image_asset_id: ASSET_ID, image_filed: false },
			{ image_asset_id: ASSET_ID, image_filed: true, image_caption: 'Redline logo' },
			USER_ID,
			'agent_call',
			'chat-session-1',
			undefined
		);
	});

	it('moves an image: removes every other document attachment link and keeps one', async () => {
		const tables = baseTables();
		tables.onto_asset_links = [
			{
				id: 'existing-1',
				project_id: PROJECT_ID,
				asset_id: ASSET_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'attachment',
				created_at: '2026-09-01T00:00:00.000Z'
			},
			// Inline/gallery links and task links are not placement; they survive.
			{
				id: 'inline-1',
				project_id: PROJECT_ID,
				asset_id: ASSET_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'inline',
				created_at: '2026-09-01T00:00:00.000Z'
			}
		];
		const fixture = createAdmin(tables);

		const result = await updateAsset(context(fixture.admin), {
			asset_id: ASSET_ID,
			document_id: WEBSITE_DOC_ID
		});

		expect(documentLinks(fixture.tables)).toEqual([WEBSITE_DOC_ID]);
		expect(fixture.tables.onto_asset_links!.map((row) => row.id)).toContain('inline-1');
		expect(result).toMatchObject({
			placement: { kind: 'document', document_id: WEBSITE_DOC_ID, document_title: 'Website' },
			message: 'Filed image "IMG_2231.png" under "Website".'
		});
		expect(mocks.logUpdate).toHaveBeenCalledTimes(2);
		expect(mocks.logUpdate.mock.calls.map((call) => (call as unknown[])[3])).toEqual([
			WEBSITE_DOC_ID,
			BRAND_DOC_ID
		]);
	});

	it('does not duplicate the link when the image is already filed there', async () => {
		const tables = baseTables();
		tables.onto_asset_links = [
			{
				id: 'existing-1',
				project_id: PROJECT_ID,
				asset_id: ASSET_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'attachment',
				created_at: '2026-09-01T00:00:00.000Z'
			}
		];
		const fixture = createAdmin(tables);

		const result = await updateAsset(context(fixture.admin), {
			asset_id: ASSET_ID,
			document_id: BRAND_DOC_ID
		});

		expect(fixture.calls.filter((call) => call.verb === 'insert')).toEqual([]);
		expect(documentLinks(fixture.tables)).toEqual([BRAND_DOC_ID]);
		expect(result).toMatchObject({ placement: { document_id: BRAND_DOC_ID } });
		expect(mocks.logUpdate).not.toHaveBeenCalled();
	});

	it('unfiles an image back to the Images shelf with document_id null', async () => {
		const tables = baseTables();
		tables.onto_asset_links = [
			{
				id: 'existing-1',
				project_id: PROJECT_ID,
				asset_id: ASSET_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'attachment',
				created_at: '2026-09-01T00:00:00.000Z'
			}
		];
		const fixture = createAdmin(tables);

		const result = await updateAsset(context(fixture.admin), {
			asset_id: ASSET_ID,
			document_id: null
		});

		expect(documentLinks(fixture.tables)).toEqual([]);
		expect(result).toMatchObject({
			placement: { kind: 'images_shelf' },
			message: `Filed image "IMG_2231.png" on the project's Images shelf.`
		});
		expect(mocks.logUpdate).toHaveBeenCalledWith(
			fixture.admin,
			PROJECT_ID,
			'document',
			BRAND_DOC_ID,
			{ image_asset_id: ASSET_ID, image_filed: true },
			{ image_asset_id: ASSET_ID, image_filed: false, image_caption: 'IMG_2231.png' },
			USER_ID,
			'agent_call',
			'chat-session-1',
			undefined
		);
	});

	it('rejects a document from another project without writing anything', async () => {
		const fixture = createAdmin(baseTables());

		await expect(
			updateAsset(context(fixture.admin), {
				asset_id: ASSET_ID,
				caption: 'Redline logo',
				document_id: FOREIGN_DOC_ID
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(fixture.calls).toEqual([]);
		expect(fixture.tables.onto_assets![0]!.caption).toBeNull();
	});

	it('rejects a deleted document', async () => {
		const fixture = createAdmin(baseTables());

		await expect(
			updateAsset(context(fixture.admin), { asset_id: ASSET_ID, document_id: DELETED_DOC_ID })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(fixture.calls).toEqual([]);
	});

	it('cannot reach an image outside the admitted project scope', async () => {
		const fixture = createAdmin(baseTables());

		await expect(
			updateAsset(context(fixture.admin, [PROJECT_ID]), {
				asset_id: OTHER_PROJECT_ASSET_ID,
				caption: 'Stolen'
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(fixture.calls).toEqual([]);
	});

	it('refuses a write when the project grant is read-only', async () => {
		const fixture = createAdmin(baseTables());
		const readOnly = {
			...(context(fixture.admin) as Record<string, any>),
			scope: {
				mode: 'read_write',
				project_ids: [PROJECT_ID],
				write_project_ids: []
			}
		};

		await expect(
			updateAsset(readOnly as never, { asset_id: ASSET_ID, caption: 'Logo' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(fixture.calls).toEqual([]);
	});

	it('requires at least one change and a non-empty caption', async () => {
		const fixture = createAdmin(baseTables());

		await expect(
			updateAsset(context(fixture.admin), { asset_id: ASSET_ID })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		await expect(
			updateAsset(context(fixture.admin), { asset_id: ASSET_ID, caption: '   ' })
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(fixture.calls).toEqual([]);
	});

	it('runs through the worker write path with schema validation', async () => {
		const fixture = createAdmin(baseTables());

		const rejected = await runGatewayWriteOp({
			admin: fixture.admin as never,
			userId: USER_ID,
			scope: { mode: 'read_write', allowed_ops: ['onto.asset.update'] },
			op: 'onto.asset.update',
			args: { asset_id: ASSET_ID, caption: 'Logo', storage_path: 'x' }
		});
		expect(rejected).toMatchObject({
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: 'Unsupported parameter: storage_path' }
		});

		const filed = await runGatewayWriteOp({
			admin: fixture.admin as never,
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.asset.update'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.asset.update',
			args: { asset_id: ASSET_ID, caption: 'Logo', document_id: BRAND_DOC_ID }
		});
		expect(filed).toMatchObject({
			ok: true,
			entityKind: 'asset',
			entityId: ASSET_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'Logo'
		});
	});
});

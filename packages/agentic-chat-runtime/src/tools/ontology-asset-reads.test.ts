// packages/agentic-chat-runtime/src/tools/ontology-asset-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatToolAccessDeniedError, type AgenticChatToolAccessPortV1 } from './access-port';
import { getOntoAsset, searchOntoAssets } from './ontology-asset-reads';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const LOGO_ID = '33333333-3333-4333-8333-333333333333';
const SCREENSHOT_ID = '44444444-4444-4444-8444-444444444444';
const HIDDEN_ASSET_ID = '55555555-5555-4555-8555-555555555555';
const BRAND_DOC_ID = '66666666-6666-4666-8666-666666666666';
const DELETED_DOC_ID = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;

function createClient(tables: Record<string, Row[]>) {
	const orFilters: string[] = [];
	function builder(table: string) {
		const filters: Array<(row: Row) => boolean> = [];
		let range: [number, number] | null = null;
		const settle = (single: boolean) => {
			let rows = (tables[table] ?? []).filter((row) =>
				filters.every((filter) => filter(row))
			);
			const count = rows.length;
			if (range) rows = rows.slice(range[0], range[1] + 1);
			return single
				? { data: rows[0] ?? null, error: null }
				: { data: rows, count, error: null };
		};
		const query: Record<string, any> = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				filters.push((row) => row[column] === value);
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
			or: (filter: string) => {
				orFilters.push(filter);
				return query;
			},
			order: () => query,
			range: (from: number, to: number) => {
				range = [from, to];
				return query;
			},
			maybeSingle: async () => settle(true),
			then: (resolve: (value: unknown) => unknown) =>
				Promise.resolve(settle(false)).then(resolve)
		};
		return query;
	}
	return { client: { from: builder } as never, orFilters };
}

function tables(): Record<string, Row[]> {
	return {
		onto_assets: [
			{
				id: LOGO_ID,
				project_id: PROJECT_ID,
				kind: 'image',
				original_filename: 'IMG_1.png',
				caption: 'Redline logo',
				ocr_status: 'complete',
				extraction_summary: 'A red wordmark',
				extracted_text: 'REDLINE',
				deleted_at: null
			},
			{
				id: SCREENSHOT_ID,
				project_id: PROJECT_ID,
				kind: 'image',
				original_filename: 'screen.png',
				caption: null,
				ocr_status: 'pending',
				deleted_at: null
			},
			{
				id: HIDDEN_ASSET_ID,
				project_id: OTHER_PROJECT_ID,
				kind: 'image',
				original_filename: 'secret.png',
				caption: 'Secret',
				deleted_at: null
			}
		],
		onto_asset_links: [
			{
				asset_id: LOGO_ID,
				project_id: PROJECT_ID,
				entity_kind: 'document',
				entity_id: BRAND_DOC_ID,
				role: 'attachment',
				created_at: '2026-09-01T00:00:00.000Z'
			},
			// A link to a deleted document is not a visible filing.
			{
				asset_id: SCREENSHOT_ID,
				project_id: PROJECT_ID,
				entity_kind: 'document',
				entity_id: DELETED_DOC_ID,
				role: 'attachment',
				created_at: '2026-09-01T00:00:00.000Z'
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
				id: DELETED_DOC_ID,
				project_id: PROJECT_ID,
				title: 'Gone',
				deleted_at: '2026-09-02T00:00:00.000Z',
				archived_at: null
			}
		]
	};
}

function context(client: never, readable = [PROJECT_ID]): AgenticChatSharedReadContextV1 {
	const access: AgenticChatToolAccessPortV1 = {
		getActorId: vi.fn(async () => 'actor-1'),
		resolveProjectSummaries: vi.fn(async () =>
			readable.map((id) => ({ id, state_key: 'active' }))
		),
		assertProjectAccess: vi.fn(async (projectId: string) => {
			if (!readable.includes(projectId)) throw new AgenticChatToolAccessDeniedError();
		}),
		assertEntityAccess: vi.fn(async () => undefined)
	};
	return { client, access, userId: 'user-1', timezone: null };
}

describe('project image reads', () => {
	it('searches only readable projects and reports where each image is filed', async () => {
		const fixture = createClient(tables());

		const result = await searchOntoAssets(context(fixture.client), { query: 'logo' });

		expect(result.assets.map((asset) => asset.id)).toEqual([LOGO_ID, SCREENSHOT_ID]);
		expect(result.assets[0]).toMatchObject({
			caption: 'Redline logo',
			file_name: 'IMG_1.png',
			summary: 'A red wordmark',
			filed_under: { document_id: BRAND_DOC_ID, document_title: 'Brand guide' }
		});
		expect(result.assets[1]).toMatchObject({ filed_under: null });
		expect(result.assets[0]).not.toHaveProperty('extracted_text_preview');
		expect(fixture.orFilters.join(' ')).toContain('caption.ilike');
		expect(JSON.stringify(result)).not.toContain('storage_path');
	});

	it('scopes to one project only after an access check', async () => {
		const fixture = createClient(tables());
		const ctx = context(fixture.client);

		await expect(
			searchOntoAssets(ctx, { project_id: OTHER_PROJECT_ID })
		).rejects.toBeInstanceOf(AgenticChatToolAccessDeniedError);
		const own = await searchOntoAssets(ctx, { project_id: PROJECT_ID, limit: 1 });
		expect(own.assets).toHaveLength(1);
		expect(own.total).toBe(2);
	});

	it('gets one image with its OCR preview and placement, and refuses unreadable projects', async () => {
		const fixture = createClient(tables());
		const ctx = context(fixture.client);

		const logo = await getOntoAsset(ctx, { asset_id: LOGO_ID });
		expect(logo.asset).toMatchObject({
			id: LOGO_ID,
			extracted_text_preview: 'REDLINE',
			filed_under: { document_id: BRAND_DOC_ID, document_title: 'Brand guide' }
		});
		expect(logo.message).toBe('Image is filed under "Brand guide".');

		const shelf = await getOntoAsset(ctx, { asset_id: SCREENSHOT_ID });
		expect(shelf.asset).toMatchObject({ filed_under: null });
		expect(shelf.message).toContain('Images shelf');

		await expect(getOntoAsset(ctx, { asset_id: HIDDEN_ASSET_ID })).rejects.toBeInstanceOf(
			AgenticChatToolAccessDeniedError
		);
		await expect(getOntoAsset(ctx, { asset_id: 'logo' })).rejects.toThrow(
			'Invalid asset_id: expected UUID'
		);
	});
});

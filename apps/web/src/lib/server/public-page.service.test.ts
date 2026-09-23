// apps/web/src/lib/server/public-page.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	updateDocNodeMetadata: vi.fn()
}));

const runPublicPageContentReviewMock = vi.hoisted(() => vi.fn());
const getLatestPublicPageReviewForDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/public-page-content-review.service', () => ({
	getLatestPublicPageReviewForDocument: getLatestPublicPageReviewForDocumentMock,
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE:
		'Content review is temporarily unavailable. Please try again in a few minutes.',
	runPublicPageContentReview: runPublicPageContentReviewMock
}));

import {
	buildPublicPageUrlPath,
	confirmDocumentPublicPage,
	getPublicPageBySlug,
	normalizePublicPageSlugBase,
	normalizePublicPageSlugPrefix,
	prepareDocumentPublicPagePreview,
	setDocumentPublicPageLiveSync,
	splitPublicPageSlugForDisplay,
	syncLivePublicPageForDocument,
	unpublishDocumentPublicPage
} from './public-page.service';

beforeEach(() => {
	runPublicPageContentReviewMock.mockReset();
	getLatestPublicPageReviewForDocumentMock.mockReset();
	getLatestPublicPageReviewForDocumentMock.mockResolvedValue(null);
});

describe('public-page.service slug helpers', () => {
	it('normalizes slug prefixes from actor names', () => {
		expect(normalizePublicPageSlugPrefix(' DJ Wayne!!! ')).toBe('dj-wayne');
		expect(normalizePublicPageSlugPrefix('')).toBe('user');
	});

	it('normalizes slug bases from titles', () => {
		expect(normalizePublicPageSlugBase(' Market Map!!! 2026 ')).toBe('market-map-2026');
		expect(normalizePublicPageSlugBase('')).toBe('page');
	});

	it('splits a stored slug into prefix and base when the prefix matches', () => {
		expect(splitPublicPageSlugForDisplay('dj-wayne-market-map', 'dj-wayne')).toEqual({
			slug_prefix: 'dj-wayne',
			slug_base: 'market-map'
		});
		expect(splitPublicPageSlugForDisplay('market-map', 'dj-wayne')).toEqual({
			slug_prefix: 'dj-wayne',
			slug_base: 'market-map'
		});
	});

	it('builds nested public page URL paths when prefix and base are present', () => {
		expect(buildPublicPageUrlPath('dj-wayne-market-map', 'dj-wayne', 'market-map')).toBe(
			'/p/dj-wayne/market-map'
		);
		expect(buildPublicPageUrlPath('legacy-page')).toBe('/p/legacy-page');
	});
});

describe('getPublicPageBySlug', () => {
	it('returns a public page row regardless of visibility (unlisted resolves via direct link)', async () => {
		const filters: Record<string, unknown> = {};
		const builder: any = {
			select: vi.fn(() => builder),
			eq: vi.fn((key: string, value: unknown) => {
				filters[key] = value;
				return builder;
			}),
			is: vi.fn((key: string, value: unknown) => {
				filters[`is:${key}`] = value;
				return builder;
			}),
			maybeSingle: vi.fn(async () => ({
				data: {
					id: 'pg-1',
					slug: 'dj-wayne-market-map',
					slug_prefix: 'dj-wayne',
					slug_base: 'market-map',
					status: 'published',
					public_status: 'live',
					visibility: 'unlisted',
					deleted_at: null
				},
				error: null
			}))
		};
		const supabase = { from: vi.fn(() => builder) } as any;

		const row = await getPublicPageBySlug(supabase, 'dj-wayne-market-map');

		expect(row).toMatchObject({ visibility: 'unlisted', public_status: 'live' });
		// Critical: we must NOT filter by visibility here. Unlisted pages are
		// direct-link readable; excluding them would 404 every unlisted share.
		expect(filters).not.toHaveProperty('visibility');
		expect(filters).toMatchObject({
			slug: 'dj-wayne-market-map',
			status: 'published',
			public_status: 'live',
			'is:deleted_at': null
		});
	});
});

describe('prepareDocumentPublicPagePreview', () => {
	it('returns a deduped preview slug using the frozen prefix', async () => {
		const rpc = vi.fn(async (fn: string) => {
			if (fn === 'resolve_onto_public_page_slug_prefix') {
				return { data: 'dj-wayne', error: null };
			}
			if (fn === 'suggest_onto_public_page_slug') {
				return {
					data: [
						{
							slug_prefix: 'dj-wayne',
							slug_base: 'market-map-2',
							slug: 'dj-wayne-market-map-2',
							deduped: true
						}
					],
					error: null
				};
			}
			return { data: null, error: null };
		});

		const preview = await prepareDocumentPublicPagePreview(
			{ rpc } as any,
			{
				id: 'doc-1',
				project_id: 'project-1',
				title: 'Market Map',
				description: 'A useful summary',
				content: '# Market map',
				props: {},
				state_key: 'draft'
			},
			null,
			'actor-1',
			{
				slug_base: 'Market Map'
			}
		);

		expect(preview.slug_prefix).toBe('dj-wayne');
		expect(preview.slug_base).toBe('market-map-2');
		expect(preview.slug).toBe('dj-wayne-market-map-2');
		expect(preview.slug_was_deduped).toBe(true);
		expect(rpc).toHaveBeenNthCalledWith(1, 'resolve_onto_public_page_slug_prefix', {
			p_actor_id: 'actor-1'
		});
		expect(rpc).toHaveBeenNthCalledWith(2, 'suggest_onto_public_page_slug', {
			p_slug_prefix: 'dj-wayne',
			p_slug_base: 'market-map',
			p_exclude_page_id: null
		});
	});
});

const LIVE_PAGE_ROW = {
	id: 'page-1',
	project_id: 'project-1',
	document_id: 'doc-1',
	slug: 'dj-wayne-market-map',
	slug_prefix: 'dj-wayne',
	slug_base: 'market-map',
	title: 'Market Map',
	summary: 'Stored summary',
	status: 'published',
	public_status: 'live',
	visibility: 'public',
	live_sync_enabled: true,
	published_content: 'Old published content',
	deleted_at: null
};

const DOCUMENT = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Market Map',
	description: null,
	content: 'New content',
	props: {
		citations: [{ url: 'https://example.com', label: 'Source' }],
		internal_notes: 'Never published'
	},
	state_key: 'draft'
};

/**
 * User-scoped client: may read `onto_public_pages` and call slug RPCs, but any
 * insert or update on it fails the test.
 */
function createUserClient(existingRow: Record<string, unknown> | null) {
	const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
		if (fn === 'resolve_onto_public_page_slug_prefix') return { data: 'dj-wayne', error: null };
		if (fn === 'suggest_onto_public_page_slug') {
			return {
				data: [
					{
						slug_prefix: args.p_slug_prefix,
						slug_base: args.p_slug_base,
						slug: `${args.p_slug_prefix}-${args.p_slug_base}`,
						deduped: false
					}
				],
				error: null
			};
		}
		return { data: null, error: null };
	});
	const client = {
		rpc,
		from: vi.fn((table: string) => {
			if (table !== 'onto_public_pages') throw new Error(`Unexpected table: ${table}`);
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn(() => builder),
				is: vi.fn(() => builder),
				maybeSingle: vi.fn(async () => ({ data: existingRow, error: null })),
				insert: vi.fn(() => {
					throw new Error('User client must not insert public pages');
				}),
				update: vi.fn(() => {
					throw new Error('User client must not update public pages');
				})
			};
			return builder;
		})
	};
	return client;
}

/** Service-role client: records every write and its filters. */
function createAdminClient(baseRow: Record<string, unknown>) {
	const writes: Array<{
		kind: 'insert' | 'update';
		payload: Record<string, unknown>;
		filters: Record<string, unknown>;
	}> = [];
	const client = {
		from: vi.fn((table: string) => {
			if (table !== 'onto_public_pages') throw new Error(`Unexpected table: ${table}`);
			const write = {
				kind: 'update' as 'insert' | 'update',
				payload: {} as Record<string, unknown>,
				filters: {} as Record<string, unknown>
			};
			const builder: any = {
				insert: vi.fn((payload: Record<string, unknown>) => {
					write.kind = 'insert';
					write.payload = payload;
					writes.push(write);
					return builder;
				}),
				update: vi.fn((payload: Record<string, unknown>) => {
					write.payload = payload;
					writes.push(write);
					return builder;
				}),
				eq: vi.fn((key: string, value: unknown) => {
					write.filters[key] = value;
					return builder;
				}),
				select: vi.fn(() => builder),
				single: vi.fn(async () => ({
					data: { ...baseRow, ...write.payload },
					error: null
				})),
				maybeSingle: vi.fn(async () => ({
					data: { ...baseRow, ...write.payload },
					error: null
				}))
			};
			return builder;
		})
	};
	return { client, writes };
}

describe('public page writes go through the service-role client', () => {
	it('confirm creates the page with the admin client and only reviewed props', async () => {
		const user = createUserClient(null);
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });

		const state = await confirmDocumentPublicPage(
			{ supabase: user, getAdminSupabase: () => admin.client },
			DOCUMENT as any,
			'actor-1',
			{ slug_base: 'market-map', title: 'Market Map', summary: 'Short teaser' }
		);

		expect(state.is_live_public).toBe(true);
		expect(admin.writes).toHaveLength(1);
		expect(admin.writes[0]?.kind).toBe('insert');
		expect(admin.writes[0]?.payload).toMatchObject({
			project_id: 'project-1',
			document_id: 'doc-1',
			title: 'Market Map',
			summary: 'Short teaser',
			status: 'published',
			public_status: 'live',
			published_content: 'New content',
			published_props: {
				document_state: 'draft',
				citations: [{ url: 'https://example.com/', label: 'Source', title: null }]
			}
		});
		expect(admin.writes[0]?.payload.published_props).not.toHaveProperty('internal_notes');
	});

	it('confirm updates an existing page scoped to the checked document', async () => {
		const user = createUserClient({ ...LIVE_PAGE_ROW });
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });

		await confirmDocumentPublicPage(
			{ supabase: user, getAdminSupabase: () => admin.client },
			DOCUMENT as any,
			'actor-1',
			{ slug_base: 'market-map' }
		);

		expect(admin.writes).toEqual([
			expect.objectContaining({
				kind: 'update',
				filters: { id: 'page-1', document_id: 'doc-1' }
			})
		]);
	});

	it('unpublish and the live-sync toggle update through the admin client', async () => {
		const user = createUserClient({ ...LIVE_PAGE_ROW });
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });
		const clients = { supabase: user, getAdminSupabase: () => admin.client };

		await setDocumentPublicPageLiveSync(clients, DOCUMENT as any, 'actor-1', false);
		const unpublished = await unpublishDocumentPublicPage(clients, DOCUMENT as any, 'actor-1');

		expect(unpublished?.is_live_public).toBe(false);
		expect(admin.writes.map((write) => write.payload)).toEqual([
			expect.objectContaining({ live_sync_enabled: false }),
			expect.objectContaining({ status: 'unpublished', public_status: 'unpublished' })
		]);
		expect(admin.writes.every((write) => write.filters.document_id === 'doc-1')).toBe(true);
	});

	it('does not create an admin client when there is no page to write', async () => {
		const user = createUserClient(null);
		const getAdminSupabase = vi.fn();
		const clients = { supabase: user, getAdminSupabase };

		expect(await unpublishDocumentPublicPage(clients, DOCUMENT as any, 'actor-1')).toBeNull();
		expect(
			await setDocumentPublicPageLiveSync(clients, DOCUMENT as any, 'actor-1', true)
		).toBeNull();
		const sync = await syncLivePublicPageForDocument(clients, DOCUMENT as any, 'actor-1');

		expect(sync.synced).toBe(false);
		expect(getAdminSupabase).not.toHaveBeenCalled();
		expect(runPublicPageContentReviewMock).not.toHaveBeenCalled();
	});
});

describe('syncLivePublicPageForDocument', () => {
	it('reviews the stored title and summary with the body, then syncs through the admin client', async () => {
		const user = createUserClient({ ...LIVE_PAGE_ROW });
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });
		runPublicPageContentReviewMock.mockResolvedValueOnce({
			id: 'review-pass',
			status: 'passed',
			reasons: [],
			admin_decision: null
		});

		const result = await syncLivePublicPageForDocument(
			{ supabase: user, getAdminSupabase: () => admin.client },
			DOCUMENT as any,
			'actor-1',
			'user-1'
		);

		expect(result.synced).toBe(true);
		expect(runPublicPageContentReviewMock).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: user,
				adminSupabase: admin.client,
				publication: { title: 'Market Map', summary: 'Stored summary' },
				source: 'live_sync'
			})
		);
		expect(admin.writes).toEqual([
			expect.objectContaining({
				kind: 'update',
				payload: expect.objectContaining({ published_content: 'New content' }),
				filters: { id: 'page-1', document_id: 'doc-1' }
			})
		]);
	});

	it('refuses to sync with a retryable message when content review is unavailable', async () => {
		const user = createUserClient({ ...LIVE_PAGE_ROW });
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });
		runPublicPageContentReviewMock.mockResolvedValueOnce({
			id: 'review-error',
			status: 'error',
			summary:
				'Content review is temporarily unavailable. Please try again in a few minutes.',
			reasons: [],
			admin_decision: null
		});

		const result = await syncLivePublicPageForDocument(
			{ supabase: user, getAdminSupabase: () => admin.client },
			DOCUMENT as any,
			'actor-1',
			'user-1'
		);

		expect(result.synced).toBe(false);
		expect(result.blocked).toBe(false);
		expect(result.error).toBe(
			'Content review is temporarily unavailable. Please try again in a few minutes.'
		);
		expect(result.error).not.toMatch(/admin/i);
		expect(result.review?.status).toBe('error');
		expect(admin.writes.map((write) => write.payload)).toEqual([
			expect.objectContaining({
				last_live_sync_error:
					'Content review is temporarily unavailable. Please try again in a few minutes.'
			})
		]);
		expect(admin.writes.some((write) => 'published_content' in write.payload)).toBe(false);
	});

	it('blocks a flagged live update without writing content', async () => {
		const user = createUserClient({ ...LIVE_PAGE_ROW });
		const admin = createAdminClient({ ...LIVE_PAGE_ROW });
		runPublicPageContentReviewMock.mockResolvedValueOnce({
			id: 'review-flagged',
			status: 'flagged',
			reasons: ['Document text: Possible API key detected.'],
			admin_decision: null
		});

		const result = await syncLivePublicPageForDocument(
			{ supabase: user, getAdminSupabase: () => admin.client },
			DOCUMENT as any,
			'actor-1'
		);

		expect(result.blocked).toBe(true);
		expect(admin.writes.some((write) => 'published_content' in write.payload)).toBe(false);
	});
});

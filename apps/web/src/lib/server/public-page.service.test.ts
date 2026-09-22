// apps/web/src/lib/server/public-page.service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	updateDocNodeMetadata: vi.fn()
}));

const runPublicPageContentReviewMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/public-page-content-review.service', () => ({
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE:
		'Content review is temporarily unavailable. Please try again in a few minutes.',
	runPublicPageContentReview: runPublicPageContentReviewMock
}));

import {
	buildPublicPageUrlPath,
	getPublicPageBySlug,
	normalizePublicPageSlugBase,
	normalizePublicPageSlugPrefix,
	prepareDocumentPublicPagePreview,
	splitPublicPageSlugForDisplay,
	syncLivePublicPageForDocument
} from './public-page.service';

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

describe('syncLivePublicPageForDocument', () => {
	function createLivePageSupabase() {
		const livePageRow = {
			id: 'page-1',
			project_id: 'project-1',
			document_id: 'doc-1',
			slug: 'dj-wayne-market-map',
			slug_prefix: 'dj-wayne',
			slug_base: 'market-map',
			title: 'Market Map',
			status: 'published',
			public_status: 'live',
			visibility: 'public',
			live_sync_enabled: true,
			published_content: 'Old published content',
			deleted_at: null
		};
		const updates: Array<Record<string, unknown>> = [];
		const supabase = {
			from: vi.fn((table: string) => {
				if (table !== 'onto_public_pages') throw new Error(`Unexpected table: ${table}`);
				let pendingUpdate: Record<string, unknown> | null = null;
				const builder: any = {
					select: vi.fn(() => builder),
					eq: vi.fn(() => builder),
					is: vi.fn(() => builder),
					update: vi.fn((payload: Record<string, unknown>) => {
						pendingUpdate = payload;
						updates.push(payload);
						return builder;
					}),
					maybeSingle: vi.fn(async () => ({
						data: { ...livePageRow, ...(pendingUpdate ?? {}) },
						error: null
					})),
					single: vi.fn(async () => ({
						data: { ...livePageRow, ...(pendingUpdate ?? {}) },
						error: null
					}))
				};
				return builder;
			})
		};
		return { supabase, updates };
	}

	it('refuses to sync with a retryable message when content review is unavailable', async () => {
		const { supabase, updates } = createLivePageSupabase();
		runPublicPageContentReviewMock.mockResolvedValueOnce({
			id: 'review-error',
			status: 'error',
			summary:
				'Content review is temporarily unavailable. Please try again in a few minutes.',
			reasons: [],
			admin_decision: null
		});

		const result = await syncLivePublicPageForDocument(
			supabase as any,
			{
				id: 'doc-1',
				project_id: 'project-1',
				title: 'Market Map',
				description: null,
				content: 'New content that has not been reviewed',
				props: {}
			} as any,
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
		expect(updates).toEqual([
			expect.objectContaining({
				last_live_sync_error:
					'Content review is temporarily unavailable. Please try again in a few minutes.'
			})
		]);
		expect(updates.some((update) => 'published_content' in update)).toBe(false);
	});
});

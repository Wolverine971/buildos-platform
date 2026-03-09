// apps/web/src/lib/server/public-page.service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/doc-structure.service', () => ({
	updateDocNodeMetadata: vi.fn()
}));

vi.mock('$lib/server/public-page-content-review.service', () => ({
	runPublicPageContentReview: vi.fn()
}));

import {
	buildPublicPageUrlPath,
	normalizePublicPageSlugBase,
	normalizePublicPageSlugPrefix,
	prepareDocumentPublicPagePreview,
	splitPublicPageSlugForDisplay
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

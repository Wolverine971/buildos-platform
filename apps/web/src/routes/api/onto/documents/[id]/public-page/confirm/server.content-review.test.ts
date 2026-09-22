// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/server.content-review.test.ts
// Runs the confirm route against the real content review service; only the LLM,
// the public-page persistence layer, and access checks are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getJSONResponse: vi.fn(),
	confirmDocumentPublicPage: vi.fn(),
	getDocumentPublicPageState: vi.fn(),
	ensureDocumentAccessForPublicPage: vi.fn()
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse() {
			return mocks.getJSONResponse();
		}
	}
}));

vi.mock('$lib/server/public-page.service', () => ({
	PublicPageSlugConflictError: class extends Error {},
	confirmDocumentPublicPage: mocks.confirmDocumentPublicPage,
	getDocumentPublicPageState: mocks.getDocumentPublicPageState
}));

vi.mock('../../../shared-public-page', () => ({
	ensureDocumentAccessForPublicPage: mocks.ensureDocumentAccessForPublicPage
}));

import { POST } from './+server';

function createReviewSupabase() {
	const insertedReviews: Array<Record<string, unknown>> = [];
	const supabase = {
		from(table: string) {
			if (table === 'onto_asset_links') {
				const query: any = {
					select: () => query,
					eq: () => query,
					then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
						resolve({ data: [], error: null })
				};
				return query;
			}
			if (table === 'onto_public_page_review_attempts') {
				const query: any = {
					select: () => query,
					eq: () => query,
					order: () => query,
					limit: () => query,
					maybeSingle: async () => ({ data: null, error: null }),
					insert: (payload: Record<string, unknown>) => {
						insertedReviews.push(payload);
						return {
							select: () => ({
								single: async () => ({
									data: {
										id: `review-${insertedReviews.length}`,
										created_at: '2026-09-22T12:00:00.000Z',
										...payload
									},
									error: null
								})
							})
						};
					}
				};
				return query;
			}
			throw new Error(`Unexpected table: ${table}`);
		}
	};
	return { supabase, insertedReviews };
}

function confirmRequest(supabase: unknown) {
	return POST({
		params: { id: 'doc-1' },
		request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug_base: 'sales-playbook' })
		}),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
			supabase
		}
	} as any);
}

describe('POST /api/onto/documents/[id]/public-page/confirm content review', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureDocumentAccessForPublicPage.mockResolvedValue({
			document: {
				id: 'doc-1',
				project_id: 'project-1',
				title: 'How to build a secret weapon for your sales team',
				description: null,
				content: 'Steps to build a secret weapon for your sales team: a follow-up cadence.',
				props: null,
				updated_at: '2026-09-22T11:00:00.000Z'
			},
			actorId: 'actor-1'
		});
		mocks.getDocumentPublicPageState.mockResolvedValue(null);
		mocks.confirmDocumentPublicPage.mockResolvedValue({ id: 'page-1', slug: 'sales-playbook' });
	});

	it('publishes a benign page when the LLM review passes', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			status: 'passed',
			summary: 'No policy issues.',
			reasons: [],
			findings: []
		});
		const { supabase } = createReviewSupabase();

		const response = await confirmRequest(supabase);

		expect(response.status).toBe(200);
		expect(mocks.confirmDocumentPublicPage).toHaveBeenCalledTimes(1);
	});

	it('refuses to publish with a retryable message when the LLM review throws', async () => {
		mocks.getJSONResponse.mockRejectedValue(new Error('OpenRouter 503'));
		const { supabase, insertedReviews } = createReviewSupabase();

		const response = await confirmRequest(supabase);
		const payload = await response.json();

		expect(response.status).toBe(503);
		expect(payload.code).toBe('CONTENT_REVIEW_UNAVAILABLE');
		expect(payload.error).toBe(
			'Content review is temporarily unavailable. Please try again in a few minutes.'
		);
		expect(payload.error).not.toMatch(/admin/i);
		expect(payload.details.review.status).toBe('error');
		expect(insertedReviews).toEqual([expect.objectContaining({ status: 'error' })]);
		expect(mocks.confirmDocumentPublicPage).not.toHaveBeenCalled();
	});
});

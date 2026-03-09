// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDocumentPublicPageMock = vi.fn();
const getDocumentPublicPageStateMock = vi.fn();
const ensureDocumentAccessForPublicPageMock = vi.fn();
const getLatestPublicPageReviewForDocumentMock = vi.fn();
const isPublicPageReviewReusableForDocumentMock = vi.fn();
const runPublicPageContentReviewMock = vi.fn();

class PublicPageSlugConflictError extends Error {
	code = 'SLUG_TAKEN' as const;
	status = 409 as const;

	constructor(
		public readonly suggestion: {
			slug_prefix: string | null;
			slug_base: string;
			slug: string;
		}
	) {
		super('That public URL is already taken');
		this.name = 'PublicPageSlugConflictError';
	}
}

vi.mock('$lib/server/public-page.service', () => ({
	PublicPageSlugConflictError,
	confirmDocumentPublicPage: confirmDocumentPublicPageMock,
	getDocumentPublicPageState: getDocumentPublicPageStateMock
}));

vi.mock('$lib/server/public-page-content-review.service', () => ({
	getLatestPublicPageReviewForDocument: getLatestPublicPageReviewForDocumentMock,
	isPublicPageReviewReusableForDocument: isPublicPageReviewReusableForDocumentMock,
	runPublicPageContentReview: runPublicPageContentReviewMock
}));

vi.mock('../../../shared-public-page', () => ({
	ensureDocumentAccessForPublicPage: ensureDocumentAccessForPublicPageMock
}));

describe('POST /api/onto/documents/[id]/public-page/confirm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureDocumentAccessForPublicPageMock.mockResolvedValue({
			document: {
				id: 'doc-1',
				project_id: 'project-1',
				title: 'Market Map'
			},
			actorId: 'actor-1'
		});
		getDocumentPublicPageStateMock.mockResolvedValue(null);
		getLatestPublicPageReviewForDocumentMock.mockResolvedValue(null);
		isPublicPageReviewReusableForDocumentMock.mockReturnValue(false);
		runPublicPageContentReviewMock.mockResolvedValue({
			id: 'review-1',
			status: 'passed',
			admin_decision: null
		});
		confirmDocumentPublicPageMock.mockResolvedValue({
			id: 'page-1',
			slug: 'dj-wayne-market-map',
			slug_prefix: 'dj-wayne',
			slug_base: 'market-map'
		});
	});

	it('passes slug_base through to the service', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slug_base: 'market-map',
					title: 'Market Map'
				})
			}),
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
				supabase: {} as any
			}
		} as any);

		expect(response.status).toBe(200);
		expect(confirmDocumentPublicPageMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: 'doc-1' }),
			'actor-1',
			expect.objectContaining({
				slug_base: 'market-map',
				title: 'Market Map'
			})
		);
	});

	it('keeps accepting legacy full slug payloads', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slug: 'dj-wayne-market-map'
				})
			}),
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
				supabase: {} as any
			}
		} as any);

		expect(response.status).toBe(200);
		expect(confirmDocumentPublicPageMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'actor-1',
			expect.objectContaining({
				slug: 'dj-wayne-market-map'
			})
		);
	});

	it('returns 409 with a suggested alternative when the slug is taken', async () => {
		confirmDocumentPublicPageMock.mockRejectedValue(
			new PublicPageSlugConflictError({
				slug_prefix: 'dj-wayne',
				slug_base: 'market-map-2',
				slug: 'dj-wayne-market-map-2'
			})
		);

		const { POST } = await import('./+server');
		const response = await POST({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slug_base: 'market-map'
				})
			}),
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
				supabase: {} as any
			}
		} as any);

		const payload = await response.json();
		expect(response.status).toBe(409);
		expect(payload.code).toBe('SLUG_TAKEN');
		expect(payload.details).toEqual({
			slug_prefix: 'dj-wayne',
			suggested_slug_base: 'market-map-2',
			suggested_slug: 'dj-wayne-market-map-2'
		});
	});
});

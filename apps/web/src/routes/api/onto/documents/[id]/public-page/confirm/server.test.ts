// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDocumentPublicPageMock = vi.fn();
const getDocumentPublicPageStateMock = vi.fn();
const ensureDocumentAccessForPublicPageMock = vi.fn();
const getLatestPublicPageReviewForDocumentMock = vi.fn();
const isPublicPageReviewReusableForDocumentMock = vi.fn();
const isPublicPageReviewApprovedForPublishMock = vi.fn();
const didPublicPageReviewLlmCompleteMock = vi.fn();
const runPublicPageContentReviewMock = vi.fn();
const createAdminSupabaseClientMock = vi.fn();

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
	didPublicPageReviewLlmComplete: didPublicPageReviewLlmCompleteMock,
	getLatestPublicPageReviewForDocument: getLatestPublicPageReviewForDocumentMock,
	isPublicPageReviewApprovedForPublish: isPublicPageReviewApprovedForPublishMock,
	isPublicPageReviewReusableForDocument: isPublicPageReviewReusableForDocumentMock,
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE:
		'Content review is temporarily unavailable. Please try again in a few minutes.',
	runPublicPageContentReview: runPublicPageContentReviewMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('../../../shared-public-page', () => ({
	ensureDocumentAccessForPublicPage: ensureDocumentAccessForPublicPageMock
}));

const ADMIN_CLIENT = { __client: 'service-role' };
const USER_CLIENT = { __client: 'user-scoped' };

function confirmRequest(body: Record<string, unknown>) {
	return import('./+server').then(({ POST }) =>
		POST({
			params: { id: 'doc-1' },
			request: new Request('http://localhost/api/onto/documents/doc-1/public-page/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}),
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
				supabase: USER_CLIENT as any
			}
		} as any)
	);
}

describe('POST /api/onto/documents/[id]/public-page/confirm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createAdminSupabaseClientMock.mockReturnValue(ADMIN_CLIENT);
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
		isPublicPageReviewApprovedForPublishMock.mockReturnValue(false);
		didPublicPageReviewLlmCompleteMock.mockReturnValue(true);
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
		const response = await confirmRequest({ slug_base: 'market-map', title: 'Market Map' });

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
		const response = await confirmRequest({ slug: 'dj-wayne-market-map' });

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

		const response = await confirmRequest({ slug_base: 'market-map' });

		const payload = await response.json();
		expect(response.status).toBe(409);
		expect(payload.code).toBe('SLUG_TAKEN');
		expect(payload.details).toEqual({
			slug_prefix: 'dj-wayne',
			suggested_slug_base: 'market-map-2',
			suggested_slug: 'dj-wayne-market-map-2'
		});
	});

	it('writes through the service role only after the access check passes', async () => {
		const response = await confirmRequest({ slug_base: 'market-map', title: 'Launch notes' });

		expect(response.status).toBe(200);
		expect(ensureDocumentAccessForPublicPageMock).toHaveBeenCalledWith(
			expect.anything(),
			'doc-1',
			'user-1',
			'write'
		);
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(ensureDocumentAccessForPublicPageMock.mock.invocationCallOrder[0]).toBeLessThan(
			createAdminSupabaseClientMock.mock.invocationCallOrder[0]!
		);
		expect(runPublicPageContentReviewMock).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: USER_CLIENT,
				adminSupabase: ADMIN_CLIENT,
				publication: { title: 'Launch notes', summary: null }
			})
		);
		const [clients] = confirmDocumentPublicPageMock.mock.calls[0] ?? [];
		expect(clients.supabase).toBe(USER_CLIENT);
		expect(clients.getAdminSupabase()).toBe(ADMIN_CLIENT);
	});

	it('writes nothing when the access check fails', async () => {
		ensureDocumentAccessForPublicPageMock.mockResolvedValue({
			error: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const response = await confirmRequest({ slug_base: 'market-map' });

		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(runPublicPageContentReviewMock).not.toHaveBeenCalled();
		expect(confirmDocumentPublicPageMock).not.toHaveBeenCalled();
	});

	it('rejects an over-long title or summary before reviewing or writing', async () => {
		const longTitle = await confirmRequest({ title: 'x'.repeat(201) });
		const longSummary = await confirmRequest({ summary: 'x'.repeat(501) });

		expect(longTitle.status).toBe(400);
		expect(longSummary.status).toBe(400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(runPublicPageContentReviewMock).not.toHaveBeenCalled();
		expect(confirmDocumentPublicPageMock).not.toHaveBeenCalled();
	});

	it('does not publish a flagged review whose admin approval does not count', async () => {
		runPublicPageContentReviewMock.mockResolvedValue({
			id: 'review-1',
			status: 'flagged',
			admin_decision: 'approved'
		});
		isPublicPageReviewApprovedForPublishMock.mockReturnValue(false);

		const response = await confirmRequest({ slug_base: 'market-map' });

		expect(response.status).toBe(422);
		expect(confirmDocumentPublicPageMock).not.toHaveBeenCalled();
	});

	it('refuses a pass that was not backed by a completed LLM review', async () => {
		didPublicPageReviewLlmCompleteMock.mockReturnValue(false);

		const response = await confirmRequest({ slug_base: 'market-map' });

		expect(response.status).toBe(503);
		expect(confirmDocumentPublicPageMock).not.toHaveBeenCalled();
	});
});

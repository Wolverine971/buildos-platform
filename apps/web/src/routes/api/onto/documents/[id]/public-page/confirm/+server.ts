// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	confirmDocumentPublicPage,
	getDocumentPublicPageState,
	PublicPageSlugConflictError
} from '$lib/server/public-page.service';
import {
	getLatestPublicPageReviewForDocument,
	isPublicPageReviewReusableForDocument,
	runPublicPageContentReview
} from '$lib/server/public-page-content-review.service';
import { ensureDocumentAccessForPublicPage } from '../../../shared-public-page';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const documentId = params.id;
	if (!documentId) {
		return ApiResponse.badRequest('Document ID required');
	}

	const access = await ensureDocumentAccessForPublicPage(
		locals,
		documentId,
		session.user.id,
		'write'
	);
	if ('error' in access) return access.error;

	const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

	try {
		const existing = await getDocumentPublicPageState(locals.supabase, documentId);
		const latestReview = await getLatestPublicPageReviewForDocument(
			locals.supabase,
			documentId
		);
		const review =
			latestReview &&
			isPublicPageReviewReusableForDocument(latestReview, access.document as any)
				? latestReview
				: await runPublicPageContentReview({
						supabase: locals.supabase,
						document: access.document as any,
						actorId: access.actorId,
						actorUserId: session.user.id,
						source: 'publish_confirm',
						publicPageId: existing?.id ?? null
					});
		if (review.status === 'flagged' && review.admin_decision !== 'approved') {
			const message =
				review.admin_decision === 'rejected'
					? 'Content review flagged this page and admin marked it not okay. Update the document and try publishing again.'
					: 'Content review flagged this page and is awaiting admin approval. Ask an admin to review and mark this content okay.';
			return ApiResponse.error(message, 422, 'CONTENT_REVIEW_FLAGGED', { review });
		}

		const publicPage = await confirmDocumentPublicPage(
			locals.supabase,
			access.document as any,
			access.actorId,
			{
				slug: typeof payload?.slug === 'string' ? payload.slug : undefined,
				slug_base: typeof payload?.slug_base === 'string' ? payload.slug_base : undefined,
				title: typeof payload?.title === 'string' ? payload.title : undefined,
				summary: typeof payload?.summary === 'string' ? payload.summary : undefined,
				visibility:
					payload?.visibility === 'public' || payload?.visibility === 'unlisted'
						? payload.visibility
						: undefined,
				noindex: typeof payload?.noindex === 'boolean' ? payload.noindex : undefined,
				live_sync_enabled:
					typeof payload?.live_sync_enabled === 'boolean'
						? payload.live_sync_enabled
						: undefined
			}
		);

		return ApiResponse.success(
			{
				publicPage,
				review
			},
			'Document is now public'
		);
	} catch (error) {
		if (error instanceof PublicPageSlugConflictError) {
			return ApiResponse.error(error.message, 409, error.code, {
				slug_prefix: error.suggestion.slug_prefix,
				suggested_slug_base: error.suggestion.slug_base,
				suggested_slug: error.suggestion.slug
			});
		}
		if (error instanceof Error && error.message === 'Invalid or reserved slug') {
			return ApiResponse.badRequest(
				'Invalid slug. Use lowercase letters, numbers, and hyphens only.'
			);
		}
		return ApiResponse.internalError(error, 'Failed to confirm public page');
	}
};

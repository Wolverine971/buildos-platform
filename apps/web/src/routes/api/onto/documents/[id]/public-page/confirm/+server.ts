// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	confirmDocumentPublicPage,
	getDocumentPublicPageState,
	PublicPageSlugConflictError
} from '$lib/server/public-page.service';
import {
	didPublicPageReviewLlmComplete,
	getLatestPublicPageReviewForDocument,
	isPublicPageReviewApprovedForPublish,
	isPublicPageReviewReusableForDocument,
	PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE,
	runPublicPageContentReview
} from '$lib/server/public-page-content-review.service';
import {
	resolvePublicPagePublicationText,
	validatePublicPagePublicationInput
} from '$lib/server/public-page-publication';
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
	const input = {
		slug: typeof payload?.slug === 'string' ? payload.slug : undefined,
		slug_base: typeof payload?.slug_base === 'string' ? payload.slug_base : undefined,
		title: typeof payload?.title === 'string' ? payload.title : undefined,
		summary: typeof payload?.summary === 'string' ? payload.summary : undefined,
		visibility:
			payload?.visibility === 'public'
				? ('public' as const)
				: payload?.visibility === 'unlisted'
					? ('unlisted' as const)
					: undefined,
		noindex: typeof payload?.noindex === 'boolean' ? payload.noindex : undefined,
		live_sync_enabled:
			typeof payload?.live_sync_enabled === 'boolean' ? payload.live_sync_enabled : undefined
	};
	const inputError = validatePublicPagePublicationInput(input);
	if (inputError) {
		return ApiResponse.badRequest(inputError);
	}

	try {
		// Write access is verified above with the user-scoped client. Public page
		// and review rows are server-owned, so their writes use the service role.
		const adminSupabase = createAdminSupabaseClient();
		const document = access.document as any;
		// Review exactly the title and summary this publish will write.
		const publication = resolvePublicPagePublicationText(document, input);
		const existing = await getDocumentPublicPageState(locals.supabase, documentId);
		const latestReview = await getLatestPublicPageReviewForDocument(
			locals.supabase,
			documentId
		);
		const review =
			latestReview &&
			isPublicPageReviewReusableForDocument(latestReview, document, publication)
				? latestReview
				: await runPublicPageContentReview({
						supabase: locals.supabase,
						adminSupabase,
						document,
						publication,
						actorId: access.actorId,
						actorUserId: session.user.id,
						source: 'publish_confirm',
						publicPageId: existing?.id ?? null,
						previousReview: latestReview
					});
		if (review.status === 'flagged' && !isPublicPageReviewApprovedForPublish(review)) {
			const message =
				review.admin_decision === 'rejected'
					? 'Content review flagged this page and admin marked it not okay. Update the document and try publishing again.'
					: 'Content review flagged this page and is awaiting admin approval. Ask an admin to review and mark this content okay.';
			return ApiResponse.error(message, 422, 'CONTENT_REVIEW_FLAGGED', { review });
		}
		if (
			review.status === 'error' ||
			(review.status === 'passed' && !didPublicPageReviewLlmComplete(review))
		) {
			// The review could not run (e.g. LLM outage). Fail closed and ask for a retry.
			return ApiResponse.error(
				review.summary ?? PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE,
				503,
				'CONTENT_REVIEW_UNAVAILABLE',
				{ review }
			);
		}

		const publicPage = await confirmDocumentPublicPage(
			{ supabase: locals.supabase, getAdminSupabase: () => adminSupabase },
			document,
			access.actorId,
			input
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

// apps/web/src/routes/api/onto/documents/[id]/public-page/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getDocumentPublicPageState } from '$lib/server/public-page.service';
import { getLatestPublicPageReviewForDocument } from '$lib/server/public-page-content-review.service';
import { ensureDocumentAccessForPublicPage } from '../../shared-public-page';

export const GET: RequestHandler = async ({ params, locals }) => {
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
		'read'
	);
	if ('error' in access) return access.error;

	const [publicPage, latestReview] = await Promise.all([
		getDocumentPublicPageState(locals.supabase, documentId),
		getLatestPublicPageReviewForDocument(locals.supabase, documentId)
	]);
	return ApiResponse.success({
		publicPage,
		latestReview
	});
};

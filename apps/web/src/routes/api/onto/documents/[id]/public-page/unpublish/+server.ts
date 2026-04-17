// apps/web/src/routes/api/onto/documents/[id]/public-page/unpublish/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { unpublishDocumentPublicPage } from '$lib/server/public-page.service';
import { ensureDocumentAccessForPublicPage } from '../../../shared-public-page';

export const POST: RequestHandler = async ({ params, locals }) => {
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

	try {
		const publicPage = await unpublishDocumentPublicPage(
			locals.supabase,
			access.document as any,
			access.actorId
		);
		if (!publicPage) {
			return ApiResponse.notFound('Public page');
		}
		return ApiResponse.success(
			{ publicPage },
			'Document is no longer public. The link will now 404.'
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to unpublish public page');
	}
};

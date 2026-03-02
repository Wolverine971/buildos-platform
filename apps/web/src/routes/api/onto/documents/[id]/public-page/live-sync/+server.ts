// apps/web/src/routes/api/onto/documents/[id]/public-page/live-sync/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { setDocumentPublicPageLiveSync } from '$lib/server/public-page.service';
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
	if (typeof payload?.live_sync_enabled !== 'boolean') {
		return ApiResponse.badRequest('live_sync_enabled must be a boolean');
	}

	try {
		const publicPage = await setDocumentPublicPageLiveSync(
			locals.supabase,
			access.document as any,
			access.actorId,
			payload.live_sync_enabled
		);
		if (!publicPage) {
			return ApiResponse.notFound('Public page');
		}

		return ApiResponse.success({
			publicPage
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update live sync');
	}
};

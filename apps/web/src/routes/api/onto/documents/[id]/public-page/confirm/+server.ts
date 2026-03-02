// apps/web/src/routes/api/onto/documents/[id]/public-page/confirm/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	confirmDocumentPublicPage,
	isValidPublicPageSlug,
	normalizePublicPageSlug
} from '$lib/server/public-page.service';
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
	const normalizedSlug = normalizePublicPageSlug(
		typeof payload?.slug === 'string' ? payload.slug : (access.document.title ?? 'document')
	);
	if (!isValidPublicPageSlug(normalizedSlug)) {
		return ApiResponse.badRequest(
			'Invalid slug. Use lowercase letters, numbers, and hyphens only.'
		);
	}

	try {
		const publicPage = await confirmDocumentPublicPage(
			locals.supabase,
			access.document as any,
			access.actorId,
			{
				slug: normalizedSlug,
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
				publicPage
			},
			'Document is now public'
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to confirm public page');
	}
};

// apps/web/src/routes/api/onto/documents/[id]/public-page/prepare/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDocumentPublicPageState,
	prepareDocumentPublicPagePreview
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
	const existing = await getDocumentPublicPageState(locals.supabase, documentId);
	const preview = await prepareDocumentPublicPagePreview(
		locals.supabase,
		access.document as any,
		existing,
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

	return ApiResponse.success({
		preview,
		publicPage: existing
	});
};

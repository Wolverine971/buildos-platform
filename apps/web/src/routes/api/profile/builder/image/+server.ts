// apps/web/src/routes/api/profile/builder/image/+server.ts
//
// The owner's photo and cover image for their builder page.
// POST   multipart { kind: 'avatar' | 'cover', file } → { url }  (the browser crops first)
// DELETE ?kind=avatar|cover                          → { removed: true }

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { BuilderProfileError } from '$lib/server/builder-profile/builder-profile.service';
import {
	MAX_PROFILE_IMAGE_BYTES,
	clearProfileImage,
	parseImageKind,
	storeProfileImage
} from '$lib/server/builder-profile/builder-profile-images';

function failure(error: unknown, fallback: string) {
	if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
	console.error('[BuilderProfile] image request failed', error);
	return ApiResponse.internalError(error, fallback);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_PROFILE_IMAGE_BYTES + 64 * 1024) {
		return ApiResponse.error('That image is too large. Try a smaller one.', 413);
	}
	const form = await request.formData().catch(() => null);
	const kind = parseImageKind(form?.get('kind'));
	const file = form?.get('file');
	if (!kind) return ApiResponse.badRequest('Say whether this is your photo or your cover');
	if (!(file instanceof Blob)) return ApiResponse.badRequest('Pick an image to upload');

	try {
		const url = await storeProfileImage({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			kind,
			bytes: new Uint8Array(await file.arrayBuffer())
		});
		return ApiResponse.success({ url });
	} catch (error) {
		return failure(error, 'Could not save that image. Try again.');
	}
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const kind = parseImageKind(url.searchParams.get('kind'));
	if (!kind) return ApiResponse.badRequest('Say whether to remove your photo or your cover');
	try {
		await clearProfileImage({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			kind
		});
		return ApiResponse.success({ removed: true });
	} catch (error) {
		return failure(error, 'Could not remove that image. Try again.');
	}
};

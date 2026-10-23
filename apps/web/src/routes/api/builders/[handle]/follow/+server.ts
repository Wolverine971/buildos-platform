// apps/web/src/routes/api/builders/[handle]/follow/+server.ts
//
// POST   { project_id?: string } → follow the person (or one live project on their page)
// DELETE { project_id?: string } → stop following
// Followers get the person's published weekly lines in their daily brief.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	follow
} from '$lib/server/builder-profile/builder-profile.service';

async function handle(on: boolean, { params, request, locals }: Parameters<RequestHandler>[0]) {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Sign in to follow');
	const body = (await request.json().catch(() => ({}))) as { project_id?: unknown };
	const projectId =
		typeof body.project_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.project_id)
			? body.project_id
			: null;
	try {
		const result = await follow({
			admin: createAdminSupabaseClient() as any,
			viewerId: user.id,
			handle: params.handle,
			projectId,
			on
		});
		return ApiResponse.success(result);
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not update that follow');
	}
}

export const POST: RequestHandler = (event) => handle(true, event);
export const DELETE: RequestHandler = (event) => handle(false, event);

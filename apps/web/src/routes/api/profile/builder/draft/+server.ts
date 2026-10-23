// apps/web/src/routes/api/profile/builder/draft/+server.ts
// POST { project_ids: string[] } → "Draft my page": a suggested headline, bio and one
// pitch per project, written from the owner's own projects. Nothing is saved.

export const config = { maxDuration: 60 };

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { draftPage } from '$lib/server/builder-profile/builder-profile-drafts';
import { BuilderProfileError } from '$lib/server/builder-profile/builder-profile.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { project_ids?: unknown } | null;
	const projectIds = Array.isArray(body?.project_ids)
		? body.project_ids.filter((id): id is string => typeof id === 'string').slice(0, 8)
		: [];
	try {
		const admin = createAdminSupabaseClient() as any;
		const llm = new SmartLLMService({
			supabase: admin,
			httpReferer: request.headers.get('referer') ?? undefined,
			appName: 'BuildOS Builder Profile'
		});
		const suggestion = await draftPage({ llm: llm as any, admin, userId: user.id, projectIds });
		return ApiResponse.success(suggestion);
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not draft your page. Try again.');
	}
};

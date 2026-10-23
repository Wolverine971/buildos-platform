// apps/web/src/routes/api/profile/builder/+server.ts
//
// The owner's builder page editor (Profile > People & agents > Your page).
// GET   → everything the editor shows (BuilderEditorData)
// PATCH → header and section settings: headline, location, avatar_url, now_text, bio,
//         show_build_log, build_log_includes_private, show_agent_split, show_writing,
//         show_builds_with, show_on_collaborator_pages, weekly_drafts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	loadEditorData,
	saveSettings
} from '$lib/server/builder-profile/builder-profile.service';

function signInAvatar(user: unknown): string | null {
	const meta = (user as { user_metadata?: Record<string, unknown> } | null)?.user_metadata ?? {};
	const url = meta.avatar_url ?? meta.picture;
	return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		const data = await loadEditorData({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			signInAvatarUrl: signInAvatar(user)
		});
		return ApiResponse.success(data);
	} catch (error) {
		console.error('[BuilderProfile] editor load failed', error);
		return ApiResponse.internalError(error, 'Could not load your page');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const patch = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!patch || typeof patch !== 'object') return ApiResponse.badRequest('Nothing to save');
	try {
		await saveSettings({ admin: createAdminSupabaseClient() as any, userId: user.id, patch });
		return ApiResponse.success({ saved: true });
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save your page');
	}
};

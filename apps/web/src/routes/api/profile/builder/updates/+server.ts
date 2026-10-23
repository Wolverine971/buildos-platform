// apps/web/src/routes/api/profile/builder/updates/+server.ts
//
// The weekly update for the owner's page.
// POST  { action: 'draft' }                          → draft this week's lines now
// PATCH { id, action: 'publish' | 'skip', body? }    → decide one drafted line
// PATCH { action: 'publish_all' }                    → publish every drafted line as written

export const config = { maxDuration: 60 };

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { decideDraft, draftWeeklyUpdates } from '$lib/server/builder-profile/builder-profile-drafts';
import { BuilderProfileError } from '$lib/server/builder-profile/builder-profile.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
	if (body?.action !== 'draft') return ApiResponse.badRequest('Unknown action');
	try {
		const admin = createAdminSupabaseClient() as any;
		const llm = new SmartLLMService({
			supabase: admin,
			httpReferer: request.headers.get('referer') ?? undefined,
			appName: 'BuildOS Builder Profile'
		});
		const result = await draftWeeklyUpdates({ llm: llm as any, admin, userId: user.id });
		return ApiResponse.success(result);
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not draft this week’s update. Try again.');
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as
		| { id?: unknown; action?: unknown; body?: unknown }
		| null;
	const admin = createAdminSupabaseClient() as any;
	try {
		if (body?.action === 'publish_all') {
			const { data, error } = await admin
				.from('builder_profile_updates')
				.select('id')
				.eq('user_id', user.id)
				.eq('status', 'drafted');
			if (error) throw error;
			for (const row of (data ?? []) as { id: string }[]) {
				await decideDraft({ admin, userId: user.id, draftId: row.id, action: 'publish' });
			}
			return ApiResponse.success({ published: (data ?? []).length });
		}
		if (typeof body?.id !== 'string' || (body.action !== 'publish' && body.action !== 'skip')) {
			return ApiResponse.badRequest('Say which draft, and publish or skip');
		}
		await decideDraft({
			admin,
			userId: user.id,
			draftId: body.id,
			action: body.action,
			body: typeof body.body === 'string' ? body.body : null
		});
		return ApiResponse.success({ decided: body.action });
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save that');
	}
};

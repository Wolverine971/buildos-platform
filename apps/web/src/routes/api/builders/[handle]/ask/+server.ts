// apps/web/src/routes/api/builders/[handle]/ask/+server.ts
//
// POST { project_id, note? } → ask to join a live project on someone's page. Sends an
// ordinary people request (the owner approves with a role and agent setting, as from
// any other ask).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	askToJoin,
	BuilderProfileError
} from '$lib/server/builder-profile/builder-profile.service';

const MESSAGES = {
	sent: 'Asked. You’ll hear back in BuildOS.',
	already_waiting: 'Your ask is already waiting for an answer.',
	declined_recently: 'They said no recently. You can ask again later.',
	rate_limited: 'You have a lot of asks waiting. Try again once some are answered.',
	unavailable: 'They aren’t taking asks right now.'
} as const;

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Sign in to ask');
	const body = (await request.json().catch(() => ({}))) as { project_id?: unknown; note?: unknown };
	if (typeof body.project_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.project_id)) {
		return ApiResponse.badRequest('Pick a project to ask about');
	}
	try {
		const outcome = await askToJoin({
			supabase: locals.supabase as any,
			admin: createAdminSupabaseClient() as any,
			viewerId: user.id,
			handle: params.handle,
			projectId: body.project_id,
			note: typeof body.note === 'string' ? body.note : null
		});
		return ApiResponse.success({ outcome, message: MESSAGES[outcome] });
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not send that ask');
	}
};

// apps/web/src/routes/api/people/find/+server.ts
//
// GET ?handle=sam → the person's card (name, handle, bio) when they chose to be
// findable by handle, else { found: false }. Not-found and not-findable look the
// same, and the card never carries an email (find_person_by_handle).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { asRecord, normalizeHandle, peopleRpcErrorResponse } from '$lib/server/people/people-api';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const raw = url.searchParams.get('handle') ?? '';
	const handle = normalizeHandle(raw);
	if (!handle) {
		return ApiResponse.badRequest(
			'Enter a handle like @sam: 3 to 24 letters, numbers, or single hyphens.'
		);
	}

	const { data, error } = await locals.supabase.rpc('find_person_by_handle', {
		p_handle: handle
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not look up that handle');

	const result = asRecord(data);
	if (result.found !== true) {
		return ApiResponse.success({ found: false, handle });
	}

	return ApiResponse.success(result);
};

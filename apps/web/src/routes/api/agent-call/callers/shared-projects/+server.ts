// apps/web/src/routes/api/agent-call/callers/shared-projects/+server.ts
//
// PATCH { caller_id, enabled } → turn "Projects shared with me" on or off for one
// agent connection. Each project's owner still decides what your agents may do
// there. Doesn't touch the key itself (no rotation).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	CallerProvisioningError,
	CallerProvisioningService
} from '$lib/server/agent-call/caller-provisioning.service';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Not authenticated');

	const body = await request.json().catch(() => null);
	const callerId = typeof body?.caller_id === 'string' ? body.caller_id : null;
	if (!callerId) return ApiResponse.badRequest('caller_id is required');
	if (typeof body?.enabled !== 'boolean') {
		return ApiResponse.badRequest('enabled must be true or false');
	}

	try {
		const service = new CallerProvisioningService();
		return ApiResponse.success(
			await service.setIncludeSharedProjectsForUser(user.id, callerId, body.enabled)
		);
	} catch (error) {
		if (error instanceof CallerProvisioningError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Callers shared-projects] Failed', error);
		return ApiResponse.internalError(error, 'Could not update this connection');
	}
};

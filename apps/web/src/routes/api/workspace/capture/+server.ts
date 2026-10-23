// apps/web/src/routes/api/workspace/capture/+server.ts
// POST: save a note or task to the Workspace right away (no model call, no project picker).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { getChangeSourceFromRequest } from '$lib/services/async-activity-logger';
import { captureLooseItem } from '$lib/server/workspace/workspace.service';
import { captureRequest, workspaceFailure } from '$lib/server/workspace/workspace-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, captureRequest);
	if (!parsed.ok) return parsed.response;
	try {
		const actorId = await ensureActorId(locals.supabase, user.id);
		const result = await captureLooseItem({
			session: locals.supabase,
			userId: user.id,
			actorId,
			capture: {
				kind: parsed.data.kind,
				text: parsed.data.text,
				source: parsed.data.source,
				idempotencyKey: parsed.data.idempotency_key
			},
			changeSource: getChangeSourceFromRequest(request)
		});
		return ApiResponse.created(result);
	} catch (error) {
		return workspaceFailure(error);
	}
};

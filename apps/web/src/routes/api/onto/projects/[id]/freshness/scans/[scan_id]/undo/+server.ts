// apps/web/src/routes/api/onto/projects/[id]/freshness/scans/[scan_id]/undo/+server.ts
//
// POST /api/onto/projects/[id]/freshness/scans/[scan_id]/undo  (Tasker 88)
//   body { flag_ids?: string[] }  (default: every undoable flag in the scan)
//   -> FreshnessUndoResultV1
//
// Reverses automatic updates (replayed through the caller's own write path with Project
// Review suppressed; skipped when the entity changed since) and restores retired inbox items.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { undoFreshnessFlags } from '$lib/server/freshness-radar.service';
import { replayLoopOperations } from '$lib/server/project-suggestion-actions.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const undoSchema = z
	.object({
		flag_ids: z.array(z.string().uuid()).min(1).max(20).optional()
	})
	.strict();

export const POST: RequestHandler = async ({ params, locals, request, fetch }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;
	if (!isValidUUID(params.scan_id)) return ApiResponse.badRequest('Invalid scan ID');

	// An empty body means "undo everything undoable in this scan".
	let raw: unknown = {};
	const text = await request.text();
	if (text.trim()) {
		try {
			raw = JSON.parse(text);
		} catch {
			return ApiResponse.badRequest('Invalid JSON body');
		}
	}
	const parsed = undoSchema.safeParse(raw);
	if (!parsed.success) {
		return ApiResponse.error(
			'Invalid request body',
			HttpStatus.UNPROCESSABLE_ENTITY,
			ErrorCode.INVALID_FIELD,
			{ issues: parsed.error.issues.map((issue) => issue.message) }
		);
	}

	try {
		const result = await undoFreshnessFlags({
			supabase: locals.supabase,
			admin: createAdminSupabaseClient(),
			userId: access.userId,
			projectId: access.projectId,
			scanId: params.scan_id,
			flagIds: parsed.data.flag_ids,
			replay: ({ operations, operationId, chatSessionId }) =>
				replayLoopOperations({
					supabase: locals.supabase,
					userId: access.userId,
					chatSessionId,
					operations,
					operationId,
					operationKind: 'freshness_undo',
					fetchFn: fetch
				})
		});
		if (!result) return ApiResponse.notFound('Scan');
		return ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to undo');
	}
};
